import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * RELATOS INDEPENDENTES (§12.2, §13.4).
 *
 * Cada profissional informa o que presenciou, com as próprias palavras. O
 * sistema não concilia versões nem escolhe a "verdadeira": guarda todas,
 * atribuídas e imutáveis, e entrega o conjunto a quem tem função de analisar.
 *
 * O que ESTE serviço nunca faz: comparar relatos automaticamente, apontar
 * contradição, pontuar credibilidade ou concluir qualquer coisa. Isso é
 * trabalho humano e está fora do sistema por decisão (§3.3).
 */
@Injectable()
export class StatementsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Opções de testemunho — as mesmas na passagem e na ocorrência. */
  async opcoes() {
    // Vocabulário fixo, sem dado de pessoa: não precisa de identidade.
    const { rows } = await this.db.query(
      `SELECT code, label, pendente FROM witness_option ORDER BY ordem`);
    return rows.map((r) => ({ code: r.code, label: r.label, pendente: r.pendente as boolean }));
  }

  async create(user: AuthenticatedUser, input: {
    houseId: string; context: string; entity: string; entityId: string;
    personId?: string | null; witness: string; body: string;
    restrito?: boolean; complementaId?: string | null;
    happenedAt?: string; offline?: boolean; clientOpId?: string;
  }) {
    const opcoes = await this.opcoes();
    const opcao = opcoes.find((o) => o.code === input.witness);
    if (!opcao) {
      throw new BadRequestException(
        `Informe como você participou do fato: ${opcoes.map((o) => o.label).join('; ')}.`);
    }
    // "Sem informação adicional" é uma resposta legítima e dispensa texto.
    // As demais afirmam algo sobre um fato e precisam dizer o quê.
    const exigeTexto = input.witness !== 'sem_informacao_adicional';
    if (exigeTexto && (input.body ?? '').trim().length < 10) {
      throw new BadRequestException(
        'Descreva o fato observado. Registre o que aconteceu, não uma avaliação da pessoa.');
    }

    const id = await this.db.asUser(user.id, async (c) => {
      if (input.clientOpId) {
        const { rows: [dup] } = await c.query(
          `SELECT id FROM statement WHERE client_op_id = $1`, [input.clientOpId]);
        if (dup) return dup.id as string;
      }
      const { rows: [r] } = await c.query(
        `INSERT INTO statement (house_id, context, entity, entity_id, person_id, author_id,
           witness, body, restricted, supplements_id, happened_at, offline, client_op_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, coalesce($11::timestamptz, now()), $12,$13)
         RETURNING id`,
        [input.houseId, input.context, input.entity, input.entityId,
         input.personId ?? null, user.id, input.witness, (input.body ?? '').trim(),
         input.restrito ?? true, input.complementaId ?? null,
         input.happenedAt ?? null, input.offline ?? false, input.clientOpId ?? null]);
      return r.id as string;
    });

    await this.audit.log({
      action: 'statement.create', actorId: user.id, houseId: input.houseId,
      entity: 'statement', entityId: id,
      // Metadados apenas — o conteúdo do relato nunca vai para o log (§20).
      detail: { contexto: input.context, sobre: input.entity, testemunho: input.witness,
                restrito: input.restrito ?? true, complemento: !!input.complementaId },
    });

    return {
      id,
      testemunho: opcao.label,
      restrito: input.restrito ?? true,
      pendenteDeComplemento: opcao.pendente,
      aviso: opcao.pendente
        ? 'Registrado como pendente de complemento. O original permanece; o complemento entra como novo registro.'
        : 'Registro gravado. O original não pode ser reescrito — correções entram como complemento.',
    };
  }

  /**
   * Relatos de um fato. O que cada um enxerga já vem decidido pelo banco:
   * o autor vê o seu, a equipe técnica vê todos lado a lado, o colega vê
   * apenas o que não é narrativa pessoal (§26.2 #11 e #12).
   */
  async listFor(user: AuthenticatedUser, entity: string, entityId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT s.id, s.witness, w.label AS testemunho, s.body, s.restricted,
                s.happened_at, s.created_at, s.supplements_id, s.person_id,
                app_user_display_name(s.author_id) AS autor,
                (s.author_id = app_current_user()) AS meu
         FROM statement s JOIN witness_option w ON w.code = s.witness
         WHERE s.entity = $1 AND s.entity_id = $2
         ORDER BY s.happened_at, s.created_at`, [entity, entityId]);
      return rows;
    });

    /*
     * O líder do turno entrou aqui depois do ensaio de uso.
     *
     * Quem está com a criança às 23h precisa saber o que a equipe técnica
     * registrou sobre ela — não para avaliar ninguém, mas para não repetir uma
     * pergunta que já feriu, ou para entender por que ela não quer dormir no
     * quarto de sempre. Educador e enfermagem seguem fora, e o Gestor Geral
     * continua precisando da leitura excepcional com finalidade (§26.2 #29).
     */
    const ladoALado = ['equipe_tecnica', 'coordenador', 'lider_diurno', 'lider_noturno_geral']
      .includes(user.role);
    if (ladoALado && rows.length) {
      await this.audit.log({
        action: 'statement.read_side_by_side', actorId: user.id,
        /* A casa vem do PRIMEIRO relato: todos os relatos de um mesmo fato são
           da mesma casa, e a leitura lado a lado é um ato dela (fase 149). */
        houseId: await this.audit.casaDoRegistro(user.id, 'statement', rows[0].id),
        entity, entityId, detail: { relatos: rows.length },
      });
    }

    return {
      // A tela precisa saber POR QUE a lista tem o tamanho que tem.
      modo: ladoALado ? 'lado_a_lado' : 'restrito_ao_proprio',
      nota: ladoALado
        ? 'Todos os relatos deste fato, na ordem em que aconteceram. Nenhum foi alterado.'
        : 'Você vê o seu relato e os registros abertos à equipe. Narrativas pessoais de colegas não são exibidas.',
      relatos: rows.map((r) => ({
        id: r.id, autor: r.autor, meu: r.meu,
        testemunho: r.testemunho, codigoTestemunho: r.witness,
        relato: r.body, restrito: r.restricted,
        acolhidoId: r.person_id,
        quando: r.happened_at, registradoEm: r.created_at,
        complementaId: r.supplements_id,
      })),
    };
  }

  /**
   * O QUE SE ESCREVEU SOBRE ESTA CRIANÇA — e o que este papel não pode abrir.
   *
   * `statement.person_id` era gravado desde a 0300 e **nunca lido por pessoa**.
   * A varredura de 15/09 o listou como ponta solta e o §9 o manteve fechado de
   * propósito, esperando uma resposta: listar por criança tudo o que se
   * escreveu SOBRE ela é exatamente a narrativa que o §26.2 protege.
   *
   * A resposta veio em 20/09 e é **só a contagem** (§10 item 6). Então:
   *
   *  * quem ALCANÇA lê — e quem alcança é a policy que diz, não este método.
   *    A consulta abaixo não tem cláusula de cargo nenhuma; ela pergunta pelos
   *    relatos da criança e recebe de volta os que existem para quem perguntou.
   *    É o banco que faz o recorte, e é por isso que ele não pode vazar aqui;
   *  * quem NÃO alcança recebe um NÚMERO — nem data, nem autor, nem trecho. Ele
   *    sabe que há o que pedir, e não sabe de quê antes de escrever a
   *    finalidade.
   *
   * E ela NÃO CONTA NADA sobre a criança além disso: nem relatos por mês, nem
   * quantos autores, nem tendência. Um número desses na tela de uma criança de
   * doze anos é o começo de uma ficha de comportamento (regra 3), e a contagem
   * de restritos só existe porque esconder que existem faria a equipe procurar
   * noutro lugar.
   */
  async porPessoa(user: AuthenticatedUser, personId: string) {
    const data = await this.db.asUser(user.id, async (c) => {
      /* Fora do escopo o RLS não devolve a linha, e 404 é a resposta certa:
         "não encontrei" e "não é da sua casa" precisam ser indistinguíveis
         para quem pergunta de fora. */
      const { rows: [pessoa] } = await c.query(
        `SELECT id, coalesce(nullif(social_name,''), full_name) AS nome FROM person WHERE id = $1`,
        [personId]);
      if (!pessoa) return null;
      const { rows } = await c.query(
        `SELECT s.id, s.context, s.entity, s.entity_id, s.witness, w.label AS testemunho,
                s.body, s.restricted, s.happened_at, s.created_at,
                app_user_display_name(s.author_id) AS autor,
                (s.author_id = app_current_user()) AS meu
           FROM statement s JOIN witness_option w ON w.code = s.witness
          WHERE s.person_id = $1
          ORDER BY s.happened_at DESC, s.created_at DESC`, [personId]);
      const { rows: [r] } = await c.query(
        `SELECT app_count_restricted_statements($1) AS n`, [personId]);
      /*
       * O QUE O GESTOR GERAL PODE ABRIR (1420, decisão de 21/09).
       *
       * Número de ordem e identificador, e nada mais — a função se recusa a
       * devolver data, autor ou trecho, e devolve VAZIO para qualquer outro
       * cargo. Para a equipe técnica e a coordenação a lista volta vazia porque
       * elas já leem o relato acima, na lista normal: oferecer-lhes um botão de
       * "abrir excepcionalmente" transformaria leitura de rotina em ato
       * excepcional, que é o contrário do que o §26.2 protege.
       */
      const { rows: aAbrir } = await c.query(
        `SELECT * FROM app_relatos_restritos_para_abrir($1)`, [personId]);
      return { pessoa, rows, restritos: r.n as number, aAbrir };
    });
    if (!data) throw new NotFoundException('Criança não encontrada.');

    /* Ler o que a equipe técnica escreveu sobre uma criança é ato, e fica com
       nome — a mesma razão que faz a leitura lado a lado da `listFor` ser
       registrada. Só registra se havia o que ler. */
    if (data.rows.some((r: any) => r.restricted && !r.meu)) {
      await this.audit.log({
        action: 'statement.read_by_person', actorId: user.id, institutionId: user.institutionId,
        houseId: await this.audit.casaDoAcolhido(user.id, personId),
        entity: 'person', entityId: personId, detail: { relatos: data.rows.length },
      });
    }

    return {
      acolhidoId: data.pessoa.id,
      nome: data.pessoa.nome,
      relatos: data.rows.map((r: any) => ({
        id: r.id, contexto: r.context, entidade: r.entity, entidadeId: r.entity_id,
        autor: r.autor, meu: r.meu,
        testemunho: r.testemunho, codigoTestemunho: r.witness,
        relato: r.body, restrito: r.restricted,
        quando: r.happened_at, registradoEm: r.created_at,
      })),
      /** Número, e só. A tela escreve "existem N relatos em área restrita". */
      restritos: data.restritos,
      /*
       * E, para quem pode abrir, POR ONDE (1420). Uma entrada por relato, em vez
       * de um botão que abrisse todos: cada abertura leva a sua própria
       * finalidade e o seu próprio registro, e quem ler a auditoria depois sabe
       * de qual narrativa ele precisava. *"Gestor abrir o que quiser"* —
       * 21/09/2026.
       */
      paraAbrir: (data.aAbrir ?? []).map((r: any) => ({
        ordem: r.out_ordem as number, id: r.out_id as string,
      })),
      /* Uma frase, e não "N relato(s)": quem lê isto às 23h merece português,
         e a parte que importa — que abrir é um ato com o nome dela — vem
         depois do número, onde ela ainda lê. */
      nota: data.restritos
        ? (data.restritos === 1
            ? 'Existe 1 relato em área restrita sobre esta criança. '
            : `Existem ${data.restritos} relatos em área restrita sobre esta criança. `)
          + 'Abrir exige finalidade escrita, e o acesso fica registrado com o seu nome.'
        : 'Todos os relatos que existem sobre esta criança estão nesta lista.',
    };
  }

  /**
   * Leitura excepcional pelo Gestor Geral, com finalidade declarada (§26.2 #29).
   * A checagem e o registro acontecem dentro do comando: não há rota que
   * devolva o conteúdo sem antes gravar quem leu, o quê e para quê.
   */
  async readExceptional(user: AuthenticatedUser, id: string, finalidade: string) {
    try {
      const row = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `SELECT * FROM app_read_statement($1, $2)`, [id, finalidade ?? '']);
        return r;
      });
      return {
        id: row.id, relato: row.body, testemunho: row.witness,
        quando: row.happened_at,
        finalidadeRegistrada: finalidade.trim(),
        aviso: 'Leitura excepcional registrada em auditoria, com a finalidade informada.',
      };
    } catch (e: any) {
      const m = e?.message ?? '';
      if (m.includes('finalidade_insuficiente')) {
        throw new BadRequestException(
          'Descreva a finalidade da leitura (mínimo 15 caracteres). Ela fica registrada junto com o acesso.');
      }
      if (m.includes('acesso_excepcional_negado')) {
        throw new ForbiddenException(
          'Narrativa pessoal não é dado de gestão. A leitura lado a lado cabe à equipe técnica e à coordenação.');
      }
      if (m.includes('relato_inexistente')) throw new NotFoundException('Relato não encontrado.');
      throw e;
    }
  }

  /** Quantos relatos existem sobre um fato — usado por plantão e ocorrências. */
  async countFor(user: AuthenticatedUser, entity: string, entityId: string): Promise<number> {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT count(*)::int AS n FROM statement WHERE entity = $1 AND entity_id = $2`,
        [entity, entityId]);
      return r.n as number;
    });
  }
  /** O que ESTA pessoa precisa responder — a cobrança que sobra do turno. */
  async minhasCobrancas(user: AuthenticatedUser) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_minhas_cobrancas()`);
      return rows.map((r) => ({
        id: r.id, casaId: r.house_id, contexto: r.context,
        entidade: r.entity, entidadeId: r.entity_id,
        pergunta: r.prompt, abertaEm: r.opened_at,
      }));
    });
  }

  /**
   * Quem já respondeu e quem falta, numa ocorrência.
   *
   * Devolve NOME e ESTADO, nunca o texto de ninguém: quem organiza o turno
   * precisa saber quem falta, não o que os outros escreveram.
   */
  async cobrancasDa(user: AuthenticatedUser, entidade: string, entidadeId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM app_cobrancas_da_ocorrencia($1,$2)`, [entidade, entidadeId]);
      return rows.map((r) => ({
        userId: r.user_id, quem: r.quem, respondeu: r.respondeu,
        quando: r.quando, origem: r.origem,
      }));
    });
  }

}
