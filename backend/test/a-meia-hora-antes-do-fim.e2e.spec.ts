/**
 * A MEIA HORA ANTES DO FIM DO PLANTÃO (fase 180, pedido de 09/09).
 *
 * Decisão de 30/09: quem está na escala e ainda não assinou a passagem recebe
 * um aviso, e o líder do turno recebe um só, com os nomes. Uma vez por turno,
 * e sem guardar quem foi avisado (§10.5: não acumula por pessoa).
 *
 * O instante é parâmetro, e o dia é sorteado num futuro distante a cada
 * rodada: a marca do turno não se apaga, e o teste não pode depender do
 * relógio de hoje (lição da 168) nem da rodada anterior.
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { RelogioService } from '../src/modules/relogio';
import { ShiftsService } from '../src/modules/shifts';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A meia hora antes do fim do plantão', () => {
  let app: INestApplication, admin: Client, plantao: ShiftsService, quem: any;
  const ids: Record<string, string> = {};
  const dia = new Date(Date.UTC(2040, 0, 1) + Math.floor(Math.random() * 7000) * 86400000)
    .toISOString().slice(0, 10);
  const inicioDaRodada = new Date();

  const uid = async (email: string) =>
    (await admin.query(`SELECT id FROM app_user WHERE email = $1`, [email])).rows[0].id as string;
  const fimDo = async (periodo: string) => new Date((await admin.query(
    `SELECT ate FROM app_janela_do_turno($1, $2, $3)`, [ids.AI3, dia, periodo])).rows[0].ate);
  const avisosDe = async (userId: string) => (await admin.query(
    `SELECT title, body, entity FROM notification
      WHERE user_id = $1 AND created_at >= $2 AND (body LIKE '%termina às%')
      ORDER BY created_at`, [userId, inicioDaRodada])).rows;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    plantao = app.get(ShiftsService);
    quem = await app.get(RelogioService).quemSou('gestor@paodospobres.dev');

    ids.AI3 = (await admin.query(`SELECT id FROM house WHERE code = 'AI3'`)).rows[0].id;
    ids.mario = await uid('educador.ai3@paodospobres.dev');
    ids.joana = await uid('educador2.ai3@paodospobres.dev');
    ids.lucia = await uid('lider.ai3@paodospobres.dev');
    ids.nelio = await uid('lider.noturno@paodospobres.dev');
    ids.coord = await uid('coord.ai3@paodospobres.dev');

    /* A escala do dia: Mário, Joana e a Líder Diurna no diurno; Mário no noturno. */
    for (const [pessoa, periodo] of [[ids.mario, 'diurno'], [ids.joana, 'diurno'],
      [ids.lucia, 'diurno'], [ids.mario, 'noturno']]) {
      await admin.query(
        `INSERT INTO shift_assignment (house_id, user_id, on_date, period, created_by)
         VALUES ($1, $2, $3, $4, $5)`, [ids.AI3, pessoa, dia, periodo, ids.coord]);
    }
    /* Joana já assinou a passagem do diurno. */
    const { rows: [s] } = await admin.query(
      `INSERT INTO shift (house_id, on_date, period, opened_by) VALUES ($1, $2, 'diurno', $3)
       RETURNING id`, [ids.AI3, dia, ids.joana]);
    ids.turno = s.id;
    await admin.query(
      `INSERT INTO handover (shift_id, house_id, user_id, role) VALUES ($1, $2, $3, 'educador')`,
      [ids.turno, ids.AI3, ids.joana]);
  });

  afterAll(async () => {
    /* A escala sorteada sai (outras suítes contam a escala da AI3); os avisos
       ficam lidos, para não somar na caixa de quem as outras suítes usam. */
    await admin.query(`UPDATE shift_assignment SET revoked_at = now()
                        WHERE house_id = $1 AND on_date = $2`, [ids.AI3, dia]).catch(() =>
      admin.query(`DELETE FROM shift_assignment WHERE house_id = $1 AND on_date = $2`, [ids.AI3, dia]));
    await admin.query(`UPDATE notification SET read_at = now()
                        WHERE created_at >= $1 AND body LIKE '%termina às%'`, [inicioDaRodada]);
    await app.close(); await admin.end();
  });

  it('antes da meia hora final, ninguém é avisado', async () => {
    const fim = await fimDo('diurno');
    await plantao.avisarFimDoPlantao(quem, 30, new Date(fim.getTime() - 45 * 60000));
    expect(await avisosDe(ids.mario)).toHaveLength(0);
    const { rows } = await admin.query(
      `SELECT 1 FROM shift_fim_aviso WHERE house_id = $1 AND on_date = $2`, [ids.AI3, dia]);
    expect(rows).toHaveLength(0);
  });

  it('na meia hora final, avisa quem não assinou, e não quem assinou', async () => {
    const fim = await fimDo('diurno');
    await plantao.avisarFimDoPlantao(quem, 30, new Date(fim.getTime() - 20 * 60000));
    const mario = await avisosDe(ids.mario);
    expect(mario).toHaveLength(1);
    expect(mario[0].title).toBe('A sua passagem de plantão ainda não foi assinada');
    expect(mario[0].body).toMatch(/plantão diurno .* termina às \d\d:\d\d/);
    expect(await avisosDe(ids.joana)).toHaveLength(0);
  });

  it('o líder do turno recebe UM aviso, com os nomes de quem falta', async () => {
    const lucia = await avisosDe(ids.lucia);
    const doLider = lucia.filter((a: any) => /Ainda não assinaram/.test(a.body));
    expect(doLider).toHaveLength(1);
    expect(doLider[0].body).toMatch(/Mário Silva/);
    expect(doLider[0].body).toMatch(/Lúcia Líder Diurna/);
    expect(doLider[0].body).not.toMatch(/Joana/);
    /* E ela, que também não assinou, recebe o próprio aviso. */
    expect(lucia.filter((a: any) => /A sua passagem/.test(a.title))).toHaveLength(1);
  });

  it('rodar de novo dentro da meia hora não repete o aviso', async () => {
    const fim = await fimDo('diurno');
    const r = await plantao.avisarFimDoPlantao(quem, 30, new Date(fim.getTime() - 10 * 60000));
    expect(r.avisos).toBe(0);
    expect(await avisosDe(ids.mario)).toHaveLength(1);
  });

  it('a marca é do turno, e a auditoria conta quantos, nunca quem', async () => {
    const { rows: colunas } = await admin.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'shift_fim_aviso'`);
    expect(colunas.map((c: any) => c.column_name).sort())
      .toEqual(['avisado_em', 'house_id', 'id', 'on_date', 'period']);
    const { rows: [a] } = await admin.query(
      `SELECT detail, house_id FROM audit_event WHERE action = 'plantao.fim_avisado'
         AND detail->>'dia' = $1 AND detail->>'periodo' = 'diurno'`, [dia]);
    expect(a.house_id).toBe(ids.AI3);
    expect(a.detail.faltavam).toBe(2);
    expect(JSON.stringify(a.detail)).not.toMatch(/Mário|Lúcia|user/i);
  });

  it('no noturno, quem recebe é o Líder Noturno Geral', async () => {
    const fim = await fimDo('noturno');
    await plantao.avisarFimDoPlantao(quem, 30, new Date(fim.getTime() - 15 * 60000));
    const nelio = (await avisosDe(ids.nelio)).filter((a: any) => /Ainda não assinaram/.test(a.body));
    expect(nelio).toHaveLength(1);
    expect(nelio[0].body).toMatch(/plantão noturno .* Mário Silva/);
    expect((await avisosDe(ids.mario)).filter((a: any) => /noturno/.test(a.body))).toHaveLength(1);
  });

  it('depois do fim, não avisa mais', async () => {
    const fim = await fimDo('diurno');
    const r = await plantao.avisarFimDoPlantao(quem, 30, new Date(fim.getTime() + 5 * 60000));
    expect(r.avisos).toBe(0);
  });
});
