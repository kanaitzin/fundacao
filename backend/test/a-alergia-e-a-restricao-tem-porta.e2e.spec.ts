/**
 * A ALERGIA E A RESTRIÇÃO ALIMENTAR TÊM PORTA (fase 166, 1623).
 *
 * Achado pela simulação do ciclo completo: *"uma criança possui restrição
 * alimentar"* não tinha como acontecer. `health_condition` e
 * `food_restriction` eram lidas pelo perfil, pela chamada do almoço, pela
 * folha da cozinha e pelo resumo de saúde que vai ao hospital, e só a semente
 * de dados as escrevia.
 *
 * E as políticas de escrita conferiam o CARGO e não a CASA (lição da 156): a
 * coordenação da Casa 04 gravaria alergia numa criança da Casa 03.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A alergia e a restrição alimentar têm porta', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const rodada = Date.now().toString(36);

  const auth = (tk: string) => ({ Authorization: `Bearer ${tk}` });
  const post = (tk: string, rota: string, corpo: any = {}) =>
    request(http).post(`/api/v1${rota}`).set(auth(tk)).send(corpo);

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
      enfermagem: 'enfermagem@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
    })) {
      t[k] = (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
    }
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const p = await post(t.tecnica, '/people', {
      houseId: ids.AI3, fullName: `Criança da Alergia ${rodada} (fictícia)`, socialName: `Ale${rodada}`,
      birthDate: '2016-02-02', provisionalReason: 'Ingresso de teste automatizado, dados fictícios' });
    ids.crianca = p.body.personId;
  });

  afterAll(async () => {
    await post(t.tecnica, `/people/${ids.crianca}/discharge`, { motivo: 'Encerramento de fixture de teste' });
    await app.close(); await admin.end();
  });

  it('a Enfermagem registra a alergia como alerta essencial, e ela chega ao perfil e ao resumo de saúde', async () => {
    const r = await post(t.enfermagem, `/people/${ids.crianca}/health-conditions`,
      { tipo: 'alergia', descricao: 'amendoim', gravidade: 'grave', alertaEssencial: true });
    expect(r.status).toBe(201);
    ids.alergia = r.body.id;
    /* Lido por OUTRO cargo (lição da 152). */
    const perfil = await request(http).get(`/api/v1/people/${ids.crianca}`).set(auth(t.educador));
    expect(JSON.stringify(perfil.body)).toContain('Alergia a amendoim');
    const resumo = await post(t.enfermagem, `/nursing/summary/${ids.crianca}`, { finalidade: 'consulta' });
    expect(resumo.status).toBe(201);
    expect(resumo.body.alergias.map((a: any) => a.descricao)).toContain('amendoim');
  });

  it('a técnica registra a restrição, e ela chega à folha da cozinha', async () => {
    const r = await post(t.tecnica, `/people/${ids.crianca}/food-restrictions`,
      { restricao: `Glúten ${rodada}`, substituicao: 'Pão sem glúten', orientacao: 'Conferir o rótulo' });
    expect(r.status).toBe(201);
    ids.restricao = r.body.id;
    const folha = await request(http)
      .get(`/api/v1/people/kitchen-requests/folha/restricoes?houseId=${ids.AI3}`).set(auth(t.coord));
    expect(JSON.stringify(folha.body)).toContain(`Glúten ${rodada}`);
  });

  it('o educador não registra, e o registro pede o que importa', async () => {
    const e = await post(t.educador, `/people/${ids.crianca}/health-conditions`,
      { tipo: 'alergia', descricao: 'poeira' });
    expect(e.status).toBe(403);
    const sem = await post(t.enfermagem, `/people/${ids.crianca}/health-conditions`, { tipo: 'alergia' });
    expect(sem.status).toBe(400);
    const tipo = await post(t.enfermagem, `/people/${ids.crianca}/health-conditions`,
      { tipo: 'mania', descricao: 'qualquer' });
    expect(tipo.status).toBe(400);
  });

  it('a coordenação de OUTRA casa não grava alergia nem restrição nesta criança', async () => {
    const a = await post(t.coord4, `/people/${ids.crianca}/health-conditions`,
      { tipo: 'alergia', descricao: 'camarão' });
    expect(a.status).toBe(404);
    const r = await post(t.coord4, `/people/${ids.crianca}/food-restrictions`, { restricao: 'Ovo' });
    expect(r.status).toBe(404);
    const { rows: [n] } = await admin.query(
      `SELECT (SELECT count(*) FROM health_condition WHERE person_id = $1 AND description = 'camarão')::int AS a,
              (SELECT count(*) FROM food_restriction WHERE person_id = $1 AND restriction = 'Ovo')::int AS r`,
      [ids.crianca]);
    expect(n).toEqual({ a: 0, r: 0 });
    /* A política, sozinha: um INSERT SEM `RETURNING`, com a identidade da
       coordenação da Casa 04 e o papel da aplicação. Pela rota o `RETURNING`
       já recusava, por coincidência (ele exige poder LER a linha); a política
       é o que recusa quando o caminho não pede a linha de volta. */
    const { rows: [c4] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'coord.ai4@paodospobres.dev'`);
    for (const sql of [
      `INSERT INTO health_condition (person_id, kind, description) VALUES ($1, 'alergia', 'lagosta')`,
      `INSERT INTO food_restriction (person_id, restriction) VALUES ($1, 'Soja')`,
    ]) {
      await admin.query('BEGIN');
      try {
        await admin.query('SET LOCAL ROLE rede_app');
        await admin.query(`SELECT set_config('app.user_id', $1, true)`, [c4.id]);
        await expect(admin.query(sql, [ids.crianca])).rejects.toThrow(/row-level security/);
      } finally { await admin.query('ROLLBACK'); }
    }
    /* Nem encerrar a de cá. */
    const fim = await post(t.coord4, `/people/health-conditions/${ids.alergia}/end`,
      { motivo: 'Tentativa de outra casa.' });
    expect(fim.status).toBe(404);
  });

  it('encerrar pede motivo, some do perfil e fica no banco com quem encerrou', async () => {
    const sem = await post(t.tecnica, `/people/food-restrictions/${ids.restricao}/end`, {});
    expect(sem.status).toBe(400);
    const r = await post(t.tecnica, `/people/food-restrictions/${ids.restricao}/end`,
      { motivo: 'Exame novo descartou a doença celíaca.' });
    expect(r.status).toBe(201);
    const { rows: [x] } = await admin.query(
      `SELECT active, end_reason, ended_by IS NOT NULL AS com_autor FROM food_restriction WHERE id = $1`,
      [ids.restricao]);
    expect(x).toEqual({ active: false, end_reason: 'Exame novo descartou a doença celíaca.', com_autor: true });
    const de2 = await post(t.tecnica, `/people/food-restrictions/${ids.restricao}/end`,
      { motivo: 'De novo, por engano.' });
    expect(de2.status).toBe(404);
  });

  it('a auditoria diz a casa das quatro ações', async () => {
    const { rows } = await admin.query(
      `SELECT action, house_id FROM audit_event
        WHERE entity_id = ANY($1::uuid[]) ORDER BY at`, [[ids.alergia, ids.restricao]]);
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining([
      'person.health_condition.add', 'person.food_restriction.add', 'person.food_restriction.end']));
    expect(rows.every((r) => r.house_id === ids.AI3)).toBe(true);
  });
});
