import { Injectable, Logger } from '@nestjs/common';
import { TimelineEvent, TimelineProvider, TimelineQuery } from '../contracts';

/**
 * KERNEL — Registro de provedores da Linha do Tempo (§9).
 *
 * A linha do tempo é o ponto onde tudo se encontra — e por isso seria o pior
 * lugar para concentrar dependências. Se ela importasse atividades, chamadas,
 * medicamentos e ocorrências, remover qualquer um quebraria a tela mais
 * importante do educador.
 *
 * Aqui cada módulo se REGISTRA. A timeline só conhece a interface:
 *  * adicionar um módulo = registrar um provedor (nenhuma linha muda aqui);
 *  * remover um módulo = a linha do tempo segue com os demais;
 *  * um provedor com defeito não derruba a tela — seus eventos ficam de fora
 *    e a falha é registrada, porque um plantão sem linha do tempo é pior do
 *    que uma linha do tempo incompleta e sinalizada.
 */
@Injectable()
export class TimelineRegistry {
  private readonly log = new Logger('TimelineRegistry');
  private readonly providers: TimelineProvider[] = [];

  register(provider: TimelineProvider): void {
    this.providers.push(provider);
    this.log.log(`provedor registrado: ${provider.source}`);
  }

  get sources(): string[] {
    return this.providers.map((p) => p.source);
  }

  /** Coleta de todos os provedores e devolve em ordem cronológica. */
  async collect(query: TimelineQuery): Promise<{ events: TimelineEvent[]; falhas: string[] }> {
    const events: TimelineEvent[] = [];
    const falhas: string[] = [];

    for (const p of this.providers) {
      try {
        events.push(...(await p.fetch(query)));
      } catch (err) {
        falhas.push(p.source);
        this.log.error(`provedor "${p.source}" falhou: ${(err as Error).message}`);
      }
    }

    events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.title.localeCompare(b.title)));
    return { events, falhas };
  }
}
