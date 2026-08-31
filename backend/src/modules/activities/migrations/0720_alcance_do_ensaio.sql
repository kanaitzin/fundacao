-- ---------------------------------------------------------------------------
-- Ajustes de alcance vindos do ENSAIO DE USO (§8.3, §26).
--
-- Duas correções de escopo que só apareceram quando o sistema foi percorrido
-- como quem trabalha na casa, e não como quem escreve o código:
--
-- 1. A EQUIPE TÉCNICA não conseguia trocar quem vai na atividade. Ela já
--    autoriza substituição e é quem lança a agenda semanas antes — mas a
--    delegação ficou restrita a líder e coordenação. Na prática, a técnica
--    montava a semana inteira e dependia do líder para qualquer troca.
--
-- 2. O LÍDER DO TURNO não via os registros restritos. Quem está com a criança
--    às 23h precisa saber o que a equipe técnica registrou sobre ela — não
--    para avaliar ninguém, mas para não repetir uma pergunta que já feriu, ou
--    para entender por que aquela criança não quer dormir no quarto de sempre.
--
-- O que NÃO muda: educador e enfermagem seguem fora do restrito, e o Gestor
-- Geral continua precisando da leitura excepcional com finalidade (§26.2 #29)
-- — ver tudo sem justificar é o começo do acesso que ninguém consegue explicar.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_can_record_for_others(p_house uuid) RETURNS boolean AS $$
  SELECT app_current_role() IN ('lider_diurno','lider_noturno_geral','equipe_tecnica',
                                'coordenador','gestor_geral')
     AND app_house_in_scope(p_house)
$$ LANGUAGE sql STABLE;
GRANT EXECUTE ON FUNCTION app_can_record_for_others(uuid) TO rede_app;
