/**
 * "CONCLUÍ TUDO ATÉ AGORA" (fase 181, decisão de 30/09, §10 item 3).
 *
 * Só as atividades COLETIVAS da casa, pendentes, até agora. Remédio e saúde
 * nunca, e também a urgente, a que espera ciência e a que ainda não chegou na
 * hora. E não é lote silencioso: o ato tem registro próprio, imutável, e cada
 * execução aponta para ele.
 *
 * Roda na ARM3, com um educador fictício criado aqui: as atividades precisam
 * ser de hoje, e as outras suítes contam o dia da AI3.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Concluí tudo até agora', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const criadas: string[] = [];
  const auth = (tk: string) => ({ Authorization: `Bearer ${tk}` });
  const login = async (email: string, senha = SENHA) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: senha })).body.token as string;

  const atividade = async (titulo: string, extra: {
    kind?: string; pessoa?: string | null; minutos?: number; urgente?: boolean; estado?: string;
  } = {}) => {
    const { rows: [a] } = await admin.query(
      `INSERT INTO activity (house_id, person_id, kind, title, scheduled_at, state, urgent, urgent_reason)
       VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5), $6::activity_state, $7,
               CASE WHEN $7 THEN 'Teste de urgência' END)
       RETURNING id`,
      [ids.ARM3, extra.pessoa ?? null, extra.kind ?? 'refeicao', titulo, extra.minutos ?? -1,
       extra.estado ?? 'agendada', extra.urgente ?? false]);
    criadas.push(a.id);
    return a.id as string;
  };
  const estadoDe = async (id: string) =>
    (await admin.query(`SELECT state FROM activity WHERE id = $1`, [id])).rows[0].state;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();

    ids.ARM3 = (await admin.query(`SELECT id FROM house WHERE code = 'ARM3'`)).rows[0].id;
    ids.AI3 = (await admin.query(`SELECT id FROM house WHERE code = 'AI3'`)).rows[0].id;
    t.gestor = await login('gestor@paodospobres.dev');
    t.educadorAI3 = await login('educador.ai3@paodospobres.dev');
    const email = `concluido.${Date.now()}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set(auth(t.gestor))
      .send({ nome: 'Educador do Concluído (fictício)', email, cargo: 'educador', casaId: ids.ARM3 });
    expect(r.status).toBe(201);
    ids.educador = r.body.id;
    t.educador = await login(email, r.body.senhaInicial);

    /* Uma criança da ARM3, para a atividade que NÃO é coletiva. */
    const { rows: [p] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa' LIMIT 1`, [ids.ARM3]);
    ids.crianca = p?.person_id ?? null;
  });

  afterAll(async () => {
    /* As atividades de hoje saem da linha do dia de quem vier depois. */
    await admin.query(
      `UPDATE activity SET state = 'cancelada_externamente' WHERE id = ANY($1::uuid[])
          AND state NOT IN ('concluida_no_horario')`, [criadas]);
    await admin.query(`UPDATE app_user SET active = false WHERE id = $1`, [ids.educador]);
    await admin.query(`UPDATE user_house_assignment SET valid_to = app_hoje() - 1
                        WHERE user_id = $1 AND valid_to IS NULL`, [ids.educador]);
    await app.close(); await admin.end();
  });

  it('conclui só as coletivas pendentes até agora, e deixa o resto na linha do dia', async () => {
    const cafe = await atividade('Café da manhã (teste)');
    const banho = await atividade('Banho (teste)', { kind: 'banho', minutos: -2, estado: 'sem_confirmacao' });
    const remedio = await atividade('Hora do remédio (teste)', { kind: 'medicamento' });
    const consulta = await atividade('Saúde coletiva (teste)', { kind: 'saude' });
    const urgente = await atividade('Urgente (teste)', { urgente: true });
    const ciencia = await atividade('Espera ciência (teste)', { estado: 'aguardando_ciencia' });
    const depois = await atividade('Jantar (teste)', { minutos: 120 });
    const daCrianca = ids.crianca
      ? await atividade('Escola da criança (teste)', { kind: 'escola', pessoa: ids.crianca }) : null;

    const r = await request(http).post('/api/v1/activities/complete-collective')
      .set(auth(t.educador)).send({ houseId: ids.ARM3 });
    expect(r.status).toBe(201);
    expect(r.body.quantas).toBe(2);
    expect(r.body.atividades).toEqual(['Banho (teste)', 'Café da manhã (teste)']);

    expect(await estadoDe(cafe)).toBe('concluida_no_horario');
    expect(await estadoDe(banho)).toBe('concluida_no_horario');
    expect(await estadoDe(remedio)).toBe('agendada');
    expect(await estadoDe(consulta)).toBe('agendada');
    expect(await estadoDe(urgente)).toBe('agendada');
    expect(await estadoDe(ciencia)).toBe('aguardando_ciencia');
    expect(await estadoDe(depois)).toBe('agendada');
    if (daCrianca) expect(await estadoDe(daCrianca)).toBe('agendada');
  });

  it('não é silencioso: o ato tem registro próprio, com quem e quantas, e não se altera', async () => {
    const { rows: [b] } = await admin.query(
      `SELECT id, quantos, declared_by FROM activity_bulk WHERE house_id = $1
        ORDER BY declared_at DESC LIMIT 1`, [ids.ARM3]);
    expect(b.quantos).toBe(2);
    expect(b.declared_by).toBe(ids.educador);
    const { rows: execs } = await admin.query(
      `SELECT user_id, note FROM activity_execution WHERE bulk_id = $1`, [b.id]);
    expect(execs).toHaveLength(2);
    expect(execs.every((e: any) => e.user_id === ids.educador)).toBe(true);
    await expect(admin.query(`UPDATE activity_bulk SET quantos = 1 WHERE id = $1`, [b.id])).rejects.toThrow();
    await expect(admin.query(`DELETE FROM activity_bulk WHERE id = $1`, [b.id])).rejects.toThrow();
    const { rows: [aud] } = await admin.query(
      `SELECT house_id, detail FROM audit_event WHERE action = 'activity.bulk_complete' AND entity_id = $1`, [b.id]);
    expect(aud.house_id).toBe(ids.ARM3);
    expect(aud.detail.quantos).toBe(2);
  });

  it('sem coletiva pendente, diz o que continua sendo um por um', async () => {
    const r = await request(http).post('/api/v1/activities/complete-collective')
      .set(auth(t.educador)).send({ houseId: ids.ARM3 });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Remédio/);
  });

  it('a casa de fora não conclui nada daqui', async () => {
    const outra = await atividade('Lanche da tarde (teste)', { minutos: -5 });
    const r = await request(http).post('/api/v1/activities/complete-collective')
      .set(auth(t.educadorAI3)).send({ houseId: ids.ARM3 });
    expect(r.status).toBe(404);
    expect(await estadoDe(outra)).toBe('agendada');
  });
});
