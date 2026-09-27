/**
 * AS BORDAS DO USO (fase 168) — o §39 do pedido de 25/09.
 *
 * O que acontece fora do caminho que a tela desenha: duas abas mandando a
 * fila do aparelho ao mesmo tempo, a fila de uma pessoa chegando com a
 * sessão de outra, a virada do ano e o fevereiro. O que é só do navegador
 * (voltar, sessão vencida com a tela aberta, armazenamento cheio) está no
 * `ensaio:uso` e no `fila-offline.spec.ts`.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('As bordas do uso', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const auth = (tk: string) => ({ Authorization: `Bearer ${tk}` });

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
      educador: 'educador.ai3@paodospobres.dev', educador2: 'educador2.ai3@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev',
    })) {
      t[k] = (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
    }
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.educador }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  /** Uma atividade urgente da Casa 03, já com ciência do educador. */
  async function atividade(titulo: string) {
    const atv = await request(http).post('/api/v1/activities/urgent').set(auth(t.lider))
      .send({ houseId: ids.AI3, title: titulo, scheduledAt: new Date().toISOString(),
              reason: 'Teste das bordas do uso' });
    expect(atv.status).toBe(201);
    await request(http).post(`/api/v1/activities/${atv.body.id}/acknowledge`)
      .set(auth(t.educador)).send({});
    return atv.body.id as string;
  }

  const operacao = (clientOpId: string, activityId: string, extra: any = {}) => ({
    clientOpId, kind: 'activity.record', houseId: ids.AI3,
    happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
    payload: { activityId, estado: 'concluida_no_horario' }, ...extra,
  });

  it('duas abas mandando a mesma operação juntas: aplicada uma vez, e as duas podem limpar', async () => {
    for (let rodada = 0; rodada < 12; rodada++) {
      const activityId = await atividade(`Duas abas ${rodada}`);
      const opId = `duas-abas-${Date.now()}-${rodada}`;
      const corpo = { operacoes: [operacao(opId, activityId)] };
      const [a, b] = await Promise.all([
        request(http).post('/api/v1/sync/push').set(auth(t.educador)).send(corpo),
        request(http).post('/api/v1/sync/push').set(auth(t.educador)).send(corpo),
      ]);
      const estados = [a.body.resultados[0].status, b.body.resultados[0].status].sort();
      /* Uma aplica, a outra reconhece a duplicata: nenhuma vira conflito, e
         as duas abas podem apagar o registro local. */
      expect(estados).toEqual(['aplicada', 'duplicada']);
      expect(a.body.podeLimpar).toContain(opId);
      expect(b.body.podeLimpar).toContain(opId);
      const { rows: [n] } = await admin.query(
        `SELECT (SELECT count(*) FROM activity_execution WHERE client_op_id = $1)::int AS execucoes,
                (SELECT status FROM offline_operation WHERE client_op_id = $1) AS status,
                (SELECT count(*) FROM sync_conflict WHERE description LIKE '%' || $2 || '%')::int AS conflitos`,
        [opId, activityId]);
      expect(n).toEqual({ execucoes: 1, status: 'aplicada', conflitos: 0 });
    }
  });

  it('a operação escrita por outra pessoa não é aplicada com a sessão de quem está entrado', async () => {
    /* O computador da casa: a educadora escreveu sem sinal e saiu; o colega
       entrou e o sinal voltou. O aparelho não manda (fila-offline), e se
       mandar, o servidor não aplica: a operação fica esperando a autora. */
    const activityId = await atividade('Escrita por outra pessoa');
    const opId = `outra-pessoa-${Date.now()}`;
    const r = await request(http).post('/api/v1/sync/push').set(auth(t.educador2))
      .send({ operacoes: [operacao(opId, activityId, { autorId: ids.educador })] });
    expect(r.status).toBe(201);
    expect(r.body.resultados[0].status).toBe('aguardando_autor');
    expect(r.body.podeLimpar).not.toContain(opId);
    const { rows: [n] } = await admin.query(
      `SELECT (SELECT count(*) FROM activity_execution WHERE client_op_id = $1)::int AS execucoes,
              (SELECT count(*) FROM offline_operation WHERE client_op_id = $1)::int AS registros`, [opId]);
    expect(n).toEqual({ execucoes: 0, registros: 0 });
    /* Quando a autora entra, a mesma operação entra com o nome dela. */
    const dela = await request(http).post('/api/v1/sync/push').set(auth(t.educador))
      .send({ operacoes: [operacao(opId, activityId, { autorId: ids.educador })] });
    expect(dela.body.resultados[0].status).toBe('aplicada');
    const { rows: [e] } = await admin.query(
      `SELECT user_id FROM activity_execution WHERE client_op_id = $1`, [opId]);
    expect(e.user_id).toBe(ids.educador);
  });

  it('a escala de janeiro copia dezembro, e a de março copia fevereiro, pelo dia da semana', async () => {
    /* Datas relativas ao ano corrente, para o teste não vencer: o próximo
       janeiro e o próximo março, e a origem que cada um deve copiar. Tudo numa
       transação desfeita (a escala não se apaga). */
    const { rows: [{ id: coord4 }] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'coord.ai4@paodospobres.dev'`);
    const { rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`);
    const { rows: [{ id: educador4 }] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'educador.ai4@paodospobres.dev'`);
    const { rows: [d] } = await admin.query(`
      SELECT make_date(extract(year FROM app_hoje())::int + 1, 1, 1) AS jan,
             make_date(extract(year FROM app_hoje())::int + 1, 3, 1) AS mar`);
    const copia = async (mes: Date, origens: string[]) => {
      await admin.query('BEGIN');
      try {
        for (const o of origens) {
          await admin.query(
            `INSERT INTO shift_assignment (house_id, user_id, on_date, period, created_by)
             VALUES ($1, $2, $3::date, 'diurno', $4)`, [AI4, educador4, o, coord4]);
        }
        await admin.query('SET LOCAL ROLE rede_app');
        await admin.query(`SELECT set_config('app.user_id', $1, true)`, [coord4]);
        const { rows: [r] } = await admin.query(`SELECT * FROM app_repetir_escala($1, $2)`, [AI4, mes]);
        await admin.query('RESET ROLE');
        const { rows } = await admin.query(
          `SELECT on_date::text AS dia, extract(isodow FROM on_date)::int AS semana
             FROM shift_draft_item WHERE draft_id = $1 ORDER BY on_date`, [r.rascunho_id]);
        return rows;
      } finally { await admin.query('ROLLBACK'); }
    };
    const iso = (x: Date, dias: number) => {
      const y = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate() + dias));
      return y.toISOString().slice(0, 10);
    };
    /* Janeiro: o dia 1 copia 28 dias antes (dezembro do ano anterior), e o
       dia 29 copia 56 dias antes, que é o mesmo dia de dezembro. */
    const jan = await copia(d.jan, [iso(d.jan, -28)]);
    expect(jan.map((x: any) => x.dia)).toEqual([iso(d.jan, 0), iso(d.jan, 28)]);
    expect(new Set(jan.map((x: any) => x.semana)).size).toBe(1);
    /* Março depois de fevereiro, com 28 ou 29 dias: o dia 1 copia 28 dias
       antes, sempre dentro de fevereiro, e no mesmo dia da semana. */
    const mar = await copia(d.mar, [iso(d.mar, -28)]);
    expect(mar[0].dia).toBe(iso(d.mar, 0));
    expect(new Set(mar.map((x: any) => x.semana)).size).toBe(1);
  });

  it('o turno da noite de 31 de dezembro é do dia 31, e a noite de 29 de fevereiro termina em 1º de março', async () => {
    const q = async (sql: string, p: any[]) => (await admin.query(sql, p)).rows[0];
    /* 23h30 de 31/12 e 06h de 1º/1 são o mesmo plantão: o noturno de 31/12. */
    expect(await q(`SELECT dia::text, periodo FROM app_turno_de($1, '2026-12-31 23:30-03')`, [ids.AI3]))
      .toEqual({ dia: '2026-12-31', periodo: 'noturno' });
    expect(await q(`SELECT dia::text, periodo FROM app_turno_de($1, '2027-01-01 06:00-03')`, [ids.AI3]))
      .toEqual({ dia: '2026-12-31', periodo: 'noturno' });
    /* Fevereiro bissexto: a noite de 29/02 termina na manhã de 1º/03, e a
       noite de 28/02 do ano comum também. */
    const fim = async (dia: string) => (await q(
      `SELECT (ate AT TIME ZONE app_fuso())::date::text AS fim
         FROM app_janela_do_turno($1, $2::date, 'noturno')`, [ids.AI3, dia])).fim;
    expect(await fim('2028-02-29')).toBe('2028-03-01');
    expect(await fim('2027-02-28')).toBe('2027-03-01');
    expect(await fim('2028-02-28')).toBe('2028-02-29');
  });
});

