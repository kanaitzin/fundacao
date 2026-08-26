import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HousesController } from './houses.controller';
import { HousesService } from './houses.service';

@Module({
  imports: [AuthModule],
  controllers: [HousesController],
  providers: [HousesService],
})
export class HousesModule {}
