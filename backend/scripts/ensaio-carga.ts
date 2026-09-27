/**
 * ENSAIO DE CARGA — um ano de casa, para ver o que a tela demora.
 *
 * Tudo o que foi medido até aqui foi medido com o banco recém-semeado: vinte
 * acolhidos e alguns dias de registro. A casa não vive assim. Em doze meses
 * são oito casas, ~160 crianças, três chamadas por dia, doses de hora em hora,
 * uma ATA por turno, e uma linha de auditoria para cada uma dessas coisas.
 *
 * Este script escreve esse ano em dados FICTÍCIOS e mede o que a pessoa
 * espera: as leituras que abrem a tela. Ele não muda nenhuma regra e não roda
 * em produção — é para saber, antes do piloto, qual consulta vai ficar lenta
 * primeiro.
 *
 * O que ele NÃO faz de propósito: não mede a escrita. A educadora escreve uma
 * linha por vez; quem sofre com volume é quem LÊ — o painel da coordenação, a
 * grade da enfermagem, o dia da casa.
 *
 * Fase 167: passou a semear também o portão, o armário, a nota, a cozinha, a
 * escala e a ATA com as linhas da equipe, e a medir as telas delas. Rodado
 * com 24 meses, achou as métricas do remédio num ano em 15 s, e a causa não
 * era a consulta: era o alcance perguntado linha por linha em toda política
 * (ver a migração 1624).
 *
 * Uso:  DATABASE_URL=... npx tsx scripts/ensaio-carga.ts [meses]
 *       (o de referência é 24; o banco tem de estar recém-recriado)
 */
import { Client } from 'pg';

const url = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const MESES = Number(process.argv[2] ?? 12);

const c = new Client({ connectionString: url });

/** Mede uma consulta como o serviço a faz, e devolve o tempo em ms. */
async function medir(nome: string, sql: string, params: unknown[] = []) {
  await c.query(sql, params);                   // aquece o plano
  const t0 = process.hrtime.bigint();
  const r = await c.query(sql, params);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { nome, ms, linhas: r.rowCount ?? 0 };
}

async function main() {
  await c.connect();

  const { rows: casas } = await c.query(`SELECT id, code FROM house ORDER BY code`);
  const { rows: [{ id: autor }] } = await c.query(
    `SELECT id FROM app_user WHERE email LIKE 'coord.ai3%' LIMIT 1`);
  const { rows: [{ id: instituicao }] } = await c.query(`SELECT id FROM institution LIMIT 1`);
  const { rows: [{ id: primeiroAcolhido }] } = await c.query(
    `SELECT person_id AS id FROM house_stay WHERE status = 'ativa' LIMIT 1`);
  const { rows: itens } = await c.query(`SELECT id, house_id FROM routine_item`);
  const { rows: pessoas } = await c.query(
    `SELECT hs.person_id, hs.house_id FROM house_stay hs WHERE hs.status = 'ativa'`);

  /*
   * ESTE ENSAIO NÃO É IDEMPOTENTE, e a recusa é melhor que a esperteza.
   *
   * As chamadas e a auditoria não têm chave que impeça repetição — rodar duas
   * vezes dobraria o volume e a segunda medição sairia pior que a primeira
   * sem que nada tivesse piorado. E limpar sozinho está fora de questão: a
   * auditoria é append-only por gatilho, e um script que soubesse apagá-la
   * seria uma porta que não deve existir.
   *
   * Recria-se o schema antes: `npx tsx scripts/migrate.ts` num banco novo, ou
   * qualquer rodada da suíte, que derruba e recria tudo.
   */
  const { rows: [{ n: jaTem }] } = await c.query(
    `SELECT count(*)::int AS n FROM collective_check WHERE title LIKE '%(fictícia)%'`);
  if (jaTem > 0) {
    console.error(
      `Este banco já tem ${jaTem} chamadas de carga. Recrie o schema antes de medir de novo:\n`
      + '  npx jest test/documentacao.spec.ts   (o globalSetup derruba e recria)\n');
    process.exit(1);
  }

  console.log(`Semeando ${MESES} meses · ${casas.length} casas · ${pessoas.length} acolhidos\n`);
  const t0 = Date.now();

  /*
   * A escrita é em BLOCO, com `generate_series`. Inserir linha a linha por
   * aqui mediria a latência do meu laço, e não o tamanho da tabela — e
   * demoraria uma hora para escrever o que o Postgres escreve em segundos.
   *
   * `app_hoje()` e não `current_date`: a data de referência do sistema é a da
   * instituição (regra 9), e um ano de dados ancorado no relógio do processo
   * ficaria fora de fase com tudo o que já existe.
   */
  const dias = MESES * 30;

  /*
   * UMA atividade de rotina por item, por dia — e não uma por criança.
   *
   * A primeira versão gerava três por dia, uma por acolhido, e o banco
   * recusou: `uq_activity_rotina_dia` é sobre (item, dia). O esquema estava
   * certo e eu errado — o item de rotina é da CASA ("jantar", "banho"), e a
   * criança aparece na execução dele, não numa cópia por criança. Um gerador
   * de carga que contorna a restrição mediria um banco que não existe.
   */
  /*
   * A ESCALA É A DA FUNDAÇÃO INTEIRA, e não a da Casa 03.
   *
   * A primeira versão gerou 380 atividades e 4,7 mil doses, e mediu tudo em
   * menos de 7 ms — o que não provava nada: era o banco de demonstração com
   * um ano de nomes. Um ano de verdade são oito casas, ~160 crianças, três
   * chamadas por dia em cada casa, doses de quatro em quatro horas, e uma
   * linha de auditoria para cada coisa que alguém faz.
   *
   * As linhas de carga usam as pessoas FICTÍCIAS que já existem, distribuídas
   * pelas oito casas — a coerência entre pessoa e casa não é mantida de
   * propósito, porque o que se mede aqui é o TAMANHO das tabelas e o plano
   * que o Postgres escolhe, não o conteúdo. Estas linhas nunca saem do banco
   * de ensaio: o `globalSetup` da suíte derruba o schema a cada rodada.
   */
  const HORARIOS = [7, 11, 15, 19];      // doses por dia
  const CHAMADAS = [7, 11, 18];          // chamadas por dia, por casa
  const ACOES_POR_DIA = 60;              // linhas de auditoria por casa, por dia

  console.log('→ atividades…');
  for (const it of itens) {
    await c.query(`
      INSERT INTO activity (
        commitment_id, house_id, person_id, routine_item_id, created_by,
        scheduled_at, ends_at, state, kind, title, instructions)
      SELECT (SELECT id FROM commitment WHERE house_id = $1 LIMIT 1), $1,
             (SELECT person_id FROM house_stay
               WHERE house_id = $1 AND status = 'ativa' LIMIT 1),
             $2, $3,
             (app_hoje() - d)::timestamptz + interval '8 hours',
             (app_hoje() - d)::timestamptz + interval '9 hours',
             'concluida_no_horario'::activity_state, 'rotina',
             'Rotina (fictícia) do dia', ''
        FROM generate_series(0, $4) AS d
       WHERE EXISTS (SELECT 1 FROM house_stay
                      WHERE house_id = $1 AND status = 'ativa')
         AND EXISTS (SELECT 1 FROM commitment WHERE house_id = $1)
      ON CONFLICT DO NOTHING
    `, [it.house_id, it.id, autor, dias]);
  }

  /*
   * A DOSE NÃO MULTIPLICA POR CASA — multiplica por RECEITA.
   *
   * A tentativa de repetir as doses da Casa 03 nas outras sete esbarrou em
   * `uq_adm_dose` (receita, horário): a mesma receita não tem duas doses no
   * mesmo instante, esteja onde estiver. O esquema estava certo outra vez, e
   * ele diz uma coisa sobre o volume: o que faz a tabela crescer é o número de
   * receitas ativas, não o de casas. Para chegar à escala da Fundação, o
   * ensaio cria receitas fictícias nas outras casas.
   */
  console.log('→ receitas das outras casas…');
  for (const casa of casas) {
    await c.query(`
      INSERT INTO prescription (person_id, house_id, kind, medication, dose, route,
                                status, starts_on, created_by)
      SELECT p.id, $1, 'uso_continuo', 'Medicamento fictício ' || n,
             '1 comprimido', 'oral', 'ativa', (app_hoje() - ($2::int)::integer), $3
        FROM (SELECT id FROM person LIMIT 12) p
        CROSS JOIN generate_series(1, 1) AS n
       WHERE NOT EXISTS (SELECT 1 FROM prescription
                          WHERE house_id = $1 AND medication LIKE 'Medicamento fictício%')
    `, [casa.id, dias, autor]);
  }

  console.log('→ doses…');
  await c.query(`
    INSERT INTO medication_administration (
      prescription_id, person_id, house_id, scheduled_at, state,
      administered_by, administered_at, recorded_at)
    SELECT pr.id, pr.person_id, pr.house_id,
           (app_hoje() - d)::timestamptz + (h || ' hours')::interval,
           'administrado_no_horario'::administration_state, $1,
           (app_hoje() - d)::timestamptz + (h || ' hours')::interval,
           (app_hoje() - d)::timestamptz + (h || ' hours')::interval
      FROM prescription pr
      CROSS JOIN generate_series(0, $2) AS d
      CROSS JOIN unnest($3::int[]) AS h
    ON CONFLICT DO NOTHING
  `, [autor, dias, HORARIOS]);

  console.log('→ chamadas…');
  for (const casa of casas) {
    await c.query(`
      INSERT INTO collective_check (house_id, kind, title, reference_at, status,
                                    expected, created_by)
      SELECT $1, 'alimentacao'::check_type, 'Refeição (fictícia)',
             (app_hoje() - d)::timestamptz + (h || ' hours')::interval,
             'confirmada', 20, $2
        FROM generate_series(0, $3) AS d
        CROSS JOIN unnest($4::int[]) AS h
    `, [casa.id, autor, dias, CHAMADAS]);
    /* O resultado por criança é a tabela que mais cresce: ela multiplica cada
     * chamada pelo número de acolhidos. É onde a lentidão apareceria primeiro. */
    await c.query(`
      INSERT INTO check_result (check_id, person_id, option_code, recorded_by, happened_at)
      SELECT ch.id, p.id, 'normal', $2, ch.reference_at
        FROM collective_check ch
        CROSS JOIN (SELECT id FROM person LIMIT 20) p
       WHERE ch.house_id = $1
         AND NOT EXISTS (SELECT 1 FROM check_result r
                          WHERE r.check_id = ch.id AND r.person_id = p.id)
    `, [casa.id, autor]);
  }

  /*
   * AS TABELAS QUE NASCERAM DEPOIS DA FASE 51.
   *
   * O ensaio de carga media as telas do turno e não conhecia internação nem
   * marcos de vida. Uma tela que ninguém mede é uma tela que fica lenta em
   * silêncio — e a do trabalho social atravessa as OITO casas, que é o pior
   * caso do sistema inteiro.
   */
  console.log('→ conquistas…');
  for (const casa of casas) {
    await c.query(`
      INSERT INTO life_milestone (person_id, house_id, kind, happened_on, description,
                                  institution, registered_by)
      SELECT p.id, $1,
             (ARRAY['aprovacao_escolar','curso_profissionalizante','certificado',
                    'primeiro_emprego','esporte_ou_arte'])[1 + (n % 5)],
             app_hoje() - (n * 7),
             'Conquista fictícia número ' || n || ' para medir a tela.',
             'Instituição fictícia', $2
        FROM (SELECT id FROM person LIMIT 20) p
        CROSS JOIN generate_series(1, 12) AS n
    `, [casa.id, autor]);
  }

  console.log('→ internações…');
  for (const casa of casas) {
    await c.query(`
      INSERT INTO hospitalization (person_id, house_id, hospital, reason, started_at,
                                   ended_at, outcome, status, opened_by, closed_by, closed_at)
      SELECT p.person_id, $1, 'Hospital fictício',
             'Internação fictícia para medir a tela do período.',
             (app_hoje() - (n * 30))::timestamptz,
             (app_hoje() - (n * 30) + 10)::timestamptz, 'alta', 'encerrada', $2, $2, now()
        FROM (SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa'
               LIMIT 2) p
        CROSS JOIN generate_series(1, 6) AS n
      ON CONFLICT DO NOTHING
    `, [casa.id, autor]);
  }
  /* O diário é a tabela que cresce dentro da internação: três semanas de
   * relato por período, e é o que a tela do período carrega inteiro. */
  await c.query(`
    INSERT INTO hospitalization_note (hospitalization_id, on_date, kind, body, written_by)
    SELECT h.id, (h.started_at::date + d), 'relato',
           'Relato fictício do dia ' || d || ' para medir a tela.', $1
      FROM hospitalization h CROSS JOIN generate_series(0, 20) AS d
     WHERE h.reason LIKE 'Internação fictícia%'
  `, [autor]);

  /*
   * AS SUPERFÍCIES DAS FASES 157 A 166 (fase 167).
   *
   * O portão, o armário, a nota, a cozinha, a escala e a ATA com as linhas da
   * equipe nasceram depois de o ensaio ser escrito, e nenhuma delas tinha sido
   * medida com volume. Os números seguem a rotina de uma casa: duas visitas
   * por semana para cada familiar autorizado, trinta remédios no armário com
   * baixa diária, uma nota por semana, cinco pedidos de lanche por dia, cinco
   * pessoas escaladas por dia, dois turnos com ATA e seis linhas de equipe em
   * cada um.
   */
  const { rows: equipe } = await c.query(
    `SELECT id FROM app_user WHERE role IN ('educador','lider_diurno','coordenador','equipe_tecnica')
      ORDER BY email LIMIT 5`);
  const ids = equipe.map((u) => u.id);

  console.log('→ familiares e visitas…');
  await c.query(`
    INSERT INTO person_contact (person_id, name, bond, visit_authorized, visit_authorized_by,
                                visit_authorized_at, active, restricted, created_by)
    SELECT hs.person_id, 'Familiar fictício ' || n, 'genitora', true, $1, now(), true, false, $1
      FROM house_stay hs CROSS JOIN generate_series(1, 2) AS n
     WHERE hs.status = 'ativa'
  `, [autor]);
  await c.query(`
    INSERT INTO visit (house_id, person_id, contact_id, document_checked, started_at, started_by,
                       ended_at, ended_by)
    SELECT hs.house_id, hs.person_id, pc.id, 'RG conferido',
           (app_hoje() - d)::timestamptz + interval '15 hours',
           $1, (app_hoje() - d)::timestamptz + interval '16 hours', $1
      FROM house_stay hs
      JOIN person_contact pc ON pc.person_id = hs.person_id AND pc.name LIKE 'Familiar fictício%'
      CROSS JOIN generate_series(1, $2) AS d
     WHERE hs.status = 'ativa' AND extract(dow FROM app_hoje() - d) IN (3, 6)
  `, [autor, dias]);

  console.log('→ armário, movimentos e notas…');
  for (const casa of casas) {
    await c.query(`
      INSERT INTO medication_stock (house_id, medication, quantity, unit)
      SELECT $1, 'Remédio fictício do armário ' || n, 100, 'comprimido'
        FROM generate_series(1, 30) AS n
      ON CONFLICT DO NOTHING
    `, [casa.id]);
  }
  await c.query(`
    INSERT INTO medication_stock_movement (stock_id, kind, quantity, reason, at, by_user)
    SELECT s.id, 'consumo', -1, NULL, (app_hoje() - d)::timestamptz + interval '9 hours', $1
      FROM medication_stock s CROSS JOIN generate_series(1, $2) AS d
     WHERE s.medication LIKE 'Remédio fictício do armário%'
  `, [autor, dias]);
  await c.query(`
    INSERT INTO medication_stock_movement (stock_id, kind, quantity, at, by_user, lot, origin)
    SELECT s.id, 'entrada', 30, (app_hoje() - d)::timestamptz + interval '10 hours', $1,
           'L' || d, 'compra'
      FROM medication_stock s CROSS JOIN generate_series(1, $2, 30) AS d
     WHERE s.medication LIKE 'Remédio fictício do armário%'
  `, [autor, dias]);
  for (const casa of casas) {
    await c.query(`
      INSERT INTO medication_purchase (house_id, bought_on, supplier, items, total_cents,
                                       invoice_ref, bought_by)
      SELECT $1, app_hoje() - d, 'Farmácia fictícia', 'Cinco itens fictícios', 12000,
             'NF-' || d, $2
        FROM generate_series(1, $3, 7) AS d
    `, [casa.id, autor, dias]);
  }
  await c.query(`
    INSERT INTO medication_purchase_item (purchase_id, house_id, medication, quantity, unit_cents)
    SELECT p.id, p.house_id, 'Remédio fictício do armário ' || n, 30, 80
      FROM medication_purchase p CROSS JOIN generate_series(1, 5) AS n
     WHERE p.supplier = 'Farmácia fictícia'
  `);

  console.log('→ pedidos da cozinha…');
  await c.query(`
    INSERT INTO kitchen_request (house_id, kind, person_id, on_date, quantity, purpose, requested_by,
                                 requested_at)
    SELECT hs.house_id, 'lanche', hs.person_id, app_hoje() - d, 1, 'Lanche fictício para a escola',
           $1, (app_hoje() - d)::timestamptz + interval '7 hours'
      FROM (SELECT DISTINCT ON (house_id, rn) house_id, person_id, rn
              FROM (SELECT house_id, person_id,
                           row_number() OVER (PARTITION BY house_id ORDER BY person_id) AS rn
                      FROM house_stay WHERE status = 'ativa') x
             WHERE rn <= 5) hs
      CROSS JOIN generate_series(0, $2) AS d
  `, [autor, dias]);

  console.log('→ escala, turnos, ATAs e linhas da equipe…');
  for (const casa of casas) {
    await c.query(`
      INSERT INTO shift_assignment (house_id, user_id, on_date, period, created_by)
      SELECT $1, u, app_hoje() - d, CASE WHEN i <= 3 THEN 'diurno' ELSE 'noturno' END, $2
        FROM generate_series(1, $3) AS d
        CROSS JOIN unnest($4::uuid[]) WITH ORDINALITY AS e(u, i)
      ON CONFLICT DO NOTHING
    `, [casa.id, autor, dias, ids]);
    await c.query(`
      INSERT INTO shift (house_id, on_date, period, status, opened_by, opened_at, closed_by, closed_at)
      SELECT $1, app_hoje() - d, p, 'fechado', $2,
             (app_hoje() - d)::timestamptz, $2, (app_hoje() - d)::timestamptz + interval '12 hours'
        FROM generate_series(1, $3) AS d CROSS JOIN unnest(ARRAY['diurno','noturno']) AS p
      ON CONFLICT DO NOTHING
    `, [casa.id, autor, dias]);
  }
  await c.query(`
    INSERT INTO ata (shift_id, house_id, on_date, period, status, closed_by, closed_at, created_at)
    SELECT s.id, s.house_id, s.on_date, s.period, 'fechada', s.closed_by, s.closed_at, s.opened_at
      FROM shift s WHERE s.opened_by = $1 AND s.status = 'fechado'
       AND NOT EXISTS (SELECT 1 FROM ata a WHERE a.shift_id = s.id)
  `, [autor]);
  await c.query(`
    INSERT INTO ata_note (ata_id, house_id, author_id, body, restricted, created_at, happened_at)
    SELECT a.id, a.house_id, $1, 'Linha fictícia número ' || n || ' da equipe no turno.', n = 6,
           a.created_at + (n || ' hours')::interval, a.created_at + (n || ' hours')::interval
      FROM ata a CROSS JOIN generate_series(1, 6) AS n
     WHERE a.closed_by = $1 AND a.on_date < app_hoje()
  `, [autor]);

  console.log('→ auditoria…');
  for (const casa of casas) {
    await c.query(`
      INSERT INTO audit_event (institution_id, house_id, actor_id, action, entity, at)
      SELECT $1, $2, $3, 'leitura.ficticia', 'ensaio_de_carga',
             (app_hoje() - d)::timestamptz + (n || ' minutes')::interval
        FROM generate_series(0, $4) AS d
        CROSS JOIN generate_series(1, $5) AS n
    `, [instituicao, casa.id, autor, dias, ACOES_POR_DIA]);
  }

  console.log(`\nsemeado em ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  await c.query('ANALYZE');
  const { rows: tamanhos } = await c.query(`
    SELECT relname, n_live_tup,
           pg_size_pretty(pg_total_relation_size(relid)) AS tamanho
      FROM pg_stat_user_tables
     WHERE n_live_tup > 500
     ORDER BY n_live_tup DESC LIMIT 16
  `);
  for (const t of tamanhos) {
    console.log(`  ${String(t.n_live_tup).padStart(9)} linhas  ${String(t.tamanho).padStart(8)}  ${t.relname}`);
  }

  const ai3 = casas.find((h) => h.code === 'AI3')!.id;

  console.log('\nO que a pessoa espera (ms):\n');
  const medidas = [
    await medir('Dia da casa — atividades de hoje', `
      SELECT a.id, a.scheduled_at, a.title, a.state, app_person_display_name(a.person_id)
        FROM activity a
       WHERE a.house_id = $1 AND a.scheduled_at::date = app_hoje()
       ORDER BY a.scheduled_at`, [ai3]),
    await medir('Grade de medicação de hoje', `
      SELECT d.id, d.scheduled_at, d.state, app_person_display_name(d.person_id)
        FROM medication_administration d
       WHERE d.house_id = $1 AND d.scheduled_at::date = app_hoje()
       ORDER BY d.scheduled_at`, [ai3]),
    await medir('Chamadas de hoje', `
      SELECT ch.id, ch.title, ch.status,
             (SELECT count(*) FROM check_result r WHERE r.check_id = ch.id) AS marcados
        FROM collective_check ch
       WHERE ch.house_id = $1 AND ch.reference_at::date = app_hoje()`, [ai3]),
    await medir('Painel das unidades — ocupação das 8 casas', `
      SELECT h.code, count(hs.id) AS ocupacao
        FROM house h LEFT JOIN house_stay hs
          ON hs.house_id = h.id AND hs.status = 'ativa'
       GROUP BY h.code ORDER BY h.code`),
    await medir('Histórico de um acolhido — doses do ano', `
      SELECT d.scheduled_at, d.state FROM medication_administration d
       WHERE d.person_id = (SELECT person_id FROM house_stay
                             WHERE house_id = $1 AND status='ativa' LIMIT 1)
       ORDER BY d.scheduled_at DESC LIMIT 200`, [ai3]),
    await medir('Auditoria de uma casa no mês', `
      SELECT a.id, a.action, a.at FROM audit_event a
       WHERE a.house_id = $1 AND a.at > app_hoje() - 30
       ORDER BY a.at DESC LIMIT 100`, [ai3]),
    await medir('Arquivo de chamadas do ano da casa', `
      SELECT ch.id, ch.reference_at, ch.status FROM collective_check ch
       WHERE ch.house_id = $1
       ORDER BY ch.reference_at DESC LIMIT 100`, [ai3]),
  ];

  for (const m of medidas.sort((a, b) => b.ms - a.ms)) {
    const sinal = m.ms > 300 ? '✗' : m.ms > 100 ? '⚠' : '✓';
    console.log(`  ${sinal} ${String(m.ms.toFixed(1)).padStart(8)} ms  ${String(m.linhas).padStart(5)} linhas  ${m.nome}`);
  }

  console.log('\n✗ acima de 300 ms · ⚠ acima de 100 ms — o limiar em que a tela');
  console.log('  deixa de parecer instantânea para quem toca nela.');

  /*
   * E AGORA O QUE A PESSOA ESPERA DE VERDADE.
   *
   * As consultas acima rodam como `rede_admin`, sem RLS, e são versões
   * simplificadas do que o serviço faz. Elas dizem se a TABELA está grande
   * demais; não dizem quanto a tela demora. Isto aqui sobe o servidor de
   * verdade, entra com uma conta de verdade e mede as rotas que as telas mais
   * abertas chamam — com o RLS ligado, que é onde o custo costuma aparecer:
   * cada política é um predicado a mais em cada linha lida.
   */
  console.log('\n\nPelo HTTP, com sessão e RLS (ms):\n');
  const { Test } = await import('@nestjs/testing');
  const { ValidationPipe } = await import('@nestjs/common');
  const request = (await import('supertest')).default;
  const { AppModule } = await import('../src/app.module');

  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const nest = mod.createNestApplication();
  nest.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  nest.setGlobalPrefix('api/v1');
  await nest.init();
  const http = nest.getHttpServer();

  /* O GESTOR, e não a coordenação: o panorama das oito casas é dele, e é
   * justamente a consulta mais cara. Medir com quem recebe 403 mediria o
   * tempo da recusa. */
  const { body: sessao } = await request(http).post('/api/v1/auth/login')
    .send({ email: 'gestor@paodospobres.dev', password: 'senha-dev-123' });
  const auth = { Authorization: `Bearer ${sessao.token}` };

  const { body: sessaoCoord } = await request(http).post('/api/v1/auth/login')
    .send({ email: 'coord.ai3@paodospobres.dev', password: 'senha-dev-123' });
  const authCoord = { Authorization: `Bearer ${sessaoCoord.token}` };

  /* O que as telas das fases 157 a 166 pedem, com dois anos embaixo. */
  const { rows: [amostra] } = await c.query(`
    SELECT (SELECT id FROM medication_stock WHERE house_id = $1
             AND medication LIKE 'Remédio fictício do armário%' LIMIT 1) AS estoque,
           (SELECT pc.id FROM person_contact pc JOIN house_stay hs ON hs.person_id = pc.person_id
             WHERE hs.house_id = $1 AND hs.status = 'ativa' AND pc.name LIKE 'Familiar fictício%'
             LIMIT 1) AS contato,
           (SELECT hs.person_id FROM house_stay hs JOIN person_contact pc ON pc.person_id = hs.person_id
             WHERE hs.house_id = $1 AND hs.status = 'ativa' AND pc.name LIKE 'Familiar fictício%'
             LIMIT 1) AS crianca,
           (SELECT id FROM shift WHERE house_id = $1 AND on_date = app_hoje() - 1
             AND period = 'diurno') AS turno,
           to_char(app_hoje() - 365, 'YYYY-MM-DD') AS um_ano,
           to_char(app_hoje() - 180, 'YYYY-MM-DD') AS seis_meses,
           to_char(app_hoje() - 30, 'YYYY-MM-DD') AS um_mes,
           to_char(app_hoje(), 'YYYY-MM-DD') AS hoje,
           to_char(app_hoje() - 30, 'YYYY-MM') AS mes_passado,
           to_char(app_hoje() + 31, 'YYYY-MM') AS proximo_mes`, [ai3]);
  const a = amostra;
  const ano = `de=${a.um_ano}&ate=${a.hoje}`;

  const rotas: Array<[string, string, 'gestor' | 'coord']> = [
    ['Dia — painel da casa', `/api/v1/timeline/house-panel?houseId=${ai3}`, 'gestor'],
    ['Dia — a linha do dia', `/api/v1/timeline?houseId=${ai3}`, 'gestor'],
    ['Chamada — as de hoje', `/api/v1/checks?houseId=${ai3}`, 'gestor'],
    ['Saúde — grade do dia', `/api/v1/medications?houseId=${ai3}`, 'gestor'],
    ['Saúde — painel da enfermagem', `/api/v1/nursing/panel?houseId=${ai3}`, 'gestor'],
    ['Passagem — plantões da casa', `/api/v1/shifts?houseId=${ai3}`, 'gestor'],
    ['Acolhidos — a lista', `/api/v1/people?houseId=${ai3}`, 'gestor'],
    /* As que nasceram depois da fase 51. A do trabalho social atravessa as
     * OITO casas — é o pior caso do sistema. */
    ['Trabalho social — as oito casas', '/api/v1/impacto/panorama', 'gestor'],
    ['Trabalho social — quem conquistou', '/api/v1/impacto/marcos', 'gestor'],
    ['Internação — as da casa', `/api/v1/nursing/hospitalizations?houseId=${ai3}&encerradas=1`, 'gestor'],
    ['Perfil — com contatos e conquistas', `/api/v1/people/${primeiroAcolhido}`, 'gestor'],
    ['Painel do gestor — as oito casas', '/api/v1/reports/panel', 'gestor'],
    /* Fases 157 a 166. */
    ['Portão — as visitas de hoje', `/api/v1/people/portaria/hoje?houseId=${ai3}`, 'coord'],
    ['Perfil — as visitas de um ano', `/api/v1/people/${a.crianca}/visitas?${ano}`, 'coord'],
    ['Contato — o histórico de visitas', `/api/v1/people/contacts/${a.contato}/visit-history`, 'coord'],
    ['Armário — o saldo da casa', `/api/v1/medications/stock?houseId=${ai3}`, 'coord'],
    ['Armário — a história de um item', `/api/v1/medications/stock/${a.estoque}/movements`, 'coord'],
    ['Remédio — as métricas de um ano', `/api/v1/medications/metrics?houseId=${ai3}&${ano}`, 'coord'],
    ['Notas — as de um ano', `/api/v1/medications/purchases?houseId=${ai3}&${ano}`, 'coord'],
    ['Cozinha — os pedidos do mês', `/api/v1/people/kitchen-requests?houseId=${ai3}&de=${a.um_mes}&ate=${a.hoje}`, 'coord'],
    ['Cozinha — o resumo de um ano', `/api/v1/people/kitchen-requests/summary?houseId=${ai3}&${ano}`, 'coord'],
    ['Período — seis meses da casa', `/api/v1/reports/period?houseId=${ai3}&de=${a.seis_meses}&ate=${a.hoje}`, 'coord'],
    ['Período — as refeições de seis meses', `/api/v1/reports/period/meals?houseId=${ai3}&de=${a.seis_meses}&ate=${a.hoje}`, 'coord'],
    ['Painel — o mês da casa', `/api/v1/reports/house-monthly?houseId=${ai3}&mes=${a.mes_passado}`, 'coord'],
    ['Escala — o mês', `/api/v1/escala?houseId=${ai3}&de=${a.um_mes}&ate=${a.hoje}`, 'coord'],
    ['Escala — o rascunho do mês', `/api/v1/escala/rascunho?houseId=${ai3}&mes=${a.proximo_mes}`, 'coord'],
    ['ATA — o arquivo do mês', `/api/v1/shifts/ata-archive?houseId=${ai3}&escala=mes`, 'coord'],
    ['ATA — o turno de ontem', `/api/v1/shifts/${a.turno}`, 'coord'],
    ['ATA — a folha de ontem', `/api/v1/shifts/${a.turno}/folha`, 'coord'],
    ['ATA — o turno anterior', `/api/v1/shifts/anterior?houseId=${ai3}`, 'coord'],
    ['Auditoria — a de uma criança', `/api/v1/audit/person/${a.crianca}`, 'coord'],
  ];

  const pelaRede: Array<{ nome: string; ms: number; status: number }> = [];
  for (const [nome, rota, quem] of rotas) {
    const cab = quem === 'coord' ? authCoord : auth;
    await request(http).get(rota).set(cab);               // aquece
    const t = process.hrtime.bigint();
    const r = await request(http).get(rota).set(cab);
    pelaRede.push({ nome, ms: Number(process.hrtime.bigint() - t) / 1e6, status: r.status });
  }

  for (const m of pelaRede.sort((a, b) => b.ms - a.ms)) {
    const sinal = m.status >= 400 ? '·' : m.ms > 300 ? '✗' : m.ms > 100 ? '⚠' : '✓';
    console.log(`  ${sinal} ${String(m.ms.toFixed(1)).padStart(8)} ms  [${m.status}]  ${m.nome}`);
  }
  console.log('\n  · = rota respondeu erro; o tempo dela não diz nada.');

  await nest.close();
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
