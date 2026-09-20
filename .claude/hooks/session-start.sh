#!/bin/bash
#
# HOOK DE INÍCIO DE SESSÃO — deixa a sessão do Claude Code na web pronta para
# rodar a suíte, o `tsc` e os ensaios, sem ninguém precisar lembrar de nada.
#
# Existe porque o container é novo a cada sessão e cai inteiro no fim: sem isto,
# a primeira coisa que qualquer sessão faz é descobrir, uma a uma, que faltam
# dependências, que o PostgreSQL não é serviço, que o `faketime` não está
# instalado e que o `fontes.css` não vem no repositório. Cada descoberta custa
# uma volta, e a que custa mais caro é a do relógio — porque ela não falha: ela
# fica verde dizendo que passou onde nunca esteve.
#
# O trabalho pesado NÃO está aqui: está no `scripts/preparar-ambiente.sh`, que é
# o mesmo script que a pessoa roda na mão e que o CLAUDE.md manda rodar. Este
# hook o chama e guarda as variáveis na sessão. Dois lugares dizendo a mesma
# coisa é como um deles fica errado.
#
# Nada aqui toca em dado real, e nada aqui publica coisa alguma.

set -uo pipefail

# Só no ambiente remoto: numa máquina da pessoa, quem decide subir banco é ela.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

RAIZ="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$RAIZ" || exit 0

diga() { echo "[rede-acolher] $*"; }

# --------------------------------------------------------------------- faketime
#
# O `relogio-adiantado.sh` não roda sem ele, e é ele que revela as datas
# calculadas em UTC. Vem do apt porque não há pacote npm que sirva.
if ! command -v faketime >/dev/null 2>&1; then
  diga "instalando o faketime (a segunda condição de relógio depende dele)…"
  if ! (apt-get install -y faketime >/dev/null 2>&1 || apt-get install -y libfaketime >/dev/null 2>&1); then
    diga "✗ faketime não instalou — o 'relogio-adiantado.sh' não vai rodar nesta sessão."
  fi
fi
command -v faketime >/dev/null 2>&1 && diga "✓ faketime"

# ------------------------------------------- dependências, PostgreSQL, Chromium
#
# UMA chamada só, com `--exportar`: ela faz o trabalho inteiro (npm ci, initdb,
# papéis, banco, Chromium) e devolve só as variáveis. Chamar duas vezes — uma
# para ver e outra para exportar — refaz tudo e enche o início da sessão com o
# texto de ajuda, que aqui não tem quem leia.
diga "preparando o ambiente (dependências, PostgreSQL, Chromium)…"
VARIAVEIS="$(bash scripts/preparar-ambiente.sh --exportar 2>&1)"
# Se não saiu nenhuma linha de export, algo falhou: aí o texto INTERESSA.
if ! grep -q '^export DATABASE_URL=' <<<"$VARIAVEIS"; then
  diga "✗ o preparar-ambiente.sh não terminou. O que ele disse:"
  sed 's/^/[rede-acolher]   /' <<<"$VARIAVEIS"
  exit 0
fi
VARIAVEIS="$(grep '^export ' <<<"$VARIAVEIS")"

# As variáveis que a suíte e os ensaios leem. Vão para o CLAUDE_ENV_FILE para
# valerem na sessão inteira, e não só neste processo.
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -n "$VARIAVEIS" ]; then
  echo "$VARIAVEIS" >> "$CLAUDE_ENV_FILE"
  diga "✓ DATABASE_URL, ARQUIVOS_DIR e ENSAIO_CHROMIUM na sessão"
fi
eval "$VARIAVEIS"

# ------------------------------------------------------------------- fontes.css
#
# É GERADO (`scripts/gerar-fontes.mjs`) e fica fora do versionamento de
# propósito: são 117 KB de fontes embutidas. Sem ele o `vite` falha ao montar o
# protótipo, com um erro que fala de import e não de fonte.
if [ ! -s frontend/src/fontes.css ]; then
  diga "gerando o frontend/src/fontes.css…"
  node scripts/gerar-fontes.mjs >/dev/null 2>&1 && diga "✓ fontes.css" || diga "✗ fontes.css não gerou"
fi

# ---------------------------------------------------------- migrações e semente
#
# A suíte recria o banco sozinha no globalSetup, então isto não é para ela: é
# para quem quiser SUBIR o sistema (`npm run dev:backend`) ou olhar o banco sem
# antes rodar a suíte inteira. Só roda se o schema estiver vazio, para não
# custar nada em container já aquecido.
if [ -n "${DATABASE_URL:-}" ]; then
  tabelas="$(PGPASSWORD=dev-only-change-me psql "$DATABASE_URL" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null || echo 0)"
  if [ "${tabelas:-0}" = "0" ]; then
    diga "banco vazio: aplicando migrações e a semente FICTÍCIA…"
    ( cd backend && npx tsx scripts/migrate.ts && npx tsx scripts/seed.ts \
      && npx tsx scripts/seed-fase2.ts && npx tsx scripts/seed-fase4.ts ) >/dev/null 2>&1 \
      && diga "✓ banco com as 8 casas e os acolhidos fictícios" \
      || diga "✗ migrações/semente falharam — rode 'npm test', que recria o banco do zero"
  else
    diga "✓ banco com $tabelas tabelas"
  fi
fi

diga "pronto. A suíte é 'npm test' (já vem com --runInBand); o relógio adiantado é 'bash scripts/relogio-adiantado.sh --rodar'."
exit 0
