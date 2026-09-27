# Relatório final da auditoria do pedido de 25/09/2026

Fases 157 a 166, de 25 a 27/09/2026. Rede Acolher, Fundação O Pão dos Pobres.

Este relatório responde às seções 42 e 43 do pedido de auditoria total de
25/09. Ele registra o que foi encontrado, como foi reproduzido, o que foi
corrigido e qual teste passou a guardar cada correção. As decisões que cabem à
Fundação estão no §10 do `docs/REDE-ACOLHER.md`.

## Como foi verificado

- **Suíte automatizada:** 115 suítes, rodadas por inteiro em duas condições de
  relógio: a hora real e depois das 21h de Porto Alegre, quando a data em UTC
  já virou e a da instituição não. O número de testes está no §2 do documento.
- **Simulação de um ciclo completo** (`um-ciclo-completo-da-casa.e2e.spec.ts`):
  dois dias e o dia de hoje na Casa 03, pelas rotas de verdade, com o cargo de
  quem faz cada ato. Plantões diurno e noturno, ATA, almoço com dieta adaptada,
  internação com acompanhantes trocados e alta, dose das 06:00 descontando do
  armário, nota fiscal, visita pela portaria, lanche para todos, cesta,
  observação restrita pedida e liberada. No fim, cada relatório é conferido
  contra os fatos: as duas ATAs, a internação, as visitas, as refeições, o
  armário e as notas.
- **Ensaios de navegador:** as telas por cargo, a fila offline, as folhas, o
  roteiro da Casa 03, o uso completo (em largura de celular, com toque) e a
  acessibilidade nos três temas (432 telas, WCAG 2.1 AA).
- **Medida nos dois sentidos:** cada correção de segurança foi desfeita no
  arquivo da migração e o teste reprovou; refeita, passou.

## Achados

### Crítico

**1. Não havia como cadastrar alergia, condição de saúde nem restrição alimentar.**
- Impacto: as tabelas eram lidas pelo perfil, pela chamada do almoço, pela
  folha da cozinha e pelo resumo de saúde que vai ao hospital, e só a semente
  de dados as escrevia. Uma alergia descoberta na casa não tinha onde entrar.
- Onde: `health_condition` e `food_restriction` (people/0020), sem serviço de
  escrita.
- Como reproduziu: a simulação do ciclo pediu uma criança com restrição
  alimentar e não encontrou rota.
- Correção: registrar e encerrar com motivo, sem apagar, com auditoria; tela
  no perfil para Enfermagem, técnica e coordenação.
- Arquivos: `people/saude-do-perfil.service.ts`, `people.controller.ts`,
  `people/migrations/1623_alergia_e_restricao_tem_porta.sql`,
  `frontend/src/screens/Acolhidos.tsx`, `frontend/src/mock.ts`.
- Teste: `a-alergia-e-a-restricao-tem-porta.e2e.spec.ts`; percurso no
  `ensaio:uso`.
- Resultado: passa.

**2. A escrita de alergia e restrição conferia o cargo, e não a casa da criança.**
- Impacto: aberta a porta, a coordenação de uma casa gravaria alergia em
  criança de outra.
- Onde: políticas `hc_insert` e `fr_insert`.
- Como reproduziu: inserção direta com a identidade da coordenação da Casa 04.
  Pela rota a recusa vinha por coincidência (o retorno da linha exige poder
  lê-la), por isso o teste exercita a política sem esse atalho.
- Correção: as políticas conferem `app_person_in_scope`.
- Teste: o mesmo arquivo. Medido nos dois sentidos.
- Resultado: passa.

**3. O armário aceitava movimento de outra casa.**
- Impacto: `mov_insert` e `stock_update` eram `WITH CHECK (true)`; uma
  consulta direta escrevia no armário de outra casa.
- Correção: as duas políticas conferem a casa (fase 161).
- Teste: `o-armario-diz-a-verdade.e2e.spec.ts`. Medido nos dois sentidos.
- Resultado: passa.

### Alto

**4. A ATA exportada em Word não trazia as linhas escritas pela equipe.**
- Impacto: o papel da ATA levava os tópicos e as intercorrências, e deixava de
  fora o que cada profissional escreveu no turno, com nome e hora. Os adendos
  também não saíam.
- Onde: `shifts/ata-folha.ts`.
- Como reproduziu: a simulação escreveu na ATA diurna e na noturna, gerou as
  duas folhas e não encontrou as linhas.
- Correção: seção de registros da equipe em ordem de horário, com nome e cargo
  da época; observação restrita entra só como contagem; seção de correções e
  complementos posteriores.
- Teste: `um-ciclo-completo-da-casa.e2e.spec.ts`.
- Resultado: passa.

**5. A dose dada com o armário em zero não aparecia no saldo.**
- Impacto: o saldo ficava em zero e o consumo era gravado; as duas contas
  discordavam sem aviso.
- Correção: saldo negativo com aviso de conferir o armário; a dose nunca é
  bloqueada (decisão de 26/09).
- Teste: `o-armario-diz-a-verdade.e2e.spec.ts`.
- Resultado: passa.

**6. 24 leituras respondiam vazio a quem é de outra casa.**
- Impacto: nada vazava, mas o vazio dizia coisas falsas; o dossiê listava cada
  documento como faltando.
- Correção: guarda `RegistroNoAlcance` em 39 leituras (fase 158).
- Teste: `o-alcance-de-quem-le.e2e.spec.ts`.
- Resultado: passa.

**7. O relatório do período perdia o último dia.**
- Impacto: `reference_at BETWEEN` datas tratava a data final como meia-noite
  do começo do dia.
- Correção: o instante vira data no fuso da instituição antes da comparação
  (fase 162).
- Teste: `a-cozinha-recebe-a-lista.e2e.spec.ts`.
- Resultado: passa.

### Médio

**8. O Word do servidor não seguia o padrão aprovado.**
- Impacto: saía em Calibri 11 com margens de 1,9 cm, diferente do protótipo
  aprovado e do pedido (A4, Arial 12, margens de 3 e 2 cm, entrelinha 1,5).
- Correção: `kernel/documentos/documentos.service.ts` (fase 165).
- Teste: `o-relatorio-da-internacao.e2e.spec.ts`; conferência do arquivo gerado.
- Resultado: passa.

**9. A regra antiga do turno (7h–19h) estava escrita à mão em oito lugares.**
- Correção: regra única em `app_turno_de` e `app_janela_do_turno`, com o
  horário de cada casa (fases 157 e 159).
- Teste: `a-ata-das-oito-as-oito.e2e.spec.ts`,
  `o-horario-de-cada-casa.e2e.spec.ts`; a simulação confere 20:00, 20:01,
  06:00, 07:59 e 08:00.
- Resultado: passa.

**10. A folha da escala imprimia 08:00 e 20:00 fixos.**
- Impacto: a casa que mudou o horário via o horário errado na parede.
- Correção: a folha pergunta o horário da casa no período (fase 164).
- Teste: `escala.e2e.spec.ts`.
- Resultado: passa.

**11. O ensaio de acessibilidade media só o tema claro.**
- Correção: mede os três temas (fase 163).
- Teste: `ensaio:acessibilidade`, 432 telas.
- Resultado: nenhuma violação.

**12. A portaria entrava sem casa.**
- Impacto: `/users/me` e `/houses` voltavam vazios para ela.
- Correção: people/1593 (fase 160).
- Teste: `a-visita-entra-e-sai.e2e.spec.ts`.
- Resultado: passa.

### Baixo

**13. Dois anexos registrados no mesmo segundo saíam em ordem trocada no relatório.**
- Correção: comparação pelo instante numérico (`internacao.service.ts`).
- Teste: `o-relatorio-da-internacao.e2e.spec.ts`, três rodadas seguidas.
- Resultado: passa.

**14. O relatório de visitas imprimia o aviso da tela como ressalva.**
- Correção e teste: `a-voz-dos-documentos.spec.ts` (fase 164).
- Resultado: passa.

**15. No protótipo, o colírio das 07:30 era dose da noite desde a regra de 25/09.**
- Impacto: de madrugada o plantão diurno aberto ficava sem dose, e o ensaio da
  passagem reprovava só nesse horário.
- Correção: dose às 08:30 (`frontend/src/mock.ts`).
- Teste: `ensaio:uso` rodado de madrugada.
- Resultado: passa.

### Melhoria

- Relatório da internação em um Word só, com capa e as páginas dos PDFs do
  hospital como imagem (fase 165).
- Escolha de anexo por câmera, galeria, arquivo e câmera do computador, com
  prévia; categoria do documento; anexo cortado e anexo repetido recusados
  (fase 165).
- Escala do mês seguinte como rascunho a partir do mês anterior (fase 165).
- Cargo da época nos registros antigos (fase 165).
- Três temas, a portaria em cartões com foto 3×4 (fase 163).
- Documentos na voz da equipe de acolhimento, com teste que cobra (fase 164).

## Matriz de funcionalidades

| Funcionalidade | Situação anterior | Problema encontrado | Correção | Teste executado | Resultado | Perfil autorizado | Banco / API | Status final |
|---|---|---|---|---|---|---|---|---|
| ATA diurna e noturna pela regra de 25/09 | hipótese 7h–19h | regra em oito lugares | regra única, por casa | `a-ata-das-oito-as-oito`, simulação | passa | equipe da casa | `app_turno_de`, `/shifts` | CORRIGIDO E FUNCIONANDO |
| ATA em Word | sem as linhas da equipe | linhas e adendos ausentes | seções novas | simulação | passa | quem lê a ATA | `ata-folha.ts`, `/shifts/:id/export` | CORRIGIDO E FUNCIONANDO |
| Observação restrita e pedido de leitura | existia | nenhum | nenhuma | `o-pedido-de-leitura-da-ata`, simulação | passa | técnica decide | `ata_read_request` | FUNCIONANDO |
| Horário dos turnos por casa | fixo | pedido novo | `house_shift_hours` | `o-horario-de-cada-casa` | passa | coordenação, líder, técnica | `/houses/:id/turnos` | FUNCIONANDO |
| Chamada e refeições | existia | último dia fora do período | comparação por data | `a-cozinha-recebe-a-lista`, simulação | passa | equipe da casa | `/checks`, `/reports/period/meals` | CORRIGIDO E FUNCIONANDO |
| Alergia, condição e restrição alimentar | sem porta de escrita | não havia como cadastrar; política sem casa | rotas, tela, política | `a-alergia-e-a-restricao-tem-porta` | passa | Enfermagem, técnica, coordenação | `/people/:id/health-conditions`, `/people/:id/food-restrictions` | CORRIGIDO E FUNCIONANDO |
| Pedido de lanche e cesta | existia | "Selecionar todos" | um pedido por criança, tudo ou nada | `a-cozinha-recebe-a-lista`, simulação | passa | equipe da casa | `/people/kitchen-requests` | FUNCIONANDO |
| Internação: rotina e diário | existia | acompanhante de outra casa (156) | alcance conferido | `internacao`, simulação | passa | técnica, coordenação, líder, Enfermagem, acompanhante | `/nursing/hospitalizations` | FUNCIONANDO |
| Diário da internação com campos estruturados (alimentação, sono, exames…) | texto livre por tipo | os campos do §12 não existem um a um | nenhuma | nenhum | não se aplica | | `hospitalization_note` | PRECISA DE DESENVOLVIMENTO ADICIONAL |
| Câmera, galeria e anexos | só arquivo | faltava câmera e galeria | `EscolherAnexo` | `ensaio:uso`, `o-relatorio-da-internacao` | passa | quem registra | `/nursing/hospitalizations/:id/notes` | CORRIGIDO E FUNCIONANDO |
| Relatório da internação em Word | não existia | pedido novo | `internacao-folha.ts` | `o-relatorio-da-internacao`, simulação | passa | técnica, coordenação, líderes, gestão | `/nursing/hospitalizations/:id/export` | FUNCIONANDO |
| Portaria e visitas | papel | portaria sem casa | 1593 | `a-visita-entra-e-sai`, simulação | passa | portaria, equipe | `/people/portaria/visitas` | CORRIGIDO E FUNCIONANDO |
| Foto 3×4 do visitante | câmera só | faltava galeria | `EscolherAnexo` | `ensaio:uso` | passa | técnica, coordenação | `/people/contacts/:id/photo` | CORRIGIDO E FUNCIONANDO |
| Métricas de visitas | existia | nenhum | nenhuma | `a-visita-entra-e-sai`, simulação | passa | equipe da casa | `/people/:id/visitas` | FUNCIONANDO |
| Funcionários e cargo da época | cargo atual em tudo | registro antigo com cargo novo | `app_user_role_period` | `o-cargo-da-epoca`, `equipe` | passa | coordenação, gestão | `/staff` | CORRIGIDO E FUNCIONANDO |
| Escala e repetir o mês anterior | sem cópia | pedido novo | rascunho do mês | `escala-o-rascunho-do-mes`, `ensaio:uso` | passa | coordenação, técnica, líder | `/escala/rascunho` | FUNCIONANDO |
| Estoque de medicamentos | saldo calado em zero | negativo calado; política sem casa | saldo negativo com aviso; política | `o-armario-diz-a-verdade`, simulação | passa | Enfermagem, técnica, coordenação | `/medications/stock` | CORRIGIDO E FUNCIONANDO |
| Notas fiscais | sem itens nem CNPJ | nota repetida | CNPJ, itens, recusa | `o-armario-diz-a-verdade`, simulação | passa | Enfermagem, técnica, coordenação | `/medications/purchases` | FUNCIONANDO |
| Métricas e relatórios de medicamentos | existia | nenhum | nenhuma | `o-armario-diz-a-verdade`, simulação | passa | Enfermagem, técnica, coordenação | `/medications/metrics` | FUNCIONANDO |
| Horários completos e protocolo da Enfermagem | hipótese | decisão institucional pendente | configurável | | | | | BLOQUEADO POR DECISÃO INSTITUCIONAL |
| Transferência, saída e retorno | existia | nenhum nesta rodada | nenhuma | `saida-e-retorno`, `regressao-saida` | passa | técnica, coordenação | `/transfers` | FUNCIONANDO |
| Ocorrências | existia | nenhum nesta rodada | nenhuma | `desmarcar-ocorrencia`, `registro-protegido` | passa | equipe | `/incidents` | FUNCIONANDO |
| Permissões entre casas | medido em 156 e 158 | tomada de conta, leituras vazias | fases 156 e 158 | `o-alcance-de-quem-administra`, `o-alcance-de-quem-le` | passa | | RLS | CORRIGIDO E FUNCIONANDO |
| Arquivos: tipo real, cortado, repetido | tipo real já conferido | cortado e repetido entravam | `conferirInteireza`, soma | `o-relatorio-da-internacao` | passa | | `ArquivosService` | CORRIGIDO E FUNCIONANDO |
| Offline e sincronização | existia | nenhum nesta rodada | nenhuma | `a-escrita-que-nao-cai`, `ensaio:fila` | passa | | `/sync` | FUNCIONANDO |
| Celular e computador | existia | câmera e galeria | `EscolherAnexo` | `ensaio`, `ensaio:uso` | passa | | | FUNCIONANDO |
| Acessibilidade | só tema claro medido | escuro nunca medido | três temas | `ensaio:acessibilidade` | 432 telas sem violação | | | CORRIGIDO E FUNCIONANDO |
| Auditoria | existia | linhas sem casa (149) | casa em toda linha | `auditoria-tem-casa`, `vocabulario-da-auditoria` | passa | | `audit_event` | FUNCIONANDO |
| Documentos em Word | voz de sistema; padrão diferente | travessão, ênfase, formato | voz da equipe; ABNT | `a-voz-dos-documentos` | passa | | `DocumentosService` | CORRIGIDO E FUNCIONANDO |
| Desempenho com volume de anos (§41) | não medido | não medido nesta rodada | nenhuma | nenhum | não medido | | | PRECISA DE DESENVOLVIMENTO ADICIONAL |

## O que não foi testado nesta rodada

Do §39 do pedido, ficaram sem teste próprio: sessão expirada com formulário
aberto, várias abas abertas ao mesmo tempo, botão voltar do navegador,
armazenamento do aparelho cheio, virada de ano e fevereiro, e volume de meses
ou anos de registros (§41). Os arquivos Word foram conferidos por dentro
(página, margens, fonte, imagens, texto); nesta máquina não há programa que os
abra, e a abertura no Word fica para a aplicação na Casa 03.
