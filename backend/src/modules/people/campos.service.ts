import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { CAMPOS_DO_PERFIL, CODIGOS_DE_CAMPO, FORA_DO_ALCANCE } from './campos-do-perfil';

/** Quem mexe no botão: a coordenação da própria casa, e o gestor geral. */
const DECIDE = ['coordenador', 'gestor_geral'];

@Injectable()
export class CamposDoPerfilService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * O quadro de uma casa: cada campo da lista fechada, ligado ou desligado,
   * com quem decidiu e quando. Quem trabalha na casa pode ler — inclusive o
   * educador, que precisa saber o que está desligado para entender a tela.
   */
  async listar(user: AuthenticatedUser, houseId: string) {
    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows: [casa] } = await c.query(
        `SELECT app_house_in_scope($1) AS alcance`, [houseId]);
      if (!casa?.alcance) return null;
      const { rows } = await c.query(
        `SELECT field_code, visible, reason, changed_at,
                app_user_display_name(changed_by) AS por
           FROM house_field_permission WHERE house_id = $1`, [houseId]);
      return rows;
    });
    if (!linhas) throw new NotFoundException('Casa não encontrada — ou fora do seu alcance.');

    const por = new Map(linhas.map((r: any) => [r.field_code, r]));
    return {
      podeDecidir: DECIDE.includes(user.role),
      campos: CAMPOS_DO_PERFIL.map((campo) => {
        const r: any = por.get(campo.code);
        return {
          ...campo,
          /* Sem linha, ligado: o padrão é ver (migração 1130). */
          visivel: r ? r.visible : true,
          decisao: r ? { por: r.por, em: r.changed_at, motivo: r.reason } : null,
        };
      }),
      foraDoAlcance: FORA_DO_ALCANCE,
    };
  }

  async definir(user: AuthenticatedUser, input: {
    houseId?: string; campo?: string; visivel?: boolean; motivo?: string;
  }) {
    if (!DECIDE.includes(user.role)) {
      throw new ForbiddenException(
        'Ligar e desligar campos do perfil é da coordenação da casa.');
    }
    if (!CODIGOS_DE_CAMPO.includes(String(input.campo))) {
      throw new BadRequestException(
        'Este campo não está na lista do que pode ser ligado e desligado. '
        + `A lista é fechada: ${CAMPOS_DO_PERFIL.map((c) => c.rotulo).join(', ')}.`);
    }
    if (typeof input.visivel !== 'boolean') {
      throw new BadRequestException('Diga se o campo fica à vista do plantão ou não.');
    }
    /*
     * DESLIGAR PEDE MOTIVO; religar, não. Tirar da vista de quem está com a
     * criança às 23h é a decisão que alguém vai ter de explicar depois —
     * inclusive para o próprio educador, que lê o motivo na tela.
     */
    const motivo = String(input.motivo ?? '').trim();
    if (!input.visivel && motivo.length < 15) {
      throw new BadRequestException(
        'Escreva por que este campo sai da vista do plantão — quem estiver com a criança '
        + 'vai ler este motivo quando procurar o dado.');
    }

    const campo = CAMPOS_DO_PERFIL.find((c) => c.code === input.campo)!;
    const ok = await this.db.asUser(user.id, async (c) => {
      const { rows: [casa] } = await c.query(
        `SELECT app_house_in_scope($1) AS alcance`, [input.houseId]);
      if (!casa?.alcance) return false;
      await c.query(
        `INSERT INTO house_field_permission (house_id, field_code, visible, changed_by, reason)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (house_id, field_code) DO UPDATE
            SET visible = EXCLUDED.visible, changed_by = EXCLUDED.changed_by,
                changed_at = now(), reason = EXCLUDED.reason`,
        [input.houseId, input.campo, input.visivel, user.id, input.visivel ? null : motivo]);
      return true;
    });
    if (!ok) throw new NotFoundException('Casa não encontrada — ou fora do seu alcance.');

    await this.audit.log({
      action: input.visivel ? 'perfil.campo.ligado' : 'perfil.campo.desligado',
      actorId: user.id, institutionId: user.institutionId, houseId: input.houseId,
      entity: 'house_field_permission', entityId: input.houseId,
      purpose: input.visivel ? undefined : motivo,
      detail: { campo: input.campo },
    });
    return {
      ok: true,
      aviso: input.visivel
        ? `${campo.rotulo}: à vista do plantão de novo.`
        : `${campo.rotulo}: fora da vista do plantão. Quem procurar o dado vai ler que a `
          + 'coordenação desligou, e o motivo — o campo não some sem explicação.',
    };
  }
}
