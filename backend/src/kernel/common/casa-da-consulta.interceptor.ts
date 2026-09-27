import {
  CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor, NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../database/database.service';

/**
 * A CASA E A CRIANÇA QUE VÊM PELA CONSULTA (fase 170).
 *
 * A fase 158 pôs a conferência na porta das leituras que recebem o registro
 * na URL (`@RegistroDaRota`): fora do alcance é 404, e não 200 vazio. As que
 * recebem a casa pela CONSULTA (`?houseId=`) ficaram de fora, e a sondagem
 * permanente (`zz-a-sondagem-de-alcance.e2e.spec.ts`) achou 41 delas
 * respondendo 200 vazio à Casa 04: "a Casa 03 não tem chamada, ocorrência,
 * remédio nem acolhido". Nada vazava; o vazio mentia.
 *
 * O conserto é um lugar só, e não 41 (lição da 155): toda leitura que lê
 * `houseId` ou `personId` na consulta passa por aqui, depois da sessão, e a
 * casa ou a criança fora do alcance de quem pede é 404. A rota que confere
 * por outro caminho, de propósito, diz isso com `@CasaConferidaNoServico`, e
 * o motivo fica escrito ao lado.
 */
export const CASA_CONFERIDA_NO_SERVICO = 'rede:casa-conferida-no-servico';
export const CasaConferidaNoServico = (motivo: string) =>
  SetMetadata(CASA_CONFERIDA_NO_SERVICO, motivo);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class CasaDaConsulta implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler) {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as { id?: string } | undefined;
    if (req.method !== 'GET' || !user?.id) return next.handle();
    if (this.reflector.getAllAndOverride(CASA_CONFERIDA_NO_SERVICO, [ctx.getHandler(), ctx.getClass()])) {
      return next.handle();
    }
    const casa = String(req.query?.houseId ?? '');
    const pessoa = String(req.query?.personId ?? '');
    if (!UUID.test(casa) && !UUID.test(pessoa)) return next.handle();
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [x] } = await c.query(
        `SELECT ($1::uuid IS NULL OR app_house_in_scope($1::uuid)) AS casa,
                ($2::uuid IS NULL OR app_person_in_scope($2::uuid)) AS pessoa`,
        [UUID.test(casa) ? casa : null, UUID.test(pessoa) ? pessoa : null]);
      return x;
    });
    if (!r?.casa) throw new NotFoundException('Unidade não encontrada — ou fora do seu alcance.');
    if (!r?.pessoa) throw new NotFoundException('Acolhido não encontrado — ou fora do seu alcance.');
    return next.handle();
  }
}
