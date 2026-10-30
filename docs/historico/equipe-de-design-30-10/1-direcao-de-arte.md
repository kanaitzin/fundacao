# Rede Acolher: auditoria visual da direção de arte

30/10/2026. Protótipo aberto por file:// (`prototipo/rede-acolher-prototipo.html`), fotografado com Playwright e Chromium em **1366×900** (monitor) e **390×844** (celular, densidade 2), nos temas **claro** e **escuro**, com seis cargos: Coordenação (Marcelo), Educador social, Portaria, Enfermagem, Gestor Geral e Cozinha. O alto contraste ficou de fora, porque vai sair.

- **Fotos:** `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/`, 328 arquivos. O nome segue `{tema}-{largura}-{nº}-{cargo}_{tela}.png`. O sufixo `-r1` e `-r2` marca a mesma tela rolada uma e duas alturas de tela.
- **Script que tirou as fotos:** `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos.cjs`. Para rodar de novo: `node fotos.cjs`, e `TEMAS=dark TAMS=c` limita o tema e o tamanho.
- **Medição complementar:** `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/medir.cjs`, que mede a hora da linha do dia e o painel da Acolhe+AI.
- Nenhum arquivo do repositório foi editado. Não rodei teste, simulação nem nada que toque o banco.

---

## 1. O diagnóstico em uma página

As telas funcionam e são honestas. Parecem amadoras por **cinco causas de sistema**, e não por falta de cor:

1. **Não há escala.** O `styles.css` usa **26 tamanhos de letra diferentes** (de 9 a 38 px, com 12,5, 13, 13,5, 14, 14,5, 15, 15,5…) e **14 raios de canto** (6, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 999…). As telas ainda têm **533 `style={{…}}` soltos**. Cada tela foi acertada no olho, e o olho de quem usa percebe a falta de ritmo antes de saber dizer o que é.
2. **Tudo é cartão, tudo tem sombra, tudo tem borda.** Cartão dentro de cartão, aviso dentro de cartão, botão de fundo suave dentro de cartão. Como nenhum nível se destaca, o olho não acha onde começar. A sombra `--shadow-1` está em quase toda superfície, então ela deixou de dizer que algo flutua.
3. **O botão é da largura da tela, até no monitor.** `.btn { width:100% }` é o padrão. No celular isso ajuda. A 1366 px vira faixa de 1.070 px: *Cadastrar acolhido*, *Registrar ocorrência*, *Folha para a parede*, *Próximos 30 dias*. O monitor parece um celular esticado. O `.btn.sec` cheio de azul-claro a toda a largura ainda se confunde com campo de texto (na Escala, *Próximos 30 dias* parece um input).
4. **A pílula carrega significado demais.** A mesma cápsula colorida serve ao estado (*Aguardando confirmação*), à categoria (*Erro de medicamento* em violeta, *Violência…* em vermelho), ao vínculo (*Genitora*), ao setor (*Educador social*), ao tipo de casa (*Abrigo institucional*), à situação da conta (*Ativo* em verde em todos os 18 cartões) e à cor de autor (*Azul institucional*). Pela regra de produto, a pílula clara com letra colorida é a forma do **estado**. Hoje ela também é a forma de cinco outras coisas, e a categoria *Violência ou suspeita de violação* em vermelho fica igual a um estado crítico.
5. **Falta cabeçalho de página.** Cada tela abre de um jeito. O Dia tem eyebrow, *Hoje* e pílulas. A Chamada tem dois títulos seguidos (*Chamadas de hoje* / *As chamadas da casa*). Ocorrências, Cozinha, ATA, Equipe e Saúde abrem direto num controle segmentado, sem título. O Painel do plantão tem um *Atualizar* colado no título. Sem um cabeçalho padrão (onde estou, de que casa, o que faço aqui), a pessoa se orienta tela a tela.

Por cima disso há **três defeitos objetivos**, que não são questão de gosto (seção 4).

---

## 2. O que JÁ funciona e deve ficar

- **A paleta.** O navy institucional (#003262 / #005993) com o azul de marca dá seriedade sem frieza. As oito cores vivas, cada uma com tom vivo e tom sólido aprovado em AA, são um bom alicerce. A Fundação gostou delas, e com razão.
- **As duas famílias de letra.** Plus Jakarta Sans nos títulos e Atkinson Hyperlegible no texto formam uma dupla excelente para este público. A Atkinson foi feita para baixa visão. Mantenho as duas: o problema é a escala, e não as fontes.
- **Os retratos ilustrados** (`retratos.ts`). São calorosos, diversos e não realistas. É o elemento mais "vivo" do sistema, e dá para usá-los mais (estados vazios, Guia, entrada).
- **O caminho das quatro etapas da ocorrência** (`.oc-caminho`). É claro e informativo, e é o melhor componente do sistema. Só precisa de acabamento no ícone de ✓ (seção 3).
- **A linha do dia como linha do tempo** (trilho, ponto da categoria, traço do *agora*). A ideia é ótima, e o pill *agora · 09:36* é um bom detalhe. Falta acabamento.
- **O calendário dos plantões** (`.cal-*`). A grade, o sol e a lua e a cor por situação são legíveis e bonitos. É o componente mais maduro visualmente.
- **Os cartões da Portaria com a foto 3×4.** A forma é certa para a função: rosto grande, dados em lista e uma ação.
- **O círculo de iniciais na cor do cargo**, cheio e com letra branca. É a forma certa e se distingue da pílula. Deve ser a ÚNICA forma de mostrar o cargo, inclusive na Equipe (hoje lá aparece também uma pílula de setor).
- **As abas do perfil com cor por assunto** (`--aba-*`). A intuição é boa. O problema está no formato (seção 3.6), e não na ideia.
- **O tema escuro** já é decente: superfícies #0C1219, #151E28 e #1C2833 com a tinta #E8EEF5. Só o azul de ação está claro demais (seção 5, item 6).
- **A tarja do protótipo e o "Ver como"** são só do protótipo e cumprem a função. Não avaliei a estética deles.

---

## 3. Tela por tela

### 3.1 Entrada (login)
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-01-entrada.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-01-entrada.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/dark-390-01-entrada.png`.
- Monitor: um cartão branco de 430 px num degradê navy vazio. É correto e genérico, e é o primeiro contato. Falta o momento de marca: o lado esquerdo pode levar uma ilustração no estilo dos retratos, ou a frase da Fundação, com o cartão à direita.
- O logo tem 132 px, título *Rede Acolher* em 28 px e dois subtítulos (*Acolhimento Institucional* em azul, *Sistema de gestão…* em cinza). São três níveis para dizer uma coisa só: deixar um subtítulo.
- Os atalhos de demonstração são pílulas soltas centralizadas, em cinco linhas desiguais. No protótipo valem uma grade de 2 colunas com o círculo do cargo.
- No escuro o logo fica num bloco branco de 130×80 que acende no meio do cartão. Reduzir a placa (padding 8, raio 12) ou usar a versão do logo em linha clara.

### 3.2 Moldura: topo, coluna lateral, barra do pé
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-02-coordenador_Dia.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-02-coordenador_Dia.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/dark-1366-02-coordenador_Dia.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-34-cozinha_entrada_do_cargo.png`.
- **O topo no monitor tem duas linhas e a primeira é só o círculo MB.** O nome, a casa e o e-mail descem para a linha de baixo, e à direita sobram cinco ícones mais *Sair* mais a pílula *Coordenação*. O resultado é uma faixa de 90 px com um círculo órfão. Proposta: uma linha só, com círculo, nome e casa à esquerda e as ações à direita, e o e-mail fora (ele está na Minha conta).
- **O item ativo da coluna é uma laje navy com brilho** (sombra azul). No claro é pesado. No escuro vira uma laje azul-pastel acesa (#7BC0EC) com letra escura, a coisa mais clara da tela às 23h. A decisão de 27/09 diz que o item aberto é preenchido. A proposta mantém o preenchimento, mas com o fundo de marca suave, uma barra de 3 px à esquerda e a letra em negrito. Sem brilho.
- **O logo no celular tem 26 px de altura** e é ilegível (*Pão dos Pobres* em 6 px). Com o wordmark escondido abaixo de 380 px, o topo do celular fica com um logo minúsculo e um círculo.
- **A barra do pé (celular):** o item ativo é uma placa azul de 150×110 px. Ela é forte demais e briga com o botão principal da tela. O padrão atual dos sistemas móveis é uma pílula indicadora atrás do ÍCONE (64×32), com o rótulo em negrito na cor da marca. Continua preenchido, ocupa um terço do peso e deixa o conteúdo respirar.
- **Defeito: a Cozinha fica com uma barra do pé de um botão só, "Mais", com a largura inteira** (`/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-34-cozinha_entrada_do_cargo.png`). Um retângulo azul de 370 px. Com uma porta só, a barra deveria mostrar as portas do cargo, ou não existir (como na Portaria).
- **O botão da Acolhe+AI** (círculo azul de 104 px de diâmetro a 2x) fica sobre a borda direita do conteúdo em TODAS as telas do celular. Ele cobre o *Mudar* da Ceia, o fim do nome *Fechada* no caminho da ocorrência, o horário dos avisos e o texto das doses. Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-03-coordenador_Chamada.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-15-coordenador_Ocorrencias.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-25-coordenador_avisos.png`.

### 3.3 Dia (Coordenação e Educador)
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-02-coordenador_Dia.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-02-coordenador_Dia.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-02-coordenador_Dia-r1.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-02-coordenador_Dia-r2.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-28-educador_Dia.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/dark-390-02-coordenador_Dia-r2.png`.
- **A primeira dobra do celular não mostra o dia.** O aniversário, o eyebrow, *Hoje*, as três pílulas e o cartão *O que mudou* tomam a tela inteira. A primeira linha do tempo aparece no segundo rolar. O *O que mudou* tem pelo menos sete blocos e três botões "Abrir…" de largura total, em azul suave. Recolher em três linhas-resumo (*1 ocorrência · ATA anterior com pendência · 2 remédios mudaram*), com *Ver o que mudou* abrindo o resto.
- **Os botões "Abrir as ocorrências / Abrir a ATA / Abrir a Saúde"** são faixas de 650 px no monitor. Deveriam ser links com seta, alinhados à direita do subtítulo de cada bloco.
- **As pílulas do resumo** (*15 no dia*, *2 críticos*, *3 em atenção*) estão alinhadas à direita do título no monitor e à esquerda no celular. São o melhor resumo da tela e merecem virar números grandes (*2 críticos* como contagem em destaque, clicável, filtrando a linha).
- **Linha do tempo:** cada cartão empilha título, CATEGORIA EM CAIXA ALTA, *Casa toda*, pílula e botão, numa coluna de cinco linhas para um evento. Proposta: título; uma meta-linha (*Medicamento · Lara*); a pílula de estado à direita do título no monitor e abaixo no celular; o botão compacto. O cartão *feito* (fundo rebaixado) está certo.
- **Defeito: a hora fica cortada no celular** (*08:0C*, *10:1E*). Ver seção 4.
- No escuro, os botões de ação da linha (*Ver ATA*, *Assinar minha passagem*) viram blocos azul-pastel com letra escura, que brilham mais que qualquer outra coisa da tela.

### 3.4 Chamada
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-03-coordenador_Chamada.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-03-coordenador_Chamada.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-03-coordenador_Chamada-r1.png`.
- Dois títulos seguidos, *Chamadas de hoje* (28 px) e *As chamadas da casa* (22 px), e nenhum dos dois diz mais que o outro.
- **O *Mudar* fica FORA do cartão**, flutuando à direita. Quebra o alinhamento da coluna e parece um erro de grade. Levar para dentro do cartão como ação secundária, ou para um ⋯ com a palavra.
- A pílula *Abrir* (cinza) tem a forma de estado, mas é um verbo. Lida como estado, confunde *Aberta* (estado) com *Abrir* (ação). O estado de uma chamada não aberta seria *Ainda não aberta*, e a ação seria o próprio toque no cartão.
- A cor da casa (barra e ponto) está correta e bonita: é a quarta cor funcionando.
- No fim, *Nova chamada da casa* (sec, largura total) e *Abrir outra chamada* (primária, largura total) são duas faixas empilhadas, e a primária é a menos frequente. Inverter os pesos.

### 3.5 Passagem / ATA
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-04-coordenador_Passagem.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-04-coordenador_Passagem.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-19-coordenador_ATA.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-19-coordenador_ATA.png`.
- A Passagem é das melhores telas: título, frase e dois cartões de plantão com pílula. O calendário é bonito.
- Na ATA há **dois controles segmentados empilhados** (*ATA da casa / ATA Geral Noturna / Arquivo* e, abaixo, *Turno noturno / Turno diurno / Turno anterior*), com a mesma forma e o mesmo peso, a 300 px um do outro. O segundo deveria ser um seletor menor (chips ou abas sublinhadas) dentro do cartão da ATA, para a hierarquia ficar clara: primeiro escolho QUAL livro, depois QUAL turno.
- *Liberar* e *Negar*, com fonte 13 px, ficam pequenos e grudados ao texto do pedido. Precisam de respiro de 12 px acima.

### 3.6 Acolhidos e perfil da criança
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-05-coordenador_Acolhidos.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-05-coordenador_Acolhidos-r1.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-05-coordenador_Acolhidos.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-06-coordenador_perfil_0_Geral.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-06-coordenador_perfil_0_Geral-r1.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-06-coordenador_perfil_0_Geral.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-07-coordenador_perfil_1_Familia_e-r1.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-08-coordenador_perfil_2_Saude-r1.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/dark-390-06-coordenador_perfil_0_Geral.png`, e as abas 3 a 7 em `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-09…13-*.png` e `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-09…13-*.png`.
- **Lista:** os cartões de criança (retrato, nome, idade, ícones de alerta com número) estão bons. Os problemas estão em volta. **Os cartões *Saídas de hoje* e *Com a família* começam com 50 px de vazio** (o `.eyebrow` tem `margin-top:22px` e soma ao padding do `.card`). *Cadastrar acolhido* em azul cheio a toda a largura fica NO MEIO da tela, entre os avisos e a lista, e vira o maior objeto da página. A ação mais rara ganha o maior peso. *Acervo histórico*, a busca e a lista ficam encostados, sem espaço entre eles.
- **Os ícones de alerta na lista** (triângulo vermelho e talher âmbar com o número 1) usam a pílula de estado para *tem alergia* e *tem restrição*. O sentido funciona, mas o número sozinho (*1*) não diz nada a quem lê pela primeira vez. Escrever *alergia* ao lado no monitor.
- **Cabeçalho do perfil** (`.perfil-topo`): o *← Acolhidos* fica DENTRO da faixa colorida, como se fosse parte da criança. *Ver a foto* e *Trocar foto* são dois botões de larguras diferentes, empilhados e centralizados sob o retrato, e no celular empurram o cartão a 400 px de altura. O nome fica espremido numa coluna à direita. Proposta: o voltar como trilha acima do cartão; retrato à esquerda sobreposto à faixa; nome em 28 a 32 px; idade, casa e tempo numa linha; as ações da foto num toque no próprio retrato (folha com *Ver* e *Trocar*).
- **As oito abas em grade 2×4 ocupam 360 px no celular** e parecem oito botões grandes, e não abas. No monitor ficam numa linha com uma borda inferior grossa de 4 px na cor da aba, como teclas de brinquedo. Proposta: uma faixa horizontal que rola de lado (44 px de alto), com o ícone colorido e o rótulo; a aba aberta preenchida com o tom suave da cor dela e um traço de 3 px embaixo. A cor da aba continua, e a tela devolve 300 px ao conteúdo.
- **Os blocos de cuidado** (alergia em vermelho, restrição em âmbar) estão no lugar certo e com a forma certa. Só que os dois aparecem colados, sem espaço entre eles.
- **Ficha Geral** (`.ficha-geral`): seis caixas brancas iguais com rótulo, valor azul e detalhe. Funciona. No monitor, porém, as quatro colunas ficam com o valor em azul-marinho de 17 px e a frase em 12 px: a diferença de peso é pequena demais para virar uma "ficha". Fazer o rótulo em caixa alta 11 px cinza e o valor em 20 px.
- **"Em números" (abas Família e Saúde):** oito caixas cinza com o número 0 em 28 px. O zero ganha o maior destaque da tela. Zero deveria ser cinza e menor, como o `.lista.contas li.zero` já faz no Painel.
- **Família e visitas:** cada contato tem pílula de vínculo, duas a três pílulas de situação e QUATRO botões contornados de larguras diferentes, quebrando em três linhas (*Vai passar dias com Rosângela*, *Portaria: CPF, foto ou retirar*, *Corrigir*, *Este contato não vale mais*). É a parede de botões típica de sistema interno. Proposta: um botão principal e um *Mais ações* (com a palavra) que abre a folha.
- **Saúde (aba):** *Registrar atendimento de saúde* (sec, largura total), *Registrar alergia ou condição* e *Registrar restrição alimentar*, os três com bordas diferentes. O último encosta no título da alergia logo abaixo, sem respiro.

### 3.7 Saúde (Coordenação e Enfermagem)
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-14-coordenador_Saude.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-14-coordenador_Saude.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-14-coordenador_Saude-r1.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-31-enfermagem_Saude.png`.
- **Os quatro números do topo** (borda esquerda colorida e número na cor) estão bons e são o modelo que as outras telas deveriam seguir. O número em violeta e em azul, porém, usa cores de categoria (medicamento e informação) como se fossem estado.
- **O controle segmentado quebra em duas linhas no celular** (*Doses do dia / Triagem / Estoque / Compras* e, embaixo e centralizados, *Esquemas / Resumo de saúde*). A segunda linha centralizada é o sinal de "não coube". Rolar de lado.
- **O cartão da dose no celular** coloca a hora numa linha sozinha, o retrato e o nome noutra, e o remédio quebrando em duas. A pílula *Alergia a Dipirona* desce para uma terceira linha. No monitor o mesmo cartão está bom. No celular: hora e nome na mesma linha, e o retrato menor (40 px).
- A ordem das doses no protótipo aparece como 08:30, 08:50, 04:35, 11:35 (`/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-14-coordenador_Saude.png`). Pode ser dado relativo do protótipo, mas a lista não lê em ordem de hora. Anotado, sem investigar.

### 3.8 Ocorrências
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-15-coordenador_Ocorrencias.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-15-coordenador_Ocorrencias.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-15-coordenador_Ocorrencias-r1.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/dark-1366-15-coordenador_Ocorrencias.png`.
- **O cartão de entrada** (ícone, título, frase, aviso vermelho, *Registrar ocorrência* com a largura total) ocupa a primeira dobra inteira no celular, todo dia, para uma ação de exceção. Deveria ser um botão com o ícone no cabeçalho da página, e o aviso de *proteção primeiro* ir para dentro da folha (onde já está repetido).
- **Pílulas:** cada ocorrência mostra categoria (*Saída não autorizada* em ciano, *Erro de medicamento* em violeta, *Violência…* em VERMELHO, *Emergência de saúde* em vermelho), estado (*Aguardando análise técnica* em violeta, *Etapa operacional encerrada* em azul, *Fechada após análise* em verde) e marcas (*Exige análise técnica* em violeta, *Acesso restrito* em vermelho). No mesmo cartão, três violetas com três sentidos. **A categoria em vermelho fica igual a um estado crítico.** É o caso mais grave de mistura das cores.
- **O caminho das etapas:** ✓ pequeno e meio torto dentro do círculo, e o marcador do passo atual parece um *C*. No celular, *Fechada* fica sob o botão da Acolhe+AI.
- **O selo da data** (*30/10 · 21:40* num quadrado cinza) é bom.

### 3.9 Portaria (Portaria e Coordenação)
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-30-portaria_topo.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-30-portaria_topo-r1.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-22-coordenador_Portaria.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-30-portaria_topo.png`.
- É a tela com a melhor ideia de forma. No monitor, porém, o cartão de *Na casa agora* ocupa 520 px, e os dois botões (*Registrar a saída de Madrinha Simoni (fictícia)* em azul e *Corrigir o horário* em azul suave) têm 390 px cada e 60 px de altura. São dois botões enormes para um cartão de visitante.
- No celular, os rótulos *Vínculo / Documento / Quando pode vir / Atenção* em negrito cinza acima de cada valor fazem o cartão ter 650 px de altura. Usar `dl` em duas colunas (rótulo 11 px caixa alta, valor ao lado) também no celular, a partir de 360 px.
- O nome em 22 px azul-marinho mais a pílula de estado é ótimo. *Quem pode visitar, por criança* com *Alice · 2 autorizados* está bom.

### 3.10 Cozinha
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-16-coordenador_Cozinha.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-16-coordenador_Cozinha.png`.
- Números do período em texto de 15 px soltos numa linha (*284 porções de lanche · 16 pedidos…*): é o mesmo dado que, na Saúde, vira um número com borda colorida. Padronizar com os números da Saúde.
- *Pedir lanche* (primário) e *Pedir cesta básica* (sec) lado a lado, de 530 px cada, e a seguir *Ver o histórico deste pedido* com 1.030 px de largura dentro de cada cartão de pedido.
- Os campos *De* e *Até*, com 510 px cada, para uma data de 10 caracteres.

### 3.11 Equipe
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-17-coordenador_Equipe.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-17-coordenador_Equipe.png`.
- **Cada cartão tem quatro botões** (*Editar*, *Convidar* em azul cheio, *Nova senha*, *Desativar*), e são **18 botões primários na mesma tela**. *Convidar* só faz sentido para quem ainda não entrou. Proposta: a ação principal muda conforme a situação (convite pendente = *Convidar*; ativo = nenhuma primária), e o resto vai num *Mais ações*.
- **O e-mail aparece em monoespaçada** (`.membro-email`), destoando de tudo. Usar a Atkinson em cinza.
- *Ativo* em verde em todos os cartões é ruído. Mostrar a situação só quando é exceção (*Convite pendente*, *Desativado*).
- **O setor como pílula colorida** (*Educador social* azul, *Líder Diurno* verde, *Equipe técnica* rosa) repete o cargo, que o círculo já diz pela cor, e usa a forma da pílula de estado. **A pílula de cor da linha** (*Azul institucional*, *Verde*, *automática*) mostra a cor de AUTOR em forma de pílula. As duas violam a separação de formas: o cargo é o círculo, o autor é a borda. Na Equipe, a cor da linha deveria ser uma amostra de 4 px de borda numa linha de exemplo.

### 3.12 Painel das unidades e Unidades (Gestor Geral)
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-32-gestor_geral_Painel_das_unidad.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-32-gestor_geral_Painel_das_unidad.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-33-gestor_geral_Unidades.png`.
- O Painel em grade de casas, com o selo do código e a barra de ocupação contra o próprio limite, está bem resolvido e respeita a regra (sem ranking: ordem do código). As três caixas cinza por casa com *1 / 7 / 1* em 24 px são boas.
- A casa aberta tem borda azul de 2 px e sombra: chama mais atenção que as outras sem que seja mais importante (pode parecer destaque de "melhor casa"). Marcar só o botão (*Aberta*) e não o cartão inteiro.
- No celular, a terceira caixa cai sozinha numa segunda linha (grade de 2). Usar três colunas estreitas ou uma lista de três linhas.
- **Unidades:** a lista de cartões brancos com código, nome e endereço é correta. Mas *olhando* aparece em pílula verde (o verde é *ok*), e *Abrigo institucional* / *Casa-lar* em pílula azul ou ciano (tipo, e não estado).
- Na barra do pé do celular, com o Painel aberto, o item ativo é *Mais*, e não *Painel*.

### 3.13 Guia do sistema
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-18-coordenador_Guia_do_sistema.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-18-coordenador_Guia_do_sistema.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-34-cozinha_entrada_do_cargo.png`.
- O índice tem quatro ou cinco links sublinhados soltos em negrito (*Novidades*, *As telas*, …), que parecem texto de 2005. As Novidades são uma parede de parágrafos com datas repetidas (*28/10/2026* três vezes, em cinza negrito monoespaçado).
- É a tela que mais pede para ser "linda": é a vitrine. Proposta: índice em cartões com ícone (as quatro seções); Novidades como linha do tempo agrupada por dia (uma data, várias linhas com o ícone da tela); *As telas* em grade de cartões com o ícone da porta e a cor do grupo.

### 3.14 Avisos
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-25-coordenador_avisos.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-25-coordenador_avisos.png`.
- Um cartão de cabeçalho (*Avisos / O que chegou para você* e um aviso azul explicando) e logo depois o segmentado *Não lidos · 6 / Tudo*. São três camadas antes do primeiro aviso.
- Cada aviso tem pílula de prioridade (*Alta* âmbar, *Crítica* vermelha), título, texto, *Continua em: ATA.* e três botões, dos quais *Estou ciente* é o primário e *Abrir ATA* o secundário. No celular quebram em duas linhas. Proposta: o aviso inteiro abre a tela; *Estou ciente* é o botão; *Marcar como lido* vira um link de texto.

### 3.15 Folha (formulário) aberta
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-27-coordenador_folha_aberta.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-27-coordenador_folha_aberta.png`.
- **O botão principal desabilitado** (`opacity:.42`) fica azul-claro lavado, quase igual ao *Cancelar* (sec, azul suave). Às 23h, *Cancelar* parece o botão de ação. Proposta: `.btn:disabled` em cinza neutro (fundo `--sunken`, letra `--muted`, sem opacidade), e o *Cancelar* como `ghost` (contorno), e não `sec`.
- As opções de categoria (`.opt`) são pílulas contornadas em fluxo livre, com larguras diferentes e alinhamento serrilhado. Uma grade de duas colunas no celular, com o ícone da categoria, lê mais rápido.
- O aviso vermelho do topo traz um travessão (*para o depois — e aceita…*) que a regra da casa (fase 212) manda tirar.
- O modal no monitor (480 px) está bom.

### 3.16 Acolhe+AI aberta
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-26-coordenador_acolhe_aberta.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-26-coordenador_acolhe_aberta.png`.
- **Defeito: a opção *Mãos ocupadas…* passa da borda** do painel e é cortada (seção 4).
- O topo da conversa é um formulário de preferências: *Falar com*, duas caixas de marcar e *Ensinar uma palavra*. Ocupa 200 px antes do primeiro balão. Recolher num botão *Ajustes* (com a palavra) no topo.
- O balão do *Modo guia* (azul) e a saudação em cinza de 13 px, solta, sem balão: dois estilos para duas falas da mesma assistente.
- *Enviar* desabilitado em azul-pastel, com *Nova conversa* contornado ao lado, repete o problema da folha.
- No monitor, o painel de 420 px cobre a direita do conteúdo, e o conteúdo não se reorganiza.

### 3.17 Escala, Agenda, Painel do plantão, O dia em ordem
Fotos: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-24-coordenador_A_escala_de_planta.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-23-coordenador_Agenda.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-21-coordenador_Painel_do_plantao.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-20-coordenador_O_dia_em_ordem.png`.
- **Escala:** *Próximos 30 dias*, *Mês passado*, *Folha para a parede* e *Mudar o horário dos turnos* são faixas sec de largura total. Parecem campos, e não botões. *Montar um mês* começa com um campo `2026-11` de 1.030 px.
- **Painel do plantão:** *Atualizar* (ghost) colado ao título; *Passar para outra pessoa ou recusar* bem resolvido. *Agendada* em texto puro, sem pílula, onde as outras telas usam pílula.
- **O dia, em ordem:** a melhor tela de lista no monitor (linhas finas, hora, ícone, pílula à direita). A hora em monoespaçada com zero cortado (*07:ØØ*) parece terminal. A legenda num bloco cinza é boa.

### 3.18 Tema escuro, visão geral
Fotos: todas as `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/dark-*.png`. Em especial `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/dark-1366-02-coordenador_Dia.png`, `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/dark-390-02-coordenador_Dia-r2.png` e `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/dark-1366-15-coordenador_Ocorrencias.png`.
- As superfícies estão bem escalonadas. **O problema é o `--brand-solid:#7BC0EC` como fundo de botão.** Todo botão principal, o item ativo da coluna, a placa ativa do pé e o botão da Acolhe+AI viram blocos azul-bebê com letra quase preta: as maiores manchas claras de uma tela que deveria descansar a vista à noite.
- Os ícones das abas do perfil em cores escuras (Judiciário #4B5A8C) quase somem no fundo #151E28.

---

## 4. Defeitos objetivos achados nas fotos (não são gosto)

1. **A hora da linha do dia é coberta pelo ponto no celular.** A coluna da hora tem 42 px (`@media (max-width:760px) .linha .ev{ grid-template-columns:42px 1fr }`), o texto *08:00* mede 38 px, e o ponto (`.linha .ev::before{ left:45px }`, 14 px com anel de 4 px na cor do fundo) começa em 41 px e pinta por cima do último dígito: *08:0C*, *10:1E*, *08:3C*. Medido a 360 e 390 px. Fotos `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-02-coordenador_Dia-r2.png` e `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/dark-390-02-coordenador_Dia-r2.png`. Arquivo: `frontend/src/styles.css`, linhas ~1826–1832.
2. **A opção *Mãos ocupadas…* da Acolhe+AI vaza do painel** (borda direita a 436 px num aparelho de 390, cortada pelo `overflow:hidden` do `.acolhe-painel`), porque `.acolhe-opcoes label span{ white-space:nowrap }`. Também a 1366 (`…volta a ou`). Fotos `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-26-coordenador_acolhe_aberta.png` e `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-1366-26-coordenador_acolhe_aberta.png`. O `ensaio:celular` não pega porque não abre a Acolhe+AI.
3. **A barra do pé da Cozinha é um botão só, "Mais", com a largura inteira** (`/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-34-cozinha_entrada_do_cargo.png`).
4. Menores: o item ativo do pé fica em *Mais* quando o gestor está no Painel das unidades (`/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/fotos/light-390-32-gestor_geral_Painel_das_unidad.png`); o travessão no aviso da folha *Registrar ocorrência*; as doses fora de ordem de hora no protótipo (seção 3.7).

---

## 5. As 15 mudanças de maior impacto visual, em ordem

Cada uma diz o que muda, onde, e por que sobe a qualidade percebida. Todas preservam as quatro cores e os sentidos delas, o AA, os 360 px sem rolar de lado e os alvos de pelo menos 24 px (44 px onde é do dedo).

**1. Escala de tipo e de espaço em tokens, e um cabeçalho de página igual em toda tela.**
`frontend/src/styles.css` `:root`: criar `--t-xs:12px; --t-sm:13.5px; --t-md:15px; --t-lg:17px; --t-xl:22px; --t-2xl:28px` e `--s-1:4px … --s-8:40px`, e trocar os 26 tamanhos pelos seis. Nova classe `.pagina-cabeca` (eyebrow com a casa, `h1` em `--t-2xl`, frase opcional e a área de ações à direita) para Dia, Chamada, Acolhidos, Saúde, Ocorrências, Cozinha, ATA, Equipe, Avisos e Guia. Hoje metade abre sem título. Reaproveitar `.diahead` (linhas ~473–484). Horas e números grandes com `font-variant-numeric:tabular-nums` em Plus Jakarta (fim do monoespaçado em `.linha .hora` linha 551 e `.dia-item .hora`).

**2. O botão deixa de ter a largura da tela no monitor, e o desabilitado deixa de parecer o secundário.**
`.btn` (linha ~193): `width:auto` a partir de 1080 px, e `.btn.block` (linha 880) para quando a largura total é de propósito; no celular continua 100%. `.btn:disabled` (linha 207): sem `opacity`, com fundo `--sunken`, letra `--muted` e borda tracejada. Rodapé de folha (`.sheet .rodape`, linha 783): a primária à direita e o *Cancelar* como `.ghost`. É a mudança que mais tira a cara de "celular esticado".

**3. A pílula volta a ser só estado: nasce a etiqueta neutra para tipo, vínculo e categoria.**
Nova `.tag` (fundo `--raised`, letra `--ink-2`, borda `--line`, raio 6 px, com um ponto ou ícone na cor da categoria à esquerda). Usar em: categoria da ocorrência (`.ocorrencia .pill`, linha 1908, `screens/Ocorrencias.tsx`), vínculo do contato (*Genitora*), tipo de casa (`screens/Painel.tsx` / Unidades), *olhando*. **Tirar** a pílula de setor e de cor da linha da Equipe (`.membro-dados .pill`, linhas 1984 e 2020): o setor já é o círculo, e a cor da linha vira amostra de borda. O *Ativo* sai, e só a exceção aparece. Assim *Violência ou suspeita de violação* deixa de ter a cara de *crítico*.

**4. Uma hierarquia de superfícies: borda para o que está no plano, sombra só para o que flutua.**
`.card` (linha 169): tirar `box-shadow`, ficando `--shadow-1` só em `.sheet`, `.overlay`, `.acolhe-*` e no botão flutuante. Três raios (`--r-sm:8px; --r-md:12px; --r-lg:20px`) no lugar dos 14. Cartão dentro de cartão vira seção com divisor (`.card .card`). E `.card > .eyebrow:first-child{ margin-top:0 }` para matar o vazio de 50 px no topo dos cartões *Saídas de hoje* e *Com a família*.

**5. O topo numa linha no monitor e a marca legível no celular.**
`.appbar .top` e `.appbar .quem` (linhas 146 e 163, `App.tsx` ~600–700): círculo, nome e casa à esquerda e ações à direita, numa linha de 64 px; o e-mail vai para a Minha conta. No celular, `.logochip img` de 26 para 32 px, e o símbolo em vez do logotipo inteiro abaixo de 380 px.

**6. O azul de ação do tema escuro: fundo profundo e letra branca.**
`:root[data-theme="dark"]` e o bloco do `prefers-color-scheme` (linhas ~65–125): novo `--brand-fill:#1F5E9E` com `--on-fill:#FFFFFF` (6,66:1), usado em `.btn`, `.filtros button.on`, `.tabbar button.on`, `.portas-lateral button.on` e `.acolhe-botao`. O `#7BC0EC` fica para links e texto de marca (7,21:1 sobre `--brand-soft`). A tela da noite para de ter lajes azul-bebê.

**7. A navegação ativa preenchida, porém leve.**
`.tabbar button.on, .portas-lateral button.on` (linhas 1217 e 1776): na coluna, fundo `--brand-soft`, barra de 3 px `--brand` à esquerda, letra `--titulo` em 800, sem brilho. No pé do celular, uma pílula indicadora de 64×32 atrás do ícone, com o rótulo em negrito na cor da marca. Continua preenchido (decisão de 27/09), com um terço do peso. Conferir com a Fundação, porque toca uma decisão já tomada. De passagem, a barra da Cozinha com um botão só (`App.tsx`, `temMais`/`abasDoTurno`).

**8. A linha do tempo do Dia: a hora inteira, cartões mais curtos.**
`.linha .ev`, `.linha .ev::before`, `.linha::before` e `.linha .agora` no `@media (max-width:760px)` (linhas ~1826–1832): coluna da hora de 42 para 48 px e o ponto e o trilho 6 px à direita (conserta o *08:0C*). No cartão (`.linha .ev .corpo`, `.catrot`): a categoria e a criança numa meta-linha só (*Medicamento · Lara*), o *Casa toda* só quando não há criança, e a pílula ao lado do título a partir de 520 px. Cada evento perde duas linhas.

**9. O controle segmentado que não quebra, e um só por nível.**
`.filtros` (linhas ~485–500): no celular, `flex-wrap:nowrap; overflow-x:auto` com `flex:0 0 auto` nos botões e um esmaecido na borda (fim da segunda linha centralizada da Saúde); no monitor, largura do conteúdo. Para o segundo nível (*Turno* na ATA, `screens/Ata.tsx:713`; *Recorte*, linha 1463), uma variante `.filtros.sub` com abas sublinhadas de 36 px dentro do cartão.

**10. O cabeçalho do perfil da criança e as abas numa faixa.**
`.perfil-topo` (linhas 1738–1753) e `.abas-perfil` / `.aba-perfil` (linhas 2087–2101), `screens/Acolhidos.tsx`: o voltar sai do cartão e vira trilha acima; retrato de 96 px sobreposto à faixa, nome de 28 a 32 px ao lado, uma linha de dados; *Ver* e *Trocar* num toque no retrato. As oito abas viram uma faixa que rola de lado, com 44 px de alto, a cor da aba no ícone e no traço de 3 px da aba aberta (sem a borda inferior de 4 px em todas). O celular devolve uns 300 px ao conteúdo.

**11. Números que contam: o zero recua, o que importa aparece.**
Um componente de número único (`.numero`: rótulo de 12 px em caixa alta acima e valor de 26 a 28 px tabular), usado nos quatro da Saúde, no *Em números* do perfil (`.ficha-geral`), na Cozinha (*284 porções…*) e no Painel (`.lista.contas`). O zero ganha `.zero` (valor em `--muted` e 20 px), como o Painel já faz na linha 2015. A borda esquerda colorida só quando a cor é ESTADO (aguardando = âmbar); violeta e azul de categoria saem do número.

**12. Uma ação principal por cartão; o resto em "Mais ações".**
`.membro-acoes` (linha 1985, `screens/Equipe.tsx`), `.contato-cartao` (linha 1756) e os avisos (`screens/Avisos.tsx`): um botão principal conforme a situação (*Convidar* só com convite pendente) e um `.btn.ghost` *Mais ações* com a palavra, que abre a folha com as outras. Em Avisos, o cartão inteiro leva à tela, *Estou ciente* é o botão e *Marcar como lido* vira link. Saem 18 botões azuis da Equipe e a parede de quatro botões de cada familiar.

**13. A Acolhe+AI: a conversa primeiro, os ajustes num botão, o flutuante sem cobrir conteúdo.**
`.acolhe-opcoes` (linhas 1537–1542): recolher atrás de *Ajustes* no topo e trocar `label span{white-space:nowrap}` por `normal` (conserta o vazamento). A saudação vira balão como as outras falas (`.acolhe-linha.acolhe`). `.acolhe-botao` (linha 1519) no celular: 48 px, `bottom: calc(var(--barra-pe) + 12px)`, e `.conteudo{ padding-bottom:96px }` mais um `padding-right` nos últimos cartões, para não cobrir *Mudar*, *Fechada* e a hora dos avisos. Ou levar a Acolhe+AI para dentro do topo no celular, ao lado do sino. Essa segunda opção é decisão da Fundação.

**14. Monitor com grade de verdade: medida de leitura e duas colunas onde cabe.**
`.app` / `.conteudo` (linhas 315, 382 e 1089): `max-width:1180px` para o conteúdo e `max-width:720px` para folha, formulário e texto corrido (Guia, Escala, Cozinha); duas colunas a partir de 1280 px no Dia (a linha do tempo à esquerda, *O que mudou* e as pílulas à direita, fixos ao rolar) e na Portaria (*Na casa agora* à esquerda, *Quem pode visitar* à direita). Campos de data com `max-width:220px`. Fim das faixas de 1.070 px.

**15. Os momentos de marca: a entrada, o Guia e os estados vazios com os retratos.**
`.loginwrap` / `.logincard` (linhas 269–312): no monitor, duas metades, com uma composição dos retratos ilustrados e a frase da Fundação à esquerda e o cartão à direita; um subtítulo só; atalhos do protótipo em grade com o círculo do cargo. `.guia-indice`, `.guia-link` e `.guia-novidades` (linhas 2222–2249): índice em cartões com ícone, Novidades agrupadas por dia, telas em grade com a cor do grupo. Estado vazio padrão (`.vazio`, novo): ilustração pequena no estilo de `retratos.ts`, uma frase e uma ação. É onde o sistema fica "vivo" sem tocar nas cores que querem dizer alguma coisa.

---

## 6. Como medir que melhorou

- **Repetir as fotos** com o mesmo script (`node fotos.cjs`) e comparar par a par.
- **Rodar o `ensaio:celular` e o `ensaio:acessibilidade`** (nos temas claro e escuro, mais os seis outros que ficam) depois das mudanças 2, 3, 6, 7 e 11, porque mexem em cor de fundo de botão e de pílula.
- **Acrescentar ao `ensaio:celular`** a abertura da Acolhe+AI e a medida de sobreposição entre `.linha .hora` e o ponto. Os dois defeitos da seção 4 passaram por ele.
