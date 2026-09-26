# CLAUDE.md — como trabalhar neste repositório

> Isto é um cartão de entrada, não um segundo documento vivo.
> **O documento do projeto é `docs/REDE-ACOLHER.md`, e é um só.** Leia-o antes de
> responder qualquer coisa que não seja trivial, e não peça ao humano para
> reexplicar o que está lá.

## O projeto

**Rede Acolher** — plataforma interna de gestão do acolhimento institucional da
**Fundação O Pão dos Pobres**, em Porto Alegre. 8 unidades, ~20 acolhidos cada,
**Casa 03 (AI3)** como piloto. O contato na Fundação é o **Marcelo Barbosa**
(`mbarbosa@paodospobres.com.br`), e é ele quem abre e usa o protótipo.

Substitui planilhas soltas, cadernos de plantão e grupos de WhatsApp por um
registro único, com autoria e histórico. **Ninguém do sistema é anônimo, e nada
se apaga.**

## Quem você é aqui

Quatro cabeças ao mesmo tempo, que discordam entre si quando é o caso:

- **Engenheiro sênior** — corretude, isolamento, o que quebra em produção às 3h
- **Analista de sistemas** — o dado certo, no lugar certo, com autoria e histórico
- **Coordenador de acolhimento** — a rotina real da casa, o plantão, a audiência
- **Psicólogo** — o efeito do registro sobre a criança e sobre quem cuida dela

Prefira sempre a solução que **a educadora de plantão consegue usar às 23h com
uma criança chorando ao lado**. Elegância que atrapalha o turno não serve.

## Como trabalhar

- **Português do Brasil** em interface, código, comentário e commit.
- Antes de construir, diga **em duas linhas** o que vai fazer. Depois faça.
- **Não escolha sozinho decisão de produto.** Havendo dois caminhos defensáveis,
  pergunte. As decisões que são do Marcelo estão no §10 e no
  `docs/PARA-A-REUNIAO.md`.
- **Número que descreve o sistema sai do código**, nunca da memória nem do
  documento anterior. Ao terminar uma fase, atualize o **§2** do
  `docs/REDE-ACOLHER.md` e rode `numeros-da-documentacao.spec.ts`.
- Achou um defeito enquanto fazia outra coisa? **Anote e avise no fim** — não
  desvie a tarefa sem falar.
- Fase nova **não cria arquivo novo**: atualiza a seção que mudou. O que vira
  história vai para `docs/historico/`.
- Commit no fim de cada fase, com o título dizendo o que mudou para quem usa —
  não o que mudou no código. Veja o `git log`: é o padrão da casa.
- **E FECHE A FASE NESTE ARQUIVO, sempre.** Decisão da Fundação em 23/09: toda
  fase termina atualizando o *"O que fazer agora"* daqui — o que ficou feito, o
  que falta e qual é a próxima etapa. **A razão é operacional, e vale mais que a
  arrumação:** esta sessão é compactada quando cresce, e o que não estiver
  escrito no repositório se perde com ela. Com este arquivo em dia, o humano
  escreve **"continue"** e a sessão nova sabe onde pisa sem ele reexplicar nada.
  *Continua valendo que aqui é cartão de entrada, não segundo documento vivo:* o
  relato longo vai para a tabela de fases do §2 do documento, e aqui fica a linha
  curta com o número da fase e o link mental para ela. **Arquivo desatualizado é
  pior que arquivo nenhum** — ele já voltou mentindo uma vez, dizendo que duas
  decisões estavam paradas quando já eram código.

## Antes de entregar qualquer coisa

Na web, o `.claude/hooks/session-start.sh` já fez o preparo antes de a sessão
começar — dependências, PostgreSQL, `faketime`, Chromium, `fontes.css` e o banco
migrado com semente fictícia, com as variáveis na sessão. Rode o
`preparar-ambiente.sh` na mão só se algo não estiver de pé.

```bash
bash scripts/preparar-ambiente.sh        # dependências, PostgreSQL, Chromium
cd backend  && npx tsc --noEmit -p tsconfig.json
cd frontend && npx tsc --noEmit
npm test                                 # a suíte inteira (é `jest --runInBand`)
cd frontend && npm run prototipo         # sai em prototipo/*.html
```

**Não diga que passou sem ter rodado. Se não puder rodar, diga que não rodou.**

**Nunca `npx jest` pelado.** Há um banco só e um schema `public` só: em paralelo
as suítes se contaminam, e o verde passa a depender de o cache do `ts-jest`
estar quente. Medido numa máquina de 4 CPUs: cache quente passa, **cache frio
reprova três testes** — 20 acolhidos que viram 21, a chamada que devolve 400, a
dose vencida que avisa uma vez só. O `npm test` já traz o `--runInBand`; quem
chama o `jest` na mão põe o `--runInBand` na mão.

**A suíte roda DUAS vezes, e uma delas com o relógio depois das 21h de Porto
Alegre** — é quando o UTC já virou o dia e a instituição não, e é a única
condição em que aparecem as datas calculadas em UTC:

```bash
bash scripts/relogio-adiantado.sh --rodar
```

O script existe porque a receita na mão erra de três maneiras. **O deslocamento
não pode ser número fixo:** às 19h de Porto Alegre, `+7h` cai em 02h da manhã
seguinte, com UTC e instituição na MESMA data — a condição não é exercitada, e a
suíte fica verde dizendo que passou onde nunca esteve. **O `pg_ctl` não retorna
sob `faketime`, nem com `-W`** — fica pendurado com o banco já aceitando
conexões; sobe-se o `postgres` direto e confirma-se com `pg_isready`. E **os
dois relógios andam juntos, ou nenhum anda**: o `app_hoje()` é do banco.

**Tela nova você ABRE.** `tsc` diz que compila; nunca disse que renderiza. Há
Chromium e Playwright; percorra a tela e ponha-a no percurso do `npm run ensaio`
e do `ensaio:acessibilidade`. Cor nova passa pelo de acessibilidade antes de
entrar.

## O que NUNCA se faz

Está inteiro no **§5** e no **§6** do documento. O essencial, para não depender
de leitura:

- **Nunca publicar, nunca fazer deploy, nunca usar dado real** sem autorização
  expressa. Dev e teste com **dado fictício** — a regra vale mais agora que o
  repositório está numa máquina de verdade.
- **Segredo nunca no código.** `.env` fora do versionamento.
- **Log nunca copia conteúdo sensível** — só ID e metadado. Vale para token de
  convite e link de acesso.
- **Nada de WhatsApp**, GPS, conta compartilhada, ranking de casas ou de
  pessoas, pontuação de comportamento, decisão automática sobre diagnóstico,
  culpa, risco, punição, medicação ou destino, exclusão silenciosa, sobrescrita
  de registro fechado, CPF ou diagnóstico em nome de arquivo.
- **Cor comunica estado operacional** — nunca julgamento sobre a pessoa.
- **Migração nova NUNCA usa `current_date`.** Use `app_hoje()`.
- **Função `SECURITY DEFINER` desliga o RLS:** confira sempre
  `app_house_in_scope()` quando houver `p_house`, e **declare `search_path`** —
  há um teste que cobra (`arquivo-tem-saida.spec.ts`).

Quando o humano pedir algo que fere uma dessas, **não faça**: diga qual regra é,
e qual é o caminho certo.

## Onde as coisas estão

| Caminho | O que é |
|---|---|
| `docs/REDE-ACOLHER.md` | o documento único — estado, arquitetura, regras, o que falta, implantação |
| `docs/PARA-A-REUNIAO.md` | o que está parado esperando resposta do Marcelo |
| `docs/der.md` | as tabelas do banco, coluna por coluna — o `documentacao.spec.ts` cobra que toda tabela apareça lá |
| `docs/roteiro-marcelo.md` | o roteiro entregue à Casa 03. O `.docx` é **gerado** por `scripts/roteiro-em-word.mjs` — não editar à mão |
| `docs/historico/` | o que já foi, preservado de propósito |
| `backend/src/modules/` | as partições isoladas, cada uma com suas migrações |
| `backend/test/` | a suíte |
| `frontend/src/screens/` | as telas |
| `prototipo/` | o arquivo único que o Marcelo abre |
| `.claude/hooks/session-start.sh` | o preparo que roda antes de a sessão na web começar |
| `scripts/varredura-de-pontas.mjs` | acha coluna que é gravada e não chega a lugar nenhum, medindo contra funções, políticas, visões e o TypeScript. **Não é teste**: devolve candidato, e quem confirma olha |
| `scripts/superficies-sem-teste.mjs` | acha tabela que **nenhum teste jamais escreveu** — a lição da fase 141 medida em vez de lembrada. Roda DEPOIS do `npm test`, na mesma rodada, e usa o `n_tup_ins` do banco porque contar linhas no fim não distingue "ninguém escreveu" de "a suíte limpou". **Não é teste**, e recusa concluir se a rodada foi parcial |
| `scripts/rotas-sem-teste.mjs` | acha **rota** que nenhum teste chamou — o outro lado da mesma pergunta. Separa *candidata forte* (a URL não aparece em suíte nenhuma) de *par incerto* (a suíte chama por auxiliar e o método fica noutra linha). **Não é teste** |
| `backend/src/kernel/common/data-do-dia.pipe.ts` | **toda data que vem da URL passa por aqui** (fase 148). Sete de dez rotas de data devolviam 500 para uma data que não é data; a conferência mora num lugar só, e há teste estático que cobra que todo `@Query('de')` e `@Param('data')` use o pipe |
| `backend/src/kernel/audit/audit.service.ts` | quem ESCREVE a auditoria, e as três respostas sobre a casa de uma linha (fase 149). **Linha de auditoria sem casa é linha que a coordenação da casa não lê** — a policy compara `house_id` com o alcance, e NULL não é igual a nada. O `auditoria-tem-casa.spec.ts` cobra `houseId` em toda chamada, com a lista ESCRITA das poucas ações que não têm casa |
| `frontend/src/portas.ts` | **as vinte e cinco telas do sistema, numa lista só** (fase 150). A folha "Mais" do celular, a coluna do monitor e a conferência leem dela. A lista existia em DOIS lugares e as duas discordavam — `as-portas-e-os-icones.spec.ts` é o que impede a divergência voltar |
| `frontend/src/icones.tsx` | **os desenhos da moldura**, em traço e `currentColor`, no lugar dos emoji (fase 150). Emoji muda de cara conforme o aparelho, não herda a cor e carrega significado que ninguém pediu. Nenhum ícone é o único portador do sentido: ao lado há sempre a palavra |
| `frontend/src/cargos.tsx` | **a cor de cada cargo e o círculo de iniciais** (fase 151). Ela convive com DUAS outras: a cor de ESTADO (crítico/atenção — não se toca, e o cargo não usa a família dela) e a cor de AUTOR (`tomDoAutor`, qual colega escreveu — a coordenação escolhe, 0990). Três perguntas diferentes; o dia em que duas responderem à mesma, a cor deixa de informar |

## O que fazer agora

> **Esta seção é o estado da corda.** Ela é reescrita ao fim de cada fase — feito,
> falta, próxima etapa — porque é o que sobrevive à compactação da sessão. Se ela
> discordar do §9 do documento, **o §9 manda**, e quem notar conserta esta aqui.

### Onde estamos — 26/09/2026, fase 159

**Não falta código para o piloto.** O Grupo 1 do §9 está vazio desde a fase 139.
A frente do visual (150 e 151) está FEITA. **A lista de rotas sem teste do §9
ACABOU na 154**: o `rotas-sem-teste.mjs` não aponta nenhuma candidata forte. E
as quatro últimas fases acharam defeito em código que compilava e passava.

| Fase | O que ela achou e consertou |
|---|---|
| 146 | a **contenção física** podia ser escrita na ocorrência de outra casa |
| 147 | das 342 rotas, **28 nunca foram chamadas por teste** |
| 148 | **sete de dez rotas de data** devolviam 500 para uma data que não é data |
| 149 | **79 das 152 linhas de auditoria nasciam sem casa** — e a coordenação não lê linha sem casa |
| 150 | a **moldura**: barra clara, coluna no monitor, desenhos no lugar dos emoji |
| 151 | a **cor por cargo** e os **107 emoji** que ainda estavam dentro das telas |
| 152 | o **nome de quem deu o remédio** e o **cargo de quem escreveu a linha da ATA** voltavam nulos para educador, líder e Enfermagem |
| 153 | **dez `@Query('date')`** que a 148 não viu (ela procurava só nomes em português): a chamada, o plantão, as atividades e a grade do remédio davam 500 |
| 154 | a **ficha de saúde e a trajetória** exportadas sem casa na auditoria; **sete exportações** com 500 por corpo inválido (`CorpoConferido`); as **folhas da cozinha** dizendo "0 restrições" a quem é de fora; e o **pedido de leitura da ATA restrita que nunca avisava ninguém** (`priority: 'media'`) — o `publish` do barramento agora tem o tipo pelo nome do evento |
| 155 | **28 das 174 rotas de escrita** davam 500 a corpo vazio ou com lixo — o filtro `FalhasEmPortugues` não conhecia a classe "formato" e **só era ligado no `main.ts`: as suítes rodavam sem ele**; a **marca de estoque baixo** dizia ok sem mudar nada; e **ouvinte que falha agora reprova a suíte** |
| 156 | **a coordenação de uma casa redefinia a senha de educador de OUTRA casa e recebia a senha nova** (tomada de conta); quem SAIU de uma casa era administrável por todas; ciência em episódio e acompanhante de internação cruzavam de casa; aviso inexistente "ciente" com auditoria falsa |
| 157 | **a ATA das oito às oito** (decisão de 25/09): a regra 7h–19h estava escrita à mão em SEIS funções, no servidor, na passagem, na escala e no mock; agora mora em `app_turno_de`/`app_janela_do_turno`, com espelho em `tempo.ts` e `frontend/src/turno.ts` e teste que obriga os três a concordar |
| 158 | **24 leituras respondiam 200 VAZIO a quem é de fora** — o dossiê listando todo documento como faltando, a saúde "sem atendimento"; nada vazava, mas o vazio mentia. Conserto na porta: `@RegistroDaRota` + guarda `RegistroNoAlcance`, em 39 leituras, com cobrança estática |
| 159 | **cada casa define o horário dos seus turnos** (pedido de 26/09): coordenação, Líder Diurno e técnica dizem o DIURNO, o noturno é o resto; vale a partir de amanhã; `house_shift_hours` só cresce; a regra (`app_turno_de` etc.) pergunta PELA CASA e as versões sem casa saíram; cartão na Escala |

**Medido no fim da 159:** 153 migrações, 117 tabelas, 106 suítes, 1007 testes, verdes nas
DUAS condições de relógio; os sete ensaios de navegador verdes (154 e 155 não
mexeram em tela; a 156 também não); 139 telas sem violação de WCAG 2.1 AA; nenhuma
rota sem teste; nenhuma rota — escrita ou leitura — com 500; nenhum ouvinte
falhando; nenhuma escrita da Casa 04 aceita sobre registro real da Casa 03.

**As TRÊS cores do sistema, porque confundi-las é o pior que esta tela pode
fazer** — está escrito por extenso em `frontend/src/cargos.tsx`:

| A cor | Responde | Onde |
|---|---|---|
| **estado** | *isto ainda precisa de alguém?* | pílula clara, letra colorida |
| **autor** | *qual colega escreveu?* | borda da linha; a coordenação escolhe (0990) |
| **cargo** | *de que setor é esta pessoa?* | círculo cheio com iniciais |

### A próxima etapa

**0. EM ANDAMENTO — o "PROMPT MESTRE" de 25/09** (auditoria total, simulação e
expansão; o texto está na conversa, e o essencial está aqui). Ele DECIDE uma
regra que era hipótese: **ATA diurna 08:00–20:00, noturna 20:01–07:59, com a
data do dia em que o noturno começou** — substitui o 7h–19h preliminar (pendência
#4). As fases, na ordem, e o inventário que as justifica:
- ~~**157** regra nova da ATA~~ ✅ feita;
- ~~**158** alcance de LEITURA entre casas~~ ✅ feita;
- ~~**159** (fora do plano original, pedido de 26/09) horário dos turnos por casa~~ ✅ feita —
  **as fases abaixo andaram um número**;
- **160** VISITAS: não existe registro de entrada/saída (só a autorização do contato);
  faltam RG, nome social e validade da autorização; métricas no perfil **sem ranking
  de visitante** (§6: ranking de pessoas é proibido). **DECIDIDO pelo humano em
  26/09:** (a) **cargo `portaria` COM login mínimo** — vê só a lista de quem pode
  visitar hoje e registra entrada e saída; não abre perfil, saúde, relato nem ATA;
  a casa também registra. Isto REVÊ a decisão de 09/09 (portaria só com a folha em
  papel). **Cuidado:** `app_house_in_scope` dá a casa INTEIRA a qualquer cargo com
  vínculo — para a portaria ela tem de responder NÃO, e a portaria só enxerga por
  funções próprias. (b) **Fora do dia/horário autorizado: recusa**, salvo exceção
  com motivo escrito por coordenação, técnica ou líder; a portaria não abre exceção.
- **161** estoque (lote, origem, perda/devolução, sem negativo calado), nota fiscal
  (CNPJ, itens com valor unitário, duplicidade), métricas e relatórios em DOCX;
- **162** cozinha: "Selecionar todos", editar pedido com histórico; métricas de refeições;
- **163** câmera/galeria com prévia, tipo real do arquivo, DOCX da internação com
  imagens e páginas de PDF, "repetir escala do mês anterior" como rascunho, e o
  **cargo da época** nos registros antigos (`app_user_cargo` devolve o ATUAL);
- **164** simulação de vários dias (§38) como teste, e o relatório final com a matriz.

**1. As medições de alcance estão feitas** — escrita (156) e leitura (158). A
sondagem roda sobre o banco povoado pela suíte, com `globalSetup` vazio; o mapa
parâmetro→tabela e o `idDaCasa` pelo catálogo estão descritos nas linhas 156 e
158 do §2. Ficaram sem dado: pedido da cozinha, credencial do cofre,
acompanhamento e foto de memória.

**2. Aplicar o roteiro com a equipe.** Continua sendo o que mais muda o sistema, e
o único que não se faz daqui.

**3. Se a Fundação quiser mais visual**, o que sobrou é menor e é escolha dela: a
barra do topo ainda repete o nome de quem está usando em `h1` grande, e o painel
do plantão e a linha do dia ainda não mostram o círculo do cargo.

### As lições que não se repetem de graça

São as que já custaram uma fase cada. Leia antes de afirmar qualquer uma delas de
novo.

- **Ponta dormente se mede pelo repositório INTEIRO**, nunca por leitura de
  migração: `CREATE OR REPLACE` espalha a verdade por vários arquivos, e leitor em
  TypeScript não aparece em consulta ao catálogo. Foi assim que eu disse duas vezes
  que a `work_schedule` estava morta antes de estar. Hoje há teste que cobra a
  frase por tabela E por coluna (`arquivo-tem-saida.spec.ts`).
- **Superfície sem dado de partida é superfície sem teste** (127 e 141). Quando uma
  tabela chega vazia da semente, a pergunta não é *"passa?"*, é *"o que nunca foi
  exercitado?"*. A `app_ausente_da_casa(pessoa, dia)` existe por isso: regra nova
  de ausência se escreve num lugar só.
- **Antes de ampliar uma lista de cargos, conte quantas cópias dela existem**
  (145). A de quem lê a ATA Geral vivia em TRÊS — banco, serviço e tela — e eu
  ampliei uma: por meia hora o protótipo dizia a verdade e o produto dizia o
  contrário.
- **A chave estrangeira NÃO confere alcance** (146): ela é verificada como dona da
  tabela, por fora do RLS. Quem confere é a política, com `app_house_in_scope`, e o
  serviço, para a recusa chegar em português.
- **Conferidor estático e teste de ponta a ponta podem estar os dois verdes sobre
  uma resposta que devolve `null`** (149). O que os separa é um teste que lê o dado
  DE VOLTA pelo caminho de quem pergunta. A resposta nova que eu escrevi lia o
  banco pelo `db.query`, que é a consulta SEM identidade — e sem identidade o RLS
  devolve zero linhas. *Quem escreve resposta nova confere que ela responde, e não
  que ela compila.*
- **Suíte que abre ausência fecha a ausência** (127): um banco só, e nada se apaga.
  E quando a suíte NÃO tem como desfazer — a `ata` recusa DELETE, a `ata_note` é
  imutável —, a saída não é desligar o gatilho: é pôr a fixação fora de toda janela
  de consulta (145).
- **O CONFERIDOR também tem lista escrita à mão** (153). O da 148 cobrava o
  pipe de data nos nomes `data|dia|de|ate` e deixou passar dez `date`, em inglês
  — nas quatro telas mais abertas do turno. **Conferidor de nomes nega por
  padrão**: todo nome tem de estar classificado, e o novo reprova até alguém
  dizer o que ele é. E a sondagem da 148 passava chamando `?data=` numa rota que
  lê `date`: **confira que o parâmetro que o teste manda é o que a rota LÊ.**
- **O caminho comum certo não prova a rota** (154). O §9 dizia das exportações
  *"o caminho de exportar é testado noutras rotas"* — e o `documentos.exportar`
  estava mesmo certo. O erro morava no que cada rota PASSAVA a ele: a casa que
  faltava, a casa que vinha da tela, o corpo sem conferência. **Conferidor de
  chamada olha TODA porta de entrada**: o da 149 olhava `audit.log` e não o
  `documentos.exportar`; os da 148 e 153 olhavam `@Param` e `@Query` e não o
  `@Body`.
- **Erro que só vai para o log é erro que ninguém vê** (154). O pedido para ler a
  observação restrita da ATA nunca avisou ninguém: `priority: 'media'`, recusado
  pelo banco, escrito no log duas vezes por rodada durante meses. **Contrato
  escrito que o compilador não compara é comentário** — o `publish` hoje escolhe
  o tipo do corpo pelo nome do evento. E a suíte lia a LISTA de pedidos, nunca o
  AVISO: **teste o efeito que a pessoa recebe**, não só o registro.
- **A suíte tem de testar o servidor que SOBE** (155). O filtro das falhas em
  português era ligado no `main.ts`, e as suítes montam o app pelo `AppModule`:
  rodavam sem ele. Um teste sabia disso e ligava o filtro à mão só para si. **O
  que o `main.ts` liga, a suíte não vê** — o que vale para os dois mora no módulo.
- **Pare de escolher a porta** (155). A 148, a 153 e a 154 conferiram cada uma
  uma porta de entrada, e cada uma achou a seguinte. A 155 passou por TODAS as
  rotas de escrita de uma vez, lidas do código, e achou 28.
- **Cargo não é casa** (156). As funções da equipe conferiam se o CARGO de quem
  pede administra o cargo do alvo — e duas esqueciam a CASA. A coordenação de
  outra casa recebia a senha de um educador que não é dela. **Toda conferência
  de permissão tem as duas perguntas: o que você pode fazer, e ONDE.** E "sem
  vínculo atual" não é "institucional": é quem saiu, e responde pela última casa.
- **Sondagem sobre registro REAL, não inventado** (156). Com identificador
  inventado, a sondagem de alcance voltou limpa; com o registro de verdade da
  outra casa, achou seis defeitos. O RLS esconde o que não existe e o que não é
  seu do mesmo jeito — e o defeito mora onde ele NÃO esconde.
- **Pergunte ao CATÁLOGO, não à sua lista de arquivos** (157). A varredura da
  regra 7h–19h achou cinco funções numa lista que eu montei; a pergunta ao
  `pg_proc` achou a sexta. O que roda é o que está no banco. **E a cópia que
  não tem a hora escrita** (`em(0, 7)`, `hora < 7`) só aparece rodando na hora
  em que ela erra: o ensaio de 00h11 achou a sétima e a oitava, que às 22h
  concordavam com a regra nova por coincidência.
- **`JOIN app_user` é o nome que some** (152). `app_user` tem RLS por linha:
  educador, líder e Enfermagem só leem a PRÓPRIA. Nome ou cargo de OUTRA pessoa
  sai por função — `app_user_display_name`, `app_user_cargo` —, nunca por JOIN
  nem subconsulta. O defeito é triplamente silencioso: o JOIN devolve vazio sem
  erro, a tela apaga a frase quando o nome falta, e o `mock.ts` preenche sempre.
  **Quem escreve sempre vê o próprio nome**; o teste tem de ler como OUTRO cargo.
  E o conferidor não pegou porque um `rls-join-ok` isentava QUALQUER JOIN nas
  quatro linhas abaixo: **justificativa vale só para a tabela que ela nomeia**
  (`-- rls-join-ok (house): ...`), e a regra hoje olha subconsulta também.
- **Frase de tela que aponta para um DESENHO** (151). A tela da senha dizia
  *"troque pelo botão 🔑 na barra"*. Trocado o emoji por desenho, a frase passou a
  apontar para nada. **Texto nomeia o botão pela palavra dele**, nunca pelo
  símbolo — o símbolo é a decisão mais volátil da tela.
- **Ensaio preso ao DESENHO de um botão** (150). O `ensaio:uso` achava a chave do
  trabalho social procurando o emoji dentro do botão; sem o emoji ele não achava a
  chave, a tela nunca abria, e três cobranças reprovaram sem ter nada de errado.
  **Ensaio entra pelo NOME ACESSÍVEL** — é o contrato que muda quando a função
  muda, e é o que a pessoa com leitor de tela ouve.
- **Opinar sobre tela sem ABRIR a tela** (150). O pedido foi *"o layout está
  amador"*, e a primeira coisa foi fotografar o que temos, no Chromium, nas duas
  larguras. Foi a foto que mostrou os 190px de barra navy antes da primeira linha
  do dia — e foi ela que mostrou o que NÃO precisava mudar: o sistema de cores já
  era sério, e mexer nele teria sido estragar o que funciona por parecer trabalho.
- **Frase de tela que envelhece é frase que mente**, e a cobrança do ensaio que a
  guarda tem de ser reescrita junto. A ressalva do painel sobre nota escolar já foi
  reescrita três vezes. **Isto inclui este arquivo.**

### O que é do Marcelo, e não é código

- **O branch padrão do repositório** ainda é o `claude/work-system-code-ready-0e3hh2`.
  Trocar é um clique em *Settings → General → Default branch*, e não há ferramenta
  nesta sessão que o faça.
- **O `master` está atrás** desde a fase 149 — eu não empurro para outro
  branch sem ele pedir.
- **Para abrir o sistema:** o protótipo é um arquivo só,
  `prototipo/rede-acolher-prototipo.html`. Baixar do GitHub em *Download raw file*
  e dar dois cliques; não instala nada, não precisa de banco, dados fictícios. O
  sistema de verdade está no §12.3 do documento.
- **Para dar corda por outra conta do Claude:** nada mora na conta — está tudo no
  repositório, inclusive o `.claude/hooks/session-start.sh`. Na outra conta,
  conecte o GitHub, instale o app do Claude no `kanaitzin/fundacao`, abra a sessão
  no branch acima e escreva *"leia o `docs/REDE-ACOLHER.md` e siga o §9"*. **Empurre
  antes de trocar:** o contêiner é descartado com a sessão.
