# O que falta — atualizado em 04/09/2026

> Este documento vinha de 02/09 e não conhecia nada do que foi construído
> depois. Vale mais como lista do que ESPERA GENTE do que como lista de código.

## O que espera decisão da Fundação, e por isso não foi construído

Cada uma destas tem a rota ou o desenho pronto, e a porta parada — e agora isso
está escrito também no código, ao lado da rota (`test/rotas-sem-porta.spec.ts`).

1. ~~**A medicação a qualquer horário**~~ — **respondida em 08/09/2026** e
   construída na mesma data (fase 72): o horário previsto existe, a Enfermagem
   atende das 9h às 17h e o educador de plantão dá o resto. Sobra uma pergunta
   pequena: "administrado com atraso" é informação útil para a Enfermagem ou
   cobrança injusta com quem estava com uma criança no colo?
2. **As fontes do acompanhamento** (§7.7). `POST /followups/:id/sources` existe
   e não tem tela: de onde a técnica escolhe as fontes é justamente o que não
   foi respondido.
3. **A leitura excepcional de relato protegido** (§7.6).
   `POST /statements/:id/exceptional-read` existe, auditada, sem porta: falta
   saber o que o Gestor Geral vê ANTES de abrir.
4. **Quem lê a ATA Geral de dia** (§7.2). A correção da linha de uma casa
   (`PATCH /shifts/general-ata/:id/house/:houseId`) espera essa resposta.
5. ~~**O código do aparelho da casa**~~ — a pergunta **deixou de existir** em
   08/09: o sistema roda no celular de cada pessoa, e dose não se confirma sem
   sinal em aparelho nenhum.
6. **O PIA** — se as datas são por criança e se o sistema deve avisar.
7. **A Enfermagem vê a internação?** Decisão minha, a confirmar numa linha.

## O que é meu e ficou pequeno

- As **fontes do protótipo**: o arquivo busca duas fontes da rede e, offline,
  cai na do aparelho. Embutir custa ~300 KB (decisão §7.12).
- ~~O comprovante da conquista~~ — **feito na fase 66**, junto com o anexo do
  diário da internação: os dois guardavam arquivo e não tinham rota de
  leitura.

## O que não é código

- **Implantação**: onde roda, backup com restauração testada (feito), SMTP,
  dados de partida, LGPD, aparelhos. Ver `implantacao.md`.
- **Piloto**: treinamento, critérios de aceite, plano de volta atrás, quem
  atende quando quebrar às 23h.
- **E o que mais vale:** ninguém que não construiu o sistema abriu o protótipo
  ainda. Seis ensaios de navegador não medem hesitação.

## O que foi construído desde 02/09, e saiu desta lista

Fila offline no aparelho · folhas em Word saindo do servidor com a saída
registrada · backup e restauração provada · acessibilidade nas 114 telas ·
ensaio de carga (as três telas mais abertas respondiam em 8,5 s) · cadastro com
filiação, RG, CNS, foto e contatos · chave do processo no cofre · internação
hospitalar inteira · trabalho social das oito casas, com relatório e trajetória
· o sistema subindo compilado · a recusa de subir com o RLS desligado.
