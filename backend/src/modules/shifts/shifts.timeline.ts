import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { TimelineRegistry } from '../../kernel/events/timeline-registry.service';
import { TimelineEvent, TimelineProvider, TimelineQuery } from '../../kernel/contracts';
import { ShiftsService } from './shifts.service';

/**
 * Provedor de Linha do Tempo do módulo `shifts`.
 *
 * O que aparece: abertura e fechamento do plantão, e o estado da ATA. O que
 * NÃO aparece: conteúdo de passagem e relato pessoal — a linha do tempo é
 * lida por todo o plantão, e o §12.2 vale ali também.
 */
@Injectable()
export class ShiftsTimelineProvider implements TimelineProvider, OnModuleInit {
  readonly source = 'shifts';

  constructor(
    @Inject(TimelineRegistry) private readonly registry: TimelineRegistry,
    @Inject(ShiftsService) private readonly shifts: ShiftsService,
  ) {}

  onModuleInit() { this.registry.register(this); }

  async fetch(q: TimelineQuery): Promise<TimelineEvent[]> {
    // Plantão é evento da casa, não de um acolhido.
    if (q.personId) return [];
    const lista = await this.shifts.listDay(q.user, q.houseId, q.date);

    return lista.map((s): TimelineEvent => {
      const pendente = s.assinaturasFaltantes > 0;
      const fechado = ['fechado', 'fechado_com_pendencia'].includes(s.status);
      return {
        id: `shift:${s.id}`,
        source: this.source,
        at: new Date(s.abertoEm).toISOString(),
        kind: 'plantao',
        title: `Plantão ${s.turno}`,
        personId: null, personName: null, houseId: q.houseId,
        state: fechado
          ? (pendente ? `ATA fechada com ${s.assinaturasFaltantes} assinatura(s) pendente(s)` : 'ATA fechada')
          : `Plantão aberto — ${s.passagensAssinadas} passagem(ns) assinada(s)`,
        severity: pendente ? 'atencao' : 'normal',
        note: fechado ? null : 'Cada profissional assina a própria passagem.',
        actions: fechado
          ? [{ command: 'ata.view', label: 'Ver ATA' }]
          : [{ command: 'handover.sign', label: 'Assinar minha passagem' }],
      };
    });
  }
}
