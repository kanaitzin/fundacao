import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { baixarArquivo } from '../documentos';

/**
 * INTERNAÇÃO HOSPITALAR.
 *
 * A criança internada continua da casa — continua na contagem e na vaga — e
 * sai da linha do dia: some da chamada e da grade de medicação, e volta
 * sozinha na alta. Aqui fica o período inteiro no hospital: o diário, a
 * medicação que o HOSPITAL administrou, e quem da equipe esteve lá em cada
 * dia.
 *
 * Três coisas que esta tela faz de propósito:
 *
 *  * **conta os dias COM relato, e nunca os que faltam.** A coordenação
 *    decidiu que o relato diário não é obrigatório. Uma tela que dissesse
 *    "3 dias sem registro" transformaria numa cobrança o que foi combinado
 *    como um lugar para escrever;
 *  * **a medicação do hospital aparece separada, com a origem escrita.** Na
 *    grade da casa ela faria a equipe parecer estar administrando o que não
 *    administrou;
 *  * **encerrar pede o desfecho**, e um dos três é óbito. Ele está na lista
 *    porque acontece, e um sistema que só tem "alta" obriga alguém a mentir no
 *    pior dia possível.
 */
interface Internacao {
  id: string; acolhidoId: string; acolhido: string;
  hospital: string; motivo: string;
  desde: string; ate: string | null;
  status: string; desfecho: string | null;
  abertaPor: string; acompanhante: string | null;
  diasComRelato: number; registros: number; diasInternada: number;
}

interface Nota {
  id: string; dia: string; tipo: string; tipoRotulo: string; texto: string;
  temAnexo: boolean; nomeDoArquivo: string | null; por: string; em: string;
}

interface Periodo extends Internacao {
  observacaoDoDesfecho: string | null;
  encerradaPor: string | null;
  diario: Nota[];
  medicacaoNoHospital: {
    id: string; quando: string; medicamento: string; dose: string | null;
    via: string | null; observacao: string | null; origem: string; registradoPor: string;
  }[];
  acompanhantes: {
    id: string; quem: string; de: string; ate: string | null;
    observacao: string | null; designadoPor: string;
  }[];
}

interface Vocabulario {
  tiposDeNota: { cod: string; label: string }[];
  desfechos: { cod: string; label: string }[];
  nota: string;
}

const QUEM_ABRE = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

const dia = (iso: string) =>
  new Date(String(iso).length <= 10 ? `${iso}T12:00:00-03:00` : iso)
    .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR',
    { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export function Internacao({ houseId, casaLabel, papel }: {
  houseId: string; casaLabel: string; papel: string;
}) {
  const [lista, setLista] = useState<Internacao[] | null>(null);
  const [encerradas, setEncerradas] = useState(false);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [abrindoNova, setAbrindoNova] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const podeAbrir = QUEM_ABRE.includes(papel);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setLista(await api<Internacao[]>(
        `/nursing/hospitalizations?houseId=${houseId}${encerradas ? '&encerradas=1' : ''}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as internações.');
    }
  }, [houseId, encerradas]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (abertaId) {
    return <PeriodoNoHospital id={abertaId} papel={papel}
                              onVoltar={() => { setAbertaId(null); void carregar(); }} />;
  }

  return (
    <>
      <div className="eyebrow">{casaLabel} · internação hospitalar</div>
      <h2>No hospital</h2>
      <p className="mutetxt">
        A criança internada <b>continua da casa</b>: continua na contagem e na vaga. Ela sai da
        chamada e da grade de medicação enquanto estiver internada, e volta sozinha na alta.
      </p>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      {podeAbrir && (
        <button className="btn block" onClick={() => setAbrindoNova(true)}>
          🏥 Registrar internação
        </button>
      )}

      <nav className="filtros" aria-label="O que mostrar">
        <button className={!encerradas ? 'on' : ''} onClick={() => setEncerradas(false)}>
          Em andamento
        </button>
        <button className={encerradas ? 'on' : ''} onClick={() => setEncerradas(true)}>
          Todas
        </button>
      </nav>

      {lista && !lista.length && (
        <p className="mutetxt">
          {encerradas
            ? 'Nenhuma internação registrada nesta casa.'
            : 'Nenhuma criança desta casa está internada agora.'}
        </p>
      )}

      <div className="stack">
        {(lista ?? []).map((i) => (
          <button key={i.id} className="card row" onClick={() => setAbertaId(i.id)}>
            <div className="grow" style={{ textAlign: 'left' }}>
              <div className="row">
                <b className="ff grow">{i.acolhido}</b>
                <span className={`pill ${i.status === 'em_andamento' ? 'c-warn' : 'c-info'}`}>
                  {i.status === 'em_andamento' ? 'Internada' : 'Encerrada'}
                </span>
              </div>
              <div className="mutetxt">
                {i.hospital} · desde {dia(i.desde)}
                {i.ate ? ` até ${dia(i.ate)}` : ''} · {i.diasInternada} dia(s)
              </div>
              {/* Dias COM relato: contagem, e não cobrança. */}
              <div className="mutetxt">
                {i.diasComRelato} dia(s) com relato
                {i.acompanhante ? ` · acompanha: ${i.acompanhante}` : ' · sem acompanhante designado'}
              </div>
            </div>
          </button>
        ))}
      </div>

      {abrindoNova && (
        <FolhaAbrir
          houseId={houseId}
          onFechar={() => setAbrindoNova(false)}
          onAbriu={(msg) => { setAbrindoNova(false); setAviso(msg); void carregar(); }} />
      )}
    </>
  );
}

function FolhaAbrir({ houseId, onFechar, onAbriu }: {
  houseId: string; onFechar: () => void; onAbriu: (aviso: string) => void;
}) {
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([]);
  const [personId, setPersonId] = useState('');
  const [hospital, setHospital] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api<{ id: string; nome: string }[]>(`/people?houseId=${houseId}`)
      .then((r) => { setPessoas(r); setPersonId(r[0]?.id ?? ''); })
      .catch(() => setPessoas([]));
  }, [houseId]);

  const pode = personId && hospital.trim().length >= 2 && motivo.trim().length >= 10;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-int"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-int">Registrar internação</h3>
        <p className="mutetxt">
          Ela sai da chamada e da grade de medicação da casa enquanto estiver internada, e
          continua ocupando a vaga. As doses previstas não são apagadas nem marcadas como não
          administradas — o sistema não conclui o que não viu.
        </p>

        <label className="f" htmlFor="int-p">Quem</label>
        <select id="int-p" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        <label className="f" htmlFor="int-h">Hospital</label>
        <input id="int-h" value={hospital} onChange={(e) => setHospital(e.target.value)} />

        <label className="f" htmlFor="int-m">
          Por que foi internada <small>— pelo menos 10 caracteres</small>
        </label>
        <textarea id="int-m" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Quem ler daqui a um ano precisa saber o que aconteceu." />

        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode || ocupado} onClick={async () => {
            setOcupado(true); setErro('');
            try {
              const r = await api<{ aviso: string }>('/nursing/hospitalizations', {
                method: 'POST',
                body: JSON.stringify({ personId, houseId, hospital: hospital.trim(),
                                       motivo: motivo.trim() }),
              });
              onAbriu(r.aviso);
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível registrar.');
            } finally {
              setOcupado(false);
            }
          }}>{ocupado ? 'Registrando…' : 'Registrar'}</button>
        </div>
      </div>
    </div>
  );
}

function PeriodoNoHospital({ id, papel, onVoltar }: {
  id: string; papel: string; onVoltar: () => void;
}) {
  const [p, setP] = useState<Periodo | null>(null);
  const [vocab, setVocab] = useState<Vocabulario | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [escrevendo, setEscrevendo] = useState(false);
  const [medicando, setMedicando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [designando, setDesignando] = useState(false);
  const podeEncerrar = QUEM_ABRE.includes(papel);

  const carregar = useCallback(async () => {
    try {
      setP(await api<Periodo>(`/nursing/hospitalizations/${id}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir a internação.');
    }
  }, [id]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    api<Vocabulario>('/nursing/hospitalizations/kinds').then(setVocab).catch(() => setVocab(null));
  }, []);

  if (erro) return (<><button className="btn sm ghost" onClick={onVoltar}>← Internações</button>
    <div className="notice c-crit" role="alert">{erro}</div></>);
  if (!p) return <p className="mutetxt">Carregando…</p>;

  return (
    <>
      <button className="btn sm ghost" onClick={onVoltar}>← Internações</button>
      <h2>{p.acolhido}</h2>
      <div className="mutetxt">
        {p.hospital} · desde {dia(p.desde)}{p.ate ? ` até ${dia(p.ate)}` : ''}
        {' · '}{p.diasInternada} dia(s) · aberta por {p.abertaPor}
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        <b className="ff">Por que foi internada</b>
        <div>{p.motivo}</div>
      </div>

      {p.status === 'encerrada' && (
        <div className="notice c-info" role="status">
          <b>Internação encerrada</b> em {dia(p.ate!)} — {p.desfecho === 'alta' ? 'alta'
            : p.desfecho === 'obito' ? 'óbito' : 'transferência hospitalar'}
          {p.encerradaPor ? `, por ${p.encerradaPor}` : ''}.
          {p.observacaoDoDesfecho ? ` ${p.observacaoDoDesfecho}` : ''}
        </div>
      )}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      {/* ------------------------------------------------------ acompanhantes */}
      <div className="eyebrow">Quem esteve com ela</div>
      {/*
        * DESIGNAR O ACOMPANHANTE.
        *
        * A rota existia desde a fase 53 e não tinha botão em lugar nenhum — o
        * conferidor de rotas sem porta a encontrou. E é a função que a
        * coordenação mais vai usar aqui: a criança fica três semanas, e quem
        * vai ao hospital muda a cada plantão.
        */}
      {p.status === 'em_andamento' && podeEncerrar && (
        <button className="btn sec block" onClick={() => setDesignando(true)}>
          👤 Designar quem acompanha
        </button>
      )}
      {!p.acompanhantes.length && (
        <p className="mutetxt">Ninguém designado ainda.</p>
      )}
      <div className="stack">
        {p.acompanhantes.map((a) => (
          <div key={a.id} className="card">
            <div className="row">
              <b className="ff grow">{a.quem}</b>
              <span className="pill c-info">
                {a.ate ? `${dia(a.de)} a ${dia(a.ate)}` : `desde ${dia(a.de)}`}
              </span>
            </div>
            {a.observacao && <div className="mutetxt">{a.observacao}</div>}
            <div className="mutetxt">designado por {a.designadoPor}</div>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------ diário */}
      <div className="eyebrow" style={{ marginTop: 16 }}>
        O que aconteceu no hospital · {p.diasComRelato} dia(s) com relato
      </div>
      {vocab && <p className="mutetxt">{vocab.nota}</p>}
      {p.status === 'em_andamento' && (
        <div className="acoes">
          <button className="btn sm" onClick={() => setEscrevendo(true)}>✍️ Escrever no diário</button>
          <button className="btn sm sec" onClick={() => setMedicando(true)}>
            💊 Medicação dada no hospital
          </button>
        </div>
      )}

      <div className="stack">
        {!p.diario.length && <p className="mutetxt">Nada registrado ainda.</p>}
        {p.diario.map((n) => (
          <div key={n.id} className="card">
            <div className="row">
              <b className="ff grow">{n.tipoRotulo}</b>
              <span className="pill c-info">{dia(n.dia)}</span>
            </div>
            <div>{n.texto}</div>
            {n.temAnexo && (
              /*
                * O ANEXO PRECISA SAIR.
                *
                * Ele era guardado e nunca mais lido — a rota de leitura nem
                * existia. A equipe digitalizaria o exame, devolveria o papel ao
                * hospital, e no dia em que ele fosse pedido não haveria nada.
                */
              <button className="btn sm ghost" onClick={async () => {
                try {
                  const a = await api<{ nome: string; tipo: string; conteudo: string }>(
                    `/nursing/hospitalizations/${id}/notes/${n.id}/anexo`);
                  baixarArquivo(a.nome, a.tipo, a.conteudo);
                } catch (e) {
                  setAviso(e instanceof Error ? e.message : 'Não foi possível abrir o anexo.');
                }
              }}>📎 {n.nomeDoArquivo ?? 'documento do hospital'}</button>
            )}
            <div className="mutetxt">{n.por} · {hhmm(n.em)}</div>
          </div>
        ))}
      </div>

      {/* --------------------------------------------------- medicação lá */}
      <div className="eyebrow" style={{ marginTop: 16 }}>
        Medicação administrada pelo hospital · {p.medicacaoNoHospital.length}
      </div>
      <p className="mutetxt">
        Estas doses <b>não</b> entram na grade da casa: quem administrou foi o hospital. Elas
        ficam no histórico de saúde da criança com essa origem.
      </p>
      <div className="stack">
        {p.medicacaoNoHospital.map((m) => (
          <div key={m.id} className="card">
            <div className="row">
              <b className="ff grow">{m.medicamento} {m.dose ?? ''}</b>
              <span className="pill c-info">{dia(m.quando)} {hhmm(m.quando)}</span>
            </div>
            {m.via && <div className="mutetxt">via {m.via}</div>}
            {m.observacao && <div>{m.observacao}</div>}
            <div className="estado"><span className="pill c-warn">{m.origem}</span></div>
            <div className="mutetxt">registrado por {m.registradoPor}</div>
          </div>
        ))}
      </div>

      {p.status === 'em_andamento' && podeEncerrar && (
        <button className="btn sec block" style={{ marginTop: 16 }}
                onClick={() => setEncerrando(true)}>
          Encerrar internação
        </button>
      )}

      {escrevendo && vocab && (
        <FolhaDiario tipos={vocab.tiposDeNota} onFechar={() => setEscrevendo(false)}
          onSalvar={async (d) => {
            await api(`/nursing/hospitalizations/${id}/notes`, {
              method: 'POST', body: JSON.stringify(d),
            });
            setEscrevendo(false); void carregar();
          }} />
      )}

      {medicando && (
        <FolhaMedicacao onFechar={() => setMedicando(false)}
          onSalvar={async (d) => {
            const r = await api<{ aviso: string }>(`/nursing/hospitalizations/${id}/medications`, {
              method: 'POST', body: JSON.stringify(d),
            });
            setMedicando(false); setAviso(r.aviso); void carregar();
          }} />
      )}

      {designando && (
        <FolhaAcompanhante
          onFechar={() => setDesignando(false)}
          onDesignar={async (d) => {
            await api(`/nursing/hospitalizations/${id}/companion`, {
              method: 'POST', body: JSON.stringify(d),
            });
            setDesignando(false); void carregar();
          }} />
      )}

      {encerrando && vocab && (
        <FolhaEncerrar desfechos={vocab.desfechos} nome={p.acolhido}
          onFechar={() => setEncerrando(false)}
          onEncerrar={async (d) => {
            const r = await api<{ aviso: string }>(`/nursing/hospitalizations/${id}/close`, {
              method: 'POST', body: JSON.stringify(d),
            });
            setEncerrando(false); setAviso(r.aviso); void carregar();
          }} />
      )}
    </>
  );
}

function FolhaDiario({ tipos, onFechar, onSalvar }: {
  tipos: { cod: string; label: string }[]; onFechar: () => void;
  onSalvar: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [tipo, setTipo] = useState('relato');
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState<{ nome: string; base64: string } | null>(null);
  const [erro, setErro] = useState('');

  return (
    <div className="overlay" role="dialog" aria-modal="true"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3>Escrever no diário</h3>
        <label className="f" htmlFor="dia-t">O que é</label>
        <select id="dia-t" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {tipos.map((t) => <option key={t.cod} value={t.cod}>{t.label}</option>)}
        </select>

        <label className="f" htmlFor="dia-x">O que aconteceu</label>
        <textarea id="dia-x" value={texto} onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ex.: visita da tarde; acordada, comeu bem, pediu o urso." />

        <label className="f">
          Documento do hospital <small>— PDF, JPG ou PNG, opcional</small>
        </label>
        <input type="file" accept="application/pdf,image/*" onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) { setArquivo(null); return; }
          const r = new FileReader();
          r.onload = () => setArquivo({ nome: f.name, base64: String(r.result).split(',')[1] ?? '' });
          r.readAsDataURL(f);
        }} />
        {/*
          * O anexo NÃO substitui o texto: o servidor recusa relato só com
          * arquivo. Um PDF de exame, daqui a um ano, não conta o que foi feito
          * naquele dia — e é isso que a audiência pergunta.
          */}

        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={texto.trim().length < 3} onClick={async () => {
            try {
              await onSalvar({
                tipo, texto: texto.trim(),
                conteudo: arquivo?.base64, nomeArquivo: arquivo?.nome,
              });
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
            }
          }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function FolhaMedicacao({ onFechar, onSalvar }: {
  onFechar: () => void; onSalvar: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [d, setD] = useState({ medicamento: '', dose: '', via: '', observacao: '' });
  const [erro, setErro] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3>Medicação dada no hospital</h3>
        <p className="mutetxt">
          Quem administrou foi o hospital. O registro entra no histórico de saúde da criança
          com essa origem, e <b>não</b> na grade da casa.
        </p>
        <label className="f" htmlFor="me-m">Medicamento</label>
        <input id="me-m" value={d.medicamento}
               onChange={(e) => setD({ ...d, medicamento: e.target.value })} />
        <label className="f" htmlFor="me-d">Dose</label>
        <input id="me-d" value={d.dose} onChange={(e) => setD({ ...d, dose: e.target.value })} />
        <label className="f" htmlFor="me-v">Via</label>
        <input id="me-v" value={d.via} onChange={(e) => setD({ ...d, via: e.target.value })}
               placeholder="oral, endovenosa…" />
        <label className="f" htmlFor="me-o">Observação</label>
        <textarea id="me-o" value={d.observacao}
                  onChange={(e) => setD({ ...d, observacao: e.target.value })} />
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={d.medicamento.trim().length < 2}
                  onClick={async () => {
                    try { await onSalvar(d); }
                    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível.'); }
                  }}>Registrar</button>
        </div>
      </div>
    </div>
  );
}

function FolhaEncerrar({ desfechos, nome, onFechar, onEncerrar }: {
  desfechos: { cod: string; label: string }[]; nome: string;
  onFechar: () => void; onEncerrar: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [desfecho, setDesfecho] = useState('alta');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3>Encerrar a internação de {nome}</h3>
        <label className="f" htmlFor="en-d">Como terminou</label>
        <select id="en-d" value={desfecho} onChange={(e) => setDesfecho(e.target.value)}>
          {desfechos.map((x) => <option key={x.cod} value={x.cod}>{x.label}</option>)}
        </select>
        <label className="f" htmlFor="en-o">Observação</label>
        <textarea id="en-o" value={observacao} onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex.: alta com receita de antibiótico por 7 dias." />
        {desfecho === 'alta' && (
          <p className="mutetxt">
            Ela volta à chamada, à grade e à rotina da casa a partir de hoje. Confira com a
            Enfermagem se a medicação mudou no hospital.
          </p>
        )}
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" onClick={async () => {
            try { await onEncerrar({ desfecho, observacao: observacao.trim() }); }
            catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível encerrar.'); }
          }}>Encerrar</button>
        </div>
      </div>
    </div>
  );
}


/**
 * QUEM VAI ACOMPANHAR.
 *
 * A lista é da equipe da casa. Designar encerra o período de quem estava
 * antes — sem isso, a resposta para "quem estava com ela no dia 12?" seria
 * "três pessoas ao mesmo tempo", que não ajuda ninguém.
 */
function FolhaAcompanhante({ onFechar, onDesignar }: {
  onFechar: () => void; onDesignar: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [equipe, setEquipe] = useState<{ id: string; nome: string; papel?: string }[]>([]);
  const [userId, setUserId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<any[]>('/staff')
      .then((r) => {
        const lista = r.map((m) => ({ id: m.id, nome: m.nome ?? m.fullName, papel: m.papel }));
        setEquipe(lista);
        setUserId(lista[0]?.id ?? '');
      })
      .catch(() => setEquipe([]));
  }, []);

  return (
    <div className="overlay" role="dialog" aria-modal="true"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3>Quem vai acompanhar</h3>
        <p className="mutetxt">
          Quem for designado passa a ver esta internação e a escrever no diário — e só
          nesta. O período de quem estava antes é encerrado hoje.
        </p>
        <label className="f" htmlFor="ac-q">Quem</label>
        <select id="ac-q" value={userId} onChange={(e) => setUserId(e.target.value)}>
          {equipe.map((m) => (
            <option key={m.id} value={m.id}>{m.nome}{m.papel ? ` · ${m.papel}` : ''}</option>
          ))}
        </select>
        <label className="f" htmlFor="ac-o">Observação</label>
        <textarea id="ac-o" value={observacao} onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex.: visitas da tarde nesta semana." />
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!userId} onClick={async () => {
            try { await onDesignar({ userId, observacao: observacao.trim() }); }
            catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível designar.'); }
          }}>Designar</button>
        </div>
      </div>
    </div>
  );
}
