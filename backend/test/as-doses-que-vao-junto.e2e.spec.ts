/**
 * AS DOSES QUE VÃO COM A CRIANÇA (fase 228).
 *
 * A criança sai para o fim de semana com a família, e quem a recebe leva os
 * comprimidos contados pela casa (`app_medicamentos_para_levar`, 1050). A conta
 * somava os DIAS e multiplicava por zero os horários do dia: um remédio de duas
 * vezes ao dia, em três dias, saía com três doses, e não seis. E o remédio com
 * horários em dias diferentes da semana saía em duas linhas.
 *
 * A suíte que passava por esta rota se chamava "a folha conta as doses" e
 * conferia só que a resposta era uma lista. Aqui a conta é conferida pelo número.
 * Tudo nasce numa transação que se desfaz no fim: nenhuma criança, receita ou
 * saída sobra para as outras suítes.
 */
import { Client } from 'pg';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('As doses que vão com a criança', () => {
  let admin: Client;
  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
  });
  afterAll(async () => { await admin.end(); });

  it('conta cada horário de cada dia, numa linha por remédio', async () => {
    await admin.query('BEGIN');
    try {
      const { rows: [casa] } = await admin.query(
        `SELECT h.id AS house, h.institution_id AS inst, u.id AS tecnica, app_hoje()::text AS hoje
           FROM house h JOIN app_user u ON u.email = 'tecnica.ai3@paodospobres.dev'
          WHERE h.code = 'AI3'`);
      const { rows: [crianca] } = await admin.query(
        `INSERT INTO person (institution_id, full_name, birth_date)
         VALUES ($1, 'Criança Fictícia das Doses', '2015-03-10') RETURNING id`, [casa.inst]);
      const { rows: [contato] } = await admin.query(
        `INSERT INTO person_contact (person_id, name, bond)
         VALUES ($1, 'Mãe Fictícia das Doses', 'genitora') RETURNING id`, [crianca.id]);

      const receita = async (remedio: string, horarios: [string, number[]][]) => {
        const { rows: [p] } = await admin.query(
          `INSERT INTO prescription (person_id, house_id, kind, medication, dose, route, status)
           VALUES ($1, $2, 'uso_continuo', $3, '1 comprimido', 'oral', 'ativa') RETURNING id`,
          [crianca.id, casa.house, remedio]);
        for (const [hora, dias] of horarios) {
          await admin.query(
            `INSERT INTO medication_schedule (prescription_id, time_of_day, weekdays)
             VALUES ($1, $2::time, $3::smallint[])`, [p.id, hora, dias]);
        }
      };
      const TODOS = [0, 1, 2, 3, 4, 5, 6];
      await receita('Remédio Fictício A, de duas vezes', [['08:00', TODOS], ['20:00', TODOS]]);
      /* O do meio-dia só nos dias de semana; o da noite, todos os dias. */
      await receita('Remédio Fictício B, misto', [['12:00', [1, 2, 3, 4, 5]], ['21:00', TODOS]]);

      /* Três dias de calendário: sai amanhã às 9h, volta depois de amanhã + 1 às 18h. */
      const { rows: [saida] } = await admin.query(
        `INSERT INTO family_stay (person_id, house_id, contact_id, started_at, expected_return_at, opened_by)
         VALUES ($1, $2, $3,
                 ((app_hoje() + 1)::text || ' 09:00')::timestamp AT TIME ZONE app_fuso(),
                 ((app_hoje() + 3)::text || ' 18:00')::timestamp AT TIME ZONE app_fuso(), $4)
         RETURNING id`, [crianca.id, casa.house, contato.id, casa.tecnica]);

      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [casa.tecnica]);
      const { rows } = await admin.query(
        `SELECT medicamento, horarios, doses FROM app_medicamentos_para_levar($1)
          ORDER BY medicamento`, [saida.id]);

      const hoje = new Date(`${casa.hoje}T12:00:00Z`);
      const dias = [1, 2, 3].map((n) => new Date(hoje.getTime() + n * 86400_000).getUTCDay());
      const diasDeSemana = dias.filter((d) => d >= 1 && d <= 5).length;

      expect(rows).toEqual([
        { medicamento: 'Remédio Fictício A, de duas vezes', horarios: '08:00, 20:00', doses: 6 },
        { medicamento: 'Remédio Fictício B, misto', horarios: '12:00, 21:00', doses: diasDeSemana + 3 },
      ]);
    } finally {
      await admin.query('ROLLBACK');
    }
  });
});
