# O que falta da ideia original

Levantamento de 31/08/2026, feito por leitura cruzada entre as rotas que o
servidor serve e as chamadas que as telas fazem. Sobram **40 rotas que existem,
têm regra, têm RLS e auditoria — e não têm porta**.

*Atualizado no mesmo dia: saíram desta lista o **Arquivo das ATAS** (decisão 2,
no fim); a **saída, o acervo e o retorno**, com `GET /people/archive` como a
porta que faltava; a **abertura da chamada do turno**; e o **corpo da ATA com a
reabertura e a correção** — que era o silêncio maior de todos: `content` nunca
recebia nada, e fechava-se todo dia uma ATA vazia.*

*Saíram também, em 01/09/2026, os **episódios do turno**: `POST
/shifts/ata/:id/episodes` e `POST /shifts/episodes/:id/ack` existiam desde a
fase 5 e nunca tiveram porta. O que acontecia de madrugada ou virava texto
solto dentro de uma seção da ATA, ou não era registrado. Agora o relato é
imutável e a ciência de quem assume o turno nasce ao lado, com nome próprio —
e o servidor passou a **recusar episódio em ATA já fechada**, que ele aceitava
em silêncio (ver a nota de defeito na CONTINUIDADE).*

*E a **rotina versionada da casa** (`GET /routine`, `/routine/history`, `POST
/routine/versions`, `/versions/:id/items`), no mesmo dia: quatro rotas da fase 2
sem tela nenhuma. O dia da casa nascia de dados semeados, e "a que horas é a
janta aqui?" não tinha resposta dentro do sistema — tinha no quadro da cozinha.
Alterar abre versão nova com motivo escrito e copia os itens; a anterior
continua inteira, explicando o dia que nasceu dela.*

*Em 01/09/2026 entrou também, a pedido do Marcelo depois de usar o protótipo, a
**conferência de mesa** (§10): a educadora olha a mesa no almoço, vê que estão
todos comendo, e precisava de vinte toques para dizer isso. O ato agora é um só
e fica gravado COMO ato — quem, quando e quantos —, o que o separa da "marcação
em lote silenciosa" que a regra proíbe. E a lista de quem já foi conferido
recolhe, com contador, para a tela encolher enquanto a pessoa trabalha.*

*E o **dossiê do acolhido** com o **álbum de vivências**, em 01/09/2026, a
pedido do Marcelo: a lista exigida da casa em cinco categorias, o anexo com
prévia antes de enviar, o aceite de quem olhou — separado do anexo —, e o álbum
de aniversários, festas e conquistas que a criança leva quando sai.*

*E, ainda em 01/09/2026, a **substituição de atividade** e a **atividade
urgente**: cinco rotas da fase 3 sem tela. "Não vou conseguir levar o Bruno na
fono" era conversa de corredor ou grupo de mensagens. O pedido agora nasce de
quem VAI SAIR — qualquer pessoa do turno —, fica em aberto até o líder, a
técnica ou a coordenação decidir, e recusar exige motivo, que o sistema entrega
a quem pediu.*

*E uma correção ao próprio levantamento: eu havia escrito que faltava "anexar
documento ao arquivo". `POST /archive` não recebe arquivo — ele enfileira a
CÓPIA DOCUMENTAL de algo que já existe no sistema. O que faltava era pior e
mais silencioso: **nada enfileirava**. A fila do arquivo estava permanentemente
vazia, a reconciliação respondia "nada pendente" e o protótipo avisava, ao
fechar a ATA, que a cópia tinha entrado na fila. Não tinha. O laço foi fechado —
ver §8.9 da CONTINUIDADE.*

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
| **Corrigir o cadastro depois da admissão** | `PATCH /people/:id`, `PATCH /people/:id/judicial` | Hoje só dá para cadastrar. Nome errado, data de nascimento errada, decisão judicial que mudou — nada disso tem onde ser corrigido, e o certo é corrigir com histórico, não recadastrar. |
| **Marcação de conteúdo protegido** | `POST /incidents/:id/protected` | Fala espontânea e sinais observados. O detalhe da ocorrência já MOSTRA quando existem; registrar ainda não tem porta. |
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
`GET /people/:id/admission` (a ficha da admissão entra no perfil),
`PATCH /shifts/general-ata/:id/house/:houseId`.

---

## Três decisões que não são minhas

Ficam para a conversa com o Marcelo. Nenhuma delas foi decidida por mim, e
nenhuma delas é problema de código:

1. **Devolver um acompanhamento para correção não existe no servidor.** A tela
   tinha um botão que prometia isso; foi removido em vez de inventar a regra. A
   pergunta é se a equipe técnica deve poder devolver, e o que acontece com a
   versão que já estava lá.
2. ~~**A ATA Geral Noturna não se acha por data.**~~ **Resolvido em 31/08/2026**
   pelo Arquivo das ATAS: a coordenação, a equipe técnica e os dois líderes
   consultam qualquer data e recebem, da ATA Geral Noturna, **a linha daquela
   casa** — o que o Líder Noturno Geral registrou sobre ela. A folha completa
   das oito casas continua com quem a escreve e com o Gestor Geral.
   *Fica uma pergunta menor para o Marcelo: o mesmo recorte deve valer para a
   ATA Geral do DIA CORRENTE, que hoje a coordenação abre inteira? Não mudei
   sozinho o que já estava aprovado.*
3. **Rascunho de prescrição não tem listagem.** Dá para criar e assinar na
   sequência; se a enfermagem começar uma folha e sair da tela, não há rota que
   a traga de volta.
