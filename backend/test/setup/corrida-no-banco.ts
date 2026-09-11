/**
 * DUAS PESSOAS FAZENDO O MESMO ATO AO MESMO TEMPO — sem sorte de agenda.
 *
 * Nasceu na fase 89 (o retorno familiar, 1080) e virou ajudante na fase 90,
 * quando a mesma prova foi preciso para as transferências, a ATA Geral e os
 * combinados. Três cópias da mesma corrida divergiriam no primeiro ajuste —
 * e uma prova de concorrência que diverge passa a provar outra coisa.
 *
 * O desenho, que é o que torna o teste determinístico:
 *   1. a sessão A faz o ato e NÃO confirma: fica segurando a trava da linha;
 *   2. a sessão B começa o mesmo ato — lê o estado antigo e para na trava;
 *   3. o teste ESPERA ver B parada (pg_locks, `granted = false`);
 *   4. só então A confirma, e B segue sozinha.
 *
 * O defeito que isto pega é o da regra 11: estado conferido numa leitura e
 * gravado com `UPDATE … WHERE id = …`. Com o estado no WHERE, B reavalia a
 * linha depois da trava e é recusada. Sem ele, B SOBRESCREVE A — e as duas
 * pessoas recebem sucesso.
 *
 * Devolve 'aceito' ou a mensagem de erro de B. Quando B é aceita, confirma B,
 * para o estrago ficar no banco e poder ser lido de volta: é assim que a prova
 * mostra o que a corrida fazia, e não só que ela passava.
 */
import { Client } from 'pg';

export interface Ato { email: string; sql: string; params: unknown[] }

export async function corrida(admin: Client, primeiro: Ato, segundo: Ato): Promise<string> {
  const appUrl = process.env.DATABASE_APP_URL
    ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher';
  const idDe = async (email: string) => {
    const { rows } = await admin.query(`SELECT id FROM app_user WHERE email=$1`, [email]);
    if (!rows.length) throw new Error(`corrida: não existe conta ${email} no seed`);
    return rows[0].id as string;
  };
  const A = new Client({ connectionString: appUrl });
  const B = new Client({ connectionString: appUrl });
  await A.connect(); await B.connect();
  try {
    await A.query('BEGIN');
    await A.query(`SELECT set_config('app.user_id', $1, true)`, [await idDe(primeiro.email)]);
    await A.query(primeiro.sql, primeiro.params);

    const { rows: [{ pid }] } = await B.query('SELECT pg_backend_pid() AS pid');
    await B.query('BEGIN');
    await B.query(`SELECT set_config('app.user_id', $1, true)`, [await idDe(segundo.email)]);
    const desfecho = B.query(segundo.sql, segundo.params)
      .then(() => 'aceito', (e) => String(e?.message ?? e));

    let parada = false;
    for (let i = 0; i < 100 && !parada; i++) {
      const { rows: [{ n }] } = await admin.query(
        `SELECT count(*)::int AS n FROM pg_locks WHERE pid = $1 AND NOT granted`, [pid]);
      parada = n > 0;
      if (!parada) await new Promise((r) => setTimeout(r, 50));
    }
    await A.query('COMMIT');
    const r = await desfecho;
    await B.query(r === 'aceito' ? 'COMMIT' : 'ROLLBACK').catch(() => undefined);
    /*
     * Se B nunca parou na trava, ela não disputou a linha com A: ou terminou
     * antes (e a corrida não aconteceu), ou o ato não trava nada. Nos dois
     * casos o teste não prova o que diz — e diz isso, em vez de passar.
     */
    if (!parada && r === 'aceito') {
      return 'aceito (sem disputa: B não chegou a esperar a trava de A)';
    }
    return r;
  } finally {
    await A.end(); await B.end();
  }
}
