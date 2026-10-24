/**
 * O BANCO DE PALAVRAS DA CASA (fase 238, pedido de 23/10: "cadastre um banco de
 * palavras para ela poder entender as conversas com as pessoas").
 *
 * É o jeito de falar do plantão em Porto Alegre: a gíria gaúcha, as siglas da rede
 * de proteção e os outros nomes das coisas da casa. Cada linha diz as formas que a
 * equipe usa e o que elas querem dizer, numa forma que a Acolhe+AI já entende.
 *
 * As duas pontas leem esta mesma lista: o modo próprio da Acolhe+AI (`acolhe-guia.ts`)
 * acrescenta ao pedido o que as palavras querem dizer, sem apagar o que a pessoa
 * escreveu; e o modelo, quando houver, recebe o glossário nas instruções fixas.
 * Palavra nova entra aqui, com teste em `a-acolhe-conhece-o-sistema.spec.ts`.
 *
 * Tudo sem acento e em minúsculas: o texto chega assim depois da normalização.
 */

export interface PalavraDaCasa {
  /** As formas que a equipe usa. */
  diz: string[];
  /** O que querem dizer, na forma que a Acolhe+AI entende. */
  querDizer: string;
  /** Quando o texto tem alguma destas, a palavra quer dizer outra coisa e não se traduz. */
  menosQuando?: string[];
}

export const PALAVRAS_DA_CASA: PalavraDaCasa[] = [
  // Quem é quem
  { diz: ['pia', 'pias', 'guri', 'guris', 'gurizinho', 'moleque', 'menor'], querDizer: 'crianca menino',
    menosQuando: ['pia da cozinha', 'pia do banheiro', 'pia da lavanderia', 'torneira', 'vazou', 'vazando', 'entupiu', 'entupida'] },
  { diz: ['guria', 'gurias', 'gurizinha', 'menina'], querDizer: 'crianca menina' },
  { diz: ['nene', 'nenem', 'bebe'], querDizer: 'crianca bebe' },
  { diz: ['vo', 'voh', 'vovo', 'vozinha'], querDizer: 'avo familiar' },
  { diz: ['prof', 'profe', 'sora'], querDizer: 'professora da escola' },
  // O corpo e a saúde
  { diz: ['piripaque', 'treco', 'mal estar', 'mal-estar', 'ruim do estomago', 'enjoada', 'enjoado', 'enjoo'], querDizer: 'passando mal' },
  { diz: ['febrao', 'ardendo em febre', 'quentinho', 'quentinha', 'pelando'], querDizer: 'febre' },
  { diz: ['golfou', 'golfando', 'botou pra fora', 'gomitou', 'gomitando'], querDizer: 'vomitou' },
  { diz: ['caganeira', 'dor de barriga', 'soltura'], querDizer: 'diarreia' },
  { diz: ['apagou', 'caiu duro', 'caiu dura', 'ficou mole e nao responde'], querDizer: 'desmaiou' },
  { diz: ['se cortou', 'se riscou', 'se machucou de proposito'], querDizer: 'automutilacao' },
  { diz: ['bombinha', 'remedio da asma'], querDizer: 'remedio inalatorio' },
  { diz: ['gotinha', 'xarope', 'comprimido', 'capsula', 'medicacao', 'medicamento'], querDizer: 'remedio dose' },
  // A saída sem autorização
  { diz: ['se mandou', 'meteu o pe', 'deu no pe', 'picou a mula', 'se escafedeu', 'fugiu de casa'], querDizer: 'fugiu' },
  // O comportamento e a emoção
  { diz: ['se desorganizou', 'desorganizou', 'deu crise', 'deu um piti', 'piti', 'chilique', 'barraco', 'quebrou tudo', 'se atirou no chao'], querDizer: 'crise descontrolado' },
  { diz: ['berreiro', 'aos prantos', 'chorao', 'chorona', 'chorando muito'], querDizer: 'chorando' },
  { diz: ['brigaram', 'se pegaram', 'saiu no tapa', 'sairam no tapa', 'se bateram', 'deu porrada'], querDizer: 'briga entre criancas ocorrencia' },
  // A rotina da casa
  { diz: ['livro do plantao', 'caderno do plantao', 'caderno de ocorrencias', 'livro da casa'], querDizer: 'ata' },
  { diz: ['passar o plantao', 'virada do plantao', 'troca de turno', 'troca de plantao'], querDizer: 'passagem de plantao' },
  { diz: ['as fotos dela', 'as fotos dele', 'album', 'memorias', 'momentos'], querDizer: 'vivencias' },
  { diz: ['papel', 'papelada', 'xerox', 'certidao', 'oficio'], querDizer: 'documento' },
  // As siglas da rede de proteção
  /* Sem acento, a sigla PIA e o piá (menino) viram a mesma palavra: no texto vale o
     piá, e a sigla fica só no glossário do modelo, que lê pelo contexto. */
  { diz: ['PIA, a sigla, quando se fala de plano ou prazo'], querDizer: 'plano individual de atendimento da crianca' },
  { diz: ['ct', 'conselho tutelar', 'conselheira', 'conselheiro'], querDizer: 'conselho tutelar' },
  { diz: ['cras'], querDizer: 'centro de referencia de assistencia social' },
  { diz: ['creas'], querDizer: 'centro de referencia especializado de assistencia social' },
  { diz: ['caps', 'capsi', 'caps i'], querDizer: 'centro de atencao psicossocial, saude mental' },
  { diz: ['ubs', 'postinho', 'posto de saude'], querDizer: 'unidade basica de saude' },
  { diz: ['samu'], querDizer: 'emergencia de saude, telefone 192' },
  { diz: ['mp', 'promotoria', 'promotor', 'promotora'], querDizer: 'ministerio publico' },
  { diz: ['juizado', 'vara', 'juiz', 'juiza', 'forum', 'audiencia'], querDizer: 'judiciario' },
  { diz: ['eca'], querDizer: 'estatuto da crianca e do adolescente' },
  { diz: ['cns', 'cartao do sus', 'cartaozinho do sus'], querDizer: 'cartao sus' },
  // FIM DA LISTA
];

const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** As palavras que a equipe ensinou e a coordenação aprovou (fase 244), na forma da lista. */
export function palavrasEnsinadas(ensinadas: readonly { diz: string; querDizer: string }[]): PalavraDaCasa[] {
  return ensinadas.filter((p) => semAcento(p.diz).length >= 2)
    .map((p) => ({ diz: [semAcento(p.diz)], querDizer: semAcento(p.querDizer) }));
}

/** Acrescenta ao texto (já sem acento e em minúsculas) o que as palavras da casa querem dizer. */
export function traduzirPalavrasDaCasa(t: string, ensinadas: readonly PalavraDaCasa[] = []): string {
  const extras: string[] = [];
  for (const p of [...PALAVRAS_DA_CASA, ...ensinadas]) {
    if (p.menosQuando?.some((m) => t.includes(m))) continue;
    if (p.diz.some((d) => new RegExp(`(^|[^a-z])${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(t))) {
      extras.push(p.querDizer);
    }
  }
  return extras.length ? `${t} ${extras.join(' ')}` : t;
}

/** O glossário que vai nas instruções fixas do modelo, gerado da mesma lista. */
export const GLOSSARIO_DA_CASA = PALAVRAS_DA_CASA
  .map((p) => `${p.diz.join(', ')}: ${p.querDizer}`)
  .join('\n');
