import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * KERNEL — cifra de segredos guardados (§6.10, §22).
 *
 * Serve a UM caso: as credenciais de acesso dos acolhidos (gov.br, INSS,
 * CTPS, banco) que a coordenação precisa consultar. Senha de USUÁRIO do
 * sistema não passa por aqui — aquela é hash irreversível (`crypto.ts`), e a
 * diferença é essencial: senha de usuário ninguém precisa ler de volta; senha
 * do gov.br de uma criança alguém precisa, para resolver o benefício dela.
 *
 * AES-256-GCM: cifra e autentica. Se um byte for alterado no banco, a
 * decifragem falha em vez de devolver lixo silencioso.
 *
 * A chave vem de `CREDENTIAL_KEY` e nunca do código. Em desenvolvimento há
 * uma chave fixa e declaradamente falsa — o ambiente de dev não guarda
 * credencial real (§3.3), e usar a mesma chave em produção deixaria o cofre
 * aberto para qualquer um que leia este arquivo.
 */

const DEV_KEY = 'chave-de-desenvolvimento-nao-usar-em-producao';

function chave(): Buffer {
  const bruta = process.env.CREDENTIAL_KEY;
  if (!bruta) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CREDENTIAL_KEY ausente. O cofre de credenciais não abre sem a chave do ambiente.');
    }
    return createHash('sha256').update(DEV_KEY).digest();
  }
  // Aceita chave em base64 de 32 bytes ou texto longo, sempre derivando 32 bytes.
  return createHash('sha256').update(bruta).digest();
}

/** Devolve "v1.<iv>.<tag>.<cifrado>", tudo em base64url. */
export function cifrarSegredo(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'),
          dados.toString('base64url')].join('.');
}

export function decifrarSegredo(guardado: string): string {
  const [versao, iv, tag, dados] = guardado.split('.');
  if (versao !== 'v1' || !iv || !tag || !dados) {
    throw new Error('Formato de segredo desconhecido.');
  }
  const d = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64url')), d.final()]).toString('utf8');
}

/**
 * Dica automática: primeiro caractere, tamanho e último caractere.
 *
 * Serve para a coordenação CONFERIR se a senha é a que ela espera sem abrir o
 * cofre — a maior parte das consultas é isso, e cada abertura evitada é um
 * registro a menos de exposição.
 */
export function dicaDe(texto: string): string {
  if (texto.length <= 3) return '•'.repeat(texto.length);
  return `${texto[0]}${'•'.repeat(Math.min(texto.length - 2, 10))}${texto[texto.length - 1]} (${texto.length})`;
}
