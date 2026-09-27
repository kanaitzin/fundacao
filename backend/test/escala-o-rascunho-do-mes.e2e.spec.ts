/**
 * REPETIR A ESCALA DO MÊS ANTERIOR, COMO RASCUNHO (fase 165).
 *
 * Pedido de 25/09: *"copiar a escala anterior para o novo mês como rascunho
 * editável. Não publique automaticamente sem revisão."* Decisões de 27/09: o
 * dia novo copia o mesmo dia da semana quatro semanas antes; só quem monta a
 * escala vê o rascunho; e a passagem só cobra pela escala publicada.
 *
 * Tudo na Casa 04 e três meses à frente: a AI3 é disputada (regra 13), e as
 * outras suítes da escala olham os próximos trinta dias.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O rascunho da escala do mês', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let MES = '', DIA = '', ORIGEM = '', DIA2 = '', ORIGEM2 = '', LIVRE = '';

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const publicada = async (dia: string) =>
    (await request(http).get(`/api/v1/escala?houseId=${ids.AI4}&de=${dia}&ate=${dia}`)
      .set(auth(tokens.coord))).body.dias[0];

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();

    tokens.coord = await login('coord.ai4@paodospobres.dev');
    tokens.educador = await login('educador.ai4@paodospobres.dev');
    tokens.coord3 = await login('coord.ai3@paodospobres.dev');
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ id: ids.educador }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai4@paodospobres.dev'`));

    /* O mês três à frente; o dia 1 e o dia 29 dele, e os dias de origem pela
       regra: 28 dias antes, ou 56 se 28 cair no próprio mês. O dia 29 volta,
       por isso, ao MESMO dia de origem do dia 1 (29 - 56 = 1 - 28). */
    const { rows: [d] } = await admin.query(`
      WITH m AS (SELECT date_trunc('month', app_hoje() + interval '3 months')::date AS mes)
      SELECT mes::text AS mes, mes::text AS dia, (mes - 28)::text AS origem,
             (mes + 28)::text AS dia2, (mes + 28 - 56)::text AS origem2,
             (mes + 1)::text AS livre
        FROM m`);
    ({ mes: MES, dia: DIA, origem: ORIGEM, dia2: DIA2, origem2: ORIGEM2, livre: LIVRE } = d);

    /* A escala publicada do mês anterior: a educadora no diurno do dia de
       origem, e no noturno do outro. */
    for (const [data, turno] of [[ORIGEM, 'diurno'], [ORIGEM2, 'noturno']]) {
      const r = await request(http).post('/api/v1/escala').set(auth(tokens.coord))
        .send({ houseId: ids.AI4, userId: ids.educador, data, turno });
      expect(r.status).toBe(201);
    }

    /* Uma pessoa que sai da Fundação entre a escala e a cópia. */
    const nova = await request(http).post('/api/v1/staff').set(auth(tokens.coord)).send({
      nome: 'Débora Que Saiu (fictícia)', email: `debora.saiu.${Date.now()}@paodospobres.dev`,
      cargo: 'educador', casaId: ids.AI4, senhaInicial: 'senha-da-debora',
    });
    ids.debora = nova.body.id;
    await request(http).post('/api/v1/escala').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, userId: ids.debora, data: ORIGEM, turno: 'noturno' });
    await request(http).post(`/api/v1/staff/${ids.debora}/deactivate`).set(auth(tokens.coord))
      .send({ motivo: 'Desligada, no cenário fictício desta suíte.' });
  });

  afterAll(async () => {
    /* Desfazer é revogar (a escala recusa DELETE): só as linhas desta suíte. */
    await admin.query(
      `UPDATE shift_assignment SET revoked_at = now(), revoked_by = created_by,
              revoke_reason = 'Escala criada pela suíte do rascunho.'
        WHERE house_id = $1 AND revoked_at IS NULL AND on_date BETWEEN $2::date - 60 AND $2::date + 40`,
      [ids.AI4, MES]);
    await app.close(); await admin.end();
  });

  it('o educador não repete a escala, e a coordenação de outra casa também não', async () => {
    const e = await request(http).post('/api/v1/escala/rascunho').set(auth(tokens.educador))
      .send({ houseId: ids.AI4, mes: MES.slice(0, 7) });
    expect(e.status).toBe(403);
    const outra = await request(http).post('/api/v1/escala/rascunho').set(auth(tokens.coord3))
      .send({ houseId: ids.AI4, mes: MES.slice(0, 7) });
    expect(outra.status).toBe(403);
  });

  it('repetir copia o mesmo dia da semana, e deixa de fora quem saiu, pelo nome', async () => {
    const r = await request(http).post('/api/v1/escala/rascunho').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, mes: MES.slice(0, 7) });
    expect(r.status).toBe(201);
    ids.rascunho = r.body.rascunhoId;
    expect(r.body.foraPorInativo).toEqual(['Débora Que Saiu (fictícia)']);
    expect(r.body.aviso).toMatch(/ainda não vale/);

    const v = await request(http).get(`/api/v1/escala/rascunho?houseId=${ids.AI4}&mes=${MES.slice(0, 7)}`)
      .set(auth(tokens.coord));
    expect(v.status).toBe(200);
    const itens = v.body.rascunho.itens;
    expect(itens.some((i: any) => i.data === DIA && i.turno === 'diurno' && i.userId === ids.educador))
      .toBe(true);
    /* 28 dias depois do dia 1 cai no próprio mês: a origem é 56 dias antes. */
    expect(itens.some((i: any) => i.data === DIA2 && i.turno === 'noturno')).toBe(true);
    expect(new Date(`${DIA}T12:00:00Z`).getUTCDay()).toBe(new Date(`${ORIGEM}T12:00:00Z`).getUTCDay());
    expect(itens.some((i: any) => i.quem === 'Débora Que Saiu (fictícia)')).toBe(false);
  });

  it('o rascunho não vale: a escala publicada continua vazia, e o educador não o vê', async () => {
    expect((await publicada(DIA)).diurno).toEqual([]);
    const v = await request(http).get(`/api/v1/escala/rascunho?houseId=${ids.AI4}&mes=${MES.slice(0, 7)}`)
      .set(auth(tokens.educador));
    expect(v.status).toBe(403);
  });

  it('um segundo rascunho do mesmo mês é recusado enquanto o primeiro está aberto', async () => {
    const r = await request(http).post('/api/v1/escala/rascunho').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, mes: MES.slice(0, 7) });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/já existe um rascunho aberto/);
  });

  it('o rascunho se edita: incluir e retirar, e dia de outro mês é recusado', async () => {
    const inc = await request(http).post(`/api/v1/escala/rascunho/${ids.rascunho}/itens`)
      .set(auth(tokens.coord)).send({ userId: ids.educador, data: LIVRE, turno: 'noturno' });
    expect(inc.status).toBe(201);
    const fora = await request(http).post(`/api/v1/escala/rascunho/${ids.rascunho}/itens`)
      .set(auth(tokens.coord)).send({ userId: ids.educador, data: ORIGEM, turno: 'noturno' });
    expect(fora.status).toBe(400);
    const saiu = await request(http).post(`/api/v1/escala/rascunho/itens/${inc.body.id}/retirar`)
      .set(auth(tokens.coord)).send({});
    expect(saiu.status).toBe(201);
    /* Retirado não some da tabela: fica marcado, com quem retirou. */
    const { rows: [r] } = await admin.query(
      `SELECT removed_at IS NOT NULL AS retirado, removed_by IS NOT NULL AS com_autor
         FROM shift_draft_item WHERE id = $1`, [inc.body.id]);
    expect(r).toEqual({ retirado: true, com_autor: true });
  });

  it('a pessoa já escalada noutra casa no mesmo turno aparece como conflito', async () => {
    const { rows: [ai3] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`);
    const { rows: [coord3] } = await admin.query(
      `SELECT id FROM app_user WHERE email='coord.ai3@paodospobres.dev'`);
    /* Escrito pelo admin porque a coordenação de uma casa não escala gente
       de outra: o cenário é o do Gestor que cobre as duas. */
    await admin.query(
      `INSERT INTO shift_assignment (house_id, user_id, on_date, period, created_by)
       VALUES ($1, $2, $3, 'diurno', $4)`, [ai3.id, ids.educador, DIA, coord3.id]);
    const v = await request(http).get(`/api/v1/escala/rascunho?houseId=${ids.AI4}&mes=${MES.slice(0, 7)}`)
      .set(auth(tokens.coord));
    const item = v.body.rascunho.itens.find((i: any) => i.data === DIA && i.turno === 'diurno');
    expect(item.conflito).toBe('outra_casa');
    expect(item.conflitoCasa).toBe('AI3');
    await admin.query(
      `UPDATE shift_assignment SET revoked_at = now(), revoked_by = created_by,
              revoke_reason = 'Conflito criado pela suíte do rascunho.'
        WHERE house_id = $1 AND on_date = $2 AND revoked_at IS NULL`, [ai3.id, DIA]);
  });

  it('publicar leva o rascunho para a escala, com autor, e ele não se publica duas vezes', async () => {
    const p = await request(http).post(`/api/v1/escala/rascunho/${ids.rascunho}/publicar`)
      .set(auth(tokens.coord)).send({});
    expect(p.status).toBe(201);
    expect(p.body.publicados).toBeGreaterThanOrEqual(2);
    expect((await publicada(DIA)).diurno.map((x: any) => x.userId)).toContain(ids.educador);

    const de_novo = await request(http).post(`/api/v1/escala/rascunho/${ids.rascunho}/publicar`)
      .set(auth(tokens.coord)).send({});
    expect(de_novo.status).toBe(400);

    const { rows: [a] } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event
        WHERE action = 'escala.rascunho.publicado' AND entity_id = $1 AND house_id = $2`,
      [ids.rascunho, ids.AI4]);
    expect(a.n).toBe(1);
  });

  it('descartar pede motivo, e o descartado continua registrado', async () => {
    /* Depois de publicado, o mês aceita um rascunho novo. */
    const novo = await request(http).post('/api/v1/escala/rascunho').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, mes: MES.slice(0, 7) });
    expect(novo.status).toBe(201);
    const sem = await request(http).post(`/api/v1/escala/rascunho/${novo.body.rascunhoId}/descartar`)
      .set(auth(tokens.coord)).send({});
    expect(sem.status).toBe(400);
    const com = await request(http).post(`/api/v1/escala/rascunho/${novo.body.rascunhoId}/descartar`)
      .set(auth(tokens.coord)).send({ motivo: 'A escala do mês foi refeita na reunião.' });
    expect(com.status).toBe(201);
    const { rows: [r] } = await admin.query(
      `SELECT discard_reason FROM shift_draft WHERE id = $1`, [novo.body.rascunhoId]);
    expect(r.discard_reason).toBe('A escala do mês foi refeita na reunião.');
  });

  it('mês que já passou não se remonta, e mês em formato errado é recusado em português', async () => {
    const { rows: [m] } = await admin.query(
      `SELECT to_char(app_hoje() - interval '2 months', 'YYYY-MM') AS m`);
    const velho = await request(http).post('/api/v1/escala/rascunho').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, mes: m.m });
    expect(velho.status).toBe(400);
    const lixo = await request(http).post('/api/v1/escala/rascunho').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, mes: 'outubro' });
    expect(lixo.status).toBe(400);
    expect(lixo.body.message).toMatch(/formato 2026-10/);
  });
});
