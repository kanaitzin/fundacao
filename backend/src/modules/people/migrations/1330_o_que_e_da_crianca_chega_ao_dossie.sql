-- ============================================================
-- 1330 — O que é da criança chega ao dossiê dela
--
-- A regra que a Fundação escreveu em 15/09, e que vale para o sistema inteiro:
--
--   *"Se a enfermagem já faz isso cair no perfil da criança, todos os outros
--   lugares onde a gente preenche, seja almoço, seja outras coisas, os dados
--   individuais de cada criança mesmo no coletivo, têm que ir individual para
--   cada um no seu registro e vivência na casa."*
--
-- E o pedido concreto: *"se elas quiserem botar alguma bula, alguma receita,
-- alguma coisa ali pela enfermagem, que já caia direto no perfil da criança."*
--
-- ---
--
-- O DEFEITO, MEDIDO
--
-- A receita digitalizada vive em `prescription_document`, presa à prescrição,
-- na tela de Saúde. O anexo do diário de internação vive em
-- `hospitalization_note`. **Nenhuma das duas cria linha em `document`** — e o
-- dossiê só lê `document`. Quem abre a pasta da criança não encontra a receita
-- que a Enfermagem anexou na semana passada, e nem sabe que ela existe.
--
-- Não é que o dado esteja perdido: ele está guardado, com autor e hora, na
-- tela onde nasceu. O que falta é ele CHEGAR onde a criança é procurada.
--
-- ---
--
-- UMA CORREÇÃO AO MEU PRÓPRIO LEVANTAMENTO
--
-- O §9 dizia *"é o mesmo defeito, três vezes"*, contando a **nota fiscal** do
-- medicamento junto. Ao construir, medi de novo: `medication_purchase` tem
-- `house_id` e **não tem pessoa**. A nota fiscal é uma compra da CASA — o
-- remédio comprado serve a quem precisar dele —, e espelhá-la no dossiê de uma
-- criança seria inventar um vínculo que o dado não tem, e pôr uma despesa da
-- casa no prontuário de alguém. São duas vezes, não três. O §9 foi corrigido.
--
-- ---
--
-- O ESPELHO, E O QUE ELE NÃO É
--
-- `app_espelhar_no_dossie` cria a linha em `document` apontando para o **mesmo
-- objeto guardado** — mesmo `storage_key`, mesmo sha. Não há cópia do arquivo:
-- duas cópias divergem no dia em que alguém substituir uma delas, e a segunda
-- continuaria parecendo verdadeira.
--
-- **É idempotente por `mirror_of`.** Sem isso, cada reprocessamento — uma fila
-- offline reenviada, um clique duplo no fim de um turno de doze horas — criaria
-- um documento novo, e a pasta da criança encheria de receitas repetidas que
-- ninguém consegue distinguir.
--
-- **Ele chega CONFERIDO, e isto é decisão escrita.** O rito do aceite no
-- dossiê é *"eu olhei e digo que é este documento, desta criança, e que está
-- legível"*. Quem anexou a receita à prescrição fez exatamente isso: escolheu
-- o arquivo, viu a prévia, e a prescrição já é de uma criança nomeada — o "é
-- desta criança" está garantido pela estrutura, não por confiança. Deixar o
-- espelho aguardando conferência criaria trabalho para um documento que alguém
-- já olhou, e o contador de "falta conferir" da casa passaria a subir sozinho
-- a cada prescrição. Contador que sobe sozinho é contador que a equipe aprende
-- a ignorar — e aí o documento que REALMENTE falta conferir some no meio.
--
-- A nota do aceite diz de onde ele veio, para ninguém achar que apareceu do
-- nada.
-- ============================================================

-- De onde este documento foi espelhado. Nulo em tudo o que foi anexado
-- direto no dossiê, que é a maioria.
ALTER TABLE document
  ADD COLUMN IF NOT EXISTS mirror_of text;

COMMENT ON COLUMN document.mirror_of IS
  'Quando este documento é o ESPELHO de um arquivo que nasceu em outra tela — '
  'a receita da prescrição, o anexo do diário de internação —, a origem no '
  'formato "tabela:id". É por ela que o espelho é idempotente: reprocessar a '
  'fila offline não enche a pasta da criança de receitas repetidas.';

-- Um espelho por origem. Parcial porque `mirror_of` é nulo na maioria.
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_espelho
  ON document (mirror_of) WHERE mirror_of IS NOT NULL;

-- ------------------------------------------------------------
-- O ESPELHO
--
-- Mora em `people` porque `document` é de `people`, e é chamada de fora: as
-- partições `medications` e `nursing` já declaram `dependeDoEsquemaDe: people`
-- e não escrevem na tabela — elas pedem.
--
-- Devolve o id do documento, existindo ou recém-criado. Quem chama não precisa
-- saber qual dos dois foi.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_espelhar_no_dossie(
  p_person uuid, p_categoria text, p_chave text, p_titulo text,
  p_origem text, p_mirror text,
  p_storage text, p_sha text, p_mime text, p_nome text,
  p_emitido_em date DEFAULT NULL)
RETURNS TABLE (documento_id uuid, criado boolean) AS $$
DECLARE v_id uuid; v_novo boolean := false;
BEGIN
  IF p_person IS NULL OR p_storage IS NULL OR p_mirror IS NULL THEN
    RAISE EXCEPTION 'espelho_sem_origem' USING ERRCODE = 'check_violation';
  END IF;

  /*
   * NENHUMA CONFERÊNCIA DE CARGO AQUI, e a razão é o chamador.
   *
   * Esta função não é uma porta: ela é chamada DEPOIS de a tela de origem já
   * ter conferido quem pode anexar uma receita ou escrever no diário. Repetir
   * a conferência aqui obrigaria esta função a conhecer as regras das outras
   * duas telas — e é assim que duas listas de cargos começam a divergir.
   *
   * O que ela confere é o ALCANCE DA CRIANÇA, que é dela mesma: um espelho não
   * pode pôr documento no dossiê de quem quem chamou não alcança.
   */
  IF NOT app_person_in_scope(p_person) THEN
    RAISE EXCEPTION 'pessoa_fora_de_escopo' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT d.id INTO v_id FROM document d WHERE d.mirror_of = p_mirror;

  IF v_id IS NULL THEN
    INSERT INTO document (person_id, category, title, checklist_key, issued_on,
                          source, mirror_of, created_by,
                          /* Conferido por quem anexou na tela de origem: ela
                             olhou o arquivo e a prescrição já é de uma criança
                             nomeada. Ver o cabeçalho desta migração. */
                          accepted_at, accepted_by, accepted_note)
    VALUES (p_person, p_categoria::doc_category, btrim(p_titulo),
            nullif(btrim(coalesce(p_chave, '')), ''), p_emitido_em,
            btrim(p_origem), p_mirror, app_current_user(),
            now(), app_current_user(),
            'Conferida na tela de origem, por quem anexou: ' || btrim(p_origem))
    RETURNING id INTO v_id;
    v_novo := true;

    /* O MESMO objeto, e não uma cópia: duas cópias divergem no dia em que
       alguém substituir uma delas, e a segunda continuaria parecendo
       verdadeira. */
    INSERT INTO document_version (document_id, version, storage_key, sha256,
                                  mime, file_name, created_by)
    VALUES (v_id, 1, p_storage, p_sha, p_mime, p_nome, app_current_user());
  END IF;

  RETURN QUERY SELECT v_id, v_novo;
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_espelhar_no_dossie(uuid,text,text,text,text,text,text,text,text,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_espelhar_no_dossie(uuid,text,text,text,text,text,text,text,text,text,date) TO rede_app;
