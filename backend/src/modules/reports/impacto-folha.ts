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
      titulo: 'Síntese do período',
      itens: [
        `${total.acolhidos} acolhidos ao final do período, para ${total.capacidade} vagas.`,
        `${total.entradas} acolhimento(s) e ${total.saidas} desligamento(s) no período.`,
        `${total.marcos} conquista(s) registrada(s) pela equipe.`,
      ],
      procedencia: 'Registros das unidades no período indicado.',
    },
  ];

  if (porTipo.length) {
    secoes.push({
      titulo: 'Conquistas por tipo',
      tabela: {
        cabecalho: ['Conquista', 'Registros'],
        linhas: porTipo.map((t) => [t.label, String(t.n)]),
      },
    });
  } else {
    secoes.push({
      titulo: 'Conquistas por tipo',
      paragrafos: ['Não houve conquistas registradas no período. A ausência de registro '
        + 'não significa ausência de acontecimentos na vida dos acolhidos.'],
    });
  }

  if (casas.length > 1) {
    secoes.push({
      titulo: 'Por unidade',
      tabela: {
        cabecalho: ['Unidade', 'Acolhidos', 'Entradas', 'Saídas', 'Conquistas'],
        /* A ordem é a do código, e a folha diz isso logo abaixo da tabela. */
        linhas: [...casas].sort((a, b) => a.codigo.localeCompare(b.codigo)).map((c) => [
          `${c.codigo} · ${c.nome}`,
          `${c.acolhidos} de ${c.capacidade}`,
          String(c.entradas), String(c.saidas), String(c.marcos),
        ]),
      },
      procedencia: 'Unidades na ordem do cadastro. Os números de cada unidade devem ser lidos '
        + 'em relação à sua capacidade e ao perfil de atendimento, e não servem para '
        + 'comparação entre unidades.',
    });
  }

  if (marcos.length) {
    secoes.push({
      titulo: 'Conquistas registradas',
      itens: marcos.slice(0, 120).map((m) => [
        `${diaBR(m.quando)} · ${m.acolhido}${m.casa ? ` (${m.casa})` : ''}`,
        m.tipoRotulo,
        m.descricao,
        m.instituicao ?? null,
      ].filter(Boolean).join('. ')),
      procedencia: 'Em ordem cronológica, conforme registro da equipe de referência de cada acolhido.',
    });
  }

  return {
    titulo: 'Relatório do trabalho social',
    subtitulo: `${escopo ?? 'Fundação O Pão dos Pobres'} · de ${diaBR(periodo.de)} a ${diaBR(periodo.ate)}`,
    identificacao: [
      { rotulo: 'Abrangência', valor: escopo ?? `${total.casas} unidades de acolhimento` },
      { rotulo: 'Período', valor: `${diaBR(periodo.de)} a ${diaBR(periodo.ate)}` },
      { rotulo: 'Emitido em', valor: diaBR(new Date()) },
    ],
    secoes,
    geradoPor: autor.nome,
    cargo: autor.cargo,
    assinatura: true,
    ressalva: 'Este relatório reúne o que foi registrado pelas equipes no período. Parte '
      + 'importante do trabalho de acolhimento, como o manejo de crises, a manutenção de '
      + 'vínculos e o acompanhamento cotidiano, não se traduz em números. As unidades '
      + 'atendem perfis diferentes, definidos por determinação judicial, e não devem ser '
      + 'comparadas entre si.',
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
      titulo: 'Período de acolhimento',
      tabela: {
        cabecalho: ['Unidade', 'De', 'Até'],
        linhas: casas.map((c) => [
          c.casa, diaBR(c.de), c.ate ? diaBR(c.ate) : 'atual',
        ]),
      },
    },
  ];

  if (marcos.length) {
    secoes.push({
      titulo: 'Conquistas',
      itens: marcos.map((m) => [
        `${diaBR(m.quando)}, ${m.tipoRotulo}`,
        m.descricao,
        m.instituicao ?? null,
      ].filter(Boolean).join('. ')),
      procedencia: 'Em ordem cronológica, conforme registro da equipe de referência.',
    });
  } else {
    secoes.push({
      titulo: 'Conquistas',
      paragrafos: [
        'Não há conquistas registradas para este acolhido até a data de emissão. A ausência '
        + 'de registro não expressa avaliação sobre a criança ou o adolescente.',
      ],
    });
  }

  return {
    titulo: 'Trajetória no acolhimento',
    subtitulo: acolhido,
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
    ressalva: 'Este documento apresenta as conquistas registradas durante o acolhimento, com '
      + 'data e instituição. Não substitui o relatório técnico do caso, elaborado e aprovado '
      + 'pela equipe de referência, e não inclui informações de saúde, ocorrências ou '
      + 'conteúdo judicial.',
  };
}
