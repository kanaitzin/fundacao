/**
 * A FOLHA DE SAÚDE DO ACOLHIDO — o que a Enfermagem leva para a consulta.
 *
 * Sem import além do contrato: é lida pelo servidor e pelo protótipo.
 *
 * É a linha única virada folha: atendimentos com data e retorno, evoluções com
 * quem acompanhou, e o que foi administrado. Sem diagnóstico no título e sem
 * juízo em lugar nenhum — o documento reúne o que está registrado, não conclui
 * e não substitui o parecer de quem atende.
 */
import { Folha, SecaoDaFolha, AutorDaFolha, diaBR, hhmmBR } from '../../kernel/documentos/folha';

export interface DadosDeSaude {
  atendimentos: Array<{
    quando: string; tipoRotulo: string; especialidade?: string | null; local?: string | null;
    retornoEm?: string | null; retornoVencido?: boolean; statusRotulo: string;
  }>;
  evolucoes: Array<{
    quando: string; tipoRotulo: string; acompanhante?: string | null;
    estadoRetorno?: string | null; complementoEnfermagem?: string | null;
  }>;
  administracoes: Array<{
    previsto: string; medicamento: string; dose: string; estadoRotulo: string; por?: string | null;
  }>;
  internacoes?: Array<{
    hospital: string; desde: string; ate?: string | null;
    status: string; desfecho?: string | null;
  }>;
  medicacaoNoHospital?: Array<{
    quando: string; medicamento: string; dose?: string | null;
    via?: string | null; origem: string;
  }>;
  pendencias: {
    retornosVencidos: number; retornosMarcados: number;
    internacaoEmAndamento: boolean; evolucoesAguardandoTriagem: number;
  };
}

export function folhaDeSaude(
  pessoa: { nome: string; idade?: number | null },
  h: DadosDeSaude,
  unidade: string,
  autor: AutorDaFolha,
): Folha {
  const secoes: SecaoDaFolha[] = [];

  const pend: string[] = [];
  if (h.pendencias.internacaoEmAndamento) pend.push('Internação em andamento.');
  if (h.pendencias.retornosVencidos) {
    pend.push(`${h.pendencias.retornosVencidos} retorno(s) com a data já passada.`);
  }
  if (h.pendencias.retornosMarcados) {
    pend.push(`${h.pendencias.retornosMarcados} retorno(s) marcado(s).`);
  }
  if (h.pendencias.evolucoesAguardandoTriagem) {
    pend.push(`${h.pendencias.evolucoesAguardandoTriagem} evolução(ões) aguardando a `
      + 'conferência da Enfermagem.');
  }
  secoes.push({
    titulo: 'O que está esperando alguém',
    itens: pend.length ? pend : ['Nada pendente registrado nesta data.'],
    procedencia: 'contagem feita sobre os registros, sem ordenação por gravidade.',
  });

  secoes.push({
    titulo: 'Atendimentos',
    paragrafos: h.atendimentos.length ? [] : ['Nenhum atendimento registrado.'],
    tabela: h.atendimentos.length ? {
      cabecalho: ['Data', 'Atendimento', 'Serviço / especialidade', 'Situação'],
      linhas: h.atendimentos.map((a) => [
        diaBR(a.quando), a.tipoRotulo,
        [a.especialidade, a.local].filter(Boolean).join(' · ') || '—',
        /* O retorno com a data já passada é marcado como tal: sem essa marca,
         * uma data antiga se lê como história e não como pendência. */
        a.retornoVencido && a.retornoEm
          ? `Retorno em ${diaBR(a.retornoEm)} — data já passada`
          : a.retornoEm ? `Retorno em ${diaBR(a.retornoEm)}` : a.statusRotulo,
      ]),
    } : undefined,
    procedencia: 'atendimentos registrados no módulo de Enfermagem.',
  });

  if (h.evolucoes.length) {
    secoes.push({
      titulo: 'Evoluções de quem acompanhou',
      itens: h.evolucoes.map((e) => [
        `${diaBR(e.quando)} — ${e.tipoRotulo}`,
        e.acompanhante ? `acompanhou: ${e.acompanhante}` : null,
        e.estadoRetorno ? `estado no retorno: ${e.estadoRetorno}` : null,
        e.complementoEnfermagem ? `complemento da Enfermagem: ${e.complementoEnfermagem}` : null,
      ].filter(Boolean).join(' · ')),
      procedencia: 'evolução assinada por quem acompanhou, com o complemento da Enfermagem.',
    });
  }

  /*
   * O PERÍODO NO HOSPITAL ENTRA NA FOLHA.
   *
   * Ela é o documento que a Enfermagem leva para a consulta. Uma folha que
   * mostrasse três semanas sem nenhum registro, sem dizer que a criança
   * esteve internada, faria o médico concluir que ninguém acompanhou.
   *
   * O que entra é o PERÍODO e a medicação: hospital, datas, desfecho. O
   * diário do dia a dia não entra — ele é do sistema, não do papel.
   */
  if ((h.internacoes ?? []).length) {
    secoes.push({
      titulo: 'Internações',
      tabela: {
        cabecalho: ['Período', 'Hospital', 'Situação'],
        linhas: h.internacoes!.map((i) => [
          `${diaBR(i.desde)}${i.ate ? ` a ${diaBR(i.ate)}` : ' — em andamento'}`,
          i.hospital,
          i.status === 'em_andamento' ? 'Internada agora'
            : i.desfecho === 'alta' ? 'Alta'
            : i.desfecho === 'obito' ? 'Óbito' : 'Transferência hospitalar',
        ]),
      },
      procedencia: 'registro de internação aberto e encerrado pela equipe técnica ou '
        + 'pela coordenação.',
    });
  }

  if ((h.medicacaoNoHospital ?? []).length) {
    secoes.push({
      titulo: 'Medicação administrada durante a internação',
      tabela: {
        cabecalho: ['Data e hora', 'Medicamento', 'Via', 'Quem administrou'],
        linhas: h.medicacaoNoHospital!.slice(0, 40).map((m) => [
          `${diaBR(m.quando)} ${hhmmBR(m.quando)}`,
          [m.medicamento, m.dose].filter(Boolean).join(' '),
          m.via ?? '—',
          /* A origem vai na COLUNA de quem administrou, e não numa nota de
           * rodapé: é a informação que muda a leitura da linha inteira. */
          m.origem,
        ]),
      },
      procedencia: 'registrada por quem acompanhou a internação; quem administrou foi o '
        + 'hospital, e não a casa.',
    });
  }

  if (h.administracoes.length) {
    secoes.push({
      titulo: 'Medicação administrada',
      tabela: {
        cabecalho: ['Data e hora', 'Medicamento', 'Situação', 'Confirmada por'],
        linhas: h.administracoes.slice(0, 40).map((d) => [
          `${diaBR(d.previsto)} ${hhmmBR(d.previsto)}`,
          `${d.medicamento} ${d.dose}`, d.estadoRotulo, d.por ?? '—',
        ]),
      },
      procedencia: 'grade de medicamentos; cada dose é confirmada por quem a administrou.',
    });
  }

  return {
    titulo: `Situação de saúde — ${pessoa.nome}`,
    subtitulo: 'Documento de acompanhamento em saúde',
    identificacao: [
      { rotulo: 'Acolhido', valor: pessoa.nome + (pessoa.idade ? ` (${pessoa.idade} anos)` : '') },
      { rotulo: 'Unidade', valor: unidade },
      { rotulo: 'Emitido em', valor: diaBR(new Date()) },
    ],
    secoes,
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: 'Este documento reúne o que está registrado. Ele não conclui, não avalia e não '
      + 'substitui o parecer de quem atende. Conteúdo de saúde é dado sensível: ele circula '
      + 'entre quem cuida, e não em local de passagem.',
  };
}
