import { useEffect, useState } from 'react';
import { api } from '../api';
import { FolhaDocumento, ArquivoGerado } from '../documentos';
import type { DocumentoWord } from '../docx';
import { dia } from '../rotulos';
import { Icone } from '../icones';

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


interface Pedido {
  id: string; tipo: string; personId: string | null; paraQuem: string;
  em: string; quantidade: number; finalidade: string; observacao: string | null;
  entregarA: string | null; status: string; motivoCancelamento: string | null;
  pedidoPor: string; pedidoEm: string;
  /* Fase 162: o lote do "Selecionar todos", e quantas vezes foi editado. */
  lote?: string | null; edicoes?: number;
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
  const [aba, setAba] = useState<'pedidos' | 'refeicoes' | 'restricoes'>('pedidos');
  const [editando, setEditando] = useState<Pedido | null>(null);
  const [vendoHistorico, setVendoHistorico] = useState<Pedido | null>(null);
  const [aviso, setAviso] = useState('');
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
    setErro(''); setAviso('');
    try {
      const r = await api<{ aviso?: string }>('/people/kitchen-requests', { method: 'POST', body: JSON.stringify(corpo) });
      setAviso(r?.aviso ?? '');
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
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      <div className="filtros" role="tablist">
        <button role="tab" aria-selected={aba === 'pedidos'}
                className={aba === 'pedidos' ? 'on' : ''}
                onClick={() => setAba('pedidos')}>Pedidos</button>
        <button role="tab" aria-selected={aba === 'refeicoes'}
                className={aba === 'refeicoes' ? 'on' : ''}
                onClick={() => setAba('refeicoes')}>Refeições</button>
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
                <Icone nome="lanche" /> Pedir lanche
              </button>
              <button className="btn sec grow" onClick={() => setPedindo('cesta_basica')}>
                <Icone nome="cesta" /> Pedir cesta básica
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
                    {p.tipo === 'lanche'
                        ? <><Icone nome="lanche" /> Lanche</>
                        : <><Icone nome="cesta" /> Cesta básica</>} · {p.paraQuem}
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
                <div className="mutetxt">
                  Pedido por {p.pedidoPor}.
                  {p.edicoes ? ` Editado ${p.edicoes === 1 ? 'uma vez' : `${p.edicoes} vezes`}.` : ''}
                </div>
                {!!p.edicoes && (
                  <button className="btn sm ghost" onClick={() => setVendoHistorico(p)}>
                    Ver o histórico deste pedido
                  </button>
                )}
                {/* Editar até o dia do pedido (decisão de 26/09); depois, só cancelar. */}
                {p.status === 'aberto' && podePedir && p.em >= hojeISO() && (
                  <button className="btn sm ghost" onClick={() => setEditando(p)}>
                    Editar este pedido
                  </button>
                )}
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
              <Icone nome="documento" /> Solicitação de lanche — do período
            </button>
            <button className="btn sec block" onClick={() => abrirFolha('cestas')}>
              <Icone nome="documento" /> Solicitação de cesta básica — do período
            </button>
            <button className="btn sec block" onClick={() => abrirFolha('restricoes')}>
              <Icone nome="documento" /> Restrições alimentares — da casa
            </button>
          </div>

          {pedindo && (
            <FolhaPedido tipo={pedindo} kids={kids} houseId={houseId}
                         onFechar={() => setPedindo(null)} onPedir={pedir} />
          )}

          {editando && (
            <FolhaEditarPedido pedido={editando} onFechar={() => setEditando(null)}
              onPronto={async (msg) => { setEditando(null); setAviso(msg); await carregarPedidos(); }} />
          )}
          {vendoHistorico && (
            <FolhaHistoricoDoPedido pedido={vendoHistorico} onFechar={() => setVendoHistorico(null)} />
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

      {aba === 'refeicoes' && <RefeicoesDaCasa houseId={houseId} casaLabel={casaLabel} />}

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
  /*
   * PARA QUEM (fase 162, decisão de 26/09). O lanche pode ser da casa toda,
   * num pedido coletivo; ou das crianças MARCADAS — e aí é um pedido por
   * criança, com "Selecionar todos" para a saída em que vão todas. A cesta é
   * sempre de uma família, então é sempre por criança.
   */
  const [coletivo, setColetivo] = useState(lanche);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const todas = kids.length > 0 && marcadas.length === kids.length;
  const alterna = (id: string) =>
    setMarcadas(marcadas.includes(id) ? marcadas.filter((x) => x !== id) : [...marcadas, id]);
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

        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="f">Para quem</legend>
          {lanche && (
            <div className="opts">
              <button type="button" className="opt c-move" aria-pressed={coletivo}
                      onClick={() => setColetivo(true)}>Casa toda, um pedido só</button>
              <button type="button" className="opt c-move" aria-pressed={!coletivo}
                      onClick={() => setColetivo(false)}>Crianças que eu marcar</button>
            </div>
          )}
          {!coletivo && (
            <>
              <div className="row">
                <span className="mutetxt grow">
                  {marcadas.length} de {kids.length} marcada{marcadas.length === 1 ? '' : 's'} — um pedido para cada.
                </span>
                <button type="button" className="btn sm sec"
                        onClick={() => setMarcadas(todas ? [] : kids.map((k) => k.id))}>
                  {todas ? 'Desmarcar todas' : 'Selecionar todos'}
                </button>
              </div>
              {/* O MESMO desenho dos dias da visita e da rotina: `opts` com
                  `aria-pressed` — alvo grande para o polegar, e o leitor de tela
                  anuncia "marcado". */}
              <div className="opts" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {kids.map((k) => (
                  <button type="button" key={k.id} className="opt c-move"
                          aria-pressed={marcadas.includes(k.id)} onClick={() => alterna(k.id)}>
                    {k.nome}
                  </button>
                ))}
              </div>
            </>
          )}
        </fieldset>

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
                            || (!coletivo && marcadas.length === 0)}
                  onClick={() => onPedir({
                    houseId, tipo, em, quantidade, finalidade: finalidade.trim(),
                    observacao: observacao.trim(), entregarA: entregarA.trim(),
                    ...(coletivo ? { personId: null } : { pessoas: marcadas }),
                  })}>
            {coletivo || marcadas.length <= 1 ? 'Registrar pedido' : `Registrar ${marcadas.length} pedidos`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Editar o pedido: o que muda, e por quê. O antes fica no histórico do servidor. */
function FolhaEditarPedido({ pedido, onFechar, onPronto }: {
  pedido: Pedido; onFechar: () => void; onPronto: (aviso: string) => void;
}) {
  const [em, setEm] = useState(pedido.em);
  const [quantidade, setQuantidade] = useState(pedido.quantidade);
  const [finalidade, setFinalidade] = useState(pedido.finalidade);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  async function salvar() {
    setErro('');
    try {
      const r = await api<{ aviso: string }>(`/people/kitchen-requests/${pedido.id}/edit`, {
        method: 'POST',
        body: JSON.stringify({
          em: em !== pedido.em ? em : undefined,
          quantidade: quantidade !== pedido.quantidade ? quantidade : undefined,
          finalidade: finalidade.trim() !== pedido.finalidade ? finalidade.trim() : undefined,
          motivo: motivo.trim(),
        }),
      });
      onPronto(r.aviso);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível editar.'); }
  }
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-edit-ped"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-edit-ped">Editar o pedido · {pedido.paraQuem}</h3>
        <p className="mutetxt">O que era antes fica no histórico do pedido, com o seu nome e o motivo.</p>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <label className="f" htmlFor="ed-dia">Para quando</label>
        <input id="ed-dia" type="date" value={em} min={hojeISO()} onChange={(e) => setEm(e.target.value)} />
        <label className="f" htmlFor="ed-qtd">Quantidade</label>
        <input id="ed-qtd" type="number" min={1} value={quantidade}
               onChange={(e) => setQuantidade(Number(e.target.value))} />
        <label className="f" htmlFor="ed-fin">Para quê</label>
        <input id="ed-fin" value={finalidade} maxLength={120} onChange={(e) => setFinalidade(e.target.value)} />
        <label className="f" htmlFor="ed-mot">Por que mudou</label>
        <textarea id="ed-mot" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: o passeio foi antecipado para sexta." />
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow"
                  disabled={motivo.trim().length < 5 || quantidade < 1 || finalidade.trim().length < 5}
                  onClick={salvar}>Salvar a mudança</button>
        </div>
      </div>
    </div>
  );
}

/** O histórico de um pedido: cada mudança, com o antes, o depois, o motivo e quem. */
function FolhaHistoricoDoPedido({ pedido, onFechar }: { pedido: Pedido; onFechar: () => void }) {
  const [linhas, setLinhas] = useState<{ id: string; antes: any; depois: any; motivo: string;
    em: string; por: string | null }[] | null>(null);
  useEffect(() => {
    api<NonNullable<typeof linhas>>(`/people/kitchen-requests/${pedido.id}/history`)
      .then(setLinhas).catch(() => setLinhas([]));
  }, [pedido.id]);
  const resumo = (x: any) => `${dia(x.data)} · ${x.quantidade} · ${x.finalidade}`;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-hist-ped"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-hist-ped">O que mudou neste pedido</h3>
        {!linhas && <p className="mutetxt">Abrindo…</p>}
        <div className="stack">
          {(linhas ?? []).map((l) => (
            <div key={l.id} className="card stack">
              <div className="mutetxt">Antes: {resumo(l.antes)}</div>
              <div><b>Depois:</b> {resumo(l.depois)}</div>
              <div className="mutetxt">Motivo: {l.motivo}</div>
              <div className="mutetxt">{l.por ?? '—'} · {dia(l.em)}</div>
            </div>
          ))}
        </div>
        <button className="btn sec block" onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}

/**
 * AS REFEIÇÕES DA CASA (fase 162) — por refeição, nunca por criança (decisão de
 * 26/09: nenhuma comparação entre crianças). Vêm da chamada de cada refeição.
 */
function RefeicoesDaCasa({ houseId, casaLabel }: { houseId: string; casaLabel: string }) {
  const [de, setDe] = useState(`${hojeISO().slice(0, 7)}-01`);
  const [ate, setAte] = useState(hojeISO());
  const [d, setD] = useState<{
    total: { chamadas: number; registros: number; comeram: number; parcial: number; recusou: number; ausente: number };
    porRefeicao: { refeicao: string; chamadas: number; registros: number; comeram: number; parcial: number;
                   recusou: number; ausente: number; dietaAdaptada: number }[];
    aviso: string;
  } | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    setErro('');
    api<NonNullable<typeof d>>(`/reports/period/meals?houseId=${houseId}&de=${de}&ate=${ate}`)
      .then(setD).catch((e) => { setD(null); setErro(e instanceof Error ? e.message : 'Não foi possível abrir.'); });
  }, [houseId, de, ate]);
  return (
    <>
      <div className="card raise stack">
        <h3 style={{ fontSize: 17, margin: 0 }}>As refeições · {casaLabel}</h3>
        <div className="mutetxt">Da chamada de cada refeição. Por refeição, e nunca por criança.</div>
        <div className="row" style={{ gap: 8 }}>
          <div className="grow">
            <label className="f" htmlFor="rf-de">De</label>
            <input id="rf-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="grow">
            <label className="f" htmlFor="rf-ate">Até</label>
            <input id="rf-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>
      </div>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {d && (
        <>
          <div className="card stack">
            <div className="eyebrow">No período</div>
            <div className="mutetxt">
              {d.total.chamadas} chamadas de refeição · {d.total.comeram} vezes em que a criança comeu ·{' '}
              {d.total.parcial} parcial · {d.total.recusou} recusa · {d.total.ausente} ausência
            </div>
          </div>
          <div className="eyebrow">Por refeição</div>
          {d.porRefeicao.length === 0 && (
            <p className="mutetxt">Nenhuma chamada de refeição no período. A lista vazia quer dizer que
              ninguém fez a chamada — não que ninguém comeu.</p>
          )}
          <ul className="stack lista">
            {d.porRefeicao.map((r) => (
              <li key={r.refeicao} className="card">
                <b className="ff">{r.refeicao}</b>
                <div className="mutetxt">
                  {r.chamadas} chamada{r.chamadas === 1 ? '' : 's'} · comeu {r.comeram} · parcial {r.parcial} ·
                  recusa {r.recusou} · ausente {r.ausente}{r.dietaAdaptada ? ` · dieta adaptada ${r.dietaAdaptada}` : ''}
                </div>
              </li>
            ))}
          </ul>
          <p className="mutetxt">{d.aviso}</p>
        </>
      )}
    </>
  );
}
