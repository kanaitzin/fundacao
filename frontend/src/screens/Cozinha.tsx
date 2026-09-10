import { useEffect, useState } from 'react';
import { api } from '../api';
import { FolhaDocumento, ArquivoGerado } from '../documentos';
import type { DocumentoWord } from '../docx';

/**
 * COZINHA — uma tela só, e é isso que a torna certa.
 *
 * O servidor já tinha o relatório (`GET /reports/kitchen`), com uma projeção
 * deliberadamente pobre: nome, o que evitar, a substituição orientada e quando
 * revisar. **Não havia tela.** E, sem tela própria, a cozinha entrava no
 * sistema inteiro — Dia, Chamada, Acolhidos, Passagem, Ocorrências, ATA. Quem
 * cozinha passou a enxergar o caso de cada criança para saber que a Alice não
 * come amendoim.
 *
 * O que esta tela recusa mostrar, e o servidor recusa devolver:
 *
 *  * o MOTIVO da restrição. "Alergia a amendoim" é a restrição; se é alergia
 *    grave, intolerância ou orientação de uma consulta, não é assunto da
 *    cozinha, e saber disso muda o olhar sobre a criança sem mudar o prato;
 *  * CPF, diagnóstico, caso, histórico, ocorrência — nada disso passa;
 *  * o nome civil. A lista traz o nome pelo qual a criança é chamada.
 *
 * A substituição está aqui de propósito: dizer "não pode" sem dizer "serve
 * isto no lugar" transfere para a cozinha uma decisão que é da equipe técnica
 * — e é assim que uma criança fica sem sobremesa em vez de comer outra.
 */

interface Restricao {
  nome: string;
  evitar: string;
  substituicao: string | null;
  orientacao: string | null;
  revisarEm: string | null;
}

const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('pt-BR',
  { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

interface Pedido {
  id: string; tipo: string; personId: string | null; paraQuem: string;
  em: string; quantidade: number; finalidade: string; observacao: string | null;
  entregarA: string | null; status: string; motivoCancelamento: string | null;
  pedidoPor: string; pedidoEm: string;
}
interface Kid { id: string; nome: string }
interface Resumo {
  lanchesPorcoes: number; lanchesPedidos: number; lanchesCriancas: number;
  cestas: number; cestasCriancas: number; cancelados: number; quemPediu: number;
}

const hojeISO = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const maisDias = (n: number) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(Date.now() + n * 86400_000));

export function Cozinha({ houseId, casaLabel, papel }: {
  houseId: string; casaLabel: string; papel: string;
}) {
  const [aba, setAba] = useState<'pedidos' | 'restricoes'>('pedidos');
  const [lista, setLista] = useState<Restricao[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [pedindo, setPedindo] = useState<'lanche' | 'cesta_basica' | null>(null);
  const [cancelando, setCancelando] = useState<Pedido | null>(null);
  const [motivoCancel, setMotivoCancel] = useState('');
  const [folha, setFolha] = useState<{ doc: DocumentoWord; qual: string } | null>(null);
  const [de, setDe] = useState(hojeISO());
  const [ate, setAte] = useState(maisDias(14));
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  /* Quem pede é quem está no turno — decisão do Marcelo em 09/09. O controle
     aqui é de AUTORIA (fica o nome), não de acesso. */
  const podePedir = ['educador', 'lider_diurno', 'lider_noturno_geral',
                     'equipe_tecnica', 'coordenador', 'gestor_geral'].includes(papel);

  async function carregarPedidos() {
    setPedidos(await api<Pedido[]>(
      `/people/kitchen-requests?houseId=${houseId}&de=${de}&ate=${ate}`).catch(() => []));
    setResumo(await api<Resumo>(
      `/people/kitchen-requests/summary?houseId=${houseId}&de=${de}&ate=${ate}`)
      .catch(() => null));
  }

  useEffect(() => {
    (async () => {
      setErro(''); setCarregando(true);
      try {
        setLista(await api<Restricao[]>(`/reports/kitchen?houseId=${houseId}`));
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar as restrições.');
      } finally { setCarregando(false); }
      setKids(await api<Kid[]>(`/people?houseId=${houseId}`).catch(() => []));
    })();
  }, [houseId]);

  useEffect(() => { carregarPedidos(); }, [houseId, de, ate]);

  async function pedir(corpo: Record<string, unknown>) {
    setErro('');
    try {
      await api('/people/kitchen-requests', { method: 'POST', body: JSON.stringify(corpo) });
      setPedindo(null); await carregarPedidos();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar o pedido.');
    }
  }

  async function cancelar(p: Pedido) {
    setErro('');
    try {
      await api(`/people/kitchen-requests/${p.id}/cancel`, {
        method: 'POST', body: JSON.stringify({ motivo: motivoCancel.trim() }),
      });
      setCancelando(null); setMotivoCancel(''); await carregarPedidos();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível cancelar.');
    }
  }

  /*
   * Ver não é exportar. `folha` mostra e não registra; `export` exige
   * finalidade e registra a saída — e é a TELA que escreve a rota, para o
   * conferidor de contrato enxergá-la.
   */
  /**
   * ROTA POR EXTENSO, uma por documento — não montada por interpolação.
   *
   * `/folha/${qual}` compila e funciona, e some do `contrato-rotas.spec`, que
   * lê o código do frontend para conferir cada chamada contra as rotas do
   * servidor. Ele resolve a interpolação para `:x` e não acha nada. A mesma
   * lição já estava escrita no `documentos.tsx`, e ele pegou de novo — desta
   * vez em mim.
   */
  async function abrirFolha(qual: 'lanches' | 'restricoes' | 'cestas') {
    setErro('');
    const periodo = `houseId=${houseId}&de=${de}&ate=${ate}`;
    try {
      const doc = qual === 'lanches'
        ? await api<DocumentoWord>(`/people/kitchen-requests/folha/lanches?${periodo}`)
        : qual === 'cestas'
          ? await api<DocumentoWord>(`/people/kitchen-requests/folha/cestas?${periodo}`)
          : await api<DocumentoWord>(`/people/kitchen-requests/folha/restricoes?houseId=${houseId}`);
      setFolha({ doc, qual });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível montar a folha.');
    }
  }

  function exportarFolha(qual: string) {
    return (finalidade: string): Promise<ArquivoGerado> => {
      const corpo = qual === 'restricoes'
        ? { houseId, finalidade }
        : { houseId, de, ate, finalidade };
      if (qual === 'lanches') {
        return api<ArquivoGerado>('/people/kitchen-requests/export/lanches',
          { method: 'POST', body: JSON.stringify(corpo) });
      }
      if (qual === 'cestas') {
        return api<ArquivoGerado>('/people/kitchen-requests/export/cestas',
          { method: 'POST', body: JSON.stringify(corpo) });
      }
      return api<ArquivoGerado>('/people/kitchen-requests/export/restricoes',
        { method: 'POST', body: JSON.stringify(corpo) });
    };
  }

  return (
    <>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      <div className="seg" role="tablist">
        <button role="tab" aria-selected={aba === 'pedidos'}
                className={aba === 'pedidos' ? 'on' : ''}
                onClick={() => setAba('pedidos')}>Pedidos</button>
        <button role="tab" aria-selected={aba === 'restricoes'}
                className={aba === 'restricoes' ? 'on' : ''}
                onClick={() => setAba('restricoes')}>Restrições</button>
      </div>

      {aba === 'pedidos' && (
        <>
          <div className="card raise stack">
            <h3 style={{ fontSize: 17, margin: 0 }}>Pedidos para a cozinha · {casaLabel}</h3>
            {/* A cozinha não entra no sistema: o que sai daqui é papel. */}
            <div className="mutetxt">
              A cozinha recebe estes pedidos em papel. Gere a folha, imprima ou envie
              pelo canal que a instituição usa.
            </div>
            <div className="row" style={{ gap: 8 }}>
              <div className="grow">
                <label className="f" htmlFor="kd-de">De</label>
                <input id="kd-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
              </div>
              <div className="grow">
                <label className="f" htmlFor="kd-ate">Até</label>
                <input id="kd-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
              </div>
            </div>
          </div>

          {/*
            * QUANTO SAIU. Porções e pedidos são números diferentes — 20 lanches
            * para a saída do grupo é um pedido e vinte porções —, e a cozinha
            * planeja pela soma.
            *
            * Não há contagem POR educador: a autoria de cada pedido está na
            * lista, mas somar por pessoa é medir gente. `quemPediu` conta
            * pessoas distintas e responde "a casa inteira usa isto ou só duas?"
            * sem apontar para ninguém.
            */}
          {resumo && (
            <div className="card stack" style={{ marginBottom: 12 }}>
              <div className="eyebrow">No período</div>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <div className="tile c-warn">
                  <b>{resumo.lanchesPorcoes}</b>
                  <div className="mutetxt">porções de lanche</div>
                </div>
                <div className="tile c-mute">
                  <b>{resumo.lanchesPedidos}</b>
                  <div className="mutetxt">pedidos de lanche</div>
                </div>
                <div className="tile c-move">
                  <b>{resumo.cestas}</b>
                  <div className="mutetxt">cestas básicas</div>
                </div>
                <div className="tile c-mute">
                  <b>{resumo.cestasCriancas}</b>
                  <div className="mutetxt">crianças com cesta</div>
                </div>
              </div>
              <div className="mutetxt">
                Pedidos por {resumo.quemPediu} pessoa{resumo.quemPediu === 1 ? '' : 's'} da
                equipe{resumo.cancelados > 0 ? ` · ${resumo.cancelados} cancelado${resumo.cancelados === 1 ? '' : 's'}` : ''}.
              </div>
            </div>
          )}

          {podePedir && (
            <div className="row" style={{ gap: 8, marginBottom: 12 }}>
              <button className="btn grow" onClick={() => setPedindo('lanche')}>
                🥪 Pedir lanche
              </button>
              <button className="btn sec grow" onClick={() => setPedindo('cesta_basica')}>
                🧺 Pedir cesta básica
              </button>
            </div>
          )}

          <div className="eyebrow">Pedidos do período · {pedidos.length}</div>
          <div className="stack">
            {pedidos.length === 0 && (
              <p className="mutetxt">
                Nenhum pedido neste período. A lista vazia quer dizer que ninguém pediu —
                não que o pedido se perdeu.
              </p>
            )}
            {pedidos.map((p) => (
              <div className="card stack" key={p.id}
                   style={p.status === 'cancelado' ? { background: 'var(--sunken)' } : undefined}>
                <div className="row">
                  <b className="ff grow">
                    {p.tipo === 'lanche' ? '🥪 Lanche' : '🧺 Cesta básica'} · {p.paraQuem}
                  </b>
                  <span className={`pill ${p.status === 'cancelado' ? 'c-crit' : 'c-warn'}`}>
                    {p.status === 'cancelado' ? 'cancelado' : dia(p.em)}
                  </span>
                </div>
                <div className="mutetxt">
                  {p.quantidade} · {p.finalidade}
                  {p.entregarA ? ` · entregar a ${p.entregarA}` : ''}
                </div>
                {p.observacao && <div className="mutetxt">{p.observacao}</div>}
                <div className="mutetxt">Pedido por {p.pedidoPor}.</div>
                {/* Cancelado NÃO some: a cozinha pode já ter comprado. */}
                {p.status === 'cancelado' && (
                  <div className="mutetxt"><b>Motivo:</b> {p.motivoCancelamento}</div>
                )}
                {p.status === 'aberto' && podePedir && (
                  <button className="btn sm ghost"
                          onClick={() => { setCancelando(p); setMotivoCancel(''); }}>
                    Cancelar este pedido
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="eyebrow">Folhas para a cozinha</div>
          <div className="stack" style={{ marginBottom: 12 }}>
            <button className="btn sec block" onClick={() => abrirFolha('lanches')}>
              📄 Solicitação de lanche — do período
            </button>
            <button className="btn sec block" onClick={() => abrirFolha('cestas')}>
              📄 Solicitação de cesta básica — do período
            </button>
            <button className="btn sec block" onClick={() => abrirFolha('restricoes')}>
              📄 Restrições alimentares — da casa
            </button>
          </div>

          {pedindo && (
            <FolhaPedido tipo={pedindo} kids={kids} houseId={houseId}
                         onFechar={() => setPedindo(null)} onPedir={pedir} />
          )}

          {cancelando && (
            <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-canc"
                 onClick={(e) => { if (e.target === e.currentTarget) setCancelando(null); }}>
              <div className="sheet">
                <h3 id="t-canc">Cancelar o pedido</h3>
                <p className="mutetxt">
                  O pedido não some: fica na folha, na seção dos cancelados, com este motivo.
                  A cozinha pode já ter comprado.
                </p>
                <label className="f" htmlFor="mot-canc">Por quê</label>
                <textarea id="mot-canc" rows={2} value={motivoCancel}
                          onChange={(e) => setMotivoCancel(e.target.value)}
                          placeholder="Ex.: a saída foi desmarcada." />
                <div className="row" style={{ gap: 8, marginTop: 16 }}>
                  <button className="btn sec grow" onClick={() => setCancelando(null)}>Voltar</button>
                  <button className="btn grow" disabled={motivoCancel.trim().length < 5}
                          onClick={() => cancelar(cancelando)}>Cancelar pedido</button>
                </div>
              </div>
            </div>
          )}

          {folha && (
            <FolhaDocumento doc={folha.doc} onFechar={() => setFolha(null)}
                            exportar={exportarFolha(folha.qual)} />
          )}
        </>
      )}

      {aba === 'restricoes' && (
      <>
      <div className="card raise stack">
        <h3 style={{ fontSize: 17, margin: 0 }}>Restrições alimentares · {casaLabel}</h3>
        <div className="mutetxt">O que não pode ser servido hoje, e o que serve no lugar.</div>
        <div className="notice c-info">
          Esta lista mostra a <b>restrição</b>, não a razão dela. O motivo é assunto da
          equipe técnica e da Enfermagem — e saber o motivo mudaria o olhar sobre a criança
          sem mudar o prato.
        </div>
      </div>

      {carregando && <p className="mutetxt">Carregando…</p>}

      <div className="eyebrow">Acolhidos com restrição · {lista.length}</div>
      <div className="stack">
        {lista.map((r) => (
          <div className="card stack" key={r.nome + r.evitar}>
            <div className="row">
              <b className="ff grow" style={{ fontSize: 16 }}>{r.nome}</b>
              {r.revisarEm && (
                <span className="pill c-mute">revisar em {dia(r.revisarEm)}</span>
              )}
            </div>
            <div className="bloco destaque"><small>Não servir</small>{r.evitar}</div>
            {r.substituicao
              ? <div className="bloco"><small>Servir no lugar</small>{r.substituicao}</div>
              : (
                <div className="notice c-warn" style={{ margin: 0 }}>
                  <b>Sem substituição orientada.</b> Pergunte à equipe técnica antes de
                  decidir sozinha o que servir — a criança não pode ficar sem.
                </div>
              )}
            {r.orientacao && <div className="mutetxt">{r.orientacao}</div>}
          </div>
        ))}

        {!carregando && lista.length === 0 && (
          <div className="card">
            <p className="mutetxt" style={{ margin: 0 }}>
              <b>Nenhuma restrição registrada nesta casa hoje.</b> Isso não quer dizer
              "pode tudo": quer dizer que ninguém registrou. Se você souber de alguma,
              avise a equipe técnica — a lista vem do perfil da criança, e é lá que ela
              se corrige.
            </p>
          </div>
        )}
      </div>

      <p className="mutetxt" style={{ marginTop: 12 }}>
        A lista muda quando a equipe técnica muda o perfil da criança. Ela vale para
        <b> esta casa</b> e para o dia de hoje; confira de novo a cada turno.
      </p>
    </>
      )}
    </>
  );
}

/**
 * A folha de pedir.
 *
 * Uma só para lanche e cesta, porque os campos são os mesmos e duas folhas
 * quase iguais divergem no primeiro ajuste. O que muda é o texto — e o texto
 * importa: quem pede cesta está pensando na visita à família, quem pede lanche
 * está pensando na saída de sábado.
 */
function FolhaPedido({ tipo, kids, houseId, onFechar, onPedir }: {
  tipo: 'lanche' | 'cesta_basica';
  kids: { id: string; nome: string }[];
  houseId: string;
  onFechar: () => void;
  onPedir: (corpo: Record<string, unknown>) => void;
}) {
  const lanche = tipo === 'lanche';
  const [personId, setPersonId] = useState('');
  const [em, setEm] = useState(hojeISO());
  const [quantidade, setQuantidade] = useState(1);
  const [finalidade, setFinalidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [entregarA, setEntregarA] = useState('');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-ped"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-ped">{lanche ? 'Pedir lanche' : 'Pedir cesta básica'}</h3>

        <label className="f" htmlFor="pd-quem">Para quem</label>
        <select id="pd-quem" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          {/* Coletivo existe porque a saída do grupo pede lanche para todo
              mundo, e nomear vinte crianças seria pior. */}
          {lanche && <option value="">Casa toda</option>}
          {!lanche && <option value="">Selecione o acolhido…</option>}
          {kids.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}
        </select>

        <label className="f" htmlFor="pd-dia">Para quando</label>
        <input id="pd-dia" type="date" value={em}
               onChange={(e) => setEm(e.target.value)} />
        {/* Sem data mínima: a casa tem dezenove crianças e no dia chega a
            vigésima. O lanche vai sair de qualquer jeito — o que o sistema pode
            fazer é registrar, ou ficar sem saber. */}
        <div className="mutetxt">
          A cozinha se organiza melhor com 48h, mas o pedido de hoje ou de ontem
          entra igual — o que importa é ficar registrado.
        </div>

        <label className="f" htmlFor="pd-qtd">Quantidade</label>
        <input id="pd-qtd" type="number" min={1} value={quantidade}
               onChange={(e) => setQuantidade(Number(e.target.value))} />

        <label className="f" htmlFor="pd-fin">Para quê</label>
        <input id="pd-fin" value={finalidade} maxLength={120}
               onChange={(e) => setFinalidade(e.target.value)}
               placeholder={lanche
                 ? 'Ex.: saída ao parque no sábado à tarde.'
                 : 'Ex.: fim de semana com a família.'} />
        <div className="mutetxt">
          Obrigatório: “1 lanche” sem finalidade obriga a cozinha a adivinhar.
        </div>

        <label className="f" htmlFor="pd-ent">Entregar a quem (opcional)</label>
        <input id="pd-ent" value={entregarA} maxLength={80}
               onChange={(e) => setEntregarA(e.target.value)}
               placeholder="Quem vai buscar na cozinha." />

        <label className="f" htmlFor="pd-obs">Observação (opcional)</label>
        <textarea id="pd-obs" rows={2} value={observacao}
                  onChange={(e) => setObservacao(e.target.value)} />

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow"
                  disabled={finalidade.trim().length < 5 || quantidade < 1
                            || (!lanche && !personId)}
                  onClick={() => onPedir({
                    houseId, tipo, personId: personId || null, em,
                    quantidade, finalidade: finalidade.trim(),
                    observacao: observacao.trim(), entregarA: entregarA.trim(),
                  })}>
            Registrar pedido
          </button>
        </div>
      </div>
    </div>
  );
}
