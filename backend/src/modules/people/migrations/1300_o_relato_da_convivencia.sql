-- ============================================================
-- 1300 — O relato da convivência familiar, sem prazo e sem cobrança
--
-- Esta migração teve DUAS versões do pedido, e a segunda é melhor que a
-- primeira. Vale registrar as duas, porque a diferença entre elas é o desenho
-- inteiro.
--
-- EM 15/09 ele disse (pergunta R3 do roteiro):
--
--   *"A criança, quando entrar de volta, tem que ter um relato com ela. Mesmo
--   que não tenha sido preenchido no dia, porque a criança não quis falar,
--   esse acompanhamento pode ficar ABERTO para ser preenchido por algum
--   educador depois de uma semana."*
--
-- Eu ia construir isso como uma PENDÊNCIA: uma linha por saída, criada no
-- retorno, com estado `aberto`, e um lembrete depois de sete dias.
--
-- ENTÃO ELE CORRIGIU:
--
--   *"Acho mais fácil não dar um prazo, mas deixar em aberto para ser
--   registrado quando de fato tivermos uma informação. Assim, quando o jovem
--   sair para a visita em casa, se abre essa pergunta para ser respondida
--   depois — dessa forma não haverá uma pressão para arrancar a informação da
--   criança. Mas isso pode ser registrado quantas vezes for necessário, por
--   qualquer educador, tudo ficando no perfil do jovem. Fica mais fácil e
--   fluido."*
--
-- ---
--
-- O QUE MUDA, E POR QUE ELE ESTÁ CERTO
--
-- **Some o prazo, e some a pendência.** Uma pendência com sete dias vira, na
-- prática, uma cobrança sobre o educador — e o educador só tem uma forma de
-- baixar uma cobrança dessas: perguntar de novo para a criança. *"Não haverá
-- uma pressão para arrancar a informação"* é uma frase sobre o adolescente que
-- voltou calado, e um campo com prazo o transformaria numa tarefa vencida.
--
-- **Some o registro único, e entra a CONVERSA.** Não é um relato, é quantos
-- forem precisos: a criança que não falou no domingo pode falar na terça, e o
-- que ela disser na terça não substitui o que se observou no domingo — soma.
-- Por isso a tabela é de LINHAS e não de colunas em `family_stay`: uma coluna
-- só aceita a última versão, e a última versão apaga a primeira.
--
-- **A porta abre na SAÍDA, e não no retorno.** *"Quando o jovem sair para a
-- visita em casa, se abre essa pergunta."* É o momento certo: a equipe do
-- turno seguinte já vê que há uma visita em curso e que aquele espaço existe,
-- em vez de descobrir isso só quando alguém registra a volta.
--
-- **E ela não fecha.** Não há `status`, não há `encerrado_em`, não há quem
-- feche. Um relato escrito seis meses depois — *"hoje ela contou o que
-- aconteceu naquele fim de semana de setembro"* — é exatamente o registro que
-- mais importa, e um campo `fechado` o teria recusado.
--
-- ---
--
-- QUEM ESCREVE: QUALQUER PESSOA DA EQUIPE DA CASA, O EDUCADOR INCLUSIVE
--
-- *"Por qualquer educador"*, com as palavras dele. E é o desenho certo por uma
-- razão que ele não precisou dizer: a criança conta para quem ela confia, e
-- quem ela confia quase nunca é quem tem o cargo mais alto. Exigir a técnica
-- aqui faria o educador contar para a técnica, que escreveria — e o registro
-- perderia o nome de quem ouviu.
--
-- ---
--
-- A ÚNICA COISA QUE AVISA ALGUÉM: *"SE HOUVE ALGUMA ALTERAÇÃO"*
--
-- Da mesma resposta de 15/09: *"esses dados são extremamente sensíveis e têm
-- que ser armazenados. Se houve alguma alteração, sim, tem que ser
-- notificado."*
--
-- Então existe UM sinalizador por linha, e ele não classifica a criança: ele
-- diz *"aqui tem coisa para a técnica ver"*. Quando marcado, a equipe técnica
-- e a coordenação da casa recebem aviso. Quando não, ninguém é avisado de
-- nada — e é isso que mantém o campo utilizável para o relato comum, que é a
-- maioria. Um aviso a cada linha escrita ensinaria a equipe a ignorar o sino, e
-- aí o aviso que importa some junto.
--
-- Quem dispara é o SERVIÇO, pelo barramento, e não esta função: `people` não
-- pode depender de `notifications`, que é removível. O aviso NÃO carrega o
-- texto — ele diz que existe e onde está, porque notificação aparece em tela
-- bloqueada (§19).
--
-- ---
--
-- E O RELATO NÃO SE APAGA NEM SE REESCREVE
--
-- Regra 3: nada some. Escreveu errado, escreve de novo — a linha nova fica ao
-- lado da antiga, com a hora das duas. Num registro sobre o que uma criança
-- contou da própria família, a versão anterior é informação, e não lixo.
-- ============================================================

CREATE TABLE IF NOT EXISTS family_stay_note (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_stay_id uuid NOT NULL REFERENCES family_stay(id),
  -- Casa e pessoa vêm copiadas da saída, e não por JOIN: é o que deixa a RLS
  -- desta tabela ser lida sozinha, sem depender da política de outra.
  house_id      uuid NOT NULL REFERENCES house(id),
  person_id     uuid NOT NULL REFERENCES person(id),
  -- O que foi observado ou o que ela contou. Fato, nunca rótulo (§8.14).
  narrative     text NOT NULL CHECK (length(btrim(narrative)) >= 10),
  -- *"Se houve alguma alteração, sim, tem que ser notificado."* É um sinal
  -- para a técnica olhar — não uma classificação da criança nem da família.
  changed       boolean NOT NULL DEFAULT false,
  created_by    uuid NOT NULL REFERENCES app_user(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relato_saida ON family_stay_note (family_stay_id, created_at);
CREATE INDEX IF NOT EXISTS idx_relato_pessoa ON family_stay_note (person_id, created_at DESC);
-- Os que pedem olhar da técnica, na casa: é a única lista que o sistema faz
-- desta tabela, e ela é de registros, nunca de crianças.
CREATE INDEX IF NOT EXISTS idx_relato_alteracao
  ON family_stay_note (house_id, created_at DESC) WHERE changed;

ALTER TABLE family_stay_note ENABLE ROW LEVEL SECURITY;

/*
 * QUEM LÊ: toda a equipe da casa, como a própria `family_stay`.
 *
 * O educador escreve e lê. Ele é quem recebe a criança na porta às 18h de
 * domingo, e esconder dele o que o colega do turno da manhã observou seria
 * pedir que ele perguntasse tudo de novo — para a criança.
 */
CREATE POLICY fsn_select ON family_stay_note FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
/* A escrita passa pela função, que confere a saída e o alcance da casa. */
CREATE POLICY fsn_insert ON family_stay_note FOR INSERT TO rede_app WITH CHECK (false);
GRANT SELECT ON family_stay_note TO rede_app;
/* Nada se apaga e nada se reescreve: a linha nova fica ao lado da antiga. */
REVOKE UPDATE, DELETE ON family_stay_note FROM rede_app;

-- ------------------------------------------------------------
-- Escrever um relato.
--
-- Sem prazo, sem estado e sem limite de quantos. A saída não precisa estar
-- encerrada: *"quando o jovem sair para a visita em casa, se abre essa
-- pergunta"* — e o educador do sábado pode registrar o telefonema de sábado.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_relatar_convivencia(
  p_stay uuid, p_relato text, p_alteracao boolean)
/* `de_quem` e `na_casa`, e não `person_id` e `house_id`: parâmetro de saída com
   o mesmo nome de uma coluna torna a referência ambígua, e o Postgres recusa em
   tempo de EXECUÇÃO — não de criação. Foi a armadilha da 1010, e ela só aparece
   na primeira chamada de verdade. */
RETURNS TABLE (relato_id uuid, de_quem uuid, na_casa uuid) AS $$
DECLARE f record; v_id uuid;
BEGIN
  SELECT * INTO f FROM family_stay WHERE id = p_stay;
  IF f IS NULL OR NOT app_house_in_scope(f.house_id) THEN
    RAISE EXCEPTION 'saida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  /*
   * NENHUMA CONFERÊNCIA DE CARGO AQUI, e isso é decisão escrita.
   *
   * *"Pode ser registrado quantas vezes for necessário, por qualquer
   * educador."* Quem alcança a casa escreve. A criança conta para quem ela
   * confia, e quem ela confia quase nunca é quem tem o cargo mais alto —
   * exigir a técnica faria o educador contar para a técnica, que escreveria, e
   * o registro perderia o nome de quem ouviu.
   */

  IF length(btrim(coalesce(p_relato, ''))) < 10 THEN
    RAISE EXCEPTION 'relato_curto_demais' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO family_stay_note (family_stay_id, house_id, person_id,
                                narrative, changed, created_by)
  VALUES (p_stay, f.house_id, f.person_id, btrim(p_relato),
          coalesce(p_alteracao, false), app_current_user())
  RETURNING family_stay_note.id INTO v_id;

  /*
   * O AVISO NÃO SAI DAQUI.
   *
   * *"Se houve alguma alteração, sim, tem que ser notificado."* — e quem
   * notifica é o serviço, publicando `escalation.requested` no barramento,
   * como a ocorrência e a ATA já fazem. Chamar `app_emit_escalation` de dentro
   * desta função amarraria a partição `people` à `notifications`, que é
   * REMOVÍVEL: tirar o módulo de avisos passaria a derrubar o registro de um
   * relato sobre uma criança, e a ordem certa é a inversa — sem avisos,
   * ninguém é avisado, e tudo o mais continua.
   *
   * A função devolve a criança e a casa justamente para o serviço poder montar
   * o aviso sem uma segunda consulta.
   */
  RETURN QUERY SELECT v_id, f.person_id, f.house_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_relatar_convivencia(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_relatar_convivencia(uuid, text, boolean) TO rede_app;
