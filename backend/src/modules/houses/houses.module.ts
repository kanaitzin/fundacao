import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { HousesController } from './houses.controller';
import { HousesService } from './houses.service';

@Module({
  imports: [IdentityModule],
  controllers: [HousesController],
  providers: [HousesService],
})
export class HousesModule {}
