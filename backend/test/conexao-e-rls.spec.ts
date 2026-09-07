/**
 * A INVARIANTE EM QUE A CONFERÊNCIA DE ARRANQUE SE APOIA.
 *
 * O serviço recusa subir quando a conexão da aplicação passa por cima do RLS
 * (`kernel/database/conferencia-de-arranque.ts`). A terceira pergunta que ele
 * faz é a mais importante, e é a única que pega o caso do DONO das tabelas:
 *
 *   sem identidade de usuário, o banco devolve ZERO pessoas.
 *
 * As outras duas perguntas — superusuário e `BYPASSRLS` — responderiam "está
 * tudo bem" para o dono, porque ele não é nenhuma das duas coisas. O Postgres
 * isenta o dono das políticas a menos que a tabela use `FORCE ROW LEVEL
 * SECURITY`, e é assim que o RLS se desliga sem ninguém desligar nada.
 *
 * Esta suíte prega a invariante no chão, nas duas direções: pela conexão de
 * aplicação o banco devolve zero; por uma conexão que ignora o RLS, devolve
 * gente. Se um dia alguém "consertar" uma política de modo que a leitura sem
 * contexto passe a devolver linhas, a conferência de arranque deixa de
 * proteger — e passa a aprovar em silêncio.
 */
import { Client } from 'pg';

const donoUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
/* A URL da aplicação derivada da do dono, para a suíte não depender de mais
 * uma variável de ambiente configurada à mão. */
const appUrl = process.env.DATABASE_APP_URL
  ?? donoUrl.replace('rede_admin:dev-only-change-me', 'rede_app:dev-only-change-me-app');

describe('A conexão da aplicação e o RLS', () => {
  let app: Client, dono: Client;

  beforeAll(async () => {
    app = new Client({ connectionString: appUrl });
    dono = new Client({ connectionString: donoUrl });
    await app.connect();
    await dono.connect();
  });

  afterAll(async () => { await app.end(); await dono.end(); });

  it('a conexão de aplicação não é superusuária e não bypassa o RLS', async () => {
    const { rows: [r] } = await app.query(
      `SELECT current_user AS papel,
              (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS super,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassa`);
    expect(r.papel).toBe('rede_app');
    expect(r.super).toBe(false);
    expect(r.bypassa).toBe(false);
  });

  it('SEM identidade, a conexão de aplicação não enxerga pessoa nenhuma', async () => {
    /*
     * É a prova prática, e a única que pegaria o dono das tabelas. Ela vale
     * para a tabela que jamais pode vazar.
     */
    const { rows: [r] } = await app.query(`SELECT count(*)::int AS n FROM person`);
    expect(r.n).toBe(0);
  });

  it('e o mesmo vale para as outras tabelas que guardam criança', async () => {
    for (const tabela of ['house_stay', 'health_condition', 'life_milestone',
                          'person_contact', 'hospitalization']) {
      const { rows: [r] } = await app.query(`SELECT count(*)::int AS n FROM ${tabela}`);
      expect({ tabela, n: r.n }).toEqual({ tabela, n: 0 });
    }
  });

  it('a conexão que ignora o RLS enxerga — e é por isso que a conferência existe', async () => {
    /*
     * O outro lado da prova. Se ESTA consulta também devolvesse zero, o teste
     * acima não estaria provando nada: poderia ser um banco vazio.
     */
    const { rows: [r] } = await dono.query(`SELECT count(*)::int AS n FROM person`);
    expect(r.n).toBeGreaterThan(0);
  });

  it('a conferência de arranque continua fazendo as três perguntas', async () => {
    /*
     * Estático de propósito. A conferência não pode ser exercitada aqui (ela
     * roda no arranque da aplicação, e a suíte a pula), então o que se guarda é
     * que ela não perdeu nenhuma das três — sobretudo a terceira, que é a
     * única que pega o dono e a mais fácil de alguém remover por parecer
     * redundante.
     */
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const fonte = readFileSync(
      join(__dirname, '..', 'src', 'kernel', 'database', 'conferencia-de-arranque.ts'), 'utf8');
    expect(fonte).toContain('rolsuper');
    expect(fonte).toContain('rolbypassrls');
    expect(fonte).toContain('FROM person');
    expect(fonte).toContain('RECUSANDO SUBIR');
  });
});
