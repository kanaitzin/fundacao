/**
 * O RETORNO DA EXPERIÊNCIA FAMILIAR, na Passagem e na ATA (1070).
 *
 * Um componente só, em dois lugares, porque o dado é um só. O Marcelo pediu
 * que o retorno "ecoasse" na ATA e na passagem — a palavra é dele —, e duas
 * telas desenhando a mesma coisa por conta própria divergem no primeiro
 * ajuste: aí a passagem passa a dizer uma coisa e a ATA outra sobre o mesmo
 * domingo. É a mesma razão pela qual a folha da tela e o `.docx` saem da mesma
 * estrutura (§4.8).
 *
 * A ORDEM É A DA URGÊNCIA DE QUEM CHEGA:
 *
 *   1. quem VOLTOU neste turno — é a novidade, e é o que se conta na passagem;
 *   2. quem SAIU neste turno — a cadeira vazia no jantar tem explicação;
 *   3. quem CONTINUA fora — referência, não novidade. Sem ela, a equipe da
 *      noite não sabe que a criança volta domingo às 18h, e às 20h de sábado
 *      alguém estranha a cama vazia.
 *
 * O QUE ELE NÃO FAZ: não classifica a criança. Não existe "voltou bem" nem
 * "voltou alterada" — o que aparece é o que a pessoa que recebeu escreveu, com
 * o nome dela ao lado. A pílula de atraso fala do RELÓGIO ("previsto 18:00 ·
 * retorno ainda não registrado"), e o sistema não chama isso de evasão: não
 * voltar às 18h e evadir são coisas diferentes até alguém apurar (regra 3).
 */

export interface ConvivenciaDoTurno {
  id: string;
  personId: string;
  acolhido: string;
  comQuem: string;
  vinculo: string;
  /** O que aconteceu NESTE turno — nunca um estado da criança. */
  situacao: 'voltou' | 'saiu' | 'fora';
  saiuEm: string;
  retornoPrevisto: string;
  voltouEm: string | null;
  recebidaPor: string | null;
  /** Como ela chegou, em fato observado. */
  comoChegou: string | null;
  /** O que veio com ela: roupa, remédio, documento, objeto. */
  trouxe: string | null;
  /** A hora prevista passou e o retorno não foi registrado. Do relógio. */
  atrasado: boolean;
}

/**
 * O rótulo de cada vínculo — UM mapa só, que o `Acolhidos.tsx` também usa.
 *
 * Havia duas cópias, e a deste bloco tinha sete dos dez valores: uma saída com
 * "vínculo comunitário" aparecia na passagem como `(vinculo_comunitario)`,
 * com o código cru. Cópia de mapa diverge no primeiro vínculo novo (fase 89).
 */
export const VINCULO: Record<string, string> = {
  genitora: 'mãe', genitor: 'pai', irmao: 'irmão', avo: 'avó/avô', tio: 'tio/tia',
  padrinho: 'padrinho', madrinha: 'madrinha',
  vinculo_comunitario: 'vínculo comunitário', servico_da_rede: 'serviço da rede',
  outro: 'outro',
};

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const diaHora = (iso: string) => new Date(iso).toLocaleString('pt-BR',
  { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo' });

/* Estado operacional, nunca julgamento (regra 7) — e cada um com o rótulo
   escrito, porque nada depende apenas de cor. */
const PILULA: Record<ConvivenciaDoTurno['situacao'], { classe: string; texto: string }> = {
  voltou: { classe: 'c-ok', texto: 'voltou neste turno' },
  saiu: { classe: 'c-move', texto: 'saiu neste turno' },
  fora: { classe: 'c-move', texto: 'está com a família' },
};

export function ConvivenciasDoTurno({ lista, titulo }: {
  lista: ConvivenciaDoTurno[];
  /** A ATA e a passagem chamam o bloco pelo nome que faz sentido em cada uma. */
  titulo?: string;
}) {
  if (!lista.length) return null;
  const voltaram = lista.filter((c) => c.situacao === 'voltou').length;

  return (
    <div className="card stack" style={{ marginTop: 14 }}>
      <div className="eyebrow">
        {titulo ?? 'Experiência familiar neste turno'} · {lista.length}
      </div>
      {voltaram > 0 && (
        <div className="mutetxt">
          {voltaram === 1 ? 'Uma criança voltou' : `${voltaram} crianças voltaram`} neste
          turno. O que veio escrito aqui é o que quem recebeu observou — não é avaliação
          dela.
        </div>
      )}
      <ul className="lista">
        {lista.map((c) => (
          <li key={c.id} className="row">
            <div className="grow">
              <b className="ff">{c.acolhido}</b>
              <div className="mutetxt linhadois">
                com {c.comQuem} ({VINCULO[c.vinculo] ?? c.vinculo})
              </div>

              {c.situacao === 'voltou' && (
                <>
                  <div className="mutetxt">
                    Chegou {hhmm(c.voltouEm!)}
                    {c.recebidaPor ? ` · recebida por ${c.recebidaPor}` : ''}
                  </div>
                  {/*
                    * O fato observado, e o que ela trouxe. Os dois em bloco
                    * próprio: é o que o turno seguinte lê, e enfiá-los na
                    * linha de apoio em cinza os transformaria em detalhe.
                    */}
                  {c.comoChegou && (
                    <div className="bloco"><small>Como chegou</small>{c.comoChegou}</div>
                  )}
                  {c.trouxe && (
                    <div className="bloco"><small>Trouxe de casa</small>{c.trouxe}</div>
                  )}
                  {!c.comoChegou && !c.trouxe && (
                    <div className="mutetxt">
                      Sem observação escrita na chegada. Isso quer dizer que ninguém
                      escreveu — não que não houve nada.
                    </div>
                  )}
                </>
              )}

              {c.situacao === 'saiu' && (
                <div className="mutetxt">
                  Saiu {hhmm(c.saiuEm)} · volta {diaHora(c.retornoPrevisto)}
                </div>
              )}

              {c.situacao === 'fora' && (
                <div className="mutetxt">
                  Fora desde {diaHora(c.saiuEm)} · volta {diaHora(c.retornoPrevisto)}
                </div>
              )}
            </div>

            <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
              <span className={`pill ${PILULA[c.situacao].classe}`}>
                {PILULA[c.situacao].texto}
              </span>
              {/* Sobre o relógio, nunca sobre a criança. */}
              {c.atrasado && c.situacao !== 'voltou' && (
                <span className="pill c-crit">
                  previsto {hhmm(c.retornoPrevisto)} · retorno ainda não registrado
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="mutetxt">
        A vaga na casa continua ocupada em todos os casos acima. Quem está fora não
        entra na chamada, na rotina nem na grade de medicamentos — e o remédio que foi
        com a criança está na folha do perfil dela.
      </div>
    </div>
  );
}
