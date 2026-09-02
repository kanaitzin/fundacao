import { useEffect, useState } from 'react';
import { api } from '../api';
import { FolhaDocumento } from '../documentos';
import type { ArquivoGerado } from '../documentos';
import type { DocumentoWord } from '../docx';
import { quemAssina } from '../quem-assina';

/**
 * REUNIÕES E COMBINADOS DA EQUIPE (§9.4).
 *
 * A pergunta que esta tela responde é a que a casa faz toda semana: *"o que
 * ficou combinado?"*. Hoje a resposta mora na ata de papel da reunião, no grupo
 * de mensagens e na memória de quem estava lá — e quem mais precisa dela, a
 * educadora do turno da noite, quase nunca estava na reunião.
 *
 * Três coisas que a tela faz questão de mostrar:
 *
 *  * o ÚLTIMO combinado vigente vem no alto, sem rolagem. É o que muda desde a
 *    última vez que a pessoa entrou, e é o que ela veio ver;
 *  * o combinado encerrado NÃO some. Ele fica, com o motivo e o nome de quem
 *    encerrou — porque "mas ficou combinado que..." é uma discussão que só o
 *    registro encerra;
 *  * quem só LÊ vê a tela inteira. Esconder o combinado de quem cumpre o
 *    combinado seria repetir o problema que a tela veio resolver.
 */

interface Mudanca {
  de: string; para: string; motivo: string; quem: string; quando: string;
}
interface Combinado {
  id: string; reuniaoId: string | null; texto: string;
  responsavel: string | null; prazo: string | null;
  situacao: string; situacaoRotulo: string;
  motivoDaSituacao: string | null; mudadoPor: string | null; mudadoEm: string | null;
  por: string; criadoEm: string; substitui: string | null;
  historico: Mudanca[];
}
interface Reuniao {
  id: string; data: string; tipo: string; tipoRotulo: string; titulo: string;
  participantes: string | null; pauta: string | null; notas: string | null;
  por: string; registradaEm: string; combinados: Combinado[];
}
interface Alinhamentos {
  reunioes: Reuniao[]; combinados: Combinado[];
  ultimo: Combinado | null; vigentes: number;
  podeEscrever: boolean; aviso: string;
}
interface Tipo { code: string; label: string }

const dia = (iso: string) => new Date(`${String(iso).slice(0, 10)}T12:00:00-03:00`)
  .toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR',
  { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo' });

const TOM: Record<string, string> = {
  vigente: 'c-ok', cumprido: 'c-brand', revogado: 'c-mute', substituido: 'c-mute',
};

export function Alinhamentos({ houseId, casaLabel }: { houseId: string; casaLabel: string }) {
  const [dados, setDados] = useState<Alinhamentos | null>(null);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [reuniao, setReuniao] = useState(false);
  const [combinado, setCombinado] = useState(false);
  const [encerrando, setEncerrando] = useState<Combinado | null>(null);
  const [verEncerrados, setVerEncerrados] = useState(false);
  const [documento, setDocumento] = useState<DocumentoWord | null>(null);

  async function carregar() {
    setErro('');
    try {
      const [d, v] = await Promise.all([
        api<Alinhamentos>(`/alignments?houseId=${houseId}`),
        api<{ tipos: Tipo[] }>('/alignments/kinds').catch(() => ({ tipos: [] })),
      ]);
      setDados(d); setTipos(v.tipos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir os combinados.');
    }
  }
  useEffect(() => { void carregar(); }, [houseId]);

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try { const r = await fn(); if (r?.aviso) setAviso(r.aviso); await carregar(); return true; }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
  }

  if (!dados) {
    return erro
      ? <div className="notice c-crit" role="alert">{erro}</div>
      : <div className="card"><p className="mutetxt" style={{ margin: 0 }}>Carregando…</p></div>;
  }

  const vigentes = dados.combinados.filter((c) => c.situacao === 'vigente');
  const encerrados = dados.combinados.filter((c) => c.situacao !== 'vigente');

  /*
   * A folha dos combinados vem do SERVIDOR desde 02/09/2026. Ela era montada
   * aqui, e o documento saía do sistema sem que o sistema soubesse.
   */

  return (
    <>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && (
        <div className="notice c-ok" role="status">
          {aviso}
          <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setAviso('')}>
            Entendi
          </button>
        </div>
      )}

      {/*
        * O ÚLTIMO COMBINADO, no alto e sem rolagem.
        *
        * É o que a pessoa veio ver: o que mudou desde a última vez que ela
        * entrou. Enterrá-lo numa lista em ordem de data faria com que quem tem
        * quinze minutos antes do turno não o lesse.
        */}
      {dados.ultimo ? (
        <div className="card raise stack">
          <div className="eyebrow" style={{ margin: 0 }}>O último combinado</div>
          <p className="ff" style={{ fontSize: 16, margin: 0 }}>{dados.ultimo.texto}</p>
          <div className="mutetxt">
            {dados.ultimo.responsavel ? `Responsável: ${dados.ultimo.responsavel}. ` : ''}
            {dados.ultimo.prazo ? `Até ${dia(dados.ultimo.prazo)}. ` : ''}
            Registrado por {dados.ultimo.por} em {dia(dados.ultimo.criadoEm)}.
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="mutetxt" style={{ margin: 0 }}>
            Nenhum combinado registrado nesta casa ainda.
          </p>
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <span className="pill c-ok">{vigentes.length} vigente(s)</span>
        {encerrados.length > 0 && (
          <span className="pill c-mute">{encerrados.length} encerrado(s)</span>
        )}
        <span className="grow" />
        <button className="btn sm ghost" onClick={async () => {
                  try {
                    setDocumento(await api<DocumentoWord>(`/alignments/folha?houseId=${houseId}`));
                  } catch (e) {
                    setErro(e instanceof Error ? e.message
                      : 'Não foi possível montar a folha dos combinados.');
                  }
                }}>
          📄 Ver em folha / baixar
        </button>
      </div>

      <div className="eyebrow">Combinados em vigor</div>
      <div className="stack">
        {vigentes.map((c) => (
          <div className="card stack" key={c.id}>
            <p className="ff" style={{ margin: 0 }}>{c.texto}</p>
            <div className="mutetxt">
              {c.responsavel ? `Responsável: ${c.responsavel}. ` : ''}
              {c.prazo ? `Prazo: ${dia(c.prazo)}. ` : ''}
              Por {c.por} em {dia(c.criadoEm)}.
            </div>
            {dados.podeEscrever && (
              <div className="row">
                <button className="btn sm ghost" onClick={() => setEncerrando(c)}>
                  Encerrar este combinado
                </button>
              </div>
            )}
          </div>
        ))}
        {vigentes.length === 0 && (
          <div className="card">
            <p className="mutetxt" style={{ margin: 0 }}>Nada em vigor no momento.</p>
          </div>
        )}
      </div>

      {/* O encerrado não some: some da lista de cima, não do registro. */}
      {encerrados.length > 0 && (
        <>
          <div className="eyebrow">
            Já encerrados
            <button className="btn sm ghost" style={{ width: 'auto', margin: 0 }}
                    onClick={() => setVerEncerrados(!verEncerrados)}>
              {verEncerrados ? 'esconder' : 'mostrar'}
            </button>
          </div>
          {verEncerrados && (
            <div className="stack">
              {encerrados.map((c) => (
                <div className="card stack" key={c.id}>
                  <div className="row">
                    <p className="grow mutetxt" style={{ margin: 0 }}>{c.texto}</p>
                    <span className={`pill ${TOM[c.situacao] ?? 'c-mute'}`}>
                      {c.situacaoRotulo}
                    </span>
                  </div>
                  {c.motivoDaSituacao && (
                    <div className="bloco">
                      <small>Por que foi encerrado</small>{c.motivoDaSituacao}
                    </div>
                  )}
                  {c.mudadoPor && (
                    <div className="mutetxt">
                      {c.situacaoRotulo} por {c.mudadoPor}
                      {c.mudadoEm ? ` em ${quando(c.mudadoEm)}` : ''}.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="eyebrow">Reuniões</div>
      <div className="stack">
        {dados.reunioes.map((r) => (
          <div className="card stack" key={r.id}>
            <div className="row">
              <div className="grow">
                <b className="ff">{r.titulo}</b>
                <div className="mutetxt linhadois">
                  {dia(r.data)} · {r.tipoRotulo} · registrada por {r.por}
                </div>
              </div>
            </div>
            {r.participantes && (
              <div className="mutetxt">Participantes: {r.participantes}</div>
            )}
            {r.pauta && <div className="bloco"><small>Pauta</small>{r.pauta}</div>}
            {r.notas && <div className="bloco"><small>Registro</small>{r.notas}</div>}
            {r.combinados.length > 0 && (
              <ul className="lista">
                {r.combinados.map((c) => (
                  <li key={c.id} className="row">
                    <span className="grow">{c.texto}</span>
                    <span className={`pill ${TOM[c.situacao] ?? 'c-mute'}`}>
                      {c.situacaoRotulo}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {dados.reunioes.length === 0 && (
          <div className="card">
            <p className="mutetxt" style={{ margin: 0 }}>Nenhuma reunião registrada.</p>
          </div>
        )}
      </div>

      <p className="mutetxt" style={{ marginTop: 12 }}>{dados.aviso}</p>

      {dados.podeEscrever && (
        <>
          <button className="btn block" onClick={() => setReuniao(true)}>
            + Registrar uma reunião
          </button>
          <button className="btn sec block" onClick={() => setCombinado(true)}>
            + Registrar um combinado avulso
          </button>
        </>
      )}

      {reuniao && (
        <FolhaReuniao
          tipos={tipos} onFechar={() => setReuniao(false)}
          onGravar={async (corpo) => {
            const ok = await acao(() => api('/alignments/meetings', {
              method: 'POST', body: JSON.stringify({ houseId, ...corpo }) }));
            if (ok) setReuniao(false);
          }} />
      )}

      {combinado && (
        <FolhaCombinado
          onFechar={() => setCombinado(false)}
          onGravar={async (corpo) => {
            const ok = await acao(() => api('/alignments/agreements', {
              method: 'POST', body: JSON.stringify({ houseId, ...corpo }) }));
            if (ok) setCombinado(false);
          }} />
      )}

      {encerrando && (
        <FolhaEncerrar
          combinado={encerrando} onFechar={() => setEncerrando(null)}
          onEncerrar={async (situacao, motivo) => {
            const ok = await acao(() => api(`/alignments/agreements/${encerrando.id}/status`, {
              method: 'POST', body: JSON.stringify({ situacao, motivo }) }));
            if (ok) setEncerrando(null);
          }} />
      )}

      {documento && (
        <FolhaDocumento doc={documento} onFechar={() => setDocumento(null)}
                        exportar={(finalidade) => api<ArquivoGerado>('/alignments/export', {
                          method: 'POST', body: JSON.stringify({ houseId, finalidade }),
                        })} />
      )}
    </>
  );
}

/**
 * Registrar a reunião, com os combinados que saíram dela.
 *
 * Os combinados entram JUNTO porque é assim que a reunião acontece: ninguém
 * lembra de voltar depois para escrever o que ficou acertado, e o que não é
 * escrito na hora não é escrito.
 */
function FolhaReuniao({ tipos, onFechar, onGravar }: {
  tipos: Tipo[]; onFechar: () => void; onGravar: (corpo: Record<string, unknown>) => void;
}) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [data, setData] = useState(hoje);
  const [tipo, setTipo] = useState(tipos[0]?.code ?? 'equipe');
  const [titulo, setTitulo] = useState('');
  const [participantes, setParticipantes] = useState('');
  const [pauta, setPauta] = useState('');
  const [notas, setNotas] = useState('');
  const [combinados, setCombinados] = useState<
    { texto: string; responsavel: string; prazo: string }[]>([]);

  const pode = titulo.trim().length >= 4 && data
    && combinados.every((c) => c.texto.trim().length >= 10);

  const mudar = (i: number, campo: string, valor: string) =>
    setCombinados((cs) => cs.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)));

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-reu"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-reu">Registrar reunião</h3>
        <div className="notice c-info">
          O que for escrito aqui é lido por <b>todo mundo da casa</b> — inclusive por quem não
          esteve na reunião, que costuma ser quem mais precisa do combinado.
        </div>

        <label className="f" htmlFor="reu-data">Dia da reunião</label>
        <input id="reu-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />

        <label className="f" htmlFor="reu-tipo">Tipo</label>
        <select id="reu-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {tipos.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>

        <label className="f" htmlFor="reu-tit">
          Assunto <small>— é como a reunião vai ser achada daqui a seis meses</small>
        </label>
        <input id="reu-tit" value={titulo} onChange={(e) => setTitulo(e.target.value)}
               placeholder="Ex.: organização das saídas para a escola" />

        <label className="f" htmlFor="reu-part">
          Quem participou <small>— inclusive quem veio de fora</small>
        </label>
        <input id="reu-part" value={participantes}
               onChange={(e) => setParticipantes(e.target.value)} />

        <label className="f" htmlFor="reu-pauta">Pauta</label>
        <textarea id="reu-pauta" value={pauta} onChange={(e) => setPauta(e.target.value)} />

        <label className="f" htmlFor="reu-notas">O que foi conversado</label>
        <textarea id="reu-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />

        <div className="eyebrow" style={{ marginTop: 18 }}>O que ficou combinado</div>
        {combinados.map((c, i) => (
          <div className="card stack" key={i} style={{ marginBottom: 10 }}>
            <label className="f" htmlFor={`cmb-${i}`}>
              Combinado {i + 1}
              <small> — escrito por inteiro; quem lê não estava na conversa</small>
            </label>
            <textarea id={`cmb-${i}`} value={c.texto}
                      onChange={(e) => mudar(i, 'texto', e.target.value)}
                      placeholder="Ex.: a partir de segunda, a saída para a fono é com a educadora do turno da tarde." />
            <div className="row">
              <div className="grow">
                <label className="f" htmlFor={`cmb-r-${i}`}>Quem faz acontecer</label>
                <input id={`cmb-r-${i}`} value={c.responsavel}
                       onChange={(e) => mudar(i, 'responsavel', e.target.value)}
                       placeholder="Pode ser o turno inteiro" />
              </div>
              <div className="grow">
                <label className="f" htmlFor={`cmb-p-${i}`}>Até quando</label>
                <input id={`cmb-p-${i}`} type="date" value={c.prazo}
                       onChange={(e) => mudar(i, 'prazo', e.target.value)} />
              </div>
            </div>
          </div>
        ))}
        <button className="btn sec block"
                onClick={() => setCombinados([...combinados,
                  { texto: '', responsavel: '', prazo: '' }])}>
          + Acrescentar um combinado
        </button>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onGravar({
                    data, tipo, titulo: titulo.trim(),
                    participantes: participantes.trim() || undefined,
                    pauta: pauta.trim() || undefined,
                    notas: notas.trim() || undefined,
                    combinados: combinados
                      .filter((c) => c.texto.trim())
                      .map((c) => ({
                        texto: c.texto.trim(),
                        responsavel: c.responsavel.trim() || undefined,
                        prazo: c.prazo || undefined,
                      })),
                  })}>
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Nem todo acerto nasce numa reunião — o do corredor também vale. */
function FolhaCombinado({ onFechar, onGravar }: {
  onFechar: () => void; onGravar: (corpo: Record<string, unknown>) => void;
}) {
  const [texto, setTexto] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [prazo, setPrazo] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-cmb"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-cmb">Registrar um combinado</h3>
        <div className="notice c-info">
          O texto de um combinado <b>não se reescreve</b>. Mudou de ideia? Registre outro
          dizendo que substitui este — é assim que a equipe muda de acordo sem apagar o que
          todo mundo cumpriu até ontem.
        </div>

        <label className="f" htmlFor="cmb-txt">
          O que ficou combinado
          <small> — por inteiro, para quem não estava na conversa</small>
        </label>
        <textarea id="cmb-txt" value={texto} onChange={(e) => setTexto(e.target.value)} />

        <label className="f" htmlFor="cmb-resp">Quem faz acontecer</label>
        <input id="cmb-resp" value={responsavel}
               onChange={(e) => setResponsavel(e.target.value)} />

        <label className="f" htmlFor="cmb-prazo">Até quando (opcional)</label>
        <input id="cmb-prazo" type="date" value={prazo}
               onChange={(e) => setPrazo(e.target.value)} />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={texto.trim().length < 10}
                  onClick={() => onGravar({
                    texto: texto.trim(),
                    responsavel: responsavel.trim() || undefined,
                    prazo: prazo || undefined,
                  })}>
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Encerrar exige motivo: combinado que some em silêncio continua sendo cumprido. */
function FolhaEncerrar({ combinado, onFechar, onEncerrar }: {
  combinado: Combinado; onFechar: () => void;
  onEncerrar: (situacao: string, motivo: string) => void;
}) {
  const [situacao, setSituacao] = useState('cumprido');
  const [motivo, setMotivo] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-enc"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-enc">Encerrar combinado</h3>
        <p className="mutetxt">{combinado.texto}</p>

        <div className="notice c-warn">
          O combinado <b>não é apagado</b>: ele continua na lista, marcado, com o motivo e o
          seu nome. Quem cumpriu ele até hoje precisa entender por que parou.
        </div>

        <label className="f">O que aconteceu com ele</label>
        <div className="row">
          {[['cumprido', 'Foi cumprido'], ['revogado', 'Foi desfeito']].map(([cod, lab]) => (
            <button key={cod} className="opt" aria-pressed={situacao === cod}
                    onClick={() => setSituacao(cod)}>{lab}</button>
          ))}
        </div>

        <label className="f" htmlFor="enc-motivo">Por quê</label>
        <textarea id="enc-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: a escola mudou o horário e o combinado deixou de fazer sentido." />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={motivo.trim().length < 5}
                  onClick={() => onEncerrar(situacao, motivo.trim())}>
            Encerrar
          </button>
        </div>
      </div>
    </div>
  );
}
