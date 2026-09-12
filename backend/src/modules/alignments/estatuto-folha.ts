import { Folha, AutorDaFolha, diaBR } from '../../kernel/documentos/folha';

export interface RegraDaFolha {
  texto: string;
  publico: string;
  publicoRotulo: string;
  desde: string;
  daInstituicao: boolean;
  situacao: string;
  aindaNaoVale: boolean;
}

/**
 * A FOLHA DO ESTATUTO — a que vai para a parede (fase 95).
 *
 * O filtro por público é a razão de ela existir separada da tela. Afixar no
 * corredor uma folha que traz "não se fala do processo judicial na frente da
 * criança" — regra da equipe, e correta — é o oposto do que o estatuto existe
 * para fazer. Quem imprime escolhe: só o que é das crianças, só o que é da
 * equipe, ou tudo.
 *
 * Regra que ainda não entrou em vigor NÃO vai para a folha afixada: uma parede
 * não tem como dizer "vale a partir de segunda" sem confundir quem lê na
 * sexta. Ela aparece na tela, que tem lugar para a data.
 */
export function folhaDoEstatuto(
  casa: string,
  regras: RegraDaFolha[],
  publico: string,
  autor: AutorDaFolha,
): Folha {
  const vigentes = regras.filter((r) => r.situacao === 'vigente' && !r.aindaNaoVale);
  const daFolha = publico === 'todos'
    ? vigentes
    : vigentes.filter((r) => r.publico === publico || r.publico === 'todos');

  const rotuloPublico = publico === 'acolhidos' ? 'Para as crianças e adolescentes'
    : publico === 'equipe' ? 'Para quem trabalha na casa'
    : 'Todas as regras';

  return {
    titulo: `Regras de convivência — ${casa}`,
    subtitulo: rotuloPublico,
    identificacao: [
      { rotulo: 'Unidade', valor: casa },
      { rotulo: 'Emitido em', valor: diaBR(new Date()) },
      { rotulo: 'Regras nesta folha', valor: String(daFolha.length) },
    ],
    secoes: [
      {
        titulo: 'O que vale aqui',
        paragrafos: daFolha.length ? [] : [
          'Nenhuma regra de convivência escrita para este público ainda.',
        ],
        itens: daFolha.map((r) => [
          r.texto,
          r.daInstituicao ? 'regra da instituição' : null,
          `desde ${diaBR(new Date(`${String(r.desde).slice(0, 10)}T12:00:00-03:00`))}`,
        ].filter(Boolean).join(' · ')),
        procedencia: 'Estatuto da casa, no sistema. Regra revogada ou substituída sai desta '
          + 'folha, mas continua legível no sistema, com o motivo e a data.',
      },
    ],
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: 'Esta folha vale até ser substituída — troque a da parede quando receber uma nova. '
      + 'Quem quiser mudar uma regra fala com a coordenação: o estatuto se muda escrevendo, '
      + 'não riscando.',
  };
}
