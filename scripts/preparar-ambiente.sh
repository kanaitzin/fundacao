#!/usr/bin/env bash
#
# PREPARAR AMBIENTE — deixa a máquina pronta para rodar a suíte e o ensaio.
#
# Existe porque três coisas caem entre uma sessão e outra, e as três falham de
# um jeito que não diz o que houve:
#   1. as dependências vêm de `npm ci` NA RAIZ (é um workspace; instalar dentro
#      de frontend/ ou backend/ separadamente atrapalha);
#   2. o PostgreSQL do desenvolvimento não é serviço — ele para sozinho, e a
#      suíte responde com erro de conexão;
#   3. o Chromium do ensaio nem sempre pode ser baixado (ver §Chromium).
#
# Uso:
#   bash scripts/preparar-ambiente.sh
#   eval "$(bash scripts/preparar-ambiente.sh --exportar)"   # só as variáveis
#
# Nada aqui toca em dado real, e nada aqui publica coisa alguma.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="${PGDATA:-/tmp/pgdata}"
PGRUN="${PGRUN:-/tmp/pgrun}"
PGPORT="${PGPORT:-5432}"
ARQUIVOS_DIR="${ARQUIVOS_DIR:-/tmp/arquivos}"
DATABASE_URL="${DATABASE_URL:-postgres://rede_admin:dev-only-change-me@127.0.0.1:${PGPORT}/rede_acolher}"

SO_EXPORTAR=0
[[ "${1:-}" == "--exportar" ]] && SO_EXPORTAR=1

diga() { [[ $SO_EXPORTAR -eq 1 ]] || echo "$@"; }

# ---------------------------------------------------------------- dependências
if [[ ! -d "$RAIZ/node_modules" ]]; then
  diga "→ npm ci na raiz (workspace)…"
  (cd "$RAIZ" && npm ci --no-audit --no-fund >/dev/null)
fi
diga "✓ dependências"

# ------------------------------------------------------------------ PostgreSQL
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [[ -z "$PGBIN" ]]; then
  diga "✗ PostgreSQL não instalado. Instale o 16 (a suíte roda contra banco de verdade)."
else
  mkdir -p "$PGRUN" "$ARQUIVOS_DIR"
  if [[ ! -s "$PGDATA/PG_VERSION" ]]; then
    diga "→ initdb em $PGDATA…"
    mkdir -p "$PGDATA"; chown -R postgres "$PGDATA" "$PGRUN"
    su postgres -c "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
  fi
  chown -R postgres "$PGDATA" "$PGRUN" 2>/dev/null || true
  if ! su postgres -c "$PGBIN/pg_isready -h 127.0.0.1 -p $PGPORT" >/dev/null 2>&1; then
    diga "→ subindo o PostgreSQL…"
    su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-k $PGRUN -h 127.0.0.1 -p $PGPORT' -l /tmp/pg.log start" >/dev/null
    sleep 2
  fi
  psql_() { su postgres -c "$PGBIN/psql -h 127.0.0.1 -p $PGPORT -U postgres -tAc \"$1\""; }
  # rede_admin é dono do banco; rede_app é o papel de aplicação que o RLS usa.
  # Os dois são do CLUSTER e sobrevivem ao DROP SCHEMA que a suíte faz.
  [[ "$(psql_ "SELECT 1 FROM pg_roles WHERE rolname='rede_admin'")" == "1" ]] || \
    psql_ "CREATE ROLE rede_admin LOGIN SUPERUSER PASSWORD 'dev-only-change-me'" >/dev/null
  [[ "$(psql_ "SELECT 1 FROM pg_roles WHERE rolname='rede_app'")" == "1" ]] || \
    psql_ "CREATE ROLE rede_app LOGIN PASSWORD 'dev-only-change-me-app'" >/dev/null
  [[ "$(psql_ "SELECT 1 FROM pg_database WHERE datname='rede_acolher'")" == "1" ]] || \
    psql_ "CREATE DATABASE rede_acolher OWNER rede_admin" >/dev/null
  diga "✓ PostgreSQL em 127.0.0.1:$PGPORT · banco rede_acolher"
fi

# -------------------------------------------------------------------- Chromium
#
# O ensaio precisa de um Chromium de verdade. O caminho normal é
# `npx playwright install chromium`, que busca o binário no CDN do Playwright.
# Em ambiente com saída de rede restrita a CDN costuma ser recusada (403
# host_not_allowed), e o comando falha CALADO: não baixa nada e não reclama.
# Por isso a busca abaixo tem três degraus, e o último traz o binário de dentro
# de um pacote npm — o registro do npm quase sempre está liberado quando o CDN
# não está.
achar_chromium() {
  [[ -n "${ENSAIO_CHROMIUM:-}" && -x "${ENSAIO_CHROMIUM}" ]] && { echo "$ENSAIO_CHROMIUM"; return; }
  for c in /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome; do
    [[ -x "$c" ]] && { echo "$c"; return; }
  done
  local doPw
  doPw="$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | tail -1 || true)"
  [[ -n "$doPw" ]] && { echo "$doPw"; return; }
  echo ""
}

CHROMIUM="$(achar_chromium)"
if [[ -z "$CHROMIUM" ]]; then
  diga "→ buscando um Chromium…"
  if (cd "$RAIZ" && npx --yes playwright-core install chromium >/dev/null 2>&1); then
    CHROMIUM="$(achar_chromium)"
  fi
fi
if [[ -z "$CHROMIUM" ]]; then
  # Último degrau: o pacote traz o binário dentro do próprio tarball do npm,
  # comprimido; a primeira chamada o descompacta em /tmp e devolve o caminho.
  diga "→ CDN do Playwright indisponível; trazendo o Chromium pelo npm…"
  TMPCHR="${TMPDIR:-/tmp}/chromium-do-ensaio"
  mkdir -p "$TMPCHR"
  if (cd "$TMPCHR" && [[ -f package.json ]] || (cd "$TMPCHR" && npm init -y >/dev/null 2>&1)); then :; fi
  if (cd "$TMPCHR" && npm i @sparticuz/chromium --no-audit --no-fund >/dev/null 2>&1); then
    CHROMIUM="$(cd "$TMPCHR" && node --input-type=module -e \
      "import c from '@sparticuz/chromium'; console.log(await c.executablePath());" 2>/dev/null | tail -1)"
    [[ -x "${CHROMIUM:-}" ]] || CHROMIUM=""
  fi
fi

if [[ -n "$CHROMIUM" ]]; then
  diga "✓ Chromium em $CHROMIUM"
else
  diga "✗ Sem Chromium. O ensaio (npm run ensaio) não roda; a suíte e o tsc, sim."
  diga "  Para resolver, libere cdn.playwright.dev na rede do ambiente."
fi

# ------------------------------------------------------------------- variáveis
if [[ $SO_EXPORTAR -eq 1 ]]; then
  echo "export DATABASE_URL='$DATABASE_URL'"
  echo "export ARQUIVOS_DIR='$ARQUIVOS_DIR'"
  [[ -n "$CHROMIUM" ]] && echo "export ENSAIO_CHROMIUM='$CHROMIUM'"
else
  cat <<FIM

Para a sessão, exporte:
  export DATABASE_URL='$DATABASE_URL'
  export ARQUIVOS_DIR='$ARQUIVOS_DIR'${CHROMIUM:+
  export ENSAIO_CHROMIUM='$CHROMIUM'}

Ou, de uma vez:
  eval "\$(bash scripts/preparar-ambiente.sh --exportar)"

Depois:
  cd backend  && npx tsc --noEmit -p tsconfig.json && npx jest
  cd frontend && npx tsc --noEmit && npm run prototipo && npm run ensaio
FIM
fi
