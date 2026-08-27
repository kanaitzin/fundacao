# Pendências institucionais (§33.4) — como cada uma está tratada no código

Regra: pendência vira **configuração, feature flag ou interface desacoplada** —
nunca regra invisível. Nenhuma foi "inventada".

| # | Pendência | Tratamento atual |
|---|---|---|
| 1 | Quem administra medicamentos em cada período | Protocolo será configurável por casa/período (Fase 4). Modelo já separa "quem confirma = quem administrou". **Bloqueia parte da Fase 4** — perguntar antes do piloto. |
| 2 | Horários da Enfermagem, cobertura noturna, prazo de triagem | Campos de escala prontos (`work_schedule`); prazo de triagem será parâmetro (Fase 4). |
| 3 | Acesso da equipe técnica fora da escala | `SHIFT_WINDOW_MODE` por papel; técnica em `observe` até definição. |
| 4 | Horário oficial do Líder Noturno Geral | `NIGHT_LEADER_START/END` no `.env` (19h–7h como hipótese configurável). |
| 5 | Relatórios obrigatórios no piloto | Backlog da Fase 6 marca todos como candidatos; seleção com Marcelo. |
| 6 | Permissões de fotos em memórias | Modelo `MemoryRecord`+`PhotoAuthorization` planejado; upload desabilitado por flag até confirmação. |
| 7 | Aparelhos institucionais disponíveis (offline) | Registro de aparelho designado por casa entra na Fase 3; confirmação de medicamento offline restrita a ele (§11.7). |
| 8 | Códigos oficiais das unidades | Seed usa AI1–AI4/ARM1–ARM4 como preliminares; troca é um UPDATE de `house.code` sem impacto estrutural (IDs internos são UUID). |
| 9 | Campos finais de cadastro/PIA/passagens/protocolos | Aguardando documentos do Marcelo (§33.3); formulários da Fase 2/5 serão versionáveis. |
| 10 | Critérios de aceite do piloto e autoridade | A registrar na Fase 7; homologação controlada prevista no plano. |

## Decisões institucionais tomadas durante a construção

Registradas aqui para que ninguém precise adivinhar depois de onde vieram —
e para que a equipe possa reverter uma delas se discordar.

| Data | Decisão | Quem decidiu | O que mudou no código |
|---|---|---|---|
| 27/08/2026 | Na caixa de transferências recebidas, o **nome completo** do acolhido e a **unidade de origem** aparecem antes do aceite | Leonardo (Fundação) | `app_transfer_inbox` passou a devolver nome, idade, origem, motivo e quem pediu. O **perfil** — saúde, documentos, medicamentos, benefícios, narrativas e histórico — continua fechado até o aceite. Justificativa: aceitar ou recusar uma criança sem saber quem ela é não é decisão, é sorteio; e recusar exige motivo escrito |
| 27/08/2026 | As duas coordenações **conversam dentro do sistema** sobre uma solicitação de transferência | Leonardo (Fundação) | Tabela `transfer_message`, restrita às coordenações das duas casas envolvidas, com mensagens imutáveis. Substitui a ligação e o WhatsApp (§3.3) sem que ninguém entre na casa do outro |
| 27/08/2026 | Recusa de transferência **exige motivo** e fica registrada **nas duas casas** | Leonardo (Fundação) | `app_decline_transfer` (mínimo 15 caracteres) grava um evento de auditoria para cada casa; a origem lê a justificativa na própria caixa "Da casa" |

## Documentos a solicitar ao Marcelo (§33.3)

1. agenda/rotina real (diária/semanal); 2. folha real de administração de medicamentos;
3. formulário de ingresso/PIA; 4. modelo de passagem individual e do Líder Diurno;
5. modelos de evolução/acompanhamento da técnica; 6. formulários de ocorrência/contenção;
7. exemplo de escala 12x36 e horários da técnica/Enfermagem (nomes ocultáveis).

Se não existirem, desenhamos a partir dos requisitos e submetemos à validação
operacional antes de tornar definitivo.
