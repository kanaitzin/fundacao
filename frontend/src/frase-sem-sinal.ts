/**
 * A FRASE DA FALTA DE SINAL (fase 267). Dizia, em toda escrita, "o que você
 * registrar fica guardado neste aparelho"; só a Chamada, a Passagem e o Dia
 * guardam de verdade (a fila, `apiOuFila`), e essas têm a frase delas. A
 * linha da ATA, a ocorrência e o resto ouviam que ficou guardado e não ficou
 * em lugar nenhum. A frase agora diz o que aconteceu: a escrita NÃO foi salva,
 * e a leitura não chegou.
 */
export function fraseSemSinal(metodo?: string): string {
  return (metodo ?? 'GET').toUpperCase() === 'GET'
    ? 'Sem internet agora. Quando o sinal voltar, tente de novo.'
    : 'Sem internet agora, e o que você fez NÃO foi salvo. Quando o sinal voltar, toque de novo.';
}

/*
 * O SERVIDOR QUE NÃO RESPONDE (fase 315). Faltar sinal o navegador avisa na hora; a
 * rede que aceita o pedido e nunca devolve a resposta (o wi-fi que pede login, o
 * servidor travado) não avisava ninguém: o pedido ficava aberto para sempre, e o
 * botão que grava, que espera a resposta, ficava pálido e mudo. Agora a tela espera
 * um tempo e diz o que sabe.
 *
 * A FRASE DA ESCRITA É DIFERENTE DA DE SEM SINAL, de propósito: sem resposta, o
 * servidor pode ter gravado. Dizer "NÃO foi salvo" faria a pessoa registrar de novo,
 * e na ATA isso é linha repetida que não se apaga.
 */
export const ESPERA_DA_LEITURA_MS = 45_000;
export const ESPERA_DA_ESCRITA_MS = 120_000;
/** O envio grande (o PDF de 15 MB num 3G) ganha tempo pelo tamanho: um segundo a cada 20 mil caracteres. */
export function esperaDoPedido(metodo?: string, tamanhoDoCorpo = 0): number {
  return (metodo ?? 'GET').toUpperCase() === 'GET'
    ? ESPERA_DA_LEITURA_MS
    : ESPERA_DA_ESCRITA_MS + Math.ceil(tamanhoDoCorpo / 20_000) * 1000;
}
export function fraseSemResposta(metodo?: string): string {
  return (metodo ?? 'GET').toUpperCase() === 'GET'
    ? 'O servidor demorou demais para responder. Tente de novo em instantes.'
    : 'O servidor não respondeu a tempo. Pode ter gravado ou não: confira na tela antes de registrar de novo.';
}
