# Implantação — o que precisa existir antes de a Casa 03 usar isto

> Este documento cobre o que separa **protótipo aprovado** de **sistema
> rodando na casa**. Ele não cobre o SMTP, que tem documento próprio
> (`implantacao-smtp.md`), nem as decisões que são da Fundação
> (`pendencias-institucionais.md`).
>
> Escrito em 02/09/2026, junto com os scripts de backup e restauração — e
> corrigido pelo que eles ensinaram.

---

## 1. A configuração

Copie `.env.example` para `.env` e ajuste. **Toda** variável lida pelo servidor
está lá: o teste `implantacao.spec.ts` recusa a construção se alguém
acrescentar uma e esquecer de documentá-la — e recusa também o contrário,
variável no exemplo que ninguém lê, porque uma chave que não faz nada ensina a
não confiar no arquivo inteiro.

Três valores decidem se o sistema é seguro, e nenhum deles tem padrão que
sirva:

| Variável | O que acontece se ficar como está |
|---|---|
| `SESSION_PEPPER` | sessões assináveis por quem leu o repositório |
| `CREDENTIAL_KEY` | o cofre de credenciais dos acolhidos abre para quem leu o repositório |
| `DATABASE_APP_URL` | a aplicação roda como superusuário, e o RLS deixa de proteger |

O sistema roda como `rede_app`, que **não** é superusuário. Isso não é zelo: o
RLS não se aplica a superusuário, e um serviço conectado como `rede_admin`
enxerga as oito casas de uma vez sem que nenhuma política reclame.

---

## 2. Os dois acervos que vivem fora do banco

O banco **não** guarda os arquivos. São dois lugares, e o backup precisa dos
dois:

- **`ARQUIVOS_DIR`** — os objetos do dossiê do acolhido: certidão, foto,
  laudo, comprovante;
- **`ARQUIVO_DRIVE_DIR`** — as cópias documentais arquivadas.

Até 02/09/2026 o segundo se chamava `ARQUIVO_DIR`, uma letra de diferença do
primeiro. Quem configurasse um acreditando ter configurado os dois perderia
metade do acervo no primeiro backup — e descobriria isso no dia em que
precisasse restaurar, que é o pior dia possível para descobrir qualquer coisa.

Perder um dos dois é perder documento de criança **sem que o banco acuse
nada**: ele continua dizendo que o arquivo existe.

---

## 2.1 Subir o sistema — e provar que ele sobe

```bash
npm run ensaio:producao
```

Constrói, cria um banco virgem, aplica as 76 migrações **pelo binário
compilado**, sobe o serviço e confere `/health`. Não publica nada e não toca no
banco de trabalho.

Este ensaio existe porque o projeto passou 60 fases sem nunca rodar compilado:
tudo corria por `tsx` (o servidor de desenvolvimento) e por `jest`. O que se
implanta é outra coisa — `dist/`, sem `src/`, sem `scripts/`, sem nenhuma
dependência de desenvolvimento — e da primeira vez que isto foi ensaiado
encontrou duas coisas que teriam quebrado a implantação:

- **`dist/` saía com ZERO migrações.** Os 76 `.sql` vivem em
  `src/modules/…`, e o `tsc` não copia `.sql`. Quem implantasse só o `dist/`
  subiria o serviço, veria `/health` responder "ok" e descobriria o banco
  vazio. O `/health` responde ok porque o banco EXISTE; ele não sabe se as
  tabelas estão lá.
- **A migração dependia de `tsx`**, que é dependência de desenvolvimento. Com
  `npm ci --omit=dev`, o comando falha com "tsx: not found".

Os dois estão resolvidos: o `postbuild` copia os `.sql` e o timbre para dentro
do `dist/`, e há um migrador compilado (`npm run migrate:prod`).

Na implantação, a ordem é:

```bash
npm ci                       # na raiz — é um workspace
npm run build -w backend     # compila e copia migrações e timbre
npm run build -w frontend    # o PWA
DATABASE_URL=…  npm run migrate:prod -w backend
DATABASE_APP_URL=… node backend/dist/main.js
```

`DATABASE_URL` é do **dono** do banco (migra); `DATABASE_APP_URL` é da
**aplicação** (`rede_app`, sem superusuário, com o RLS valendo).

**Trocar os dois desliga o RLS.** Desde a fase 64 o serviço confere isso ao
subir e **recusa arrancar** se a conexão passar por cima das políticas — ele
diz qual variável está trocada, no log, antes de aceitar qualquer requisição.
Se o serviço não sobe e a mensagem fala em `DATABASE_APP_URL`, é isto.

## 3. Backup

```bash
bash scripts/backup.sh /var/backups/rede-acolher
```

Salva o banco (formato `custom`), os dois acervos, e um `SOMAS.txt` com o
sha256 de cada arquivo — a mesma pergunta que a cópia documental faz ao Drive:
*isto é o que saiu de lá?*

Rode-o por `cron`, diariamente, fora do horário de troca de turno. A retenção
padrão é de 30 dias (`BACKUP_RETER_DIAS`).

### O que o backup NÃO leva, de propósito

A `CREDENTIAL_KEY`. E é preciso entender por quê, porque a intuição erra nas
duas direções:

- **sem a chave**, o backup restaura o cofre como bytes ilegíveis. As
  credenciais dos acolhidos morrem com a chave, não com o servidor;
- **com a chave guardada junto**, o backup restaura o cofre **aberto** para
  quem encontrar a cópia. Uma pasta de backup extraviada passa a valer as
  senhas de gov.br e INSS de vinte crianças.

A chave vive em outro lugar, com outro dono, e quem responde por ela é a
Fundação. Escreva onde ela está **antes** de precisar dela.

---

## 4. Restauração — e a prova de que ela funciona

```bash
# o ciclo inteiro num banco descartável, sem tocar no banco de trabalho
npm run ensaio:restauracao
```

Faz o backup, cria um banco descartável, restaura, confere as contagens das
tabelas que importam e **abre o cofre com a chave do ambiente**. Sai com
código 1 se qualquer coisa não bater.

Um backup que nunca foi restaurado não é backup: é uma esperança guardada em
disco. Rode este ensaio pelo menos uma vez por mês, e sempre depois de mudar
qualquer coisa no servidor.

A restauração de verdade:

```bash
bash scripts/restaurar.sh /var/backups/rede-acolher/2026-09-02-0345 <URL-destino>
```

Ela pede o nome do banco de destino escrito à mão antes de sobrescrever —
porque o Rede Acolher não apaga nada em silêncio, e um script de emergência é
exatamente onde a pressa mora.

### O que o ensaio ensinou

A primeira lista de tabelas a conferir tinha dois nomes que **nunca
existiram** (`shift_handover`, `medication_dose`). O conferidor respondia
"erro" nos dois lados, e dois erros iguais se leem como acordo: a conferência
passava sem conferir nada. Agora tabela inexistente na origem é falha
declarada, com a frase "a lista envelheceu".

E a conferência do cofre foi provada **falhando**: com uma `CREDENTIAL_KEY`
diferente da que cifrou os dados, o ensaio acusa as duas credenciais e sai com
código 1. Um conferidor que só foi visto dizendo "sim" não foi visto.

---

## 5. O relógio

O sistema tem duas fontes de hora: o servidor da aplicação e o banco. As
migrações usam `app_hoje()` justamente para não dependerem do relógio de quem
executa — mas o serviço também formata datas, e uma diferença de minutos entre
os dois aparece disfarçada de qualquer outra coisa: dose "atrasada" que não
está, plantão noturno que cai no dia errado, ATA que abre duas vezes.

Ative NTP nos dois. Se só um puder ser confiável, que seja o **banco**, e o
serviço pergunte a ele.

---

## 6. O que ainda não existe, e depende da Fundação

- **A escala 12x36 vigente.** Sem ela, a janela de acesso por plantão
  (T-10/T+10) não é uma frase com sentido — e por isso ela **não está
  implementada**. Até 02/09/2026 o `.env.example` trazia duas chaves que
  ninguém lia, sugerindo o contrário.
- **Os códigos e nomes reais das oito unidades.** Os atuais (AI1–AI4,
  ARM1–ARM4) são preliminares e aparecem em tela, em relatório e em nome de
  arquivo.
- **O SMTP institucional** — sem ele não há convite de primeiro acesso, e sem
  convite não há primeiro acesso para 40 pessoas sem distribuir senha por
  mensagem. Ver `implantacao-smtp.md`.
- **O código do aparelho da casa** (§11.7): onde ele é digitado, e quem digita.
  Sem isso, confirmar medicamento sem sinal não funciona.
- **Os dados de partida:** equipe, acolhidos já na casa, e a decisão de quanto
  do histórico em papel entra no sistema.
- **LGPD:** quem responde, por quanto tempo se guarda, o que se apaga.
