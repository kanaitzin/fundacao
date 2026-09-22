/**
 * ROTULOS DE CARGO.
 *
 * O nome do cargo aparecia escrito de três jeitos: "Líder Diurno" no chip da
 * barra, `lider_diurno` na lista de passagens e "lider_noturno_geral" na
 * equipe. O código do cargo é do banco; quem lê a tela lê o nome.
 *
 * Fica num arquivo só para que nenhuma tela precise importar a App — importar
 * a App de dentro de uma tela fecha um ciclo, e o ciclo quebra o empacotamento.
 */
export const ROTULO_CARGO: Record<string, string> = {
  gestor_geral: 'Gestor Geral',
  coordenador: 'Coordenação',
  equipe_tecnica: 'Equipe técnica',
  educador: 'Educador social',
  lider_diurno: 'Líder Diurno',
  lider_noturno_geral: 'Líder Noturno Geral',
  enfermagem: 'Enfermagem',
  cozinha: 'Cozinha',
};

/** O código cru só aparece quando o cargo é desconhecido — e aí ele é a pista. */
export const cargo = (code: string | null | undefined): string =>
  (code ? ROTULO_CARGO[code] ?? code : '—');

/**
 * A COR DE CADA AUTOR.
 *
 * Vive AQUI, e não na tela da ATA, desde a fase 123: a escala passou a pintar
 * a linha de cada pessoa com a MESMA cor, e uma segunda cópia deste hash
 * divergiria na primeira correção — a mesma educadora sairia de um tom na ATA
 * e de outro na escala, que é pior do que não ter cor nenhuma. É a lição do
 * mapa `VINCULO`, que já teve duas cópias e sete dos dez valores numa delas.
 *
 * Estável (sai do id, e não da ordem em que a pessoa escreveu) e limitada a
 * seis tons do próprio design system. Ela pinta a BORDA e a etiqueta do nome —
 * nunca o texto —, porque tinta sobre texto é onde o contraste quebra, e a ATA
 * é lida no corredor. Quem imprime em preto e branco continua sabendo quem
 * escreveu: o nome está escrito ao lado.
 */
export const TONS_DE_AUTOR = ['c-brand', 'c-move', 'c-ok', 'c-warn', 'c-info', 'c-other'];
/**
 * O tom do autor.
 *
 * Desde 09/09 a cor pode ser ESCOLHIDA pela coordenação, e aí ela não repete
 * na casa. Sem escolha, cai no hash de antes — que colide: dois educadores do
 * mesmo plantão podiam receber o mesmo tom, e a cor parava de distinguir
 * exatamente onde precisava. Ninguém percebia porque o NOME está escrito ao
 * lado; era a cor que deixava de ajudar.
 */
export function tomDoAutor(id: string, escolhida?: string | null): string {
  if (escolhida) return escolhida;
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) % 997;
  return TONS_DE_AUTOR[n % TONS_DE_AUTOR.length];
}

/* -------------------------------------------------------------------------- */
/* A DATA, NUM LUGAR SÓ (fase 135).                                            */
/* -------------------------------------------------------------------------- */
/**
 * O DIA, ESCRITO COMO A CASA LÊ — e por que isto virou função exportada.
 *
 * Esta conta estava escrita **nove vezes**, uma por tela, e o problema não era
 * a repetição: era que as cópias **não eram iguais**. Duas delas formatavam sem
 * `timeZone`, isto é, no fuso de QUEM ABRE a página — e uma delas montava o
 * meio-dia sem informar o deslocamento, o que dá no mesmo. Num navegador
 * configurado noutro fuso, a mesma data aparecia num dia diferente em telas
 * diferentes do mesmo sistema; e quem olhasse não desconfiaria, porque as duas
 * pareciam certas.
 *
 * É a lição do mapa `VINCULO` e do hash da cor de autor (fase 123): correção
 * numa cópia não alcança as outras, e a segunda cópia esquece a correção que a
 * primeira recebeu.
 *
 * O MEIO-DIA COM DESLOCAMENTO EXPLÍCITO é o miolo da função. Um dia puro
 * (`2026-09-21`) lido como data JavaScript nasce à meia-noite **UTC**, que em
 * Porto Alegre é 21h do dia ANTERIOR: a audiência do dia 21 apareceria como 20.
 * Ancorar no meio-dia da instituição põe a leitura longe das duas viradas.
 *
 * Aceita dia puro e instante completo: quem passa `created_at` não precisa
 * lembrar de cortar a string, e cortar errado era outra forma de perder o fuso.
 */
const NOMES_DO_DIA = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
const FUSO = 'America/Sao_Paulo';

function instanteDoDia(iso: string): Date {
  const texto = String(iso);
  /* Dez caracteres é dia puro; mais do que isso já é instante, e instante já
     traz o próprio fuso. */
  return new Date(texto.length <= 10 ? `${texto}T12:00:00-03:00` : texto);
}

/** `21/09/2026`. Devolve `—` para vazio e para data que não existe. */
export function dia(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = instanteDoDia(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { ...NOMES_DO_DIA, timeZone: FUSO });
}

/**
 * `21/09`, sem o ano — para a grade da escala, onde a semana inteira cabe numa
 * linha e o ano repetido sete vezes só rouba espaço.
 */
export function diaCurto(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = instanteDoDia(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR',
    { day: '2-digit', month: '2-digit', timeZone: FUSO });
}

/**
 * A HORA DE UMA FAIXA, como a tela e a folha a escrevem (fase 142).
 *
 * O `time` do Postgres chega "14:00:00", e o segundo não diz nada a ninguém num
 * portão. Mora aqui, e não em cada tela, pela razão de sempre: o helper de data
 * estava copiado em treze lugares e dois deles erravam o dia (fase 135).
 *
 * E o nome é este, e não `hhmm`, porque a tela dos Acolhidos JÁ TEM um `hhmm` —
 * que recebe um instante e formata a hora local, coisa diferente. Duas funções
 * com o mesmo nome e entradas diferentes é como um `new Date('14:00:00')` chega
 * à tela valendo "Invalid Date".
 */
export function horaSemSegundos(t: string | null | undefined): string {
  return String(t ?? '').slice(0, 5);
}
