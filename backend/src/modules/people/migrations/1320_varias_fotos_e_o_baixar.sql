-- ============================================================
-- 1320 — Várias fotos numa vivência, e o baixar no dossiê
--
-- Dois dos três pedidos que a equipe fez e que a Fundação repassou em 15/09
-- (§9, Grupo 2.5). Eu tinha MEDIDO a diferença antes de construir, e ela era
-- pequena nos dois casos — o que não quer dizer que fosse pouca coisa.
--
--   *"Eles querem também ter foto das crianças no perfil […] podendo
--   previamente visualizar o que está sendo hospedado e confirmar."*
--   *"Dentro do perfil deles tem que ter um lugar onde fique os documentos
--   reais […] poder visualizar a hora que eles quiserem e baixar."*
--
-- ---
--
-- 1. VÁRIAS FOTOS DA MESMA VIVÊNCIA — e por que isto é uma tabela nova
--
-- O álbum já aceitava fotos sem limite de quantidade. O que ele NÃO aceitava
-- era mais de uma **da mesma vivência**: `memory_record` guarda um
-- `storage_key`, e a educadora que volta da festa com seis fotos precisava
-- registrar seis vivências — seis vezes a mesma data, seis vezes a mesma
-- descrição, e o álbum da criança contando a festa seis vezes.
--
-- A saída errada seria acrescentar `storage_key_2`, `storage_key_3`. A saída
-- certa é dizer o que é verdade: **uma vivência é um acontecimento, e um
-- acontecimento tem quantas fotos tiver.**
--
-- **As fotos que já existem MUDAM DE LUGAR, e não são copiadas.** A migração
-- move cada `memory_record` com foto para uma linha de `memory_photo`, e as
-- colunas antigas ficam onde estão, sem serem lidas por nada — guardar o mesmo
-- fato em dois lugares é como duas versões da verdade começam. O comentário na
-- coluna diz isso para quem abrir o esquema daqui a um ano.
--
-- **A autorização de imagem continua POR FOTO**, e não por vivência: a festa
-- pode ter uma foto com uma criança de outra casa, e a autorização dela é
-- outra conversa. Era assim antes (uma foto, uma autorização) e continua
-- sendo — a mudança teria sido silenciosa e passaria despercebida.
--
-- ---
--
-- 2. BAIXAR O DOCUMENTO DO DOSSIÊ
--
-- A folha do dossiê abria a prévia e não oferecia baixar. O botão existe na
-- biblioteca de anexos desde a fase 47 e é usado em quatro telas; faltava aqui,
-- que é justamente onde a equipe pediu.
--
-- **E ele passa por uma rota própria, que REGISTRA.** A alternativa — salvar
-- os bytes que a prévia já tem no navegador — funcionaria e não deixaria
-- linha nenhuma. Abrir já é registrado (`document.open`) desde a fase 47; sair
-- com o arquivo é outro ato, e é o que alguém vai querer rastrear no dia em
-- que uma certidão aparecer onde não devia. Duas ações distintas, dois nomes
-- distintos na auditoria.
--
-- Não há função nova para isso: a rota reusa a leitura que já existe e escreve
-- `document.download` no log. Esta migração só declara o vocabulário — o resto
-- é serviço.
-- ============================================================

CREATE TABLE IF NOT EXISTS memory_photo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id     uuid NOT NULL REFERENCES memory_record(id),
  -- Copiada da vivência, e não lida por JOIN: é o que deixa a RLS desta tabela
  -- ser resolvida sozinha, sem depender da política de outra.
  person_id     uuid NOT NULL REFERENCES person(id),
  storage_key   text NOT NULL,
  mime          text,
  sha256        text,
  file_name     text,
  -- POR FOTO, e não por vivência: a festa pode ter uma foto com uma criança de
  -- outra casa, e a autorização dela é outra conversa.
  photo_authorized boolean NOT NULL DEFAULT false,
  -- A ordem em que a educadora escolheu. Sem ela, seis fotos de uma festa
  -- saem embaralhadas a cada consulta, e a primeira — que costuma ser a que
  -- ela escolheria para mostrar — deixa de ser a primeira.
  position      int NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL REFERENCES app_user(id)
);

CREATE INDEX IF NOT EXISTS idx_memory_photo_vivencia
  ON memory_photo (memory_id, position);
CREATE INDEX IF NOT EXISTS idx_memory_photo_pessoa
  ON memory_photo (person_id, created_at DESC);
-- As que estão sem autorização registrada: é a única lista que o sistema faz
-- desta tabela, e ela existe para ninguém ser pego de surpresa.
CREATE INDEX IF NOT EXISTS idx_memory_photo_sem_autorizacao
  ON memory_photo (person_id) WHERE NOT photo_authorized;

ALTER TABLE memory_photo ENABLE ROW LEVEL SECURITY;

-- O mesmo alcance da vivência (0020): quem alcança a criança vê o álbum dela.
CREATE POLICY mp_select ON memory_photo FOR SELECT TO rede_app
  USING (app_person_in_scope(person_id));
CREATE POLICY mp_insert ON memory_photo FOR INSERT TO rede_app
  WITH CHECK (app_person_in_scope(person_id));
GRANT SELECT, INSERT ON memory_photo TO rede_app;
-- Foto do álbum de uma criança não se apaga nem se troca por outra (regra 3).
REVOKE UPDATE, DELETE ON memory_photo FROM rede_app;

-- ------------------------------------------------------------
-- As fotos que já existem MUDAM DE LUGAR
--
-- `ON CONFLICT` não serve aqui porque não há chave única a violar; o `WHERE
-- NOT EXISTS` é o que torna a migração repetível sem duplicar a mesma foto.
-- ------------------------------------------------------------
INSERT INTO memory_photo (memory_id, person_id, storage_key, mime, sha256,
                          file_name, photo_authorized, position, created_at, created_by)
SELECT m.id, m.person_id, m.storage_key, m.mime, m.sha256,
       m.file_name, m.photo_authorized, 1, m.created_at, m.created_by
  FROM memory_record m
 WHERE m.storage_key IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM memory_photo p WHERE p.memory_id = m.id);

COMMENT ON COLUMN memory_record.storage_key IS
  'ORIGEM HISTÓRICA, não lida por nada desde a migração 1320. A foto da '
  'vivência vive em `memory_photo`, que aceita quantas forem. A coluna fica '
  'porque nada se apaga (regra 3) — e guardar o mesmo fato em dois lugares é '
  'como duas versões da verdade começam, então esta não volta a ser lida.';

-- ------------------------------------------------------------
-- Quantas fotos tem uma vivência, e quantas estão sem autorização
--
-- Função, e não coluna em `memory_record`: um contador gravado teria de ser
-- mantido em dia por gatilho, e um contador errado é pior do que contador
-- nenhum — a tela diria "3 fotos" e abriria duas.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_fotos_da_vivencia(p_memory uuid)
RETURNS TABLE (foto_id uuid, mime text, file_name text,
               autorizada boolean, posicao int, por text, em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.id, p.mime, p.file_name, p.photo_authorized, p.position,
         app_user_display_name(p.created_by), p.created_at
    FROM memory_photo p
   WHERE p.memory_id = p_memory
     AND app_person_in_scope(p.person_id)
   ORDER BY p.position, p.created_at;
$$
SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_fotos_da_vivencia(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_fotos_da_vivencia(uuid) TO rede_app;
