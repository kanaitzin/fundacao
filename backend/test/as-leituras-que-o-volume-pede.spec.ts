/**
 * AS LEITURAS QUE O VOLUME PEDE (fase 167).
 *
 * O ensaio de carga com dois anos (`scripts/ensaio-carga.ts 24`) é o que
 * mede; ele não é teste, porque leva minutos e precisa de banco próprio. Isto
 * aqui guarda o que ele achou e que ninguém veria quebrar de volta: com o
 * banco da suíte, pequeno, todas estas leituras são rápidas com ou sem o
 * conserto.
 */
import { Client } from 'pg';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const url = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('As leituras que o volume pede', () => {
  let c: Client;
  beforeAll(async () => { c = new Client({ connectionString: url }); await c.connect(); });
  afterAll(async () => { await c.end(); });

  it('os índices que o ensaio de dois anos pediu existem', async () => {
    /* Sem o primeiro, a história de um item do armário varre a tabela
       inteira (178 ms); sem o segundo, o painel da Enfermagem lê todas as
       doses de cada criança para achar a última (368 ms). */
    const { rows } = await c.query(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE indexname IN ('idx_movimento_do_item', 'idx_adm_pessoa_dada') ORDER BY 1`);
    expect(rows.map((r) => r.indexname)).toEqual(['idx_adm_pessoa_dada', 'idx_movimento_do_item']);
    expect(rows[0].indexdef).toMatch(/\(person_id, administered_at DESC\)/);
    expect(rows[1].indexdef).toMatch(/\(stock_id, at DESC\)/);
  });

  it('quem procura a pessoa no detalhe da auditoria repete a condição do índice parcial', () => {
    /*
     * `idx_audit_detalhe_pessoa` é parcial (`WHERE detail ? 'personId'`), e o
     * Postgres só o usa quando a consulta diz a mesma condição. Sem ela, a
     * auditoria de uma criança lia cada linha da casa: 377 ms com dois anos,
     * 0,05 ms com a condição.
     */
    const sem: string[] = [];
    for (const f of arquivos(join(__dirname, '..', 'src'))) {
      readFileSync(f, 'utf8').split('\n').forEach((linha, i) => {
        if (/detail\s*->>\s*'personId'/.test(linha) && !/detail\s*\?\s*'personId'/.test(linha)) {
          sem.push(`${f.split('/src/')[1]}:${i + 1}`);
        }
      });
    }
    expect(sem).toEqual([]);
  });

  it('com a condição, a consulta da auditoria de uma criança PODE usar o índice parcial', async () => {
    /* A mesma consulta do `AuditoriaService.doAcolhido`, com a varredura
       sequencial desligada: se o plano não acha o índice, é porque a
       condição não casa com a dele. */
    await c.query('BEGIN');
    try {
      await c.query('SET LOCAL enable_seqscan = off');
      const { rows } = await c.query(`
        EXPLAIN SELECT a.id FROM audit_event a
         WHERE (a.entity_id = '00000000-0000-0000-0000-000000000000'
                OR (a.detail ? 'personId' AND a.detail->>'personId' = 'x'))
           AND a.at >= now() - interval '90 days'
         ORDER BY a.at DESC LIMIT 300`);
      expect(rows.map((r) => r['QUERY PLAN']).join('\n')).toMatch(/idx_audit_detalhe_pessoa/);
    } finally {
      await c.query('ROLLBACK');
    }
  });
});
