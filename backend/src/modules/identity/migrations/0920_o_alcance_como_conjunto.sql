-- =========================================================================
-- O ALCANCE COMO CONJUNTO, E NÃO COMO PERGUNTA POR LINHA — 04/09/2026
--
-- `app_house_in_scope(house_id)` é chamada UMA VEZ POR LINHA lida. Em tabela
-- pequena isso não aparece; em `audit_event`, com um ano de casa, aparece
-- inteiro: a coordenação lendo a auditoria da própria casa nos últimos 30 dias
-- esperava **1 096 ms**, e 173 mil chamadas da função explicam o segundo.
--
-- Trocando a pergunta por um teste de pertinência a um conjunto calculado uma
-- vez — `house_id = ANY (ARRAY(SELECT …))` —, o mesmo resultado sai em
-- **139 ms**. O Postgres avalia o `ARRAY(SELECT …)` como um plano inicial,
-- uma vez, e depois só compara.
--
-- A SEMÂNTICA É EXATAMENTE A MESMA, e isto precisa ficar claro porque é a
-- parte perigosa: `app_casas_no_alcance()` devolve o conjunto que
-- `app_house_in_scope` responderia "sim" para cada elemento — inclusive o caso
-- dos cargos transversais (Enfermagem, Líder Noturno Geral, Gestor Geral e
-- administração técnica), que alcançam todas as casas da instituição.
--
-- As duas convivem de propósito. `app_house_in_scope` continua sendo a forma
-- certa para perguntar sobre UMA casa — numa política de INSERT, por exemplo,
-- onde há uma linha só. O conjunto é para quando a pergunta se repete por
-- linha.
-- =========================================================================

-- A função devolve o conjunto desdobrado (`unnest`), para o uso na política
-- ficar igual nos dois ramos: `house_id = ANY (ARRAY(SELECT …))`.
CREATE OR REPLACE FUNCTION app_casas_no_alcance() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT unnest(
    CASE
      WHEN app_current_role() IN ('gestor_geral','enfermagem','lider_noturno_geral','admin_tecnico')
        THEN ARRAY(SELECT h.id FROM house h
                     JOIN app_user u ON u.id = app_current_user()
                    WHERE h.institution_id = u.institution_id)
      ELSE ARRAY(SELECT app_user_house_ids())
    END)
$$;

REVOKE ALL ON FUNCTION app_casas_no_alcance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_casas_no_alcance() TO rede_app;

/*
 * A POLÍTICA DA AUDITORIA.
 *
 * Era:
 *   papel É gestor/admin
 *   OR (papel É coordenador AND app_house_in_scope(house_id))
 *
 * Duas correções, e a ordem delas importa:
 *
 *  1. `CASE` em vez de `OR`, porque o `OR` do SQL não garante a ordem de
 *     avaliação — a lição da fase 68. Para o Gestor Geral, a pergunta cara
 *     nem chega a ser feita;
 *  2. o teste de pertinência ao conjunto em vez da função por linha, que é o
 *     que tira o segundo de espera da coordenação.
 *
 * A auditoria é a tabela que mais cresce do sistema — uma linha para cada
 * coisa que alguém faz — e é justamente onde alguém vai olhar quando algo der
 * errado. Uma tela de auditoria que demora é uma tela que não se consulta.
 */
DROP POLICY IF EXISTS audit_select ON audit_event;

CREATE POLICY audit_select ON audit_event FOR SELECT TO rede_app
  USING (
    CASE
      WHEN app_current_role() IN ('gestor_geral', 'admin_tecnico') THEN true
      WHEN app_current_role() = 'coordenador'
        THEN house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
      ELSE false
    END);
