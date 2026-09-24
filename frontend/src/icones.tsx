/**
 * OS ÍCONES DA NAVEGAÇÃO — desenhados, e não emoji (fase 150).
 *
 * POR QUE OS EMOJI SAÍRAM, e não é gosto:
 *
 *  * **cada sistema desenha o seu.** O 🧒 é um rosto no Android, outro no
 *    Windows e outro no iPhone da educadora; o 🗓️ aparecia em três telas com
 *    três desenhos diferentes. Um sistema cuja barra muda de cara conforme o
 *    aparelho não parece um sistema — parece um site improvisado;
 *  * **eles não herdam a cor.** Emoji é imagem colorida de fábrica: não escurece
 *    no tema claro, não clareia no escuro, e não acompanha o item ativo. Era por
 *    isso que a barra ficava com aquele ar de adesivo colado por cima;
 *  * **eles carregam significado que ninguém pediu.** O 🧒 diz "criança pequena"
 *    numa casa que acolhe adolescentes de dezessete anos, e o 🚨 grita numa tela
 *    que a equipe abre todo dia.
 *
 * Estes aqui são traço, em `currentColor`: pegam a tinta de onde estão, ficam
 * iguais em qualquer aparelho e não pesam nada — não há arquivo para buscar, e
 * a entrega continua sendo um HTML só que abre sem internet (§10.10).
 *
 * ACESSIBILIDADE: todo ícone é `aria-hidden`. Ele **nunca** é o único portador
 * do significado — ao lado dele há sempre a palavra escrita, e é a palavra que
 * o leitor de tela anuncia. Ícone que precisa ser explicado é ícone que falhou.
 */

/** O traço é um só para todos: mudar aqui muda a família inteira. */
const TRACO = {
  width: 20, height: 20, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true, focusable: false as const,
};

/** O desenho de cada um, só o `d` dos caminhos — o resto é igual. */
const DESENHOS: Record<string, string[]> = {
  /* ---- as cinco do turno ---- */
  painel_numeros: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  dia:      ['M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z',
             'M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2',
             'M8 12h8', 'M8 16h5'],
  chamada:  ['M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', 'M8.5 12.5l2.5 2.5 4.5-5'],
  acolhidos:['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
             'M2.5 20a6.5 6.5 0 0 1 13 0',
             'M16.5 11.5a3 3 0 1 0 0-6', 'M17 14.5a5.5 5.5 0 0 1 4.5 5.5'],
  passagem: ['M4 8h13', 'M14 5l3 3-3 3', 'M20 16H7', 'M10 13l-3 3 3 3'],

  /* ---- as portas do "Mais" ---- */
  linha_do_dia: ['M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', 'M12 7v5l3.5 2'],
  bussola:  ['M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', 'M15 9l-2 4-4 2 2-4 4-2z'],
  agenda:   ['M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
             'M4 10h16', 'M8 3v4', 'M16 3v4'],
  rotina:   ['M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', 'M12 7.5V12l3 1.5',
             'M12 3V1.8', 'M12 22.2V21'],
  escala:   ['M3 6h18v14H3z', 'M3 11h18', 'M9 11v9', 'M15 11v9'],
  equipe:   ['M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2 20a6.5 6.5 0 0 1 13 0',
             'M16 5.5a3 3 0 0 1 0 6', 'M17 14.5a5.5 5.5 0 0 1 5 5.5'],
  trabalho: ['M4 5h16', 'M4 12h16', 'M4 19h10',
             'M2.5 5h.01', 'M2.5 12h.01', 'M2.5 19h.01'],
  periodo:  ['M4 12h16', 'M4 8v8', 'M20 8v8', 'M9 12h.01', 'M15 12h.01'],
  cozinha:  ['M6 3v8a2 2 0 0 0 4 0V3', 'M8 11v10',
             'M17 3c-1.5 1.2-2 3-2 5s.5 3 2 3 2-1 2-3-.5-3.8-2-5z', 'M17 11v10'],
  olho:     ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z',
             'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  portaria: ['M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17', 'M4 21h16', 'M14.5 12.5h.01'],
  setores:  ['M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z', 'M20.5 20.5L16 16'],
  ocorrencias:['M10.3 3.9L2.5 17.5A1.8 1.8 0 0 0 4 20.2h16a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a2 2 0 0 0-3.4 0z',
             'M12 9.5v4', 'M12 17h.01'],
  ata:      ['M5 4.5A2 2 0 0 1 7 3h12v18H7a2 2 0 0 1-2-2V4.5z', 'M5 17.5h14', 'M9 8h6'],
  impacto:  ['M12 20c0-5 3-9 8-9 0 5-3 9-8 9z', 'M12 20c0-4-2.5-7.5-7-7.5 0 4 2.5 7.5 7 7.5z',
             'M12 20v-4'],
  internacao:['M4 21V8l8-5 8 5v13', 'M3 21h18', 'M12 10v6', 'M9 13h6'],
  saude:    ['M6 3v5a4 4 0 0 0 8 0V3', 'M10 12v2a5 5 0 0 0 5 5', 'M18 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  alinhamentos:['M4 5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-5 4V5z', 'M8 9.5h6'],
  acompanhamentos:['M7 3h7l5 5v9a3 3 0 0 1-3 3H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
             'M14 3v5h5', 'M9 13h6', 'M9 17h4'],
  unidades: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  sincronizacao:['M20 12a8 8 0 0 1-13.7 5.6', 'M4 12a8 8 0 0 1 13.7-5.6',
             'M4 18.5V13h5.5', 'M20 5.5V11h-5.5'],
  arquivo:  ['M3 6.5h18V10H3z', 'M4.5 10v9a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-9', 'M10 14h4'],
  transferencias:['M3 20v-7l5-3.5 5 3.5v7', 'M13 20v-5l4-2.5 4 2.5V20', 'M2 20h20'],
  cofre:    ['M7 10V7.5a5 5 0 0 1 10 0V10', 'M5.5 10h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z',
             'M12 14v2.5'],
  casas:    ['M3 11l9-7 9 7', 'M5.5 9.5V20h13V9.5', 'M10 20v-5h4v5'],
  mais:     ['M5.5 12h.01', 'M12 12h.01', 'M18.5 12h.01'],

  /* ---- os controles da barra do topo ---- */
  tema:     ['M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', 'M12 3v18', 'M12 8a4 4 0 0 1 0 8'],
  sino:     ['M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9z', 'M13.7 20a2 2 0 0 1-3.4 0'],
  chave:    ['M15.5 4a4.5 4.5 0 1 1-4.3 5.9L4 17.1V20h3v-2h2v-2h2l1.1-1.1A4.5 4.5 0 0 1 15.5 4z',
             'M16.8 8.2h.01'],
  com_sinal:['M4 20V13', 'M9.3 20V9', 'M14.7 20V6', 'M20 20V3'],
  sem_sinal:['M4 20V13', 'M9.3 20V9', 'M14.7 20V6', 'M20 20V3', 'M3 3l18 18'],
  olhar:    ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z',
             'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],

  /* ---- as categorias da linha do dia ---- */
  cama:     ['M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7', 'M3 14h18', 'M3 18v2', 'M21 18v2',
             'M7.5 9V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2'],
  refeicao: ['M6 3v8a2 2 0 0 0 4 0V3', 'M8 11v10',
             'M17 3c-1.5 1.2-2 3-2 5s.5 3 2 3 2-1 2-3-.5-3.8-2-5z', 'M17 11v10'],
  atividade:['M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', 'M12 16.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z',
             'M12 13.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z'],
  saida:    ['M4 16V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9', 'M3 16h18', 'M6.5 19.5h.01',
             'M17.5 19.5h.01', 'M7 9h10'],
  medicamento:['M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7z', 'M12 7v10'],
  saude_ic: ['M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z'],
  alerta:   ['M10.3 3.9L2.5 17.5A1.8 1.8 0 0 0 4 20.2h16a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a2 2 0 0 0-3.4 0z',
             'M12 9.5v4', 'M12 17h.01'],
  ponto:    ['M12 14.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z'],

  /* ---- os das telas de dentro (fase 151) ---- */
  documento:['M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M14 3v5h5',
             'M9 13h6', 'M9 17h4'],
  certificado:['M6 3h12a1 1 0 0 1 1 1v13H6a2 2 0 0 0-2 2V5a2 2 0 0 1 2-2z',
             'M19 17v2a2 2 0 0 1-2 2H6', 'M9 8h7'],
  nota:     ['M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z', 'M9 8h6', 'M9 12h6'],
  cadeado:  ['M8 10V7.5a4 4 0 0 1 8 0V10',
             'M6.5 10h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z',
             'M12 14v2.5'],
  conquista:['M12 3l2.3 5 5.2.6-3.9 3.6 1.1 5.3L12 15l-4.7 2.5 1.1-5.3L4.5 8.6 9.7 8z'],
  conferido:['M4.5 12.5l5 5 10-11'],
  escrever: ['M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16z', 'M13.5 6.5l4 4'],
  anexo:    ['M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3l8-8'],
  enviar:   ['M21 3L10.5 13.5', 'M21 3l-7 18-3.5-7.5L3 10z'],
  livros:   ['M5 4h4v16H5z', 'M9 4h4v16H9z', 'M14.2 4.6l3.8 1-3.2 15.2-3.8-1z'],
  formatura:['M2.5 9L12 4.5 21.5 9 12 13.5z', 'M6.5 11v5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-5'],
  ferramenta:['M14.5 4.5a4.5 4.5 0 0 0 5.6 5.9L21 11l-9 9-3-3 9-9z', 'M6 14l-3 3 3 3 3-3'],
  instituicao:['M3 10l9-6 9 6', 'M5 10v8', 'M9.5 10v8', 'M14.5 10v8', 'M19 10v8', 'M3 21h18'],
  maleta:   ['M4 8h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z',
             'M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2', 'M3 13h18'],
  identidade:['M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
             'M8.5 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M5.5 16a3.5 3.5 0 0 1 6 0', 'M14.5 10h4', 'M14.5 14h4'],
  bola:     ['M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', 'M12 8l3.4 2.5-1.3 4h-4.2l-1.3-4z',
             'M12 3v5', 'M21 10.5l-5.6 0', 'M8.6 10.5L3 10.5', 'M9.9 14.5L7 19.8', 'M14.1 14.5L17 19.8'],
  pasta:    ['M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  foto:     ['M3 8.5h3.5L8 6h8l1.5 2.5H21a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z',
             'M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z'],
  imprimir: ['M7 9V4h10v5', 'M5 9h14a2 2 0 0 1 2 2v5h-4', 'M7 16H3v-5a2 2 0 0 1 2-2',
             'M7 14h10v7H7z'],
  lanche:   ['M3 10.5c0-3 4-5.5 9-5.5s9 2.5 9 5.5', 'M2.5 10.5h19', 'M4 14h16',
             'M4.5 17.5h15a0 0 0 0 1 0 0 1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4.5 17.5z'],
  cesta:    ['M3 9h18l-1.8 9.5a2 2 0 0 1-2 1.5H6.8a2 2 0 0 1-2-1.5z',
             'M8.5 4L6.5 9', 'M15.5 4l2 5', 'M9.5 13v3', 'M14.5 13v3'],
  banco:    ['M3 10l9-6 9 6', 'M5 10v8', 'M9.5 10v8', 'M14.5 10v8', 'M19 10v8', 'M3 21h18',
             'M3 10h18'],
  baixar:   ['M12 3.5v11', 'M7.5 10.5L12 15l4.5-4.5', 'M4 19.5h16'],
  pessoa:   ['M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 20.5a8 8 0 0 1 16 0'],
  telefone: ['M6 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 5.7 2 2 0 0 1 6 3.5z'],
  mao:      ['M8 11V5.5a1.5 1.5 0 0 1 3 0V11', 'M11 10.5v-6a1.5 1.5 0 0 1 3 0V11',
             'M14 11V6.5a1.5 1.5 0 0 1 3 0V13', 'M8 11V9a1.5 1.5 0 0 0-3 0v5a7 7 0 0 0 7 7h1a6 6 0 0 0 6-6v-2'],
};

export type NomeDoIcone = keyof typeof DESENHOS;

/**
 * O ícone. `nome` desconhecido devolve NADA — e é de propósito: um ícone que
 * falta some, a palavra ao lado continua lá, e a tela não quebra por causa de
 * um desenho. O conferidor é que cobra que a tabela de portas não tenha nome
 * sem desenho (`icones-das-portas.spec.ts`).
 */
export function Icone({ nome, tamanho }: { nome: string; tamanho?: number }) {
  const d = DESENHOS[nome];
  if (!d) return null;
  return (
    <svg {...TRACO} width={tamanho ?? TRACO.width} height={tamanho ?? TRACO.height}
         className="icone">
      {d.map((caminho, i) => <path key={i} d={caminho} />)}
    </svg>
  );
}

/** Os nomes que existem — para o conferidor, e para quem escrever porta nova. */
export const ICONES = Object.keys(DESENHOS);
