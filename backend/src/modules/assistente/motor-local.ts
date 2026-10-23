/**
 * O MOTOR DO COMPUTADOR DO PÃO (fase 239; decisão de 23/10: "só o computador do
 * Pão", sem custo e sem limite por pessoa).
 *
 * A Acolhe+AI conversa com um modelo aberto que roda numa máquina da Fundação,
 * pelo Ollama (ou outro programa que fale o padrão de conversa da OpenAI,
 * `/v1/chat/completions`). Nada sai da rede do Pão, e ninguém paga por pergunta.
 *
 * A tela e o resto do servidor continuam falando a forma de sempre (blocos de
 * texto, pedido de ferramenta e resultado de ferramenta). Este arquivo traduz
 * na ida e na volta, e não importa nada do framework, para a suíte testar a
 * tradução sozinha.
 *
 * SEM LIMITE POR PESSOA, COM FILA. A máquina responde a poucas perguntas ao
 * mesmo tempo; as outras esperam a vez. Só quando a fila enche é que a pessoa
 * ouve que a Acolhe+AI está ocupada.
 */

/** Quando a fila está cheia ou a vez demorou demais. */
export class FilaCheia extends Error {
  constructor() { super('fila cheia'); this.name = 'FilaCheia'; }
}

export class FilaDoModelo {
  private rodando = 0;
  private readonly esperando: (() => void)[] = [];
  private readonly simultaneas: number;
  private readonly maxEsperando: number;

  constructor(simultaneas: number, maxEsperando: number) {
    this.simultaneas = simultaneas;
    this.maxEsperando = maxEsperando;
  }

  get ocupadas() { return this.rodando; }
  get naFila() { return this.esperando.length; }

  async executar<T>(fn: () => Promise<T>): Promise<T> {
    if (this.rodando >= this.simultaneas) {
      if (this.esperando.length >= this.maxEsperando) throw new FilaCheia();
      await new Promise<void>((vez) => this.esperando.push(vez));
    } else {
      this.rodando++;
    }
    try {
      return await fn();
    } finally {
      /* A vez passa direto a quem espera, sem baixar e subir a conta. */
      const proxima = this.esperando.shift();
      if (proxima) proxima(); else this.rodando--;
    }
  }
}

/* A forma da conversa que a tela manda (a mesma do resto do servidor). */
type Bloco = { type: string; [k: string]: unknown };
export interface MensagemDaConversa { role: 'user' | 'assistant'; content: string | Bloco[] }
export interface FerramentaDaConversa { name: string; description: string; input_schema: unknown }

/* A forma do padrão aberto. */
type Parte = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export type MensagemAberta =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | Parte[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ChamadaAberta[] }
  | { role: 'tool'; tool_call_id: string; content: string };
interface ChamadaAberta { id: string; type: 'function'; function: { name: string; arguments: string } }

/** O que o modelo aberto não lê, dito para ele em palavras. */
export const PDF_NAO_LIDO =
  '[A pessoa anexou um PDF. Este modelo não lê PDF: peça que ela abra o anexo e use Ler o texto do papel, ou que mande uma foto da página.]';

function textoDoResultado(b: Bloco): string {
  const c = b.content;
  let texto = '';
  if (typeof c === 'string') texto = c;
  else if (Array.isArray(c)) {
    texto = (c as Bloco[]).map((p) => (p.type === 'text' ? String(p.text ?? '')
      : p.type === 'image' ? '[imagem que este modelo não recebe por aqui]' : '')).filter(Boolean).join('\n');
  }
  return b.is_error ? `A ferramenta falhou: ${texto}` : texto || '(sem resultado)';
}

function parteDaPessoa(b: Bloco): Parte | null {
  if (b.type === 'text') return { type: 'text', text: String(b.text ?? '') };
  const fonte = b.source as { type?: string; media_type?: string; data?: string } | undefined;
  if (b.type === 'image' && fonte?.type === 'base64' && fonte.data) {
    return { type: 'image_url', image_url: { url: `data:${fonte.media_type ?? 'image/jpeg'};base64,${fonte.data}` } };
  }
  if (b.type === 'document') {
    if (fonte?.type === 'text' && fonte.data) return { type: 'text', text: fonte.data };
    return { type: 'text', text: PDF_NAO_LIDO };
  }
  return null; /* raciocínio de outro modelo e marcas internas não vão */
}

/** A conversa da tela, no padrão aberto. As instruções fixas vão na primeira mensagem. */
export function paraOPadraoAberto(instrucoes: string[], mensagens: MensagemDaConversa[]): MensagemAberta[] {
  const saida: MensagemAberta[] = [{ role: 'system', content: instrucoes.join('\n\n') }];
  for (const m of mensagens) {
    const blocos: Bloco[] = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    if (m.role === 'assistant') {
      const texto = blocos.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('\n').trim();
      const chamadas: ChamadaAberta[] = blocos.filter((b) => b.type === 'tool_use').map((b) => ({
        id: String(b.id), type: 'function', function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) },
      }));
      if (!texto && !chamadas.length) continue;
      saida.push({ role: 'assistant', content: texto || null, ...(chamadas.length ? { tool_calls: chamadas } : {}) });
      continue;
    }
    /* O resultado de ferramenta vem antes do que a pessoa escreveu: no padrão
       aberto ele tem de seguir logo o pedido do modelo. */
    for (const b of blocos.filter((x) => x.type === 'tool_result')) {
      saida.push({ role: 'tool', tool_call_id: String(b.tool_use_id), content: textoDoResultado(b) });
    }
    const partes = blocos.filter((b) => b.type !== 'tool_result').map(parteDaPessoa).filter((p): p is Parte => !!p);
    if (!partes.length) continue;
    const soTexto = partes.every((p) => p.type === 'text');
    saida.push({ role: 'user', content: soTexto ? partes.map((p) => (p as { text: string }).text).join('\n') : partes });
  }
  return saida;
}

/**
 * Quanto texto vai ao modelo, sem contar as fotos. Serve para ver se a máquina
 * leu tudo: o Ollama, com a janela pequena que vem de fábrica, corta o começo
 * da conversa sem avisar, e o começo é o guia.
 */
export function letrasDoTexto(m: MensagemAberta[]): number {
  let n = 0;
  for (const x of m) {
    if (typeof x.content === 'string') n += x.content.length;
    else if (Array.isArray(x.content)) for (const p of x.content) if (p.type === 'text') n += p.text.length;
    if (x.role === 'assistant' && x.tool_calls) for (const c of x.tool_calls) n += c.function.arguments.length;
  }
  return n;
}

/** Português dá perto de quatro letras por pedaço; abaixo de oito, o modelo não leu tudo. */
export function janelaCurta(letras: number, lidos: number | null): boolean {
  return lidos !== null && letras > 4000 && lidos < letras / 8;
}

/** As ferramentas, no padrão aberto. */
export function ferramentasAbertas(f: readonly FerramentaDaConversa[]) {
  return f.map((x) => ({ type: 'function' as const, function: { name: x.name, description: x.description, parameters: x.input_schema } }));
}

export interface RespostaTraduzida {
  content: Bloco[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage: { input_tokens: number | null; output_tokens: number | null };
  /** Pedidos de ferramenta que vieram com nome desconhecido ou argumento ilegível. */
  descartadas: number;
}

export const SEM_RESPOSTA = 'Não consegui responder agora. Tente de novo com outras palavras.';

/** Alguns modelos abertos escrevem o raciocínio no próprio texto, entre marcas. */
export function semRaciocinio(t: string): string {
  return t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();
}

/** A resposta do padrão aberto, nos blocos da conversa. Só passam as ferramentas conhecidas. */
export function daRespostaAberta(json: unknown, nomes: readonly string[]): RespostaTraduzida {
  const r = json as {
    choices?: { message?: { content?: unknown; tool_calls?: { id?: unknown; function?: { name?: unknown; arguments?: unknown } }[] }; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const escolha = r?.choices?.[0];
  const msg = escolha?.message ?? {};
  const content: Bloco[] = [];
  const texto = typeof msg.content === 'string' ? semRaciocinio(msg.content) : '';
  if (texto) content.push({ type: 'text', text: texto });
  let descartadas = 0;
  (Array.isArray(msg.tool_calls) ? msg.tool_calls : []).forEach((c, i) => {
    const nome = c?.function?.name;
    if (typeof nome !== 'string' || !nomes.includes(nome)) { descartadas++; return; }
    const args = c.function?.arguments;
    let input: unknown = {};
    try {
      input = typeof args === 'string' ? (args.trim() ? JSON.parse(args) : {}) : (args ?? {});
    } catch { descartadas++; return; }
    if (!input || typeof input !== 'object' || Array.isArray(input)) { descartadas++; return; }
    const id = typeof c.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(c.id) ? c.id : `local_${Date.now().toString(36)}_${i}`;
    content.push({ type: 'tool_use', id, name: nome, input });
  });
  const pediuFerramenta = content.some((b) => b.type === 'tool_use');
  if (!content.length) content.push({ type: 'text', text: SEM_RESPOSTA });
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    content,
    stop_reason: pediuFerramenta ? 'tool_use' : escolha?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
    usage: { input_tokens: n(r?.usage?.prompt_tokens), output_tokens: n(r?.usage?.completion_tokens) },
    descartadas,
  };
}

/** Quando a máquina do Pão não respondeu, com a razão em poucas palavras para o log. */
export class MotorLocalFalhou extends Error {
  readonly motivo: 'sem_conexao' | 'demorou' | 'recusou' | 'resposta_ilegivel';
  readonly status?: number;

  constructor(motivo: MotorLocalFalhou['motivo'], status?: number) {
    super(motivo); this.name = 'MotorLocalFalhou';
    this.motivo = motivo;
    this.status = status;
  }
}

export interface ConfiguracaoDoMotorLocal { url: string; modelo: string; esperaMs: number; maxTokens: number }

/** Uma pergunta ao modelo do Pão. O endereço é o do `/v1` (o Ollama responde em `:11434/v1`). */
export async function perguntarAoMotorLocal(
  cfg: ConfiguracaoDoMotorLocal, mensagens: MensagemAberta[], ferramentas: ReturnType<typeof ferramentasAbertas>,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${cfg.url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.modelo, messages: mensagens, tools: ferramentas, stream: false, max_tokens: cfg.maxTokens }),
      signal: AbortSignal.timeout(cfg.esperaMs),
    });
  } catch (e) {
    const nome = (e as Error)?.name;
    throw new MotorLocalFalhou(nome === 'TimeoutError' || nome === 'AbortError' ? 'demorou' : 'sem_conexao');
  }
  if (!res.ok) throw new MotorLocalFalhou('recusou', res.status);
  try { return await res.json(); } catch { throw new MotorLocalFalhou('resposta_ilegivel', res.status); }
}
