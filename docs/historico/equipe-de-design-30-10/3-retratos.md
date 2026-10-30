# 3. Os retratos do protótipo: diagnóstico e proposta

Ilustração. Feito só no scratchpad, sem mexer no repositório, sem teste nem banco.

Pasta: `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/retratos/`

| Arquivo | O que é |
|---|---|
| `atual/grade-atual.png`, `atual/zoom-atual.png` | os retratos de hoje (`frontend/src/retratos.ts`), em 120 px e no círculo de 44 px |
| `antes-tela.png`, `antes-tela-celular.png` | a tela Acolhidos do protótipo como está (1366 e 390 px) |
| `depois-tela.png`, `depois-tela-celular.png` | a mesma tela com os retratos novos, trocados na página aberta (semente = nome civil, idade do `mock-casa.ts`) |
| `amostras.png` / `.html` | **a grade de 24**: bebês, crianças, adolescentes, equipe e idosos, cada um em 120 px e no círculo de 44 px |
| `sorteio.png` / `.html` | 24 retratos só pela semente (sem escolher nada), para ver a distribuição real |
| `silhueta.png` / `.html` | a linguagem C (o mesmo desenho sem os traços do rosto) |
| `retratos-novo.ts` | **o gerador proposto** (mesma API do atual, mais um terceiro argumento opcional) |
| `retratos-novo.min.js` | o mesmo minificado: 10,4 KB, 4,0 KB em gzip |

Os scripts de render ficam em `.../scratchpad/design/` (`render-atual.mjs`, `render-novo.mjs`, `tela.mjs`, `checar.mjs`).

## 1. Por que os retratos de hoje parecem amadores

Medido no código e olhado nas imagens (`atual/`):

1. **Um rosto só, recolorido.** A geometria é a mesma para todo mundo: elipse, dois pontos, o mesmo sorriso. Muda só a cor e o "chapéu" de cabelo. Vinte crianças lado a lado parecem clones, o que é o oposto do que a foto de identificação serve para fazer.
2. **A idade não existe.** O gerador recebe só `menina`/`menino`. Um bebê de 1 ano e um adolescente de 17 saem com a mesma cabeça, o mesmo pescoço e os mesmos ombros. O `mock-casa.ts` nem passa a idade, e ela está no cadastro.
3. **O cabelo é um capacete posto em cima da cabeça.** A franja termina numa reta ou numa ponta solta. O "longo" é um retângulo atrás das orelhas com laterais verticais. O "black" é um círculo inteiro atrás da cabeça, sem linha de cabelo na frente, e fica parecendo auréola ou chapéu de sol. O "cacheado" masculino é uma coroa de bolinhas, e o coque é uma bola solta acima da cabeça.
4. **A cor do cabelo é sorteada à parte da pele.** Sai loiro-mel em pele retinta com frequência (Bruno e Kauã na tela). E a sobrancelha é pintada da cor do cabelo, então o loiro numa pele escura vira duas manchas claras.
5. **A boca é um traço carmim grosso (`#9F1239`) igual em todos.** Parece batom em criança e sorriso de emoji. A bochecha é rosa-chiclete (`#F472B6`) com transparência: na pele escura ela vira mancha arroxeada.
6. **Roupa saturada nas cores de estado da tela.** A paleta das roupas é a do Tailwind 600: `#DC2626` (vermelho), `#D97706` (âmbar), `#EA580C` (laranja). No cartão da lista, a camiseta vermelha fica ao lado da pílula vermelha de alerta, e a cor da roupa passa a disputar com a cor que diz *isto precisa de alguém*. Fere o espírito da regra das cores (`cargos.tsx`).
7. **Fundo e roupa sorteados sem harmonia.** Camiseta vermelha em fundo rosa, verde-lima em fundo verde: os pares brigam.
8. **Pescoço e gola soltos.** O pescoço é um retângulo de outra cor e a gola é um traço que flutua sobre a roupa. No tamanho grande, a cabeça parece colada no corpo.
9. **O enquadramento é largo para o círculo de 44 px.** Sobra fundo e o rosto fica pequeno na lista.

## 2. Referências de licença aberta

Conferido nos arquivos `LICENSE` de cada estilo no repositório do DiceBear (`packages/@dicebear/<estilo>/LICENSE`, pelo raw.githubusercontent.com). **O site dicebear.com não abre nesta sessão** (domínio fora da rede permitida). O código do DiceBear é MIT. **A licença do DESENHO muda por estilo**:

| Estilo | Autor | Licença do desenho | Atribuição |
|---|---|---|---|
| Open Peeps | Pablo Stanley | **CC0 1.0** | não exige |
| Notionists / Notionists Neutral | Zoish | **CC0 1.0** | não exige |
| Lorelei / Lorelei Neutral | Lisa Wischofsky | **CC0 1.0** | não exige |
| Thumbs | DiceBear | **CC0 1.0** | não exige |
| Adventurer / Adventurer Neutral | Lisa Wischofsky | CC BY 4.0 | exige crédito |
| Micah (Avatar Illustration System) | Micah Lanier | CC BY 4.0 | exige crédito |
| Big Smile | Ashley Seo | CC BY 4.0 | exige crédito |
| Big Ears | The Visual Team | CC BY 4.0 | exige crédito |
| Personas | Draftbit | CC BY 4.0 | exige crédito |
| Croodles | Vijay Verma | CC BY 4.0 | exige crédito |
| Miniavs | Webpixels | CC BY 4.0 | exige crédito |
| Fun Emoji | Davis Uche | CC BY 4.0 | exige crédito |
| Avataaars | Pablo Stanley | "livre para uso pessoal e comercial" (texto próprio, não é licença padrão) | evitar: termos vagos |
| Avataaars Generator (o código React) | Fang-Pen Lin | MIT (só o código) | o desenho segue o caso acima |
| boring-avatars | boringdesigners | MIT | aviso MIT; são formas abstratas, sem rosto |
| Humaaans | Pablo Stanley | CC BY 4.0 (fonte secundária: página da UCSF que a usa; o site oficial não foi lido) | exige crédito |

Leitura para o projeto:
- **O que serve sem amarra:** Open Peeps, Notionists e Lorelei (CC0). Mas são desenhos prontos, em peças de SVG de dezenas de KB. Embutir o conjunto pesa no arquivo único, e o traço deles (linha preta, estilo Notion) é adulto e de escritório: quase não há criança pequena, bebê nem cabelo crespo ou trança bem resolvidos.
- **Os CC BY servem com crédito**, mas crédito numa tela de acolhimento é ruído, e o Micah e o Big Smile têm a mesma limitação de idade.
- **Por isso a proposta é um gerador próprio**, escrito do zero, sem copiar forma nenhuma desses conjuntos. Eles serviram de referência de linguagem (formas chapadas, poucos traços, paleta contida), não de arte.

## 3. As linguagens possíveis

**A. Recorte editorial (a prototipada).** Formas chapadas e orgânicas, sem contorno, paleta terrosa e apagada, rosto com cinco traços (olhos, sobrancelha, nariz, boca, rubor). É a linguagem de ilustração editorial e de produto de saúde e educação. Lê bem a 44 px, aguenta a diversidade de cabelo pela silhueta e tem calor humano sem ficar realista.

**B. Traço contínuo (linha sobre mancha), à maneira do Open Peeps.** Um traço escuro único desenhando o rosto e o cabelo sobre uma mancha de cor deslocada. Muito elegante grande, mas o traço some ou embola a 44 px, e o cabelo crespo e a trança pedem traço à mão, que é difícil de gerar bem por procedimento. Fica como alternativa se a Fundação quiser algo mais "caderno".

**C. Silhueta sem rosto** (`silhueta.png`). O mesmo desenho da A, sem olhos, nariz e boca. É a opção de mais privacidade e mais sóbria (lembra pictograma de sinalização), e a criança continua reconhecível pelo cabelo, pela pele e pela roupa. Perde calor: o psicólogo da equipe pode preferir a A para a lista do dia a dia, e a C para documento ou impressão. Custa zero: é a A com o grupo `#rosto` tirado.

## 4. O gerador proposto (linguagem A)

`retratos-novo.ts`, **mesma API do atual** (`retratoSvg(semente, feitio)` e `retratoFicticio(semente, feitio)`), mais um terceiro argumento opcional `{ idade, pele, cabelo, cor, oculos }`. Sem dependência, determinístico pela semente (o mesmo sorteio FNV + mulberry do atual). Em 3.000 sementes e todas as idades: nenhum `NaN`, SVG médio de 1,8 KB e máximo de 2,8 KB.

- **A idade muda o corpo** (0 a 17, e adulto): o bebê tem cabeça quase redonda, olhos mais baixos, sem pescoço e de macacão com botões; a criança vai alongando o rosto; o adolescente e o adulto têm queixo, pescoço e ombros largos. Bebê de olhos fechados sorrindo às vezes, nunca triste.
- **Oito tons de pele**, do muito claro ao retinto. A sombra, a boca e o rubor saem da própria pele, misturada, e não de uma cor fixa. Na pele escura o rubor é mais claro e quente, e não vira mancha.
- **A cor do cabelo depende da pele**: pele escura dá preto e castanho-escuro; o loiro e o ruivo aparecem só nas peles claras. A sobrancelha é o cabelo escurecido.
- **Catorze penteados como silhuetas que emolduram o rosto**: liso, ondulado, chanel, rabo, coque, puffs (os dois coquinhos), crespo (black), cacheado, tranças (com a textura das tranças), nagô (com o coque na versão feminina), curto, raspado (justo ao crânio, com a linha de cabelo arredondada), careca com laterais (idoso) e o cabelinho de bebê (liso com topete ou enroladinho). A escolha é ponderada pela pele e pelo feitio, sem regra rígida.
- **Expressão serena:** boca pequena da cor da pele, fechada ou com sorriso leve, sem dente, sem carmim.
- **Roupa em tons apagados** (azul, sálvia, lavanda, petróleo, terracota, rosa antigo, ardósia, oliva, marinho, bege, ocre): nenhuma é o vermelho nem o âmbar das pílulas de estado. Gola careca, em V ou moletom com cordão.
- **Fundo claro com um círculo mais claro atrás do ombro**, que dá profundidade sem virar auréola.
- **Enquadramento fechado** (`viewBox="16 13 88 88"`): o rosto ocupa o círculo de 44 px.
- Óculos e barba para a equipe, cabelo branco ou grisalho para os idosos.

**Para integrar** (quando a Fundação aprovar, e numa fase com os ensaios):
1. trocar o conteúdo de `frontend/src/retratos.ts` pelo `retratos-novo.ts` (API compatível);
2. no `mock-casa.ts`, passar a idade: `retratoFicticio(k.civil, feitio, { idade: k.idade })`. Opcional: quando o cadastro fictício tiver `raca`, mapear para a faixa de pele (`branca` 0 a 2, `parda` 3 a 5, `preta` 5 a 7), para a Alice cadastrada como branca não ser desenhada retinta;
3. rodar o `ensaio:uso`, o `ensaio:celular` e o `ensaio:acessibilidade` (a imagem tem `alt=""`, então o axe não muda, mas a tela muda).

**Achados de passagem** (no código de hoje, não consertados): o `mock-casa.ts` não passa a idade ao retrato; e as cores das roupas `#DC2626`, `#D97706` e `#EA580C` coincidem com a família das cores de estado.

**Limites:** não testei no protótipo compilado (troquei as imagens na página aberta, sem recompilar) nem em tema escuro ou alto contraste. Avaliar se o desenho é digno e sereno é decisão da Fundação: o olhar do psicólogo e do coordenador sobre a grade é o próximo passo.
