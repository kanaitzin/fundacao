import { useCallback, useEffect, useState } from 'react';
import { Dossie } from './Dossie';
import { api, ErroApi } from '../api';
import { Cadastro } from './Cadastro';

/**
 * OS ACOLHIDOS DA CASA e o PERFIL (§6, §13).
 *
 * O educador abre esta tela no meio do turno, por um motivo concreto: vai dar
 * o almoço e não lembra se a criança tem restrição; vai levar à escola e
 * precisa da série; a criança se queixa de dor e ele quer saber o que a
 * Enfermagem já sabe. A tela é feita para essas perguntas, nessa ordem.
 *
 * O que a ordem diz, e por quê:
 *
 *  * **alerta essencial e restrição alimentar primeiro, sempre.** Antes do
 *    nome da escola, antes de qualquer dado estrutural. São os dois campos em
 *    que errar machuca no mesmo dia;
 *  * **o dia da criança vem antes do cadastro dela.** Remédio de hoje e
 *    cuidado essencial acima de documento e memória;
 *  * **o motivo judicial não abre junto com o perfil.** Fica atrás de um
 *    toque, para a equipe técnica e a coordenação, e cada abertura é
 *    registrada. Ninguém precisa do processo para dar o jantar (§13.1);
 *  * **o que este papel não pode ver aparece como CONTAGEM, não some.** "3
 *    documentos em área restrita" é honesto; esconder que existem faria a
 *    equipe procurar noutro lugar.
 */

interface Resumo {
  id: string; nome: string; idade: number;
  alertasEssenciais: number; restricoesAlimentares: number;
}
interface Condicao {
  id: string; kind: string; description: string; rotulo: string; severity: string | null;
  essential_alert: boolean; source: string | null; review_on: string | null;
}
interface Restricao {
  id: string; restriction: string; substitution: string | null; guidance: string | null;
}
interface Doc {
  id: string; category: string; title: string; issued_on: string | null; valid_until: string | null;
}
interface Perfil {
  id: string; nome: string; nomeCivil: string; idade: number; nascimento: string;
  cpfPendente: boolean; idProvisorio: string | null;
  casaAtual: { id: string; codigo: string; nome: string; desde: string } | null;
  noAcervo: boolean;
  alertasEssenciais: { tipo: string; descricao: string; gravidade: string | null }[];
  condicoesSaude: Condicao[];
  restricoesAlimentares: Restricao[];
  cuidadosEssenciais: string | null;
  escola: { nome: string | null; serie: string | null; turno: string | null; endereco: string | null } | null;
  equipeReferencia: string | null;
  documentos: Doc[];
  documentosRestritos: number;
  memorias: { id: string; event_type: string; happened_on: string; description: string }[];
}
interface Dose {
  id: string; horario: string; medicamento: string; dose: string; via: string;
  tipo: string; condicaoUso: string | null; estado: string; rotulo: string;
  pendente: boolean; confirmadaPor: string | null;
}
/** Quem já esteve nesta casa e não está mais (§15.2). */
interface NoAcervo {
  id: string; nome: string; idade: number;
  saiuEm: string | null; motivoDaSaida: string | null; episodios: number;
}
interface Acervo { aviso: string; pessoas: NoAcervo[] }
interface Judicial {
  motivo: string; detalhe: string | null; medida: string; orgao: string;
  vara: string | null; processo: string | null; guia: string | null;
  guiaEm: string | null; determinadoEm: string | null; situacao: string | null;
  observacoes: string | null;
}

/**
 * Uma correção de cadastro (§6.2).
 *
 * Ela é do CASO, e não da auditoria: quem cuida da criança precisa poder ler,
 * no perfil, que o nome mudou em março e por quê — sem pedir a ninguém e sem
 * entrar numa área restrita.
 */
interface Correcao {
  id: string; campo: string; antes: string | null; depois: string | null;
  motivo: string; por: string; quando: string;
}

/** Quem tem a área restrita do §13.1. O menu não oferece o que o cargo não faz. */
const VE_JUDICIAL = ['equipe_tecnica', 'coordenador', 'gestor_geral'];
/** Quem cadastra (§6.1) — a mesma regra que o banco aplica no comando. */
const QUEM_CADASTRA = ['equipe_tecnica', 'coordenador', 'gestor_geral'];
/*
 * alcance:acolhidos — quem registra SAÍDA e RETORNO, e quem abre o acervo.
 * Conferido contra `PeopleService.discharge/readmit/acervo`. Um líder ou um
 * educador não desliga ninguém: a saída encerra episódio, cancela
 * transferências pendentes e move o perfil para o acervo.
 */
const REGISTRA_SAIDA = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

/**
 * Motivos de saída que a casa usa. O servidor recebe TEXTO LIVRE, e é por isso
 * que estes botões apenas PREENCHEM o campo — quem registra continua podendo
 * escrever o que aconteceu com as palavras dela. Uma lista fechada aqui viraria
 * um contrato que o servidor não tem, e a primeira saída fora da lista seria
 * registrada errada só para caber num botão.
 */
const MOTIVOS_DE_SAIDA = [
  'Reintegração familiar',
  'Colocação em família extensa',
  'Adoção',
  'Transferência para outro serviço de acolhimento',
  'Maioridade',
  'Determinação judicial',
];
/**
 * Quem RELATA um atendimento de saúde (§7.2): quem acompanhou a criança.
 * A Enfermagem tria e assina; a coordenação e a técnica também relatam quando
 * são elas que vão junto. O educador relata e não edita o histórico de saúde.
 */
const REGISTRA_EVOLUCAO = ['educador', 'lider_diurno', 'lider_noturno_geral',
  'equipe_tecnica', 'coordenador', 'enfermagem', 'gestor_geral'];

/** Tipos de atendimento, nos códigos do servidor. */
const TIPOS_ATENDIMENTO = [
  { cod: 'consulta', label: 'Consulta' },
  { cod: 'exame', label: 'Exame' },
  { cod: 'urgencia', label: 'Urgência ou emergência' },
  { cod: 'internacao', label: 'Internação' },
  { cod: 'retorno', label: 'Retorno' },
  { cod: 'vacina', label: 'Vacina' },
];

const CATEGORIA: Record<string, string> = {
  saude: 'Saúde', escolar: 'Escolar', pessoal: 'Pessoal',
  judicial_socioassistencial: 'Judicial e socioassistencial',
};
const TIPO_DOSE: Record<string, string> = {
  uso_continuo: 'uso contínuo', tratamento: 'tratamento',
  quando_necessario: 'quando necessário', episodio_agudo: 'episódio agudo',
};

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
/**
 * Uma data para ler.
 *
 * O servidor devolve umas como dia puro ("2018-05-27") e outras já com hora
 * ("2018-05-27T00:00:00.000Z"), conforme a coluna. Concatenar a hora na
 * segunda dava "Invalid Date" — e a tela mostrava isso ao lado da idade de
 * uma criança. Corta em dez caracteres e monta ao meio-dia, que é o que
 * impede o fuso de recuar um dia.
 */
const dia = (d: string) => {
  const iso = String(d).slice(0, 10);
  const data = new Date(`${iso}T12:00:00`);
  return Number.isNaN(data.getTime())
    ? '—'
    : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function Acolhidos({ houseId, casaLabel, papel }: {
  houseId: string; casaLabel: string; papel: string;
}) {
  const [lista, setLista] = useState<Resumo[]>([]);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [cadastrando, setCadastrando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [acervo, setAcervo] = useState<Acervo | null>(null);
  const [vendoAcervo, setVendoAcervo] = useState(false);
  const [retornando, setRetornando] = useState<NoAcervo | null>(null);

  const carregar = useCallback(async () => {
    setErro('');
    try { setLista(await api<Resumo[]>(`/people?houseId=${houseId}`)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar os acolhidos.'); }
  }, [houseId]);

  useEffect(() => { carregar(); }, [carregar]);

  const carregarAcervo = useCallback(async () => {
    setErro('');
    try { setAcervo(await api<Acervo>(`/people/archive?houseId=${houseId}`)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir o acervo.'); }
  }, [houseId]);

  if (cadastrando) {
    return (
      <>
        <button className="btn sm ghost" onClick={() => setCadastrando(false)}>← Acolhidos</button>
        <Cadastro houseId={houseId} casaLabel={casaLabel}
                  onPronto={async (personId, msg) => {
                    setCadastrando(false); setAviso(msg);
                    await carregar();
                    // Abre o perfil recém-criado: é onde a equipe técnica
                    // continua o trabalho — saúde, escola, documentos.
                    setAbertoId(personId);
                  }} />
      </>
    );
  }

  if (abertoId) {
    return <Perfil personId={abertoId} houseId={houseId} papel={papel}
                   onVoltar={() => { setAbertoId(null); carregar(); }} />;
  }

  /*
   * O ACERVO HISTÓRICO (§15.2).
   *
   * Ele fica numa tela à parte, e não misturado à lista da casa, porque as
   * duas respondem perguntas diferentes: "quem está aqui agora" é a pergunta
   * do plantão, feita dezenas de vezes por dia; "quem já esteve" é a pergunta
   * de quem vai registrar um retorno. Misturar as duas põe na lista da manhã
   * nomes de crianças que já foram embora.
   */
  if (vendoAcervo) {
    return (
      <>
        <button className="btn sm ghost" onClick={() => { setVendoAcervo(false); carregar(); }}>
          ← Acolhidos
        </button>

        <div className="diahead">
          <div><h2>Acervo histórico</h2>
            <div className="mutetxt">Quem já esteve nesta casa e não está mais.</div></div>
          <div className="resumo">
            <span className="pill c-mute">{acervo?.pessoas.length ?? 0} no acervo</span>
          </div>
        </div>

        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {aviso && <div className="notice c-ok" role="status">{aviso}</div>}
        {acervo && <div className="notice c-info">{acervo.aviso}</div>}

        <ol className="pessoas">
          {(acervo?.pessoas ?? []).map((p) => (
            <li key={p.id}>
              <div className="card stack">
                <div className="row">
                  <div className="grow">
                    <b className="ff">{p.nome}</b>
                    <div className="mutetxt">
                      {p.idade} anos
                      {p.saiuEm && ` · saiu em ${dia(p.saiuEm)}`}
                      {p.episodios > 1 && ` · ${p.episodios} acolhimentos`}
                    </div>
                  </div>
                  <button className="btn sm sec" onClick={() => setRetornando(p)}>
                    Registrar retorno
                  </button>
                </div>
                {p.motivoDaSaida && (
                  <div className="bloco"><small>Motivo da saída</small>{p.motivoDaSaida}</div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {acervo && acervo.pessoas.length === 0 && (
          <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
            Ninguém saiu desta casa até agora.</p></div>
        )}

        {retornando && (
          <FolhaRetorno
            pessoa={retornando}
            onFechar={() => setRetornando(null)}
            onConfirmar={async () => {
              setErro(''); setAviso('');
              try {
                const r = await api<{ aviso?: string; episodio?: number }>(
                  `/people/${retornando.id}/readmit`,
                  { method: 'POST', body: JSON.stringify({ houseId }) });
                setRetornando(null);
                setAviso(`${retornando.nome} voltou para a casa — episódio `
                  + `${r.episodio ?? 'novo'}. ${r.aviso ?? ''}`);
                await carregarAcervo(); await carregar();
              } catch (e) {
                setErro(e instanceof Error ? e.message : 'Não foi possível registrar o retorno.');
              }
            }} />
        )}
      </>
    );
  }

  const filtrada = busca.trim()
    ? lista.filter((p) => p.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : lista;

  return (
    <>
      <div className="diahead">
        <div><h2>Os acolhidos da casa</h2></div>
        <div className="resumo"><span className="pill c-info">{lista.length} na casa</span></div>
      </div>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      {QUEM_CADASTRA.includes(papel) && (
        <button className="btn block" onClick={() => setCadastrando(true)}>
          Cadastrar acolhido
        </button>
      )}
      {REGISTRA_SAIDA.includes(papel) && (
        <button className="btn block sec" style={{ marginTop: 8 }}
                onClick={() => { setVendoAcervo(true); carregarAcervo(); }}>
          🗄️ Acervo histórico — quem saiu, e registrar retorno
        </button>
      )}

      {/* Vinte nomes cabem na tela; a busca é para a casa que crescer, e para
          quem está com pressa e sabe o nome. */}
      {lista.length > 8 && (
        <input className="field" type="search" value={busca} placeholder="Buscar pelo nome"
               aria-label="Buscar pelo nome" onChange={(e) => setBusca(e.target.value)} />
      )}

      <ol className="pessoas">
        {filtrada.map((p) => (
          <li key={p.id}>
            <button className="card row" onClick={() => setAbertoId(p.id)}>
              <div className="grow" style={{ textAlign: 'left' }}>
                <b className="ff">{p.nome}</b>
                <div className="mutetxt">{p.idade} anos</div>
              </div>
              {p.alertasEssenciais > 0 && (
                <span className="pill c-crit" title="Alertas essenciais">
                  ⚠ {p.alertasEssenciais}
                </span>
              )}
              {p.restricoesAlimentares > 0 && (
                <span className="pill c-warn" title="Restrições alimentares">
                  🍽 {p.restricoesAlimentares}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>

      {lista.length > 0 && filtrada.length === 0 && (
        <div className="card"><p className="mutetxt" style={{ margin: 0 }}>Nenhum nome com "{busca}".</p></div>
      )}
      {lista.length === 0 && !erro && (
        <div className="card">
          <p className="mutetxt" style={{ margin: 0 }}>
            Nenhum acolhido ativo nesta casa.
          </p>
        </div>
      )}
    </>
  );
}

function Perfil({ personId, houseId, papel, onVoltar }: {
  personId: string; houseId: string; papel: string; onVoltar: () => void;
}) {
  const [p, setP] = useState<Perfil | null>(null);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [judicial, setJudicial] = useState<Judicial | null>(null);
  const [erro, setErro] = useState('');
  const [erroJudicial, setErroJudicial] = useState('');
  const [semJudicial, setSemJudicial] = useState(false);
  const [evolucao, setEvolucao] = useState(false);
  const [aviso, setAviso] = useState('');
  const [saindo, setSaindo] = useState(false);
  /** O dossiê é tela própria: a pasta da criança não cabe dentro do perfil. */
  const [dossie, setDossie] = useState(false);
  /** Corrigir a identificação (§6.2): exige motivo, e deixa histórico legível. */
  const [corrigindo, setCorrigindo] = useState(false);
  const [correcoes, setCorrecoes] = useState<Correcao[]>([]);
  const [editandoJudicial, setEditandoJudicial] = useState(false);

  useEffect(() => {
    (async () => {
      setErro('');
      try {
        setP(await api<Perfil>(`/people/${personId}`));
        // O remédio de hoje é do dia, não do cadastro: vem da grade da casa,
        // filtrada nesta criança. Se falhar, o perfil ainda serve.
        try { setDoses(await api<Dose[]>(`/medications?houseId=${houseId}&personId=${personId}`)); }
        catch { setDoses([]); }
        // O histórico de correções é do caso, e quem alcança a criança lê.
        setCorrecoes(await api<Correcao[]>(`/people/${personId}/correcoes`).catch(() => []));
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível abrir o perfil.');
      }
    })();
  }, [personId, houseId]);

  async function abrirJudicial() {
    setErroJudicial(''); setSemJudicial(false);
    try {
      setJudicial(await api<Judicial>(`/people/${personId}/judicial`));
    } catch (e) {
      // 404 aqui não é bloqueio: é campo que ninguém preencheu ainda — e, para
      // a equipe técnica, isso é trabalho a fazer, não porta fechada. O
      // cadastro incompleto é o débito que reaparece na primeira audiência.
      if (e instanceof ErroApi && e.status === 404) setSemJudicial(true);
      else setErroJudicial(e instanceof Error ? e.message : 'Não foi possível abrir a área restrita.');
    }
  }

  if (erro) {
    return (
      <>
        <button className="btn sm ghost" onClick={onVoltar}>← Acolhidos</button>
        <div className="notice c-crit" role="alert" style={{ marginTop: 12 }}>{erro}</div>
      </>
    );
  }
  if (!p) return <p className="mutetxt">Abrindo…</p>;

  async function recarregar() {
    setP(await api<Perfil>(`/people/${personId}`).catch(() => p));
    setCorrecoes(await api<Correcao[]>(`/people/${personId}/correcoes`).catch(() => correcoes));
  }

  if (dossie) {
    return <Dossie personId={personId} nome={p.nome} papel={papel}
                   onVoltar={() => setDossie(false)} />;
  }

  const pendentes = doses.filter((d) => d.pendente);

  return (
    <>
      <div className="diahead">
        <div>
          <button className="btn sm ghost" onClick={onVoltar}>← Acolhidos</button>
          <h2>{p.nome}</h2>
          <div className="mutetxt">
            {p.idade} anos · {dia(p.nascimento)}
            {p.casaAtual ? ` · ${p.casaAtual.codigo} desde ${dia(p.casaAtual.desde)}` : ''}
          </div>
        </div>
      </div>

      {/* A pasta da criança: o que a casa precisa ter, e o álbum dela. */}
      <button className="btn sec block" style={{ marginBottom: 12 }} onClick={() => setDossie(true)}>
        📂 Dossiê e vivências
      </button>

      {/*
        * CORRIGIR O CADASTRO (§6.2).
        *
        * Nome escrito errado às 23h, com a criança na porta. Data de
        * nascimento trocada porque a certidão veio depois. Sem esta porta, a
        * saída de quem usa é RECADASTRAR — e aí existem duas crianças, o
        * histórico parte em dois, e é isso que a audiência pergunta.
        */}
      {QUEM_CADASTRA.includes(papel) && (
        <button className="btn ghost block" style={{ marginBottom: 12 }}
                onClick={() => setCorrigindo(true)}>
          ✏️ Corrigir o cadastro
        </button>
      )}

      {/* O histórico fica À VISTA de quem cuida: "por que o nome dela mudou em
          março?" é pergunta do caso, não de auditoria. */}
      {correcoes.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="eyebrow" style={{ marginTop: 0 }}>
            Correções de cadastro · {correcoes.length}
          </div>
          <ul className="lista">
            {correcoes.map((c) => (
              <li key={c.id}>
                <b className="ff">{c.campo}</b>
                <div className="mutetxt linhadois">
                  de <b>{c.antes || '(em branco)'}</b> para <b>{c.depois || '(em branco)'}</b>
                </div>
                <div className="mutetxt">{c.motivo}</div>
                <div className="mutetxt">{c.por} · {dia(c.quando)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PRIMEIRO, e sem precisar rolar: o que machuca hoje se for ignorado. */}
      {p.alertasEssenciais.map((a, i) => (
        <div key={i} className="notice c-crit" role="alert">
          <b>⚠ {a.descricao}</b>
          <div className="mutetxt">{a.tipo}{a.gravidade ? ` · ${a.gravidade}` : ''}</div>
        </div>
      ))}
      {p.restricoesAlimentares.map((r) => (
        <div key={r.id} className="notice c-warn" role="status">
          <b>🍽 {r.restriction}</b>
          {r.substitution && <div>No lugar: {r.substitution}</div>}
          {r.guidance && <div className="mutetxt">{r.guidance}</div>}
        </div>
      ))}

      {/*
        A pendência de cadastro aparece para quem pode fechá-la.
        Um ingresso urgente entra sem CPF de propósito — a criança não espera
        documento —, mas a pendência não pode virar silêncio: é ela que
        reaparece na primeira audiência. Para o educador no meio do turno isso
        seria ruído; para a equipe técnica, é trabalho com nome e prazo.
      */}
      {p.cpfPendente && VE_JUDICIAL.includes(papel) && (
        <div className="notice c-warn" role="status">
          <b>Cadastro sem CPF</b>
          <div>
            Entrou como ingresso urgente{p.idProvisorio ? `, com o ID provisório ${p.idProvisorio}` : ''}.
            O CPF continua pendente — enquanto estiver assim, documento, benefício e
            matrícula esbarram nisso.
          </div>
        </div>
      )}

      {p.cuidadosEssenciais && (
        <Secao titulo="Cuidados essenciais">
          <p className="bloco" style={{ marginTop: 0 }}>{p.cuidadosEssenciais}</p>
        </Secao>
      )}

      <Secao titulo="Remédio de hoje">
        {doses.length === 0 ? (
          <p className="mutetxt" style={{ margin: 0 }}>Nenhuma dose prevista hoje.</p>
        ) : (
          <>
            {pendentes.length > 0 && (
              <p className="mutetxt" style={{ marginTop: 0 }}>
                {pendentes.length} dose(s) ainda sem confirmação. A confirmação é feita na
                tela do dia, por quem administra.
              </p>
            )}
            <ol className="doses">
              {doses.map((d) => (
                /* O nome do remédio ocupa a linha inteira e o estado vem
                   embaixo. Ao lado, "Colírio lubrificante (fictício)" quebrava
                   em três linhas e a leitura de relance — que é a única que
                   acontece no corredor — se perdia. */
                <li key={d.id} className={d.pendente ? '' : 'feito'}>
                  <span className="hora">{hhmm(d.horario)}</span>
                  <div className="grow">
                    <b className="ff">{d.medicamento}</b>
                    <div className="mutetxt">
                      {d.dose} · {d.via} · {TIPO_DOSE[d.tipo] ?? d.tipo}
                    </div>
                    {d.condicaoUso && <div className="mutetxt">Só se: {d.condicaoUso}</div>}
                    <div className="estado">
                      <span className={`pill ${d.pendente ? 'c-warn' : 'c-ok'}`}>{d.rotulo}</span>
                      {d.confirmadaPor && <span className="mutetxt"> por {d.confirmadaPor}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </Secao>

      <Secao titulo="Saúde">
        {/*
          * REGISTRAR ATENDIMENTO — quem acompanhou é quem relata (§7.2).
          *
          * A fila de triagem da Enfermagem existia desde a fase 4 e não era
          * alimentada por tela nenhuma: a criança ia ao médico e o sistema não
          * ficava sabendo. Quem escreve é quem foi junto — o educador —, e a
          * Enfermagem tria, complementa e assina. O educador RELATA; não ganha
          * permissão de editar o histórico de saúde.
          */}
        {REGISTRA_EVOLUCAO.includes(papel) && (
          <>
            <button className="btn sec block" onClick={() => setEvolucao(true)}>
              🩺 Registrar atendimento de saúde
            </button>
            <p className="mutetxt">
              Voltou de consulta, exame, urgência ou internação? Quem acompanhou escreve o
              que viu; a Enfermagem tria e assina. <b>Receita nova só altera a grade de
              medicamentos depois dessa revisão.</b>
            </p>
          </>
        )}
        {p.condicoesSaude.length > 0 && (
          <ul className="lista">
            {p.condicoesSaude.map((c) => (
              <li key={c.id}>
                <b className="ff">{c.rotulo ?? c.description}</b>
                <div className="mutetxt">
                  {c.kind}{c.severity ? ` · ${c.severity}` : ''}
                  {c.source ? ` · ${c.source}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {p.escola && (p.escola.nome || p.escola.serie) && (
        <Secao titulo="Escola">
          <b className="ff">{p.escola.nome ?? 'Escola não informada'}</b>
          <div className="mutetxt">
            {[p.escola.serie, p.escola.turno].filter(Boolean).join(' · ') || 'Série e turno não informados'}
          </div>
          {p.escola.endereco && <div className="mutetxt">{p.escola.endereco}</div>}
        </Secao>
      )}

      {p.equipeReferencia && (
        <Secao titulo="Equipe de referência">
          <p className="bloco" style={{ marginTop: 0 }}>{p.equipeReferencia}</p>
        </Secao>
      )}

      <Secao titulo="Documentos">
        {p.documentos.length === 0 && p.documentosRestritos === 0 && (
          <p className="mutetxt" style={{ margin: 0 }}>Nenhum documento cadastrado.</p>
        )}
        <ul className="lista">
          {p.documentos.map((d) => (
            <li key={d.id}>
              <b className="ff">{d.title}</b>
              <div className="mutetxt">
                {CATEGORIA[d.category] ?? d.category}
                {d.valid_until ? ` · vence em ${dia(d.valid_until)}` : ''}
              </div>
            </li>
          ))}
        </ul>
        {/* Contagem, não conteúdo: esconder que existem faria a equipe
            procurar num lugar sem proteção nenhuma. */}
        {p.documentosRestritos > 0 && (
          <p className="mutetxt" style={{ marginBottom: 0 }}>
            Mais {p.documentosRestritos} documento(s) em área restrita ao seu cargo. Existem, e
            estão guardados — quem precisa deles é a equipe técnica.
          </p>
        )}
      </Secao>

      {/* A ÁREA RESTRITA. Não abre junto com o perfil: exige o toque, e o
          toque fica registrado com o nome de quem deu (§13.1, §20). */}
      {aviso && (
        <div className="notice c-ok" role="status">
          {aviso}
          <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setAviso('')}>
            Entendi
          </button>
        </div>
      )}

      {evolucao && p && (
        <FolhaEvolucao
          nome={p.nome}
          onFechar={() => setEvolucao(false)}
          onEnviar={async (corpo) => {
            setErro('');
            try {
              const r = await api<{ aviso?: string }>('/nursing/evolutions', {
                method: 'POST',
                body: JSON.stringify({ personId, houseId, ...corpo }),
              });
              setEvolucao(false);
              setAviso(r?.aviso ?? 'Evolução enviada para a triagem da Enfermagem.');
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível registrar o atendimento.');
            }
          }} />
      )}

      {VE_JUDICIAL.includes(papel) && (
        <Secao titulo="Motivo do acolhimento e dados judiciais">
          {!judicial && !erroJudicial && !semJudicial && (
            <>
              <p className="mutetxt" style={{ marginTop: 0 }}>
                Área restrita. Abrir fica registrado em seu nome, com data e hora.
              </p>
              <button className="btn sec block" onClick={abrirJudicial}>
                Abrir a área restrita
              </button>
            </>
          )}
          {erroJudicial && <div className="notice c-crit" role="alert">{erroJudicial}</div>}
          {semJudicial && (
            <div className="notice c-warn" role="status">
              <b>Sem motivo judicial cadastrado.</b>
              <div>
                Esta criança está acolhida e o sistema não sabe por quê. É a lacuna que
                reaparece na primeira audiência — o cadastro completo, pela equipe técnica,
                é o que a fecha.
              </div>
            </div>
          )}
          {judicial && (
            <>
              {/* A SITUAÇÃO vem primeiro, e é o que mais muda: audiência
                  concentrada, decisão nova, reavaliação marcada. O servidor
                  devolvia este campo desde a fase 0 e a tela nunca o desenhou
                  — quem abria a área restrita lia o motivo de fevereiro e não
                  sabia o que estava valendo hoje. */}
              {judicial.situacao && (
                <p className="bloco destaque" style={{ marginTop: 0 }}>
                  <small>Situação hoje</small>{judicial.situacao}
                </p>
              )}
              <p className="bloco destaque" style={{ marginTop: 0 }}>
                <small>Motivo</small>{judicial.motivo}
              </p>
              {judicial.detalhe && <p className="bloco"><small>Detalhe</small>{judicial.detalhe}</p>}
              <ul className="lista">
                <li><b className="ff">{judicial.medida}</b><div className="mutetxt">medida</div></li>
                <li><b className="ff">{judicial.orgao}</b><div className="mutetxt">órgão determinante</div></li>
                {judicial.vara && <li><b className="ff">{judicial.vara}</b><div className="mutetxt">vara</div></li>}
                {judicial.processo && (
                  <li><b className="ff">{judicial.processo}</b><div className="mutetxt">processo</div></li>
                )}
                {judicial.guia && (
                  <li>
                    <b className="ff">{judicial.guia}</b>
                    <div className="mutetxt">
                      guia{judicial.guiaEm ? ` · ${dia(judicial.guiaEm)}` : ''}
                    </div>
                  </li>
                )}
              </ul>
              {judicial.observacoes && <p className="bloco"><small>Observações</small>{judicial.observacoes}</p>}
              {/* A situação judicial MUDA — audiência concentrada, decisão
                  nova, processo que trocou de vara. O motivo do acolhimento e
                  a medida não se editam por aqui: eles são do episódio. */}
              {VE_JUDICIAL.includes(papel) && (
                <button className="btn sec sm" onClick={() => setEditandoJudicial(true)}>
                  Atualizar a situação judicial
                </button>
              )}
            </>
          )}
        </Secao>
      )}

      {/*
        * A SAÍDA (§15.2).
        *
        * Fica no FIM do perfil, e não num botão de topo: é o ato menos
        * frequente e o mais definitivo desta tela, e um toque errado no lugar
        * onde a mão passa o dia inteiro encerraria o acolhimento de uma
        * criança. Do lado do servidor a saída encerra a permanência e o
        * episódio, cancela transferências pendentes e leva o perfil ao acervo
        * — nada disso é apagamento, e é isso que a tela diz antes de pedir a
        * confirmação.
        */}
      {REGISTRA_SAIDA.includes(papel) && (
        <Secao titulo="Saída da casa">
          <p className="mutetxt" style={{ marginTop: 0 }}>
            Registrar a saída encerra o acolhimento nesta casa. O perfil <b>não é
            apagado</b>: vai para o acervo histórico com tudo o que foi registrado, e um
            retorno abre episódio novo no mesmo perfil.
          </p>
          <button className="btn sec" onClick={() => setSaindo(true)}>
            Registrar saída de {p.nome}
          </button>
        </Secao>
      )}

      {corrigindo && (
        <FolhaCorrigir
          perfil={p}
          onFechar={() => setCorrigindo(false)}
          onCorrigir={async (dados) => {
            setErro(''); setAviso('');
            try {
              const r = await api<{ aviso?: string }>(
                `/people/${personId}/corrigir-identificacao`,
                { method: 'POST', body: JSON.stringify(dados) });
              setCorrigindo(false);
              setAviso(r?.aviso ?? 'Cadastro corrigido.');
              await recarregar();
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível corrigir o cadastro.');
            }
          }} />
      )}

      {editandoJudicial && judicial && (
        <FolhaJudicial
          judicial={judicial}
          onFechar={() => setEditandoJudicial(false)}
          onSalvar={async (campos) => {
            setErro(''); setAviso('');
            try {
              await api(`/people/${personId}/judicial`,
                { method: 'PATCH', body: JSON.stringify(campos) });
              setEditandoJudicial(false);
              setAviso('Situação judicial atualizada, com o seu nome e o horário.');
              setJudicial(await api<Judicial>(`/people/${personId}/judicial`).catch(() => judicial));
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível atualizar.');
            }
          }} />
      )}

      {saindo && (
        <FolhaSaida
          nome={p.nome}
          onFechar={() => setSaindo(false)}
          onConfirmar={async (motivo) => {
            setErro(''); setAviso('');
            try {
              await api(`/people/${personId}/discharge`,
                { method: 'POST', body: JSON.stringify({ motivo }) });
              setSaindo(false);
              // Volta para a lista: a criança não está mais na casa, e deixar
              // o perfil aberto sugere que ainda está.
              onVoltar();
            } catch (e) {
              setSaindo(false);
              setErro(e instanceof Error ? e.message : 'Não foi possível registrar a saída.');
            }
          }} />
      )}

      {p.memorias.length > 0 && (
        <Secao titulo="Memórias">
          <ul className="lista">
            {p.memorias.map((m) => (
              <li key={m.id}>
                <b className="ff">{m.description}</b>
                <div className="mutetxt">{m.event_type} · {dia(m.happened_on)}</div>
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </>
  );
}

/**
 * A FOLHA DA SAÍDA (§15.2).
 *
 * Três coisas que ela protege:
 *
 *  * **o motivo é escrito, não escolhido.** Os botões preenchem o campo e o
 *    texto continua editável: "reintegração familiar" e "reintegração familiar
 *    com acompanhamento da rede de origem" não são a mesma frase, e a segunda
 *    é a que serve daqui a um ano. Uma lista fechada faria a saída fora da
 *    lista ser registrada errada só para caber num botão;
 *  * **a tela diz o que vai acontecer antes de acontecer** — encerra o
 *    acolhimento, cancela transferência pendente, leva ao acervo. Confirmar
 *    sem saber o efeito é o caminho conhecido do arrependimento;
 *  * **não existe desfazer, e a tela avisa.** O caminho de volta é registrar
 *    um retorno, que é episódio NOVO — e é assim que tem de ser: a criança
 *    que voltou não desfez a saída, ela voltou.
 */
function FolhaSaida({ nome, onFechar, onConfirmar }: {
  nome: string; onFechar: () => void; onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const pode = motivo.trim().length >= 3;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-saida"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-saida">Registrar a saída de {nome}</h3>
        <div className="notice c-warn">
          Isto encerra o acolhimento nesta casa: a criança sai da chamada, da agenda e da
          contagem da casa, e uma solicitação de transferência pendente sobre ela é
          cancelada. <b>O perfil não é apagado</b> — vai para o acervo, com o histórico
          inteiro.
        </div>

        <label className="f" htmlFor="saida-motivo">
          Motivo da saída <small>— com as suas palavras; os botões só ajudam a começar</small>
        </label>
        <div className="opts">
          {MOTIVOS_DE_SAIDA.map((m) => (
            <button type="button" key={m} className="opt c-info"
                    aria-pressed={motivo === m} onClick={() => setMotivo(m)}>
              {m}
            </button>
          ))}
        </div>
        <textarea id="saida-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: reintegração familiar, com acompanhamento da rede de origem; determinação da Vara em 12/08." />

        <p className="mutetxt">
          Não há como desfazer. Se a criança voltar, registre um <b>retorno</b> pelo acervo —
          ele abre um episódio novo, e nada do episódio anterior é reativado sozinho.
        </p>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onConfirmar(motivo.trim())}>
            Registrar a saída
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DO RETORNO (§15.3).
 *
 * O retorno não restaura nada. Ele abre um episódio NOVO no mesmo perfil, e o
 * que estava ativo no episódio anterior — medicamento, alergia, restrição —
 * continua no histórico esperando revisão da Enfermagem. Reativar sozinho uma
 * prescrição de um ano atrás é o tipo de gentileza automática que termina numa
 * dose errada.
 */
function FolhaRetorno({ pessoa, onFechar, onConfirmar }: {
  pessoa: NoAcervo; onFechar: () => void; onConfirmar: () => void;
}) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-ret"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-ret">Registrar o retorno de {pessoa.nome}</h3>
        <div className="notice c-info">
          O retorno abre um <b>episódio novo</b> no mesmo perfil. Nada é apagado e nada
          é reativado sozinho.
        </div>
        {pessoa.saiuEm && (
          <div className="bloco">
            <small>Saiu em</small>{dia(pessoa.saiuEm)}
            {pessoa.motivoDaSaida ? ` — ${pessoa.motivoDaSaida}` : ''}
          </div>
        )}
        <p className="mutetxt">
          <b>Antes de reativar qualquer coisa</b>, revise com a Enfermagem os medicamentos,
          as alergias e as restrições alimentares do episódio anterior. Elas continuam no
          histórico, e é uma pessoa que decide o que volta a valer.
        </p>
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" onClick={onConfirmar}>Registrar o retorno</button>
        </div>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="passagem">
      <div className="eyebrow">{titulo}</div>
      <div className="card">{children}</div>
    </section>
  );
}

/**
 * A FOLHA DO ATENDIMENTO — escrita por quem foi junto.
 *
 * Dois campos são obrigatórios, e os dois pelo mesmo motivo: o próximo plantão
 * precisa saber QUANDO aconteceu e COMO a criança voltou. O resto entra se
 * existir — o formulário aceita o mínimo, porque o educador escreve isso na
 * volta do posto, no corredor, com a criança do lado.
 *
 * A receita entra como TEXTO do que foi entregue. Ela não altera a grade de
 * medicamentos: a grade só muda depois que a Enfermagem tria e assina (§11.1).
 */
function FolhaEvolucao({ nome, onFechar, onEnviar }: {
  nome: string; onFechar: () => void;
  onEnviar: (corpo: Record<string, unknown>) => void;
}) {
  const agora = new Date();
  const local2 = (n: number) => String(n).padStart(2, '0');
  const [tipo, setTipo] = useState('consulta');
  const [quando, setQuando] = useState(
    `${agora.getFullYear()}-${local2(agora.getMonth() + 1)}-${local2(agora.getDate())}`
    + `T${local2(agora.getHours())}:${local2(agora.getMinutes())}`);
  const [local, setLocal] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [estadoRetorno, setEstadoRetorno] = useState('');
  const [orientacoes, setOrientacoes] = useState('');
  const [receita, setReceita] = useState('');
  const [prazoRetorno, setPrazoRetorno] = useState('');
  const pode = quando.length >= 16 && estadoRetorno.trim().length >= 5;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-evo"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-evo">Atendimento de saúde · {nome}</h3>
        <div className="notice c-info">
          Quem acompanhou é quem escreve. A <b>Enfermagem tria, complementa e assina</b> —
          e é só depois disso que uma receita nova altera a grade de medicamentos.
        </div>

        <label className="f">Tipo de atendimento</label>
        <div className="opts">
          {TIPOS_ATENDIMENTO.map((t) => (
            <button type="button" key={t.cod} className="opt c-med"
                    aria-pressed={tipo === t.cod} onClick={() => setTipo(t.cod)}>
              {t.label}
            </button>
          ))}
        </div>

        <label className="f" htmlFor="evo-quando">
          Quando aconteceu <small>— o horário real, não o do registro</small>
        </label>
        <input id="evo-quando" type="datetime-local" value={quando}
               onChange={(e) => setQuando(e.target.value)} />

        <label className="f" htmlFor="evo-local">Onde</label>
        <input id="evo-local" value={local} onChange={(e) => setLocal(e.target.value)}
               placeholder="Ex.: UBS do bairro, hospital, clínica" />

        <label className="f" htmlFor="evo-esp">Especialidade</label>
        <input id="evo-esp" value={especialidade} onChange={(e) => setEspecialidade(e.target.value)}
               placeholder="Ex.: pediatria, odontologia" />

        <label className="f" htmlFor="evo-ret">
          Como a criança voltou <small>— obrigatório: é o que o próximo plantão mais precisa</small>
        </label>
        <textarea id="evo-ret" value={estadoRetorno} onChange={(e) => setEstadoRetorno(e.target.value)}
                  placeholder="Ex.: voltou tranquila, sem dor referida; comeu bem no jantar." />

        <label className="f" htmlFor="evo-ori">Orientações recebidas</label>
        <textarea id="evo-ori" value={orientacoes} onChange={(e) => setOrientacoes(e.target.value)}
                  placeholder="Ex.: repouso hoje; retornar se a febre passar de 38°C." />

        <label className="f" htmlFor="evo-rec">
          Receita entregue <small>— o texto do que foi prescrito</small>
        </label>
        <textarea id="evo-rec" value={receita} onChange={(e) => setReceita(e.target.value)}
                  placeholder="Ex.: amoxicilina 500 mg, 8/8h por 7 dias." />

        <label className="f" htmlFor="evo-prazo">Retorno marcado para</label>
        <input id="evo-prazo" type="date" value={prazoRetorno}
               onChange={(e) => setPrazoRetorno(e.target.value)} />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onEnviar({
                    tipo,
                    quandoAconteceu: new Date(quando).toISOString(),
                    local: local || undefined,
                    especialidade: especialidade || undefined,
                    estadoRetorno,
                    orientacoes: orientacoes || undefined,
                    receita: receita || undefined,
                    prazoRetorno: prazoRetorno || undefined,
                  })}>
            Enviar para a Enfermagem
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DA CORREÇÃO DE CADASTRO (§6.2).
 *
 * Três coisas que ela faz de propósito:
 *
 *  * **mostra o que está lá agora**, dentro do campo. Corrigir é comparar, e
 *    um formulário vazio faz a pessoa digitar de novo o que já estava certo;
 *  * **o motivo é obrigatório e tem mínimo.** "Erro" não explica nada a quem
 *    ler o caso daqui a um ano — e é justamente essa pessoa que o histórico
 *    existe para servir;
 *  * **diz que nada é apagado.** O medo de corrigir é o que faz recadastrar, e
 *    recadastrar cria uma segunda criança no sistema.
 */
function FolhaCorrigir({ perfil, onFechar, onCorrigir }: {
  perfil: Perfil; onFechar: () => void;
  onCorrigir: (d: { nome?: string; nomeSocial?: string | null;
                    nascimento?: string; motivo: string }) => void;
}) {
  const [nome, setNome] = useState(perfil.nomeCivil ?? perfil.nome);
  const [social, setSocial] = useState(perfil.nome ?? '');
  const [nascimento, setNascimento] = useState(String(perfil.nascimento ?? '').slice(0, 10));
  const [motivo, setMotivo] = useState('');
  const pode = motivo.trim().length >= 10 && nome.trim().length >= 2 && nascimento !== '';

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-cor"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-cor">Corrigir o cadastro</h3>
        <div className="notice c-info">
          Nada é apagado. O que está registrado hoje continua, com o motivo da correção, o seu
          nome e o horário — e fica <b>à vista no perfil</b>, para quem cuida da criança poder
          ler sem perguntar a ninguém. Corrigir é sempre melhor do que recadastrar: recadastrar
          cria uma segunda criança e parte o histórico em dois.
        </div>

        <label className="f" htmlFor="cor-nome">Nome civil</label>
        <input id="cor-nome" value={nome} onChange={(e) => setNome(e.target.value)} />

        <label className="f" htmlFor="cor-social">
          Nome social ou de uso <small>— é o que aparece nas telas do turno</small>
        </label>
        <input id="cor-social" value={social} onChange={(e) => setSocial(e.target.value)} />

        <label className="f" htmlFor="cor-nasc">Data de nascimento</label>
        <input id="cor-nasc" type="date" value={nascimento}
               onChange={(e) => setNascimento(e.target.value)} />

        <label className="f" htmlFor="cor-mot">
          Por que está sendo corrigido <small>— pelo menos 10 caracteres</small>
        </label>
        <textarea id="cor-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: a certidão de nascimento chegou hoje; o nome estava escrito de ouvido no ingresso de emergência." />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onCorrigir({
            nome: nome.trim(), nomeSocial: social.trim() || null,
            nascimento, motivo: motivo.trim(),
          })}>
            Corrigir, com este motivo
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DA SITUAÇÃO JUDICIAL.
 *
 * Só o que MUDA com o tempo: vara, processo, guia, situação e observações. O
 * MOTIVO do acolhimento e a MEDIDA não se editam por aqui — eles pertencem ao
 * episódio, e mudá-los seria reescrever por que a criança foi acolhida.
 *
 * O servidor grava no episódio ATIVO. Um acolhimento anterior, encerrado,
 * continua contando o que de fato houve naquela época.
 */
function FolhaJudicial({ judicial, onFechar, onSalvar }: {
  judicial: Judicial; onFechar: () => void;
  onSalvar: (campos: Record<string, string | null>) => void;
}) {
  const [vara, setVara] = useState(judicial.vara ?? '');
  const [processo, setProcesso] = useState(judicial.processo ?? '');
  const [guia, setGuia] = useState(judicial.guia ?? '');
  const [situacao, setSituacao] = useState(judicial.situacao ?? '');
  const [obs, setObs] = useState(judicial.observacoes ?? '');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-jud"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-jud">Atualizar a situação judicial</h3>
        <div className="notice c-med">
          Área restrita. A atualização vale para o <b>acolhimento em curso</b>: um acolhimento
          anterior continua contando o que houve naquela época. O <b>motivo</b> e a <b>medida</b>
          não se editam aqui — eles são do episódio.
        </div>

        <label className="f" htmlFor="jud-sit">
          Situação <small>— o que está valendo agora</small>
        </label>
        <textarea id="jud-sit" value={situacao} onChange={(e) => setSituacao(e.target.value)}
                  placeholder="Ex.: audiência concentrada realizada em 12/08; manutenção do acolhimento e reavaliação em 90 dias." />

        <label className="f" htmlFor="jud-vara">Vara</label>
        <input id="jud-vara" value={vara} onChange={(e) => setVara(e.target.value)} />

        <label className="f" htmlFor="jud-proc">Processo</label>
        <input id="jud-proc" className="mono" value={processo}
               onChange={(e) => setProcesso(e.target.value)} />

        <label className="f" htmlFor="jud-guia">Guia</label>
        <input id="jud-guia" className="mono" value={guia} onChange={(e) => setGuia(e.target.value)} />

        <label className="f" htmlFor="jud-obs">Observações</label>
        <textarea id="jud-obs" value={obs} onChange={(e) => setObs(e.target.value)} />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" onClick={() => onSalvar({
            vara: vara.trim() || null, processo: processo.trim() || null,
            guia: guia.trim() || null, situacao: situacao.trim() || null,
            observacoes: obs.trim() || null,
          })}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
