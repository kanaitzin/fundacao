import { enfileirar, definirEnviador, ligarFila, RecusaDaFila, type AoEnfileirar, type RespostaPush } from './fila-offline';

const BASE = '/api/v1';

// Token só em memória: nada de sessão persistida em celular pessoal (§17.2).
let token: string | null = null;
export function setToken(t: string | null) { token = t; }

/**
 * O erro carrega o STATUS, além da frase.
 *
 * A tela do perfil precisou distinguir duas coisas que a frase sozinha
 * confundia: "esta área é restrita ao seu cargo" e "este campo nunca foi
 * preenchido". As duas chegavam como "Não encontrado." — e a segunda é um
 * trabalho a fazer, não um bloqueio. Quem quiser só a mensagem continua
 * usando `e.message`, como antes.
 */
export class ErroApi extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ErroApi';
  }
}

/**
 * SEM SINAL não é erro do servidor.
 *
 * O `ErroApi` diz que o servidor respondeu e recusou; este diz que ninguém
 * respondeu. A diferença decide o que fazer com o que a pessoa acabou de
 * escrever: recusa do servidor é para mostrar, falta de sinal é para guardar
 * na fila local (§17.1).
 */
export class SemConexao extends Error {
  constructor(message = 'Sem conexão com o servidor.') {
    super(message);
    this.name = 'SemConexao';
  }
}

/** Mensagens em português, úteis e sem jargão técnico. */
function mensagem(status: number, doServidor?: string): string {
  if (status === 401) return doServidor || 'E-mail ou senha inválidos.';
  if (status === 429) return doServidor || 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (status === 403) return 'Seu cargo não tem acesso a este conteúdo.';
  if (status === 404) return 'Não encontrado.';
  if (status >= 500) return 'O sistema está indisponível no momento. Tente novamente em instantes.';
  return doServidor || 'Não foi possível concluir a ação.';
}

/**
 * O protótipo navegável usa exatamente estas telas, com um servidor de
 * mentira dentro da própria página (`mock.ts`). É o que impede protótipo e
 * aplicativo de divergirem: são o mesmo código, mudando só de onde vêm os
 * dados. Fora do build do protótipo, esta constante é `false` e o `import`
 * abaixo some do pacote final.
 */
const PROTOTIPO = import.meta.env.VITE_PROTOTIPO === '1';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (PROTOTIPO) {
    const { mockApi } = await import('./mock');
    return mockApi<T>(path, init);
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new SemConexao(
      'Sem conexão com o servidor. O que você registrar fica guardado neste aparelho.',
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({} as { message?: string }));
    // Mensagem do servidor só é exibida quando já vem em linguagem de usuário.
    const doServidor = typeof body.message === 'string' && /[À-ÿ]|senha|tentativas|Sessão/i.test(body.message)
      ? body.message : undefined;
    throw new ErroApi(res.status, mensagem(res.status, doServidor));
  }
  return res.json();
}

/* ------------------------------------------------------------- Fila offline */

/**
 * A porta única das ações que sobrevivem à falta de sinal (§17.1).
 *
 * Tenta o servidor. Se ninguém respondeu, guarda a operação na fila local e
 * devolve `enfileirada: true` — a tela avisa que ficou guardado, e não que
 * falhou. Recusa do servidor (`ErroApi`) continua subindo: "esta opção exige
 * justificativa" é resposta, não falta de sinal, e guardar isso na fila seria
 * empurrar para a madrugada um erro que a pessoa consegue corrigir agora.
 *
 * O `kind` e o `payload` são os do `POST /sync/push`, não os da rota REST: é o
 * servidor que aplica a operação depois, pelo módulo dono dela.
 */
export async function apiOuFila<T>(
  path: string,
  init: RequestInit,
  offline: AoEnfileirar,
): Promise<{ resposta?: T; enfileirada: boolean; recusa?: string }> {
  try {
    const resposta = await api<T>(path, init);
    return { resposta, enfileirada: false };
  } catch (e) {
    if (!(e instanceof SemConexao)) throw e;
    try {
      await enfileirar(offline);
      return { enfileirada: true };
    } catch (r) {
      /* A fila recusou (tipo desconhecido, ou dose fora do aparelho da casa).
       * A frase dela é a que a pessoa precisa ler. */
      if (r instanceof RecusaDaFila) return { enfileirada: false, recusa: r.message };
      throw e;
    }
  }
}

/**
 * Liga a fila ao cliente HTTP. Chamado uma vez, na entrada do aplicativo.
 *
 * O `import` fica aqui, e não dentro de `fila-offline.ts`, para a fila não
 * conhecer o cliente: assim o ensaio troca o enviador por um servidor de
 * mentira sem tocar em nenhuma das duas partes.
 */
export function ligarFilaAoServidor() {
  definirEnviador(async (operacoes) => {
    return api<RespostaPush>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ operacoes }),
    });
  });
  return ligarFila();
}
