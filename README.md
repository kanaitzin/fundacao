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
npm run seed:fase2              # 20 acolhidos fictícios na Casa 03, acervo e transferência
npm run dev:backend             # API em http://localhost:3000/api/v1
npm run dev:frontend            # PWA em http://localhost:5173 (proxy /api -> 3000)
```

Usuários fictícios: `educador.ai3@`, `lider.ai3@`, `tecnica.ai3@`, `coord.ai3@`,
`enfermagem@`, `lider.noturno@`, `gestor@` … `paodospobres.dev` — senha `senha-dev-123`.

## Testes

```bash
npm test        # 82 testes: fronteiras de arquitetura + aceite das fases 1–4
```

Cada execução **recria o banco do zero** (migrações + seeds fictícios), porque os
testes exercitam fluxos que mudam o estado — transferência, retorno e saída.

Os testes cobrem cenários do Prompt Master §26.2 — ver `docs/backlog.md` para a
matriz requisito → implementação → teste.

## Estado do projeto

- ✅ Fase 0 — protótipo navegável validável (em `prototipo/`)
- ✅ Fase 1 — fundação: autenticação, casas, papéis, isolamento (API **e** RLS), auditoria imutável, PWA
- ✅ Fase 2 — Perfil do Acolhido: pessoa/episódio/permanência, CPF único com detecção de
  duplicidade, documentos por categoria, saúde e restrições, benefícios restritos com
  reautenticação, transferência, acervo e retorno
- ✅ Fase 3 — Operação: rotina versionada, atividades com ciência e exceções,
  chamadas coletivas, linha do tempo unificada, notificações com escalonamento
  e sincronização offline com conflitos
- ✅ Fase 4 — Medicamentos e Enfermagem: prescrição assinada, grade de doses com
  confirmação individual, protocolo de administração configurável, estoque,
  painel da Enfermagem, Evolução de Saúde com triagem e Resumo de Saúde
- ⏳ Fase 5 — Plantão, ATAs e ocorrências (próxima)
- Fases 6–7 — ver `docs/backlog.md`

## Arquitetura em partições

O sistema é dividido em módulos isolados (`backend/src/modules/*`), cada um com
porta pública, manifesto e migrações próprias. **Acrescentar ou remover um
módulo não quebra os outros** — e isso é verificado por teste automático, não
prometido em documento. Ver `docs/arquitetura-modular.md`.
