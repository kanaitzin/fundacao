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

/**
 * Número vindo do ambiente, com o padrão quando não há ou não é número.
 *
 * O zero escrito desliga o limite, como no Postgres (fase 227). Só a simulação
 * o usa: sob o relógio de mentira o banco encerrava por "transação parada"
 * sessões paradas havia zero segundo, e nenhum limite que o Postgres aceita
 * passa da distância entre a data simulada e a real. No servidor do Pão o
 * instalador recusa o zero.
 */
function numero(v: string | undefined, padrao: number): number {
  if (v === undefined || v.trim() === '') return padrao;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : padrao;
}
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
  /*
   * OS LIMITES DE TEMPO DA CONEXÃO (fase 219).
   *
   * Sem eles, o banco esperava para sempre: uma consulta presa, uma linha
   * travada por outra transação ou uma transação esquecida aberta seguravam a
   * conexão, e com dez conexões no pool bastam dez para o plantão inteiro
   * ficar parado sem erro nenhum na tela. Com eles, a espera acaba com uma
   * recusa que diz que nada foi salvo, e a pessoa tenta de novo. Os números
   * ficam muito acima do que a carga de dois anos mediu (nenhuma leitura
   * acima de 600 ms), e mudam pelo ambiente sem mexer no código.
   */
  readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_APP_URL ??
      'postgres://rede_app:dev-only-change-me-app@localhost:5432/rede_acolher',
    max: numero(process.env.BANCO_CONEXOES, 10),
    types: TIPOS,
    application_name: 'rede-acolher-api',
    // Uma consulta sozinha não passa de um minuto.
    statement_timeout: numero(process.env.BANCO_LIMITE_CONSULTA_MS, 60_000),
    // Esperar a linha que outra transação travou: quinze segundos.
    lock_timeout: numero(process.env.BANCO_LIMITE_TRAVA_MS, 15_000),
    // Transação aberta e parada (o código esqueceu de fechar): dois minutos.
    idle_in_transaction_session_timeout: numero(process.env.BANCO_LIMITE_PARADA_MS, 120_000),
    // Todas as conexões ocupadas: esperar por uma, no máximo quinze segundos.
    connectionTimeoutMillis: numero(process.env.BANCO_LIMITE_CONEXAO_MS, 15_000),
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
