#!/usr/bin/env bash
# O JEST SÓ RODA EM SÉRIE (regra do CLAUDE.md, "Nunca `npx jest` pelado").
#
# Há um banco só e um schema `public` só: em paralelo as suítes se contaminam, e o verde passa a
# depender de o cache do ts-jest estar quente (medido: com o cache frio, três testes reprovam).
# A regra existia só por escrito, e o `.claude/settings.json` liberava `npx jest` sem conferir.
# Este hook roda antes de todo comando do Bash e recusa o jest chamado sem `--runInBand` (ou `-i`).
# O `npm test` passa, porque o script dele já traz o `--runInBand`.
set -uo pipefail

entrada="$(cat)"
comando="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command??"")}catch{}})' <<<"$entrada")"

# Só o jest na posição de COMANDO (início, depois de ; & | ou de `npx`): `grep jest arquivo` e
# `echo jest` não são rodada do jest e passam.
if grep -Eq '(^|[;&|][[:space:]]*)(npx[[:space:]]+)?jest([[:space:]]|$)|npx[[:space:]]+jest([[:space:]]|$)' <<<"$comando" \
   && ! grep -Eq -- '--runInBand|(^|[[:space:]])-i([[:space:]]|$)' <<<"$comando"; then
  echo "Recusado: o jest roda em série neste projeto (um banco só). Use \`npm test\` ou acrescente \`--runInBand\`." >&2
  exit 2
fi
exit 0
