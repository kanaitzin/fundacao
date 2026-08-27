-- ============================================================
-- Rede Acolher — Migração 002: Perfil do Acolhido
--
-- Ciclo de vida (§15.1): pessoa → episódio → permanência → registros.
-- Retorno cria NOVO episódio no mesmo perfil; nada é apagado.
--
-- Visibilidade operacional deriva da PERMANÊNCIA ATIVA numa casa:
-- ao transferir, o perfil desaparece da origem e aparece no destino
-- somente após o aceite (§15.6), sem apagar histórico.
-- ============================================================

-- ---------- Pessoa (identidade estável ao longo da vida) ----------
CREATE TABLE person (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institution(id),
  cpf             text,                       -- normalizado (11 dígitos); nulo em ingresso urgente
  cpf_pending     boolean NOT NULL DEFAULT false,
  provisional_id  text,                       -- ID provisório quando falta CPF (§6.1)
  full_name       text NOT NULL,              -- nome civil
  social_name     text,                       -- nome social/de uso — usado nas telas operacionais
  birth_date      date NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES app_user(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1  -- concorrência otimista
);
-- CPF único por instituição (§6.1). Índice parcial: pendências não colidem.
CREATE UNIQUE INDEX uq_person_cpf ON person (institution_id, cpf) WHERE cpf IS NOT NULL;
CREATE INDEX idx_person_name ON person (institution_id, lower(full_name));

-- Nome de exibição operacional: social quando houver (§6.1)
CREATE OR REPLACE FUNCTION person_display_name(p person) RETURNS text AS $$
  SELECT coalesce(nullif(p.social_name,''), p.full_name)
$$ LANGUAGE sql IMMUTABLE;

-- ---------- Episódio de acolhimento ----------
CREATE TABLE care_episode (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES person(id),
  institution_id uuid NOT NULL REFERENCES institution(id),
  number       integer NOT NULL,              -- 1º, 2º acolhimento…
  started_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz,
  end_reason   text,                          -- reintegração familiar, maioridade, adoção…
  status       text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','encerrado')),
  created_by   uuid REFERENCES app_user(id),
  UNIQUE (person_id, number)
);
-- Uma pessoa não tem dois episódios ativos ao mesmo tempo
CREATE UNIQUE INDEX uq_episode_ativo ON care_episode (person_id) WHERE status = 'ativo';

-- ---------- Permanência numa casa ----------
CREATE TABLE house_stay (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id  uuid NOT NULL REFERENCES care_episode(id),
  person_id   uuid NOT NULL REFERENCES person(id),
  house_id    uuid NOT NULL REFERENCES house(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  end_reason  text CHECK (end_reason IN ('transferencia','saida','encerramento_episodio')),
  status      text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','encerrada')),
  created_by  uuid REFERENCES app_user(id)
);
-- Uma pessoa está operacionalmente em UMA casa por vez
CREATE UNIQUE INDEX uq_stay_ativa ON house_stay (person_id) WHERE status = 'ativa';
CREATE INDEX idx_stay_house ON house_stay (house_id) WHERE status = 'ativa';

-- ---------- Perfil (dados estruturais; equipe técnica/coordenação editam) ----------
CREATE TABLE profile_detail (
  person_id       uuid PRIMARY KEY REFERENCES person(id),
  essential_care  text,        -- cuidados essenciais, acessibilidade e comunicação
  school_name     text,
  school_grade    text,
  school_shift    text,
  school_address  text,        -- endereço de destino p/ logística; NUNCA rastreamento (§7.5)
  reference_team  text,
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES app_user(id),
  version         integer NOT NULL DEFAULT 1
);

-- ---------- Saúde: condições e alergias ----------
CREATE TABLE health_condition (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL REFERENCES person(id),
  kind        text NOT NULL CHECK (kind IN ('alergia','condicao','intolerancia')),
  description text NOT NULL,
  severity    text CHECK (severity IN ('leve','moderada','grave')),
  source      text,                       -- profissional/serviço que informou
  essential_alert boolean NOT NULL DEFAULT false,  -- aparece no topo do perfil (§6.4)
  started_on  date,
  review_on   date,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES app_user(id)
);
CREATE INDEX idx_health_person ON health_condition (person_id) WHERE active;

-- ---------- Alimentação e restrições ----------
CREATE TABLE food_restriction (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES person(id),
  restriction   text NOT NULL,             -- o que evitar
  substitution  text,                      -- substituição/orientação
  guidance      text,
  source        text,
  review_on     date,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES app_user(id)
);
CREATE INDEX idx_food_person ON food_restriction (person_id) WHERE active;

-- ---------- Documentos categorizados e versionados (§6.8) ----------
CREATE TYPE doc_category AS ENUM ('saude','escolar','pessoal','judicial_socioassistencial');

CREATE TABLE document (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL REFERENCES person(id),
  category    doc_category NOT NULL,
  title       text NOT NULL,               -- sem CPF/diagnóstico/conteúdo judicial no título (§3.3)
  issued_on   date,
  valid_until date,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES app_user(id)
);
CREATE TABLE document_version (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document(id),
  version     integer NOT NULL,
  storage_key text NOT NULL,               -- objeto criptografado; URL assinada sob demanda
  sha256      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES app_user(id),
  UNIQUE (document_id, version)
);

-- ---------- Benefícios e dados bancários (área altamente restrita §6.10) ----------
CREATE TABLE benefit_record (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES person(id),
  benefit_type  text NOT NULL,             -- BPC, pensão, poupança institucional…
  bank_name     text,
  agency        text,
  account       text,
  status        text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','em_regularizacao','encerrado')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES app_user(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES app_user(id)
);

-- ---------- Memórias autorizadas (§6.9) — habilitadas por configuração ----------
CREATE TABLE memory_record (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES person(id),
  event_type    text NOT NULL,             -- aniversário, formatura, conquista…
  happened_on   date NOT NULL,
  description   text NOT NULL,
  has_photo     boolean NOT NULL DEFAULT false,
  photo_authorized boolean NOT NULL DEFAULT false,  -- comprovação de autorização
  storage_key   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES app_user(id)
);

-- ---------- Transferência entre casas (§15.6) ----------
CREATE TABLE transfer_request (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       uuid NOT NULL REFERENCES person(id),
  episode_id      uuid NOT NULL REFERENCES care_episode(id),
  from_house_id   uuid NOT NULL REFERENCES house(id),
  to_house_id     uuid NOT NULL REFERENCES house(id),
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'solicitada'
                  CHECK (status IN ('solicitada','aceita','devolvida','cancelada')),
  requested_by    uuid NOT NULL REFERENCES app_user(id),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  decided_by      uuid REFERENCES app_user(id),
  decided_at      timestamptz,
  decision_note   text,
  pendencies      text,
  CHECK (from_house_id <> to_house_id)
);
CREATE INDEX idx_transfer_pend ON transfer_request (to_house_id) WHERE status = 'solicitada';

-- ============================================================
-- Escopo e RLS
-- ============================================================

-- Casa atual (permanência ativa) de uma pessoa
CREATE OR REPLACE FUNCTION app_person_house(p uuid) RETURNS uuid AS $$
  SELECT house_id FROM house_stay WHERE person_id = p AND status = 'ativa' LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Pessoa está no escopo operacional do usuário corrente?
--  * com permanência ativa: vale a matriz de casas (app_house_in_scope);
--  * sem permanência ativa (Acervo Histórico): somente equipe técnica,
--    coordenação e gestor — e a técnica/coordenação apenas de quem esteve
--    na sua casa (continuidade do cuidado, §15.2).
CREATE OR REPLACE FUNCTION app_person_in_scope(p uuid) RETURNS boolean AS $$
  SELECT CASE
    WHEN app_person_house(p) IS NOT NULL THEN app_house_in_scope(app_person_house(p))
    WHEN app_current_role() IN ('gestor_geral','admin_tecnico') THEN true
    WHEN app_current_role() IN ('equipe_tecnica','coordenador') THEN EXISTS (
      SELECT 1 FROM house_stay s
      WHERE s.person_id = p AND app_house_in_scope(s.house_id))
    ELSE false
  END
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Papéis que editam dados estruturais do perfil (§6.2)
CREATE OR REPLACE FUNCTION app_can_edit_profile() RETURNS boolean AS $$
  SELECT app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE person ENABLE ROW LEVEL SECURITY;
CREATE POLICY person_select ON person FOR SELECT TO rede_app USING (app_person_in_scope(id));
CREATE POLICY person_insert ON person FOR INSERT TO rede_app WITH CHECK (app_can_edit_profile());
CREATE POLICY person_update ON person FOR UPDATE TO rede_app
  USING (app_person_in_scope(id) AND app_can_edit_profile())
  WITH CHECK (app_can_edit_profile());

ALTER TABLE care_episode ENABLE ROW LEVEL SECURITY;
CREATE POLICY episode_select ON care_episode FOR SELECT TO rede_app USING (app_person_in_scope(person_id));
CREATE POLICY episode_insert ON care_episode FOR INSERT TO rede_app WITH CHECK (app_can_edit_profile());
CREATE POLICY episode_update ON care_episode FOR UPDATE TO rede_app
  USING (app_person_in_scope(person_id) AND app_can_edit_profile()) WITH CHECK (true);

ALTER TABLE house_stay ENABLE ROW LEVEL SECURITY;
CREATE POLICY stay_select ON house_stay FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id) OR app_person_in_scope(person_id));
CREATE POLICY stay_insert ON house_stay FOR INSERT TO rede_app WITH CHECK (app_can_edit_profile());
CREATE POLICY stay_update ON house_stay FOR UPDATE TO rede_app
  USING (app_can_edit_profile()) WITH CHECK (true);

ALTER TABLE profile_detail ENABLE ROW LEVEL SECURITY;
CREATE POLICY pd_select ON profile_detail FOR SELECT TO rede_app USING (app_person_in_scope(person_id));
CREATE POLICY pd_insert ON profile_detail FOR INSERT TO rede_app WITH CHECK (app_can_edit_profile());
CREATE POLICY pd_update ON profile_detail FOR UPDATE TO rede_app
  USING (app_person_in_scope(person_id) AND app_can_edit_profile()) WITH CHECK (true);

-- Saúde: leitura para quem tem a pessoa em escopo; escrita para Enfermagem/técnica/coordenação
CREATE OR REPLACE FUNCTION app_can_edit_health() RETURNS boolean AS $$
  SELECT app_current_role() IN ('enfermagem','equipe_tecnica','coordenador','gestor_geral')
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE health_condition ENABLE ROW LEVEL SECURITY;
CREATE POLICY hc_select ON health_condition FOR SELECT TO rede_app USING (app_person_in_scope(person_id));
CREATE POLICY hc_insert ON health_condition FOR INSERT TO rede_app WITH CHECK (app_can_edit_health());
CREATE POLICY hc_update ON health_condition FOR UPDATE TO rede_app
  USING (app_person_in_scope(person_id) AND app_can_edit_health()) WITH CHECK (true);

ALTER TABLE food_restriction ENABLE ROW LEVEL SECURITY;
CREATE POLICY fr_select ON food_restriction FOR SELECT TO rede_app USING (app_person_in_scope(person_id));
CREATE POLICY fr_insert ON food_restriction FOR INSERT TO rede_app WITH CHECK (app_can_edit_health());
CREATE POLICY fr_update ON food_restriction FOR UPDATE TO rede_app
  USING (app_person_in_scope(person_id) AND app_can_edit_health()) WITH CHECK (true);

-- Documentos: educador abre apenas saúde e escolar (§6.8)
CREATE OR REPLACE FUNCTION app_can_open_doc(cat doc_category) RETURNS boolean AS $$
  SELECT CASE app_current_role()
    WHEN 'educador' THEN cat IN ('saude','escolar')
    WHEN 'lider_diurno' THEN cat IN ('saude','escolar')
    WHEN 'lider_noturno_geral' THEN cat IN ('saude')
    WHEN 'enfermagem' THEN cat IN ('saude')
    WHEN 'cozinha' THEN false
    ELSE app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
  END
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE document ENABLE ROW LEVEL SECURITY;
CREATE POLICY doc_select ON document FOR SELECT TO rede_app
  USING (app_person_in_scope(person_id) AND app_can_open_doc(category));
CREATE POLICY doc_insert ON document FOR INSERT TO rede_app WITH CHECK (app_can_edit_profile() OR app_can_edit_health());

ALTER TABLE document_version ENABLE ROW LEVEL SECURITY;
CREATE POLICY dv_select ON document_version FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM document d WHERE d.id = document_id));  -- herda o filtro de document
CREATE POLICY dv_insert ON document_version FOR INSERT TO rede_app WITH CHECK (true);

-- Benefícios: SOMENTE coordenação da casa atual e Gestor Geral (§6.10)
CREATE OR REPLACE FUNCTION app_can_see_benefits(p uuid) RETURNS boolean AS $$
  SELECT CASE app_current_role()
    WHEN 'gestor_geral' THEN true
    WHEN 'coordenador' THEN app_person_house(p) IS NOT NULL
                            AND app_person_house(p) IN (SELECT app_user_house_ids())
    ELSE false
  END
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE benefit_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY ben_select ON benefit_record FOR SELECT TO rede_app USING (app_can_see_benefits(person_id));
CREATE POLICY ben_insert ON benefit_record FOR INSERT TO rede_app WITH CHECK (app_can_see_benefits(person_id));
CREATE POLICY ben_update ON benefit_record FOR UPDATE TO rede_app
  USING (app_can_see_benefits(person_id)) WITH CHECK (true);

ALTER TABLE memory_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY mem_select ON memory_record FOR SELECT TO rede_app USING (app_person_in_scope(person_id));
CREATE POLICY mem_insert ON memory_record FOR INSERT TO rede_app WITH CHECK (app_person_in_scope(person_id));

-- Transferência: origem e destino enxergam; decisão é do destino
ALTER TABLE transfer_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY tr_select ON transfer_request FOR SELECT TO rede_app
  USING (app_house_in_scope(from_house_id) OR app_house_in_scope(to_house_id));
CREATE POLICY tr_insert ON transfer_request FOR INSERT TO rede_app
  WITH CHECK (app_can_edit_profile() AND app_house_in_scope(from_house_id));
CREATE POLICY tr_update ON transfer_request FOR UPDATE TO rede_app
  USING (app_can_edit_profile() AND (app_house_in_scope(to_house_id) OR app_house_in_scope(from_house_id)))
  WITH CHECK (true);

-- ---------- Permissões do papel de aplicação (tabelas novas) ----------
GRANT SELECT, INSERT, UPDATE ON person, care_episode, house_stay, profile_detail,
  health_condition, food_restriction, document, document_version, benefit_record,
  memory_record, transfer_request TO rede_app;
REVOKE DELETE ON person, care_episode, house_stay, profile_detail, health_condition,
  food_restriction, document, document_version, benefit_record, memory_record,
  transfer_request FROM rede_app;   -- sem exclusão simples (§3.3)

-- ---------- Verificação protegida de CPF (§6.1) ----------
-- Roda com privilégio elevado e devolve APENAS um veredito operacional.
-- Nunca revela nome, casa ou conteúdo de pessoa fora do escopo do usuário:
-- "ativo em outra casa" é um estado, não um vazamento (§6.1.5).
CREATE OR REPLACE FUNCTION app_check_cpf(p_institution uuid, p_cpf text)
RETURNS TABLE (situacao text, person_id uuid, mesma_casa boolean) AS $$
  SELECT
    CASE
      WHEN pe.id IS NULL THEN 'livre'
      WHEN st.id IS NULL THEN 'no_acervo'
      WHEN st.house_id IN (SELECT app_user_house_ids()) THEN 'ativo_mesma_casa'
      ELSE 'ativo_outra_casa'
    END,
    -- id só volta quando o usuário poderá de fato abrir o registro
    CASE WHEN pe.id IS NOT NULL
          AND (st.id IS NULL OR st.house_id IN (SELECT app_user_house_ids())
               OR app_current_role() = 'gestor_geral')
         THEN pe.id END,
    st.house_id IN (SELECT app_user_house_ids())
  FROM (SELECT 1) x
  LEFT JOIN person pe ON pe.institution_id = p_institution AND pe.cpf = p_cpf
  LEFT JOIN house_stay st ON st.person_id = pe.id AND st.status = 'ativa'
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_check_cpf(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_check_cpf(uuid, text) TO rede_app;
