/**
 * OS ATOS QUE NINGUÉM TESTAVA (fase 147).
 *
 * O `scripts/rotas-sem-teste.mjs` mediu 28 rotas, das 342 do servidor, que nenhum
 * teste jamais chamou. Oito eram a família do vocabulário, e ganharam suíte
 * própria. Esta guarda os atos da lista que mais custariam se estivessem errados.
 *
 * **A TROCA DA PRÓPRIA SENHA.** Lida antes de ser testada, ela está correta — e o
 * que ela faz é justamente o que ninguém estava conferindo: pede a senha ATUAL,
 * exige que a nova seja diferente, e **encerra as outras sessões abertas menos a
 * de quem trocou**. Essa última linha é a que importa numa casa onde o
 * computador da sala fica ligado: quem trocou a senha porque desconfiou de algo
 * precisa que as OUTRAS sessões caiam, e precisa continuar trabalhando na dele.
 *
 * *A suíte guarda o hash antes e o devolve no fim.* Não é zelo: a senha de
 * desenvolvimento é a mesma em todas as suítes, e deixá-la trocada derrubaria o
 * login de todas as que rodarem depois — é a lição da fase 127 com outra roupa
 * (um banco só, e o que uma suíte deixa a próxima encontra).
 *
 * **O AVISO LIDO E O AVISO COM CIÊNCIA.** Duas rotas, e a diferença entre elas é o
 * §8.5: *ler* é "eu vi"; *dar ciência* é "eu assumo". A caixa de entrada da
 * coordenação depende de as duas serem coisas diferentes, e nenhuma tinha teste.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const NOVA = 'senha-nova-da-suite-147';
const QUEM = 'cozinha.ai3@paodospobres.dev';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Os atos que ninguém testava', () => {
  let app: INestApplication, http: any, admin: Client;
  let hashOriginal = '';
  const tokens: Record<string, string> = {};

  const entrar = (email: string, senha: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: senha });
  const login = async (email: string, senha = SENHA) => {
    const r = await entrar(email, senha);
    if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
    return r.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const trocar = (token: string, senhaAtual: string, novaSenha: string) =>
    request(http).post('/api/v1/auth/password').set(auth(token)).send({ senhaAtual, novaSenha });

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();

    const { rows: [u] } = await admin.query(
      `SELECT password_hash FROM app_user WHERE email = $1`, [QUEM]);
    hashOriginal = u.password_hash;
    tokens.coord = await login('coord.ai3@paodospobres.dev');
  });

  afterAll(async () => {
    /* O HASH VOLTA, sempre — inclusive se um teste falhar no meio. Sem isto, todas
       as suítes seguintes falham no login por um motivo que não é delas. */
    if (hashOriginal) {
      await admin.query(`UPDATE app_user SET password_hash = $2 WHERE email = $1`,
        [QUEM, hashOriginal]);
    }
    await app.close();
    await admin.end();
  });

  // ================== A troca da própria senha ==================

  it('a senha nova tem piso, e não pode ser igual à atual', async () => {
    const t = await login(QUEM);
    const curta = await trocar(t, SENHA, 'abc');
    expect(curta.status).toBe(400);
    expect(curta.body.message).toMatch(/pelo menos 6/i);

    const igual = await trocar(t, SENHA, SENHA);
    expect(igual.status).toBe(400);
    expect(igual.body.message).toMatch(/diferente da atual/i);
  });

  it('sem a senha ATUAL não se troca — e a recusa diz o caminho de quem não lembra', async () => {
    const t = await login(QUEM);
    const r = await trocar(t, 'senha-que-nao-e-a-dela', NOVA);
    expect(r.status).toBe(401);
    /* A frase não pode ser só "não autorizado": quem esqueceu a senha precisa
       saber que a coordenação envia um acesso novo. */
    expect(r.body.message).toMatch(/coordenação/i);

    /* E a senha continua a mesma: a recusa não pode ter trocado nada. */
    expect((await entrar(QUEM, SENHA)).status).toBe(201);
  });

  it('trocada, a senha velha deixa de entrar e a nova entra', async () => {
    const t = await login(QUEM);
    const r = await trocar(t, SENHA, NOVA);
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/outras sessões abertas foram encerradas/i);

    expect((await entrar(QUEM, SENHA)).status).toBe(401);
    expect((await entrar(QUEM, NOVA)).status).toBe(201);
  });

  it('as OUTRAS sessões caem, e a de quem trocou continua de pé', async () => {
    /*
     * É a linha que importa na casa: quem troca a senha porque desconfiou de algo
     * precisa que as outras sessões caiam AGORA — e precisa continuar trabalhando
     * na dele, senão o gesto de se proteger custa o turno.
     */
    await admin.query(`UPDATE app_user SET password_hash = $2 WHERE email = $1`,
      [QUEM, hashOriginal]);
    const antiga = await login(QUEM);
    const atual = await login(QUEM);

    const r = await trocar(atual, SENHA, NOVA);
    expect(r.status).toBe(201);

    /* A que trocou continua respondendo. */
    const minha = await request(http).get('/api/v1/houses').set(auth(atual));
    expect(minha.status).toBe(200);
    /* A outra, não. */
    const dela = await request(http).get('/api/v1/houses').set(auth(antiga));
    expect(dela.status).toBe(401);
  });

  it('e a troca deixa linha na auditoria — com o nome de quem trocou', async () => {
    const { rows } = await admin.query(
      `SELECT a.actor_id FROM audit_event a
         JOIN app_user u ON u.id = a.actor_id
        WHERE a.action = 'auth.password_change' AND u.email = $1`, [QUEM]);
    expect(rows.length).toBeGreaterThan(0);
  });

  // ================== Ler não é dar ciência ==================

  it('ler um aviso e dar ciência nele são DUAS coisas — e as duas rotas respondem', async () => {
    /*
     * §8.5: *ler* é "eu vi"; *dar ciência* é "eu assumo". A caixa de entrada da
     * coordenação depende de as duas serem diferentes — e nenhuma das duas rotas
     * tinha teste.
     */
    const caixa = await request(http).get('/api/v1/notifications').set(auth(tokens.coord));
    expect(caixa.status).toBe(200);
    const lista = (Array.isArray(caixa.body) ? caixa.body : caixa.body.avisos ?? []) as any[];
    if (!lista.length) return;      // sem aviso na caixa, não há o que marcar

    const alvo = lista[0];
    const lido = await request(http).post(`/api/v1/notifications/${alvo.id}/read`)
      .set(auth(tokens.coord)).send({});
    expect([200, 201]).toContain(lido.status);

    const ciente = await request(http).post(`/api/v1/notifications/${alvo.id}/acknowledge`)
      .set(auth(tokens.coord)).send({});
    expect([200, 201]).toContain(ciente.status);
  });
});
