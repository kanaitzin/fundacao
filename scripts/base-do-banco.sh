#!/usr/bin/env bash
#
# A BASE DO BANCO (fase 220): a fotografia inteira do banco, de onde a
# restauração parte, e sobre a qual o arquivo contínuo (arquivar-wal.sh)
# reaplica minuto a minuto o que veio depois.
#
# Rode uma vez por semana pelo cron (ver §12.4.1). Sem base recente, a
# restauração ainda funciona, só que precisa reaplicar mais semanas de diário.
#
# O que faz:
#   1. pg_basebackup do banco inteiro, com o diário necessário para ela se
#      sustentar sozinha (-X fetch);
#   2. pg_verifybackup: confere cada arquivo contra o manifesto, antes de
#      considerar a base boa;
#   3. compacta, guarda a soma, e anota na saúde da implantação;
#   4. mantém as BASE_RETER bases mais novas (8, dois meses) e, só então,
#      tira do segundo disco os trechos do diário mais velhos que a base mais
#      antiga guardada: eles não servem a restauração nenhuma.
#
# Quem conecta precisa do atributo REPLICATION (ver §12.4.1).

set -euo pipefail

URL="${BASE_DATABASE_URL:-${DATABASE_URL:?defina DATABASE_URL ou BASE_DATABASE_URL}}"
DESTINO="${BASE_DIR:-/var/lib/rede-acolher/bases}"
WAL="${ARQUIVO_WAL_DIR:-/var/lib/rede-acolher/wal}"
RETER="${BASE_RETER:-8}"
CARIMBO="$(TZ=America/Sao_Paulo date +%Y-%m-%d-%H%M%S)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
B() { "${PGBIN:+$PGBIN/}$1" "${@:2}"; }

anotar() {
  [[ "${BACKUP_NAO_ANOTAR:-}" == "1" ]] && return 0
  B psql -X -q -c "SELECT app_anotar_implantacao('base', $1, jsonb_build_object('carimbo', '$CARIMBO', 'mb', ${2:-0}))" \
    "${DATABASE_URL:-$URL}" > /dev/null 2>&1 || echo "⚠ não consegui anotar a base no painel de saúde da implantação."
}
trap 'anotar false' ERR

mkdir -p "$DESTINO"
PASTA="$DESTINO/$CARIMBO"
echo "→ base do banco em $PASTA…"
B pg_basebackup -d "$URL" -D "$PASTA.tmp" -Fp -X fetch --checkpoint=fast --label "rede-acolher $CARIMBO"
echo "→ conferindo cada arquivo contra o manifesto…"
B pg_verifybackup -q "$PASTA.tmp"
mkdir -p "$PASTA"
cp "$PASTA.tmp/backup_label" "$PASTA/backup_label"
tar -czf "$PASTA/base.tar.gz" -C "$PASTA.tmp" .
rm -rf "$PASTA.tmp"
( cd "$PASTA" && sha256sum base.tar.gz > SOMA.txt )

# Retenção: as RETER mais novas ficam. O diário só sai do segundo disco
# depois, e só o que é mais velho que a base mais antiga que ficou.
mapfile -t BASES < <(ls -1d "$DESTINO"/20* 2>/dev/null | sort)
if (( ${#BASES[@]} > RETER )); then
  for velha in "${BASES[@]:0:${#BASES[@]}-RETER}"; do
    echo "→ retenção: a base $(basename "$velha") sai (ficam $RETER)"
    rm -rf "$velha"
  done
  MAIS_ANTIGA="$(ls -1d "$DESTINO"/20* | sort | head -1)"
  PRIMEIRO="$(sed -n 's/^START WAL LOCATION: .* (file \([0-9A-F]*\)).*/\1/p' "$MAIS_ANTIGA/backup_label")"
  if [[ -n "$PRIMEIRO" && -d "$WAL" ]]; then
    echo "→ o diário anterior a $PRIMEIRO sai do segundo disco"
    B pg_archivecleanup "$WAL" "$PRIMEIRO"
  fi
fi

trap - ERR
MB="$(du -sm "$PASTA" | cut -f1)"
anotar true "$MB"
echo "✓ base em $PASTA (${MB} MB), conferida"
