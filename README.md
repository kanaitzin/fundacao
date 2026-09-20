# Rede Acolher

Plataforma interna de gestão do acolhimento institucional da **Fundação O Pão
dos Pobres**, em Porto Alegre. Oito unidades, cerca de vinte crianças e
adolescentes em cada uma; **Casa 03 (AI3)** é o piloto.

Monólito modular: **NestJS + PostgreSQL 16 com RLS + React PWA**.

> ⚠️ Este repositório contém apenas **dados fictícios**. Nunca use dados reais
> em desenvolvimento ou teste, e não coloque em produção sem avaliação jurídica,
> DPO e RIPD. Segredos ficam fora do repositório.

---

## 📖 Leia isto primeiro

**[`docs/REDE-ACOLHER.md`](docs/REDE-ACOLHER.md)** é o **documento único** do
projeto: o que o sistema é, como rodá-lo, a arquitetura, as regras que não se
negociam, o que já funciona, o que falta, as decisões paradas esperando a
Fundação, e a implantação.

Este README não repete nada dele de propósito. Um segundo documento vivo é como
a pilha de dezesseis arquivos que existia até 09/09/2026 — três deles já
discordavam entre si sobre fatos verificáveis.

## Começar

```bash
bash scripts/preparar-ambiente.sh    # dependências, PostgreSQL e Chromium
```

**No Claude Code na web isto já foi feito:** o `.claude/hooks/session-start.sh`
roda antes de a sessão começar e deixa a máquina pronta, com o banco migrado e a
semente fictícia. Ver §14 do documento único.

Depois, o §3 do documento único tem os comandos: `tsc`, a suíte, o protótipo e
os ensaios de navegador. **A suíte é `npm test`** — nunca `npx jest` pelado: há
um banco só, e em paralelo as suítes se contaminam.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `backend/` | API NestJS em partições isoladas, cada uma com as próprias migrações |
| `frontend/` | PWA React + TypeScript (Vite), e os ensaios de navegador |
| `prototipo/` | o `.html` único que a Fundação abre, sem servidor |
| `scripts/` | preparo do ambiente, o relógio adiantado, backup, restauração, ensaio de produção |
| `.claude/` | o hook que prepara a sessão na web, e os comandos de verificação pré-aprovados |
| `docs/` | o documento único, o DER, o roteiro do Marcelo — e `historico/`, que é arquivo morto |
