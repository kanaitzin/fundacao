import { Inject, Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DatabaseService } from './database.service';

/**
 * A CONFERÊNCIA DE ARRANQUE.
 *
 * O sistema inteiro se apoia numa coisa: a aplicação fala com o banco como
 * `rede_app`, que **não** é superusuário e **não** é dono das tabelas — e por
 * isso o RLS vale. Toda regra de alcance deste projeto está escrita em
 * política de linha; se a conexão bypassa o RLS, elas viram decoração.
 *
 * E o jeito de desligar tudo isso é trivial: apontar `DATABASE_APP_URL` para a
 * URL do dono do banco. É uma linha num arquivo de ambiente, feita por quem
 * está com pressa às onze da noite porque "a aplicação está dando erro de
 * permissão". O sistema sobe, responde, funciona — **e mostra a casa inteira
 * para o educador de plantão.** Nada avisa. Nenhum teste pega, porque os
 * testes rodam com a conexão certa.
 *
 * Por isso a conferência acontece no ARRANQUE, e o serviço **recusa subir**
 * quando ela falha. Um aviso no log seria lido no dia seguinte, se fosse lido.
 *
 * Três perguntas, e as três precisam de resposta certa:
 *
 *  1. a conexão é de superusuário? Superusuário ignora RLS, sempre;
 *  2. o papel tem `BYPASSRLS`? Mesma coisa, por outro caminho;
 *  3. o RLS está de fato valendo? Esta é a que pega o caso do DONO das
 *     tabelas — que não é superusuário, não tem `BYPASSRLS`, e mesmo assim
 *     passa por cima das políticas, porque o Postgres isenta o dono a menos
 *     que a tabela use `FORCE ROW LEVEL SECURITY`. As duas primeiras
 *     perguntas responderiam "está tudo bem".
 */
@Injectable()
export class ConferenciaDeArranque implements OnApplicationBootstrap {
  private readonly log = new Logger('Arranque');

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async onApplicationBootstrap() {
    /*
     * A ÚNICA saída é `NODE_ENV=test`, que o Jest define sozinho.
     *
     * A primeira versão tinha também uma variável de ambiente para pular a
     * conferência, deliberadamente não documentada no `.env.example` — o
     * raciocínio era que quem a descobrisse estaria desligando a proteção
     * conscientemente. O conferidor de configuração (fase 56) reprovou, e
     * estava certo: uma variável que desliga a última proteção do sistema e
     * não aparece em lugar nenhum é uma porta dos fundos, não uma decisão
     * informada. Quem estiver com pressa às onze da noite vai encontrá-la no
     * código do mesmo jeito — e sem nenhum aviso ao lado.
     *
     * A suíte já roda com `NODE_ENV=test`. Não havia outro caso de uso.
     */
    if (process.env.NODE_ENV === 'test') return;

    const { rows: [quem] } = await this.db.query(
      `SELECT current_user AS papel,
              (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superusuario,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassa`);

    const recusar = (motivo: string): never => {
      this.log.error(
        `RECUSANDO SUBIR. ${motivo}\n`
        + `A aplicação está conectada como "${quem.papel}".\n`
        + 'Ela precisa da conexão de APLICAÇÃO (DATABASE_APP_URL, o papel rede_app), '
        + 'e não da conexão de DONO (DATABASE_URL, usada só para migrar).\n'
        + 'Com a conexão errada o sistema funciona — e o RLS deixa de valer, o que '
        + 'significa que qualquer pessoa da equipe enxerga as oito casas.',
      );
      throw new Error(`arranque_recusado: ${motivo}`);
    };

    if (quem.superusuario) {
      recusar('A conexão é de SUPERUSUÁRIO, e superusuário ignora o RLS.');
    }
    if (quem.bypassa) {
      recusar('O papel tem BYPASSRLS, e portanto passa por cima das políticas.');
    }

    /*
     * A prova prática, que é a que pega o dono das tabelas.
     *
     * Sem contexto de usuário (`app.user_id` não definido), toda política deste
     * sistema devolve vazio: `app_current_user()` é nulo, e nenhuma linha entra
     * no escopo. Se vier gente, é porque as políticas não estão sendo
     * aplicadas a esta conexão.
     *
     * `person` é a tabela certa para perguntar: ela tem RLS desde a migração
     * 0020 e é a que jamais pode vazar.
     */
    const { rows: [prova] } = await this.db.query(
      `SELECT count(*)::int AS n FROM person`);
    if (prova.n > 0) {
      recusar(
        `Sem identidade de usuário, o banco devolveu ${prova.n} pessoa(s) — deveria `
        + 'devolver zero. As políticas de RLS não estão valendo para esta conexão.');
    }

    this.log.log(
      `conexão de aplicação conferida: "${quem.papel}", sem superusuário e com o RLS valendo`);
  }
}
