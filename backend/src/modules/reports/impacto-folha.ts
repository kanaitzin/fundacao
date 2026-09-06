/**
 * A FOLHA DO TRABALHO SOCIAL — o que a Fundação leva para fora.
 *
 * Sem import além do contrato: é lida pelo servidor e pelo protótipo.
 *
 * Este é o documento que sai da instituição — para o Conselho, para o Juízo,
 * para um edital, para um relatório anual. E é por isso que ele é o lugar
 * onde a recusa de comparar casas mais importa: uma tabela impressa, com as
 * casas em ordem de conquistas, vira um placar que anda sozinho por reuniões
 * onde ninguém vai estar para explicar o contexto de cada casa.
 *
 * Por isso a folha:
 *
 *  * lista as casas na ordem do CÓDIGO, e diz por escrito que essa é a ordem;
 *  * põe o número de acolhidos ao lado do número de conquistas, sempre — o
 *    número sozinho não significa nada;
 *  * carrega uma ressalva que não é enfeite jurídico: **ausência de registro
 *    não é ausência de trabalho**. Quem lê de fora não sabe disso, e vai
 *    concluir o contrário se ninguém escrever.
 */
import { Folha, SecaoDaFolha, AutorDaFolha, diaBR } from '../../kernel/documentos/folha';

export interface CasaNoImpacto {
  codigo: string; nome: string;
  acolhidos: number; capacidade: number;
  entradas: number; saidas: number; ocorrencias: number; marcos: number;
}

export interface MarcoNaFolha {
  acolhido: string; casa: string | null; tipoRotulo: string;
  quando: string; descricao: string; instituicao?: string | null;
}

export function folhaDoImpacto(
  periodo: { de: string; ate: string },
  total: { casas: number; acolhidos: number; capacidade: number;
           entradas: number; saidas: number; marcos: number },
  casas: CasaNoImpacto[],
  porTipo: Array<{ label: string; n: number }>,
  marcos: MarcoNaFolha[],
  autor: AutorDaFolha,
  /** Quando o relatório é de uma casa só, o nome dela; senão, a Fundação. */
  escopo?: string,
): Folha {
  const secoes: SecaoDaFolha[] = [
    {
      titulo: 'O período em números',
      itens: [
        `${total.acolhidos} acolhidos ao fim do período, em ${total.capacidade} vagas.`,
        `${total.entradas} entrada(s) e ${total.saidas} saída(s).`,
        `${total.marcos} conquista(s) registrada(s).`,
      ],
      procedencia: 'contagem sobre os registros do próprio sistema, no período indicado.',
    },
  ];

  if (porTipo.length) {
    secoes.push({
      titulo: 'O que aconteceu',
      tabela: {
        cabecalho: ['Conquista', 'Quantas'],
        linhas: porTipo.map((t) => [t.label, String(t.n)]),
      },
    });
  } else {
    secoes.push({
      titulo: 'O que aconteceu',
      paragrafos: ['Nenhuma conquista foi registrada neste período. '
        + 'Isso diz que ninguém escreveu — não diz que nada aconteceu.'],
    });
  }

  if (casas.length > 1) {
    secoes.push({
      titulo: 'Casa a casa',
      tabela: {
        cabecalho: ['Unidade', 'Acolhidos', 'Entradas', 'Saídas', 'Conquistas'],
        /* A ordem é a do código, e a folha diz isso logo abaixo da tabela. */
        linhas: [...casas].sort((a, b) => a.codigo.localeCompare(b.codigo)).map((c) => [
          `${c.codigo} — ${c.nome}`,
          `${c.acolhidos} de ${c.capacidade}`,
          String(c.entradas), String(c.saidas), String(c.marcos),
        ]),
      },
      procedencia: 'as unidades aparecem na ordem do cadastro, e não por resultado. '
        + 'Este quadro não compara casas: cada número se lê ao lado do número de '
        + 'acolhidos da unidade e do perfil de quem ela recebe.',
    });
  }

  if (marcos.length) {
    secoes.push({
      titulo: 'As conquistas, uma a uma',
      itens: marcos.slice(0, 120).map((m) => [
        `${diaBR(m.quando)} · ${m.acolhido}${m.casa ? ` (${m.casa})` : ''}`,
        m.tipoRotulo,
        m.descricao,
        m.instituicao ?? null,
      ].filter(Boolean).join(' — ')),
      procedencia: 'em ordem de data. Cada linha foi escrita por quem acompanha a criança.',
    });
  }

  return {
    titulo: `O trabalho social — ${escopo ?? 'Fundação O Pão dos Pobres'}`,
    subtitulo: `De ${diaBR(periodo.de)} a ${diaBR(periodo.ate)}`,
    identificacao: [
      { rotulo: 'Escopo', valor: escopo ?? `${total.casas} unidades de acolhimento` },
      { rotulo: 'Período', valor: `${diaBR(periodo.de)} a ${diaBR(periodo.ate)}` },
      { rotulo: 'Emitido em', valor: diaBR(new Date()) },
    ],
    secoes,
    geradoPor: autor.nome,
    cargo: autor.cargo,
    assinatura: true,
    ressalva: 'Este documento reúne o que está REGISTRADO no período. Ausência de '
      + 'registro não é ausência de trabalho: parte do que o acolhimento faz por uma '
      + 'criança — segurar uma crise, manter um vínculo, atravessar um ano difícil — não '
      + 'cabe em categoria e não aparece aqui. E as unidades não são comparáveis entre si: '
      + 'elas recebem perfis diferentes, por determinação judicial.',
  };
}

/**
 * A TRAJETÓRIA DE UMA CRIANÇA, EM FOLHA.
 *
 * É o documento que o Juízo mais pergunta e que o sistema não tinha: o que
 * esta criança conquistou no tempo em que esteve acolhida.
 *
 * **Ele não substitui o relatório técnico.** Aquele tem avaliação, e é escrito
 * e aprovado por quem acompanha o caso. Este é a linha dos fatos bons — data,
 * o que foi, onde. A ressalva diz isso, porque quem recebe uma folha timbrada
 * numa audiência não tem obrigação de saber a diferença.
 *
 * E ele diz, quando não há nada: **a folha vazia não é sobre a criança.** Uma
 * trajetória sem conquistas registradas fala de quem não escreveu, e mostrar
 * isso a um juiz sem explicar seria transformar a falha do registro em
 * avaliação da criança.
 */
export function folhaDaTrajetoria(
  acolhido: string,
  desde: string,
  casas: Array<{ casa: string; de: string; ate: string | null }>,
  marcos: Array<{ tipoRotulo: string; quando: string; descricao: string;
                  instituicao?: string | null }>,
  autor: AutorDaFolha,
): Folha {
  const secoes: SecaoDaFolha[] = [
    {
      titulo: 'O tempo no acolhimento',
      tabela: {
        cabecalho: ['Unidade', 'De', 'Até'],
        linhas: casas.map((c) => [
          c.casa, diaBR(c.de), c.ate ? diaBR(c.ate) : 'até hoje',
        ]),
      },
    },
  ];

  if (marcos.length) {
    secoes.push({
      titulo: 'O que ela conquistou',
      itens: marcos.map((m) => [
        `${diaBR(m.quando)} — ${m.tipoRotulo}`,
        m.descricao,
        m.instituicao ?? null,
      ].filter(Boolean).join('. ')),
      procedencia: 'em ordem de data. Cada linha foi escrita por quem acompanha a criança, '
        + 'com a data em que aconteceu.',
    });
  } else {
    secoes.push({
      titulo: 'O que ela conquistou',
      paragrafos: [
        'Nenhuma conquista foi registrada no sistema para esta criança. Isso diz que '
        + 'ninguém escreveu — não diz que nada aconteceu, e não é uma avaliação dela.',
      ],
    });
  }

  return {
    titulo: `Trajetória no acolhimento — ${acolhido}`,
    identificacao: [
      { rotulo: 'Acolhido', valor: acolhido },
      { rotulo: 'Acolhido desde', valor: diaBR(desde) },
      { rotulo: 'Conquistas registradas', valor: String(marcos.length) },
      { rotulo: 'Emitida em', valor: diaBR(new Date()) },
    ],
    secoes,
    geradoPor: autor.nome,
    cargo: autor.cargo,
    assinatura: true,
    ressalva: 'Esta folha reúne o que foi CONQUISTADO, com data e instituição. Ela não é '
      + 'o relatório técnico do caso — aquele tem a avaliação da equipe, e é escrito e '
      + 'aprovado por quem acompanha esta criança. Saúde, ocorrências e conteúdo judicial '
      + 'não entram aqui.',
  };
}
