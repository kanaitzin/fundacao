/**
 * A ATA DAS OITO ÀS OITO (fase 157).
 *
 * Decisão da Fundação em 25/09/2026, que substitui a hipótese 7h–19h:
 *
 *   * ATA DIURNA  — 08:00 às 20:00;
 *   * ATA NOTURNA — 20:01 às 07:59 do dia seguinte, da DATA EM QUE COMEÇOU.
 *
 * O exemplo da própria decisão, que é o que esta suíte cobra: a Diurna 11/09 vai
 * das 08:00 às 20:00 de 11/09; a Noturna 11/09, das 20:01 de 11/09 às 07:59 de
 * 12/09; às 08:00 de 12/09 começa a Diurna 12/09. Nunca existe uma "Noturna
 * 12/09" por causa da madrugada.
 *
 * A regra mora em três lugares, porque três lados precisam dela sem conversar:
 * o banco (`app_turno_de`, identity/1573), o servidor (`tempo.ts`) e a tela
 * (`frontend/src/turno.ts`). O que impede os três de discordarem é esta suíte:
 * os mesmos instantes, a mesma resposta.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import {
  INICIO_DO_DIURNO, INICIO_DO_NOTURNO, turnoDe, dataDoPlantao, periodoDaHora,
} from '../src/kernel/common/tempo';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** Os instantes que a decisão manda testar, com a resposta certa. */
const FRONTEIRAS: [string, string, 'diurno' | 'noturno'][] = [
  ['2026-09-11T07:59:00-03:00', '2026-09-10', 'noturno'],
  ['2026-09-11T08:00:00-03:00', '2026-09-11', 'diurno'],
  ['2026-09-11T19:59:00-03:00', '2026-09-11', 'diurno'],
  ['2026-09-11T20:00:00-03:00', '2026-09-11', 'diurno'],
  ['2026-09-11T20:00:59-03:00', '2026-09-11', 'diurno'],
  ['2026-09-11T20:01:00-03:00', '2026-09-11', 'noturno'],
  ['2026-09-11T23:59:00-03:00', '2026-09-11', 'noturno'],
  ['2026-09-12T00:00:00-03:00', '2026-09-11', 'noturno'],
  ['2026-09-12T06:00:00-03:00', '2026-09-11', 'noturno'],
  ['2026-09-12T07:59:00-03:00', '2026-09-11', 'noturno'],
  ['2026-09-12T08:00:00-03:00', '2026-09-12', 'diurno'],
];

describe('A ATA das oito às oito', () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
  });
  afterAll(async () => { await admin.end(); });

  it('o BANCO classifica cada instante da fronteira como a decisão manda', async () => {
    const erradas: string[] = [];
    for (const [instante, dia, periodo] of FRONTEIRAS) {
      const { rows: [r] } = await admin.query(
        `SELECT dia::text, periodo FROM app_turno_de($1::timestamptz)`, [instante]);
      if (r.dia !== dia || r.periodo !== periodo) {
        erradas.push(`${instante}: banco diz ${r.periodo} ${r.dia}, a regra diz ${periodo} ${dia}`);
      }
    }
    expect(erradas).toEqual([]);
  });

  it('o SERVIDOR responde igual ao banco, instante por instante', () => {
    const erradas = FRONTEIRAS
      .map(([instante, dia, periodo]) => ({ instante, dia, periodo, r: turnoDe(new Date(instante)) }))
      .filter((x) => x.r.dia !== x.dia || x.r.periodo !== x.periodo)
      .map((x) => `${x.instante}: servidor diz ${x.r.periodo} ${x.r.dia}`);
    expect(erradas).toEqual([]);
  });

  it('e a TELA usa os mesmos dois horários — os três lados não podem discordar', () => {
    const tela = readFileSync(join(__dirname, '..', '..', 'frontend', 'src', 'turno.ts'), 'utf8');
    expect(tela).toContain(`INICIO_DO_DIURNO = '${INICIO_DO_DIURNO}'`);
    expect(tela).toContain(`INICIO_DO_NOTURNO = '${INICIO_DO_NOTURNO}'`);
    /* E nenhum resto da hipótese antiga escrito à mão nas telas. */
    const passagem = readFileSync(
      join(__dirname, '..', '..', 'frontend', 'src', 'screens', 'Passagem.tsx'), 'utf8');
    expect(passagem).not.toMatch(/h >= 7 && h < 19/);
  });

  it('as janelas das ATAs de 11/09 são exatamente as da decisão', async () => {
    const { rows: [d] } = await admin.query(
      `SELECT to_char(de AT TIME ZONE app_fuso(), 'YYYY-MM-DD HH24:MI') AS de,
              to_char(ate AT TIME ZONE app_fuso(), 'YYYY-MM-DD HH24:MI') AS ate
         FROM app_janela_do_turno('2026-09-11', 'diurno')`);
    expect(d).toEqual({ de: '2026-09-11 08:00', ate: '2026-09-11 20:01' });
    const { rows: [n] } = await admin.query(
      `SELECT to_char(de AT TIME ZONE app_fuso(), 'YYYY-MM-DD HH24:MI') AS de,
              to_char(ate AT TIME ZONE app_fuso(), 'YYYY-MM-DD HH24:MI') AS ate
         FROM app_janela_do_turno('2026-09-11', 'noturno')`);
    /* Até 08:00 exclusive: o último minuto da Noturna 11 é 07:59 de 12/09. */
    expect(n).toEqual({ de: '2026-09-11 20:01', ate: '2026-09-12 08:00' });
  });

  it('o plantão noturno aberto às 07:59 é o de ONTEM; às 08:00 já não é', () => {
    expect(dataDoPlantao('noturno', new Date('2026-09-12T07:59:00-03:00'))).toBe('2026-09-11');
    expect(dataDoPlantao('noturno', new Date('2026-09-12T08:00:00-03:00'))).toBe('2026-09-12');
    expect(dataDoPlantao('noturno', new Date('2026-09-11T21:00:00-03:00'))).toBe('2026-09-11');
  });

  it('a hora do compromisso e da dose segue a mesma fronteira no banco e no servidor', async () => {
    for (const [hora, periodo] of [['07:59', 'noturno'], ['08:00', 'diurno'], ['19:30', 'diurno'],
      ['20:00', 'diurno'], ['20:01', 'noturno'], ['23:00', 'noturno']] as const) {
      const { rows: [r] } = await admin.query(`SELECT app_periodo_da_hora($1::time) AS p`, [hora]);
      expect([hora, r.p]).toEqual([hora, periodo]);
      expect([hora, periodoDaHora(hora)]).toEqual([hora, periodo]);
    }
  });

  it('nenhuma função do banco ainda carrega a janela 07h–19h escrita à mão', async () => {
    /* A regra antiga vivia em cinco funções de três partições. A pergunta é ao
       CATÁLOGO, e não aos arquivos: `CREATE OR REPLACE` espalha a verdade (a
       primeira lição da lista), e o que vale é a versão que está no banco. */
    const { rows } = await admin.query(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND (p.prosrc ~ $$TIME '07:00'$$ OR p.prosrc ~ $$TIME '19:00'$$)
        ORDER BY 1`);
    expect(rows.map((r) => r.proname)).toEqual([]);
  });
});

describe('O registro feito sem internet fica na ATA de quando aconteceu', () => {
  let app: INestApplication, http: any, admin: Client;
  let token = '', AI3 = '';

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    token = (await request(http).post('/api/v1/auth/login')
      .send({ email: 'educador.ai3@paodospobres.dev', password: 'senha-dev-123' })).body.token;
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
  });
  afterAll(async () => { await app.close(); await admin.end(); });

  it('a atividade feita às 02:00 e sincronizada depois é da Noturna do dia ANTERIOR', async () => {
    /* Uma atividade de anteontem, e o registro dela feito às 02:00 de ontem —
       sem internet — chegando agora. O instante que conta é o do aparelho. */
    const { rows: [d] } = await admin.query(
      `SELECT (app_hoje() - 1)::text AS ontem, (app_hoje() - 2)::text AS anteontem`);
    const as2 = `${d.ontem}T02:00:00-03:00`;
    const { rows: [a] } = await admin.query(
      `INSERT INTO activity (house_id, kind, title, scheduled_at, requires_ack, state, created_by)
       SELECT $1, 'outro', 'Ronda da madrugada (fase 157, fictícia)', $2::timestamptz,
              false, 'agendada', u.id
         FROM app_user u WHERE u.email = 'lider.ai3@paodospobres.dev'
       RETURNING id`, [AI3, `${d.ontem}T01:30:00-03:00`]);

    const r = await request(http).post('/api/v1/sync/push').set({ Authorization: `Bearer ${token}` })
      .send({ operacoes: [{
        clientOpId: `op-157-${Date.now()}`, kind: 'activity.record', houseId: AI3,
        payload: { activityId: a.id, estado: 'concluida_com_atraso', nota: 'Feito sem sinal.' },
        happenedAt: as2, queuedAt: as2, device: 'aparelho-casa-03',
      }] });
    expect(r.status).toBe(201);
    expect(r.body.resultados[0].status).toBe('aplicada');

    const { rows: [e] } = await admin.query(
      `SELECT t.dia::text AS dia, t.periodo
         FROM activity_execution x, app_turno_de(x.happened_at) t
        WHERE x.activity_id = $1`, [a.id]);
    expect(e).toEqual({ dia: d.anteontem, periodo: 'noturno' });
  });
});
