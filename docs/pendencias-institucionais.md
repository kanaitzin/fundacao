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
| 7 | Aparelhos institucionais disponíveis (offline) | ✅ **Resolvido no sistema.** A coordenação registra o aparelho da casa e recebe um código mostrado uma vez; o banco guarda só o hash e o **servidor** decide contra o registro (§11.7). Falta a Fundação dizer quais aparelhos existem em cada casa — agora é cadastro, não suposição. |
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
| 27/08/2026 | O plantão **noturno pertence ao dia em que começou** (19h–7h) | padrão protetivo, a confirmar | `dataDoPlantao()` normaliza; `NIGHT_SHIFT_END_HOUR` no `.env`. Sem isso, quem abria às 23h50 e quem abria às 00h10 criavam dois plantões para a mesma noite, e o Líder Noturno não encontrava as ATAs das casas |
| 27/08/2026 | **Quem deve assinar a passagem** vem da escala quando ela existe | padrão protetivo, a confirmar | `app_missing_handovers` usa `work_schedule` filtrado por turno; sem escala cadastrada, cai no vínculo da casa e **declara** isso no campo `fonte`, para a pendência ser lida como "escala não cadastrada" e não como falta de alguém |
| 27/08/2026 | **Quem redige a comunicação externa não a aprova** | padrão protetivo, a confirmar | Gatilho `extcom_guard` recusa `approved_by = created_by`. Se a Fundação tiver casas com uma única técnica, muda-se a função — não o fluxo |

## Documentos a solicitar ao Marcelo (§33.3)

1. agenda/rotina real (diária/semanal); 2. folha real de administração de medicamentos;
3. formulário de ingresso/PIA; 4. modelo de passagem individual e do Líder Diurno;
5. modelos de evolução/acompanhamento da técnica; 6. formulários de ocorrência/contenção;
7. exemplo de escala 12x36 e horários da técnica/Enfermagem (nomes ocultáveis).

Se não existirem, desenhamos a partir dos requisitos e submetemos à validação
operacional antes de tornar definitivo.
