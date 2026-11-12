import { quantos } from '../../../backend/src/kernel/common/quantos';
import { useEffect, useState } from 'react';
import { QUEM_LE_O_QUE_MUDOU } from '../../../backend/src/modules/reports/o-que-mudou.regra';
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
  ocorrencias: { id: string; rotulo: string; quando: string; situacao: string; restrita: boolean; criancas: string | null;
                 por?: string | null }[];
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

export function OQueMudou({ pessoa, papel, houseId, irPara, alcanca }: {
  pessoa: string; houseId: string; irPara: (aba: string) => void;
  /** O cargo de quem abre: fora da lista, o cartão nem pede a folha (fase 190). */
  papel: string;
  /** A porta só aparece para quem alcança a tela: o educador não abre a Saúde. */
  alcanca: (aba: string) => boolean;
}) {
  const [r, setR] = useState<OQueMudouResposta | null>(null);
  /*
   * TRÊS FORMAS (fase 315, decisão de 12/11: "cartões curtos no alto"). No celular
   * do educador o cartão aberto ocupava mais de uma tela, e a primeira tarefa da
   * linha do dia só aparecia depois de duas telas de rolagem.
   *   curto  - quem ainda não leu: quantas coisas mudaram, o remédio que mudou e o
   *            recado que ficou para o turno, com "Ver o que mudou";
   *   aberto - tudo, como sempre foi, com o "Entendi" no fim;
   *   lido   - a linha que reabre.
   * O "Entendi" só existe na forma aberta: ninguém confirma que leu o que não abriu.
   */
  const [modo, setModo] = useState<'curto' | 'aberto' | 'lido'>('lido');

  useEffect(() => {
    let vivo = true;
    setR(null);
    /* Cargo que não faz plantão (o gestor) não pede: o servidor recusaria. */
    if (!QUEM_LE_O_QUE_MUDOU.includes(papel)) return () => { vivo = false; };
    api<OQueMudouResposta>(`/reports/o-que-mudou?houseId=${houseId}`)
      .then((x) => {
        if (!vivo) return;
        setR(x);
        const tem = x.ocorrencias.length + x.remedios.length > 0 || !!x.ata;
        setModo(tem && !jaLeu(chave(pessoa, houseId, x.desde)) ? 'curto' : 'lido');
      })
      .catch(() => { if (vivo) setR(null); });
    return () => { vivo = false; };
  }, [houseId, pessoa, papel]);

  if (!r) return null;
  const n = r.ocorrencias.length + r.remedios.length;
  const desde = r.base === 'plantao'
    ? `Desde o fim do seu último plantão, ${quando(r.desde)}.`
    : 'Nas últimas 24 horas. Você não está na escala desta casa.';

  if (modo === 'lido') {
    return (
      <button className="btn sec block" onClick={() => setModo('aberto')}>
        O que mudou desde o seu último plantão{n ? ` (${n})` : ''}
      </button>
    );
  }

  if (modo === 'curto') {
    const partes = [
      r.ocorrencias.length > 0 && quantos(r.ocorrencias.length, 'ocorrência', 'ocorrências'),
      r.remedios.length > 0 && quantos(r.remedios.length, 'remédio que mudou', 'remédios que mudaram'),
      r.ata && 'a ATA anterior',
    ].filter((x): x is string => !!x);
    const resumo = partes.length > 1
      ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
      : (partes[0] ?? '');
    return (
      <section className="card stack o-que-mudou o-que-mudou-curto" aria-labelledby="t-o-que-mudou">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="grow">
            <h3 id="t-o-que-mudou" style={{ margin: 0 }}>O que mudou desde o seu último plantão</h3>
            <p className="mutetxt" style={{ margin: '2px 0 0' }}>
              {resumo ? `${resumo.charAt(0).toUpperCase()}${resumo.slice(1)}. ` : ''}{desde}
            </p>
          </div>
          <span className="pill c-info">Para ler</span>
        </div>
        {/* O remédio que mudou e o recado do turno ficam à vista mesmo no cartão curto:
            são o que não pode esperar um toque. */}
        {r.remedios.length > 0 && (
          <ul className="lista">
            {r.remedios.map((m, i) => (
              <li key={i}><b>{m.crianca}</b> · {m.medicamento}{m.dose && <> {m.dose}</>} {MUDANCA[m.tipo]}</li>
            ))}
          </ul>
        )}
        {r.ata?.pendencias && (
          <div className="notice c-warn" style={{ margin: 0 }}>
            <b>O que ficou para o próximo turno:</b> {r.ata.pendencias}
          </div>
        )}
        <button className="btn sec" aria-expanded={false} onClick={() => setModo('aberto')}>Ver o que mudou</button>
      </section>
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
                  <div className="mutetxt">{quando(o.quando)}{o.por && <> · registrada por {o.por}</>} · {o.situacao}</div>
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

      <button className="btn block" onClick={() => { marcarLido(chave(pessoa, houseId, r.desde)); setModo('lido'); }}>
        Entendi
      </button>
    </section>
  );
}
