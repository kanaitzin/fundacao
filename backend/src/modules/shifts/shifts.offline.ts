import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SyncService, OfflineOp } from '../sync';
import { AuthenticatedUser } from '../../kernel/contracts';
import { ShiftsService } from './shifts.service';

/**
 * Operações de plantão feitas sem conexão (§17.1).
 *
 * A passagem é justamente o que mais se escreve com a internet oscilando, de
 * madrugada. O horário REAL vem do aparelho (`happenedAt`) e não é substituído
 * pelo horário da sincronização — se a passagem foi feita às 06h10 e subiu às
 * 09h, a ATA precisa dizer 06h10 (§17.3, §26.2 #16).
 */
@Injectable()
export class ShiftsOfflineHandlers implements OnModuleInit {
  constructor(
    @Inject(SyncService) private readonly sync: SyncService,
    @Inject(ShiftsService) private readonly shifts: ShiftsService,
  ) {}

  onModuleInit() {
    this.sync.registerHandler('handover.sign', (u, op) => this.sign(u, op));
    this.sync.registerHandler('handover.receipt', (u, op) => this.receipt(u, op));
  }

  private async sign(user: AuthenticatedUser, op: OfflineOp) {
    const p = op.payload as any;
    await this.shifts.signHandover(user, p.shiftId, {
      aparelho: op.device, itens: p.itens, contribuicoes: p.contribuicoes,
      pendencias: p.pendencias, orientacoes: p.orientacoes,
      happenedAt: op.happenedAt, offline: true, clientOpId: op.clientOpId,
    }).catch((e) => {
      // Assinatura repetida vinda da fila é reenvio, não erro do educador.
      if (/já assinou/.test(e?.message ?? '')) return { id: '', tardia: false };
      throw e;
    });
    return {};
  }

  private async receipt(user: AuthenticatedUser, op: OfflineOp) {
    const p = op.payload as any;
    await this.shifts.receive(user, p.shiftId, {
      leuOrientacoes: p.leuOrientacoes, assumiuPendencias: p.assumiuPendencias,
      nota: p.nota, offline: true, clientOpId: op.clientOpId,
    }).catch((e) => {
      if (/já confirmou/.test(e?.message ?? '')) return { ok: true };
      throw e;
    });
    return {};
  }
}
