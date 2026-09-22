-- ============================================================
-- 1550 — A contenção confere a casa
--
-- Achado por MEDIÇÃO, e não por leitura de código: depois de a suíte inteira
-- rodar — 892 testes —, dezenove tabelas continuavam VAZIAS, e a estatística de
-- inserções do banco (`pg_stat_user_tables.n_tup_ins`) separou as que foram
-- escritas e limpas das que **nunca receberam uma linha em teste nenhum**. Eram
-- seis, e quatro delas estão vazias por decisão escrita: a `work_schedule`
-- (MORTA), a `medication_authorization` (dormente desde 08/09) e o
-- `medication_protocol` com o seu histórico — *"o protocolo por período e a
-- autorização nominal deixaram de DECIDIR em 08/09"*, e as rotas de escrita
-- saíram; ler o que a casa decidiu em agosto continua sendo história dela.
--
-- Sobraram DUAS superfícies que ninguém nunca exercitou. Uma estava correta —
-- a saída de medicamentos com o acolhido, que confere a casa, o cargo e tem
-- índice único. A outra tinha um buraco.
--
-- ------------------------------------------------------------
-- O BURACO: a inserção da contenção não confere a casa.
--
-- `irest_insert` exige apenas `recorded_by = app_current_user()` — que a pessoa
-- não assine no lugar de outra. **Nada exige que a ocorrência esteja no alcance
-- dela.** E a chave estrangeira não ajuda: ela é conferida como DONA da tabela,
-- por fora do RLS, então apontar para uma ocorrência de outra casa passa.
--
-- O serviço também não conferia: `addRestraint` era o único dos irmãos que não
-- chamava a conferência de escopo — `addSynthesis`, `addProtected` e os anexos
-- chamam. Uma conta de outra casa, com o uuid da ocorrência na mão, escrevia uma
-- contenção na ocorrência de uma criança que ela não alcança — e a casa dela
-- depois LERIA essa linha, assinada por um estranho.
--
-- **Contenção é o registro mais grave que este sistema guarda sobre uma
-- criança**: o que foi feito com o corpo dela, por quem, por quanto tempo. É
-- append-only de propósito — não tem UPDATE nem DELETE. Uma linha falsa aqui não
-- se corrige depois.
--
-- POR QUE NINGUÉM VIU: nenhum teste jamais inseriu uma contenção. A tabela
-- chegava vazia da semente e continuava vazia depois da suíte — e superfície sem
-- dado nunca exercitada é superfície sem teste. É a lição da fase 141 outra vez,
-- e agora medida em vez de lembrada.
--
-- A correção é nos DOIS lugares, como manda a lição da fase 123: mexer só na
-- política deixaria a recusa chegar em inglês de Postgres à tela de quem
-- registra uma contenção às 3h; mexer só no serviço deixaria a porta do banco
-- aberta para qualquer caminho novo.
-- ============================================================

DROP POLICY IF EXISTS irest_insert ON incident_restraint;

CREATE POLICY irest_insert ON incident_restraint FOR INSERT TO rede_app
  WITH CHECK (
    -- Quem assina é quem está registrando. Continua valendo.
    recorded_by = app_current_user()
    -- E a ocorrência é de uma casa no alcance de quem escreve (1550).
    AND EXISTS (
      SELECT 1 FROM incident i
       WHERE i.id = incident_restraint.incident_id
         AND app_house_in_scope(i.house_id))
  );

COMMENT ON TABLE incident_restraint IS
  'A contenção física: os fatos antecedentes, o local, quem estava presente, as tentativas anteriores, o método, a duração e o que se fez depois. Uma por ocorrência (chave primária no incident_id), append-only, e só de ocorrência que quem escreve alcança (1550). O sistema não avalia se a medida foi adequada — a análise é da equipe técnica.';
