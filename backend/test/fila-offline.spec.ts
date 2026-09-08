/**
 * A FILA OFFLINE FALA A MESMA LÍNGUA NAS TRÊS PONTAS.
 *
 * `tipos-offline.ts` é lido pelo servidor, pelo aparelho e pelo servidor de
 * mentira do protótipo. Uma lista escrita à mão em qualquer uma das pontas
 * envelhece calada, e o preço é sempre o mesmo: o aparelho guarda a noite
 * inteira uma operação que o servidor recusa por "tipo desconhecido" na
 * primeira barra de sinal — e quem registrou acredita ter registrado.
 *
 * Este teste é estático de propósito. Ele precisa falhar no `npm test` de
 * quem acrescentou um handler, não na casa, de madrugada.
 *
 * Ele já pegou uma: o `mock.ts` anunciava `check.confirm`, que o servidor não
 * sabe aplicar, e omitia `activity.acknowledge` e `health.evolution`, que ele
 * sabe. Era a regra 14 outra vez — servidor de mentira respondendo o que a
 * tela queria, e não o que o servidor responde.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TIPOS_OFFLINE, TIPOS_OFFLINE_KINDS } from '../src/modules/sync/tipos-offline';

const SRC = join(__dirname, '..', 'src');
const FRONT = join(__dirname, '..', '..', 'frontend', 'src');

function arquivos(dir: string, ext = '.ts'): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho, ext));
    else if (nome.endsWith(ext) || nome.endsWith('.tsx')) saida.push(caminho);
  }
  return saida;
}

describe('fila offline — a lista de tipos', () => {
  const registrados = new Set<string>();
  for (const f of arquivos(SRC)) {
    const texto = readFileSync(f, 'utf8');
    for (const m of texto.matchAll(/registerHandler\(\s*'([^']+)'/g)) registrados.add(m[1]);
  }

  it('todo handler registrado no servidor tem linha em tipos-offline.ts', () => {
    const semLinha = [...registrados].filter((k) => !TIPOS_OFFLINE_KINDS.includes(k));
    expect(semLinha).toEqual([]);
  });

  it('toda linha de tipos-offline.ts tem handler no servidor', () => {
    const semHandler = TIPOS_OFFLINE_KINDS.filter((k) => !registrados.has(k));
    expect(semHandler).toEqual([]);
  });

  it('medicamento é o único que não se guarda sem sinal', () => {
    /*
     * A marca do arquivo compartilhado é lida pelos DOIS lados: o aparelho
     * recusa na hora o que está marcado, e o servidor recusa na porta de
     * entrada. Se as duas pontas discordassem, o aparelho guardaria a noite
     * inteira uma operação que volta rejeitada — e, até voltar, a educadora
     * acredita ter registrado.
     *
     * Até 08/09/2026 a marca se chamava `exigeAparelhoInstitucional` e valia o
     * §11.7: offline, só o aparelho registrado da casa confirmava dose. Com o
     * sistema no celular de cada pessoa, esse aparelho deixou de existir como
     * trava, e a regra passou a ser "dose não se confirma sem sinal, em
     * aparelho nenhum" (migração 0930).
     */
    for (const t of TIPOS_OFFLINE) {
      expect(t.foraDaFilaOffline).toBe(t.kind.startsWith('medication.'));
    }
  });

  it('a porta de entrada lê a MARCA, e não uma lista escrita à mão', () => {
    /*
     * O `sync.service` decidia por `kind.startsWith('medication.')` — a regra
     * repetida em prosa, num arquivo, longe da lista. Agora ele pergunta ao
     * mesmo `tipoOffline()` que o aparelho consulta: a próxima operação que
     * não puder ser guardada sem sinal ganha a marca em UM lugar.
     */
    const servico = readFileSync(join(SRC, 'modules', 'sync', 'sync.service.ts'), 'utf8');
    expect(servico).toContain('tipoOffline(op.kind)?.foraDaFilaOffline');
    expect(servico).not.toContain("op.kind.startsWith('medication.')");
  });
});

describe('fila offline — as duas outras pontas', () => {
  it('o aparelho lê a lista compartilhada, em vez de repeti-la', () => {
    const fila = readFileSync(join(FRONT, 'fila-offline.ts'), 'utf8');
    expect(fila).toContain("modules/sync/tipos-offline");
    /* Nenhum `kind` escrito à mão dentro da fila: se aparecer um, ele vai
     * divergir do servidor no dia em que a lista mudar. */
    for (const kind of TIPOS_OFFLINE_KINDS) {
      expect(fila.includes(`'${kind}'`)).toBe(false);
    }
  });

  it('o servidor de mentira anuncia a mesma lista', () => {
    const mock = readFileSync(join(FRONT, 'mock.ts'), 'utf8');
    expect(mock).toContain('TIPOS_OFFLINE_KINDS');
    expect(mock).toContain("rota === '/sync/push'");
  });

  it('o protótipo não apaga da fila o que o servidor não confirmou', () => {
    /*
     * O `podeLimpar` do mock precisa ser calculado a partir dos resultados,
     * como no servidor. Um mock que devolva todos os ids ensinaria a equipe a
     * confiar num apagamento que o sistema real não faz (§17.2).
     */
    const mock = readFileSync(join(FRONT, 'mock.ts'), 'utf8');
    const trecho = mock.slice(mock.indexOf("rota === '/sync/push'"));
    expect(trecho).toContain("podeLimpar: resultados.filter");
  });
});
