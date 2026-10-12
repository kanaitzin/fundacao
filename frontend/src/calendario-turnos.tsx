/**
 * O CALENDÁRIO DAS ATAS E DAS PASSAGENS (fase 206).
 *
 * Pedido de 12/10: quem recebe o plantão via o turno de hoje e mais nada. Para
 * olhar um dia anterior era preciso saber a data e digitá-la no Arquivo. Aqui o
 * mês inteiro aparece de uma vez, cada dia com o turno da manhã e o da noite, e
 * cada turno pintado pela situação da ATA dele. Tocar no turno abre a ATA, para
 * ler e baixar.
 *
 * As cores são as de ESTADO, as mesmas da pílula da ATA (`SITUACAO` na tela da
 * ATA): fechada, fechada com pendência, aberta. Elas respondem se o turno ainda
 * precisa de alguém, nunca como foi o dia, e ao lado de cada cor há sempre a
 * palavra (a legenda, e o nome do botão para quem usa leitor de tela).
 *
 * Os números do mês são da CASA: quantas ATAs, quantas com pendência, quantos
 * episódios. Nenhum número é por pessoa nem por criança.
 *
 * A leitura é a do Arquivo (`/shifts/ata-archive`, recorte do mês), que o
 * servidor já confere por cargo e por casa. O calendário não abre porta nova.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Icone } from './icones';

interface CapaDoTurno {
  ataId: string; plantaoId: string; status: string; pendencias: string | null;
  assinaturasFaltantes: number; fechadaEm: string | null; fechadaPor: string | null;
  aditamentos: number; episodios: number; passagens: number;
}
interface DiaDoMes {
  data: string;
  diurno: CapaDoTurno | null;
  noturno: CapaDoTurno | null;
  geral: { houveContato: boolean } | null;
}
interface MesDoArquivo { de: string; ate: string; dias: DiaDoMes[] }

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/** A situação da ATA, na palavra e na cor: a mesma da pílula da tela da ATA. */
export const SITUACAO_NO_CALENDARIO: Record<string, { rotulo: string; tom: string }> = {
  fechada: { rotulo: 'fechada', tom: 'c-ok' },
  fechada_com_pendencia: { rotulo: 'fechada com pendência', tom: 'c-warn' },
  reaberta: { rotulo: 'reaberta', tom: 'c-warn' },
  rascunho: { rotulo: 'aberta', tom: 'c-info' },
};

const doisDigitos = (n: number) => String(n).padStart(2, '0');
function mesVizinho(primeiro: string, passo: number) {
  const [a, m] = primeiro.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + passo, 1));
  return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-01`;
}
/** O dia de hoje NA INSTITUIÇÃO, e não no fuso do aparelho. */
function hojeNaCasa() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function CalendarioDosTurnos({ houseId, onAbrir, titulo = 'O calendário das ATAs' }: {
  houseId: string;
  /** Abre a ATA (e o plantão) daquele turno. */
  onAbrir: (plantaoId: string, data: string, turno: 'diurno' | 'noturno') => void;
  titulo?: string;
}) {
  const [primeiro, setPrimeiro] = useState('');
  const [mes, setMes] = useState<MesDoArquivo | null>(null);
  const [erro, setErro] = useState('');
  const [buscando, setBuscando] = useState(false);
  const hoje = hojeNaCasa();

  const carregar = useCallback(async (data: string) => {
    setErro(''); setBuscando(true);
    try {
      // Escrita por extenso: é assim que o teste de contrato acha a rota.
      const r = await api<MesDoArquivo>(
        `/shifts/ata-archive?houseId=${houseId}&escala=mes&data=${data}`);
      setMes(r); setPrimeiro(r.de);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o calendário.');
    } finally { setBuscando(false); }
  }, [houseId]);

  useEffect(() => { void carregar(''); }, [carregar]);

  if (!mes) {
    return (
      <div className="card calendario">
        <h3 className="cal-titulo">{titulo}</h3>
        {erro ? <div className="notice c-crit" role="alert">{erro}</div>
          : <p className="mutetxt" style={{ margin: 0 }}>Abrindo o mês…</p>}
      </div>
    );
  }

  const [ano, m] = primeiro.split('-').map(Number);
  const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const recuo = (new Date(Date.UTC(ano, m - 1, 1)).getUTCDay() + 6) % 7;
  const porData = new Map(mes.dias.map((d) => [d.data, d]));
  const atas = mes.dias.flatMap((d) => [d.diurno, d.noturno]).filter(Boolean) as CapaDoTurno[];
  const conta = (f: (a: CapaDoTurno) => boolean) => atas.filter(f).length;
  const soma = (f: (a: CapaDoTurno) => number) => atas.reduce((t, a) => t + (f(a) || 0), 0);
  const numeros = [
    { n: atas.length, rotulo: atas.length === 1 ? 'ATA no mês' : 'ATAs no mês' },
    { n: conta((a) => a.status === 'fechada'), rotulo: 'fechadas', tom: 'c-ok' },
    { n: conta((a) => a.status === 'fechada_com_pendencia' || a.status === 'reaberta'),
      rotulo: 'com pendência', tom: 'c-warn' },
    { n: conta((a) => a.status === 'rascunho'), rotulo: 'abertas', tom: 'c-info' },
    { n: soma((a) => a.passagens), rotulo: 'passagens assinadas' },
    { n: soma((a) => a.episodios), rotulo: 'episódios registrados' },
    { n: soma((a) => a.aditamentos), rotulo: 'adendos' },
    { n: mes.dias.filter((d) => d.geral?.houveContato).length, rotulo: 'noites com chamado à ATA Geral' },
  ];
  const ehEsteMes = hoje.slice(0, 7) === primeiro.slice(0, 7);
  const futuro = primeiro > hoje;

  const turno = (data: string, qual: 'diurno' | 'noturno', a: CapaDoTurno | null) => {
    const nome = qual === 'diurno' ? 'turno diurno' : 'turno noturno';
    const dia = Number(data.slice(8));
    if (!a) {
      return (
        <span className={`cal-turno vazio${data > hoje ? ' depois' : ''}`}
              title={data > hoje ? undefined : `${dia} de ${MESES[m - 1]}, ${nome}: sem ATA`}>
          <Icone nome={qual === 'diurno' ? 'sol' : 'lua'} tamanho={14} />
        </span>
      );
    }
    const s = SITUACAO_NO_CALENDARIO[a.status] ?? { rotulo: a.status, tom: 'c-mute' };
    const extra = [
      a.episodios > 0 ? `${a.episodios} ${a.episodios === 1 ? 'episódio' : 'episódios'}` : '',
      a.aditamentos > 0 ? 'com adendo' : '',
    ].filter(Boolean).join(', ');
    return (
      <button type="button" className={`cal-turno ${s.tom}`}
              aria-label={`${dia} de ${MESES[m - 1]}, ${nome}: ${s.rotulo}${extra ? `, ${extra}` : ''}. Abrir a ATA`}
              title={`${nome}: ${s.rotulo}${extra ? ` · ${extra}` : ''}`}
              onClick={() => onAbrir(a.plantaoId, data, qual)}>
        <Icone nome={qual === 'diurno' ? 'sol' : 'lua'} tamanho={14} />
        {a.episodios > 0 && <span className="cal-marca" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <div className="card calendario" aria-busy={buscando}>
      <div className="cal-topo">
        <h3 className="cal-titulo">{titulo}</h3>
        <div className="cal-mes">
          <button type="button" className="btn sm ghost" aria-label="Mês anterior"
                  onClick={() => carregar(mesVizinho(primeiro, -1))}>
            <Icone nome="voltar" tamanho={16} />
          </button>
          <b className="ff" aria-live="polite">{MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} de {ano}</b>
          <button type="button" className="btn sm ghost" aria-label="Mês seguinte"
                  disabled={ehEsteMes || futuro}
                  onClick={() => carregar(mesVizinho(primeiro, 1))}>
            <Icone nome="avancar" tamanho={16} />
          </button>
          {!ehEsteMes && (
            <button type="button" className="btn sm sec" onClick={() => carregar('')}>Este mês</button>
          )}
        </div>
      </div>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      <ul className="cal-legenda" aria-label="O que cada cor quer dizer">
        <li><span className="cal-amostra c-ok" /> fechada</li>
        <li><span className="cal-amostra c-warn" /> com pendência</li>
        <li><span className="cal-amostra c-info" /> aberta</li>
        <li><span className="cal-amostra vazio" /> sem ATA</li>
        <li><Icone nome="sol" tamanho={14} /> dia</li>
        <li><Icone nome="lua" tamanho={14} /> noite</li>
        <li><span className="cal-marca solta" /> teve episódio</li>
      </ul>

      <div className="cal-grade">
        <div className="cal-semana" aria-hidden="true">
          {SEMANA.map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="cal-dias">
          {Array.from({ length: recuo }, (_, i) => <span key={`v${i}`} className="cal-dia fora" aria-hidden="true" />)}
          {Array.from({ length: diasNoMes }, (_, i) => {
            const data = `${primeiro.slice(0, 7)}-${doisDigitos(i + 1)}`;
            const d = porData.get(data);
            return (
              <div key={data}
                   className={`cal-dia${data === hoje ? ' hoje' : ''}${data > hoje ? ' depois' : ''}`}>
                <span className="cal-num">{i + 1}</span>
                {turno(data, 'diurno', d?.diurno ?? null)}
                {turno(data, 'noturno', d?.noturno ?? null)}
              </div>
            );
          })}
        </div>
      </div>

      <div className="cal-numeros" aria-label={`Os números de ${MESES[m - 1]}`}>
        {numeros.map((x) => (
          <div key={x.rotulo} className={`cal-numero ${x.tom ?? ''}`}>
            <b>{x.n}</b><span>{x.rotulo}</span>
          </div>
        ))}
      </div>
      {atas.length === 0 && (
        <p className="mutetxt" style={{ margin: 0 }}>
          Nenhuma ATA registrada nesta casa em {MESES[m - 1]} de {ano}.
        </p>
      )}
    </div>
  );
}
