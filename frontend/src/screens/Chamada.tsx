import { useCallback, useEffect, useState } from 'react';
import { api, apiOuFila } from '../api';

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
 *
 * E, desde 01/09/2026, duas coisas que vieram de ver a tela sendo usada:
 *
 *  * **quem já foi conferido RECOLHE.** Vinte cartões abertos de uma vez são
 *    vinte lugares onde o olho se perde; o que a pessoa precisa ver é quem
 *    ainda falta. O nome conferido vira uma linha de uma altura só, com a
 *    marca do que foi registrado, e um toque reabre para corrigir;
 *  * **a conferência de mesa.** A educadora olha a mesa, vê que estão todos
 *    comendo, e hoje precisa de vinte toques para dizer isso. Vinte toques não
 *    deixam o registro mais verdadeiro — deixam a pessoa com pressa, e pressa
 *    é o que faz pular a criança que não comeu. O ato fica gravado COMO ATO
 *    (quem, quando, quantos), e é essa declaração que o separa da "marcação em
 *    lote silenciosa" que o §10 proíbe. A chamada final do turno não a aceita:
 *    ela existe para alguém contar as crianças uma a uma antes de dormir.
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
  /** Nasceu de uma conferência de mesa, e não de um olhar sobre esta criança. */
  naConferenciaDeMesa: boolean;
}
interface ConferenciaDeMesa {
  id: string; opcao: string; quantos: number; por: string; quando: string;
}
interface Opcao { code: string; label: string; excecao: boolean }
interface Chamada {
  id: string; tipo: string; titulo: string; status: string;
  esperados: number; conferidos: number; faltam: number; quemFalta: string[];
  linhas: Linha[]; opcoes: Opcao[];
  aceitaConferenciaDeMesa: boolean;
  opcaoDaMesa: string | null;
  conferenciasDeMesa: ConferenciaDeMesa[];
  avisoDaMesa: string;
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
  /** O nome conferido que a pessoa reabriu para conferir ou corrigir. */
  const [reaberta, setReaberta] = useState<string | null>(null);
  const [conferindoMesa, setConferindoMesa] = useState(false);
  /** Filtro por nome: no fim da chamada sobra uma criança, e achá-la custa rolagem. */
  const [busca, setBusca] = useState('');

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
    /* As guardadas são desta chamada: abrir outra e continuar mostrando as da
     * anterior marcaria criança que ninguém conferiu ali. */
    setErro(''); setReaberta(null); setGuardadas({});
    try { setAberta(await api<Chamada>(`/checks/${id}`)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir a chamada.'); }
  }

  /**
   * A CONFERÊNCIA DE MESA.
   *
   * Marca de uma vez os que AINDA NÃO TÊM registro — nunca sobrescreve quem já
   * foi marcado, inclusive a criança que a pessoa marcou "recusou" antes de
   * olhar a mesa. O servidor grava o ato com nome, horário e contagem.
   */
  async function conferirMesa() {
    if (!aberta) return;
    setConferindoMesa(true); setErro(''); setAviso('');
    try {
      const r = await api<{ aviso?: string }>(`/checks/${aberta.id}/bulk`, {
        method: 'POST', body: '{}' });
      setAberta(await api<Chamada>(`/checks/${aberta.id}`));
      await carregarLista();
      setAviso(r?.aviso ?? 'Conferência de mesa registrada.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar a conferência de mesa.');
    } finally {
      setConferindoMesa(false);
    }
  }

  /*
   * O QUE FOI MARCADO SEM SINAL PRECISA SAIR DA FILA DA TELA.
   *
   * Sem isto, a educadora marca as vinte crianças offline e a tela continua
   * dizendo "0 de 20", com o botão "Normal" intacto em cada linha: ela não
   * tem como saber quem já marcou, e a saída natural é marcar de novo. A
   * marcação guardada some daqui e reaparece na lista de conferidos com a
   * palavra que explica onde ela está — o servidor só saberá disso quando a
   * conexão voltar, e a tela não pode fingir que já sabe.
   */
  const [guardadas, setGuardadas] = useState<Record<string, string>>({});

  async function marcar(l: Linha, opcao: string, nota?: string) {
    if (!aberta) return;
    setOcupado(l.acolhidoId); setErro(''); setAviso('');
    try {
      /*
       * A marcação da chamada é a operação que mais acontece longe do
       * roteador: o pátio, o refeitório, a saída para a escola. Sem sinal ela
       * fica guardada NESTE aparelho, com o horário em que foi feita, e sobe
       * sozinha quando a conexão voltar (§17.1).
       */
      const r = await apiOuFila(`/checks/${aberta.id}/mark`, {
        method: 'POST',
        body: JSON.stringify({ personId: l.acolhidoId, opcao, nota }),
      }, {
        kind: 'check.mark',
        houseId,
        payload: { checkId: aberta.id, personId: l.acolhidoId, opcao, nota },
      });
      if (r.recusa) { setErro(r.recusa); return; }
      if (r.enfileirada) {
        /* A lista não é recarregada: sem sinal o servidor não tem o que
         * devolver, e insistir apagaria da tela o que a pessoa acabou de
         * fazer. O aviso diz onde a marcação está. */
        setGuardadas((g) => ({ ...g, [l.acolhidoId]: opcao }));
        setAviso('Sem internet. A marcação ficou guardada neste aparelho e sobe quando a conexão voltar.');
        return;
      }
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
  /* Quem está guardado no aparelho não falta conferir: falta SUBIR. Contá-lo
   * como pendente faria o topo cobrar da educadora um trabalho que ela já
   * fez. */
  const pendentes = aberta.linhas.filter((l) => l.ativo && !l.resultado && !guardadas[l.acolhidoId]);
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
  /* Sem acento e sem caixa: "Otávio" tem de ser achado digitando "otavio". */
  const semAcento = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtro = (l: Linha) => !busca || semAcento(l.nome).includes(semAcento(busca));
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

      {/*
        * A CONFERÊNCIA DE MESA — um toque para o que se olhou de uma vez.
        *
        * Fica ANTES da lista porque é o primeiro gesto do almoço: olhar a mesa.
        * A frase diz o que vai ser gravado, e diz que quem já foi marcado não
        * é tocado — as duas coisas que separam isto de "confirmar tudo".
        */}
      {!confirmada && aberta.aceitaConferenciaDeMesa && pendentes.length > 0 && (
        <div className="card raise stack" style={{ marginBottom: 12 }}>
          <div className="row">
            <div className="grow">
              <b className="ff">Conferi a mesa</b>
              <div className="mutetxt">{aberta.avisoDaMesa}</div>
            </div>
          </div>
          <button className="btn block" disabled={conferindoMesa} onClick={conferirMesa}>
            {conferindoMesa
              ? 'Registrando…'
              : `Marcar os ${pendentes.length} que faltam como "${
                  aberta.opcoes.find((o) => o.code === aberta.opcaoDaMesa)?.label ?? normal.label}"`}
          </button>
        </div>
      )}

      {/* Quando a conferência de mesa NÃO se aplica, a ausência do botão precisa
          ser explicada onde ela é notada. Sem isto, quem usou o almoço de manhã
          abre a chamada final à noite e conclui que o sistema quebrou. */}
      {!confirmada && !aberta.aceitaConferenciaDeMesa && pendentes.length > 0 && (
        <div className="notice c-info" role="status">{aberta.avisoDaMesa}</div>
      )}

      {/* O ato, depois de feito: quem conferiu a mesa, quando e quantos. Não é
          detalhe de auditoria — é o que a próxima pessoa precisa ler para saber
          que tipo de conferência aquela foi. */}
      {aberta.conferenciasDeMesa.length > 0 && (
        <div className="notice c-info" role="status">
          {aberta.conferenciasDeMesa.map((b) => (
            <div key={b.id}>
              <b>Conferência de mesa:</b> {b.quantos}{' '}
              {b.quantos === 1 ? 'acolhido' : 'acolhidos'} como{' '}
              <b>{aberta.opcoes.find((o) => o.code === b.opcao)?.label ?? b.opcao}</b>
              {' · '}{b.por} · {hhmm(b.quando)}
            </div>
          ))}
        </div>
      )}

      {/* Buscar pelo nome. Só aparece quando a lista é grande o bastante para
          a rolagem custar: numa casa de seis, o campo seria estorvo. */}
      {aberta.linhas.length > 8 && (
        <input className="field" value={busca} onChange={(e) => setBusca(e.target.value)}
               placeholder="Buscar pelo nome" aria-label="Buscar acolhido pelo nome"
               style={{ marginBottom: 10 }} />
      )}

      {/*
        * QUEM AINDA FALTA fica em cima, aberto. É a lista que encolhe enquanto
        * a pessoa trabalha, e é a única coisa que ela precisa olhar.
        */}
      {pendentes.length > 0 && (
        <div className="eyebrow">
          Faltam conferir · {pendentes.length}
          {busca && ` · filtrando por "${busca}"`}
        </div>
      )}
      <ol className="chamada">
        {aberta.linhas.filter((l) => l.ativo && !l.resultado && !guardadas[l.acolhidoId])
          .filter(filtro).map((l) => (
          <li key={l.acolhidoId} className="ev">
            <div className="corpo">
              <div className="row">
                <b className="ff grow">{l.nome}{l.idade ? ` · ${l.idade}` : ''}</b>
              </div>
              {/* Onde o alerta importa: na hora de marcar, com a bandeja na mão. */}
              {l.alertas && <div className="alerta">⚠ {l.alertas}</div>}
              {l.restricoes && <div className="alerta rest">🍽 {l.restricoes}</div>}
              {!confirmada && (
                <div className="acoes">
                  <button className="btn sm" disabled={ocupado === l.acolhidoId}
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
        ))}
      </ol>

      {Object.keys(guardadas).length > 0 && (
        <>
          <div className="eyebrow">
            Guardado neste aparelho · {Object.keys(guardadas).length}
          </div>
          <ol className="chamada">
            {aberta.linhas.filter((l) => guardadas[l.acolhidoId]).map((l) => (
              <li key={l.acolhidoId} className="ev">
                <div className="corpo">
                  <div className="row">
                    <b className="ff grow">{l.nome}</b>
                    <span className="pill c-warn">Sobe quando a conexão voltar</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {/*
        * QUEM JÁ FOI CONFERIDO, RECOLHIDO.
        *
        * Uma linha por criança, com a marca do que ficou registrado. Vinte
        * cartões abertos são vinte lugares onde o olho se perde; aqui a pessoa
        * corre a lista e vê que ninguém ficou de fora. Tocar no nome reabre
        * os botões — corrigir continua a um toque de distância, e a correção
        * guarda o que constava antes.
        */}
      {conferidosAtivos + saiuNoMeio > 0 && (
        <>
          <div className="eyebrow">
            Já conferidos · {conferidosAtivos} de {aberta.esperados}
          </div>
          <ul className="conferidos">
            {aberta.linhas.filter((l) => l.resultado || !l.ativo).filter(filtro).map((l) => {
              const rotulo = aberta.opcoes.find((o) => o.code === l.resultado)?.label;
              const excecional = aberta.opcoes.find((o) => o.code === l.resultado)?.excecao;
              const aberto = reaberta === l.acolhidoId;
              return (
                <li key={l.acolhidoId} className={`feito ${l.ativo ? '' : 'saiu'}`}>
                  <button type="button" className="linhaconf"
                          aria-expanded={aberto}
                          onClick={() => setReaberta(aberto ? null : l.acolhidoId)}>
                    <span className="grow">{l.nome}{l.idade ? ` · ${l.idade}` : ''}</span>
                    {!l.ativo && <span className="pill c-mute">saiu no meio</span>}
                    {l.resultado
                      ? <span className={`pill ${excecional ? 'c-warn' : 'c-ok'}`}>{rotulo}</span>
                      : <span className="pill c-mute">sem registro</span>}
                    <span className="seta" aria-hidden="true">{aberto ? '⌃' : '⌄'}</span>
                  </button>
                  {aberto && (
                    <div className="corpo">
                      {l.alertas && <div className="alerta">⚠ {l.alertas}</div>}
                      {l.restricoes && <div className="alerta rest">🍽 {l.restricoes}</div>}
                      {l.justificativa && <div className="mutetxt">{l.justificativa}</div>}
                      <div className="mutetxt">
                        {l.registradoPor ? `Por ${l.registradoPor}` : 'Sem registro'}
                        {l.registradoEm ? ` · ${hhmm(l.registradoEm)}` : ''}
                        {/* A procedência, dita: conferido NA MESA não é o
                            mesmo que olhado sozinho, e quem lê precisa saber. */}
                        {l.naConferenciaDeMesa && ' · na conferência de mesa'}
                      </div>
                      {!confirmada && l.ativo && (
                        <div className="acoes">
                          <button className="btn sm ghost" disabled={ocupado === l.acolhidoId}
                                  onClick={() => marcar(l, normal.code)}>
                            {normal.label}
                          </button>
                          <button className="btn sm" disabled={ocupado === l.acolhidoId}
                                  onClick={() => setExcecao(l)}>
                            Corrigir
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

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
