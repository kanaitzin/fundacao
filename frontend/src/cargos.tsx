/**
 * A COR DE CADA CARGO, E O CÍRCULO DE INICIAIS (fase 151).
 *
 * Decisão da Fundação em 23/09, entre três caminhos: a cor que diferencia
 * pessoas na tela é **por CARGO**, e não por indivíduo.
 *
 * ELA CONVIVE COM DUAS OUTRAS COISAS COLORIDAS, e é por isso que este arquivo
 * é longo — as três respondem a perguntas diferentes, e o dia em que duas
 * responderem à mesma, a cor deixa de informar e passa a decorar:
 *
 *  1. **A COR DE ESTADO** (vermelho crítico, âmbar em atenção, verde feito) diz
 *     *"isto ainda precisa de alguém?"*. Ela é a mais importante da casa e não
 *     se toca. **Por isso o cargo NÃO usa a família dela**: um círculo âmbar ao
 *     lado de um nome seria lido como "esta pessoa está em atenção", e é
 *     exatamente o que a §6 proíbe — cor comunica estado operacional, nunca
 *     julgamento sobre a pessoa. Os tons daqui são fundos CHEIOS e escuros, com
 *     letra branca; os de estado são pílulas claras com letra colorida. Formas
 *     diferentes, para não se confundirem de relance no corredor.
 *  2. **A COR DE AUTOR** (`tomDoAutor`, fase 123) diz *"qual colega escreveu
 *     esta linha?"* na ATA e na escala, e a coordenação a escolhe por pessoa
 *     para que dois educadores do mesmo plantão não caiam no mesmo tom. Ela
 *     continua onde estava. **O cargo não a substitui**: trocá-la por cargo
 *     pintaria os dois educadores da mesma cor, que é o defeito que ela existe
 *     para consertar.
 *  3. **A COR DE CARGO**, aqui, diz *"de que setor é esta pessoa?"* — e é a
 *     pergunta da escala, do painel do plantão e da barra: quem olha quer saber
 *     se há técnica no turno, não qual das duas técnicas.
 *
 * E A COR NUNCA ANDA SOZINHA. O círculo carrega as iniciais, e o nome do cargo
 * vai no rótulo acessível — quem não distingue os tons, quem imprime em preto e
 * branco e quem usa leitor de tela recebem a mesma informação.
 */
import { ROTULO_CARGO } from './rotulos';

/**
 * OS NOVE CARGOS, em fundo cheio com letra branca.
 *
 * Todos conferidos contra branco: o menor é o verde do educador, com 4,9:1, e
 * a AA pede 4,5:1. *O âmbar do Líder Diurno é o `#92400E` da fase 118, e não o
 * `#B45309` que pareceria natural — aquele dá 4,46:1, reprova por quatro
 * centésimos, e é o tipo de diferença que ninguém vê num monitor parado e some
 * no corredor às onze da noite.*
 *
 * As famílias foram escolhidas para não colidirem NA MESMA TELA: a escala da
 * casa mostra coordenação, líder, técnica, educador e enfermagem lado a lado, e
 * esses cinco estão em azul, terra, violeta, verde e turquesa — distinguíveis
 * inclusive na forma mais comum de daltonismo, porque nenhum par é
 * verde-e-vermelho.
 */
export const COR_DO_CARGO: Record<string, string> = {
  coordenador:         '#1D4ED8',   /* azul     — a casa responde por ela */
  lider_diurno:        '#92400E',   /* terra    — o turno do dia */
  lider_noturno_geral: '#3730A3',   /* índigo   — o turno da noite */
  equipe_tecnica:      '#6D28D9',   /* violeta  */
  educador:            '#047857',   /* verde    — quem está com a criança */
  enfermagem:          '#0E7490',   /* turquesa */
  cozinha:             '#9D174D',   /* vinho    */
  gestor_geral:        '#334155',   /* ardósia  — institucional, sem cor de casa */
  admin_tecnico:       '#52525B',   /* cinza    — conta técnica */
};

/** Cargo desconhecido não inventa cor: fica na tinta de apoio, e o nome diz. */
export const corDoCargo = (cargo?: string | null) =>
  (cargo && COR_DO_CARGO[cargo]) || 'var(--slate-solid)';

/**
 * AS INICIAIS DE UM NOME.
 *
 * Primeira e última palavra — "Marina Costa" vira MC. Duas regras que vieram do
 * dado de verdade: o que está entre parênteses sai (a semente tem "Carla
 * Coordenadora (fictícia)", e "C(" não é inicial de ninguém), e as preposições
 * saem também, senão "Ana de Souza" viraria "AS" por acaso e "Ana Souza" o
 * mesmo — o que já é comum o bastante sem ajuda.
 */
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export function iniciais(nome?: string | null): string {
  const partes = String(nome ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ''))
    .filter((p) => p && !LIGACOES.has(p.toLowerCase()));
  if (!partes.length) return '—';
  const primeira = partes[0][0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? '' : '';
  return (primeira + ultima).toUpperCase();
}

/**
 * O CÍRCULO — iniciais na cor do cargo.
 *
 * `titulo` é o que o leitor de tela anuncia e o que aparece ao passar o mouse:
 * o nome inteiro e o cargo por extenso. O círculo é decoração de uma
 * informação que já está escrita, e some sem prejuízo para quem não o vê.
 */
export function Cargo({ nome, cargo, tamanho }: {
  nome?: string | null; cargo?: string | null; tamanho?: 'sm' | 'md';
}) {
  const rotulo = cargo ? ROTULO_CARGO[cargo] ?? cargo : 'cargo não informado';
  return (
    <span className={`cargo-chip${tamanho === 'sm' ? ' sm' : ''}`}
          style={{ background: corDoCargo(cargo) }}
          title={`${nome ?? ''} · ${rotulo}`.trim()}
          aria-label={`${nome ?? ''} · ${rotulo}`.trim()}
          role="img">
      {iniciais(nome)}
    </span>
  );
}
