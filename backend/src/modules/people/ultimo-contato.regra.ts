/**
 * HÁ QUANTO TEMPO A FAMÍLIA NÃO VISITA (fase 271, pedido de 03/11).
 *
 * As visitas estão registradas no portão desde a fase 160, e as idas à casa da
 * família desde a 118. O que ninguém via de relance era o tempo desde a última:
 * a técnica descobria que a família sumiu quando a criança perguntava. Agora o
 * perfil da criança diz quando foi a última visita e a última ida à família, e
 * há quantos dias, para a técnica procurar a família a tempo.
 *
 * SÓ NO PERFIL DA CRIANÇA, e só para a equipe técnica, a coordenação e a gestão
 * (a regra de 26/09: a contagem de uma criança existe só no perfil dela, e nunca
 * crianças lado a lado). Sem cor e sem limite: o número não julga a família, e
 * quantos dias é muito depende da história de cada uma.
 *
 * ESTE ARQUIVO NÃO IMPORTA NADA: o servidor e o protótipo leem a MESMA frase.
 */

/** Quem lê o tempo desde o último contato: os mesmos que abrem a área restrita. */
export const QUEM_LE_O_ULTIMO_CONTATO = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

/** Os vínculos que contam como família e comunidade; o serviço da rede não conta. */
export const VINCULO_QUE_NAO_CONTA = 'servico_da_rede';

export interface UltimoContato {
  /** AAAA-MM-DD da última visita da família, ou nulo. */
  ultimaVisita: string | null;
  diasDesdeAVisita: number | null;
  /** AAAA-MM-DD da última ida à casa da família, ou nulo. */
  ultimaConvivencia: string | null;
  diasDesdeAConvivencia: number | null;
  frases: string[];
}

function dias(de: string, ate: string): number {
  const ms = (x: string) => Date.UTC(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1, Number(x.slice(8, 10)));
  return Math.max(0, Math.round((ms(ate) - ms(de)) / 86_400_000));
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const ha = (n: number) => (n === 0 ? 'hoje' : n === 1 ? 'há um dia' : `há ${n} dias`);

export function ultimoContato(ultimaVisita: string | null, ultimaConvivencia: string | null,
                              acolhidoDesde: string | null, hoje: string): UltimoContato {
  const v = ultimaVisita?.slice(0, 10) ?? null;
  const c = ultimaConvivencia?.slice(0, 10) ?? null;
  const frases: string[] = [];
  if (v) {
    const n = dias(v, hoje);
    frases.push(n === 0 ? `A última visita da família foi hoje.` : `A última visita da família foi em ${ddmm(v)}, ${ha(n)}.`);
  } else {
    frases.push(acolhidoDesde
      ? `Não há visita da família registrada desde o acolhimento, em ${ddmm(acolhidoDesde.slice(0, 10))}.`
      : 'Não há visita da família registrada.');
  }
  if (c) {
    const n = dias(c, hoje);
    frases.push(n === 0 ? 'A última ida à casa da família começou hoje.'
      : `A última ida à casa da família começou em ${ddmm(c)}, ${ha(n)}.`);
  }
  return {
    ultimaVisita: v, diasDesdeAVisita: v ? dias(v, hoje) : null,
    ultimaConvivencia: c, diasDesdeAConvivencia: c ? dias(c, hoje) : null,
    frases,
  };
}
