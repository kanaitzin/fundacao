-- ============================================================
-- 1530 — O Líder Diurno lê a ocorrência protegida
--
-- Decisão da Fundação em 22/09. A conferência daquele dia achou uma assimetria e
-- a levou a ela: a regra da confidencialidade que ela descreveu nomeia três —
-- *"equipe técnica, coordenador e educador líder"* — e o sistema tinha DUAS
-- respostas diferentes para o que parecia a mesma pergunta.
--
--   * o RELATO restrito (`app_pode_ler_relato`, 0300/0730) inclui o Líder
--     Diurno, com a razão escrita: *"quem está com a criança às 23h precisa saber
--     o que já foi registrado sobre ela, para não repetir uma pergunta que já
--     feriu"*;
--   * o BLOCO PROTEGIDO da ocorrência (`iprot_select`, 0320) não: só o autor, a
--     equipe técnica, a coordenação, e a Enfermagem quando o registro é de saúde.
--
-- Eu NÃO desfiz a assimetria sozinho, e a razão está no §9: ocorrência protegida
-- é material mais pesado que relato — a fala espontânea da criança e os sinais
-- observados, em suspeita de violência ou de abuso —, e ampliar quem a lê não é
-- conserto de simetria. Perguntada, a Fundação respondeu: **incluir o Líder
-- Diurno.**
--
-- O QUE ELE PASSA A LER, e o que continua fechado. Ele lê o bloco protegido das
-- ocorrências das CASAS EM QUE TRABALHA — `app_house_in_scope` continua sendo a
-- primeira condição, e não muda. A SÍNTESE técnica (`incident_synthesis`)
-- continua fora: ela é a leitura que a equipe técnica faz do caso, e não o
-- registro do que aconteceu; quem a escreve escreve para o processo, e o §7 já a
-- reservou a três cargos.
--
-- E A LEITURA PASSA A FICAR REGISTRADA — para todos, não só para ele. Hoje
-- nenhuma leitura do bloco protegido deixa linha: a auditoria registra quem
-- ESCREVEU (`incident.protected`) e não quem abriu. Ampliar quem lê o material
-- mais pesado do sistema sem rastro nenhum seria a única mudança desta fase que
-- eu não saberia defender numa audiência, e a casa já tem o precedente e o
-- vocabulário para isto: `person.judicial_view` — *"Dado judicial consultado"* —
-- desde a fase 112. **Não é a porta com finalidade escrita** que a Fundação
-- recusou para este caso: é uma linha de auditoria, sem cerimônia e sem
-- perguntar nada a quem abre o caso para trabalhar.
-- ============================================================

DROP POLICY IF EXISTS iprot_select ON incident_protected;

-- Continua mais estreita que a da ocorrência, de propósito — só ganhou um cargo.
CREATE POLICY iprot_select ON incident_protected FOR SELECT TO rede_app USING (
  app_house_in_scope(house_id) AND (
    author_id = app_current_user()
    -- 22/09: o educador líder entrou, pela mesma razão do relato restrito — ele
    -- é quem está com a criança quando ela volta a falar do assunto.
    OR app_current_role() IN ('equipe_tecnica','coordenador','lider_diurno')
    OR (app_current_role() = 'enfermagem' AND health_related)
  )
);

COMMENT ON TABLE incident_protected IS
  'A fala espontânea da criança e os sinais observados. Lido pelo autor, pela equipe técnica, pela coordenação, pelo Líder Diurno (22/09) e pela Enfermagem quando o registro é de saúde — sempre nas casas em alcance. Toda leitura deixa linha de auditoria (incident.protected_view).';
