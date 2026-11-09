/**
 * A PESSOA NOVA CRIA A SENHA DELA (fase 291).
 *
 * Desde a 291, quem entra com a senha inicial só abre a troca: o servidor recusa o resto
 * com 403 até a pessoa criar a senha dela. A suíte que cadastra uma conta e trabalha com
 * ela faz o que a pessoa faz no primeiro acesso, por aqui, e não desligando a cobrança.
 * A sessão aberta continua valendo depois da troca (a troca encerra só as outras).
 */
import request from 'supertest';
import { randomUUID } from 'node:crypto';

/** Troca a senha inicial pela da pessoa e devolve a senha nova. */
export async function criarASenhaDela(http: any, token: string, senhaAtual: string,
                                      nova = `Propria-${randomUUID().slice(0, 8)}!`): Promise<string> {
  const r = await request(http).post('/api/v1/auth/password')
    .set('Authorization', `Bearer ${token}`).send({ senhaAtual, novaSenha: nova });
  if (r.status >= 300) {
    throw new Error(`a troca da senha inicial falhou: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return nova;
}

/** Entra com a senha inicial, cria a senha dela e devolve o token, já livre da troca. */
export async function entrarPelaPrimeiraVez(http: any, email: string, senhaInicial: string,
                                           senhaNova?: string): Promise<string> {
  const r = await request(http).post('/api/v1/auth/login').send({ email, password: senhaInicial });
  if (r.status !== 201) throw new Error(`a entrada com a senha inicial falhou: ${r.status} ${JSON.stringify(r.body)}`);
  if (r.body.user?.mustChangePassword) await criarASenhaDela(http, r.body.token, senhaInicial, senhaNova);
  return r.body.token;
}
