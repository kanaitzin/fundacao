-- A VISITA ENTRA E SAI (fase 160).
--
-- Até aqui o sistema sabia QUEM podia visitar (1120, 1500) e não sabia QUEM
-- VISITOU: a autorização existia, o registro da visita não. A portaria conferia
-- a folha impressa, e a entrada e a saída não ficavam em lugar nenhum.
--
-- O QUE ESTA MIGRAÇÃO TRAZ, pelo pedido da Fundação de 25/09 e pelas decisões
-- do humano em 26/09:
--
--  * o visitante ganha RG, nome social e a VALIDADE da autorização (de/até);
--  * cada visita é uma linha: quem veio, para quem, que documento foi
--    conferido, quem registrou a entrada, quando saiu, quem registrou a saída;
--  * a PORTARIA (cargo novo, identity/1590) e a CASA registram — a portaria só
--    na casa em que tem vínculo, e sem abrir mais nada (identity/1591);
--  * FORA DO DIA, DO HORÁRIO OU DA VALIDADE, a entrada é RECUSADA — salvo
--    exceção com motivo escrito por coordenação, equipe técnica ou líder. A
--    portaria não abre exceção (decisão de 26/09). Criança fora da casa
--    (internada, com a família) também recusa, pela mesma exceção;
--  * visita esquecida aberta se CORRIGE com motivo e com o antes e o depois
--    guardados — nunca por DELETE, nunca em silêncio.

ALTER TABLE person_contact
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS social_name text,
  ADD COLUMN IF NOT EXISTS visit_valid_from date,
  ADD COLUMN IF NOT EXISTS visit_valid_to date;
DO $$ BEGIN
  ALTER TABLE person_contact ADD CONSTRAINT contato_validade_da_visita
    CHECK (visit_valid_to IS NULL OR visit_valid_from IS NULL OR visit_valid_to >= visit_valid_from);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS visit (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id         uuid NOT NULL REFERENCES house(id),
  person_id        uuid NOT NULL REFERENCES person(id),
  contact_id       uuid NOT NULL REFERENCES person_contact(id),
  -- Que documento foi conferido no portão. Texto curto, e obrigatório: a
  -- conferência é o ato da portaria, e "conferi" sem dizer o quê não confere.
  document_checked text NOT NULL CHECK (length(btrim(document_checked)) >= 2),
  started_at       timestamptz NOT NULL DEFAULT now(),
  started_by       uuid NOT NULL REFERENCES app_user(id),
  start_note       text,
  -- Preenchido só quando a entrada foi fora do combinado, com o motivo de quem
  -- abriu a exceção.
  exception_reason text,
  ended_at         timestamptz,
  ended_by         uuid REFERENCES app_user(id),
  end_note         text,
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);
-- Uma visita aberta por visitante: duas ao mesmo tempo é o toque duplo no
-- portão, e a segunda contaria uma visita que não houve.
CREATE UNIQUE INDEX IF NOT EXISTS uq_visita_aberta ON visit (contact_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_visita_da_crianca ON visit (person_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_visita_da_casa ON visit (house_id, started_at DESC);

-- A CORREÇÃO: o antes e o depois, com motivo e autor. Só cresce.
CREATE TABLE IF NOT EXISTS visit_correction (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id     uuid NOT NULL REFERENCES visit(id),
  before_start timestamptz NOT NULL,
  before_end   timestamptz,
  after_start  timestamptz NOT NULL,
  after_end    timestamptz,
  reason       text NOT NULL CHECK (length(btrim(reason)) >= 10),
  corrected_by uuid NOT NULL REFERENCES app_user(id),
  corrected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE visit ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_correction ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON visit, visit_correction TO rede_app;
-- Leitura pela casa (a portaria NÃO lê por aqui: `app_house_in_scope` diz não
-- a ela). Escrita só pelas funções abaixo, e nenhuma apaga.
DROP POLICY IF EXISTS visit_select ON visit;
CREATE POLICY visit_select ON visit FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));
DROP POLICY IF EXISTS visit_correction_select ON visit_correction;
CREATE POLICY visit_correction_select ON visit_correction FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM visit v WHERE v.id = visit_id));

-- ------------------------------------------------------------
-- Quem registra visita numa casa
-- ------------------------------------------------------------
-- A portaria, na casa em que tem vínculo; a equipe da casa, no alcance dela.
-- Enfermagem e cozinha não: não é o trabalho delas no portão.
CREATE OR REPLACE FUNCTION app_registra_visita(p_house uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE
    WHEN app_current_role() = 'portaria' THEN p_house IN (SELECT app_user_house_ids())
    WHEN app_current_role() IN ('educador','lider_diurno','lider_noturno_geral',
                                'equipe_tecnica','coordenador','gestor_geral')
      THEN app_house_in_scope(p_house)
    ELSE false
  END
$$;

-- Quem abre exceção e corrige: coordenação, equipe técnica e líder.
CREATE OR REPLACE FUNCTION app_abre_excecao_de_visita() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT app_current_role() IN ('coordenador','equipe_tecnica','lider_diurno','lider_noturno_geral')
$$;

-- ------------------------------------------------------------
-- A visita cabe no combinado, agora?
-- ------------------------------------------------------------
-- Devolve NULL quando cabe, ou a frase que diz por que não cabe. Dia da semana
-- e hora no fuso da instituição; a validade, por data.
CREATE OR REPLACE FUNCTION app_fora_do_combinado(p_contact uuid, p_instante timestamptz)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE c person_contact%ROWTYPE; v_local timestamp; v_casa uuid;
BEGIN
  SELECT * INTO c FROM person_contact WHERE id = p_contact;
  v_local := p_instante AT TIME ZONE app_fuso();
  IF NOT c.active OR NOT c.visit_authorized THEN
    RETURN 'Este visitante não está autorizado a visitar.';
  END IF;
  IF c.visit_valid_from IS NOT NULL AND v_local::date < c.visit_valid_from THEN
    RETURN 'A autorização deste visitante começa em ' || to_char(c.visit_valid_from, 'DD/MM/YYYY') || '.';
  END IF;
  IF c.visit_valid_to IS NOT NULL AND v_local::date > c.visit_valid_to THEN
    RETURN 'A autorização deste visitante terminou em ' || to_char(c.visit_valid_to, 'DD/MM/YYYY') || '.';
  END IF;
  IF c.visit_weekdays IS NULL THEN
    RETURN 'Este visitante não tem dias de visita combinados. A equipe técnica precisa combinar.';
  END IF;
  IF NOT (extract(dow FROM v_local)::smallint = ANY (c.visit_weekdays)) THEN
    RETURN 'Hoje não é dia de visita combinado para este visitante.';
  END IF;
  IF c.visit_from IS NOT NULL AND v_local::time < c.visit_from THEN
    RETURN 'Ainda não é o horário de visita deste visitante (a partir das '
           || to_char(c.visit_from, 'HH24:MI') || ').';
  END IF;
  IF c.visit_to IS NOT NULL AND v_local::time > c.visit_to THEN
    RETURN 'Já passou o horário de visita deste visitante (até as '
           || to_char(c.visit_to, 'HH24:MI') || ').';
  END IF;
  -- A criança precisa estar na casa hoje: internada ou com a família, a visita
  -- no portão não a encontra.
  IF app_ausente_da_casa(c.person_id, v_local::date) THEN
    RETURN 'A criança não está na casa hoje (internação ou saída com a família).';
  END IF;
  RETURN NULL;
END $$;

-- ------------------------------------------------------------
-- A lista do portão: quem pode visitar, na casa, com o que a portaria precisa
-- ------------------------------------------------------------
-- É TUDO o que a portaria enxerga das crianças: o nome pelo qual a criança é
-- chamada e quem pode vir vê-la. Nenhum dado de perfil, saúde ou caso.
CREATE OR REPLACE FUNCTION app_portaria_da_casa(p_house uuid)
RETURNS TABLE (contact_id uuid, visitante text, nome_social text, vinculo text, vinculo_outro text,
               cpf text, rg text, tem_foto boolean, acolhido text, person_id uuid,
               dias smallint[], de time, ate time, valido_de date, valido_ate date,
               observacao text, fora_do_combinado text,
               visita_aberta uuid, entrou_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT app_registra_visita(p_house) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT c.id, c.name, c.social_name, c.bond, c.bond_other, c.cpf, c.rg,
           c.photo_key IS NOT NULL,
           coalesce(nullif(p.social_name, ''), p.full_name), p.id,
           c.visit_weekdays, c.visit_from, c.visit_to, c.visit_valid_from, c.visit_valid_to,
           c.visit_note, app_fora_do_combinado(c.id, now()),
           v.id, v.started_at
      FROM person_contact c
      JOIN person p ON p.id = c.person_id
      JOIN house_stay s ON s.person_id = p.id AND s.house_id = p_house AND s.status = 'ativa'
      LEFT JOIN visit v ON v.contact_id = c.id AND v.ended_at IS NULL
     WHERE c.active AND c.visit_authorized
     ORDER BY 9, 2;
END $$;

-- A foto 3×4 do visitante, para a portaria conferir o rosto — e só ela.
CREATE OR REPLACE FUNCTION app_foto_do_visitante(p_contact uuid)
RETURNS TABLE (storage_key text, mime text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_casa uuid;
BEGIN
  SELECT s.house_id INTO v_casa FROM person_contact c
    JOIN house_stay s ON s.person_id = c.person_id AND s.status = 'ativa'
   WHERE c.id = p_contact AND c.visit_authorized AND c.active;
  IF v_casa IS NULL OR NOT app_registra_visita(v_casa) THEN
    RAISE EXCEPTION 'visitante_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN QUERY SELECT c.photo_key, c.photo_mime FROM person_contact c WHERE c.id = p_contact;
END $$;

-- ------------------------------------------------------------
-- Entrada, saída e correção
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_iniciar_visita(
  p_contact uuid, p_documento text, p_nota text, p_excecao text)
RETURNS TABLE (visita uuid, excecao boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE c person_contact%ROWTYPE; v_casa uuid; v_fora text; v_id uuid;
BEGIN
  SELECT * INTO c FROM person_contact WHERE id = p_contact FOR UPDATE;
  SELECT s.house_id INTO v_casa FROM house_stay s
   WHERE s.person_id = c.person_id AND s.status = 'ativa';
  IF c.id IS NULL OR v_casa IS NULL OR NOT app_registra_visita(v_casa) THEN
    RAISE EXCEPTION 'visitante_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF coalesce(length(btrim(p_documento)), 0) < 2 THEN
    RAISE EXCEPTION 'documento_obrigatorio';
  END IF;
  IF EXISTS (SELECT 1 FROM visit WHERE contact_id = p_contact AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'visita_ja_aberta';
  END IF;

  v_fora := app_fora_do_combinado(p_contact, now());
  IF v_fora IS NOT NULL THEN
    -- Não autorizado é recusa sem exceção: a exceção é para o combinado, não
    -- para quem não está na folha.
    IF NOT c.visit_authorized OR NOT c.active THEN
      RAISE EXCEPTION 'fora_do_combinado: %', v_fora;
    END IF;
    IF NOT app_abre_excecao_de_visita() THEN
      RAISE EXCEPTION 'fora_do_combinado: %', v_fora;
    END IF;
    IF coalesce(length(btrim(p_excecao)), 0) < 10 THEN
      RAISE EXCEPTION 'excecao_sem_motivo: %', v_fora;
    END IF;
  END IF;

  INSERT INTO visit (house_id, person_id, contact_id, document_checked, started_by,
                     start_note, exception_reason)
  VALUES (v_casa, c.person_id, p_contact, btrim(p_documento), app_current_user(),
          nullif(btrim(coalesce(p_nota, '')), ''),
          CASE WHEN v_fora IS NOT NULL THEN btrim(p_excecao) END)
  RETURNING id INTO v_id;

  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id, detail)
  VALUES (app_current_user(), v_casa, 'visita.entrada', 'visit', v_id,
          jsonb_build_object('excecao', v_fora IS NOT NULL));
  RETURN QUERY SELECT v_id, v_fora IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION app_encerrar_visita(p_visit uuid, p_nota text)
RETURNS TABLE (saiu_em timestamptz, minutos integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v visit%ROWTYPE;
BEGIN
  SELECT * INTO v FROM visit WHERE id = p_visit FOR UPDATE;
  IF v.id IS NULL OR NOT app_registra_visita(v.house_id) THEN
    RAISE EXCEPTION 'visita_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v.ended_at IS NOT NULL THEN RAISE EXCEPTION 'visita_ja_encerrada'; END IF;
  UPDATE visit SET ended_at = now(), ended_by = app_current_user(),
                   end_note = nullif(btrim(coalesce(p_nota, '')), '')
   WHERE id = p_visit;
  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id)
  VALUES (app_current_user(), v.house_id, 'visita.saida', 'visit', p_visit);
  RETURN QUERY SELECT now(), (extract(epoch FROM now() - v.started_at) / 60)::integer;
END $$;

-- A visita que ficou aberta por engano, ou o horário registrado errado: o antes
-- e o depois ficam em `visit_correction`, com motivo. Só quem abre exceção.
CREATE OR REPLACE FUNCTION app_corrigir_visita(
  p_visit uuid, p_entrada timestamptz, p_saida timestamptz, p_motivo text)
RETURNS TABLE (ok boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v visit%ROWTYPE;
BEGIN
  SELECT * INTO v FROM visit WHERE id = p_visit FOR UPDATE;
  IF v.id IS NULL OR NOT app_house_in_scope(v.house_id) THEN
    RAISE EXCEPTION 'visita_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_abre_excecao_de_visita() THEN
    RAISE EXCEPTION 'sem_permissao_corrigir_visita' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(length(btrim(p_motivo)), 0) < 10 THEN RAISE EXCEPTION 'motivo_insuficiente'; END IF;
  IF p_entrada IS NULL OR p_saida IS NULL OR p_saida < p_entrada THEN
    RAISE EXCEPTION 'saida_antes_da_entrada';
  END IF;
  IF p_saida > now() THEN RAISE EXCEPTION 'saida_no_futuro'; END IF;

  INSERT INTO visit_correction (visit_id, before_start, before_end, after_start, after_end,
                                reason, corrected_by)
  VALUES (p_visit, v.started_at, v.ended_at, p_entrada, p_saida, btrim(p_motivo), app_current_user());
  UPDATE visit SET started_at = p_entrada, ended_at = p_saida,
                   ended_by = coalesce(v.ended_by, app_current_user())
   WHERE id = p_visit;
  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id)
  VALUES (app_current_user(), v.house_id, 'visita.correcao', 'visit', p_visit);
  RETURN QUERY SELECT true;
END $$;

REVOKE ALL ON FUNCTION app_registra_visita(uuid), app_fora_do_combinado(uuid, timestamptz),
  app_portaria_da_casa(uuid), app_foto_do_visitante(uuid),
  app_iniciar_visita(uuid, text, text, text), app_encerrar_visita(uuid, text),
  app_corrigir_visita(uuid, timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registra_visita(uuid), app_abre_excecao_de_visita(),
  app_fora_do_combinado(uuid, timestamptz), app_portaria_da_casa(uuid),
  app_foto_do_visitante(uuid), app_iniciar_visita(uuid, text, text, text),
  app_encerrar_visita(uuid, text), app_corrigir_visita(uuid, timestamptz, timestamptz, text)
  TO rede_app;
