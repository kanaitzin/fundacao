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

`prototipo/rede-acolher-prototipo.html` — **~800 KB, um arquivo só**. Abre com
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
**390 testes, 36 suítes, todas passando.** Sem falha conhecida.
*(O número desta linha envelhece a cada fase; o `RETOMAR-AQUI.md` é a fonte.)*

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
  abertas em 31/08. A administração técnica foi aposentada em seguida e o
  Arquivo ficou com a equipe técnica e a coordenação.
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
5. ~~O laço do arquivo e a abertura da chamada~~ — feito em 31/08 (§8.8)
6. ~~O corpo da ATA, o aditamento e a reabertura~~ — feito em 31/08 (§8.9)
7. ~~A comunicação externa da ocorrência~~ — feito em 31/08 (§8.10)
8. ~~Anexos e contenção na ocorrência~~ — feito em 31/08 (§8.11)
9. **Episódios da noite** e a **rotina versionada da casa** — o que resta do
   grupo 1 com mais efeito no dia a dia
10. Conversar com o Marcelo sobre o resto do **grupo 1 do `docs/o-que-falta.md`**
11. Aplicar o retorno do Marcelo por cargo
12. Configurar SMTP institucional na implantação (`MailGateway` já está pronto)

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
| Educador, enfermagem, cozinha | não | não |

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

### 8.8 O laço do arquivo e a abertura da chamada — 31/08/2026

**O laço do arquivo (§16.2).** Nada enfileirava cópia documental. A única porta
era `POST /archive`, que nenhuma tela chamava: a fila ficava permanentemente
vazia, `GET /archive/reconcile` respondia "nada pendente: tudo o que fechou
está arquivado" — verdade sobre a fila, mentira sobre a instituição — e o
protótipo ainda avisava, ao fechar a ATA, que a cópia documental tinha entrado
na fila. Não tinha. Módulo inteiro construído, testado, com falha e
retentativa, e sem nada chegando nele.

O laço agora fecha por EVENTO, e não por chamada: quem fecha publica
`document.closed` (contrato novo no kernel) e o `archive` escuta. `shifts` não
importa `archive` (regra 5), e a ATA precisa fechar mesmo com o Drive fora do
ar — a cópia tem fila com retentativa, o documento vale no sistema desde já.
Publicam hoje: ATA da casa, ATA Geral Noturna, ocorrência FECHADA (reabrir não
arquiva: cópia de meio de caminho circula como se fosse a final) e
acompanhamento aprovado, com a versão no nome. O ouvinte roda como QUEM
FECHOU — a permissão de arquivar é conferida no banco com o cargo de quem
assinou, e não por uma porta de serviço sem dono. Suíte
`test/arquivo-laco.e2e.spec.ts`, 4 testes.

**Abrir a chamada do turno (§10).** `POST /checks` não tinha porta: a tela
dizia "nenhuma chamada aberta hoje" para sempre. Entrou `GET /checks/kinds`
(palavra fixa antes do `:id`) servindo os oito tipos do enum `check_type` com
as opções de cada um, e o botão "Abrir uma chamada". O tipo vem do servidor
porque uma tela que escrevesse "jantar" descobriria o erro na casa, às sete da
noite, com a chamada aberta pela metade; o nome vem preenchido pela sugestão do
tipo e continua editável. O serviço passou a recusar tipo inválido com uma
frase, em vez de deixar o PostgreSQL responder "invalid input value for enum".

**Um defeito de honestidade do protótipo, corrigido junto:** o `mock.ts` tinha
uma chamada semeada com tipo `presenca` — que não existe no enum — e opções
(`comeu_pouco`, `ausente_sem_autorizacao`) que o servidor não conhece. O
protótipo mostrava um vocabulário que o sistema recusaria.

**Dois testes precisaram mudar, e a mudança é o próprio efeito:** `relatorios`
e `piloto` processavam a fila com lote fixo, porque a fila só continha o que
eles punham nela. Agora ela tem a vida da instituição dentro, e um lote fixo
processava outro documento primeiro. Passaram a empurrar lotes até o item DELES
sair — deixaram de afirmar sobre o tamanho da fila sem querer.

### 8.9 O corpo da ATA, a correção, e a entrada do Marcelo — 31/08/2026

**A ATA fechava vazia, todo dia.** `PATCH /shifts/ata/:id` existia desde a fase
5 e nenhuma tela o chamava: o campo `content` nunca recebia nada. A tela listava
os nomes das seções como etiquetas — e nem isso funcionava, porque declarava
`{cod,label}` enquanto o servidor devolve `{chave,titulo,tipo,ajuda,
obrigatoria}`: as etiquetas saíam vazias e todas as `key` do React eram
`undefined`.

Pior: o `mock.ts` tinha inventado **nove seções com outros nomes** ("Presentes e
ausências", "Visitas") enquanto o servidor serve as **dezesseis do LIVRO ATA de
papel da Casa 03**. A demonstração mostrava um formulário que a casa não usa —
para quem entregou o livro. Corrigido pela raiz: o `mock.ts` agora IMPORTA
`ata-secoes.ts`, como já fazia com `alcance.ts`. Esse arquivo passou a declarar,
no cabeçalho, que não importa nada de propósito.

O corpo agora se escreve enquanto a ATA está aberta, salvando ao sair de cada
campo, com as seções obrigatórias em branco listadas antes do fechamento (avisa,
não impede — uma ATA que se recusa a fechar às 23h empurra a casa de volta para
o papel). A seção "Organização da casa" ganhou os atalhos dos seis ambientes, e
o registro continua sendo do AMBIENTE, nunca de quem arrumou (§3.3).

**A correção (§12.7).** Reabrir grava o estado anterior no adendo; corrigir
grava o antes e o depois. Dois atos, duas folhas, motivo de no mínimo quinze
caracteres — "erro" não explica nada a quem ler a ATA no ano que vem, e é essa
pessoa que o adendo existe para servir. O histórico aparece na própria ATA,
dizendo QUAIS seções mudaram. Suíte `test/ata-corpo-e-correcao.e2e.spec.ts`,
8 testes.

**Uma terceira divergência mock/servidor, encontrada pelo teste:** o adendo
guarda o estado EMBRULHADO — `{status, versao, conteudo}` na reabertura,
`{conteudo}` na correção. A tela lia o texto cru e o `mock.ts` gravava cru: no
protótipo, toda correção dizia "nenhuma seção alterada". Os dois lados passaram
à forma do servidor.

**A entrada do protótipo.** A conta do Marcelo existia com `senha: null` — que
no caminho de dois passos significa "use o link do convite". Correto no sistema
de verdade; no protótipo, que não envia e-mail nenhum, era um beco sem saída:
ele digitava o próprio e-mail e não entrava. Agora o protótipo abre com o e-mail
dele escrito e a senha preenchida, um clique entra. E os atalhos por cargo, que
só apareciam em `import.meta.env.DEV`, passaram a aparecer no protótipo —
existiam e nunca apareciam justamente no arquivo que vai para a mão de quem
precisa deles. São nove agora, um por cargo, incluindo Cozinha e Administração
técnica, que não tinham conta.

### 8.10 A comunicação externa da ocorrência — 31/08/2026

O caminho de comunicar Conselho Tutelar, MP e Judiciário existia inteiro no
servidor desde a fase 5 — redigir, submeter, aprovar, registrar a entrega, com
o padrão protetivo de que quem redige não aprova — e nenhuma tela o chamava.
Era a maior função sem porta do sistema.

**O que a tela carrega, e por quê:**

* **quatro etapas, e a tela diz O QUE FALTA em cada uma.** Sem isso "aprovado"
  parece "pronto", e uma comunicação ao Conselho Tutelar aprovada e nunca
  entregue passa por entregue. O estado "Aprovada e AINDA NÃO ENTREGUE" é o que
  mais precisa gritar, e é o único em tom de alerta;
* **nenhum botão de enviar, em lugar nenhum.** Não existe rota de envio no
  servidor, e procurar por ela continua sendo a forma mais rápida de conferir a
  proibição do §2. O aviso vem do próprio catálogo do servidor — quem desenhar
  outra tela sobre esses dados lê a regra na mesma resposta;
* **destinatário FUNCIONAL, não pessoal.** "Conselheira Marta" muda de emprego;
  "Conselho Tutelar — Regional Centro" continua sendo quem responde. O servidor
  já recusava vazio; a tela agora explica o porquê no rótulo do campo;
* **o teor é escrito à mão.** Nenhum texto é gerado a partir da ocorrência: quem
  comunica a um órgão externo assina o que escreveu;
* o educador não alcança nem a aba nem o botão dentro da ocorrência, e a
  ocorrência mostra o que já foi comunicado sobre ela.

**Uma melhoria no servidor junto:** `GET /incidents/catalog` servia `orgaos` e
`canais` como códigos crus (`ministerio_publico`). Passaram a sair com rótulo,
pelo mesmo motivo dos tipos de chamada — no dia em que entrar um órgão novo, a
lista muda no servidor e a tela acompanha sem release.

### 8.11 Anexos e contenção na ocorrência — 31/08/2026

O material mais sensível do sistema, e o que hoje sai da casa por foto de
celular justamente por não ter porta.

**Anexo aqui NÃO é upload,** e essa é a decisão de desenho que o servidor já
tinha tomado: o arquivo vive no Drive da instituição e o sistema guarda a
REFERÊNCIA, o nome neutro e quem pode abrir. É o desenho que existe porque o
educador não tem acesso direto às pastas (§2) — a abertura passa pelo sistema,
com finalidade declarada e registro.

Três recusas moram na folha:

* **nome de arquivo não leva CPF, diagnóstico nem conteúdo judicial** (§3.3). O
  servidor recusa por expressão regular desde a fase 5; a tela agora avisa
  ANTES, com a mesma checagem, para a recusa não chegar depois de digitar. O
  nome circula em lista, em pasta e em notificação — é ele que vaza, não o
  conteúdo;
* **foto exige justificativa escrita** — para que é necessária e qual
  autorização a ampara;
* **restrito é padrão do TIPO**, não uma caixinha a marcar: foto, documento
  médico e documento técnico nascem fechados. O anexo restrito APARECE para
  todos — some seria pior, cria a impressão de que não existe — e abrir exige a
  folha de finalidade, com mínimo de quinze caracteres.

**A contenção (§13.3)** ganhou a folha com os cinco campos obrigatórios —
antecedentes, tentativas anteriores, local, presentes e método — e a frase que
importa mais que os campos: *o sistema não avalia se a medida foi adequada*.
Essa análise é humana e técnica; um sistema que a fizesse estaria julgando
conduta por formulário. Os campos existem para que a análise SEJA POSSÍVEL. A
seção só aparece onde cabe: numa ocorrência de contenção, ou onde já há
registro.

**No servidor:** os tipos de anexo passaram a sair do catálogo com rótulo,
ajuda, `restritoPorPadrao` e `exigeJustificativa` — a tela deixa de decidir
sozinha o que nasce fechado. E `addAttachment` passou a exigir a referência com
uma frase que explica o desenho, em vez de gravar `storage_ref` vazio.

### 8.12 Ensaio como usuário — 31/08/2026, os nove cargos

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
o Gestor Geral entra no cofre
com reautenticação, como a regra 4 exige; o Líder Noturno Geral assina passagem
fora da escala com o aviso de que não constava; o educador não vê a narrativa
pessoal da colega, e a tela diz que não vê em vez de mostrar lista curta sem
explicar.

### 8.13 O ensaio de navegador vira suíte — 02/09/2026

Até aqui, "tela nova você ABRE" era disciplina de quem constrói: um roteiro
escrito na hora, jogado em `/tmp` ou num `.mjs` solto na raiz do frontend, com
o caminho da máquina daquele dia dentro dele. Funcionava enquanto a pessoa
lembrava — e um roteiro que depende de lembrar não pega a tela que ninguém
desconfiou.

`frontend/ensaio.mjs` (`npm run ensaio`) abre o protótipo num Chromium de
verdade, entra, e percorre **as 100 telas que os oito cargos alcançam**: as
abas da barra e todas as portas de "Mais". De cada uma cobra quatro coisas —
nenhum erro de página, nenhum erro de console (menos os de rede, que aqui são
só as fontes buscadas fora, §7.8), `main.conteudo` com texto, e nada de
`undefined`, `NaN`, `[object Object]` ou `Invalid Date` escapando para o texto
que a educadora lê. Grava uma foto por tela e sai com código 1 se achar algo.
Duas rodadas limpas; 118 segundos cada.

**A lista de cargos, as abas e as portas de "Mais" são lidas do próprio
protótipo**, nunca copiadas para dentro do ensaio. Roteiro com lista escrita à
mão envelhece calado: continuaria "passando" sem visitar exatamente a tela nova.

Dois achados, e nenhum deles no sistema:

- **O ensaio ensaiava zero tela na Cozinha.** Ele descobria o que percorrer
  lendo a barra de abas — e a Cozinha, com uma tela só, **não tem barra**, por
  decisão de design: uma aba sozinha seria decoração ocupando o rodapé. O
  conferidor ficava, portanto, cego justamente no cargo cuja tela única é a
  razão de ele existir, e ainda assim imprimia ✓. Sem barra, o que está aberto
  é a tela do cargo, e é ela que se confere.
- **A suíte não subia numa máquina virgem.** O `globalSetup` faz
  `GRANT ... TO rede_app` logo depois de recriar o schema, e quem cria
  `rede_app` é a migração 0010, que só roda em seguida. Em qualquer máquina que
  já tivesse rodado uma vez o papel existia (ele é do cluster e sobrevive ao
  `DROP SCHEMA`, como o próprio comentário do arquivo dizia); num cluster novo,
  a suíte inteira morria antes do primeiro teste, com uma mensagem que não diz
  isso. Verificado dos dois lados: banco derrubado e papel apagado, a suíte
  sobe sozinha e fecha 408 verdes.

E `scripts/preparar-ambiente.sh`, para a sessão nova começar rodando em vez de
descobrir de novo o que cai entre uma e outra: dependências, PostgreSQL e
Chromium. O Chromium tem um degrau a mais porque o caminho normal —
`playwright install` — busca o binário num CDN que ambiente com saída restrita
recusa com `403`, **falhando calado**: não baixa e não reclama, e o ensaio
some sem que ninguém perceba que sumiu. O script tenta o CDN e, se não passar,
traz o binário de dentro de um pacote npm.

**O que este ensaio ainda NÃO faz**, para não ser lido como mais do que é: ele
abre cada tela e olha o que ela escreveu. Não preenche formulário, não fecha
ATA, não confirma dose. A folha que abre por cima de uma tela — o cofre, a
folha do código do aparelho, a decisão de conflito — está fora do percurso.
Cobrir o roteiro do Marcelo tarefa a tarefa é o passo seguinte, e é o que
transformaria o ensaio em regressão de verdade.

### 8.14 A fila local do aparelho — 02/09/2026

O caso mais antigo do levantamento: o servidor sabia receber a fila desde a
fase 3 e nunca existiu quem a enviasse. `frontend/src/fila-offline.ts` é a
outra metade — guarda em IndexedDB, tenta sozinha ao reconectar e a cada 30
segundos, e apaga **só** o que voltou em `podeLimpar`.

As quatro decisões, porque cada uma tem um jeito errado mais fácil:

- **IndexedDB, não memória e não `localStorage`.** A aba fecha, o celular
  reinicia, a bateria acaba. `localStorage` é síncrono, trava a tela no meio
  do turno e some no primeiro "limpar dados do site".
- **Apagar só o confirmado.** Uma fila que se limpa ao receber "200 OK" apaga
  registro que não existe em lugar nenhum. O ensaio guarda uma operação de
  tipo desconhecido justamente para provar que ela FICA, com o motivo do
  servidor ao lado.
- **`SemConexao` não é `ErroApi`.** Ninguém respondeu é uma coisa; o servidor
  recusou é outra. Recusa não vai para a fila: "esta opção exige
  justificativa" é resposta, e guardá-la empurraria para a madrugada um erro
  que a pessoa corrige agora.
- **A tela não recarrega depois de enfileirar.** Sem servidor não há o que
  devolver, e recarregar apagaria da tela o que a pessoa acabou de registrar.

O intervalo de 30 segundos existe porque `navigator.onLine` mente: o celular
na casa fica "conectado" a um wi-fi que não alcança a internet, e o evento
`online` nunca dispara. Quem sabe se há sinal é a resposta do servidor.

Três defeitos apareceram construindo (o detalhe está no backlog, fase 46): a
lista de tipos do `mock.ts` divergia do servidor; a chamada marcada offline
continuava pedindo para ser marcada; e a folha aberta do cabeçalho herdava a
tinta clara do navy e vinha ilegível.

**Fica de fora, e não por falta de código:** a confirmação de dose. O §11.7
exige o aparelho institucional, e o aparelho só sabe que é ele se o código
estiver guardado nele — o que depende de onde esse código é digitado. É a
pendência #7 chegando na tela, e a resposta é da Fundação.

### 8.15 As folhas em Word saem do servidor — 02/09/2026

A dívida mais antiga do §11 da lista do que falta. Cinco documentos — ATA,
ocorrência, saúde do acolhido, grade da casa e combinados — eram montados no
navegador, e o `.docx` era escrito lá. Só o relatório tinha rota de verdade.

Funcionava, e o preço era invisível: **arquivo gerado no navegador não passa
por auditoria**. Um documento com o timbre da Fundação saía do sistema e
ninguém conseguia responder, meses depois, quem o tirou e para quê.

Agora: `kernel/documentos/folha.ts` é o contrato — sem import nenhum, lido
pelo servidor e pela tela, que é o que garante que a folha conferida na tela é
o documento que sai. `kernel/documentos/documentos.service.ts` transforma
folha em `.docx` com o timbre, e mora no kernel porque quatro partições
precisam dele e **partição não importa partição**. Cada partição monta a folha
do documento que é dela.

**Ver não é exportar**, e a separação está nas rotas: `GET .../folha` monta a
estrutura, não gera arquivo e não registra nada — conferir antes de baixar não
pode custar um registro de exportação que nunca aconteceu. `POST .../export`
exige a finalidade escrita, gera o arquivo e registra a saída **antes** de
gerá-lo: se a geração falhar fica o registro de uma tentativa, que é
informação; a ordem inversa perderia a saída que deu certo e morreu antes de
auditar.

O `docx.ts` do navegador continua existindo por uma razão só — o protótipo não
tem servidor —, mas deixou de declarar o contrato: enquanto a folha era
declarada dos dois lados, ela era a mesma por disciplina, e disciplina não
sobrevive ao primeiro campo que alguém acrescenta de um lado só.

Quatro defeitos apareceram construindo, e três deles foram achados pelos
próprios conferidores do projeto (o detalhe está no backlog, fase 47). O mais
instrutivo: `app_house_label` filtra por INSTITUIÇÃO, não por alcance — a
grade de outra casa saía com o título certo e o corpo vazio, que é a regra 12
outra vez, agora impressa em papel timbrado.

### 8.16 O servidor morreu, e agora? — 02/09/2026

O projeto tinha 425 testes e nenhuma resposta para essa pergunta. Agora tem
`scripts/backup.sh`, `scripts/restaurar.sh` e — o que importa —
`npm run ensaio:restauracao`, que faz o ciclo inteiro num banco descartável e
confere. Backup que nunca foi restaurado não é backup: é uma esperança
guardada em disco.

**A decisão que atravessa a fase:** a `CREDENTIAL_KEY` não entra no backup.
Sem ela, o cofre volta como bytes ilegíveis — as credenciais dos acolhidos
morrem com a chave, não com o servidor. Com ela junto, uma pasta extraviada
passa a valer as senhas de gov.br e INSS de vinte crianças. O script lembra
disso toda vez, em vez de resolver por conta. E `conferir-cofre.mjs` duplica a
derivação da chave de propósito: no dia da restauração o serviço ainda não
está no ar, e um conferidor que depende do que se quer conferir não confere
nada.

Quatro achados, e o mais desconfortável não é técnico: **a janela de acesso
por plantão (T-10/T+10) não existe, e três documentos diziam que sim.** Duas
chaves no `.env.example`, uma linha na `arquitetura.md` dizendo "implementada
como configuração", e nenhum código lendo nada disso. Ela depende da escala
12x36, que a Fundação não entregou. Corrigido nos três lugares: uma chave que
não faz nada é pior do que chave nenhuma, porque alguém escreve `enforce` e
acredita que a casa está protegida.

Os outros três estão no backlog (fase 48). Vale destacar um: `ARQUIVO_DIR` e
`ARQUIVOS_DIR` diferiam por uma letra e guardavam acervos diferentes — as
cópias documentais e os objetos do dossiê do acolhido. Perder um deles é
perder documento de criança sem que o banco acuse nada.

### 8.17 O roteiro vira ensaio, e o Word para de envelhecer — 02/09/2026

`frontend/ensaio-roteiro.mjs` percorre as 20 tarefas do `roteiro-marcelo.md` e
cobra que cada uma tenha porta no cargo certo. Ele **não** simula a procura de
uma pessoa: onde ela para é justamente o que a aplicação do roteiro serve para
descobrir. O que ele impede é o fracasso barato — a tarefa não ter porta
nenhuma, e isso aparecer diante da equipe.

O texto cobrado é o que a PESSOA lê, e não um seletor: se o rótulo mudar, o
ensaio falha, e é o que se quer, porque o roteiro também envelhece com o
rótulo.

E o `roteiro-marcelo.docx` passou a nascer do markdown
(`scripts/roteiro-em-word.mjs`). Ele estava dois dias atrasado, montado à mão
em 31/08 — e é o Word que alguém imprime e leva para a casa. Uma folha por
cargo, com as três linhas pontilhadas que o próprio roteiro pede: achou,
quanto tempo, a frase dela. As perguntas do fim são para o Marcelo, e por isso
recebem espaço em branco em vez de "achou? sim/não" — a linha errada pede a
coisa errada.

O achado que muda o dia da aplicação: **a chamada da manhã do protótipo já
está confirmada**, e a tarefa 1 pedia "confirme a presença da chamada da
manhã". O estado confirmado existe de propósito; quem mudou foi o roteiro.

### 8.18 A tela lida no corredor — 02/09/2026

`npm run ensaio:acessibilidade` roda o axe-core (WCAG 2.1 A e AA) nas 107
telas dos oito cargos. A primeira rodada acusou **uma regra só** — nome
acessível, rótulo de campo e ordem de cabeçalho passaram todos —, mas era
contraste, e em 49 telas.

O achado que mais importa não é a cor: é o mecanismo. Quatro listas recuavam o
que já aconteceu com `opacity` entre .55 e .62 — a dose administrada, a
atividade concluída, a criança que saiu. A intenção estava certa, e está
escrita no CSS desde a fase em que nasceu: *some do foco, não da história*. O
que ninguém viu é que `opacity` desbota o TEXTO junto com a decoração, e a
conta é multiplicativa: a linha de apoio, já cinza por ser apoio, caía para
2,3:1 — metade do mínimo. A informação de **quem confirmou a dose e a que
horas** ficava ilegível exatamente na linha em que ela é conferida.

O recuo passou a ser de fundo e de peso. E ficou a regra: toda tinta precisa
passar nos três fundos claros, não só no branco — `--muted` estava aprovada em
5,44:1 no branco e reprovada em 4,49:1 sobre a superfície rebaixada.

### 8.19 Um ano de casa — 02/09/2026

`backend/scripts/ensaio-carga.ts` escreve doze meses da Fundação inteira em
dados fictícios e mede pelo HTTP, com sessão e RLS. As três telas mais abertas
do sistema respondiam em **oito segundos e meio**.

A causa é uma frase que parece inofensiva:

```sql
(scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = $2
```

Sob RLS, o Postgres só empurra para dentro do índice os predicados
**leakproof** — os que não vazam, por mensagem de erro, o conteúdo de uma linha
que a pessoa não podia ver. `timezone()` e o cast para `date` não são. O filtro
do dia era aplicado depois da política de segurança, e `app_person_in_scope()`
rodava uma vez para cada linha do ano da casa.

A correção converte o parâmetro em vez da coluna: uma faixa de `timestamptz`,
cuja comparação é leakproof. 8 612 ms → 65 ms.

**Duas coisas que esta fase ensina além do número.** A primeira: a hipótese
óbvia estava errada, e foi a não-mudança que apontou a direção certa — quatro
índices de expressão criados, e o tempo idêntico. A segunda: a reescrita é o
tipo de mudança que erra em silêncio, e por isso ela veio com
`test/fronteira-do-dia.e2e.spec.ts`, que prega 00:00 e 23:59 no chão e foi
provado falhando. Em UTC, as 23h59 de Porto Alegre são 02h59 do dia seguinte:
o erro seria de três horas, todo dia, para sempre, e nenhum dos 430 testes
existentes o notaria.

### 8.20 O que a lista da casa pede — 03/09/2026

Chegou o documento que a equipe técnica mantém à mão: as vinte crianças da
Casa 03, com filiação, RG, cartão SUS, os telefones da genitora, do padrinho,
da tia e do vínculo comunitário, o número do processo e a chave de acesso a
ele. Reenviado inteiro toda vez que uma linha muda.

**Ele foi lido como especificação, e nenhum dado real entrou no sistema.** A
carga é da implantação, com a LGPD decidida — e o arquivo em si é o argumento
mais forte que o projeto tem: CPF, processo e chave de acesso de vinte
crianças, circulando por anexo, desatualizados no dia seguinte ao envio.

Migração 0880. As decisões que a fase tomou estão no backlog (fase 52); as
duas que mais mudam a forma do dado:

* **a filiação é texto, um nome por linha.** Duas colunas "mãe" e "pai"
  obrigariam a decidir, no cadastro, qual nome é de qual papel — e a família de
  uma criança acolhida raramente cabe nesse molde;
* **a chave de acesso vai para o cofre**, não para o cadastro. Ela abre o
  processo inteiro: é da natureza da senha do gov.br, e não de um número de
  documento.

E uma coluna que o documento não tem: `person_contact.restricted`, com motivo
obrigatório, para o contato cuja aproximação está suspensa por decisão
judicial. O telefone está no papel; a proibição, não.

### 8.21 Internação hospitalar — 03/09/2026

A criança internada continua da casa e sai da linha do dia. Migração 0890,
quatro tabelas; o detalhe das decisões está no backlog (fase 53). **A tela
ainda não existe.**

O achado que vale para o projeto inteiro, e não só para esta partição:

**uma política de RLS não pode se basear em consultar a própria tabela que ela
protege.** A política de leitura de `hospitalization` chamava uma função que
fazia `SELECT ... FROM hospitalization`, e todo `INSERT ... RETURNING` falhava:
devolver a linha recém-criada exige poder lê-la, e a subconsulta enxerga o
instantâneo ANTERIOR ao comando — onde a linha ainda não existe. A resposta é
sempre "não".

Duas coisas que isso ensina. A primeira: a recusa chega como `new row violates
row-level security policy`, que aponta para a política de INSERT, onde não há
nada errado — uma hora de investigação no lugar errado. A segunda:
`SECURITY DEFINER` **não** resolve, porque o problema não é privilégio, é
visibilidade dentro do mesmo comando. A política precisa ser escrita sobre as
COLUNAS da linha.

### 8.22 A internação ganha tela — 03/09/2026

A tela, a porta em "Mais", o alcance por cargo e o `mock.ts`. O que importa é o
efeito: no protótipo, a criança internada **some da chamada e da grade** igual
ao servidor. Sem isso, a demonstração mostraria a internação como uma lista
bonita e ensinaria exatamente o contrário do que o sistema faz — a explicação
combinaria com a tela enquanto nenhuma das duas combinasse com o produto.

O achado, e ele é a regra 14 num disfarce novo: **o estado do servidor de
mentira nasceu dentro da função que responde.** As listas de internações e de
contatos foram declaradas dentro de `responder()`. Compilava; a demonstração
respondia "internação aberta"; e a lista seguinte vinha vazia, porque o array
nascia de novo a cada chamada. Não aparece num ensaio de telas — aparece
quando alguém usa a demonstração como se fosse o sistema, que é o que a casa
vai fazer com ela.

### 8.23 A internação aparece onde a criança aparece — 03/09/2026

A criança internada sumia da chamada, de propósito, e nada dizia por quê. O
educador contaria dezenove onde havia vinte. A lista de acolhidos passou a
mostrar **"no hospital"** para todo mundo da casa: o FATO e o lugar, nunca o
motivo — que continua atrás do alcance da internação.

É a diferença entre saber por que a cadeira está vazia e ler o prontuário. A
primeira é condição para trabalhar; a segunda é decisão de quem cuida do caso.

E a promessa da fase anterior foi paga: o período no hospital e as doses de lá
entram no histórico de saúde e na folha que a Enfermagem leva para a consulta.
Uma folha com três semanas em branco, sem dizer que houve internação, faz o
médico concluir que ninguém acompanhou.

Achado: havia duas noções de "internada" convivendo. A pendência do painel de
saúde olhava o TIPO do atendimento, que registra *que houve* uma internação, e
não o período — e responderia "não" para uma criança que está no hospital
agora.

### 8.24 Simular o uso — 03/09/2026

`npm run ensaio:uso` percorre os oito cargos **apertando os botões até o fim**.
Os outros ensaios param antes: um abre cada tela e olha o que ela escreveu, o
outro cobra que cada tarefa tenha porta. Nenhum chegava ao terceiro clique, que
é onde mora a folha que abre e não fecha, o botão que salva e não recarrega, e
a tela que mostra estado sem dizer o que fazer.

Os dois achados são da mesma família — **a tela não diz o que a pessoa precisa
saber ali**:

* **o cofre não abria.** O protótipo entra sem senha e três telas depois pede
  "sua senha". Quem demonstra não tem senha para dar: tenta, erra, conclui que
  está quebrado. A tela do cofre passou a dizer, só no protótipo, qual é. No
  sistema real a dica não existe — escrevê-la lá seria o oposto do que o cofre
  defende;
* **a passagem não tinha verbo.** Um cartão de estado e o resto em branco. O
  cartão é clicável, e a tarefa do educador é "registre a sua passagem". Quem
  chega vê um aviso, não uma coisa para fazer.

E o ensaio novo caiu, duas vezes, na armadilha que o `ensaio.mjs` já anotava:
`text-transform: uppercase` faz a tela devolver "QUEM APARECE POR ALICE", e
comparação sensível a maiúsculas reprova uma tela certa.

### 8.25 O quarto clique — 03/09/2026

O `ensaio:uso` apertava os botões e olhava se a tela respondeu. O defeito da
fase 31 — a entrada de remédio que substituía em vez de somar, e fazia 30
frascos virarem 10 — passaria por todas as cobranças que existiam: a folha
abriu, o botão salvou, a tela mudou. Só o número estava errado.

Ele passou a ler de volta: a quantidade depois da entrada, o travamento sem
motivo na conferência, a frase da exceção na lista, a contagem de dias com
relato depois do diário.

E foi provado falhando: invertida a soma no `mock.ts`, o ensaio acusou com o
número na mensagem — "2 + 10 deveria dar 12, deu 10".

### 8.26 O trabalho social — 04/09/2026

O Gestor Geral responde pelas oito casas e não vai abrir a grade de medicação
de nenhuma. Faltava a outra leitura: o que o acolhimento produziu. Migração
0900, tela `TrabalhoSocial.tsx`, e uma chave no alto do cabeçalho — troca de
modo, e modo não mora no menu.

**O risco foi escrito antes de a tabela existir**, no cabeçalho da própria
migração: contar conquistas por casa é a distância de um `ORDER BY` de virar
ranking de casas. A casa que recebe adolescentes com medida protetiva recente e
a casa-lar com quatro crianças pequenas não estão na mesma corrida, e o placar
faz a primeira parecer pior no momento em que ela faz o trabalho mais difícil.

O desenho inteiro é essa recusa — ordem por código, sem média nem meta, lista
por data —, e há um teste só para isso, escrito **para a próxima pessoa**, que
vai querer ordenar por marcos porque parece mais útil.

A decisão mais delicada: **ausência de marco não é dado**. A criança sem linha
aqui não fracassou; ela pode ter passado o ano sobrevivendo a uma coisa que não
cabe em categoria — e é justamente essa que o trabalho da casa mais tocou. A
tela diz isso quando o período vem vazio.

### 8.27 A conquista se registra, e o relatório sai — 04/09/2026

A tela do trabalho social ganhou o registro da conquista, com comprovante, e o
relatório em Word — folha na tela, finalidade escrita, saída registrada, como
todo documento desde a fase 47.

Dois achados, e os dois são sobre coisas que cresceram sem ninguém olhar:

**O protótipo parou de ser gerado.** `vite build` passou a estourar a memória
com 3 GB de heap quando quatro tratadores entraram em `responder()`, que já
tinha mais de seis mil linhas. Não é erro de código: é uma função que o esbuild
analisa inteira. Quebrar a função resolveu, e a regra que fica é que o servidor
de mentira não cabe mais numa função só.

**Uma suíte que falhava às vezes.** O teste da medicação do hospital contava
doses numa janela de cinco minutos esperando zero, sobre uma tabela que os
seeds e outras suítes também escrevem — a regra 13 violada por quem a escreveu.
Virou contagem relativa. Uma suíte que falha às vezes é pior do que uma que
falta: ela ensina a rodar de novo até passar.

### 8.28 O relatório de uma casa, e a trajetória para a audiência — 04/09/2026

Duas pontas da frente do trabalho social.

**O relatório de uma casa só**, e com ele a coordenação entra: ela responde
por aquelas vinte crianças e é quem vai à reunião de rede e à audiência
concentrada. A visão das oito continua sendo só do Gestor Geral — comparar
casas não é função de quem responde por uma. Casa fora do alcance é recusa, e
não painel zerado, pelo mesmo motivo de sempre: zero se leria como "esta casa
não fez nada".

**A trajetória em folha** — o documento que o Juízo mais pergunta. Ela não
substitui o relatório técnico, e diz isso por escrito; e, quando não há nada
registrado, escreve que a folha vazia fala de quem não escreveu, e não da
criança. Sem essa frase, uma trajetória em branco numa audiência vira avaliação
da criança.

Achado: a rota da trajetória, no mock, capturava a da folha — faltava conferir
o número de segmentos. A tela recebia um objeto sem seções e não desenhava
nada, **sem erro nenhum**: o botão parecia morto. É o mesmo padrão de
`@Get(':id')` engolindo rota de palavra fixa, que o projeto já conhece do lado
do servidor.

### 8.29 As portas que faltavam — 04/09/2026

Duas rotas das fases 58 e 60 não tinham porta em tela nenhuma, e as duas eram
das pessoas que mais precisariam delas: a técnica não conseguia registrar uma
conquista (a tela é do Gestor Geral, e a área `impacto` no alcance é só dele),
e a coordenação não tinha como tirar o relatório da própria casa.

A conquista passou para o **perfil do acolhido**, que é onde a técnica trabalha;
o relatório da casa, para o **Painel das unidades**, que a coordenação já usa.

A lição não é nova, mas ficou mais nítida: **construir a rota e a tela em fases
diferentes deixa buracos que o `tsc` não vê e os testes de servidor não veem**,
porque do lado do servidor está tudo certo. O levantamento de rotas sem porta
precisa ser rodado depois de cada fase que abre rota nova — não semanas depois.

### 8.30 O levantamento de rotas sem porta vira conferidor — 04/09/2026

`test/rotas-sem-porta.spec.ts`. O `contrato-rotas` garante que toda chamada da
tela existe no servidor; este garante o inverso — toda rota do servidor é
chamada por alguma tela, ou está declarada como rota de máquina com o motivo
por extenso.

A lista de exceções é o coração do arquivo, e ela tem duas travas: o motivo
precisa ter mais de 40 caracteres (senão a lista vira o esconderijo do que
faltou construir), e um teste cobra que **nenhuma exceção esteja mentindo** —
rota listada como "de máquina" que ganhou tela depois.

Onze rotas na primeira rodada. Uma era gap de verdade — designar o educador que
acompanha a internação, sem botão desde a fase 53 —, e três esperam decisão da
Fundação, o que agora está escrito ao lado delas: rota parada por resposta que
não veio deixou de parecer esquecimento.

O conferidor errou duas vezes antes de acertar, e as duas valem: ele acusou as
rotas MAIS usadas da casa, porque elas passam por `apiOuFila` e o caminho vai
numa função auxiliar; e a interpolação `${idDe(ev)}` fez a primeira versão
parar nos parênteses e ler `/activities/` como rota.

### 8.31 O sistema sobe compilado — 04/09/2026

Sessenta e duas fases, 471 testes, seis ensaios de navegador — e o projeto
nunca tinha rodado compilado. Tudo sempre correu por `tsx` e por `jest`. O que
se implanta é `dist/`, sem `src/`, sem `scripts/` e sem dependência de
desenvolvimento nenhuma.

`npm run ensaio:producao` fecha essa lacuna, e a primeira rodada achou duas
coisas que teriam quebrado a implantação: **`dist/` com zero migrações** (o
`tsc` não copia `.sql`, e o `/health` responde "ok" porque o banco existe — ele
não sabe se as tabelas estão lá) e **a migração dependendo de `tsx`**, que é
dependência de desenvolvimento.

E um defeito no próprio ensaio que vale mais que os dois: ele **morria em
silêncio ao encontrar o problema**. Com `set -e`, o padrão
`<condição>; cobrar "texto" $?` mata o script na condição falsa, antes de
imprimir o ✗ — e ele sai com código 0 exatamente quando acha um defeito. Foi
visto na prática, ao desligar a cópia das migrações para provar o conferidor.

É a terceira vez que este projeto encontra a mesma família de defeito —
conferidor que falha calado —, depois do `playwright install` recusado por rede
e do ensaio que ensaiava zero telas na Cozinha. Vale como regra: **todo
conferidor precisa ser visto reprovando** antes de ser aceito.

### 8.32 O serviço recusa subir com o RLS desligado — 04/09/2026

O aviso da fase 63 — trocar `DATABASE_URL` por `DATABASE_APP_URL` desliga o RLS
sem nada avisar — virou conferência de arranque, e o serviço **recusa subir**.

Três perguntas: superusuário, `BYPASSRLS`, e a prática — sem identidade de
usuário, o banco devolve zero pessoas. A terceira é a única que pega o **dono
das tabelas**, que não é superusuário nem tem `BYPASSRLS` e mesmo assim passa
por cima das políticas, porque o Postgres isenta o dono a menos que a tabela
use `FORCE ROW LEVEL SECURITY`.

A mensagem de recusa diz qual variável está trocada, porque quem tropeça nisso
está com pressa tentando resolver "erro de permissão".

**O achado foi meu:** a primeira versão tinha uma variável para pular a
conferência, deliberadamente não documentada — "quem descobrir estará
desligando conscientemente". O conferidor de configuração da fase 56 reprovou,
e estava certo: variável que desliga a última proteção e não aparece em lugar
nenhum é porta dos fundos, não decisão informada. Removida.

### 8.33 Os dois anexos que entravam e não saíam — 04/09/2026

`hospitalization_note.storage_key` e `life_milestone.storage_key` guardavam
arquivo desde as fases 53 e 58, e nenhum dos dois tinha rota de leitura. A
equipe digitalizaria o laudo, devolveria o papel ao hospital, e no dia em que
ele fosse pedido não haveria nada. **Arquivo que entra e não sai é pior do que
arquivo nenhum**, porque a pessoa acredita que guardou.

O alcance do anexo é o da coisa que o guarda — quem lê o diário lê o anexo
dele —, e não uma regra própria, que é como as duas se desencontram com o
tempo. E "o banco diz que existe e o disco não tem" precisa soar diferente de
"não tem anexo": a mensagem manda avisar quem cuida do servidor, porque é
falha de disco ou de restauração.

Dois achados: o conferidor de rotas sem porta reprovou **no mesmo dia** em que
as rotas nasceram — na fase 62 ele achava coisas de semanas atrás; e o teste do
anexo reprovava o comportamento certo, porque o educador que eu esperava ver
recusado tinha sido designado acompanhante três testes antes.

### 8.34 Todo arquivo guardado tem por onde sair — 04/09/2026

A pergunta que a fase 66 deixou: quantos outros armazenamentos write-only
existem? Cinco tabelas guardam arquivo, e nenhuma ficou sem saída.

O que ficou é o conferidor: `test/arquivo-tem-saida.spec.ts` pergunta AO BANCO
quais tabelas têm coluna de arquivo — lista escrita à mão não sabe da tabela
que nasceu ontem — e cobra rota de leitura declarada para cada uma. A rota
precisa existir de verdade nos controladores e precisa ser `@Get`: sem essas
duas travas, a lista viraria promessa, ou apontaria para uma rota de escrita
que não devolve nada.

Provado reprovando, como a regra da fase 63 exige. E o próprio conferidor achou
um caminho errado na lista que eu escrevi.

---

## 9. Migrações desta série (0620–0900)

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
| 0770 | identity | aposenta o admin técnico |
| 0780 | checks | conferência de mesa: o ato em lote que se declara |
| 0790 | activities | avisa a atividade que venceu |
| 0800 | people | dossiê do acolhido e álbum de vivências |
| 0810 | people | corrigir o cadastro, com histórico legível |
| 0820 | medications | protocolo e autorização conferem a CASA, não só o cargo |
| 0830 | people | quem abriu os benefícios — e quem tentou e foi recusado |
| 0840 | alignments | reuniões e combinados |
| 0850 | people | o que o perfil dizia antes: histórico dos campos descritivos |
| 0860 | medications | quem decidiu que podia, e por quê: histórico do protocolo |

Sem migração nova na fase 14: os relatórios usam o que já estava gravado.
A dependência `docx` entrou no backend, e o timbre vive em `backend/assets/timbre.png`.

---

## 10. Entrega para a conversa nova

> **Este trecho ficou velho.** Para começar uma conversa nova, use
> **`docs/RETOMAR-AQUI.md`** — ele é o documento único de retomada, escrito em
> 01/09/2026, e traz o estado atual, as regras, o que falta e as decisões
> pendentes sem depender de nenhuma conversa anterior. O que segue abaixo é o
> registro do pacote de 30/08/2026, mantido pelo histórico.

### Pacote de 30/08/2026 (histórico)

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

> **Este bloco ficou velho.** O prompt atual vive em **`docs/PROMPT-MESTRE.md`**,
> junto com as regras que nasceram de defeito encontrado (10 a 14) e o estado
> de 02/09/2026. O que está abaixo é o texto de 01/09, mantido porque explica,
> em prosa, o raciocínio da fase 39 — mas **não é o que se cola numa conversa
> nova**.
>
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

Fases 0 a 39 concluídas. 373 testes passando em 34 suítes, sem falha conhecida
— a suíte rodou cinco vezes seguidas entre 21h44 e 23h30 de Porto Alegre, que
já é depois das 21h E depois da virada do dia em UTC (01/09 no banco, 31/08 na
casa): a contaminação de data que a regra procura estava valendo em todas as
rodadas, e foi a segunda delas que encontrou duas suítes instáveis (abaixo). Backend NestJS + PostgreSQL 16 com RLS, 17
partições. Frontend React PWA com 21 telas, todas falando as rotas reais do
servidor. A ATA agora tem arquivo: dia, semana ou mês de calendário, com a ATA
Geral Noturna recortada na linha de cada casa. O ciclo do acolhimento fecha:
cadastro, saída com motivo, acervo histórico e retorno como episódio novo. E o
arquivo documental deixou de ser um módulo sem entrada: fechou, entra na fila. Relatórios saem em Word com timbre, com a parte factual
escrita pelo sistema. Convite de primeiro acesso por e-mail, uso único, 24h.

CORRIGIR O CADASTRO DEPOIS DA ADMISSÃO (§6.2, migração 0810). O sistema só
sabia CADASTRAR: nome escrito errado às 23h com a criança na porta, data de
nascimento trocada porque a certidão veio depois. Sem porta para corrigir, a
saída de quem usa é recadastrar — e aí existem duas crianças, o histórico parte
em dois, e é isso que a audiência pergunta.

Corrigir SEM histórico seria pior: um nome que muda em silêncio faz toda
passagem assinada, toda ATA fechada e toda dose confirmada passarem a falar de
alguém que, nos papéis de antes, tinha outro nome. `person_correction` guarda o
que estava, o que passou a estar, quem, quando e por quê — uma linha por campo,
sem UPDATE nem DELETE. Ela é TABELA e não `audit_event` de propósito: a
auditoria é área restrita e responde "quem mexeu no sistema"; esta responde a
uma pergunta do caso — "por que o nome dela mudou em março?" — e é lida por quem
cuida, no perfil.

O motivo é obrigatório com mínimo, campo que não mudou não vira correção, e nome
civil e nascimento não se esvaziam. A área judicial ganhou a folha de
atualização, restrita à técnica e à coordenação, valendo só para o episódio
ATIVO — o acolhimento anterior continua contando o que houve naquela época.

UM DEFEITO DE TELA: a SITUAÇÃO judicial nunca era desenhada. O servidor devolvia
o campo desde a fase 0 e o perfil mostrava motivo, medida, vara, processo e
guia — tudo menos o que está valendo hoje. Quem abria a área restrita lia o
motivo de fevereiro e não sabia da audiência de agosto.

A SUBSTITUIÇÃO DE ATIVIDADE (§8.3) e a ATIVIDADE URGENTE (§8.2) ganharam porta.
Cinco rotas da fase 3 sem tela nenhuma.

DELEGAR e SUBSTITUIR não são a mesma coisa, e a tela não as mistura: delegar é
de cima para baixo, do líder; o PEDIDO nasce de quem vai sair, e por isso o
"Não vou conseguir" fica atrás do "..." para QUALQUER pessoa do turno — inclusive
o educador, que antes só via o "..." se fosse líder. O pedido fica em aberto,
a atividade vai para "aguardando substituição", e quem assume ainda precisa
tomar ciência: designado não é o mesmo que avisado. Recusar exige motivo, e o
sistema entrega esse motivo a quem pediu — é o que substitui o recado no
corredor. O pedido que perdeu o sentido enquanto esperava vem MARCADO e não
some: o sistema diz o que houve e deixa a decisão com quem lidera.

A atividade urgente é PONTUAL, e a folha diz isso com todas as letras, porque é
a confusão mais fácil de fazer: quem quer mudar o horário da janta para sempre
precisa da tela da Rotina, e lá a mudança abre versão nova.

UM DESENCONTRO encontrado pelo teste: a tela e o mock diziam `autorizada` e o
banco só aceita `atribuida` (CHECK da migração 0110). O e2e pegou na primeira
rodada; os três lados falam o mesmo valor agora.

O DOSSIÊ DO ACOLHIDO (§6.1, migração 0800) e o ÁLBUM DE VIVÊNCIAS (§6.9)
saíram do papel. `document`, `document_version` e `memory_record` existiam
desde a fase 0 e nunca tiveram porta — o perfil listava documentos e não abria
nenhum. Agora a tela é a LISTA EXIGIDA da casa, em cinco categorias
(pessoais/escolares, atendimentos médicos, educacionais, convivência e
registros judiciais), e cada item tem uma de três situações: falta, aguardando
conferência, aceito.

Quatro coisas que valem mais do que a tela:

 * ANEXAR NÃO É CONFERIR. O arquivo entra sem aceite; o aceite é ato separado,
   de quem OLHOU, com nome e horário — e o gatilho do banco recusa aceitar em
   nome de outro e recusa apagar um aceite;
 * o tipo é conferido pela ASSINATURA do arquivo, não pela extensão;
 * o título E o nome do arquivo são barrados quando parecem CPF, diagnóstico ou
   teor judicial (regra 3), na tela e no servidor;
 * a categoria judicial some para quem não a alcança — e a recusa ao abrir é
   404, não 403: dizer "proibido" já contaria que o documento existe.

Sobre as FOTOS das vivências: o Marcelo decidiu, em 01/09/2026, NÃO bloquear a
foto por falta de autorização de uso de imagem. O sistema não impede — e MOSTRA,
por foto e no topo do álbum, quando a autorização não está registrada.

Os objetos ficam em `ARQUIVOS_DIR` (fora do repositório, no `.gitignore`), com
sha256 conferido a cada abertura: objeto trocado por baixo não passa como se
fosse o que foi aceito.

QUATRO FACILITADORES, pedidos depois de usar o protótipo: "todos organizados"
na seção de ambientes da ATA (escrevendo uma linha por ambiente, para sobrar
onde dizer que o banheiro alagou), "turno sem intercorrência" escrevendo o
rascunho da passagem (só com os campos vazios), busca por nome na chamada, e a
conferência de mesa abaixo.

A CONFERÊNCIA DE MESA (§10, migração 0780) veio de o Marcelo usar o protótipo:
no almoço, a educadora olha a mesa, vê que as vinte estão comendo, e precisava
de vinte toques para dizer isso. A regra escrita é "sem marcação em lote
SILENCIOSA", e a do banco é "nada que preencha o que NÃO foi olhado" — nenhuma
proíbe registrar de uma vez o que foi olhado de uma vez, desde que fique
gravado que foi assim. O ato tem linha própria em `check_bulk` (quem, quando,
quantos), as linhas que nascem dele apontam para ele, corrigir uma delas zera
o vínculo, e a CHAMADA FINAL DO TURNO não a aceita — ela existe para alguém
contar as crianças uma a uma antes de dormir. A lista de conferidos passou a
recolher, com contador, e um toque reabre o nome.

DOIS DEFEITOS DE VIRADA DE DIA, encontrados às 00h38 pela regra de rodar depois
das 21h — e o primeiro é grave:

 * `markUnconfirmed` MARCAVA toda atividade vencida da casa, sem limite de
   data, mas só AVISAVA as de `hojeNaInstituicao()`. Depois da meia-noite, a
   atividade das 21h era marcada "sem confirmação" e ninguém era avisado. Toda
   noite, em silêncio, no turno em que há uma pessoa sozinha com vinte
   crianças. Agora ele avisa sobre as que ESTA CHAMADA marcou (migração 0790);
 * `regressao-estado` prescrevia doses às 06h de HOJE, que de madrugada estão
   no futuro. Passou a prescrever desde ONTEM.

FICA ANOTADO: o quinto facilitador pedido — "concluí tudo até agora" no Dia —
NÃO foi feito, e por um motivo. A linha do tempo do Dia inclui DOSE DE
MEDICAMENTO, e ali "não existe marcação em lote" é absoluto, sem a palavra
"silenciosa" (§11.2). Um botão de concluir tudo naquela tela confirmaria doses.
O caminho seguro é restringi-lo às atividades COLETIVAS que não são
medicamento, com o mesmo ato declarado da conferência de mesa — e isso é
decisão do Marcelo.

FICA ANOTADO, e é decisão do Marcelo: o Arquivo das ATAS abre no MÊS CORRENTE, e
todo dia 1º esse mês está quase vazio — o mesmo argumento que fez o padrão
deixar de ser a semana. Uma quarta opção "últimos 30 dias" como padrão resolve.

A ROTINA VERSIONADA DA CASA (§8.1) ganhou tela. Quatro rotas da fase 2 sem
porta nenhuma: o dia nascia de dados semeados, e a pergunta "a que horas é a
janta aqui?" se respondia no quadro da cozinha. A tela mostra o molde de agora
e as versões que a casa já seguiu; alterar abre VERSÃO NOVA com o motivo
escrito e copia os itens, e a anterior continua inteira. Quem lê é a casa toda;
quem altera é a equipe técnica e a coordenação — e o alcance foi aberto no mapa
de `alcance.ts`, com a marca `alcance:rotina` no servidor, para página e menu
não divergirem. Um defeito ali: a guarda de "item individual precisa do
acolhido" usava `!input.collective`, e `undefined` é falso — omitir o campo,
que é a forma natural de dizer "da casa toda" e o que o próprio INSERT entende
assim, era recusado. A rota nunca teve tela, e por isso ninguém tinha esbarrado.

Os EPISÓDIOS DO TURNO (§12.5) ganharam porta. O relato é imutável — o banco
recusa UPDATE e DELETE —, a classificação descreve o FATO e nunca a criança, e
quem assume o turno registra CIÊNCIA, com comentário próprio nascendo ao lado.
Duas coisas foram encontradas ao construir isso:

 * **o servidor aceitava episódio novo numa ATA JÁ FECHADA**, sem adendo
   nenhum. A cópia documental daquela ATA já tinha ido para o arquivo — sistema
   e cópia passavam a dizer coisas diferentes, em silêncio. Agora ele recusa e
   diz onde registrar. *Fica uma pergunta para o Marcelo: se a instituição
   preferir permitir, o caminho honesto é reabrir a ATA (que deixa adendo) e
   não abrir uma exceção só para o episódio.*
 * **a tela tratava "fechada com pendência" como aberta** — comparava só com
   `'fechada'`. Fechar com pendência é o caminho normal quando falta assinatura,
   e a ATA voltava com os campos editáveis; quem escrevesse levava a recusa do
   servidor depois de ter digitado.

Três suítes eram instáveis e a regra das duas rodadas as pegou. `rotina-versionada`
disputava a rotina da AI3 com `operacao.e2e`, que conta as versões e os itens
dela pelo número exato — passou a trabalhar na Casa 04. `regressao-saida`
registrava o episódio na ATA de HOJE (que outra suíte fecha antes, dependendo da
ordem dos arquivos) e `cadastro` presumia que a mudança de limite mais recente
era a dela. Ambas passaram a se ancorar no que guardam, não na ordem.

A "Administração técnica" foi aposentada: as funções dela passaram para a
equipe técnica, a coordenação e o Líder Diurno, sem apagar ninguém e sem
desativar conta (migração 0770). E o design passou por uma revisão inteira nos
dois temas — o cartão que era botão ficava cinza no escuro, o "Sair" sumia na
barra, os títulos de folha usavam a cor de FUNDO da barra, e a linha do tempo
tinha quatro botões do mesmo peso.

SUSPENDER O ESQUEMA e AUTORIZAR QUEM PODE DAR (§11.1 e §11.3, migração 0820).
É onde o silêncio custa mais caro, e havia três silêncios empilhados.

Primeiro, não existia rota que LISTASSE prescrições — só a grade de doses. Um
rascunho salvo e não assinado ficava gravado e invisível, que é o pior dos dois
mundos, e não havia de onde suspender.

Segundo, e este é o grave: suspender mudava o status da prescrição e DEIXAVA AS
DOSES DE HOJE NA GRADE, com o botão "Confirmar" ao lado. `app_generate_doses` só
gera para prescrição ativa, então no dia seguinte ficava tudo limpo e ninguém
percebia — mas o remédio suspenso às 10h continuava sendo cobrado às 16h, e
alguém dava. A regra agora tem três partes, e as três estão no e2e:

 * a dose que AINDA NÃO chegou a hora sai da grade com estado próprio
   (`suspenso_conforme_orientacao`) e a orientação escrita ao lado. Nada é
   apagado, e `administered_by` continua nulo porque ninguém administrou;
 * a dose já confirmada fica exatamente como está — suspender não apaga o que a
   criança tomou;
 * a dose que passou da hora e ninguém confirmou CONTINUA pendente. Ela não foi
   suspensa: ficou sem resposta, e alguém ainda deve essa resposta. Suspender
   hoje não é caneta para apagar a manhã.

Terceiro, do lado de quem pode dar: as policies do protocolo e da autorização
nominal conferiam o CARGO e esqueciam a CASA — `WITH CHECK (app_current_role()
IN ('coordenador','gestor_geral'))`, sem `app_house_in_scope`. Coordenador é
cargo de UMA casa: a coordenação da Casa 03 podia escrever o protocolo da Casa
04 e autorizar nominalmente um educador de lá, sem passar por ninguém daquela
casa. É o "acesso a outra casa fora das exceções funcionais" da regra 3, no
lugar mais caro possível. Corrigido nas duas camadas: policy na 0820, frase de
recusa na aplicação (a policy sozinha devolvia 500 com texto de banco).

E dois defeitos de data no mesmo canto. `medication_authorization.valid_from`
nascia com `DEFAULT current_date` — o dia do BANCO, em UTC: depois das 21h de
Porto Alegre a autorização escrita hoje nascia datada de amanhã, e
`app_can_administer` (que compara com `app_hoje()`) recusava a dose a noite
inteira com a autorização visível na tela. E `listAuthorizations` comparava
`String(valorDate) <= hoje`, o que dá "Mon Sep 01 2026 00:00:00 GMT+0000" contra
"2026-09-01": TODA autorização vigente aparecia como vencida.

A tela: a aba "Prescrever" virou "Esquemas" e abriu para a coordenação, que não
prescreve nem suspende, mas precisa ler quem está na grade para decidir o
protocolo. Suspender pede a ORIENTAÇÃO que motivou (não uma opinião) e a folha
diz, antes de confirmar, que sai da grade a partir de agora e que o já
confirmado continua registrado. Autorizar diz duas coisas que não podem ser
esquecidas: a autorização é da PESSOA, não do cargo, e NÃO substitui o
protocolo da casa — as duas condições valem juntas, e o e2e guarda isso
autorizando um educador e mostrando que ele continua recusado até o protocolo
abrir o período.

O REGISTRO PROTEGIDO DEPOIS DA ABERTURA (§13.2) fecha o grupo 1 do
`o-que-falta.md`: não sobra nada que a educadora de plantão precise fazer às 23h
e não tenha porta.

A folha de abrir ocorrência já recebia fala espontânea e sinais observados. O
que faltava é o caso mais comum de todos: a criança fala DEPOIS. Três dias
depois, na hora de dormir, para quem estava perto — e não para quem abriu a
ocorrência. Sem porta, sobravam dois caminhos e os dois são piores: escrever no
campo "fato", que o plantão inteiro lê, ou não registrar em lugar nenhum.

A folha pede duas coisas difíceis de quem está cansada, e diz as duas por
escrito: transcrever e não interpretar ("ele disse que o tio bateu" é leitura de
quem ouviu; "ele disse: 'o tio me bateu'" é o que a criança disse), e descrever o
sinal sem diagnosticar. E avisa, antes de a pessoa escrever, que isto NÃO é
enviado a ninguém automaticamente — nem ao Judiciário, nem ao Conselho Tutelar.
Acionar a rede é decisão humana, com nome.

Três recusas nasceram junto:

 * VAZIO não se registra. O lugar é único por ocorrência e não se reescreve: uma
   linha em branco tomaria a vaga de quem tem o que dizer;
 * OCORRÊNCIA FECHADA não recebe — a cópia documental dela já foi arquivada, e é
   a mesma correção do episódio em ATA fechada;
 * e a recusa do "já existe" NÃO conta o que já está lá. Quem levou a recusa
   pode ser exatamente quem a política impede de ler; a mensagem de erro não
   pode virar a porta dos fundos do conteúdo protegido. Ela fala do ato e
   aponta o caminho que continua aberto para essa pessoa: o relato em nome
   próprio.

UM DEFEITO DO PROTÓTIPO, encontrado ao ensaiar isto: o "Ver como" troca o CARGO
e mantém a pessoa, então qualquer verificação de autoria no `mock.ts` valia para
todos os cargos — e a demonstração mentiria justamente sobre a política mais
estreita do sistema. No protótipo, "a mesma pessoa" passou a ser o mesmo nome no
mesmo cargo.

E um ensaio frágil, que não era defeito do sistema: `acoes2` abria "o plantão
noturno" pelo texto do botão, mas QUAL turno a tela oferece depende da hora em
que o ensaio roda (7h–19h é diurno). Às 7h da manhã ele falhava por isso. Agora
abre o que estiver oferecido e entra no plantão que houver.

O HISTÓRICO DE SAÚDE DO ACOLHIDO (§7.3) e as EMISSÕES DO RESUMO (§7.4) abrem o
grupo 2. Três rotas da fase 4 sem tela nenhuma: o sistema guardava cada
consulta, cada evolução assinada por quem acompanhou e cada dose administrada, e
a pergunta mais comum da casa — "quando é o retorno dele?" — se respondia
perguntando a um colega.

A folha mostra as três origens em listas separadas, cada uma com a autoria dela,
e conta no alto o que está ESPERANDO alguém. A decisão que mais vale ali é o
retorno cuja data já passou: ele vem marcado como vencido e contado à parte,
porque uma data antiga em cinza se lê como história, e a diferença entre as duas
leituras é uma consulta perdida. A comparação usa `app_hoje()` e não o dia do
banco — depois das 21h de Porto Alegre o retorno de HOJE apareceria como
vencido, e a tela mandaria correr atrás de uma consulta que é amanhã.

Duas escolhas menores que o teste guarda: dose ainda por confirmar NÃO entra no
histórico (ela está na grade, esperando alguém — contá-la como coisa acontecida
seria o sistema afirmando que a criança tomou), e a evolução mostra as duas
vozes, o que o acompanhante escreveu e o complemento da Enfermagem, sem uma
escrever por cima da outra.

As emissões do Resumo vêm na mesma folha porque respondem à mesma pergunta —
"isto já foi para alguém, e para quê?". Um Resumo gerado e nunca retirado
continua na lista até alguém registrar que levou: papel que ninguém pegou não
chegou a lugar nenhum.

E o protótipo tinha três valores escritos na mão no painel da Enfermagem
(`internacaoEmAndamento: false`, `retornoPendente: null`), porque não havia
atendimento nenhum semeado de onde tirá-los. Agora saem da mesma lista que o
histórico lê, e o painel e a folha dizem a mesma coisa.

OS BENEFÍCIOS E DADOS BANCÁRIOS (§6.10) ganharam porta, na mesma tela do Cofre
e atrás da mesma senha — é a mesma área e a mesma regra. E ao construir apareceu
o buraco maior: a migração 055 acrescentou as colunas que a planilha real da
casa usa todo mês — número do benefício, operação da conta, nome da agência e a
PENDÊNCIA BANCÁRIA, que é o motivo de a planilha existir — e o serviço nunca as
leu nem as gravou. O sistema tinha as colunas e continuava sem responder "o que
falta resolver no banco desta criança?", enquanto a planilha seguia aberta numa
pasta compartilhada.

Agora a pendência vem primeiro na lista e exige uma linha dizendo QUAL é —
"pendente" sozinho é uma caixa marcada que a próxima coordenação não sabe
resolver. Senha em campo de texto é recusada com uma frase, e não só pelo CHECK
do banco. E nasceu o histórico de acessos que o cofre tinha e os benefícios não
(migração 0830): quem abriu, quando, para quê — e quem TENTOU e foi recusado,
que é a linha mais importante da lista e a que o log guardava só na auditoria,
que é área restrita.

OS ALINHAMENTOS DE EQUIPE (§9.4) são partição nova — `alignments`, migração
0840 —, a pedido do Marcelo. A pergunta que eles respondem é a que a casa faz
toda semana: "o que ficou combinado?". Hoje isso mora na ata de papel da
reunião, no grupo de mensagens e na memória de quem estava lá.

Escreve quem decide, lê quem cuida: registrar é da equipe técnica e da
coordenação, e LER é de todo mundo com alcance na casa. Por isso os combinados
têm porta própria no menu, e não apenas a aba dentro de Acompanhamentos — quem
mais precisa do combinado é o educador do turno da noite, que não alcança
Acompanhamentos. Um combinado que o turno não pode abrir não é combinado: é
recado que ninguém recebeu.

Três coisas que o banco garante: o TEXTO do combinado é imutável (o gatilho
recusa, e o teste tenta por dentro do banco); a SITUAÇÃO muda com motivo escrito
e o histórico nasce na mesma transação; e o encerrado não some da lista, com o
motivo e o nome de quem encerrou — "mas ficou combinado que..." é uma discussão
que só o registro encerra.

O RELATÓRIO SAI EM WORD TAMBÉM NO PROTÓTIPO. O servidor gera .docx com timbre
desde a fase 7, mas quem abria o protótipo clicava em baixar e recebia um bloco
de notas explicando que "no sistema real isto vem em Word" — e concluía, com
razão, que o relatório não existia. A parte mais visível da entrega parecia a
menos pronta. `frontend/src/docx.ts` monta o documento no navegador, sem
biblioteca (um .docx é um ZIP de XMLs), com o timbre do Pão dos Pobres, A4,
margens ABNT de 3 cm à esquerda e no topo, Times 12, entrelinha 1,5 e as seções
numeradas.

E veio junto o que a casa pediu em volta disso: a PRÉ-VISUALIZAÇÃO — a folha
abre na tela, com a cara do papel, e o botão de baixar fica ao lado. A folha da
tela e o .docx saem da MESMA estrutura: duas versões divergiriam no primeiro
ajuste, e a pessoa conferiria uma coisa e entregaria outra. Ver não é exportar,
e por isso `POST /reports/:id/preview` não pede finalidade nem deixa rastro:
quem lê o relatório na tela já podia lê-lo na tela. Tirar o documento do sistema
continua sendo `POST /:id/export`, com finalidade declarada.

O DOWNLOAD POR SETOR usa o alcance que já existe — cada botão vive dentro da
tela do setor, e a tela já é filtrada pelo cargo. A enfermagem baixa a situação
de saúde de um acolhido e a grade do dia da casa; a equipe técnica, a ATA e o
registro de ocorrência; a coordenação e a gestão, tudo. Uma decisão que não é
minha e está escrita na própria folha: a grade "para colar na parede" traz
horário, nome e medicamento, e NÃO traz diagnóstico nem condição de saúde — e
avisa que corredor, sala de visitas e mural aberto não são lugar para o nome de
uma criança ao lado do remédio que ela toma.

E a TARJA do protótipo: era âmbar sólido com `color:#fff` fixo — no claro,
brigava com o azul da barra; no escuro, o token vira amarelo claro e o branco
sumia. O aviso mais importante da tela era o texto menos legível dela.

Em aberto, na ordem: `docs/o-que-falta.md` — 26 rotas que existem no servidor e
não têm tela, separadas entre o que vale para o piloto, o que espera e o que é
de máquina; o retorno do Marcelo por cargo; duas decisões de produto que não são
minhas (devolver acompanhamento para correção; o "concluí tudo até agora" na
linha do dia, que só é seguro fora dos medicamentos; e o padrão "últimos 30
dias" no Arquivo das ATAS, hoje preso ao mês de calendário e quase vazio todo
dia 1º), mais a pergunta menor de se o recorte por casa deve valer também para a
ATA Geral do dia corrente; e o SMTP institucional, só na implantação.

Leia a seção 10 do documento: ela tem a entrega completa e como retomar.

=== O QUE EU QUERO AGORA ===

[ESCREVA AQUI SEU PEDIDO]
```
