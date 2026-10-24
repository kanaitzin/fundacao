import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { MAXIMO_DE_ANEXOS_POR_MENSAGEM, recusaDosAnexos } from '../../kernel/arquivos/anexos-da-mensagem.regra';
import { FERRAMENTAS, NOMES_DAS_FERRAMENTAS } from './ferramentas';
import { GUIA_DA_ACOLHE, contexto, ContextoDaConversa, guiaDoCargo } from './guia';
import {
  FilaCheia, FilaDoModelo, MotorLocalFalhou, MensagemDaConversa,
  daRespostaAberta, ferramentasAbertas, janelaCurta, letrasDoTexto, paraOPadraoAberto, perguntarAoMotorLocal,
} from './motor-local';

/**
 * A ACOLHE+AI (fase 192; pedido e decisões de 08/10).
 *
 * O servidor é um repasse com a chave: recebe a conversa que mora na tela,
 * junta o guia fixo e o contexto de quem fala, chama o modelo UMA vez e devolve
 * o que ele respondeu. Quando o modelo pede uma ferramenta, quem a executa é a
 * tela (`ferramentas.ts` diz por quê), que volta com o resultado na próxima
 * chamada. Nada da conversa é guardado nem vai para o log: só o metadado vai à
 * auditoria (quantos turnos, que ferramentas, quantos tokens).
 *
 * Desligada enquanto a instalação não tiver a `ANTHROPIC_API_KEY`. Sem ela a
 * tela responde pelo guia, sem modelo, e diz isso.
 *
 * DOIS MOTORES (fase 239). Com `ACOLHE_AI_MOTOR=local`, a conversa vai a um
 * modelo aberto no computador do Pão (`motor-local.ts`), sem custo por pergunta
 * e sem limite por pessoa: as perguntas esperam a vez numa fila. Sem a
 * variável, continua o Claude, com a chave. A tela não sabe a diferença: a
 * conversa, as ferramentas e a auditoria são as mesmas.
 *
 * O QUE VAI AO MODELO NÃO MUDA NO MEIO DA CONVERSA (fase 223). O raciocínio do
 * modelo fica preso à conversa exata em que nasceu: se as instruções, as
 * ferramentas ou uma mensagem anterior mudam, o raciocínio anterior deixa de
 * valer, e em conta nova a pergunta é recusada. Por isso as instruções levam só
 * o que é fixo (o guia, quem conversa, as telas do cargo), e o que muda (hora,
 * turno, tela, casa, voz) vai na nota que a tela escreve no começo de cada
 * pergunta (`momento.ts`). E, se mesmo assim algo mudar, o raciocínio que não
 * vale mais é tirado em vez de a conversa parar (`drop_block`), e a auditoria
 * conta quantos saíram: número acima de zero é defeito a procurar.
 */
const MODELO_PADRAO = 'claude-opus-5-5';
const MAX_MENSAGENS = 80;
const TIPOS_DE_BLOCO = new Set([
  'text', 'image', 'document', 'tool_use', 'tool_result', 'thinking', 'redacted_thinking', 'fallback',
]);
/** Para a conta não ser gasta por um laço: trinta pedidos a cada cinco minutos, por pessoa. */
const LIMITE = { pedidos: 30, janelaMs: 5 * 60_000 };

/** O que cada motor devolve, na forma da conversa. */
interface Resultado {
  content: { type: string; [k: string]: unknown }[];
  stop_reason: string | null;
  entrada: number | null; saida: number | null; cache: number | null;
  raciocinioTirado: number; descartadas: number;
  /** Só no computador do Pão: o modelo leu menos do que recebeu. */
  janelaCurta?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PedidoDeConversa {
  mensagens?: unknown;
  contexto?: { casaId?: unknown; casaNome?: unknown; tela?: unknown; telas?: unknown; voz?: unknown };
}

/**
 * A marca de cache na última pergunta: a conversa só cresce, então tudo o que
 * veio antes é lido do cache na pergunta seguinte. Cópia rasa, para não mexer
 * no que a tela mandou; texto puro vira bloco, que é o mesmo conteúdo.
 */
function comCache(m: Anthropic.Beta.BetaMessageParam[]): Anthropic.Beta.BetaMessageParam[] {
  const ultima = m[m.length - 1];
  const blocos = typeof ultima.content === 'string'
    ? [{ type: 'text' as const, text: ultima.content }]
    : [...ultima.content];
  const i = blocos.length - 1;
  if (i < 0 || blocos[i].type === 'thinking' || blocos[i].type === 'redacted_thinking') return m;
  blocos[i] = { ...blocos[i], cache_control: { type: 'ephemeral' } } as typeof blocos[number];
  return [...m.slice(0, -1), { ...ultima, content: blocos }];
}

@Injectable()
export class AssistenteService {
  private readonly log = new Logger('AcolheAI');
  private readonly uso = new Map<string, number[]>();

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private fila: FilaDoModelo | null = null;

  private motor(): 'local' | 'claude' { return process.env.ACOLHE_AI_MOTOR?.trim() === 'local' ? 'local' : 'claude'; }
  private ligada() {
    return this.motor() === 'local'
      ? !!(process.env.ACOLHE_AI_LOCAL_URL?.trim() && process.env.ACOLHE_AI_LOCAL_MODELO?.trim())
      : !!process.env.ANTHROPIC_API_KEY?.trim();
  }
  private modelo() { return process.env.ACOLHE_AI_MODELO?.trim() || MODELO_PADRAO; }
  private numero(nome: string, padrao: number, min: number, max: number) {
    const n = Number(process.env[nome]);
    return Number.isInteger(n) && n >= min && n <= max ? n : padrao;
  }
  /** A fila nasce na primeira pergunta, com o tamanho que a instalação disser. */
  private filaDoModelo() {
    this.fila ??= new FilaDoModelo(
      this.numero('ACOLHE_AI_LOCAL_SIMULTANEAS', 2, 1, 16), this.numero('ACOLHE_AI_LOCAL_FILA', 40, 0, 500));
    return this.fila;
  }

  estado() {
    return { ligada: this.ligada(), nome: 'Acolhe+AI', ferramentas: NOMES_DAS_FERRAMENTAS, motor: this.motor() };
  }

  /** A casa só vai para a auditoria se quem fala a alcança. */
  private async casaConferida(user: AuthenticatedUser, casaId: unknown): Promise<string | null> {
    if (typeof casaId !== 'string' || !UUID.test(casaId)) return null;
    const { rows: [r] } = await this.db.asUser(user.id, (c) =>
      c.query(`SELECT app_house_in_scope($1) AS ok`, [casaId]));
    return r?.ok ? casaId : null;
  }

  private conferirMensagens(m: unknown): Anthropic.Beta.BetaMessageParam[] {
    if (!Array.isArray(m) || m.length === 0) throw new BadRequestException('A conversa veio vazia.');
    if (m.length > MAX_MENSAGENS) {
      throw new BadRequestException('A conversa ficou longa demais. Comece uma conversa nova.');
    }
    const saida: Anthropic.Beta.BetaMessageParam[] = [];
    for (const item of m) {
      const msg = item as { role?: unknown; content?: unknown };
      /* Só pessoa e assistente: o canal de instrução do sistema é do servidor. */
      if (msg?.role !== 'user' && msg?.role !== 'assistant') {
        throw new BadRequestException('A conversa tem uma mensagem que não é da pessoa nem da assistente.');
      }
      if (typeof msg.content === 'string') {
        if (!msg.content.trim()) throw new BadRequestException('Há uma mensagem vazia na conversa.');
      } else if (Array.isArray(msg.content)) {
        for (const b of msg.content as { type?: unknown }[]) {
          if (!b || typeof b.type !== 'string' || !TIPOS_DE_BLOCO.has(b.type)) {
            throw new BadRequestException('A conversa tem um conteúdo que a assistente não aceita.');
          }
        }
        /* Até dez fotos ou documentos por mensagem (fase 233), a mesma regra das
           outras mensagens com anexo. Conta só o que a pessoa mandou: o que volta
           de uma ferramenta vem dentro do resultado dela. */
        const anexados = (msg.content as { type: string }[]).filter((b) => b.type === 'image' || b.type === 'document');
        if (msg.role === 'user' && anexados.length > MAXIMO_DE_ANEXOS_POR_MENSAGEM) {
          throw new BadRequestException(recusaDosAnexos(anexados.map(() => 0)) ?? '');
        }
      } else {
        throw new BadRequestException('Há uma mensagem sem conteúdo na conversa.');
      }
      saida.push(msg as Anthropic.Beta.BetaMessageParam);
    }
    if (saida[saida.length - 1].role !== 'user') {
      throw new BadRequestException('A conversa tem de terminar com a pessoa.');
    }
    return saida;
  }

  private conferirTelas(t: unknown): ContextoDaConversa['telas'] {
    if (!Array.isArray(t)) return [];
    return t.slice(0, 60).flatMap((x) => {
      const o = x as { chave?: unknown; titulo?: unknown; frase?: unknown };
      if (typeof o?.chave !== 'string' || typeof o?.titulo !== 'string') return [];
      return [{ chave: o.chave.slice(0, 40), titulo: o.titulo.slice(0, 80),
        frase: typeof o.frase === 'string' ? o.frase.slice(0, 160) : undefined }];
    });
  }

  private dentroDoLimite(userId: string) {
    const agora = Date.now();
    const lista = (this.uso.get(userId) ?? []).filter((t) => agora - t < LIMITE.janelaMs);
    if (lista.length >= LIMITE.pedidos) return false;
    lista.push(agora);
    this.uso.set(userId, lista);
    return true;
  }

  /** O Claude, com a chave (fase 192). */
  private async perguntarAoClaude(
    instrucoes: string[], mensagens: Anthropic.Beta.BetaMessageParam[], aoEscrever?: (texto: string) => void,
  ): Promise<Resultado> {
    const cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 1 });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      const pedido: Anthropic.Beta.MessageCreateParamsNonStreaming = {
        model: this.modelo(),
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01', 'thinking-binding-controls-2026-08-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
        output_config: { effort: 'medium' },
        system: [
          { type: 'text', text: instrucoes[0] },
          { type: 'text', text: instrucoes[1], cache_control: { type: 'ephemeral' } },
        ],
        tools: JSON.parse(JSON.stringify(FERRAMENTAS)) as Anthropic.Beta.BetaTool[],
        messages: comCache(mensagens),
      };
      if (aoEscrever) {
        /* Em pedaços: o texto de cada bloco vai saindo, com os blocos já
           terminados na frente, e a resposta inteira é a de sempre. */
        const fluxo = cliente.beta.messages.stream(pedido);
        let anteriores = '';
        fluxo.on('text', (_parte, atual) => aoEscrever(anteriores + atual));
        fluxo.on('contentBlock', (b) => { if (b.type === 'text') anteriores += `${b.text}\n`; });
        resposta = await fluxo.finalMessage();
      } else {
        resposta = await cliente.beta.messages.create(pedido);
      }
    } catch (e) {
      /* O log leva a classe e o status, nunca a conversa. */
      const status = e instanceof Anthropic.APIError ? e.status : undefined;
      this.log.error(`chamada ao modelo falhou: ${(e as Error).name}${status ? ` ${status}` : ''}`);
      if (e instanceof Anthropic.RateLimitError) {
        throw new ServiceUnavailableException('A Acolhe+AI está ocupada agora. Tente em um minuto.');
      }
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new ServiceUnavailableException('A chave da Acolhe+AI nesta instalação foi recusada. Avise a TI.');
      }
      if (e instanceof Anthropic.BadRequestError) {
        throw new BadRequestException('A conversa não pôde ser lida. Comece uma conversa nova.');
      }
      throw new ServiceUnavailableException('A Acolhe+AI não respondeu agora. Tente de novo.');
    }
    return {
      content: resposta.content as unknown as Resultado['content'], stop_reason: resposta.stop_reason,
      entrada: resposta.usage?.input_tokens ?? null, saida: resposta.usage?.output_tokens ?? null,
      cache: resposta.usage?.cache_read_input_tokens ?? null,
      raciocinioTirado: (resposta.input_transformations ?? []).filter((t) => t.type === 'thinking_dropped').length,
      descartadas: 0,
    };
  }

  /** O modelo aberto no computador do Pão (fase 239), na vez da fila. */
  private async perguntarNoPao(
    instrucoes: string[], mensagens: Anthropic.Beta.BetaMessageParam[], aoEscrever?: (texto: string) => void,
  ): Promise<Resultado> {
    const cfg = {
      url: process.env.ACOLHE_AI_LOCAL_URL!.trim(),
      modelo: process.env.ACOLHE_AI_LOCAL_MODELO!.trim(),
      esperaMs: this.numero('ACOLHE_AI_LOCAL_ESPERA_S', 180, 10, 900) * 1000,
      maxTokens: this.numero('ACOLHE_AI_LOCAL_MAX_TOKENS', 4000, 256, 32000),
    };
    const conversa = paraOPadraoAberto(instrucoes, mensagens as unknown as MensagemDaConversa[]);
    let json: unknown;
    try {
      json = await this.filaDoModelo().executar(() => perguntarAoMotorLocal(cfg, conversa, ferramentasAbertas(FERRAMENTAS), aoEscrever));
    } catch (e) {
      /* O log leva a razão e o status, nunca a conversa. */
      if (e instanceof FilaCheia) {
        this.log.warn('motor local: fila cheia');
        throw new ServiceUnavailableException('A Acolhe+AI está atendendo muitas pessoas agora. Tente em um minuto.');
      }
      const f = e instanceof MotorLocalFalhou ? e : new MotorLocalFalhou('sem_conexao');
      this.log.error(`motor local falhou: ${f.motivo}${f.status ? ` ${f.status}` : ''}`);
      if (f.motivo === 'demorou') {
        throw new ServiceUnavailableException('A Acolhe+AI demorou demais para responder. Tente de novo com uma pergunta mais curta.');
      }
      if (f.motivo === 'recusou' && f.status === 400) {
        throw new BadRequestException('A conversa não pôde ser lida. Comece uma conversa nova.');
      }
      if (f.motivo === 'sem_conexao' || f.status === 404) {
        throw new ServiceUnavailableException('O computador da Acolhe+AI não está respondendo. Avise a TI.');
      }
      throw new ServiceUnavailableException('A Acolhe+AI não respondeu agora. Tente de novo.');
    }
    const r = daRespostaAberta(json, NOMES_DAS_FERRAMENTAS);
    if (r.descartadas) this.log.warn(`motor local: ${r.descartadas} pedido(s) de ferramenta ilegível(is) descartado(s)`);
    const curta = janelaCurta(letrasDoTexto(conversa), r.usage.input_tokens);
    if (curta) this.log.warn('motor local: o modelo leu menos que o guia; aumente o OLLAMA_CONTEXT_LENGTH (§12.12)');
    return {
      janelaCurta: curta,
      content: r.content, stop_reason: r.stop_reason,
      entrada: r.usage.input_tokens, saida: r.usage.output_tokens, cache: null, raciocinioTirado: 0,
      descartadas: r.descartadas,
    };
  }

  /**
   * Uma volta da conversa. Com `aoEscrever` (fase 240), o texto da resposta vai
   * saindo enquanto o modelo escreve, e a resposta inteira volta no fim igual.
   */
  async conversar(user: AuthenticatedUser, pedido: PedidoDeConversa, aoEscrever?: (texto: string) => void) {
    const mensagens = this.conferirMensagens(pedido?.mensagens);
    if (!this.ligada()) {
      throw new ServiceUnavailableException('A Acolhe+AI ainda não foi ligada nesta instalação: ela responde só pelo guia.');
    }
    const local = this.motor() === 'local';
    /* No computador do Pão não há conta a gastar: quem segura a máquina é a fila. */
    if (!local && !this.dentroDoLimite(user.id)) {
      throw new ServiceUnavailableException('Muitas perguntas seguidas. Espere um minuto e tente de novo.');
    }
    const ctx = pedido?.contexto ?? {};
    /* A casa conferida vai só para a auditoria: ao modelo ela chega pela nota do momento. */
    const casaId = await this.casaConferida(user, ctx.casaId);
    const telas = this.conferirTelas(ctx.telas);
    const ensinadas = await this.palavrasAprovadas(user);
    /* No computador do Pão, só as telas do cargo (fase 240): o modelo é menor. */
    const instrucoes = [local ? guiaDoCargo(telas.map((x) => x.chave)) : GUIA_DA_ACOLHE, contexto({
      pessoa: user.fullName, cargo: user.role, telas, ensinadas,
    })];

    const r = local
      ? await this.perguntarNoPao(instrucoes, mensagens, aoEscrever)
      : await this.perguntarAoClaude(instrucoes, mensagens, aoEscrever);

    const ferramentas = r.content.filter((b) => b.type === 'tool_use').map((b) => String((b as { name?: unknown }).name));
    await this.audit.log({
      action: 'assistente.conversa', actorId: user.id, houseId: casaId,
      detail: {
        motor: local ? 'local' : 'claude',
        turnos: mensagens.length, ferramentas, parada: r.stop_reason,
        entrada: r.entrada, saida: r.saida, cache: r.cache, raciocinioTirado: r.raciocinioTirado,
        ...(local ? { descartadas: r.descartadas, janelaCurta: !!r.janelaCurta } : {}),
      },
    });

    if (r.stop_reason === 'refusal') {
      return { conteudo: [{ type: 'text', text: 'Com isso eu não consigo ajudar. Se for algo sobre uma criança, fale com a coordenação ou a equipe técnica da casa.' }], parada: 'refusal', guardar: false };
    }
    return { conteudo: r.content, parada: r.stop_reason, guardar: true };
  }

  /** Depois que a pessoa confirmou uma proposta e a gravação deu certo. */
  async registrarPreparado(user: AuthenticatedUser, corpo: { acao?: unknown; entidadeId?: unknown; casaId?: unknown }) {
    if (typeof corpo?.acao !== 'string' || !corpo.acao.startsWith('propor_') || !NOMES_DAS_FERRAMENTAS.includes(corpo.acao)) {
      throw new BadRequestException('Ação desconhecida.');
    }
    const casaId = await this.casaConferida(user, corpo.casaId);
    await this.audit.log({
      action: 'assistente.preparado', actorId: user.id, houseId: casaId,
      entity: corpo.acao.replace(/^propor_/, ''),
      entityId: typeof corpo.entidadeId === 'string' && UUID.test(corpo.entidadeId) ? corpo.entidadeId : undefined,
    });
    return { ok: true };
  }

  /**
   * A pessoa deixou a Acolhe+AI mexer na tela (fase 193). Fica na auditoria,
   * só com a tela: o que ela preencheu e a pessoa salvou fica no registro de
   * sempre, no nome de quem salvou.
   */
  async registrarLicenca(user: AuthenticatedUser, corpo: { tela?: unknown; casaId?: unknown }) {
    const casaId = await this.casaConferida(user, corpo?.casaId);
    const tela = typeof corpo?.tela === 'string' ? corpo.tela.trim().slice(0, 80) : '';
    await this.audit.log({
      action: 'assistente.licenca', actorId: user.id, houseId: casaId,
      entity: 'tela', detail: tela ? { tela } : undefined,
    });
    return { ok: true };
  }

  /**
   * Uma tabela da Acolhe+AI baixada como planilha (fase 193). Baixar é
   * exportar, e exportação fica na auditoria como as outras: quem, quando, de
   * que casa e o tamanho. O conteúdo não, como em toda linha de auditoria.
   */
  async registrarTabela(user: AuthenticatedUser, corpo: { linhas?: unknown; colunas?: unknown; casaId?: unknown }) {
    const n = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : null);
    const linhas = n(corpo?.linhas, 500);
    const colunas = n(corpo?.colunas, 12);
    if (linhas === null || colunas === null) throw new BadRequestException('Tamanho da tabela inválido.');
    const casaId = await this.casaConferida(user, corpo?.casaId);
    await this.audit.log({
      action: 'assistente.tabela', actorId: user.id, houseId: casaId,
      entity: 'planilha', detail: { linhas, colunas },
    });
    return { ok: true };
  }

  // ---------- As sugestões de melhoria ----------

  async sugerir(user: AuthenticatedUser, corpo: { texto?: unknown; tela?: unknown; casaId?: unknown }) {
    const texto = typeof corpo?.texto === 'string' ? corpo.texto.trim() : '';
    if (texto.length < 10) throw new BadRequestException('Escreva a sugestão com pelo menos dez letras.');
    if (texto.length > 4000) throw new BadRequestException('A sugestão passou de 4000 caracteres.');
    const tela = typeof corpo?.tela === 'string' && corpo.tela.trim() ? corpo.tela.trim().slice(0, 80) : null;
    const casaId = await this.casaConferida(user, corpo?.casaId);
    const { rows: [r] } = await this.db.asUser(user.id, (c) => c.query(
      `INSERT INTO assistant_suggestion (author_id, house_id, body, screen)
       VALUES (app_current_user(), $1, $2, $3) RETURNING id, created_at`, [casaId, texto, tela]));
    await this.audit.log({
      action: 'assistente.sugestao', actorId: user.id, houseId: casaId,
      entity: 'assistant_suggestion', entityId: r.id,
    });
    return { id: r.id, criadaEm: r.created_at };
  }

  async sugestoes(user: AuthenticatedUser, casaId?: string) {
    if (casaId !== undefined && !UUID.test(casaId)) throw new BadRequestException('Casa inválida.');
    return this.db.asUser(user.id, async (c) => (await c.query(
      `SELECT s.id, s.body AS texto, s.screen AS tela, s.created_at AS "criadaEm",
              s.house_id AS "casaId", h.name AS casa,
              app_user_display_name(s.author_id) AS autor, app_user_cargo(s.author_id) AS cargo
         FROM assistant_suggestion s
         -- rls-join-ok (house): o nome da casa da sugestão que a política já deixou ler.
         LEFT JOIN house h ON h.id = s.house_id
        WHERE ($1::uuid IS NULL OR s.house_id = $1)
        ORDER BY s.created_at DESC LIMIT 300`, [casaId ?? null])).rows);
  }

  /*
   * AS PALAVRAS QUE A EQUIPE ENSINA (fase 244). Quem conversa propõe; a
   * coordenação da casa, a Coordenação Geral ou o Gestor Geral aprova ou recusa,
   * com o motivo; só a aprovada vale. Esta é a única leitura que a Acolhe+AI faz
   * por conta própria, e é do vocabulário dela, nunca de dado de criança.
   */
  private async palavrasAprovadas(user: AuthenticatedUser): Promise<{ diz: string; querDizer: string }[]> {
    return this.db.asUser(user.id, async (c) => (await c.query(
      `SELECT says AS diz, means AS "querDizer" FROM assistant_word
        WHERE app_palavra_aprovada(id) ORDER BY created_at LIMIT 300`)).rows);
  }

  private decide(user: AuthenticatedUser) { return user.role === 'coordenador' || user.role === 'gestor_geral'; }

  async palavras(user: AuthenticatedUser) {
    const aprovadas = await this.palavrasAprovadas(user);
    const linhas = await this.db.asUser(user.id, async (c) => (await c.query(
      `SELECT w.id, w.says AS diz, w.means AS "querDizer", w.created_at AS "criadaEm", w.house_id AS "casaId",
              app_user_display_name(w.author_id) AS autor, app_user_cargo(w.author_id) AS cargo,
              (w.author_id = app_current_user()) AS minha,
              d.decision AS situacao, d.reason AS motivo, d.created_at AS "decididaEm",
              app_user_display_name(d.decided_by) AS "decididaPor"
         FROM assistant_word w
         -- rls-join-ok (assistant_word_decision): a última decisão da palavra, que a política deixa ler a quem propôs, a quem decide e à TI.
         LEFT JOIN LATERAL (SELECT x.decision, x.reason, x.created_at, x.decided_by FROM assistant_word_decision x
                             WHERE x.word_id = w.id ORDER BY x.created_at DESC, x.id DESC LIMIT 1) d ON true
        WHERE w.author_id = app_current_user() OR app_decide_palavra(w.house_id) OR app_current_role() = 'admin_tecnico'
        ORDER BY w.created_at DESC LIMIT 300`)).rows);
    return {
      aprovadas,
      decide: this.decide(user),
      minhas: linhas.filter((l) => l.minha).map(({ minha: _m, ...l }) => ({ ...l, situacao: l.situacao ?? 'esperando' })),
      paraDecidir: this.decide(user)
        ? linhas.map(({ minha: _m, ...l }) => ({ ...l, situacao: l.situacao ?? 'esperando' })) : [],
    };
  }

  async proporPalavra(user: AuthenticatedUser, corpo: { diz?: unknown; querDizer?: unknown; casaId?: unknown }) {
    const diz = typeof corpo?.diz === 'string' ? corpo.diz.trim().replace(/\s+/g, ' ') : '';
    const querDizer = typeof corpo?.querDizer === 'string' ? corpo.querDizer.trim().replace(/\s+/g, ' ') : '';
    if (diz.length < 2 || diz.length > 60) throw new BadRequestException('Escreva a palavra ou o jeito de dizer, com até 60 letras.');
    if (querDizer.length < 2 || querDizer.length > 160) throw new BadRequestException('Escreva o que ela quer dizer, com até 160 letras.');
    const casaId = await this.casaConferida(user, corpo?.casaId);
    const { rows: [r] } = await this.db.asUser(user.id, (c) => c.query(
      `INSERT INTO assistant_word (author_id, house_id, says, means)
       VALUES (app_current_user(), $1, $2, $3) RETURNING id, created_at`, [casaId, diz, querDizer]));
    /* A auditoria leva só o metadado: o texto da palavra fica na tabela, com o nome de quem ensinou. */
    await this.audit.log({
      action: 'assistente.palavra.proposta', actorId: user.id, houseId: casaId,
      entity: 'assistant_word', entityId: r.id,
    });
    return { id: r.id, criadaEm: r.created_at, situacao: 'esperando' };
  }

  async decidirPalavra(user: AuthenticatedUser, id: string, corpo: { decisao?: unknown; motivo?: unknown }) {
    if (!UUID.test(id)) throw new BadRequestException('Palavra inválida.');
    const decisao = corpo?.decisao === 'aprovar' ? 'aprovada' : corpo?.decisao === 'recusar' ? 'recusada'
      : corpo?.decisao === 'retirar' ? 'retirada' : null;
    if (!decisao) throw new BadRequestException('Diga se aprova, recusa ou retira a palavra.');
    const motivo = typeof corpo?.motivo === 'string' ? corpo.motivo.trim() : '';
    if (decisao !== 'aprovada' && motivo.length < 3) throw new BadRequestException('Escreva o motivo, para quem ensinou saber.');
    if (motivo.length > 400) throw new BadRequestException('O motivo passou de 400 letras.');
    if (!this.decide(user)) throw new ForbiddenException('Quem aprova as palavras é a coordenação ou o Gestor Geral.');
    return this.db.asUser(user.id, async (c) => {
      const { rows: [w] } = await c.query(
        `SELECT w.id, w.house_id, app_decide_palavra(w.house_id) AS pode,
                (SELECT x.decision FROM assistant_word_decision x WHERE x.word_id = w.id
                  ORDER BY x.created_at DESC, x.id DESC LIMIT 1) AS ultima
           FROM assistant_word w WHERE w.id = $1`, [id]);
      if (!w || !w.pode) throw new NotFoundException('Esta palavra não está entre as que você decide.');
      if (decisao !== 'retirada' && w.ultima) throw new ConflictException('Esta palavra já foi decidida.');
      if (decisao === 'retirada' && w.ultima !== 'aprovada') throw new ConflictException('Só se retira palavra aprovada.');
      await c.query(
        `INSERT INTO assistant_word_decision (word_id, decided_by, decision, reason)
         VALUES ($1, app_current_user(), $2, $3)`, [id, decisao, motivo || null]);
      await this.audit.log({
        action: 'assistente.palavra.decisao', actorId: user.id, houseId: w.house_id,
        entity: 'assistant_word', entityId: id, detail: { decisao },
      });
      return { id, situacao: decisao };
    });
  }

}
