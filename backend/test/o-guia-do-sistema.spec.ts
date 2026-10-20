/**
 * O GUIA DO SISTEMA ACOMPANHA CADA ATUALIZAÇÃO (fase 231, pedido de 19/10: "a
 * cada atualização que fizermos, também atualize esse menu de explicação").
 *
 * O Guia (`frontend/src/screens/Guia.tsx`) lê o que cada tela é da lista da
 * Acolhe+AI e o que cada cargo faz do mapa de alcance; o resto mora em
 * `frontend/src/guia-do-sistema.ts`. Esta suíte nega por padrão:
 *
 * tela nova sem o que a Acolhe+AI faz nela, ou sem a descrição; aba nova do
 * perfil sem explicação; e a fase que terminou sem a linha dela nas Novidades.
 * Quem fecha a fase no CLAUDE.md e esquece o Guia vê esta suíte reprovar.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ABAS_DO_PERFIL_NO_GUIA, ALTO_DO_PERFIL, A_ACOLHE_EM_TODA_TELA, COM_A_ACOLHE, CURTA_DO_TURNO,
  MINHA_CONTA_NO_GUIA, NOVIDADES, telasDescritas,
} from '../../frontend/src/guia-do-sistema';
import { ALCANCE_POR_CARGO } from '../src/modules/identity/alcance';

const RAIZ = join(__dirname, '..', '..');
const FRONT = join(RAIZ, 'frontend', 'src');
const ler = (p: string) => readFileSync(p, 'utf8');

/** As telas do sistema: as abas do turno, as portas e os avisos. */
function telasDoSistema(): string[] {
  const portas = [...ler(join(FRONT, 'portas.ts')).matchAll(/aba: '([a-z_]+)'/g)].map((m) => m[1]);
  const app = ler(join(FRONT, 'App.tsx'));
  const trecho = app.slice(app.indexOf('const abasDoTurno = ['), app.indexOf('].filter((t) => ve(t.aba))'));
  const doTurno = [...trecho.matchAll(/aba: '([a-z_]+)'/g)].map((m) => m[1]);
  return [...new Set([...doTurno, ...portas, 'avisos'])];
}

describe('O Guia do sistema', () => {
  const telas = telasDoSistema();

  it('toda tela tem a descrição e o que a Acolhe+AI faz nela, e o Guia não fala de tela que não existe', () => {
    expect(telas.length).toBeGreaterThan(30);
    const descritas = telasDescritas();
    expect(telas.filter((t) => !descritas.has(t))).toEqual([]);
    expect(telas.filter((t) => !(COM_A_ACOLHE[t] ?? '').trim())).toEqual([]);
    expect(Object.keys(COM_A_ACOLHE).filter((t) => !telas.includes(t))).toEqual([]);
  });

  it('toda aba do turno tem a linha curta do Guia', () => {
    const app = ler(join(FRONT, 'App.tsx'));
    const trecho = app.slice(app.indexOf('const abasDoTurno = ['), app.indexOf('].filter((t) => ve(t.aba))'));
    const doTurno = [...trecho.matchAll(/aba: '([a-z_]+)'/g)].map((m) => m[1]);
    expect(doTurno.filter((t) => !CURTA_DO_TURNO[t])).toEqual([]);
  });

  it('o Guia é a primeira porta, e todo cargo com menu o alcança', () => {
    const portas = [...ler(join(FRONT, 'portas.ts')).matchAll(/aba: '([a-z_]+)'/g)].map((m) => m[1]);
    expect(portas[0]).toBe('guia');
    const sem = ALCANCE_POR_CARGO.filter((a) => a.cargo !== 'portaria' && !a.areas.some((x) => x.area === 'guia'))
      .map((a) => a.cargo);
    expect(sem).toEqual([]);
  });

  it('toda aba do perfil da criança está no Guia, na mesma ordem', () => {
    const acolhidos = ler(join(FRONT, 'screens', 'Acolhidos.tsx'));
    const lista = acolhidos.slice(acolhidos.indexOf('const ABAS_DO_PERFIL'), acolhidos.indexOf('];', acolhidos.indexOf('const ABAS_DO_PERFIL')));
    const doPerfil = [...lista.matchAll(/id: '([a-z_]+)'/g)].map((m) => m[1]);
    expect(doPerfil.length).toBeGreaterThan(5);
    expect(ABAS_DO_PERFIL_NO_GUIA.map((a) => a.id)).toEqual(doPerfil);
  });

  it('a fase que terminou tem a linha dela nas Novidades', () => {
    const claude = ler(join(RAIZ, 'CLAUDE.md'));
    const fase = Number(/### Onde estamos — [^,]+, fase (\d+)/.exec(claude)?.[1]);
    expect(fase).toBeGreaterThan(230);
    expect(NOVIDADES[0].fase).toBe(fase);
    // A mais recente em cima, sem fase repetida.
    expect(NOVIDADES.every((n, i) => i === 0 || NOVIDADES[i - 1].fase > n.fase)).toBe(true);
    // A novidade que aponta para uma tela aponta para uma que existe.
    expect(NOVIDADES.filter((n) => n.aba && !telas.includes(n.aba)).map((n) => n.aba)).toEqual([]);
  });

  it('o Guia fala como colega: sem travessão e sem frase que argumenta', () => {
    const MARCAS = /—|o sistema não|não existe|de prop[óo]sito|justamente|não é (medição|avaliação|julgamento|supervisão)|por construção|é por isso que/i;
    const textos = [
      ...Object.values(COM_A_ACOLHE), ...Object.values(CURTA_DO_TURNO), ...ABAS_DO_PERFIL_NO_GUIA.flatMap((a) => [a.texto, a.quem ?? '']),
      ALTO_DO_PERFIL, ...A_ACOLHE_EM_TODA_TELA, ...MINHA_CONTA_NO_GUIA, ...NOVIDADES.map((n) => n.texto),
      ...[...telasDescritas().values()].map((t) => t.texto),
    ];
    expect(textos.filter((t) => MARCAS.test(t))).toEqual([]);
  });
});
