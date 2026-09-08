import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * O QUE A PESSOA LÊ QUANDO O SISTEMA FALHA.
 *
 * Sem este filtro, uma falha não prevista chega à tela como
 * **"Internal server error"** — em inglês, sem pista nenhuma. Foi o que
 * aconteceu ao abrir uma internação para uma criança que não existe: violação
 * de chave estrangeira, 500, e a educadora às onze da noite lendo uma frase
 * que não é dela e não diz o que fazer.
 *
 * E o oposto é pior: repassar a mensagem do Postgres. `new row violates
 * row-level security policy for table "life_milestone"` conta a quem está do
 * outro lado o nome da tabela, a existência da política e a forma do banco —
 * e ainda assim não ajuda ninguém.
 *
 * A regra é uma só: **o detalhe técnico vai para o log, com o caminho e o
 * usuário; a pessoa recebe uma frase em português que diz o que aconteceu e,
 * quando dá, o que fazer.**
 *
 * Este filtro é a última linha. O certo continua sendo cada serviço tratar o
 * erro que ele sabe que pode acontecer, com uma frase que conhece o contexto —
 * "esta criança já tem uma internação aberta" é melhor do que qualquer coisa
 * que se possa escrever aqui. O filtro existe para o que ninguém previu.
 */
@Catch()
export class FalhasEmPortugues implements ExceptionFilter {
  private readonly log = new Logger('Falha');

  /**
   * Os códigos do Postgres que a gente sabe traduzir.
   *
   * A tradução é por CLASSE de erro, e não por tabela: uma frase por tabela
   * envelheceria com o esquema, e uma frase por código diz a coisa certa em
   * qualquer lugar.
   */
  private readonly PORTUGUES: Record<string, { status: number; frase: string }> = {
    // Chave estrangeira: apontaram para uma coisa que não existe.
    '23503': {
      status: HttpStatus.BAD_REQUEST,
      frase: 'Um dos itens indicados não existe mais no sistema — pode ter sido removido '
        + 'ou digitado errado. Recarregue a tela e tente de novo.',
    },
    // Unicidade: já existe.
    '23505': {
      status: HttpStatus.BAD_REQUEST,
      frase: 'Isto já está registrado. Recarregue a tela: provavelmente alguém registrou '
        + 'antes de você, ou o toque foi contado duas vezes.',
    },
    // Restrição de conferência: o dado não cabe na regra.
    '23514': {
      status: HttpStatus.BAD_REQUEST,
      frase: 'Alguma informação não está no formato que o sistema aceita. Confira os '
        + 'campos preenchidos.',
    },
    // Campo obrigatório vazio.
    '23502': {
      status: HttpStatus.BAD_REQUEST,
      frase: 'Falta preencher um campo obrigatório.',
    },
    // RLS: fora do alcance. Nunca dizer QUAL tabela.
    '42501': {
      status: HttpStatus.FORBIDDEN,
      frase: 'Isto está fora do seu alcance. Se você precisa deste acesso para o seu '
        + 'trabalho, fale com a coordenação.',
    },
  };

  catch(erro: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    /* Recusa que o próprio serviço escreveu passa intacta: ela conhece o
     * contexto, e nada aqui vai escrever uma frase melhor. */
    if (erro instanceof HttpException) {
      const corpo = erro.getResponse();
      res.status(erro.getStatus()).json(
        typeof corpo === 'string' ? { statusCode: erro.getStatus(), message: corpo } : corpo);
      return;
    }

    const bruto = erro as { code?: string; message?: string; constraint?: string };
    const codigo = String(bruto?.code ?? '');
    const conhecido = this.PORTUGUES[codigo];

    /*
     * O detalhe técnico vai para o LOG, com o caminho e quem estava. É o que
     * permite descobrir o que aconteceu sem que a pessoa precise ler nada
     * disso — e sem pedir a ela que "mande o print do erro".
     */
    const quem = (req as any).user?.id ?? 'sem sessão';
    this.log.error(
      `${req.method} ${req.originalUrl} · usuário ${quem} · `
      + `${codigo || 'sem código'} ${bruto?.constraint ?? ''} :: ${bruto?.message ?? erro}`);

    if (conhecido) {
      res.status(conhecido.status).json({
        statusCode: conhecido.status, error: 'Erro', message: conhecido.frase,
      });
      return;
    }

    /*
     * O que ninguém previu. A frase não promete que alguém já sabe — promete
     * que ficou registrado, que é a única coisa verdadeira neste ponto. E
     * não pede para "tentar mais tarde": se a pessoa está registrando uma
     * dose às 23h, ela precisa saber que aquilo NÃO foi salvo.
     */
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Erro',
      message: 'Alguma coisa falhou aqui dentro e o que você fez NÃO foi salvo. '
        + 'A falha ficou registrada com o horário. Tente de novo; se repetir, avise a '
        + 'coordenação e diga o que estava fazendo.',
    });
  }
}
