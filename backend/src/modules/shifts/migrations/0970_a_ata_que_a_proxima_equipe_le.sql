-- =============================================================================
-- 0970 — A ATA QUE A PRÓXIMA EQUIPE LÊ (§12.5, §12.6)
--
-- Três coisas pedidas pelo Marcelo em 08/09/2026, e a primeira explica as
-- outras duas:
--
--   "todos leem a ATA do turno anterior, para saber se tudo ocorreu bem e as
--    informações necessárias para o dia — tipo, 'a Maria não dormiu bem, fez
--    xixi à noite'. Não se trata de exposição: é uma informação que vai afetar
--    o dia da criança."
--
-- A ATA deixa de ser o livro que a casa FECHA e passa a ser o que a próxima
-- equipe ABRE. Isso muda o que ela precisa carregar.
--
-- 1. QUEM ESCREVEU CADA LINHA. Até aqui o corpo da ATA era um jsonb de seções,
--    escrito a várias mãos e sem autoria por linha: quem lia de manhã não sabia
--    a quem perguntar. `ata_note` é a linha com dono — texto, autor, horário —,
--    e é imutável como todo relato deste sistema.
--
--    O Marcelo pediu isso como COR ("as partes do educador Alexandre de uma
--    cor, com o nome dele"), e a cor entra na tela — mas o NOME vem sempre
--    escrito ao lado, porque a regra 7 não deixa a cor ser a única informação:
--    ela não sobrevive à impressão em preto e branco, ao daltonismo, nem à luz
--    do corredor às 23h.
--
-- 2. A LINHA RESTRITA. "Mensagens que forem só para a coordenação, equipe
--    técnica e líder aparecem de outra cor apenas para eles." A restrição é do
--    BANCO, e não da tela: se ficasse só na cor, a primeira tela nova mostraria
--    tudo para todo mundo — foi o que a 0760 já ensinou com a ATA Geral.
--
--    Para quem NÃO alcança, a linha restrita aparece como CONTAGEM ("há 2
--    observações restritas à coordenação"), e não como nada. É o precedente do
--    §13.7 com os documentos: sumir por completo cria a impressão de que não
--    existe, e a pessoa que precisa saber que existe é justamente quem vai
--    perguntar sobre ela.
--
-- 3. O TURNO ANTERIOR. A ATA já era legível por toda a equipe da casa
--    (`ata_select` confere apenas o alcance), mas não havia PORTA: a tela pedia
--    sempre o plantão de hoje, e o educador que chega às 19h lia a passagem e
--    não a ATA. `app_ata_anterior` é essa porta.
-- =============================================================================

CREATE TABLE ata_note (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id      uuid NOT NULL REFERENCES ata(id),
  house_id    uuid NOT NULL REFERENCES house(id),
  author_id   uuid NOT NULL REFERENCES app_user(id),
  body        text NOT NULL CHECK (length(btrim(body)) >= 3),
  -- Restrita à coordenação, à equipe técnica e aos líderes.
  restricted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Horário REAL do que se registra, preservado quando a linha sobe da fila.
  happened_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ata_note ON ata_note (ata_id, happened_at);

ALTER TABLE ata_note ENABLE ROW LEVEL SECURITY;

/*
 * QUEM LÊ A LINHA RESTRITA — e a ordem importa (regra 16): o papel primeiro,
 * o escopo por linha depois, com CASE. `OR` não garante a ordem de avaliação, e
 * o Postgres perguntaria o caro (o alcance por linha) antes de descobrir que o
 * cargo já resolvia.
 */
CREATE OR REPLACE FUNCTION app_le_ata_restrita() RETURNS boolean AS $$
  SELECT app_current_role() IN
    ('coordenador','equipe_tecnica','lider_diurno','lider_noturno_geral','gestor_geral')
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE POLICY note_select ON ata_note FOR SELECT TO rede_app
  USING (
    CASE WHEN app_current_role() = 'gestor_geral' THEN true
         ELSE house_id = ANY (ARRAY(SELECT app_casas_no_alcance())) END
    AND (NOT restricted OR app_le_ata_restrita())
  );

-- Escrever é de quem está no turno — e a linha nasce com o nome de quem
-- escreveu, nunca de outro (§12.1). Marcar como restrita é de quem a lê: um
-- educador não escreve uma linha que ele mesmo não pode reler.
CREATE POLICY note_insert ON ata_note FOR INSERT TO rede_app
  WITH CHECK (app_house_in_scope(house_id)
              AND author_id = app_current_user()
              AND (NOT restricted OR app_le_ata_restrita()));

GRANT SELECT, INSERT ON ata_note TO rede_app;
REVOKE UPDATE, DELETE ON ata_note FROM rede_app;

-- O relato da ATA é imutável, como o episódio do turno: corrigir é escrever
-- outra linha, e a anterior continua legível com o horário dela.
CREATE TRIGGER ata_note_no_change BEFORE UPDATE OR DELETE ON ata_note
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- -----------------------------------------------------------------------------
-- Quantas linhas restritas existem, para quem não as lê
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER porque a política esconde a linha inteira: a contagem
-- precisa ver o que a pessoa não vê. Ela devolve NÚMERO, nunca texto — e
-- confere o alcance da casa no corpo (regra 8).
CREATE OR REPLACE FUNCTION app_ata_restritas(p_ata uuid) RETURNS integer AS $$
DECLARE v_casa uuid; v_n integer;
BEGIN
  SELECT house_id INTO v_casa FROM ata WHERE id = p_ata;
  IF v_casa IS NULL THEN RETURN 0; END IF;
  IF NOT app_house_in_scope(v_casa) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT count(*)::int INTO v_n FROM ata_note WHERE ata_id = p_ata AND restricted;
  RETURN coalesce(v_n, 0);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_ata_restritas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_ata_restritas(uuid) TO rede_app;

-- -----------------------------------------------------------------------------
-- A ATA do turno anterior
-- -----------------------------------------------------------------------------
-- O turno anterior é o último plantão da casa que COMEÇOU antes deste — e não
-- "ontem", que erraria toda manhã (o anterior do diurno é a noite que acabou de
-- passar) e toda noite (o anterior do noturno é o dia que terminou).
--
-- Ele não precisa estar fechado: às 19h05 a ATA do diurno pode ainda estar
-- aberta, e é justamente ela que a equipe que entra precisa ler. O que a tela
-- diz é o ESTADO — "ainda aberta" —, que é informação e não defeito.
CREATE OR REPLACE FUNCTION app_ata_anterior(p_house uuid, p_de timestamptz DEFAULT NULL)
RETURNS TABLE (shift_id uuid, ata_id uuid, on_date date, period text, status text) AS $$
DECLARE v_ref timestamptz := coalesce(p_de, now());
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT s.id, a.id, s.on_date, s.period, a.status
      FROM shift s
      JOIN ata a ON a.shift_id = s.id
     WHERE s.house_id = p_house
       -- O instante em que o plantão começou, no fuso da instituição (regra 17:
       -- converte-se o PARÂMETRO, e a comparação é de timestamptz).
       AND ((s.on_date + CASE WHEN s.period = 'diurno' THEN TIME '07:00'
                              ELSE TIME '19:00' END) AT TIME ZONE app_fuso()) < v_ref
     -- Ordena pelo INSTANTE de início, e não por (data, turno): no mesmo dia,
     -- o noturno começa depois do diurno, e uma ordenação por texto do turno
     -- devolveria o plantão errado toda noite.
     ORDER BY ((s.on_date + CASE WHEN s.period = 'diurno' THEN TIME '07:00'
                                 ELSE TIME '19:00' END) AT TIME ZONE app_fuso()) DESC
     LIMIT 1;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_ata_anterior(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_ata_anterior(uuid, timestamptz) TO rede_app;
