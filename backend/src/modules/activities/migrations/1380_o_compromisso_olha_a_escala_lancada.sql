-- =============================================================================
-- 1380 — O COMPROMISSO OLHA A ESCALA QUE A CASA LANÇA.
--
-- A fase 129 tirou a dedução de escala da passagem de plantão, atendendo à
-- decisão da Fundação — *"não cabe a nós deduzir"*. Ela não alcançou ESTE
-- lugar, e aqui o efeito era pior, porque silencioso.
--
-- `app_staff_for_commitment` diz à tela de marcar compromisso quem pode ser
-- responsável, e se a pessoa está **na escala daquele horário**. Ela lia a
-- `work_schedule` — a escala SEMANAL, do desenho anterior à escala por data
-- (0950). E **nenhuma casa nunca preencheu a `work_schedule`**: é a mesma
-- constatação que a 0960 já havia escrito em 08/09/2026, e que continua
-- verdadeira.
--
-- Consequência, medida: `ha_escala` responde FALSO sempre, e `na_escala`
-- também. A tela de compromisso diz *"esta casa ainda não registrou a
-- escala"* para toda casa, em todo horário, **para sempre** — enquanto a
-- coordenação lança escala por DATA desde a 0950 e a vê desenhada na tela da
-- Escala desde a 1310.
--
-- A 0610 existiu para que esse aviso não aparecesse em todo nome, e acertou a
-- metade que dava para acertar na época: separou *"esta pessoa não está de
-- serviço"* de *"esta casa não registrou a escala"*. O que ela não podia
-- saber é que a segunda frase ia virar permanente.
--
-- A partir daqui a pergunta é feita à `shift_assignment`, que é a escala que a
-- casa lança de verdade. E o `ha_escala` passa a dizer algo VERDADEIRO: a
-- escala **daquele dia** foi lançada ou não. Num compromisso marcado para o mês
-- que vem, "não foi lançada" é a resposta certa, e não um defeito.
--
-- ---------------------------------------------------------------------------
-- A ASSINATURA MUDA: DIA, E NÃO DIA DA SEMANA.
--
-- A escala por data responde por DATA, e quem chama já tinha a data na mão — o
-- `agenda.service.ts` a convertia em `weekday` só para poder perguntar à escala
-- semanal. Passar a data é tirar uma conversão que só existia para alimentar a
-- tabela errada.
-- =============================================================================

DROP FUNCTION IF EXISTS app_staff_for_commitment(uuid, smallint, time);

/*
 * O CORPO É O DA 0610, COM UMA TROCA SÓ: a fonte da escala.
 *
 * O resto vai igual de propósito — o perímetro de quem é oferecido, a cozinha
 * que fica fora porque não acompanha saída nem atividade, o vínculo vigente
 * conferido com as duas pontas, a ordem que põe quem está na escala primeiro.
 * Migração que muda a fonte de um dado e aproveita para mexer no perímetro é
 * migração que ninguém consegue revisar.
 */
CREATE OR REPLACE FUNCTION app_staff_for_commitment(
  p_house uuid, p_dia date, p_time time)
RETURNS TABLE (user_id uuid, nome text, cargo text, na_escala boolean, ha_escala boolean) AS $$
  WITH lancada AS (
    SELECT EXISTS (
      SELECT 1 FROM shift_assignment a
       WHERE a.house_id = p_house AND a.on_date = p_dia AND a.revoked_at IS NULL
    ) AS sim
  )
  SELECT * FROM (
    SELECT u.id, u.full_name, u.role::text,
           EXISTS (
             SELECT 1 FROM shift_assignment e
              WHERE e.user_id = u.id
                AND e.house_id = p_house
                AND e.on_date = p_dia
                AND e.revoked_at IS NULL
                /*
                 * O HORÁRIO: o que a escala gravou, ou a janela do turno.
                 *
                 * `start_time` e `end_time` são opcionais na `shift_assignment`
                 * (0950) — quem lança pode dizer só "diurno". Quando estão lá,
                 * valem eles, porque a casa foi específica de propósito; quando
                 * não, vale a janela do turno: diurno 07h–19h, noturno 19h–07h.
                 *
                 * 19h é a fronteira porque é a do plantão noturno, que pertence
                 * ao dia em que COMEÇOU (§12.1) — a mesma que a 0960 usava para
                 * classificar a escala semanal.
                 */
                AND CASE
                      WHEN e.start_time IS NOT NULL AND e.end_time IS NOT NULL THEN
                        CASE WHEN e.end_time > e.start_time
                             THEN p_time >= e.start_time AND p_time < e.end_time
                             ELSE p_time >= e.start_time OR p_time < e.end_time
                        END
                      WHEN e.period = 'noturno' THEN
                        p_time >= TIME '19:00' OR p_time < TIME '07:00'
                      ELSE
                        p_time >= TIME '07:00' AND p_time < TIME '19:00'
                    END
           ) AS na_escala,
           (SELECT sim FROM lancada) AS ha_escala
      FROM app_user u
     WHERE u.active
       AND app_house_in_scope(p_house)
       AND (
         -- Equipe com vínculo vigente nesta casa…
         EXISTS (SELECT 1 FROM user_house_assignment a
                  WHERE a.user_id = u.id AND a.house_id = p_house
                    AND a.valid_from <= now() AND (a.valid_to IS NULL OR a.valid_to > now()))
         -- …ou função transversal, que alcança as oito por definição (§5.13).
         OR u.role IN ('enfermagem','lider_noturno_geral','gestor_geral')
       )
       AND u.role <> 'cozinha'   -- a cozinha não acompanha saída nem atividade
  ) equipe
  -- Quem está na escala do horário aparece primeiro; os demais continuam
  -- disponíveis, porque escala muda e troca de plantão existe.
  ORDER BY equipe.na_escala DESC, equipe.full_name
$$ LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_staff_for_commitment(uuid, date, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_staff_for_commitment(uuid, date, time) TO rede_app;

COMMENT ON FUNCTION app_staff_for_commitment(uuid, date, time) IS
  'Quem pode responder por um compromisso, com o sinal de quem está na escala '
  'LANÇADA daquele dia (shift_assignment). O sinal ordena e avisa; não impede '
  'nomear quem está de folga — escala muda, e troca de plantão existe.';

-- ---------------------------------------------------------------------------
-- E AGORA SIM A `work_schedule` PERDEU O ÚLTIMO LEITOR — com uma correção
-- ao que a 1370 escreveu ONTEM.
--
-- A 1370 pôs nesta tabela um `COMMENT` dizendo *"MORTA desde a 1370"*, e a
-- frase era falsa: eu havia procurado os leitores dela apenas nas migrações do
-- módulo `shifts`, e o `app_staff_for_commitment`, que mora em `activities`,
-- ficou de fora da conta. **Um comentário errado no banco é pior do que
-- comentário nenhum**: quem abrir a tabela amanhã acredita nele.
--
-- O §9 do documento dizia, desde a varredura de 15/09, *"zero leitura e zero
-- escrita, desde a fundação"* — e essa frase estava errada por DOIS leitores,
-- não por um. A 1370 corrigiu metade e escreveu a outra metade errada.
--
-- Agora a afirmação é conferível, e há teste que a cobra: nenhuma função do
-- banco nomeia `work_schedule`. Continua de pé, porque `DROP TABLE` é migração
-- destrutiva e é decisão própria — mas o comentário passou a dizer a verdade.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE work_schedule IS
  'MORTA desde a 1380 — e a 1370 disse isto um dia antes da hora, esquecendo o '
  'app_staff_for_commitment, que mora noutro módulo. Escala SEMANAL, do desenho '
  'anterior à escala por data (0950). Tinha DOIS leitores, os dois deduzindo '
  'escala: app_missing_handovers (saiu na 1370) e app_staff_for_commitment (saiu '
  'aqui). Nada escreve nela desde a fundação, e nenhuma casa nunca a preencheu. '
  'Derrubá-la é decisão própria, e destrutiva.';
