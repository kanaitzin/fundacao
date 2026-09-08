-- =============================================================================
-- 0940 — A PASSAGEM LÊ AS DOSES DE VOLTA (§12.1, §11.2)
--
-- Pedido do Marcelo em 08/09/2026: "no final da passagem do turno alguém tem
-- que dizer que deu o remédio e se está tudo ok".
--
-- O JEITO ERRADO, e é o mais fácil: um botão no fim da passagem que marca as
-- doses do turno como dadas. Isso é marcação em lote de medicamento, que o
-- §11.2 proíbe sem a palavra "silenciosa" — é absoluto. A confirmação
-- individual, por quem administrou, é a proteção da criança: ela é o que
-- separa "a Enfermagem sabe que a Alice tomou o anticonvulsivante às 22h" de
-- "alguém disse que o turno correu bem".
--
-- O QUE ESTA MIGRAÇÃO FAZ é o contrário: a passagem LÊ o que ficou gravado e
-- mostra na cara de quem está saindo, na única hora em que ainda dá para
-- resolver — enquanto quem deu a dose ainda está na casa. A dose das 22h sem
-- resposta vira uma linha visível, não um silêncio que a Enfermagem descobre
-- na terça seguinte.
--
-- A frase é obrigatória QUANDO HÁ DOSE SEM RESPOSTA, e a regra dessa cobrança
-- vive na aplicação (é regra de negócio), não aqui: o banco guarda o campo, e
-- `handover` continua imutável depois de assinada.
--
-- Decisão de 08/09 (pergunta 1 ao Leonardo): a passagem AVISA e exige a frase;
-- ela NÃO bloqueia a assinatura. Uma passagem que se recusa a fechar às 23h
-- empurra a casa de volta para o caderno — e a pessoa que precisa sair do
-- turno acabaria confirmando dose que não deu só para conseguir assinar, que é
-- o oposto do que a trava pretendia.
-- =============================================================================

ALTER TABLE handover
  ADD COLUMN IF NOT EXISTS medication_note text;

COMMENT ON COLUMN handover.medication_note IS
  'O que a pessoa escreveu sobre as doses do turno. Obrigatório quando alguma '
  'ficou sem resposta (0940). Não confirma dose nenhuma: a confirmação é '
  'individual, de quem administrou (§11.2).';

-- -----------------------------------------------------------------------------
-- As doses de um plantão
-- -----------------------------------------------------------------------------
-- O recorte é o do turno: 07h–19h no diurno, 19h–07h do dia seguinte no
-- noturno, no fuso da instituição. Regra 17: converte-se o PARÂMETRO em faixa
-- de timestamptz, nunca a coluna — sob RLS, `(coluna AT TIME ZONE …)::date`
-- não é leakproof, o filtro fica DEPOIS da política e a política passa a rodar
-- uma vez por linha do ano. Foi assim que três telas responderam em 8,5 s.
--
-- SECURITY DEFINER porque junta pessoa e prescrição para escrever a linha que
-- a passagem mostra; por isso confere `app_house_in_scope` no corpo (regra 8).
CREATE OR REPLACE FUNCTION app_doses_do_turno(p_shift uuid)
RETURNS TABLE (
  dose_id uuid, acolhido text, medicamento text, previsto timestamptz,
  estado administration_state, confirmou text, so_enfermagem boolean
) AS $$
DECLARE v_s shift%ROWTYPE; v_de timestamptz; v_ate timestamptz;
BEGIN
  SELECT * INTO v_s FROM shift s WHERE s.id = p_shift;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'plantao_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(v_s.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_s.period = 'diurno' THEN
    v_de  := (v_s.on_date + TIME '07:00') AT TIME ZONE app_fuso();
    v_ate := (v_s.on_date + TIME '19:00') AT TIME ZONE app_fuso();
  ELSE
    v_de  := (v_s.on_date + TIME '19:00') AT TIME ZONE app_fuso();
    v_ate := ((v_s.on_date + 1) + TIME '07:00') AT TIME ZONE app_fuso();
  END IF;

  RETURN QUERY
    -- rls-join-ok: `medication_administration` e `prescription` respondem às
    -- políticas de casa e de pessoa, e `person` à dela — as três filtram a
    -- linha inteira. O nome de QUEM CONFIRMOU sai por app_user_display_name, e
    -- nunca por junção com app_user, que tem RLS de linha (regra 10): com
    -- JOIN sumiria a dose, com LEFT JOIN sumiria o nome de quem a deu.
    SELECT a.id, person_display_name(pe), pr.medication, a.scheduled_at, a.state,
           app_user_display_name(a.administered_by), coalesce(pr.nurse_only, false)
      FROM medication_administration a
      JOIN prescription pr ON pr.id = a.prescription_id
      JOIN person pe ON pe.id = a.person_id
     WHERE a.house_id = v_s.house_id
       AND a.scheduled_at >= v_de
       AND a.scheduled_at <  v_ate
     ORDER BY a.scheduled_at;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_doses_do_turno(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_doses_do_turno(uuid) TO rede_app;
