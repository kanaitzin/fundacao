-- QUEM ESCREVE NA ATA DE OUTRO TURNO (fase 281, primeira avaliação humana de 05/11,
-- módulo 10; decidido pela pessoa da Fundação em 06/11).
--
-- "Um funcionário escalado no diurno não deve poder assumir ou fechar indevidamente
-- a ata do noturno. Acesso para atuação fora do plantão deve depender de solicitação
-- e autorização do líder ou coordenação, com registro de ambas."
--
-- Fechar a ATA já era do líder do turno, da equipe técnica e da coordenação
-- (`app_close_ata`). O que faltava era a LINHA: qualquer educador da casa escrevia
-- na ATA de qualquer turno. A regra, daqui em diante:
--
--  * escrevem sem pedir a equipe técnica, a coordenação, a Enfermagem, o líder do
--    próprio turno (o Líder Diurno na diurna, o Líder Noturno Geral na noturna) e
--    quem está na escala daquele turno;
--  * sem escala lançada no turno, ninguém é travado: a escala não se deduz (1370);
--  * os outros pedem, com o motivo, e o líder do turno ou a coordenação autoriza ou
--    recusa, com o nome e a hora. O pedido e a decisão nunca se apagam.
--
-- Ler continua como era: autorização para escrever não é para ler, e o contrário
-- também não.

CREATE TABLE IF NOT EXISTS ata_write_request (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id         uuid NOT NULL REFERENCES ata(id),
  house_id       uuid NOT NULL REFERENCES house(id),
  requested_by   uuid NOT NULL REFERENCES app_user(id),
  request_reason text NOT NULL,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  -- A decisão: nula enquanto espera.
  granted        boolean,
  decided_by     uuid REFERENCES app_user(id),
  decided_at     timestamptz,
  decision_reason text
);
ALTER TABLE ata_write_request ADD CONSTRAINT pedido_de_escrita_tem_motivo
  CHECK (length(btrim(request_reason)) >= 5);
ALTER TABLE ata_write_request ADD CONSTRAINT decisao_de_escrita_completa
  CHECK (granted IS NULL OR (decided_by IS NOT NULL AND decided_at IS NOT NULL));
-- Um pedido vivo por pessoa e por ATA: esperando ou autorizado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ata_write_request_vivo
  ON ata_write_request (ata_id, requested_by) WHERE granted IS NULL OR granted;
CREATE INDEX IF NOT EXISTS ix_ata_write_request_ata ON ata_write_request (ata_id);
CREATE INDEX IF NOT EXISTS ix_ata_write_request_casa ON ata_write_request (house_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS ix_ata_write_request_quem ON ata_write_request (requested_by);
CREATE INDEX IF NOT EXISTS ix_ata_write_request_decidiu ON ata_write_request (decided_by);

ALTER TABLE ata_write_request ENABLE ROW LEVEL SECURITY;
-- Quem pediu acompanha a resposta; a casa vê os pedidos da ATA dela.
CREATE POLICY awr_select ON ata_write_request FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
GRANT SELECT ON ata_write_request TO rede_app;
REVOKE INSERT, UPDATE, DELETE ON ata_write_request FROM rede_app;
COMMENT ON TABLE ata_write_request IS
  'Pedido para escrever na ATA de um turno em que a pessoa não está na escala, e a decisão do líder do turno ou da coordenação (fase 281). Nada se apaga.';

/* Quem decide o pedido de uma ATA: o líder daquele turno e a coordenação. */
CREATE OR REPLACE FUNCTION app_decide_escrita_na_ata(p_period text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_current_role() = 'coordenador'
      OR (p_period = 'diurno' AND app_current_role() = 'lider_diurno')
      OR (p_period = 'noturno' AND app_current_role() = 'lider_noturno_geral')
$$;
REVOKE ALL ON FUNCTION app_decide_escrita_na_ata(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_decide_escrita_na_ata(text) TO rede_app;

/* Quem está usando escreve nesta ATA? A regra inteira num lugar só. */
CREATE OR REPLACE FUNCTION app_pode_escrever_na_ata(p_ata uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_ata ata%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO v_ata FROM ata WHERE id = p_ata;
  IF v_ata.id IS NULL OR NOT app_house_in_scope(v_ata.house_id) THEN RETURN false; END IF;
  v_role := app_current_role()::text;
  IF v_role IN ('equipe_tecnica', 'coordenador', 'enfermagem') THEN RETURN true; END IF;
  IF (v_ata.period = 'diurno' AND v_role = 'lider_diurno')
     OR (v_ata.period = 'noturno' AND v_role = 'lider_noturno_geral') THEN RETURN true; END IF;
  -- Sem escala lançada no turno, ninguém é travado (a escala não se deduz, 1370).
  IF NOT EXISTS (SELECT 1 FROM shift_assignment s
                  WHERE s.house_id = v_ata.house_id AND s.on_date = v_ata.on_date
                    AND s.period = v_ata.period AND s.revoked_at IS NULL) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM shift_assignment s
              WHERE s.house_id = v_ata.house_id AND s.on_date = v_ata.on_date
                AND s.period = v_ata.period AND s.revoked_at IS NULL
                AND s.user_id = app_current_user()) THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM ata_write_request r
                  WHERE r.ata_id = p_ata AND r.requested_by = app_current_user() AND r.granted);
END $$;
REVOKE ALL ON FUNCTION app_pode_escrever_na_ata(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_pode_escrever_na_ata(uuid) TO rede_app;

/* A trava: a linha só nasce de quem pode escrever naquela ATA. */
CREATE OR REPLACE FUNCTION app_trava_linha_de_outro_turno() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  -- Sem ninguém na sessão é a manutenção do banco, e não quem usa o sistema.
  IF app_current_user() IS NULL THEN RETURN NEW; END IF;
  IF NOT app_pode_escrever_na_ata(NEW.ata_id) THEN
    RAISE EXCEPTION 'fora_do_turno_da_ata' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_linha_de_outro_turno ON ata_note;
CREATE TRIGGER trg_linha_de_outro_turno BEFORE INSERT ON ata_note
  FOR EACH ROW EXECUTE FUNCTION app_trava_linha_de_outro_turno();

/* PEDIR. Só quem ainda não pode escrever, e numa ATA que não está fechada. */
CREATE OR REPLACE FUNCTION app_pedir_escrita_na_ata(p_ata uuid, p_motivo text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_ata ata%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO v_ata FROM ata WHERE id = p_ata;
  IF v_ata.id IS NULL OR NOT app_house_in_scope(v_ata.house_id) THEN RAISE EXCEPTION 'ata_inexistente'; END IF;
  IF v_ata.status IN ('fechada', 'fechada_com_pendencia') THEN RAISE EXCEPTION 'ata_ja_fechada'; END IF;
  IF app_pode_escrever_na_ata(p_ata) THEN RAISE EXCEPTION 'ja_pode_escrever'; END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN RAISE EXCEPTION 'motivo_curto'; END IF;
  IF EXISTS (SELECT 1 FROM ata_write_request WHERE ata_id = p_ata
               AND requested_by = app_current_user() AND granted IS NULL) THEN
    RAISE EXCEPTION 'pedido_ja_feito';
  END IF;
  INSERT INTO ata_write_request (ata_id, house_id, requested_by, request_reason)
  VALUES (p_ata, v_ata.house_id, app_current_user(), btrim(p_motivo)) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION app_pedir_escrita_na_ata(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_pedir_escrita_na_ata(uuid, text) TO rede_app;

/* DECIDIR. O líder do turno ou a coordenação, uma vez, com o nome e a hora. */
CREATE OR REPLACE FUNCTION app_decidir_escrita_na_ata(p_pedido uuid, p_autoriza boolean, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_req ata_write_request%ROWTYPE; v_period text;
BEGIN
  SELECT * INTO v_req FROM ata_write_request WHERE id = p_pedido;
  IF v_req.id IS NULL OR NOT app_house_in_scope(v_req.house_id) THEN RAISE EXCEPTION 'pedido_inexistente'; END IF;
  IF v_req.granted IS NOT NULL THEN RAISE EXCEPTION 'pedido_ja_decidido'; END IF;
  SELECT period INTO v_period FROM ata WHERE id = v_req.ata_id;
  IF NOT app_decide_escrita_na_ata(v_period) THEN RAISE EXCEPTION 'sem_permissao_decidir_escrita'; END IF;
  UPDATE ata_write_request
     SET granted = p_autoriza, decided_by = app_current_user(), decided_at = now(),
         decision_reason = nullif(btrim(coalesce(p_motivo, '')), '')
   WHERE id = p_pedido;
  RETURN v_req.house_id;
END $$;
REVOKE ALL ON FUNCTION app_decidir_escrita_na_ata(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_decidir_escrita_na_ata(uuid, boolean, text) TO rede_app;
