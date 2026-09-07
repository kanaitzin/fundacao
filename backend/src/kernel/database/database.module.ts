import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { ConferenciaDeArranque } from './conferencia-de-arranque';

@Global()
@Module({
  providers: [DatabaseService, ConferenciaDeArranque],
  exports: [DatabaseService],
})
export class DatabaseModule {}
