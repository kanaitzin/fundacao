import { Body, Controller, Get, HttpCode, HttpException, Inject, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { AssistenteService, PedidoDeConversa } from './assistente.service';

/**
 * A Acolhe+AI (fase 192). Toda rota pede sessão: a assistente fala com quem
 * entrou, e com o acesso de quem entrou.
 */
@Controller('assistente')
@UseGuards(SessionGuard)
export class AssistenteController {
  constructor(@Inject(AssistenteService) private readonly acolhe: AssistenteService) {}

  /** Se a instalação tem o modelo ligado. Sem ele, a tela responde pelo guia. */
  @Get('estado')
  estado() { return this.acolhe.estado(); }

  @Post('conversa')
  @HttpCode(200)
  conversar(@CurrentUser() user: AuthenticatedUser, @Body() corpo: PedidoDeConversa) {
    return this.acolhe.conversar(user, corpo);
  }

  /**
   * A mesma volta da conversa, com a resposta aparecendo enquanto é escrita
   * (fase 240). Cada linha é um JSON: `texto` com o que já está escrito, e no
   * fim `fim` com a resposta inteira, igual à da rota de cima. A recusa que vem
   * antes da primeira linha é a de sempre, com o status dela; a que vem depois
   * chega como a última linha, `erro`.
   */
  @Post('conversa/aos-poucos')
  async conversarAosPoucos(@CurrentUser() user: AuthenticatedUser, @Body() corpo: PedidoDeConversa,
                           @Res() res: Response) {
    let comecou = false;
    const comecar = () => {
      if (comecou) return;
      comecou = true;
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Accel-Buffering', 'no');
    };
    const linha = (o: unknown) => { comecar(); res.write(`${JSON.stringify(o)}\n`); };
    try {
      const r = await this.acolhe.conversar(user, corpo, (texto) => linha({ tipo: 'texto', texto }));
      linha({ tipo: 'fim', ...r });
      res.end();
    } catch (e) {
      if (!comecou) throw e;
      const status = e instanceof HttpException ? e.getStatus() : 500;
      const dito = e instanceof HttpException ? (e.getResponse() as { message?: unknown })?.message : undefined;
      linha({ tipo: 'erro', status,
        mensagem: typeof dito === 'string' ? dito : 'A Acolhe+AI não respondeu agora. Tente de novo.' });
      res.end();
    }
  }

  /** A pessoa confirmou uma proposta, e a gravação deu certo: fica na auditoria. */
  @Post('preparado')
  @HttpCode(200)
  preparado(@CurrentUser() user: AuthenticatedUser,
            @Body() corpo: { acao?: unknown; entidadeId?: unknown; casaId?: unknown }) {
    return this.acolhe.registrarPreparado(user, corpo);
  }

  /** A pessoa deixou a assistente mexer na tela, nesta conversa (fase 193). */
  @Post('licenca')
  @HttpCode(200)
  licenca(@CurrentUser() user: AuthenticatedUser, @Body() corpo: { tela?: unknown; casaId?: unknown }) {
    return this.acolhe.registrarLicenca(user, corpo);
  }

  /** Uma tabela da assistente foi baixada como planilha (fase 193). */
  @Post('tabela')
  @HttpCode(200)
  tabela(@CurrentUser() user: AuthenticatedUser,
         @Body() corpo: { linhas?: unknown; colunas?: unknown; casaId?: unknown }) {
    return this.acolhe.registrarTabela(user, corpo);
  }

  @Post('sugestoes')
  sugerir(@CurrentUser() user: AuthenticatedUser,
          @Body() corpo: { texto?: unknown; tela?: unknown; casaId?: unknown }) {
    return this.acolhe.sugerir(user, corpo);
  }

  @Get('sugestoes')
  sugestoes(@CurrentUser() user: AuthenticatedUser, @Query('houseId') casaId?: string) {
    return this.acolhe.sugestoes(user, casaId || undefined);
  }

  /** As palavras que a equipe ensinou (fase 244): as aprovadas, as minhas e, para quem decide, as da casa. */
  @Get('palavras')
  palavras(@CurrentUser() user: AuthenticatedUser) { return this.acolhe.palavras(user); }

  @Post('palavras')
  proporPalavra(@CurrentUser() user: AuthenticatedUser,
                @Body() corpo: { diz?: unknown; querDizer?: unknown; casaId?: unknown }) {
    return this.acolhe.proporPalavra(user, corpo);
  }

  @Post('palavras/:id/decisao')
  @HttpCode(200)
  decidirPalavra(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
                 @Body() corpo: { decisao?: unknown; motivo?: unknown }) {
    return this.acolhe.decidirPalavra(user, id, corpo);
  }
}
