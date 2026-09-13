import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { MedicationsService } from '../medications';
import { ActivitiesService, AgendaService } from '../activities';
import { AniversariosService } from '../people';
import { hojeNaInstituicao } from '../../kernel/common/tempo';

/**
 * O RELÓGIO — o que roda sozinho, todo dia, em todas as casas (fase 103).
 *
 * Seis rotas de máquina existiam desde as primeiras fases, cada uma com o
 * motivo escrito de não ter tela: "roda por relógio, e não por alguém apertando
 * um botão". **E não havia relógio.** Ninguém as chamava — nem cron, nem
 * script, nem nada. No dia em que o piloto começasse, a Casa 03 abriria o
 * sistema e encontraria o dia VAZIO: sem doses geradas a partir das
 * prescrições, sem as atividades da rotina, sem aviso de dose atrasada, sem
 * aniversário. Tudo funcionando, e nada acontecendo.
 *
 * É o tipo de buraco que nenhum teste pegava, porque cada rota tem a sua suíte
 * e todas passam — chamadas pelo teste.
 *
 * COMO ELE SE IDENTIFICA. As rotinas escrevem no banco e ficam na auditoria,
 * então precisam de um nome. O relógio roda em nome de uma conta de verdade,
 * indicada em `RELOGIO_USER_EMAIL` — a instituição escolhe qual, e o §12 diz
 * que ela deve existir para isso e não ser de uma pessoa: quem ler a auditoria
 * seis meses depois precisa distinguir "o sistema gerou" de "a enfermeira
 * gerou".
 *
 * O QUE ELE NÃO FAZ: decidir. Nenhuma rotina aqui julga, encerra ou assina
 * nada — gera o que a prescrição e a rotina já mandavam gerar, e avisa o que já
 * estava atrasado. Relógio que decide é relógio que erra sozinho de madrugada.
 */
@Injectable()
export class RelogioService {
  private readonly log = new Logger('Relogio');

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MedicationsService) private readonly meds: MedicationsService,
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(AgendaService) private readonly agenda: AgendaService,
    @Inject(AniversariosService) private readonly aniversarios: AniversariosService,
  ) {}

  /** A conta em nome de quem o relógio escreve. */
  async quemSou(email?: string): Promise<AuthenticatedUser> {
    const alvo = (email ?? process.env.RELOGIO_USER_EMAIL ?? '').trim();
    if (!alvo) {
      throw new NotFoundException(
        'Defina RELOGIO_USER_EMAIL com a conta em nome de quem as rotinas do dia rodam. '
        + 'Ela aparece na auditoria de tudo o que for gerado.');
    }
    /* Por função (1210): `app_user` tem RLS, e aqui ainda não há identidade —
       a consulta direta voltava vazia e dizia que a conta não existia. */
    const { rows: [u] } = await this.db.query(
      `SELECT * FROM app_conta_do_relogio($1)`, [alvo]);
    if (!u || !u.active) {
      throw new NotFoundException(
        `A conta do relógio (${alvo}) não existe ou está inativa. As rotinas do dia não rodaram.`);
    }
    return {
      id: u.id, email: u.email, fullName: u.full_name, role: u.role,
      institutionId: u.institution_id, sessionId: 'relogio',
    } as AuthenticatedUser;
  }

  /**
   * Roda as rotinas do dia em todas as casas que a conta alcança.
   *
   * Uma casa que falha NÃO derruba as outras: o erro é registrado e a volta
   * continua. Numa instituição de oito casas, parar na segunda deixaria seis
   * sem o dia gerado, e o motivo estaria num log que ninguém lê às 6h.
   */
  async rodarODia(user: AuthenticatedUser, data?: string) {
    const dia = data ?? hojeNaInstituicao();
    const casas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT id, code FROM house WHERE app_house_in_scope(id) ORDER BY code`);
      return rows as { id: string; code: string }[];
    });

    const resultado: { casa: string; rotina: string; erro?: string }[] = [];
    const rotinas: [string, (casa: string) => Promise<unknown>][] = [
      ['doses', (casa) => this.meds.generateDoses(user, casa, dia)],
      ['atividades do dia', (casa) => this.activities.generateDay(user, casa, dia)],
      ['compromissos', (casa) => this.agenda.gerarDoDia(user, casa, dia)],
      ['dose atrasada', (casa) => this.meds.escalateOverdue(user, casa)],
      ['atividade não confirmada', (casa) => this.activities.markUnconfirmed(user, casa)],
      ['aniversários', (casa) => this.aniversarios.avisarDaCasa(user, casa)],
    ];

    for (const casa of casas) {
      for (const [nome, rodar] of rotinas) {
        try {
          await rodar(casa.id);
          resultado.push({ casa: casa.code, rotina: nome });
        } catch (e) {
          const erro = e instanceof Error ? e.message : String(e);
          this.log.error(`${casa.code} · ${nome}: ${erro}`);
          resultado.push({ casa: casa.code, rotina: nome, erro });
        }
      }
    }

    const falhas = resultado.filter((r) => r.erro);
    await this.audit.log({
      action: 'relogio.dia', actorId: user.id, institutionId: user.institutionId,
      detail: { dia, casas: casas.length, rotinas: resultado.length, falhas: falhas.length },
    });
    return {
      dia, casas: casas.length,
      rodadas: resultado.length - falhas.length,
      falhas: falhas.map((f) => `${f.casa} · ${f.rotina}: ${f.erro}`),
    };
  }
}
