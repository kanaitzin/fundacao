-- ============================================================
-- 1020 — Sair sozinho: um ESTADO, não uma pontuação
--
-- Pedido do Marcelo em 09/09: há adolescentes autorizados a sair sozinhos —
-- escola, trabalho, aprendizagem, reforço, atividade —, e a autorização é dada
-- pela equipe técnica e retirada quando há uma medida disciplinar. O educador
-- que vê o jovem sair de manhã precisa saber, ali, se ele vai sozinho ou
-- acompanhado.
--
-- ------------------------------------------------------------------
-- O QUE ESTE ARQUIVO NÃO FAZ, E POR QUÊ
--
-- A conversa passou por um sistema de PONTOS — "quebrou alguma coisa, perde
-- tantos pontos". Isso não entra: é item da regra 3, dos proibidos sem
-- exceção. E a razão é prática, não moral.
--
-- O número viaja e o motivo fica para trás. Daqui a seis meses "Davi: 40"
-- continua na tela e "quebrou a porta em março, três dias depois da visita da
-- mãe que não veio" não continua — e quem lê o 40 lê um fato sobre o Davi.
-- Número vira ranking sem tela de ranking: duas crianças com dois números na
-- mesma lista já é comparação. Número tira o autor: "o sistema tirou a saída
-- dele" no lugar de "eu decidi, e foi por isso" — e a segunda frase é a que
-- sustenta a conversa com o adolescente. E isso vai a audiência, onde uma
-- pontuação de comportamento se lê como diagnóstico, pior que o rótulo em
-- palavras porque parece objetiva.
--
-- O que resolve a MESMA necessidade operacional é um estado com motivo, autor
-- e prazo de revisão. Às sete da manhã é melhor: ninguém precisa saber qual é
-- o limiar, nem se 40 dá ou não dá. A linha diz o que fazer hoje, e diz quem
-- decidiu.
-- ------------------------------------------------------------------
--
-- TRÊS DECISÕES DE DESENHO:
--
-- 1. AUSÊNCIA NÃO É LIBERAÇÃO. Criança sem registro não aparece como
--    autorizada: aparece como sem definição, e a casa faz o que sempre fez.
--    Um padrão "liberada" transformaria o silêncio do cadastro em permissão.
--
-- 2. NADA SE SOBRESCREVE. Cada decisão é uma linha nova; a anterior é
--    encerrada com data. A pergunta "por que ele perdeu a saída em março" tem
--    de ter resposta em setembro.
--
-- 3. O PRAZO DE REVISÃO É OBRIGATÓRIO NA SUSPENSÃO. Medida sem prazo vira
--    permanente por esquecimento — e ninguém decidiu que seria permanente.
-- ============================================================

CREATE TABLE IF NOT EXISTS outing_permission (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL REFERENCES person(id),
  house_id    uuid NOT NULL REFERENCES house(id),
  status      text NOT NULL CHECK (status IN ('liberada','acompanhada','suspensa')),
  -- O motivo é sempre exigido, inclusive para liberar: "por que ele pode sair
  -- sozinho" é uma decisão tão registrável quanto a outra.
  reason      text NOT NULL CHECK (length(btrim(reason)) >= 10),
  -- Onde ele pode ir sozinho, quando isso é limitado. Texto livre porque a
  -- lista real é da casa: escola, curso, trabalho, reforço, a padaria da
  -- esquina.
  scope_note  text,
  review_on   date,
  valid_from  timestamptz NOT NULL DEFAULT now(),
  valid_to    timestamptz,
  decided_by  uuid NOT NULL REFERENCES app_user(id),
  ended_by    uuid REFERENCES app_user(id),
  -- Suspender sem prazo vira permanente por esquecimento.
  CHECK (status <> 'suspensa' OR review_on IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_outing_vigente
  ON outing_permission (person_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_outing_casa
  ON outing_permission (house_id, valid_from DESC);

ALTER TABLE outing_permission ENABLE ROW LEVEL SECURITY;

/*
 * QUEM LÊ: toda a equipe da casa, o educador inclusive — ele é o motivo de
 * isto existir. Ele lê o ESTADO e o MOTIVO, porque "vai acompanhado hoje" sem
 * o porquê é uma ordem sem explicação, e quem vai conversar com o adolescente
 * na porta é ele.
 */
CREATE POLICY op_select ON outing_permission FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
CREATE POLICY op_insert ON outing_permission FOR INSERT TO rede_app WITH CHECK (false);
GRANT SELECT ON outing_permission TO rede_app;

-- ------------------------------------------------------------
-- Decidir. Cada decisão encerra a anterior e nasce nova.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_definir_saida_sozinho(
  p_person uuid, p_status text, p_motivo text,
  p_ate date DEFAULT NULL, p_onde text DEFAULT NULL)
RETURNS TABLE (permissao_id uuid) AS $$
DECLARE v_casa uuid; v_id uuid;
BEGIN
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_saida_sozinho' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.house_id INTO v_casa
    FROM house_stay s WHERE s.person_id = p_person AND s.status = 'ativa';
  IF v_casa IS NULL OR NOT app_house_in_scope(v_casa) THEN
    RAISE EXCEPTION 'pessoa_fora_de_escopo' USING ERRCODE = 'no_data_found';
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
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_definir_saida_sozinho(uuid, text, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_definir_saida_sozinho(uuid, text, text, date, text) TO rede_app;

-- ------------------------------------------------------------
-- O que vale HOJE, para uma criança.
--
-- `a_revisar` diz que o prazo chegou — não que a autorização caiu sozinha. O
-- sistema não devolve nem retira permissão por decurso de prazo: ele lembra
-- quem decidiu de que combinou revisar. Autorização que volta sozinha no dia
-- marcado é decisão automática sobre a vida de alguém (regra 3).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_saida_sozinho(p_person uuid)
RETURNS TABLE (status text, motivo text, onde text, ate date,
               desde timestamptz, quem text, a_revisar boolean) AS $$
  SELECT o.status, o.reason, o.scope_note, o.review_on, o.valid_from,
         app_user_display_name(o.decided_by),
         o.review_on IS NOT NULL AND o.review_on <= app_hoje()
    FROM outing_permission o
   WHERE o.person_id = p_person AND o.valid_to IS NULL
     AND app_house_in_scope(o.house_id)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_saida_sozinho(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_saida_sozinho(uuid) TO rede_app;

-- ------------------------------------------------------------
-- O que a casa precisa ver de manhã: só quem NÃO está simplesmente liberado.
--
-- Devolver as vinte crianças faria a lista virar paisagem. O educador precisa
-- das exceções — quem vai acompanhado e quem não sai —, e delas ele precisa
-- às sete da manhã, com o motivo à mão.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_saidas_a_observar(p_house uuid)
RETURNS TABLE (person_id uuid, quem text, status text, motivo text,
               ate date, a_revisar boolean) AS $$
  SELECT o.person_id, coalesce(nullif(p.social_name,''), p.full_name),
         o.status, o.reason, o.review_on,
         o.review_on IS NOT NULL AND o.review_on <= app_hoje()
    FROM outing_permission o
    JOIN person p ON p.id = o.person_id
   WHERE o.house_id = p_house
     AND app_house_in_scope(p_house)
     AND o.valid_to IS NULL
     AND o.status <> 'liberada'
   ORDER BY coalesce(nullif(p.social_name,''), p.full_name)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_saidas_a_observar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_saidas_a_observar(uuid) TO rede_app;

-- ------------------------------------------------------------
-- O histórico. "Por que ele perdeu a saída em março" tem de ter resposta.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_historico_saida_sozinho(p_person uuid)
RETURNS TABLE (status text, motivo text, onde text, ate date,
               de timestamptz, ateq timestamptz, quem text) AS $$
  SELECT o.status, o.reason, o.scope_note, o.review_on,
         o.valid_from, o.valid_to, app_user_display_name(o.decided_by)
    FROM outing_permission o
   WHERE o.person_id = p_person
     AND app_house_in_scope(o.house_id)
   ORDER BY o.valid_from DESC
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_historico_saida_sozinho(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_historico_saida_sozinho(uuid) TO rede_app;
