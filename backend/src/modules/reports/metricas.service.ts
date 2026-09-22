import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';

/**
 * ============================================================================
 * O PAINEL DE MÉTRICAS DAS OITO CASAS — a resposta à pergunta 1.
 *
 * Aberta desde 09/09 e respondida em 15/09/2026. Ele pediu, com estas palavras,
 * *"uma visão quantitativa, com métricas […] só gráficos, dashboards […] para
 * ele poder dizer isso como uma forma de amor que o Pão dos Pobres tem"*.
 *
 * **Isto não é um painel de controle: é a matéria-prima de um relatório de
 * impacto.** A diferença muda o desenho — um painel de controle existe para
 * apontar o que está errado; um relatório de impacto existe para contar o que
 * a instituição fez com o dinheiro e com o tempo dela. Por isso os números
 * grandes no alto são os do CONJUNTO, e não os desvios.
 *
 * ---
 *
 * O QUE ELE PEDIU E EU NÃO ENTREGO — e o que entrego no lugar
 *
 * *"quantas crianças tiveram boas notas."* Não existe nota neste sistema.
 * Existe a SÉRIE e a evolução educacional em texto livre, que não se conta.
 * No lugar vão duas coisas verdadeiras: quantas crianças têm **apoio
 * educacional** registrado, e quantas **evoluções** foram escritas no período.
 * Estimar "boas notas" a partir de texto livre seria pôr num relatório de
 * prestação de contas um número que ninguém digitou.
 *
 * *"gráfico de pizza."* Para oito casas, não. Uma pizza de oito fatias é o
 * gráfico que ninguém consegue ler — as fatias vizinhas ficam do mesmo
 * tamanho, e a pergunta dele é justamente comparar. Oito casas lado a lado
 * são **barras**, que se leem de relance e na ordem certa. A rosca fica onde
 * ela é verdade: parte-do-todo com poucas fatias.
 *
 * ---
 *
 * COMPARAR CASAS, que era a minha objeção, e ele respondeu
 *
 * *"Não interessa se para ti parece uma competição. Ele precisa ter os dados
 * reais […] é uma forma de ele poder melhorar o acompanhamento das outras
 * casas para as outras crianças que não atingiram o tamanho dos resultados."*
 *
 * A frase dele é melhor que a minha recusa, e o alvo da comparação é o que
 * importa: **a criança da outra casa.** O que continua valendo, porque não foi
 * o que ele revisou: a ordem é o código da casa e nunca o total; nenhuma
 * contagem é por criança nomeada; e nada de média, meta ou projeção.
 * ============================================================================
 */

/** Só o Gestor Geral — foi ele quem a Fundação nomeou, e é dele o alcance das oito. */
export const LEEM_AS_METRICAS_DAS_CASAS = ['gestor_geral'];

/** Um ano. Um painel de impacto que não fecha o ano não serve ao relatório. */
export const JANELA_MAXIMA_DIAS = 366;

@Injectable()
export class MetricasService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async porCasa(user: AuthenticatedUser, de?: string, ate?: string) {
    if (!LEEM_AS_METRICAS_DAS_CASAS.includes(user.role)) {
      throw new ForbiddenException(
        'O painel das oito casas é do Gestor Geral, que responde pela instituição.');
    }
    /* O dia é lido AGORA, e não guardado: o "hoje" numa constante é uma
       resposta que envelhece sozinha, uma vez a cada 24 horas (§6, regra 13). */
    const fim = ate || hojeNaInstituicao();
    const inicio = de || this.diasAntes(fim, 29);
    if (inicio > fim) {
      throw new BadRequestException('A data inicial vem depois da final. Confira o período.');
    }
    if (this.diasEntre(inicio, fim) > JANELA_MAXIMA_DIAS) {
      throw new BadRequestException('O período vai até um ano.');
    }

    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM app_metricas_das_casas($1::date, $2::date)`, [inicio, fim]);
      return rows;
    });

    /* Abrir o painel das oito casas é um ato, e ele fica registrado — como
       toda abertura de casa pelo Gestor Geral já fica (§8.10). Sem finalidade
       escrita, ao contrário do trabalho da equipe: aqui não há nome de pessoa
       nenhuma, e exigir uma frase para ver o próprio painel de gestão seria
       burocracia sem quem proteger. */
    await this.audit.log({
      action: 'painel.metricas', actorId: user.id, institutionId: user.institutionId,
      detail: { de: inicio, ate: fim, casas: linhas.length },
    });

    const casas = linhas.map((r: any) => ({
      id: r.house_id, codigo: r.code, nome: r.name,
      acolhidos: Number(r.acolhidos), capacidade: Number(r.capacidade),
      entradas: Number(r.entradas), saidas: Number(r.saidas),
      passouDeAno: Number(r.passou_de_ano), marcos: Number(r.marcos),
      apoioEducacional: Number(r.apoio_educacional),
      evolucoesEducacionais: Number(r.evolucoes_educacionais),
      /* O conceito do bimestre (1450), por intersecção de período. */
      conceitoAcompanha: Number(r.conceito_acompanha),
      conceitoNaoAcompanha: Number(r.conceito_nao_acompanha),
      internacoes: Number(r.internacoes),
      medicamentosSaidos: Number(r.medicamentos_saidos),
      notasCentavos: Number(r.notas_centavos),
      notasSemValor: Number(r.notas_sem_valor),
      lanches: Number(r.lanches), cestas: Number(r.cestas),
      reunioes: Number(r.reunioes),
      acompanhamentosAprovados: Number(r.acompanhamentos_aprovados),
      acompanhamentosAbertos: Number(r.acompanhamentos_abertos),
      relatorios: Number(r.relatorios),
      atasFechadas: Number(r.atas_fechadas),
      atasComPendencia: Number(r.atas_com_pendencia),
      ocorrencias: Number(r.ocorrencias),
      ocorrenciasRestritas: Number(r.ocorrencias_restritas),
      pessoasNaEscala: Number(r.pessoas_na_escala),
    }));

    const soma = (f: (c: typeof casas[number]) => number) =>
      casas.reduce((t, c) => t + f(c), 0);

    return {
      de: inicio,
      ate: fim,
      casas,
      /*
       * O TOTAL DA INSTITUIÇÃO — o número que vai no relatório de impacto.
       *
       * Vem primeiro na tela, e de propósito: a pergunta dele é "o que o Pão
       * dos Pobres fez", e a comparação entre casas é o segundo olhar, não o
       * primeiro. Uma tela que abre com oito barras convida a procurar a pior
       * antes de olhar o conjunto.
       */
      total: {
        casas: casas.length,
        acolhidos: soma((c) => c.acolhidos),
        capacidade: soma((c) => c.capacidade),
        entradas: soma((c) => c.entradas),
        saidas: soma((c) => c.saidas),
        passouDeAno: soma((c) => c.passouDeAno),
        marcos: soma((c) => c.marcos),
        apoioEducacional: soma((c) => c.apoioEducacional),
        evolucoesEducacionais: soma((c) => c.evolucoesEducacionais),
        conceitoAcompanha: soma((c) => c.conceitoAcompanha),
        conceitoNaoAcompanha: soma((c) => c.conceitoNaoAcompanha),
        internacoes: soma((c) => c.internacoes),
        medicamentosSaidos: soma((c) => c.medicamentosSaidos),
        notasCentavos: soma((c) => c.notasCentavos),
        notasSemValor: soma((c) => c.notasSemValor),
        lanches: soma((c) => c.lanches),
        cestas: soma((c) => c.cestas),
        reunioes: soma((c) => c.reunioes),
        acompanhamentosAprovados: soma((c) => c.acompanhamentosAprovados),
        acompanhamentosAbertos: soma((c) => c.acompanhamentosAbertos),
        relatorios: soma((c) => c.relatorios),
        atasFechadas: soma((c) => c.atasFechadas),
        atasComPendencia: soma((c) => c.atasComPendencia),
        ocorrencias: soma((c) => c.ocorrencias),
        ocorrenciasRestritas: soma((c) => c.ocorrenciasRestritas),
        pessoasNaEscala: soma((c) => c.pessoasNaEscala),
      },
      /*
       * AS RESSALVAS VÃO COM O NÚMERO, e não numa nota de rodapé.
       *
       * A primeira é a que mais custa caro num relatório de prestação de
       * contas: o preço soma o que foi LANÇADO. Uma compra registrada sem
       * valor some da conta, e R$ 4.200 com seis notas sem valor não é
       * R$ 4.200.
       */
      ressalvas: [
        soma((c) => c.notasSemValor) > 0
          ? `${soma((c) => c.notasSemValor)} nota(s) fiscal(is) sem valor lançado — o total `
            + 'gasto é MAIOR do que o número acima. Lançar o valor é o que fecha a conta.'
          : null,
        /*
         * A FRASE MUDA COM O SISTEMA, e é a terceira versão dela.
         *
         * A primeira dizia que não existia campo de nota, boletim ou conceito — era
         * verdade até a fase 137. A segunda dizia que o conceito existia e o painel
         * não o contava — era verdade até esta. **Frase de tela que envelhece é
         * frase que mente**, e é por isso que ela é reescrita junto do código.
         */
        'Não existe nota escolar neste sistema, e não vai existir. O que o painel conta é o '
        + 'CONCEITO do bimestre, escrito pela equipe com o porquê ao lado — quem está '
        + 'acompanhando o ano e quem não está. "Acompanha com apoio" não vira caixa: é uma '
        + 'criança que ESTÁ acompanhando, e o apoio já tem a caixa dele.',
        /* O número contado é do BIMESTRE que encosta na janela, e não da data em que
           alguém digitou: o retorno atrasado da escola é o caso comum. */
        'O conceito conta pelo BIMESTRE, não pela data em que foi digitado — o conceito do 3º '
        + 'bimestre lançado em novembro conta no 3º. E conta uma vez por criança: a versão '
        + 'corrigida é história, e não soma.',
        'As casas saem na ordem do código, nunca por resultado: ordenar por número é a '
        + 'classificação pronta, e ela precisa ser decisão de quem lê.',
      ].filter(Boolean) as string[],
    };
  }

  private diasAntes(ate: string, dias: number) {
    const d = new Date(`${ate}T12:00:00-03:00`);
    d.setUTCDate(d.getUTCDate() - dias);
    return d.toISOString().slice(0, 10);
  }

  private diasEntre(de: string, ate: string) {
    return Math.round((new Date(`${ate}T12:00:00-03:00`).getTime()
      - new Date(`${de}T12:00:00-03:00`).getTime()) / 86_400_000);
  }
}
