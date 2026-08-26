# ADR-003 — Hash de senha com scrypt (Node nativo)

**Status:** aceita · **Data:** 2026-08-26

## Contexto
§4.5 pede "hash moderno de senha". Argon2id é o estado da arte, mas exige dependência
nativa (compilação por plataforma), o que fragiliza implantação em infra simples.

## Decisão
`crypto.scrypt` nativo do Node (N=2^15, r=8, p=1, salt 128 bits, chave 512 bits,
comparação em tempo constante). Formato autodescritivo (`scrypt$N$r$p$salt$key`)
permite migração transparente para argon2id no futuro: basta trocar `common/crypto.ts`
e re-hash no próximo login.

## Consequências
+ Zero dependências nativas; parâmetros armazenados junto ao hash.
− Ligeiramente inferior ao argon2id contra ataques com GPU; mitigado por bloqueio de
  força bruta persistido e política de senha no primeiro login.
