import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

/**
 * O DIA INTEIRO, DAS UNIDADES QUE A PESSOA ALCANÇA, EM UMA LISTA SÓ.
 *
 * Para o Gestor Geral e para quem coordena. Sem isto, conferir o dia era abrir
 * oito telas e comparar de cabeça, e é aí que some o detalhe: a ocorrência da
 * AI5 às 22h30 e a dose não confirmada da AI2 às 22h40 são a mesma noite, e
 * ninguém enxerga isso pulando de aba.
 *
 * O que esta tela NÃO é, e o cuidado é o mesmo do painel do plantão:
 *
 *   * não compara unidades. As casas aparecem porque o evento aconteceu em
 *     alguma delas, nunca ordenadas por quantidade nem lado a lado como
 *     desempenho. Contagem de casa vira ranking de casa na terceira reunião;
 *   * não procura pessoa. Não há modo individual aqui: acompanhar UMA criança
 *     é dentro da casa dela. Varrer as oito atrás de alguém é vigilância com
 *     outro nome, e o servidor recusa;
 *   * não guarda nada. É a leitura de um dia, e o dia se escolhe.
 *
 * A janela é a da instituição: das 00h00 às 23h59 de Porto Alegre, em ordem,
 * o que faz a madrugada ficar com o dia a que ela pertence.
 */

interface Evento {
  id: string;
  at: string;
  title: string;
  casa?: string;
  personName?: string | null;
  state?: string | null;
  severity?: string | null;
  source?: string;
}

const hojeLocal = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

const TOM: Record<string, string> = {
  critico: 'c-crit', atencao: 'c-med', normal: 'c-ok',
};

export function DiaDasUnidades() {
  const [data, setData] = useState(hojeLocal());
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [unidades, setUnidades] = useState<{ casa: string; nome: string; eventos: number }[]>([]);
  const [nota, setNota] = useState('');
  const [incompleta, setIncompleta] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api<any>(`/timeline/all?date=${data}`);
      setEventos(r.eventos ?? []);
      setUnidades(r.unidades ?? []);
      setNota(r.nota ?? '');
      setIncompleta(r.incompleta ? (r.fontesIndisponiveis ?? []) : []);
      setErro('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o dia.');
    } finally {
      setCarregando(false);
    }
  }, [data]);

  useEffect(() => { void carregar(); }, [carregar]);

  const lista = filtro ? eventos.filter((e) => e.casa === filtro) : eventos;

  return (
    <>
      <div className="diahead">
        <div>
          <div className="eyebrow" style={{ margin: 0 }}>Todas as unidades que você acompanha</div>
          <h2 style={{ margin: 0 }}>O dia, em ordem</h2>
        </div>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)}
               aria-label="Dia" />
      </div>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      {incompleta.length > 0 && (
        // Tela que parece completa e não está é pior do que tela vazia.
        <div className="notice c-med" role="status">
          Esta lista está incompleta: {incompleta.join(', ')} não respondeu agora.
        </div>
      )}

      {unidades.length > 1 && (
        <div className="filtros" role="tablist" aria-label="Unidades">
          <button role="tab" aria-selected={filtro === ''} className={filtro === '' ? 'on' : ''}
                  onClick={() => setFiltro('')}>Todas</button>
          {unidades.map((u) => (
            <button key={u.casa} role="tab" aria-selected={filtro === u.casa}
                    className={filtro === u.casa ? 'on' : ''}
                    onClick={() => setFiltro(u.casa)} title={u.nome}>
              {u.casa}
            </button>
          ))}
        </div>
      )}

      {carregando && <p className="mutetxt">Carregando o dia…</p>}

      {!carregando && lista.length === 0 && !erro && (
        <div className="card">
          <p className="mutetxt" style={{ margin: 0 }}>
            Nada registrado neste dia nas unidades que você acompanha. Confira a data
            antes de concluir que o dia foi vazio.
          </p>
        </div>
      )}

      <ol className="stack" style={{ listStyle: 'none', padding: 0 }}>
        {lista.map((e) => (
          <li key={e.id} className="card">
            <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
              <b className="ff">{hora(e.at)}</b>
              {e.casa && <span className="pill">{e.casa}</span>}
              <div className="grow">
                <b className="ff">{e.title}</b>
                {e.personName && <div className="mutetxt">{e.personName}</div>}
              </div>
              {e.state && (
                <span className={`pill ${TOM[e.severity ?? 'normal'] ?? ''}`}>{e.state}</span>
              )}
            </div>
          </li>
        ))}
      </ol>

      {nota && <p className="mutetxt" style={{ marginTop: 16 }}>{nota}</p>}
    </>
  );
}
