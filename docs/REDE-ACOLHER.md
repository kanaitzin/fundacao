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
| `der.md` | as 114 tabelas com o que cada coluna guarda. É referência de dado, não narrativa, e o `documentacao.spec.ts` cobra que toda tabela apareça lá |
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
14. [Como começar uma sessão nova](#14-como-começar-uma-sessão-nova)

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

**Fases 0 a 131.** Estes números **saem do código**, não da memória — e são
cobrados por `test/numeros-da-documentacao.spec.ts`, que existe porque em 08/09
seis afirmações estavam erradas ao mesmo tempo em três documentos, e duas delas
discordavam entre si.

| Quanto | De onde sai |
|---|---|
| **18 partições** isoladas | pastas em `backend/src/modules/` |
| **130 migrações** | `.sql` dentro das partições |
| **114 tabelas** | `CREATE TABLE` nas migrações |
| **85 suítes** | `backend/test/*.spec.ts` |
| **837 testes** | `it(` / `test(` nas suítes |
| **36 telas React** | `frontend/src/screens/*.tsx` |
| **11 rotas sem porta** de tela | lista de exceções do `rotas-sem-porta.spec.ts` |
| **6 ensaios de navegador** | scripts `ensaio*` do `frontend/package.json` |
| protótipo com **≈1297 KB** | `prototipo/rede-acolher-prototipo.html` |

*A frase importa: o conferidor lê o NÚMERO colado ao substantivo. Escrever
"Telas React … 31" numa coluna separada faz o teste passar sem conferir nada —
foi assim que "30 telas" sobreviveu à fase que existiu para acabar com isso.*

*E o outro lado da mesma regra, que apareceu na fase 127: **registro histórico
de uma rodada antiga não pode colar o número no substantivo**, senão o
conferidor o lê como afirmação sobre hoje e reprova com razão — e está certo,
porque uma frase sobre o passado com o número colado é indistinguível de uma
mentira sobre o presente. A saída é separá-los: em vez de `N suítes e M testes,
em tal dia`, escreva "todas as suítes e todos os testes — N e M, os números de
então". O conferidor continua cobrando o que descreve o sistema, e para de
cobrar o que descreve um dia. **Este parágrafo obedece à própria regra:** ele
fala de contagens sem colar nenhuma, de propósito.*

**Medidos rodando, e por isso fora do conferidor:**

| Ensaio | Resultado |
|---|---|
| `npm run ensaio` | 132 telas nos **sete** cargos oferecidos — Coordenação 28, Técnica 25, Gestor 26, Líder Diurno 17, Líder Noturno 14, Educador 13, Enfermagem 9. A Cozinha saiu do seletor em 09/09: o cargo continua no banco, oculto |
| `npm run ensaio:acessibilidade` | 139 telas, **nenhuma violação de WCAG 2.1 AA** |
| `npm run ensaio:roteiro` | 49 tarefas do roteiro, **todas com porta no cargo certo** |
| `npm run ensaio:uso` | 247 cobranças em 19 blocos, **todas passando** — e todos os cargos completando o percurso. O bloco 14 nasceu na fase 107 e cresceu na 108: abre as prévias e cobra que o olho devolva uma **imagem**, e não o nome de um arquivo — e que a lista diga **antes do clique** se o documento está no sistema ou no Drive |

### A última verificação inteira

**20/09/2026 — a verificação da mudança para o Claude Code.** Nada foi
construído; o repositório foi conferido inteiro antes de mudar de casa. `tsc`
limpo nos dois lados, **os seis ensaios de navegador limpos** (132 telas nos
sete cargos, 139 sem violação de WCAG 2.1 AA, as 49 tarefas do roteiro com
porta, os 19 blocos do ensaio de uso, a fila offline e as folhas), e o protótipo
**reconstrói byte a byte igual** ao arquivo entregue — mesmo md5.

**E a suíte não é verde nas duas condições de relógio.**

| Relógio | Resultado |
|---|---|
| real (13h de Porto Alegre) | **tudo verde** — suítes e testes, 77 e 768, que eram os números daquele dia |
| deslocado para as **22h** (`faketime -f '+7h'`, banco e processo juntos) | **3 falhas** em `conferencia-de-mesa.e2e.spec.ts` |

> **20/09/2026, à noite, no repositório aberto no Code — esta linha do relógio
> estava errada, e é preciso dizer como.** O defeito da chamada **é real**, e foi
> reproduzido aqui: o lote marca a criança internada (uma linha em
> `check_result` onde deviam ser zero) e a chamada final devolve **400** em vez
> de fechar. Mas ele **não depende do relógio**, e **nenhuma suíte o cobre.**
>
> Quem o mostra é o rascunho guardado em
> `docs/historico/fase-127-repro-da-chamada.e2e.spec.ts.txt`, e o cabeçalho dele
> já dizia: *"com o relógio normal"*. Ele **cria a própria internação**. É por
> isso que nenhuma suíte o pega sozinha: `hospitalization` e `family_stay`
> **chegam VAZIAS do seed** — no dado de partida ninguém está fora da casa.
>
> As "3 falhas em `conferencia-de-mesa`" foram o rascunho, que naquela hora
> morava em `backend/test/`, contaminando o banco compartilhado para as suítes
> que rodaram depois dele. Medido nesta máquina, com o rascunho fora: **77
> suítes e todos os testes verdes nas duas condições** — relógio real, e às 22h30 de
> Porto Alegre com o banco sob o mesmo `faketime` (UTC já em 21/09, instituição
> ainda em 20/09), cache do `ts-jest` quente e frio, em série. Posto de volta em
> `backend/test/`, ele reprova sozinho, no relógio normal, em dois segundos.
>
> **E uma segunda coisa medida aqui:** `npx jest` **pelado** não serve. Há um
> banco só e um schema `public` só, e as suítes não limpam o que deixam — em
> paralelo elas se contaminam. Nesta máquina, de 4 CPUs: cache quente passa,
> **cache frio reprova três testes** (20 acolhidos que viram 21, a chamada que
> devolve 400, a dose vencida que avisa uma vez só). O `npm test` já traz o
> `--runInBand`; é por ele que se roda. É o mesmo mecanismo da linha acima, e o
> mesmo da lição da fase 126: um banco compartilhado, e a ordem decidindo o
> resultado.
>
> **O que isso muda no primeiro trabalho a fazer:** antes de mexer na migração
> `1350`, o rascunho precisa virar teste de verdade com nome próprio em
> `backend/test/` — senão a correção não tem como provar que corrigiu, e o
> defeito volta sem ninguém ver. O §2 passa a ter um número a mais quando isso
> acontecer, e é para isso que existe o `numeros-da-documentacao.spec.ts`.

### 20/09/2026, fase 127 — a chamada fecha

**A migração `1350` entrou, e o rascunho virou suíte com nome:
`quem-a-chamada-cobra.e2e.spec.ts`, cinco testes.** A ordem foi essa, e importa:
o teste primeiro, porque correção que não pode provar que corrigiu é promessa.

*Medido sem a correção, para saber que a suíte guarda alguma coisa:* o lote marca
**20** onde a tela mostra **19**. Com ela, os cinco passam.

**O que a suíte cobra**, além das duas metades do defeito (a criança internada
que o lote marcava como tendo almoçado, e a chamada final que não fechava):

- a **convivência familiar** pela mesma porta — era a segunda ausência que as
  três funções do banco não conheciam;
- a **alta devolve a criança no mesmo dia**, porque *o dia da alta é dia de
  casa* (0890) — quem recebe alta às dez almoça aqui;
- e a promessa central da `1350`: a chamada responde **pelo DIA a que se
  refere**, não por "agora". A chamada de ontem, reaberta hoje, sabe como a casa
  estava ontem.

**As quatro funções `SECURITY DEFINER` sem `search_path` eram três, e estão
fechadas** — `app_bulk_check`, `app_confirm_check` e `app_check_missing`, com o
`SET` por extenso em cada uma. `app_efetivo_da_chamada` **não** é definer, de
propósito: chamada de dentro das outras lê como dona; chamada pelo serviço, lê
sob o RLS do educador, que é o que a consulta em linha fazia antes.

**E as "sete outras falhas, em cinco arquivos" que o branch anunciava não
existem.** Com o `search_path` no lugar e o rascunho virado suíte que **fecha o
que abre**, a suíte inteira passa. As sete eram do mesmo mecanismo de sempre: um
banco compartilhado e um rascunho que deixava uma internação aberta.

*A suíte nova tem uma rede de segurança no `afterAll`, por SQL de dono, que
encerra qualquer internação ou saída que um teste falho tenha deixado aberta. É
a lição do dia escrita em código: nada se apaga neste sistema, e uma ausência
esquecida tira uma criança da Casa 03 para todas as suítes seguintes.*

O que as três dizem: **o lote da conferência marca 19 crianças e a tela lista
18.** Quem a chamada cobra está escrito em quatro lugares — `checks.service.ts`,
`app_bulk_check` (0780), `app_confirm_check` e `app_check_missing` (0440) — e só
o serviço sabe que a criança pode estar **internada** (0890) ou **em casa com a
família** (1010). As três funções do banco nasceram antes dessas duas situações
existirem, e ninguém voltou para lhes contar. O efeito, medido pelas rotas: a
conferência de mesa grava `normal` para quem está no HOSPITAL — um registro
dizendo que a criança almoçou na casa — e a chamada final **não fecha**, porque
o fechamento cobra pelo nome alguém que a tela se recusa a listar. A educadora
das 22h não tem por onde sair: marcar é impossível, e fechar também.

*Por que só agora, se a fase 126 rodou verde nas duas condições em 19/09: a
janela da criança que está fora da casa depende do DIA, e no dia 19 ela não caía
onde cai no dia 20. Um defeito que aparece em alguns dias é pior do que um que
aparece sempre.* **E esta explicação estava errada — ver a nota da fase 127
abaixo: o defeito não depende do dia nenhum, e nenhuma suíte o cobria.**

~~**A correção está começada e não terminada**~~ ✅ **TERMINADA NA FASE 127.**

**19/09/2026, fase 126.** `tsc` limpo nos dois lados. A suíte **duas rodadas
inteiras**, todas as suítes e todos os testes em cada — 77 e 768, os números de então: às 13h56 de Porto Alegre no relógio
real, e sob `faketime +9h` às **22h54, com o servidor já em 20/09 e a
instituição em 19/09** — que é exatamente a condição em que ela vinha
reprovando.

**Como o defeito se escondia, e é a lição da fase.** A suíte inteira ficava
vermelha e **cada suíte, sozinha, passava** — o pior sintoma possível, porque a
parte diz que está tudo bem e o todo diz que não. Eram três causas, todas em
dado de teste:

1. um teste criava uma criança na Casa 03 e não a devolvia;
2. outro desligava o **Theo, do seed**, e também não o devolvia;
3. o seed das prescrições gravava `starts_on` com `CURRENT_DATE`.

**As duas primeiras se cancelavam:** uma somava, a outra subtraía, e a conta dos
vinte fechava por coincidência. Ao consertar uma, a outra apareceu — e foi
preciso consertar as duas para chegar à terceira, que estava escondida atrás
delas. *Dois erros que se anulam são mais difíceis de achar do que um erro
sozinho, porque o sistema parece certo.*

**E a terceira era a de sempre, num lugar novo.** `CURRENT_DATE` é o dia do
servidor; depois das 21h em Porto Alegre ele já é o dia seguinte. A prescrição
nascia começando amanhã, nenhuma dose do dia era gerada, e o piloto reprovava —
por um motivo que não estava no sistema, e sim no **dado de partida**. A
conferência da fase 99 lê o catálogo e os serviços; **os seeds ficavam fora do
alcance dela**, e continuam: está anotado na §9.

*Antes de procurar no sistema, reproduzi pelas rotas com o relógio deslocado e
com o relógio real, e o comportamento foi IDÊNTICO nos dois — foi isso que
mostrou que a diferença não estava no servidor. Meia hora perdida procurando no
lugar errado teria sido meia hora a mais sem essa medição.*

*Dois cuidados que as rodadas ensinam: o `pg_ctl start` sob `faketime` trava
esperando o arranque — use `-W` e confira com `pg_isready`; e **os dois
relógios andam juntos, ou nenhum anda**.*

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
| 94 | **A pauta que o educador propõe.** O último item da fila de 09/09: quem trabalha na casa propõe assunto para a reunião, e **recusar ou adiar exige resposta escrita** — no serviço e no banco —, que quem propôs lê e é avisado. E o que foi decidido na reunião passou a ser **disparado** a quem não estava: o plantão e o Líder Noturno |
| 95 | **O estatuto.** As regras de convivência, que a fase 94 deixou de fora por serem outra coisa: permanentes, por casa ou da instituição, com público — o que permite afixar na parede só o que é das crianças. A suíte achou a função `SECURITY DEFINER` deixando a coordenação revogar regra da instituição, por cima do RLS |
| 96 | **As fronteiras que ninguém conferia.** Os dois achados de passagem viraram conferência: o SQL entre partições — **dez** liam tabelas de outra sem declarar, e o "removível" do §4.3 era falso — e as colunas de fechamento que não se chamam `status`. Nenhum defeito novo; o que havia era garantia que ninguém garantia |
| 97 | **As fontes, embutidas.** A decisão §10.10 estava parada por um custo estimado em 300 KB; medido com o subconjunto latino e só os pesos usados, são **116 KB**. O protótipo deixou de buscar letra no Google: offline — que é como ele é entregue — a letra agora é a que a equipe vai ver, e nenhum IP de quem abre vai para um terceiro |
| 98 | **O bloco de notas recuperado.** Dois pedidos do Marcelo achados em 12/09: **as casas pelo nome** — os cartões das unidades não abriam, e quem tem alcance em várias ficava preso à primeira — e **os aniversários avisados antes**, com ciência da casa. O terceiro, a visão de cima do gestor, ficou anotado por não ser adivinhável |
| 99 | **A data que nascia em UTC.** Duas colunas ainda usavam `current_date`: uma regra de convivência escrita às 22h nascia valendo **amanhã** e sumia da folha da parede, e a escala criada à noite passava a valer um dia depois. Achado por uma sabotagem que não reprovou — o defeito estava um degrau abaixo de onde eu procurava, no `DEFAULT` da tabela |
| 100 | **O que a aplicação não precisa poder.** Das tabelas de então — 112 —, quatro estavam sem RLS e a aplicação tinha INSERT e UPDATE em todas — inclusive nas duas em que ela nunca escreve. `institution` ganhou RLS, e a escrita em `institution` e `schema_migration` foi revogada. As duas de autenticação ficaram, com o risco escrito |
| 101 | **A sessão fechada.** O risco que a 100 anotou: a aplicação lia e escrevia `user_session` e `login_attempt` direto — uma consulta sem `WHERE user_id` lia o hash de sessão e o IP de todo mundo. As operações viraram funções `SECURITY DEFINER`, o acesso direto foi revogado, e **a lista de exceções encolheu** — foi a própria conferência que exigiu tirá-las |
| 102 | **O caminho das funções privilegiadas.** 150 das 151 funções que rodam como dona do banco não fixavam `search_path`. O risco é **teórico hoje** — a aplicação não pode criar schema nem objeto, e isso passou a ser conferido —, mas basta um `GRANT` concedido numa pressa para deixar de ser, em 151 funções de uma vez |
| 103 | **O relógio, que não existia.** Seis rotas de máquina tinham o motivo escrito de não ter tela — "roda por relógio" — e **nada as chamava**. No piloto, a casa abriria o sistema e acharia o dia vazio: sem doses geradas da prescrição, sem as atividades da rotina, sem aviso de aniversário. Nenhum teste pegava, porque cada rota tem a sua suíte e todas passam — chamadas pelo teste |
| 104 | **O documento da reunião.** `docs/PARA-A-REUNIAO.md` reúne num lugar só o que estava espalhado pelas §9, §10, §10.5, §11 e §12, para a conversa com a Fundação não precisar caçar. Entrou no conferidor de números junto: número repetido em dois lugares envelhece no primeiro que ninguém conferir |
| 105 | **O que o conferidor não conferia.** Seis desencontros achados lendo, nenhum capaz de quebrar nada — que é o que os põe na família da regra 18. O `.env.example` implantando convite de **72 horas** onde o código e a §7 dizem 24, sem motivo escrito em lugar nenhum; a lista das 18 partições com **17 nomes** (faltava a `relogio`, nascida duas fases antes); **o domínio errado em dois lugares** — no `relogio.crontab`, que alguém copia no dia da instalação, e no `placeholder` do e-mail institucional em Equipe, que é o campo de onde sai a conta para a qual o convite é enviado (`.org.br` onde a Fundação é `.com.br`, e o segundo é de onde o primeiro provavelmente veio); duas remissões do `.env.example` a documentos que foram para `docs/historico/` em 09/09; e o `module.json` da `relogio` apontando para a §12.6, que é a seção que a §12.7 abre pedindo para não confundir com ela. **Nada de novo foi construído.** *A lição que sobra: o conferidor de números conta o que está colado ao substantivo, e ao lado dele viajam listas, exemplos e remissões que ninguém confere — todas lidas por quem instala* |
| 106 | **A varredura das pontas soltas.** Três varreduras por medição — as tabelas de então (112), 1236 colunas, 102 colunas de autoria — atrás de informação que não chega a lugar nenhum e de começo que não ficou ligado em nada. **Nada consertado, tudo anotado** no §9. O maior achado é o mais silencioso: a **auditoria** é escrita por todo serviço e não tem rota que a leia, embora a §7 prometa a leitura a dois cargos. Do lado bom, **100 das 102 colunas de autoria chegam a uma tela com o nome escrito** |
| 107 | **O botão de olho, nos quatro que não tinham.** O primeiro conserto da varredura: `frontend/src/anexos.tsx` virou o lugar único da prévia, e a foto de identificação da criança **deixou de subir no instante em que o arquivo é escolhido**. Com ela, a foto 3×4 do visitante, o documento do hospital e o comprovante do marco. O `ensaio:uso` ganhou o bloco 14, que abre as prévias e cobra que o olho devolva uma **imagem** — porta que abre caixa vazia passaria numa cobrança de porta |
| 108 | **O anexo que era um caminho passou a poder ser o papel.** Os três que a varredura achou guardando REFERÊNCIA e não documento — o anexo da **ocorrência**, a **receita** e a **nota fiscal** — passaram a aceitar as duas formas, e a casa escolhe uma por anexo. O `storage_ref NOT NULL` garantia um texto, nunca um documento: agora o banco exige **um dos dois** (`anexo_tem_onde_estar`). Os bytes saem pela mesma função que registra a abertura — abrir um laudo de criança não é um SELECT —, e `kernel/arquivos` virou o lugar único de guardar e ler, em vez das cinco cópias espalhadas. *Três lições no caminho: coluna nova não herda privilégio de coluna; `GRANT SELECT, INSERT (x)` concede SELECT da TABELA; e rota guardada em variável escapa do conferidor de contrato* |
| 109 | **O movimento do armário abre.** O segundo achado da varredura (§9, item 2): `medication_stock_movement` tinha três lugares que escreviam e nenhum que lia, desde a migração 0200. A fase 85 existiu para gravar o `consumo` que faltava, e o lugar de abrir nunca foi construído — a própria 1040 descreve o sintoma que continuava de pé. Agora cada item do armário tem o botão de olho, e a lista é **cronológica e sem contagem por pessoa**: cada linha tem autor, porque toda ação tem autor, e somar movimento por educador é medir gente. *No caminho, o servidor de mentira deixou de prometer o que não guardava: a resposta do POST já dizia "a diferença ficou no histórico", e não havia histórico nenhum* |
| 110 | **A presença da criança chega à vida dela.** O quarto achado da varredura (§9, item 4): `check_result` só era lido DENTRO da própria chamada, e para saber se a Alice esteve no almoço de terça alguém abria a chamada daquele almoço. O provedor da linha do tempo dizia, num comentário, que *"o registro dele está no perfil"* — e não estava. Agora está, num bloco que mostra **só o que teve exceção** por padrão, com a frase escrita ao lado e com a CORREÇÃO — `check_result_amendment` era guardado por gatilho desde a fase 67 e nunca tinha sido lido por nada. **Sem contar nada**: nem faltas, nem recusas, nem percentual, e um teste guarda isso por FORMA |
| 111 | **O Prontuário de Educação ganha porta.** O terceiro achado da varredura (§9, item 3): `education_support` e `education_evolution` nasceram na migração 0530, do papel que a Fundação entregou em 28/08, e **o relatório já as lia** — nenhuma rota as escrevia, e o único INSERT do repositório estava dentro de um teste. No piloto, o relatório de desenvolvimento e a audiência concentrada diriam *"não há"* sobre escola e profissionalização **para sempre**, e num documento judicial seção vazia se lê como ausência de trabalho. Quem escreve não foi escolha desta fase: as políticas da 0530 já incluíam o **educador** — *"quem acompanha a tarefa de casa é ele"* (§8.12). A evolução **não se edita**: correção é registro novo, como no caderno |
| 112 | **A auditoria passa a ter por onde ser lida.** O maior e mais silencioso achado da varredura (§9, item 1): todo serviço escrevia em `audit_event` desde a migração 0010, e **nenhuma rota a lia** — uma capacidade que a §7 promete a dois cargos, sem porta nenhuma. **Duas entradas, e nenhuma terceira:** pela CRIANÇA e pelo REGISTRO. Não existe busca por pessoa da equipe, e a ausência é a decisão — a mesma tabela que responde *"quem abriu o dossiê da Alice"* responderia *"tudo o que a Joana fez ontem"*, e a segunda pergunta é vigilância com outro nome. Sem contar nada, e um teste guarda as duas coisas: que os caminhos por ator devolvem 404, e que a resposta não tem totais |
| 113 | **A chamada passa a dizer quem a abriu e quem a fechou.** `created_by` e `confirmed_by` estão em `collective_check` desde a migração **0120** e nenhuma consulta os lia (§9, item 5): a tela escrevia *"Chamada confirmada"* e mais nada. Confirmar não é ato administrativo — é alguém afirmando que **olhou todas as crianças da casa**, e num sistema em que cada marcação tem nome por regra (§8.2) era a última assinatura sem dono; a conferência de mesa, que é um ato menor, já trazia a dela desde a fase 91. Nenhuma migração: as duas colunas já eram legíveis, faltava a pergunta. Dois testes, um deles para a chamada ainda **aberta** — o campo do fecho precisa vir vazio, e não com o nome de quem abriu |
| 114 | **O acervo passa a ter um dono só.** Cinco serviços traziam a mesma linha de `ARQUIVOS_DIR` e cada um decodificava, media, lia a assinatura e gravava do seu jeito — a última dívida do item 5 da §9, anotada como arrumação. **Não era arrumação:** ao juntá-las, as cinco não faziam a mesma conferência, e uma delas dava `image/webp` a um arquivo **AVI** (`RIFF` sozinho não é WebP; o formato fica no 9º byte). As diferenças legítimas viraram `RegraDoArquivo`, declarada ao lado de cada método — 15 MB e seis tipos no dossiê, 10 MB e três na internação e no marco de vida, 4 MB e só imagem nas duas fotos, *porque um PDF como retrato de uma criança não é documento, é engano*. Um conferidor novo no `arquitetura.spec` impede a sexta cópia |
| 115 | **A auditoria passa a falar português — e o conferidor mantém isso verdade.** Varredura sobre a própria fase 112: o mapa de rótulos que escrevi com ela tinha dezoito entradas, cobria **treze das 170 ações** que o sistema grava, e **cinco das suas dezoito não casavam com ação nenhuma** — `person.update` quando a real é `person.profile_update`, `credential.open` quando é `credential.reveal`. Todas **próximas** de uma ação real e nenhuma igual: a assinatura de quem escreveu de memória. Nada acusava, porque `Record` que devolve `undefined` cai no `?? r.action` e a tela mostra o código cru, em inglês, no rastro de uma criança. **E vinte e cinco ações não saem do TypeScript: saem do SQL**, de funções `SECURITY DEFINER` — `credential.reveal`, `incident.attachment_open`, `staff.create` —, as mais sensíveis justamente porque estão no banco para que nenhum caminho escape delas; a primeira versão do conferidor não as via e dava tudo verde. O vocabulário mudou para o kernel, ao lado de quem ESCREVE a auditoria, e `vocabulario-da-auditoria.spec.ts` reprova nas duas direções: ação sem frase, e **frase sem ação** — rótulo que sobra é a prova de que ninguém conferiu |
| 116 | **O que o cadastro pede passa a ter fim.** Varredura pedida pela Fundação em 15/09 — *"veja se o perfil dos atendidos está ok e se tudo está conectado com as opções de cadastro dos jovens"*. Três achados. **(1) O motivo do ingresso urgente era exigido e jogado fora:** a tela pede a frase com o mínimo de dez caracteres, o serviço recusa o cadastro sem ela, e **não havia coluna** — o `INSERT` da 0480 não a listava, e a porta curta (`app_admit_person`) **nem criava ficha de entrada**. Quem entrava pela urgência, que é exatamente quem entra sem documento de madrugada, era quem ficava sem nada escrito; o que sobrava era `PROV-M4X7K2`. **(2) Cinco campos lidos por nada:** `gender`, `race`, `birthplace`, `nis` e `civil_registry` são pedidos no cadastro e gravados desde a 0480, e nenhum `SELECT` do sistema os nomeava — a **cor/raça autodeclarada**, que é como a política pública se mede, e o **NIS**, que abre o CadÚnico, invisíveis justamente para quem monta o relatório. **(3) A ficha de entrada sem tela:** `admission_record` tinha rota de leitura desde a 0480 e **nenhuma tela a chamava**; a exceção do `rotas-sem-porta` dizia *"o perfil mostra o motivo e os dados judiciais nas suas próprias seções"* — e confundia duas tabelas diferentes, que é por que ninguém percebeu em 76 fases. A trava do motivo desceu para o banco, nas DUAS portas de cadastro |
| 117 | **O trabalho da equipe passa a ser visível para quem coordena — e isto desfaz uma recusa minha.** Pedido da Fundação em 15/09: *"quero que seja possível ver todo o trabalho e ações de cada educador e setor para a visão do coordenador"*. A fase 112 tinha recusado a busca por pessoa da equipe e escrito a recusa no código — *"'tudo o que a Joana fez ontem' é vigilância"* —, terminando assim: *"se a Fundação quiser, isso é decisão dela e vira OUTRO CAMINHO, com finalidade escrita e registro da própria consulta."* A decisão veio, e o outro caminho cumpre as três condições que eu tinha posto, mais a que importa: **não conta nada.** Nenhum total, nenhuma média, nenhuma lista de pessoas lado a lado — ela responde *"o que a Joana fez na terça"* e não *"quem fez mais"*. A leitura é `audit_event` filtrada por ator, e não uma consulta nova sobre as oitenta e cinco tabelas que guardam autoria: tudo o que ela mostra já era gravado, e desde a 115 já tinha frase em português. **Quem lê são os três que a Fundação nomeou** — equipe técnica, Líder Diurno e coordenação, cada um nas casas em que trabalha. **O Gestor Geral não está na lista**, e a ausência é decisão escrita: ele não foi nomeado, e é dele a visão das oito casas, que é onde a comparação entre equipes ficaria mais fácil de fazer. Um teste guarda a forma da resposta, para o total não voltar de carona |
| 118 | **Três coisas que aconteciam com a criança e não chegavam à vida dela.** Fecho da varredura de 15/09. **(1) O ofício a órgão externo:** `external_communication.person_id` é gravado desde a migração 0320 e **nenhuma consulta o lia** — nem o detalhe da ocorrência, nem a lista da casa. Um ofício ao Judiciário, ao Conselho Tutelar ou ao MP **sobre a Alice** não aparecia em lugar nenhum da vida da Alice, e é o tipo de documento que a audiência pergunta se existe. **(2) A convivência familiar:** aberta de DENTRO do perfil desde a fase 89, e lida só na lista da casa — que mostra quem está fora *agora*. Quem abrisse o perfil em outubro não via os fins de semana de setembro nem como ela voltou de cada um. **(3) A internação:** lida pela casa, e uma internação **encerrada** é exatamente a que some da tela e fica na vida. Nenhuma migração: as três colunas já eram legíveis e o RLS já dizia quem alcança cada uma — faltavam as perguntas. Os três blocos **somem quando não há o que mostrar**, e nenhum conta nada: *"4 saídas em setembro"* no perfil de uma criança é a primeira linha de um julgamento sobre a família dela |
| 119 | **O Gestor Geral passa a ver as oito casas — e a contar.** Decisão da Fundação em 15/09, nas palavras dele: *"o gestor vê tudo o que ele quiser, em uma visão apenas contagens e métricas, na visão total ele vê tudo, afinal ele é o chefe de todas as casas."* A fase 117 o tinha deixado de fora e escrito a ausência **como decisão minha, sujeita à dele**; ele decidiu. Duas visões: a leitura detalhada, agora nas oito casas (o recorte não precisou mudar — `app_casas_no_alcance()` já devolvia as oito para o cargo dele desde a 0920), e **a primeira contagem por pessoa que este sistema faz**, por casa, setor, pessoa e tipo de ação. **O que NÃO mudou, e não é teimosia:** criança não entra em contagem nenhuma — a regra 3 protege quem é cuidado, e não foi o que a Fundação revisou; a ordem é sempre por NOME, nunca por total, porque a lista ordenada por número já É a classificação e ela apareceria sem ninguém ter decidido fazê-la; e nada de média ou meta, que é juízo disfarçado de fato. **O aviso vai junto do número, na tela e na resposta:** contam-se REGISTROS, não trabalho — quem passou a noite com uma criança no colo registrou menos, e fez mais. A promessa da §7 *"ranking de casas, de acolhidos ou de equipe"* mudou de texto em vez de continuar bonita: o que segue valendo para todos é *"ranking de acolhidos, contagem por criança, pontuação de comportamento e lista ordenada por total"* |
| 120 | **O painel das oito casas, e os manifestos que voltaram a dizer a verdade.** A pergunta 1 — aberta desde 09/09, respondida em 15/09 — virou tela: as oito casas em números, no período escolhido, com as métricas que ele nomeou. **A tela INICIAL do Gestor Geral passou a ser ela**, porque ele pediu exatamente isso: *"como o dia a dia é controlado pelos coordenadores, ele não vai querer que a tela inicial dele seja essa de controle total."* Antes, a aba inicial era `'dia'` para todo cargo, escrita em dois lugares; agora nasce vazia e cai na **primeira aba do cargo** — uma regra a menos, e não uma a mais. **Barras, e não pizza, apesar de ele ter pedido pizza:** oito fatias vizinhas de tamanho parecido são um borrão, e a pergunta dele é comparar. A rosca ficou onde é verdade — duas fatias, um mesmo total. **A primeira cor deste sistema que não é estado:** verde numa barra alta diria *"esta casa está bem"*, um juízo que ninguém assinou; o gráfico tem tinta própria, validada nos dois temas contra as superfícies reais da folha. **E ao construir apareceu outro achado:** vinte e seis tabelas — de 112, na época — não estavam declaradas em manifesto nenhum — `hospitalization`, `person_contact`, `person_credential`, `shift_assignment` —, e por isso o conferidor de fronteiras entre partições **não as enxergava**. Um quarto do esquema fora da única regra que guarda as partições, sem nada quebrar. Declaradas, e com conferidor novo nas duas direções |
| 121 | **O período da casa — *"uma ata geral de toda semana"*, com o período livre.** Resposta da Fundação em 15/09 à pergunta R1 do roteiro: *"acompanhamento semanal é um bom caminho: ver como foi a casa toda aquela semana, tipo uma ata geral de toda semana, tanto manhã quanto noite"*, e o recorte escolhido por quem lê — *"se é um dia, dois, três, uma semana, um mês, seis meses […] esse controle tem que ser livre para eles poderem brincar ali dentro"*. Não é o painel do Gestor (1280): lá o leitor é o chefe das oito casas e a pergunta é *"como estão as oito"*; **aqui o leitor responde por vinte crianças e a pergunta é "como foi a nossa semana"** — e essa não se responde com número nenhum sem o que foi escrito ao lado. Três funções: os números do período, *"quem não está comendo o quê"* criança por criança, e o que aconteceu em texto. **A parte boa vem primeiro, e isso é a frase dele:** *"as observações que os educadores botam têm que ser ponderadas para ser trazido coisas boas e negativas"* — conquistas, memórias e evolução escolar abrem o relatório, antes de ocorrência e episódio. Um resumo que abre pela lista de falhas ensina a equipe a ler a própria semana assim, e a criança some dele. **Texto de acesso restrito NÃO entra**, e não por permissão — os quatro cargos que abrem são o círculo estreito que ele desenhou: é que este documento tem folha, e folha se imprime, se anexa e se esquece em cima de uma mesa. A ocorrência restrita sai como CONTAGEM, com a frase que manda o leitor à tela onde cada abertura fica registrada. **O único número comparado é o de doses** — *"aumento de medicamentos"* foi o pedido —, e a comparação é da casa consigo mesma, no período anterior de igual duração; nunca com outra casa, e sem dividir um pelo outro. **E o `npm run prototipo` morreu de "Killed" no meio disto:** dois níveis de recursão dentro do `responder` do servidor de mentira — nove mil linhas — levaram o transformador a 5,7 GB. O sintoma era memória; a causa era desenho, e o conserto foi o tratador em função própria, como o `responderImpacto` já era pelo mesmo motivo |
| 122 | **O relato da convivência familiar — a porta que não fecha, e uma correção da Fundação.** A resposta de 15/09 pedia um acompanhamento que *"fica aberto para ser preenchido por algum educador depois de uma semana"*, e eu ia construir isso como **pendência com prazo**. Em 16/09 ele voltou: *"acho mais fácil não dar um prazo, mas deixar em aberto para ser registrado quando de fato tivermos uma informação. Assim, quando o jovem sair para a visita em casa, se abre essa pergunta para ser respondida depois — dessa forma não haverá uma pressão para arrancar a informação da criança. Mas isso pode ser registrado quantas vezes for necessário, por qualquer educador, tudo ficando no perfil do jovem."* **A correção dele é melhor que o meu desenho, e por um motivo que vale escrever:** uma pendência de sete dias vira, na prática, cobrança sobre o educador — e o educador só tem uma forma de baixar uma cobrança dessas, que é perguntar de novo para a criança. O campo com prazo transformaria o adolescente que voltou calado numa tarefa vencida. **O que isso impôs ao código:** `family_stay_note` é tabela de LINHAS e não coluna em `family_stay` (uma coluna só aceita a última versão, e a última versão apaga a primeira — o que ela contou na terça não substitui o que se observou no domingo: soma); não existe `status`, `prazo` nem quem feche, e o teste reprova se algum aparecer; **não há conferência de cargo** — quem alcança a casa escreve, porque a criança conta para quem ela confia, e quem ela confia quase nunca é quem tem o cargo mais alto; e a porta abre na **SAÍDA**, não no retorno, então dá para registrar o telefonema de sábado. `UPDATE` e `DELETE` revogados: escreveu errado, escreve de novo. **O único aviso do sistema aqui** é o de *"houve alteração"*, opcional e desmarcado por padrão — se todo relato avisasse, a equipe aprenderia a ignorar o sino, e aí o aviso que importa some junto. Ele sai pelo BARRAMENTO e não de dentro da função: `people` não pode depender de `notifications`, que é removível |
| 123 | **A escala como ele descreveu: quem monta, a cor, e a substituição num gesto.** Em 15/09 ele descreveu a escala que quer, e **a maior parte já existia** — lançamento por data e turno, repetição de padrão, preparação com meses de antecedência, retirada que some do turno na hora, nada apagado. Antes de construir eu MEDI a diferença (§9, Grupo 2.5), e ela eram quatro coisas; esta fase fecha três. **(1) Quem monta:** entram a equipe técnica e o Líder Diurno — *"pela equipe técnica, o coordenador ou o educador líder"* —, que são exatamente quem está na casa quando a escala precisa mudar: o Líder Diurno é quem descobre às 6h50 que alguém não veio. A RLS mudou junto com a função, e não só a função: mexer numa só deixaria a porta do banco aberta por um lado e fechada por outro. **(2) A cor:** `app_user.line_color` existe desde a 0990, é escolhida pela pessoa, não repete na casa — e era usada **só na ATA**. Agora a escala a carrega e a desenha na borda da linha, com o nome escrito ao lado, sempre: a folha da parede sai em preto e branco na impressora da casa. O hash que decide o tom automático saiu da tela da ATA e foi para `rotulos.ts`, porque uma segunda cópia faria a mesma educadora sair de um tom na ATA e de outro na escala — é a lição do mapa `VINCULO`. **(3) Substituir num gesto:** eram dois atos, e entre um e outro o turno ficava vazio na tela de quem estivesse olhando; pior, os dois não se sabiam parentes, e três meses depois a escala mostrava uma revogação e uma escalação sem relação nenhuma. `app_substituir_no_plantao` faz os dois numa transação, **com a pessoa nova entrando ANTES de a antiga sair** — se ela já estivesse no turno, o erro estoura com a casa ainda intacta. *"Deixar a menos" continua existindo*: o botão Retirar não saiu do lado, porque uma casa pode mesmo passar o turno com uma pessoa a menos. **A quarta não foi feita, e a razão está escrita na migração:** *"a gente não vai deduzir a escala"* — retirar a dedução deixa a passagem de plantão sem ninguém para assinar no primeiro dia de uso, com a escala real ainda não digitada. É consequência que a Fundação precisa escolher (§4.5). **E o teste da própria fase pegou um defeito:** a recusa "esta pessoa já está escalada neste turno" subia CRUA, em inglês de Postgres, na tela de quem monta a escala às 6h50 — o índice sempre existiu, mas até aqui nenhum chamador humano batia nele, porque `app_escalar` trata o conflito por dentro |
| 124 | **Várias fotos numa vivência, e o baixar no dossiê.** Dois dos três pedidos que a equipe fez e a Fundação repassou em 15/09 (§9, Grupo 2.5) — e os dois eram diferenças pequenas, o que não quer dizer pouca coisa. **(1) As fotos:** o álbum já aceitava fotos sem limite, mas não mais de uma **da mesma vivência** — `memory_record` guardava um `storage_key`, e a educadora que voltava da festa com seis fotos registrava seis vivências: seis vezes a mesma data, seis vezes a mesma descrição, e o álbum da criança contando a festa seis vezes. A saída errada seria `storage_key_2`, `storage_key_3`; a certa é dizer o que é verdade — **uma vivência é um acontecimento, e um acontecimento tem quantas fotos tiver**. As que já existiam **mudaram de lugar** para `memory_photo`, e as colunas antigas ficaram como origem histórica, com um `COMMENT` dizendo que não são mais lidas: guardar o mesmo fato em dois lugares é como duas versões da verdade começam, e um teste confere que elas nascem nulas. **A autorização de imagem continua POR FOTO** — a festa pode ter uma foto com uma criança de outra casa, e a autorização dela é outra conversa —, e a vivência só aparece autorizada quando todas as fotos dela estão. A `position` guarda a ordem da escolha: sem ela, seis fotos saem embaralhadas a cada consulta e a primeira deixa de ser a primeira. E o envio tem teto de doze, que **não é limite do álbum**: é o tamanho de um envio que cabe numa conexão de casa, e a recusa diz o que fazer no lugar. **(2) O baixar:** a folha do dossiê abria a prévia e não oferecia baixar — o botão existe na biblioteca de anexos desde a fase 47 e é usado em quatro telas; faltava justamente onde a equipe pediu. Ele passa por **rota própria, que registra**: salvar no navegador os bytes que a prévia já tem funcionaria e não deixaria linha nenhuma. Abrir é `document.open` desde a 47; sair com o arquivo é `document.download`, e é o que alguém vai querer rastrear no dia em que uma certidão aparecer onde não devia. A conferência do sha vale para os dois: **um arquivo trocado por baixo não sai do sistema nem para a tela, nem para o disco de ninguém** |
| 125 | **O que é da criança chega ao dossiê dela.** O terceiro pedido do Grupo 2.5, e o mais fundo, porque a Fundação tirou dele uma regra para o sistema inteiro: *"se a enfermagem já faz isso cair no perfil da criança, todos os outros lugares onde a gente preenche […] têm que ir individual para cada um no seu registro"*. **O defeito, medido:** a receita digitalizada vive em `prescription_document`, presa à prescrição, na tela de Saúde; o anexo do diário de internação vive em `hospitalization_note`. **Nenhuma das duas cria linha em `document`** — e o dossiê só lê `document`. O dado não estava perdido: estava guardado, com autor e hora, na tela onde nasceu. Faltava ele **chegar onde a criança é procurada**. **O espelho** (`app_espelhar_no_dossie`) cria a linha em `document` apontando para o **mesmo objeto guardado** — mesmo `storage_key`, mesmo sha: não há cópia do arquivo, porque duas cópias divergem no dia em que alguém substituir uma delas e a segunda continua parecendo verdadeira. É **idempotente por `mirror_of`**, e sem isso cada reprocessamento — uma fila offline reenviada, um clique duplo no fim de um turno de doze horas — encheria a pasta da criança de receitas repetidas que ninguém distingue. **Ele chega conferido, e isto é decisão escrita:** o rito do aceite é *"eu olhei e digo que é este documento, desta criança, e que está legível"*, e quem anexou à prescrição fez exatamente isso — o *"é desta criança"* está garantido pela estrutura, porque a prescrição já é de uma criança nomeada. Deixá-lo aguardando conferência faria o contador de *"falta conferir"* da casa subir sozinho a cada prescrição, e contador que sobe sozinho é contador que a equipe aprende a ignorar — e aí o documento que **realmente** falta conferir some no meio. **Só quando há arquivo:** a receita pode ser anexada como referência (*"está na pasta tal do Drive"*), e um espelho sem arquivo seria um documento no dossiê que não abre. **A bula, que não existia em lugar nenhum**, entra pela mesma porta — `prescription_document.kind` —, e na mesma tabela porque é o mesmo fato: um papel digitalizado preso a uma prescrição. Uma tabela idêntica com outro nome seria a mesma coisa escrita duas vezes, e a segunda esqueceria a correção que a primeira recebesse. Ela segue a política restrita da receita por uma razão prática: **o sigilo não está no papel, está no vínculo** — saber QUE bula alguém guardou é saber qual remédio a criança toma. As receitas **já guardadas** são espelhadas na migração, senão a casa abriria a pasta no dia seguinte sem entender por que a receita de ontem não está lá. E a tela mostrou um defeito que a fase descobriu: o dossiê desenhava **só as vagas da lista de obrigatórios**, então a bula e o laudo — que não preenchem vaga nenhuma — chegavam e ficavam **invisíveis**; o servidor já os devolvia em `avulsos`, e faltava alguém desenhá-los. Inventar vaga para eles seria pior: vaga de checklist é cobrança, e a casa passaria a ver *"falta a bula"* de uma criança que não toma remédio nenhum |
| 126 | **A suíte que só era verde de dia.** Ao retomar o trabalho noutra conversa, a suíte inteira reprovava — e cada suíte, sozinha, passava. Três causas, todas em DADO DE TESTE e nenhuma no sistema: dois vazamentos de fixture que **se cancelavam** (um deixava uma criança a mais na casa, o outro tirava o Theo do seed, e a conta fechava por coincidência), e o seed das prescrições usando `CURRENT_DATE` — o dia do SERVIDOR —, que depois das 21h em Porto Alegre semeava o dia seguinte e deixava o dia de hoje sem dose nenhuma |
| 127 | **A chamada fecha quando alguém da casa está fora dela.** A educadora das 22h tinha uma casa de vinte crianças, uma delas no hospital, e nenhuma saída: marcar era impossível, e fechar também. **Quem a chamada cobra estava escrito em QUATRO lugares**, e só a tela sabia que a criança pode não estar na casa — `app_bulk_check` (0780), `app_confirm_check` e `app_check_missing` (0440) nasceram antes de a internação (0890) e a convivência familiar (1010) existirem, e ninguém voltou para lhes contar. As duas metades do defeito: a conferência de mesa **gravava "normal" para a criança que estava no HOSPITAL** — um fato inventado sobre uma criança, e silencioso, porque a tela dizia `faltam: 0` —, e o fechamento **cobrava pelo nome** quem a tela se recusava a listar. A correção não repete a regra em três lugares: `app_efetivo_da_chamada` (1350) passa a ser a resposta única para "de quem esta chamada trata", e regra nova de presença — escola em turno integral, acampamento, hospital-dia — se escreve uma vez, lá dentro. **E POR DIA, não por "agora":** a chamada de ontem, reaberta hoje para correção, precisa saber como a casa estava ontem; as duas funções de presença já respondiam por dia e estavam sendo chamadas SEM dia. **O teste veio primeiro**, e era o que faltava: `quem-a-chamada-cobra.e2e.spec.ts`, cinco testes, e medida sem a correção ela reprova — o lote marca 20 onde a tela mostra 19. *O que o documento afirmava e não era verdade: **nenhuma suíte guardava este defeito.** `hospitalization` e `family_stay` chegam vazias do seed, então nenhuma encontrava alguém fora da casa; as "3 falhas em `conferencia-de-mesa`" eram o eco de um rascunho que morava em `backend/test/` e deixava uma internação aberta no banco compartilhado. O defeito era real; a prova de que ele existia, não. Por isso a suíte nova **fecha o que abre**, com rede de segurança no `afterAll`* |
| 128 | **O que se escreveu sobre a criança, e o que este papel não pode abrir.** `statement.person_id` era gravado desde a 0300 e **nunca lido por pessoa**: a varredura de 15/09 o achou, e o §9 o manteve fechado **de propósito**, porque listar por criança tudo o que se escreveu SOBRE ela é exatamente a narrativa que o §26.2 protege atrás de finalidade declarada. A resposta chegou em 20/09 e é de uma linha — **só a contagem** —, e ela desenha a fase inteira: **quem alcança lê; quem não alcança recebe um NÚMERO**, nem data, nem autor, nem trecho. Vale o mesmo precedente do dossiê: *"o que este papel não pode ver aparece como contagem, não some"*, porque esconder que existem faria a equipe procurar noutro lugar. **A regra de quem lê passou a morar num lugar só** (`app_pode_ler_relato`), com dois leitores — a policy, que decide quais linhas existem, e a contagem, que conta as que não existem para quem pergunta. Foi a lição da 127 aplicada antes de doer: a regra já estava escrita duas vezes (a 0300 a criou, a 0730 a reescreveu inteira só para acrescentar dois cargos) e esta fase precisaria de uma terceira cópia. **A contagem é frase, não selo:** *"Existe 1 relato em área restrita sobre esta criança"* é informação; um `2` vermelho ao lado do nome de uma criança de doze anos começa a parecer nota de comportamento (regra 3). E a resposta **não soma nada** além disso — nem relatos por mês, nem por autor —, guardado pela FORMA da resposta. *No caminho, dois achados que não são desta fase e ficaram anotados no §9: a tela de Educação **inventa a própria lista** em vez de pedir `/nursing/education/kinds`, e a leitura de um documento do dossiê não tem quem a chame. Os dois apareceram porque o `rotas-sem-porta` **deixou de dar porta a quem não tem**: o `temPorta` aceitava que o `:x` de uma chamada casasse com uma PALAVRA da rota, e uma chamada nova desta fase revelou o defeito declarando que a leitura excepcional tinha ganhado tela — ela não tinha* |
| 129 | **A escala não se deduz.** Decisão da Fundação reafirmada em 20/09 depois de eu levantar a consequência: *"não cabe a nós deduzir."* O que saiu: quando a escala do dia não tinha ninguém, a `0960` caía para a escala SEMANAL e, não achando, para o **vínculo da casa** — e cobrava a passagem de todo educador vinculado, **de folga ou não**. Era o defeito que a `0420` existiu para corrigir, sobrevivendo com nome novo: a ATA fechava "com pendência" nomeando quem não estava lá. Agora a escala é a única fonte, e **sem escala lançada ninguém é nomeado** — a tela diz em vermelho que ninguém a lançou, que é pendência da CASA e não de uma pessoa. **O que isto NÃO muda, e é o que segura a educadora das 23h:** assinar nunca dependeu da escala e continua não dependendo — há teste disso desde a 0960, *"escala que trava é escala que a casa contorna"*. A escala decide quem é **cobrado**, nunca quem **pode**. **E o buraco que a decisão abre, que esta fase fecha:** sem dedução, `app_missing_handovers` devolve zero num turno sem escala, e a ATA fecharia **limpa** ainda que ninguém tivesse assinado nada — "zero pendências" e "ninguém registrou o turno" passariam a ser a mesma resposta, e o dia em que a casa esquecesse as duas coisas a ATA sairia impecável. O fechamento passou a olhar as duas: alguém cobrado que não assinou, **ou** um turno sem escala e sem nenhuma passagem. A contagem `missing_signatures` continua contando só GENTE, porque é o que ela diz; o outro caso é a casa, e a tela o escreve por extenso. *De passagem, um defeito da 0960 que ninguém tinha visto: ela dizia em comentário que a `fonte` sai na resposta "porque ela muda o que a tela diz", e o serviço **nunca a leu** — da 0960 até agora a tela não pôde distinguir "faltou assinar" de "escala não cadastrada", que era a razão de a coluna existir. E a `work_schedule` perdeu o último leitor: o §9 a listava como morta e a frase estava errada pela metade — a 0960 a lia* |
| 130 | **Os dois achados da 128, consertados — e um deles mudou de lugar em vez de sair.** *(1) A tela de Educação inventava a própria lista:* o servidor oferecia `GET /nursing/education/kinds` com os serviços do prontuário e a tela trazia `Fonoaudiologia` e `Psicopedagogia` **escritos no HTML**, em `<option>`. Era a §12.2 ao contrário — *"a tela não inventa a sua lista"* —, e o dia em que a Fundação acrescentasse um serviço o servidor saberia e a tela não. Agora a lista vem do servidor, e **quando ela não chega a tela DIZ isso** em vez de oferecer uma escrita à mão que pode já estar diferente. *(2) A rota curta do dossiê SAIU:* `GET /people/:id/documents/:docId` era restolho de um plano que não aconteceu — devolvia metadado, anunciava `download: { pronto: false, motivo: 'Armazenamento de objetos entra na Fase 3' }` quando o baixar já havia chegado na fase 124 por outra rota, e **registrava `document.open` sem nada ser aberto**. Nenhuma tela a chamava, e o servidor de mentira nem a atendia. **O que fez a decisão ser "sai" e não "ganha uso"** foi ela ser o sujeito do cenário #24, que prova a fronteira mais importante do dossiê: o educador levando 404 no documento judicial, idêntico a inexistente. Medi antes de remover — o `/file`, que é por onde a tela passa, segura a MESMA fronteira —, e o cenário mudou de rota. **Fronteira provada em rota que ninguém abre é fronteira que ninguém confere.** *E o cenário ficou mais honesto: o documento de saúde do seed não tem bytes, e o `/file` recusa por FALTA DE ARQUIVO antes de chegar à política — ele passaria por motivo errado. Agora anexa um documento com arquivo pela via normal da tela, e só então cobra a fronteira.* **A lista de exceções do `rotas-sem-porta` voltou de 16 para 14 sem que nenhuma linha fosse afrouxada**, que é o único jeito honesto de ela encolher. *Fica um terceiro achado, anotado e não construído: o `kinds` oferece também os **modos** (presencial, online) e a tela não tem esse campo. Campo que ninguém pediu é campo que ninguém preenche* |
| 131 | **O compromisso passou a olhar a escala que a casa lança — e eu corrigi um erro meu de ontem.** A fase 129 tirou a dedução de escala da passagem de plantão. **Ela não alcançou a tela de marcar compromisso**, e ali o efeito era pior porque silencioso: `app_staff_for_commitment` lia a `work_schedule` — a escala SEMANAL, do desenho anterior à escala por data —, e **nenhuma casa nunca a preencheu**. A tela dizia *"(fora da escala deste horário)"* em TODO nome, para sempre. A `0610` existiu para esse aviso não aparecer em todo nome e acertou a metade que dava para acertar na época; o que ela não podia saber é que a outra frase — *"esta casa não registrou a escala"* — ia virar permanente. Agora a pergunta é feita à `shift_assignment`, e **o sinal distingue pessoas**: medido no protótipo, dois nomes sem o aviso e quatro com ele. *A assinatura da função passou de dia-da-semana para DATA, e o serviço perdeu um `new Date(...).getUTCDay()` que só existia para alimentar a tabela errada — de passagem, ele calculava o dia da semana em UTC a partir de um meio-dia fixo, e truque que segura defeito é defeito esperando mudar de lugar.* **E A CORREÇÃO DE UM ERRO MEU:** a 1370 pôs na `work_schedule` um `COMMENT` dizendo *"MORTA desde a 1370"*, e era falso — eu havia procurado os leitores dela só nas migrações do módulo em que estava mexendo. **Comentário errado no banco é pior do que comentário nenhum:** quem abrir a tabela amanhã acredita nele. O §9 dizia "zero leitura" desde 15/09, e a frase estava errada por dois leitores; a 129 corrigiu metade e escreveu a outra metade errada. **Agora a afirmação é conferível pelo CATÁLOGO**, e não por leitura minha: um teste novo cobra que nenhuma função nomeie tabela declarada MORTA, lendo o `pg_get_functiondef` — porque `CREATE OR REPLACE` espalha a verdade por vários arquivos e a única cópia que vale é a que o banco executa. *Provei que ele pega: com uma função de teste lendo a tabela, a consulta a acha.* **E o servidor de mentira estava errado no mesmo lugar, nos dois sentidos da regra 14:** ele inventava "das 7h às 19h, de segunda a sexta" — uma escala que o servidor de verdade nunca teria —, e a demonstração escondia o defeito em vez de mostrá-lo. Agora os dois olham a escala por data, e o protótipo mostra os DOIS BURACOS que ela tem de propósito |
| 132 | **O remédio "se necessário" passou a ter onde ficar — e era o da madrugada.** A prescrição `quando_necessario` existe desde a 0200, com a condição de uso escrita, e SAI na tela de Saúde e na folha da parede marcada `s/n`. **O que não existia era jeito de registrar que ela foi dada:** `app_generate_doses` junta `medication_schedule`, e prescrição sem horário não gera dose nenhuma; a única porta era a confirmação de uma dose QUE JÁ EXISTE. As colunas `prn_reason` e `prn_outcome` foram criadas na 0200 para exatamente isto e ficaram sem um `INSERT` e sem um `SELECT` em todo o repositório. **O efeito na casa, e é por isso que a fase existe:** o remédio "se necessário" é o que o educador dá às 2h da manhã, sozinho, quando a criança acorda com febre — ele era dado e não ficava em lugar nenhum; a Enfermagem chegava às 9h sem saber que houve, o armário mostrava a caixa chegando e nenhuma saindo (a baixa só dispara na confirmação de uma dose que não nascia), e a decisão que o §9 diz que a Enfermagem toma com este registro — *"se aquilo vira prescrição"* — era tomada sem dado. **As guardas são as MESMAS da confirmação de dose**, e não outras: casa no alcance, protocolo do período, e a exceção `nurse_only` por medicamento valendo igual — um caminho novo com guardas próprias seria a porta por onde a decisão de 08/09 deixaria de valer. **O motivo é obrigatório com dez caracteres**, o mesmo piso do relato: *"febre"* não diz à Enfermagem das 9h o que ela precisa para decidir; a condição diz quando se PODE dar, o motivo diz o que aconteceu naquela noite. **O desfecho se escreve depois, sem prazo e sem pendência** — é a correção que a Fundação fez em 16/09 sobre o relato da convivência, e vale ainda mais aqui: cobrança com prazo sobre quem cuidou da criança de madrugada tem uma só forma de ser baixada, e não é a boa. Escrito UMA vez, porque a primeira observação é justamente a que a Enfermagem compara. **A tela é NO DIA, e não na de Saúde**, porque quem dá a dose das 2h é o educador — e o educador não alcança a tela de Saúde (§7); e fica DEPOIS da linha do tempo, não dentro dela, porque prescrição "se necessário" não é dose marcada e tela cheia de pendência impossível é tela que a equipe aprende a não olhar. **E o servidor de mentira mostrava justamente essa pendência impossível:** havia lá uma dose `quando_necessario` "Aguardando confirmação", que o servidor de verdade nunca produz — a demonstração ensinava o contrário do sistema (regra 14). Agora ela é o que de fato existe: a dose que o educador deu às 2h, com o motivo escrito, esperando só o desfecho. *O `rotas-sem-porta` acusou as duas rotas novas por falta de tela, e a resposta foi construir a tela, não abrir exceção.* **E o guarda das tabelas MORTAS ficou honesto:** ele olhava só o `pg_proc`, e função não é o único lugar de onde uma tabela é lida — agora ele olha também as políticas de RLS, as visões e o TypeScript, que é por onde a `medication_authorization` sobreviveu à varredura de ontem |
| 133 | **Quem levou a criança na consulta passou a caber na evolução — e uma coluna morta foi declarada morta.** Duas pontas dormentes fechadas, e as duas eram do mesmo tipo: campo previsto no papel que nunca ganhou nem escrita nem leitura. **(1) `health_evolution.companion_name`**, criada na 0530 com o comentário *"quem acompanhou, como no papel"*. Ela **não é duplicata do `accompanied_by`**: a política da 0210 exige `accompanied_by = app_current_user()`, então esse campo é, por construção, **quem enviou a evolução**. Quem LEVOU a criança muitas vezes não é usuário do sistema — é o motorista da Fundação, é a tia autorizada, é o educador de outra casa que estava com o carro —, e o nome dessa pessoa não tinha para onde ir: a equipe o escrevia no meio das observações, onde ninguém procura seis meses depois, quando a pergunta é *"quem estava com ele quando o médico falou isso?"*. **A pergunta na tela é um BOTÃO, não um campo** — nasce em "Fui eu", que é o caso comum, e o nome só aparece quando foi outra pessoa: perguntar sempre faria a Enfermagem digitar o próprio nome vinte vezes por semana, e campo que se preenche por obrigação vira campo preenchido de qualquer jeito. Ele **não é seletor de pessoa do sistema**, de propósito: transformar o motorista num usuário para caber num `uuid` seria criar conta para quem não usa o sistema — e conta que existe é conta que alguém empresta. E vem **ao lado** de quem escreveu, nunca no lugar: quem levou e quem responde pelo que está escrito são duas perguntas, e a Enfermagem que tria precisa das duas. *A assinatura do `app_submit_evolution` mudou, então a função foi DERRUBADA e recriada — acrescentar parâmetro num `CREATE OR REPLACE` cria uma SEGUNDA função com o mesmo nome, e aí a chamada passa a depender de qual delas o Postgres escolhe; e o parâmetro novo entrou no FIM da lista, porque parâmetro no meio reordena os posicionais de quem chama e o erro disso é silencioso.* **(2) `handover_receipt.opened_handover` foi declarada MORTA, e não apagada.** Medida sobre o repositório inteiro: nenhum `INSERT` a nomeia, nenhum `SELECT` a lê, e o trigger da tabela proíbe `UPDATE` — logo ela é `true` em toda linha que existe e em toda que vier. **Coluna que só tem um valor não informa nada, e pior: convida à conclusão errada**, porque quem abrir a tabela daqui a um ano vai ler *"abriu a passagem: sim"* para todo mundo e acreditar que o sistema confere isso. Quem responde *"a pessoa leu a orientação?"* é o `read_guidance`, que nasce `false` e é escolha de quem recebe o plantão. Não foi apagada porque `DROP COLUMN` é migração destrutiva e nada se apaga de passagem — **o que mudou é que a afirmação passou a ser conferível**: o guarda do `arquivo-tem-saida.spec.ts` ganhou um irmão para COLUNAS declaradas MORTAS, e ele reprova se alguém ligar um leitor sem tirar o comentário. *Medido: a mesma varredura acha os três leitores do `read_guidance` e nenhum do `opened_handover` — é o contrário do que aconteceu com a `work_schedule`, que passou meses com um comentário errado porque ninguém tinha como cobrar a frase.* **Sobra UMA ponta dormente**, a `medication_authorization`, e ela é dormência por decisão escrita (§8.6), não por esquecimento |
| 134 | **A técnica passou a ter de onde escolher as fontes do acompanhamento.** A resposta §10.7 de 20/09 foi **as três numa lista só** — linha do tempo, ocorrências e evoluções de saúde do período —, com filtro por tipo. O que faltava para ela virar tela era a lista: o `POST /followups/:id/sources` existe desde a migração **0490** e **nunca teve quem o chamasse**, porque pedia `entidade` e `entityId` digitados à mão, que ninguém tem. O acompanhamento ia sendo escrito sem referência nenhuma ao original — e a referência é a coisa inteira que a `followup_source` existe para guardar. **Uma lista só, e não três:** três listas obrigariam quem escreve a lembrar de visitar as três; uma lista ordenada por data é a semana da criança na ordem em que ela aconteceu. **O recorte é o período DO ACOMPANHAMENTO, não o de hoje** — um acompanhamento de agosto aberto em setembro precisa das fontes de agosto. **E o conteúdo da ocorrência restrita NÃO sai por aqui**, só a referência com data e autor: é o precedente da fase 121, e a razão é a mesma — este documento vira folha, e folha se imprime, se anexa e se esquece em cima de uma mesa. Quem precisa do texto o lê na tela da ocorrência, onde cada abertura fica registrada; e vê aqui que ela existe, que é o bastante para decidir referenciá-la. *Esconder que existe faria a técnica procurar noutro lugar.* Cada origem é opcional por `to_regclass`, como o painel: remover o módulo dono tira aquela origem da lista em vez de derrubar a tela. **E dois conferidores me pegaram no caminho, os dois com razão:** declarei `activities` no `dependeDoEsquemaDe` do `reports` por causa de uma consulta em TypeScript, e essa declaração é sobre tabela usada no SQL das MIGRAÇÕES — o conferidor de fronteiras cobrou e a declaração saiu; e o `rotas-sem-porta` acusou a exceção do `POST`, que existia dizendo *"espera a decisão §7.7"* — a decisão chegou, a tela existe, a exceção saiu. *A suíte nova também ensinou uma coisa sobre teste: `incident` tem trigger que PROÍBE `DELETE`, e ocorrência não se apaga — então a fixture dela é idempotente, criada uma vez e reaproveitada por marcador, e o período do acompanhamento é ancorado NELA em vez de no relógio. Criar uma ocorrência por execução encheria o banco compartilhado e faria o verde de outra suíte depender de quantas vezes esta rodou* |
| 135 | **A data passou a ser uma conta só — e uma tela mostrava o prazo um dia mais cedo.** Fui fechar as pendências e o achado anotado na 134 (*"a data está escrita em oito telas"*) era maior e pior do que eu havia escrito: eram **TREZE** cópias, e elas **não eram iguais**. **O defeito, medido e provado:** a cópia de `Ocorrencias.tsx` fazia `new Date(iso)` sem ancorar a hora, e o `deadline` da ocorrência é `date` no banco — dia puro nasce à meia-noite **UTC**, que em Porto Alegre é 21h do dia ANTERIOR. Então *"Pendência até 30/09"* aparecia na tela como **29/09**, e um prazo de **01/01 aparecia como 31/12**, com o ano errado. **Um dia a menos em toda pendência de ocorrência, desde sempre.** Outras duas cópias formatavam **sem `timeZone`**, isto é, no fuso de quem abre a página, e uma montava o meio-dia **sem informar o deslocamento**, o que dá no mesmo. *Ninguém desconfiaria olhando: as treze devolviam uma data com cara de certa.* Agora há **uma** conta, no `rotulos.ts`, com o meio-dia da instituição ancorado por extenso e o `timeZone` declarado — e ela aceita dia puro e instante, porque cortar a string era outra forma de perder o fuso. A versão curta (sem o ano) fica para a grade da escala, onde a semana cabe numa linha. **E há teste**: `a-data-numa-conta-so.spec.ts` prega os casos que quebravam — o prazo de 30/09, a virada do ano, as 22h de Porto Alegre — e cobra que **nenhuma tela declare a sua própria conta**. *Medido contra o commit anterior: o conferidor acha as treze.* É a lição do mapa `VINCULO` e do hash da cor de autor (fase 123) aplicada onde ela já tinha custado: **correção numa cópia não alcança as outras.** **E uma correção minha, sobre o que eu havia relatado:** eu disse que havia deixado duas ocorrências fictícias no banco de desenvolvimento e que o conserto seria recriar o banco. **Medi, e era falso** — o `globalSetup` do Jest derruba o schema e recria o banco do zero antes de CADA execução, então elas já não estavam lá. O comentário que eu havia escrito na fixture da suíte de fontes (*"dez execuções deixariam vinte ocorrências"*) estava errado pela mesma razão, e foi reescrito: comentário errado é pior do que comentário nenhum. O que continua verdade é a isolação DENTRO de uma execução, e é por isso que o `afterAll` apaga o que pode apagar. *Também medido: o prazo de triagem da Enfermagem, que o §9 dizia que "ainda não tem valor", **já é parâmetro** (`NURSING_TRIAGE_SLA_HOURS`, 24h de padrão) — o que falta é a Fundação dizer se 24h é o prazo dela* |
| 136 | **O Gestor Geral passou a escolher qual relato restrito abrir — uma porta por relato.** A decisão de 21/09 é de quatro palavras: *"gestor abrir o que quiser"*. Era a metade que faltava do §10.6: a resposta de 20/09 (**só a contagem**) virou a fase 128, e abriu uma pergunta nova — **com só a contagem ele não tem por onde escolher**. Os dois caminhos eram um botão que abrisse os N de uma vez, ou N portas opacas. A Fundação escolheu a segunda, que é a que expõe menos: **cada abertura é um ato, com a sua própria finalidade escrita e o seu próprio registro.** Um botão que abrisse os três de uma vez faria uma finalidade valer por três narrativas, e quem lesse a auditoria depois não saberia dizer de qual delas ele precisava. **A porta devolve número de ordem e identificador, e nada mais** — nem data, nem autor, nem contexto, nem a primeira linha; o identificador é o endereço da porta, e a porta continua sendo a `app_read_statement`, que exige finalidade de quinze caracteres e **registra antes de devolver o conteúdo**. **A ordem sai do IDENTIFICADOR, não da data**, e esta é a parte pensada: ordenar por data faria o "relato 1" ser sempre o mais antigo, e aí a lista opaca deixaria de ser opaca — ele saberia a cronologia dos relatos sobre a criança sem abrir nenhum, e **cronologia já é narrativa**. Para a equipe técnica, a coordenação e o líder a lista volta **vazia**, porque elas já leem o relato na lista normal: oferecer-lhes um botão de "abrir excepcionalmente" transformaria leitura de rotina em ato excepcional, que é o contrário do que o §26.2 protege. *A rota existia desde a migração 0300 e nunca teve quem a chamasse — a exceção do `rotas-sem-porta` caiu, e as rotas sem porta foram de 13 para 12.* **E o protótipo mostrava a porta sem mostrar a ESCOLHA:** havia um só relato restrito sobre o Kauã, então o caso que a decisão desenha — abrir um, ler, parar quando achar — nascia invisível no único arquivo que o Marcelo abre (§6.19 pela sexta vez). Agora há dois, de autores e dias diferentes, e o ensaio percorre a escolha inteira: a porta opaca, a finalidade curta recusada, o relato aberto com a finalidade escrita ao lado, **e as outras portas continuando fechadas** |
| 137 | **O conceito educacional do bimestre — o lugar de onde "boas notas" pode sair sem virar nota.** Duas respostas se juntaram aqui: em 20/09 a Fundação disse COMO a métrica pode existir — *"um conceito geral por período, por bimestre, com espaço para o porquê"*, e **não** boletim por disciplina (*"são 20 crianças, quatro vezes por ano, em oito casas, e a métrica que ninguém consegue digitar não existe"*) —, e em 21/09 disse **quem digita**: *"a equipe técnica, coordenador e educador líder"*. É o mesmo trio que monta a escala, e pela mesma razão prática: são os três que estão na casa quando alguém precisa escrever. **O que isto NÃO é, e é a parte que mais importa:** não é nota colada no nome da criança. É estado do ACOMPANHAMENTO num período, e é por isso que **o motivo é obrigatório** — conceito sozinho atravessa meses e vira característica da pessoa, que é o argumento que recusou a pontuação de comportamento (§7) e que fez a exceção da chamada exigir o fato em vez do rótulo. São três estados, e eles descrevem o que a casa faz a seguir: quem acompanha, quem acompanha COM apoio, e quem não está acompanhando — o único que pede providência. *O conjunto dos três é escolha MINHA, escrita na migração para não passar por decisão da Fundação: ela disse "um conceito geral, com espaço para o porquê", e os nomes são a minha leitura do que é contável e digitável em vinte crianças quatro vezes por ano. Trocar é uma linha.* **O bimestre é ESCRITO, não deduzido da data:** o conceito do 3º bimestre pode ser digitado em novembro, quando a escola entregou o retorno atrasado — deduzir gravaria o 4º, que é o mesmo erro que a fase 127 corrigiu na chamada. E **o bimestre que ainda não terminou é recusado**, porque escrevê-lo seria escrever sobre o que não houve. **Corrigir não sobrescreve:** registrar de novo o mesmo período insere outra linha apontando para a anterior, e as duas ficam legíveis, com o nome de quem escreveu cada uma — índice único PARCIAL garante um vigente por período e deixa as versões substituídas na tabela, que são elas que provam que houve correção. **Quem LÊ é quem alcança a criança, o educador de plantão inclusive:** esconder dele o conceito faria a casa ter uma informação sobre a escola que justamente quem senta ao lado na lição de casa não vê. *E uma frase do painel do Gestor deixou de ser verdade no instante em que esta fase entrou: ela dizia "não existe campo de nota, boletim ou conceito". Agora diz que nota continua não existindo, que o conceito existe no perfil, e que **o painel ainda não o conta** — contá-lo é a próxima fase. Deixar o gestor supor que conta seria pior do que dizer que não; e a cobrança do ensaio que guardava a frase antiga foi atualizada junto, senão ela guardaria uma mentira* |
| 138 | **A linha de uma casa na ATA Geral passou a se corrigir, com registro — e o protótipo tinha a folha das oito casas QUEBRADA.** A decisão de 21/09: *"quem corrige a ata é o educador líder, equipe técnica ou coordenador, tudo ficando registrado para esses 3"*. Era o último item do Grupo 2 do §9 — a rota existia e **só o autor da ATA Geral a alcançava, e só enquanto ela fosse rascunho**; depois de assinada, um horário digitado errado às 3h da manhã ficava errado para sempre. **Corrigir não é sobrescrever, e a diferença é o histórico:** o §6 proíbe sobrescrita de registro fechado, e o que ele proíbe é a sobrescrita SEM RASTRO — o sistema já resolveu isso na chamada (0670), guardando por gatilho o que constava antes. Este arquivo é o mesmo desenho: o `INSERT` do histórico é do gatilho, `UPDATE` e `DELETE` são revogados da aplicação (**o passado não se edita nem se apaga**), reenvio idêntico não vira linha de histórico, e **o motivo é obrigatório depois da assinatura** — antes é rascunho, e rascunho se escreve sem justificar. **Três achados no caminho, e os três são de medição, não de opinião.** *(1)* **O Líder Diurno podia corrigir e não podia LER a ATA Geral:** a política de leitura da 0310 não o inclui, então o comando lia `status`, recebia nulo do RLS e concluía "rascunho" — o defeito seria silencioso e ao contrário, ele corrigindo sem o motivo ser exigido. A §10.2 (*"quem lê a ATA Geral de dia"*) continua aberta para os outros cargos; esta fase responde só o que a decisão implica: **quem corrige, lê.** *(2)* **O botão estava no lugar errado:** eu o pus na folha das oito casas, e a tela diz, com estas palavras, que ela *"fica com quem responde pela instituição"* — a coordenação olha a linha da casa dela no **Arquivo**, e é lá que a porta tem de estar. Botão onde a pessoa não passa é botão que não existe. *(3)* **E a folha das oito casas não abria no protótipo, desde sempre:** o casamento de rota do servidor de mentira tinha `if (seg[0] === 'shifts' && seg.length === 2)` e mais nada, então `POST /shifts/general-ata` caía ali — "general-ata" é palavra literal na posição de `:id`; o `find(...)!` devolvia `undefined` e a tela do Líder Noturno Geral mostrava *"Cannot read properties of undefined"* em vez da ATA. **Ninguém viu porque a cobrança do ensaio olhava o TÍTULO**, que aparece também na linha desta casa; passei a cobrar os códigos das oito casas e o defeito apareceu. É a mesma família do achado da fase 128 — casamento de rota que aceita palavra onde espera parâmetro |

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

O `globalSetup` do Jest derruba e recria o schema a cada rodada, roda as
130 migrações em ordem e aplica os seeds (`seed.ts`, `seed-fase2.ts`, `seed-fase4.ts`).

### Os ensaios — e por que cada um existe

`tsc` diz que compila. Nunca disse que renderiza.

| Comando | O que ele faz |
|---|---|
| `npm run ensaio` | percorre as 132 telas dos sete cargos oferecidos num navegador de verdade, cobrando que nenhuma deixe erro no console, que escreva alguma coisa e que não mostre `undefined` para quem lê. **Tela nova entra neste percurso.** |
| `npm run ensaio:fila` | corta o sinal, marca a chamada, fecha e abre o aplicativo, religa, e confere que **só o que o servidor confirmou** saiu do aparelho |
| `npm run ensaio:folhas` | os caminhos de documento até o arquivo baixar: abre a folha, tenta baixar com finalidade curta demais, baixa com frase válida, confere que o `.docx` chegou |
| `npm run ensaio:roteiro` | cobra que as 49 tarefas do roteiro do Marcelo tenham porta no cargo certo. Não simula a procura de uma pessoa — mas impede o fracasso barato: a tarefa não ter porta, e isso aparecer diante da equipe |
| `npm run ensaio:acessibilidade` | axe-core (WCAG 2.1 AA) nas 139 telas — sete a mais que o `ensaio` porque confere também a folha do "Mais" de cada cargo, aberta dezenas de vezes por turno. **Cor nova passa por ele antes de entrar** |
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
│   │   └── modules/       18 partições, cada uma dona das próprias migrações
│   ├── test/              85 suítes (e2e contra PostgreSQL real + estáticas)
│   ├── scripts/           ensaio-carga.ts, migrador compilado
│   └── assets/timbre.png  a marca da Fundação, usada no documento em Word
├── frontend/
│   ├── src/
│   │   ├── screens/       36 telas React
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

**As 18 partições:** activities, alignments, archive, checks, houses, identity,
incidents, medications, notifications, nursing, people, relogio, reports,
routine, shifts, statements, sync, timeline.

*A `relogio` nasceu na fase 103 e ficou fora desta lista até a 105: o conferidor
lê o NÚMERO colado ao substantivo — "18 partições" — e não os nomes ao lado.
**Lista escrita à mão ao lado de número conferido envelhece sozinha**, e é a
lista que alguém lê para saber o que existe.*

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

**E o `search_path` das funções privilegiadas, desde a fase 102.** Toda função
`SECURITY DEFINER` — que roda como dona do banco — precisa dizer onde procurar
os objetos que usa. A conferência pergunta ao catálogo, e não ao texto das
migrações, por um motivo específico: **`CREATE OR REPLACE FUNCTION` apaga o
`SET` de uma função que já o tinha**, então quem olhasse só a migração que
fixou não veria a que redefiniu depois. Ao lado dela, a conferência de que a
aplicação **não pode criar schema nem objeto** — é essa condição que mantém o
risco teórico, e ela é uma concessão de distância.

**E o RLS, desde a fase 100.** `arquivo-tem-saida.spec.ts` pergunta ao catálogo
se alguma tabela está sem RLS — a garantia central do sistema, a que faz a casa
03 não ler a 04 porque o BANCO recusa, e não porque o serviço lembrou de
filtrar. Exceção só com motivo escrito, e exceção que deixa de ser usada
reprova. Ao lado, uma segunda: nenhuma tabela pode **negar tudo em silêncio** —
RLS ligado sem política, com a aplicação tendo privilégio, deixa a tela vazia
sem ninguém entender por quê. *A primeira versão desta segunda acusava
`user_invite`, e o errado era o teste: lá a aplicação não tem privilégio
nenhum, e a tabela só é alcançada por função `SECURITY DEFINER` — que é mais
fechado, não menos.*

**E a data que nasce no banco (fase 99).** `arquivo-tem-saida.spec.ts` pergunta
ao CATÁLOGO (`pg_attrdef`) se alguma coluna ainda tem `DEFAULT current_date` ou
`now()::date` — o dia do fuso do servidor, que depois das 21h em Porto Alegre já
é o dia seguinte. Pergunta ao catálogo, e não ao texto das migrações, porque um
`DEFAULT` antigo corrigido por `ALTER` some de `pg_attrdef` e não some do
`grep`. Vem com uma segunda conferência ao lado, que falha se `app_hoje()` e o
dia de Porto Alegre discordarem: sem ela, a primeira passaria num banco onde os
dois coincidem por acaso e ninguém saberia que não prova nada.

**E o SQL, desde a fase 96, num campo próprio.** As conferências acima leem
`import`. As migrações escapavam: **dez partições** liam tabelas de outras sem
declarar nada — `shifts` lendo a prescrição e a dose, `nursing` lendo a
restrição alimentar, `identity` lendo `house_stay`. Cada manifesto passou a
declarar `dependeDoEsquemaDe`, e o `arquitetura.spec.ts` cobra as duas direções:
uso não declarado reprova, e declaração que deixou de ser usada também.

**Por que campo próprio, e não `depends`:** são coisas diferentes, e uma delas
tem **ciclo**. `identity` lê `house_stay` de `people`, e `people` lê tabela de
`identity`; o mesmo entre `identity` e `archive`. Em código, ciclo é defeito e o
teste acima o proíbe; no banco, que é um só, a chave estrangeira aponta nos dois
sentidos e isso é normal. Jogar tudo em `depends` criaria 34 ciclos e derrubaria
a conferência que funciona.

**O que isso corrige na promessa abaixo:** remover um módulo não é só apagar a
linha do `import`. É preciso olhar quem lê as tabelas dele — `dependeDoEsquemaDe`
diz quem são, e agora dizer errado reprova.

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

**As fontes do protótipo vão EMBUTIDAS** desde a fase 97 — subconjunto latino,
só os pesos que o CSS usa, 116 KB. Aberto sem internet, que é como o arquivo é
entregue, a letra é a mesma; e nenhuma abertura manda o IP de quem abriu para
um terceiro. Geradas por `scripts/gerar-fontes.mjs`, que roda no build; o
`fontes.css` é gerado e não versionado.

### 4.10 Os testes que guardam a arquitetura

Além dos e2e, sete suítes estáticas — todas já pegaram erro de verdade:

| Suíte | O que ela cobra |
|---|---|
| `arquitetura.spec.ts` | as fronteiras entre partições **no código E no SQL** (`dependeDoEsquemaDe`, fase 96); o marcador `rls-join-ok:` obrigatório perto de todo JOIN; e, desde as fases 90, 91 e 96, **nenhuma função do banco nem serviço que confere o estado numa leitura e grava só pelo id** (regra 11), inclusive quando o estado mora em coluna de fechamento (`signed_at`, `revoked_at`, `answered_at`). As exceções são escritas por extenso, com o motivo, e exceção que deixa de ser usada reprova |
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

**E um degrau acima, achado na fase 107: teste não guarda o resultado de uma
pergunta sobre AGORA.** `regressao-autoria.e2e.spec.ts` tinha
`const HOJE = hojeNaInstituicao()` no topo do arquivo, avaliado ao CARREGAR — e
a suíte inteira leva um minuto e meio. Numa rodada que começou às **23h58** e
terminou depois da meia-noite, dois testes reprovaram: um comparou o dia do
banco, já no dia seguinte, com um texto capturado no dia anterior; o outro pediu
a lista de um dia que tinha acabado. **Os dois relógios estavam certos e em
dia** — o que envelheceu foi a constante. Nenhum dos dois era defeito do
sistema, e os dois pareciam um, na única condição de relógio em que a suíte é
rodada de propósito. Agora é `hoje()`, lido na hora do uso: a janela de erro
passou de noventa segundos para alguns milissegundos. *A prova definitiva é a
próxima rodada que atravessar a meia-noite com os dois relógios reais — no
relógio real de agora ela passa, e isto está escrito porque a falha, quando
voltar, vai parecer qualquer outra coisa.*

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
| Auditoria: entra-se pela CRIANÇA ou pelo REGISTRO — **nunca por pessoa da equipe**, e sem contagem (fase 112) | — | — | — | ✅ | — | — | ✅ |
| **O trabalho da equipe** — o que uma pessoa ou um setor registrou, com finalidade escrita e a consulta auditada; **sem contar nada** (fase 117, pedido da Fundação) | — | ✅ própria casa | ✅ própria casa | ✅ própria casa | — | — | ✅ as oito |
| **O painel das oito casas** — crianças, quem passou de ano, conquistas, reuniões, escala, internações, medicamentos, lanches, cestas, acompanhamentos, ATAs, ocorrências e gasto. É a TELA INICIAL dele (fase 120) | — | — | — | — | — | — | ✅ |
| **O relato da convivência familiar** — sem prazo, sem estado e quantas vezes for preciso; a porta abre na saída e não fecha nunca. *"Houve alteração"* é opcional e avisa a técnica e a coordenação (fase 122, correção da Fundação). **Quem alcança a casa escreve** — não há conferência de cargo, e é decisão escrita: a criança conta para quem ela confia | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **O período da casa** — *"uma ata geral de toda semana"*, de um dia a seis meses: o que aconteceu em texto, com a parte boa primeiro, *"quem não está comendo o quê"* e os números no fim. Texto de acesso restrito sai só como CONTAGEM, porque esta folha circula (fase 121, pedido da Fundação) | — | ✅ própria casa | ✅ própria casa | ✅ própria casa | — | — | ✅ as oito |
| **As contagens do trabalho** — por casa, setor, pessoa e tipo de ação. Ordem por NOME, nunca por total; **nenhuma contagem por criança**; aviso junto do número (fase 119, decisão da Fundação) | — | — | — | — | — | — | ✅ |
| Registrar conclusão **pelo colega** | — | ✅ | — | ✅ | — | ✅ | ✅ |
| Delegar atividade em aberto | — | ✅ | — | ✅ | — | ✅ | ✅ |
| Autorizar ou **recusar** substituição | — | ✅ | ✅ | ✅ | — | ✅ | — |
| Ver o painel do plantão | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Convidar para o primeiro acesso | — | — | — | ✅ própria casa | — | — | ✅ |
| Ler a escala de plantão da casa | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Ler a ATA do turno anterior | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Escrever linha na ATA do turno | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ler e escrever a linha RESTRITA da ATA | — | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Montar a escala — escalar, **substituir num gesto**, retirar, folha. Decisão da Fundação em 15/09: *"pela equipe técnica, o coordenador ou o educador líder"* (fase 123) | — | ✅ própria casa | ✅ própria casa | ✅ própria casa | — | — | ✅ |

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

### 8.2.2 A pauta que quem trabalha na casa propõe

Pedido do Marcelo em 09/09, e a frase dele é a razão de tudo o que vem abaixo:
**"uma pauta recusada sem resposta é pior do que não poder propor"**.

Qualquer pessoa com alcance na casa propõe um assunto para a próxima reunião —
o educador e a enfermagem inclusive. Responde quem conduz: técnica, liderança
de turno e coordenação. **Recusar e adiar exigem resposta escrita**, e isso
está no serviço E no banco (`ck_pauta_recusa_responde`), porque é a garantia,
não a mensagem. **Adiar conta como recusar:** "fica para a próxima" sem uma
palavra é recusa com outro nome, e quem propôs continua sem saber se vale
insistir. **Aceitar não exige nada** — a resposta é o assunto aparecer na pauta.

**Quem propôs lê a resposta, e é avisado** — principalmente quando é não. Sem o
aviso, a resposta ficaria numa tela que o educador da noite talvez nunca abra.
E a leitura é de toda a casa: resposta que só a coordenação enxerga é a mesma
coisa que resposta nenhuma. O texto proposto é imutável, como o do combinado.

**O sistema garante o canal, não a qualidade da resposta.** Um "não é o
momento" atende à regra e não atende ao pedido. Por isso a tarefa 12.1 do
roteiro manda anotar a frase que a técnica escrever: se ela for burocrática, o
problema é de equipe, e nenhum campo obrigatório resolve.

**E o que foi decidido chega a quem não estava.** A reunião com combinados
dispara aviso para o plantão da casa e para o Líder Noturno Geral — que é o
caso que ele deu, "a maioria das reuniões é diurna e o noturno não vai". Até
aqui o combinado ficava *visível* para todos, que não é a mesma coisa que
avisar. Quem conduziu a reunião **não** recebe: avisar quem acabou de decidir é
ruído, e ruído ensina a ignorar aviso. Reunião sem combinado não dispara nada.

### 8.2.3 O estatuto: as regras de convivência

Última parte do pedido de 09/09, e a que ficou de fora da fase 94 de propósito.
**O combinado é operacional e datado**; a regra de convivência é permanente e
vale para quem chegar depois. Juntas, o estatuto envelheceria entre decisões de
terça, e a casa perderia o lugar onde se lê o que vale sempre.

**Dois alcances:** a regra da casa, que a coordenação escreve, e a regra da
instituição, que só a gestão geral escreve e que aparece nas oito casas sem que
nenhuma a edite. **Um público por regra** — todos, equipe, ou crianças e
adolescentes —, que é o que permite afixar no corredor só o que é delas.
**Mudar é escrever outra que substitui**, e a anterior continua legível:
quem foi advertido em março tem direito a ler a regra de março. **Revogar exige
motivo**, e nada se apaga. A regra pode valer **a partir de uma data**, e até
lá aparece na tela dizendo que ainda não vale — mas não vai para a folha
afixada, porque uma parede não tem como dizer "vale a partir de segunda" sem
confundir quem lê na sexta.

**O que o estatuto não guarda, e não vai guardar:** quem descumpriu, contagem
de descumprimento, e consequência prevista. Isso já tem lugar — a ocorrência,
com revisão técnica. Uma lista de infrações ao lado da regra transforma o
estatuto num instrumento disciplinar, e um histórico de "quantas vezes a Alice
quebrou a regra 4" é exatamente o documento que ninguém deveria poder gerar
sobre uma criança de 12 anos.

**O que ele ainda não tem, e é pergunta para a casa:** lugar para a criança
discordar. O estatuto é escrito pela coordenação; se existe assembleia ou
qualquer momento em que as crianças opinam, o sistema não mostra que a regra
passou por ali. É a pergunta 8 do roteiro, e é da Fundação — o sistema não deve
fingir que houve participação.

### 8.2.4 Os aniversários, e as casas pelo nome

Dois pedidos do Marcelo, anotados num bloco de notas e recuperados em 12/09.

**As casas pelo nome.** Ele foi literal: "só é que ele tivesse uma forma de
poder olhar as casas pelo nome, simples assim". A tela de unidades mostrava as
oito e os cartões **não abriam**; quem tem alcance em várias — o Gestor Geral,
a Enfermagem — ficava preso à primeira da lista. Agora o cartão abre o Dia
daquela casa, com uma faixa dizendo qual se está olhando e o caminho de volta.

**Os aniversários.** A data de nascimento já estava no perfil, mas o
aniversário só aparecia DEPOIS, como memória no álbum. Agora a casa é avisada a
sete dias, a três e no dia, e a faixa fica no alto do Dia — ele pediu
exatamente para ninguém ter de procurar, "pra não ter que ler papel na parede".
O botão **"A casa está ciente"** faz o aviso parar; sem isso o sistema repetiria
até o dia, e aviso que não para ensina a ignorar aviso. A lista aceita janela
maior, para a casa que junta os aniversariantes do mês — ele não sabia se é
assim, e as duas leituras cabem na mesma tela.

**O sistema não pergunta se houve festa**, e não vai perguntar. Uma casa com
crianças pequenas e uma de adolescentes fazem isso de formas diferentes, e "fez
festa" como campo é o primeiro passo para alguém cobrar o número depois.

**O que NÃO foi construído, e está na §10:** a visão de cima do gestor — "como
está o andamento da vida das crianças" em cada casa, com vários parâmetros, sem
entrar criança por criança. Ele foi explícito: **nada de competição**. Construir
isso adivinhando já deu errado uma vez, e virou a pergunta 9 do roteiro.

### 8.3 O turno

O **Dia** com a rotina versionada da casa e quatro filtros, entre eles **"Por
criança"** — uma linha por acolhido, em **ordem alfabética**, com o alerta
essencial primeiro. *Não é ordenado por pendência de propósito: se fosse, as
mesmas crianças ficariam no topo todo dia.*

Chamadas coletivas com conferência de mesa — e, no perfil de cada criança, o
bloco **Presença**, que mostra o que foi registrado dela nas chamadas dos
últimos catorze dias: só o que teve exceção por padrão, com a frase escrita ao
lado e com a correção, se houve. **Sem contar falta, recusa nem percentual** —
número na tela de uma criança é o começo de uma ficha de comportamento;
**painel do plantão** (quem está em quê agora); delegação e substituição, que são coisas diferentes — delegar é
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

**A dose confirmada registra `consumo` no histórico do armário, e o histórico
ABRE.** O número já caía desde a fase 6; faltava o histórico dizer por quê — ele
mostrava caixas chegando e nenhuma saindo — e, até a fase 109, faltava o lugar
de olhar: cada item do armário tem agora o botão de olho, com o que entrou, o
que saiu pela dose, o que foi com a criança e o que a conferência ajustou, cada
linha com motivo e com o nome de quem a fez. **Sem contagem por pessoa**: somar
movimento por educador é medir gente. Recusada, não administrada e indisponível não
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
| **Prontuário Individual de Evolução – Educação** | **sala de recursos** (motivo e professor), **equipe multiprofissional** (fono, pedagoga, psicopedagoga), **aprendizagem profissional** (curso, turno, unidade, local de trabalho) e a evolução educacional datada — que o educador também escreve, porque quem acompanha a tarefa de casa é ele. *Até a fase 111 isso existia só no banco: o relatório lia as duas tabelas e nenhuma rota as escrevia. Hoje o bloco **Educação** no perfil preenche as duas* |
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

### Grupo 1 — falta para o piloto: **NADA de código** ✅

*Esteve VAZIO da fase 100 até 20/09/2026, quando a chamada que não fecha o
ocupou por um dia. **Voltou a estar vazio na fase 127.** A frase que fica aqui é
a de sempre, e ela é a medida do piloto:* **tudo o que a educadora de plantão
precisa fazer às 23h tem porta.**

~~**A chamada não fecha quando alguém da casa está fora dela.**~~ ✅
**CORRIGIDO NA FASE 127.** A migração `1350` pôs num lugar só a resposta para "de
quem esta chamada trata" — `app_efetivo_da_chamada`, por DIA e não por agora —, e
as três funções do banco e o serviço passaram a perguntar a ela em vez de repetir
a regra cada um do seu jeito. As três `SECURITY DEFINER` ganharam o `search_path`
por extenso, e a suíte `quem-a-chamada-cobra.e2e.spec.ts` guarda o defeito com
cinco testes. O relato inteiro está no §2.

*E uma coisa que este item afirmava e não era verdade: **não eram três testes de
`conferencia-de-mesa` que guardavam o defeito.** Nenhuma suíte o guardava —
`hospitalization` e `family_stay` chegam vazias do seed, então nenhuma
encontrava alguém fora da casa. As três falhas eram o eco de um rascunho que
morava em `backend/test/` e deixava uma internação aberta no banco
compartilhado. O defeito era real; a prova de que ele existia, não.*

### Grupo 2 — o que esperava decisão de gente: **vazio** (as três caíram nas fases 134, 136 e 138)

Nenhuma está parada por falta de código.

1. **Leitura excepcional de relato** (`POST /statements/:id/exceptional-read`).
   ✅ **Metade resolvida na fase 128.** A regra já estava pronta: o Gestor Geral
   só abre uma narrativa pessoal declarando a finalidade, e o comando registra
   **antes** de devolver o conteúdo. O que travava era ele não ter como saber que
   o relato existe — e isso acabou: a resposta de 20/09 foi **só a contagem**, e
   o perfil da criança passou a dizer *"existem N relatos em área restrita"*.

   ✅ **A outra metade chegou em 21/09 e virou a fase 136:** *"gestor abrir o que
   quiser"* — o caminho **(b)**, N portas opacas, e não um botão que abrisse
   todas. Cada abertura leva a sua própria finalidade e o seu próprio registro; a
   porta não diz data, autor nem trecho; e **a ordem sai do identificador, não da
   data**, porque ordenar por data entregaria a cronologia sem abrir nada — e
   cronologia já é narrativa.
2. ~~**Fontes do acompanhamento**~~ ✅ **feito na fase 134.** A rota que gravava
   a referência existia desde a 0490 e pedia `entidade` e `entityId` digitados à
   mão; agora o `GET /followups/:id/sources` lista os candidatos do período — as
   três origens numa lista só, como a resposta §10.7 de 20/09 pediu — e a folha
   de escrever o acompanhamento passou a oferecê-los. **O conteúdo da ocorrência
   restrita não sai na lista**, só a referência: esta folha se imprime.
3. ~~**A correção da linha de uma casa na ATA Geral**~~ ✅ **feito na fase 138.**
   A resposta de 21/09 foi *"o educador líder, equipe técnica ou coordenador, tudo
   ficando registrado para esses 3"*. O que constava antes fica guardado por
   gatilho e aparece na folha, com quem corrigiu e por quê. **A §10.2 continua
   aberta para os OUTROS cargos** — esta fase respondeu só o que a decisão
   implica: quem corrige, lê.

### Grupo 2.5 — o que as respostas de 15/09 abriram, medido

*Ele descreveu como quer três coisas. Antes de construir, eu medi o que já
existe — e a maior parte existe. O que segue é só a diferença, com prova.*

**A escala (§8.4).** Funciona quase exatamente como ele descreveu: lançamento
por data e turno, repetição de padrão a cada 1 a 7 dias, até um ano à frente,
retirada que some do turno na hora, nada apagado, e a folha para a parede.
Faltam **três**:

| O que ele disse | O que existe | O que falta |
|---|---|---|
| *"a equipe técnica, o coordenador ou o educador líder"* lançam | só coordenação e gestão montavam | ✅ **fase 123** — os dois entraram, na RLS e na função |
| *"cada um com a sua cor diferente"* | a cor existia (`0990`) e era usada só **na ATA** | ✅ **fase 123** — a escala carrega e desenha, com o nome ao lado; o hash foi para `rotulos.ts`, para não haver duas cópias |
| *"a gente não vai deduzir a escala"* | caía para a escala semanal e depois para o vínculo da casa (`0960`), declarando a fonte | ✅ **fase 129** — a dedução saiu. Sem escala lançada, **ninguém é nomeado**, e a tela diz em vermelho que ninguém a lançou. Assinar continua aberto a quem esteve: a escala decide quem é **cobrado**, nunca quem **pode** |
| *"substituir"* num gesto | eram dois atos: Retirar, e depois Escalar alguém | ✅ **fase 123** — uma transação, com o parentesco guardado; *"deixar a menos"* continua sendo a retirada |

**As fotos e os documentos da criança.** O dossiê já guarda documento
digitalizado com prévia, aceite e abertura registrada; o álbum de vivências já
guarda fotos **sem limite de quantidade**, uma por vivência, com prévia antes
de confirmar. Faltam **três**:

| O que ele disse | O que existe | O que falta |
|---|---|---|
| *"tirar VÁRIAS fotos"* da criança | o **perfil** tem UMA foto de identificação, e a nova sobrescreve a anterior; o **álbum** aceitava quantas quisesse, mas **uma por vivência** | ✅ **fase 124** — `memory_photo`: uma vivência tem quantas fotos tiver, com prévia de todas antes de confirmar e a autorização por foto |
| *"poder visualizar a hora que quiserem e BAIXAR"* | o dossiê abria a prévia e **não oferecia baixar** | ✅ **fase 124** — por rota própria, que registra `document.download`: abrir é ler na tela, sair com o arquivo é outro ato |
| a foto de identificação | **não baixa, por decisão minha escrita** — *"a foto não é botão de download"* | é uma decisão dele desfazer, e vale perguntar em vez de presumir |

**A Enfermagem anexando no perfil.** Ela já alcança o perfil, escreve saúde
(condições, restrição alimentar, evolução) e pode anexar no dossiê. Falta
**uma coisa, e ela é a frase dele inteira**:

| O que ele disse | O que existe | O que falta |
|---|---|---|
| *"se quiserem botar alguma receita, que já caia direto no perfil da criança"* | a receita da prescrição vivia em `prescription_document`, presa à prescrição, na tela de Saúde — **não** criava linha em `document`, e o dossiê só lê `document` | ✅ **fase 125** — a receita e a **bula** chegam ao dossiê por espelho, apontando para o mesmo arquivo guardado, idempotente pela origem |
| *"gerenciar os dados dela"* | a Enfermagem **não** edita cadastro nem escola — só saúde | perguntar se ele quis dizer isso mesmo, ou só a parte de saúde |

*E o **anexo do diário de internação** não chegava ao perfil pelo mesmo motivo:
ele grava em `hospitalization_note`, tabela própria. ✅ **fase 125** — chega
também, e é o laudo que o hospital entregou.*

*Este levantamento dizia **"é o mesmo defeito, três vezes"**, contando a **nota
fiscal** do medicamento junto. Ao construir a fase 125 eu medi de novo, e ela
não entra: `medication_purchase` tem `house_id` e **não tem pessoa**. A nota
fiscal é uma compra da CASA — o remédio comprado serve a quem precisar dele —, e
espelhá-la no dossiê de uma criança seria inventar um vínculo que o dado não tem
e pôr uma despesa da casa no prontuário de alguém. **São duas vezes, não três**,
e um teste guarda a diferença.*

**O que a fase 137 deixou para a próxima, e está aqui para não ser esquecido:**
o **painel do Gestor Geral ainda não conta o conceito do bimestre.** A caixa que
a Fundação pediu — *"crianças com bom acompanhamento educacional"* — passou a ter
de onde sair, e ainda não sai: a função `app_metricas_das_casas` (1280) devolve
uma tabela de colunas fixas, e acrescentar uma exige derrubar e recriar a função
inteira. Não fiz de passagem no fim de uma fase. A tela **diz** que não conta, em
vez de deixar o gestor supor que conta.

### Grupo 3 — as 11 rotas sem porta

O número **não é contagem à mão**: é o tamanho da lista de exceções do
`rotas-sem-porta.spec.ts`, onde cada linha traz o motivo por extenso. Eram 34 em
01/09. Doze são rota de máquina que não deve ter tela — geração das doses e do
dia, geração da agenda, o aviso de aniversário, escalonamento de dose vencida,
marcação de atividade não
confirmada, health check, `GET /medications/alert-offsets` e
`/can-administer` (o aparelho pergunta; quem decide continua sendo o servidor),
`GET /activities` e `GET /transfers/pending` (leituras cruas que a tela já
recebe juntas) e `GET /people/:id/admission` (a ficha inteira, para o documento
e para a migração da implantação).

**Subiu para 16 na fase 128 e voltou a 14 na 130, e a ida e a volta contam a
mesma história.** Na 128 o conferidor **parou de dar porta a quem não tinha**: o
`temPorta` aceitava que o `:x` de uma chamada da tela casasse com uma PALAVRA da
rota, e com isso qualquer chamada nova de três segmentos dava porta a qualquer
rota de três segmentos. Foi uma chamada nova daquela fase que revelou o defeito —
`/statements/person/:x` declarou que `POST /statements/:id/exceptional-read`
tinha ganhado tela, e ela não tinha. **Um conferidor que dá porta a quem não tem
é pior do que não existir:** ele apaga a única lista onde o motivo de uma rota
não ter tela está escrito.

As duas que apareceram ficaram declaradas como **LACUNAS**, com essa palavra
escrita, e não como decisão — e **as duas foram consertadas na fase 130**: a de
Educação virou chamada, a do dossiê virou remoção. *A lista voltou ao tamanho de
antes sem que nenhuma linha dela tenha sido afrouxada, que é o único jeito
honesto de uma lista de exceções encolher.*

### Achados de passagem, ainda sem conserto

~~**1. A tela de Educação inventa a própria lista.**~~ ✅ **CONSERTADO NA FASE
130.** O servidor oferecia `GET /nursing/education/kinds` com os serviços do
prontuário e **a tela não a pedia**: trazia `Fonoaudiologia` e `Psicopedagogia`
escritos no HTML, em `<option>`. Era a §12.2 ao contrário — *"a tela não inventa
a sua lista"* —, e o dia em que a Fundação acrescentasse um serviço o servidor
saberia e a tela não. Agora a lista vem do servidor, e **quando ela não chega a
tela DIZ isso** em vez de oferecer uma escrita à mão que pode já estar diferente.

~~**2. A leitura de UM documento do dossiê não tem quem a chame.**~~ ✅
**REMOVIDA NA FASE 130**, e o que ela provava mudou de lugar.
`GET /people/:id/documents/:docId` era **restolho de um plano que não
aconteceu**: devolvia metadado e anunciava
`download: { pronto: false, motivo: 'Armazenamento de objetos entra na Fase 3' }`
— e o baixar chegou na fase 124 por outra rota. Pior: **registrava
`document.open` sem nada ser aberto.** Nenhuma tela a chamava, e o servidor de
mentira nem a atendia.

*O que fez a decisão ser "sai" e não "ganha uso":* ela era o sujeito do **cenário
#24**, que prova a fronteira mais importante do dossiê — o educador levando 404
no documento judicial, idêntico a inexistente. Medi antes de remover: o `/file`,
que é por onde a tela passa, **segura a mesma fronteira** (RLS filtra, 404
idêntico, abertura auditada). Então o cenário mudou de rota, e a fronteira passou
a ser provada onde alguém de verdade passa. **Fronteira provada em rota que
ninguém abre é fronteira que ninguém confere.**

*E o cenário ficou mais honesto no caminho:* o documento de saúde do seed não tem
bytes, e o `/file` recusa por FALTA DE ARQUIVO antes de chegar à política — o
teste passaria por motivo errado. Agora ele anexa um documento com arquivo pela
via normal da tela, e só então cobra a fronteira.

*Fica um terceiro achado, pequeno, e anotado em vez de construído: o
`GET /nursing/education/kinds` oferece também os **modos** (presencial, online) e
a tela **não tem esse campo**. Não inventei um: campo que ninguém pediu é campo
que ninguém preenche, e o prontuário já tem catorze.*

*O risco de `user_session` e `login_attempt`, anotado aqui na fase 100, foi
fechado na 101: as operações viraram funções `SECURITY DEFINER` e a aplicação
perdeu o acesso direto às duas tabelas. A conferência prova isso pela conexão
da APLICAÇÃO, não pela de dono — com a de dono, tudo passaria e o teste diria o
contrário do que se quer saber.*

*Os dois achados que estavam aqui viraram conferência na fase 96 (§4.3 e
§4.10). Nenhum era defeito em operação: o que havia era garantia que ninguém
garantia — a fronteira de SQL não era lida por nada, e as colunas de fechamento
tinham sido lidas uma vez, à mão, na fase 91.*

*As quatro funções que gravavam só pelo id, anotadas aqui na fase 89, foram
provadas e consertadas na 90 (§6.11).*

### A varredura de 14/09 (fase 106): o que não vai a lugar nenhum

*Pedido do Leonardo: procurar ponta solta, informação que não chega a lugar
nenhum, e coisa começada que não ficou ligada em nada. Feito por medição — três
varreduras sobre as tabelas de então (112), as 1236 colunas e as 102 colunas de autoria —,
e não por leitura de memória. **Nada foi consertado ainda**: cada item abaixo é
um achado com o caminho conferido.*

*O que a varredura NÃO achou também é resultado: das 102 colunas de autoria,
**100 chegam a uma tela com o nome escrito**. A regra 6 está de pé onde importa,
e as duas exceções estão listadas abaixo.*

**1. A auditoria inteira é escrita e não tem por onde ser lida.** ✅ **Resolvido
na fase 112.** Todo serviço
grava em `audit_event` — é o lastro do "toda ação tem autor e histórico" — e
**não existe rota**, em controller nenhum, que leia essa tabela. Só duas fatias
saem: quem abriu o **cofre** (migração 0560) e quem abriu os **benefícios**
(0830). Tudo o mais — cada exportação com a sua finalidade, cada abertura de
área restrita, cada escalonamento, cada correção — é gravado e não tem tela.
E a §7 promete a linha **"Auditoria (leitura)"** à coordenação na própria casa e
ao Gestor Geral: é uma capacidade da matriz **sem porta nenhuma**. O
`rotas-sem-porta.spec.ts` não pega isto, e não é defeito dele: ele confere rota
sem tela, e aqui não há nem rota.

**O que a fase 112 fez, e a decisão que a desenha.** `GET /audit/person/:id` e
`GET /audit/entity/:entidade/:id`, com o bloco **"Quem mexeu no registro desta
criança"** no perfil — que nem aparece para quem não alcança, porque oferecer
uma porta que o servidor vai recusar ensina a não confiar na tela.

**Duas entradas, e nenhuma terceira.** A diferença entre auditoria e vigilância
da equipe não é técnica: é a pergunta que a tela deixa fazer. *"Quem abriu o
dossiê da Alice"* protege a criança; *"tudo o que a Joana fez ontem"* mede a
pessoa — e as duas leem a mesma tabela. Por isso **não existe busca por ator**,
e não vai existir: entra-se pela criança ou pelo registro, e o nome de quem
agiu aparece na linha, como aparece em toda tela deste sistema, sem nunca ser o
filtro. **E não conta nada** — nem acessos, nem aberturas por pessoa, pela
mesma razão que proíbe somar plantão por nome (§7), pedido de lanche por
educador (§8.9.1) e movimento de armário por quem o fez (fase 109).

*Um teste guarda as duas coisas: que `/audit/actor/:id`, `/audit/user/:id` e
`?actorId=` devolvem 404, e que a resposta não tem nenhuma chave de total. É o
mesmo cuidado que guarda a pontuação de comportamento por expressão regular —
o que se quer impedir não é o defeito de hoje, é a refatoração distraída de
daqui a um ano.*

*O recorte é do BANCO:* a policy `audit_select` (0920) já dizia exatamente o
que a §7 promete. A fase acrescentou índices, e por um motivo que a própria
0920 escreveu: **uma tela de auditoria que demora é uma tela que não se
consulta** — e isso é a mesma coisa que não poder consultá-la, que era o
defeito. Os dois índices que existiam serviam a quem não vai perguntar: um por
**ator**, que é a busca recusada, e um por casa inteira, largo demais.

*Se a Fundação quiser a busca por pessoa — numa apuração formal —, isso é
decisão dela, e vira outro caminho: com finalidade escrita e registro da
própria consulta. Não se acrescenta um filtro desses numa tela que quarenta
pessoas abrem todo dia.*

**2. O histórico do armário não abre.** ✅ **Resolvido na fase 109.**
`medication_stock_movement` tinha três lugares que escreviam e **nenhum que
lia** — a rota `GET /medications/stock` devolve o saldo, não o movimento. A
fase 85 existiu para gravar o `consumo` que faltava, e o comentário da migração
1040 descrevia o sintoma com todas as letras: *"quem abrisse o movimento para
entender uma diferença veria as caixas chegando e nenhuma saindo"*. As caixas
passaram a sair no banco, e continuava sem existir o lugar de abrir. *Era o
exemplo mais limpo de dado certo em gaveta fechada: a suíte lê a tabela por SQL
de dono e passa, o que prova que a linha existe — nunca que alguém a vê.*

**O que a fase 109 fez:** `GET /medications/stock/:id/movements`, e um botão de
olho em cada item do armário. A lista é **cronológica e não conta por pessoa** —
cada linha traz o nome de quem a fez, porque toda ação tem autor (regra 6), e
somar movimento por educador é medir gente, que é o que o painel do plantão já
proíbe (§7). Ela abre para **quem alcança o armário**, e não só para quem o
movimenta: ver a história não é mexer nele, e quem confere a gaveta e acha dois
a menos nem sempre é quem dá entrada. Corta em 200 linhas **e diz que cortou**.
*No caminho, o servidor de mentira deixou de prometer o que não guardava: a
resposta dele já dizia "a diferença ficou no histórico, com o motivo e o seu
nome", e não havia histórico nenhum.*

**3. O Prontuário de Educação não tem por onde ser preenchido.** ✅ **Resolvido
na fase 111.**
`education_support` (sala de recursos, equipe multiprofissional, aprendizagem
profissional) e `education_evolution` (a evolução educacional datada, que o §8.12
diz que *"o educador também escreve, porque quem acompanha a tarefa de casa é
ele"*) são **lidos pelo relatório e não têm nenhuma rota de escrita**. O único
INSERT do repositório está dentro de um teste. No piloto, as duas nascem vazias e
ficam: o relatório de desenvolvimento e a audiência concentrada dirão "não há"
sobre escola e profissionalização **para sempre**, e ninguém vai entender por
quê — a seção existe, o texto sai, e o vazio se lê como ausência de trabalho
(§8.12, o motivo de as onze seções terem virado quatro).

**O que a fase 111 fez:** `GET/POST /nursing/education/:personId` e o bloco
**Educação** no perfil — o apoio (sala de recursos, equipe multiprofissional,
aprendizagem profissional) e a evolução datada. **Quem escreve não foi escolha
desta fase:** as políticas da 0530 já incluíam o educador, e o §8.12 diz por
quê. Duas recusas vêm do papel, não da tela: sala de recursos **exige o
motivo** — é ele que a escola e a audiência perguntam —, e aprendizagem
profissional exige o **nome do curso**. A evolução **não se edita**: correção é
registro novo, como no caderno, e a policy nem oferece UPDATE. Atualizar o
apoio **não apaga o anterior**: a linha antiga é desativada com autor e data,
porque mudar de escola é história da criança.

*Mora na partição `nursing` por acidente de história, e está escrito no
controlador: a 0530 trouxe as DUAS evoluções que a Fundação entregou no mesmo
dia — a de saúde e a de educação —, e as tabelas nasceram ali. Mover tabela
entre partições é migração destrutiva; o caminho da rota é o preço honesto de
não fazer isso.*

**4. A presença da criança não chega à vida dela.** ✅ **Resolvido na fase 110.**
`check_result` só era lido **dentro da própria chamada**. O provedor de linha do tempo das chamadas devolve
vazio na visão de um acolhido — com o comentário *"o registro dele está no
perfil"* — e **não está**: nem no perfil, nem no relatório, nem na trajetória.
Quem quiser saber se a Alice esteve no almoço de terça precisa abrir a chamada
daquele almoço. Junto disso, `check_result_amendment` — a correção de uma
chamada, guardada por gatilho com autor e com o que constava antes — **nunca
era lida por nada**, e `collective_check.confirmed_by` guarda quem fechou a
chamada sem que nenhuma tela diga o nome.

**O que a fase 110 fez:** `GET /checks/person/:personId` e o bloco **Presença**
no perfil, com os últimos catorze dias. A chamada continua coletiva — é assim
que ela é feita —, e o que faltava era o recorte pela vida da criança: a mesma
pergunta que o filtro "Por criança" do Dia responde para hoje, e ninguém
respondia para a semana passada.

Três escolhas, e nenhuma é de tela. **Só o que teve exceção aparece por
padrão**, com "ver tudo" ao lado: quatro refeições por dia viram paisagem, pelo
mesmo motivo que a lista de quem sai sozinho mostra só quem não está
simplesmente liberado (§8.7.2). **A exceção vem com o que foi escrito** —
"recusou" sozinho é um rótulo que atravessa meses, e o §8.14 inteiro é sobre
isso. E **a correção vem junto**, com o que constava antes e quem trocou, o que
finalmente dá leitura ao `check_result_amendment`.

**E ela não conta nada:** nem faltas, nem recusas, nem percentual de presença.
Um número desses na tela de uma criança de doze anos é o começo de uma ficha de
comportamento (regra 3). *Um teste guarda isso pela FORMA da resposta: se
alguém acrescentar `totalDeFaltas`, ele reprova — o mesmo cuidado que o teste
da pontuação de comportamento já tinha.*

~~*Fica de fora ainda o `collective_check.confirmed_by`: quem fechou a chamada
continua sem nome em tela.*~~ ✅ **Resolvido na fase 113**, junto com o
`created_by` da mesma tabela: a chamada diz **quem a abriu** e, depois de
fechada, **quem a fechou e a que horas**.

**4.1 E o que a varredura de 15/09 achou, fechado nas fases 116 a 118.** ✅ A
Fundação pediu a conferência do perfil e do cadastro, e ela achou **seis
coisas**: o motivo do ingresso urgente exigido e não gravado; cinco campos de
cadastro lidos por nada; a ficha de entrada sem tela; o ofício externo, a
convivência familiar e a internação sem caminho de volta à criança.

~~*Fica de fora, e por decisão: **os relatos** (`statement.person_id`, gravado e
nunca lido por pessoa).*~~ ✅ **FEITO NA FASE 128**, quando a resposta chegou.
Listar por criança tudo o que se escreveu **sobre** ela é a narrativa que o
§26.2 protege, e era o item 6 do §10 que travava. Com *"só a contagem"*
respondido, a lista pôde existir: **quem alcança lê, quem não alcança vê o
número** — e a migração `1360` pôs a regra de quem alcança num lugar só, com dois
leitores, a policy e a contagem. *O que eu me recusei a inventar por sete dias levou
uma frase para ser decidido, e é o argumento inteiro de perguntar em vez de
escolher.*

**5. Cinco começos que não ficaram ligados em nada — e quatro deles já foram fechados.**

*A `work_schedule` morreu de verdade nas fases 129 e 131; o "se necessário" ficou ligado na
132; e a fase 133 fechou as duas últimas — uma ligando, outra declarando morta. **Sobra UMA**, e
ela é dormência por decisão escrita, não por esquecimento.*

| O quê | Onde | O que se perde |
|---|---|---|
| `work_schedule` | migração **0010** | ~~Zero leitura e zero escrita, desde a fundação.~~ **A frase estava errada por DOIS leitores, e eu acertei um por vez.** A fase 129 achou a `0960` — que deduzia quem devia assinar a passagem —, tirou-a, e escreveu na tabela um `COMMENT` dizendo *"MORTA desde a 1370"*. **Errado:** o `app_staff_for_commitment` também a lia, e mora noutro módulo. A fase 131 tirou o segundo e corrigiu o comentário. **Agora há teste que cobra a afirmação pelo CATÁLOGO** (`arquivo-tem-saida.spec.ts`): nenhuma função do banco nomeia tabela declarada MORTA. Continua de pé: `DROP TABLE` é migração destrutiva, e não se faz de passagem |
| ~~`health_evolution.companion_name`~~ | 0530 | ✅ **Ligada na fase 133.** E ela não era duplicata do `accompanied_by`: esse é, pela política da 0210, **quem enviou a evolução**; esta é quem LEVOU a criança, que muitas vezes não tem conta no sistema. A pergunta na tela é um botão — nasce em "Fui eu" — e o nome vem ao lado de quem escreveu, nunca no lugar |
| ~~`medication_administration.prn_reason` / `prn_outcome`~~ | 0200 | ✅ **Ligadas na fase 132.** O que faltava não era leitura: era **porta de registro** — prescrição sem horário não gera dose, e a única confirmação que existia exigia uma dose já existente. Agora a dose nasce do ato, com o motivo obrigatório, e o desfecho se escreve depois sem prazo. A porta é no **Dia**, porque quem dá a dose das 2h é o educador |
| ~~`handover_receipt.opened_handover`~~ | 0310 | ✅ **Declarada MORTA na fase 133, e não apagada.** Medido: nenhum `INSERT` a nomeia, nenhum `SELECT` a lê, e o trigger da tabela proíbe `UPDATE` — é `true` em toda linha que existe e em toda que vier. Quem responde *"a pessoa leu a orientação?"* é o `read_guidance`, que nasce `false`. `DROP COLUMN` é migração destrutiva; o que mudou é que a afirmação virou **conferível por teste**, e a suíte reprova se alguém ligar um leitor sem tirar o comentário |
| `medication_authorization` | 0200 | Lida e nunca escrita, e **a frase "a consulta que a lê é peso morto" estava errada por um detalhe que importa:** ela É lida, pelo `medications.service.ts` — em TypeScript, que nenhuma consulta ao catálogo alcança. Medido na fase 132, e foi por isso que o guarda das tabelas MORTAS passou a olhar também as políticas de RLS, as visões e o código do servidor. A dormência em si continua sendo a do §8.6: a decisão de 08/09 trocou autorização de PESSOA por marcação de MEDICAMENTO, então num banco novo ela nasce vazia de propósito — **é dormência por decisão escrita, não por esquecimento**, e removê-la é migração destrutiva |

*E `export_log`: escrita uma vez, lida nunca. Aqui o dano é pequeno e vale
dizer por quê — as outras quinze rotas de exportação passam pelo kernel, que
grava a finalidade no `audit_event`. A finalidade não se perde; ela vai parar no
mesmo lugar do item 1.*

✅ **E as cinco cópias do acervo entraram no kernel na fase 114.** A varredura
as listou como dívida de arrumação — cinco serviços com a mesma linha de
`ARQUIVOS_DIR` — e **não era só arrumação**: ao juntá-las, as cinco não faziam
a mesma conferência. O dossiê aceitava 15 MB e seis tipos, com sha256; a nota
de internação e o marco de vida, 10 MB e três tipos, sem sha; a foto de
identificação, 4 MB e só imagem. **Nenhuma dessas diferenças era defeito**, e
nenhuma foi apagada: o que era acidente virou `RegraDoArquivo`, declarada ao
lado de cada método. **Uma diferença ERA defeito:** o dossiê dava `image/webp`
a qualquer arquivo começando com `RIFF` — que é o cabeçalho de um AVI também —
enquanto a cópia da foto conferia o 9º byte, como manda o formato. Ao juntar,
a correta ganhou, e um teste guarda o AVI recusado. *É o argumento da fase
inteira, e ele apareceu sozinho.*

**6. Os anexos, e a prévia antes de confirmar.** ✅ **Os quatro que guardavam
bytes sem prévia foram resolvidos na fase 107** — o que segue é o estado em que
a varredura os encontrou, e vale ler porque explica o desenho. Dez lugares
recebem documento.
**Três guardam uma referência de texto e não o arquivo** — o anexo da
**ocorrência** (que ao abrir mostra o caminho no Drive, e diz isso na tela), a
**receita** da prescrição e a **nota fiscal** do armário. Nesses três não há
prévia porque não há arquivo, e o §8.6 os descreve como *"digitalizada"*. Dos
sete que guardam bytes de verdade, três têm a prévia inteira — o **dossiê**
(👁 Abrir, e "Conferir agora" enquanto o aceite não saiu), as **memórias** e as
**folhas em Word** — e quatro não têm nenhuma: a **foto de identificação do
acolhido**, que é enviada **no instante em que o arquivo é escolhido**, sem
confirmação e sem ninguém ver o que subiu; a **foto 3×4 do visitante**, lida
para a memória e nunca desenhada; o **documento do hospital**, que só baixa; e o
**comprovante do marco**, idem. *As duas fotos são as que mais pesam: as duas
saem impressas na folha da guarita (§8.9.2), e a da criança é a que "não entra
em documento nenhum por padrão".*

**O que a fase 107 fez com isso.** `frontend/src/anexos.tsx` passou a ser o
lugar único das duas prévias — a de antes de enviar, que acontece **no
aparelho**, e a do arquivo guardado, que é o que o botão de olho abre. Os cinco
lugares agora se parecem: cinco prévias escritas cinco vezes divergiriam no
primeiro ajuste, e a pessoa aprenderia um gesto que não vale na tela ao lado.

- **a foto da criança não sobe mais sozinha**: escolher abre uma folha que
  mostra a imagem e pergunta as duas coisas que dão errado — *é esta foto, e é
  desta criança?* Só o "✓ É esta foto" envia. E a foto guardada abre em tamanho
  de olhar, **sem botão de baixar**: a decisão de tirar uma foto de criança do
  sistema é de quem pede, e fica com o nome dele;
- **a foto 3×4 do visitante** ganha prévia ao escolher e olho para ver a que já
  está lá — e ela abre **no lugar** da folha, não por cima: duas caixas
  empilhadas no celular fazem quem fecha uma fechar a errada;
- **o documento do hospital e o comprovante do marco** abrem na tela, e
  **baixar virou o segundo gesto**, de quem já olhou. Antes, para saber se era
  o documento certo era preciso tirar uma cópia do sistema — que é como
  documento de criança vai parar na pasta de downloads de alguém.

*Dois cuidados que a fase pagou.* O protótipo **não tinha foto nenhuma
guardada** — nem de criança, nem de visitante —, então os dois botões novos
nasceriam invisíveis no único arquivo que o Marcelo abre, pela quarta vez
(§6.19). Entrou um retrato fictício de 494 bytes, duas formas geométricas em
cinza. E o servidor de mentira **recusava** ler a foto do visitante, enquanto o
servidor de verdade a devolve: era o §6.14 ao contrário, e com o olho no lugar
a demonstração diria que o sistema não guarda o que ele guarda.

**E os três de referência, na fase 108: as duas formas, e a casa escolhe.**
Obrigar o arquivo apagaria o caso real de quem já tem o documento no Drive
institucional; obrigar a referência mantinha o defeito. Então o anexo da
**ocorrência**, a **receita** e a **nota fiscal** passaram a aceitar o papel
digitalizado *ou* o caminho — com **uma das duas obrigatória** no banco, que é
o que o `storage_ref NOT NULL` só fingia garantir: ele exigia um texto, e a
tela mandava `receita-${Date.now()}`, uma referência fabricada que não apontava
para lugar nenhum.

Três cuidados ficaram de pé no caminho dos bytes. **Abrir continua sendo um
ato**: os três saem pela função `SECURITY DEFINER` que registra ANTES de
devolver, e o registro agora diz por qual das duas formas — quem ler seis meses
depois precisa saber se a pessoa viu o documento ou um caminho de pasta. **A
chave do objeto não é legível por consulta**, como já não era a referência.
E a tela **diz qual das duas é antes do clique**, com uma pílula: um botão que
às vezes abre um PDF e às vezes devolve o endereço de uma pasta ensina a não
confiar nele.

*No caminho, `kernel/arquivos` virou o lugar único de guardar e ler documento —
eram cinco cópias da mesma linha, cada uma decodificando e conferindo
assinatura do seu jeito, e a fase precisava de mais três. Os cinco serviços
antigos continuam com a cópia deles: trocá-los é mexer em caminho de arquivo de
dado que já existe, e isso não se faz na mesma fase em que se constrói coisa
nova. Fica anotado aqui.*

### O que é meu e ficou pequeno

- **O prazo de triagem da Enfermagem** ~~será parâmetro, e ainda não tem
  valor~~. **Medido na fase 135: ele JÁ é parâmetro** —
  `NURSING_TRIAGE_SLA_HOURS`, lido do ambiente, com 24h de padrão. O que falta
  não é código: é a Fundação dizer se 24h é o prazo dela. Enquanto não disser, o
  valor é meu, e está escrito aqui para não passar por decisão dela.

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
6. ~~**O que o Gestor Geral vê ANTES de abrir um relato restrito.**~~
   ✅ **RESPONDIDA em 20/09/2026: só a contagem.** Vale o mesmo precedente dos
   documentos — *"existem 2 relatos em área restrita"*, e nada mais. Ele sabe
   que há o que pedir; não sabe de quê nem de quando antes de escrever a
   finalidade. **Destrava duas telas:** a leitura excepcional
   (`POST /statements/:id/exceptional-read`) e a listagem por criança do
   `statement.person_id`, que o §9 mantinha fechada por esta pergunta.
7. ~~**De onde a equipe técnica escolhe as fontes de um acompanhamento**~~
   ✅ **RESPONDIDA em 20/09/2026: as três, numa lista só.** Linha do tempo,
   ocorrências e evoluções de saúde do período, numa lista única com filtro por
   tipo. É mais trabalho de uma vez, e é a única que não obriga a técnica a
   adivinhar em qual aba está o que ela lembra.
8. **"Administrado com atraso"** é informação útil para a Enfermagem, ou
   cobrança injusta com quem estava com uma criança no colo? Hoje o sistema
   marca; mudar é trocar o rótulo por um que descreva o fato sem julgar quem
   estava de plantão.
9. **O PIA — último e próximo.** A lista da casa traz duas colunas de data, e
   nas vinte crianças elas são iguais (18/06 e 18/09), o que sugere controle por
   uma data única na planilha, e não por criança. **A pergunta:** as datas são
   mesmo iguais para todo mundo, e o sistema deve avisar por criança quando o
   próximo PIA está chegando — 30 dias antes, na tela da técnica?
10. ~~**As fontes do protótipo.**~~ **Resolvida na fase 97, medindo.** A
    pergunta existia por causa do custo — o documento estimava 300 KB. Com o
    subconjunto **latino** e só os pesos que o CSS usa (400/700 e o itálico na
    Atkinson; 600/700/800 na Jakarta), são 87 KB de arquivo e **116 KB** em
    base64, num protótipo que já tinha 1 MB. Diante disso os dois custos de não
    embutir não se sustentavam: offline a letra não era a que a equipe veria, e
    com internet cada abertura mandava o IP de quem abriu para um terceiro. O
    subconjunto é o latino INTEIRO, e não os caracteres das telas de hoje: o
    protótipo tem campos onde a pessoa digita, e um nome com Ñ sairia na letra
    errada. *Número estimado que trava uma decisão pede medição, não opinião.*
11. **A Enfermagem vê a internação — decisão MINHA, a confirmar.** A resposta da
    coordenação em 03/09 listou equipe técnica, líder educador e coordenador, e
    disse que o educador social comum não vê. Incluí a Enfermagem porque
    internação é primeiro um fato de saúde, e é ela quem responde por medicação
    e retorno. *Ganhou apoio na resposta de 08/09: se a Enfermagem atende das 9h
    às 17h, é ela quem recebe a criança de volta na alta.* Desfaz-se numa linha
    em `app_pode_ver_internacao`.

### As respostas de 20/09/2026 — a rodada que destravou três telas

*Quatro respostas, na noite em que o repositório ficou pronto no Code. Guardadas
com as palavras dele onde ele escreveu por extenso, porque a paráfrase é onde a
decisão se perde.*

| # | Pergunta | A resposta | Situação |
|---|---|---|---|
| §10.6 | **O que o Gestor Geral vê antes de abrir um relato restrito** | **Só a contagem** — o mesmo precedente dos documentos | **Destrava duas telas:** a leitura excepcional, e a listagem de relatos por criança |
| §10.7 | **De onde a técnica escolhe as fontes do acompanhamento** | **As três numa lista só** — linha do tempo, ocorrências e evoluções de saúde do período, com filtro por tipo | ✅ **Feito na fase 134.** `GET /followups/:id/sources` lista os candidatos do período, e o `POST` que existia desde a 0490 ganhou quem o chame. O conteúdo de ocorrência restrita não sai na lista — só a referência |
| §9 2.5 | **A dedução da escala** | *"na vida real as escalas já são montadas com antecedência, apenas irão cadastrar aqui, caso alguém não possa vir eles podem cancelar a pessoa da escala daquele plantão, podendo se quiser também incluir outro funcionário a qualquer momento, tudo fica em registro, mas **não cabe a nós deduzir**"* | **A dedução sai.** Ver o parágrafo abaixo: a consequência foi levantada e ele reafirmou |
| novo | **As notas escolares** — a métrica *"quantas crianças tiveram boas notas"* não tinha de onde sair | **Um conceito geral por período**, por bimestre, com espaço para o porquê. Não boletim com notas por disciplina | ✅ **Feito na fase 137**, com a resposta de 21/09 sobre quem digita (equipe técnica, coordenação e Líder Diurno). O motivo é obrigatório, corrigir não sobrescreve, e o painel do Gestor ainda não conta o conceito — está no §9 |

**A dedução da escala, e a consequência que fica registrada.** Hoje, sem escala
lançada, o sistema cai para a escala semanal e depois para o vínculo da casa
(`0960`), declarando a fonte. Tirando isso, **num dia sem escala lançada ninguém
é apontado para assinar a passagem de plantão**, e a cobrança de relato não sabe
a quem perguntar. A objeção foi levantada e ele reafirmou: a escala é a verdade,
e o sistema não inventa quem estava lá.

*O desenho que sai disso, e ele é reversível:* a escala do dia sem lançamento
fica **vazia e diz que ninguém lançou** — em vermelho, porque é uma pendência da
casa e não um estado normal. E a passagem passa a ser assinada por **quem está
ali** — quem abre o plantão —, com o registro guardando que não havia escala
lançada naquele dia. O sistema deixa de afirmar um nome que não foi escalado; a
educadora das 23h não fica sem poder assinar. *Preferir que a passagem também
trave é uma linha, e é decisão dele.*

### As respostas de 15/09/2026 — a rodada que destravou o piloto

*O Leonardo respondeu, de uma vez, as três perguntas que mais travavam (§2 do
`PARA-A-REUNIAO`) e quatro do roteiro. Está tudo aqui **com as palavras dele**,
porque a paráfrase é onde a decisão se perde. O que virou código está marcado;
o que ainda é decisão de construção está no §9.*

| # | Pergunta | A resposta dele | Situação |
|---|---|---|---|
| 1 | **O que o Gestor Geral precisa ver de cada casa** (aberta desde 09/09; eu tinha recusado adivinhar) | **Duas visões.** A inicial é *"quantitativa, com métricas […] só gráficos, dashboards, bem como aquele de pizza, bem bonitinho, colorido, profissional"*, para ele *"gerar os relatórios dele de impacto do Pão dos Pobres na vida das crianças"*. As métricas que ele nomeou: crianças que passaram de ano, crianças com boas notas, quais casas têm bom acompanhamento e bom desenvolvimento educacional, crianças por casa, reuniões por casa, pessoas na escala de cada casa, internações por casa, medicamentos saindo por casa, **preço total das notas fiscais**, alimentos e lanches por semana e por mês, gasto com cuidado médico. A segunda visão é o acesso total, casa por casa. | **Fase 120** |
| 1b | **E isso não é competição** — ele respondeu à minha objeção, por escrito | *"Não interessa se para ti parece uma competição. Ele precisa ter os dados reais. Qual é a casa que está dando mais resultado? Tem um motivo? Tem algum relatório? Tem alguma coisa que ele possa melhorar nas outras? […] não é uma competição entre elas, mas é uma forma de ele poder melhorar o acompanhamento das outras casas para as outras crianças que não atingiram o tamanho dos resultados."* | **Aceita.** A §7 mudou de texto na fase 119, e o painel da 120 nasce com o comparativo que ele pediu |
| 1c | **Por que o acesso total importa** | *"Caso algum coordenador saia, o gestor tem que ter acesso completo para montar uma nova equipe. Ou se ele quiser fazer uma casa nove — quem define isso? É o gestor. Se ele não tiver acesso total para entender o sistema, não vai conseguir abrir uma nova casa."* E: *"como o dia a dia é controlado pelos coordenadores, ele não vai querer que a tela inicial dele seja essa de controle total."* | **Fase 119** deu o acesso; a **120** dá a tela inicial certa |
| 2 | **A escala 12x36** (travava o aviso de fim de plantão desde 08/09) | *"Quando cadastrar com o coordenador quem é o quadro da equipe, quero que abra para ele a escala, onde ele possa lançar as pessoas, cada um com a sua cor diferente. Preparar semanas, meses antes. **A gente não vai deduzir a escala** — ela já vai ter sido lançada. Quando faltar alguém, eles só vão na escala e tiram aquela pessoa, e ela automaticamente já sai. Substituir ou deixar a menos."* | **Quase tudo já existe** (§8.4). Faltam três coisas, medidas e listadas no §9 |
| 2b | **Quem lança a escala** | *"pela equipe técnica, o coordenador ou o educador líder"* — hoje só a coordenação e a gestão montam | **Muda:** técnica e Líder Diurno passam a montar |
| 3 | **LGPD** (travava o piloto inteiro) | *"Como o sistema é interno para o Pão dos Pobres, a gente pode deixar os dados bem tranquilos para o pessoal poder ler. Porque tanto os educadores, equipe técnica, educador líder, coordenador ou gestor, eles estão ali para proteger as crianças e têm a guarda delas."* Fotos das crianças — no acolhimento e no perfil — **liberadas para a equipe**. *"Apenas os dados mais sigilosos é que têm esse olhar mais carinhoso entre o educador líder, o coordenador, a equipe técnica e o gestor: a questão judicial, acompanhamento socioeducativo, internação, questões comportamentais de agressividade, e a ocorrência grave, vermelha."* | **Destrava o dado real.** *E continua faltando o resto da LGPD: quem responde formalmente, por quanto tempo se guarda, e o que se apaga — ver §11* |

### As quatro do roteiro, respondidas no mesmo dia

| # | Pergunta | A resposta dele | Situação |
|---|---|---|---|
| R1 | **Como a casa quer receber os relatórios obrigatórios** | *"Acompanhamento semanal é um bom caminho: ver como foi a casa toda aquela semana, tipo uma ata geral de toda semana, tanto manhã quanto noite."* E o conteúdo: ocorrências, desorganização, **aumento de medicamentos**, quem não está comendo o quê, desenvolvimento, e *"as observações que os educadores botam têm que ser ponderadas para ser trazido coisas boas e negativas"*. **Período livre:** *"se é um dia, dois, três, uma semana, um mês, seis meses […] esse controle tem que ser livre para eles poderem brincar ali dentro"* | **Fase 121** ✅ |
| R1b | **A inteligência que ele quer no futuro** | *"A gente tem que criar uma inteligência dentro desse sistema que depois pode vir a ser uma inteligência artificial que ajude em tudo […] dar esse conhecimento lá dentro com uma pessoa que é um psicólogo, um pedagogo, um assistente social, para dar esse auxílio para as pessoas reais que têm esse diploma"* | **Anotado, não construído.** É desenho de produto novo, e a frase dele já diz o limite certo: **auxílio a quem tem o diploma**, não substituição |
| R2 | **O convite de primeiro acesso para 40 pessoas** | *"Pode botar ilimitado. A gente não precisa se preocupar com essa questão de número — o coordenador só vai cadastrando conforme as pessoas são contratadas."* E o primeiro acesso: *"todas elas vão sair como teste, e no primeiro acesso eles trocam. Ele vai poder mandar por e-mail, ou só manda o link, eles botam ali o institucional deles, e já sai funcionando."* | **Já é assim.** Não há limite de número em lugar nenhum; senha inicial trocada no primeiro acesso existe desde a fase 9. *Fica de pé só a pergunta do §11 item 13: 24 horas de validade do convite é pouco?* |
| R3 | **"Se houve alteração" na volta da família** | *"Esses dados são extremamente sensíveis e têm que ser armazenados. Se houve alguma alteração, sim, tem que ser notificado."* E a parte que muda o desenho: *"a criança, quando entrar de volta, tem que ter um relato com ela. Mesmo que não tenha sido preenchido no dia, porque a criança não quis falar, esse acompanhamento pode ficar ABERTO para ser preenchido por algum educador depois de uma semana."* E: *"que isso fique também registrado no perfil"* | **Fase 122** ✅ — e ele CORRIGIU o desenho em 16/09: *"acho mais fácil não dar um prazo […] dessa forma não haverá uma pressão para arrancar a informação da criança. Mas isso pode ser registrado quantas vezes for necessário, por qualquer educador"*. Sem prazo, sem estado, sem cobrança |
| R4 | **O que a equipe pediu a mais** | Portaria com foto e anexo ✅ (fase 92); **várias fotos da criança** no perfil, com prévia antes de confirmar; **documentos reais digitalizados** no perfil, para ver e **baixar**; e a Enfermagem podendo anexar **bula e receita** direto no perfil | **Parcialmente pronto** — o que falta está medido no §9 |
| R4b | **A frase que vale para o sistema inteiro** | *"Se a enfermagem já faz isso cair no perfil da criança, todos os outros lugares onde a gente preenche, seja almoço, seja outras coisas, os dados individuais de cada criança mesmo no coletivo, têm que ir individual para cada um no seu registro e vivência na casa."* | **É a regra que as fases 110, 116 e 118 vinham seguindo sem ter o nome.** Passa a ser regra escrita: *nada que é lançado no coletivo pode ficar só no coletivo* |

---

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

Da conversa longa de 09/09: **catorze pedidos estão entregues** e **três estão
travados por resposta da casa**. A fila de código acabou. *Até a fase 88 esta
frase começava com "treze pedidos" e somava dezesseis desde a fase 86; ninguém
soube dizer de onde vinha o treze, e ele saiu daqui. O conferidor de números só
lê o §2 — número fora dele envelhece sem que nada reclame.*

### Entregues (fases 76–94)

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
| 13 | **A pauta que o educador propõe**, com resposta obrigatória, e o decidido disparado a quem não estava (§8.2.2) | 94 |
| 14 | **O estatuto** — regras de convivência, por casa ou da instituição, com folha para a parede (§8.2.3) | 95 |

⚠️ **Entregue não era o mesmo que visível.** Até a fase 87, **cinco** dos nove
não apareciam — ou apareciam errados — no protótipo, que é a única coisa que o
Marcelo abre: a hora de sair (3), a cobrança de relato (5), o remédio que vai
junto (9), e o "sair sozinho" (7) mostrando um travessão no lugar do nome da
criança. O código estava certo nos quatro; o servidor de mentira é que não
tinha dado. Ver §6.14 e §6.19. **Se algum destes for demonstrado ao Marcelo,
vale abrir a tela antes** — foi a fase 87 que as tornou alcançáveis, e nenhuma
delas foi vista por gente ainda. *A décima repetiu o defeito: o retorno da
fase 88 só apareceu no protótipo na 89 (§6.14).*

### Esperam código — nenhuma

*A fila acabou: os três pedidos que esperavam código foram entregues nas fases
92, 93 e 94.*

*O estatuto, que a fase 94 deixou anotado aqui, foi construído na 95 (§8.2.3).*

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
| 1 | ~~**A escala 12x36 vigente da Casa 03**~~ ✅ **Respondida em 15/09** | A tela existe desde 08/09 e ele descreveu o funcionamento que quer — *"a gente não vai deduzir a escala"*, lançada semanas antes, cor por pessoa, retirar e substituir. **Quase tudo já existe** (§8.4); as três diferenças estão no §9. O conteúdo real — quem trabalha quando — continua sendo da casa, e entra na implantação |
| 2 | **A janela de acesso por plantão (T-10/T+10)** | **Não implementada.** Com a escala por data ela passou a ser possível; ligá-la é decidir que alguém fica sem abrir o sistema fora do horário |
| 3 | **Os códigos e nomes reais das oito unidades** | AI1–AI4 / ARM1–ARM4 são preliminares e aparecem em tela, relatório e nome de arquivo. Trocar é um `UPDATE` de `house.code` — os IDs internos são UUID |
| 4 | **O SMTP institucional** | Ver §12.7. Sem ele não há convite, e sem convite não há primeiro acesso para 40 pessoas sem distribuir senha por mensagem |
| 5 | **O prazo de triagem da Enfermagem** | Será parâmetro |
| 6 | **O horário oficial do Líder Noturno Geral** | `NIGHT_SHIFT_END_HOUR` no `.env` (7h como hipótese). A hora de INÍCIO não é lida por ninguém: quem abre a ATA Geral é uma pessoa, não um relógio |
| 7 | **Relatórios obrigatórios no piloto** | Todos marcados como candidatos; seleção com o Marcelo |
| 8 | ~~**Permissões de fotos em memórias**~~ ✅ **Respondida em 15/09** | *"Fotos das crianças, tanto delas vivendo no acolhimento como no perfil — eles têm que ter esse acesso."* A equipe da casa vê; o upload deixa de esperar confirmação. *A autorização de imagem POR CRIANÇA continua sendo registrada por vivência (`photo_authorized`), que é outra coisa: ela não governa quem vê dentro da casa, e sim o que pode sair dela* |
| 9 | **Os dados de partida** | Equipe, acolhidos já na casa, e a decisão de quanto do histórico em papel entra no sistema |
| 10 | **LGPD** | ✅ **Metade respondida em 15/09**, e é a metade que destravava o piloto: *"como o sistema é interno para o Pão dos Pobres, a gente pode deixar os dados bem tranquilos para o pessoal poder ler […] eles estão ali para proteger as crianças e têm a guarda delas."* O círculo estreito fica com **judicial, socioeducativo, internação, comportamento e ocorrência grave** — educador líder, coordenação, técnica e gestão. **Continua faltando:** quem responde formalmente pela LGPD, por quanto tempo se guarda cada coisa, e o que se apaga. *Isso não trava mais o dado real; trava a resposta a um pedido de titular* |
| 11 | **Critérios de aceite do piloto e autoridade** | O §13 tem a proposta; falta a Fundação assinar embaixo |
| 12 | **A folha da portaria com CPF e foto impressos** | Decisão do Marcelo em 09/09, construída na fase 92. É dado pessoal de TERCEIRO (familiares) — CPF, telefone e, quando cadastrada, a foto 3×4 do visitante —, e a foto de identificação da criança, numa folha que fica na guarita, o lugar menos controlado da instituição. O DPO precisa ver antes do piloto, junto com a pergunta de uma segunda lista, de quem NÃO entra |
| 13 | **O prazo do convite de primeiro acesso** | **24 horas**, escrito no código com o motivo — *convite parado é porta aberta* — e afirmado na §7. O `.env.example` dizia **72** desde a fase do backup, sem motivo em lugar nenhum, e quem copiasse o exemplo implantaria três dias acreditando estar em um; alinhado na fase 105. **A pergunta é da Fundação:** com quarenta pessoas convidadas na implantação, 24 horas pode ser curto — quem não abrir o e-mail no dia precisa de convite novo, e emitir convite embaralha a senha atual e derruba as sessões. Alongar é **uma linha**, e a escolha precisa ser consciente |

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

Constrói, cria um banco virgem, aplica as 130 migrações **pelo binário
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

### 12.6 As duas fontes de hora

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

### 12.7 O relógio — o que roda sozinho, e que não existia

*Não confundir com a §12.6, que é sobre as duas fontes de HORA. Esta é sobre
quem CHAMA o que roda sozinho.*

Seis rotas de máquina existem desde as primeiras fases, cada uma com o motivo
escrito de não ter tela: "roda por relógio, e não por alguém apertando um
botão". **Até a fase 103 não havia relógio.** Nenhum cron, nenhum script,
ninguém as chamava — nem em desenvolvimento, nem no roteiro de implantação.

No dia em que o piloto começasse, a Casa 03 abriria o sistema e encontraria o
dia **vazio**: sem as doses geradas a partir das prescrições assinadas, sem as
atividades da rotina, sem escalonamento de dose atrasada, sem aviso de
aniversário. Tudo funcionando, e nada acontecendo. *Nenhum teste pegava: cada
rota tem a sua suíte, e todas passam — chamadas pelo teste.*

**Como funciona agora:** `npm run relogio`, no servidor, uma vez ao dia. Ele
roda as seis rotinas em todas as casas que a conta alcança, registra
`relogio.dia` na auditoria com o número de casas e de falhas, e sai com código
1 se alguma falhar. Uma casa que falha **não derruba as outras** — numa
instituição de oito, parar na segunda deixaria seis sem o dia gerado.

**Não é uma rota HTTP, e isso é decisão.** Uma rota exigiria guardar no
`crontab` uma credencial com alcance nas oito casas, capaz de gerar dose e
disparar aviso. Rodando no servidor, como o migrador, não há credencial: quem
consegue executar já está dentro.

**O que a Fundação precisa decidir antes do piloto:**

| # | Pergunta | Por que importa |
|---|---|---|
| 1 | **Qual conta é a do relógio** (`RELOGIO_USER_EMAIL`) | Tudo o que ele gera fica na auditoria com esse nome. **Não deve ser a conta de uma pessoa:** quem ler seis meses depois precisa distinguir "o sistema gerou" de "a enfermeira gerou". O sugerido é uma conta de serviço, com alcance nas oito casas |
| 2 | **Que horas** | O exemplo em `scripts/relogio.crontab` usa 05h00, com o motivo escrito: a virada do dia é o pior horário — equipe da noite trabalhando, backup rodando, ninguém acordado para ver um erro. Às 5h o plantão noturno ainda percebe se algo não veio |
| 3 | **Quem olha quando falha** | O comando sai com código 1 e o cron manda e-mail, se estiver configurado. Sem alguém para ler, o dia incompleto só aparece quando a casa disser que "o remédio sumiu da tela" |

**Confira o fuso da máquina.** O exemplo traz `CRON_TZ=America/Sao_Paulo`: num
servidor em UTC, 05h00 são 02h00 em Porto Alegre e o dia gerado é o errado.

### 12.8 O SMTP institucional

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

`roteiro-marcelo.md` (e o `.docx` gerado dele) leva 49 tarefas do roteiro à Casa 03, cargo a
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

## 14. COMO COMEÇAR UMA SESSÃO NOVA

**Desde 20/09/2026 o projeto mora num repositório git, aberto no Claude Code.**
O documento continua sendo este; o que mudou é que ele não viaja mais como
anexo, e o estado não é mais um zip — é o que o `git log` diz.

### No Claude Code (o caminho normal)

```bash
cd rede-acolher
claude
```

O `CLAUDE.md` da raiz é lido sozinho a cada sessão: ele tem as regras, o
preparo, o que se roda antes de entregar e o que nunca se faz. Não é um segundo
documento vivo — é um cartão de entrada, e aponta para cá.

**Na web, o ambiente já sobe pronto.** O `.claude/hooks/session-start.sh` roda
antes da sessão começar e deixa a máquina com dependências, PostgreSQL 16,
`faketime`, Chromium, o `fontes.css` gerado, e o banco migrado com a semente
FICTÍCIA — mais `DATABASE_URL`, `ARQUIVOS_DIR` e `ENSAIO_CHROMIUM` já na sessão.
Sete segundos em container aquecido. Ele não repete o trabalho: chama o mesmo
`scripts/preparar-ambiente.sh` que a pessoa roda na mão, porque dois lugares
dizendo a mesma coisa é como um deles fica errado. Ele só age no ambiente remoto
(`$CLAUDE_CODE_REMOTE`) — numa máquina da pessoa, quem decide subir banco é ela.

*Por que ele existe: o container é novo a cada sessão e cai inteiro no fim. Sem
o hook, a primeira coisa que qualquer sessão faz é descobrir, uma a uma, que
faltam dependências, que o PostgreSQL não é serviço, que o `faketime` não está
instalado e que o `fontes.css` não vem no repositório. A descoberta mais cara é
a do relógio, porque ela não falha: fica verde dizendo que passou onde nunca
esteve.*

Comece a sessão pedindo o que você quer. Se quiser dar o contexto de uma vez:

```
Leia o CLAUDE.md e o docs/REDE-ACOLHER.md antes de responder. Depois me diga em
até dez linhas o que você entendeu que falta, em ordem, e espere eu confirmar
antes de mexer em qualquer arquivo.

=== O QUE EU QUERO AGORA ===

[troque esta linha]
```

**O que muda em relação ao chat, e vale dizer em voz alta:**

- **`git status` responde "algum arquivo mudou?"** — a pergunta que em 20/09
  custou uma comparação arquivo por arquivo contra o zip, e que descobriu
  trabalho de outra conversa misturado ao repositório.
- **Trabalho começado vive em branch**, com autor e motivo, e não solto no
  disco.
- **O relógio é o de verdade.** A segunda rodada da suíte deixa de precisar de
  `faketime`: basta rodá-la depois das 21h. O `faketime` continua servindo para
  não esperar.
- **A suíte roda até o fim** — não há teto de cinco minutos por comando.
- **Uma sessão de cada vez sobre o mesmo repositório.** Duas conversas escrevendo
  no mesmo disco foi exatamente o acidente de 20/09.

### No chat (quando não houver máquina)

Anexe **este arquivo** e um zip do repositório, e diga que o estado é o do
`git log`. O bloco acima serve igual, trocando a primeira frase por "Anexei o
repositório e o documento único".

### As quatro cabeças, que não mudam com a ferramenta

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
```

### A regra deste documento

**Ele é um só, e continua sendo um só.** Fase nova não cria arquivo novo: atualiza
a seção que mudou, e o §2 com os números saídos do código. Se alguma coisa
precisar virar história, ela vai para `docs/historico/` — não para um segundo
documento vivo.
