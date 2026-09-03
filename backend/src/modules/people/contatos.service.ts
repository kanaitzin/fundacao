import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * A FOTO DE IDENTIFICAÇÃO E OS TELEFONES DE QUEM APARECE.
 *
 * Os dois vêm da lista que a equipe técnica mantém à mão — um documento de
 * texto com as vinte crianças da casa, reenviado inteiro toda vez que uma
 * linha muda. Ele traz, por criança, a filiação, os documentos e os telefones
 * da mãe, do padrinho, da tia e do vínculo comunitário. É esse arquivo solto
 * que este módulo existe para aposentar.
 *
 * **A foto é de identificação, e não é retrato.** A casa recebe vinte
 * crianças, o plantão troca a cada doze horas, e entra gente nova toda semana.
 * A coordenação decidiu em 03/09/2026 que ela não depende de autorização de
 * imagem: serve para a equipe saber quem é quem, e se sair num documento é
 * para o Juízo, que responde pela proteção da criança tanto quanto a casa.
 * Mesmo assim ela NÃO entra em documento nenhum por padrão — quem a quiser
 * numa folha vai ter que pedir, e aí a decisão é de quem pede.
 *
 * **Os contatos são do educador também.** Foi a outra decisão do mesmo dia:
 * quem está com a criança precisa saber quem é a madrinha que aparece no
 * portão. Escrever no cadastro continua sendo da técnica e da coordenação.
 */
@Injectable()
export class ContatosService {
  private readonly dir = process.env.ARQUIVOS_DIR ?? join(process.cwd(), '.arquivos');

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private readonly VINCULOS = [
    { code: 'genitora', label: 'Genitora' },
    { code: 'genitor', label: 'Genitor' },
    { code: 'irmao', label: 'Irmão ou irmã' },
    { code: 'avo', label: 'Avó ou avô' },
    { code: 'tio', label: 'Tia ou tio' },
    { code: 'padrinho', label: 'Padrinho' },
    { code: 'madrinha', label: 'Madrinha' },
    { code: 'vinculo_comunitario', label: 'Vínculo comunitário' },
    { code: 'servico_da_rede', label: 'Serviço da rede' },
    { code: 'outro', label: 'Outro' },
  ];

  vocabulario() {
    return {
      vinculos: this.VINCULOS,
      /*
       * A frase que a tela mostra sobre a ordem. O vínculo é um RÓTULO e não
       * uma hierarquia: em várias dessas histórias, quem aparece é a
       * madrinha, e não a genitora.
       */
      nota: 'O vínculo diz quem é, não quem vale mais. Contato com aproximação '
        + 'suspensa entra marcado, com o motivo — quem descobre isso às 23h descobre tarde.',
    };
  }

  // ------------------------------------------------------------- Contatos

  async listar(user: AuthenticatedUser, personId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT id, name, bond, bond_other, phone, note, restricted, restriction_note,
                active, ended_reason,
                app_user_display_name(created_by) AS por, created_at
           FROM person_contact WHERE person_id = $1
          ORDER BY active DESC, restricted DESC, name`, [personId]);
      return rows.map((r) => ({
        id: r.id, nome: r.name,
        vinculo: r.bond,
        vinculoRotulo: r.bond === 'outro'
          ? r.bond_other
          : (this.VINCULOS.find((v) => v.code === r.bond)?.label ?? r.bond),
        telefone: r.phone, observacao: r.note,
        restrito: r.restricted, motivoDaRestricao: r.restriction_note,
        ativo: r.active, motivoDoEncerramento: r.ended_reason,
        por: r.por, em: r.created_at,
      }));
    });
  }

  async criar(user: AuthenticatedUser, personId: string, input: {
    nome?: string; vinculo?: string; vinculoOutro?: string; telefone?: string;
    observacao?: string; restrito?: boolean; motivoDaRestricao?: string;
  }) {
    if (!(input.nome ?? '').trim()) {
      throw new BadRequestException('Escreva o nome de quem é este contato.');
    }
    if (!this.VINCULOS.some((v) => v.code === input.vinculo)) {
      throw new BadRequestException('Informe o vínculo desta pessoa com o acolhido.');
    }
    if (input.vinculo === 'outro' && !(input.vinculoOutro ?? '').trim()) {
      throw new BadRequestException('Em "outro", escreva qual é o vínculo.');
    }
    /*
     * Restrição sem motivo não entra. Um telefone marcado como "não acionar",
     * sem dizer por quê, vira uma proibição que ninguém sabe se ainda vale — e
     * a educadora de plantão fica sem saber se pode chamar a avó às duas da
     * manhã.
     */
    if (input.restrito && (input.motivoDaRestricao ?? '').trim().length < 10) {
      throw new BadRequestException(
        'Escreva por que este contato tem aproximação restrita. Quem ler às 23h '
        + 'precisa saber se ainda vale.');
    }

    return this.db.asUser(user.id, async (c) => {
      try {
        const { rows: [r] } = await c.query(
          `INSERT INTO person_contact (person_id, name, bond, bond_other, phone, note,
                                       restricted, restriction_note, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,
          [personId, input.nome!.trim(), input.vinculo,
           input.vinculo === 'outro' ? input.vinculoOutro!.trim() : null,
           (input.telefone ?? '').trim() || null, (input.observacao ?? '').trim() || null,
           !!input.restrito, input.restrito ? input.motivoDaRestricao!.trim() : null,
           user.id]);
        await this.audit.log({
          action: 'contato.criado', actorId: user.id, institutionId: user.institutionId,
          entity: 'person_contact', entityId: r.id,
          // Metadado, nunca conteúdo: o vínculo, e não o nome nem o telefone.
          detail: { vinculo: input.vinculo, restrito: !!input.restrito },
        });
        return { id: r.id, ok: true };
      } catch (e: any) {
        if (String(e?.message ?? '').includes('violates row-level security')) {
          throw new ForbiddenException(
            'Escrever no cadastro de contatos é da equipe técnica e da coordenação.');
        }
        throw e;
      }
    });
  }

  /**
   * Encerra um contato. Não apaga: o telefone que deixou de valer é
   * informação — alguém tentou por ele e não conseguiu.
   */
  async encerrar(user: AuthenticatedUser, contatoId: string, motivo: string) {
    if ((motivo ?? '').trim().length < 5) {
      throw new BadRequestException('Escreva por que este contato não vale mais.');
    }
    return this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE person_contact SET active = false, ended_reason = $2,
                updated_at = now(), updated_by = $3
          WHERE id = $1 AND active`, [contatoId, motivo.trim(), user.id]);
      if (!rowCount) throw new NotFoundException('Contato não encontrado — ou já encerrado.');
      return { ok: true };
    });
  }

  // ----------------------------------------------------------------- Foto

  async guardarFoto(user: AuthenticatedUser, personId: string, input: {
    conteudo?: string; nomeArquivo?: string;
  }) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('A foto de identificação é cadastrada pela técnica ou pela coordenação.');
    }
    const limpo = String(input.conteudo ?? '').replace(/^data:[^;]+;base64,/, '');
    if (!limpo) throw new BadRequestException('Nenhuma foto foi enviada.');
    const bytes = Buffer.from(limpo, 'base64');
    if (!bytes.length) throw new BadRequestException('A foto chegou vazia.');
    if (bytes.length > 4 * 1024 * 1024) {
      throw new BadRequestException('A foto passa de 4 MB. A do celular costuma resolver.');
    }
    /*
     * O tipo vem da ASSINATURA do arquivo, e não da extensão: renomear é um
     * toque, e quem guarda arquivo de criança confere os primeiros bytes.
     */
    const hex = bytes.subarray(0, 12).toString('hex');
    const tipo = hex.startsWith('ffd8ff') ? 'image/jpeg'
      : hex.startsWith('89504e47') ? 'image/png'
      : hex.startsWith('52494646') && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp'
      : null;
    if (!tipo) throw new BadRequestException('Envie uma foto em JPG, PNG ou WEBP.');

    const chave = randomUUID();
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, chave), bytes);

    await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE person SET photo_key = $2, photo_mime = $3, photo_at = now(), photo_by = $4
          WHERE id = $1`, [personId, chave, tipo, user.id]);
      if (!rowCount) throw new NotFoundException('Acolhido não encontrado — ou fora do seu alcance.');
    });

    await this.audit.log({
      action: 'foto.identificacao.guardada', actorId: user.id,
      institutionId: user.institutionId, entity: 'person', entityId: personId,
      detail: { tipo, bytes: bytes.length },
    });
    return { ok: true, aviso: 'Foto de identificação guardada. Ela aparece no alto do perfil '
      + 'e não entra em documento nenhum por padrão.' };
  }

  async lerFoto(user: AuthenticatedUser, personId: string) {
    const p = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT photo_key, photo_mime FROM person WHERE id = $1`, [personId]);
      return r;
    });
    if (!p) throw new NotFoundException('Acolhido não encontrado — ou fora do seu alcance.');
    if (!p.photo_key) throw new NotFoundException('Este acolhido ainda não tem foto.');
    const bytes = await readFile(join(this.dir, p.photo_key)).catch(() => null);
    if (!bytes) throw new NotFoundException('A foto não está no armazenamento.');
    /*
     * Ver a foto NÃO é acesso registrado, e isso é escolha.
     *
     * Ela aparece no alto do perfil, e o perfil já deixa rastro. Registrar
     * cada carregamento de imagem encheria a auditoria de linhas que ninguém
     * lê, e a auditoria cheia de ruído é auditoria que não se usa quando
     * precisa.
     */
    return { nome: 'identificacao', tipo: p.photo_mime, conteudo: bytes.toString('base64') };
  }

  /** O sha da foto — para o ensaio conferir que ela é a que foi enviada. */
  static impressao(bytes: Buffer) {
    return createHash('sha256').update(bytes).digest('hex');
  }
}
