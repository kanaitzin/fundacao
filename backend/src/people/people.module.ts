import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PeopleController, TransfersController, ReportsController } from './people.controller';
import { PeopleService } from './people.service';
import { ProfileService } from './profile.service';
import { BenefitsService } from './benefits.service';
import { TransfersService } from './transfers.service';

@Module({
  imports: [AuthModule],
  controllers: [PeopleController, TransfersController, ReportsController],
  providers: [PeopleService, ProfileService, BenefitsService, TransfersService],
  exports: [PeopleService],
})
export class PeopleModule {}
