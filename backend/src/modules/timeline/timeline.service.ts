import { Inject, Injectable } from '@nestjs/common';
import { TimelineRegistry } from '../../kernel/events/timeline-registry.service';
import { AuthenticatedUser, TimelineEvent } from '../../kernel/contracts';

/**
 * LINHA DO TEMPO UNIFICADA (§9) — a tela operacional principal do educador.
 *
 * Este serviço não importa NENHUM módulo de domínio. Ele pergunta ao registro
 * do kernel quais provedores existem e junta o que eles devolvem. É o motivo
 * pelo qual medicamentos (Fase 4) e ocorrências (Fase 5) entrarão sem alterar
 * uma linha deste arquivo — e pelo qual remover um módulo não apaga a tela.
 *
 * Regra que o §9 impõe e este serviço respeita:
 * **uma tarefa individual nunca fica oculta na visão coletiva.** Por isso o
 * modo "Casa — todos" não filtra nada; quem filtra é o modo escolhido pelo
 * educador, e mesmo assim os itens que exigem ciência dele continuam visíveis.
 */
export type TimelineMode = 'casa' | 'minhas' | 'individual';

@Injectable()
export class TimelineService {
  constructor(@Inject(TimelineRegistry) private readonly registry: TimelineRegistry) {}

  async day(user: AuthenticatedUser, params: {
    houseId: string; date: string; mode?: TimelineMode; personId?: string;
  }) {
    const mode: TimelineMode = params.mode ?? 'casa';
    const { events, falhas } = await this.registry.collect({
      user, houseId: params.houseId, date: params.date,
      personId: mode === 'individual' ? params.personId : undefined,
      onlyMine: mode === 'minhas',
    });

    return {
      data: params.date,
      modo: mode,
      fontes: this.registry.sources,
      // Transparência honesta: se um provedor falhou, a tela diz. Um plantão
      // com linha do tempo incompleta e sinalizada é melhor do que uma tela
      // em branco — ou, pior, uma tela que parece completa e não está.
      incompleta: falhas.length > 0,
      fontesIndisponiveis: falhas,
      resumo: resumir(events),
      eventos: events,
    };
  }

  /** Painel da Casa — “Visão dos 20” (§9): uma linha por acolhido. */
  async housePanel(user: AuthenticatedUser, houseId: string, date: string) {
    const { events, falhas } = await this.registry.collect({ user, houseId, date });

    const porPessoa = new Map<string, { nome: string; eventos: TimelineEvent[] }>();
    const coletivos: TimelineEvent[] = [];
    for (const e of events) {
      if (!e.personId) { coletivos.push(e); continue; }
      const atual = porPessoa.get(e.personId) ?? { nome: e.personName ?? '—', eventos: [] };
      atual.eventos.push(e);
      porPessoa.set(e.personId, atual);
    }

    const agora = new Date().toISOString();
    const acolhidos = [...porPessoa.entries()].map(([id, v]) => {
      const proxima = v.eventos.find((e) => e.at >= agora) ?? null;
      const criticos = v.eventos.filter((e) => e.severity === 'critico');
      const ultimo = [...v.eventos].reverse().find((e) => e.at < agora) ?? null;
      return {
        acolhidoId: id,
        nome: v.nome,
        situacaoAtual: ultimo ? ultimo.state : 'Sem registro hoje',
        ultimoRegistro: ultimo ? { titulo: ultimo.title, horario: ultimo.at, estado: ultimo.state } : null,
        proximaAtividade: proxima ? { titulo: proxima.title, horario: proxima.at } : null,
        pendencias: criticos.length,
        alertaEssencial: criticos[0]?.title ?? null,
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome));

    return {
      data: date,
      incompleta: falhas.length > 0,
      fontesIndisponiveis: falhas,
      coletivos: coletivos.map((e) => ({ titulo: e.title, horario: e.at, estado: e.state, severidade: e.severity })),
      acolhidos,
    };
  }
}

function resumir(events: TimelineEvent[]) {
  return {
    total: events.length,
    criticos: events.filter((e) => e.severity === 'critico').length,
    atencao: events.filter((e) => e.severity === 'atencao').length,
    individuais: events.filter((e) => e.personId).length,
    coletivos: events.filter((e) => !e.personId).length,
  };
}
