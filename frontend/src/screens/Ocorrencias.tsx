import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * OCORRÊNCIAS (§13).
 *
 * O que esta tela recusa fazer:
 *
 *  * classificar sozinha. A categoria é escolhida por quem estava lá, e o
 *    sistema não opina sobre gravidade, culpa ou risco;
 *  * encerrar sozinha. Nenhuma ocorrência se fecha por decurso de prazo. A
 *    etapa operacional pode terminar; a análise, só com nome e síntese;
 *  * apagar. A síntese entra como registro NOVO, ao lado dos relatos — que
 *    continuam como foram escritos, mesmo quando se contradizem.
 *
 * A cor aqui diz em que ponto do fluxo a ocorrência está. Nunca diz o que
 * alguém fez de errado.
 */

interface Categoria {
  cod: string; label: string; tom: string; exigeRevisao: boolean; restrita: boolean;
}
interface Ocorrencia {
  id: string; categoria: string; tom: string; exigeRevisao: boolean; restrita: boolean;
  acolhido: string; fato: string; medidas: string; falaEspontanea: string | null;
  abertaPor: string; abertaEm: string;
  etapaOperacional: 'aberta' | 'encerrada';
  situacao: 'em_andamento' | 'aguardando_revisao' | 'encerrada';
  avisados: string[];
  acompanhamento: { id: string; quem: string; texto: string; em: string }[];
}
interface Pessoa { id: string; nome: string }

const SITUACAO: Record<string, { label: string; tom: string }> = {
  em_andamento: { label: 'Em andamento', tom: 'c-warn' },
  aguardando_revisao: { label: 'Aguardando análise', tom: 'c-med' },
  encerrada: { label: 'Encerrada com síntese', tom: 'c-ok' },
};

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

const ANALISA = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

export function Ocorrencias({ papel }: { papel: string }) {
  const [lista, setLista] = useState<Ocorrencia[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [abrindo, setAbrindo] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState<Ocorrencia | null>(null);

  async function carregar() {
    setErro('');
    try {
      const [o, c, p] = await Promise.all([
        api<Ocorrencia[]>('/incidents'),
        api<Categoria[]>('/incidents/categories'),
        api<Pessoa[]>('/people'),
      ]);
      setLista(o); setCategorias(c); setPessoas(p);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as ocorrências.');
    }
  }
  useEffect(() => { carregar(); }, []);

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try { const r = await fn(); if (r?.aviso) setAviso(r.aviso); await carregar(); return true; }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
  }

  const analisa = ANALISA.includes(papel);
  const abertas = lista.filter((o) => o.situacao !== 'encerrada');

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

      <div className="card raise stack">
        <h3 style={{ fontSize: 17, margin: 0 }}>Fato que exige acompanhamento formal</h3>
        <p className="mutetxt" style={{ margin: 0 }}>
          Alguns fatos não cabem na passagem: abrem fluxo próprio, avisam o líder, a
          equipe técnica e a coordenação na hora — e alguns não se encerram sem análise
          de quem responde pelo caso.
        </p>
        <div className="notice c-crit">
          O registro <b>nunca</b> deve atrasar a proteção imediata, o atendimento de saúde
          ou o protocolo da instituição. Abra com o mínimo; o resto entra depois, com
          horário real.
        </div>
        <button className="btn block" onClick={() => setAbrindo(true)}>
          🚨 Registrar ocorrência
        </button>
      </div>

      <div className="eyebrow">Em acompanhamento · {abertas.length}</div>
      <div className="stack">
        {lista.map((o) => {
          const s = SITUACAO[o.situacao];
          const expandida = aberta === o.id;
          return (
            <div className="card stack" key={o.id}>
              <div className="row">
                <span className={`pill ${o.tom}`}>{o.categoria}</span>
                <span className="grow" />
                <span className={`pill ${s.tom}`}>{s.label}</span>
              </div>
              <div>
                <b className="ff">{o.acolhido}</b>
                <span className="mutetxt"> · aberta por {o.abertaPor} às {hhmm(o.abertaEm)}</span>
              </div>
              <div className="row">
                {o.exigeRevisao && <span className="pill c-med">Exige análise técnica</span>}
                {o.restrita && <span className="pill c-crit">Acesso restrito</span>}
                <span className={`pill ${o.etapaOperacional === 'encerrada' ? 'c-info' : 'c-warn'}`}>
                  Etapa operacional {o.etapaOperacional === 'encerrada' ? 'encerrada' : 'em curso'}
                </span>
              </div>

              <button className="btn sm ghost" onClick={() => setAberta(expandida ? null : o.id)}>
                {expandida ? 'Fechar detalhes' : 'Abrir detalhes'}
              </button>

              {expandida && (
                <>
                  <div className="bloco"><small>Fato</small>{o.fato}</div>
                  <div className="bloco"><small>Medidas imediatas</small>{o.medidas}</div>
                  {o.restrita && (
                    o.falaEspontanea
                      ? <div className="bloco destaque"><small>Fala espontânea — restrita</small>
                          {o.falaEspontanea}</div>
                      : <div className="notice c-med">
                          Este registro tem conteúdo restrito que <b>não abre</b> para o seu
                          cargo. Não é filtro de tela: o conteúdo não é devolvido.
                        </div>
                  )}

                  <div className="mutetxt">
                    Avisados na abertura: {o.avisados.join(', ')}. O Gestor Geral não recebe
                    automaticamente — quem escalona é a equipe técnica ou a coordenação.
                  </div>

                  <div className="eyebrow">Acompanhamento</div>
                  {o.acompanhamento.length === 0 && (
                    <p className="mutetxt" style={{ margin: 0 }}>Nada registrado ainda.</p>
                  )}
                  {o.acompanhamento.map((a) => (
                    <div className="bloco compl" key={a.id}>
                      <small>{a.quem} · {hhmm(a.em)}</small>{a.texto}
                    </div>
                  ))}

                  {o.situacao !== 'encerrada' && (
                    <NotaRapida onEnviar={(texto) => acao(() =>
                      api(`/incidents/${o.id}/note`, {
                        method: 'POST', body: JSON.stringify({ texto }) }))} />
                  )}

                  <div className="row">
                    {o.etapaOperacional === 'aberta' && (
                      <button className="btn sm ghost" onClick={() => acao(() =>
                        api(`/incidents/${o.id}/operational-close`, { method: 'POST', body: '{}' }))}>
                        Encerrar etapa operacional
                      </button>
                    )}
                    {o.situacao !== 'encerrada' && analisa && (
                      <button className="btn sm" onClick={() => setEncerrando(o)}>
                        Analisar e encerrar
                      </button>
                    )}
                    {o.situacao === 'encerrada' && (
                      <button className="btn sm ghost" onClick={() => {
                        const motivo = prompt('Por que reabrir? Fica registrado com o seu nome:') ?? '';
                        if (motivo.trim().length >= 5) {
                          acao(() => api(`/incidents/${o.id}/reopen`, {
                            method: 'POST', body: JSON.stringify({ motivo }) }));
                        }
                      }}>Reabrir com histórico</button>
                    )}
                  </div>
                  {o.situacao !== 'encerrada' && !analisa && (
                    <p className="mutetxt" style={{ margin: 0 }}>
                      Você encerra a etapa operacional. A análise é da equipe técnica ou da
                      coordenação — e é ela que fecha a ocorrência.
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="mutetxt" style={{ marginTop: 12 }}>
        Nenhuma ocorrência se encerra sozinha, nem por tempo. O que foi escrito por
        alguém continua como aquela pessoa escreveu; a síntese entra ao lado, com autor
        e horário.
      </p>

      {abrindo && (
        <FolhaNova categorias={categorias} pessoas={pessoas}
                   onFechar={() => setAbrindo(false)}
                   onAbrir={async (corpo) => {
                     const ok = await acao(() => api('/incidents', {
                       method: 'POST', body: JSON.stringify(corpo) }));
                     if (ok) setAbrindo(false);
                   }} />
      )}

      {encerrando && (
        <FolhaEncerrar ocorrencia={encerrando} onFechar={() => setEncerrando(null)}
                       onEncerrar={async (sintese) => {
                         const ok = await acao(() => api(`/incidents/${encerrando.id}/close`, {
                           method: 'POST', body: JSON.stringify({ sintese }) }));
                         if (ok) setEncerrando(null);
                       }} />
      )}
    </>
  );
}

function NotaRapida({ onEnviar }: { onEnviar: (texto: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState('');
  return (
    <>
      <label className="f" htmlFor="nota-oco">
        Registrar acompanhamento <small>— entra ao lado, sem reescrever nada</small>
      </label>
      <textarea id="nota-oco" value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="Ex.: conversado com a equipe técnica; retorno marcado para amanhã." />
      <button className="btn sec sm" disabled={texto.trim().length < 5}
              onClick={async () => { if (await onEnviar(texto)) setTexto(''); }}>
        Registrar
      </button>
    </>
  );
}

function FolhaNova({ categorias, pessoas, onFechar, onAbrir }: {
  categorias: Categoria[]; pessoas: Pessoa[]; onFechar: () => void;
  onAbrir: (corpo: Record<string, unknown>) => void;
}) {
  const [categoria, setCategoria] = useState('');
  const [personId, setPersonId] = useState('');
  const [fato, setFato] = useState('');
  const [medidas, setMedidas] = useState('');
  const [fala, setFala] = useState('');
  const cat = categorias.find((c) => c.cod === categoria);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-oco"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-oco">Registrar ocorrência</h3>
        <div className="notice c-crit">
          Proteção primeiro. Este formulário existe para o depois — e aceita o mínimo,
          para não roubar tempo do que importa agora.
        </div>

        <label className="f">Categoria</label>
        <div className="opts">
          {categorias.map((c) => (
            <button type="button" key={c.cod} className={`opt ${c.tom}`}
                    aria-pressed={categoria === c.cod}
                    onClick={() => setCategoria(c.cod)}>{c.label}</button>
          ))}
        </div>
        {cat && (
          <div className="row" style={{ marginTop: 8 }}>
            <span className={`pill ${cat.exigeRevisao ? 'c-med' : 'c-info'}`}>
              {cat.exigeRevisao ? 'Exige análise técnica' : 'Encerramento pela coordenação do caso'}
            </span>
            {cat.restrita && <span className="pill c-crit">Nasce restrita</span>}
          </div>
        )}

        <label className="f" htmlFor="oc-pessoa">Acolhido envolvido</label>
        <select id="oc-pessoa" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Casa toda / não se aplica a uma pessoa</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        <label className="f" htmlFor="oc-fato">
          Fato objetivo <small>— o que aconteceu, sem interpretação</small>
        </label>
        <textarea id="oc-fato" value={fato} onChange={(e) => setFato(e.target.value)}
                  placeholder="Descreva o fato, o horário e o que foi feito imediatamente." />

        <label className="f" htmlFor="oc-med">Medidas imediatas</label>
        <textarea id="oc-med" value={medidas} onChange={(e) => setMedidas(e.target.value)}
                  placeholder="O que foi feito para proteger e atender." />

        {cat?.restrita && (
          <>
            <label className="f" htmlFor="oc-fala">
              Fala espontânea do acolhido <small>— transcrição, sem interpretação</small>
            </label>
            <div className="notice c-med">
              Este campo <b>não aparece</b> para colegas de plantão. Abrem: você, a equipe
              técnica e a coordenação.
            </div>
            <textarea id="oc-fala" value={fala} onChange={(e) => setFala(e.target.value)}
                      placeholder="Transcreva o que foi dito, entre aspas." />
          </>
        )}

        {categoria === 'contencao' && (
          <div className="notice c-warn">
            A contenção pede campos próprios: antecedentes, local, presentes, tentativas
            anteriores, método, duração, possível lesão e avaliação de saúde.
            <b> O sistema não avalia se a medida foi adequada</b> — essa análise é humana.
          </div>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!categoria}
                  onClick={() => onAbrir({ categoria, personId, fato, medidas, falaEspontanea: fala })}>
            Abrir ocorrência e avisar
          </button>
        </div>
      </div>
    </div>
  );
}

function FolhaEncerrar({ ocorrencia, onFechar, onEncerrar }: {
  ocorrencia: Ocorrencia; onFechar: () => void; onEncerrar: (sintese: string) => void;
}) {
  const [sintese, setSintese] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-enc"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-enc">Analisar e encerrar · {ocorrencia.acolhido}</h3>
        <p className="mutetxt">{ocorrencia.categoria}</p>
        <div className="notice c-info">
          A síntese é um registro <b>novo</b>. Ela não apaga nem corrige nenhum relato:
          os originais continuam legíveis como foram escritos.
        </div>
        <label className="f" htmlFor="sintese">
          Síntese <small>— a que se chegou e o que fica combinado</small>
        </label>
        <textarea id="sintese" value={sintese} onChange={(e) => setSintese(e.target.value)}
                  placeholder="Ex.: conversado com o acolhido e com a escola; combinada a rotina de saída." />
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" onClick={() => onEncerrar(sintese)}>
            Encerrar com a minha assinatura
          </button>
        </div>
      </div>
    </div>
  );
}
