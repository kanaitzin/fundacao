# O que falta da ideia original

Levantamento de 31/08/2026, feito por leitura cruzada: as **183 rotas** que o
servidor serve contra as **93 chamadas** que as telas fazem. Sobram **69 rotas
que existem, têm regra, têm RLS e auditoria — e não têm porta**.

Isso não é lista de bugs. É o mapa do que já está construído por baixo e ainda
não tem por onde ser usado. Serve para decidir com o Marcelo o que entra antes
do piloto e o que espera.

O critério de leitura é sempre o mesmo: *a educadora de plantão, às 23h, com uma
criança chorando do lado, consegue fazer isso?* O que ela não consegue fazer sem
tela está no grupo 1.

---

## 1. Falta tela, e falta para o piloto

O trabalho existe na casa hoje. Sem tela, ou vira papel, ou vira WhatsApp — e
WhatsApp é proibido (§2).

| O que é | Rotas | Por que dói agora |
|---|---|---|
| **Desligamento e reacolhimento** | `POST /people/:id/discharge`, `/readmit` | Criança sai da casa e o sistema não sabe. Toda a contagem de ocupação, chamada e agenda continua contando alguém que não está lá. |
| **Corrigir o cadastro depois da admissão** | `PATCH /people/:id`, `PATCH /people/:id/judicial` | Hoje só dá para cadastrar. Nome errado, data de nascimento errada, decisão judicial que mudou — nada disso tem onde ser corrigido, e o certo é corrigir com histórico, não recadastrar. |
| **Anexar documento ao arquivo** | `POST /archive`, `GET /people/:id/documents/:docId` | A tela do Arquivo documental mostra a fila e o que já entrou; **não tem como colocar nada lá**. |
| **Abrir a chamada do turno** | `POST /checks` | A chamada só existe se alguém a criar. No protótipo elas vêm prontas; na casa, ninguém as cria. |
| **Comunicação externa da ocorrência** | `GET/POST /incidents/communications` + `submit`, `approve`, `delivery` | O caminho de comunicar Conselho Tutelar / MP / Judiciário existe inteiro no servidor, com aprovação e registro de entrega, e nunca aparece. Lembrando: envio automático é proibido (§2) — o que falta é a **tela de redigir, submeter e aprovar**, com pessoa decidindo em cada passo. |
| **Anexos e contenção na ocorrência** | `POST /incidents/:id/attachments`, `/protected`, `/restraint`, `attachments/:id/open` | Foto do machucado, registro de contenção física, marcação de conteúdo protegido. É exatamente o material sensível que hoje sai da casa por foto de celular. |
| **Aditamento e reabertura da ATA** | `PATCH /shifts/ata/:id`, `/reopen`, `/amend`, `GET /addenda` | ATA fechada com pendência não tem como receber o complemento. Regra §6: nada se apaga, tudo entra ao lado — o servidor já faz; a tela não oferece. |
| **Episódios da noite** | `POST /shifts/ata/:id/episodes`, `POST /shifts/episodes/:id/ack` | O que aconteceu de madrugada e o "estou ciente" do turno seguinte. |
| **Rotina da casa** | `GET /routine`, `/routine/history`, `POST /routine/versions`, `/versions/:id/items` | A rotina versionada — horário de acordar, refeições, dormir — que alimenta a geração do dia. Hoje o dia vem de dados semeados. |
| **Substituição de atividade** | `POST /activities/:id/substitution`, `/substitutions/:id/assign` | "Não vou conseguir levar o Bruno na fono" — pedir e assumir a substituição. Existe delegação direta; falta o pedido em aberto. |
| **Atividade urgente** | `POST /activities/urgent` | O que apareceu agora e não estava na agenda. |
| **Suspender prescrição** | `POST /medications/prescriptions/:id/suspend` | Médico suspendeu o remédio e a grade continua cobrando dose. |
| **Autorizar educador a administrar** | `POST /medications/authorize-educator`, `GET /medications/can-administer`, `GET/POST /medications/protocol` | Quem pode dar remédio, sob qual protocolo. Hoje a autorização existe no banco e não tem quem a conceda pela tela. |

## 2. Falta tela, mas dá para esperar

Coisas de coordenação e de gestão, não de plantão. Nenhuma delas trava a casa.

- **Benefícios do acolhido** — `POST /people/:id/benefits`, `/benefits/view`,
  `/benefits/export`. Mesma regra do cofre: reautenticação e registro por
  visualização.
- **Relatórios consolidados** — `GET /reports/panel`, `/reports/house-monthly`,
  `POST /reports/:id/submit`, `GET /reports/:id/delivery`, e as fontes do
  acompanhamento (`POST /followups/:id/sources`).
- **Capacidade da casa** — `POST /houses/:id/capacity`,
  `GET /houses/:id/capacity-history`.
- **Histórico e pendências de saúde** — `GET /nursing/history/:personId`,
  `GET /nursing/summary/:personId/issues`, `POST /nursing/summary/issues/:id/download`.
- **Painel da casa na linha do tempo** — `GET /timeline/house-panel`.
- **Leitura excepcional de relato** — `POST /statements/:id/exceptional-read`
  (§26.2 #29): abrir um relato fora do alcance, declarando a finalidade. A regra
  está pronta; falta a tela que obriga a escrever o porquê.
- **Dispositivos confiáveis** — `GET/POST /devices`, `POST /devices/:id/revoke`.
- **Fila offline** — `POST /sync/push`, `GET /sync/status`, `/sync/conflicts`,
  `POST /sync/conflicts/:id/resolve`. O PWA já instala; o modo offline de
  verdade é fase própria.

## 3. Não precisa de tela

São rotas de máquina: tarefa agendada, verificação interna, chamada de serviço.

`POST /medications/generate-doses`, `POST /medications/escalate-overdue`,
`GET /medications/alert-offsets`, `POST /activities/generate-day`,
`POST /activities/agenda/generate`, `POST /activities/mark-unconfirmed`,
`GET /activities`, `GET /health`, `POST /people` (a admissão usa
`/people/admission`), `GET /transfers/pending` (a tela usa `inbox`/`outbox`),
`GET /statements` (os relatos chegam junto com o detalhe da ocorrência),
`PATCH /shifts/general-ata/:id/house/:houseId`.

---

## Três decisões que não são minhas

Ficam para a conversa com o Marcelo. Nenhuma delas foi decidida por mim, e
nenhuma delas é problema de código:

1. **Devolver um acompanhamento para correção não existe no servidor.** A tela
   tinha um botão que prometia isso; foi removido em vez de inventar a regra. A
   pergunta é se a equipe técnica deve poder devolver, e o que acontece com a
   versão que já estava lá.
2. **A ATA Geral Noturna não se acha por data.** Só o Líder Noturno Geral chega
   nela, e sempre a de hoje. Quem precisa reler a de terça-feira passada — e
   por quê — decide a tela que falta.
3. **Rascunho de prescrição não tem listagem.** Dá para criar e assinar na
   sequência; se a enfermagem começar uma folha e sair da tela, não há rota que
   a traga de volta.
