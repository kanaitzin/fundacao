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
| Sem marcação em lote silenciosa (§10, §11.2) | só endpoint de marcação individual | "cenário #10" |
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

## Fase 11 — Auditoria de testes e documentação ✅
219 testes em 16 suítes, todas verdes. As 6 falhas antigas do `saude` eram uma
só, em cascata: o teste media `criadas` na casa inteira e dependia da ordem das
suítes. **Regra que ficou:** suíte que muta estado compartilhado desfaz o que
criou — a primeira versão da regressão passava sozinha e derrubava duas suítes
vizinhas.
