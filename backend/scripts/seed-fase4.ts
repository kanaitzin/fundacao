/**
 * Seed da Fase 4 — medicamentos FICTÍCIOS na Casa 03 (§29, §33.3).
 *
 * O ensaio geral do piloto encontrou uma lacuna: o ambiente de demonstração
 * tinha vinte acolhidos, rotina e restrições, e **nenhum medicamento**. O
 * §33.3 pede "medicamentos variados" na demonstração, e é justamente o módulo
 * onde o erro custa mais caro — mostrar o sistema sem ele seria mostrar a
 * parte fácil.
 *
 * Este seed cria os quatro tipos que a casa vive:
 *
 *  * **uso contínuo, sem data para acabar** — o que existe por laudo e não se
 *    revisa toda semana;
 *  * **tratamento com início e fim** — o antibiótico de dez dias, que precisa
 *    sumir da tela quando termina;
 *  * **quando necessário** — o que depende de uma condição observada, e por
 *    isso exige a condição escrita;
 *  * **episódio agudo** — o de agora, que alguém precisa acompanhar hoje.
 *
 * Mais dois casos que a demonstração precisa mostrar porque acontecem:
 * estoque baixo e medicamento vencendo. Nomes, dosagens e prescritores são
 * inventados (§3.3).
 */
import { Client } from 'pg';

const url = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@localhost:5432/rede_acolher';

interface Receita {
  acolhido: string;              // nome social do seed da Fase 2
  kind: 'uso_continuo' | 'tratamento' | 'quando_necessario' | 'episodio_agudo';
  medicamento: string;
  finalidade: string;
  dose: string;
  via: string;
  horarios: string[];            // vazio em "quando necessário"
  diasSemana?: number[];         // padrão: todos
  condicao?: string;             // obrigatório em "quando necessário"
  duracaoDias?: number | null;   // null = sem data para acabar
  orientacoes?: string;
  estoque?: { quantidade: number; unidade: string; venceEmDias?: number };
}

const RECEITAS: Receita[] = [
  {
    acolhido: 'Alice', kind: 'uso_continuo',
    medicamento: 'Levotiroxina (fictícia) 25 mcg', finalidade: 'reposição hormonal',
    dose: '1 comprimido', via: 'oral', horarios: ['07:00'], duracaoDias: null,
    orientacoes: 'Em jejum, 30 minutos antes do café.',
    estoque: { quantidade: 30, unidade: 'comprimido' },
  },
  {
    acolhido: 'Lara', kind: 'uso_continuo',
    medicamento: 'Colírio lubrificante (fictício)', finalidade: 'ressecamento ocular',
    dose: '1 gota em cada olho', via: 'oftálmica', horarios: ['07:30', '19:30'],
    duracaoDias: null, orientacoes: 'Conforme laudo oftalmológico; sem previsão de alta.',
    estoque: { quantidade: 2, unidade: 'frasco', venceEmDias: 20 },
  },
  {
    acolhido: 'Bruno', kind: 'tratamento',
    medicamento: 'Amoxicilina (fictícia) 250 mg/5 mL', finalidade: 'infecção de garganta',
    dose: '5 mL', via: 'oral', horarios: ['08:00', '16:00', '00:00'], duracaoDias: 10,
    orientacoes: 'Completar os dez dias mesmo com melhora.',
    estoque: { quantidade: 1, unidade: 'frasco' },
  },
  {
    acolhido: 'Helena', kind: 'tratamento',
    medicamento: 'Vitamina D (fictícia) 1000 UI', finalidade: 'suplementação',
    dose: '4 gotas', via: 'oral', horarios: ['09:00'], diasSemana: [1],
    duracaoDias: 90, orientacoes: 'Uma vez por semana, às segundas.',
    estoque: { quantidade: 1, unidade: 'frasco' },
  },
  {
    acolhido: 'Kauã', kind: 'quando_necessario',
    medicamento: 'Paracetamol (fictício) 500 mg', finalidade: 'dor ou febre',
    dose: '1 comprimido', via: 'oral', horarios: [],
    condicao: 'Dor de cabeça referida ou temperatura acima de 37,8 °C. Intervalo mínimo de 6 horas.',
    duracaoDias: null, orientacoes: 'Registrar o motivo e a temperatura aferida.',
    // Estoque baixo de propósito: a demonstração precisa mostrar o alerta.
    estoque: { quantidade: 2, unidade: 'comprimido' },
  },
  {
    acolhido: 'Enzo', kind: 'episodio_agudo',
    medicamento: 'Dipirona (fictícia) 500 mg/mL', finalidade: 'febre do episódio de hoje',
    dose: '20 gotas', via: 'oral', horarios: ['12:00', '18:00'], duracaoDias: 2,
    orientacoes: 'Reavaliar com a Enfermagem em 48 horas.',
    estoque: { quantidade: 1, unidade: 'frasco', venceEmDias: 400 },
  },
];

async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();

  const { rows: [casa] } = await c.query(`SELECT id FROM house WHERE code = 'AI3'`);
  const { rows: [enf] } = await c.query(
    `SELECT id FROM app_user WHERE email = 'enfermagem@paodospobres.dev'`);
  if (!casa || !enf) {
    throw new Error('Rode o seed base e o da Fase 2 antes deste.');
  }

  let criadas = 0; let existentes = 0;

  for (const r of RECEITAS) {
    const { rows: [pessoa] } = await c.query(
      `SELECT p.id FROM person p
         JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa'
        WHERE s.house_id = $1 AND coalesce(nullif(p.social_name,''), p.full_name) = $2`,
      [casa.id, r.acolhido]);
    if (!pessoa) { console.log(`- ${r.acolhido}: não está na Casa 03, pulando`); continue; }

    // Idempotente: rodar de novo não cria a segunda receita do mesmo remédio.
    const { rows: [ja] } = await c.query(
      `SELECT id FROM prescription WHERE person_id = $1 AND medication = $2`,
      [pessoa.id, r.medicamento]);
    if (ja) { existentes++; continue; }

    /*
     * `app_hoje()` em vez de `CURRENT_DATE`, aqui e em todo o seed: o segundo é
     * o dia do SERVIDOR, e depois das 21h em Porto Alegre ele já é o dia
     * seguinte. A prescrição nascia começando AMANHÃ, nenhuma dose do dia era
     * gerada, e a suíte do piloto reprovava toda noite — por um motivo que não
     * estava no sistema, e sim no dado de partida (fase 121).
     */
    const fim = r.duracaoDias
      ? `app_hoje() + ${r.duracaoDias}`
      : 'NULL';

    const { rows: [presc] } = await c.query(
      `INSERT INTO prescription (person_id, house_id, kind, medication, purpose, dose, route,
                                 instructions, use_condition, prescriber, prescribed_on,
                                 starts_on, ends_on, status, signed_by, signed_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, app_hoje(), app_hoje(), ${fim},
               'ativa', $11, now(), $11)
       RETURNING id`,
      [pessoa.id, casa.id, r.kind, r.medicamento, r.finalidade, r.dose, r.via,
       r.orientacoes ?? null, r.condicao ?? null, 'Dr(a). Fictício(a) — CRM 00000', enf.id]);

    for (const hora of r.horarios) {
      await c.query(
        `INSERT INTO medication_schedule (prescription_id, time_of_day, weekdays)
         VALUES ($1, $2, $3::smallint[])
         ON CONFLICT (prescription_id, time_of_day) DO NOTHING`,
        [presc.id, hora, r.diasSemana ?? [0, 1, 2, 3, 4, 5, 6]]);
    }

    if (r.estoque) {
      await c.query(
        `INSERT INTO medication_stock (house_id, person_id, medication, quantity, unit, expires_on)
         VALUES ($1,$2,$3,$4,$5, ${r.estoque.venceEmDias
           ? `app_hoje() + ${r.estoque.venceEmDias}` : 'NULL'})`,
        [casa.id, pessoa.id, r.medicamento, r.estoque.quantidade, r.estoque.unidade]);
    }

    criadas++;
    console.log(`+ ${r.acolhido}: ${r.medicamento} (${r.kind})`);
  }

  console.log(`\nPrescrições criadas: ${criadas}. Já existiam: ${existentes}.`);
  console.log('Todas fictícias. Nenhum dado real entra em desenvolvimento (§3.3).');
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
