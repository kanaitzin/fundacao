import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * A ALERGIA, A CONDIÇÃO DE SAÚDE E A RESTRIÇÃO ALIMENTAR (fase 166, 1623).
 *
 * As três eram lidas em cinco lugares (o perfil, a chamada do almoço, a folha
 * da cozinha, o resumo de saúde que vai ao hospital, o relatório técnico) e
 * não tinham onde ser escritas. Quem escreve é quem cuida da saúde: Enfermagem,
 * equipe técnica e coordenação (`app_can_edit_health`), na casa da criança.
 *
 * Nada se apaga. A alergia que deixou de valer é ENCERRADA, com o motivo: a
 * pergunta "ela já foi alérgica a isso?" aparece na consulta de daqui a dois
 * anos, e a resposta mora no registro encerrado.
 */
const TIPOS = ['alergia', 'intolerancia', 'condicao'];
const GRAVIDADES = ['leve', 'moderada', 'grave'];
const QUEM_ESCREVE = ['enfermagem', 'equipe_tecnica', 'coordenador', 'gestor_geral'];

@Injectable()
export class SaudeDoPerfilService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private podeEscrever(user: AuthenticatedUser) {
    if (!QUEM_ESCREVE.includes(user.role)) {
      throw new ForbiddenException(
        'Alergias, condições de saúde e restrições alimentares são registradas pela Enfermagem, '
        + 'pela equipe técnica e pela coordenação.');
    }
  }

  private recusaDoBanco(e: any): never {
    if (String(e?.message ?? '').includes('row-level security')) {
      throw new NotFoundException('Acolhido não encontrado, ou fora do seu alcance.');
    }
    throw e;
  }

  async registrarCondicao(user: AuthenticatedUser, personId: string, input: {
    tipo?: string; descricao?: string; gravidade?: string; alertaEssencial?: boolean;
    origem?: string; revisarEm?: string;
  }) {
    this.podeEscrever(user);
    if (!TIPOS.includes(String(input.tipo))) {
      throw new BadRequestException('Diga se é alergia, intolerância ou outra condição de saúde.');
    }
    const descricao = (input.descricao ?? '').trim();
    if (descricao.length < 3) {
      throw new BadRequestException('Escreva a que a criança é alérgica, ou qual é a condição.');
    }
    if (input.gravidade && !GRAVIDADES.includes(input.gravidade)) {
      throw new BadRequestException('A gravidade é leve, moderada ou grave.');
    }
    const id = await this.db.asUser(user.id, async (c) => {
      try {
        const { rows: [r] } = await c.query(
          `INSERT INTO health_condition (person_id, kind, description, severity, essential_alert,
                                         source, review_on, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8) RETURNING id`,
          [personId, input.tipo, descricao, input.gravidade || null, !!input.alertaEssencial,
           (input.origem ?? '').trim() || null, input.revisarEm || null, user.id]);
        return r.id as string;
      } catch (e) { return this.recusaDoBanco(e); }
    });
    await this.audit.log({
      action: 'person.health_condition.add', actorId: user.id,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'health_condition', entityId: id,
      /* Metadado, nunca o conteúdo: o tipo diz o bastante (§20). */
      detail: { tipo: input.tipo, alertaEssencial: !!input.alertaEssencial },
    });
    return {
      id,
      aviso: input.alertaEssencial
        ? 'Registrado, e marcado como alerta essencial: aparece no alto do perfil, na chamada e no '
          + 'resumo de saúde.'
        : 'Registrado. Aparece no perfil e no resumo de saúde.',
    };
  }

  async registrarRestricao(user: AuthenticatedUser, personId: string, input: {
    restricao?: string; substituicao?: string; orientacao?: string; origem?: string; revisarEm?: string;
  }) {
    this.podeEscrever(user);
    const restricao = (input.restricao ?? '').trim();
    if (restricao.length < 2) {
      throw new BadRequestException('Escreva o que a criança não pode comer.');
    }
    const id = await this.db.asUser(user.id, async (c) => {
      try {
        const { rows: [r] } = await c.query(
          `INSERT INTO food_restriction (person_id, restriction, substitution, guidance, source,
                                         review_on, created_by)
           VALUES ($1,$2,$3,$4,$5,$6::date,$7) RETURNING id`,
          [personId, restricao, (input.substituicao ?? '').trim() || null,
           (input.orientacao ?? '').trim() || null, (input.origem ?? '').trim() || null,
           input.revisarEm || null, user.id]);
        return r.id as string;
      } catch (e) { return this.recusaDoBanco(e); }
    });
    await this.audit.log({
      action: 'person.food_restriction.add', actorId: user.id,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'food_restriction', entityId: id, detail: {},
    });
    return { id, aviso: 'Registrado. A restrição aparece na chamada do almoço e na folha da cozinha.' };
  }

  /** Encerra, com motivo. A linha continua no banco, com quem encerrou. */
  async encerrar(user: AuthenticatedUser, qual: 'condicao' | 'restricao', id: string, motivo?: string) {
    this.podeEscrever(user);
    const m = (motivo ?? '').trim();
    if (m.length < 5) {
      throw new BadRequestException('Escreva por que isto deixou de valer.');
    }
    const tabela = qual === 'condicao' ? 'health_condition' : 'food_restriction';
    const pessoa = await this.db.asUser(user.id, async (c) => {
      try {
        const { rows: [r] } = await c.query(
          `UPDATE ${tabela} SET active = false, ended_at = now(), ended_by = $2, end_reason = $3
            WHERE id = $1 AND active RETURNING person_id`, [id, user.id, m]);
        return r?.person_id as string | undefined;
      } catch (e) { return this.recusaDoBanco(e); }
    });
    if (!pessoa) throw new NotFoundException('Registro não encontrado, ou já encerrado.');
    await this.audit.log({
      action: qual === 'condicao' ? 'person.health_condition.end' : 'person.food_restriction.end',
      actorId: user.id, houseId: await this.audit.casaDoAcolhido(user.id, pessoa),
      entity: tabela, entityId: id, detail: {},
    });
    return { ok: true, aviso: 'Encerrado. O registro continua no histórico, com o motivo.' };
  }
}
