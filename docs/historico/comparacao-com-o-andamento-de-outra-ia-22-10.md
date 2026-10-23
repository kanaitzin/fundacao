# O andamento da outra IA, conferido contra a Rede Acolher daqui (22 e 23/10/2026)

Pedido de 22/10: *"na IA concorrente tô fazendo o mesmo sistema; confira se fizemos tudo
isso aqui, para superarmos o que tá sendo feito no chat"*. A fonte é o PDF
*Rede Acolher, Andamento, Testes e Pendências, 22/10/2026* (77 páginas): as 42 etapas, o
histórico de 230 entregas de 05 a 22/10 e 108 manifestos de validação. Cada linha abaixo
foi conferida contra o código deste repositório, e não contra a memória.

## O retrato em uma frase

Lá, o que está pronto é **código com testes de unidade em SQLite na memória**. Os 30
arquivos que testam o servidor de verdade nunca rodaram (o Windows recusa com EPERM), a
compilação de produção não fecha, nenhuma tela foi percorrida no navegador (as etapas 05 a
09 estão em 0 de 38) e nada foi publicado. Aqui, a suíte roda **no PostgreSQL de verdade,
com as políticas de acesso (RLS) ligadas**, duas vezes, uma delas com o relógio depois das
21h; o protótipo e o servidor compilam; e as telas são percorridas no navegador, também
contra o servidor de verdade, em simulações de até um ano com as oito casas.

## As 42 etapas, uma a uma

| Etapa deles | Estado lá | Aqui |
|---|---|---|
| 01 compactar o conhecimento da Acolhe | feito | feito: guia fixo, nota do momento por pergunta (223), catálogo cobrado por teste que nega por padrão (193) |
| 02 alertas de dependências | bloqueado | sem bloqueio: dependências instaladas e travadas pelo `package-lock` |
| 03 compilação de produção | bloqueado (EPERM) | feito: `npm run prototipo`, o servidor compilado e o `ensaio:producao` |
| 04 os 30 testes do servidor de verdade | 0 de 30 | **153 suítes e 1344 testes no PostgreSQL de verdade**, mais as sondagens permanentes entre casas (250 leituras e cerca de 170 escritas, com a prova no banco) |
| 05 portaria e visitas no navegador | 0 de 8 | feito: `ensaio:uso` (mais de 700 cobranças), o `roteiro` (56 tarefas) e o `ensaio-servidor` contra o servidor de verdade |
| 06 acolhidos, família, saída e retorno | 0 de 6 | feito, nos mesmos ensaios (perfil em abas, familiares corrigidos com o antes guardado, retorno de quem saiu) |
| 07 agenda, escala, passagem e ATA | 0 de 8 | feito, nos mesmos ensaios e no calendário das ATAs |
| 08 cozinha e indicadores | 0 de 8 | feito: pedido para todos ou alguns, edição, cancelamento, entrega, rotina, período livre |
| 09 saúde, internação e relatos técnicos | 0 de 8 | feito, incluindo o diário com até 10 anexos (233) |
| 10 todas as telas no celular | esperando aparelho | **simulado aqui**: `ensaio:celular` (oito cargos, 360 e 390 px, 320 telas) e `uso-celular`. Aparelho de verdade: falta aqui também (PARA-A-REUNIAO §4.27) |
| 11 câmera, várias fotos e PDF | esperando aparelho | **simulado aqui**: `ensaio:aparelhos` com oito aparelhos, câmera em sequência e modo Documento em PDF (194, 233). Aparelho de verdade: falta aqui também |
| 12 ditado e leitura por voz | esperando aparelho | **simulado aqui**, com o jeito do Safari e do Chrome do Android (222). Voz de verdade: falta aqui também |
| 13 Word, gráficos e planilhas | 0 de 6 | Word: feito, e **cada um dos 21 Words é aberto e cobrado pela suíte** (233). Gráfico dentro do Word e planilha dos relatórios: **não temos** (ver abaixo) |
| 14 backup e restauração | 0 de 4 | feito: `backup.sh`, `restaurar.sh --ensaio`, arquivo contínuo, volta a qualquer minuto e cópia das fotos, provados pelo `ensaio:ponto-no-tempo` (220) |
| 15 migrações sem perda | 0 de 5 | feito: a migração guarda a soma de cada arquivo e para se um aplicado mudar, com trava e um executor só (219) |
| 16 publicar | bloqueado | pronto para instalar (`instalar.sh`, serviço, proxy, §12.0); publicar espera a autorização e a máquina do Pão |
| 17 a 20 modelo local (Ollama) | esperando máquina | **outro caminho, decidido pela Fundação em 08/10**: o Claude pela chave institucional. Testado aqui com modelo de mentira através do servidor (224). Modelo local seria decisão nova (ver abaixo) |
| 21 voz e prévia em todo formulário | feito | feito: ditado em todo campo de texto longo (195) e rascunho que se confere antes de ir à tela |
| 22 OCR local com conferência | 4 de 5 | **não temos** (ver abaixo) |
| 23 campos do cadastro a partir de documento | feito | **não temos** (depende do 22) |
| 24 a 31 a Acolhe+AI fazendo cadastro, portaria, agenda, cozinha, internação, ATA e escala | feito | **por outro desenho, mais seguro**: aqui a Acolhe+AI abre o formulário e preenche à vista, e a pessoa salva (36 formulários, todos abertos por ela nos nove cargos, 196); ela nunca grava. Lá ela prepara e a pessoa confirma num cartão. Os dois exigem a pessoa; aqui o que fica gravado passou pelas mesmas regras da tela |
| 32 separar o texto técnico antigo do JSON | feito | não se aplica: aqui não houve JSON de demonstração com conteúdo real |
| 33 instalação real isolada | 3 de 5 | pronto: banco que nasce sem semente, instalador que confere sem mudar nada e banco de demonstração separado para o treino (227) |
| 34 primeira conta administrativa | esperando decisão | caminho escrito no §12.0; espera quem será a primeira conta |
| 35 administração por casa | 0 de 5 | feito: coordenação administra a equipe da própria casa, e a tomada de conta entre casas foi achada e fechada (156) |
| 36 operação entre casas | 0 de 5 | feito: Coordenação Geral (176), Gestor Geral com as oito, Enfermagem nas casas do alcance, e as sondagens permanentes |
| 37 retenção e classificação dos arquivos | esperando decisão | espera decisão aqui também; hoje **nada se apaga** |
| 38 rascunhos e operação sem internet | 0 de 5 | **em boa parte feito**: a fila do aparelho guarda o registro sem sinal e sobe com a identidade de quem escreveu (168). Falta a fila cifrada (DPO) |
| 39 árvore familiar geracional | 0 de 5 | **não temos**: há familiares, contatos e a nota sobre irmãos, sem árvore |
| 40 remédios e estoque | esperando decisão | **feito aqui**: armário com saldo, lote, validade, descarte, nota fiscal com CNPJ e relatórios em Word (161) |
| 41 depósito e materiais | esperando decisão | não temos; espera decisão |
| 42 notas fiscais e finanças | esperando decisão | só a nota fiscal do remédio (161); finanças esperam decisão |

**Na conta seca:** das 42 etapas deles, 12 estão concluídas lá. Aqui, 30 têm o
equivalente feito e provado, quatro estão simuladas (celular, câmera, voz e modelo, que
pedem aparelho ou chave de verdade nos dois lados) e oito não temos ou esperam decisão:
OCR, campos a partir de documento, gráfico e planilha nos relatórios, árvore familiar,
retenção, depósito, finanças e o modelo local.

## O que vale trazer de lá

Itens que eles têm, ou testam, e nós não:

1. **Ler o texto de uma foto ou PDF de papel (OCR) no próprio aparelho**, com o texto
   mostrado ao lado da imagem e editável antes de qualquer uso. Serve para o ofício do
   Judiciário, a receita, a guia. Pede uma biblioteca pesada (o Tesseract em português, uns
   15 MB) e decisão de onde roda; no aparelho é o que menos expõe.
2. **Sugerir os campos do cadastro a partir do documento conferido** (nome, nascimento,
   filiação), sempre editáveis e com a pessoa escolhendo, sem juntar pessoas sozinho.
3. **Gráfico dentro do Word** do período da casa e da cozinha, e **planilha (CSV ou Excel)**
   dos números da casa. Hoje a planilha existe só na tabela que a Acolhe+AI monta. Planilha
   de dado de criança circula fácil: é pergunta para o DPO.
4. **Árvore familiar entre gerações**, com irmãos acolhidos em outras casas e retornos,
   sempre confirmada por profissional.
5. **Teste de anexo com instrução escondida** (o documento que diz *ignore as regras*).
   Aqui a Acolhe+AI já não tem como gravar nada por construção, e o guia manda tratar o que
   vem das ferramentas como dado; falta dizer o mesmo do anexo que a pessoa manda e cobrar
   por teste. **Este não depende de ninguém, e entra na próxima rodada.**
6. **Modelo de IA local (Ollama) num computador do Pão**, sem enviar texto para fora. A
   Fundação aprovou o Claude em 08/10; o local pede uma máquina com placa de vídeo e
   responde pior em português. Fica como opção para a reunião, não como troca.

## O que eles não têm e nós temos

Nada disto aparece no PDF:

* acessibilidade medida (WCAG 2.1 AA, 1312 telas em oito temas, sem violação);
* simulações de uma casa por um ano e das oito casas com vinte pessoas cada por seis
  meses, com os relatórios conferidos contra o que as casas contaram;
* as sondagens de alcance entre casas, permanentes, com registro real;
* o banco cobrado no catálogo (as duas travas da autoria, chave sem índice, UPDATE sem
  política) e o servidor que sobrevive ao banco que reinicia;
* aviso no celular com o sistema fechado, o que mudou desde o meu último plantão, o Guia
  do sistema, os oito temas e a saúde da implantação;
* o armário de remédios inteiro, que lá ainda espera decisão.

## O que não se traz

O PDF descreve conta de demonstração do Marcelo com senha de teste preservada no endereço
publicado, e a publicação no mesmo endereço do piloto. Aqui a regra é não publicar sem
autorização expressa e não usar dado real; o caminho certo é o §12.0, numa máquina do Pão.
