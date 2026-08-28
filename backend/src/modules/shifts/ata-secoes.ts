/**
 * ESTRUTURA DA ATA DA CASA (§12.5).
 *
 * Transcrição estruturada do LIVRO ATA — AI 03 (o formulário real da casa,
 * conferido em 28/08/2026). Cada seção existe porque aparece no livro;
 * nenhuma foi inventada aqui. Manter esta lista
 * como DADO (e não como colunas) tem uma razão prática: quando o Marcelo
 * devolver o livro revisado, acrescentar ou renomear uma seção é editar este
 * arquivo — nenhuma ATA antiga muda de forma, nenhuma migração é necessária.
 */
export interface SecaoAta {
  chave: string;
  titulo: string;
  tipo: 'texto' | 'lista' | 'sim_nao_detalhe' | 'checklist_ambientes';
  ajuda: string;
  /** Quando true, a seção precisa ser respondida antes do fechamento. */
  obrigatoria: boolean;
}

export const SECOES_ATA: SecaoAta[] = [
  { chave: 'equipe_presente', titulo: 'Funcionários presentes', tipo: 'lista', obrigatoria: true,
    ajuda: 'Quem esteve no plantão. Ausências e motivo entram na seção seguinte.' },
  { chave: 'ausencias', titulo: 'Ausências, motivo e apoio', tipo: 'texto', obrigatoria: false,
    ajuda: 'Ausências do turno, motivo informado e profissionais de apoio que atuaram.' },
  { chave: 'acolhidos', titulo: 'Acolhidos ativos e situação', tipo: 'texto', obrigatoria: true,
    ajuda: 'Situação atual do grupo. Entradas, saídas e retornos do turno.' },
  { chave: 'convivencia_familiar', titulo: 'Convivência ou contato familiar', tipo: 'texto', obrigatoria: false,
    ajuda: 'Visitas, ligações e videochamadas com a família ocorridas no turno.' },
  { chave: 'saida_nao_autorizada', titulo: 'Saída não autorizada e retorno', tipo: 'sim_nao_detalhe', obrigatoria: true,
    ajuda: 'Houve saída não autorizada? Registrar horário, retorno e boletim de ocorrência, se houve.' },
  { chave: 'experiencia_familiar', titulo: 'Acolhido em experiência familiar', tipo: 'texto', obrigatoria: false,
    ajuda: 'Quem está em experiência familiar, desde quando e com quem. É diferente de visita domiciliar: a criança está fora da casa, e a casa continua responsável.' },
  { chave: 'visita_domiciliar', titulo: 'Visita domiciliar', tipo: 'texto', obrigatoria: false,
    ajuda: 'Visita domiciliar realizada, com quem foi e desfecho.' },
  { chave: 'visita_recebida', titulo: 'Visita recebida na casa', tipo: 'texto', obrigatoria: false,
    ajuda: 'Quem visitou a casa e qual educador acompanhou.' },
  { chave: 'internacao', titulo: 'Internação e acompanhante', tipo: 'texto', obrigatoria: false,
    ajuda: 'Internação ocorrida, unidade e educador acompanhante.' },
  { chave: 'enfermagem', titulo: 'Acionamento da Enfermagem', tipo: 'sim_nao_detalhe', obrigatoria: true,
    ajuda: 'A Enfermagem foi acionada? Horário, motivo e orientação recebida.' },
  { chave: 'falta_escolar', titulo: 'Falta escolar', tipo: 'texto', obrigatoria: false,
    ajuda: 'Faltas do dia e motivo informado. O registro individual fica na chamada de escola.' },
  { chave: 'saude_deslocamentos', titulo: 'Deslocamentos e atendimentos de saúde', tipo: 'texto', obrigatoria: false,
    ajuda: 'Consultas, exames e emergências, com acompanhante e desfecho.' },
  { chave: 'ligacoes', titulo: 'Ligações e videochamadas relevantes', tipo: 'texto', obrigatoria: false,
    ajuda: 'Contatos relevantes do turno, com quem e para quê.' },
  { chave: 'medicamentos', titulo: 'Resumo de medicamentos', tipo: 'texto', obrigatoria: true,
    ajuda: 'Responsável pela administração, recusas, atrasos e incidentes. O detalhe individual já está no módulo de medicamentos.' },
  { chave: 'organizacao', titulo: 'Organização da casa', tipo: 'checklist_ambientes', obrigatoria: false,
    ajuda: 'Cozinha, banheiros, quartos, lavagem e secagem de roupas, sala de estudos, gavetas e armários. Descreve o AMBIENTE no fim do turno — nunca as pessoas.' },
  { chave: 'casa', titulo: 'Manutenção e fatos gerais', tipo: 'texto', obrigatoria: false,
    ajuda: 'Manutenções pedidas ou realizadas e fatos gerais do turno.' },
  { chave: 'orientacoes', titulo: 'Ocorrências, pendências e orientações ao próximo turno', tipo: 'texto', obrigatoria: true,
    ajuda: 'O que o próximo turno precisa saber e assumir. É este campo que aparece na entrada de quem chega.' },
];

/**
 * Ambientes conferidos no fim do turno, como no LIVRO ATA - AI 03.
 *
 * O formulário de papel marca "organizada / desorganizada" por ambiente. Foi
 * mantido assim, com uma diferença deliberada: o registro é do AMBIENTE. Nem
 * o formulário nem o sistema associam a desorganização a um acolhido — quem
 * arrumou ou deixou de arrumar não é campo, porque isso vira ficha de
 * comportamento (§3.3).
 */
export const AMBIENTES_CASA = [
  { chave: 'cozinha', label: 'Cozinha' },
  { chave: 'banheiros', label: 'Banheiros' },
  { chave: 'quartos', label: 'Quartos' },
  { chave: 'lavanderia', label: 'Lavagem e secagem de roupas' },
  { chave: 'sala_estudos', label: 'Sala de estudos' },
  { chave: 'armarios', label: 'Gavetas e armários' },
];

/** Classificações do episódio (§12.5). Descrevem o FATO, nunca a pessoa. */
export const CLASSIFICACOES_EPISODIO = [
  { code: 'desorganizacao', label: 'Desorganização' },
  { code: 'briga_conflito', label: 'Briga ou conflito' },
  { code: 'contencao', label: 'Contenção' },
  { code: 'saida_nao_autorizada', label: 'Saída não autorizada' },
  { code: 'saude', label: 'Saúde' },
  { code: 'medicamento', label: 'Medicamento' },
  { code: 'outro', label: 'Outro' },
];
