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
- **O que o sistema ganha, o Guia do sistema explica na mesma fase** (pedido de 19/10,
  fase 231). Tela nova: o que a Acolhe+AI faz nela em `frontend/src/guia-do-sistema.ts`
  (`COM_A_ACOLHE`). Aba nova do perfil: `ABAS_DO_PERFIL_NO_GUIA`. **E toda fase fecha com a linha
  dela no alto de `NOVIDADES`**, escrita para quem usa. O `o-guia-do-sistema.spec.ts` reprova.
- **O que o sistema ganha, a Acolhe+AI aprende na mesma fase** (pedido de
  08/10, §5 item 11). Rota GET nova: catálogo do `assistente/guia.ts` ou
  `FORA_DO_CATALOGO` com o motivo. Tela nova: no guia pela chave. Ferramenta
  nova: `ferramentas.ts`, `acolhe.tsx` e guia. Botão novo que só abre um
  formulário de criação: `data-acolhe-abre`; que só entra num registro: `data-acolhe-entra`. O `a-acolhe-conhece-o-sistema.spec.ts`
  reprova o que faltar. E ela escreve como colega: sem travessão nem lista.
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

## Os subagentes (desde 08/11)

Moram em `.claude/agents/`, valem para qualquer conta, e nenhum faz commit nem push. Eles **gastam
mais** limite, não menos: o ganho é a conversa principal não se encher de log e de catálogo. Use:

| Quando | Chame |
|---|---|
| mudou migração, função SQL, política, gatilho ou SQL no TypeScript | `banco-de-dados` (o DBA, com memória em `.claude/agent-memory/`) |
| terminou uma mudança, antes de commitar | `guardiao-das-regras` (o diff contra o §5 e o §6) |
| mudou tela, texto de tela, folha, anexo, ditado ou cor | `ensaios-de-tela` (escolhe e roda o ensaio certo) |
| vai fechar fase | `verificador` (os `tsc`, a suíte nas duas condições, as varreduras), depois `fechador-de-fase` |
| tela ou funcionalidade nova para a Fundação | `revisor-de-cuidado` (a coordenadora e o psicólogo) |
| login, senha, cargo, anexo, IA, dado sensível, ou antes de uma versão | `auditor-seguranca-lgpd` |
| fim de bloco de fases, antes de reunião com a Fundação | `auditor-docs-vs-codigo` |
| colocar no ar, preparar a máquina, mexer no servidor | `implantacao` (passo a passo; nunca faz o deploy) |

O hook `.claude/hooks/jest-em-serie.sh` recusa o `jest` sem `--runInBand`, e o
`.github/workflows/suite.yml` roda os `tsc` e a suíte a cada push.

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
| `frontend/ensaio-celular.mjs` | **o sistema no celular** (fase 184): oito cargos a 360 e 390 px, todas as abas, o "Mais" e cada porta. Mede o que o axe não mede: tela que anda para o lado, texto cortado ou vazando do botão, **botões encostados**, alvo abaixo de 24 px, conteúdo atrás da barra do pé. Fotos em `/tmp/ensaio-celular`. O `ensaio:uso-celular` faz o percurso de uso como celular. **Mudou tela, roda os dois**, e desde a 272 também com `ENSAIO_LETRA=maior` (o mesmo vale para o `ensaio:cabe`) |
| `backend/src/modules/relogio/implantacao.regra.ts` | **a regra da saúde da implantação** (fase 185): quando cada sinal está em dia, em atenção ou parado, e a frase. Não importa nada, como o `alcance.ts`: o servidor e o protótipo leem a MESMA. **Quem roda sozinho anota** por `anotarImplantacao` (`kernel/implantacao/anotar.ts`) ou, nos scripts, por `app_anotar_implantacao` no `psql`; anotar nunca derruba quem anota |
| `scripts/arquivar-wal.sh`, `base-do-banco.sh`, `restaurar-ponto-no-tempo.sh`, `copiar-arquivos.sh` | **nada se perde no servidor do Pão** (fase 220): o arquivo contínuo do banco, a base semanal conferida, a volta a qualquer minuto e a cópia das fotos; o `postgresql-do-servidor.conf` liga o arquivo. **Mudou um deles, roda o `npm run ensaio:ponto-no-tempo`**, que prova os quatro num banco à parte |
| `frontend/ensaio-cabe-e-volta.mjs` | **cabe, rola e volta** (fase 255): cada cargo, a 390 px e no monitor, em cada tela, aba, folha de criar (`data-acolhe-abre`), entrada (`data-acolhe-entra`, o cartão da criança, a primeira linha de cada lista) e botão de abrir, até três níveis; mede vazamento, conteúdo preso sem rolagem e o fim da folha, e **aperta a volta e confere que voltou**. `ENSAIO_CARGOS`, `ENSAIO_LARGURAS`, `ENSAIO_PROFUNDIDADE`. Leva uns dez minutos por cargo e largura. **Folha ou subtela nova nasce com a volta dela**: Fechar, Cancelar, Voltar ou ← |
| `frontend/ensaio-vazio.mjs` | **o vazio que mente** (fase 260): alonga a pausa do protótipo (`__pausaDoPrototipo`), abre cada aba e porta de cada cargo e reprova a frase de vazio ou o zero que a tela mostrou antes de o dado chegar e que sumiu depois; desde a 261, também as abas de dentro e o perfil com as abas dele. **Lista nova nasce com o `carregou`** |
| `frontend/ensaio-aparelhos.mjs` | **o que o aparelho faz de diferente** (fase 222): oito aparelhos simulados, a câmera do tamanho de cada um (vídeo Y4M gerado), o reconhecimento de voz como o Safari do iPhone e o Chrome do Android, as falhas do microfone, a galeria de 12 e 50 MP e HEIC, e todo formulário de folha rolado até o fim. `ENSAIO_APARELHOS="iPhone SE"` mede um; `=extras`, o resto. **Mexeu em ditado, câmera, anexo ou folha, roda este.** Não prova o Safari de verdade nem a voz de verdade (PARA-A-REUNIAO §4.27) |
| `scripts/rotas-sem-teste.mjs` | acha **rota** que nenhum teste chamou — o outro lado da mesma pergunta. Separa *candidata forte* (a URL não aparece em suíte nenhuma) de *par incerto* (a suíte chama por auxiliar e o método fica noutra linha). **Não é teste** |
| `backend/src/kernel/common/data-do-dia.pipe.ts` | **toda data que vem da URL passa por aqui** (fase 148). Sete de dez rotas de data devolviam 500 para uma data que não é data; a conferência mora num lugar só, e há teste estático que cobra que todo `@Query('de')` e `@Param('data')` use o pipe |
| `backend/src/kernel/audit/audit.service.ts` | quem ESCREVE a auditoria, e as três respostas sobre a casa de uma linha (fase 149). **Linha de auditoria sem casa é linha que a coordenação da casa não lê** — a policy compara `house_id` com o alcance, e NULL não é igual a nada. O `auditoria-tem-casa.spec.ts` cobra `houseId` em toda chamada, com a lista ESCRITA das poucas ações que não têm casa |
| `frontend/src/portas.ts` | **as vinte e cinco telas do sistema, numa lista só** (fase 150). A folha "Mais" do celular, a coluna do monitor e a conferência leem dela. A lista existia em DOIS lugares e as duas discordavam — `as-portas-e-os-icones.spec.ts` é o que impede a divergência voltar |
| `frontend/src/icones.tsx` | **os desenhos da moldura**, em traço e `currentColor`, no lugar dos emoji (fase 150). Emoji muda de cara conforme o aparelho, não herda a cor e carrega significado que ninguém pediu. Nenhum ícone é o único portador do sentido: ao lado há sempre a palavra |
| `frontend/src/anexos.tsx` | **o `EscolherAnexo`** (fase 165): câmera, galeria, arquivo, com prévia, ampliar, descartar e tirar outra. Todo lugar que recebe foto ou documento usa este, e não um `<input type="file">` solto, e desde a 194 **o `todo-anexo-pela-camera.spec.ts` cobra**. **E o `lerArquivo` daqui é a única leitura de arquivo** (fase 175): é ele que reduz a foto antes de enviar, e leitura por conta própria manda a foto do tamanho da câmera |
| `frontend/src/botao-que-grava.ts` | **o botão que grava** (fase 265): toda escrita do `api()` segura o botão tocado até a resposta (nada de linha repetida com a rede lenta) e o faz dizer *Registrado às 23:04*; a frase pelo verbo mora em `botao-que-grava.regra.ts`. **Escrita nova vai pelo `api()`**, e o `o-botao-que-grava.spec.ts` cobra |
| `backend/src/kernel/arquivos/anexos-da-mensagem.regra.ts` | **os anexos de uma mensagem** (fase 233): dez por mensagem e 15 MB por envio, na linha da ATA, no diário da internação, na ocorrência, no atendimento técnico e na Acolhe+AI. O servidor recusa e a tela avisa lendo a MESMA regra; na tela, o `AnexosDaMensagem` (`anexos.tsx`) com Ver e Tirar, e a câmera em sequência (`varias` no `camera.tsx`) |
| `backend/test/o-que-entra-volta-inteiro.e2e.spec.ts` | **todo Word abre e todo anexo volta** (fase 233): as exportações conferidas contra os controladores (negando por padrão), cada Word aberto e cobrado (XML, imagens, texto sem lixo, entrelinha com tipo), e cada porta de anexo devolvendo o arquivo byte por byte e conferido no disco. `DOCUMENTOS_DIR=pasta` grava os Words para abrir no LibreOffice |
| `frontend/src/ocr.ts` | **a leitura do texto do papel no aparelho** (fase 234): Tesseract com o português embutido, importado só no toque; o trabalhador numa peça só, com o `fetch` que recusa tudo o que não é o português. Quem usa é o `LerTextoDoPapel` (`anexos.tsx`), que sempre deixa a pessoa conferir e corrigir. No servidor, o texto conferido em `document_text` |
| `backend/src/modules/people/campos-do-papel.regra.ts` | **o cadastro pelo papel conferido** (fase 235): o que a certidão, o RG e o cartão SUS sugerem, com o trecho; a tela e o teste leem a mesma regra |
| `frontend/src/camera.tsx` | **a câmera do sistema** (fase 194): visor ao vivo, X e ✓ de cada foto, girar, trocar de câmera, e o **modo Documento** (página por página, realce, e Concluir num PDF A4 por `backend/src/kernel/documentos/pdf-de-imagens.ts`, sem biblioteca). Quem a abre é o `EscolherAnexo`. E o `CameraNesteAparelho` da Minha conta. **Não acha a borda do papel**: a moldura guia |
| `backend/src/kernel/documentos/paginas-do-pdf.ts` | **as páginas de um PDF como imagem** (fase 165), num processo à parte (`desenhar-paginas.mjs`, nome diferente de propósito: com o mesmo nome o Jest importava o `.mjs`). Nunca lança: PDF que não desenha volta marcado, e o documento sai assim mesmo. **A tela de desenho vem da cópia do `@napi-rs/canvas` que o pdf.js traz** (fase 194): com a outra, todo PDF com foto dentro derrubava o processo |
| `scripts/simulacao-da-casa.sh` | **uma casa nasce e vive noventa dias** (fase 173), **ou as oito vivem juntas** com `SIM_CASAS` (fase 177): a ARM1 do primeiro acesso a fevereiro, com o relógio andando (`faketime` lendo um arquivo que a simulação reescreve), os relatórios conferidos contra o que ela contou, e no fim o **`frontend/ensaio-servidor.mjs`**, que abre as telas no navegador **contra o servidor de verdade**. Depois dele, o **`frontend/ensaio-acolhe-modelo.mjs`** (fase 224): o servidor sobe de novo com a chave apontando para um modelo de mentira local, e a Acolhe+AI conversa inteira. Recria o banco: não roda junto com a suíte. `SIM_SO_NAVEGADOR=1` repete só o navegador. **`SIM_DUMP=arquivo` guarda o banco no fim** (fase 227): é o banco de demonstração do treino, com `SIM_INICIO` seis meses atrás para a história terminar hoje |
| `backend/src/kernel/common/porta-da-internet.ts` | **CORS, cabeçalhos de segurança e `TRUST_PROXY`** (fase 179), ligados pelo `AppModule`. CORS vazio é FECHADO: a tela está no mesmo endereço |
| `backend/src/kernel/common/corpo-da-requisicao.ts` | **o limite do corpo, 25 MB** (fase 179): o anexo vai em base64 e o padrão de 100 KB recusava toda foto de celular. Mora no módulo para a suíte ver |
| `frontend/src/mock.ts`, `mock-casa.ts`, `casas-ficticias.ts` | **o protótipo com as oito casas** (fase 225): o `mock-casa.ts` é o servidor de mentira de UMA casa (a fábrica `criarServidorDaCasa`), o `mock.ts` cria uma cópia por casa e escolhe a casa de cada pedido, e o `casas-ficticias.ts` diz as casas, as pessoas e a troca de nomes. **Dado novo do protótipo entra no `mock-casa.ts`**, e vale nas oito; o que soma casas (painéis do gestor, dia das unidades, quem conquistou) é montado no `mock.ts`, pedindo a cada cópia **sem** a troca de nomes. Os seis meses de história nascem no `escreverSeisMeses` (fase 226). Os testes estáticos leem o `mock-casa.ts` |
| `scripts/instalar.sh`, `scripts/servidor/` | **a instalação no servidor do Pão** (fase 227): o instalador confere sem mudar nada (`--instalar` constrói e migra), o serviço do systemd e o Caddyfile. O caminho inteiro está no §12.0; o `o-servidor-do-pao.spec.ts` cobra os três |
| `frontend/src/guia-do-sistema.ts` | **o Guia do sistema** (fase 231), o primeiro item do menu (`screens/Guia.tsx`): o que cada tela é vem do `GUIA_DA_ACOLHE`, o que cada cargo faz vem do `alcance.ts`, e aqui moram o que a Acolhe+AI faz em cada tela, as abas do perfil e as **Novidades**, que ganham uma linha a cada fase |
| `frontend/src/acolhe.tsx` | **a Acolhe+AI** (fase 192), em todas as telas. **A tela executa as ferramentas** que o modelo pede: leitura só GET e só do catálogo (`backend/src/modules/assistente/ferramentas.ts`, lido pelos dois lados), navegação só às telas do cargo, e proposta que vira cartão. O servidor (`assistente.service.ts`) só repassa ao Claude, com o guia e as regras em `guia.ts`. **Sem a chave, o `acolhe-guia.ts` responde.** Ferramenta nova: escreva no `ferramentas.ts`, execute no `acolhe.tsx`, e ponha no teste e no guia |
| `frontend/src/acolhe-tela.ts` | **as mãos da Acolhe+AI na tela** (fase 193): lê os campos e botões da folha aberta, escreve à vista e marca o que escreveu. **Nunca salva**: só aperta botão com `data-acolhe-abre`, `data-acolhe-entra` (fase 196) ou aba, porque o nome do botão não diz se ele grava; senha e arquivo nem aparecem. Quem pede a licença é o `acolhe.tsx`, uma vez por conversa |
| `frontend/src/ditado.tsx` | **o ditado** (fase 195): o microfone junto de todo campo de texto longo (`DitadoNosCampos`, uma vez só no `App.tsx`), e o `iniciarDitado` longo que a Acolhe+AI e o rascunho usam. Pausa não corta; o primeiro uso mostra o aviso do áudio (no Chrome vai ao Google). Campo que não deve ter ditado ganha `data-sem-ditado` |
| `frontend/ensaio-acolhe.mjs` | **a cobertura da Acolhe+AI, medida** (fase 195): cada cargo pede cada tela por texto e por voz (microfone falso), a explicação e cada formulário de criação da tela; e o relatório pela voz de ponta a ponta. `ENSAIO_CARGOS=portaria` mede só um. **Tela ou formulário novo entra na medição sozinho**: o ensaio lê o menu e as marcas `data-acolhe-abre` e `data-acolhe-entra`, as abas, o perfil (do Bruno e do Felipe), o dossiê e a internação (fase 196) |
| `frontend/src/aviso-no-celular.tsx` | **o aviso no celular** (fase 189), na folha Minha conta: liga e desliga NESTE aparelho; o `desligarAoSair` é chamado pelo Sair. O que o aparelho mostra mora em `public/sw-avisos.js`, e o que o servidor manda, em `textoDoAviso` (`notifications/aviso-no-celular.service.ts`): **só o título neutro, nunca o aviso** |
| `frontend/src/avatar.tsx` | **o rosto nas listas** (fase 198): a foto quando a lista diz `temFoto`, as iniciais quando não, num cache em memória (nunca no aparelho). As rotas vão escritas por extenso (`{ acolhido }` ou `{ contato }`): o contrato de rotas confere. No protótipo, os retratos são desenhos de `retratos.ts`, nunca rosto realista. Lista que não diz `temFoto` usa o `useComFoto(casa)` (fase 199), que pergunta uma vez à lista da casa |
| `frontend/src/calendario-turnos.tsx` | **o calendário das ATAs** (fase 206), na Passagem e no Arquivo: lê o recorte do mês do `/shifts/ata-archive`, e as cores são as de ESTADO da pílula da ATA. Os números do mês são da casa, nunca de pessoa |
| `frontend/ensaio-o-que-cada-setor-ve.mjs` | **o que cada setor vê** (fase 246): uma conta de cada cargo, contra o servidor de verdade, aperta cada botão de cada tela e anota o que o servidor recusa; o inventário sai em `inventario.md`. Chamado pela simulação com `SIM_SETORES=1`, por último, porque grava. **Botão que a tela mostra e o servidor recusa é achado** |
| `backend/src/kernel/common/o-gestor-so-le.guard.ts` | **o Gestor Geral lê a casa** (fase 246): `@OGestorSoLe()` na porta de cada rota de escrita da ATA, do Dia, da internação, da Cozinha, dos combinados, da rotina e da escala; o `o-gestor-so-le.spec.ts` cobra, negando por padrão |
| `frontend/src/cargos.tsx` | **a cor de cada cargo e o círculo de iniciais** (fase 151). Ela convive com DUAS outras: a cor de ESTADO (crítico/atenção — não se toca, e o cargo não usa a família dela) e a cor de AUTOR (`tomDoAutor`, qual colega escreveu — a coordenação escolhe, 0990). Três perguntas diferentes; o dia em que duas responderem à mesma, a cor deixa de informar |

## O que fazer agora

> **Esta seção é o estado da corda.** Ela é reescrita ao fim de cada fase — feito,
> falta, próxima etapa — porque é o que sobrevive à compactação da sessão. Se ela
> discordar do §9 do documento, **o §9 manda**, e quem notar conserta esta aqui.

### PRIMEIRO: a análise geral de 08/11 (sem fase), e o que ela pede antes de tudo

Feita numa conta nova, a pedido do dono do projeto, a partir do código e do catálogo do banco: o
relato inteiro, com arquivo e linha, está em **`docs/historico/analise-geral-08-11.md`**. Leia as
seções 4 e 7 dele antes de propor qualquer trabalho. **Medido em 08/11:** os dois `tsc` sem erro e a
suíte inteira verde nas DUAS condições de relógio (1481 de 1481 nas duas; as fases 281 a 287
tinham fechado sem o relógio adiantado).

**As quatro decisões do dono, respondidas em 08/11** (não pergunte de novo):
1. **O repositório fica público até o 1.0** (A1). Volta à pauta antes do primeiro dado real.
2. **Este arquivo fica como está** (P1): nada de enxugar.
3. **O tronco passa a ser o `main`** (P3). **A sessão do Claude não consegue criá-lo**: o proxy
   desta sessão só deixa empurrar para branches `claude/...` (o push do `main` e da tag voltou
   403, negação por política; não se contorna). **Quem faz é o dono, no GitHub:** criar o `main` a
   partir deste branch (página *Branches → New branch*), torná-lo o padrão (*Settings → General →
   Default branch*), conferir em *Settings → Environments → github-pages* que o `main` pode
   publicar, e apagar o `fase-127-quem-a-chamada-cobra`, que está superado (a 127 fechou em 21/09,
   commit `24eed49`, com uma versão mais nova da 1350; o commit solto é o `5b099f3`). O `master`
   está inteiro dentro deste branch e pode sair também. **Até lá, o trabalho segue neste branch**;
   o `suite.yml` e o `prototipo-no-ar.yml` já olham o `main` e este.
4. **Não congelar** (P5): pedido novo continua entrando como fase.

**Os consertos antes do primeiro dado real** (cada um com o `banco-de-dados` e o
`auditor-seguranca-lgpd` revisando, e com teste que reprova sem o conserto):
- ~~**A2** o `rede_app` escreve `role` e `todas_as_casas` na própria linha de `app_user`~~ ✅ **288**
  (identity/1679), o vínculo de casa, que a revisão do banco achou com o mesmo defeito (1680), e as funções da
  Equipe, que o auditor achou abertas para a própria conta e para a conta de quem atende todas as casas (1681 e
  1682, com o vínculo, o nome e o `editavel` da lista); e a criação, decidida pelo dono em 08/11: conta que
  alcança as oito casas só nasce pelo Gestor Geral ou pela Coordenação Geral ✅ **289** (1683).
  Sobra dele, para o A4: o `rede_app` ainda LÊ o `password_hash` (a entrada
  confere a senha pelo servidor; tirar a leitura pede a conferência numa função do banco);
- **A3** o backup lógico volta sem GRANT (provado: *permission denied* como `rede_app`) e o ensaio
  confere como dono;
- **A4** senha gerada com `Math.random` em 63 mil combinações, mínimo de 6, troca do primeiro
  acesso só sugerida pela tela, trava só por e-mail; **e o que a revisão de segurança da 288 acrescentou**
  (a análise, no fim do A4): a `auth_find_user` devolve o hash de qualquer e-mail, a `auth_criar_sessao` aceita
  qualquer usuário, o scrypt não se confere no banco, o e-mail com conta se descobre pelo primeiro acesso;
  **e o que a da 289 acrescentou:** o e-mail que a casa digitou continua o da conta promovida para as oito
  casas, e o esqueci minha senha e o convite vão a ele (o Gestor Geral confirmar o e-mail na promoção, e o
  esqueci recusado até lá, pede decisão); a conta que muda de casa leva a senha que a casa de antes sabia; e o
  `app_update_staff` ainda abre vínculo de casa para conta de todas as casas quando a rota recebe a casa;
- **M2** EXIF e GPS das fotos; **M3** o Node em todas as interfaces e a tela sem CSP e HSTS no
  Caddy; **M4** o sigilo de saúde sem segunda camada no banco; **M5** dezoito políticas de escrita
  que não conferem a casa (candidatas).
- **Para a pauta** (já anotado no PARA-A-REUNIAO §0): os documentos discordam sobre onde o sistema
  roda e sobre qual IA (M7); o ditado nas caixas restritas (M1) e o prazo de guarda (M6) são do DPO.

**A ordem proposta** (seção 7 da análise): os consertos A2 (feito, 288 e 289), A3, A4, M2 a M5, uma fase cada; a
pauta arrumada para o Marcelo; e a setinha de trocar de casa e o 1.0, com o `implantacao`.
**Se o dono preferir outra ordem, vale a dele**, e este bloco se reescreve.

### Onde estamos — 08/11/2026, fase 289

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
| 182 | **a tela em outras cores** (pedido pedagógico de 30/09): temas **Rosa, Azul claro, Verde e Colorido**, claros e com letra escura, que mudam fundo, moldura e marca e NUNCA as cores de estado, autor e cargo; o botão abre a folha **"Cor da tela"**; e o **escuro do sistema pintava por cima de qualquer tema novo** (agora só vale sem tema escolhido). Ideias para a Fundação escolher no §9, *As ideias de 30/09* |
| 183 | **a letra maior, o escuro à noite e a busca de criança** (ideias 3, 4 e 5 de 30/09): tamanho da letra por `zoom` guardado no aparelho, sem vazar a 360 px; escuro das 20h às 8h por cima da cor escolhida (`pintar()` em `tema.ts`); busca no topo, só na casa aberta, que abre o perfil; e o defeito que o ensaio achou na hora (voltar aos Acolhidos reabria a criança buscada) |
| 184 | **o sistema no celular, setor por setor** (pedido de 05/10): `ensaio:celular` (oito cargos, 360 e 390 px, 300 telas, mede o que o dedo sente) e `ensaio:uso-celular`; abas de baixo cortadas, botões encostados em quatro telas, abas internas vazando, Cozinha com abas de 21 px e a portaria com um *Mais* sozinho, consertados; e as duas escolhas de 05/10: **a barra das abas no pé, sempre à vista**, e **o topo numa linha**, com nome, cor, senha e Sair na folha **Minha conta** (só abaixo de 1080 px) |
| 185 | **a saúde da implantação** (ideia 9; quem vê decidido em 05/10: Gestor Geral e Coordenação Geral): relógio, aviso de meia hora, e-mail, `backup.sh` e `restaurar.sh --ensaio` anotam em `implantacao_evento` (relogio/1641, só metadado, imutável); a tela mostra seis sinais *em dia/atenção/parado* com a regra em `implantacao.regra.ts`, lida pelo servidor e pelo protótipo. A *conta técnica* da pergunta está aposentada desde 01/09 |
| 186 | **o que mudou desde o meu último plantão** (ideia 1; o que entra decidido em 05/10: ocorrências, ATA anterior, remédio novo/suspenso/mudado): cartão no alto do Dia, lido com a identidade de quem pergunta (`reports/o-que-mudou.service.ts`), desde o fim do último turno da pessoa na escala (sem escala, 24 h; no máximo sete dias); o "já li" é por PESSOA, porque o tablet é da casa; e a prescrição passou a guardar quando foi suspensa (medications/1642) |
| 187 | **as duas etapas para entrar** (ideia 8): feitas e, no mesmo dia, **retiradas por completo a pedido da Fundação** na 188; o código está no commit `5bff891` se um dia voltar |
| 188 | **a entrada com e-mail e senha numa tela só, vazia, com os atalhos de demonstração embaixo, e o esqueci minha senha** (pedido e decisões de 05/10): o link vai ao e-mail CADASTRADO, vale uma hora e serve uma vez, pelo mesmo caminho do convite (`user_invite.motivo`, identity/1644); resposta igual para e-mail cadastrado ou inventado, pedir não troca a senha, um pedido a cada dois minutos, e a senha nova encerra as sessões; e sair pela Minha conta não fechava a folha |
| 189 | **o aviso no celular, mesmo com o sistema fechado** (ideia 2; decidido em 06/10: TODOS os avisos, tela bloqueada só com o título neutro): Web Push com VAPID (`web-push`), ligado por aparelho na Minha conta (`frontend/src/aviso-no-celular.tsx`, `public/sw-avisos.js`); de dez em dez segundos o servidor reserva e manda (`aviso-no-celular.service.ts`, notifications/1645); um aparelho, uma pessoa; sair desliga; só serviços de push conhecidos; desligado sem as chaves (§12.11). **Entrega num celular de verdade não testada daqui** |
| 190 | **o aviso no celular que não saiu tenta de novo** (reserva parada e falha passageira, até cinco vezes; notifications/1646) e **o que a 189 nunca gravou** (o instante voltava do JavaScript sem microssegundos); e **a simulação de 30 dias contra o servidor de verdade**, com a Minha conta no celular e o esqueci no `ensaio-servidor`, achou três: **o servidor não subia pelo `tsx` desde a 179** (`@Inject` faltando no `AppModule`; hoje `toda-injecao-e-explicita.spec.ts`), **o link do esqueci caía na entrada no desenvolvimento** (efeito colateral no inicializador do `useState`, rodado duas vezes pelo `StrictMode`) e **o cartão do que mudou pedia ao gestor o que o servidor recusa** (lista única em `reports/o-que-mudou.regra.ts`) |
| 191 | **a receita e a vacinação avisam antes de vencer** (decisões de 08/10: 10 e 15 dias, à Enfermagem e à técnica e coordenação, uma vez por documento, o último de validade mais longa; sem o remédio nem a vacina no aviso; `app_documentos_vencendo`, `document_due_notice`, people/1647, oitava rotina do relógio) e **o aviso fora do sistema também no computador**, na folha da senha (*Aviso neste computador*). Decidido sem código: o convite segue 24 horas, e o aviso no celular não entra no painel da implantação |
| 192 | **a Acolhe+AI** (pedido e decisões de 08/10: nome, IA aprovada pela Fundação, a pessoa confirma, sugestões para coordenações, CG, gestor e TI): assistente em todas as telas com a equipe virtual; **age com o acesso de quem conversa, por construção** (o servidor só repassa ao Claude; a TELA executa as leituras pelas rotas de sempre, `assistente/ferramentas.ts`); propõe e nunca grava; links e navegação; anexos; voz; sugestões (`assistant_suggestion`, assistente/1648, tela *Sugestões de melhoria*); modo guia sem a chave e no protótipo (`acolhe-guia.ts`). O "poder total" pedido virou o acesso de quem fala (regra 5). **Modelo de verdade não testado daqui** (§12.12) |
| 193 | **a Acolhe+AI sempre em dia** (pedido de 08/10): a regra de toda fase ensinar a assistente virou teste que nega por padrão (`a-acolhe-conhece-o-sistema.spec.ts`; catálogo de 34 para 131 rotas, 14 fora com motivo); **escreve como colega** (`humanizar`); **mexe na tela com licença** (`acolhe-tela.ts`: abre o formulário, escreve à vista, nunca salva, só aperta `data-acolhe-abre` ou aba); **conta exata e tabela com planilha** (`calculo.ts`, auditada). O `ensaio:uso` com roteiro de modelo achou **a faixa por baixo da folha aberta** |
| 194 | **a câmera do sistema e o documento em PDF** (pedido de 10/10): visor ao vivo com X e ✓, modo Documento que junta as páginas num PDF A4 (`camera.tsx`, `pdf-de-imagens.ts`), em **todo** anexo (nove telas tinham seletor solto; `todo-anexo-pela-camera.spec.ts`), a câmera na Minha conta e na Acolhe+AI; e o defeito antigo: **o servidor não desenhava PDF com foto dentro** (duas cópias nativas do canvas), e o relatório da internação perdia os papéis do hospital; e a simulação achou **a API morrendo quando o banco encerra as conexões** (`DatabaseService` ouve o erro; `o-banco-que-reinicia.e2e.spec.ts`) |
| 195 | **o relatório pela voz** (pedido de 10/10): ditado em todo campo de texto longo (`ditado.tsx`), a Acolhe+AI ouvindo ditado longo, e o **rascunho** (`mostrar_rascunho`) que a pessoa edita, aprova, completa falando, ilustra com foto e leva à tela, com o resumo do que foi escrito; e **a cobertura medida** (`ensaio:acolhe`): todas as telas de todos os cargos por texto e por voz, explicadas, 84 formulários de 84. A primeira rodada achou cinco lacunas do guia (consertadas) |
| 196 | **a Acolhe+AI dentro do perfil da criança e de toda subtela** (o *100 por cento* de 10/10): o guia acha a criança nomeada (`criancasNoPedido`) e abre o perfil e o formulário dele; passa por entrada (marca nova `data-acolhe-entra`: dossiê, acervo, cartão da internação e do plantão) e por aba, olha aba por aba e registro por registro quando o nome não casa, e desempata o botão repetido pela linha. **Os 36 formulários marcados, todos abertos pela Acolhe+AI pelo caminho inteiro**, nos nove cargos. E o **símbolo da Acolhe+AI é o do logo da Fundação** (`SimboloDaAcolhe`, pedido de 11/10) |
| 197 | **as cores do Rio Grande do Sul** (pedido de 11/10): o oitavo tema, verde, vermelho e amarelo da bandeira na moldura, no fundo e na navegação, com o verde na marca; a primeira medida achou a pílula de marca com 4,47 de contraste (o verde escureceu para 5,37), e o ensaio de acessibilidade mede os oito |
| 198 | **o visual repensado** (pedido de 11/10: *"olhe como um designer"*): retratos ilustrados fictícios no protótipo (`retratos.ts`), o rosto nas listas (`avatar.tsx`, `temFoto` na lista e nas visitas), o perfil com retrato, a coluna lateral mais leve e a linha do dia com trilho e o traço do agora; o `ensaio:celular` achou a pílula longa empurrando a tela a 360 px (consertado) |
| 199 | **a Saúde e as Ocorrências no mesmo desenho** (pedido de 11/10): a dose em cartão com a hora e o **rosto da criança** (a grade diz `temFoto`), o rosto também na triagem, nos esquemas e no resumo (`useComFoto`, sem rota nova); a ocorrência com o dia em bloco e **o caminho das quatro etapas**, e **sem rosto, de propósito** (a lista não diz quem está envolvido) |
| 200 | **a Equipe e o Painel das unidades no mesmo desenho** (pedido de 11/10): a Equipe em cartões de pessoa com o círculo do cargo (a tabela **cortava os botões na borda** e punha o *você* **por cima do e-mail**); o Painel em grade de casas, na ordem do código, com a ocupação contra o próprio limite e as contas em blocos |
| 201 | **a Acolhe+AI como colega de plantão** (pedido de 11/10): fazendo o papel de cada setor, 59 pedidos e uns 20 bem atendidos; **"o Kauã fugiu" e "a Lara tá com febre" recebiam "não achei essa tela"**. Agora o cuidado vem antes da tela (`primeiroOCuidado`), os limites da Fundação vêm com o porquê, e quatro defeitos de lógica do guia consertados; a frase de urgência é para a Fundação conferir (PARA-A-REUNIAO §4.17) |
| 202 | **o perfil do acolhido revisto** (pedido de 11/10): **a alergia ao amendoim da Alice estava a 5.185 px do topo**, embaixo de doze blocos que entraram ao longo das fases; voltou para logo depois do nome, com cuidados e remédio de hoje. E os **próximos compromissos** da criança, que a agenda guardava e o perfil nunca lia, e um índice no alto. As ocorrências no perfil ficam para a Fundação (PARA-A-REUNIAO §4.18) |
| 203 | **a Acolhe+AI só promete o formulário depois de abri-lo** (pedido de 12/10): na portaria ela dizia *"vou abrir o formulário"* e logo *"não achei"*; agora diz *"Abrindo"* e a frase do formulário vem só quando ele abriu, com teste |
| 204 | **cada setor de ponta a ponta** (pedido de 12/10): catorze percursos levando um registro de um setor aos outros; no protótipo, **a alergia registrada não chegava** à Saúde, à Enfermagem nem à Cozinha, **os plantões eram fixos e de antes de 25/09** (de madrugada, o diurno de amanhã já assinado), a ATA aberta não deixava escrever linha, a dose não baixava o armário e tocar em Acolhidos não voltava à lista; no sistema de verdade, **o remédio vencido dizia Validade próxima** |
| 205 | **a Acolhe+AI em cada setor e as oito casas com vinte pessoas por seis meses** (pedidos de 12/10): dezenove pedidos do plantão recebiam *não achei* (o choro, o homem no portão dizendo ser o pai, a mãe ao telefone, o colega que faltou); a vacina abria o Registrar compra, e o rascunho da ATA ia ao formulário de episódio; na simulação (`SIM_EQUIPE=20`), nada do sistema em seis meses, as 2.904 linhas pela Acolhe+AI no banco com o nome de quem registrou, e **a equipe das oito e o dia das unidades, que passavam de um segundo** (1649 e as casas de quatro em quatro) |
| 206 | **o calendário das ATAs e dos plantões** (pedido de 12/10): na Passagem e no Arquivo da ATA, o mês em grade com a manhã e a noite pintadas pela situação, os números do mês (só da casa) e o turno que abre o plantão e a ATA, para ler e baixar (`frontend/src/calendario-turnos.tsx`, sem rota nova); meses de histórias fictícias no protótipo; e **a ATA aberta pelo Arquivo mostrava o texto da ATA de antes**, no sistema de verdade também |
| 207 | **a saída das crianças pelo portão** (pedido de 12/10): quem decide é a equipe da casa (educador, líder, técnica, coordenação; people/1650); a Portaria ganha a aba *Saídas das crianças*, com o que vale, quem decidiu e desde quando, **sem o motivo**, e registra saída e volta (`child_outing`); sem decisão, só sai com acompanhante. A auditoria da saída pela portaria nascia **sem casa** |
| 208 | **o perfil em abas coloridas** (pedido de 12/10): o que protege a criança no alto, e oito abas (Hoje, Família e visitas, Saúde, Educação, Judiciário, Vida na casa, Atendimentos dia por dia, Cadastro); a cor da aba nunca vira pílula; a Acolhe+AI escolhe a aba pelo assunto; o `ensaio:uso` percorre as abas |
| 209 | **quem aparece na foto, e a foto pequena** (pedido de 12/10): o reconhecimento de rosto **não entrou** (biométrico de criança, DPO); a equipe marca quem aparece e a foto entra no álbum de cada criança marcada (`memory_photo_person`, people/1651), desmarcar com motivo; a miniatura feita no aparelho para a lista do álbum, a inteira no toque; estimativa de 22 GB em dez anos para as oito casas (§12.2) |
| 210 | **o dia, em ordem, com cor e mais curto** (pedido de 12/10): uma linha por evento com a cor e o desenho da categoria (`categorias-do-dia.ts`, as mesmas do Dia), *da casa toda* ou o nome da criança, legenda em cima, o dia em quatro partes e *Só o que ainda precisa de alguém* |
| 211 | **as chamadas da casa** (pedido de 12/10): nome, horário, quantas pessoas e uma cor de 48 (`frontend/src/cores-da-casa.ts`), um toque abre a chamada; coordenação, técnica e Líder Diurno definem; mudar encerra e abre outra (`house_check_model`, checks/1652); a cor só na barra e no ponto |
| 212 | **as telas falam como colega** (pedido de 12/10): medido pelo texto que a tela mostra, 137 frases com marca de raciocínio reescritas (telas, servidor, protótipo e a página do alcance); sobram só separadores de dado; o `ensaio:celular` passa a reprovar a frase de raciocínio |
| 213 | **a casa aberta, dita**: a simulação contra o servidor (a primeira desde a 205) conferiu as chamadas da casa no banco e achou que **quem não tem casa de trabalho** (noturno, Enfermagem, gestor, CG) abria a primeira casa da lista sem saber qual; agora *Você está na …* com *Trocar de casa*, cobrado no `ensaio-servidor` |
| 214 | **as recusas também falam como colega**: 157 recados do servidor e 96 do protótipo sem travessão nem frase que argumenta; o `as-recusas-falam-como-colega.spec.ts` lê toda recusa dos dois lados e reprova |
| 215 | **corrigir um familiar** (pedido de 14/10): acrescentar e encerrar já funcionavam; faltava corrigir, com o motivo e o antes guardado (`person_contact_change`, people/1653); encerrar contato não ia à auditoria |
| 216 | **os arquivos na área restrita do Judiciário**: guia, decisões, o relatório de acolhimento e outros, em PDF ou pela câmera, logo abaixo do motivo (`DocumentosDaCategoria`, a categoria judicial do dossiê); no protótipo, a recusa do servidor de mentira passou a ser `ErroApi` |
| 217 | **o laudo junto da alergia e as receitas no perfil**: laudo ou receita anexado à alergia, condição ou restrição (`document.health_condition_id`/`food_restriction_id`, people/1654), e os remédios dela com as receitas na aba Saúde; o `doc_insert` passou a conferir a casa |
| 218 | **o atendimento da equipe técnica**: área, dia, o que foi trabalhado e até oito arquivos (o desenho), na aba Atendimentos, só técnica, coordenação e gestão (`technical_session`, people/1655); entra como fonte restrita do acompanhamento |
| 219 | **o banco mais robusto** (pedido de 14/10): a autoria trocável num UPDATE (21 políticas sem a segunda trava), 5 inserções abertas, 12 UPDATE concedidos sem política, 73 chaves sem índice (identity/1656); limites de tempo na conexão (`BANCO_*`, recusa *NÃO foi salvo*); a migração guarda a soma de cada arquivo e para se um aplicado mudar, com trava e um executor só; o resto é da instalação (§12.4.1) |
| 220 | **nada se perde no servidor do Pão** (pedido de 14/10): o arquivo contínuo do banco (`arquivar-wal.sh`, `postgresql-do-servidor.conf`, um minuto no máximo), a base semanal conferida (`base-do-banco.sh`), a volta a qualquer minuto (`restaurar-ponto-no-tempo.sh`) e a cópia das fotos de cinco em cinco minutos (`copiar-arquivos.sh`), provados pelo `ensaio:ponto-no-tempo`; o arquivo guardado agora vai ao disco antes da resposta (`gravarNoDisco`); três sinais novos na Implantação (relogio/1657) |
| 221 | **o perfil como ferramenta de trabalho** (pedido de 14/10): abre na **Geral** (idade, casa, tempo de acolhimento, escola, PIA, família, cuidados); a aba Hoje e o remédio de hoje saíram (o dia é do Dia e da ATA); **Dia a dia** para consultar; **Atendimentos** só da equipe técnica, linear, o mais novo em cima; os números de cada aba por `GET /reports/acolhido/:id/numeros` |
| 222 | **a voz, a câmera e a galeria por modelo de celular** (pedido de 16/10): `ensaio:aparelhos` com oito aparelhos simulados achou quatro: o **ditado repetia o texto no Chrome do Android**, a **câmera cortava a folha** (pedir 1920×1080 corta a imagem 4:3), o **aparelho sem microfone religava sem parar**, e a **barra Cancelar/Registrar cobria o fim de todo formulário de folha no celular** desde a 184 |
| 223 | **a Acolhe+AI mais firme** (pedido de 16/10): as instruções ao modelo levavam a tela, a casa e a data, e mudavam no meio da conversa, o que invalida o raciocínio anterior (com a chave, em conta nova, a pergunta seguinte seria recusada); agora ficam fixas, e o que muda vai na **nota do momento** no começo de cada pergunta (`assistente/momento.ts`), com a hora e o turno; `drop_block` como rede, contado na auditoria (`raciocinioTirado`); chama pelo **primeiro nome**; a tela **só faz a conversa crescer** (erro volta inteiro, conversa longa vira resumo) |
| 224 | **a Acolhe+AI inteira contra o servidor de verdade**: a tela, o servidor com a chave e um modelo de mentira local nunca tinham sido abertos juntos; agora a simulação os abre no fim (`ensaio-acolhe-modelo.mjs`) e confere o que chega ao modelo, a leitura pela sessão da educadora e a auditoria; com o código da 222, onze das dezoito cobranças reprovam |
| 225 | **as oito casas no protótipo** (pedido de 19/10): cada casa é uma cópia própria do servidor de mentira (`mock-casa.ts`, criada quando alguém entra), com crianças, famílias e equipe de dezoito pessoas com outros nomes (`casas-ficticias.ts`); o `mock.ts` escolhe a casa de cada pedido. Até aqui quem entrava na Casa 01 via as crianças da Casa 03. Endereço da casa na lista das unidades, também no servidor de verdade |
| 226 | **seis meses de história em tudo, nas oito casas** (pedido de 19/10): visitas, atendimentos técnicos, saúde, ocorrências, conquistas, acompanhamentos, reuniões, convivências, cozinha, notas, escala com trocas, escola, internações, saídas e o livro das ATAs desde abril (`escreverSeisMeses`, semente da casa); cada criança com a sua família (todas tinham a mesma mãe); os painéis do gestor somam o que cada casa registrou |
| 227 | **o que falta para ir ao ar** (pedido de 19/10): o §12.0 põe o caminho em ordem, com quem faz; prontos daqui o `scripts/instalar.sh` (confere sem mudar nada; `--instalar` constrói e migra), o serviço e o proxy em `scripts/servidor/`, e o banco de demonstração (`SIM_DUMP` na simulação), para a equipe treinar antes do dado real; a rodada achou a escala recusada com 500, que era a conta de tempo do banco sob o relógio de mentira (com o relógio real, nada): o zero em `BANCO_LIMITE_*` desliga o limite, só a simulação o usa e o instalador o recusa; e o `.env.example` com comentário na linha do valor, que o systemd entregaria junto (a sessão sem duração, ninguém entrando no primeiro dia) |
| 228 | **a conta das doses que vão com a criança multiplicava por zero os horários do dia** (o remédio de duas vezes ao dia saía pela metade; medications/1658, `as-doses-que-vao-junto`); no protótipo, a mesma folha dizia sempre Ana Paula com Rosângela e uma Risperidona fixa (agora a do servidor, aberta pelo `ensaio:uso`); o Word das outras casas passa pela troca de nomes; e as telas das oito casas contra o servidor acharam os limites de espera ligados nos servidores do navegador |
| 229 | **a conta da saída não olhava o começo nem o fim da receita** (o antibiótico que termina no meio da saída ia com doses para depois do fim; medications/1659, perguntando ao catálogo quem mais lê os horários); e as buscas por teste de nome de promessa e de só formato, sem achado |
| 230 | **a explicação recolhida** (pedido de 19/10: *"parece poluído, não quero tirar nenhuma ferramenta"*): medido, um terço do texto das telas era explicação; agora a primeira frase fica à vista e **Como funciona** abre o resto (`explica.tsx`, regra em `explica-regra.ts`); o alerta, o recado, o aviso com número e **a frase que diz o que o número não é** ficam à vista (`FRASE_QUE_PROTEGE`, que o primeiro `ensaio:uso` pediu) |
| 231 | **o Guia do sistema** (pedido de 19/10): o primeiro item do menu, com cada tela que o cargo alcança (o que é, o que o cargo faz, o que a Acolhe+AI faz, o botão que abre), as abas do perfil, a Acolhe+AI, a conta e as Novidades; o texto vem da lista da Acolhe+AI e do alcance, e o resto de `guia-do-sistema.ts`; o `o-guia-do-sistema.spec.ts` reprova a fase sem a linha dela nas Novidades |
| 232 | **a Vida na casa na Geral, e a aba Documentos** (pedido de 20/10: *"tive que procurar onde ficam os documentos"*): o perfil em oito abas; a Cadastro virou Documentos e abre no dossiê e na lista, com quem mexeu no fim |
| 233 | **até 10 anexos por mensagem, e a rodada dos downloads** (pedido de 22/10): a linha da ATA ganha anexos (shifts/1660), o diário da internação leva vários por registro (nursing/1661), a ocorrência recebe vários de uma vez, o atendimento vai a 10 e a Acolhe+AI aceita 10 por pergunta (`anexos-da-mensagem.regra.ts`, 15 MB por envio); na tela, `AnexosDaMensagem` com Ver e Tirar e a **câmera em sequência**; a rodada (`o-que-entra-volta-inteiro`, os 21 Words e cada porta de anexo, byte por byte e no disco) achou **toda imagem do Word cortada no LibreOffice** (entrelinha sem tipo), **o Exportar dos benefícios sem arquivo**, tabela vazia com título solto e **o diário da internação aceitando autor alheio no banco** |
| 234 | **o texto do papel, lido no aparelho** (depois de conferir o andamento de outra IA, pedido de 22/10): *Ler o texto do papel* na prévia do dossiê e no Ver de cada anexo, com o Tesseract e o português no navegador (`ocr.ts`), conferido e corrigido pela pessoa; o texto conferido guardado com versão (`document_text`, people/1662) e a busca do dossiê; **com o protótipo aberto por dois cliques o trabalhador não carregava uma segunda peça**, e vai numa peça só |
| 235 | **o cadastro corrigido pelo papel conferido**: a folha Corrigir o cadastro sugere nome, data, RG, CNS e filiação com o trecho do papel (`campos-do-papel.regra.ts`), a pessoa marca e corrige com o motivo; nada junta crianças, e nome muito diferente avisa |
| 236 | **os gráficos no Word e a planilha do período**: o gráfico como dado da folha, impresso como quadro pintado (igual no servidor e no protótipo), e *Baixar a planilha* em CSV do Excel pelo mesmo registro com finalidade; **o LibreOffice espremia o rótulo** com a largura em porcentagem |
| 237 | **o relatório das vivências em Word** (pedido de 23/10: *"pedi o relatório da vivência de uma aluna em Word pela IA e ela não soube fazer"*): no álbum, com as escolhas de período, tipos, quais vivências e fotos; as fotos conforme o cargo (técnica, líderes, coordenação e gestão incluem todas; nos outros cargos, a sem autorização de imagem sai como legenda); a regra em `vivencias-folha.ts`, a mesma no servidor e no protótipo; a Acolhe+AI entende o pedido |
| 238 | **o banco de palavras da casa** (pedido de 23/10): a gíria gaúcha, as siglas da rede e os outros nomes das coisas da casa (`assistente/palavras-da-casa.ts`), lidos pelo modo próprio da Acolhe+AI e pelo guia do modelo; *a pia da cozinha* não vira *piá* (`menosQuando`); e *janta* saiu, porque abria a Cozinha no meio de um relato |
| 239 | **a Acolhe+AI no computador do Pão**, sem custo e sem limite por pessoa: `ACOLHE_AI_MOTOR=local` conversa com um modelo aberto pelo padrão do Ollama (`assistente/motor-local.ts`), com fila no lugar do limite e a janela curta anotada na auditoria; sem a variável, segue o Claude |
| 240 | **a Acolhe+AI firme no plantão**: a resposta aparece enquanto é escrita (`conversa/aos-poucos`, `apiAosPoucos`), a máquina que não responde cai no guia naquela pergunta, e o modelo do Pão recebe o guia do cargo (`guiaDoCargo`) |
| 241 | **a prova do modelo**: `npm run prova-do-modelo` mede o modelo do Pão com as frases do plantão e os limites da Fundação, por setor e com o tempo; a régua em `assistente/prova-do-modelo.ts` |
| 242 | **o plantão com a Acolhe+AI**: o que eu preciso saber leva ao que mudou, o rascunho da ATA no fim do turno (`ATA:`), e as **mãos ocupadas** (fala, envio no silêncio, resposta lida, o microfone volta só depois da leitura) |
| 243 | **os documentos pela conversa** (período, visitas, internação, trajetória) e **o cuidado com as palavras** que rotulam a criança, só sugestão, nada guardado (`palavras-que-rotulam.ts`, `CuidadoComAsPalavras`); no protótipo, a volta semeada de noite caía no turno do dia |
| 244 | **as palavras que a equipe ensina**: quem conversa propõe, a coordenação, a CG ou o gestor aprova ou recusa com motivo, e só a aprovada vale para a Acolhe+AI de todos (`assistant_word`, `assistant_word_decision`, assistente/1663) |
| 245 | **só a Enfermagem ativa o esquema de medicamento** (decisão de 25/10): de noite a coordenação e a técnica deixam o rascunho com a foto da receita, a Enfermagem é avisada e ativa; a dose daquela noite vai na ATA; o gestor sai do cadastro; trava no banco (medications/1664) |
| 246 | **cada setor vê só as suas funções** (pedido de 25/10): 884 botões medidos contra o servidor (`ensaio-o-que-cada-setor-ve.mjs`); os que a tela mostrava e o servidor recusava saíram; o Gestor Geral lê a ATA, o Dia, a internação, a Cozinha, os combinados, a rotina e a escala sem registrar (`@OGestorSoLe()`, decisão de 25/10); a aba repetida dos Combinados saiu |
| 247 | **a conferência da instalação pergunta ao computador da Acolhe+AI** (o que faltava da 239): motor, endereço em `/v1`, se a máquina responde e se tem o modelo; sem um deles o serviço caía calado no modo guia |
| 248 | **o dia a dia mais leve** (pedido de 27/10): cada cargo usado no protótipo às 23h e às 14h; o **Painel do plantão só recusava** a substituição (hoje passa ou recusa, com a folha do Dia) e tinha **uma segunda lista de quem decide, ainda com o gestor**; **mais de cem quantidades com parênteses** nas telas, avisos, folhas e protótipo (`quantos`, `a-quantidade-por-extenso.spec.ts`); a Portaria sem a orientação repetida em cada cartão; a regra das doses fora do vermelho; e o protótipo da noite (plantão das 07:00, cargo do Nélio, episódio da madrugada) |
| 249 | **os caminhos sem fim** (pedido de 27/10): o **registro sem internet que não pôde ser gravado não avisava ninguém** (hoje avisa a técnica e a coordenação); o **sino dizia o nome cru da tabela** e não levava à tela (o `ONDE` do `Avisos.tsx`, o botão Abrir e o `todo-aviso-tem-destino.spec.ts`); e o **retorno médico marcado nunca terminava**, e a Saúde dizia *a reagendar* sobre a consulta feita (a folha pergunta de qual retorno é a consulta; nursing/1665) |
| 250 | **o relato pedido chega a quem deve escrever**: a cobrança de relato da ocorrência grave só aparecia para quem abrisse as Ocorrências, e o educador cobrado não era avisado; hoje recebe *O seu relato foi pedido* (statements/1666) |
| 251 | **o aviso leva a uma tela que quem o recebe abre**: o combinado da reunião era avisado ao Líder Noturno Geral, que responde a pauta, e a tela dos Combinados não estava no mapa dele (`alcance.ts`); o cruzamento aviso, nível, cargo e tela virou teste (`todo-aviso-tem-destino`) |
| 252 | **o que nasce aberto e o que ninguém lê**: as 54 colunas de fim contra todo `UPDATE` e `INSERT`, e cada tabela contra toda leitura; nada fica aberto para sempre nem sem chegar a alguém, e a `substitution_request.acknowledged_at`, que dizia ciência do substituto e nunca foi escrita, ganhou o comentário certo (activities/1667) |
| 253 | **o cadastro, o perfil, os documentos e os menus** (pedido de 28/10): oito cargos, 146 telas, 167 abas e 21 perfis sem achado; nenhum ensaio passava pelo Cadastrar acolhido, e no protótipo a criança cadastrada **perdia a ficha da chegada e ganhava uma história que ninguém registrou** (família, visitas, escola, PIA, memória, o dia de hoje); e, **no sistema de verdade também**, voltar do dossiê não relia o perfil e o documento recém-anexado não aparecia na aba Documentos; consertados, e no `ensaio:uso` |
| 254 | **o alto contraste sai** (pedido de 30/10: o Pão não vê necessidade): fora da lista, do CSS e do ensaio de acessibilidade; quem o tinha guardado volta ao tema do aparelho; e **a equipe de design** começa o estudo do visual (pedido de 30/10: *"ainda acho muito feio e amador"*), com direções para a Fundação escolher |
| 255 | **toda tela cabe, rola e tem volta** (pedido de 31/10): o `ensaio:cabe` entra em cada tela, aba, folha e subtela de cada cargo e aperta a volta; a folha do acompanhamento sem Fechar, as visitas que não recolhiam, a área restrita que não se fechava e a folha das oito casas sem volta ao Arquivo, consertadas |
| 256 | **os pequenos defeitos da equipe de design**: o sino recontado junto com a lista, o perfil que pulava quando a foto chegava, o recado da Chamada sem internet fora da vista (hoje acima da barra do pé), e as doses do protótipo fora da ordem da hora |
| 257 | **os retratos do protótipo refeitos** (pedido de 30/10): o gerador da equipe de design no `retratos.ts`, com idade, pele e cabelo, roupa fora das cores de estado, e os meninos parecidos acertados à mão; a silhueta segue como opção da Fundação |
| 258 | **o movimento** (pedido de 30/10, relatório 5): o toque que responde em 90 ms, a folha que sobe de baixo e a tela que entra, só em CSS e nunca de lado; com Reduzir movimento, só a cor muda |
| 259 | **o que está acontecendo, e o que mudou** (relatório 5): o destino de um aviso, da linha do dia, do Guia ou da busca se acende e apaga (`chegou-aqui.ts`), o selo do sino acende quando muda, a Acolhe+AI pensa com três pontos, o microfone ligado ganha um anel, e o Como funciona abre suave |
| 260 | **o vazio que mente** (relatório 5): onze telas diziam *Nenhum…* antes de o dado chegar; o `ensaio:vazio` alonga a rede do protótipo, abre cada aba e porta de cada cargo e achou 57 casos; consertados, e a Cozinha que dizia *Nenhum pedido* quando a busca falhava |
| 261 | **o vazio que mente, por dentro**: o `ensaio:vazio` passa pelas abas de dentro e pelo perfil com as abas dele (293 telas); achou as Saídas da Portaria, as Compras da Saúde e as Comunicações externas, consertadas |
| 262 | **as fases 255 a 261 contra o servidor de verdade**: a Casa 03 em trinta dias (onze contas, 327 telas, sem achado), a Acolhe+AI com o modelo, o `ensaio:cabe` e o `ensaio:acolhe`; nenhum defeito |
| 263 | **o sistema inteiro conferido, e o banco** (pedido de 02/11): a **falha crítica de endereço falsificado atrás do proxy** e mais quatro dependências do servidor consertadas, o teste da escala que reprovava todo novembro, e as quantidades com parênteses nos scripts; o resto limpo (suíte nas duas condições, catálogo, varreduras, cópia e volta no tempo, produção, ensaios) |
| 264 | **o servidor no Nest 11 e no Express 5** (pedido de 02/11): os seis avisos de segurança que sobravam, fechados sem a troca para ESM que o Nest 12 pede; o Express 5 deixava **o pedido sem corpo nenhum como `undefined`**, e cerca de cinquenta rotas de escrita dariam 500 (o `{}` volta no `corpo-da-requisicao.ts`, e a suíte da 155 manda o pedido sem corpo); o curinga com nome no `forRoutes` |
| 265 | **o botão que grava não grava duas vezes, e diz que gravou** (o M5 do relatório 5): com a rede lenta, **dois toques em Registrar linha gravavam a mesma linha duas vezes na ATA**, que não se apaga; agora todo botão que dispara escrita fica pálido e não aceita outro toque até a resposta (`botao-que-grava.ts`, ligado pelo `api()`), e o próprio botão diz *Registrado às 23:04* por 1,6 s |
| 266 | **a recusa perto do dedo**: a frase de recusa nascia no alto da tela ou da folha, fora da vista de quem tocou o botão lá embaixo (medido: a nota fiscal repetida, dentro da folha rolada); agora, se ela não está à vista, aparece logo acima do botão tocado, com Entendi (`botao-que-grava.ts`); e **o `ensaio:celular` nunca tinha medido o fim da tela atrás da barra** (perguntava à `nav`, e quem é fixo é o invólucro); agora mede, e também o botão da Acolhe+AI |
| 267 | **sem sinal, a tela dizia que tinha guardado o que não guardou**: toda falha de rede dizia *O que você registrar fica guardado neste aparelho*, e só a Chamada, a Passagem e o Concluí do Dia passam pela fila; a linha da ATA, a ocorrência e o resto não ficavam em lugar nenhum. Agora a escrita diz *NÃO foi salvo* (`frase-sem-sinal.ts`), perto do botão, e só o que a fila guarda diz que guardou (`vaiParaAFila`). E a marca única no servidor ficou de fora: a marcação da chamada já é única por criança e a fila leva o `clientOpId` |
| 268 | **as fases 265 a 267 conferidas com todos os ensaios que não tinham rodado**: a suíte nas duas condições de relógio, o de acessibilidade, o `ensaio:vazio`, o `ensaio:cabe` nos oito cargos a 390 px e no monitor, o `ensaio:acolhe` nos nove cargos e o relatório pela voz, o `roteiro`, o `uso-celular`, o `ensaio`, o `largo`, o `folhas` e o `ensaio:aparelhos`; nenhum defeito, nenhum código mudou |
| 269 | **o prazo da reavaliação ao Juízo** (pedido de 03/11): o ECA manda reavaliar no máximo a cada três meses (art. 19), e ninguém contava; o dossiê ganha o *Relatório de reavaliação*, a área restrita do perfil diz o último e o próximo, com o tempo de acolhimento, e o relógio avisa a técnica e a coordenação quinze dias antes (`reavaliacao.regra.ts`, people/1668, `GET /people/:id/reavaliacao`) |
| 270 | **a saída com a história** (pedido de 03/11): a folha de transição, para quem recebe a criança (cuidados, saúde, alimentação, remédios com horários, escola e documentos, com recibo), e o livro da vida, para ela (conquistas e vivências, só fotos autorizadas), na aba Documentos e na folha da saída; nada da área restrita (`reports/saida-folha.ts`, `/impacto/saida/:id/...`) |
| 271 | **há quanto tempo a família não visita** (pedido de 03/11): no perfil, na aba Família e visitas, a técnica, a coordenação e a gestão leem a última visita da família e a última ida à casa dela, com os dias; sem cor, sem limite e sem lista entre crianças (`ultimo-contato.regra.ts`, no `GET /people/:id/visitas`) |
| 272 | **a letra Grande e a Maior cabem** (pedido de 05/11): é um `zoom` da página, e nenhum ensaio media com ela; com a Maior, um celular de 360 px fica com uns 277 px, e a **Equipe, o Painel das unidades e o Arquivo documental andavam para o lado**; no computador, **o botão do fim de toda folha comprida ficava abaixo da borda** (88dvh vezes o zoom). Grades com `min()`, o vizinho do título desce (`flex-basis` com a letra), o caminho quebra, e toda altura pela tela se divide por `--zoom-da-letra`; `ENSAIO_LETRA` no `ensaio:celular` e no `ensaio:cabe`, com a régua convertida |
| 273 | **o que já foi feito fica verde** (pedido de 05/11): a linha do dia ganha `feito` no contrato (`TimelineEvent`), dito pelo servidor e não adivinhado pelo texto: atividade concluída, dose administrada, chamada confirmada (por qualquer um, verde para todos) e ATA fechada sem pendência; não realizada, recusa, cancelada e reagendada seguem cinza. Na Chamada, o cartão confirmado fica verde e a barra da casa continua. O verde nunca sozinho (visto e palavra), e **no RS e no Verde, onde o fundo da tela já é verde, o feito leva verde mais cheio e borda inteira** (`--feito-fundo`, `--feito-borda`); no protótipo, a linha do Dia passa a acompanhar a dose dada e a chamada confirmada |
| 274 | **a foto grande, e a foto do familiar** (pedido de 05/11): tocar no rosto abre a foto do tamanho da tela, com X, Esc e toque fora, sem baixar (`FotoAmpliada`, `AvatarQueAbre`), no perfil, nos familiares, em quem visitou e na Portaria; **pôr, trocar e tirar é só da técnica e da coordenação** (`QUEM_POE_FOTO`, `people/foto.regra.ts`, servidor, tela e protótipo; o gestor passa a só ver); o familiar ganha Pôr, Trocar e Tirar foto no cartão e a foto no Acrescentar contato; **trocar guarda a de antes e tirar pede o motivo** (`photo_change`, people/1669): até aqui o banco esquecia a foto trocada |
| 275 | **o perfil em ordem, com a data e a hora** (pedido de 05/11): toda lista com data do perfil passa pelo `maisNovoEmCima` (`rotulos.ts`), o mais recente em cima, e o instante sai com a hora (`diaEHora`); a convivência familiar estava fora de ordem; a Saúde do perfil ganha o **histórico de saúde** (consultas e registros, `HistoricoDeSaude`); o atendimento técnico ganha **a hora** (`happened_time`, people/1670, obrigatória) e *Registrado em*, e a aba Atendimentos **a busca** por palavra e período |
| 276 | **o funcionamento** (avaliação de 05/11): a chamada confirmada diz quem abriu e quem confirmou, com a hora, sem abrir (`app_user_display_name` na lista do `/checks`), e a confirmação volta à lista com o recado; a data e a hora no alto (`RelogioDoTopo`); as saídas de hoje com o dia, desde quando, quem decidiu e para onde (people/1671); o recorte já escolhido fica marcado (`aria-pressed`); o botão de teste do protótipo deixa de parecer indicador de conexão |
| 277 | **as decisões de 05/11**: o CPF e o RG do visitante escondidos para todos na lista do portão, e inteiros ao tocar em *Ver o documento* (portaria, técnica e coordenação; `app_cpf_do_visitante`, people/1672; auditoria `visitante.cpf_visto` sem o número); a folha impressa da guarita continua inteira; *O Dia da Casa*, a aba *Vivências*, *Registro Educacional* e *Atas do Mês*; e o protótipo com quinze na Casa 03 (cinco no acervo) e sem *fictício* nos nomes (`sem-a-marca.ts`, na saída do servidor de mentira) |
| 278 | **O Dia da Casa organizado** (avaliação de 05/11, módulo 11): abre em *Pendentes* (o feito sai da lista ativa e não do registro), *Toda a rotina* com o dia inteiro ou manhã, tarde e noite, *Você* e *Coletivo* na linha, e *Ver detalhes* com o resumo e a porta do registro de origem (`ORIGEM` no `Dia.tsx`); sem rota nova |
| 279 | **a escala em calendário** (avaliação de 05/11, módulo 12): o período em grade (`GradeDaEscala` no `Escala.tsx`), cada dia com quantos de dia e de noite e *falta* no turno vazio, um dia aberto por vez com o líder do turno; datas em botões compactos; sem rota nova |
| 280 | **a agenda com o compromisso inteiro** (avaliação de 05/11, módulo 12): cada data com quem, tipo, início e fim, duração, saída, local, endereço, responsável e situação; o responsável chega a cada data (`agenda.service.ts`, pelo `app_user_display_name`); o período em grade (`GradeDaAgenda`); até um ano à frente |
| 281 | **quem escreve na ATA de outro turno** (avaliação de 05/11, módulo 10; decidido em 06/11): escreve quem está na escala do turno, mais técnica, coordenação, Enfermagem e o líder do turno; sem escala lançada, ninguém é travado; os outros pedem e o líder do turno ou a coordenação autoriza ou recusa (`ata_write_request`, `app_pode_escrever_na_ata`, gatilho na `ata_note`, shifts/1673) |
| 282 | **os vínculos educacionais** (avaliação de 05/11, módulo 07; decidido em 06/11): escola, SCFV, integral, aprendizagem, estágio e curso, como contratos em linha na aba Educação, vários ao mesmo tempo, o triângulo que abre turma, dias, endereço, notas e histórico; corrigir guarda o antes com o motivo; o fim previsto avisa técnica, coordenação e Líder Diurno a 30 e 7 dias (`education_link`, `education_grade`, nursing/1674) |
| 283 | **a frequência escolar** (avaliação de 05/11, módulo 07; decidido em 06/11): *Foi à aula hoje?* no Dia da Casa, com foi, não foi com o motivo e não teve aula; sem marca é ainda não verificado, nunca falta; o plantão marca hoje e ontem, a técnica e a coordenação corrigem com o motivo e o comprovante; os dias do último mês em cada vínculo (`education_attendance`, nursing/1675) |
| 284 | **os atendimentos da equipe técnica** (avaliação de 05/11, módulo 08): *Assistência Social* no lugar de serviço social; interno ou externo, o local e quem atendeu (people/1676); os arquivos à vista no cartão e juntar arquivo depois, só quem registrou; e os atendimentos de um período em Word para técnica e coordenação (`QUEM_BAIXA_ATENDIMENTOS`) |
| 285 | **o Judiciário em blocos que se abrem** (avaliação de 05/11, módulo 09): como chegou, episódios e ofícios fechados com uma linha do que tem dentro; na área restrita, situação e motivo aberto e medida e processo à parte (`BlocoQueAbre`); sem rota nova |
| 286 | **a Cozinha em resumo por refeição** (avaliação de 05/11, módulo 13; decidido em 07/11): o plano de hoje no alto (refeições com a hora, quem está em casa, o que não servir, pedidos do dia, a chamada feita) e os números do período em cartões por refeição (`app_plano_da_cozinha`, reports/1677) |
| 287 | **o sigilo por registro de saúde** (avaliação de 05/11; decidido em 07/11): a consulta e o atendimento sigilosos, o conteúdo só para Enfermagem, técnica e coordenação; marca quem registrou e as três, tira a técnica e a coordenação com o motivo (`health_confidential_change`, nursing/1678) |
| 288 | **a conta não muda o próprio cargo** (A2 da análise de 08/11): pelo papel da aplicação, **a educadora virava Coordenação Geral das oito casas** escrevendo `role` e `todas_as_casas` na própria linha de `app_user`, **a coordenação vinculava conta de outra casa à dela** (`uha_insert`), **a técnica virava Enfermagem pela Equipe** e **a coordenação de qualquer casa redefinia a senha da Enfermagem**; a aplicação escreve em `app_user` só a troca da própria senha (identity/1679), não escreve vínculo de casa (1680), e um gatilho diz quem administra cada conta e o vínculo de casa dela (1681 e 1682) |
| 289 | **só quem alcança todas as casas cria conta que alcança todas** (decisão do dono em 08/11): a coordenação e a técnica de uma casa cadastravam Enfermagem com a senha que escolhiam, ou passavam um educador para Enfermagem, e chegavam às oito; o gatilho da 1681 passa a olhar a criação e o cargo de depois (identity/1683), a lista de cargos da Equipe só oferece a Enfermagem a quem alcança todas, um teste obriga a lista do gatilho a ser a do alcance, e quem passa para a Enfermagem, para a coordenação ou para a Coordenação Geral não leva a senha, a sessão nem o convite de antes |

**Medido no fim da 289:** 223 migrações, 153 tabelas, 172 suítes, 1493 testes; nas 237 e 238, a suíte inteira
verde (1363 de 1363, depois de consertar as três conferências que o relatório das vivências deixou soltas) e o
`ensaio:uso` (739 cobranças, sem reprovação, com o relatório das vivências aberto e o Word baixado); **não rodou**
nas 237 e 238 o relógio adiantado, o do celular, o de acessibilidade, o `ensaio:acolhe` nem a simulação contra o servidor;
na 236, verdes nas DUAS condições de relógio, rodadas inteiras (a única reprovação das duas era esta linha, ainda com os números da 232);
nas 233 a 236, o `ensaio:uso` (730 cobranças, sem reprovação, com os blocos dos anexos da mensagem, do texto do papel
lido no protótipo aberto por dois cliques, do cadastro pelo papel e dos gráficos e da planilha), o do celular (320
telas, sem achado, depois de deixar de medir o campo de arquivo escondido como alvo de toque), **a Casa 03 em trinta
dias contra o servidor de verdade** (tudo bate, nenhuma leitura acima de 118 ms; onze contas e 329 telas e o esqueci,
sem achado, depois de tirar do `ensaio-servidor` o passo de anexar que a 233 aposentou; na API, só a recusa conhecida
das vagas) e, no fim dela, a Acolhe+AI com o modelo de mentira (todas verdes), o `ensaio:aparelhos` no Pixel 7 (sobre o
código da 233, sem achado) e os Words do servidor e do protótipo abertos no LibreOffice (o gráfico espremido achado e consertado);
na 232 (na 219, a espera pela linha travada não se mede
sob o relógio adiantado: o banco ali não tem temporizador); na 232, as duas suítes inteiras com uma só reprovação, a do `numeros-da-documentacao`, que leu como total uma contagem que eu tinha escrito nesta mesma nota (frase reescrita, e ele passa); o `ensaio:uso` (701 cobranças, sem reprovação, com o Guia e a aba Documentos), o do celular (320 telas, sem achado), o de acessibilidade (1312 telas, oito temas, nenhuma violação) e o `ensaio:acolhe` (todas as telas, subtelas e formulários de todos os cargos, por texto e por voz, o Guia incluído); e, depois do fechamento, **a Casa 03 em trinta dias contra o servidor de verdade** (onze contas, 329 telas com o Guia, o Como funciona e a aba Documentos, e o esqueci, sem achado; na API, só a recusa conhecida das vagas; nenhuma leitura acima de 177 ms) e, no fim dela, a Acolhe+AI com o modelo de mentira (todas verdes), e o `ensaio:roteiro` com as 56 tarefas (duas novas do educador: o boletim na aba Documentos e a dúvida da cozinha pelo Guia), e o `ensaio`, o `largo`, o `fila`, o `folhas` e o `uso-celular` (706 cobranças no celular, sem reprovação, com o Como funciona e o Guia tocados com o dedo), os cinco verdes; na 231, o Guia aberto no navegador a 390 e a 1366 px (a rodada inteira é a da 232); na 230, o `ensaio:uso` (690 cobranças, sem reprovação, com o Como funciona aberto e fechado no celular), o do celular (306 telas, sem achado), o `ensaio`, o `largo`, o `fila`, o `folhas` e o `roteiro`, e o `a-explicacao-recolhida` reprovando três telas antes da `FRASE_QUE_PROTEGE`; **não rodou** o de acessibilidade nem o `ensaio:acolhe` nem a simulação contra o servidor; na 229, o de acessibilidade (1256 telas, oito temas, nenhuma violação, o primeiro desde a 221) e o `as-doses-que-vao-junto` reprovando sem a 1659; na 228, o `ensaio:uso` (689 cobranças, sem reprovação, com a folha dos remédios da saída), **as telas das oito casas contra o servidor de verdade sobre o banco de demonstração** (38 contas, 1.209 telas, sem achado depois de desligar os limites nos servidores do navegador) e, no fim, a Acolhe+AI com o modelo de mentira (todas verdes); e duas sondas fora da suíte, que entraram como Gestor Geral na Casa 01 e na Casa-Lar 4 (58 telas, nenhum nome da Casa 03 fora das visões que juntam as oito) e baixaram quatro Words da Casa 01 (limpos); nas 225 a 227, sobre o protótipo das oito casas, o `ensaio` e o `roteiro`, o `ensaio:uso` (684 cobranças, sem reprovação), o `ensaio:acolhe` (todas as telas e formulários de todos os cargos, por texto e por voz) e o do celular (306 telas, sem achado); e **as oito casas com vinte pessoas cada, seis meses contra o servidor de verdade, sem achado** depois de desligar os limites de espera só na simulação (o banco de demonstração: 120 MB, um arquivo de 14 MB, de 20/04 a 19/10, 169 contas fictícias, restaurado num banco à parte); e as oito coordenações publicando a escala juntas com o relógio real, 3.840 plantões em 15 s. **Não rodou** nas 225 a 227 o de acessibilidade (o protótipo mudou de dado, não de cor) nem as telas contra o servidor no navegador (a simulação rodou com `SIM_SEM_NAVEGADOR`); na 224, a Casa 03 em trinta dias contra o servidor de verdade (onze contas, 317 telas e o esqueci, sem achado; na API, só a recusa conhecida das vagas) e, no fim dela, a Acolhe+AI com o modelo de mentira através do servidor (dezoito cobranças, todas verdes; onze reprovam com o código da 222); na 223, o `ensaio:uso` (684 cobranças, com a conversa que só cresce e a nota do momento, depois de consertar a cobrança da portaria que dependia da hora), o `ensaio:acolhe` (todas as telas e formulários de todos os cargos) e o `ensaio:aparelhos` no Pixel 7 e no iPhone SE; na 222, a suíte nas duas condições, o `ensaio:celular`, o `uso-celular`, o `uso`, o `acolhe` e o `ensaio:aparelhos` (oito aparelhos, as
falhas do microfone, a galeria e 27 formulários de folha rolados até o fim, sem achado depois dos consertos;
a varredura das folhas reprova sem o conserto do rodapé); na 221, o `ensaio:uso` (com o bloco do perfil
reorganizado), o `roteiro` (54 tarefas), o do celular (306 telas, sem achado, depois de reescrever duas
frases da ATA da noite), o de acessibilidade (1256 telas, nenhuma violação), o `ensaio:acolhe` (todas as
telas e formulários de todos os cargos) e a Casa 03 em trinta dias contra o servidor de verdade, sem achado;
na 220, o `ensaio:ponto-no-tempo`
(arquivo contínuo, base conferida, volta a um minuto do meio e ao fim, cópia que só acrescenta); e na 219 a simulação da Casa 03
em trinta dias contra o servidor de verdade, com as travas novas, sem achado; na 218, o `ensaio:uso` inteiro (com os blocos
215 a 218), o do celular (306 telas, sem achado), o de acessibilidade (1256 telas, nenhuma
violação), o `ensaio:acolhe` (todas as telas e formulários de todos os cargos, por texto e por voz) e a simulação da Casa 03 em trinta dias contra o servidor de verdade, sem achado, com
a técnica registrando o atendimento e anexando o laudo pela tela, conferidos no banco; e, no
fechamento, o `ensaio`, o `largo`, o `fila`, o `folhas`, o `uso-celular` e o `roteiro` (52
tarefas, as três novas de 14/10 incluídas), os dez verdes; na 214,
o `ensaio:uso`, o `roteiro` e o `fila` verdes sobre o protótipo novo, e na 213 o `uso`, o do celular e o de acessibilidade (1256 telas,
nenhuma violação), mais a simulação contra o servidor. **Da 212:** o `ensaio:uso-celular` e o
`ensaio:acolhe` com todas as telas de todos os cargos por texto e por voz e todos os formulários
marcados abertos por ela; o do celular com 306 telas a 360 e 390 px, que achou só a caixa da 210
(consertada) e depois 153 telas a 360 sem achado, **nenhuma frase de raciocínio**; e **1256 telas (157 × oito
temas) sem violação de WCAG 2.1 AA**; e o `ensaio`, o `largo`, o `fila`, o `folhas` e o
`roteiro` verdes (os dez). O `roteiro` não rodava desde a 207 e reprovava em cinco tarefas:
não passava pelas abas do perfil (208) e procurava os nomes de antes da 207; o roteiro da
Casa 03 dizia *sai sozinho* onde a tela diz *sem acompanhante* (corrigido, Word regerado).
**Na 212 não rodou** a simulação contra o servidor. Nenhuma
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
**E a Casa 03 em trinta dias, na fase 190** (`SIM_CASAS=AI3 … 30`): tudo bate, nenhuma leitura
acima de 390 ms, e **onze contas, 177 telas, a Minha conta no celular e o esqueci minha senha
contra o servidor de verdade, sem achado** (depois de consertar os três que ela achou).
**E de novo na fase 193** (`SIM_CASAS=AI3 … 30`): **onze contas, 201 telas e o esqueci minha senha
contra o servidor de verdade, sem achado**. Na API a única recusa é a admissão numa Casa 03 que a
semente já deixa no limite de vinte vagas: é a regra funcionando (a simulação admite sem
justificativa), e já aparecia na 190.
**E na fase 194** (`SIM_CASAS=AI3 … 30`), repetida depois de a primeira rodada ver o banco
encerrar as conexões e a API morrer junto (consertado): **onze contas, 201 telas e o esqueci
contra o servidor de verdade, sem achado**. O log do banco agora acrescenta, em
`/tmp/pg-simulacao.log`: a causa daquela queda se perdeu porque ele era sobrescrito.
**E na fase 195** (`SIM_CASAS=AI3 … 30`), com o ditado e o rascunho no ar: **onze contas, 201
telas e o esqueci contra o servidor de verdade, sem achado**; na API, só a recusa conhecida da
admissão no limite de vagas.
**E na fase 196** (`SIM_CASAS=AI3 … 30`), com o acervo e o plantão abrindo por efeito: **onze
contas, 201 telas e o esqueci contra o servidor de verdade, sem achado**; na API, a mesma recusa.
**E na fase 198** (`SIM_CASAS=AI3 … 30`), com os rostos nas listas e a linha do tempo: **onze
contas, 201 telas e o esqueci contra o servidor de verdade, sem achado**; na API, a mesma recusa.
**E na fase 199** (`SIM_CASAS=AI3 … 30`), com o rosto nas doses e o caminho das ocorrências:
**onze contas, 201 telas e o esqueci contra o servidor de verdade, sem achado**; na API, a mesma recusa.
**E na fase 200** (`SIM_CASAS=AI3 … 30`), com a Equipe em cartões e o Painel em grade: **onze
contas, 201 telas e o esqueci contra o servidor de verdade, sem achado**; na API, a mesma recusa.
**E na fase 201** (`SIM_CASAS=AI3 … 30`), com a Acolhe+AI nova no ar: **onze contas, 201 telas e
o esqueci contra o servidor de verdade, sem achado**; na API, a mesma recusa.
**E na fase 202** (`SIM_CASAS=AI3 … 30`), com o perfil novo pedindo a agenda da criança ao
servidor: **onze contas, 201 telas e o esqueci, sem achado**; na API, a mesma recusa.
**E na fase 203** (`SIM_CASAS=AI3 … 30`): **onze contas, 201 telas e o esqueci, sem achado**; na
API, a mesma recusa.
**E na fase 205** (`SIM_CASAS=AI1,…,ARM4 SIM_EQUIPE=20 … 182`): **oito casas, vinte pessoas em cada, seis
meses**: nenhum achado do sistema; tudo o que as casas contaram bate com o banco e os relatórios; as
2.904 linhas que a Acolhe+AI ajudou a escrever estão no banco e no Word com o nome de quem registrou;
**38 contas e 1.142 telas, com cada aba de dentro, contra o servidor de verdade, sem achado**, e a
educadora gravando pela Acolhe+AI conferida no banco; 123,6 MB de banco. Relatório em
`docs/historico/oito-casas-seis-meses-vinte-pessoas-12-10.md`.
**E na fase 213** (`SIM_CASAS=AI3 … 30`), a primeira depois da 205, com o calendário, a saída pelo
portão, o perfil em abas, as fotos, o dia em ordem, as chamadas da casa e as frases novas: **onze
contas e as telas contra o servidor de verdade, sem achado** depois de consertar a casa aberta sem nome;
as chamadas da casa criadas pela tela e conferidas no banco; na API, a mesma recusa.
**E na fase 204** (`SIM_CASAS=AI3 … 30`), com o armário dizendo o vencido: **onze contas, 201 telas e o esqueci, sem achado**; nenhuma
leitura acima de 155 ms; na API, a mesma recusa.

**As TRÊS cores do sistema, porque confundi-las é o pior que esta tela pode
fazer** — está escrito por extenso em `frontend/src/cargos.tsx`:

**Os TEMAS são sete** (claro, escuro, desde a 182 rosa, azul claro, verde e colorido, e desde a 197 o Rio
Grande do Sul — `frontend/src/tema.ts`; o alto contraste saiu na 254, a pedido da Fundação). Tema muda fundo, moldura e marca, **nunca**
as três cores abaixo. Cor nova passa pelo `ensaio:acessibilidade`, que mede os SETE.

| A cor | Responde | Onde |
|---|---|---|
| **estado** | *isto ainda precisa de alguém?* | pílula clara, letra colorida |
| **autor** | *qual colega escreveu?* | borda da linha; a coordenação escolhe (0990) |
| **cargo** | *de que setor é esta pessoa?* | círculo cheio com iniciais |
| **casa** (211) | *qual é esta chamada?* | barra e ponto do cartão da chamada; a casa escolhe (`cores-da-casa.ts`) |

### A próxima etapa

**A pauta de 21/10** (sem fase, sem código): tudo o que espera o Pão, conferido contra o código e
posto em ordem no **PARA-A-REUNIAO §0**: as cinco perguntas que mais destravam, o que a TI precisa
responder, os documentos de papel e os dados a receber, o que o DPO vê, o que se assina e as 30
decisões de produto abertas. **Quando a resposta vier, ela entra lá e no §10 ou §11 do documento**, e
o item respondido sai do §0.

**O PLANO COMBINADO EM 06/11** (com a pessoa da Fundação, para a reunião no Pão):
1. Terminar a avaliação de 05/11: **279** a escala e a Equipe em calendário; **280** a agenda com local, endereço,
   responsável e duração; **281** quem fecha a ATA de outro turno; depois os módulos que sobram (Educação com vínculo,
   avisos e frequência; Atendimentos com local, interno ou externo e exportar por período; Judiciário em blocos; Cozinha em
   resumo por refeição; sigilo por registro de saúde).
2. **No protótipo**, o Marcelo como Coordenação Geral das oito casas (cada uma com coordenação, equipe e crianças
   próprias, o que a 225 já fez) e **uma setinha ao lado da casa, no alto, para trocar de casa**.
3. **Só depois, o 1.0 online** (pedido explícito, com ajuda passo a passo): servidor alugado e domínio próprio, site
   profissional, a Casa 03 como piloto, o Marcelo já cadastrado como Coordenação Geral com senha de teste que ele troca ao
   entrar, o esqueci minha senha mandando ao Gmail institucional (SMTP do Google com senha de app, fase 179), e pronto para
   ele cadastrar as coordenações das outras casas. **A Acolhe+AI do 1.0 começa em modo guia** (custo zero); o modelo (o
   Claude com chave, ou o computador do Pão) é o 2.0. O protótipo continua no GitHub Pages para mostrar, e o 1.0 fica um mês
   com eles. **Publicar o 1.0 é deploy: fazer só quando ela pedir, e com o que ela mandar (e-mail do Marcelo, senha de app).**

**FEITO — fase 289** (§2, PARA-A-REUNIAO §0): só quem alcança todas as casas cria conta que alcança todas, a decisão do dono de 08/11 sobre a pergunta que a 288 deixou na pauta. **Cargo novo que alcance as oito casas** entra no `app_house_in_scope` e no `app_casas_no_alcance` (que escrevem a lista por extenso) e no `app_cargo_de_toda_a_instituicao` (1683), e o teste *o cargo que o gatilho chama de toda a instituição é o que o alcance leva a todas as casas* reprova se as duas divergirem (provado tirando o Líder Noturno Geral da lista do gatilho). **A lista de cargos para cadastrar** (`/staff/sectors`) tira o cargo transversal de quem não alcança todas (`app_eu_alcanco_toda_a_instituicao`), e o protótipo faz a mesma pergunta em todas as rotas da Equipe (criar, editar, desativar, reativar e redefinir a senha), contando a Coordenação Geral, que é coordenador com a marca. **Quem administra as contas da instituição se pergunta pela própria conta** (`app_alcanca_toda_a_instituicao`: Gestor Geral ou Coordenação Geral, ativa, da instituição), e não pelo alcance, que dizia sim à Enfermagem e à instituição nula. **Mudança que tira a conta do alcance de quem a administrava encerra a senha, as sessões e os convites de antes** no gatilho (`app_estreita_quem_administra`: da casa para todas as casas, inclusive pela marca da Coordenação Geral, ou para coordenação), e o `update` e o `marcarCoordenacaoGeral` do `staff.service.ts` redefinem a senha na mesma transação (`senhaNovaSeEstreitou`) e a devolvem a quem mudou: função nova que mude cargo herda o encerramento, e quem quiser a senha nova na mesma mudança a escreve no mesmo `UPDATE`. **Quem passa a atender todas as casas deixa o vínculo da casa** no mesmo gatilho. **Suíte que marca a Coordenação Geral entra depois com a senha que a marca devolve** (o `a-coordenacao-geral` mudou por isso). **Recusa do protótipo vai escrita por extenso** no `new Recusa(...)`, e não numa constante: o `as-recusas-falam-como-colega` só lê o texto que está ali. **Medido na 289:** a suíte da conta (20 de 20; sem a 1683, os testes novos reprovam; com a versão que só olhava o cargo, os da Enfermagem e da coordenação reprovam), a `equipe` e a `a-coordenacao-geral` (o gestor cria a Enfermagem; a marca devolve a senha nova), a suíte inteira nas DUAS condições de relógio (1501 de 1501 no relógio real e às 22h30 de Porto Alegre), as sondas no protótipo a 390 px (a técnica e a coordenação da Casa 03 sem a Enfermagem na lista de cargos, o gestor com ela, e a senha nova mostrada na promoção, nenhum erro de página) e três revisões: o `guardiao-das-regras` (nada que fira regra), o `banco-de-dados` (achou o *alcança todas* respondendo sim à Enfermagem e ao nulo, e a promoção que não trocava a senha, provado com o convite da técnica) e o `auditor-seguranca-lgpd` (achou o mesmo pela coordenação e pela marca da Coordenação Geral, e o vínculo de casa que ficava aberto); consertados, e o que sobrou foi para o A4. **Anotado:** a `trabalho-da-equipe`, rodada junto só da `equipe`, reprovou uma vez em *a ordem é por NOME, nunca por total*: com duas pessoas no recorte, a ordem dos nomes coincidiu com a dos totais; na suíte inteira passa, e o teste só prova algo com três ou mais pessoas.
**Próxima: 290**, o conserto A3 (o backup lógico que volta sem as permissões do papel da aplicação, e o ensaio da restauração que confere como dono), com o `banco-de-dados` e o `auditor-seguranca-lgpd`. Depois A4, M2 a M5, a pauta, a setinha e o 1.0, este só quando a pessoa da Fundação pedir.

**FEITO — fase 288** (§2): a conta não muda o próprio cargo, o A2 da análise geral de 08/11. **Coluna de `app_user`
que a aplicação passa a escrever** entra no GRANT por coluna de uma migração nova e na lista
`COLUNAS_QUE_A_APLICACAO_ESCREVE` do `a-conta-nao-muda-o-proprio-cargo`, com o motivo; cargo, casas, conta ativa e
e-mail só mudam por função `SECURITY DEFINER`, e o vínculo de casa também (a 1680 tirou a `uha_insert`, que deixava a
coordenação vincular conta de outra casa à dela). **Quem administra cada conta mora no gatilho
`app_quem_administra_a_conta`** (1681) e o do vínculo no `app_quem_muda_o_vinculo` (1682), com a pergunta em
`app_conta_de_toda_a_instituicao` e `app_alcanca_a_instituicao_de`, e não em cada função da Equipe: função nova que
mexe em `app_user` ou no vínculo já nasce com a regra. **O `editavel` da Equipe repete a regra no protótipo** (`mock-casa.ts`, na
rota `/staff`): quem mudar quem administra a conta muda os dois. **O primeiro acesso pelo convite roda sem identidade de
propósito** (`invite.service.ts`): com identidade, o gatilho recusaria o da Enfermagem. **Permissão se pergunta ao catálogo pelo que vale de fato**
(`has_column_privilege`), e não pela lista de concessões, que não soma o que veio a PUBLIC. **Teste de várias colunas vai em `it(` um por um**, e não em `it.each`:
o `numeros-da-documentacao` conta linha que abre `it(`. **Medido na 288:** a suíte nova (14 de 14; sem a 1679, cinco
reprovam, sem a 1680, os dois do vínculo, sem a 1681, os dois pela Equipe, com 200 e 201, e sem a 1682, os dois do
vínculo e da lista), a suíte inteira nas DUAS condições de relógio (1495 de 1495 no relógio real e às 22h30 de
Porto Alegre), e as revisões do `banco-de-dados`, do `guardiao-das-regras` e do `auditor-seguranca-lgpd` (que
reprovou a primeira versão e achou o caminho pela Equipe). ~~**Para a pauta, e é segurança:** a coordenação ou a técnica de
uma casa criar conta de Enfermagem, ou passar alguém para Enfermagem~~: decidido pelo dono em 08/11 e feito na 289.
**Anotado, de antes da 288:** em `1634_a_coordenacao_geral.sql` (linhas 38 e 74), a guarda
`app_current_role() <> 'gestor_geral'` deixa passar cargo nulo; o certo é `IS DISTINCT FROM` (cai depois em
`usuario_inexistente` por acaso; não confirmado), para o A4.
**Para o A3, do `banco-de-dados`:** o conserto do backup NÃO pode reaplicar as permissões com um `GRANT ... ON
ALL TABLES` depois de restaurar, que desfaz a 1679 e a 1680 sem aviso; o caminho é tirar o `--no-privileges`.
**A 289 veio a seguir** (a criação da conta que alcança todas as casas, decidida pelo dono).

**FEITO — fase 287** (§2): o sigilo por registro de saúde, e com ele **a avaliação de 05/11 está toda feita** (276 a
287). **Leitura nova de consulta ou atendimento de saúde** esconde o conteúdo do registro sigiloso para quem não está em
`LEEM_O_SIGILO`: no servidor da Enfermagem pelo `semOConteudo`, e nas consultas de outros módulos pelo
`app_le_sigilo_de_saude()` no SQL. **Medido na 287:** a `o-sigilo-por-registro-de-saude` (6 de 6), a suíte inteira (1480 de 1481; a única reprovação era a sondagem de escrita, que não conhecia o parâmetro `:qual` da rota: ele foi para o corpo, e a rota ficou `POST /nursing/health-records/:id/confidential`; as quatro suítes que a rota toca, 23 de 23), o `ensaio:uso` (854 cobranças, sem reprovação, com o bloco do registro sigiloso), o do celular (sem achado) e a sonda a 390 px depois da troca da rota (o educador vê só que existe; a técnica lê e tira o sigilo com o motivo; nenhum erro). **Não rodou** o relógio adiantado.
**A 288 veio a seguir**, e não foi a setinha: a análise geral de 08/11 pôs os consertos antes do primeiro dado real
na frente (o bloco PRIMEIRO, no alto desta seção).

**FEITO — fase 286** (§2): a Cozinha em resumo por refeição, com a escolha de 07/11 (os dois: o plano de hoje e os
cartões do período). **Função que junta tabelas de várias partições mora em quem já declara ler todas** (`reports`):
a primeira versão ficou em `people` e o `arquitetura.spec` reprovou. **Refeição da casa** é a chamada de alimentação
da 211; sem chamada definida, o plano diz quem define. **Medido nas 285 e 286, juntas:** a `o-plano-do-dia-da-cozinha` (4 de 4), a suíte inteira (1475 de 1475), o `ensaio:uso` sobre o protótipo da 286 (849 cobranças, sem reprovação, com os blocos do Judiciário e o plano da Cozinha), o do celular (sem achado), o `roteiro` (sem reprovação) e as sondas a 390 px (o Judiciário da Alice e da Lara como técnica e educador; a Cozinha como educador e, a 1366 px, como coordenação; nada andando para o lado, nenhum erro). A sonda da Cozinha achou a janta *feita* com zero (a chamada só aberta) e o café do protótipo contando as crianças do acervo; consertados. **Não rodou** o relógio adiantado.
**A 287 veio a seguir** (o sigilo por registro de saúde).

**FEITO — fase 285** (§2): o Judiciário em blocos. **Parte nova de aba que pode esperar o toque** usa o
`BlocoQueAbre` do `Acolhidos.tsx` (título, uma linha do que tem dentro, triângulo); **aviso que precisa de alguém
não entra em bloco fechado** (o da reavaliação ficou à vista). **Ensaio que lê o perfil** passa pelo `abrirBlocos`.
**Medido na 285:** junto da 286, acima.
**A 286 veio a seguir** (a Cozinha por refeição).

**FEITO — fase 284** (§2): os atendimentos técnicos do módulo 08. **Campo novo no atendimento** entra no
`listar`, no `exportar` (o Word) e no `ATENDIMENTOS_TECNICOS` do protótipo; **rota nova no `people.controller`**
confere que o `@RegistroDaRota` continua colado na rota que ele guardava (a 284 o separou da lista, e a Casa 04
recebia 200). **Medido na 284:** a `o-atendimento-da-equipe-tecnica` (10 de 10), a suíte inteira (1469 de 1471; as duas reprovações eram conferências estáticas da própria 284, o JOIN sem justificativa e a exportação sem o `CorpoConferido`, consertadas e conferidas, 32 de 32), o `ensaio:uso` sobre o protótipo novo (846 cobranças, sem reprovação, depois de trocar *Serviço social* e abrir os arquivos pelo cartão), o do celular (322 telas, sem achado) e a sonda a 390 px (a técnica registra um atendimento externo com o local e quem atendeu, junta arquivo e baixa o Word; a coordenação baixa; nenhum erro). **Não rodou** o relógio adiantado.
**A 285 veio a seguir** (o Judiciário em blocos).

**FEITO — fase 283** (§2): a frequência escolar. **Falta não é estado**: o dia de aula sem marca é *ainda não
verificado*, e quem quiser contar ausências conta só as marcadas como *não foi*, com o motivo ao lado. **O dia de
aula sai dos dias da semana do vínculo** (`weekdays`), e a regra mora no `app_marcar_frequencia`, repetida no
`frequenciaDoVinculo` (servidor) e no `frequenciaMock` (protótipo). **Medido na 283:** a `a-frequencia-escolar` (7 de 7), a suíte inteira (1468 de 1468), o `ensaio:uso` sobre o protótipo novo (843 cobranças, sem reprovação), o do celular (322 telas, sem achado) e a sonda a 390 px (o educador marca Foi e Não foi com o motivo no Dia da Casa; a técnica corrige um dia do Kauã com o motivo; nenhum erro). **Não rodou** o relógio adiantado.
**A 284 veio a seguir** (os atendimentos técnicos).

**FEITO — fase 282** (§2): os vínculos educacionais, com as decisões de 06/11 (a frequência marcada pelo educador
no Dia da Casa e corrigida pela técnica e pela coordenação; o aviso do fim à técnica, à coordenação e ao Líder Diurno;
30 e 7 dias fixos; os vínculos na aba Educação em linha, com o triângulo, vários ao mesmo tempo e as notas). **Vínculo
novo de outro tipo** entra na lista `TIPOS_DE_VINCULO` do `educacao.service.ts`, no `CHECK` da `education_link` e no
`TIPOS_DE_VINCULO_MOCK`. **Medido na 282:** a `os-vinculos-educacionais` (7 de 7), a suíte inteira (1460 de 1461; a única reprovação era o `relogio`, que contava nove rotinas, e passou com dez, 6 de 6), o `ensaio:uso` sobre o protótipo novo (843 cobranças, sem reprovação), o do celular (322 telas, sem achado) e a sonda a 390 px como técnica (o Kauã com o ensino médio de manhã e a aprendizagem à tarde, cadastrar, abrir pelo triângulo e corrigir com o histórico dizendo só o que mudou; a tabela das notas não cabia e virou lista; nenhum erro). **Não rodou** o relógio adiantado.
**FEITO — fase 281** (§2): quem escreve na ATA de outro turno. **Regra nova de quem escreve na ATA** mora em
`app_pode_escrever_na_ata` (o gatilho da `ata_note` e a tela leem a mesma) e no `podeEscreverNaAta` do protótipo.
**Suíte que escreve linha na ATA** como educador numa data com escala lançada põe o educador na escala ou escreve
como técnica. **Medido na 281:** a `quem-escreve-na-ata-de-outro-turno` (5 de 5), a suíte inteira (1454 de 1454), o `ensaio:uso` sobre o protótipo novo (838 cobranças, sem reprovação) e a sonda da ATA a 390 px (o educador fora da escala pede, o líder autoriza, a linha passa, nenhum erro). E o do celular (322 telas, sem achado). **Não rodou** o relógio adiantado.

**FEITO — fase 280** (§2): a agenda com o compromisso inteiro. **Medido na 280:** o `agenda` (12 de 12, com o
responsável da data lido pela técnica, que não é a nomeada), o `desmarcar-ocorrencia` e a sonda a 390 px como técnica
(14 dias na grade, o primeiro compromisso com tipo, horário de início e fim, local e responsável, o toque levando ao
dia, nada andando para o lado, nenhum erro). O roteiro da Casa 03 (tarefa 1.10) passou a procurar *sair da casa às*, e
o Word foi regerado. **Próxima: 281**, quem fecha a ATA de outro turno.

**FEITO — fase 279** (§2): a escala em calendário. **Quem conta a escala inteira no ensaio lê a grade** (o
`aria-label` de cada `.escala-dia`), porque só um dia fica aberto. **Medido na 279:** a sonda a 390 px como coordenação
(30 dias na grade, 10 com falta, um dia aberto com o líder, o toque trocando o dia, nada andando para o lado, nenhum
erro). **Próxima: 280**, a agenda com local, endereço, responsável e duração.

**FEITO — fase 278** (§2): O Dia da Casa organizado, pelo módulo 11 da avaliação de 05/11. **Linha nova da linha do
dia** que tem tela de origem ganha a entrada no `ORIGEM` do `Dia.tsx`: o Ver detalhes leva lá, e só lá se edita. **O
filtro novo do Dia** se chama pelo nome no ensaio (`/^Toda a rotina$/`). **Medido na 278:** a sonda no protótipo a
390 px como educador (Pendentes 10 sem nenhum feito, Toda a rotina 15 com 5 em verde, manhã 7, tarde 4, noite 4, uma
linha com Você, o detalhe levando à rotina da casa, nada andando para o lado, nenhum erro). **Ficou para as próximas:**
a escala e a Equipe em calendário (279), a agenda com local, endereço, responsável e duração (280) e quem fecha a ATA de
outro turno (281); juntar o Painel do plantão ao Dia da Casa é decisão de produto (o Painel tem as substituições e o
quadro por pessoa) e vai para a pauta. **Rodando ao fechar este texto:** o `ensaio:uso` inteiro e o do celular sobre o protótipo novo; as conferências do Guia, da Acolhe+AI, das rotas e das recusas passaram (60 de 60).

**FEITO — fases 276 e 277** (§2, PARA-A-REUNIAO §4.41): o funcionamento e as decisões da avaliação de 05/11.
**Nome de outra pessoa numa lista** (quem abriu, quem confirmou, quem decidiu) sai pelo `app_user_display_name`.
**Recorte já escolhido** (dois ou três botões que escolhem o período) leva `aria-pressed`. **Documento inteiro de
terceiro na tela** só ao toque, com a regra num arquivo lido pelo servidor e pelo protótipo e a auditoria sem o
número (`cpf-na-portaria.regra.ts`); a folha impressa da guarita continua inteira, por decisão de 05/11. **Nome
de tela ou de aba que muda** muda também no Guia, no `assistente/guia.ts`, no `acolhe.tsx` (a aba pelo assunto),
no roteiro da Casa 03 (com o Word regerado) e nas cobranças dos ensaios. **Dado novo do protótipo nasce sem a
palavra fictício**: os nomes são inventados e a faixa do alto diz que é demonstração; pessoa, no
`servidor-de-mentira.spec`, é o nome com todas as palavras em maiúscula, e a regra foi provada reprovando um
autor de fora. **A Casa 03 do protótipo tem quinze**: o Caio, o Davi, o Miguel, o Rafa e a Yasmin estão no
acervo; quem conta a casa no protótipo usa o `todosKids()`, nunca o `KIDS`. **Medido nas 276 e 277:** a suíte inteira (1444 de 1449; as cinco reprovações eram desta fase, o nome do Dia na
Acolhe+AI, a rota nova na sondagem de escrita e os números da documentação, consertadas e conferidas, 44 de 44), o
`ensaio:uso` sobre o protótipo (829 cobranças, sem reprovação, depois de ajustar as cobranças que liam *fictício*, o
*Arquivo* e a vida na casa na Geral), o do celular (322 telas, sem achado, depois de a barra de baixo ganhar a forma
curta *Dia da Casa*: o nome inteiro saía cortado a 390 px) e a sonda dos botões que não fazem nada (educador,
Enfermagem e Gestor Geral inteiros; cinco achados consertados). **Não rodou:** o relógio adiantado, o de
acessibilidade (a cor nova é só a borda da aba Vivências) e a sonda inteira da técnica, do Líder Diurno, da
coordenação e do Líder Noturno (a sonda leva mais de uma hora por cargo).
**Próxima: 278**, a organização da avaliação: O Dia da Casa com *Pendentes* e *Toda a rotina*, por manhã, tarde e
noite, com *Ver detalhes* levando ao registro; a Equipe e a escala em calendário; a agenda com local, endereço,
responsável e duração; e quem fecha a ATA de outro turno. Depois, os módulos, na ordem do arquivo da avaliação.

**FEITO — fase 275** (§2): o perfil em ordem, com a data e a hora. **Lista nova com data no perfil** passa pelo
`maisNovoEmCima` de `rotulos.ts` (a tela ordena, nunca confia na ordem que chegou), e **instante na tela** sai pelo
`diaEHora`. **Registro novo de atendimento** leva a hora; quem acrescentar outra anotação ao perfil guarda o instante,
e não só o dia. **Lista que é o que vem** (os próximos compromissos) segue do mais perto ao mais longe. **Medido na
275, até aqui:** a sonda da ordem nas abas (técnica e coordenação, Alice e Bruno: toda lista do mais recente para o
mais antigo), a `o-atendimento-da-equipe-tecnica` (7 de 7, com a ordem no mesmo dia) e as suítes que mandam
atendimento. E o `ensaio:uso` (sem reprovação, com o bloco novo, depois de consertar a cobrança antiga que lia a hora como
ano), o do celular (322 telas, sem achado) e a suíte inteira (1445 de 1445). **Ficou de fora, de propósito:** as
doses no histórico do perfil (são muitas por dia, e moram no Dia e na Saúde).
**E a primeira avaliação humana de 05/11** (`docs/historico/primeira-avaliacao-humana-05-11.md`, PARA-A-REUNIAO
§4.41): o cadastro que não avançava, consertado na 275 (o CPF se confere sozinho, a frase do que falta dentro da barra
dos botões, e o botão da Acolhe+AI que cobria o Continuar). **Decidido em 05/11:** o CPF ao tocar na Portaria, com
auditoria; a demonstração com quinze acolhidos e sem *fictício* nos nomes; *O Dia da Casa*, *Vivências*, *Registro
Educacional* e *Atas do Mês*; e o funcionamento primeiro. **Próxima: 276**, o funcionamento: a confirmação da chamada
com quem e a hora, a data e a hora no alto com a conexão de verdade, os avisos com a data, e os cartões que parecem
botão e não fazem nada; **277** as decisões de 05/11; **278 em diante** a organização e os módulos, na ordem do
arquivo da avaliação.

**FEITO — fase 274** (§2): a foto grande ao tocar, e a foto do familiar. **Rosto novo numa lista** usa o
`AvatarQueAbre` quando há foto, e **visor novo de foto** usa o `FotoAmpliada`, que já fecha pelo X, pelo Esc e pelo
toque fora e não oferece baixar. **Quem mexe na foto** sai do `QUEM_POE_FOTO`, lido pelo servidor, pela tela, pela
Portaria e pelo protótipo; a política da `photo_change` confere o cargo de novo. **Foto trocada ou tirada nunca some**:
a de antes vai para a `photo_change` na mesma transação. **Medido na 274:** a `a-foto-que-nao-se-apaga` (3 de 3), o
contrato de rotas, as rotas sem porta, a Acolhe+AI, o anexo pela câmera, as recusas e o botão que grava, e a sonda no
protótipo a 390 e a 1366 px (abrir, fechar pelo X, Esc e toque fora, pôr, trocar e tirar na criança e no familiar, o
familiar novo com foto, e o educador e o gestor que veem e não mexem; nenhum erro de página), o `ensaio:cabe` da técnica e da coordenação a 390 px (468 estados, 280 voltas, sem achado), o axe no visor aberto nos temas claro, escuro e RS (nenhuma violação) e a suíte inteira (1442 de 1444; as duas reprovações eram as frases da auditoria para a foto tirada, escritas e conferidas). **Não rodou** a suíte inteira de novo depois das frases, nem o relógio adiantado.
**Respondido em 05/11:** o cartão do familiar diz *Editar* (era *Corrigir*) e *Retirar este familiar* (era *Este contato não vale mais*); a folha de editar é a da 215, e o roteiro da Casa 03 e o seu Word acompanharam.
**Próxima: 275**, o pedido de 05/11 da ordem do perfil: em cada aba, cada lista do mais novo para o mais antigo, a
data e a hora em cada anotação de atendimento, e a busca nos atendimentos; a Geral continua com familiares,
documentos e dados. **Medido antes de começar** (sonda no protótipo, técnica, Alice): as visitas, a evolução escolar e
os atendimentos já vêm do mais novo, mas os atendimentos sem hora; a convivência familiar vem misturada; a Saúde não
tem lista com data que a sonda leia.

**FEITO — fase 273** (§2): o que já foi feito fica verde no Dia e na Chamada. **Linha nova da linha do dia diz
`feito`** quando o que ela mostra foi feito, e só então: a tela não adivinha pelo texto do estado (no protótipo, o
`ESTADO_FEITO` do `mock-casa.ts` lê o rótulo, e a `operacao` cobra que os dois concordam). **O verde de feito mora em
`--feito-fundo` e `--feito-borda`**, que seguem o tema; tema novo com fundo verde ganha o reforço do RS e do Verde.
**Medido na 273:** a `operacao` (26 de 26; o teste do feito reprova sem o conserto), as fotos do Dia e da Chamada nos temas claro, escuro, colorido, RS e Verde, e sobre o protótipo novo o de acessibilidade (1155 telas, sete temas, nenhuma violação), o `ensaio:uso` (822 cobranças, sem reprovação) e o do celular (sem achado).

**FEITO — fase 272** (§2): a letra Grande e a Maior cabem no celular e no computador. **A letra é um `zoom` da
página**: o Chromium mede a largura da página SEM o zoom e as caixas COM ele, e a altura pela tela (`vh`, `dvh`) cresce
junto; **altura nova medida pela tela se divide por `var(--zoom-da-letra, 1)`**, e **grade nova com mínimo em px usa
`min(Npx, 100%)`**. **Mudou tela, roda também com `ENSAIO_LETRA=maior`** (o `ensaio:celular` e o `ensaio:cabe` do cargo).
**Fila combinada com a pessoa da Fundação em 05/11:** 273, o que já foi feito fica verde no Dia e na Chamada (conferido no
tema RS e nos sete, com a palavra e o visto junto); 274, a foto grande ao tocar, e pôr, trocar e tirar foto no familiar,
só técnica e coordenação (pergunta aberta: *Este contato não vale mais* virar *Retirar este familiar*).
**Medido na 272, sobre o protótipo final:** o `ensaio:celular` nas três letras, Normal, Grande e Maior (322 telas cada, a 360 e 390 px, sem achado; a Normal prova que a régua nova não inventa), o `ensaio:cabe` com a Maior a 360 px (cerca de 1.200 estados, sem achado) e a 1366 px (1.164 estados e 629 voltas, sem achado depois do conserto das folhas), e o `ensaio:uso` (817 cobranças, sem reprovação). **Não rodou** a suíte do servidor (nada nele mudou) nem o de acessibilidade (nenhuma cor mudou).

**Conferido pelo link em 05/11** (§2, linha 271): a folha de transição datava o documento pelo dia em que foi anexado (hoje *Emitido em*), e o Word do protótipo não levava foto no corpo (hoje leva, como o servidor). **O link do raw.githack não abre daqui** (a rede da sessão o recusa, mesmo liberado depois de a sessão começar): confere-se baixando os mesmos bytes pelo `raw.githubusercontent.com` e servindo como `text/html`.

**FEITO — fase 271** (§2, PARA-A-REUNIAO §4.40): o último contato com a família, e com ela **o pedido de 03/11
(*pense no que eu não pensei*) está feito**: 269, 270 e 271; o 4 (o peso do turno) e o 5 (a prestação de contas)
foram recusados pela pessoa da Fundação (a linha do tempo tem que ser limpa, e o Pão tem financeiro próprio).
**Número de uma criança** mora só no perfil dela, para quem lê a área restrita, sem cor quando ele não diz se algo
precisa de alguém. **Depende da Fundação:** as quatro escolhas da §4.40, a principal a lista que não fiz.
**Medido nas 269 a 271:** a suíte inteira nas DUAS condições de relógio (1439 de 1439), o `ensaio:uso` (sem
reprovação), o do celular (322 telas, sem achado), o `ensaio:cabe` a 390 px da técnica e da coordenação (470 estados e
282 voltas, sem achado), o `ensaio:acolhe` dos mesmos dois cargos (todas as telas e formulários, por texto e por voz) e
a Casa 03 em trinta dias contra o servidor de verdade (onze contas e 327 telas e o esqueci, sem achado; na API, só a
recusa conhecida das vagas; a Acolhe+AI com o modelo, verde); e, depois, o de acessibilidade (1155 telas, sete temas,
nenhuma violação) e o `ensaio:vazio` da técnica, da coordenação e do educador (130 telas com a rede lenta, sem achado). **Próxima etapa:** a mesma de antes do
pedido: a resposta da Fundação à página das direções (254) e a pauta de 21/10, agora com as §4.38 a §4.40.

**FEITO — fase 270** (§2, PARA-A-REUNIAO §4.39): a saída com a história. **Documento que sai da instituição
com a criança** nunca leva nada da área restrita, e a suíte cobra o que NÃO entra, não só o que entra. **Foto que
sai da instituição** vai só com autorização registrada, qualquer que seja o cargo. **Folha que junta perfil e
remédio** mora no `reports`, que lê os dois; o nome de tipo que vem de outro módulo é repetido com teste que
confere (`ROTULO_DA_VIVENCIA`). **Depende da Fundação e do DPO:** as cinco escolhas da §4.39. **Medido na 270:** o
`a-saida-com-a-historia`, o `o-que-entra-volta-inteiro` (os dois Words abertos), o `arquitetura`, o
`a-voz-dos-documentos`, o `a-acolhe-conhece-o-sistema` e a sonda no protótipo a 390 px (as duas folhas pela aba
Documentos e pela folha da saída, sem erro). **Não rodou** ainda a suíte inteira nem os ensaios: rodam no fim da
271. **Próxima: 271**, há quanto tempo a família não visita.

**FEITO — fase 269** (§2, PARA-A-REUNIAO §4.38): o prazo da reavaliação ao Juízo. **Prazo novo que a lei impõe**
segue o desenho do PIA e da reavaliação: a regra num arquivo que não importa nada (lido pelo servidor e pelo
protótipo), a função do banco que repete a conta com teste que confere as duas, a marca de já avisei no módulo
da casa e não no de avisos, e o prazo passado sem aviso. **Data do acolhimento é a do ingresso** da ficha de
entrada (`admission_record.admitted_on`), nunca a do episódio no sistema. **Depende da Fundação:** as quatro
escolhas da §4.38. **Medido na 269:** o `o-prazo-da-reavaliacao` (a conta do banco e a da regra, o aviso uma vez
só, o prazo na área restrita e a recusa ao educador), o `relogio` (nove rotinas), as conferências estáticas e do
banco e a sonda no protótipo a 390 px (a Alice com o prazo chegando, sem erro). **Não rodou** ainda a suíte
inteira nem os ensaios: rodam no fim da 271, que mexe nas mesmas telas. **Próxima: 270**, a saída com a história.

**FEITO — fase 268** (§2): a conferência das 265 a 267 com tudo o que elas deixaram sem rodar, sem defeito e sem
código novo. **Rodada que passa de duas horas se divide por cargo** (`ENSAIO_CARGOS`): o `ensaio:cabe` dos oito cargos
numa vez só foi interrompido no terceiro cargo pelo limite do comando da sessão, e o que ele já tinha medido valeu.
**Medido na 268:** a suíte inteira nas DUAS condições de relógio (1431 de 1431), o de acessibilidade (1155 telas, sete
temas, nenhuma violação), o `ensaio:vazio` (293 telas, sem achado), o `ensaio:cabe` a 390 px nos oito cargos (Coordenação
e Equipe técnica numa rodada, os outros seis em duas: 711 estados e 356 voltas, sem achado), o `ensaio:acolhe` (todas as
telas, subtelas e formulários dos nove cargos, por texto e por voz, e o relatório pela voz), o `roteiro`, o
`uso-celular`, o `ensaio`, o `largo`, o `folhas` e o `ensaio:aparelhos` (sem achado); e, depois do fechamento, o
`ensaio:cabe` no monitor, a 1366 px, que não rodava desde a 255 (oito cargos em três lotes: 1162 estados e 634 voltas, sem
achado). **Não rodou** a simulação contra o servidor (rodou na 267). **Próxima etapa:** a resposta da Fundação à página das
direções (254) e a pauta de 21/10.

**FEITO — fase 267** (§2): a falta de sinal diz o que aconteceu. **Escrita nova que deve sobreviver sem sinal**
vai pelo `apiOuFila`, com tipo no `tipos-offline.ts`; **o resto**, sem sinal, diz *NÃO foi salvo* perto do botão e
mantém o texto no campo. **Frase de sem sinal** mora em `frase-sem-sinal.ts`, lida pelo `api.ts` e pelo protótipo.
**Decidido sem código:** a marca única por pedido no servidor (a sobra da 265) não entra; o único caminho que reenvia
sozinho é a fila, e a marcação da chamada já é única por criança e por chamada. **Medido na 267:** a sonda sem sinal, o `ensaio:uso` (sem reprovação; o Concluí reprova sem a marca), o `ensaio:fila`, a Casa 03 em trinta dias contra o servidor (sem achado) e o `o-botao-que-grava`. **Não rodou** a suíte inteira do servidor nem o do celular.

**FEITO — fase 266** (§2): a recusa perto do dedo, no mesmo `botao-que-grava.ts`. **Recusa nova do servidor** chega
à pessoa sem nada a fazer na tela: se a tela a escreve fora da vista, ela aparece acima do botão. Falta de sinal e
sessão vencida ficam de fora (a fila e a entrada cuidam delas). O `ensaio:uso` imprime no fim cada recusa e onde ela
estava. **Medido na 266:** o `ensaio:uso` (sem reprovação), o do celular (322 telas, sem achado; 44 reprovam com a folga zerada), a sonda da nota repetida, a Casa 03 em trinta dias contra o servidor (onze contas, 327 telas e o esqueci, sem achado) e o `o-botao-que-grava`. **Não rodou** a suíte inteira do servidor (nada nele mudou) nem o de acessibilidade. A sobra da 265 foi decidida na 267.

**FEITO — fase 265** (§2): o botão que grava, num lugar só (`frontend/src/botao-que-grava.ts`, a frase em
`botao-que-grava.regra.ts`). **Escrita nova vai pelo `api()`**, nunca por um `fetch` solto: é ele que segura o botão
tocado e o faz dizer que gravou, e o `o-botao-que-grava.spec.ts` reprova `fetch` novo no `api.ts`. **Botão de gravar
com verbo novo** entra no `FEITO_DO_VERBO`; o `ensaio:uso` imprime no fim os botões que gravaram sem a frase, e por
quê. **Depende da Fundação:** a vibração junto (M12). **Medido na 265:** a sonda com a rede lenta, o `ensaio:uso` (sem reprovação; o bloco novo reprova sem a guarda), o do celular (322 telas, sem achado), a Casa 03 em trinta dias contra o servidor (onze contas, 327 telas e o esqueci, sem achado) e o `o-botao-que-grava`. **Não rodou** a suíte inteira do servidor (nada nele mudou) nem o de acessibilidade (o verde é a cor de estado de sempre).

**FEITO — fase 264** (§2): o servidor no Nest 11.2.8, no `@nestjs/config` 4.0.4 e no Express 5, a pedido de 02/11;
o `npm audit --omit=dev` diz **nenhuma falha**. **O Nest 12 fica para depois do piloto**: ele só roda como módulo ESM,
e o servidor, a suíte, o `tsx` e os scripts de produção são CommonJS. **Versão grande nova muda o padrão que ninguém
escreveu**: confira o corpo que não veio, o curinga das rotas, a consulta e o `trust proxy`, e mande à suíte o pedido
como ele chega (sem `send`, não só com `{}`). **O `multer` sobe pelo `overrides`** enquanto o Nest prender a 2.4.0; o
`body-parser` saiu de lá (o Express 5 traz o 2.x). **Medido na 264:** a suíte inteira nas DUAS condições de relógio (1425 de 1425; a única reprovação adiantada era a linha das Novidades à frente deste cabeçalho), o `ensaio:producao` e a Casa 03 em trinta dias contra o servidor (onze contas, 327 telas e o esqueci, sem achado; na API, só a recusa conhecida das vagas; a Acolhe+AI com o modelo, verde). **Não rodou** nenhum ensaio do protótipo: nenhuma tela mudou.

**FEITO — fase 263** (§2): a verificação completa pedida em 02/11. **Dependência nova ou atualizada passa pelo
`npm audit --omit=dev`**, e a que o Nest prende se sobe pelos `overrides` do `package.json` (desde a 264, `qs` e
`multer`), conferindo depois com a suíte inteira. **Os seis avisos que ficaram abertos fecharam na 264.** **Teste que escolhe data a partir de hoje** confere o tamanho do mês, ou reprova em algum
mês do ano. **Medido na 263:** a suíte inteira nas DUAS condições de relógio (1425 de 1425, depois das dependências
novas), o catálogo do banco, a `varredura-de-pontas`, o `rotas-sem-teste`, o `superficies-sem-teste`, o
`ensaio:ponto-no-tempo`, o `ensaio:producao`, a restauração, o `o-servidor-do-pao` e os ensaios `ensaio`, `largo`,
`fila`, `folhas`, `roteiro` e `uso-celular` (sem reprovação). **Não rodou** a simulação contra o servidor (rodou na 262, e nada de tela
mudou) nem o `ensaio:acolhe`.

**FEITO — fase 262** (§2): a conferência das fases 255 a 261 contra o servidor de verdade, sem defeito. **Medido
na 262:** a Casa 03 em trinta dias (`SIM_CASAS=AI3 … 30`: tudo bate, nenhuma leitura acima de 172 ms; na API, só a
recusa conhecida das vagas; onze contas e 327 telas no navegador, sem achado; a Acolhe+AI com o modelo, dezenove
cobranças verdes), o `ensaio:cabe` a 390 px (1142 estados, 601 voltas, sem achado) e o `ensaio:acolhe` (todas as
telas, subtelas e formulários dos nove cargos). **Não rodou** o `ensaio:cabe` no monitor nem a suíte do servidor
(nenhum código mudou). **Próxima etapa:** a resposta da Fundação à página das direções (254); sem ela, o que sobra
do relatório 5 é o *Registrado às 23:04* no botão, tela por tela.

**FEITO — fase 261** (§2): o vazio que mente por dentro. **Aba nova dentro de uma tela** também espera o dado
antes de dizer *Nenhum…* ou contar zero; o `ensaio:vazio` a acha sozinho pelo `role="tab"`. **Medido na 261:** o
`ensaio:vazio` (31 achados por dentro, nenhum depois: 293 telas de oito cargos), o `ensaio:uso` (sem reprovação), o do
celular (322 telas, sem achado) e o de acessibilidade (1155 telas, sete temas, nenhuma violação). **Não rodou** a
suíte do servidor (nada no servidor mudou), o `ensaio:cabe` nem a simulação contra o servidor.

**FEITO — fase 260** (§2): o vazio que mente, medido. **Lista nova numa tela** só diz *Nenhum…* depois de o dado
chegar (um `carregou` que vira verdadeiro com a resposta), e **busca que falha não vira lista vazia**: diz que não
conseguiu. **Mudou tela, roda o `ensaio:vazio`** (uns quarenta minutos com as abas de dentro; `ENSAIO_CARGOS` para um cargo). **As subtelas
vieram na 261.** **Medido na 260:** o `ensaio:vazio` (57 achados na primeira rodada, 13 na segunda com a régua
do zero, nenhum na terceira: 154 telas de oito cargos), o `ensaio:uso` (sem reprovação), o do celular (322 telas, sem
achado) e o de acessibilidade (1155 telas, sete temas, nenhuma violação). **Não rodou** a suíte do servidor (nada no
servidor mudou), o `ensaio:cabe` nem a simulação contra o servidor.

**FEITO — fase 259** (§2): o que está acontecendo e o que mudou, do relatório 5. **Tela nova que recebe gente de
outra tela** marca o seu cabeçalho com `data-chegou-aqui` (sem a marca, acende o primeiro cartão); **quem leva a
outra tela** chama `marcarChegada()`. **Laço novo** só existe enquanto o estado existe, e com Reduzir movimento
fica parado com a palavra dizendo o estado. **Fica para depois:** o *Registrado às 23:04* no botão (M5), tela por
tela. **Depende da Fundação:** a linha da Chamada (M6) e a vibração (M12). **Medido na 259:** a sonda no protótipo
a 390 px (o aviso leva à ATA e o cartão se acende e apaga em 1,4 s; a busca acende o topo do perfil; o selo e os
pontos animam, e com Reduzir movimento ficam parados; nenhum erro); o `ensaio:uso` (808 cobranças, sem reprovação), o do celular (322 telas, sem achado), o de
acessibilidade (1155 telas, sete temas, nenhuma violação) e o `ensaio:aparelhos` no Pixel 7 (com o ditado e o
microfone, sem achado). **Não rodou** a suíte do servidor (nada no servidor mudou) nem o `ensaio:cabe`.

**FEITO — fase 258** (§2): o movimento que não depende da direção visual, no bloco `O MOVIMENTO` do `styles.css`.
**Movimento novo** usa os tokens (`--mov-*`, `--curva-*`), só `transform` e `opacity`, nada acima de 250 ms, e tem a
versão de Reduzir movimento; **nunca** entra na ocorrência grave, no remédio, na faixa da alergia nem em erro. **O que
falta do relatório 5** (o recado no botão, a linha da Chamada, o número, o realce, a vibração) pede marcação ou
decisão. **Medido na 258:** a sonda no protótipo a 390 px (a tela entra e
termina sem `transform`, a folha sobe e para no lugar, com Reduzir movimento nada se desloca, nenhum erro), o
`ensaio:uso` (sem reprovação), o do celular (322 telas, sem achado) e o de acessibilidade (1155 telas, sete temas,
nenhuma violação). **Não rodou** a suíte do servidor (nada no servidor mudou) nem o `ensaio:cabe`.

**FEITO — fase 257** (§2): os retratos do protótipo refeitos com o gerador da equipe de design. **Quem acrescentar
criança ao protótipo** confere a grade dos retratos (a idade vai junto, e o `RETRATO_A_MAO` do `mock-casa.ts` acerta
os que saírem parecidos). **Depende da Fundação:** rosto desenhado ou silhueta (página da 254). **Medido na 257:** a
grade das vinte crianças e a lista e o perfil abertos a 390 px, sem erro; o `ensaio:uso` (sem reprovação)
e o do celular (322 telas, sem achado).

**FEITO — fase 256** (§2): os pequenos defeitos achados pela equipe de design que não dependem da escolha visual.
**Recado do que a pessoa acabou de fazer** fica onde o olho está (o `recado-da-vez`, acima da barra do pé), e
**botão que depende de um dado que ainda vai chegar** nasce com a tela, para nada empurrar o que já se lê.
**Ficam para a Fundação, com a 254:** a criança conferida na Chamada no lugar ou no fim, a vibração, e os nomes
*Painel* e *Painel das unidades*. **Medido na 256:** a sonda no protótipo (as doses em ordem; o topo do perfil com
208 px ao abrir e depois), o `ensaio:uso` (808 cobranças, sem reprovação) e o do celular (322 telas, sem achado).
**Não rodou** a suíte do servidor (nada no servidor mudou) nem o de acessibilidade (o recado novo usa as cores de sempre).

**FEITO — fase 255** (§2): toda tela cabe, rola e tem volta, medido pelo `ensaio:cabe` nos oito cargos a 390 px e no
monitor. **Folha nova nasce com Fechar ou Cancelar** (a do acompanhamento só saía gravando), **lista que se abre
inteira também se recolhe**, e **o que mostra dado restrito também se fecha**. **Mudou tela, roda o `ensaio:cabe` do
cargo que a usa.** A fase 254 continua em andamento: a escolha da direção visual, na página
`claude.ai/artifact/HEEEViKherDM4Bi77R3LZS` (privada; o dono compartilha). **Medido na 255:** o `ensaio:cabe`
(986 estados a 390 px e 1181 no monitor, nada vazando nem preso; os achados consertados) e, depois dos consertos,
o de acessibilidade (1155 telas, sete temas, nenhuma violação, agora medindo a borda dos campos), o do celular (322
telas, sem achado) e o `ensaio:uso` (808 cobranças, sem reprovação). **Não rodou** a suíte do servidor (nada no
servidor mudou) nem a simulação contra o servidor.

**EM ANDAMENTO — fase 254** (§2): o alto contraste saiu (feito, com o `ensaio:uso` e o de acessibilidade a rodar);
e o pedido de 30/10, *"ainda acho muito feio e amador as telas [...] quero um momento dedicado em melhorar a
qualidade visual de tudo"*: cinco especialistas (direção de arte, design systems, retratos, cor, movimento e
ícones) estudaram as telas e as referências: **os cinco relatórios estão em
`docs/historico/equipe-de-design-30-10/`**, com o gerador novo dos retratos, os tokens de cor e a tabela de
contraste em `anexos/`. A pesquisa recomenda a direção C, *Coração* (viva e expressiva), entre três. **As três direções foram
aplicadas às telas do protótipo por CSS de prévia** e mostradas lado a lado com o de hoje na página de escolha
(`claude.ai/artifact/HEEEViKherDM4Bi77R3LZS`), com as três perguntas: a direção, os retratos com rosto ou em
silhueta, e as cores novas dos cargos (três repetiam o hex de uma cor de estado). **Os CSS de prévia e as fotos
ficaram no scratchpad da sessão**: se ela se perder, o caminho de refazer está no
`docs/historico/equipe-de-design-30-10/2-referencias.md` §3. **Próxima etapa:** a resposta da Fundação; só então
o redesenho, tela por tela, com o `ensaio:celular`, o de acessibilidade, o `ensaio:cabe` e o `ensaio:uso` a cada passo. **Os
retratos ilustrados do protótipo** (`retratos.ts`) foram refeitos na 257.
**Depois da 253, medido na 254:** a Casa 03 em trinta dias contra o servidor de verdade (onze contas e o
esqueci, sem achado, com o percurso novo do dossiê: a técnica anexa e o documento aparece na aba Documentos ao
voltar) e o do celular (322 telas, sem achado).

**FEITO — fase 253** (§2, PARA-A-REUNIAO §4.37): o cadastro, o perfil, os documentos e os menus conferidos, a
pedido de 28/10. **Dado de fábrica do protótipo é das crianças semeadas**: o que o servidor de mentira inventa para
uma criança (escola, PIA, família, visitas, memória, dia) passa pelo `ehNova(k)`, e a criança cadastrada na
demonstração mostra só o que foi registrado; **semeador tardio** (que roda na primeira abertura de uma tela) roda
antes do cadastro. **Depende da Fundação:** onde mostrar a referência familiar escrita no cadastro. **Medido na 253:** os percursos de menus e perfis (oito cargos, 146 telas, 167 abas, 21 perfis e 198 abas, sem achado), o cadastro de ponta a ponta com a coordenação e a técnica, o `ensaio:acolhe` (todas as telas e formulários dos nove cargos), o de acessibilidade (1320 telas, nenhuma violação), a Casa 03 em trinta dias contra o servidor (onze contas, sem achado) as conferências da documentação, o `ensaio:uso` inteiro (sem reprovação, com o bloco *A criança cadastrada pela tela*, que reprovou duas vezes antes dos consertos: a lista de documentos que não lia o dossiê e a volta do dossiê que não relia o perfil), o cadastro de ponta a ponta de novo (21 de 21 com a coordenação e com a técnica) e a suíte inteira nas DUAS condições de relógio (1425 de 1425). **Não rodou** o do celular (a tela só mudou no que relê) nem a simulação depois dos consertos. **Próxima etapa:** a mesma da 247.

**FEITO — fase 252** (§2): as colunas de fim e as tabelas sem leitor, medidas. **Coluna de fim nova** (`*_at`
de fechado, respondido, decidido) nasce com quem a escreve; **tabela nova** nasce com quem a lê, ou com o motivo de
não ter (marca de já avisei, registro que repete a auditoria). **A guarda das colunas MORTAS confere pelo nome**:
coluna morta com nome que outra tabela usa vai com comentário `SEM USO`, como a 1667. **Medido na 252:** as conferências dos documentos (`numeros-da-documentacao`, `documentacao`, `arquivo-tem-saida`, `o-guia-do-sistema`) e a suíte inteira nas DUAS condições de relógio (1425 de 1425). **Não rodou** nenhum ensaio de navegador: nenhuma tela mudou. **Próxima etapa:** a mesma da 247.

**FEITO — fase 251** (§2): o aviso leva a uma tela que quem o recebe abre. **Aviso novo com nível** é
conferido sozinho pelo `todo-aviso-tem-destino`: o nível sai do código (texto fixo, `? :`, laço ou constante com
`push`), os cargos saem das migrações das notificações e as telas, do `alcance.ts`; **nível escrito de outro jeito
reprova** até alguém ensinar a leitura. **Quem tirar uma área do mapa de um cargo** confere antes se algum aviso o
leva lá. **Medido na 251:** o `todo-aviso-tem-destino` (reprova sem o conserto, com o combinado do noturno), o `alcance` e o `o-guia-do-sistema`; a suíte inteira nas DUAS condições de relógio (1425 de 1425), o `ensaio:uso` (sem reprovação, com o Líder Noturno abrindo os Combinados) e o do celular (322 telas, sem achado). **Não rodou** o de acessibilidade (nenhuma cor nova), o `ensaio:acolhe` nem a simulação contra o servidor. **Próxima etapa:** a mesma da 247.

**FEITO — fase 250** (§2): o relato pedido chega a quem deve escrever. **Frase que promete aviso** (*a
Enfermagem é avisada*) se confere contra o `publish` que a cumpre, e **pedido que espera resposta** contra quem
responde e quem é avisado: foi assim que a cobrança de relato apareceu. **Aviso a uma pessoa** vai por
`notice.requested` com `userId`, e não por nível. **Medido na 250:** a suíte inteira nas DUAS condições de relógio (1424 de 1424), com o aviso do relato pedido na `cobranca-de-relato`. **Não rodou** nenhum ensaio de navegador: nenhuma tela mudou, só o aviso que chega ao sino. **Próxima etapa:** a mesma da 247.

**FEITO — fase 249** (§2, PARA-A-REUNIAO §4.36): os caminhos sem fim. **Aviso novo** (`escalation.requested`
com `entity`) ganha a tela e a aba no `ONDE` do `Avisos.tsx`, no servidor e no protótipo; o
`todo-aviso-tem-destino.spec.ts` lê os dois códigos e reprova o tipo sem destino. **Estado novo que nasce
esperando** (como o `retorno_pendente`) nasce com o caminho que o fecha, e a varredura das situações (toda
coluna de estado com os valores listados, contra todo `UPDATE` do código) é a medida. **Evento novo** que
promete alguém avisado tem ouvinte: o `sync.conflict` não tinha. **Depende da Fundação:** a resposta às
sugestões de melhoria e o retorno desmarcado. **Medido na 249:** a suíte inteira nas DUAS condições de relógio
(1423 de 1423), o `ensaio:uso` (792 cobranças, sem reprovação, com o retorno da Helena registrado pela educadora e
lido como *Retorno feito* pela Enfermagem) e o do celular (320 telas, sem achado); a varredura de pontas e a de rotas,
sem candidata. **Não rodou** o de acessibilidade (nenhuma cor nova) nem a simulação contra o servidor. **Próxima
etapa:** a mesma da 247.

**FEITO — fase 248** (§2, PARA-A-REUNIAO §4.35): o dia a dia mais leve, achado fazendo o papel de cada cargo
no protótipo, no celular, às 23h e às 14h (153 telas, nenhum erro de página). **Quantidade nova na tela, no aviso
ou na folha** usa o `quantos(n, 'um', 'varios')` de `backend/src/kernel/common/quantos.ts`, nunca o *(s)*; o
`a-quantidade-por-extenso.spec.ts` reprova. **Lista de cargos que a tela usa para mostrar botão** mora num lugar só e
é importada: a do Painel era cópia da do Dia e ficou para trás na 246. **Medido na 248:** a suíte inteira nas DUAS condições de relógio (1419 de 1419), o `ensaio:uso` (787 cobranças, sem
reprovação, com o pedido de substituição passado pelo Painel) e o do celular (320 telas, sem achado). A primeira rodada
do `ensaio:uso` reprovou sete: seis liam as frases antigas, e uma achou que a tela do Período, sem os parênteses,
passava a dizer *N exceções de*, a forma que a regra da contagem por criança recusa (hoje igual à folha:
*exceções registradas, de N crianças*); e um filtro do ensaio procurava *anexo(s)* e pulava a conferência calado.
**Não rodou** o de acessibilidade (a única cor mudada foi a da regra das doses, de crítico para informação, que
já existe nas telas) nem a simulação contra o servidor. **Depende da Fundação:** as três propostas
da §4.35 (a Portaria em ordem de chegada, a chamada da vez, o histórico recolhido). **Próxima etapa:** a mesma da
247: a pauta de 21/10 e a máquina da Acolhe+AI.

**FEITO — fase 247** (§2, §12.12): o `instalar.sh` confere a Acolhe+AI no computador do Pão, perguntando à
máquina pelo `/v1/models`; seis testes no `o-servidor-do-pao.spec.ts`, com a máquina de mentira num processo à
parte (o `spawnSync` para o Jest enquanto espera). **Quem mexer nas variáveis do motor** muda o serviço e o
instalador juntos: o último teste da suíte confere que os dois leem os mesmos nomes. **Medido na 247:** a suíte inteira nas DUAS condições de
relógio, 1411 de 1411 no relógio real e às 22h30 de Porto Alegre. **Com isso, o código da 239
está todo feito.** **E a varredura de 26/10** (§2, linha 247): a folha das vivências da 237 não tinha suíte, e a
regra das fotos conforme o cargo só era conferida pelo protótipo; hoje a `a-folha-das-vivencias` cobra, lendo de
volta a folha e o Word. **Rode o `rotas-sem-teste.mjs` e a `varredura-de-pontas.mjs` a cada fase que cria rota
ou coluna**: a 237 passou com as duas, e ninguém viu. **Medido na varredura:** a suíte inteira nas DUAS condições de relógio, 1417 de 1417, e o
`superficies-sem-teste.mjs` sem candidata. A primeira rodada adiantada reprovou o dossiê: a suíte nova caiu na
criança dele e somou uma foto sem autorização (a lição da 127, pela quarta vez); hoje ela tira da escolha as
crianças que o dossiê e a foto marcada contam. **Fica de fora, de propósito:** o passo a passo de instalar o modelo no computador (a escrita
foi interrompida por um filtro automático em duas sessões, e é da TI com a máquina escolhida). **Próxima etapa:**
a pauta de 21/10 (PARA-A-REUNIAO §0); a escolha do computador e do modelo é da Fundação e da TI, e quando a
máquina vier, roda-se o `instalar.sh` e o `npm run prova-do-modelo -w backend` nela.

**FEITO — fase 246** (§2, PARA-A-REUNIAO §4.34, relato em `docs/historico/o-que-cada-setor-ve-25-10.md`):
cada setor vê só as suas funções. **Quem acrescentar rota de escrita** na ATA, no Dia, na internação, na Cozinha,
nos combinados, na rotina ou na escala põe `@OGestorSoLe()` nela, ou a escreve com o motivo na lista das livres
do `o-gestor-so-le.spec.ts`, que nega por padrão; e a mesma rota entra no `GESTOR_SO_LE` do `mock-casa.ts`.
**Quem mexer em permissão** roda a medição: `SIM_SETORES=1` na simulação (uma hora e meia; em lotes com
`ENSAIO_CARGOS` e `SIM_SETORES_SAIDA`, e `SIM_SO_NAVEGADOR=1 SIM_SO_SETORES=1` para repetir só ela). **Medido na 246:** a suíte inteira nas
DUAS condições de relógio (1405 de 1405; a primeira rodada adiantada reprovou o teste da fila do aparelho, que
pegava uma atividade qualquer do banco, e a suíte dos downloads escolhia a criança pelo identificador sorteado:
as duas passam a escolher pelo que o teste precisa), o `ensaio:uso` inteiro (com o percurso do gestor lendo a
casa, que achou o *Propor um assunto* que faltava esconder), o do celular (320 telas, sem achado), o
`ensaio:acolhe` (todas as telas, subtelas e formulários dos nove cargos; o gestor foi de 31 para 15 formulários)
e a Casa 03 em trinta dias contra o servidor de verdade (onze contas, 326 telas e o esqueci, sem achado; na API,
só a recusa conhecida das vagas; nenhuma leitura acima de 149 ms; a Acolhe+AI com o modelo, verde). **Não rodou**
o de acessibilidade: nenhuma cor mudou. **Para o
Marcelo conferir:** se o Gestor Geral precisa cobrir casa sem coordenação. **Próxima etapa:** a mesma da 239
(o passo a passo da instalação no §12.12) e a escolha do computador e do modelo.

**FEITO — fase 245** (§2, §8.6): só a Enfermagem ativa o esquema de medicamento (decisão de 25/10 desta
pessoa da Fundação, que troca a de 08/09 só na ativação). **Quem mexer no remédio:** cadastrar é
`CADASTRA_ESQUEMA` no servidor e `app_cadastra_esquema` no banco; ativar é só a Enfermagem, no servidor, na
tela (`ativaEsquema`), no protótipo e no gatilho `app_so_a_enfermagem_ativa`; a educadora continua marcando a
dose dada. **Próxima: 246**, o que cada setor vê (pedido de 25/10): o `ensaio-o-que-cada-setor-ve.mjs`, pela
simulação com `SIM_SETORES=1`, aperta cada botão de cada tela numa conta de cada cargo; o botão que o servidor
recusa sai da tela sem decisão, e o resto vira a lista por setor para a Fundação aprovar antes de esconder.

**FEITO — fases 237 e 238** (§2): o relatório das vivências em Word e o banco de palavras da casa.
**Decisões de 23/10 desta pessoa da Fundação:** as fotos do relatório conforme o cargo, e **a IA só no
computador do Pão, sem custo e sem limite por pessoa** (troca a escolha de 08/10 pelo Claude). **Palavra
nova** entra no `palavras-da-casa.ts`, com teste; palavra comum em relato (como *janta*) não entra.
**FEITO — fase 240** (§2): a primeira das cinco fases das ideias para a Acolhe+AI (pedido de 24/10, *faça tudo*): a resposta aparecendo enquanto é escrita, o guia quando a máquina não responde e o guia do cargo para o modelo do Pão. **Quem mexer na conversa:** a tela chama `/assistente/conversa/aos-poucos` pelo `apiAosPoucos`; a rota de sempre continua para quem pede a resposta inteira, e o modelo de mentira da simulação e das suítes responde nos dois jeitos. **FEITO — 241:** a prova do modelo (`npm run prova-do-modelo`); **frase nova na prova entra com o exemplo bom e o ruim** no `a-acolhe-ai-no-computador-do-pao`. **FEITO — 242:** o plantão (o que eu preciso saber, o rascunho da ATA, as mãos ocupadas); **quem mexer no microfone da Acolhe+AI** nunca religa o microfone com a leitura em voz alta tocando. **FEITO — 243:** os documentos pela conversa e o cuidado com as palavras; **palavra que rotula entra no `palavras-que-rotulam.ts`, com teste**, e a sugestão nunca vira cobrança nem conta de ninguém. **FEITO — 244:** as palavras que a equipe ensina. **Com isso, as dez ideias de 24/10 que não dependem de ninguém estão feitas** (240 a 244). **Medido nas 240 a 244:** a suíte inteira no relógio real (1392 de 1395; as três reprovações eram os números deste arquivo, consertados e conferidos) e o `ensaio:uso` inteiro, à meia-noite de Porto Alegre (756 cobranças, sem reprovação, com a máquina fora do ar, as mãos ocupadas, o cuidado com as palavras e as palavras ensinadas). A primeira rodada noturna achou que a volta da criança semeada no protótipo caía no turno do dia (consertado). **E no fechamento, as rodadas que faltavam:** o relógio adiantado, que reprovou três testes da chamada na primeira rodada: **a suíte do relato da convivência abria uma saída com a família e nunca a fechava**, e quando o Jest a punha antes da chamada a criança aparecia fora da casa (a lição da 127, de novo; reprova também no relógio real, na mesma ordem); hoje ela fecha e confere, e a segunda rodada passou inteira (1395 de 1395). O do celular (320 telas, sem achado) e o de acessibilidade (1312 telas, oito temas, nenhuma violação). O `ensaio:acolhe` achou **a Acolhe+AI abrindo o Relatório completo da internação quando a pessoa pedia para ver a internação da criança**: o botão que a 243 marcou tem a palavra *internação*, que já tinha levado à tela; hoje, com a criança nomeada, o nome da tela não escolhe o botão de dentro (`acolhe.tsx`), e o ensaio passou a medir os dois formulários de dentro da internação (todas as telas, subtelas e formulários dos nove cargos, por texto e por voz). Depois do conserto, o `ensaio:uso` inteiro de novo (sem reprovação) e **a Casa 03 em trinta dias contra o servidor de verdade**: tudo bate, nenhuma leitura acima de 151 ms; onze contas, 329 telas e o esqueci, sem achado; na API, só a recusa conhecida das vagas; e, no fim, a Acolhe+AI com o modelo de mentira, todas as cobranças verdes. **Próxima etapa:** o que falta da 239 (o passo a passo da instalação no §12.12) e a escolha do computador e do modelo, que é da Fundação e da TI. **Ficou de fora, explicado à pessoa da Fundação em 24/10:** ler o remédio e a dose da foto da receita (decisão automática sobre medicação) e guardar a conversa no aparelho (DPO). **Anotado para a Fundação:** a tela troca a frase dos erros 500 do servidor, que já vem em português e diz *NÃO foi salvo*, pela genérica; mudar vale para todas as telas.

**FEITO — fase 239** (§2): o código e a suíte da Acolhe+AI no computador do Pão. **FALTA da 239:** o passo a passo da instalação no §12.12 (a escrita foi interrompida por um filtro automático em duas sessões; fica com a TI). A conferência no `instalar.sh` veio na 247. **A suíte inteira está verde nas DUAS condições de relógio**: 1378 de 1378 no relógio real e com o relógio às 22h30 de Porto Alegre, depois de consertar as duas reprovações da própria 239 (a injeção explícita e as variáveis no `.env.example`). **E, sobre o protótipo novo, os três ensaios que não rodavam desde a 236:** o do celular (320 telas, sem achado), o de acessibilidade (1312 telas, oito temas, nenhuma violação) e o `ensaio:acolhe` (todas as telas, subtelas e formulários dos nove cargos, por texto e por voz). **E a Casa 03 em trinta dias contra o servidor de verdade** (`SIM_CASAS=AI3 … 30`): tudo bate, nenhuma leitura acima de 149 ms; onze contas, 329 telas e o esqueci, sem achado; na API, só a recusa conhecida das vagas; e, no fim, a Acolhe+AI com o modelo de mentira, as dezoito cobranças verdes. **Depende da Fundação e da TI:** qual computador e qual modelo (português, ferramentas e, para foto, visão). **Não medido daqui:** um modelo de verdade. **Quem mexer no motor local:** a tela não muda; a tradução mora no `motor-local.ts` e a suíte `a-acolhe-ai-no-computador-do-pao` cobra os dois sentidos. **Próxima etapa:** o que falta da 239.

**FEITO — fases 234, 235 e 236** (§2, PARA-A-REUNIAO §4.33, comparação em
`docs/historico/comparacao-com-o-andamento-de-outra-ia-22-10.md`): o que a outra IA tinha e nós não, e
que não depende de regra da Fundação: a leitura do papel no aparelho, o cadastro pelo papel conferido,
os gráficos e a planilha do período, e a Acolhe+AI tratando o anexo como papel. **Quem mexer na leitura:**
o `ocr.ts` é importado só no toque, e tudo do trabalhador vai numa peça (no `file://` ele não carrega
outra); rode a sonda do `ensaio:uso` (*O texto do papel*). **Gráfico novo** entra como `grafico` na
folha, e não como imagem. **Depende da Fundação:** as cinco linhas da §4.33 (o peso do protótipo, a
planilha nos outros relatórios, a árvore da família, a IA local, a guarda e o depósito). **Próxima
etapa:** a mesma da 227.

**FEITO — fase 233** (§2, PARA-A-REUNIAO §4.32): até 10 anexos por mensagem na linha da ATA, no
diário da internação, na ocorrência, no atendimento técnico e na Acolhe+AI, e a rodada de testes
dos downloads e anexos, que achou e consertou cinco defeitos. **Regra nova para quem mexer em
anexo de mensagem:** o limite mora em `anexos-da-mensagem.regra.ts` (servidor e tela leem a
mesma), a tela usa o `AnexosDaMensagem` (e não um `EscolherAnexo` solto) e o envio vai numa
transação só. **Exportação nova entra no `o-que-entra-volta-inteiro`**, que nega por padrão contra
os controladores e abre cada Word; rode com `DOCUMENTOS_DIR` e abra os arquivos no LibreOffice.
**Próxima etapa:** a mesma da 227.

**FEITO — fase 232** (§2): o perfil em oito abas, com a Vida na casa no fim da Geral e a aba
Documentos no lugar da Cadastro, abrindo no dossiê e na lista. **Quem acrescentar coisa ao
perfil** confere a ordem dentro da aba (o `ensaio:uso` mede o dossiê e a lista antes de quem mexeu).
**Próxima etapa:** a mesma da 227.

**FEITO — fase 231** (§2, PARA-A-REUNIAO §4.31): o Guia do sistema, primeiro item do menu.
**Regra nova, a pedido da Fundação: toda fase ensina o Guia.** Tela nova ganha a linha do que
a Acolhe+AI faz nela em `COM_A_ACOLHE`; aba nova do perfil entra em `ABAS_DO_PERFIL_NO_GUIA`; e
**a fase fecha com a linha dela no alto de `NOVIDADES`**, com o que muda para quem usa. O
`o-guia-do-sistema.spec.ts` lê a fase do cabeçalho deste arquivo e reprova sem ela. **Depende da
Fundação:** a portaria com ou sem o Guia. **Próxima etapa:** a mesma da 227.

**FEITO — fase 230** (§2, PARA-A-REUNIAO §4.30): a explicação do alto das telas recolhida, a
pedido de 19/10, sem tirar ferramenta nenhuma. **Texto novo que explica a tela** vai numa
`<Explica>`, e não num `<p className="mutetxt">` solto: a caixa decide sozinha se recolhe. **O que
não pode esperar um toque** (alerta, recado de que gravou, número do dia) não entra nela, e o
`a-explicacao-recolhida.spec.ts` reprova `c-crit`, `c-warn` e `c-ok` recolhidos. **Depende da
Fundação:** as três outras saídas da §4.30 (histórico recolhido, ações num botão só, avisos e
ajustes juntos), se a equipe ainda achar a tela cheia. **Próxima etapa:** a mesma da 227.

**FEITO — fase 229** (§2, §8): a conta da saída com a família agora fica dentro da receita (medications/1659,
com os dois casos no `as-doses-que-vao-junto`). **Conta nova de remédio** pergunta ao catálogo quem mais lê os
horários (`pg_proc.prosrc ILIKE '%medication_schedule%'`) e segue a grade da casa (`app_generate_doses`), que é a
que a casa confere todo dia. **Próxima etapa:** a mesma da 227.

**FEITO — fase 228** (§2, §8): o que as 225 a 227 deixaram sem medir. **Achou no servidor de verdade** a conta
das doses que vão com a criança, que contava os dias e não os horários (medications/1658, com teste que confere o
número). **No protótipo**, a folha dos remédios da saída inventava a criança e o remédio, e o Word das outras casas
não passava pela troca de nomes; o `servidor-de-mentira.spec.ts` cobra as duas coisas. **Quem mexer na simulação:**
os limites de espera do banco ficam desligados em tudo o que roda sob o relógio de mentira (`SEM_LIMITES` no
`simulacao-da-casa.sh`). **Próxima etapa:** a mesma da 227.

**FEITO — fases 225, 226 e 227** (§2, §12.0, PARA-A-REUNIAO §4.29): as oito casas no protótipo,
cada uma com a sua equipe, crianças e famílias; seis meses de história em todas as telas; e o
caminho até o ar em ordem, com o instalador, o serviço, o proxy e o banco de demonstração prontos.
**Quem mexer no protótipo:** dado novo entra no `mock-casa.ts` e vale nas oito casas; a Casa 03 é a
casa-modelo e os ensaios entram por ela; o que soma casas mora no `mock.ts`. **Depende da Fundação:**
as cinco escolhas da §4.29, a primeira delas onde o sistema roda. **Próxima etapa:** a mesma, agora
com a lista em ordem: as decisões da etapa 1 do §12.0, a máquina, o treino com o banco de
demonstração, e o roteiro com a equipe.

**FEITO — fase 224** (§2, §12.12): a Acolhe+AI aberta inteira, a tela, o servidor com a chave e
um modelo de mentira local, no fim da simulação da casa (`frontend/ensaio-acolhe-modelo.mjs`;
`SIM_SO_NAVEGADOR=1 SIM_SO_ACOLHE=1` repete só ele). **Mexeu na Acolhe+AI, rode a simulação**: é o
único lugar em que a tela e o servidor dela conversam com um modelo. **Próxima etapa:** a mesma, o
roteiro com a equipe e a implantação do §12; das escolhas da §4.28, a resposta aparecendo
enquanto é escrita é a próxima que eu faria, se a Fundação quiser.

**FEITO — fase 223** (§2, §12.12, PARA-A-REUNIAO §4.28): a Acolhe+AI mais firme, com a hora,
o turno e o primeiro nome. **Regra nova para quem mexer nela:** nada que muda no meio da conversa
vai nas instruções do servidor (vai na nota do momento), e a tela nunca edita mensagem já mandada;
o `ensaio:uso` e o `a-acolhe-ai.e2e.spec.ts` cobram. **Depende da Fundação:** as quatro escolhas da
§4.28 (a leitura em voz alta, que já existe e começa desligada; guardar a conversa no aparelho, DPO;
a resposta aparecendo enquanto é escrita, que é a próxima que eu faria). **Não medido daqui:** o
modelo de verdade. **Próxima etapa:** a mesma, o roteiro com a equipe e a implantação do §12.

**FEITO — fase 222** (§2, PARA-A-REUNIAO §4.27): os testes de voz, ditado, câmera e galeria por
modelo de celular, simulados. **Ditado novo usa o `iniciarDitado`**, que já trata o Android, o Safari
e as falhas; **câmera nova pede só a largura**, nunca largura e altura juntas. **Depende de alguém
na Casa 03:** as cinco tarefas da §4.27 num Android e num iPhone de verdade, com o sistema no
servidor com HTTPS. **Próxima etapa:** a mesma, o roteiro com a equipe e a implantação do §12.

**FEITO — fase 221** (§2, PARA-A-REUNIAO §4.26): o perfil como ferramenta de trabalho, a
pedido de 14/10. **Bloco novo do perfil entra na aba do assunto**, e o que é do dia de hoje
não entra no perfil: vai para o Dia, a Chamada ou a ATA. **Número novo de criança** vai na
`numeros-da-crianca.service.ts`, lido com a identidade de quem pede, e devolve `null` (nunca
zero) onde o cargo não lê. **Depende da Fundação:** as cinco escolhas da §4.26. **Próxima
etapa:** o roteiro com a equipe (agora com a 1.13.1 e a 3.13.3) e a implantação do §12.

**FEITO — fase 220** (§2, §12.4.1, PARA-A-REUNIAO §4.25): a resposta ao *"não quero
perder nada"*. Quatro camadas para o servidor próprio do Pão: o **arquivo contínuo** do
banco (perda máxima de um minuto), a **base semanal** conferida pelo `pg_verifybackup`, a
**volta a qualquer minuto** e a **cópia das fotos e documentos** de cinco em cinco minutos, que
só acrescenta. O `npm run ensaio:ponto-no-tempo` prova tudo num banco à parte, e a tela da
Implantação mostra três sinais novos (arquivo contínuo, base, cópia). **O arquivo que a
pessoa anexa vai ao disco antes da resposta** (`gravarNoDisco`: nome provisório, `fsync`,
troca de nome). **Depende da Fundação e de quem cuidar do servidor:** dois discos espelhados
(RAID 1), o lugar da cópia fora da sala do servidor e quem roda o ensaio todo mês.
**Próxima etapa:** o roteiro com a equipe e a implantação do §12, agora com o §12.4.1 pronto.

**FEITO — fase 219** (§2, §12.4.1, PARA-A-REUNIAO §4.25): o banco mais robusto, medido no
catálogo e cobrado por `o-banco-com-as-duas-travas.e2e.spec.ts`, que nega por padrão:
tabela sem chave ou RLS, política de escrita que confere só a linha de antes, UPDATE
concedido sem política, chave estrangeira sem índice, conexão sem limite de tempo e
migração aplicada que mudou. **Migração aplicada não se edita**: mudança vai em arquivo
novo; comentário corrigido roda com `MIGRACAO_ACEITAR_EDITADAS=1`. **Depende da Fundação e
de quem cuidar do servidor:** quanto de plantão se aceita perder (o WAL contínuo) e onde
fica a cópia fora do servidor. **Próxima etapa:** a mesma, o roteiro com a equipe e a
implantação do §12.

**FEITO — fases 215 a 218, o pedido de 14/10** (§2, PARA-A-REUNIAO §4.24): os
familiares se corrigem com o motivo e o antes guardado (215); a área restrita do
Judiciário guarda a guia, as decisões e o relatório de acolhimento (216,
`DocumentosDaCategoria`, a categoria judicial do dossiê); o laudo e a receita ficam junto
da alergia, da condição e da restrição, e os remédios dela aparecem no perfil com as
receitas (217, `AnexosDoRegistroDeSaude`, `RemediosEReceitas`); e a equipe técnica registra
o atendimento com o desenho, que entra como fonte restrita do acompanhamento (218,
`technical_session`, regra em `atendimento-tecnico.regra.ts`). **Depende da Fundação:**
quem lê o atendimento técnico (escolhi técnica, coordenação e gestão). **O roteiro da Casa 03
acompanhou:** a tarefa 3.8 esperava encerrar e recadastrar o contato e agora espera o
*Corrigir*, e entraram a 3.13.1, a 3.13.2 e a 4.8.1 (Word regerado). **Anexo novo no
perfil** vai pelo dossiê quando é documento da criança, e por tabela própria só quando
pertence a um registro que não é documento (o atendimento). **Próxima etapa:** o roteiro
com a equipe e a implantação do §12; se vier código, pedido novo.

**FEITO — fase 214** (§2): as recusas do servidor e do protótipo sem travessão nem frase
que argumenta, cobradas por suíte. **Recado novo de recusa** diz o que fazer e quem faz; o
porquê da regra mora no documento. **Próxima etapa:** o roteiro com a equipe e a implantação
do §12; se vier código, pedido novo.

**FEITO — fase 213** (§2): a simulação de trinta dias da Casa 03 contra o servidor, que
ficou sete fases sem rodar, conferiu as chamadas da casa e achou a casa aberta sem nome para
quem não tem casa de trabalho (consertado). **Rode a simulação a cada fase que muda tela**
(a lição da 190, de novo).

**FEITO — fase 212** (§2): as telas falam como colega. **Frase nova de tela** diz o que
fazer e quem faz, sem defender a regra, sem falar *do sistema* na terceira pessoa e sem
travessão que argumenta; o `ensaio:celular` reprova as marcas (*o sistema não*, *não
existe*, *de propósito*, *não é medição*...). **Com isso o pedido de 12/10 está feito**
(206 a 212). **Próxima etapa:** a mesma de antes do pedido: o roteiro com a equipe e a
implantação do §12.

**FEITO — fase 211** (§2, PARA-A-REUNIAO §4.23): as chamadas da casa com nome, horário,
pessoas e cor. **A cor da casa é a quarta cor do sistema** e mora em `cores-da-casa.ts`:
nunca pílula, nunca fundo.

**FEITO — fases 209 e 210** (§2, PARA-A-REUNIAO §4.22): as fotos com quem aparece e a
miniatura, e o *O dia, em ordem* com cor, legenda e mais curto.

**FEITO — fase 208** (§2, PARA-A-REUNIAO §4.21): o perfil em abas coloridas. **Quem
escreve ensaio sobre o perfil** usa o `conteudo()` e o `clicar()` do `ensaio:uso`, que
passam pelas abas sozinhos; e **bloco novo do perfil entra numa aba**, nunca solto (o
*Memórias* ficou solto e aparecia em todas). **Próxima: 209**, as fotos.

**FEITO — fase 207** (§2, PARA-A-REUNIAO §4.20): a saída das crianças pelo portão.
**Muda uma regra de 09/09** (quem decide); a Fundação confirma se o Gestor Geral fica de
fora e se a portaria vê o *pode ir a*. **Próxima: 208**, o perfil em abas coloridas.

**FEITO — fase 206** (§2): o calendário das ATAs e dos plantões, na Passagem e no Arquivo
da ATA, com o livro fictício desde 01/07 no protótipo. **O pedido de 12/10 continua**, e a
ordem combinada é: **207** a autorização de saída e a portaria (a regra de 1020 dizia que
quem decide é a técnica ou a coordenação; o pedido de 12/10 diz educador, líder,
coordenação e técnica), **208** o perfil em abas coloridas com os Atendimentos, **209** as
fotos (marcar quem aparece em vez de reconhecer o rosto: é dado biométrico de criança),
**210** a legenda e o aperto do *O dia, em ordem*, **211** as chamadas editáveis por casa
com cor, **212** a varredura dos traços de raciocínio nas frases das telas.

**FEITO — fase 205** (§2, PARA-A-REUNIAO §4.19, relatório em `docs/historico/oito-casas-seis-meses-vinte-pessoas-12-10.md`):
a Acolhe+AI testada setor por setor outra vez, e as oito casas com vinte pessoas por seis meses usando o
sistema e ela. **Depende da Fundação:** conferir as frases novas da Acolhe+AI (portão, choro, família,
colega que faltou) contra o protocolo da casa. **O que falta para ir ao ar** está no relatório, e é tudo
do §11 e do §12: onde roda, HTTPS, SMTP, cron, backup provado, a chave da Acolhe+AI, os nomes das casas,
os dados de partida e a LGPD, a folha de remédio de papel, e o roteiro com a equipe. **Rode a simulação
com `SIM_EQUIPE=20` quando a mudança tocar a instituição**: com nove pessoas por casa, as duas telas
lentas não apareciam.

**FEITO — fase 204** (§2): cada setor usado de ponta a ponta, conferindo se o registro de um
chegava aos outros. Cinco defeitos do protótipo (a alergia que não saía do perfil, os plantões
fixos e de antes da regra de 25/09, a ATA sem caixa de linha, o armário que não baixava com a
dose, o toque em Acolhidos) e um do sistema de verdade (o vencido como validade próxima); o
`ensaio:uso` ganhou o bloco *De um setor ao outro*. **Limite que fica, só no protótipo:** de
madrugada, registros semeados com hora fixa do dia aparecem à frente.

**FEITO — fase 203** (§2): a Acolhe+AI deixa de prometer formulário antes de abri-lo. Era o
ponto menor que ficou da 201, na portaria.

**FEITO — fase 202** (§2, PARA-A-REUNIAO §4.18): o perfil do acolhido revisto. O que protege
a criança voltou para o alto (alergia, restrição, cuidados, remédio de hoje), os compromissos
dela chegam ao perfil, e um índice leva a cada parte. **Depende da Fundação:** as ocorrências
da criança no perfil, só para técnica e coordenação. **Para crescer:** o perfil continua uma
página longa; agrupar em abas (hoje, família, saúde, escola, trajetória) é decisão de desenho.

**FEITO — fase 201** (§2, PARA-A-REUNIAO §4.17): a Acolhe+AI como colega de plantão. Fiz o
papel de cada setor, com as frases do plantão, e o modo guia falhava justamente na urgência e
nos limites da Fundação. Agora a proteção vem antes da tela, o não vem com o porquê, e as
conversas viraram teste (`a-acolhe-conhece-o-sistema.spec.ts`, *o modo guia atende como colega
de plantão*). **Depende da Fundação:** conferir a frase de urgência contra o protocolo da Casa
03. **Não medido daqui:** o modelo de verdade nessas mesmas frases (as regras foram para o
`assistente/guia.ts`). **Para crescer:** no modo guia ela não lê dado nenhum, então *"tem dose
atrasada?"* e *"a Gabi tomou a insulina?"* levam à tela certa sem responder; com a chave, quem
responde é o modelo.

**FEITO — fase 200** (§2): a Equipe e o Painel das unidades no desenho da 198. A **Equipe**
virou cartões de pessoa com o círculo do cargo, e a foto do antes achou dois defeitos da
tabela (botões cortados na borda e o *você* por cima do e-mail). O **Painel das unidades**
virou uma grade de casas na ordem do código, com a ocupação contra o próprio limite e as
contas em blocos. **Com isso, a frente visual pedida em 11/10 está feita.** O que vier de
visual daqui em diante é pedido novo.

**FEITO — fase 199** (§2): a Saúde e as Ocorrências no desenho da 198. Na **Saúde**, cada dose é
um cartão com a hora, o rosto da criança e o remédio, e o rosto chega à triagem, aos esquemas e
ao resumo de saúde. Nas **Ocorrências**, o dia em bloco e o caminho das quatro etapas
(registrada, etapa operacional, análise, fechada). **A lista das ocorrências continua sem
rosto e sem nome, de propósito**: quem está envolvido aparece só nos detalhes. A Equipe e o
Painel vieram na 200.

**FEITO — fase 198** (§2): o visual repensado. **Retratos ilustrados fictícios** no
protótipo (`frontend/src/retratos.ts`, desenho e nunca rosto realista), o **rosto** na lista dos
acolhidos, nos contatos e em quem visitou (`frontend/src/avatar.tsx`, com `temFoto` na lista e
nas visitas do servidor), o **perfil com retrato grande**, a **coluna lateral** mais leve (o item
aberto continua preenchido, decisão de 27/09) e a **linha do dia como linha do tempo** (trilho,
ponto da categoria, traço do agora). A Saúde e as Ocorrências vieram na 199.

**FEITO — fase 197** (§2): o tema **Rio Grande do Sul**, o oitavo, com o verde, o vermelho e
o amarelo da bandeira na faixa do topo, no fundo e nos azulejos da navegação, e o verde como
marca. O vermelho e o amarelo da bandeira **não chegam às pílulas**, onde são crítico e atenção.

**FEITO — fase 196** (§2, §12.12): a Acolhe+AI dentro do perfil da criança e de toda subtela.
**Botão novo que só ENTRA num registro** (abre o detalhe, o dossiê, um acervo) ganha
`data-acolhe-entra`, com o clique só mudando estado (a leitura vai num efeito): o mesmo
teste cobra. **Não medido daqui:** o modelo de verdade e a voz de verdade. **Para crescer:**
o desempate pela linha vale para o nome escrito ao lado do botão; registro sem o nome à vista
(o plantão em que a pessoa assinou) ela acha experimentando, até quatro.

**FEITO — fase 195** (§2, §12.12): o relatório pela voz, o rascunho que se confere antes
de guardar, o ditado em todo campo e a cobertura da Acolhe+AI medida cargo por cargo. **Para
o DPO:** o ditado em todo campo amplia o uso do reconhecimento do navegador (áudio ao
Google no Chrome). **Não medido daqui:** o modelo de verdade redigindo o relatório e a voz
reconhecida de verdade. **Rode o `ensaio:acolhe` a cada fase que muda tela**: ele acha
sozinho a tela e o botão novos.

**FEITO — fase 194** (§2): a câmera do sistema, com X e ✓, o documento digitalizado em PDF
em todo lugar que recebe anexo, a câmera na Minha conta e o botão de câmera da Acolhe+AI.
**Depende de HTTPS** na implantação (a câmera pelo sistema não liga sem ele; o anexo cai na
câmera do aparelho e no arquivo). **Não testado daqui:** um celular de verdade. **Para
crescer:** achar a borda do papel e endireitar a perspectiva (pede biblioteca de visão, peso
no protótipo: decisão de custo).

**FEITO — fase 193** (§2, §5 item 11, §12.12): a Acolhe+AI sempre em dia, humanizada,
preenchendo a tela com licença e fazendo contas e tabelas. **Toda fase, daqui em diante,
ensina a assistente** (a regra do §5 item 11, cobrada por teste). **Para ela crescer:**
os 36 botões de criação seguros estão marcados (o complemento de 09/10 marcou os dez
que faltavam); os que ficaram sem marca são de remédio, de texto que tem de ser da própria
pessoa, de decisão sobre a criança ou sensíveis, e **abrir algum deles é decisão da
Fundação** (PARA-A-REUNIAO). Falta conferir com o modelo de verdade, ligada a chave, o
roteiro do §12.12. **Botão novo de criação nasce marcado**, ou fica de fora com motivo.

**FEITO — fase 192** (§2, §12.12): a Acolhe+AI. **Depende da chave na instalação**
(`ANTHROPIC_API_KEY`) e do registro da decisão com o DPO (o texto e os anexos vão à
Anthropic; o microfone do Chrome manda o áudio ao Google). **Para ela crescer:** mais
ferramentas de proposta (hoje: linha na ATA, documento no dossiê, sugestão) e mais
rotas no catálogo de leitura, sempre com teste. **A TI ainda não tem cargo próprio**
(o `admin_tecnico` lê as sugestões pelo banco, mas não tem tela); o pedido de um
*cargo total* para quem alimenta o sistema é decisão em aberto, e esbarra na regra 5.

**FEITO — fase 191** (§2): as decisões de 08/10 — a receita e a vacinação avisam
antes de vencer, e o aviso fora do sistema também no computador. **Do lembrete de
prazo, ficaram sem aviso, por decisão, a matrícula e o curso.**

**FEITO — fase 190** (§2): os itens 1 e 2 da análise de 06/10 — o aviso no celular
que não saiu tenta de novo, e as telas das fases 185 a 189 abertas contra o servidor
de verdade, numa simulação de trinta dias da Casa 03, que achou três defeitos (§2,
linha 190). **Rode a simulação a cada fase que muda tela**: ela ficou dez fases sem
rodar, e o servidor pelo `tsx` passou essas dez fases sem subir.

**FEITO — fase 189** (§2, §12.11): o aviso no celular, a ideia 2 de 30/09. **Depende
da implantação** (as chaves, o HTTPS e a saída para os serviços de push), e a
primeira entrega num celular de verdade se confere lá. **Das ideias de 30/09 sobram
a 6 (ditado, DPO), a 7 (resumo com IA, DPO) e a 10 (teste com gente de verdade)**;
a 8 foi recusada. Nenhuma anda sem uma decisão, e as duas primeiras são do DPO.

**FEITO — fase 188** (§2): a entrada com e-mail e senha e o esqueci minha senha pelo
e-mail; as duas etapas da 187 saíram por completo, a pedido. **O esqueci depende do
SMTP institucional (§12.8)**: sem ele o e-mail não sai, e quem administra a conta
continua redefinindo pela Equipe.

**FEITO — fase 186** (§2): o que mudou desde o meu último plantão, a ideia 1 de 30/09.

**FEITO — fase 185** (§2, §12.10): a saúde da implantação, a ideia 9 de 30/09.

**FEITO — fase 184** (§2): o sistema aberto no celular, cargo por cargo, com a barra
no pé e o topo numa linha (escolhas de 05/10). **Mudou tela, roda o `ensaio:celular`.**

**FEITO — fases 179, 180 e 181** (§2): os defeitos da análise de 30/09, o aviso de
meia hora antes do fim do plantão e as decisões 1, 2, 3 e 11 do §10. **Não sobra
defeito de código conhecido, nem pedido de código que não dependa de alguém.** O que
depende: a decisão 5 do §10 (a grade para a parede, escolha da casa), a fila do
aparelho cifrada (DPO), o Drive de verdade (decisão), os marcadores de fralda e
mamadeira (a casa confirmar), o pente-fino semanal (o dia da semana, §10.5) e o
diário estruturado da internação (os campos).

**PRÓXIMA ETAPA:** aplicar o roteiro com a equipe e a implantação do §12 (onde roda,
endereço, certificado, SMTP, conta do relógio, as DUAS linhas do cron e, desde a 189,
as chaves do aviso no celular). Se vier código, a Fundação escolhe entre as ideias do
§9 (*As ideias de 30/09*): a 1 (186), a 2 (189), a 3, a 4, a 5 (183) e a 9 (185) já são
código, a 8 foi feita e recusada (187/188), e **as que sobram (6, 7 e 10) não andam sem
alguém de fora**: o DPO para o ditado e o resumo com IA, e duas pessoas da Casa 03
para o teste com gente de verdade.

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
- **Instante do banco não volta do JavaScript igual** (190). O `Date` tem
  milissegundo e o `timestamptz` tem microssegundo: o instante que ia ao
  servidor e voltava como chave não casava com linha nenhuma, e o resultado de
  TODO envio do aviso no celular ficou sem gravar, com a suíte verde. Instante
  que é CHAVE vai e volta como texto (`::text`). E a suíte só viu quando passou
  a **ler de volta o que foi gravado**: a lição da 149, de novo.
- **O que só roda pelo `tsx` não é testado pela suíte** (190). O `ts-jest` e o
  `tsc` gravam o metadado de tipo; o `tsx` não. Um construtor sem `@Inject`
  subia na suíte e no compilado e caía no `npm run dev` e na simulação, por dez
  fases. Hoje há teste que lê o código. **E a simulação que não roda não acha
  nada**: ela é que viu, no primeiro dia em que voltou a rodar.
- **Efeito colateral não mora em inicializador** (190). O `StrictMode` roda o
  inicializador do `useState` duas vezes no desenvolvimento: o que lia o
  convite e o apagava da barra perdia o convite na segunda. O que acontece uma
  vez acontece quando o arquivo carrega.
- **Duas rodadas que recriam o banco não rodam juntas** (190). Soltei a segunda
  simulação sem conferir que a primeira tinha acabado (ela caiu na partida e
  seguiu para o navegador), e as duas mediram o mesmo banco ao mesmo tempo.
  Resultado de rodada sobreposta se descarta inteiro.
- **Assistente com acesso próprio é conta compartilhada** (192). O pedido foi
  *"poder total"*; a Acolhe+AI age com o acesso de quem conversa, e não por
  promessa: ela não tem caminho até o dado, quem lê é a tela da pessoa. Quando uma
  ferramenta nova precisar de dado, **o caminho é uma rota que a tela já usa**, nunca
  uma consulta do servidor da assistente.
- **O nome do botão não diz se ele grava** (193). *"Abrir ocorrência e avisar"*
  grava; *"Registrar um episódio"* só abre a folha. Permissão de apertar por lista de
  verbos seria a lista escrita à mão da 153: a assistente só aperta o que a tela
  MARCOU (`data-acolhe-abre`), e o teste lê o clique de cada marcado. **E camada também
  é contrato**: a faixa da assistente nasceu abaixo da folha aberta (z-index 45 contra
  50), e só o ensaio, clicando de verdade, viu que o Parar não se tocava.
- **Erro de conexão sem ouvinte derruba o processo inteiro** (194). O `pg` emite
  `error` na conexão que o banco encerra, e o Node mata a API se ninguém ouvir: um
  reinício do banco viraria sistema fora do ar no plantão. A simulação viu; a suíte não,
  porque o banco dela nunca reinicia. **O que derruba o servidor se testa derrubando**:
  o `o-banco-que-reinicia` encerra as conexões de propósito. E **log que o próprio script
  sobrescreve no fim apaga a prova**: a causa daquela queda se perdeu assim.
- **Duas cópias da mesma biblioteca nativa não conversam** (194). O pdf.js traz o
  `@napi-rs/canvas` dele, e o servidor usava outro: a foto desenhada numa cópia e colada
  na tela da outra corrompia a memória, e o processo morria calado. O `paginasDoPdf`
  "nunca lança" e devolveu *falhou* educadamente por fases inteiras, em todo PDF
  escaneado. **Falha que é engolida de propósito precisa de teste que a cobre do lado
  feliz**, com o dado de verdade: foi a primeira foto de câmera, e não a suíte, que viu.
- **Cobertura se mede pedindo, e não lendo a lista** (195). O teste estático da 193 dizia
  que toda tela estava no guia, e estava; pedindo de verdade, cargo por cargo, cinco pedidos
  falhavam: a palavra *melhoria* desviava *me leva para as Sugestões de melhoria*, *ata*
  casava dentro de *data*, e pedido sem verbo de criar não abria nada. **Estar no catálogo
  não é ser alcançável**: a medição tem de fazer o caminho de quem pede.
- **O limite escrito no relatório é o próximo trabalho** (196). A 195 terminou dizendo que os
  formulários de dentro de um registro ficavam fora da conta; medidos, nenhum era alcançável
  pelo guia, e o *Registrar compra* da Saúde, atrás de uma aba, também não. **E comentário que
  cita a marca pelo nome conta como marca**: o teste que lê o código não distingue, e não deve.
- **Bloco novo entra no lugar dele, não no topo** (202). Doze fases puseram o seu bloco "logo
  depois da identificação", cada uma com bom motivo, e o comentário que dizia *"PRIMEIRO, e sem
  precisar rolar"* ficou embaixo de todos. **Ordem de tela é contrato**: quem acrescenta uma parte
  ao perfil confere o que estava em cima e por quê, e mede a posição (`getBoundingClientRect`),
  porque o comentário não se move junto.
- **Cobertura não é ajuda** (201). O `ensaio:acolhe` dizia que a Acolhe+AI alcançava todas as
  telas e formulários, e alcançava; fazendo o papel da educadora com as frases do plantão, *"o
  Kauã fugiu"* recebia *"não achei essa tela"*. A medição pedia pelo nome da tela, e ninguém no
  plantão fala assim. **Assistente se testa com a frase de quem está com pressa**, e o primeiro
  pedido a medir é o do pior momento do turno.
- **O servidor de mentira tem de ler o que ele mesmo grava** (204). O mock guardava a alergia
  nova numa lista e a Saúde, a Enfermagem e a Cozinha liam outra, a semeada: no protótipo,
  que é o que o Marcelo abre, a alergia registrada não saía do perfil. Cada tela, sozinha,
  passava no ensaio. **Ensaio de um setor só não vê o que não chega ao outro**: o percurso
  leva o registro de um setor e o procura nos outros. E **dado de demonstração com hora fixa
  mente em alguma hora do dia**: os plantões fixos estavam certos às 14h e errados às 3h.
- **Abrir um registro é trazer TUDO o que é dele** (206). O Arquivo abria a ATA de outro
  dia trocando só o plantão, e o texto das seções continuava o da ATA aberta antes: a data
  de um dia em cima do texto de outro, no sistema de verdade, desde a fase do Arquivo. Os
  outros três caminhos que abriam ATA faziam certo, cada um com a sua cópia das três linhas.
  **Quem abre registro por um caminho novo usa a função que já abre**, e não refaz metade dela.
- **O banco é um só, e a suíte o recria** (205). Rodei um arquivo de teste do Jest com a simulação
  das oito casas no ar, e o `globalSetup` recriou o banco embaixo dela: a primeira casa sumiu e a
  rodada morreu. A regra já estava escrita aqui; **simulação no ar, nada do Jest**, nem um arquivo só.
- **Volume que não cresce não mede** (205). As oito casas viveram um ano na 177 com nove pessoas
  cada, e nada passou de 582 ms; com vinte pessoas, em seis meses, a equipe das oito e o dia das
  unidades passaram de um segundo. **Ensaio de carga se faz com o tamanho da casa**, e a pergunta feita
  pessoa por pessoa só aparece quando há pessoas.
- **Frase de tela se mede aberta, não no código** (212). No código há mais de mil
  travessões, quase todos em comentário; abrindo as telas de todos os cargos eram 137
  frases, e só umas 90 argumentavam. E metade delas vinha do SERVIDOR e do protótipo ao
  mesmo tempo: reescrever só a tela deixaria o protótipo dizendo uma coisa e o sistema
  outra. **Frase do servidor se troca nos dois lugares, na mesma vez.**
- **Política trocada à mão não sobrevive ao Jest** (219). Para provar que o teste
  reprovaria sem a migração, voltei a política antiga no banco e rodei a suíte; ela
  passou, e passou de novo, porque o `globalSetup` recria o banco e reaplica as
  migrações antes de tudo. **Prova com a regra antiga se faz fora do Jest**, direto no
  banco, com o papel da aplicação. E foi essa prova que corrigiu o diagnóstico: levar o
  registro para outra casa já era recusado (o UPDATE que lê colunas passa a linha nova
  pela política de LEITURA); o que passava era trocar o AUTOR.
- **Sob o `faketime`, o Postgres não tem temporizador** (219). `SET statement_timeout='1s';
  SELECT pg_sleep(4)` não é cortado na rodada do relógio adiantado. O teste do limite de
  espera ficou esperando para sempre, segurou a trava da linha, e o teste seguinte (a
  migração, por `spawnSync`) ficou preso nela: a suíte inteira parou sem reprovar.
  **Teste que espera o banco cortar tem guarda próprio** (cancela a consulta presa) e diz
  por que não mede sob `FAKETIME`; e **`spawnSync` em teste leva `timeout`**, porque ele
  para o Jest inteiro enquanto espera.
- **O aparelho simulado acha o que a tela simulada não acha** (222). O `ensaio:celular` media a tela
  a 360 e 390 px havia trinta fases e nunca rolou uma folha até o fim: a barra Cancelar e Registrar
  cobria o último campo de todo formulário no celular. E o microfone falso de todos os ensaios se
  comportava como o Chrome do computador: o Android repete o texto, o Safari para a cada frase, e
  ninguém via. **Imite o aparelho, não só o tamanho dele**: a câmera com a proporção dela, a voz com o
  jeito de cada navegador, e a folha rolada até o último botão. E prove que o teste reprova sem o
  conserto, tirando o conserto.
- **O que muda não vai nas instruções** (223). O raciocínio do modelo vale só na conversa exata
  em que nasceu, e as instruções da Acolhe+AI levavam a tela aberta e a data: trocar de tela no
  meio da conversa invalidava tudo o que ela pensou antes, e o modelo de mentira da suíte nunca
  diria isso. **Instrução fixa, conversa que só cresce**; o que muda vai na mensagem da pessoa.
  E a pergunta que dá erro se desfaz inteira: tirar só ela deixava resposta sem pergunta.
- **Sob a simulação, a hora não separa uma rodada da outra** (224). O relógio do `faketime`
  recomeça do mesmo instante a cada vez que o banco e o servidor sobem: a auditoria da rodada
  nova tinha hora ANTERIOR à da rodada de antes, e o ensaio contou zero linhas. O que separa
  as rodadas é o que já estava lá (os ids), nunca o relógio.
- **A troca de texto não sabe o que o texto é** (226). A cópia de cada casa troca, na saída,
  os nomes da casa-modelo pelos dela, e "AI3" pelo código da casa. Na linha da Casa 03 que a
  cópia da Casa 04 devolvia para o painel, o "AI3" virou "AI4", e o painel achou duas linhas
  da Casa 04 e pegou a errada. **Quem junta respostas de várias casas pede o dado cru**, sem a
  troca, e a troca fica só para o que a pessoa lê.
- **Sob o relógio de mentira, os limites de espera do banco mentem** (227). O Postgres encerrava por *transação parada*
  sessões paradas havia zero segundo, e a escala das oito casas voltava 500. Eu disse primeiro que era o pulo de horas da
  agenda, mudei o limite para um dia, e a falha voltou igual: a explicação estava errada e o conserto não consertava.
  **Antes de chamar de defeito o que só a simulação viu, repita com o relógio real** (3.840 plantões em 15 s, sem falha); e
  **antes de escrever a causa, reproduza no menor caso** (um dia só repetiu, e o `pg_stat_activity` mostrou o zero segundo).
  E o conserto vale para tudo o que roda sob o mesmo relógio: na 228, os dois servidores do navegador, com o relógio
  parado, ainda tinham os limites ligados e deram seis falhas iguais.
- **Quem lê o arquivo decide a sintaxe dele** (227). O `.env.example` tinha comentário depois do valor, e o `bash` o
  tira; o systemd, que entrega o `.env` ao serviço instalado, não. Em desenvolvimento tudo passava, e no servidor a sessão
  nasceria sem duração. **Arquivo que vai para a máquina se confere lido pelo programa que o lê lá.**
- **Recolher texto também esconde o que protege** (230). A primeira frase de cada explicação
  parecia o bastante, e o `ensaio:uso` reprovou três telas: a visita mostrava o número sem dizer
  que quem avalia é a equipe técnica, e a folha da atividade perdia o *não é avaliação da
  criança*. **Encurtar é decisão de conteúdo, não de tamanho**: a frase que diz o que o número
  NÃO é vai junto do número, e a regra (`FRASE_QUE_PROTEGE`) é que garante, não a minha leitura.
- **O teste com nome de promessa** (228). A suíte *"a folha conta as doses"* conferia só que a resposta era uma
  lista, e a conta das doses multiplicava os horários por zero desde a 1050: o remédio de duas vezes ao dia ia
  pela metade para a casa da família. **Teste que promete um número confere o número**, montado com o caso que
  erra (dois horários, dias diferentes da semana). E o protótipo tinha a mesma folha com a criança escrita à mão:
  nenhum ensaio a abria, e ela envelheceu sem ninguém ver.
- **Documento se confere aberto, no programa de quem recebe** (233). Os Words passavam em toda
  suíte, que olhava o status, o base64 e o XML; abertos no LibreOffice, **toda imagem saía cortada
  numa faixa fina, o timbre inclusive**, em todos os documentos desde que existem: a entrelinha
  dizia 360 sem dizer o tipo, e o LibreOffice lê isso como altura exata. Hoje a suíte abre cada
  Word (`o-que-entra-volta-inteiro`) e cobra o tipo da entrelinha; **e a pessoa que abre olha a
  página**: foi a foto da página, e não o teste, que mostrou a faixa.
- **Botão que registra e não entrega** (233). O Exportar dos benefícios gravava a finalidade na
  auditoria e devolvia só um aviso: a tela dizia *Registrar e exportar*, e ninguém recebia papel. O
  teste cobrava o 201 e a linha de auditoria, que existiam. **Exportação se testa pelo arquivo que
  sai**, e a lista das exportações se confere contra os controladores, negando por padrão.
- **Suíte que abre internação confere que fechou** (233). As duas suítes novas encerravam a
  internação com o campo errado, o encerramento devolvia 400 calado no `afterAll`, e a suíte
  seguinte não achava criança livre na Casa 04. Hoje o encerramento que falha reprova a suíte. É a
  lição da 176 pela terceira vez: **o que a suíte abre no banco compartilhado, ela fecha e confere**.
- **O que roda por dois cliques não é o que roda servido** (234). A leitura do papel passou no
  sistema servido e morreu no protótipo aberto por `file://`: ali o trabalhador não carrega uma
  segunda peça de blob. Foi a sonda no navegador, abrindo o arquivo como o Marcelo abre, que viu.
  **O protótipo se prova aberto por dois cliques**, e recurso novo do navegador se mede lá.
- **Largura em porcentagem é sugestão para o LibreOffice** (236). O gráfico saiu certo no XML e
  espremido no papel: o rótulo numa coluna de três letras. Quadro do Word leva largura fixa e a
  grade escrita. É a lição da 233 de novo: **documento se confere aberto**.
- **O padrão do framework também é contrato** (264). O Express 4 deixava `{}` no pedido sem
  corpo, e o 5 deixa `undefined`: cerca de cinquenta rotas de escrita dariam 500 depois da
  troca, com a suíte verde, porque ela mandava `{}` e nunca um pedido sem corpo. **Teste o
  pedido como ele chega**, e prove que o teste reprova tirando o conserto.
- **O toque duplo só aparece com a rede lenta** (265). No protótipo a resposta vem em 120 ms e nenhum
  ensaio tocava duas vezes: a linha repetida na ATA só apareceu com a pausa alongada (`__pausaDoPrototipo`).
  **E o ensaio que conta o resultado espera a tela reler**: a ATA relê a lista consulta por consulta, e a
  primeira contagem, feita cedo demais, disse zero linhas onde havia uma.
- **Conferência que nunca acusa pode não estar rodando** (266). A do fim da tela atrás da barra do
  pé passou por dezenas de rodadas sem achado: ela perguntava se a `nav.tabbar` era fixa, e desde que
  a barra ganhou o invólucro `.navegacao` a resposta era não, e o bloco inteiro era pulado. Só apareceu
  porque a conferência nova, ao lado, também não reprovou com a folga zerada. **Prove que reprova**,
  sempre, tirando o que ela protege.
- **O zoom muda a régua, e o processo filho sobrevive ao pai** (272). Com a letra aumentada, a largura da
  página sai sem o zoom e as caixas saem com ele: a régua antiga acusaria tudo ou nada, e foi conferida primeiro
  numa página de três linhas. E um `pkill` no `bash -c` da medição velha deixou o `node` dela vivo, escrevendo
  no mesmo arquivo da medição nova: 75 achados que eram do protótipo de antes do conserto. **Antes de ler um
  resultado, confira quem está escrevendo nele** (`pgrep -f` e o `ENSAIO_ARQUIVO` de cada um), e cada rodada
  escreve no seu arquivo.
- **Frase de tela que envelhece é frase que mente**, e a cobrança do ensaio que a
  guarda tem de ser reescrita junto. A ressalva do painel sobre nota escolar já foi
  reescrita três vezes. **Isto inclui este arquivo.**

### O que é do Marcelo, e não é código

- **O tronco passa a ser o `main`** (decisão do dono, 08/11), e quem o cria é o dono, no
  GitHub: a sessão do Claude só empurra para branches `claude/...`. Os passos estão no item 3
  das decisões, no alto do *O que fazer agora*. Depois de criado, empurre para os dois
  (`git push origin HEAD:main HEAD:claude/work-system-code-ready-0e3hh2`), se o proxy deixar.
- **O `master` ficou para trás** na fase 149 e está inteiro dentro do branch atual: apagá-lo
  não perde nada.
- **Para abrir o sistema:** o protótipo é um arquivo só,
  `prototipo/rede-acolher-prototipo.html`. Baixar do GitHub em *Download raw file*
  e dar dois cliques; não instala nada, não precisa de banco, dados fictícios. O
  sistema de verdade está no §12.3 do documento.
  **Endereço fixo, sempre na última versão** (pedido de 05/11, para a reunião no Pão):
  `https://kanaitzin.github.io/fundacao/`, publicado pelo workflow
  `.github/workflows/prototipo-no-ar.yml` a cada protótipo novo neste branch; só o arquivo
  do protótipo sai, com `noindex`. **Ligado em 05/11** pela conta kanaitzin (*Settings →
  Pages → Source: GitHub Actions*; só ela vê a aba *Settings*). Primeira publicação no ar
  no mesmo dia. A rodada do workflow aparece pelas ferramentas do GitHub desta sessão,
  que também a disparam (*run_workflow*); o `github.io` não abre daqui.
  **Link público, sem login** (pedido de 28/09; o repositório é público):
  `https://raw.githack.com/kanaitzin/fundacao/<commit>/prototipo/rede-acolher-prototipo.html`,
  com o commit do protótipo que se quer mostrar. Fica preso àquela versão: a cada
  protótipo novo, manda-se o link com o commit novo. Há também uma cópia em
  `claude.ai/artifact/A5uBh6iCWJqAv9Ek2UbGAY`, republicada do mesmo arquivo, que só
  abre para quem o dono liberar em *Compartilhar* e onde baixar Word não funciona.
- **Para dar corda por outra conta do Claude:** nada mora na conta — está tudo no
  repositório, inclusive o `.claude/hooks/session-start.sh`. Na outra conta,
  conecte o GitHub, instale o app do Claude no `kanaitzin/fundacao`, abra a sessão
  no branch padrão e escreva *"leia o `docs/REDE-ACOLHER.md` e siga o §9"*. **Empurre
  antes de trocar:** o contêiner é descartado com a sessão.
