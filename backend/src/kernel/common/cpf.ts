/**
 * CPF: normalização e validação de dígitos verificadores (§6.1).
 * O CPF é identificador único institucional — nunca vai para nome de arquivo,
 * log de aplicação, relatório da cozinha ou notificação (§3.3, §20).
 */

export function normalizeCpf(input: string): string {
  return (input ?? '').replace(/\D/g, '');
}

export function isValidCpf(input: string): boolean {
  const cpf = normalizeCpf(input);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // 000...0, 111...1 etc.

  const digit = (upTo: number): number => {
    let sum = 0;
    for (let i = 0; i < upTo; i++) sum += Number(cpf[i]) * (upTo + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/** Exibição operacional mascarada — minimização (§3.1). */
export function maskCpf(cpf: string | null): string | null {
  const c = normalizeCpf(cpf ?? '');
  if (c.length !== 11) return null;
  return `***.***.${c.slice(6, 9)}-**`;
}

/** Formatação completa: só onde for juridicamente necessário. */
export function formatCpf(cpf: string): string {
  const c = normalizeCpf(cpf);
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}
