# SMTP institucional — o que decidir antes, e o que fazer depois

> **Nada aqui foi executado.** Este documento é a preparação: o que precisa
> ser sabido, decidido e configurado para o convite de primeiro acesso sair de
> verdade. A implantação só acontece com autorização expressa, e depois dela.
>
> Última atualização: 31/08/2026.

## Por que isto trava mais coisa do que parece

O sistema tem **40 pessoas para entrar pela primeira vez**. Sem envio de
e-mail, restam dois caminhos, e os dois são ruins:

- **distribuir senha inicial para 40 pessoas** — que na prática vira mensagem
  de WhatsApp, e o §2 proíbe justamente isso;
- **deixar o e-mail sozinho abrir a criação de senha** — que faz do e-mail a
  senha.

O convite resolve os dois: link de **uso único**, válido por **24 horas**, com
autor registrado. Emitir um convite **embaralha a senha atual e derruba as
sessões** — a partir dali a única porta é o link. Por isso o SMTP não é um
detalhe de infraestrutura: é o que permite a equipe entrar sem que ninguém
mande senha por mensagem.

## Como está hoje

`MailGateway` (`backend/src/modules/identity/mail.gateway.ts`) escreve o
e-mail numa **caixa local** (`EMAIL_DIR`, padrão `/tmp/rede-acolher-email`).
Nada sai para a rede — de propósito: um envio real ligado durante o
desenvolvimento é exatamente o caminho pelo qual um convite de teste chega na
caixa de entrada de alguém da Fundação.

Trocar por envio real **não muda nada** em `InviteService`. O contrato é
enviar.

**Regra que não se negocia:** o log registra que um e-mail saiu, para quem e
por quê — **nunca o corpo, nunca o link, nunca o token**. Token é credencial;
log com token é senha em texto claro num arquivo que várias pessoas leem.

## 1. O que precisamos saber (perguntas para a Fundação)

| # | Pergunta | Por que importa |
|---|---|---|
| 1 | Qual o **provedor de e-mail** do `paodospobres.com.br`? (Google Workspace, Microsoft 365, servidor próprio, outro) | Define o host, a porta e o tipo de autenticação |
| 2 | Qual será o **endereço remetente**? Ex.: `sistema@paodospobres.com.br` ou `nao-responda@…` | Precisa existir como conta ou alias, e não pode ser a conta pessoal de ninguém |
| 3 | **Quem administra o DNS** do domínio? | SPF e DKIM se configuram lá; sem eles o convite cai em spam |
| 4 | **Onde o sistema vai rodar** — servidor da Fundação, nuvem, qual endereço IP de saída? | Alguns provedores exigem liberar o IP; e o link do convite precisa de um endereço acessível pela equipe |
| 5 | A equipe abre o e-mail institucional **no celular da casa** ou só no computador? | Se for só no computador, o primeiro acesso precisa acontecer lá — muda o roteiro do piloto |
| 6 | Existe **política de retenção** de e-mail enviado? | O convite não deve ficar arquivado para sempre: ele é uma porta |

## 2. O que configurar no domínio (antes do primeiro envio)

- **SPF** — autoriza o servidor de saída a enviar em nome do domínio. Sem SPF,
  boa parte dos provedores marca como suspeito.
- **DKIM** — assina a mensagem. É o que impede alguém de mandar um "convite"
  falso em nome da Fundação. **Num sistema cujo e-mail contém link de acesso,
  isto não é higiene: é segurança.**
- **DMARC** — diz ao mundo o que fazer quando SPF ou DKIM falham. Começar em
  `p=none` (só observar) e endurecer depois de uma semana lendo os relatórios.

Sem os três, o convite chega na caixa de spam — e a equipe conclui que o
sistema não funciona.

## 3. O que o sistema vai precisar (variáveis de ambiente)

Nunca no código, nunca no repositório (§3.3, §22):

```
SMTP_HOST=
SMTP_PORT=            # 587 com STARTTLS é o padrão; 465 é TLS direto
SMTP_USER=
SMTP_PASS=            # senha de aplicativo, não a senha da conta
EMAIL_REMETENTE=      # ex.: "Rede Acolher <sistema@paodospobres.com.br>"
APP_URL=              # base do link do convite; precisa ser https
```

**Senha de aplicativo, não a senha da conta.** Se a conta remetente for de uma
pessoa, um dia essa pessoa troca a senha e o sistema para de convidar — no dia
em que alguém novo precisar entrar.

## 4. Como validar sem incomodar ninguém

Nesta ordem, e só depois da autorização:

1. **Caixa local** (como está hoje): confirmar o texto do convite, o prazo de
   24h e que o link funciona.
2. **Servidor de captura** (Mailpit, MailHog ou equivalente, na rede interna):
   prova o caminho SMTP inteiro sem que nada saia para a internet.
3. **Um envio real para UMA caixa de teste** da própria Fundação — nunca para
   a lista da equipe. Conferir: chegou? Caiu em spam? O link abre no celular
   da casa?
4. **Só então** o primeiro convite de verdade, para uma pessoa, com ela ao
   lado.

⚠️ **Nunca rodar um teste de envio com a lista real da equipe.** Quarenta
convites disparados por engano derrubam as sessões de quarenta pessoas e
embaralham as senhas de todas — no meio de um turno.

## 5. O que fica pendente depois

- **Reenvio de convite**: hoje emitir de novo cancela o anterior (um convite
  ativo por pessoa, por índice único). Vale confirmar com a coordenação se é
  isso que ela espera quando alguém diz "não chegou".
- **Quem convida não vê o link.** É de propósito. Quando alguém disser "não
  chegou", a coordenação vai querer reenviar, e não ler o link — vale dizer
  isso no treinamento antes que alguém peça.
- **Falha de envio**: o `EMAIL_MODO=falha` já existe para teste. Falta decidir
  o que a coordenação vê quando o servidor de e-mail está fora — hoje ela vê o
  erro; talvez deva ver "o convite não saiu, tente de novo em alguns minutos",
  e o convite continuar válido.
