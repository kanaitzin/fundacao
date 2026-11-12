/**
 * A MENSAGEM DO E-MAIL, COM APRESENTAÇÃO (pedido de 12/11).
 *
 * O convite e o esqueci minha senha saíam só em texto puro. Continuam saindo em
 * texto, e ganham ao lado a mesma mensagem em HTML: o programa de e-mail mostra
 * a versão com apresentação, e o que não mostra HTML (ou a pessoa que desligou)
 * lê o texto de sempre. As duas dizem a mesma coisa, frase por frase.
 *
 * O QUE ESTE HTML NÃO TEM, DE PROPÓSITO:
 *  - imagem, fonte ou folha de estilo buscada de fora: o programa de e-mail
 *    bloqueia, a mensagem chega quebrada, e a busca conta a quem hospeda a
 *    imagem que a pessoa abriu o e-mail;
 *  - script, formulário, rastreio de abertura ou de clique;
 *  - outro endereço que não o do próprio sistema.
 * O estilo vai todo na própria etiqueta, em tabela, que é o que o Outlook e o
 * Gmail entendem do mesmo jeito.
 *
 * TUDO O QUE VEM DE FORA É ESCAPADO: o nome da pessoa foi digitado por alguém
 * e entra aqui como texto, nunca como HTML.
 */

export interface PartesDaMensagem {
  /** A linha que aparece na lista de mensagens, ao lado do assunto. */
  resumo: string;
  /** O nome de quem recebe, como está no cadastro. */
  nome: string;
  titulo: string;
  /** Os parágrafos antes do botão. */
  antes: string[];
  botao: string;
  link: string;
  /** A validade do link: vai em destaque, logo abaixo do botão. */
  validade: string;
  /** Os parágrafos depois: o que fazer se não foi você, e o lembrete da senha. */
  depois: string[];
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

/** Texto de fora, seguro dentro do HTML e dentro de um atributo. */
export const escapar = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/* As cores da marca no tema claro do sistema (`--brand`, `--brand-soft` do
   `styles.css`). O e-mail não tem tema: o programa de e-mail escolhe o fundo. */
const MARCA = '#005993';
const MARCA_CLARA = '#E2EFF9';
const TINTA = '#1B2733';
const TINTA_SUAVE = '#51606E';
const FUNDO = '#F2F5F8';
const FONTE = "font-family:Arial,Helvetica,sans-serif;";

/** A versão em texto puro: a de sempre, e a que o log nunca copia. */
export function emTexto(m: PartesDaMensagem): string {
  return [
    `${m.nome},`,
    '',
    ...m.antes,
    '',
    m.link,
    '',
    m.validade,
    '',
    ...m.depois,
  ].join('\n');
}

/** A mesma mensagem, com apresentação. */
export function emHtml(m: PartesDaMensagem): string {
  const p = (t: string, cor = TINTA) =>
    `<p style="margin:0 0 14px 0;${FONTE}font-size:16px;line-height:24px;color:${cor};">${escapar(t)}</p>`;
  const link = escapar(m.link);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapar(m.titulo)}</title>
</head>
<body style="margin:0;padding:0;background-color:${FUNDO};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${FUNDO};">${escapar(m.resumo)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${FUNDO};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="background-color:${MARCA};border-radius:12px 12px 0 0;padding:22px 28px;">
<div style="${FONTE}font-size:20px;line-height:26px;font-weight:bold;color:#FFFFFF;">Rede Acolher</div>
<div style="${FONTE}font-size:13px;line-height:18px;color:#D6E8F5;">Fundação O Pão dos Pobres</div>
</td></tr>
<tr><td style="background-color:#FFFFFF;padding:28px 28px 8px 28px;">
<h1 style="margin:0 0 18px 0;${FONTE}font-size:22px;line-height:28px;font-weight:bold;color:${TINTA};">${escapar(m.titulo)}</h1>
${p(`${m.nome},`)}
${m.antes.map((t) => p(t)).join('\n')}
</td></tr>
<tr><td align="center" style="background-color:#FFFFFF;padding:8px 28px 8px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" bgcolor="${MARCA}" style="border-radius:10px;">
<a href="${link}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 30px;${FONTE}font-size:17px;line-height:22px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapar(m.botao)}</a>
</td></tr>
</table>
</td></tr>
<tr><td style="background-color:#FFFFFF;padding:16px 28px 4px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="background-color:${MARCA_CLARA};border-radius:10px;padding:12px 16px;${FONTE}font-size:15px;line-height:22px;color:${TINTA};">${escapar(m.validade)}</td></tr>
</table>
</td></tr>
<tr><td style="background-color:#FFFFFF;padding:16px 28px 6px 28px;">
${m.depois.map((t) => p(t, TINTA_SUAVE)).join('\n')}
</td></tr>
<tr><td style="background-color:#FFFFFF;border-top:1px solid #E3E8ED;border-radius:0 0 12px 12px;padding:16px 28px 22px 28px;">
<p style="margin:0 0 6px 0;${FONTE}font-size:13px;line-height:19px;color:${TINTA_SUAVE};">Se o botão não abrir, copie este endereço e cole no navegador:</p>
<p style="margin:0;${FONTE}font-size:13px;line-height:19px;word-break:break-all;"><a href="${link}" target="_blank" rel="noopener" style="color:${MARCA};">${link}</a></p>
</td></tr>
<tr><td align="center" style="padding:16px 28px 0 28px;${FONTE}font-size:12px;line-height:18px;color:${TINTA_SUAVE};">
Mensagem automática do Rede Acolher. Não é preciso responder.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}
