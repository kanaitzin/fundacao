# Riscos, premissas e mitigação

## Riscos críticos

| Risco | Impacto | Mitigação |
|---|---|---|
| Sincronização offline de medicamentos (duplicidade entre aparelhos) | segurança do cuidado | Confirmação offline só no aparelho institucional designado (§11.7); IDs de cliente + idempotência; conflitos preservam todas as versões e vão à equipe técnica (Fase 3/4). Projetado desde a fundação (horário real ≠ horário de sync no modelo). |
| Adoção pela equipe sob carga real | sistema morre no piloto | UX de plantão (chamada < 2 min, botões grandes); protótipo validado com a equipe antes de cada fase; período de paralelo com papel limitado e com prazo. |
| Escopo vs. tempo | entrega parcial | Fatias verticais funcionais por fase; cada fase termina com testes e demo. |
| Dados bancários (inclusive cópia no Drive, §6.10) | vazamento do dado mais sensível | Reautenticação, log por visualização, pasta segregada, arquivo cifrado antes do upload (Fase 6), nunca em telas gerais/ATA/notificação. |
| Janela T±10 vs. escala 12x36 real | bloqueio de trabalho legítimo | Modo `observe` no piloto (§5.12); auditoria de extensões; bloqueio rígido só após acompanhamento. |
| Pendências institucionais (33.4) viram regra inventada | decisão indevida | Todas mapeadas para configuração/flag em `docs/pendencias-institucionais.md`. |

## Premissas registradas

- Códigos AI1–AI4/ARM1–ARM4 são preliminares (§2); troca sem impacto estrutural.
- Horário do Líder Noturno Geral 19h–7h é hipótese configurável (§33.4.4).
- Login sem MFA obrigatório na v1; arquitetura pronta para MFA futuro (§4.5) —
  o modelo de sessão já registra reautenticação.
- "Visão dos 20" = todos os acolhidos ativos da casa (número esperado, não fixo).
- CPF: busca por CPF completo; exibição operacional mascarada (decisão de design a
  validar com a instituição — princípio da minimização, §3.1).
- Produção/hospedagem indefinidas: tudo containerizado, sem dependência de fornecedor.

## O que este sistema deliberadamente NÃO faz (§3.3)

WhatsApp; GPS/rastreamento de pessoas; contas compartilhadas; ranking/pontuação;
decisão automática (diagnóstico, culpa, risco, punição, medicação, transferência);
exclusão simples; sobrescrita de registro fechado; envio automático a órgãos externos;
IA decisória; microserviços; módulo de alistamento; controle de cofre físico.
