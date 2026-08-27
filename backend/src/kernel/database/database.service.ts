import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

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
