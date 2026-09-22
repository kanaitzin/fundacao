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

## O primeiro trabalho desta máquina — FEITO

**A chamada não fecha quando alguém da casa está fora dela.** ✅ **Corrigido na
fase 127**, em 20/09/2026. A migração `1350` pôs num lugar só a resposta para "de
quem esta chamada trata" (`app_efetivo_da_chamada`, por DIA e não por agora); as
três funções `SECURITY DEFINER` ganharam o `search_path` por extenso; e a suíte
`quem-a-chamada-cobra.e2e.spec.ts` guarda o defeito com cinco testes — medida
sem a correção, ela reprova. O relato está no §2 e no §9 do documento.

**A lição que vale para a próxima sessão, e não é sobre a chamada.** O defeito
existia e **nenhuma suíte o cobria**: `hospitalization` e `family_stay` chegam
vazias do seed, então nenhuma encontrava alguém fora da casa. As "3 falhas em
`conferencia-de-mesa`" que o documento registrou eram o eco de um rascunho que
morava em `backend/test/` e deixava uma internação aberta. **Suíte que abre
ausência fecha a ausência** — um banco só, e nada se apaga. A
`quem-a-chamada-cobra` tem rede de segurança no `afterAll` por isso.

## O que fazer agora

O §9 do documento manda. **O Grupo 1 está vazio** — não falta código para o
piloto —, e as três decisões que estavam paradas viraram código nas fases 134,
136, 137, 138 e 139. **Mas a conferência de 22/09 reabriu a lista**, e ela está
no §9, na seção *"A conferência de 22/09"*. **As três coisas que faltavam foram
feitas** — dia e horário de visita na portaria e o motivo ao retirar autorização
nas fases 142 e 1500; o educador no Arquivo de ATAS na 143. **As duas decisões que eram dela chegaram
em 22/09 e viraram a fase 144:** toda retirada da escala — e toda substituição —
passou a exigir motivo escrito, e o Líder Diurno passou a ler a ocorrência
protegida, com a leitura deixando linha de auditoria para TODOS os cargos.
**A seção não tem mais nada aberto — e a §10.2 também caiu**, respondida em
22/09 por um lado que eu não previra: *"todos leem a ata coletiva, seja manhã ou
noite"*. A fase 145 abriu a linha desta casa na ATA Geral para todo cargo que
cuida dos acolhidos, e criou o **pedido de leitura** da observação restrita —
*"a pessoa pode solicitar ler alguma coisa, e cabe à equipe deixar ou não"*.

1. ~~**As telas que as respostas de 20/09 destravaram**~~ ✅ **as três, feitas.**
   §10.7 — de onde a técnica escolhe as fontes — na **134**; §10.6 — *"gestor
   abrir o que quiser"*, uma porta opaca por relato, com finalidade e registro
   próprios — na **136**; e o conceito educacional por bimestre, digitado pela
   equipe técnica, pela coordenação e pelo Líder Diurno, na **137**, contado no
   painel do Gestor na **139**.
2. ~~**A dedução da escala sai**~~ ✅ **feito na fase 129.** Sem escala lançada,
   ninguém é nomeado; a tela diz em vermelho que ninguém a lançou; e a ATA sem
   escala E sem nenhuma passagem fecha COM pendência, que é o buraco que a
   decisão abria.
3. ~~**As pontas dormentes**~~ ✅ **fechadas nas fases 132 e 133.** Eram cinco; a
   `work_schedule` morreu nas 129 e 131, o "se necessário"
   (`prn_reason`/`prn_outcome`) ganhou porta de registro na 132, e a 133 ligou a
   `health_evolution.companion_name` e declarou MORTA a
   `handover_receipt.opened_handover`. **Sobra a `medication_authorization`**, e
   ela é dormência por DECISÃO escrita (§8.6) — a de 08/09 trocou autorização de
   pessoa por marcação de medicamento —, não por esquecimento. Removê-la é
   migração destrutiva, e não se faz de passagem.

   **A lição das 129 e 131, que continua valendo para qualquer afirmação sobre
   dado morto:** eu disse duas vezes que a `work_schedule` estava morta antes de
   estar, porque procurei os leitores nas migrações do módulo em que estava
   mexendo. **Ponta dormente se mede pelo repositório INTEIRO, nunca por leitura
   de migração** — `CREATE OR REPLACE` espalha a verdade por vários arquivos, e
   um leitor em TypeScript não aparece em consulta ao catálogo nenhuma. Foi assim
   que a `medication_authorization` sobreviveu a uma varredura minha. Hoje há
   teste que cobra a frase por tabela E por coluna, olhando funções, políticas de
   RLS, visões e o código do servidor (`arquivo-tem-saida.spec.ts`).
4. **Aplicar o roteiro com a equipe.** Continua sendo o que mais muda o sistema,
   e o único que não se faz daqui.
5. ~~**A §10.2**~~ ✅ **respondida em 22/09 e feita na fase 145.** A 143 tinha
   deixado a ATA Geral fora de quem não a lia **de propósito**, para não responder
   de carona uma pergunta da Fundação — e a resposta veio: *"todos leem a ata
   coletiva, seja manhã ou noite"*. Com ela vieram o **pedido de leitura** da
   observação restrita (liberação por ATA e por pessoa, revogável, com motivo dos
   dois lados) e a Enfermagem no arquivo.

   **A lição da 145, e ela é de contagem de cópias:** a lista de quem lê a ATA
   Geral existia em TRÊS lugares — o banco, o serviço e a tela — e eu ampliei só a
   do banco. Por meia hora o protótipo dizia a verdade e o produto dizia o
   contrário. **Antes de ampliar uma lista de cargos, conte quantas cópias dela
   existem** — há teste que cobra as três iguais, lendo o catálogo e os dois
   arquivos de TypeScript.

   **E a outra, que é sobre limpar teste:** a `ata` tem gatilho que recusa DELETE
   e a `ata_note` é IMUTÁVEL. Quando a suíte não tem como desfazer o que cria, a
   saída **não** é desligar o gatilho — é pôr a fixação onde ninguém olha (a de
   145 mora quatrocentos dias atrás, fora de toda janela de consulta).

   **E a lição da 141, que é a da 127 de novo e por isso importa:** *"quem está na
   casa hoje"* era uma pergunta feita em quatro lugares; a 1350 juntou três e
   **esqueceu a grade do dia**, porque `routine_item` chega vazia do seed e
   nenhuma suíte gerava item individual. **Superfície sem dado de partida é
   superfície sem teste** — quando uma tabela chega vazia do seed, a pergunta não é
   "passa?", é "o que nunca foi exercitado?". Hoje a resposta mora num lugar só,
   `app_ausente_da_casa(pessoa, dia)`, e regra nova de ausência se escreve lá.

   **A varredura de pontas virou script na fase 140** (`varredura-de-pontas.mjs`)
   e a última medição não tem candidato novo: 1352 colunas, 539 nomes. Rode-o
   antes de afirmar que algo está morto — e leia a saída sabendo que ela diz
   *candidato*, porque `SELECT *` devolve a coluna sem nomeá-la. *Foi ele que
   revelou, de passagem, que a folha da Evolução oferecia um tipo que o banco não
   aceita: quem registrasse vacina recebia 500.*

**E uma coisa que é do Marcelo e não é código:** o branch padrão do repositório
ainda é o `claude/work-system-code-ready-0e3hh2`. O `master` está em dia, com
tudo; trocar é um clique em *Settings → General → Default branch*, e não há
ferramenta nesta sessão que o faça.

**A lição transversal das últimas fases, e vale para qualquer frase deste
repositório:** a ressalva do painel sobre nota escolar já foi reescrita TRÊS
vezes — *"não existe conceito"*, depois *"existe e o painel não conta"*, depois
*"o painel conta assim"*. **Frase de tela que envelhece é frase que mente**, e a
cobrança do ensaio que a guarda tem de ser reescrita junto, senão ela passa a
guardar a mentira. Isto inclui este arquivo: ele voltou desatualizado numa sessão
e dizia que duas decisões estavam paradas quando já eram código.
