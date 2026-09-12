-- ============================================================
-- 1140 — A pauta que o educador propõe, e a resposta que ele recebe
--
-- Último item da fila de 09/09 (§10.5). O módulo `alignments` (0840) já
-- guardava a reunião e os combinados; faltava a metade que é do educador.
--
-- O QUE ELE PEDIU, na frase dele: o educador propõe pauta, e quem decide se
-- entra é a técnica, o líder ou a coordenação — e **responde por que ficou de
-- fora**. "Uma pauta recusada sem resposta é pior do que não poder propor."
--
-- É isso que esta migração carrega, e por isso a resposta não é um campo
-- opcional que alguém preenche quando lembra:
--
--  * RECUSAR EXIGE RESPOSTA ESCRITA (`ck_pauta_recusa_responde`). Sem ela o
--    banco recusa a linha. Um botão "não" que não pede nada vira o silêncio
--    que o pedido existe para acabar;
--  * ADIAR TAMBÉM. "Fica para a próxima" sem uma palavra é recusa com outro
--    nome — e quem propôs continua sem saber se vale insistir;
--  * ACEITAR NÃO EXIGE. Quem propôs vai ver o assunto na pauta da reunião, que
--    é a resposta que interessa;
--  * QUEM PROPÔS LÊ A RESPOSTA. A política de leitura é de toda a casa: o
--    educador do turno da noite, que quase nunca vai à reunião, precisa ler o
--    que foi respondido a ele e aos outros. Resposta que só a coordenação
--    enxerga é a mesma coisa que resposta nenhuma;
--  * O TEXTO DA PROPOSTA É IMUTÁVEL, como o do combinado. O que muda é a
--    situação — aceita, recusada, adiada —, e quem decidiu fica registrado.
--    Sem isso, "mas eu propus outra coisa" volta a ser discussão de memória.
--
-- QUEM PROPÕE: qualquer pessoa com alcance na casa, inclusive o educador e a
-- enfermagem. Quem decide: técnica, líder (diurno e noturno) e coordenação —
-- o líder entra porque ele conduz o turno e é quem o noturno alcança.
-- ============================================================

CREATE TABLE meeting_agenda_item (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id      uuid NOT NULL REFERENCES house(id),
  -- A proposta nasce SEM reunião: ela é para a próxima, que ainda não existe.
  -- Ao entrar numa pauta, recebe o `meeting_id` da reunião que a acolheu.
  meeting_id    uuid REFERENCES team_meeting(id),
  body          text NOT NULL CHECK (length(btrim(body)) >= 10),
  -- Por que este assunto importa — opcional, e é onde o educador diz o que a
  -- frase curta não diz.
  context       text,
  status        text NOT NULL DEFAULT 'proposta'
                CHECK (status IN ('proposta','aceita','recusada','adiada')),
  answer        text,
  answered_by   uuid REFERENCES app_user(id),
  answered_at   timestamptz,
  proposed_by   uuid NOT NULL REFERENCES app_user(id),
  proposed_at   timestamptz NOT NULL DEFAULT now(),

  -- O coração do pedido: dizer não, ou "fica para depois", obriga a escrever.
  CONSTRAINT ck_pauta_recusa_responde CHECK (
    status NOT IN ('recusada','adiada')
    OR length(btrim(coalesce(answer, ''))) >= 15),
  -- Decisão sem autor não é decisão: é um estado que apareceu sozinho.
  CONSTRAINT ck_pauta_decisao_tem_autor CHECK (
    status = 'proposta' OR (answered_by IS NOT NULL AND answered_at IS NOT NULL))
);
CREATE INDEX idx_pauta_casa ON meeting_agenda_item (house_id, proposed_at DESC);
CREATE INDEX idx_pauta_aberta ON meeting_agenda_item (house_id)
  WHERE status = 'proposta';

-- O texto proposto e o autor não se reescrevem — como o corpo do combinado.
CREATE OR REPLACE FUNCTION tg_pauta_texto_imutavel() RETURNS trigger AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body
     OR NEW.context IS DISTINCT FROM OLD.context
     OR NEW.house_id IS DISTINCT FROM OLD.house_id
     OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by THEN
    RAISE EXCEPTION 'pauta_nao_se_reescreve';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pauta_texto_imutavel BEFORE UPDATE ON meeting_agenda_item
  FOR EACH ROW EXECUTE FUNCTION tg_pauta_texto_imutavel();
CREATE TRIGGER pauta_no_delete BEFORE DELETE ON meeting_agenda_item
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

ALTER TABLE meeting_agenda_item ENABLE ROW LEVEL SECURITY;

-- LER é de toda a casa: quem propôs precisa ler a resposta, e quem não estava
-- na reunião precisa ler o que foi proposto e o que foi respondido.
CREATE POLICY pauta_select ON meeting_agenda_item FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));

-- PROPOR é de qualquer pessoa da casa, em nome próprio.
CREATE POLICY pauta_insert ON meeting_agenda_item FOR INSERT TO rede_app
  WITH CHECK (app_house_in_scope(house_id) AND proposed_by = app_current_user());

-- RESPONDER é de quem conduz a reunião.
CREATE POLICY pauta_update ON meeting_agenda_item FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id)
         AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral',
                                    'lider_diurno','lider_noturno_geral'))
  WITH CHECK (app_house_in_scope(house_id));

GRANT SELECT, INSERT, UPDATE ON meeting_agenda_item TO rede_app;

/**
 * Responder uma proposta de pauta — uma vez, e com o estado no WHERE.
 *
 * Duas pessoas respondendo ao mesmo tempo (a técnica aceita enquanto o líder
 * adia) passariam as duas pela leitura e a segunda gravaria por cima, com a
 * resposta trocada na frente de quem propôs. É a regra 11, e a mesma correção
 * das fases 89 a 91.
 */
CREATE OR REPLACE FUNCTION app_responder_pauta(
  p_id uuid, p_status text, p_resposta text)
RETURNS TABLE (out_house uuid, out_autor uuid) AS $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM meeting_agenda_item WHERE id = p_id;
  IF v.id IS NULL OR NOT app_house_in_scope(v.house_id) THEN
    RAISE EXCEPTION 'pauta_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v.status <> 'proposta' THEN
    RAISE EXCEPTION 'pauta_ja_respondida' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status NOT IN ('aceita','recusada','adiada') THEN
    RAISE EXCEPTION 'pauta_estado_invalido' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status IN ('recusada','adiada')
     AND length(btrim(coalesce(p_resposta, ''))) < 15 THEN
    RAISE EXCEPTION 'pauta_recusa_sem_resposta' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE meeting_agenda_item
     SET status = p_status, answer = nullif(btrim(p_resposta), ''),
         answered_by = app_current_user(), answered_at = now()
   WHERE id = p_id
     AND status = 'proposta';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pauta_ja_respondida' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY SELECT v.house_id, v.proposed_by;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_responder_pauta(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_responder_pauta(uuid, text, text) TO rede_app;

COMMENT ON TABLE meeting_agenda_item IS
  'Pauta proposta por quem trabalha na casa. Recusar ou adiar exige resposta escrita, e quem propôs lê — pedido do Marcelo em 09/09: pauta recusada sem resposta é pior do que não poder propor.';
