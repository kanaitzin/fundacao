/**
 * A ORDEM DAS SUÍTES (fase 170).
 *
 * A do Jest, com uma exceção: a sondagem de alcance vai por ÚLTIMO. Ela
 * precisa do banco que as outras suítes deixam povoado, com registro real
 * da Casa 03 em cada tabela; no meio da rodada, metade das rotas não teria
 * o que sondar, e ela passaria por não olhar.
 */
const Sequenciador = require('@jest/test-sequencer').default;

class PorUltimoASondagem extends Sequenciador {
  sort(suites) {
    const ordem = super.sort(suites);
    const ultima = (t) => t.path.includes('a-sondagem-de-alcance');
    return [...ordem.filter((t) => !ultima(t)), ...ordem.filter(ultima)];
  }
}

module.exports = PorUltimoASondagem;
