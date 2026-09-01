/**
 * O DOSSIÊ DO ACOLHIDO — o que toda casa precisa ter, por criança (§6.1).
 *
 * ESTE ARQUIVO NÃO IMPORTA NADA, de propósito — a mesma razão de
 * `ata-secoes.ts`, `alcance.ts` e `rotina-vocabulario.ts`: o protótipo o lê
 * direto, para que a lista da demonstração seja a MESMA que o servidor cobra.
 *
 * Três coisas que a lista carrega e que não são detalhe:
 *
 *  * **o título do arquivo nunca leva CPF, diagnóstico nem teor de decisão
 *    judicial** (regra 3). Por isso cada item tem um `titulo` neutro sugerido:
 *    "Laudo — 12/03" e não "laudo transtorno da Alice";
 *  * **o judicial é categoria à parte e alcance à parte.** O educador que
 *    cuida da criança no dia a dia não lê por que ela foi retirada de casa;
 *    quem filtra é `app_can_open_doc(category)`, no banco;
 *  * **atendimento não é documento parado.** Consulta, boletim e visita têm
 *    DATA, e muitos têm PRÓXIMA data. É o que transforma uma pasta cheia em
 *    algo que avisa antes de vencer.
 */

export type CategoriaDoc = 'pessoal' | 'saude' | 'escolar' | 'convivencia'
                         | 'judicial_socioassistencial';

export interface ItemDoDossie {
  /** Chave estável: é o que liga o arquivo à vaga que ele preenche. */
  chave: string;
  label: string;
  categoria: CategoriaDoc;
  /** Sugestão de título neutro para o arquivo, mostrada na tela. */
  titulo: string;
  /** Obrigatório para a casa considerar o dossiê completo. */
  obrigatorio: boolean;
  /** Vence, e por isso a tela pergunta a validade. */
  vence?: boolean;
  ajuda?: string;
}

export const CATEGORIAS_DOSSIE: { code: CategoriaDoc; label: string; descricao: string;
                                  restrita: boolean }[] = [
  { code: 'pessoal', label: 'Documentos pessoais e escolares',
    descricao: 'O que identifica a criança e a matrícula dela. É o núcleo que toda casa '
      + 'precisa ter completo.', restrita: false },
  { code: 'saude', label: 'Atendimentos médicos',
    descricao: 'Consultas, exames, laudos e receitas — com a data do atendimento e a do '
      + 'retorno, quando houver.', restrita: false },
  { code: 'escolar', label: 'Atendimentos educacionais',
    descricao: 'Boletim, reunião, relatório da escola e avaliação pedagógica, com o que '
      + 'ficou combinado.', restrita: false },
  { code: 'convivencia', label: 'Convivência familiar e comunitária',
    descricao: 'Visitas, convivência com irmãos, atividades na comunidade, curso e esporte '
      + 'fora da casa.', restrita: false },
  { code: 'judicial_socioassistencial', label: 'Registros judiciais e socioassistenciais',
    descricao: 'Guia de acolhimento, decisões e relatórios para a rede. ÁREA RESTRITA: o '
      + 'educador não lê conteúdo judicial, e quem filtra é o banco.', restrita: true },
];

export const DOSSIE_EXIGIDO: ItemDoDossie[] = [
  // ---------- Pessoais e escolares ----------
  { chave: 'certidao_nascimento', label: 'Certidão de nascimento', categoria: 'pessoal',
    titulo: 'Certidão de nascimento', obrigatorio: true },
  { chave: 'rg', label: 'RG', categoria: 'pessoal', titulo: 'RG', obrigatorio: false,
    ajuda: 'Nem toda criança tem, e não ter não é pendência dela — é da rede.' },
  { chave: 'cpf', label: 'CPF', categoria: 'pessoal', titulo: 'CPF', obrigatorio: true,
    ajuda: 'O NÚMERO não vai no título do arquivo, nem no nome do documento.' },
  { chave: 'cartao_sus', label: 'Cartão SUS', categoria: 'pessoal', titulo: 'Cartão SUS',
    obrigatorio: true },
  { chave: 'caderneta_vacinacao', label: 'Caderneta de vacinação', categoria: 'pessoal',
    titulo: 'Caderneta de vacinação', obrigatorio: true, vence: true,
    ajuda: 'A folha das doses, atualizada. Vence no sentido de precisar de nova foto.' },
  { chave: 'foto_3x4', label: 'Foto 3×4', categoria: 'pessoal', titulo: 'Foto 3×4',
    obrigatorio: false },
  { chave: 'declaracao_matricula', label: 'Declaração de matrícula', categoria: 'pessoal',
    titulo: 'Declaração de matrícula', obrigatorio: true, vence: true },
  { chave: 'historico_escolar', label: 'Histórico escolar', categoria: 'pessoal',
    titulo: 'Histórico escolar', obrigatorio: true },

  // ---------- Atendimentos médicos ----------
  { chave: 'consulta_medica', label: 'Consulta', categoria: 'saude',
    titulo: 'Consulta', obrigatorio: false, vence: true,
    ajuda: 'A data do atendimento e a do retorno. O diagnóstico não vai no título.' },
  { chave: 'exame', label: 'Exame', categoria: 'saude', titulo: 'Exame', obrigatorio: false },
  { chave: 'laudo', label: 'Laudo ou parecer', categoria: 'saude', titulo: 'Laudo',
    obrigatorio: false,
    ajuda: 'Título neutro: "Laudo — 12/03". O conteúdo fica no arquivo, não no nome.' },
  { chave: 'receita', label: 'Receita', categoria: 'saude', titulo: 'Receita',
    obrigatorio: false, vence: true },

  // ---------- Atendimentos educacionais ----------
  { chave: 'boletim', label: 'Boletim', categoria: 'escolar', titulo: 'Boletim',
    obrigatorio: false },
  { chave: 'reuniao_escola', label: 'Reunião na escola', categoria: 'escolar',
    titulo: 'Reunião na escola', obrigatorio: false,
    ajuda: 'Quem foi pela casa, e o que ficou combinado.' },
  { chave: 'relatorio_escola', label: 'Relatório da escola', categoria: 'escolar',
    titulo: 'Relatório da escola', obrigatorio: false },
  { chave: 'avaliacao_pedagogica', label: 'Avaliação pedagógica', categoria: 'escolar',
    titulo: 'Avaliação pedagógica', obrigatorio: false },

  // ---------- Convivência ----------
  { chave: 'visita_familiar', label: 'Visita familiar', categoria: 'convivencia',
    titulo: 'Visita familiar', obrigatorio: false,
    ajuda: 'Quem visitou, quando, e como a criança ficou depois — sem juízo sobre a família.' },
  { chave: 'convivencia_irmaos', label: 'Convivência com irmãos', categoria: 'convivencia',
    titulo: 'Convivência com irmãos', obrigatorio: false },
  { chave: 'atividade_comunitaria', label: 'Atividade na comunidade', categoria: 'convivencia',
    titulo: 'Atividade na comunidade', obrigatorio: false },
  { chave: 'curso_esporte', label: 'Curso ou esporte', categoria: 'convivencia',
    titulo: 'Curso ou esporte', obrigatorio: false, vence: true },

  // ---------- Judicial e socioassistencial (restrito) ----------
  { chave: 'guia_acolhimento', label: 'Guia de acolhimento', categoria: 'judicial_socioassistencial',
    titulo: 'Guia de acolhimento', obrigatorio: true },
  { chave: 'decisao_judicial', label: 'Decisão judicial', categoria: 'judicial_socioassistencial',
    titulo: 'Decisão judicial', obrigatorio: false,
    ajuda: 'O TEOR não vai no título. "Decisão judicial — 04/02" basta para achar.' },
  { chave: 'relatorio_rede', label: 'Relatório para a rede',
    categoria: 'judicial_socioassistencial', titulo: 'Relatório para a rede', obrigatorio: false },
  { chave: 'pia', label: 'PIA — Plano Individual de Atendimento',
    categoria: 'judicial_socioassistencial', titulo: 'PIA', obrigatorio: true, vence: true,
    ajuda: 'Revisto a cada seis meses; a validade é o que faz o sistema avisar antes.' },
];

/** Tipos de vivência do álbum (§6.9) — todos são coisa boa, e é de propósito. */
export const TIPOS_DE_VIVENCIA = [
  { code: 'aniversario', label: 'Aniversário' },
  { code: 'festa', label: 'Festa' },
  { code: 'conquista', label: 'Conquista' },
  { code: 'passeio', label: 'Passeio' },
  { code: 'formatura', label: 'Formatura' },
  { code: 'esporte', label: 'Esporte' },
  { code: 'arte', label: 'Arte e cultura' },
  { code: 'outro', label: 'Outro' },
];

/** O que o sistema aceita como arquivo, conferido pela ASSINATURA do arquivo. */
export const TIPOS_DE_ARQUIVO = [
  { assinatura: 'ffd8ff', tipo: 'image/jpeg', rotulo: 'Foto JPEG' },
  { assinatura: '89504e47', tipo: 'image/png', rotulo: 'Imagem PNG' },
  { assinatura: '25504446', tipo: 'application/pdf', rotulo: 'PDF' },
  { assinatura: '47494638', tipo: 'image/gif', rotulo: 'Imagem GIF' },
  { assinatura: '52494646', tipo: 'image/webp', rotulo: 'Imagem WebP' },
];

/** 15 MB — o mesmo limite prático de uma digitalização de celular. */
export const TAMANHO_MAXIMO = 15 * 1024 * 1024;

/**
 * O título nunca leva CPF, diagnóstico nem teor judicial (regra 3).
 *
 * A mesma verificação que os anexos de ocorrência já fazem. Devolve a frase da
 * recusa, ou `null` quando o título passa.
 */
export function tituloProibido(titulo: string): string | null {
  const t = (titulo ?? '').trim();
  // Dois caracteres, e não três: "RG" é um título legítimo, e barrá-lo seria
  // o sistema discutindo com a casa sobre o nome que ela já usa há anos.
  if (t.length < 2) return 'Dê um título ao documento — é como ele vai ser achado.';
  if (/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(t)) {
    return 'O título parece conter um CPF. O número fica DENTRO do documento, nunca no nome '
         + 'dele: nome de arquivo aparece em lista, em busca e em pasta compartilhada.';
  }
  const clinico = /(transtorno|autis|deficien|hiv|soroposit|depress|esquizo|bipolar|epilep|laudo de|cid[- ]?10)/i;
  if (clinico.test(t)) {
    return 'O título parece descrever um diagnóstico. Use um título neutro — "Laudo — 12/03" '
         + '— e deixe o conteúdo dentro do arquivo.';
  }
  const judicial = /(abuso|estupro|viol[êe]ncia sexual|neglig[êe]ncia|maus.tratos|destitui)/i;
  if (judicial.test(t)) {
    return 'O título parece descrever o teor de uma decisão ou o motivo do acolhimento. Use '
         + 'um título neutro — "Decisão judicial — 04/02" — e deixe o teor dentro do arquivo.';
  }
  return null;
}
