import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { TimelineRegistry } from '../../kernel/events/timeline-registry.service';
import { TimelineEvent, TimelineProvider, TimelineQuery } from '../../kernel/contracts';
import { ActivitiesService, ESTADO_LABEL } from './activities.service';

/**
 * Provedor de Linha do Tempo do módulo `activities`.
 *
 * Este arquivo é o ÚNICO ponto de contato entre atividades e a linha do tempo,
 * e o contato é de mão única: o módulo se registra no kernel e entrega eventos
 * no formato comum. A timeline não sabe que este módulo existe.
 *
 * Consequência prática: remover `activities` do app.module.ts tira as
 * atividades da linha do tempo e não quebra nada mais.
 */
@Injectable()
export class ActivitiesTimelineProvider implements TimelineProvider, OnModuleInit {
  readonly source = 'activities';

  constructor(
    @Inject(TimelineRegistry) private readonly registry: TimelineRegistry,
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async fetch(q: TimelineQuery): Promise<TimelineEvent[]> {
    const lista = await this.activities.listDay(q.user, q.houseId, q.date, {
      personId: q.personId, onlyMine: q.onlyMine,
    });

    return lista.map((a): TimelineEvent => ({
      id: `activity:${a.id}`,
      source: this.source,
      at: new Date(a.horario).toISOString(),
      kind: mapKind(a.tipo),
      title: a.titulo,
      personId: a.acolhido?.id ?? null,
      personName: a.acolhido?.nome ?? null,
      houseId: q.houseId,
      state: a.rotulo,
      severity: severidade(a.estado),
      responsible: a.responsavel ?? (a.urgente ? 'Atividade urgente do plantão' : null),
      note: a.justificativa ?? a.instrucoes ?? null,
      actions: acoes(a),
    }));
  }
}

/** Traduz o tipo da rotina para o vocabulário da linha do tempo. */
function mapKind(tipo: string): TimelineEvent['kind'] {
  if (tipo === 'refeicao') return 'refeicao';
  if (tipo === 'medicamento') return 'medicamento';
  if (['acordar', 'higiene', 'banho', 'sono'].includes(tipo)) return 'rotina';
  if (['escola', 'curso'].includes(tipo)) return 'saida';
  if (tipo === 'saude') return 'saude';
  return 'atividade';
}

/**
 * Severidade é operacional: o que exige ação agora. Nunca julgamento sobre a
 * criança ou o adolescente (§3.3 — sem ranking, sem pontuação).
 */
function severidade(estado: string): TimelineEvent['severity'] {
  if (['sem_confirmacao', 'aguardando_substituicao'].includes(estado)) return 'critico';
  if (['aguardando_ciencia', 'agendada'].includes(estado)) return 'atencao';
  return 'normal';
}

function acoes(a: ReturnType<ActivitiesService['listDay']> extends Promise<(infer T)[]> ? T : never) {
  const out = [];
  if (a.exigeCiencia && !a.cientePorMim) out.push({ command: 'activity.acknowledge', label: 'Estou ciente' });
  if (!a.final) {
    out.push({ command: 'activity.record', label: 'Registrar resultado' });
    out.push({ command: 'activity.substitution', label: 'Pedir substituição' });
  }
  return out;
}

export { ESTADO_LABEL };
