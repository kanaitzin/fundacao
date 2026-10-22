/**
 * OS ANEXOS DE UMA MENSAGEM (fase 233, pedido de 22/10).
 *
 * *"Podendo enviar até 10 anexos por mensagem."* Decidido em 22/10 onde vale:
 * a conversa da Acolhe+AI, a ocorrência, o diário da internação, o atendimento
 * da equipe técnica e a linha da ATA. O documento do dossiê, a receita, a nota
 * fiscal e as fotos de identificação continuam com um arquivo cada: cada um é
 * um documento só, e o de várias páginas já vira um PDF na digitalização.
 *
 * Não importa nada, como o `alcance.ts`: o servidor recusa e a tela avisa
 * antes de enviar lendo a MESMA regra, e as duas não podem divergir.
 *
 * O TOTAL POR ENVIO: a mensagem viaja num pedido só, em base64 (um terço
 * maior), e o servidor lê até 25 MB por pedido (`corpo-da-requisicao.ts`).
 * Quinze megabytes de arquivo cabem com folga. A foto sai reduzida do aparelho
 * (perto de meio megabyte) e o documento digitalizado de três páginas fica
 * abaixo de 3 MB: dez fotos ou três documentos cabem num envio.
 */
export const MAXIMO_DE_ANEXOS_POR_MENSAGEM = 10;
export const MAXIMO_DE_MB_POR_MENSAGEM = 15;

/** Quanto um base64 (com ou sem o `data:...,` na frente) pesa em bytes. */
export function bytesDoBase64(conteudo: string): number {
  const limpo = conteudo.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  const iguais = limpo.endsWith('==') ? 2 : limpo.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((limpo.length * 3) / 4) - iguais);
}

/**
 * O que está errado com os anexos desta mensagem, na frase que a pessoa lê;
 * `null` quando cabem. Recebe os tamanhos em bytes, para servir à tela (que
 * tem o arquivo) e ao servidor (que tem o base64).
 */
export function recusaDosAnexos(tamanhos: number[]): string | null {
  if (tamanhos.length > MAXIMO_DE_ANEXOS_POR_MENSAGEM) {
    return `Cabem até ${MAXIMO_DE_ANEXOS_POR_MENSAGEM} anexos por mensagem. Tire ${tamanhos.length - MAXIMO_DE_ANEXOS_POR_MENSAGEM} `
      + 'e mande numa mensagem seguinte.';
  }
  const total = tamanhos.reduce((s, t) => s + t, 0);
  if (total > MAXIMO_DE_MB_POR_MENSAGEM * 1024 * 1024) {
    const mb = (total / 1024 / 1024).toFixed(1).replace('.', ',');
    return `Os anexos somam ${mb} MB, e cabem ${MAXIMO_DE_MB_POR_MENSAGEM} MB por mensagem. `
      + 'Mande os maiores numa mensagem seguinte.';
  }
  return null;
}
