-- ============================================================
-- Aceitar uma transferência obsoleta trazia a criança de volta
--
-- `app_accept_transfer` exigia apenas `status = 'solicitada'`. Não conferia se
-- a criança AINDA estava na casa de origem, nem se o episódio continuava
-- aberto. E a saída (`discharge`) encerrava permanência e episódio sem
-- cancelar as solicitações pendentes.
--
-- Cenário que isso permitia, e que é o pior possível:
--   02/09 — a Casa 03 solicita transferência da Ana para a Casa 05.
--   04/09 — a Ana é REINTEGRADA À FAMÍLIA. Permanência e episódio encerrados,
--           perfil no Acervo. A solicitação continua na caixa da Casa 05.
--   06/09 — a coordenadora da Casa 05, limpando a caixa, clica em "Aceitar".
--           O UPDATE de permanência não afeta nada (não há ativa), e o INSERT
--           seguinte cria uma permanência ATIVA pendurada num episódio já
--           encerrado. A Ana volta a existir operacionalmente: entra na visão
--           dos 20, na geração de doses e atividades, e a Casa 05 ganha acesso
--           aos dados bancários dela — tudo contornando `app_readmit_person`,
--           que existe exatamente para isso.
--
-- Três correções:
--   1. o comando confere o estado ANTES de mover qualquer coisa;
--   2. a saída cancela as solicitações pendentes, com motivo;
--   3. índice único parcial: uma criança não tem duas transferências pendentes
--      (antes era só um SELECT sem trava — dois pedidos simultâneos passavam,
--      e o segundo aceite tirava a criança de uma casa que já a tinha acolhido).
-- ============================================================

CREATE OR REPLACE FUNCTION app_accept_transfer(p_transfer uuid)
RETURNS TABLE (person_id uuid, from_house uuid, to_house uuid, episode_id uuid) AS $$
DECLARE
  t transfer_request%ROWTYPE;
  v_casa_atual uuid;
  v_episodio_ativo boolean;
BEGIN
  -- FOR UPDATE: dois aceites simultâneos do mesmo pedido não passam juntos.
  SELECT * INTO t FROM transfer_request
   WHERE id = p_transfer AND status = 'solicitada' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transferencia_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- Autorização explícita: só equipe técnica/coordenação/gestor do DESTINO decide.
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral')
     OR NOT app_house_in_scope(t.to_house_id) THEN
    RAISE EXCEPTION 'sem_permissao_no_destino' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- O mundo pode ter mudado entre o pedido e o aceite. Conferir é barato;
  -- mover uma criança que já saiu, não.
  SELECT s.house_id INTO v_casa_atual
    FROM house_stay s WHERE s.person_id = t.person_id AND s.status = 'ativa';

  IF v_casa_atual IS NULL THEN
    RAISE EXCEPTION 'acolhido_sem_permanencia_ativa';
  END IF;
  IF v_casa_atual <> t.from_house_id THEN
    RAISE EXCEPTION 'acolhido_ja_esta_em_outra_casa';
  END IF;

  SELECT EXISTS (SELECT 1 FROM care_episode e
                 WHERE e.id = t.episode_id AND e.status = 'ativo') INTO v_episodio_ativo;
  IF NOT v_episodio_ativo THEN
    RAISE EXCEPTION 'episodio_encerrado';
  END IF;

  -- Transição atômica: encerra na origem, abre no destino, decide a solicitação.
  -- O histórico não é apagado — a permanência antiga permanece como 'encerrada'.
  UPDATE house_stay SET status = 'encerrada', ended_at = now(), end_reason = 'transferencia'
   WHERE house_stay.person_id = t.person_id AND status = 'ativa';

  INSERT INTO house_stay (episode_id, person_id, house_id, created_by)
  VALUES (t.episode_id, t.person_id, t.to_house_id, app_current_user());

  UPDATE transfer_request SET status = 'aceita', decided_by = app_current_user(), decided_at = now()
   WHERE id = p_transfer;

  RETURN QUERY SELECT t.person_id, t.from_house_id, t.to_house_id, t.episode_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_accept_transfer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_accept_transfer(uuid) TO rede_app;

-- Uma criança, uma transferência pendente. Antes era só um SELECT prévio.
CREATE UNIQUE INDEX uq_transfer_pendente
  ON transfer_request (person_id) WHERE status = 'solicitada';

-- ---------- Saída cancela o que estava pendente ----------
-- Comando porque o cancelamento precisa acontecer na MESMA transação da saída,
-- e porque quem registra a saída é a origem — que não decide pelo destino,
-- mas tampouco pode deixar um pedido vivo sobre uma criança que já não está lá.
CREATE OR REPLACE FUNCTION app_cancel_transfers_on_exit(p_person uuid, p_reason text)
RETURNS integer AS $$
DECLARE v_n integer;
BEGIN
  UPDATE transfer_request
     SET status = 'cancelada', decided_by = app_current_user(), decided_at = now(),
         decision_note = coalesce(p_reason, 'Cancelada automaticamente: o acolhido deixou a unidade.')
   WHERE person_id = p_person AND status = 'solicitada';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_cancel_transfers_on_exit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cancel_transfers_on_exit(uuid, text) TO rede_app;
