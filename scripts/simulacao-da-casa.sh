#!/usr/bin/env bash
#
# A SIMULAÇÃO DE UMA CASA QUE NASCE E VIVE 90 DIAS (fase 173).
#
# Roda `backend/scripts/simulacao-da-casa.ts` com o RELÓGIO ANDANDO: o banco e
# o servidor leem a data de um arquivo (`FAKETIME_TIMESTAMP_FILE`), e a
# simulação reescreve o arquivo a cada passo do dia. Assim cada ato acontece
# no dia e na hora em que aconteceria na casa, e o `app_hoje()` do banco anda
# junto com o `new Date()` do servidor (lição do relógio adiantado: os dois
# relógios andam juntos, ou nenhum anda).
#
# Como no `relogio-adiantado.sh`, o `postgres` sobe solto e quem diz que subiu
# é o `pg_isready` (o `pg_ctl` não retorna sob `faketime`). O banco é
# RECRIADO do zero no começo: a simulação precisa da semente limpa, e nada
# dela vai para produção. No fim, o relógio real volta ao banco.
#
# Uso:  bash scripts/simulacao-da-casa.sh [dias]      (padrão: 90)
#       SIM_INICIO="2026-11-16 07:00:00" para outro primeiro dia
#       SIM_CASAS=AI1,AI2,AI3,AI4,ARM1,ARM2,ARM3,ARM4 para as oito casas
#         viverem o mesmo período, com a instituição junto (fase 177)
#
set -uo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="${PGDATA:-/tmp/pgdata}"
PGRUN="${PGRUN:-/tmp/pgrun}"
PGPORT="${PGPORT:-5432}"
DIAS="${1:-90}"
INICIO="${SIM_INICIO:-2026-11-16 07:00:00}"
RELOGIO=/tmp/relogio-da-simulacao.txt
LIB=/usr/lib/x86_64-linux-gnu/faketime/libfaketimeMT.so.1
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[[ -z "$PGBIN" ]] && { echo "✗ PostgreSQL não instalado. Rode: bash scripts/preparar-ambiente.sh"; exit 1; }
[[ -f "$LIB" ]] || { echo "✗ libfaketime não encontrada em $LIB"; exit 1; }

parar_o_banco() {
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -m fast stop" >/dev/null 2>&1
  for _ in $(seq 1 20); do
    "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1 || return 0
    sleep 1
  done
  echo "✗ o banco não parou"; exit 1
}
subir_o_banco() {
  local comRelogio="${1:-}" cmd="$PGBIN/postgres -D $PGDATA -k $PGRUN -h 127.0.0.1 -p $PGPORT"
  [[ -n "$comRelogio" ]] && cmd="env LD_PRELOAD=$LIB FAKETIME_TIMESTAMP_FILE=$RELOGIO FAKETIME_NO_CACHE=1 $cmd"
  chown -R postgres "$PGDATA" "$PGRUN" 2>/dev/null || true
  nohup su postgres -c "$cmd" >/tmp/pg-simulacao.log 2>&1 &
  for i in $(seq 1 30); do
    "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "✗ o banco não subiu em 30s — veja /tmp/pg-simulacao.log"; exit 1
}
voltar_o_relogio() {
  echo "→ devolvendo o relógio real ao banco"
  parar_o_banco
  subir_o_banco ""
}
trap voltar_o_relogio EXIT

# SIM_SO_NAVEGADOR=1 repete só o ensaio de navegador sobre a casa já simulada,
# no último instante que a simulação deixou no relógio.
[[ "${SIM_SO_NAVEGADOR:-}" == 1 ]] || echo "@$INICIO" > "$RELOGIO"
chmod 666 "$RELOGIO"
echo "→ subindo o PostgreSQL com o relógio da simulação ($INICIO)"
parar_o_banco
subir_o_banco sim
echo "  banco: $(PGPASSWORD=dev-only-change-me psql -h 127.0.0.1 -p "$PGPORT" -U rede_admin -d rede_acolher -tAc "SELECT 'now()=' || now() || '  app_hoje()=' || app_hoje()" 2>/dev/null)"

eval "$(bash "$RAIZ/scripts/preparar-ambiente.sh" --exportar)"
cd "$RAIZ/backend"
if [[ "${SIM_SO_NAVEGADOR:-}" != 1 ]]; then
echo "→ recriando o banco com a semente fictícia"
LD_PRELOAD=$LIB FAKETIME_TIMESTAMP_FILE=$RELOGIO FAKETIME_NO_CACHE=1 \
  npx tsx -e "import('./test/setup/reset-db').then((m) => (m.default.default ?? m.default)())" >/tmp/simulacao-reset.log 2>&1 \
  || { echo "✗ não recriou o banco — veja /tmp/simulacao-reset.log"; exit 1; }
echo "→ $DIAS dias de casa"
LD_PRELOAD=$LIB FAKETIME_TIMESTAMP_FILE=$RELOGIO FAKETIME_NO_CACHE=1 SIM_RELOGIO=$RELOGIO \
  npx tsx scripts/simulacao-da-casa.ts "$DIAS" "$INICIO"
fi

# O ENSAIO DE NAVEGADOR CONTRA O SERVIDOR DE VERDADE, no último dia da casa: o
# servidor e o banco no relógio da simulação, o navegador com o mesmo instante.
[[ "${SIM_SEM_NAVEGADOR:-}" == 1 ]] && exit 0
SAIDA="${SIM_SAIDA:-/tmp/simulacao-da-casa}"
LD_PRELOAD=$LIB FAKETIME_TIMESTAMP_FILE=$RELOGIO FAKETIME_NO_CACHE=1 PORT=3000 \
  nohup npx tsx src/main.ts >/tmp/simulacao-servidor.log 2>&1 &
SERVIDOR=$!
(cd "$RAIZ/frontend" && nohup npx vite --port 5173 --strictPort >/tmp/simulacao-vite.log 2>&1) &
VITE=$!
for _ in $(seq 1 60); do
  curl -sf http://localhost:3000/api/v1/health >/dev/null 2>&1 && curl -sf http://localhost:5173 >/dev/null 2>&1 && break
  sleep 1
done
echo "→ as telas, pelo navegador, contra o servidor de verdade"
(cd "$RAIZ/frontend" && ENSAIO_CONTAS="$(cat "$SAIDA/contas.json")" ENSAIO_AGORA="$(cat "$SAIDA/agora.txt")" \
  ENSAIO_SAIDA="$SAIDA/telas" node ensaio-servidor.mjs)
kill $SERVIDOR $VITE 2>/dev/null; pkill -f "src/main.ts" 2>/dev/null; pkill -f "vite --port 5173" 2>/dev/null
