import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { Folha, diaBR, cargoNoDocumento } from '../../kernel/documentos/folha';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';

/**
 * A COZINHA — três documentos que saem da casa e vão para outro setor.
 *
 * O cargo `cozinha` existe no banco desde a migração 0010, mas a Fundação
 * decidiu em 09/09 que a cozinha NÃO entra no sistema por enquanto. A tela
 * dela saiu; o que ficou — e ganhou importância — foram as folhas: a casa
 * gera, imprime ou envia, e a cozinha recebe em papel.
 *
 * Isso muda o cuidado com o CONTEÚDO. Uma tela tem alcance; um papel não tem.
 * Papel circula entre setores, fica em cima de bancada, é lido por quem passa.
 * Por isso as três folhas carregam o mínimo: nome pelo qual a criança é
 * chamada, data, quantidade. Nunca diagnóstico, nunca motivo judicial, nunca
 * CPF, nunca o motivo de uma restrição alimentar.
 */
@Injectable()
export class CozinhaService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
  ) {}

  /* ---------------- Pedidos ---------------- */

  async pedidos(user: AuthenticatedUser, houseId: string, de: string, ate: string) {
    await this.casaNoAlcance(user, houseId);
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM app_pedidos_da_cozinha($1,$2::date,$3::date)`, [houseId, de, ate]);
      return rows.map((r) => ({
        id: r.id, tipo: r.kind, personId: r.person_id, paraQuem: r.para_quem,
        em: r.em, quantidade: r.quantidade, finalidade: r.finalidade,
        observacao: r.observacao, entregarA: r.entregar_a,
        status: r.status, motivoCancelamento: r.motivo_cancelamento,
        pedidoPor: r.pedido_por, pedidoEm: r.pedido_em,
      }));
    }).then(async (lista) => {
      /* Fase 162: o lote (quando veio do "Selecionar todos") e se já foi
         editado — a tela mostra o histórico de quem foi. */
      if (!lista.length) return lista;
      const extra = await this.db.asUser(user.id, async (c) => {
        const { rows } = await c.query(
          `SELECT k.id, k.batch_id,
                  (SELECT count(*)::int FROM kitchen_request_change m WHERE m.request_id = k.id) AS edicoes
             FROM kitchen_request k WHERE k.id = ANY($1::uuid[])`, [lista.map((l) => l.id)]);
        return new Map(rows.map((r: any) => [r.id, r]));
      });
      return lista.map((l) => {
        const x: any = extra.get(l.id);
        return { ...l, lote: x?.batch_id ?? null, edicoes: x?.edicoes ?? 0 };
      });
    });
  }

  async pedir(user: AuthenticatedUser, input: {
    houseId: string; tipo: string; personId?: string | null; em: string;
    quantidade: number; finalidade: string; observacao?: string; entregarA?: string;
    /** "Selecionar todos" (fase 162): um pedido por criança marcada. */
    pessoas?: string[];
  }) {
    if (Array.isArray(input.pessoas)) return this.pedirEmLote(user, input as any);
    try {
      const id = await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(
          `SELECT * FROM app_pedir_a_cozinha($1,$2,$3,$4::date,$5,$6,$7,$8)`,
          [input.houseId, input.tipo, input.personId || null, input.em,
           input.quantidade, input.finalidade, input.observacao ?? null,
           input.entregarA ?? null]);
        return row.pedido_id as string;
      });
      await this.audit.log({
        action: 'kitchen.request', actorId: user.id, institutionId: user.institutionId,
        houseId: input.houseId, entity: 'kitchen_request', entityId: id,
        detail: { tipo: input.tipo, em: input.em },
      });
      return { id };
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('finalidade_obrigatoria')) {
        throw new BadRequestException(
          'Escreva para que serve. "1 lanche" sem finalidade obriga a cozinha a adivinhar.');
      }
      if (m.includes('quantidade_invalida')) {
        throw new BadRequestException('A quantidade tem de ser maior que zero.');
      }
      if (m.includes('pessoa_fora_da_casa')) {
        throw new NotFoundException('Esta criança não está nesta casa.');
      }
      if (m.includes('sem_permissao_pedido_cozinha')) {
        throw new ForbiddenException('Sem acesso aos pedidos da cozinha.');
      }
      throw e;
    }
  }

  /**
   * "SELECIONAR TODOS" — um pedido por criança, gravados juntos (decisão de
   * 26/09). Tudo ou nada: uma criança que saiu da casa recusa o lote, e a tela
   * diz por quê, em vez de gravar onze de doze.
   */
  private async pedirEmLote(user: AuthenticatedUser, input: {
    houseId: string; tipo: string; pessoas: unknown[]; em: string; quantidade: number;
    finalidade: string; observacao?: string; entregarA?: string;
  }) {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pessoas = [...new Set(input.pessoas.map(String))];
    if (!pessoas.length) throw new BadRequestException('Marque pelo menos uma criança.');
    if (pessoas.some((p) => !UUID.test(p))) {
      throw new BadRequestException('Uma das crianças veio num formato que o sistema não reconhece.');
    }
    try {
      const r = await this.db.asUser(user.id, async (c) => {
        const { rows } = await c.query(
          `SELECT * FROM app_pedir_a_cozinha_em_lote($1,$2,$3::uuid[],$4::date,$5,$6,$7,$8)`,
          [input.houseId, input.tipo, pessoas, input.em, input.quantidade, input.finalidade,
           input.observacao ?? null, input.entregarA ?? null]);
        return { ids: rows.map((x: any) => x.pedido_id as string), lote: rows[0]?.lote as string };
      });
      await this.audit.log({
        action: 'kitchen.request_batch', actorId: user.id, institutionId: user.institutionId,
        houseId: input.houseId, entity: 'kitchen_request', entityId: r.lote,
        detail: { tipo: input.tipo, em: input.em, pedidos: r.ids.length },
      });
      return { ids: r.ids, lote: r.lote,
               aviso: `${r.ids.length} pedidos registrados, um por criança. Cada um pode ser cancelado sozinho.` };
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('ninguem_marcado')) throw new BadRequestException('Marque pelo menos uma criança.');
      if (m.includes('finalidade_obrigatoria')) {
        throw new BadRequestException(
          'Escreva para que serve. "1 lanche" sem finalidade obriga a cozinha a adivinhar.');
      }
      if (m.includes('quantidade_invalida')) throw new BadRequestException('A quantidade tem de ser maior que zero.');
      if (m.includes('pessoa_fora_da_casa')) {
        throw new NotFoundException('Uma das crianças marcadas não está nesta casa. Nada foi registrado — confira a lista.');
      }
      if (m.includes('sem_permissao_pedido_cozinha')) throw new ForbiddenException('Sem acesso aos pedidos da cozinha.');
      if (m.includes('casa_fora_de_escopo')) throw new NotFoundException('Unidade não encontrada — ou fora do seu alcance.');
      throw e;
    }
  }

  /**
   * EDITAR O PEDIDO (decisão de 26/09): quem pediu, a coordenação, a técnica e
   * o líder, enquanto ele estiver aberto e a data não tiver passado. O antes
   * fica no histórico, com o motivo.
   */
  async editar(user: AuthenticatedUser, id: string, input: {
    em?: string; quantidade?: number; finalidade?: string; observacao?: string;
    entregarA?: string; motivo?: string;
  }) {
    if (input.em != null && (!/^\d{4}-\d{2}-\d{2}$/.test(input.em) || Number.isNaN(Date.parse(`${input.em}T12:00:00Z`)))) {
      throw new BadRequestException('A data precisa vir como 2026-09-26 — ano, mês e dia.');
    }
    if (input.quantidade != null && !Number.isInteger(Number(input.quantidade))) {
      throw new BadRequestException('A quantidade é um número inteiro.');
    }
    /* A auditoria é escrita pela função, com a casa do pedido. */
    try {
      await this.db.asUser(user.id, async (c) => {
        await c.query(`SELECT * FROM app_editar_pedido_cozinha($1,$2::date,$3,$4,$5,$6,$7)`,
          [id, input.em ?? null, input.quantidade ?? null, input.finalidade ?? null,
           input.observacao ?? null, input.entregarA ?? null, input.motivo ?? '']);
      });
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('pedido_inexistente')) throw new NotFoundException('Pedido não encontrado.');
      if (m.includes('sem_permissao_editar_pedido')) {
        throw new ForbiddenException('Editar é de quem fez o pedido, da coordenação, da técnica ou do líder.');
      }
      if (m.includes('pedido_cancelado')) throw new ConflictException('Este pedido foi cancelado; não se edita.');
      if (m.includes('pedido_passado')) {
        throw new ConflictException('A data deste pedido já passou — a cozinha já serviu. Se foi errado, cancele com o motivo.');
      }
      if (m.includes('data_no_passado')) throw new BadRequestException('A nova data não pode estar no passado.');
      if (m.includes('motivo_obrigatorio')) throw new BadRequestException('Escreva o motivo da mudança (pelo menos 5 caracteres).');
      if (m.includes('quantidade_invalida')) throw new BadRequestException('A quantidade tem de ser maior que zero.');
      if (m.includes('finalidade_obrigatoria')) throw new BadRequestException('A finalidade precisa dizer para que serve.');
      if (m.includes('nada_mudou')) throw new BadRequestException('Nada mudou no pedido.');
      throw e;
    }
    return { ok: true, aviso: 'Pedido editado. A versão anterior fica no histórico, com o seu motivo.' };
  }

  /** O histórico de um pedido: cada mudança, com o antes, o depois, o motivo e quem. */
  async historico(user: AuthenticatedUser, id: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [p] } = await c.query(`SELECT id FROM kitchen_request WHERE id = $1`, [id]);
      if (!p) throw new NotFoundException('Pedido não encontrado.');
      const { rows } = await c.query(
        `SELECT id, before, after, reason, changed_at, app_user_display_name(changed_by) AS por
           FROM kitchen_request_change WHERE request_id = $1 ORDER BY changed_at`, [id]);
      return rows.map((r: any) => ({ id: r.id, antes: r.before, depois: r.after, motivo: r.reason,
                                     em: r.changed_at, por: r.por }));
    });
  }

  async cancelar(user: AuthenticatedUser, id: string, motivo: string) {
    /* A casa do pedido, lida ANTES do cancelamento: a linha de auditoria sem
       casa é linha que a coordenação da casa não lê (fase 149). */
    let casa: string | null = null;
    try {
      await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `SELECT house_id FROM kitchen_request WHERE id = $1`, [id]);
        casa = (r?.house_id as string | null) ?? null;
        await c.query(`SELECT * FROM app_cancelar_pedido_cozinha($1,$2)`, [id, motivo]);
      });
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('motivo_obrigatorio')) {
        throw new BadRequestException(
          'Escreva o motivo. A cozinha pode já ter comprado, e ela vai ler isto.');
      }
      if (m.includes('pedido_ja_cancelado')) {
        throw new ConflictException('Este pedido já estava cancelado.');
      }
      if (m.includes('pedido_inexistente')) {
        throw new NotFoundException('Pedido não encontrado.');
      }
      throw e;
    }
    await this.audit.log({
      action: 'kitchen.cancel', actorId: user.id, institutionId: user.institutionId,
      houseId: casa, entity: 'kitchen_request', entityId: id, detail: { motivo },
    });
    return { cancelado: true };
  }

  /**
   * Quanto de comida saiu, e para quantas crianças.
   *
   * `quemPediu` é a contagem de pessoas DISTINTAS — nunca quanto cada uma
   * pediu. Somar por pessoa é medir gente, e um número por educador é
   * comparado mesmo sem tela de comparação.
   */
  async resumo(user: AuthenticatedUser, houseId: string, de: string, ate: string) {
    await this.casaNoAlcance(user, houseId);
    return this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT * FROM app_resumo_da_cozinha($1,$2::date,$3::date)`, [houseId, de, ate]);
      return {
        /* Porções e pedidos são números diferentes: 20 lanches para a saída do
           grupo é UM pedido e VINTE porções. */
        lanchesPorcoes: Number(r.lanches_porcoes),
        lanchesPedidos: Number(r.lanches_pedidos),
        lanchesCriancas: Number(r.lanches_criancas),
        cestas: Number(r.cestas),
        cestasCriancas: Number(r.cestas_criancas),
        cancelados: Number(r.cancelados),
        quemPediu: Number(r.quem_pediu),
      };
    });
  }

  /* ---------------- As três folhas ---------------- */

  private autor(user: AuthenticatedUser) {
    return { nome: user.fullName, cargo: cargoNoDocumento(user.role) };
  }

  /**
   * 1. SOLICITAÇÃO DE LANCHE.
   *
   * Uma folha por período, com todos os pedidos de lanche — não uma folha por
   * pedido. A cozinha planeja a semana de uma vez, e sete papéis avulsos com
   * uma linha cada é o que o sistema veio substituir.
   */
  async folhaDeLanches(user: AuthenticatedUser, houseId: string,
                       de: string, ate: string): Promise<Folha> {
    const todos = await this.pedidos(user, houseId, de, ate);
    const linhas = todos.filter((p) => p.tipo === 'lanche');
    const casa = await this.rotuloDaCasa(user, houseId);
    const abertos = linhas.filter((p) => p.status === 'aberto');

    return {
      titulo: 'Solicitação de lanche',
      subtitulo: casa,
      identificacao: [
        { rotulo: 'Período', valor: `${diaBR(de)} a ${diaBR(ate)}` },
        { rotulo: 'Pedidos em aberto', valor: String(abertos.length) },
        /* A cozinha planeja pela SOMA, não pelo número de linhas. */
        { rotulo: 'Porções no total',
          valor: String(abertos.reduce((n, p) => n + p.quantidade, 0)) },
      ],
      secoes: [
        {
          titulo: 'Lanches solicitados',
          tabela: {
            cabecalho: ['Data', 'Para', 'Qtd.', 'Finalidade', 'Entregar a', 'Solicitado por'],
            linhas: abertos.map((p) => [
              diaBR(p.em), p.paraQuem, String(p.quantidade),
              p.finalidade, p.entregarA ?? '—', p.pedidoPor,
            ]),
          },
          procedencia: 'Pedidos registrados pela equipe da casa no período.',
        },
        /* O cancelado sai numa seção PRÓPRIA, e não some: a cozinha pode já ter
           comprado, e ela precisa saber o que deixou de valer. */
        ...(linhas.some((p) => p.status === 'cancelado') ? [{
          titulo: 'Cancelados no período',
          tabela: {
            cabecalho: ['Data', 'Para', 'Qtd.', 'Motivo do cancelamento'],
            linhas: linhas.filter((p) => p.status === 'cancelado').map((p) => [
              diaBR(p.em), p.paraQuem, String(p.quantidade), p.motivoCancelamento ?? '—',
            ]),
          },
          procedencia: 'Pedidos cancelados, com o motivo informado por quem cancelou.',
        }] : []),
      ],
      geradoPor: user.fullName,
      cargo: cargoNoDocumento(user.role),
      assinatura: true,
      ...(abertos.length === 0
        ? { ressalva: 'Não há lanches solicitados para o período.' }
        : {}),
    };
  }

  /**
   * 2. RESTRIÇÕES ALIMENTARES DA CASA.
   *
   * É uma VISTA da mesma tabela que a equipe técnica e a Enfermagem escrevem —
   * não uma segunda cópia. Se fosse uma tabela à parte, um dia a folha diria
   * uma coisa e o prontuário outra, e é exatamente aí que uma criança come
   * amendoim.
   *
   * A projeção é deliberadamente pobre: o que evitar, o que servir no lugar, a
   * orientação. **Nunca o motivo da restrição** — alergia e doença celíaca não
   * são da conta de quem prepara a comida, e este papel fica na cozinha.
   */
  async folhaDeRestricoes(user: AuthenticatedUser, houseId: string): Promise<Folha> {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT coalesce(nullif(p.social_name,''), p.full_name) AS nome,
                f.restriction, f.substitution, f.guidance, f.review_on
           FROM person p
           JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa'
           JOIN food_restriction f ON f.person_id = p.id AND f.active
          WHERE s.house_id = $1
          ORDER BY nome`, [houseId]);
      return rows;
    });
    const casa = await this.rotuloDaCasa(user, houseId);

    return {
      titulo: 'Restrições alimentares',
      subtitulo: casa,
      identificacao: [
        /* A folha impressa às 22h chegava à cozinha datada de AMANHÃ (fase 99). */
        { rotulo: 'Emitida em', valor: diaBR(hojeNaInstituicao()) },
        { rotulo: 'Acolhidos com restrição', valor: String(rows.length) },
      ],
      secoes: [{
        titulo: 'Restrições por acolhido',
        tabela: {
          cabecalho: ['Acolhido', 'Não servir', 'Substituir por', 'Orientação'],
          linhas: rows.map((r) => [
            r.nome, r.restriction, r.substitution ?? '—', r.guidance ?? '—',
          ]),
        },
        procedencia: 'Restrições registradas pela equipe técnica e pela Enfermagem no prontuário '
          + 'de cada acolhido.',
      }],
      geradoPor: user.fullName,
      cargo: cargoNoDocumento(user.role),
      assinatura: true,
      ressalva: 'O motivo clínico das restrições não é informado nesta relação. Esta folha '
        + 'substitui a anterior; em caso de dúvida, confirme com a Enfermagem antes de servir.',
    };
  }

  /**
   * 3. SOLICITAÇÃO DE CESTA BÁSICA.
   *
   * A criança vai passar dias com a família e leva a cesta. A folha diz para
   * quem, quando e quanto — e **não diz por que a família precisa dela**. A
   * situação socioeconômica de uma família não é informação de cozinha.
   */
  async folhaDeCestas(user: AuthenticatedUser, houseId: string,
                      de: string, ate: string): Promise<Folha> {
    const todos = await this.pedidos(user, houseId, de, ate);
    const abertos = todos.filter((p) => p.tipo === 'cesta_basica' && p.status === 'aberto');
    const casa = await this.rotuloDaCasa(user, houseId);

    return {
      titulo: 'Solicitação de cesta básica',
      subtitulo: casa,
      identificacao: [
        { rotulo: 'Período', valor: `${diaBR(de)} a ${diaBR(ate)}` },
        { rotulo: 'Cestas solicitadas', valor: String(abertos.length) },
      ],
      secoes: [{
        titulo: 'Cestas para acompanhamento familiar',
        tabela: {
          cabecalho: ['Data', 'Acolhido', 'Qtd.', 'Finalidade', 'Entregar a', 'Solicitado por'],
          linhas: abertos.map((p) => [
            diaBR(p.em), p.paraQuem, String(p.quantidade),
            p.finalidade, p.entregarA ?? '—', p.pedidoPor,
          ]),
        },
        procedencia: 'Pedidos registrados pela equipe da casa no período.',
      }],
      geradoPor: user.fullName,
      cargo: cargoNoDocumento(user.role),
      assinatura: true,
      ressalva: 'Registro de entrega de cestas básicas para acompanhamento familiar. Não '
        + 'descreve a situação socioeconômica da família.',
    };
  }

  /* ---------------- Exportar (registra a saída) ---------------- */

  async exportarLanches(user: AuthenticatedUser, input: {
    houseId: string; de: string; ate: string; finalidade: string;
  }) {
    const folha = await this.folhaDeLanches(user, input.houseId, input.de, input.ate);
    return this.documentos.exportar(user, folha, {
      entidade: 'cozinha_lanche', houseId: input.houseId, finalidade: input.finalidade ?? '',
    });
  }

  async exportarRestricoes(user: AuthenticatedUser, input: {
    houseId: string; finalidade: string;
  }) {
    const folha = await this.folhaDeRestricoes(user, input.houseId);
    return this.documentos.exportar(user, folha, {
      entidade: 'cozinha_restricoes', houseId: input.houseId, finalidade: input.finalidade ?? '',
    });
  }

  async exportarCestas(user: AuthenticatedUser, input: {
    houseId: string; de: string; ate: string; finalidade: string;
  }) {
    const folha = await this.folhaDeCestas(user, input.houseId, input.de, input.ate);
    return this.documentos.exportar(user, folha, {
      entidade: 'cozinha_cesta', houseId: input.houseId, finalidade: input.finalidade ?? '',
    });
  }

  /*
   * O ALCANCE É CONFERIDO ANTES, e não deduzido do rótulo (fase 154).
   *
   * `app_house_label` filtra por instituição, não por alcance. As três folhas
   * leem as crianças sob o RLS de quem pede, e fora do alcance o RLS devolve
   * zero linhas: a folha da Casa 03 pedida pela Casa 04 saía com o título certo
   * e *"Crianças com restrição: 0"* — que se lê como "ninguém aqui tem
   * restrição", e não como "não é sua". Numa folha que vai para a cozinha, é a
   * pior leitura possível. É a mesma conferência da escala e da grade do remédio
   * (regra 12), e todas as folhas daqui passam por este ponto.
   */
  /** A lista e o resumo dos pedidos passam pela mesma pergunta (fase 169):
   *  à casa de fora respondiam "nenhum pedido", e não "não é sua". */
  private async casaNoAlcance(user: AuthenticatedUser, houseId: string) {
    const pode = await this.db.asUser(user.id, async (c) => {
      const { rows: [e] } = await c.query(`SELECT app_house_in_scope($1) AS pode`, [houseId]);
      return !!e?.pode;
    });
    if (!pode) throw new NotFoundException('Unidade não encontrada — ou fora do seu alcance.');
  }

  private async rotuloDaCasa(user: AuthenticatedUser, houseId: string) {
    const rotulo = await this.db.asUser(user.id, async (c) => {
      const { rows: [e] } = await c.query(`SELECT app_house_in_scope($1) AS pode`, [houseId]);
      if (!e?.pode) return null;
      const { rows: [r] } = await c.query(`SELECT app_house_label($1) AS r`, [houseId]);
      return (r?.r as string | null) ?? '';
    });
    if (rotulo === null) throw new NotFoundException('Unidade não encontrada — ou fora do seu alcance.');
    return rotulo;
  }
}
