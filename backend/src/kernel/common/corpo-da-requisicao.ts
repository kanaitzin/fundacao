import { ExpressAdapter } from '@nestjs/platform-express';

/**
 * O TAMANHO DO CORPO DA REQUISIÇÃO (fase 179).
 *
 * O anexo viaja em base64 dentro do JSON, e o Nest liga o leitor de JSON com o
 * padrão do Express: 100 KB. Medido em 30/09 contra o servidor de verdade: a
 * foto de 50 KB entrava, a de 90 KB dava 500. A foto reduzida no aparelho
 * (fase 175) tem perto de meio megabyte, e o dossiê aceita 15 MB: nenhum anexo
 * de verdade entrava. A suíte e a simulação anexavam imagem mínima, e por isso
 * ninguém viu.
 *
 * O limite daqui é o do maior anexo aceito (15 MB), crescido do base64 (4/3) e
 * com folga. Quem recusa o arquivo grande demais continua sendo o serviço, com
 * a frase dele; este limite só garante que o arquivo CHEGA até ele.
 *
 * MORA NO KERNEL E É LIGADO PELO `AppModule`, não pelo `main.ts` (a lição da
 * fase 155): a suíte monta o app pelo módulo e tem de testar o servidor que
 * sobe. O Nest liga os leitores dentro do `init()`, antes de qualquer
 * middleware de módulo, e pula o leitor que já está ligado; por isso o limite
 * entra no próprio registro dos leitores.
 */
export const LIMITE_DO_CORPO = '25mb';

const MARCA = Symbol.for('rede-acolher.limite-do-corpo');
const proto = ExpressAdapter.prototype as any;

if (!proto[MARCA]) {
  const original = proto.registerParserMiddleware;
  proto.registerParserMiddleware = function (this: any, prefix?: string, rawBody?: boolean) {
    this.useBodyParser('json', rawBody, { limit: LIMITE_DO_CORPO });
    this.useBodyParser('urlencoded', rawBody, { limit: LIMITE_DO_CORPO, extended: true });
    return original.call(this, prefix, rawBody);
  };
  proto[MARCA] = true;
}
