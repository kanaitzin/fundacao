/**
 * O RANKING DAS CASAS E DA EQUIPE (fase 323, pedido e decidido pelo dono em 14/11).
 *
 * Para a Coordenação Geral e o Gestor Geral: as casas em ordem pela organização
 * documental, pelo cuidado registrado e pelo uso do sistema, o gasto de cada uma, e as
 * pessoas de cada casa pelo que registraram. **Nunca uma criança**: o número da casa
 * soma o cuidado das crianças dela e não mostra nenhuma (§5 regra 3).
 *
 * ESTE ARQUIVO NÃO IMPORTA NADA, como o `alcance.ts`: o servidor e o protótipo leem a
 * MESMA conta. O banco (`app_ranking_das_casas`, reports/1727) devolve só contagens; a
 * porcentagem, a nota de cada grupo e a ordem saem daqui.
 */

/** Quem vê: o Gestor Geral e a Coordenação Geral (coordenação com as oito casas). */
export function veORanking(cargo: string | null | undefined, todasAsCasas?: boolean | null): boolean {
  return cargo === 'gestor_geral' || (cargo === 'coordenador' && !!todasAsCasas);
}

export const FRASE_QUEM_VE_O_RANKING =
  'O ranking das casas é da Coordenação Geral e do Gestor Geral.';

/** O aviso que vai com o número, sempre à vista. */
export const AVISO_DO_RANKING =
  'O ranking mede o que foi registrado, e não o cuidado. A casa com crianças que pedem mais '
  + 'pode registrar menos e cuidar mais. Ele serve para perguntar o que uma casa faz que as '
  + 'outras podem aprender, e nunca para julgar uma criança: nenhuma aparece aqui.';

/** A reavaliação ao Juízo é a cada três meses (ECA art. 19), a mesma do `reavaliacao.regra.ts`. */
export const RANKING_REAVALIACAO_MESES = 3;

/** O que o banco devolve de cada casa: só contagens. */
export interface ContagensDaCasa {
  houseId: string; codigo: string; nome: string;
  acolhidos: number; equipe: number;
  piaEmDia: number; reavaliacaoEmDia: number;
  comReceita: number; receitaEmDia: number; vacinaEmDia: number; dossieCompleto: number;
  atas: number; atasSemPendencia: number;
  doses: number; dosesNoHorario: number;
  chamadas: number; chamadasConfirmadas: number;
  frequenciaEsperada: number; frequenciaMarcada: number;
  atendimentos: number; visitas: number;
  registros: number; pessoasQueRegistraram: number;
  notasCentavos: number; notasSemValor: number;
}

export type GrupoDoRanking = 'documentos' | 'cuidado' | 'uso';

export const GRUPOS_DO_RANKING: { grupo: GrupoDoRanking; titulo: string; explica: string }[] = [
  { grupo: 'documentos', titulo: 'Organização documental',
    explica: 'PIA, reavaliação, receita e vacinação em dia, dossiê completo e ATAs fechadas sem pendência. O dossiê e as validades são os de hoje; as ATAs, as do período.' },
  { grupo: 'cuidado', titulo: 'Cuidado registrado',
    explica: 'Doses dadas no horário, chamadas confirmadas, frequência escolar marcada, e atendimentos técnicos e visitas por acolhido, no período.' },
  { grupo: 'uso', titulo: 'Uso do sistema',
    explica: 'Quantas pessoas da equipe registraram no período, e quantos registros por pessoa: linhas da ATA, doses, chamadas, frequência, atendimentos, visitas e ocorrências.' },
];

export interface Indicador {
  chave: string; grupo: GrupoDoRanking; titulo: string;
  /** Texto do número como a tela mostra: 8 de 10, ou 1,5 por acolhido. */
  texto: string;
  /** De 0 a 100; nulo quando não há o que medir (nenhuma ATA, nenhuma dose). */
  pontos: number | null;
}

const pct = (n: number, d: number) => (d > 0 ? Math.min(100, Math.round((n / d) * 100)) : null);
const decimal = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const de = (n: number, d: number) => `${n} de ${d}`;

/**
 * Os indicadores de uma casa. O que é por acolhido ou por pessoa (atendimentos, visitas,
 * registros) não tem 100 natural: vale 100 a casa que mais fez, e as outras em proporção.
 */
export function indicadoresDaCasa(c: ContagensDaCasa, todas: ContagensDaCasa[]): Indicador[] {
  const porAcolhido = (x: ContagensDaCasa, v: number) => (x.acolhidos > 0 ? v / x.acolhidos : 0);
  const porPessoa = (x: ContagensDaCasa) => (x.pessoasQueRegistraram > 0 ? x.registros / x.pessoasQueRegistraram : 0);
  const relativo = (v: number, f: (x: ContagensDaCasa) => number) => {
    const max = Math.max(0, ...todas.map(f));
    return max > 0 ? Math.round((v / max) * 100) : null;
  };
  const atend = porAcolhido(c, c.atendimentos);
  const visit = porAcolhido(c, c.visitas);
  const regPorPessoa = porPessoa(c);
  return [
    { chave: 'pia', grupo: 'documentos', titulo: 'PIA em dia', texto: de(c.piaEmDia, c.acolhidos), pontos: pct(c.piaEmDia, c.acolhidos) },
    { chave: 'reavaliacao', grupo: 'documentos', titulo: 'Reavaliação ao Juízo em dia', texto: de(c.reavaliacaoEmDia, c.acolhidos), pontos: pct(c.reavaliacaoEmDia, c.acolhidos) },
    { chave: 'receita', grupo: 'documentos', titulo: 'Receita em dia', texto: de(c.receitaEmDia, c.comReceita), pontos: pct(c.receitaEmDia, c.comReceita) },
    { chave: 'vacina', grupo: 'documentos', titulo: 'Vacinação em dia', texto: de(c.vacinaEmDia, c.acolhidos), pontos: pct(c.vacinaEmDia, c.acolhidos) },
    { chave: 'dossie', grupo: 'documentos', titulo: 'Dossiê completo', texto: de(c.dossieCompleto, c.acolhidos), pontos: pct(c.dossieCompleto, c.acolhidos) },
    { chave: 'atas', grupo: 'documentos', titulo: 'ATAs fechadas sem pendência', texto: de(c.atasSemPendencia, c.atas), pontos: pct(c.atasSemPendencia, c.atas) },
    { chave: 'doses', grupo: 'cuidado', titulo: 'Doses dadas no horário', texto: de(c.dosesNoHorario, c.doses), pontos: pct(c.dosesNoHorario, c.doses) },
    { chave: 'chamadas', grupo: 'cuidado', titulo: 'Chamadas confirmadas', texto: de(c.chamadasConfirmadas, c.chamadas), pontos: pct(c.chamadasConfirmadas, c.chamadas) },
    { chave: 'frequencia', grupo: 'cuidado', titulo: 'Frequência escolar marcada', texto: de(Math.min(c.frequenciaMarcada, c.frequenciaEsperada), c.frequenciaEsperada), pontos: pct(c.frequenciaMarcada, c.frequenciaEsperada) },
    { chave: 'atendimentos', grupo: 'cuidado', titulo: 'Atendimentos técnicos por acolhido', texto: decimal(atend), pontos: c.acolhidos > 0 ? relativo(atend, (x) => porAcolhido(x, x.atendimentos)) : null },
    { chave: 'visitas', grupo: 'cuidado', titulo: 'Visitas por acolhido', texto: decimal(visit), pontos: c.acolhidos > 0 ? relativo(visit, (x) => porAcolhido(x, x.visitas)) : null },
    { chave: 'equipe_registrando', grupo: 'uso', titulo: 'Pessoas da equipe que registraram', texto: de(Math.min(c.pessoasQueRegistraram, c.equipe), c.equipe), pontos: pct(c.pessoasQueRegistraram, c.equipe) },
    { chave: 'registros_por_pessoa', grupo: 'uso', titulo: 'Registros por pessoa que registrou', texto: decimal(regPorPessoa), pontos: c.pessoasQueRegistraram > 0 ? relativo(regPorPessoa, porPessoa) : null },
  ];
}

/** A nota do grupo: a média dos indicadores que têm o que medir. */
export function notaDoGrupo(ind: Indicador[], grupo: GrupoDoRanking): number | null {
  const v = ind.filter((i) => i.grupo === grupo && i.pontos != null).map((i) => i.pontos as number);
  return v.length ? Math.round(v.reduce((t, x) => t + x, 0) / v.length) : null;
}

export interface CasaNoRanking extends ContagensDaCasa {
  indicadores: Indicador[];
  notas: Record<GrupoDoRanking | 'geral', number | null>;
  gastoPorAcolhidoCentavos: number | null;
}

/** As casas com os indicadores e as notas. A nota geral é a média dos três grupos. */
export function montarRanking(casas: ContagensDaCasa[]): CasaNoRanking[] {
  return casas.map((c) => {
    const indicadores = indicadoresDaCasa(c, casas);
    const grupos = GRUPOS_DO_RANKING.map((g) => notaDoGrupo(indicadores, g.grupo));
    const comNota = grupos.filter((n): n is number => n != null);
    return {
      ...c, indicadores,
      notas: {
        documentos: grupos[0], cuidado: grupos[1], uso: grupos[2],
        geral: comNota.length ? Math.round(comNota.reduce((t, x) => t + x, 0) / comNota.length) : null,
      },
      gastoPorAcolhidoCentavos: c.acolhidos > 0 ? Math.round(c.notasCentavos / c.acolhidos) : null,
    };
  });
}

/** A ordem por um grupo: a maior nota em cima; sem nota, no fim; empate, pelo código. */
export function emOrdem(casas: CasaNoRanking[], por: GrupoDoRanking | 'geral'): CasaNoRanking[] {
  return casas.slice().sort((a, b) => {
    const x = a.notas[por], y = b.notas[por];
    if (x == null && y == null) return a.codigo.localeCompare(b.codigo);
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x || a.codigo.localeCompare(b.codigo);
  });
}

/** O gasto em ordem: o maior por acolhido em cima. Gasto não é nota: só a ordem. */
export function gastoEmOrdem(casas: CasaNoRanking[]): CasaNoRanking[] {
  return casas.slice().sort((a, b) => (b.gastoPorAcolhidoCentavos ?? -1) - (a.gastoPorAcolhidoCentavos ?? -1)
    || a.codigo.localeCompare(b.codigo));
}

/** O que cada pessoa registrou numa casa, por tipo. Nunca uma criança. */
export const TIPOS_DE_REGISTRO: { chave: string; titulo: string }[] = [
  { chave: 'ata', titulo: 'Linhas da ATA' },
  { chave: 'dose', titulo: 'Doses' },
  { chave: 'chamada', titulo: 'Chamadas confirmadas' },
  { chave: 'frequencia', titulo: 'Frequência escolar' },
  { chave: 'atendimento', titulo: 'Atendimentos técnicos' },
  { chave: 'visita', titulo: 'Visitas no portão' },
  { chave: 'ocorrencia', titulo: 'Ocorrências' },
];

export interface PessoaNoRanking {
  id: string; nome: string; cargo: string;
  porTipo: Record<string, number>;
  total: number;
}

/** As pessoas em ordem do total; empate pelo nome. */
export function pessoasEmOrdem(ps: PessoaNoRanking[]): PessoaNoRanking[] {
  return ps.slice().sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** O período mais longo: um ano, como o painel das casas. */
export const RANKING_JANELA_MAXIMA_DIAS = 366;
