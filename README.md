# Rede Acolher

Plataforma interna de gestão do acolhimento institucional da **Fundação O Pão dos Pobres**.
Monólito modular: **NestJS + PostgreSQL (RLS) + React PWA**. Piloto: **Casa 03**.

> ⚠️ Este repositório contém apenas **dados fictícios**. Nunca use dados reais em
> desenvolvimento/teste. Não coloque em produção sem avaliação jurídica, DPO e RIPD
> (Prompt Master §3.1). Segredos ficam fora do repositório.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `backend/` | API NestJS, migrações SQL (`db/migrations/`), seed e testes de aceite |
| `frontend/` | PWA React + TypeScript (Vite) |
| `docs/` | Arquitetura, DER, matriz de permissões, ADRs, riscos, pendências, backlog |
| `prototipo/` | Protótipo navegável da Fase 0 (HTML único) usado na validação com a equipe |

## Executar em desenvolvimento

Requisitos: Node 22+, Docker (ou PostgreSQL 16 local).

```bash
cp .env.example .env            # ajuste se necessário
docker compose up -d db redis   # PostgreSQL + Redis
npm install
npm run migrate                 # aplica db/migrations/*.sql
npm run seed                    # instituição, 8 casas e usuários fictícios (senha: senha-dev-123)
npm run dev:backend             # API em http://localhost:3000/api/v1
npm run dev:frontend            # PWA em http://localhost:5173 (proxy /api -> 3000)
```

Usuários fictícios: `educador.ai3@`, `lider.ai3@`, `tecnica.ai3@`, `coord.ai3@`,
`enfermagem@`, `lider.noturno@`, `gestor@` … `paodospobres.dev` — senha `senha-dev-123`.

## Testes

```bash
npm test        # testes de aceite da fundação (isolamento, RLS, auth, auditoria)
```

Os testes cobrem cenários do Prompt Master §26.2 — ver `docs/backlog.md` para a
matriz requisito → implementação → teste.

## Estado do projeto

- ✅ Fase 0 — protótipo navegável validável (em `prototipo/`)
- ✅ Fase 1 — fundação: autenticação, casas, papéis, isolamento (API **e** RLS), auditoria imutável, PWA
- ⏳ Fase 2 — Perfil do Acolhido (próxima)
- Fases 3–7 — ver `docs/backlog.md`
