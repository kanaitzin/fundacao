import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { ArquivosService, RegraDoArquivo } from '../../kernel/arquivos/arquivos.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { TAMANHO_MAXIMO, TIPOS_DE_ARQUIVO, tituloProibido } from './dossie-exigido';
import {
  AREAS_DO_ATENDIMENTO, MAXIMO_DE_ANEXOS_DO_ATENDIMENTO, QUEM_LE_ATENDIMENTO,
  QUEM_REGISTRA_ATENDIMENTO, rotuloDaArea,
} from './atendimento-tecnico.regra';

/**
 * O ATENDIMENTO DA EQUIPE TÉCNICA (fase 218, pedido de 14/10).
 *
 * A psicóloga e a psicopedagoga atendiam, e o que ficava era o caderno delas:
 * o desenho que a criança fez numa sessão não tinha onde morar. Agora o
 * atendimento é registro da criança, com a área, o dia, o que foi trabalhado
 * e os arquivos, e entra como fonte do acompanhamento.
 *
 * O arquivo é guardado como os outros: conferido pela assinatura, com o sha256,
 * e cada abertura fica na auditoria. Nada se reescreve.
 */
const O_ARQUIVO: RegraDoArquivo = {
  aceita: [...TIPOS_DE_ARQUIVO.map((t) => t.tipo), 'image/heic'],
  maximo: TAMANHO_MAXIMO,
  recusas: {
    vazio: 'O arquivo chegou vazio.',
    grande: `O arquivo passa de ${Math.round(TAMANHO_MAXIMO / 1024 / 1024)} MB. Fotografe em `
      + 'qualidade menor. A foto do celular costuma resolver.',
    tipo: 'O atendimento recebe foto ou PDF.',
  },
};

@Injectable()
export class AtendimentosTecnicosService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ArquivosService) private readonly arquivos: ArquivosService,
  ) {}

  async listar(user: AuthenticatedUser, personId: string) {
    if (!QUEM_LE_ATENDIMENTO.includes(user.role)) {
      throw new ForbiddenException('Os atendimentos da equipe técnica são lidos pela equipe técnica e pela coordenação.');
    }
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows: r } = await c.query(
        `SELECT s.id, s.area, s.area_other, s.happened_on, s.summary, s.created_at,
                app_user_display_name(s.created_by) AS por,
                (SELECT coalesce(json_agg(json_build_object(
                          'id', a.id, 'nome', a.file_name, 'tipo', a.mime,
                          'tamanho', a.size_bytes, 'legenda', a.caption) ORDER BY a.created_at), '[]'::json)
                   FROM technical_session_attachment a WHERE a.session_id = s.id) AS anexos
           FROM technical_session s
          WHERE s.person_id = $1
          ORDER BY s.happened_on DESC, s.created_at DESC`, [personId]);
      return r;
    });
    return rows.map((r: any) => ({
      id: r.id, area: r.area, areaRotulo: rotuloDaArea(r.area, r.area_other),
      dia: r.happened_on, relato: r.summary, registradoEm: r.created_at, por: r.por,
      anexos: r.anexos,
    }));
  }

  async registrar(user: AuthenticatedUser, personId: string, input: {
    area?: string; areaOutra?: string; dia?: string; relato?: string;
    anexos?: { conteudo?: string; nomeArquivo?: string; legenda?: string }[];
  }) {
    if (!QUEM_REGISTRA_ATENDIMENTO.includes(user.role)) {
      throw new ForbiddenException('O atendimento é registrado pela equipe técnica ou pela coordenação.');
    }
    if (!AREAS_DO_ATENDIMENTO.some((a) => a.cod === input.area)) {
      throw new BadRequestException('Diga a área do atendimento: psicologia, psicopedagogia, serviço social, pedagogia ou outra.');
    }
    const areaOutra = (input.areaOutra ?? '').trim();
    if (input.area === 'outra' && areaOutra.length < 3) {
      throw new BadRequestException('Escreva qual é a área do atendimento.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.dia ?? ''))) {
      throw new BadRequestException('Diga o dia do atendimento.');
    }
    const relato = (input.relato ?? '').trim();
    if (relato.length < 10) {
      throw new BadRequestException('Escreva o que foi trabalhado no atendimento.');
    }
    const anexos = Array.isArray(input.anexos) ? input.anexos : [];
    if (anexos.length > MAXIMO_DE_ANEXOS_DO_ATENDIMENTO) {
      throw new BadRequestException(
        `Um atendimento leva até ${MAXIMO_DE_ANEXOS_DO_ATENDIMENTO} arquivos. O resto vai num complemento.`);
    }
    for (const a of anexos) {
      const problema = tituloProibido(String(a?.nomeArquivo ?? 'arquivo'))
        || (a?.legenda ? tituloProibido(String(a.legenda)) : null);
      if (problema) throw new BadRequestException(problema);
    }
    // Os arquivos são conferidos e guardados antes: a recusa de um deles chega
    // antes de o atendimento existir pela metade.
    const guardados: { chave: string; sha256: string; mime: string; tamanho: number; nome: string; legenda: string | null }[] = [];
    for (const a of anexos) {
      const g = await this.arquivos.guardar(a?.conteudo, O_ARQUIVO);
      if (!g) throw new BadRequestException('Um dos arquivos chegou vazio.');
      guardados.push({ ...g, nome: String(a.nomeArquivo ?? 'arquivo').trim() || 'arquivo',
                       legenda: (a.legenda ?? '').trim() || null });
    }

    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [h] } = await c.query(`SELECT $1::date > app_hoje() AS futuro`, [input.dia]);
      if (h.futuro) throw new BadRequestException('O dia do atendimento ainda não chegou.');
      let s: any;
      try {
        ({ rows: [s] } = await c.query(
          `INSERT INTO technical_session (person_id, area, area_other, happened_on, summary, created_by)
           VALUES ($1,$2,$3,$4::date,$5,$6) RETURNING id`,
          [personId, input.area, input.area === 'outra' ? areaOutra : null, input.dia, relato, user.id]));
      } catch (e: any) {
        if (String(e?.message ?? '').includes('row-level security')) {
          throw new NotFoundException('Acolhido não encontrado, ou fora do seu alcance.');
        }
        throw e;
      }
      for (const g of guardados) {
        await c.query(
          `INSERT INTO technical_session_attachment (session_id, person_id, storage_key, sha256, mime,
             file_name, size_bytes, caption, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [s.id, personId, g.chave, g.sha256, g.mime, g.nome, g.tamanho, g.legenda, user.id]);
      }
      return s.id as string;
    });
    await this.audit.log({
      action: 'atendimento_tecnico.registrado', actorId: user.id,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'technical_session', entityId: id,
      /* Metadado: a área e quantos arquivos, nunca o que foi trabalhado. */
      detail: { area: input.area, anexos: guardados.length },
    });
    return {
      id,
      aviso: guardados.length
        ? 'Atendimento registrado, com os arquivos. Aparece no perfil para a equipe técnica e a coordenação.'
        : 'Atendimento registrado. Aparece no perfil para a equipe técnica e a coordenação.',
    };
  }

  /** O arquivo de um atendimento. Cada abertura fica registrada, e o sha256 é conferido. */
  async arquivo(user: AuthenticatedUser, anexoId: string) {
    const a = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT session_id, person_id, storage_key, sha256, mime, file_name
           FROM technical_session_attachment WHERE id = $1`, [anexoId]);
      return row;
    });
    if (!a) throw new NotFoundException('Arquivo não encontrado.');
    await this.audit.log({
      action: 'atendimento_tecnico.anexo.aberto', actorId: user.id,
      houseId: await this.audit.casaDoAcolhido(user.id, a.person_id),
      entity: 'technical_session_attachment', entityId: anexoId,
      detail: { atendimento: a.session_id },
    });
    const bytes = await this.arquivos.ler(a.storage_key);
    if (!bytes) {
      throw new NotFoundException('O arquivo não está no armazenamento. O registro do atendimento continua.');
    }
    if (createHash('sha256').update(bytes).digest('hex') !== a.sha256) {
      throw new BadRequestException('O arquivo guardado não confere com o que foi anexado, e não vai ser aberto. Avise a coordenação.');
    }
    return { nome: a.file_name, tipo: a.mime, conteudo: bytes.toString('base64') };
  }
}
