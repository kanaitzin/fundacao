-- NADA SE PERDE NO SERVIDOR DO PÃO (fase 220, decisão de 14/10: "não quero
-- perder nada, tudo tem que ficar salvo; o Pão tem um servidor próprio").
--
-- O backup da madrugada devolve o banco de 3h da manhã. Para nada se perder,
-- o servidor passa a ter o arquivo contínuo do banco (cada trecho do diário vai
-- para o segundo disco, no máximo um minuto depois), a base semanal de onde a
-- restauração parte, e a cópia das fotos e documentos de cinco em cinco
-- minutos (scripts/arquivar-wal.sh, base-do-banco.sh, copiar-arquivos.sh;
-- §12.4.1). Os três correm sozinhos, e o que corre sozinho e para em silêncio
-- é o pior defeito de um backup: por isso entram na saúde da implantação.
--
-- A base e a cópia anotam como os outros (`app_anotar_implantacao`). O
-- arquivo contínuo não anota: quem sabe dele é o próprio Postgres
-- (`pg_stat_archiver`), lido aqui.

ALTER TABLE implantacao_evento DROP CONSTRAINT implantacao_evento_tipo_check;
ALTER TABLE implantacao_evento ADD CONSTRAINT implantacao_evento_tipo_check
  CHECK (tipo IN ('backup', 'restauracao', 'relogio', 'fim_do_plantao', 'email', 'base', 'copia_arquivos'));

CREATE OR REPLACE FUNCTION app_saude_da_implantacao() RETURNS jsonb AS $$
DECLARE
  v_inst uuid;
  v_eventos jsonb;
  v_drive jsonb;
  v_arquivo jsonb;
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
    FROM (VALUES ('backup'), ('restauracao'), ('relogio'), ('fim_do_plantao'), ('email'),
                 ('base'), ('copia_arquivos')) AS t(tipo);

  SELECT jsonb_build_object(
           'aguardando', count(*) FILTER (WHERE a.status IN ('aguardando', 'enviando')),
           'falhou', count(*) FILTER (WHERE a.status = 'falhou'),
           'maisAntigoAguardando', min(a.fechado_em) FILTER (WHERE a.status IN ('aguardando', 'enviando')),
           'ultimoEnviado', max(a.enviado_em))
    INTO v_drive
    FROM archive_item a
   WHERE a.house_id IS NULL
      OR a.house_id IN (SELECT h.id FROM house h WHERE h.institution_id = v_inst);

  /* O arquivo contínuo, lido do próprio Postgres: se está ligado, o último
     trecho guardado e a última falha. Só instantes e contagem. */
  SELECT jsonb_build_object(
           'ligado', current_setting('archive_mode') IN ('on', 'always'),
           'ultimoArquivado', a.last_archived_time,
           'ultimaFalha', a.last_failed_time,
           'falhas', a.failed_count)
    INTO v_arquivo
    FROM pg_stat_archiver a;

  RETURN jsonb_build_object('agora', now(), 'eventos', v_eventos, 'drive', v_drive,
                            'arquivo', v_arquivo);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_saude_da_implantacao() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_saude_da_implantacao() TO rede_app;
