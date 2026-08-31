/**
 * O QUE CADA SETOR ENXERGA — a página e o menu não podem discordar.
 *
 * `alcance.ts` é mantido à mão: é prosa, e prosa não se deduz do código. O que
 * a máquina pode cobrar é que ela não minta por descuido —
 *
 *  * todo cargo do sistema tem resposta, e nenhum cargo inventado entra;
 *  * ninguém aparece sem áreas nem sem a lista do que NÃO alcança (ausência é
 *    informação: metade da resposta é o que a pessoa não vê);
 *  * as proibições do §2 valem para todos, e estão em todos;
 *  * e, o principal: se a página diz que um cargo alcança uma área, o MENU do
 *    aplicativo precisa oferecer essa área a esse cargo. Divergência aqui é
 *    defeito dos dois lados — a coordenação lê uma coisa e a pessoa vê outra.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALCANCE_POR_CARGO } from '../src/modules/identity/alcance';
import { SETORES } from '../src/modules/identity/staff.service';

const APP = readFileSync(
  join(__dirname, '..', '..', 'frontend', 'src', 'App.tsx'), 'utf8');

/** Lê uma lista de cargos declarada no menu do aplicativo. */
function listaDoMenu(nome: string): string[] {
  const m = new RegExp(`const ${nome} = \\[([^\\]]*)\\]`, 's').exec(APP);
  if (!m) throw new Error(`Não encontrei ${nome} no App.tsx`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

describe('Alcance por setor', () => {
  it('todo cargo do sistema tem resposta, e não há cargo inventado', () => {
    const doSistema = SETORES.map((s) => s.code).sort();
    const daPagina = ALCANCE_POR_CARGO.map((a) => a.cargo).sort();
    expect(daPagina).toEqual(doSistema);
  });

  it('ninguém aparece sem áreas nem sem o que NÃO alcança', () => {
    for (const a of ALCANCE_POR_CARGO) {
      expect(a.areas.length).toBeGreaterThan(0);
      expect(a.naoAlcanca.length).toBeGreaterThan(0);
      expect(a.resumo.length).toBeGreaterThan(20);
    }
  });

  it('as proibições que valem para todos estão em todos', () => {
    for (const a of ALCANCE_POR_CARGO) {
      const texto = a.naoAlcanca.join(' | ');
      expect(texto).toContain('WhatsApp');
      expect(texto).toContain('GPS');
      expect(texto).toContain('conta compartilhada');
      expect(texto).toContain('ranking');
    }
  });

  it('o transversal da página é o mesmo do cadastro de setores', () => {
    for (const a of ALCANCE_POR_CARGO) {
      const setor = SETORES.find((s) => s.code === a.cargo)!;
      expect({ cargo: a.cargo, transversal: a.transversal })
        .toEqual({ cargo: a.cargo, transversal: setor.transversal });
    }
  });

  it('o menu do aplicativo oferece as áreas que a página promete', () => {
    // As áreas cujo menu é decidido por uma lista de cargos no App.tsx.
    const guardas: Record<string, string> = {
      saude: 'VE_SAUDE', cofre: 'VE_COFRE', acompanhamentos: 'VE_ACOMPANHAMENTOS',
      transferencias: 'VE_TRANSFERENCIAS', arquivo: 'VE_ARQUIVO', equipe: 'ADMINISTRA_EQUIPE',
    };
    const problemas: string[] = [];
    for (const a of ALCANCE_POR_CARGO) {
      for (const area of a.areas) {
        const guarda = guardas[area.area];
        if (!guarda) continue;
        if (!listaDoMenu(guarda).includes(a.cargo)) {
          problemas.push(
            `${a.cargo} · a página promete "${area.titulo}", e o menu (${guarda}) não oferece`);
        }
      }
    }
    expect(problemas).toEqual([]);
  });
});
