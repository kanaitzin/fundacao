/**
 * A COZINHA RECEBE A LISTA, E O PEDIDO SE EDITA COM HISTÓRICO (fase 162).
 *
 * Decisões do humano em 26/09, e o que esta suíte cobra:
 *
 *  1. "SELECIONAR TODOS" grava UM PEDIDO POR CRIANÇA, juntos, tudo ou nada.
 *  2. EDITAR é de quem pediu, da coordenação, da técnica e do líder, enquanto
 *     o pedido estiver aberto e a data não tiver passado; o antes fica no
 *     histórico, com o motivo e o autor.
 *  3. AS REFEIÇÕES DA CASA contam-se por refeição, nunca por criança.
 *
 * E o defeito achado ao escrever as métricas: o relatório do período comparava
 * o INSTANTE da chamada com DATAS, e o último dia do período ficava de fora.
 *
 * A chamada de refeição desta suíte mora 400 dias atrás, fechada: fora de toda
 * janela que as outras suítes consultam (lição da 145).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A cozinha recebe a lista', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let criancas: string[] = [];
  let hoje = '', amanha = '', ontem = '', longe = '';
  const rodada = Date.now().toString(36);

  const login = async (email: string, senha = SENHA) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: senha })).body.token as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const pedir = (t: string, corpo: Record<string, unknown>) =>
    request(http).post('/api/v1/people/kitchen-requests').set(auth(t)).send(corpo);
  const editar = (t: string, id: string, corpo: Record<string, unknown>) =>
    request(http).post(`/api/v1/people/kitchen-requests/${id}/edit`).set(auth(t)).send(corpo);

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
      educador: 'educador.ai3@paodospobres.dev', coord: 'coord.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ id: ids.coordId }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='coord.ai3@paodospobres.dev'`));
    ({ rows: [{ hoje, amanha, ontem, longe }] } = await admin.query(
      `SELECT app_hoje()::text AS hoje, (app_hoje()+1)::text AS amanha, (app_hoje()-1)::text AS ontem,
              (app_hoje()-400)::text AS longe`));
    criancas = (await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa' ORDER BY person_id LIMIT 3`,
      [ids.AI3])).rows.map((r: any) => r.person_id);
    ({ rows: [{ person_id: ids.crianca4 }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa' LIMIT 1`, [ids.AI4]));

    /* Um segundo educador, só desta suíte: quem NÃO fez o pedido. */
    const email = `educadora.162.${Date.now()}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set(auth(tokens.coord))
      .send({ nome: 'Educadora da Conferência 162 (fictícia)', email, cargo: 'educador', casaId: ids.AI3 });
    expect(r.status).toBe(201);
    tokens.outraEducadora = await login(email, r.body.senhaInicial);
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ============ 1. Selecionar todos ============

  it('marcar três crianças grava três pedidos, juntos, com o mesmo lote', async () => {
    const r = await pedir(tokens.educador, {
      houseId: ids.AI3, tipo: 'lanche', pessoas: criancas, em: amanha, quantidade: 1,
      finalidade: `Passeio ao parque ${rodada}` });
    expect(r.status).toBe(201);
    expect(r.body.ids).toHaveLength(3);
    ids.lote = r.body.lote;
    ids.pedido = r.body.ids[0];
    const l = await request(http).get(
      `/api/v1/people/kitchen-requests?houseId=${ids.AI3}&de=${amanha}&ate=${amanha}`).set(auth(tokens.coord));
    const meus = l.body.filter((p: any) => p.finalidade === `Passeio ao parque ${rodada}`);
    expect(meus).toHaveLength(3);
    expect(new Set(meus.map((p: any) => p.lote))).toEqual(new Set([ids.lote]));
    expect(new Set(meus.map((p: any) => p.personId))).toEqual(new Set(criancas));
  });

  it('uma criança de outra casa na lista recusa o lote INTEIRO — nada fica pela metade', async () => {
    const r = await pedir(tokens.educador, {
      houseId: ids.AI3, tipo: 'lanche', pessoas: [...criancas, ids.crianca4], em: amanha, quantidade: 1,
      finalidade: `Lote misturado ${rodada}` });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Nada foi registrado/);
    const { rows: [{ n }] } = await admin.query(
      `SELECT count(*)::int AS n FROM kitchen_request WHERE purpose = $1`, [`Lote misturado ${rodada}`]);
    expect(n).toBe(0);
  });

  it('lista vazia e lixo na lista são recusados com frase', async () => {
    const vazia = await pedir(tokens.educador, {
      houseId: ids.AI3, tipo: 'lanche', pessoas: [], em: amanha, quantidade: 1, finalidade: 'Passeio vazio' });
    expect(vazia.status).toBe(400);
    const lixo = await pedir(tokens.educador, {
      houseId: ids.AI3, tipo: 'lanche', pessoas: ['lixo'], em: amanha, quantidade: 1, finalidade: 'Passeio lixo' });
    expect(lixo.status).toBe(400);
  });

  // ============ 2. Editar com histórico ============

  it('quem pediu edita, com motivo — e o antes fica no histórico, lido por OUTRO cargo', async () => {
    const sem = await editar(tokens.educador, ids.pedido, { quantidade: 2, motivo: '' });
    expect(sem.status).toBe(400);
    const r = await editar(tokens.educador, ids.pedido, { quantidade: 2, motivo: 'Vai levar um amigo da escola.' });
    expect(r.status).toBe(201);
    const h = await request(http).get(`/api/v1/people/kitchen-requests/${ids.pedido}/history`)
      .set(auth(tokens.coord));
    expect(h.status).toBe(200);
    expect(h.body).toHaveLength(1);
    expect(h.body[0].antes.quantidade).toBe(1);
    expect(h.body[0].depois.quantidade).toBe(2);
    expect(h.body[0].motivo).toMatch(/amigo/);
    expect(h.body[0].por).toBeTruthy();
    const { rows } = await admin.query(
      `SELECT house_id FROM audit_event WHERE action = 'kitchen.request_edit' AND entity_id = $1`, [ids.pedido]);
    expect(rows.map((x: any) => x.house_id)).toEqual([ids.AI3]);
  });

  it('outra educadora não edita o pedido de quem pediu; a coordenação edita', async () => {
    const e = await editar(tokens.outraEducadora, ids.pedido, { quantidade: 3, motivo: 'Tentativa de outra educadora.' });
    expect(e.status).toBe(403);
    const c = await editar(tokens.coord, ids.pedido, { em: hoje, motivo: 'O passeio foi antecipado para hoje.' });
    expect(c.status).toBe(201);
    const f = await editar(tokens.coord4, ids.pedido, { quantidade: 9, motivo: 'Tentativa de outra casa.' });
    expect(f.status).toBe(404);
  });

  it('não se leva o pedido para o passado, e nada que não mudou vira histórico', async () => {
    const passado = await editar(tokens.coord, ids.pedido, { em: ontem, motivo: 'Tentando voltar a data.' });
    expect(passado.status).toBe(400);
    const igual = await editar(tokens.coord, ids.pedido, { em: hoje, motivo: 'Mesma data de novo.' });
    expect(igual.status).toBe(400);
  });

  it('depois do dia, só cancelar — a cozinha já serviu', async () => {
    const r = await pedir(tokens.educador, {
      houseId: ids.AI3, tipo: 'lanche', personId: criancas[0], em: ontem, quantidade: 1,
      finalidade: `Lanche de ontem ${rodada}` });
    expect(r.status).toBe(201);
    const e = await editar(tokens.coord, r.body.id, { quantidade: 2, motivo: 'Corrigindo o de ontem.' });
    expect(e.status).toBe(409);
    expect(e.body.message).toMatch(/já passou/);
  });

  it('pedido cancelado não se edita', async () => {
    const { rows: [{ id }] } = await admin.query(
      `SELECT id FROM kitchen_request WHERE batch_id = $1 AND id <> $2 LIMIT 1`, [ids.lote, ids.pedido]);
    const c = await request(http).post(`/api/v1/people/kitchen-requests/${id}/cancel`)
      .set(auth(tokens.educador)).send({ motivo: 'A criança não vai ao passeio.' });
    expect(c.status).toBe(201);
    const e = await editar(tokens.educador, id, { quantidade: 2, motivo: 'Depois de cancelado.' });
    expect(e.status).toBe(409);
    /* E os outros do lote seguem abertos. */
    const { rows } = await admin.query(`SELECT status FROM kitchen_request WHERE batch_id = $1`, [ids.lote]);
    expect(rows.filter((x: any) => x.status === 'aberto')).toHaveLength(2);
  });

  // ============ 3. As refeições da casa, e o último dia do período ============

  it('as refeições contam-se por refeição, da casa, sem nome de criança', async () => {
    const titulo = `Almoço da conferência 162 ${rodada}`;
    const { rows: [k] } = await admin.query(
      `INSERT INTO collective_check (house_id, kind, title, reference_at, status, expected, confirmed_at,
                                     confirmed_by, created_by)
       VALUES ($1, 'alimentacao', $2, ($3::date + time '12:30') AT TIME ZONE app_fuso(), 'confirmada', 3,
               now(), $4, $4) RETURNING id`, [ids.AI3, titulo, longe, ids.coordId]);
    const opcoes = ['normal', 'recusou', 'parcial'];
    for (const [i, p] of criancas.entries()) {
      await admin.query(
        `INSERT INTO check_result (check_id, person_id, option_code, recorded_by, happened_at)
         VALUES ($1, $2, $3, $4, ($5::date + time '12:40') AT TIME ZONE app_fuso())`,
        [k.id, p, opcoes[i], ids.coordId, longe]);
    }
    const r = await request(http).get(
      `/api/v1/reports/period/meals?houseId=${ids.AI3}&de=${longe}&ate=${longe}`).set(auth(tokens.tecnica));
    expect(r.status).toBe(200);
    const almoco = r.body.porRefeicao.find((x: any) => x.refeicao === titulo);
    expect(almoco).toMatchObject({ chamadas: 1, registros: 3, comeram: 2, parcial: 1, recusou: 1 });
    expect(JSON.stringify(r.body)).not.toMatch(/person|acolhido|nome/i);
    expect(r.body.aviso).toMatch(/nunca de uma criança/);
  });

  it('o relatório do período conta o ÚLTIMO dia — antes ele ficava de fora', async () => {
    const r = await request(http).get(
      `/api/v1/reports/period?houseId=${ids.AI3}&de=${longe}&ate=${longe}`).set(auth(tokens.coord));
    expect(r.status).toBe(200);
    expect(r.body.numeros.refeicoesConferidas).toBeGreaterThanOrEqual(3);
    expect(r.body.numeros.refeicoesComExcecao).toBeGreaterThanOrEqual(2);
  });

  it('a outra casa não lê as refeições desta', async () => {
    const r = await request(http).get(`/api/v1/reports/period/meals?houseId=${ids.AI3}`).set(auth(tokens.coord4));
    expect(r.status).toBe(404);
  });
});
