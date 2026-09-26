import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { VOCABULARIO_DA_AUDITORIA } from '../../kernel/audit/vocabulario';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * A AUDITORIA, QUE ERA ESCRITA E NÃO TINHA POR ONDE SER LIDA.
 *
 * Todo serviço grava em `audit_event` — é o lastro do "toda ação tem autor e
 * histórico" (regra 6). A varredura da fase 106 (§9, item 1) encontrou o maior
 * e mais silencioso dos achados: **não existia rota**, em controlador nenhum,
 * que lesse essa tabela. Saíam duas fatias — quem abriu o cofre (0560) e quem
 * abriu os benefícios (0830) —, e todo o resto era gravado e não tinha tela.
 * A §7 promete a linha "Auditoria (leitura)" à coordenação na própria casa e
 * ao Gestor Geral: era uma capacidade da matriz **sem porta nenhuma**.
 *
 * ============================================================================
 * A DECISÃO QUE DESENHA ESTA TELA, E ELA NÃO ESTÁ NO CÓDIGO — está aqui.
 *
 * A diferença entre AUDITORIA e VIGILÂNCIA DA EQUIPE não é técnica: é a
 * pergunta que a tela deixa fazer.
 *
 *  * *"quem abriu o dossiê da Alice?"* é auditoria — protege a criança;
 *  * *"tudo o que a Joana fez ontem"* é vigilância — mede a pessoa.
 *
 * As duas leem a mesma tabela. Por isso **este serviço não tem busca por
 * ator**, e não vai ter: entra-se pela CRIANÇA ou pelo REGISTRO, e o nome de
 * quem agiu aparece na linha — como aparece em toda tela do sistema — sem
 * nunca ser o filtro.
 *
 * E **não conta nada**. Nem quantos acessos, nem quantas aberturas por pessoa,
 * nem ranking de nada: é a mesma regra que proíbe somar plantão por nome (§7),
 * pedido de lanche por educador (§8.9.1) e movimento de armário por quem o fez
 * (fase 109). Um total ao lado de um nome é uma avaliação que ninguém assinou.
 *
 * *Se a Fundação quiser a busca por pessoa — numa apuração formal, por
 * exemplo —, isso é decisão dela e vira outro caminho, com finalidade escrita
 * e registro da própria consulta. Não se acrescenta um filtro numa tela que
 * quarenta pessoas abrem todo dia.*
 * ============================================================================
 *
 * O RECORTE É DO BANCO: a policy `audit_select` (0920) já dizia exatamente o
 * que a §7 promete — gestão geral vê tudo, a coordenação vê a própria casa,
 * todo o resto não vê nada. Este serviço não repete essa regra; ele confia
 * nela, e só recusa cedo para a frase que chega à tela ser a da casa.
 */

/** Quem alcança a leitura — o mesmo conjunto da policy `audit_select`. */
const LEEM = ['coordenador', 'gestor_geral', 'admin_tecnico'];

/**
 * O QUE CADA AÇÃO QUER DIZER, EM PORTUGUÊS DE QUEM LÊ.
 *
 * Isto era um mapa de dezoito entradas escrito AQUI, e escrito de memória. A
 * fase 115 mediu: o sistema grava 145 ações, o mapa cobria dez, e oito das
 * suas dezoito entradas não casavam com ação nenhuma. Nada acusava, porque um
 * `Record` que devolve `undefined` cai no `?? r.action` e a tela mostra o
 * código cru — em inglês, na leitura do rastro de uma criança.
 *
 * O vocabulário mudou de lugar por um motivo: no kernel, ao lado de quem
 * ESCREVE a auditoria, ele é conferido contra o código inteiro
 * (`vocabulario-da-auditoria.spec.ts`). Aqui, ao lado de quem a lê, ele só
 * podia ser conferido contra a lembrança de quem o escrevesse.
 *
 * Ação sem tradução continua aparecendo com o código cru **e não some**: some
 * seria pior — uma linha faltando numa auditoria é a única coisa que ela não
 * pode ter. O conferidor é que garante que esse caminho fique vazio.
 */
const ACAO = VOCABULARIO_DA_AUDITORIA;

@Injectable()
export class AuditoriaService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private podeLer(user: AuthenticatedUser) {
    if (!LEEM.includes(user.role)) {
      throw new ForbiddenException(
        'A auditoria é lida pela coordenação, na própria casa, e pela gestão geral. '
        + 'Quem age no sistema tem o nome em cada registro — mas ler o rastro é outro ato.');
    }
  }

  private linha(r: any) {
    return {
      id: r.id,
      acao: ACAO[r.action] ?? r.action,
      codigo: r.action,
      quando: r.at,
      /* O NOME DE QUEM AGIU aparece — toda ação tem autor. O que não existe é
         o caminho inverso: não se entra por ele. */
      por: r.por ?? '—',
      casa: r.casa ?? null,
      entidade: r.entity, entidadeId: r.entity_id,
      /* A FINALIDADE é a razão de metade destas linhas existirem: exportar um
         relatório e abrir um anexo restrito exigem dizer para quê, e é isso
         que alguém vai querer ler seis meses depois. */
      finalidade: r.purpose,
      detalhe: r.detail ?? {},
    };
  }

  /**
   * O QUE FOI FEITO SOBRE UMA CRIANÇA.
   *
   * Entra-se pela criança porque é ela que a auditoria protege. Uma ação
   * aparece aqui de dois jeitos: quando a entidade É ela (`person`), e quando
   * o serviço escreveu `personId` no detalhe — que é como as ações sobre o
   * dossiê, a educação e a convivência se identificam.
   */
  async doAcolhido(user: AuthenticatedUser, personId: string, dias = 90) {
    this.podeLer(user);
    const janela = Math.min(Math.max(dias, 1), 365);
    return this.db.asUser(user.id, async (c) => {
      const { rows: [existe] } = await c.query(
        `SELECT 1 FROM person WHERE id = $1 AND app_person_in_scope(id)`, [personId]);
      /* Fora de alcance responde 404 idêntico a inexistente (§4.5). */
      if (!existe) {
        throw new NotFoundException('Acolhido não encontrado — ou fora do seu alcance.');
      }
      const { rows } = await c.query(
        `SELECT a.id, a.action, a.at, a.entity, a.entity_id, a.purpose, a.detail,
                app_user_display_name(a.actor_id) AS por,
                -- rls-join-ok (house): a linha só chega aqui se a audit_select
                -- a entregou, e ela exige a casa no alcance de quem lê.
                (SELECT h.code FROM house h WHERE h.id = a.house_id) AS casa
           FROM audit_event a
          WHERE (a.entity_id = $1 OR a.detail->>'personId' = $1::text)
            AND a.at >= now() - ($2::int * interval '1 day')
          ORDER BY a.at DESC
          LIMIT 300`, [personId, janela]);
      return { dias: janela, cortado: rows.length === 300, linhas: rows.map((r) => this.linha(r)) };
    });
  }

  /**
   * QUEM ABRIU, EXPORTOU OU MEXEU NESTE REGISTRO.
   *
   * A outra entrada legítima: um relatório que circulou, um anexo restrito,
   * uma folha da portaria. A pergunta é sobre o DOCUMENTO — "por onde esta
   * cópia saiu, e para quê" —, e não sobre quem estava de plantão.
   */
  async doRegistro(user: AuthenticatedUser, entidade: string, entidadeId: string) {
    this.podeLer(user);
    const r = await this.db.asUser(user.id, async (c) => {
      /*
       * O RELATÓRIO ESTÁ NO SEU ALCANCE? — perguntado DEPOIS do cargo (fase 158).
       *
       * A resposta a quem é de fora era lista vazia, que se lê "ninguém abriu
       * este relatório" (regra 12). A pergunta é feita COM a identidade de quem
       * lê — o RLS de `report_document` responde —, e não por fora dele. Vem
       * depois do `podeLer` para o educador continuar recebendo a frase que diz
       * quem lê o rastro, e não um "não encontrado" que não ensina nada.
       */
      const { rows: [v] } = await c.query(
        `SELECT EXISTS (SELECT 1 FROM report_document WHERE id = $1) AS ve`, [entidadeId]);
      if (!v?.ve) return null;
      const { rows } = await c.query(
        `SELECT a.id, a.action, a.at, a.entity, a.entity_id, a.purpose, a.detail,
                app_user_display_name(a.actor_id) AS por,
                -- rls-join-ok (house): a linha só chega aqui se a audit_select
                -- a entregou, e ela exige a casa no alcance de quem lê.
                (SELECT h.code FROM house h WHERE h.id = a.house_id) AS casa
           FROM audit_event a
          WHERE a.entity = $1 AND a.entity_id = $2
          ORDER BY a.at DESC
          LIMIT 300`, [entidade, entidadeId]);
      /* Lista vazia NÃO é erro: pode não ter acontecido nada com este
         registro, e dizer isso é informação. Erro seria devolver 404 e deixar
         quem pergunta achando que procurou no lugar errado. */
      return { entidade, entidadeId, linhas: rows.map((r) => this.linha(r)) };
    });
    if (!r) throw new NotFoundException('Relatório não encontrado — ou fora do seu alcance.');
    return r;
  }
}
