import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * O QUE MUDOU DESDE O MEU ÚLTIMO PLANTÃO (fase 186, ideia 1 de 30/09; o que
 * entra decidido em 05/10: ocorrências, a ATA anterior e remédio novo,
 * suspenso ou mudado).
 *
 * Um CARTÃO no alto do Dia, e não uma janela por cima da tela: quem entra às
 * 23h com uma criança chorando ao lado não pode ter de fechar nada para
 * chegar ao turno. Ele vem aberto na primeira vez de cada plantão; depois de
 * "Entendi" vira uma linha que reabre. O "já li" é desta pessoa neste aparelho, e só
 * isso: não há registro de quem leu, porque a folha não pede ciência.
 *
 * Tudo aqui o servidor leu com a identidade de quem pergunta: o que o cargo
 * não lê não chega. E a folha avisa e aponta; o detalhe se lê em cada tela.
 */
export interface OQueMudouResposta {
  desde: string;
  base: 'plantao' | 'ultimas_24h';
  limitado: boolean;
  ocorrencias: { id: string; rotulo: string; quando: string; situacao: string; restrita: boolean; criancas: string | null }[];
  ata: null | {
    data: string; turno: string; situacao: string; fechadaPor: string | null;
    pendencias: string | null; linhas: number;
    ultimas: { quem: string | null; quando: string; texto: string }[];
  };
  remedios: { tipo: 'novo' | 'suspenso' | 'terminou' | 'so_enfermagem' | 'liberado'; crianca: string;
    medicamento: string; dose: string | null; quando: string }[];
}

const MUDANCA: Record<OQueMudouResposta['remedios'][number]['tipo'], string> = {
  novo: 'começou',
  suspenso: 'foi suspenso',
  terminou: 'terminou',
  so_enfermagem: 'passou a ser só da Enfermagem',
  liberado: 'deixou de ser só da Enfermagem',
};

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
}).replace('.,', ',');

/* Por PESSOA, casa e plantão: o tablet da casa é de várias pessoas, e o que uma leu
   não pode sumir para a colega que entra depois. */
const chave = (pessoa: string, houseId: string, desde: string) =>
  `rede-acolher.o-que-mudou.${pessoa}.${houseId}.${desde}`;
const jaLeu = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const marcarLido = (k: string) => { try { localStorage.setItem(k, '1'); } catch { /* sem armazenamento: abre de novo */ } };

export function OQueMudou({ pessoa, houseId, irPara, alcanca }: {
  pessoa: string; houseId: string; irPara: (aba: string) => void;
  /** A porta só aparece para quem alcança a tela: o educador não abre a Saúde. */
  alcanca: (aba: string) => boolean;
}) {
  const [r, setR] = useState<OQueMudouResposta | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    setR(null);
    /* 403 é cargo que não faz plantão (o gestor): a linha simplesmente não aparece. */
    api<OQueMudouResposta>(`/reports/o-que-mudou?houseId=${houseId}`)
      .then((x) => {
        if (!vivo) return;
        setR(x);
        const tem = x.ocorrencias.length + x.remedios.length > 0 || !!x.ata;
        setAberto(tem && !jaLeu(chave(pessoa, houseId, x.desde)));
      })
      .catch(() => { if (vivo) setR(null); });
    return () => { vivo = false; };
  }, [houseId, pessoa]);

  if (!r) return null;
  const n = r.ocorrencias.length + r.remedios.length;
  const desde = r.base === 'plantao'
    ? `Desde o fim do seu último plantão, ${quando(r.desde)}.`
    : 'Nas últimas 24 horas. Você não está na escala desta casa.';

  if (!aberto) {
    return (
      <button className="btn sec block" onClick={() => setAberto(true)}>
        O que mudou desde o seu último plantão{n ? ` (${n})` : ''}
      </button>
    );
  }

  return (
    <section className="card stack o-que-mudou" aria-labelledby="t-o-que-mudou">
      <div>
        <h3 id="t-o-que-mudou" style={{ margin: 0 }}>O que mudou desde o seu último plantão</h3>
        <p className="mutetxt" style={{ margin: '2px 0 0' }}>
          {desde}{r.limitado && ' Seu último plantão foi há mais de uma semana: aqui está a última semana.'}
        </p>
      </div>

      <div className="stack">
        <div className="eyebrow" style={{ margin: 0 }}>Ocorrências · {r.ocorrencias.length}</div>
        {r.ocorrencias.length === 0
          ? <p className="mutetxt" style={{ margin: 0 }}>Nenhuma ocorrência registrada no período.</p>
          : (
            <ul className="lista">
              {r.ocorrencias.map((o) => (
                <li key={o.id}>
                  <b>{o.rotulo}</b>{o.criancas && <> · {o.criancas}</>}
                  <div className="mutetxt">{quando(o.quando)} · {o.situacao}</div>
                </li>
              ))}
            </ul>
          )}
        {r.ocorrencias.length > 0 && alcanca('ocorrencias') && (
          <button className="btn sm sec" onClick={() => irPara('ocorrencias')}>Abrir as ocorrências</button>
        )}
      </div>

      <div className="stack">
        <div className="eyebrow" style={{ margin: 0 }}>A ATA anterior</div>
        {!r.ata
          ? <p className="mutetxt" style={{ margin: 0 }}>Ainda não há plantão anterior registrado nesta casa.</p>
          : (
            <>
              <p style={{ margin: 0 }}>
                {new Date(`${r.ata.data}T12:00:00-03:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                {' · '}{r.ata.turno === 'noturno' ? 'noturno' : 'diurno'} · {r.ata.situacao}
                {r.ata.fechadaPor && <>, por {r.ata.fechadaPor}</>} · {r.ata.linhas} {r.ata.linhas === 1 ? 'linha' : 'linhas'} da equipe
              </p>
              {r.ata.pendencias && (
                <div className="notice c-warn" style={{ margin: 0 }}>
                  <b>O que ficou para o próximo turno:</b> {r.ata.pendencias}
                </div>
              )}
              {r.ata.ultimas.length > 0 && (
                <ul className="lista">
                  {r.ata.ultimas.map((u, i) => (
                    <li key={i}>
                      {u.texto}
                      <div className="mutetxt">{u.quem ?? 'Equipe'} · {quando(u.quando)}</div>
                    </li>
                  ))}
                </ul>
              )}
              {alcanca('ata') && <button className="btn sm sec" onClick={() => irPara('ata')}>Abrir a ATA</button>}
            </>
          )}
      </div>

      <div className="stack">
        <div className="eyebrow" style={{ margin: 0 }}>Remédios · {r.remedios.length}</div>
        {r.remedios.length === 0
          ? <p className="mutetxt" style={{ margin: 0 }}>Nenhum remédio começou, mudou ou foi suspenso no período.</p>
          : (
            <ul className="lista">
              {r.remedios.map((m, i) => (
                <li key={i}>
                  <b>{m.crianca}</b> · {m.medicamento}{m.dose && <> {m.dose}</>} {MUDANCA[m.tipo]}
                  <div className="mutetxt">{quando(m.quando)}</div>
                </li>
              ))}
            </ul>
          )}
        {r.remedios.length > 0 && alcanca('saude') && (
          <button className="btn sm sec" onClick={() => irPara('saude')}>Abrir a Saúde</button>
        )}
      </div>

      <button className="btn block" onClick={() => { marcarLido(chave(pessoa, houseId, r.desde)); setAberto(false); }}>
        Entendi
      </button>
    </section>
  );
}
