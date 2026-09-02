import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiOuFila } from '../api';
import type { AoEnfileirar } from '../fila-offline';

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
 *  * **filtros, não uma busca.** "Agora", "Minhas" e "Tudo" recortam a mesma
 *    linha; "Por criança" troca a pergunta — de "o que acontece agora" para
 *    "como está cada um". Quem está de plantão quer ver, não pesquisar;
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

/* alcance:urgente — quem cria atividade urgente. Conferido contra `alcance.ts`. */
const CRIA_URGENTE = ['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica',
                      'coordenador', 'gestor_geral'];
/** Quem DECIDE uma substituição — o mesmo alcance do servidor. */
const DECIDE_SUB = ['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica', 'coordenador'];

/**
 * Um pedido de substituição (§8.3).
 *
 * DELEGAR e SUBSTITUIR não são a mesma coisa, e a tela não pode misturá-las:
 * delegar é de cima para baixo — o líder passa a atividade para outra pessoa;
 * o pedido de substituição nasce de QUEM VAI SAIR, e fica em aberto até
 * alguém decidir. Quem faltou não pede nada.
 */
interface Substituicao {
  id: string; atividade: string; horario: string; motivo: string;
  status: string; pedidoPor: string; substituto: string | null;
  decidiuNota: string | null; solicitadoEm: string;
  semEfeito: boolean; aviso?: string;
}

/**
 * O PAINEL DA CASA — a visão dos 20 (§9).
 *
 * `GET /timeline/house-panel` existia desde a fase 3 e nunca teve tela. A linha
 * do dia responde "o que acontece agora"; esta responde a outra pergunta, que
 * é a da troca de turno e a da coordenação passando na casa: **"e a Alice,
 * como está?"** — vinte vezes, sem rolar uma cronologia inteira atrás do nome
 * de cada uma.
 *
 * ORDEM ALFABÉTICA, e nada mais. O servidor devolve assim, e a tela não
 * reordena: ordenar por pendências viraria uma lista das crianças "que dão
 * mais trabalho", com as mesmas no topo todo dia. Isso é ranking de acolhido, e
 * é proibido (§3.3). O número de pendências aparece na linha de cada uma, onde
 * é informação; numa ordenação, viraria juízo.
 */
interface PainelCasa {
  data: string;
  incompleta: boolean;
  fontesIndisponiveis: string[];
  coletivos: { titulo: string; horario: string; estado: string; severidade: string }[];
  acolhidos: {
    acolhidoId: string; nome: string; situacaoAtual: string;
    ultimoRegistro: { titulo: string; horario: string; estado: string } | null;
    proximaAtividade: { titulo: string; horario: string } | null;
    pendencias: number; alertaEssencial: string | null;
  }[];
}

export function Dia({ houseId, casaLabel, papel }: {
  houseId: string; casaLabel: string; papel: string;
}) {
  const lidera = LIDERA.includes(papel);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<'agora' | 'minhas' | 'tudo' | 'os20'>('agora');
  const [painel, setPainel] = useState<PainelCasa | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** Qual atividade está com as ações do líder abertas — uma por vez. */
  const [maisAcoes, setMaisAcoes] = useState<string | null>(null);
  const [excecao, setExcecao] = useState<Evento | null>(null);
  const [delegando, setDelegando] = useState<Evento | null>(null);
  const [porOutro, setPorOutro] = useState<Evento | null>(null);
  const [aviso, setAviso] = useState('');
  /** "Não vou conseguir levar o Bruno na fono" — quem VAI SAIR pede (§8.3). */
  const [pedindoSub, setPedindoSub] = useState<Evento | null>(null);
  const [urgente, setUrgente] = useState(false);
  const [substituicoes, setSubstituicoes] = useState<Substituicao[]>([]);
  const [decidindo, setDecidindo] = useState<Substituicao | null>(null);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      // A visão dos 20 é outra rota, e não um filtro da linha: ela agrupa POR
      // CRIANÇA, e agrupar no navegador daria uma lista diferente da que o
      // servidor monta — com as pendências contadas de outro jeito.
      if (filtro === 'os20') {
        setPainel(await api<PainelCasa>(`/timeline/house-panel?houseId=${houseId}`));
        return;
      }
      const q = filtro === 'minhas' ? '&mode=minhas' : '';
      setDados(await api<Resposta>(`/timeline?houseId=${houseId}${q}`));
      // Falhar aqui não trava o dia: sem a lista de pedidos, a linha do tempo
      // continua servindo o turno.
      setSubstituicoes(await api<Substituicao[]>(
        `/activities/substitutions?houseId=${houseId}`).catch(() => []));
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

  /** Ação que não pertence a uma linha da agenda: pedido e atividade urgente. */
  async function acaoSolta(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try {
      const r = await fn();
      if (r?.aviso) setAviso(r.aviso);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
    }
  }

  const emAberto = substituicoes.filter((s) => s.status === 'solicitada');
  const decididos = substituicoes.filter((s) => s.status !== 'solicitada').slice(0, 5);

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

  /**
   * A ação que sobrevive à falta de sinal (§17.1).
   *
   * Igual à `acao`, com uma diferença: sem internet, o registro fica guardado
   * neste aparelho com o horário em que a atividade aconteceu, e a linha do
   * dia NÃO é recarregada — recarregar sem servidor apagaria da tela o que a
   * pessoa acabou de registrar, e ela registraria de novo.
   */
  async function acaoComFila(
    ev: Evento, path: string, init: RequestInit, offline: AoEnfileirar,
  ) {
    setOcupado(ev.id); setErro(''); setAviso('');
    try {
      const r = await apiOuFila<{ aviso?: string }>(path, init, offline);
      if (r.recusa) { setErro(r.recusa); return; }
      if (r.enfileirada) {
        setAviso('Sem internet. O registro ficou guardado neste aparelho, com a hora de agora, e sobe quando a conexão voltar.');
        return;
      }
      if (r.resposta?.aviso) setAviso(r.resposta.aviso);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar.');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <div className="diahead">
        <div>
          <div className="eyebrow" style={{ margin: 0 }}>{casaLabel}</div>
          <h2>Hoje</h2>
        </div>
        {dados && filtro !== 'os20' && (
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
        {([['agora', 'Agora'], ['minhas', 'Minhas'], ['tudo', 'Tudo'],
           ['os20', 'Por criança']] as const).map(([cod, label]) => (
          <button key={cod} className={filtro === cod ? 'on' : ''}
                  aria-pressed={filtro === cod} onClick={() => setFiltro(cod)}>
            {label}
          </button>
        ))}
      </nav>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      {/* Transparência honesta: a tela diz quando está incompleta (§9). */}
      {filtro !== 'os20' && dados?.incompleta && (
        <div className="notice c-warn" role="status">
          Parte do dia não carregou ({dados.fontesIndisponiveis.join(', ')}). O que está
          aqui é verdadeiro; o que falta, falta — não confie nesta tela como lista completa
          até recarregar.
        </div>
      )}

      {filtro !== 'os20' && (
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
                            onClick={() => acaoComFila(ev,
                              `/activities/${idDe(ev)}/acknowledge`, { method: 'POST', body: '{}' },
                              { kind: 'activity.acknowledge', houseId, payload: { activityId: idDe(ev) } })}>
                      Estou ciente
                    </button>
                  )}
                  {ev.actions!.some((a) => a.command === 'activity.record') && (
                    <>
                      <button className="btn sm" disabled={ocupado === ev.id}
                              onClick={() => acaoComFila(ev,
                                `/activities/${idDe(ev)}/record`,
                                { method: 'POST', body: JSON.stringify({ estado: 'concluida_no_horario' }) },
                                { kind: 'activity.record', houseId,
                                  payload: { activityId: idDe(ev), estado: 'concluida_no_horario' } })}>
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
                      {maisAcoes === ev.id && (
                        /* Pedir substituição é de QUALQUER pessoa do turno —
                           quem vai sair mais cedo é quem sabe que vai. */
                        <button className="btn sm ghost" disabled={ocupado === ev.id}
                                onClick={() => setPedindoSub(ev)}>
                          Não vou conseguir
                        </button>
                      )}
                      {!lidera && maisAcoes !== ev.id && (
                        <button className="btn sm ghost acoesmais" aria-expanded={false}
                                aria-label="Mais ações para esta atividade"
                                onClick={() => setMaisAcoes(ev.id)}>
                          ⋯
                        </button>
                      )}
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
      )}

      {/*
        * A VISÃO DOS 20 (§9).
        *
        * Uma linha por criança, em ordem alfabética — a mesma ordem sempre.
        * Serve à troca de turno e a quem passa na casa: "e a Alice, como
        * está?", sem rolar a cronologia inteira atrás do nome de cada uma.
        *
        * O contador de pendências fica NA LINHA e não ORDENA a lista: ordenar
        * por pendência produziria, todo dia, a mesma lista de crianças no
        * topo — que é ranking de acolhido, e é proibido (§3.3).
        */}
      {filtro === 'os20' && (
        <>
          {painel?.incompleta && (
            <div className="notice c-warn" role="status">
              Parte do dia não carregou ({painel.fontesIndisponiveis.join(', ')}). O que está
              aqui é verdadeiro; o que falta, falta.
            </div>
          )}

          {!painel && !erro && <p className="mutetxt">Abrindo…</p>}

          {painel && painel.coletivos.length > 0 && (
            <>
              <div className="eyebrow">Da casa toda · {painel.coletivos.length}</div>
              <ul className="lista">
                {painel.coletivos.map((c, i) => (
                  <li key={i} className="row">
                    <span className="hora">{hhmm(c.horario)}</span>
                    <span className="grow"><b className="ff">{c.titulo}</b></span>
                    <span className={`pill ${TOM_SEVERIDADE[c.severidade] ?? 'c-info'}`}>
                      {c.estado}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {painel && (
            <>
              <div className="eyebrow">
                Por criança · {painel.acolhidos.length} · em ordem alfabética
              </div>
              {painel.acolhidos.length === 0 && (
                <p className="mutetxt">Nenhum registro individual hoje.</p>
              )}
              <div className="stack">
                {painel.acolhidos.map((a) => (
                  <article className="card stack" key={a.acolhidoId}>
                    <div className="row">
                      <b className="ff grow">{a.nome}</b>
                      {a.pendencias > 0 && (
                        <span className="pill c-crit">
                          {a.pendencias} pendência(s)
                        </span>
                      )}
                    </div>

                    {/* O alerta essencial primeiro: é o que muda o que a
                        pessoa vai fazer nos próximos minutos. */}
                    {a.alertaEssencial && (
                      <div className="notice c-crit" role="alert">⚠ {a.alertaEssencial}</div>
                    )}

                    <div className="mutetxt">{a.situacaoAtual}</div>

                    {a.ultimoRegistro && (
                      <div className="mutetxt">
                        Último: {hhmm(a.ultimoRegistro.horario)} · {a.ultimoRegistro.titulo}
                        {' · '}{a.ultimoRegistro.estado}
                      </div>
                    )}
                    {a.proximaAtividade ? (
                      <div className="mutetxt">
                        A seguir: {hhmm(a.proximaAtividade.horario)} · {a.proximaAtividade.titulo}
                      </div>
                    ) : (
                      <div className="mutetxt">Nada previsto até o fim do dia.</div>
                    )}
                  </article>
                ))}
              </div>
              <p className="mutetxt" style={{ marginTop: 12 }}>
                Esta lista não é ordenada por número de pendências, e não conta nada por
                educador. Ela responde "como está cada um agora" — não "quem dá mais
                trabalho".
              </p>
            </>
          )}
        </>
      )}

      {/*
        * OS PEDIDOS DE SUBSTITUIÇÃO EM ABERTO.
        *
        * Ficam DEPOIS da linha do tempo e não dentro dela: o pedido não é uma
        * atividade, é um recado esperando decisão. Enquanto ele espera, a
        * atividade continua na linha, marcada — e quem decide precisa ver os
        * dois lugares.
        */}
      {emAberto.length > 0 && (
        <>
          <div className="eyebrow">Pedidos de substituição · {emAberto.length}</div>
          <div className="stack">
            {emAberto.map((s) => (
              <article className="card" key={s.id}>
                <div className="row">
                  <div className="grow">
                    <b className="ff">{s.atividade}</b>
                    <div className="mutetxt linhadois">
                      {hhmm(s.horario)} · pedido por {s.pedidoPor}
                    </div>
                  </div>
                  <span className="pill c-warn">Aguardando</span>
                </div>
                <p style={{ margin: '8px 0 0' }}>{s.motivo}</p>
                {/* O pedido ficou sem sentido enquanto esperava: o servidor diz
                    isso, e a tela mostra ANTES de a pessoa tentar decidir. */}
                {s.semEfeito && s.aviso && (
                  <div className="notice c-mute" style={{ marginTop: 8 }}>{s.aviso}</div>
                )}
                {DECIDE_SUB.includes(papel) && (
                  <button className="btn sec sm" onClick={() => setDecidindo(s)}>
                    Decidir
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {/* Os pedidos já decididos ficam legíveis: quem pediu precisa poder ver
          a recusa e o motivo dela sem perguntar a ninguém. */}
      {decididos.length > 0 && (
        <>
          <div className="eyebrow">Substituições decididas hoje</div>
          <ul className="lista">
            {decididos.map((s) => (
              <li key={s.id} className="row">
                <div className="grow">
                  <b className="ff">{s.atividade}</b>
                  <div className="mutetxt linhadois">
                    pedido por {s.pedidoPor}
                    {s.substituto ? ` · assumida por ${s.substituto}` : ''}
                  </div>
                  {s.decidiuNota && <div className="mutetxt">{s.decidiuNota}</div>}
                </div>
                {/* `atribuida` é o valor do banco; "Assumida" é o que a casa diz. */}
                <span className={`pill ${s.status === 'atribuida' ? 'c-ok' : 'c-mute'}`}>
                  {s.status === 'atribuida' ? 'Assumida' : 'Recusada'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* A ATIVIDADE URGENTE (§8.2): o que apareceu agora e não estava na
          agenda. Fica no fim porque é exceção, e exceção não abre a tela. */}
      {CRIA_URGENTE.includes(papel) && (
        <button className="btn sec block" style={{ marginTop: 16 }} onClick={() => setUrgente(true)}>
          + Atividade urgente
        </button>
      )}

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

      {pedindoSub && (
        <FolhaMotivoSimples
          titulo={`Não vou conseguir · ${pedindoSub.title}`}
          explicacao={'O pedido fica EM ABERTO até o líder do turno, a equipe técnica ou a '
            + 'coordenação decidir — e a atividade continua na linha do dia, marcada como '
            + 'aguardando substituição. Ninguém é dado como substituído sozinho.'}
          rotulo="Por que você não vai conseguir"
          exemplo="Ex.: preciso sair às 16h para uma consulta; a fono do Bruno é às 15h e volto tarde."
          botao="Pedir substituição"
          onFechar={() => setPedindoSub(null)}
          onEnviar={async (motivo) => {
            const ev = pedindoSub;
            setPedindoSub(null);
            await acao(ev, () => api(`/activities/${idDe(ev)}/substitution`, {
              method: 'POST', body: JSON.stringify({ motivo }) }));
          }} />
      )}

      {decidindo && (
        <FolhaDecidirSub
          pedido={decidindo} houseId={houseId}
          onFechar={() => setDecidindo(null)}
          onAssumir={async (substitutoId, nota) => {
            const p = decidindo; setDecidindo(null);
            await acaoSolta(() => api(`/activities/substitutions/${p.id}/assign`, {
              method: 'POST', body: JSON.stringify({ substitutoId, nota }) }));
          }}
          onRecusar={async (motivo) => {
            const p = decidindo; setDecidindo(null);
            await acaoSolta(() => api(`/activities/substitutions/${p.id}/decline`, {
              method: 'POST', body: JSON.stringify({ motivo }) }));
          }} />
      )}

      {urgente && (
        <FolhaUrgente
          houseId={houseId}
          onFechar={() => setUrgente(false)}
          onCriar={async (dados) => {
            setUrgente(false);
            await acaoSolta(() => api('/activities/urgent', {
              method: 'POST', body: JSON.stringify({ houseId, ...dados }) }));
          }} />
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
            await acaoComFila(ev,
              `/activities/${idDe(ev)}/record`,
              { method: 'POST', body: JSON.stringify({ estado, nota }) },
              { kind: 'activity.record', houseId, payload: { activityId: idDe(ev), estado, nota } });
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

/**
 * FOLHA DE MOTIVO — o pedido de substituição.
 *
 * O motivo é o que a próxima pessoa vai ler para decidir. "Não posso" não
 * decide nada; "saio às 16h e a fono é às 15h" decide na hora.
 */
function FolhaMotivoSimples({ titulo, explicacao, rotulo, exemplo, botao, onFechar, onEnviar }: {
  titulo: string; explicacao: string; rotulo: string; exemplo: string; botao: string;
  onFechar: () => void; onEnviar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const pode = motivo.trim().length >= 15;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-sub"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-sub">{titulo}</h3>
        <div className="notice c-info">{explicacao}</div>
        <label className="f" htmlFor="sub-txt">
          {rotulo} <small>— pelo menos 15 caracteres</small>
        </label>
        <textarea id="sub-txt" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder={exemplo} />
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onEnviar(motivo.trim())}>
            {botao}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * FOLHA DA DECISÃO — assumir ou recusar um pedido.
 *
 * Recusar EXIGE motivo, e o servidor avisa quem pediu. É o que substitui o
 * recado no corredor: a pessoa que ia sair mais cedo precisa saber, antes de
 * sair, que ninguém vai cobrir — e precisa saber por quê.
 */
function FolhaDecidirSub({ pedido, houseId, onFechar, onAssumir, onRecusar }: {
  pedido: { id: string; atividade: string; motivo: string; pedidoPor: string; semEfeito: boolean };
  houseId: string; onFechar: () => void;
  onAssumir: (substitutoId: string, nota?: string) => void;
  onRecusar: (motivo: string) => void;
}) {
  const [equipe, setEquipe] = useState<{ id: string; nome: string; cargo: string }[]>([]);
  const [quem, setQuem] = useState('');
  const [nota, setNota] = useState('');
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    api<any>(`/activities/agenda/staff?houseId=${houseId}`)
      .then((r) => setEquipe(r?.equipe ?? r ?? []))
      .catch(() => setEquipe([]));
  }, [houseId]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-dec"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-dec">{pedido.atividade}</h3>
        <div className="bloco">
          <small>O que {pedido.pedidoPor} escreveu</small>
          {pedido.motivo}
        </div>

        {pedido.semEfeito && (
          <div className="notice c-warn">
            A atividade já foi encerrada enquanto o pedido esperava. Não cabe substituir o que já
            aconteceu — recusar, com o motivo, é o caminho que fecha isto sem apagar nada.
          </div>
        )}

        {!recusando ? (
          <>
            <label className="f" htmlFor="dec-quem">Quem assume</label>
            <select id="dec-quem" value={quem} onChange={(e) => setQuem(e.target.value)}>
              <option value="">Escolha…</option>
              {equipe.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
            <label className="f" htmlFor="dec-nota">Observação <small>— opcional</small></label>
            <input id="dec-nota" value={nota} onChange={(e) => setNota(e.target.value)}
                   placeholder="Ex.: combinei com a Joana; ela já leva a Alice na mesma clínica." />
            <p className="mutetxt">
              Quem assume recebe o aviso e precisa tomar ciência — o sistema não dá ninguém como
              avisado por ter sido escolhido.
            </p>
            <div className="row rodape">
              <button className="btn sec grow" onClick={() => setRecusando(true)}>
                Não vai ter substituto
              </button>
              <button className="btn grow" disabled={!quem}
                      onClick={() => onAssumir(quem, nota.trim() || undefined)}>
                Passar para esta pessoa
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="f" htmlFor="dec-mot">
              Por que não vai ter substituto <small>— quem pediu vai ler</small>
            </label>
            <textarea id="dec-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex.: não há outra pessoa na escala hoje; a consulta será remarcada pela técnica." />
            <div className="row rodape">
              <button className="btn sec grow" onClick={() => setRecusando(false)}>Voltar</button>
              <button className="btn grow" disabled={motivo.trim().length < 10}
                      onClick={() => onRecusar(motivo.trim())}>
                Recusar, com este motivo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * FOLHA DA ATIVIDADE URGENTE (§8.2).
 *
 * O que apareceu agora e não estava na agenda: a consulta que foi encaixada, a
 * ida ao Conselho, a visita que remarcou. Ela é PONTUAL — não muda a rotina da
 * casa, e a tela diz isso, porque é a confusão mais fácil de fazer: quem quer
 * mudar o horário da janta para sempre precisa da tela da Rotina.
 */
function FolhaUrgente({ houseId, onFechar, onCriar }: {
  houseId: string; onFechar: () => void;
  onCriar: (d: { title: string; scheduledAt: string; reason: string;
                 personId?: string; instructions?: string }) => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [quando, setQuando] = useState('');
  const [motivo, setMotivo] = useState('');
  const [pessoa, setPessoa] = useState('');
  const [instrucoes, setInstrucoes] = useState('');
  const [acolhidos, setAcolhidos] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    api<{ id: string; nome: string }[]>(`/people?houseId=${houseId}`)
      .then(setAcolhidos).catch(() => setAcolhidos([]));
  }, [houseId]);

  const pode = titulo.trim().length >= 3 && quando !== '' && motivo.trim().length >= 10;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-urg"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-urg">Atividade urgente</h3>
        <div className="notice c-info">
          Isto é <b>pontual</b>: entra no dia de hoje, com autoria e motivo, e <b>não altera a
          rotina da casa</b>. Para mudar o horário de sempre, o caminho é a tela da Rotina — e
          lá a mudança abre versão nova.
        </div>

        <label className="f" htmlFor="urg-tit">O que é</label>
        <input id="urg-tit" value={titulo} onChange={(e) => setTitulo(e.target.value)}
               placeholder="Ex.: Consulta encaixada na UBS" />

        <label className="f" htmlFor="urg-quando">Quando</label>
        <input id="urg-quando" type="datetime-local" value={quando}
               onChange={(e) => setQuando(e.target.value)} />

        <label className="f" htmlFor="urg-quem">
          De quem <small>— em branco, é da casa toda</small>
        </label>
        <select id="urg-quem" value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
          <option value="">Da casa toda</option>
          {acolhidos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>

        <label className="f" htmlFor="urg-mot">
          Por que ela é urgente <small>— fica registrado com o seu nome</small>
        </label>
        <textarea id="urg-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: a UBS ligou agora oferecendo a vaga que estava na fila desde março." />

        <label className="f" htmlFor="urg-ins">
          Como se faz <small>— opcional, e é o que evita a pergunta no meio do turno</small>
        </label>
        <textarea id="urg-ins" value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)}
                  placeholder="Ex.: levar a carteirinha e a caderneta de vacinação; a van sai às 13h30." />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onCriar({
            title: titulo.trim(), scheduledAt: new Date(quando).toISOString(),
            reason: motivo.trim(), personId: pessoa || undefined,
            instructions: instrucoes.trim() || undefined,
          })}>
            Registrar atividade urgente
          </button>
        </div>
      </div>
    </div>
  );
}
