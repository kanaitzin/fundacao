import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

/**
 * CHAMADA COLETIVA (§10).
 *
 * A operação mais repetida da casa: no café, no almoço, na saída para a
 * escola, na janta, no dormir. São vinte crianças, cinco vezes ao dia, todo
 * dia — cem marcações. Se cada uma custar três toques, ninguém faz.
 *
 * Por isso a tela é uma lista onde o caminho comum é **um toque**: o botão
 * grande da situação normal ("Normal", "Compareceu") fica visível em cada
 * linha. Exceção abre a folha, porque exceção exige o fato.
 *
 * Duas coisas que a tela mostra por decisão, não por enfeite:
 *
 *  * **alerta essencial e restrição alimentar aparecem NA LINHA**, na hora de
 *    marcar. É onde eles importam: no almoço, com a bandeja na mão;
 *  * **quem falta aparece no topo**, com o número. Fechar a chamada com
 *    alguém sem conferir é o erro que ninguém percebe — e o sistema recusa
 *    o fechamento dizendo QUEM falta.
 */

interface Linha {
  acolhidoId: string;
  nome: string;
  idade: number | null;
  ativo: boolean;
  alertas: string | null;
  restricoes: string | null;
  resultado: string | null;
  justificativa: string | null;
  registradoPor: string | null;
  registradoEm: string | null;
}
interface Opcao { code: string; label: string; excecao: boolean }
interface Chamada {
  id: string; tipo: string; titulo: string; status: string;
  esperados: number; conferidos: number; faltam: number; quemFalta: string[];
  linhas: Linha[]; opcoes: Opcao[];
}
interface Resumo {
  id: string; tipo: string; titulo: string; status: string;
  esperados: number; conferidos: number; horario: string;
}
/** O vocabulário vem do servidor: `kind` é um enum do banco (§10). */
interface TipoDeChamada { cod: string; label: string; sugestao: string }
interface Vocabulario { tipos: TipoDeChamada[]; aviso: string }

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export function Chamada({ houseId }: { houseId: string }) {
  const [lista, setLista] = useState<Resumo[]>([]);
  const [aberta, setAberta] = useState<Chamada | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [excecao, setExcecao] = useState<Linha | null>(null);
  const [tipos, setTipos] = useState<Vocabulario | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  const carregarLista = useCallback(async () => {
    setErro('');
    try { setLista(await api<Resumo[]>(`/checks?houseId=${houseId}`)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar as chamadas.'); }
  }, [houseId]);

  useEffect(() => { carregarLista(); }, [carregarLista]);
  useEffect(() => {
    // Falhar aqui não pode travar a chamada em andamento: sem o vocabulário,
    // some o botão de abrir e o resto da tela continua servindo o turno.
    api<Vocabulario>('/checks/kinds').then(setTipos).catch(() => setTipos(null));
  }, []);

  async function abrir(id: string) {
    setErro('');
    try { setAberta(await api<Chamada>(`/checks/${id}`)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir a chamada.'); }
  }

  async function marcar(l: Linha, opcao: string, nota?: string) {
    if (!aberta) return;
    setOcupado(l.acolhidoId); setErro(''); setAviso('');
    try {
      await api(`/checks/${aberta.id}/mark`, {
        method: 'POST',
        body: JSON.stringify({ personId: l.acolhidoId, opcao, nota }),
      });
      setAberta(await api<Chamada>(`/checks/${aberta.id}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível marcar.');
    } finally {
      setOcupado(null);
    }
  }

  async function confirmar() {
    if (!aberta) return;
    setErro(''); setAviso('');
    try {
      const r = await api<{ aviso?: string }>(`/checks/${aberta.id}/confirm`, {
        method: 'POST', body: '{}',
      });
      setAviso(r?.aviso ?? 'Chamada confirmada.');
      setAberta(await api<Chamada>(`/checks/${aberta.id}`));
      await carregarLista();
    } catch (e) {
      // A recusa aqui é útil: o servidor diz QUEM falta.
      setErro(e instanceof Error ? e.message : 'Não foi possível confirmar.');
    }
  }

  if (!aberta) {
    return (
      <>
        <div className="diahead"><div><h2>Chamadas de hoje</h2></div></div>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

        {/*
          * ABRIR A CHAMADA.
          *
          * Até 31/08/2026 a chamada só existia se alguém a criasse pelo
          * servidor — e não havia por onde. Na casa, isso significava uma tela
          * que dizia "nenhuma chamada aberta hoje" para sempre.
          */}
        {tipos && (
          <button className="btn block" style={{ marginBottom: 12 }}
                  onClick={() => setAbrindo(true)}>
            ✅ Abrir uma chamada
          </button>
        )}

        {abrindo && tipos && (
          <FolhaAbrir
            tipos={tipos.tipos} aviso={tipos.aviso}
            onFechar={() => setAbrindo(false)}
            onAbrir={async (kind, titulo) => {
              setErro(''); setAviso('');
              try {
                const r = await api<{ id: string }>('/checks', {
                  method: 'POST', body: JSON.stringify({ houseId, kind, titulo }) });
                setAbrindo(false);
                await carregarLista();
                // Abre já: quem abriu a chamada é quem vai conferir agora.
                await abrir(r.id);
              } catch (e) {
                setErro(e instanceof Error ? e.message : 'Não foi possível abrir a chamada.');
              }
            }} />
        )}

        <div className="stack">
          {lista.map((c) => (
            <button key={c.id} className="card row chamadacard" onClick={() => abrir(c.id)}>
              <div className="grow" style={{ textAlign: 'left' }}>
                <b className="ff">{c.titulo}</b>
                <div className="mutetxt">{hhmm(c.horario)} · {c.conferidos} de {c.esperados}</div>
              </div>
              <span className={`pill ${c.status === 'confirmada' ? 'c-ok' : 'c-warn'}`}>
                {c.status === 'confirmada' ? 'Confirmada' : 'Aberta'}
              </span>
            </button>
          ))}
          {lista.length === 0 && (
            <div className="card">
              <p className="mutetxt" style={{ margin: 0 }}>
                Nenhuma chamada aberta hoje. Abra a do café, do almoço, da escola, da janta
                ou do dormir — cada uma confere uma pessoa por vez.
              </p>
            </div>
          )}
        </div>
      </>
    );
  }

  const normal = aberta.opcoes.find((o) => !o.excecao) ?? aberta.opcoes[0];
  const pendentes = aberta.linhas.filter((l) => l.ativo && !l.resultado);
  const confirmada = aberta.status === 'confirmada';
  /**
   * Conferidos entre quem ESTÁ na casa.
   *
   * O total do servidor inclui quem saiu no meio da chamada — o registro dessa
   * criança continua valendo e por isso é contado lá. Aqui, no cabeçalho,
   * isso virava "22 de 20", que lido no corredor parece defeito. A conta da
   * tela é sobre quem ainda está; quem saiu aparece na lista, com o que foi
   * registrado, e fora da conta.
   */
  const conferidosAtivos = aberta.linhas.filter((l) => l.ativo && l.resultado).length;
  const saiuNoMeio = aberta.linhas.filter((l) => !l.ativo && l.resultado).length;

  return (
    <>
      <div className="diahead">
        <div>
          <button className="btn sm ghost" onClick={() => { setAberta(null); carregarLista(); }}>
            ← Chamadas
          </button>
          <h2>{aberta.titulo}</h2>
        </div>
        <div className="resumo">
          <span className={`pill ${pendentes.length === 0 ? 'c-ok' : 'c-warn'}`}>
            {conferidosAtivos} de {aberta.esperados}
          </span>
          {confirmada
            ? <span className="pill c-ok">Confirmada</span>
            : pendentes.length > 0 && (
                <span className="pill c-crit">{pendentes.length} sem conferir</span>
              )}
          {saiuNoMeio > 0 && (
            <span className="pill c-mute">
              +{saiuNoMeio} que saiu no meio
            </span>
          )}
        </div>
      </div>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      {/* Quem falta aparece por nome — os primeiros, para caber na tela. No
          começo da chamada isso seria a lista inteira, então mostra a conta e
          alguns nomes; no fim, quando importa mesmo, sobram poucos e todos
          aparecem. */}
      {!confirmada && pendentes.length > 0 && (
        <div className="notice c-warn" role="status">
          {pendentes.length <= 6 ? (
            <>Faltam: <b>{pendentes.map((l) => l.nome).join(', ')}</b></>
          ) : (
            <>
              Faltam <b>{pendentes.length}</b>: {pendentes.slice(0, 5).map((l) => l.nome).join(', ')}
              {` e mais ${pendentes.length - 5}.`}
            </>
          )}
        </div>
      )}

      <ol className="chamada">
        {aberta.linhas.map((l) => {
          const feito = !!l.resultado;
          const rotulo = aberta.opcoes.find((o) => o.code === l.resultado)?.label;
          return (
            <li key={l.acolhidoId} className={`ev ${feito ? 'feito' : ''} ${l.ativo ? '' : 'saiu'}`}>
              <div className="corpo">
                <div className="row">
                  <b className="ff grow">{l.nome}{l.idade ? ` · ${l.idade}` : ''}</b>
                  {!l.ativo && <span className="pill c-mute">saiu no meio</span>}
                  {feito && <span className="pill c-ok">{rotulo}</span>}
                </div>

                {/* Onde o alerta importa: na hora de marcar, com a bandeja na mão. */}
                {l.alertas && <div className="alerta">⚠ {l.alertas}</div>}
                {l.restricoes && <div className="alerta rest">🍽 {l.restricoes}</div>}
                {l.justificativa && <div className="mutetxt">{l.justificativa}</div>}

                {!confirmada && l.ativo && (
                  <div className="acoes">
                    <button className={`btn sm ${feito ? 'ghost' : ''}`}
                            disabled={ocupado === l.acolhidoId}
                            onClick={() => marcar(l, normal.code)}>
                      {normal.label}
                    </button>
                    <button className="btn sm ghost" disabled={ocupado === l.acolhidoId}
                            onClick={() => setExcecao(l)}>
                      Outro
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {!confirmada && (
        <button className="btn block" style={{ marginTop: 14 }} onClick={confirmar}>
          Confirmar chamada
        </button>
      )}
      {confirmada && (
        <p className="mutetxt" style={{ marginTop: 14 }}>
          Chamada confirmada{pendentes.length > 0
            ? ` — ${pendentes.length} acolhido(s) entraram na casa depois do fechamento e não estavam nesta chamada.`
            : '.'}{' '}
          Correção depois disso entra como adendo pela equipe técnica: o que foi registrado
          na hora continua como foi registrado.
        </p>
      )}

      {excecao && (
        <FolhaOpcao
          linha={excecao} opcoes={aberta.opcoes}
          onFechar={() => setExcecao(null)}
          onMarcar={(op, nota) => { const l = excecao; setExcecao(null); marcar(l, op, nota); }}
        />
      )}
    </>
  );
}

/** As opções do tipo de chamada. Exceção pede o fato; o resto, não. */
/**
 * ABRIR A CHAMADA.
 *
 * Duas decisões pequenas que evitam duas frustrações conhecidas:
 *
 *  * o TIPO vem do servidor. `kind` é um enum do banco com oito valores; uma
 *    tela que escrevesse "jantar" descobriria o erro na casa, às sete da
 *    noite, com a chamada aberta pela metade;
 *  * o NOME vem preenchido pela sugestão do tipo e continua editável. "Janta
 *    de sexta" e "Almoço — passeio no parque" são o que a próxima pessoa lê na
 *    lista do dia, e obrigar a digitar do zero às 18h é atrito sem ganho.
 */
function FolhaAbrir({ tipos, aviso, onFechar, onAbrir }: {
  tipos: TipoDeChamada[]; aviso: string;
  onFechar: () => void; onAbrir: (kind: string, titulo: string) => void;
}) {
  const [kind, setKind] = useState('');
  const [titulo, setTitulo] = useState('');
  const pode = kind !== '' && titulo.trim().length >= 3;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-abrir"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-abrir">Abrir uma chamada</h3>
        <div className="notice c-info">{aviso}</div>

        <label className="f">O que está sendo conferido</label>
        <div className="opts">
          {tipos.map((t) => (
            <button type="button" key={t.cod} className="opt c-info"
                    aria-pressed={kind === t.cod}
                    onClick={() => { setKind(t.cod); setTitulo(t.sugestao); }}>
              {t.label}
            </button>
          ))}
        </div>

        {kind && (
          <>
            <label className="f" htmlFor="ch-titulo">
              Nome da chamada <small>— é o que a próxima pessoa lê na lista do dia</small>
            </label>
            <input id="ch-titulo" className="field" value={titulo}
                   onChange={(e) => setTitulo(e.target.value)}
                   placeholder="Ex.: Janta de sexta" />
          </>
        )}

        <p className="mutetxt">
          A chamada nasce com <b>todos os acolhidos ativos da casa</b>. Quem chegar depois
          aparece para ser conferido; quem sair no meio continua com o que já foi registrado.
        </p>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onAbrir(kind, titulo.trim())}>
            Abrir e conferir agora
          </button>
        </div>
      </div>
    </div>
  );
}

function FolhaOpcao({ linha, opcoes, onFechar, onMarcar }: {
  linha: Linha; opcoes: Opcao[];
  onFechar: () => void;
  onMarcar: (opcao: string, nota?: string) => void;
}) {
  const [op, setOp] = useState('');
  const [nota, setNota] = useState('');
  const escolhida = opcoes.find((o) => o.code === op);
  const pronto = op !== '' && (!escolhida?.excecao || nota.trim().length >= 5);

  return (
    <div className="overlay" role="dialog" aria-modal="true"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3>{linha.nome}</h3>
        {linha.alertas && <div className="alerta">⚠ {linha.alertas}</div>}
        {linha.restricoes && <div className="alerta rest">🍽 {linha.restricoes}</div>}

        <div className="opts">
          {opcoes.map((o) => (
            <button key={o.code} type="button" className={`opt ${o.excecao ? 'c-warn' : 'c-ok'}`}
                    aria-pressed={op === o.code} onClick={() => setOp(o.code)}>
              {o.label}
            </button>
          ))}
        </div>

        {escolhida?.excecao && (
          <>
            <label className="f" htmlFor="just">
              O fato <small>— o que aconteceu, sem rótulo sobre a criança</small>
            </label>
            <textarea id="just" value={nota} onChange={(e) => setNota(e.target.value)}
                      placeholder="Ex.: comeu metade do prato e disse que estava sem fome." />
          </>
        )}

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!pronto}
                  onClick={() => onMarcar(op, nota.trim() || undefined)}>
            Marcar
          </button>
        </div>
      </div>
    </div>
  );
}
