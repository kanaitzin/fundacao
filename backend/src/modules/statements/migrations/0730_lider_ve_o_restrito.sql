-- ---------------------------------------------------------------------------
-- O líder do turno passa a ler o registro restrito da própria casa (§12.2).
--
-- Vindo do ensaio de uso. Quem está com a criança às 23h precisa saber o que a
-- equipe técnica registrou sobre ela — não para avaliar ninguém, mas para não
-- repetir uma pergunta que já feriu, ou para entender por que ela não quer
-- dormir no quarto de sempre. Sem isso, a informação que protege a criança
-- ficava presa no turno da manhã.
--
-- A trava é a POLÍTICA, não o serviço: mexer só no TypeScript não mudaria
-- nada, porque o banco é que decide quais linhas existem para quem pergunta.
--
-- Continuam FORA: educador e enfermagem — o restrito é do acompanhamento
-- técnico, não do plantão inteiro. E o Gestor Geral continua precisando da
-- leitura excepcional com finalidade declarada (§26.2 #29): ver tudo sem
-- justificar é o começo do acesso que ninguém consegue explicar depois.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS st_select ON statement;
CREATE POLICY st_select ON statement FOR SELECT TO rede_app USING (
  author_id = app_current_user()
  OR (app_current_role() IN ('equipe_tecnica','coordenador','lider_diurno','lider_noturno_geral')
      AND app_house_in_scope(house_id))
  OR (NOT restricted AND app_house_in_scope(house_id))
);
