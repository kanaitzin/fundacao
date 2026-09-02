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

const SRC = join(__dirname, '..', 'src');

/**
 * A lista de cargos que o SERVIDOR aplica numa área.
 *
 * Marcada no código com `/* alcance:<área> *\/` logo acima do `if`. É o
 * contrário de uma lista paralela: o teste vai LER a regra que roda, e não uma
 * cópia dela. Se alguém mudar quem movimenta o armário, a página que promete
 * isso à coordenação quebra junto — que é o objetivo.
 */
function listaDoServidor(area: string, arquivo: string): string[] {
  const src = readFileSync(join(SRC, arquivo), 'utf8');
  const m = new RegExp(`alcance:${area}[^*]*\\*/\\s*if \\(![^\\[]*\\[([^\\]]*)\\]`, 's').exec(src);
  if (!m) throw new Error(`Não encontrei a marca alcance:${area} em ${arquivo}`);
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

  it('permissão sem porta: o que o SERVIDOR autoriza, a página não esconde', () => {
    // Áreas cuja regra do servidor é uma lista de cargos, marcada no código.
    const marcas: Record<string, string> = {
      saude: 'modules/medications/medications.service.ts',
      cofre: 'modules/people/credentials.service.ts',
      arquivo: 'modules/archive/archive.service.ts',
      acompanhamentos: 'modules/reports/followups.service.ts',
      rotina: 'modules/routine/routine.service.ts',
      painel: 'modules/reports/panel.service.ts',
      sincronizacao: 'modules/sync/sync.service.ts',
    };
    /*
     * O sentido importa. Comparar "a página promete e o servidor recusa" acusa
     * falso: o Líder Diurno ACOMPANHA a saúde da casa sem movimentar o
     * armário, e as duas coisas são a mesma área.
     *
     * O que a máquina pega sem ambiguidade é o contrário — permissão sem
     * porta: o servidor autoriza um cargo e a página nem menciona a área para
     * ele. Foi assim que apareceram a equipe técnica no armário e a
     * administração técnica na fila do arquivo, as duas em 31/08.
     */
    const problemas: string[] = [];
    for (const [area, arquivo] of Object.entries(marcas)) {
      for (const cargo of listaDoServidor(area, arquivo)) {
        const a = ALCANCE_POR_CARGO.find((x) => x.cargo === cargo);
        if (!a) { problemas.push(`${cargo}: o servidor autoriza "${area}" e o cargo não existe na página`); continue; }
        if (!a.areas.some((x) => x.area === area)) {
          problemas.push(`${cargo}: o servidor autoriza "${area}" e a página não oferece — permissão sem porta`);
        }
      }
    }
    expect(problemas).toEqual([]);
  });

  it('o menu do aplicativo é DERIVADO do alcance, não uma segunda lista', () => {
    // Guarda contra a volta das constantes VE_*: enquanto o App.tsx perguntar
    // ao mapa, página e menu não podem divergir. Se alguém recriar uma lista
    // de cargos lá, este teste avisa antes de a divergência aparecer na casa.
    const app = readFileSync(join(__dirname, '..', '..', 'frontend', 'src', 'App.tsx'), 'utf8');
    expect(app).toContain('ALCANCE_POR_CARGO');
    expect(app).toContain('const alcanca =');
    expect(app).not.toMatch(/const VE_[A-Z_]+ = \[/);
  });
});
