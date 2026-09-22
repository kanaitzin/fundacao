-- ============================================================
-- 1480 — A ausência num lugar só
--
-- A 1350 pôs num lugar só a resposta para "de quem esta chamada trata", e
-- resolveu o defeito que a fase 127 media. O que ela deixou em aberto é menor e
-- é o mesmo risco: a CONDIÇÃO de ausência continuou escrita em linha, dentro
-- dela, com os dois predicados repetidos e a data repetida quatro vezes.
--
-- A 1470 descobriu a razão de isso importar: a grade do dia tinha a MESMA
-- pergunta a fazer e não a fez, porque não havia a quem fazê-la. Agora há —
-- `app_ausente_da_casa(pessoa, dia)` — e a chamada passa a usá-la em vez de ter
-- a sua própria cópia. Não muda comportamento nenhum: é a mesma conjunção, no
-- mesmo dia de referência. Muda quem responde.
--
-- POR QUE NÃO DEIXAR COMO ESTAVA, se estava certo: porque a próxima regra de
-- ausência — acampamento, escola em turno integral, hospital-dia — chega uma
-- vez e tem de valer nos três lugares. Com a cópia em linha, ela valeria em
-- dois, e o terceiro ficaria errado em silêncio. Foi assim que a chamada
-- passou dezoito fases cobrando criança internada.
--
-- Os cinco testes da `quem-a-chamada-cobra.e2e.spec.ts` guardam o
-- comportamento, e é por isso que esta troca é segura de fazer.
-- ============================================================

CREATE OR REPLACE FUNCTION app_efetivo_da_chamada(p_check uuid)
RETURNS TABLE (person_id uuid) LANGUAGE sql STABLE AS $$
  SELECT s.person_id
    FROM collective_check k
    JOIN house_stay s ON s.house_id = k.house_id AND s.status = 'ativa'
   WHERE k.id = p_check
     AND NOT app_ausente_da_casa(
           s.person_id, (coalesce(k.reference_at, k.created_at) AT TIME ZONE app_fuso())::date)
$$;
REVOKE ALL ON FUNCTION app_efetivo_da_chamada(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_efetivo_da_chamada(uuid) TO rede_app;
