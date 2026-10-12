/**
 * A SAÍDA PELO PORTÃO (fase 207, pedido de 12/10).
 *
 * O que esta suíte cobra:
 *
 *  1. QUEM DECIDE: educador, líder, equipe técnica e coordenação. A portaria e a
 *     cozinha não decidem;
 *  2. O PORTÃO VÊ O QUE VALE, QUEM DECIDIU E DESDE QUANDO, E NUNCA O MOTIVO;
 *  3. SEM ACOMPANHANTE, SÓ SAI QUEM TEM A AUTORIZAÇÃO REGISTRADA: sem registro é
 *     sem autorização, e quem sai acompanhado sai com o nome de quem vai junto;
 *  4. UMA SAÍDA ABERTA POR CRIANÇA, e a volta registrada depois pede a frase;
 *  5. OUTRA CASA NÃO VÊ NEM REGISTRA, e cada ato vai à auditoria DA CASA;
 *  6. o perfil lê as saídas com o nome de quem registrou, lido por OUTRO cargo.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const MOTIVO = 'Combinado com ele na reunião de quinta, por causa da escola (fictício).';

describe('A saída pelo portão', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string, senha = SENHA) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: senha })).body.token as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const decidir = (t: string, corpo: any) =>
    request(http).post(`/api/v1/people/${ids.crianca}/outing-permission`).set(auth(t)).send(corpo);
  const portao = (t: string, casa = ids.AI3) =>
    request(http).get(`/api/v1/people/portaria/acolhidos?houseId=${casa}`).set(auth(t));
  const sair = (t: string, corpo: any) =>
    request(http).post('/api/v1/people/portaria/saidas').set(auth(t)).send(corpo);
  const voltar = (t: string, id: string, corpo: any = {}) =>
    request(http).post(`/api/v1/people/portaria/saidas/${id}/volta`).set(auth(t)).send(corpo);

  const limpar = async () => {
    await admin.query(`DELETE FROM child_outing WHERE person_id = $1`, [ids.crianca]);
    await admin.query(`DELETE FROM outing_permission WHERE person_id = $1`, [ids.crianca]);
  };

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
      coord: 'coord.ai3@paodospobres.dev', educador: 'educador.ai3@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev', cozinha: 'cozinha.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ person_id: ids.crianca }] } = await admin.query(
      `SELECT person_id FROM house_stay
        WHERE house_id = $1 AND status = 'ativa' AND NOT app_ausente_da_casa(person_id, app_hoje())
        ORDER BY person_id DESC LIMIT 1`, [ids.AI3]));

    const email = `portaria.207.${Date.now()}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set(auth(tokens.coord))
      .send({ nome: 'Porteira da Conferência 207 (fictícia)', email, cargo: 'portaria', casaId: ids.AI3 });
    expect(r.status).toBe(201);
    tokens.portaria = await login(email, r.body.senhaInicial);
    expect(tokens.portaria).toBeTruthy();
  });

  beforeEach(limpar);
  afterAll(async () => {
    /* A saída fechada fica (nada se apaga, e a sondagem de escrita precisa de um
       registro real da Casa 03); a decisão desta suíte sai, para não valer em outra. */
    await admin.query(`DELETE FROM outing_permission WHERE person_id = $1`, [ids.crianca]);
    await admin.query(`DELETE FROM child_outing WHERE person_id = $1 AND returned_at IS NULL`, [ids.crianca]);
    await app.close(); await admin.end();
  });

  it('o educador e o líder decidem; a portaria e a cozinha não', async () => {
    await decidir(tokens.educador, { status: 'liberada', motivo: MOTIVO, onde: 'Escola e curso.' }).expect(201);
    await decidir(tokens.lider, { status: 'suspensa', motivo: MOTIVO, ate: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10) }).expect(201);
    expect((await decidir(tokens.portaria, { status: 'liberada', motivo: MOTIVO })).status).toBe(403);
    expect((await decidir(tokens.cozinha, { status: 'liberada', motivo: MOTIVO })).status).toBe(403);
  });

  it('o portão vê o que vale, quem decidiu e desde quando, e nunca o motivo', async () => {
    await decidir(tokens.tecnica, { status: 'suspensa', motivo: MOTIVO,
      ate: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10) }).expect(201);
    const r = await portao(tokens.portaria).expect(200);
    const eu = r.body.find((x: any) => x.personId === ids.crianca);
    expect(eu.situacao).toBe('suspensa');
    expect(eu.rotulo).toBe('não pode sair sem acompanhante');
    expect(eu.quemDecidiu).toMatch(/Técnica/);
    expect(eu.desde).toBeTruthy();
    expect(JSON.stringify(r.body)).not.toContain('reunião de quinta');
    expect(JSON.stringify(r.body)).not.toMatch(/motivo/i);
  });

  it('sem registro, a saída sem acompanhante é recusada, e com acompanhante pede o nome', async () => {
    const sozinho = await sair(tokens.portaria, { personId: ids.crianca, sozinho: true });
    expect(sozinho.status).toBe(400);
    expect(sozinho.body.message).toMatch(/ainda não registrou autorização/);
    const semNome = await sair(tokens.portaria, { personId: ids.crianca, sozinho: false });
    expect(semNome.status).toBe(400);
    expect(semNome.body.message).toMatch(/com quem vai/);
    const ok = await sair(tokens.portaria, { personId: ids.crianca, sozinho: false,
      comQuem: 'Educadora Tainá (fictícia)', destino: 'Consulta na unidade de saúde', volta: '17:30' });
    expect(ok.status).toBe(201);
    await voltar(tokens.portaria, ok.body.id).expect(201);
  });

  it('autorizado, sai sem acompanhante; uma saída aberta por vez; a volta fecha', async () => {
    await decidir(tokens.educador, { status: 'liberada', motivo: MOTIVO, onde: 'Escola.' }).expect(201);
    const s = await sair(tokens.portaria, { personId: ids.crianca, sozinho: true, destino: 'Escola' }).expect(201);
    expect((await sair(tokens.portaria, { personId: ids.crianca, sozinho: true })).status).toBe(409);
    const aberto = (await portao(tokens.portaria)).body.find((x: any) => x.personId === ids.crianca);
    expect(aberto.saida.id).toBe(s.body.id);
    expect(aberto.saida.sozinho).toBe(true);
    await voltar(tokens.portaria, s.body.id).expect(201);
    expect((await voltar(tokens.portaria, s.body.id)).status).toBe(409);
    const { rows: [l] } = await admin.query(`SELECT * FROM child_outing WHERE id = $1`, [s.body.id]);
    expect(l.returned_at).not.toBeNull();
    expect(l.returned_registered_at).not.toBeNull();
  });

  it('suspensa, não sai sem acompanhante; a volta registrada depois pede a frase', async () => {
    await decidir(tokens.coord, { status: 'suspensa', motivo: MOTIVO,
      ate: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10) }).expect(201);
    const r = await sair(tokens.portaria, { personId: ids.crianca, sozinho: true });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/não pode sair sem acompanhante agora/);
    const s = await sair(tokens.educador, { personId: ids.crianca, sozinho: false, comQuem: 'Líder Lúcia (fictícia)' }).expect(201);
    /* A saída de uma hora atrás, para a volta poder ser antes de agora. */
    await admin.query(`UPDATE child_outing SET left_at = now() - interval '2 hours' WHERE id = $1`, [s.body.id]);
    const umaHora = new Date(Date.now() - 3600_000).toISOString();
    expect((await voltar(tokens.portaria, s.body.id, { voltouEm: umaHora })).status).toBe(400);
    await voltar(tokens.portaria, s.body.id, { voltouEm: umaHora,
      nota: 'Voltou às 15h com a líder; esqueci de registrar na hora.' }).expect(201);
  });

  it('outra casa não vê o portão nem registra a saída', async () => {
    expect((await portao(tokens.coord4)).status).toBe(404);
    const r = await sair(tokens.coord4, { personId: ids.crianca, sozinho: false, comQuem: 'Alguém de fora' });
    expect(r.status).toBe(404);
    const { rows: [n] } = await admin.query(
      `SELECT count(*)::int AS n FROM child_outing WHERE person_id = $1`, [ids.crianca]);
    expect(n.n).toBe(0);
  });

  it('o perfil lê as saídas com o nome de quem registrou, e cada ato vai à auditoria da casa', async () => {
    await decidir(tokens.tecnica, { status: 'liberada', motivo: MOTIVO }).expect(201);
    const s = await sair(tokens.portaria, { personId: ids.crianca, sozinho: true, destino: 'Curso' }).expect(201);
    await voltar(tokens.educador, s.body.id).expect(201);
    /* Lido pela técnica, que não registrou nada: o nome sai por função (lição da 152). */
    const r = await request(http).get(`/api/v1/people/${ids.crianca}/saidas`).set(auth(tokens.tecnica)).expect(200);
    expect(r.body[0].quemSaida).toMatch(/Porteira da Conferência 207/);
    expect(r.body[0].quemVolta).toBeTruthy();
    expect(r.body[0].destino).toBe('Curso');
    /* A portaria não lê o perfil. */
    expect([403, 404]).toContain((await request(http).get(`/api/v1/people/${ids.crianca}/saidas`)
      .set(auth(tokens.portaria))).status);
    const { rows } = await admin.query(
      `SELECT action, house_id FROM audit_event WHERE action IN ('saida.registrada','saida.volta')
        AND entity_id = $1 ORDER BY at DESC LIMIT 2`, [ids.crianca]);
    expect(rows.length).toBe(2);
    for (const a of rows) expect(a.house_id).toBe(ids.AI3);
  });
});
