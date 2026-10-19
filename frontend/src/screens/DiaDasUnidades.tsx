import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { CATEGORIA, ICONE, categoriaDe } from '../categorias-do-dia';
import { Icone } from '../icones';
import { Explica } from '../explica';

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
  personId?: string | null;
  kind?: string;
  state?: string | null;
  severity?: string | null;
  source?: string;
}

const hojeLocal = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/* Estado é estado: o normal não pinta de verde, que se leria como "foi bem". */
const TOM: Record<string, string> = {
  critico: 'c-crit', atencao: 'c-warn', normal: 'c-mute',
};
/* O dia em quatro partes, para quem olha no celular achar a tarde sem rolar a manhã. */
const PARTES = [
  { ate: 6, nome: 'Madrugada' }, { ate: 12, nome: 'Manhã' },
  { ate: 18, nome: 'Tarde' }, { ate: 24, nome: 'Noite' },
];
const horaDe = (iso: string) => Number(new Intl.DateTimeFormat('en-GB',
  { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date(iso)));

export function DiaDasUnidades() {
  const [data, setData] = useState(hojeLocal());
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [unidades, setUnidades] = useState<{ casa: string; nome: string; eventos: number }[]>([]);
  const [nota, setNota] = useState('');
  const [incompleta, setIncompleta] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState('');
  /* Só o que ainda precisa de alguém (fase 210): o resto do dia fica a um toque. */
  const [soAtencao, setSoAtencao] = useState(false);

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

  const daCasa = filtro ? eventos.filter((e) => e.casa === filtro) : eventos;
  const lista = soAtencao ? daCasa.filter((e) => e.severity && e.severity !== 'normal') : daCasa;
  const presentes = CATEGORIA.filter((c) => daCasa.some((e) => categoriaDe(e.kind ?? 'rotina') === c));

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

      {/* A LEGENDA (fase 210): o que cada cor quer dizer, e como se lê se é de uma
          criança ou da casa toda. Mostra só as categorias que o dia tem. */}
      {daCasa.length > 0 && (
        <div className="legenda legenda-dia" aria-label="O que cada cor quer dizer">
          {presentes.map((c) => (
            <span key={c.classe} className={`item ${c.classe}`}>
              <span className="ponto" aria-hidden="true" />{c.rotulo}
            </span>
          ))}
          <span className="item"><Icone nome="acolhidos" tamanho={14} /> da casa toda</span>
          <span className="item"><Icone nome="pessoa" tamanho={14} /> de uma criança</span>
        </div>
      )}
      {daCasa.length > 0 && (
        <label className="row so-atencao" style={{ gap: 8 }}>
          <input type="checkbox" checked={soAtencao} onChange={(e) => setSoAtencao(e.target.checked)} />
          <span>Só o que ainda precisa de alguém</span>
        </label>
      )}

      {PARTES.map((parte, i) => {
        const de = i === 0 ? 0 : PARTES[i - 1].ate;
        const daParte = lista.filter((e) => { const h = horaDe(e.at); return h >= de && h < parte.ate; });
        if (!daParte.length) return null;
        return (
          <section key={parte.nome} className="parte-do-dia">
            <div className="eyebrow">{parte.nome} · {daParte.length}</div>
            <ol className="dia-ordem">
              {daParte.map((e) => {
                const cat = categoriaDe(e.kind ?? 'rotina');
                const deUma = !!(e.personId || e.personName);
                return (
                  <li key={e.id} className={`dia-item ${cat.classe}`}>
                    <span className="hora">{hora(e.at)}</span>
                    <span className="ic" aria-hidden="true"><Icone nome={ICONE[e.kind ?? ''] ?? 'ponto'} tamanho={16} /></span>
                    <div className="grow">
                      <b>{e.title}</b>
                      <div className="mutetxt">
                        {e.casa && <>{e.casa} · </>}
                        <span className="quem-e">
                          <Icone nome={deUma ? 'pessoa' : 'acolhidos'} tamanho={13} />
                          {deUma ? (e.personName ?? 'uma criança') : 'da casa toda'}
                        </span>
                        <span className="cat-nome"> · {cat.rotulo}</span>
                      </div>
                    </div>
                    {e.state && (
                      <span className={`pill ${TOM[e.severity ?? 'normal'] ?? 'c-mute'}`}>{e.state}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      {soAtencao && lista.length === 0 && daCasa.length > 0 && (
        <p className="mutetxt">Nada esperando alguém neste dia.</p>
      )}

      {nota && <Explica style={{ marginTop: 16 }}>{nota}</Explica>}
    </>
  );
}
