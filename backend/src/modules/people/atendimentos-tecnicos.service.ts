import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { ArquivosService, RegraDoArquivo } from '../../kernel/arquivos/arquivos.service';
import { bytesDoBase64, recusaDosAnexos } from '../../kernel/arquivos/anexos-da-mensagem.regra';
import { AuthenticatedUser } from '../../kernel/contracts';
import { TAMANHO_MAXIMO, TIPOS_DE_ARQUIVO, tituloProibido } from './dossie-exigido';
import {
  AREAS_DO_ATENDIMENTO, MAXIMO_DE_ANEXOS_DO_ATENDIMENTO, ONDE_FOI_O_ATENDIMENTO, QUEM_BAIXA_ATENDIMENTOS,
  QUEM_LE_ATENDIMENTO, QUEM_REGISTRA_ATENDIMENTO, QUEM_REGISTRA_COMPORTAMENTAL, podeRegistrarAtendimento, rotuloDaArea,
  FORMAS_DO_ATENDIMENTO, MAXIMO_DE_PARTICIPANTES, rotuloDaForma,
} from './atendimento-tecnico.regra';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { Folha, cargoNoDocumento } from '../../kernel/documentos/folha';
import { quantos } from '../../kernel/common/quantos';

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
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
  ) {}

  async listar(user: AuthenticatedUser, personId: string) {
    if (!QUEM_LE_ATENDIMENTO.includes(user.role)) {
      throw new ForbiddenException('Os atendimentos da equipe técnica são lidos pela equipe técnica e pela coordenação.');
    }
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows: r } = await c.query(
        `SELECT s.id, s.area, s.area_other, s.happened_on, to_char(s.happened_time, 'HH24:MI') AS hora,
                s.summary, s.created_at, s.place, s.setting, s.professional, s.created_by, s.form,
                (SELECT coalesce(json_agg(app_person_display_name(o.person_id) ORDER BY app_person_display_name(o.person_id)), '[]'::json)
                   FROM technical_session o
                  WHERE s.group_id IS NOT NULL AND o.group_id = s.group_id AND o.id <> s.id) AS participantes,
                app_criancas_do_grupo_fora_do_alcance(s.id) AS fora,
                app_user_display_name(s.created_by) AS por,
                (SELECT coalesce(json_agg(json_build_object(
                          'id', a.id, 'nome', a.file_name, 'tipo', a.mime,
                          'tamanho', a.size_bytes, 'legenda', a.caption) ORDER BY a.created_at), '[]'::json)
                   FROM technical_session_attachment a WHERE a.session_id = s.id) AS anexos
           FROM technical_session s
          WHERE s.person_id = $1
          ORDER BY s.happened_on DESC, s.happened_time DESC NULLS LAST, s.created_at DESC`, [personId]);
      return r;
    });
    return rows.map((r: any) => ({
      id: r.id, area: r.area, areaRotulo: rotuloDaArea(r.area, r.area_other),
      dia: r.happened_on, hora: r.hora ?? null, relato: r.summary, registradoEm: r.created_at, por: r.por,
      anexos: r.anexos,
      /* Fase 284: onde foi, na casa ou fora dela, e quem atendeu quando não foi quem registrou. */
      local: r.place ?? null, ondeFoi: r.setting ?? null,
      ondeFoiRotulo: ONDE_FOI_O_ATENDIMENTO.find((o) => o.cod === r.setting)?.label ?? null,
      profissional: r.professional ?? null,
      /* Fase 309: a forma, e quem mais participou do mesmo atendimento. */
      forma: r.form ?? null, formaRotulo: rotuloDaForma(r.form),
      participantes: r.participantes ?? [],
      /* As do mesmo atendimento que quem lê não alcança hoje (a transferida): só o número. */
      participantesFora: r.fora ?? 0,
      /* Só quem registrou junta arquivo depois: a política da 1655 já diz isso. */
      podeAnexar: r.created_by === user.id,
    }));
  }

  async registrar(user: AuthenticatedUser, personId: string, input: {
    area?: string; areaOutra?: string; dia?: string; hora?: string; relato?: string;
    local?: string; ondeFoi?: string; profissional?: string;
    forma?: string; participantes?: string[];
    anexos?: { conteudo?: string; nomeArquivo?: string; legenda?: string }[];
  }) {
    if (!podeRegistrarAtendimento(user.role, input.area)) {
      throw new ForbiddenException(QUEM_REGISTRA_COMPORTAMENTAL.includes(user.role)
        ? 'Pelo plantão se registra o atendimento comportamental da casa. Os outros atendimentos são da equipe técnica ou da coordenação.'
        : 'O atendimento é registrado pela equipe técnica ou pela coordenação.');
    }
    if (!AREAS_DO_ATENDIMENTO.some((a) => a.cod === input.area)) {
      throw new BadRequestException('Diga a área do atendimento: psicologia, psicopedagogia, Assistência Social, pedagogia ou outra.');
    }
    const areaOutra = (input.areaOutra ?? '').trim();
    if (input.area === 'outra' && areaOutra.length < 3) {
      throw new BadRequestException('Escreva qual é a área do atendimento.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.dia ?? ''))) {
      throw new BadRequestException('Diga o dia do atendimento.');
    }
    /* A hora (fase 275): cada anotação de atendimento com a data e a hora. */
    const hora = String(input.hora ?? '').trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
      throw new BadRequestException('Diga a hora do atendimento.');
    }
    const relato = (input.relato ?? '').trim();
    if (relato.length < 10) {
      throw new BadRequestException('Escreva o que foi trabalhado no atendimento.');
    }
    /* Fase 284: onde foi e quem atendeu. A tela pede; o servidor confere o que veio. */
    const ondeFoi = input.ondeFoi ? String(input.ondeFoi) : null;
    if (ondeFoi && !ONDE_FOI_O_ATENDIMENTO.some((o) => o.cod === ondeFoi)) {
      throw new BadRequestException('Diga se o atendimento foi interno, na casa, ou externo, fora dela.');
    }
    /* Fase 309: a forma e as outras crianças do mesmo atendimento. */
    const forma = input.forma ? String(input.forma) : null;
    if (forma && !FORMAS_DO_ATENDIMENTO.some((f) => f.cod === forma)) {
      throw new BadRequestException('Diga a forma do atendimento: individual, familiar ou coletivo.');
    }
    const participantes = [...new Set((Array.isArray(input.participantes) ? input.participantes : [])
      .map((x) => String(x)).filter((x) => x !== personId))];
    if (participantes.some((x) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x))) {
      throw new BadRequestException('Uma das crianças do atendimento não foi reconhecida.');
    }
    if (participantes.length && forma !== 'coletivo' && forma !== 'familiar') {
      throw new BadRequestException('Atendimento individual é de uma criança só. Para mais de uma, escolha coletivo ou familiar.');
    }
    if (forma === 'coletivo' && !participantes.length) {
      throw new BadRequestException('O atendimento coletivo leva ao menos mais uma criança da casa.');
    }
    if (participantes.length > MAXIMO_DE_PARTICIPANTES) {
      throw new BadRequestException(`Um atendimento em grupo leva até ${MAXIMO_DE_PARTICIPANTES + 1} crianças.`);
    }
    const local = (input.local ?? '').trim() || null;
    const profissional = (input.profissional ?? '').trim() || null;
    const anexos = Array.isArray(input.anexos) ? input.anexos : [];
    if (anexos.length > MAXIMO_DE_ANEXOS_DO_ATENDIMENTO) {
      throw new BadRequestException(
        `Um atendimento leva até ${MAXIMO_DE_ANEXOS_DO_ATENDIMENTO} arquivos. O resto vai num complemento.`);
    }
    const passou = recusaDosAnexos(anexos.map((a) => bytesDoBase64(String(a?.conteudo ?? ''))));
    if (passou) throw new BadRequestException(passou);
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

    const feitos = await this.db.asUser(user.id, async (c) => {
      const { rows: [h] } = await c.query(
        `SELECT $1::date > app_hoje() AS futuro,
                ($1::date + $2::time) > (now() AT TIME ZONE app_fuso()) + interval '5 minutes' AS hora_futura`,
        [input.dia, hora]);
      if (h.futuro) throw new BadRequestException('O dia do atendimento ainda não chegou.');
      if (h.hora_futura) throw new BadRequestException('A hora do atendimento ainda não chegou.');
      if (participantes.length) {
        /* As outras crianças estavam na mesma casa que a primeira NO DIA do atendimento:
           o registro de antes vale para quem saiu depois, e não para quem chegou depois. */
        const { rows: [m] } = await c.query(
          `SELECT count(DISTINCT o.person_id)::int AS juntas
             FROM house_stay a JOIN house_stay o ON o.house_id = a.house_id
            WHERE a.person_id = $1 AND o.person_id = ANY($2::uuid[])
              AND (a.started_at AT TIME ZONE app_fuso())::date <= $3::date
              AND (a.ended_at IS NULL OR (a.ended_at AT TIME ZONE app_fuso())::date >= $3::date)
              AND (o.started_at AT TIME ZONE app_fuso())::date <= $3::date
              AND (o.ended_at IS NULL OR (o.ended_at AT TIME ZONE app_fuso())::date >= $3::date)`,
          [personId, participantes, input.dia]);
        if (m.juntas !== participantes.length) {
          throw new BadRequestException('O atendimento em grupo é com crianças da mesma casa. Confira quem participou.');
        }
      }
      const grupo = participantes.length ? randomUUID() : null;
      /* O id nasce aqui e o INSERT vai sem RETURNING (fase 307): o plantão registra o
         atendimento comportamental e não lê a tabela, e o RETURNING pediria a leitura. */
      /* Um registro por criança, com o mesmo grupo (fase 309): cada perfil tem o seu, e
         o arquivo vai junto em cada um, apontando para o mesmo arquivo guardado. */
      const registros = [personId, ...participantes].map((p) => ({ id: randomUUID(), pessoa: p }));
      for (const r of registros) {
        try {
          await c.query(
            `INSERT INTO technical_session (id, person_id, area, area_other, happened_on, happened_time, summary,
                                            place, setting, professional, created_by, form, group_id)
             VALUES ($11,$1,$2,$3,$4::date,$5::time,$6,$7,$8,$9,$10,$12,$13)`,
            [r.pessoa, input.area, input.area === 'outra' ? areaOutra : null, input.dia, hora, relato,
             local, ondeFoi, profissional, user.id, r.id, forma, grupo]);
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
            [r.id, r.pessoa, g.chave, g.sha256, g.mime, g.nome, g.tamanho, g.legenda, user.id]);
        }
      }
      return registros;
    });
    const id = feitos[0].id;
    const casa = await this.audit.casaDoAcolhido(user.id, personId);
    for (const f of feitos) {
      await this.audit.log({
        action: 'atendimento_tecnico.registrado', actorId: user.id, houseId: casa,
        entity: 'technical_session', entityId: f.id,
        /* Metadado: a área, a forma e quantos arquivos e crianças, nunca o que foi trabalhado. */
        detail: { area: input.area, forma, anexos: guardados.length, criancas: feitos.length },
      });
    }
    if (feitos.length > 1) {
      return {
        id, ids: feitos.map((f) => f.id),
        aviso: `Atendimento registrado no perfil de cada uma das ${feitos.length} crianças`
          + (guardados.length ? ', com os arquivos.' : '.'),
      };
    }
    return {
      id,
      aviso: guardados.length
        ? 'Atendimento registrado, com os arquivos. Aparece no perfil para a equipe técnica e a coordenação.'
        : 'Atendimento registrado. Aparece no perfil para a equipe técnica e a coordenação.',
    };
  }

  /**
   * O arquivo de um atendimento. Cada abertura fica registrada, e o sha256 é conferido.
   * Baixar (fase 306) é a mesma leitura, anotada como baixado: abrir e baixar são atos
   * diferentes, e a auditoria diz qual foi.
   */
  async arquivo(user: AuthenticatedUser, anexoId: string, baixando = false) {
    const a = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT session_id, person_id, storage_key, sha256, mime, file_name
           FROM technical_session_attachment WHERE id = $1`, [anexoId]);
      return row;
    });
    if (!a) throw new NotFoundException('Arquivo não encontrado.');
    await this.audit.log({
      action: baixando ? 'atendimento_tecnico.anexo.baixado' : 'atendimento_tecnico.anexo.aberto', actorId: user.id,
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

  /**
   * JUNTAR O ARQUIVO QUE FALTOU (fase 284). Só quem registrou o atendimento, que
   * fica igual: o arquivo chega com a hora dele, e nada se reescreve.
   */
  async anexar(user: AuthenticatedUser, sessionId: string, input: {
    anexos?: { conteudo?: string; nomeArquivo?: string; legenda?: string }[];
  }) {
    if (!QUEM_REGISTRA_ATENDIMENTO.includes(user.role)) {
      throw new ForbiddenException('O arquivo do atendimento é juntado por quem o registrou.');
    }
    const anexos = Array.isArray(input.anexos) ? input.anexos : [];
    if (!anexos.length) throw new BadRequestException('Escolha o arquivo para juntar.');
    const passou = recusaDosAnexos(anexos.map((a) => bytesDoBase64(String(a?.conteudo ?? ''))));
    if (passou) throw new BadRequestException(passou);
    for (const a of anexos) {
      const problema = tituloProibido(String(a?.nomeArquivo ?? 'arquivo'))
        || (a?.legenda ? tituloProibido(String(a.legenda)) : null);
      if (problema) throw new BadRequestException(problema);
    }
    const s = await this.db.asUser(user.id, async (c) => (await c.query(
      `SELECT s.id, s.person_id, s.created_by, s.group_id,
              (SELECT count(*)::int FROM technical_session_attachment a WHERE a.session_id = s.id) AS ja
         FROM technical_session s WHERE s.id = $1`, [sessionId])).rows[0]);
    if (!s) throw new NotFoundException('Atendimento não encontrado, ou fora do seu alcance.');
    if (s.created_by !== user.id) throw new ForbiddenException('O arquivo do atendimento é juntado por quem o registrou.');
    if (s.ja + anexos.length > MAXIMO_DE_ANEXOS_DO_ATENDIMENTO) {
      throw new BadRequestException(`Um atendimento leva até ${MAXIMO_DE_ANEXOS_DO_ATENDIMENTO} arquivos, e este já tem ${s.ja}.`);
    }
    const guardados: { chave: string; sha256: string; mime: string; tamanho: number; nome: string; legenda: string | null }[] = [];
    for (const a of anexos) {
      const g = await this.arquivos.guardar(a?.conteudo, O_ARQUIVO);
      if (!g) throw new BadRequestException('Um dos arquivos chegou vazio.');
      guardados.push({ ...g, nome: String(a.nomeArquivo ?? 'arquivo').trim() || 'arquivo',
                       legenda: (a.legenda ?? '').trim() || null });
    }
    await this.db.asUser(user.id, async (c) => {
      /* No atendimento em grupo (fase 309), o arquivo vai a cada registro do grupo que a
         mesma pessoa fez e ainda alcança: os registros irmãos continuam iguais. */
      const registros: { id: string; person_id: string }[] = s.group_id
        ? (await c.query(
            `SELECT id, person_id FROM technical_session WHERE group_id = $1 AND created_by = $2`,
            [s.group_id, user.id])).rows
        : [{ id: s.id, person_id: s.person_id }];
      for (const r of registros) {
        for (const g of guardados) {
          await c.query(
            `INSERT INTO technical_session_attachment (session_id, person_id, storage_key, sha256, mime,
               file_name, size_bytes, caption, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [r.id, r.person_id, g.chave, g.sha256, g.mime, g.nome, g.tamanho, g.legenda, user.id]);
        }
      }
    });
    await this.audit.log({
      action: 'atendimento_tecnico.anexo.juntado', actorId: user.id,
      houseId: await this.audit.casaDoAcolhido(user.id, s.person_id),
      entity: 'technical_session', entityId: s.id, detail: { anexos: guardados.length },
    });
    return { ok: true, aviso: `${quantos(guardados.length, 'arquivo juntado', 'arquivos juntados')} ao atendimento.` };
  }

  /**
   * BAIXAR OS ATENDIMENTOS DE UM PERÍODO (fase 284): o mês, o período todo ou as
   * datas escolhidas, em Word, para quem atende e para a coordenação. Leva o que foi
   * trabalhado e a lista dos arquivos, sem os arquivos; a finalidade fica registrada.
   */
  async exportar(user: AuthenticatedUser, personId: string, body: any) {
    if (!QUEM_BAIXA_ATENDIMENTOS.includes(user.role)) {
      throw new ForbiddenException('Os atendimentos são baixados pela equipe técnica e pela coordenação.');
    }
    for (const d of [body?.de, body?.ate]) {
      if (d != null && d !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(d))) {
        throw new BadRequestException('A data do período não é uma data.');
      }
    }
    const de: string | null = body?.de || null;
    const ate: string | null = body?.ate || null;
    if (de && ate && de > ate) throw new BadRequestException('A data inicial vem depois da final.');
    const crianca = await this.db.asUser(user.id, async (c) => (await c.query(
      `SELECT coalesce(p.social_name, p.full_name) AS nome,
              (SELECT h.name FROM house_stay s
                 -- rls-join-ok (house): a estada só chega aqui se a criança está no alcance de quem baixa
                 JOIN house h ON h.id = s.house_id
                WHERE s.person_id = p.id AND s.status = 'ativa' LIMIT 1) AS casa
         FROM person p WHERE p.id = $1`, [personId])).rows[0]);
    if (!crianca) throw new NotFoundException('Acolhido não encontrado, ou fora do seu alcance.');
    const todos = await this.listar(user, personId);
    const lista = todos.filter((a: any) => {
      const dia = String(a.dia).slice(0, 10);
      return (!de || dia >= de) && (!ate || dia <= ate);
    }).reverse();
    const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
    const periodo = de && ate ? `de ${br(de)} a ${br(ate)}` : de ? `a partir de ${br(de)}` : ate ? `até ${br(ate)}` : 'todo o acolhimento';
    const folha: Folha = {
      titulo: `Atendimentos da equipe técnica de ${crianca.nome}`,
      subtitulo: `Período: ${periodo}`,
      identificacao: [
        { rotulo: 'Criança', valor: crianca.nome },
        { rotulo: 'Unidade', valor: crianca.casa ?? '' },
        { rotulo: 'Período', valor: periodo },
        { rotulo: 'Atendimentos', valor: String(lista.length) },
      ],
      secoes: lista.length ? lista.map((a: any) => ({
        titulo: `${br(String(a.dia).slice(0, 10))}${a.hora ? `, ${a.hora}` : ''}. ${a.areaRotulo}`,
        paragrafos: [
          [a.profissional ? `Atendimento por ${a.profissional}, registrado por ${a.por ?? 'equipe técnica'}.`
            : `Atendimento por ${a.por ?? 'equipe técnica'}.`,
           a.ondeFoiRotulo ? `${a.ondeFoiRotulo}${a.local ? `, em ${a.local}` : ''}.` : (a.local ? `Local: ${a.local}.` : '')]
            .filter(Boolean).join(' '),
          a.relato,
        ],
        itens: (a.anexos ?? []).length
          ? (a.anexos as any[]).map((x) => `Arquivo no registro: ${x.legenda ?? x.nome}`) : undefined,
      })) : [{ titulo: 'Atendimentos', paragrafos: ['Nenhum atendimento registrado no período.'] }],
      geradoPor: user.fullName,
      cargo: cargoNoDocumento(user.role),
      ressalva: 'Documento de acesso restrito à equipe técnica e à coordenação. Os arquivos citados ficam no registro do acolhimento.',
    };
    return this.documentos.exportar(user, folha, {
      entidade: 'technical_session', entidadeId: personId,
      houseId: await this.audit.casaDoAcolhido(user.id, personId), finalidade: body?.finalidade ?? '',
    });
  }
}
