-- ============================================================
-- 1130 — O que a coordenação liga e desliga para o educador
--
-- Pedido do Marcelo em 09/09 (§10.5): dentro da própria casa, a coordenação
-- liga e desliga campos do perfil para o educador. O caso real que ele deu é
-- o educador que precisa ligar para o colégio ou para o médico.
--
-- O QUE ESTA TABELA NÃO PERMITE, e é o ponto dela.
--
-- Em 27/08 foi recusada uma tela que deixasse a coordenação alargar o ALCANCE
-- DE CARGO: ou é cosmética, ou a coordenação de uma casa passa a decidir quem
-- enxerga o quê, e o isolamento entre as oito casas cai por dentro. O que
-- muda aqui é outra coisa: uma LISTA FIXA, escrita no banco, de campos do
-- perfil que o educador já poderia ver. A coordenação escolhe, dentro da
-- própria casa, quais desses ficam à vista de quem está no plantão.
--
-- A lista é fechada por CHECK. Campo novo só entra por migração, revisado —
-- e os cinco que ficam fora do alcance do botão não estão nela, nem podem
-- ser acrescentados por quem usa o sistema: motivo judicial, narrativa
-- pessoal restrita, cofre de acessos, benefícios e dados bancários, e
-- ocorrência restrita.
--
-- PADRÃO LIGADO. Ausência de linha significa liberado: nada muda de
-- comportamento no dia em que esta migração roda, e nenhuma casa perde acesso
-- sem que alguém tenha decidido. Desligar é o ato que fica registrado, com
-- nome e hora.
--
-- E DESLIGADO NÃO É INVISÍVEL. O perfil continua dizendo que o campo existe e
-- que a coordenação o desligou — senão o educador lê a ausência como "não há
-- telefone da escola", e liga para ninguém. Ausência que mente é pior do que
-- recusa que explica.
-- ============================================================

CREATE TABLE house_field_permission (
  house_id    uuid NOT NULL REFERENCES house(id) ON DELETE CASCADE,
  field_code  text NOT NULL,
  visible     boolean NOT NULL,
  changed_by  uuid REFERENCES app_user(id),
  changed_at  timestamptz NOT NULL DEFAULT now(),
  reason      text,
  PRIMARY KEY (house_id, field_code),
  CONSTRAINT campo_da_lista_fechada CHECK (field_code IN (
    'escola',            -- nome, série, turno e endereço da escola
    'contatos',          -- quem aparece pela criança, e os telefones
    'equipe_referencia', -- o serviço da rede que acompanha
    'cuidados_essenciais'
  ))
);

ALTER TABLE house_field_permission ENABLE ROW LEVEL SECURITY;

-- Ler: quem trabalha na casa, porque a tela do educador precisa saber o que
-- está desligado para poder DIZER que está.
CREATE POLICY hfp_select ON house_field_permission FOR SELECT
  USING (app_house_in_scope(house_id));

-- Escrever: só a coordenação da própria casa, e o gestor geral.
CREATE POLICY hfp_write ON house_field_permission FOR ALL
  USING (app_house_in_scope(house_id)
         AND app_current_role() IN ('coordenador','gestor_geral'))
  WITH CHECK (app_house_in_scope(house_id)
              AND app_current_role() IN ('coordenador','gestor_geral'));

GRANT SELECT, INSERT, UPDATE, DELETE ON house_field_permission TO rede_app;

/**
 * Este campo está à vista do plantão, nesta casa?
 *
 * Sem linha, sim — o padrão é ligado. Vale para o educador; os outros cargos
 * seguem o alcance de sempre, que esta tabela não toca.
 */
CREATE OR REPLACE FUNCTION app_campo_do_perfil_liberado(p_house uuid, p_code text)
RETURNS boolean AS $$
  SELECT coalesce(
    (SELECT visible FROM house_field_permission
      WHERE house_id = p_house AND field_code = p_code), true);
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_campo_do_perfil_liberado(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_campo_do_perfil_liberado(uuid, text) TO rede_app;

COMMENT ON TABLE house_field_permission IS
  'Campos do perfil que a coordenação liga e desliga para o educador, na própria casa. Lista fechada por CHECK; padrão ligado; desligado continua visível como "desligado pela coordenação".';
