-- A SAÍDA COM A DATA E QUEM DECIDIU (fase 276, avaliação humana de 05/11).
--
-- O quadro "Saídas de hoje: atenção" dizia quem só sai com acompanhante e o
-- motivo, sem dizer desde quando nem quem decidiu. A avaliação pediu o aviso com
-- data e a pessoa responsável. A função passa a devolver também desde quando a
-- decisão vale, quem a tomou e para onde (o escopo escrito), sem mudar quem lê.

DROP FUNCTION IF EXISTS app_saidas_a_observar(uuid);
CREATE FUNCTION app_saidas_a_observar(p_house uuid)
RETURNS TABLE (person_id uuid, quem text, status text, motivo text,
               ate date, a_revisar boolean, desde timestamptz, decidido_por text, onde text) AS $$
  SELECT o.person_id, coalesce(nullif(p.social_name,''), p.full_name),
         o.status, o.reason, o.review_on,
         o.review_on IS NOT NULL AND o.review_on <= app_hoje(),
         o.valid_from, app_user_display_name(o.decided_by), o.scope_note
    FROM outing_permission o
    JOIN person p ON p.id = o.person_id
   WHERE o.house_id = p_house
     AND app_house_in_scope(p_house)
     AND o.valid_to IS NULL
     AND o.status <> 'liberada'
   ORDER BY coalesce(nullif(p.social_name,''), p.full_name)
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_saidas_a_observar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_saidas_a_observar(uuid) TO rede_app;
