# Rede Acolher — Documento de Continuidade

> **Como usar este arquivo:** anexe-o na primeira mensagem de uma conversa nova,
> junto com o zip do repositório. Ele substitui todo o histórico.
>
> Última atualização: 31/08/2026 · §8.4 decidida, rotas unificadas, alcance por setor e DER completo

---

## 1. O que é

**Rede Acolher** — plataforma interna de gestão do programa de acolhimento
institucional da **Fundação O Pão dos Pobres** (Porto Alegre).

- **8 unidades**, ~20 acolhidos cada
- **Casa 03** é o piloto
- Contato institucional: **Marcelo Barbosa** — `mbarbosa@paodospobres.com.br`

O sistema substitui planilhas soltas, cadernos de plantão e grupos de WhatsApp
por um registro único, auditado e com autoria.

**Papel do assistente:** equipe digital multidisciplinar — engenheiro sênior,
analista de sistemas, coordenador de acolhimento e psicólogo. As decisões de
produto são discutidas do ponto de vista de quem trabalha na casa, não só do
ponto de vista técnico.

---

## 2. Restrições permanentes (não negociáveis)

### Segurança do processo
- **Nunca publicar, nunca fazer deploy em produção, nunca usar dado real** sem
  autorização expressa. Construir e validar local/dev com **dados fictícios**.
- **Segredos nunca no código.**
- **Logs da aplicação nunca copiam conteúdo sensível** — só IDs e metadados.
  Vale também para token de convite e link de acesso.

### Proibições absolutas
WhatsApp ou envio de dados por WhatsApp · GPS ou rastreamento · contas
compartilhadas · acesso a outra casa fora das exceções funcionais (Gestor
Geral, Enfermagem, Líder Noturno Geral) · ranking de casas, acolhidos ou
equipe · pontuação de comportamento · decisão automática sobre diagnóstico,
culpa, risco, punição, visita, medicação, destino ou transferência · exclusão
simples ou silenciosa · sobrescrever registro fechado · CPF, diagnóstico ou
conteúdo judicial em nome de arquivo · dado real em dev/teste · envio
automático para Judiciário, Conselho Tutelar, MP ou saúde · acesso direto do
educador ao Drive · módulo de alistamento militar · controle de cofre físico ·
microsserviços prematuros.

### Dados bancários e cofre de acessos
Visíveis **apenas** para o coordenador da casa atual e o Gestor Geral, com
**reautenticação** e **log por visualização**.

### Arquitetura
> "Quero que você separe as partições das funções, caso seja necessário deletar
> ou adicionar algo, não estraga nenhuma outra parte construída junto."

### Design
Cor comunica **estado operacional** e categoria — **nunca julgamento sobre a
pessoa**. Toda ação tem autor e histórico.

---

## 3. Stack e arquitetura

**Monólito modular** — não microsserviços.

| Camada | Tecnologia |
|---|---|
| Backend | NestJS + TypeScript |
| Banco | PostgreSQL 16 |
| Frontend | React PWA (Vite + vite-plugin-pwa) |
| Protótipo | vite-plugin-singlefile → um `.html` |

**Autorização em duas camadas:**
1. Regra de negócio na aplicação
2. **Row-Level Security** no banco — `DatabaseService.asUser()` define
   `app.user_id` por transação. O banco não devolve linha fora do escopo.

**Regra que se aprendeu caro:** função `SECURITY DEFINER` desliga o RLS. Toda
função que recebe `p_house` **precisa** chamar `app_house_in_scope()` no corpo.

**Protótipo:** `VITE_PROTOTIPO=1` faz `api()` em `src/api.ts` chamar
`mockApi()` de `src/mock.ts`. O protótipo **é** o aplicativo de verdade, só com
outra fonte de dados.

---

## 4. Estrutura do repositório

```
rede-acolher/
├── backend/src/
│   ├── kernel/          audit, common (cpf, crypto, segredo, tempo),
│   │                    database, events, health
│   └── modules/         16 partições isoladas
├── frontend/src/
│   ├── screens/         19 telas React
│   ├── mock.ts          servidor de mentira do protótipo
│   ├── api.ts           cliente HTTP + classe ErroApi
│   ├── App.tsx          navegação, abas, seletor de cargo
│   └── styles.css       design system, tema claro/escuro
├── prototipo/           rede-acolher-prototipo.html (gerado)
└── docs/                arquitetura, DER, matriz de permissões, backlog…
```

**Módulos do backend (16):** activities, archive, checks, houses, identity,
incidents, medications, notifications, nursing, people, reports, routine,
shifts, statements, sync, timeline

**Telas do frontend (19):** Login, PrimeiroAcesso, SenhaPessoal, Dia,
PainelPlantao, DiaDasUnidades, Chamada, Acolhidos, Cadastro, Passagem, Agenda,
Equipe, Saude, Ocorrencias, Ata, Cofre, Transferencias, Acompanhamentos, Arquivo

**Comandos:**
```bash
cd frontend && npm run prototipo   # gera o .html de um arquivo só
cd frontend && npx tsc --noEmit    # confere tipos
cd backend  && npm test            # testes (precisa de PostgreSQL)
```

---

## 5. Fases concluídas

| Fase | Conteúdo |
|---|---|
| 0–1 | Autenticação, isolamento RLS, auditoria, PWA |
| 2 | Perfil do acolhido: pessoa/episódio/permanência, CPF único, documentos, benefícios restritos, transferência, acervo |
| 3 | Partições isoladas + rotina, atividades, chamadas, linha do tempo, notificações, offline |
| 4 | Medicamentos com confirmação individual, enfermagem com triagem, escalonamento como contrato genérico |
| 5 | Plantão com passagem individual; ATA que fecha com pendência; ocorrências que não se encerram sozinhas |
| 6 | Acompanhamentos, relatórios, aprovações, arquivo no Drive |
| 7 | Ensaio geral do piloto e plano da Casa 03 |
| 8 | **Os 12 defeitos de auditoria, corrigidos e verificados contra banco** |
| 9 | **Convite de primeiro acesso: e-mail institucional, uso único, 24 horas** |
| 10 | **Registro por outra pessoa com autoria dupla, delegação pelo líder, painel do plantão** |
| 11 | **Terceira auditoria: regressão dos 12 defeitos e das funções novas; suíte verde** |
| 12 | **Auditoria de documentação: matriz, DER, backlog e manifestos alinhados ao código** |
| 13 | **Ensaio de uso por cargo: 5 defeitos corrigidos + 2 alcances ajustados** |
| 14 | **Relatórios de verdade: conteúdo puxado do sistema e documento Word com timbre** |
| 15 | **Relatório de desenvolvimento da criança na casa; arquivos de origem desconhecida avaliados e descartados** |
| 16 | **Linha do tempo corrida no relatório, ordem das seções e tela para gerar** |
| 17 | **O dia das unidades: linha do tempo unificada para quem alcança mais de uma casa** |
| 18 | **As duas decisões da §8.4: estoque com entrada e contagem separadas; vencimento ancorado em hoje** |
| 19 | **Um sistema só: as 7 telas que falavam rotas inexistentes passaram a falar as do servidor** |
| 20 | **Três testes que cobram o que envelhece sozinho: contrato de rotas, alcance por setor e o DER** |

---

## 6. Decisões de produto que valem lembrar

**Entrada em dois passos, agora completa.** A pessoa digita o e-mail; o sistema
responde se aquela conta já tem senha. Quem não tem **não cria senha ali** —
recebe um link no e-mail institucional. Distribuir senha inicial para 40
pessoas viraria mensagem de WhatsApp; mas deixar o e-mail sozinho abrir a
criação de senha faria do e-mail a senha. O convite resolve os dois: uso único,
24 horas, com autor registrado. Emitir convite **embaralha** a senha atual e
derruba as sessões — a partir dali a única porta é o link.

**Cofre de acessos.** As senhas das contas das crianças entram no sistema,
criptografadas, visíveis só para o coordenador da casa, com auditoria. *"Se não
colocarmos isso no sistema eles ainda vão fazer isso numa planilha solta."*

**Cinco abas, não seis.** A barra inferior carrega o turno — Dia, Chamada,
Acolhidos, Passagem. O resto mora em "Mais".

**Cadastro em quatro passos.** O CPF é conferido **antes** do resto: histórico
partido é o que faz a audiência perguntar o que o sistema deveria saber.

**Correção não é sobrescrita.** Quando um registro fechado precisa mudar, o
valor anterior vai para uma tabela de histórico com autor e horário — nunca
some. Vale para a chamada (`check_result_amendment`) e é o padrão para o resto.

**Autoria dupla, nunca autoria trocada.** O líder do turno e a coordenação
podem registrar a conclusão por um educador que realizou a atividade e não
conseguiu registrar — aparelho da casa sem sinal, e ele não usa o próprio
celular. O registro guarda os DOIS nomes e o motivo, e toda tela mostra os dois
juntos. **Não vale para dose de medicamento (§11.2) nem para chamada (§10):**
numa, a confirmação individual é a proteção da criança; na outra, quem marca
presença é quem olhou a criança.

**Recusar também é decisão, e precisa de motivo.** Havia como autorizar
substituição e não havia como recusar — o pedido que não cabia mais ficava
aberto para sempre. `POST /activities/substitutions/:id/decline` fecha com
motivo obrigatório, e quem pediu é avisado pelo sistema. O pedido cuja
atividade foi concluída enquanto esperava aparece marcado na lista do líder,
explicado; o sistema não o fecha sozinho.

**Delegar é o caminho de cima para baixo.** O pedido de substituição nasce de
quem vai sair; quem faltou não pede nada. `app_delegate_activity` deixa o líder
passar a atividade adiante, com motivo, sem apagar a designação anterior. A
atividade volta a aguardar ciência: designado não é o mesmo que avisado.

**Painel do plantão, não painel de pessoas.** `app_shift_board` mostra as
atividades do turno e quem está em cada uma, visível a toda a equipe. A tela
mora em "Mais" — as cinco abas da barra continuam sendo as do turno. Sem
contagem por pessoa, sem ordenação por desempenho, sem histórico de
deslocamento. O sistema sabe o que foi COMBINADO, não onde alguém está.

**O relatório sai em Word, não em PDF.** Quem assina precisa poder mexer: a
técnica escreve a avaliação, a coordenação acrescenta uma linha antes da
audiência, alguém corrige um nome. Um PDF fechado empurraria a equipe a refazer
tudo no Word da máquina dela, e aí o que vai ao Juízo deixaria de ter relação
com o que está no sistema. A conversão para PDF é da pessoa, na hora de enviar.

**A criança não é só o que deu problema.** O relatório de desenvolvimento
puxa também `memory_record` e `education_evolution`: a apresentação no coral, a
tarefa entregue sem lembrete. Um documento feito só de ocorrências e faltas
devolve uma pessoa que não existe, e é esse documento reduzido que segue para a
audiência, para a escola e para o próximo serviço.

**O dia das unidades não compara unidades.** `GET /timeline/all` junta o dia
das casas que a pessoa alcança, em ordem, com a origem em cada linha. As casas
vêm do banco sob RLS: quem alcança uma recebe uma, quem alcança oito recebe
oito. Não há modo individual ali de propósito — acompanhar uma criança é dentro
da casa dela, e varrer as oito atrás de alguém é vigilância com outro nome. O
servidor recusa.

**A linha do tempo corrida conta a história.** As seções por assunto servem
para conferir cada coisa; a cronologia junta a consulta de terça, a ocorrência
de terça à noite e a dose recusada na quarta. Separadas, parecem três fatos
independentes. Em ordem, viram a explicação. Corta em 120 registros e avisa que
cortou.

**Seção vazia diz "não há"; ela não some.** Seção ausente vira dúvida de quem
lê. A frase escrita vira informação.

**Relato de ocorrência restrita não entra em relatório.** Sai a categoria, a
data e a situação. Quem precisar do inteiro teor abre a ocorrência e responde
pelo acesso dela. Relatório circula: vai por e-mail, é impresso, fica em cima
de uma mesa.

**O sistema conta; a pessoa avalia.** O relatório traz a parte factual já
escrita (atividades, saúde, medicação, ocorrências, acompanhamentos aprovados),
cada seção dizendo de onde veio. Os campos de avaliação e encaminhamento vêm em
branco, marcados como "a preencher". O sistema nunca interpreta, nunca conclui,
nunca avalia ninguém, e nunca conta por educador.

**Chegou remédio e conferi o armário são duas coisas.** O estoque tinha uma
ação só, e ela mentia: substituía a quantidade e gravava o movimento como
"entrada" — 10 sobre 30 deixava 10, com o histórico jurando que uma entrada de
10 havia acontecido. Agora quem mexe escolhe. Entrada soma e o movimento conta
o que chegou; contagem substitui, grava a diferença como ajuste e **exige
motivo**, porque remédio que some do armário sem explicação escrita é
exatamente o que não pode virar rotina. O sistema não adivinha qual é qual pelo
tamanho do número: contagem maior que o registrado acontece (frasco em outra
gaveta), e entrada pequena não deixa de ser entrada.

**O aviso de receita é sobre a receita, não sobre a tela.** A janela de 7 dias
parte de hoje. O painel de outro dia é o que a Enfermagem abre para revisar a
véspera — e era justamente aí que o alerta sumia para quem foi conferir. A tela
diz de onde o número parte quando o dia mostrado não é hoje.

**"Hoje" é sempre o dia de Porto Alegre.** `hojeNaInstituicao()` no TypeScript,
`app_hoje()` no SQL. `current_date` está proibido em migração nova.

---

## 7. Protótipo — estado atual

`prototipo/rede-acolher-prototipo.html` — **544 KB, um arquivo só**. Abre com
dois cliques, sem servidor, sem banco, sem instalar nada.

**Entrar:** `mbarbosa@paodospobres.com.br` · **Primeiro acesso:** abra o
protótipo com `?convite=demo` na barra de endereço.

**Recursos exclusivos do protótipo:** 👁 Ver como (troca o cargo e o sistema
inteiro se reorganiza) · 🌓 tema claro/escuro · abre sempre em tema claro ·
tarja permanente *"Protótipo · dados fictícios · nada é salvo ao fechar"*.

**O que o protótipo NÃO faz, e é bom que não faça:** isolamento por casa, RLS,
auditoria, criptografia. Essas proteções vivem no banco, e é lá que precisam ser
conferidas.

---

## 8. Pendências

### 8.1 Testes
**235 testes, 19 suítes, todas passando.** Sem falha conhecida.

- `test/regressao-autoria.e2e.spec.ts` trava os 12 defeitos e as funções que
  vieram depois: convite, autoria dupla, delegação, painel, recusa.
- As 6 falhas antigas do `saude.e2e.spec.ts` eram uma só, em cascata: o teste
  media `criadas` na casa inteira, e o número dependia da ordem das suítes.
  Agora conta as doses DAQUELA prescrição.
- **Lição que vale para todo teste novo:** suíte que muta estado compartilhado
  (rotina, versões, efetivo, **equipe da casa**) precisa desfazer o que criou.
  A primeira versão da regressão passava sozinha e derrubava duas suítes
  vizinhas; a segunda passou uma rodada inteira e só vazou na seguinte —
  desativar a funcionária criada não bastava, o vínculo com a casa continuava e
  a ATA passou a cobrar uma assinatura a mais. Vale rodar a suíte **duas vezes**
  antes de considerar verde.
- **Três testes frágeis, encontrados ao mexer nos relatórios:** o do cofre
  alterava os últimos caracteres do base64, que carregam bits de preenchimento
  e às vezes decodificam para os mesmos bytes (passava quase sempre); o do
  plantão afirmava ser o primeiro a abrir o turno do dia, o que só valia
  enquanto o Jest escolhesse aquela ordem de arquivos; e o de arquitetura pegou
  dois JOINs sem justificativa, fazendo exatamente o trabalho dele.
- **E rodar à noite.** `agenda` e `piloto` calculavam "hoje" em UTC: depois das
  21h de Porto Alegre marcavam para amanhã e cobravam de hoje. Cinco testes
  falhavam toda noite e voltavam a passar de manhã. Corrigido — e a correção
  revelou um vazamento que o próprio defeito escondia: a escala criada pela
  suíte da agenda passou a valer HOJE e a suíte do plantão começou a cobrar
  passagem de um educador que só existia por causa do teste.

- **Rodada de 31/08, depois das mudanças:** suíte duas vezes seguidas (235
  testes, 19 suítes) e uma terceira às 22h30 de Porto Alegre, com os relógios
  da aplicação e do banco juntos. Verde nas três.
- **Aplicação e banco precisam do MESMO relógio.** Verificado em 31/08: a
  suíte inteira passa às 22h30 de Porto Alegre quando os dois andam juntos.
  Com o relógio do processo adiantado em relação ao do banco, atravessando a
  meia-noite, 17 testes em 5 suítes caem — `app_hoje()` no SQL responde um dia
  e `hojeNaInstituicao()` no TypeScript responde outro. Não é defeito do
  código: é requisito de implantação (NTP nos dois, ou o banco como fonte
  única da data). Fica anotado porque a falha, quando vier, vai parecer
  qualquer outra coisa.

### 8.2 Sobre os arquivos "de origem desconhecida" (resolvido)
Três arquivos apareceram no repositório durante o trabalho. A origem foi
identificada: **execuções paralelas desta mesma conversa**. A prova é o `docx`,
que constava instalado às 01h00 de 30/08, no mesmo minuto em que os arquivos
surgiram, catorze horas antes de os relatórios serem pedidos. Não houve acesso
externo, processo oculto nem tarefa agendada. Os três foram lidos, o que
prestava entrou no código, e o resto foi descartado.

### 8.3-A A unificação das rotas (31/08/2026)

A tela e o servidor falavam línguas diferentes. Cruzando as chamadas do
frontend com as rotas do backend, **28 de 78 chamadas não tinham par** — sete
telas inteiras que funcionavam no protótipo e teriam falhado contra o servidor
de verdade. Hoje o cruzamento dá **zero**, com uma exceção proposital
(`/prototipo/cargo`).

O que o descompasso escondia, por tela:

- **Saúde** — os códigos de estado da dose estavam no feminino na tela e no
  masculino no servidor: TODA confirmação teria voltado 400. E o protótipo
  calculava "abaixo do mínimo" sozinho, coisa que o sistema recusa por
  princípio (§11.6) — foi assim que a tela foi aprovada em 28/08.
- **Ocorrências** — a lista do servidor é magra de propósito; a tela pedia
  fato, medidas e fala espontânea de uma vez, o que entregaria conteúdo
  restrito a quem só precisava ver que a ocorrência existe.
- **Cofre** — a reautenticação mandava `senha` e o servidor lê `password`: a
  porta do cofre não abriria NUNCA. E o cofre é de um acolhido, não da casa —
  a lista única era a planilha solta de novo.
- **Arquivo** — a retentativa é da fila, não do item; e a aba "documentos por
  acolhido" duplicava a leitura que só deve acontecer no perfil (§16.5).
- **Transferências** — as caixas têm formatos diferentes de propósito: quem
  recebe vê menos, porque o perfil só abre depois do aceite.
- **Acompanhamentos** — salvar são dois atos (`draft` e `submit`).
- **ATA** — a ATA vive DENTRO do plantão, e o dia tem duas.

**Regra que fica:** o `mock.ts` responde às MESMAS rotas, com os MESMOS campos
e as MESMAS recusas do servidor. Protótipo que aceita o que o sistema recusa é
propaganda. Há um verificador em `/tmp` que cruza rotas e verbos — vale
transformá-lo em teste.

### 8.3 Achados do ensaio de uso ainda em aberto
- ~~Sem tela que mostre ao coordenador o que cada setor enxerga~~ — **feito em
  31/08**: `GET /staff/alcance` e a tela "O que cada setor enxerga", com o que
  o cargo alcança, a regra que o servidor aplica e o que ele NÃO alcança. O
  teste que confere página contra menu encontrou duas permissões sem porta
  (equipe técnica na Saúde, administração técnica no Arquivo), decididas e
  abertas em 31/08.
- A matriz de permissões documentava **"Educador volante"**, cargo que não
  existe no `role_code`.
- **Devolver acompanhamento para correção** não existe no servidor: há aprovar
  e há nova versão. O botão saiu da tela (era `/followups/:id/return`, rota
  inexistente). Criar a devolução com motivo registrado é decisão de produto.
- **A ATA Geral Noturna não se acha pela data.** Só o Líder Noturno Geral a
  abre, e é abrindo que se descobre o id. Nenhum outro cargo chega nela.

### 8.4 Decisões de produto — DECIDIDAS em 31/08/2026
- **Estoque: duas ações, e quem mexe diz qual.** `POST /medications/stock`
  passou a exigir `tipo`. `entrada` SOMA ao que estava no armário e grava
  movimento `'entrada'` com o que chegou; `contagem` SUBSTITUI pelo número
  conferido, exige motivo e grava movimento `'ajuste'` com a DIFERENÇA
  assinada. Sem padrão: faltando `tipo`, o servidor recusa em vez de escolher.
  Na entrada, a validade que fica é a **mais próxima** entre a que havia e a
  que chegou — lote novo e longo não apaga o lote velho que ainda está na
  gaveta.
- **"Vencendo em 7 dias" parte de HOJE** (migração 0750), e não do dia que o
  painel mostra. Revisar a véspera na sexta escondia a receita que vence no
  sábado. `p_date` continua mandando no resto do painel; a resposta traz
  `hoje`, `receitaVencendoAncoradaEm` e `revendoOutroDia` para a tela avisar
  quando os dois dias diferem.
- Nada pendente da substituição nem do painel: a lista, o aviso do pedido sem
  efeito e a recusa com motivo estão prontos.

### 8.5 Próximos passos sugeridos
1. ~~Decidir os dois itens de produto da §8.4~~ — feito em 31/08
2. ~~Trazer as fases 3–7 para o `der.md`~~ — feito; as 82 tabelas estão
   documentadas e `documentacao.spec.ts` não deixa a próxima escapar
3. ~~O Arquivo das ATAS~~ — feito em 31/08 (§8.6)
4. ~~Saída, acervo e retorno~~ — feito em 31/08 (§8.7)
5. Anexar documento ao arquivo (`POST /archive`) e abrir a chamada do turno
   (`POST /checks`) — os dois seguintes do grupo 1
6. Conversar com o Marcelo sobre o resto do **grupo 1 do `docs/o-que-falta.md`**
7. Aplicar o retorno do Marcelo por cargo
8. Configurar SMTP institucional na implantação (`MailGateway` já está pronto)

### 8.6 O Arquivo das ATAS — 31/08/2026

A ATA existia no dia em que era escrita. Fechada, continuava no banco e não
tinha por onde ser lida de novo: a tela pedia sempre o dia de hoje. Um livro
ATA que não se folheia serve para o turno e não serve para a casa.

**O que entrou:**

* migração `shifts/0760_arquivo_das_atas.sql` — `app_arquivo_atas(p_house, p_de,
  p_ate)`, SECURITY DEFINER conferindo `app_house_in_scope` (regra 8), e
  `app_consulta_arquivo_ata()` com os cinco cargos que folheiam;
* `GET /shifts/ata-archive?houseId=&escala=&data=`, declarada **antes** de
  `@Get(':id')`;
* `janelaDeConsulta()` em `kernel/common/tempo.ts` — o recorte de calendário,
  com gêmeo idêntico no `mock.ts` do protótipo;
* aba **📚 Arquivo** na tela de ATAS, com dia / semana / mês e seletor de data;
* suíte `test/arquivo-atas.e2e.spec.ts`, 8 testes.

**O alcance, decidido pelo Leonardo em 31/08:**

| Quem | ATA diurna e noturna da casa | ATA Geral Noturna |
|---|---|---|
| Coordenação, equipe técnica, Líder Diurno, Líder Noturno Geral | sim | **só a linha daquela casa** |
| Gestor Geral | sim | a linha, e o caminho para a folha das oito |
| Educador, enfermagem, cozinha, administração técnica | não | não |

O recorte parcial é feito **no banco**, não na tela: afrouxar a política de
`general_night_house_entry` abriria as oito linhas para todo mundo que alcança
qualquer casa, e a tela é que teria de esconder sete — proteção que se perde na
primeira tela nova. Consultar grava `ata.arquivo.consulta` com casa, escala e
período; o conteúdo das ATAS nunca entra no log (§20).

**Duas escolhas de tela que valem registro:** o arquivo mostra a CAPA de cada
ATA (situação, assinaturas, pendência, aditamentos, episódios), nunca o
conteúdo — quem precisa do que foi escrito abre a ATA, onde a permissão é
conferida de novo. E a aba abre no MÊS: a semana de calendário começa vazia
toda segunda-feira, e "nenhuma ATA neste período" com o livro cheio atrás faz
a pessoa concluir que o sistema perdeu os registros.

**Dois defeitos que este trabalho encontrou:**

* **contaminação entre suítes, pega na segunda rodada.** A suíte nova montava a
  noite de HOJE e `plantao.e2e` reescreve a linha da AI3 na ATA Geral de hoje —
  quem rodasse por último ganhava, e o resultado alternava a cada duas rodadas.
  O teste passou a usar o dia ANTERIOR, que além de resolver pela raiz é mais
  fiel: o arquivo existe para os dias que já passaram. A regra das duas rodadas
  provou o seu valor pela segunda vez.
* **rota do protótipo caindo no curinga.** No `mock.ts`, `/shifts/ata-archive`
  ficou depois de `/shifts/:id`: o roteador decide por segmento, os dois têm
  dois segmentos, e a consulta virava busca de plantão inexistente. Mesma regra
  do servidor — palavra fixa antes do `:id`.

### 8.7 Saída, acervo e retorno — 31/08/2026

A saída e o retorno existiam no servidor desde a fase 2 e não tinham como ser
chamados: registrar retorno pede o `personId` de alguém que nenhuma lista
devolvia. Enquanto isso, a criança que saía da casa continuava na chamada, na
agenda e na contagem — o defeito que mais dói do grupo 1.

**Sem migração nova.** `app_person_in_scope` já alcança quem saiu: para a
equipe técnica e a coordenação ele olha QUALQUER permanência, e não só a ativa.
A porta que faltava era a listagem, `GET /people/archive?houseId=`, declarada
antes de `@Get(':id')`.

**O que entrou:** o acervo histórico como tela própria (e não misturado à lista
da casa — "quem está aqui agora" e "quem já esteve" são perguntas diferentes, e
misturá-las põe na lista da manhã nomes de crianças que já foram embora); a
folha da saída no fim do perfil, com o motivo ESCRITO (os botões preenchem o
campo e o texto continua editável — lista fechada aqui viraria contrato que o
servidor não tem); e a folha do retorno, que diz que o episódio é novo e que
nada é reativado sozinho. Suíte `test/saida-e-retorno.e2e.spec.ts`, 8 testes.

O acervo é deliberadamente pobre — nome, idade, quando saiu, motivo e quantos
acolhimentos. Um teste guarda exatamente esse conjunto de campos: nada de CPF,
saúde, judicial ou benefício. A consulta grava `person.acervo.consulta` com o
tamanho da lista, e nome de criança não vai para log de consulta.

**Dois cuidados de teste que valem registro:** a suíte cria a própria criança
em vez de desligar alguém da semeadura (desligar é definitivo, e mexeria no
estado das outras suítes), e a desliga de novo no `afterAll` — sem isso, cada
rodada acrescentaria um nome à Casa 03 e a casa cresceria sozinha. A admissão
precisou responder à regra de lotação, que é o que a coordenação faria.

### 8.8 Ensaio como usuário — 31/08/2026, os nove cargos

Três roteiros de navegador contra o protótipo de arquivo único, com todos os
cargos: `passeio.mjs` (o que cada um alcança, tela por tela), `acoes.mjs` e
`acoes2.mjs` (clicar tudo o que é clicável) e `relatos.mjs` (§12.2 ponta a
ponta). Sem erro de console e sem erro de página em nenhum dos nove.

**Defeitos encontrados e corrigidos nesta rodada:**

* **A tela guardava resposta de outro alcance.** A equipe técnica abria uma
  ocorrência, o cargo mudava, e a narrativa pessoal de uma colega — que o
  educador não alcança — seguia na tela, com "todos os relatos deste fato" por
  cima. O servidor havia recusado; a tela é que mostrava a resposta antiga. O
  conteúdo passa a remontar quando muda o cargo ou a casa. **Era o defeito mais
  grave da série: vazamento por cache de tela, não por permissão.**
* **Quatro rotas escondidas do teste de contrato.** `api(rota, ...)`, com a rota
  escolhida num ternário acima, tirava do conferidor justamente aceitar e
  recusar transferência (a mudança de casa de uma criança) e o fechamento das
  duas ATAs. O corolário do cabeçalho do teste virou verificação: agora falha
  quem passar rota em variável.
* **O próprio teste de contrato cortava a rota no `?`.** `/shifts/ata/${ata?.id}/close`
  virava `/shifts/ata/${ata` — o encadeamento opcional era lido como query
  string. A normalização do `${...}` passou a vir antes do corte.
* **Nome de pessoa em caixa alta** no bloco de complemento — relatos, sínteses e
  mensagens de transferência. Num caso de proteção o destaque é o que foi
  escrito, não quem escreveu.
* **"Carla Coordenadora (fictícia)você"** — falta de espaço antes da etiqueta.

**Conferido e correto** (não são defeitos, foram verificados um a um): a cozinha
cai direto nas restrições, sem barra de abas e sem a razão da restrição; a
administração técnica não alcança acolhido nenhum; o Gestor Geral entra no cofre
com reautenticação, como a regra 4 exige; o Líder Noturno Geral assina passagem
fora da escala com o aviso de que não constava; o educador não vê a narrativa
pessoal da colega, e a tela diz que não vê em vez de mostrar lista curta sem
explicar.

---

## 9. Migrações desta série (0620–0760)

| Nº | Módulo | O que faz |
|---|---|---|
| 0620 | activities | escopo em `app_mark_unconfirmed` |
| 0630 | identity | `app_hoje()` e `app_fuso()` — fonte única de "hoje" |
| 0640 | medications | prescrições e autorização em `app_hoje()` |
| 0650 | nursing | painel: janela de vencimento a partir de `p_date` |
| 0660 | routine | versão da rotina em `app_hoje()` |
| 0670 | checks | `check_result_amendment` + gatilho de histórico |
| 0680 | routine | item só em versão vigente da própria casa |
| 0690 | medications | `UNIQUE NULLS NOT DISTINCT` no estoque |
| 0700 | identity | convite de primeiro acesso |
| 0710 | activities | autoria dupla, delegação pelo líder, painel do plantão |
| 0720 | activities | equipe técnica também troca quem vai na atividade |
| 0730 | statements | líder do turno lê o registro restrito da própria casa |
| 0740 | reports | tipo `desenvolvimento` liberado no CHECK do banco |
| 0750 | nursing | "vencendo em 7 dias" ancorado em `app_hoje()`, não em `p_date` |
| 0760 | shifts | arquivo das ATAS; da Geral Noturna sai só a linha da casa |

Sem migração nova na fase 14: os relatórios usam o que já estava gravado.
A dependência `docx` entrou no backend, e o timbre vive em `backend/assets/timbre.png`.

---

## 10. Entrega para a conversa nova (30/08/2026)

### 11.1 O que existe hoje, em uma frase
Backend NestJS com PostgreSQL 16 e Row-Level Security, 16 partições isoladas;
frontend React PWA com 19 telas; protótipo de um arquivo só com servidor de
mentira; **235 testes passando em 19 suítes**; documento Word com timbre saindo
do sistema. Nada foi publicado, nada roda em produção, nenhum dado real entrou.

### 11.2 O que foi feito nesta série de conversas

**Os 12 defeitos da auditoria, corrigidos e travados por teste.** Escopo em
função `SECURITY DEFINER`, fila offline que sobrescrevia conclusão alheia,
validação depois do commit, UNIQUE do estoque que nunca valia para o estoque
comum, chamada que apagava autoria, situação judicial que reescrevia episódio
encerrado, três defeitos de fuso, substituição que ressuscitava atividade
concluída, contagem congelada e item em versão fechada.

**Fuso como fonte única.** `hojeNaInstituicao()` no TypeScript, `app_hoje()` no
SQL. `current_date` proibido em migração nova.

**Convite de primeiro acesso.** E-mail institucional, uso único, 24 horas.
Emitir embaralha a senha atual e derruba as sessões. Quem convida não vê o link.

**Autoria dupla, delegação e painel do plantão.** Líder e coordenação registram
pelo colega que realizou e não conseguiu registrar, com os dois nomes e o
motivo; nunca para dose nem para chamada. Delegação de cima para baixo sem
apagar a designação anterior. Recusa de substituição com motivo obrigatório.

**Ensaio de uso por cargo.** Percorri o sistema como coordenador, equipe
técnica, educador, líder e gestor. Rendeu 5 defeitos corrigidos e 2 alcances
ajustados (técnica troca quem foi na atividade; líder lê o registro restrito).

**Relatórios de verdade.** Deixaram de nascer vazios: o sistema escreve a parte
factual e a pessoa escreve a avaliação. Saem em Word com timbre, editáveis.
Tipo novo: **desenvolvimento da criança na casa**, com escola, apoios,
evolução educacional, saúde, alimentação, ocorrências, marcos e conquistas, e
**linha do tempo corrida** do período.

**O dia das unidades.** `GET /timeline/all` e a tela `DiaDasUnidades`: o dia das
casas que a pessoa alcança, em ordem, sem comparar unidades e sem modo
individual.

**Duas auditorias de teste e documentação.** Suíte de regressão nova, 6 falhas
antigas resolvidas, três testes frágeis consertados, matriz de permissões, DER,
backlog e manifestos alinhados ao código.

### 11.3 O que falta, em ordem de valor

1. ~~Duas decisões de produto (§8.4)~~ — **decididas e no código em 31/08**:
   estoque com `entrada` e `contagem` separadas, e a janela de vencimento
   ancorada em `app_hoje()`.
2. ~~Tela mostrando ao coordenador o que cada setor enxerga~~ — **feita em
   31/08**: `GET /staff/alcance` e a tela em "Mais". O teste que confere a
   página contra o menu achou duas permissões sem porta, decididas por você.
3. ~~Fases 3 a 7 no `der.md`~~ — **feito em 31/08**: as 82 tabelas estão
   documentadas por partição, com o motivo de cada uma, e um teste cobra que
   toda tabela nova apareça lá.
4. **Retorno do Marcelo por cargo.** O roteiro está escrito e pronto para
   aplicar: `docs/roteiro-marcelo.md` — tarefas por cargo, o que observar em
   cada uma, e a §0 com o que mudou depois da aprovação de 28/08 (a tela de
   estoque que ele viu não existe mais como era). Falta **aplicar**.
5. **SMTP institucional**, só na implantação, e só com autorização expressa.
   As perguntas, o que configurar no domínio e a ordem de validação estão em
   `docs/implantacao-smtp.md`. Nada foi executado.

### 11.4 Como retomar

O repositório vai anexado em zip, já com tudo aplicado. Descompacte, e:

```bash
npm install                      # na raiz, uma vez
docker compose up -d             # PostgreSQL 16
cd backend && npx ts-node scripts/migrate.ts
npx ts-node scripts/seed.ts && npx ts-node scripts/seed-fase2.ts && npx ts-node scripts/seed-fase4.ts
npm test                         # 219 testes
cd ../frontend && npm run prototipo
```

**Rode a suíte duas vezes, e uma delas depois das 21h.** Duas classes de
defeito só aparecem assim: contaminação de estado entre suítes, e datas
calculadas em UTC.

### 11.5 Uma nota honesta sobre arquivos que aparecem sozinhos

Durante o trabalho, arquivos surgiram no repositório minutos antes de eu
escrever a mesma coisa. A origem foi identificada: **execuções paralelas desta
mesma conversa** (ramificações descartadas compartilham o container). Não houve
acesso externo nem processo oculto. A regra que ficou, e que vale manter: se
aparecer arquivo que você não reconhece, leia, aproveite o que presta e
descarte o resto — nunca aplique sem ler.

---

## 11. PROMPT MESTRE

> Copie tudo dentro do bloco e cole como **primeira mensagem** da conversa nova,
> com este arquivo e o zip do repositório anexados. Troque só a última linha.

```
Você é minha equipe digital no projeto REDE ACOLHER — plataforma interna de
gestão do acolhimento institucional da Fundação O Pão dos Pobres, em Porto
Alegre. 8 unidades, ~20 acolhidos cada, Casa 03 como piloto. O contato na
Fundação é o Marcelo Barbosa (mbarbosa@paodospobres.com.br).

Você atua com quatro cabeças ao mesmo tempo, e discorda de si mesmo quando
elas discordam:
- ENGENHEIRO SÊNIOR — corretude, isolamento, o que quebra em produção às 3h
- ANALISTA DE SISTEMAS — o dado certo, no lugar certo, com autoria e histórico
- COORDENADOR DE ACOLHIMENTO — a rotina real da casa, o plantão, a audiência
- PSICÓLOGO — o efeito do registro sobre a criança e sobre quem cuida dela

Anexei o repositório (zip) e o documento de continuidade. Leia-os antes de
responder e não me peça para reexplicar o que está lá.

=== REGRAS QUE NÃO SE NEGOCIAM ===

1. NUNCA publicar, nunca fazer deploy em produção, nunca usar dado real sem
   minha autorização expressa. Construir e validar local, com dados fictícios.
2. Segredo nunca no código. Log da aplicação nunca copia conteúdo sensível —
   só ID e metadado. Vale para token de convite e link de acesso.
3. PROIBIDO, sem exceção: WhatsApp ou envio de dados por WhatsApp; GPS ou
   rastreamento; conta compartilhada; acesso a outra casa fora das exceções
   funcionais; ranking de casas, acolhidos ou equipe; pontuação de
   comportamento; decisão automática sobre diagnóstico, culpa, risco, punição,
   visita, medicação, destino ou transferência; exclusão simples ou silenciosa;
   sobrescrever registro fechado; CPF, diagnóstico ou conteúdo judicial em nome
   de arquivo; envio automático para Judiciário, Conselho Tutelar, MP ou saúde;
   acesso direto do educador ao Drive; módulo de alistamento militar; controle
   de cofre físico; microsserviços prematuros.
4. Dado bancário e cofre de acessos: só o coordenador da casa atual e o Gestor
   Geral, com reautenticação e log por visualização.
5. PARTIÇÕES ISOLADAS. Cada módulo no seu arquivo. Apagar ou acrescentar uma
   função não pode estragar nenhuma outra parte já construída.
6. Toda ação tem autor e histórico. Nada é anônimo, nada some.
7. Cor comunica estado operacional e categoria — nunca julgamento sobre a
   pessoa.
8. Função SECURITY DEFINER com p_house SEMPRE confere app_house_in_scope().
9. Migração nova NUNCA usa current_date. Use app_hoje().

=== COMO QUERO QUE VOCÊ TRABALHE ===

- Interface, código, comentário e commit em PORTUGUÊS DO BRASIL.
- Antes de construir, diga em duas linhas o que vai fazer. Depois faça.
- Termine sempre com `npx tsc --noEmit` e `npm run prototipo` passando. Não me
  entregue build quebrado, e não diga que passou sem ter rodado. Se não puder
  rodar, diga que não rodou.
- Quando eu pedir algo que fere uma regra acima, não faça e me diga qual regra
  e qual é o caminho certo.
- Quando a decisão for de produto e houver dois caminhos defensáveis, me
  pergunte antes — não escolha sozinho.
- Prefira a solução que a educadora de plantão consegue usar às 23h com uma
  criança chorando ao lado. Elegância que atrapalha o turno não serve.
- Não repita para mim o que já está no documento. Não recapitule passos.
- Se encontrar um defeito enquanto faz outra coisa, anote e me avise no fim —
  não desvie a tarefa sem falar.
- Se algum arquivo do repositório mudar sem você ter mudado, me avise.

=== ESTADO ATUAL ===

Fases 0 a 23 concluídas. 253 testes passando em 21 suítes, sem falha conhecida
— a suíte rodou cinco vezes seguidas e mais duas às 22h32 de Porto Alegre, com
o relógio do banco movido junto. Backend NestJS + PostgreSQL 16 com RLS, 16
partições. Frontend React PWA com 21 telas, todas falando as rotas reais do
servidor. A ATA agora tem arquivo: dia, semana ou mês de calendário, com a ATA
Geral Noturna recortada na linha de cada casa. O ciclo do acolhimento fecha:
cadastro, saída com motivo, acervo histórico e retorno como episódio novo. Relatórios saem em Word com timbre, com a parte factual
escrita pelo sistema. Convite de primeiro acesso por e-mail, uso único, 24h.

Em aberto, na ordem: `docs/o-que-falta.md` — 69 rotas que existem no servidor e
não têm tela, separadas entre o que vale para o piloto, o que espera e o que é
de máquina; o retorno do Marcelo por cargo; duas decisões de produto que não são
minhas (devolver acompanhamento para correção e listar rascunho de prescrição),
mais a pergunta menor de se o recorte por casa deve valer também para a ATA
Geral do dia corrente; e o SMTP institucional, só na implantação.

Leia a seção 10 do documento: ela tem a entrega completa e como retomar.

=== O QUE EU QUERO AGORA ===

[ESCREVA AQUI SEU PEDIDO]
```
