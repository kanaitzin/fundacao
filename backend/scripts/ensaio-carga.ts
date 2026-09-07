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
 * Uso:  DATABASE_URL=... npx tsx scripts/ensaio-carga.ts [meses]
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
     ORDER BY n_live_tup DESC LIMIT 8
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

  const rotas: Array<[string, string]> = [
    ['Dia — painel da casa', `/api/v1/timeline/house-panel?houseId=${ai3}`],
    ['Dia — a linha do dia', `/api/v1/timeline?houseId=${ai3}`],
    ['Chamada — as de hoje', `/api/v1/checks?houseId=${ai3}`],
    ['Saúde — grade do dia', `/api/v1/medications?houseId=${ai3}`],
    ['Saúde — painel da enfermagem', `/api/v1/nursing/panel?houseId=${ai3}`],
    ['Passagem — plantões da casa', `/api/v1/shifts?houseId=${ai3}`],
    ['Acolhidos — a lista', `/api/v1/people?houseId=${ai3}`],
    /* As que nasceram depois da fase 51. A do trabalho social atravessa as
     * OITO casas — é o pior caso do sistema. */
    ['Trabalho social — as oito casas', '/api/v1/impacto/panorama'],
    ['Trabalho social — quem conquistou', '/api/v1/impacto/marcos'],
    ['Internação — as da casa', `/api/v1/nursing/hospitalizations?houseId=${ai3}&encerradas=1`],
    ['Perfil — com contatos e conquistas', `/api/v1/people/${primeiroAcolhido}`],
  ];

  const pelaRede: Array<{ nome: string; ms: number; status: number }> = [];
  for (const [nome, rota] of rotas) {
    await request(http).get(rota).set(auth);              // aquece
    const t = process.hrtime.bigint();
    const r = await request(http).get(rota).set(auth);
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
