/**
 * O BOTÃO QUE GRAVA (fase 265).
 *
 * Medido no protótipo com a rede lenta: dois toques em "Registrar linha" e a
 * mesma linha entrava duas vezes na ATA, que não se apaga. A guarda mora num
 * lugar só (`frontend/src/botao-que-grava.ts`), ligada pelo `api()` a toda
 * escrita; este teste cobra que ela continue ligada e que nenhuma escrita nova
 * passe por fora. O toque de verdade é cobrado pelo `ensaio:uso`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fraseDoFeito } from '../../frontend/src/botao-que-grava.regra';

const SRC = join(__dirname, '..', '..', 'frontend', 'src');
const ler = (f: string) => readFileSync(join(SRC, f), 'utf8');

describe('O botão que grava', () => {
  it('diz o fato e a hora, pelo verbo do rótulo', () => {
    expect(fraseDoFeito('Registrar linha', '23:04')).toBe('Registrado às 23:04');
    expect(fraseDoFeito('Registrar linha com 2 anexos', '07:15')).toBe('Registrado às 07:15');
    expect(fraseDoFeito('Salvar alterações', '10:00')).toBe('Salvo às 10:00');
    expect(fraseDoFeito('  Assinar o plantão ', '20:01')).toBe('Assinado às 20:01');
    expect(fraseDoFeito('Concluí as atividades coletivas até agora', '18:30')).toBe('Concluído às 18:30');
  });

  it('e não inventa frase para o botão que não grava um registro', () => {
    for (const r of ['Abrir ocorrência e avisar', 'Entrar no sistema', 'Baixar em Word', 'Cancelar', 'Ver', 'Voltou agora', ''])
      expect(fraseDoFeito(r, '23:04')).toBeNull();
  });

  it('toda escrita do api() passa pela guarda, e a guarda é ligada antes de qualquer tela', () => {
    const api = ler('api.ts');
    const corpo = api.slice(api.indexOf('export async function api<T>'), api.indexOf('async function pedir<T>'));
    expect(corpo).toMatch(/comecarEscrita\(path\)/);
    expect(corpo).toMatch(/terminar\(true\)/);
    expect(corpo).toMatch(/terminar\(false\)/);
    /* Só a fila que sobe sozinha fica de fora: ela não nasce de toque nenhum. */
    expect(corpo).toMatch(/metodo === 'GET' \|\| path === '\/sync\/push'/);
    expect(ler('main.tsx')).toMatch(/ligarBotaoQueGrava\(\);/);
  });

  it('nenhuma escrita nova vai ao servidor por fora do api()', () => {
    const api = ler('api.ts');
    /* Os dois `fetch` do servidor moram no api.ts: o do `pedir` e o da
       conversa da Acolhe+AI, que tem o próprio estado de pensando. */
    const fetches = api.match(/await fetch\(`\$\{BASE\}/g) ?? [];
    expect(fetches).toHaveLength(2);
    expect(api.slice(api.indexOf('export async function apiAosPoucos'))).toMatch(/await fetch\(`\$\{BASE\}/);
  });
});
