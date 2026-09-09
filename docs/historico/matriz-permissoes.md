# Matriz de permissões e escopo (Fase 1)

Fonte: Prompt Master §5 e §5.13. Esta matriz é aplicada em **duas camadas**:
guards/serviços na API e políticas RLS no banco. Escopos transversais são
limitados à **finalidade** do cargo na camada de aplicação.

## Escopo de casas

| Papel | Casas visíveis | Condição | Finalidade |
|---|---|---|---|
| Educador social | própria casa | plantão (janela T±10, `observe` no piloto) | operação do plantão |
| Líder Diurno | própria casa | plantão ativo | operação + fechamento ATA |
| Equipe técnica | própria casa | escala individual (pendência 33.4.3) | técnica |
| Coordenador | própria casa | sem limite de horário | gestão integral da casa |
| Educador volante | própria casa | plantão | operação (deslocamento é do acolhido, não do educador) |
| Enfermagem | **8 casas** | escala própria | somente saúde |
| Líder Noturno Geral | **8 casas** | durante o turno (19h–7h, preliminar) | operacional mínimo |
| Gestor Geral | **8 casas** (abre 1 por vez, auditado) | sem limite | institucional |
| Cozinha | — | — | somente relatório mínimo de alimentação |
| Admin técnico | infraestrutura | emergencial, temporário, auditado | sem acesso comum ao negócio |

## Capacidades por papel (resumo — cresce por fase)

| Capacidade | Edu | Líd.D | Téc | Coord | Enf | Líd.N | Gestor |
|---|---|---|---|---|---|---|---|
| Ver linha do tempo/visão dos 20 | ✅ | ✅ | ✅ | ✅ | saúde | mínimo | ✅ |
| Criar/alterar agenda regular | — | urgente pontual | ✅ | ✅ | — | urgente pontual | — |
| Confirmar medicamento | ✅ se administrou | ✅ se administrou | — | — | ✅ se administrou | — | — |
| Cadastrar e ativar esquema de medicamentos | — | — | ✅ | ✅ | ✅ | — | — |
| Marcar medicamento como exclusivo da Enfermagem | — | — | — | ✅ | ✅ | — | ✅ |
| Editar perfil estrutural do acolhido | — | — | ✅ | ✅ | saúde | — | — |
| Ver narrativas pessoais de educadores | próprias | não navega | ✅ | ✅ | — | não | apuração formal |
| Criar/desativar usuários | — | — | — | ✅ própria casa | — | — | ✅ com auditoria |
| Dados bancários/benefícios | — | — | — | ✅ casa atual + reauth | — | — | ✅ + reauth |
| Baixar Resumo de Saúde | plantão | própria casa | própria casa | própria casa | 8 casas | 8 casas no turno | ✅ |
| Assinar passagem de plantão | ✅ a própria | ✅ a própria | — | — | — | ✅ a própria | — |
| Confirmar recebimento do turno | ✅ individual | ✅ individual | — | — | — | ✅ individual | — |
| Fechar ATA | assina a própria passagem | ✅ diurna | ✅ | ✅ | — | ✅ noturnas + Geral | — |
| Reabrir/corrigir ATA fechada | — | — | ✅ com motivo | ✅ com motivo | — | — | — |
| Abrir ocorrência | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Encerrar etapa operacional da ocorrência | — | ✅ | ✅ | ✅ | — | ✅ | — |
| Validar ocorrência crítica (fechar) | — | — | ✅ | ✅ | — | — | — |
| Ver fala espontânea / sinais observados | autor | — | ✅ | ✅ | se saúde | — | — |
| Abrir anexo restrito | autor | — | ✅ | ✅ | doc. médico | — | — |
| Registrar comunicação externa | — | — | ✅ | ✅ | — | — | — |
| Ver caixas de transferência (recebidas / da casa) | — | — | ✅ | ✅ | — | — | ✅ |
| Conversar com a outra coordenação sobre uma transferência | — | — | ✅ | ✅ | — | — | ✅ |
| Aceitar ou recusar transferência | — | — | ✅ destino | ✅ destino | — | — | ✅ |
| Catálogo das unidades (para escolher destino) | — | — | ✅ | ✅ | — | — | ✅ |
| Aprovar comunicação externa | — | — | ✅ | ✅ | — | — | ✅ |
| Auditoria (leitura) | — | — | — | própria casa | — | — | ✅ |
| Registrar conclusão **pelo colega** (autoria dupla) | — | ✅ | — | ✅ | — | ✅ | ✅ |
| Delegar atividade em aberto a outro educador | — | ✅ | — | ✅ | — | ✅ | ✅ |
| Autorizar ou **recusar** substituição | — | ✅ | ✅ | ✅ | — | ✅ | — |
| Ver o painel do plantão (quem está em quê) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Convidar para o primeiro acesso | — | — | — | ✅ própria casa | — | — | ✅ |
| Ler a escala de plantão da casa | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Ler a ATA do turno anterior | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Escrever linha na ATA do turno | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ler e escrever a linha RESTRITA da ATA | — | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Montar a escala (escalar, retirar, folha) | — | — | — | ✅ própria casa | — | — | ✅ |

**Quem dá o remédio (atualizado em 08/09/2026, migração 0930).** A Enfermagem
atende das **9h às 17h**; fora desse horário quem administra é o **educador de
plantão**, conforme a bula do acolhido. Não há protocolo por período nem
autorização nominal: o que existe é a **exceção por medicamento**, marcada no
esquema com motivo escrito — e o educador barrado lê esse motivo. Confirmar
continua sendo de quem administrou, uma dose por vez.

**Onde ele confirma (corrigido em 09/09/2026, fase 75).** Na **linha do tempo**
— a tela do Dia —, que é onde a dose chega para ele; a tela de Saúde não está no
alcance do cargo. Até esta data a dose aparecia lá **sem botão**, e a decisão da
Fundação era, na prática, impossível de cumprir dentro do sistema. A dose
marcada como exclusiva continua aparecendo na linha de quem não pode dá-la, sem
botão e **com o motivo escrito ao lado**: ela precisa saber que há remédio às
22h para chamar quem pode.

## Regras invariantes

- Conta individual; ninguém assina ou confirma por outro (§5.1, §11.2, §12.1).
  **Uma exceção, com forma própria:** o líder do turno e a coordenação podem
  REGISTRAR a conclusão de uma atividade comum por um educador que a realizou e
  não conseguiu registrar (aparelho da casa sem sinal, e ele não usa o próprio
  celular). Isso não é assinar por outro: o registro guarda os DOIS nomes —
  quem realizou e quem registrou — mais o motivo, e toda tela mostra os dois
  juntos. O nome de quem operou o sistema nunca é substituído.
  **A exceção não alcança dose de medicamento (§11.2) nem chamada (§10):** numa,
  a confirmação individual é a proteção da criança; na outra, quem marca
  presença é quem olhou a criança. Líder marcando por outro transformaria a
  conferência em formulário.
- Substituição tem os dois lados: autorizar e **recusar**, esta com motivo
  obrigatório, porque quem pediu vai ler. O sistema não fecha pedido sozinho —
  nem o pedido cuja atividade já foi concluída enquanto ele aguardava; esse
  aparece marcado na lista do líder, explicado, para ele recusar.
- Primeiro acesso é por convite de **uso único e prazo de 24 horas**, enviado ao
  e-mail institucional. Quem convida não vê o link. Emitir convite embaralha a
  senha atual e derruba as sessões: a partir dali a única porta é o link.
- O painel do plantão mostra quem está em quê AGORA, para toda a equipe. Não é
  medição: sem contagem por pessoa, sem ordenação por desempenho, sem histórico
  de deslocamento (§3.3).
- Fora de escopo = **404 idêntico a inexistente** (não vaza existência).
- Acesso excepcional (gestor → narrativa pessoal) exige finalidade, justificativa,
  **reautenticação** e auditoria destacada (§5.2).
- Desligado = desativado; autoria e histórico preservados (§5.1).
- Alterar relógio do aparelho não amplia acesso (§5.12) — janela avaliada no servidor.
- **A linha restrita da ATA** (0970) é fechada no banco, e não na tela. Quem
  não a alcança recebe a CONTAGEM — "há 2 observações restritas à coordenação"
  —, e nunca o texto: sumir por completo criaria a impressão de que não existe
  (precedente do §13.7).
- **A escala informa, não bloqueia** (0950). Ela diz quem devia estar no
  plantão; quem cobriu um turno fora dela assina a passagem do mesmo jeito, com
  o aviso de que não constava. Retirar alguém de plantão que já passou exige
  motivo escrito, e nada é apagado — nem pelo dono do banco.
- **Dose não se confirma sem sinal, em aparelho nenhum** (0930). O sistema roda
  no celular de cada pessoa: sem o aparelho único da casa, guardar confirmação
  de dose devolveria a mesma dose confirmada em dois lugares. O resto do turno
  funciona offline.
- Ninguém assina a passagem de outro, e o recebimento do turno é individual (§12.1, §12.3);
  confirmar recebimento **não** significa concordar com narrativa alheia.
- ATA fechada não é sobrescrita: correção é adendo com antes e depois (§12.7).
- Violência ou suspeita, contenção, erro de medicamento e emergência de saúde **não se
  encerram** sem validação técnica ou de coordenação (§13.5).
- Nenhuma comunicação sai do sistema para órgão externo: registro, aprovação e entrega
  humana registrada — não existe envio automático (§13.6).
