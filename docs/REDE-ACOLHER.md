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
| `der.md` | as 98 tabelas com o que cada coluna guarda. É referência de dado, não narrativa, e o `documentacao.spec.ts` cobra que toda tabela apareça lá |
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

### Os oito cargos

Educador social · Líder Diurno · Equipe técnica · Coordenação · Enfermagem ·
Líder Noturno Geral · Gestor Geral · Cozinha.

Cada um enxerga um recorte diferente, e o recorte é aplicado **duas vezes**: na
aplicação e no banco. §7 tem a matriz inteira.

---

## 2. O ESTADO HOJE

**Fases 0 a 75.** Estes números **saem do código**, não da memória — e são
cobrados por `test/numeros-da-documentacao.spec.ts`, que existe porque em 08/09
seis afirmações estavam erradas ao mesmo tempo em três documentos, e duas delas
discordavam entre si.

| Quanto | De onde sai |
|---|---|
| **17 partições** isoladas | pastas em `backend/src/modules/` |
| **83 migrações** | `.sql` dentro das partições |
| **98 tabelas** | `CREATE TABLE` nas migrações |
| **55 suítes** | `backend/test/*.spec.ts` |
| **546 testes** | `it(` / `test(` nas suítes |
| **31 telas React** | `frontend/src/screens/*.tsx` |
| **14 rotas sem porta** de tela | lista de exceções do `rotas-sem-porta.spec.ts` |
| **6 ensaios de navegador** | scripts `ensaio*` do `frontend/package.json` |
| protótipo com **≈932 KB** | `prototipo/rede-acolher-prototipo.html` |

*A frase importa: o conferidor lê o NÚMERO colado ao substantivo. Escrever
"Telas React … 31" numa coluna separada faz o teste passar sem conferir nada —
foi assim que "30 telas" sobreviveu à fase que existiu para acabar com isso.*

**Medidos rodando, e por isso fora do conferidor:**

| Ensaio | Resultado |
|---|---|
| `npm run ensaio` | 113 telas nos oito cargos — Coordenação 23, Técnica 21, Gestor 20, Líder Diurno 14, Líder Noturno 13, Educador 12, Enfermagem 9, Cozinha 1 |
| `npm run ensaio:acessibilidade` | 120 telas, **nenhuma violação de WCAG 2.1 AA** |
| `npm run ensaio:roteiro` | 29 tarefas, **todas com porta no cargo certo** |

### A última verificação inteira

**09/09/2026.** `tsc` limpo nos dois lados; a suíte **duas rodadas seguidas**,
uma delas às 21h34 de Porto Alegre com o UTC já no dia seguinte — que é a
condição que a regra pede; os seis ensaios de navegador; o `ensaio:producao`; o
protótipo reconstruído e idêntico ao entregue.

*Contagem que só cresce ("quinze rodadas limpas") não é dado. O que vale é a
**data** e a **condição** da última verificação. O contador acumulado saiu daqui
na fase 71, quando dois documentos discordaram dele e ninguém soube dizer de
onde vinha o número.*

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

---

## 3. COMO RODAR

### Primeiro, o preparo

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

O `globalSetup` do Jest derruba e recria o schema a cada rodada, roda as 83
migrações em ordem e aplica os seeds (`seed.ts`, `seed-fase2.ts`, `seed-fase4.ts`).

### Os ensaios — e por que cada um existe

`tsc` diz que compila. Nunca disse que renderiza.

| Comando | O que ele faz |
|---|---|
| `npm run ensaio` | percorre as 113 telas dos oito cargos num navegador de verdade, cobrando que nenhuma deixe erro no console, que escreva alguma coisa e que não mostre `undefined` para quem lê. **Tela nova entra neste percurso.** |
| `npm run ensaio:fila` | corta o sinal, marca a chamada, fecha e abre o aplicativo, religa, e confere que **só o que o servidor confirmou** saiu do aparelho |
| `npm run ensaio:folhas` | os caminhos de documento até o arquivo baixar: abre a folha, tenta baixar com finalidade curta demais, baixa com frase válida, confere que o `.docx` chegou |
| `npm run ensaio:roteiro` | cobra que as 29 tarefas do roteiro do Marcelo tenham porta no cargo certo. Não simula a procura de uma pessoa — mas impede o fracasso barato: a tarefa não ter porta, e isso aparecer diante da equipe |
| `npm run ensaio:acessibilidade` | axe-core (WCAG 2.1 AA) nas 120 telas — sete a mais que o `ensaio` porque confere também a folha do "Mais" de cada cargo, aberta dezenas de vezes por turno. **Cor nova passa por ele antes de entrar** |
| `npm run ensaio:uso` | percorre os oito cargos **apertando os botões até o fim** — chamada, exceção, passagem, armário, cofre, internação, diário — e **lê de volta o que ficou gravado**. É o que pega o defeito que a tela não denuncia: a folha abriu, o botão salvou, e só o número estava errado |

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
│   ├── test/              55 suítes (e2e contra PostgreSQL real + estáticas)
│   ├── scripts/           ensaio-carga.ts, migrador compilado
│   └── assets/timbre.png  a marca da Fundação, usada no documento em Word
├── frontend/
│   ├── src/
│   │   ├── screens/       31 telas React
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

### 4.9 A cor, e o que ela não pode dizer

**Cor comunica estado operacional e categoria de atividade — nunca julgamento,
ranking ou pontuação sobre a pessoa.** Um chip vermelho significa "exige ação
agora", jamais "criança problemática". Nenhuma cor é aplicada a pessoas, só a
estados.

**Nada depende apenas de cor.** Todo estado traz rótulo textual; a cor por autor
na ATA vem sempre com o nome escrito ao lado, porque cor não sobrevive à
impressão em preto e branco nem ao daltonismo.

A fonte da verdade visual são os tokens de `frontend/src/styles.css`, e a folga
de contraste foi conquistada em 02/09: contraste não é opinião, e a diferença
entre 4,46 e 4,5 só se enxerga no corredor.

**As fontes do protótipo** (`Atkinson Hyperlegible` e `Plus Jakarta Sans`) são
buscadas na rede. Aberto sem internet — que é como o arquivo é entregue —, ele
cai na fonte do sistema. Decisão em aberto, §10.10.

### 4.10 Os testes que guardam a arquitetura

Além dos e2e, sete suítes estáticas — todas já pegaram erro de verdade:

| Suíte | O que ela cobra |
|---|---|
| `arquitetura.spec.ts` | as fronteiras entre partições, e o marcador `rls-join-ok:` obrigatório perto de todo JOIN |
| `contrato-rotas.spec.ts` | toda rota chamada pela tela **existe** no servidor |
| `alcance.spec.ts` | as marcas `/* alcance:<área> */` lidas do código que roda |
| `documentacao.spec.ts` | toda tabela do banco aparece no `der.md` |
| `numeros-da-documentacao.spec.ts` | os números que este arquivo afirma batem com o código |
| `rotas-sem-porta.spec.ts` | as rotas sem tela são só as 14 declaradas com motivo — e o bloco **"ação sem botão"**: toda ação que os provedores de linha do tempo emitem (`medication.confirm`, `check.open`, `handover.sign`, `ata.view`, `incident.open`) é atendida pela tela do Dia **e** pelo `mock.ts` |
| `varredura-de-cargos.e2e.spec.ts` | **todos os cargos contra todas as rotas de leitura**, com id real, id inexistente e id que não é UUID, cobrando uma coisa só: nada devolve **500**. Ela não sabe o que deveria voltar; sabe o que nunca pode |

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

**12. Agregação por casa confere o escopo ANTES de contar.** O RLS filtra as
linhas, e zero se lê como "casa vazia", não como "não é sua". **Zerar não é
recusar.**

**13. Contagem em teste é RELATIVA ao que já estava no banco.** Tabela
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
| Educador volante | própria casa | plantão | operação (o deslocamento é do acolhido, não do educador) |
| Enfermagem | **8 casas** | escala própria | somente saúde |
| Líder Noturno Geral | **8 casas** | durante o turno (19h–7h, preliminar) | operacional mínimo |
| Gestor Geral | **8 casas** (abre 1 por vez, auditado) | sem limite | institucional |
| Cozinha | — | — | somente o relatório mínimo de alimentação |
| Admin técnico | infraestrutura | emergencial, temporário, auditado | sem acesso comum ao negócio |

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

### 8.3 O turno

O **Dia** com a rotina versionada da casa e quatro filtros, entre eles **"Por
criança"** — uma linha por acolhido, em **ordem alfabética**, com o alerta
essencial primeiro. *Não é ordenado por pendência de propósito: se fosse, as
mesmas crianças ficariam no topo todo dia.*

Chamadas coletivas com conferência de mesa; **painel do plantão** (quem está em
quê agora); delegação e substituição, que são coisas diferentes — delegar é
passar adiante, substituição é quem vai sair pedindo.

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

### 8.8 Ocorrências

Categorias; relatos independentes por autor; **registro protegido** (fala
espontânea e sinais observados) com política mais estreita; contenção com campos
próprios; síntese técnica; comunicação externa registrada — nunca enviada pelo
sistema. Caso de medicamento **não fecha sem síntese**, e a ordem é primeiro a
etapa operacional, depois a análise.

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

### O que é meu e ficou pequeno

- **As fontes do protótipo**: embutir as duas famílias custa cerca de 300 KB. §10.10.
- **O prazo de triagem da Enfermagem** será parâmetro, e ainda não tem valor.

### O que não é código, e vale mais que tudo acima

**Ninguém que não construiu o sistema abriu o protótipo ainda.** Seis ensaios de
navegador não medem hesitação.

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
| 28/08 | Limite de vagas por casa | 20 nas oito unidades, alterável pela coordenação com motivo registrado |
| 28/08 | As senhas de gov.br, INSS, CTPS e banco | Ficam no sistema, com a coordenação de cada casa, cifradas. Sem isso continuariam numa planilha compartilhada sem cifra nem registro |
| 28/08 | O conteúdo do cofre físico | **Não entra no sistema.** Nenhum campo criado |
| 27/08 | Nome e origem antes do aceite de transferência | Aparecem. Aceitar ou recusar uma criança sem saber quem ela é não é decisão, é sorteio. O perfil continua fechado até o aceite |

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
| 11 | **Critérios de aceite do piloto e autoridade** | A registrar antes de começar |

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

Constrói, cria um banco virgem, aplica as 83 migrações **pelo binário
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

### O roteiro do Marcelo

`roteiro-marcelo.md` (e o `.docx` gerado dele) leva 29 tarefas à Casa 03, cargo a
cargo. Como se aplica:

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
