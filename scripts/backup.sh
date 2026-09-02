#!/usr/bin/env bash
#
# BACKUP — o banco e os DOIS acervos que vivem fora dele.
#
# O que este script salva:
#   1. o banco inteiro, em formato `custom` (comprimido, restaurável seletivamente);
#   2. `ARQUIVOS_DIR` — os objetos do dossiê do acolhido: certidão, foto, laudo;
#   3. `ARQUIVO_DRIVE_DIR` — as cópias documentais arquivadas.
#
# O que ele NÃO salva, e é de propósito:
#   * a `CREDENTIAL_KEY`. Ela cifra as credenciais de acesso dos acolhidos
#     (gov.br, INSS, banco). Guardada junto do backup, deixa o cofre aberto
#     para quem encontrar a cópia; sem ela, o backup devolve bytes ilegíveis.
#     A chave vive em outro lugar, com outro dono, e é responsabilidade da
#     Fundação. Este script LEMBRA disso toda vez, e não faz por conta.
#
# Uso:
#   bash scripts/backup.sh [destino]
#
# Um backup que nunca foi restaurado não é backup: é uma esperança guardada em
# disco. Rode `scripts/restaurar.sh --ensaio` de vez em quando.

set -euo pipefail

DESTINO="${1:-${BACKUP_DIR:-/var/backups/rede-acolher}}"
BANCO="${DATABASE_URL:?defina DATABASE_URL}"
DOSSIE="${ARQUIVOS_DIR:-./.arquivos}"
ACERVO="${ARQUIVO_DRIVE_DIR:-/var/lib/rede-acolher/arquivo}"
RETER_DIAS="${BACKUP_RETER_DIAS:-30}"

# O carimbo é a hora de Porto Alegre, e não a do servidor: quem procura o
# backup "de antes da reunião de terça" pensa na hora da casa.
CARIMBO="$(TZ=America/Sao_Paulo date +%Y-%m-%d-%H%M)"
PASTA="$DESTINO/$CARIMBO"

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
DUMP="${PGBIN:+$PGBIN/}pg_dump"

mkdir -p "$PASTA"
echo "→ banco…"
# --no-owner e --no-privileges: a restauração recria os papéis pelo `.env` do
# destino. Amarrar o dump aos donos do servidor de origem faz a restauração
# falhar exatamente quando ela é necessária: em OUTRA máquina.
"$DUMP" --format=custom --no-owner --no-privileges --file="$PASTA/banco.dump" "$BANCO"

for par in "dossie:$DOSSIE" "acervo:$ACERVO"; do
  nome="${par%%:*}"; caminho="${par#*:}"
  if [[ -d "$caminho" ]]; then
    echo "→ $nome ($caminho)…"
    tar -czf "$PASTA/$nome.tar.gz" -C "$(dirname "$caminho")" "$(basename "$caminho")"
  else
    # Diretório ausente é AVISO, e não silêncio: o banco continuaria dizendo
    # que o arquivo existe, e a falta só apareceria na restauração.
    echo "⚠ $nome não encontrado em $caminho — nada salvo deste acervo."
  fi
done

# A soma existe para responder "este arquivo é o mesmo que saiu de lá?" — a
# mesma pergunta que a cópia documental faz ao Drive.
( cd "$PASTA" && sha256sum ./* > SOMAS.txt )

cat > "$PASTA/LEIA-ME.txt" <<FIM
Backup do Rede Acolher — $CARIMBO (hora de Porto Alegre)

Conteúdo:
  banco.dump      o banco inteiro (pg_restore --format=custom)
  dossie.tar.gz   objetos do dossiê do acolhido
  acervo.tar.gz   cópias documentais arquivadas
  SOMAS.txt       sha256 de cada arquivo acima

O QUE NÃO ESTÁ AQUI, E SEM O QUE ESTE BACKUP NÃO SE RESTAURA INTEIRO:

  CREDENTIAL_KEY — a chave que cifra as credenciais de acesso dos acolhidos.
  Sem ela, o cofre volta como bytes ilegíveis. Com ela guardada JUNTO desta
  pasta, o cofre volta ABERTO para quem encontrar a cópia.
  Ela vive em outro lugar, com outro dono.

Restaurar: bash scripts/restaurar.sh $PASTA <URL-do-banco-destino>
FIM

echo "→ retenção: apagando o que passou de $RETER_DIAS dias…"
find "$DESTINO" -maxdepth 1 -type d -name '20*' -mtime "+$RETER_DIAS" -exec rm -rf {} + 2>/dev/null || true

echo
echo "✓ backup em $PASTA"
du -sh "$PASTA"
echo
echo "LEMBRETE: a CREDENTIAL_KEY não está aqui, e sem ela o cofre não volta."
echo "Um backup que nunca foi restaurado não é backup."
