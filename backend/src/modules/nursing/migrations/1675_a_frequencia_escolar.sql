-- A FREQUÊNCIA ESCOLAR (fase 283, primeira avaliação humana de 05/11, módulo 07;
-- decidido pela pessoa da Fundação em 06/11: o educador marca no Dia da Casa, e a
-- técnica e a coordenação corrigem depois com o retorno da escola, com o motivo e o
-- comprovante).
--
-- "Não presumir automaticamente falta injustificada: diferenciar ausência
-- informada, presença confirmada e ausência ainda não verificada." Por isso a
-- falta não existe como estado: o dia de aula sem marca é AINDA NÃO VERIFICADO, e
-- quem não foi tem o motivo informado. E o dia em que não houve aula (feriado,
-- recesso, suspensão) é marcado como tal, com o motivo, e sai da conta.
--
--  * uma marca viva por vínculo e dia; corrigir é outra linha que aponta para a
--    anterior, que ganha `replaced_at` e continua legível com o nome de quem marcou;
--  * o educador e os líderes marcam hoje e ontem (a noite fecha o dia depois da
--    meia-noite), e não corrigem o que já foi marcado;
--  * a técnica e a coordenação marcam qualquer dia do vínculo e corrigem, sempre
--    com o motivo, e podem juntar o comprovante (foto ou PDF);
--  * o dia precisa ser um dia de aula do vínculo (os dias da semana dele), dentro
--    do começo e do encerramento; o vínculo de horário variável aceita qualquer dia.

CREATE TABLE IF NOT EXISTS education_attendance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id         uuid NOT NULL REFERENCES education_link(id),
  person_id       uuid NOT NULL REFERENCES person(id),
  house_id        uuid NOT NULL REFERENCES house(id),
  on_date         date NOT NULL,
  status          text NOT NULL CHECK (status IN ('presente','ausente','sem_aula')),
  reason          text,
  proof_key       text,
  proof_sha256    text,
  proof_mime      text,
  proof_name      text,
  proof_size      integer CHECK (proof_size IS NULL OR proof_size > 0),
  replaces_id     uuid REFERENCES education_attendance(id),
  replaced_at     timestamptz,
  correction_reason text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL REFERENCES app_user(id),
  CONSTRAINT frequencia_ausencia_tem_motivo
    CHECK (status = 'presente' OR length(btrim(coalesce(reason, ''))) >= 3),
  CONSTRAINT frequencia_correcao_tem_motivo
    CHECK (replaces_id IS NULL OR length(btrim(coalesce(correction_reason, ''))) >= 5),
  CONSTRAINT frequencia_comprovante_inteiro
    CHECK ((proof_key IS NULL) = (proof_sha256 IS NULL) AND (proof_key IS NULL) = (proof_mime IS NULL)
           AND (proof_key IS NULL) = (proof_name IS NULL) AND (proof_key IS NULL) = (proof_size IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_education_attendance_viva
  ON education_attendance (link_id, on_date) WHERE replaced_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_education_attendance_vinculo ON education_attendance (link_id, on_date DESC);
CREATE INDEX IF NOT EXISTS ix_education_attendance_pessoa ON education_attendance (person_id);
CREATE INDEX IF NOT EXISTS ix_education_attendance_casa ON education_attendance (house_id, on_date);
CREATE INDEX IF NOT EXISTS ix_education_attendance_substitui ON education_attendance (replaces_id);
CREATE INDEX IF NOT EXISTS ix_education_attendance_quem ON education_attendance (created_by);

ALTER TABLE education_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY edatt_select ON education_attendance FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
GRANT SELECT ON education_attendance TO rede_app;
REVOKE INSERT, UPDATE, DELETE ON education_attendance FROM rede_app;
COMMENT ON TABLE education_attendance IS
  'A frequência de um vínculo educacional, dia a dia: foi, não foi com o motivo informado, ou não teve aula (fase 283). Sem marca é ainda não verificado, nunca falta. Corrigir é outra linha; nada se apaga.';

/* MARCAR (ou corrigir) a frequência de um dia. Devolve a casa, para a auditoria. */
CREATE OR REPLACE FUNCTION app_marcar_frequencia(
  p_link uuid, p_dia date, p_status text, p_motivo text, p_correcao text, p_anexo jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v education_link%ROWTYPE; v_role text; v_viva education_attendance%ROWTYPE;
  v_corrige boolean; v_id uuid;
BEGIN
  v_role := app_current_role()::text;
  IF v_role NOT IN ('educador','lider_diurno','lider_noturno_geral','equipe_tecnica','coordenador') THEN
    RAISE EXCEPTION 'sem_permissao_frequencia';
  END IF;
  SELECT * INTO v FROM education_link WHERE id = p_link;
  IF v.id IS NULL OR NOT app_house_in_scope(v.house_id) THEN RAISE EXCEPTION 'vinculo_inexistente'; END IF;
  IF p_dia IS NULL OR p_dia > app_hoje() THEN RAISE EXCEPTION 'dia_no_futuro'; END IF;
  IF p_dia < v.starts_on OR (v.ended_on IS NOT NULL AND p_dia > v.ended_on) THEN
    RAISE EXCEPTION 'dia_fora_do_vinculo';
  END IF;
  IF coalesce(v.shift, '') <> 'variavel'
     AND NOT (extract(isodow FROM p_dia)::smallint = ANY (v.weekdays)) THEN
    RAISE EXCEPTION 'dia_sem_aula_no_vinculo';
  END IF;
  IF p_status NOT IN ('presente','ausente','sem_aula') THEN RAISE EXCEPTION 'situacao_invalida'; END IF;
  IF p_status <> 'presente' AND length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'motivo_curto'; END IF;

  SELECT * INTO v_viva FROM education_attendance
   WHERE link_id = v.id AND on_date = p_dia AND replaced_at IS NULL FOR UPDATE;
  v_corrige := v_viva.id IS NOT NULL;
  IF v_role IN ('educador','lider_diurno','lider_noturno_geral') THEN
    IF v_corrige THEN RAISE EXCEPTION 'frequencia_ja_marcada'; END IF;
    IF p_dia < app_hoje() - 1 THEN RAISE EXCEPTION 'dia_antigo_para_o_plantao'; END IF;
  END IF;
  IF v_corrige AND length(btrim(coalesce(p_correcao, ''))) < 5 THEN RAISE EXCEPTION 'correcao_sem_motivo'; END IF;

  -- A anterior deixa de ser a viva ANTES: o índice da marca viva é parcial e único.
  IF v_corrige THEN
    UPDATE education_attendance SET replaced_at = now() WHERE id = v_viva.id;
  END IF;
  INSERT INTO education_attendance (link_id, person_id, house_id, on_date, status, reason,
                                    proof_key, proof_sha256, proof_mime, proof_name, proof_size,
                                    replaces_id, correction_reason, created_by)
  VALUES (v.id, v.person_id, v.house_id, p_dia, p_status,
          CASE WHEN p_status = 'presente' THEN nullif(btrim(coalesce(p_motivo, '')), '') ELSE btrim(p_motivo) END,
          p_anexo->>'chave', p_anexo->>'sha256', p_anexo->>'mime', p_anexo->>'nome',
          (p_anexo->>'tamanho')::integer,
          v_viva.id, CASE WHEN v_corrige THEN btrim(p_correcao) END, app_current_user())
  RETURNING id INTO v_id;
  RETURN v.house_id;
END $$;
REVOKE ALL ON FUNCTION app_marcar_frequencia(uuid, date, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_marcar_frequencia(uuid, date, text, text, text, jsonb) TO rede_app;
