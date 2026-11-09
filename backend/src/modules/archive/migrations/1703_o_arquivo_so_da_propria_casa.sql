-- O ARQUIVO SÓ DA PRÓPRIA CASA (fase 298; o que a revisão de segurança achou).
--
-- A `app_archive_enqueue` conferia o cargo e gravava a casa que viesse do corpo: a coordenação
-- da Casa 04 punha um item na fila de arquivo da Casa 03, no caminho dela. Agora a casa tem de
-- estar no alcance de quem arquiva. A casa nula (o que é da instituição inteira, como a ATA
-- geral da noite) continua aceita.

CREATE OR REPLACE FUNCTION app_archive_enqueue(p_house uuid, p_categoria text, p_entity text, p_entity_id uuid,
  p_filename text, p_versao text DEFAULT 'V1'::text, p_restrita boolean DEFAULT false,
  p_quando timestamp with time zone DEFAULT now())
RETURNS TABLE(item_id uuid, ja_existia boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $function$
DECLARE
  v_id uuid; v_cod text; v_ano integer; v_mes integer; v_caminho text; v_raiz text;
BEGIN
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral',
                                'lider_diurno','lider_noturno_geral','admin_tecnico','enfermagem') THEN
    RAISE EXCEPTION 'sem_permissao_arquivar' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_house IS NOT NULL AND NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_id FROM archive_item
   WHERE entity = p_entity AND entity_id = p_entity_id AND versao = p_versao;
  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, true;
    RETURN;
  END IF;

  SELECT h.code INTO v_cod FROM house h WHERE h.id = p_house;
  v_ano := EXTRACT(year FROM (p_quando AT TIME ZONE 'America/Sao_Paulo'))::integer;
  v_mes := EXTRACT(month FROM (p_quando AT TIME ZONE 'America/Sao_Paulo'))::integer;
  -- Raiz separada para o que é restrito (§16.5).
  v_raiz := CASE WHEN p_restrita THEN 'RESTRITO' ELSE 'ACOLHIMENTO' END;
  v_caminho := concat_ws('/', v_raiz, coalesce(v_cod, 'INSTITUCIONAL'),
                         v_ano::text, lpad(v_mes::text, 2, '0'), p_categoria);

  INSERT INTO archive_item (house_id, ano, mes, categoria, entity, entity_id, versao,
                            caminho, filename, area_restrita, fechado_em, created_by)
  VALUES (p_house, v_ano, v_mes, p_categoria, p_entity, p_entity_id, p_versao,
          v_caminho, p_filename, p_restrita, p_quando, app_current_user())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, false;
END $function$;
