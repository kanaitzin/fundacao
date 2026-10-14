#!/usr/bin/env bash
#
# ARQUIVAR UM TRECHO DO BANCO (o `archive_command` do PostgreSQL, fase 220).
#
# O Postgres escreve tudo o que muda num diário (o WAL), em trechos de 16 MB.
# Com o arquivo contínuo ligado, ele chama este script para cada trecho
# fechado, e só apaga o trecho depois que este script responder 0. Se o
# script falhar, o Postgres guarda o trecho e tenta de novo: nada se perde,
# e a falha aparece na saúde da implantação.
#
# Uso (no postgresql.conf, ver scripts/postgresql-do-servidor.conf):
#   archive_command = '/opt/rede-acolher/scripts/arquivar-wal.sh %p %f'
#
# Três cuidados, porque cada um já derrubou backup de alguém:
#   * NUNCA sobrescreve um trecho que já está lá com conteúdo diferente: isso
#     seria dois servidores escrevendo no mesmo arquivo, e a restauração
#     misturaria os dois. Se o trecho já existe IGUAL, responde 0 (o
#     Postgres às vezes pede de novo o que já foi);
#   * copia para um nome provisório, força a ida ao disco e só então dá o nome
#     final: queda de energia no meio não deixa trecho pela metade com nome de
#     inteiro;
#   * o destino é OUTRO DISCO, nunca a mesma pasta do banco.

set -euo pipefail

ORIGEM="${1:?uso: arquivar-wal.sh %p %f}"
NOME="${2:?uso: arquivar-wal.sh %p %f}"
DESTINO="${ARQUIVO_WAL_DIR:-/var/lib/rede-acolher/wal}"

mkdir -p "$DESTINO"
FINAL="$DESTINO/$NOME"

if [[ -f "$FINAL" ]]; then
  if cmp -s "$ORIGEM" "$FINAL"; then exit 0; fi
  echo "arquivar-wal: $NOME já existe no destino com conteúdo diferente; recusado" >&2
  exit 1
fi

TEMP="$DESTINO/.$NOME.$$"
cp "$ORIGEM" "$TEMP"
sync "$TEMP"
mv "$TEMP" "$FINAL"
sync "$DESTINO"
