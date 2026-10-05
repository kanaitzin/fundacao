/**
 * O QUE MUDOU DESDE O MEU ÚLTIMO PLANTÃO (fase 186, ideia 1 de 30/09; o que
 * entra decidido em 05/10: ocorrências, a ATA anterior e remédio novo,
 * suspenso ou mudado).
 *
 * Tudo na Casa 04, com uma conta de educador criada pela suíte e desativada no
 * fim: a equipe da Casa 03 é contada por outras suítes. As ocorrências ficam
 * (nada se apaga), como na `de-onde-vem-a-fonte`; a prescrição nasce para
 * 2040, para não gerar dose de hoje, e sai suspensa.
 *
 * Cobra-se:
 *  - DESDE QUANDO: o fim do último turno da pessoa na escala; sem escala, as
 *    últimas 24 horas; e nunca mais de sete dias para trás;
 *  - o que aparece e o que não aparece: a ocorrência de antes do plantão fica
 *    de fora, a restrita não diz o nome da criança;
 *  - o remédio novo e, depois de suspenso pela rota, o suspenso com o instante
 *    que a suspensão passou a guardar;
 *  - quem lê: o gestor não, e quem é de outra casa recebe 404 (a portaria
 *    não alcança casa nenhuma, e a semente não tem conta dela).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O que mudou desde o meu último plantão', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const rodada = Date.now().toString(36);
  const MEDICAMENTO = `Remédio da suíte ${rodada} (fictício)`;

  const login = async (email: string, senha = SENHA) => {
    const r = await request(http).post('/api/v1/auth/login').send({ email, password: senha });
    if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
    return r.body.token as string;
  };
  const auth = (tk: string) => ({ Authorization: `Bearer ${tk}` });
  const folha = (tk: string, casa = ids.AI4) =>
    request(http).get(`/api/v1/reports/o-que-mudou?houseId=${casa}`).set(auth(tk));
  const turno = async (dias: number, periodo: string) => admin.query(
    `INSERT INTO shift_assignment (house_id, user_id, on_date, period, created_by)
     VALUES ($1, $2, app_hoje() - $3::int, $4, $5)`, [ids.AI4, ids.educador, dias, periodo, ids.coord]);
  const fimDo = async (dias: number, periodo: string) => new Date((await admin.query(
    `SELECT ate FROM app_janela_do_turno($1, app_hoje() - $2::int, $3)`, [ids.AI4, dias, periodo])).rows[0].ate);

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    const { rows } = await admin.query(`SELECT code, id FROM house`);
    for (const r of rows) ids[r.code] = r.id;
    ids.coord = (await admin.query(`SELECT id FROM app_user WHERE email = 'coord.ai4@paodospobres.dev'`)).rows[0].id;
    ids.lucas = (await admin.query(
      `SELECT s.person_id FROM house_stay s WHERE s.house_id = $1 AND s.ended_at IS NULL LIMIT 1`, [ids.AI4])).rows[0].person_id;
    t.coord = await login('coord.ai4@paodospobres.dev');
    t.gestor = await login('gestor@paodospobres.dev');
    t.educador3 = await login('educador.ai3@paodospobres.dev');

    const email = `educador.mudou.${rodada}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set(auth(t.coord))
      .send({ nome: 'Educador da Folha do Plantão (fictício)', email, cargo: 'educador',
        casaId: ids.AI4, senhaInicial: 'senha-mudou-1' });
    expect(r.status).toBe(201);
    ids.educador = r.body.id;
    t.educador = await login(email, 'senha-mudou-1');
  });

  afterAll(async () => {
    await admin.query(`UPDATE shift_assignment SET revoked_at = now(), revoked_by = $2,
                              revoke_reason = 'Escala fictícia da suíte da folha do plantão.'
                        WHERE user_id = $1 AND revoked_at IS NULL`, [ids.educador, ids.coord]);
    if (ids.educador) {
      await request(http).post(`/api/v1/staff/${ids.educador}/deactivate`).set(auth(t.coord))
        .send({ motivo: 'Conta fictícia da suíte da folha do plantão.' });
    }
    await app.close(); await admin.end();
  });

  it('sem escala, a folha olha as últimas 24 horas', async () => {
    const r = await folha(t.educador);
    expect(r.status).toBe(200);
    expect(r.body.base).toBe('ultimas_24h');
    const horas = (Date.now() - new Date(r.body.desde).getTime()) / 3_600_000;
    expect(horas).toBeGreaterThan(23.9);
    expect(horas).toBeLessThan(24.1);
  });

  it('o plantão de dez dias atrás é o último, mas a folha começa há sete dias', async () => {
    await turno(10, 'diurno');
    const r = await folha(t.educador);
    expect(r.body.base).toBe('plantao');
    expect(r.body.limitado).toBe(true);
    const dias = (Date.now() - new Date(r.body.desde).getTime()) / 86_400_000;
    expect(dias).toBeGreaterThan(6.99);
    expect(dias).toBeLessThan(7.01);
  });

  it('com o plantão de anteontem, a folha começa no fim dele', async () => {
    await turno(2, 'diurno');
    const r = await folha(t.educador);
    expect(r.body.base).toBe('plantao');
    expect(r.body.limitado).toBe(false);
    expect(new Date(r.body.desde).getTime()).toBe((await fimDo(2, 'diurno')).getTime());
  });

  it('traz a ocorrência registrada depois do plantão, e a restrita sem o nome da criança', async () => {
    const desde = new Date((await folha(t.educador)).body.desde);
    const { rows } = await admin.query(
      `INSERT INTO incident (house_id, category, happened_at, objective_fact, access_level, opened_by, opened_at)
       VALUES ($1, 'conflito_agressao', now() - interval '1 hour', '[suíte da folha] fato fictício.', 'equipe', $2, now()),
              ($1, 'violencia_ou_suspeita', now() - interval '2 hours', '[suíte da folha] NARRATIVA RESTRITA.', 'restrito', $2, now()),
              ($1, 'outro', $3::timestamptz - interval '3 hours', '[suíte da folha] de antes do plantão.', 'equipe', $2, $3::timestamptz - interval '1 hour')
       RETURNING id, category`, [ids.AI4, ids.coord, desde]);
    for (const r of rows) {
      await admin.query(`INSERT INTO incident_person (incident_id, person_id) VALUES ($1, $2)`, [r.id, ids.lucas]);
    }
    const porCategoria = Object.fromEntries(rows.map((r) => [r.category, r.id]));

    for (const quem of ['educador', 'coord']) {
      const r = await folha(t[quem]);
      const oc = r.body.ocorrencias as any[];
      const comum = oc.find((o) => o.id === porCategoria.conflito_agressao);
      expect(comum).toMatchObject({ rotulo: 'Conflito ou agressão', situacao: 'aberta', restrita: false });
      expect(comum.criancas).toMatch(/Lucas/);
      expect(oc.some((o) => o.id === porCategoria.outro)).toBe(false);
      const restrita = oc.find((o) => o.id === porCategoria.violencia_ou_suspeita);
      if (restrita) {
        expect(restrita).toMatchObject({ rotulo: 'Ocorrência de acesso restrito', criancas: null });
      }
      /* O texto de nenhuma ocorrência sai na folha. */
      expect(JSON.stringify(r.body)).not.toMatch(/suíte da folha/);
    }
  });

  it('traz o remédio novo e, suspenso pela rota, o suspenso com o instante guardado', async () => {
    const { rows: [p] } = await admin.query(
      `INSERT INTO prescription (person_id, house_id, kind, medication, dose, route, prescriber, prescribed_on,
                                 starts_on, status, signed_by, signed_at, created_by)
       VALUES ($1, $2, 'uso_continuo', $3, '1 comprimido', 'oral', 'Dr(a). Fictício(a) — CRM 00000',
               app_hoje(), '2040-01-01', 'ativa', $4, now(), $4)
       RETURNING id`, [ids.lucas, ids.AI4, MEDICAMENTO, ids.coord]);
    const antes = await folha(t.educador);
    expect((antes.body.remedios as any[]).filter((r) => r.medicamento === MEDICAMENTO))
      .toEqual([expect.objectContaining({ tipo: 'novo', crianca: 'Lucas', dose: '1 comprimido' })]);

    /* Só a Enfermagem e o Gestor Geral suspendem; a Casa 04 não tem Enfermagem. */
    const s = await request(http).post(`/api/v1/medications/prescriptions/${p.id}/suspend`)
      .set(auth(t.gestor)).send({ motivo: 'Suspensão fictícia da suíte da folha do plantão.' });
    expect(s.status).toBe(201);
    const { rows: [guardado] } = await admin.query(
      `SELECT suspended_at, suspended_by FROM prescription WHERE id = $1`, [p.id]);
    expect(guardado.suspended_at).not.toBeNull();
    expect(guardado.suspended_by).toBe(
      (await admin.query(`SELECT id FROM app_user WHERE email = 'gestor@paodospobres.dev'`)).rows[0].id);

    const depois = await folha(t.educador);
    const dele = (depois.body.remedios as any[]).filter((r) => r.medicamento === MEDICAMENTO);
    expect(dele).toEqual([expect.objectContaining({ tipo: 'suspenso', crianca: 'Lucas' })]);
    /* O motivo da suspensão fica na tela da saúde, não na folha. */
    expect(JSON.stringify(depois.body)).not.toMatch(/Suspensão fictícia/);
  });

  it('a ATA anterior vem sem nenhuma linha restrita', async () => {
    const r = await folha(t.coord);
    if (!r.body.ata) return;
    const { rows } = await admin.query(
      `SELECT n.body FROM ata_note n JOIN ata a ON a.id = n.ata_id
        WHERE a.house_id = $1 AND n.restricted`, [ids.AI4]);
    for (const x of rows) expect(JSON.stringify(r.body.ata)).not.toContain(x.body.slice(0, 40));
  });

  it('o gestor não lê (abre uma casa por vez, não faz plantão); quem é de outra casa recebe 404', async () => {
    expect((await folha(t.gestor)).status).toBe(403);
    expect((await folha(t.educador3)).status).toBe(404);
  });
});
