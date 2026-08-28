-- ============================================================
-- 0590 — COMPLEMENTO DA PASSAGEM (§12.1, §12.4)
--
-- A tela da passagem encontrou uma promessa sem caminho: quando alguém tenta
-- assinar duas vezes, o sistema responde "um registro adicional entra como
-- relato complementar" — e não existia rota, tabela ou tela para isso. A
-- pessoa que lembrasse às 20h de algo que aconteceu às 18h tinha três saídas,
-- todas ruins: escrever numa ocorrência que não é ocorrência, pedir a outro
-- que escrevesse (o que a passagem individual existe para impedir), ou o
-- aplicativo de conversa.
--
-- O complemento é a quarta saída, e a única que preserva as duas regras que
-- não se negociam:
--
--  * a passagem assinada NÃO muda. `handover` continua append-only, com
--    UNIQUE (shift_id, user_id): uma assinatura por pessoa por plantão;
--  * o complemento é de quem o escreve, e só. Nasce ao lado, com hora
--    própria, e diz a quem lê que veio depois.
--
-- Por que tabela nova e não uma coluna: uma coluna reescrita seria
-- exatamente o que o §12.4 proíbe, e uma segunda linha em `handover`
-- estragaria a conta de quem assinou o turno.
-- ============================================================

CREATE TABLE handover_note (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_id   uuid NOT NULL REFERENCES handover(id),
  shift_id      uuid NOT NULL REFERENCES shift(id),
  house_id      uuid NOT NULL REFERENCES house(id),
  user_id       uuid NOT NULL REFERENCES app_user(id),
  -- Um complemento vazio não complementa nada; a régua é a mesma da passagem.
  body          text NOT NULL CHECK (length(btrim(body)) >= 5),
  happened_at   timestamptz NOT NULL DEFAULT now(),  -- horário REAL do fato
  written_at    timestamptz NOT NULL DEFAULT now(),  -- quando foi escrito
  offline       boolean NOT NULL DEFAULT false,
  client_op_id  text UNIQUE
);
CREATE INDEX idx_handover_note_shift ON handover_note (shift_id);

CREATE TRIGGER handover_note_no_change BEFORE UPDATE OR DELETE ON handover_note
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

ALTER TABLE handover_note ENABLE ROW LEVEL SECURITY;

-- Lê quem lê a passagem: é parte do mesmo documento de turno.
CREATE POLICY handover_note_select ON handover_note FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));

-- Escreve SÓ o autor da passagem que está complementando. A cláusula é a
-- mesma ideia do §26.2 #18, um passo adiante: não basta ser o próprio
-- usuário, a passagem complementada precisa ser a dele.
CREATE POLICY handover_note_insert ON handover_note FOR INSERT TO rede_app
  WITH CHECK (
    user_id = app_current_user()
    AND app_house_in_scope(house_id)
    AND EXISTS (SELECT 1 FROM handover h
                WHERE h.id = handover_note.handover_id
                  AND h.user_id = app_current_user()
                  AND h.shift_id = handover_note.shift_id)
  );

GRANT SELECT, INSERT ON handover_note TO rede_app;
