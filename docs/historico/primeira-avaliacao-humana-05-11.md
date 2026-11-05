# A primeira avaliação humana, 05/11/2026

Documento recebido em 05/11: *Primeira Avaliação Humana*, revisão funcional em três etapas
narradas, com quinze módulos, uma matriz de integração e uma lista de prioridades. A diretriz
central é a mesma do sistema: **reorganizar sem excluir**. Este arquivo guarda o que a avaliação
pediu, o que já existia, o que foi consertado na hora, o que a pessoa da Fundação decidiu no
mesmo dia e a ordem das fases que vêm. Nada aqui é laudo de teste: o que foi medido está no §2
do `REDE-ACOLHER.md`, fase por fase.

## O defeito que travava, consertado no mesmo dia

**O cadastro do acolhido não avançava** (módulo 03, prioridade imediata). Reproduzido no
protótipo: com o CPF digitado, nada acontecia até tocar no botão *Conferir*, ao lado do campo, e a
identificação só aparecia depois dele; sem CPF, os campos esperavam um motivo de pelo menos dez
letras sem dizer isso. A frase do que faltava ficava embaixo do botão, atrás do botão da
Acolhe+AI no celular. **Agora** o CPF se confere sozinho ao completar os onze números (e pelo
Enter), sem CPF a identificação aparece na hora, e o que falta para continuar fica escrito dentro
da barra dos botões, com espaço para o botão da Acolhe+AI ao lado. A casa no limite de vagas
continua pedindo a justificativa, e a frase agora diz isso no segundo passo.

## O que a avaliação pediu e já existia

| Módulo | Pedido | Onde já está |
|---|---|---|
| 01, 11 | o que foi feito em verde, com quem fez | fase 273 (Dia e Chamada); a autoria por extenso abaixo do *Confirmado* é da 276 |
| 04 | foto grande, trocar foto | fase 274 (criança e familiar, com histórico) |
| 05 | Família e visitas | aprovada pela avaliação; ordem do mais recente na 275 |
| 05, 09 | cronologia, o mais recente em cima | fase 275 em todas as abas do perfil |
| 06, 13 | alergia e restrição chegando à Cozinha | fases 166 e 204 |
| 08 | atendimento com anexos pelo celular, data e hora | fases 218, 233 e 275 (hora e busca) |
| 10 | atas por mês em calendário | fase 206 (Passagem e Arquivo) |
| 11 | só o que ainda precisa de alguém | fase 210 (*O dia, em ordem*) |
| 14 | portaria com foto, vínculo e saída | fases 160, 163 e 207 |

## As decisões de 05/11 (pessoa da Fundação, nesta sessão)

1. **CPF na Portaria:** a portaria, a técnica e a coordenação veem o CPF inteiro **ao tocar em
   Ver o CPF**; cada abertura vai à auditoria com o nome e a hora; nunca em aviso ou lista. Os
   outros cargos continuam com o CPF mascarado. **Depois, no mesmo dia:** a folha impressa para a
   guarita, que já trazia o documento inteiro desde a fase 92, continua assim, e o toque mostra o
   CPF e o RG juntos (*Ver o documento*).
2. **A demonstração:** a Casa 03 do protótipo fica com quinze acolhidos ativos (as outras cinco
   crianças passam a egressas no Arquivo, nada some), e a palavra *fictício* sai de cada nome,
   ficando só a faixa *Protótipo, dados fictícios* no alto de toda tela.
3. **Nomes novos, sem apagar nada:** *O Dia da Casa* (o Dia com o Painel do plantão),
   *Vivências* (conquistas e vivências numa aba do perfil), *Registro Educacional* (no lugar de
   *Registrar apoio educacional*) e *Atas do Mês* (no Arquivo das ATAs).
4. **A ordem:** funcionamento primeiro, como a avaliação prioriza.

## As fases que vêm, na ordem combinada

- **276, o funcionamento:** a confirmação da chamada com quem confirmou e a hora, e a sequência de
  quem complementou; a data e a hora no alto da tela, e o *conectado* que diz a conexão de verdade;
  os avisos ambíguos (*saída hoje*) com a data e a hora; e o inventário dos cartões e títulos que
  parecem botão e não fazem nada, cada um ganhando a ação ou deixando de parecer botão.
- **277, as decisões de 05/11:** o CPF ao tocar na Portaria, com auditoria; a demonstração com
  quinze acolhidos e sem o *fictício* nos nomes; os quatro nomes novos.
- **278 em diante, a organização:** O Dia da Casa com *Pendentes* e *Toda a rotina*, por manhã,
  tarde e noite, com *Ver detalhes* levando ao registro de origem; a Equipe e a escala em
  calendário (o dia aberto mostra quem está, o líder e os horários); a agenda com local,
  endereço, responsável e duração; o controle de quem fecha a ATA de outro turno.
- **Depois, os módulos:** Educação (vínculo com datas, aviso no último mês e na última semana,
  frequência sem falta automática), atendimentos (local, interno ou externo, *Assistência Social*,
  exportar por período), Judiciário em blocos que se abrem, a Cozinha em resumo por refeição, e o
  sigilo por registro no atendimento de saúde.

## O que fica com cuidado

- **Frequência escolar** nunca presume falta injustificada: ausência informada, presença confirmada
  e ausência ainda não verificada são três coisas, e só a equipe autorizada corrige, com motivo.
- **CPF inteiro** é dado pessoal sensível de terceiro: só ao toque, só para quem confere no portão,
  sempre na auditoria. O DPO deve ver a decisão (PARA-A-REUNIAO §4.41).
- **Nenhum texto de raciocínio da IA aparece ao usuário**: as fases 212 e 214 mediram e
  reescreveram as frases; a avaliação pede a passagem de novo por todas as telas, e ela entra na 276.
