import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * A DATA QUE VEM DA URL — conferida num lugar só (fase 148).
 *
 * O DEFEITO QUE ISTO FECHA, medido em 22/09: dezesseis rotas recebem data por
 * `@Param` ou `@Query`, nenhuma conferia, e a data ia direto para um `::date` do
 * Postgres. **Sete das dez que eu sondei devolveram 500** — `Internal server
 * error`, sem frase nenhuma — para uma data que não é data. Entre elas a rota que
 * a coordenação usa para corrigir a linha da casa dela na ATA Geral (1440), que
 * existe justamente para o identificador da folha das oito casas não sair do
 * servidor.
 *
 * QUEM CAI NISSO. A tela manda data boa quase sempre — e "quase sempre" é o que
 * esta casa não aceita: um link guardado de outro mês, um endereço digitado à
 * mão, um campo de data do celular que envia metade do valor, uma fila offline
 * que sobe um parâmetro truncado. Quem vê o 500 é quem está de plantão, e ele não
 * diz o que fazer.
 *
 * POR QUE UM LUGAR SÓ, e não uma conferência em cada serviço: é a lição da fase
 * 141 (*"a resposta num lugar só"*). Regra nova sobre data — aceitar `hoje`,
 * recusar data futura, limitar a janela — se escreve aqui, e não em dezesseis
 * lugares dos quais quinze vão esquecer.
 *
 * O QUE ELE NÃO FAZ, de propósito:
 *
 *  * **não inventa a data de hoje.** Vazio passa como vazio, porque quem decide o
 *    que é "hoje" é a instituição, no banco (`app_hoje()`), e não o navegador nem
 *    o servidor de aplicação (§23). Serviço que recebe vazio já sabe o que fazer;
 *  * **não compara duas datas.** `de` depois de `ate` é pergunta sobre o par, e
 *    quem responde é quem monta a janela.
 */
@Injectable()
export class DataDoDia implements PipeTransform<string | undefined, string | undefined> {
  transform(valor: string | undefined): string | undefined {
    const texto = (valor ?? '').trim();
    if (!texto) return undefined;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      throw new BadRequestException(
        'A data precisa vir como 2026-09-22 — ano, mês e dia. '
        + 'Se você chegou aqui por um link antigo, abra a tela pelo menu.');
    }
    /*
     * E TEM DE SER UM DIA QUE EXISTE. A forma passa com `2026-02-30` e com
     * `2026-13-45`; o `Date` do JavaScript "conserta" a primeira virando 2 de
     * março, e é assim que uma consulta responde sobre outro dia sem avisar
     * ninguém. A conferência é a volta: montar a data e comparar o texto.
     */
    const [a, m, d] = texto.split('-').map(Number);
    const feita = new Date(Date.UTC(a, m - 1, d));
    if (feita.getUTCFullYear() !== a || feita.getUTCMonth() + 1 !== m || feita.getUTCDate() !== d) {
      throw new BadRequestException(
        `Não existe o dia ${texto} no calendário. Confira o mês e o dia.`);
    }
    return texto;
  }
}
