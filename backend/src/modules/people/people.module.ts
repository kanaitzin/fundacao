import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { PeopleController, TransfersController, ReportsController } from './people.controller';
import { PeopleService } from './people.service';
import { ProfileService } from './profile.service';
import { BenefitsService } from './benefits.service';
import { TransfersService } from './transfers.service';
import { AdmissionService } from './admission.service';
import { DossieService } from './dossie.service';
import { CredentialsService } from './credentials.service';

@Module({
  imports: [IdentityModule],
  controllers: [PeopleController, TransfersController, ReportsController],
  providers: [PeopleService, ProfileService, BenefitsService, TransfersService, AdmissionService, CredentialsService,
    DossieService],
  exports: [PeopleService],
})
export class PeopleModule {}
