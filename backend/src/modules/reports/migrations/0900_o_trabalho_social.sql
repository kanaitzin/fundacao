-- =========================================================================
-- O TRABALHO SOCIAL, E NÃO O TURNO — 04/09/2026
--
-- Pedido da coordenação: o Gestor Geral precisa das oito casas de duas formas.
-- A que existe é a operação — quem está de plantão, que dose falta confirmar,
-- qual ATA não fechou. Ele não vai olhar isso todo dia, e não deve.
--
-- A que falta é a outra: "crianças que passaram de ano, cursos
-- profissionalizantes, certificados, ingresso em faculdade, primeiro emprego" —
-- o impacto do trabalho de acolhimento, na casa e no conjunto delas.
--
-- ---------------------------------------------------------------------------
-- O RISCO DESTA TABELA, ESCRITO ANTES DE ELA EXISTIR
--
-- Contar conquistas por casa é a distância de um `ORDER BY` de virar ranking
-- de casas — e ranking de casas, de acolhidos e de equipe é proibido (regra 3).
-- A proibição não é burocracia: a casa que recebe adolescentes com medida
-- protetiva recente e a casa-lar com quatro crianças pequenas não estão na
-- mesma corrida, e transformar isso em placar faz a primeira parecer pior no
-- exato momento em que ela está fazendo o trabalho mais difícil.
--
-- Por isso, e isto vale para toda consulta escrita sobre estas tabelas:
--
--   * a ordenação é sempre por CÓDIGO da casa, nunca por contagem;
--   * não existe média, percentual de "sucesso", meta nem comparação entre
--     casas — o número de cada casa é lido ao lado do número de acolhidos
--     dela, e a leitura é de quem conhece a casa;
--   * o marco é da CRIANÇA. A casa é onde ela estava, e não a autora.
--
-- E a coisa que a tabela não faz: ela não mede quem NÃO teve marco nenhum.
-- Uma criança sem linha aqui não fracassou — ela pode ter passado o ano
-- inteiro sobrevivendo a uma coisa que não cabe em categoria.
-- =========================================================================

CREATE TABLE life_milestone (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES person(id),
  -- A casa em que a criança estava QUANDO aconteceu, gravada na hora: ela
  -- muda de casa, e o marco não muda de lugar junto.
  house_id     uuid REFERENCES house(id),
  kind         text NOT NULL CHECK (kind IN (
                 'aprovacao_escolar','conclusao_ensino_fundamental',
                 'conclusao_ensino_medio','curso_profissionalizante',
                 'certificado','ingresso_faculdade','primeiro_emprego',
                 'estagio','documento_conquistado','esporte_ou_arte',
                 'reinsercao_familiar','outro')),
  kind_other   text,
  happened_on  date NOT NULL,
  description  text NOT NULL,
  -- Escola, curso, empresa, federação. O nome que a criança vai dizer quando
  -- contar a história dela.
  institution  text,
  -- Comprovante: diploma, certificado, carteira assinada. Opcional, e no mesmo
  -- armazenamento do dossiê — chave, nunca o binário no banco.
  storage_key  text,
  mime         text,
  file_name    text,
  registered_by uuid NOT NULL REFERENCES app_user(id),
  registered_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'outro' OR kind_other IS NOT NULL)
);

CREATE INDEX idx_marco_pessoa ON life_milestone (person_id, happened_on DESC);
CREATE INDEX idx_marco_casa_dia ON life_milestone (house_id, happened_on DESC);

ALTER TABLE life_milestone ENABLE ROW LEVEL SECURITY;

/*
 * QUEM LÊ.
 *
 * Todo mundo da casa lê os marcos das crianças dela, inclusive o educador — e
 * essa é uma escolha, não um descuido. O que está aqui é a parte boa da
 * história: passou de ano, entrou no curso, assinou a carteira. Esconder isso
 * de quem acorda a criança todo dia seria transformar em relatório o que devia
 * ser motivo de a casa inteira saber.
 *
 * O Gestor Geral lê os das oito casas — é para isso que a tabela existe.
 */
CREATE POLICY marco_select ON life_milestone FOR SELECT TO rede_app
  USING (app_person_in_scope(person_id)
         OR app_current_role() IN ('gestor_geral','admin_tecnico'));

-- Escrever é da técnica, da coordenação e do Gestor Geral: um marco entra no
-- histórico da criança e sai em relatório, e por isso não é registro de turno.
CREATE POLICY marco_insert ON life_milestone FOR INSERT TO rede_app
  WITH CHECK ((app_person_in_scope(person_id)
               OR app_current_role() = 'gestor_geral')
              AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));

GRANT SELECT, INSERT ON life_milestone TO rede_app;

-- Marco não se apaga. O que aconteceu com a criança aconteceu, e um diploma
-- que sumiu do sistema é um diploma que a instituição deixou de reconhecer.
CREATE OR REPLACE FUNCTION app_marco_nao_e_apagado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'marco_nao_e_apagado';
END $$;

CREATE TRIGGER trg_marco_sem_delete BEFORE DELETE ON life_milestone
  FOR EACH ROW EXECUTE FUNCTION app_marco_nao_e_apagado();

/*
 * O PANORAMA DAS OITO CASAS.
 *
 * `SECURITY DEFINER` e sem parâmetro de casa: ela responde pela instituição
 * inteira, e por isso confere o papel por dentro. Só o Gestor Geral e o
 * administrador técnico chegam aqui — a coordenação de uma casa tem o painel
 * dela, e ver as outras oito não é função de quem responde por uma.
 *
 * `ORDER BY code`: a ordem é do cadastro, e não do resultado. Ordenar por
 * contagem seria publicar um ranking sem chamá-lo assim.
 */
CREATE OR REPLACE FUNCTION app_panorama_das_casas(p_de date, p_ate date)
RETURNS TABLE (
  house_id uuid, code text, name text,
  acolhidos int, capacidade int,
  entradas int, saidas int,
  ocorrencias int, marcos int
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT h.id, h.code, h.name,
         (SELECT count(*)::int FROM house_stay s
           WHERE s.house_id = h.id AND s.status = 'ativa'),
         h.capacity,
         (SELECT count(*)::int FROM house_stay s
           WHERE s.house_id = h.id
             AND (s.started_at AT TIME ZONE 'America/Sao_Paulo')::date
                 BETWEEN p_de AND p_ate),
         (SELECT count(*)::int FROM house_stay s
           WHERE s.house_id = h.id AND s.ended_at IS NOT NULL
             AND (s.ended_at AT TIME ZONE 'America/Sao_Paulo')::date
                 BETWEEN p_de AND p_ate),
         (SELECT count(*)::int FROM incident i
           WHERE i.house_id = h.id
             AND (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date
                 BETWEEN p_de AND p_ate),
         (SELECT count(*)::int FROM life_milestone m
           WHERE m.house_id = h.id AND m.happened_on BETWEEN p_de AND p_ate)
    FROM house h
   WHERE h.institution_id = (SELECT institution_id FROM app_user WHERE id = app_current_user())
     AND app_current_role() IN ('gestor_geral','admin_tecnico')
   ORDER BY h.code;
$$;

REVOKE ALL ON FUNCTION app_panorama_das_casas(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_panorama_das_casas(date, date) TO rede_app;
