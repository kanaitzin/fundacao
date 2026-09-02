#!/usr/bin/env bash
#
# RESTAURAR — e, sobretudo, PROVAR que a restauração funciona.
#
# Dois modos:
#
#   bash scripts/restaurar.sh <pasta-do-backup> <URL-do-banco-destino>
#       restaura de verdade, num banco que você indica.
#
#   bash scripts/restaurar.sh --ensaio
#       o ciclo inteiro num banco descartável: faz o backup, derruba, restaura,
#       e CONFERE. Não toca no banco de trabalho. É este modo que transforma
#       "temos backup" em "sabemos restaurar".
#
# O que o ensaio confere, e por que cada coisa:
#   * as contagens das tabelas que importam batem com a origem — restauração
#     que perde linha em silêncio é pior do que restauração que falha;
#   * a auditoria voltou inteira. Ela é append-only por gatilho, e um dump que
#     a perdesse levaria junto a resposta de quem fez o quê;
#   * **o cofre ABRE com a chave do ambiente.** É a única parte do sistema em
#     que restaurar os bytes não basta: sem a `CREDENTIAL_KEY` certa, as
#     credenciais dos acolhidos voltam como lixo autenticado, e o AES-GCM
#     recusa em vez de devolver texto errado. Descobrir isso no dia do
#     desastre é descobrir tarde.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
RESTORE="${PGBIN:+$PGBIN/}pg_restore"
PSQL="${PGBIN:+$PGBIN/}psql"

# As tabelas que, se voltarem incompletas, tornam o sistema inútil sem parecer
# quebrado. A lista é conferida contra o banco: nome de tabela que não existe
# mais faz a conferência responder "erro" nos dois lados, e dois erros iguais
# se leem como acordo. Foi assim que a primeira versão desta lista "passou"
# com `shift_handover` e `medication_dose`, que nunca existiram.
TABELAS_QUE_IMPORTAM=(
  person house_stay ata handover handover_receipt
  incident medication_administration person_credential audit_event
)

conta() {  # conta <url> <tabela>
  "$PSQL" -tAX -c "SELECT count(*) FROM $2" "$1" 2>/dev/null || echo "erro"
}

# --------------------------------------------------------------- modo ensaio
if [[ "${1:-}" == "--ensaio" ]]; then
  ORIGEM="${DATABASE_URL:?defina DATABASE_URL}"
  DESTINO_DB="rede_acolher_ensaio_restauracao"
  ADMIN="${ORIGEM%/*}/postgres"
  PASTA="$(mktemp -d)/backup"

  echo "ENSAIO DE RESTAURAÇÃO"
  echo "origem:  $ORIGEM"
  echo "destino: $DESTINO_DB (descartável)"
  echo

  echo "→ backup…"
  BACKUP_DIR="$PASTA" bash "$RAIZ/scripts/backup.sh" "$PASTA" > /dev/null
  DUMP="$(ls -d "$PASTA"/*/ | tail -1)banco.dump"
  [[ -f "$DUMP" ]] || { echo "✗ o backup não produziu banco.dump"; exit 1; }

  echo "→ banco descartável…"
  "$PSQL" -X -c "DROP DATABASE IF EXISTS $DESTINO_DB" "$ADMIN" > /dev/null
  "$PSQL" -X -c "CREATE DATABASE $DESTINO_DB" "$ADMIN" > /dev/null
  DESTINO="${ORIGEM%/*}/$DESTINO_DB"

  echo "→ restaurando…"
  # `--no-owner`: o destino tem os papéis dele. Sem isto a restauração falha
  # em outra máquina, que é justamente onde ela precisa funcionar.
  "$RESTORE" --no-owner --no-privileges --dbname="$DESTINO" "$DUMP" 2>&1 \
    | grep -v "^pg_restore: warning" || true

  echo
  echo "→ conferindo…"
  falhas=0
  for t in "${TABELAS_QUE_IMPORTAM[@]}"; do
    a="$(conta "$ORIGEM" "$t")"; b="$(conta "$DESTINO" "$t")"
    if [[ "$a" == "erro" ]]; then
      # Tabela que não existe na ORIGEM é erro desta lista, não do backup — e
      # precisa gritar, porque calada ela vira uma conferência a menos.
      printf '  ✗ %-24s não existe no banco de origem (a lista envelheceu)\n' "$t"
      falhas=$((falhas + 1))
    elif [[ "$a" == "$b" ]]; then
      printf '  ✓ %-24s %s linha(s)\n' "$t" "$a"
    else
      printf '  ✗ %-24s origem=%s destino=%s\n' "$t" "$a" "$b"; falhas=$((falhas + 1))
    fi
  done

  # O cofre: restaurar os bytes não basta.
  echo
  echo "→ o cofre abre com a chave deste ambiente?"
  cifrados="$("$PSQL" -tAX -c \
    "SELECT count(*) FROM person_credential WHERE secret_enc IS NOT NULL" \
    "$DESTINO" 2>/dev/null || echo 0)"
  if [[ "${cifrados:-0}" -eq 0 ]]; then
    echo "  · nenhuma credencial cifrada neste banco — nada a conferir aqui."
    echo "    (num banco com cofre em uso, esta é a conferência que mais importa)"
  else
    if DATABASE_URL="$DESTINO" node "$RAIZ/scripts/conferir-cofre.mjs"; then
      echo "  ✓ as $cifrados credencial(is) restauradas abrem com a CREDENTIAL_KEY atual"
    else
      echo "  ✗ o cofre NÃO abre: a chave deste ambiente não é a que cifrou estes dados."
      falhas=$((falhas + 1))
    fi
  fi

  echo
  "$PSQL" -X -c "DROP DATABASE IF EXISTS $DESTINO_DB" "$ADMIN" > /dev/null
  rm -rf "$PASTA"
  if [[ $falhas -eq 0 ]]; then
    echo "✓ ciclo completo: backup → restauração → conferência, sem perda."
    exit 0
  fi
  echo "✗ $falhas conferência(s) falharam. Este backup NÃO restaura o sistema."
  exit 1
fi

# ------------------------------------------------------------ modo de verdade
PASTA="${1:?uso: restaurar.sh <pasta-do-backup> <URL-do-banco-destino> | --ensaio}"
DESTINO="${2:?informe a URL do banco de DESTINO}"

[[ -f "$PASTA/banco.dump" ]] || { echo "✗ não encontrei $PASTA/banco.dump"; exit 1; }

echo "Restaurar $PASTA  →  $DESTINO"
echo
echo "Isto SOBRESCREVE o banco de destino. Se ele estiver em uso, o que está"
echo "lá dentro some — e o Rede Acolher não apaga nada em silêncio nem aqui."
read -r -p "Escreva o nome do banco de destino para confirmar: " confirma
[[ "$confirma" == "${DESTINO##*/}" ]] || { echo "cancelado."; exit 1; }

if [[ -f "$PASTA/SOMAS.txt" ]]; then
  echo "→ conferindo as somas…"
  ( cd "$PASTA" && sha256sum -c SOMAS.txt --ignore-missing ) || {
    echo "✗ o conteúdo não bate com o que foi salvo. Não restaure este backup."; exit 1; }
fi

echo "→ restaurando o banco…"
"$RESTORE" --no-owner --no-privileges --clean --if-exists --dbname="$DESTINO" "$PASTA/banco.dump"

for par in "dossie:${ARQUIVOS_DIR:-./.arquivos}" "acervo:${ARQUIVO_DRIVE_DIR:-/var/lib/rede-acolher/arquivo}"; do
  nome="${par%%:*}"; caminho="${par#*:}"
  if [[ -f "$PASTA/$nome.tar.gz" ]]; then
    echo "→ $nome → $caminho…"
    mkdir -p "$(dirname "$caminho")"
    tar -xzf "$PASTA/$nome.tar.gz" -C "$(dirname "$caminho")"
  fi
done

echo
echo "✓ restaurado."
echo
echo "FALTA UMA COISA, e ela não está neste backup: a CREDENTIAL_KEY."
echo "Sem a MESMA chave que cifrou estes dados, o cofre de credenciais volta"
echo "ilegível. Confira antes de dizer que o sistema está no ar:"
echo "  DATABASE_URL=$DESTINO node scripts/conferir-cofre.mjs"
