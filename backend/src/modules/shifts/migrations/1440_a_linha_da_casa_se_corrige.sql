-- =============================================================================
-- 1440 — A LINHA DE UMA CASA NA ATA GERAL PASSA A SE CORRIGIR, COM REGISTRO.
--
-- A DECISÃO, de 21/09/2026: *"quem corrige a ata é o educador líder, equipe
-- técnica ou coordenador, tudo ficando registrado para esses 3"*.
--
-- Era o último item do Grupo 2 do §9 — a rota `PATCH
-- /shifts/general-ata/:id/house/:houseId` existia e **só o autor da ATA Geral a
-- alcançava, e só enquanto ela fosse rascunho**. Depois de assinada, ninguém
-- mexia: um horário digitado errado às 3h da manhã ficava errado para sempre, e
-- a casa aprendia que a ATA Geral não se conserta.
--
-- ---------------------------------------------------------------------------
-- CORRIGIR NÃO É SOBRESCREVER, E A DIFERENÇA É ESTA TABELA.
--
-- O §6 proíbe *"sobrescrita de registro fechado"*, e com razão. Mas o que ele
-- proíbe é a sobrescrita SEM RASTRO — e o sistema já resolveu isso uma vez, na
-- chamada: a `check_result_amendment` (0670) guarda o que constava ANTES, por
-- gatilho, e a tela diz *"Antes constava…"* com o nome de quem corrigiu. **Este
-- arquivo é o mesmo desenho, na linha da casa.**
--
-- Três consequências disso, e nenhuma é detalhe:
--
--   * **ninguém escreve no histórico pela aplicação.** O `INSERT` é do gatilho, e
--     `UPDATE`/`DELETE` são revogados: o passado não se edita nem se apaga;
--   * **reenvio idêntico não é correção.** Salvar a mesma coisa não polui o
--     histórico com linhas iguais — quem abrir daqui a um ano precisa distinguir
--     "foi corrigido três vezes" de "alguém clicou três vezes";
--   * **o motivo é obrigatório na correção depois de assinada.** Antes da
--     assinatura é rascunho, e rascunho se escreve sem justificar. Depois, a
--     linha já foi lida por alguém: mudá-la sem dizer por quê deixa o leitor de
--     amanhã com duas versões e nenhuma explicação.
--
-- QUEM CORRIGE são os três da decisão, e **não** o autor da ATA Geral por si só:
-- o Líder Noturno Geral preenche a ATA, e depois de assinada a correção é dos
-- três que respondem pela casa. Ele continua alcançando a dele enquanto é
-- rascunho — isso não muda.
-- =============================================================================

CREATE TABLE IF NOT EXISTS general_night_house_amendment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        uuid NOT NULL REFERENCES general_night_house_entry(id),
  general_ata_id  uuid NOT NULL REFERENCES general_night_ata(id),
  house_id        uuid NOT NULL REFERENCES house(id),
  -- O QUE CONSTAVA ANTES, por extenso. Guardar o jsonb da linha inteira seria
  -- guardar um objeto que ninguém lê; estes são os campos que a folha mostra.
  had_contact     boolean,
  contact_at      timestamptz,
  arrived_at      timestamptz,
  left_at         timestamptz,
  reason          text,
  people_involved text,
  action_taken    text,
  category        text,
  pendencies      text,
  shift_status    text,
  health_event    boolean,
  health_event_note text,
  -- Quem corrigiu, quando, e POR QUÊ.
  replaced_by     uuid NOT NULL REFERENCES app_user(id),
  replaced_at     timestamptz NOT NULL DEFAULT now(),
  motivo          text
);
CREATE INDEX IF NOT EXISTS ix_gnha_entry ON general_night_house_amendment (entry_id);
CREATE INDEX IF NOT EXISTS ix_gnha_ata
  ON general_night_house_amendment (general_ata_id, house_id);

ALTER TABLE general_night_house_amendment ENABLE ROW LEVEL SECURITY;
/* Mesmo alcance da linha que ele corrige: quem enxerga a ATA Geral enxerga o
   histórico dela. Sem isto, a correção ficaria registrada e invisível — que é
   pior do que não registrar, porque cria a impressão de rastro. */
CREATE POLICY gnha_select ON general_night_house_amendment FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM general_night_house_entry e WHERE e.id = entry_id));
GRANT SELECT ON general_night_house_amendment TO rede_app;
REVOKE INSERT, UPDATE, DELETE ON general_night_house_amendment FROM rede_app;

-- ---------------------------------------------------------------------------
-- O GATILHO. Guarda o que havia, antes de deixar mudar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_gn_house_amend() RETURNS trigger AS $$
DECLARE v_status text; v_motivo text;
BEGIN
  /* Reenvio idêntico não é correção. */
  IF NEW.had_contact IS NOT DISTINCT FROM OLD.had_contact
     AND NEW.contact_at IS NOT DISTINCT FROM OLD.contact_at
     AND NEW.arrived_at IS NOT DISTINCT FROM OLD.arrived_at
     AND NEW.left_at IS NOT DISTINCT FROM OLD.left_at
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.people_involved IS NOT DISTINCT FROM OLD.people_involved
     AND NEW.action_taken IS NOT DISTINCT FROM OLD.action_taken
     AND NEW.category IS NOT DISTINCT FROM OLD.category
     AND NEW.pendencies IS NOT DISTINCT FROM OLD.pendencies
     AND NEW.shift_status IS NOT DISTINCT FROM OLD.shift_status
     AND NEW.health_event IS NOT DISTINCT FROM OLD.health_event
     AND NEW.health_event_note IS NOT DISTINCT FROM OLD.health_event_note
     AND NEW.house_ata_confirmed IS NOT DISTINCT FROM OLD.house_ata_confirmed
  THEN RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM general_night_ata WHERE id = OLD.general_ata_id;

  /*
   * ENQUANTO É RASCUNHO, não há histórico: é o autor montando a própria ATA, e
   * guardar cada tecla dele encheria a folha de "antes constava" sobre algo que
   * ninguém leu ainda. Depois de assinada, TODA mudança é correção.
   */
  IF v_status = 'rascunho' THEN RETURN NEW; END IF;

  /* O motivo chega pela variável de sessão que o comando põe — a tabela não
     tem coluna para ele, porque o motivo é da CORREÇÃO e não da linha. */
  v_motivo := nullif(btrim(coalesce(current_setting('app.motivo_correcao', true), '')), '');
  IF v_motivo IS NULL OR length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'correcao_exige_motivo' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO general_night_house_amendment (
    entry_id, general_ata_id, house_id,
    had_contact, contact_at, arrived_at, left_at, reason, people_involved,
    action_taken, category, pendencies, shift_status, health_event,
    health_event_note, replaced_by, motivo)
  VALUES (OLD.id, OLD.general_ata_id, OLD.house_id,
          OLD.had_contact, OLD.contact_at, OLD.arrived_at, OLD.left_at, OLD.reason,
          OLD.people_involved, OLD.action_taken, OLD.category, OLD.pendencies,
          OLD.shift_status, OLD.health_event, OLD.health_event_note,
          app_current_user(), v_motivo);

  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

DROP TRIGGER IF EXISTS tg_gn_house_amend ON general_night_house_entry;
CREATE TRIGGER tg_gn_house_amend
  BEFORE UPDATE ON general_night_house_entry
  FOR EACH ROW EXECUTE FUNCTION app_gn_house_amend();

-- ---------------------------------------------------------------------------
-- A POLÍTICA: quem pode mexer, e quando.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS gnhe_update ON general_night_house_entry;
CREATE POLICY gnhe_update ON general_night_house_entry FOR UPDATE TO rede_app
  USING (
    -- O autor, montando a própria ATA. Como era antes da 1440.
    EXISTS (SELECT 1 FROM general_night_ata g
             WHERE g.id = general_ata_id AND g.leader_id = app_current_user()
               AND g.status = 'rascunho')
    -- Ou os TRÊS da decisão de 21/09, corrigindo o que já foi assinado — com
    -- a casa no alcance de quem corrige, e com o gatilho exigindo o motivo.
    OR (app_current_role() IN ('lider_diurno','equipe_tecnica','coordenador')
        AND app_house_in_scope(house_id))
  )
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- E QUEM CORRIGE PRECISA LER — o §10.2, respondido por consequência.
--
-- Isto apareceu ao escrever o teste, e é achado de verdade: a `gna_select` da
-- 0310 dá a leitura da ATA Geral ao Líder Noturno Geral, à equipe técnica, à
-- coordenação, ao Gestor Geral e ao admin técnico — **e não ao Líder Diurno.**
-- A decisão de 21/09 o pôs a corrigir uma folha que ele não enxergava: o comando
-- lia `status` para saber se já estava assinada, recebia nulo (o RLS não devolve
-- a linha), e concluía que era rascunho. O defeito seria silencioso e ao
-- contrário — ele corrigindo sem o motivo ser exigido.
--
-- A pergunta §10.2 era *"quem lê a ATA Geral de dia"*, e continua aberta para os
-- outros cargos. Esta migração responde só a parte que a decisão implica: **quem
-- corrige, lê.** A linha da casa dele ele já alcançava pela `gnhe_select`, por
-- casa no escopo; o que faltava era o cabeçalho da ATA.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS gna_select ON general_night_ata;
CREATE POLICY gna_select ON general_night_ata FOR SELECT TO rede_app
  USING (app_current_role() IN ('lider_noturno_geral','equipe_tecnica','coordenador',
                                'gestor_geral','admin_tecnico',
                                -- 1440: quem corrige, lê.
                                'lider_diurno'));

-- ---------------------------------------------------------------------------
-- A LEITURA DO HISTÓRICO. Do mais recente ao mais antigo, como a chamada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_gn_house_history(p_ata uuid, p_house uuid)
RETURNS TABLE (
  por text, corrigido_em timestamptz, motivo text,
  antes_situacao text, antes_houve_contato boolean, antes_chegada timestamptz,
  antes_saida timestamptz, antes_motivo text, antes_pessoas text,
  antes_acao text, antes_categoria text, antes_pendencias text,
  antes_evento_de_saude boolean, antes_nota_de_saude text) AS $$
  SELECT app_user_display_name(a.replaced_by), a.replaced_at, a.motivo,
         a.shift_status, a.had_contact, a.arrived_at, a.left_at, a.reason,
         a.people_involved, a.action_taken, a.category, a.pendencies,
         a.health_event, a.health_event_note
    FROM general_night_house_amendment a
   WHERE a.general_ata_id = p_ata AND a.house_id = p_house
   ORDER BY a.replaced_at DESC
$$ LANGUAGE sql STABLE;
GRANT EXECUTE ON FUNCTION app_gn_house_history(uuid, uuid) TO rede_app;

COMMENT ON TABLE general_night_house_amendment IS
  'O que constava ANTES numa linha da ATA Geral, guardado por gatilho quando ela '
  'é corrigida depois de assinada (1440). Corrigem o Líder Diurno, a equipe '
  'técnica e a coordenação — decisão de 21/09/2026 —, e o motivo é obrigatório. '
  'Ninguém escreve aqui pela aplicação: o passado não se edita nem se apaga.';
