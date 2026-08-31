import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TimelineRegistry } from '../../kernel/events/timeline-registry.service';
import { DatabaseService } from '../../kernel/database/database.service';
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
  constructor(
    @Inject(TimelineRegistry) private readonly registry: TimelineRegistry,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  /**
   * O DIA INTEIRO, DAS 8 CASAS, EM UMA LISTA SÓ.
   *
   * Para o Gestor Geral e para quem coordena mais de uma unidade. Sem isto,
   * conferir o dia significava abrir oito telas e comparar de cabeça, que é
   * onde some o detalhe: a ocorrência da AI5 às 22h30 e a dose não confirmada
   * da AI2 às 22h40 são a mesma noite, e ninguém enxerga isso pulando de aba.
   *
   * As casas vêm do banco sob RLS, não de uma lista: quem alcança uma casa
   * recebe uma, quem alcança oito recebe oito. E este serviço continua sem
   * importar nenhum módulo de domínio, que é o que permite acrescentar ou
   * remover partições sem quebrar a tela mais usada do plantão.
   *
   * Não existe modo individual aqui de propósito: acompanhar UMA criança é
   * dentro da casa dela. Varrer as oito atrás de uma pessoa é vigilância com
   * outro nome.
   */
  async dayAllHouses(user: AuthenticatedUser, params: { date: string; mode?: TimelineMode }) {
    if (params.mode === 'individual') {
      throw new BadRequestException(
        'A visão de todas as unidades é do dia, não de uma pessoa. '
        + 'Para acompanhar um acolhido, abra a linha do tempo da casa dele.');
    }

    const casas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT id, code, name FROM house WHERE active ORDER BY code`);
      return rows as { id: string; code: string; name: string }[];
    });

    const eventos: (TimelineEvent & { casa?: string })[] = [];
    const falhas = new Set<string>();
    const porCasa: { casa: string; nome: string; eventos: number }[] = [];

    for (const casa of casas) {
      const r = await this.registry.collect({
        user, houseId: casa.id, date: params.date,
        onlyMine: params.mode === 'minhas',
      });
      r.falhas.forEach((f) => falhas.add(f));
      // A casa vai em cada evento: numa lista de oito unidades, saber QUANDO
      // sem saber ONDE não ajuda ninguém.
      for (const e of r.events) eventos.push({ ...e, casa: casa.code });
      porCasa.push({ casa: casa.code, nome: casa.name, eventos: r.events.length });
    }

    eventos.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return {
      data: params.date,
      modo: params.mode ?? 'casa',
      unidades: porCasa,
      fontes: this.registry.sources,
      incompleta: falhas.size > 0,
      fontesIndisponiveis: [...falhas],
      resumo: resumir(eventos),
      eventos,
      nota: 'Dia completo das unidades que você alcança, das 00h00 às 23h59 no '
          + 'horário de Porto Alegre, em ordem. Não é medição de casa nem de '
          + 'equipe: não há contagem por pessoa nem comparação entre unidades.',
    };
  }

  async day(user: AuthenticatedUser, params: {
    houseId: string; date: string; mode?: TimelineMode; personId?: string;
  }) {
    /*
     * Pedir um acolhido é pedir o modo individual.
     *
     * Antes, `personId` sem `mode=individual` era descartado sem aviso: a tela
     * pedia a linha do tempo da criança e recebia a da casa inteira, com a
     * mesma cara. Nada dava erro; o recorte é que não era o pedido. Numa
     * audiência, ler para o juiz o dia da casa achando que é o dia daquela
     * criança é o tipo de engano que o sistema existe para não deixar acontecer.
     */
    const mode: TimelineMode = params.mode ?? (params.personId ? 'individual' : 'casa');
    const { events, falhas } = await this.registry.collect({
      user, houseId: params.houseId, date: params.date,
      personId: mode === 'individual' ? params.personId : undefined,
      onlyMine: mode === 'minhas',
    });
    if (mode === 'individual' && !params.personId) {
      throw new BadRequestException('Modo individual: informe de qual acolhido.');
    }

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
