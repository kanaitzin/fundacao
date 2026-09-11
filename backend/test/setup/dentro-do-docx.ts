import { inflateRawSync } from 'zlib';

/**
 * Abre o .docx dentro do teste — nasceu na suíte da cozinha e mudou para cá na
 * fase 92, quando a portaria precisou do mesmo. Duas cópias divergiriam.
 *
 * Abre o `.docx` — que é um zip — e DESCOMPRIME as entradas.
 *
 * A primeira versão só listava os nomes e procurava texto nos bytes crus. Isso
 * fez duas coisas ruins ao mesmo tempo: o teste do conteúdo falhou por motivo
 * errado (o XML vem em DEFLATE), e o teste que afirmava "a folha da cozinha não
 * traz diagnóstico" PASSOU — porque procurar uma palavra dentro de bytes
 * comprimidos nunca acha nada. Um conferidor que só foi visto dizendo "sim"
 * não foi visto.
 */
export function dentroDoDocx(base64: string) {
  const buf = Buffer.from(base64, 'base64');
  const nomes: string[] = [];
  const conteudo: Record<string, string> = {};

  for (let i = 0; i + 30 < buf.length; i++) {
    if (!(buf[i] === 0x50 && buf[i + 1] === 0x4b
          && buf[i + 2] === 0x03 && buf[i + 3] === 0x04)) continue;
    const metodo = buf.readUInt16LE(i + 8);
    const comprimido = buf.readUInt32LE(i + 18);
    const tamNome = buf.readUInt16LE(i + 26);
    const tamExtra = buf.readUInt16LE(i + 28);
    const nome = buf.slice(i + 30, i + 30 + tamNome).toString('utf8');
    nomes.push(nome);

    if (nome.endsWith('.xml') && comprimido > 0) {
      const ini = i + 30 + tamNome + tamExtra;
      const dados = buf.slice(ini, ini + comprimido);
      try {
        conteudo[nome] = (metodo === 8 ? inflateRawSync(dados) : dados).toString('utf8');
      } catch { /* entrada ilegível: fica de fora, e o teste que a exigir falha */ }
    }
  }
  return { buf, nomes, conteudo };
}
