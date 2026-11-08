# Análise geral do Rede Acolher, 08/11/2026

Pedido do dono do projeto em 07/11 e refeito em 08/11: analisar tudo o que foi feito, ver se algo
se perdeu, dizer o que falta para o projeto ser real, e pensar os subagentes que ajudam na revisão
e no trabalho contínuo, inclusive um de banco de dados. Feita numa conta nova do Claude, a partir
do repositório (fase 287, commit `b3541d8`), sem acesso às conversas da conta anterior.

**Como foi feita.** Nada aqui saiu da memória nem dos documentos sem conferência: os números saíram
do código e do catálogo do banco, os achados de segurança foram lidos no código com arquivo e
linha, e os de banco foram provados num banco à parte (`rede_auditoria`), dentro de `BEGIN …
ROLLBACK`, como o papel da aplicação. A suíte rodou inteira nas duas condições de relógio.

---

## 1. O histórico desta conversa

| Quando | O que aconteceu |
|---|---|
| 07/11, 15h26 | A conta anterior chegou ao limite semanal. Pergunta: dá para esta conta assumir o projeto? Resposta: sim, pelo repositório; o que mora só nas conversas da outra conta não vem junto. |
| 07/11, 15h36 | O repositório `kanaitzin/fundacao` foi ligado à sessão e clonado (branch `claude/work-system-code-ready-0e3hh2`, fase 287). |
| 07/11, 15h38 | Pedido: analisar tudo, ver o que se perdeu, o que melhorar para ser real, quais subagentes criar; depois seguir no Claude Code. Primeira análise, mais curta: repositório público, CLAUDE.md pesado, nenhum teste no GitHub, `master` atrás, trabalho perdido da fase 254, e uma primeira lista de subagentes. |
| 08/11, 00h13 a 00h51 | **Uma parte da conversa que não ficou no histórico guardado** (provavelmente um ramo depois de uma mensagem editada). Ela deixou arquivos no disco, sem commit: oito subagentes em `.claude/agents/`, a memória do subagente de banco com dez achados (`.claude/agent-memory/banco-de-dados/MEMORY.md`) e o hook `jest-em-serie.sh`. Nesta análise eles foram tratados como trabalho a revisar, não como verdade. |
| 08/11, 03h39 | Pedido de refazer tudo, sem poupar, com um subagente de banco de dados. Este documento. |
| 08/11, 04h37 | Pedido de deixar tudo pronto para seguir no Claude Code. O CLAUDE.md ganhou, no alto do *O que fazer agora*, o bloco desta análise (as decisões do dono e os consertos antes do ar) e a seção *Os subagentes*; o PARA-A-REUNIAO §0 ganhou as duas contradições e os três assuntos novos do DPO; e tudo foi para o repositório. |
| 08/11, 11h27 | As quatro decisões do dono: o repositório fica público até o 1.0 (A1); o CLAUDE.md fica como está (P1); o tronco passa a ser o `main` (P3); e não se congela funcionalidade (P5). A sessão não conseguiu criar o `main` nem apagar o branch da 127, que está superado: o proxy só deixa empurrar para branches `claude/...`, e esses passos ficaram com o dono, no GitHub. |

---

## 2. O retrato, medido em 08/11

| | |
|---|---|
| Começo do projeto | 26/08/2026 (primeiro commit: *Fase 0 + Fase 1*) |
| Fases | 287, em dez semanas e meia; cerca de 500 commits |
| Código | ~65 mil linhas no servidor, ~57 mil na tela (14,9 mil delas no servidor de mentira do protótipo, `mock-casa.ts`), ~41 mil de testes, 13 ensaios de navegador |
| Banco | 218 migrações, 154 tabelas (153 com RLS; a que não tem é a de controle das migrações), 334 funções (243 `SECURITY DEFINER`, todas com `search_path` terminado em `pg_temp`), 292 políticas, 56 gatilhos |
| Servidor | 440 rotas |
| Tela | 40 arquivos de tela; os maiores: `Acolhidos.tsx` (7.236 linhas), `Saude.tsx` (2.741), `Ata.tsx` (2.289) |
| Suíte, relógio real | **171 de 171 arquivos, 1.481 de 1.481 testes**, 3min27s; os dois `tsc` sem erro |
| Suíte, relógio depois das 21h | **1.481 de 1.481**, com o UTC em 09/11 e a instituição em 08/11 (as fases 281 a 287 tinham fechado sem esta rodada) |
| Documentos | `CLAUDE.md` com 1.626 linhas e 204 KB (uns 56 mil tokens, carregados em toda sessão); `REDE-ACOLHER.md` com 3.723 linhas e 598 KB; `PARA-A-REUNIAO.md` com 81 KB |
| Repositório | **público**; branch padrão `claude/work-system-code-ready-0e3hh2`; `master` 325 commits atrás; um branch solto (`fase-127-quem-a-chamada-cobra`) |
| Gente | uma avaliação humana (05/11); o roteiro de 56 tarefas com a equipe da Casa 03 nunca foi aplicado |

---

## 3. O que está muito bem feito, e não se mexe

- **A autorização em duas camadas existe de verdade na maior parte do banco.** Toda tabela de dado
  tem RLS, toda função `SECURITY DEFINER` declara `search_path` com `pg_temp` no fim, o alcance é
  perguntado como conjunto, e o servidor **recusa subir** se a conexão passar por cima das
  políticas.
- **A suíte prova o que importa**: sondagem de leitura e de escrita entre casas com registro real,
  a fotografia do banco antes e depois, o relógio adiantado, os Words abertos e conferidos, a
  injeção explícita, os avisos que chegam a uma tela que o cargo abre. Ela é o maior patrimônio
  do projeto.
- **Senha com scrypt, sessão com hash, e o mesmo recado para e-mail certo ou errado.** Arquivo
  conferido pela assinatura. Log só com id e metadado (conferido no log da suíte).
- **As regras compartilhadas entre servidor e protótipo** (`*.regra.ts`) e as listas únicas
  (`portas.ts`, `alcance.ts`) com teste que impede a cópia de voltar.
- **O cuidado com a criança e com a equipe** está no código, não só no discurso: nada de ranking,
  nada de comparação entre crianças, cor que não julga, documento na voz da equipe, sigilo de
  saúde por registro.
- **Nada se perde**: arquivo contínuo do banco, base semanal, volta a qualquer minuto e cópia das
  fotos, provados pelo `ensaio:ponto-no-tempo`.

---

## 4. Os achados, por gravidade

Cada um com a evidência, o efeito para a casa e a correção. "Antes do ar" quer dizer antes do
primeiro dado real.

### Alto: resolver antes do ar

**A1. O repositório é público.** Ele mostra a instituição, as oito unidades, o nome e o e-mail do
Marcelo, o mapa completo de quem alcança o quê, e o próprio gerador de senha inicial (A4). Não há
dado real de criança, mas para um sistema de acolhimento isso entrega o plano da casa a quem
quiser estudar.
*Correção:* tornar privado (só o dono, em *Settings → General → Danger Zone*). Efeito colateral: o
GitHub Pages gratuito não publica de repositório privado; o protótipo passa para outro lugar
(Netlify ou Cloudflare Pages, com senha) ou para o plano pago. **Decisão do dono.**

**A2. No banco, uma sessão de educador vira Coordenação Geral das oito casas.** O papel da
aplicação (`rede_app`) tem UPDATE em **todas** as colunas de `app_user`, inclusive `role` e
`todas_as_casas`, e a política `user_update_self` (`identity/migrations/0010_fundacao.sql:217`)
só confere que a linha é da própria pessoa. Provado em `BEGIN … ROLLBACK`: como a educadora,
`UPDATE app_user SET role='coordenador', todas_as_casas=true` passa, e o banco passa a lhe dar as
8 casas. **Nenhuma rota da API faz isso hoje**: é a segunda camada que falha, não a primeira. Mas
é exatamente o caso que a segunda camada existe para segurar, e no dado que mais importa. O mesmo
papel lê `password_hash` das contas que a política de leitura alcança.
*Correção (migração nova):* `REVOKE UPDATE ON app_user FROM rede_app;` e conceder só
`UPDATE (password_hash, must_change_password, updated_at)`; levar a conferência da senha atual
para uma função `SECURITY DEFINER` e tirar o `SELECT (password_hash)`. Teste que tenta o UPDATE do
cargo como educador e espera a recusa.

**A3. O backup lógico volta sem as permissões, e o ensaio não vê.** `scripts/backup.sh:58` e
`scripts/restaurar.sh:72,146` usam `--no-privileges`: o dump sai sem nenhum GRANT, e as 174
migrações que concedem acesso ao `rede_app` já constam como aplicadas. Depois de restaurar, o
sistema não lê tabela nenhuma. **Provado em 08/11** com os mesmos comandos, num banco descartável:
como dono, `select count(*) from house` devolve 8; como `rede_app`, *permission denied for table
house*. O `restaurar.sh --ensaio` conta linhas **como dono** (a URL de destino nasce da de
origem, que é a do `rede_admin`) e passa. O
caminho físico (base + arquivo contínuo, fase 220) preserva tudo e é o que salva.
*Correção:* tirar o `--no-privileges` (os papéis existem no destino) ou reaplicar os GRANTs depois
da volta; o ensaio confere uma leitura **como `rede_app`**. E dizer no §12.4.1 que o caminho
principal de volta é o físico.

**A4. A porta de entrada é fraca para o que guarda.** Quatro coisas que, juntas, abrem caminho:
- a senha gerada pelo sistema é uma de 7 palavras mais 4 dígitos, sorteada com `Math.random`
  (`identity/staff.service.ts:38`): 63 mil combinações, num formato que está no repositório público;
- o mínimo é 6 caracteres na troca e na senha inicial digitada (`auth.service.ts:125`,
  `staff.service.ts:106`), 8 no convite (`invite.service.ts:171`);
- a troca no primeiro acesso é **só sugerida** pela tela (`frontend/src/App.tsx:519`); o servidor
  não a exige, e a senha inicial pode ficar para sempre;
- a trava de tentativas é **só por e-mail** (`auth.service.ts:28`); não há limite por IP, nem no
  servidor nem no Caddy. Dá para testar a mesma senha comum em todas as contas, e dá para travar
  de propósito, por 15 minutos, a conta de quem está de plantão.
*Correção:* senha gerada com `randomBytes` (12 caracteres ou três palavras de uma lista grande);
mínimo de 10 com lista de senhas comuns; troca obrigatória cobrada no servidor (toda rota
responde 403 até trocar) e senha inicial que vence em 72 horas; limite por IP no Caddy ou no
servidor. A trava por conta continua, com aviso à coordenação quando disparar.

### Médio: resolver antes do ar ou decidir com o DPO

**M1. O ditado aparece em toda caixa de texto longo, inclusive nas restritas.** `ditado.tsx:204`
liga o microfone em todo `textarea` sem `data-sem-ditado`, e só um deles tem a marca. Isso inclui
o motivo na área restrita do Judiciário, o relato, a ocorrência, o atendimento técnico e a saúde
sigilosa. No Chrome o áudio vai ao Google. Foi decisão da Fundação (fase 195), com a pergunta
para o DPO aberta (PARA-A-REUNIAO C4). *Proposta:* até o DPO responder, tirar o ditado das caixas
restritas; é uma marca por campo.

**M2. A foto de celular pode sair com o GPS da casa.** Nada tira o EXIF. A foto grande é
redesenhada no aparelho e perde o EXIF sem querer, mas a que já chega pequena (até 2000 px e
600 KB, `anexos.tsx:52`) vai como veio, o que pode acontecer com foto de galeria já reduzida por
outro aplicativo. E fotos saem da instituição no livro da vida (fase 270). *Correção:* redesenhar toda
imagem no aparelho, ou tirar o EXIF no servidor ao gravar.

**M3. A porta da internet tem duas frestas.** O servidor escuta em todas as interfaces
(`backend/src/main.ts:15`, sem endereço): se a porta 3000 não estiver fechada no firewall, quem
chegar direto fala com a API sem o Caddy, e com `TRUST_PROXY=1` escreve o IP que quiser no log de
acesso. E o Caddyfile não manda CSP, HSTS nem `frame-ancestors` para a **tela**; a API manda, a
tela não. *Correção:* `app.listen(PORT, '127.0.0.1')` por padrão; `TRUST_PROXY=loopback`;
cabeçalhos no bloco `handle` da tela no Caddyfile.

**M4. O sigilo de saúde mora só na aplicação.** O registro sigiloso (fase 287) é escondido pelo
serviço (`semOConteudo`) e pelas funções que leem conteúdo, e isso está bem feito: as funções do
banco que não tratam o sigilo só devolvem contagens ou servem o painel da Enfermagem. Mas a
política de leitura de `health_encounter` e `health_evolution` deixa qualquer pessoa da casa ler
`reason` e `outcome` do registro sigiloso. É a mesma falta de segunda camada do A2.
*Correção:* uma visão ou política que esconde o conteúdo quando `confidential` e o cargo não lê.

**M5. Dezoito políticas de escrita não conferem a casa** (fora as nove que recusam tudo com
`false`, que estão certas). Candidatas, a revisar uma a uma com o subagente de banco:
`work_schedule.ws_write` (coordenação de uma casa grava horário para qualquer casa),
`health_evolution.evo_update` (Enfermagem e Gestor Geral alteram evolução de qualquer casa, sem
conferir o alcance nem na linha de antes; a Fundação já tirou o gestor do cadastro de remédio na
245, e vale perguntar se ele deve alterar evolução), `notification.notif_insert` e `audit_event.audit_insert`
com `true` (a aplicação pode forjar aviso e linha de auditoria para qualquer pessoa),
`medication_administration.adm_update` (confere a linha de antes, não a de depois). A suíte das
duas travas só reprova o `true` literal. São 32 tabelas com UPDATE de todas as colunas e sem
gatilho de guarda.

**M6. Não há prazo de guarda para nada.** Tentativa de entrada com IP, sessão, auditoria, CPF e RG
de visitante: tudo fica para sempre, e não há no código o ponto onde a regra entraria. "Nada se
apaga" vale para o registro da criança; para dado de terceiro e de acesso, a LGPD pede prazo. É
decisão do DPO (PARA-A-REUNIAO C1). Vale também escrever um plano de incidente.

**M7. Os documentos discordam em duas decisões centrais.**
- *Onde roda:* a pauta (`PARA-A-REUNIAO.md:18`) diz "servidor próprio do Pão, decidido em 14/10";
  o plano de 06/11 (`CLAUDE.md`, item 3) diz "servidor alugado e domínio próprio" para o 1.0.
- *Qual IA:* a pauta ainda pergunta pela chave da Anthropic (A8) e diz que o texto vai à Anthropic
  (C3); o item 29 diz "só o computador do Pão (23/10)"; o plano de 06/11 diz "1.0 em modo guia, o
  2.0 com o Claude ou o computador do Pão".
A pauta é o que vai para a mesa com o Marcelo: precisa dizer uma coisa só.

**M8. Nenhum teste rodava no GitHub.** Os 1.481 testes só rodavam quando uma sessão lembrava.
*Feito nesta análise:* `.github/workflows/suite.yml` (os dois `tsc` e `npm test` contra um
PostgreSQL 16, no fuso de Porto Alegre, a cada push). **Rodou no GitHub no primeiro push
(commit `4aeb4af`) e passou inteiro**, em uns 4 minutos.

### O jeito de trabalhar: o que mais pesa no longo prazo

**P1. O CLAUDE.md virou o contrário do que diz ser.** Ele se chama de cartão de entrada e tem uns
56 mil tokens, carregados em toda sessão e em todo subagente que não o pula. Isso gasta o limite
semanal, faz a sessão compactar mais cedo (o que o arquivo existe para evitar) e esconde as regras
no meio de 200 blocos "FEITO". O relato de cada fase já está no §2 do documento.
*Proposta:* umas 200 linhas (quem você é, como trabalhar, antes de entregar, o que nunca se faz,
onde as coisas estão, as lições em uma linha cada, e o estado em dez linhas); o resto para
`docs/historico/`. O subagente `fechador-de-fase` já foi ajustado para **reescrever** o estado em
vez de empilhar. Mudar o CLAUDE.md é mudar a memória do projeto: **com o seu de acordo**.

**P2. "Leia o REDE-ACOLHER.md antes de responder" não se cumpre.** São 598 KB, uns 165 mil
tokens. Nenhuma sessão lê inteiro. *Proposta:* trocar a ordem por "leia o §9 e o §10, e a
seção do assunto pelo índice", e manter o índice no alto.

**P3. O repositório não tem tronco.** O trabalho inteiro está num branch do Claude, que virou o
padrão; o `master` está 325 commits atrás; há um branch com um commit "COMEÇADO E NÃO TERMINADO"
(`fase-127-quem-a-chamada-cobra`) cuja ideia foi refeita depois pela migração 1480.
*Proposta:* levar o branch atual para `main`, tornar `main` o padrão, proteger com a suíte
obrigatória, trabalhar em branch curto por fase, e apagar o branch da 127 depois de conferir.

**P4. Tudo é escrito duas vezes.** O protótipo tem um servidor de mentira de 14,9 mil linhas que
repete as regras do servidor de verdade; cada fase muda os dois, e os ensaios de navegador rodam
contra o de mentira. O padrão `*.regra.ts` reduz o dano, mas o custo cresce a cada fase. E há
telas gigantes (`Acolhidos.tsx`, 7.236 linhas) que só uma sessão com muito contexto consegue mexer.
*Proposta:* depois do 1.0, a demonstração passa a ser uma instância de treino com o banco de
demonstração (`SIM_DUMP`, fase 227), e o protótipo congela: nada novo entra no `mock-casa.ts`.
Dividir as telas grandes por aba, quando forem tocadas.

**P5. O ritmo passou da validação.** São 287 fases em dez semanas e uma avaliação humana. Cada fase
nova é mais coisa para a equipe aprender, para manter e para testar, sem que ninguém da casa
tenha usado as anteriores. O documento diz desde a fase 139 que não falta código para o piloto.
*Proposta:* congelar funcionalidade até o piloto. Só entram consertos, os itens A e M acima, e o
1.0.

**P6. O projeto depende de uma pessoa e de uma IA.** Para ser real: o código num lugar da Fundação
(ou com termo de cessão e licença), a TI do Pão dona do servidor, das senhas e do ensaio mensal de
restauração, um termo de tratamento de dados (quem dá suporte é operador na LGPD), e um contato
para as 3h.

### Baixo

- A dica final do `scripts/preparar-ambiente.sh` mandava rodar `npx jest` sem `--runInBand`, o que
  o CLAUDE.md proíbe. **Corrigido** para `npm test`.
- O hook `jest-em-serie.sh` existia e **não estava ligado** no `settings.json`; e barrava qualquer
  comando com a palavra *jest* (`grep jest`, `echo jest`). **Corrigido e ligado**, conferido em
  nove comandos.
- `APP_BASE_URL` cai em `http://localhost:5173` quando falta (`invite.service.ts:40`): o convite
  sairia com link para lugar nenhum. O `instalar.sh` deveria recusar subir sem ele.
- O login responde mais rápido quando a conta não existe (não roda o scrypt): dá para descobrir
  e-mail cadastrado pelo tempo. Pequeno, mas o conserto é rodar o scrypt sempre.

---

## 5. O que se perdeu ou está pela metade

1. **As três direções visuais da fase 254.** Os CSS de prévia e as fotos ficaram no espaço
   temporário de uma sessão que já não existe, e a página de escolha é um artefato privado da
   conta anterior. Os cinco relatórios da equipe de design estão salvos
   (`docs/historico/equipe-de-design-30-10/`), e o §3 do `2-referencias.md` diz como refazer. A
   Fundação nunca escolheu.
2. **O passo a passo da instalação da IA no computador do Pão (fase 239)**, interrompido duas
   vezes. Hoje, com o 1.0 em modo guia, ele só faz falta no 2.0.
3. **A parte desta conversa entre 00h13 e 00h51 de 08/11**: recuperada pelo que deixou no disco
   (seção 1), não pelo texto.
4. **O branch `fase-127-quem-a-chamada-cobra`**, provavelmente superado (P3).
5. **A rodada com o relógio adiantado das fases 281 a 287**, feita nesta análise: verde.

Não achei decisão da Fundação registrada como tomada e sem código, além das contradições do M7.
A conferência item a item do §10 contra o código é o trabalho do subagente
`auditor-docs-vs-codigo`, e ainda não foi feita (seção 8).

---

## 6. Os subagentes

**Uma coisa honesta primeiro: subagente não economiza limite, gasta mais.** Cada um começa do zero.
O ganho é outro: o trabalho pesado (log de teste, documento de 600 KB, catálogo do banco) fica fora
da conversa principal, que dura mais sem compactar, e o especialista tem um roteiro só dele. Por
isso os de rotina usam o modelo `sonnet`, e quase todos começam **sem o CLAUDE.md**
(`omitClaudeMd: true`), o que poupa uns 56 mil tokens por chamada. Os campos usados foram
conferidos na documentação do Claude Code em 08/11.

Eles moram em `.claude/agents/` e valem para qualquer conta que abrir o repositório. Ninguém faz
commit nem push: quem chama decide.

### Para revisar (sob pedido, só leitura)

| Subagente | Modelo | Para quê | Mudou nesta análise |
|---|---|---|---|
| `banco-de-dados` | opus, com memória | o DBA: revisa migração, função, política e SQL; audita o catálogo num banco à parte, só com `ROLLBACK` | **+4 regras** provadas hoje: coluna que decide acesso, `WITH CHECK` que confere onde, sigilo também no banco, backup que devolve as permissões |
| `auditor-seguranca-lgpd` | opus | senha, sessão, alcance, arquivos, cabeçalhos, segredos, IA, retenção, backup | os achados de hoje entraram como pontos a conferir (A4, M2, M3) |
| `auditor-docs-vs-codigo` | sonnet | o que os documentos dizem contra o que o código faz; o que se perdeu | sem mudança |
| `revisor-de-cuidado` | opus | a coordenadora de quinze anos de casa e o psicólogo: a educadora às 23h, o efeito sobre a criança | sem mudança |
| `implantacao` | sonnet | **novo**: guia a ida ao ar passo a passo e confere o que falta antes de cada passo; nunca faz o deploy | criado |

### Para o dia a dia (depois de cada mudança)

| Subagente | Modelo | Quando | Mudou nesta análise |
|---|---|---|---|
| `guardiao-das-regras` | sonnet | antes de todo commit: o diff contra o §5 e o §6 | duas regras inventadas na parte perdida contradiziam decisões do projeto (o ditado e a hora); viraram *atenção*. Entrou a coluna que decide acesso |
| `verificador` | sonnet | antes de fechar fase: os `tsc`, a suíte nas duas condições e as varreduras; devolve só o que reprovou | tempo medido hoje (3min27s) |
| `ensaios-de-tela` | sonnet | depois de mudar tela: escolhe o ensaio certo e devolve só o que reprovou | sem mudança |
| `fechador-de-fase` | sonnet | fase feita e verificada: §2, Novidades, estado no CLAUDE.md e o texto do commit | passa a começar **sem** o CLAUDE.md e a lê-lo por partes |

### O que roda sozinho, sem ninguém lembrar

- **O hook `jest-em-serie.sh`**, agora ligado: recusa o `jest` em paralelo, que contamina o banco.
- **O workflow `.github/workflows/suite.yml`**: a suíte a cada push. O próximo passo é um segundo
  workflow, noturno, com o relógio adiantado.
- **Uma tarefa agendada semanal** (sugestão, não criada): toda segunda, uma sessão roda o
  `auditor-docs-vs-codigo` e o `verificador` e deixa o resultado numa issue. É o que teria pegado
  o M7 e o branch solto da 127.

### Subagentes dentro do sistema

Se a ideia era pôr subagentes **dentro** do Rede Acolher, para a Acolhe+AI: não agora. O 1.0 sai em
modo guia, sem modelo, e a ida da conversa a um modelo depende do DPO. As "especialidades" que
fariam sentido (o rascunho da ATA, os documentos pela conversa, as palavras que rotulam) já existem
como ferramentas da Acolhe+AI. Repensar quando o 2.0 tiver o modelo decidido.

---

## 7. O que eu faria, em ordem

**Semana 0, a casa em ordem (uma sessão):**
1. Tornar o repositório privado e decidir para onde vai o protótipo (A1).
2. Commitar o que esta análise deixou (subagentes, hook, workflow, este documento), levar o branch
   para `main`, tornar `main` o padrão e exigir a suíte verde (P3, M8).
3. Enxugar o CLAUDE.md, com o seu de acordo (P1, P2).
4. Congelar funcionalidade até o piloto (P5).

**Antes do ar (duas ou três fases, cada uma com o `banco-de-dados` e o `auditor-seguranca-lgpd`
revisando):**
5. A2 (as colunas de `app_user`) e M4/M5 (a segunda camada que falta).
6. A4 (senha gerada, mínimo, troca cobrada, limite por IP).
7. A3 (backup que volta com as permissões, ensaio como `rede_app`).
8. M2 e M3 (EXIF; o Node só no `127.0.0.1`, cabeçalhos da tela no Caddy).
9. Arrumar a pauta (M7) e levar ao Marcelo: onde roda, e-mail, DPO (M1, M6), a folha de remédio.

**O ar (com o `implantacao`, um passo por vez, e só quando você pedir):**
10. A fase 288 (a setinha de trocar de casa) e o 1.0 com a Casa 03, como no plano de 06/11.

**O piloto:**
11. O roteiro com uma pessoa de cada cargo e o teste cronometrado. Daqui para a frente, o que
    entra no sistema sai do que a casa pediu usando, não do que a IA imaginou.

---

## 8. O que esta análise não verificou

- A conferência item a item de cada decisão do §10 e do PARA-A-REUNIAO contra o código (é o
  trabalho do `auditor-docs-vs-codigo`); conferi só as decisões que os documentos contradizem.
- Os ensaios de navegador e a simulação contra o servidor: rodaram até a fase 287 segundo o
  documento, e não rodaram aqui.
- As dezoito políticas do M5 uma a uma: listadas, cinco lidas por inteiro (com o `USING`).
- Se alguma rota chega ao A2 por caminho indireto: procurei UPDATE em `app_user` com coluna vinda
  do corpo e não achei, mas não li as 440 rotas.
- O teste de intrusão de verdade, de fora, com o sistema instalado.
