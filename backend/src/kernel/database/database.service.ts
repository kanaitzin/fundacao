import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, types } from 'pg';

/**
 * A COLUNA `date` VOLTA COMO TEXTO, `AAAA-MM-DD` (fase 173).
 *
 * Data de calendário não tem hora nem fuso. O `pg` a entregava como `Date` à
 * meia-noite do fuso do processo, e o código que fazia `String(v).slice(0, 10)`
 * recebia `Sat Feb 13`: o relatório do período e o das compras imprimiram
 * *Invalid Date* em todas as linhas, na tela e no papel, e a simulação de
 * noventa dias foi quem leu. Pior que o erro visível era o invisível: a mesma
 * `Date`, formatada no fuso de Porto Alegre com o servidor em UTC, vira o dia
 * anterior. Texto não tem essa ambiguidade.
 */
const OID_DATE = 1082;
const TIPOS = {
  getTypeParser: ((oid: number, formato?: any) =>
    oid === OID_DATE ? (v: string) => v : types.getTypeParser(oid, formato)) as typeof types.getTypeParser,
};

/**
 * Acesso ao banco com o papel de aplicação (rede_app, não superusuário).
 *
 * Isolamento (§4.4): toda consulta em nome de um usuário roda dentro de uma
 * transação com `SET LOCAL app.user_id`, e as políticas de RLS derivam o
 * escopo DENTRO do banco. Esconder no frontend não basta; autorizar apenas
 * no serviço também não — o banco é a última linha.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_APP_URL ??
      'postgres://rede_app:dev-only-change-me-app@localhost:5432/rede_acolher',
    max: 10,
    types: TIPOS,
  });

  /** Consulta SEM identidade (login, health). Use com parcimônia. */
  query(text: string, params?: unknown[]) {
    return this.pool.query(text, params);
  }

  /** Executa `fn` numa transação com a identidade do usuário aplicada ao RLS. */
  async asUser<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
