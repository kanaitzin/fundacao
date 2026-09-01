import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * O PAINEL DAS UNIDADES (§18.1–§18.3).
 *
 * Duas rotas existiam desde a fase 6 e nunca tiveram tela: `GET /reports/panel`
 * e `GET /reports/house-monthly`. A coordenação respondia "quantos estão na
 * casa?" e "quantas ATAs fecharam em agosto?" abrindo tela por tela, ou
 * perguntando a alguém.
 *
 * TRÊS COISAS QUE ESTA TELA FAZ DE PROPÓSITO:
 *
 *  * **não ordena por número, nunca.** Os cartões saem na ordem do código da
 *    casa, como o servidor os devolve. Uma lista ordenada por ocorrências vira,
 *    em três meses, cobrança sobre a equipe que REGISTRA mais — e o efeito
 *    disso é registrar menos. Isso é o §3.3, e é a razão de não haver aqui
 *    nenhum "maior", "menor" ou destaque de topo;
 *  * **número não vira cor de julgamento.** A única tarja de alerta é a
 *    ocupação acima do limite, que é um fato operacional com consequência
 *    imediata — falta cama. O resto é texto;
 *  * **ausência de registro não é fato.** Um mês sem ocorrência registrada não
 *    é um mês bom nem ruim; a folha escreve isso por extenso, para que ninguém
 *    leia o zero como elogio nem como suspeita.
 *
 * E nada aqui conta por pessoa: não existe "quantos registros a Fulana fez".
 */

interface Cartao {
  id: string; codigo: string; nome: string;
  ocupacao: { ativos: number; limite: number; acimaDoLimite: boolean };
  entradas30d: number;
  transferenciasAguardando: number | null;
  acompanhamentosAbertos: number | null;
  arquivoComFalha: number | null;
}

interface Mensal {
  mes: string;
  ocupacao: { ativosHoje: number };
  fluxo: { entradas: number; saidas: number };
  'ocorrências': number | null;
  acompanhamentos: { aprovados: number | null; abertos: number | null };
  atasFechadas: number | null;
  documentosArquivados: number | null;
  nota: string;
}

/** O mês corrente na instituição, não no relógio de quem abriu a tela. */
const mesDaInstituicao = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
}).format(new Date()).slice(0, 7);

const mesPorExtenso = (mes: string) => {
  const d = new Date(`${mes}-01T12:00:00`);
  return Number.isNaN(d.getTime()) ? mes
    : d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

/** Um número que pode não existir. `null` = o módulo dono da conta saiu. */
function Conta({ rotulo, valor, ausente }: {
  rotulo: string; valor: number | null; ausente?: string;
}) {
  if (valor === null) {
    return (
      <li>
        <b className="ff">{rotulo}</b>
        <div className="mutetxt">{ausente ?? 'Este módulo não está instalado nesta versão.'}</div>
      </li>
    );
  }
  return (
    <li className="row">
      <span className="grow">{rotulo}</span>
      <b className="ff">{valor}</b>
    </li>
  );
}

export function Painel({ houseId, casaLabel }: { houseId: string; casaLabel: string }) {
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [mes, setMes] = useState(mesDaInstituicao());
  const [aberta, setAberta] = useState<Cartao | null>(null);
  const [mensal, setMensal] = useState<Mensal | null>(null);
  const [erro, setErro] = useState('');
  const [erroMes, setErroMes] = useState('');

  useEffect(() => {
    (async () => {
      setErro('');
      try {
        const lista = await api<Cartao[]>('/reports/panel');
        setCartoes(lista);
        // Quem alcança uma casa só não deveria ter de escolher qual abrir.
        setAberta((atual) => atual ?? lista.find((c) => c.id === houseId) ?? lista[0] ?? null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível abrir o painel.');
      }
    })();
  }, [houseId]);

  useEffect(() => {
    if (!aberta) return;
    (async () => {
      setErroMes(''); setMensal(null);
      try {
        setMensal(await api<Mensal>(
          `/reports/house-monthly?houseId=${aberta.id}&mes=${mes}`));
      } catch (e) {
        setErroMes(e instanceof Error ? e.message : 'Não foi possível abrir o quadro do mês.');
      }
    })();
  }, [aberta, mes]);

  if (erro) return <div className="notice c-crit" role="alert">{erro}</div>;

  return (
    <>
      <div className="diahead">
        <div>
          <h2>Painel das unidades</h2>
          <div className="mutetxt">{casaLabel}</div>
        </div>
      </div>

      <div className="notice c-info">
        As unidades aparecem <b>na ordem do código</b>, sempre. Nenhuma lista aqui é ordenada
        por número: casa não se compara com casa, e ordenar por ocorrências viraria cobrança
        sobre quem registra mais.
      </div>

      <div className="eyebrow">Agora · {cartoes.length} unidade(s) no seu alcance</div>
      <div className="stack">
        {cartoes.length === 0 && (
          <p className="mutetxt">Nenhuma unidade no seu alcance.</p>
        )}
        {cartoes.map((c) => (
          <article className={`card stack${aberta?.id === c.id ? ' raise' : ''}`} key={c.id}>
            <div className="row">
              <div className="grow">
                <b className="ff">{c.codigo} · {c.nome}</b>
                <div className="mutetxt">
                  {c.ocupacao.ativos} de {c.ocupacao.limite} acolhidos ·
                  {' '}{c.entradas30d} entrada(s) em 30 dias
                </div>
              </div>
              <button className="btn sm ghost" onClick={() => setAberta(c)}>
                {aberta?.id === c.id ? 'Aberta' : 'Abrir o mês'}
              </button>
            </div>

            {/* A única tarja: falta cama hoje. É fato operacional, não juízo. */}
            {c.ocupacao.acimaDoLimite && (
              <div className="notice c-warn" role="status">
                Acima do limite da unidade. A admissão acima do teto é decisão registrada, com
                justificativa — e continua sendo um problema de vaga, não da equipe.
              </div>
            )}

            <ul className="lista">
              <Conta rotulo="Transferências aguardando decisão"
                     valor={c.transferenciasAguardando} />
              <Conta rotulo="Acompanhamentos em aberto" valor={c.acompanhamentosAbertos} />
              <Conta rotulo="Cópias que falharam no arquivo" valor={c.arquivoComFalha} />
            </ul>
          </article>
        ))}
      </div>

      {aberta && (
        <>
          <div className="eyebrow" style={{ marginTop: 16 }}>
            O mês de {aberta.codigo}
          </div>
          <div className="card stack">
            <label className="f" htmlFor="painel-mes">Mês</label>
            <input id="painel-mes" type="month" value={mes}
                   onChange={(e) => setMes(e.target.value)} />

            {erroMes && <div className="notice c-crit" role="alert">{erroMes}</div>}

            {!mensal && !erroMes && <p className="mutetxt">Abrindo {mesPorExtenso(mes)}…</p>}

            {mensal && (
              <>
                <b className="ff">{mesPorExtenso(mensal.mes)}</b>
                <ul className="lista">
                  <li className="row">
                    <span className="grow">Acolhidos na casa hoje</span>
                    <b className="ff">{mensal.ocupacao.ativosHoje}</b>
                  </li>
                  <li className="row">
                    <span className="grow">Entradas no mês</span>
                    <b className="ff">{mensal.fluxo.entradas}</b>
                  </li>
                  <li className="row">
                    <span className="grow">Saídas no mês</span>
                    <b className="ff">{mensal.fluxo.saidas}</b>
                  </li>
                  <Conta rotulo="Ocorrências registradas" valor={mensal['ocorrências']} />
                  <Conta rotulo="Acompanhamentos aprovados"
                         valor={mensal.acompanhamentos.aprovados} />
                  <Conta rotulo="Acompanhamentos em aberto"
                         valor={mensal.acompanhamentos.abertos} />
                  <Conta rotulo="ATAs fechadas" valor={mensal.atasFechadas} />
                  <Conta rotulo="Documentos arquivados" valor={mensal.documentosArquivados} />
                </ul>
                <p className="mutetxt" style={{ margin: 0 }}>{mensal.nota}</p>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
