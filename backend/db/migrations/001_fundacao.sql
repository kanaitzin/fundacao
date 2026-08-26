-- ============================================================
-- Rede Acolher — Migração 001: Fundação
-- Instituição, casas, usuários, papéis, vínculos, sessões,
-- escalas, auditoria e Row-Level Security.
--
-- Princípios (Prompt Master §4.4, §5, §20, §23):
--  * todo registro pertence a uma instituição; operacionais, a uma casa;
--  * autorização no backend E no banco (RLS); esconder no frontend não basta;
--  * IDs não previsíveis (UUID); histórico não desaparece; autoria imutável;
--  * funcionário desligado é DESATIVADO, nunca apagado.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Papéis (cargos) ----------
CREATE TYPE role_code AS ENUM (
  'gestor_geral',
  'coordenador',
  'equipe_tecnica',
  'educador',
  'lider_diurno',            -- designação sobre educador, por cargo e plantão ativo
  'lider_noturno_geral',
  'enfermagem',
  'cozinha',
  'admin_tecnico'
);

-- ---------- Instituição e casas ----------
CREATE TABLE institution (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE house (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institution(id),
  code            text NOT NULL,              -- AI1..AI4, ARM1..ARM4 (preliminares; confirmar antes da produção)
  name            text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('abrigo_institucional','casa_lar')),
  address         text,                        -- endereço institucional (permitido; sem GPS/rastreamento)
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, code)
);

-- ---------- Usuários ----------
CREATE TABLE app_user (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institution(id),
  email           text NOT NULL UNIQUE,        -- e-mail institucional individual
  full_name       text NOT NULL,
  password_hash   text NOT NULL,               -- scrypt (ADR-003); nunca em logs
  role            role_code NOT NULL,
  active          boolean NOT NULL DEFAULT true,  -- desligado = desativado, nunca apagado
  deactivated_at  timestamptz,
  deactivated_by  uuid REFERENCES app_user(id),
  must_change_password boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Vínculo usuário ↔ casa, com histórico (nunca apagar; encerrar com valid_to)
CREATE TABLE user_house_assignment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  house_id    uuid NOT NULL REFERENCES house(id),
  role        role_code NOT NULL,
  valid_from  timestamptz NOT NULL DEFAULT now(),
  valid_to    timestamptz,                      -- null = vigente
  created_by  uuid REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_uha_user ON user_house_assignment(user_id) WHERE valid_to IS NULL;
CREATE INDEX idx_uha_house ON user_house_assignment(house_id) WHERE valid_to IS NULL;

-- ---------- Escala semanal (base p/ janela T-10/T+10, §5.12) ----------
CREATE TABLE work_schedule (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  house_id    uuid REFERENCES house(id),        -- null p/ funções transversais
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  time NOT NULL,
  end_time    time NOT NULL,                    -- pode cruzar meia-noite (end < start)
  kind        text NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular','excecao')),
  note        text,
  valid_from  date NOT NULL DEFAULT current_date,
  valid_to    date,
  created_by  uuid REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Sessões (opacas, revogáveis — ADR-002) ----------
CREATE TABLE user_session (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app_user(id),
  token_hash    text NOT NULL UNIQUE,           -- sha256(token+pepper); token nunca é armazenado
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  last_reauth_at timestamptz,                   -- confirmação de senha p/ ações altamente sensíveis
  revoked_at    timestamptz,
  revoked_reason text,
  user_agent    text,
  ip            inet
);
CREATE INDEX idx_session_user ON user_session(user_id);

-- ---------- Proteção contra força bruta ----------
CREATE TABLE login_attempt (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL,
  ip          inet,
  success     boolean NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempt_email ON login_attempt(email, at DESC);

-- ---------- Auditoria (resistente a adulteração: append-only) ----------
CREATE TABLE audit_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institution(id),
  house_id      uuid REFERENCES house(id),
  actor_id      uuid REFERENCES app_user(id),
  action        text NOT NULL,                  -- ex.: auth.login, auth.login_failed, house.open, access.exceptional
  entity        text,
  entity_id     uuid,
  purpose       text,                           -- finalidade declarada (acessos sensíveis/excepcionais)
  detail        jsonb NOT NULL DEFAULT '{}',    -- METADADOS apenas; nunca conteúdo sensível (§20, §27)
  before_state  jsonb,
  after_state   jsonb,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor ON audit_event(actor_id, at DESC);
CREATE INDEX idx_audit_house ON audit_event(house_id, at DESC);

-- Auditoria é imutável: nem o papel de aplicação pode alterar/apagar.
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'registro imutável: %', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ============================================================
-- Papel de aplicação (não superusuário) + RLS
-- O backend conecta como rede_app e define, por transação:
--   SET LOCAL app.user_id = '<uuid>'
-- As políticas derivam o escopo DENTRO do banco.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rede_app') THEN
    CREATE ROLE rede_app LOGIN PASSWORD 'dev-only-change-me-app';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO rede_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO rede_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rede_app;
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM rede_app;   -- sem exclusão simples (§3.3)
REVOKE UPDATE, DELETE ON audit_event FROM rede_app;           -- append-only

-- Usuário corrente da transação (null se não definido)
CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_role() RETURNS role_code AS $$
  SELECT role FROM app_user WHERE id = app_current_user() AND active
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Casas vigentes do usuário corrente
CREATE OR REPLACE FUNCTION app_user_house_ids() RETURNS SETOF uuid AS $$
  SELECT house_id FROM user_house_assignment
  WHERE user_id = app_current_user() AND valid_to IS NULL
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Escopo transversal (§5.13): gestor_geral, enfermagem e lider_noturno_geral
-- enxergam as 8 casas — cada um LIMITADO À SUA FINALIDADE na camada de
-- aplicação; aqui o banco garante o perímetro máximo.
CREATE OR REPLACE FUNCTION app_house_in_scope(target uuid) RETURNS boolean AS $$
  SELECT CASE
    WHEN app_current_role() IN ('gestor_geral','enfermagem','lider_noturno_geral','admin_tecnico')
      THEN EXISTS (
        SELECT 1 FROM house h
        JOIN app_user u ON u.id = app_current_user()
        WHERE h.id = target AND h.institution_id = u.institution_id)
    ELSE target IN (SELECT app_user_house_ids())
  END
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ---------- Políticas ----------
ALTER TABLE house ENABLE ROW LEVEL SECURITY;
CREATE POLICY house_select ON house FOR SELECT TO rede_app
  USING (app_house_in_scope(id));
-- criação/edição de casas: somente via papel administrativo (migração/gestão);
-- sem política de escrita para rede_app = escrita negada pelo RLS.

ALTER TABLE user_house_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY uha_select ON user_house_assignment FOR SELECT TO rede_app
  USING (user_id = app_current_user() OR app_house_in_scope(house_id));
CREATE POLICY uha_insert ON user_house_assignment FOR INSERT TO rede_app
  WITH CHECK (
    app_current_role() IN ('gestor_geral','coordenador')
    AND app_house_in_scope(house_id));

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
-- vê a si mesmo; coordenador/gestor veem usuários vinculados a casas do seu escopo
CREATE POLICY user_select ON app_user FOR SELECT TO rede_app
  USING (
    id = app_current_user()
    OR EXISTS (SELECT 1 FROM user_house_assignment a
               WHERE a.user_id = app_user.id AND a.valid_to IS NULL
                 AND app_house_in_scope(a.house_id)
                 AND app_current_role() IN ('gestor_geral','coordenador','equipe_tecnica')));
CREATE POLICY user_update_self ON app_user FOR UPDATE TO rede_app
  USING (id = app_current_user()) WITH CHECK (id = app_current_user());

ALTER TABLE work_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_select ON work_schedule FOR SELECT TO rede_app
  USING (user_id = app_current_user() OR (house_id IS NOT NULL AND app_house_in_scope(house_id)));
CREATE POLICY ws_write ON work_schedule FOR INSERT TO rede_app
  WITH CHECK (app_current_role() IN ('gestor_geral','coordenador'));

ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert ON audit_event FOR INSERT TO rede_app WITH CHECK (true);
CREATE POLICY audit_select ON audit_event FOR SELECT TO rede_app
  USING (app_current_role() IN ('gestor_geral','admin_tecnico')
         OR (app_current_role() = 'coordenador' AND app_house_in_scope(house_id)));

-- Sessões e tentativas de login: gerenciadas pelo serviço de autenticação
-- (antes da identidade existir). Sem RLS, mas sem acesso além do necessário.
GRANT SELECT, INSERT, UPDATE ON user_session, login_attempt TO rede_app;

-- O login acontece ANTES de existir identidade na transação (app.user_id vazio),
-- então a busca por e-mail usa função SECURITY DEFINER com retorno mínimo,
-- evitando abrir SELECT irrestrito em app_user e impedindo enumeração ampla.
CREATE OR REPLACE FUNCTION auth_find_user(p_email text)
RETURNS TABLE (id uuid, institution_id uuid, email text, full_name text,
               password_hash text, role role_code, active boolean,
               must_change_password boolean) AS $$
  SELECT u.id, u.institution_id, u.email, u.full_name,
         u.password_hash, u.role, u.active, u.must_change_password
  FROM app_user u WHERE lower(u.email) = lower(p_email)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION auth_find_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_user(text) TO rede_app;
