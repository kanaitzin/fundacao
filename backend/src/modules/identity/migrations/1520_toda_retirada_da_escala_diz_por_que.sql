-- ============================================================
-- 1520 — Toda retirada da escala diz por quê
--
-- Decisão da Fundação em 22/09, respondendo à pergunta que a conferência daquele
-- dia abriu: *"colocar alguém na escala ou remover como quiserem, deixando
-- registro do porquê"* — e, perguntada se isso valia para o plantão FUTURO
-- também, respondeu **sempre exigir motivo**.
--
-- O QUE ERA, e a razão que a 1310 escreveu: só o plantão JÁ PASSADO exigia o
-- motivo, porque *"mudar o futuro é organização; mudar o passado é dizer que a
-- pessoa não estava lá"*. O argumento continua correto sobre o HISTÓRICO — e não
-- era o único em jogo. Quem pergunta *"por que eu fui tirado do plantão de
-- sábado?"* pergunta na segunda-feira, sobre um plantão que era futuro quando a
-- mudança foi feita; a escala guardava quem tirou e quando, e ninguém para
-- responder o porquê. O custo é de alguns segundos para quem remonta a escala às
-- 6h50; o de não ter a frase é de uma conversa que ninguém consegue ter.
--
-- VALE PARA A SUBSTITUIÇÃO TAMBÉM, e isto é decisão deste arquivo. A
-- substituição é uma retirada com uma entrada em cima, e "a Joana entrou no
-- lugar" **não explica por que a Marta saiu** — é o que a coluna
-- `replaces_assignment_id` já diz sozinha. Deixar a substituição sem motivo
-- abriria o caminho de sempre: quem não quisesse escrever a frase substituiria
-- em vez de retirar, e a regra nova valeria para o botão menos usado.
--
-- O PISO É DEZ CARACTERES, o mesmo do relato, do "se necessário" e da retirada
-- da folha da portaria (1500) — e o mesmo que o passado já exigia aqui. Não é
-- número mágico: é o tamanho abaixo do qual a frase não responde a ninguém.
-- *"mudou"* não serve para a pessoa que vai perguntar.
--
-- Os dois corpos saíram do CATÁLOGO (`pg_get_functiondef`), não de redigitação —
-- a lição das fases 1450 e 1460 —, e a única diferença é a condição da data.
-- ============================================================

CREATE OR REPLACE FUNCTION public.app_desescalar(p_id uuid, p_motivo text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_a shift_assignment%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM shift_assignment WHERE id = p_id;
  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'escala_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF app_current_role() NOT IN
       ('lider_diurno','equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'escala: quem monta a escala da casa é a coordenação, a equipe técnica ou o Líder Diurno dela.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_house_in_scope(v_a.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_a.revoked_at IS NOT NULL THEN
    RETURN false;
  END IF;
  /*
   * TODA RETIRADA DIZ POR QUÊ (1520, decisão da Fundação de 22/09).
   *
   * Até aqui só o plantão passado exigia, e o argumento da 1310 — "mudar o
   * futuro é organização" — continua correto sobre o histórico. O que ele não
   * cobria: quem pergunta "por que eu fui tirado do plantão de sábado?"
   * pergunta na segunda, sobre um plantão que era futuro quando a mudança foi
   * feita. A escala guardava quem tirou e quando, e ninguém para responder.
   *
   * A frase da recusa muda com o tempo do plantão, porque o motivo é outro: no
   * passado ela responde "quem estava na casa naquela noite"; no futuro,
   * responde à pessoa que vai perguntar.
   */
  IF length(btrim(coalesce(p_motivo,''))) < 10 THEN
    IF v_a.on_date < app_hoje() THEN
      RAISE EXCEPTION 'escala: este plantão já passou. Escreva por que a escala dele muda — é ela que responde quem estava na casa naquela noite.'
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'escala: escreva por que esta pessoa sai do plantão. Ela vai perguntar, e é esta frase que responde.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE shift_assignment
     SET revoked_at = now(), revoked_by = app_current_user(),
         revoke_reason = nullif(btrim(coalesce(p_motivo,'')), '')
   WHERE id = p_id;
  RETURN true;
END $function$;
REVOKE ALL ON FUNCTION app_desescalar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_desescalar(uuid, text) TO rede_app;

CREATE OR REPLACE FUNCTION public.app_substituir_no_plantao(p_id uuid, p_novo_user uuid, p_motivo text)
 RETURNS TABLE(novo_id uuid, saiu text, entrou text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_a shift_assignment%ROWTYPE; v_novo uuid;
BEGIN
  SELECT * INTO v_a FROM shift_assignment WHERE id = p_id;
  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'escala_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF app_current_role() NOT IN
       ('lider_diurno','equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'escala: quem monta a escala da casa é a coordenação, a equipe técnica ou o Líder Diurno dela.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_house_in_scope(v_a.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_a.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'escala: este plantão já tinha sido retirado da escala. Escale a pessoa nova direto.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_novo_user = v_a.user_id THEN
    RAISE EXCEPTION 'escala: a pessoa que entra é a mesma que sai. Para só mudar o horário, retire e escale de novo.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = p_novo_user AND u.active) THEN
    RAISE EXCEPTION 'escala: esta pessoa não está ativa no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;
  /*
   * A SUBSTITUIÇÃO PEDE MOTIVO SEMPRE (1520), como a retirada.
   *
   * "A Joana entrou no lugar" não explica por que a Marta saiu — isso a coluna
   * `replaces_assignment_id` já diz sozinha. E deixar só a substituição sem a
   * frase abriria o caminho de sempre: quem não quisesse escrever substituiria
   * em vez de retirar, e a regra nova valeria para o botão menos usado.
   */
  IF length(btrim(coalesce(p_motivo,''))) < 10 THEN
    IF v_a.on_date < app_hoje() THEN
      RAISE EXCEPTION 'escala: este plantão já passou. Escreva por que a escala dele muda — é ela que responde quem estava na casa naquela noite.'
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'escala: escreva por que esta troca acontece. Quem sai vai perguntar, e é esta frase que responde.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  /*
   * A PESSOA NOVA ENTRA PRIMEIRO, e a antiga sai depois.
   *
   * Não é indiferente: se a nova já estivesse escalada neste turno, o
   * `unique_violation` estoura AQUI, antes de a antiga ter saído — e a
   * transação volta com o turno intacto. Na ordem inversa, o erro chegaria
   * depois de a casa já ter perdido quem estava escalado, e a recusa deixaria
   * um rastro pior do que o pedido.
   */
  INSERT INTO shift_assignment
    (house_id, user_id, on_date, period, start_time, end_time, note,
     created_by, replaces_assignment_id)
  VALUES (v_a.house_id, p_novo_user, v_a.on_date, v_a.period,
          v_a.start_time, v_a.end_time, v_a.note,
          app_current_user(), v_a.id)
  RETURNING shift_assignment.id INTO v_novo;

  UPDATE shift_assignment
     SET revoked_at = now(), revoked_by = app_current_user(),
         /* O motivo guarda a substituição por escrito, e não só pelo
            parentesco: quem lê a linha revogada seis meses depois lê uma
            frase, e não um id. */
         revoke_reason = coalesce(
           nullif(btrim(coalesce(p_motivo,'')), ''),
           'Substituído(a) por ' || app_user_display_name(p_novo_user) || '.')
   WHERE id = p_id;

  RETURN QUERY SELECT v_novo,
                      app_user_display_name(v_a.user_id),
                      app_user_display_name(p_novo_user);
END $function$;
REVOKE ALL ON FUNCTION app_substituir_no_plantao(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_substituir_no_plantao(uuid, uuid, text) TO rede_app;

