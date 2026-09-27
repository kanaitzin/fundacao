import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Header, Footer, ImageRun, PageNumber, PageOrientation, BorderStyle, Table, TableRow, TableCell,
    WidthType, PageBreak,
} from 'docx';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../contracts';
import { Folha, SecaoDaFolha, diaBR, nomeDoArquivo } from './folha';

/**
 * A FOLHA VIRANDO ARQUIVO — no servidor, e não no navegador.
 *
 * Mora no kernel porque quatro partições precisam dele (shifts, incidents,
 * nursing/medications, alignments) e **partição não importa partição**. Cada
 * uma monta a folha do documento que é dela; quem sabe transformar folha em
 * .docx com o timbre da Fundação é este serviço, uma vez só.
 *
 * Sai em Word, e não em PDF, por uso e não por tecnologia: quem assina precisa
 * poder mexer. Um PDF fechado empurraria a equipe a refazer o documento no
 * Word da máquina dela, e aí o que vai ao Juízo deixa de ter relação com o que
 * está no sistema. A conversão para PDF é da pessoa, na hora de enviar.
 *
 * **Toda exportação é registrada antes de o arquivo existir.** Era exatamente
 * isto que faltava enquanto o documento era montado no navegador: o arquivo
 * saía do sistema e ninguém conseguia responder, meses depois, quem o tirou e
 * para quê. Aqui a finalidade é obrigatória, e a auditoria guarda o nome de
 * quem pediu, o documento e a finalidade — nunca o conteúdo.
 */

const AZUL = '1F3864';
const CINZA = '595959';

/*
 * O PADRÃO DO PAPEL (fase 165). O pedido de 25/09 descreve o documento
 * institucional: A4, margem de 3 cm no topo e à esquerda e de 2 cm embaixo e à
 * direita, Arial 12, texto justificado, entrelinha de 1,5. O protótipo já saía
 * no padrão da ABNT; o servidor saía em Calibri 11 com margens de 1,9 cm, e a
 * folha que o Marcelo aprovou não era a que o sistema de verdade entregava.
 */
const FONTE = 'Arial';
const CORPO = 24;         // 12 pt, em meios-pontos
const MENOR = 20;         // 10 pt: tabela, identificação
const NOTA = 18;          // 9 pt: legenda, procedência, ressalva
const ENTRELINHA = 360;   // 1,5
const CM = 567;           // um centímetro, em twips
const A4 = { width: 11906, height: 16838 };

@Injectable()
export class DocumentosService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  /** O timbre vive no repositório; sem ele o documento sai mesmo assim. */
  private timbre(): Buffer | null {
    const caminho = process.env.TIMBRE_PATH ?? join(process.cwd(), 'assets', 'timbre.png');
    return existsSync(caminho) ? readFileSync(caminho) : null;
  }

  /**
   * Gera o arquivo e REGISTRA a saída.
   *
   * `finalidade` é obrigatória e curta demais é recusada: "relatório" não
   * responde nada a quem for apurar de onde saiu uma cópia.
   */
  async exportar(user: AuthenticatedUser, folha: Folha, ctx: {
    entidade: string; entidadeId?: string; houseId?: string | null; finalidade: string;
  }): Promise<{ nomeArquivo: string; conteudoBase64: string; aviso: string }> {
    const finalidade = (ctx.finalidade ?? '').trim();
    if (finalidade.length < 10) {
      throw new BadRequestException('Descreva a finalidade da exportação (mínimo 10 caracteres).');
    }

    /* Registrar ANTES de gerar. Se a geração falhar, fica o registro de uma
     * tentativa — que é informação. A ordem inversa perderia a saída que deu
     * certo e o processo morreu antes de auditar. */
    await this.audit.log({
      action: 'documento.export',
      actorId: user.id,
      institutionId: user.institutionId,
      houseId: ctx.houseId ?? null,
      entity: ctx.entidade,
      entityId: ctx.entidadeId,
      purpose: finalidade,
      // Metadado, nunca conteúdo (§20): o título já diz o bastante.
      detail: { titulo: folha.titulo, secoes: folha.secoes.length, formato: 'docx' },
    });

    const arquivo = await this.gerar(folha);
    return {
      nomeArquivo: nomeDoArquivo(folha.titulo),
      conteudoBase64: arquivo.toString('base64'),
      aviso: folha.rascunho
        ? 'Documento gerado em Word, marcado como RASCUNHO na primeira página. '
          + 'Exportação registrada com o seu nome, a finalidade e o horário.'
        : 'Documento gerado em Word, com timbre. Exportação registrada com o seu nome, '
          + 'a finalidade e o horário. Converta para PDF na hora de enviar.',
    };
  }

  /** A folha virando .docx. Sem efeito nenhum: não lê banco, não registra. */
  async gerar(f: Folha): Promise<Buffer> {
    const img = this.timbre();

    const cabecalho = new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: img
            ? [new ImageRun({ type: 'png', data: img, transformation: { width: 70, height: 70 } })]
            : [],
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
            text: 'Programa de Acolhimento Institucional · Rede Acolher', size: 20, color: CINZA,
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
            text: `Documento gerado pelo Rede Acolher em ${diaBR(new Date())} por ${f.geradoPor}.`,
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

    const filhos: (Paragraph | Table)[] = [];

    if (f.rascunho) {
      // Antes do título, porque é a primeira coisa que precisa ser lida.
      filhos.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        shading: { fill: 'FFF2CC' },
        children: [new TextRun({
          text: 'RASCUNHO. Este documento ainda não foi aprovado e não deve ser entregue.',
          bold: true, color: '7F6000', size: 20,
        })],
      }));
    }

        if (f.capa) filhos.push(...this.capa(f, img));

    filhos.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: f.subtitulo ? 60 : 200 },
      children: [new TextRun({ text: f.titulo.toUpperCase(), bold: true, size: 28, color: AZUL })],
    }));
    if (f.subtitulo) {
      filhos.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: f.subtitulo, size: 20, color: CINZA })],
      }));
    }

    // Bloco de identificação, em quadro, porque é o que se confere primeiro.
    if (f.identificacao.length) {
      filhos.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: f.identificacao.map((l) => new TableRow({
          children: [
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              shading: { fill: 'F2F2F2' },
              children: [new Paragraph({ children: [new TextRun({ text: l.rotulo, bold: true, size: MENOR })] })],
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: l.valor, size: MENOR })] })],
            }),
          ],
        })),
      }));
      filhos.push(new Paragraph({ text: '', spacing: { after: 200 } }));
    }

    for (const s of f.secoes) filhos.push(...this.secao(s));

    if (f.ressalva) {
      filhos.push(new Paragraph({
        spacing: { before: 300, after: 120 },
        shading: { fill: 'F7F7F7' },
                alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: f.ressalva, italics: true, size: NOTA, color: CINZA })],
      }));
    }

    if (f.assinatura) {
      filhos.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 600 },
        children: [new TextRun({ text: '_________________________________________', size: 22 })],
      }));
      filhos.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: f.geradoPor, size: 20 })],
      }));
      filhos.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: f.cargo, size: 18, color: CINZA })],
      }));
    }

    const doc = new Document({
      creator: 'Rede Acolher',
      title: f.titulo,
            styles: { default: { document: {
        run: { font: FONTE, size: CORPO },
        paragraph: { spacing: { line: ENTRELINHA } },
      } } },
      sections: [{
        properties: {
          /* Na capa não vai cabeçalho: o timbre já está nela, grande. */
          titlePage: !!f.capa,
          page: {
            size: f.paisagem ? { ...A4, orientation: PageOrientation.LANDSCAPE } : A4,
            margin: { top: 3 * CM, left: 3 * CM, bottom: 2 * CM, right: 2 * CM },
          },
        },
        headers: { default: cabecalho, ...(f.capa ? { first: new Header({ children: [] }) } : {}) },
        footers: { default: rodape },
        children: filhos,
      }],
    });

    return Packer.toBuffer(doc);
  }

    /**
   * A CAPA (fase 165): o timbre centralizado e grande, a Fundação e a Rede
   * Acolher, o título e a identificação em linhas centralizadas. Termina em
   * quebra de página, e o corpo recomeça pelo título, como num relatório
   * impresso.
   */
  private capa(f: Folha, img: Buffer | null): Paragraph[] {
    const centro = (text: string, o: { size?: number; bold?: boolean; color?: string; after?: number } = {}) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: o.after ?? 80 },
        children: [new TextRun({ text, size: o.size ?? CORPO, bold: o.bold, color: o.color })],
      });
    return [
      new Paragraph({ text: '', spacing: { before: 1200 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: img
          ? [new ImageRun({ type: 'png', data: img, transformation: { width: 150, height: 150 } })]
          : [],
      }),
      centro('FUNDAÇÃO O PÃO DOS POBRES DE SANTO ANTÔNIO', { bold: true, color: AZUL }),
      centro('Programa de Acolhimento Institucional', { size: MENOR, color: CINZA }),
      centro('Rede Acolher', { size: MENOR, color: CINZA, after: 1600 }),
      centro(f.titulo.toUpperCase(), { size: 32, bold: true, color: AZUL, after: 200 }),
      ...(f.subtitulo ? [centro(f.subtitulo, { color: CINZA, after: 600 })] : []),
      ...f.identificacao.map((l) => centro(`${l.rotulo}: ${l.valor}`, { size: MENOR })),
      new Paragraph({ children: [new PageBreak()] }),
    ];
  }

  private secao(s: SecaoDaFolha): (Paragraph | Table)[] {
    const saida: (Paragraph | Table)[] = [
      new Paragraph({
                heading: HeadingLevel.HEADING_2,
        pageBreakBefore: !!s.quebraAntes,
        keepNext: true,
        spacing: { before: 240, after: 60 },
        children: [new TextRun({ text: s.titulo, bold: true, size: 24, color: AZUL })],
      }),
    ];

    for (const p of s.paragrafos ?? []) {
      /* Justificado e com entrelinha: o documento é lido no papel, às vezes em
       * voz alta numa audiência, e às vezes por quem já leu outros vinte
       * naquele dia. */
      saida.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 60, line: ENTRELINHA },
        children: [new TextRun({ text: p, size: CORPO })],
      }));
    }

    for (const i of s.itens ?? []) {
      saida.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 40 },
                alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: i, size: CORPO })],
      }));
    }

    if (s.tabela && s.tabela.linhas.length) {
      saida.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: s.tabela.cabecalho.map((c) => new TableCell({
              shading: { fill: 'F2F2F2' },
              children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, size: 18 })] })],
            })),
          }),
          ...s.tabela.linhas.map((l, i) => new TableRow({
            cantSplit: true,
            children: l.map((v, j) => {
              const foto = s.tabela!.fotos?.[i]?.[j] ?? null;
              /*
               * A foto entra no tamanho de um 3×4 impresso (cerca de 2,6 × 3,5
               * cm). WEBP o Word não abre: sai o texto da célula, e a pessoa
               * vê a foto no sistema.
               */
              const tipo = foto?.tipo === 'image/jpeg' ? 'jpg' : foto?.tipo === 'image/png' ? 'png' : null;
              return new TableCell({
                children: [new Paragraph({
                  children: foto && tipo
                    ? [new ImageRun({ type: tipo, data: foto.dados, transformation: { width: 75, height: 100 } })]
                    : [new TextRun({ text: v, size: 18 })],
                })],
              });
            }),
          })),
        ],
      }));
      saida.push(new Paragraph({ text: '', spacing: { after: 120 } }));
    }

    for (const im of s.imagens ?? []) {
      const tipo = im.foto?.tipo === 'image/jpeg' ? 'jpg' : im.foto?.tipo === 'image/png' ? 'png' : null;
      const medida = im.foto && tipo ? dimensoesDaImagem(im.foto.dados) : null;
      if (im.foto && tipo && medida) {
        /* Cabe na largura útil da página (cerca de 16 cm) sem deformar: a nota
           fiscal torta ou esticada não se lê, e é para ser lida. */
        const escala = Math.min(1, 560 / medida.largura, 720 / medida.altura);
        saida.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ type: tipo, data: im.foto.dados, transformation: {
            width: Math.round(medida.largura * escala), height: Math.round(medida.altura * escala) } })],
        }));
      }
      saida.push(new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: medida ? im.legenda
          : `${im.legenda}. Documento em PDF ou outro formato, disponível no registro eletrônico.`,
          size: 18, italics: true })],
      }));
    }

    if (s.aPreencher) {
      /* O vazio precisa PARECER vazio. Um campo em branco que passa
       * despercebido vira documento entregue pela metade. */
      saida.push(new Paragraph({
        spacing: { after: 120 },
        shading: { fill: 'F7F7F7' },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BFBFBF', space: 8 } },
        children: [new TextRun({
          text: `A preencher: ${s.aPreencher}.`,
          italics: true, size: 20, color: '808080',
        })],
      }));
      for (let i = 0; i < 3; i++) saida.push(new Paragraph({ text: '' }));
    }

    if (s.procedencia) {
      saida.push(new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({
          text: `Procedência: ${s.procedencia}`, italics: true, size: 16, color: CINZA,
        })],
      }));
    }

    return saida;
  }
}

/**
 * A largura e a altura de um PNG ou JPEG, lidas do cabeçalho — o Word precisa
 * do tamanho para não deformar a imagem, e não há biblioteca de imagem aqui.
 */
export function dimensoesDaImagem(b: Uint8Array): { largura: number; altura: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { largura: v.getUint32(16), altura: v.getUint32(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marca = b[i + 1];
      const tam = (b[i + 2] << 8) + b[i + 3];
      /* SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC). */
      if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) {
        return { altura: (b[i + 5] << 8) + b[i + 6], largura: (b[i + 7] << 8) + b[i + 8] };
      }
      i += 2 + tam;
    }
  }
  return null;
}
