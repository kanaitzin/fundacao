-- =============================================================================
-- 1370 — A ESCALA NÃO SE DEDUZ.
--
-- Decisão da Fundação, reafirmada em 20/09/2026 depois de eu levantar a
-- consequência: *"na vida real as escalas já são montadas com antecedência,
-- apenas irão cadastrar aqui, caso alguém não possa vir eles podem cancelar a
-- pessoa da escala daquele plantão, podendo se quiser também incluir outro
-- funcionário a qualquer momento, tudo fica em registro, mas NÃO CABE A NÓS
-- DEDUZIR."*
--
-- O que a 0960 fazia, e sai: quando a escala do dia não tinha ninguém, ela caía
-- para a escala SEMANAL (`work_schedule`) e, não achando, para o VÍNCULO da
-- casa — e cobrava a passagem de todo educador vinculado, de folga ou não. Era
-- o defeito que a 0420 existiu para corrigir, sobrevivendo com nome novo: a ATA
-- fechava "com pendência" nomeando quem não estava lá.
--
-- A partir daqui a escala é a única fonte. **Sem escala lançada, ninguém é
-- nomeado** — e a casa vê que a escala não foi lançada, que é uma pendência
-- DELA e não de uma pessoa.
--
-- ---------------------------------------------------------------------------
-- O QUE ISTO **NÃO** MUDA, E É O QUE SEGURA A EDUCADORA DAS 23H.
--
-- Assinar a passagem nunca dependeu da escala, e continua não dependendo:
-- quem cobriu o turno sem constar assina do mesmo jeito (há teste na
-- `escala.e2e.spec.ts` desde a 0960 — *"escala que trava é escala que a casa
-- contorna"*). A escala decide quem é **cobrado**, nunca quem **pode**. Sem
-- isto, tirar a dedução deixaria um dia sem escala sem ninguém para assinar, e
-- foi essa a objeção que eu levantei antes de a decisão ser reafirmada.
--
-- ---------------------------------------------------------------------------
-- E O BURACO QUE A DECISÃO ABRE, QUE ESTA MIGRAÇÃO FECHA.
--
-- Com a dedução fora, `app_missing_handovers` devolve ZERO num turno sem escala
-- — e a ATA fechava como `fechada`, limpa, ainda que NINGUÉM tivesse assinado
-- nada. "Zero pendências" e "ninguém registrou o turno" passariam a ser a mesma
-- resposta, que é a pior troca possível: o dia em que a casa esquecer de lançar
-- a escala E esquecer de assinar, a ATA sai impecável.
--
-- Então o fechamento passa a olhar as duas coisas: alguém cobrado que não
-- assinou, **ou** um turno sem escala lançada e sem nenhuma passagem. A
-- contagem `missing_signatures` continua contando só GENTE, porque é o que ela
-- diz — o outro caso é a casa, e a tela o escreve por extenso.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A FONTE, agora numa função só — porque a lista pode vir VAZIA.
--
-- A 0960 devolvia a fonte como coluna de cada linha, e isso deixou de servir:
-- num turno sem escala não há linha nenhuma para carregar a palavra
-- "escala_nao_lancada". Quem pergunta "a escala deste turno foi lançada?"
-- precisa de uma resposta que exista quando a lista não existe.
--
-- *De passagem, um defeito da 0960 que ninguém tinha visto: ela dizia em
-- comentário que "a `fonte` continua saindo na resposta, porque ela muda o que
-- a tela diz" — e o `shifts.service.ts` nunca a lia. `SELECT user_id,
-- full_name, role` e nada mais. A tela nunca pôde distinguir "faltou assinar"
-- de "escala não cadastrada", que era a razão de a coluna existir.*
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_fonte_da_escala(p_shift uuid) RETURNS text AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM shift_assignment a
      JOIN shift s ON s.id = p_shift
     WHERE a.house_id = s.house_id
       AND a.on_date = s.on_date
       AND a.period = s.period
       AND a.revoked_at IS NULL
  ) THEN 'escala_do_dia' ELSE 'escala_nao_lancada' END
$$ LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_fonte_da_escala(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_fonte_da_escala(uuid) TO rede_app;

COMMENT ON FUNCTION app_fonte_da_escala(uuid) IS
  'A escala deste turno foi lançada? escala_do_dia ou escala_nao_lancada. '
  'Não existe terceira: desde a 1370 o sistema não deduz escala.';

-- ---------------------------------------------------------------------------
-- QUEM DEVIA ASSINAR: a escala do dia, e nada mais.
--
-- A coluna `fonte` continua na resposta por compatibilidade de forma, e agora
-- ela só pode dizer uma coisa — se há linha, a escala foi lançada. Quem quer
-- saber do turno vazio pergunta à `app_fonte_da_escala`.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app_missing_handovers(uuid);

CREATE OR REPLACE FUNCTION app_missing_handovers(p_shift uuid)
RETURNS TABLE (user_id uuid, full_name text, role text, fonte text) AS $$
  SELECT u.id, u.full_name, u.role::text, 'escala_do_dia'::text
    FROM app_user u
    JOIN shift s ON s.id = p_shift
    JOIN shift_assignment a
      ON a.user_id = u.id
     AND a.house_id = s.house_id
     AND a.on_date = s.on_date
     AND a.period = s.period
     AND a.revoked_at IS NULL
   WHERE u.active
     AND u.role IN ('educador','lider_diurno')
     AND NOT EXISTS (
       SELECT 1 FROM handover h WHERE h.shift_id = p_shift AND h.user_id = u.id)
$$ LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_missing_handovers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_missing_handovers(uuid) TO rede_app;

COMMENT ON FUNCTION app_missing_handovers(uuid) IS
  'Quem estava ESCALADO para este turno e não assinou a passagem. Vazia quando '
  'a escala não foi lançada — o sistema não deduz quem devia estar (1370).';

-- ---------------------------------------------------------------------------
-- O FECHAMENTO DA ATA passa a olhar as duas pendências.
--
-- Igual à 0420 em tudo o mais — cargo, trava de fechamento duplo, auditoria.
-- O que muda são três linhas: a fonte da escala entra na decisão, e o turno sem
-- escala E sem nenhuma passagem deixa de fechar limpo.
-- ---------------------------------------------------------------------------
-- `CREATE OR REPLACE` NÃO TROCA O TIPO DE RETORNO: a coluna `out_fonte` é nova,
-- e o Postgres recusa com `cannot change return type of existing function`. O
-- `DROP` é obrigatório, e é da mesma família da armadilha do `search_path` —
-- redefinir função não é editar função.
DROP FUNCTION IF EXISTS app_close_ata(uuid, text);

CREATE OR REPLACE FUNCTION app_close_ata(p_ata uuid, p_pendencies text)
RETURNS TABLE (out_status text, out_missing integer, out_fonte text) AS $$
DECLARE
  v_me uuid; v_role role_code; v_ata ata%ROWTYPE;
  v_missing integer; v_status text; v_fonte text; v_nenhuma boolean;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_ata FROM ata WHERE id = p_ata FOR UPDATE;
  IF v_ata.id IS NULL THEN RAISE EXCEPTION 'ata_inexistente'; END IF;
  IF NOT app_house_in_scope(v_ata.house_id) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF v_ata.status IN ('fechada','fechada_com_pendencia') THEN RAISE EXCEPTION 'ata_ja_fechada'; END IF;

  IF v_ata.period = 'diurno' THEN
    IF v_role NOT IN ('lider_diurno','equipe_tecnica','coordenador') THEN
      RAISE EXCEPTION 'cargo_nao_fecha_ata:diurno';
    END IF;
  ELSE
    IF v_role NOT IN ('lider_noturno_geral','equipe_tecnica','coordenador') THEN
      RAISE EXCEPTION 'cargo_nao_fecha_ata:noturno';
    END IF;
  END IF;

  SELECT count(*)::int INTO v_missing FROM app_missing_handovers(v_ata.shift_id);
  v_fonte := app_fonte_da_escala(v_ata.shift_id);
  v_nenhuma := NOT EXISTS (SELECT 1 FROM handover h WHERE h.shift_id = v_ata.shift_id);

  /*
   * Duas pendências diferentes, e a mesma consequência de status.
   *
   * `v_missing > 0` é gente: alguém escalado não assinou, e a tela pode ir
   * atrás dela pelo nome. O segundo caso não tem nome nenhum — é a casa que
   * não lançou a escala e ninguém registrou o turno —, e é exatamente o que a
   * dedução escondia: antes, o vínculo da casa preenchia a lista e a pendência
   * saía com o nome de quem estava de folga.
   */
  v_status := CASE
    WHEN v_missing > 0 THEN 'fechada_com_pendencia'
    WHEN v_fonte = 'escala_nao_lancada' AND v_nenhuma THEN 'fechada_com_pendencia'
    ELSE 'fechada' END;

  UPDATE ata SET status = v_status, closed_by = v_me, closed_at = now(),
                 missing_signatures = v_missing,
                 pendencies = coalesce(p_pendencies, pendencies)
   WHERE id = p_ata;
  UPDATE shift SET status = CASE WHEN v_status = 'fechada_com_pendencia'
                                 THEN 'fechado_com_pendencia' ELSE 'fechado' END,
                   closed_by = v_me, closed_at = now()
   WHERE id = v_ata.shift_id;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, detail)
  VALUES (v_ata.house_id, v_me, 'ata.close', 'ata', p_ata,
          jsonb_build_object('status', v_status, 'assinaturas_faltantes', v_missing,
                             'fonte_da_escala', v_fonte,
                             'nenhuma_passagem_assinada', v_nenhuma));

  RETURN QUERY SELECT v_status, v_missing, v_fonte;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_close_ata(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_close_ata(uuid, text) TO rede_app;

-- ---------------------------------------------------------------------------
-- E A `work_schedule` PERDEU O ÚLTIMO LEITOR.
--
-- O §9 do documento já a listava como ponta solta — *"o desenho anterior à
-- escala por DATA, e não foi retirado"* —, e dizia "zero leitura e zero
-- escrita". Estava errado pela metade: **a 0960 a lia**, e era o único lugar.
-- Daqui em diante a frase do §9 passa a ser verdadeira.
--
-- Ela NÃO é derrubada aqui, de propósito: `DROP TABLE` é migração destrutiva, e
-- isso não se faz de passagem na fase que muda outra coisa. Fica o comentário,
-- para quem abrir a tabela saber que ela não responde por nada.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE work_schedule IS
  'MORTA desde a 1370. Escala SEMANAL, do desenho anterior à escala por data '
  '(0950). Era lida só pela 0960, para deduzir quem devia assinar a passagem — e '
  'a Fundação decidiu em 20/09/2026 que não se deduz escala. Nada escreve nela '
  'desde a fundação. Derrubá-la é decisão própria, e destrutiva.';
