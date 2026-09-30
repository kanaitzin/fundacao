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
- **Documento para baixar fala como a equipe de acolhimento** (decisão de 27/09,
  §5 item 10). Relatório, folha, ressalva e roteiro: linguagem institucional de
  quem trabalha no acolhimento. Sem travessão, sem maiúscula de ênfase, sem
  aspas, sem falar do sistema, sem defender a regra (*de propósito*). A
  ressalva é escrita para o papel, nunca o aviso da tela. O
  `a-voz-dos-documentos.spec.ts` cobra; **a tela pode explicar, o papel não**.
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
| `frontend/src/anexos.tsx` | **o `EscolherAnexo`** (fase 165): câmera, galeria, arquivo e a câmera do computador, com prévia, ampliar, descartar e tirar outra. Todo lugar novo que recebe foto ou documento usa este, e não um `<input type="file">` solto. **E o `lerArquivo` daqui é a única leitura de arquivo** (fase 175): é ele que reduz a foto antes de enviar, e leitura por conta própria manda a foto do tamanho da câmera |
| `backend/src/kernel/documentos/paginas-do-pdf.ts` | **as páginas de um PDF como imagem** (fase 165), num processo à parte (`desenhar-paginas.mjs`, nome diferente de propósito: com o mesmo nome o Jest importava o `.mjs`). Nunca lança: PDF que não desenha volta marcado, e o documento sai assim mesmo |
| `scripts/simulacao-da-casa.sh` | **uma casa nasce e vive noventa dias** (fase 173), **ou as oito vivem juntas** com `SIM_CASAS` (fase 177): a ARM1 do primeiro acesso a fevereiro, com o relógio andando (`faketime` lendo um arquivo que a simulação reescreve), os relatórios conferidos contra o que ela contou, e no fim o **`frontend/ensaio-servidor.mjs`**, que abre as telas no navegador **contra o servidor de verdade**. Recria o banco: não roda junto com a suíte. `SIM_SO_NAVEGADOR=1` repete só o navegador |
| `backend/src/kernel/common/porta-da-internet.ts` | **CORS, cabeçalhos de segurança e `TRUST_PROXY`** (fase 179), ligados pelo `AppModule`. CORS vazio é FECHADO: a tela está no mesmo endereço |
| `backend/src/kernel/common/corpo-da-requisicao.ts` | **o limite do corpo, 25 MB** (fase 179): o anexo vai em base64 e o padrão de 100 KB recusava toda foto de celular. Mora no módulo para a suíte ver |
| `frontend/src/cargos.tsx` | **a cor de cada cargo e o círculo de iniciais** (fase 151). Ela convive com DUAS outras: a cor de ESTADO (crítico/atenção — não se toca, e o cargo não usa a família dela) e a cor de AUTOR (`tomDoAutor`, qual colega escreveu — a coordenação escolhe, 0990). Três perguntas diferentes; o dia em que duas responderem à mesma, a cor deixa de informar |

## O que fazer agora

> **Esta seção é o estado da corda.** Ela é reescrita ao fim de cada fase — feito,
> falta, próxima etapa — porque é o que sobrevive à compactação da sessão. Se ela
> discordar do §9 do documento, **o §9 manda**, e quem notar conserta esta aqui.

### Onde estamos — 30/09/2026, fase 181

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
| 160 | **quem visitou, e a portaria no sistema** (decisões de 26/09): cargo `portaria` com login mínimo — `app_house_in_scope` diz NÃO a ela e ela vê só pelo portão; `visit`/`visit_correction`; fora do combinado RECUSA, exceção com motivo só de coordenação/técnica/líder; visitas no perfil DA criança, visitantes por nome; RG, nome social e validade no visitante |
| 161 | **o armário diz a verdade** (decisões de 26/09): saldo NEGATIVO com aviso (a dose nunca é bloqueada); lote, validade e origem na entrada; descarte/perda/devolução com motivo; nota com CNPJ e itens, SEPARADA do armário, repetida RECUSADA; métricas da casa por remédio; relatórios em Word com a imagem da nota; `mov_insert`/`stock_update` eram `WITH CHECK (true)` |
| 162 | **a cozinha recebe a lista** (decisões de 26/09): "Selecionar todos" = um pedido por criança, tudo ou nada (`batch_id`); editar até o dia, por quem pediu/coordenação/técnica/líder, com `kitchen_request_change`; refeições da casa por refeição; e o **relatório do período perdia o último dia** (`reference_at BETWEEN` datas) |
| 163 | **três temas, Portaria em cartões com a foto 3×4, botões na coluna** (pedido de 27/09): tema **alto contraste** (decisão), no sistema de verdade, lembrado no aparelho (`frontend/src/tema.ts`); o **ensaio de acessibilidade só media o claro** — hoje mede os três, 432 telas; foto 3×4 anexada por técnica/coordenação no próprio portão; ícone do Período |
| 164 | **a voz dos documentos** (pedido de 27/09): toda folha, relatório e o roteiro da Casa 03 reescritos na linguagem da equipe de acolhimento, e a regra virou teste (`a-voz-dos-documentos.spec.ts`); de passagem, a **folha da escala imprimia 08:00–20:00 fixos** apesar do horário por casa da 159, e o **relatório de visitas imprimia o aviso da tela** como ressalva |
| 165 | **o relatório da internação em Word** (capa, os dias, e os anexos com as páginas dos PDFs do hospital), **a câmera no anexo** (`EscolherAnexo`), o anexo cortado e o repetido recusados, **o mês como rascunho** e **o cargo da época**; o papel do servidor virou A4/Arial 12/margens 3 e 2 cm como o do protótipo; e o **colírio das 07:30 era dose da noite** no protótipo desde a 157 |
| 166 | **a simulação de um ciclo completo** na Casa 03 (dois dias e hoje, conferindo os relatórios contra os fatos); achou que **não havia como cadastrar alergia nem restrição alimentar**, que a política dessas tabelas **não conferia a casa**, e que **a ATA em Word não trazia as linhas da equipe**; e o **relatório final** do pedido de 25/09 |
| 167 | **dois anos de casa** no `ensaio-carga.ts 24`, agora com portão, armário, notas, cozinha, escala e ATA: **as métricas do remédio num ano levavam 15 s** porque 119 políticas perguntavam o alcance LINHA POR LINHA. A 1624 troca todas pelo conjunto (`app_casas_no_alcance`, `app_pessoas_no_alcance`), com equivalência cobrada pessoa a pessoa e cargo a cargo; ATA anterior (605 ms), auditoria da criança (377 ms), armário e painel da Enfermagem consertados. Nenhuma rota acima de 300 ms |
| 168 | **o §39**: o **registro guardado sem sinal subia com a identidade de quem estivesse entrado** quando o sinal voltava (agora leva `autorId` e só sobe com a sessão dessa pessoa); **sessão que termina** abre a entrada por cima da tela, na mesma conta; **duas abas** rebaixavam a operação aplicada; o **voltar** saía da página; o **aparelho cheio** dizia "fica guardado"; e a **lista de aniversários daria erro em 2028** depois de fevereiro (1627) |
| 169 | **a sondagem de alcance das quatro superfícies que ficaram sem dado** (cozinha, cofre, acompanhamento, foto de memória), agora como suíte e com registro real: nenhuma escrita passou, nada vazou, mas **quatro leituras respondiam 200 vazio** à Casa 04, e a do cofre **gravava na auditoria uma abertura que não houve** |
| 170 | **a sondagem de alcance virou suíte permanente** (`zz-a-sondagem-de-alcance`, POR ÚLTIMO pelo `test/setup/sequenciador.js`) e achou **41 leituras com a casa na consulta respondendo 200 vazio** à Casa 04; conserto num lugar só (`CasaDaConsulta`, com `@CasaConferidaNoServico` para a portaria). E a **Enfermagem baixa o relatório da internação** (decisão de 27/09) |
| 171 | **a sondagem de ESCRITA entre casas virou suíte permanente** (`zz-b-a-sondagem-de-escrita`), com a prova no BANCO (fotografia das linhas da Casa 03 antes e depois de cada rota): cerca de 170 rotas, nenhuma escrita passou; a edição do perfil respondia **ok** à Casa 04 com corpo vazio, e abrir anexo de ocorrência de fora dava **500** |
| 172 | **os dois ajustes visuais que eram da Fundação** (escolhidos em 28/09): o topo deixa de repetir o nome em título grande (nome, casa e e-mail numa linha, ainda `h1`), e o **círculo do cargo** chega ao painel do plantão e à linha do dia, com o cargo por `app_user_cargo` (1628), lido por OUTRO educador no teste |
| 173 | **noventa dias de uma casa, e as telas contra o servidor de verdade** (pedido de 28/09): o relatório do período e o das compras imprimiam **Invalid Date** (a coluna `date` agora volta como texto); **a tela dos Acompanhamentos nunca funcionou no sistema de verdade** (corpo e lista sem a casa, resposta em outra forma) e **`app_house_in_scope(NULL)` deixava passar** (1629); a dose de quem está com a família era cobrada em quatro lugares (1630–1632); a Cozinha abria com erro para educador. E as decisões de 28/09: ATA do fim de semana fechada pelo Líder de segunda, dose avisada uma vez, visitas desde o acolhimento, **chegada de noite pelo plantão** (1633). Relatório em `docs/historico/simulacao-de-90-dias-28-09.md` |
| 174 | **um ano inteiro de casa, e as ATAs do dia em sequência** (pedidos de 28/09): a simulação vive 365 dias e tudo bate (299 visitas, 6329 refeições, 1055 doses, 730 plantões); nenhuma leitura ou relatório acima de 174 ms; o banco cresce ~22 MB por casa por ano (os anexos em disco é que crescem: foto guardada do tamanho da câmera, pergunta no PARA-A-REUNIAO §4.14). No Arquivo, o filtro **Os dois turnos / Só diurno / Só noturno** e, para coordenação, técnica e líderes, a **leitura em sequência** das folhas (`PapelDoDocumento`). Relatório em `docs/historico/um-ano-de-casa-28-09.md` |
| 175 | **a foto sai reduzida do aparelho** (decisão de 28/09): o `lerArquivo` do `anexos.tsx` reduz antes de enviar (até 2000 px, JPEG 0,85, perto de 500 KB); PDF e imagem já pequena vão como vieram; a prévia diz de quanto era. O Dossiê, o Trabalho Social e a câmera do computador liam o arquivo por conta própria e passaram pela mesma função; e o limite de tamanho, conferido ANTES de reduzir, recusaria a foto que ia ficar pequena |
| 176 | **a Coordenação Geral** (cargo novo do Marcelo, decisão de 28/09): coordenador com a marca `todas_as_casas` (1634), que `app_user_house_ids` lê — nenhuma das 78 funções, 61 políticas, 76 conferências do servidor e 44 da tela precisou mudar. Só o gestor marca, só coordenador recebe, nasce sem casa (`app_create_coordenacao_geral`), não entra em escala nem escalonamento de casa. Topo diz *Coordenação Geral*, abre nas Unidades; Equipe do gestor tem a caixa e o botão. E a suíte do dossiê **deixava internação aberta** na criança que a da chamada usa: reprovava conforme a ordem do Jest |
| 177 | **as oito casas vivem um ano juntas** (pedido de 28/09): `SIM_CASAS=AI1,...,ARM4` no `simulacao-da-casa.sh`, com uma agenda que só anda o relógio quando todas as casas pediram a hora; ATA Geral toda manhã, Coordenação Geral lendo as oito, gestor no painel. **Nenhum achado** no ano, 27 contas no navegador sem nada; mais pesada, a equipe das oito (582 ms); ~140 MB de banco por ano para as oito. A Coordenação Geral não recebeu aviso nenhum no ano: pergunta no PARA-A-REUNIAO §4.15. Relatório em `docs/historico/oito-casas-um-ano-28-09.md` |
| 178 | **as quatro decisões de 28/09**: a Coordenação Geral recebe os GRAVES das oito (nível `coordenacao_geral`, 1635: ocorrência que exige revisão técnica, internação, ATA Geral com pendência); o Arquivo das ATAs abre nos **últimos 30 dias**; a dose fora do horário diz **as duas horas** (`rotuloForaDoHorario`), sem a palavra atraso; o **PIA avisa 30 dias antes**, por criança, uma vez (`app_pia_chegando`, `pia_aviso`, 1636) |
| 179 | **os defeitos da análise de 30/09**: **nenhuma foto de celular entrava no servidor de verdade** (corpo no padrão de 100 KB; agora 25 MB no módulo e 413 em português, com anexo de tamanho real na suíte); **o relógio não rodaria no servidor instalado** (o cron chamava `tsx`; agora `relogio:prod`, rodado pelo `ensaio:producao`); **o convite por SMTP** (`EMAIL_MODO=smtp`, STARTTLS exigido, provado contra servidor de captura); **CORS fechado, cabeçalhos e `TRUST_PROXY`** (§12.9); e a **correção de visita que não mostrava o que corrigia** |
| 180 | **o aviso de meia hora antes do fim do plantão** (decisão de 30/09: a pessoa e o líder): `fim-do-plantao:prod` de dez em dez minutos no cron; `app_plantao_terminando` (1637) marca o TURNO em `shift_fim_aviso` e devolve quem a escala diz que não assinou; cada um recebe o seu, o líder do turno um só com os nomes; nada guarda quem foi avisado |
| 181 | **as decisões 1, 2, 3 e 11 do §10** (30/09): **devolver o acompanhamento** com motivo (`followup_return`, 1638; a versão devolvida fica legível); a **ATA Geral do dia, linha por casa** (a política das linhas entregava as oito a qualquer coordenação com o id da folha; 1639); **"Concluí as atividades coletivas até agora"**, sem remédio, saúde, urgência nem o que espera ciência, com registro imutável (`activity_bulk`, 1640); a Enfermagem continua vendo a internação |

**Medido no fim da 181:** 181 migrações, 128 tabelas, 128 suítes, 1165 testes, verdes nas
DUAS condições de relógio; os sete ensaios de navegador verdes, com a portaria e o
portão, o armário, a cozinha, os temas e a foto no percurso do `ensaio:uso`; **438 telas (146 × três
temas) sem violação de WCAG 2.1 AA**; nenhuma
rota sem teste; nenhuma rota — escrita ou leitura — com 500; **250 leituras sondadas
pela Casa 04 com registro real da Casa 03, sem achado; cerca de 170 rotas de escrita, sem linha
da Casa 03 mudada**; nenhum ouvinte
falhando; nenhuma escrita da Casa 04 aceita sobre registro real da Casa 03. **E a casa de noventa
dias** (`scripts/simulacao-da-casa.sh 90`): tudo o que ela contou bate com o que o sistema
devolve, nenhum achado na API, e **12 contas, 179 telas contra o servidor de verdade, sem achado**.
**E o ano** (`simulacao-da-casa.sh 365`): tudo bate, nenhuma leitura acima de 174 ms, ~22 MB de
banco por casa por ano.
**E as oito casas num ano** (`SIM_CASAS=AI1,AI2,AI3,AI4,ARM1,ARM2,ARM3,ARM4 … 365`): nenhum
achado, 27 contas e todas as telas contra o servidor de verdade, nenhuma leitura acima de 582 ms.

**As TRÊS cores do sistema, porque confundi-las é o pior que esta tela pode
fazer** — está escrito por extenso em `frontend/src/cargos.tsx`:

**Os TEMAS são três** (claro, escuro, alto contraste — `frontend/src/tema.ts`). Cor
nova passa pelo `ensaio:acessibilidade`, que desde a 163 mede os TRÊS.

| A cor | Responde | Onde |
|---|---|---|
| **estado** | *isto ainda precisa de alguém?* | pílula clara, letra colorida |
| **autor** | *qual colega escreveu?* | borda da linha; a coordenação escolhe (0990) |
| **cargo** | *de que setor é esta pessoa?* | círculo cheio com iniciais |

### A próxima etapa

**FEITO — fases 179, 180 e 181** (§2): os defeitos da análise de 30/09, o aviso de
meia hora antes do fim do plantão e as decisões 1, 2, 3 e 11 do §10. **Não sobra
defeito de código conhecido, nem pedido de código que não dependa de alguém.** O que
depende: a decisão 5 do §10 (a grade para a parede, escolha da casa), a fila do
aparelho cifrada (DPO), o Drive de verdade (decisão), os marcadores de fralda e
mamadeira (a casa confirmar), o pente-fino semanal (o dia da semana, §10.5) e o
diário estruturado da internação (os campos).

**PRÓXIMA ETAPA:** aplicar o roteiro com a equipe e a implantação do §12 (onde roda,
endereço, certificado, SMTP, conta do relógio e as DUAS linhas do cron).

**0. FEITO — o "PROMPT MESTRE" de 25/09** (auditoria total, simulação e
expansão). **O fechamento está em `docs/historico/relatorio-final-da-auditoria-25-09.md`**:
os achados por gravidade e a matriz de funcionalidades, com o que NÃO foi testado. Ele DECIDE uma
regra que era hipótese: **ATA diurna 08:00–20:00, noturna 20:01–07:59, com a
data do dia em que o noturno começou** — substitui o 7h–19h preliminar (pendência
#4). As fases, na ordem, e o inventário que as justifica:
- ~~**157** regra nova da ATA~~ ✅ feita;
- ~~**158** alcance de LEITURA entre casas~~ ✅ feita;
- ~~**159** (fora do plano original, pedido de 26/09) horário dos turnos por casa~~ ✅ feita —
  **as fases abaixo andaram um número**;
- ~~**160** visitas e portaria~~ ✅ feita. **A regra da contagem MUDOU em 26/09:**
  era *"nenhuma contagem por criança"*, agora é **"nenhuma COMPARAÇÃO entre
  crianças"** — a contagem de uma criança existe só no perfil dela e nos
  relatórios filtrados por ela (vale para refeições e remédios na 161 e 162);
  nunca crianças lado a lado, nunca ordenadas por total. Visitantes por NOME.
- ~~**161** armário e nota fiscal~~ ✅ feita. A folha do Word ganhou `imagens`
  (tamanho lido do PNG/JPEG) — a 163 usa para a internação;
- ~~**162** cozinha e refeições~~ ✅ feita;
- ~~**163** (fora do plano, pedido de 27/09) temas, Portaria em cartões, coluna~~ ✅ feita —
  **as fases abaixo andaram um número**;
- ~~**164** (fora do plano, pedido de 27/09) a voz dos documentos~~ ✅ feita —
  **as fases abaixo andaram mais um número**. Todo documento novo destas
  fases (o DOCX da internação, sobretudo) nasce na voz da equipe;
- ~~**165** câmera/galeria com prévia, anexo inteiro e não repetido, DOCX da
  internação com as páginas dos PDFs, o mês como rascunho, o cargo da época~~ ✅
  feita. Decisões de 27/09: PDF desenhado no SERVIDOR; rascunho só para quem
  monta; cópia pelo mesmo dia da semana. **Aberto no §10, item 12:** a
  Enfermagem lê a internação mas não baixa o relatório (segui a lista do pedido);
- ~~**166** simulação de vários dias (§38) como teste, e o relatório final com a matriz~~ ✅
  feita (`um-ciclo-completo-da-casa.e2e.spec.ts`). Achou três defeitos (§2, linha 166).

**0.1 O que o pedido de 25/09 deixou para depois** (está na matriz do relatório):
o diário da internação com os campos do §12 um a um (hoje é texto por tipo,
e os campos e quais são obrigatórios são decisão da Fundação); ~~medir
desempenho com volume de anos (§41)~~ ✅ **167**; ~~e do §39, sessão expirada com
formulário aberto, várias abas, botão voltar, armazenamento cheio, virada de ano
e fevereiro~~ ✅ **168**. **O que sobra do pedido de 25/09 é o diário estruturado,
que depende da Fundação** (quais campos, quais obrigatórios): não há etapa de
código que não dependa de alguém. O que o §39 deixou de lado, dito para não
virar promessa: o voltar com uma folha aberta NÃO fecha a folha (escolha
conservadora minha, para não perder texto; a Fundação pode preferir que feche),
e duas abas no NAVEGADOR não têm ensaio próprio (a trava é do navegador; a
corrida no servidor tem teste). **Respondido em 27/09:** o voltar com folha aberta
continua sem fazer nada, e a Enfermagem baixa o relatório da internação (170).

**1. As medições de alcance estão feitas e são permanentes** — leitura (170) e
escrita (171) rodam por último em todo `npm test`, e as quatro superfícies da 169
têm suíte própria. **Não há mais etapa de código que não dependa de alguém.**

**2. Aplicar o roteiro com a equipe.** Continua sendo o que mais muda o sistema, e
o único que não se faz daqui.

**2.4 FEITO — fase 177** (pedido de 28/09): as oito casas viveram um ano juntas, e o
olhar do gestor, dos líderes e da Coordenação Geral está no relatório
`docs/historico/oito-casas-um-ano-28-09.md`. **Lição de ambiente:** o contêiner da
sessão é reciclado quando ela fica parada, e a simulação morre junto; rodada longa se
acompanha até o fim, sem encerrar a vez (a de oito casas leva ~45 min assim).

**2.45 FEITO — fases 178 e 181**: as quatro decisões de 28/09 e as de 30/09 (§2, linhas
178 e 181). **Do §10 só sobra a 5** (grade para a parede), que é escolha da casa. **Conferido contra o servidor
de verdade em 29/09** (oito casas, 30 dias, 27 contas no navegador): nenhum achado, e a
Coordenação Geral recebeu os 8 avisos de internação e nenhum de ocorrência comum.

**2.5 O que a fase 173 deixou como caminho** (está no relatório dela):
~~levar a simulação a várias casas vivendo juntas~~ ✅ **177**, e rodar a simulação e o ensaio contra o servidor a cada fase, como a
suíte. **A decisão 4 do §10** (o Arquivo das ATAs abre no mês de calendário e fica
vazio no dia 1º) é o mesmo defeito que a Fundação já decidiu para as visitas.

**3. A frente visual está feita**, inclusive os dois ajustes que eram escolha da
Fundação (172). O que vier de visual agora é pedido novo.

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
- **Instante não se compara com data** (162). `reference_at BETWEEN de AND ate`
  transforma `ate` em meia-noite do COMEÇO do dia, no fuso da sessão: o último
  dia do período sumia do relatório. Instante vira data antes —
  `(x AT TIME ZONE app_fuso())::date BETWEEN de AND ate` — e a pergunta de onde
  mais isso acontece vai ao catálogo (`pg_proc.prosrc`), não à memória.
- **Medir com `-t` mede o teste sozinho** (162). Se o dado nasce num teste
  anterior, o `-t` reprova nos dois sentidos e a medida não diz nada: meça com o
  arquivo inteiro.
- **O que o ensaio não liga, ele não mede** (163). O de acessibilidade abria o
  Chromium no tema claro e nunca trocava: o escuro existia desde a fase 50 e
  nunca tinha sido conferido. "Passou" vale para as condições em que rodou —
  pergunte sempre QUAIS foram.
- **O papel não é a tela** (164). O aviso da tela explica a regra para quem
  está usando; o documento vai para juiz, conselho e família, e ali a mesma
  frase soa como defesa. `ressalva: d.aviso` imprimiu *"quantidade de visitas
  não é avaliação da família"* num relatório. E a conferência de estilo achou
  um defeito de conteúdo: a escala impressa dizia 08:00–20:00 numa casa que
  tinha mudado o horário. **Reler o documento como quem o recebe acha o que o
  teste de quem o gera não acha.**
- **Data como texto não ordena** (165). `String(new Date())` não tem
  milissegundos: dois anexos no mesmo segundo saíam na ordem inversa no
  relatório, e o teste passava ou não conforme o relógio. Instante se compara
  pelo número (`getTime()`), nunca pelo texto.
- **A regra nova do turno vale para o DADO DE DEMONSTRAÇÃO também** (165). A
  157 mudou o diurno para 08:00, e o colírio do protótipo continuou às 07:30:
  virou dose da noite, e só a rodada da madrugada viu. Quando a regra muda,
  confira o dado fixo que ela classifica.
- **Regra escrita que o catálogo não cobra é conselho** (167). A regra 15 do §5
  mandava perguntar o alcance como conjunto desde a 0920; sessenta fases depois,
  quinze políticas a seguiam e 119 não, e as métricas do remédio levavam 15 s.
  Hoje o `alcance-como-conjunto.spec.ts` reprova política que chame
  `app_house_in_scope`/`app_person_in_scope`. **E o ensaio de carga mede o
  sistema do dia em que foi escrito**: era da fase 51 e não conhecia as trinta
  fases seguintes. Superfície nova entra no ensaio junto com a tela.
- **Teste que refaz a fórmula não testa a função** (168). O teste dos
  aniversários copiava o cálculo no SQL do próprio teste e perguntava em 2026:
  passava com a função errada, que derrubaria a tela de março a dezembro de
  2028. **Data difícil se testa pela função, com o dia de referência como
  parâmetro** (`app_aniversarios_em`), nunca pelo relógio de hoje. E a fila do
  aparelho: **dado local não tem dono se ninguém o escreve** — o registro
  guardado sem sinal subia com a identidade de quem estivesse entrado.
- **Sondagem feita à mão se perde com a sessão** (169). As da 156 e da 158
  acharam dez defeitos e não deixaram nada no repositório; a lista do que
  ficou sem dado sobreviveu, o instrumento não. A da 169 é suíte. E a classe
  da 158 (200 vazio para quem é de fora) tinha ficado nas portas que ela não
  olhou: **casa pela consulta e `POST`**.
- **Teste que cobra o defeito como se fosse o certo** (170). Nove suítes
  cobravam `expect(res.body).toEqual([])` para casa de fora, com o comentário
  *"o RLS filtra"*: o vazio que a 158 chamou de mentira estava escrito como
  regra. **Antes de corrigir o teste que reprova, pergunte o que ele quis dizer**
  — todos queriam "quem é de fora não vê", e a 404 diz isso melhor.
- **A prova de escrita é o banco, não o status** (171). Com corpo genérico, o
  400 por formato chega antes da pergunta de alcance e não diz nada; a
  fotografia das linhas da casa antes e depois de cada rota diz. E ela achou o
  que o status não acharia: o *"ok, nada alterado"* que saía antes da pergunta.
- **O protótipo aceita o que o servidor recusa** (173). Todo ensaio de navegador
  abria o `mock.ts`, e a tela dos Acompanhamentos, escrita olhando o mock, nunca
  funcionou no sistema de verdade: pedia a lista sem a casa e lia campos que o
  servidor não devolvia. **Tela nova se abre também contra o servidor**
  (`ensaio-servidor.mjs`, no fim da simulação). E `NULL` numa guarda
  `IF NOT app_house_in_scope(x)` passa: **pergunta de alcance sobre nada responde
  não**, e é a função que garante isso (1629).
- **Coluna `date` é texto, não instante** (173). O `pg` a devolvia como `Date` à
  meia-noite do fuso do processo, e `String(v).slice(0, 10)` virava *Sat Feb 13*:
  dois relatórios imprimiam *Invalid Date* em toda linha. O `DatabaseService`
  hoje devolve `AAAA-MM-DD`. **Relatório se lê baixado, como quem recebe** — foi
  a leitura do Word que achou, não o teste de quem gera.
- **O dado de teste do tamanho de um pixel esconde o limite** (179). Toda suíte e a
  simulação de um ano anexavam imagem mínima, e nenhuma foto de celular entrava no
  servidor de verdade: o corpo estava no padrão de 100 KB. **Anexo se testa do tamanho
  que ele tem na vida**, e o limite que o framework põe sem ninguém escrever também é
  regra do sistema. E a promessa da tela (*"o horário anterior fica no histórico"*) se
  confere lendo o histórico de volta: a varredura achou a coluna, a promessa achou a tabela.
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
  **Link público, sem login** (pedido de 28/09; o repositório é público):
  `https://raw.githack.com/kanaitzin/fundacao/<commit>/prototipo/rede-acolher-prototipo.html`,
  com o commit do protótipo que se quer mostrar. Fica preso àquela versão: a cada
  protótipo novo, manda-se o link com o commit novo. Há também uma cópia em
  `claude.ai/artifact/A5uBh6iCWJqAv9Ek2UbGAY`, republicada do mesmo arquivo, que só
  abre para quem o dono liberar em *Compartilhar* e onde baixar Word não funciona.
- **Para dar corda por outra conta do Claude:** nada mora na conta — está tudo no
  repositório, inclusive o `.claude/hooks/session-start.sh`. Na outra conta,
  conecte o GitHub, instale o app do Claude no `kanaitzin/fundacao`, abra a sessão
  no branch acima e escreva *"leia o `docs/REDE-ACOLHER.md` e siga o §9"*. **Empurre
  antes de trocar:** o contêiner é descartado com a sessão.
