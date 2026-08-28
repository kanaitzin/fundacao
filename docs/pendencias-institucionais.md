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
| 27/08/2026 | **Os celulares de acesso são pessoais. Existe UM aparelho institucional, com a equipe técnica/coordenação** | Marcelo, via Leonardo | `institutional_device` aceita aparelho da INSTITUIÇÃO (sem casa), registrado pelo Gestor Geral e válido nas oito. **Consequência operacional, registrada para não se perder:** com um aparelho só, e ele não estando com quem faz o plantão, a confirmação de medicamento OFFLINE deixa de existir na prática para o educador — ele confirma online. Isso não é defeito do sistema; é a realidade da instituição. Decidir com a equipe se (a) fica assim, (b) a Fundação designa mais aparelhos, ou (c) a confirmação offline passa a valer no aparelho pessoal com outra proteção |
| 27/08/2026 | **A coordenação cadastra a equipe da casa e a Enfermagem; contas de alcance institucional são do Gestor Geral** | padrão protetivo, a confirmar | Tabela `staff_role_grant`. Se a coordenação pudesse criar Gestor Geral, bastaria cadastrar alguém para enxergar as oito casas — o isolamento do §5.13 cairia por dentro. Mudar é uma linha de dado, não de código |
| 28/08/2026 | **Limite de vagas por casa: 20 nas oito unidades, alterável pela coordenação com motivo registrado** | Leonardo (Fundação) | Coluna `house.capacity` (padrão 20) e `house_capacity_change` como histórico. O limite é da casa: mudar a Casa 03 não mexe nas outras sete |
| 28/08/2026 | **Casa cheia não bloqueia acolhimento; exige justificativa registrada** | padrão protetivo, a confirmar | `app_admit_person_full` recusa apenas quando não há justificativa (mínimo 15 caracteres) e marca `over_capacity`. Uma criança com guia na mão às 23h não pode esbarrar num CHECK; e a casa passa a mostrar "21 de 20", em vez de o excesso virar vaga fantasma. **Se a Fundação preferir bloqueio real, é uma condição a inverter — mas a escolha precisa ser consciente** |
| 28/08/2026 | **O motivo judicial do acolhimento é área restrita: equipe técnica, coordenação e Gestor Geral** | §13.1, a confirmar com a equipe | Tabela `judicial_record` com policy própria. O educador não lê o motivo nem consultando o banco direto. Saber por que a criança foi retirada de casa muda o olhar de quem cuida |
| 28/08/2026 | **Quem redige o acompanhamento mensal e o relatório ao Judiciário não aprova o próprio texto** | padrão protetivo, a confirmar | `app_approve_followup` e `app_approve_report` recusam `autor = aprovador`. Vale inclusive quando a coordenação redige. Mesma ressalva da comunicação externa: em casa com uma única técnica, ajusta-se quem aprova, não o fluxo |
| 28/08/2026 | **Falha persistente de arquivamento no Drive escala em três tentativas** | padrão protetivo, a confirmar | `app_archive_transition` devolve `escalar` quando a terceira tentativa falha; o serviço publica escalonamento para técnica/coordenação. Número ajustável sem tocar no fluxo |
| 28/08/2026 | **As senhas de gov.br, INSS, CTPS e banco dos acolhidos ficam no sistema, com a coordenação de cada casa** | Leonardo (Fundação) | Tabela `person_credential`: segredo cifrado em AES-256-GCM com chave no ambiente, coluna ilegível pelo papel da aplicação, abertura por comando que exige finalidade e registra antes de devolver, lista com dica em vez da senha. Gestor Geral só por exceção justificada, marcada como exceção. Razão da decisão: sem isso, os dados continuariam numa planilha compartilhada sem cifra nem registro |
| 28/08/2026 | **O conteúdo do cofre físico não entra no sistema** | Leonardo (Fundação) | Nenhum campo criado. O registro segue onde está hoje |
| 28/08/2026 | **A comunicação operacional migra do WhatsApp para o sistema** | Leonardo (Fundação) | O sistema registra que houve contato e por qual meio; o conteúdo fica no sistema. **Condição de sucesso, não técnica:** registrar aqui precisa ser mais rápido do que digitar no aplicativo. Se for mais lento, o WhatsApp volta sem aviso — é isso que a Fase 7 tem de medir |
| 28/08/2026 | **Líder Diurno, equipe técnica, coordenação e Enfermagem marcam compromissos na linha do tempo** | Leonardo (Fundação) | Tabela `commitment`: alvo individual ou coletivo, data e hora exatas, repetição (uma vez, diária, semanal, quinzenal, mensal) e prazo final **ou indeterminado com motivo escrito**. O educador executa e confirma; marcar é de quem responde pelo planejamento |
| 28/08/2026 | **Compromisso é regra; a linha do tempo do dia é ocorrência** | decisão técnica | A agenda futura é PROJETADA (`app_commitment_agenda`), não materializada: marcar a consulta de outubro não cria sessenta linhas, e mudar o horário não reescreve o que já passou. Só o dia corrente vira `activity`, mantendo confirmação, exceção e offline como já funcionam |
| 28/08/2026 | **O compromisso pode ter educador responsável nomeado ou ficar para "quem estiver no plantão do horário"** | Leonardo (Fundação) | `commitment.responsible_mode`. Com nome, a ocorrência do dia nasce atribuída e aparece em "Minhas responsabilidades"; sem nome, é da casa e quem está de serviço assume. Nomear alguém fora da escala daquele horário **avisa e não bloqueia** — escala muda, troca de plantão existe, e a saída pode ter sido combinada exatamente assim |

## Documentos a solicitar ao Marcelo (§33.3)

1. agenda/rotina real (diária/semanal); 2. folha real de administração de medicamentos;
3. formulário de ingresso/PIA; 4. modelo de passagem individual e do Líder Diurno;
5. modelos de evolução/acompanhamento da técnica; 6. formulários de ocorrência/contenção;
7. exemplo de escala 12x36 e horários da técnica/Enfermagem (nomes ocultáveis).

Se não existirem, desenhamos a partir dos requisitos e submetemos à validação
operacional antes de tornar definitivo.
