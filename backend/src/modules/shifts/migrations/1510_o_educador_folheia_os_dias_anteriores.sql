-- ============================================================
-- 1510 — O educador folheia os dias anteriores
--
-- Pedido da Fundação em 22/09, e ela deu a razão junto: *"as atas de dias
-- passados podem ser vistas por todos, menos os registros e situações marcadas
-- como confidencial; cada educador pode ver uma ata unificada da passagem dos
-- dias anteriores para poder controlar e ajustar se necessário o comportamento ou
-- a dinâmica da casa, assim como acompanhar a alimentação e o comportamental do
-- todo dos atendidos."*
--
-- O QUE FALTAVA, medido — e é menos do que parece. O DADO já era dele:
--
--   * `ata_select` é `app_house_in_scope(house_id)`: qualquer cargo da casa lê a
--     ATA da casa, e sempre leu;
--   * `note_select` já exclui a linha **restrita** de quem não a alcança — a
--     confidencialidade que a Fundação descreveu está no BANCO, e não na tela;
--   * `ata_episode` e `general_night_house_entry` também respondem por casa.
--
-- O que o barrava era UMA LISTA DE CARGOS na porta do arquivo:
-- `app_consulta_arquivo_ata()` não tinha `educador`, e a tela dizia *"o arquivo
-- das ATAS é da coordenação, da equipe técnica e dos líderes"*. Ele lia a ATA do
-- turno ANTERIOR (`/shifts/anterior`) e mais nada: a janela de vários dias —
-- justamente o que ela descreveu — não era dele.
--
-- POR QUE A JANELA DE VÁRIOS DIAS É OUTRA COISA, e não um luxo: o turno anterior
-- responde *"o que houve ontem à noite"*. A pergunta da Fundação é outra — *"esta
-- criança está comendo mal desde quando?"*, *"a casa está mais agitada esta
-- semana?"* — e essa não se responde com uma ATA. Quem passa doze horas com a
-- casa é quem primeiro percebe o padrão, e era quem não tinha como olhar para
-- trás.
--
-- ------------------------------------------------------------
-- E A ATA GERAL NOTURNA CONTINUA FORA — isto é decisão de propósito.
--
-- A função é `SECURITY DEFINER`: dentro dela o RLS não vale, e o `LEFT JOIN` com
-- a `general_night_ata` devolveria o estado do documento da noite a quem a
-- política `gna_select` não inclui. Abrir o arquivo ao educador sem mexer nisso
-- responderia, de carona, a **§10.2** — *"quem lê a ATA Geral de dia"* —, que é
-- pergunta ABERTA e é da Fundação. A fase 138 já tinha encostado nela e respondeu
-- só o que a decisão daquele dia implicava: quem corrige, lê.
--
-- Então as colunas da Geral saem VAZIAS para quem não a lê, e a lista de quem a
-- lê é a mesma da `gna_select` — escrita aqui porque uma função definer que
-- ignora o RLS tem de repetir a regra que o RLS faria. O educador vê a ATA da
-- CASA dele, dia a dia. O que a instituição registrou sobre as oito continua sem
-- resposta até a Fundação dar a dela.
--
-- O corpo saiu do CATÁLOGO (`pg_get_functiondef`), não de redigitação — é a cópia
-- que o banco executa, com o `search_path` que a 1490 fixou.
-- ============================================================

CREATE OR REPLACE FUNCTION app_consulta_arquivo_ata()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_current_role() IN
    ('coordenador','equipe_tecnica','lider_diurno','lider_noturno_geral','gestor_geral',
     -- 22/09: quem passa doze horas com a casa é quem primeiro percebe o padrão.
     'educador')
$$;

-- Quem lê a ATA Geral Noturna — a MESMA lista da política `gna_select` (0310).
-- Existe porque `app_arquivo_atas` é definer e o RLS não a alcança lá dentro.
CREATE OR REPLACE FUNCTION app_le_ata_geral() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_current_role() IN
    ('lider_noturno_geral','equipe_tecnica','coordenador','gestor_geral',
     'admin_tecnico','lider_diurno')
$$;
REVOKE ALL ON FUNCTION app_le_ata_geral() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_le_ata_geral() TO rede_app;

COMMENT ON FUNCTION app_le_ata_geral() IS
  'Quem lê a ATA Geral Noturna. Repete a lista da política gna_select porque app_arquivo_atas é SECURITY DEFINER e o RLS não vale lá dentro. A §10.2 — quem mais lê — é decisão da Fundação e está aberta.';

CREATE OR REPLACE FUNCTION public.app_arquivo_atas(p_house uuid, p_de date, p_ate date)
 RETURNS TABLE(na_data date, turno text, ata_id uuid, shift_id uuid, ata_status text, pendencias text, assinaturas_faltantes integer, fechada_em timestamp with time zone, fechada_por text, aditamentos integer, episodios integer, passagens integer, geral_id uuid, geral_status text, geral_houve_contato boolean, geral_categoria text, geral_motivo text, geral_acao text, geral_pendencias text, geral_chegada timestamp with time zone, geral_saida timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
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
    -- 1510: a Geral só entra para quem a LÊ. Definer ignora o RLS, então a
    -- regra da `gna_select` é repetida aqui — abrir a Geral ao educador de
    -- carona responderia a §10.2, que é da Fundação.
    LEFT JOIN general_night_ata g
           ON a.period = 'noturno' AND g.on_date = a.on_date
          AND app_le_ata_geral()
    LEFT JOIN general_night_house_entry e2
           ON e2.general_ata_id = g.id AND e2.house_id = p_house
   WHERE a.house_id = p_house
     AND a.on_date BETWEEN p_de AND p_ate
   ORDER BY a.on_date DESC, a.period;
END $function$;
REVOKE ALL ON FUNCTION app_arquivo_atas(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_arquivo_atas(uuid, date, date) TO rede_app;
