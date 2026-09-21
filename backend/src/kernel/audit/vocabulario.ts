/**
 * O QUE A AUDITORIA DIZ, EM PORTUGUÊS — e por que isto é um arquivo só.
 *
 * A fase 112 abriu a auditoria para leitura, e escreveu junto um mapa de
 * rótulos com dezoito entradas. A varredura da fase 115 mediu esse mapa contra
 * o código e achou duas coisas:
 *
 *  * o sistema grava **170 ações diferentes**, e o mapa cobria **treze**. As
 *    outras cento e cinquenta e sete chegavam à tela da coordenação como o
 *    código cru — `medication.leave_with_child`, `auth.login_failed` —, que é
 *    inglês de programador na leitura do rastro de uma criança;
 *  * e **cinco das dezoito entradas não casavam com ação nenhuma**:
 *    `person.update` (a real é `person.profile_update`), `person.correct`
 *    (`person.correct_identity`), `benefit.view` (`benefits.view`),
 *    `credential.open` (`credential.reveal`) e `access.exceptional`
 *    (`statement.read_exceptional`). Todas **próximas** de uma ação real e
 *    nenhuma igual a ela — que é a assinatura de quem escreveu de memória, e
 *    não lendo o código.
 *
 * **E vinte e cinco dessas ações não saem do TypeScript: saem do SQL**, de
 * dentro de funções `SECURITY DEFINER` — `credential.reveal`,
 * `incident.attachment_open`, `staff.create`, `transfer.decline`. São as mais
 * sensíveis, e estão no banco exatamente para que nenhum caminho da aplicação
 * escape delas; um conferidor que lesse só o TypeScript daria verde e deixaria
 * de fora a revelação de uma senha do cofre.
 *
 * **O defeito não era o mapa curto; era não haver nada que o mantivesse
 * ligado ao código.** Por isso o remédio não é "escrever mais rótulos": é
 * `vocabulario-da-auditoria.spec.ts`, que reprova nas duas direções — ação sem
 * frase, e frase sem ação. Rótulo que sobra é tão defeito quanto rótulo que
 * falta, porque é a prova de que ninguém conferiu.
 *
 * ---
 *
 * COMO ESCREVER UMA FRASE AQUI
 *
 * Quem lê é a coordenadora, meses depois, tentando entender um registro na
 * vida de uma criança. Então:
 *
 *  * **fato no particípio, sem julgamento:** "Contenção registrada", nunca
 *    "Contenção aplicada pela educadora";
 *  * **sem nome de pessoa e sem nome de criança** — os dois já vêm na linha,
 *    de colunas próprias;
 *  * **a palavra da casa, não a da tabela:** "Passagem de plantão assinada",
 *    e não "handover assinado";
 *  * **e a frase diz o que ACONTECEU, não o que a função faz.** `activity.ack`
 *    é *"Ciência de atividade registrada"* — e o serviço responde, no mesmo
 *    ato, que *"ciência não é conclusão"*. A auditoria não pode dizer mais do
 *    que o sistema disse a quem clicou.
 */

/**
 * Ações cujo código é MONTADO, e por isso não aparece como literal no código.
 *
 * Ficam declaradas aqui com os valores concretos porque o conferidor não tem
 * como deduzi-las lendo o texto do arquivo — e o que ele não deduz, ele não
 * guarda.
 */
export const ACOES_MONTADAS = [
  // `pauta.${situacao}` — alignments.service.ts, os três desfechos de DESFECHO.
  'pauta.aceita', 'pauta.recusada', 'pauta.adiada',
  /* `mudarStatus(..., acao, ...)` — incidents.service.ts. A ação chega como
     ARGUMENTO, e hoje há um único chamador; se aparecer um segundo, o valor
     dele entra nesta lista, e o conferidor cobra a frase. */
  'external_comm.submit',
];

/** Cada ação que o sistema grava, e a frase que a pessoa lê. */
export const VOCABULARIO_DA_AUDITORIA: Record<string, string> = {
  // ---------------------------------------------------------------- Acolhido
  'person.admit': 'Acolhimento registrado',
  'person.admit_full': 'Acolhimento registrado com ficha de ingresso',
  'person.readmit': 'Reacolhimento registrado',
  'person.discharge': 'Saída registrada',
  'person.profile_update': 'Cadastro do acolhido alterado',
  'person.correct_identity': 'Identificação corrigida',
  'person.cpf_check': 'CPF conferido no cadastro',
  'person.judicial_view': 'Dado judicial consultado',
  'person.judicial_update': 'Dado judicial alterado',
  'person.acervo.consulta': 'Histórico de permanências da casa consultado',
  'outing_permission.set': 'Permissão de saída definida',
  'perfil.campo.ligado': 'Campo do perfil ligado para a casa',
  'perfil.campo.desligado': 'Campo do perfil desligado para a casa',
  'house.open': 'Unidade aberta',
  'house.capacity_change': 'Capacidade da unidade alterada',

  // ------------------------------------------------------------- Dossiê e fotos
  'document.attach': 'Documento anexado ao dossiê',
  'document.open': 'Documento do dossiê aberto',
  /* Baixar é OUTRO ato, e por isso tem nome próprio (fase 124). Abrir é ler na
     tela; baixar é o arquivo saindo do sistema, e é o que alguém vai querer
     rastrear no dia em que uma certidão aparecer onde não devia. */
  'document.download': 'Documento do dossiê baixado',
  'document.accept': 'Documento do dossiê conferido',
  'documento.export': 'Documento exportado',
  'memory.record': 'Vivência registrada no álbum',
  'memory.open': 'Foto do álbum de vivências aberta',
  'foto.identificacao.guardada': 'Foto de identificação guardada',
  'foto.contato.guardada': 'Foto de visitante guardada',
  'marco.registrado': 'Marco de vida registrado',
  'marco.comprovante.lido': 'Comprovante de marco de vida aberto',

  // ------------------------------------------------------------------ Contatos
  'contato.criado': 'Contato cadastrado',
  'contato.visita.autorizada': 'Visita autorizada',
  'contato.visita.retirada': 'Autorização de visita retirada',
  'family_stay.open': 'Convivência familiar iniciada',
  'family_stay.close': 'Convivência familiar encerrada',
  /* O relato da convivência (fase 122). Não há ação de fechar nem de apagar:
     a Fundação tirou o prazo de propósito — *"dessa forma não haverá uma
     pressão para arrancar a informação da criança"* —, e o que se registra é
     sempre uma linha nova. O log guarda que houve relato e se veio marcado
     como alteração; o texto fica no perfil, e não na auditoria (regra 2). */
  'family_stay.note': 'Relato de convivência familiar registrado',

  // ------------------------------------------------------------------ Chamadas
  'check.open': 'Chamada aberta',
  'check.bulk': 'Conferência de mesa registrada',
  'check.amend': 'Registro de chamada corrigido',
  'check.confirm': 'Chamada confirmada',

  // ----------------------------------------------------------------- Atividades
  'activity.generate_day': 'Atividades do dia geradas a partir da rotina',
  'activity.create_urgent': 'Atividade urgente criada',
  'activity.ack': 'Ciência de atividade registrada',
  'activity.record': 'Atividade concluída',
  'activity.record_for_other': 'Atividade concluída em nome de outra pessoa',
  'activity.delegate': 'Atividade delegada',
  'routine.new_version': 'Nova versão da rotina publicada',
  'routine.item_add': 'Item acrescentado à rotina',
  'commitment.create': 'Compromisso agendado',
  'commitment.cancel': 'Compromisso cancelado',
  'commitment.skip': 'Compromisso dispensado no dia',
  'commitment.unskip': 'Dispensa de compromisso desfeita',
  'aniversario.ciente': 'Ciência de aniversário registrada',

  // ------------------------------------------------------------ Plantão e ATA
  'shift.open': 'Plantão aberto',
  'handover.sign': 'Passagem de plantão assinada',
  'handover.receive': 'Passagem de plantão recebida',
  'handover.complement': 'Relato complementar de passagem escrito',
  'ata.note': 'Registro escrito na ATA',
  'ata.episode': 'Episódio registrado na ATA',
  'ata.episode_ack': 'Ciência de episódio da ATA registrada',
  'ata.close': 'ATA fechada',
  'ata.reopen': 'ATA reaberta',
  'ata.amend': 'Adendo escrito em ATA fechada',
  'ata_geral.close': 'ATA Geral fechada',
  'ata_geral.close_pending': 'ATA Geral fechada com pendência',
  'ata.arquivo.consulta': 'Arquivo das ATAS consultado',
  'escala.set': 'Escala definida',
  'escala.revoke': 'Escala revogada',
  'substitution.request': 'Substituição pedida',
  'substitution.assign': 'Substituição designada',
  'substitution.decline': 'Substituição recusada',
  'staff.line_color': 'Cor da linha de um membro da equipe escolhida',

  // ----------------------------------------------------------------- Ocorrências
  'incident.open': 'Ocorrência registrada',
  'incident.restraint': 'Contenção registrada',
  'incident.protected': 'Relato restrito registrado',
  'incident.synthesis': 'Síntese de ocorrência escrita',
  'incident.attachment_add': 'Anexo de ocorrência registrado',
  'incident.attachment_open': 'Anexo de ocorrência aberto',
  'incident.close_operational': 'Ocorrência encerrada na operação',
  'incident.technical_review': 'Revisão técnica da ocorrência registrada',
  'external_comm.create': 'Comunicação externa redigida',
  'external_comm.submit': 'Comunicação externa enviada para revisão',
  'external_comm.approve': 'Comunicação externa aprovada',
  'external_comm.delivered': 'Comunicação externa entregue',
  'escalation.raise': 'Aviso escalonado',
  'notification.ack': 'Aviso lido',

  // ---------------------------------------------------------------------- Saúde
  'health.triage_request': 'Triagem de enfermagem pedida',
  'health.triage_sign': 'Triagem de enfermagem assinada',
  'health.triage_denied': 'Triagem de enfermagem recusada',
  'health.evolution_submit': 'Evolução de saúde escrita',
  'health.summary_issue': 'Resumo de Saúde emitido',
  'health.summary_download': 'Resumo de Saúde retirado por quem o emitiu',
  'internacao.aberta': 'Internação hospitalar aberta',
  'internacao.encerrada': 'Internação hospitalar encerrada',
  'internacao.anexo.lido': 'Anexo de internação aberto',

  // ----------------------------------------------------------------- Medicação
  'prescription.create': 'Prescrição registrada',
  'prescription.sign': 'Prescrição assinada',
  'prescription.suspend': 'Prescrição suspensa',
  'prescription.document': 'Receita da prescrição anexada',
  'prescription.document_open': 'Receita da prescrição aberta',
  'medication.invoice_open': 'Nota fiscal de compra aberta',
  'medication.generate_doses': 'Doses do dia geradas a partir das prescrições',
  'medication.confirm': 'Dose confirmada',
  'medication.prn_registered': 'Dose "quando necessário" registrada, com o motivo',
  'medication.prn_outcome': 'Desfecho da dose "quando necessário" registrado',
  'medication.nurse_only': 'Medicamento marcado como exclusivo da Enfermagem',
  'medication.leave_with_child': 'Medicamento entregue para a criança levar',
  'medication.purchase': 'Compra de medicamento registrada',
  'stock.entrada': 'Entrada no armário registrada',
  'stock.contagem': 'Contagem do armário registrada',

  // ------------------------------------------------------------- Trabalho social
  'followup.generate': 'Acompanhamento montado',
  'followup.submit': 'Acompanhamento enviado',
  'followup.approve': 'Acompanhamento aprovado',
  'followup.amend': 'Acompanhamento corrigido por adendo',
  'report.generate': 'Relatório montado',
  'report.submit': 'Relatório enviado',
  'report.approve': 'Relatório aprovado',
  'report.export': 'Relatório exportado',
  'report.delivery_registered': 'Entrega de relatório registrada',
  'report.kitchen': 'Folha de restrições alimentares gerada para a cozinha',
  'education.support': 'Apoio educacional registrado',
  'education.evolution': 'Evolução educacional escrita',
  'education.concept': 'Conceito educacional do bimestre registrado',

  // -------------------------------------------------------------------- Cozinha
  'kitchen.request': 'Pedido à cozinha registrado',
  'kitchen.cancel': 'Pedido à cozinha cancelado',

  // ------------------------------------------------------------- Combinados e pauta
  'alignment.meeting': 'Reunião de equipe registrada',
  'alignment.agreement': 'Combinado da equipe escrito',
  'alignment.agreement_status': 'Situação de um combinado alterada',
  'pauta.proposta': 'Item proposto para a pauta',
  'pauta.aceita': 'Item da pauta aceito',
  'pauta.recusada': 'Item da pauta recusado, com resposta escrita',
  'pauta.adiada': 'Item da pauta adiado, com resposta escrita',
  'estatuto.escrito': 'Estatuto publicado',
  'estatuto.revogado': 'Estatuto revogado',
  'statement.create': 'Relato individual escrito',
  'statement.read_side_by_side': 'Relatos lidos lado a lado',
  'statement.read_by_person': 'Relatos de uma criança lidos no perfil dela',
  'statement.read_exceptional': 'Leitura excepcional de relato, com finalidade escrita',

  // ------------------------------------------------------------------ Benefícios
  'benefits.create': 'Dados bancários cadastrados',
  'benefits.update': 'Dados bancários alterados',
  'benefits.view': 'Dados bancários consultados',
  'benefits.denied': 'Consulta a dados bancários recusada',
  'benefits.export': 'Dados bancários exportados',

  // --------------------------------------------------------------------- Cofre
  'credential.create': 'Acesso guardado no cofre',
  'credential.replace': 'Acesso do cofre substituído',
  'credential.list': 'Cofre de acessos consultado',
  'credential.denied': 'Abertura do cofre recusada',
  'credential.reveal': 'Acesso do cofre revelado',
  'credential.reveal_exceptional': 'Acesso do cofre revelado em caráter excepcional',

  // ---------------------------------------------------------------- Transferência
  'transfer.request': 'Transferência pedida',
  'transfer.accept': 'Transferência aceita',
  'transfer.cancel': 'Transferência cancelada',
  'transfer.decline': 'Transferência recusada',
  'transfer.declined_received': 'Recusa de transferência recebida',
  'transfer.message': 'Mensagem sobre a transferência escrita',

  // -------------------------------------------------------------------- Acesso
  'auth.login': 'Entrada no sistema',
  'auth.logout': 'Saída do sistema',
  'auth.login_failed': 'Tentativa de entrada com senha errada',
  'auth.login_locked': 'Conta bloqueada por tentativas seguidas',
  'auth.password_change': 'Senha trocada',
  'auth.invite_sent': 'Convite de primeiro acesso enviado',
  'auth.invite_issued': 'Convite de primeiro acesso emitido',
  'auth.first_access': 'Primeiro acesso concluído',
  'auth.reauth': 'Identidade confirmada de novo',
  'auth.reauth_failed': 'Confirmação de identidade recusada',
  'auth.revoke_all': 'Todas as sessões derrubadas',
  'device.register': 'Aparelho institucional cadastrado',
  'device.revoke': 'Aparelho institucional revogado',

  // ----------------------------------------------------------------- Equipe
  'staff.create': 'Pessoa da equipe cadastrada',
  'staff.create_transversal': 'Pessoa da equipe cadastrada em cargo transversal',
  'staff.update': 'Cadastro de pessoa da equipe alterado',
  'staff.deactivate': 'Pessoa da equipe desativada',
  'staff.reactivate': 'Pessoa da equipe reativada',
  'staff.reset_password': 'Senha de pessoa da equipe redefinida',
  /* Abrir o trabalho de alguém é, ele mesmo, uma ação — e ela aparece aqui,
     com o nome de quem olhou e a finalidade que escreveu (fase 117). Quem
     consulta também é consultável. */
  'staff.work_view': 'Trabalho da equipe consultado, com finalidade escrita',
  /* Contar também é olhar (fase 119). A visão de contagens do Gestor Geral
     deixa a mesma linha que a leitura detalhada: quem consulta é consultável,
     e é por isso que as duas entram aqui e não só uma. */
  'staff.work_metrics': 'Contagens do trabalho da equipe consultadas',
  /* O painel das oito casas (fase 120). Abrir também é um ato, e o Gestor
     Geral já deixa linha cada vez que abre UMA casa — não seria coerente
     abrir as oito sem deixar nenhuma. */
  'painel.metricas': 'Painel das oito casas aberto',
  /* O período da casa (fase 121). Uma leitura que junta seis meses de uma casa
     numa tela só deixa linha por ter sido aberta. A SAÍDA em arquivo deixa a
     dela por `documento.export`, com a finalidade escrita — é o mesmo caminho
     de todo documento do sistema desde a fase 47, e um segundo verbo só para
     este relatório faria a auditoria ter dois nomes para a mesma coisa. */
  'periodo.leitura': 'Período da casa consultado',

  // ------------------------------------------------------- Sincronização e arquivo
  'sync.push': 'Fila do aparelho enviada',
  'sync.conflict_resolve': 'Conflito de sincronização resolvido',
  'archive.enqueue': 'Cópia documental enfileirada para o arquivo',
  'archive.enqueue.auto': 'Cópia documental enfileirada automaticamente',
  'archive.failure_escalated': 'Falha do arquivo documental escalonada',

  // --------------------------------------------------------------------- Relógio
  /* Sem "pelo relógio": o autor já vem na linha, e a conta dele é justamente
     o que o §12.7 pede que não se confunda com a de uma pessoa. */
  'relogio.dia': 'Dia da casa gerado automaticamente',
};
