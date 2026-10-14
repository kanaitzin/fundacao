#!/usr/bin/env bash
#
# A CÓPIA CONTÍNUA DAS FOTOS E DOCUMENTOS (fase 220).
#
# O banco guarda QUE o documento existe, com a soma dele; o arquivo em si (a
# certidão, a foto, o laudo, o desenho do atendimento) mora em ARQUIVOS_DIR, e
# as cópias documentais em ARQUIVO_DRIVE_DIR. Este script copia os dois para
# o segundo disco, de cinco em cinco minutos pelo cron.
#
# Só ACRESCENTA: um arquivo guardado nunca muda depois de gravado (o nome é
# novo a cada envio), então nada no destino é apagado nem sobrescrito. Usa o
# rsync quando o servidor tem, e o cp sem sobrescrever quando não tem.
# Duas rodadas ao mesmo tempo esperam uma pela outra.

set -euo pipefail

DESTINO="${ARQUIVOS_COPIA_DIR:-/var/lib/rede-acolher/arquivos-copia}"
DOSSIE="${ARQUIVOS_DIR:-./.arquivos}"
ACERVO="${ARQUIVO_DRIVE_DIR:-/var/lib/rede-acolher/arquivo}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"

anotar() {
  [[ "${BACKUP_NAO_ANOTAR:-}" == "1" || -z "${DATABASE_URL:-}" ]] && return 0
  "${PGBIN:+$PGBIN/}psql" -X -q -c "SELECT app_anotar_implantacao('copia_arquivos', $1, jsonb_build_object('arquivos', ${2:-0}))" \
    "$DATABASE_URL" > /dev/null 2>&1 || echo "⚠ não consegui anotar a cópia no painel de saúde da implantação."
}
trap 'anotar false' ERR

mkdir -p "$DESTINO"
exec 9> "$DESTINO/.trava"
flock 9

TOTAL=0
for par in "dossie:$DOSSIE" "acervo:$ACERVO"; do
  nome="${par%%:*}"; origem="${par#*:}"
  [[ -d "$origem" ]] || continue
  mkdir -p "$DESTINO/$nome"
  # O arquivo que o servidor ainda está gravando tem nome provisório
  # (.<chave>.parcial, `gravarNoDisco`): ele fica para a próxima rodada, já com
  # o nome definitivo. Copiado pela metade, nunca mais seria atualizado.
  if command -v rsync > /dev/null; then
    rsync -a --ignore-existing --exclude='.*.parcial' "$origem/" "$DESTINO/$nome/"
  else
    while IFS= read -r -d '' f; do
      rel="${f#"$origem"/}"
      [[ -e "$DESTINO/$nome/$rel" ]] && continue
      mkdir -p "$(dirname "$DESTINO/$nome/$rel")"
      cp -a "$f" "$DESTINO/$nome/$rel"
    done < <(find "$origem" -type f ! -name '.*.parcial' -print0)
  fi
  sync "$DESTINO/$nome"
  # A conferência: todo arquivo da origem tem de estar no destino, do mesmo tamanho.
  while IFS= read -r -d '' f; do
    rel="${f#"$origem"/}"
    alvo="$DESTINO/$nome/$rel"
    if [[ ! -f "$alvo" || "$(stat -c %s "$f")" != "$(stat -c %s "$alvo")" ]]; then
      echo "copiar-arquivos: $nome/$rel não chegou inteiro ao destino" >&2
      exit 1
    fi
    TOTAL=$((TOTAL + 1))
  done < <(find "$origem" -type f ! -name '.*.parcial' -print0)
done

trap - ERR
anotar true "$TOTAL"
echo "✓ $TOTAL arquivos no segundo disco, conferidos"
