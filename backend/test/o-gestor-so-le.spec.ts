/**
 * O GESTOR GERAL LÊ A CASA, E NÃO REGISTRA NELA (fase 246, decisão de 25/10).
 *
 * A Fundação decidiu que o Gestor Geral acompanha a ATA, o Dia, a internação, a
 * Cozinha, os combinados, a rotina e a escala da casa, sem registrar nelas. A
 * trava é a `@OGestorSoLe()` na porta de cada rota de escrita.
 *
 * Este teste lê os controladores e NEGA POR PADRÃO (a lição da 153): toda rota de
 * escrita dessas partes leva a marca, ou está na lista escrita das que ficam livres,
 * com o motivo. Rota nova sem uma das duas reprova. E a lista não apodrece: rota
 * livre que deixou de existir também reprova.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MODULOS = join(__dirname, '..', 'src', 'modules');

/** Cada controlador: as rotas de escrita livres, com o motivo, ou só as que entram. */
const PARTES: Record<string, { livres?: Record<string, string>; so?: string[] }> = {
  'shifts/shifts.controller.ts': { livres: {
    "@Post('ata/:ataId/read-request')": 'pedir para ler a observação restrita é de quem lê',
    "@Post('ata-read-requests/:id/decide')": 'decidir quem lê a observação restrita não é escrever na ATA',
    "@Post('ata-read-requests/:id/revoke')": 'idem: é a guarda da leitura',
    "@Post('general-ata')": 'a ATA Geral é da instituição, não da casa',
    "@Patch('general-ata/:id/house/:houseId')": 'a ATA Geral é da instituição',
    "@Patch('general-night-line/:data/house/:houseId')": 'a ATA Geral é da instituição',
    "@Post('general-ata/:id/sign')": 'a ATA Geral é da instituição',
    "@Post(':id/export')": 'baixar o papel é ler',
  } },
  'activities/activities.controller.ts': { livres: {
    "@Post('agenda')": 'a Agenda não entrou na decisão de 25/10',
    "@Post('agenda/generate')": 'a Agenda não entrou na decisão de 25/10',
    "@Post('agenda/:id/skip')": 'a Agenda não entrou na decisão de 25/10',
    "@Post('agenda/:id/unskip')": 'a Agenda não entrou na decisão de 25/10',
    "@Post('agenda/:id/cancel')": 'a Agenda não entrou na decisão de 25/10',
  } },
  'nursing/nursing.controller.ts': { livres: {
    "@Post('education/:personId/support')": 'a escola da criança não entrou na decisão',
    "@Post('education/:personId/concepts')": 'a escola da criança não entrou na decisão',
    "@Post('education/:personId/evolutions')": 'a escola da criança não entrou na decisão',
    "@Post('evolutions')": 'a evolução de saúde tem a regra dela, da Enfermagem',
    "@Post('evolutions/:id/triage')": 'a triagem é da Enfermagem',
    "@Post('history/:personId/export')": 'baixar o papel é ler',
    "@Post('hospitalizations/:id/export')": 'baixar o relatório da internação é ler',
    "@Post('summary/:personId')": 'o resumo de saúde é leitura montada',
    "@Post('summary/issues/:id/download')": 'baixar o papel é ler',
  } },
  'alignments/alignments.controller.ts': { livres: {
    "@Post('export')": 'baixar o papel é ler',
    "@Post('statute')": 'o gestor escreve a regra das oito casas; a da casa o serviço recusa a ele',
    "@Post('statute/:id/revoke')": 'o gestor revoga a regra das oito casas; a da casa o serviço recusa a ele',
    "@Post('statute/export')": 'baixar o papel é ler',
  } },
  'routine/routine.controller.ts': { livres: {} },
  'identity/escala.controller.ts': { livres: {
    "@Post('export')": 'baixar a folha da escala é ler',
  } },
  'houses/houses.controller.ts': { so: ["@Post(':id/turnos')"] },
  'people/people.controller.ts': { so: [
    "@Post('kitchen-requests')", "@Post('kitchen-requests/:id/edit')",
    "@Post('kitchen-requests/:id/cancel')", "@Post('birthdays/:personId/ack')",
  ] },
};

/** As rotas de escrita do arquivo, cada uma com a marca ou sem ela. */
function rotas(arquivo: string) {
  const linhas = readFileSync(join(MODULOS, arquivo), 'utf8').split('\n');
  const out: { rota: string; marcada: boolean }[] = [];
  linhas.forEach((l, i) => {
    const m = /^\s*(@(Post|Patch|Put|Delete)\([^)]*\))\s*$/.exec(l);
    if (!m) return;
    /* A marca fica entre o verbo e o método, com os outros decoradores. */
    let marcada = false;
    for (let j = i + 1; j < linhas.length && /^\s*@/.test(linhas[j]); j++) {
      if (/@OGestorSoLe\(\)/.test(linhas[j])) marcada = true;
    }
    out.push({ rota: m[1], marcada });
  });
  return out;
}

describe('O Gestor Geral lê a casa e não registra nela', () => {
  for (const [arquivo, regra] of Object.entries(PARTES)) {
    it(`${arquivo}: toda rota de escrita tem a marca ou está na lista das livres`, () => {
      const todas = rotas(arquivo);
      if (regra.so) {
        const faltando = regra.so.filter((r) => !todas.some((x) => x.rota === r && x.marcada));
        expect(faltando).toEqual([]);
        return;
      }
      const livres = regra.livres ?? {};
      const semNada = todas.filter((x) => !x.marcada && !(x.rota in livres)).map((x) => x.rota);
      expect(semNada).toEqual([]);
      /* A lista não apodrece: rota livre que sumiu, ou que ganhou a marca, sai daqui. */
      const sobrando = Object.keys(livres).filter((r) => !todas.some((x) => x.rota === r && !x.marcada));
      expect(sobrando).toEqual([]);
    });
  }
});
