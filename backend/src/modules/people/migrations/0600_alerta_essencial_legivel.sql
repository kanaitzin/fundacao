-- ============================================================
-- 0600 — O ALERTA ESSENCIAL DIZ DO QUE ELE É (§6.4)
--
-- Na tela do perfil, o alerta essencial de uma criança aparecia assim:
--
--     ⚠ Dipirona
--
-- porque o banco guarda o tipo ('alergia') numa coluna e o texto
-- ('Dipirona') noutra, e as telas mostravam só o texto. Lido de relance —
-- que é a única leitura que acontece no corredor —, e logo acima de uma
-- seção chamada "Remédio de hoje", isso não parece um aviso de alergia:
-- parece uma prescrição. É a inversão mais perigosa que este sistema
-- poderia imprimir.
--
-- A correção fica AQUI, e não em cada tela, por um motivo: o mesmo alerta
-- aparece no perfil, na chamada do almoço, no resumo de saúde e no que
-- ainda vier. Redigido em cada lugar, um dia um lugar esquece.
-- ============================================================

-- O prefixo é GUARDADO: parte do que já está cadastrado foi escrito como
-- frase inteira ("Intolerância à lactose"), e prefixar sem olhar produziria
-- "Intolerância a Intolerância à lactose". Quem já se explica, fica como
-- está.
CREATE OR REPLACE FUNCTION app_condition_label(p_kind text, p_description text)
RETURNS text AS $$
  SELECT CASE
           WHEN p_kind = 'alergia' AND p_description !~* '^\s*alergi'
             THEN 'Alergia a ' || p_description
           WHEN p_kind = 'intolerancia' AND p_description !~* '^\s*intoler'
             THEN 'Intolerância a ' || p_description
           ELSE p_description
         END;
$$ LANGUAGE sql IMMUTABLE;
REVOKE ALL ON FUNCTION app_condition_label(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_condition_label(text, text) TO rede_app;

COMMENT ON FUNCTION app_condition_label(text, text) IS
  'Alerta essencial em uma frase que se lê sozinha. Toda tela que mostrar '
  'health_condition fora do perfil clínico deve passar por aqui.';
