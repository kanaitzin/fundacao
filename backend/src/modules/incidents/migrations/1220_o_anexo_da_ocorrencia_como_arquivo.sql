-- ============================================================================
-- O ANEXO DA OCORRÊNCIA PASSA A PODER SER O ARQUIVO — sem deixar de poder ser
-- a referência.
--
-- A varredura da fase 106 (§9, item 6) encontrou três anexos que guardavam um
-- CAMINHO e não um documento: o da ocorrência, a receita e a nota fiscal. Na
-- ocorrência isso aparecia na tela com todas as letras — "o sistema não abre o
-- arquivo: ele diz ONDE ele está, no Drive da instituição". Quem abrisse
-- recebia um caminho de pasta, e o laudo do hospital ou a foto autorizada
-- continuavam a um login de distância, numa pasta compartilhada que é
-- exatamente o lugar onde o sigilo vaza sem ninguém decidir nada.
--
-- AS DUAS FORMAS CONVIVEM, E A DECISÃO É DA CASA, ANEXO A ANEXO.
--
-- Obrigar o arquivo apagaria o caso real de quem já tem o documento no Drive
-- institucional e não vai digitalizar de novo; obrigar a referência mantém o
-- defeito. Então: `storage_key` guarda os bytes (o mesmo `ARQUIVOS_DIR` do
-- dossiê), `storage_ref` continua guardando o caminho — e o CHECK abaixo exige
-- **pelo menos um dos dois**. Anexo com nenhum dos dois é uma linha que promete
-- um documento que ninguém alcança, e era isso que o `NOT NULL` do
-- `storage_ref` escondia: ele garantia um texto, não um documento.
--
-- O que NÃO muda: quem abre um anexo restrito continua passando pelo comando
-- que REGISTRA ANTES de devolver. Ter o arquivo dentro não afrouxa nada — ao
-- contrário, agora o registro cobre a leitura de verdade, e não a de um
-- caminho.
-- ============================================================================

ALTER TABLE incident_attachment
  ADD COLUMN IF NOT EXISTS storage_key text,     -- os bytes, em ARQUIVOS_DIR
  ADD COLUMN IF NOT EXISTS mime        text,     -- tipo REAL, lido da assinatura
  ADD COLUMN IF NOT EXISTS file_name   text,     -- nome neutro, já validado
  ADD COLUMN IF NOT EXISTS size_bytes  integer,
  ADD COLUMN IF NOT EXISTS sha256      text;

-- `storage_ref` deixa de ser obrigatório: quem sobe o arquivo não tem caminho
-- no Drive para escrever, e escrever um caminho falso para satisfazer a coluna
-- é pior do que não ter coluna.
ALTER TABLE incident_attachment ALTER COLUMN storage_ref DROP NOT NULL;

-- Um dos dois, sempre. As linhas que já existem têm `storage_ref` preenchido
-- (era NOT NULL até esta migração), então nenhuma reprova aqui.
ALTER TABLE incident_attachment
  DROP CONSTRAINT IF EXISTS anexo_tem_onde_estar;
ALTER TABLE incident_attachment
  ADD CONSTRAINT anexo_tem_onde_estar
  CHECK (storage_key IS NOT NULL OR storage_ref IS NOT NULL);

-- ============================================================================
-- E O COMANDO QUE ABRE PASSA A DEVOLVER O ARQUIVO.
--
-- `app_open_attachment` já era o único caminho: a aplicação NÃO tem privilégio
-- de ler `storage_ref` na tabela, e a função REGISTRA ANTES de devolver. Os
-- bytes entram pela mesma porta, e por isso `storage_key` nasce com a mesma
-- restrição — abrir um laudo de criança não pode ser um SELECT.
--
-- É DROP e CREATE, e não CREATE OR REPLACE, porque o tipo de retorno muda.
-- E o `SET search_path` vai escrito por extenso: redefinir uma função APAGA o
-- `SET` que ela tinha (§4.3), e a 1200 não volta para pôr de novo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- OS PRIVILÉGIOS DAS COLUNAS NOVAS.
--
-- `incident_attachment` é concedida COLUNA A COLUNA desde a 0320 — e coluna
-- nova não herda nada: sem estas linhas, a aplicação nem lê nem escreve o que
-- acabou de ser criado, e a tela responde 500 sem dizer por quê. Foi o que
-- aconteceu na primeira rodada desta fase, e está escrito porque a próxima
-- coluna vai cair na mesma pedra.
--
-- `storage_key` recebe INSERT e NÃO recebe SELECT, exatamente como
-- `storage_ref`: a chave do objeto sai pela função que registra a abertura, e
-- não por consulta. `mime`, `file_name` e `size_bytes` são metadado — a tela
-- precisa saber que HÁ arquivo para oferecer o botão certo.
--
-- E A SINTAXE IMPORTA, num jeito que não avisa: `GRANT SELECT, INSERT (mime)`
-- concede SELECT DA TABELA INTEIRA e INSERT da coluna. A lista de colunas vale
-- para o privilégio que vem ANTES dela, e o `SELECT` solto vira concessão de
-- tabela — inclusive de `storage_ref`, que a 0320 tinha deixado de fora de
-- propósito. Escrito assim, a coluna aparece nos dois lados.
-- *Quem pegou foi o teste que afirma que o educador NÃO lê `storage_ref`, e
-- ele estava lendo.*
GRANT INSERT (storage_key) ON incident_attachment TO rede_app;
GRANT SELECT (mime),       INSERT (mime)       ON incident_attachment TO rede_app;
GRANT SELECT (file_name),  INSERT (file_name)  ON incident_attachment TO rede_app;
GRANT SELECT (size_bytes), INSERT (size_bytes) ON incident_attachment TO rede_app;
GRANT SELECT (sha256),     INSERT (sha256)     ON incident_attachment TO rede_app;

DROP FUNCTION IF EXISTS app_open_attachment(uuid, text);

CREATE FUNCTION app_open_attachment(p_id uuid, p_purpose text)
RETURNS TABLE (out_ref text, out_kind text, out_name text,
               out_key text, out_mime text, out_file_name text) AS $$
DECLARE v_me uuid; v_role role_code; v_a incident_attachment%ROWTYPE;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_a FROM incident_attachment WHERE id = p_id;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'anexo_inexistente'; END IF;
  IF NOT app_house_in_scope(v_a.house_id) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;

  IF v_a.restricted THEN
    IF coalesce(length(btrim(p_purpose)), 0) < 15 THEN RAISE EXCEPTION 'finalidade_insuficiente'; END IF;
    IF NOT (v_role IN ('equipe_tecnica','coordenador')
            OR v_a.author_id = v_me
            OR (v_role = 'enfermagem' AND v_a.kind = 'documento_medico')) THEN
      RAISE EXCEPTION 'anexo_restrito';
    END IF;
  END IF;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose, detail)
  VALUES (v_a.house_id, v_me, 'incident.attachment_open', 'incident_attachment', p_id,
          nullif(btrim(p_purpose), ''),
          jsonb_build_object('tipo', v_a.kind, 'restrito', v_a.restricted,
                             'forma', CASE WHEN v_a.storage_key IS NOT NULL
                                           THEN 'arquivo' ELSE 'referencia' END));

  RETURN QUERY SELECT v_a.storage_ref, v_a.kind, v_a.display_name,
                      v_a.storage_key, v_a.mime, v_a.file_name;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_open_attachment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_open_attachment(uuid, text) TO rede_app;
