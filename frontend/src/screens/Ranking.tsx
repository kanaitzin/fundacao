import { useEffect, useState } from 'react';
import { api } from '../api';
import { dia } from '../rotulos';
import { Explica } from '../explica';
import { EtiquetaDoCargo } from '../cargos';
import { quantos } from '../../../backend/src/kernel/common/quantos';
import {
  GRUPOS_DO_RANKING, TIPOS_DE_REGISTRO, emOrdem, gastoEmOrdem,
  type CasaNoRanking, type GrupoDoRanking, type PessoaNoRanking,
} from '../../../backend/src/modules/reports/ranking.regra';

/**
 * O RANKING DAS CASAS E DA EQUIPE (fase 323, pedido e decidido pelo dono em 14/11).
 *
 * Só o Gestor Geral e a Coordenação Geral chegam aqui. As casas em ordem pela organização
 * documental, pelo cuidado registrado e pelo uso do sistema; o gasto por acolhido; e, ao
 * abrir uma casa, o que cada pessoa da equipe registrou. **Nenhuma criança aparece**: a
 * proibição de ranking protege as crianças (§5 regra 3).
 *
 * A conta é a do `ranking.regra.ts`, a mesma do servidor; o aviso de que se mede o
 * registro e não o cuidado fica sempre à vista, acima da lista. A barra é da cor do
 * gráfico, e nunca da cor de estado: a casa de baixo não está "em vermelho".
 */

type Recorte = GrupoDoRanking | 'geral' | 'gasto';

interface Resposta {
  de: string; ate: string; aviso: string;
  grupos: { grupo: GrupoDoRanking; titulo: string; explica: string }[];
  casas: CasaNoRanking[];
}
interface Pessoas { de: string; ate: string; pessoas: PessoaNoRanking[] }

const RECORTES: { cod: Recorte; titulo: string }[] = [
  { cod: 'geral', titulo: 'Geral' },
  ...GRUPOS_DO_RANKING.map((g) => ({ cod: g.grupo as Recorte, titulo: g.titulo })),
  { cod: 'gasto', titulo: 'Gasto' },
];

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const agora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

function Barra({ valor, rotulo }: { valor: number | null; rotulo: string }) {
  return (
    <div className="ranking-barra" role="img" aria-label={rotulo}>
      <div style={{ width: `${Math.max(0, Math.min(100, valor ?? 0))}%` }} />
    </div>
  );
}

export function Ranking() {
  const [r, setR] = useState<Resposta | null>(null);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [recorte, setRecorte] = useState<Recorte>('geral');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [leuEm, setLeuEm] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [equipe, setEquipe] = useState<Record<string, Pessoas | 'abrindo' | string>>({});

  async function carregar(d?: string, a?: string) {
    setErro(''); setCarregando(true);
    try {
      setR(await api<Resposta>(`/reports/ranking?de=${encodeURIComponent(d ?? '')}&ate=${encodeURIComponent(a ?? '')}`));
      setEquipe({});
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o ranking.');
    } finally {
      setCarregando(false);
    }
  }

  async function abrirEquipe(casa: CasaNoRanking) {
    setEquipe((x) => ({ ...x, [casa.houseId]: 'abrindo' }));
    try {
      const p = await api<Pessoas>(`/reports/ranking/${casa.houseId}/pessoas?de=${encodeURIComponent(r?.de ?? '')}&ate=${encodeURIComponent(r?.ate ?? '')}`);
      setEquipe((x) => ({ ...x, [casa.houseId]: p }));
    } catch (e) {
      setEquipe((x) => ({ ...x, [casa.houseId]: e instanceof Error ? e.message : 'Não foi possível abrir a equipe.' }));
    }
  }

  useEffect(() => { void carregar(); }, []);

  if (erro) return <div className="notice c-crit" role="alert">{erro}</div>;
  if (!r) return <p className="mutetxt">{carregando ? 'Abrindo o ranking…' : ''}</p>;

  const grupo = r.grupos.find((g) => g.grupo === recorte);
  const lista = recorte === 'gasto' ? gastoEmOrdem(r.casas) : emOrdem(r.casas, recorte);
  const semValor = r.casas.reduce((t, c) => t + c.notasSemValor, 0);

  return (
    <>
      <div className="diahead">
        <div>
          <h2>Ranking das casas</h2>
          <p className="mutetxt">{dia(r.de)} a {dia(r.ate)} · {quantos(r.casas.length, 'unidade', 'unidades')}</p>
        </div>
      </div>

      {/* O aviso fica à vista, antes de qualquer número (decisão do dono em 14/11). */}
      <div className="notice c-info" role="status">{r.aviso}</div>

      <div className="row">
        <div className="grow">
          <label className="f" htmlFor="rk-de">De</label>
          <input id="rk-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="grow">
          <label className="f" htmlFor="rk-ate">Até</label>
          <input id="rk-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>
      <button className="btn sec block" onClick={() => { void carregar(de || undefined, ate || undefined).then(() => setLeuEm(agora())); }}>
        {carregando ? 'Abrindo…' : 'Ver este período'}
      </button>
      {leuEm && <p className="mutetxt" role="status" style={{ margin: 0 }}>Período lido às {leuEm}.</p>}

      <div className="filtros" role="tablist" aria-label="Ranking por">
        {RECORTES.map((x) => (
          <button key={x.cod} role="tab" aria-selected={recorte === x.cod}
                  className={recorte === x.cod ? 'on' : ''} onClick={() => setRecorte(x.cod)}>{x.titulo}</button>
        ))}
      </div>

      <Explica resumo={recorte === 'geral'
        ? <>A nota geral é a média das três: documentos, cuidado registrado e uso do sistema.</>
        : recorte === 'gasto'
          ? <>O gasto com medicamento pelas notas lançadas, dividido pelos acolhidos de hoje. O maior vem em cima; gasto não é nota.</>
          : <>{grupo?.explica}</>}>
        Cada indicador vai de 0 a 100. O que é porcentagem vale a própria porcentagem. O que é por
        acolhido ou por pessoa, como atendimentos, visitas e registros, vale 100 na casa que mais fez,
        e as outras em proporção. O que a casa não tem para medir, como receita quando nenhuma criança
        toma remédio, fica fora da média. Empate fica na ordem do código.
      </Explica>

      {recorte === 'gasto' && semValor > 0 && (
        <div className="notice c-warn" role="status">
          <b>{quantos(semValor, 'nota', 'notas')} sem valor lançado.</b> O gasto real é maior até elas terem valor.
        </div>
      )}

      <ol className="ranking-lista">
        {lista.map((c, i) => {
          const nota = recorte === 'gasto' ? null : c.notas[recorte];
          const eq = equipe[c.houseId];
          const abertaAqui = aberta === c.houseId;
          return (
            <li key={c.houseId} className="card ranking-casa">
              <div className="ranking-topo">
                <span className="ranking-pos" aria-hidden="true">{i + 1}º</span>
                <div className="grow">
                  <b>{c.nome}</b>
                  <div className="mutetxt">
                    {c.codigo} · {quantos(c.acolhidos, 'acolhido', 'acolhidos')} · {quantos(c.equipe, 'pessoa', 'pessoas')} na equipe
                  </div>
                </div>
                <b className="ranking-nota">
                  {recorte === 'gasto'
                    ? (c.gastoPorAcolhidoCentavos == null ? 'sem acolhidos' : `${reais(c.gastoPorAcolhidoCentavos)} por acolhido`)
                    : nota == null ? 'sem o que medir' : `${nota} de 100`}
                </b>
              </div>
              {recorte === 'gasto'
                ? <p className="mutetxt" style={{ margin: '4px 0 0' }}>Total no período: {reais(c.notasCentavos)}{c.notasSemValor > 0 ? `, e ${quantos(c.notasSemValor, 'nota', 'notas')} sem valor` : ''}.</p>
                : <Barra valor={nota} rotulo={`${c.nome}: ${nota == null ? 'sem o que medir' : `${nota} de 100`}`} />}
              <button className="btn ghost" aria-expanded={abertaAqui}
                      onClick={() => setAberta(abertaAqui ? null : c.houseId)}>
                {abertaAqui ? 'Fechar' : 'Ver os números e a equipe'}
              </button>
              {abertaAqui && (
                <div className="ranking-detalhe">
                  {r.grupos.map((g) => (
                    <div key={g.grupo}>
                      <div className="eyebrow">{g.titulo} · {c.notas[g.grupo] == null ? 'sem o que medir' : `${c.notas[g.grupo]} de 100`}</div>
                      <ul className="ranking-indicadores">
                        {c.indicadores.filter((x) => x.grupo === g.grupo).map((x) => (
                          <li key={x.chave}><span>{x.titulo}</span><b>{x.pontos == null ? 'sem o que medir' : x.texto}</b></li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <div className="eyebrow">A equipe da casa, pelo que registrou</div>
                  {eq === undefined ? (
                    <button className="btn sec" onClick={() => { void abrirEquipe(c); }}>Abrir a equipe</button>
                  ) : eq === 'abrindo' ? <p className="mutetxt">Abrindo…</p>
                    : typeof eq === 'string' ? <div className="notice c-crit" role="alert">{eq}</div>
                      : eq.pessoas.length === 0 ? <p className="mutetxt">Ninguém na equipe desta casa no período.</p> : (
                        <ol className="ranking-pessoas">
                          {eq.pessoas.map((p) => (
                            <li key={p.id}>
                              <div className="ranking-topo">
                                <div className="grow">
                                  <b>{p.nome}</b> <EtiquetaDoCargo cargo={p.cargo} />
                                  <div className="mutetxt">
                                    {TIPOS_DE_REGISTRO.filter((t) => p.porTipo[t.chave] > 0)
                                      .map((t) => `${t.titulo}: ${p.porTipo[t.chave]}`).join(' · ') || 'Nenhum registro no período.'}
                                  </div>
                                </div>
                                <b className="ranking-nota">{quantos(p.total, 'registro', 'registros')}</b>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
