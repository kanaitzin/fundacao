/**
 * OS CAMPOS QUE A COORDENAÇÃO LIGA E DESLIGA (fase 93, migração 1130).
 *
 * Lista fechada, igual à do CHECK no banco — `campos-do-perfil.spec.ts` cobra
 * que as duas não divirjam. Campo novo entra por migração, revisado.
 *
 * Vale para o EDUCADOR. Os outros cargos seguem o alcance de sempre: o que
 * muda aqui é o que fica à vista de quem está no plantão, não quem pode o quê.
 */
export interface CampoDoPerfil {
  code: string;
  rotulo: string;
  /** O que o educador deixa de ver — a frase que a tela mostra à coordenação. */
  oQueSome: string;
}

export const CAMPOS_DO_PERFIL: CampoDoPerfil[] = [
  { code: 'escola', rotulo: 'Escola',
    oQueSome: 'Nome, série, turno e endereço da escola — e o telefone para ligar quando a criança falta.' },
  { code: 'contatos', rotulo: 'Quem aparece pela criança',
    oQueSome: 'A lista de contatos e os telefones. O educador deixa de saber quem é a pessoa que apareceu no portão.' },
  { code: 'equipe_referencia', rotulo: 'Equipe de referência',
    oQueSome: 'O serviço da rede que acompanha a criança — CRAS, CAPS, unidade de saúde.' },
  { code: 'cuidados_essenciais', rotulo: 'Cuidados essenciais',
    oQueSome: 'O texto de como cuidar desta criança no dia a dia.' },
];

export const CODIGOS_DE_CAMPO = CAMPOS_DO_PERFIL.map((c) => c.code);

/**
 * Os cinco que ficam FORA do alcance do botão, e não são negociáveis (§10.5).
 * Não estão na lista acima nem no CHECK: a garantia é a lista ser fechada, e
 * esta constante existe para a tela poder DIZER quais são — a coordenação
 * merece saber o que o botão não alcança, em vez de procurar.
 */
export const FORA_DO_ALCANCE = [
  'Motivo judicial',
  'Narrativa pessoal restrita',
  'Cofre de acessos',
  'Benefícios e dados bancários',
  'Ocorrência restrita',
];
