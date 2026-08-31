/**
 * O DER NÃO ENVELHECE EM SILÊNCIO.
 *
 * Documentação que a máquina não cobra apodrece na primeira pressa: em 31/08
 * o DER cobria 10 tabelas de 82, e ninguém tinha notado porque nada quebrava.
 *
 * Este teste cobra o mínimo verificável — que toda tabela criada por uma
 * migração APAREÇA no `der.md`. Não cobra que a descrição esteja certa: isso é
 * leitura humana. Cobra que ninguém acrescente uma tabela ao banco e esqueça
 * de dizer para que ela serve.
 *
 * Quando falhar, a correção NÃO é acrescentar o nome numa lista: é escrever
 * por que a tabela existe, junto das outras da partição dela.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MODULES = join(__dirname, '..', 'src', 'modules');
const DER = readFileSync(join(__dirname, '..', '..', 'docs', 'der.md'), 'utf8');

function tabelasCriadas(): { tabela: string; modulo: string }[] {
  const out: { tabela: string; modulo: string }[] = [];
  for (const mod of readdirSync(MODULES)) {
    const dir = join(MODULES, mod, 'migrations');
    if (!existsSync(dir)) continue;
    for (const arq of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(dir, arq), 'utf8');
      for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/g)) {
        if (!out.some((t) => t.tabela === m[1])) out.push({ tabela: m[1], modulo: mod });
      }
    }
  }
  return out;
}

describe('DER', () => {
  const tabelas = tabelasCriadas();

  it('encontra as tabelas das migrações', () => {
    // Sem isto, o teste passaria por não ter lido nada.
    expect(tabelas.length).toBeGreaterThan(70);
  });

  it('toda tabela do banco aparece no der.md', () => {
    const ausentes = tabelas
      .filter(({ tabela }) => {
        // No diagrama o nome vai em MAIÚSCULAS; no inventário e no texto, minúsculo.
        const re = new RegExp(`\\b${tabela}\\b|\\b${tabela.toUpperCase()}\\b`);
        return !re.test(DER);
      })
      .map(({ tabela, modulo }) => `${tabela} (partição ${modulo})`);

    expect(ausentes).toEqual([]);
  });

  it('o inventário conta o mesmo que as migrações criam', () => {
    const m = /## Inventário — (\d+) tabelas por partição/.exec(DER);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(tabelas.length);
  });
});
