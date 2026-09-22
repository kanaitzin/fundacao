-- ============================================================
-- 1500 — Quando cada visitante pode vir, e por que alguém saiu da folha
--
-- Pedido da Fundação em 22/09: *"todos devem ter horários e dias de visitação"*,
-- a portaria *"vendo os dias de visita de cada um deles"*, e — *"caso alguém seja
-- removido que tenha motivos para tal escrito para registro"*.
--
-- O QUE FALTAVA, medido. A 1120 deu à guarita quem pode entrar: foto, nome,
-- vínculo, CPF e telefone, com a autorização explícita da técnica ou da
-- coordenação. Ela não diz QUANDO — e sem isso a folha transfere para a guarita
-- uma decisão que é da casa. Quem está no portão às 21h de uma terça fica com
-- duas saídas ruins: deixar entrar porque o nome está na lista, ou barrar um
-- familiar autorizado. As duas erram, e nenhuma é do porteiro.
--
-- E RETIRAR ALGUÉM DA FOLHA não deixava rastro do motivo: a auditoria registra
-- QUEM retirou e QUANDO — e nada mais, porque log não copia conteúdo sensível
-- (§5), e *"a genitora apareceu alterada na última visita"* é exatamente isso.
-- Seis meses depois, a família chega ao portão, ouve "não está na folha", e não
-- há ninguém na casa que saiba responder por quê.
--
-- ------------------------------------------------------------
-- AS TRÊS DECISÕES DESTE ARQUIVO
--
-- 1. O DIA E A HORA SÃO DO CONTATO, e não da casa. Uma regra única de horário
--    de visita seria mais simples e estaria errada: a avó que vem de ônibus de
--    outra cidade vem no sábado de manhã; o padrinho que trabalha até as 18h vem
--    à noite; e há visita que a Justiça marcou em dia fixo. A folha é por
--    criança justamente porque a vida de cada uma tem um desenho.
--
-- 2. NÃO SÃO OBRIGATÓRIOS NO BANCO — é a mesma decisão da FOTO na 1120, e pelo
--    mesmo motivo: travar a autorização em quem ainda não combinou o horário
--    deixaria o visitante de verdade do lado de fora. O banco garante a FORMA
--    (dia entre domingo e sábado, faixa que começa antes de terminar); quem
--    COBRA que o horário seja combinado é a tela, no momento de autorizar, e a
--    folha diz por extenso quando não há: *"sem dia combinado — confirme com a
--    casa"*. O porteiro nunca fica sem instrução.
--
-- 3. O MOTIVO DA RETIRADA VAI PARA TABELA PRÓPRIA, e não para uma coluna em
--    `person_contact`. Dois motivos, e os dois são regra da casa. **Nada se
--    sobrescreve:** uma coluna guardaria só a última retirada, e um contato pode
--    ser retirado, reautorizado e retirado de novo — a segunda retirada apagaria
--    a primeira, que é justamente a que explica a história. E **o motivo não é
--    metadado:** ele conta algo sobre uma família, então não vai para o log de
--    auditoria; vai para uma tabela com RLS própria, lida por quem responde por
--    quem entra na casa.
-- ============================================================

-- ------------------------------------------------------------
-- QUANDO ESTE VISITANTE PODE VIR
-- ------------------------------------------------------------
ALTER TABLE person_contact
  ADD COLUMN IF NOT EXISTS visit_weekdays smallint[],
  ADD COLUMN IF NOT EXISTS visit_from     time,
  ADD COLUMN IF NOT EXISTS visit_to       time,
  ADD COLUMN IF NOT EXISTS visit_note     text;

-- Domingo a sábado, na numeração do `dow` do Postgres — a mesma da rotina da
-- casa (`routine_item.weekdays`). Duas numerações no mesmo banco é como uma
-- terça vira uma quarta na folha impressa.
ALTER TABLE person_contact ADD CONSTRAINT contato_dias_de_visita
  CHECK (visit_weekdays IS NULL
         OR (array_length(visit_weekdays, 1) BETWEEN 1 AND 7
             AND visit_weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]));

-- A faixa é inteira ou não é: uma hora de início sem fim não diz nada a quem
-- está na guarita. E começa antes de terminar — "das 18h às 9h" é erro de
-- digitação, e ele chegaria impresso.
ALTER TABLE person_contact ADD CONSTRAINT contato_faixa_de_visita
  CHECK ((visit_from IS NULL) = (visit_to IS NULL)
         AND (visit_from IS NULL OR visit_from < visit_to));

COMMENT ON COLUMN person_contact.visit_weekdays IS
  'Dias em que este visitante pode vir, na numeração do dow (0 = domingo). Nulo = ainda não combinado; a folha da portaria diz isso por extenso.';
COMMENT ON COLUMN person_contact.visit_from IS
  'Início da faixa de visita deste contato. Anda junto com visit_to.';
COMMENT ON COLUMN person_contact.visit_note IS
  'O que a guarita precisa saber além do dia e da hora — "sempre acompanhada pela técnica", "entra pelo portão dos fundos". Sai impresso.';

-- ------------------------------------------------------------
-- POR QUE ALGUÉM ENTROU NA FOLHA, E POR QUE SAIU
--
-- Append-only, como todo histórico deste sistema: a aplicação insere e lê, e
-- não pode alterar nem apagar. O que aconteceu com uma família não se corrige
-- depois — escreve-se a linha seguinte.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_visit_change (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid NOT NULL REFERENCES person_contact(id),
  person_id   uuid NOT NULL REFERENCES person(id),
  authorized  boolean NOT NULL,
  reason      text,
  changed_by  uuid NOT NULL REFERENCES app_user(id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);

-- AUTORIZAR não precisa de justificativa — a autorização já é o ato, e a 1120
-- guarda quem a deu. RETIRAR precisa, e com dez caracteres: "mudou" não
-- responde a quem vai ouvir "não está na folha" no portão, e é essa pessoa que
-- esta linha existe para socorrer.
ALTER TABLE contact_visit_change ADD CONSTRAINT retirada_tem_motivo
  CHECK (authorized OR length(btrim(coalesce(reason, ''))) >= 10);

CREATE INDEX IF NOT EXISTS idx_contact_visit_change
  ON contact_visit_change (contact_id, changed_at DESC);

ALTER TABLE contact_visit_change ENABLE ROW LEVEL SECURITY;

/*
 * QUEM LÊ É QUEM RESPONDE POR QUEM ENTRA — os mesmos três de `ESCREVE_CONTATO`.
 *
 * O educador lê a LISTA de contatos desde 03/09 (ele precisa saber quem é a
 * madrinha que aparece no portão), e continua lendo. O que ele não lê é o
 * MOTIVO de alguém ter saído dela: é um juízo sobre um familiar, escrito pela
 * técnica, e espalhá-lo pelo plantão inteiro muda o que a técnica se sente à
 * vontade para escrever — e uma frase que não se escreve não protege ninguém.
 */
CREATE POLICY cvc_select ON contact_visit_change FOR SELECT TO rede_app
  USING (app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
         AND app_person_in_scope(person_id));
CREATE POLICY cvc_insert ON contact_visit_change FOR INSERT TO rede_app
  WITH CHECK (app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
              AND app_person_in_scope(person_id)
              AND changed_by = app_current_user());

GRANT SELECT, INSERT ON contact_visit_change TO rede_app;

COMMENT ON TABLE contact_visit_change IS
  'Cada vez que alguém entrou na folha da portaria ou saiu dela, com quem fez e por quê. Append-only: a retirada seguinte não apaga a anterior.';
