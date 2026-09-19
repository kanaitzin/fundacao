import { Global, Module } from '@nestjs/common';
import { ArquivosService } from './arquivos.service';

/**
 * Global como o `AuditModule`, e pelo mesmo motivo: guardar documento é
 * infraestrutura, não domínio. Um módulo que precise dela não deve ter de
 * declarar dependência de outro módulo para isso.
 */
@Global()
@Module({
  providers: [ArquivosService],
  exports: [ArquivosService],
})
export class ArquivosModule {}
