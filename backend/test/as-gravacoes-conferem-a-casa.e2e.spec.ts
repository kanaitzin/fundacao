/**
 * AS GRAVAÇÕES CONFEREM A CASA (fase 298; o M5 da análise geral de 08/11).
 *
 * Até a 1696, várias políticas de gravação conferiam o cargo ou o autor e não a casa da linha
 * nova. Provado como o papel da aplicação: a coordenação da Casa 04 levava a estadia de uma
 * criança para a Casa 03, punha horário de remédio na receita de uma criança da Casa 03,
 * gravava horário de trabalho e síntese de ocorrência na Casa 03, e o educador da Casa 04 dava
 * ciência numa atividade da Casa 03.
 *
 * Esta suíte cobra duas coisas:
 *  1. NEGA POR PADRÃO, pelo catálogo: toda política de gravação do `rede_app`, numa tabela em
 *     que ele grava, confere o alcance (a casa, a pessoa, ou um registro que ele lê) na linha
 *     nova; a que não confere reprova até entrar na lista `SEM_CASA_DE_PROPOSITO`, com o motivo;
 *  2. as tentativas provadas, uma a uma, como o papel da aplicação com a identidade da Casa 04.
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/kernel/database/database.service';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** A política de gravação que não pergunta pela casa, e por quê. */
const SEM_CASA_DE_PROPOSITO: Record<string, string> = {
  'audit_event.audit_insert': 'a auditoria se escreve também sem identidade, na entrada e na recusa de senha (1679)',
  'notification.notif_update': 'cada um marca como lido e ciente só o próprio aviso (1704)',
  'export_log.exp_insert': 'o registro da exportação é de quem exportou; a exportação confere a casa antes',
  'offline_operation.oo_insert': 'a fila é de quem a mandou; quem grava o registro é a função de cada módulo, que confere a casa',
  'offline_operation.oo_update': 'a fila é de quem a mandou (1694)',
  'health_summary_issue.summary_update': 'quem emitiu o resumo marca só que baixou (1706); a emissão confere a casa',
};

/** O que conta como conferir o alcance na linha nova. O autor sozinho não conta. */
const CONFERE_O_ALCANCE =
  /alcance|in_scope|EXISTS|app_pode_ver_internacao|app_can_see_benefits|app_can_see_credentials|app_decide_palavra|^false$/;

describe('As gravações conferem a casa', () => {
  let app: INestApplication, admin: Client, db: DatabaseService;
  const u: Record<string, string> = {};
  const x: Record<string, string> = {};

  /** Tenta como o papel da aplicação e desfaz sempre. Devolve 'passou' ou a recusa. */
  const tenta = async (quem: string, sql: string, p: unknown[] = []) => {
    let res = '';
    await db.asUser(u[quem], async (c) => {
      try {
        const r = await c.query(sql, p);
        res = (r.rowCount ?? 0) > 0 ? 'passou' : 'nada';
      } catch (e: any) { res = `recusou: ${e?.message ?? e}`; }
      throw new Error('desfaz');
    }).catch(() => undefined);
    return res;
  };

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    db = app.get(DatabaseService);
    for (const [k, email] of Object.entries({
      coord4: 'coord.ai4@paodospobres.dev', educador4: 'educador.ai4@paodospobres.dev',
      coord3: 'coord.ai3@paodospobres.dev',
    })) u[k] = (await admin.query(`SELECT id FROM app_user WHERE email = $1`, [email])).rows[0].id;
    const um = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows[0]?.id as string;
    x.ai3 = await um(`SELECT id FROM house WHERE code='AI3'`);
    x.ai4 = await um(`SELECT id FROM house WHERE code='AI4'`);
    x.kid3 = await um(`SELECT person_id AS id FROM house_stay WHERE house_id=$1 AND status='ativa' ORDER BY person_id LIMIT 1`, [x.ai3]);
    x.stay4 = await um(`SELECT id FROM house_stay WHERE house_id=$1 AND status='ativa' ORDER BY id LIMIT 1`, [x.ai4]);
    /* Os registros da Casa 03 que a Casa 04 tenta alcançar, escritos pelo dono e marcados. */
    x.act3 = await um(`INSERT INTO activity (house_id, kind, title, scheduled_at)
      VALUES ($1, 'coletiva', 'conferência 298', now() + interval '400 days') RETURNING id`, [x.ai3]);
    x.inc3 = await um(`INSERT INTO incident (house_id, category, happened_at, objective_fact, opened_by)
      VALUES ($1, 'outro', now(), 'conferência 298', $2) RETURNING id`, [x.ai3, u.coord3]);
    x.presc3 = await um(`INSERT INTO prescription (person_id, house_id, kind, medication, dose, route)
      VALUES ($1, $2, (SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                        WHERE t.typname = 'prescription_kind' ORDER BY e.enumsortorder LIMIT 1)::prescription_kind,
              'Conferência 298', '1', 'oral') RETURNING id`, [x.kid3, x.ai3]);
    await admin.query(`INSERT INTO activity (house_id, kind, title, scheduled_at)
      VALUES ($1, 'coletiva', 'conferência 298', now() + interval '400 days')`, [x.ai4]);
    x.tr = await um(`INSERT INTO transfer_request (person_id, episode_id, from_house_id, to_house_id, reason, requested_by, status)
      SELECT s.person_id, s.episode_id, s.house_id, $2, 'conferência 298', $3, 'devolvida'
        FROM house_stay s WHERE s.person_id = $1 AND s.status = 'ativa' RETURNING id`, [x.kid3, x.ai4, u.coord3]);
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('toda política de gravação confere o alcance na linha nova, ou diz por que não', async () => {
    const { rows } = await admin.query(
      `SELECT p.tablename || '.' || p.policyname AS nome, coalesce(p.with_check, p.qual, '') AS confere
         FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.cmd IN ('INSERT', 'UPDATE', 'ALL') AND 'rede_app' = ANY (p.roles)
          AND (has_table_privilege('rede_app', ('public.' || p.tablename)::regclass,
                                   CASE p.cmd WHEN 'INSERT' THEN 'INSERT' ELSE 'UPDATE' END)
               OR EXISTS (SELECT 1 FROM information_schema.column_privileges cp
                           WHERE cp.grantee = 'rede_app' AND cp.table_name = p.tablename
                             AND cp.privilege_type = CASE p.cmd WHEN 'INSERT' THEN 'INSERT' ELSE 'UPDATE' END))`);
    const semAlcance = rows.filter((r) => !CONFERE_O_ALCANCE.test(r.confere)).map((r) => r.nome).sort();
    expect(semAlcance).toEqual(Object.keys(SEM_CASA_DE_PROPOSITO).sort());
  });

  it('a Casa 04 não grava na Casa 03, por caminho nenhum dos provados', async () => {
    const casos: [string, string, string, unknown[]][] = [
      ['estadia levada para a Casa 03', 'coord4', `UPDATE house_stay SET house_id = $1 WHERE id = $2`, [x.ai3, x.stay4]],
      ['episódio de criança da Casa 03', 'coord4',
        `INSERT INTO care_episode (person_id, institution_id, number, created_by)
         VALUES ($1, (SELECT institution_id FROM app_user WHERE id = app_current_user()), 9298, app_current_user())`, [x.kid3]],
      ['perfil de criança da Casa 03', 'coord4',
        `INSERT INTO profile_detail (person_id, notes, updated_by) VALUES ($1, 'x', app_current_user())`, [x.kid3]],
      ['horário na receita da Casa 03', 'coord4',
        `INSERT INTO medication_schedule (prescription_id, time_of_day) VALUES ($1, '03:00')`, [x.presc3]],
      ['horário de trabalho na Casa 03', 'coord4',
        `INSERT INTO work_schedule (user_id, house_id, weekday, start_time, end_time, created_by)
         VALUES (app_current_user(), $1, 1, '08:00', '20:00', app_current_user())`, [x.ai3]],
      ['ciência em atividade da Casa 03', 'educador4',
        `INSERT INTO activity_acknowledgement (activity_id, user_id) VALUES ($1, app_current_user())`, [x.act3]],
      ['execução de atividade da Casa 03', 'educador4',
        `INSERT INTO activity_execution (activity_id, user_id, resulting_state, performed_by)
         VALUES ($1, app_current_user(), 'concluida_no_horario', app_current_user())`, [x.act3]],
      ['síntese de ocorrência da Casa 03', 'coord4',
        `INSERT INTO incident_synthesis (incident_id, house_id, author_id, body)
         VALUES ($1, $2, app_current_user(), 'x')`, [x.inc3, x.ai3]],
      ['síntese de ocorrência da Casa 03 dita da Casa 04', 'coord4',
        `INSERT INTO incident_synthesis (incident_id, house_id, author_id, body)
         VALUES ($1, $2, app_current_user(), 'x')`, [x.inc3, x.ai4]],
      ['pedido de transferência devolvido reaberto pelo destino', 'coord4',
        `UPDATE transfer_request SET status = 'solicitada' WHERE id = $1`, [x.tr]],
      ['estadia reaberta por fora da readmissão', 'coord4',
        `UPDATE house_stay SET status = 'ativa', ended_at = NULL WHERE id = $1`, [x.stay4]],
      ['item na fila de arquivo da Casa 03', 'coord4',
        `SELECT * FROM app_archive_enqueue($1, 'ata', 'conferencia_298', gen_random_uuid(), 'x.pdf')`, [x.ai3]],
      ['relatório na ficha de criança da Casa 03', 'coord4',
        `INSERT INTO report_document (house_id, person_id, kind, period_start, period_end, purpose, created_by)
         VALUES (NULL, $1, 'mensal', app_hoje(), app_hoje(), 'x', app_current_user())`, [x.kid3]],
      ['atividade da Casa 04 levada para criança da Casa 03', 'coord4',
        `UPDATE activity SET person_id = $1 WHERE house_id = $2`, [x.kid3, x.ai4]],
      ['estadia encerrada reescrita', 'coord4',
        `UPDATE house_stay SET end_reason = 'outro motivo' WHERE house_id = $1 AND status = 'encerrada'`, [x.ai4]],
      ['aviso forjado para outra pessoa', 'educador4',
        `INSERT INTO notification (user_id, safe_title, title) VALUES ($1, 'x', 'x')`, [u.coord3]],
    ];
    const passaram: string[] = [];
    for (const [caso, quem, sql, p] of casos) {
      const r = await tenta(quem, sql, p);
      /* Recusa ou nenhuma linha alcançada: as duas seguram. */
      if (r === 'passou') passaram.push(`${caso}: ${r}`);
    }
    expect(passaram).toEqual([]);
  });

  it('e a própria casa continua gravando', async () => {
    const { rows: [k] } = await admin.query(
      `SELECT person_id AS kid4 FROM house_stay WHERE house_id = $1 AND status = 'ativa' ORDER BY person_id LIMIT 1`, [x.ai4]);
    const act4 = (await admin.query(`INSERT INTO activity (house_id, kind, title, scheduled_at)
      VALUES ($1, 'coletiva', 'conferência 298', now() + interval '400 days') RETURNING id`, [x.ai4])).rows[0].id;
    expect(await tenta('educador4',
      `INSERT INTO activity_acknowledgement (activity_id, user_id) VALUES ($1, app_current_user())`, [act4])).toBe('passou');
    expect(await tenta('coord4',
      `INSERT INTO work_schedule (user_id, house_id, weekday, start_time, end_time, created_by)
       VALUES (app_current_user(), $1, 1, '08:00', '20:00', app_current_user())`, [x.ai4])).toBe('passou');
    expect(await tenta('coord4',
      `UPDATE house_stay SET status = 'encerrada', ended_at = now(), end_reason = 'saida' WHERE id = $1`, [x.stay4])).toBe('passou');
    expect(await tenta('coord4',
      `SELECT * FROM app_archive_enqueue($1, 'ata', 'conferencia_298', gen_random_uuid(), 'x.pdf')`, [x.ai4])).toBe('passou');
    expect(k.kid4).toBeTruthy();
  });
});
