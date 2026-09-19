import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser } from '../../kernel/contracts';
import { TrabalhoService } from './trabalho.service';

/**
 * O TRABALHO DA EQUIPE (fase 117) — e por que é um POST.
 *
 * Ler exige FINALIDADE ESCRITA, e finalidade é corpo de requisição, não
 * parâmetro de URL: numa query string ela iria para o log do servidor web, o
 * histórico do navegador e o cabeçalho `Referer` de qualquer imagem da página
 * — três lugares que ninguém auditou e que não obedecem ao RLS. É o mesmo
 * desenho de `POST /people/:id/benefits/view`.
 *
 * **Uma rota, e não duas.** Pessoa e setor são a mesma leitura com um filtro
 * diferente, e o banco recusa os dois juntos. Duas rotas seriam duas
 * superfícies para a mesma regra, e a regra é a parte que não pode divergir.
 */
@Controller('staff')
@UseGuards(SessionGuard)
export class TrabalhoController {
  constructor(@Inject(TrabalhoService) private readonly trabalho: TrabalhoService) {}

  /** Os setores que se pode abrir, a janela máxima e o que a tela precisa dizer. */
  @Get('work/options')
  vocabulario(@CurrentUser() user: AuthenticatedUser) {
    return this.trabalho.vocabulario(user);
  }

  /**
   * AS CONTAGENS (fase 119) — do Gestor Geral, que responde pelas oito casas.
   *
   * POST pelo mesmo motivo da leitura detalhada: a finalidade é corpo, não
   * parâmetro de URL. Contar também é olhar, e olhar fica registrado.
   */
  @Post('work/metrics')
  metricas(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.trabalho.metricas(user, body ?? {});
  }

  @Post('work')
  ver(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.trabalho.ver(user, body ?? {});
  }
}
