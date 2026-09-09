-- ============================================================
-- 0990 — A cor da linha de cada pessoa
--
-- Pedido do Marcelo em 09/09: "cada educador conseguir botar a cor da linha
-- dele, e aí eles não repitam a cor".
--
-- O QUE HAVIA. A ATA já pintava a borda de cada linha por autor — mas a cor
-- saía de um HASH do id do usuário sobre seis tons. Hash colide: dois
-- educadores do mesmo plantão podiam receber o mesmo tom, e aí a cor deixava
-- de distinguir exatamente onde precisava. Ninguém percebia, porque o nome
-- está escrito ao lado e a leitura continuava funcionando — a cor é que
-- parava de ajudar.
--
-- O QUE MUDA. A cor passa a ser ESCOLHIDA, e o sistema recusa repetir dentro
-- da mesma casa. Quem escolhe é a equipe técnica ou a coordenação da casa, não
-- a própria pessoa: se cada um escolhesse a sua, o primeiro a entrar levaria o
-- azul e a distinção viraria ordem de chegada.
--
-- O QUE NÃO MUDA. **O nome continua escrito ao lado, sempre.** A cor é apoio,
-- e some na impressão em preto e branco e no daltonismo. Um sistema em que a
-- cor diz quem escreveu é um sistema que mente para uma parte da equipe.
--
-- E uma coisa que a cor NÃO é: proteção. Ela não impede ninguém de usar a
-- conta de outro — quem faz isso é a sessão. Registrar isto aqui porque a cor
-- parece uma tranca e não é, e acreditar que é seria pior do que não ter.
-- ============================================================

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS line_color text;

COMMENT ON COLUMN app_user.line_color IS
  'Tom da paleta viva para a borda das linhas desta pessoa. NULL = o sistema '
  'escolhe por hash, como antes. Nunca é a única forma de identificar o autor.';

-- Os oito tons da paleta viva. Só estes: cor fora da paleta não foi conferida
-- contra os três fundos claros nem contra o tema escuro.
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS ck_app_user_line_color;
ALTER TABLE app_user ADD CONSTRAINT ck_app_user_line_color
  CHECK (line_color IS NULL OR line_color IN
    ('c-brand','c-move','c-ok','c-warn','c-info','c-med','c-other','c-crit'));

-- ------------------------------------------------------------
-- Que cores já estão em uso na casa — para a tela não oferecer o que o
-- servidor vai recusar. A fase 75 achou o contrário disto em outra tela: a
-- opção aparecia e a recusa só vinha depois do clique.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_cores_em_uso(p_house uuid)
RETURNS TABLE (cor text, de_quem text, user_id uuid) AS $$
  SELECT u.line_color, u.full_name, u.id
    FROM app_user u
    JOIN user_house_assignment a ON a.user_id = u.id AND a.valid_to IS NULL
   WHERE a.house_id = p_house
     AND app_house_in_scope(p_house)
     AND u.active
     AND u.line_color IS NOT NULL
   ORDER BY u.full_name
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_cores_em_uso(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cores_em_uso(uuid) TO rede_app;

-- ------------------------------------------------------------
-- Definir a cor de alguém.
--
-- Não é constraint de banco porque a unicidade é POR CASA, e a casa da pessoa
-- vive noutra tabela com histórico: um índice único teria de congelar esse
-- vínculo. A recusa fica aqui, com a frase que diz de quem é a cor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_definir_cor_da_linha(p_user uuid, p_cor text)
RETURNS TABLE (definida boolean, cor text) AS $$
DECLARE v_casa uuid; v_dono text;
BEGIN
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_cor' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT a.house_id INTO v_casa
    FROM user_house_assignment a
   WHERE a.user_id = p_user AND a.valid_to IS NULL;

  -- Sem casa, ninguém alcança: cor de gente institucional não é da coordenação.
  IF v_casa IS NULL OR NOT app_house_in_scope(v_casa) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'no_data_found';
  END IF;

  -- Tirar a cor é sempre permitido: volta ao tom automático.
  IF p_cor IS NULL THEN
    UPDATE app_user SET line_color = NULL WHERE id = p_user;
    RETURN QUERY SELECT true, NULL::text;
    RETURN;
  END IF;

  SELECT u.full_name INTO v_dono
    FROM app_user u
    JOIN user_house_assignment a ON a.user_id = u.id AND a.valid_to IS NULL
   WHERE a.house_id = v_casa AND u.active AND u.line_color = p_cor AND u.id <> p_user
   LIMIT 1;

  IF v_dono IS NOT NULL THEN
    -- A frase diz DE QUEM é a cor. "Já em uso" obrigaria a tentar uma por uma.
    RAISE EXCEPTION 'cor_ja_usada_por_%', v_dono USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE app_user SET line_color = p_cor WHERE id = p_user;
  RETURN QUERY SELECT true, p_cor;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_definir_cor_da_linha(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_definir_cor_da_linha(uuid, text) TO rede_app;

-- ------------------------------------------------------------
-- A lista da equipe passa a trazer a cor.
-- Só isto muda; o resto da função continua como a 0770 a deixou.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS app_staff_list();
CREATE FUNCTION app_staff_list()
RETURNS TABLE (id uuid, full_name text, email text, role text, active boolean,
               house_code text, house_id uuid, last_login timestamptz,
               must_change_password boolean, editavel boolean, line_color text) AS $$
  SELECT u.id, u.full_name, u.email, u.role::text, u.active,
         app_house_label(a.house_id), a.house_id,
         (SELECT max(s.created_at) FROM user_session s WHERE s.user_id = u.id),
         u.must_change_password,
         EXISTS (SELECT 1 FROM staff_role_grant g
                 WHERE g.creator_role = app_current_role() AND g.grantable_role = u.role),
         u.line_color
  FROM app_user u
  JOIN app_user eu ON eu.id = app_current_user()
  LEFT JOIN user_house_assignment a ON a.user_id = u.id AND a.valid_to IS NULL
  WHERE u.institution_id = eu.institution_id
    AND app_current_role() IN ('coordenador','gestor_geral','equipe_tecnica')
    AND (
      (a.house_id IS NOT NULL AND app_house_in_scope(a.house_id))
      OR (a.house_id IS NULL AND EXISTS (
            SELECT 1 FROM staff_role_grant g
             WHERE g.creator_role = app_current_role() AND g.grantable_role = u.role))
    )
  ORDER BY u.full_name
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_staff_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_staff_list() TO rede_app;

-- ------------------------------------------------------------
-- E a cor de quem escreveu, para quem LÊ a ATA.
--
-- Quem lê a ATA não alcança `app_staff_list` — o educador não gere equipe. Por
-- isso a cor do autor sai por função própria, que devolve SÓ o tom e nada mais
-- da pessoa: nome já vem no relato, e o resto não é da conta de quem lê.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_cor_do_autor(p_user uuid)
RETURNS text AS $$
  SELECT u.line_color FROM app_user u WHERE u.id = p_user
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_cor_do_autor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cor_do_autor(uuid) TO rede_app;
