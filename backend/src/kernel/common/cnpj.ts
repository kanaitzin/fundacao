/**
 * CNPJ do fornecedor da nota fiscal (fase 161): normalização e dígitos
 * verificadores. Diferente do CPF, é dado de empresa — sai inteiro na nota e
 * no relatório de compras.
 */
export function normalizarCnpj(entrada: string): string {
  return String(entrada ?? '').replace(/\D/g, '');
}

export function cnpjConfere(entrada: string): boolean {
  const c = normalizarCnpj(entrada);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const digito = (ate: number) => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((n, p, i) => n + p * Number(c[i]), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(c[12]) && digito(13) === Number(c[13]);
}

export function formatarCnpj(c: string): string {
  const d = normalizarCnpj(c);
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : c;
}
