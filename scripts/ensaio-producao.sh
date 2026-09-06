#!/usr/bin/env bash
#
# ENSAIO DE PRODUÇÃO — o sistema sobe compilado, num banco virgem.
#
# Este projeto nunca tinha rodado assim. Tudo sempre correu por `tsx` (o
# servidor de desenvolvimento) e por `jest` (que compila em memória). O que se
# implanta é outra coisa: `dist/`, sem `src/`, sem `scripts/`, e sem nenhuma
# dependência de desenvolvimento.
#
# A diferença não é teórica. Da primeira vez que este ensaio rodou, encontrou:
#
#   * `dist/` com ZERO migrações. Os 76 arquivos `.sql` vivem em
#     `src/modules/…`, e o `tsc` não copia `.sql`. Quem implantasse só o
#     `dist/` — que é o que se implanta — subiria o serviço, veria `/health`
#     responder "ok" e descobriria o banco vazio. O `/health` responde ok
#     porque o banco existe; ele não sabe se as tabelas estão lá;
#   * a migração dependendo de `tsx`, que é dependência de DESENVOLVIMENTO.
#     Em `npm ci --omit=dev` o comando falha com "tsx: not found".
#
# Uso:  bash scripts/ensaio-producao.sh
#
# Ele não publica nada e não toca no banco de trabalho: cria um banco próprio,
# usa e derruba.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
BANCO="rede_acolher_ensaio_producao"
PORTA="${PORTA_ENSAIO:-3997}"
BASE="${DATABASE_URL:-postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher}"
ADMIN="${BASE%/*}/postgres"
ALVO="${BASE%/*}/$BANCO"

achados=0

# `cobrar` RECEBE O COMANDO, e não o resultado dele.
#
# A primeira versão era `<condição>; cobrar "texto" $?` — e com `set -e` o
# script MORRIA na condição falsa, antes de imprimir o ✗. Ele saía com código
# 0, sem dizer nada, exatamente quando encontrava um defeito. Um conferidor que
# falha calado é o pior tipo de conferidor: ele não avisa que parou, e quem
# roda conclui que está tudo certo.
cobrar() {
  local o_que="$1"; shift
  if "$@" > /dev/null 2>&1; then
    echo "  ✓ $o_que"
  else
    echo "  ✗ $o_que"
    achados=$((achados + 1))
  fi
}

echo "Ensaio de produção"
echo

echo "→ construindo…"
cobrar "o backend compila" bash -c "cd '$RAIZ/backend' && npm run build > /tmp/ensaio-build.log 2>&1"

n_sql=$(find "$RAIZ/backend/dist" -name '*.sql' 2>/dev/null | wc -l)
cobrar "as migrações foram para o dist ($n_sql arquivos)" test "$n_sql" -ge 70
cobrar "há um migrador compilado" test -f "$RAIZ/backend/dist/migrate.js"
cobrar "o timbre foi junto" test -f "$RAIZ/backend/dist/assets/timbre.png"

echo
echo "→ banco virgem…"
su postgres -c "$PGBIN/psql -h 127.0.0.1 -U postgres -c 'DROP DATABASE IF EXISTS $BANCO'" > /dev/null 2>&1
su postgres -c "$PGBIN/psql -h 127.0.0.1 -U postgres -c 'CREATE DATABASE $BANCO OWNER rede_admin'" > /dev/null 2>&1

cobrar "as migrações aplicam pelo binário compilado" \
  bash -c "DATABASE_URL='$ALVO' node '$RAIZ/backend/dist/migrate.js' > /tmp/ensaio-migrate.log 2>&1"
cobrar "o migrador diz quantas aplicou" \
  grep -qE "[0-9]+ no total" /tmp/ensaio-migrate.log

echo
echo "→ subindo o serviço…"
PORT="$PORTA" \
DATABASE_URL="$ALVO" \
DATABASE_APP_URL="${ALVO/rede_admin:dev-only-change-me/rede_app:dev-only-change-me-app}" \
  node "$RAIZ/backend/dist/main.js" > /tmp/ensaio-prod.log 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 20); do
  sleep 1
  curl -sf -m 2 "http://127.0.0.1:$PORTA/api/v1/health" > /tmp/ensaio-health.json && break
done

cobrar "o serviço compilado responde /health" \
  grep -q '"status":"ok"' /tmp/ensaio-health.json
cobrar "e alcança o banco como a aplicação, não como dono" \
  grep -q '"db":"ok"' /tmp/ensaio-health.json

# Nenhum erro no arranque. Um serviço que sobe reclamando é um serviço que
# alguém vai aprender a ignorar.
cobrar "nenhum erro no arranque" \
  bash -c '! grep -qiE "\[Nest\].*ERROR|UnhandledPromiseRejection" /tmp/ensaio-prod.log'

echo
echo "→ derrubando…"
kill "$PID" 2>/dev/null || true
sleep 1
su postgres -c "$PGBIN/psql -h 127.0.0.1 -U postgres -c 'DROP DATABASE IF EXISTS $BANCO'" > /dev/null 2>&1

echo
if [[ $achados -eq 0 ]]; then
  echo "✓ o sistema sobe compilado, num banco virgem, sem nada de desenvolvimento."
  exit 0
fi
echo "✗ $achados achado(s). Não publique isto."
exit 1
