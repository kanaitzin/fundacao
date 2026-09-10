-- ============================================================
-- 1070 — O retorno da experiência familiar chega à ATA e à passagem
--
-- Pedido do Marcelo em 09/09, item 3 da fila, e a segunda metade dele: o
-- retorno JÁ era registrado no perfil desde a fase 80, e ficava lá. Quem
-- assume o turno das 19h não abre o perfil de vinte crianças para descobrir
-- que a Alice voltou às 18h10 trazendo uma mochila de roupa suja e um frasco
-- de xarope que não é o da grade. **Falta ecoar** — a palavra é dele.
--
-- POR QUE UMA FUNÇÃO SÓ, E NÃO UMA PARA CADA TELA.
--
-- O mesmo bloco aparece na Passagem e na ATA. Duas consultas quase iguais
-- divergiriam no primeiro ajuste, e aí a passagem diria uma coisa e a ATA
-- outra sobre o mesmo domingo — que é o defeito que o §4.8 evita fazendo a
-- folha da tela e o `.docx` saírem da MESMA estrutura.
--
-- O RECORTE É O DO TURNO, como em `app_doses_do_turno` (0940): 07h–19h no
-- diurno, 19h–07h do dia seguinte no noturno, no fuso da instituição. Regra
-- 17: converte-se o PARÂMETRO em faixa de timestamptz, nunca a coluna — sob
-- RLS, `(coluna AT TIME ZONE …)::date` não é leakproof, o filtro fica DEPOIS
-- da política, e a política passa a rodar uma vez por linha do ano.
--
-- TRÊS COISAS APARECEM, E A TERCEIRA É A QUE QUASE FICOU FORA:
--
--   * quem VOLTOU no turno — com a hora, quem recebeu, como chegou e o que
--     trouxe. É o pedido literal;
--   * quem SAIU no turno — porque a cadeira vazia no jantar tem de ter
--     explicação escrita, e quem chega às 19h não viu a criança sair às 14h;
--   * quem CONTINUA FORA. Esta não estava no pedido e é a que o turno seguinte
--     mais usa: sem ela, a equipe da noite não sabe que a criança volta
--     domingo às 18h, e às 20h de sábado alguém a marca ausente no jantar ou
--     estranha a cama vazia. Uma convivência que começou na terça e termina no
--     domingo não aparece em NENHUM turno se o recorte for só o das bordas —
--     e é justamente nos dias do meio que ninguém sabe o que está acontecendo.
--
-- O que ela NÃO faz: não classifica nada. Não existe "voltou bem" nem
-- "atrasada" como estado da criança. `atrasado` fala do RELÓGIO — a hora
-- prevista passou e o retorno não foi registrado —, e o sistema não chama isso
-- de evasão até alguém apurar (decisão 3 da migração 1010, e a regra 3).
-- ============================================================

-- ------------------------------------------------------------
-- As convivências familiares de um plantão.
--
-- SECURITY DEFINER porque junta pessoa, contato e a conta de quem recebeu para
-- escrever a linha que a tela mostra; por isso confere `app_house_in_scope` no
-- corpo (regra 8).
--
-- O nome de quem RECEBEU sai por `app_user_display_name` e nunca por junção
-- com `app_user`, que tem RLS de linha (regra 10): com `JOIN` sumiria a
-- convivência inteira, com `LEFT JOIN` sumiria só o nome — e um retorno sem
-- quem recebeu é um retorno que ninguém pode conferir. As duas falhas são
-- silenciosas.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_convivencias_do_turno(p_shift uuid)
RETURNS TABLE (
  id uuid, person_id uuid, acolhido text, com_quem text, vinculo text,
  situacao text, saiu_em timestamptz, retorno_previsto timestamptz,
  voltou_em timestamptz, recebida_por text, como_chegou text, trouxe text,
  atrasado boolean
) AS $$
DECLARE v_s shift%ROWTYPE; v_de timestamptz; v_ate timestamptz;
BEGIN
  SELECT * INTO v_s FROM shift s WHERE s.id = p_shift;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'plantao_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(v_s.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_s.period = 'diurno' THEN
    v_de  := (v_s.on_date + TIME '07:00') AT TIME ZONE app_fuso();
    v_ate := (v_s.on_date + TIME '19:00') AT TIME ZONE app_fuso();
  ELSE
    v_de  := (v_s.on_date + TIME '19:00') AT TIME ZONE app_fuso();
    v_ate := ((v_s.on_date + 1) + TIME '07:00') AT TIME ZONE app_fuso();
  END IF;

  RETURN QUERY
    -- rls-join-ok: `family_stay` responde à fs_select (casa no alcance) e
    -- `person` à política dela; `person_contact` pertence à pessoa. As três
    -- filtram a linha inteira, e nenhuma delas guarda nome de usuário.
    SELECT f.id, f.person_id,
           coalesce(nullif(p.social_name, ''), p.full_name),
           c.name, c.bond,
           /*
            * A SITUAÇÃO É SOBRE O QUE ACONTECEU NESTE TURNO, e não sobre a
            * criança. Três valores, e a ordem de teste importa: uma saída que
            * começou E terminou dentro do mesmo turno é 'voltou' — o que o
            * turno seguinte precisa saber é que ela está de volta, não que
            * ela saiu.
            */
           CASE
             WHEN f.returned_at IS NOT NULL AND f.returned_at >= v_de
                                            AND f.returned_at < v_ate THEN 'voltou'
             WHEN f.started_at >= v_de AND f.started_at < v_ate      THEN 'saiu'
             ELSE 'fora'
           END,
           f.started_at, f.expected_return_at, f.returned_at,
           app_user_display_name(f.closed_by),
           f.return_note, f.brought_back,
           /* Do RELÓGIO, nunca da criança: a hora passou e o retorno não foi
              registrado. Só faz sentido em quem continua fora. */
           f.returned_at IS NULL AND now() >= f.expected_return_at
      FROM family_stay f
      JOIN person p ON p.id = f.person_id
      JOIN person_contact c ON c.id = f.contact_id
     WHERE f.house_id = v_s.house_id
       AND (
         /* Voltou neste turno. */
         (f.returned_at >= v_de AND f.returned_at < v_ate)
         /* Ou saiu neste turno. */
         OR (f.started_at >= v_de AND f.started_at < v_ate)
         /* Ou atravessa o turno inteiro — saiu antes e não voltou até o fim.
            É o caso dos dias do meio, e o que o turno seguinte mais usa. */
         OR (f.started_at < v_de
             AND (f.returned_at IS NULL OR f.returned_at >= v_ate))
       )
     /* Quem voltou primeiro: é o que a passagem tem de contar. Depois quem
        saiu, e por fim quem segue fora, que é referência e não novidade. */
     ORDER BY CASE
                WHEN f.returned_at IS NOT NULL AND f.returned_at >= v_de
                                               AND f.returned_at < v_ate THEN 0
                WHEN f.started_at >= v_de AND f.started_at < v_ate       THEN 1
                ELSE 2
              END,
              coalesce(f.returned_at, f.started_at);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_convivencias_do_turno(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_convivencias_do_turno(uuid) TO rede_app;
