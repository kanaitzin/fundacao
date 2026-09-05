import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

/**
 * O TRABALHO SOCIAL — a outra leitura das oito casas.
 *
 * O Gestor Geral responde por todas e não vai abrir a grade de medicação de
 * nenhuma. O que ele precisa é do que o acolhimento produziu: quantas crianças
 * estão acolhidas, quantas entraram e saíram, e o que aconteceu de bom —
 * passou de ano, terminou o Médio, entrou no curso, assinou a primeira
 * carteira.
 *
 * **O que esta tela recusa a fazer, e a recusa é o desenho:**
 *
 *  * as casas aparecem na ordem do CADASTRO, nunca por resultado. Ordenar por
 *    marcos parece mais útil e é um ranking com outro nome — e a casa que
 *    recebe adolescentes com medida protetiva recente não está na mesma
 *    corrida da casa-lar com quatro crianças pequenas;
 *  * nada de média, meta, percentual de sucesso ou "casa destaque". O número
 *    de cada casa se lê ao lado do número de acolhidos dela;
 *  * ausência de marco não é dado. A criança sem linha aqui não fracassou:
 *    ela pode ter passado o ano inteiro sobrevivendo a uma coisa que não cabe
 *    em categoria — e é justamente essa que o trabalho da casa mais tocou.
 */
interface Casa {
  id: string; codigo: string; nome: string;
  acolhidos: number; capacidade: number;
  entradas: number; saidas: number; ocorrencias: number; marcos: number;
}

interface Panorama {
  periodo: { de: string; ate: string };
  casas: Casa[];
  total: {
    casas: number; acolhidos: number; capacidade: number;
    entradas: number; saidas: number; ocorrencias: number; marcos: number;
  };
  marcosPorTipo: { cod: string; label: string; icone: string; n: number }[];
  aviso: string;
}

interface Marco {
  id: string; acolhidoId: string; acolhido: string; casa: string;
  tipo: string; tipoRotulo: string; icone: string;
  quando: string; descricao: string; instituicao: string | null;
  temComprovante: boolean; por: string;
}

const dia = (iso: string) =>
  new Date(String(iso).length <= 10 ? `${iso}T12:00:00-03:00` : iso)
    .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export function TrabalhoSocial({ papel }: { papel: string }) {
  const [p, setP] = useState<Panorama | null>(null);
  const [marcos, setMarcos] = useState<Marco[] | null>(null);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [tipo, setTipo] = useState('');
  const [pessoa, setPessoa] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    /*
     * A rota vai por EXTENSO, com os parâmetros na query string — e não
     * montada numa variável. O `contrato-rotas.spec` lê o código para conferir
     * cada chamada da tela contra as rotas do servidor, e uma rota escondida
     * numa variável some do conferidor. É a mesma lição da fase 47.
     */
    const q = [de && `de=${de}`, ate && `ate=${ate}`].filter(Boolean).join('&');
    try {
      setP(await api<Panorama>(`/impacto/panorama?${q}`));
      setMarcos(await api<Marco[]>(
        `/impacto/marcos?${[q, tipo && `tipo=${tipo}`].filter(Boolean).join('&')}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o panorama.');
    }
  }, [de, ate, tipo]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (pessoa) return <Trajetoria personId={pessoa} onVoltar={() => setPessoa(null)} />;
  if (erro) return <div className="notice c-crit" role="alert">{erro}</div>;
  if (!p) return <p className="mutetxt">Carregando…</p>;

  return (
    <>
      <div className="eyebrow">Fundação · {p.total.casas} casas</div>
      <h2>O trabalho social</h2>
      <p className="mutetxt">
        De {dia(p.periodo.de)} a {dia(p.periodo.ate)}. Esta é a leitura do que o
        acolhimento produziu — a operação do dia fica nas telas da casa.
      </p>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className="f grow" htmlFor="ts-de">De
          <input id="ts-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="f grow" htmlFor="ts-ate">Até
          <input id="ts-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
      </div>

      {/* ------------------------------------------------------------ total */}
      {/* `painel`/`tile` é o mesmo bloco de números do painel da Enfermagem:
        * a cor comunica CATEGORIA, e nunca julgamento sobre a casa (regra 7). */}
      <div className="painel">
        <div className="tile c-info"><b>{p.total.acolhidos}</b>
          <span>acolhidos agora, em {p.total.capacidade} vagas</span></div>
        <div className="tile c-info"><b>{p.total.entradas}</b>
          <span>entradas no período</span></div>
        <div className="tile c-info"><b>{p.total.saidas}</b>
          <span>saídas no período</span></div>
        <div className="tile c-ok"><b>{p.total.marcos}</b>
          <span>conquistas registradas</span></div>
      </div>

      {/* ------------------------------------------------- o que aconteceu */}
      <div className="eyebrow">O que aconteceu de bom</div>
      {!p.marcosPorTipo.length && (
        <p className="mutetxt">
          Nada registrado neste período. Isso diz que ninguém escreveu — não diz que
          não aconteceu.
        </p>
      )}
      <div className="stack">
        {p.marcosPorTipo.map((t) => (
          <button key={t.cod} className="card row"
                  onClick={() => setTipo(tipo === t.cod ? '' : t.cod)}>
            <span aria-hidden="true">{t.icone}</span>
            <b className="ff grow" style={{ textAlign: 'left' }}>{t.label}</b>
            <span className={`pill ${tipo === t.cod ? 'c-ok' : 'c-info'}`}>{t.n}</span>
          </button>
        ))}
      </div>

      {/* -------------------------------------------------------- as casas */}
      <div className="eyebrow" style={{ marginTop: 16 }}>Casa a casa</div>
      <p className="mutetxt">{p.aviso}</p>
      <div className="stack">
        {p.casas.map((c) => (
          <div key={c.id} className="card">
            <div className="row">
              <b className="ff grow">{c.codigo} — {c.nome}</b>
              <span className="pill c-info">{c.acolhidos} de {c.capacidade}</span>
            </div>
            <div className="mutetxt">
              {c.entradas} entrada(s) · {c.saidas} saída(s) · {c.ocorrencias} ocorrência(s)
              {' · '}{c.marcos} conquista(s)
            </div>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------ quem conquistou */}
      <div className="eyebrow" style={{ marginTop: 16 }}>
        Quem conquistou {tipo ? '· filtrado' : ''}
      </div>
      <p className="mutetxt">
        Por data, e não por criança com mais conquistas. Toque no nome para ver a
        trajetória dela.
      </p>
      <div className="stack">
        {!(marcos ?? []).length && <p className="mutetxt">Nada no período.</p>}
        {(marcos ?? []).map((m) => (
          <button key={m.id} className="card" style={{ textAlign: 'left' }}
                  onClick={() => setPessoa(m.acolhidoId)}>
            <div className="row">
              <span aria-hidden="true">{m.icone}</span>
              <b className="ff grow">{m.acolhido}</b>
              <span className="pill c-info">{m.casa}</span>
            </div>
            <div><b>{m.tipoRotulo}</b> · {dia(m.quando)}</div>
            <div className="mutetxt">{m.descricao}</div>
            {m.instituicao && <div className="mutetxt">{m.instituicao}</div>}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * A TRAJETÓRIA DE UMA CRIANÇA.
 *
 * O que foi conquistado, e as casas por onde ela passou. Saúde, ocorrência e
 * conteúdo judicial não entram: para isso existem as telas do caso, com o
 * alcance de quem cuida dele. Uma visão de impacto que abrisse o prontuário
 * viraria outra coisa.
 */
function Trajetoria({ personId, onVoltar }: { personId: string; onVoltar: () => void }) {
  const [t, setT] = useState<any>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api(`/impacto/trajetoria/${personId}`).then(setT)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível abrir.'));
  }, [personId]);

  if (erro) return (<><button className="btn sm ghost" onClick={onVoltar}>← Voltar</button>
    <div className="notice c-crit" role="alert">{erro}</div></>);
  if (!t) return <p className="mutetxt">Carregando…</p>;

  return (
    <>
      <button className="btn sm ghost" onClick={onVoltar}>← O trabalho social</button>
      <h2>{t.acolhido}</h2>
      <div className="mutetxt">
        Acolhida desde {dia(t.acolhidoDesde)} ·{' '}
        {t.casasPorOndePassou.map((c: any) => c.casa).join(' → ')}
      </div>

      <div className="eyebrow" style={{ marginTop: 12 }}>
        O que ela conquistou · {t.marcos.length}
      </div>
      {!t.marcos.length && (
        <p className="mutetxt">
          Nada registrado ainda. Isso não é uma avaliação dela: é a informação de que
          ninguém escreveu.
        </p>
      )}
      <div className="stack">
        {t.marcos.map((m: any) => (
          <div key={m.id} className="card">
            <div className="row">
              <span aria-hidden="true">{m.icone}</span>
              <b className="ff grow">{m.tipoRotulo}</b>
              <span className="pill c-info">{dia(m.quando)}</span>
            </div>
            <div>{m.descricao}</div>
            {m.instituicao && <div className="mutetxt">{m.instituicao}</div>}
            {m.temComprovante && <div className="mutetxt">📎 comprovante anexado</div>}
            <div className="mutetxt">registrado por {m.por}</div>
          </div>
        ))}
      </div>
      <p className="mutetxt" style={{ marginTop: 12 }}>{t.aviso}</p>
    </>
  );
}
