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
  /** A exceção do 0930 — quem confere o armário às 22h precisa lê-la no papel. */
  soEnfermagem?: boolean;
}

export function folhaDaGrade(casa: string, doses: DoseDaGrade[], autor: AutorDaFolha): Folha {
  const ordenadas = [...doses].sort((a, b) => String(a.horario).localeCompare(String(b.horario)));

  return {
    titulo: 'Grade de medicação do dia',
    subtitulo: `${casa} · conferência da equipe`,
    identificacao: [
      { rotulo: 'Unidade', valor: casa },
      { rotulo: 'Data', valor: diaBR(new Date()) },
      { rotulo: 'Doses previstas', valor: String(doses.length) },
    ],
    secoes: [
      {
        titulo: 'Doses do dia',
        paragrafos: ordenadas.length ? [] : ['Não há doses previstas para hoje.'],
        tabela: ordenadas.length ? {
          cabecalho: ['Horário', 'Acolhido', 'Medicamento e dose', 'Situação'],
          linhas: ordenadas.map((d) => [
            d.tipo === 'quando_necessario' ? 's/n' : hhmmBR(d.horario),
            d.acolhido?.nome ?? '—',
            /* A folha é lida com as mãos ocupadas, de porta aberta: se a
               exceção não estiver NESTA célula, ela não é lida. */
            `${d.medicamento} ${d.dose} · ${d.via}`
              + (d.soEnfermagem ? ' · administração exclusiva da Enfermagem' : ''),
            d.rotulo,
          ]),
        } : undefined,
        procedencia: 'Grade de medicação da unidade na data da emissão.',
      },
      {
        titulo: 'Conferência do plantão',
        aPreencher: 'nome de quem conferiu a grade no início e no fim do turno, e as intercorrências',
      },
    ],
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: 'Documento de uso interno da equipe. Manter em local de acesso restrito, fora de '
      + 'corredores, salas de visita e murais, por conter o nome dos acolhidos junto à medicação '
      + 'em uso. Descartar ao final do dia.',
  };
}
