import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';

/**
 * A PORTA PARA A INTERNET (fase 179).
 *
 * Até a análise de 30/09 o servidor foi escrito para a rede da casa: aceitava
 * pedido de qualquer origem com credencial (`origin: true`), não dizia ao
 * navegador nada sobre moldura, tipo ou cache, e atrás de um proxy registrava
 * o IP do PROXY em toda sessão e em toda tentativa de entrada. Nada disso
 * quebra no piloto; tudo isso importa no dia em que o endereço sair da casa.
 *
 * Mora no kernel e é ligado pelo `AppModule` (lição da fase 155): o que o
 * `main.ts` liga, a suíte não vê.
 */

/**
 * OS CABEÇALHOS. A API só devolve JSON e arquivos que a tela pede, então a
 * política é a mais fechada: nada carrega de lugar nenhum, nada abre em
 * moldura, e nada fica guardado em cache de navegador ou de proxy. O dossiê de
 * uma criança não pode sobrar no cache de um computador da sala.
 */
export function cabecalhosDeSeguranca(req: Request, res: Response, next: NextFunction) {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  /* HSTS só quando o pedido chegou por HTTPS: mandado por HTTP ele não vale, e
     em desenvolvimento prenderia o localhost em HTTPS no navegador de quem testa.
     Atrás do proxy, o `req.secure` depende do `TRUST_PROXY`. */
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

/**
 * O CORS FECHADO POR PADRÃO. A tela fala com a API pelo mesmo endereço
 * (`/api/v1`, pelo proxy na implantação e pelo Vite no desenvolvimento), e por
 * isso não precisa de CORS nenhum. Só quem listar origens em `CORS_ORIGIN`
 * abre a porta, e só para elas. Antes, sem a variável, a resposta era
 * `origin: true`: qualquer página da internet podia chamar a API com a sessão.
 */
export function corsDaInstituicao() {
  const origens = (process.env.CORS_ORIGIN ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
  return cors({ origin: origens.length ? origens : false, credentials: true });
}

/**
 * QUANTOS PROXIES HÁ NA FRENTE (`TRUST_PROXY`). Sem isto, atrás do proxy, o
 * IP de toda sessão e de toda tentativa de entrada é o do proxy, e a
 * investigação de um acesso estranho não tem por onde começar. E o contrário é
 * pior: confiar no `X-Forwarded-For` sem proxy na frente deixa qualquer um
 * escrever o IP que quiser. Por isso o padrão é NÃO confiar.
 *
 * Aceita um número (quantos saltos), `loopback`, ou uma lista de endereços.
 */
export function confiancaNoProxy(): boolean | number | string | undefined {
  const v = process.env.TRUST_PROXY?.trim();
  if (!v || v === 'nao' || v === 'false' || v === '0') return undefined;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
