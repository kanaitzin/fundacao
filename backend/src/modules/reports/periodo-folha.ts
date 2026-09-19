/**
 * A FOLHA DO PERÍODO — *"uma ata geral de toda semana"*, em papel.
 *
 * Sem import além do contrato da folha: é lida pelo servidor, que a transforma
 * em .docx, e pelo protótipo, que desenha a MESMA folha na pré-visualização.
 * Quem confere na tela confere o documento que vai sair.
 *
 * TRÊS DECISÕES DE ORDEM, E NENHUMA É ESTÉTICA:
 *
 * 1. **A parte boa vem antes.** *"As observações que os educadores botam têm
 *    que ser ponderadas para ser trazido coisas boas e negativas."* Um resumo
 *    que abre pela lista de ocorrências ensina a equipe a ler a própria semana
 *    como uma lista de falhas — e a criança, que é o assunto, some dele. As
 *    conquistas, as memórias e a evolução escolar abrem o documento;
 *
 * 2. **os números vêm com o par que os explica.** "19 doses" não diz nada;
 *    "19 doses, contra 12 na semana anterior" é a frase que ele pediu quando
 *    falou em *"aumento de medicamentos"*. O mesmo vale para acolhidos e
 *    capacidade, e para ATA fechada e ATA com pendência;
 *
 * 3. **o que não está aqui é dito por extenso.** A ocorrência de acesso
 *    restrito e a nota de ATA restrita entram como contagem, com a frase que
 *    manda o leitor à tela certa. Uma folha circula; a tela da ocorrência
 *    registra cada abertura.
 */
import { Folha, SecaoDaFolha, AutorDaFolha, diaBR } from '../../kernel/documentos/folha';

/** As seções de texto, na ordem em que a casa lê — a parte boa primeiro. */
export const SECOES_DO_PERIODO: { cod: string; label: string; ajuda: string }[] = [
  { cod: 'conquista', label: 'Conquistas',
    ajuda: 'Marcos de vida registrados: aprovação escolar, curso, documento conquistado.' },
  { cod: 'memoria', label: 'Memórias',
    ajuda: 'O que a casa guardou da vida dela no período.' },
  { cod: 'educacao', label: 'Evolução escolar',
    ajuda: 'O que foi escrito sobre a escola e o aprendizado, em texto livre.' },
  { cod: 'observacao', label: 'Observações do turno',
    ajuda: 'As notas que a equipe escreveu na ATA. A nota restrita não entra aqui.' },
  { cod: 'episodio', label: 'Episódios da ATA',
    ajuda: 'O fato do turno, com a criança nomeada. A classificação descreve o fato.' },
  { cod: 'ocorrencia', label: 'Ocorrências',
    ajuda: 'As ocorrências do período. As de acesso restrito aparecem só como contagem.' },
];

export interface RefeicaoDoPeriodo {
  personId: string;
  quem: string;
  linhas: {
    quando: string; refeicao: string; opcao: string;
    nota: string | null; por: string | null;
  }[];
}

export interface LinhaDoPeriodo {
  quando: string;
  quem: string | null;
  titulo: string | null;
  texto: string;
  autor: string | null;
}

export interface SecaoDoPeriodo {
  cod: string; label: string; ajuda: string;
  linhas: LinhaDoPeriodo[];
  truncada: boolean;
}

export interface NumerosDoPeriodo {
  acolhidos: number; capacidade: number; entradas: number; saidas: number;
  chamadas: number; chamadasConfirmadas: number; chamadasAbertas: number;
  refeicoesConferidas: number; refeicoesComExcecao: number; criancasComExcecao: number;
  ocorrencias: number; ocorrenciasRestritas: number; desorganizacao: number;
  atas: number; atasFechadas: number; atasComPendencia: number; atasAbertas: number;
  passagens: number; passagensSemRecibo: number;
  doses: number; dosesConfirmadas: number; dosesSemResposta: number; dosesAnterior: number;
  internacoes: number; idasAFamilia: number;
  marcos: number; evolucoesEducacionais: number; evolucoesDeSaude: number; memorias: number;
  reunioes: number; lanches: number; cestas: number;
  acompanhamentosAprovados: number; acompanhamentosAbertos: number;
  notasRestritas: number;
}

export interface PeriodoDaCasa {
  casa: { id: string; codigo: string; nome: string };
  periodo: { de: string; ate: string; dias: number };
  periodoAnterior: { de: string; ate: string };
  numeros: NumerosDoPeriodo;
  alimentacao: RefeicaoDoPeriodo[];
  secoes: SecaoDoPeriodo[];
  ressalvas: string[];
}

export function folhaDoPeriodo(d: PeriodoDaCasa, autor: AutorDaFolha): Folha {
  const n = d.numeros;
  const secoes: SecaoDaFolha[] = [];

  /* ---- 1. O que a casa viveu, em texto — a parte boa primeiro ---- */
  for (const s of d.secoes) {
    if (!s.linhas.length) continue;
    secoes.push({
      titulo: s.label,
      tabela: {
        cabecalho: ['Quando', 'Quem', 'O que foi escrito'],
        linhas: s.linhas.map((l) => [
          diaBR(l.quando),
          l.quem ?? '—',
          [l.titulo ? `${l.titulo}: ` : '', l.texto,
           l.autor ? ` (${l.autor})` : ''].join(''),
        ]),
      },
      procedencia: s.truncada
        ? `${s.ajuda} ESTA SEÇÃO FOI CORTADA no limite de ${s.linhas.length} linhas — `
          + 'há mais no período. Reduza o intervalo para ver o resto.'
        : s.ajuda,
    });
  }

  /* ---- 2. Quem não está comendo o quê ---- */
  if (d.alimentacao.length) {
    const linhas: string[][] = [];
    for (const c of d.alimentacao) {
      for (const l of c.linhas) {
        linhas.push([
          c.quem, diaBR(l.quando), l.refeicao, l.opcao,
          [l.nota ?? '', l.por ? ` (${l.por})` : ''].join('').trim() || '—',
        ]);
      }
    }
    secoes.push({
      titulo: 'Refeições com exceção registrada',
      tabela: {
        cabecalho: ['Quem', 'Quando', 'Refeição', 'O que foi marcado', 'O que foi escrito'],
        linhas,
      },
      procedencia: 'as crianças aparecem em ordem de NOME e os fatos em ordem de data. '
        + 'Nada aqui é somado: nem recusas, nem percentual, nem "quem mais recusou". '
        + 'Uma criança que recusa o jantar três dias seguidos é um sinal de saúde, e é '
        + 'para a conversa com ela que esta lista existe.',
    });
  }

  /* ---- 3. Os números ---- */
  secoes.push({
    titulo: 'O período em números',
    tabela: {
      cabecalho: ['O quê', 'No período'],
      linhas: [
        ['Acolhidos ao fim do período', `${n.acolhidos} de ${n.capacidade} vagas`],
        ['Entradas e saídas', `${n.entradas} entrada(s), ${n.saidas} saída(s)`],
        ['Chamadas', `${n.chamadas}, sendo ${n.chamadasConfirmadas} confirmada(s)`
          + (n.chamadasAbertas ? ` e ${n.chamadasAbertas} ainda aberta(s)` : '')],
        ['Refeições conferidas', `${n.refeicoesConferidas}, com ${n.refeicoesComExcecao} exceção(ões) `
          + `registrada(s), de ${n.criancasComExcecao} criança(s)`],
        ['Ocorrências', `${n.ocorrencias}`
          + (n.ocorrenciasRestritas ? `, sendo ${n.ocorrenciasRestritas} de acesso restrito` : '')],
        ['Desorganização com repercussão relevante', `${n.desorganizacao}`],
        ['ATAs', `${n.atas}: ${n.atasFechadas} fechada(s), ${n.atasComPendencia} com pendência, `
          + `${n.atasAbertas} ainda aberta(s)`],
        ['Passagens de plantão', `${n.passagens}`
          + (n.passagensSemRecibo ? `, sendo ${n.passagensSemRecibo} sem recibo de quem recebeu` : '')],
        /* A frase que ele pediu quando falou em "aumento de medicamentos".
           Os dois números lado a lado, e a conta é do leitor — que é quem
           sabe o que mudou na casa naquelas semanas. */
        ['Doses previstas', `${n.doses} neste período, contra ${n.dosesAnterior} em `
          + `${diaBR(d.periodoAnterior.de)} a ${diaBR(d.periodoAnterior.ate)}`],
        ['Doses confirmadas', `${n.dosesConfirmadas}`
          + (n.dosesSemResposta ? `, com ${n.dosesSemResposta} sem resposta` : '')],
        ['Internações hospitalares', `${n.internacoes}`],
        ['Idas para convivência familiar', `${n.idasAFamilia}`],
        ['Conquistas registradas', `${n.marcos}`],
        ['Evoluções escolares escritas', `${n.evolucoesEducacionais}`],
        ['Evoluções de saúde escritas', `${n.evolucoesDeSaude}`],
        ['Memórias guardadas', `${n.memorias}`],
        ['Reuniões de equipe', `${n.reunioes}`],
        ['Lanches e cestas pedidos à cozinha', `${n.lanches} lanche(s), ${n.cestas} cesta(s)`],
        ['Acompanhamentos', `${n.acompanhamentosAprovados} aprovado(s), `
          + `${n.acompanhamentosAbertos} em aberto`],
      ],
    },
    procedencia: 'contagem sobre os registros do próprio sistema, no período indicado. '
      + 'Nenhum número é média, meta ou projeção, e nenhum é somado por pessoa.',
  });

  return {
    paisagem: true,
    titulo: `Período da casa — ${d.casa.codigo}`,
    subtitulo: `${d.casa.nome} · ${diaBR(d.periodo.de)} a ${diaBR(d.periodo.ate)} `
      + `(${d.periodo.dias} dia${d.periodo.dias === 1 ? '' : 's'})`,
    identificacao: [
      { rotulo: 'Unidade', valor: `${d.casa.codigo} — ${d.casa.nome}` },
      { rotulo: 'Período', valor: `${diaBR(d.periodo.de)} a ${diaBR(d.periodo.ate)}` },
      { rotulo: 'Período anterior, de igual duração',
        valor: `${diaBR(d.periodoAnterior.de)} a ${diaBR(d.periodoAnterior.ate)}` },
    ],
    secoes,
    geradoPor: autor.nome,
    cargo: autor.cargo,
    /* A ressalva não é enfeite jurídico: é a frase que impede a leitura
       errada mais provável desta folha — a de que pouca linha é pouco
       trabalho. */
    ressalva: d.ressalvas.join(' '),
  };
}
