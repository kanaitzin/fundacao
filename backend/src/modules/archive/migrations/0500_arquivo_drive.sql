-- ============================================================
-- Rede Acolher — Migração 050: arquivo documental no Drive (§16)
--
-- O que este módulo NÃO é: backup do sistema. Banco e objetos têm backup
-- técnico próprio. Aqui vai a cópia documental do que FECHOU — ATA, passagem,
-- ocorrência, acompanhamento, relatório — para a Fundação ter o documento
-- onde ela já guarda documento.
--
-- Quatro regras que o desenho impõe, em vez de pedir:
--
--  1. **nunca sobrescreve** (§16.3). Cada fechamento vira uma versão nova:
--     V1, V2_ADENDO. A unicidade é (entidade, versão) — mandar de novo o
--     mesmo fechamento não cria segundo arquivo, e corrigir não apaga o
--     anterior;
--
--  2. **nome de arquivo não carrega pessoa** (§3.3, §16.3). Sem nome, sem
--     CPF, sem diagnóstico, sem conteúdo judicial. O CHECK recusa onze
--     dígitos seguidos — é a forma mais comum de o CPF vazar para um nome de
--     arquivo, e ninguém percebe até estar na pasta compartilhada;
--
--  3. **área restrita é pasta separada** (§16.5). Narrativa restrita e
--     benefícios não convivem com o resto: outra raiz, outra permissão;
--
--  4. **falha não some** (§16.4). Estados explícitos, retentativa idempotente
--     e, na falha persistente, escalonamento para técnica/coordenação. Um
--     documento "quase enviado" é um documento perdido.
-- ============================================================

CREATE TABLE archive_item (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id      uuid REFERENCES house(id),
  ano           integer NOT NULL,
  mes           integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  categoria     text NOT NULL CHECK (categoria IN (
                  'ata','passagem','narrativa_restrita','ocorrencia','acompanhamento',
                  'relatorio_mensal_casa','medicamento_especial','relatorio_judiciario',
                  'comunicacao_oficial','adendo','saude','beneficios','documento_oficial')),
  entity        text NOT NULL,          -- módulo de origem: 'ata','incident','followup'…
  entity_id     uuid NOT NULL,
  versao        text NOT NULL DEFAULT 'V1',   -- V1, V2_ADENDO…
  -- Caminho lógico no Shared Drive: <casa>/<ano>/<mes>/<categoria>
  caminho       text NOT NULL,
  filename      text NOT NULL,
  sha256        text,
  bytes         integer,
  -- Área restrita mora em outra raiz, com outra permissão (§16.5).
  area_restrita boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'aguardando'
                CHECK (status IN ('aguardando','enviando','salvo','verificado','falhou')),
  tentativas    integer NOT NULL DEFAULT 0,
  ultimo_erro   text,
  drive_file_id text,
  fechado_em    timestamptz NOT NULL DEFAULT now(),
  enviado_em    timestamptz,
  verificado_em timestamptz,
  created_by    uuid REFERENCES app_user(id),
  -- Nome de arquivo sem pessoa: sem CPF (11 dígitos seguidos) e sem espaços,
  -- que costumam vir junto com nome próprio colado de outra tela.
  CONSTRAINT ck_filename_sem_pessoa CHECK (filename !~ '[0-9]{11}' AND filename !~ '\s')
);
-- Não sobrescrever: cada versão de cada documento é uma linha só.
CREATE UNIQUE INDEX uq_archive_versao ON archive_item (entity, entity_id, versao);
CREATE INDEX idx_archive_fila ON archive_item (status, tentativas)
  WHERE status IN ('aguardando','falhou');
CREATE INDEX idx_archive_casa ON archive_item (house_id, ano, mes, categoria);

-- Histórico das tentativas: a fila conta o que aconteceu, não só o estado final.
CREATE TABLE archive_attempt (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES archive_item(id),
  de         text NOT NULL,
  para       text NOT NULL,
  erro       text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attempt_item ON archive_attempt (item_id, at DESC);

ALTER TABLE archive_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive_attempt ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON archive_item TO rede_app;
GRANT SELECT ON archive_attempt TO rede_app;

-- Educador não tem acesso direto às pastas (§16.5) — nem à fila que as
-- alimenta. A área restrita some da listagem de quem não é da área.
CREATE POLICY arc_select ON archive_item FOR SELECT TO rede_app
  USING (
    app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral','admin_tecnico')
    AND (house_id IS NULL OR app_house_in_scope(house_id))
    AND (NOT area_restrita OR app_current_role() IN ('coordenador','gestor_geral'))
  );
CREATE POLICY arc_attempt_select ON archive_attempt FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM archive_item i WHERE i.id = item_id));

-- Sem policy de INSERT/UPDATE por tela: a fila é movida pelos comandos abaixo.

-- ============================================================
-- Enfileirar no fechamento (§16.2)
--
-- Idempotente: o mesmo documento fechado duas vezes não vira dois arquivos.
-- ============================================================
CREATE OR REPLACE FUNCTION app_archive_enqueue(
  p_house uuid, p_categoria text, p_entity text, p_entity_id uuid,
  p_filename text, p_versao text DEFAULT 'V1', p_restrita boolean DEFAULT false,
  p_quando timestamptz DEFAULT now()
) RETURNS TABLE (item_id uuid, ja_existia boolean) AS $$
DECLARE
  v_id uuid; v_cod text; v_ano integer; v_mes integer; v_caminho text; v_raiz text;
BEGIN
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral',
                                'lider_diurno','lider_noturno_geral','admin_tecnico','enfermagem') THEN
    RAISE EXCEPTION 'sem_permissao_arquivar' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_id FROM archive_item
   WHERE entity = p_entity AND entity_id = p_entity_id AND versao = p_versao;
  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, true;
    RETURN;
  END IF;

  SELECT h.code INTO v_cod FROM house h WHERE h.id = p_house;
  v_ano := EXTRACT(year FROM (p_quando AT TIME ZONE 'America/Sao_Paulo'))::integer;
  v_mes := EXTRACT(month FROM (p_quando AT TIME ZONE 'America/Sao_Paulo'))::integer;
  -- Raiz separada para o que é restrito (§16.5).
  v_raiz := CASE WHEN p_restrita THEN 'RESTRITO' ELSE 'ACOLHIMENTO' END;
  v_caminho := concat_ws('/', v_raiz, coalesce(v_cod, 'INSTITUCIONAL'),
                         v_ano::text, lpad(v_mes::text, 2, '0'), p_categoria);

  INSERT INTO archive_item (house_id, ano, mes, categoria, entity, entity_id, versao,
                            caminho, filename, area_restrita, fechado_em, created_by)
  VALUES (p_house, v_ano, v_mes, p_categoria, p_entity, p_entity_id, p_versao,
          v_caminho, p_filename, p_restrita, p_quando, app_current_user())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, false;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_archive_enqueue(uuid, text, text, uuid, text, text, boolean, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_archive_enqueue(uuid, text, text, uuid, text, text, boolean, timestamptz) TO rede_app;

-- ============================================================
-- Máquina de estados: aguardando → enviando → salvo → verificado
--                     ou falhou → nova tentativa
-- ============================================================
CREATE OR REPLACE FUNCTION app_archive_transition(
  p_item uuid, p_para text, p_drive_id text DEFAULT NULL,
  p_sha text DEFAULT NULL, p_erro text DEFAULT NULL
) RETURNS TABLE (status text, tentativas integer, escalar boolean) AS $$
DECLARE it record; v_ok boolean;
BEGIN
  IF app_current_role() NOT IN ('admin_tecnico','equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_mover_fila' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO it FROM archive_item WHERE id = p_item FOR UPDATE;
  IF it IS NULL THEN
    RAISE EXCEPTION 'item_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- Transições válidas. Um "salvo" que volta para "enviando" seria um envio
  -- duplicado; um "verificado" não regride.
  v_ok := CASE
    WHEN it.status = 'aguardando' AND p_para = 'enviando' THEN true
    WHEN it.status = 'enviando'   AND p_para IN ('salvo','falhou') THEN true
    WHEN it.status = 'salvo'      AND p_para = 'verificado' THEN true
    WHEN it.status = 'falhou'     AND p_para = 'enviando' THEN true
    ELSE false
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'transicao_invalida_% _para_%', it.status, p_para
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO archive_attempt (item_id, de, para, erro) VALUES (p_item, it.status, p_para, p_erro);

  UPDATE archive_item
     SET status = p_para,
         tentativas = tentativas + CASE WHEN p_para = 'enviando' THEN 1 ELSE 0 END,
         ultimo_erro = CASE WHEN p_para = 'falhou' THEN p_erro ELSE ultimo_erro END,
         drive_file_id = coalesce(p_drive_id, drive_file_id),
         sha256 = coalesce(p_sha, sha256),
         enviado_em = CASE WHEN p_para = 'salvo' THEN now() ELSE enviado_em END,
         verificado_em = CASE WHEN p_para = 'verificado' THEN now() ELSE verificado_em END
   WHERE id = p_item;

  -- Falha persistente chega a gente (§16.4). Três tentativas é o limite em que
  -- "a rede oscilou" deixa de ser explicação.
  RETURN QUERY
    SELECT p_para, it.tentativas + CASE WHEN p_para = 'enviando' THEN 1 ELSE 0 END,
           (p_para = 'falhou' AND it.tentativas + 1 >= 3);
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_archive_transition(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_archive_transition(uuid, text, text, text, text) TO rede_app;

-- Fila pendente para o trabalhador — vê o que precisa ir, na ordem de fechamento.
CREATE OR REPLACE FUNCTION app_archive_queue(p_limite integer DEFAULT 20)
RETURNS TABLE (id uuid, caminho text, filename text, entity text, entity_id uuid,
               versao text, status text, tentativas integer, area_restrita boolean) AS $$
  SELECT i.id, i.caminho, i.filename, i.entity, i.entity_id, i.versao,
         i.status, i.tentativas, i.area_restrita
    FROM archive_item i
   WHERE i.status IN ('aguardando','falhou') AND i.tentativas < 5
   ORDER BY i.fechado_em
   LIMIT greatest(coalesce(p_limite, 20), 1)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_archive_queue(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_archive_queue(integer) TO rede_app;

-- Reconciliação: o que está no sistema e não chegou ao Drive (§16.4).
CREATE OR REPLACE FUNCTION app_archive_reconcile(p_house uuid)
RETURNS TABLE (categoria text, aguardando integer, falhou integer, verificado integer) AS $$
  SELECT i.categoria,
         count(*) FILTER (WHERE i.status IN ('aguardando','enviando'))::integer,
         count(*) FILTER (WHERE i.status = 'falhou')::integer,
         count(*) FILTER (WHERE i.status = 'verificado')::integer
    FROM archive_item i
   WHERE i.house_id = p_house AND app_house_in_scope(p_house)
   GROUP BY i.categoria
   ORDER BY i.categoria
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_archive_reconcile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_archive_reconcile(uuid) TO rede_app;
