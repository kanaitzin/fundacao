# A revisão geral de 12/11 (fase 315)

Pedido da pessoa da Fundação em 12/11: *"faça uma revisão gigante de tudo, estrutura,
perfis, cargos, tarefas, fluxo do sistema, fluxo do dia a dia, procure melhorias e
facilitadores, deixe o sistema mais moderno e robusto; temos muitos menus na lateral
[...]; procure como podemos melhorar ainda mais o perfil e a linha do dia a dia; pense
no que eu não pedi de perguntar também."*

Este é o relato: o que foi medido, o que virou código nesta fase, e o que ficou para a
Fundação escolher. Tudo foi medido no protótipo aberto no navegador, cargo por cargo, e
não lido no código.

## 1. O que foi medido antes de mexer

### 1.1 O menu da coluna, no computador

Quantas opções cada cargo via de uma vez (as abas do turno, o Guia e todas as portas):

| Cargo | Antes | Agora |
|---|---|---|
| Coordenação Geral | 31 | 17 |
| Coordenação da casa | 30 | 17 |
| Gestor Geral | 29 | 15 |
| Equipe técnica | 26 | 17 |
| Líder Diurno | 19 | 14 |
| Líder Noturno Geral | 17 | 14 |
| Educador social | 15 | 13 |
| Enfermagem | 10 | 8 |

Na tela de 900 px de altura, a coluna da coordenação não cabia: era preciso rolar a
coluna para achar o fim dela.

### 1.2 O Dia da Casa, no celular do educador

A página tinha **6.226 px de altura** (mais de sete telas de rolagem), e a **primeira
tarefa da linha do dia começava a 2.206 px do topo**, quase três telas abaixo: antes dela
vinham o cartão *O que mudou desde o seu último plantão*, aberto, e o *Foi à aula hoje?*,
aberto. Cada cartão de tarefa tinha uma linha só para o botão *Ver detalhes*.

Agora, medido na mesma hora do dia e no mesmo aparelho, a página tem 4.738 px e a primeira
tarefa fica a 870 px.

### 1.3 O perfil, no computador

O cabeçalho do perfil era um cartão com a foto, o nome e **meia tela vazia** ao lado. Os
dados que dizem quem é a criança (idade, casa, tempo de acolhimento, escola, PIA, equipe
de referência) só apareciam na aba Geral. *Trocar foto* e *Tirar foto* ficavam empilhados
embaixo do retrato, em toda visita ao perfil.

### 1.4 A robustez

- **Não havia barreira de erro.** Um erro ao desenhar uma tela desmontava o aplicativo
  inteiro: página em branco, sem menu e sem Sair.
- **Os pedidos ao servidor não tinham limite de espera.** Numa rede que aceita o pedido
  e não devolve a resposta (o wi-fi que pede login, o servidor travado), o pedido ficava
  aberto para sempre, e o botão que grava, que espera a resposta desde a fase 265, ficava
  apagado e mudo.
- O que o celular baixa ao abrir o sistema de verdade: 343 KB comprimidos de programa. A
  leitura do papel (1,4 MB) e o desenho do PDF (0,5 MB) só são baixados no toque. Está
  bom, e não pede mudança.

### 1.5 O protótipo

Trocando de cargo pelo *Ver como*, a pessoa mudava e a **casa de trabalho** continuava a
de quem entrou (o Marcelo, que não tem casa). A educadora da Casa 03 aparecia como
*Escopo institucional*, com o aviso *Você está na AI3* em toda tela, que é de quem atende
várias casas. A demonstração mostrava a todos os cargos uma moldura que só quatro têm.

## 2. O que virou código nesta fase

Com as três respostas dadas no mesmo dia (menu: juntar as telas irmãs **e** deixar cada
pessoa fixar as suas; Dia: cartões curtos no alto; perfil: dados ao lado da foto e fotos
num lugar só).

### 2.1 A coluna curta: as telas irmãs numa entrada só

Seis famílias (`FAMILIAS`, em `frontend/src/portas.ts`):

| Família | Telas dentro |
|---|---|
| Plantão | Painel do plantão · A rotina da casa · A escala de plantão |
| Saúde | Saúde · Internação hospitalar |
| Equipe | Equipe · O trabalho da equipe · O que o plantão vê · O que cada setor enxerga · Combinados da equipe |
| As casas | O dia, em ordem · O período da casa · O trabalho social · Painel das unidades · Unidades |
| Arquivo e acessos | Arquivo documental · Transferências · Cofre de acessos |
| Sistema | Sincronização · Sugestões de melhoria · Saúde da implantação |

- A coluna mostra a família com o número de telas dela. Tocar abre a irmã em que a pessoa
  esteve por último, ou a primeira.
- **A faixa das telas irmãs**, no alto do conteúdo, diz a família e oferece as irmãs que o
  cargo alcança. Vale no computador e no celular.
- Quem vê uma tela só de uma família continua vendo a própria tela, com o nome dela (o
  educador vê *Combinados da equipe*, e não *Equipe*).
- **Nada some e nenhuma chave muda.** O Guia, a Acolhe+AI, os avisos e o *O que cada setor
  enxerga* continuam levando à mesma tela. A folha *Mais* do celular não mudou.
- **Mostrar todas as telas**, no pé da coluna, devolve a lista inteira de antes, e o
  aparelho lembra.

### 2.2 Os atalhos de cada pessoa

Na faixa das irmãs, *Fixar nos atalhos* põe aquela tela em **Meus atalhos**, no alto da
coluna. Os atalhos são **da pessoa, e não do aparelho**: o tablet é da casa, e o que uma
coordenadora fixou não aparece para a colega que entra depois.

### 2.3 A busca do topo acha a tela

A lupa do alto passa a achar a criança **e a tela**: digitar *escala* e ir. No teclado,
Ctrl+K (ou a barra, fora de um campo).

### 2.4 O Dia da Casa

- *O que mudou desde o seu último plantão* nasce **curto**: quantas coisas mudaram, o
  remédio que mudou e o recado que ficou para o turno ficam à vista; *Ver o que mudou*
  abre tudo. O *Entendi* só existe na forma aberta: ninguém confirma que leu o que não
  abriu.
- *Foi à aula hoje?* nasce recolhido, com a pílula do que falta verificar e o botão
  *Marcar a frequência*.
- Em cada tarefa, o *Ver detalhes* foi para a linha da situação. São quinze cartões por
  dia, cada um um botão mais baixo.

### 2.5 O perfil

- **No computador, a ficha *Quem é* fica ao lado da foto** e acompanha todas as abas. No
  celular e no tablet ela continua na aba Geral, para a alergia não descer: medido, a
  faixa da alergia continua a 353 px do topo no celular.
- ***Trocar foto* e *Tirar foto* moram dentro do *Ver a foto***, para a equipe técnica e a
  coordenação. Sem foto, o *Pôr foto* continua embaixo do retrato.

### 2.6 A robustez

- **A barreira de erro** (`frontend/src/barreira-de-erro.tsx`): a tela que não consegue se
  desenhar para nela, com o menu e o topo de pé, e a pessoa escolhe entre tentar de novo,
  ir para o começo e recarregar. O erro não é escrito na tela nem mandado a lugar nenhum,
  porque mensagem de erro pode carregar nome de criança.
- **O limite de espera dos pedidos**: 45 segundos para ler e 2 minutos para gravar, com
  mais tempo conforme o tamanho do anexo. Passado o limite, a leitura diz *O servidor
  demorou demais para responder*, e a gravação diz *Pode ter gravado ou não: confira na
  tela antes de registrar de novo*. A frase não diz *NÃO foi salvo*, porque sem resposta
  ninguém sabe, e na ATA a linha repetida não se apaga.

### 2.7 O protótipo

A casa de trabalho passa a trocar junto com o cargo: a coordenadora, a técnica, o
educador e o Líder Diurno aparecem como *AI3, Casa 03*, sem o aviso de quem atende várias
casas, e o Gestor Geral, a Enfermagem e o Líder Noturno Geral continuam sem casa de
trabalho, como no servidor.

## 3. O que ficou para a Fundação escolher

Nenhum destes foi feito. Cada um tem dois caminhos defensáveis.

### 3.1 Estrutura e menus

1. **Os nomes das famílias.** *Plantão*, *As casas*, *Arquivo e acessos* e *Sistema* são
   proposta. *Transferências* está em *Arquivo e acessos* porque veio do grupo *Sistema*;
   a coordenação talvez a procure em *As casas*.
2. **A folha *Mais* do celular por família.** Hoje ela continua uma lista corrida de até
   26 cartões, com a busca. Agrupar por família deixaria o celular igual ao computador, e
   pede reescrever o caminho de quatro ensaios que entram por ela.
3. **Três telas chamadas *Painel* e três com *dia* ou *unidades* no nome** (*Painel*,
   *Painel do plantão*, *Painel das unidades*; *O Dia da Casa*, *O dia, em ordem*,
   *Unidades*). Agora quatro delas estão na mesma família, e a diferença aparece lado a
   lado na faixa. Nomes novos são decisão da casa (já estava no item 48 da pauta).
4. ***Unidades* para quem tem uma casa só.** O educador abre uma tela com um cartão, o da
   casa em que ele já está. Pode sair do menu dele.

### 3.2 Cargos e perfis

5. **A palavra *Coletivo* ao lado do nome de uma criança.** Na linha do dia, a dose do
   Bruno aparece como *Coletivo · Bruno*. *Coletivo* quer dizer que a tarefa é de quem
   estiver no plantão, e ao lado de um nome parece dizer que a dose é da casa toda.
   Proposta: *Do plantão*.
6. **O cargo da TI** continua sem tela (já estava na pauta desde a fase 192).

### 3.3 O fluxo do plantão

7. **O roteiro do turno no alto do Dia.** Quatro passos que todo plantão faz, com a
   situação de cada um e um toque para ir: a passagem assinada, a chamada da vez, as doses
   do turno, a ATA. Hoje as quatro coisas existem, cada uma na sua tela, e a linha do dia
   as mistura com as outras tarefas. É a melhoria que mais encurtaria o plantão, e muda a
   primeira tela de todo mundo.
8. **O *Dossiê: documentos e vivências* no fim da aba Geral** repete a aba Documentos, que
   existe desde a fase 232. Pode sair.

### 3.4 O perfil

9. **As abas presas no alto enquanto se rola**, e **o Dia a dia com os últimos sete dias
   em sequência**: foram oferecidas em 12/11 e não escolhidas agora. Continuam disponíveis.
   A aba Atendimentos da Alice tem 7.337 px, e para trocar de aba é preciso voltar ao topo.
10. **Nove abas em duas linhas no computador.** A *Documentos* fica sozinha na segunda
    linha a 1366 px.

### 3.5 Os limites de espera

11. **45 segundos e 2 minutos** foram escolha minha, generosa para o 3G. A TI pode querer
    outros números quando o servidor estiver no lugar.

## 4. O que foi medido depois

Está na linha 315 do §2 do `docs/REDE-ACOLHER.md` e no *FEITO, fase 315* do `CLAUDE.md`.
