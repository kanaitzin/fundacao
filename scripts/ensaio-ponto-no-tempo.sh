#!/usr/bin/env bash
#
# O ENSAIO DE NADA SE PERDER (fase 220): prova, num banco descartável, o que
# o servidor do Pão vai fazer de verdade.
#
#   1. sobe um Postgres novo, com somas de página e o arquivo contínuo ligado
#      (arquivar-wal.sh), como manda o postgresql-do-servidor.conf;
#   2. grava, tira a base (base-do-banco.sh), grava de novo, marca um minuto,
#      grava mais um pouco;
#   3. DESTRÓI a pasta do banco, como um disco que queima;
#   4. restaura até o minuto marcado e confere que voltou exatamente o que
#      havia até ali; restaura até o fim e confere que voltou tudo;
#   5. confere que o arquivar-wal.sh recusa sobrescrever um trecho com
#      conteúdo diferente, e que a cópia das fotos (copiar-arquivos.sh) só
#      acrescenta e confere.
#
# Não toca no banco de trabalho: porta própria, pasta própria em /tmp.
# Sai com código 1 se qualquer coisa não bater.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
T="${ENSAIO_DIR:-/tmp/ensaio-ponto-no-tempo}"
PORTA=5499
FALHAS=0
ok()   { echo "  ✓ $1"; }
erro() { echo "  ✗ $1"; FALHAS=$((FALHAS + 1)); }
comoPg() { if [[ "$(id -u)" == "0" ]]; then su postgres -c "$*"; else bash -c "$*"; fi; }
sql() { "$PGBIN/psql" -X -q -At -h "$T" -p "$1" -U postgres -d postgres -c "$2"; }
parar() { comoPg "$PGBIN/pg_ctl -D $1 -m fast stop" > /dev/null 2>&1 || true; }

trap 'parar "$T/dados"; parar "$T/volta-1"; parar "$T/volta-2"' EXIT
parar "$T/dados"; parar "$T/volta-1"; parar "$T/volta-2"
rm -rf "$T"; mkdir -p "$T/wal" "$T/bases"
[[ "$(id -u)" == "0" ]] && chown -R postgres:postgres "$T"

echo "→ um banco novo, com somas de página e o arquivo contínuo"
comoPg "$PGBIN/initdb --data-checksums -D $T/dados -U postgres --auth=trust" > /dev/null
cat >> "$T/dados/postgresql.conf" <<CONF
port = $PORTA
listen_addresses = ''
unix_socket_directories = '$T'
wal_level = replica
archive_mode = on
archive_command = 'ARQUIVO_WAL_DIR=$T/wal $RAIZ/scripts/arquivar-wal.sh %p %f'
archive_timeout = 60
CONF
comoPg "$PGBIN/pg_ctl -D $T/dados -l $T/dados.log -w start" > /dev/null
[[ "$(sql $PORTA 'SHOW data_checksums')" == "on" ]] && ok "somas de página ligadas" || erro "somas de página desligadas"

sql $PORTA "CREATE TABLE prova (n int PRIMARY KEY, fase text)"
sql $PORTA "INSERT INTO prova SELECT g, 'antes da base' FROM generate_series(1, 100) g"

echo "→ a base do banco"
BASE_DATABASE_URL="postgres://postgres@/postgres?host=$T&port=$PORTA" BASE_DIR="$T/bases" \
  ARQUIVO_WAL_DIR="$T/wal" BACKUP_NAO_ANOTAR=1 PGBIN="$PGBIN" bash "$RAIZ/scripts/base-do-banco.sh" > "$T/base.log" 2>&1 \
  && ok "base tirada e conferida contra o manifesto" || { erro "a base falhou ($(tail -2 "$T/base.log"))"; exit 1; }
BASE="$(ls -1d "$T"/bases/20* | tail -1)"

sql $PORTA "INSERT INTO prova SELECT g, 'depois da base' FROM generate_series(101, 200) g"
sleep 1.2
MARCO="$(sql $PORTA "SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS.US')")"
sleep 1.2
sql $PORTA "INSERT INTO prova SELECT g, 'depois do marco' FROM generate_series(201, 300) g"
ULTIMO="$(sql $PORTA "SELECT pg_walfile_name(pg_switch_wal())")"
for _ in $(seq 1 30); do
  [[ -f "$T/wal/$ULTIMO" ]] && break; sleep 0.5
done
[[ -f "$T/wal/$ULTIMO" ]] && ok "o último trecho do diário chegou ao segundo disco" || erro "o último trecho não foi arquivado"
[[ "$(sql $PORTA 'SELECT failed_count FROM pg_stat_archiver')" == "0" ]] && ok "nenhuma falha de arquivamento" || erro "o arquivamento falhou"

echo "→ o disco queimou"
parar "$T/dados"
rm -rf "$T/dados"

volta() { # pasta porta [quando]
  ARQUIVO_WAL_DIR="$T/wal" bash "$RAIZ/scripts/restaurar-ponto-no-tempo.sh" "$BASE" "$T/$1" "${3:-}" > "$T/$1.restaurar.log"
  cat >> "$T/$1/postgresql.conf" <<CONF
port = $2
listen_addresses = ''
unix_socket_directories = '$T'
CONF
  comoPg "$PGBIN/pg_ctl -D $T/$1 -l $T/$1.log -w -t 120 start" > /dev/null
  for _ in $(seq 1 60); do
    [[ "$(sql "$2" 'SELECT pg_is_in_recovery()' 2>/dev/null)" == "f" ]] && break; sleep 0.5
  done
}

echo "→ de volta até o minuto marcado ($MARCO)"
volta volta-1 5498 "$MARCO"
R1="$(sql 5498 "SELECT count(*) || '/' || coalesce(max(n), 0) FROM prova")"
[[ "$R1" == "200/200" ]] && ok "voltou exatamente o que havia até o minuto: 200 linhas" \
  || erro "até o minuto devia voltar 200/200, voltou $R1"
parar "$T/volta-1"

echo "→ de volta até o último trecho guardado"
volta volta-2 5497
R2="$(sql 5497 "SELECT count(*) || '/' || count(*) FILTER (WHERE fase = 'depois do marco') FROM prova")"
[[ "$R2" == "300/100" ]] && ok "voltou tudo: 300 linhas, as 100 depois do marco incluídas" \
  || erro "até o fim devia voltar 300/100, voltou $R2"
[[ "$(sql 5497 'SHOW data_checksums')" == "on" ]] && ok "a cópia restaurada continua com somas de página" || erro "a cópia perdeu as somas"
parar "$T/volta-2"

echo "→ o arquivamento não sobrescreve"
echo "um conteúdo" > "$T/trecho-a"; echo "outro conteúdo" > "$T/trecho-b"
ARQUIVO_WAL_DIR="$T/wal-teste" bash "$RAIZ/scripts/arquivar-wal.sh" "$T/trecho-a" 000000010000000000000099
ARQUIVO_WAL_DIR="$T/wal-teste" bash "$RAIZ/scripts/arquivar-wal.sh" "$T/trecho-a" 000000010000000000000099 \
  && ok "o mesmo trecho pedido de novo é aceito" || erro "o mesmo trecho de novo foi recusado"
if ARQUIVO_WAL_DIR="$T/wal-teste" bash "$RAIZ/scripts/arquivar-wal.sh" "$T/trecho-b" 000000010000000000000099 2> /dev/null; then
  erro "um trecho diferente com o mesmo nome foi aceito"
else
  ok "um trecho diferente com o mesmo nome é recusado"
fi

echo "→ a cópia das fotos e documentos"
mkdir -p "$T/fotos" "$T/acervo"
echo "foto 1" > "$T/fotos/a1"; echo "foto 2" > "$T/fotos/a2"
ARQUIVOS_DIR="$T/fotos" ARQUIVO_DRIVE_DIR="$T/acervo" ARQUIVOS_COPIA_DIR="$T/copia" BACKUP_NAO_ANOTAR=1 \
  bash "$RAIZ/scripts/copiar-arquivos.sh" > /dev/null
echo "foto 3" > "$T/fotos/a3"
echo "meia fo" > "$T/fotos/.a4.parcial"
ARQUIVOS_DIR="$T/fotos" ARQUIVO_DRIVE_DIR="$T/acervo" ARQUIVOS_COPIA_DIR="$T/copia" BACKUP_NAO_ANOTAR=1 \
  bash "$RAIZ/scripts/copiar-arquivos.sh" > /dev/null
[[ "$(ls "$T/copia/dossie" | wc -l)" == "3" ]] && ok "as três fotos estão no segundo disco" || erro "faltou foto no segundo disco"
[[ ! -e "$T/copia/dossie/.a4.parcial" ]] && ok "a foto ainda sendo gravada fica para a próxima rodada" || erro "a cópia levou uma foto pela metade"
rm "$T/fotos/a1"
ARQUIVOS_DIR="$T/fotos" ARQUIVO_DRIVE_DIR="$T/acervo" ARQUIVOS_COPIA_DIR="$T/copia" BACKUP_NAO_ANOTAR=1 \
  bash "$RAIZ/scripts/copiar-arquivos.sh" > /dev/null
[[ -f "$T/copia/dossie/a1" ]] && ok "a foto que sumiu da origem continua no segundo disco" || erro "a cópia apagou o que sumiu da origem"

echo
if (( FALHAS )); then echo "✗ $FALHAS conferência(s) falharam. Logs em $T."; exit 1; fi
echo "✓ Nada se perdeu: o banco voltou até o minuto e até o fim, e as fotos estão no segundo disco."
