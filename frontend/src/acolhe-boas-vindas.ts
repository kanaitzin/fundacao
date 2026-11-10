/*
 * AS BOAS-VINDAS DA ACOLHE+AI (fase 300, pedido de 09/11: "textos amigáveis para ela
 * se apresentar e como responder, várias palavras pré-prontas e os documentos que ela
 * é capaz de fazer").
 *
 * Tudo aqui é frase de colega, sem travessão e sem lista de regra. Cada frase pronta é
 * um pedido que o modo guia já entende (o `acolhe-guia.ts`) e que o modelo, ligado,
 * entende melhor ainda: tocar nela é o mesmo que escrever. A frase só aparece para
 * quem alcança a tela que ela pede (`precisa`), para ninguém tocar e ouvir um não.
 *
 * Não importa nada: a tela e o teste leem a mesma lista.
 */

export interface FrasePronta {
  /** O que aparece no botão, curto. */
  rotulo: string;
  /** O que vai para a conversa, como se a pessoa tivesse escrito. */
  pedido: string;
  /** A tela que a pessoa precisa alcançar para a frase fazer sentido. */
  precisa?: string;
  /** Só para estes cargos, quando alcançar a tela não basta (o educador vê a Agenda e não marca). */
  cargos?: string[];
}

/** Bom dia, boa tarde ou boa noite, pela hora de Porto Alegre. */
export function saudacaoDaHora(agora = new Date()): string {
  const hora = Number(new Intl.DateTimeFormat('pt-BR', {
    hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo',
  }).format(agora));
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** A primeira linha das boas-vindas, com o primeiro nome quando há. */
export function boasVindas(nome: string | null | undefined, agora = new Date()): string {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0];
  return primeiro ? `${saudacaoDaHora(agora)}, ${primeiro}!` : `${saudacaoDaHora(agora)}!`;
}

/** Como ela se apresenta, logo abaixo da saudação. */
export const APRESENTACAO = [
  'Eu sou a Acolhe+AI, a colega de plantão que mora aqui no sistema. Vejo só o que você vê, com o seu acesso.',
  'Posso levar você a qualquer tela, abrir um formulário, fazer conta, ler um papel que você fotografar e montar o rascunho de um relatório com o que você me contar. Quem confere e salva é sempre você.',
];

/** As frases prontas para começar: o que a equipe mais pede no turno. */
export const FRASES_PRONTAS: FrasePronta[] = [
  { rotulo: 'O que eu preciso saber hoje?', pedido: 'O que eu preciso saber neste plantão?', precisa: 'dia' },
  /* O `{tela}` vira o nome da tela aberta na hora do toque. */
  { rotulo: 'Me explica esta tela', pedido: 'Como funciona a tela {tela}?' },
  { rotulo: 'Me leva para a chamada', pedido: 'Me leva para a chamada', precisa: 'chamada' },
  { rotulo: 'Registrar uma ocorrência', pedido: 'Quero registrar uma ocorrência', precisa: 'ocorrencias' },
  /* Quem marca é quem o `QUEM_MARCA` da Agenda deixa (fase 303: o educador tocava e ouvia um não). */
  { rotulo: 'Marcar um compromisso', pedido: 'Quero marcar um compromisso na agenda', precisa: 'agenda',
    cargos: ['lider_diurno', 'equipe_tecnica', 'coordenador', 'coordenacao_geral', 'gestor_geral', 'enfermagem'] },
  { rotulo: 'Ver os remédios de agora', pedido: 'Me leva para a saúde', precisa: 'saude' },
  { rotulo: 'Fazer uma conta', pedido: 'Quanto é 12,50 + 7,90 + 23,40?' },
  { rotulo: 'Ler o texto de um papel', pedido: 'Como faço para ler o texto de um papel?' },
  { rotulo: 'Como te ensino uma gíria?', pedido: 'Como ensino uma palavra para você?' },
];

/** Os documentos que ela monta, ou leva até onde ele sai pronto. */
export const DOCUMENTOS_QUE_EU_FACO: FrasePronta[] = [
  { rotulo: 'Rascunho da ATA do meu turno', pedido: 'Quero o rascunho da ATA do meu plantão', precisa: 'ata' },
  { rotulo: 'Relatório pela voz', pedido: 'Quero fazer um relatório' },
  { rotulo: 'Relatório do período da casa', pedido: 'Quero o relatório do período da casa', precisa: 'periodo' },
  { rotulo: 'Relatório de visitas de uma criança', pedido: 'Quero o relatório de visitas de uma criança', precisa: 'acolhidos' },
  { rotulo: 'Relatório das vivências em Word', pedido: 'Quero o relatório das vivências em Word', precisa: 'acolhidos' },
  { rotulo: 'A trajetória da criança', pedido: 'Quero a trajetória de uma criança em Word', precisa: 'impacto' },
  { rotulo: 'Relatório da internação', pedido: 'Quero o relatório da internação em Word', precisa: 'internacao' },
  { rotulo: 'Tabela que vira planilha', pedido: 'Monta uma tabela com o que eu te passar, para baixar como planilha' },
];

/** O que fica no rodapé das boas-vindas: como conversar com ela. */
export const COMO_CONVERSAR =
  'Pode escrever do seu jeito, com gíria e sem acento, ou tocar no microfone. Na Conversa por voz, você fala e eu respondo falando, para quando as mãos estão ocupadas.';

/** As frases que a pessoa alcança, na ordem da lista. */
export function frasesDoCargo(lista: FrasePronta[], alcanca: (tela: string) => boolean, cargo?: string): FrasePronta[] {
  return lista.filter((f) => (!f.precisa || alcanca(f.precisa)) && (!f.cargos || !cargo || f.cargos.includes(cargo)));
}
