-- ============================================================
-- 1490 — O arquivo de ATAS com o caminho fechado
--
-- Achado de passagem na varredura de 22/09, e é de segurança. Das 172 funções
-- `SECURITY DEFINER` do banco, 171 declaram
-- `search_path = pg_catalog, public, pg_temp`. Uma declara `search_path = public`
-- e nada mais: a `app_arquivo_atas`.
--
-- POR QUE ISSO É PIOR DO QUE PARECE, e por que não é só estilo. Quando o
-- `pg_temp` NÃO É NOMEADO, o Postgres o procura PRIMEIRO, antes de tudo. Uma
-- função que roda como dona do banco e resolve nomes com o esquema temporário à
-- frente pode chamar um objeto criado pela sessão de quem a invocou, e não o do
-- sistema. Nomear `pg_temp` por último é o que fecha essa porta — é para isso
-- que a linha existe, e não para enfeitar.
--
-- E O TESTE NÃO PEGOU, que é o segundo achado. O `arquivo-tem-saida.spec.ts`
-- cobrava que a função DECLARASSE `search_path`; não cobrava O QUE ela declara.
-- `search_path = public` passava. A cobrança foi estreitada junto com esta
-- migração: agora a lista tem de ser a da casa, por extenso. Teste que aceita
-- quase-certo guarda quase-nada.
--
-- O corpo abaixo saiu do CATÁLOGO — `pg_get_functiondef` —, não de redigitação:
-- é a cópia que o banco executa, e a única diferença é a linha do caminho.
-- ============================================================

CREATE OR REPLACE FUNCTION public.app_arquivo_atas(p_house uuid, p_de date, p_ate date)
 RETURNS TABLE(na_data date, turno text, ata_id uuid, shift_id uuid, ata_status text, pendencias text, assinaturas_faltantes integer, fechada_em timestamp with time zone, fechada_por text, aditamentos integer, episodios integer, passagens integer, geral_id uuid, geral_status text, geral_houve_contato boolean, geral_categoria text, geral_motivo text, geral_acao text, geral_pendencias text, geral_chegada timestamp with time zone, geral_saida timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, public, pg_temp
AS $function$
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
END $function$

;
REVOKE ALL ON FUNCTION app_arquivo_atas(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_arquivo_atas(uuid, date, date) TO rede_app;
