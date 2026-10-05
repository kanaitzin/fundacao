import { Logger } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';

/**
 * O QUE RODA SOZINHO DEIXA DITO QUE RODOU (fase 185).
 *
 * O relógio das 5h, o aviso de meia hora antes do fim do plantão e o e-mail
 * anotam aqui como terminaram; o backup e a restauração anotam pelo `psql`, na
 * mesma função do banco. É o que o painel de saúde da implantação lê.
 *
 * SÓ METADADO: números e códigos. Nunca o endereço de e-mail, nunca o corpo,
 * nunca nome de criança ou caminho de arquivo — o tipo do `detalhe` só aceita
 * valores simples para que um objeto inteiro não entre por engano.
 *
 * NUNCA LANÇA. Anotar é secundário: um convite que saiu não pode virar erro
 * para quem convidou porque a anotação falhou.
 */
export type TipoImplantacao = 'relogio' | 'fim_do_plantao' | 'email';

export async function anotarImplantacao(
  db: Pick<DatabaseService, 'query'>,
  tipo: TipoImplantacao,
  ok: boolean,
  detalhe: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  try {
    await db.query('SELECT app_anotar_implantacao($1, $2, $3::jsonb)', [tipo, ok, JSON.stringify(detalhe)]);
  } catch (e) {
    new Logger('Implantacao').warn(
      `não anotou ${tipo}: ${(e as { code?: string })?.code ?? 'sem código'}`);
  }
}
