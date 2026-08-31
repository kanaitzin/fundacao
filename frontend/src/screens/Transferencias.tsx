import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * TRANSFERÊNCIAS ENTRE UNIDADES (§15.6).
 *
 * Duas caixas: o que esta coordenação PEDIU e o que CHEGOU de outra unidade.
 *
 * A decisão é sempre do destino, e recusar exige motivo escrito — o motivo
 * aparece nas duas casas, porque é por ele que a origem decide o próximo
 * passo da criança. Nada disso é automático: o sistema não sugere destino,
 * não pontua "aderência de perfil" e não aceita nada sozinho.
 *
 * A conversa entre as coordenações mora aqui dentro, presa à solicitação, e
 * não pode ser apagada — para não voltar a acontecer no grupo de mensagens.
 *
 * ROTAS — 31/08/2026. As rotas existiam; a tela é que falava com elas errado:
 * pedia `GET /transfers`, que no servidor só aceita POST — as duas caixas são
 * `GET /transfers/inbox` e `GET /transfers/outbox`, com formatos diferentes,
 * porque quem recebe vê MENOS do que quem pediu (o perfil completo só abre
 * depois do aceite). Recusar era `/refuse` e é `/decline`; a conversa era
 * `/message` e é `/messages`, buscada por solicitação — a lista não traz as
 * mensagens junto.
 */

/** Recebida: quem é, de onde vem e por quê. Nada além disso antes do aceite. */
interface Recebida {
  id: string; nomeCompleto: string; nomeSocial: string | null; idade: number;
  origem: { codigo: string; nome: string };
  motivo: string; solicitadaPor: string; solicitadaEm: string; mensagens: number;
}
/** Enviada: o que esta casa pediu, com a resposta que veio de volta. */
interface Enviada {
  id: string; nomeCompleto: string; nomeSocial: string | null; idade: number;
  destino: { codigo: string; nome: string };
  motivo: string; status: string; situacao: string;
  solicitadaPor: string; solicitadaEm: string;
  decididaPor: string | null; decididaEm: string | null;
  justificativa: string | null; mensagens: number;
}
interface Mensagem {
  id: string; autor: string; casa: string; texto: string; quando: string; minha: boolean;
}
interface Casa { id: string; code: string; name: string }
interface Pessoa { id: string; nome: string; idade: number }

/** Os tons acompanham o `status` do banco; o rótulo vem do servidor. */
const TOM_STATUS: Record<string, string> = {
  solicitada: 'c-warn', aceita: 'c-ok', recusada: 'c-crit', cancelada: 'c-mute',
};

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR',
  { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo' });

export function Transferencias({ houseId }: { houseId: string }) {
  const [caixa, setCaixa] = useState<'recebida' | 'enviada'>('recebida');
  const [recebidas, setRecebidas] = useState<Recebida[]>([]);
  const [enviadas, setEnviadas] = useState<Enviada[]>([]);
  const [avisoCaixa, setAvisoCaixa] = useState('');
  const [casas, setCasas] = useState<Casa[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [conversa, setConversa] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Record<string, Mensagem[]>>({});
  const [decidindo, setDecidindo] = useState<{ id: string; nome: string; modo: 'aceitar' | 'recusar' } | null>(null);
  const [nova, setNova] = useState(false);

  async function carregar() {
    setErro('');
    try {
      const [r, e, c, p] = await Promise.all([
        api<{ aviso: string; solicitacoes: Recebida[] }>(`/transfers/inbox?houseId=${houseId}`),
        api<{ solicitacoes: Enviada[] }>(`/transfers/outbox?houseId=${houseId}`),
        api<Casa[]>('/houses/directory').catch(() => [] as Casa[]),
        api<Pessoa[]>(`/people?houseId=${houseId}`).catch(() => [] as Pessoa[]),
      ]);
      setRecebidas(r.solicitacoes); setAvisoCaixa(r.aviso);
      setEnviadas(e.solicitacoes); setCasas(c); setPessoas(p);
      setMensagens({}); setConversa(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível carregar as transferências.');
    }
  }
  useEffect(() => { carregar(); }, [houseId]);

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try { const r = await fn(); if (r?.aviso) setAviso(r.aviso); await carregar(); return true; }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
  }

  /** A conversa é buscada por solicitação: a lista traz só quantas há. */
  async function abrirConversa(id: string) {
    if (conversa === id) { setConversa(null); return; }
    setConversa(id);
    if (mensagens[id]) return;
    try {
      const m = await api<Mensagem[]>(`/transfers/${id}/messages`);
      setMensagens((x) => ({ ...x, [id]: m }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir a conversa.');
    }
  }

  const pendentesRecebidas = recebidas.length;

  function Conversa({ id, quantas }: { id: string; quantas: number }) {
    const aberta = conversa === id;
    const lista = mensagens[id] ?? [];
    return (
      <>
        <button className="btn ghost sm" onClick={() => abrirConversa(id)}>
          {aberta ? 'Fechar conversa'
            : `💬 Conversar com a outra coordenação${quantas ? ` (${quantas})` : ''}`}
        </button>
        {aberta && (
          <>
            <div className="eyebrow">Conversa entre as coordenações</div>
            {lista.length === 0 && (
              <p className="mutetxt" style={{ margin: 0 }}>
                Ainda não há mensagens sobre esta solicitação.
              </p>
            )}
            {lista.map((m) => (
              <div className="bloco compl" key={m.id}>
                <small>{m.autor} · {m.casa} · {quando(m.quando)}</small>{m.texto}
              </div>
            ))}
            <CampoMensagem onEnviar={(texto) => acao(() =>
              api(`/transfers/${id}/messages`, {
                method: 'POST', body: JSON.stringify({ casaId: houseId, texto }) }))} />
            <p className="mutetxt" style={{ margin: 0 }}>
              A conversa fica dentro do sistema, presa a esta solicitação, e não pode
              ser apagada. Nenhuma coordenação entra na casa da outra para falar.
            </p>
          </>
        )}
      </>
    );
  }

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

      <div className="filtros" role="tablist" aria-label="Caixas de transferência">
        <button role="tab" aria-selected={caixa === 'recebida'}
                className={caixa === 'recebida' ? 'on' : ''}
                onClick={() => { setCaixa('recebida'); setConversa(null); }}>
          Recebidas{pendentesRecebidas ? ` · ${pendentesRecebidas}` : ''}
        </button>
        <button role="tab" aria-selected={caixa === 'enviada'}
                className={caixa === 'enviada' ? 'on' : ''}
                onClick={() => { setCaixa('enviada'); setConversa(null); }}>
          Enviadas por esta casa
        </button>
      </div>

      {caixa === 'recebida' && (
        <>
          <div className="notice c-info">{avisoCaixa}</div>
          <div className="stack" style={{ marginTop: 12 }}>
            {recebidas.map((t) => (
              <div className="card stack" key={t.id}>
                <div className="row">
                  <b className="ff grow" style={{ fontSize: 16 }}>{t.nomeCompleto}</b>
                  <span className="pill c-warn">Aguardando decisão desta casa</span>
                </div>
                {t.nomeSocial && (
                  <div className="mutetxt">Chamado(a) de <b>{t.nomeSocial}</b> · {t.idade} anos</div>
                )}
                {!t.nomeSocial && <div className="mutetxt">{t.idade} anos</div>}
                <div className="row">
                  <span className="pill c-move">Vem de {t.origem.codigo} · {t.origem.nome}</span>
                </div>
                <div className="bloco destaque"><small>Motivo</small>{t.motivo}</div>
                <div className="mutetxt">
                  Solicitada por {t.solicitadaPor} em {quando(t.solicitadaEm)}.
                </div>
                <div className="row">
                  <button className="btn sm grow"
                          onClick={() => setDecidindo({ id: t.id, nome: t.nomeCompleto, modo: 'aceitar' })}>
                    ✓ Aceitar
                  </button>
                  <button className="btn sec sm grow"
                          onClick={() => setDecidindo({ id: t.id, nome: t.nomeCompleto, modo: 'recusar' })}>
                    Recusar com motivo
                  </button>
                </div>
                <Conversa id={t.id} quantas={t.mensagens} />
              </div>
            ))}
            {recebidas.length === 0 && (
              <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
                Nenhuma solicitação nesta caixa no momento.</p></div>
            )}
          </div>
        </>
      )}

      {caixa === 'enviada' && (
        <div className="stack" style={{ marginTop: 12 }}>
          {enviadas.map((t) => (
            <div className="card stack" key={t.id}>
              <div className="row">
                <b className="ff grow" style={{ fontSize: 16 }}>{t.nomeCompleto}</b>
                <span className={`pill ${TOM_STATUS[t.status] ?? 'c-mute'}`}>{t.situacao}</span>
              </div>
              {t.nomeSocial && (
                <div className="mutetxt">Chamado(a) de <b>{t.nomeSocial}</b> · {t.idade} anos</div>
              )}
              <div className="row">
                <span className="pill c-move">Destino {t.destino.codigo} · {t.destino.nome}</span>
              </div>
              <div className="bloco destaque"><small>Motivo</small>{t.motivo}</div>
              <div className="mutetxt">
                Solicitada por {t.solicitadaPor} em {quando(t.solicitadaEm)}.
              </div>
              {t.justificativa && (
                <div className={`notice ${t.status === 'recusada' ? 'c-crit' : 'c-mute'}`}>
                  <b>{t.situacao}{t.decididaPor ? ` por ${t.decididaPor}` : ''}
                    {t.decididaEm ? ` em ${quando(t.decididaEm)}` : ''}:</b>
                  <div>{t.justificativa}</div>
                </div>
              )}
              {t.status === 'solicitada' && (
                <button className="btn ghost sm" onClick={() => {
                  const motivo = prompt('Por que o pedido está sendo cancelado? '
                    + 'A outra coordenação vai ler:') ?? '';
                  if (motivo.trim().length >= 10) {
                    acao(() => api(`/transfers/${t.id}/cancel`, {
                      method: 'POST', body: JSON.stringify({ motivo }) }));
                  }
                }}>Cancelar pedido</button>
              )}
              <Conversa id={t.id} quantas={t.mensagens} />
            </div>
          ))}
          {enviadas.length === 0 && (
            <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
              Nenhuma solicitação nesta caixa no momento.</p></div>
          )}
        </div>
      )}

      {caixa === 'enviada' && (
        <div className="card stack" style={{ marginTop: 14 }}>
          <b className="ff">Nova transferência</b>
          <p className="mutetxt" style={{ margin: 0 }}>
            Escolha o acolhido e a unidade de destino. O motivo é obrigatório: é ele que a
            outra coordenação vai ler para decidir.
          </p>
          <button className="btn sec block" onClick={() => setNova(true)}>
            Solicitar transferência
          </button>
        </div>
      )}

      <p className="mutetxt" style={{ marginTop: 12 }}>
        A criança só muda de casa <b>no aceite</b>. Até lá, a responsabilidade continua
        sendo desta unidade — e nenhuma etapa acontece sem alguém com nome decidindo.
      </p>

      {decidindo && (
        <FolhaDecisao
          nome={decidindo.nome} modo={decidindo.modo}
          onFechar={() => setDecidindo(null)}
          onConfirmar={async (texto) => {
            // `decline`, não `refuse`; e as chaves do corpo são as do servidor:
            // o aceite guarda uma NOTA opcional, a recusa exige MOTIVO.
            const rota = decidindo.modo === 'aceitar'
              ? `/transfers/${decidindo.id}/accept` : `/transfers/${decidindo.id}/decline`;
            const corpo = decidindo.modo === 'aceitar'
              ? { nota: texto } : { motivo: texto };
            const ok = await acao(() => api(rota, {
              method: 'POST', body: JSON.stringify(corpo) }));
            if (ok) setDecidindo(null);
          }} />
      )}

      {nova && (
        <FolhaNova casas={casas} pessoas={pessoas} onFechar={() => setNova(false)}
                   onEnviar={async (corpo) => {
                     const ok = await acao(() => api('/transfers', {
                       method: 'POST', body: JSON.stringify(corpo) }));
                     if (ok) setNova(false);
                   }} />
      )}
    </>
  );
}

function CampoMensagem({ onEnviar }: { onEnviar: (texto: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState('');
  return (
    <>
      <label className="f" htmlFor="msg-tr">Sua mensagem</label>
      <textarea id="msg-tr" value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="Escreva para a outra coordenação." />
      <button className="btn sec sm" disabled={!texto.trim()}
              onClick={async () => { if (await onEnviar(texto)) setTexto(''); }}>
        Enviar mensagem
      </button>
    </>
  );
}

function FolhaDecisao({ nome, modo, onFechar, onConfirmar }: {
  nome: string; modo: 'aceitar' | 'recusar';
  onFechar: () => void; onConfirmar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-dec"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-dec">
          {modo === 'aceitar' ? `Aceitar ${nome}?` : `Recusar a transferência de ${nome}`}
        </h3>

        {modo === 'aceitar' ? (
          <div className="notice c-info">
            Ao aceitar, e só então:
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              <li>a casa atual passa a ser a sua e o perfil abre por completo;</li>
              <li>histórico, documentos, medicamentos, alergias e pendências vêm junto;</li>
              <li>as ATAs fechadas da origem continuam imutáveis;</li>
              <li>os dados bancários deixam a coordenação de origem e passam à sua.</li>
            </ul>
          </div>
        ) : (
          <div className="notice c-crit">
            O motivo é <b>obrigatório</b> e fica registrado <b>nas duas casas</b>. É por ele
            que a coordenação de origem decide o próximo passo da criança.
          </div>
        )}

        <label className="f" htmlFor="dec-txt">
          {modo === 'aceitar'
            ? <>Observação para o registro <small>— opcional</small></>
            : 'Motivo da recusa'}
        </label>
        <textarea id="dec-txt" value={texto} onChange={(e) => setTexto(e.target.value)}
                  placeholder={modo === 'aceitar'
                    ? 'Ex.: vaga confirmada no quarto 2; chegada combinada para quinta.'
                    : 'Ex.: sem vaga no perfil etário até o fim do mês; sugerimos reavaliar em 30 dias.'} />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" onClick={() => onConfirmar(texto)}>
            {modo === 'aceitar' ? 'Confirmar aceite' : 'Registrar recusa'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FolhaNova({ casas, pessoas, onFechar, onEnviar }: {
  casas: Casa[]; pessoas: Pessoa[]; onFechar: () => void;
  onEnviar: (corpo: Record<string, unknown>) => void;
}) {
  const [personId, setPersonId] = useState('');
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-nova"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-nova">Solicitar transferência</h3>

        <label className="f" htmlFor="tr-pessoa">Acolhido</label>
        <select id="tr-pessoa" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Escolha</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>{p.nome} · {p.idade} anos</option>
          ))}
        </select>

        <label className="f" htmlFor="tr-destino">Unidade de destino</label>
        <select id="tr-destino" value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="">Escolha</option>
          {casas.map((c) => (
            <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
          ))}
        </select>

        <label className="f" htmlFor="tr-motivo">Motivo</label>
        <textarea id="tr-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: aproximação da rede de apoio familiar, residente no bairro da outra unidade." />
        <p className="mutetxt">
          Escreva pensando em quem vai ler do outro lado: é este texto, e só ele, que a
          outra coordenação tem para decidir.
        </p>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!personId || !destino || motivo.trim().length < 10}
                  onClick={() => onEnviar({ personId, toHouseId: destino, reason: motivo })}>
            Enviar pedido
          </button>
        </div>
      </div>
    </div>
  );
}
