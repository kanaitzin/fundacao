/**
 * PORTA PÚBLICA — módulo `sync`
 * Recebe a fila offline, garante idempotência e registra conflitos para
 * decisão humana. Nunca escolhe a versão “certa”.
 */
export { SyncModule } from './sync.module';
export { SyncService } from './sync.service';
export type { OfflineOp } from './sync.service';
