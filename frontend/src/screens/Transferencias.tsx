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
 */

interface Transferencia {
  id: string; caixa: 'recebida' | 'enviada'; nomeCivil: string; nome: string; idade: number;
  outraCasa: string; motivo: string; pedidaPor: string; pedidaEm: string;
  situacao: 'solicitada' | 'aceita' | 'recusada' | 'cancelada';
  justificativa: string | null; decididaPor: string | null; decididaEm: string | null;
  mensagens: { id: string; casa: string; autor: string; texto: string; em: string }[];
}
interface Casa { id: string; code: string; name: string }
interface Pessoa { id: string; nome: string; idade: number }

const SITUACAO: Record<string, { label: string; tom: string }> = {
  solicitada: { label: 'Aguardando decisão do destino', tom: 'c-warn' },
  aceita: { label: 'Aceita — acolhido transferido', tom: 'c-ok' },
  recusada: { label: 'Recusada com justificativa', tom: 'c-crit' },
  cancelada: { label: 'Cancelada pela origem', tom: 'c-mute' },
};

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR',
  { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo' });

export function Transferencias() {
  const [caixa, setCaixa] = useState<'recebida' | 'enviada'>('recebida');
  const [lista, setLista] = useState<Transferencia[]>([]);
  const [casas, setCasas] = useState<Casa[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [conversa, setConversa] = useState<string | null>(null);
  const [decidindo, setDecidindo] = useState<{ t: Transferencia; modo: 'aceitar' | 'recusar' } | null>(null);
  const [nova, setNova] = useState(false);

  async function carregar() {
    setErro('');
    try {
      const [t, c, p] = await Promise.all([
        api<Transferencia[]>('/transfers'),
        api<Casa[]>('/houses/directory').catch(() => [] as Casa[]),
        api<Pessoa[]>('/people').catch(() => [] as Pessoa[]),
      ]);
      setLista(t); setCasas(c); setPessoas(p);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as transferências.');
    }
  }
  useEffect(() => { carregar(); }, []);

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try { const r = await fn(); if (r?.aviso) setAviso(r.aviso); await carregar(); return true; }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
  }

  const daCaixa = lista.filter((t) => t.caixa === caixa);
  const pendentesRecebidas = lista.filter(
    (t) => t.caixa === 'recebida' && t.situacao === 'solicitada').length;

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
        <div className="notice c-info">
          Você vê <b>quem é</b>, <b>de onde vem</b> e <b>por quê</b> — o necessário para
          decidir. O perfil completo (saúde, documentos, benefícios e histórico) só abre
          <b> depois do aceite</b>.
        </div>
      )}

      <div className="stack" style={{ marginTop: 12 }}>
        {daCaixa.map((t) => {
          const s = SITUACAO[t.situacao];
          const aberta = conversa === t.id;
          return (
            <div className="card stack" key={t.id}>
              <div className="row">
                <b className="ff grow" style={{ fontSize: 16 }}>{t.nomeCivil}</b>
                <span className={`pill ${s.tom}`}>{s.label}</span>
              </div>
              <div className="mutetxt">
                Chamado(a) de <b>{t.nome}</b> · {t.idade} anos
              </div>
              <div className="row">
                <span className="pill c-move">
                  {t.caixa === 'recebida' ? `Vem de ${t.outraCasa}` : `Destino ${t.outraCasa}`}
                </span>
              </div>
              <div className="bloco destaque"><small>Motivo</small>{t.motivo}</div>
              <div className="mutetxt">
                Solicitada por {t.pedidaPor} em {quando(t.pedidaEm)}.
              </div>

              {t.justificativa && (
                <div className={`notice ${t.situacao === 'recusada' ? 'c-crit' : 'c-mute'}`}>
                  <b>{t.situacao === 'recusada' ? 'Recusada' : 'Cancelada'} por {t.decididaPor}
                    {t.decididaEm ? ` em ${quando(t.decididaEm)}` : ''}:</b>
                  <div>{t.justificativa}</div>
                </div>
              )}

              {t.situacao === 'solicitada' && t.caixa === 'recebida' && (
                <div className="row">
                  <button className="btn sm grow"
                          onClick={() => setDecidindo({ t, modo: 'aceitar' })}>
                    ✓ Aceitar
                  </button>
                  <button className="btn sec sm grow"
                          onClick={() => setDecidindo({ t, modo: 'recusar' })}>
                    Recusar com motivo
                  </button>
                </div>
              )}

              {t.situacao === 'solicitada' && t.caixa === 'enviada' && (
                <button className="btn ghost sm" onClick={() => {
                  const motivo = prompt('Por que o pedido está sendo cancelado? '
                    + 'A outra coordenação vai ler:') ?? '';
                  if (motivo.trim().length >= 10) {
                    acao(() => api(`/transfers/${t.id}/cancel`, {
                      method: 'POST', body: JSON.stringify({ motivo }) }));
                  }
                }}>Cancelar pedido</button>
              )}

              <button className="btn ghost sm" onClick={() => setConversa(aberta ? null : t.id)}>
                {aberta ? 'Fechar conversa'
                  : `💬 Conversar com a outra coordenação${t.mensagens.length
                      ? ` (${t.mensagens.length})` : ''}`}
              </button>

              {aberta && (
                <>
                  <div className="eyebrow">Conversa entre as coordenações</div>
                  {t.mensagens.length === 0 && (
                    <p className="mutetxt" style={{ margin: 0 }}>
                      Ainda não há mensagens sobre esta solicitação.
                    </p>
                  )}
                  {t.mensagens.map((m) => (
                    <div className="bloco compl" key={m.id}>
                      <small>{m.autor} · {m.casa} · {quando(m.em)}</small>{m.texto}
                    </div>
                  ))}
                  <Mensagem onEnviar={(texto) => acao(() =>
                    api(`/transfers/${t.id}/message`, {
                      method: 'POST', body: JSON.stringify({ texto }) }))} />
                  <p className="mutetxt" style={{ margin: 0 }}>
                    A conversa fica dentro do sistema, presa a esta solicitação, e não pode
                    ser apagada. Nenhuma coordenação entra na casa da outra para falar.
                  </p>
                </>
              )}
            </div>
          );
        })}

        {daCaixa.length === 0 && (
          <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
            Nenhuma solicitação nesta caixa no momento.
          </p></div>
        )}
      </div>

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
          transferencia={decidindo.t} modo={decidindo.modo}
          onFechar={() => setDecidindo(null)}
          onConfirmar={async (texto) => {
            const rota = decidindo.modo === 'aceitar'
              ? `/transfers/${decidindo.t.id}/accept` : `/transfers/${decidindo.t.id}/refuse`;
            const corpo = decidindo.modo === 'aceitar'
              ? { observacao: texto } : { justificativa: texto };
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

function Mensagem({ onEnviar }: { onEnviar: (texto: string) => Promise<boolean> }) {
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

function FolhaDecisao({ transferencia, modo, onFechar, onConfirmar }: {
  transferencia: Transferencia; modo: 'aceitar' | 'recusar';
  onFechar: () => void; onConfirmar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-dec"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-dec">
          {modo === 'aceitar' ? `Aceitar ${transferencia.nome}?`
            : `Recusar a transferência de ${transferencia.nome}`}
        </h3>
        <p className="mutetxt">
          {transferencia.nomeCivil} · {transferencia.idade} anos · vem de {transferencia.outraCasa}.
        </p>

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
            <option key={c.id} value={`${c.code} · ${c.name}`}>{c.code} — {c.name}</option>
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
          <button className="btn grow" disabled={!personId || !destino}
                  onClick={() => onEnviar({ personId, destino, motivo })}>
            Enviar pedido
          </button>
        </div>
      </div>
    </div>
  );
}
