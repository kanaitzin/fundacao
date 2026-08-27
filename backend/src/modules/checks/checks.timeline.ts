import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { TimelineRegistry } from '../../kernel/events/timeline-registry.service';
import { TimelineEvent, TimelineProvider, TimelineQuery } from '../../kernel/contracts';
import { ChecksService } from './checks.service';

/**
 * Provedor de Linha do Tempo do módulo `checks`.
 * Mesmo padrão de `activities`: registra-se no kernel e entrega eventos no
 * formato comum. A timeline continua sem conhecer este módulo.
 */
@Injectable()
export class ChecksTimelineProvider implements TimelineProvider, OnModuleInit {
  readonly source = 'checks';

  constructor(
    @Inject(TimelineRegistry) private readonly registry: TimelineRegistry,
    @Inject(ChecksService) private readonly checks: ChecksService,
  ) {}

  onModuleInit() { this.registry.register(this); }

  async fetch(q: TimelineQuery): Promise<TimelineEvent[]> {
    // Chamadas são coletivas: na visão de um acolhido individual elas não
    // aparecem como linha própria — o registro dele está no perfil.
    if (q.personId) return [];
    const lista = await this.checks.listDay(q.user, q.houseId, q.date);

    return lista.map((k): TimelineEvent => {
      const pendente = k.status !== 'confirmada';
      const faltam = k.esperados - k.conferidos;
      return {
        id: `check:${k.id}`,
        source: this.source,
        at: new Date(k.horario).toISOString(),
        kind: k.tipo === 'alimentacao' ? 'refeicao' : 'chamada',
        title: k.titulo,
        personId: null,
        personName: null,
        houseId: q.houseId,
        state: pendente ? `Chamada aberta — ${k.conferidos}/${k.esperados} conferidos` : 'Chamada confirmada',
        severity: pendente ? (faltam > 0 ? 'atencao' : 'normal') : 'normal',
        note: pendente && faltam > 0 ? `Faltam ${faltam} acolhidos para conferir` : null,
        actions: pendente ? [{ command: 'check.open', label: 'Abrir chamada' }] : [],
      };
    });
  }
}
