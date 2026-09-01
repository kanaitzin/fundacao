/**
 * SUBSTITUIÇÃO DE ATIVIDADE (§8.3) e ATIVIDADE URGENTE (§8.2).
 *
 * Cinco rotas existiam desde a fase 3 e nenhuma tela as chamava. "Não vou
 * conseguir levar o Bruno na fono" era conversa no corredor ou no grupo de
 * mensagens — e grupo de mensagens é o que o §2 proíbe.
 *
 * O que este teste guarda:
 *
 *  * **delegar e substituir não são a mesma coisa.** Delegar é de cima para
 *    baixo, do líder; o PEDIDO nasce de quem VAI SAIR, e qualquer pessoa do
 *    turno pode fazê-lo. Quem faltou não pede nada;
 *  * **o pedido fica EM ABERTO até alguém decidir.** A atividade vai para
 *    "aguardando substituição" e ninguém é dado como substituído sozinho;
 *  * **quem decide é o líder, a técnica ou a coordenação** — e recusar exige
 *    motivo, porque quem pediu vai ler;
 *  * **não cabe substituição no que já aconteceu.** A atividade encerrada
 *    recusa o pedido, e o pedido que ficou sem efeito enquanto esperava é
 *    marcado — o sistema não o fecha sozinho, mas diz o que houve;
 *  * **a atividade urgente é PONTUAL**: entra no dia com autoria e motivo, e
 *    não altera a rotina da casa. Sem motivo, o servidor recusa.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Substituição de atividade e atividade urgente', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const pedidos = async (token: string) =>
    (await request(http).get(`/api/v1/activities/substitutions?houseId=${ids.AI3}`)
      .set(auth(token))).body;
  /** Uma atividade urgente serve de fixture: ela nasce em aberto e é minha. */
  const criarAtividade = async (titulo: string, minutos = 120) => {
    const res = await request(http).post('/api/v1/activities/urgent').set(auth(tokens.lider))
      .send({ houseId: ids.AI3, title: titulo, reason: 'Fixture do ensaio de substituição.',
              scheduledAt: new Date(Date.now() + minutos * 60_000).toISOString() });
    expect(res.status).toBe(201);
    return res.body.id as string;
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
      educador: 'educador.ai3@paodospobres.dev',
      educador2: 'educador2.ai3@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.substituto }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador2.ai3@paodospobres.dev'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== A atividade urgente ====================

  it('a atividade urgente exige motivo, e é do líder ou da técnica', async () => {
    const doEducador = await request(http).post('/api/v1/activities/urgent')
      .set(auth(tokens.educador))
      .send({ houseId: ids.AI3, title: 'Consulta encaixada',
              scheduledAt: new Date().toISOString(), reason: 'A UBS ligou agora.' });
    expect(doEducador.status).toBe(403);

    const semMotivo = await request(http).post('/api/v1/activities/urgent')
      .set(auth(tokens.lider))
      .send({ houseId: ids.AI3, title: 'Consulta encaixada',
              scheduledAt: new Date().toISOString(), reason: '  ' });
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.message).toMatch(/motivo/i);
  });

  it('ela é PONTUAL: entra no dia com autoria e motivo, sem mexer na rotina', async () => {
    const res = await request(http).post('/api/v1/activities/urgent').set(auth(tokens.lider))
      .send({ houseId: ids.AI3, title: 'Consulta encaixada na UBS',
              scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
              reason: 'A UBS ligou agora oferecendo a vaga que estava na fila desde março.',
              instructions: 'Levar a carteirinha e a caderneta.' });
    expect(res.status).toBe(201);
    expect(res.body.aviso).toMatch(/planejamento regular não foi alterado/i);
    ids.urgente = res.body.id;

    const { rows: [a] } = await admin.query(
      `SELECT urgent, urgent_reason, state, requires_ack, created_by FROM activity WHERE id=$1`,
      [ids.urgente]);
    expect(a.urgent).toBe(true);
    expect(a.urgent_reason).toMatch(/fila desde março/);
    // Nasce aguardando CIÊNCIA: designado não é o mesmo que avisado.
    expect(a.state).toBe('aguardando_ciencia');
    expect(a.requires_ack).toBe(true);
    expect(a.created_by).toBeTruthy();

    // E a rotina da casa continua exatamente como estava.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM routine_item ri
         JOIN routine_version v ON v.id = ri.version_id
        WHERE v.house_id = $1 AND ri.title = 'Consulta encaixada na UBS'`, [ids.AI3]);
    expect(rows[0].n).toBe(0);
  });

  // ==================== O pedido ====================

  it('qualquer pessoa do turno pede, e o motivo é obrigatório', async () => {
    ids.atividade = await criarAtividade('Fono do ensaio de substituição');

    const semMotivo = await request(http)
      .post(`/api/v1/activities/${ids.atividade}/substitution`)
      .set(auth(tokens.educador)).send({ motivo: '' });
    expect(semMotivo.status).toBe(400);

    // O EDUCADOR pede — e isto é o contrário de delegar, que é do líder.
    const res = await request(http)
      .post(`/api/v1/activities/${ids.atividade}/substitution`)
      .set(auth(tokens.educador))
      .send({ motivo: 'Preciso sair às 16h para uma consulta e não volto a tempo.' });
    expect(res.status).toBe(201);

    const { rows: [a] } = await admin.query(
      `SELECT state FROM activity WHERE id=$1`, [ids.atividade]);
    expect(a.state).toBe('aguardando_substituicao');

    const lista = await pedidos(tokens.lider);
    const meu = lista.find((s: any) => /consulta e não volto/.test(s.motivo));
    expect(meu.status).toBe('solicitada');
    expect(meu.pedidoPor).toBeTruthy();
    expect(meu.substituto).toBeNull();
    ids.pedido = meu.id;
  });

  it('o educador não decide o próprio pedido', async () => {
    const res = await request(http)
      .post(`/api/v1/activities/substitutions/${ids.pedido}/assign`)
      .set(auth(tokens.educador)).send({ substitutoId: ids.substituto });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/líder|equipe técnica|coordenação/i);
  });

  it('quem assume precisa tomar ciência — designado não é avisado', async () => {
    const res = await request(http)
      .post(`/api/v1/activities/substitutions/${ids.pedido}/assign`)
      .set(auth(tokens.lider))
      .send({ substitutoId: ids.substituto, nota: 'Combinei com ela; leva as duas juntas.' });
    expect(res.status).toBe(201);

    const { rows: [a] } = await admin.query(
      `SELECT state FROM activity WHERE id=$1`, [ids.atividade]);
    expect(a.state).toBe('aguardando_ciencia');

    const lista = await pedidos(tokens.lider);
    const meu = lista.find((s: any) => s.id === ids.pedido);
    expect(meu.status).toBe('atribuida');
    expect(meu.substituto).toBeTruthy();
  });

  it('recusar exige motivo, e quem pediu é avisado pelo sistema', async () => {
    const outra = await criarAtividade('Reunião do ensaio de substituição', 180);
    const pedido = await request(http).post(`/api/v1/activities/${outra}/substitution`)
      .set(auth(tokens.educador))
      .send({ motivo: 'Vou estar na escola com o Igor nesse horário.' });
    expect(pedido.status).toBe(201);
    const lista = await pedidos(tokens.lider);
    const alvo = lista.find((s: any) => /escola com o Igor/.test(s.motivo));

    const semMotivo = await request(http)
      .post(`/api/v1/activities/substitutions/${alvo.id}/decline`)
      .set(auth(tokens.coord)).send({ motivo: '' });
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.message).toMatch(/quem pediu vai ler/i);

    const res = await request(http)
      .post(`/api/v1/activities/substitutions/${alvo.id}/decline`)
      .set(auth(tokens.coord))
      .send({ motivo: 'Não há outra pessoa na escala hoje; a reunião será remarcada.' });
    expect(res.status).toBe(201);

    // O aviso é do SISTEMA — é o que substitui o recado no corredor (§3.3).
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM notification n
        WHERE n.entity = 'activity' AND n.entity_id = $1`, [outra]);
    expect(rows[0].n).toBeGreaterThan(0);

    const depois = await pedidos(tokens.educador);
    const meu = depois.find((s: any) => s.id === alvo.id);
    expect(meu.status).toBe('recusada');
    expect(meu.decidiuNota).toMatch(/remarcada/);
  });

  // ==================== O que já aconteceu ====================

  it('não cabe substituição no que já foi encerrado', async () => {
    const feita = await criarAtividade('Atividade concluída do ensaio', 240);
    await request(http).post(`/api/v1/activities/${feita}/acknowledge`)
      .set(auth(tokens.lider)).send({});
    const fim = await request(http).post(`/api/v1/activities/${feita}/record`)
      .set(auth(tokens.lider)).send({ estado: 'concluida_no_horario' });
    expect(fim.status).toBe(201);

    const res = await request(http).post(`/api/v1/activities/${feita}/substitution`)
      .set(auth(tokens.educador)).send({ motivo: 'Pedido que chegou tarde demais.' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/já aconteceu/i);
  });

  it('o pedido que perdeu o sentido enquanto esperava vem MARCADO, e não some', async () => {
    const alvo = await criarAtividade('Atividade que vai ser concluída no meio', 300);
    await request(http).post(`/api/v1/activities/${alvo}/substitution`)
      .set(auth(tokens.educador))
      .send({ motivo: 'Pedido que vai perder o sentido enquanto espera.' });

    // Outra pessoa conclui enquanto o pedido aguarda — é o caso real.
    await admin.query(
      `UPDATE activity SET state='concluida_no_horario' WHERE id=$1`, [alvo]);

    const lista = await pedidos(tokens.lider);
    const meu = lista.find((s: any) => /perder o sentido/.test(s.motivo));
    expect(meu.status).toBe('solicitada');
    expect(meu.semEfeito).toBe(true);
    expect(meu.aviso).toMatch(/já foi encerrada/i);
    // O sistema NÃO fecha sozinho: recusar é decisão de quem lidera.
  });

  it('tudo ficou auditado, com autor (regra 6)', async () => {
    const { rows } = await admin.query(
      `SELECT DISTINCT action FROM audit_event
        WHERE action IN ('activity.create_urgent','substitution.request',
                         'substitution.assign','substitution.decline')`);
    expect(rows.map((r) => r.action).sort()).toEqual(
      ['activity.create_urgent', 'substitution.assign',
       'substitution.decline', 'substitution.request']);
  });
});
