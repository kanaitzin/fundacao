-- ============================================================
-- 1540 — Todos leem a ATA coletiva, e quem não lê o restrito pode PEDIR
--
-- Decisão da Fundação em 22/09, e ela veio em duas partes:
--
--   *"Todos leem a ata coletiva, seja manhã ou noite, para consultar informações
--   de como os atendidos estavam — menos as restritas, que são apenas para quem
--   tem autorização. A pessoa pode solicitar ler alguma coisa, e cabe à equipe
--   deixar ou não."*
--
-- ------------------------------------------------------------
-- PARTE 1 — A ATA COLETIVA É DE TODO CARGO QUE CUIDA DA CASA
--
-- A 1510 já tinha aberto o arquivo ao educador. Falta a **Enfermagem**, e o caso
-- dela é o exemplo do pedido: ela chega às 9h e precisa saber como a criança
-- passou a noite — se dormiu, se comeu, se vomitou a dose. Esse dado está na ATA
-- do turno noturno, e ela não o alcançava.
--
-- E a LINHA DESTA CASA NA ATA GERAL NOTURNA passa a aparecer para os dois cargos
-- que a 1510 tinha deixado de fora — educador e Enfermagem. **"Seja manhã ou
-- noite"** é a frase da decisão, e o registro da noite é metade dela. *O que
-- continua fechado é a FOLHA COMPLETA das oito casas*, que é outro documento e
-- outra rota: ela fica com quem responde pela instituição, e o argumento é o da
-- fase 136 — o que o Líder Noturno Geral escreveu sobre as outras sete casas é
-- assunto delas.
--
-- **COZINHA E ADMIN_TÉCNICO CONTINUAM FORA, e não por esquecimento.** A cozinha
-- recebe papel, como a portaria — ela nunca entrou no sistema para isto, e a ATA
-- traz o dia inteiro de vinte crianças para responder a uma pergunta sobre
-- restrição alimentar que as três folhas da cozinha já respondem. O
-- `admin_tecnico` é conta técnica: não cuida de criança nenhuma. "Todos" é todo
-- cargo que está com os acolhidos — e o alcance por casa continua valendo por
-- cima de tudo.
--
-- ------------------------------------------------------------
-- PARTE 2 — O PEDIDO DE LEITURA
--
-- **O PEDIDO É PELA ATA, E NÃO PELA LINHA** — e esta é a decisão de desenho que
-- o resto segue. Quem não alcança a linha restrita **não sabe qual linha é**: a
-- tela lhe diz apenas *"há 2 observações restritas"*, pela `app_ata_restritas`.
-- Pedir "aquela linha" exigiria que ela já soubesse qual — e uma lista de linhas
-- restritas para escolher seria o vazamento que a restrição existe para impedir.
--
-- **A LIBERAÇÃO É REVOGÁVEL**, e isso não é zelo. Uma liberação que não se
-- retira é ampliação permanente de acesso pela porta dos fundos: seis meses
-- depois aquela pessoa continua lendo, e ninguém decidiu isso.
--
-- **AS DUAS RESPOSTAS PEDEM MOTIVO**, com o mesmo piso de dez caracteres do
-- resto da casa. Negar é o que a pessoa vai perguntar; **liberar é o que alguém
-- vai perguntar pela criança** — quem abriu o registro dela, e por quê.
--
-- **O MOTIVO NÃO VAI PARA O LOG.** Ele diz o que alguém precisa saber sobre uma
-- criança, e log não copia conteúdo sensível (§5). Fica nesta tabela, com RLS.
-- A auditoria guarda que houve pedido, decisão e revogação — e quem.
-- ============================================================

-- ------------------------------------------------------------
-- PARTE 1
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_consulta_arquivo_ata()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_current_role() IN
    ('coordenador','equipe_tecnica','lider_diurno','lider_noturno_geral','gestor_geral',
     -- 22/09: quem passa doze horas com a casa é quem primeiro percebe o padrão.
     'educador',
     -- 22/09, segunda parte: a Enfermagem chega às 9h e precisa saber como a
     -- criança passou a noite. O dado está na ATA do noturno.
     'enfermagem')
$$;

CREATE OR REPLACE FUNCTION app_le_ata_geral() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_current_role() IN
    ('lider_noturno_geral','equipe_tecnica','coordenador','gestor_geral',
     'admin_tecnico','lider_diurno',
     -- 1540: "seja manhã ou noite". Aqui é só a LINHA DESTA CASA — a folha
     -- completa das oito é outra rota, e continua com quem responde pela
     -- instituição.
     'educador','enfermagem')
$$;

-- ------------------------------------------------------------
-- PARTE 2 — o pedido
-- ------------------------------------------------------------
-- ------------------------------------------------------------
-- Quem decide — os três que a Fundação nomeou em 22/09 para a
-- confidencialidade do acolhido: *"equipe técnica, coordenador e educador
-- líder"*. É a mesma lista da leitura do relato restrito e da ocorrência
-- protegida; decidir quem mais lê é ato da mesma família.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_decide_leitura_da_ata() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_current_role() IN ('equipe_tecnica','coordenador','lider_diurno')
$$;
REVOKE ALL ON FUNCTION app_decide_leitura_da_ata() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_decide_leitura_da_ata() TO rede_app;


CREATE TABLE IF NOT EXISTS ata_read_request (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id         uuid NOT NULL REFERENCES ata(id),
  house_id       uuid NOT NULL REFERENCES house(id),
  requested_by   uuid NOT NULL REFERENCES app_user(id),
  request_reason text NOT NULL,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  -- A decisão. Nula enquanto o pedido espera.
  granted        boolean,
  decided_by     uuid REFERENCES app_user(id),
  decided_at     timestamptz,
  decision_reason text,
  -- A retirada da liberação. Nunca apaga o pedido.
  revoked_at     timestamptz,
  revoked_by     uuid REFERENCES app_user(id),
  revoke_reason  text
);

ALTER TABLE ata_read_request ADD CONSTRAINT pedido_decidido_tem_motivo
  CHECK (granted IS NULL
         OR (decided_by IS NOT NULL AND decided_at IS NOT NULL
             AND length(btrim(coalesce(decision_reason,''))) >= 10));
ALTER TABLE ata_read_request ADD CONSTRAINT pedido_pedido_tem_motivo
  CHECK (length(btrim(request_reason)) >= 10);
-- Só se revoga o que foi liberado, e a revogação diz por quê.
ALTER TABLE ata_read_request ADD CONSTRAINT revogacao_so_do_liberado
  CHECK (revoked_at IS NULL
         OR (granted AND revoked_by IS NOT NULL
             AND length(btrim(coalesce(revoke_reason,''))) >= 10));

-- Um pedido VIVO por pessoa e por ATA. O negado e o revogado não bloqueiam um
-- pedido novo: a situação muda, e quem cuida da criança pode precisar de novo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ata_read_request_vivo
  ON ata_read_request (ata_id, requested_by)
  WHERE revoked_at IS NULL AND (granted IS NULL OR granted);
CREATE INDEX IF NOT EXISTS ix_ata_read_request_pendente
  ON ata_read_request (house_id, requested_at DESC) WHERE granted IS NULL;

ALTER TABLE ata_read_request ENABLE ROW LEVEL SECURITY;

/*
 * QUEM VÊ O PEDIDO: quem o fez, e quem decide.
 *
 * Quem pediu precisa acompanhar a resposta — um pedido que some é um pedido que
 * se refaz. Quem decide precisa da fila da casa. Mais ninguém: a lista de quem
 * pediu para ler o quê é, ela mesma, uma informação sobre o caso.
 */
CREATE POLICY arr_select ON ata_read_request FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id)
         AND (requested_by = app_current_user() OR app_decide_leitura_da_ata()));

GRANT SELECT ON ata_read_request TO rede_app;
-- Escrita só pelas funções abaixo: o pedido e a decisão são atos com guarda, e
-- um INSERT solto da aplicação passaria por fora delas.
REVOKE INSERT, UPDATE, DELETE ON ata_read_request FROM rede_app;

COMMENT ON TABLE ata_read_request IS
  'Pedido para ler as observações restritas de uma ATA, e a decisão da equipe. O pedido é pela ATA e não pela linha: quem não alcança a linha não sabe qual é. A liberação é revogável.';

-- A liberação viva desta pessoa para esta ATA.
CREATE OR REPLACE FUNCTION app_tem_liberacao_da_ata(p_ata uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM ata_read_request r
     WHERE r.ata_id = p_ata
       AND r.requested_by = app_current_user()
       AND r.granted
       AND r.revoked_at IS NULL)
$$;
REVOKE ALL ON FUNCTION app_tem_liberacao_da_ata(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_tem_liberacao_da_ata(uuid) TO rede_app;

/*
 * E A POLÍTICA DA LINHA RESTRITA ganha a terceira porta.
 *
 * As duas primeiras continuam iguais: a linha aberta é da casa, e a restrita é
 * dos cargos de `app_le_ata_restrita`. A terceira é a liberação — por ATA, por
 * pessoa, revogável, e concedida por gente.
 */
DROP POLICY IF EXISTS note_select ON ata_note;
CREATE POLICY note_select ON ata_note FOR SELECT TO rede_app USING (
  CASE
    WHEN app_current_role() = 'gestor_geral' THEN true
    ELSE house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
  END
  AND (NOT restricted
       OR app_le_ata_restrita()
       OR app_tem_liberacao_da_ata(ata_id))
);

-- ------------------------------------------------------------
-- OS TRÊS ATOS. São funções e não `INSERT` da aplicação porque cada um tem
-- guarda própria, e escrita solta passaria por fora delas.
-- ------------------------------------------------------------

/*
 * PEDIR. Só faz sentido para quem NÃO alcança a linha e para uma ATA que TEM
 * linha restrita — pedir para ler o que não existe gera uma fila de nada, e
 * fila cheia de nada é fila que ninguém abre.
 */
CREATE OR REPLACE FUNCTION app_pedir_leitura_da_ata(p_ata uuid, p_motivo text)
RETURNS uuid AS $$
DECLARE v_casa uuid; v_n integer; v_id uuid;
BEGIN
  SELECT house_id INTO v_casa FROM ata WHERE id = p_ata;
  IF v_casa IS NULL THEN
    RAISE EXCEPTION 'ata_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(v_casa) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app_le_ata_restrita() THEN
    RAISE EXCEPTION 'ata: você já lê as observações restritas desta casa.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(p_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'ata: escreva o que você precisa saber. Quem decide lê esta frase, e é por ela que decide.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*)::int INTO v_n FROM ata_note WHERE ata_id = p_ata AND restricted;
  IF coalesce(v_n, 0) = 0 THEN
    RAISE EXCEPTION 'ata: esta ATA não tem observação restrita nenhuma.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF app_tem_liberacao_da_ata(p_ata) THEN
    RAISE EXCEPTION 'ata: você já foi liberado para ler as observações restritas desta ATA.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM ata_read_request r
              WHERE r.ata_id = p_ata AND r.requested_by = app_current_user()
                AND r.granted IS NULL) THEN
    RAISE EXCEPTION 'ata: o seu pedido para esta ATA já está esperando resposta.'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO ata_read_request (ata_id, house_id, requested_by, request_reason)
  VALUES (p_ata, v_casa, app_current_user(), btrim(p_motivo))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_pedir_leitura_da_ata(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_pedir_leitura_da_ata(uuid, text) TO rede_app;

/*
 * DECIDIR. As duas respostas pedem motivo: negar é o que a PESSOA vai
 * perguntar, e liberar é o que alguém vai perguntar pela CRIANÇA.
 */
CREATE OR REPLACE FUNCTION app_decidir_leitura_da_ata(
  p_pedido uuid, p_liberar boolean, p_motivo text) RETURNS boolean AS $$
DECLARE v_r ata_read_request%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM ata_read_request WHERE id = p_pedido;
  IF v_r.id IS NULL THEN
    RAISE EXCEPTION 'pedido_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_decide_leitura_da_ata() THEN
    RAISE EXCEPTION 'ata: quem decide sobre a observação restrita é a equipe técnica, a coordenação ou o Líder Diurno da casa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_house_in_scope(v_r.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_r.granted IS NOT NULL THEN
    RAISE EXCEPTION 'ata: este pedido já foi respondido.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_r.requested_by = app_current_user() THEN
    RAISE EXCEPTION 'ata: ninguém libera o próprio pedido.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(p_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'ata: escreva por que você libera ou nega. Negar é o que a pessoa vai perguntar; liberar é o que alguém vai perguntar pela criança.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE ata_read_request
     SET granted = p_liberar, decided_by = app_current_user(), decided_at = now(),
         decision_reason = btrim(p_motivo)
   WHERE id = p_pedido;
  RETURN true;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_decidir_leitura_da_ata(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_decidir_leitura_da_ata(uuid, boolean, text) TO rede_app;

/*
 * REVOGAR. A liberação que não se retira é ampliação permanente de acesso pela
 * porta dos fundos. O pedido NÃO é apagado: fica com a liberação, a revogação e
 * os dois motivos, porque a história é o que responde depois.
 */
CREATE OR REPLACE FUNCTION app_revogar_leitura_da_ata(p_pedido uuid, p_motivo text)
RETURNS boolean AS $$
DECLARE v_r ata_read_request%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM ata_read_request WHERE id = p_pedido;
  IF v_r.id IS NULL THEN
    RAISE EXCEPTION 'pedido_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_decide_leitura_da_ata() THEN
    RAISE EXCEPTION 'ata: quem decide sobre a observação restrita é a equipe técnica, a coordenação ou o Líder Diurno da casa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_house_in_scope(v_r.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_r.granted IS NOT TRUE OR v_r.revoked_at IS NOT NULL THEN
    RETURN false;
  END IF;
  IF length(btrim(coalesce(p_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'ata: escreva por que a liberação sai. Quem foi liberado vai perguntar.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE ata_read_request
     SET revoked_at = now(), revoked_by = app_current_user(), revoke_reason = btrim(p_motivo)
   WHERE id = p_pedido;
  RETURN true;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_revogar_leitura_da_ata(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_revogar_leitura_da_ata(uuid, text) TO rede_app;
