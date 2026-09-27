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

  const rotuloPublico = publico === 'acolhidos' ? 'Para as crianças e os adolescentes'
    : publico === 'equipe' ? 'Para a equipe da casa'
    : 'Para todos na casa';

  return {
    titulo: 'Regras de convivência',
    subtitulo: `${casa} · ${rotuloPublico.toLowerCase()}`,
    identificacao: [
      { rotulo: 'Unidade', valor: casa },
      { rotulo: 'Emitido em', valor: diaBR(new Date()) },
      { rotulo: 'Regras nesta folha', valor: String(daFolha.length) },
    ],
    secoes: [
      {
        titulo: 'Regras em vigor',
        paragrafos: daFolha.length ? [] : [
          'Ainda não há regras de convivência registradas para este público.',
        ],
        itens: daFolha.map((r) => [
          r.texto,
          r.daInstituicao ? 'norma da Fundação' : null,
          `em vigor desde ${diaBR(new Date(`${String(r.desde).slice(0, 10)}T12:00:00-03:00`))}`,
        ].filter(Boolean).join(' · ')),
        procedencia: 'Estatuto da casa. Regras revogadas ou substituídas ficam registradas '
          + 'no histórico, com a data e o motivo.',
      },
    ],
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: 'Esta relação substitui a anterior; retire do mural a versão antiga. Propostas de '
      + 'mudança devem ser levadas à coordenação, que registra a alteração no estatuto.',
  };
}
