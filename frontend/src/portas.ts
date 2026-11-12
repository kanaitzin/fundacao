/**
 * AS PORTAS DO SISTEMA — uma lista só (fase 150).
 *
 * ELA EXISTIA EM DOIS LUGARES, e é a lição da fase 145 outra vez: um vetor de
 * chaves (`doMais`) dizia QUAIS telas o cargo alcança, e vinte e cinco blocos
 * escritos à mão no `App.tsx` diziam COMO cada uma se chama. Duas listas sobre
 * a mesma coisa divergem no dia em que alguém acrescenta a tela numa e esquece
 * a outra — e o sintoma seria o pior: a tela existe, o cargo a alcança, e não
 * há porta para ela em lugar nenhum.
 *
 * Aqui é uma só, e três coisas leem dela: a folha "Mais" do celular, a barra
 * lateral do monitor e a conferência. *Medido ao escrever isto: o `doMais`
 * tinha vinte e três chaves e a folha tinha vinte e cinco botões — a rotina da
 * casa e a escala de plantão estavam na folha e fora da contagem.*
 *
 * O TEXTO NÃO FOI REDIGITADO: ele foi extraído do que já estava na tela, em
 * código. Redigitar rótulo de memória é como se inventa nome de tela — e a
 * casa já pagou por isso (fases 1450 e 1460, com SQL).
 *
 * `grupo` é só da barra lateral: no celular a folha continua sendo uma lista
 * corrida, porque rolar é mais barato que decidir em qual seção olhar.
 */
export interface Porta {
  /** A mesma chave do `setAba` e do `alcanca()` — é ela que liga tudo. */
  aba: string;
  /** Nome em `icones.tsx`. Sem desenho, a porta aparece só com a palavra. */
  icone: string;
  grupo: 'comeco' | 'cotidiano' | 'registro' | 'gestao' | 'sistema';
  titulo: string;
  descricao: string;
  /**
   * A família de telas irmãs (fase 315). Na coluna curta do monitor, as portas
   * da mesma família aparecem como UMA entrada, e quem entra troca de irmã pela
   * faixa do alto da tela. Sem família, a porta aparece sozinha, como sempre.
   */
  familia?: Familia['cod'];
}

/**
 * AS FAMÍLIAS DE TELAS IRMÃS (fase 315, pedido de 12/11: "temos muitos menus na
 * lateral"). Medido antes: a coordenação via 30 opções de uma vez, a técnica 26,
 * o gestor 29. Com as famílias, a coluna da coordenação tem 17.
 *
 * NADA SOME E NENHUMA CHAVE MUDA: a `aba` de cada porta é a de sempre, o Guia, a
 * Acolhe+AI, os avisos e o alcance continuam levando à mesma tela. A família é
 * só o jeito de a coluna mostrar. Quem vê uma porta só da família vê a própria
 * porta, com o nome dela.
 *
 * A ordem das irmãs na faixa é a ordem delas em `PORTAS`.
 */
export interface Familia {
  cod: 'plantao' | 'saude' | 'equipe' | 'casas' | 'guardados' | 'sistema';
  titulo: string;
  icone: string;
  grupo: Porta['grupo'];
  /**
   * A tela que a família abre no primeiro toque. Sem isto ela abria a primeira da
   * lista, e tocar em Saúde levava à Internação hospitalar (achado do teste da
   * ordem alfabética, em 12/11). Quem não alcança a principal abre a primeira irmã
   * em ordem alfabética.
   */
  principal: string;
}

export const FAMILIAS: Familia[] = [
  { cod: 'plantao', titulo: 'Plantão', icone: 'bussola', grupo: 'cotidiano', principal: 'plantao' },
  { cod: 'saude', titulo: 'Saúde', icone: 'saude', grupo: 'registro', principal: 'saude' },
  { cod: 'equipe', titulo: 'Equipe', icone: 'equipe', grupo: 'gestao', principal: 'equipe' },
  { cod: 'casas', titulo: 'As casas', icone: 'unidades', grupo: 'gestao', principal: 'casas' },
  { cod: 'guardados', titulo: 'Arquivo e acessos', icone: 'arquivo', grupo: 'sistema', principal: 'arquivo' },
  { cod: 'sistema', titulo: 'Sistema', icone: 'sincronizacao', grupo: 'sistema', principal: 'sincronizacao' },
];

/** Uma linha da coluna curta: uma porta sozinha, ou uma família com as irmãs que o cargo vê. */
export type EntradaDaColuna =
  | { tipo: 'porta'; grupo: Porta['grupo']; porta: Porta }
  | { tipo: 'familia'; grupo: Porta['grupo']; familia: Familia; irmas: Porta[] };

/**
 * A coluna curta de um cargo: cada família vira uma entrada, no lugar da primeira
 * irmã que o cargo alcança. Família com uma irmã só à vista volta a ser a porta.
 */
export function colunaCurta(ve: (aba: string) => boolean): EntradaDaColuna[] {
  const saida: EntradaDaColuna[] = [];
  const feitas = new Set<string>();
  for (const porta of PORTAS) {
    if (!ve(porta.aba)) continue;
    if (!porta.familia) { saida.push({ tipo: 'porta', grupo: porta.grupo, porta }); continue; }
    if (feitas.has(porta.familia)) continue;
    feitas.add(porta.familia);
    const familia = FAMILIAS.find((f) => f.cod === porta.familia)!;
    const irmas = PORTAS.filter((p) => p.familia === porta.familia && ve(p.aba));
    if (irmas.length === 1) saida.push({ tipo: 'porta', grupo: porta.grupo, porta });
    else saida.push({ tipo: 'familia', grupo: familia.grupo, familia, irmas });
  }
  return saida;
}

/** A irmã que a família abre: a guardada desta sessão, a principal, ou a primeira de A a Z. */
export function irmaQueAbre(familia: Familia, irmas: Porta[], guardada?: string): Porta {
  return irmas.find((irma) => irma.aba === guardada)
    ?? irmas.find((irma) => irma.aba === familia.principal)
    ?? porOrdemAlfabetica(irmas, (irma) => irma.titulo)[0];
}

/** As irmãs da tela aberta que o cargo alcança; vazio quando ela não tem irmã à vista. */
export function irmasDe(aba: string, ve: (aba: string) => boolean): { familia: Familia; irmas: Porta[] } | null {
  const porta = PORTAS.find((p) => p.aba === aba);
  if (!porta?.familia) return null;
  const irmas = PORTAS.filter((p) => p.familia === porta.familia && ve(p.aba));
  if (irmas.length < 2) return null;
  return { familia: FAMILIAS.find((f) => f.cod === porta.familia)!, irmas };
}

/**
 * A ORDEM ALFABÉTICA DOS MENUS (pedido de 12/11: "dentro do dia a dia poderia ficar
 * de A a Z, pensando na facilidade"). Vale para os itens de cada grupo da coluna, para
 * os atalhos, para a faixa das telas irmãs e para a folha Mais do celular. O nome é
 * comparado como está escrito na tela, sem diferença de acento nem de maiúscula:
 * quem procura lê a primeira letra do que vê. As abas do turno ficam na ordem do
 * plantão, e o Guia continua sendo o primeiro.
 */
export function porOrdemAlfabetica<T>(itens: T[], nome: (item: T) => string): T[] {
  return [...itens].sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR', { sensitivity: 'base' }));
}

/** Como cada grupo se chama na barra lateral. */
export const GRUPOS: { cod: Porta['grupo']; titulo: string }[] = [
  /* O Guia vem antes de tudo, inclusive das abas do turno (fase 231). */
  { cod: 'comeco', titulo: 'Comece aqui' },
  { cod: 'cotidiano', titulo: 'O dia a dia' },
  { cod: 'registro', titulo: 'Registro e cuidado' },
  { cod: 'gestao', titulo: 'Equipe e gestão' },
  { cod: 'sistema', titulo: 'Sistema' },
];

/** A ordem é a que a equipe já conhece — a da folha "Mais" de hoje. */
export const PORTAS: Porta[] = [
  { aba: 'guia', icone: 'livros', grupo: 'comeco',
    titulo: 'Guia do sistema',
    descricao: 'Cada tela explicada, com o link para abrir, e o que a Acolhe+AI faz em cada uma.' },
  { aba: 'unidades', icone: 'linha_do_dia', grupo: 'cotidiano', familia: 'casas',
    titulo: 'O dia, em ordem',
    descricao: 'Todas as unidades que você acompanha, das 00h às 23h59.' },
  { aba: 'plantao', icone: 'bussola', grupo: 'cotidiano', familia: 'plantao',
    titulo: 'Painel do plantão',
    descricao: 'Quem está em quê agora, neste turno.' },
  { aba: 'agenda', icone: 'agenda', grupo: 'cotidiano',
    titulo: 'Agenda',
    descricao: 'O que está marcado e o que vem pela frente.' },
  { aba: 'rotina', icone: 'rotina', grupo: 'cotidiano', familia: 'plantao',
    titulo: 'A rotina da casa',
    descricao: 'O molde do dia — e as versões que a casa já seguiu.' },
  { aba: 'escala', icone: 'escala', grupo: 'cotidiano', familia: 'plantao',
    titulo: 'A escala de plantão',
    descricao: 'Quem assume cada dia e cada turno — e o que já passou.' },
  { aba: 'equipe', icone: 'equipe', grupo: 'gestao', familia: 'equipe',
    titulo: 'Equipe',
    descricao: 'Quem trabalha nesta casa, por setor.' },
  { aba: 'trabalho', icone: 'trabalho', grupo: 'gestao', familia: 'equipe',
    titulo: 'O trabalho da equipe',
    descricao: 'O que cada pessoa e cada setor registrou, em ordem. Sem contar nada.' },
  { aba: 'periodo', icone: 'periodo', grupo: 'gestao', familia: 'casas',
    titulo: 'O período da casa',
    descricao: 'Como foi a casa na semana, no mês ou no intervalo que você escolher.' },
  { aba: 'cozinha', icone: 'cozinha', grupo: 'cotidiano',
    titulo: 'Cozinha',
    descricao: 'Pedir lanche e cesta básica, e gerar as folhas para a cozinha.' },
  { aba: 'campos_do_perfil', icone: 'olho', grupo: 'gestao', familia: 'equipe',
    titulo: 'O que o plantão vê',
    descricao: 'Liga e desliga campos do perfil para quem está no turno.' },
  { aba: 'portaria', icone: 'portaria', grupo: 'cotidiano',
    titulo: 'Portaria',
    descricao: 'Quem pode visitar cada criança, e a folha em Word para a guarita.' },
  { aba: 'setores', icone: 'setores', grupo: 'gestao', familia: 'equipe',
    titulo: 'O que cada setor enxerga',
    descricao: 'A resposta escrita, sem entrar com a conta de ninguém.' },
  { aba: 'ocorrencias', icone: 'ocorrencias', grupo: 'registro',
    titulo: 'Ocorrências',
    descricao: 'Abrir, acompanhar e encerrar com análise — nunca sozinha.' },
  { aba: 'ata', icone: 'ata', grupo: 'registro',
    titulo: 'ATA',
    descricao: 'A da casa e a Geral Noturna, e o calendário com as ATAs dos dias anteriores.' },
  { aba: 'impacto', icone: 'impacto', grupo: 'gestao', familia: 'casas',
    titulo: 'O trabalho social',
    descricao: 'As oito casas pelo que o acolhimento produziu, e não pelo turno de hoje.' },
  { aba: 'internacao', icone: 'internacao', grupo: 'registro', familia: 'saude',
    titulo: 'Internação hospitalar',
    descricao: 'Quem está no hospital, o diário do período e a medicação de lá.' },
  { aba: 'saude', icone: 'saude', grupo: 'registro', familia: 'saude',
    titulo: 'Saúde',
    descricao: 'Doses do dia, estoque, triagem e resumo de saúde.' },
  { aba: 'alinhamentos', icone: 'alinhamentos', grupo: 'registro', familia: 'equipe',
    titulo: 'Combinados da equipe',
    descricao: 'O que ficou estabelecido nas reuniões, e o que está valendo agora.' },
  { aba: 'acompanhamentos', icone: 'acompanhamentos', grupo: 'registro',
    titulo: 'Acompanhamentos',
    descricao: 'Eixos obrigatórios, aprovação e relatórios.' },
  { aba: 'painel', icone: 'unidades', grupo: 'gestao', familia: 'casas',
    titulo: 'Painel das unidades',
    descricao: 'Ocupação, entradas e saídas, e o quadro de cada mês. Sem ranking.' },
  { aba: 'sincronizacao', icone: 'sincronizacao', grupo: 'sistema', familia: 'sistema',
    titulo: 'Sincronização',
    descricao: 'O que ficou pendurado entre o aparelho e o servidor, e o que espera decisão da equipe.' },
  { aba: 'sugestoes', icone: 'lampada', grupo: 'sistema', familia: 'sistema',
    titulo: 'Sugestões de melhoria',
    descricao: 'O que a equipe pediu à Acolhe+AI para o sistema melhorar, com o nome de quem pediu.' },
  { aba: 'implantacao', icone: 'pulso', grupo: 'sistema', familia: 'sistema',
    titulo: 'Saúde da implantação',
    descricao: 'O relógio, o backup, o e-mail e a fila do Drive: o que roda sozinho está rodando?' },
  { aba: 'arquivo', icone: 'arquivo', grupo: 'sistema', familia: 'guardados',
    titulo: 'Arquivo documental',
    descricao: 'Cópia do que fechou, com versões e fila de envio.' },
  { aba: 'transferencias', icone: 'transferencias', grupo: 'sistema', familia: 'guardados',
    titulo: 'Transferências',
    descricao: 'Pedidos enviados e recebidos, com conversa entre coordenações.' },
  { aba: 'cofre', icone: 'cofre', grupo: 'sistema', familia: 'guardados',
    titulo: 'Cofre de acessos',
    descricao: 'Contas do acolhido. Pede a sua senha de novo e é auditado.' },
  { aba: 'casas', icone: 'casas', grupo: 'gestao', familia: 'casas',
    titulo: 'Unidades',
    descricao: 'As unidades no seu alcance.' },
];
