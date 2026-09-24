import { useEffect, useState } from 'react';
import { api } from '../api';
import { FolhaDocumento } from '../documentos';
import type { ArquivoGerado } from '../documentos';
import type { DocumentoWord } from '../docx';
import { dia } from '../rotulos';
import { Icone } from '../icones';

/**
 * ============================================================================
 * O PERÍODO DA CASA (fase 121) — *"uma ata geral de toda semana"*.
 *
 * Resposta da Fundação em 15/09/2026 à pergunta R1 do roteiro:
 *
 *   *"Acompanhamento semanal é um bom caminho: ver como foi a casa toda aquela
 *   semana, tipo uma ata geral de toda semana, tanto manhã quanto noite."*
 *   […] *"Com quem tira o relatório podendo escolher o tempo de período que
 *   ele quer tirar. Se é um dia, dois, três, uma semana, um mês, seis meses."*
 *
 * TRÊS COISAS QUE ESTA TELA FAZ DE PROPÓSITO:
 *
 * 1. **os atalhos de período vêm antes das datas.** "Esta semana" é o que a
 *    casa vai clicar em nove de cada dez vezes, e obrigar a escolher duas
 *    datas para a leitura mais comum é obrigar a casa a fazer conta de
 *    calendário toda segunda-feira. As duas datas continuam ali para o resto;
 *
 * 2. **a parte boa aparece primeiro**, porque foi o que ele pediu: *"as
 *    observações que os educadores botam têm que ser ponderadas para ser
 *    trazido coisas boas e negativas."* A ordem das seções vem do SERVIDOR,
 *    não daqui — uma tela que reordenasse por conta própria desfaria a
 *    decisão no primeiro ajuste de layout;
 *
 * 3. **nenhum gráfico, nenhuma barra.** Este relatório é de LEITURA: o que
 *    aconteceu, com quem, escrito por quem. Os números ficam num quadro no
 *    fim, e o único par comparado é o de doses — que é a pergunta dele sobre
 *    *"aumento de medicamentos"*, e é a casa contra ela mesma.
 * ============================================================================
 */

interface SecaoVoc { cod: string; label: string; ajuda: string }
interface Vocabulario { secoes: SecaoVoc[]; janelaMaximaDias: number }

interface LinhaDoPeriodo {
  quando: string; quem: string | null; titulo: string | null;
  texto: string; autor: string | null;
}
interface SecaoDoPeriodo {
  cod: string; label: string; ajuda: string;
  linhas: LinhaDoPeriodo[]; truncada: boolean;
}
interface RefeicaoDoPeriodo {
  personId: string; quem: string;
  linhas: { quando: string; refeicao: string; opcao: string;
            nota: string | null; por: string | null }[];
}
interface Numeros {
  acolhidos: number; capacidade: number; entradas: number; saidas: number;
  chamadas: number; chamadasConfirmadas: number; chamadasAbertas: number;
  refeicoesConferidas: number; refeicoesComExcecao: number; criancasComExcecao: number;
  ocorrencias: number; ocorrenciasRestritas: number; desorganizacao: number;
  atas: number; atasFechadas: number; atasComPendencia: number; atasAbertas: number;
  passagens: number; passagensSemRecibo: number;
  doses: number; dosesConfirmadas: number; dosesSemResposta: number; dosesAnterior: number;
  internacoes: number; idasAFamilia: number;
  marcos: number; evolucoesEducacionais: number; evolucoesDeSaude: number; memorias: number;
  reunioes: number; lanches: number; cestas: number;
  acompanhamentosAprovados: number; acompanhamentosAbertos: number;
  notasRestritas: number;
}
interface Periodo {
  casa: { id: string; codigo: string; nome: string };
  periodo: { de: string; ate: string; dias: number };
  periodoAnterior: { de: string; ate: string };
  numeros: Numeros;
  alimentacao: RefeicaoDoPeriodo[];
  secoes: SecaoDoPeriodo[];
  ressalvas: string[];
}


/**
 * OS ATALHOS DE PERÍODO — e por que "hoje" é lido na hora do clique.
 *
 * Guardar a data de hoje numa constante do módulo é a regra 13 do §6: a
 * resposta envelhece sozinha, uma vez a cada 24 horas, e quem deixa a tela
 * aberta a noite inteira pede "esta semana" e recebe a semana de ontem.
 */
const ATALHOS: { rotulo: string; dias: number }[] = [
  { rotulo: 'Hoje', dias: 1 },
  { rotulo: '7 dias', dias: 7 },
  { rotulo: '30 dias', dias: 30 },
  { rotulo: '3 meses', dias: 92 },
  { rotulo: '6 meses', dias: 184 },
];

function hoje() {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}
function diasAntes(ate: string, n: number) {
  const d = new Date(`${ate}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function Periodo({ casaId }: { casaId: string | null }) {
  const [voc, setVoc] = useState<Vocabulario | null>(null);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [r, setR] = useState<Periodo | null>(null);
  const [doc, setDoc] = useState<DocumentoWord | null>(null);
  const [erro, setErro] = useState('');
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api<Vocabulario>('/reports/period/options')
      .then((v) => { if (vivo) setVoc(v); })
      .catch(() => { /* a tela funciona sem o vocabulário: ele é ajuda, não regra */ });
    return () => { vivo = false; };
  }, []);

  /*
   * A SEMANA ABRE SOZINHA.
   *
   * *"Acompanhamento semanal é um bom caminho"* — então a tela já chega com a
   * semana. Abrir num relatório em branco, à espera de dois cliques, é
   * transformar a leitura de toda segunda-feira numa tarefa; e quem quiser
   * outro recorte tem os atalhos e as duas datas logo acima.
   */
  useEffect(() => {
    if (!casaId) return;
    const fim = hoje();
    const ini = diasAntes(fim, 6);
    setAte(fim); setDe(ini);
    void abrir(ini, fim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casaId]);

  function atalho(dias: number) {
    const fim = hoje();
    setAte(fim);
    setDe(diasAntes(fim, dias - 1));
  }

  async function abrir(dDe?: string, dAte?: string) {
    if (!casaId) { setErro('Escolha a unidade no alto da tela.'); return; }
    setErro(''); setR(null);
    setBuscando(true);
    try {
      /* Rota por extenso, com os dois parâmetros sempre presentes: a
         interpolação condicional esconde a rota do `contrato-rotas.spec` e de
         quem lê o código (lição da fase 120). */
      setR(await api<Periodo>(
        `/reports/period?houseId=${encodeURIComponent(casaId)}`
        + `&de=${encodeURIComponent(dDe ?? de ?? '')}&ate=${encodeURIComponent(dAte ?? ate ?? '')}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o período.');
    } finally {
      setBuscando(false);
    }
  }

  async function verFolha() {
    if (!r) return;
    setErro('');
    try {
      setDoc(await api<DocumentoWord>('/reports/period/preview', {
        method: 'POST',
        body: JSON.stringify({ houseId: r.casa.id, de: r.periodo.de, ate: r.periodo.ate }),
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível montar a folha.');
    }
  }

  return (
    <>
      <div className="diahead">
        <div>
          <h2>O período da casa</h2>
          <p className="mutetxt">
            Como foi a casa no intervalo que você escolher — de um dia a seis meses.
            O que aconteceu, escrito por quem estava lá.
          </p>
        </div>
      </div>

      {/* Os atalhos antes das datas: "7 dias" é a leitura de toda segunda. */}
      <div className="filtros" aria-label="Período">
        {ATALHOS.map((a) => (
          <button key={a.rotulo}
                  className={r && r.periodo.dias === a.dias ? 'on' : ''}
                  onClick={() => {
                    const fim = hoje();
                    const ini = diasAntes(fim, a.dias - 1);
                    atalho(a.dias);
                    void abrir(ini, fim);
                  }}>
            {a.rotulo}
          </button>
        ))}
      </div>

      <div className="row">
        <div className="grow">
          <label className="f" htmlFor="pe-de">De</label>
          <input id="pe-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="grow">
          <label className="f" htmlFor="pe-ate">Até</label>
          <input id="pe-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>
      <p className="mutetxt">
        Sem datas, são os últimos sete dias. O período vai até{' '}
        {voc?.janelaMaximaDias ?? 184} dias — seis meses.
      </p>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      <button className="btn block" onClick={() => void abrir()} disabled={buscando}>
        {buscando ? 'Abrindo…' : 'Abrir o período'}
      </button>

      {r && (
        <>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="row">
              <b className="ff grow">{r.casa.codigo} — {r.casa.nome}</b>
              <span className="pill c-info">
                {r.periodo.dias} dia{r.periodo.dias === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mutetxt">
              {dia(r.periodo.de)} a {dia(r.periodo.ate)}
            </div>
          </div>

          <button className="btn sec block" onClick={() => void verFolha()}>
            <Icone nome="documento" /> Ver a folha antes de baixar
          </button>

          {/* AS SEÇÕES, NA ORDEM DO SERVIDOR — a parte boa primeiro. */}
          {r.secoes.map((s) => (
            <SecaoDoPeriodoBloco key={s.cod} s={s} />
          ))}

          {/* "Quem não está comendo o quê", agrupado por criança e sem número
              nenhum ao lado do nome. Três linhas embaixo de um nome são três
              fatos; "3" ao lado de um nome é o começo de uma ficha (§8.7.2). */}
          {r.alimentacao.length > 0 && (
            <>
              <div className="eyebrow">Refeições com exceção registrada</div>
              <div className="stack">
                {r.alimentacao.map((c) => (
                  <div className="card" key={c.personId}>
                    <b className="ff">{c.quem}</b>
                    <ul className="lista">
                      {c.linhas.map((l, i) => (
                        <li key={i}>
                          <b className="ff">{dia(l.quando)}</b> · {l.refeicao} ·{' '}
                          <span className="pill c-warn">{l.opcao}</span>
                          {l.nota && <div className="linhadois">{l.nota}</div>}
                          {l.por && <div className="mutetxt">registrado por {l.por}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          <QuadroDeNumeros n={r.numeros} anterior={r.periodoAnterior} />

          {/* As ressalvas vêm do servidor e ficam à vista, não em rodapé: a
              primeira delas diz o que NÃO está escrito aqui. */}
          {r.ressalvas.map((t, i) => (
            <div className="notice c-info" role="status" key={i} style={{ marginTop: 10 }}>{t}</div>
          ))}
        </>
      )}

      {doc && r && (
        <FolhaDocumento doc={doc} onFechar={() => setDoc(null)}
                        exportar={(finalidade) => api<ArquivoGerado>('/reports/period/export', {
                          method: 'POST',
                          body: JSON.stringify({
                            houseId: r.casa.id, de: r.periodo.de, ate: r.periodo.ate, finalidade,
                          }),
                        })} />
      )}
    </>
  );
}

/**
 * Uma seção de texto. Vazia, ela DESAPARECE — e não vira "nenhum registro",
 * que num relatório de seis meses seria meia tela de frases negativas.
 * O quadro de números diz quantos houve de cada coisa.
 */
function SecaoDoPeriodoBloco({ s }: { s: SecaoDoPeriodo }) {
  if (!s.linhas.length) return null;
  return (
    <>
      <div className="eyebrow">{s.label}</div>
      <p className="mutetxt" style={{ marginTop: 0 }}>{s.ajuda}</p>
      {s.truncada && (
        <div className="notice c-warn" role="status">
          Esta seção foi cortada no limite de {s.linhas.length} linhas — há mais no período.
          Reduza o intervalo para ver o resto.
        </div>
      )}
      <div className="stack">
        {s.linhas.map((l, i) => (
          <div className="card" key={i}>
            <div className="row">
              <b className="ff grow">{l.quem ?? dia(l.quando)}</b>
              {l.quem && <span className="mutetxt">{dia(l.quando)}</span>}
            </div>
            {l.titulo && <div className="mutetxt">{l.titulo}</div>}
            <p className="bloco" style={{ marginBottom: 0 }}>{l.texto}</p>
            {l.autor && <div className="mutetxt">escrito por {l.autor}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * OS NÚMEROS, no fim e num quadro só.
 *
 * Sem barra, sem gráfico e sem percentual: este relatório é de leitura, e o
 * número aqui é referência, não o assunto. O único par comparado é o de doses
 * — a pergunta dele sobre *"aumento de medicamentos"* —, e a comparação é da
 * casa com ELA MESMA, no período anterior de igual duração. A divisão não é
 * feita: quem lê sabe o que mudou na casa naquelas semanas, e a conta com
 * contexto vale mais do que a porcentagem sem ele.
 */
function QuadroDeNumeros({ n, anterior }: {
  n: Numeros; anterior: { de: string; ate: string };
}) {
  const linhas: [string, string][] = [
    ['Acolhidos ao fim do período', `${n.acolhidos} de ${n.capacidade} vagas`],
    ['Entradas e saídas', `${n.entradas} entrada(s), ${n.saidas} saída(s)`],
    ['Chamadas', `${n.chamadas}, sendo ${n.chamadasConfirmadas} confirmada(s)`
      + (n.chamadasAbertas ? ` e ${n.chamadasAbertas} ainda aberta(s)` : '')],
    ['Refeições conferidas',
      `${n.refeicoesConferidas}, com ${n.refeicoesComExcecao} exceção(ões) de `
      + `${n.criancasComExcecao} criança(s)`],
    ['Ocorrências', `${n.ocorrencias}`
      + (n.ocorrenciasRestritas ? `, sendo ${n.ocorrenciasRestritas} de acesso restrito` : '')],
    ['Desorganização com repercussão relevante', `${n.desorganizacao}`],
    ['ATAs', `${n.atas}: ${n.atasFechadas} fechada(s), ${n.atasComPendencia} com pendência, `
      + `${n.atasAbertas} aberta(s)`],
    ['Passagens de plantão', `${n.passagens}`
      + (n.passagensSemRecibo ? `, sendo ${n.passagensSemRecibo} sem recibo` : '')],
    ['Doses previstas',
      `${n.doses} neste período, contra ${n.dosesAnterior} em `
      + `${dia(anterior.de)} a ${dia(anterior.ate)}`],
    ['Doses confirmadas', `${n.dosesConfirmadas}`
      + (n.dosesSemResposta ? `, com ${n.dosesSemResposta} sem resposta` : '')],
    ['Internações hospitalares', `${n.internacoes}`],
    ['Idas para convivência familiar', `${n.idasAFamilia}`],
    ['Conquistas registradas', `${n.marcos}`],
    ['Evoluções escolares escritas', `${n.evolucoesEducacionais}`],
    ['Evoluções de saúde escritas', `${n.evolucoesDeSaude}`],
    ['Memórias guardadas', `${n.memorias}`],
    ['Reuniões de equipe', `${n.reunioes}`],
    ['Cozinha', `${n.lanches} lanche(s), ${n.cestas} cesta(s)`],
    ['Acompanhamentos',
      `${n.acompanhamentosAprovados} aprovado(s), ${n.acompanhamentosAbertos} em aberto`],
  ];
  return (
    <>
      <div className="eyebrow">O período em números</div>
      <div className="card">
        <ul className="lista">
          {linhas.map(([rotulo, valor]) => (
            <li key={rotulo}>
              <b className="ff">{rotulo}</b>
              <div className="linhadois">{valor}</div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
