import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { VOCABULARIO_DA_AUDITORIA } from '../../kernel/audit/vocabulario';
import { SETORES } from './staff.service';
import { hojeNaInstituicao } from '../../kernel/common/tempo';

/**
 * ============================================================================
 * O TRABALHO DE QUEM TRABALHA NA CASA — e o que este arquivo NÃO faz.
 *
 * Pedido da Fundação em 15/09/2026: *"quero que seja possível ver todo o
 * trabalho e ações de cada educador e setor para a visão do coordenador."*
 *
 * Isto desfaz uma recusa minha, e a recusa está escrita ao lado, no
 * `auditoria.service.ts`: *"'tudo o que a Joana fez ontem' é vigilância — mede
 * a pessoa"*, e logo depois, *"se a Fundação quiser a busca por pessoa, isso é
 * decisão dela e vira OUTRO CAMINHO, com finalidade escrita e registro da
 * própria consulta."* A decisão veio; o outro caminho é este, com as três
 * condições cumpridas — e a tela da auditoria da criança não ganhou filtro
 * nenhum.
 *
 * O QUE ELE NÃO FAZ, E ISSO É A METADE DO DESENHO:
 *
 *  * **não conta.** Nenhum total, nenhuma média, nenhum "12 linhas de ATA".
 *    A pergunta que ele responde é *"o que a Joana fez na terça"*; a que ele
 *    não responde é *"quem fez mais"*. Um número sobrevive ao contexto: daqui
 *    a seis meses o total continua na tela, e a noite em que ela ficou com uma
 *    criança no colo, não (§7, §8.9.1);
 *  * **não põe duas pessoas lado a lado.** A busca por SETOR devolve o
 *    trabalho do setor em ordem de acontecimento, com o nome em cada linha —
 *    e não uma lista de pessoas com o que cada uma fez embaixo, que é a mesma
 *    comparação com outro desenho;
 *  * **não alcança o que não é trabalho na casa.** Login, logout e troca de
 *    senha não têm `house_id` e ficam de fora pela própria consulta. Uma tela
 *    de supervisão que mostrasse horário de entrada seria controle de ponto, e
 *    ninguém pediu isso.
 *
 * QUEM LÊ: equipe técnica, Líder Diurno, coordenação — e, desde a fase 119, o
 * **Gestor Geral**, nas oito casas.
 *
 * ---
 *
 * FASE 119 — A FUNDAÇÃO DECIDIU O QUE EU TINHA DEIXADO DE FORA.
 *
 * A fase 117 excluiu o Gestor Geral e escreveu a ausência como decisão minha,
 * sujeita à dele: *"ele não foi nomeado, e é dele a visão das oito casas, que
 * é onde a comparação entre equipes fica mais fácil de fazer."* A resposta
 * veio em 15/09: *"o gestor vê tudo o que ele quiser, em uma visão apenas
 * contagens e métricas, na visão total ele vê tudo, afinal ele é o chefe de
 * todas as casas."*
 *
 * Então ele entra nas duas: na leitura do trabalho, nas oito casas, e numa
 * segunda visão que **CONTA** — por casa, por setor, por pessoa e por tipo de
 * ação. É a primeira contagem por pessoa que este sistema faz, e ela existe
 * porque quem responde pela instituição pediu.
 *
 * **O que não mudou, e não é teimosia:** criança não entra em contagem
 * nenhuma. A regra 3 protege quem é cuidado, e não foi o que a Fundação
 * revisou — as métricas contam ATOS DE TRABALHO, nunca pessoas acolhidas,
 * nunca comportamento. E a ordem da tela é por nome, nunca por total: quem
 * quiser classificar classifica na cabeça, e vai saber que está fazendo isso.
 *
 * **E o aviso continua na tela, porque é a razão de eu ter recusado antes:**
 * um total ao lado de um nome atravessa meses sem o contexto que o explicava,
 * e o que se conta aqui é o que foi REGISTRADO — que é diferente do que foi
 * feito, e a diferença costuma ser maior justamente na noite mais difícil.
 * ============================================================================
 */

/** A leitura do trabalho: os três de 15/09, mais o Gestor Geral (fase 119). */
export const LEEM_O_TRABALHO = ['equipe_tecnica', 'lider_diurno', 'coordenador', 'gestor_geral'];

/**
 * A CONTAGEM é só do Gestor Geral.
 *
 * Foi ele quem a Fundação nomeou para a visão de contagens, e é ele quem
 * responde pelas oito casas. Estender à coordenação na própria casa é uma
 * linha aqui e uma na migração 1270 — e é uma decisão, não um ajuste.
 */
export const LEEM_AS_METRICAS = ['gestor_geral'];

/** Janela máxima: três meses. Mais que isso não é supervisão, é dossiê. */
export const JANELA_MAXIMA_DIAS = 92;

@Injectable()
export class TrabalhoService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /** Os setores que se pode abrir — os mesmos do cadastro de equipe. */
  vocabulario(user: AuthenticatedUser) {
    return {
      /* A tela precisa saber se a aba de contagens existe para quem abriu —
         desenhar um botão que responde 403 ensina que o sistema é caprichoso. */
      temMetricas: LEEM_AS_METRICAS.includes(user.role),
      setores: SETORES.map((s) => ({ cod: s.code, label: s.label, descricao: s.descricao })),
      janelaMaximaDias: JANELA_MAXIMA_DIAS,
      aviso: 'Esta leitura não conta nada — ela mostra o que foi feito, em ordem, com data '
        + 'e hora.',
      sobreAFinalidade: 'Escreva por que está abrindo. A frase fica no registro desta consulta, '
        + 'com o seu nome — quem consulta também é consultável.',
    };
  }

  /**
   * O trabalho de UMA pessoa, ou de UM setor, numa janela.
   *
   * As travas moram na `app_trabalho_da_equipe` (migração 1260) e não aqui:
   * cargo, finalidade, janela e recorte por casa. Este método traduz cada
   * recusa do banco numa frase de gente — e é só isso que ele faz a mais.
   */
  async ver(user: AuthenticatedUser, input: {
    pessoaId?: string | null; setor?: string | null;
    de?: string; ate?: string; finalidade?: string;
  }) {
    if (!LEEM_O_TRABALHO.includes(user.role)) {
      throw new ForbiddenException(
        'O trabalho da equipe é lido pela equipe técnica, pelo Líder Diurno, pela coordenação e '
        + 'pelo Gestor Geral, nas casas que alcançam.');
    }
    const pessoaId = input.pessoaId || null;
    const setor = input.setor || null;
    if (!pessoaId === !setor) {
      throw new BadRequestException(
        'Escolha uma pessoa da equipe OU um setor — a busca é por um dos dois, nunca pelos dois.');
    }
    if (setor && !SETORES.some((s) => s.code === setor)) {
      throw new BadRequestException('Setor desconhecido.');
    }
    const finalidade = (input.finalidade ?? '').trim();
    if (finalidade.length < 10) {
      throw new BadRequestException(
        'Escreva a finalidade desta consulta — por exemplo, "apuração do episódio de 12/09" ou '
        + '"preparação da avaliação semestral". Ela fica registrada com o seu nome.');
    }
    /* O dia vem do relógio da instituição, e é lido na hora: guardar o "hoje"
       numa constante é guardar uma resposta que envelhece sozinha (§6, 13). */
    const ate = input.ate || hojeNaInstituicao();
    const de = input.de || this.diasAntes(ate, 13);

    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM app_trabalho_da_equipe($1,$2,$3::date,$4::date,$5)`,
        [pessoaId, setor, de, ate, finalidade]);
      return rows;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('trabalho_fora_do_alcance')) {
        throw new ForbiddenException(
          'O trabalho da equipe é lido pela equipe técnica, pelo Líder Diurno, pela coordenação '
          + 'e pelo Gestor Geral.');
      }
      if (m.includes('finalidade_obrigatoria')) {
        throw new BadRequestException('Escreva a finalidade desta consulta — ela fica registrada.');
      }
      if (m.includes('janela_invalida')) {
        throw new BadRequestException(
          `O período vai até ${JANELA_MAXIMA_DIAS} dias, e a data final não pode vir antes da inicial. `
          + 'Mais que três meses não é supervisão, é dossiê.');
      }
      if (m.includes('pessoa_ou_setor')) {
        throw new BadRequestException('Escolha uma pessoa da equipe OU um setor.');
      }
      throw e;
    });

    return {
      de,
      ate,
      /* `cortado` em vez de "mostrando 300 de N": o N seria uma contagem, e
         contar é justamente o que esta tela não faz. A frase diz o que a
         pessoa precisa saber — que há mais, e que estreitar o período mostra. */
      cortado: linhas.length === 300,
      linhas: linhas.map((r: any) => ({
        id: r.id,
        quando: r.quando,
        /* A frase em português vem do vocabulário do kernel, o mesmo da
           auditoria da criança (fase 115). Ação sem frase aparece com o código
           e não some: some seria pior. */
        acao: VOCABULARIO_DA_AUDITORIA[r.acao] ?? r.acao,
        codigo: r.acao,
        quem: r.quem,
        cargo: SETORES.find((s) => s.code === r.quem_cargo)?.label ?? r.quem_cargo,
        casa: r.casa,
        entidade: r.entidade,
        entidadeId: r.entidade_id,
        /* A finalidade que a PESSOA declarou quando fez aquilo — é o que
           explica metade das linhas sensíveis, e é o que falta em toda planilha
           de controle que eu já vi. */
        finalidadeDeclarada: r.finalidade,
      })),
      aviso: linhas.length
        ? 'O que aparece aqui é o que foi feito, em ordem. Nada está somado: a pergunta é '
          + '"o que foi feito", e não "quem fez mais".'
        : 'Nenhum registro no período, nas casas que você alcança. Isso não quer dizer que '
          + 'ninguém trabalhou — quer dizer que nada deste período chega até aqui.',
    };
  }

  /**
   * AS CONTAGENS — a primeira vez que este sistema soma por pessoa.
   *
   * Decisão da Fundação em 15/09: *"o gestor vê tudo o que ele quiser, em uma
   * visão apenas contagens e métricas."* Quatro recortes, numa consulta só e
   * sobre o MESMO período: casa, setor, pessoa e tipo de ação. (Duas consultas
   * em horários diferentes dariam números que não fecham, e quem lesse ia
   * procurar o erro na casa.)
   *
   * Três coisas ficam de fora por decisão, e nenhuma delas foi o que a
   * Fundação revisou:
   *
   *  * **criança não entra em contagem nenhuma** — a regra 3 é sobre proteger
   *    quem é cuidado. O que se conta aqui são ATOS DE TRABALHO;
   *  * **a ordem é por nome, nunca por total.** A ordem de uma tela é uma
   *    afirmação: a lista ordenada por número JÁ É a classificação, e ela
   *    apareceria sem ninguém ter decidido fazê-la;
   *  * **nada de média, projeção ou meta.** Contagem é fato; média é juízo
   *    disfarçado de fato, e a conversa que ela abre é sobre o número.
   */
  async metricas(user: AuthenticatedUser, input: {
    de?: string; ate?: string; finalidade?: string;
  }) {
    if (!LEEM_AS_METRICAS.includes(user.role)) {
      throw new ForbiddenException(
        'A visão de contagens é do Gestor Geral, que responde pelas oito casas.');
    }
    const finalidade = (input.finalidade ?? '').trim();
    if (finalidade.length < 10) {
      throw new BadRequestException(
        'Escreva a finalidade desta consulta — ela fica registrada com o seu nome.');
    }
    const ate = input.ate || hojeNaInstituicao();
    const de = input.de || this.diasAntes(ate, 29);

    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM app_metricas_do_trabalho($1::date,$2::date,$3)`, [de, ate, finalidade]);
      return rows;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('metricas_fora_do_alcance')) {
        throw new ForbiddenException('A visão de contagens é do Gestor Geral.');
      }
      if (m.includes('finalidade_obrigatoria')) {
        throw new BadRequestException('Escreva a finalidade desta consulta — ela fica registrada.');
      }
      if (m.includes('janela_invalida')) {
        throw new BadRequestException(
          'O período vai até um ano, e a data final não pode vir antes da inicial.');
      }
      throw e;
    });

    const doRecorte = (r: string) => linhas.filter((l: any) => l.recorte === r);

    /**
     * A ORDEM É DO QUE SE LÊ, E EM PORTUGUÊS — e isto foi um defeito de
     * verdade, achado pela suíte inteira e não pela suíte sozinha.
     *
     * O banco ordenava, e a suíte reprovou de forma INTERMITENTE: sozinha ela
     * passava, e no conjunto — onde entram as contas de todas as casas — caía.
     * O motivo é que o PostgreSQL punha **"Cátia" depois de "Cida"**, e o
     * português não: numa lista de Cátia, Lúcia, Mário, Nélio e Otávio, "ordem
     * alfabética" que separa os acentuados é ordem que ninguém reconhece.
     *
     * E havia um segundo, pior, que o primeiro escondia: o SQL ordenava os
     * SETORES pelo CÓDIGO (`educador`, `lider_diurno`), e a tela mostra o
     * RÓTULO ("Educador social", "Líder Diurno"). A lista saía fora de ordem e
     * nada acusava — porque o servidor tinha ordenado, só que outra coisa.
     *
     * Numa tela cuja promessa inteira é *"a ordem é por nome, nunca por
     * total"*, ordem que o leitor não reconhece é pior do que nenhuma: ele
     * procura o critério, e o único critério visível na linha é o número.
     */
    const emPortugues = <T extends Record<string, any>>(xs: T[], campo: keyof T) =>
      xs.slice().sort((a, b) => String(a[campo]).localeCompare(String(b[campo]), 'pt-BR'));

    return {
      de,
      ate,
      porCasa: emPortugues(doRecorte('casa').map((l: any) => ({
        casa: l.rotulo, quantos: Number(l.quantos),
      })), 'casa'),
      porSetor: emPortugues(doRecorte('setor').map((l: any) => ({
        setor: SETORES.find((s) => s.code === l.chave)?.label ?? l.rotulo,
        quantos: Number(l.quantos),
      })), 'setor'),
      porPessoa: emPortugues(doRecorte('pessoa').map((l: any) => ({
        quem: l.rotulo,
        cargo: SETORES.find((s) => s.code === l.extra)?.label ?? l.extra,
        quantos: Number(l.quantos),
      })), 'quem'),
      porAcao: emPortugues(doRecorte('acao').map((l: any) => ({
        /* A frase em português, do mesmo vocabulário da auditoria (fase 115).
           Um relatório de gestão escrito em `medication.confirm` é um relatório
           que ninguém lê duas vezes. */
        acao: VOCABULARIO_DA_AUDITORIA[l.chave] ?? l.rotulo,
        codigo: l.chave,
        quantos: Number(l.quantos),
      })), 'acao'),
      /*
       * O AVISO VAI JUNTO COM O NÚMERO, e não numa nota de rodapé.
       *
       * É a razão de eu ter recusado esta tela antes da Fundação decidir, e
       * ela não deixou de valer por a decisão ter sido tomada: o que se conta
       * aqui é o que foi REGISTRADO, que é diferente do que foi feito — e a
       * diferença costuma ser maior justamente na noite mais difícil.
       */
      aviso: 'Estes números contam REGISTROS, não trabalho. Quem passou a noite com uma '
        + 'criança no colo registrou menos, e fez mais. A lista sai por nome, nunca por '
        + 'total: ordenar por número é uma classificação, e ela precisa ser decisão de '
        + 'quem lê, não desenho da tela.',
      sobreCriancas: 'Nenhuma contagem aqui é por criança acolhida. O que se conta são atos '
        + 'de trabalho — chamadas abertas, doses confirmadas, linhas de ATA.',
    };
  }

  /** Data ISO `dias` antes de `ate`, sem depender do fuso do servidor. */
  private diasAntes(ate: string, dias: number) {
    const d = new Date(`${ate}T12:00:00-03:00`);
    d.setUTCDate(d.getUTCDate() - dias);
    return d.toISOString().slice(0, 10);
  }
}
