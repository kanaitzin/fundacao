-- ============================================================
-- Rede Acolher — Migração 054: as ATAs como os formulários reais
--
-- Feita a partir dos dois formulários que a Fundação usa hoje:
-- "LIVRO ATA - AI 03" e "ATA - LÍDERES NOTURNO".
--
-- A ATA GERAL NOTURNA era, no sistema, uma lista de contatos e visitas. No
-- formulário real ela é uma GRADE: para cada uma das oito casas, o Líder
-- Noturno responde sempre as mesmas seis perguntas. É uma diferença de forma
-- que muda o uso — a grade mostra a noite inteira numa tela, e o que estava
-- em branco fica evidente.
--
-- As perguntas, como estão no papel:
--   1. situação do plantão: completo / férias-folga / afastamento-saúde;
--   2. apoio: precisou de apoio? apoiou outra casa?
--   3. intervalos dos educadores aconteceram?
--   4. houve intercorrência de saúde? (se sim, descreva)
--   5. o líder esteve presente na casa?  e houve contato com a casa?
--   6. a casa acionou o líder? (motivo e ação)  houve evasão? (fato e ação)
--
-- Uma observação que precisa ficar registrada: no formulário atual a pergunta
-- é "CONTATO POR TELEFONE OU WHATS FUNCIONAL DA CASA". Aqui o campo guarda
-- QUE houve contato e por qual meio, e o conteúdo do que foi tratado é
-- registrado no sistema — nunca em conversa de aplicativo, onde o dado sai da
-- instituição e fica no aparelho de quem estava de plantão (§3.3).
-- ============================================================

ALTER TABLE general_night_house_entry
  ADD COLUMN IF NOT EXISTS shift_status text
    CHECK (shift_status IS NULL OR shift_status IN ('completo','ferias_folga','afastamento_saude')),
  ADD COLUMN IF NOT EXISTS needed_support boolean,
  ADD COLUMN IF NOT EXISTS gave_support   boolean,
  ADD COLUMN IF NOT EXISTS breaks_taken   boolean,
  ADD COLUMN IF NOT EXISTS health_event   boolean,
  ADD COLUMN IF NOT EXISTS health_event_note text,
  ADD COLUMN IF NOT EXISTS leader_present boolean,
  ADD COLUMN IF NOT EXISTS contact_channel text
    CHECK (contact_channel IS NULL OR contact_channel IN
           ('telefone_institucional','presencial','sistema')),
  ADD COLUMN IF NOT EXISTS house_called_leader boolean,
  ADD COLUMN IF NOT EXISTS evasion boolean,
  ADD COLUMN IF NOT EXISTS evasion_note text,
  ADD COLUMN IF NOT EXISTS other_facts text;

-- Se houve, descreva: o formulário de papel confia na boa vontade; aqui a
-- descrição é condição do registro. "Sim" sem fato não informa nada a quem
-- vai ler amanhã de manhã.
ALTER TABLE general_night_house_entry
  DROP CONSTRAINT IF EXISTS ck_night_entry_descreve;
ALTER TABLE general_night_house_entry
  ADD CONSTRAINT ck_night_entry_descreve CHECK (
    (health_event IS NOT TRUE OR coalesce(length(btrim(health_event_note)), 0) >= 10)
    AND (evasion IS NOT TRUE OR coalesce(length(btrim(evasion_note)), 0) >= 10)
    AND (house_called_leader IS NOT TRUE OR coalesce(length(btrim(action_taken)), 0) >= 10)
  );

-- Preencher a linha de uma casa na ATA Geral Noturna.
-- Comando de sistema porque cruza a fronteira entre casas — o Líder Noturno
-- Geral é exceção funcional (§5.13), e a autorização é verificada aqui.
CREATE OR REPLACE FUNCTION app_night_house_entry(
  p_ata uuid, p_house uuid, p_dados jsonb
) RETURNS TABLE (entry_id uuid) AS $$
DECLARE v_id uuid; v_ata record;
BEGIN
  IF app_current_role() NOT IN ('lider_noturno_geral','gestor_geral') THEN
    RAISE EXCEPTION 'somente_lider_noturno_geral' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_ata FROM general_night_ata WHERE id = p_ata FOR UPDATE;
  IF v_ata IS NULL THEN
    RAISE EXCEPTION 'ata_geral_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_ata.status <> 'rascunho' THEN
    RAISE EXCEPTION 'ata_geral_fechada' USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  INSERT INTO general_night_house_entry (
    general_ata_id, house_id, shift_status, needed_support, gave_support, breaks_taken,
    health_event, health_event_note, leader_present, had_contact, contact_channel,
    house_called_leader, reason, action_taken, evasion, evasion_note, other_facts)
  VALUES (
    p_ata, p_house,
    nullif(p_dados->>'situacaoPlantao',''),
    (p_dados->>'precisouApoio')::boolean, (p_dados->>'apoiou')::boolean,
    (p_dados->>'intervalos')::boolean,
    (p_dados->>'intercorrenciaSaude')::boolean, nullif(p_dados->>'intercorrenciaNota',''),
    (p_dados->>'presencaLider')::boolean,
    coalesce((p_dados->>'houveContato')::boolean, false),
    nullif(p_dados->>'meioContato',''),
    (p_dados->>'casaAcionou')::boolean, nullif(p_dados->>'motivo',''),
    nullif(p_dados->>'acaoTomada',''),
    (p_dados->>'evasao')::boolean, nullif(p_dados->>'evasaoNota',''),
    nullif(p_dados->>'outrosFatos',''))
  ON CONFLICT (general_ata_id, house_id) DO UPDATE SET
    shift_status = EXCLUDED.shift_status,
    needed_support = EXCLUDED.needed_support,
    gave_support = EXCLUDED.gave_support,
    breaks_taken = EXCLUDED.breaks_taken,
    health_event = EXCLUDED.health_event,
    health_event_note = EXCLUDED.health_event_note,
    leader_present = EXCLUDED.leader_present,
    had_contact = EXCLUDED.had_contact,
    contact_channel = EXCLUDED.contact_channel,
    house_called_leader = EXCLUDED.house_called_leader,
    reason = EXCLUDED.reason,
    action_taken = EXCLUDED.action_taken,
    evasion = EXCLUDED.evasion,
    evasion_note = EXCLUDED.evasion_note,
    other_facts = EXCLUDED.other_facts,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_night_house_entry(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_night_house_entry(uuid, uuid, jsonb) TO rede_app;

-- A grade da noite: as oito casas, respondidas ou em branco.
-- Em branco APARECE — é a pergunta que o Líder ainda não respondeu, não uma
-- casa sem novidade.
CREATE OR REPLACE FUNCTION app_night_grid(p_ata uuid)
RETURNS TABLE (house_id uuid, codigo text, respondida boolean, situacao text,
               intercorrencia boolean, evasao boolean, acionou boolean,
               lider_presente boolean, ata_da_casa_confirmada boolean) AS $$
  SELECT h.id, h.code, e.id IS NOT NULL, e.shift_status,
         e.health_event, e.evasion, e.house_called_leader, e.leader_present,
         coalesce(e.house_ata_confirmed, false)
    FROM house h
    LEFT JOIN general_night_house_entry e
           ON e.house_id = h.id AND e.general_ata_id = p_ata
   WHERE h.active
   ORDER BY h.code
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_night_grid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_night_grid(uuid) TO rede_app;
