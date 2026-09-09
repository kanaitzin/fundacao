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

Depois, o §3 do documento único tem os comandos: `tsc`, a suíte, o protótipo e
os ensaios de navegador.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `backend/` | API NestJS em partições isoladas, cada uma com as próprias migrações |
| `frontend/` | PWA React + TypeScript (Vite), e os ensaios de navegador |
| `prototipo/` | o `.html` único que a Fundação abre, sem servidor |
| `scripts/` | preparo do ambiente, backup, restauração, ensaio de produção |
| `docs/` | o documento único, o DER, o roteiro do Marcelo — e `historico/`, que é arquivo morto |
