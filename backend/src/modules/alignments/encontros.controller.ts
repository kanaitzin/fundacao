import {
  Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { CorpoConferido } from '../../kernel/common/data-do-dia.pipe';
import { EncontrosService } from './encontros.service';

/**
 * Os encontros de alinhamento com quem trabalha (fase 322).
 *
 * `comigo` é de todo mundo: cada um lê os próprios. `equipe`, `pessoa` e o registro são
 * da coordenação da casa e da Coordenação Geral, e o banco recusa de novo por baixo.
 */
@Controller('alignments/encontros')
@UseGuards(SessionGuard)
export class EncontrosController {
  constructor(@Inject(EncontrosService) private readonly encontros: EncontrosService) {}

  @Get('vocabulario')
  vocabulario() { return this.encontros.vocabulario(); }

  @Get('comigo')
  comigo(@CurrentUser() user: AuthenticatedUser) { return this.encontros.comigo(user); }

  @Get('equipe')
  equipe(@CurrentUser() user: AuthenticatedUser) { return this.encontros.equipe(user); }

  @Get('pessoa/:pessoaId')
  daPessoa(@CurrentUser() user: AuthenticatedUser,
           @Param('pessoaId', ParseUUIDPipe) pessoaId: string) {
    return this.encontros.daPessoa(user, pessoaId);
  }

  @Post()
  registrar(@CurrentUser() user: AuthenticatedUser, @Body(CorpoConferido) body: any) {
    return this.encontros.registrar(user, body ?? {});
  }

  @Post(':id/ciencia')
  ciencia(@CurrentUser() user: AuthenticatedUser,
          @Param('id', ParseUUIDPipe) id: string, @Body(CorpoConferido) body: any) {
    return this.encontros.ciencia(user, id, body ?? {});
  }

  @Post(':id/adendo')
  adendo(@CurrentUser() user: AuthenticatedUser,
         @Param('id', ParseUUIDPipe) id: string, @Body(CorpoConferido) body: any) {
    return this.encontros.adendo(user, id, body ?? {});
  }
}
