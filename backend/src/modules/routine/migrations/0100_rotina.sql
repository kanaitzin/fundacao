-- ============================================================
-- Módulo `routine` — Rotina versionada da casa (§8.1)
--
-- A rotina é o MOLDE do dia: acordar, higiene, refeições, escola, cursos,
-- contraturno, esporte, lazer, banho, sono. Cada alteração cria uma VERSÃO
-- nova; a anterior permanece, porque registros antigos precisam continuar
-- explicáveis pelo molde vigente na época.
--
-- Medicamento aparece na rotina, mas a fonte oficial é o módulo de
-- medicamentos (§8.1) — aqui não há prescrição.
--
-- Remoção do módulo: apagar esta pasta e a entrada em app.module.ts.
-- Nada fora daqui referencia estas tabelas.
-- ============================================================

CREATE TABLE routine_version (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id    uuid NOT NULL REFERENCES house(id),
  number      integer NOT NULL,
  valid_from  date NOT NULL DEFAULT current_date,
  valid_to    date,                      -- null = vigente
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES app_user(id),
  UNIQUE (house_id, number)
);
CREATE UNIQUE INDEX uq_routine_vigente ON routine_version (house_id) WHERE valid_to IS NULL;

CREATE TYPE routine_kind AS ENUM
  ('acordar','higiene','refeicao','escola','curso','contraturno','esporte',
   'lazer','educacao','medicamento','banho','sono','saude','outro');

CREATE TABLE routine_item (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id    uuid NOT NULL REFERENCES routine_version(id),
  house_id      uuid NOT NULL REFERENCES house(id),
  kind          routine_kind NOT NULL,
  title         text NOT NULL,
  start_time    time NOT NULL,
  end_time      time,
  -- dias da semana em que ocorre (0=domingo … 6=sábado)
  weekdays      smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  collective    boolean NOT NULL DEFAULT true,   -- coletiva ou individual (§8.1)
  person_id     uuid REFERENCES person(id),      -- obrigatória quando individual
  instructions  text,
  transport     text,                            -- quando o deslocamento é necessário
  priority      smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  requires_ack  boolean NOT NULL DEFAULT false,  -- exige "Estou ciente" (§8.2)
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES app_user(id),
  CHECK (collective OR person_id IS NOT NULL)
);
CREATE INDEX idx_routine_item_version ON routine_item (version_id);
CREATE INDEX idx_routine_item_person ON routine_item (person_id) WHERE person_id IS NOT NULL;

-- ---------- Escopo ----------
-- Rotina pertence a uma casa: quem enxerga a casa enxerga a rotina.
-- Criar e alterar é da equipe técnica e da coordenação (§8.2); líderes só
-- criam atividade urgente e pontual, o que acontece no módulo `activities`.
ALTER TABLE routine_version ENABLE ROW LEVEL SECURITY;
CREATE POLICY rv_select ON routine_version FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY rv_insert ON routine_version FOR INSERT TO rede_app
  WITH CHECK (app_can_edit_profile() AND app_house_in_scope(house_id));
CREATE POLICY rv_update ON routine_version FOR UPDATE TO rede_app
  USING (app_can_edit_profile() AND app_house_in_scope(house_id)) WITH CHECK (true);

ALTER TABLE routine_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY ri_select ON routine_item FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY ri_insert ON routine_item FOR INSERT TO rede_app
  WITH CHECK (app_can_edit_profile() AND app_house_in_scope(house_id));
CREATE POLICY ri_update ON routine_item FOR UPDATE TO rede_app
  USING (app_can_edit_profile() AND app_house_in_scope(house_id)) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON routine_version, routine_item TO rede_app;
REVOKE DELETE ON routine_version, routine_item FROM rede_app;

-- ---------- Nova versão da rotina (§8.1: versionar, não sobrescrever) ----------
-- Em plpgsql, os parâmetros de saída entram no escopo do corpo e VENCEM as
-- colunas de mesmo nome, tornando o SQL ambíguo. Como o corpo mexe em
-- routine_version.number e routine_item.version_id, os nomes de retorno
-- levam o prefixo `out_`.
CREATE OR REPLACE FUNCTION app_new_routine_version(p_house uuid, p_note text)
RETURNS TABLE (out_version_id uuid, out_number integer) AS $$
DECLARE v_num integer; v_id uuid; v_old uuid;
BEGIN
  IF NOT app_can_edit_profile() OR NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'sem_permissao_rotina' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT rv.id INTO v_old FROM routine_version rv WHERE rv.house_id = p_house AND rv.valid_to IS NULL;
  SELECT coalesce(max(rv.number),0) + 1 INTO v_num FROM routine_version rv WHERE rv.house_id = p_house;

  UPDATE routine_version rv SET valid_to = current_date
   WHERE rv.house_id = p_house AND rv.valid_to IS NULL;

  INSERT INTO routine_version AS rv (house_id, number, note, created_by)
  VALUES (p_house, v_num, p_note, app_current_user()) RETURNING rv.id INTO v_id;

  -- Copia os itens da versão anterior: alterar a rotina não recomeça do zero.
  IF v_old IS NOT NULL THEN
    INSERT INTO routine_item (version_id, house_id, kind, title, start_time, end_time,
                              weekdays, collective, person_id, instructions, transport,
                              priority, requires_ack, created_by)
    SELECT v_id, ri.house_id, ri.kind, ri.title, ri.start_time, ri.end_time, ri.weekdays,
           ri.collective, ri.person_id, ri.instructions, ri.transport, ri.priority,
           ri.requires_ack, app_current_user()
    FROM routine_item ri WHERE ri.version_id = v_old;
  END IF;

  RETURN QUERY SELECT v_id, v_num;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_new_routine_version(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_new_routine_version(uuid, text) TO rede_app;
