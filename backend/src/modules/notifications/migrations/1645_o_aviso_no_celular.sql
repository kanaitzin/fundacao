-- O AVISO NO CELULAR, MESMO COM O SISTEMA FECHADO (fase 189; ideia 2 de 30/09,
-- decidida em 06/10: TODOS os avisos vão ao celular, e a tela bloqueada mostra
-- só o título neutro).
--
-- A pessoa liga o aviso em cada aparelho, pela Minha conta. O navegador entrega
-- um endereço do serviço de push (o do Google no Android, o da Apple no iPhone)
-- e duas chaves; o servidor manda para lá, cifrado, um texto que não diz nada
-- além de que há um aviso e em qual casa. O conteúdo continua só dentro do
-- sistema, depois de entrar.
--
-- Duas tabelas, fechadas para a aplicação como a sessão (1190): o endereço do
-- aparelho é uma porta para a tela dele, e nada lê essa tabela fora destas
-- funções. Nada se apaga: desligar marca quando e por quê.

CREATE TABLE push_subscription (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES app_user(id),
  endpoint       text NOT NULL,
  p256dh         text NOT NULL,
  auth           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  revoked_reason text CHECK (revoked_reason IN ('desligado', 'outra_pessoa_no_aparelho', 'renovado', 'saiu_do_sistema', 'aparelho_recusou')),
  CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);
-- Um aparelho, uma pessoa: o tablet é da casa, e quem liga por último é quem recebe.
CREATE UNIQUE INDEX push_subscription_um_por_aparelho ON push_subscription (endpoint) WHERE revoked_at IS NULL;
CREATE INDEX push_subscription_da_pessoa ON push_subscription (user_id) WHERE revoked_at IS NULL;

-- O que saiu, para não sair duas vezes: um aviso (e cada vez que ele volta a
-- subir, pelo group_key) vai uma vez para cada aparelho. Só metadado.
CREATE TABLE notification_push (
  notification_id uuid NOT NULL REFERENCES notification(id),
  raised_at       timestamptz NOT NULL,
  subscription_id uuid NOT NULL REFERENCES push_subscription(id),
  claimed_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  http_status     int,
  PRIMARY KEY (notification_id, raised_at, subscription_id)
);

REVOKE ALL ON push_subscription FROM rede_app;
REVOKE ALL ON notification_push FROM rede_app;
ALTER TABLE push_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_push ENABLE ROW LEVEL SECURITY;

-- Ligar neste aparelho. Quem já estava ligado no mesmo aparelho deixa de
-- receber: se era outra pessoa, o aviso dela não aparece na tela de quem pegou
-- o tablet depois.
CREATE FUNCTION app_push_ligar(p_endpoint text, p_p256dh text, p_auth text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_eu uuid := app_current_user(); v_id uuid;
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'sem_identidade'; END IF;
  UPDATE push_subscription
     SET revoked_at = now(),
         revoked_reason = CASE WHEN user_id = v_eu THEN 'renovado' ELSE 'outra_pessoa_no_aparelho' END
   WHERE endpoint = p_endpoint AND revoked_at IS NULL;
  INSERT INTO push_subscription (user_id, endpoint, p256dh, auth)
  VALUES (v_eu, p_endpoint, p_p256dh, p_auth) RETURNING id INTO v_id;
  INSERT INTO audit_event (actor_id, action, entity, entity_id)
  VALUES (v_eu, 'push.ligado', 'push_subscription', v_id);
  RETURN v_id;
END $$;

-- Desligar neste aparelho: pela Minha conta ('desligado') ou ao sair do
-- sistema ('saiu_do_sistema'). Só o que é da própria pessoa.
CREATE FUNCTION app_push_desligar(p_endpoint text, p_motivo text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_eu uuid := app_current_user(); v_id uuid;
BEGIN
  IF p_motivo NOT IN ('desligado', 'saiu_do_sistema') THEN RAISE EXCEPTION 'motivo_invalido'; END IF;
  UPDATE push_subscription SET revoked_at = now(), revoked_reason = p_motivo
   WHERE endpoint = p_endpoint AND user_id = v_eu AND revoked_at IS NULL
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN false; END IF;
  INSERT INTO audit_event (actor_id, action, entity, entity_id)
  VALUES (v_eu, 'push.desligado', 'push_subscription', v_id);
  RETURN true;
END $$;

-- Este aparelho está ligado para mim? A tela pergunta com o endereço que o
-- navegador tem; a resposta é sim ou não, e nunca o de outra pessoa.
CREATE FUNCTION app_push_ligado(p_endpoint text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM push_subscription
                  WHERE endpoint = p_endpoint AND user_id = app_current_user() AND revoked_at IS NULL)
$$;

-- O que mandar agora: os avisos não lidos dos últimos trinta minutos, para cada
-- aparelho ligado da pessoa (ligado ANTES do aviso subir), que ainda não foram.
-- Reserva antes de mandar, para dois processos não mandarem o mesmo.
-- Devolve a casa pelo NOME, que é tudo o que a tela bloqueada vai dizer.
CREATE FUNCTION app_push_reservar(p_limite int)
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
  ), reservados AS (
    INSERT INTO notification_push (notification_id, raised_at, subscription_id)
    SELECT nid, raised, sid FROM candidatos
    ON CONFLICT DO NOTHING
    RETURNING notification_id, raised_at, subscription_id
  )
  SELECT r.notification_id, r.raised_at, r.subscription_id, s.endpoint, s.p256dh, s.auth,
         h.name, n.priority
    FROM reservados r
    JOIN push_subscription s ON s.id = r.subscription_id
    JOIN notification n ON n.id = r.notification_id
    LEFT JOIN house h ON h.id = n.house_id;
END $$;

-- Como foi: o status do serviço de push. 404 e 410 dizem que o aparelho não
-- existe mais (desinstalou, limpou o navegador): esse endereço sai.
CREATE FUNCTION app_push_resultado(p_notification uuid, p_raised timestamptz, p_subscription uuid, p_status int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE notification_push SET sent_at = now(), http_status = p_status
   WHERE notification_id = p_notification AND raised_at = p_raised AND subscription_id = p_subscription;
  IF p_status IN (404, 410) THEN
    UPDATE push_subscription SET revoked_at = now(), revoked_reason = 'aparelho_recusou'
     WHERE id = p_subscription AND revoked_at IS NULL;
  END IF;
END $$;

REVOKE ALL ON FUNCTION app_push_ligar(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_push_desligar(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_push_ligado(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_push_reservar(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_push_resultado(uuid, timestamptz, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_push_ligar(text, text, text) TO rede_app;
GRANT EXECUTE ON FUNCTION app_push_desligar(text, text) TO rede_app;
GRANT EXECUTE ON FUNCTION app_push_ligado(text) TO rede_app;
GRANT EXECUTE ON FUNCTION app_push_reservar(int) TO rede_app;
GRANT EXECUTE ON FUNCTION app_push_resultado(uuid, timestamptz, uuid, int) TO rede_app;
