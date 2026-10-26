-- SÓ A ENFERMAGEM ATIVA O ESQUEMA DE MEDICAMENTO (fase 245; decisão de 25/10).
--
-- Desde a 0930 (08/09) a Enfermagem, a coordenação, a equipe técnica e o Gestor
-- Geral cadastravam e ativavam o esquema. Em 25/10 a Fundação decidiu que quem
-- coloca a dose na grade é só a Enfermagem. O motivo da 0930 continua valendo:
-- a Enfermagem atende das 9h às 17h, e a criança volta da consulta com a receita
-- às 20h. Por isso a decisão veio com a noite resolvida:
--
--   * cadastrar o esquema (o rascunho, com a foto da receita) continua com a
--     Enfermagem, a coordenação e a equipe técnica. O Gestor Geral sai, porque
--     não está na casa quando a receita chega;
--   * ativar, que é o que faz a dose entrar na grade, é só da Enfermagem. O
--     rascunho não gera dose nenhuma até ela conferir a receita e ativar;
--   * a dose daquela noite a educadora dá conforme a receita e escreve na ATA.
--
-- A trava mora no banco, além do servidor: a política de inserção pergunta pelo
-- cargo que cadastra (e agora também pelo alcance, que ela não perguntava), e um
-- gatilho recusa a passagem de rascunho para ativa por quem não é a Enfermagem.
-- A política de UPDATE continua com `app_can_prescribe`, porque suspender (a
-- Enfermagem e o Gestor Geral) e marcar o remédio que só a Enfermagem dá (a
-- coordenação e o Gestor Geral) também são UPDATE no esquema.

CREATE OR REPLACE FUNCTION app_cadastra_esquema()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT app_current_role() IN ('enfermagem', 'coordenador', 'equipe_tecnica')
$$;
REVOKE ALL ON FUNCTION app_cadastra_esquema() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cadastra_esquema() TO rede_app;

DROP POLICY IF EXISTS presc_insert ON prescription;
CREATE POLICY presc_insert ON prescription FOR INSERT TO rede_app
  WITH CHECK (app_cadastra_esquema()
              AND created_by = app_current_user()
              AND person_id IN (SELECT app_pessoas_no_alcance()));

CREATE OR REPLACE FUNCTION app_so_a_enfermagem_ativa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  /* Sem pessoa na sessão é a manutenção do banco (a semente, uma migração):
     quem responde por ela é quem a roda. Com pessoa, só a Enfermagem ativa. */
  IF OLD.status = 'rascunho' AND NEW.status = 'ativa'
     AND app_current_user() IS NOT NULL
     AND app_current_role() IS DISTINCT FROM 'enfermagem' THEN
    RAISE EXCEPTION 'so_a_enfermagem_ativa' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prescription_so_a_enfermagem_ativa BEFORE UPDATE ON prescription
  FOR EACH ROW EXECUTE FUNCTION app_so_a_enfermagem_ativa();
