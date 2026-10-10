import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
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
  private readonly log = new Logger('Banco');

  /*
   * O BANCO QUE REINICIA NÃO DERRUBA O SERVIDOR (fase 194).
   *
   * Conexão que o banco encerra (reinício para manutenção, restauração de
   * backup, queda) emite `error` no cliente do `pg`; sem quem a ouça, o Node
   * encerra o processo inteiro, e o plantão fica sem sistema até alguém
   * reiniciar a API. Aqui o erro é anotado (só a classe e o código, nunca a
   * consulta) e a conexão sai do pool; a próxima pergunta abre outra. Achado
   * pela simulação de 30 dias da fase 194, quando o banco caiu no meio do
   * ensaio de navegador e levou a API junto.
   */
  constructor() {
    this.pool.on('error', (e: Error & { code?: string }) => {
      this.log.warn(`conexão ociosa encerrada pelo banco (${e.code ?? e.name}); o pool abre outra`);
    });
  }

  /** Consulta SEM identidade (login, health). Use com parcimônia. */
  query(text: string, params?: unknown[]) {
    return this.pool.query(text, params);
  }

  /** Executa `fn` numa transação com a identidade do usuário aplicada ao RLS. */
  async asUser<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    /* Enquanto emprestada, a conexão também não pode derrubar o processo: a
       consulta em curso recebe o erro, e a conexão volta ao pool para ser descartada. */
    let quebrou: Error | undefined;
    const naoDerruba = (e: Error) => { quebrou = e; };
    client.on('error', naoDerruba);
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.off('error', naoDerruba);
      client.release(quebrou);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
