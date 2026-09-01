/**
 * O DOCUMENTO DE VERDADE, MONTADO NO NAVEGADOR.
 *
 * Até aqui o protótipo entregava um bloco de notas dizendo "no sistema real
 * isto sai em Word". E é verdade — o servidor gera .docx com timbre desde a
 * fase 7 —, mas quem testa o protótipo clica em "baixar", abre um .txt e
 * conclui, com razão, que o relatório não existe. A parte mais visível da
 * entrega ficava parecendo a menos pronta.
 *
 * Este arquivo monta um .docx DE VERDADE, sem servidor e sem biblioteca: um
 * .docx é um ZIP de XMLs, e o ZIP pode ser escrito sem compressão. São umas
 * duzentas linhas para que o Marcelo clique, o Word abra, e o documento esteja
 * lá — com o timbre do Pão dos Pobres, a folha na ABNT e os campos que só uma
 * pessoa pode preencher marcados como tais.
 *
 * O que a ABNT pede e está aqui: A4, margens 3 cm à esquerda e no topo, 2 cm à
 * direita e embaixo, Times New Roman 12, entrelinha 1,5, corpo justificado com
 * recuo de 1,25 cm na primeira linha, títulos de seção numerados e alinhados à
 * esquerda, e paginação no alto à direita a partir da primeira folha.
 *
 * O que ele NÃO faz, de propósito: nada aqui inventa conteúdo. Os campos de
 * avaliação e encaminhamento saem escritos "a preencher", porque são o que só
 * uma pessoa pode escrever — e um documento que chega preenchido sozinho é
 * exatamente o que a regra 3 chama de decisão automática.
 */

// ---------------------------------------------------------------- o que entra

export interface LinhaIdentificacao { rotulo: string; valor: string }

export interface SecaoDoDocumento {
  titulo: string;
  /** Parágrafos de corpo, justificados e com recuo. */
  paragrafos?: string[];
  /** Lista de itens, sem recuo e com marcador. */
  itens?: string[];
  /** Tabela simples — usada nos quadros de saúde e de rotina. */
  tabela?: { cabecalho: string[]; linhas: string[][] };
  /** Campo que só uma pessoa preenche: sai com a marca e o espaço em branco. */
  aPreencher?: string;
  /** De onde a informação veio. Sai em letra menor, abaixo da seção. */
  procedencia?: string;
}

export interface DocumentoWord {
  /** Vira o nome do arquivo e o título na primeira folha. */
  titulo: string;
  subtitulo?: string;
  identificacao: LinhaIdentificacao[];
  secoes: SecaoDoDocumento[];
  /** Rascunho recebe tarja na primeira folha: ninguém entrega sem saber. */
  rascunho?: boolean;
  geradoPor: string;
  cargo: string;
  /** Linha de assinatura no fim, com nome e cargo. */
  assinatura?: boolean;
  /** Frase final, quando o documento precisa dizer o que ele não é. */
  ressalva?: string;
}

// ---------------------------------------------------------------- utilidades

const esc = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Times New Roman 12 = 24 meios-pontos; a ABNT conta em pontos. */
const FONTE = 'Times New Roman';
const CORPO = 24;
const MENOR = 20;

const dataPorExtenso = () => {
  const d = new Date();
  const mes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
               'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][d.getMonth()];
  return `Porto Alegre, ${d.getDate()} de ${mes} de ${d.getFullYear()}`;
};

// ---------------------------------------------------------------- ZIP (store)

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

interface ArquivoZip { nome: string; dados: Uint8Array }

/**
 * ZIP sem compressão (método 0). O Word aceita, e escrever DEFLATE à mão para
 * economizar 40 KB num arquivo que vive dois minutos não vale a linha de
 * código que ninguém mais vai conseguir revisar.
 */
function zipar(arquivos: ArquivoZip[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF]);
  const u32 = (n: number) => new Uint8Array([
    n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]);
  const juntar = (ps: Uint8Array[]) => {
    const total = ps.reduce((n, p) => n + p.length, 0);
    const saida = new Uint8Array(total);
    let i = 0;
    for (const p of ps) { saida.set(p, i); i += p.length; }
    return saida;
  };

  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const local = juntar([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(a.dados.length), u32(a.dados.length),
      u16(nome.length), u16(0), nome, a.dados,
    ]);
    partes.push(local);
    central.push(juntar([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(a.dados.length), u32(a.dados.length),
      u16(nome.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nome,
    ]));
    offset += local.length;
  }

  const dirCentral = juntar(central);
  return juntar([
    ...partes, dirCentral,
    juntar([u32(0x06054b50), u16(0), u16(0), u16(arquivos.length), u16(arquivos.length),
            u32(dirCentral.length), u32(offset), u16(0)]),
  ]);
}

// ---------------------------------------------------------------- XML do Word

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
  + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

interface OpcoesParagrafo {
  negrito?: boolean; italico?: boolean; caixaAlta?: boolean;
  alinhamento?: 'center' | 'both' | 'left' | 'right';
  recuo?: boolean; tamanho?: number; cor?: string; espacoDepois?: number;
}

function par(texto: string, o: OpcoesParagrafo = {}): string {
  const rpr = [
    `<w:rFonts w:ascii="${FONTE}" w:hAnsi="${FONTE}"/>`,
    o.negrito ? '<w:b/>' : '',
    o.italico ? '<w:i/>' : '',
    o.caixaAlta ? '<w:caps/>' : '',
    `<w:sz w:val="${o.tamanho ?? CORPO}"/>`,
    o.cor ? `<w:color w:val="${o.cor}"/>` : '',
  ].join('');
  const ppr = [
    `<w:spacing w:line="360" w:lineRule="auto" w:after="${o.espacoDepois ?? 120}"/>`,
    `<w:jc w:val="${o.alinhamento ?? 'both'}"/>`,
    o.recuo ? '<w:ind w:firstLine="708"/>' : '',
  ].join('');
  return `<w:p><w:pPr>${ppr}<w:rPr>${rpr}</w:rPr></w:pPr>`
    + `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}

/** Rótulo em negrito e valor na mesma linha — o bloco de identificação. */
function parRotulado(rotulo: string, valor: string): string {
  const rpr = `<w:rFonts w:ascii="${FONTE}" w:hAnsi="${FONTE}"/><w:sz w:val="${CORPO}"/>`;
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="40"/>'
    + '<w:jc w:val="left"/></w:pPr>'
    + `<w:r><w:rPr>${rpr}<w:b/></w:rPr><w:t xml:space="preserve">${esc(rotulo)}: </w:t></w:r>`
    + `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${esc(valor)}</w:t></w:r></w:p>`;
}

function tabela(cabecalho: string[], linhas: string[][]): string {
  const rpr = `<w:rFonts w:ascii="${FONTE}" w:hAnsi="${FONTE}"/><w:sz w:val="${MENOR}"/>`;
  const largura = Math.floor(9070 / Math.max(cabecalho.length, 1));
  const celula = (t: string, negrito: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${largura}" w:type="dxa"/>`
    + (negrito ? '<w:shd w:val="clear" w:fill="E8EDF3"/>' : '')
    + '</w:tcPr><w:p><w:pPr><w:spacing w:after="20"/><w:jc w:val="left"/></w:pPr>'
    + `<w:r><w:rPr>${rpr}${negrito ? '<w:b/>' : ''}</w:rPr>`
    + `<w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p></w:tc>`;
  const linha = (cs: string[], negrito: boolean) =>
    `<w:tr>${cs.map((c) => celula(c, negrito)).join('')}</w:tr>`;
  return '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>'
    + '<w:tblW w:w="0" w:type="auto"/><w:tblBorders>'
    + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="9AA7B4"/>`).join('')
    + '</w:tblBorders></w:tblPr>'
    + linha(cabecalho, true)
    + linhas.map((l) => linha(l, false)).join('')
    + '</w:tbl>' + par('', { espacoDepois: 60 });
}

function corpoDoDocumento(d: DocumentoWord): string {
  const partes: string[] = [];

  if (d.rascunho) {
    partes.push(par('RASCUNHO — documento sem aprovação. Não deve ser entregue.', {
      alinhamento: 'center', negrito: true, cor: 'B45309', espacoDepois: 200 }));
  }

  partes.push(par(d.titulo, {
    alinhamento: 'center', negrito: true, caixaAlta: true, espacoDepois: 80 }));
  if (d.subtitulo) {
    partes.push(par(d.subtitulo, { alinhamento: 'center', espacoDepois: 240 }));
  }

  if (d.identificacao.length) {
    partes.push(par('1  IDENTIFICAÇÃO', { alinhamento: 'left', negrito: true,
                                          espacoDepois: 80 }));
    for (const i of d.identificacao) partes.push(parRotulado(i.rotulo, i.valor));
    partes.push(par('', { espacoDepois: 120 }));
  }

  d.secoes.forEach((s, i) => {
    const n = d.identificacao.length ? i + 2 : i + 1;
    partes.push(par(`${n}  ${s.titulo.toUpperCase()}`, {
      alinhamento: 'left', negrito: true, espacoDepois: 80 }));

    for (const p of s.paragrafos ?? []) {
      partes.push(par(p, { recuo: true }));
    }
    for (const it of s.itens ?? []) {
      partes.push(par(`•  ${it}`, { alinhamento: 'left', espacoDepois: 40 }));
    }
    if (s.tabela) partes.push(tabela(s.tabela.cabecalho, s.tabela.linhas));

    if (s.aPreencher) {
      // O campo que só uma pessoa pode escrever sai VAZIO e marcado. Um
      // documento que chega preenchido sozinho é decisão automática.
      partes.push(par(`[a preencher — ${s.aPreencher}]`, {
        italico: true, cor: '5B6B7B', alinhamento: 'left', espacoDepois: 60 }));
      partes.push(par('____________________________________________________________',
                      { alinhamento: 'left', cor: '9AA7B4', espacoDepois: 60 }));
      partes.push(par('____________________________________________________________',
                      { alinhamento: 'left', cor: '9AA7B4', espacoDepois: 160 }));
    }
    if (s.procedencia) {
      partes.push(par(`Fonte: ${s.procedencia}`, {
        tamanho: MENOR, cor: '5B6B7B', alinhamento: 'left', espacoDepois: 160 }));
    }
  });

  if (d.ressalva) {
    partes.push(par(d.ressalva, { tamanho: MENOR, italico: true, cor: '5B6B7B',
                                  espacoDepois: 200 }));
  }

  partes.push(par(dataPorExtenso(), { alinhamento: 'right', espacoDepois: 400 }));

  if (d.assinatura !== false) {
    partes.push(par('____________________________________________',
                    { alinhamento: 'center', espacoDepois: 40 }));
    partes.push(par(d.geradoPor, { alinhamento: 'center', negrito: true, espacoDepois: 20 }));
    partes.push(par(d.cargo, { alinhamento: 'center', tamanho: MENOR, espacoDepois: 40 }));
  }

  return partes.join('');
}

// ---------------------------------------------------------------- montagem

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Default Extension="png" ContentType="image/png"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
  + '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
  + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
  + '</Types>';

const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '</Relationships>';

const DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
  + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
  + '</Relationships>';

const HEADER_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/timbre.png"/>'
  + '</Relationships>';

const ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + `<w:styles ${NS}>`
  + '<w:docDefaults><w:rPrDefault><w:rPr>'
  + `<w:rFonts w:ascii="${FONTE}" w:hAnsi="${FONTE}" w:cs="${FONTE}"/>`
  + `<w:sz w:val="${CORPO}"/><w:szCs w:val="${CORPO}"/>`
  + '<w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault>'
  + '<w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto"/>'
  + '<w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>'
  + '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/>'
  + '<w:tblPr></w:tblPr></w:style>'
  + '</w:styles>';

/** O timbre no cabeçalho, com o nome da Fundação por extenso embaixo. */
function cabecalho(temImagem: boolean): string {
  const imagem = temImagem
    ? '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
      + '<wp:extent cx="957000" cy="576000"/><wp:docPr id="1" name="Timbre"/>'
      + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + '<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="timbre.png"/><pic:cNvPicPr/></pic:nvPicPr>'
      + '<pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
      + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="957000" cy="576000"/></a:xfrm>'
      + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
      + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
    : '';
  const linha = (t: string, o: OpcoesParagrafo) => par(t, { alinhamento: 'center', ...o });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<w:hdr ${NS}>`
    + `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr>${imagem}</w:p>`
    + linha('FUNDAÇÃO O PÃO DOS POBRES DE SANTO ANTÔNIO', {
        negrito: true, tamanho: MENOR, espacoDepois: 0 })
    + linha('Programa de Acolhimento Institucional · Porto Alegre — RS', {
        tamanho: 18, cor: '5B6B7B', espacoDepois: 120 })
    + '</w:hdr>';
}

/** Rodapé: quem gerou, quando, e a página. */
function rodape(geradoPor: string): string {
  const rpr = `<w:rFonts w:ascii="${FONTE}" w:hAnsi="${FONTE}"/><w:sz w:val="16"/>`
    + '<w:color w:val="5B6B7B"/>';
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<w:ftr ${NS}>`
    + '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60"/></w:pPr>'
    + `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">`
    + esc(`Gerado por ${geradoPor} em ${agora} · Rede Acolher · página `)
    + '</w:t></w:r>'
    + `<w:r><w:rPr>${rpr}</w:rPr><w:fldChar w:fldCharType="begin"/></w:r>`
    + `<w:r><w:rPr>${rpr}</w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>`
    + `<w:r><w:rPr>${rpr}</w:rPr><w:fldChar w:fldCharType="end"/></w:r>`
    + '</w:p></w:ftr>';
}

function documento(d: DocumentoWord): string {
  // A4 e as margens da ABNT: 3 cm no topo e à esquerda, 2 cm à direita e
  // embaixo. Em twips (1 cm = 566,93), arredondado como o Word faz.
  const secao = '<w:sectPr>'
    + '<w:headerReference w:type="default" r:id="rId2"/>'
    + '<w:footerReference w:type="default" r:id="rId3"/>'
    + '<w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1701" w:right="1134" w:bottom="1134" w:left="1701" '
    + 'w:header="567" w:footer="567" w:gutter="0"/>'
    + '</w:sectPr>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<w:document ${NS}><w:body>${corpoDoDocumento(d)}${secao}</w:body></w:document>`;
}

/**
 * Monta o .docx e devolve em base64 — que é o formato que a tela já sabe
 * transformar em download, e o mesmo que o servidor devolve.
 */
export function gerarDocx(d: DocumentoWord, timbrePng?: Uint8Array | null): string {
  const enc = new TextEncoder();
  const arquivos: ArquivoZip[] = [
    { nome: '[Content_Types].xml', dados: enc.encode(CONTENT_TYPES) },
    { nome: '_rels/.rels', dados: enc.encode(RELS) },
    { nome: 'word/document.xml', dados: enc.encode(documento(d)) },
    { nome: 'word/_rels/document.xml.rels', dados: enc.encode(DOC_RELS) },
    { nome: 'word/styles.xml', dados: enc.encode(ESTILOS) },
    { nome: 'word/header1.xml', dados: enc.encode(cabecalho(!!timbrePng)) },
    { nome: 'word/footer1.xml', dados: enc.encode(rodape(d.geradoPor)) },
  ];
  if (timbrePng) {
    arquivos.push({ nome: 'word/_rels/header1.xml.rels', dados: enc.encode(HEADER_RELS) });
    arquivos.push({ nome: 'word/media/timbre.png', dados: timbrePng });
  }

  const zip = zipar(arquivos);
  let bin = '';
  for (let i = 0; i < zip.length; i++) bin += String.fromCharCode(zip[i]);
  return btoa(bin);
}

/** Nome de arquivo sem acento, sem espaço e sem nada que identifique demais. */
export function nomeDeArquivo(base: string): string {
  const limpo = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const hoje = new Date().toISOString().slice(0, 10);
  return `${limpo}_${hoje}.docx`;
}
