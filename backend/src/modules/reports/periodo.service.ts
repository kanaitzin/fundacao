import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { cargoNoDocumento } from '../../kernel/documentos/folha';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import {
  folhaDoPeriodo, LinhaDoPeriodo, NumerosDoPeriodo, PeriodoDaCasa, RefeicaoDoPeriodo,
  SECOES_DO_PERIODO,
} from './periodo-folha';

/**
 * ============================================================================
 * O PERÍODO DA CASA — *"uma ata geral de toda semana"*, com o período livre.
 *
 * Resposta da Fundação em 15/09/2026 à pergunta R1 do roteiro:
 *
 *   *"Acompanhamento semanal é um bom caminho: ver como foi a casa toda aquela
 *   semana, tipo uma ata geral de toda semana, tanto manhã quanto noite."*
 *
 * E o período: *"se é um dia, dois, três, uma semana, um mês, seis meses […]
 * esse controle tem que ser livre para eles poderem brincar ali dentro."*
 *
 * ---
 *
 * A FRASE QUE DECIDE O DESENHO
 *
 * *"As observações que os educadores botam têm que ser ponderadas para ser
 * trazido coisas boas e negativas."*
 *
 * Um resumo semanal só do que deu errado ensina a equipe a ler a própria
 * semana como uma lista de falhas — e a criança, que é o assunto, some dele.
 * Por isso a conquista, a evolução escolar e a memória saem na MESMA consulta
 * que a ocorrência e o episódio da ATA, e a folha as põe antes.
 *
 * ---
 *
 * QUEM LÊ
 *
 * Líder Diurno, equipe técnica, coordenação e Gestor Geral: exatamente o
 * círculo que a Fundação desenhou em 15/09 para o dado sensível — *"apenas os
 * dados mais sigilosos é que têm esse olhar mais carinhoso entre o educador
 * líder, o coordenador, a equipe técnica e o gestor."*
 *
 * O educador não abre. Não por desconfiança — ele é quem escreve quase tudo o
 * que está aqui —, mas porque este documento junta seis meses da casa inteira
 * numa folha só, e um resumo desses é instrumento de coordenação. O que ele
 * registrou continua inteiro na tela dele, com o nome dele.
 * ============================================================================
 */

export const LEEM_O_PERIODO = ['lider_diurno', 'equipe_tecnica', 'coordenador', 'gestor_geral'];

/**
 * SEIS MESES, que é o teto que ele nomeou — e não um número meu.
 *
 * 184 dias e não 180: "seis meses" para quem escolhe num calendário é de 1º de
 * março a 31 de agosto, e um teto de 180 recusaria justamente esse pedido.
 */
export const JANELA_MAXIMA_DIAS = 184;

/** Teto por seção na função `app_periodo_da_casa_linhas`. */
const TETO_POR_SECAO = 150;

/** As opções de refeição que contam como exceção, com o rótulo da chamada. */
const ROTULO_DA_OPCAO: Record<string, string> = {
  parcial: 'Parcial', recusou: 'Recusou', desconforto: 'Desconforto', outro: 'Outro',
};

/** As categorias de ocorrência, pelo rótulo do §13.1. */
const ROTULO_DA_CATEGORIA: Record<string, string> = {
  violencia_ou_suspeita: 'Violência ou suspeita de violação',
  conflito_agressao: 'Conflito ou agressão',
  saida_nao_autorizada: 'Saída não autorizada',
  erro_medicamento: 'Erro de medicamento',
  emergencia_saude: 'Emergência de saúde',
  contencao: 'Contenção',
  desorganizacao_relevante: 'Desorganização com repercussão relevante',
  dano_recusa_critica: 'Dano, recusa crítica ou fato que exija acompanhamento',
  outro: 'Outro',
  desorganizacao: 'Desorganização',
  briga_conflito: 'Briga ou conflito',
  saude: 'Saúde',
  medicamento: 'Medicamento',
};

@Injectable()
export class PeriodoService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentosService) private readonly docs: DocumentosService,
  ) {}

  /** As seções, para a tela não inventar o vocabulário. */
  vocabulario() {
    return { secoes: SECOES_DO_PERIODO, janelaMaximaDias: JANELA_MAXIMA_DIAS };
  }

  async daCasa(user: AuthenticatedUser, houseId: string,
               de?: string, ate?: string): Promise<PeriodoDaCasa> {
    if (!LEEM_O_PERIODO.includes(user.role)) {
      throw new ForbiddenException(
        'O relatório do período é da coordenação, da equipe técnica, do Líder Diurno e da '
        + 'gestão. O que você registrou continua inteiro na sua tela, com o seu nome.');
    }
    if (!houseId) throw new BadRequestException('Escolha a unidade.');

    const fim = ate || hojeNaInstituicao();
    const inicio = de || this.diasAntes(fim, 6);
    if (inicio > fim) {
      throw new BadRequestException('A data inicial vem depois da final. Confira o período.');
    }
    const dias = this.diasEntre(inicio, fim) + 1;
    if (dias > JANELA_MAXIMA_DIAS) {
      throw new BadRequestException(
        'O período vai até seis meses. Para um recorte maior, tire dois relatórios: '
        + 'um resumo de um ano inteiro deixa de ser leitura e vira arquivo.');
    }

    const dados = await this.db.asUser(user.id, async (c) => {
      const { rows: [n] } = await c.query(
        `SELECT * FROM app_periodo_da_casa($1::uuid, $2::date, $3::date)`,
        [houseId, inicio, fim]);
      if (!n) return null;
      const { rows: refeicoes } = await c.query(
        `SELECT * FROM app_periodo_da_casa_alimentacao($1::uuid, $2::date, $3::date)`,
        [houseId, inicio, fim]);
      const { rows: linhas } = await c.query(
        `SELECT * FROM app_periodo_da_casa_linhas($1::uuid, $2::date, $3::date)`,
        [houseId, inicio, fim]);
      const { rows: [casa] } = await c.query(
        `SELECT code, name FROM house WHERE id = $1`, [houseId]);
      return { n, refeicoes, linhas, casa };
    });

    if (!dados?.n) {
      throw new NotFoundException(
        'Unidade não encontrada no seu alcance. O relatório é da casa por que você responde.');
    }
    const { n, casa } = dados;

    /* Abrir é um ato, e fica registrado — como toda leitura que junta o que
       está espalhado. Sem finalidade escrita: o leitor é da própria casa, e
       exigir uma frase para ela ler a própria semana seria burocracia sem
       quem proteger. Quem exporta, esse escreve a finalidade. */
    await this.audit.log({
      action: 'periodo.leitura', actorId: user.id, institutionId: user.institutionId,
      houseId, detail: { de: inicio, ate: fim, dias },
    });

    const numeros = {
      acolhidos: Number(n.acolhidos), capacidade: Number(n.capacidade),
      entradas: Number(n.entradas), saidas: Number(n.saidas),
      chamadas: Number(n.chamadas), chamadasConfirmadas: Number(n.chamadas_confirmadas),
      chamadasAbertas: Number(n.chamadas_abertas),
      refeicoesConferidas: Number(n.refeicoes_conferidas),
      refeicoesComExcecao: Number(n.refeicoes_com_excecao),
      criancasComExcecao: Number(n.criancas_com_excecao),
      ocorrencias: Number(n.ocorrencias), ocorrenciasRestritas: Number(n.ocorrencias_restritas),
      desorganizacao: Number(n.desorganizacao),
      atas: Number(n.atas), atasFechadas: Number(n.atas_fechadas),
      atasComPendencia: Number(n.atas_com_pendencia), atasAbertas: Number(n.atas_abertas),
      passagens: Number(n.passagens), passagensSemRecibo: Number(n.passagens_sem_recibo),
      doses: Number(n.doses), dosesConfirmadas: Number(n.doses_confirmadas),
      dosesSemResposta: Number(n.doses_sem_resposta), dosesAnterior: Number(n.doses_anterior),
      internacoes: Number(n.internacoes), idasAFamilia: Number(n.idas_a_familia),
      marcos: Number(n.marcos), evolucoesEducacionais: Number(n.evolucoes_educacionais),
      evolucoesDeSaude: Number(n.evolucoes_de_saude), memorias: Number(n.memorias),
      reunioes: Number(n.reunioes), lanches: Number(n.lanches), cestas: Number(n.cestas),
      acompanhamentosAprovados: Number(n.acompanhamentos_aprovados),
      acompanhamentosAbertos: Number(n.acompanhamentos_abertos),
      notasRestritas: Number(n.notas_restritas),
    };

    return {
      casa: { id: houseId, codigo: casa?.code ?? '', nome: casa?.name ?? '' },
      periodo: { de: inicio, ate: fim, dias },
      /* O período anterior sai NOMEADO, e não só o número dele: "19 doses,
         contra 12 de 01/09 a 07/09" é uma frase que se confere; "19, antes
         12" é uma frase em que ninguém sabe o que era "antes". */
      periodoAnterior: {
        de: this.diasAntes(inicio, dias), ate: this.diasAntes(inicio, 1),
      },
      numeros,
      alimentacao: this.agruparRefeicoes(dados.refeicoes),
      secoes: this.agruparLinhas(dados.linhas),
      ressalvas: this.ressalvas(numeros),
    };
  }

  /**
   * *"QUEM NÃO ESTÁ COMENDO O QUÊ"* — agrupado por criança, ordenado por nome.
   *
   * A ordem sai daqui e não do banco: a intercalação desta instalação põe
   * "Cátia" depois de "Cida", e a lista chegaria trocada à tela de quem lê. A
   * lição é da fase 117, e custou três execuções da suíte para aparecer.
   *
   * E não há número nenhum ao lado do nome. Três linhas embaixo de um nome são
   * três fatos; "3" ao lado de um nome é o começo de uma ficha.
   */
  private agruparRefeicoes(rows: any[]): RefeicaoDoPeriodo[] {
    const porCrianca = new Map<string, RefeicaoDoPeriodo>();
    for (const r of rows) {
      const chave = String(r.person_id);
      if (!porCrianca.has(chave)) {
        porCrianca.set(chave, { personId: chave, quem: r.quem, linhas: [] });
      }
      porCrianca.get(chave)!.linhas.push({
        quando: String(r.quando).slice(0, 10),
        refeicao: r.refeicao,
        opcao: ROTULO_DA_OPCAO[r.opcao] ?? r.opcao,
        nota: r.nota ?? null,
        por: r.por ?? null,
      });
    }
    return [...porCrianca.values()]
      .sort((a, b) => a.quem.localeCompare(b.quem, 'pt-BR'));
  }

  private agruparLinhas(rows: any[]) {
    return SECOES_DO_PERIODO.map((s) => {
      const linhas: LinhaDoPeriodo[] = rows
        .filter((r) => r.secao === s.cod)
        .map((r) => ({
          quando: String(r.quando).slice(0, 10),
          quem: r.quem ?? null,
          titulo: r.titulo ? (ROTULO_DA_CATEGORIA[r.titulo] ?? r.titulo) : null,
          texto: r.texto ?? '',
          autor: r.autor ?? null,
        }));
      return {
        cod: s.cod, label: s.label, ajuda: s.ajuda, linhas,
        /* Truncar em silêncio é mentir por omissão: a folha carregaria 150
           linhas com cara de "foi isto que aconteceu". */
        truncada: linhas.length >= TETO_POR_SECAO,
      };
    });
  }

  private ressalvas(n: NumerosDoPeriodo): string[] {
    const r: string[] = [];
    if (n.ocorrenciasRestritas > 0 || n.notasRestritas > 0) {
      r.push(
        `${n.ocorrenciasRestritas} ocorrência(s) de acesso restrito e ${n.notasRestritas} nota(s) `
        + 'de ATA restrita existem no período e NÃO estão escritas aqui — só contadas. '
        + 'Elas se leem na tela da ocorrência e na ATA, onde cada abertura fica registrada. '
        + 'Este relatório tem folha, e folha circula.');
    }
    if (n.atasAbertas > 0 || n.chamadasAbertas > 0 || n.passagensSemRecibo > 0) {
      r.push(
        'Há registro do período ainda em aberto — ATA, chamada ou passagem sem recibo. '
        + 'O que está aberto pode mudar depois que este relatório for tirado.');
    }
    r.push(
      'Ausência de registro não é ausência de trabalho. Um período sem linhas diz que '
      + 'ninguém escreveu — não diz que nada aconteceu.');
    r.push(
      'Nada aqui é somado por criança, por educador ou por turno, e nenhuma lista sai '
      + 'ordenada por quantidade: as crianças aparecem por nome, e os fatos por data.');
    return r;
  }

  /* ---------------- A folha, e a saída registrada ---------------- */

  /**
   * Ver não é exportar: monta a folha, não gera arquivo e não deixa rastro de
   * saída. Quem lê na tela já podia ler na tela — e a leitura em si já ficou
   * registrada por `daCasa`.
   */
  async folha(user: AuthenticatedUser, houseId: string, de?: string, ate?: string) {
    const d = await this.daCasa(user, houseId, de, ate);
    return folhaDoPeriodo(d, { nome: user.fullName, cargo: cargoNoDocumento(user.role) });
  }

  /** Exportar deixa rastro: quem, finalidade, período e hora (§18.4). */
  async exportar(user: AuthenticatedUser, body: {
    houseId?: string; de?: string; ate?: string; finalidade?: string;
  }) {
    const folha = await this.folha(user, body?.houseId ?? '', body?.de, body?.ate);
    return this.docs.exportar(user, folha, {
      entidade: 'periodo', entidadeId: body?.houseId, houseId: body?.houseId ?? null,
      finalidade: body?.finalidade ?? '',
    });
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
