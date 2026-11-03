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
import { fraseSemSinal } from '../../frontend/src/frase-sem-sinal';


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
    /* A recusa vai junto (fase 266), menos a falta de sinal e a sessão vencida. */
    expect(corpo).toMatch(/terminar\(false, recusa\)/);
    expect(corpo).toMatch(/e instanceof SemConexao && init && vaiParaAFila\.has\(init\)/);
    expect(corpo).toMatch(/e instanceof ErroApi && e\.status === 401/);
    /* Só a fila que sobe sozinha fica de fora: ela não nasce de toque nenhum. */
    expect(corpo).toMatch(/metodo === 'GET' \|\| path === '\/sync\/push'/);
    expect(ler('main.tsx')).toMatch(/ligarBotaoQueGrava\(\);/);
  });

  it('a recusa fora da vista aparece perto do botão, com a frase do servidor e um Entendi', () => {
    const g = ler('botao-que-grava.ts');
    expect(g).toMatch(/if \(!aVista\) mostrarRecusaPerto\(botao, frase\)/);
    expect(g).toMatch(/setAttribute\('role', 'alert'\)/);
    expect(g).toMatch(/textContent = 'Entendi'/);
    /* A frase vai como texto, nunca como HTML: ela vem do servidor. */
    expect(g).not.toMatch(/innerHTML/);
  });

  it('sem sinal, a escrita diz que NÃO foi salva, e só a fila diz que guardou (fase 267)', () => {
    expect(ler('api.ts')).toMatch(/import \{ fraseSemSinal \} from '\.\/frase-sem-sinal'/);
    /* A frase antiga prometia guardar em toda escrita, e só a fila guarda. */
    for (const f of ['api.ts', 'mock.ts']) {
      const fonte = ler(f).split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
      expect(fonte).not.toMatch(/fica guardado neste aparelho/);
      expect(fonte).toMatch(/new SemConexao\(fraseSemSinal\(/);
    }
    expect(fraseSemSinal('POST')).toMatch(/NÃO foi salvo/);
    expect(fraseSemSinal('PATCH')).toMatch(/NÃO foi salvo/);
    expect(fraseSemSinal('GET')).not.toMatch(/salvo/);
    expect(fraseSemSinal()).not.toMatch(/salvo/);
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
