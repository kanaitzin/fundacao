import { Injectable, Logger } from '@nestjs/common';
import { DirectNotice, DomainEvent, EscalationRequest } from '../contracts';

/**
 * Os eventos cujo corpo tem contrato escrito. O nome do evento escolhe o tipo
 * do corpo, e o compilador recusa o que o contrato não aceita (fase 154).
 */
/**
 * AS FALHAS DE OUVINTE DESTE PROCESSO — para a suíte poder reprovar (fase 155).
 *
 * O barramento engole o erro do ouvinte de propósito: um aviso com defeito não
 * pode desfazer a ocorrência que o publicou. Mas o que ele engolia ia só para o
 * log, e o pedido de leitura da ATA restrita morreu ali por meses — o banco
 * recusava a notificação, duas vezes por rodada, e nenhuma suíte via. Aqui fica
 * a mesma falha em memória; `test/setup/ouvinte-nao-falha-calado.ts` confere a
 * lista ao fim de cada suíte e reprova se houver alguma. Em produção a lista
 * é esvaziada a cada cem entradas: não é registro, é só o que a suíte lê.
 */
export const falhasDeOuvinte: { evento: string; erro: string }[] = [];

type EventosComContrato = {
  'escalation.requested': EscalationRequest;
  'notice.requested': DirectNotice;
};

type Handler = (e: DomainEvent<any>) => void | Promise<void>;

/**
 * KERNEL — Barramento de eventos de domínio (em processo).
 *
 * Existe para que um módulo REAJA a outro sem IMPORTÁ-LO. Exemplo: quando
 * uma atividade vence sem confirmação, o módulo `activities` publica o evento;
 * `notifications` reage. Se `notifications` for removido, nada quebra — o
 * evento simplesmente não tem ouvintes.
 *
 * Regras:
 *  * a publicação nunca falha por causa de um ouvinte (erro é registrado, não propagado);
 *  * o payload carrega IDs e metadados, nunca conteúdo sensível (§20);
 *  * quem publica não sabe quem ouve — e não deve tentar descobrir.
 */
@Injectable()
export class EventBus {
  private readonly log = new Logger('EventBus');
  private readonly handlers = new Map<string, Handler[]>();

  on(eventName: string, handler: Handler): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler);
    this.handlers.set(eventName, list);
  }

  /*
   * O PEDIDO DE ACIONAMENTO TEM CONTRATO, e o compilador o cobra (fase 154).
   *
   * `EscalationRequest` sempre disse que a prioridade é normal, alta ou
   * crítica; mas o `publish` genérico aceitava qualquer objeto, e o pedido para
   * ler a observação restrita de uma ATA publicava `priority: 'media'`. O banco
   * recusava a notificação, o ouvinte registrava o erro no log — que ninguém lê —
   * e a técnica e a coordenação nunca ficavam sabendo do pedido. Com a
   * o nome do evento escolhendo o tipo do corpo, evento com contrato só publica
   * o contrato — e o compilador achou esta chamada, e só ela, entre dezesseis.
   */
  async publish<N extends string>(
    name: N,
    payload: N extends keyof EventosComContrato ? EventosComContrato[N] : Record<string, unknown>,
    ctx: { actorId?: string | null; houseId?: string | null } = {},
  ): Promise<{ falhas: string[] }> {
    const event: DomainEvent<Record<string, unknown>> = { name, at: new Date(), payload, ...ctx };
    const falhas: string[] = [];
    for (const handler of this.handlers.get(name) ?? []) {
      try {
        await handler(event);
      } catch (err) {
        // Um ouvinte com defeito não pode derrubar a operação que publicou.
        this.log.error(`ouvinte de "${name}" falhou: ${(err as Error).message}`);
        falhas.push((err as Error).message);
        if (falhasDeOuvinte.length >= 100) falhasDeOuvinte.length = 0;
        falhasDeOuvinte.push({ evento: name, erro: (err as Error).message });
      }
    }
    // Mas quem publicou PRECISA poder saber que falhou.
    //
    // No ensaio de uso, autorizar uma substituição respondeu "o substituto
    // precisa tomar ciência" enquanto o aviso morria aqui dentro em silêncio.
    // Às 23h o líder achou que tinha resolvido o plantão. Engolir o erro
    // protege a operação; escondê-lo de quem chamou é outra coisa.
    return { falhas };
  }
}
