-- O ADENDO DA CHAMADA CONFIRMADA (fase 320, decidido pelo dono em 13/11).
--
-- Confirmada a chamada, a marcação não muda mais (cr_update só alcança a chamada
-- aberta). A tela dizia que a correção entrava como adendo pela equipe técnica, e o
-- adendo não existia: a técnica não tinha onde escrever, e o erro ficava como foi.
--
-- O adendo NÃO troca a marcação. A linha da hora fica como foi registrada, com quem
-- marcou; o adendo fica ao lado, com o que de fato aconteceu, o motivo, quem escreveu
-- e quando. Escreve-se uma vez e não se reescreve: um segundo adendo é outra linha.
--
-- Quem escreve: a equipe técnica e a coordenação da casa (a Coordenação Geral é
-- coordenação com a marca de todas as casas). O plantão marca e confirma; o Gestor
-- Geral lê.

CREATE TABLE check_result_addendum (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id    uuid NOT NULL REFERENCES collective_check(id),
  person_id   uuid NOT NULL REFERENCES person(id),
  -- A casa da chamada, repetida para a política perguntar o alcance sem subconsulta.
  house_id    uuid NOT NULL REFERENCES house(id),
  -- O que de fato aconteceu, numa das opções do tipo da chamada (conferida pelo
  -- servidor, que conhece as opções de cada tipo).
  option_code text NOT NULL CHECK (length(btrim(option_code)) BETWEEN 1 AND 40),
  note        text NOT NULL CHECK (length(btrim(note)) BETWEEN 10 AND 2000),
  written_by  uuid NOT NULL REFERENCES app_user(id),
  written_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_cradd_check  ON check_result_addendum (check_id, person_id);
CREATE INDEX ix_cradd_person ON check_result_addendum (person_id);
CREATE INDEX ix_cradd_house  ON check_result_addendum (house_id);
CREATE INDEX ix_cradd_autor  ON check_result_addendum (written_by);

ALTER TABLE check_result_addendum ENABLE ROW LEVEL SECURITY;
-- Quem lê a chamada lê o adendo dela.
CREATE POLICY cradd_select ON check_result_addendum FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));

GRANT SELECT ON check_result_addendum TO rede_app;
-- Ninguém escreve aqui direto: só a função abaixo, e nada se apaga (§5.1).
REVOKE INSERT, UPDATE, DELETE ON check_result_addendum FROM rede_app;

CREATE OR REPLACE FUNCTION app_adendo_da_chamada(p_check uuid, p_person uuid,
                                                p_opcao text, p_nota text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role   text := app_current_role()::text;
  v_house  uuid;
  v_status text;
  v_id     uuid;
BEGIN
  IF coalesce(v_role::text, '') NOT IN ('equipe_tecnica', 'coordenador') THEN
    RAISE EXCEPTION 'adendo_so_tecnica_e_coordenacao' USING ERRCODE = '42501';
  END IF;

  SELECT k.house_id, k.status::text INTO v_house, v_status
    FROM collective_check k WHERE k.id = p_check;
  IF v_house IS NULL OR NOT coalesce(app_house_in_scope(v_house), false) THEN
    RAISE EXCEPTION 'chamada_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'confirmada' THEN
    RAISE EXCEPTION 'chamada_ainda_aberta' USING ERRCODE = '22023';
  END IF;

  -- A criança é da chamada: foi marcada nela, ou é de quem a chamada trata.
  IF NOT EXISTS (SELECT 1 FROM check_result r WHERE r.check_id = p_check AND r.person_id = p_person)
     AND NOT EXISTS (SELECT 1 FROM app_efetivo_da_chamada(p_check) e WHERE e.person_id = p_person) THEN
    RAISE EXCEPTION 'crianca_fora_da_chamada' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(p_nota, ''))) < 10 THEN
    RAISE EXCEPTION 'adendo_sem_motivo' USING ERRCODE = '22023';
  END IF;

  INSERT INTO check_result_addendum (check_id, person_id, house_id, option_code, note, written_by)
  VALUES (p_check, p_person, v_house, btrim(p_opcao), btrim(p_nota), app_current_user())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION app_adendo_da_chamada(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_adendo_da_chamada(uuid, uuid, text, text) TO rede_app;

COMMENT ON TABLE check_result_addendum IS
  'O adendo da chamada confirmada (fase 320): o que de fato aconteceu com uma criança, '
  'escrito pela equipe técnica ou pela coordenação, ao lado da marcação da hora, que não muda.';
