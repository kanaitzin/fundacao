/**
 * O PLANO DO DIA DA COZINHA (fase 286, primeira avaliação humana de 05/11, módulo 13;
 * decidido em 06/11: o plano do dia no alto da Cozinha e os números do período em
 * cartões por refeição).
 *
 * Esta suíte cobra:
 *  1. as refeições da casa vêm com a hora, na ordem do dia;
 *  2. quem está em casa é contado pela regra única da ausência (internada ou com a família
 *     não come aqui), e as restrições são só de quem está em casa, sem o motivo clínico;
 *  3. o lanche pedido para hoje aparece, e o cancelado não;
 *  4. a cozinha lê; a Casa 04 recebe 404.
 *
 * A refeição desta suíte é encerrada no fim, como faria a coordenação: nada se apaga.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O plano do dia da cozinha', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let hoje = '';
  const titulo = `Merenda da conferência 286 ${Date.now().toString(36)}`;

  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const auth = (k: string) => ({ Authorization: `Bearer ${t[k]}` });
  const plano = (k: string, casa = ids.AI3) =>
    request(http).get(`/api/v1/reports/period/kitchen-plan?houseId=${casa}`).set(auth(k));

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
      coord: 'coord.ai3@paodospobres.dev', cozinha: 'cozinha.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
    })) t[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ hoje }] } = await admin.query(`SELECT app_hoje()::text AS hoje`));
    const r = await request(http).post('/api/v1/checks/models').set(auth('coord'))
      .send({ houseId: ids.AI3, tipo: 'alimentacao', titulo, hora: '15:10', pessoas: 18, cor: 'ameixa' });
    expect(r.status).toBe(201);
    ids.modelo = r.body.id;
  });

  afterAll(async () => {
    const r = await request(http).post(`/api/v1/checks/models/${ids.modelo}/encerrar`).set(auth('coord'))
      .send({ motivo: 'Fim da conferência da suíte 286.' });
    expect([200, 201]).toContain(r.status);
    await app.close(); await admin.end();
  });

  it('as refeições da casa vêm com a hora, na ordem do dia', async () => {
    const r = await plano('cozinha');
    expect(r.status).toBe(200);
    expect(r.body.dia).toBe(hoje);
    const m = r.body.refeicoes.find((x: any) => x.titulo === titulo);
    expect(m).toBeTruthy();
    expect(m.hora).toBe('15:10');
    expect(m.pessoasDeCostume).toBe(18);
    const horas = r.body.refeicoes.map((x: any) => x.hora);
    expect([...horas].sort()).toEqual(horas);
  });

  it('quem está em casa segue a regra da ausência, e as restrições são só de quem está', async () => {
    const r = await plano('educador');
    const { rows: [n] } = await admin.query(
      `SELECT count(*) FILTER (WHERE NOT app_ausente_da_casa(person_id, app_hoje()))::int AS em_casa,
              count(*) FILTER (WHERE app_ausente_da_casa(person_id, app_hoje()))::int AS fora
         FROM house_stay WHERE house_id = $1 AND status = 'ativa'`, [ids.AI3]);
    expect(r.body.emCasa).toBe(n.em_casa);
    expect(r.body.fora).toBe(n.fora);
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM food_restriction f JOIN house_stay s ON s.person_id = f.person_id
        WHERE f.active AND s.house_id = $1 AND s.status = 'ativa'
          AND NOT app_ausente_da_casa(f.person_id, app_hoje())`, [ids.AI3]);
    expect(r.body.restricoes).toHaveLength(rows[0].n);
    for (const x of r.body.restricoes) {
      expect(Object.keys(x).sort()).toEqual(['nome', 'orientacao', 'restricao', 'substituicao']);
    }
  });

  it('o lanche pedido para hoje aparece, e o cancelado não', async () => {
    const pedido = await request(http).post('/api/v1/people/kitchen-requests').set(auth('coord'))
      .send({ houseId: ids.AI3, tipo: 'lanche', em: hoje, quantidade: 7,
              finalidade: 'Passeio da conferência 286 ao parque' });
    expect(pedido.status).toBe(201);
    const id = pedido.body.id ?? pedido.body.ids?.[0];
    let r = await plano('cozinha');
    expect(r.body.pedidos.some((p: any) => p.id === id && p.quantidade === 7)).toBe(true);
    await request(http).post(`/api/v1/people/kitchen-requests/${id}/cancel`).set(auth('coord'))
      .send({ motivo: 'O passeio da conferência foi desmarcado.' }).expect(201);
    r = await plano('cozinha');
    expect(r.body.pedidos.some((p: any) => p.id === id)).toBe(false);
  });

  it('a Casa 04 não lê o plano da Casa 03', async () => {
    expect((await plano('coord4')).status).toBe(404);
  });
});
