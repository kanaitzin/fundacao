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
    // Sem rede: a fila local offline entra na Fase 3.
    throw new Error('Sem conexão com o servidor. Verifique a internet e tente novamente.');
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
