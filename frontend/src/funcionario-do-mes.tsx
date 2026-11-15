import { useEffect, useState } from 'react';
import { api } from './api';
import { OQueFalta } from './o-que-falta';
import { diaEHora } from './rotulos';
import { EtiquetaDoCargo } from './cargos';
import {
  MOTIVO_DA_TROCA_MINIMO, PORQUE_MINIMO,
} from '../../backend/src/modules/alignments/funcionario-do-mes.regra';

/**
 * O FUNCIONÁRIO DO MÊS (fase 324, pedido e decidido pelo dono em 14/11).
 *
 * No alto dos Encontros de alinhamento: o da casa aberta, escolhido pela coordenação da
 * casa, e o da Fundação, escolhido pela Coordenação Geral, sempre com o porquê. É
 * reconhecimento, e não nota: nada de número nem de ordem entre pessoas. Trocar a escolha
 * do mês pede o motivo, e a escolha de antes continua à vista em Os meses anteriores.
 */

interface Escolha {
  id: string; mes: string; mesRotulo: string; pessoaId: string; pessoa: string;
  cargo: string; profissao: string | null; porque: string; por: string; em: string;
  casa: string | null; vale: boolean; motivoDaTroca: string | null;
}
interface Resposta {
  mesesQueSeEscolhem: { mes: string; rotulo: string }[];
  daCasa: Escolha[]; daFundacao: Escolha[];
  podeEscolherDaCasa: boolean; podeEscolherDaFundacao: boolean;
}
interface Candidato { id: string; nome: string; cargo: string; profissao: string | null }

function Cartao({ titulo, escolhas, mesAtual }: { titulo: string; escolhas: Escolha[]; mesAtual: string }) {
  const [verAntes, setVerAntes] = useState(false);
  const deAgora = escolhas.find((e) => e.vale && e.mes === mesAtual);
  const antes = escolhas.filter((e) => e !== deAgora);
  return (
    <div className="do-mes">
      <div className="eyebrow">{titulo}</div>
      {deAgora ? (
        <>
          <div><b>{deAgora.pessoa}</b> <EtiquetaDoCargo cargo={deAgora.cargo} profissao={deAgora.profissao} /></div>
          <p style={{ margin: '6px 0' }}>{deAgora.porque}</p>
          <p className="mutetxt" style={{ margin: 0 }}>Escolha de {deAgora.por}, {diaEHora(deAgora.em)}.</p>
          {deAgora.motivoDaTroca && <p className="mutetxt" style={{ margin: 0 }}>Trocada: {deAgora.motivoDaTroca}</p>}
        </>
      ) : <p className="mutetxt" style={{ margin: 0 }}>Ainda sem escolha neste mês.</p>}
      {antes.length > 0 && (
        <button type="button" className="btn ghost sm" aria-expanded={verAntes} onClick={() => setVerAntes(!verAntes)}>
          {verAntes ? 'Fechar os meses anteriores' : 'Os meses anteriores'}
        </button>
      )}
      {verAntes && (
        <ul className="do-mes-antes">
          {antes.map((e) => (
            <li key={e.id}>
              <b>{e.mesRotulo}</b>: {e.pessoa}{e.vale ? '' : ' (trocada depois)'}
              <div className="mutetxt">{e.porque}</div>
              <div className="mutetxt">Escolha de {e.por}, {diaEHora(e.em)}.{e.motivoDaTroca ? ` Trocada: ${e.motivoDaTroca}` : ''}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FuncionarioDoMes({ casaId }: { casaId: string | null }) {
  const [r, setR] = useState<Resposta | null>(null);
  const [erro, setErro] = useState('');
  const [recado, setRecado] = useState('');
  const [folha, setFolha] = useState<'casa' | 'fundacao' | null>(null);

  const carregar = async () => {
    try {
      setR(await api<Resposta>(`/alignments/funcionario-do-mes?houseId=${encodeURIComponent(casaId ?? '')}`));
    } catch (x) { setErro(x instanceof Error ? x.message : 'Não foi possível abrir o funcionário do mês.'); }
  };
  useEffect(() => { void carregar(); }, [casaId]);

  if (erro) return <div className="card"><h3>Funcionário do mês</h3><div className="notice c-crit" role="alert">{erro}</div></div>;
  if (!r) return <div className="card"><h3>Funcionário do mês</h3><p className="mutetxt">Abrindo…</p></div>;
  const mesAtual = r.mesesQueSeEscolhem[0]?.mes ?? '';
  const escolhas = folha === 'casa' ? r.daCasa : r.daFundacao;

  return (
    <div className="card">
      <h3>Funcionário do mês</h3>
      <p className="mutetxt">O reconhecimento de quem trabalha, com o porquê escrito por quem escolheu.</p>
      {recado && <div className="notice c-ok recado-da-vez" role="status">{recado}</div>}
      <div className="do-mes-grade">
        {casaId && <Cartao titulo="Da casa" escolhas={r.daCasa} mesAtual={mesAtual} />}
        <Cartao titulo="Da Fundação" escolhas={r.daFundacao} mesAtual={mesAtual} />
      </div>
      {(r.podeEscolherDaCasa || r.podeEscolherDaFundacao) && (
        <div className="row" style={{ marginTop: 8 }}>
          {r.podeEscolherDaCasa && (
            <button data-acolhe-abre="" className="btn sm" onClick={() => setFolha('casa')}>Escolher o da casa</button>
          )}
          {r.podeEscolherDaFundacao && (
            <button data-acolhe-abre="" className="btn sm" onClick={() => setFolha('fundacao')}>Escolher o da Fundação</button>
          )}
        </div>
      )}
      {folha && (
        <FolhaDoMes casaId={folha === 'casa' ? casaId : null} meses={r.mesesQueSeEscolhem} escolhas={escolhas}
                    onFechar={() => setFolha(null)}
                    onEscolheu={async (aviso) => { setFolha(null); setRecado(aviso); await carregar(); }} />
      )}
    </div>
  );
}

function FolhaDoMes({ casaId, meses, escolhas, onFechar, onEscolheu }: {
  casaId: string | null; meses: { mes: string; rotulo: string }[]; escolhas: Escolha[];
  onFechar: () => void; onEscolheu: (aviso: string) => Promise<void>;
}) {
  const [mes, setMes] = useState(meses[0]?.mes ?? '');
  const [pessoaId, setPessoaId] = useState('');
  const [porque, setPorque] = useState('');
  const [motivo, setMotivo] = useState('');
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    api<{ pessoas: Candidato[] }>(`/alignments/funcionario-do-mes/candidatos?houseId=${encodeURIComponent(casaId ?? '')}`)
      .then((x) => setCandidatos(x.pessoas))
      .catch((x) => { setCandidatos([]); setErro(x instanceof Error ? x.message : 'Não foi possível abrir a lista.'); });
  }, [casaId]);
  const jaTem = escolhas.find((e) => e.vale && e.mes === mes);
  const pode = !!mes && !!pessoaId && porque.trim().length >= PORQUE_MINIMO
    && (!jaTem || motivo.trim().length >= MOTIVO_DA_TROCA_MINIMO) && !salvando;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-do-mes"
         onClick={(x) => { if (x.target === x.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-do-mes">{casaId ? 'Funcionário do mês da casa' : 'Funcionário do mês da Fundação'}</h3>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <p className="mutetxt">A pessoa recebe o aviso e lê o porquê. {casaId ? 'Quem trabalha na casa também lê.' : 'As oito casas também leem.'}</p>
        <label className="f">O mês</label>
        <div className="opts">
          {meses.map((m) => (
            <button key={m.mes} type="button" className="opt c-info" aria-pressed={mes === m.mes}
                    onClick={() => setMes(m.mes)}>{m.rotulo}</button>
          ))}
        </div>
        <label className="f" htmlFor="do-mes-pessoa">Quem</label>
        <select id="do-mes-pessoa" value={pessoaId} onChange={(x) => setPessoaId(x.target.value)}>
          <option value="">{candidatos ? 'Escolha a pessoa' : 'Abrindo…'}</option>
          {(candidatos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <label className="f" htmlFor="do-mes-porque">O porquê</label>
        <textarea id="do-mes-porque" value={porque} maxLength={2000} onChange={(x) => setPorque(x.target.value)}
                  placeholder="O que a pessoa fez neste mês, com exemplos do dia a dia." />
        {jaTem && (
          <>
            <div className="notice c-info" role="status">
              Este mês já tem a escolha: {jaTem.pessoa}. Ela continua registrada, e a nova vale a partir de agora.
            </div>
            <label className="f" htmlFor="do-mes-motivo">Por que trocar</label>
            <textarea id="do-mes-motivo" value={motivo} maxLength={2000} onChange={(x) => setMotivo(x.target.value)} />
          </>
        )}
        <OQueFalta itens={[
          !pessoaId && 'escolher a pessoa',
          porque.trim().length < PORQUE_MINIMO && `escrever o porquê, com pelo menos ${PORQUE_MINIMO} letras`,
          !!jaTem && motivo.trim().length < MOTIVO_DA_TROCA_MINIMO && `escrever por que trocar, com pelo menos ${MOTIVO_DA_TROCA_MINIMO} letras`,
        ]} />
        <div className="row rodape">
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!pode} onClick={async () => {
            setSalvando(true); setErro('');
            try {
              const r = await api<{ aviso: string }>('/alignments/funcionario-do-mes', {
                method: 'POST',
                body: JSON.stringify({ houseId: casaId, mes, pessoaId, porque: porque.trim(), motivoDaTroca: motivo.trim() || undefined }),
              });
              await onEscolheu(r.aviso);
            } catch (x) { setErro(x instanceof Error ? x.message : 'Não foi possível registrar a escolha.'); }
            finally { setSalvando(false); }
          }}>{salvando ? 'Registrando…' : 'Registrar a escolha'}</button>
        </div>
      </div>
    </div>
  );
}
