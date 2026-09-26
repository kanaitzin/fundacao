/**
 * QUEM LÊ É QUEM ALCANÇA A CASA (fase 158).
 *
 * A 156 mediu a ESCRITA entre casas e achou a tomada de conta. Esta fase mediu
 * a LEITURA pelo mesmo caminho: toda rota `GET` do servidor, pedida pela
 * coordenação da Casa 04, com os registros REAIS da Casa 03 no lugar de cada
 * `:id` — buscados no banco que a suíte deixa povoado —, e com a casa e a
 * criança da Casa 03 na consulta. O critério foi o CONTEÚDO, e não o status:
 * resposta com o nome de uma criança ou de alguém da equipe da Casa 03 é
 * vazamento; eco do identificador pedido não é.
 *
 * O RESULTADO, em 25/09: 157 rotas medidas, duas respostas com nome da Casa 03 —
 * e as duas legítimas. As três crianças do arquivo e a evolução pendente da
 * triagem são de crianças TRANSFERIDAS para a Casa 04: a continuidade do
 * cuidado (§7.2) manda a casa que recebe enxergar a pendência. A criança que
 * ficou só na Casa 03 não aparece.
 *
 * A sondagem precisa do banco povoado, e por isso não é esta suíte. Esta guarda
 * as leituras mais sensíveis sobre a semente — perfil, saúde, relatos,
 * dossiê, rastro, cofre —, para dois cargos de fora, e os três ataques que o
 * pedido da Fundação nomeia: sessão antiga de quem foi desligado, cargo trocado
 * pela própria API, e o id de outra casa digitado na URL.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Quem lê é quem alcança a casa', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string, senha = SENHA) =>
    request(http).post('/api/v1/auth/login').send({ email, password: senha });
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    for (const [k, email] of Object.entries({
      coord: 'coord.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      educador4: 'educador.ai4@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ person_id: ids.crianca3 }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status='ativa'
        ORDER BY person_id LIMIT 1`, [ids.AI3]));
    ({ rows: [{ person_id: ids.crianca4 }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status='ativa'
        ORDER BY person_id LIMIT 1`, [ids.AI4]));
    ({ rows: [{ id: ids.educador }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  /** As leituras de uma criança que mais importam, pelo caminho da tela. */
  const leiturasDaCrianca = (id: string) => [
    `/api/v1/people/${id}`,
    `/api/v1/people/${id}/contacts`,
    `/api/v1/people/${id}/dossie`,
    `/api/v1/people/${id}/memories`,
    `/api/v1/people/${id}/judicial`,
    `/api/v1/people/${id}/family-stays`,
    `/api/v1/nursing/history/${id}`,
    `/api/v1/audit/person/${id}`,
    `/api/v1/statements/person/${id}`,
  ];

  it('a Casa 04 não lê nada da criança da Casa 03 — nem a coordenação, nem o educador', async () => {
    const abertas: string[] = [];
    for (const quem of ['coord4', 'educador4']) {
      for (const url of leiturasDaCrianca(ids.crianca3)) {
        const r = await request(http).get(url).set(auth(tokens[quem]));
        /* 403 ou 404 — e, se a rota nem existe para aquele cargo, também não é
           200. O que não pode é 200 com o dado. */
        if (r.status < 300) abertas.push(`${quem} ${url}: ${r.status}`);
      }
    }
    expect(abertas).toEqual([]);
  });

  it('o educador da Casa 03 digitando o id de uma criança da Casa 04 na URL também não', async () => {
    const abertas: string[] = [];
    for (const url of leiturasDaCrianca(ids.crianca4)) {
      const r = await request(http).get(url).set(auth(tokens.educador));
      if (r.status < 300) abertas.push(`${url}: ${r.status}`);
    }
    expect(abertas).toEqual([]);
  });

  it('toda leitura de criança DECLARA o registro da rota — a conferência nasce na porta', () => {
    /*
     * A cobrança ESTÁTICA, que pega a rota nova. Em 25/09, 24 leituras por
     * identificador respondiam 200 VAZIO a quem é de fora — o dossiê listando
     * todo documento como faltando, a saúde dizendo "nenhum atendimento". O
     * conserto é o `@RegistroDaRota`, e aqui ele é obrigatório para toda leitura
     * que recebe uma criança: `:personId` em qualquer partição, e `/people/:id`.
     */
    const raiz = join(__dirname, '..', 'src', 'modules');
    const sem: string[] = [];
    for (const mod of readdirSync(raiz)) {
      for (const f of readdirSync(join(raiz, mod))) {
        if (!f.endsWith('.controller.ts')) continue;
        const linhas = readFileSync(join(raiz, mod, f), 'utf8').split('\n');
        let prefixo = '';
        linhas.forEach((l, i) => {
          const c = /@Controller\('([^']*)'\)/.exec(l);
          if (c) prefixo = c[1];
          const g = /^\s*@Get\('([^']*)'\)/.exec(l);
          if (!g) return;
          const daCrianca = g[1].includes(':personId') || (prefixo === 'people' && g[1].startsWith(':id'));
          if (daCrianca && !/@RegistroDaRota\(/.test(linhas[i - 1] ?? '')) {
            sem.push(`${mod}/${f}:${i + 1} GET /${prefixo}/${g[1]}`);
          }
        });
      }
    }
    expect(sem).toEqual([]);
  });

  it('e o dossiê de fora não diz mais "falta a certidão": diz que não é seu', async () => {
    const r = await request(http).get(`/api/v1/people/${ids.crianca3}/dossie`).set(auth(tokens.coord4));
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/fora do seu alcance/);
  });

  it('e a própria casa lê — a recusa não pode fechar a porta certa', async () => {
    const r = await request(http).get(`/api/v1/people/${ids.crianca3}`).set(auth(tokens.coord));
    expect(r.status).toBe(200);
    const s = await request(http).get(`/api/v1/nursing/history/${ids.crianca3}`).set(auth(tokens.coord));
    expect(s.status).toBe(200);
  });

  it('o educador não troca o próprio cargo pela API', async () => {
    const r = await request(http).patch(`/api/v1/staff/${ids.educador}`)
      .set(auth(tokens.educador)).send({ cargo: 'coordenador' });
    expect(r.status).toBe(403);
    const { rows: [u] } = await admin.query(`SELECT role FROM app_user WHERE id = $1`, [ids.educador]);
    expect(u.role).toBe('educador');
  });

  it('quem foi desligado não usa a sessão antiga — a recusa vem na próxima chamada', async () => {
    const email = `desligada.158.${Date.now()}@paodospobres.dev`;
    const c = await request(http).post('/api/v1/staff').set(auth(tokens.coord))
      .send({ nome: 'Educadora Desligada 158 (fictícia)', email, cargo: 'educador', casaId: ids.AI3 });
    expect(c.status).toBe(201);
    const sessao = (await login(email, c.body.senhaInicial)).body.token;
    expect((await request(http).get('/api/v1/users/me').set(auth(sessao))).status).toBe(200);

    const d = await request(http).post(`/api/v1/staff/${c.body.id}/deactivate`)
      .set(auth(tokens.coord)).send({ motivo: 'Desligamento — conferência da fase 158.' });
    expect(d.status).toBe(201);

    expect((await request(http).get('/api/v1/users/me').set(auth(sessao))).status).toBe(401);
    expect((await request(http).get(`/api/v1/people/${ids.crianca3}`).set(auth(sessao))).status)
      .toBe(401);
    /* E não entra de novo com a senha. */
    expect((await login(email, c.body.senhaInicial)).status).toBeGreaterThanOrEqual(400);
  });
});
