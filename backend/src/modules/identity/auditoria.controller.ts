import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser } from '../../kernel/contracts';
import { AuditoriaService } from './auditoria.service';

/**
 * A LEITURA DA AUDITORIA (fase 112).
 *
 * DUAS ROTAS, E NENHUMA TERCEIRA. Entra-se pela CRIANÇA ou pelo REGISTRO.
 * Não existe `/audit/actor/:id`, e a ausência é a decisão: a mesma tabela que
 * responde "quem abriu o dossiê da Alice" responderia "tudo o que a Joana fez
 * ontem", e a segunda pergunta é vigilância da equipe com outro nome.
 *
 * Quem lê está na §7 e na policy `audit_select` (migração 0920): a coordenação
 * na própria casa, e o Gestor Geral nas oito. O recorte é do BANCO.
 */
@Controller('audit')
@UseGuards(SessionGuard)
export class AuditoriaController {
  constructor(@Inject(AuditoriaService) private readonly auditoria: AuditoriaService) {}

  @Get('person/:personId')
  doAcolhido(@CurrentUser() user: AuthenticatedUser,
             @Param('personId', ParseUUIDPipe) personId: string,
             @Query('dias') dias?: string) {
    return this.auditoria.doAcolhido(user, personId, Number(dias) || 90);
  }

  /*
   * O RASTRO DE UM RELATÓRIO — e o caminho traz a palavra `report` FIXA.
   *
   * A primeira versão era `/audit/entity/:entidade/:id`, genérica. Duas coisas
   * a derrubaram, e as duas são boas:
   *
   *  * o `contrato-rotas.spec` acusou a tela chamando `/audit/entity/report/…`
   *    contra um `:param` do servidor — palavra onde o servidor espera id é
   *    falha silenciosa, e ele existe para pegar exatamente isso;
   *  * e uma porta genérica deixa qualquer um sondar QUALQUER entidade. Cada
   *    tipo de registro que ganhar rastro ganha a sua rota, escrita — que é
   *    mais trabalho e é o ponto.
   *
   * Relatório é o primeiro porque é o que CIRCULA: vai por e-mail, é impresso,
   * fica em cima de uma mesa (§8.13).
   */
  @Get('report/:reportId')
  doRelatorio(@CurrentUser() user: AuthenticatedUser,
              @Param('reportId', ParseUUIDPipe) reportId: string) {
    return this.auditoria.doRegistro(user, 'report', reportId);
  }
}
