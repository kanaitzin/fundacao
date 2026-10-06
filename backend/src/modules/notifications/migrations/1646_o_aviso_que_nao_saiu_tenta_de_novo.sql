-- O AVISO QUE NÃO SAIU TENTA DE NOVO (fase 190).
--
-- A 1645 reservava o aviso ANTES de mandar, para dois processos não mandarem o
-- mesmo, e nunca mais olhava para a reserva. Dois casos perdiam o aviso no
-- celular para sempre (o do sino ficava, mas é o celular que acorda a pessoa):
--
--   * o servidor caiu entre reservar e mandar: a reserva ficou sem envio;
--   * o serviço de push estava fora do ar (sem resposta, 429 ou 5xx).
--
-- A varredura de pontas achou o primeiro pela coluna: `claimed_at` era
-- gravada e ninguém a lia. Agora a reserva parada há dois minutos e a falha
-- passageira com um minuto voltam à fila, enquanto o aviso tiver menos de
-- trinta minutos, não tiver sido lido e o aparelho continuar ligado, até cinco
-- tentativas. Recusa definitiva (404 e 410, o aparelho sumiu; 400, 401, 403,
-- 413, o pedido está errado) não se repete: tentar de novo não a conserta.

ALTER TABLE notification_push ADD COLUMN tentativas int NOT NULL DEFAULT 1 CHECK (tentativas BETWEEN 1 AND 5);

CREATE OR REPLACE FUNCTION app_push_reservar(p_limite int)
RETURNS TABLE (out_notification uuid, out_raised timestamptz, out_subscription uuid,
               out_endpoint text, out_p256dh text, out_auth text,
               out_casa text, out_prioridade text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH candidatos AS (
    SELECT n.id AS nid, n.created_at AS raised, s.id AS sid
      FROM notification n
      JOIN app_user u ON u.id = n.user_id AND u.active
      JOIN push_subscription s ON s.user_id = n.user_id AND s.revoked_at IS NULL
                              AND s.created_at <= n.created_at
     WHERE n.created_at > now() - interval '30 minutes'
       AND n.read_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM notification_push p
                        WHERE p.notification_id = n.id AND p.raised_at = n.created_at
                          AND p.subscription_id = s.id)
     ORDER BY n.created_at
     LIMIT p_limite
  ), novos AS (
    INSERT INTO notification_push (notification_id, raised_at, subscription_id)
    SELECT nid, raised, sid FROM candidatos
    ON CONFLICT DO NOTHING
    RETURNING notification_id, raised_at, subscription_id
  ), parados AS (
    SELECT p.notification_id, p.raised_at, p.subscription_id
      FROM notification_push p
      JOIN notification n ON n.id = p.notification_id AND n.created_at = p.raised_at
      JOIN app_user u ON u.id = n.user_id AND u.active
      JOIN push_subscription s ON s.id = p.subscription_id AND s.revoked_at IS NULL
     WHERE n.created_at > now() - interval '30 minutes'
       AND n.read_at IS NULL
       AND p.tentativas < 5
       AND (   (p.sent_at IS NULL AND p.claimed_at < now() - interval '2 minutes')
            OR (p.sent_at < now() - interval '1 minute'
                AND (p.http_status IS NULL OR p.http_status = 0 OR p.http_status = 429 OR p.http_status >= 500)))
     ORDER BY p.claimed_at
     LIMIT p_limite
       FOR UPDATE OF p SKIP LOCKED
  ), de_novo AS (
    UPDATE notification_push p
       SET claimed_at = now(), sent_at = NULL, http_status = NULL, tentativas = p.tentativas + 1
      FROM parados x
     WHERE p.notification_id = x.notification_id AND p.raised_at = x.raised_at
       AND p.subscription_id = x.subscription_id
    RETURNING p.notification_id, p.raised_at, p.subscription_id
  ), reservados AS (
    SELECT * FROM novos UNION ALL SELECT * FROM de_novo
  )
  SELECT r.notification_id, r.raised_at, r.subscription_id, s.endpoint, s.p256dh, s.auth,
         h.name, n.priority
    FROM reservados r
    JOIN push_subscription s ON s.id = r.subscription_id
    JOIN notification n ON n.id = r.notification_id
    LEFT JOIN house h ON h.id = n.house_id;
END $$;
