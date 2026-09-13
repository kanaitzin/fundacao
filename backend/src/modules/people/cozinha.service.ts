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
    });
  }

  async pedir(user: AuthenticatedUser, input: {
    houseId: string; tipo: string; personId?: string | null; em: string;
    quantidade: number; finalidade: string; observacao?: string; entregarA?: string;
  }) {
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

  async cancelar(user: AuthenticatedUser, id: string, motivo: string) {
    try {
      await this.db.asUser(user.id, async (c) => {
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
      entity: 'kitchen_request', entityId: id, detail: { motivo },
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
            cabecalho: ['Dia', 'Para quem', 'Qtd.', 'Para quê', 'Entregar a', 'Pediu'],
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
            cabecalho: ['Dia', 'Para quem', 'Qtd.', 'Motivo do cancelamento'],
            linhas: linhas.filter((p) => p.status === 'cancelado').map((p) => [
              diaBR(p.em), p.paraQuem, String(p.quantidade), p.motivoCancelamento ?? '—',
            ]),
          },
          procedencia: 'Cancelamentos registrados no sistema, com o motivo escrito.',
        }] : []),
      ],
      geradoPor: user.fullName,
      cargo: cargoNoDocumento(user.role),
      assinatura: true,
      ...(abertos.length === 0
        ? { ressalva: 'Não há lanche solicitado para este período. A folha vazia significa '
            + 'que ninguém pediu — não que o pedido se perdeu.' }
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
        { rotulo: 'Crianças com restrição', valor: String(rows.length) },
      ],
      secoes: [{
        titulo: 'O que não pode ser servido',
        tabela: {
          cabecalho: ['Criança', 'Evitar', 'Servir no lugar', 'Orientação'],
          linhas: rows.map((r) => [
            r.nome, r.restriction, r.substitution ?? '—', r.guidance ?? '—',
          ]),
        },
        procedencia: 'Prontuário de saúde da casa, escrito pela equipe técnica e pela '
          + 'Enfermagem. Esta folha é uma vista dele — não uma cópia editável.',
      }],
      geradoPor: user.fullName,
      cargo: cargoNoDocumento(user.role),
      assinatura: true,
      ressalva: 'Esta folha não traz o motivo médico de nenhuma restrição, de propósito. '
        + 'Ela vale até ser substituída: em caso de dúvida, confirme com a Enfermagem antes '
        + 'de servir.',
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
          cabecalho: ['Dia', 'Acolhido', 'Qtd.', 'Finalidade', 'Entregar a', 'Pediu'],
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
      ressalva: 'Esta folha registra a saída da cesta. Ela não descreve a situação da '
        + 'família, e não deve ser usada para isso.',
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

  private async rotuloDaCasa(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(`SELECT app_house_label($1) AS r`, [houseId]);
      return r?.r ?? '';
    });
  }
}
