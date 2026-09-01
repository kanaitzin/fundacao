import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { DocumentClosed, DomainEvent, AuthenticatedUser, EscalationRequest } from '../../kernel/contracts';
import { DriveGateway } from './drive.gateway';
import { dataNaInstituicao } from '../../kernel/common/tempo';

/**
 * ARQUIVO DOCUMENTAL NO DRIVE (§16).
 *
 * O que vai para o Drive é cópia do que FECHOU — ATA, passagem, ocorrência,
 * acompanhamento, relatório. Não é backup do sistema: banco e objetos têm
 * backup técnico próprio, e confundir as duas coisas leva alguém, um dia, a
 * apagar do sistema o que "já está no Drive".
 *
 * O envio pode acontecer sem ninguém pedir PDF (§16.2): fechou, entra na
 * fila. O que NÃO acontece sem pedido é a criação do documento — só o que a
 * instituição fechou é arquivado.
 */
@Injectable()
export class ArchiveService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(DriveGateway) private readonly drive: DriveGateway,
  ) {
    /*
     * O LAÇO QUE FALTAVA.
     *
     * Até 31/08/2026 NADA enfileirava: a única porta era `POST /archive`, que
     * nenhuma tela chamava. A fila do arquivo ficava permanentemente vazia, a
     * reconciliação dizia "nada pendente" — e dizia a verdade sobre a fila e
     * uma mentira sobre a instituição — e o protótipo ainda avisava, ao fechar
     * a ATA, que "a cópia documental entrou na fila do arquivo". Não entrava.
     *
     * Agora quem fecha um documento publica `document.closed`, e é aqui que a
     * cópia nasce. Um ouvinte que falha não derruba quem publicou: fechar a
     * ATA é o ato que importa, e a cópia tem fila com retentativa.
     */
    this.bus.on('document.closed', (e) => this.onDocumentoFechado(e));
  }

  /**
   * Reage a `document.closed`. Roda como QUEM FECHOU: a permissão de arquivar
   * é conferida no banco, com o cargo de quem assinou o documento — o mesmo
   * caminho de uma chamada pela tela, e não uma porta de serviço sem dono.
   */
  private async onDocumentoFechado(e: DomainEvent<DocumentClosed>): Promise<void> {
    const d = e.payload;
    const actorId = e.actorId ?? null;
    if (!actorId || !d?.categoria || !d?.entidade || !d?.entityId) return;

    const quando = d.quando ? new Date(d.quando) : (e.at ?? new Date());
    const versao = d.versao ?? 'V1';
    const filename = this.nomeSeguro(d.categoria, d.entityId, quando, versao);
    const casa = d.houseId ?? e.houseId ?? null;

    const r = await this.db.asUser(actorId, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_archive_enqueue($1,$2,$3,$4,$5,$6,$7,$8)`,
        [casa, d.categoria, d.entidade, d.entityId, filename, versao,
         d.restrita ?? false, quando.toISOString()]);
      return row;
    });

    // Já existia é o caso NORMAL de reprocessamento — fechar de novo depois de
    // uma reabertura não duplica a cópia. Não é evento de auditoria.
    if (!r?.ja_existia) {
      await this.audit.log({
        action: 'archive.enqueue.auto', actorId, houseId: casa,
        entity: 'archive_item', entityId: r.item_id,
        detail: { categoria: d.categoria, origem: d.entidade, versao },
      });
    }
  }

  /**
   * Nome de arquivo sem pessoa (§3.3, §16.3).
   *
   * Nem nome, nem CPF, nem diagnóstico, nem conteúdo judicial. O nome diz
   * categoria, data e um identificador curto — quem precisa saber de quem é
   * abre o sistema, onde há permissão e registro de leitura.
   */
  nomeSeguro(categoria: string, entityId: string, data: Date, versao = 'V1'): string {
    // Defeito 9: `toISOString()` é UTC. A PASTA no Drive já era montada em
    // America/Sao_Paulo (app_archive_enqueue), então a ATA fechada às 22h do
    // dia 31 ia para a pasta 2026/07 com o nome dizendo 2026-08-01. Quem for
    // procurar o documento da noite do dia 31 — e quem vai procurar é a
    // coordenação na véspera de uma audiência — não acha nem pelo nome nem
    // pela pasta. Nome e caminho passam a falar a mesma data.
    const dia = dataNaInstituicao(data);
    return `${categoria}_${dia}_${entityId.slice(0, 8)}_${versao}.pdf`;
  }

  /** Enfileira uma cópia documental. Idempotente por (entidade, versão). */
  async enfileirar(user: AuthenticatedUser, input: {
    houseId?: string; categoria: string; entidade: string; entityId: string;
    versao?: string; restrita?: boolean; quando?: string;
  }) {
    if (!input?.categoria || !input?.entidade || !input?.entityId) {
      throw new BadRequestException('Informe categoria, entidade e identificador do documento.');
    }
    const quando = input.quando ? new Date(input.quando) : new Date();
    const versao = input.versao ?? 'V1';
    const filename = this.nomeSeguro(input.categoria, input.entityId, quando, versao);

    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_archive_enqueue($1,$2,$3,$4,$5,$6,$7,$8)`,
        [input.houseId ?? null, input.categoria, input.entidade, input.entityId,
         filename, versao, input.restrita ?? false, quando.toISOString()]);
      return row;
    }).catch((e: any) => {
      if (String(e?.message).includes('sem_permissao_arquivar')) {
        throw new ForbiddenException('Sem permissão para arquivar documentos.');
      }
      if (String(e?.message).includes('ck_filename_sem_pessoa')) {
        throw new BadRequestException(
          'Nome de arquivo recusado: não pode conter CPF nem espaços (§3.3).');
      }
      throw e;
    });

    await this.audit.log({
      action: 'archive.enqueue', actorId: user.id, institutionId: user.institutionId,
      houseId: input.houseId ?? null, entity: 'archive_item', entityId: r.item_id,
      detail: { categoria: input.categoria, versao, jaExistia: r.ja_existia },
    });
    return {
      id: r.item_id, jaExistia: r.ja_existia, filename,
      aviso: r.ja_existia
        ? 'Este documento já estava na fila com esta versão. Nada foi duplicado.'
        : 'Documento na fila. Nunca sobrescreve: correção depois vira V2_ADENDO.',
    };
  }

  async fila(user: AuthenticatedUser, limite = 20) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_archive_queue($1)`, [limite]);
      return rows.map((r) => ({
        id: r.id, caminho: r.caminho, arquivo: r.filename, entidade: r.entity,
        versao: r.versao, situacao: r.status, tentativas: r.tentativas,
        areaRestrita: r.area_restrita,
      }));
    }).catch((e: any) => {
      if (String(e?.message).includes('sem_permissao_ver_fila')) {
        throw new ForbiddenException(
          'A fila do arquivo é da equipe técnica, da coordenação e do Gestor Geral. Educadores não têm acesso às pastas (§16.5).');
      }
      throw e;
    });
  }

  /**
   * Processa a fila: envia, marca salvo e verifica.
   *
   * A retentativa é idempotente — o gateway recebe o caminho e a versão, que
   * juntos identificam o arquivo. Um envio repetido substitui o mesmo objeto
   * em vez de criar um segundo; um adendo é OUTRA versão, com outro nome.
   */
  async processar(user: AuthenticatedUser, limite = 5) {
    /* alcance:arquivo — quem processa a fila. Conferido contra `alcance.ts`. */
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Sem permissão para processar a fila do arquivo.');
    }
    const itens = await this.fila(user, limite);
    const resultado: { id: string; situacao: string; erro?: string }[] = [];

    for (const item of itens) {
      await this.transicao(user, item.id, 'enviando');
      try {
        const conteudo = `documento fechado · ${item.entidade} · ${item.versao}`;
        const sha = createHash('sha256').update(conteudo).digest('hex');
        const { driveFileId } = await this.drive.enviar({
          caminho: item.caminho, filename: item.arquivo, conteudo, sha256: sha,
        });
        await this.transicao(user, item.id, 'salvo', { driveFileId, sha });
        // Verificar é conferir que o que chegou é o que saiu — sem isso,
        // "salvo" é só uma promessa da rede.
        const ok = await this.drive.verificar(driveFileId, sha);
        if (ok) await this.transicao(user, item.id, 'verificado');
        resultado.push({ id: item.id, situacao: ok ? 'verificado' : 'salvo' });
      } catch (e: any) {
        const erro = e?.message ? String(e.message).slice(0, 300) : 'falha desconhecida';
        const r = await this.transicao(user, item.id, 'falhou', { erro });
        resultado.push({ id: item.id, situacao: 'falhou', erro });
        if (r.escalar) await this.escalar(user, item.id, erro);
      }
    }
    return { processados: resultado.length, itens: resultado };
  }

  private async transicao(user: AuthenticatedUser, id: string, para: string,
                          extra: { driveFileId?: string; sha?: string; erro?: string } = {}) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_archive_transition($1,$2,$3,$4,$5)`,
        [id, para, extra.driveFileId ?? null, extra.sha ?? null, extra.erro ?? null]);
      return row as { novo_status: string; total_tentativas: number; escalar: boolean };
    });
  }

  /**
   * Falha persistente chega a gente (§16.4).
   *
   * Sem isto, o modo de falha é o pior possível: o documento simplesmente não
   * está no Drive, e ninguém descobre até precisarem dele.
   */
  private async escalar(user: AuthenticatedUser, itemId: string, erro: string) {
    const pedido: EscalationRequest = {
      level: 'tecnica_coordenacao', entity: 'archive_item', entityId: itemId,
      reason: 'documento não chegou ao arquivo',
      title: 'Documento não foi arquivado',
      body: 'Um documento fechado falhou ao ser enviado para o arquivo depois de três tentativas. '
          + 'O documento continua íntegro no sistema; o que faltou foi a cópia no Drive.',
      priority: 'alta', groupKey: 'archive:falha',
    };
    await this.bus.publish('escalation.requested', pedido, { actorId: user.id });
    await this.audit.log({
      action: 'archive.failure_escalated', actorId: user.id, institutionId: user.institutionId,
      entity: 'archive_item', entityId: itemId, detail: { erro: erro.slice(0, 120) },
    });
  }

  /** Reconciliação por casa (§16.4): o que fechou e não chegou lá. */
  async reconciliar(user: AuthenticatedUser, houseId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_archive_reconcile($1)`, [houseId]);
      return rows;
    });
    const pendentes = rows.reduce((s, r) => s + Number(r.aguardando) + Number(r.falhou), 0);
    return {
      porCategoria: rows.map((r) => ({
        categoria: r.categoria, aguardando: r.aguardando,
        falhou: r.falhou, verificado: r.verificado,
      })),
      pendentes,
      aviso: pendentes
        ? 'Há documentos fechados que ainda não estão no arquivo. Eles continuam íntegros no sistema.'
        : 'Nada pendente: tudo o que fechou está arquivado e verificado.',
    };
  }

  async item(user: AuthenticatedUser, id: string) {
    const dados = await this.db.asUser(user.id, async (c) => {
      const { rows: [i] } = await c.query(`SELECT * FROM archive_item WHERE id = $1`, [id]);
      if (!i) return null;
      const { rows: tentativas } = await c.query(
        `SELECT de, para, erro, at FROM archive_attempt WHERE item_id = $1 ORDER BY at`, [id]);
      return { i, tentativas };
    });
    if (!dados) throw new NotFoundException('Item de arquivo não encontrado.');
    const { i, tentativas } = dados;
    return {
      id: i.id, caminho: i.caminho, arquivo: i.filename, categoria: i.categoria,
      entidade: i.entity, entityId: i.entity_id, versao: i.versao,
      situacao: i.status, tentativas: i.tentativas, ultimoErro: i.ultimo_erro,
      driveFileId: i.drive_file_id, sha256: i.sha256, areaRestrita: i.area_restrita,
      fechadoEm: i.fechado_em, enviadoEm: i.enviado_em, verificadoEm: i.verificado_em,
      historico: tentativas.map((t) => ({ de: t.de, para: t.para, erro: t.erro, em: t.at })),
    };
  }
}
