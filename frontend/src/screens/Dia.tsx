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

/** Cargos que podem registrar pelo colega e delegar (§8.2, §8.3). */
const LIDERA = ['lider_diurno', 'lider_noturno_geral', 'coordenador', 'gestor_geral'];

export function Dia({ houseId, casaLabel, papel }: {
  houseId: string; casaLabel: string; papel: string;
}) {
  const lidera = LIDERA.includes(papel);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<'agora' | 'minhas' | 'tudo'>('agora');
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** Qual atividade está com as ações do líder abertas — uma por vez. */
  const [maisAcoes, setMaisAcoes] = useState<string | null>(null);
  const [excecao, setExcecao] = useState<Evento | null>(null);
  const [delegando, setDelegando] = useState<Evento | null>(null);
  const [porOutro, setPorOutro] = useState<Evento | null>(null);
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
                      {/*
                        * AS AÇÕES DO LÍDER FICAM ATRÁS DE UM TOQUE.
                        *
                        * Registrar pelo colega e delegar são atos de quem
                        * conduz o turno, e não do plantão inteiro — mas ficavam
                        * lado a lado com "Concluí", com o mesmo tamanho. Numa
                        * tela de celular isso virava quatro botões iguais em
                        * três linhas por atividade: o cartão ficava mais alto
                        * que a própria atividade, e nenhum botão era o
                        * principal. Quem está com pressa toca no errado.
                        *
                        * O educador continua vendo dois botões. O líder vê os
                        * dois e um "⋯" que abre os dele.
                        *
                        * DELEGAR é o caminho de cima para baixo (§10), e é
                        * diferente de substituição: o pedido de substituição
                        * nasce de quem VAI SAIR; quem faltou não pede nada.
                        */}
                      {lidera && (
                        maisAcoes === ev.id ? (
                          <>
                            <button className="btn sm ghost" disabled={ocupado === ev.id}
                                    onClick={() => setPorOutro(ev)}>
                              Registrar pelo colega
                            </button>
                            <button className="btn sm ghost" disabled={ocupado === ev.id}
                                    onClick={() => setDelegando(ev)}>
                              Passar para outra pessoa
                            </button>
                          </>
                        ) : (
                          <button className="btn sm ghost acoesmais" aria-expanded={false}
                                  aria-label="Mais ações do líder para esta atividade"
                                  onClick={() => setMaisAcoes(ev.id)}>
                            ⋯
                          </button>
                        )
                      )}
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

      {porOutro && (
        <FolhaPorOutro
          evento={porOutro}
          houseId={houseId}
          onFechar={() => setPorOutro(null)}
          onRegistrar={async (realizadoPor, motivo) => {
            const ev = porOutro;
            setPorOutro(null);
            await acao(ev, () => api(`/activities/${idDe(ev)}/record`, {
              method: 'POST',
              body: JSON.stringify({
                estado: 'concluida_no_horario',
                realizadoPor, motivoRegistroPorOutro: motivo,
              }),
            }));
          }}
        />
      )}

      {delegando && (
        <FolhaDelegar
          evento={delegando}
          houseId={houseId}
          onFechar={() => setDelegando(null)}
          onDelegar={async (paraId, motivo) => {
            const ev = delegando;
            setDelegando(null);
            await acao(ev, () => api(`/activities/${idDe(ev)}/delegate`, {
              method: 'POST', body: JSON.stringify({ paraId, motivo }),
            }));
          }} />
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

/**
 * Registrar pelo colega (§8.2).
 *
 * A tela existe porque o caso é real: a atividade aconteceu, o aparelho da
 * casa não pegou e o educador não usa o próprio celular. Sem isto, o buraco no
 * histórico — que é pior do que qualquer registro imperfeito, porque é o que
 * ninguém sabe explicar meses depois.
 *
 * O que ela NÃO faz: assinar no lugar de alguém. Os dois nomes ficam, e o
 * aviso na própria folha diz isso antes de a pessoa confirmar — quem registra
 * precisa saber que o nome dele vai junto.
 */
function FolhaPorOutro({ evento, houseId, onFechar, onRegistrar }: {
  evento: Evento;
  houseId: string;
  onFechar: () => void;
  onRegistrar: (realizadoPor: string, motivo: string) => void;
}) {
  const [equipe, setEquipe] = useState<{ id: string; nome: string }[]>([]);
  const [quem, setQuem] = useState('');
  const [motivo, setMotivo] = useState('');
  const pode = quem !== '' && motivo.trim().length >= 5;

  useEffect(() => {
    // A rota devolve `{equipe}` na agenda e lista simples em outros pontos;
    // aceitar os dois formatos evita que a folha fique vazia por um detalhe
    // de contrato — e uma folha vazia às 23h é a folha que ninguém usa.
    api<any>(`/activities/agenda/staff?houseId=${houseId}`)
      .then((r) => setEquipe(Array.isArray(r) ? r : (r?.equipe ?? [])))
      .catch(() => setEquipe([]));
  }, [houseId]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-por"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-por">Quem realizou?</h3>
        <p className="mutetxt">{evento.title} · {hhmm(evento.at)} · {evento.personName ?? 'Casa toda'}</p>

        <label className="f" htmlFor="quem">A pessoa que realizou a atividade</label>
        <select id="quem" value={quem} onChange={(e) => setQuem(e.target.value)}>
          <option value="">Escolha…</option>
          {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        <label className="f" htmlFor="motivo">
          Por que você está registrando no lugar dela <small>— o fato, não a justificativa</small>
        </label>
        <textarea id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: o aparelho da casa ficou sem sinal e ela não tem acesso pelo celular." />

        <div className="notice c-info" role="status">
          A atividade vai mostrar os <strong>dois nomes</strong>: quem realizou e você, que
          registrou, com este motivo. Ninguém assina no lugar de ninguém.
        </div>

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!pode}
                  onClick={() => onRegistrar(quem, motivo.trim())}>
            Registrar
          </button>
        </div>
      </div>
    </div>
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

/**
 * PASSAR A ATIVIDADE PARA OUTRA PESSOA (§10).
 *
 * Delegar não é substituir. A substituição nasce de quem VAI SAIR e pede;
 * quem faltou não pede nada, e é aí que a atividade some. Delegar é o caminho
 * de cima para baixo: o líder passa adiante, com motivo, sem apagar a
 * designação anterior — e a atividade volta a AGUARDAR CIÊNCIA, porque
 * designado não é o mesmo que avisado.
 */
function FolhaDelegar({ evento, houseId, onFechar, onDelegar }: {
  evento: Evento; houseId: string;
  onFechar: () => void; onDelegar: (paraId: string, motivo: string) => void;
}) {
  const [equipe, setEquipe] = useState<{ id: string; nome: string }[]>([]);
  const [quem, setQuem] = useState('');
  const [motivo, setMotivo] = useState('');
  const pode = quem !== '' && motivo.trim().length >= 5;

  useEffect(() => {
    api<any>(`/activities/agenda/staff?houseId=${houseId}`)
      .then((r) => setEquipe(Array.isArray(r) ? r : (r?.equipe ?? [])))
      .catch(() => setEquipe([]));
  }, [houseId]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-del"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-del">Passar para outra pessoa</h3>
        <p className="mutetxt">
          {evento.title} · {hhmm(evento.at)} · {evento.personName ?? 'Casa toda'}
        </p>
        <div className="notice c-info">
          A designação anterior <b>não é apagada</b>, e a atividade volta a aguardar
          ciência: quem recebe precisa dizer que soube.
        </div>

        <label className="f" htmlFor="del-quem">Quem assume</label>
        <select id="del-quem" value={quem} onChange={(e) => setQuem(e.target.value)}>
          <option value="">Escolha…</option>
          {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        <label className="f" htmlFor="del-motivo">
          Motivo <small>— quem recebe vai ler, e fica no histórico</small>
        </label>
        <textarea id="del-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: Mário foi acompanhar a Lara na consulta; Joana assume o reforço." />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onDelegar(quem, motivo)}>
            Passar adiante
          </button>
        </div>
      </div>
    </div>
  );
}
