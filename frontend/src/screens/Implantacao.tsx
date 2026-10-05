import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

/**
 * SAÚDE DA IMPLANTAÇÃO (fase 185, ideia 9 de 30/09; quem vê decidido em 05/10).
 *
 * O que roda sozinho no servidor não tinha tela: o relógio das 5h que faz o
 * dia nascer, o aviso de meia hora antes do fim do plantão, o backup da
 * madrugada, a restauração conferida, o e-mail do convite e a fila do Drive.
 * Quando um deles parava, a primeira notícia era a casa dizendo que o remédio
 * sumiu da tela. Aqui cada um diz quando rodou e se deu certo.
 *
 * O ESTADO VEM DO SERVIDOR, com a frase: a regra de cada sinal mora num lugar
 * só (`implantacao.service.ts`), e esta tela só desenha. A cor é de ESTADO
 * operacional (em dia, atenção, parado), nunca sobre pessoa.
 *
 * Só metadado: quando, se deu certo, quantos. Nenhum endereço, nome ou
 * documento passa por aqui.
 */
interface Sinal {
  cod: string;
  titulo: string;
  estado: 'em_dia' | 'atencao' | 'parado' | 'sem_registro';
  frase: string;
  ultimoEm: string | null;
  ultimoOkEm: string | null;
  falhas7d: number;
}

const ESTADO: Record<Sinal['estado'], { rotulo: string; tom: string }> = {
  em_dia: { rotulo: 'Em dia', tom: 'c-ok' },
  atencao: { rotulo: 'Atenção', tom: 'c-warn' },
  parado: { rotulo: 'Parado', tom: 'c-crit' },
  sem_registro: { rotulo: 'Sem registro', tom: 'c-info' },
};

const quando = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit',
      minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  : null);

export function Implantacao() {
  const [sinais, setSinais] = useState<Sinal[] | null>(null);
  const [erro, setErro] = useState('');
  const [lidoEm, setLidoEm] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const r = await api<{ agora: string; sinais: Sinal[] }>('/implantacao/saude');
      setSinais(r.sinais); setLidoEm(r.agora);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler a saúde da implantação.');
    }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const parados = (sinais ?? []).filter((s) => s.estado === 'parado').length;
  const atencao = (sinais ?? []).filter((s) => s.estado === 'atencao' || s.estado === 'sem_registro').length;

  return (
    <section>
      <div className="diahead">
        <div>
          <div className="eyebrow" style={{ margin: 0 }}>O servidor das oito casas</div>
          <h2>Saúde da implantação</h2>
        </div>
        <button className="btn sm sec" onClick={() => void carregar()}>Ler de novo</button>
      </div>
      <p className="mutetxt">
        O que roda sozinho, sem ninguém apertar botão. Quando algo aqui para, a casa só percebe
        depois: o remédio que não aparece na tela, o convite que não chega.
      </p>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {!sinais && !erro && <p className="mutetxt">Abrindo…</p>}

      {sinais && (
        <div className={`notice ${parados ? 'c-crit' : atencao ? 'c-warn' : 'c-ok'}`} role="status">
          {parados
            ? `${parados} ${parados === 1 ? 'coisa parada' : 'coisas paradas'}. Quem cuida do servidor precisa olhar.`
            : atencao
              ? 'Nada parado, mas há o que conferir.'
              : 'Tudo em dia.'}
          {lidoEm && <> Lido às {quando(lidoEm)?.slice(-5)}.</>}
        </div>
      )}

      <div className="stack">
        {(sinais ?? []).map((s) => (
          <article className="card stack" key={s.cod} aria-labelledby={`t-imp-${s.cod}`}>
            <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <h3 id={`t-imp-${s.cod}`} className="grow" style={{ margin: 0, fontSize: 16 }}>{s.titulo}</h3>
              <span className={`pill ${ESTADO[s.estado].tom}`}>{ESTADO[s.estado].rotulo}</span>
            </div>
            <p style={{ margin: 0 }}>{s.frase}</p>
            {(s.ultimoEm || s.falhas7d > 0) && (
              <p className="mutetxt" style={{ margin: 0 }}>
                {s.ultimoEm && <>Último registro: {quando(s.ultimoEm)}. </>}
                {s.ultimoOkEm && s.ultimoOkEm !== s.ultimoEm && <>Último que deu certo: {quando(s.ultimoOkEm)}. </>}
                {s.falhas7d > 0 && <>Falhas nos últimos sete dias: {s.falhas7d}.</>}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
