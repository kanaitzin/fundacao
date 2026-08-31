import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from '../contracts';

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

  async publish<T extends Record<string, unknown>>(
    name: string,
    payload: T,
    ctx: { actorId?: string | null; houseId?: string | null } = {},
  ): Promise<{ falhas: string[] }> {
    const event: DomainEvent<T> = { name, at: new Date(), payload, ...ctx };
    const falhas: string[] = [];
    for (const handler of this.handlers.get(name) ?? []) {
      try {
        await handler(event);
      } catch (err) {
        // Um ouvinte com defeito não pode derrubar a operação que publicou.
        this.log.error(`ouvinte de "${name}" falhou: ${(err as Error).message}`);
        falhas.push((err as Error).message);
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
