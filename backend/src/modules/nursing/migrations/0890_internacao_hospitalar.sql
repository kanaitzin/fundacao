-- =========================================================================
-- INTERNAÇÃO HOSPITALAR — 03/09/2026
--
-- Pedido da coordenação: "muitos atendidos ficam internados em hospitais, e
-- preciso de um campo que tire a criança da linha do tempo normal do
-- acolhimento por motivo de saúde, mas onde seja possível registrar todo dia
-- o que aconteceu lá — retorno dos médicos, exames, atendimentos,
-- medicamentos —, com um educador junto como responsável por essa alimentação
-- diária, podendo anexar documentos e solicitações do hospital."
--
-- O QUE A INTERNAÇÃO NÃO É:
--
--  * **não é saída.** Saída encerra o acolhimento e manda a criança para o
--    acervo (§15.2). A criança internada CONTINUA da casa, continua na
--    contagem, continua ocupando a vaga — a coordenação foi explícita: ela só
--    sai do sistema quando a técnica ou a coordenação a removerem, com motivo,
--    e aí é saída;
--  * **não é um atendimento de saúde a mais.** `health_encounter` já tem o
--    tipo 'internacao', e ele registra QUE houve; isto aqui é o período, com
--    diário e responsável;
--  * **não é ausência temporária.** A criança que foi ao dentista à tarde
--    volta para a chamada da janta. A internada não volta até a alta.
--
-- O QUE ELA FAZ: enquanto está aberta, a criança some da linha do dia da casa
-- — chamada, grade de medicação, rotina. Não porque deixou de importar, mas
-- porque cobrar da educadora de plantão a confirmação do café de uma criança
-- que está no hospital é pedir que ela minta ou que ignore o alerta. E o que
-- se ignora todo dia deixa de ser alerta.
-- =========================================================================

CREATE TABLE hospitalization (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES person(id),
  house_id      uuid NOT NULL REFERENCES house(id),
  hospital      text NOT NULL,
  reason        text NOT NULL,
  started_at    timestamptz NOT NULL,
  ended_at      timestamptz,
  -- Como terminou: alta para a casa, transferência para outro hospital, ou
  -- óbito. As três precisam de nome, porque as três acontecem.
  outcome       text CHECK (outcome IN ('alta','transferencia_hospitalar','obito')),
  outcome_note  text,
  status        text NOT NULL DEFAULT 'em_andamento'
                CHECK (status IN ('em_andamento','encerrada')),
  opened_by     uuid NOT NULL REFERENCES app_user(id),
  opened_at     timestamptz NOT NULL DEFAULT now(),
  closed_by     uuid REFERENCES app_user(id),
  closed_at     timestamptz,
  CHECK (status = 'em_andamento' OR (ended_at IS NOT NULL AND outcome IS NOT NULL))
);

-- Uma internação aberta por criança. Duas ao mesmo tempo não são um caso raro:
-- são um erro de digitação que ninguém percebe até a alta não fechar nada.
CREATE UNIQUE INDEX uq_internacao_aberta ON hospitalization (person_id)
  WHERE status = 'em_andamento';
CREATE INDEX idx_internacao_casa ON hospitalization (house_id, started_at DESC);

/*
 * O DIÁRIO.
 *
 * A coordenação disse que o registro diário NÃO é obrigatório — "mas acredito
 * que eles visitam ou ficam todos os dias com a criança lá, logo podemos
 * deixar uma observação de relato diário". Por isso não há cobrança de
 * pendência: a falta de um relato num dia não vira alerta vermelho na tela de
 * ninguém. O que existe é o lugar para escrever, e a contagem de quantos dias
 * têm relato — que a coordenação lê e tira as conclusões dela.
 */
CREATE TABLE hospitalization_note (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospitalization_id uuid NOT NULL REFERENCES hospitalization(id),
  on_date           date NOT NULL,
  kind              text NOT NULL DEFAULT 'relato'
                    CHECK (kind IN ('relato','retorno_medico','exame','atendimento',
                                    'medicacao','solicitacao_do_hospital','alta_prevista')),
  body              text NOT NULL,
  -- O documento do hospital fica no mesmo armazenamento do dossiê: chave, e
  -- nunca o binário no banco.
  storage_key       text,
  mime              text,
  file_name         text,
  written_by        uuid NOT NULL REFERENCES app_user(id),
  written_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_internacao_nota ON hospitalization_note (hospitalization_id, on_date DESC);

/*
 * A MEDICAÇÃO DADA NO HOSPITAL.
 *
 * "Entra no perfil e no sistema sim, pois o sistema está cuidando da criança
 * como um todo, apenas sinalize que como é internação quem deu as medicações
 * foi o hospital."
 *
 * Tabela SEPARADA de `medication_administration`, e a separação é a regra
 * inteira: aquela tabela é a grade da casa, onde cada dose tem receita
 * assinada, horário previsto e o nome de QUEM DA CASA administrou. Dose do
 * hospital não tem nada disso — não tem receita da casa, não tem horário da
 * grade, e quem deu não é ninguém daqui.
 *
 * Registrá-la lá dentro faria a casa aparecer administrando o que não
 * administrou. Fica aqui, entra no histórico de saúde da criança, e sai em
 * toda folha com a marca de origem.
 */
CREATE TABLE hospitalization_medication (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospitalization_id uuid NOT NULL REFERENCES hospitalization(id),
  given_at          timestamptz NOT NULL,
  medication        text NOT NULL,
  dose              text,
  route             text,
  note              text,
  -- Quem escreveu no sistema. Quem ADMINISTROU foi o hospital, e é por isso
  -- que não há campo para "administrado por": não seria verdade.
  recorded_by       uuid NOT NULL REFERENCES app_user(id),
  recorded_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_internacao_med ON hospitalization_medication (hospitalization_id, given_at DESC);

/*
 * O EDUCADOR ACOMPANHANTE.
 *
 * "Acredito que troquem os educadores sim, sendo possível a equipe técnica ou
 * a coordenação delegarem para os educadores conforme necessidade das visitas."
 *
 * Por isso é uma LISTA com período, e não um campo `companion_id` na
 * internação: a criança fica três semanas, e quem vai ao hospital muda a cada
 * plantão. Um campo único guardaria só o último, e a pergunta "quem esteve com
 * ela no dia 12?" ficaria sem resposta.
 */
CREATE TABLE hospitalization_companion (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospitalization_id uuid NOT NULL REFERENCES hospitalization(id),
  user_id           uuid NOT NULL REFERENCES app_user(id),
  from_date         date NOT NULL,
  to_date           date,
  note              text,
  assigned_by       uuid NOT NULL REFERENCES app_user(id),
  assigned_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_internacao_acomp ON hospitalization_companion (hospitalization_id, from_date DESC);
CREATE INDEX idx_internacao_acomp_user ON hospitalization_companion (user_id) WHERE to_date IS NULL;

-- ------------------------------------------------------------------ Alcance

/*
 * QUEM LÊ A INTERNAÇÃO.
 *
 * A coordenação foi explícita: "confirmo que o educador social comum não vê".
 * Ficam a equipe técnica, a coordenação, o líder e o Gestor Geral — e a
 * ENFERMAGEM, que a resposta não citou e que eu incluí: a internação é
 * primeiro um fato de saúde, e a enfermeira que alcança as oito casas é quem
 * responde por medicação e retorno quando a criança volta. Está anotado como
 * decisão minha, para ser desfeita numa linha se estiver errada.
 *
 * O EDUCADOR ACOMPANHANTE é a exceção, e ela é do bom senso: quem foi
 * designado para ficar com a criança no hospital precisa escrever o relato do
 * dia. Ele alcança a internação DELE, e nenhuma outra.
 */
/*
 * ESTA FUNÇÃO É PARA AS TABELAS FILHAS, e não para `hospitalization`.
 *
 * A política de leitura da própria `hospitalization` está escrita sobre as
 * COLUNAS da linha (ver `int_select`, abaixo), e não sobre uma consulta à
 * tabela. A diferença custou uma hora de investigação:
 *
 * `INSERT ... RETURNING` exige poder LER a linha recém-criada. Se a política
 * de leitura consulta a mesma tabela, a subconsulta enxerga o instantâneo
 * ANTERIOR ao comando — onde a linha ainda não existe. A resposta é sempre
 * "não", e a recusa chega como "new row violates row-level security policy",
 * que manda procurar na política de INSERT, onde não há nada errado.
 *
 * `SECURITY DEFINER` não resolve isso: o problema não é privilégio, é
 * visibilidade dentro do mesmo comando.
 *
 * Aqui ela continua servindo às filhas — diário, medicação e acompanhante —,
 * onde a consulta é a OUTRA tabela, e o instantâneo já a contém.
 */
CREATE OR REPLACE FUNCTION app_pode_ver_internacao(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    CASE
      WHEN app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral',
                                  'lider_diurno','lider_noturno_geral','enfermagem')
        THEN EXISTS (SELECT 1 FROM hospitalization h
                      WHERE h.id = p_id AND app_house_in_scope(h.house_id))
      ELSE EXISTS (SELECT 1 FROM hospitalization_companion c
                    WHERE c.hospitalization_id = p_id
                      AND c.user_id = app_current_user())
    END;
$$;

/*
 * A CRIANÇA ESTÁ INTERNADA NESTE DIA?
 *
 * É esta função que tira a criança da linha do dia. Ela responde por DIA, e
 * não por "agora": a chamada do almoço de ontem, reaberta hoje para
 * correção, precisa saber como o mundo estava ontem — e não como está agora.
 *
 * `SECURITY DEFINER` porque ela é chamada de dentro de consultas que rodam
 * sob RLS, e o educador — que não lê a internação — precisa mesmo assim que a
 * criança suma da chamada dele. Ele não descobre por que sumiu; descobre que
 * não é com ele.
 */
CREATE OR REPLACE FUNCTION app_esta_internado(p_person uuid, p_dia date DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM hospitalization h
     WHERE h.person_id = p_person
       AND (h.started_at AT TIME ZONE 'America/Sao_Paulo')::date
           <= coalesce(p_dia, app_hoje())
       /*
        * O DIA DA ALTA É DIA DE CASA.
        *
        * A criança que recebe alta às dez da manhã almoça aqui, janta aqui e
        * dorme aqui. Contar o dia da alta como internada a deixaria invisível
        * na chamada do próprio dia em que voltou — e a equipe que a recebeu
        * de volta não teria onde registrar que ela comeu.
        *
        * O contrário, no dia da ENTRADA, é assumido: a criança internada às
        * três da tarde sai da lista do dia inteiro. O que já foi registrado
        * de manhã não some (o `UNION` da chamada garante isso); o que não foi
        * registrado deixa de ser cobrado.
        */
       AND (h.ended_at IS NULL
            OR (h.ended_at AT TIME ZONE 'America/Sao_Paulo')::date
               > coalesce(p_dia, app_hoje()))
  );
$$;

REVOKE ALL ON FUNCTION app_esta_internado(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_esta_internado(uuid, date) TO rede_app;
GRANT EXECUTE ON FUNCTION app_pode_ver_internacao(uuid) TO rede_app;

ALTER TABLE hospitalization ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitalization_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitalization_medication ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitalization_companion ENABLE ROW LEVEL SECURITY;

-- Sobre as COLUNAS da linha, nunca sobre uma consulta à própria tabela.
CREATE POLICY int_select ON hospitalization FOR SELECT TO rede_app
  USING (
    CASE
      WHEN app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral',
                                  'lider_diurno','lider_noturno_geral','enfermagem')
        THEN app_house_in_scope(house_id)
      ELSE EXISTS (SELECT 1 FROM hospitalization_companion c
                    WHERE c.hospitalization_id = hospitalization.id
                      AND c.user_id = app_current_user())
    END);

-- Abrir e fechar é da técnica e da coordenação — a resposta foi direta.
CREATE POLICY int_insert ON hospitalization FOR INSERT TO rede_app
  WITH CHECK (app_house_in_scope(house_id)
              AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));
CREATE POLICY int_update ON hospitalization FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id)
         AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));

CREATE POLICY intnota_select ON hospitalization_note FOR SELECT TO rede_app
  USING (app_pode_ver_internacao(hospitalization_id));
-- Escrever o relato do dia é de quem está lá: o acompanhante também escreve.
CREATE POLICY intnota_insert ON hospitalization_note FOR INSERT TO rede_app
  WITH CHECK (app_pode_ver_internacao(hospitalization_id));

CREATE POLICY intmed_select ON hospitalization_medication FOR SELECT TO rede_app
  USING (app_pode_ver_internacao(hospitalization_id));
CREATE POLICY intmed_insert ON hospitalization_medication FOR INSERT TO rede_app
  WITH CHECK (app_pode_ver_internacao(hospitalization_id));

CREATE POLICY intacomp_select ON hospitalization_companion FOR SELECT TO rede_app
  USING (app_pode_ver_internacao(hospitalization_id));
CREATE POLICY intacomp_insert ON hospitalization_companion FOR INSERT TO rede_app
  WITH CHECK (app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));
CREATE POLICY intacomp_update ON hospitalization_companion FOR UPDATE TO rede_app
  USING (app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));

GRANT SELECT, INSERT, UPDATE ON hospitalization TO rede_app;
GRANT SELECT, INSERT ON hospitalization_note TO rede_app;
GRANT SELECT, INSERT ON hospitalization_medication TO rede_app;
GRANT SELECT, INSERT, UPDATE ON hospitalization_companion TO rede_app;

-- Nada disto se apaga. Internação encerrada é história de saúde da criança, e
-- relato de um dia no hospital é o que sobra daquele dia.
CREATE OR REPLACE FUNCTION app_internacao_nao_e_apagada() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'internacao_nao_e_apagada';
END $$;

CREATE TRIGGER trg_int_sem_delete BEFORE DELETE ON hospitalization
  FOR EACH ROW EXECUTE FUNCTION app_internacao_nao_e_apagada();
CREATE TRIGGER trg_intnota_sem_delete BEFORE DELETE ON hospitalization_note
  FOR EACH ROW EXECUTE FUNCTION app_internacao_nao_e_apagada();
CREATE TRIGGER trg_intmed_sem_delete BEFORE DELETE ON hospitalization_medication
  FOR EACH ROW EXECUTE FUNCTION app_internacao_nao_e_apagada();
