-- A SAÍDA PELO PORTÃO (fase 207, pedido de 12/10).
--
-- O sistema sabia, desde a 1020, se uma criança pode sair sozinha: a decisão,
-- o motivo, o prazo e quem decidiu. Não sabia quem SAIU. E a portaria, que é
-- quem vê o portão, não via a decisão: estava fora do alcance da casa
-- (identity/1591) e só enxergava os visitantes.
--
-- O pedido de 12/10:
--
--  * quem autoriza é o educador, o líder, a coordenação e a equipe técnica.
--    Na 1020 eram só a técnica e a coordenação (e o gestor): muda aqui, na
--    função, e em nenhum outro lugar. O educador está no portão quando a
--    situação acontece, e a suspensão "a partir daquele momento" é dele;
--  * quem perdeu a autorização tem o motivo e o prazo registrados, como já era;
--  * a PORTARIA vê a lista das crianças da casa com o que vale para cada uma,
--    quem decidiu e desde quando, e NÃO vê o motivo. O motivo é da equipe;
--  * a portaria registra a saída e a volta.
--
-- A SAÍDA É UMA LINHA, como a visita da 1592: quem saiu, sozinho ou com quem,
-- para onde, a hora combinada de volta, quem registrou. A volta preenche a
-- mesma linha uma vez, com quem registrou e quando; a volta registrada depois
-- pede uma frase. Nada se apaga.
--
-- E A REGRA DO PORTÃO: sozinho, só quem tem a autorização registrada como
-- liberada. Sem registro é sem autorização (1020: ausência não é liberação), e
-- quem não pode sair sozinho sai acompanhado, com o nome de quem vai junto. O
-- sistema não segura ninguém no portão: ele recusa o REGISTRO de uma saída
-- sozinha que ninguém autorizou, e a frase manda chamar o plantão.

-- ------------------------------------------------------------
-- Quem decide, a partir de 12/10.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_definir_saida_sozinho(
  p_person uuid, p_status text, p_motivo text,
  p_ate date DEFAULT NULL, p_onde text DEFAULT NULL)
RETURNS TABLE (permissao_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_casa uuid; v_id uuid;
BEGIN
  IF app_current_role() NOT IN ('educador','lider_diurno','lider_noturno_geral',
                                'equipe_tecnica','coordenador') THEN
    RAISE EXCEPTION 'sem_permissao_saida_sozinho' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.house_id INTO v_casa
    FROM house_stay s WHERE s.person_id = p_person AND s.status = 'ativa';
  IF v_casa IS NULL OR NOT app_house_in_scope(v_casa) THEN
    RAISE EXCEPTION 'pessoa_fora_de_escopo' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_status NOT IN ('liberada','acompanhada','suspensa') THEN
    RAISE EXCEPTION 'situacao_invalida' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(length(btrim(p_motivo)), 0) < 10 THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status = 'suspensa' AND p_ate IS NULL THEN
    RAISE EXCEPTION 'suspensao_exige_prazo' USING ERRCODE = 'check_violation';
  END IF;
  IF p_ate IS NOT NULL AND p_ate < app_hoje() THEN
    RAISE EXCEPTION 'prazo_no_passado' USING ERRCODE = 'check_violation';
  END IF;

  -- A anterior é ENCERRADA, nunca apagada nem reescrita.
  UPDATE outing_permission
     SET valid_to = now(), ended_by = app_current_user()
   WHERE person_id = p_person AND valid_to IS NULL;

  INSERT INTO outing_permission
    (person_id, house_id, status, reason, scope_note, review_on, decided_by)
  VALUES (p_person, v_casa, p_status, btrim(p_motivo),
          nullif(btrim(p_onde), ''), p_ate, app_current_user())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id;
END $$;
REVOKE ALL ON FUNCTION app_definir_saida_sozinho(uuid, text, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_definir_saida_sozinho(uuid, text, text, date, text) TO rede_app;

-- ------------------------------------------------------------
-- A saída e a volta.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS child_outing (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id         uuid NOT NULL REFERENCES house(id),
  person_id        uuid NOT NULL REFERENCES person(id),
  alone            boolean NOT NULL,
  -- Com quem foi, quando não foi sozinho: o nome de quem responde por ela fora.
  with_whom        text,
  destination      text,
  expected_back_at timestamptz,
  left_at          timestamptz NOT NULL DEFAULT now(),
  left_by          uuid NOT NULL REFERENCES app_user(id),
  left_note        text,
  returned_at      timestamptz,
  returned_by      uuid REFERENCES app_user(id),
  -- Quando a volta foi REGISTRADA, que pode ser depois da volta: as duas horas
  -- ficam, e a diferença pede a frase em `return_note`.
  returned_registered_at timestamptz,
  return_note      text,
  CHECK (alone OR length(btrim(coalesce(with_whom, ''))) >= 3),
  CHECK (returned_at IS NULL OR returned_at >= left_at),
  CHECK ((returned_at IS NULL) = (returned_by IS NULL))
);
-- Uma saída aberta por criança: duas ao mesmo tempo é o toque duplo no portão.
CREATE UNIQUE INDEX IF NOT EXISTS uq_saida_aberta ON child_outing (person_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_saida_da_crianca ON child_outing (person_id, left_at DESC);
CREATE INDEX IF NOT EXISTS idx_saida_da_casa ON child_outing (house_id, left_at DESC);

ALTER TABLE child_outing ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON child_outing TO rede_app;
-- A casa lê pela regra de sempre; a portaria só pelas funções do portão.
DROP POLICY IF EXISTS child_outing_select ON child_outing;
CREATE POLICY child_outing_select ON child_outing FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));

-- ------------------------------------------------------------
-- O que o portão vê: as crianças da casa, o que vale para cada uma, quem
-- decidiu e desde quando, e a saída aberta. O MOTIVO não sai daqui.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_portaria_acolhidos(p_house uuid)
RETURNS TABLE (person_id uuid, nome text, situacao text, onde text, desde timestamptz,
               quem_decidiu text, fora_da_casa boolean,
               saida_id uuid, saiu_em timestamptz, sozinho boolean, com_quem text,
               destino text, volta_prevista timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- Pergunta de alcance sobre nada responde não (1629): sem casa, não há portão.
  IF p_house IS NULL OR NOT coalesce(app_registra_visita(p_house), false) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT p.id, coalesce(nullif(p.social_name, ''), p.full_name),
           o.status, o.scope_note, o.valid_from, app_user_display_name(o.decided_by),
           app_ausente_da_casa(p.id, app_hoje()),
           co.id, co.left_at, co.alone, co.with_whom, co.destination, co.expected_back_at
      FROM house_stay s
      JOIN person p ON p.id = s.person_id
      LEFT JOIN outing_permission o ON o.person_id = p.id AND o.valid_to IS NULL
      LEFT JOIN child_outing co ON co.person_id = p.id AND co.returned_at IS NULL
     WHERE s.house_id = p_house AND s.status = 'ativa'
     ORDER BY 2;
END $$;

CREATE OR REPLACE FUNCTION app_registrar_saida_acolhido(
  p_person uuid, p_sozinho boolean, p_com_quem text, p_destino text,
  p_volta time, p_nota text)
-- Devolve a CASA junto: a portaria não lê a casa da criança pela regra geral, e a
-- auditoria sem casa é linha que a coordenação não lê (fase 149).
RETURNS TABLE (saida uuid, casa uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_casa uuid; v_situacao text; v_id uuid; v_volta timestamptz;
BEGIN
  SELECT s.house_id INTO v_casa
    FROM house_stay s WHERE s.person_id = p_person AND s.status = 'ativa';
  IF v_casa IS NULL OR NOT coalesce(app_registra_visita(v_casa), false) THEN
    RAISE EXCEPTION 'pessoa_fora_de_escopo' USING ERRCODE = 'no_data_found';
  END IF;
  IF EXISTS (SELECT 1 FROM child_outing WHERE person_id = p_person AND returned_at IS NULL) THEN
    RAISE EXCEPTION 'saida_ja_aberta' USING ERRCODE = 'unique_violation';
  END IF;

  SELECT o.status INTO v_situacao
    FROM outing_permission o WHERE o.person_id = p_person AND o.valid_to IS NULL;
  IF p_sozinho AND coalesce(v_situacao, '') <> 'liberada' THEN
    RAISE EXCEPTION 'nao_sai_sozinho:%', coalesce(v_situacao, 'sem_registro')
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT p_sozinho AND length(btrim(coalesce(p_com_quem, ''))) < 3 THEN
    RAISE EXCEPTION 'com_quem_obrigatorio' USING ERRCODE = 'check_violation';
  END IF;

  -- A hora combinada é a de hoje, no relógio da instituição; se já passou,
  -- é a de amanhã (saiu às 22h para voltar à 1h).
  IF p_volta IS NOT NULL THEN
    v_volta := (app_hoje() + p_volta) AT TIME ZONE app_fuso();
    IF v_volta < now() THEN v_volta := v_volta + interval '1 day'; END IF;
  END IF;

  INSERT INTO child_outing (house_id, person_id, alone, with_whom, destination,
                            expected_back_at, left_by, left_note)
  VALUES (v_casa, p_person, p_sozinho,
          CASE WHEN p_sozinho THEN NULL ELSE btrim(p_com_quem) END,
          nullif(btrim(coalesce(p_destino, '')), ''), v_volta, app_current_user(),
          nullif(btrim(coalesce(p_nota, '')), ''))
  RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, v_casa;
END $$;

CREATE OR REPLACE FUNCTION app_registrar_volta_acolhido(
  p_saida uuid, p_voltou_em timestamptz, p_nota text)
RETURNS TABLE (person_id uuid, house_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE r child_outing%ROWTYPE; v_quando timestamptz;
BEGIN
  SELECT * INTO r FROM child_outing WHERE id = p_saida;
  IF r.id IS NULL OR NOT coalesce(app_registra_visita(r.house_id), false) THEN
    RAISE EXCEPTION 'saida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF r.returned_at IS NOT NULL THEN
    RAISE EXCEPTION 'volta_ja_registrada' USING ERRCODE = 'check_violation';
  END IF;
  v_quando := coalesce(p_voltou_em, now());
  IF v_quando < r.left_at OR v_quando > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'hora_da_volta_invalida' USING ERRCODE = 'check_violation';
  END IF;
  -- A volta registrada bem depois de acontecer pede a frase que explica.
  IF v_quando < now() - interval '15 minutes' AND length(btrim(coalesce(p_nota, ''))) < 10 THEN
    RAISE EXCEPTION 'volta_tardia_pede_nota' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE child_outing
     SET returned_at = v_quando, returned_by = app_current_user(),
         returned_registered_at = now(), return_note = nullif(btrim(coalesce(p_nota, '')), '')
   WHERE id = p_saida;
  RETURN QUERY SELECT r.person_id, r.house_id;
END $$;

-- As saídas de uma criança, para o perfil dela. Pela regra da casa (RLS).
CREATE OR REPLACE FUNCTION app_saidas_do_acolhido(p_person uuid)
RETURNS TABLE (id uuid, saiu_em timestamptz, sozinho boolean, com_quem text, destino text,
               volta_prevista timestamptz, voltou_em timestamptz, quem_saida text,
               quem_volta text, nota_saida text, nota_volta text, volta_registrada_em timestamptz)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT co.id, co.left_at, co.alone, co.with_whom, co.destination, co.expected_back_at,
         co.returned_at, app_user_display_name(co.left_by), app_user_display_name(co.returned_by),
         co.left_note, co.return_note, co.returned_registered_at
    FROM child_outing co
   WHERE co.person_id = p_person
   ORDER BY co.left_at DESC
   LIMIT 60
$$;

REVOKE ALL ON FUNCTION app_portaria_acolhidos(uuid),
  app_registrar_saida_acolhido(uuid, boolean, text, text, time, text),
  app_registrar_volta_acolhido(uuid, timestamptz, text),
  app_saidas_do_acolhido(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_portaria_acolhidos(uuid),
  app_registrar_saida_acolhido(uuid, boolean, text, text, time, text),
  app_registrar_volta_acolhido(uuid, timestamptz, text),
  app_saidas_do_acolhido(uuid) TO rede_app;
