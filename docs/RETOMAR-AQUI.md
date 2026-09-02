# RETOMAR AQUI — Rede Acolher

**Documento único de retomada.** Foi escrito para ser a PRIMEIRA coisa anexada
numa conversa nova. Quem ler isto do começo ao fim sabe o que o sistema é, onde
ele está, o que já funciona, o que falta e o que não pode ser feito — sem
precisar de nenhuma outra conversa anterior.

*Atualizado em 01/09/2026. Substitui o "pacote de retomada" da seção 10 do
`CONTINUIDADE.md`, que ficou velho.*

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

O código vive no arquivo **`rede-acolher-atualizado.zip`** (≈1,4 MB), entregue
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
│   ├── test/              38 suítes (e2e contra PostgreSQL real + estáticas)
│   └── assets/timbre.png  a marca da Fundação, usada no documento em Word
├── frontend/
│   ├── src/
│   │   ├── screens/       29 telas React
│   │   ├── mock.ts        o "servidor de mentira" do protótipo
│   │   ├── docx.ts        monta o .docx no navegador (timbre + ABNT)
│   │   ├── documentos.tsx pré-visualização em folha + downloads por setor
│   │   ├── api.ts         cliente HTTP + classe ErroApi
│   │   ├── App.tsx        navegação, abas, seletor de cargo do protótipo
│   │   └── styles.css     design system, tema claro e escuro
├── prototipo/             rede-acolher-prototipo.html  ← o arquivo que o
│                          Marcelo abre (um arquivo só, ~810 KB, sem servidor)
└── docs/                  este arquivo, CONTINUIDADE, DER, o-que-falta,
                           backlog, matriz de permissões, roteiro do Marcelo…
```

**As 17 partições do backend:** activities, alignments, archive, checks, houses,
identity, incidents, medications, notifications, nursing, people, reports,
routine, shifts, statements, sync, timeline.

### Como rodar

```bash
# o protótipo (um arquivo .html, sem servidor, sem banco)
cd frontend && npm run prototipo
# abre em prototipo/rede-acolher-prototipo.html

# conferir tipos — obrigatório antes de qualquer entrega
cd frontend && npx tsc --noEmit
cd backend  && npx tsc --noEmit -p tsconfig.json

# testes: precisam de PostgreSQL 16 rodando
cd backend && DATABASE_URL="postgres://rede_admin@127.0.0.1:5432/rede_acolher" \
              ARQUIVOS_DIR=/tmp/arquivos npx jest
```

**PostgreSQL no ambiente de desenvolvimento** (não há docker daemon; ele para
sozinho e precisa ser reiniciado antes das rodadas):

```bash
su postgres -c '/usr/lib/postgresql/16/bin/postgres -D /tmp/pgdata \
  -k /tmp/pgrun -h 127.0.0.1 -p 5432'
```

O `globalSetup` do Jest derruba e recria o schema a cada rodada, roda as 72
migrações em ordem e aplica os seeds (`seed.ts`, `seed-fase2.ts`,
`seed-fase4.ts`).

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

Além dos e2e, quatro suítes estáticas — elas já pegaram erro de verdade:

- `arquitetura.spec.ts` — fronteiras entre partições, e o marcador
  `rls-join-ok:` obrigatório perto de todo JOIN;
- `contrato-rotas.spec.ts` — toda rota chamada pela tela **existe** no servidor
  (foi ela que pegou a pré-visualização do relatório sem rota);
- `alcance.spec.ts` — as marcas `/* alcance:<área> */` lidas do código que roda;
- `documentacao.spec.ts` — toda tabela do banco aparece em `docs/der.md`, e a
  contagem do inventário bate.

---

## 5. O QUE JÁ ESTÁ PRONTO

**Fases 0 a 44. 408 testes em 38 suítes**, **cinco rodadas seguidas limpas
entre 21h42 e 21h47 de Porto Alegre**, com o UTC já em 02/09 e a casa ainda em
01/09 — a condição que a regra pede. Foi a rodada dessa hora que encontrou a
suíte instável descrita abaixo. 29 telas, 72 migrações, 89 tabelas.

**O ciclo do acolhimento:** admissão com motivo e capacidade, perfil, correção
de cadastro com histórico legível, **atualização dos dados descritivos —
cuidados essenciais, escola, equipe de referência — guardando o que estava
escrito antes**, saída com motivo, acervo histórico e retorno como episódio
novo.

**O turno:** o Dia com a rotina versionada da casa e o filtro **"Por criança"**
— uma linha por acolhido, em ordem alfabética, com o alerta essencial primeiro —, chamadas coletivas com
conferência de mesa, passagem de plantão assinada uma a uma, ATA do turno com o
corpo do livro real da Casa 03, episódios do turno com relato imutável e ciência
nominal, ATA Geral Noturna e o Arquivo das ATAS por dia, semana ou mês.

**Saúde:** grade de doses confirmada uma a uma por quem administrou, triagem de
evoluções, armário, esquemas de medicamento (rascunho, na grade, suspenso),
suspensão que tira a dose da grade dizendo por quê, **protocolo de quem pode dar
remédio definido pela coordenação, com motivo escrito e o registro de cada
decisão**, autorização nominal de educador, histórico de saúde do acolhido e
emissões do Resumo de Saúde.

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

### Grupo 2 — falta tela, mas espera

- **Fontes do acompanhamento** — `POST /followups/:id/sources` grava a
  REFERÊNCIA de um registro que embasou a avaliação, e não existe rota que liste
  os candidatos. De onde a equipe escolhe é decisão do Marcelo (§7 abaixo).
- **Capacidade da casa** — `POST /houses/:id/capacity`,
  `GET /houses/:id/capacity-history`.
- **Painel da casa na linha do tempo** — `GET /timeline/house-panel`.
- **Leitura excepcional de relato** — `POST /statements/:id/exceptional-read`:
  abrir um relato fora do alcance declarando a finalidade. A regra está pronta;
  falta a tela que obriga a escrever o porquê.
- **Fila offline, a metade do APARELHO** — guardar as operações localmente sem
  sinal, enviar ao reconectar e limpar só o que o servidor aplicou. A metade do
  servidor já tem tela (Sincronização); esta é fase própria, do lado do PWA.

### Grupo 3 — não precisa de tela

Rotas de máquina: geração de doses e do dia, escalonamento de dose vencida,
marcação de atividade não confirmada, health check.

### O que o SERVIDOR ainda não faz, e o protótipo já mostra

Uma dívida honesta, anotada para não ser esquecida: a **pré-visualização e o
download em Word** de ATA, ocorrência, saúde e combinados são montados no
NAVEGADOR (`frontend/src/docx.ts`). Só o relatório tem rota de verdade
(`POST /reports/:id/preview` e `/export`). Para o sistema real, cada uma dessas
folhas precisa da rota equivalente no servidor, usando o `DocumentoService` que
já existe em `modules/reports` — provavelmente movido para o kernel, porque
partição não importa partição.

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

E duas armadilhas dos ensaios em Playwright, que custaram tempo:
`text-transform: uppercase` quebra `includes` sensível a maiúsculas (usar
`/…/i`), e roteiro preso a horário fixo falha em certas horas do dia — o que
não é defeito do sistema.

---

## 9. COMO COMEÇAR A CONVERSA NOVA

Anexe **este arquivo** e o **`rede-acolher-atualizado.zip`**, e escreva algo
como:

> Este é o Rede Acolher, o sistema de gestão do acolhimento da Fundação O Pão
> dos Pobres. O `RETOMAR-AQUI.md` tem tudo: o que é, onde está, as regras que
> não se negociam, o que já funciona, o que falta e as decisões que são minhas.
> Leia primeiro, confirme que rodou `npx tsc --noEmit` e a suíte, e então
> [o que você quer].

Se quiser mais profundidade em algum ponto, os outros documentos continuam
valendo:

| Documento | Para quê |
|---|---|
| `CONTINUIDADE.md` | a história longa, fase por fase, com o raciocínio de cada decisão |
| `o-que-falta.md` | o levantamento das rotas sem tela, atualizado |
| `der.md` | as 89 tabelas por partição, e o que cada uma guarda |
| `matriz-permissoes.md` | quem alcança o quê |
| `backlog.md` | o que foi pensado e ainda não construído |
| `piloto-casa-03.md` | o desenho do piloto |
| `roteiro-marcelo.md` | o roteiro de demonstração para o Marcelo |
| `formularios-reais.md` | os formulários de papel da casa que viraram tela |
| `pendencias-institucionais.md` | o que depende de decisão da instituição |
| `implantacao-smtp.md` | o e-mail institucional, só na implantação |
