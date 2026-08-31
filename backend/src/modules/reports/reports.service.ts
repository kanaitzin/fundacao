import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service';
import { ConteudoService } from './conteudo.service';
import { DocumentoService } from './documento.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * RELATÓRIOS (§14.5, §14.6, §18.3, §18.4).
 *
 * Três coisas que este serviço faz de propósito:
 *
 *  * **exige finalidade.** Não existe relatório "só para ver". A finalidade
 *    fica no documento e no log de exportação — é o que permite responder,
 *    depois, por que aquele conjunto de dados saiu do sistema;
 *
 *  * **mantém a fonte de cada trecho.** Cada seção guarda de onde veio, quem
 *    registrou e quando. Um relatório que perde a origem vira boato com
 *    papel timbrado;
 *
 *  * **não envia nada.** Gerar e entregar são atos diferentes. O sistema
 *    gera; a entrega ao Judiciário, ao Conselho Tutelar ou ao MP é humana e
 *    fica registrada como ato de alguém, com destinatário, meio e protocolo
 *    (§14.6). Não há endpoint, fila ou integração de envio — procurar por
 *    "send" neste módulo não encontra nada, e isso é a garantia.
 */

export const TIPOS_RELATORIO = [
  { cod: 'diario', label: 'Diário', escopo: 'casa' },
  { cod: 'semanal', label: 'Semanal', escopo: 'pessoa' },
  { cod: 'mensal', label: 'Mensal', escopo: 'pessoa' },
  { cod: 'periodo', label: 'Período personalizado', escopo: 'casa' },
  { cod: 'individual', label: 'Individual completo', escopo: 'pessoa' },
  { cod: 'medicamentos', label: 'Medicamentos', escopo: 'casa' },
  { cod: 'atividades', label: 'Atividades', escopo: 'casa' },
  { cod: 'ocorrencias', label: 'Ocorrências', escopo: 'casa' },
  { cod: 'reuniao_tecnica', label: 'Reunião técnica', escopo: 'casa' },
  { cod: 'audiencia', label: 'Audiência concentrada', escopo: 'pessoa' },
  { cod: 'judiciario', label: 'Judiciário', escopo: 'pessoa' },
  { cod: 'mensal_da_casa', label: 'Mensal da casa', escopo: 'casa' },
  { cod: 'atas_consolidadas', label: 'ATAs consolidadas', escopo: 'casa' },
  { cod: 'alimentacao', label: 'Alimentação e restrições', escopo: 'casa' },
  { cod: 'desenvolvimento', label: 'Desenvolvimento da criança na casa', escopo: 'pessoa' },
  { cod: 'historico', label: 'Histórico institucional', escopo: 'pessoa' },
  { cod: 'saude', label: 'Evolução e Resumo de Saúde', escopo: 'pessoa' },
  { cod: 'beneficios', label: 'Benefícios e dados bancários', escopo: 'pessoa', restrito: true },
] as const;

/** Como o cargo aparece embaixo da assinatura, no papel. */
const CARGO_LABEL: Record<string, string> = {
  gestor_geral: 'Gestor Geral',
  coordenador: 'Coordenação da unidade',
  equipe_tecnica: 'Equipe técnica',
  enfermagem: 'Enfermagem',
  lider_diurno: 'Líder Diurno',
  lider_noturno_geral: 'Líder Noturno Geral',
  educador: 'Educador social',
};

/** Os que só existem depois de aprovados por quem não os escreveu (§14.6). */
const EXIGEM_APROVACAO = ['judiciario', 'audiencia', 'mensal_da_casa'];

/**
 * Seções da Audiência Concentrada.
 *
 * A primeira lista veio do §14.6 e tinha onze seções. O documento REAL que a
 * Fundação levou à audiência de março tem quatro blocos por criança:
 * Acompanhamento, Saúde, Educação e Profissionalização, Contexto
 * Sociofamiliar. Ele é mais curto porque foi escrito por quem redige de
 * verdade, na véspera, para vinte crianças.
 *
 * Então o padrão passou a ser o real, e o restante do §14.6 fica como seções
 * OPCIONAIS, oferecidas quando o caso pede — apadrinhamento e projeto de vida
 * aparecem no texto da Fundação dentro do bloco sociofamiliar, e forçar onze
 * títulos criaria nove campos vazios que, num documento judicial, são lidos
 * como ausência de trabalho.
 *
 * Os quatro blocos também são os mesmos eixos do acompanhamento mensal
 * (§14.3), o que não é coincidência: é o que permite a audiência ser montada
 * a partir do que já foi escrito no mês, com fonte, autor e data.
 */
export const SECOES_AUDIENCIA = [
  'acompanhamento',
  'saúde',
  'educação e profissionalização',
  'contexto sociofamiliar',
];

/** Oferecidas conforme o caso, não como campo em branco a preencher. */
export const SECOES_AUDIENCIA_OPCIONAIS = [
  'identificação e resumo do acolhimento',
  'apadrinhamento',
  'projeto de vida',
  'autonomia e preparação para desligamento',
  'benefícios, quando pertinentes',
  'situação judicial',
  'pedidos',
  'encaminhamentos e pendências',
];

@Injectable()
export class ReportsService {
  constructor(
    @Inject(ConteudoService) private readonly conteudo: ConteudoService,
    @Inject(DocumentoService) private readonly documento: DocumentoService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  tipos(user: AuthenticatedUser) {
    const podeBanco = ['coordenador', 'gestor_geral'].includes(user.role);
    return TIPOS_RELATORIO
      .filter((t) => !('restrito' in t && t.restrito) || podeBanco)
      .map((t) => ({
        ...t, exigeAprovacao: EXIGEM_APROVACAO.includes(t.cod),
        secoes: t.cod === 'audiencia' ? SECOES_AUDIENCIA : undefined,
        secoesOpcionais: t.cod === 'audiencia' ? SECOES_AUDIENCIA_OPCIONAIS : undefined,
      }));
  }

  /**
   * Monta o relatório. Nasce em rascunho; os que vão para fora só saem
   * depois de aprovados por outra pessoa.
   */
  async gerar(user: AuthenticatedUser, input: {
    kind: string; houseId?: string; personId?: string;
    de: string; ate: string; finalidade: string; formato?: string;
    secoes?: { titulo: string; texto: string; fonte?: string; autor?: string; em?: string }[];
  }) {
    const tipo = TIPOS_RELATORIO.find((t) => t.cod === input.kind);
    if (!tipo) throw new BadRequestException('Tipo de relatório desconhecido.');
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral', 'enfermagem'].includes(user.role)) {
      throw new ForbiddenException('Este cargo não gera relatórios.');
    }
    if ('restrito' in tipo && tipo.restrito && !['coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException(
        'Relatório de benefícios é área restrita: coordenação da casa atual e Gestor Geral (§6.10).');
    }
    if (!input.finalidade?.trim() || input.finalidade.trim().length < 10) {
      throw new BadRequestException(
        'Descreva a finalidade do relatório (mínimo 10 caracteres). Ela fica no documento e no registro de exportação.');
    }
    if (!input.de || !input.ate) throw new BadRequestException('Informe o período.');
    if (tipo.escopo === 'pessoa' && !input.personId) {
      throw new BadRequestException('Este relatório é de um acolhido: informe de quem.');
    }
    if (tipo.escopo === 'casa' && !input.houseId) {
      throw new BadRequestException('Este relatório é da casa: informe a unidade.');
    }

    // Cada seção carrega a própria origem. Sem fonte, o trecho fica marcado
    // como redigido pelo autor — nunca como fato de origem desconhecida.
    /*
     * O relatório nascia vazio, e isso foi o achado mais caro do ensaio de
     * uso: a equipe abria o documento e encontrava um formulário em branco,
     * tendo que digitar à mão o que o sistema inteiro já sabia. Quando o autor
     * não manda seções, o sistema monta a parte factual e deixa em branco,
     * marcados como pendência, os campos que só uma pessoa pode escrever.
     */
    const doSistema = (input.secoes?.length ?? 0) > 0
      ? []
      : await this.conteudo.montar(user, {
          kind: input.kind, houseId: input.houseId, personId: input.personId,
          de: input.de, ate: input.ate,
        });

    const secoes = [
      ...doSistema.map((s) => ({
        titulo: s.titulo, texto: s.texto,
        fonte: s.fonte ?? 'registros do sistema',
        aPreencher: s.aPreencher ?? false,
        autor: s.aPreencher ? null : 'Rede Acolher',
        em: new Date().toISOString(),
      })),
      ...(input.secoes ?? []).map((s) => ({
        titulo: s.titulo, texto: s.texto,
        fonte: s.fonte ?? 'redigido pelo autor do relatório',
        aPreencher: false,
        autor: s.autor ?? user.fullName, em: s.em ?? new Date().toISOString(),
      })),
    ];
    const body = { finalidade: input.finalidade.trim(), secoes };
    const checksum = createHash('sha256').update(JSON.stringify(body)).digest('hex');

    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `INSERT INTO report_document (house_id, person_id, kind, period_start, period_end,
                                      purpose, format, body, checksum, created_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9, app_current_user(), 'rascunho')
         RETURNING id, status, version`,
        [input.houseId ?? null, input.personId ?? null, input.kind, input.de, input.ate,
         input.finalidade.trim(), input.formato ?? 'pdf', JSON.stringify(body), checksum]);
      return row;
    });

    await this.audit.log({
      action: 'report.generate', actorId: user.id, institutionId: user.institutionId,
      houseId: input.houseId ?? null, entity: 'report', entityId: r.id,
      detail: { tipo: input.kind, de: input.de, ate: input.ate, secoes: secoes.length },
    });

    return {
      id: r.id, situacao: r.status, versao: r.version, checksum,
      exigeAprovacao: EXIGEM_APROVACAO.includes(input.kind),
      aviso: EXIGEM_APROVACAO.includes(input.kind)
        ? 'Rascunho criado. Este relatório só vale depois de aprovado por outra pessoa — e o sistema não envia nada a ninguém: a entrega é sua, e fica registrada.'
        : 'Rascunho criado.',
    };
  }

  async abrir(user: AuthenticatedUser, id: string) {
    const row = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT r.*, a.full_name AS aprovador, cr.full_name AS autor,
                h.code AS casa_codigo, h.name AS casa_nome,
                CASE WHEN r.person_id IS NOT NULL
                     THEN app_person_display_name(r.person_id) END AS acolhido
           FROM report_document r
           -- rls-join-ok: app_user e house não filtram por linha aqui; quem
           -- decide o que este usuário enxerga é a policy rep_select.
           LEFT JOIN app_user a ON a.id = r.approved_by
           LEFT JOIN app_user cr ON cr.id = r.created_by
           LEFT JOIN house h ON h.id = r.house_id
          WHERE r.id = $1`, [id]);
      return r;
    });
    if (!row) throw new NotFoundException('Relatório não encontrado.');
    return {
      id: row.id, tipo: row.kind, situacao: row.status, versao: row.version,
      periodo: { de: row.period_start, ate: row.period_end },
      finalidade: row.purpose, formato: row.format, corpo: row.body,
      autor: row.autor, aprovador: row.aprovador, aprovadoEm: row.approved_at,
      aprovadoPor: row.aprovador,
      unidade: row.casa_codigo ? `${row.casa_codigo} ${row.casa_nome}` : null,
      acolhido: row.acolhido ?? null,
      checksum: row.checksum,
    };
  }

  async listar(user: AuthenticatedUser, houseId?: string, personId?: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT id, kind, status, version, period_start, period_end, purpose, created_at
           FROM report_document
          WHERE ($1::uuid IS NULL OR house_id = $1)
            AND ($2::uuid IS NULL OR person_id = $2)
          ORDER BY created_at DESC LIMIT 100`, [houseId ?? null, personId ?? null]);
      return rows.map((r) => ({
        id: r.id, tipo: r.kind, situacao: r.status, versao: r.version,
        periodo: { de: r.period_start, ate: r.period_end },
        finalidade: r.purpose, em: r.created_at,
      }));
    });
  }

  async enviarParaAprovacao(user: AuthenticatedUser, id: string) {
    const n = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE report_document SET status = 'em_aprovacao'
          WHERE id = $1 AND status = 'rascunho'`, [id]);
      return rowCount;
    });
    if (!n) throw new ConflictException('Relatório não está em rascunho.');
    return { situacao: 'em_aprovacao' };
  }

  /** Coordenação aprova; quem redigiu, não (§14.6). */
  async aprovar(user: AuthenticatedUser, id: string) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(`SELECT * FROM app_approve_report($1)`, [id]);
      return row;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('autor_nao_aprova')) {
        throw new ForbiddenException(
          'Quem redigiu não aprova o próprio relatório. A equipe técnica redige, a coordenação aprova (§14.6).');
      }
      if (m.includes('somente_coordenacao_aprova')) {
        throw new ForbiddenException('Somente a coordenação e o Gestor Geral aprovam relatórios.');
      }
      if (m.includes('nao_esta_em_aprovacao')) {
        throw new ConflictException('Este relatório não está aguardando aprovação.');
      }
      if (m.includes('inexistente') || m.includes('fora_de_escopo')) {
        throw new NotFoundException('Relatório não encontrado.');
      }
      throw e;
    });
    await this.audit.log({
      action: 'report.approve', actorId: user.id, institutionId: user.institutionId,
      entity: 'report', entityId: id, detail: { versao: r.versao },
    });
    return {
      aprovado: true, versao: r.versao,
      aviso: 'Aprovado. Este é o retrato daquele momento — e continua sendo depois da audiência.',
    };
  }

  /**
   * Exportar. Não devolve arquivo mágico: devolve o conteúdo e DEIXA RASTRO
   * de quem exportou, com qual finalidade, formato e filtros (§18.4).
   */
  async exportar(user: AuthenticatedUser, id: string, formato: string, finalidade: string,
                 filtros: Record<string, unknown> = {}) {
    if (!finalidade?.trim() || finalidade.trim().length < 10) {
      throw new BadRequestException('Descreva a finalidade da exportação (mínimo 10 caracteres).');
    }
    const doc = await this.abrir(user, id);
    if (doc.situacao !== 'aprovado' && ['judiciario', 'audiencia'].includes(doc.tipo)) {
      throw new ConflictException(
        'Relatório ainda não aprovado. Exportar um rascunho para fora seria entregar como institucional o que ninguém revisou.');
    }
    // Planilha carrega o mínimo (§18.4): dado sensível em planilha viaja
    // fácil demais, e ninguém consegue lembrar quem tem qual cópia.
    const corpo = formato === 'planilha'
      ? { finalidade: doc.finalidade, secoes: (doc.corpo?.secoes ?? []).map((s: any) => ({ titulo: s.titulo })) }
      : doc.corpo;

    await this.db.asUser(user.id, async (c) => {
      await c.query(
        `INSERT INTO export_log (user_id, house_id, report_id, kind, period_start, period_end,
                                 purpose, format, filters)
         VALUES (app_current_user(),
                 (SELECT house_id FROM report_document WHERE id = $1), $1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [id, doc.tipo, doc.periodo.de, doc.periodo.ate, finalidade.trim(), formato,
         JSON.stringify(filtros)]);
    });
    await this.audit.log({
      action: 'report.export', actorId: user.id, institutionId: user.institutionId,
      entity: 'report', entityId: id, detail: { formato, tipo: doc.tipo },
    });
    /*
     * Word, e não PDF, por uso e não por tecnologia: quem assina precisa poder
     * mexer. A técnica escreve a avaliação, a coordenação acrescenta uma linha
     * antes da audiência, alguém corrige um nome. Um PDF fechado empurraria a
     * equipe a refazer tudo no Word da máquina dela, e aí o que vai ao Juízo
     * deixa de ter relação com o que está no sistema. A conversão para PDF é
     * da pessoa, na hora de enviar, quando o texto já está fechado.
     */
    if (formato === 'documento' || formato === 'docx') {
      const tipo = TIPOS_RELATORIO.find((t) => t.cod === doc.tipo);
      const arquivo = await this.documento.gerar({
        titulo: `Relatório ${tipo?.label ?? doc.tipo}`,
        tipoLabel: tipo?.label ?? doc.tipo,
        situacao: doc.situacao,
        finalidade: doc.finalidade,
        periodoDe: doc.periodo.de, periodoAte: doc.periodo.ate,
        unidade: doc.unidade ?? null,
        acolhido: doc.acolhido ?? null,
        secoes: (doc.corpo?.secoes ?? []).map((x: any) => ({
          titulo: x.titulo, texto: x.texto ?? '', fonte: x.fonte, aPreencher: x.aPreencher,
        })),
        geradoPor: user.fullName,
        cargo: CARGO_LABEL[user.role] ?? user.role,
        aprovadoPor: doc.aprovadoPor ?? null,
      });
      return {
        id, tipo: doc.tipo, formato: 'docx',
        nomeArquivo: this.documento.nomeDoArquivo(
          tipo?.label ?? doc.tipo, doc.periodo.de, doc.periodo.ate),
        conteudoBase64: arquivo.toString('base64'),
        aviso: doc.situacao === 'aprovado'
          ? 'Documento gerado em Word, com timbre. Exportação registrada com o seu nome, '
            + 'a finalidade e o horário. Converta para PDF na hora de enviar.'
          : 'Documento gerado em Word, marcado como RASCUNHO na primeira página. '
            + 'Ele só deixa de ser rascunho depois da aprovação de outra pessoa.',
      };
    }

    return {
      id, tipo: doc.tipo, formato, corpo,
      aviso: 'Exportação registrada com o seu nome, a finalidade e o horário.',
    };
  }

  /**
   * Registrar a ENTREGA a um órgão externo (§14.6).
   *
   * Isto não envia nada. É o registro de que uma pessoa entregou, quando, a
   * quem e por qual meio — o equivalente ao protocolo que já existe no papel.
   */
  async registrarEntrega(user: AuthenticatedUser, id: string, entrega: {
    destinatario: string; meio: string; entregueEm: string; protocolo?: string; observacao?: string;
  }) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação registram entregas.');
    }
    if (!entrega?.destinatario?.trim() || !entrega?.meio?.trim() || !entrega?.entregueEm) {
      throw new BadRequestException('Informe destinatário, meio e data da entrega.');
    }
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `INSERT INTO report_delivery (report_id, destinatario, meio, entregue_em, protocolo,
                                      registrado_por, observacao)
         VALUES ($1,$2,$3,$4,$5, app_current_user(), $6) RETURNING id`,
        [id, entrega.destinatario.trim(), entrega.meio.trim(), entrega.entregueEm,
         entrega.protocolo ?? null, entrega.observacao ?? null]);
      return row;
    }).catch((e: any) => {
      if (String(e?.code) === '23514' || String(e?.message).includes('row-level security')) {
        throw new ConflictException('Só se registra entrega de relatório aprovado.');
      }
      throw e;
    });
    if (!r) throw new ConflictException('Só se registra entrega de relatório aprovado.');

    await this.audit.log({
      action: 'report.delivery_registered', actorId: user.id, institutionId: user.institutionId,
      entity: 'report', entityId: id, detail: { meio: entrega.meio },
    });
    return { id: r.id, registrado: true };
  }

  async entregas(user: AuthenticatedUser, id: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT d.destinatario, d.meio, d.entregue_em, d.protocolo, d.observacao,
                u.full_name AS registrou, d.registrado_em
           FROM report_delivery d
           -- rls-join-ok: app_user não tem RLS de linha; quem filtra é a policy del_select.
           JOIN app_user u ON u.id = d.registrado_por
          WHERE d.report_id = $1 ORDER BY d.entregue_em DESC`, [id]);
      return rows.map((r) => ({
        destinatario: r.destinatario, meio: r.meio, entregueEm: r.entregue_em,
        protocolo: r.protocolo, observacao: r.observacao,
        registrouPor: r.registrou, registradoEm: r.registrado_em,
      }));
    });
  }
}
