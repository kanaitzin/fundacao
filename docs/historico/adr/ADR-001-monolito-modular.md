# ADR-001 — Monólito modular NestJS + PostgreSQL

**Status:** aceita · **Data:** 2026-08-26

## Contexto
Prompt Master §4.2 indica monólito modular (React+TS, Node+TS+NestJS, PostgreSQL,
Redis/BullMQ) e proíbe microserviços prematuros (§3.3). Escala: 8 casas, ~160 acolhidos,
dezenas de usuários simultâneos.

## Decisão
Seguir a referência sem desvios: NestJS com módulos por domínio, PostgreSQL 16 com RLS,
Redis/BullMQ a partir da Fase 3 (notificações/filas/Drive). Acesso a dados com `pg`
direto e SQL explícito (sem ORM) — ver ADR-004.

## Consequências
+ Deploy simples (1 serviço + banco + redis), adequado a instituição sem equipe SRE.
+ Fronteiras de módulo preparam extração futura, se um dia justificada.
− Disciplina manual nas fronteiras entre módulos (revisão de código cobre).
