# Noventa dias de uma casa — o relatório da fase 173

Pedido de 28/09/2026: simular o uso do sistema como uma casa real, por noventa
dias, desde o dia em que a coordenação recebe o acesso; testar todos os setores,
os anexos, os downloads e as alterações; conferir os relatórios; ver se ficou
tudo humano; e revisar os pedidos e as fases para ter certeza de que nada ficou
pelo caminho antes de ambicionar entregar o projeto para teste.

## Como foi feito

`bash scripts/simulacao-da-casa.sh 90` recria o banco com a semente fictícia e
roda `backend/scripts/simulacao-da-casa.ts`. O banco e o servidor leem a data de
um arquivo que a simulação reescreve antes de cada ato (`faketime`): cada coisa
acontece no dia e na hora em que aconteceria na casa, e o `app_hoje()` do banco
anda junto com o `new Date()` do servidor. O relógio do dia
(`RelogioService.rodarODia`) roda às 05h, como o cron da implantação.

Tudo passa pelas **rotas de verdade**, com o cargo de quem faria cada coisa. A
simulação não afirma: ela anota. Toda recusa inesperada, toda frase fora do
português e todo relatório que não bate com o que ela contou vira achado.

No fim, o mesmo script sobe o servidor e o Vite no último dia simulado e roda
`frontend/ensaio-servidor.mjs`: o navegador entra com as contas da casa e abre
todas as telas **contra o servidor e o banco de verdade**. Os outros ensaios
abrem o protótipo, que tem um servidor de mentira dentro. Por isso não viam o
que este viu.

## A casa

A **ARM1**, vazia na semente, de 16/11/2026 a 13/02/2027. A data foi escolhida
para atravessar a virada do ano.

- **O nascimento:** o gestor cria a coordenação e manda o convite. O convite
  chega à caixa de e-mail, é conferido e vira senha, e não serve de novo. A
  coordenação monta a equipe com convite: técnica, líder diurno, quatro
  educadores, portaria e cozinha. Depois define o horário dos turnos (07h às
  19h) e a rotina da casa.
- **As crianças:** cinco no primeiro dia pela técnica. Cada uma entra com foto,
  certidão anexada, aceita e baixada de volta, e avó cadastrada com foto 3×4 e
  visita autorizada no fim de semana. Uma criança tem restrição alimentar e
  outra tem alergia grave.
- **O armário:** prescrições assinadas pela Enfermagem, a nota da farmácia com
  a imagem, entradas no armário com lote e validade, e mais duas compras no
  período.
- **A escala:** o primeiro mês é lançado à mão, em 12x36 de dia e de noite, com
  o líder de segunda a sexta. Os meses seguintes são repetidos pelo rascunho e
  publicados.
- **Todo dia:** o relógio das 05h e as doses das 06h, 08h e 20h. A troca de
  turno às 07h e às 19h, com passagem, recebimento e fechamento da ATA. A
  chamada das três refeições, confirmada. As atividades da rotina e as linhas
  na ATA.
- **O que acontece no período:**
  - uma criança chega de noite;
  - uma ocorrência com relato de quem viu e síntese da técnica (duas no
    período);
  - uma internação com o diário do hospital, PDFs e a troca de acompanhante;
  - o lanche do passeio para todos;
  - o fim de semana com a avó, com a cesta básica;
  - uma visita fora do combinado: a portaria recusa e a coordenação abre a
    exceção;
  - as visitas de todo fim de semana, com entrada e saída;
  - a transferência para a AI4;
  - o desligamento por reintegração e o reacolhimento;
  - a saída de um educador e a entrada de outra na virada do ano;
  - os acompanhamentos do mês, redigidos, enviados e aprovados.

## O que foi conferido no fim

Contra o que a simulação contou, pelos relatórios que a casa baixa:

| Conferido | Resultado |
|---|---|
| Visitas de cada criança, no perfil dela | as cinco batem, com 2 h 10 min por visita e a exceção de 30 min |
| Refeições registradas no período | 1340 = 1340, no relatório da casa e no do período |
| Doses dadas no horário | 235 = 235 |
| Saldo do armário, por remédio | bate, inclusive o negativo de −7 da fluoxetina, que a casa comprou de menos |
| Chamadas confirmadas | 270 = 270 |
| Plantões | 180 = 180, e nenhuma ATA esquecida aberta depois de dois dias |
| Diário da internação no relatório em Word | 3 registros = 3, com as páginas dos PDFs |
| Acolhidos na casa no último dia | 5 = 5 |
| Avisos de dose atrasada | um por dose e por nível |
| Acompanhamentos | 30 aprovados, nenhum parado |
| Avisos sem ler depois de 90 dias | coordenação e técnica com 14 cada, nenhuma pessoa soterrada |

Os documentos baixados foram 16: as visitas de cada criança, três ATAs, a
internação, o período, a escala, a portaria, o armário, as compras, as
restrições e as cestas. Todos foram lidos com a mesma régua do
`a-voz-dos-documentos.spec.ts`: sem travessão, sem maiúscula de ênfase, sem
aspas, sem falar do sistema, e sem `undefined`, `NaN` ou `Invalid Date`.

## O que ela achou, e que compilava e passava

1. **O relatório do período e o das compras imprimiam "Invalid Date" em toda
   linha**, na tela e no papel. A coluna `date` voltava do `pg` como `Date`, e o
   código fazia `String(v).slice(0, 10)`. Agora a data de calendário volta como
   texto `AAAA-MM-DD`. A suíte inteira passou sem mudança.
2. **A tela dos Acompanhamentos nunca funcionou no sistema de verdade.**
   - O botão Gerar pendências mandava o corpo sem a casa.
   - A lista era pedida sem a casa e recebia 400.
   - A resposta não tinha a forma que a tela lê.

   O protótipo aceitava tudo, e por isso nenhum ensaio viu. E a guarda do banco
   deixava passar **casa nula**: `app_house_in_scope(NULL)` devolvia NULL, e
   `IF NOT NULL` não entra. Setenta e seis funções usam essa guarda. Agora
   casa e pessoa nulas respondem NÃO (1629).
3. **A dose de quem está com a família era cobrada como sem resposta** em
   quatro lugares que a grade não cobre (1630 a 1632):
   - o aviso de dose atrasada, com as mesmas três doses todo dia por setenta
     dias;
   - a passagem;
   - o painel da Enfermagem;
   - o relatório do período.
4. **A tela da Cozinha abria com erro vermelho** para o educador e os líderes,
   que imprimem a folha das restrições e não podiam ler a lista.
5. **Recusas em inglês** escritas pelo próprio Nest ("The value passed as UUID
   is not a string"). Agora saem em português.
6. **O relatório de visitas sem o ano** dizia 30/01 e 22/11 lado a lado.

## As quatro decisões de 28/09

- **A ATA diurna do fim de semana** ficava aberta para sempre: foram 25 em
  noventa dias. Agora o Líder Diurno de segunda as vê no alto da ATA e as fecha.
- **A dose atrasada é avisada uma vez.** Antes, 319 doses esquecidas na AI3
  geraram 32 mil linhas de aviso em noventa dias. Com a regra nova, a ARM1
  inteira teve 707.
- **As visitas no perfil começam no acolhimento**, não em 1º de janeiro.
- **A criança que chega de noite** entra pelo plantão com nome, idade
  aproximada e quem trouxe. A técnica é avisada e completa de manhã.

## O que NÃO foi testado pela simulação

Dito para não virar promessa. Tudo isso tem suíte própria, mas não viveu os
noventa dias:

- a fila sem sinal subindo contra o servidor real;
- o cofre e os benefícios;
- as memórias com foto;
- o trabalho social;
- os alinhamentos e o estatuto;
- a agenda de compromissos;
- os marcos e a trajetória em Word;
- as fontes do acompanhamento;
- a ATA Geral noturna assinada pelo Líder Noturno Geral;
- a contenção;
- as comunicações de ocorrência;
- os aparelhos institucionais;
- a fila do arquivo;
- a troca de senha e o reset;
- a mudança de capacidade;
- **várias casas ativas ao mesmo tempo**: só a ARM1 viveu, e a AI3 da semente
  ficou parada.

O aniversário do Enzo, em 31/12, passou pelo relógio, mas o aviso não foi
conferido.

## A revisão dos pedidos: o que ainda está aberto

Nada do que foi pedido e decidido ficou sem código. O que está aberto depende
de alguém:

- **§10, decisões que são do Marcelo:**
  - 1: devolver acompanhamento para correção;
  - 2: a ATA Geral do dia corrente;
  - 3: "concluí tudo até agora";
  - 4: o Arquivo das ATAs abre no mês de calendário e fica quase vazio no dia
    1º, o mesmo defeito que a simulação achou nas visitas;
  - 5: a grade da parede;
  - 8: "administrado com atraso";
  - 9: o aviso do PIA;
  - 11: a Enfermagem vendo a internação, a confirmar.
- **O diário da internação com os campos do §12 um a um.** Depende da Fundação
  dizer quais campos e quais são obrigatórios.
- **Aplicar o roteiro com a equipe da Casa 03**, que continua sendo o que mais
  muda o sistema.

## Para ambicionar o teste com gente

A simulação e o ensaio contra o servidor passaram limpos na última rodada, com
tudo o que eles cobrem. O que eu recomendo antes de abrir para uma casa de
verdade:

1. **Levar a simulação a várias casas ao mesmo tempo**, com a AI3 e a ARM1
   vivendo juntas, para medir o que é da instituição (a ATA Geral, o painel do
   gestor, o relógio de oito casas) com volume de verdade.
2. **Rodar a simulação e o ensaio contra o servidor a cada fase**, como se roda
   a suíte. Foi o ensaio contra o servidor que achou a tela que nunca funcionou.
3. **Responder as decisões abertas do §10**, sobretudo a 4, que é o mesmo
   defeito do 1º de janeiro que a simulação achou e a Fundação já decidiu para
   as visitas.
