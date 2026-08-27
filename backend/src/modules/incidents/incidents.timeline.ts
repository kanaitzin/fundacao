import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { TimelineRegistry } from '../../kernel/events/timeline-registry.service';
import { TimelineEvent, TimelineProvider, TimelineQuery } from '../../kernel/contracts';
import { DatabaseService } from '../../kernel/database/database.service';
import { CATEGORIAS } from './incidents.service';

/**
 * Provedor de Linha do Tempo do módulo `incidents`.
 *
 * A linha do tempo mostra QUE houve ocorrência e em que estado ela está —
 * nunca o fato, a fala espontânea, os sinais observados ou a foto (§13.7).
 * Quem tem função de ler o conteúdo abre a ocorrência; a política do banco
 * decide o que aparece lá.
 */
@Injectable()
export class IncidentsTimelineProvider implements TimelineProvider, OnModuleInit {
  readonly source = 'incidents';

  constructor(
    @Inject(TimelineRegistry) private readonly registry: TimelineRegistry,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  onModuleInit() { this.registry.register(this); }

  async fetch(q: TimelineQuery): Promise<TimelineEvent[]> {
    const rows = await this.db.asUser(q.user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT i.id, i.category, i.happened_at, i.status, i.requires_technical_review,
                -- Sem JOIN person: o JOIN devolvia NULL para criança já
                -- transferida enquanto o contador de envolvidos seguia em 1 — a
                -- ocorrência aparecia na linha do tempo como se fosse coletiva.
                (SELECT ip.person_id FROM incident_person ip
                  WHERE ip.incident_id = i.id ORDER BY ip.person_id LIMIT 1) AS person_id,
                (SELECT app_person_display_name(ip.person_id) FROM incident_person ip
                  WHERE ip.incident_id = i.id ORDER BY ip.person_id LIMIT 1) AS person_name,
                (SELECT count(*)::int FROM incident_person ip WHERE ip.incident_id = i.id) AS envolvidos
         FROM incident i
         WHERE i.house_id = $1
           AND (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date
           AND ($3::uuid IS NULL OR EXISTS (
                 SELECT 1 FROM incident_person ip
                  WHERE ip.incident_id = i.id AND ip.person_id = $3::uuid))
         ORDER BY i.happened_at`, [q.houseId, q.date, q.personId ?? null]);
      return rows;
    });

    return rows.map((i: any): TimelineEvent => {
      const rotulo = CATEGORIAS.find((c) => c.code === i.category)?.label ?? 'Ocorrência';
      const aguardando = i.status === 'aguardando_revisao_tecnica';
      return {
        id: `incident:${i.id}`,
        source: this.source,
        at: new Date(i.happened_at).toISOString(),
        kind: 'ocorrencia',
        // Só a categoria. O fato não sai daqui.
        title: rotulo,
        personId: i.envolvidos === 1 ? i.person_id : null,
        personName: i.envolvidos === 1 ? i.person_name : null,
        houseId: q.houseId,
        state: aguardando ? 'Aguardando revisão técnica'
             : i.status === 'fechada' ? 'Fechada'
             : i.status === 'encerrada_operacional' ? 'Etapa operacional encerrada'
             : 'Em acompanhamento',
        severity: i.status === 'fechada' ? 'normal' : (i.requires_technical_review ? 'critico' : 'atencao'),
        note: i.envolvidos > 1 ? `${i.envolvidos} acolhidos envolvidos` : null,
        actions: [{ command: 'incident.open', label: 'Abrir ocorrência' }],
      };
    });
  }
}
