import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * ============================================================================
 * O PAINEL DAS OITO CASAS — a tela inicial do Gestor Geral (fase 120).
 *
 * Resposta da Fundação em 15/09/2026 à pergunta que estava aberta desde 09/09:
 * *"a tela inicial dele como métrica, as coisas fáceis para ele ver, só
 * gráficos, dashboards […] para ele poder gerar os relatórios dele de impacto
 * do Pão dos Pobres na vida das crianças"*.
 *
 * ---
 *
 * TRÊS DECISÕES DE DESENHO, E AS TRÊS TÊM MOTIVO
 *
 * **1. Os números do CONJUNTO vêm primeiro, as casas depois.** A pergunta dele
 * é *"o que o Pão dos Pobres fez"*; comparar casas é o segundo olhar. Uma tela
 * que abre com oito barras convida a procurar a pior antes de olhar o todo.
 *
 * **2. BARRAS, e não pizza — apesar de ele ter pedido pizza.** Uma pizza de
 * oito fatias é o gráfico que ninguém lê: fatias vizinhas de tamanho parecido
 * viram um borrão, e a pergunta dele é justamente comparar oito casas. Barras
 * horizontais se leem de relance, cabem no celular e mantêm os nomes legíveis.
 * *A rosca fica onde ela é verdade: parte-do-todo com poucas fatias — e aqui
 * há uma, a das ocorrências.*
 *
 * **3. Uma cor só, e ela NÃO é cor de estado.** Neste sistema a cor comunica
 * estado operacional (verde/âmbar/vermelho), e usar verde numa barra alta
 * diria "esta casa está bem" — um juízo que ninguém assinou. O gráfico usa um
 * azul próprio, validado nos dois temas contra as superfícies reais da tela.
 * Comprimento é a comparação; a cor é só tinta.
 *
 * *Sem biblioteca de gráfico: o protótipo é um arquivo só, aberto sem
 * internet. Tudo aqui é SVG escrito à mão, e cada gráfico traz também os
 * números por extenso — quem não enxerga a barra lê a lista.*
 * ============================================================================
 */

interface Casa {
  id: string; codigo: string; nome: string;
  acolhidos: number; capacidade: number; entradas: number; saidas: number;
  passouDeAno: number; marcos: number;
  apoioEducacional: number; evolucoesEducacionais: number;
  internacoes: number; medicamentosSaidos: number;
  notasCentavos: number; notasSemValor: number;
  lanches: number; cestas: number;
  reunioes: number;
  acompanhamentosAprovados: number; acompanhamentosAbertos: number;
  relatorios: number; atasFechadas: number; atasComPendencia: number;
  ocorrencias: number; ocorrenciasRestritas: number;
  pessoasNaEscala: number;
}
interface Painel {
  de: string; ate: string; casas: Casa[];
  total: Omit<Casa, 'id' | 'codigo' | 'nome'> & { casas: number };
  ressalvas: string[];
}

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (iso: string) =>
  new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('pt-BR');

/** Os recortes que o Gestor Geral pediu, na ordem em que ele os falou. */
const RECORTES: { chave: keyof Casa; titulo: string; nota?: string }[] = [
  { chave: 'acolhidos', titulo: 'Crianças acolhidas hoje' },
  { chave: 'passouDeAno', titulo: 'Passaram de ano', nota: 'marco de vida registrado por quem acompanhou' },
  { chave: 'marcos', titulo: 'Conquistas registradas', nota: 'curso, emprego, documento, esporte, arte' },
  { chave: 'apoioEducacional', titulo: 'Crianças com apoio educacional' },
  { chave: 'evolucoesEducacionais', titulo: 'Evoluções educacionais escritas' },
  { chave: 'reunioes', titulo: 'Reuniões de equipe' },
  { chave: 'pessoasNaEscala', titulo: 'Pessoas na escala' },
  { chave: 'internacoes', titulo: 'Internações hospitalares' },
  { chave: 'medicamentosSaidos', titulo: 'Medicamentos que saíram do armário' },
  { chave: 'lanches', titulo: 'Porções de lanche' },
  { chave: 'cestas', titulo: 'Cestas básicas' },
  { chave: 'acompanhamentosAprovados', titulo: 'Acompanhamentos aprovados' },
  { chave: 'relatorios', titulo: 'Relatórios produzidos' },
  { chave: 'atasFechadas', titulo: 'ATAs fechadas' },
  { chave: 'ocorrencias', titulo: 'Ocorrências registradas' },
];

export function Metricas() {
  const [p, setP] = useState<Painel | null>(null);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [recorte, setRecorte] = useState<keyof Casa>('acolhidos');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  async function carregar(d?: string, a?: string) {
    setErro(''); setCarregando(true);
    try {
      /* A rota vai por EXTENSO, com os dois parâmetros sempre presentes —
         vazios quando não há data. Montar o `?` numa expressão faz o conferidor
         de contrato ler `/reports/metrics${...}` e não achar a rota; e ele tem
         razão em reclamar: rota montada em variável é rota que ninguém confere
         (§6, e o `contrato-rotas.spec`). O servidor trata vazio como ausente. */
      setP(await api<Painel>(
        `/reports/metrics?de=${encodeURIComponent(d ?? '')}&ate=${encodeURIComponent(a ?? '')}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o painel.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  if (erro) return <div className="notice c-crit" role="alert">{erro}</div>;
  if (!p) return <p className="mutetxt">{carregando ? 'Abrindo o painel…' : ''}</p>;

  const escolhido = RECORTES.find((r) => r.chave === recorte)!;

  return (
    <>
      <div className="diahead">
        <div>
          <h2>As oito casas, em números</h2>
          <p className="mutetxt">
            {dia(p.de)} a {dia(p.ate)} · {p.total.casas} unidades
          </p>
        </div>
      </div>

      {/* O período primeiro: tudo nesta tela depende dele, e um painel que não
          diz de quando é são números sem data num relatório. */}
      <div className="row">
        <div className="grow">
          <label className="f" htmlFor="me-de">De</label>
          <input id="me-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="grow">
          <label className="f" htmlFor="me-ate">Até</label>
          <input id="me-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>
      <button className="btn sec block" onClick={() => void carregar(de || undefined, ate || undefined)}>
        {carregando ? 'Abrindo…' : 'Ver este período'}
      </button>

      {/*
        * O QUE A INSTITUIÇÃO FEZ — os números do conjunto, antes das casas.
        *
        * São estes que vão para o relatório de impacto, e é por isso que eles
        * abrem a tela: a pergunta é "o que o Pão dos Pobres fez", e não "qual
        * casa foi pior".
        */}
      <div className="eyebrow">O que o Pão dos Pobres fez neste período</div>
      <div className="painel">
        <Numero valor={p.total.acolhidos} rotulo="crianças acolhidas hoje" grande />
        <Numero valor={p.total.passouDeAno} rotulo="passaram de ano" grande />
        <Numero valor={p.total.marcos} rotulo="conquistas registradas" />
        <Numero valor={p.total.lanches} rotulo="porções de lanche" />
        <Numero valor={p.total.cestas} rotulo="cestas básicas" />
        <Numero valor={p.total.reunioes} rotulo="reuniões de equipe" />
        <Numero valor={p.total.internacoes} rotulo="internações" />
        <Numero valor={p.total.relatorios} rotulo="relatórios produzidos" />
      </div>

      {/* O dinheiro fica sozinho, e com a ressalva colada nele. */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="mutetxt">Gasto com medicamento, pelas notas lançadas</div>
        <b className="ff" style={{ fontSize: 28 }}>{reais(p.total.notasCentavos)}</b>
        {p.total.notasSemValor > 0 && (
          <div className="notice c-warn" role="status" style={{ marginTop: 8 }}>
            <b>{p.total.notasSemValor} nota(s) sem valor lançado.</b>
            <div>O gasto real é MAIOR do que este número. Lançar o valor é o que fecha a conta.</div>
          </div>
        )}
      </div>

      {/* As ressalvas vêm do SERVIDOR: a regra é dele, e uma tela que
          escrevesse a própria versão dela divergiria no primeiro ajuste. */}
      {p.ressalvas.map((r, i) => (
        <div className="notice c-info" role="status" key={i}>{r}</div>
      ))}

      <div className="eyebrow">Casa a casa</div>
      <label className="f" htmlFor="me-rec">O que comparar</label>
      <select id="me-rec" value={recorte}
              onChange={(e) => setRecorte(e.target.value as keyof Casa)}>
        {RECORTES.map((r) => (
          <option key={String(r.chave)} value={String(r.chave)}>{r.titulo}</option>
        ))}
      </select>
      {escolhido.nota && <p className="mutetxt">{escolhido.nota}</p>}

      <Barras casas={p.casas} chave={recorte} titulo={escolhido.titulo} />

      {/*
        * A ÚNICA ROSCA DA TELA, e ela é parte-do-todo de verdade: duas fatias,
        * o que é de acesso restrito e o que não é. Pizza serve para isto —
        * poucas fatias de um mesmo total —, e não para oito casas.
        */}
      {p.total.ocorrencias > 0 && (
        <Rosca
          titulo="Ocorrências do período"
          partes={[
            { rotulo: 'de acesso restrito', valor: p.total.ocorrenciasRestritas },
            { rotulo: 'demais', valor: p.total.ocorrencias - p.total.ocorrenciasRestritas },
          ]} />
      )}

      {/*
        * A TABELA INTEIRA, sempre presente.
        *
        * Não é alternativa de acessibilidade pendurada no fim: é o que se
        * copia para um relatório, e é o que responde quando o gráfico levanta
        * a pergunta seguinte — "a casa 5 teve mais internações; e reuniões?".
        */}
      {/* DOBRADA, e não escondida: num celular a tabela inteira são oito casas
          por catorze números, e ela empurraria o gráfico para fora da tela.
          Fechada por padrão, aberta num toque, e presente para quem lê por
          leitor de tela — que é o outro motivo de ela existir. */}
      <details className="dobra">
        <summary>Todos os números, por casa</summary>
      <div className="tablewrap">
        <table className="tabela">
          <thead>
            <tr>
              <th>Casa</th><th>Crianças</th><th>Passaram de ano</th><th>Conquistas</th>
              <th>Reuniões</th><th>Escala</th><th>Internações</th><th>Remédios</th>
              <th>Lanches</th><th>Cestas</th><th>Acomp.</th><th>ATAs</th>
              <th>Ocorrências</th><th>Gasto</th>
            </tr>
          </thead>
          <tbody>
            {p.casas.map((c) => (
              <tr key={c.id}>
                <td><b className="ff">{c.codigo}</b></td>
                <td data-rotulo="Crianças">{c.acolhidos} de {c.capacidade}</td>
                <td data-rotulo="Passaram de ano">{c.passouDeAno}</td>
                <td data-rotulo="Conquistas">{c.marcos}</td>
                <td data-rotulo="Reuniões">{c.reunioes}</td>
                <td data-rotulo="Escala">{c.pessoasNaEscala}</td>
                <td data-rotulo="Internações">{c.internacoes}</td>
                <td data-rotulo="Remédios">{c.medicamentosSaidos}</td>
                <td data-rotulo="Lanches">{c.lanches}</td>
                <td data-rotulo="Cestas">{c.cestas}</td>
                <td data-rotulo="Acompanhamentos">{c.acompanhamentosAprovados}</td>
                <td data-rotulo="ATAs">
                  {c.atasFechadas}
                  {c.atasComPendencia > 0 && <> +{c.atasComPendencia} com pendência</>}
                </td>
                <td data-rotulo="Ocorrências">{c.ocorrencias}</td>
                <td data-rotulo="Gasto">{reais(c.notasCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </details>

      <p className="mutetxt">
        As casas saem na ordem do código, <b>nunca por resultado</b>: ordenar por número é a
        classificação pronta, e ela precisa ser decisão de quem lê.
      </p>
    </>
  );
}

function Numero({ valor, rotulo, grande }: {
  valor: number; rotulo: string; grande?: boolean;
}) {
  return (
    <div className="tile">
      <b style={grande ? { fontSize: 30 } : undefined}>{valor.toLocaleString('pt-BR')}</b>
      <span>{rotulo}</span>
    </div>
  );
}

/**
 * BARRAS HORIZONTAIS — oito casas, uma medida.
 *
 * Horizontais porque o rótulo é o código da casa e cabe à esquerda sem girar
 * o texto; e porque no celular a tela é estreita e alta, que é a forma da
 * barra deitada. Uma cor só: o comprimento é a comparação, e a cor é tinta.
 *
 * O número vai NO FIM DE CADA BARRA, sempre — sem depender de passar o dedo,
 * que num celular é um gesto que ninguém descobre.
 */
function Barras({ casas, chave, titulo }: {
  casas: Casa[]; chave: keyof Casa; titulo: string;
}) {
  const valores = casas.map((c) => Number(c[chave]) || 0);
  const maior = Math.max(1, ...valores);
  const ALTURA = 30, GAP = 8, ROTULO = 46, NUM = 44;
  const total = casas.length * (ALTURA + GAP);

  return (
    <figure className="gr">
      <figcaption className="mutetxt">{titulo}, por casa</figcaption>
      <svg viewBox={`0 0 320 ${total}`} width="100%" height={total}
           role="img" aria-label={`${titulo}, por casa. Os números estão na tabela abaixo.`}>
        {casas.map((c, i) => {
          const v = Number(c[chave]) || 0;
          const largura = Math.round((320 - ROTULO - NUM) * (v / maior));
          const y = i * (ALTURA + GAP);
          return (
            <g key={c.id}>
              <text x="0" y={y + ALTURA / 2 + 4} className="gr-rot">{c.codigo}</text>
              {/* O trilho: diz onde a barra poderia chegar, em tom de linha. */}
              <rect x={ROTULO} y={y + 6} width={320 - ROTULO - NUM} height={ALTURA - 12}
                    rx="4" className="gr-trilho" />
              {v > 0 && (
                <rect x={ROTULO} y={y + 6} width={Math.max(3, largura)} height={ALTURA - 12}
                      rx="4" className="gr-barra" />
              )}
              <text x="320" y={y + ALTURA / 2 + 4} textAnchor="end" className="gr-num">{v}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/**
 * A ROSCA — duas fatias, e só duas.
 *
 * Existe porque ele pediu pizza, e porque aqui ela é verdade: parte-do-todo,
 * poucas fatias, mesma unidade. Com oito casas ela seria ilegível, e é por
 * isso que a comparação entre casas é barra.
 *
 * Cada fatia é rotulada por extenso ao lado, com o número: a cor sozinha nunca
 * carrega a identidade.
 */
function Rosca({ titulo, partes }: {
  titulo: string; partes: { rotulo: string; valor: number }[];
}) {
  const total = partes.reduce((t, p) => t + p.valor, 0);
  if (total === 0) return null;
  const R = 52, ESPESSURA = 22, C = 2 * Math.PI * R;
  let acumulado = 0;

  return (
    <figure className="gr">
      <figcaption className="mutetxt">{titulo}</figcaption>
      <div className="row" style={{ alignItems: 'center' }}>
        <svg viewBox="0 0 140 140" width="140" height="140" role="img"
             aria-label={`${titulo}: ${partes.map((p) => `${p.rotulo}, ${p.valor}`).join('; ')}`}>
          {partes.map((p, i) => {
            const fatia = (p.valor / total) * C;
            const offset = acumulado;
            acumulado += fatia;
            return (
              <circle key={p.rotulo} cx="70" cy="70" r={R} fill="none"
                      strokeWidth={ESPESSURA}
                      className={i === 0 ? 'gr-fatia-1' : 'gr-fatia-2'}
                      strokeDasharray={`${Math.max(0, fatia - 2)} ${C - Math.max(0, fatia - 2)}`}
                      strokeDashoffset={-offset}
                      transform="rotate(-90 70 70)" />
            );
          })}
          <text x="70" y="76" textAnchor="middle" className="gr-centro">{total}</text>
        </svg>
        <ul className="lista grow">
          {partes.map((p, i) => (
            <li key={p.rotulo}>
              <span className={i === 0 ? 'gr-chip-1' : 'gr-chip-2'} aria-hidden="true" />
              <div className="grow">{p.rotulo}</div>
              <b className="ff">{p.valor}</b>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
