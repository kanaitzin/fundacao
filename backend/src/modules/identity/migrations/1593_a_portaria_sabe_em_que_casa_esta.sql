-- A PORTARIA SABE EM QUE CASA ESTÁ (fase 160).
--
-- A 1591 fez `app_house_in_scope` dizer NÃO à portaria — e a linha da própria
-- CASA se apoiava nela. Sem ela, a portaria entrava no sistema sem casa
-- nenhuma: o `/users/me` não trazia o vínculo, o `/houses` voltava vazio, e a
-- tela do portão não tinha de que casa abrir a lista.
--
-- A linha da casa (código, nome, tipo) não é dado de criança: é o endereço de
-- trabalho de quem tem vínculo. Então a casa aparece para quem TEM VÍNCULO com
-- ela — o que, para todos os outros cargos, já estava dentro do alcance, e só
-- muda alguma coisa para a portaria. Nada além da linha da casa se abre: perfis,
-- saúde, relatos e ATA continuam perguntando a `app_house_in_scope`.
DROP POLICY IF EXISTS house_select ON house;
CREATE POLICY house_select ON house FOR SELECT TO rede_app
  USING (app_house_in_scope(id) OR id IN (SELECT app_user_house_ids()));
