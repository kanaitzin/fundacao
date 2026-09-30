-- "CONCLUÍ TUDO ATÉ AGORA" (fase 181, decisão de 30/09, §10 item 3).
--
-- O facilitador pedido para a linha do dia, na versão segura que a Fundação
-- escolheu: só as atividades COLETIVAS da casa que estão pendentes até agora,
-- como ato declarado por quem marcou. Remédio fica de fora sempre (as doses nem
-- moram nesta tabela, e a rotina do tipo medicamento ou saúde não entra), e
-- também a urgente e a que espera a ciência de alguém: essas pedem uma pessoa
-- olhando uma a uma.
--
-- Não é marcação em lote SILENCIOSA, a mesma regra da conferência de mesa
-- (0780): o ato tem registro próprio, com quem, quando e quantas, e cada
-- execução aponta para ele. Nada aqui se altera nem se apaga.

CREATE TABLE activity_bulk (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id     uuid NOT NULL REFERENCES house(id),
  quantos      integer NOT NULL CHECK (quantos > 0),
  declared_by  uuid NOT NULL REFERENCES app_user(id),
  declared_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_bulk_house ON activity_bulk (house_id, declared_at DESC);

ALTER TABLE activity_bulk ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON activity_bulk TO rede_app;
CREATE POLICY activity_bulk_select ON activity_bulk FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
CREATE POLICY activity_bulk_insert ON activity_bulk FOR INSERT TO rede_app
  WITH CHECK (declared_by = app_current_user()
              AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));

CREATE OR REPLACE FUNCTION app_activity_bulk_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'registro_imutavel' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER trg_activity_bulk_imutavel BEFORE UPDATE OR DELETE ON activity_bulk
  FOR EACH ROW EXECUTE FUNCTION app_activity_bulk_imutavel();

ALTER TABLE activity_execution ADD COLUMN bulk_id uuid REFERENCES activity_bulk(id);
