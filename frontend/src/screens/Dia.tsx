import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiOuFila } from '../api';
import { Icone } from '../icones';
import type { AoEnfileirar } from '../fila-offline';
import { FolhaDose } from './Saude';
import type { Dose } from './Saude';

/**
 * O DIA — a linha do tempo (§9).
 *
 * É a tela mais usada do sistema e a que decide se ele vai ser usado. O
 * educador abre isto no começo do plantão e volta a ela dezenas de vezes;
 * cada toque a mais aqui é um motivo a mais para a equipe voltar ao papel ou
 * ao aplicativo de conversa.
 *
 * As decisões de tela, todas com a mesma razão — velocidade no meio do turno:
 *
 *  * **filtros, não uma busca.** "Agora", "Minhas" e "Tudo" recortam a mesma
 *    linha; "Por criança" troca a pergunta — de "o que acontece agora" para
 *    "como está cada um". Quem está de plantão quer ver, não pesquisar;
 *  * **o que já passou não some.** Some do topo, mas continua na lista, com o
 *    estado que recebeu. Sumir esconderia o que ficou sem registro;
 *  * **o resultado é um toque, a exceção é dois.** Concluir é o caminho
 *    comum. Exceção abre a folha com as opções e a justificativa, porque
 *    exceção sem fato não informa nada a quem ler amanhã;
 *  * **estado em palavra, não em cor sozinha.** A cor ajuda; quem enxerga
 *    pouco, ou está no corredor com a tela clara, lê a palavra.
 */

interface Evento {
  id: string;
  source: string;
  at: string;
  kind: string;
  title: string;
  personId: string | null;
  personName: string | null;
  state: string;
  severity: 'normal' | 'atencao' | 'critico';
  responsible?: string | null;
  note?: string | null;
  actions?: { command: string; label: string }[];
}

interface Aniversariante {
  personId: string; nome: string; dia: string; idadeQueFaz: number;
  faltam: number; quando: string; ciente: boolean;
  cientePor: string | null; cienteEm: string | null;
}

interface Resposta {
  data: string;
  incompleta: boolean;
  fontesIndisponiveis: string[];
  resumo: { total: number; criticos: number; atencao: number; individuais: number; coletivos: number };
  eventos: Evento[];
}

/**
 * PARA ONDE CADA AÇÃO LEVA.
 *
 * A linha do tempo é montada por seis módulos, e cada um manda a ação que faz
 * sentido para ele. As que se resolvem aqui mesmo (`activity.record`,
 * `activity.acknowledge`, `medication.confirm`) têm folha própria; estas
 * quatro são NAVEGAÇÃO — o trabalho acontece na tela do módulo, que é onde
 * mora o resto do contexto.
 *
 * O teste `rotas-sem-porta` cobra esta tabela: ação que o servidor manda e que
 * esta tela não sabe atender é botão que não existe, e ninguém percebe pelo
 * `tsc`.
 */
const DESTINO: Record<string, string> = {
  'check.open': 'chamada',
  'handover.sign': 'passagem',
  'ata.view': 'ata',
  'incident.open': 'ocorrencias',
};

/** Exceções, com o rótulo que a equipe usa. Justificativa obrigatória (§8.4). */
const EXCECOES = [
  { cod: 'reagendada', label: 'Reagendada' },
  { cod: 'cancelada_externamente', label: 'Cancelada externamente' },
  { cod: 'recusada_pelo_acolhido', label: 'Recusada pelo acolhido' },
  { cod: 'nao_realizada_saude', label: 'Não realizada — saúde' },
  { cod: 'nao_realizada_ausencia_profissional', label: 'Não realizada — ausência profissional' },
  { cod: 'nao_realizada_transporte', label: 'Não realizada — transporte' },
  { cod: 'nao_realizada_decisao_institucional', label: 'Não realizada — decisão institucional' },
  { cod: 'nao_aplicavel', label: 'Não aplicável' },
];

const TOM_SEVERIDADE: Record<string, string> = {
  normal: 'c-info', atencao: 'c-warn', critico: 'c-crit',
};
/*
 * O DESENHO DE CADA CATEGORIA (fase 150) — e antes eram emoji.
 *
 * Os emoji tinham um problema além do visual: o 🛏️ da rotina virava uma cama
 * de hotel num aparelho e um travesseiro noutro, e o 🎯 de "lazer e atividade"
 * é um alvo — a coisa mais distante do que uma tarde de futebol significa para
 * um adolescente desta casa. Desenho de traço não carrega piada nem cultura de
 * outro lugar: é a forma mínima que diz "isto é remédio", "isto é comida".
 *
 * A COR CONTINUA SENDO A CATEGORIA, na borda do cartão, e o desenho a repete —
 * quem não distingue as cores lê o mesmo pela forma, e é para isso que ele
 * existe (a §6 diz que cor nunca é o único canal).
 */
const ICONE: Record<string, string> = {
  rotina: 'cama', refeicao: 'refeicao', atividade: 'atividade', saida: 'saida',
  medicamento: 'medicamento', chamada: 'chamada', plantao: 'passagem',
  ocorrencia: 'alerta', saude: 'saude_ic',
};

/**
 * A CATEGORIA do evento — pedido da Fundação em 09/09.
 *
 * O dia inteiro numa lista cinza obriga a ler título por título para saber se
 * a tarde foi de escola ou de consulta. A categoria pinta a borda esquerda e
 * dá a leitura de relance: "hoje teve muita saúde".
 *
 * O ESTADO continua na pílula, e não muda de canal. São duas perguntas
 * diferentes — "isto é o quê" e "isto ainda exige alguma coisa de mim" — e
 * quem faz a segunda às 23h não pode ter de desempatar um matiz só.
 *
 * Oito categorias para os oito matizes da paleta. As quatro que o Marcelo
 * nomeou (saúde, educação, lazer, atendimento médico) estão separadas; o resto
 * da rotina da casa fica junto em ardósia, porque colorir 'acordar' e 'banho'
 * com tons próprios gastaria a distinção onde ela não decide nada.
 *
 * Categoria desconhecida cai em rotina — nunca em branco. Uma borda sem cor no
 * meio de uma lista colorida se lê como "esta não importa".
 */
const CATEGORIA: { classe: string; rotulo: string; kinds: string[] }[] = [
  { classe: 'cat-saude', rotulo: 'Saúde',
    kinds: ['saude', 'consulta', 'tratamento', 'internacao'] },
  { classe: 'cat-medicamento', rotulo: 'Medicamento', kinds: ['medicamento'] },
  { classe: 'cat-educacao', rotulo: 'Educação',
    kinds: ['escola', 'curso', 'contraturno', 'educacao', 'documentacao'] },
  { classe: 'cat-lazer', rotulo: 'Lazer e atividade',
    kinds: ['lazer', 'esporte', 'atividade', 'visita'] },
  { classe: 'cat-alimentacao', rotulo: 'Alimentação', kinds: ['refeicao'] },
  { classe: 'cat-saida', rotulo: 'Saída', kinds: ['saida'] },
  { classe: 'cat-ocorrencia', rotulo: 'Ocorrência', kinds: ['ocorrencia'] },
  { classe: 'cat-rotina', rotulo: 'Rotina da casa',
    kinds: ['rotina', 'acordar', 'higiene', 'banho', 'sono', 'chamada', 'plantao', 'outro'] },
];
const POR_KIND = new Map(
  CATEGORIA.flatMap((c) => c.kinds.map((k) => [k, c] as const)));
const ROTINA = CATEGORIA[CATEGORIA.length - 1];
const categoriaDe = (kind: string) => POR_KIND.get(kind) ?? ROTINA;

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Cargos que podem registrar pelo colega e delegar (§8.2, §8.3). */
const LIDERA = ['lider_diurno', 'lider_noturno_geral', 'coordenador', 'gestor_geral'];

/* alcance:urgente — quem cria atividade urgente. Conferido contra `alcance.ts`. */
const CRIA_URGENTE = ['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica',
                      'coordenador', 'gestor_geral'];
/** Quem DECIDE uma substituição — o mesmo alcance do servidor. */
const DECIDE_SUB = ['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica', 'coordenador'];

/**
 * Um pedido de substituição (§8.3).
 *
 * DELEGAR e SUBSTITUIR não são a mesma coisa, e a tela não pode misturá-las:
 * delegar é de cima para baixo — o líder passa a atividade para outra pessoa;
 * o pedido de substituição nasce de QUEM VAI SAIR, e fica em aberto até
 * alguém decidir. Quem faltou não pede nada.
 */
interface Substituicao {
  id: string; atividade: string; horario: string; motivo: string;
  status: string; pedidoPor: string; substituto: string | null;
  decidiuNota: string | null; solicitadoEm: string;
  semEfeito: boolean; aviso?: string;
}

/**
 * O PAINEL DA CASA — a visão dos 20 (§9).
 *
 * `GET /timeline/house-panel` existia desde a fase 3 e nunca teve tela. A linha
 * do dia responde "o que acontece agora"; esta responde a outra pergunta, que
 * é a da troca de turno e a da coordenação passando na casa: **"e a Alice,
 * como está?"** — vinte vezes, sem rolar uma cronologia inteira atrás do nome
 * de cada uma.
 *
 * ORDEM ALFABÉTICA, e nada mais. O servidor devolve assim, e a tela não
 * reordena: ordenar por pendências viraria uma lista das crianças "que dão
 * mais trabalho", com as mesmas no topo todo dia. Isso é ranking de acolhido, e
 * é proibido (§3.3). O número de pendências aparece na linha de cada uma, onde
 * é informação; numa ordenação, viraria juízo.
 */
interface PainelCasa {
  data: string;
  incompleta: boolean;
  fontesIndisponiveis: string[];
  coletivos: { titulo: string; horario: string; estado: string; severidade: string }[];
  acolhidos: {
    acolhidoId: string; nome: string; situacaoAtual: string;
    ultimoRegistro: { titulo: string; horario: string; estado: string } | null;
    proximaAtividade: { titulo: string; horario: string } | null;
    pendencias: number; alertaEssencial: string | null;
  }[];
}

export function Dia({ houseId, casaLabel, papel, irPara }: {
  houseId: string; casaLabel: string; papel: string;
  /** Leva a pessoa à tela que o evento aponta — ver `DESTINO` abaixo. */
  irPara: (aba: string) => void;
}) {
  const lidera = LIDERA.includes(papel);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<'agora' | 'minhas' | 'tudo' | 'os20'>('agora');
  const [painel, setPainel] = useState<PainelCasa | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** Qual atividade está com as ações do líder abertas — uma por vez. */
  const [maisAcoes, setMaisAcoes] = useState<string | null>(null);
  const [excecao, setExcecao] = useState<Evento | null>(null);
  /* Os aniversários da semana (fase 98). */
  const [festas, setFestas] = useState<Aniversariante[]>([]);
  /*
   * A DOSE CONFIRMADA AQUI (0930 + decisão de 08/09/2026).
   *
   * O provedor de linha do tempo do módulo de medicamentos manda, desde a fase
   * 12, a ação `medication.confirm` — e esta tela não sabia o que fazer com
   * ela. O efeito era mudo e caro: a dose aparecia na linha do educador, como
   * a Fundação pediu, e SEM BOTÃO NENHUM. Ele via que havia remédio às 22h e
   * não tinha por onde confirmar: a tela de Saúde não está no alcance do cargo
   * dele. A dose era dada — a criança precisa dela — e ficava sem registro,
   * que é exatamente o que este sistema existe para não deixar acontecer.
   */
  const [dosando, setDosando] = useState<Dose | null>(null);
  const [erroDose, setErroDose] = useState('');
  const [delegando, setDelegando] = useState<Evento | null>(null);
  const [porOutro, setPorOutro] = useState<Evento | null>(null);
  const [aviso, setAviso] = useState('');
  /** "Não vou conseguir levar o Bruno na fono" — quem VAI SAIR pede (§8.3). */
  const [pedindoSub, setPedindoSub] = useState<Evento | null>(null);
  const [urgente, setUrgente] = useState(false);
  const [substituicoes, setSubstituicoes] = useState<Substituicao[]>([]);
  const [decidindo, setDecidindo] = useState<Substituicao | null>(null);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      // A visão dos 20 é outra rota, e não um filtro da linha: ela agrupa POR
      // CRIANÇA, e agrupar no navegador daria uma lista diferente da que o
      // servidor monta — com as pendências contadas de outro jeito.
      if (filtro === 'os20') {
        setPainel(await api<PainelCasa>(`/timeline/house-panel?houseId=${houseId}`));
        return;
      }
      const q = filtro === 'minhas' ? '&mode=minhas' : '';
      setDados(await api<Resposta>(`/timeline?houseId=${houseId}${q}`));
      // Falhar aqui não trava o dia: sem a lista de pedidos, a linha do tempo
      // continua servindo o turno.
      setSubstituicoes(await api<Substituicao[]>(
        `/activities/substitutions?houseId=${houseId}`).catch(() => []));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o dia.');
    }
  }, [houseId, filtro]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    api<{ aniversariantes: Aniversariante[] }>(`/people/birthdays?houseId=${houseId}`)
      .then((r) => setFestas(r.aniversariantes))
      /* A festa não pode derrubar o Dia: se falhar, o turno continua. */
      .catch(() => setFestas([]));
  }, [houseId]);

  /**
   * "Agora" mostra a janela do momento: o que ainda não foi resolvido e o que
   * acabou de acontecer. Sem isso, no meio da tarde a tela abre nas 7h da
   * manhã e alguém precisa rolar até achar onde está.
   */
  const eventos = useMemo(() => {
    const lista = dados?.eventos ?? [];
    if (filtro !== 'agora') return lista;
    const agora = Date.now();
    const emAberto = lista.filter((e) => !FINALIZADOS.has(e.state));
    const recentes = lista.filter((e) =>
      FINALIZADOS.has(e.state) && Math.abs(new Date(e.at).getTime() - agora) < 2 * 3600_000);
    return [...emAberto, ...recentes].sort((a, b) => a.at.localeCompare(b.at));
  }, [dados, filtro]);

  /** Ação que não pertence a uma linha da agenda: pedido e atividade urgente. */
  async function acaoSolta(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try {
      const r = await fn();
      if (r?.aviso) setAviso(r.aviso);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
    }
  }

  const emAberto = substituicoes.filter((s) => s.status === 'solicitada');
  const decididos = substituicoes.filter((s) => s.status !== 'solicitada').slice(0, 5);

  async function acao(ev: Evento, fn: () => Promise<any>) {
    setOcupado(ev.id); setErro(''); setAviso('');
    try {
      const r = await fn();
      if (r?.aviso) setAviso(r.aviso);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar.');
    } finally {
      setOcupado(null);
    }
  }

  const idDe = (ev: Evento) => ev.id.split(':')[1] ?? ev.id;

  /**
   * Abre a folha da dose a partir do evento da linha do tempo.
   *
   * O evento não é a dose: ele traz título, estado e severidade, e a folha
   * precisa do medicamento, da via, do horário previsto e — o que mais
   * importa — do ALERTA DE ALERGIA. Por isso a dose é buscada na grade do dia
   * pelo id do evento (`dose:<uuid>`), em vez de montada com o que a linha
   * mostra: uma folha com meia informação, na hora de dar remédio, é pior que
   * folha nenhuma.
   */
  async function abrirDose(ev: Evento) {
    setErroDose('');
    setOcupado(ev.id);
    try {
      const grade = await api<Dose[]>(
        `/medications?houseId=${houseId}&personId=${ev.personId ?? ''}`);
      const dose = grade.find((d) => d.id === idDe(ev));
      if (!dose) {
        setErroDose('Esta dose não está mais na grade de hoje. Recarregue o dia.');
        return;
      }
      setDosando(dose);
    } catch (e) {
      setErroDose(e instanceof Error ? e.message : 'Não foi possível abrir a dose.');
    } finally {
      setOcupado(null);
    }
  }

  /**
   * A ação que sobrevive à falta de sinal (§17.1).
   *
   * Igual à `acao`, com uma diferença: sem internet, o registro fica guardado
   * neste aparelho com o horário em que a atividade aconteceu, e a linha do
   * dia NÃO é recarregada — recarregar sem servidor apagaria da tela o que a
   * pessoa acabou de registrar, e ela registraria de novo.
   */
  async function acaoComFila(
    ev: Evento, path: string, init: RequestInit, offline: AoEnfileirar,
  ) {
    setOcupado(ev.id); setErro(''); setAviso('');
    try {
      const r = await apiOuFila<{ aviso?: string }>(path, init, offline);
      if (r.recusa) { setErro(r.recusa); return; }
      if (r.enfileirada) {
        setAviso('Sem internet. O registro ficou guardado neste aparelho, com a hora de agora, e sobe quando a conexão voltar.');
        return;
      }
      if (r.resposta?.aviso) setAviso(r.resposta.aviso);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar.');
    } finally {
      setOcupado(null);
    }
  }

  const proximaFesta = festas.filter((f) => !f.ciente);

  return (
    <>
      {/*
        * ANIVERSÁRIO NA SEMANA (fase 98, pedido do Marcelo).
        *
        * Fica no alto do Dia, e não numa tela própria: ele pediu justamente
        * para ninguém precisar ir procurar — "pra não ter que ler papel na
        * parede". Some quando a casa se dá por ciente, porque aviso que não
        * some ensina a ignorar aviso. Quem já está ciente continua na lista
        * de quem abre a semana, mas sem a faixa.
        */}
      {proximaFesta.length > 0 && (
        <div className="notice c-brand" role="status">
          {proximaFesta.map((f) => (
            <div className="row" key={f.personId}>
              <span className="grow">
                <b className="ff">{f.nome}</b> faz {f.idadeQueFaz} anos <b>{f.quando}</b>.
              </span>
              <button className="btn sm ghost" onClick={async () => {
                await api(`/people/birthdays/${f.personId}/ack`, { method: 'POST', body: '{}' })
                  .catch(() => undefined);
                setFestas(await api<{ aniversariantes: Aniversariante[] }>(
                  `/people/birthdays?houseId=${houseId}`).then((r) => r.aniversariantes)
                  .catch(() => festas));
              }}>
                A casa está ciente
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="diahead">
        <div>
          <div className="eyebrow" style={{ margin: 0 }}>{casaLabel}</div>
          <h2>Hoje</h2>
        </div>
        {dados && filtro !== 'os20' && (
          <div className="resumo">
            <span className="pill c-info">{dados.resumo.total} no dia</span>
            {dados.resumo.criticos > 0 && (
              <span className="pill c-crit">{dados.resumo.criticos} crítico(s)</span>
            )}
            {dados.resumo.atencao > 0 && (
              <span className="pill c-warn">{dados.resumo.atencao} em atenção</span>
            )}
          </div>
        )}
      </div>

      <nav className="filtros" aria-label="Filtro do dia">
        {([['agora', 'Agora'], ['minhas', 'Minhas'], ['tudo', 'Tudo'],
           ['os20', 'Por criança']] as const).map(([cod, label]) => (
          <button key={cod} className={filtro === cod ? 'on' : ''}
                  aria-pressed={filtro === cod} onClick={() => setFiltro(cod)}>
            {label}
          </button>
        ))}
      </nav>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {/* A recusa da dose fica separada do erro do dia: ela é a que a pessoa
          precisa LER — "só a Enfermagem administra", "dose sem sinal não se
          confirma" — e some quando ela abre a folha de novo. */}
      {erroDose && <div className="notice c-crit" role="alert">{erroDose}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      {/* Transparência honesta: a tela diz quando está incompleta (§9). */}
      {filtro !== 'os20' && dados?.incompleta && (
        <div className="notice c-warn" role="status">
          Parte do dia não carregou ({dados.fontesIndisponiveis.join(', ')}). O que está
          aqui é verdadeiro; o que falta, falta — não confie nesta tela como lista completa
          até recarregar.
        </div>
      )}

      {filtro !== 'os20' && (
      <>
      {(() => {
        /* A legenda mostra só as categorias que o DIA tem. Uma legenda fixa de
           oito itens ensina a ignorá-la; uma que muda com o dia se lê. */
        const presentes = CATEGORIA.filter((c) => eventos.some((e) => categoriaDe(e.kind) === c));
        return presentes.length > 1 ? (
          <div className="legenda">
            {presentes.map((c) => (
              <span key={c.classe} className={`item ${c.classe}`}>
                <span className="ponto" aria-hidden="true" />
                {c.rotulo}
              </span>
            ))}
          </div>
        ) : null;
      })()}
      <ol className="linha">
        {eventos.map((ev) => (
          <li key={ev.id}
              className={`ev ${categoriaDe(ev.kind).classe} ${FINALIZADOS.has(ev.state) ? 'feito' : ''}`}>
            <div className="hora">{hhmm(ev.at)}</div>
            <div className="corpo">
              <div className="tit">
                <span className="ic"><Icone nome={ICONE[ev.kind] ?? 'ponto'} /></span>
                <b className="ff">{ev.title}</b>
              </div>
              {/* A categoria por EXTENSO. A borda colorida é o atalho; esta
                  linha é o que sobra na impressão em preto e branco. */}
              <div className="catrot">{categoriaDe(ev.kind).rotulo}</div>
              <div className="mutetxt">
                {ev.personName ?? 'Casa toda'}
                {ev.responsible ? ` · ${ev.responsible}` : ''}
              </div>
              <div className="estado">
                <span className={`pill ${TOM_SEVERIDADE[ev.severity]}`}>{ev.state}</span>
              </div>
              {ev.note && <div className="mutetxt">{ev.note}</div>}

              {(ev.actions ?? []).length > 0 && (
                <div className="acoes">
                  {ev.actions!.some((a) => a.command === 'activity.acknowledge') && (
                    <button className="btn sm ghost" disabled={ocupado === ev.id}
                            onClick={() => acaoComFila(ev,
                              `/activities/${idDe(ev)}/acknowledge`, { method: 'POST', body: '{}' },
                              { kind: 'activity.acknowledge', houseId, payload: { activityId: idDe(ev) } })}>
                      Estou ciente
                    </button>
                  )}
                  {/*
                    * AS AÇÕES QUE LEVAM A OUTRA TELA.
                    *
                    * Quatro módulos mandam ação de navegação para a linha do
                    * tempo desde a fase 12 — "Abrir chamada", "Assinar minha
                    * passagem", "Ver ATA", "Abrir ocorrência" — e esta tela
                    * não sabia o que fazer com nenhuma delas. O evento
                    * aparecia com o estado certo, a cor certa e NENHUM botão:
                    * "Chamada aberta — 4/12 conferidos" e nada para tocar.
                    * Quem está de plantão lê isso como "o sistema mostra e
                    * não deixa fazer", e volta ao papel.
                    */}
                  {ev.actions!.map((a) => DESTINO[a.command] && (
                    <button key={a.command} className="btn sm"
                            onClick={() => irPara(DESTINO[a.command])}>
                      {a.label}
                    </button>
                  ))}
                  {/* Pedir substituição: a mesma folha do "⋯", agora também
                      pela ação que o servidor manda. */}
                  {ev.actions!.some((a) => a.command === 'activity.substitution')
                    && maisAcoes !== ev.id && (
                    <button className="btn sm ghost" disabled={ocupado === ev.id}
                            onClick={() => setPedindoSub(ev)}>
                      Não vou conseguir
                    </button>
                  )}
                  {/* A dose: a mesma folha da tela de Saúde, com os mesmos
                      resultados e o mesmo alerta de alergia. */}
                  {ev.actions!.some((a) => a.command === 'medication.confirm') && (
                    <button className="btn sm" disabled={ocupado === ev.id}
                            onClick={() => abrirDose(ev)}>
                      Confirmar dose
                    </button>
                  )}
                  {ev.actions!.some((a) => a.command === 'activity.record') && (
                    <>
                      <button className="btn sm" disabled={ocupado === ev.id}
                              onClick={() => acaoComFila(ev,
                                `/activities/${idDe(ev)}/record`,
                                { method: 'POST', body: JSON.stringify({ estado: 'concluida_no_horario' }) },
                                { kind: 'activity.record', houseId,
                                  payload: { activityId: idDe(ev), estado: 'concluida_no_horario' } })}>
                        Concluí
                      </button>
                      <button className="btn sm ghost" disabled={ocupado === ev.id}
                              onClick={() => setExcecao(ev)}>
                        Não aconteceu
                      </button>
                      {/*
                        * AS AÇÕES DO LÍDER FICAM ATRÁS DE UM TOQUE.
                        *
                        * Registrar pelo colega e delegar são atos de quem
                        * conduz o turno, e não do plantão inteiro — mas ficavam
                        * lado a lado com "Concluí", com o mesmo tamanho. Numa
                        * tela de celular isso virava quatro botões iguais em
                        * três linhas por atividade: o cartão ficava mais alto
                        * que a própria atividade, e nenhum botão era o
                        * principal. Quem está com pressa toca no errado.
                        *
                        * O educador continua vendo dois botões. O líder vê os
                        * dois e um "⋯" que abre os dele.
                        *
                        * DELEGAR é o caminho de cima para baixo (§10), e é
                        * diferente de substituição: o pedido de substituição
                        * nasce de quem VAI SAIR; quem faltou não pede nada.
                        */}
                      {maisAcoes === ev.id && (
                        /* Pedir substituição é de QUALQUER pessoa do turno —
                           quem vai sair mais cedo é quem sabe que vai. */
                        <button className="btn sm ghost" disabled={ocupado === ev.id}
                                onClick={() => setPedindoSub(ev)}>
                          Não vou conseguir
                        </button>
                      )}
                      {!lidera && maisAcoes !== ev.id && (
                        <button className="btn sm ghost acoesmais" aria-expanded={false}
                                aria-label="Mais ações para esta atividade"
                                onClick={() => setMaisAcoes(ev.id)}>
                          ⋯
                        </button>
                      )}
                      {lidera && (
                        maisAcoes === ev.id ? (
                          <>
                            <button className="btn sm ghost" disabled={ocupado === ev.id}
                                    onClick={() => setPorOutro(ev)}>
                              Registrar pelo colega
                            </button>
                            <button className="btn sm ghost" disabled={ocupado === ev.id}
                                    onClick={() => setDelegando(ev)}>
                              Passar para outra pessoa
                            </button>
                          </>
                        ) : (
                          <button className="btn sm ghost acoesmais" aria-expanded={false}
                                  aria-label="Mais ações do líder para esta atividade"
                                  onClick={() => setMaisAcoes(ev.id)}>
                            ⋯
                          </button>
                        )
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      </>
      )}

      {/*
        * A VISÃO DOS 20 (§9).
        *
        * Uma linha por criança, em ordem alfabética — a mesma ordem sempre.
        * Serve à troca de turno e a quem passa na casa: "e a Alice, como
        * está?", sem rolar a cronologia inteira atrás do nome de cada uma.
        *
        * O contador de pendências fica NA LINHA e não ORDENA a lista: ordenar
        * por pendência produziria, todo dia, a mesma lista de crianças no
        * topo — que é ranking de acolhido, e é proibido (§3.3).
        */}
      {filtro === 'os20' && (
        <>
          {painel?.incompleta && (
            <div className="notice c-warn" role="status">
              Parte do dia não carregou ({painel.fontesIndisponiveis.join(', ')}). O que está
              aqui é verdadeiro; o que falta, falta.
            </div>
          )}

          {!painel && !erro && <p className="mutetxt">Abrindo…</p>}

          {painel && painel.coletivos.length > 0 && (
            <>
              <div className="eyebrow">Da casa toda · {painel.coletivos.length}</div>
              <ul className="lista">
                {painel.coletivos.map((c, i) => (
                  <li key={i} className="row">
                    <span className="hora">{hhmm(c.horario)}</span>
                    <span className="grow"><b className="ff">{c.titulo}</b></span>
                    <span className={`pill ${TOM_SEVERIDADE[c.severidade] ?? 'c-info'}`}>
                      {c.estado}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {painel && (
            <>
              <div className="eyebrow">
                Por criança · {painel.acolhidos.length} · em ordem alfabética
              </div>
              {painel.acolhidos.length === 0 && (
                <p className="mutetxt">Nenhum registro individual hoje.</p>
              )}
              <div className="stack">
                {painel.acolhidos.map((a) => (
                  <article className="card stack" key={a.acolhidoId}>
                    <div className="row">
                      <b className="ff grow">{a.nome}</b>
                      {a.pendencias > 0 && (
                        <span className="pill c-crit">
                          {a.pendencias} pendência(s)
                        </span>
                      )}
                    </div>

                    {/* O alerta essencial primeiro: é o que muda o que a
                        pessoa vai fazer nos próximos minutos. */}
                    {a.alertaEssencial && (
                      <div className="notice c-crit" role="alert">⚠ {a.alertaEssencial}</div>
                    )}

                    <div className="mutetxt">{a.situacaoAtual}</div>

                    {a.ultimoRegistro && (
                      <div className="mutetxt">
                        Último: {hhmm(a.ultimoRegistro.horario)} · {a.ultimoRegistro.titulo}
                        {' · '}{a.ultimoRegistro.estado}
                      </div>
                    )}
                    {a.proximaAtividade ? (
                      <div className="mutetxt">
                        A seguir: {hhmm(a.proximaAtividade.horario)} · {a.proximaAtividade.titulo}
                      </div>
                    ) : (
                      <div className="mutetxt">Nada previsto até o fim do dia.</div>
                    )}
                  </article>
                ))}
              </div>
              <p className="mutetxt" style={{ marginTop: 12 }}>
                Esta lista não é ordenada por número de pendências, e não conta nada por
                educador. Ela responde "como está cada um agora" — não "quem dá mais
                trabalho".
              </p>
            </>
          )}
        </>
      )}

      {/*
        * O "SE NECESSÁRIO" (fase 132).
        *
        * Fica DEPOIS da linha do tempo e não dentro dela, e por uma razão: a
        * prescrição "quando necessário" NÃO É uma dose marcada. Pô-la na linha
        * faria a casa ver, todo dia, um remédio pendente que ninguém deve dar —
        * e tela cheia de pendência impossível é tela que a equipe aprende a não
        * olhar (é o mesmo argumento da dose da criança internada).
        *
        * E fica NO DIA, e não na tela de Saúde, porque quem dá a dose das 2h é o
        * educador — e o educador não alcança a tela de Saúde (§7).
        */}
      <SeNecessario houseId={houseId} />

      {/*
        * OS PEDIDOS DE SUBSTITUIÇÃO EM ABERTO.
        *
        * Ficam DEPOIS da linha do tempo e não dentro dela: o pedido não é uma
        * atividade, é um recado esperando decisão. Enquanto ele espera, a
        * atividade continua na linha, marcada — e quem decide precisa ver os
        * dois lugares.
        */}
      {emAberto.length > 0 && (
        <>
          <div className="eyebrow">Pedidos de substituição · {emAberto.length}</div>
          <div className="stack">
            {emAberto.map((s) => (
              <article className="card" key={s.id}>
                <div className="row">
                  <div className="grow">
                    <b className="ff">{s.atividade}</b>
                    <div className="mutetxt linhadois">
                      {hhmm(s.horario)} · pedido por {s.pedidoPor}
                    </div>
                  </div>
                  <span className="pill c-warn">Aguardando</span>
                </div>
                <p style={{ margin: '8px 0 0' }}>{s.motivo}</p>
                {/* O pedido ficou sem sentido enquanto esperava: o servidor diz
                    isso, e a tela mostra ANTES de a pessoa tentar decidir. */}
                {s.semEfeito && s.aviso && (
                  <div className="notice c-mute" style={{ marginTop: 8 }}>{s.aviso}</div>
                )}
                {DECIDE_SUB.includes(papel) && (
                  <button className="btn sec sm" onClick={() => setDecidindo(s)}>
                    Decidir
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {/* Os pedidos já decididos ficam legíveis: quem pediu precisa poder ver
          a recusa e o motivo dela sem perguntar a ninguém. */}
      {decididos.length > 0 && (
        <>
          <div className="eyebrow">Substituições decididas hoje</div>
          <ul className="lista">
            {decididos.map((s) => (
              <li key={s.id} className="row">
                <div className="grow">
                  <b className="ff">{s.atividade}</b>
                  <div className="mutetxt linhadois">
                    pedido por {s.pedidoPor}
                    {s.substituto ? ` · assumida por ${s.substituto}` : ''}
                  </div>
                  {s.decidiuNota && <div className="mutetxt">{s.decidiuNota}</div>}
                </div>
                {/* `atribuida` é o valor do banco; "Assumida" é o que a casa diz. */}
                <span className={`pill ${s.status === 'atribuida' ? 'c-ok' : 'c-mute'}`}>
                  {s.status === 'atribuida' ? 'Assumida' : 'Recusada'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* A ATIVIDADE URGENTE (§8.2): o que apareceu agora e não estava na
          agenda. Fica no fim porque é exceção, e exceção não abre a tela. */}
      {CRIA_URGENTE.includes(papel) && (
        <button className="btn sec block" style={{ marginTop: 16 }} onClick={() => setUrgente(true)}>
          + Atividade urgente
        </button>
      )}

      {dados && eventos.length === 0 && (
        <div className="card">
          <p className="mutetxt" style={{ margin: 0 }}>
            {filtro === 'agora'
              ? 'Nada em aberto agora. Toque em "Tudo" para ver o dia inteiro.'
              : filtro === 'minhas'
                ? 'Nada atribuído a você hoje. O que é do plantão aparece em "Tudo".'
                : 'O dia ainda não foi gerado. Fale com o Líder Diurno.'}
          </p>
        </div>
      )}

      {porOutro && (
        <FolhaPorOutro
          evento={porOutro}
          houseId={houseId}
          onFechar={() => setPorOutro(null)}
          onRegistrar={async (realizadoPor, motivo) => {
            const ev = porOutro;
            setPorOutro(null);
            await acao(ev, () => api(`/activities/${idDe(ev)}/record`, {
              method: 'POST',
              body: JSON.stringify({
                estado: 'concluida_no_horario',
                realizadoPor, motivoRegistroPorOutro: motivo,
              }),
            }));
          }}
        />
      )}

      {pedindoSub && (
        <FolhaMotivoSimples
          titulo={`Não vou conseguir · ${pedindoSub.title}`}
          explicacao={'O pedido fica EM ABERTO até o líder do turno, a equipe técnica ou a '
            + 'coordenação decidir — e a atividade continua na linha do dia, marcada como '
            + 'aguardando substituição. Ninguém é dado como substituído sozinho.'}
          rotulo="Por que você não vai conseguir"
          exemplo="Ex.: preciso sair às 16h para uma consulta; a fono do Bruno é às 15h e volto tarde."
          botao="Pedir substituição"
          onFechar={() => setPedindoSub(null)}
          onEnviar={async (motivo) => {
            const ev = pedindoSub;
            setPedindoSub(null);
            await acao(ev, () => api(`/activities/${idDe(ev)}/substitution`, {
              method: 'POST', body: JSON.stringify({ motivo }) }));
          }} />
      )}

      {decidindo && (
        <FolhaDecidirSub
          pedido={decidindo} houseId={houseId}
          onFechar={() => setDecidindo(null)}
          onAssumir={async (substitutoId, nota) => {
            const p = decidindo; setDecidindo(null);
            await acaoSolta(() => api(`/activities/substitutions/${p.id}/assign`, {
              method: 'POST', body: JSON.stringify({ substitutoId, nota }) }));
          }}
          onRecusar={async (motivo) => {
            const p = decidindo; setDecidindo(null);
            await acaoSolta(() => api(`/activities/substitutions/${p.id}/decline`, {
              method: 'POST', body: JSON.stringify({ motivo }) }));
          }} />
      )}

      {urgente && (
        <FolhaUrgente
          houseId={houseId}
          onFechar={() => setUrgente(false)}
          onCriar={async (dados) => {
            setUrgente(false);
            await acaoSolta(() => api('/activities/urgent', {
              method: 'POST', body: JSON.stringify({ houseId, ...dados }) }));
          }} />
      )}

      {delegando && (
        <FolhaDelegar
          evento={delegando}
          houseId={houseId}
          onFechar={() => setDelegando(null)}
          onDelegar={async (paraId, motivo) => {
            const ev = delegando;
            setDelegando(null);
            await acao(ev, () => api(`/activities/${idDe(ev)}/delegate`, {
              method: 'POST', body: JSON.stringify({ paraId, motivo }),
            }));
          }} />
      )}

      {excecao && (
        <FolhaExcecao
          evento={excecao}
          onFechar={() => setExcecao(null)}
          onRegistrar={async (estado, nota) => {
            const ev = excecao;
            setExcecao(null);
            await acaoComFila(ev,
              `/activities/${idDe(ev)}/record`,
              { method: 'POST', body: JSON.stringify({ estado, nota }) },
              { kind: 'activity.record', houseId, payload: { activityId: idDe(ev), estado, nota } });
          }}
        />
      )}

      {/*
        * A DOSE, NA LINHA DO TEMPO.
        *
        * Sem fila offline, e isso é regra do servidor desde a 0930: dose não
        * se confirma sem sinal, em aparelho nenhum. Guardar a confirmação no
        * celular devolveria a mesma dose confirmada duas vezes por duas
        * pessoas que não se enxergam — e as duas só descobririam horas depois.
        */}
      {dosando && (
        <FolhaDose
          dose={dosando}
          onFechar={() => setDosando(null)}
          onConfirmar={async (estado, nota) => {
            const id = dosando.id;
            setDosando(null);
            setErroDose('');
            setOcupado(`dose:${id}`);
            try {
              const r = await api<{ aviso?: string }>(`/medications/doses/${id}/confirm`, {
                method: 'POST', body: JSON.stringify({ estado, nota }),
              });
              if (r?.aviso) setAviso(r.aviso);
              await carregar();
            } catch (e) {
              setErroDose(e instanceof Error ? e.message : 'Não foi possível confirmar a dose.');
            } finally {
              setOcupado(null);
            }
          }}
        />
      )}
    </>
  );
}

/**
 * Registrar pelo colega (§8.2).
 *
 * A tela existe porque o caso é real: a atividade aconteceu, o aparelho da
 * casa não pegou e o educador não usa o próprio celular. Sem isto, o buraco no
 * histórico — que é pior do que qualquer registro imperfeito, porque é o que
 * ninguém sabe explicar meses depois.
 *
 * O que ela NÃO faz: assinar no lugar de alguém. Os dois nomes ficam, e o
 * aviso na própria folha diz isso antes de a pessoa confirmar — quem registra
 * precisa saber que o nome dele vai junto.
 */
function FolhaPorOutro({ evento, houseId, onFechar, onRegistrar }: {
  evento: Evento;
  houseId: string;
  onFechar: () => void;
  onRegistrar: (realizadoPor: string, motivo: string) => void;
}) {
  const [equipe, setEquipe] = useState<{ id: string; nome: string }[]>([]);
  const [quem, setQuem] = useState('');
  const [motivo, setMotivo] = useState('');
  const pode = quem !== '' && motivo.trim().length >= 5;

  useEffect(() => {
    // A rota devolve `{equipe}` na agenda e lista simples em outros pontos;
    // aceitar os dois formatos evita que a folha fique vazia por um detalhe
    // de contrato — e uma folha vazia às 23h é a folha que ninguém usa.
    api<any>(`/activities/agenda/staff?houseId=${houseId}`)
      .then((r) => setEquipe(Array.isArray(r) ? r : (r?.equipe ?? [])))
      .catch(() => setEquipe([]));
  }, [houseId]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-por"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-por">Quem realizou?</h3>
        <p className="mutetxt">{evento.title} · {hhmm(evento.at)} · {evento.personName ?? 'Casa toda'}</p>

        <label className="f" htmlFor="quem">A pessoa que realizou a atividade</label>
        <select id="quem" value={quem} onChange={(e) => setQuem(e.target.value)}>
          <option value="">Escolha…</option>
          {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        <label className="f" htmlFor="motivo">
          Por que você está registrando no lugar dela <small>— o fato, não a justificativa</small>
        </label>
        <textarea id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: o aparelho da casa ficou sem sinal e ela não tem acesso pelo celular." />

        <div className="notice c-info" role="status">
          A atividade vai mostrar os <strong>dois nomes</strong>: quem realizou e você, que
          registrou, com este motivo. Ninguém assina no lugar de ninguém.
        </div>

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!pode}
                  onClick={() => onRegistrar(quem, motivo.trim())}>
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
}

const FINALIZADOS = new Set([
  'Concluída no horário', 'Concluída com atraso', 'Reagendada', 'Cancelada externamente',
  'Recusada pelo acolhido', 'Não realizada — saúde', 'Não realizada — ausência profissional',
  'Não realizada — transporte', 'Não realizada — decisão institucional', 'Não aplicável',
]);

/**
 * A folha da exceção.
 *
 * Duas exigências que não são burocracia: a opção diz O QUE aconteceu, e o
 * texto diz o FATO. "Recusada pelo acolhido" sem contexto vira, no relatório
 * de daqui a três meses, uma característica da criança — e não era isso que
 * o educador quis dizer às 19h de uma terça.
 */
function FolhaExcecao({ evento, onFechar, onRegistrar }: {
  evento: Evento;
  onFechar: () => void;
  onRegistrar: (estado: string, nota: string) => void;
}) {
  const [estado, setEstado] = useState('');
  const [nota, setNota] = useState('');
  const podeRegistrar = estado !== '' && nota.trim().length >= 5;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-exc"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-exc">O que aconteceu?</h3>
        <p className="mutetxt">{evento.title} · {hhmm(evento.at)} · {evento.personName ?? 'Casa toda'}</p>

        <div className="opts">
          {EXCECOES.map((x) => (
            <button key={x.cod} type="button" className={`opt c-warn`}
                    aria-pressed={estado === x.cod} onClick={() => setEstado(x.cod)}>
              {x.label}
            </button>
          ))}
        </div>

        <label className="f" htmlFor="nota">
          O fato <small>— o que aconteceu, sem rótulo sobre a pessoa</small>
        </label>
        <textarea id="nota" value={nota} onChange={(e) => setNota(e.target.value)}
                  placeholder="Ex.: o transporte não chegou até as 14h30; a clínica remarcou para sexta." />

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!podeRegistrar}
                  onClick={() => onRegistrar(estado, nota.trim())}>
            Registrar
          </button>
        </div>
        {!podeRegistrar && (
          <p className="mutetxt" style={{ marginBottom: 0 }}>
            Escolha o que aconteceu e descreva o fato — é o que a próxima pessoa vai ler.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * PASSAR A ATIVIDADE PARA OUTRA PESSOA (§10).
 *
 * Delegar não é substituir. A substituição nasce de quem VAI SAIR e pede;
 * quem faltou não pede nada, e é aí que a atividade some. Delegar é o caminho
 * de cima para baixo: o líder passa adiante, com motivo, sem apagar a
 * designação anterior — e a atividade volta a AGUARDAR CIÊNCIA, porque
 * designado não é o mesmo que avisado.
 */
function FolhaDelegar({ evento, houseId, onFechar, onDelegar }: {
  evento: Evento; houseId: string;
  onFechar: () => void; onDelegar: (paraId: string, motivo: string) => void;
}) {
  const [equipe, setEquipe] = useState<{ id: string; nome: string }[]>([]);
  const [quem, setQuem] = useState('');
  const [motivo, setMotivo] = useState('');
  const pode = quem !== '' && motivo.trim().length >= 5;

  useEffect(() => {
    api<any>(`/activities/agenda/staff?houseId=${houseId}`)
      .then((r) => setEquipe(Array.isArray(r) ? r : (r?.equipe ?? [])))
      .catch(() => setEquipe([]));
  }, [houseId]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-del"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-del">Passar para outra pessoa</h3>
        <p className="mutetxt">
          {evento.title} · {hhmm(evento.at)} · {evento.personName ?? 'Casa toda'}
        </p>
        <div className="notice c-info">
          A designação anterior <b>não é apagada</b>, e a atividade volta a aguardar
          ciência: quem recebe precisa dizer que soube.
        </div>

        <label className="f" htmlFor="del-quem">Quem assume</label>
        <select id="del-quem" value={quem} onChange={(e) => setQuem(e.target.value)}>
          <option value="">Escolha…</option>
          {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        <label className="f" htmlFor="del-motivo">
          Motivo <small>— quem recebe vai ler, e fica no histórico</small>
        </label>
        <textarea id="del-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: Mário foi acompanhar a Lara na consulta; Joana assume o reforço." />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onDelegar(quem, motivo)}>
            Passar adiante
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * FOLHA DE MOTIVO — o pedido de substituição.
 *
 * O motivo é o que a próxima pessoa vai ler para decidir. "Não posso" não
 * decide nada; "saio às 16h e a fono é às 15h" decide na hora.
 */
function FolhaMotivoSimples({ titulo, explicacao, rotulo, exemplo, botao, onFechar, onEnviar }: {
  titulo: string; explicacao: string; rotulo: string; exemplo: string; botao: string;
  onFechar: () => void; onEnviar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const pode = motivo.trim().length >= 15;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-sub"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-sub">{titulo}</h3>
        <div className="notice c-info">{explicacao}</div>
        <label className="f" htmlFor="sub-txt">
          {rotulo} <small>— pelo menos 15 caracteres</small>
        </label>
        <textarea id="sub-txt" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder={exemplo} />
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onEnviar(motivo.trim())}>
            {botao}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * FOLHA DA DECISÃO — assumir ou recusar um pedido.
 *
 * Recusar EXIGE motivo, e o servidor avisa quem pediu. É o que substitui o
 * recado no corredor: a pessoa que ia sair mais cedo precisa saber, antes de
 * sair, que ninguém vai cobrir — e precisa saber por quê.
 */
function FolhaDecidirSub({ pedido, houseId, onFechar, onAssumir, onRecusar }: {
  pedido: { id: string; atividade: string; motivo: string; pedidoPor: string; semEfeito: boolean };
  houseId: string; onFechar: () => void;
  onAssumir: (substitutoId: string, nota?: string) => void;
  onRecusar: (motivo: string) => void;
}) {
  const [equipe, setEquipe] = useState<{ id: string; nome: string; cargo: string }[]>([]);
  const [quem, setQuem] = useState('');
  const [nota, setNota] = useState('');
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    api<any>(`/activities/agenda/staff?houseId=${houseId}`)
      .then((r) => setEquipe(r?.equipe ?? r ?? []))
      .catch(() => setEquipe([]));
  }, [houseId]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-dec"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-dec">{pedido.atividade}</h3>
        <div className="bloco">
          <small>O que {pedido.pedidoPor} escreveu</small>
          {pedido.motivo}
        </div>

        {pedido.semEfeito && (
          <div className="notice c-warn">
            A atividade já foi encerrada enquanto o pedido esperava. Não cabe substituir o que já
            aconteceu — recusar, com o motivo, é o caminho que fecha isto sem apagar nada.
          </div>
        )}

        {!recusando ? (
          <>
            <label className="f" htmlFor="dec-quem">Quem assume</label>
            <select id="dec-quem" value={quem} onChange={(e) => setQuem(e.target.value)}>
              <option value="">Escolha…</option>
              {equipe.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
            <label className="f" htmlFor="dec-nota">Observação <small>— opcional</small></label>
            <input id="dec-nota" value={nota} onChange={(e) => setNota(e.target.value)}
                   placeholder="Ex.: combinei com a Joana; ela já leva a Alice na mesma clínica." />
            <p className="mutetxt">
              Quem assume recebe o aviso e precisa tomar ciência — o sistema não dá ninguém como
              avisado por ter sido escolhido.
            </p>
            <div className="row rodape">
              <button className="btn sec grow" onClick={() => setRecusando(true)}>
                Não vai ter substituto
              </button>
              <button className="btn grow" disabled={!quem}
                      onClick={() => onAssumir(quem, nota.trim() || undefined)}>
                Passar para esta pessoa
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="f" htmlFor="dec-mot">
              Por que não vai ter substituto <small>— quem pediu vai ler</small>
            </label>
            <textarea id="dec-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex.: não há outra pessoa na escala hoje; a consulta será remarcada pela técnica." />
            <div className="row rodape">
              <button className="btn sec grow" onClick={() => setRecusando(false)}>Voltar</button>
              <button className="btn grow" disabled={motivo.trim().length < 10}
                      onClick={() => onRecusar(motivo.trim())}>
                Recusar, com este motivo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * FOLHA DA ATIVIDADE URGENTE (§8.2).
 *
 * O que apareceu agora e não estava na agenda: a consulta que foi encaixada, a
 * ida ao Conselho, a visita que remarcou. Ela é PONTUAL — não muda a rotina da
 * casa, e a tela diz isso, porque é a confusão mais fácil de fazer: quem quer
 * mudar o horário da janta para sempre precisa da tela da Rotina.
 */
function FolhaUrgente({ houseId, onFechar, onCriar }: {
  houseId: string; onFechar: () => void;
  onCriar: (d: { title: string; scheduledAt: string; reason: string;
                 personId?: string; instructions?: string }) => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [quando, setQuando] = useState('');
  const [motivo, setMotivo] = useState('');
  const [pessoa, setPessoa] = useState('');
  const [instrucoes, setInstrucoes] = useState('');
  const [acolhidos, setAcolhidos] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    api<{ id: string; nome: string }[]>(`/people?houseId=${houseId}`)
      .then(setAcolhidos).catch(() => setAcolhidos([]));
  }, [houseId]);

  const pode = titulo.trim().length >= 3 && quando !== '' && motivo.trim().length >= 10;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-urg"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-urg">Atividade urgente</h3>
        <div className="notice c-info">
          Isto é <b>pontual</b>: entra no dia de hoje, com autoria e motivo, e <b>não altera a
          rotina da casa</b>. Para mudar o horário de sempre, o caminho é a tela da Rotina — e
          lá a mudança abre versão nova.
        </div>

        <label className="f" htmlFor="urg-tit">O que é</label>
        <input id="urg-tit" value={titulo} onChange={(e) => setTitulo(e.target.value)}
               placeholder="Ex.: Consulta encaixada na UBS" />

        <label className="f" htmlFor="urg-quando">Quando</label>
        <input id="urg-quando" type="datetime-local" value={quando}
               onChange={(e) => setQuando(e.target.value)} />

        <label className="f" htmlFor="urg-quem">
          De quem <small>— em branco, é da casa toda</small>
        </label>
        <select id="urg-quem" value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
          <option value="">Da casa toda</option>
          {acolhidos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>

        <label className="f" htmlFor="urg-mot">
          Por que ela é urgente <small>— fica registrado com o seu nome</small>
        </label>
        <textarea id="urg-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: a UBS ligou agora oferecendo a vaga que estava na fila desde março." />

        <label className="f" htmlFor="urg-ins">
          Como se faz <small>— opcional, e é o que evita a pergunta no meio do turno</small>
        </label>
        <textarea id="urg-ins" value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)}
                  placeholder="Ex.: levar a carteirinha e a caderneta de vacinação; a van sai às 13h30." />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onCriar({
            title: titulo.trim(), scheduledAt: new Date(quando).toISOString(),
            reason: motivo.trim(), personId: pessoa || undefined,
            instructions: instrucoes.trim() || undefined,
          })}>
            Registrar atividade urgente
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* O "SE NECESSÁRIO" (fase 132).                                              */
/* -------------------------------------------------------------------------- */

interface PrnDisponivel {
  prescricaoId: string;
  acolhido: { id: string; nome: string };
  medicamento: string; dose: string; via: string;
  condicao: string | null;
  soEnfermagem: boolean; motivoSoEnfermagem: string | null;
  vezesHoje: number;
}
interface PrnDada {
  doseId: string; prescricaoId: string; acolhido: string;
  medicamento: string; dose: string; hora: string;
  motivo: string; desfecho: string | null; quemDeu: string | null;
}

/**
 * A MEDICAÇÃO "QUANDO NECESSÁRIO", REGISTRADA POR QUEM DÁ (1390).
 *
 * Esta é a dose que o educador dá às 2h da manhã, sozinho, quando a criança
 * acorda com febre — e que até a fase 132 era dada e **não ficava em lugar
 * nenhum**: a prescrição "quando necessário" não tem horário, então não gera
 * dose, e a única porta de confirmação exigia uma dose que já existisse.
 *
 * O bloco é um só e mostra as duas metades da mesma pergunta:
 *
 *  * **o que se pode dar** — com a condição escrita pela Enfermagem na frente
 *    de quem decide ("se a febre passar de 38°C"), porque quem decide de
 *    madrugada não vai a outra tela conferir;
 *  * **o que já foi dado hoje** — com o motivo e o nome de quem deu. É o número
 *    que faz alguém parar antes da terceira dose da mesma noite, e é o registro
 *    de que a Enfermagem precisa às 9h para decidir se aquilo vira prescrição.
 *
 * O desfecho ("o que aconteceu depois") **não tem prazo e não gera pendência** —
 * é a correção que a Fundação fez em 16/09 sobre o relato da convivência.
 * Cobrança com prazo sobre quem cuidou da criança de madrugada tem uma só forma
 * de ser baixada, e não é a boa.
 */
function SeNecessario({ houseId }: { houseId: string }) {
  const [disponiveis, setDisponiveis] = useState<PrnDisponivel[]>([]);
  const [dadasHoje, setDadasHoje] = useState<PrnDada[]>([]);
  const [dando, setDando] = useState<PrnDisponivel | null>(null);
  const [contando, setContando] = useState<PrnDada | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ disponiveis: PrnDisponivel[]; dadasHoje: PrnDada[] }>(
        `/medications/prn?houseId=${houseId}`);
      setDisponiveis(r.disponiveis); setDadasHoje(r.dadasHoje);
    } catch {
      /* Sem a lista, o resto do Dia continua servindo o turno. */
      setDisponiveis([]); setDadasHoje([]);
    }
  }, [houseId]);
  useEffect(() => { carregar(); }, [carregar]);

  /* Casa sem prescrição "quando necessário" não vê bloco vazio: o Dia é a tela
     mais usada do sistema, e espaço gasto aqui é rolagem no meio do turno. */
  if (disponiveis.length === 0 && dadasHoje.length === 0) return null;

  async function registrar(p: PrnDisponivel, dados: { motivo: string; quando?: string; nota?: string }) {
    setErro(''); setAviso('');
    try {
      const r = await api<{ aviso?: string }>(
        `/medications/prescriptions/${p.prescricaoId}/prn`,
        { method: 'POST', body: JSON.stringify(dados) });
      setDando(null);
      if (r?.aviso) setAviso(r.aviso);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar a dose.');
    }
  }

  async function contar(d: PrnDada, desfecho: string) {
    setErro(''); setAviso('');
    try {
      const r = await api<{ aviso?: string }>(`/medications/doses/${d.doseId}/prn-outcome`,
        { method: 'POST', body: JSON.stringify({ desfecho }) });
      setContando(null);
      if (r?.aviso) setAviso(r.aviso);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar o desfecho.');
    }
  }

  return (
    <>
      <div className="eyebrow">Se necessário · {disponiveis.length}</div>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      <div className="stack">
        {disponiveis.map((p) => (
          <article className="card" key={p.prescricaoId}>
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <div>
                <strong>{p.acolhido.nome}</strong>
                <div className="mutetxt">{p.medicamento} · {p.dose} · {p.via}</div>
              </div>
              {/* Contagem, não julgamento: o número diz quantas vezes foi preciso,
                  e é da Enfermagem a leitura do que isso significa. */}
              {p.vezesHoje > 0 && (
                <span className="pill c-info">
                  {p.vezesHoje === 1 ? 'dada 1× hoje' : `dada ${p.vezesHoje}× hoje`}
                </span>
              )}
            </div>

            {p.condicao && (
              <p style={{ margin: '8px 0 0' }}>
                <span className="mutetxt">Só se: </span>{p.condicao}
              </p>
            )}
            {p.soEnfermagem && (
              <p style={{ margin: '8px 0 0' }}>
                <span className="pill c-warn">Só a Enfermagem administra</span>
                {p.motivoSoEnfermagem && <span className="mutetxt"> — {p.motivoSoEnfermagem}</span>}
              </p>
            )}

            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn grow" onClick={() => setDando(p)}>
                Registrar que foi dado
              </button>
            </div>
          </article>
        ))}
      </div>

      {dadasHoje.length > 0 && (
        <>
          <div className="eyebrow">Dadas hoje · {dadasHoje.length}</div>
          <div className="stack">
            {dadasHoje.map((d) => (
              <article className="card" key={d.doseId}>
                <div>
                  <strong>{d.hora} · {d.acolhido}</strong>
                  <div className="mutetxt">
                    {d.medicamento} · {d.dose}{d.quemDeu ? ` · por ${d.quemDeu}` : ''}
                  </div>
                </div>
                <p style={{ margin: '8px 0 0' }}>
                  <span className="mutetxt">Motivo: </span>{d.motivo}
                </p>
                {d.desfecho ? (
                  <p style={{ margin: '8px 0 0' }}>
                    <span className="mutetxt">Depois: </span>{d.desfecho}
                  </p>
                ) : (
                  <div className="row" style={{ marginTop: 12 }}>
                    <button type="button" className="btn sec grow" onClick={() => setContando(d)}>
                      Escrever o que aconteceu depois
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          {dadasHoje.some((d) => !d.desfecho) && (
            /* Dito em palavra, e não em cor: não é pendência, e a tela não deve
               deixar dúvida sobre isso para quem vai dormir depois do plantão. */
            <p className="mutetxt">
              O que aconteceu depois pode ser escrito quando se souber — não há prazo,
              e ninguém vai cobrar.
            </p>
          )}
        </>
      )}

      {dando && (
        <FolhaSeNecessario prescricao={dando} onFechar={() => setDando(null)}
                           onRegistrar={(dados) => registrar(dando, dados)} />
      )}
      {contando && (
        <FolhaDesfecho dose={contando} onFechar={() => setContando(null)}
                       onRegistrar={(t) => contar(contando, t)} />
      )}
    </>
  );
}

/**
 * A FOLHA DE REGISTRO DA DOSE "QUANDO NECESSÁRIO".
 *
 * O motivo é obrigatório com dez caracteres, o mesmo piso do relato (0300), e
 * ele existe porque *"febre"* não diz à Enfermagem das 9h o que ela precisa
 * saber. A condição da prescrição fica visível enquanto se escreve: quem decide
 * às 2h precisa dela na frente.
 */
function FolhaSeNecessario({ prescricao, onFechar, onRegistrar }: {
  prescricao: PrnDisponivel;
  onFechar: () => void;
  onRegistrar: (dados: { motivo: string; quando?: string; nota?: string }) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [hora, setHora] = useState('');
  const [nota, setNota] = useState('');
  const pode = motivo.trim().length >= 10;

  /**
   * A HORA, quando não é agora — e a virada da meia-noite.
   *
   * O plantão noturno atravessa o dia: quem registra às 00h30 a dose que deu às
   * 23h50 está falando de ANTES, não de daqui a 23 horas. Por isso, hora que
   * cairia no futuro é lida como a de ontem — e o servidor recusa futuro de
   * qualquer forma, porque dose que "será dada" não é dose dada.
   */
  function quandoISO(): string | undefined {
    if (!hora) return undefined;
    const [h, m] = hora.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
    return d.toISOString();
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-prn"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-prn">Registrar {prescricao.medicamento}</h3>
        <p className="mutetxt">
          {prescricao.acolhido.nome} · {prescricao.dose} · {prescricao.via}
        </p>
        {prescricao.condicao && (
          <p><span className="mutetxt">A orientação diz: </span>{prescricao.condicao}</p>
        )}

        <label className="f" htmlFor="prn-mot">
          Por que foi preciso agora <small>— é o que a Enfermagem vai ler amanhã</small>
        </label>
        <textarea id="prn-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: acordou às 2h com 38,4°C, queixando dor de cabeça; ofereci água antes." />

        <label className="f" htmlFor="prn-hora">
          A hora <small>— em branco, fica a de agora</small>
        </label>
        <input id="prn-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />

        <label className="f" htmlFor="prn-nota">
          Observação <small>— opcional</small>
        </label>
        <textarea id="prn-nota" value={nota} onChange={(e) => setNota(e.target.value)}
                  placeholder="Ex.: tomou com suco; voltou a dormir em 20 minutos." />

        <div className="row rodape">
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!pode}
                  onClick={() => onRegistrar({
                    motivo: motivo.trim(), quando: quandoISO(),
                    nota: nota.trim() || undefined,
                  })}>
            Registrar com o meu nome
          </button>
        </div>
        {!pode && (
          <p className="mutetxt" style={{ marginBottom: 0 }}>
            Escreva o que aconteceu — "febre" sozinho não diz à Enfermagem se deve virar
            prescrição.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * O DESFECHO, escrito depois — e uma vez (1390).
 *
 * Escrito uma vez porque nada se sobrescreve (§5.1): a primeira observação é
 * justamente a que a Enfermagem compara. A folha diz isso antes de salvar.
 */
function FolhaDesfecho({ dose, onFechar, onRegistrar }: {
  dose: PrnDada;
  onFechar: () => void;
  onRegistrar: (desfecho: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const pode = texto.trim().length >= 10;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-prn-d"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-prn-d">O que aconteceu depois?</h3>
        <p className="mutetxt">
          {dose.hora} · {dose.acolhido} · {dose.medicamento}
        </p>
        <p><span className="mutetxt">Foi dado porque: </span>{dose.motivo}</p>

        <label className="f" htmlFor="prn-desf">
          O que se observou <small>— em quanto tempo, e se voltou</small>
        </label>
        <textarea id="prn-desf" value={texto} onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ex.: a febre cedeu em cerca de 40 minutos; dormiu até as 7h e não voltou." />

        <div className="row rodape">
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!pode}
                  onClick={() => onRegistrar(texto.trim())}>
            Registrar
          </button>
        </div>
        <p className="mutetxt" style={{ marginBottom: 0 }}>
          Escreve-se uma vez e não se reescreve: é esta observação que a Enfermagem compara
          com a próxima.
        </p>
      </div>
    </div>
  );
}
