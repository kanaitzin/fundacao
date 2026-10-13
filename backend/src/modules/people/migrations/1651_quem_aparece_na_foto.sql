-- QUEM APARECE NA FOTO, E A FOTO PEQUENA (fase 209, pedido de 12/10).
--
-- O pedido foi uma IA que reconhecesse o rosto de cada criança nas fotos e as
-- levasse para a pasta dela. Isso não entra: reconhecimento facial é dado
-- biométrico de criança (LGPD, art. 11 e 14), pede base legal, relatório de
-- impacto e o DPO, e um erro de reconhecimento põe a foto de uma criança na
-- pasta de outra. O que resolve a mesma necessidade é a pessoa que guardou a
-- foto MARCAR quem aparece nela: a foto entra no álbum de cada criança
-- marcada, com o nome de quem marcou, e desmarcar deixa registro.
--
-- E a foto pequena: o álbum mostra a miniatura (feita no aparelho, por volta de
-- 320 px), e a foto inteira só abre no toque. Oito casas em dez anos são
-- dezenas de milhares de fotos; a lista não pode baixar todas inteiras.

ALTER TABLE memory_photo
  ADD COLUMN IF NOT EXISTS thumb_key text,
  ADD COLUMN IF NOT EXISTS thumb_mime text;

CREATE TABLE IF NOT EXISTS memory_photo_person (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id         uuid NOT NULL REFERENCES memory_photo(id),
  person_id        uuid NOT NULL REFERENCES person(id),
  -- A casa da criança marcada, copiada: a política se resolve sem JOIN.
  house_id         uuid NOT NULL REFERENCES house(id),
  -- A autorização de imagem é de cada criança que aparece, e não da foto.
  image_authorized boolean NOT NULL DEFAULT false,
  tagged_by        uuid NOT NULL REFERENCES app_user(id),
  tagged_at        timestamptz NOT NULL DEFAULT now(),
  removed_at       timestamptz,
  removed_by       uuid REFERENCES app_user(id),
  removed_reason   text,
  CHECK ((removed_at IS NULL) = (removed_by IS NULL)),
  CHECK (removed_at IS NULL OR length(btrim(coalesce(removed_reason, ''))) >= 5)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_marca_ativa ON memory_photo_person (photo_id, person_id)
  WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_marca_da_crianca ON memory_photo_person (person_id, tagged_at DESC);

ALTER TABLE memory_photo_person ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON memory_photo_person TO rede_app;
DROP POLICY IF EXISTS mpp_select ON memory_photo_person;
CREATE POLICY mpp_select ON memory_photo_person FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));

-- Marcar: quem alcança a foto e a criança marcada, as duas na MESMA casa.
CREATE OR REPLACE FUNCTION app_marcar_na_foto(p_photo uuid, p_person uuid, p_autorizada boolean)
RETURNS TABLE (marca uuid, casa uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_dono uuid; v_casa_foto uuid; v_casa uuid; v_id uuid;
BEGIN
  IF app_current_role() NOT IN ('educador','lider_diurno','lider_noturno_geral',
                                'equipe_tecnica','coordenador') THEN
    RAISE EXCEPTION 'sem_permissao_marcar' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT f.person_id INTO v_dono FROM memory_photo f WHERE f.id = p_photo;
  SELECT s.house_id INTO v_casa_foto FROM house_stay s WHERE s.person_id = v_dono AND s.status = 'ativa';
  SELECT s.house_id INTO v_casa FROM house_stay s WHERE s.person_id = p_person AND s.status = 'ativa';
  IF v_dono IS NULL OR v_casa IS NULL OR v_casa_foto IS NULL
     OR NOT app_house_in_scope(v_casa) OR NOT app_house_in_scope(v_casa_foto) THEN
    RAISE EXCEPTION 'foto_ou_crianca_fora_de_escopo' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_casa <> v_casa_foto THEN
    RAISE EXCEPTION 'crianca_de_outra_casa' USING ERRCODE = 'check_violation';
  END IF;
  IF p_person = v_dono THEN
    RAISE EXCEPTION 'ja_e_da_crianca' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM memory_photo_person m
              WHERE m.photo_id = p_photo AND m.person_id = p_person AND m.removed_at IS NULL) THEN
    RAISE EXCEPTION 'ja_marcada' USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO memory_photo_person (photo_id, person_id, house_id, image_authorized, tagged_by)
  VALUES (p_photo, p_person, v_casa, coalesce(p_autorizada, false), app_current_user())
  RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, v_casa;
END $$;

-- Desmarcar: a marca fica, com quem tirou e por quê.
CREATE OR REPLACE FUNCTION app_desmarcar_da_foto(p_marca uuid, p_motivo text)
RETURNS TABLE (pessoa uuid, casa uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE r memory_photo_person%ROWTYPE;
BEGIN
  IF app_current_role() NOT IN ('educador','lider_diurno','lider_noturno_geral',
                                'equipe_tecnica','coordenador') THEN
    RAISE EXCEPTION 'sem_permissao_marcar' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM memory_photo_person WHERE id = p_marca;
  IF r.id IS NULL OR NOT app_house_in_scope(r.house_id) THEN
    RAISE EXCEPTION 'marca_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF r.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'marca_ja_retirada' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE memory_photo_person
     SET removed_at = now(), removed_by = app_current_user(), removed_reason = btrim(p_motivo)
   WHERE id = p_marca;
  RETURN QUERY SELECT r.person_id, r.house_id;
END $$;

-- As fotos em que a criança aparece, das vivências de outras crianças da casa.
-- Pela regra da casa (RLS das duas tabelas), sem definer.
CREATE OR REPLACE FUNCTION app_fotos_em_que_aparece(p_person uuid)
RETURNS TABLE (marca uuid, foto uuid, vivencia uuid, dono uuid, descricao text, quando date,
               autorizada boolean, marcada_por text, marcada_em timestamptz)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT m.id, f.id, f.memory_id, f.person_id, r.description, r.happened_on,
         m.image_authorized, app_user_display_name(m.tagged_by), m.tagged_at
    FROM memory_photo_person m
    -- rls-join-ok (memory_photo): a política da foto confere o alcance da criança dona.
    JOIN memory_photo f ON f.id = m.photo_id
    -- rls-join-ok (memory_record): a vivência é da mesma criança dona da foto.
    JOIN memory_record r ON r.id = f.memory_id
   WHERE m.person_id = p_person AND m.removed_at IS NULL
   ORDER BY r.happened_on DESC, m.tagged_at DESC
$$;

REVOKE ALL ON FUNCTION app_marcar_na_foto(uuid, uuid, boolean),
  app_desmarcar_da_foto(uuid, text), app_fotos_em_que_aparece(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_marcar_na_foto(uuid, uuid, boolean),
  app_desmarcar_da_foto(uuid, text), app_fotos_em_que_aparece(uuid) TO rede_app;
