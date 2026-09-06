# Backlog rastreável por fases

Matriz requisito (Prompt Master) → implementação → teste. Atualizada a cada fase.

## ✅ Fase 0 — Validação (protótipo)

| Item | Onde | Validação |
|---|---|---|
| Protótipo navegável das telas por papel | `prototipo/rede-acolher-prototipo.html` | roteiro "ⓘ O que validar aqui" por tela, com a equipe da Casa 03 |

## ✅ Fase 1 — Fundação

| Requisito | Implementação | Teste |
|---|---|---|
| Login e-mail institucional + senha (§4.5, §33.2) | `auth.service.ts` | `fundacao.e2e` "login com credenciais válidas" |
| Sem enumeração de contas (§4.5) | mensagem genérica + `auth_find_user` | "mensagem genérica" |
| Força bruta (§4.5) | `login_attempt` persistido, 429 | "força bruta" |
| Revogação de sessão (§4.5) | sessões opacas, `revoked_at` | "logout revoga" |
| Reautenticação p/ sensíveis (§4.5) | `POST /auth/reauth`, `last_reauth_at` | "reautenticação" |
| Isolamento por casa na API (§5.13, cenário #1) | `HousesService` + 404 uniforme | "cenário #1" |
| Isolamento no banco (§4.4) | RLS + `app_house_in_scope` | "RLS direto no banco" |
| Gestor: 8 casas, 1 por vez, auditado (#28) | `house.open` + audit | "cenário #28" |
| Enfermagem: 8 casas (#35 — perímetro) | matriz de escopo | "cenário #35" |
| Coordenador sem limite de horário (#3) | sem janela p/ coordenador | "cenário #3" |
| Auditoria imutável (§20) | trigger `forbid_change` | "auditoria é imutável" |
| Desativado ≠ apagado (§5.1) | `active/deactivated_*`; sem DELETE p/ `rede_app` | revogação em massa; migração |
| PWA instalável (§4.1) | `vite-plugin-pwa`, manifest, SW | build gera `sw.js` + manifest |
| Sem segredos no código (#34) | `.env.example`; envs | inspeção; repositório limpo |
| Dados fictícios (#34) | `scripts/seed.ts` | seed |

## ✅ Fase 2 — Perfil do Acolhido

| Requisito | Implementação | Teste |
|---|---|---|
| Pessoa → episódio → permanência (§15.1) | migração 002 | "retorno cria novo episódio" |
| CPF único, validado e mascarado (§6.1, §3.1) | `common/cpf.ts`, índice único parcial | "CPF mascarado", "CPF inválido" |
| Verificação antes do cadastro, sem duplicata (#4) | `app_check_cpf` + `PeopleService.checkCpf` | "cenário #4" |
| Ativo em outra casa não revela conteúdo (§6.1.5) | veredito sem id/nome/casa | "CPF ativo em outra casa" |
| Ingresso urgente sem CPF vira pendência (§6.1) | `app_admit_person` + ID provisório | "cadastro sem CPF" |
| Retorno = novo episódio, histórico intacto (#5) | `app_readmit_person` | "cenário #5" |
| Nome social nas telas operacionais (§6.1) | projeção `publicPerson` | "perfil abre com alertas" |
| Alertas essenciais e restrições no topo (§6.4) | `ProfileService.get` | "perfil abre com alertas" |
| Documentos por categoria e papel (#24, §6.8) | `app_can_open_doc` + RLS | "cenário #24" |
| Existência de documento restrito sem conteúdo (§13.7) | `app_count_restricted_docs` | "cenário #24" |
| Educador não edita dados estruturais (§6.2) | guarda de papel + RLS | "educador não altera" |
| Relatório mínimo da cozinha (#25, §7) | `kitchenReport` | "cenário #25" |
| Benefícios só coordenação atual + gestor (§6.10) | `app_can_see_benefits` + RLS | "educador e enfermagem não acessam" |
| Reautenticação e finalidade obrigatórias (§6.10) | `BenefitsService` | "coordenação precisa de reautenticação" |
| Log por visualização, sem conteúdo bancário (§20) | auditoria com `purpose` | "log de benefícios" |
| Benefícios fora de telas gerais (#40) | ausentes da projeção do perfil | "cenário #40" |
| Transferência muda casa só no aceite (#6) | `app_accept_transfer` | "cenários #6, #7 e #39" |
| Origem perde acesso após efetivação (#7) | permanência encerrada + RLS | "cenários #6, #7 e #39" |
| Benefícios mudam de mãos na transferência (#39) | negativa explícita fora da casa atual | "cenários #6, #7 e #39" |
| Destino decide sem ver o perfil (§15.6) | `app_transfer_inbox` (origem, motivo, idade) | "cenários #6, #7 e #39" |
| Saída leva ao Acervo, técnica mantém continuidade (§15.2) | escopo do acervo no RLS | "saída leva o perfil ao acervo" |
| Sem exclusão simples (§3.3) | sem DELETE para `rede_app` | "exclusão comum não existe" |

### Achados de arquitetura desta fase

Dois fluxos revelaram, no teste, que operações de **transição de estado** não cabem em
escrita genérica sob RLS:

- **Aceite de transferência**: quem aceita é o destino, mas a operação precisa encerrar a
  permanência na origem — e o destino não tem (nem deve ter) escrita sobre a origem.
- **Admissão**: a visibilidade nasce da permanência, então no instante do `INSERT` a
  pessoa recém-criada é invisível ao próprio autor e o `RETURNING` falha.

Em ambos, a alternativa fácil seria afrouxar a política de isolamento. A solução adotada
foi a oposta: transformá-los em **comandos de sistema** (`SECURITY DEFINER`) que validam a
autorização internamente — exatamente o que o §25 pede ao exigir comandos específicos em
vez de atualização genérica. As políticas de permanência ficaram mais estritas, não menos
(migrações 004 e 005).

## ✅ Fase 3 — Operação do plantão

Construída já dentro da arquitetura de partições (ver `docs/arquitetura-modular.md`).

| Requisito | Implementação | Teste |
|---|---|---|
| Rotina versionada (§8.1) | módulo `routine`, `app_new_routine_version` | "alterar a rotina cria versão nova" |
| Só técnica/coordenação alteram rotina (§8.2) | guarda de papel + RLS | "educador não altera" |
| Geração do dia idempotente | `app_generate_day` | "gerar de novo não duplica" |
| Tarefa individual visível na visão da casa (#8) | timeline sem filtro no modo casa | "cenário #8" |
| Tarefa específica exige ciência (#9) | `activity_acknowledgement`, estado `ciente` | "cenário #9" |
| Ciência é pessoal e única | chave única + policy `user_id = app_current_user()` | "cenário #9" |
| Exceção exige justificativa neutra (§8.4) | `EXIGEM_JUSTIFICATIVA` | "exceção exige justificativa" |
| Vencida vira "sem confirmação", nunca "não realizada" (§8.5) | `app_mark_unconfirmed` | "vencida sem confirmação" |
| Escalonamento a técnica/coordenação, idempotente | `app_emit_escalation` + chave única | "escalonamento avisa e é idempotente" |
| Nada sensível na tela bloqueada (§19) | `safe_title` fixo | "notificação não revela conteúdo" |
| Substituição com cadeia completa (§8.3) | `substitution_request` | "substituição registra a cadeia" |
| Substituto precisa tomar ciência | notificação + estado `aguardando_ciencia` | "substituição registra a cadeia" |
| Atividade urgente do líder, com motivo (§8.2) | `createUrgent` + `CHECK` no banco | "atividade urgente do líder" |
| Chamada coletiva → registro individual (#10) | módulo `checks`, `app_confirm_check` | "cenário #10" |
| Sem marcação em lote silenciosa (§10, §11.2) | marcação individual + `check_bulk`, que DECLARA o ato | "conferência de mesa" |
| Chamada alcança só quem está na casa (§5.13) | policy `cr_insert` (migração 0150) | "cenário #10" |
| Linha do tempo unificada por provedores (§9) | `TimelineRegistry` no kernel | "linha do tempo agrega provedores" |
| Painel da casa sem ranking (§9, §3.3) | ordem alfabética, sem pontuação | "painel da casa sem ranking" |
| Offline preserva horário real (#16, §17.3) | `happened_at` ≠ `synced_at` | "cenário #16" |
| Idempotência da fila offline (§17.4) | `client_op_id` único | "reenvio não duplica" |
| Medicamento offline só em aparelho institucional (§11.7) | recusa na porta de entrada | "aparelho institucional" |
| Conflito preserva versões, decisão humana (#17) | `sync_conflict` com as duas versões | "cenário #17" |
| Aparelho só limpa o confirmado (§17.2) | `podeLimpar` na resposta | "o aparelho só limpa o confirmado" |
| Fronteiras entre partições | `test/arquitetura.spec.ts` | 7 verificações automáticas |

### Achados desta fase

- **Fuso horário não é cosmético.** O sistema raciocina em `America/Sao_Paulo`
  (§23): às 02h UTC ainda é ontem em Porto Alegre, e um registro do plantão
  noturno — justamente o turno que atravessa a virada — cairia no dia errado.
  Centralizado em `kernel/common/tempo.ts`.
- **Furo de isolamento encontrado pelo teste:** era possível registrar resultado
  de chamada para acolhido de outra casa. Corrigido na migração 0150, exigindo
  permanência ativa na casa da chamada.
- **Notificação é efeito do sistema, não escrita de usuário:** escrever na caixa
  de outra pessoa não cabe sob RLS. Virou comando privilegiado, e a leitura
  continua estrita (cada um vê só as suas).

## ✅ Fase 4 — Medicamentos e Enfermagem

| Requisito | Implementação | Teste |
|---|---|---|
| Só a Enfermagem cadastra e assina o esquema (§11.1) | `medications`, policy `presc_insert` | "somente a Enfermagem cadastra" |
| Prescrição em rascunho não entra na grade (§7.2) | status `rascunho` → `ativa` só na assinatura | "rascunho NÃO gera doses" |
| "Quando necessário" exige orientação prévia (§11.5) | condição de uso obrigatória | "quando necessário" |
| Geração de doses idempotente | `app_generate_doses` | "prescrição em rascunho…" |
| Cada dose confirmada por quem administrou (§11.2) | `app_confirm_dose` + policy `adm_update` | "quem confirma é quem administrou" |
| Ninguém confirma por outro | dose já confirmada → 409 | "ninguém confirma por outro" |
| Sem marcação em lote | só rota de dose individual | inspeção de rotas |
| Recusa/atraso/incidente exigem observação (§11.4) | `EXIGEM_NOTA` | "recusa, atraso e incidente" |
| Alertas −30/−15/0/+30 (#13) | `ALERTAS_MIN`, publicados na API | "cenário #13" |
| Vencida ≠ não administrada (#14) | estado permanece `aguardando_confirmacao` | "cenário #14" |
| Escalonamento a Enfermagem/técnica/coordenação (§11.3) | `escalation.requested` | "cenário #14" |
| Offline só no aparelho institucional (#15, §11.7) | recusa na fila **e** no comando | "cenário #15" |
| Horário real preservado na dose offline (§17.3) | `administered_at` ≠ `synced_at` | "cenário #15" |
| Estoque: só quantidade e validade (§11.6) | sem compras; alerta de validade | "estoque controla só…" |
| Estoque baixo sinalizado à mão (§11.6) | `low_flag` manual | "estoque controla só…" |
| Quem administra = configuração (pendência 33.4.1) | `medication_protocol` + autorização nominal | "padrão protetivo", "coordenação configura" |
| Painel com TODOS os acolhidos (#35, §7.1) | `app_nursing_panel` | "cenário #35" |
| Enfermagem em escopo de saúde, sem bancário (#35) | `app_can_see_benefits` nega | "cenário #35 — sem bancário" |
| Evolução do acompanhante gera pendência (#37, §7.2) | `app_submit_evolution` | "cenário #37" |
| Coordenação cobra mas não assina (§7.2) | policy `triage_insert` só Enfermagem | "coordenação acompanha, mas NÃO assina" |
| Triagem: complementa, confere, assina (#37) | `nursing_triage`, relato original intacto | "Enfermagem tria, complementa e assina" |
| Prazo de triagem = configuração (pendência 33.4.2) | `NURSING_TRIAGE_SLA_HOURS` | fila indica `foraDoPrazo` |
| Histórico de saúde em linha única (§7.3) | atendimentos + evoluções + doses | "histórico de saúde reúne" |
| Resumo com finalidade obrigatória (#38, §7.4) | `FINALIDADES` | "cenário #38" |
| Resumo só com o pertinente (#38) | construído por subtração + `naoIncluido` | "cenário #38" |
| Versão offline indica sincronização (#38) | `avisoOffline` | "versão offline" |
| Geração e download auditados (#38) | eventos distintos com `purpose` | "geração e download" |
| Medicamentos na linha do tempo | provedor registrado | "linha do tempo mostra a dose vencida" |

### Achados desta fase

- **Escalonamento virou contrato genérico.** O módulo de notificações assinava um
  evento por domínio e crescia a cada módulo novo. Agora existe um só contrato no
  kernel (`escalation.requested`): quem precisa avisar publica, e `notifications`
  nunca mais muda. Medicamentos entrou no fluxo de aviso sem tocar nele.
- **Autoria visível sem abrir o cadastro.** A Enfermagem não via a fila de triagem
  porque a consulta pedia o *cadastro* do educador para mostrar quem acompanhou.
  A política estava certa; o erro era pedir demais. `app_user_display_name`
  entrega só o nome — e corrigiu de quebra um defeito latente: o educador nunca
  via o nome do colega responsável por uma atividade.
- **Um teste que congelava a arquitetura.** O teste da linha do tempo exigia
  exatamente `['activities','checks']` e quebrou quando medicamentos entrou —
  justamente o oposto do que a partição promete. Passou a verificar
  comportamento, não a lista de módulos.
- **Submissão de Evolução como comando de sistema.** O educador relata o que
  acompanhou, mas escrever no histórico de saúde é ato da Enfermagem. Em vez de
  dar essa permissão a ele, a evolução e o atendimento nascem juntos num comando
  que valida apenas o necessário.

## Fase 5 — Plantão, ATA e proteção ✅

| Requisito | Onde ficou | Teste |
|---|---|---|
| Cada educador assina só a própria passagem (#18, §12.1) | policy `handover_insert` (`user_id = app_current_user()`) | "cenário #18", com tentativa direta no banco |
| Passagem imutável | gatilho `handover_no_change` | "cenário #18" |
| Passagem posterior = complemento tardio com horário real (§12.4) | `late = true` + adendo na ATA | `signHandover` exige `happenedAt` após o fechamento |
| Relatos independentes com as 7 opções (§12.2) | módulo `statements`, `witness_option` | "#11", "#12" |
| Par não vê narrativa pessoal (#11) | policy `st_select` | "cenário #11" |
| Equipe técnica vê lado a lado (#12) | mesma policy, ramo `equipe_tecnica/coordenador` | "cenário #12" |
| Originais imutáveis; complemento é registro novo (§12.2) | gatilho + `supplements_id` | "cenário #12" |
| Gestor só abre narrativa com justificativa (#29) | comando `app_read_statement` | "cenário #29" + auditoria |
| Recebimento individual do turno que entra (#21, §12.3) | policy `receipt_insert` + unicidade | "cenário #21" |
| Receber ≠ concordar (§12.3) | aviso textual na resposta da API | "cenário #21" |
| Uma ATA por plantão (§12.4) | `ata.shift_id` UNIQUE, criada com o plantão | "abre o plantão diurno" |
| Conteúdo estruturado do LIVRO ATA (§12.5) | `SECOES_ATA` (15 seções, como dado) | `GET /shifts/ata-sections` |
| Fecha com pendência, sem assinatura falsa (#19) | `app_close_ata` + `app_missing_handovers` | "cenário #19" |
| Falta de passagem avisa técnica/coordenação (§12.4) | `escalation.requested` nível `tecnica_coordenacao` | "cenário #19" |
| ATA fechada não é sobrescrita (§12.7) | gatilho `ata_guard` + policy de UPDATE | "ATA fechada não é reescrita" |
| Reabertura só por técnica/coordenação, com motivo (§12.7) | `app_reopen_ata` | "cenário #20" |
| Correção por adendo com antes e depois (#20) | `app_amend_ata` + `ata_addendum` | "cenário #20" |
| Episódio do acolhido registrado uma vez (§12.5) | `ata_episode`, imutável, ligado ao perfil | "registra o episódio" |
| Ciência do líder sem alterar o relato (§12.5) | `ata_episode_ack` | "registra o episódio" |
| ATA Geral Noturna mostra as 8 casas (#36, §12.6) | `app_open_general_night_ata` cria as 8 linhas | "cenário #36" |
| Casa sem chamado também é registro (§12.6) | linha existe com `had_contact = false` | "cenário #36" |
| Confirmar fechamento ≠ assinar por educador (#36) | exige ATA da casa já fechada | "cenário #36" |
| Líder Noturno assina só a sua ATA (#36) | `app_close_general_night_ata` (`leader_id = eu`) | "cenário #36" |
| Abertura de ocorrência sem atrasar proteção (§13.1) | só categoria, horário e fato são exigidos | `catalogo()` e `open()` |
| Aviso imediato a líder/técnica/coordenação (§13.2) | 2 ou 3 escalonamentos por abertura | "cenário #22" |
| Enfermagem avisada em saúde/medicamento (§13.2) | nível `enfermagem` | "cenário #22" |
| Gestor não recebe automaticamente (§13.2) | nível `gestao` existe, mas não é publicado na abertura | inspeção de `open()` |
| Revisão técnica obrigatória por categoria (#22, §13.5) | gatilho `incident_defaults` (não é a tela que decide) | "cenário #22" |
| Encerramento do líder não fecha caso crítico (#22) | `app_close_incident_operational` | "cenário #22" |
| Fechar saúde/medicamento exige síntese | `app_review_incident` | "cenário #22" |
| Síntese não apaga originais (§13.4) | `incident_synthesis`, registro novo | "cenário #22" |
| Contenção com campos próprios (§13.3) | `incident_restraint`, 5 campos obrigatórios | `addRestraint` |
| Sistema não avalia se a contenção foi adequada (§13.3) | nenhuma classificação automática; aviso explícito | resposta da API |
| Fala espontânea e sinais fora do alcance do plantão (§13.3) | `incident_protected`, policy própria | "a fala espontânea…" |
| Líder encerra sem navegar por narrativa restrita (§13.5) | vê a ocorrência, não vê `incident_protected` | "a fala espontânea…" |
| Foto exige justificativa (§13.7) | validação em `addAttachment` | "anexo: foto exige justificativa" |
| CPF/diagnóstico/judicial fora do nome de arquivo (§3.3) | `PROIBIDO_NO_NOME` | "anexo: …nome de arquivo" |
| Anexo restrito: ver que existe ≠ abrir (§13.7) | privilégio **por coluna** em `storage_ref` + `app_open_attachment` | "anexo: …", com `permission denied` |
| Comunicação externa nunca enviada automaticamente (#23, §13.6) | não existe rota, fila ou integração de envio | "cenário #23" |
| Entrega só com aprovação e humano identificado (#23) | gatilho `extcom_guard` + CHECK `entrega_tem_responsavel_humano` | "cenário #23" |
| Destinatário funcional, não pessoa (§13.6) | `recipient_role` + validação | `createCommunication` |
| Ocorrência na linha do tempo sem contar o fato (§9, §13.7) | provedor devolve categoria e estado | "a linha do tempo mostra que houve" |
| Plantão na linha do tempo | provedor `shifts` | "a linha do tempo mostra…" |
| Passagem e recebimento funcionam offline (§17.1) | handlers `handover.sign` e `handover.receipt` | tipos suportados em `/sync` |

### Achados desta fase

- **Os relatos viraram um módulo próprio.** A regra "par não lê a narrativa
  pessoal do colega" aparece duas vezes no Prompt Master: na passagem (§12.2) e
  na ocorrência (§13.4). Escrita duas vezes, um dia divergiria — e a que
  divergisse seria a que vaza. Agora existe `statements`, que não conhece nem
  plantão nem ocorrência: recebe `entity`/`entityId` e guarda. A proteção é uma
  política só, no banco, e os dois domínios a herdam.
- **Avisar alguém que não pode abrir é fabricar ruído.** A primeira versão da
  política de ocorrências deixava a categoria restrita invisível ao Líder Diurno
  — mas o §13.2 manda avisá-lo na abertura e o §13.5 lhe dá o encerramento da
  etapa operacional. O teste pegou: líder notificado recebia 404. A correção não
  foi afrouxar a proteção, foi **mudá-la de lugar**: o líder enxerga a ocorrência
  e continua sem alcançar `incident_protected` (fala espontânea, sinais) nem as
  narrativas. É exatamente o que o §13.5 descreve — encerrar a etapa operacional
  sem navegar pelo conteúdo restrito.
- **Privilégio por coluna, não por disciplina.** A referência do arquivo de um
  anexo (`storage_ref`) não é legível pelo papel da aplicação: o `GRANT SELECT` é
  coluna a coluna e a exclui. Um `SELECT *` esquecido em qualquer rota futura
  falha com *permission denied* em vez de vazar o caminho do arquivo. A leitura
  passa obrigatoriamente por `app_open_attachment`, que registra a finalidade.
- **O nível de escalonamento virou dado.** O Líder Noturno Geral é uma função
  transversal, sem vínculo de casa, e não cabia no `CASE` que existia dentro de
  `app_escalation_targets`. Em vez de editar aquele `CASE` a cada módulo novo, os
  níveis passaram a ser linhas em `escalation_level`. Um nível desconhecido agora
  **falha** em vez de escalonar para ninguém — antes, um erro de digitação viraria
  um aviso que nunca chegava, silenciosamente.
- **A honestidade do fechamento é do banco.** Fechar a ATA não conta assinaturas
  na aplicação: `app_missing_handovers` deriva do vínculo vigente com a casa, e o
  comando decide entre `fechada` e `fechada_com_pendencia`. O teste confere que
  nenhuma passagem foi criada no lugar de quem faltou — o sistema **nomeia** a
  ausência em vez de preenchê-la.

## Transferência: as duas caixas da coordenação (revisão pós-Fase 5) ✅

Pedido de Leonardo, sobre a experiência real do coordenador: um lugar só para
transferências, com o que chegou e o que foi pedido, nome completo da criança,
unidade de origem, conversa entre as coordenações e recusa justificada.

| Requisito | Onde ficou | Teste |
|---|---|---|
| Caixa **Recebidas** — o que outras casas pediram | `app_transfer_inbox` + `GET /transfers/inbox` | "cenários #6, #7 e #39" |
| Nome completo e unidade de origem antes do aceite | mesma função (decisão de 27/08) | "cenários #6, #7 e #39" |
| Perfil segue fechado até o aceite | política de `person` inalterada | 404 no passo 2 do mesmo teste |
| Caixa **Da casa** — o que esta unidade pediu | `app_transfer_outbox` + `GET /transfers/outbox` | "recusar exige motivo" |
| Conversa entre as duas coordenações, no sistema | `transfer_message` + policies | "as duas coordenações conversam" |
| Educador não entra na conversa | policy exige técnica/coordenação/gestor | "as duas coordenações conversam" |
| Ninguém fala em nome da casa alheia | `author_house_id` no `WITH CHECK` | "as duas coordenações conversam" |
| Mensagem não se apaga | gatilho `transfer_msg_no_change` | policy sem UPDATE/DELETE |
| Aceitar / recusar como dois atos distintos | `app_accept_transfer` / `app_decline_transfer` | "recusar exige motivo" |
| Recusa exige motivo (mín. 15 caracteres) | comando recusa antes de gravar | "recusar exige motivo" |
| Motivo registrado **nas duas casas** | dois eventos de auditoria + caixa "Da casa" | "recusar exige motivo" |
| Só o destino decide | `somente_o_destino_decide` | "recusar exige motivo" |
| Só a origem cancela, enquanto ninguém decidiu | `app_cancel_transfer` | "a origem cancela a própria solicitação" |
| Decisão tomada não se apaga | cancelamento recusado após decisão | "a origem cancela a própria solicitação" |
| Catálogo de unidades para escolher destino | `app_house_directory` + `GET /houses/directory` | "a coordenação nomeia as unidades" |
| O catálogo não amplia acesso | AI4 segue 404 e lista vazia | "a coordenação nomeia as unidades" |
| Avisos automáticos nos dois sentidos | `escalation.requested` nível `tecnica_coordenacao` | central de notificações |

### Achados desta revisão

- **Um `JOIN` que apagava a mensagem do outro.** A conversa lia a casa de cada
  mensagem com `JOIN house` — e a política de casas, corretamente, só mostra a
  própria unidade. Resultado: a mensagem da outra coordenação simplesmente não
  aparecia, sem erro nenhum. É o mesmo defeito da Fase 4 com o nome do
  educador, e a mesma correção: `app_house_label` devolve só o código, sem
  abrir o cadastro da casa. **JOIN com tabela protegida por RLS não filtra —
  ele some com a linha.** Vale como regra geral do projeto.
- **Não dava para pedir transferência.** Escolher um destino exige nomear as
  outras unidades, e nenhum coordenador conseguia listá-las. O isolamento
  estava certo; faltava o catálogo institucional — código, nome e tipo, o mesmo
  que está na porta de cada casa. É a diferença entre saber que a AI1 existe e
  saber o que acontece dentro dela.
- **A recusa é uma resposta, não um "não".** Recusar sem motivo deixaria a
  coordenação de origem sem nada para fazer com a criança. O motivo virou
  obrigatório no comando (não na tela) e é gravado dos dois lados.

## Auditoria de defeitos — duas varreduras ✅

Feita a pedido de Leonardo ("vamos arrumar os erros e bugs"). Duas varreduras
independentes sobre o código inteiro, com verificação caso a caso contra as
políticas e as constraints do banco. **Vinte e nove defeitos confirmados.**

O fio comum, e a razão de valerem uma seção: **nenhum deles dava erro.** A tela
continuava mostrando tudo normal enquanto o alerta de medicação parava de sair,
a dose era sobrescrita, o registro offline sumia do aparelho e a rotina noturna
duplicava. Num sistema de proteção, falhar em silêncio é pior do que falhar.

### Primeira varredura — `JOIN` com tabela sob RLS (8 achados)

| Onde | O que sumia | Correção |
|---|---|---|
| ATA fechada | o episódio de contenção, no dia da transferência | `app_person_display_name` |
| Ocorrência | o nome de quem ela trata, para quem precisa revisar | idem |
| ATA Geral Noturna | 7 das 8 casas, com contador dizendo "1 de 1 confirmada" | `app_house_label` / `app_house_name` |
| Fila de triagem | a evolução pendente, para a técnica que recebeu a criança | `app_house_label` |
| Atividade individual | o nome do acolhido; virava linha "—" no Painel da Casa | `app_person_display_name` + `app_person_age` |
| Estoque nominal | virava indistinguível de estoque de uso comum | idem |
| Item de rotina | idem | idem |
| Situação da ATA da casa | "não posso ver" exibido como "sem ATA aberta" | `app_night_ata_status` |

**Travas:** `test/arquitetura.spec.ts` exige comentário `rls-join-ok:` em todo
`JOIN` com tabela protegida; `test/regressao-saida.e2e.spec.ts` transfere
crianças de propósito. Verificado que 4 dos 6 testes falham sem a correção.

### Segunda varredura — estado, concorrência e fuso (21 achados)

| # | Defeito | Correção |
|---|---|---|
| 1 | O alerta de dose vencida disparava **uma vez por casa e nunca mais** — a chave de idempotência do escalonamento não tinha data e usava a casa como entidade | escalonamento por **dose**; `on_date` na chave |
| 2 | Dois educadores confirmando a mesma dose: a segunda sobrescrevia a primeira sem rastro | `FOR UPDATE` em `app_confirm_dose` |
| 3 | Operação offline que falhou voltava como "duplicada" e o aparelho **apagava o registro local** | só `aplicada` é duplicata; retentativa é nova tentativa |
| 4 | Plantão noturno atravessando a meia-noite caía no dia seguinte | `dataDoPlantao()` |
| 5 | Aceite de transferência não conferia se a criança ainda estava lá | estado verificado no comando; saída cancela pendentes; índice único |
| 6 | `app_generate_day` duplicava a rotina noturna a cada recarga (cast de data no fuso do banco) | comparação em `America/Sao_Paulo` + índice único |
| 7 | ATA reaberta podia ser reescrita por PATCH, sem adendo e sem cargo | política de UPDATE por status e cargo |
| 8 | `app_review_incident` fechava ocorrência que ninguém encerrou, e refechava a já fechada | verificação de estado; síntese exigida também em contenção e violência |
| 9 | Os handlers offline entravam **por baixo** das validações (justificativa, `exception_note`, estado da ciência, receita e prazo da evolução descartados) | passam pelo serviço |
| 10 | `app_missing_handovers` ignorava turno e escala: toda ATA fechava "com pendência" nomeando quem estava de folga | usa `work_schedule`, e declara a fonte |
| 11 | Atividade concluída podia ser "reconcluída" com outro estado horas depois | estado final verificado com trava |
| 12 | `app_amend_ata` era o único comando de ATA **sem checagem de casa** | linha acrescentada |
| 13 | Chamada comparava contagem viva contra número congelado | pendente — ver abaixo |
| 14 | Uma dose baixava **dois** estoques (comum e nominal) | precedência do nominal |
| 16 | Prescrição com prazo vencido aparecia como uso atual no **Resumo de Saúde** — o único documento que sai da instituição | filtro por `ends_on` |
| 17 | `rowCount` ignorado em `suspend`, `benefits` e `updateDetail`: sucesso sobre zero linhas | verificado, com erro honesto |
| 18 | `benefits.upsert` não amarrava o `id` ao acolhido: dava para sobrescrever a conta de outro | `WHERE id = $1 AND person_id = $2` |
| 19 | Família de comandos com `SELECT` sem trava (fechar ATA, reabrir, encerrar ocorrência) | `FOR UPDATE` |
| 20 | Duas solicitações de transferência pendentes pela mesma criança | índice único parcial |
| 21 | Comunicação externa aprovada pelo próprio autor | gatilho recusa |

**Trava:** `test/regressao-estado.e2e.spec.ts`, 12 testes. Verificado que 7
falham sem as correções de serviço (os outros 5 são protegidos por migração).

### Terceira rodada — os três que tinham ficado em aberto ✅

| Defeito | Correção | Teste |
|---|---|---|
| **A chamada dos 20 fechava com 21 na casa.** `expected` era fotografado na abertura e a conferência contada sobre quem está ativo agora. Uma criança que chegava às 21h30 não era conferida e a chamada final fechava declarando todos vistos; uma que saía no meio travava a confirmação **para sempre**, sem rota de ajuste | a conferência passa a ser medida contra o **efetivo vivo**; `expected` vira dado histórico. A recusa **nomeia quem falta** — "faltam 2" numa casa de 20 obriga a reconferir a lista inteira. Quem saiu continua listado, com o registro, marcado como não ativo | "a chamada dos 20 não fecha com 21", "a chamada não trava quando alguém sai" |
| **`institutionalDevice` vinha do cliente.** A regra do §11.7 — offline, só o aparelho designado confirma medicamento — era verificada contra um booleano no corpo da requisição: quem enviasse `true` passava. A regra existia no papel e no código, e não existia de fato | o aparelho virou **credencial**: a coordenação registra, o sistema devolve o código uma vez e guarda só o hash (mesmo padrão das sessões). O servidor decide contra o registro da casa. Revogação não apaga o histórico | cenário #15 reescrito: afirmar-se institucional é rejeitado; código errado é rejeitado; código revogado deixa de valer |
| **Auditoria fora da transação.** `audit.log` usava outra conexão do pool: operação revertida deixava rastro de algo que não aconteceu, e falha ao auditar depois do COMMIT devolvia erro sobre escrita que ficou | `log(entry, client?)` aceita o cliente da transação. Aplicado onde mais importa: **acesso a dado sensível audita dentro da transação** — benefícios e abertura de documento. Ou os dois existem, ou nenhum dos dois | suítes existentes de benefícios e documentos |

Isso encerra a pendência institucional **#7** do lado do sistema: quais aparelhos
existem em cada casa passou a ser um cadastro, não uma suposição.

## Fase 6 — Relatórios e Drive
Acompanhamentos, aprovações, relatórios (§14), arquivamento no Drive (#26, #27),
exportações auditadas (#32), painéis sem ranking.

## Fase 7 — Piloto Casa 03
Migração assistida, treinamento, paralelo com prazo, homologação, aceite (#42).

---

## Fase 8 — Os doze defeitos da auditoria ✅

| # | Defeito | Correção |
|---|---|---|
| 1 | `app_mark_unconfirmed` rodava `SECURITY DEFINER` sem checar escopo: qualquer usuário autenticado marcava atividade de outra casa, sem ver a casa e com resposta de sucesso | `app_house_in_scope()` dentro da função (0620). Fora de escopo responde 404, não 403 — 403 confirmaria que o uuid é de uma casa real |
| 2 | `clientOpId` contornava a trava de estado final: a fila offline sobrescrevia atividade que outra pessoa já concluíra, e o aparelho limpava o registro local | idempotência ANTES da trava; a trava vale para todos. Operação atrasada vira conflito e vai para revisão humana |
| 3 | `enviarParaAprovacao` validava depois do commit: o acompanhamento vazio ficava preso em `em_aprovacao`, fora do rascunho de quem escreveu | validação dentro da transação, com `FOR UPDATE`. Ou os dois acontecem, ou nenhum |
| 4 | `UNIQUE` do estoque com `person_id` anulável nunca disparava para o estoque comum: duplicatas acumulavam e **uma dose descontava de todas** | `UNIQUE NULLS NOT DISTINCT` (0690), com consolidação registrada como movimento de ajuste — nada some em silêncio |
| 5 | A chamada sobrescrevia marcação **e autoria** sem histórico | `check_result_amendment` + gatilho (0670). Correção continua permitida; o valor anterior não morre |
| 6 | `atualizarJudicial` atingia todos os episódios: corrigir a situação de hoje reescrevia a de 2019 | filtro pelo episódio ativo |
| 7, 9, 10 | Fuso: mês cortado em UTC, nome de arquivo discordando da pasta, `current_date` perdendo a dose depois das 21h | `app_hoje()`/`app_fuso()` (0630) como gêmeo SQL do `tempo.ts`; janela do mês calculada no kernel em instante UTC |
| 8 | Pedido de substituição reabria atividade concluída | trava nos dois pontos — no pedido e na autorização |
| 11 | `listDay` usava `expected` congelado: a lista dizia "12/15" e o detalhe "12/12" | efetivo vivo, igual ao fechamento |
| 12 | `addItem` aceitava qualquer `versionId`, inclusive de versão fechada e **de outra casa** | gatilho `tg_routine_item_guard` (0680) |

**Trava:** `test/regressao-autoria.e2e.spec.ts`, 19 testes.

## Fase 9 — Convite de primeiro acesso ✅
Uso único, 24 horas, e-mail institucional. Emitir embaralha a senha atual e
derruba as sessões. Quem convida não vê o link. `MailGateway` escreve em caixa
local em dev, no mesmo desenho do `DriveGateway` — SMTP real só na implantação.

## Fase 10 — Autoria dupla, delegação e painel do plantão ✅
Líder e coordenação registram pelo colega que realizou e não conseguiu
registrar, com os DOIS nomes e o motivo. Não vale para dose nem para chamada.
Delegação de cima para baixo, sem apagar a designação anterior. Recusa de
substituição com motivo obrigatório. Painel do turno sem contagem por pessoa.

## Fase 40 — As duas rotas que a tela mostrava sem deixar escrever ✅

Achadas conferindo, uma a uma, as 210 rotas servidas contra as 212 chamadas das
telas. Nenhuma das duas dava erro: o campo aparecia na tela e vivia em branco.

| Requisito | Onde ficou | Teste |
|---|---|---|
| Atualizar cuidados essenciais, escola, equipe e observações (§6.4) | `app_atualizar_detalhe_perfil` (0850) + `FolhaDetalhe` no perfil | "atualiza, e guarda o que estava escrito antes" |
| O valor anterior não some | `profile_detail_change`, sem UPDATE nem DELETE | "a segunda escrita guarda o texto da primeira" |
| Quem CUIDA lê o histórico, não só quem edita | policy `pdc_select` por `app_person_in_scope` | "quem CUIDA da criança lê o histórico" |
| Educador não altera dado estrutural | guarda de papel + `app_can_edit_profile()` no comando | "o educador não altera — nem pela API, nem no banco" |
| Fora de escopo é 404, não 403 (§23) | `pessoa_fora_de_escopo` traduzido em `NotFoundException` | "fora de escopo responde 404" |
| Observações só para quem as escreve | projeção do perfil por cargo | "as observações só vão para quem pode escrevê-las" |
| Definir quem pode dar remédio no período (§11.3, 33.4.1) | `app_definir_protocolo_medicacao` (0860) + `FolhaProtocolo` | "define, e registra que ANTES não havia definição" |
| Motivo obrigatório na decisão da instituição | mínimo no serviço + `motivo_obrigatorio` no comando | "o motivo é obrigatório, e uma palavra não basta" |
| Cada decisão guarda o que valia antes | `medication_protocol_change` | "a decisão seguinte guarda a anterior" |
| `NULL` no antes ≠ decisão de negar | colunas anuláveis + projeção `antes: null` | mesmo teste |
| Nenhum período fica sem quem administre | `protocolo_sem_ninguem` no comando | "um período não fica sem ninguém" |
| Só a coordenação DESTA casa decide | regra 8 no comando + policies da 0820 | "a coordenação de OUTRA casa não define" |

### Achados desta fase

- **Uma rota sem porta não aparece como falta; aparece como campo vazio.** As
  duas viviam há fases no servidor, com regra, RLS e auditoria — e a tela que
  as mostrava não tinha botão. O que faz uma coisa dessas ser encontrada não é
  ler a tela: é comparar a lista das rotas servidas com a lista das chamadas.
  Vale como verificação a repetir a cada fase.
- **Abrir a escrita e guardar o antes são a mesma tarefa.** Nos dois casos, dar
  a porta sem o histórico teria criado um problema pior do que o que ela
  resolve: sobrescrever "cuidados essenciais" apaga uma instrução de proteção,
  e sobrescrever o protocolo apaga a decisão institucional que autorizou
  alguém a dar remédio. A auditoria não cobre nenhum dos dois — ela guarda o
  nome do campo (§20) e é área restrita.
- **Motivo obrigatório é decisão caso a caso, não princípio.** Corrigir o nome
  exige motivo; atualizar a série escolar não, porque em fevereiro a série
  muda mesmo e cobrar justificativa ali ensina a equipe a escrever
  "atualização" mil vezes — até que ninguém leia mais o campo, inclusive
  quando ele importa.

## Fase 41 — O painel das unidades, e a aba que quebrava contra o servidor ✅

| Requisito | Onde ficou | Teste |
|---|---|---|
| Painel por unidade: ocupação, fluxo e pendências (§18.1) | `PanelService.cards` + tela `Painel.tsx` | "a coordenação recebe a própria casa; o gestor, as oito" |
| Sem ranking: ordem do código, nunca do número (§3.3) | `ORDER BY h.code` + a tela não reordena | mesmo teste, comparando com a lista ordenada |
| Quadro do mês da casa (§18.3) | `PanelService.mensalDaCasa` | "o quadro do mês responde com as contagens e a nota do §14.6" |
| Ausência de registro não é fato negativo | `nota` na resposta, desenhada na folha | mesmo teste |
| Mês inválido recusado com frase, não com 500 | validação antes de `janelaDoMes` | "mês fora de formato é recusado com uma frase" |
| Casa fora do alcance: 404, não retrato zerado (§23) | `app_house_in_scope` antes das contagens | "casa fora do alcance responde 404" |
| O painel é de coordenação, técnica e gestão | `/* alcance:painel */` + área nova em `alcance.ts` | `alcance.spec` (marca nova) + "o educador não abre o painel" |
| A lista de relatórios devolve o que a tela lê | `ReportsService.listar` reescrito | "a lista de relatórios devolve TODOS os campos que a aba lê" |
| Enviar para aprovação (§14.6) | `POST /reports/:id/submit` com porta na tela | "quem redigiu não aparece como quem pode aprovar" |
| Aprovado não volta para aprovação | estado lido SEM trava, recusa com frase | "o aprovado não volta para aprovação" |
| `podeAprovar` é a regra do banco, não uma segunda cópia | calculado no serviço, espelhando `app_approve_report` | "quem redigiu não aparece como quem pode aprovar" |

### Achados desta fase

- **O contrato de rotas não é o contrato de RESPOSTAS.** `contrato-rotas.spec`
  pega a rota que não existe, a que existe com outro verbo e a que casa por
  curinga. Ele não pega — e não tem como pegar, lendo só decoradores — a rota
  que existe, responde 200 e devolve outra coisa. Era o caso de `GET /reports`:
  sete campos servidos, onze lidos, e `r.entregas.map(...)` derrubando a aba
  inteira contra o servidor de verdade enquanto o protótipo mostrava tudo
  funcionando. O `mock.ts` fora escrito olhando a tela; quando ele responde
  melhor que o servidor, a demonstração ensaia um sistema que não existe. A
  trava nova é um e2e que confere o formato campo a campo.
- **`SELECT ... FOR UPDATE` sob RLS aplica também a policy de UPDATE.** Ler o
  estado com trava escondia o relatório APROVADO (`rep_update` tem
  `status <> 'aprovado'`), e a resposta virava 404: o sistema dizia que o
  documento não existe para quem acabara de aprová-lo. Vale como regra geral —
  leitura para DIAGNOSTICAR não leva `FOR UPDATE`; a atomicidade fica no
  `UPDATE ... WHERE status = <esperado>`, que é onde ela é de fato necessária.
- **Zerar não é o mesmo que recusar.** `house-monthly` de uma casa fora do
  alcance voltava com todas as contagens em zero, porque o RLS filtra as
  LINHAS. Zero se lê como "casa vazia", não como "não é sua" — a coordenação da
  Casa 03 concluiria que a Casa 04 passou o mês sem nada. Toda agregação por
  casa precisa conferir o escopo ANTES de contar.

## Fase 42 — O limite da unidade, a visão dos 20, e o JOIN que mentia ✅

| Requisito | Onde ficou | Teste |
|---|---|---|
| Alterar o limite da casa, com motivo (§ capacidade) | `FolhaLimite` no Painel + `app_set_house_capacity` | "altera com motivo, e a mudança fica registrada" |
| Só coordenação da casa e Gestor Geral alteram | guarda de papel + policy | `cadastro.e2e` "mudar o limite é decisão registrada" |
| A coordenação de outra casa não altera esta | `app_house_in_scope` no comando | "a coordenação de outra casa não altera o limite desta" |
| O histórico do limite é da equipe, não área restrita | `cap_select` por `app_house_in_scope` | "quem trabalha na casa LÊ o histórico" |
| A visão dos 20 (§9) | filtro "Por criança" no Dia, sobre `/timeline/house-panel` | `operacao.e2e` (ordem alfabética) + "casa fora do alcance não devolve o painel" |
| Ordem alfabética, e pendência não ordena (§3.3) | o servidor ordena; a tela não reordena | `operacao.e2e` |
| O nome de quem responde chega a quem trabalha ao lado | `app_user_display_name` em 8 consultas | "o educador vê o NOME de quem responde pelo compromisso" |

### Achados desta fase

- **A marca `rls-join-ok:` pode mentir, e mentia.** Oito consultas de quatro
  partições traziam o nome de uma pessoa por `JOIN app_user`, com o comentário
  afirmando que "app_user não tem RLS de linha". Tem: `user_select` (0010) só
  entrega o cadastro de um colega a gestor, coordenação e equipe técnica. O
  `arquitetura.spec` exige que a marca EXISTA perto de todo JOIN protegido —
  ele não tem como conferir se o que ela afirma é verdade. Terceira aparição da
  mesma família de defeito no projeto.
- **`JOIN` e `LEFT JOIN` erram de jeitos diferentes, e os dois em silêncio.** O
  interno sumia com a LINHA: o histórico do limite voltava vazio para o
  educador, o líder e a Enfermagem, e as entregas de um relatório sumiam para
  quem não alcança quem as registrou. O externo sumia com o NOME: a agenda
  mostrava o compromisso sem dizer quem vai levar a criança — que é a
  informação pela qual aquela tela existe, e é exatamente o defeito da fase 4
  reaparecido em outro lugar.
- **Regra que fica:** nome de pessoa em consulta de leitura vem sempre por
  `app_user_display_name(id)`, nunca por junção com `app_user`. A função é
  `SECURITY DEFINER` e devolve só o nome — não abre o cadastro.
- **A rodada das 21h pegou a própria suíte nova.** Ela contava as linhas de
  `house_capacity_change` em números ABSOLUTOS, e `cadastro.e2e` também muda o
  limite da Casa 03: aquela suíte restaura o limite no fim, mas as linhas do
  histórico são append-only e ficam. Passava sozinha, falhava uma rodada em
  três, conforme a ordem dos arquivos — e três dos testes só repetiam o que
  `cadastro.e2e` já cobria. Regra que fica: **contagem em suíte é relativa ao
  que já estava lá**, e a linha da própria suíte se acha pela frase que ela
  escreveu, nunca pela posição. Cinco rodadas seguidas limpas depois disso.

## Fase 43 — Os aparelhos institucionais ganham cadastro ✅

`GET/POST /devices` e `POST /devices/:id/revoke` existiam desde a fase 8 e nunca
tiveram tela. A credencial passou a existir naquela fase; o CADASTRO dela, não —
e a pendência institucional #7 ("quais aparelhos existem em cada casa")
continuava aberta do lado que interessa.

| Requisito | Onde ficou | Teste |
|---|---|---|
| Listar os aparelhos da casa (§11.7, pendência #7) | aba **Aparelhos** em `Equipe.tsx` | `equipe.e2e` "a lista de aparelhos mostra o que a casa tem" |
| A lista nunca devolve o código | projeção sem o hash nem o token | mesmo teste, comparando com o token do registro |
| O código aparece uma vez, em folha própria | `codigoNovo` como overlay, fechado por ato | — (decisão de tela) |
| Revogar não apaga: fica com data e motivo | `app_revoke_device` | "…e o revogado não some" |
| Registrar é da coordenação; o da instituição é do gestor | `app_register_device` | `equipe.e2e` "o telefone institucional é um só" |
| Casa sem aparelho não aceita dose offline | recusa no `sync/push` | `saude.e2e` (cenário #15) |

### Achados desta fase

- **Credencial sem cadastro é regra pela metade.** A fase 8 fechou o buraco de
  segurança — o aparelho deixou de se declarar institucional — e deixou aberto
  o buraco de USO: quem administra a casa não conseguia ver, corrigir nem
  revogar o que estava registrado. Uma regra que ninguém consegue auditar volta
  a ser suposição, mesmo estando certa no banco.
- **Segredo que aparece uma vez não cabe num aviso de topo.** O código do
  aparelho não tem rota de recuperação. Como aviso na área de mensagens, a
  primeira rolagem o perderia e a saída de quem usa seria registrar outro
  aparelho — deixando um ativo e órfão na casa. Ele fica numa folha que só
  fecha por ato declarado ("Guardei o código").

## Fase 44 — A decisão que a regra exigia e ninguém conseguia tomar ✅

O caso mais estranho do levantamento: `GET /sync/status`, `GET /sync/conflicts`
e `POST /sync/conflicts/:id/resolve` existiam desde a fase 3, a regra do §17.4
estava cumprida — as duas versões preservadas, o sistema recusando escolher — e
o estado que ela cria, "aguardando decisão humana", **não era visível a nenhum
humano**. Um registro feito sem sinal que colidisse com outro ficava parado
para sempre.

| Requisito | Onde ficou | Teste |
|---|---|---|
| Ver os conflitos em aberto da casa (§17.4) | tela `Sincronizacao.tsx` | `operacao.e2e` "cenário #17" |
| As duas versões inteiras, sem nenhuma destacada | componente `Versao`, campo a campo | mesmo teste (`versaoA`/`versaoB`) |
| Resolver é registrar a decisão, não escolher | folha com texto obrigatório | "cenário #17" |
| Só técnica, coordenação e gestão decidem | `/* alcance:sincronizacao */` + `alcance.ts` | `alcance.spec` (marca nova) + "cenário #17" |
| "O que eu mandei chegou?" é pergunta de quem registrou | `GET /sync/status`, por usuário | "o status diz a quem registrou se o que ele mandou chegou" |
| A fila de um não aparece como a de outro | `WHERE user_id = $1` | mesmo teste, conferindo a coordenação em zero |

### Achados desta fase

- **Regra cumprida com decisão inalcançável é regra pela metade** — o mesmo
  formato do achado da fase 43, e vale a pena nomear: o sistema pode estar
  inteiramente correto no banco e ainda assim deixar a pessoa sem ação. O
  levantamento das rotas sem porta é o que encontra esse tipo de buraco, porque
  ele não aparece como erro em lugar nenhum.
- **Um conflito de sincronização quase nunca é "uma versão errada".** É "a
  criança tomou o remédio uma vez, e duas pessoas registraram". Por isso a
  folha não tem botão de escolher versão: o que ela pede é a frase da equipe,
  que fica ao lado das duas — e é ela que responde, meses depois, por que ficou
  assim.
- **Tela vazia precisa dizer por que está vazia.** Uma lista de conflitos em
  branco é boa notícia, e se ela não disser isso será lida como "não carregou".

## Fase 62 — O levantamento de rotas sem porta vira conferidor ✅

A fase 61 terminou com uma lição: **construir a rota e a tela em fases
diferentes deixa buracos que o `tsc` não vê e os testes de servidor não veem**,
porque do lado do servidor está tudo certo. O levantamento era feito à mão, de
vez em quando — e por isso duas rotas ficaram semanas sem porta.

`test/rotas-sem-porta.spec.ts` confere o lado que faltava. O `contrato-rotas`
já garantia que toda chamada da tela existe no servidor; este garante que toda
rota do servidor **é chamada por alguma tela — ou está declarada como rota de
máquina, com o motivo por extenso**.

A lista de exceções é o coração do arquivo. Cada linha é uma decisão escrita, e
o teste cobra que o motivo tenha mais de 40 caracteres — sem isso, a lista
viraria o lugar onde se esconde o que faltou construir. Há um segundo teste
para o caminho inverso: **exceção que ganhou tela depois passa a mentir**, e a
próxima pessoa lê o motivo e acredita nele.

### O que ele achou, na primeira rodada

Onze rotas. Cinco eram de máquina (geração do dia por relógio, escalonamento do
que passou da hora, sonda de saúde), três eram leituras que a tela resolve por
outro caminho — e **três esperavam decisão da Fundação**, o que agora está
escrito ao lado da rota: as fontes do acompanhamento (§7.7), a leitura
excepcional de relato (§7.6) e a correção da linha da casa na ATA Geral (§7.2).
Rota parada esperando resposta institucional deixou de parecer esquecimento.

E **uma era gap de verdade**: designar o educador que acompanha a internação. A
rota existia desde a fase 53 sem botão em lugar nenhum — e é a função que a
coordenação mais usaria ali, porque a criança fica três semanas e quem vai ao
hospital muda a cada plantão. Agora tem tela.

### Dois defeitos do próprio conferidor

- **Ele acusou as rotas mais usadas da casa.** `/checks/:id/mark` e
  `/activities/:id/record` chegam ao servidor por `apiOuFila`, e o caminho é
  passado a uma função auxiliar da tela — a rota está lá, escrita, só não
  colada no `api(`. A pergunta deste conferidor não é *como* a rota é chamada
  (isso é do `contrato-rotas`), e sim se alguma tela sequer a menciona.
- **A interpolação parava nos parênteses.** `${idDe(ev)}` fez a primeira versão
  ler `/activities/` como rota, e três chamadas viraram uma.

## Fase 61 — As portas que faltavam ✅

Duas rotas construídas nas fases 58 e 60 não tinham porta em tela nenhuma —
e as duas eram das pessoas que mais precisariam delas.

**A técnica não conseguia registrar uma conquista.** A tela do trabalho social
é do Gestor Geral, e a área `impacto` no alcance é só dele: a equipe técnica,
que escreve sobre o caso da criança, não alcançava nenhum botão. A fase 58
tinha criado uma tabela que só a API sabia preencher. A conquista agora se
registra **no perfil do acolhido**, que é onde a técnica trabalha — e a lista
das três últimas fica ali, visível para toda a casa.

**A coordenação não tinha como tirar o relatório da própria casa.** A rota
`?houseId=` nasceu na fase 60 e ninguém podia chamá-la: o botão está agora no
Painel das unidades, que ela já usa.

O padrão é o mesmo das fases 45 e 47, e vale anotar: **construir a rota e a
tela em fases diferentes deixa buracos que o `tsc` não vê e os testes de
servidor não veem** — porque do lado do servidor está tudo certo. Quem pega é
o levantamento de rotas sem porta, e ele precisa ser rodado depois de cada
fase que abre rota nova.

## Fase 60 — O relatório de uma casa, e a trajetória para a audiência ✅

As duas pontas que faltavam na frente do trabalho social.

**O relatório de uma casa só**, e com ele a coordenação entra — decisão de
produto, não descuido: ela responde por aquelas vinte crianças e é quem vai à
reunião de rede e à audiência concentrada. Pedir ao Gestor Geral um documento
sobre o trabalho que ela mesma fez seria estranho. O que continua sendo só dele
é a visão das OITO — comparar casas não é função de quem responde por uma. E
casa fora do alcance é **recusa**, não painel zerado: o RLS filtra as linhas, e
zero se leria como "esta casa não fez nada".

**A trajetória em folha** — o documento que o Juízo mais pergunta e que o
sistema não tinha: o que esta criança conquistou no tempo em que esteve
acolhida, com data e instituição. Ela **não substitui o relatório técnico**, e
a própria folha diz isso: quem recebe papel timbrado numa audiência não tem
obrigação de saber a diferença.

E quando não há nada registrado, a folha escreve: *"isso diz que ninguém
escreveu — não diz que nada aconteceu, e não é uma avaliação dela"*. Mostrar
uma trajetória vazia a um juiz sem essa frase transformaria a falha do registro
em avaliação da criança.

### Achado

**A rota da trajetória capturava a da folha.** `seg[0]==='impacto' &&
seg[1]==='trajetoria'` sem conferir o número de segmentos casava também com
`/impacto/trajetoria/:id/folha`, e devolvia a trajetória crua no lugar da
folha. A tela recebia um objeto sem seções e **não desenhava nada, sem erro
nenhum** — o botão parecia morto. É o mesmo padrão de `@Get(':id')` engolindo
rota de palavra fixa, que o projeto já conhece do lado do servidor; do lado do
mock, ninguém tinha tropeçado ainda.

## Fase 59 — A conquista se registra, e o relatório sai ✅

A fase 58 mostrava conquistas que só podiam ser criadas pela API. Agora a tela
registra — com comprovante anexado — e o relatório em Word do trabalho social
sai pelo caminho de sempre: folha na tela, finalidade escrita, saída registrada.

A folha (`impacto-folha.ts`) é onde a recusa de comparar casas mais importa,
porque é o que sai da instituição: uma tabela impressa com as casas em ordem de
conquistas vira um placar que anda sozinho por reuniões onde ninguém estará
para explicar o contexto de cada uma. Ela lista por código, põe o número de
acolhidos ao lado do de conquistas, e carrega a ressalva que não é enfeite:
**ausência de registro não é ausência de trabalho** — segurar uma crise, manter
um vínculo, atravessar um ano difícil não cabe em categoria e não aparece ali.

### Achados

- **O protótipo parou de ser gerado.** `vite build` começou a estourar a
  memória — "JavaScript heap out of memory", com 3 GB de heap — quando quatro
  tratadores novos entraram em `responder()`, que já passava de seis mil
  linhas. Não é um erro de código: é uma função que o esbuild precisa analisar
  inteira. O sintoma sumiu quebrando a função (`responderImpacto`), e a lição
  fica: o servidor de mentira cresce a cada fase, e uma função única não
  escala. As próximas partições nascem fora dela.
- **Uma suíte que falhava às vezes.** O teste da medicação do hospital contava
  as doses da criança numa janela de cinco minutos esperando zero — e
  `medication_administration` é compartilhada: seeds e outras suítes escrevem
  lá dentro da mesma janela. Era a regra 13 sendo violada por quem a conhece.
  A contagem virou relativa: mede antes, mede depois, e cobra que não mudou.
  **Uma suíte que falha às vezes é pior do que uma que falta** — ensina a rodar
  de novo até passar.

## Fase 58 — O trabalho social: a outra leitura das oito casas ✅

Pedido da coordenação: o Gestor Geral precisa das oito casas de **duas formas**.
A que existe é a operação — plantão, dose, ATA. Ele não vai olhar isso todo dia,
e não deve. A que faltava é o que o acolhimento produziu: quantas crianças,
quantas entraram e saíram, e **o que aconteceu de bom** — passou de ano,
terminou o Médio, entrou no curso profissionalizante, tirou o certificado,
passou na faculdade, assinou a primeira carteira.

Migração 0900 (`life_milestone`), `ImpactoService`, quatro rotas, tela
`TrabalhoSocial.tsx`, e uma **chave 🌱 no alto**, junto do tema: é troca de
MODO, e modo não mora no menu. (Há também uma porta no "Mais", porque tela que
só existe atrás de um botão do cabeçalho fica de fora dos ensaios.)

### O risco, escrito antes de a tabela existir

Contar conquistas por casa é a distância de um `ORDER BY` de virar **ranking de
casas**, que é proibido (regra 3). A proibição não é burocracia: a casa que
recebe adolescentes com medida protetiva recente e a casa-lar com quatro
crianças pequenas não estão na mesma corrida, e o placar faz a primeira parecer
pior no momento em que ela faz o trabalho mais difícil.

O desenho inteiro é essa recusa:

- `app_panorama_das_casas` ordena por `code`. Sempre. Está escrito na migração
  e há um teste só para isso — **porque a próxima pessoa vai querer ordenar por
  marcos, já que parece mais útil**;
- não há média, meta, percentual de sucesso nem "casa destaque". Um teste varre
  a resposta procurando essas palavras;
- a lista de quem conquistou sai **por data**, e não por criança com mais;
- **ausência de marco não é dado.** A criança sem linha aqui não fracassou: ela
  pode ter passado o ano sobrevivendo a uma coisa que não cabe em categoria — e
  é justamente essa que o trabalho da casa mais tocou. A tela diz isso quando o
  período vem vazio: *"isso diz que ninguém escreveu, não que não aconteceu"*.

### As outras decisões

- **O marco é da criança; a casa é onde ela estava.** `house_id` é gravado na
  hora, porque ela muda de casa e o marco não muda de lugar junto.
- **Todo mundo da casa lê, inclusive o educador.** É a parte boa da história, e
  escondê-la de quem acorda a criança todo dia seria transformar em relatório o
  que devia ser motivo de a casa inteira saber. Escrever é da técnica, da
  coordenação e do Gestor Geral.
- **A trajetória individual não é prontuário.** Ela traz marcos e as casas por
  onde a criança passou. Saúde, ocorrência e conteúdo judicial ficam nas telas
  do caso — e um teste varre a resposta para garantir.
- **Marco não se apaga.** Um diploma que sumiu do sistema é um diploma que a
  instituição deixou de reconhecer.

### Achados

- **A rota escondida numa variável, de novo.** `api(\`/impacto/panorama${...}\`)`
  com a query montada condicionalmente sumiu do `contrato-rotas.spec`. Mesma
  lição da fase 47, e o conferidor pegou no mesmo dia.
- **O teste que reprovava a própria explicação.** A varredura da trajetória
  procurava "judicial" na resposta inteira — e reprovava a frase que promete
  não trazer conteúdo judicial. Um conferidor que proíbe a palavra ensina a não
  escrever a explicação, e a explicação é metade do valor da tela.

## Fase 57 — O quarto clique: o que ficou gravado ✅

O `ensaio:uso` apertava os botões e olhava se a tela respondeu alguma coisa.
Não é o bastante, e há um defeito no histórico do projeto que prova: a entrada
de remédio que **substituía em vez de somar**, deixando 30 frascos virarem 10.
Ele passaria por todas as cobranças que existiam — a folha abriu, o botão
salvou, a tela mudou. Só o número estava errado.

O ensaio passou a **ler de volta**:

| O que se faz | O que se confere depois |
|---|---|
| "Chegou remédio", 10 frascos | a quantidade SOMOU: 2 + 10 = 12 |
| "Conferi o armário", 26 | o botão fica travado sem motivo escrito, e depois grava 26 |
| exceção na chamada, com observação | a frase escrita aparece na tela |
| relato no diário da internação | a lista passa a contar "1 dia com relato" |

**O conferidor foi provado falhando.** Inverti a soma no `mock.ts` de
propósito, e o ensaio acusou com o número na mensagem: *"2 + 10 deveria dar
12, deu 10"*. Um conferidor que só foi visto dizendo "sim" não foi visto.

## Fase 56 — Simular o uso, e a senha do cofre ✅

`npm run ensaio:uso` percorre os **oito cargos apertando os botões até o fim**
— marcar chamada, abrir exceção, assinar passagem, conferir o armário, abrir o
cofre, internar uma criança, escrever no diário. Os outros ensaios cobrem
outras coisas: `ensaio` abre cada tela e olha o que ela escreveu;
`ensaio:roteiro` cobra que cada tarefa tenha porta. Nenhum dos dois chegava ao
terceiro clique.

### Achados

- **O cofre não abria, e a culpa era da tela.** O protótipo entra sem senha —
  "Entrar no sistema" e pronto — e três telas depois pede "sua senha". Quem
  está demonstrando não tem senha nenhuma para dar: tenta, erra, e conclui que
  o cofre está quebrado. Foi o que aconteceu de verdade. A tela do cofre passou
  a dizer, **só no protótipo**, que a senha é `senha-dev-123`. No sistema real
  a dica não existe — lá a pessoa tem senha, e escrevê-la na tela seria o
  oposto do que este cofre defende.
- **A tela de passagem não tinha verbo.** Ela abria com um cartão de estado —
  "Plantão diurno, desde 07:00" — e o resto em branco: nenhum botão, nenhuma
  instrução. O cartão é clicável, e a tarefa do educador no roteiro é
  "registre a sua passagem do turno". Quem chega ali vê um aviso, não uma
  coisa para fazer. Uma linha resolve, e ela some quando não há plantão aberto.
- **Duas cobranças do próprio ensaio reprovavam telas certas**, pelo
  `text-transform: uppercase` do CSS: o texto que volta é "QUEM APARECE POR
  ALICE", e a comparação era sensível a maiúsculas. É a armadilha já anotada
  no `ensaio.mjs`, e ela pega de novo quem escreve um ensaio novo.

## Fase 55 — A internação aparece onde a criança aparece ✅

Duas coisas ficaram prometidas na fase anterior e não entregues.

**1. O educador não tinha como saber onde a criança estava.** Ela sumia da
chamada dele — de propósito — e nada, em lugar nenhum, dizia por quê. Ele
contaria dezenove onde havia vinte e ligaria para a coordenação às onze da
noite para perguntar se a criança foi internada, transferida, ou se alguém
errou o cadastro.

A lista de acolhidos passou a mostrar **"no hospital"**, para todo mundo da
casa. O que sai é o FATO e o lugar; o motivo, o diário e a medicação continuam
atrás do alcance da internação, que é a decisão da coordenação. Saber que ela
está no hospital não é ler o prontuário dela — é saber por que a cadeira está
vazia.

**2. "A medicação dada no hospital entra no perfil e no sistema."** Entrava na
internação e parava ali. Agora o histórico de saúde traz o período e as doses
de lá, e a folha que a Enfermagem leva para a consulta ganhou duas seções.
Sem isso, o histórico teria um buraco de três semanas exatamente no período em
que mais coisa aconteceu com a criança — e o médico que recebesse a folha
concluiria que ninguém acompanhou.

A origem vai escrita **em cada linha**, e na coluna de quem administrou: é a
informação que muda a leitura da linha inteira, e não cabe numa nota de rodapé.

### Achado desta fase

A pendência `internacaoEmAndamento` do painel de saúde olhava o TIPO do
atendimento (`health_encounter.kind = 'internacao'`), que registra *que houve*
uma internação — não o período. Com a tabela nova, ela passou a olhar o
período de verdade. Eram duas noções de "internada" convivendo, e a mais
antiga responderia "não" para uma criança que está no hospital agora.

## Fase 54 — A internação ganha tela ✅

A tela (`screens/Internacao.tsx`), a porta em "Mais", o alcance por cargo e o
`mock.ts` — com o efeito que importa: no protótipo, a criança internada
**some da chamada e da grade** igual ao servidor. A demonstração passou de 107
para 113 telas.

Três coisas que a tela faz de propósito:

- **conta os dias COM relato, e nunca os que faltam.** O relato diário não é
  obrigatório (coordenação, 03/09/2026); uma tela que dissesse "3 dias sem
  registro" transformaria numa cobrança o que foi combinado como um lugar para
  escrever;
- **a medicação do hospital fica separada, com a origem escrita**, e a tela diz
  em voz alta que ela não entra na grade da casa;
- **encerrar pede o desfecho, e um dos três é óbito.** Ele está na lista porque
  acontece, e um sistema que só tem "alta" obriga alguém a mentir no pior dia
  possível.

### Achado desta fase

**O estado do servidor de mentira nasceu dentro da função que responde.** As
listas de internações e de contatos foram declaradas dentro de `responder()`:
compilava, a demonstração respondia "internação aberta", e a lista seguinte
vinha vazia — o array nascia de novo a cada chamada. O defeito não aparece num
ensaio de telas; aparece quando alguém tenta usar a demonstração como se fosse
o sistema, que é exatamente o que a casa vai fazer com ela na reunião.

## Fase 53 — Internação hospitalar: o servidor ✅

Pedido da coordenação em 03/09/2026. A criança internada **continua da casa** —
continua na contagem, continua ocupando a vaga — e **sai da linha do dia**:
some da chamada e da grade de medicação, e volta sozinha na alta. Ganha um
diário paralelo, com educador acompanhante, anexos do hospital e a medicação
que o hospital administrou.

Migração 0890, quatro tabelas, `InternacaoService`, sete rotas, 11 testes e2e.
**A tela ainda não existe** — está na fase seguinte, junto do `mock.ts`.

### As decisões, e de quem foram

| Pergunta | Resposta |
|---|---|
| A vaga continua ocupada? | Sim — coordenação |
| Quem abre e fecha? | Equipe técnica e coordenação — coordenação |
| Relato diário é obrigatório? | Não; existe o lugar para escrever — coordenação |
| Medicação do hospital entra? | Sim, com a origem escrita — coordenação |
| Educador acompanhante troca? | Sim, delegado pela técnica ou coordenação — coordenação |
| Educador comum vê? | Não — coordenação |
| A Enfermagem vê? | **Sim — decisão minha**, a desfazer numa linha se estiver errada |

Duas coisas que o sistema decide e que não estavam na pergunta:

- **a dose que estava prevista não é apagada nem marcada como não
  administrada** ao abrir a internação. Ela sai da tela e fica no banco, sem
  juízo: o sistema não conclui o que não viu;
- **a medicação do hospital tem `recorded_by` e NÃO tem `administered_by`.**
  Quem escreveu no sistema e quem administrou são pessoas diferentes, e
  inventar um campo para a segunda seria fazer a casa aparecer administrando o
  que não administrou.

### Achados desta fase

- **Uma política de RLS não pode se basear em consultar a própria tabela que
  ela protege.** `int_select` chamava uma função que fazia `SELECT ... FROM
  hospitalization`, e todo `INSERT ... RETURNING` falhava: devolver a linha
  recém-criada exige poder lê-la, e a subconsulta enxerga o instantâneo
  ANTERIOR ao comando, onde a linha ainda não existe. A recusa chegava como
  `new row violates row-level security policy`, que manda procurar na política
  de INSERT — onde não havia nada errado. **`SECURITY DEFINER` não resolve:** o
  problema não é privilégio, é visibilidade dentro do mesmo comando. A política
  passou a ser escrita sobre as COLUNAS da linha.
- **O dia da alta é dia de casa.** A primeira versão contava o dia da alta como
  internada, e a criança que voltou às dez da manhã ficava invisível na chamada
  do próprio dia em que voltou.
- **"internação" tem exatamente dez caracteres.** O teste do motivo curto
  usava essa palavra, passava na validação, e criava sem querer a internação
  que o teste seguinte tentava criar — e o erro aparecia três testes adiante.

## Fase 52 — O que a lista da casa pede ✅

A equipe técnica mantém as vinte crianças da Casa 03 num documento de texto,
reenviado inteiro toda vez que uma linha muda. Ele traz, por criança:
filiação, RG, cartão SUS, os telefones da genitora, do padrinho, da tia e do
vínculo comunitário, o número do processo e a **chave de acesso a ele**.

Esse arquivo é o problema que o sistema existe para resolver — e não um
defeito da equipe: é o que sobra quando não há onde guardar. Ele foi lido como
**especificação de campos**. Nenhum dado real entrou: a carga é da implantação,
com a LGPD decidida.

| Campo | Onde ficou |
|---|---|
| Filiação | `person.filiation`, texto, um nome por linha |
| RG e cartão SUS | `person.rg`, `person.cns` |
| Foto de identificação | `person.photo_key`, objeto fora do banco |
| Contatos com vínculo | `person_contact` (migração 0880) |
| Chave de acesso ao processo | cofre de credenciais, tipo novo |
| Nº do processo, data do acolhimento, escola, nome social | já existiam |

### As decisões, e de quem foram

- **A filiação é TEXTO, e não duas colunas "mãe" e "pai".** Impor duas colunas
  obrigaria a decidir, no cadastro, qual nome é de qual papel — e a família de
  uma criança acolhida raramente cabe nesse molde. Um nome por linha, como a
  casa já escreve.
- **A chave de acesso vai para o COFRE**, e não para o cadastro. A coordenação
  pediu para guardar tudo, e está certa; o que muda é onde. Essa chave abre o
  processo inteiro: é da natureza da senha do gov.br, e não de um número de
  documento. Cifrada, aberta só pelo coordenador e pelo Gestor Geral, com
  reautenticação e registro por visualização.
- **RG, CNS e filiação corrigem-se com MOTIVO**, pela mesma porta do nome —
  não pela de "atualizar", que não pede motivo. Documento de identidade não
  muda: ou estava errado, ou foi emitido agora, e alguém vai perguntar por que
  o RG do relatório de março não é o de setembro.
- **O educador LÊ os contatos e não escreve** (coordenação, 03/09/2026): quem
  está com a criança precisa saber quem é a pessoa que apareceu no portão.
- **Contato não se apaga, encerra-se com motivo.** O telefone que deixou de
  valer é informação: alguém tentou por ele e não conseguiu.
- **A foto não depende de autorização de imagem** (coordenação, 03/09/2026):
  serve para a equipe reconhecer quem é quem, e se sair num documento é para o
  Juízo. Mesmo assim ela não entra em documento nenhum por padrão.

### O que a tabela acrescentou por conta

`person_contact.restricted`, com motivo obrigatório. A lista da casa não tem
essa coluna, e ela existe porque há situação em que o telefone está no papel e
a aproximação está suspensa por decisão judicial — e quem descobre isso às 23h
descobre tarde.

## Fase 51 — Um ano de casa: o que a tela demora ✅

Tudo o que foi medido até aqui foi medido com o banco recém-semeado. A casa
não vive assim. `backend/scripts/ensaio-carga.ts` escreve doze meses da
Fundação inteira em dados fictícios — 232 mil marcações de chamada, 191 mil
linhas de auditoria, 162 mil doses — e mede pelo HTTP, com sessão e RLS, as
rotas que as telas mais abertas chamam.

| Rota | Antes | Depois |
|---|---|---|
| Dia — a linha do dia | **8 612 ms** | 65 ms |
| Dia — painel da casa | **8 373 ms** | 63 ms |
| Saúde — grade do dia | **8 245 ms** | 47 ms |
| Saúde — painel da enfermagem | 472 ms | 130 ms |
| Chamada — as de hoje | 186 ms | 15 ms |

### O achado

A consulta filtra o dia assim: `(scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = $2`.
É a forma natural de perguntar "o que é de hoje", e com um ano de registros ela
custa oito segundos e meio.

**A causa não é o volume.** Sob RLS, o Postgres só empurra para dentro do
índice os predicados marcados como LEAKPROOF — a garantia de que a função não
vaza, por mensagem de erro, o conteúdo de uma linha que a pessoa não podia ver.
`timezone()` e o cast para `date` não são leakproof. O filtro do dia era
aplicado DEPOIS da política de segurança, e `app_person_in_scope()` rodava uma
vez para cada uma das vinte mil doses do ano daquela casa — para devolver
noventa.

É a regra 12 pelo avesso: lá, agregar sem conferir o escopo antes fazia o RLS
zerar a contagem em silêncio; aqui, perguntar o dia de um jeito que o índice
não alcança faz a política rodar vinte mil vezes.

**A correção** converte o PARÂMETRO em vez da coluna: uma faixa
`>= meia-noite local AND < meia-noite local do dia seguinte`. Comparação de
`timestamptz` é leakproof, desce para o índice, e a política roda só nas linhas
do dia. Aplicada em medicamentos, atividades, chamadas e ocorrências.

### O caminho errado, que também ensinou

A primeira hipótese foi índice faltando, e criei quatro índices de expressão
sobre `(house_id, dia local)`. **O tempo não mudou** — e foi essa não-mudança
que apontou para a leakproofness. Os quatro índices foram descartados; sobrou
a 0870, que resolve outra coisa: o histórico de saúde de UM acolhido, a folha
que a Enfermagem leva para a consulta, não tinha índice por `person_id` e
varria a tabela.

### A regressão que ficou

`test/fronteira-do-dia.e2e.spec.ts`. A reescrita por faixa é rápida e erra em
silêncio: um deslocamento de uma hora não quebra nenhum dos 430 testes, só faz
a dose das 23h40 aparecer no dia seguinte, e alguém na casa concluir que ela
não foi dada. O teste prega a fronteira no chão — 00:00, 23:59, e a dose que é
do dia seguinte — e foi provado FALHANDO: com a consulta em UTC, os três casos
reprovam. Em UTC, as 23h59 de Porto Alegre são 02h59 do dia seguinte; o erro
seria de exatamente três horas, todo dia, para sempre.

### O que ficou medido e não corrigido

O painel da enfermagem, em 130 ms. Ele alcança as oito casas de propósito, e
130 ms é o preço disso — abaixo do limiar em que a tela deixa de parecer
instantânea, e sem uma causa única para atacar. Fica anotado para a próxima
vez que alguém medir.

## Fase 50 — A tela lida no corredor: acessibilidade conferida ✅

O projeto escolheu a *Atkinson Hyperlegible* por ser desenhada para leitura
difícil, e nunca conferiu o resto. `npm run ensaio:acessibilidade` roda o
axe-core (WCAG 2.1 A e AA) nas 107 telas que os oito cargos alcançam.

O resultado da primeira rodada foi melhor do que eu esperava e pior do que
parecia: **uma regra só** — nome acessível, rótulo de campo, ordem de
cabeçalho, tudo passou —, mas era contraste, e em 49 telas.

| Requisito | Onde ficou |
|---|---|
| Conferir as 107 telas contra WCAG 2.1 AA | `frontend/ensaio-acessibilidade.mjs` |
| Contagem por REGRA, não por elemento | vinte linhas com o mesmo defeito são um defeito |
| Tolerância só com motivo escrito | `TOLERADAS`, hoje vazio |

### Achados desta fase

- **A pílula "em atenção" estava em 4,46:1**, e a AA pede 4,5. A diferença não
  se enxerga num monitor, com luz, parado — enxerga-se no corredor às onze da
  noite. E o âmbar é a cor do que precisa de atenção: a tinta mais fraca da
  tela estava reservada para o aviso.
- **`opacity` desbota o texto junto com a decoração.** Quatro listas recuavam
  o que já aconteceu com opacidade entre .55 e .62. A intenção estava certa —
  some do foco, não da história —, mas a conta é multiplicativa: a linha que
  diz **quem confirmou a dose e a que horas** caía para 2,3:1, metade do
  mínimo, exatamente na linha em que ela é conferida. Agora o recuo é de fundo
  e de peso.
- **A mesma tinta passava num fundo e falhava no outro.** `--muted` dava
  5,44:1 no branco e 4,49:1 sobre a superfície rebaixada. Toda tinta precisa
  passar nos três fundos claros, e não só no branco.

## Fase 49 — O roteiro do Marcelo vira ensaio, e o Word para de envelhecer ✅

Duas coisas que o Marcelo leva para a casa em dois dias: as tarefas e o papel.

| Requisito | Onde ficou | Como se prova |
|---|---|---|
| Toda tarefa do roteiro tem porta, no cargo certo | `frontend/ensaio-roteiro.mjs` | 20 tarefas, todas verdes |
| O Word do roteiro nasce do markdown | `scripts/roteiro-em-word.mjs` | 11 folhas, uma por cargo |
| Espaço para escrever à mão em cada tarefa | linhas pontilhadas no gerador | conferido em PDF, folha a folha |

O ensaio **não** simula a procura de uma pessoa — onde ela para é justamente o
que a aplicação do roteiro serve para descobrir, e nenhum ensaio responde
isso. O que ele impede é o outro fracasso, o barato: a tarefa não ter porta
nenhuma, e o Marcelo descobrir isso diante da equipe.

### Achados desta fase

- **A chamada da manhã do protótipo já está confirmada** — 20 de 20 —, e a
  tarefa 1 do roteiro pede "confirme a presença da chamada da manhã". A
  educadora chegaria numa chamada já feita e acharia que errou alguma coisa. O
  estado confirmado existe de propósito, para a demonstração poder mostrá-lo;
  quem mudou foi o roteiro, que agora pede a do almoço e explica por quê
  (§0.3).
- **O Word do roteiro estava dois dias atrasado.** Era montado à mão em 31/08,
  e desde então o markdown ganhou três seções e uma pergunta — e é o Word que
  alguém imprime e leva para a casa. Documento que envelhece calado é pior do
  que documento nenhum: quem o carrega acredita estar com a versão certa.
  Agora ele nasce do markdown.
- **O conversor tratava cada linha do arquivo como um parágrafo**, e o
  documento saiu com 17 páginas de frases cortadas no meio. A quebra de linha
  do markdown é do ARQUIVO, não do texto; ele passou a ler blocos.
- **Três tarefas do ensaio estavam procurando no lugar errado**, e nenhuma
  delas era defeito do sistema: "Triagem" é aba dentro da Saúde e não porta do
  "Mais"; "Devolver pedindo complemento" mora dentro de "Revisar", porque
  devolver sem ler não deveria ser possível; e a tela de transferências fala
  em "Recebidas" e "Enviadas por esta casa", que é a linguagem da casa e não a
  do cadastro — o ensaio procurava a palavra "transferência" e reprovava uma
  tela certa.

## Fase 48 — Backup, restauração provada, e a configuração que ninguém documentou ✅

O projeto tinha 425 testes e nenhuma resposta para "o servidor morreu, e
agora?". Não havia backup, não havia restauração, e o `.env.example` estava
com metade das variáveis.

| Requisito | Onde ficou | Como se prova |
|---|---|---|
| Backup do banco e dos DOIS acervos | `scripts/backup.sh` | `ensaio:restauracao` |
| Restaurar sem sobrescrever por acidente | `scripts/restaurar.sh` | pede o nome do banco à mão |
| **Provar** que a restauração funciona | `npm run ensaio:restauracao` | ciclo em banco descartável |
| O cofre abre depois de restaurar | `scripts/conferir-cofre.mjs` | provado falhando com a chave errada |
| Nenhuma variável sem documentação | `test/implantacao.spec.ts` | 5 testes estáticos |
| O que fazer antes do piloto | `docs/implantacao.md` | — |

### Achados desta fase

- **Oito variáveis de ambiente fora do `.env.example`**, entre elas a
  `CREDENTIAL_KEY` — a chave que cifra as credenciais de acesso dos acolhidos.
  Uma variável não documentada some duas vezes: na instalação (ninguém sabe
  que existe) e na restauração (ninguém sabe que precisava vir junto).
- **`ARQUIVO_DIR` e `ARQUIVOS_DIR`**, uma letra de diferença, apontando para
  acervos DIFERENTES: as cópias documentais arquivadas e os objetos do dossiê
  do acolhido. Quem configurasse um acreditando ter configurado os dois
  perderia metade do acervo no primeiro backup — e o banco continuaria dizendo
  que o arquivo existe. A primeira virou `ARQUIVO_DRIVE_DIR`.
- **A janela de acesso por plantão (T-10/T+10) não existe, e três documentos
  diziam que sim.** `SHIFT_WINDOW_MODE` e `SHIFT_WINDOW_TOLERANCE_MIN` estavam
  no `.env.example`, citadas na `arquitetura.md` como "implementada como
  configuração", e nenhuma linha de código as lia. Uma chave que não faz nada
  é pior do que chave nenhuma: alguém escreve `enforce` e acredita que a casa
  está protegida. Ela depende da escala 12x36, que a Fundação não entregou.
- **A primeira lista de tabelas do conferidor tinha dois nomes que nunca
  existiram.** O conferidor respondia "erro" nos dois lados, e dois erros
  iguais se leem como acordo: a conferência passava sem conferir nada. Tabela
  inexistente na origem agora é falha declarada, com a frase "a lista
  envelheceu".

### A decisão que atravessa esta fase

**A `CREDENTIAL_KEY` não entra no backup.** Sem ela, o backup restaura o cofre
como bytes ilegíveis: as credenciais dos acolhidos morrem com a chave, não com
o servidor. Com ela guardada junto, uma pasta de backup extraviada passa a
valer as senhas de gov.br e INSS de vinte crianças. A chave vive em outro
lugar, com outro dono — e o script LEMBRA disso toda vez, em vez de resolver
por conta.

E o conferidor do cofre foi provado **falhando**: com uma chave diferente da
que cifrou, ele acusa as credenciais e sai com código 1. Um conferidor que só
foi visto dizendo "sim" não foi visto.

## Fase 47 — As folhas em Word saem do servidor ✅

A ATA, a ocorrência, a saúde, a grade da casa e os combinados eram montados
**no navegador**, e o `.docx` era escrito lá. O documento saía certo, e o
sistema ficava sem resposta para a pergunta que importa meses depois: **quem
tirou esta cópia daqui, e para quê?** Arquivo gerado no navegador não passa
por auditoria nenhuma.

| Requisito | Onde ficou | Teste |
|---|---|---|
| Um contrato de folha, lido pelas duas pontas | `kernel/documentos/folha.ts` | `folhas-em-word.e2e` |
| Folha → `.docx` com timbre, uma vez só | `kernel/documentos/documentos.service.ts` | idem |
| Cada partição monta a folha que é dela | `ata-folha`, `ocorrencia-folha`, `saude-folha`, `grade-folha`, `combinados-folha` | idem |
| Ver não é exportar | `GET .../folha` não registra nada | contagem relativa na auditoria |
| Exportar exige finalidade escrita | recusa no kernel, ≥10 caracteres | e2e + `ensaio:folhas` |
| A saída fica registrada, sem o conteúdo | `audit_event` com título e contagem | e2e confere as chaves do detalhe |
| Fala espontânea não vai para o papel | folha da ocorrência, e a ressalva diz isso | e2e procura o texto no `.docx` |
| Casa fora do alcance é recusa | `app_house_in_scope` antes de montar | e2e com a coordenação da Casa 04 |
| A tela pergunta a finalidade antes | folha "Para que você precisa desta cópia?" | `ensaio:folhas` |

### Achados desta fase

- **`app_house_label` não confere alcance — confere INSTITUIÇÃO.** A grade e
  os combinados de outra casa saíam com título correto e conteúdo vazio,
  porque o RLS filtrava as linhas e o rótulo vinha assim mesmo. "Casa 04 —
  nenhuma dose prevista para hoje" é a mesma armadilha da regra 12, agora em
  papel timbrado. Agora `app_house_in_scope` responde antes, e a folha é
  recusada.
- **O conferidor de rotas pegou a rota que EU escondi numa variável.** A folha
  recebia `rotaExport` como texto e chamava `api(rotaExport)`: compilava,
  funcionava, e sumia com as cinco rotas de exportação do `contrato-rotas`.
  A folha passou a receber a função; a rota está escrita por extenso em cada
  tela.
- **E então o mesmo conferidor reprovou o comentário que explicava a
  correção.** Ele varre texto, e leu `api(rotaExport)` dentro de um comentário
  como se fosse a chamada. Comentário agora some antes da varredura: um
  conferidor que pune quem escreve sobre o defeito ensina a não escrever sobre
  o defeito.
- **O banco recusou a limpeza da suíte.** O `afterAll` tentava apagar a
  ocorrência de teste e levou `ocorrencia_nao_e_apagada` — que é exatamente o
  que a regra manda. A limpeza da suíte não é exceção à regra: quem limpa é o
  `globalSetup`, recriando o schema.

### O que esta fase decidiu, e não é técnico

- **A folha da ocorrência não leva fala espontânea nem sinais observados**,
  nem para quem tem política para lê-los na tela. Ver na tela é um acesso
  registrado, de uma pessoa, num momento; a folha impressa é uma cópia que
  anda sozinha pela casa. E a folha **diz** que não leva, em vez de só omitir.
- **A ATA que não está fechada sai marcada como rascunho.** Uma cópia de ATA
  aberta circulando como institucional é o registro do turno antes de a equipe
  ter terminado o turno.
- **A grade da casa é papel de serviço**: horário, nome e medicamento, sem
  diagnóstico nem alergia, com o aviso escrito dentro de onde ela pode ficar
  pendurada.
- **Sai em Word, não em PDF**, por uso: quem assina precisa poder mexer. Um
  PDF fechado empurraria a equipe a refazer o documento no Word da máquina
  dela — e aí o que vai ao Juízo deixa de ter relação com o que está no
  sistema.

## Fase 46 — A fila local do aparelho ✅

O servidor já sabia receber a fila desde a fase 3: `POST /sync/push` decide o
que aplicar, guarda as duas versões quando não consegue, e devolve o que pode
ser apagado. Faltava a outra metade — o aparelho que GUARDA quando não há
sinal, tenta sozinho e só esquece o que o servidor confirmou.

| Requisito | Onde ficou | Teste |
|---|---|---|
| Guardar a operação sem sinal (§17.1) | `frontend/src/fila-offline.ts`, IndexedDB | `ensaio:fila` |
| Sobreviver ao aplicativo fechar | IndexedDB, e não memória nem `localStorage` | `ensaio:fila` |
| Apagar só o que voltou em `podeLimpar` (§17.2) | `sincronizar()` | `ensaio:fila` (o tipo recusado FICA) |
| Horário do ato, nunca o do envio (§17.3) | `happenedAt` na hora do toque | `ensaio:fila` |
| Sem sinal não afrouxa regra | a mesma operação da API, validada na chegada | handlers da fase 3 |
| Dose exige o aparelho da casa (§11.7) | recusa no `enfileirar`, com frase | `fila-offline.spec` |
| A lista de tipos é única nas três pontas | `modules/sync/tipos-offline.ts` | `fila-offline.spec` (7 testes) |
| Ver o que ainda não subiu | selo no cabeçalho + folha "Guardado neste aparelho" | `ensaio:fila` |
| A chamada marcada offline sai da lista de quem falta | estado local em `Chamada.tsx` | `ensaio:fila` |
| Experimentar isso antes do piloto | botão "sem sinal", só no protótipo | `ensaio:fila` usa ele |

### Achados desta fase

- **O `mock.ts` anunciava um tipo que o servidor não sabe aplicar**
  (`check.confirm`) e omitia dois que ele sabe (`activity.acknowledge`,
  `health.evolution`). Regra 14 de novo, e desta vez numa lista que o aparelho
  usaria para decidir o que guardar. A lista virou arquivo compartilhado, e o
  teste recusa handler sem linha e linha sem handler.
- **A tela ficava dizendo "0 de 20" depois de vinte marcações offline.** Como
  a lista não é recarregada sem servidor — e não pode ser —, a educadora
  marcava as vinte crianças e a tela continuava com o botão "Normal" intacto
  em cada linha. Ela não teria como saber quem já marcou, e a saída natural
  seria marcar de novo. A marcação guardada agora sai da lista de quem falta e
  reaparece com a palavra que diz onde ela está.
- **Uma folha aberta de dentro do cabeçalho herdava a tinta do navy.** Todas
  as folhas nasciam dentro do conteúdo, e por isso ninguém tinha fixado a cor
  em `.sheet`. A primeira folha aberta do cabeçalho veio com o título quase
  invisível sobre o branco. Nenhum erro, nenhum aviso: só um texto que não
  dava para ler. Achado no ensaio, pela foto.
- **O teste de rota em variável acusou o próprio cliente HTTP.** `api(path,
  init)` recebe a rota de quem chama — é o único lugar onde ela não pode estar
  escrita por extenso. A exceção é só do `api.ts`; quem esconde rota do
  conferidor é a tela, e as telas continuam todas dentro da regra.

### O que esta fase NÃO fez, e por quê

- **Confirmação de dose offline continua fora.** A regra existe e o servidor a
  cumpre; o que falta é o aparelho saber que é o aparelho da casa, e isso
  depende de onde o código do §11.7 é digitado nele. É a pendência
  institucional #7 chegando na tela — decisão do Marcelo, não minha.
- **O service worker não foi mexido.** A casca do app já é servida do cache
  (`vite-plugin-pwa`); o que a fila precisava era armazenamento e reenvio, não
  interceptação de requisição.

## Fase 45 — O ensaio de navegador vira suíte ✅

`tsc --noEmit` diz que o código compila; nunca disse que a tela renderiza. Duas
vezes uma tela ficou em branco no lugar certo sem que nada acusasse erro. O
ensaio deixou de ser roteiro escrito na hora e virou comando.

| Requisito | Onde ficou | Como se confere |
|---|---|---|
| Percorrer toda tela de todo cargo | `frontend/ensaio.mjs` · `npm run ensaio` | 100 telas, oito cargos, duas rodadas limpas |
| Nenhum erro de página ou de console | ouvintes `pageerror` e `console` | sai com código 1 e nomeia cargo e tela |
| Tela em branco é defeito | `main.conteudo` com menos de 40 caracteres | mesmo ensaio |
| Nada de `undefined` no texto | varredura de `undefined`, `NaN`, `[object Object]`, `Invalid Date` | mesmo ensaio |
| A lista de telas não pode envelhecer | cargos, abas e portas de "Mais" lidos do protótipo | uma tela nova entra sozinha no percurso |
| A sessão nova começa rodando | `scripts/preparar-ambiente.sh` | dependências, PostgreSQL e Chromium |
| A suíte sobe em máquina virgem | `rede_app` criado no `globalSetup` | banco e papel apagados, 408 verdes do zero |

### Achados desta fase

- **O conferidor cego no cargo que ele mais deveria olhar.** O ensaio
  descobria o que percorrer lendo a barra de abas, e a Cozinha não tem barra —
  com uma tela só, a barra seria decoração no rodapé. Resultado: zero tela
  ensaiada, e ✓ impresso do mesmo jeito. Um conferidor que não acha o que
  conferir precisa dizer isso; calado, ele vira selo de qualidade sobre o nada.
- **Roteiro com lista escrita à mão não ensaia a tela nova.** Por isso os
  cargos, as abas e as portas vêm do protótipo. O ensaio não sabe quantas telas
  existem: ele pergunta.
- **Falha calada em ferramenta de conferência é a pior espécie.**
  `playwright install` recusado por rede não baixa nada e não reclama; quem
  rodasse o ensaio depois disso veria "sem navegador" e seguiria em frente. O
  preparo tem três degraus e diz em qual parou.
- **O que o ensaio não faz** está escrito no cabeçalho dele: abrir tela não é
  usar tela. Formulário, folha por cima e fluxo do roteiro do Marcelo ficam
  para o passo seguinte.

## Fase 11 — Auditoria de testes e documentação ✅
219 testes em 16 suítes, todas verdes. As 6 falhas antigas do `saude` eram uma
só, em cascata: o teste media `criadas` na casa inteira e dependia da ordem das
suítes. **Regra que ficou:** suíte que muta estado compartilhado desfaz o que
criou — a primeira versão da regressão passava sozinha e derrubava duas suítes
vizinhas.
