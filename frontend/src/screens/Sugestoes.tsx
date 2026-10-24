import { useEffect, useState } from 'react';
import { api } from '../api';
import { Cargo } from '../cargos';
import { Explica } from '../explica';

/**
 * AS SUGESTÕES DE MELHORIA (fase 192; quem lê decidido em 08/10).
 *
 * O que a equipe pediu à Acolhe+AI para o sistema melhorar, com o nome de quem
 * pediu. A coordenação da casa lê as da casa; a Coordenação Geral, o Gestor
 * Geral e a TI leem as das oito. É lista corrida, mais nova primeiro: não há
 * contagem por pessoa nem por casa, porque sugestão não é desempenho.
 */
interface Sugestao {
  id: string; texto: string; tela: string | null; criadaEm: string;
  casa: string | null; autor: string | null; cargo: string | null;
}

const quando = (v: string) => new Date(v).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

interface Palavra {
  id: string; diz: string; querDizer: string; criadaEm: string; autor: string | null; cargo: string | null;
  situacao: 'esperando' | 'aprovada' | 'recusada' | 'retirada'; motivo: string | null; decididaPor: string | null;
}

const SITUACAO: Record<Palavra['situacao'], string> = {
  esperando: 'Esperando a coordenação', aprovada: 'Aprovada', recusada: 'Recusada', retirada: 'Retirada',
};

/**
 * AS PALAVRAS QUE A EQUIPE ENSINA (fase 244). Quem decide (a coordenação, a
 * Coordenação Geral e o Gestor Geral) aprova ou recusa, com o motivo para
 * recusar, e pode retirar a aprovada. Nada se apaga: cada decisão é uma linha.
 */
function PalavrasEnsinadas() {
  const [dados, setDados] = useState<{ decide: boolean; paraDecidir: Palavra[] } | null>(null);
  const [motivo, setMotivo] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [recarregar, setRecarregar] = useState(0);
  useEffect(() => {
    api<{ decide: boolean; paraDecidir: Palavra[] }>('/assistente/palavras').then(setDados).catch(() => setDados(null));
  }, [recarregar]);
  if (!dados?.decide) return null;
  async function decidir(p: Palavra, decisao: 'aprovar' | 'recusar' | 'retirar') {
    setErro('');
    try {
      await api(`/assistente/palavras/${p.id}/decisao`, { method: 'POST',
        body: JSON.stringify({ decisao, motivo: motivo[p.id] ?? '' }) });
      setRecarregar((x) => x + 1);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível guardar a decisão.'); }
  }
  return (
    <section className="stack" aria-labelledby="t-palavras" style={{ marginTop: 18 }}>
      <h3 id="t-palavras" style={{ margin: 0 }}>Palavras ensinadas à Acolhe+AI</h3>
      <Explica>
        O jeito de falar da casa que a equipe ensinou. A palavra aprovada passa a valer para a Acolhe+AI de todos.
        Para recusar ou retirar, escreva o motivo: quem ensinou lê.
      </Explica>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {dados.paraDecidir.length === 0 && <p className="mutetxt">Ainda não há palavras ensinadas.</p>}
      {dados.paraDecidir.map((p) => (
        <article className="card stack" key={p.id}>
          <div><strong>{p.diz}</strong>: {p.querDizer}</div>
          <div className="mutetxt" style={{ fontSize: 13 }}>
            {p.autor ?? 'Pessoa da equipe'} · {quando(p.criadaEm)} · {SITUACAO[p.situacao]}
            {p.decididaPor ? `, por ${p.decididaPor}` : ''}{p.motivo ? `: ${p.motivo}` : ''}
          </div>
          {(p.situacao === 'esperando' || p.situacao === 'aprovada') && (
            <>
              <label className="f" htmlFor={`mot-${p.id}`}>Motivo{p.situacao === 'esperando' ? ' (para recusar)' : ' (para retirar)'}</label>
              <input id={`mot-${p.id}`} value={motivo[p.id] ?? ''} onChange={(e) => setMotivo({ ...motivo, [p.id]: e.target.value })} />
              <div className="row" style={{ gap: 8 }}>
                {p.situacao === 'esperando' ? (
                  <>
                    <button className="btn sm" onClick={() => void decidir(p, 'aprovar')}>Aprovar</button>
                    <button className="btn sm sec" disabled={(motivo[p.id] ?? '').trim().length < 3}
                            onClick={() => void decidir(p, 'recusar')}>Recusar</button>
                  </>
                ) : (
                  <button className="btn sm sec" disabled={(motivo[p.id] ?? '').trim().length < 3}
                          onClick={() => void decidir(p, 'retirar')}>Retirar</button>
                )}
              </div>
            </>
          )}
        </article>
      ))}
    </section>
  );
}

export function Sugestoes({ houseId, casaLabel, todas }: { houseId: string | null; casaLabel: string; todas: boolean }) {
  const [lista, setLista] = useState<Sugestao[] | null>(null);
  const [erro, setErro] = useState('');
  const [soEsta, setSoEsta] = useState(!todas);

  useEffect(() => {
    let vivo = true;
    setLista(null); setErro('');
    (soEsta && houseId
      ? api<Sugestao[]>(`/assistente/sugestoes?houseId=${houseId}`)
      : api<Sugestao[]>('/assistente/sugestoes'))
      .then((r) => { if (vivo) setLista(r); })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível abrir as sugestões.'); });
    return () => { vivo = false; };
  }, [houseId, soEsta]);

  return (
    <section>
      <div className="diahead">
        <div>
          <div className="eyebrow" style={{ margin: 0 }}>Acolhe+AI</div>
          <h2>Sugestões de melhoria</h2>
        </div>
      </div>
      <Explica>
        O que a equipe pediu para o sistema melhorar, conversando com a Acolhe+AI. Cada sugestão
        tem o nome de quem sugeriu e a tela em que estava.
      </Explica>
      {todas && houseId && (
        <div className="row" role="group" aria-label="Quais sugestões" style={{ gap: 8, margin: '8px 0 12px' }}>
          <button className={`btn sm ${soEsta ? '' : 'sec'}`} aria-pressed={soEsta} onClick={() => setSoEsta(true)}>
            Só de {casaLabel}
          </button>
          <button className={`btn sm ${soEsta ? 'sec' : ''}`} aria-pressed={!soEsta} onClick={() => setSoEsta(false)}>
            Todas as casas
          </button>
        </div>
      )}
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {!lista && !erro && <p className="mutetxt">Abrindo…</p>}
      {lista && lista.length === 0 && (
        <p className="mutetxt">Ainda não há sugestões. Elas chegam quando alguém conversa com a Acolhe+AI.</p>
      )}
      <div className="stack">
        {lista?.map((s) => (
          <article className="card stack" key={s.id}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              {s.autor && <Cargo nome={s.autor} cargo={s.cargo ?? ''} tamanho="sm" />}
              <div className="grow">
                <strong>{s.autor ?? 'Pessoa da equipe'}</strong>
                <div className="mutetxt" style={{ fontSize: 13 }}>
                  {quando(s.criadaEm)}{s.casa ? ` · ${s.casa}` : ''}{s.tela ? ` · na tela ${s.tela}` : ''}
                </div>
              </div>
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{s.texto}</p>
          </article>
        ))}
      </div>
      <PalavrasEnsinadas />
    </section>
  );
}
