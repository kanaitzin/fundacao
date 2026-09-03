/**
 * A FRONTEIRA DO DIA — o que a reescrita por faixa não pode ter movido.
 *
 * Em 02/09/2026 as quatro consultas que respondem "o que é de hoje" deixaram
 * de converter a coluna (`(scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date
 * = $2`) e passaram a comparar uma FAIXA de `timestamptz`. O motivo está na
 * migração 0870: sob RLS, só predicado leakproof desce para o índice, e a
 * conversão de fuso não é — a política de segurança rodava uma vez para cada
 * linha do ANO da casa, e a tela demorava 8,4 segundos.
 *
 * A reescrita é rápida e é o tipo de mudança que erra em silêncio. Um
 * deslocamento de uma hora na fronteira não quebra teste nenhum dos 430: ele
 * só faz a dose das 23h40 aparecer no dia seguinte, e alguém na casa concluir
 * que ela não foi dada. Este arquivo existe para pregar a fronteira no chão.
 *
 * Os três casos que importam, todos em hora de Porto Alegre:
 *
 *  * 00:00 é do dia que começa — o primeiro instante, não o último do anterior;
 *  * 23:59 é do mesmo dia — o último instante;
 *  * 00:00 do dia seguinte NÃO aparece na consulta de hoje.
 *
 * E um quarto que só existe por causa do fuso: o sistema guarda em UTC, onde
 * a meia-noite de Porto Alegre é 03:00 do dia SEGUINTE. Uma consulta escrita
 * em UTC devolveria o dia errado por três horas todo dia, e passaria
 * despercebida em qualquer teste que use "agora".
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A fronteira do dia, depois da reescrita por faixa', () => {
  let app: INestApplication, http: any, admin: Client;
  let token = '', AI3 = '', pessoa = '', receita = '', enfermeira = '';

  /** Um dia sem nenhum outro registro, para a contagem ser só a deste teste. */
  const DIA = '2026-04-15';
  const auth = () => ({ Authorization: `Bearer ${token}` });

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
      .send({ email: 'enfermagem@paodospobres.dev', password: SENHA })).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: pessoa }] } = await admin.query(
      `SELECT person_id AS id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]));
    ({ rows: [{ id: enfermeira }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='enfermagem@paodospobres.dev'`));

    ({ rows: [{ id: receita }] } = await admin.query(`
      INSERT INTO prescription (person_id, house_id, kind, medication, dose, route,
                                status, starts_on, created_by)
      VALUES ($1, $2, 'uso_continuo', 'Medicamento da fronteira (fictício)',
              '1 comprimido', 'oral', 'ativa', $3::date, $4)
      RETURNING id`, [pessoa, AI3, DIA, enfermeira]));

    /*
     * Os quatro instantes, escritos em hora LOCAL e convertidos aqui — do
     * mesmo jeito que a consulta passou a fazer. Escrevê-los em UTC seria
     * repetir no teste o erro que o teste procura.
     */
    for (const [rotulo, local] of [
      ['primeiro instante do dia', `${DIA} 00:00:00`],
      ['meio do dia', `${DIA} 12:00:00`],
      ['último instante do dia', `${DIA} 23:59:00`],
      ['primeiro instante do dia seguinte', '2026-04-16 00:00:00'],
    ] as const) {
      await admin.query(`
        INSERT INTO medication_administration (
          prescription_id, person_id, house_id, scheduled_at, state, note)
        VALUES ($1, $2, $3, $4::timestamp AT TIME ZONE 'America/Sao_Paulo',
                'aguardando_confirmacao', $5)`,
        [receita, pessoa, AI3, local, rotulo]);
    }
  });

  afterAll(async () => {
    /* Estas doses são de um dia que não existe em nenhum outro teste, e o
     * `globalSetup` recria o schema — mas a suíte que suja o estado
     * compartilhado desfaz o que criou (a lição da fase 11). */
    await admin.query(`DELETE FROM medication_administration WHERE prescription_id=$1`, [receita]);
    await admin.query(`DELETE FROM prescription WHERE id=$1`, [receita]);
    await app.close(); await admin.end();
  });

  it('a grade do dia traz 00:00, o meio e 23:59 — e nada do dia seguinte', async () => {
    const r = await request(http)
      .get(`/api/v1/medications?houseId=${AI3}&date=${DIA}`).set(auth());
    expect(r.status).toBe(200);

    const minhas = r.body.filter((d: any) =>
      String(d.medicamento).includes('fronteira'));
    const rotulos = minhas.map((d: any) => d.observacao).sort();

    expect(rotulos).toEqual([
      'meio do dia', 'primeiro instante do dia', 'último instante do dia',
    ]);
    expect(rotulos).not.toContain('primeiro instante do dia seguinte');
  });

  it('a dose das 00:00 do dia seguinte aparece no dia seguinte', async () => {
    const r = await request(http)
      .get(`/api/v1/medications?houseId=${AI3}&date=2026-04-16`).set(auth());
    const minhas = r.body.filter((d: any) =>
      String(d.medicamento).includes('fronteira'));
    expect(minhas.map((d: any) => d.observacao)).toEqual(['primeiro instante do dia seguinte']);
  });

  it('a faixa é a hora de Porto Alegre, e não a do UTC', async () => {
    /*
     * O teste que fecha a porta: em UTC, a meia-noite de 15/04 em Porto
     * Alegre é 03:00 de 15/04, e as 23:59 são 02:59 de 16/04. Uma consulta
     * escrita em UTC devolveria só duas das três doses do dia — e o erro
     * seria de exatamente três horas, todo dia, para sempre.
     */
    const { rows } = await admin.query(
      `SELECT to_char(scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS em_utc,
              note
         FROM medication_administration
        WHERE prescription_id = $1 AND note = 'último instante do dia'`, [receita]);
    // A prova de que os dados de teste realmente atravessam a fronteira.
    expect(rows[0].em_utc).toBe('2026-04-16 02:59');

    const r = await request(http)
      .get(`/api/v1/medications?houseId=${AI3}&date=${DIA}`).set(auth());
    const rotulos = r.body
      .filter((d: any) => String(d.medicamento).includes('fronteira'))
      .map((d: any) => d.observacao);
    expect(rotulos).toContain('último instante do dia');
  });
});
