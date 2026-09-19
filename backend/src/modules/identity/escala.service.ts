import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { cargoNoDocumento } from '../../kernel/documentos/folha';
import { folhaDaEscala } from './escala-folha';
import { hojeNaInstituicao } from '../../kernel/common/tempo';

/**
 * A ESCALA DA CASA (§5.12, migração 0950).
 *
 * A escala responde a uma pergunta que a casa faz duas vezes: hoje — "quem
 * está no plantão da noite?" — e meses depois — "quem estava na casa naquela
 * noite?". A segunda é a que o Marcelo citou ao pedir a tela, e é ela que
 * decide o desenho: nada se apaga, tudo tem autor, e o período passado se lê
 * inteiro.
 *
 * O que este serviço se recusa a fazer:
 *
 *  * **impedir alguém de trabalhar.** A escala informa; ela não é porta. Quem
 *    cobriu um turno fora dela assina a passagem do mesmo jeito, com o aviso de
 *    que não constava (§12.1);
 *  * **contar plantões por pessoa.** Nenhuma resposta daqui traz total por
 *    gente: somar plantão por nome é medição de pessoa com outro nome (§3.3).
 */
@Injectable()
export class EscalaService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
  ) {}

  /** O período, com os dois turnos de todos os dias — inclusive os vazios. */
  async periodo(user: AuthenticatedUser, houseId: string, de?: string, ate?: string) {
    const hoje = hojeNaInstituicao();
    const inicio = de ?? hoje;
    const fim = ate ?? this.somaDias(inicio, 30);

    const linhas = await this.chamar(user, async (c) => {
      /*
       * A DATA VOLTA COMO TEXTO, e não como `Date`.
       *
       * O driver devolve coluna `date` como objeto Date na meia-noite LOCAL, e
       * `String(objetoDate)` dá "Tue Sep 09 2026 …" — não ISO. O projeto já
       * pagou por isso uma vez: toda autorização de medicamento vigente
       * aparecia como vencida (fase 44). Aqui o efeito seria a tela procurar
       * um dia que nunca casa e mostrar o mês inteiro vazio.
       */
      const { rows } = await c.query(
        `SELECT e.on_date::text AS on_date, e.period, e.assignment_id, e.user_id, e.quem,
                e.cargo, e.cor, e.start_time, e.end_time, e.note,
                e.revoked_at, e.revoke_reason, e.revogou, e.substituiu
           FROM app_escala_do_periodo($1,$2::date,$3::date) e`, [houseId, inicio, fim]);
      return rows;
    });

    const dias = new Map<string, any>();
    for (const r of linhas) {
      const data = String(r.on_date).slice(0, 10);   // já vem ISO do banco
      if (!dias.has(data)) dias.set(data, { data, diurno: [], noturno: [] });
      if (!r.assignment_id) continue;                    // dia/turno sem ninguém
      dias.get(data)[r.period].push({
        id: r.assignment_id, userId: r.user_id, quem: r.quem, cargo: r.cargo,
        /* A cor da PESSOA (0990), que existia desde 09/09 e só a ATA usava.
           Ela é apoio: o nome vai escrito ao lado, sempre — e a folha da
           parede sai em preto e branco na impressora da casa. */
        cor: r.cor ?? null,
        inicio: r.start_time, fim: r.end_time, nota: r.note,
        revogadaEm: r.revoked_at, motivoRevogacao: r.revoke_reason, revogadaPor: r.revogou,
        /* De quem é o lugar que ela ocupou. Sem isto, a tela mostraria uma
           revogação e uma escalação no mesmo dia e turno, sem relação
           nenhuma, e quem lê teria de deduzir a substituição pela
           coincidência. */
        substituiu: r.substituiu ?? null,
      });
    }

    const lista = [...dias.values()].map((d) => ({
      ...d,
      // A tela não recalcula o que é buraco: o servidor diz. Uma segunda
      // definição de "sem ninguém" divergiria da folha impressa no primeiro
      // ajuste — e é a folha que a casa lê na parede.
      diurno: d.diurno.filter((x: any) => !x.revogadaEm),
      noturno: d.noturno.filter((x: any) => !x.revogadaEm),
      revogadas: [...d.diurno, ...d.noturno].filter((x: any) => x.revogadaEm),
    })).map((d) => ({
      ...d,
      semNinguem: [
        ...(d.diurno.length ? [] : ['diurno']),
        ...(d.noturno.length ? [] : ['noturno']),
      ],
    }));

    const buracos = lista.flatMap((d) => d.semNinguem.map((t: string) => ({ data: d.data, turno: t })));

    return {
      de: inicio, ate: fim, dias: lista,
      turnosSemNinguem: buracos,
      aviso: buracos.length
        ? `${buracos.length} turno(s) deste período ainda não têm ninguém escalado. A escala `
          + 'informa quem devia estar; ela não impede ninguém de trabalhar.'
        : 'Todos os turnos deste período têm alguém escalado.',
    };
  }

  /**
   * Escala uma pessoa — e, se pedido, repete a cada N dias até uma data.
   *
   * A repetição é o que torna a tela usável: a alternativa é preencher trinta
   * dias um a um, e uma tela assim volta para o papel na primeira semana. "A
   * cada 2 dias, mesmo turno" é o desenho de uma 12x36.
   */
  async escalar(user: AuthenticatedUser, input: {
    houseId: string; userId: string; data: string; turno: string;
    inicio?: string; fim?: string; nota?: string;
    repetirACada?: number; ate?: string;
  }) {
    if (!input.houseId || !input.userId || !input.data) {
      throw new BadRequestException('Informe a casa, a pessoa e o dia.');
    }
    if (input.repetirACada && !input.ate) {
      throw new BadRequestException(
        'Para repetir, diga até quando — uma repetição sem fim escreveria plantão para sempre.');
    }

    const r = await this.chamar(user, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_escalar($1,$2,$3::date,$4,$5::time,$6::time,$7,$8,$9::date)`,
        [input.houseId, input.userId, input.data, input.turno,
         input.inicio || null, input.fim || null, input.nota ?? null,
         input.repetirACada ?? null, input.ate ?? null]);
      return row;
    });

    await this.audit.log({
      action: 'escala.set', actorId: user.id, houseId: input.houseId,
      entity: 'shift_assignment', entityId: input.userId,
      detail: { data: input.data, turno: input.turno, criadas: r.criadas },
    });

    return {
      criadas: r.criadas, jaExistiam: r.ja_existiam,
      aviso: r.ja_existiam > 0
        ? `${r.criadas} plantão(ões) escalado(s). ${r.ja_existiam} já existia(m) e ficou(aram) `
          + 'como está(vam) — escalar de novo não duplica.'
        : `${r.criadas} plantão(ões) escalado(s).`,
    };
  }

  /** Tira alguém do plantão. Nada é apagado: a linha fica, revogada. */
  async desescalar(user: AuthenticatedUser, id: string, motivo?: string) {
    const mudou = await this.chamar(user, async (c) => {
      const { rows: [r] } = await c.query(`SELECT app_desescalar($1,$2) AS ok`, [id, motivo ?? null]);
      return !!r?.ok;
    });
    if (!mudou) {
      return { ok: true, mudou: false, aviso: 'Este plantão já havia sido retirado da escala.' };
    }
    await this.audit.log({
      action: 'escala.revoke', actorId: user.id,
      entity: 'shift_assignment', entityId: id,
    });
    return {
      ok: true, mudou: true,
      aviso: 'Plantão retirado da escala. A linha continua registrada, com o seu nome e o '
        + 'horário — é ela que responde, meses depois, quem estava escalado naquela noite.',
    };
  }


  /**
   * SUBSTITUIR NUM GESTO — *"substituir ou deixar a menos"* (fase 123).
   *
   * Eram dois atos: Retirar, e depois Escalar outra pessoa. Entre um e outro o
   * turno ficava vazio na tela de quem estivesse olhando, e os dois não se
   * sabiam parentes — três meses depois a escala mostrava uma revogação e uma
   * escalação no mesmo dia, sem relação nenhuma entre si.
   *
   * O banco faz os dois numa transação e guarda o parentesco. *"Deixar a
   * menos" continua existindo* e continua sendo a retirada: uma casa pode
   * mesmo passar o turno com uma pessoa a menos, e exigir substituto em toda
   * retirada seria o sistema cobrando da casa uma pessoa que ela não tem.
   */
  async substituir(user: AuthenticatedUser, id: string, input: {
    novoUserId?: string; motivo?: string;
  }) {
    if (!input?.novoUserId) {
      throw new BadRequestException('Escolha quem entra no lugar.');
    }
    const r = await this.chamar(user, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_substituir_no_plantao($1,$2,$3)`,
        [id, input.novoUserId, input.motivo ?? null]);
      return row;
    });

    /* Duas linhas na auditoria, e não uma: quem procurar "quem saiu da escala
       daquela noite" procura por `escala.revoke`, e quem procurar "quem
       entrou" procura por `escala.set`. Uma ação nova com nome próprio
       esconderia a substituição das duas buscas. */
    await this.audit.log({
      action: 'escala.revoke', actorId: user.id,
      entity: 'shift_assignment', entityId: id,
      detail: { substituicao: true },
    });
    await this.audit.log({
      action: 'escala.set', actorId: user.id,
      entity: 'shift_assignment', entityId: r.novo_id,
      detail: { substituicao: true, substituiu: id },
    });

    return {
      id: r.novo_id, saiu: r.saiu, entrou: r.entrou,
      aviso: `${r.entrou} entrou no lugar de ${r.saiu}, no mesmo dia e turno. A linha de `
        + `${r.saiu} continua registrada, revogada e com o seu nome — é ela que responde, `
        + 'meses depois, quem estava escalado naquela noite.',
    };
  }

  /** A folha da parede. Ver não é exportar: não gera arquivo e não registra. */
  async folha(user: AuthenticatedUser, houseId: string, de?: string, ate?: string) {
    const dados = await this.periodo(user, houseId, de, ate);
    const casa = await this.db.asUser(user.id, async (c) => {
      /* O escopo é conferido ANTES, e não deduzido do rótulo: `app_house_label`
       * filtra por instituição, não por alcance — a folha da outra casa sairia
       * com o título certo e o corpo vazio, que se lê como "ninguém escalado"
       * em vez de "não é sua" (regra 12). */
      const { rows: [e] } = await c.query(`SELECT app_house_in_scope($1) AS pode`, [houseId]);
      if (!e?.pode) return null;
      const { rows: [h] } = await c.query(
        `SELECT app_house_label($1) AS code, app_house_name($1) AS name`, [houseId]);
      return [h?.code, h?.name].filter(Boolean).join(' — ');
    });
    if (!casa) throw new NotFoundException('Unidade não encontrada — ou fora do seu alcance.');

    const linhas = dados.dias.flatMap((d: any) => {
      const dos = (turno: 'diurno' | 'noturno') => (d[turno].length
        ? d[turno].map((p: any) => ({
            data: d.data, turno, quem: p.quem, cargo: p.cargo,
            inicio: p.inicio, fim: p.fim, nota: p.nota,
          }))
        : [{ data: d.data, turno, quem: null, cargo: null, inicio: null, fim: null, nota: null }]);
      return [...dos('diurno'), ...dos('noturno')];
    });

    return folhaDaEscala({
      casa, de: dados.de, ate: dados.ate, linhas,
      autor: { nome: user.fullName, cargo: cargoNoDocumento(user.role) },
    });
  }

  async exportar(user: AuthenticatedUser, houseId: string, finalidade: string,
                 de?: string, ate?: string) {
    const folha = await this.folha(user, houseId, de, ate);
    return this.documentos.exportar(user, folha, {
      entidade: 'shift_assignment', houseId, finalidade,
    });
  }

  // ------------------------------------------------------------------

  /**
   * As recusas do banco viram frase.
   *
   * Sem isto, quem monta a escala de outra casa recebe "new row violates
   * row-level security policy" no meio da montagem do mês — texto de banco no
   * lugar onde a pessoa precisa entender o que fazer (fase 70).
   */
  private async chamar<T>(user: AuthenticatedUser, fn: (c: any) => Promise<T>): Promise<T> {
    try {
      return await this.db.asUser(user.id, fn);
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('escala_inexistente')) throw new NotFoundException('Plantão não encontrado na escala.');
      /*
       * A PESSOA JÁ ESTÁ NESTE TURNO — e a frase é daqui, não do Postgres.
       *
       * O índice `uq_shift_assignment_viva` sempre existiu e sempre recusou;
       * até a fase 123 nada chegava a ele com um chamador humano, porque
       * `app_escalar` trata o `unique_violation` por dentro e devolve
       * "já existiam". A substituição não pode fazer isso — pular em silêncio
       * deixaria a antiga fora e ninguém no lugar —, então a violação sobe. E
       * subiu crua: "duplicate key value violates unique constraint" na tela
       * de quem monta a escala às 6h50. Quem pegou foi o teste da própria
       * fase, pelo log do Nest.
       */
      if (m.includes('uq_shift_assignment_viva') || m.includes('duplicate key')) {
        throw new ConflictException(
          'Esta pessoa já está escalada neste turno. Escolha outra, ou retire o plantão '
          + 'dela antes.');
      }
      if (m.includes('casa_fora_de_escopo')) {
        throw new ForbiddenException('Esta casa está fora do seu alcance.');
      }
      if (m.startsWith('escala:')) {
        const frase = m.replace('escala: ', '');
        throw m.includes('coordenação')
          ? new ForbiddenException(frase)
          : new BadRequestException(frase);
      }
      if (m.includes('row-level security')) {
        throw new ForbiddenException(
          'Quem monta a escala é a coordenação, a equipe técnica ou o Líder Diurno desta casa.');
      }
      throw e;
    }
  }

  private somaDias(iso: string, dias: number): string {
    const d = new Date(`${iso}T12:00:00-03:00`);
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  }
}
