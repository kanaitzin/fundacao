-- ---------------------------------------------------------------------------
-- Defeito 10 (raiz) — "hoje" no banco era o hoje do servidor.
--
-- `current_date` e `now()::date` devolvem a data no fuso da SESSÃO do
-- Postgres. Em servidor UTC — que é o padrão de qualquer container — a partir
-- das 21h de Porto Alegre o banco já virou o dia. Consequências reais:
--
--   * prescrição criada às 21h30 nascia com `starts_on` = amanhã, e a geração
--     de doses daquela noite não a incluía. A dose não aparecia para ninguém
--     confirmar, e o buraco só era visto no dia seguinte;
--   * autorização de educador com `valid_to` = hoje passava a estar vencida às
--     21h, e o educador autorizado era barrado no meio do plantão;
--   * `valid_from` de vínculo e de versão de rotina gravava a data errada.
--
-- Esta função é o gêmeo SQL de `hojeNaInstituicao()` do kernel/common/tempo.ts.
-- A partir daqui, nenhuma migração nova usa `current_date` para dizer "hoje".
-- Fica em identity porque é a partição base — `app_current_user()` e
-- `app_house_in_scope()` já moram aqui, e todo módulo depende dela.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_fuso() RETURNS text AS $$
  SELECT 'America/Sao_Paulo'::text
$$ LANGUAGE sql IMMUTABLE;

/*
 * STABLE, não IMMUTABLE: dentro da mesma transação o valor não muda, mas entre
 * transações muda — e marcá-la IMMUTABLE autorizaria o planejador a congelar o
 * resultado em índice, que é como um sistema começa a viver eternamente na
 * data em que o índice foi criado.
 */
CREATE OR REPLACE FUNCTION app_hoje() RETURNS date AS $$
  SELECT (now() AT TIME ZONE app_fuso())::date
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION app_hoje() IS
  'Data corrente na instituição (America/Sao_Paulo). Use no lugar de current_date.';

GRANT EXECUTE ON FUNCTION app_fuso() TO rede_app;
GRANT EXECUTE ON FUNCTION app_hoje() TO rede_app;

-- Defaults que diziam "hoje" e diziam o dia do servidor.
-- Só o DEFAULT muda: nenhuma linha já gravada é reescrita (§5.1).
ALTER TABLE user_house_assignment ALTER COLUMN valid_from SET DEFAULT app_hoje();
