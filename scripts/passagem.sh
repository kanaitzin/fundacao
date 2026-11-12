#!/usr/bin/env bash
#
# A PASSAGEM DE TURNO ENTRE AS CONTAS — lê o que cada frente de trabalho deixou
# escrito, em TODOS os branches do repositório, e mostra a versão mais nova de
# cada nota.
#
# Existe porque o projeto é tocado por mais de uma conta do Claude, cada uma no
# seu branch, e o limite de uma acaba sem aviso. A nota de uma frente mora no
# branch dela; quem está em outro branch não a vê no disco. Este script busca os
# branches e lê a nota de dentro de cada um, sem trocar de branch e sem mexer em
# nenhum arquivo.
#
# Uso:
#   bash scripts/passagem.sh            # busca os branches e mostra as notas
#   bash scripts/passagem.sh --sem-rede # só o que já está na máquina
#   bash scripts/passagem.sh --curto    # só o cabeçalho de cada frente
#   bash scripts/passagem.sh --carimbo  # a data e a hora de agora, para a nota
#
# As regras estão em passagem/LEIA.md. Nada aqui grava, publica ou faz commit.

set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ" || exit 0

agora() { TZ=America/Sao_Paulo date +%Y-%m-%dT%H:%M%:z; }

REDE=1; CURTO=0
for a in "$@"; do
  case "$a" in
    --carimbo) agora; exit 0 ;;
    --sem-rede) REDE=0 ;;
    --curto) CURTO=1 ;;
  esac
done

# ------------------------------------------------------------------- os branches
#
# Clone raso (o da sessão na web) busca só a ponta de cada branch: a história
# inteira são centenas de megabytes por causa do protótipo. Clone inteiro busca
# normalmente, sem ficar raso por causa disto.
if [[ $REDE -eq 1 ]]; then
  RASO=()
  [[ "$(git rev-parse --is-shallow-repository 2>/dev/null)" == "true" ]] && RASO=(--depth=1)
  if ! timeout 90 git fetch --quiet "${RASO[@]}" origin \
        '+refs/heads/*:refs/remotes/origin/*' 2>/dev/null; then
    echo "(não deu para buscar os branches agora; mostrando o que já está na máquina)"
  fi
fi

AQUI="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"

# A data que a nota diz de si mesma. É ela que decide qual versão é a mais nova:
# num clone raso não há como perguntar ao git quando o arquivo mudou.
carimbo_de() { grep -m1 -o 'Atualizado em:\*\* *[0-9T:+-]*' | grep -o '[0-9][0-9T:+-]*$'; }

declare -A MELHOR_DATA MELHOR_ONDE

considerar() {            # nome-do-arquivo  data  onde
  local nome="$1" data="$2" onde="$3"
  [[ -z "$data" ]] && data="0000"
  if [[ -z "${MELHOR_DATA[$nome]:-}" || "$data" > "${MELHOR_DATA[$nome]}" ]]; then
    MELHOR_DATA[$nome]="$data"; MELHOR_ONDE[$nome]="$onde"
  fi
}

# As notas do disco (o que esta sessão ainda nem commitou conta também).
for f in passagem/*.md; do
  [[ -f "$f" ]] || continue
  n="$(basename "$f")"; [[ "$n" == "LEIA.md" ]] && continue
  considerar "$n" "$(carimbo_de < "$f")" "disco"
done

# As notas de dentro de cada branch do repositório.
while read -r ref; do
  [[ "$ref" == "origin/HEAD" || -z "$ref" ]] && continue
  while read -r f; do
    [[ -z "$f" ]] && continue
    n="$(basename "$f")"; [[ "$n" == "LEIA.md" ]] && continue
    considerar "$n" "$(git show "$ref:$f" 2>/dev/null | carimbo_de)" "$ref"
  done < <(git ls-tree --name-only "$ref" passagem/ 2>/dev/null | grep '\.md$')
done < <(git for-each-ref --format='%(refname:short)' refs/remotes/origin)

echo "═══════════════════════════════════════════════════════════════════════"
echo " PASSAGEM DE TURNO ENTRE AS CONTAS · $(agora) · você está em $AQUI"
echo "═══════════════════════════════════════════════════════════════════════"

if [[ ${#MELHOR_DATA[@]} -eq 0 ]]; then
  echo "Nenhuma nota de frente encontrada. As regras estão em passagem/LEIA.md."
fi

for n in $(printf '%s\n' "${!MELHOR_DATA[@]}" | sort); do
  onde="${MELHOR_ONDE[$n]}"
  echo
  echo "─── $n  (versão de: $onde) ───"
  if [[ "$onde" == "disco" ]]; then conteudo="$(cat "passagem/$n")"
  else conteudo="$(git show "$onde:passagem/$n" 2>/dev/null)"; fi
  if [[ $CURTO -eq 1 ]]; then
    grep -E '^# |^- \*\*(Atualizado em|Situação|Branch|Pedido)' <<<"$conteudo"
  else
    echo "$conteudo"
  fi
done

# ------------------------------------------------------- a ponta de cada branch
#
# A rede de segurança: a nota pode ter ficado velha (o limite acabou antes de a
# sessão escrever). O último commit de cada branch não mente sobre a data.
echo
echo "─── a ponta de cada branch (se for mais nova que a nota, a nota está atrasada) ───"
TZ=America/Sao_Paulo git for-each-ref --sort=-committerdate \
  --format='%(committerdate:format-local:%Y-%m-%dT%H:%M)  %(refname:short)%0a      %(subject)' \
  refs/remotes/origin 2>/dev/null | awk '/  origin(\/HEAD)?$/ { getline; next } { print }' | cut -c1-200

echo
echo "Regras em passagem/LEIA.md. A sua nota é passagem/<nome-do-seu-branch>.md:"
echo "atualize a cada commit, e não no fim, porque o limite acaba sem avisar."
