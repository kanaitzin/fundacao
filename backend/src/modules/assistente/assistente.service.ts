import {
  BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { FERRAMENTAS, NOMES_DAS_FERRAMENTAS } from './ferramentas';
import { GUIA_DA_ACOLHE, contexto, ContextoDaConversa } from './guia';

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
 */
const MODELO_PADRAO = 'claude-opus-5-5';
const MAX_MENSAGENS = 80;
const TIPOS_DE_BLOCO = new Set([
  'text', 'image', 'document', 'tool_use', 'tool_result', 'thinking', 'redacted_thinking', 'fallback',
]);
/** Para a conta não ser gasta por um laço: trinta pedidos a cada cinco minutos, por pessoa. */
const LIMITE = { pedidos: 30, janelaMs: 5 * 60_000 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PedidoDeConversa {
  mensagens?: unknown;
  contexto?: { casaId?: unknown; casaNome?: unknown; tela?: unknown; telas?: unknown; voz?: unknown };
}

@Injectable()
export class AssistenteService {
  private readonly log = new Logger('AcolheAI');
  private readonly uso = new Map<string, number[]>();

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private ligada() { return !!process.env.ANTHROPIC_API_KEY?.trim(); }
  private modelo() { return process.env.ACOLHE_AI_MODELO?.trim() || MODELO_PADRAO; }

  estado() {
    return { ligada: this.ligada(), nome: 'Acolhe+AI', ferramentas: NOMES_DAS_FERRAMENTAS };
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

  async conversar(user: AuthenticatedUser, pedido: PedidoDeConversa) {
    const mensagens = this.conferirMensagens(pedido?.mensagens);
    if (!this.ligada()) {
      throw new ServiceUnavailableException('A Acolhe+AI ainda não foi ligada nesta instalação: ela responde só pelo guia.');
    }
    if (!this.dentroDoLimite(user.id)) {
      throw new ServiceUnavailableException('Muitas perguntas seguidas. Espere um minuto e tente de novo.');
    }
    const ctx = pedido?.contexto ?? {};
    const casaId = await this.casaConferida(user, ctx.casaId);
    const texto = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

    const cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 1 });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      resposta = await cliente.beta.messages.create({
        model: this.modelo(),
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: [
          { type: 'text', text: GUIA_DA_ACOLHE, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: contexto({
            pessoa: user.fullName, cargo: user.role,
            casa: casaId ? { id: casaId, nome: texto(ctx.casaNome, 80) ?? 'a casa aberta' } : null,
            tela: texto(ctx.tela, 60), hoje: hojeNaInstituicao(),
            telas: this.conferirTelas(ctx.telas), voz: texto(ctx.voz, 40),
          }) },
        ],
        tools: JSON.parse(JSON.stringify(FERRAMENTAS)) as Anthropic.Beta.BetaTool[],
        messages: mensagens,
      });
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

    const ferramentas = resposta.content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use').map((b) => b.name);
    await this.audit.log({
      action: 'assistente.conversa', actorId: user.id, houseId: casaId,
      detail: {
        turnos: mensagens.length, ferramentas, parada: resposta.stop_reason,
        entrada: resposta.usage?.input_tokens ?? null, saida: resposta.usage?.output_tokens ?? null,
        cache: resposta.usage?.cache_read_input_tokens ?? null,
      },
    });

    if (resposta.stop_reason === 'refusal') {
      return { conteudo: [{ type: 'text', text: 'Com isso eu não consigo ajudar. Se for algo sobre uma criança, fale com a coordenação ou a equipe técnica da casa.' }], parada: 'refusal', guardar: false };
    }
    return { conteudo: resposta.content, parada: resposta.stop_reason, guardar: true };
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
}
