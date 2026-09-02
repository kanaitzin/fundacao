/**
 * A CONFIGURAÇÃO QUE NINGUÉM DOCUMENTOU É A QUE DERRUBA A IMPLANTAÇÃO.
 *
 * Cada `process.env.X` do servidor é uma decisão que alguém vai ter que tomar
 * num sábado, com a casa esperando. Se a variável não estiver no
 * `.env.example`, ela some duas vezes: na hora de instalar (ninguém sabe que
 * ela existe) e na hora de restaurar (ninguém sabe que ela precisava vir
 * junto).
 *
 * Este teste é estático e roda no `npm test` de quem acrescentou a variável —
 * não na casa, de madrugada.
 *
 * Ele já pegou duas:
 *
 *  * **oito variáveis fora do `.env.example`**, incluindo a `CREDENTIAL_KEY`,
 *    que é a chave do cofre de credenciais dos acolhidos. Backup do banco sem
 *    ela devolve bytes ilegíveis: o cofre morre com a chave, não com o
 *    servidor;
 *  * **`ARQUIVO_DIR` e `ARQUIVOS_DIR`**, uma letra de diferença, apontando
 *    para acervos DIFERENTES — as cópias documentais arquivadas e os objetos
 *    do dossiê do acolhido. Quem configurasse um acreditando ter configurado
 *    os dois perderia metade do acervo no primeiro backup. A primeira virou
 *    `ARQUIVO_DRIVE_DIR`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const SRC = join(__dirname, '..', 'src');

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else if (nome.endsWith('.ts')) saida.push(caminho);
  }
  return saida;
}

/** `NODE_ENV` é do Node, não do Rede Acolher: ninguém a escreve num `.env`. */
const DO_PROPRIO_NODE = new Set(['NODE_ENV']);

/** Lidas pelas suítes e pelo `preparar-ambiente.sh`, não pelo servidor. */
const SO_DE_DESENVOLVIMENTO = new Set(['DATABASE_URL']);

describe('implantação — nenhuma variável de ambiente fica sem documentação', () => {
  const exemplo = readFileSync(join(RAIZ, '.env.example'), 'utf8');
  const declaradas = new Set(
    [...exemplo.matchAll(/^\s*([A-Z][A-Z_0-9]*)\s*=/gm)].map((m) => m[1]));

  const usadas = new Map<string, string>();
  for (const arq of arquivos(SRC)) {
    const texto = readFileSync(arq, 'utf8');
    for (const m of texto.matchAll(/process\.env\.([A-Z][A-Z_0-9]*)/g)) {
      if (!DO_PROPRIO_NODE.has(m[1])) usadas.set(m[1], arq.slice(arq.indexOf('src')));
    }
  }

  it('toda variável lida pelo servidor está no .env.example', () => {
    const faltando = [...usadas.entries()]
      .filter(([nome]) => !declaradas.has(nome))
      .map(([nome, onde]) => `${nome} — lida em ${onde}`);
    expect(faltando).toEqual([]);
  });

  it('o .env.example não anuncia variável que ninguém lê', () => {
    /*
     * O contrário também custa caro: variável no exemplo e em nenhum código é
     * configuração que a pessoa ajusta com cuidado e que não faz nada. Ela
     * ensina a não confiar no arquivo inteiro.
     */
    const sobrando = [...declaradas]
      .filter((n) => !usadas.has(n) && !SO_DE_DESENVOLVIMENTO.has(n));
    expect(sobrando).toEqual([]);
  });

  it('os dois acervos fora do banco têm nomes que ninguém confunde', () => {
    /*
     * `ARQUIVOS_DIR` guarda os objetos do dossiê do acolhido; o outro, as
     * cópias documentais arquivadas. Nomes que diferem por uma letra fazem
     * alguém configurar um e achar que configurou os dois — e a perda só
     * aparece no dia da restauração.
     */
    expect(usadas.has('ARQUIVO_DIR')).toBe(false);
    expect(usadas.has('ARQUIVOS_DIR')).toBe(true);
    expect(usadas.has('ARQUIVO_DRIVE_DIR')).toBe(true);
  });

  it('o .env.example não traz segredo de verdade', () => {
    /*
     * Regra 2: segredo nunca no código — e o exemplo VAI para o repositório.
     * O que estiver aqui precisa ser obviamente falso para quem lê com pressa.
     */
    for (const chave of ['CREDENTIAL_KEY', 'SESSION_PEPPER']) {
      const linha = exemplo.split('\n').find((l) => l.trim().startsWith(`${chave}=`));
      expect(linha).toBeDefined();
      expect(linha!.toLowerCase()).toMatch(/troque|change|exemplo|dev/);
    }
  });

  it('a chave do cofre está descrita junto do que ela significa para o backup', () => {
    /*
     * A frase precisa estar no arquivo que a pessoa abre para instalar, e não
     * só num documento que ela leria depois: sem a chave, o backup do banco
     * devolve um cofre ilegível; com a chave dentro do backup, devolve um
     * cofre aberto.
     */
    expect(exemplo).toMatch(/CREDENTIAL_KEY/);
    expect(exemplo).toMatch(/fora do backup|JUNTO do backup/i);
  });
});
