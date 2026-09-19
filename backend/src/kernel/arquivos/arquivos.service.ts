import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * ONDE OS DOCUMENTOS MORAM — um lugar só, no kernel.
 *
 * Cinco serviços já traziam a mesma linha — `process.env.ARQUIVOS_DIR ??
 * join(process.cwd(), '.arquivos')` — e cada um decodificava o base64, conferia
 * a assinatura e calculava o sha256 do seu jeito. Enquanto era uma linha
 * repetida, era feio; quando a fase 108 precisou de mais TRÊS lugares, virou a
 * conta a pagar: oito cópias de uma regra de segurança divergem no primeiro
 * ajuste, e a que divergir vai ser a que ninguém olhou.
 *
 * AS DUAS COISAS QUE ESTE ARQUIVO GARANTE, E QUE NÃO SE NEGOCIAM:
 *
 *  * **o tipo é lido da ASSINATURA, nunca da extensão.** Renomear é um toque;
 *    quem guarda documento de criança confere os primeiros bytes;
 *  * **o sha256 é calculado ANTES de gravar.** É ele que prova, depois, que o
 *    arquivo que abriu é o que entrou.
 *
 * O que ele NÃO faz: decidir quem pode ler. Isso é do módulo dono da tabela,
 * onde o RLS e a política vivem — o kernel não conhece cargo nem casa.
 *
 * ---
 *
 * **FASE 114 — as cinco cópias entraram, e a diferença entre elas era real.**
 *
 * Ao juntá-las apareceu o que a repetição escondia: as cinco NÃO faziam a
 * mesma conferência. O dossiê aceitava 15 MB e seis tipos, com sha256; a nota
 * de internação e o marco de vida aceitavam 10 MB e três tipos, sem sha256; e
 * a foto de identificação, 4 MB e só imagem — porque um PDF como retrato de
 * uma criança não é documento, é engano.
 *
 * **Nenhuma dessas diferenças é defeito**, e por isso nenhuma foi apagada. O
 * que era acidente virou `RegraDoArquivo`: cada lugar declara, numa constante
 * ao lado do seu próprio método, o que aceita, até que tamanho, e com que
 * frase recusa. O que deixou de ser de cada um é o que nunca deveria ter sido:
 * decodificar, medir, ler a assinatura, calcular o sha e gravar.
 *
 * *E uma divergência ERA defeito, e foi corrigida ao juntar: o dossiê — e o
 * kernel, que copiou dele — davam `image/webp` a qualquer arquivo que
 * começasse com `RIFF`, que é o cabeçalho de um AVI também. A cópia da foto
 * de identificação conferia `WEBP` no 9º byte, como manda o formato, e estava
 * certa. É o argumento inteiro da fase, e ele apareceu sozinho: seis cópias de
 * uma regra de segurança divergem, e a que divergir vai ser a que ninguém
 * olhou.*
 */

/** As assinaturas aceitas. Imagem e PDF: é o que uma digitalização produz. */
export const TIPOS_ACEITOS = [
  { assinatura: 'ffd8ff', tipo: 'image/jpeg', rotulo: 'Foto JPEG' },
  { assinatura: '89504e47', tipo: 'image/png', rotulo: 'Imagem PNG' },
  { assinatura: '25504446', tipo: 'application/pdf', rotulo: 'PDF' },
  { assinatura: '47494638', tipo: 'image/gif', rotulo: 'Imagem GIF' },
  { assinatura: '52494646', tipo: 'image/webp', rotulo: 'Imagem WebP' },
];

/** 15 MB — o mesmo limite prático de uma digitalização de celular. */
export const TAMANHO_MAXIMO_ARQUIVO = 15 * 1024 * 1024;

export interface ArquivoGuardado {
  chave: string; mime: string; rotulo: string; sha256: string; tamanho: number;
}

/**
 * O QUE CADA LUGAR ACEITA — declarado, e não herdado por cópia.
 *
 * As frases vêm junto porque elas são do lugar, não do kernel: "o comprovante
 * passa de 10 MB" e "a foto passa de 4 MB" são a mesma regra dita para duas
 * pessoas diferentes, em dois momentos diferentes do dia. Um kernel que
 * escrevesse as duas escreveria mal as duas.
 */
export interface RegraDoArquivo {
  /** Os mimes aceitos. Omitir aceita todos os de `TIPOS_ACEITOS` (e o HEIC). */
  aceita?: string[];
  /** O limite em bytes. Omitir usa `TAMANHO_MAXIMO_ARQUIVO`. */
  maximo?: number;
  /** As três recusas, com a palavra que o lugar usa. Omitir usa a genérica. */
  recusas?: { vazio?: string; grande?: string; tipo?: string };
}

@Injectable()
export class ArquivosService {
  private readonly dir = process.env.ARQUIVOS_DIR ?? join(process.cwd(), '.arquivos');

  /**
   * Guarda o que chegou em base64 e devolve o que a tabela precisa gravar.
   *
   * Devolve `null` quando não veio conteúdo nenhum — o chamador decide se isso
   * é erro (a receita, que precisa de um dos dois) ou o caso normal (a nota
   * fiscal lançada antes de o papel chegar).
   */
  async guardar(conteudo?: string | null, regra: RegraDoArquivo = {}): Promise<ArquivoGuardado | null> {
    const limpo = String(conteudo ?? '').replace(/^data:[^;]+;base64,/, '').trim();
    if (!limpo) return null;

    const maximo = regra.maximo ?? TAMANHO_MAXIMO_ARQUIVO;
    const bytes = Buffer.from(limpo, 'base64');
    if (!bytes.length) {
      throw new BadRequestException(regra.recusas?.vazio ?? 'O arquivo chegou vazio.');
    }
    if (bytes.length > maximo) {
      throw new BadRequestException(regra.recusas?.grande
        ?? `O arquivo passa de ${Math.round(maximo / 1024 / 1024)} MB. `
           + 'Digitalize em qualidade menor — a foto do celular costuma resolver.');
    }

    const { tipo, rotulo } = this.tipoReal(bytes, regra);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const chave = randomUUID();
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, chave), bytes);
    return { chave, mime: tipo, rotulo, sha256, tamanho: bytes.length };
  }

  /**
   * Lê o que foi guardado. Devolve `null` se o objeto sumiu do disco — o
   * chamador transforma isso na frase certa para a tela dele.
   *
   * *Some por um motivo só, e ele é de implantação: o banco foi restaurado e o
   * acervo não (§12.2). O banco continua dizendo que o arquivo existe.*
   */
  async ler(chave: string): Promise<Buffer | null> {
    return readFile(join(this.dir, chave)).catch(() => null);
  }

  /**
   * O tipo REAL, pela assinatura. Extensão não é prova de nada.
   *
   * `regra.aceita` NÃO amplia esta lista: ela só estreita. Um lugar pode
   * recusar o que o kernel aceita — a foto de identificação recusa PDF —, e
   * nenhum pode aceitar o que o kernel não conhece.
   */
  private tipoReal(bytes: Buffer, regra: RegraDoArquivo = {}) {
    const hex = bytes.subarray(0, 12).toString('hex');
    const recusa = () => {
      throw new BadRequestException(regra.recusas?.tipo
        ?? 'Este arquivo não é imagem nem PDF. O sistema guarda documento digitalizado — e a '
           + 'conferência é pela assinatura do arquivo, não pela extensão do nome.');
    };
    const passa = (tipo: string) => !regra.aceita || regra.aceita.includes(tipo);

    // HEIC não tem assinatura no começo: o marcador `ftyp` fica no 5º byte.
    if (hex.slice(8, 16) === '66747970') {
      if (!passa('image/heic')) recusa();
      return { tipo: 'image/heic', rotulo: 'Foto do celular (HEIC)' };
    }
    const achado = TIPOS_ACEITOS.find((t) => hex.startsWith(t.assinatura));
    /*
     * `RIFF` NÃO É WEBP SOZINHO.
     *
     * O contêiner RIFF carrega AVI, WAV e WebP; o formato fica no 9º byte. O
     * dossiê dava `image/webp` a qualquer um deles desde a fase 82 — e a tela
     * mostraria uma imagem quebrada, que na hora se lê como "o sistema perdeu
     * o documento". A cópia da foto de identificação conferia certo; foi dela
     * que esta linha veio (fase 114).
     */
    if (achado?.tipo === 'image/webp' && bytes.subarray(8, 12).toString() !== 'WEBP') recusa();
    if (!achado || !passa(achado.tipo)) recusa();
    return { tipo: achado!.tipo, rotulo: achado!.rotulo };
  }
}
