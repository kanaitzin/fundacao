import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UseGuards, applyDecorators,
} from '@nestjs/common';

/**
 * O GESTOR GERAL LÊ A CASA, E NÃO REGISTRA NELA (fase 246, decisão de 25/10).
 *
 * A medição de cada setor, botão por botão contra o servidor de verdade, mostrou
 * o Gestor Geral gravando como se fosse da equipe da casa: escrevia episódio e
 * fechava a ATA, lançava atividade no Dia, registrava internação, pedia lanche,
 * registrava reunião e combinado, escrevia a rotina e montava a escala. A
 * Fundação decidiu que nessas sete partes ele acompanha e não registra.
 *
 * NA PORTA, e não em cada serviço, pelo mesmo motivo da `RegistroDaRota`: são
 * cerca de cinquenta rotas em oito partições, e a rota nova esqueceria a
 * conferência. A rota declara `@OGestorSoLe()` e a recusa é uma só. Exportar e
 * baixar o papel continuam livres: ler inclui tirar a folha.
 *
 * O `o-gestor-so-le.spec.ts` lê os controladores e cobra a marca em toda rota de
 * escrita dessas partes, negando por padrão.
 */
@Injectable()
export class GestorSoLe implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (req.user?.role === 'gestor_geral') {
      throw new ForbiddenException(
        'O Gestor Geral acompanha esta parte e não registra nela. Quem registra é a equipe da casa.');
    }
    return true;
  }
}

/** Marca a rota de escrita que o Gestor Geral só lê. */
export const OGestorSoLe = () => applyDecorators(UseGuards(GestorSoLe));
