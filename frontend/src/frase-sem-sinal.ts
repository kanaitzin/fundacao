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
