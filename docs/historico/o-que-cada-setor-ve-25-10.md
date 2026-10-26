# O que cada setor vê (fase 246, 25 e 26/10/2026)

Pedido de 25/10: *"confira que cada setor enxergue apenas as suas funções, diminuindo
as opções em tela"*.

## Como foi medido

O `frontend/ensaio-o-que-cada-setor-ve.mjs`, chamado pela simulação da casa com
`SIM_SETORES=1`, entra com uma conta de cada cargo **contra o servidor de verdade**,
numa Casa 03 simulada por trinta dias. Abre cada tela da barra do turno e da coluna,
cada aba de dentro, e aperta cada botão. Se o botão abre uma folha, preenche com texto
fictício e aperta o botão de gravar dela. Anota o que o servidor respondeu às escritas.
Os botões que mexem na conta de outra pessoa (senha, convite, desativar) entram no
inventário sem serem apertados: a primeira rodada redefiniu a senha da educadora pela
Equipe, e as contas que vinham depois não entravam mais.

A medição foi feita em quatro lotes (`ENSAIO_CARGOS`, `SIM_SETORES_SAIDA`), do cargo com
menos alcance para o com mais, porque o contêiner da sessão foi reiniciado no meio da
primeira rodada inteira.

| Cargo | Telas | Botões | Gravam | Abrem folha | Só mostram |
|---|---|---|---|---|---|
| Portaria | 1 | 22 | 21 | 1 | 0 |
| Cozinha | 2 | 6 | 2 | 2 | 2 |
| Educador | 12 | 47 | 18 | 9 | 19 |
| Líder Noturno | 12 | 58 | 16 | 4 | 38 |
| Enfermagem | 6 | 17 | 5 | 0 | 10 |
| Líder Diurno | 16 | 96 | 26 | 14 | 51 |
| Equipe técnica | 23 | 239 | 145 | 22 | 64 |
| Coordenação | 29 | 264 | 36 | 20 | 47 |
| Gestor Geral | 25 | 135 | 51 | 15 | 63 |

As telas contadas são as que tiveram ao menos um botão medido. O restante dos botões
de cada linha pediu outro dado ao servidor (o texto fictício não bastava) ou não foi
apertado por mexer em conta de alguém.

## O que a tela mostrava e o servidor recusava (consertado, sem decisão)

- **Registrar ocorrência**, para o Gestor Geral (a política `incident_insert` aceita só
  a equipe da casa). Hoje o cartão só aparece para quem registra (`ABRE_OCORRENCIA`).
- **Registrar que foi dado**, no remédio *se necessário* do Dia, para a equipe técnica e
  a coordenação (quem dá remédio é a Enfermagem, o educador e o Líder Diurno,
  `app_can_administer`). Hoje quem não dá lê quem registra (`DA_REMEDIO`).
- De passagem, na fase 245: *Suspender este esquema*, que a Saúde mostrava à coordenação
  e à técnica.

Depois dos consertos, nenhum cargo ficou com botão que a tela mostra e o servidor
recusa.

## O que a Fundação decidiu (25/10)

- **O Gestor Geral passa a ler a casa, sem registrar** na ATA (episódio, linha, fechar,
  ciência, passagem), no Dia (atividade urgente e as ações de cada atividade), na
  internação, na Cozinha (pedidos), nos combinados (reunião, combinado, pauta, regra da
  casa), na rotina e na escala. Ele continua escrevendo e revogando a **regra que vale
  para as oito casas**, que só ele escreve, e continua baixando os papéis. A trava está
  na porta de cada rota (`@OGestorSoLe()`, `kernel/common/o-gestor-so-le.guard.ts`), no
  serviço da regra, na tela e no protótipo; o `o-gestor-so-le.spec.ts` cobra a marca em
  toda rota de escrita dessas partes, negando por padrão.
- **A equipe técnica e a coordenação ficam como estão.** Foram propostas e recusadas: a
  técnica sem o Painel das unidades e a fila do arquivo, sem as contas da equipe e sem o
  armário; a coordenação sem a Sincronização, o Arquivo documental e a página dos setores.
- **Os Combinados da equipe moram numa tela só.** A aba *Alinhamentos* dentro dos
  Acompanhamentos, que abria a mesma coisa, saiu.

## O que a medição não mede

O perfil da criança e o que só aparece com um registro aberto (o detalhe de uma
ocorrência, de uma internação) não foram percorridos botão por botão: o ensaio aperta o
cartão e não entra nele. O `ensaio:acolhe` passa por esses lugares pela Acolhe+AI, e o
`ensaio:uso` pelos percursos.
