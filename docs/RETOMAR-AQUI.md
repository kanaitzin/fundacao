# RETOMAR AQUI — Rede Acolher

**Documento único de retomada.** Foi escrito para ser a PRIMEIRA coisa anexada
numa conversa nova. Quem ler isto do começo ao fim sabe o que o sistema é, onde
ele está, o que já funciona, o que falta e o que não pode ser feito — sem
precisar de nenhuma outra conversa anterior.

*Atualizado em 08/09/2026 — fases 0 a 73. Substitui o "pacote de retomada" da seção 10 do
`CONTINUIDADE.md`, que ficou velho. O prompt para colar na conversa nova está
em `docs/PROMPT-MESTRE.md`.*

---

## 1. O QUE É, E PARA QUEM

**Rede Acolher** é o sistema interno de gestão do programa de acolhimento
institucional da **Fundação O Pão dos Pobres de Santo Antônio**, em Porto
Alegre. Oito unidades, cerca de vinte crianças e adolescentes em cada uma.

- **Casa 03 (código AI3)** é a unidade-piloto.
- **Marcelo Barbosa** (`mbarbosa@paodospobres.com.br`) é o contato da
  instituição, e é ele quem vai testar o protótipo.
- O objetivo desta fase é um **protótipo que o Marcelo abre e usa**, com dados
  fictícios, para a instituição decidir o que entra antes do piloto.

O critério que decide qualquer dúvida de produto é sempre o mesmo:

> *A educadora de plantão, às 23h, com uma criança chorando do lado, consegue
> fazer isso?*

---

## 2. ONDE ESTÁ O SISTEMA

O código vive no arquivo **`rede-acolher-atualizado.zip`**, entregue
no chat. Descompactado, ele é a pasta `rede-acolher/`, um repositório git com
todo o histórico de commits.

```
rede-acolher/
├── backend/
│   ├── src/
│   │   ├── kernel/        audit, common (cpf, crypto, segredo, tempo),
│   │   │                  database, events, health
│   │   └── modules/       17 partições isoladas, cada uma com as próprias
│   │                      migrações em modules/<nome>/migrations/
│   ├── test/              53 suítes (e2e contra PostgreSQL real + estáticas)
│   └── assets/timbre.png  a marca da Fundação, usada no documento em Word
├── frontend/
│   ├── src/
│   │   ├── screens/       31 telas React
│   │   ├── mock.ts        o "servidor de mentira" do protótipo
│   │   ├── docx.ts        monta o .docx NO NAVEGADOR — só para o protótipo,
│   │   │                  que roda sem servidor; no sistema real quem gera é
│   │   │                  o kernel, e é ele que registra a saída
│   │   ├── documentos.tsx pré-visualização em folha + downloads por setor
│   │   ├── api.ts         cliente HTTP, ErroApi, SemConexao e a porta da fila
│   │   ├── fila-offline.ts a fila local do aparelho (IndexedDB): guarda sem
│   │   │                  sinal, envia ao reconectar, limpa só o confirmado
│   │   ├── App.tsx        navegação, abas, seletor de cargo do protótipo
│   │   └── styles.css     design system, tema claro e escuro
│   ├── ensaio.mjs         abre o protótipo num navegador de verdade e
│   │                      percorre as 113 telas dos oito cargos
│   └── ensaio-fila.mjs    corta o sinal e ensaia o que só existe fora da tela
├── scripts/               preparar-ambiente.sh — dependências, banco e
│                          Chromium, para a sessão nova começar rodando
├── prototipo/             rede-acolher-prototipo.html  ← o arquivo que o
│                          Marcelo abre (um arquivo só, ≈900 KB, sem servidor)
└── docs/                  este arquivo, CONTINUIDADE, DER, o-que-falta,
                           backlog, matriz de permissões, roteiro do Marcelo…
```

**As 17 partições do backend:** activities, alignments, archive, checks, houses,
identity, incidents, medications, notifications, nursing, people, reports,
routine, shifts, statements, sync, timeline.

### Como rodar

**Primeiro, o preparo.** Três coisas caem entre uma sessão e outra — as
dependências, o PostgreSQL (que não é serviço e para sozinho) e o Chromium do
ensaio. O script resolve as três e imprime as variáveis:

```bash
eval "$(bash scripts/preparar-ambiente.sh --exportar)"
```

Depois:

```bash
# o protótipo (um arquivo .html, sem servidor, sem banco)
cd frontend && npm run prototipo
# abre em prototipo/rede-acolher-prototipo.html

# conferir tipos — obrigatório antes de qualquer entrega
cd frontend && npx tsc --noEmit
cd backend  && npx tsc --noEmit -p tsconfig.json

# testes: precisam de PostgreSQL 16 rodando
cd backend && npx jest

# os ensaios de navegador: as 113 telas, e a fila offline
cd frontend && npm run ensaio && npm run ensaio:fila
```

O `globalSetup` do Jest derruba e recria o schema a cada rodada, roda as 82
migrações em ordem e aplica os seeds (`seed.ts`, `seed-fase2.ts`,
`seed-fase4.ts`).

**Se o Chromium não baixar**, o preparo avisa e segue: a suíte e o `tsc` rodam
sem ele; só o ensaio fica de fora. O caminho normal do Playwright busca o
binário no CDN dele, que em ambiente com saída restrita é recusado com um
`403` — e o comando falha **calado**, sem baixar e sem reclamar. O script tenta
o CDN, e, se não passar, traz o Chromium de dentro de um pacote npm. Liberar
`cdn.playwright.dev` na rede do ambiente dispensa o contorno.

### Contas do ambiente de teste (senha `senha-dev-123`)

`coord.ai3@`, `coord.ai4@`, `educador.ai3@`, `educador2.ai3@`, `educador.ai4@`,
`lider.ai3@`, `lider.noturno@`, `tecnica.ai3@`, `enfermagem@`, `gestor@` —
todos `@paodospobres.dev`.

No protótipo entra-se com `coord.ai3@paodospobres.dev` e troca-se de função pelo
seletor **"Ver como"** no alto da tela.

---

## 3. AS REGRAS QUE NÃO SE NEGOCIAM

*Copiar isto na íntegra para a conversa nova. Elas são a espinha do projeto e
já evitaram vários erros caros.*

1. **NUNCA publicar, nunca fazer deploy em produção, nunca usar dado real** sem
   autorização expressa. Construir e validar local, com dados fictícios.
2. **Segredo nunca no código.** Log da aplicação nunca copia conteúdo sensível —
   só ID e metadado. Vale para token de convite e link de acesso.
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

### Como o trabalho é conduzido

- Interface, código, comentário e commit em **português do Brasil**.
- Antes de construir, dizer em duas linhas o que vai fazer. Depois fazer.
- Terminar sempre com `npx tsc --noEmit` e `npm run prototipo` passando. Não
  entregar build quebrado, e não dizer que passou sem ter rodado.
- Quando o pedido fere uma regra: não fazer, dizer qual regra e qual o caminho
  certo.
- Quando a decisão for de produto e houver dois caminhos defensáveis:
  **perguntar antes**, não escolher sozinho.
- Não repetir o que já está no documento. Não recapitular passos.
- Defeito encontrado no meio de outra tarefa: anotar e avisar no fim, sem
  desviar a tarefa.
- **Rodar a suíte duas vezes**, e uma delas depois das 21h (contaminação de
  estado entre suítes, e datas calculadas em UTC viram o dia antes da casa).

---

## 4. STACK E DECISÕES DE ARQUITETURA

- **Monolito modular.** NestJS + TypeScript; PostgreSQL 16 com **RLS**; 17
  partições isoladas, cada uma dona das próprias migrações.
- **Autorização em duas camadas:** a regra de negócio na aplicação e o RLS no
  banco, via `DatabaseService.asUser()`, que fixa `app.user_id` por transação.
- **EventBus in-process** no kernel: `escalation.requested`, `notice.requested`,
  `document.closed`, `prescription.signed`.
- **Frontend** React PWA (Vite) empacotado num único `.html` por
  `vite-plugin-singlefile`. `VITE_PROTOTIPO=1` faz `api()` chamar `mockApi()`.
- **Arquivos compartilhados que não importam nada de propósito** — o protótipo
  os lê direto, para que a demonstração use a MESMA lista que o servidor cobra:
  `identity/alcance.ts`, `shifts/ata-secoes.ts`, `routine/rotina-vocabulario.ts`,
  `people/dossie-exigido.ts`, `frontend/src/rotulos.ts`.
- **Fuso:** `hojeNaInstituicao()` / `janelaDeConsulta()` no TypeScript;
  `app_hoje()` / `app_fuso()` no SQL. Nunca `new Date()` cru para decidir dia.

### Os testes que guardam a arquitetura

Além dos e2e, cinco suítes estáticas — elas já pegaram erro de verdade:

- `arquitetura.spec.ts` — fronteiras entre partições, e o marcador
  `rls-join-ok:` obrigatório perto de todo JOIN;
- `contrato-rotas.spec.ts` — toda rota chamada pela tela **existe** no servidor
  (foi ela que pegou a pré-visualização do relatório sem rota);
- `alcance.spec.ts` — as marcas `/* alcance:<área> */` lidas do código que roda;
- `documentacao.spec.ts` — toda tabela do banco aparece em `docs/der.md`, e a
  contagem do inventário bate;
- `numeros-da-documentacao.spec.ts` — os NÚMEROS que este arquivo, o
  `PROMPT-MESTRE.md` e o `implantacao.md` afirmam (migrações, tabelas, suítes,
  testes, telas, rotas sem porta e o tamanho do protótipo) batem com o que o
  código tem. Na primeira rodada acusou seis afirmações erradas ao mesmo tempo,
  em três documentos.

---

## 5. O QUE JÁ ESTÁ PRONTO

**Fases 0 a 73. 522 testes em 53 suítes.** A última verificação inteira foi em
**08/09/2026**, depois da fase 73: `tsc` nos dois lados, a suíte **três rodadas
seguidas limpas** — uma de dia, uma com o relógio da máquina em 22h03 de Porto
Alegre e o UTC já em 09/09 (a condição que a regra pede), e uma às 01h02, já
depois da virada do dia na casa —, os sete ensaios de navegador, o
`ensaio:producao` e o `ensaio:restauracao`.
30 telas, 82 migrações, 97 tabelas.

*(O contador de "rodadas limpas acumuladas" saiu daqui na fase 71: ele crescia
a cada conversa e ninguém sabia dizer de onde vinha o número — dois documentos
chegaram a discordar dele. Data e condição valem mais do que contagem.)*

E dois ensaios de navegador, que `tsc` não substitui — ele diz que compila,
nunca disse que renderiza:

- `npm run ensaio` percorre as **113 telas** que os oito cargos alcançam,
  cobrando de cada uma que não deixe erro no console, que escreva alguma coisa
  e que não mostre `undefined` para quem lê;
- `npm run ensaio:fila` faz o que só existe fora da tela: corta o sinal, marca
  a chamada, fecha e abre o aplicativo, religa e confere que **só o que o
  servidor confirmou** saiu do aparelho;
- `npm run ensaio:folhas` percorre os quatro caminhos de documento: abre a
  folha, tenta baixar com finalidade curta demais, baixa com uma frase válida
  e confere que o `.docx` chegou.

- `npm run ensaio:acessibilidade` roda o axe-core (WCAG 2.1 AA) nas **120 telas**
  — sete a mais que o `ensaio` porque confere também a **folha do "Mais"** de
  cada cargo, que é aberta dezenas de vezes por turno. Nenhuma violação — e a folga foi conquistada em 02/09: contraste
  não é opinião, e a diferença entre 4,46 e 4,5 só se enxerga no corredor;
- `npm run ensaio:uso` percorre os **oito cargos apertando os botões até o
  fim** — chamada, exceção, passagem, armário, cofre, internação, diário — e
  **lê de volta o que ficou gravado**: a entrada de remédio somou, a
  conferência travou sem motivo, a exceção escrita apareceu, a contagem de
  dias com relato mudou. É o que pega o defeito que a tela não denuncia: a
  folha abriu, o botão salvou, e só o número estava errado;
- `npm run ensaio:roteiro` percorre as **28 tarefas do roteiro do Marcelo** e
  cobra que cada uma tenha porta no cargo certo. Ele não simula a procura de
  uma pessoa — onde ela para é o que a aplicação do roteiro descobre —, mas
  impede o fracasso barato: a tarefa não ter porta, e isso aparecer diante da
  equipe.

E há um ensaio que não abre tela nenhuma: `npx tsx backend/scripts/ensaio-carga.ts`
escreve **doze meses da Fundação inteira** e mede as rotas com RLS. Foi ele que
achou as três telas mais abertas do sistema respondendo em oito segundos e meio
— ver §8.19 da CONTINUIDADE, que é a leitura mais útil antes de escrever
qualquer consulta nova por dia.

E, desde a fase 63, **o sistema é ensaiado COMPILADO**:
`npm run ensaio:producao` constrói, cria um banco virgem, aplica as migrações
pelo binário e sobe o serviço. O projeto passou 62 fases sem nunca rodar assim
— tudo por `tsx` e por `jest` —, e a primeira rodada encontrou o `dist/` sem
migração nenhuma.

E, desde a fase 48, **a restauração é ensaiada como o resto**:
`npm run ensaio:restauracao` faz o ciclo inteiro num banco descartável —
backup, restaura, confere as contagens e **abre o cofre com a chave do
ambiente**. Um backup que nunca foi restaurado não é backup.

**O ciclo do acolhimento:** admissão com motivo e capacidade, perfil, correção
de cadastro com histórico legível, **atualização dos dados descritivos —
cuidados essenciais, escola, equipe de referência — guardando o que estava
escrito antes**, saída com motivo, acervo histórico e retorno como episódio
novo.

**As oito casas, do outro jeito (04/09/2026):** o **trabalho social**. O
Gestor Geral tem uma chave 🌱 no alto, junto do tema, que troca a operação pela
leitura do que o acolhimento produziu: quantas crianças, quantas entraram e
saíram, e o que aconteceu de bom — passou de ano, curso profissionalizante,
faculdade, primeiro emprego. Dá para abrir a **trajetória de uma criança** e
ver a linha das conquistas dela.

**O desenho é uma recusa:** as casas saem na ordem do cadastro e **nunca por
resultado**, não há média, meta nem "casa destaque", e a lista de quem
conquistou é por data. Comparar casas seria um ranking com outro nome — e a
casa que recebe adolescentes com medida recente não está na mesma corrida da
casa-lar com quatro crianças pequenas. Ausência de marco não é dado: quer dizer
que ninguém escreveu, não que nada aconteceu.

Dessa leitura saem dois documentos: o **relatório do período** — das oito casas
para o Gestor Geral, ou de uma casa só para a coordenação dela — e a
**trajetória de uma criança**, que é a história dela para levar a uma
audiência. Os dois passam pela finalidade escrita e ficam registrados.

**A criança no hospital (03/09/2026):** a **internação** tira o acolhido da
linha do dia — chamada, grade e rotina — sem tirá-lo da casa: a vaga continua
ocupada, e ele volta sozinho na alta. Abrem e encerram a equipe técnica e a
coordenação; o diário do período aceita anexo do hospital e não cobra registro
diário de ninguém; a medicação dada lá entra no histórico de saúde e na folha
da Enfermagem **com a origem escrita em cada linha**, e nunca na grade da casa.
O educador comum não lê a internação, mas vê "no hospital" na lista de
acolhidos — ele precisa saber por que a cadeira está vazia.

**O cadastro que a lista da casa pedia (03/09/2026):** filiação, RG, cartão
SUS, foto de identificação no perfil, e os **contatos com vínculo** — genitora,
padrinho, tia, vínculo comunitário —, que o educador lê e a técnica escreve.
Contato não se apaga: encerra-se com motivo. Contato com aproximação restrita
aparece primeiro, com o motivo à vista. A **chave de acesso ao processo** foi
para o cofre, com reautenticação e registro por visualização.

**Sem sinal:** a **fila local do aparelho** — a operação feita sem internet
fica guardada em IndexedDB com o horário do ato, sobrevive ao aplicativo
fechar, sobe sozinha ao reconectar, e **só sai do aparelho o que o servidor
confirmou ter aplicado**; o que ele recusou fica, com o motivo dele ao lado. O
selo no cabeçalho diz quanta coisa está guardada, e a folha separa o que sobe
sozinho do que parou esperando gente. **Confirmação de dose fica de fora, em
aparelho nenhum** (08/09/2026): como o sistema roda no celular de cada pessoa,
não existe mais o aparelho único da casa que impedia a mesma dose de ser
confirmada em dois lugares. A recusa vem na hora, com a frase.

**A escala (08/09/2026):** a coordenação monta por **dia e turno**, com hora
quando o plantão não é o inteiro, e **repete a cada N dias** para preencher o
mês — "a cada 2" é o desenho de uma 12x36, que é o motivo de a escala ser por
DATA e não por dia da semana (o ciclo anda pelo calendário). O **turno sem
ninguém** aparece escrito, a folha da parede sai em Word, e **nada se apaga**:
retirar é revogar, com autor — e retirar plantão que já passou exige motivo,
porque é a escala que responde quem estava na casa naquela noite. Sem contagem
de plantões por pessoa em lugar nenhum. Com ela, **quem o sistema cobra por
assinar a passagem passa a ser quem estava escalado**, e não todo mundo que
trabalha na casa; sem escala montada, ele declara que caiu no vínculo da casa.

**O turno:** o Dia com a rotina versionada da casa e o filtro **"Por criança"**
— uma linha por acolhido, em ordem alfabética, com o alerta essencial primeiro —, chamadas coletivas com
conferência de mesa, passagem de plantão assinada uma a uma, ATA do turno com o
corpo do livro real da Casa 03, episódios do turno com relato imutável e ciência
nominal, ATA Geral Noturna e o Arquivo das ATAS por dia, semana ou mês.

**Saúde:** grade de doses confirmada uma a uma por quem administrou, triagem de
evoluções, armário, esquemas de medicamento (rascunho, na grade, suspenso) —
cadastrados pela Enfermagem, pela coordenação **ou** pela equipe técnica, porque
a criança volta da consulta com a receita às 20h —, suspensão que tira a dose da
grade dizendo por quê, histórico de saúde do acolhido e emissões do Resumo.

**Quem dá o remédio (08/09/2026):** a Enfermagem atende das **9h às 17h**; fora
disso quem administra é o **educador de plantão**, conforme a bula do acolhido.
O que existe é a **exceção por medicamento** — "este só a Enfermagem dá" —,
marcada no esquema com motivo obrigatório e antes-e-depois; o educador barrado
lê o motivo. O protocolo por período e a autorização nominal **deixaram de
decidir, não de existir**: eles guardam o que a casa decidiu enquanto ninguém
sabia o horário da Enfermagem.

**No fim da passagem, as doses do turno aparecem** — confirmadas e sem resposta
—, e quem assina primeiro escreve o que houve com as que ficaram. Isso **não
confirma dose nenhuma**: a confirmação continua individual, de quem
administrou.

**Ocorrências:** categorias, relatos independentes por autor, registro protegido
(fala espontânea e sinais observados) com política mais estreita, contenção com
campos próprios, síntese técnica, comunicação externa registrada — nunca enviada
pelo sistema.

**Documentos:** dossiê do acolhido em cinco categorias com anexo real, prévia
antes de enviar e aceite separado; álbum de vivências; arquivo documental com
fila de cópia; e o **relatório em Word com timbre**, agora saindo também do
protótipo, em A4 com margens ABNT.

**Coordenação e gestão:** equipe e convites de primeiro acesso, **os aparelhos
institucionais da casa — o cadastro que sustenta a regra do §11.7 —**, transferências
entre casas, cofre de acessos cifrado, benefícios e dados bancários com
reautenticação e log por visualização, acompanhamentos com aprovação de segunda
pessoa, relatórios que saem do rascunho por um ato declarado e são aprovados por
outra pessoa, a **Sincronização** — o que este aparelho enviou, e os conflitos
que esperam a frase da equipe, com as duas versões inteiras e nenhuma
destacada —, **o Painel das unidades — ocupação, fluxo, pendências e o quadro de
cada mês, na ordem do código da casa e sem nenhuma lista ordenada por número** —,
alinhamentos de equipe (reuniões e combinados).

**Pré-visualização e download por setor:** toda folha abre na tela com a cara do
papel antes de virar arquivo; a enfermagem baixa a saúde de um acolhido e a
grade do dia, a técnica baixa ATA e ocorrência, a coordenação e a gestão baixam
tudo.

---

## 6. O QUE FALTA

`docs/o-que-falta.md` tem o levantamento completo. Em resumo:

### Grupo 1 — falta para o piloto: **VAZIO**

Tudo o que a educadora de plantão precisa fazer às 23h tem porta.

### Grupo 2 — o que sobrou, e por que cada um sobrou

Restam **14 rotas sem porta**, de 34 em 01/09 — e este número não é mais uma
contagem à mão: é o tamanho da lista de exceções do `test/rotas-sem-porta.spec.ts`,
onde cada linha traz o motivo por extenso. A maior parte é de máquina (grupo 3).
O que ainda é tela de gente são três coisas, e **nenhuma delas está parada por
falta de código**:

- ~~**Fila offline, a metade do APARELHO.**~~ **Feita em 02/09/2026** (fase
  46): a operação fica guardada no aparelho, sobe ao reconectar e some só
  quando o servidor confirma. `POST /sync/push` continua sem porta de tela de
  propósito — é a rota que o PWA chama, não uma pessoa, e agora ele a chama.
  *Fica de fora a confirmação de dose*, que depende da resposta do §7.9.
- **Leitura excepcional de relato** (`POST /statements/:id/exceptional-read`).
  A regra está pronta e é boa: o Gestor Geral só abre uma narrativa pessoal
  declarando a finalidade, e o comando registra antes de devolver o conteúdo.
  **O que trava é outra coisa:** pela política comum (`st_select`), o relato
  restrito é INVISÍVEL ao gestor — ele não tem como saber que existe para pedir
  a leitura. Dar-lhe a porta exige decidir o que ele vê ANTES de abrir (só a
  contagem, como nos documentos do §13.7? a data? o autor?), e isso é decisão
  do Marcelo, não minha. Ver §7.
- **Fontes do acompanhamento** (`POST /followups/:id/sources`). A rota grava a
  REFERÊNCIA de um registro que embasou a avaliação — e não existe rota que
  LISTE os candidatos. De onde a equipe técnica escolhe (a linha do tempo da
  criança no período? as ocorrências? as evoluções de saúde?) é decisão de
  produto. Ver §7.

### Grupo 3 — não precisa de tela

Onze rotas, e são as que o `rotas-sem-porta.spec.ts` declara com o motivo
escrito: geração das doses e do dia, geração da agenda dos compromissos,
escalonamento de dose vencida, marcação de atividade não confirmada, health
check, `GET /medications/alert-offsets` e `GET /medications/can-administer` (o
aparelho pergunta; quem decide continua sendo o servidor), `GET /activities` e
`GET /transfers/pending` (leituras cruas que a tela já recebe juntas em
`GET /timeline` e nas duas caixas) e `GET /people/:id/admission`, a ficha
inteira, para o documento e para a migração da implantação.

*(`POST /archive`, `POST /sync/push`, `GET /statements` e
`GET /reports/:id/delivery` saíram desta lista: as três primeiras ganharam
quem as chame — o evento, o PWA e a própria tela —, e a última chega dentro de
`GET /reports`. Estavam aqui por inércia, e o conferidor não as vê como órfãs
há semanas.)*

### A dívida do Word — paga em 02/09/2026

Ficou anotada aqui por três semanas: a pré-visualização e o download em Word de
ATA, ocorrência, saúde e combinados eram montados no NAVEGADOR, e só o
relatório tinha rota de verdade. **Fase 47.** O contrato da folha subiu para
`kernel/documentos/folha.ts`, o gerador de `.docx` para
`kernel/documentos/documentos.service.ts`, e cada partição monta a folha do
documento que é dela. Dez rotas novas: `GET .../folha` (ver, sem registrar) e
`POST .../export` (finalidade obrigatória, saída registrada) em `shifts`,
`incidents`, `nursing`, `medications` e `alignments`.

O `docx.ts` do navegador continua no repositório por uma razão só — o protótipo
roda sem servidor —, mas deixou de declarar o contrato: ele importa o do
kernel.

---

## 6.9 O QUE ENTROU ENTRE 03 E 08/09/2026 (E A FASE 71)

Em ordem, e cada uma com o defeito real que a motivou:

| Fase | O que passou a existir |
|---|---|
| 52 | Cadastro com filiação, RG, cartão SUS, foto e contatos com vínculo; chave do processo no cofre |
| 53–55 | **Internação hospitalar** inteira, e a marca "no hospital" para quem não lê a internação |
| 56–57 | `ensaio:uso` — os oito cargos apertando os botões e **lendo de volta o que ficou gravado**; a senha do cofre escrita na tela |
| 58–61 | **O trabalho social** das oito casas para o Gestor Geral, com trajetória por criança e relatório em Word |
| 62 | Conferidor de **rotas sem porta** — e três rotas paradas esperando decisão da Fundação passaram a dizer isso no código |
| 63–64 | O sistema **sobe compilado** (o `dist/` saía sem nenhuma migração), e **recusa subir** se o RLS estiver desligado |
| 65 | O roteiro do Marcelo alcança tudo o que foi construído — 25 tarefas, 14 folhas |
| 66–67 | Dois anexos **entravam e não saíam**; agora todo arquivo guardado tem por onde sair, e há conferidor |
| 68–69 | Duas políticas de RLS **perguntavam caro antes de barato** — 400 ms e 1 096 ms de espera |
| 70 | As mensagens de erro falam **português** e dizem se o registro foi salvo |
| 71 | Os **números dos documentos de retomada** passaram a ser cobrados por teste — seis estavam errados em três arquivos |
| 72 | **A medicação como a casa faz**: o educador de plantão dá o remédio, a exceção é por medicamento, a passagem lê as doses de volta, e dose não se confirma sem sinal |
| 73 | **A escala de plantão por DATA** — uma 12x36 não cabe numa semana —, com repetição, turno sem ninguém à vista, folha para a parede, e a passagem cobrando quem estava escalado |

---

## 7. DECISÕES QUE SÃO DO MARCELO, NÃO MINHAS

Nenhuma delas é problema de código. Estão paradas esperando resposta:

1. **Devolver um acompanhamento para correção não existe no servidor.** A tela
   tinha um botão que prometia isso; foi removido em vez de inventar a regra. A
   pergunta é se a equipe técnica deve poder devolver, e o que acontece com a
   versão que já estava lá.
2. **O recorte por casa deve valer para a ATA Geral do DIA CORRENTE?** No
   arquivo, cada casa recebe a linha dela. No dia corrente, a coordenação abre a
   folha inteira das oito casas — que era o combinado antes.
3. **"Concluí tudo até agora" na linha do dia.** Facilitador pedido, mas a
   linha do dia contém doses de medicamento, onde "não existe marcação em lote"
   é absoluto. A versão segura ficaria limitada a atividades coletivas que não
   sejam medicação, como ato declarado.
4. **O Arquivo das ATAS abre no mês de calendário** e fica quase vazio todo dia
   1º. Um quarto recorte, "últimos 30 dias", resolveria.
5. **A grade de medicação "para colar na parede"** saiu com horário, nome e
   medicamento, **sem diagnóstico**, e com um aviso na própria folha de que
   corredor e mural aberto não são lugar para o nome de uma criança ao lado do
   remédio dela. Se a casa quiser diferente, é decisão dela.
6. **O que o Gestor Geral vê ANTES de abrir um relato restrito.** A leitura
   excepcional existe e funciona; o que não existe é o caminho até ela — o
   relato restrito não aparece para ele. O precedente do §13.7 (documentos)
   mostra a contagem e nada mais: "existem 2 documentos em área restrita". A
   pergunta é se aqui vale o mesmo, ou se ele precisa também da data e do autor
   para saber o que está pedindo. **Enquanto não houver resposta, a tela não
   será construída** — inventar isso sozinho seria decidir quanto da narrativa
   de uma criança vaza antes da justificativa.
7. **De onde a equipe técnica escolhe as fontes de um acompanhamento.** A rota
   guarda a referência do registro que embasou a avaliação, e o candidato pode
   vir da linha do tempo da criança no período, das ocorrências ou das
   evoluções. Cada opção desenha uma tela diferente.
8. ~~**Onde o aparelho da casa recebe o código do §11.7.**~~ **RESPONDIDA em
   08/09/2026, e a pergunta deixou de existir.** O sistema vai rodar no
   **celular de cada pessoa**, com o e-mail institucional — não há mais o
   aparelho único da casa para ser a trava contra a mesma dose confirmada em
   dois lugares. A regra passou a ser: **dose não se confirma sem sinal, em
   aparelho nenhum**, com recusa na hora e a frase explicando; o resto do turno
   continua funcionando offline. O cadastro de aparelhos da casa continua
   existindo como cadastro, e não decide mais nada (migração 0930).

9. ~~**A medicação a qualquer horário.**~~ **RESPONDIDA em 08/09/2026**, e
   virou a fase 72. O horário previsto EXISTE: o esquema traz a duração, as
   doses e os horários da bula de cada acolhido, e a grade continua fazendo
   sentido. Quem administra é a **Enfermagem das 9h às 17h** e o **educador de
   plantão** fora disso — não por exceção autorizada, mas porque é ele quem
   está na casa. A resposta *(c)* veio junto: a decisão "quem pode dar remédio
   por turno" saiu, e no lugar dela ficou a exceção por medicamento.
   **Fica UMA pergunta desta família**, e ela é pequena: *(b)* "administrado
   com atraso" é informação útil para a Enfermagem, ou cobrança injusta com
   quem estava com uma criança no colo? Hoje o sistema marca; mudar é trocar o
   rótulo por um que descreva o fato sem julgar quem estava de plantão.

10. **O PIA — último e próximo.** A lista da casa traz duas colunas de data, e
   nas vinte crianças elas são iguais (18/06 e 18/09), o que sugere controle
   por uma data única na planilha, e não por criança. **A pergunta:** as datas
   são mesmo iguais para todo mundo, e o sistema deve avisar por criança
   quando o próximo PIA está chegando — 30 dias antes, na tela da técnica?

11. **A Enfermagem vê a internação — decisão MINHA, a confirmar.** *(Ganhou
   apoio na resposta de 08/09: se a Enfermagem responde pela medicação e
   atende das 9h às 17h, é ela quem recebe a criança de volta na alta.)* A resposta
   da coordenação em 03/09 listou equipe técnica, líder educador e coordenador,
   e disse que o educador social comum não vê. Incluí a Enfermagem porque
   internação é primeiro um fato de saúde, e é ela quem responde por medicação
   e retorno quando a criança volta. Desfaz-se numa linha em
   `app_pode_ver_internacao`.

12. **As fontes do protótipo.** O arquivo busca a *Atkinson Hyperlegible* e a
   *Plus Jakarta Sans* na rede. Aberto sem internet — que é como ele é
   entregue —, cai na fonte do sistema; com internet, cada abertura faz uma
   requisição a um terceiro. Embutir as duas famílias custa uns 300 KB no
   arquivo. A Atkinson foi escolhida por ser desenhada para leitura difícil, que
   é o caso de quem lê um alerta no corredor.

---

## 8. DEFEITOS ENCONTRADOS E CORRIGIDOS — O QUE ELES ENSINAM

Vale ler antes de mexer em qualquer coisa parecida. Quase todos eram
**silenciosos**: nenhum dava erro na cara de ninguém.

- **A dose suspensa continuava na grade.** Suspender mudava o status da
  prescrição e deixava as doses de HOJE com o botão "Confirmar" ao lado. No dia
  seguinte ficava limpo, então ninguém percebia — e hoje alguém dava o remédio
  suspenso.
- **A atividade vencida era marcada e ninguém era avisado.** Depois da
  meia-noite, `markUnconfirmed` marcava a atividade das 21h e escalava só as de
  hoje: todas as noites, em silêncio.
- **`current_date` em vez de `app_hoje()`** na autorização de medicamento:
  depois das 21h em Porto Alegre a autorização escrita hoje nascia datada de
  amanhã, e o sistema recusava a dose a noite inteira com a autorização visível
  na tela.
- **Comparar data com `String(objetoDate)`** fazia TODA autorização vigente
  aparecer como vencida.
- **Policies que conferiam o cargo e esqueciam a casa**: a coordenação da Casa
  03 podia escrever o protocolo de medicação e autorizar educador na Casa 04.
- **A fila do arquivo documental estava permanentemente vazia** — nada
  enfileirava, e a tela avisava que a cópia tinha entrado na fila.
- **O servidor aceitava episódio em ATA já fechada**, cuja cópia documental já
  fora arquivada.
- **A migração 055 criou as colunas da planilha real de benefícios** (número,
  operação, agência, pendência bancária) e o serviço nunca as leu nem gravou.
- **A situação judicial nunca era desenhada** no perfil, embora o servidor a
  devolvesse desde a fase 0.
- **Duas rotas que a tela mostrava e ninguém conseguia escrever.** Achadas
  conferindo, uma a uma, as rotas servidas contra as chamadas das telas: o
  perfil desenhava cuidados essenciais, escola e equipe de referência sem porta
  de edição (`PATCH /people/:id`, desde a fase 2), e a Saúde desenhava a tarja
  "Sem definição" em cada período sem botão que definisse
  (`POST /medications/protocol`, desde a fase 4). Nenhuma das duas dava erro:
  para quem olhava a tela, o campo simplesmente vivia em branco. As portas
  vieram com o antes-e-depois (migrações 0850 e 0860), porque abrir a escrita
  sobre "cuidados essenciais" sem guardar o texto anterior é apagar uma
  instrução de proteção — e a auditoria guarda o nome do campo, nunca o
  conteúdo.
- **Contagem absoluta sobre tabela append-only não se estabiliza.** A suíte
  nova do limite da casa contava as linhas de `house_capacity_change` em
  números absolutos — e `cadastro.e2e` também muda o limite da Casa 03. O
  limite ela restaura no fim; as LINHAS do histórico não se apagam. A suíte
  passava sozinha e derrubava uma rodada em três, conforme a ordem dos
  arquivos. Regra: contagem em suíte é sempre RELATIVA ao que já estava lá, e
  o que se procura é a linha pela frase que aquela suíte escreveu.
- **O protótipo busca as fontes na rede.** `styles.css` abre com um `@import`
  do Google Fonts, e o `vite-plugin-singlefile` não embute o que vem de fora.
  Consequência: aberto sem internet — que é como o arquivo é entregue —, ele
  cai na fonte do sistema e perde a *Atkinson Hyperlegible*, escolhida por ser
  desenhada para leitura difícil. E, com internet, cada abertura faz uma
  requisição a um terceiro. Nenhum dado de criança sai nela, mas é uma saída
  para fora que ninguém pediu. **Decisão em aberto:** embutir as duas famílias
  no arquivo (+300 KB, aproximadamente) ou assumir a pilha do sistema.
- **A marca `rls-join-ok:` pode mentir — e mentia.** Oito consultas traziam o
  nome de uma pessoa por junção com `app_user`, com o comentário afirmando que
  aquela tabela não tem RLS de linha. Tem. `JOIN` sumia com a LINHA (o histórico
  do limite da casa voltava vazio para quem trabalha nela); `LEFT JOIN` sumia
  com o NOME (a agenda mostrava o compromisso sem dizer quem vai levar a
  criança). Regra que ficou: nome de pessoa vem sempre por
  `app_user_display_name(id)`.
- **A aba de relatórios quebrava contra o servidor de verdade.** `GET /reports`
  servia sete campos e a tela lia onze; `r.entregas.map(...)` derrubava a aba
  inteira. No protótipo funcionava, porque o `mock.ts` fora escrito olhando a
  TELA. A lição dói: o `contrato-rotas.spec` pega a rota que não existe, e não
  pega a rota que existe e responde outra coisa. Quando o servidor de mentira
  responde melhor que o servidor, a demonstração ensaia um sistema que não
  existe.
- **`SELECT ... FOR UPDATE` sob RLS aplica também a policy de UPDATE.** Ler o
  estado do relatório com trava escondia o APROVADO (`rep_update` exige
  `status <> 'aprovado'`), e o sistema respondia **404** — "não existe" — a
  quem acabara de aprová-lo. Leitura para diagnosticar não leva trava; a
  atomicidade fica no `UPDATE ... WHERE status = <esperado>`.
- **Zerar não é recusar.** O quadro do mês de uma casa fora do alcance voltava
  com tudo em zero, porque o RLS filtra as LINHAS — e zero se lê como "casa
  vazia", não como "não é sua".
- **No protótipo, o "Ver como" troca o cargo e mantém a pessoa** — qualquer
  verificação de autoria no `mock.ts` valia para todos os cargos, e a
  demonstração mentia sobre a política mais estreita do sistema.

E três armadilhas dos ensaios em Playwright, que custaram tempo:
`text-transform: uppercase` quebra `includes` sensível a maiúsculas (usar
`/…/i`); roteiro preso a horário fixo falha em certas horas do dia — o que não
é defeito do sistema; e **`getByRole('button', { name: /Mais/ }).last()` pega o
"⋯" de uma linha de atividade, não a aba da barra de baixo** — as duas têm
"Mais" no nome acessível, e o ensaio "passa" navegando para lugar nenhum. Use
`.first()`.

---

## 9. COMO COMEÇAR A CONVERSA NOVA

Anexe **este arquivo** e o **`rede-acolher-atualizado.zip`**, e cole como
primeira mensagem o bloco de **`docs/PROMPT-MESTRE.md`**, trocando só a última
linha pelo que você quer.

Se preferir escrever à mão, o mínimo que funciona é:

> Este é o Rede Acolher, o sistema de gestão do acolhimento da Fundação O Pão
> dos Pobres. O `RETOMAR-AQUI.md` tem tudo: o que é, onde está, as regras que
> não se negociam, o que já funciona, o que falta e as decisões que são minhas.
> Leia primeiro, confirme que rodou `npx tsc --noEmit` e a suíte, e então
> [o que você quer].

**O que a conversa nova precisa saber logo no começo**, e que já custou tempo:

- **comece por `bash scripts/preparar-ambiente.sh`.** Ele cuida das três coisas
  que caem entre as sessões: as dependências (que vêm de `npm ci` **na raiz**,
  porque é um workspace), o PostgreSQL (que não é serviço e para sozinho) e o
  Chromium do ensaio;
- **tela nova se abre**, não só se compila — e agora isso é um comando:
  `npm run ensaio`. Tela nova precisa entrar no percurso dele.

Se quiser mais profundidade em algum ponto, os outros documentos continuam
valendo:

| Documento | Para quê |
|---|---|
| `CONTINUIDADE.md` | a história longa, fase por fase, com o raciocínio de cada decisão |
| `o-que-falta.md` | o levantamento das rotas sem tela, atualizado |
| `der.md` | as 97 tabelas por partição, e o que cada uma guarda |
| `matriz-permissoes.md` | quem alcança o quê |
| `backlog.md` | o que foi pensado e ainda não construído |
| `piloto-casa-03.md` | o desenho do piloto |
| `PROMPT-MESTRE.md` | o bloco para colar na primeira mensagem da conversa nova |
| `roteiro-marcelo.md` | o roteiro de demonstração para o Marcelo, cargo a cargo. O `.docx` ao lado é GERADO dele por `scripts/roteiro-em-word.mjs` — não edite o Word à mão |
| `formularios-reais.md` | os formulários de papel da casa que viraram tela |
| `pendencias-institucionais.md` | o que depende de decisão da instituição |
| `implantacao.md` | o que precisa existir antes de a casa usar: configuração, os dois acervos, backup e a prova de que a restauração funciona |
| `implantacao-smtp.md` | o e-mail institucional, só na implantação |
