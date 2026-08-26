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

## Fase 2 — Perfil do Acolhido (próxima)

Pessoa/episódio/permanência; CPF único + duplicidade (cenários #4, #5); documentos
categorizados (#24); saúde/alimentação; benefícios/dados bancários restritos (#39, #40);
memórias (flag); acervo/retorno/transferência (#6, #7); busca protegida.

## Fase 3 — Operação
Rotina versionada, agenda, linha do tempo (#8, #9, #10), chamadas, visão dos 20,
notificações/escalonamento, substituição, fila offline criptografada (#16, #17),
aparelho institucional designado (#15).

## Fase 4 — Medicamentos e saúde
Grade da Enfermagem, administração (#13, #14), Evolução de Saúde + triagem (#37),
Resumo de Saúde PDF (#38), estoque/validade, pendências 33.4.1/2 como configuração.

## Fase 5 — Plantão e proteção
Passagens individuais (#11, #12, #18), ATAs (#19, #20, #21, #36), ocorrências (#22),
comunicações externas (#23), narrativas restritas (#29).

## Fase 6 — Relatórios e Drive
Acompanhamentos, aprovações, relatórios (§14), arquivamento no Drive (#26, #27),
exportações auditadas (#32), painéis sem ranking.

## Fase 7 — Piloto Casa 03
Migração assistida, treinamento, paralelo com prazo, homologação, aceite (#42).
