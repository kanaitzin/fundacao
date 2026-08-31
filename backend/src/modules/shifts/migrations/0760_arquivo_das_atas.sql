-- ============================================================
-- 0760 — O ARQUIVO DAS ATAS
--
-- Até aqui a ATA existia no dia em que era escrita. Fechada, ela continuava no
-- banco e não tinha por onde ser lida de novo: a tela pedia sempre o dia de
-- hoje. Um livro ATA que não se folheia serve para o turno e não serve para a
-- casa — e "me manda a ATA da noite do dia 12" é pedido de rotina, feito por
-- quem responde pelo caso.
--
-- O ALCANCE, decidido em 31/08/2026:
--
--   * a ATA DIURNA e a ATA NOTURNA da casa: quem já alcança a casa —
--     coordenação, equipe técnica e os dois líderes;
--   * a ATA GERAL NOTURNA, que é institucional e cobre as oito casas: só a
--     LINHA DAQUELA CASA. O que o Líder Noturno Geral registrou sobre a Casa
--     03 é assunto da Casa 03; o que ele registrou sobre a Casa 05 não é.
--   * a folha completa das oito casas continua onde estava: com o Líder
--     Noturno Geral, que a escreve, e com o Gestor Geral, que responde pela
--     instituição.
--
-- Por que uma função, e não uma política mais frouxa em
-- `general_night_house_entry`: a leitura parcial é uma REGRA, e regra fica
-- escrita num lugar só. Afrouxar a tabela abriria as oito linhas para todo
-- mundo que alcança qualquer casa, e a tela é que teria de esconder sete — o
-- tipo de proteção que se perde na primeira tela nova.
--
-- Consultar deixa rastro (§20 e regra 6): quem abriu o arquivo, de que casa e
-- de que período. O CONTEÚDO não vai para o log — só o recorte.
-- ============================================================

-- ------------------------------------------------------------
-- Quem consulta o arquivo
-- ------------------------------------------------------------
-- O educador não entra: a passagem dele é do turno, e reler a casa inteira
-- semana a semana não é trabalho de plantão. Enfermagem e cozinha também não —
-- ATA é documento da casa, não da área delas.
CREATE OR REPLACE FUNCTION app_consulta_arquivo_ata() RETURNS boolean AS $$
  SELECT app_current_role() IN
    ('coordenador','equipe_tecnica','lider_diurno','lider_noturno_geral','gestor_geral')
$$ LANGUAGE sql STABLE;
GRANT EXECUTE ON FUNCTION app_consulta_arquivo_ata() TO rede_app;

-- ------------------------------------------------------------
-- O arquivo de uma casa, num período
-- ------------------------------------------------------------
-- SECURITY DEFINER com p_house: confere app_house_in_scope ANTES de qualquer
-- leitura (regra 8). Sem esse par, a função viraria a porta dos fundos que as
-- políticas fecham na frente.
CREATE OR REPLACE FUNCTION app_arquivo_atas(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (
  na_data           date,
  turno             text,
  ata_id            uuid,
  shift_id          uuid,
  ata_status        text,
  pendencias        text,
  assinaturas_faltantes integer,
  fechada_em        timestamptz,
  fechada_por       text,
  aditamentos       integer,
  episodios         integer,
  passagens         integer,
  -- A linha da casa na ATA Geral Noturna. Fica no MESMO dia da ATA noturna
  -- da casa, porque é disso que a coordenação precisa: o que a casa escreveu
  -- e o que o Líder Noturno Geral escreveu sobre ela, lado a lado.
  geral_id          uuid,
  geral_status      text,
  geral_houve_contato boolean,
  geral_categoria   text,
  geral_motivo      text,
  geral_acao        text,
  geral_pendencias  text,
  geral_chegada     timestamptz,
  geral_saida       timestamptz
) AS $$
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'fora_de_escopo';
  END IF;
  IF NOT app_consulta_arquivo_ata() THEN
    RAISE EXCEPTION 'cargo_nao_consulta_arquivo';
  END IF;
  -- Um período aberto varreria o livro inteiro. Trinta e um dias cobrem o mês
  -- de calendário, que é o maior recorte que a tela oferece.
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de OR (p_ate - p_de) > 31 THEN
    RAISE EXCEPTION 'periodo_invalido';
  END IF;

  RETURN QUERY
  SELECT a.on_date, a.period, a.id, a.shift_id, a.status, a.pendencies,
         a.missing_signatures, a.closed_at,
         CASE WHEN a.closed_by IS NULL THEN NULL
              ELSE app_user_display_name(a.closed_by) END,
         (SELECT count(*)::int FROM ata_addendum d WHERE d.ata_id = a.id),
         (SELECT count(*)::int FROM ata_episode e WHERE e.ata_id = a.id),
         (SELECT count(*)::int FROM handover h WHERE h.shift_id = a.shift_id),
         g.id, g.status, e2.had_contact, e2.category, e2.reason, e2.action_taken,
         e2.pendencies, e2.arrived_at, e2.left_at
    FROM ata a
    -- Só o turno noturno recebe a linha da Geral: a Geral é da noite.
    LEFT JOIN general_night_ata g
           ON a.period = 'noturno' AND g.on_date = a.on_date
    LEFT JOIN general_night_house_entry e2
           ON e2.general_ata_id = g.id AND e2.house_id = p_house
   WHERE a.house_id = p_house
     AND a.on_date BETWEEN p_de AND p_ate
   ORDER BY a.on_date DESC, a.period;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION app_arquivo_atas(uuid, date, date) TO rede_app;

COMMENT ON FUNCTION app_arquivo_atas(uuid, date, date) IS
  'Arquivo das ATAs de uma casa num período. A ATA Geral Noturna entra apenas '
  'pela linha daquela casa — a folha completa das oito é do Líder Noturno '
  'Geral e do Gestor Geral.';
