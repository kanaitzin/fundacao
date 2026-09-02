/**
 * A FOLHA DOS COMBINADOS — a que a equipe leva para o mural dela.
 *
 * Sem import além do contrato: lida pelo servidor e pelo protótipo.
 *
 * Só os VIGENTES entram. O encerrado não some da lista dentro do sistema,
 * porque "mas ficou combinado que..." é uma discussão que só o registro
 * encerra — mas numa folha impressa ele viraria instrução em vigor, e é por
 * isso que a ressalva diz, em voz alta, que quem manda é o sistema.
 */
import { Folha, AutorDaFolha, diaBR } from '../../kernel/documentos/folha';

export interface CombinadoDaFolha {
  texto: string;
  responsavel?: string | null;
  prazo?: string | null;
  por: string;
  criadoEm: string;
  situacao: string;
}

export interface ReuniaoDaFolha {
  data: string;
  titulo: string;
  por: string;
}

export function folhaDosCombinados(
  casa: string,
  combinados: CombinadoDaFolha[],
  reunioes: ReuniaoDaFolha[],
  autor: AutorDaFolha,
): Folha {
  const vigentes = combinados.filter((c) => c.situacao === 'vigente');

  return {
    titulo: `Combinados vigentes — ${casa}`,
    subtitulo: 'O que a equipe estabeleceu e está valendo',
    identificacao: [
      { rotulo: 'Unidade', valor: casa },
      { rotulo: 'Emitido em', valor: diaBR(new Date()) },
      { rotulo: 'Combinados vigentes', valor: String(vigentes.length) },
    ],
    secoes: [
      {
        titulo: 'Combinados em vigor',
        paragrafos: vigentes.length ? [] : ['Nenhum combinado vigente registrado.'],
        itens: vigentes.map((c) => [
          c.texto,
          c.responsavel ? `responsável: ${c.responsavel}` : null,
          c.prazo ? `até ${diaBR(c.prazo)}` : null,
          `registrado por ${c.por} em ${diaBR(c.criadoEm)}`,
        ].filter(Boolean).join(' · ')),
        procedencia: 'combinados registrados pela equipe técnica e pela coordenação.',
      },
      {
        titulo: 'Reuniões do período',
        paragrafos: reunioes.length ? [] : ['Nenhuma reunião registrada.'],
        tabela: reunioes.length ? {
          cabecalho: ['Data', 'Reunião', 'Registrada por'],
          linhas: reunioes.slice(0, 20).map((r) => [diaBR(r.data), r.titulo, r.por]),
        } : undefined,
      },
    ],
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: 'Esta folha vale na data em que foi emitida. O que manda é o sistema: um '
      + 'combinado encerrado depois desta impressão continua encerrado, e o papel não sabe '
      + 'disso.',
  };
}
