#!/usr/bin/env node
/**
 * O ROTEIRO EM WORD — gerado do markdown, e não escrito à mão.
 *
 * O `docs/roteiro-marcelo.docx` era montado à mão. Em dois dias o markdown
 * ganhou três seções e uma pergunta, e o Word continuou o de 31/08 — que é
 * justamente o arquivo que alguém imprime e leva para a casa. Um documento
 * que envelhece calado é pior do que documento nenhum: quem o carrega acredita
 * estar com a versão certa.
 *
 * Agora ele nasce de `docs/roteiro-marcelo.md`. Mudou o roteiro, roda-se isto.
 *
 * O que o Word tem e o markdown não pode ter: **espaço para escrever à mão**.
 * Cada tarefa numerada recebe as três linhas que o próprio roteiro pede —
 * achou, quanto tempo, e a frase da pessoa. Ele é para ser preenchido em pé,
 * no aparelho da casa, e não lido numa tela.
 *
 * Uso: node scripts/roteiro-em-word.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  BorderStyle, Header, Footer, PageNumber, Table, TableRow, TableCell, WidthType,
  ShadingType, PageBreak,
} from 'docx';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = join(RAIZ, 'docs', 'roteiro-marcelo.md');
const SAIDA = join(RAIZ, 'docs', 'roteiro-marcelo.docx');

const AZUL = '1F3864';
const CINZA = '595959';
const CLARO = '808080';

const md = readFileSync(ENTRADA, 'utf8');

/**
 * Converte a ênfase do markdown em runs.
 *
 * Só negrito, itálico e `código` — o roteiro não usa mais nada, e um
 * conversor que tenta tudo erra no que importa.
 */
function runs(texto, base = {}) {
  const saida = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    if (m.index > ultimo) {
      saida.push(new TextRun({ text: limpar(texto.slice(ultimo, m.index)), ...base }));
    }
    const t = m[0];
    if (t.startsWith('**')) {
      saida.push(new TextRun({ text: limpar(t.slice(2, -2)), bold: true, ...base }));
    } else if (t.startsWith('`')) {
      saida.push(new TextRun({ text: t.slice(1, -1), font: 'Consolas', ...base }));
    } else {
      saida.push(new TextRun({ text: limpar(t.slice(1, -1)), italics: true, ...base }));
    }
    ultimo = m.index + t.length;
  }
  if (ultimo < texto.length) {
    saida.push(new TextRun({ text: limpar(texto.slice(ultimo)), ...base }));
  }
  return saida.length ? saida : [new TextRun({ text: '', ...base })];
}

const limpar = (t) => t.replace(/\s+/g, ' ');

/** Só o pautado, para a resposta que o Marcelo traz. */
function linhasEmBranco() {
  const linha = () => new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.DOTTED, size: 6, color: 'BFBFBF', space: 2 } },
    children: [new TextRun({ text: '', size: 16 })],
  });
  return [linha(), linha()];
}

/** As três linhas de anotação que o roteiro pede para cada tarefa. */
function linhasDeAnotacao() {
  const linha = (rotulo) => new Paragraph({
    spacing: { before: 60, after: 60 },
    border: { bottom: { style: BorderStyle.DOTTED, size: 6, color: 'BFBFBF', space: 2 } },
    children: [new TextRun({ text: rotulo, size: 16, color: CLARO })],
  });
  return [
    linha('achou?   sim / com ajuda / não          quanto tempo?   10s / 30s / desistiu'),
    linha('a frase dela:'),
    linha(''),
  ];
}

/*
 * O MARKDOWN É LIDO EM BLOCOS, e não linha a linha.
 *
 * A primeira versão tratava cada linha do arquivo como um parágrafo, e o
 * documento saiu com 17 páginas de frases cortadas no meio: o markdown quebra
 * as linhas em 79 colunas, e essa quebra é do ARQUIVO, não do texto. Bloco é
 * o que existe entre duas linhas em branco.
 */
const blocos = md.split(/\n\s*\n/);
const filhos = [];
/** A partir da seção das perguntas ao Marcelo, o espaço é para a resposta. */
let perguntasFinais = false;

/** Junta as linhas de um bloco num parágrafo só. */
const juntar = (b) => b.split('\n').map((l) => l.trim()).join(' ').trim();

/** Uma tarefa numerada e as linhas recuadas que a seguem, no mesmo bloco. */
function tarefa(bloco, comAnotacao = true) {
  const linhas = bloco.split('\n');
  const cabeca = linhas[0].match(/^(\d+)\.\s+(.*)$/);
  const resto = [];
  let atual = cabeca[2];
  for (const l of linhas.slice(1)) {
    if (/^\s{3,}\S/.test(l) && !/^\s*[-*]\s/.test(l)) { atual += ' ' + l.trim(); }
    else { resto.push(l.trim()); }
  }
  filhos.push(new Paragraph({
    spacing: { before: 200, after: 60 },
    keepNext: true,
    children: [
      new TextRun({ text: `${cabeca[1]}. `, bold: true, size: 22, color: AZUL }),
      ...runs(atual, { size: 21 }),
    ],
  }));
  for (const r of resto.filter(Boolean)) {
    filhos.push(new Paragraph({
      indent: { left: 340 }, spacing: { after: 40 },
      children: runs(r.replace(/^[-*]\s+/, ''), { size: 19, color: CINZA }),
    }));
  }
  if (comAnotacao) filhos.push(...linhasDeAnotacao());
  else filhos.push(...linhasEmBranco());
}

for (const bruto of blocos) {
  const bloco = bruto.replace(/\s+$/, '');
  if (!bloco.trim()) continue;
  const primeira = bloco.trim().split('\n')[0].trim();

  /* `---` some: no markdown ele separa seções, e virar quebra de página fazia
   * o documento render 17 folhas. Quem manda na paginação aqui é o cargo. */
  if (/^---+$/.test(bloco.trim())) continue;

  const h = primeira.match(/^(#{1,3})\s+(.*)$/);
  if (h) {
    const nivel = h[1].length;
    if (nivel === 1) {
      filhos.push(new Paragraph({
        heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: runs(h[2], { bold: true, size: 32, color: AZUL }),
      }));
      continue;
    }
    /* Uma folha por cargo: quem aplica leva a folha do cargo na mão, e vira a
     * página quando troca de pessoa. */
    const ehCargo = nivel === 2 && /^\d+\.\s/.test(h[2]);
    if (/perguntas para o Marcelo/i.test(h[2])) perguntasFinais = true;
    if (ehCargo) filhos.push(new Paragraph({ children: [new PageBreak()] }));
    filhos.push(new Paragraph({
      heading: nivel === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
      spacing: { before: ehCargo ? 0 : 300, after: 120 },
      keepNext: true,
      border: nivel === 2
        ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: AZUL, space: 4 } }
        : undefined,
      children: runs(h[2], { bold: true, size: nivel === 2 ? 26 : 22, color: AZUL }),
    }));
    continue;
  }

  if (primeira.startsWith('>')) {
    filhos.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 100, line: 260 },
      shading: { type: ShadingType.CLEAR, fill: 'F2F5F9' },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: AZUL, space: 8 } },
      children: runs(juntar(bloco.replace(/^>\s?/gm, '')), { size: 18, color: CINZA }),
    }));
    continue;
  }

  if (primeira.startsWith('|')) {
    const celulas = bloco.split('\n').map((l) => l.trim())
      .filter((b) => b.startsWith('|') && !/^\|[\s|:-]+\|$/.test(b))
      .map((b) => b.split('|').slice(1, -1).map((c) => c.trim()));
    if (celulas.length) {
      const colunas = Math.max(...celulas.map((c) => c.length));
      const largura = Math.floor(9000 / colunas);
      filhos.push(new Table({
        columnWidths: Array(colunas).fill(largura),
        rows: celulas.map((linha) => new TableRow({
          children: Array.from({ length: colunas }, (_, k) => new TableCell({
            width: { size: largura, type: WidthType.DXA },
            children: [new Paragraph({ children: runs(linha[k] ?? '', { size: 18 }) })],
          })),
        })),
      }));
      filhos.push(new Paragraph({ text: '', spacing: { after: 140 } }));
    }
    continue;
  }

  /*
   * As perguntas do fim são para o MARCELO, não para quem faz o plantão — e
   * uma linha "achou? sim/não" embaixo delas pediria a coisa errada. O que
   * elas precisam é de espaço em branco para a resposta dele.
   */
  if (/^\d+\.\s/.test(primeira)) { tarefa(bloco, !perguntasFinais); continue; }

  if (/^[-*]\s/.test(primeira)) {
    /* Um item pode ocupar várias linhas do arquivo: começa em "- " e segue
     * recuado até o próximo "- ". */
    const itens = [];
    for (const l of bloco.split('\n')) {
      if (/^\s*[-*]\s/.test(l)) itens.push(l.trim().replace(/^[-*]\s+/, ''));
      else if (itens.length) itens[itens.length - 1] += ' ' + l.trim();
    }
    for (const it of itens) {
      filhos.push(new Paragraph({
        bullet: { level: 0 }, spacing: { after: 60 },
        children: runs(it, { size: 20 }),
      }));
    }
    continue;
  }

  filhos.push(new Paragraph({
    alignment: AlignmentType.JUSTIFIED, spacing: { after: 100, line: 280 },
    children: runs(juntar(bloco), { size: 20 }),
  }));
}

const doc = new Document({
  creator: 'Rede Acolher',
  title: 'Roteiro de retorno — Casa 03',
  styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
  sections: [{
    properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF', space: 4 } },
          children: [new TextRun({
            text: 'REDE ACOLHER · roteiro de retorno · Casa 03 (piloto)',
            size: 16, color: CINZA,
          })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES],
            size: 16, color: CINZA,
          })],
        })],
      }),
    },
    children: filhos,
  }],
});

writeFileSync(SAIDA, await Packer.toBuffer(doc));
console.log(`✓ ${SAIDA}`);
