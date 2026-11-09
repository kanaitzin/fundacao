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

**A2. No banco, uma sessão de educador vira Coordenação Geral das oito casas.** *(Consertado na fase 288,
identity/1679; a revisão do banco achou o mesmo defeito no vínculo de casa, a `uha_insert`, consertado na
1680; e o auditor de segurança achou a mesma escalada pelas funções da Equipe, a própria conta e a conta de
quem atende todas as casas, consertada na 1681 e na 1682; criar conta de Enfermagem pela coordenação ou pela
técnica de uma casa foi decidido pelo dono em 08/11, só o Gestor Geral e a Coordenação Geral, e feito na
fase 289, identity/1683, com a senha de antes encerrada quando a mudança tira a conta do alcance de quem a
administrava; o e-mail herdado e a troca de casa ficaram para o A4.)* O papel da
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

*Feito na fase 291 (08/11), com as decisões do dono:* a regra de 8 caracteres com maiúscula e símbolo
(no lugar do mínimo de 10 com lista de senhas comuns que eu tinha sugerido); a senha inicial sorteada pelo
`node:crypto`; a troca obrigatória cobrada no servidor; a trava pelo endereço, contando contas diferentes;
a trava na senha atual da troca e da reautenticação; o servidor escutando só em `127.0.0.1`. **Ficou para a
292:** a senha nova na troca de casa e o e-mail na promoção. **Para a 293:** a senha conferida no banco (com
ela a `auth_find_user`, o `password_hash` que o `rede_app` lê, o `must_change_password` que a própria conta
apaga pelo SQL, a conta e o registro da tentativa numa função só, e o tempo igual para e-mail com e sem
conta). **Sem fase ainda:** a senha inicial que vence em 72 horas, o aviso à coordenação quando a trava
dispara, o prazo de guarda da `login_attempt` e a guarda `<> 'gestor_geral'` da 1634.

*Acrescentado pela revisão de segurança da fase 288 (`auditor-seguranca-lgpd`), para o conserto do A4:*
- **o que sobrou do A2:** o `rede_app` lê o `password_hash` (a `user_select` deixa a gestão, a coordenação e a
  técnica lerem o da equipe), e a `auth_find_user` (0010), `SECURITY DEFINER`, devolve o hash de QUALQUER e-mail.
  Revogar só a coluna não fecha. O hash é scrypt e o pgcrypto não o confere: os caminhos são um papel próprio da
  entrada (`rede_auth`, só para o `AuthService`, o único que lê o hash e executa `auth_criar_sessao`), trocar para
  o bcrypt do pgcrypto, ou aceitar e escrever. A pessoa ainda pode apagar o próprio `must_change_password` sem
  trocar a senha: uma função que troca a própria senha conferindo a atual fecha os dois;
- **a segunda camada só segura erro de rota, não SQL arbitrário:** a identidade no banco é um parâmetro de sessão,
  e a `auth_criar_sessao` (1190) aceita qualquer usuário. Escrever esse limite no §12;
- **a troca do primeiro acesso cobrada no servidor** pede uma guarda que responda 403 até a troca (deixando a
  troca, o sair e o `users/me`), e a senha inicial que vence pede uma coluna `password_set_at` (o `updated_at`
  muda por outras funções);
- **dá para saber se um e-mail tem conta:** pedir o esqueci e depois chamar `/auth/primeiro-acesso` faz o
  `app_account_has_password` (0700) responder diferente para conta que existe; e o scrypt só roda quando a conta
  existe (o tempo também diz);
- **sem trava** na senha atual da troca (`auth.service.ts`) nem na reautenticação;
- **trocar o cargo não derruba as sessões** nem zera a reautenticação (gravidade baixa: o cargo é relido a cada
  pedido).

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
245, e vale perguntar se ele deve alterar evolução),
`medication_administration.adm_update` (confere a linha de antes, não a de depois). *Corrigido na fase 288:* a primeira
versão desta lista punha aqui o `notification.notif_insert` e o `audit_event.audit_insert`, com `true`; os dois são
exceções escritas de propósito no `CHECK_ABERTO` do `o-banco-com-as-duas-travas` (a auditoria se escreve também sem
identidade, na entrada e na recusa de senha, e o aviso é escrito para outra pessoa, com a leitura conferida no
`notif_select`). Continuam sendo onde uma aplicação comprometida forjaria aviso ou auditoria; se a Fundação quiser
fechar, o caminho é escrever os dois por função do banco, e não fechar a política. E o resto: a suíte das
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

**Semana 0, a casa em ordem (uma sessão):** *(respondido pelo dono em 08/11: o repositório fica
público até o 1.0, o CLAUDE.md fica como está, nada de congelar; o `main` quem cria é o dono, seção 9.5)*
1. Tornar o repositório privado e decidir para onde vai o protótipo (A1).
2. Commitar o que esta análise deixou (subagentes, hook, workflow, este documento), levar o branch
   para `main`, tornar `main` o padrão e exigir a suíte verde (P3, M8).
3. Enxugar o CLAUDE.md, com o seu de acordo (P1, P2).
4. Congelar funcionalidade até o piloto (P5).

**Antes do ar (duas ou três fases, cada uma com o `banco-de-dados` e o `auditor-seguranca-lgpd`
revisando):**
5. A2 (as colunas de `app_user`) e M4/M5 (a segunda camada que falta). *(O A2 está feito nas fases 288
   e 289, seção 9.)*
6. A4 (senha gerada, mínimo, troca cobrada, limite por IP).
7. A3 (backup que volta com as permissões, ensaio como `rede_app`).
8. M2 e M3 (EXIF; o Node só no `127.0.0.1`, cabeçalhos da tela no Caddy).
9. Arrumar a pauta (M7) e levar ao Marcelo: onde roda, e-mail, DPO (M1, M6), a folha de remédio.

**O ar (com o `implantacao`, um passo por vez, e só quando você pedir):**
10. A setinha de trocar de casa e o 1.0 com a Casa 03, como no plano de 06/11. *(A setinha deixou de
    ser a 288: a 288 e a 289 foram o A2.)*

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

---

## 9. O que se fez e se revisou na mesma tarde (fases 288 e 289)

Depois desta análise, o dono escreveu *continue*, e a sessão seguiu a ordem da seção 7: o A2 primeiro.
Ele virou duas fases, porque cada revisão achou o caminho seguinte. Tudo está commitado e enviado ao
branch `claude/work-system-code-ready-0e3hh2` (commits `ef7aea5` e `ee39ff4`). O relato curto de cada
uma está na tabela do §2 do `docs/REDE-ACOLHER.md`, e o estado no *O que fazer agora* do `CLAUDE.md`.

### 9.1 Fase 288: a conta não muda o próprio cargo (identity/1679 a 1682)

**O defeito da análise, provado no banco:** pelo papel da aplicação, uma sessão de educadora escrevia
`role` e `todas_as_casas` na própria linha de `app_user` e virava Coordenação Geral das oito casas.

**O que as revisões acharam ao lado, cada uma provada em `BEGIN` e `ROLLBACK`:**
- **o `banco-de-dados`:** a política `uha_insert` deixava a coordenação da Casa 03 pôr no vínculo da
  casa dela a educadora da Casa 04, que passava a ler as crianças da Casa 03, sem auditoria;
- **o `auditor-seguranca-lgpd`:** a técnica virava Enfermagem pedindo a mudança na própria conta pela
  Equipe (`app_update_staff` não recusava a própria conta); e a coordenação de qualquer casa redefinia a
  senha da Enfermagem e recebia a senha nova (a conferência da casa da 1570 não olhava nada quando a
  conta nunca teve casa);
- **o `banco-de-dados`, sobre o conserto:** a coordenação da Casa 04 ainda vinculava a Enfermagem à
  casa dela e trocava o nome dela, e a lista da Equipe oferecia os botões que o servidor recusava.

**Os consertos:**
- 1679: a aplicação escreve em `app_user` só a troca da própria senha;
- 1680: a aplicação não escreve vínculo de casa nem casa (a `uha_insert` saiu);
- 1681: um gatilho em `app_user` diz quem administra cada conta. Ninguém muda o próprio acesso, e a
  conta de quem atende todas as casas só é alterada por quem também alcança todas;
- 1682: o mesmo gatilho no vínculo, o nome na metade que protege, e o `editavel` da lista com a mesma
  pergunta.

**O teste:** a suíte `a-conta-nao-muda-o-proprio-cargo` pergunta ao catálogo pelo que vale de fato
(`has_column_privilege`) e nega por padrão.

### 9.2 Fase 289: só o Gestor Geral e a Coordenação Geral criam conta que alcança as oito casas (identity/1683)

**A decisão:** a 288 deixou uma pergunta aberta, e o dono respondeu em 08/11: **só o Gestor Geral e a
Coordenação Geral**. Antes, a técnica de uma casa cadastrava uma Enfermagem com o e-mail e a senha que
escolhia e chegava às oito casas.

**O que a primeira versão fez:** o gatilho da 1681 passou a olhar a criação e o cargo de depois, e a
lista de cargos da Equipe tirou a Enfermagem de quem não alcança todas.

**O que as revisões acharam na primeira versão, e foi consertado:**
- **`guardiao-das-regras`:**
  - a lista de cargos copiada no comentário da migração;
  - a Coordenação Geral fora da recusa do protótipo;
  - a instituição vazia contando como *alcança todas*.
- **`banco-de-dados`:**
  - ***alcança todas* era perguntado pelo alcance.** Por isso respondia sim à Enfermagem, ao Líder
    Noturno Geral, a quem não tem identidade e à instituição nula. Hoje a pergunta é pela própria
    conta: Gestor Geral ou Coordenação Geral, ativa, da instituição.
  - **a promoção não trocava a senha.** Provado assim: a técnica emitiu convite para uma educadora,
    o Gestor Geral a passou para Enfermagem, e o convite da técnica ainda entrava na conta.
- **`auditor-seguranca-lgpd`:**
  - **o mesmo pela coordenação.** A técnica sabe a senha de uma educadora, o Gestor Geral a passa
    para coordenação e depois a marca como Coordenação Geral, e a senha da técnica passa a administrar
    as oito casas.
  - **o vínculo de casa ficava aberto** depois da promoção.

**Como ficou:**
- **A senha de antes deixa de valer.** Quando a mudança tira a conta das mãos de algum cargo que a
  administrava, o gatilho encerra a senha, as sessões abertas e os convites pendentes. A função
  `app_estreita_quem_administra` decide quando isso acontece:
  - da casa para todas as casas, inclusive pela marca da Coordenação Geral;
  - de um cargo da casa para a coordenação, que só o Gestor Geral cadastra.
- **A senha nova vai só a quem fez a mudança.** O servidor a redefine na mesma transação e a devolve
  com um aviso; a tela da Equipe já mostrava senha e aviso.
- **Entre cargos que a casa também administra, a senha continua.**
- **Quem passa a atender todas as casas deixa o vínculo da casa.**
- **As duas listas de cargos não podem divergir.** Um teste confere, cargo por cargo, que a lista do
  gatilho é a do alcance (`app_house_in_scope` escreve a lista por extenso); ele reprova quando se tira
  um cargo de uma delas.
- **O protótipo faz as mesmas perguntas** em criar, editar, desativar, reativar, redefinir a senha e
  marcar a Coordenação Geral.
- **Na prática, para o Marcelo:** ao marcar alguém como Coordenação Geral, o Gestor Geral recebe uma
  senha nova para entregar à pessoa.

### 9.3 O que ficou aberto, e para onde foi

**Para o A4** (está no `CLAUDE.md`, no bloco dos consertos):
- **O e-mail herdado.** O e-mail que a casa digitou continua o da conta promovida, e o esqueci minha
  senha e o convite vão a ele. O conserto pede decisão: o Gestor Geral confirmar ou trocar o e-mail na
  promoção, e o esqueci recusado até lá.
- **A troca de casa.** A conta que muda de casa leva a senha que a casa de antes sabia.
- **O vínculo pela rota.** O `app_update_staff` ainda abre vínculo de casa para conta de todas as casas
  quando a rota recebe a casa.
- **O de antes:** a senha gerada por `Math.random` em 63 mil combinações; a troca do primeiro acesso
  que a tela só sugere; a `auth_find_user` que devolve o hash de qualquer e-mail; a guarda
  `<> 'gestor_geral'` da 1634, que deixa passar cargo nulo.

**Para a pauta:** nada novo. A pergunta da Enfermagem foi respondida e saiu do §0 do PARA-A-REUNIAO.

**Anotado, sem conserto:** o teste de ordenação da `trabalho-da-equipe` (*a ordem é por NOME, nunca
por total*) pode reprovar quando roda junto só da `equipe`. Com duas pessoas no recorte, a ordem dos
nomes coincidiu com a dos totais. Na suíte inteira ele passa, e só prova algo com três ou mais pessoas.

### 9.4 Medido no fim da 289

- **Os dois `tsc`:** sem erro.
- **A suíte inteira, nas DUAS condições de relógio:** 1501 de 1501 no relógio real e às 22h30 de
  Porto Alegre.
- **Os números do código:** 223 migrações, 153 tabelas, 172 suítes, 1493 linhas de teste contadas pelo
  `numeros-da-documentacao`.
- **Os testes novos reprovam sem o conserto:** sem a 1683 e com a versão que só olhava o cargo.
- **As sondas no protótipo a 390 px:** a técnica e a coordenação da Casa 03 sem a Enfermagem na lista
  de cargos, o gestor com ela, e a senha nova mostrada na promoção; nenhum erro de página.
- **Não rodou:** os ensaios grandes de navegador (`ensaio:uso`, celular, acessibilidade) e a simulação
  contra o servidor. Só a lista de cargos e o aviso da Equipe mudaram na tela.

### 9.5 Para a outra conta continuar

**1. O que fica no repositório.** Tudo o que esta conta fez está no repositório. Na conta, nada fica:
nem memória, nem rascunho que importe.

**2. Os passos para começar:**
- conecte o GitHub;
- instale o app do Claude no `kanaitzin/fundacao`;
- abra a sessão no branch `claude/work-system-code-ready-0e3hh2` (ou no `main`, se o dono já o tiver
  criado);
- escreva *continue*.

**3. O que a sessão nova lê.** O `CLAUDE.md` diz onde estamos. A próxima fase é a **291, o A4** (a 290, o A3, foi feita aqui na mesma noite).

**4. Se a sessão nova não conseguir empurrar para este branch.** O proxy de cada sessão só deixa
empurrar para branches `claude/...`, e talvez só para o da própria sessão. Nesse caso ela empurra para
o branch dela, e o dono junta no `main`.

**5. O aviso do `banco-de-dados` para o A3, seguido na 290.** O conserto do backup NÃO pode reaplicar
as permissões com um `GRANT ... ON ALL TABLES` depois de restaurar: isso desfaz a 1679 e a 1680 sem
aviso. O caminho é tirar o `--no-privileges` do backup. E o ensaio da restauração precisa conferir como
`rede_app`, não como dono.

**O mapa da 290, levantado em 08/11 antes do código.** *(A 290 foi feita na mesma noite, nesta conta, a pedido do dono, e foi além deste mapa: o `--no-privileges` saiu dos três lugares; o que protege o banco virou uma lista (`scripts/o-que-protege-o-banco.sql`) que o backup grava e as duas restaurações comparam; e o papel da aplicação é conferido. O relato está no §2 do documento, linha 290. O que vem agora é o A4, a 291.)*
- **Onde as permissões se perdem:** o `scripts/backup.sh`, na linha 58, faz o dump com `--no-privileges`.
  O `scripts/restaurar.sh` restaura com `--no-owner --no-privileges` em dois lugares: no `--ensaio`
  (linha 72) e na restauração de verdade (linha 146). Com isso somem todos os GRANT ao `rede_app`,
  inclusive o GRANT por coluna da 1679, e a aplicação recebe *permission denied*.
- **O conserto provável:** tirar o `--no-privileges` dos três lugares e manter o `--no-owner`. Os
  GRANT citam o `rede_app` pelo nome, e o destino sempre tem esse papel. Antes de confiar nisso,
  conferir num destino sem o papel: o `pg_restore` avisa e segue.
- **O ensaio de hoje é cego para o defeito:** a conferência conta as linhas como dono (a função
  `conta` sobre `$DESTINO`, linhas 77 a 90), e o dono enxerga tudo. A 290 precisa conferir no
  destino:
  - que o `rede_app` lê (`SET ROLE rede_app` e uma identidade de gestor);
  - que `has_column_privilege('rede_app','app_user','role','UPDATE')` continua falso;
  - que `password_hash` continua com UPDATE;
  - que o `rede_app` continua sem escrita em `user_house_assignment` (a 1680).
- **O teste que reprova sem o conserto:** um teste na suíte, ou no `npm run` que já chama o
  `restaurar.sh --ensaio` (o `package.json` e o `a-saude-da-implantacao.e2e.spec.ts` citam os scripts).
- **Fica como está:** o `restaurar-ponto-no-tempo.sh`. Ele é cópia física do banco e leva as
  permissões junto.
- **Revisão:** o `banco-de-dados` e o `auditor-seguranca-lgpd`, como em toda fase do bloco.
- **A situação no GitHub em 08/11, às 18h55:** a suíte do GitHub passou nos três commits da tarde, e
  a do último commit ainda rodava.

**6. Os passos que só o dono faz, no GitHub:**
- criar o `main` a partir deste branch;
- torná-lo o padrão;
- conferir em *Settings → Environments → github-pages* que o `main` pode publicar;
- apagar o `fase-127-quem-a-chamada-cobra` (e, se quiser, o `master`).

**7. A memória do `banco-de-dados`.** Está em `.claude/agent-memory/banco-de-dados/MEMORY.md` e vai
junto com o repositório. Duas notas de 08/11 descrevem defeitos da primeira versão da 1683, que já
foram consertados na versão commitada.
