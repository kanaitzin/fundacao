-- =============================================================================
-- 1410 — A `handover_receipt.opened_handover` É DECLARADA MORTA, E NÃO APAGADA.
--
-- A MEDIÇÃO, feita em 21/09/2026 sobre o repositório inteiro.
--
-- A coluna nasceu na 0310 com `NOT NULL DEFAULT true`, e:
--
--   * **nenhum `INSERT` a nomeia** — o único que existe (`shifts.service.ts`)
--     lista `read_guidance`, `took_pending`, `note`, `offline`, `client_op_id`;
--   * **nenhum `SELECT` a lê** — a leitura do recibo pede `read_guidance`,
--     `took_pending` e `note`, e nada mais;
--   * a tabela tem trigger que **proíbe `UPDATE` e `DELETE`**, então o valor com
--     que a linha nasce é o valor que ela terá para sempre.
--
-- Ou seja: ela é `true` em todas as linhas que já existem e em todas as que vão
-- existir. **Coluna que só tem um valor não informa nada** — e pior do que não
-- informar, ela CONVIDA a uma conclusão errada: quem abrir a tabela daqui a um
-- ano vai ler "abriu a passagem: sim" para todo mundo e acreditar que o sistema
-- confere isso. Não confere, e nunca conferiu.
--
-- POR QUE ELA NÃO É APAGADA. `DROP COLUMN` é migração destrutiva, e a regra da
-- casa é que nada se apaga de passagem. Além disso a coluna não atrapalha: o
-- `read_guidance` — que é escolha consciente de quem recebe o plantão, e nasce
-- `false` — responde à pergunta que importa, *"a pessoa leu a orientação?"*.
--
-- O QUE MUDA DE VERDADE: a afirmação passa a ser **conferível**. Declarada
-- MORTA, ela entra no guarda do `arquivo-tem-saida.spec.ts` — que desde a fase
-- 132 olha funções, políticas de RLS, visões e o código do servidor. Se alguém
-- amanhã ligar um leitor nela sem tirar este comentário, a suíte reprova e
-- obriga a escolher: ou a coluna volta a viver, e o comentário sai, ou o leitor
-- é o erro. **É o contrário do que aconteceu com a `work_schedule`**, que passou
-- meses com um comentário errado porque ninguém tinha como cobrar a frase.
-- =============================================================================

COMMENT ON COLUMN handover_receipt.opened_handover IS
  'MORTA desde a 1410 — medida: nenhum INSERT a nomeia, nenhum SELECT a lê, e o '
  'trigger da tabela proíbe UPDATE, então ela é true em toda linha que existe e '
  'em toda que vier. Quem responde "a pessoa leu a orientação?" é read_guidance, '
  'que nasce false e é escolha de quem recebe o plantão. Não foi apagada porque '
  'DROP COLUMN é migração destrutiva; está conferida por teste (o guarda das '
  'colunas MORTAS), que reprova se alguém ligar um leitor nela sem tirar isto.';
