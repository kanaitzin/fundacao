import { Injectable } from '@nestjs/common';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Header, Footer, ImageRun, PageNumber, BorderStyle, Table, TableRow, TableCell,
  WidthType,
} from 'docx';
import { Secao } from './conteudo.service';

/**
 * O RELATÓRIO COMO DOCUMENTO.
 *
 * Sai em Word, e não em PDF, por uma razão de uso e não de tecnologia: quem
 * assina o relatório precisa poder mexer nele. A técnica escreve a avaliação,
 * a coordenação acrescenta uma linha antes da audiência, alguém corrige um
 * nome. Entregar um PDF fechado empurraria a equipe a refazer o documento por
 * fora, no Word da máquina dela, e aí o que vai para o Juízo deixa de ter
 * qualquer relação com o que está no sistema.
 *
 * Então o sistema entrega o documento pronto e editável, com o timbre e com a
 * parte factual já escrita. A conversão para PDF fica com a pessoa, na hora de
 * imprimir ou enviar, que é quando ela já sabe que o texto está fechado.
 *
 * O que o documento sempre carrega, e não é decoração:
 *
 *   * a ORIGEM de cada seção. Quem lê precisa distinguir o que o sistema
 *     contou do que uma pessoa avaliou, sem ter que perguntar;
 *   * os campos em branco ficam VISÍVEIS como pendência. Um espaço vazio que
 *     parece preenchido é pior do que um espaço vazio;
 *   * o rodapé diz quem gerou, quando e para quê. O documento que circula
 *     sozinho continua dizendo de onde veio;
 *   * a marca de rascunho quando o relatório ainda não foi aprovado, para que
 *     ninguém entregue por engano o que ninguém revisou.
 */

const AZUL = '1F3864';
const CINZA = '595959';

const F = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
});
const FH = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

/**
 * O período chega ora como texto 'YYYY-MM-DD' (quem digitou na tela), ora como
 * `Date` (quem leu do banco). As duas formas precisam virar a mesma data de
 * Porto Alegre, e um `new Date('2026-08-01')` cru seria meia-noite em UTC, ou
 * seja, 31 de julho aqui.
 */
function comoData(v: string | Date): string {
  const iso = v instanceof Date
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(v)
    : String(v).slice(0, 10);
  return F.format(new Date(`${iso}T12:00:00Z`));
}

export interface DadosDoDocumento {
  titulo: string;
  tipoLabel: string;
  situacao: string;
  finalidade: string;
  periodoDe: string | Date;
  periodoAte: string | Date;
  unidade?: string | null;
  acolhido?: string | null;
  secoes: Secao[];
  geradoPor: string;
  cargo: string;
  aprovadoPor?: string | null;
}

@Injectable()
export class DocumentoService {
  /** O timbre vive no repositório; sem ele o documento sai mesmo assim. */
  private timbre(): Buffer | null {
    const caminho = process.env.TIMBRE_PATH
      ?? join(process.cwd(), 'assets', 'timbre.png');
    return existsSync(caminho) ? readFileSync(caminho) : null;
  }

  async gerar(d: DadosDoDocumento): Promise<Buffer> {
    const img = this.timbre();
    const rascunho = d.situacao !== 'aprovado';

    const cabecalho = new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            ...(img
              ? [new ImageRun({
                  type: 'png',
                  data: img,
                  transformation: { width: 70, height: 70 },
                })]
              : []),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: 'FUNDAÇÃO O PÃO DOS POBRES DE SANTO ANTÔNIO',
            bold: true, size: 24, color: AZUL,
          })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: AZUL, space: 6 } },
          children: [new TextRun({
            text: 'Programa de Acolhimento Institucional',
            size: 20, color: CINZA,
          })],
        }),
      ],
    });

    const rodape = new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF', space: 6 } },
          children: [new TextRun({
            // Documento que circula sozinho continua dizendo de onde veio.
            text: `Documento gerado pelo Rede Acolher em ${FH.format(new Date())} por ${d.geradoPor}. `,
            size: 16, color: CINZA,
          })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES],
            size: 16, color: CINZA,
          })],
        }),
      ],
    });

    const corpo: Paragraph[] = [];

    if (rascunho) {
      // Antes do título, porque é a primeira coisa que precisa ser lida.
      corpo.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        shading: { fill: 'FFF2CC' },
        children: [new TextRun({
          text: 'RASCUNHO. Este documento ainda não foi aprovado e não deve ser entregue.',
          bold: true, color: '7F6000', size: 20,
        })],
      }));
    }

    corpo.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: d.titulo.toUpperCase(), bold: true, size: 28, color: AZUL })],
    }));

    // Bloco de identificação, em tabela, porque é o que se confere primeiro.
    const linhas: [string, string][] = [
      ['Tipo', d.tipoLabel],
      ['Período', `${comoData(d.periodoDe)} a ${comoData(d.periodoAte)}`],
    ];
    if (d.acolhido) linhas.push(['Acolhido', d.acolhido]);
    if (d.unidade) linhas.push(['Unidade', d.unidade]);
    linhas.push(['Finalidade', d.finalidade]);
    linhas.push(['Elaborado por', `${d.geradoPor}, ${d.cargo}`]);
    if (d.aprovadoPor) linhas.push(['Aprovado por', d.aprovadoPor]);

    const tabela = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: linhas.map(([rot, val]) => new TableRow({
        children: [
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            shading: { fill: 'F2F2F2' },
            children: [new Paragraph({ children: [new TextRun({ text: rot, bold: true, size: 20 })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: val, size: 20 })] })],
          }),
        ],
      })),
    });

    const filhos: (Paragraph | Table)[] = [...corpo, tabela,
      new Paragraph({ text: '', spacing: { after: 200 } })];

    for (const s of d.secoes) {
      filhos.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 60 },
        children: [new TextRun({ text: s.titulo, bold: true, size: 24, color: AZUL })],
      }));

      if (s.fonte) {
        filhos.push(new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: `Origem: ${s.fonte}`, italics: true, size: 16, color: CINZA })],
        }));
      }

      if (s.aPreencher || !s.texto.trim()) {
        // O vazio precisa parecer vazio. Um campo em branco que passa
        // despercebido vira relatório entregue pela metade.
        filhos.push(new Paragraph({
          spacing: { after: 120 },
          shading: { fill: 'F7F7F7' },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BFBFBF', space: 8 } },
          children: [new TextRun({
            text: 'A preencher. Escreva aqui antes de imprimir ou enviar.',
            italics: true, size: 20, color: '808080',
          })],
        }));
        for (let i = 0; i < 3; i++) filhos.push(new Paragraph({ text: '' }));
      } else {
        for (const linha of s.texto.split('\n')) {
          // Parágrafo justificado, com entrelinha: o documento é lido no papel,
          // muitas vezes em voz alta numa audiência, e às vezes por alguém que
          // já leu outros vinte naquele dia.
          filhos.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 60, line: 300 },
            children: [new TextRun({ text: linha, size: 22 })],
          }));
        }
      }
    }

    // Assinatura: o documento sai do sistema e passa a viver no papel.
    filhos.push(new Paragraph({ text: '', spacing: { before: 400 } }));
    filhos.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
      children: [new TextRun({ text: '_________________________________________', size: 22 })],
    }));
    filhos.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${d.geradoPor}`, size: 20 })],
    }));
    filhos.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: d.cargo, size: 18, color: CINZA })],
    }));
    filhos.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Assinatura e carimbo', size: 16, color: CINZA })],
    }));

    const doc = new Document({
      creator: 'Rede Acolher',
      title: d.titulo,
      description: d.finalidade,
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 22 } },
        },
      },
      sections: [{
        properties: {
          page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } },
        },
        headers: { default: cabecalho },
        footers: { default: rodape },
        children: filhos,
      }],
    });

    return Packer.toBuffer(doc);
  }

  /**
   * Nome do arquivo. Sem CPF, sem diagnóstico, sem conteúdo judicial: o nome
   * do arquivo aparece em lista de pasta, em anexo de e-mail e na tela de quem
   * estiver ao lado (§3.3).
   */
  nomeDoArquivo(tipoLabel: string, de: string | Date, ate: string | Date): string {
    const iso = (v: string | Date) => v instanceof Date
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(v)
      : String(v).slice(0, 10);
    const limpo = tipoLabel.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    return `relatorio-${limpo}_${iso(de)}_a_${iso(ate)}.docx`;
  }
}
