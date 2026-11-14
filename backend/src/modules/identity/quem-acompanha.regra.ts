/**
 * QUEM ACOMPANHA A CRIANÇA (pedido do dono em 14/11).
 *
 * A cozinha e a portaria não levam a criança a uma atividade, não acompanham a
 * internação, não realizam nem substituem atividade de criança. A regra do banco é a
 * `app_acompanha_crianca` (activities/1724); esta lista é o espelho para a tela e o
 * servidor, e a suíte `quem-acompanha-a-crianca` confere que as duas dizem o mesmo.
 * Não importa nada: a tela lê o mesmo arquivo.
 */
export const NAO_ACOMPANHAM_CRIANCA = ['cozinha', 'portaria'] as const;

export const acompanhaCrianca = (cargo: string | null | undefined) =>
  !!cargo && !(NAO_ACOMPANHAM_CRIANCA as readonly string[]).includes(cargo);

export const FRASE_NAO_ACOMPANHA =
  'A cozinha e a portaria não acompanham criança. Escolha alguém da equipe do plantão, a técnica ou a coordenação.';
