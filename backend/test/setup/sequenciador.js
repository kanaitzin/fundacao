/**
 * A ORDEM DAS SUÍTES (fase 170).
 *
 * A do Jest, com uma exceção: as sondagens de alcance vão por ÚLTIMO. Ela
 * precisa do banco que as outras suítes deixam povoado, com registro real
 * da Casa 03 em cada tabela; no meio da rodada, metade das rotas não teria
 * o que sondar, e ela passaria por não olhar.
 */
const Sequenciador = require('@jest/test-sequencer').default;

class PorUltimoASondagem extends Sequenciador {
  sort(suites) {
    const ordem = super.sort(suites);
    /* As sondagens começam por `zz-`, e entre elas vale a ordem do nome: a de
       leitura antes da de escrita, que muda o banco da Casa 04. */
    const ultima = (t) => require('path').basename(t.path).startsWith('zz-');
    const fim = ordem.filter(ultima).sort((a, b) => a.path.localeCompare(b.path));
    return [...ordem.filter((t) => !ultima(t)), ...fim];
  }
}

module.exports = PorUltimoASondagem;
