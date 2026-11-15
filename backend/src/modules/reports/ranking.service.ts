import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import {
  AVISO_DO_RANKING, FRASE_QUEM_VE_O_RANKING, GRUPOS_DO_RANKING, RANKING_JANELA_MAXIMA_DIAS,
  TIPOS_DE_REGISTRO, ContagensDaCasa, PessoaNoRanking, montarRanking, pessoasEmOrdem,
} from './ranking.regra';

/**
 * O RANKING DAS CASAS E DA EQUIPE (fase 323, pedido e decidido pelo dono em 14/11).
 *
 * O banco devolve contagens (`app_ranking_das_casas`, `app_ranking_das_pessoas`,
 * reports/1727) e recusa quem não é o Gestor Geral nem a Coordenação Geral; a nota e a
 * ordem saem do `ranking.regra.ts`, a mesma conta do protótipo. Nenhuma criança aparece.
 */
@Injectable()
export class RankingService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private periodo(de?: string, ate?: string) {
    const fim = ate || hojeNaInstituicao();
    const d = new Date(`${fim}T12:00:00-03:00`);
    d.setUTCDate(d.getUTCDate() - 29);
    const inicio = de || d.toISOString().slice(0, 10);
    if (inicio > fim) throw new BadRequestException('A data inicial vem depois da final. Confira o período.');
    const dias = Math.round((new Date(`${fim}T12:00:00-03:00`).getTime()
      - new Date(`${inicio}T12:00:00-03:00`).getTime()) / 86_400_000);
    if (dias > RANKING_JANELA_MAXIMA_DIAS) throw new BadRequestException('O período vai até um ano.');
    return { inicio, fim };
  }

  private recusa(e: any): never {
    if (e?.message === 'ranking_fora_do_alcance') throw new ForbiddenException(FRASE_QUEM_VE_O_RANKING);
    if (e?.message === 'fora_de_escopo') throw new ForbiddenException('Esta casa está fora do seu alcance.');
    throw e;
  }

  async dasCasas(user: AuthenticatedUser, de?: string, ate?: string) {
    const { inicio, fim } = this.periodo(de, ate);
    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_ranking_das_casas($1::date, $2::date)`, [inicio, fim]);
      return rows;
    }).catch((e) => this.recusa(e));
    await this.audit.log({
      action: 'painel.ranking', actorId: user.id, institutionId: user.institutionId,
      detail: { de: inicio, ate: fim, casas: linhas.length },
    });
    const contagens: ContagensDaCasa[] = linhas.map((r: any) => ({
      houseId: r.house_id, codigo: r.code, nome: r.name,
      acolhidos: Number(r.acolhidos), equipe: Number(r.equipe),
      piaEmDia: Number(r.pia_em_dia), reavaliacaoEmDia: Number(r.reavaliacao_em_dia),
      comReceita: Number(r.com_receita), receitaEmDia: Number(r.receita_em_dia),
      vacinaEmDia: Number(r.vacina_em_dia), dossieCompleto: Number(r.dossie_completo),
      atas: Number(r.atas), atasSemPendencia: Number(r.atas_sem_pendencia),
      doses: Number(r.doses), dosesNoHorario: Number(r.doses_no_horario),
      chamadas: Number(r.chamadas), chamadasConfirmadas: Number(r.chamadas_confirmadas),
      frequenciaEsperada: Number(r.frequencia_esperada), frequenciaMarcada: Number(r.frequencia_marcada),
      atendimentos: Number(r.atendimentos), visitas: Number(r.visitas),
      registros: Number(r.registros), pessoasQueRegistraram: Number(r.pessoas_que_registraram),
      notasCentavos: Number(r.notas_centavos), notasSemValor: Number(r.notas_sem_valor),
    }));
    return {
      de: inicio, ate: fim, aviso: AVISO_DO_RANKING, grupos: GRUPOS_DO_RANKING,
      casas: montarRanking(contagens),
    };
  }

  async dasPessoas(user: AuthenticatedUser, houseId: string, de?: string, ate?: string) {
    const { inicio, fim } = this.periodo(de, ate);
    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM app_ranking_das_pessoas($1::uuid, $2::date, $3::date)`, [houseId, inicio, fim]);
      return rows;
    }).catch((e) => this.recusa(e));
    await this.audit.log({
      action: 'painel.ranking_pessoas', actorId: user.id, institutionId: user.institutionId, houseId,
      detail: { de: inicio, ate: fim },
    });
    const porId = new Map<string, PessoaNoRanking>();
    for (const r of linhas as any[]) {
      const p = porId.get(r.user_id) ?? {
        id: r.user_id, nome: r.nome, cargo: r.cargo,
        porTipo: Object.fromEntries(TIPOS_DE_REGISTRO.map((t) => [t.chave, 0])), total: 0,
      };
      if (r.tipo) { p.porTipo[r.tipo] = Number(r.quantos); p.total += Number(r.quantos); }
      porId.set(r.user_id, p);
    }
    return {
      de: inicio, ate: fim, houseId, aviso: AVISO_DO_RANKING, tipos: TIPOS_DE_REGISTRO,
      pessoas: pessoasEmOrdem([...porId.values()]),
    };
  }
}
