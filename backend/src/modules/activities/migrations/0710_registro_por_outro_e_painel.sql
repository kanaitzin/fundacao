-- ---------------------------------------------------------------------------
-- REGISTRO POR OUTRA PESSOA, DELEGAÇÃO PELO LÍDER E PAINEL DO PLANTÃO (§8.2, §8.3)
--
-- Três necessidades da casa que apareceram juntas:
--
-- 1. O educador realizou a atividade e não conseguiu registrar — o aparelho da
--    casa não pegou, e ele não usa o próprio celular. Hoje isso vira buraco no
--    histórico, que é pior do que qualquer registro imperfeito: buraco é o que
--    a audiência pergunta e ninguém sabe responder meses depois.
--
-- 2. O educador faltou, e as atividades já designadas a ele ficam órfãs. Existe
--    o pedido de substituição, mas ele nasce de quem vai sair — e quem faltou
--    não pede nada. Faltava o caminho de cima para baixo.
--
-- 3. Às 22h o líder precisa saber quem está fora da casa levando uma criança ao
--    psicólogo antes de mandar alguém resolver outra coisa.
--
-- O QUE ESTE ARQUIVO NÃO FAZ, DE PROPÓSITO:
--
--   * não vale para dose de medicamento (§11.2) nem para chamada (§10). Numa,
--     a confirmação individual É a proteção da criança; na outra, quem marca
--     presença é quem olhou a criança. Líder marcando por outro transformaria
--     a conferência em formulário. `app_can_administer` e `check_result`
--     continuam intocados;
--   * não substitui autoria. O registro passa a ter DOIS nomes, nunca um no
--     lugar do outro. Quem realizou e quem registrou aparecem juntos, sempre,
--     em toda tela que mostre a atividade;
--   * o painel não guarda "onde a Ana esteve", não conta quantas atividades
--     cada um fez e não ordena ninguém. É a foto do turno agora, ancorada na
--     ATIVIDADE, não na pessoa (§3.3 — sem ranking, sem rastreamento).
-- ---------------------------------------------------------------------------

-- ---------- 1. Autoria dupla ----------
-- `user_id` continua sendo quem OPEROU o sistema — nunca muda de sentido, e
-- nenhuma consulta existente passa a mentir. O que entra é o outro nome.
ALTER TABLE activity_execution
  ADD COLUMN performed_by uuid REFERENCES app_user(id),
  ADD COLUMN proxy_reason text;

COMMENT ON COLUMN activity_execution.performed_by IS
  'Quem REALIZOU, quando diferente de quem registrou. Nulo = foram a mesma pessoa.';
COMMENT ON COLUMN activity_execution.proxy_reason IS
  'Por que o registro foi feito por outra pessoa. Obrigatório quando performed_by existe.';

-- Um sem o outro não faz sentido: nome sem motivo vira assinatura em branco.
ALTER TABLE activity_execution
  ADD CONSTRAINT ck_execution_proxy_completo CHECK (
    (performed_by IS NULL AND proxy_reason IS NULL)
    OR (performed_by IS NOT NULL AND btrim(coalesce(proxy_reason,'')) <> ''));

-- Registrar por si mesmo não é registro por outro: seria ruído na linha do tempo.
ALTER TABLE activity_execution
  ADD CONSTRAINT ck_execution_proxy_outra_pessoa CHECK (
    performed_by IS NULL OR performed_by <> user_id);

-- ---------- 2. Quem pode registrar por outro ----------
-- Somente o líder do turno e a coordenação. A regra fica no banco porque a
-- rota não é o único caminho: a fila offline também escreve aqui.
CREATE OR REPLACE FUNCTION app_can_record_for_others(p_house uuid) RETURNS boolean AS $$
  SELECT app_current_role() IN ('lider_diurno','lider_noturno_geral','coordenador','gestor_geral')
     AND app_house_in_scope(p_house)
$$ LANGUAGE sql STABLE;
GRANT EXECUTE ON FUNCTION app_can_record_for_others(uuid) TO rede_app;

CREATE OR REPLACE FUNCTION app_execution_proxy_guard() RETURNS trigger AS $$
DECLARE v_house uuid;
BEGIN
  IF NEW.performed_by IS NULL THEN RETURN NEW; END IF;

  SELECT house_id INTO v_house FROM activity WHERE id = NEW.activity_id;
  IF NOT app_can_record_for_others(v_house) THEN
    RAISE EXCEPTION 'sem_permissao_registrar_por_outro' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Quem realizou precisa ser da equipe daquela casa. Sem isto, o campo
  -- aceitaria qualquer uuid e o nome na linha do tempo deixaria de significar.
  IF NOT EXISTS (
    SELECT 1 FROM user_house_assignment a
     WHERE a.user_id = NEW.performed_by AND a.house_id = v_house
       AND a.valid_from <= app_hoje()
       AND (a.valid_to IS NULL OR a.valid_to >= app_hoje())) THEN
    RAISE EXCEPTION 'pessoa_nao_e_da_casa' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_execution_proxy_guard ON activity_execution;
CREATE TRIGGER tg_execution_proxy_guard
  BEFORE INSERT OR UPDATE OF performed_by, proxy_reason ON activity_execution
  FOR EACH ROW EXECUTE FUNCTION app_execution_proxy_guard();

-- ---------- 3. Delegar atividade em aberto ----------
-- O caminho de cima para baixo, sem pedido: quem faltou não pede nada.
-- Atividade encerrada não é delegada — o que já aconteceu não muda de dono.
CREATE OR REPLACE FUNCTION app_delegate_activity(p_activity uuid, p_to uuid, p_reason text)
RETURNS TABLE (out_ok boolean, out_titulo text) AS $$
DECLARE v_a activity%ROWTYPE;
BEGIN
  IF btrim(coalesce(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_a FROM activity WHERE id = p_activity FOR UPDATE;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'atividade_inexistente' USING ERRCODE = 'no_data_found'; END IF;
  IF NOT app_can_record_for_others(v_a.house_id) THEN
    RAISE EXCEPTION 'sem_permissao_delegar' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_a.state IN ('concluida_no_horario','concluida_com_atraso','reagendada',
                   'cancelada_externamente','recusada_pelo_acolhido','nao_aplicavel',
                   'nao_realizada_saude','nao_realizada_ausencia_profissional',
                   'nao_realizada_transporte','nao_realizada_decisao_institucional') THEN
    RAISE EXCEPTION 'atividade_encerrada' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_house_assignment a
     WHERE a.user_id = p_to AND a.house_id = v_a.house_id
       AND a.valid_from <= app_hoje()
       AND (a.valid_to IS NULL OR a.valid_to >= app_hoje())) THEN
    RAISE EXCEPTION 'pessoa_nao_e_da_casa' USING ERRCODE = 'check_violation';
  END IF;

  -- A designação anterior NÃO é apagada: a linha nova entra por cima e as duas
  -- ficam. Quem olhar depois vê que a atividade trocou de mãos, quando e por quê.
  INSERT INTO activity_assignment (activity_id, user_id, assigned_by)
  VALUES (p_activity, p_to, app_current_user());

  -- Volta a exigir ciência: designado não é o mesmo que avisado (§8.2).
  UPDATE activity SET state = 'aguardando_ciencia', updated_at = now()
   WHERE id = p_activity;

  INSERT INTO audit_event (actor_id, action, entity, entity_id, detail)
  VALUES (app_current_user(), 'activity.delegate', 'activity', p_activity,
          jsonb_build_object('para', p_to, 'motivo', btrim(p_reason)));

  RETURN QUERY SELECT true, v_a.title;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_delegate_activity(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_delegate_activity(uuid, uuid, text) TO rede_app;

-- ---------- 4. Painel do plantão ----------
-- Quem está em quê AGORA. Visível a todo o plantão: o educador que precisa de
-- ajuda com uma criança tem o mesmo direito de saber que o colega saiu com
-- outra. Sem contagem, sem ordenação por pessoa, sem histórico — a ordem é a
-- do horário da atividade, como o turno acontece.
CREATE OR REPLACE FUNCTION app_shift_board(p_house uuid, p_date date DEFAULT NULL)
RETURNS TABLE (
  activity_id uuid, titulo text, horario timestamptz, estado activity_state,
  responsavel text, acolhido text
) AS $$
  SELECT a.id, a.title, a.scheduled_at, a.state,
         coalesce(app_user_display_name(asg.user_id), 'Equipe do plantão'),
         CASE WHEN a.person_id IS NOT NULL
              THEN app_person_display_name(a.person_id) END
         -- Não há coluna "onde a pessoa está", e não vai haver: o sistema sabe
         -- o que foi COMBINADO, não onde alguém se encontra (§3.3 — sem GPS).
         -- O título já diz "Consulta psicólogo — Luiz", que é o que o líder
         -- precisa saber às 22h. Ler `routine_item` daqui acoplaria esta
         -- partição à de rotina, e remover uma quebraria a outra.
    FROM activity a
    LEFT JOIN LATERAL (
      SELECT user_id FROM activity_assignment
       WHERE activity_id = a.id ORDER BY assigned_at DESC LIMIT 1) asg ON true
   WHERE a.house_id = p_house
     AND app_house_in_scope(p_house)
     AND (a.scheduled_at AT TIME ZONE app_fuso())::date
         = coalesce(p_date, app_hoje())
   ORDER BY a.scheduled_at, a.title
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_shift_board(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_shift_board(uuid, date) TO rede_app;
