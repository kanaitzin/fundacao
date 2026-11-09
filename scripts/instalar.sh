#!/usr/bin/env bash
# ============================================================
# A INSTALAÇÃO NO SERVIDOR DO PÃO (fase 227)
#
#   bash scripts/instalar.sh            confere, sem mudar nada (o padrão)
#   bash scripts/instalar.sh --instalar confere e, se nada faltar, constrói,
#                                       migra e diz o que ligar
#
# Quem roda é quem cuida do servidor, na pasta /opt/rede-acolher, com o `.env`
# já preenchido (§12.1). O modo de conferir pode ser rodado quantas vezes
# precisar: ele só lê o `.env`, a máquina e o banco, e diz item por item o que
# está pronto e o que falta, com a seção do documento que explica.
#
# O que este script NÃO faz, de propósito: criar usuário do sistema, abrir porta
# no firewall, instalar pacote, mexer no crontab nem ligar serviço. Isso muda a
# máquina, e cada um é um passo que a pessoa faz sabendo o que faz (o fim do
# `--instalar` lista os comandos).
# ============================================================
set -uo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
MODO="${1:---conferir}"
ENV_ARQ="${ENV_ARQUIVO:-$RAIZ/.env}"
faltam=0
avisos=0

ok()    { printf '  \033[32m✓\033[0m %s\n' "$1"; }
falta() { printf '  \033[31m✗\033[0m %s\n      → %s\n' "$1" "$2"; faltam=$((faltam + 1)); }
aviso() { printf '  \033[33m○\033[0m %s\n      → %s\n' "$1" "$2"; avisos=$((avisos + 1)); }
secao() { printf '\n%s\n' "$1"; }

# Lê uma variável do .env sem executar o arquivo (ele pode ter caracteres que o
# shell interpretaria).
val() {
  [[ -f "$ENV_ARQ" ]] || { echo ""; return; }
  grep -E "^$1=" "$ENV_ARQ" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}
exemplo() { grep -E "^$1=" "$RAIZ/.env.example" | tail -1 | cut -d= -f2-; }

echo "Rede Acolher: conferência da instalação ($(date '+%d/%m/%Y %H:%M'))"

secao "1. A máquina"
if command -v node >/dev/null; then
  v=$(node -v | sed 's/^v//' | cut -d. -f1)
  [[ "$v" -ge 20 ]] && ok "Node $(node -v)" || falta "Node $(node -v), antigo" "instale o Node 20 ou mais novo"
else falta "Node não instalado" "instale o Node 20 ou mais novo"; fi
for prog in psql pg_dump pg_basebackup pg_verifybackup rsync; do
  command -v "$prog" >/dev/null && ok "$prog" || falta "$prog não encontrado" "instale o cliente do PostgreSQL 16 e o rsync (§12.4.1)"
done
if command -v caddy >/dev/null; then
  ok "proxy HTTPS instalado (Caddy)"
  caddy validate --config "$RAIZ/scripts/servidor/Caddyfile" --adapter caddyfile >/dev/null 2>&1 \
    && ok "o Caddyfile do repositório é válido para este Caddy" \
    || falta "o Caddyfile do repositório não vale para este Caddy" "caddy validate --config scripts/servidor/Caddyfile"
elif command -v nginx >/dev/null; then
  # Os cabeçalhos da tela (a CSP, o HSTS, o cache) estão escritos para o Caddy (fase 295).
  aviso "proxy HTTPS instalado (nginx), sem os cabeçalhos da tela" \
    "copie o bloco cabecalhos_da_tela e os limites de corpo do Caddyfile (§12.9), ou use o Caddy"
else
  falta "nenhum proxy HTTPS (Caddy ou nginx)" "§12.9; o exemplo está em scripts/servidor/Caddyfile"
fi

secao "2. O .env (§12.1)"
if [[ ! -f "$ENV_ARQ" ]]; then
  falta "não há $ENV_ARQ" "copie o .env.example para .env e preencha"
else
  ok "o arquivo existe"
  # O systemd lê o .env como está: o comentário depois do valor entra no valor, e
  # SESSION_TTL_HOURS=14 seguido de comentário vira um número que não é número.
  comentados=$(grep -E '^[A-Z_]+=[^#]*[^[:space:]#][[:space:]]+#' "$ENV_ARQ" | cut -d= -f1 | tr '\n' ' ')
  [[ -z "$comentados" ]] && ok "nenhum comentário na linha do valor" \
    || falta "comentário na mesma linha do valor: $comentados" "passe o comentário para a linha de cima; o systemd o leria como parte do valor"
  for v in SESSION_PEPPER CREDENTIAL_KEY; do
    atual=$(val "$v")
    if [[ -z "$atual" || "$atual" == "$(exemplo "$v")" ]]; then
      falta "$v com o valor do exemplo" "gere um valor novo (openssl rand -hex 32) e guarde fora do backup"
    else ok "$v trocado"; fi
  done
  dono=$(val DATABASE_URL | sed -E 's#^[a-z]+://([^:@]+).*#\1#')
  app=$(val DATABASE_APP_URL | sed -E 's#^[a-z]+://([^:@]+).*#\1#')
  if [[ -z "$app" || "$app" == "$dono" ]]; then
    falta "DATABASE_APP_URL com o mesmo usuário do dono ($dono)" "use o usuário da aplicação (rede_app): com o dono, o RLS não protege"
  else ok "o banco: dono $dono migra, $app roda (o RLS vale)"; fi
  [[ "$(val DATABASE_URL)" == *dev-only-change-me* ]] && falta "a senha do banco é a do exemplo" "troque as duas senhas do banco"
  [[ "$(val DATABASE_APP_URL)" == *dev-only-change-me* ]] && falta "a senha do rede_app é a do exemplo" "troque a senha em DATABASE_APP_URL e no banco (ALTER ROLE rede_app PASSWORD '...')"
  base=$(val APP_BASE_URL)
  [[ "$base" == https://* ]] && ok "APP_BASE_URL em HTTPS ($base)" \
    || falta "APP_BASE_URL sem HTTPS ($base)" "o link do convite e do esqueci vai por ela; sem HTTPS, câmera e microfone não ligam"
  for v in BANCO_LIMITE_CONSULTA_MS BANCO_LIMITE_TRAVA_MS BANCO_LIMITE_PARADA_MS BANCO_LIMITE_CONEXAO_MS; do
    [[ "$(val "$v")" == 0 ]] && falta "$v=0 desliga o limite" "o zero é só da simulação; apague a linha ou use o valor do .env.example (§12.4.1)"
  done
  [[ -n "$(val TRUST_PROXY)" ]] && ok "TRUST_PROXY=$(val TRUST_PROXY)" \
    || falta "TRUST_PROXY vazio" "atrás do Caddy da mesma máquina, use loopback: sem isso, o endereço de todo mundo é o do servidor (§12.9)"
  for v in LOGIN_MAX_ATTEMPTS LOGIN_MAX_POR_ENDERECO LOGIN_LOCK_MINUTES; do
    x=$(val "$v")
    [[ -z "$x" || "$x" =~ ^[1-9][0-9]*$ ]] || falta "$v=$x não é um número inteiro maior que zero" "o servidor usa o padrão no lugar"
  done
  [[ -z "$(val HOST)" || "$(val HOST)" == 127.0.0.1 || "$(val HOST)" == ::1 ]] \
    || aviso "HOST=$(val HOST): o servidor escuta fora da máquina" "com o Caddy na mesma máquina, deixe 127.0.0.1"
  for v in ARQUIVOS_DIR ARQUIVO_DRIVE_DIR; do
    d=$(val "$v")
    if [[ -z "$d" || "$d" == ./* ]]; then falta "$v relativo ou vazio ($d)" "use um caminho absoluto, em /var/lib/rede-acolher (§12.2)"
    elif [[ -d "$d" && -w "$d" ]]; then ok "$v=$d"
    else falta "$v=$d não existe ou não se escreve" "crie a pasta e dê ao usuário rede-acolher"; fi
  done
  if [[ "$(val EMAIL_MODO)" == smtp ]]; then
    [[ -n "$(val SMTP_HOST)" && -n "$(val EMAIL_REMETENTE)" ]] && ok "e-mail por SMTP ($(val SMTP_HOST))" \
      || falta "SMTP sem servidor ou remetente" "§12.8"
  else falta "EMAIL_MODO=$(val EMAIL_MODO)" "sem SMTP não há convite nem esqueci minha senha (§12.8)"; fi
  [[ "$(val RELOGIO_USER_EMAIL)" == *@paodospobres.com.br ]] && ok "conta do relógio $(val RELOGIO_USER_EMAIL)" \
    || falta "RELOGIO_USER_EMAIL=$(val RELOGIO_USER_EMAIL)" "a conta institucional do relógio (§12.7)"
  [[ -n "$(val PUSH_VAPID_PUBLICA)" && -n "$(val PUSH_VAPID_PRIVADA)" ]] && ok "as chaves do aviso no celular" \
    || aviso "sem as chaves do aviso no celular" "opcional; sem elas o aviso fica só na tela (§12.11)"
  # A Acolhe+AI (fase 247). A decisão de 23/10 é o computador do Pão: o serviço
  # só usa o motor local com o endereço E o modelo, e sem um deles cai calado no
  # modo guia. Por isso a conferência pergunta à máquina, e não só ao .env.
  FIM_EM_V1='^https?://[^/]+(/.*)?/v1/?$'
  DA_REDE='^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)|^[a-z0-9-]+$|\.local$|\.lan$|\.paodospobres\.com\.br$'
  motor=$(val ACOLHE_AI_MOTOR | tr -d '[:space:]')
  lurl=$(val ACOLHE_AI_LOCAL_URL | tr -d '[:space:]')
  lmod=$(val ACOLHE_AI_LOCAL_MODELO | tr -d '[:space:]')
  if [[ "$motor" == local ]]; then
    if [[ -z "$lurl" || -z "$lmod" ]]; then
      falta "ACOLHE_AI_MOTOR=local sem o endereço ou sem o modelo" "preencha ACOLHE_AI_LOCAL_URL e ACOLHE_AI_LOCAL_MODELO; sem os dois a Acolhe+AI fica no modo guia (§12.12)"
    elif [[ ! "$lurl" =~ $FIM_EM_V1 ]]; then
      falta "ACOLHE_AI_LOCAL_URL=$lurl não termina em /v1" "o endereço do computador termina em /v1, como http://10.0.0.20:11434/v1 (§12.12)"
    else
      host=$(sed -E 's#^https?://([^/:]+).*#\1#' <<<"$lurl")
      [[ "$host" =~ $DA_REDE ]] \
        || aviso "ACOLHE_AI_LOCAL_URL aponta para $host" "confira que esse computador é da rede do Pão: a conversa vai inteira para ele"
      # Pergunta à máquina quais modelos ela tem (/v1/models, o padrão aberto).
      modelos=$(node -e '
        fetch(process.argv[1].replace(/\/+$/, "") + "/models", { signal: AbortSignal.timeout(8000) })
          .then((r) => r.ok ? r.json() : Promise.reject(r.status))
          .then((j) => console.log((j.data ?? []).map((m) => m.id).join("\n")))
          .catch(() => process.exit(2));' "$lurl" 2>/dev/null)
      if [[ $? -ne 0 ]]; then
        falta "o computador da Acolhe+AI não responde em $lurl" "confira que a máquina está ligada, o serviço do modelo está de pé e a porta está aberta para este servidor"
      elif grep -qxF -e "$lmod" -e "$lmod:latest" <<<"$modelos"; then
        ok "a Acolhe+AI no computador do Pão ($lmod em $host); a prova: npm run prova-do-modelo -w backend"
      else
        falta "o modelo $lmod não está no computador da Acolhe+AI" "os que ele tem: $(tr '\n' ' ' <<<"$modelos"); confira o nome em ACOLHE_AI_LOCAL_MODELO"
      fi
    fi
    [[ -n "$(val ANTHROPIC_API_KEY)" ]] && aviso "ANTHROPIC_API_KEY preenchida com o motor local" "com o motor local a chave não é usada; apague a linha, segredo sem uso é segredo a guardar"
  elif [[ -n "$motor" && "$motor" != claude ]]; then
    falta "ACOLHE_AI_MOTOR=$motor não é um motor" "use local para o computador do Pão, ou deixe vazio (§12.12)"
  elif [[ -n "$(val ANTHROPIC_API_KEY)" ]]; then
    aviso "a Acolhe+AI pela chave da Anthropic" "a conversa sai do servidor; a decisão de 23/10 é o computador do Pão, com ACOLHE_AI_MOTOR=local (§12.12)"
  else
    aviso "a Acolhe+AI sem modelo" "opcional; sem o computador do Pão ela fica no modo guia (§12.12)"
  fi
fi

secao "3. O banco"
url=$(val DATABASE_URL)
if [[ -n "$url" ]] && command -v psql >/dev/null; then
  if psql "$url" -Atc 'select 1' >/dev/null 2>&1; then
    ok "o banco responde"
    am=$(psql "$url" -Atc "show archive_mode" 2>/dev/null)
    [[ "$am" == on ]] && ok "arquivo contínuo ligado" \
      || falta "archive_mode=$am" "use o scripts/postgresql-do-servidor.conf (§12.4.1): perda máxima de um minuto"
    n=$(psql "$url" -Atc "select count(*) from schema_migration" 2>/dev/null || echo 0)
    [[ "$n" -gt 0 ]] && ok "$n migrações aplicadas" || aviso "nenhuma migração aplicada ainda" "o --instalar migra"
    # As contas da semente de desenvolvimento entram com a senha do repositório e sem a troca
    # obrigatória (fase 291): servem ao treino com o banco de demonstração, nunca ao dado real.
    semente=$(psql "$url" -Atc "select count(*) from app_user where email like '%@paodospobres.dev'" 2>/dev/null || echo 0)
    [[ "$semente" -gt 0 ]] && aviso "o banco tem $semente contas fictícias da semente, com a senha do repositório" \
      "servem só ao treino; o banco do dado real começa sem elas"
  else falta "o banco não responde em DATABASE_URL" "confira o endereço, o usuário e a senha"; fi
fi
# A aplicação entra como rede_app, e o papel não pode aceitar a senha de desenvolvimento:
# a migração 0010 o cria com ela quando ele ainda não existe (fase 291). A senha nunca
# vai para a tela: o endereço é montado aqui e só se diz se entrou.
app_url=$(val DATABASE_APP_URL)
if [[ -n "$app_url" ]] && command -v psql >/dev/null; then
  if PGCONNECT_TIMEOUT=5 psql "$app_url" -Atc 'select 1' >/dev/null 2>&1; then
    ok "a aplicação entra no banco pela DATABASE_APP_URL"
  else falta "a aplicação não entra no banco pela DATABASE_APP_URL" "confira o endereço e a senha do rede_app"; fi
  com_a_de_exemplo=$(printf '%s' "$app_url" | sed -E 's#^([a-z]+://[^:@/]+)(:[^@]*)?@#\1:dev-only-change-me-app@#')
  if [[ "$com_a_de_exemplo" != "$app_url" ]] \
     && PGCONNECT_TIMEOUT=5 psql "$com_a_de_exemplo" -Atc 'select 1' >/dev/null 2>&1; then
    falta "o rede_app aceita a senha de desenvolvimento" "ALTER ROLE rede_app PASSWORD '...' e a mesma senha na DATABASE_APP_URL (a 0010 cria o papel com ela)"
  fi
fi

secao "4. O que roda sozinho (§12.7 e §12.4.1)"
cron=$(crontab -l -u rede-acolher 2>/dev/null || true)
for item in "relogio:prod|o relógio das 5h" "fim-do-plantao:prod|o aviso de meia hora antes do fim do plantão" \
            "base-do-banco.sh|a base semanal do banco" "copiar-arquivos.sh|a cópia das fotos e documentos"; do
  chave=${item%%|*}; nome=${item#*|}
  [[ "$cron" == *"$chave"* ]] && ok "$nome no cron" || falta "$nome fora do cron" "scripts/relogio.crontab e §12.4.1"
done

secao "5. O serviço"
[[ -f /etc/systemd/system/rede-acolher.service ]] && ok "rede-acolher.service instalado" \
  || falta "o serviço não está no systemd" "scripts/servidor/rede-acolher.service"

echo
if [[ $faltam -gt 0 ]]; then
  echo "$( (( faltam == 1 )) && echo "Falta 1 item" || echo "Faltam $faltam itens")$( (( avisos == 1 )) && echo " e há 1 opcional" ; (( avisos > 1 )) && echo " e há $avisos opcionais"). Nada foi mudado."
  [[ "$MODO" == --instalar ]] && echo "A instalação só segue com tudo pronto."
  exit 1
fi
echo "Tudo pronto$( (( avisos == 1 )) && echo ", com 1 opcional desligado" ; (( avisos > 1 )) && echo ", com $avisos opcionais desligados")."
[[ "$MODO" != --instalar ]] && exit 0

secao "Construindo e migrando (§12.3)"
cd "$RAIZ" || exit 1
set -e
set -a; # shellcheck disable=SC1090
. "$ENV_ARQ"; set +a
npm ci
npm run build -w backend
npm run build -w frontend
npm run migrate:prod -w backend
cat <<'FIM'

Pronto. Os passos que mudam a máquina, para quem cuida do servidor:
  sudo cp scripts/servidor/rede-acolher.service /etc/systemd/system/
  sudo systemctl daemon-reload && sudo systemctl enable --now rede-acolher
  sudo cp scripts/servidor/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
  sudo crontab -u rede-acolher scripts/relogio.crontab   (e as linhas do §12.4.1)
  npm run ensaio:restauracao                               (a prova de que o backup volta, §12.5)
E a conferência final: bash scripts/instalar.sh
FIM
