import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * ACOMPANHAMENTOS E RELATÓRIOS.
 *
 * Três regras que a tela precisa fazer visíveis:
 *
 *  * a automação cria a PENDÊNCIA e nunca escreve a avaliação. Os eixos
 *    nascem vazios: o texto é de quem acompanha o caso;
 *  * os eixos são obrigatórios no envio. O que não foi observado se escreve
 *    como não observado — deixar em branco vira, mais tarde, a impressão de
 *    que não havia nada a dizer;
 *  * quem redigiu não aprova o próprio texto, e aprovado não se edita:
 *    corrigir cria a versão seguinte, e a anterior continua legível.
 *
 * Nada aqui pontua, ordena ou compara crianças.
 */

interface Eixo { cod: string; label: string }
interface Acompanhamento {
  id: string; acolhido: string; tipo: 'semanal' | 'mensal'; periodo: string;
  situacao: 'pendente' | 'rascunho' | 'em_aprovacao' | 'aprovado';
  versao: number; redator: string | null; aprovador: string | null;
  eixos: Record<string, string>; devolucao: string | null;
  proprio: boolean; podeAprovar: boolean;
  historico: { id: string; quem: string; acao: string; em: string; nota: string | null }[];
}
interface Relatorio {
  id: string; tipo: string; acolhido: string | null; periodo: string;
  situacao: 'em_aprovacao' | 'aprovado'; finalidade: string; autor: string;
  podeAprovar: boolean;
  entregas: { id: string; destino: string; meio: string; em: string;
              protocolo: string | null; por: string }[];
}

const SITUACAO: Record<string, { label: string; tom: string }> = {
  pendente: { label: 'Pendente', tom: 'c-warn' },
  rascunho: { label: 'Rascunho', tom: 'c-info' },
  em_aprovacao: { label: 'Aguardando aprovação', tom: 'c-med' },
  aprovado: { label: 'Aprovado', tom: 'c-ok' },
};

const MEIOS = ['Protocolo presencial', 'E-mail institucional', 'Entrega em mãos',
  'Sistema do Judiciário'];

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR',
  { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo' });

export function Acompanhamentos() {
  const [aba, setAba] = useState<'acomp' | 'relat'>('acomp');
  const [eixos, setEixos] = useState<Eixo[]>([]);
  const [lista, setLista] = useState<Acompanhamento[]>([]);
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [editando, setEditando] = useState<Acompanhamento | null>(null);
  const [entregando, setEntregando] = useState<Relatorio | null>(null);

  async function carregar() {
    setErro('');
    try {
      const [e, f, r] = await Promise.all([
        api<Eixo[]>('/followups/axes'),
        api<Acompanhamento[]>('/followups'),
        api<Relatorio[]>('/reports'),
      ]);
      setEixos(e); setLista(f); setRelatorios(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os acompanhamentos.');
    }
  }
  useEffect(() => { carregar(); }, []);

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try { const r = await fn(); if (r?.aviso) setAviso(r.aviso); await carregar(); return true; }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
  }

  const abertos = lista.filter((f) => f.situacao !== 'aprovado');
  const aprovados = lista.filter((f) => f.situacao === 'aprovado');

  const cartao = (f: Acompanhamento) => {
    const s = SITUACAO[f.situacao];
    return (
      <div className="card stack" key={f.id}>
        <div className="row">
          <b className="ff grow">{f.acolhido} · acompanhamento {f.tipo}</b>
          <span className={`pill ${s.tom}`}>{s.label}</span>
        </div>
        <div className="mutetxt">
          Período: {f.periodo} · versão {f.versao}
          {f.redator ? ` · redigido por ${f.redator}` : ''}
          {f.aprovador ? ` · aprovado por ${f.aprovador}` : ''}
        </div>
        {f.devolucao && (
          <div className="notice c-warn">
            <b>Devolvido para revisão:</b> {f.devolucao}
          </div>
        )}
        <div className="row">
          <button className="btn sm ghost" onClick={() => setEditando(f)}>
            {f.situacao === 'pendente' ? 'Preencher' : 'Abrir'}
          </button>
          {f.situacao === 'em_aprovacao' && f.podeAprovar && !f.proprio && (
            <>
              <button className="btn sm" onClick={() => acao(() =>
                api(`/followups/${f.id}/approve`, { method: 'POST', body: '{}' }))}>
                Revisar e aprovar
              </button>
              <button className="btn sm ghost" onClick={() => {
                const motivo = prompt('O que precisa ser revisto? A pessoa que redigiu vai ler:') ?? '';
                if (motivo.trim().length >= 10) {
                  acao(() => api(`/followups/${f.id}/return`, {
                    method: 'POST', body: JSON.stringify({ motivo }) }));
                }
              }}>Devolver</button>
            </>
          )}
          {f.situacao === 'em_aprovacao' && f.proprio && (
            <span className="mutetxt">
              Você redigiu este texto — revisão do próprio autor não é revisão.
            </span>
          )}
          {f.situacao === 'aprovado' && (
            <button className="btn sm ghost" onClick={() => {
              const motivo = prompt('O que está sendo corrigido, e por quê?') ?? '';
              if (motivo.trim().length >= 10) {
                acao(() => api(`/followups/${f.id}/correct`, {
                  method: 'POST', body: JSON.stringify({ motivo }) }));
              }
            }}>Corrigir (nova versão)</button>
          )}
        </div>
        {f.historico.length > 0 && (
          <div className="mutetxt">
            {f.historico.map((h) => (
              <div key={h.id}>{h.quem} · {h.acao} · {quando(h.em)}{h.nota ? ` — ${h.nota}` : ''}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

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

      <div className="filtros" role="tablist" aria-label="Seções">
        <button role="tab" aria-selected={aba === 'acomp'} className={aba === 'acomp' ? 'on' : ''}
                onClick={() => setAba('acomp')}>Acompanhamentos</button>
        <button role="tab" aria-selected={aba === 'relat'} className={aba === 'relat' ? 'on' : ''}
                onClick={() => setAba('relat')}>Relatórios</button>
      </div>

      {aba === 'acomp' && (
        <>
          <div className="card raise stack">
            <div className="row">
              <div className="grow">
                <h3 style={{ fontSize: 17, margin: 0 }}>Acompanhamentos</h3>
                <div className="mutetxt">Semanal e mensal · eixos obrigatórios</div>
              </div>
              <button className="btn sm" onClick={() => acao(() =>
                api('/followups/generate', { method: 'POST', body: '{}' }))}>
                Gerar pendências
              </button>
            </div>
            <div className="notice c-info">
              A automação cria a pendência e <b>nunca escreve a avaliação</b>. Os eixos
              nascem vazios; o texto é de quem acompanha o caso.
            </div>
          </div>

          <div className="eyebrow">Abertos · {abertos.length}</div>
          <div className="stack">{abertos.map(cartao)}</div>

          <div className="eyebrow">Aprovados — retrato daquele momento</div>
          <div className="stack">{aprovados.map(cartao)}</div>

          <p className="mutetxt" style={{ marginTop: 12 }}>
            Aprovado não se edita. Corrigir cria a versão seguinte, que precisa de nova
            aprovação — e a anterior continua legível como estava.
          </p>
        </>
      )}

      {aba === 'relat' && (
        <>
          <div className="card raise stack">
            <h3 style={{ fontSize: 17, margin: 0 }}>Relatórios</h3>
            <div className="mutetxt">Toda geração pede finalidade.</div>
            <div className="notice c-med">
              O sistema <b>gera e não envia</b>. A entrega ao Judiciário, ao Conselho
              Tutelar ou ao Ministério Público é feita por uma pessoa e registrada aqui,
              com destinatário, meio, data e protocolo.
            </div>
          </div>

          <div className="stack">
            {relatorios.map((r) => {
              const s = SITUACAO[r.situacao];
              return (
                <div className="card stack" key={r.id}>
                  <div className="row">
                    <b className="ff grow">{r.tipo}{r.acolhido ? ` · ${r.acolhido}` : ''}</b>
                    <span className={`pill ${s.tom}`}>{s.label}</span>
                  </div>
                  <div className="mutetxt">{r.periodo} · {r.autor}</div>
                  <div className="bloco"><small>Finalidade</small>{r.finalidade}</div>
                  {r.entregas.map((e) => (
                    <div className="mutetxt" key={e.id}>
                      📎 Entregue a {e.destino} · {e.meio} · {quando(e.em)} · por {e.por}
                      {e.protocolo ? ` · protocolo ${e.protocolo}` : ''}
                    </div>
                  ))}
                  <div className="row">
                    {r.situacao === 'em_aprovacao' && r.podeAprovar && (
                      <button className="btn sm" onClick={() => acao(() =>
                        api(`/reports/${r.id}/approve`, { method: 'POST', body: '{}' }))}>
                        Aprovar
                      </button>
                    )}
                    {r.situacao === 'aprovado' && (
                      <button className="btn sm ghost" onClick={() => setEntregando(r)}>
                        Registrar entrega feita
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {editando && (
        <FolhaEixos acompanhamento={editando} eixos={eixos}
                    onFechar={() => setEditando(null)}
                    onSalvar={async (valores, enviar) => {
                      const ok = await acao(() => api(`/followups/${editando.id}/save`, {
                        method: 'POST', body: JSON.stringify({ eixos: valores, enviar }) }));
                      if (ok) setEditando(null);
                    }} />
      )}

      {entregando && (
        <FolhaEntrega relatorio={entregando} onFechar={() => setEntregando(null)}
                      onRegistrar={async (corpo) => {
                        const ok = await acao(() => api(`/reports/${entregando.id}/delivery`, {
                          method: 'POST', body: JSON.stringify(corpo) }));
                        if (ok) setEntregando(null);
                      }} />
      )}
    </>
  );
}

function FolhaEixos({ acompanhamento, eixos, onFechar, onSalvar }: {
  acompanhamento: Acompanhamento; eixos: Eixo[]; onFechar: () => void;
  onSalvar: (valores: Record<string, string>, enviar: boolean) => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>(
    () => ({ ...acompanhamento.eixos }));
  const bloqueado = acompanhamento.situacao === 'aprovado';
  const faltam = eixos.filter((e) => !String(valores[e.cod] ?? '').trim()).length;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-fu"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-fu">
          {acompanhamento.acolhido} · acompanhamento {acompanhamento.tipo}
        </h3>
        <p className="mutetxt">
          {acompanhamento.periodo} · versão {acompanhamento.versao}
        </p>

        {bloqueado ? (
          <div className="notice c-ok">
            Esta versão foi aprovada: ela é o retrato daquele momento e não se edita.
            Correção cria a versão seguinte, ao lado desta.
          </div>
        ) : (
          <div className="notice c-info">
            Os quatro eixos são obrigatórios no envio. O que não foi observado se escreve
            como <b>não observado</b> — em branco, mais tarde, vira “não havia nada a dizer”.
          </div>
        )}

        {eixos.map((e) => (
          <div key={e.cod}>
            <label className="f" htmlFor={`eixo-${e.cod}`}>{e.label}</label>
            <textarea id={`eixo-${e.cod}`} disabled={bloqueado}
                      value={valores[e.cod] ?? ''}
                      onChange={(ev) => setValores({ ...valores, [e.cod]: ev.target.value })}
                      placeholder="Fato e contexto, sem rótulo." />
          </div>
        ))}

        {!bloqueado && (
          <div className="row rodape">
            <button className="btn sec grow" onClick={() => onSalvar(valores, false)}>
              Salvar rascunho
            </button>
            <button className="btn grow" onClick={() => onSalvar(valores, true)}>
              Enviar para aprovação{faltam ? ` (${faltam} eixo(s) em branco)` : ''}
            </button>
          </div>
        )}
        {bloqueado && (
          <button className="btn sec block" style={{ marginTop: 16 }} onClick={onFechar}>
            Fechar
          </button>
        )}
      </div>
    </div>
  );
}

function FolhaEntrega({ relatorio, onFechar, onRegistrar }: {
  relatorio: Relatorio; onFechar: () => void;
  onRegistrar: (corpo: Record<string, unknown>) => void;
}) {
  const [destino, setDestino] = useState('');
  const [meio, setMeio] = useState(MEIOS[0]);
  const [protocolo, setProtocolo] = useState('');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-ent"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-ent">Registrar entrega · {relatorio.tipo}</h3>
        <div className="notice c-med">
          O sistema não envia nada para fora. Aqui se registra que <b>uma pessoa</b>
          entregou — com nome, destinatário, meio e horário.
        </div>

        <label className="f" htmlFor="ent-dest">Destinatário</label>
        <input id="ent-dest" value={destino} onChange={(e) => setDestino(e.target.value)}
               placeholder="Ex.: 1ª Vara da Infância e Juventude (fictícia)" />

        <label className="f" htmlFor="ent-meio">Meio</label>
        <select id="ent-meio" value={meio} onChange={(e) => setMeio(e.target.value)}>
          {MEIOS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <label className="f" htmlFor="ent-prot">Protocolo <small>— opcional</small></label>
        <input id="ent-prot" value={protocolo} onChange={(e) => setProtocolo(e.target.value)} />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!destino.trim()}
                  onClick={() => onRegistrar({ destino, meio, protocolo })}>
            Registrar entrega
          </button>
        </div>
      </div>
    </div>
  );
}
