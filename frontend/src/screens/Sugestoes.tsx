import { useEffect, useState } from 'react';
import { api } from '../api';
import { Cargo } from '../cargos';

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
      <p className="mutetxt">
        O que a equipe pediu para o sistema melhorar, conversando com a Acolhe+AI. Cada sugestão
        tem o nome de quem sugeriu e a tela em que estava.
      </p>
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
    </section>
  );
}
