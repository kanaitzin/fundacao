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
#   * **o papel da aplicação lê e escreve o que lia e escrevia, e só isso**
#     (fase 290). Contar linhas como dono não diz nada: o dono enxerga tudo. As
#     permissões do rede_app e de PUBLIC (tabelas, colunas, funções, sequências,
#     esquema) são comparadas uma a uma com a origem, e o rede_app lê as casas
#     com a identidade de um Gestor Geral. Até a 289 o backup voltava sem
#     nenhuma, e o ensaio passava;
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

# O que protege o banco (fase 290): as permissões do rede_app e de PUBLIC, o RLS, as
# políticas e o dono das funções SECURITY DEFINER, uma linha por item. A consulta
# mora em scripts/o-que-protege-o-banco.sql, e o backup grava a da origem ao lado
# do dump (PERMISSOES.txt), para a restauração de verdade também comparar.
permissoes() {  # permissoes <url>
  "$PSQL" -tAX -f "$RAIZ/scripts/o-que-protege-o-banco.sql" "$1" 2>/dev/null || true
}

# A URL sem a senha, para a tela e o log (fase 290).
sem_senha() { sed -E 's#(://[^:/@]+):[^@]*@#\1:***@#' <<< "$1"; }

# O papel da aplicação continua sujeito ao RLS? (fase 290, revisão do banco). O papel
# é do servidor e não vem no dump: um rede_app superusuário, com BYPASSRLS, dono de
# tabela ou herdeiro do dono passaria pela comparação e leria tudo. Devolve 1 se não.
papel_da_aplicacao() {  # papel_da_aplicacao <url>
  local r
  r="$("$PSQL" -tAX -c "
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rede_app') THEN 'o papel rede_app não existe'
      WHEN (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = 'rede_app')
        THEN 'o rede_app é superusuário ou passa por cima do RLS (BYPASSRLS)'
      WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public'
                     AND (tableowner = 'rede_app' OR pg_has_role('rede_app', tableowner, 'USAGE')))
        THEN 'o rede_app é dono de tabela, ou herda o dono: o RLS não vale para ele'
      ELSE 'ok' END" "$1" 2>/dev/null || echo 'não consegui perguntar ao banco')"
  if [[ "$r" == "ok" ]]; then echo "  ✓ o rede_app não é superusuário, não passa por cima do RLS e não é dono de tabela"; return 0; fi
  echo "  ✗ $r. Não ponha o sistema no ar sobre este banco."; return 1
}

# A URL da aplicação apontada para outro banco, guardando o que vem depois do nome
# (?sslmode=…).
outro_banco() {  # outro_banco <url> <banco>
  local base="${1%%\?*}"; echo "${base%/*}/$2${1#"$base"}"
}

# Compara duas listas do que protege o banco e diz a diferença. Devolve 1 se diferem.
compara_protecao() {  # compara_protecao <da origem> <do destino>
  if [[ -z "$1" ]]; then
    echo "  ✗ não consegui ler o que protege o banco de origem (o papel rede_app existe?)"; return 1
  elif [[ "$1" == "$2" ]]; then
    printf '  ✓ os %s itens que protegem o banco (permissões, RLS, políticas, gatilhos, donos) voltaram iguais\n' \
      "$(wc -l <<< "$1" | tr -d ' ')"; return 0
  fi
  echo "  ✗ o que protege o banco no destino não é o da origem:"
  diff <(echo "$1") <(echo "$2") | grep '^[<>]' | head -8 \
    | sed -e 's/^</    só na origem: /' -e 's/^>/    só no destino:/'
  return 1
}

# --------------------------------------------------------------- modo ensaio
if [[ "${1:-}" == "--ensaio" ]]; then
  ORIGEM="${DATABASE_URL:?defina DATABASE_URL}"
  DESTINO_DB="rede_acolher_ensaio_restauracao"
  ADMIN="${ORIGEM%/*}/postgres"
  PASTA="$(mktemp -d)/backup"

  echo "ENSAIO DE RESTAURAÇÃO"
  echo "origem:  $(sem_senha "$ORIGEM")"
  echo "destino: $DESTINO_DB (descartável)"
  echo

  echo "→ backup…"
  BACKUP_NAO_ANOTAR=1 BACKUP_DIR="$PASTA" bash "$RAIZ/scripts/backup.sh" "$PASTA" > /dev/null
  DUMP="$(ls -d "$PASTA"/*/ | tail -1)banco.dump"
  [[ -f "$DUMP" ]] || { echo "✗ o backup não produziu banco.dump"; exit 1; }

  echo "→ banco descartável…"
  "$PSQL" -X -c "DROP DATABASE IF EXISTS $DESTINO_DB" "$ADMIN" > /dev/null
  "$PSQL" -X -c "CREATE DATABASE $DESTINO_DB" "$ADMIN" > /dev/null
  DESTINO="${ORIGEM%/*}/$DESTINO_DB"

  echo "→ restaurando…"
  # `--no-owner`: o destino tem os papéis dele. Sem isto a restauração falha
  # em outra máquina, que é justamente onde ela precisa funcionar. As permissões
  # vêm junto (fase 290): sem elas o rede_app não lê nada.
  "$RESTORE" --no-owner --dbname="$DESTINO" "$DUMP" 2>&1 \
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

  # As permissões: o dono enxerga tudo, quem usa o sistema é o rede_app (fase 290).
  echo
  echo "→ o papel da aplicação voltou com as permissões de antes?"
  compara_protecao "$(permissoes "$ORIGEM")" "$(permissoes "$DESTINO")" || falhas=$((falhas + 1))
  papel_da_aplicacao "$DESTINO" || falhas=$((falhas + 1))
  # A leitura como a aplicação lê: pela conexão dela (DATABASE_APP_URL) apontada para
  # o banco do ensaio. Sem ela, pelo SET ROLE, que só o dono superusuário consegue.
  gestor="$("$PSQL" -tAX -c "SELECT id FROM app_user WHERE role = 'gestor_geral' AND active ORDER BY created_at LIMIT 1" "$DESTINO" 2>/dev/null || true)"
  casas_dono="$(conta "$DESTINO" house)"
  if [[ -n "${DATABASE_APP_URL:-}" ]]; then
    casas_app="$("$PSQL" -tAX -c "SELECT set_config('app.user_id', '$gestor', false);
                                  SELECT count(*) FROM house" "$(outro_banco "$DATABASE_APP_URL" "$DESTINO_DB")" 2>/dev/null | tail -1 || true)"
  else
    casas_app="$("$PSQL" -tAX -c "SET ROLE rede_app; SELECT set_config('app.user_id', '$gestor', false);
                                  SELECT count(*) FROM house" "$DESTINO" 2>/dev/null | tail -1 || true)"
  fi
  if [[ -n "$gestor" && "$casas_app" == "$casas_dono" ]]; then
    printf '  ✓ o rede_app, como Gestor Geral, lê as %s casas\n' "$casas_app"
  else
    echo "  ✗ o rede_app não lê as casas no destino (leu: ${casas_app:-nada}; o dono vê $casas_dono)."
    falhas=$((falhas + 1))
  fi

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
      if (( cifrados == 1 )); then echo "  ✓ a credencial restaurada abre com a CREDENTIAL_KEY atual"; else echo "  ✓ as $cifrados credenciais restauradas abrem com a CREDENTIAL_KEY atual"; fi
    else
      echo "  ✗ o cofre NÃO abre: a chave deste ambiente não é a que cifrou estes dados."
      falhas=$((falhas + 1))
    fi
  fi

  echo
  "$PSQL" -X -c "DROP DATABASE IF EXISTS $DESTINO_DB" "$ADMIN" > /dev/null
  rm -rf "$PASTA"
  # O painel de saúde da implantação (fase 185): a restauração CONFERIDA é a
  # que vale, e ela fica anotada no banco de trabalho, deu certo ou não.
  ok=$([[ $falhas -eq 0 ]] && echo true || echo false)
  "$PSQL" -X -q -c "SELECT app_anotar_implantacao('restauracao', $ok, jsonb_build_object('falhas', $falhas))" \
    "$ORIGEM" > /dev/null 2>&1 || echo "⚠ não consegui anotar a restauração no painel de saúde da implantação."
  if [[ $falhas -eq 0 ]]; then
    echo "✓ ciclo completo: backup → restauração → conferência, sem perda."
    exit 0
  fi
  if (( falhas == 1 )); then echo "✗ 1 conferência falhou. Este backup NÃO restaura o sistema."; else echo "✗ $falhas conferências falharam. Este backup NÃO restaura o sistema."; fi
  exit 1
fi

# ------------------------------------------------------------ modo de verdade
PASTA="${1:?uso: restaurar.sh <pasta-do-backup> <URL-do-banco-destino> | --ensaio}"
DESTINO="${2:?informe a URL do banco de DESTINO}"

[[ -f "$PASTA/banco.dump" ]] || { echo "✗ não encontrei $PASTA/banco.dump"; exit 1; }

echo "Restaurar $PASTA  →  $(sem_senha "$DESTINO")"
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

# As permissões vêm no dump e citam o papel da aplicação pelo nome (fase 290).
# Sem ele no destino, a restauração para no meio; melhor dizer antes.
if [[ "$("$PSQL" -tAX -c "SELECT 1 FROM pg_roles WHERE rolname = 'rede_app'" "$DESTINO" 2>/dev/null)" != "1" ]]; then
  echo "✗ o servidor de destino não tem o papel rede_app. Crie-o antes, com a senha do DATABASE_APP_URL"
  echo "  (§12.5 do documento: CREATE ROLE rede_app LOGIN PASSWORD '…' NOSUPERUSER NOBYPASSRLS), e rode de novo."
  exit 1
fi
# Os objetos ficam com o dono de quem restaura (--no-owner), e as funções SECURITY
# DEFINER rodam como ele: restaurar com outro dono muda o que elas podem. O backup
# guarda o que protege a origem, e a restauração confere no fim.
if [[ ! -f "$PASTA/PERMISSOES.txt" ]]; then
  echo "⚠ este backup é de antes da fase 290 e não traz o que protege o banco (PERMISSOES.txt):"
  echo "  ele volta sem as permissões do papel da aplicação, e o sistema não abre. Prefira um mais novo."
fi

echo "→ restaurando o banco…"
if ! "$RESTORE" --no-owner --clean --if-exists --dbname="$DESTINO" "$PASTA/banco.dump"; then
  echo "✗ a restauração do banco parou com erro (as mensagens acima dizem qual). O banco de destino"
  echo "  pode ter ficado pela metade: não ponha o sistema no ar sobre ele. Corrija e rode de novo."
  exit 1
fi

for par in "dossie:${ARQUIVOS_DIR:-./.arquivos}" "acervo:${ARQUIVO_DRIVE_DIR:-/var/lib/rede-acolher/arquivo}"; do
  nome="${par%%:*}"; caminho="${par#*:}"
  if [[ -f "$PASTA/$nome.tar.gz" ]]; then
    echo "→ $nome → $caminho…"
    mkdir -p "$(dirname "$caminho")"
    tar -xzf "$PASTA/$nome.tar.gz" -C "$(dirname "$caminho")"
  fi
done

# O que protege o banco voltou igual ao da origem? (fase 290)
echo "→ conferindo o que protege o banco…"
papel_da_aplicacao "$DESTINO" || exit 1
if [[ -f "$PASTA/PERMISSOES.txt" ]]; then
  compara_protecao "$(cat "$PASTA/PERMISSOES.txt")" "$(permissoes "$DESTINO")" || {
    echo "  Não aplique GRANT à mão: desfaz as travas das fases 288 e 289. Restaure conectado como o"
    echo "  mesmo dono da origem (o que está nas linhas definer acima), num banco limpo."
    exit 1; }
elif [[ "$("$PSQL" -tAX -c "SELECT has_table_privilege('rede_app', 'house', 'SELECT')" "$DESTINO" 2>/dev/null)" == "t" ]]; then
  echo "  ✓ o papel da aplicação lê o banco restaurado (backup sem a lista para comparar)."
else
  echo "  ✗ o papel da aplicação NÃO lê o banco restaurado: o sistema não vai abrir. Não aplique GRANT"
  echo "    à mão (desfaz as travas das fases 288 e 289); restaure de um backup feito depois da fase 290."
  exit 1
fi

echo
echo "✓ restaurado."
echo
echo "FALTA UMA COISA, e ela não está neste backup: a CREDENTIAL_KEY."
echo "Sem a MESMA chave que cifrou estes dados, o cofre de credenciais volta"
echo "ilegível. Confira antes de dizer que o sistema está no ar:"
echo "  DATABASE_URL=<a URL do destino> node scripts/conferir-cofre.mjs"
