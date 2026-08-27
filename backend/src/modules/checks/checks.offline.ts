import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SyncService, OfflineOp } from '../sync';
import { AuthenticatedUser } from '../../kernel/contracts';
import { ChecksService } from './checks.service';

/**
 * Aplicador das marcações de chamada feitas offline (§17).
 *
 * **Por que passa pelo serviço.** Escrevendo direto na tabela, a fila não
 * validava a opção contra a lista do tipo de chamada (a coluna é `text`, sem
 * CHECK) e não exigia a justificativa que toda opção de exceção exige
 * (§10). Pela API, marcar "Recusou" no almoço sem dizer o que houve dá 400;
 * pela fila, entrava vazio — e a chamada era confirmada como completa.
 *
 * Estar sem sinal não afrouxa a regra: se não passa, vira conflito para
 * decisão humana (§17.4).
 */
@Injectable()
export class ChecksOfflineHandlers implements OnModuleInit {
  constructor(
    @Inject(SyncService) private readonly sync: SyncService,
    @Inject(ChecksService) private readonly checks: ChecksService,
  ) {}

  onModuleInit() {
    this.sync.registerHandler('check.mark', (u, op) => this.mark(u, op));
  }

  private async mark(user: AuthenticatedUser, op: OfflineOp) {
    const p = op.payload as any;
    const r = await this.checks.mark(user, p.checkId, {
      personId: p.personId, opcao: p.opcao, nota: p.nota,
      offline: true, clientOpId: op.clientOpId, happenedAt: op.happenedAt,
    });
    return { duplicada: !!(r as any).duplicada };
  }
}
