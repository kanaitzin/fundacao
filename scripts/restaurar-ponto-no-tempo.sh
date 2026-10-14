#!/usr/bin/env bash
#
# RESTAURAR O BANCO ATÉ UM MINUTO EXATO (fase 220).
#
#   bash scripts/restaurar-ponto-no-tempo.sh <pasta-da-base> <pasta-nova-do-banco> ["AAAA-MM-DD HH:MM:SS"]
#
# Parte da base (base-do-banco.sh) e reaplica o diário guardado no segundo
# disco (arquivar-wal.sh). Sem a hora, vai até o último trecho guardado: é o
# caso do disco que queimou. Com a hora (de Porto Alegre), para nela: é o caso
# de algo apagado ou estragado por engano às 15h12, em que se restaura até
# 15h11 numa pasta à parte e se confere antes de trocar.
#
# NUNCA escreve por cima de um banco: a pasta de destino tem de não existir,
# ou estar vazia. Depois, sobe-se o Postgres apontando para ela.

set -euo pipefail

BASE="${1:?uso: restaurar-ponto-no-tempo.sh <pasta-da-base> <pasta-nova-do-banco> [quando]}"
DESTINO="${2:?uso: restaurar-ponto-no-tempo.sh <pasta-da-base> <pasta-nova-do-banco> [quando]}"
QUANDO="${3:-}"
WAL="${ARQUIVO_WAL_DIR:-/var/lib/rede-acolher/wal}"

[[ -f "$BASE/base.tar.gz" ]] || { echo "Não há base.tar.gz em $BASE." >&2; exit 1; }
if [[ -d "$DESTINO" && -n "$(ls -A "$DESTINO")" ]]; then
  echo "A pasta $DESTINO não está vazia. A restauração não escreve por cima de banco nenhum." >&2
  exit 1
fi
( cd "$BASE" && sha256sum -c --quiet SOMA.txt ) || { echo "A base não confere com a soma guardada." >&2; exit 1; }

mkdir -p "$DESTINO"
tar -xzf "$BASE/base.tar.gz" -C "$DESTINO"
{
  echo "restore_command = 'cp \"$WAL/%f\" \"%p\"'"
  if [[ -n "$QUANDO" ]]; then
    echo "recovery_target_time = '$QUANDO America/Sao_Paulo'"
    echo "recovery_target_inclusive = true"
  fi
  echo "recovery_target_action = 'promote'"
  # A cópia restaurada não arquiva de novo no mesmo segundo disco: ela é outra
  # história a partir daqui, e não pode escrever por cima do diário original.
  echo "archive_mode = off"
} >> "$DESTINO/postgresql.auto.conf"
# No Ubuntu, a configuração do servidor mora em /etc e não vem na base: sem
# ela o Postgres não abre a pasta. O mínimo para subir e conferir.
[[ -f "$DESTINO/postgresql.conf" ]] || echo "listen_addresses = 'localhost'" > "$DESTINO/postgresql.conf"
[[ -f "$DESTINO/pg_hba.conf" ]] || printf 'local all all peer\nhost all all 127.0.0.1/32 scram-sha-256\n' > "$DESTINO/pg_hba.conf"
touch "$DESTINO/recovery.signal"
chmod 700 "$DESTINO"
if [[ "$(id -u)" == "0" ]]; then chown -R postgres:postgres "$DESTINO"; fi

echo "✓ pronto em $DESTINO${QUANDO:+, parando em $QUANDO (Porto Alegre)}."
echo "  Suba o Postgres apontando para esta pasta; ele reaplica o diário e abre."
echo "  Confira os dados antes de trocar o banco do sistema por este."
