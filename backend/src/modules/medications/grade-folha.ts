/**
 * A GRADE DA CASA — a folha que fica na porta do armário da medicação.
 *
 * Sem import além do contrato: lida pelo servidor e pelo protótipo.
 *
 * O pedido foi "a situação da casa toda para colar numa parede". A folha
 * existe, com um cuidado escrito nela: quadro de medicação é papel de SERVIÇO.
 * Ele fica onde só a equipe entra — a sala da enfermagem, a porta do armário —,
 * nunca num corredor por onde passam visitas, outras crianças e a família. Por
 * isso traz horário, medicamento e nome, e **não traz diagnóstico, alergia
 * detalhada nem condição de saúde**: essas ficam no documento individual, que
 * vai junto de quem precisa.
 *
 * Se a casa quiser diferente, é decisão dela — e está registrada como decisão
 * em aberto, não como preferência de quem construiu.
 */
import { Folha, AutorDaFolha, diaBR, hhmmBR } from '../../kernel/documentos/folha';

export interface DoseDaGrade {
  horario: string;
  tipo?: string;
  acolhido?: { nome: string } | null;
  medicamento: string;
  dose: string;
  via: string;
  rotulo: string;
}

export function folhaDaGrade(casa: string, doses: DoseDaGrade[], autor: AutorDaFolha): Folha {
  const ordenadas = [...doses].sort((a, b) => String(a.horario).localeCompare(String(b.horario)));

  return {
    titulo: `Grade de medicação do dia — ${casa}`,
    subtitulo: 'Folha de conferência da equipe',
    identificacao: [
      { rotulo: 'Unidade', valor: casa },
      { rotulo: 'Data', valor: diaBR(new Date()) },
      { rotulo: 'Doses previstas', valor: String(doses.length) },
    ],
    secoes: [
      {
        titulo: 'Doses do dia',
        paragrafos: ordenadas.length ? [] : ['Nenhuma dose prevista para hoje nesta casa.'],
        tabela: ordenadas.length ? {
          cabecalho: ['Hora', 'Acolhido', 'Medicamento e dose', 'Situação'],
          linhas: ordenadas.map((d) => [
            d.tipo === 'quando_necessario' ? 's/n' : hhmmBR(d.horario),
            d.acolhido?.nome ?? '—',
            `${d.medicamento} ${d.dose} · ${d.via}`,
            d.rotulo,
          ]),
        } : undefined,
        procedencia: 'grade do dia da unidade, na data da emissão.',
      },
      {
        titulo: 'Conferência do plantão',
        aPreencher: 'quem conferiu a grade no início e no fim do turno, e o que faltou',
      },
    ],
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: 'FOLHA DE SERVIÇO. Ela traz horário, nome e medicamento porque é isso que a '
      + 'equipe confere no armário — e não traz diagnóstico nem condição de saúde. Mantenha-a '
      + 'em área restrita à equipe: corredor, sala de visitas e mural aberto não são lugar '
      + 'para o nome de uma criança ao lado do remédio que ela toma. Papel impresso sai do '
      + 'sistema e não volta.',
  };
}
