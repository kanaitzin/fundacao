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
 *
 * ROTAS — 31/08/2026. Chamava `/incidents/categories`, `/incidents/:id/note`,
 * `/incidents/:id/close` e `/incidents/:id/reopen`. Nenhuma existe: o catálogo
 * é `/incidents/catalog`, a nota é uma SÍNTESE (`/:id/synthesis`), e fechar e
 * reabrir são a mesma rota de revisão com decisões opostas
 * (`/:id/review` com `validar` ou `reabrir`). Pior que o 404: `/categories`
 * casava com `GET /incidents/:id` e o servidor tentaria ler "categories" como
 * um id — falha silenciosa, do tipo que só aparece na casa.
 *
 * A lista do servidor é MAGRA de propósito: fato, medidas, fala espontânea e
 * relatos só saem no detalhe, um por vez, com a política decidindo o que
 * devolver. Uma lista que já trouxesse tudo entregaria conteúdo restrito a
 * quem só precisava ver que a ocorrência existe.
 */

interface Categoria {
  code: string; label: string; revisaoTecnica: boolean; restrito: boolean;
}
interface Catalogo { categorias: Categoria[]; orgaos: string[]; canais: string[]; aviso: string }

interface ItemLista {
  id: string; categoria: string; codigoCategoria: string; quando: string;
  status: string; nivelAcesso: 'equipe' | 'restrito';
  revisaoTecnicaObrigatoria: boolean; prazo: string | null;
  abertaPor: string; acolhidos: number; anexos: number;
}

interface Detalhe {
  id: string; casaId: string; categoria: string; codigoCategoria: string;
  quando: string; atividade: string | null; fato: string; presentes: string | null;
  medidasImediatas: string | null; saude: boolean; medicamento: boolean;
  contatos: string | null; pendencias: string | null; prazo: string | null;
  status: string; nivelAcesso: string; revisaoTecnicaObrigatoria: boolean;
  acolhidos: { id: string; nome: string; visivel: boolean }[];
  protegido: { falaEspontanea: string | null; sinaisObservados: string | null;
               registradoEm: string } | null;
  avisoProtegido: string | null;
  contencao: Record<string, unknown> | null;
  sinteses: { id: string; texto: string; autor: string; quando: string }[];
  relatos: { modo: string; nota: string;
             relatos: { id: string; autor: string; meu: boolean; testemunho: string;
                        relato: string; restrito: boolean; quando: string }[] };
  avisoAnaliseTecnica: string | null;
  anexos: { id: string; tipo: string; nome: string; restrito: boolean; autor: string }[];
  comunicacoesExternas: { id: string; orgao: string; canal: string; status: string }[];
}

interface Pessoa { id: string; nome: string }

/** Os estados são os do banco (§13.5) — a tela não inventa um fluxo paralelo. */
const SITUACAO: Record<string, { label: string; tom: string }> = {
  aberta: { label: 'Aberta', tom: 'c-warn' },
  em_acompanhamento: { label: 'Em acompanhamento', tom: 'c-warn' },
  encerrada_operacional: { label: 'Etapa operacional encerrada', tom: 'c-info' },
  aguardando_revisao_tecnica: { label: 'Aguardando análise técnica', tom: 'c-med' },
  fechada: { label: 'Fechada após análise', tom: 'c-ok' },
  reaberta: { label: 'Reaberta com histórico', tom: 'c-other' },
};
const TOM_CATEGORIA: Record<string, string> = {
  violencia_ou_suspeita: 'c-crit', conflito_agressao: 'c-warn',
  saida_nao_autorizada: 'c-move', erro_medicamento: 'c-med',
  emergencia_saude: 'c-crit', contencao: 'c-other',
  desorganizacao_relevante: 'c-info', dano_recusa_critica: 'c-info', outro: 'c-mute',
};
/** Etapa operacional já encerrada? Depois dela é que vem a análise. */
const OPERACIONAL_ENCERRADA = ['encerrada_operacional', 'aguardando_revisao_tecnica', 'fechada'];

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR',
  { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

const ANALISA = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

export function Ocorrencias({ houseId, papel }: { houseId: string; papel: string }) {
  const [lista, setLista] = useState<ItemLista[]>([]);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [detalhes, setDetalhes] = useState<Record<string, Detalhe>>({});
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [abrindo, setAbrindo] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState<ItemLista | null>(null);

  async function carregar() {
    setErro('');
    try {
      const [o, c, p] = await Promise.all([
        api<ItemLista[]>(`/incidents?houseId=${houseId}`),
        api<Catalogo>('/incidents/catalog'),
        api<Pessoa[]>(`/people?houseId=${houseId}`),
      ]);
      setLista(o); setCatalogo(c); setPessoas(p);
      // Detalhes já abertos são recarregados: o que a tela mostra continua
      // sendo o que o servidor devolve agora, não o que devolveu antes.
      const abertos = Object.keys(detalhes);
      if (abertos.length) {
        const novos: Record<string, Detalhe> = {};
        for (const id of abertos) {
          try { novos[id] = await api<Detalhe>(`/incidents/${id}`); } catch { /* saiu do alcance */ }
        }
        setDetalhes(novos);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as ocorrências.');
    }
  }
  useEffect(() => { carregar(); }, [houseId]);

  async function abrirDetalhe(id: string) {
    if (aberta === id) { setAberta(null); return; }
    setAberta(id);
    if (detalhes[id]) return;
    try {
      const d = await api<Detalhe>(`/incidents/${id}`);
      setDetalhes((m) => ({ ...m, [id]: d }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir a ocorrência.');
    }
  }

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try { const r = await fn(); if (r?.aviso) setAviso(r.aviso); await carregar(); return true; }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
  }

  const analisa = ANALISA.includes(papel);
  const abertas = lista.filter((o) => o.status !== 'fechada');

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
          {catalogo?.aviso ?? 'O registro nunca deve atrasar a proteção imediata, o atendimento '
            + 'de saúde ou o protocolo da instituição.'}
        </div>
        <button className="btn block" onClick={() => setAbrindo(true)}>
          🚨 Registrar ocorrência
        </button>
      </div>

      <div className="eyebrow">Em acompanhamento · {abertas.length}</div>
      <div className="stack">
        {lista.map((o) => {
          const s = SITUACAO[o.status] ?? { label: o.status, tom: 'c-mute' };
          const expandida = aberta === o.id;
          const d = detalhes[o.id];
          const operacionalEncerrada = OPERACIONAL_ENCERRADA.includes(o.status);
          return (
            <div className="card stack" key={o.id}>
              <div className="row">
                <span className={`pill ${TOM_CATEGORIA[o.codigoCategoria] ?? 'c-mute'}`}>
                  {o.categoria}
                </span>
                <span className="grow" />
                <span className={`pill ${s.tom}`}>{s.label}</span>
              </div>
              <div className="mutetxt">
                {dia(o.quando)} às {hhmm(o.quando)} · aberta por {o.abertaPor} ·
                {' '}{o.acolhidos} acolhido(s){o.anexos ? ` · ${o.anexos} anexo(s)` : ''}
              </div>
              <div className="row">
                {o.revisaoTecnicaObrigatoria && <span className="pill c-med">Exige análise técnica</span>}
                {o.nivelAcesso === 'restrito' && <span className="pill c-crit">Acesso restrito</span>}
                {o.prazo && <span className="pill c-warn">Pendência até {dia(o.prazo)}</span>}
              </div>

              <button className="btn sm ghost" onClick={() => abrirDetalhe(o.id)}>
                {expandida ? 'Fechar detalhes' : 'Abrir detalhes'}
              </button>

              {expandida && !d && <p className="mutetxt">Abrindo…</p>}
              {expandida && d && (
                <>
                  <div className="mutetxt">
                    Acolhidos: {d.acolhidos.length
                      ? d.acolhidos.map((a) => a.nome).join(', ')
                      : 'não se aplica a uma pessoa'}
                  </div>
                  <div className="bloco"><small>Fato</small>{d.fato}</div>
                  {d.medidasImediatas && (
                    <div className="bloco"><small>Medidas imediatas</small>{d.medidasImediatas}</div>
                  )}

                  {d.protegido
                    ? (d.protegido.falaEspontanea || d.protegido.sinaisObservados) && (
                        <div className="bloco destaque">
                          <small>Registro protegido — restrito</small>
                          {d.protegido.falaEspontanea}
                          {d.protegido.sinaisObservados && (
                            <div className="mutetxt">Sinais observados: {d.protegido.sinaisObservados}</div>
                          )}
                        </div>
                      )
                    : d.avisoProtegido && (
                        <div className="notice c-med">
                          {d.avisoProtegido} <b>Não é filtro de tela</b>: o conteúdo não é devolvido.
                        </div>
                      )}

                  {d.contencao && (
                    <div className="notice c-warn">
                      Contenção registrada com campos próprios. <b>O sistema não avalia se a
                      medida foi adequada</b> — essa análise é humana e técnica.
                    </div>
                  )}

                  <div className="eyebrow">Relatos</div>
                  <p className="mutetxt" style={{ margin: 0 }}>{d.relatos.nota}</p>
                  {d.relatos.relatos.map((r) => (
                    <div className="bloco compl" key={r.id}>
                      <small>{r.autor} · {r.testemunho} · {hhmm(r.quando)}</small>{r.relato}
                    </div>
                  ))}

                  <div className="eyebrow">Sínteses técnicas</div>
                  {d.avisoAnaliseTecnica && (
                    <p className="mutetxt" style={{ margin: 0 }}>{d.avisoAnaliseTecnica}</p>
                  )}
                  {!d.avisoAnaliseTecnica && d.sinteses.length === 0 && (
                    <p className="mutetxt" style={{ margin: 0 }}>Nada registrado ainda.</p>
                  )}
                  {d.sinteses.map((a) => (
                    <div className="bloco compl" key={a.id}>
                      <small>{a.autor} · {hhmm(a.quando)}</small>{a.texto}
                    </div>
                  ))}

                  {d.status !== 'fechada' && analisa && (
                    <Sintese onEnviar={(texto) => acao(() =>
                      api(`/incidents/${o.id}/synthesis`, {
                        method: 'POST', body: JSON.stringify({ texto }) }))} />
                  )}

                  <div className="row">
                    {!operacionalEncerrada && (
                      <button className="btn sm ghost" onClick={() => acao(() =>
                        api(`/incidents/${o.id}/operational-close`, { method: 'POST', body: '{}' }))}>
                        Encerrar etapa operacional
                      </button>
                    )}
                    {operacionalEncerrada && d.status !== 'fechada' && analisa && (
                      <button className="btn sm" onClick={() => setEncerrando(o)}>
                        Analisar e fechar
                      </button>
                    )}
                    {d.status === 'fechada' && analisa && (
                      <button className="btn sm ghost" onClick={() => {
                        const motivo = prompt('Por que reabrir? Fica registrado com o seu nome:') ?? '';
                        if (motivo.trim().length >= 5) {
                          acao(() => api(`/incidents/${o.id}/review`, {
                            method: 'POST',
                            body: JSON.stringify({ decisao: 'reabrir', nota: motivo }) }));
                        }
                      }}>Reabrir com histórico</button>
                    )}
                  </div>
                  {d.status !== 'fechada' && !analisa && (
                    <p className="mutetxt" style={{ margin: 0 }}>
                      {operacionalEncerrada
                        ? 'A etapa operacional já foi encerrada. A análise é da equipe técnica ou '
                          + 'da coordenação — e é ela que fecha a ocorrência.'
                        : 'Você encerra a etapa operacional. A análise é da equipe técnica ou da '
                          + 'coordenação — e é ela que fecha a ocorrência.'}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
        {lista.length === 0 && (
          <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
            Nenhuma ocorrência registrada nesta casa.</p></div>
        )}
      </div>

      <p className="mutetxt" style={{ marginTop: 12 }}>
        Nenhuma ocorrência se encerra sozinha, nem por tempo. O que foi escrito por
        alguém continua como aquela pessoa escreveu; a síntese entra ao lado, com autor
        e horário.
      </p>

      {abrindo && catalogo && (
        <FolhaNova categorias={catalogo.categorias} pessoas={pessoas}
                   onFechar={() => setAbrindo(false)}
                   onAbrir={async (corpo) => {
                     const ok = await acao(() => api('/incidents', {
                       method: 'POST', body: JSON.stringify({ houseId, ...corpo }) }));
                     if (ok) setAbrindo(false);
                   }} />
      )}

      {encerrando && (
        <FolhaEncerrar
          ocorrencia={encerrando}
          jaTemSintese={(detalhes[encerrando.id]?.sinteses.length ?? 0) > 0}
          onFechar={() => setEncerrando(null)}
          onEncerrar={async (sintese) => {
            // Duas coisas, na ordem em que o servidor as exige: a síntese é um
            // registro novo e assinado; o fechamento é a decisão que vem depois
            // dela. Fechar caso grave sem síntese é fechar sem ninguém escrever
            // a que se chegou — e o banco recusa.
            const ok = await acao(async () => {
              if (sintese.trim().length >= 20) {
                await api(`/incidents/${encerrando.id}/synthesis`, {
                  method: 'POST', body: JSON.stringify({ texto: sintese }) });
              }
              return api(`/incidents/${encerrando.id}/review`, {
                method: 'POST', body: JSON.stringify({ decisao: 'validar' }) });
            });
            if (ok) setEncerrando(null);
          }} />
      )}
    </>
  );
}

function Sintese({ onEnviar }: { onEnviar: (texto: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState('');
  return (
    <>
      <label className="f" htmlFor="nota-oco">
        Registrar síntese técnica <small>— entra ao lado, sem reescrever nada</small>
      </label>
      <textarea id="nota-oco" value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="Ex.: conversado com a equipe técnica; retorno marcado para amanhã." />
      <button className="btn sec sm" disabled={texto.trim().length < 20}
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
  const cat = categorias.find((c) => c.code === categoria);
  // O servidor exige o fato com 15 caracteres e a data-hora. A tela cobra antes
  // de enviar, com a mesma régua — recusa na cara da pessoa é pior que aviso.
  const pode = !!categoria && fato.trim().length >= 15;

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
            <button type="button" key={c.code} className={`opt ${TOM_CATEGORIA[c.code] ?? 'c-mute'}`}
                    aria-pressed={categoria === c.code}
                    onClick={() => setCategoria(c.code)}>{c.label}</button>
          ))}
        </div>
        {cat && (
          <div className="row" style={{ marginTop: 8 }}>
            <span className={`pill ${cat.revisaoTecnica ? 'c-med' : 'c-info'}`}>
              {cat.revisaoTecnica ? 'Exige análise técnica' : 'Encerramento pela coordenação do caso'}
            </span>
            {cat.restrito && <span className="pill c-crit">Nasce restrita</span>}
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

        {cat?.restrito && (
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
          <button className="btn grow" disabled={!pode}
                  onClick={() => onAbrir({
                    categoria,
                    // O servidor guarda a hora do FATO, não a do registro.
                    quando: new Date().toISOString(),
                    acolhidos: personId ? [personId] : [],
                    fato, medidasImediatas: medidas,
                    falaEspontanea: fala || undefined,
                  })}>
            Abrir ocorrência e avisar
          </button>
        </div>
      </div>
    </div>
  );
}

function FolhaEncerrar({ ocorrencia, jaTemSintese, onFechar, onEncerrar }: {
  ocorrencia: ItemLista; jaTemSintese: boolean;
  onFechar: () => void; onEncerrar: (sintese: string) => void;
}) {
  const [sintese, setSintese] = useState('');
  const pode = jaTemSintese || sintese.trim().length >= 20;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-enc"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-enc">Analisar e fechar</h3>
        <p className="mutetxt">{ocorrencia.categoria} · {dia(ocorrencia.quando)}</p>
        <div className="notice c-info">
          A síntese é um registro <b>novo</b>. Ela não apaga nem corrige nenhum relato:
          os originais continuam legíveis como foram escritos.
        </div>
        <label className="f" htmlFor="sintese">
          Síntese <small>— a que se chegou e o que fica combinado{jaTemSintese
            ? '; já existe uma registrada, esta entra ao lado' : ''}</small>
        </label>
        <textarea id="sintese" value={sintese} onChange={(e) => setSintese(e.target.value)}
                  placeholder="Ex.: conversado com o acolhido e com a escola; combinada a rotina de saída." />
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onEncerrar(sintese)}>
            Fechar com a minha assinatura
          </button>
        </div>
      </div>
    </div>
  );
}
