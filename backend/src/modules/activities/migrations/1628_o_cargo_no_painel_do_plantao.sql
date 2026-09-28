-- =========================================================================
-- O CARGO NO PAINEL DO PLANTÃO — 28/09/2026 (fase 172)
--
-- O painel responde "quem está em quê agora", e o líder das 22h pergunta
-- também "de que setor": se há técnica no turno, se a atividade ficou com a
-- Enfermagem. A resposta é o círculo do cargo ao lado do nome (fase 151), e
-- para desenhá-lo a tela precisa do cargo, que a função não devolvia.
--
-- O cargo sai por `app_user_cargo`, e não por JOIN em `app_user`: o RLS
-- dessa tabela devolve ao educador só a própria linha, e o JOIN deixaria o
-- cargo vazio para metade de quem abre o painel (lição da fase 152). A
-- função é a mesma de antes, com uma coluna a mais; trocar o tipo de retorno
-- pede DROP e CREATE.
-- =========================================================================

DROP FUNCTION IF EXISTS app_shift_board(uuid, date);

CREATE FUNCTION app_shift_board(p_house uuid, p_date date DEFAULT NULL)
RETURNS TABLE(activity_id uuid, titulo text, horario timestamptz, estado activity_state,
              responsavel text, responsavel_cargo text, acolhido text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT a.id, a.title, a.scheduled_at, a.state,
         coalesce(app_user_display_name(asg.user_id), 'Equipe do plantão'),
         CASE WHEN asg.user_id IS NOT NULL THEN app_user_cargo(asg.user_id) END,
         CASE WHEN a.person_id IS NOT NULL
              THEN app_person_display_name(a.person_id) END
    FROM activity a
    LEFT JOIN LATERAL (
      SELECT user_id FROM activity_assignment
       WHERE activity_id = a.id ORDER BY assigned_at DESC LIMIT 1) asg ON true
   WHERE a.house_id = p_house
     AND app_house_in_scope(p_house)
     AND (a.scheduled_at AT TIME ZONE app_fuso())::date
         = coalesce(p_date, app_hoje())
   ORDER BY a.scheduled_at, a.title
$$;

REVOKE ALL ON FUNCTION app_shift_board(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_shift_board(uuid, date) TO rede_app;
