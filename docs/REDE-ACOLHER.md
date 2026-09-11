# REDE ACOLHER — documento único

**Este é o único documento que precisa ser lido para retomar o projeto.** Quem
ler daqui até o fim sabe o que o sistema é, como rodá-lo, como ele é feito por
dentro, o que já funciona, o que falta, o que não pode ser feito e quais
decisões estão paradas esperando gente — sem precisar de nenhuma conversa
anterior e sem abrir mais nenhum arquivo.

*Escrito em 09/09/2026. Substitui `RETOMAR-AQUI.md`, `PROMPT-MESTRE.md`,
`CONTINUIDADE.md`, `backlog.md`, `o-que-falta.md`, `pendencias-institucionais.md`,
`arquitetura.md`, `arquitetura-modular.md`, `design-system.md`,
`matriz-permissoes.md`, `riscos-premissas.md`, `piloto-casa-03.md`,
`formularios-reais.md`, `implantacao.md`, `implantacao-smtp.md` e os quatro ADRs
— todos preservados em `docs/historico/`, nada foi apagado. Por que um só: eram
dezesseis arquivos narrando a mesma história em datas diferentes, e três deles
já discordavam entre si sobre fatos verificáveis. Quem retomava o projeto
começava escolhendo em qual acreditar.*

**Continuam fora deste arquivo, de propósito, e são só dois:**

| Arquivo | Por que sobreviveu |
|---|---|
| `der.md` | as 107 tabelas com o que cada coluna guarda. É referência de dado, não narrativa, e o `documentacao.spec.ts` cobra que toda tabela apareça lá |
| `roteiro-marcelo.md` (+ `.docx`) | é entregue à Casa 03, escrito para quem não conhece o sistema. O `.docx` é GERADO do `.md` por `scripts/roteiro-em-word.mjs` — não editar o Word à mão |

---

## SUMÁRIO

1. [O que é, e para quem](#1-o-que-é-e-para-quem)
2. [O estado hoje — os números que saem do código](#2-o-estado-hoje)
3. [Como rodar](#3-como-rodar)
4. [Arquitetura](#4-arquitetura)
5. [As regras que não se negociam](#5-as-regras-que-não-se-negociam)
6. [As regras que nasceram de defeito](#6-as-regras-que-nasceram-de-defeito)
7. [Quem alcança o quê](#7-quem-alcança-o-quê)
8. [O que o sistema faz hoje](#8-o-que-o-sistema-faz-hoje)
9. [O que falta](#9-o-que-falta)
10. [As decisões que são do Marcelo](#10-as-decisões-que-são-do-marcelo)
10.5 [A fila do Marcelo — pedidos de 09/09](#105-a-fila-do-marcelo--o-que-ele-pediu-em-09092026)
11. [O que depende da Fundação](#11-o-que-depende-da-fundação)
12. [Implantação](#12-implantação)
13. [O piloto da Casa 03](#13-o-piloto-da-casa-03)
14. [Como começar uma conversa nova](#14-como-começar-uma-conversa-nova)

---

## 1. O QUE É, E PARA QUEM

**Rede Acolher** é o sistema interno de gestão do programa de acolhimento
institucional da **Fundação O Pão dos Pobres de Santo Antônio**, em Porto
Alegre. Oito unidades, cerca de vinte crianças e adolescentes em cada uma.

- **Casa 03 (código AI3)** é a unidade-piloto.
- **Marcelo Barbosa** (`mbarbosa@paodospobres.com.br`) é o contato da
  instituição, e é ele quem abre e usa o protótipo.
- O objetivo desta fase é um **protótipo que o Marcelo abre e usa**, com dados
  fictícios, para a instituição decidir o que entra antes do piloto.

**O critério que decide qualquer dúvida de produto é sempre o mesmo:**

> *A educadora de plantão, às 23h, com uma criança chorando do lado, consegue
> fazer isso?*

Elegância que atrapalha o turno não serve. Quando dois caminhos são
defensáveis, ganha o que a pessoa cansada consegue usar.

### Os cargos

Educador social · Líder Diurno · Equipe técnica · Coordenação · Enfermagem ·
Líder Noturno Geral · Gestor Geral.

**A Cozinha existe no banco e está oculta** desde 09/09/2026: a Fundação
decidiu que ela não entra no sistema por enquanto, e a casa entrega as folhas em
papel. O cargo não foi apagado — ocultar é reversível numa linha; apagar
exigiria migração destrutiva e levaria o histórico junto.

Cada um enxerga um recorte diferente, e o recorte é aplicado **duas vezes**: na
aplicação e no banco. §7 tem a matriz inteira.

---

## 2. O ESTADO HOJE

**Fases 0 a 93.** Estes números **saem do código**, não da memória — e são
cobrados por `test/numeros-da-documentacao.spec.ts`, que existe porque em 08/09
seis afirmações estavam erradas ao mesmo tempo em três documentos, e duas delas
discordavam entre si.

| Quanto | De onde sai |
|---|---|
| **17 partições** isoladas | pastas em `backend/src/modules/` |
| **99 migrações** | `.sql` dentro das partições |
| **107 tabelas** | `CREATE TABLE` nas migrações |
| **66 suítes** | `backend/test/*.spec.ts` |
| **641 testes** | `it(` / `test(` nas suítes |
| **33 telas React** | `frontend/src/screens/*.tsx` |
| **14 rotas sem porta** de tela | lista de exceções do `rotas-sem-porta.spec.ts` |
| **6 ensaios de navegador** | scripts `ensaio*` do `frontend/package.json` |
| protótipo com **≈1016 KB** | `prototipo/rede-acolher-prototipo.html` |

*A frase importa: o conferidor lê o NÚMERO colado ao substantivo. Escrever
"Telas React … 31" numa coluna separada faz o teste passar sem conferir nada —
foi assim que "30 telas" sobreviveu à fase que existiu para acabar com isso.*

**Medidos rodando, e por isso fora do conferidor:**

| Ensaio | Resultado |
|---|---|
| `npm run ensaio` | 123 telas nos **sete** cargos oferecidos — Coordenação 26, Técnica 23, Gestor 23, Líder Diurno 15, Líder Noturno 14, Educador 13, Enfermagem 9. A Cozinha saiu do seletor em 09/09: o cargo continua no banco, oculto |
| `npm run ensaio:acessibilidade` | 130 telas, **nenhuma violação de WCAG 2.1 AA** |
| `npm run ensaio:roteiro` | 44 tarefas do roteiro, **todas com porta no cargo certo** |
| `npm run ensaio:uso` | 149 cobranças em 13 blocos, **todas passando** — e todos os cargos completando o percurso |

### A última verificação inteira

**11/09/2026, fase 93.** `tsc` limpo nos dois lados. A suíte **duas rodadas
inteiras**: uma às 20h22 de Porto Alegre, no relógio real, e outra com banco e
processo sob `faketime +3h` — 23h24, com o UTC já em 12/09 —, 66 suítes e 641
testes nas duas. Os **seis** ensaios de navegador, verdes com o protótipo
reconstruído: 123 telas, 130 sem violação de acessibilidade, fila, folhas, as 44
tarefas do roteiro e o `ensaio:uso`. O `ensaio:producao` aplicou as 99 migrações
pelo binário num banco virgem; o `ensaio:restauracao` rodou com credencial
fictícia no cofre, abrindo com a chave certa e reprovando com a errada. Dois
builds seguidos do protótipo saíram idênticos.

*Como na 92, a fase foi percorrida por uma sonda como pessoa: a coordenação
desliga a escola com motivo, o educador lê o campo desligado no perfil, a
técnica continua vendo, e a coordenação religa. Foi essa sonda que achou duas
coisas que nenhum ensaio veria — a aba com nome diferente da área, que fazia a
tela nova cair calada na primeira tela do cargo, e a recusa do servidor
aparecendo ATRÁS da folha aberta, onde ninguém lê.*

*Dois cuidados que as rodadas ensinam: o `pg_ctl start` sob `faketime` trava
esperando o arranque — use `-W` e confira com `pg_isready`; e processo em
segundo plano não sobrevive entre chamadas do ambiente.*

*Contagem que só cresce não é dado. O que vale é a **data** e a **condição** da
última verificação. Quando a próxima fase terminar, esta seção é reescrita, não
acrescida.*

### Como retomar, em três linhas

Anexe **este arquivo** e o **`rede-acolher-atualizado.zip`**, e cole o bloco do
§14 como primeira mensagem. Rode `bash scripts/preparar-ambiente.sh`. Leia os
**achados de passagem** da §9 — são o trabalho que ficou anotado — e depois a
**§10.5**, que é a fila viva. O resto deste documento é referência.

### O que cada bloco de fases entregou

Sem fase a fase — isso está no `historico/backlog.md` para quem precisar da
arqueologia.

| Bloco | O que passou a existir |
|---|---|
| 0–10 | A fundação: identidade, casas, perfil do acolhido, rotina, plantão, medicamentos, ATA, ocorrências, relatórios, arquivo documental |
| 40–45 | As portas que faltavam para regras que o servidor já cumpria; o painel das unidades; o limite da casa; os aparelhos institucionais; o ensaio de navegador virou suíte |
| 46–51 | A fila local do aparelho; as folhas em Word saindo do servidor; backup com restauração provada; acessibilidade conferida; o ensaio de carga com um ano da Fundação |
| 52–57 | Cadastro com filiação, RG, CNS, foto e contatos; a internação hospitalar inteira; o `ensaio:uso`, que aperta os botões e **lê de volta o que ficou gravado** |
| 58–62 | O trabalho social das oito casas; trajetória por criança; relatório em Word; o conferidor de rotas sem porta |
| 63–71 | Sete fases de robustez, **todas achando defeito real**: o sistema sobe compilado; recusa subir com o RLS desligado; dois anexos entravam e não saíam; duas políticas perguntavam caro antes de barato; as mensagens de erro passaram a falar português; os números dos documentos pararam de envelhecer |
| 72–74 | As três respostas da Fundação viraram código: quem dá o remédio; a escala de plantão por data; a ATA que a próxima equipe lê |
| 75 | **Caça a defeito, sem construir nada novo.** Sete achados — o principal: a dose chegava ao educador **sem botão** |
| 76–86 | **A fila do Marcelo** (§10.5): desmarcar ocorrência, hora de sair e endereço, cor por categoria e por pessoa, cobrança de relato, experiência familiar, sair sozinho, a cozinha inteira, estoque com nota e receita, e o remédio que vai com a criança |
| 87 | **Destravar.** Dois dos seis ensaios estavam vermelhos desde a fase 83 e ninguém tinha visto; cinco das nove entregas de 09/09 estavam invisíveis no protótipo; o roteiro do Marcelo não conhecia nenhuma delas. Nada de novo foi construído — o que existia passou a ser alcançável, e a §6.19 é a regra que sobrou |
| 88 | **O retorno da visita ecoa** (§10.5, item 3): quem voltou, quem saiu e quem continua fora, na Passagem e na ATA, de uma função só. O que ela trouxe de casa virou campo; "se houve alteração" não — e está escrito por quê |
| 89 | **Fechar as pontas da 88.** A verificação que faltava achou quatro coisas que o verde escondia: dois retornos simultâneos sobrescreviam o primeiro (1080); o bloco novo nunca tinha sido desenhado nos ensaios, porque o servidor de mentira nascia sem convivência; o roteiro mandava ler um retorno que nenhuma tarefa registrava; e o vínculo aparecia como código cru. Mais uma pergunta do roteiro que tinha deixado de existir |
| 90 | **Uma decisão só.** As quatro funções que a 89 deixou anotadas, provadas reprovando com o estrago lido do banco — a criança morando no destino com o pedido dizendo "recusado"; a ATA Geral com o fechamento do segundo aparelho; o combinado revogado com um histórico que diz cumprido — e consertadas (1090, 1100, 1110). A corrida virou ajudante de teste, e a varredura virou conferência permanente no `arquitetura.spec.ts` |
| 91 | **O mesmo desenho, no TypeScript.** A varredura dos serviços achou uma ocorrência real: a Enfermagem assinando enquanto o Gestor devolvia, e a evolução ASSINADA voltava a "complemento solicitado" com duas triagens gravadas. Provado pela rota, com uma segunda forma da corrida (`corridaPorHttp`), e consertado. A conferência do `arquitetura.spec.ts` passou a ler os serviços também, com as exceções escritas por extenso. E o §9 deixou de dizer que ninguém de fora tinha usado o protótipo — já usaram, e é daí que veio a fila de 09/09 |
| 92 | **A portaria.** O primeiro item da fila de 09/09: quem pode visitar cada criança, marcado no contato pela técnica ou pela coordenação — estar no cadastro não é estar autorizado —, com CPF e foto 3×4, e a folha em Word, em paisagem, para a guarita. No caminho, um defeito que o protótipo escondia: **contra o servidor real, a seção de contatos do perfil saía vazia**, e com ela o botão da experiência familiar |
| 93 | **O que o plantão vê no perfil.** O segundo item da fila de 09/09: a coordenação liga e desliga, na própria casa, campos do perfil para o educador — sobre uma **lista fechada no código e no banco**, que é o que impede isso de virar a tela de alcance de cargo recusada em 27/08. Padrão ligado; desligar pede motivo; e o campo desligado continua aparecendo para o educador **como desligado, com o motivo** |

---

## 3. COMO RODAR

### Primeiro, o preparo

**O script não instala o PostgreSQL.** Numa máquina nova ele avisa e segue, e a
suíte morre com erro de conexão. Instale o 16 antes (`apt-get install -y
postgresql-16 faketime` — o `faketime` é o da rodada depois das 21h). Se o `apt`
recusar por causa de um repositório de terceiro que responde 403, tire esse
repositório do caminho: é do ambiente, não do projeto. **E o banco não
sobrevive entre rodadas do ambiente:** rode o preparo de novo antes de cada
bateria.

Três coisas caem entre uma sessão e outra: as dependências (que vêm de
`npm ci` **na raiz**, porque é um workspace), o PostgreSQL (que não é serviço e
para sozinho) e o Chromium dos ensaios.

```bash
bash scripts/preparar-ambiente.sh
# ou, para já exportar as variáveis:
eval "$(bash scripts/preparar-ambiente.sh --exportar)"
```

**Se o Chromium não baixar**, o preparo avisa e segue: a suíte e o `tsc` rodam
sem ele, só os ensaios ficam de fora. O caminho normal do Playwright busca o
binário no CDN dele, que em ambiente com saída restrita responde `403` e falha
**calado**. O script tenta o CDN e, se não passar, traz o Chromium de dentro de
um pacote npm. Liberar `cdn.playwright.dev` dispensa o contorno.

### Depois

```bash
# tipos — obrigatório antes de qualquer entrega
cd backend  && npx tsc --noEmit -p tsconfig.json
cd frontend && npx tsc --noEmit

# a suíte (precisa de PostgreSQL 16 rodando)
cd backend && npx jest

# o protótipo: um arquivo .html, sem servidor, sem banco
cd frontend && npm run prototipo
# sai em prototipo/rede-acolher-prototipo.html
```

O `globalSetup` do Jest derruba e recria o schema a cada rodada, roda as 99
migrações em ordem e aplica os seeds (`seed.ts`, `seed-fase2.ts`, `seed-fase4.ts`).

### Os ensaios — e por que cada um existe

`tsc` diz que compila. Nunca disse que renderiza.

| Comando | O que ele faz |
|---|---|
| `npm run ensaio` | percorre as 123 telas dos sete cargos oferecidos num navegador de verdade, cobrando que nenhuma deixe erro no console, que escreva alguma coisa e que não mostre `undefined` para quem lê. **Tela nova entra neste percurso.** |
| `npm run ensaio:fila` | corta o sinal, marca a chamada, fecha e abre o aplicativo, religa, e confere que **só o que o servidor confirmou** saiu do aparelho |
| `npm run ensaio:folhas` | os caminhos de documento até o arquivo baixar: abre a folha, tenta baixar com finalidade curta demais, baixa com frase válida, confere que o `.docx` chegou |
| `npm run ensaio:roteiro` | cobra que as 44 tarefas do roteiro do Marcelo tenham porta no cargo certo. Não simula a procura de uma pessoa — mas impede o fracasso barato: a tarefa não ter porta, e isso aparecer diante da equipe |
| `npm run ensaio:acessibilidade` | axe-core (WCAG 2.1 AA) nas 130 telas — sete a mais que o `ensaio` porque confere também a folha do "Mais" de cada cargo, aberta dezenas de vezes por turno. **Cor nova passa por ele antes de entrar** |
| `npm run ensaio:uso` | percorre os **sete** cargos **apertando os botões até o fim** — chamada, exceção, passagem, armário, cofre, internação, diário, pedido de lanche — e **lê de volta o que ficou gravado**. É o que pega o defeito que a tela não denuncia: a folha abriu, o botão salvou, e só o número estava errado. *Dizia "oito" aqui, e o roteiro dele também: era a Cozinha, que saiu do seletor na fase 83 — e por isso ele morria no meio* |

**Fora do navegador:**

| Comando | O que ele prova |
|---|---|
| `npm run ensaio:producao` | que o sistema sobe **compilado** num banco virgem, com as migrações aplicadas pelo binário. O projeto passou 62 fases sem nunca rodar assim |
| `npm run ensaio:restauracao` | o ciclo inteiro num banco descartável: backup, restaura, confere as contagens e **abre o cofre com a chave do ambiente** |
| `npx tsx backend/scripts/ensaio-carga.ts` | escreve doze meses da Fundação inteira e mede as rotas com RLS. Foi ele que achou as três telas mais abertas respondendo em 8,5 s |

### Contas do ambiente de teste

Senha `senha-dev-123`, todas `@paodospobres.dev`:

`coord.ai3` · `coord.ai4` · `educador.ai3` · `educador2.ai3` · `educador.ai4` ·
`lider.ai3` · `lider.noturno` · `tecnica.ai3` · `enfermagem` · `cozinha.ai3` ·
`gestor`

*A `cozinha.ai3` entrou em 09/09/2026: o cargo existia desde a migração 0010,
com tela, alcance e rota própria, e **nenhum usuário do seed o tinha**. O teste
do relatório da cozinha rodava com o token da coordenação.*

No protótipo entra-se com `coord.ai3@paodospobres.dev` e troca-se de função pelo
seletor **"Ver como"** no alto da tela.

---

## 4. ARQUITETURA

### 4.1 As quatro decisões de fundação

| Decisão | Por quê |
|---|---|
| **Monólito modular** NestJS + PostgreSQL, não microsserviços | 8 casas, ~160 acolhidos, dezenas de usuários simultâneos. Microsserviço prematuro é proibido pela regra 3 |
| **Sessões opacas no banco**, não JWT | o sistema precisa **revogar** sessão (aparelho perdido, desligamento, incidente). JWT stateless não revoga sem lista de bloqueio, que reintroduz o estado que o JWT evitaria |
| **scrypt** (nativo do Node) para senha, não Argon2id | Argon2id é melhor, mas exige dependência nativa compilada por plataforma — e isso fragiliza a implantação numa infra simples, que é a que a Fundação tem |
| **SQL explícito + RLS**, não ORM | autorizar no banco exige raciocinar sobre políticas, `SET LOCAL` e transações. ORM esconde o SQL e torna isso impossível de auditar |

### 4.2 O repositório

```
rede-acolher/
├── backend/
│   ├── src/
│   │   ├── kernel/        infraestrutura compartilhada (NÃO é domínio)
│   │   │   ├── contracts.ts    o vocabulário comum: AuthenticatedUser, TimelineEvent…
│   │   │   ├── database/       acesso ao banco com identidade aplicada (RLS)
│   │   │   ├── audit/          auditoria append-only
│   │   │   ├── events/         barramento + registro da linha do tempo
│   │   │   ├── documentos/     o contrato da folha e o gerador de .docx
│   │   │   └── common/         CPF, criptografia, segredo, fuso da instituição
│   │   └── modules/       17 partições, cada uma dona das próprias migrações
│   ├── test/              66 suítes (e2e contra PostgreSQL real + estáticas)
│   ├── scripts/           ensaio-carga.ts, migrador compilado
│   └── assets/timbre.png  a marca da Fundação, usada no documento em Word
├── frontend/
│   ├── src/
│   │   ├── screens/       33 telas React
│   │   ├── mock.ts        o "servidor de mentira" do protótipo
│   │   ├── docx.ts        monta o .docx NO NAVEGADOR — só para o protótipo, que
│   │   │                  roda sem servidor. No sistema real quem gera é o
│   │   │                  kernel, e é ele que registra a saída
│   │   ├── documentos.tsx pré-visualização em folha + downloads por setor
│   │   ├── api.ts         cliente HTTP, ErroApi, SemConexao e a porta da fila
│   │   ├── fila-offline.ts a fila local do aparelho (IndexedDB)
│   │   ├── App.tsx        navegação, abas, seletor de cargo do protótipo
│   │   └── styles.css     design system, tema claro e escuro
│   └── ensaio*.mjs        os seis ensaios de navegador
├── scripts/               preparar-ambiente.sh, backup.sh, restaurar.sh,
│                          ensaio-producao.sh, roteiro-em-word.mjs
├── prototipo/             rede-acolher-prototipo.html ← o que o Marcelo abre
└── docs/                  este arquivo, der.md, roteiro-marcelo, historico/
```

**As 17 partições:** activities, alignments, archive, checks, houses, identity,
incidents, medications, notifications, nursing, people, reports, routine,
shifts, statements, sync, timeline.

### 4.3 As quatro regras de fronteira

Cada módulo tem sempre três coisas: `index.ts` (a **porta pública**, único
caminho de entrada), `module.json` (manifesto com `depends` e tabelas) e
`migrations/*.sql` (o esquema **mora dentro do módulo**).

1. Um módulo importa do `kernel` ou da **porta pública** de outro — nunca de um
   arquivo interno alheio.
2. Só importa quem declarou em `depends`.
3. O `kernel` não importa módulo nenhum (a base não depende do topo).
4. Sem ciclos.

Nada disso é promessa: `test/arquitetura.spec.ts` lê os imports de todo arquivo
e falha o build se alguma regra cair.

**O que ele NÃO lê: SQL.** As migrações de uma partição podem ler tabelas de
outra sem declarar em `depends`, e isso já acontece: `shifts` declara depender
de `identity` e `sync`, e a 0310 lê `house_stay`, a 0940 lê a prescrição e a
dose, e a 1070 lê `family_stay`, `person` e `person_contact`. Remover `people`
ou `medications` quebraria migrações de `shifts` — o "removível" abaixo vale
para as partições que foram de fato removidas na prova, não para todas. Achado
na fase 89; não consertado.

**Remover um módulo:** apagar a linha do `import` e do array `imports` em
`src/app.module.ts`, apagar a pasta, rodar `npm test`. O teste de fronteiras
aponta qualquer resíduo. Isso foi verificado na prática duas vezes — removendo
`checks` e depois `incidents`, o sistema compila, sobe e a tela do educador
segue viva.

### 4.4 A linha do tempo não conhece ninguém

A linha do tempo é onde tudo se encontra, e por isso seria o pior lugar para
concentrar dependências: se importasse atividades, chamadas, medicamentos e
ocorrências, remover qualquer um quebraria a tela mais usada do plantão.

Em vez disso cada módulo **se registra** no `TimelineRegistry` do kernel,
entregando eventos num formato comum (`TimelineEvent`). Consequências:

- acrescentar um domínio à linha do tempo = escrever um provedor. Nenhuma linha
  da timeline muda;
- um provedor com defeito **não derruba a tela**: seus eventos ficam de fora e a
  resposta traz `incompleta: true` com a fonte que falhou. Plantão com linha
  incompleta e **sinalizada** é melhor do que tela em branco — ou, pior, uma que
  parece completa e não está.

O detalhe que fez isso funcionar: `ata_episode.incident_id` **não é chave
estrangeira**. O episódio aponta para a ocorrência sem depender dela para
existir; do contrário, remover `incidents` levaria a ATA junto.

**Os níveis de escalonamento são dados, não código:** quem recebe cada aviso
mora em `escalation_level`. Um nível desconhecido **falha** em vez de escalonar
para ninguém — antes, um erro de digitação viraria um aviso que nunca chegava,
em silêncio.

### 4.5 Autorização em duas camadas

A regra de negócio na aplicação **e** o RLS no banco, via
`DatabaseService.asUser()`, que fixa `app.user_id` por transação.

O sistema roda como `rede_app`, que **não** é superusuário — o RLS não se aplica
a superusuário, e um serviço conectado como `rede_admin` enxerga as oito casas
sem que nenhuma política reclame. Desde a fase 64 o serviço confere isso ao
subir e **recusa arrancar** se a conexão passar por cima das políticas.

Fora de escopo devolve **404 idêntico a inexistente**: negar de um jeito
diferente vazaria a existência do registro.

### 4.6 O fuso

`hojeNaInstituicao()` / `janelaDeConsulta()` no TypeScript; `app_hoje()` /
`app_fuso()` no SQL. **Nunca `new Date()` cru para decidir dia, nunca
`current_date` em migração.** Depois das 21h em Porto Alegre o UTC já virou, e
o sistema passa a datar hoje como amanhã — foi assim que uma autorização de
medicamento escrita à noite nascia vencida e o sistema recusava a dose a noite
inteira, com a autorização visível na tela.

### 4.7 O aparelho sem sinal

**Fila local em IndexedDB.** A operação feita sem internet fica guardada com o
horário do ato, sobrevive ao aplicativo fechar, sobe sozinha ao reconectar, e
**só sai do aparelho o que o servidor confirmou ter aplicado**. O que ele
recusou fica, com o motivo dele ao lado. O selo no cabeçalho diz quanta coisa
está guardada, e a folha separa o que sobe sozinho do que parou esperando gente.

**Confirmação de dose fica de fora, em aparelho nenhum.** O sistema roda no
celular de cada pessoa: não existe mais o aparelho único da casa que impedia a
mesma dose de ser confirmada em dois lugares. A recusa vem **na hora**, com a
frase — em vez de guardar e devolver rejeitado horas depois. O resto do turno
continua offline.

### 4.8 Os documentos em Word

O contrato da folha vive em `kernel/documentos/folha.ts` e o gerador de `.docx`
em `kernel/documentos/documentos.service.ts`; cada partição monta a folha do
documento que é dela. Dez rotas: `GET .../folha` (ver, **sem registrar**) e
`POST .../export` (finalidade obrigatória, **saída registrada**).

Ver não é exportar: quem lê o relatório na tela já podia lê-lo na tela. Tirar o
documento do sistema é outro ato, e tem nome de quem tirou e para quê.

A folha da tela e o `.docx` saem da **mesma estrutura** — duas versões
divergiriam no primeiro ajuste, e a pessoa conferiria uma coisa e entregaria
outra. A4, margens ABNT de 3 cm, Times 12, entrelinha 1,5, timbre do Pão dos
Pobres.

`frontend/src/docx.ts` continua no repositório por uma razão só — o protótipo
roda sem servidor —, mas deixou de declarar o contrato: ele importa o do kernel.

### 4.9 O design system

A fonte da verdade visual é `frontend/src/styles.css`. O protótipo usa os mesmos
tokens.

**O princípio, que é a regra 7:** cor comunica **estado operacional** e
**categoria de atividade** — nunca julgamento, ranking ou pontuação sobre a
pessoa. Um chip vermelho significa "exige ação agora", jamais "criança
problemática".

**Nada depende apenas de cor.** Todo estado traz rótulo textual; a cor por autor
na ATA vem sempre com o nome escrito ao lado, porque cor não sobrevive à
impressão em preto e branco nem ao daltonismo.

**Dois canais na linha do tempo.** A **categoria** pinta a borda esquerda do
evento; o **estado** continua na pílula. São duas perguntas diferentes — "isto
é o quê" e "isto ainda exige alguma coisa de mim" — e quem faz a segunda às 23h
não pode ter de desempatar um matiz só. As oito categorias (Saúde, Medicamento,
Educação, Lazer e atividade, Alimentação, Saída, Ocorrência, Rotina da casa)
reaproveitam a paleta viva: nenhum matiz novo, porque cor inventada para uma
tela só é cor que ninguém volta a conferir. Cada evento traz o nome da
categoria **escrito** abaixo do título, e a legenda mostra só as categorias que
aquele dia tem — legenda fixa de oito itens ensina a ignorá-la. Categoria
desconhecida cai em "Rotina da casa", nunca em branco: borda sem cor no meio de
uma lista colorida lê-se como "esta não importa".

**A cor de cada pessoa é escolhida, e não repete na casa.** Antes saía de um
hash do id sobre seis tons — e hash colide: dois educadores do mesmo plantão
podiam receber o mesmo, e a cor deixava de distinguir exatamente onde
precisava. Agora a equipe técnica ou a coordenação escolhe, entre os oito tons
da paleta, e o servidor recusa repetir **dizendo de quem a cor é** ("já em uso"
obrigaria a tentar uma por uma). Quem escolhe não é a própria pessoa: se cada
um escolhesse a sua, o primeiro a entrar levaria o azul e a distinção viraria
ordem de chegada. A unicidade é **por casa** — oito casas dividindo oito tons
deixariam sete pessoas sem cor. Sem escolha, cai no tom automático de antes. E
a cor **não é proteção**: ela não impede ninguém de usar a conta de outro, quem
faz isso é a sessão.

**A tinta institucional**, extraída do logo da Fundação:

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--navy` | `#003262` | `#0A1B2C` | cabeçalho institucional |
| `--brand` / `--brand-solid` | `#005993` | `#7BC0EC` | ação primária, links, destaque |
| `--brand-soft` | `#E2EFF9` | `#152C41` | fundo de ação secundária |

**A paleta viva (estados).** Cada matiz tem dois valores: **vivo** (tinta de
fundo, borda, ponto da linha do tempo) e **sólido** (texto sobre tinta e chip
selecionado, com contraste AA). No tema escuro os papéis se invertem.

| Classe | Matiz | Significado |
|---|---|---|
| `.c-ok` | esmeralda | concluído, em dia, assinado |
| `.c-warn` | âmbar | pendente, agendado, aguardando |
| `.c-crit` | vermelho | exige ação agora, atraso, recusa, incidente |
| `.c-info` | azul | em andamento, informativo |
| `.c-med` | violeta | medicamento e conteúdo restrito |
| `.c-move` | ciano | deslocamento, saída, ausência externa |
| `.c-other` | rosa | "outro" com nota |
| `.c-mute` | ardósia | rotina, não aplicável, sem demanda |
| `.c-brand` | azul institucional | identidade, contagens neutras |

**Componentes:** `.appbar` · `.card` · `.tile` (indicador com faixa colorida) ·
`.pill` (estado) · `.opt` (opção viva selecionável) · `.notice` (aviso com barra
lateral) · `.kidcard` (avatar com iniciais) · `.seg` · `.tabbar` · `.sheet`.

**Temas:** claro, escuro e "sistema". Tokens em `:root`, redefinidos em
`@media (prefers-color-scheme: dark)` com guarda
`:root:not([data-theme="light"])` e de novo em `:root[data-theme="dark"]`.
**Nenhuma cor tem definição única dentro de media query.**

**Tipografia:** *Plus Jakarta Sans* (600–800) para títulos, rótulos, números e
chips — a voz institucional; *Atkinson Hyperlegible* (400/700) para texto
corrido, escolhida por ser desenhada para leitura difícil.

#### As três lições de contraste — regras, não estimativas

Conferidas por `npm run ensaio:acessibilidade`. **Cor nova passa por ele antes
de entrar.**

1. **`opacity` desbota o texto junto com a decoração.** Quatro listas usavam
   opacidade entre .55 e .62 para recuar o que já aconteceu — a dose
   administrada, a atividade concluída, a criança que saiu. A conta é
   multiplicativa: a linha de apoio, já cinza por ser apoio, caía para 2,3:1.
   **O que já foi resolvido recua pelo FUNDO e pelo peso**, nunca pela tinta:
   `background: var(--sunken)` e `font-weight: 600`.
2. **Toda tinta precisa passar nos TRÊS fundos claros** — `--surface`,
   `--ground` e `--sunken` —, não só no branco. `--muted` estava em 5,44:1 no
   branco e 4,49:1 sobre a superfície rebaixada: a mesma cor aprovada num lugar
   e reprovada no outro, por dois centésimos.
3. **A diferença entre 4,46 e 4,5 não se enxerga num monitor com luz.**
   Enxerga-se no corredor, às onze da noite. O âmbar da pílula "em atenção"
   estava nesse limiar — a tinta mais fraca da tela reservada justamente para o
   aviso. `--amber-solid` foi de `#B45309` para `#92400E`.

**As fontes do protótipo** são buscadas na rede. Aberto sem internet — que é
como o arquivo é entregue —, ele cai na fonte do sistema. Decisão em aberto,
§10.10.

### 4.10 Os testes que guardam a arquitetura

Além dos e2e, sete suítes estáticas — todas já pegaram erro de verdade:

| Suíte | O que ela cobra |
|---|---|
| `arquitetura.spec.ts` | as fronteiras entre partições; o marcador `rls-join-ok:` obrigatório perto de todo JOIN; e, desde as fases 90 e 91, **nenhuma função do banco nem serviço que confere o estado numa leitura e grava só pelo id** (regra 11). É heurística, e diz o que não pega: estado guardado em coluna que não se chama `status` |
| `contrato-rotas.spec.ts` | toda rota chamada pela tela **existe** no servidor |
| `alcance.spec.ts` | as marcas `/* alcance:<área> */` lidas do código que roda |
| `documentacao.spec.ts` | toda tabela do banco aparece no `der.md` |
| `numeros-da-documentacao.spec.ts` | os números que este arquivo afirma batem com o código |
| `rotas-sem-porta.spec.ts` | as rotas sem tela são só as 14 declaradas com motivo — e o bloco **"ação sem botão"**: toda ação que os provedores de linha do tempo emitem (`medication.confirm`, `check.open`, `handover.sign`, `ata.view`, `incident.open`) é atendida pela tela do Dia **e** pelo `mock.ts` |
| `varredura-de-cargos.e2e.spec.ts` | **todos os cargos contra todas as rotas de leitura**, com id real, id inexistente e id que não é UUID, cobrando uma coisa só: nada devolve **500**. Ela não sabe o que deveria voltar; sabe o que nunca pode |
| `servidor-de-mentira.spec.ts` | o `mock.ts` não aponta para quem não existe — todo id de acolhido e de conta encontra alguém, quem assina um ato desta casa está no quadro dela, e **nenhum ensaio escolhe um cargo que o seletor não oferece**. Lê o código sem os comentários, senão a lição escrita ao lado do conserto derruba a suíte |

---

## 5. AS REGRAS QUE NÃO SE NEGOCIAM

1. **NUNCA publicar, nunca fazer deploy em produção, nunca usar dado real** sem
   autorização expressa. Construir e validar local, com dados fictícios.
2. **Segredo nunca no código.** O log da aplicação nunca copia conteúdo
   sensível — só ID e metadado. Vale para token de convite, link de acesso e
   código de aparelho.
3. **PROIBIDO, sem exceção:** WhatsApp ou envio de dados por WhatsApp; GPS ou
   rastreamento; conta compartilhada; acesso a outra casa fora das exceções
   funcionais; ranking de casas, acolhidos ou equipe; pontuação de
   comportamento; decisão automática sobre diagnóstico, culpa, risco, punição,
   visita, medicação, destino ou transferência; exclusão simples ou silenciosa;
   sobrescrever registro fechado; CPF, diagnóstico ou conteúdo judicial em nome
   de arquivo; envio automático para Judiciário, Conselho Tutelar, MP ou saúde;
   acesso direto do educador ao Drive; módulo de alistamento militar; controle
   de cofre físico; microsserviços prematuros.
4. **Dado bancário e cofre de acessos:** só o coordenador da casa atual e o
   Gestor Geral, com reautenticação e log por visualização.
5. **PARTIÇÕES ISOLADAS.** Cada módulo no seu arquivo. Apagar ou acrescentar uma
   função não pode estragar nenhuma outra parte já construída.
6. **Toda ação tem autor e histórico.** Nada é anônimo, nada some.
7. **Cor comunica estado operacional e categoria** — nunca julgamento sobre a
   pessoa.
8. Função `SECURITY DEFINER` com `p_house` **SEMPRE** confere
   `app_house_in_scope()`.
9. Migração nova **NUNCA** usa `current_date`. Use `app_hoje()`.

---

## 6. AS REGRAS QUE NASCERAM DE DEFEITO

*Respeite-as como as de cima. Cada uma custou um defeito real, e quase todos
eram **silenciosos**: nenhum dava erro na cara de ninguém.*

**10. Nome de pessoa vem SEMPRE por `app_user_display_name(id)`** — nunca por
junção com `app_user`, que **tem** RLS de linha. `JOIN` some com a linha
inteira; `LEFT JOIN` some com o nome. As duas falhas são silenciosas: o
histórico do limite da casa voltava vazio para quem trabalha nela, e a agenda
mostrava o compromisso sem dizer quem vai levar a criança. Oito consultas
tinham o comentário `rls-join-ok:` afirmando que aquela tabela não tinha RLS.
**A marca pode mentir — e mentia.**

**11. Leitura para DIAGNOSTICAR não leva `FOR UPDATE`.** Sob RLS, um
`SELECT … FOR UPDATE` aplica também a policy de UPDATE, e a linha some — o
sistema responde **404** para algo que existe, a quem acabara de aprová-lo. A
atomicidade fica no `UPDATE … WHERE status = <esperado>`.

**E a metade que custou cinco defeitos (fases 89 e 90): sem `FOR UPDATE` E sem
o estado no WHERE, a leitura não protege nada.** `IF x.status <> 'esperado'`
seguido de `UPDATE … WHERE id = …` deixa quem chega durante o ato do outro
passar pela leitura, esperar a trava e gravar por cima — e as duas pessoas
recebem sucesso. Foi assim no retorno familiar, na recusa e no cancelamento de
transferência, no fechamento da ATA Geral e na mudança de combinado. **Estado
no WHERE, `IF NOT FOUND THEN RAISE` logo depois, e só então o histórico e a
auditoria** — senão o ato que perdeu a corrida deixa rastro de algo que não
aconteceu. A prova é `test/setup/corrida-no-banco.ts` (duas conexões, a segunda
vista PARADA na trava antes de a primeira confirmar); a conferência permanente
está no `arquitetura.spec.ts`, e foi vista acusando as cinco antes do conserto.

**E a sexta, no TypeScript (fase 91).** A triagem da Enfermagem fazia o mesmo
dentro do serviço: lia o estado, gravava a triagem e depois o estado com
`WHERE id = $1`. No serviço não há `FOR UPDATE` que resolva — sob RLS ele faz a
linha sumir —, então o caminho é o mesmo do banco: **o estado lido vai para o
WHERE, `rowCount` zero vira 409 com a frase, e a triagem só é gravada depois.**
Quando o desenho mora no serviço, a prova passa pela ROTA: `corridaPorHttp`, no
mesmo ajudante, trava a linha como dono do banco, dispara as requisições, espera
ver todas paradas e só então solta. A conferência dos serviços está no
`arquitetura.spec.ts`, com as exceções escritas por extenso — e exceção que
deixa de ser usada reprova.

**12. Agregação por casa confere o escopo ANTES de contar.** O RLS filtra as
linhas, e zero se lê como "casa vazia", não como "não é sua". **Zerar não é
recusar.**

**13. Suíte que muda estado compartilhado desfaz o que criou, e contagem em
teste é RELATIVA ao que já estava no banco.** Tabela
append-only guarda o que as outras suítes deixaram; a linha da própria suíte se
acha **pela frase que ela escreveu**, nunca pela posição. Uma suíte que contava
em números absolutos passava sozinha e derrubava uma rodada em três, conforme a
ordem dos arquivos.

**14. O `mock.ts` é o servidor de mentira, e precisa responder o que o servidor
responde** — não o que a tela quer. `GET /reports` servia sete campos e a tela
lia onze; `r.entregas.map(...)` derrubava a aba inteira, e no protótipo
funcionava. **Quando o servidor de mentira responde melhor que o servidor, a
demonstração ensaia um sistema que não existe.** O `contrato-rotas.spec` pega a
rota que não existe; não pega a rota que existe e responde outra coisa.

**E a metade que faltava, achada em 10/09: quando ele responde PIOR que o
servidor, a demonstração esconde um sistema que existe.** Cinco entregas das
fases 76–86 estavam invisíveis ou erradas no único arquivo que o Marcelo abre —
o campo da hora de sair plumbado e nunca preenchido; um id de acolhido com um
dígito de menos, que fazia a casa mostrar "— · sai acompanhado · Medida
disciplinar combinada com ele na quinta", um travessão no lugar do nome; uma
folha para a cozinha nomeando uma criança que não mora na casa; o histórico do
cofre registrando abertura excepcional por um Gestor que não existe; e o
"Ver como" trocando o cargo e **mantendo a pessoa**, o que fazia a cobrança de
relato da fase 79 nunca aparecer. Nada disso quebra: `tsc` está feliz, são
strings; a suíte está feliz, não toca no frontend; o `ensaio` está feliz, a
tela renderiza e "—" não é `undefined`. Agora é o
`servidor-de-mentira.spec.ts` que cobra.

**E a terceira vez, na fase seguinte à que existiu para acabar com isso.** A
fase 88 entregou um bloco que **some quando está vazio** — certo no sistema —, e
o servidor de mentira nascia **sem convivência nenhuma**. O `ensaio` e o
`ensaio:acessibilidade` passaram verdes sem nunca desenhar o bloco: a cor nova
não foi conferida, e o Marcelo abriria o arquivo sem ver a entrega. **Bloco que
some quando vazio precisa de dado no servidor de mentira, e o ensaio precisa
procurar o CONTEÚDO, não a porta** — o `ensaio:roteiro` cobrava que a aba
Passagem existisse, e ela existia. A regra geral não cabe numa expressão
regular; o `servidor-de-mentira.spec.ts` cobra o caso que aconteceu, e é o
exemplo a copiar no próximo bloco assim.

**E o avesso, na fase 92: o servidor de mentira respondendo MELHOR.** O perfil do
servidor devolvia os contatos como vinham do banco — `name`, `bond`,
`restricted` —, e a tela lê `nome`, `vinculoRotulo` e filtra por `ativo`.
**Contra o servidor de verdade, a seção de contatos saía vazia**, e com ela o
botão da experiência familiar. O protótipo mostrava tudo, porque o servidor de
mentira devolvia a forma certa. Nenhum teste comparava a forma do perfil com a
da lista de contatos. Achado ao construir a portaria, por uma sonda que chamou a
rota de verdade; hoje as duas usam a mesma consulta e a mesma função
(`contatoParaTela`), e `cadastro-da-lista.e2e.spec.ts` cobra que o contato do
perfil seja IGUAL ao da lista. **Rota que devolve a mesma coisa que outra tem de
devolver na mesma forma — e o teste compara as duas, não uma com a memória.**

**19. Ensaio que ESTOURA não é ouvido como ensaio que reclama.** A fase 83
tirou a Cozinha do seletor e não tirou dos roteiros. O `selectOption('cozinha')`
passou a dar timeout e derrubar o processo — no terminal isso se lê como
problema de ambiente, e o `npx jest` continuava verde ao lado. O `ensaio:uso`
morreu no bloco 7 de 13 por quatro fases: **59 das 114 cobranças deixaram de
rodar**, e entre elas o Gestor Geral, a exceção por medicamento, a escala e a
ATA da próxima equipe. Quando destravou, as 59 passaram todas — não havia
defeito atrás do travamento, e é isso que o torna caro: quatro fases de trabalho
entregues sem a rede que existia para pegá-las. **Um conferidor que morre em
vez de acusar é um conferidor desligado que ninguém desligou.**

**15. Escopo que se repete por linha vira CONJUNTO, não função por linha:**
`house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))`. Chamar
`app_house_in_scope` por linha custou **1 096 ms** na auditoria com 173 mil
linhas; o conjunto, 122 ms. E toda troca dessas vem com a prova de que o alcance
não mudou, **cargo a cargo** — ganho que muda regra é vazamento.

**16. Política de RLS pergunta o PAPEL antes do escopo por linha, e com `CASE`**
— o `OR` do SQL não garante a ordem, e o Postgres avalia a consulta por linha
antes de descobrir que o cargo já alcançava tudo. Custou **400 ms** numa tela
que responde em 36 ms.

**17. Filtro por DIA é faixa de `timestamptz`, nunca conversão da coluna.** Sob
RLS só predicado LEAKPROOF desce para o índice, e `timezone()` não é: o filtro
fica depois da política, que passa a rodar uma vez por linha do ano. Custou
**8,4 segundos** numa tela que responde em 47 ms. **Converta o PARÂMETRO.**

**18. Número que descreve o sistema não se escreve de memória nem se copia do
documento anterior: sai do código**, e é cobrado por
`numeros-da-documentacao.spec.ts`. Em 08/09 seis afirmações estavam erradas ao
mesmo tempo em três documentos, e duas discordavam entre si. Nada quebra, e é
por isso que é pior: quem retoma começa com crenças falsas e aprende a não
confiar no arquivo inteiro. Contagem que só cresce não é dado — escreva a
**data** e a **condição**.

### As outras que não viraram número, e continuam valendo

- **A dose suspensa continuava na grade.** Suspender mudava o status da
  prescrição e deixava as doses de HOJE com "Confirmar" ao lado. No dia seguinte
  ficava limpo, então ninguém percebia — e hoje alguém dava o remédio suspenso.
- **A atividade vencida era marcada e ninguém era avisado.** Depois da
  meia-noite, `markUnconfirmed` marcava a atividade das 21h e escalava só as de
  hoje. Todas as noites, em silêncio.
- **Policies que conferiam o cargo e esqueciam a casa:** a coordenação da Casa
  03 podia autorizar educador na Casa 04.
- **Rota que a tela mostra e ninguém consegue escrever.** O perfil desenhava
  cuidados essenciais, escola e equipe de referência sem porta de edição desde a
  fase 2. Não dava erro: o campo simplesmente vivia em branco.
- **Coluna criada e nunca lida.** A migração 055 criou as colunas da planilha
  real de benefícios — número, operação, agência, pendência bancária — e o
  serviço nunca as leu nem gravou. A planilha seguiu aberta numa pasta
  compartilhada.
- **Anexo que entra e não sai.** Dois armazenamentos eram write-only: o laudo do
  hospital entrava e não tinha rota de leitura.
- **Ação sem botão.** O servidor mandava `medication.confirm` para a linha do
  tempo desde a fase 12, e a tela do Dia não sabia o que era. Às 22h o educador
  via o remédio e não tinha por onde dizer que deu. Outras quatro ações estavam
  mudas do mesmo jeito.
- **Cargo sem usuário no seed.** A Cozinha existia em todo lugar — tela,
  alcance, rota — e **nunca havia logado**; o teste do relatório dela rodava com
  o token da coordenação.
- **No protótipo, o "Ver como" troca o cargo e mantém a pessoa** — qualquer
  verificação de autoria no `mock.ts` valia para todos os cargos, e a
  demonstração mentia justamente sobre a política mais estreita do sistema.

### Três armadilhas dos ensaios em Playwright

1. `text-transform: uppercase` quebra `includes` sensível a maiúsculas — use
   `/…/i`.
2. Roteiro preso a horário fixo falha em certas horas do dia, e isso **não** é
   defeito do sistema.
3. `getByRole('button', { name: /Mais/ }).last()` pega o "⋯" de uma linha de
   atividade, não a aba da barra de baixo — as duas têm "Mais" no nome
   acessível, e o ensaio "passa" navegando para lugar nenhum. Use `.first()`.

---

## 7. QUEM ALCANÇA O QUÊ

Aplicado em **duas camadas**: guards e serviços na API, políticas RLS no banco.
Escopos transversais são limitados pela **finalidade** do cargo.

### Escopo de casas

| Papel | Casas visíveis | Condição | Finalidade |
|---|---|---|---|
| Educador social | própria casa | plantão (janela T±10 **não implementada** — ver §11) | operação do plantão |
| Líder Diurno | própria casa | plantão ativo | operação + fechamento da ATA |
| Equipe técnica | própria casa | escala individual | técnica |
| Coordenação | própria casa | sem limite de horário | gestão integral da casa |
| Enfermagem | **8 casas** | escala própria | somente saúde |
| Líder Noturno Geral | **8 casas** | durante o turno (19h–7h, preliminar) | operacional mínimo |
| Gestor Geral | **8 casas** (abre 1 por vez, auditado) | sem limite | institucional |
| Cozinha | — | — | somente o relatório mínimo de alimentação |
| Admin técnico | infraestrutura | emergencial, temporário, auditado | sem acesso comum ao negócio |

*Os nove acima são os do enum `role_code` (migração 0010). **Não existe
"educador volante"** — ele foi documentado por engano na matriz antiga, foi
encontrado pelo ensaio de uso em 31/08, e voltou a aparecer na consolidação de
09/09 porque foi copiado de um documento em vez de sair do código. É a regra 18
cobrando pela terceira vez o mesmo pedágio: **cargo, como número, sai do
`role_code`.***

### Capacidades por papel

| Capacidade | Edu | Líd.D | Téc | Coord | Enf | Líd.N | Gestor |
|---|---|---|---|---|---|---|---|
| Ver linha do tempo / visão dos 20 | ✅ | ✅ | ✅ | ✅ | saúde | mínimo | ✅ |
| Criar/alterar agenda regular | — | urgente pontual | ✅ | ✅ | — | urgente pontual | — |
| Confirmar medicamento | ✅ se administrou | ✅ se administrou | — | — | ✅ se administrou | — | — |
| Cadastrar e ativar esquema de medicamentos | — | — | ✅ | ✅ | ✅ | — | — |
| Marcar medicamento como exclusivo da Enfermagem | — | — | — | ✅ | ✅ | — | ✅ |
| Editar perfil estrutural do acolhido | — | — | ✅ | ✅ | saúde | — | — |
| Ver narrativas pessoais de educadores | próprias | não navega | ✅ | ✅ | — | não | apuração formal |
| Criar/desativar usuários | — | — | — | ✅ própria casa | — | — | ✅ com auditoria |
| Dados bancários / benefícios | — | — | — | ✅ casa atual + reauth | — | — | ✅ + reauth |
| Baixar Resumo de Saúde | plantão | própria casa | própria casa | própria casa | 8 casas | 8 casas no turno | ✅ |
| Assinar passagem de plantão | ✅ a própria | ✅ a própria | — | — | — | ✅ a própria | — |
| Confirmar recebimento do turno | ✅ individual | ✅ individual | — | — | — | ✅ individual | — |
| Fechar ATA | assina a própria | ✅ diurna | ✅ | ✅ | — | ✅ noturnas + Geral | — |
| Reabrir/corrigir ATA fechada | — | — | ✅ com motivo | ✅ com motivo | — | — | — |
| Abrir ocorrência | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Encerrar etapa operacional da ocorrência | — | ✅ | ✅ | ✅ | — | ✅ | — |
| Validar ocorrência crítica (fechar) | — | — | ✅ | ✅ | — | — | — |
| Ver fala espontânea / sinais observados | autor | — | ✅ | ✅ | se saúde | — | — |
| Abrir anexo restrito | autor | — | ✅ | ✅ | doc. médico | — | — |
| Registrar comunicação externa | — | — | ✅ | ✅ | — | — | — |
| Ver caixas de transferência | — | — | ✅ | ✅ | — | — | ✅ |
| Conversar com a outra coordenação sobre transferência | — | — | ✅ | ✅ | — | — | ✅ |
| Aceitar ou recusar transferência | — | — | ✅ destino | ✅ destino | — | — | ✅ |
| Aprovar comunicação externa | — | — | ✅ | ✅ | — | — | ✅ |
| Auditoria (leitura) | — | — | — | própria casa | — | — | ✅ |
| Registrar conclusão **pelo colega** | — | ✅ | — | ✅ | — | ✅ | ✅ |
| Delegar atividade em aberto | — | ✅ | — | ✅ | — | ✅ | ✅ |
| Autorizar ou **recusar** substituição | — | ✅ | ✅ | ✅ | — | ✅ | — |
| Ver o painel do plantão | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Convidar para o primeiro acesso | — | — | — | ✅ própria casa | — | — | ✅ |
| Ler a escala de plantão da casa | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Ler a ATA do turno anterior | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Escrever linha na ATA do turno | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ler e escrever a linha RESTRITA da ATA | — | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Montar a escala (escalar, retirar, folha) | — | — | — | ✅ própria casa | — | — | ✅ |

### As regras invariantes

- **Conta individual; ninguém assina ou confirma por outro.** Uma exceção, com
  forma própria: o líder do turno e a coordenação podem **registrar** a
  conclusão de uma atividade comum por um educador que a realizou e não
  conseguiu registrar. Isso não é assinar por outro — o registro guarda os
  **dois nomes**, mais o motivo, e toda tela mostra os dois juntos.
  **A exceção não alcança dose de medicamento nem chamada:** numa, a confirmação
  individual é a proteção da criança; na outra, quem marca presença é quem olhou
  a criança.
- **Substituição tem os dois lados:** autorizar e **recusar**, esta com motivo
  obrigatório, porque quem pediu vai ler. O sistema não fecha pedido sozinho.
- **Primeiro acesso é por convite de uso único, 24 horas**, ao e-mail
  institucional. Quem convida **não vê o link**. Emitir convite embaralha a
  senha atual e derruba as sessões: a partir dali a única porta é o link.
- **O painel do plantão não é medição:** sem contagem por pessoa, sem ordenação
  por desempenho, sem histórico de deslocamento.
- **Fora de escopo = 404 idêntico a inexistente.**
- **Acesso excepcional** (gestor → narrativa pessoal) exige finalidade,
  justificativa, **reautenticação** e auditoria destacada.
- **Desligado = desativado.** Autoria e histórico preservados.
- **Alterar o relógio do aparelho não amplia acesso** — a janela é avaliada no
  servidor.
- **A linha restrita da ATA é fechada no BANCO**, não na tela. Quem não a
  alcança recebe a **contagem** — "há 2 observações restritas à coordenação" —,
  nunca o texto: sumir por completo criaria a impressão de que não existe.
- **A escala informa, não bloqueia.** Ela diz quem devia estar no plantão; quem
  cobriu um turno fora dela assina a passagem do mesmo jeito, com o aviso de que
  não constava.
- **Dose não se confirma sem sinal, em aparelho nenhum.**
- **ATA fechada não é sobrescrita:** correção é adendo, com antes e depois.
- **Violência ou suspeita, contenção, erro de medicamento e emergência de saúde
  não se encerram** sem validação técnica ou de coordenação.
- **Nenhuma comunicação sai do sistema para órgão externo:** registro, aprovação
  e entrega humana registrada. Não existe envio automático.

---

## 8. O QUE O SISTEMA FAZ HOJE

### 8.1 O ciclo do acolhimento

Admissão com motivo e capacidade; perfil; correção de cadastro com histórico
legível; **atualização dos dados descritivos** — cuidados essenciais, escola,
equipe de referência — guardando o que estava escrito antes; saída com motivo;
acervo histórico; e retorno como episódio novo.

**Casa cheia não bloqueia acolhimento**, exige justificativa registrada: uma
criança com guia na mão às 23h não pode esbarrar num CHECK, e a casa passa a
mostrar "21 de 20" em vez de o excesso virar vaga fantasma.

### 8.2 O cadastro

Filiação, RG, cartão SUS, foto de identificação no perfil, e os **contatos com
vínculo** — genitora, padrinho, tia, vínculo comunitário —, que o educador lê e
a técnica escreve. **Contato não se apaga: encerra-se com motivo.** Contato com
aproximação restrita aparece primeiro, com o motivo à vista. A **chave de acesso
ao processo** vive no cofre, com reautenticação e registro por visualização.

O **motivo judicial** do acolhimento é área restrita — equipe técnica,
coordenação e Gestor Geral. O educador não o lê nem consultando o banco direto:
saber por que a criança foi retirada de casa muda o olhar de quem cuida.

### 8.2.1 O que o plantão vê no perfil

Pedido do Marcelo em 09/09. A coordenação liga e desliga, **na própria casa**,
campos do perfil que o educador em plantão vê: escola, contatos, equipe de
referência, cuidados essenciais.

**A lista é fechada no código E no banco** (`CHECK`, migração 1130), e é ela
que separa isto da tela recusada em 27/08 — aquela deixaria a coordenação
alargar o **alcance de cargo**, e o isolamento entre as oito casas cairia por
dentro. Aqui não se alarga nada: escolhe-se, dentro de um conjunto revisado, o
que fica à vista de quem está no plantão. Os cinco que não são negociáveis não
estão na lista nem podem ser acrescentados por quem usa o sistema — motivo
judicial, narrativa pessoal restrita, cofre de acessos, benefícios e dados
bancários, ocorrência restrita —, e a tela **diz quais são**: tela de permissão
que mostra só o que dá para mexer faz a pessoa procurar o resto.

**Padrão ligado.** Nada mudou de comportamento quando a migração rodou.
**Desligar pede motivo; religar, não** — tirar um dado da vista de quem está com
a criança às 23h é o que alguém vai ter de explicar depois.

**E desligado não é invisível.** O perfil do educador continua dizendo que o
campo existe, quem desligou e por quê, e que a equipe técnica o vê. Sem isso ele
leria a ausência como "não há telefone da escola", e ligaria para ninguém —
**ausência que mente é pior do que recusa que explica**.

**O que ficou de fora, e é decisão do Marcelo:** a *agenda de consulta*, que ele
citou junto. Ela não mora no perfil e o educador não a vê hoje; ligá-la seria
alargar o alcance do cargo, que é o que foi recusado. Virou a pergunta 7 do
roteiro — e, se a resposta for sim, vale para as oito casas, decidido uma vez.

### 8.3 O turno

O **Dia** com a rotina versionada da casa e quatro filtros, entre eles **"Por
criança"** — uma linha por acolhido, em **ordem alfabética**, com o alerta
essencial primeiro. *Não é ordenado por pendência de propósito: se fosse, as
mesmas crianças ficariam no topo todo dia.*

Chamadas coletivas com conferência de mesa; **painel do plantão** (quem está em
quê agora); delegação e substituição, que são coisas diferentes — delegar é
passar adiante, substituição é quem vai sair pedindo.

**Desmarcar uma data sem cancelar a série.** O acompanhamento da Ana é toda
semana; numa semana a psicóloga desmarcou. A exceção é por data, com motivo e
autor, e **o dia continua aparecendo na agenda**, marcado como desmarcado —
sumir esconderia que o atendimento estava previsto e não aconteceu, e no mês
seguinte a ausência viraria esquecimento. A lista do turno não cria a
atividade daquele dia; remarcar desfaz sem apagar a linha. Desmarcam a equipe
técnica e a coordenação: o líder e a Enfermagem encerram a série, mas
desmarcar um atendimento é reorganizar o plano da criança.

**A hora de sair, a hora de estar lá, e o endereço.** A consulta é às 14h; a
casa sai às 13h, e entre as duas cabe o trânsito. O educador olha a hora de
sair. O endereço vem separado do nome do lugar, porque "UBS Bom Jesus" não se
digita no aplicativo do ônibus.

### 8.4 A escala de plantão

A coordenação monta por **dia e turno**, com hora quando o plantão não é o
inteiro, e **repete a cada N dias** para preencher o mês. "A cada 2" é o desenho
de uma **12x36** — e é por isso que a escala é por **DATA e não por dia da
semana**: o ciclo é de 48 horas e anda pelo calendário, e "toda terça a Joana" é
falso na terça seguinte.

O **turno sem ninguém** aparece escrito, a folha da parede sai em Word, e **nada
se apaga**: retirar é revogar, com autor — e retirar plantão que já passou exige
motivo, porque é a escala que responde quem estava na casa naquela noite.

**Sem contagem de plantões por pessoa em lugar nenhum.** Somar plantão por nome
é medir gente.

Com ela, **quem o sistema cobra por assinar a passagem passa a ser quem estava
escalado**; sem escala montada, ele **declara** que caiu no vínculo da casa — em
vez de fingir que sabe.

### 8.5 A passagem e a ATA

Passagem de plantão assinada uma a uma. **No fim da passagem, as doses do turno
aparecem** — confirmadas e sem resposta —, e quem assina **primeiro** escreve o
que houve com as que ficaram. Isso **não confirma dose nenhuma**.

Na ATA: o **⏮ Turno anterior** fica ao lado dos turnos de hoje, e **toda a
equipe da casa abre** — o educador inclusive, que antes só lia a passagem. Cada
linha escrita tem **autor, cargo e horário**, com cor por pessoa na borda e na
etiqueta, e o nome sempre escrito ao lado. A **linha restrita** à coordenação, à
equipe técnica e aos líderes é fechada no banco; quem não a alcança vê quantas
existem.

**A ATA Geral Noturna não se acha pela data.** Só o Líder Noturno Geral a abre,
e é abrindo que se descobre o id — nenhum outro cargo chega nela. É limitação
viva, e é metade da decisão §10.2: perguntar quem lê a ATA Geral de dia é
perguntar por onde ela seria achada.

Também: ATA por turno (diurna e noturna, cada uma com as suas assinaturas),
episódios do turno com relato imutável e ciência nominal, **ATA Geral Noturna**
e o Arquivo das ATAS por dia, semana ou mês. O plantão noturno **pertence ao dia
em que começou** (19h–7h) — sem isso, quem abria às 23h50 e quem abria às 00h10
criavam dois plantões para a mesma noite.

### 8.6 Saúde e medicação

Grade de doses confirmada **uma a uma por quem administrou**; triagem de
evoluções com assinar **ou devolver pedindo complemento**; armário com duas
ações ("Chegou remédio" soma, "Conferi o armário" substitui e pede motivo);
esquemas de medicamento (rascunho, na grade, suspenso); suspensão que tira a
dose da grade **dizendo por quê**; histórico de saúde do acolhido; emissões do
Resumo.

**Na entrada, a validade que fica é a MAIS PRÓXIMA** entre a que havia e a que
chegou: lote novo e longo não apaga o lote velho que ainda está na gaveta.

**O remédio que vai junto.** Quem está com a família saiu da grade — a casa não
é lembrada da dose das 20h porque não é ela quem vai dar —, e o efeito colateral
era o remédio sumir de todo lugar. A folha timbrada diz o que a criança leva:
medicamento, dose, horários e quantidade, com aviso em destaque quando há
medicamento que, na casa, **só a Enfermagem administra** — essa restrição não
viaja com a criança. **Ver e dar baixa são atos separados:** a folha pode ser
gerada quantas vezes for preciso, e a baixa acontece uma vez só. O movimento é
`saida_com_acolhido`, **nunca `consumo`**: a casa não deu a dose, e registrar
como consumo faria o histórico dizer que ela administrou o que ninguém viu
ninguém tomar. A contagem arredonda **para cima** no dia do retorno, e a folha
diz isso: mandar um comprimido a mais é barato, faltar um não é.

**A dose confirmada registra `consumo` no histórico do armário.** O número já
caía desde a fase 6; o que faltava era o histórico dizer por quê — ele mostrava
caixas chegando e nenhuma saindo. Recusada, não administrada e indisponível não
consomem nada, que é para isso que esses estados existem separados.

**A nota fiscal** fica junto do armário, com o que foi comprado, o gasto e o
papel digitalizado — e o resumo diz quantas linhas estão **sem o papel**, que é
o que trava a prestação de contas no fim do mês. Sem data de validade: a
Fundação presta contas do gasto, e validade é assunto do armário, que já a tem.
O educador não lê: nota fiscal é documento financeiro, e não há nada nela que
ajude o turno.

**A receita digitalizada** fica junto da prescrição que ela autoriza, e nasce
restrita — o educador administra a dose e vê o esquema, mas a receita traz CID e
o nome do prescritor, e isso não muda o que ele faz às 22h.

**Estoque baixo é sinalizado à mão, com o nome de quem sinalizou** — não há
mínimo automático, porque só a equipe sabe o que é pouco em cada caso: dois
frascos de um xarope eventual sobram, e dois de um contínuo acabam na quinta.

**Quem dá o remédio:** a Enfermagem atende das **9h às 17h**; fora disso
administra o **educador de plantão**, conforme a bula do acolhido. O que existe
é a **exceção por medicamento** — "este só a Enfermagem dá" —, marcada no
esquema com motivo obrigatório e antes-e-depois; o educador barrado **lê o
motivo**, e a dose continua aparecendo na linha dele sem botão, porque ele
precisa saber que há remédio às 22h para chamar quem pode.

Cadastram esquema a Enfermagem, a coordenação **e** a equipe técnica — porque a
criança volta da consulta com a receita às 20h.

*O protocolo por período e a autorização nominal deixaram de decidir, não de
existir: guardam o que a casa decidiu enquanto ninguém sabia o horário da
Enfermagem.*

### 8.7 A criança no hospital

A **internação** tira o acolhido da linha do dia — chamada, grade e rotina — sem
tirá-lo da casa: **a vaga continua ocupada**, e ele volta sozinho na alta. Abrem
e encerram a equipe técnica e a coordenação; o diário do período aceita anexo do
hospital e **não cobra registro diário de ninguém**; a medicação dada lá entra no
histórico de saúde e na folha da Enfermagem **com a origem escrita em cada
linha**, e nunca na grade da casa.

O educador comum não lê a internação, mas vê **"no hospital"** na lista de
acolhidos: ele precisa saber por que a cadeira está vazia.

### 8.7.1 Acolhido em experiência familiar

A criança sai para passar dias com a família de origem ou com o padrinho. Sai
da chamada, da rotina e da grade — **e a vaga continua ocupada**, como na
internação. Volta sozinha quando alguém registra a chegada, e o nome veio do
papel: é uma das seções que o LIVRO ATA da Casa 03 já preenche.

**Não há autorização judicial amarrada.** Quem autoriza é o Juízo, em papel, e o
sistema não teria como conferir — um campo "autorizado" não verificável
pareceria conferência. O acolhimento registra que a criança vai, e fica no
perfil dela.

**Contato com aproximação restrita é barrado, não avisado.** A saída aponta para
um contato já cadastrado (digitar o nome à mão permitiria escrever qualquer um),
e no contato restrito o botão nem aparece — o servidor recusa de qualquer jeito,
com a frase dizendo o motivo.

**O aviso é sobre o relógio, nunca sobre a criança:** "volta sex 18:00", depois
"chega às 18:00 — fiquem de olho" na última hora, e "previsto 18:00 · retorno
ainda não registrado" se a hora passar. O sistema não chama isso de evasão — não
voltar às 18h e evadir são coisas diferentes até alguém apurar (regra 3).

**Quem recebe registra:** o educador de plantão fecha o retorno. Exigir a técnica
às 18h de domingo deixaria a criança marcada como fora da casa a noite inteira.
O campo da chegada pede **fato observado**, não rótulo.

**E o retorno ECOA na passagem e na ATA do turno.** Era registrado no perfil e
ficava lá: ninguém abre vinte perfis às 19h para descobrir que a Alice chegou
às 18h10. O bloco mostra quem **voltou** (com a hora, quem recebeu, como ela
chegou e **o que trouxe de casa**), quem **saiu** e quem **continua fora**, com
a hora de voltar — este último não estava no pedido e é o que o turno seguinte
mais usa: uma criança que saiu na terça e volta no domingo não apareceria em
nenhum turno se o recorte fosse só o das bordas, e é nos dias do meio que
ninguém sabe o que está acontecendo. **Uma função serve as duas telas**: duas
consultas quase iguais divergiriam no primeiro ajuste, e aí a passagem diria uma
coisa e a ATA outra sobre o mesmo domingo.

**"O que ela trouxe de casa" é campo próprio; "se houve alteração" não é.** O
Marcelo pediu os dois. O primeiro é fato logístico do turno seguinte — veio
remédio que não é o da grade, veio roupa para lavar antes da escola de segunda,
veio o documento que a técnica esperava — e é a única das duas coisas que
alguém tem de FAZER algo a respeito. O segundo é respondido pelo campo de fato
observado, e **de propósito não virou um sim/não**: "alteração: sim" atravessa
seis meses e um relatório judicial muito depois de o detalhe ao lado ter sido
esquecido, e é o §8.14 inteiro. *Decisão minha, registrada: ele pediu a
palavra, e vale contar isso a ele quando levar.*

**O retorno é um só.** Duas pessoas registrando a mesma chegada ao mesmo tempo
— a educadora na porta e o líder no celular — recebiam sucesso as duas, e a
segunda **sobrescrevia** a primeira: outro texto, outro nome em quem recebeu. A
1080 põe o estado no `UPDATE` (regra 11), e a segunda recebe "o retorno desta
saída já foi registrado". Achado na verificação da 88, com teste de duas
conexões que reprovou antes do conserto.

**O dia do retorno já conta como de volta.** Se contasse como fora, a criança que
chegou às 16h passaria a noite em casa com a grade vazia e ninguém seria
lembrado do remédio das 20h. O custo — as doses anteriores à chegada, naquele
dia, reaparecem sem confirmação — é o menor dos dois, e quem fecha o turno
escreve o que houve.

### 8.7.2 Sair sozinho

Há adolescentes autorizados a ir sozinhos à escola, ao curso, ao trabalho. A
autorização é um **estado** — sai sozinho, sai acompanhado, não sai sozinho —,
com motivo, autor e prazo de revisão. Na lista da casa, de manhã, aparece só
quem **não** está simplesmente liberado, com o motivo escrito ao lado: a lista
inteira todo dia vira paisagem.

**Não existe pontuação de comportamento** (regra 3), e um teste guarda isso por
expressão regular para que não volte por uma refatoração. O motivo é prático: o
número viaja e o motivo fica para trás — daqui a seis meses "40" continua na
tela e "quebrou a porta três dias depois da visita da mãe que não veio" não
continua. Duas crianças com dois números na mesma lista já é comparação, mesmo
sem tela de ranking. E o número tira o autor: "o sistema tirou a saída dele" no
lugar de "eu decidi, e foi por isso" — e a segunda frase é a que sustenta a
conversa com o adolescente.

**Ausência não é liberação:** sem registro, a tela escreve "sem definição, a
casa faz o que sempre fez". **Nada se sobrescreve:** decisão nova encerra a
anterior, e o histórico responde "por que ele perdeu a saída em março".
**Suspensão exige prazo**, porque medida sem prazo vira permanente por
esquecimento. E **o prazo não devolve a autorização sozinho** — vencido, o
sistema lembra que combinou revisar e mantém o que está valendo. O motivo é
exigido **inclusive para liberar**: é a decisão que a técnica vai defender numa
audiência.

### 8.8 Ocorrências

Categorias; relatos independentes por autor; **registro protegido** (fala
espontânea e sinais observados) com política mais estreita; contenção com campos
próprios; síntese técnica; comunicação externa registrada — nunca enviada pelo
sistema. Caso de medicamento **não fecha sem síntese**, e a ordem é primeiro a
etapa operacional, depois a análise.

**A cobrança de relato.** Ao abrir ocorrência de violência ou suspeita,
conflito com agressão, contenção, erro de medicamento ou emergência de saúde, o
sistema pede o relato a **quem estava escalado naquele dia** — não a quem tem
vínculo com a casa. Sem escala montada ele **declara** que caiu no vínculo, em
vez de fingir que sabe quem estava lá. A pergunta é objetiva e **não descreve o
fato**: quem só vai dizer que não estava lá não deve receber o episódio inteiro
num aviso. Quem não viu marca "Não presenciei" num toque — e isso **é
responder**: fica relato com autor e horário, porque a diferença entre "não vi
nada" e "ninguém perguntou" é toda a diferença seis meses depois. Qualquer
pessoa pode acrescentar relato depois, cobrada ou não: a criança às vezes conta
dias depois. Equipe técnica, líder e coordenação veem **quem escreveu e quem
falta** — nome e estado, nunca o texto de ninguém; entre pares isso viraria
pressão de colega, e o relato tem de nascer do que a pessoa viu. **Quem marca a
categoria é quem abre:** o sistema não decide sozinho o que é grave.

### 8.9 Documentos

Dossiê do acolhido em cinco categorias com anexo real, prévia antes de enviar e
aceite separado; álbum de vivências; arquivo documental com fila de cópia; e as
folhas em Word com timbre — ATA, ocorrência, saúde, grade, combinados,
relatório, escala.

**Pré-visualização e download por setor:** toda folha abre na tela com a cara do
papel antes de virar arquivo. A Enfermagem baixa a saúde de um acolhido e a
grade do dia; a técnica baixa ATA e ocorrência; a coordenação e a gestão baixam
tudo.

A **grade "para colar na parede"** sai com horário, nome e medicamento, **sem
diagnóstico**, e com um aviso na própria folha de que corredor e mural aberto
não são lugar para o nome de uma criança ao lado do remédio dela.

### 8.9.1 A cozinha, sem a cozinha no sistema

A Fundação decidiu em 09/09 que a cozinha **não entra no sistema** por
enquanto. O que a casa faz é gerar documentos e entregá-los — em Word, com
timbre, porque circulam entre setores.

Isso muda o cuidado com o conteúdo: uma tela tem alcance, um **papel não tem**.
Ele fica em cima de bancada e é lido por quem passa. Por isso as três folhas
carregam o mínimo — nome pelo qual a criança é chamada, data, quantidade —, e
nunca diagnóstico, CPF, motivo judicial ou o motivo de uma restrição.

**Solicitação de lanche** e **solicitação de cesta básica** nascem da aba
"Pedidos para a cozinha". Pede **qualquer educador ou líder**: quem percebe que
falta lanche para a saída de sábado é quem está no turno, e o controle aqui é de
**autoria** — fica o nome —, não de acesso. A finalidade é obrigatória, porque
"1 lanche" sozinho obriga a cozinha a adivinhar.

**Não há trava de data.** A casa tem dezenove crianças e no dia chega a
vigésima: o lanche sai de qualquer jeito, e recusar o registro só faz a
contagem do mês nascer errada. As 48 horas que a cozinha pede para se organizar
são combinado entre pessoas, e o sistema não é o lugar de impor.

**Cancelar não apaga:** o pedido continua na folha, em seção própria, com o
motivo — a cozinha pode já ter comprado, e "sumiu do sistema" não desfaz compra.

**A tabela de restrições é uma VISTA** da mesma `food_restriction` que a equipe
técnica e a Enfermagem escrevem. Tabela à parte divergiria no primeiro ajuste, e
é aí que uma criança come amendoim.

**A contabilização** separa **porções** de **pedidos**: vinte lanches para a
saída do grupo é um pedido e vinte porções, e confundir os dois faz a casa
parecer que pede pouco. Conta também cestas, crianças alcançadas, cancelados e
**quantas pessoas distintas** pediram. Não conta quanto cada educador pediu: a
autoria de cada pedido tem nome na lista e na folha, mas somar por pessoa é
medir gente.

### 8.9.2 A portaria, sem a portaria no sistema

Como a cozinha: a portaria **não entra no sistema**, recebe uma folha em papel e
confere quem chega. Quem gera a folha é a equipe técnica ou a coordenação.

**Estar no cadastro não é estar autorizado.** O contato diz quem é da vida da
criança; a folha diz quem a casa deixa entrar. A autorização é uma marca no
contato, dada pela técnica ou pela coordenação, com o nome de quem deu e quando
— é essa pessoa que responde por quem entrou. Um tio recém-localizado ou a
técnica do CRAS não aparecem na guarita como liberados só por não terem
restrição.

**Contato com aproximação restrita nunca é autorizado**, e isso está no banco
(`contato_restrito_nao_visita`), não só na tela. Contato encerrado perde a
autorização junto. **A folha não diz quem NÃO entra**, nem por quê: numa
guarita, "proibido de ver a criança" já conta uma história. O custo — a
portaria só sabe que a pessoa não está na folha, e liga para a casa — está
escrito para o Marcelo (roteiro, §8, pergunta 6).

**O CPF vai impresso** (decisão dele de 09/09, levada ao DPO, §11). Guardado
normalizado; inteiro na tela só para quem escreve no cadastro, mascarado para o
educador. **As fotos:** a da criança sai sempre — a foto de identificação "não
entra em documento nenhum por padrão", e esta folha é o pedido que a tira de lá
—, e a do visitante é **opcional**; sem ela, a folha marca "pedir documento com
foto". Travar a folha em quem ainda não trouxe foto deixaria o visitante de
verdade do lado de fora. O servidor embute as fotos no Word; o protótipo mostra
a marca "foto" no lugar, porque o gerador dele não embute imagem.

A folha não traz motivo de restrição, observação do contato, motivo judicial nem
diagnóstico — procurado no Word **aberto** pela suíte, com frases-sentinela, e
visto reprovando quando o serviço foi sabotado. Ela diz que vale até ser
substituída; quem recolhe a anterior é pergunta para a casa.

### 8.10 Coordenação e gestão

Equipe e convites de primeiro acesso; o cadastro dos **aparelhos institucionais**
(que hoje é cadastro e não decide mais nada); transferências entre casas com as
duas caixas, conversa entre as coordenações dentro do sistema e recusa com
motivo que **aparece na outra casa**; cofre de acessos cifrado (AES-256-GCM,
chave no ambiente, abertura por comando que exige finalidade e **registra antes
de devolver**); benefícios e dados bancários com reautenticação e log por
visualização, com a **pendência bancária** primeiro na lista e exigindo uma linha
dizendo qual é; acompanhamentos com aprovação de segunda pessoa; relatórios que
saem do rascunho por um ato declarado e são aprovados por outra pessoa; a
**Sincronização** — o que este aparelho enviou, e os conflitos que esperam a
frase da equipe, **com as duas versões inteiras e nenhuma destacada**; o
**Painel das unidades** (ocupação, fluxo, pendências, o quadro de cada mês, na
ordem do código da casa); alinhamentos de equipe.

**Quem redige não aprova o próprio texto** — vale para acompanhamento, relatório
ao Judiciário e comunicação externa, inclusive quando a coordenação redige.

Os **combinados** têm porta própria no menu, e não só a aba dentro de
Acompanhamentos: quem mais precisa do combinado é o educador do turno da noite,
que não alcança Acompanhamentos. Um combinado que o turno não pode abrir não é
combinado — é recado que ninguém recebeu.

### 8.11 As oito casas pelo trabalho social

O Gestor Geral tem uma chave **🌱** no alto, junto do tema, que troca a operação
pela leitura do que o acolhimento produziu: quantas crianças, quantas entraram e
saíram, e **o que aconteceu de bom** — passou de ano, curso profissionalizante,
faculdade, primeiro emprego. Dá para abrir a **trajetória de uma criança**.

**O desenho é uma recusa.** As casas saem na ordem do cadastro e **nunca por
resultado**; não há média, meta nem "casa destaque"; a lista de quem conquistou
é por data. Comparar casas seria um ranking com outro nome — e a casa que recebe
adolescentes com medida recente não está na mesma corrida da casa-lar com quatro
crianças pequenas. **Ausência de marco não é dado:** quer dizer que ninguém
escreveu, não que nada aconteceu.

Saem dois documentos: o **relatório do período** (das oito casas para o Gestor,
ou de uma casa só para a coordenação dela) e a **trajetória de uma criança**,
que é a história dela para levar a uma audiência. Os dois passam pela finalidade
escrita e ficam registrados.

### 8.12 De onde os formulários vieram

O Marcelo entregou seis documentos de papel em 28/08/2026. **Nenhum dado real
deles entrou no sistema, nas fixtures ou nesta documentação** — foram lidos como
referência de campo e fluxo. O que cada um ensinou, e que está no código:

| Documento de papel | O que virou, e o que faltava |
|---|---|
| **LIVRO ATA – AI 03** (Google Forms, por turno) | as seções da ATA da casa. Faltavam duas: **acolhido em experiência familiar** (diferente de visita domiciliar — a criança está fora por um período e a casa continua responsável) e a **organização da casa por ambiente** (`checklist_ambientes`, os seis ambientes do papel). *O registro é do ambiente, nunca de quem arrumou — manter assim evita que a ATA vire ficha de comportamento* |
| **ATA – LÍDERES NOTURNO** (as oito casas) | virou **grade**, não lista: para cada casa, sempre as mesmas perguntas. A forma mudou o uso — a noite inteira numa tela, e **o que ficou em branco fica evidente**. Uma diferença em relação ao papel: **"sim" sem descrição não é registro**; o banco recusa, porque quem lê de manhã precisa do fato |
| **Modelo de Evolução de Saúde** | **acompanhante em texto** (quem leva à consulta às vezes é motorista ou familiar autorizado, e exigir usuário cadastrado obrigava a mentir no campo), comportamento ao chegar e ao sair, ocorrências no trajeto, data da reconsulta. O rodapé com duas assinaturas virou duas confirmações datadas, cada uma com seu dono |
| **Prontuário Individual de Evolução – Educação** | **sala de recursos** (motivo e professor), **equipe multiprofissional** (fono, pedagoga, psicopedagoga), **aprendizagem profissional** (curso, turno, unidade, local de trabalho) e a evolução educacional datada — que o educador também escreve, porque quem acompanha a tarefa de casa é ele |
| **Audiência Concentrada** | **quatro blocos por criança, não onze.** O documento que a Fundação levou à audiência tem Acompanhamento, Saúde, Educação e Profissionalização, Contexto Sociofamiliar — é mais curto porque foi escrito por quem redige de verdade, na véspera, para vinte crianças. As outras sete seções ficaram **opcionais**: onze títulos obrigatórios criariam campos vazios que, num documento judicial, são lidos como ausência de trabalho. E os quatro blocos são os mesmos eixos do acompanhamento mensal |
| **Planilha de dados bancários** | número do benefício, operação, agência, **pendência bancária** (a coluna que é o motivo de a planilha existir) e observação |

### 8.13 As decisões de produto que se desfazem sem querer

Cada uma foi escolhida contra uma alternativa razoável. Estão aqui porque são
fáceis de desfazer sem perceber, "simplificando".

- **Cinco abas, não seis.** A barra de baixo carrega o turno — Dia, Chamada,
  Acolhidos, Passagem. Tudo o mais mora em "Mais".
- **O CPF é conferido ANTES do resto**, no cadastro em quatro passos: histórico
  partido é o que faz a audiência perguntar o que o sistema deveria saber.
- **Correção não é sobrescrita.** Quando um registro fechado muda, o valor
  anterior vai para uma tabela de histórico com autor e horário. Nunca some.
- **O relatório sai em Word, não em PDF.** Quem assina precisa poder mexer: a
  técnica escreve a avaliação, a coordenação acrescenta uma linha antes da
  audiência, alguém corrige um nome. Um PDF fechado empurraria a equipe a refazer
  tudo no Word da máquina dela — e aí **o que vai ao Juízo deixaria de ter
  relação com o que está no sistema**. Converter para PDF é da pessoa, na hora
  de enviar.
- **A criança não é só o que deu problema.** O relatório de desenvolvimento puxa
  também as memórias e a evolução educacional: a apresentação no coral, a tarefa
  entregue sem lembrete. Um documento feito só de ocorrências e faltas devolve
  uma pessoa que não existe — e é esse documento reduzido que segue para a
  audiência, para a escola e para o próximo serviço.
- **O sistema conta; a pessoa avalia.** O relatório traz a parte factual já
  escrita, cada seção dizendo de onde veio; os campos de avaliação e
  encaminhamento vêm **em branco**, marcados como "a preencher". O sistema nunca
  interpreta, nunca conclui, nunca avalia ninguém, e nunca conta por educador.
- **Relato de ocorrência restrita não entra em relatório.** Sai a categoria, a
  data e a situação. Quem precisar do inteiro teor abre a ocorrência e responde
  pelo acesso dela — relatório circula: vai por e-mail, é impresso, fica em cima
  de uma mesa.
- **Seção vazia diz "não há"; ela não some.** Seção ausente vira dúvida de quem
  lê. A frase escrita vira informação.
- **A linha do tempo corrida conta a história.** As seções por assunto servem
  para conferir cada coisa; a cronologia junta a consulta de terça, a ocorrência
  de terça à noite e a dose recusada na quarta. Separadas, parecem três fatos
  independentes; em ordem, viram a explicação. Corta em 120 registros **e avisa
  que cortou**.
- **O dia das unidades não compara unidades**, e não tem modo individual: quem
  alcança uma casa recebe uma, quem alcança oito recebe oito. Acompanhar uma
  criança é dentro da casa dela — varrer as oito atrás de alguém é vigilância
  com outro nome, e o servidor recusa.
- **"Chegou remédio" e "conferi o armário" são duas ações.** Havia uma só, e ela
  mentia: substituía a quantidade e gravava como entrada — 10 sobre 30 deixava
  10, com o histórico jurando que uma entrada de 10 acontecera. O sistema não
  adivinha qual é qual pelo tamanho do número: contagem maior que o registrado
  acontece (frasco em outra gaveta), e entrada pequena não deixa de ser entrada.
- **O aviso de receita é sobre a receita, não sobre a tela.** A janela de 7 dias
  parte de HOJE. O painel de outro dia é o que a Enfermagem abre para revisar a
  véspera — e era aí que o alerta sumia justamente para quem foi conferir.

### 8.14 A linguagem que rotula

O documento de Audiência Concentrada contém, sobre adolescentes,
caracterizações como "comportamentos manipulativos". Não é crítica a quem
escreveu — é o vocabulário disponível na hora, para vinte crianças, na véspera.

Mas um documento judicial acompanha a pessoa por anos, e **um rótulo escrito uma
vez costuma ser lido como diagnóstico depois**.

O sistema **não censura texto** — não deve. O que ele faz é **pedir fato e
contexto** na ajuda de cada campo, e manter fonte, autor e data de cada trecho,
para que uma frase escrita numa segunda-feira difícil não vire característica
permanente de uma criança.

*"Alterou o relato em três ocasiões nesta semana" e "é manipuladora" descrevem
coisas diferentes: a primeira pode mudar, a segunda gruda.* Vale uma conversa
curta com a equipe técnica no treinamento do piloto.

---

## 9. O QUE FALTA

### Grupo 1 — falta para o piloto: **VAZIO**

Tudo o que a educadora de plantão precisa fazer às 23h tem porta.

### Grupo 2 — o que espera decisão de gente (3)

Nenhuma está parada por falta de código.

1. **Leitura excepcional de relato** (`POST /statements/:id/exceptional-read`).
   A regra está pronta: o Gestor Geral só abre uma narrativa pessoal declarando
   a finalidade, e o comando registra **antes** de devolver o conteúdo. **O que
   trava é outra coisa:** pela política comum, o relato restrito é INVISÍVEL ao
   gestor — ele não tem como saber que existe para pedir a leitura. Dar-lhe a
   porta exige decidir o que ele vê ANTES de abrir. Ver §10.6.
2. **Fontes do acompanhamento** (`POST /followups/:id/sources`). A rota grava a
   referência de um registro que embasou a avaliação, e **não existe rota que
   liste os candidatos**. De onde a técnica escolhe é decisão de produto. Ver
   §10.7.
3. **A correção da linha de uma casa na ATA Geral**
   (`PATCH /shifts/general-ata/:id/house/:houseId`) espera a resposta sobre quem
   lê a ATA Geral de dia. Ver §10.2.

### Grupo 3 — as 14 rotas sem porta

O número **não é contagem à mão**: é o tamanho da lista de exceções do
`rotas-sem-porta.spec.ts`, onde cada linha traz o motivo por extenso. Eram 34 em
01/09. Onze são rota de máquina que não deve ter tela — geração das doses e do
dia, geração da agenda, escalonamento de dose vencida, marcação de atividade não
confirmada, health check, `GET /medications/alert-offsets` e
`/can-administer` (o aparelho pergunta; quem decide continua sendo o servidor),
`GET /activities` e `GET /transfers/pending` (leituras cruas que a tela já
recebe juntas) e `GET /people/:id/admission` (a ficha inteira, para o documento
e para a migração da implantação).

### Achados de passagem, ainda sem conserto

- **O conferidor de fronteiras não lê SQL** (§4.3).
- **A conferência de concorrência só olha a coluna `status`.** Na fase 91 os
  serviços foram lidos também por colunas de fechamento (`signed_at`,
  `decided_at`, `revoked_at` e afins) sem guarda no WHERE, uma vez, à mão: só
  apareceu a revogação de sessão, que é idempotente. Isso não virou conferência.

*As quatro funções que gravavam só pelo id, anotadas aqui na fase 89, foram
provadas e consertadas na 90 (§6.11).*

### O que é meu e ficou pequeno

- **As fontes do protótipo**: embutir as duas famílias custa cerca de 300 KB. §10.10.
- **O prazo de triagem da Enfermagem** será parâmetro, e ainda não tem valor.

### O que não é código, e vale mais que tudo acima

**O protótipo já foi aberto e usado pela Fundação** — aprovado em 28/08, e os
pedidos de 09/09 (§10.5) nasceram desse uso. *Até a fase 90 esta seção dizia
que ninguém de fora o tinha aberto; estava errado, e o próprio roteiro já dizia
o contrário na primeira linha. Corrigido em 10/09 a partir da palavra do dono
do projeto.*

O que ainda não foi visto por gente é o que veio **depois** desse uso: as dez
entregas da fila de 09/09 (fases 76–88), que só ficaram alcançáveis no
protótipo nas fases 87 e 89. **O roteiro aplicado cargo a cargo continua sendo
a medida que falta** — seis ensaios de navegador dizem que a porta existe, e
não medem onde uma pessoa hesita.

---

## 10. AS DECISÕES QUE SÃO DO MARCELO

Nenhuma é problema de código. Estão paradas esperando resposta — **responda pelo
número**.

1. **Devolver um acompanhamento para correção não existe no servidor.** A tela
   tinha um botão que prometia isso; foi removido em vez de inventar a regra. A
   pergunta é se a equipe técnica deve poder devolver, e o que acontece com a
   versão que já estava lá.
2. **O recorte por casa deve valer para a ATA Geral do DIA CORRENTE?** No
   arquivo, cada casa recebe a linha dela. No dia corrente, a coordenação abre a
   folha inteira das oito casas — que era o combinado antes. *Junto disso: de
   dia, quem precisa ler a ATA Geral da noite anterior? Hoje só quem abre chega
   nela.*
3. **"Concluí tudo até agora" na linha do dia.** Facilitador pedido, mas a linha
   do dia contém doses de medicamento, onde "não existe marcação em lote" é
   absoluto. A versão segura ficaria limitada a atividades coletivas que não
   sejam medicação, como ato declarado.
4. **O Arquivo das ATAS abre no mês de calendário** e fica quase vazio todo dia
   1º. Um quarto recorte, "últimos 30 dias", resolveria.
5. **A grade de medicação "para colar na parede"** saiu sem diagnóstico e com o
   aviso na própria folha. Se a casa quiser diferente, é decisão dela.
6. **O que o Gestor Geral vê ANTES de abrir um relato restrito.** O precedente
   dos documentos mostra a contagem e nada mais: "existem 2 documentos em área
   restrita". A pergunta é se aqui vale o mesmo, ou se ele precisa também da
   data e do autor para saber o que está pedindo. **Enquanto não houver
   resposta, a tela não será construída** — inventar isso sozinho seria decidir
   quanto da narrativa de uma criança vaza antes da justificativa.
7. **De onde a equipe técnica escolhe as fontes de um acompanhamento** — a linha
   do tempo da criança no período, as ocorrências, ou as evoluções de saúde?
   Cada opção desenha uma tela diferente.
8. **"Administrado com atraso"** é informação útil para a Enfermagem, ou
   cobrança injusta com quem estava com uma criança no colo? Hoje o sistema
   marca; mudar é trocar o rótulo por um que descreva o fato sem julgar quem
   estava de plantão.
9. **O PIA — último e próximo.** A lista da casa traz duas colunas de data, e
   nas vinte crianças elas são iguais (18/06 e 18/09), o que sugere controle por
   uma data única na planilha, e não por criança. **A pergunta:** as datas são
   mesmo iguais para todo mundo, e o sistema deve avisar por criança quando o
   próximo PIA está chegando — 30 dias antes, na tela da técnica?
10. **As fontes do protótipo.** Embutir a *Atkinson Hyperlegible* e a *Plus
    Jakarta Sans* custa cerca de 300 KB no arquivo; não embutir significa que, offline —
    que é como ele é entregue —, a letra não é a que a equipe vai ver, e que com
    internet cada abertura faz uma requisição a um terceiro. A Atkinson foi
    escolhida por ser desenhada para leitura difícil, que é o caso de quem lê um
    alerta no corredor.
11. **A Enfermagem vê a internação — decisão MINHA, a confirmar.** A resposta da
    coordenação em 03/09 listou equipe técnica, líder educador e coordenador, e
    disse que o educador social comum não vê. Incluí a Enfermagem porque
    internação é primeiro um fato de saúde, e é ela quem responde por medicação
    e retorno. *Ganhou apoio na resposta de 08/09: se a Enfermagem atende das 9h
    às 17h, é ela quem recebe a criança de volta na alta.* Desfaz-se numa linha
    em `app_pode_ver_internacao`.

### As que já foram respondidas — e o que mudou

*Guardadas aqui para ninguém reabrir sem saber o que já foi decidido.*

| Data | Pergunta | Resposta, e o que virou código |
|---|---|---|
| 08/09 | **Quem dá o remédio** | Enfermagem 9h–17h; educador de plantão fora disso. O protocolo por período saiu; entrou a **exceção por medicamento**. Migração 0930 |
| 08/09 | **Onde o aparelho da casa recebe o código** | **A pergunta deixou de existir.** O sistema roda no celular de cada pessoa: não há mais aparelho único para ser a trava. Dose não se confirma sem sinal, em aparelho nenhum |
| 08/09 | **A medicação a qualquer horário** | O horário previsto EXISTE — o esquema traz duração, doses e horários da bula. Sobrou só a pergunta 8 acima |
| 28/08 | Limite de vagas por casa | 20 nas oito unidades, alterável pela coordenação com motivo registrado (`house.capacity` + `house_capacity_change`) |
| 28/08 | **Casa cheia bloqueia acolhimento?** | **Não.** Exige justificativa registrada (mínimo 15 caracteres) e marca `over_capacity`. Uma criança com guia na mão às 23h não pode esbarrar num CHECK. *Se a Fundação preferir bloqueio real, é uma condição a inverter — mas a escolha precisa ser consciente* |
| 28/08 | As senhas de gov.br, INSS, CTPS e banco | Ficam no sistema, com a coordenação de cada casa, cifradas em AES-256-GCM. Sem isso continuariam numa planilha compartilhada sem cifra nem registro |
| 28/08 | O conteúdo do cofre físico | **Não entra no sistema.** Nenhum campo criado |
| 28/08 | A comunicação operacional sai do WhatsApp | O diagnóstico do Leonardo é o que importa: *eles usam o WhatsApp porque ainda não têm um sistema.* **Condição de sucesso, não técnica:** registrar aqui precisa ser mais rápido do que digitar no aplicativo |
| 28/08 | Quem marca compromisso na linha do tempo | Líder Diurno, equipe técnica, coordenação e Enfermagem. O educador executa e confirma; marcar é de quem responde pelo planejamento |
| 28/08 | Compromisso com responsável nomeado ou "de quem estiver no plantão" | `commitment.responsible_mode`. Nomear alguém fora da escala **avisa e não bloqueia** — escala muda, troca de plantão existe, e a saída pode ter sido combinada assim |
| 28/08 | A agenda futura é **projetada**, não materializada | Marcar a consulta de outubro não cria sessenta linhas, e mudar o horário não reescreve o que já passou. Só o dia corrente vira `activity` |
| 28/08 | **Quem redige não aprova o próprio texto** | Acompanhamento mensal e relatório ao Judiciário. Vale inclusive quando a coordenação redige. Em casa com uma única técnica, ajusta-se quem aprova, não o fluxo |
| 28/08 | O motivo judicial é área restrita | `judicial_record` com policy própria: equipe técnica, coordenação e Gestor Geral. O educador não lê nem consultando o banco direto |
| 28/08 | Falha de arquivamento no Drive escala em três tentativas | `app_archive_transition` devolve `escalar` na terceira. Número ajustável sem tocar no fluxo |
| 27/08 | Nome e origem antes do aceite de transferência | Aparecem. Aceitar ou recusar uma criança sem saber quem ela é não é decisão, é sorteio. O perfil continua fechado até o aceite |
| 27/08 | As duas coordenações **conversam dentro do sistema** | `transfer_message`, restrita às duas casas, mensagens imutáveis. Substitui a ligação e o WhatsApp sem que ninguém entre na casa do outro |
| 27/08 | Recusa de transferência exige motivo | Mínimo 15 caracteres, registrada **nas duas casas** |
| 27/08 | O plantão noturno pertence ao **dia em que começou** (19h–7h) | Sem isso, quem abria às 23h50 e quem abria às 00h10 criavam dois plantões para a mesma noite, e o Líder Noturno não encontrava as ATAs |
| 27/08 | **Quem redige a comunicação externa não a aprova** | Gatilho `extcom_guard` recusa `approved_by = created_by` |
| 27/08 | A coordenação cadastra a equipe da casa; conta de alcance institucional é do Gestor Geral | Se a coordenação pudesse criar Gestor Geral, bastaria cadastrar alguém para enxergar as oito casas — o isolamento cairia por dentro |

---

## 10.5 A FILA DO MARCELO — o que ele pediu em 09/09/2026

Da conversa longa de 09/09: **doze pedidos estão entregues**, **um espera
código** e **três estão travados por resposta da casa**. *Até a fase 88 esta
frase começava com "treze pedidos" e somava dezesseis desde a fase 86; ninguém
soube dizer de onde vinha o treze, e ele saiu daqui. O conferidor de números só
lê o §2 — número fora dele envelhece sem que nada reclame.*

### Entregues (fases 76–93)

| # | O quê | Fase |
|---|---|---|
| 1 | **Desmarcar uma ocorrência** do compromisso sem cancelar a série | 76 |
| 2 | **Hora de sair, hora de chegar e endereço** no compromisso | 76 |
| 3 | **Cor por categoria** na linha do tempo, com o estado na pílula | 77 |
| 4 | **Cor por pessoa**, escolhida e sem repetir na casa | 78 |
| 5 | **Cobrança de relato** em ocorrência grave, com "não presenciei" a um toque | 79 |
| 6 | **Acolhido em experiência familiar** — sai da grade, a vaga fica | 80 |
| 7 | **Sair sozinho** como estado, com motivo e prazo — nunca pontuação | 81 |
| 8 | **A cozinha**: pedidos de lanche e cesta, três folhas em Word, contabilização, cargo oculto, métrica no painel | 82–84 |
| 9 | **Estoque, nota fiscal e receita** + o remédio que vai com a criança | 85–86 |
| 10 | **O retorno da visita na ATA e na passagem**, com o que ela trouxe de casa | 88 |
| 11 | **A folha da portaria** — quem pode visitar, com CPF e foto 3×4 (§8.9.2) | 92 |
| 12 | **O que o plantão vê no perfil** — a coordenação liga e desliga, sobre lista fechada (§8.2.1) | 93 |

⚠️ **Entregue não era o mesmo que visível.** Até a fase 87, **cinco** dos nove
não apareciam — ou apareciam errados — no protótipo, que é a única coisa que o
Marcelo abre: a hora de sair (3), a cobrança de relato (5), o remédio que vai
junto (9), e o "sair sozinho" (7) mostrando um travessão no lugar do nome da
criança. O código estava certo nos quatro; o servidor de mentira é que não
tinha dado. Ver §6.14 e §6.19. **Se algum destes for demonstrado ao Marcelo,
vale abrir a tela antes** — foi a fase 87 que as tornou alcançáveis, e nenhuma
delas foi vista por gente ainda. *A décima repetiu o defeito: o retorno da
fase 88 só apareceu no protótipo na 89 (§6.14).*

### Esperam código — nenhuma bloqueada por decisão

**1. A REUNIÃO DE EQUIPE COM PAUTA.** Nem toda a equipe participa — a maioria das
reuniões é diurna e o noturno não vai. O que foi decidido é disparado para toda a
casa; regras de convivência viram um **estatuto** dentro do sistema; e o educador
**propõe pauta**. Quem decide se entra é a técnica, o líder ou a coordenação — e
**responde ao educador por que ficou de fora**. Uma pauta recusada sem resposta é
pior do que não poder propor. O módulo `alignments` já existe e é a base.

### Travadas — esperam a casa, não código

| # | O que falta saber | Por que trava |
|---|---|---|
| 1 | **A escala 12x36 vigente da Casa 03** | Sem ela o sistema não sabe quando o plantão termina nem quem está nele — e o **aviso de meia hora antes do fim do plantão** (quem não preencheu a ATA) depende disso. *Detalhe: o "horário de Brasília" que ele pediu já é o que o sistema usa; Porto Alegre é o mesmo fuso* |
| 2 | **O lembrete de prazo: vencendo o quê, e com quantos dias?** | Atividade, documento, PIA, receita? A antecedência muda o desenho |
| 3 | **O pente-fino: em que dia da semana?** | Ele o quer semanal; falta o dia |

*Sobre o aviso de meia hora, uma regra que vale desde já:* ele é do **turno
corrente e não acumula por pessoa**. O painel do plantão já proíbe contagem por
educador, e um histórico de "quem sempre atrasa a ATA" é medição de gente.

*E sobre a chamada:* fralda, mamadeira e chupeta serão **marcadores por criança**,
ligados e desligados pela equipe técnica — **nunca automáticos por idade**. Uma
criança de cinco anos pode usar fralda, e um sistema que decide isso pela data de
nascimento erra exatamente com quem já tem menos margem.

### O que eu recusei, e o que ofereci no lugar

**WhatsApp.** Ele pediu um botão para mandar o pedido de lanche por WhatsApp.
Regra 3, sem exceção — e ele mesmo recuou no meio da frase. O documento é
baixado e levado pelo canal que a instituição decidir. Um botão de WhatsApp
dentro do sistema desfaz, no primeiro clique, a decisão de 28/08 de tirar a
operação de lá.

**Pontuação de comportamento.** Ele descreveu pontos: "quebrou alguma coisa,
perde tantos pontos". Regra 3. O raciocínio dele é bom — confiança construída
merece registro —, mas o número viaja e o motivo fica para trás: daqui a seis
meses "40" continua na tela e "quebrou a porta três dias depois da visita da mãe
que não veio" não continua. Duas crianças com dois números na mesma lista já é
comparação. E o número tira o autor: *"o sistema tirou a saída dele"* no lugar de
*"eu decidi, e foi por isso"* — e é a segunda frase que sustenta a conversa com o
adolescente. **O que construí no lugar** (§8.7.2) dá a mesma frase que ele pediu,
com motivo, autor e prazo de revisão.

**Soma de pedidos por educador.** Ele pediu "quantos educadores solicitaram, qual
deles". O "qual deles" existe: cada pedido tem nome. O que não fiz foi **somar
por pessoa** — num painel de oito casas isso vira comparação entre equipes.
Ficou a contagem de pessoas **distintas**, que responde "a casa inteira usa isto
ou só duas?" sem apontar para ninguém.

---

## 11. O QUE DEPENDE DA FUNDAÇÃO

Nada aqui é código. Cada um está tratado como **configuração ou interface
desacoplada** — nenhuma pendência virou regra inventada.

| # | O que | Como está tratado |
|---|---|---|
| 1 | **A escala 12x36 vigente da Casa 03** | A TELA existe desde 08/09. Falta o **conteúdo** — quem trabalha quando —, e ele é da casa |
| 2 | **A janela de acesso por plantão (T-10/T+10)** | **Não implementada.** Com a escala por data ela passou a ser possível; ligá-la é decidir que alguém fica sem abrir o sistema fora do horário |
| 3 | **Os códigos e nomes reais das oito unidades** | AI1–AI4 / ARM1–ARM4 são preliminares e aparecem em tela, relatório e nome de arquivo. Trocar é um `UPDATE` de `house.code` — os IDs internos são UUID |
| 4 | **O SMTP institucional** | Ver §12.7. Sem ele não há convite, e sem convite não há primeiro acesso para 40 pessoas sem distribuir senha por mensagem |
| 5 | **O prazo de triagem da Enfermagem** | Será parâmetro |
| 6 | **O horário oficial do Líder Noturno Geral** | `NIGHT_SHIFT_END_HOUR` no `.env` (7h como hipótese). A hora de INÍCIO não é lida por ninguém: quem abre a ATA Geral é uma pessoa, não um relógio |
| 7 | **Relatórios obrigatórios no piloto** | Todos marcados como candidatos; seleção com o Marcelo |
| 8 | **Permissões de fotos em memórias** | Modelo planejado; upload desabilitado por flag até confirmação |
| 9 | **Os dados de partida** | Equipe, acolhidos já na casa, e a decisão de quanto do histórico em papel entra no sistema |
| 10 | **LGPD** | Quem responde, por quanto tempo se guarda, o que se apaga |
| 11 | **Critérios de aceite do piloto e autoridade** | O §13 tem a proposta; falta a Fundação assinar embaixo |
| 12 | **A folha da portaria com CPF e foto impressos** | Decisão do Marcelo em 09/09, construída na fase 92. É dado pessoal de TERCEIRO (familiares) — CPF, telefone e, quando cadastrada, a foto 3×4 do visitante —, e a foto de identificação da criança, numa folha que fica na guarita, o lugar menos controlado da instituição. O DPO precisa ver antes do piloto, junto com a pergunta de uma segunda lista, de quem NÃO entra |

### Os seis formulários de papel que ainda faltam

Recebidos em 28/08: livro ATA, ATA dos líderes noturnos, evolução de saúde,
prontuário de educação, audiência concentrada, dados bancários (§8.12). Faltam:

1. **A folha real de administração de medicamentos.** É a mais importante das
   seis: é o **único módulo ainda desenhado a partir do documento e não do papel
   que a casa usa**, e é onde o erro custa mais caro.
2. **A agenda / rotina real** (diária e semanal), para a rotina do sistema
   nascer igual à da casa.
3. **O formulário de ingresso / PIA.**
4. **O modelo de passagem individual.** Hoje a nossa é uma **proposta**: três
   campos (o que foi feito, o que fica pendente, o que o próximo turno precisa
   saber), assinatura individual e **complemento** para o que a pessoa lembra
   depois — ao lado da passagem, nunca por cima dela. É o desenho a conferir com
   o papel quando ele chegar.
5. **Os formulários de ocorrência e contenção.**
6. **Um exemplo de escala 12x36**, com os horários da técnica e da Enfermagem.

*Se algum não existir, desenhamos a partir dos requisitos e submetemos à
validação operacional antes de tornar definitivo — foi o que já aconteceu com a
passagem.*

⚠️ **A lista real das crianças da Casa 03** chegou por anexo em 03/09, com nome,
filiação, CPF, RG, SUS, processo e **chave de acesso ao processo** de vinte
crianças. Ela foi lida como **especificação de campos** e **nada dela entrou no
sistema**. Dado real só entra na implantação, com a LGPD decidida e autorização
expressa (regra 1). Se um anexo assim aparecer de novo, este parágrafo é o
lembrete.

---

## 12. IMPLANTAÇÃO

O que separa **protótipo aprovado** de **sistema rodando na casa**.

### 12.1 A configuração

Copie `.env.example` para `.env`. **Toda** variável lida pelo servidor está lá:
`implantacao.spec.ts` recusa a construção se alguém acrescentar uma e esquecer
de documentá-la — e recusa também o contrário, variável no exemplo que ninguém
lê, porque uma chave que não faz nada ensina a não confiar no arquivo inteiro.

Três valores decidem se o sistema é seguro, e nenhum tem padrão que sirva:

| Variável | O que acontece se ficar como está |
|---|---|
| `SESSION_PEPPER` | sessões assináveis por quem leu o repositório |
| `CREDENTIAL_KEY` | o cofre de credenciais dos acolhidos abre para quem leu o repositório |
| `DATABASE_APP_URL` | a aplicação roda como superusuário, e o RLS deixa de proteger |

### 12.2 Os dois acervos que vivem fora do banco

O banco **não** guarda os arquivos. São dois lugares, e o backup precisa dos
dois:

- **`ARQUIVOS_DIR`** — os objetos do dossiê do acolhido: certidão, foto, laudo,
  comprovante;
- **`ARQUIVO_DRIVE_DIR`** — as cópias documentais arquivadas.

*Até 02/09 o segundo se chamava `ARQUIVO_DIR`, uma letra de diferença do
primeiro. Quem configurasse um acreditando ter configurado os dois perderia
metade do acervo no primeiro backup — e descobriria isso no dia em que
precisasse restaurar, que é o pior dia possível para descobrir qualquer coisa.*

Perder um dos dois é perder documento de criança **sem que o banco acuse nada**:
ele continua dizendo que o arquivo existe.

### 12.3 Subir o sistema — e provar que ele sobe

```bash
npm run ensaio:producao
```

Constrói, cria um banco virgem, aplica as 99 migrações **pelo binário
compilado**, sobe o serviço e confere `/health`. Não publica nada e não toca no
banco de trabalho.

*Este ensaio existe porque o projeto passou 62 fases sem nunca rodar compilado, e
a primeira rodada encontrou duas coisas que teriam quebrado a implantação: o
`dist/` saía com **zero migrações** (os `.sql` vivem em `src/modules/…`, e o
`tsc` não copia `.sql`), e a migração dependia de `tsx`, que é dependência de
desenvolvimento. Quem implantasse só o `dist/` subiria o serviço, veria
`/health` responder "ok" e descobriria o banco vazio — o `/health` responde ok
porque o banco EXISTE; ele não sabe se as tabelas estão lá.*

A ordem na implantação:

```bash
npm ci                       # na raiz — é um workspace
npm run build -w backend     # compila e copia migrações e timbre
npm run build -w frontend    # o PWA
DATABASE_URL=…  npm run migrate:prod -w backend
DATABASE_APP_URL=… node backend/dist/main.js
```

`DATABASE_URL` é do **dono** do banco (migra); `DATABASE_APP_URL` é da
**aplicação** (`rede_app`, sem superusuário, com o RLS valendo).

**Trocar os dois desliga o RLS.** Desde a fase 64 o serviço confere isso ao subir
e **recusa arrancar**, dizendo qual variável está trocada, no log, antes de
aceitar qualquer requisição.

### 12.4 Backup

```bash
bash scripts/backup.sh /var/backups/rede-acolher
```

Salva o banco (formato `custom`), os dois acervos, e um `SOMAS.txt` com o sha256
de cada arquivo. Rode por `cron`, diariamente, **fora do horário de troca de
turno**. Retenção padrão de 30 dias (`BACKUP_RETER_DIAS`).

**O que o backup NÃO leva, de propósito: a `CREDENTIAL_KEY`.** A intuição erra
nas duas direções:

- **sem a chave**, o backup restaura o cofre como bytes ilegíveis — as
  credenciais morrem com a chave, não com o servidor;
- **com a chave guardada junto**, o backup restaura o cofre **aberto** para quem
  encontrar a cópia. Uma pasta de backup extraviada passa a valer as senhas de
  gov.br e INSS de vinte crianças.

A chave vive em outro lugar, com outro dono, e quem responde por ela é a
Fundação. **Escreva onde ela está antes de precisar dela.**

### 12.5 Restauração — e a prova de que ela funciona

```bash
npm run ensaio:restauracao   # o ciclo inteiro num banco descartável
```

Faz o backup, cria um banco descartável, restaura, confere as contagens das
tabelas que importam e **abre o cofre com a chave do ambiente**. Sai com código
1 se qualquer coisa não bater. Rode pelo menos uma vez por mês, e sempre depois
de mudar qualquer coisa no servidor.

**Um backup que nunca foi restaurado não é backup: é uma esperança guardada em
disco.**

A restauração de verdade pede o nome do banco de destino **escrito à mão** antes
de sobrescrever:

```bash
bash scripts/restaurar.sh /var/backups/rede-acolher/2026-09-02-0345 <URL-destino>
```

*O que o ensaio ensinou: a primeira lista de tabelas a conferir tinha dois nomes
que **nunca existiram**. O conferidor respondia "erro" nos dois lados, e dois
erros iguais se leem como acordo — a conferência passava sem conferir nada. E a
conferência do cofre foi provada **falhando**, com uma chave errada: um
conferidor que só foi visto dizendo "sim" não foi visto.*

### 12.6 O relógio

Duas fontes de hora: o servidor e o banco. As migrações usam `app_hoje()`
justamente para não dependerem do relógio de quem executa — mas o serviço também
formata datas, e uma diferença de minutos aparece disfarçada de qualquer outra
coisa: dose "atrasada" que não está, plantão noturno que cai no dia errado, ATA
que abre duas vezes.

Isto foi medido: com o relógio do processo adiantado em relação ao do banco,
atravessando a meia-noite, **dezessete testes, em cinco suítes, caem** — `app_hoje()` no SQL
responde um dia e `hojeNaInstituicao()` no TypeScript responde outro. Não é
defeito do código; é requisito de implantação. Os números vão por extenso de propósito: escritos em algarismo, o conferidor os lê como afirmação sobre o tamanho da suíte — e está certo em ser burro. Fica escrito porque a falha,
quando vier, vai parecer qualquer outra coisa.

Ative NTP nos dois. Se só um puder ser confiável, que seja o **banco**.

### 12.7 O SMTP institucional

Hoje o `MailGateway` escreve numa **caixa local** (`EMAIL_DIR`). Nada sai para a
rede, de propósito: um envio real ligado durante o desenvolvimento é exatamente
o caminho pelo qual um convite de teste chega na caixa de alguém da Fundação.
Trocar por envio real não muda nada em `InviteService` — o contrato é enviar.

**Regra que não se negocia:** o log registra que um e-mail saiu, para quem e por
quê — **nunca o corpo, nunca o link, nunca o token**. Token é credencial.

**O que precisamos saber:**

| # | Pergunta | Por que importa |
|---|---|---|
| 1 | Qual o **provedor de e-mail** do `paodospobres.com.br`? | define host, porta e autenticação |
| 2 | Qual o **endereço remetente**? | precisa existir como conta ou alias, e não pode ser a conta pessoal de ninguém |
| 3 | **Quem administra o DNS**? | SPF e DKIM se configuram lá; sem eles o convite cai em spam |
| 4 | **Onde o sistema vai rodar**, e qual o IP de saída? | alguns provedores exigem liberar o IP, e o link precisa de endereço acessível |
| 5 | A equipe abre o e-mail no **celular** ou só no computador? | se for só no computador, o primeiro acesso acontece lá — muda o roteiro do piloto |
| 6 | Existe **política de retenção** de e-mail enviado? | o convite é uma porta; não deve ficar arquivado para sempre |

**No domínio, antes do primeiro envio:** SPF (autoriza o servidor de saída),
DKIM (assina a mensagem — num sistema cujo e-mail contém link de acesso, isso
não é higiene, é segurança) e DMARC (comece em `p=none` e endureça depois de uma
semana lendo os relatórios).

**Variáveis:** `SMTP_HOST`, `SMTP_PORT` (587 com STARTTLS), `SMTP_USER`,
`SMTP_PASS` (**senha de aplicativo**, não a senha da conta), `EMAIL_REMETENTE`,
`APP_URL` (https).

**Como validar sem incomodar ninguém**, nesta ordem e só depois da autorização:
caixa local → servidor de captura na rede interna (Mailpit/MailHog) → **um**
envio real para **uma** caixa de teste da própria Fundação → o primeiro convite
de verdade, para uma pessoa, com ela ao lado.

⚠️ **Nunca rodar um teste de envio com a lista real da equipe.** Quarenta
convites disparados por engano derrubam as sessões de quarenta pessoas e
embaralham as senhas de todas — no meio de um turno.

---

## 13. O PILOTO DA CASA 03

O piloto não é "ligar o sistema na casa". É descobrir, **com uma casa só e com o
papel ainda funcionando ao lado**, o que o sistema errou — e ter tempo de
corrigir antes que oito casas dependam dele.

**O que já está pronto:** tudo do §8. **O que falta é o §11** — e o retorno do
roteiro.

### 13.1 Preparação — antes de qualquer acesso da equipe

| # | O que | Quem | Pré-condição |
|---|---|---|---|
| 1 | Confirmar códigos e nomes reais das oito unidades | Gestor Geral | AI1–AI4 / ARM1–ARM4 são preliminares |
| 2 | Cadastrar a equipe real da Casa 03 por setor | Coordenação | e-mails institucionais individuais criados, e o SMTP de pé (§12.7) |
| 3 | **Montar a escala 12x36 vigente** | Coordenação | a tela existe; falta o conteúdo. Sem ela, as pendências de passagem caem no vínculo da casa e o aviso de "fora da escala" não funciona. **É pré-requisito, não enfeite** |
| 4 | Conferir o limite de vagas da casa | Coordenação | 20 é o padrão; alterar exige motivo registrado |
| 5 | Definir a chave do cofre (`CREDENTIAL_KEY`) | TI | fora do código, no ambiente |
| 6 | Conta institucional aprovada para o Drive | TI + Gestor Geral | pasta compartilhada com as áreas separadas |
| 7 | Backup agendado e **restauração ensaiada uma vez** | TI | `npm run ensaio:restauracao` (§12.5) |

**Nada de dado real entra antes do item 5.** Um cofre de acessos sem chave
própria é um cofre com a fechadura do fabricante.

### 13.2 A migração dos vinte perfis

Feita **pela equipe técnica, pelo sistema** — não por importação de planilha. A
razão é operacional, não técnica: o cadastro completo tem campos que a planilha
atual não tem (motivo judicial estruturado, guia, referência familiar
autorizada, cuidados essenciais), e preenchê-los uma vez, lendo o prontuário, é
o que transforma a migração em **revisão de dados**.

Vinte cadastros, dois por dia, é uma semana e meia — e é a semana em que a
equipe aprende o sistema com as crianças que ela conhece.

Ordem por acolhido: cadastro completo (identificação, acolhimento, judicial) →
saúde (alergias, condições, restrições) → prescrições vigentes, conferidas com a
Enfermagem → escola e prontuário de educação → benefícios e acessos, pela
coordenação, com reautenticação → compromissos fixos na agenda.

**Ao fim de cada dia**, conferir na tela "os 20" se o que foi cadastrado bate com
o que a equipe sabe de cor. Divergência encontrada aqui é barata.

### 13.3 Treinamento — três encontros curtos

Não existe treinamento de sistema para quem trabalha em plantão de 12 horas.
Existe **treinamento de tarefa**: a pessoa faz o que ela já faz, na tela.

- **Educadores (1h, no início do plantão):** linha do tempo do dia, confirmar
  atividade, registrar exceção com justificativa, chamada, passagem individual
  no fim do turno, e o ⏮ turno anterior na ATA. Cada um faz a própria passagem.
- **Líder Diurno, técnica e coordenação (1h30):** agenda, ATA e fechamento com
  pendência, ocorrência, acompanhamentos, aprovações, transferência. Coordenação
  também: equipe, escala, limite da casa, benefícios e cofre.
- **Enfermagem (1h):** esquemas, grade de doses, confirmação, evolução com as
  duas assinaturas, triagem, Resumo de Saúde, e a **exceção por medicamento**.

Material: o próprio sistema, com dados fictícios. **Nada de apostila** — o que
não se aprende fazendo, não se lembra às 3h da manhã.

### 13.4 Operação em paralelo — quatro semanas

O papel continua. Não como plano B envergonhado: como **fonte de verdade** até a
última semana. Quem preenche os dois é a mesma pessoa, e é por isso que o
paralelo precisa ser curto.

| Semana | No sistema | No papel |
|---|---|---|
| 1 | linha do tempo, chamada, atividades | tudo o que já é papel hoje |
| 2 | + passagem individual e ATA | ATA em papel, para comparar |
| 3 | + medicação, ocorrência, agenda | folha de medicação em papel |
| 4 | tudo | papel só para conferência do dia |

**Ritual diário (10 minutos, no fim do turno diurno):** a coordenação compara a
ATA do sistema com a do papel e anota as diferenças. **A diferença é o dado mais
valioso do piloto inteiro** — cada uma é o sistema pedindo algo que a casa não
faz, ou deixando de perguntar algo que a casa faz.

### 13.5 O que decide se o piloto deu certo

Nenhum destes critérios é sobre "o sistema funcionou". Todos são sobre a casa.

| Critério | Como se mede | Meta |
|---|---|---|
| A passagem chega ao próximo turno | passagens assinadas / escalados no plantão | ≥ 90% na semana 4 |
| A ATA fecha no dia | ATAs fechadas no próprio dia | ≥ 90% |
| A medicação é confirmada na hora | doses confirmadas em até 30 min do horário | ≥ 95% |
| **O registro é mais rápido que o WhatsApp** | tempo medido, com cronômetro, em 5 passagens | ≤ 3 min por passagem |
| A equipe encontra o que procura | 5 tarefas cronometradas, sem ajuda | 4 de 5 sem travar |
| Nada se perde sem internet | operações offline aplicadas na reconexão | 100% |
| O documento chega ao Drive | itens verificados / itens fechados | ≥ 98% |

E um critério que não é número: **ao fim das quatro semanas, a equipe prefere o
sistema ao papel.** Se não preferir, o piloto não terminou — mesmo que todos os
números acima estejam verdes.

### 13.6 Os riscos, e o que fazer com cada um

**A equipe volta para o WhatsApp.** É o mais provável, e não se resolve com
proibição: se registrar aqui for mais lento, o aplicativo ganha. Medir o tempo
(critério 4) é o que transforma isso em problema visível na semana 1, e não em
fracasso silencioso na semana 4.

**A confirmação de dose exige sinal.** Desde 08/09 dose não se confirma offline
em aparelho nenhum, e a recusa vem na hora com a frase. Onde o sinal da casa for
ruim, isso vira fricção real num momento ruim. O piloto é onde se descobre se
dói — e a saída, se doer, é de rede, não de código.

**O paralelo cansa.** Preencher duas vezes gera resistência que parece rejeição
ao sistema. Por isso quatro semanas, com escopo crescente, e não "até
estabilizar".

**Cadastro incompleto vira débito.** O que entrar sem motivo judicial, sem
referência familiar ou sem cuidado essencial fica invisível — e reaparece na
primeira audiência. Conferência ao fim de cada dia de migração.

**A janela T-10/T+10 não está ligada** (§11.2). Ligá-la durante o piloto
bloquearia trabalho legítimo antes de alguém saber se a escala reflete a
realidade. Se for ligada, que comece **só observando**.

### 13.7 Expansão — depois, e só depois

Uma casa por vez, com duas semanas de intervalo, na ordem que a Fundação
escolher. Cada casa nova repete a preparação (equipe, escala, limite) e faz
**uma semana** de paralelo, não quatro: o que se aprende no piloto é justamente
o que encurta o resto.

A Casa 03 continua sendo a referência: mudança que der certo lá vale para as
outras; mudança pedida por uma casa só é conversa antes de virar código.

### O roteiro do Marcelo

`roteiro-marcelo.md` (e o `.docx` gerado dele) leva 44 tarefas do roteiro à Casa 03, cargo a
cargo — dez delas nasceram na fase 87, uma na 88 e uma na 89, para o roteiro alcançar as entregas de
09/09. **Ele ficou longo: aplique por cargo, e pare onde o tempo acabar.**
Como se aplica:

- **uma pessoa por vez**, com o protótipo aberto;
- **quem aplica não explica antes** — pede a tarefa e cala;
- o que interessa **não é a opinião sobre a tela; é onde a pessoa para**;
- anote três coisas por tarefa: achou? (sim / com ajuda / não), quanto tempo
  (10s / 30s / desistiu), e **a frase dela** — que é o dado mais valioso.
  *"Isso aqui é a passagem?" vale mais que "achei confuso".*

**O que não perguntar:** se ela "gostou" (vai dizer que sim); sugestão de layout
(peça a tarefa — onde ela parar é o layout falando); "achou fácil" (anote o que
ela fez e o tempo).

### O risco que decide o piloto

**A adoção sob carga real.** A comunicação operacional migra do WhatsApp para o
sistema — e a condição de sucesso não é técnica: **registrar aqui precisa ser
mais rápido do que digitar no aplicativo.** Se for mais lento, o WhatsApp volta
sem aviso. É isso que o piloto tem de medir.

---

## 14. COMO COMEÇAR UMA CONVERSA NOVA

Anexe **este arquivo** e o **`rede-acolher-atualizado.zip`**, e cole o bloco
abaixo como primeira mensagem, trocando só a última linha.

```
Você é minha equipe digital no projeto REDE ACOLHER — plataforma interna de
gestão do acolhimento institucional da Fundação O Pão dos Pobres, em Porto
Alegre. 8 unidades, ~20 acolhidos cada, Casa 03 (código AI3) como piloto. O
contato na Fundação é o Marcelo Barbosa (mbarbosa@paodospobres.com.br), e é ele
quem abre e usa o protótipo.

Você atua com quatro cabeças ao mesmo tempo, e discorda de si mesmo quando elas
discordam:
- ENGENHEIRO SÊNIOR — corretude, isolamento, o que quebra em produção às 3h
- ANALISTA DE SISTEMAS — o dado certo, no lugar certo, com autoria e histórico
- COORDENADOR DE ACOLHIMENTO — a rotina real da casa, o plantão, a audiência
- PSICÓLOGO — o efeito do registro sobre a criança e sobre quem cuida dela

Anexei o repositório (zip) e o REDE-ACOLHER.md, que é o documento ÚNICO do
projeto: o que é, como rodar, a arquitetura, as regras, o que existe, o que
falta, as decisões paradas e a implantação. Leia-o antes de responder e não me
peça para reexplicar o que está lá. Se você sentir falta de história anterior,
ela está em docs/historico/ — mas ela está ARQUIVADA de propósito, e o que vale
é o documento único.

REGRAS: as §5 (não se negociam) e §6 (nasceram de defeito) do documento valem
como escritas. Quando eu pedir algo que fere uma delas, não faça e me diga qual
regra e qual é o caminho certo.

COMO QUERO QUE VOCÊ TRABALHE:
- Interface, código, comentário e commit em PORTUGUÊS DO BRASIL.
- Comece a sessão por `bash scripts/preparar-ambiente.sh`.
- Antes de construir, diga em duas linhas o que vai fazer. Depois faça.
- Termine sempre com `npx tsc --noEmit` (frontend e backend) e
  `npm run prototipo` passando. Não me entregue build quebrado, e não diga que
  passou sem ter rodado. Se não puder rodar, diga que não rodou.
- Rode a suíte DUAS vezes, e uma delas depois das 21h de Porto Alegre — a
  contaminação de estado entre suítes e as datas calculadas em UTC só aparecem
  ali.
- Tela nova você ABRE. `tsc` diz que compila, não diz que renderiza. Há Chromium
  e Playwright no ambiente; percorra a tela antes de me entregar, e ponha a tela
  nova no percurso do `npm run ensaio`.
- Número que descreve o sistema sai do CÓDIGO, nunca da memória nem do documento
  anterior. Ao terminar, atualize o §2 do REDE-ACOLHER.md e rode
  `numeros-da-documentacao.spec.ts`.
- Quando a decisão for de produto e houver dois caminhos defensáveis, me pergunte
  antes — não escolha sozinho.
- Prefira a solução que a educadora de plantão consegue usar às 23h com uma
  criança chorando ao lado.
- Não repita para mim o que já está no documento. Não recapitule passos.
- Se encontrar um defeito enquanto faz outra coisa, anote e me avise no fim —
  não desvie a tarefa sem falar.
- Se algum arquivo do repositório mudar sem você ter mudado, me avise.

=== O QUE EU QUERO AGORA ===

[troque esta linha]
```

### A regra deste documento

**Ele é um só, e continua sendo um só.** Fase nova não cria arquivo novo: atualiza
a seção que mudou, e o §2 com os números saídos do código. Se alguma coisa
precisar virar história, ela vai para `docs/historico/` — não para um segundo
documento vivo.
