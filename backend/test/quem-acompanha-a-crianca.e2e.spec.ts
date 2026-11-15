/**
 * QUEM ACOMPANHA A CRIANÇA (activities/1724 e nursing/1725, pedido do dono em 14/11).
 *
 * *Fui delegar alguém para levar uma criança a uma atividade externa e apareceram o
 * pessoal da cozinha e da portaria.* A cozinha e a portaria não levam, não acompanham,
 * não realizam nem substituem atividade de criança.
 *
 * O que esta suíte cobra:
 *  1. a lista de quem pode ser responsável (a da Agenda, e a do Dia: quem realizou, a quem
 *     delegar e quem substitui) não traz a cozinha nem a portaria;
 *  2. delegar atividade, registrar por outro e substituir para a cozinha ou a portaria é
 *     recusado com frase;
 *  3. o acompanhante da internação não pode ser da cozinha nem da portaria, nem gravado
 *     direto no banco;
 *  4. a cozinha e a portaria não entram na escala de plantão (identity/1726, pedido de 15/11);
 *  5. a regra do banco e a da tela dizem a mesma lista.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { NAO_ACOMPANHAM_CRIANCA, FRASE_NAO_ACOMPANHA } from '../src/modules/identity/quem-acompanha.regra';
import { hojeNaInstituicao } from '../src/kernel/common/tempo';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Quem acompanha a criança', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const criadas: string[] = [];
  const auth = (k: string) => ({ Authorization: `Bearer ${t[k]}` });

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
      coord: 'coord.ai3@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev', educ: 'educador.ai3@paodospobres.dev',
      cozinha: 'cozinha.ai3@paodospobres.dev',
    })) {
      const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
      if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
      t[k] = r.body.token; ids[k] = r.body.user.id;
    }
    ids.casa = (await admin.query(`SELECT id FROM house WHERE code = 'AI3'`)).rows[0].id;
    /* Uma portaria na Casa 03, cadastrada pela coordenação como na tela. */
    const email = `portaria.acompanha.${Date.now()}@paodospobres.dev`;
    const p = await request(http).post('/api/v1/staff').set(auth('coord'))
      .send({ nome: 'Portaria da conferência', email, cargo: 'portaria', casaId: ids.casa });
    if (p.status !== 201) throw new Error(`a portaria não nasceu: ${p.status} ${JSON.stringify(p.body)}`);
    ids.portaria = p.body.id; criadas.push(p.body.id);
  });

  afterAll(async () => {
    for (const id of criadas) {
      await admin.query(`UPDATE user_house_assignment SET valid_to = app_hoje() - 1
                          WHERE user_id = $1 AND valid_to IS NULL`, [id]).catch(() => undefined);
    }
    await app.close(); await admin.end();
  });

  it('a lista do responsável não traz a cozinha nem a portaria, e traz a equipe do plantão', async () => {
    const r = await request(http)
      .get(`/api/v1/activities/agenda/staff?houseId=${ids.casa}&data=${hojeNaInstituicao()}&hora=10:00`)
      .set(auth('coord'));
    expect(r.status).toBe(200);
    const nomes = r.body.equipe as { id: string; cargo: string }[];
    expect(nomes.some((m) => m.id === ids.educ)).toBe(true);
    expect(nomes.filter((m) => (NAO_ACOMPANHAM_CRIANCA as readonly string[]).includes(m.cargo))).toEqual([]);
    expect(nomes.some((m) => m.id === ids.cozinha || m.id === ids.portaria)).toBe(false);
  });

  it('delegar atividade à cozinha ou à portaria é recusado com frase', async () => {
    const { rows: [a] } = await admin.query(
      `INSERT INTO activity (house_id, kind, title, scheduled_at)
       VALUES ($1, 'coletiva', 'Passeio da conferência de quem acompanha', now() + interval '2 days')
       RETURNING id`, [ids.casa]);
    for (const quem of ['cozinha', 'portaria']) {
      const r = await request(http).post(`/api/v1/activities/${a.id}/delegate`).set(auth('lider'))
        .send({ paraId: ids[quem], motivo: 'Conferência de quem acompanha a criança' });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe(FRASE_NAO_ACOMPANHA);
    }
  });

  it('o acompanhante da internação não é da cozinha nem da portaria, nem gravado direto no banco', async () => {
    const { rows: [h] } = await admin.query(
      `SELECT h.id FROM hospitalization h
         JOIN house_stay s ON s.person_id = h.person_id AND s.status = 'ativa'
        WHERE s.house_id = $1 ORDER BY h.id LIMIT 1`, [ids.casa]);
    if (h) {
      const r = await request(http).post(`/api/v1/nursing/hospitalizations/${h.id}/companion`).set(auth('tecnica'))
        .send({ userId: ids.cozinha });
      expect([400, 404]).toContain(r.status);
      if (r.status === 400) expect(r.body.message).toBe(FRASE_NAO_ACOMPANHA);
    }
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE rede_app');
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [ids.tecnica]);
      await expect(admin.query(
        `SELECT app_acompanha_crianca($1) AS cozinha, app_acompanha_crianca($2) AS portaria,
                app_acompanha_crianca($3) AS educador`, [ids.cozinha, ids.portaria, ids.educ]))
        .resolves.toMatchObject({ rows: [{ cozinha: false, portaria: false, educador: true }] });
    } finally { await admin.query('ROLLBACK'); }
    const { rows: [gatilho] } = await admin.query(
      `SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'trg_acompanhante_acompanha_crianca'`);
    expect(gatilho.n).toBe(1);
  });

  it('a cozinha e a portaria não entram na escala de plantão, nem pelo rascunho nem na troca (identity/1726)', async () => {
    const amanha = new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10);
    for (const quem of ['cozinha', 'portaria']) {
      await admin.query('BEGIN');
      try {
        await admin.query('SET LOCAL ROLE rede_app');
        await admin.query(`SELECT set_config('app.user_id', $1, true)`, [ids.coord]);
        await expect(admin.query(
          `SELECT * FROM app_escalar($1, $2, $3::date, 'diurno', NULL, NULL, NULL, NULL, NULL)`,
          [ids.casa, ids[quem], amanha])).rejects.toThrow(/não entram na escala de plantão/);
      } finally { await admin.query('ROLLBACK'); }
    }
    const { rows } = await admin.query(
      `SELECT proname FROM pg_proc
        WHERE proname IN ('app_escalar', 'app_rascunho_incluir', 'app_substituir_no_plantao')
          AND prosrc ~ 'não entram na escala de plantão'`);
    expect(rows.map((r) => r.proname).sort())
      .toEqual(['app_escalar', 'app_rascunho_incluir', 'app_substituir_no_plantao']);
  });

  it('nem direto na tabela, nem repetindo o mês, nem publicando o rascunho a cozinha entra na escala (identity/1729)', async () => {
    const mes = (await admin.query(
      `SELECT (date_trunc('month', app_hoje()) + interval '2 month')::date::text AS m`)).rows[0].m;
    await admin.query('BEGIN');
    try {
      /* A escala da cozinha de antes da 1726, quatro semanas antes do mês que se monta. */
      await admin.query('ALTER TABLE shift_assignment DISABLE TRIGGER trg_escala_so_de_quem_cuida');
      await admin.query(
        `INSERT INTO shift_assignment (house_id, user_id, on_date, period, created_by)
         VALUES ($1, $2, $3::date - 28, 'diurno', $4)`, [ids.casa, ids.cozinha, mes, ids.coord]);
      await admin.query('ALTER TABLE shift_assignment ENABLE TRIGGER trg_escala_so_de_quem_cuida');
      await admin.query('SET LOCAL ROLE rede_app');
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [ids.coord]);
      await admin.query('SAVEPOINT direto');
      await expect(admin.query(
        `INSERT INTO shift_assignment (house_id, user_id, on_date, period, created_by)
         VALUES ($1, $2, app_hoje() + 3, 'diurno', $3)`, [ids.casa, ids.portaria, ids.coord]))
        .rejects.toThrow(/não entram na escala de plantão/);
      await admin.query('ROLLBACK TO SAVEPOINT direto');
      const { rows: [r] } = await admin.query(
        `SELECT rascunho_id FROM app_repetir_escala($1, $2::date)`, [ids.casa, mes]);
      await admin.query('RESET ROLE');
      const { rows: [n] } = await admin.query(
        `SELECT count(*)::int AS n FROM shift_draft_item WHERE draft_id = $1 AND user_id = $2`,
        [r.rascunho_id, ids.cozinha]);
      expect(n.n).toBe(0);
      /* O rascunho aberto de antes, que ainda tem a cozinha, não publica: diz a frase. */
      await admin.query('ALTER TABLE shift_draft_item DISABLE TRIGGER trg_rascunho_so_de_quem_cuida');
      await admin.query(
        `INSERT INTO shift_draft_item (draft_id, user_id, on_date, period, added_by)
         VALUES ($1, $2, $3::date + 1, 'diurno', $4)`, [r.rascunho_id, ids.cozinha, mes, ids.coord]);
      await admin.query('ALTER TABLE shift_draft_item ENABLE TRIGGER trg_rascunho_so_de_quem_cuida');
      await admin.query('SET LOCAL ROLE rede_app');
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [ids.coord]);
      await expect(admin.query(`SELECT * FROM app_publicar_rascunho($1)`, [r.rascunho_id]))
        .rejects.toThrow(/não entram na escala de plantão/);
    } finally { await admin.query('ROLLBACK'); }
  });

  it('a regra do banco e a da tela dizem a mesma lista', async () => {
    const { rows: [f] } = await admin.query(`SELECT prosrc FROM pg_proc WHERE proname = 'app_acompanha_crianca'`);
    for (const cargo of NAO_ACOMPANHAM_CRIANCA) expect(f.prosrc).toContain(`'${cargo}'`);
    const { rows: [lista] } = await admin.query(
      `SELECT prosrc FROM pg_proc WHERE proname = 'app_staff_for_commitment'`);
    expect(lista.prosrc).toContain('app_acompanha_crianca(u.id)');
  });
});
