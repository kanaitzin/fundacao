#!/usr/bin/env bash
#
# RELÓGIO ADIANTADO — roda a suíte na única condição em que as datas calculadas
# em UTC aparecem: depois das 21h de Porto Alegre, quando o UTC já virou o dia
# e a instituição não.
#
# Existe porque a receita escrita à mão erra de três maneiras, e as três falham
# sem dizer o que houve:
#
#   1. **O deslocamento não pode ser um número fixo.** `+7h` só cai na janela
#      se o relógio da máquina estiver no ponto em que alguém o escreveu. Às
#      19h de Porto Alegre, `+7h` leva a 02h da manhã seguinte — UTC e Porto
#      Alegre na MESMA data, e a condição não é exercitada. A suíte fica verde
#      dizendo que passou onde nunca esteve. Aqui o deslocamento é CALCULADO
#      para cair às 22h30 de Porto Alegre, e o script recusa qualquer
#      deslocamento em que as duas datas coincidam.
#
#   2. **O `pg_ctl` não retorna sob `faketime`, nem com `-W`.** Ele fica
#      pendurado esperando um arranque que já aconteceu — medido: cinco
#      minutos e contando, com o banco aceitando conexões havia segundos. Por
#      isso aqui não se usa `pg_ctl` para subir: sobe-se o `postgres` direto,
#      solto, e quem diz que subiu é o `pg_isready`.
#
#   3. **Os dois relógios andam juntos, ou nenhum anda.** Adiantar só o Node
#      esconde o defeito: o `app_hoje()` é do BANCO. O mesmo deslocamento vai
#      no `postgres` e no `jest`.
#
# A suíte roda com `--runInBand` porque há um banco só e um schema `public` só:
# em paralelo as suítes se contaminam. Isso não é do relógio — é sempre.
#
# Uso:
#   bash scripts/relogio-adiantado.sh --rodar     # sobe, roda a suíte, devolve o relógio
#   bash scripts/relogio-adiantado.sh             # só sobe o banco adiantado
#   bash scripts/relogio-adiantado.sh --voltar    # devolve o relógio real
#
# Nada aqui toca em dado real, e nada aqui publica coisa alguma.

set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="${PGDATA:-/tmp/pgdata}"
PGRUN="${PGRUN:-/tmp/pgrun}"
PGPORT="${PGPORT:-5432}"
FUSO="America/Sao_Paulo"
HORA_ALVO="${HORA_ALVO:-22:30}"   # em Porto Alegre; qualquer coisa entre 21h e 23h59 serve

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [[ -z "$PGBIN" ]]; then
  echo "✗ PostgreSQL não instalado. Rode antes: bash scripts/preparar-ambiente.sh"
  exit 1
fi

# --------------------------------------------------------------------- parar
parar_o_banco() {
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -m fast stop" >/dev/null 2>&1
  for _ in $(seq 1 20); do
    "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1 || return 0
    sleep 1
  done
  echo "✗ o banco não parou; não vou subir outro em cima"
  exit 1
}

# Sobe o postgres com o deslocamento pedido (vazio = relógio real) e espera o
# pg_isready, nunca o pg_ctl.
subir_o_banco() {
  local d="${1:-}" log="${2:-/tmp/pg.log}" cmd
  cmd="$PGBIN/postgres -D $PGDATA -k $PGRUN -h 127.0.0.1 -p $PGPORT"
  [[ -n "$d" ]] && cmd="faketime -f '$d' $cmd"
  chown -R postgres "$PGDATA" "$PGRUN" 2>/dev/null || true
  nohup su postgres -c "$cmd" >"$log" 2>&1 &
  for i in $(seq 1 30); do
    "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1 && { echo "  ✓ pg_isready em ${i}s"; return 0; }
    sleep 1
  done
  echo "  ✗ o banco não subiu em 30s — veja $log"
  exit 1
}

voltar_o_relogio() {
  echo "→ devolvendo o relógio real ao banco"
  parar_o_banco
  subir_o_banco "" /tmp/pg.log
  echo "  banco: $(PGPASSWORD=dev-only-change-me psql -h 127.0.0.1 -p "$PGPORT" -U rede_admin -d rede_acolher -tAc 'SELECT now()' 2>/dev/null)"
}

if [[ "${1:-}" == "--voltar" ]]; then
  voltar_o_relogio
  exit 0
fi

# ------------------------------------------------------- calcular a janela
#
# Quanto falta, em segundos, das horas de agora em Porto Alegre até a HORA_ALVO
# (atravessando a meia-noite se preciso).
agora_min=$(( 10#$(TZ="$FUSO" date '+%H') * 60 + 10#$(TZ="$FUSO" date '+%M') ))
alvo_min=$(( 10#${HORA_ALVO%%:*} * 60 + 10#${HORA_ALVO##*:} ))
delta=$(( alvo_min - agora_min )); (( delta < 0 )) && delta=$(( delta + 1440 ))
DESLOC="+$(( delta * 60 ))s"

echo "→ deslocamento calculado: $DESLOC  (agora são $(TZ="$FUSO" date '+%H:%M') em Porto Alegre)"
echo "  UTC          : $(faketime -f "$DESLOC" date -u '+%F %T')"
echo "  Porto Alegre : $(TZ="$FUSO" faketime -f "$DESLOC" date '+%F %T')"

data_utc=$(faketime -f "$DESLOC" date -u '+%F')
data_poa=$(TZ="$FUSO" faketime -f "$DESLOC" date '+%F')
if [[ "$data_utc" == "$data_poa" ]]; then
  echo "  ✗ as duas datas coincidem — esta janela NÃO exercita a virada do UTC."
  echo "    Ajuste HORA_ALVO para algo entre 21:00 e 23:59."
  exit 1
fi
echo "  ✓ datas diferentes ($data_utc no UTC, $data_poa na instituição) — é esta a condição"

echo "→ subindo o PostgreSQL sob $DESLOC"
parar_o_banco
subir_o_banco "$DESLOC" /tmp/pg-faketime.log
echo "  banco: $(PGPASSWORD=dev-only-change-me psql -h 127.0.0.1 -p "$PGPORT" -U rede_admin -d rede_acolher -tAc "SELECT 'now()=' || now() || '  app_hoje()=' || app_hoje()" 2>/dev/null)"

if [[ "${1:-}" != "--rodar" ]]; then
  cat <<FIM

O banco está adiantado. Rode a suíte com o MESMO deslocamento:

  cd backend && faketime -f '$DESLOC' npx jest --runInBand

E depois devolva o relógio:

  bash scripts/relogio-adiantado.sh --voltar
FIM
  exit 0
fi

echo "→ suíte sob $DESLOC, em série"
eval "$(bash "$RAIZ/scripts/preparar-ambiente.sh" --exportar)"
( cd "$RAIZ/backend" && faketime -f "$DESLOC" npx jest --runInBand )
saida=$?

voltar_o_relogio
exit $saida
