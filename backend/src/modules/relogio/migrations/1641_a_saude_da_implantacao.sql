-- A SAÚDE DA IMPLANTAÇÃO (fase 185, ideia 9 de 30/09; quem vê decidido em 05/10).
--
-- O que roda sozinho no servidor não tem tela: o backup da madrugada, a
-- restauração conferida, o relógio das 5h, o aviso de meia hora antes do fim
-- do plantão, o e-mail do convite. Quando um deles para, ninguém percebe até
-- a casa dizer que o remédio sumiu da tela. Esta tabela é onde cada um deixa
-- dito que rodou, e como terminou.
--
-- SÓ METADADO. Nunca o endereço de e-mail, nunca o corpo, nunca o caminho de
-- um arquivo de criança: o tipo, se deu certo, e números (quantas casas,
-- quantas rotinas, quantos MB). A função que anota recusa detalhe grande, que
-- é como um texto inteiro entraria aqui por engano.
--
-- Quem lê: a conta técnica, o Gestor Geral e a Coordenação Geral. Nada aqui
-- é de uma casa; é do servidor.

CREATE TABLE implantacao_evento (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo     text NOT NULL CHECK (tipo IN ('backup', 'restauracao', 'relogio', 'fim_do_plantao', 'email')),
  ok       boolean NOT NULL,
  em       timestamptz NOT NULL DEFAULT now(),
  detalhe  jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_implantacao_evento ON implantacao_evento (tipo, em DESC);

ALTER TABLE implantacao_evento ENABLE ROW LEVEL SECURITY;
-- Ninguém escreve direto: só a função abaixo. E ninguém lê direto: a tela lê
-- pela função de leitura, que confere o cargo.
REVOKE ALL ON implantacao_evento FROM rede_app;

-- Nada se apaga nem se reescreve: um backup que falhou continua tendo falhado.
CREATE OR REPLACE FUNCTION app_implantacao_evento_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'registro_imutavel' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER trg_implantacao_evento_imutavel BEFORE UPDATE OR DELETE ON implantacao_evento
  FOR EACH ROW EXECUTE FUNCTION app_implantacao_evento_imutavel();

/*
 * ANOTAR. Chamada pelo servidor (relógio, aviso do fim do plantão, e-mail) e
 * pelos scripts do servidor (backup, restauração). Não tem rota: quem a chama
 * já está dentro do servidor.
 */
CREATE OR REPLACE FUNCTION app_anotar_implantacao(p_tipo text, p_ok boolean, p_detalhe jsonb DEFAULT '{}'::jsonb)
RETURNS void AS $$
BEGIN
  IF length(coalesce(p_detalhe, '{}'::jsonb)::text) > 1000 THEN
    RAISE EXCEPTION 'detalhe_grande_demais' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO implantacao_evento (tipo, ok, detalhe)
  VALUES (p_tipo, p_ok, coalesce(p_detalhe, '{}'::jsonb));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_anotar_implantacao(text, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_anotar_implantacao(text, boolean, jsonb) TO rede_app;

/*
 * LER. Para cada tipo, o último evento, o último que deu certo e as falhas
 * dos últimos sete dias; e a fila do Drive em CONTAGENS, sem nome de arquivo.
 * O estado (em dia, atenção, parado) é decidido no serviço, num lugar só.
 */
CREATE OR REPLACE FUNCTION app_saude_da_implantacao() RETURNS jsonb AS $$
DECLARE
  v_inst uuid;
  v_eventos jsonb;
  v_drive jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app_user u
     WHERE u.id = app_current_user() AND u.active
       AND (u.role IN ('admin_tecnico', 'gestor_geral')
            OR (u.role = 'coordenador' AND u.todas_as_casas))
  ) THEN
    RAISE EXCEPTION 'sem_permissao_implantacao' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT institution_id INTO v_inst FROM app_user WHERE id = app_current_user();

  SELECT coalesce(jsonb_object_agg(t.tipo, jsonb_build_object(
           'ultimo', (SELECT jsonb_build_object('em', e.em, 'ok', e.ok, 'detalhe', e.detalhe)
                        FROM implantacao_evento e WHERE e.tipo = t.tipo ORDER BY e.em DESC LIMIT 1),
           'ultimoOk', (SELECT max(e.em) FROM implantacao_evento e WHERE e.tipo = t.tipo AND e.ok),
           'falhas7d', (SELECT count(*) FROM implantacao_evento e
                         WHERE e.tipo = t.tipo AND NOT e.ok AND e.em > now() - interval '7 days'))),
         '{}'::jsonb)
    INTO v_eventos
    FROM (VALUES ('backup'), ('restauracao'), ('relogio'), ('fim_do_plantao'), ('email')) AS t(tipo);

  SELECT jsonb_build_object(
           'aguardando', count(*) FILTER (WHERE a.status IN ('aguardando', 'enviando')),
           'falhou', count(*) FILTER (WHERE a.status = 'falhou'),
           'maisAntigoAguardando', min(a.fechado_em) FILTER (WHERE a.status IN ('aguardando', 'enviando')),
           'ultimoEnviado', max(a.enviado_em))
    INTO v_drive
    FROM archive_item a
   WHERE a.house_id IS NULL
      OR a.house_id IN (SELECT h.id FROM house h WHERE h.institution_id = v_inst);

  RETURN jsonb_build_object('agora', now(), 'eventos', v_eventos, 'drive', v_drive);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_saude_da_implantacao() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_saude_da_implantacao() TO rede_app;
