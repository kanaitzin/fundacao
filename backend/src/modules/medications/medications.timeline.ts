import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { TimelineRegistry } from '../../kernel/events/timeline-registry.service';
import { TimelineEvent, TimelineProvider, TimelineQuery } from '../../kernel/contracts';
import { MedicationsService } from './medications.service';

/**
 * Provedor de Linha do Tempo do módulo `medications`.
 *
 * Este arquivo é a prova prática da arquitetura de partições: o módulo mais
 * crítico do sistema entra na tela principal do educador sem que UMA LINHA da
 * timeline seja alterada. Basta registrar-se aqui.
 */
@Injectable()
export class MedicationsTimelineProvider implements TimelineProvider, OnModuleInit {
  readonly source = 'medications';

  constructor(
    @Inject(TimelineRegistry) private readonly registry: TimelineRegistry,
    @Inject(MedicationsService) private readonly meds: MedicationsService,
  ) {}

  onModuleInit() { this.registry.register(this); }

  async fetch(q: TimelineQuery): Promise<TimelineEvent[]> {
    const doses = await this.meds.dayGrid(q.user, q.houseId, q.date, q.personId);

    return doses.map((d): TimelineEvent => {
      const atrasada = d.pendente && new Date(d.horario) < new Date();
      return {
        id: `dose:${d.id}`,
        source: this.source,
        at: new Date(d.horario).toISOString(),
        kind: 'medicamento',
        title: `${d.medicamento} ${d.dose}`,
        personId: d.acolhido.id,
        personName: d.acolhido.nome,
        houseId: q.houseId,
        state: d.rotulo,
        // Dose vencida sem registro é o alerta mais alto da tela — mas o rótulo
        // continua sendo "aguardando confirmação", nunca "não administrado".
        severity: atrasada ? 'critico' : d.pendente ? 'atencao' : 'normal',
        responsible: d.confirmadaPor ? `Confirmada por ${d.confirmadaPor}` : null,
        note: d.alergias ? `⚠ Alergia registrada: ${d.alergias}` : d.observacao,
        actions: d.pendente ? [{ command: 'medication.confirm', label: 'Confirmar dose' }] : [],
      };
    });
  }
}
