import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

/**
 * A AGENDA (§7, §8).
 *
 * É onde a semana da casa é decidida: a fono de toda terça, a consulta do dia
 * 12, o remédio que não tem data para acabar, o curso das quintas. Quem marca
 * é o Líder Diurno, a equipe técnica, a coordenação e a Enfermagem; o
 * educador vê o que vem, e executa na linha do tempo do dia.
 *
 * Duas ideias sustentam a tela inteira:
 *
 *  * **compromisso é REGRA, o dia é ocorrência.** Marcar a fono de toda terça
 *    não cria cinquenta linhas hoje: cria uma regra, e cada terça vira linha
 *    quando a terça chega. Por isso "Próximos dias" é uma projeção — mudar o
 *    horário da fono não reescreve as terças que já passaram;
 *  * **o responsável é escolhido na hora de marcar.** "Quem estiver no
 *    plantão" serve para a rotina; um nome serve para o que precisa de
 *    preparo — consulta, saída, audiência. Nomear quem está de folga AVISA e
 *    não impede: escala muda, e troca de plantão existe.
 */

interface Opcoes {
  tipos: { cod: string; label: string }[];
  recorrencias: { cod: string; label: string }[];
  diasSemana: { n: number; label: string }[];
  responsaveis: { cod: string; label: string; ajuda: string }[];
}
interface Ocorrencia {
  compromissoId: string; em: string; hora: string; duracaoMin: number | null;
  tipo: string; titulo: string; local: string | null;
  personId: string | null; pessoa: string; coletivo: boolean;
  recorrencia: string; indeterminado: boolean;
  horaSaida: string | null; endereco: string | null;
  desmarcada: boolean; motivoDesmarque: string | null;
}
interface Vigente {
  id: string; tipo: string; titulo: string; local: string | null;
  pessoa: string; coletivo: boolean;
  inicio: string; fim: string | null; indeterminado: boolean; motivoSemPrazo: string | null;
  hora: string; duracaoMin: number | null; recorrencia: string; diasSemana: number[] | null;
  responsavel: string | null; responsavelNomeado: boolean; observacaoResponsavel: string | null;
  marcadoPor: string | null;
}
interface Pessoa { id: string; nome: string }
interface Profissional { id: string; nome: string; cargo: string; naEscala: boolean }

/** Quem marca (§7). A tela não oferece o botão a quem o servidor vai recusar. */
const QUEM_MARCA = ['lider_diurno', 'equipe_tecnica', 'coordenador', 'gestor_geral', 'enfermagem'];
/*
 * Desmarcar UMA data é mais estreito que marcar: o líder e a enfermagem
 * encerram a série, mas não desmarcam a quarta da Ana. Desmarcar um
 * atendimento é reorganizar o plano da criança, e isso é da técnica.
 */
const QUEM_DESMARCA = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

const hoje = () => new Intl.DateTimeFormat('en-CA',
  { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date());
const maisDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaLongo = (iso: string) => new Date(`${iso}T12:00:00`)
  .toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

export function Agenda({ houseId, papel }: { houseId: string; papel: string }) {
  const [vista, setVista] = useState<'proximos' | 'vigentes'>('proximos');
  const [dias, setDias] = useState(14);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [vigentes, setVigentes] = useState<Vigente[]>([]);
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [marcando, setMarcando] = useState(false);
  const [encerrando, setEncerrando] = useState<Vigente | null>(null);
  const [desmarcando, setDesmarcando] = useState<Ocorrencia | null>(null);
  const [motivoDesmarque, setMotivoDesmarque] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const podeMarcar = QUEM_MARCA.includes(papel);
  const podeDesmarcar = QUEM_DESMARCA.includes(papel);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const de = hoje();
      const [proj, vig] = [
        await api<Ocorrencia[]>(`/activities/agenda?houseId=${houseId}&de=${de}&ate=${maisDias(de, dias)}`),
        await api<Vigente[]>(`/activities/agenda/commitments?houseId=${houseId}`),
      ];
      setOcorrencias(proj); setVigentes(vig);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a agenda.');
    }
  }, [houseId, dias]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    (async () => {
      try {
        setOpcoes(await api<Opcoes>('/activities/agenda/options'));
        setPessoas(await api<Pessoa[]>(`/people?houseId=${houseId}`));
      } catch { /* a tela de leitura funciona sem as listas do formulário */ }
    })();
  }, [houseId]);

  /**
   * Desmarcar UMA ocorrência. Não encerra o compromisso: o acompanhamento
   * continua valendo na semana que vem, e a data desmarcada continua na tela.
   */
  async function desmarcar(o: Ocorrencia, motivo: string) {
    setErro(''); setAviso('');
    try {
      await api(`/activities/agenda/${o.compromissoId}/skip`, {
        method: 'POST', body: JSON.stringify({ data: o.em, motivo }),
      });
      setDesmarcando(null); setMotivoDesmarque('');
      setAviso('Desmarcado só neste dia. O compromisso continua valendo nas próximas datas.');
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível desmarcar.');
    }
  }

  async function remarcar(o: Ocorrencia) {
    setErro(''); setAviso('');
    try {
      await api(`/activities/agenda/${o.compromissoId}/unskip`, {
        method: 'POST', body: JSON.stringify({ data: o.em }),
      });
      setAviso('Remarcado. Volta a aparecer na lista do dia.');
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remarcar.');
    }
  }

  async function encerrar(c: Vigente, motivo: string) {
    setErro(''); setAviso('');
    try {
      const r = await api<{ aviso?: string }>(`/activities/agenda/${c.id}/cancel`, {
        method: 'POST', body: JSON.stringify({ motivo }),
      });
      setEncerrando(null);
      setAviso(r?.aviso ?? 'Compromisso encerrado.');
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível encerrar o compromisso.');
    }
  }

  // Agrupa a projeção por dia: é assim que se lê uma agenda.
  const porDia = new Map<string, Ocorrencia[]>();
  for (const o of ocorrencias) {
    const chave = String(o.em).slice(0, 10);
    porDia.set(chave, [...(porDia.get(chave) ?? []), o]);
  }

  return (
    <>
      <div className="diahead">
        <div><h2>Agenda</h2></div>
        <div className="resumo">
          <span className="pill c-info">{vigentes.length} compromisso(s)</span>
        </div>
      </div>

      <nav className="filtros" aria-label="Vista da agenda">
        {([['proximos', 'Próximos dias'], ['vigentes', 'O que está marcado']] as const).map(([cod, label]) => (
          <button key={cod} className={vista === cod ? 'on' : ''}
                  aria-pressed={vista === cod} onClick={() => setVista(cod)}>
            {label}
          </button>
        ))}
      </nav>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      {podeMarcar && (
        <button className="btn block" onClick={() => setMarcando(true)}>
          Marcar compromisso
        </button>
      )}

      {vista === 'proximos' ? (
        <>
          {porDia.size === 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <p className="mutetxt" style={{ margin: 0 }}>
                Nada marcado nos próximos {dias} dias.
              </p>
            </div>
          )}
          {[...porDia.entries()].map(([d, itens]) => (
            <section key={d} className="passagem">
              <div className="eyebrow">{diaLongo(d)}</div>
              <ol className="doses">
                {itens.map((o) => (
                  <li key={`${o.compromissoId}:${o.em}`}
                      style={o.desmarcada ? { background: 'var(--sunken)' } : undefined}>
                    {/* O desmarcado recua pelo FUNDO, nunca por opacidade: a
                        lição de contraste de 02/09 vale aqui também. */}
                    <span className="hora">{o.horaSaida ?? o.hora}</span>
                    <div className="grow">
                      <b className="ff">{o.titulo}</b>
                      <div className="mutetxt">
                        {o.pessoa}
                        {o.local ? ` · ${o.local}` : ''}
                        {o.duracaoMin ? ` · ${o.duracaoMin} min` : ''}
                      </div>
                      {o.horaSaida && (
                        <div className="mutetxt">
                          Sair {o.horaSaida} · estar lá {o.hora}
                          {o.endereco ? ` · ${o.endereco}` : ''}
                        </div>
                      )}
                      {!o.horaSaida && o.endereco && (
                        <div className="mutetxt">{o.endereco}</div>
                      )}
                      {o.desmarcada && (
                        <div className="estado">
                          <span className="pill c-crit">desmarcado</span>
                          <span className="mutetxt"> {o.motivoDesmarque}</span>
                        </div>
                      )}
                      {o.indeterminado && !o.desmarcada && (
                        <div className="estado">
                          <span className="pill c-mute">sem data para terminar</span>
                        </div>
                      )}
                      {podeDesmarcar && !o.desmarcada && (
                        <button className="btn sec sm" style={{ marginTop: 6 }}
                                onClick={() => { setDesmarcando(o); setMotivoDesmarque(''); }}>
                          Desmarcar este dia
                        </button>
                      )}
                      {podeDesmarcar && o.desmarcada && (
                        <button className="btn sec sm" style={{ marginTop: 6 }}
                                onClick={() => remarcar(o)}>
                          Remarcar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {porDia.size > 0 && dias < 60 && (
            <button className="btn sec block" style={{ marginTop: 14 }}
                    onClick={() => setDias(dias + 30)}>
              Ver mais 30 dias
            </button>
          )}
          <p className="mutetxt">
            Esta lista é projeção: mostra os dias em que cada compromisso cai, sem criar nada.
            Cada dia vira linha do tempo quando o dia chega.
          </p>
        </>
      ) : (
        <>
          {vigentes.length === 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <p className="mutetxt" style={{ margin: 0 }}>Nenhum compromisso vigente nesta casa.</p>
            </div>
          )}
          <div className="stack" style={{ marginTop: 12 }}>
            {vigentes.map((c) => (
              <article key={c.id} className="card">
                <div className="row">
                  <b className="ff grow">{c.titulo}</b>
                  <span className="pill c-mute">{c.hora}</span>
                </div>
                <div className="mutetxt">
                  {c.pessoa} · {rotuloRepeticao(c, opcoes)}
                  {c.local ? ` · ${c.local}` : ''}
                </div>
                <div className="mutetxt">
                  Responsável: {c.responsavelNomeado ? c.responsavel : 'quem estiver no plantão do horário'}
                </div>
                {/* A frase do "sem prazo" fica à vista de quem revisa: é o que
                    separa o indeterminado por laudo do indeterminado por
                    esquecimento. */}
                {c.indeterminado && c.motivoSemPrazo && (
                  <p className="bloco"><small>Sem data para terminar</small>{c.motivoSemPrazo}</p>
                )}
                {podeMarcar && (
                  <div className="acoes">
                    <button className="btn sm ghost" onClick={() => setEncerrando(c)}>Encerrar</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {marcando && opcoes && (
        <FolhaMarcar
          houseId={houseId} opcoes={opcoes} pessoas={pessoas}
          onFechar={() => setMarcando(false)}
          onPronto={async (msg) => { setMarcando(false); setAviso(msg); await carregar(); }}
        />
      )}

      {desmarcando && (
        <FolhaDesmarcar ocorrencia={desmarcando}
                        motivo={motivoDesmarque} setMotivo={setMotivoDesmarque}
                        onFechar={() => setDesmarcando(null)}
                        onDesmarcar={() => desmarcar(desmarcando, motivoDesmarque.trim())} />
      )}
      {encerrando && (
        <FolhaEncerrar compromisso={encerrando}
                       onFechar={() => setEncerrando(null)}
                       onEncerrar={(motivo) => encerrar(encerrando, motivo)} />
      )}
    </>
  );
}

function rotuloRepeticao(c: Vigente, opcoes: Opcoes | null): string {
  const base = opcoes?.recorrencias.find((r) => r.cod === c.recorrencia)?.label ?? c.recorrencia;
  if (!['semanal', 'quinzenal'].includes(c.recorrencia) || !c.diasSemana?.length) return base;
  const nomes = c.diasSemana
    .map((n) => opcoes?.diasSemana.find((d) => d.n === n)?.label ?? String(n))
    .join(', ');
  return `${base}: ${nomes}`;
}

/**
 * A folha de marcar.
 *
 * O formulário mais longo do sistema, e o único que pede paciência — porque
 * marcar é raro e errar aqui repete o erro por meses. Cada campo que parece
 * exigência tem um motivo operacional: o dia da semana, porque "toda terça"
 * precisa saber qual é a terça; o motivo do prazo aberto, porque alguém vai
 * revisar isto em março e precisa saber se ainda vale.
 */
function FolhaMarcar({ houseId, opcoes, pessoas, onFechar, onPronto }: {
  houseId: string; opcoes: Opcoes; pessoas: Pessoa[];
  onFechar: () => void; onPronto: (aviso: string) => void;
}) {
  const [personId, setPersonId] = useState('');       // '' = casa toda
  const [tipo, setTipo] = useState('atividade');
  const [titulo, setTitulo] = useState('');
  const [local, setLocal] = useState('');
  const [orientacoes, setOrientacoes] = useState('');
  const [inicio, setInicio] = useState(hoje());
  const [hora, setHora] = useState('14:00');
  const [duracao, setDuracao] = useState('');
  const [recorrencia, setRecorrencia] = useState('unica');
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [semPrazo, setSemPrazo] = useState(false);
  const [fim, setFim] = useState('');
  const [motivoSemPrazo, setMotivoSemPrazo] = useState('');
  const [responsavel, setResponsavel] = useState<'plantao' | 'pessoa'>('plantao');
  const [responsavelId, setResponsavelId] = useState('');
  const [equipe, setEquipe] = useState<Profissional[]>([]);
  const [haEscala, setHaEscala] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  const repete = recorrencia !== 'unica';
  const pedeDias = ['semanal', 'quinzenal'].includes(recorrencia);

  // A escala daquele dia e horário — recarrega quando a data ou a hora muda,
  // porque "quem está de serviço às 14h de terça" não é a mesma lista de
  // "quem está às 20h de sábado".
  useEffect(() => {
    if (responsavel !== 'pessoa') return;
    (async () => {
      try {
        const r = await api<{ haEscala: boolean; equipe: Profissional[] }>(
          `/activities/agenda/staff?houseId=${houseId}&data=${inicio}&hora=${hora}`);
        setEquipe(r.equipe); setHaEscala(r.haEscala);
      } catch { setEquipe([]); setHaEscala(true); }
    })();
  }, [responsavel, houseId, inicio, hora]);

  const escolhido = equipe.find((e) => e.id === responsavelId);
  const pronto = titulo.trim().length >= 3
    && inicio !== '' && hora !== ''
    && (!pedeDias || diasSemana.length > 0)
    && (!repete || !semPrazo || motivoSemPrazo.trim().length >= 10)
    && (!repete || semPrazo || fim !== '')
    && (responsavel === 'plantao' || responsavelId !== '')
    && !ocupado;

  async function enviar() {
    setOcupado(true); setErro('');
    try {
      const r = await api<{ aviso?: string }>('/activities/agenda', {
        method: 'POST',
        body: JSON.stringify({
          houseId, personId: personId || null, tipo, titulo: titulo.trim(),
          local: local.trim() || undefined, orientacoes: orientacoes.trim() || undefined,
          inicio, hora, duracaoMin: duracao ? Number(duracao) : undefined,
          recorrencia, diasSemana: pedeDias ? diasSemana : undefined,
          fim: !repete ? undefined : (semPrazo ? null : fim),
          motivoSemPrazo: semPrazo ? motivoSemPrazo.trim() : undefined,
          responsavel, responsavelId: responsavel === 'pessoa' ? responsavelId : undefined,
        }),
      });
      onPronto(r?.aviso ?? 'Compromisso marcado.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível marcar.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-marcar"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-marcar">Marcar compromisso</h3>

        {erro && <div className="notice c-crit" role="alert">{erro}</div>}

        <label className="f" htmlFor="quem">Para quem</label>
        <select id="quem" className="field" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">A casa toda</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        <label className="f" htmlFor="tipo">Tipo</label>
        <select id="tipo" className="field" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {opcoes.tipos.map((t) => <option key={t.cod} value={t.cod}>{t.label}</option>)}
        </select>

        <label className="f" htmlFor="tit">O que é</label>
        <input id="tit" className="field" value={titulo} onChange={(e) => setTitulo(e.target.value)}
               placeholder="Ex.: fonoaudiologia; consulta no posto; curso de informática" />

        <label className="f" htmlFor="loc">Onde <small>— opcional</small></label>
        <input id="loc" className="field" value={local} onChange={(e) => setLocal(e.target.value)}
               placeholder="Ex.: UBS Vila Nova" />

        <div className="row" style={{ gap: 8 }}>
          <div className="grow">
            <label className="f" htmlFor="ini">Começa em</label>
            <input id="ini" type="date" className="field" value={inicio}
                   onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="grow">
            <label className="f" htmlFor="hr">Hora</label>
            <input id="hr" type="time" className="field" value={hora}
                   onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>

        <label className="f" htmlFor="dur">Duração em minutos <small>— opcional</small></label>
        <input id="dur" type="number" min={5} step={5} className="field" value={duracao}
               onChange={(e) => setDuracao(e.target.value)} placeholder="Ex.: 60" />

        <label className="f" htmlFor="rec">Repete</label>
        <select id="rec" className="field" value={recorrencia}
                onChange={(e) => setRecorrencia(e.target.value)}>
          {opcoes.recorrencias.map((r) => <option key={r.cod} value={r.cod}>{r.label}</option>)}
        </select>

        {pedeDias && (
          <>
            <label className="f">Em quais dias</label>
            <div className="opts">
              {opcoes.diasSemana.map((d) => (
                <button key={d.n} type="button" className="opt c-info"
                        aria-pressed={diasSemana.includes(d.n)}
                        onClick={() => setDiasSemana(
                          diasSemana.includes(d.n)
                            ? diasSemana.filter((x) => x !== d.n)
                            : [...diasSemana, d.n])}>
                  {d.label}
                </button>
              ))}
            </div>
          </>
        )}

        {repete && (
          <>
            <label className="check">
              <input type="checkbox" checked={semPrazo}
                     onChange={(e) => setSemPrazo(e.target.checked)} />
              <span>Sem data para terminar</span>
            </label>
            {semPrazo ? (
              <>
                <label className="f" htmlFor="msp">
                  Por quê <small>— quem revisar a agenda em março vai ler isto</small>
                </label>
                <textarea id="msp" rows={2} value={motivoSemPrazo}
                          onChange={(e) => setMotivoSemPrazo(e.target.value)}
                          placeholder="Ex.: uso contínuo conforme laudo, sem previsão de alta." />
              </>
            ) : (
              <>
                <label className="f" htmlFor="fim">Termina em</label>
                <input id="fim" type="date" className="field" value={fim}
                       onChange={(e) => setFim(e.target.value)} />
              </>
            )}
          </>
        )}

        <label className="f">Quem fica responsável</label>
        <div className="opts">
          {opcoes.responsaveis.map((r) => (
            <button key={r.cod} type="button" className="opt c-info"
                    aria-pressed={responsavel === r.cod}
                    onClick={() => setResponsavel(r.cod as 'plantao' | 'pessoa')}>
              {r.label}
            </button>
          ))}
        </div>
        <p className="mutetxt" style={{ marginTop: 6 }}>
          {opcoes.responsaveis.find((r) => r.cod === responsavel)?.ajuda}
        </p>

        {responsavel === 'pessoa' && (
          <>
            <label className="f" htmlFor="resp">Educador</label>
            <select id="resp" className="field" value={responsavelId}
                    onChange={(e) => setResponsavelId(e.target.value)}>
              <option value="">Escolha…</option>
              {equipe.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}{haEscala && !e.naEscala ? ' (fora da escala deste horário)' : ''}
                </option>
              ))}
            </select>
            {/* Sem escala cadastrada, "fora da escala" não quer dizer nada —
                e apareceria em todo nome, o que ensina a equipe a ignorar o
                aviso justamente antes do dia em que ele acerta. */}
            {!haEscala && (
              <div className="notice c-warn" role="status">
                Esta casa ainda não tem escala cadastrada, então o sistema não sabe quem está
                de serviço neste dia e horário. Dá para marcar assim mesmo; o aviso de "fora
                da escala" volta a funcionar quando a coordenação registrar a escala 12×36.
              </div>
            )}

            {/* Aviso, não bloqueio: a saída pode ter sido combinada assim. */}
            {haEscala && escolhido && !escolhido.naEscala && (
              <div className="notice c-warn" role="status">
                {escolhido.nome} não está na escala deste dia e horário. Se foi combinado
                assim, tudo bem — o registro fica com esse nome.
              </div>
            )}
          </>
        )}

        <label className="f" htmlFor="ori">Orientações <small>— opcional</small></label>
        <textarea id="ori" rows={2} value={orientacoes} onChange={(e) => setOrientacoes(e.target.value)}
                  placeholder="Ex.: levar o cartão do SUS e o relatório da escola." />

        {!pronto && !ocupado && (
          <p className="mutetxt" style={{ margin: '16px 0 0' }}>
            {titulo.trim().length < 3
              ? 'Falta dizer o que é o compromisso.'
              : pedeDias && diasSemana.length === 0
                ? 'Escolha em quais dias da semana ele acontece.'
                : repete && semPrazo && motivoSemPrazo.trim().length < 10
                  ? 'Sem data para terminar, escreva o motivo — quem revisar a agenda vai ler isto.'
                  : repete && !semPrazo && fim === ''
                    ? 'Informe até quando ele se repete, ou marque "sem data para terminar".'
                    : 'Escolha o educador responsável, ou deixe para o plantão do horário.'}
          </p>
        )}

        {/* O formulário é longo de propósito; o botão não pode ficar longe.
            Grudado no fim da folha, ele acompanha a rolagem — e quem preencheu
            metade vê, o tempo todo, que ainda falta algo para poder marcar. */}
        <div className="row rodape">
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!pronto} onClick={enviar}>
            Marcar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Encerrar pede motivo: o compromisso some da agenda, o registro dele não. */
/**
 * Desmarcar UM dia.
 *
 * A folha diz, com todas as letras, que o compromisso continua — porque a
 * confusão entre "desmarquei a quarta" e "cancelei o acompanhamento" é a que
 * apaga um combinado que ninguém pediu para apagar.
 */
function FolhaDesmarcar({ ocorrencia, motivo, setMotivo, onFechar, onDesmarcar }: {
  ocorrencia: { titulo: string; em: string; pessoa: string };
  motivo: string; setMotivo: (v: string) => void;
  onFechar: () => void; onDesmarcar: () => void;
}) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-desmarcar"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-desmarcar">Desmarcar “{ocorrencia.titulo}”</h3>
        <p className="mutetxt">
          {diaLongo(ocorrencia.em)} · {ocorrencia.pessoa}. <b>Só neste dia</b> — o
          compromisso continua valendo nas próximas datas, e este dia continua
          aparecendo na agenda, marcado como desmarcado.
        </p>
        <label className="f" htmlFor="mot-desm">Por quê</label>
        <textarea id="mot-desm" rows={2} value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: a psicóloga desmarcou; remarcado para a próxima semana." />
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={motivo.trim().length < 5}
                  onClick={onDesmarcar}>
            Desmarcar este dia
          </button>
        </div>
      </div>
    </div>
  );
}

function FolhaEncerrar({ compromisso, onFechar, onEncerrar }: {
  compromisso: Vigente; onFechar: () => void; onEncerrar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3>Encerrar “{compromisso.titulo}”</h3>
        <p className="mutetxt">
          Deixa de aparecer nos próximos dias. O que já aconteceu continua na linha do tempo,
          como aconteceu.
        </p>
        <label className="f" htmlFor="mot">Por quê</label>
        <textarea id="mot" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: tratamento concluído; alta da fonoaudiologia em 20/08." />
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={motivo.trim().length < 5}
                  onClick={() => onEncerrar(motivo.trim())}>
            Encerrar
          </button>
        </div>
      </div>
    </div>
  );
}
