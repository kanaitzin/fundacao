/**
 * O SIGILO POR REGISTRO DE SAÚDE (fase 287; decidido em 07/11).
 *
 * Esta suíte cobra:
 *  1. quem registra já marca como sigiloso, e quem não lê vê o tipo, o dia e quem registrou;
 *  2. a Enfermagem, a técnica e a coordenação leem o conteúdo; o Gestor Geral não;
 *  3. quem registrou marca depois, e o líder que não registrou não marca;
 *  4. tirar é da técnica e da coordenação, com o motivo; a Enfermagem não tira;
 *  5. o retorno marcado de uma consulta sigilosa não diz a especialidade;
 *  6. a Casa 04 não marca; tudo fica no histórico do sigilo e na auditoria da casa.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const ESPECIALIDADE = 'Especialidade da conferência 287';

describe('O sigilo por registro de saúde', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const auth = (k: string) => ({ Authorization: `Bearer ${t[k]}` });
  const historico = async (k: string) =>
    (await request(http).get(`/api/v1/nursing/history/${ids.crianca}`).set(auth(k))).body;
  const sigilo = (k: string, qual: string, id: string, corpo: Record<string, unknown>) =>
    request(http).post(`/api/v1/nursing/health-records/${qual}/${id}/confidential`).set(auth(k)).send(corpo);
  const enviar = (corpo: Record<string, unknown>) =>
    request(http).post('/api/v1/nursing/evolutions').set(auth('educador'))
      .send({ personId: ids.crianca, houseId: ids.AI3, tipo: 'consulta',
              quandoAconteceu: new Date().toISOString(), especialidade: ESPECIALIDADE,
              estadoRetorno: 'Voltou tranquila, conversou no caminho (conferência 287).', ...corpo });

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
      educador: 'educador.ai3@paodospobres.dev', lider: 'lider.ai3@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev', gestor: 'gestor@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
    })) t[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.crianca }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa' ORDER BY p.full_name OFFSET 9 LIMIT 1`, [ids.AI3]));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('quem registra já marca como sigiloso, e quem não lê vê só o tipo, o dia e quem registrou', async () => {
    const r = await enviar({ sigiloso: true, prazoRetorno: null });
    expect(r.status).toBe(201);
    ids.evolucao = r.body.id ?? r.body.evolutionId ?? r.body.out_evolution_id;
    ({ rows: [{ encounter_id: ids.consulta }] } = await admin.query(
      `SELECT encounter_id FROM health_evolution WHERE id = $1`, [ids.evolucao]));
    for (const quem of ['educador', 'lider', 'gestor']) {
      const h = await historico(quem);
      const ev = h.evolucoes.find((x: any) => x.id === ids.evolucao);
      expect(ev.sigiloso).toBe(true);
      expect(ev.estadoRetorno).toBeNull();
      expect(ev.acompanhante).toBeTruthy();
      const at = h.atendimentos.find((x: any) => x.id === ids.consulta);
      expect(at.sigiloso).toBe(true);
      expect(at.especialidade).toBeNull();
      expect(JSON.stringify(h)).not.toContain(ESPECIALIDADE);
    }
  });

  it('a Enfermagem, a técnica e a coordenação leem o conteúdo', async () => {
    for (const quem of ['enfermagem', 'tecnica', 'coord']) {
      const h = await historico(quem);
      expect(h.atendimentos.find((x: any) => x.id === ids.consulta).especialidade).toBe(ESPECIALIDADE);
      expect(h.evolucoes.find((x: any) => x.id === ids.evolucao).estadoRetorno).toMatch(/conferência 287/);
    }
  });

  it('quem registrou marca depois, e o líder que não registrou não marca', async () => {
    const r = await enviar({});
    expect(r.status).toBe(201);
    ids.outra = r.body.id ?? r.body.evolutionId ?? r.body.out_evolution_id;
    const h = await historico('educador');
    expect(h.evolucoes.find((x: any) => x.id === ids.outra).podeMarcar).toBe(true);
    expect((await sigilo('lider', 'atendimento', ids.outra, { sigiloso: true })).status).toBe(403);
    expect((await sigilo('educador', 'atendimento', ids.outra, { sigiloso: true })).status).toBe(201);
    expect((await sigilo('educador', 'atendimento', ids.outra, { sigiloso: true })).status).toBe(400);
  });

  it('tirar é da técnica e da coordenação, com o motivo; a Enfermagem não tira', async () => {
    expect((await sigilo('enfermagem', 'atendimento', ids.outra, { sigiloso: false, motivo: 'Não é mais preciso.' })).status).toBe(403);
    expect((await sigilo('tecnica', 'atendimento', ids.outra, { sigiloso: false })).status).toBe(400);
    expect((await sigilo('tecnica', 'atendimento', ids.outra, { sigiloso: false, motivo: 'A família já sabe e pediu para a equipe acompanhar.' })).status).toBe(201);
    const ev = (await historico('educador')).evolucoes.find((x: any) => x.id === ids.outra);
    expect(ev.sigiloso).toBe(false);
    expect(ev.estadoRetorno).toMatch(/conferência 287/);
    const { rows } = await admin.query(
      `SELECT confidential, reason FROM health_confidential_change WHERE evolution_id = $1 ORDER BY created_at`, [ids.outra]);
    expect(rows.map((x) => x.confidential)).toEqual([true, false]);
    expect(rows[1].reason).toMatch(/família já sabe/);
    const lida = (await historico('coord')).evolucoes.find((x: any) => x.id === ids.outra);
    expect(lida.historicoDoSigilo.map((x: any) => x.sigiloso)).toEqual([true, false]);
    expect(lida.historicoDoSigilo[1].por).toBeTruthy();
    expect((await historico('educador')).evolucoes.find((x: any) => x.id === ids.outra).historicoDoSigilo).toEqual([]);
  });

  it('o retorno marcado de uma consulta sigilosa não diz a especialidade', async () => {
    await admin.query(`UPDATE health_encounter SET status = 'retorno_pendente', return_on = app_hoje() + 7 WHERE id = $1`, [ids.consulta]);
    const r = await request(http).get(`/api/v1/nursing/evolutions/options?personId=${ids.crianca}`).set(auth('educador'));
    const ret = r.body.retornosMarcados.find((x: any) => x.id === ids.consulta);
    expect(ret.rotulo).toBe('Retorno de um registro sigiloso');
    await admin.query(`UPDATE health_encounter SET status = 'concluido', return_on = NULL WHERE id = $1`, [ids.consulta]);
  });

  it('a Casa 04 não marca, e tudo fica na auditoria da casa', async () => {
    expect((await sigilo('coord4', 'consulta', ids.consulta, { sigiloso: false, motivo: 'Tentativa de fora.' })).status).toBe(404);
    const { rows } = await admin.query(
      `SELECT action, house_id FROM audit_event WHERE action LIKE 'health.sigilo.%'
         AND entity_id = ANY($1::uuid[]) ORDER BY at`, [[ids.evolucao, ids.outra]]);
    expect(rows.map((x) => x.action)).toEqual(['health.sigilo.marcado', 'health.sigilo.marcado', 'health.sigilo.tirado']);
    expect(rows.every((x) => x.house_id === ids.AI3)).toBe(true);
  });
});
