import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { FolhaDocumento } from '../documentos';
import type { ArquivoGerado } from '../documentos';
import type { DocumentoWord } from '../docx';

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

/**
 * Uma mudança do limite da unidade.
 *
 * `POST /houses/:id/capacity` e `GET /houses/:id/capacity-history` existiam
 * desde a fase 1 sem tela nenhuma: as oito casas nasceram com 20, que é o
 * número praticado, e não havia por onde mudar. A tarja "acima do limite" na
 * admissão apontava para um teto que ninguém conseguia corrigir quando a
 * unidade de fato passava a operar com outro.
 *
 * Mudar exige motivo escrito, e a mudança não some: um dia alguém vai precisar
 * explicar, numa inspeção ou numa audiência, por que aquela casa passou a
 * receber 22 — e a resposta não pode ser "não sei, já estava assim".
 */
interface MudancaDeLimite {
  de: number; para: number; motivo: string; autor: string; em: string;
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

/** Uma data com hora, para ler numa linha de histórico. */
const quandoDia = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR',
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo' });
};

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

export function Painel({ houseId, casaLabel, papel }: {
  houseId: string; casaLabel: string; papel: string;
}) {
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [mes, setMes] = useState(mesDaInstituicao());
  const [aberta, setAberta] = useState<Cartao | null>(null);
  const [mensal, setMensal] = useState<Mensal | null>(null);
  const [erro, setErro] = useState('');
  const [erroMes, setErroMes] = useState('');
  const [aviso, setAviso] = useState('');
  /** Alterar o limite da unidade (§ capacidade) e o histórico das mudanças. */
  const [mudandoLimite, setMudandoLimite] = useState(false);
  const [limites, setLimites] = useState<MudancaDeLimite[]>([]);
  /** A folha do trabalho social desta casa, quando pedida. */
  const [documento, setDocumento] = useState<DocumentoWord | null>(null);

  /* Quem altera o limite da unidade — a mesma lista de `HousesService.
     setCapacity`. Esconder o botão é gentileza; o servidor recusa por baixo. */
  const alteraLimite = ['coordenador', 'gestor_geral'].includes(papel);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const lista = await api<Cartao[]>('/reports/panel');
      setCartoes(lista);
      // Quem alcança uma casa só não deveria ter de escolher qual abrir.
      setAberta((atual) => {
        const alvo = atual
          ? lista.find((c) => c.id === atual.id) ?? null
          : lista.find((c) => c.id === houseId) ?? lista[0] ?? null;
        return alvo;
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o painel.');
    }
  }, [houseId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!aberta) return;
    // O histórico do limite não trava o painel: falhar aqui só o esconde.
    api<MudancaDeLimite[]>(`/houses/${aberta.id}/capacity-history`)
      .then(setLimites).catch(() => setLimites([]));
  }, [aberta]);

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

      {/*
        * O RELATÓRIO DO TRABALHO DESTA CASA.
        *
        * A coordenação responde por estas vinte crianças e é quem vai à reunião
        * de rede e à audiência concentrada — o documento sobre o trabalho que
        * ela mesma fez é dela. A visão das oito continua sendo do Gestor Geral,
        * e por isso o botão manda a casa atual, e só ela.
        */}
      <div className="acoes">
        <button className="btn sm sec" onClick={async () => {
          setErro('');
          try {
            setDocumento(await api<DocumentoWord>(`/impacto/folha?houseId=${houseId}`));
          } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível montar o relatório.');
          }
        }}>🌱 Relatório do trabalho desta casa</button>
      </div>

      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

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
          {/*
            * O LIMITE DA UNIDADE.
            *
            * Fica aqui, colado na ocupação, porque é a mesma pergunta: "cabem
            * quantos, e por quê?". As oito casas nasceram com 20 e não havia
            * por onde mudar — a tarja "acima do limite" apontava para um teto
            * que ninguém conseguia corrigir quando a casa passava a operar
            * com outro.
            */}
          <div className="eyebrow" style={{ marginTop: 16 }}>
            O limite de {aberta.codigo}
          </div>
          <div className="card stack">
            <div className="row">
              <div className="grow">
                <b className="ff">{aberta.ocupacao.limite} vagas</b>
                <div className="mutetxt">
                  {aberta.ocupacao.ativos} acolhido(s) hoje ·
                  {' '}{Math.max(0, aberta.ocupacao.limite - aberta.ocupacao.ativos)} vaga(s)
                </div>
              </div>
              {alteraLimite && (
                <button className="btn sec sm" onClick={() => setMudandoLimite(true)}>
                  Alterar o limite
                </button>
              )}
            </div>

            {limites.length > 0 && (
              <>
                <div className="eyebrow" style={{ marginTop: 4 }}>
                  Mudanças do limite · {limites.length}
                </div>
                <ul className="lista">
                  {limites.map((m, i) => (
                    <li key={i}>
                      <b className="ff">de {m.de} para {m.para}</b>
                      <div className="mutetxt">{m.motivo}</div>
                      <div className="mutetxt">{m.autor} · {quandoDia(m.em)}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

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

      {mudandoLimite && aberta && (
        <FolhaLimite
          unidade={aberta}
          onFechar={() => setMudandoLimite(false)}
          onAlterar={async (capacidade, motivo) => {
            setErro(''); setAviso('');
            try {
              const r = await api<{ aviso?: string }>(`/houses/${aberta.id}/capacity`, {
                method: 'POST', body: JSON.stringify({ capacidade, motivo }) });
              setMudandoLimite(false);
              setAviso(r?.aviso ?? 'Limite alterado.');
              await carregar();
              setLimites(await api<MudancaDeLimite[]>(
                `/houses/${aberta.id}/capacity-history`).catch(() => limites));
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível alterar o limite.');
            }
          }} />
      )}
      {documento && (
        <FolhaDocumento doc={documento} onFechar={() => setDocumento(null)}
                        exportar={(finalidade) => api<ArquivoGerado>('/impacto/export', {
                          method: 'POST', body: JSON.stringify({ houseId, finalidade }),
                        })} />
      )}
    </>
  );
}

/**
 * A FOLHA DO LIMITE.
 *
 * O motivo é obrigatório, com mínimo, e a folha diz por quê: o limite da
 * unidade não é preferência de quem coordena — é o que a instituição pactuou,
 * e é a ele que a tarja "acima do limite" se refere na hora de admitir uma
 * criança às 23h. Mudá-lo sem uma linha escrita transformaria a próxima
 * pergunta ("por que esta casa recebe 22?") numa que ninguém sabe responder.
 *
 * A folha também mostra a ocupação de hoje ao lado do campo, porque baixar o
 * limite abaixo de quem já está na casa é o erro fácil daqui — e ele não
 * expulsa ninguém: só faz a unidade nascer, no dia seguinte, acima do teto.
 */
function FolhaLimite({ unidade, onFechar, onAlterar }: {
  unidade: Cartao; onFechar: () => void;
  onAlterar: (capacidade: number, motivo: string) => void;
}) {
  const [valor, setValor] = useState(String(unidade.ocupacao.limite));
  const [motivo, setMotivo] = useState('');
  const n = Number(valor);
  const valido = Number.isInteger(n) && n >= 1 && n <= 60;
  const mudou = valido && n !== unidade.ocupacao.limite;
  const abaixoDoQueTem = valido && n < unidade.ocupacao.ativos;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-lim"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-lim">Limite de {unidade.codigo}</h3>
        <div className="notice c-info">
          O limite é o que a instituição pactuou para esta unidade, e é a ele que a tarja
          <b> acima do limite</b> se refere quando alguém admite uma criança às 23h. A mudança
          fica registrada com o seu nome, a data e o motivo — e <b>não apaga</b> a anterior.
        </div>

        <label className="f" htmlFor="lim-n">
          Novo limite <small>— hoje são {unidade.ocupacao.limite}, com {unidade.ocupacao.ativos} acolhido(s) na casa</small>
        </label>
        <input id="lim-n" type="number" min={1} max={60} value={valor}
               onChange={(e) => setValor(e.target.value)} />

        {!valido && valor !== '' && (
          <div className="notice c-warn" role="status">O limite precisa estar entre 1 e 60.</div>
        )}
        {abaixoDoQueTem && (
          <div className="notice c-warn" role="status">
            Este limite é menor do que o número de acolhidos que já estão na casa. Ninguém sai
            por causa disso — a unidade apenas passa a constar <b>acima do limite</b> até que
            alguém saia.
          </div>
        )}

        <label className="f" htmlFor="lim-mot">
          Por que o limite está mudando <small>— pelo menos 15 caracteres</small>
        </label>
        <textarea id="lim-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: reforma do segundo andar concluída em agosto; dois quartos voltaram a ser usados, conforme vistoria da Fundação." />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!mudou || motivo.trim().length < 15}
                  onClick={() => onAlterar(n, motivo.trim())}>
            Alterar, com este motivo
          </button>
        </div>
      </div>
    </div>
  );
}
