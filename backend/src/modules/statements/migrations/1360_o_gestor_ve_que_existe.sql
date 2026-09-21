-- ---------------------------------------------------------------------------
-- O QUE O GESTOR GERAL VÊ ANTES DE ABRIR UM RELATO RESTRITO: A CONTAGEM.
--
-- Decisão de 20/09/2026, respondendo ao §10 item 6, que estava aberto desde
-- 13/09 e que eu me recusei a decidir sozinho — inventar isso seria decidir
-- quanto da narrativa de uma criança vaza antes da justificativa.
--
-- **Só a contagem**, e vale o mesmo precedente dos documentos: *"existem 3
-- documentos em área restrita"* é honesto, e esconder que existem faria a
-- equipe procurar noutro lugar. Nem data, nem autor, nem trecho: ele sabe que
-- há o que pedir, e não sabe de quê nem de quando antes de escrever a
-- finalidade. A leitura em si continua sendo o comando do §26.2, que registra
-- ANTES de devolver o conteúdo.
--
-- E ISTO DESTRAVA A SEGUNDA COISA: `statement.person_id` era gravado e nunca
-- lido por pessoa. O §9 o manteve fechado por esta mesma pergunta, porque
-- listar por criança tudo o que se escreveu SOBRE ela é exatamente a narrativa
-- que o §26.2 protege. Com a contagem decidida, a lista pode existir: quem
-- alcança lê, quem não alcança vê o número.
--
-- ---------------------------------------------------------------------------
-- A REGRA DE QUEM LÊ UM RELATO PASSA A MORAR NUM LUGAR SÓ.
--
-- É a lição da fase 127, aplicada antes de doer. A regra já estava escrita
-- DUAS vezes — a `0300` a criou na policy e a `0730` teve de reescrevê-la
-- inteira só para acrescentar dois cargos —, e esta migração precisaria de uma
-- TERCEIRA cópia para contar o que o cargo NÃO lê. Três cópias da mesma regra
-- em três migrações é como a chamada passou a cobrar uma criança que estava no
-- hospital: alguém acrescenta uma situação num lugar e não nos outros.
--
-- Então `app_pode_ler_relato` passa a ser a resposta única, e tem DOIS
-- leitores: a policy (que decide quais linhas existem) e a contagem (que
-- conta as que não existem para quem pergunta). Cargo novo, ou regra nova de
-- alcance, se escreve aqui dentro, uma vez.
--
-- NÃO é `SECURITY DEFINER`: ela não lê tabela nenhuma: só o papel e o usuário
-- da sessão, e o `app_house_in_scope`, que já é definer e guarda o escopo por
-- dentro. Definer aqui não daria nada e esconderia o que a função faz.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_pode_ler_relato(
  p_author uuid, p_restricted boolean, p_house uuid) RETURNS boolean AS $$
  SELECT
    -- Quem escreveu lê o que escreveu, sempre.
    p_author = app_current_user()
    -- O acompanhamento técnico, e o líder do turno desde a 0730: quem está com
    -- a criança às 23h precisa saber o que já foi registrado sobre ela, para
    -- não repetir uma pergunta que já feriu. Educador e Enfermagem ficam fora.
    OR (app_current_role() IN ('equipe_tecnica','coordenador','lider_diurno','lider_noturno_geral')
        AND app_house_in_scope(p_house))
    -- E o que o autor abriu de propósito é da casa. O padrão é restrito: abrir
    -- é escolha de quem escreve, nunca da tela (§12.2).
    OR (NOT p_restricted AND app_house_in_scope(p_house))
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION app_pode_ler_relato(uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_pode_ler_relato(uuid, boolean, uuid) TO rede_app;

-- A policy passa a perguntar à função. O perímetro é o MESMO da 0730 — esta
-- migração não abre nem fecha nada para ninguém, e há teste que cobra cargo a
-- cargo justamente para provar isso.
DROP POLICY IF EXISTS st_select ON statement;
CREATE POLICY st_select ON statement FOR SELECT TO rede_app USING (
  app_pode_ler_relato(author_id, restricted, house_id)
);

-- ---------------------------------------------------------------------------
-- A CONTAGEM — número, nunca data, autor ou trecho.
--
-- Espelha `app_count_restricted_docs` (0030), que existe pela mesma razão e
-- desde a terceira migração do projeto: há informação que a pessoa PRECISA ver
-- sem poder ver o conteúdo. Saber que existe é operacional; ler não é.
--
-- `SECURITY DEFINER` porque ela conta justamente as linhas que o RLS esconde
-- de quem pergunta — e devolve um `integer`, que é o mínimo possível. O escopo
-- é conferido por dentro, com `app_person_in_scope`: fora dele a resposta é 0,
-- e não o número de outra casa.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_count_restricted_statements(p uuid) RETURNS integer AS $$
  SELECT count(*)::int FROM statement s
   WHERE s.person_id = p
     AND app_person_in_scope(p)
     AND NOT app_pode_ler_relato(s.author_id, s.restricted, s.house_id)
$$ LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_count_restricted_statements(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_count_restricted_statements(uuid) TO rede_app;

COMMENT ON FUNCTION app_count_restricted_statements(uuid) IS
  'Quantos relatos sobre esta criança este papel NÃO pode abrir. Número, nunca '
  'data, autor ou trecho — a leitura é o comando app_read_statement, com finalidade.';

-- ---------------------------------------------------------------------------
-- O índice, e por que ele não é por ator.
--
-- A lista nova entra pela CRIANÇA e ordena pelo quando. O `idx_statement_person`
-- da 0300 é parcial e não cobre a ordenação; este cobre a consulta inteira.
--
-- E não existe índice por autor para esta tela, de propósito: "tudo o que a
-- Joana escreveu" é a busca que a fase 112 recusou na auditoria, pela mesma
-- razão. Entra-se pela criança; o nome de quem escreveu aparece na linha, e
-- nunca é o filtro.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_statement_person_quando
  ON statement (person_id, happened_at DESC) WHERE person_id IS NOT NULL;
