# Partições: como acrescentar ou remover sem quebrar o resto

Este documento existe por uma exigência do projeto: **mexer numa parte do
sistema não pode estragar as outras.** Abaixo está como isso é garantido — e
como verificar que continua valendo.

## O mapa

```
backend/src/
  kernel/                  infraestrutura compartilhada (NÃO é domínio)
    contracts.ts           o vocabulário comum: AuthenticatedUser, TimelineEvent…
    database/              acesso ao banco com identidade aplicada (RLS)
    audit/                 auditoria append-only
    events/                barramento de eventos + registro da linha do tempo
    common/                CPF, criptografia, fuso da instituição
  modules/                 partições de domínio, uma pasta cada
    identity/  houses/  people/  routine/
    activities/  checks/  timeline/  notifications/  sync/
    medications/  nursing/
    statements/  shifts/  incidents/
    reports/  archive/
```

Dezesseis partições. A ordem acima é a das fases: cada bloco entrou sem alterar
o anterior. `reports` e `archive` entraram na fase 6 e o mapa tinha ficado para
trás — o documento dizia quatorze enquanto o código já tinha dezesseis.

Cada módulo tem sempre três coisas:

| Arquivo | Papel |
|---|---|
| `index.ts` | **porta pública** — o único caminho de entrada para outros módulos |
| `module.json` | manifesto: descrição, `depends`, tabelas, se é removível |
| `migrations/*.sql` | o esquema do módulo **mora dentro dele** |

## As quatro regras

1. **Um módulo importa do `kernel` ou da porta pública de outro** — nunca de um
   arquivo interno alheio.
2. **Só importa quem declarou** em `depends` no seu `module.json`.
3. **O `kernel` não importa módulo nenhum** (a base não depende do topo).
4. **Sem ciclos** entre módulos.

Nada disso é promessa: `test/arquitetura.spec.ts` lê os imports de todo arquivo
e falha o build se alguma regra for violada. Uma quinta verificação protege o
ponto mais sensível — a linha do tempo não pode importar módulo de domínio.

## Por que a linha do tempo não conhece ninguém

A linha do tempo é onde tudo se encontra, e por isso seria o pior lugar para
concentrar dependências: se ela importasse atividades, chamadas, medicamentos e
ocorrências, remover qualquer um quebraria a tela mais usada do plantão.

Em vez disso, cada módulo **se registra** no `TimelineRegistry` do kernel
entregando eventos num formato comum (`TimelineEvent`):

```ts
// modules/activities/activities.timeline.ts — único ponto de contato
export class ActivitiesTimelineProvider implements TimelineProvider, OnModuleInit {
  readonly source = 'activities';
  onModuleInit() { this.registry.register(this); }
  async fetch(q: TimelineQuery): Promise<TimelineEvent[]> { /* … */ }
}
```

Consequências práticas:

- **Adicionar** medicamentos (Fase 4), plantão e ocorrências (Fase 5) = escrever um
  provedor. Nenhuma linha da timeline mudou nas duas fases.
- **Remover** um módulo = seus eventos somem da tela; o resto continua.
- Um provedor com defeito **não derruba a tela**: seus eventos ficam de fora e a
  resposta traz `incompleta: true` com a fonte que falhou. Um plantão com linha
  do tempo incompleta e sinalizada é melhor do que uma tela em branco — ou, pior,
  uma que parece completa e não está.

**Verificado na prática, duas vezes.** Fase 3: removendo `modules/checks/` e sua
linha em `app.module.ts`, o sistema compila, sobe e responde
`fontes: ['activities'], incompleta: false`. Fase 5, com catorze módulos na
época:
removendo `modules/incidents/` — que tem provedor de linha do tempo, comandos de
sistema e depende de `statements` — o sistema compila, sobe e responde
`fontes: ['activities','checks','medications','shifts'], incompleta: false`.
A tela do educador segue viva nos dois casos.

Repare no detalhe que fez isso funcionar: `ata_episode.incident_id` **não é chave
estrangeira**. O episódio da ATA aponta para a ocorrência, mas não depende dela
para existir — do contrário, remover `incidents` levaria a ATA junto.

## Como os módulos conversam sem se conhecer

| Precisa | Mecanismo | Exemplo |
|---|---|---|
| Aparecer na linha do tempo | registrar um `TimelineProvider` | `activities`, `checks`, `medications`, `shifts`, `incidents` |
| Pedir que alguém seja avisado | publicar `escalation.requested` (contrato do kernel) | dose vencida, ATA fechada com pendência, ocorrência aberta |
| Avisar uma pessoa específica | publicar `notice.requested` | substituto designado |
| Aplicar operação offline própria | registrar handler no `SyncService` | `activities`, `checks`, `medications`, `nursing`, `shifts` |
| Ler dado de outro domínio | consulta no banco, sujeita ao RLS | `activities` lê a rotina vigente |
| Usar serviço de outro módulo | importar a **porta pública** e declarar em `depends` | `incidents` usa `statements` |

### Os níveis de escalonamento são dados, não código

Quem recebe cada nível de aviso mora na tabela `escalation_level`, publicada por
`notifications`. Isso mudou na Fase 5 por um motivo concreto: o Líder Noturno
Geral é função transversal, sem vínculo de casa, e não cabia no `CASE` que
existia dentro da função de destinatários. Editar aquele `CASE` a cada módulo
novo era o acoplamento que a arquitetura em partições existe para evitar.

Um nível desconhecido agora **falha** em vez de escalonar para ninguém — antes,
um erro de digitação viraria um aviso que nunca chegava, em silêncio.

O barramento nunca propaga erro de ouvinte: um módulo com defeito não derruba a
operação que publicou o evento.

## Remover um módulo

1. Apagar a linha do `import` e do array `imports` em `src/app.module.ts`.
2. Apagar a pasta `src/modules/<nome>/`.
3. Rodar `npm test` — o teste de fronteiras aponta qualquer resíduo.

As tabelas do módulo continuam no banco (nada é apagado — §3.3), simplesmente
deixam de ser usadas. Para removê-las de fato, escreva uma migração explícita:
o sistema nunca descarta dado por conta própria.

`identity` é a exceção: contém a fundação (instituição, casas, usuários,
auditoria) da qual todo o resto depende. Está marcado como não removível no
manifesto.

## Acrescentar um módulo

1. `src/modules/<nome>/` com `index.ts`, `module.json` e `migrations/`.
2. Declarar as dependências em `depends` (só `identity` na maioria dos casos).
3. Se aparece na linha do tempo, escrever um provedor e registrá-lo.
4. Se reage a outros, assinar eventos pelo nome.
5. Acrescentar a linha em `app.module.ts`.

O runner de migrações varre `src/modules/*/migrations/` e aplica na ordem do
prefixo numérico — global, porque dependências existem no banco (chaves
estrangeiras) mesmo quando não existem no código.

## Comandos de sistema: o padrão que preserva o isolamento

Repetidas vezes o teste mostrou que uma operação legítima não cabia em escrita comum
sob RLS. Em todas, a saída fácil seria afrouxar a política; a escolhida foi a
oposta — transformar a operação num **comando privilegiado** que valida a
autorização por dentro (§25 pede exatamente isso: comandos específicos, não
atualização genérica).

| Operação | Por que não cabia em escrita comum |
|---|---|
| `app_accept_transfer` | quem aceita é o **destino**, mas é preciso encerrar a permanência na **origem** — e o destino não tem escrita lá |
| `app_admit_person` | a visibilidade nasce da permanência; no instante do `INSERT` a pessoa ainda é invisível ao próprio autor |
| `app_emit_escalation` | o aviso vai para a caixa de **outra pessoa**; permitir isso genericamente abriria a caixa alheia |
| `app_confirm_dose` | verificar protocolo, gravar em nome de quem administrou e baixar estoque precisa ser atômico — e a verificação não pode ser pulável por nenhuma rota |
| `app_submit_evolution` | o educador **relata** o que acompanhou; escrever no histórico de saúde é ato da Enfermagem |
| `app_read_statement` | a leitura excepcional do Gestor Geral precisa **registrar a finalidade antes** de devolver o conteúdo — abrir a política tornaria a leitura invisível |
| `app_close_ata` | verificar o cargo contra o turno, contar as assinaturas que faltam e decidir entre "fechada" e "fechada com pendência" tem de ser um ato só; em vários `UPDATE`, uma rota nova pularia uma etapa |
| `app_reopen_ata` / `app_amend_ata` | o estado anterior precisa ser gravado **antes** de qualquer alteração |
| `app_close_general_night_ata` | o Líder Noturno assina a **sua** ATA e confirma a das casas; nenhuma passagem de educador é assinada no caminho |
| `app_close_incident_operational` | a categoria — não o parâmetro, não a tela — decide se o encerramento fecha ou devolve à revisão técnica |
| `app_open_attachment` | `storage_ref` não é legível pelo papel da aplicação (privilégio por coluna); só o comando lê, e registra a finalidade |

As políticas ficaram **mais** estritas depois de cada um deles, não menos.

## A regra do JOIN: RLS não filtra coluna, some com a linha

Este é o defeito mais perigoso já encontrado no projeto, porque **não dá erro**.

Quando uma consulta faz `JOIN` com uma tabela protegida por RLS e o usuário não
tem permissão sobre aquela linha específica, o banco não retorna a coluna vazia:
ele **elimina a linha inteira do resultado**. Sem exceção, sem log, sem sinal.

A causa de fundo é um descasamento entre duas regras que estão certas:

| O que | Fica visível por |
|---|---|
| Episódio de ATA, ocorrência, atividade, evolução, estoque, item de rotina | a **casa** — e continua visível para ela, inclusive depois de fechado |
| A pessoa | a **permanência ativa** — que muda na transferência e acaba na saída |

No instante em que a criança é transferida, o `JOIN person` deixa de encontrar
par. Uma auditoria do código inteiro achou **oito** lugares assim. Os piores:

- o **episódio de contenção sumia da ATA fechada** — registro imutável, tela vazia;
- a **ocorrência de violência perdia o nome de quem ela tratava**, justamente para
  a equipe técnica que precisa revisá-la para poder fechar;
- a **ATA Geral Noturna mostrava uma casa em vez de oito**, e os contadores da tela
  diziam "1 de 1 confirmada" — noite inteira em ordem, sete casas sequer lidas.

**A correção nunca é afrouxar a política.** É devolver o mínimo por função
própria, o mesmo padrão de `app_user_display_name`:

| Função | Devolve | No lugar de |
|---|---|---|
| `app_person_display_name(uuid)` | nome social ou civil | `JOIN person` |
| `app_person_age(uuid)` | idade em anos | `JOIN person` |
| `app_house_label(uuid)` | código da unidade | `JOIN house` |
| `app_house_name(uuid)` | nome da unidade | `JOIN house` |
| `app_night_ata_status(casa, dia)` | estado da ATA noturna | subconsulta em `ata` |

A guarda de cada uma é estreita: você só nomeia quem **algum dia** teve
permanência numa casa do seu escopo. Uma criança que nunca passou pela sua
unidade continua sem nome para você.

**A trava:** `test/arquitetura.spec.ts` varre todo `JOIN` com tabela protegida e
falha o build se não houver, nas linhas acima, um comentário `rls-join-ok:`
dizendo por que o par sempre existe. Não proíbe o JOIN — obriga alguém a ter
pensado. E `test/regressao-saida.e2e.spec.ts` transfere crianças de propósito
para verificar que o registro deixado para trás continua legível.

**Corolário, que vale além do JOIN:** lista vazia por falta de permissão **não é**
"não existe". Onde a política esvazia uma seção, a API diz isso em texto
(`avisoProtegido`, `avisoAnaliseTecnica`) em vez de deixar a tela sugerir que
nada aconteceu.

## Quando a proteção muda de lugar em vez de mudar de força

A Fase 5 trouxe um caso que vale registrar, porque a tentação era a de sempre.

A política de ocorrências escondia a categoria restrita do Líder Diurno. Só que
o §13.2 manda avisá-lo na abertura e o §13.5 lhe dá o encerramento da etapa
operacional: ele era notificado e recebia 404 ao abrir. Avisar alguém sobre algo
que ele não pode abrir não é proteção — é ruído, e ruído faz a equipe parar de
olhar para os avisos.

A saída não foi afrouxar. Foi separar o que estava junto: o líder passou a
enxergar a **ocorrência** (categoria, horário, fato objetivo, medidas), e o
conteúdo sensível continuou fora do alcance dele, porque mora em outra tabela
com outra política — `incident_protected` (fala espontânea, sinais observados) e
`statement` (narrativas). É exatamente a frase do §13.5: encerrar a etapa
operacional **sem navegar pelas narrativas restritas**.

Quando uma regra de proteção atrapalha o trabalho legítimo de alguém, quase
sempre o problema é que ela está no lugar errado — não que ela seja forte demais.
