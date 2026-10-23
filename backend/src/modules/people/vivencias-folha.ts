/**
 * O RELATÓRIO DAS VIVÊNCIAS EM WORD (fase 237, pedido de 23/10).
 *
 * *"Ontem tentei pedir um relatório da vivência de uma aluna em Word pela IA e
 * ela não soube fazer."* O álbum de vivências é da criança, e o relatório dele
 * vai para a audiência, para a família na hora do desligamento ou para a pasta
 * do PIA. Quem pede escolhe o que entra: o período, os tipos, quais vivências e
 * se vai com as fotos.
 *
 * AS FOTOS, CONFORME O CARGO (decisão de 23/10): a equipe técnica, os líderes,
 * a coordenação e a gestão incluem todas as fotos; os outros cargos incluem só as
 * que têm a autorização de imagem registrada, e a outra sai como legenda, com o
 * motivo. A tela explica o porquê; o papel só diz que a foto não foi reproduzida.
 *
 * Não importa nada além da folha: o servidor e o protótipo montam a MESMA.
 */
import { AutorDaFolha, Folha, FotoNaCelula, SecaoDaFolha, diaBR } from '../../kernel/documentos/folha';

/** Quem inclui todas as fotos no relatório, com ou sem autorização de imagem registrada. */
export const INCLUI_TODAS_AS_FOTOS = ['equipe_tecnica', 'lider_diurno', 'lider_noturno_geral', 'coordenador', 'gestor_geral'];

export const incluiTodasAsFotos = (cargo: string) => INCLUI_TODAS_AS_FOTOS.includes(cargo);

/** A foto entra no Word deste cargo? */
export const fotoEntra = (cargo: string, autorizada: boolean) => autorizada || incluiTodasAsFotos(cargo);

/** O que quem pede escolhe. Sem escolha, vai o álbum inteiro, com as fotos. */
export interface EscolhasDasVivencias {
  de?: string | null;
  ate?: string | null;
  tipos?: string[] | null;
  ids?: string[] | null;
  comFotos?: boolean;
}

export interface FotoDaVivencia {
  id: string;
  autorizada: boolean;
  /** Os bytes, só quando o arquivo vai ser gerado; a prévia da tela não carrega imagem. */
  foto: FotoNaCelula | null;
}

export interface VivenciaDaFolha {
  id: string;
  tipo: string;
  quando: string;
  descricao: string;
  registradoPor: string | null;
  fotos: FotoDaVivencia[];
}

export interface DadosDasVivencias {
  crianca: { nome: string; casa: string };
  itens: VivenciaDaFolha[];
  rotulos: Record<string, string>;
}

const dataValida = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

/** As vivências que as escolhas deixam entrar, da mais antiga para a mais nova. */
export function vivenciasEscolhidas(itens: VivenciaDaFolha[], e: EscolhasDasVivencias): VivenciaDaFolha[] {
  const de = dataValida(e.de);
  const ate = dataValida(e.ate);
  const tipos = e.tipos?.length ? new Set(e.tipos) : null;
  const ids = e.ids?.length ? new Set(e.ids) : null;
  return itens
    .filter((v) => (!de || String(v.quando).slice(0, 10) >= de) && (!ate || String(v.quando).slice(0, 10) <= ate))
    .filter((v) => !tipos || tipos.has(v.tipo))
    .filter((v) => !ids || ids.has(v.id))
    .sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
}

/** Quantas fotos ficam de fora por causa do cargo: o número que a tela mostra antes de gerar. */
export function fotosForaPeloCargo(itens: VivenciaDaFolha[], cargo: string): number {
  if (incluiTodasAsFotos(cargo)) return 0;
  return itens.reduce((n, v) => n + v.fotos.filter((f) => !f.autorizada).length, 0);
}

export function folhaDasVivencias(d: DadosDasVivencias, e: EscolhasDasVivencias, cargo: string, autor: AutorDaFolha): Folha {
  const itens = vivenciasEscolhidas(d.itens, e);
  const comFotos = e.comFotos !== false;
  let semAutorizacaoIncluidas = 0;
  const secoes: SecaoDaFolha[] = itens.map((v) => {
    const imagens = comFotos
      ? v.fotos.map((f, k) => {
          const entra = fotoEntra(cargo, f.autorizada);
          if (entra && !f.autorizada) semAutorizacaoIncluidas++;
          return entra
            ? { legenda: `Fotografia ${k + 1} de ${v.fotos.length}`, foto: f.foto }
            : { legenda: `Fotografia ${k + 1} de ${v.fotos.length}`, foto: null,
                semFoto: 'Fotografia não reproduzida: autorização de imagem não registrada' };
        })
      : [];
    return {
      titulo: `${diaBR(v.quando)} · ${d.rotulos[v.tipo] ?? v.tipo}`,
      paragrafos: [v.descricao],
      imagens,
      procedencia: v.registradoPor ? `Registrado por ${v.registradoPor}.` : undefined,
    };
  });
  if (!secoes.length) {
    secoes.push({ titulo: 'Vivências', paragrafos: ['Sem vivência registrada nas escolhas deste relatório.'] });
  }
  const periodo = dataValida(e.de) || dataValida(e.ate)
    ? `${dataValida(e.de) ? diaBR(dataValida(e.de)!) : 'o começo'} a ${dataValida(e.ate) ? diaBR(dataValida(e.ate)!) : 'hoje'}`
    : 'todo o acolhimento';
  const ressalvas = ['Registros do álbum de vivências da criança, na ordem em que aconteceram.'];
  if (semAutorizacaoIncluidas > 0) {
    ressalvas.push('Há fotografias sem autorização de imagem registrada: uso interno da equipe de acolhimento.');
  }
  return {
    titulo: 'Relatório das vivências',
    subtitulo: `${d.crianca.nome} · ${d.crianca.casa}`,
    identificacao: [
      { rotulo: 'Acolhido', valor: d.crianca.nome },
      { rotulo: 'Unidade', valor: d.crianca.casa },
      { rotulo: 'Período', valor: periodo },
      { rotulo: 'Vivências', valor: `${itens.length}` },
    ],
    secoes,
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: ressalvas.join(' '),
  };
}
