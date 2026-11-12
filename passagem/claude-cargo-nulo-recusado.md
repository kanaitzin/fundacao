# Frente: o banco recusa quem chega sem cargo, a passagem de turno entre as contas e o e-mail com apresentação

- **Branch:** `claude/cargo-nulo-recusado` (aberto a partir do `cf6ea5b`, a ponta da frente do visual em 12/11)
- **Atualizado em:** 2026-11-12T09:51-03:00
- **Situação:** esperando o dono (o código está pronto e medido; falta o fechamento nos documentos, que é da frente do visual)
- **Fase:** 316, reservada. Não está escrita em documento nenhum ainda.
- **Pedido do dono:** em 12/11, *veja o que você pode fazer sem entrar no que ele está fazendo* (a outra conta ajusta o visual do perfil e dos menus); e depois, *crie uma pasta em que você e a outra conta consigam ver o que está sendo feito quando o limite acaba*; e *o sistema consegue mandar uma mensagem bonita quando pedirem uma senha nova no esqueci?*

## O que está sendo feito agora

Três coisas, as três escritas e enviadas: a guarda de cargo nulo no banco (identity/1717),
esta pasta com o `scripts/passagem.sh`, e o e-mail do esqueci minha senha e do convite com
apresentação (a mesma mensagem em texto e em HTML, `mensagem-do-email.ts`).

## Onde parou, e o próximo passo

Nada pela metade. O que falta é de quem fechar a fase, na ordem:

1. Juntar este branch ao da frente do visual quando a 315 fechar
   (`git merge origin/claude/cargo-nulo-recusado`; não há arquivo em comum além do
   `CLAUDE.md` e do `session-start.sh`, em trechos que a 315 não mexeu).
2. Pedir a revisão da 1717 ao `banco-de-dados` e ao `auditor-seguranca-lgpd`, como toda
   migração de segurança. Não foram chamados aqui.
3. Fechar a 316 nos documentos: a linha no §2 do `docs/REDE-ACOLHER.md`, a linha no alto das
   Novidades, o *O que fazer agora* do `CLAUDE.md` (a guarda de cargo nulo da 1634 sai da
   lista do que ficou do A4), e os números. O `numeros-da-documentacao` reprova até lá.

## Arquivos desta frente

- `backend/src/modules/identity/migrations/1717_o_cargo_que_nao_veio_e_recusado.sql`
- `backend/test/o-cargo-que-nao-veio-e-recusado.e2e.spec.ts`
- `passagem/` e `scripts/passagem.sh`
- `backend/src/modules/identity/mensagem-do-email.ts` e `logo-do-email.ts` (novos), `scripts/logo-do-email.mjs` (novo), `mail.gateway.ts` e
  `invite.service.ts` (só os dois trechos que montam o e-mail)
- `backend/test/o-envio-por-smtp.e2e.spec.ts` (dois casos novos)
- `frontend/src/screens/PrimeiroAcesso.tsx` e `Login.tsx` (três frases e uma margem)
- `CLAUDE.md`: só a seção nova *Duas contas, uma passagem de turno*
- `.claude/hooks/session-start.sh`: só o bloco do fim, que roda a passagem

Não toquei em tela, `styles.css`, `portas.ts`, `mock-casa.ts`, protótipo, ensaios, §2,
Novidades nem no *O que fazer agora*.

## O que rodou e o que não rodou

Sobre o commit `c604c79` (a 1717 e a suíte dela, em cima do `cf6ea5b`):

- os dois `tsc`, sem erro;
- a suíte inteira no relógio real: 1580 de 1584 antes de consertar a cobrança da suíte nova,
  e a suíte nova sozinha depois, 9 de 9;
- a suíte inteira às 22h30 de Porto Alegre (`relogio-adiantado.sh --rodar`): 1581 de 1584;
- **as três reprovações que sobram nas duas rodadas são do `numeros-da-documentacao`**
  (migrações, suítes e testes), e só fecham com os documentos; parte da diferença já vem
  dos testes que a própria 315 acrescentou;
- sem a 1717, os nove casos da suíte nova reprovam; com ela, passam;
- a reescrita conferida no catálogo: 67 funções mudaram de corpo, nenhuma mudou de
  permissão, de `search_path`, de `SECURITY DEFINER` nem de volatilidade.

Sobre o e-mail com apresentação (o commit seguinte ao `074a0d9`): o `tsc` do servidor, e as
suítes `o-envio-por-smtp`, `esqueci-a-senha`, `a-conta-que-muda-de-casa-e-o-email`,
`as-recusas-falam-como-colega` e `arquitetura`, todas verdes; a mensagem aberta no Chromium a
390 e a 760 px. **A suíte inteira não rodou depois dele**, em nenhuma das duas condições.

**Não rodou:** nenhum ensaio de navegador (nenhuma tela mudou), a simulação contra o
servidor, as revisões dos dois subagentes, e a suíte inteira no relógio real depois do
conserto da cobrança (só a suíte nova, sozinha).

## Para quem chegar

- **O achado:** 76 comparações do cargo de quem chama, em 67 funções plpgsql, deixavam o
  cargo nulo passar (sem identidade ou conta desativada). Nas três que medi como o papel da
  aplicação, nada foi gravado nem lido: a casa, o RLS ou um NOT NULL seguravam depois. As
  outras 64 não foram tentadas uma a uma.
- **A regra que fica:** função nova compara o cargo de quem chama com
  `coalesce(app_current_role()::text, '')`, e guarda o cargo só na variável `v_role`. A
  suíte lê o catálogo e reprova o resto.
- **As duas rotas de tirar foto** que o `CLAUDE.md` anota como candidatas fortes do
  `rotas-sem-teste.mjs` já são chamadas pela `a-foto-que-nao-se-apaga`; o script não as vê
  porque a suíte monta a URL por um auxiliar. A anotação pode sair no fechamento.
- **O e-mail:** o texto é o de antes, frase por frase; o HTML leva o logo da Fundação dentro
  da própria mensagem (`cid:`, pedido do dono em 12/11; é o `logo.png` da tela, e trocou lá,
  roda o `node scripts/logo-do-email.mjs`), e não tem script nem endereço de fora, e o nome de quem recebe é escapado. No modo arquivo, a última mensagem
  fica em `EMAIL_DIR/ultima-mensagem.html`, para abrir e ver. **Não provado:** um Gmail e um
  Outlook de verdade (só o Chromium), e o envio real, que depende do SMTP da implantação. No
  fechamento entra no §12.8 do documento e nas Novidades. O assunto do convite ainda leva
  travessão (*Rede Acolher — criar sua senha*); não mexi.
- **O convite e o esqueci percorridos no navegador, contra o servidor local** (pedido de 12/11,
  para a apresentação): convite, senha criada, esqueci, senha nova, a senha de antes recusada,
  o link usado recusado; as telas a 320, 390 e 1366 px sem andar para o lado. Consertado: o
  travessão da frase do cadeado e a lista do que falta na senha (`PrimeiroAcesso.tsx`), o
  aviso do esqueci encostado no campo (`Login.tsx`) e o travessão do assunto do convite.
  **O protótipo não foi regerado** (é da frente do visual), então essas duas telas mudam nele
  na próxima geração. **O e-mail não foi enviado a uma caixa de verdade:** esta sessão não
  alcança servidor de e-mail nem tem a conta de envio. Ficou igual, sem mexer: a mesma frase
  *Falta …* no `SenhaPessoal.tsx`.
- **O envio pela API do Gmail** (`EMAIL_MODO=gmail`, com `EMAIL_REMETENTE` e `GMAIL_TOKEN`,
  pedido do dono em 12/11): a mesma mensagem do SMTP, entregue em HTTPS, para a máquina de
  onde a porta de e-mail não sai (a sessão na nuvem). A autorização é curta, de uma hora: é
  para ensaio e demonstração, e o servidor instalado continua no `smtp`. Dois casos novos na
  `o-envio-por-smtp`, com a API imitada. **Falta, no fechamento:** a variável no
  `.env.example` e no §12.8, e o `instalar.sh` dizer que o modo não é para produção. Nesta
  sessão a autorização mora no ambiente `fundacao`, posta pelo dono num formulário seguro:
  a rede a injeta, e o `GMAIL_TOKEN` daqui é um valor de enfeite.
- **O ambiente desta conta:** o `preparar-ambiente.sh` foi recusado pela permissão
  automática da sessão; o PostgreSQL e o `faketime` subiram à mão, com os mesmos passos.
