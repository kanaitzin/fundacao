import {
  CanActivate, ExecutionContext, Inject, Injectable, NotFoundException, SetMetadata,
  UseGuards, applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../database/database.service';

/**
 * O REGISTRO DA ROTA ESTÁ NO SEU ALCANCE? — perguntado na PORTA (fase 158).
 *
 * O DEFEITO QUE ISTO FECHA, medido em 25/09: 24 leituras por identificador
 * respondiam 200 à coordenação e ao educador de OUTRA casa. Nenhuma devolvia
 * dado — o RLS filtrava tudo —, e é justamente isso que as tornava erradas: a
 * resposta vazia dizia coisas falsas. O dossiê da criança da Casa 03, aberto
 * pela Casa 04, listava cada documento exigido como FALTANDO ("esta criança não
 * tem certidão"); a saúde respondia "nenhum atendimento, nenhuma evolução"; os
 * contatos, as memórias e as idas com a família vinham vazios. É a regra 12:
 * fora do alcance responde como inexistente, nunca como vazio.
 *
 * POR QUE NA PORTA, e não em cada serviço: são 24 rotas de onze partições, e
 * cada uma montava a resposta do seu jeito antes de saber se o registro era de
 * quem pergunta. Conferir em cada serviço seria escrever a mesma pergunta 24
 * vezes, e a rota nova esqueceria. Aqui a rota DECLARA de que tabela é o
 * parâmetro, e a conferência é uma só.
 *
 * A PERGUNTA É O PRÓPRIO RLS: "com a identidade de quem pede, você enxerga esta
 * linha?". Não há regra nova de alcance aqui — a criança transferida continua
 * visível para a casa que a recebeu (§7.2) porque a política dela já diz isso.
 * O que muda é que a recusa chega ANTES da resposta vazia.
 */
export const TABELAS_DA_ROTA = [
  'person', 'house', 'prescription', 'family_stay', 'person_contact',
  'report_document', 'ata', 'incident', 'transfer_request', 'hospitalization',
] as const;
export type TabelaDaRota = (typeof TABELAS_DA_ROTA)[number];

const CHAVE = 'registro-da-rota';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class RegistroNoAlcance implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.get<{ param: string; tabela: TabelaDaRota }>(CHAVE, ctx.getHandler());
    if (!meta) return true;
    const req = ctx.switchToHttp().getRequest();
    const id = String(req.params?.[meta.param] ?? '');
    /* Identificador malformado é pergunta do `ParseUUIDPipe`, com a frase dele;
       sem sessão é pergunta do `SessionGuard`, que já rodou antes deste. */
    if (!UUID.test(id) || !req.user?.id) return true;
    /* A tabela vem de uma lista fechada, e não do pedido: nada aqui é
       interpolado a partir do que a pessoa manda. */
    if (!(TABELAS_DA_ROTA as readonly string[]).includes(meta.tabela)) return true;
    const ve = await this.db.asUser(req.user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT EXISTS (SELECT 1 FROM ${meta.tabela} WHERE id = $1) AS ve`, [id]);
      return r?.ve === true;
    });
    if (!ve) throw new NotFoundException('Não encontrado — ou fora do seu alcance.');
    return true;
  }
}

/**
 * Declara que o parâmetro `param` da rota é uma linha de `tabela`, e confere o
 * alcance na porta. Uso: `@RegistroDaRota('personId', 'person')`.
 */
export const RegistroDaRota = (param: string, tabela: TabelaDaRota) =>
  applyDecorators(SetMetadata(CHAVE, { param, tabela }), UseGuards(RegistroNoAlcance));
