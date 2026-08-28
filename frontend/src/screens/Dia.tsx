import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

/**
 * O DIA — a linha do tempo (§9).
 *
 * É a tela mais usada do sistema e a que decide se ele vai ser usado. O
 * educador abre isto no começo do plantão e volta a ela dezenas de vezes;
 * cada toque a mais aqui é um motivo a mais para a equipe voltar ao papel ou
 * ao aplicativo de conversa.
 *
 * As decisões de tela, todas com a mesma razão — velocidade no meio do turno:
 *
 *  * **três filtros, não uma busca.** "Agora", "Minhas" e "Tudo". Quem está
 *    de plantão quer ver o que está acontecendo, não pesquisar;
 *  * **o que já passou não some.** Some do topo, mas continua na lista, com o
 *    estado que recebeu. Sumir esconderia o que ficou sem registro;
 *  * **o resultado é um toque, a exceção é dois.** Concluir é o caminho
 *    comum. Exceção abre a folha com as opções e a justificativa, porque
 *    exceção sem fato não informa nada a quem ler amanhã;
 *  * **estado em palavra, não em cor sozinha.** A cor ajuda; quem enxerga
 *    pouco, ou está no corredor com a tela clara, lê a palavra.
 */

interface Evento {
  id: string;
  source: string;
  at: string;
  kind: string;
  title: string;
  personId: string | null;
  personName: string | null;
  state: string;
  severity: 'normal' | 'atencao' | 'critico';
  responsible?: string | null;
  note?: string | null;
  actions?: { command: string; label: string }[];
}

interface Resposta {
  data: string;
  incompleta: boolean;
  fontesIndisponiveis: string[];
  resumo: { total: number; criticos: number; atencao: number; individuais: number; coletivos: number };
  eventos: Evento[];
}

/** Exceções, com o rótulo que a equipe usa. Justificativa obrigatória (§8.4). */
const EXCECOES = [
  { cod: 'reagendada', label: 'Reagendada' },
  { cod: 'cancelada_externamente', label: 'Cancelada externamente' },
  { cod: 'recusada_pelo_acolhido', label: 'Recusada pelo acolhido' },
  { cod: 'nao_realizada_saude', label: 'Não realizada — saúde' },
  { cod: 'nao_realizada_ausencia_profissional', label: 'Não realizada — ausência profissional' },
  { cod: 'nao_realizada_transporte', label: 'Não realizada — transporte' },
  { cod: 'nao_realizada_decisao_institucional', label: 'Não realizada — decisão institucional' },
  { cod: 'nao_aplicavel', label: 'Não aplicável' },
];

const TOM_SEVERIDADE: Record<string, string> = {
  normal: 'c-info', atencao: 'c-warn', critico: 'c-crit',
};
const ICONE: Record<string, string> = {
  rotina: '🛏️', refeicao: '🍽️', atividade: '🎯', saida: '🚌', medicamento: '💊',
  chamada: '✅', plantao: '🔁', ocorrencia: '⚠️', saude: '🩺',
};

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export function Dia({ houseId, casaLabel }: { houseId: string; casaLabel: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<'agora' | 'minhas' | 'tudo'>('agora');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [excecao, setExcecao] = useState<Evento | null>(null);
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const q = filtro === 'minhas' ? '&mode=minhas' : '';
      setDados(await api<Resposta>(`/timeline?houseId=${houseId}${q}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o dia.');
    }
  }, [houseId, filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  /**
   * "Agora" mostra a janela do momento: o que ainda não foi resolvido e o que
   * acabou de acontecer. Sem isso, no meio da tarde a tela abre nas 7h da
   * manhã e alguém precisa rolar até achar onde está.
   */
  const eventos = useMemo(() => {
    const lista = dados?.eventos ?? [];
    if (filtro !== 'agora') return lista;
    const agora = Date.now();
    const emAberto = lista.filter((e) => !FINALIZADOS.has(e.state));
    const recentes = lista.filter((e) =>
      FINALIZADOS.has(e.state) && Math.abs(new Date(e.at).getTime() - agora) < 2 * 3600_000);
    return [...emAberto, ...recentes].sort((a, b) => a.at.localeCompare(b.at));
  }, [dados, filtro]);

  async function acao(ev: Evento, fn: () => Promise<any>) {
    setOcupado(ev.id); setErro(''); setAviso('');
    try {
      const r = await fn();
      if (r?.aviso) setAviso(r.aviso);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar.');
    } finally {
      setOcupado(null);
    }
  }

  const idDe = (ev: Evento) => ev.id.split(':')[1] ?? ev.id;

  return (
    <>
      <div className="diahead">
        <div>
          <div className="eyebrow" style={{ margin: 0 }}>{casaLabel}</div>
          <h2>Hoje</h2>
        </div>
        {dados && (
          <div className="resumo">
            <span className="pill c-info">{dados.resumo.total} no dia</span>
            {dados.resumo.criticos > 0 && (
              <span className="pill c-crit">{dados.resumo.criticos} crítico(s)</span>
            )}
            {dados.resumo.atencao > 0 && (
              <span className="pill c-warn">{dados.resumo.atencao} em atenção</span>
            )}
          </div>
        )}
      </div>

      <nav className="filtros" aria-label="Filtro do dia">
        {([['agora', 'Agora'], ['minhas', 'Minhas'], ['tudo', 'Tudo']] as const).map(([cod, label]) => (
          <button key={cod} className={filtro === cod ? 'on' : ''}
                  aria-pressed={filtro === cod} onClick={() => setFiltro(cod)}>
            {label}
          </button>
        ))}
      </nav>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      {/* Transparência honesta: a tela diz quando está incompleta (§9). */}
      {dados?.incompleta && (
        <div className="notice c-warn" role="status">
          Parte do dia não carregou ({dados.fontesIndisponiveis.join(', ')}). O que está
          aqui é verdadeiro; o que falta, falta — não confie nesta tela como lista completa
          até recarregar.
        </div>
      )}

      <ol className="linha">
        {eventos.map((ev) => (
          <li key={ev.id} className={`ev ${FINALIZADOS.has(ev.state) ? 'feito' : ''}`}>
            <div className="hora">{hhmm(ev.at)}</div>
            <div className="corpo">
              <div className="tit">
                <span aria-hidden="true" className="ic">{ICONE[ev.kind] ?? '•'}</span>
                <b className="ff">{ev.title}</b>
              </div>
              <div className="mutetxt">
                {ev.personName ?? 'Casa toda'}
                {ev.responsible ? ` · ${ev.responsible}` : ''}
              </div>
              <div className="estado">
                <span className={`pill ${TOM_SEVERIDADE[ev.severity]}`}>{ev.state}</span>
              </div>
              {ev.note && <div className="mutetxt">{ev.note}</div>}

              {(ev.actions ?? []).length > 0 && (
                <div className="acoes">
                  {ev.actions!.some((a) => a.command === 'activity.acknowledge') && (
                    <button className="btn sm ghost" disabled={ocupado === ev.id}
                            onClick={() => acao(ev, () =>
                              api(`/activities/${idDe(ev)}/acknowledge`, { method: 'POST', body: '{}' }))}>
                      Estou ciente
                    </button>
                  )}
                  {ev.actions!.some((a) => a.command === 'activity.record') && (
                    <>
                      <button className="btn sm" disabled={ocupado === ev.id}
                              onClick={() => acao(ev, () =>
                                api(`/activities/${idDe(ev)}/record`, {
                                  method: 'POST',
                                  body: JSON.stringify({ estado: 'concluida_no_horario' }),
                                }))}>
                        Concluí
                      </button>
                      <button className="btn sm ghost" disabled={ocupado === ev.id}
                              onClick={() => setExcecao(ev)}>
                        Não aconteceu
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {dados && eventos.length === 0 && (
        <div className="card">
          <p className="mutetxt" style={{ margin: 0 }}>
            {filtro === 'agora'
              ? 'Nada em aberto agora. Toque em "Tudo" para ver o dia inteiro.'
              : filtro === 'minhas'
                ? 'Nada atribuído a você hoje. O que é do plantão aparece em "Tudo".'
                : 'O dia ainda não foi gerado. Fale com o Líder Diurno.'}
          </p>
        </div>
      )}

      {excecao && (
        <FolhaExcecao
          evento={excecao}
          onFechar={() => setExcecao(null)}
          onRegistrar={async (estado, nota) => {
            const ev = excecao;
            setExcecao(null);
            await acao(ev, () => api(`/activities/${idDe(ev)}/record`, {
              method: 'POST', body: JSON.stringify({ estado, nota }),
            }));
          }}
        />
      )}
    </>
  );
}

const FINALIZADOS = new Set([
  'Concluída no horário', 'Concluída com atraso', 'Reagendada', 'Cancelada externamente',
  'Recusada pelo acolhido', 'Não realizada — saúde', 'Não realizada — ausência profissional',
  'Não realizada — transporte', 'Não realizada — decisão institucional', 'Não aplicável',
]);

/**
 * A folha da exceção.
 *
 * Duas exigências que não são burocracia: a opção diz O QUE aconteceu, e o
 * texto diz o FATO. "Recusada pelo acolhido" sem contexto vira, no relatório
 * de daqui a três meses, uma característica da criança — e não era isso que
 * o educador quis dizer às 19h de uma terça.
 */
function FolhaExcecao({ evento, onFechar, onRegistrar }: {
  evento: Evento;
  onFechar: () => void;
  onRegistrar: (estado: string, nota: string) => void;
}) {
  const [estado, setEstado] = useState('');
  const [nota, setNota] = useState('');
  const podeRegistrar = estado !== '' && nota.trim().length >= 5;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-exc"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-exc">O que aconteceu?</h3>
        <p className="mutetxt">{evento.title} · {hhmm(evento.at)} · {evento.personName ?? 'Casa toda'}</p>

        <div className="opts">
          {EXCECOES.map((x) => (
            <button key={x.cod} type="button" className={`opt c-warn`}
                    aria-pressed={estado === x.cod} onClick={() => setEstado(x.cod)}>
              {x.label}
            </button>
          ))}
        </div>

        <label className="f" htmlFor="nota">
          O fato <small>— o que aconteceu, sem rótulo sobre a pessoa</small>
        </label>
        <textarea id="nota" value={nota} onChange={(e) => setNota(e.target.value)}
                  placeholder="Ex.: o transporte não chegou até as 14h30; a clínica remarcou para sexta." />

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!podeRegistrar}
                  onClick={() => onRegistrar(estado, nota.trim())}>
            Registrar
          </button>
        </div>
        {!podeRegistrar && (
          <p className="mutetxt" style={{ marginBottom: 0 }}>
            Escolha o que aconteceu e descreva o fato — é o que a próxima pessoa vai ler.
          </p>
        )}
      </div>
    </div>
  );
}
