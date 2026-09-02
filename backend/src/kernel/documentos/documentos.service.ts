import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Header, Footer, ImageRun, PageNumber, BorderStyle, Table, TableRow, TableCell,
  WidthType,
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
            text: 'Programa de Acolhimento Institucional', size: 20, color: CINZA,
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
              children: [new Paragraph({ children: [new TextRun({ text: l.rotulo, bold: true, size: 20 })] })],
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: l.valor, size: 20 })] })],
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
        children: [new TextRun({ text: f.ressalva, italics: true, size: 18, color: CINZA })],
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
      styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
      sections: [{
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
        headers: { default: cabecalho },
        footers: { default: rodape },
        children: filhos,
      }],
    });

    return Packer.toBuffer(doc);
  }

  private secao(s: SecaoDaFolha): (Paragraph | Table)[] {
    const saida: (Paragraph | Table)[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
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
        spacing: { after: 60, line: 300 },
        children: [new TextRun({ text: p, size: 22 })],
      }));
    }

    for (const i of s.itens ?? []) {
      saida.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 40 },
        children: [new TextRun({ text: i, size: 22 })],
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
          ...s.tabela.linhas.map((l) => new TableRow({
            children: l.map((v) => new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: v, size: 18 })] })],
            })),
          })),
        ],
      }));
      saida.push(new Paragraph({ text: '', spacing: { after: 120 } }));
    }

    if (s.aPreencher) {
      /* O vazio precisa PARECER vazio. Um campo em branco que passa
       * despercebido vira documento entregue pela metade. */
      saida.push(new Paragraph({
        spacing: { after: 120 },
        shading: { fill: 'F7F7F7' },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BFBFBF', space: 8 } },
        children: [new TextRun({
          text: `A preencher: ${s.aPreencher}. Escreva aqui antes de imprimir ou enviar.`,
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
