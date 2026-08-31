import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

/**
 * PAINEL DO PLANTÃO — quem está em quê agora.
 *
 * Nasceu de uma pergunta concreta do turno: às 22h o líder precisa saber quem
 * já saiu com uma criança antes de mandar alguém resolver outra coisa. E o
 * educador tem o mesmo direito de saber — por isso a tela é de todo o plantão,
 * não só da chefia.
 *
 * O QUE ESTA TELA NÃO É, e o cuidado é deliberado:
 *
 *  * não é medição. Não há contagem por pessoa, não há "quem fez mais", não há
 *    ordenação por desempenho. A ordem é a do relógio, como o turno acontece;
 *  * não é rastreamento. O sistema não sabe onde ninguém está — sabe o que foi
 *    COMBINADO (§3.3, sem GPS). "Fora da casa" não existe como informação;
 *  * não é histórico. A tela mostra o dia escolhido e nada acumula sobre a
 *    pessoa. Um painel que guardasse o rastro de cada educador viraria, em
 *    três meses, ferramenta de cobrança — e equipe cobrada registra menos.
 *
 * A nota do rodapé vem do servidor de propósito: quem for mexer nesta tela
 * daqui a um ano lê a regra junto com o dado.
 */

interface Pedido {
  id: string;
  atividade: string;
  motivo: string;
  status: string;
  pedidoPor: string;
  solicitadoEm: string;
  semEfeito: boolean;
  aviso: string | null;
}

interface Linha {
  atividadeId: string;
  titulo: string;
  horario: string;
  estado: string;
  rotulo: string;
  responsavel: string;
  acolhido: string | null;
}

const FINAIS = new Set([
  'concluida_no_horario', 'concluida_com_atraso', 'reagendada',
  'cancelada_externamente', 'recusada_pelo_acolhido', 'nao_aplicavel',
  'nao_realizada_saude', 'nao_realizada_ausencia_profissional',
  'nao_realizada_transporte', 'nao_realizada_decisao_institucional',
]);

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Cargos que decidem substituição (§8.3). */
const DECIDE = ['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica', 'coordenador', 'gestor_geral'];

export function PainelPlantao({ houseId, casaLabel, papel }: {
  houseId: string; casaLabel: string; papel: string;
}) {
  const decide = DECIDE.includes(papel);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [recusando, setRecusando] = useState<Pedido | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api<{ linhas: Linha[]; nota: string }>(
        `/activities/shift-board?houseId=${houseId}`);
      setLinhas(r.linhas ?? []);
      setNota(r.nota ?? '');
      setErro('');
      if (decide) {
        // Falhar aqui não pode derrubar o painel: quem abriu a tela veio ver o
        // turno, e o turno continua valendo sem a lista de pedidos.
        try {
          const p = await api<Pedido[]>(`/activities/substitutions?houseId=${houseId}`);
          setPedidos((p ?? []).filter((x) => x.status === 'solicitada'));
        } catch { setPedidos([]); }
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o painel.');
    } finally {
      setCarregando(false);
    }
  }, [houseId, decide]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Quem está ocupado agora fica em cima; o resto do dia continua abaixo, na
  // ordem do relógio. Nada some — o que já passou é o que explica o turno.
  const emAberto = linhas.filter((l) => !FINAIS.has(l.estado));
  const encerradas = linhas.filter((l) => FINAIS.has(l.estado));

  return (
    <>
      <div className="diahead">
        <div>
          <div className="eyebrow" style={{ margin: 0 }}>{casaLabel}</div>
          <h2 style={{ margin: 0 }}>Painel do plantão</h2>
        </div>
        <button className="btn sm ghost" onClick={() => void carregar()} disabled={carregando}>
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      {pedidos.length > 0 && (
        <>
          <div className="eyebrow">Pedidos de substituição aguardando você</div>
          <ol className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {pedidos.map((p) => (
              <li key={p.id} className="card">
                <b className="ff">{p.atividade}</b>
                <div className="mutetxt">{p.pedidoPor} · {p.motivo}</div>
                {/*
                  * O pedido que perdeu o sentido enquanto esperava aparece
                  * explicado, não apenas quebrado no clique. O sistema não
                  * fecha o pedido sozinho — recusar continua sendo decisão de
                  * quem lidera, com motivo.
                  */}
                {p.semEfeito && p.aviso && (
                  <div className="notice c-warn" role="status" style={{ marginTop: 8 }}>
                    {p.aviso}
                  </div>
                )}
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn sm ghost"
                          onClick={() => setRecusando(p)}>
                    Recusar com motivo
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {recusando && (
        <FolhaRecusa
          pedido={recusando}
          onFechar={() => setRecusando(null)}
          onRecusar={async (motivo) => {
            const p = recusando;
            setRecusando(null);
            try {
              await api(`/activities/substitutions/${p.id}/decline`, {
                method: 'POST', body: JSON.stringify({ motivo }),
              });
              await carregar();
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível recusar o pedido.');
            }
          }}
        />
      )}

      {!carregando && linhas.length === 0 && !erro && (
        <div className="card">
          <p className="mutetxt" style={{ margin: 0 }}>
            Nada no painel para hoje. O dia ainda não foi gerado, ou não há atividade nesta unidade.
          </p>
        </div>
      )}

      {emAberto.length > 0 && (
        <>
          <div className="eyebrow">Em aberto agora</div>
          <ol className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {emAberto.map((l) => (
              <li key={l.atividadeId} className="card">
                <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                  <b className="ff">{hhmm(l.horario)}</b>
                  <div className="grow">
                    <b className="ff">{l.titulo}</b>
                    {l.acolhido && <div className="mutetxt">{l.acolhido}</div>}
                  </div>
                </div>
                <div className="row" style={{ gap: 8, marginTop: 6 }}>
                  <span className="estado">{l.rotulo}</span>
                  <span className="mutetxt grow" style={{ textAlign: 'right' }}>
                    {l.responsavel}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {encerradas.length > 0 && (
        <>
          <div className="eyebrow">Já registradas hoje</div>
          <ol className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {encerradas.map((l) => (
              <li key={l.atividadeId} className="card">
                <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                  <span className="mutetxt">{hhmm(l.horario)}</span>
                  <div className="grow">
                    {l.titulo}
                    {l.acolhido && <div className="mutetxt">{l.acolhido}</div>}
                  </div>
                </div>
                <div className="row" style={{ gap: 8, marginTop: 6 }}>
                  <span className="estado">{l.rotulo}</span>
                  <span className="mutetxt grow" style={{ textAlign: 'right' }}>
                    {l.responsavel}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {nota && (
        <p className="mutetxt" style={{ marginTop: 16 }}>{nota}</p>
      )}
    </>
  );
}

/**
 * A folha da recusa.
 *
 * O motivo é obrigatório porque quem pediu vai lê-lo. "Recusado" sozinho, no
 * meio do plantão, é a resposta que faz a pessoa procurar o líder no corredor
 * — ou desistir de pedir da próxima vez.
 */
function FolhaRecusa({ pedido, onFechar, onRecusar }: {
  pedido: Pedido;
  onFechar: () => void;
  onRecusar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState(
    pedido.semEfeito ? 'A atividade já foi concluída antes da autorização.' : '');
  const pode = motivo.trim().length >= 5;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-rec"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-rec">Recusar o pedido</h3>
        <p className="mutetxt">{pedido.atividade} · pedido por {pedido.pedidoPor}</p>

        <label className="f" htmlFor="mrec">
          O motivo <small>— quem pediu vai ler isto</small>
        </label>
        <textarea id="mrec" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: não há substituto disponível neste turno; converse comigo antes do fim do plantão." />

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!pode}
                  onClick={() => onRecusar(motivo.trim())}>
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}
