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
```

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

- **Adicionar** medicamentos (Fase 4) ou ocorrências (Fase 5) = escrever um
  provedor. Nenhuma linha da timeline muda.
- **Remover** um módulo = seus eventos somem da tela; o resto continua.
- Um provedor com defeito **não derruba a tela**: seus eventos ficam de fora e a
  resposta traz `incompleta: true` com a fonte que falhou. Um plantão com linha
  do tempo incompleta e sinalizada é melhor do que uma tela em branco — ou, pior,
  uma que parece completa e não está.

**Verificado na prática:** removendo `modules/checks/` e sua linha em
`app.module.ts`, o sistema compila, sobe e responde
`fontes: ['activities'], incompleta: false`. A tela do educador segue viva.

## Como os módulos conversam sem se conhecer

| Precisa | Mecanismo | Exemplo |
|---|---|---|
| Aparecer na linha do tempo | registrar um `TimelineProvider` | `activities`, `checks`, `medications` |
| Pedir que alguém seja avisado | publicar `escalation.requested` (contrato do kernel) | dose vencida, atividade sem confirmação, evolução aguardando triagem |
| Avisar uma pessoa específica | publicar `notice.requested` | substituto designado |
| Aplicar operação offline própria | registrar handler no `SyncService` | `activities`, `checks`, `medications`, `nursing` |
| Ler dado de outro domínio | consulta no banco, sujeita ao RLS | `activities` lê a rotina vigente |
| Usar serviço de outro módulo | importar a **porta pública** e declarar em `depends` | todos usam `identity` |

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

Três vezes o teste mostrou que uma operação legítima não cabia em escrita comum
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

As políticas ficaram **mais** estritas depois de cada um deles, não menos.
