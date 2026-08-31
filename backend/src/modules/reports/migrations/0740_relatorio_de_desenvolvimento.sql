-- ---------------------------------------------------------------------------
-- Relatório de DESENVOLVIMENTO DA CRIANÇA NA CASA.
--
-- Nasceu de uma necessidade que os relatórios existentes não cobriam. Havia o
-- judiciário, que responde ao Juízo; o de saúde, que é da Enfermagem; o
-- mensal, que olha o período. Faltava o que a coordenação e a equipe técnica
-- precisam para enxergar a criança inteira: como ela chegou, como está na
-- escola, quais apoios tem, o que a saúde acompanha, o que ela come e o que
-- não pode comer, o que aconteceu de difícil, e o que ela conquistou.
--
-- Esse último ponto é o que mais importa e o que quase sempre falta. Um
-- relatório feito só de ocorrências e faltas devolve uma pessoa que não
-- existe: some a apresentação no coral, some a tarefa entregue sem lembrete,
-- some o dia em que ela pediu ajuda pela primeira vez. E é esse documento
-- reduzido que segue para a audiência, para a escola, para o próximo serviço.
-- O registro passa a trabalhar contra quem ele deveria proteger.
--
-- Por isso este tipo puxa também `memory_record` e `education_evolution`, e
-- por isso as seções em que não há nada dizem "não há", em vez de sumir: a
-- seção ausente vira dúvida, e a frase escrita vira informação.
-- ---------------------------------------------------------------------------

ALTER TABLE report_document DROP CONSTRAINT IF EXISTS report_document_kind_check;
ALTER TABLE report_document ADD CONSTRAINT report_document_kind_check CHECK (kind IN (
  'diario','semanal','mensal','periodo','individual','medicamentos',
  'atividades','ocorrencias','reuniao_tecnica','audiencia','judiciario',
  'mensal_da_casa','atas_consolidadas','alimentacao','historico',
  'saude','beneficios','desenvolvimento'));
