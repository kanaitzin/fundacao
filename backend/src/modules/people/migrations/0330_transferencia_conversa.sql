-- ============================================================
-- Transferência: caixa de entrada, caixa da casa e conversa entre
-- coordenações (§15.6)
--
-- O que mudou e por quê:
--
-- 1. A caixa de entrada passa a mostrar o NOME COMPLETO do acolhido e a
--    unidade de origem. Decisão institucional de Leonardo (Fundação), tomada
--    em 27/08/2026 e registrada em docs/pendencias-institucionais.md.
--    A leitura anterior do §15.6 ("não expor dados antes do aceite") anonimizava
--    a solicitação — e isso tornava a decisão impossível de tomar com
--    responsabilidade: aceitar ou recusar uma criança sem saber quem ela é não
--    é decisão, é sorteio. E recusar exige motivo escrito.
--
--    O que continua fechado até o aceite é o PERFIL: saúde, documentos,
--    medicamentos, benefícios, narrativas e histórico. A caixa de entrada
--    mostra o necessário para decidir — nome, idade, origem, motivo, quem
--    pediu — e nada além disso.
--
-- 2. As duas coordenações podem CONVERSAR sobre a solicitação, dentro do
--    sistema (§3.3 proíbe WhatsApp). A conversa é do pedido, não da casa:
--    ninguém entra na casa do outro para falar.
--
-- 3. A recusa fica registrada NAS DUAS CASAS: a política já mostra a
--    solicitação a origem e destino, e a auditoria passa a gravar um evento
--    para cada lado.
-- ============================================================

CREATE TABLE transfer_message (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id   uuid NOT NULL REFERENCES transfer_request(id),
  author_id     uuid NOT NULL REFERENCES app_user(id),
  -- Casa de onde o autor fala. Guardada para que a conversa continue legível
  -- depois que a transferência é aceita e a criança muda de unidade.
  author_house_id uuid NOT NULL REFERENCES house(id),
  body          text NOT NULL,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transfer_msg ON transfer_message (transfer_id, at);

-- Mensagem enviada não é editada nem apagada: é parte do registro da decisão.
CREATE TRIGGER transfer_msg_no_change BEFORE UPDATE OR DELETE ON transfer_message
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

ALTER TABLE transfer_message ENABLE ROW LEVEL SECURITY;

-- Lê quem está nos DOIS lados da solicitação — e só quem decide transferência.
-- Educador não entra nesta conversa: a transferência é ato de coordenação.
CREATE POLICY tmsg_select ON transfer_message FOR SELECT TO rede_app USING (
  app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
  AND EXISTS (
    SELECT 1 FROM transfer_request t
    WHERE t.id = transfer_message.transfer_id
      AND (app_house_in_scope(t.from_house_id) OR app_house_in_scope(t.to_house_id)))
);

-- Escreve em nome próprio, e só a partir de uma casa que é parte do pedido.
CREATE POLICY tmsg_insert ON transfer_message FOR INSERT TO rede_app WITH CHECK (
  author_id = app_current_user()
  AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
  AND app_house_in_scope(author_house_id)
  AND EXISTS (
    SELECT 1 FROM transfer_request t
    WHERE t.id = transfer_message.transfer_id
      AND transfer_message.author_house_id IN (t.from_house_id, t.to_house_id))
);
GRANT SELECT, INSERT ON transfer_message TO rede_app;

-- ---------- Caixa de entrada: o que chegou de outras casas ----------
-- A assinatura de retorno mudou (a caixa passou a mostrar nome e origem), e o
-- Postgres não troca o tipo de retorno de uma função existente: é preciso
-- derrubar a antiga. Nada se perde — a função não guarda estado.
DROP FUNCTION IF EXISTS app_transfer_inbox(uuid);

CREATE OR REPLACE FUNCTION app_transfer_inbox(p_house uuid)
RETURNS TABLE (id uuid, nome_completo text, nome_social text, idade integer,
               origem_codigo text, origem_nome text, motivo text,
               solicitante text, solicitada_em timestamptz, mensagens integer) AS $$
  SELECT t.id,
         p.full_name,
         nullif(p.social_name, ''),
         date_part('year', age(p.birth_date))::int,
         h.code, h.name,
         t.reason,
         app_user_display_name(t.requested_by),
         t.requested_at,
         (SELECT count(*)::int FROM transfer_message m WHERE m.transfer_id = t.id)
  FROM transfer_request t
  JOIN house h ON h.id = t.from_house_id
  JOIN person p ON p.id = t.person_id
  WHERE t.to_house_id = p_house
    AND t.status = 'solicitada'
    AND app_house_in_scope(p_house)          -- guarda: só a própria caixa de entrada
    AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
  ORDER BY t.requested_at
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_transfer_inbox(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_transfer_inbox(uuid) TO rede_app;

-- ---------- Caixa da casa: o que ESTA casa pediu ----------
-- Inclui as já decididas, com o motivo da recusa. É isto que faz a recusa
-- ficar registrada nos dois lados: a origem lê a justificativa que o destino
-- escreveu, sem precisar entrar na casa do destino.
CREATE OR REPLACE FUNCTION app_transfer_outbox(p_house uuid)
RETURNS TABLE (id uuid, nome_completo text, nome_social text, idade integer,
               destino_codigo text, destino_nome text, motivo text, status text,
               solicitante text, solicitada_em timestamptz,
               decidido_por text, decidido_em timestamptz, justificativa text,
               mensagens integer) AS $$
  SELECT t.id,
         p.full_name,
         nullif(p.social_name, ''),
         date_part('year', age(p.birth_date))::int,
         h.code, h.name,
         t.reason, t.status,
         app_user_display_name(t.requested_by),
         t.requested_at,
         CASE WHEN t.decided_by IS NULL THEN NULL ELSE app_user_display_name(t.decided_by) END,
         t.decided_at, t.decision_note,
         (SELECT count(*)::int FROM transfer_message m WHERE m.transfer_id = t.id)
  FROM transfer_request t
  JOIN house h ON h.id = t.to_house_id
  JOIN person p ON p.id = t.person_id
  WHERE t.from_house_id = p_house
    AND app_house_in_scope(p_house)
    AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
  ORDER BY t.requested_at DESC
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_transfer_outbox(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_transfer_outbox(uuid) TO rede_app;

-- ---------- Cancelamento pela origem (§24: estado 'cancelada') ----------
-- Quem pediu pode desistir enquanto ninguém decidiu. Depois de decidida, não:
-- a decisão do destino não se apaga.
CREATE OR REPLACE FUNCTION app_cancel_transfer(p_transfer uuid, p_reason text)
RETURNS TABLE (out_from uuid, out_to uuid, out_person uuid) AS $$
DECLARE t transfer_request%ROWTYPE; v_me uuid;
BEGIN
  v_me := app_current_user();
  SELECT * INTO t FROM transfer_request WHERE id = p_transfer;
  IF t.id IS NULL THEN RAISE EXCEPTION 'transferencia_inexistente'; END IF;
  IF t.status <> 'solicitada' THEN RAISE EXCEPTION 'transferencia_ja_decidida'; END IF;
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral')
     OR NOT app_house_in_scope(t.from_house_id) THEN
    RAISE EXCEPTION 'somente_a_origem_cancela';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 10 THEN RAISE EXCEPTION 'motivo_insuficiente'; END IF;

  UPDATE transfer_request
     SET status = 'cancelada', decided_by = v_me, decided_at = now(),
         decision_note = btrim(p_reason)
   WHERE id = p_transfer;

  RETURN QUERY SELECT t.from_house_id, t.to_house_id, t.person_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_cancel_transfer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cancel_transfer(uuid, text) TO rede_app;

-- ---------- Recusa como comando ----------
-- Era um UPDATE comum. Virou comando por um motivo simples: a justificativa é
-- obrigatória e precisa ficar nos dois lados. Concentrar isso num ato só evita
-- que uma rota futura grave a recusa sem o motivo.
CREATE OR REPLACE FUNCTION app_decline_transfer(p_transfer uuid, p_reason text)
RETURNS TABLE (out_from uuid, out_to uuid, out_person uuid) AS $$
DECLARE t transfer_request%ROWTYPE; v_me uuid;
BEGIN
  v_me := app_current_user();
  SELECT * INTO t FROM transfer_request WHERE id = p_transfer;
  IF t.id IS NULL THEN RAISE EXCEPTION 'transferencia_inexistente'; END IF;
  IF t.status <> 'solicitada' THEN RAISE EXCEPTION 'transferencia_ja_decidida'; END IF;
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral')
     OR NOT app_house_in_scope(t.to_house_id) THEN
    RAISE EXCEPTION 'somente_o_destino_decide';
  END IF;
  -- Recusar sem dizer por quê deixaria a origem sem o que fazer com a criança.
  IF coalesce(length(btrim(p_reason)), 0) < 15 THEN RAISE EXCEPTION 'motivo_insuficiente'; END IF;

  UPDATE transfer_request
     SET status = 'devolvida', decided_by = v_me, decided_at = now(),
         decision_note = btrim(p_reason)
   WHERE id = p_transfer;

  -- Um evento de auditoria para cada casa: a recusa consta nos dois lugares.
  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose)
  VALUES (t.to_house_id,   v_me, 'transfer.decline', 'transfer_request', p_transfer, btrim(p_reason)),
         (t.from_house_id, v_me, 'transfer.declined_received', 'transfer_request', p_transfer, btrim(p_reason));

  RETURN QUERY SELECT t.from_house_id, t.to_house_id, t.person_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_decline_transfer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_decline_transfer(uuid, text) TO rede_app;
