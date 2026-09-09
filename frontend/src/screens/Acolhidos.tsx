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
  /** O hospital, quando ela está internada. O motivo não vem — e não deve. */
  noHospital?: string;
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
interface Contato {
  id: string; nome: string; vinculo: string; vinculoRotulo: string;
  telefone: string | null; observacao: string | null;
  restrito: boolean; motivoDaRestricao: string | null;
  ativo: boolean; motivoDoEncerramento: string | null;
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
  /** Só vem para quem pode escrevê-las (§6.2) — o educador não as recebe. */
  observacoes?: string | null;
  /* Os campos que vieram da lista que a equipe técnica mantinha à mão. */
  rg: string | null;
  cns: string | null;
  filiacao: string | null;
  foto: { rota: string; em: string } | null;
  contatos: Contato[];
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

/**
 * Uma alteração dos campos descritivos do perfil (§6.4, migração 0850).
 *
 * Irmã da correção, e diferente dela: aqui não há motivo escrito, porque
 * atualizar a série escolar em fevereiro é atualizar, não corrigir. O que se
 * guarda é o RASTRO — o texto que estava, o que passou a estar, quem e quando.
 */
interface Alteracao {
  id: string; campo: string; antes: string | null; depois: string | null;
  por: string; quando: string;
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

interface SaidaSozinho {
  personId: string; quem: string; status: string; motivo: string;
  ate: string | null; aRevisar: boolean;
}

/** O rótulo que o educador lê às sete da manhã. Nunca um número. */
const SAIDA_ROTULO: Record<string, { txt: string; tom: string }> = {
  liberada:    { txt: 'sai sozinho', tom: 'c-ok' },
  acompanhada: { txt: 'sai acompanhado', tom: 'c-warn' },
  suspensa:    { txt: 'não sai sozinho', tom: 'c-crit' },
};

interface Convivencia {
  id: string; personId: string; quem: string; comQuem: string; vinculo: string;
  saiuEm: string; retornoPrevisto: string;
  avisar: boolean; atrasado: boolean; finalidade: string | null;
}

const VINCULO: Record<string, string> = {
  genitora: 'mãe', genitor: 'pai', irmao: 'irmão', avo: 'avó/avô', tio: 'tio/tia',
  padrinho: 'padrinho', madrinha: 'madrinha',
  vinculo_comunitario: 'vínculo comunitário', servico_da_rede: 'serviço da rede',
  outro: 'outro',
};

const horaCurta = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit',
});

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
  /* Quem está com a família (1010), e quem já devia ter voltado. */
  const [fora, setFora] = useState<Convivencia[]>([]);
  const [recebendo, setRecebendo] = useState<Convivencia | null>(null);
  /* Quem sai acompanhado ou não sai. Quem está liberado NÃO vem: a lista
     inteira todo dia vira paisagem. */
  const [observar, setObservar] = useState<SaidaSozinho[]>([]);
  const [notaRetorno, setNotaRetorno] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setLista(await api<Resumo[]>(`/people?houseId=${houseId}`));
      /* Falhar aqui não trava a lista: os acolhidos continuam servindo. */
      setFora(await api<Convivencia[]>(`/people/family-stays?houseId=${houseId}`).catch(() => []));
      setObservar(await api<SaidaSozinho[]>(
        `/people/outing-permissions?houseId=${houseId}`).catch(() => []));
    }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar os acolhidos.'); }
  }, [houseId]);

  useEffect(() => { carregar(); }, [carregar]);

  const carregarAcervo = useCallback(async () => {
    setErro('');
    try { setAcervo(await api<Acervo>(`/people/archive?houseId=${houseId}`)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir o acervo.'); }
  }, [houseId]);

  /**
   * Registrar o retorno.
   *
   * Quem recebe a criança na porta às 18h de domingo é o educador de plantão —
   * e é ele quem registra. Exigir a técnica aqui deixaria a criança marcada
   * como fora da casa a noite inteira.
   */
  async function receber(c: Convivencia) {
    setErro('');
    try {
      await api(`/people/family-stays/${c.id}/return`, {
        method: 'POST',
        body: JSON.stringify({ quando: new Date().toISOString(), nota: notaRetorno.trim() }),
      });
      setRecebendo(null); setNotaRetorno('');
      setAviso(`Retorno de ${c.quem} registrado.`);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar o retorno.');
    }
  }

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

      {/*
        * SAÍDA SOZINHO (1020) — o que a casa precisa saber de manhã.
        *
        * O estado vem com o MOTIVO ao lado, sempre. "Vai acompanhado hoje" sem
        * o porquê é uma ordem sem explicação, e quem conversa com o
        * adolescente na porta é o educador.
        *
        * Não há pontuação, nem contagem, nem comparação entre crianças: um
        * número seria comparado mesmo sem tela de ranking, e sobreviveria ao
        * motivo que o gerou.
        */}
      {observar.length > 0 && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="eyebrow">Saídas de hoje — atenção</div>
          {observar.map((o) => (
            <div key={o.personId}>
              <div className="row">
                <b className="ff grow">{o.quem}</b>
                <span className={`pill ${SAIDA_ROTULO[o.status]?.tom ?? 'c-mute'}`}>
                  {SAIDA_ROTULO[o.status]?.txt ?? o.status}
                </span>
              </div>
              <div className="mutetxt">{o.motivo}</div>
              {o.aRevisar && (
                <div className="mutetxt">
                  <b>Combinado revisar até {new Date(o.ate!).toLocaleDateString('pt-BR')}.</b>{' '}
                  Continua valendo até alguém decidir outra coisa.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/*
        * COM A FAMÍLIA — acolhido em experiência familiar (1010).
        *
        * Antes da lista, e não dentro dela: quem abre esta tela às 17h de
        * domingo precisa ver quem está para chegar antes de qualquer outra
        * coisa. Quem está fora continua contando na casa e na vaga.
        */}
      {fora.length > 0 && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="eyebrow">Com a família</div>
          {fora.map((c) => (
            <div key={c.id} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <div className="grow">
                <b className="ff">{c.quem}</b>
                <div className="mutetxt">
                  com {c.comQuem} ({VINCULO[c.vinculo] ?? c.vinculo})
                  {c.finalidade ? ` · ${c.finalidade}` : ''}
                </div>
                <div className="estado">
                  {/*
                    * Duas frases, nenhuma acusação. O sistema não chama isto de
                    * evasão: "não voltou às 18h" e "evadiu" são coisas
                    * diferentes até alguém apurar, e quem apura é gente.
                    */}
                  {c.atrasado ? (
                    <span className="pill c-crit">
                      previsto {horaCurta(c.retornoPrevisto)} · retorno ainda não registrado
                    </span>
                  ) : c.avisar ? (
                    <span className="pill c-warn">
                      chega às {horaCurta(c.retornoPrevisto)} — fiquem de olho
                    </span>
                  ) : (
                    <span className="pill c-move">volta {horaCurta(c.retornoPrevisto)}</span>
                  )}
                </div>
              </div>
              <button className="btn sec sm"
                      onClick={() => { setRecebendo(c); setNotaRetorno(''); }}>
                Chegou
              </button>
            </div>
          ))}
        </div>
      )}

      {recebendo && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-receber"
             onClick={(e) => { if (e.target === e.currentTarget) setRecebendo(null); }}>
          <div className="sheet">
            <h3 id="t-receber">{recebendo.quem} chegou</h3>
            <p className="mutetxt">
              De volta de {recebendo.comQuem}. A partir de agora ela volta à chamada,
              à rotina e à grade de medicamentos.
            </p>
            <label className="f" htmlFor="nota-ret">Como foi a chegada (opcional)</label>
            {/* A ajuda pede FATO, não rótulo: "voltou agressiva" gruda, "chegou
                sem falar e foi para o quarto" pode mudar (§8.14). */}
            <textarea id="nota-ret" rows={3} value={notaRetorno}
                      onChange={(e) => setNotaRetorno(e.target.value)}
                      placeholder="O que você observou. Ex.: chegou no horário, trouxe uma mochila de roupas; ficou quieta e foi direto para o quarto." />
            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              <button type="button" className="btn sec grow"
                      onClick={() => setRecebendo(null)}>Cancelar</button>
              <button type="button" className="btn grow"
                      onClick={() => receber(recebendo)}>Registrar chegada</button>
            </div>
          </div>
        </div>
      )}

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
                <div className="mutetxt">
                  {p.idade} anos
                  {/*
                    * ONDE ELA ESTÁ, quando não está na casa.
                    *
                    * O educador não lê a internação — o motivo, o diário e a
                    * medicação do hospital estão atrás do alcance dela. Mas ele
                    * precisa saber que a criança está no hospital, porque ela
                    * SUMIU da chamada dele: sem esta linha, ele conta dezenove
                    * onde havia vinte e liga para a coordenação às onze da
                    * noite para perguntar o que aconteceu.
                    */}
                  {p.noHospital && <> · no hospital</>}
                </div>
              </div>
              {p.noHospital && (
                <span className="pill c-info" title={`No ${p.noHospital}`}>🏥</span>
              )}
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
  /** Atualizar o que é descrição (§6.4): não pede motivo, mas deixa rastro. */
  const [editandoDetalhe, setEditandoDetalhe] = useState(false);
  const [alteracoes, setAlteracoes] = useState<Alteracao[]>([]);

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
        setAlteracoes(
          await api<Alteracao[]>(`/people/${personId}/detalhe-historico`).catch(() => []));
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
    setAlteracoes(
      await api<Alteracao[]>(`/people/${personId}/detalhe-historico`).catch(() => alteracoes));
  }

  if (dossie) {
    return <Dossie personId={personId} nome={p.nome} papel={papel}
                   onVoltar={() => setDossie(false)} />;
  }

  const pendentes = doses.filter((d) => d.pendente);

  return (
    <>
      <div className="diahead">
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          {/*
            * A FOTO DE IDENTIFICAÇÃO.
            *
            * Vinte crianças, plantão que troca a cada doze horas, gente nova
            * toda semana. A foto está aqui para a equipe saber quem é quem —
            * não é retrato, e não entra em documento nenhum por padrão.
            */}
          <FotoDoAcolhido perfil={p} papel={papel} onTrocou={recarregar} />
          <div className="grow">
            <button className="btn sm ghost" onClick={onVoltar}>← Acolhidos</button>
            <h2>{p.nome}</h2>
            <div className="mutetxt">
              {p.idade} anos · {dia(p.nascimento)}
              {p.casaAtual ? ` · ${p.casaAtual.codigo} desde ${dia(p.casaAtual.desde)}` : ''}
            </div>
            {(p.rg || p.cns || p.filiacao) && (
              <div className="mutetxt" style={{ marginTop: 4 }}>
                {p.rg && <>RG {p.rg}</>}
                {p.rg && p.cns ? ' · ' : ''}
                {p.cns && <>SUS {p.cns}</>}
                {p.filiacao && (
                  <div>Filiação: {p.filiacao.split('\n').filter(Boolean).join(' · ')}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/*
        * O QUE ELA CONQUISTOU.
        *
        * A conquista se registra AQUI, no perfil, e não na tela do Gestor
        * Geral: quem escreve é a equipe técnica, que trabalha no caso da
        * criança — e a tela do gestor é a das oito casas, que a técnica nem
        * alcança. Sem este bloco, a fase 58 tinha criado uma tabela que só a
        * API sabia preencher.
        */}
      <Conquistas perfil={p} papel={papel} />

      {/*
        * QUEM APARECE POR ESTA CRIANÇA.
        *
        * Fica ALTO na tela, junto da identificação, porque é informação de
        * plantão: quem está com a criança precisa saber quem é a pessoa que
        * apareceu no portão às nove da noite, sem ligar para a técnica.
        */}
      <SairSozinho perfil={p} papel={papel} onMudou={recarregar} />
      <Contatos perfil={p} papel={papel} onMudou={recarregar} />

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

      {/*
        * ATUALIZAR O QUE É DESCRIÇÃO (§6.4).
        *
        * Separado de "corrigir o cadastro" de propósito, e o rótulo diz a
        * diferença: corrigir mexe em QUEM a criança é nos papéis e exige
        * motivo; atualizar mexe no que a casa precisa saber hoje — a escola
        * nova, o cuidado que a Enfermagem passou a orientar — e a série muda
        * todo ano. Juntar as duas coisas numa folha só ensinaria a equipe a
        * escrever "atualização" no campo de motivo mil vezes, e aí o motivo
        * deixa de ser lido justamente quando importa.
        */}
      {QUEM_CADASTRA.includes(papel) && (
        <button className="btn ghost block" style={{ marginBottom: 12 }}
                onClick={() => setEditandoDetalhe(true)}>
          📝 Atualizar escola, cuidados e equipe
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

      {/*
        * O que o perfil dizia antes. Fica à vista de TODO MUNDO que alcança a
        * criança, inclusive do educador de plantão: é ele quem vai agir sobre
        * o cuidado essencial que a técnica reescreveu hoje de manhã, e ele
        * precisa poder ver que mudou — e o que dizia antes — sem perguntar.
        */}
      {alteracoes.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="eyebrow" style={{ marginTop: 0 }}>
            O que mudou no perfil · {alteracoes.length}
          </div>
          <ul className="lista">
            {alteracoes.map((a) => (
              <li key={a.id}>
                <b className="ff">{a.campo}</b>
                <div className="mutetxt linhadois">
                  de <b>{a.antes || '(em branco)'}</b> para <b>{a.depois || '(em branco)'}</b>
                </div>
                <div className="mutetxt">{a.por} · {dia(a.quando)}</div>
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

      {/*
        * Vazio DIZ "não preenchido" para quem pode preencher, e some para quem
        * não pode. Escondê-lo de todo mundo era o que mantinha o defeito: sem
        * a seção na tela, ninguém sentia falta da porta que não existia — e o
        * campo mais importante do perfil ficava em branco para sempre.
        */}
      {(p.cuidadosEssenciais || QUEM_CADASTRA.includes(papel)) && (
        <Secao titulo="Cuidados essenciais">
          {p.cuidadosEssenciais
            ? <p className="bloco" style={{ marginTop: 0 }}>{p.cuidadosEssenciais}</p>
            : <p className="mutetxt" style={{ margin: 0 }}>
                Nada escrito ainda. É aqui que fica o que a educadora precisa saber antes de
                dar banho, de deixar sozinha ou de servir o prato.
              </p>}
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

      {((p.escola && (p.escola.nome || p.escola.serie)) || QUEM_CADASTRA.includes(papel)) && (
        <Secao titulo="Escola">
          {p.escola && (p.escola.nome || p.escola.serie) ? (
            <>
              <b className="ff">{p.escola.nome ?? 'Escola não informada'}</b>
              <div className="mutetxt">
                {[p.escola.serie, p.escola.turno].filter(Boolean).join(' · ') || 'Série e turno não informados'}
              </div>
              {p.escola.endereco && <div className="mutetxt">{p.escola.endereco}</div>}
            </>
          ) : (
            <p className="mutetxt" style={{ margin: 0 }}>Escola não informada.</p>
          )}
        </Secao>
      )}

      {(p.equipeReferencia || QUEM_CADASTRA.includes(papel)) && (
        <Secao titulo="Equipe de referência">
          {p.equipeReferencia
            ? <p className="bloco" style={{ marginTop: 0 }}>{p.equipeReferencia}</p>
            : <p className="mutetxt" style={{ margin: 0 }}>Não informada.</p>}
        </Secao>
      )}

      {/* As observações só chegam a quem pode escrevê-las: o servidor nem as
          devolve para os outros cargos (§6.2). */}
      {p.observacoes !== undefined && (
        <Secao titulo="Observações">
          {p.observacoes
            ? <p className="bloco" style={{ marginTop: 0 }}>{p.observacoes}</p>
            : <p className="mutetxt" style={{ margin: 0 }}>Nada escrito ainda.</p>}
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

      {editandoDetalhe && (
        <FolhaDetalhe
          perfil={p}
          onFechar={() => setEditandoDetalhe(false)}
          onSalvar={async (campos) => {
            setErro(''); setAviso('');
            try {
              const r = await api<{ aviso?: string; alterado: number }>(
                `/people/${personId}`,
                { method: 'PATCH', body: JSON.stringify(campos) });
              setEditandoDetalhe(false);
              setAviso(r?.aviso ?? 'Perfil atualizado.');
              await recarregar();
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível atualizar o perfil.');
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
  onCorrigir: (d: { nome?: string; nomeSocial?: string | null; nascimento?: string;
                    rg?: string | null; cns?: string | null; filiacao?: string | null;
                    motivo: string }) => void;
}) {
  const [nome, setNome] = useState(perfil.nomeCivil ?? perfil.nome);
  const [social, setSocial] = useState(perfil.nome ?? '');
  const [nascimento, setNascimento] = useState(String(perfil.nascimento ?? '').slice(0, 10));
  /*
   * RG, CNS e filiação entram AQUI, junto do nome — e não na folha de
   * "atualizar", que não pede motivo. Documento de identidade não muda: ou
   * estava errado, ou foi emitido agora, e nos dois casos alguém vai
   * perguntar, um ano depois, por que o RG do relatório de março não é o de
   * setembro.
   */
  const [rg, setRg] = useState(perfil.rg ?? '');
  const [cns, setCns] = useState(perfil.cns ?? '');
  const [filiacao, setFiliacao] = useState(perfil.filiacao ?? '');
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

        <label className="f" htmlFor="cor-rg">RG</label>
        <input id="cor-rg" value={rg} onChange={(e) => setRg(e.target.value)}
               placeholder="deixe em branco se ainda não tem" />

        <label className="f" htmlFor="cor-cns">
          Cartão SUS <small>— o número do CNS</small>
        </label>
        <input id="cor-cns" value={cns} onChange={(e) => setCns(e.target.value)} />

        <label className="f" htmlFor="cor-fil">
          Filiação <small>— um nome por linha, como está na certidão</small>
        </label>
        <textarea id="cor-fil" value={filiacao} onChange={(e) => setFiliacao(e.target.value)}
                  placeholder="Ex.: Fulana de Tal&#10;Beltrano de Tal" />

        <label className="f" htmlFor="cor-mot">
          Por que está sendo corrigido <small>— pelo menos 10 caracteres</small>
        </label>
        <textarea id="cor-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: a certidão de nascimento chegou hoje; o nome estava escrito de ouvido no ingresso de emergência." />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onCorrigir({
            nome: nome.trim(), nomeSocial: social.trim() || null,
            nascimento,
            rg: rg.trim() || null, cns: cns.trim() || null, filiacao: filiacao.trim() || null,
            motivo: motivo.trim(),
          })}>
            Corrigir, com este motivo
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DOS DADOS DESCRITIVOS (§6.4).
 *
 * Três decisões que ela toma:
 *
 *  * **os campos vêm preenchidos com o que está lá.** Atualizar é comparar; um
 *    formulário vazio faz a pessoa redigitar o que já estava certo — e, pior,
 *    apagar por descuido o que não pretendia tocar;
 *  * **não pede motivo**, e o aviso explica por quê: a série muda todo ano.
 *    O que fica registrado é o texto anterior, com nome e horário;
 *  * **o cuidado essencial vem primeiro e com aviso próprio.** É o único campo
 *    desta folha que alguém lê no corredor às 23h antes de agir, e reescrevê-lo
 *    por cima do que a Enfermagem orientou é o erro caro daqui.
 */
function FolhaDetalhe({ perfil, onFechar, onSalvar }: {
  perfil: Perfil; onFechar: () => void;
  onSalvar: (campos: Record<string, string | null>) => void;
}) {
  const [cuidados, setCuidados] = useState(perfil.cuidadosEssenciais ?? '');
  const [escola, setEscola] = useState(perfil.escola?.nome ?? '');
  const [serie, setSerie] = useState(perfil.escola?.serie ?? '');
  const [turno, setTurno] = useState(perfil.escola?.turno ?? '');
  const [endereco, setEndereco] = useState(perfil.escola?.endereco ?? '');
  const [equipe, setEquipe] = useState(perfil.equipeReferencia ?? '');
  const [obs, setObs] = useState(perfil.observacoes ?? '');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-det"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-det">Atualizar dados do perfil</h3>
        <div className="notice c-info">
          Aqui não se pede motivo: a série muda todo ano, e a escola muda quando a criança
          muda de escola. O que <b>fica registrado</b> é o texto anterior, com o seu nome e o
          horário — e ele aparece no perfil, para quem cuida da criança poder ler.
          Nome, nome social e data de nascimento não se alteram por aqui: para isso existe
          <b> Corrigir o cadastro</b>, que pede motivo.
        </div>

        <label className="f" htmlFor="det-cui">
          Cuidados essenciais <small>— o que se precisa saber antes de agir</small>
        </label>
        <textarea id="det-cui" value={cuidados} onChange={(e) => setCuidados(e.target.value)}
                  placeholder="Ex.: usa aparelho auditivo do lado direito; avisar antes de encostar. Engasga com alimento em pedaço — comida cortada pequena." />
        <p className="mutetxt">
          Este bloco é lido no corredor, de relance, antes do banho e antes do prato.
          Acrescente ao que já está escrito em vez de substituir, quando as duas coisas
          continuarem valendo.
        </p>

        <label className="f" htmlFor="det-esc">Escola</label>
        <input id="det-esc" value={escola} onChange={(e) => setEscola(e.target.value)} />

        <label className="f" htmlFor="det-ser">Série</label>
        <input id="det-ser" value={serie} onChange={(e) => setSerie(e.target.value)} />

        <label className="f" htmlFor="det-tur">Turno da escola</label>
        <input id="det-tur" value={turno} onChange={(e) => setTurno(e.target.value)} />

        <label className="f" htmlFor="det-end">
          Endereço da escola <small>— para a logística da ida e da volta</small>
        </label>
        <input id="det-end" value={endereco} onChange={(e) => setEndereco(e.target.value)} />

        <label className="f" htmlFor="det-eq">
          Equipe de referência <small>— quem acompanha esta criança fora da casa</small>
        </label>
        <textarea id="det-eq" value={equipe} onChange={(e) => setEquipe(e.target.value)}
                  placeholder="Ex.: CRAS Restinga — técnica de referência Joana; CAPSi — psicóloga Marta, quinzenal." />

        <label className="f" htmlFor="det-obs">
          Observações <small>— da equipe técnica e da coordenação</small>
        </label>
        <textarea id="det-obs" value={obs} onChange={(e) => setObs(e.target.value)} />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" onClick={() => onSalvar({
            cuidadosEssenciais: cuidados.trim() || null,
            escolaNome: escola.trim() || null,
            escolaSerie: serie.trim() || null,
            escolaTurno: turno.trim() || null,
            escolaEndereco: endereco.trim() || null,
            equipeReferencia: equipe.trim() || null,
            observacoes: obs.trim() || null,
          })}>
            Salvar
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

/**
 * A FOTO DE IDENTIFICAÇÃO.
 *
 * A coordenação decidiu em 03/09/2026 que ela não depende de autorização de
 * imagem: serve para a equipe reconhecer quem é quem, e se sair num documento
 * é para o Juízo, que responde pela proteção da criança tanto quanto a casa.
 *
 * Duas coisas que a tela faz de propósito:
 *
 *  * **quem não tem foto não fica com um buraco.** Aparecem as iniciais, para
 *    a linha não desalinhar e para a falta não parecer defeito;
 *  * **a foto não é botão de download.** Ela é vista aqui; quem precisar dela
 *    num documento vai ter que pedir, e aí a decisão é de quem pede.
 */
function FotoDoAcolhido({ perfil, papel, onTrocou }: {
  perfil: Perfil; papel: string; onTrocou: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const podeTrocar = QUEM_CADASTRA.includes(papel);

  useEffect(() => {
    let vivo = true;
    if (!perfil.foto) { setSrc(null); return () => { vivo = false; }; }
    api<{ tipo: string; conteudo: string }>(`/people/${perfil.id}/photo`)
      .then((f) => { if (vivo) setSrc(`data:${f.tipo};base64,${f.conteudo}`); })
      .catch(() => { if (vivo) setSrc(null); });
    return () => { vivo = false; };
  }, [perfil.id, perfil.foto?.em]);

  const iniciais = perfil.nome.split(' ').filter(Boolean).slice(0, 2)
    .map((n) => n[0]).join('').toUpperCase();

  async function enviar(arquivo: File) {
    setErro(''); setOcupado(true);
    try {
      const base64 = await new Promise<string>((ok, falhou) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(',')[1] ?? '');
        r.onerror = () => falhou(new Error('Não foi possível ler o arquivo.'));
        r.readAsDataURL(arquivo);
      });
      await api(`/people/${perfil.id}/photo`, {
        method: 'POST', body: JSON.stringify({ conteudo: base64, nomeArquivo: arquivo.name }),
      });
      onTrocou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível guardar a foto.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div style={{ flex: 'none', textAlign: 'center' }}>
      <div className="retrato" aria-label={src ? `Foto de ${perfil.nome}` : 'Sem foto'}>
        {src ? <img src={src} alt={`Foto de identificação de ${perfil.nome}`} /> : <span>{iniciais}</span>}
      </div>
      {podeTrocar && (
        <label className="btn sm ghost" style={{ marginTop: 6, display: 'inline-block' }}>
          {ocupado ? 'Enviando…' : (src ? 'Trocar foto' : 'Pôr foto')}
          <input type="file" accept="image/*" style={{ display: 'none' }}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }} />
        </label>
      )}
      {erro && <div className="mutetxt">{erro}</div>}
    </div>
  );
}

/**
 * QUEM APARECE POR ESTA CRIANÇA.
 *
 * Veio da lista que a equipe técnica mantinha à mão, onde genitora, padrinho,
 * tia e vínculo comunitário dividiam a mesma célula. É assim que a casa pensa:
 * o que importa é quem atende quando a criança precisa.
 *
 * O educador LÊ (decisão da coordenação, 03/09/2026) e não escreve. E o
 * contato com aproximação restrita aparece PRIMEIRO, com o motivo à vista —
 * quem descobre isso às onze da noite descobre tarde.
 */

/**
 * A saída para convivência familiar.
 *
 * Duas datas com hora: quando sai e quando é para voltar. A segunda não é
 * enfeite — é ela que o aviso lê, e sem hora o sistema não teria como dizer
 * "chega às 18h, fiquem de olho".
 */
function FolhaSaidaFamiliar({ pessoa, contato, onFechar, onRegistrar }: {
  pessoa: string; contato: Contato;
  onFechar: () => void;
  onRegistrar: (inicio: string, retorno: string, finalidade: string) => void;
}) {
  const agora = new Date();
  const emDias = (d: number) => {
    const x = new Date(agora.getTime() + d * 86400_000);
    x.setHours(18, 0, 0, 0);
    return x;
  };
  const paraInput = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const [inicio, setInicio] = useState(paraInput(agora));
  const [retorno, setRetorno] = useState(paraInput(emDias(2)));
  const [finalidade, setFinalidade] = useState('');
  const ordemErrada = new Date(retorno) <= new Date(inicio);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-saida"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-saida">{pessoa} com {contato.nome}</h3>
        <p className="mutetxt">
          Enquanto estiver fora, {pessoa} sai da chamada, da rotina e da grade de
          medicamentos — e <b>continua ocupando a vaga na casa</b>. Volta sozinha
          quando alguém registrar a chegada.
        </p>

        <label className="f" htmlFor="fs-ini">Sai em</label>
        <input id="fs-ini" type="datetime-local" value={inicio}
               onChange={(e) => setInicio(e.target.value)} />

        <label className="f" htmlFor="fs-ret">É para voltar em</label>
        <input id="fs-ret" type="datetime-local" value={retorno}
               onChange={(e) => setRetorno(e.target.value)} />
        <div className="mutetxt">
          A casa recebe um lembrete uma hora antes, e vê na tela se a hora passar
          sem a chegada registrada.
        </div>

        <label className="f" htmlFor="fs-fin">Para quê (opcional)</label>
        <input id="fs-fin" value={finalidade} maxLength={120}
               onChange={(e) => setFinalidade(e.target.value)}
               placeholder="Ex.: fim de semana em casa; aniversário do irmão." />

        {ordemErrada && (
          <div className="notice c-warn" role="status">
            A volta tem de ser depois da saída.
          </div>
        )}

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={ordemErrada}
                  onClick={() => onRegistrar(new Date(inicio).toISOString(),
                                             new Date(retorno).toISOString(), finalidade.trim())}>
            Registrar saída
          </button>
        </div>
      </div>
    </div>
  );
}


/**
 * SAIR SOZINHO — a decisão, o motivo e o histórico.
 *
 * Fica no perfil, junto dos contatos, porque é onde a equipe técnica já
 * trabalha. O educador não decide: ele LÊ, na lista da casa, de manhã.
 */
function SairSozinho({ perfil, papel, onMudou }: {
  perfil: Perfil; papel: string; onMudou: () => void;
}) {
  const [dados, setDados] = useState<{ vigente: any; historico: any[] } | null>(null);
  const [decidindo, setDecidindo] = useState(false);
  const [status, setStatus] = useState('liberada');
  const [motivo, setMotivo] = useState('');
  const [ate, setAte] = useState('');
  const [onde, setOnde] = useState('');
  const [erro, setErro] = useState('');
  const podeDecidir = ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(papel);

  const carregar = useCallback(async () => {
    try { setDados(await api(`/people/${perfil.id}/outing-permission`)); }
    catch { setDados(null); }
  }, [perfil.id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    setErro('');
    try {
      await api(`/people/${perfil.id}/outing-permission`, {
        method: 'POST',
        body: JSON.stringify({ status, motivo: motivo.trim(), ate: ate || null, onde: onde.trim() }),
      });
      setDecidindo(false); setMotivo(''); setAte(''); setOnde('');
      await carregar(); onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar.');
    }
  }

  const v = dados?.vigente;
  return (
    <>
      <div className="eyebrow">Sair sozinho</div>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      {/* Ausência NÃO é liberação: dizer isso por extenso evita que o silêncio
          do cadastro seja lido como permissão. */}
      {!v && (
        <p className="mutetxt">
          Sem definição registrada. A casa faz o que sempre fez — isto não é
          autorização para sair sozinho.
        </p>
      )}

      {v && (
        <div className="card stack">
          <div className="row">
            <b className="ff grow">{SAIDA_ROTULO[v.status]?.txt ?? v.status}</b>
            <span className={`pill ${SAIDA_ROTULO[v.status]?.tom ?? 'c-mute'}`}>
              desde {new Date(v.desde).toLocaleDateString('pt-BR')}
            </span>
          </div>
          <div>{v.motivo}</div>
          {v.onde && <div className="mutetxt">Onde: {v.onde}</div>}
          <div className="mutetxt">Decidido por {v.quem}.</div>
          {v.ate && (
            <div className={v.aRevisar ? 'notice c-warn' : 'mutetxt'} role="status">
              Combinado revisar em {new Date(v.ate).toLocaleDateString('pt-BR')}.
              {v.aRevisar && ' O prazo chegou — continua valendo até alguém decidir outra coisa.'}
            </div>
          )}
        </div>
      )}

      {podeDecidir && !decidindo && (
        <button className="btn sec block" style={{ marginBottom: 12 }}
                onClick={() => { setStatus(v?.status === 'liberada' ? 'suspensa' : 'liberada'); setDecidindo(true); }}>
          🚪 Registrar decisão sobre sair sozinho
        </button>
      )}

      {decidindo && (
        <div className="card stack">
          <label className="f" htmlFor="ss-st">O que vale a partir de agora</label>
          <select id="ss-st" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="liberada">Sai sozinho</option>
            <option value="acompanhada">Sai acompanhado</option>
            <option value="suspensa">Não sai sozinho</option>
          </select>

          <label className="f" htmlFor="ss-mot">Por quê</label>
          {/* Motivo exigido inclusive para liberar: "por que ele pode sair
              sozinho" é decisão tão registrável quanto a outra. */}
          <textarea id="ss-mot" rows={2} value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ex.: vai e volta da escola sozinho desde março, sem intercorrência." />

          {status !== 'liberada' && (
            <>
              <label className="f" htmlFor="ss-ate">Revisar até</label>
              <input id="ss-ate" type="date" value={ate}
                     onChange={(e) => setAte(e.target.value)} />
              <div className="mutetxt">
                Obrigatório quando não sai sozinho: medida sem prazo vira permanente
                por esquecimento, e ninguém decidiu que seria permanente.
              </div>
            </>
          )}

          <label className="f" htmlFor="ss-onde">Onde pode ir sozinho (opcional)</label>
          <input id="ss-onde" value={onde} maxLength={120}
                 onChange={(e) => setOnde(e.target.value)}
                 placeholder="Ex.: escola e curso; nada além disso." />

          <div className="row" style={{ gap: 8 }}>
            <button className="btn sec grow" onClick={() => { setDecidindo(false); setErro(''); }}>
              Cancelar
            </button>
            <button className="btn grow"
                    disabled={motivo.trim().length < 10 || (status === 'suspensa' && !ate)}
                    onClick={salvar}>
              Registrar
            </button>
          </div>
        </div>
      )}

      {/* O histórico responde "por que ele perdeu a saída em março". */}
      {(dados?.historico ?? []).length > 1 && (
        <details style={{ marginBottom: 12 }}>
          <summary className="mutetxt">Decisões anteriores</summary>
          <ul className="lista-seca">
            {dados!.historico.slice(1).map((h, i) => (
              <li key={i}>
                <span className={`pill ${SAIDA_ROTULO[h.status]?.tom ?? 'c-mute'}`}>
                  {SAIDA_ROTULO[h.status]?.txt ?? h.status}
                </span>{' '}
                {new Date(h.de).toLocaleDateString('pt-BR')}
                {h.ateQuando ? ` a ${new Date(h.ateQuando).toLocaleDateString('pt-BR')}` : ''}
                {' — '}{h.motivo} <span className="mutetxt">({h.quem})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Contatos({ perfil, papel, onMudou }: {
  perfil: Perfil; papel: string; onMudou: () => void;
}) {
  const [novo, setNovo] = useState(false);
  const [encerrando, setEncerrando] = useState<Contato | null>(null);
  const [saindoCom, setSaindoCom] = useState<Contato | null>(null);
  const [erroSaida, setErroSaida] = useState('');
  const podeEscrever = QUEM_CADASTRA.includes(papel);
  const ativos = (perfil.contatos ?? []).filter((c) => c.ativo);

  return (
    <>
      <div className="eyebrow">Quem aparece por {perfil.nome} · {ativos.length}</div>
      {!ativos.length && (
        <p className="mutetxt">
          Nenhum contato cadastrado. Enquanto isso, o telefone da mãe e o da madrinha
          continuam numa lista fora do sistema.
        </p>
      )}
      <div className="stack">
        {ativos.map((c) => (
          <div key={c.id} className="card">
            <div className="row">
              <b className="ff grow">{c.nome}</b>
              <span className="pill c-info">{c.vinculoRotulo}</span>
            </div>
            {c.telefone && <div>{c.telefone}</div>}
            {c.observacao && <div className="mutetxt">{c.observacao}</div>}
            {c.restrito && (
              <div className="notice c-crit" role="alert">
                <b>Aproximação restrita.</b> {c.motivoDaRestricao}
              </div>
            )}
            {podeEscrever && (
              <div className="acoes">
                {/*
                  * SAIR PARA CONVIVÊNCIA FAMILIAR (1010).
                  *
                  * O botão nasce no CONTATO, não numa tela solta: a saída
                  * aponta para quem já está cadastrado, e digitar o nome à mão
                  * permitiria escrever qualquer um.
                  *
                  * No contato com aproximação restrita ele não aparece — e o
                  * servidor recusa de qualquer jeito. A tela não oferece o que
                  * o servidor vai recusar.
                  */}
                {!c.restrito && (
                  <button className="btn sm ghost" onClick={() => setSaindoCom(c)}>
                    Vai passar dias com {c.nome.split(' ')[0]}
                  </button>
                )}
                <button className="btn sm ghost" onClick={() => setEncerrando(c)}>
                  Este contato não vale mais
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {podeEscrever && (
        <button className="btn sec block" style={{ marginBottom: 12 }} onClick={() => setNovo(true)}>
          ☎️ Acrescentar contato
        </button>
      )}

      {erroSaida && <div className="notice c-crit" role="alert">{erroSaida}</div>}

      {saindoCom && (
        <FolhaSaidaFamiliar
          pessoa={perfil.nome} contato={saindoCom}
          onFechar={() => { setSaindoCom(null); setErroSaida(''); }}
          onRegistrar={async (inicio, retorno, finalidade) => {
            setErroSaida('');
            try {
              await api('/people/family-stays', {
                method: 'POST',
                body: JSON.stringify({
                  personId: perfil.id, contatoId: saindoCom.id,
                  inicio, retornoPrevisto: retorno, finalidade,
                }),
              });
              setSaindoCom(null); onMudou();
            } catch (e) {
              setErroSaida(e instanceof Error ? e.message : 'Não foi possível registrar a saída.');
            }
          }} />
      )}

      {novo && (
        <FolhaContato
          nome={perfil.nome}
          onFechar={() => setNovo(false)}
          onSalvar={async (d) => {
            await api(`/people/${perfil.id}/contacts`, {
              method: 'POST', body: JSON.stringify(d),
            });
            setNovo(false); onMudou();
          }} />
      )}

      {encerrando && (
        <FolhaEncerrarContato
          contato={encerrando}
          onFechar={() => setEncerrando(null)}
          onEncerrar={async (motivo) => {
            await api(`/people/contacts/${encerrando.id}/end`, {
              method: 'POST', body: JSON.stringify({ motivo }),
            });
            setEncerrando(null); onMudou();
          }} />
      )}
    </>
  );
}

function FolhaContato({ nome, onFechar, onSalvar }: {
  nome: string; onFechar: () => void;
  onSalvar: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [vocab, setVocab] = useState<{ vinculos: { code: string; label: string }[]; nota: string } | null>(null);
  const [dados, setDados] = useState({
    nome: '', vinculo: 'madrinha', vinculoOutro: '', telefone: '', observacao: '',
  });
  const [restrito, setRestrito] = useState(false);
  const [motivoRestricao, setMotivoRestricao] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<{ vinculos: { code: string; label: string }[]; nota: string }>('/people/contacts/kinds')
      .then(setVocab).catch(() => setVocab(null));
  }, []);

  const pode = dados.nome.trim().length >= 2
    && (dados.vinculo !== 'outro' || dados.vinculoOutro.trim().length >= 2)
    && (!restrito || motivoRestricao.trim().length >= 10);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-cont"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-cont">Quem aparece por {nome}</h3>
        {vocab && <p className="mutetxt">{vocab.nota}</p>}

        <label className="f" htmlFor="ct-nome">Nome</label>
        <input id="ct-nome" value={dados.nome}
               onChange={(e) => setDados({ ...dados, nome: e.target.value })} />

        <label className="f" htmlFor="ct-vinc">Vínculo</label>
        <select id="ct-vinc" value={dados.vinculo}
                onChange={(e) => setDados({ ...dados, vinculo: e.target.value })}>
          {(vocab?.vinculos ?? [{ code: 'madrinha', label: 'Madrinha' }])
            .map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}
        </select>
        {dados.vinculo === 'outro' && (
          <>
            <label className="f" htmlFor="ct-outro">Qual é o vínculo</label>
            <input id="ct-outro" value={dados.vinculoOutro}
                   onChange={(e) => setDados({ ...dados, vinculoOutro: e.target.value })} />
          </>
        )}

        <label className="f" htmlFor="ct-tel">Telefone</label>
        <input id="ct-tel" value={dados.telefone}
               onChange={(e) => setDados({ ...dados, telefone: e.target.value })} />

        <label className="f" htmlFor="ct-obs">
          Observação <small>— o que a equipe precisa saber antes de ligar</small>
        </label>
        <textarea id="ct-obs" value={dados.observacao}
                  onChange={(e) => setDados({ ...dados, observacao: e.target.value })}
                  placeholder="Ex.: busca na escola às sextas; só atende de manhã." />

        <label className="f">
          <input type="checkbox" checked={restrito}
                 onChange={(e) => setRestrito(e.target.checked)} />
          {' '}Aproximação restrita
        </label>
        {restrito && (
          <>
            <label className="f" htmlFor="ct-mot">
              Por quê <small>— quem lê às 23h precisa saber se ainda vale</small>
            </label>
            <textarea id="ct-mot" value={motivoRestricao}
                      onChange={(e) => setMotivoRestricao(e.target.value)} />
          </>
        )}

        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={async () => {
            try {
              await onSalvar({
                ...dados, nome: dados.nome.trim(),
                restrito, motivoDaRestricao: restrito ? motivoRestricao.trim() : undefined,
              });
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
            }
          }}>Salvar contato</button>
        </div>
      </div>
    </div>
  );
}

function FolhaEncerrarContato({ contato, onFechar, onEncerrar }: {
  contato: Contato; onFechar: () => void; onEncerrar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3>Este contato não vale mais</h3>
        <p className="mutetxt">
          <b>{contato.nome}</b> sai da lista do plantão e continua no cadastro, com o motivo.
          O telefone que deixou de valer é informação: alguém tentou por ele e não conseguiu.
        </p>
        <label className="f" htmlFor="ct-fim">Por quê</label>
        <textarea id="ct-fim" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: telefone mudou; a madrinha informou o novo." />
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={motivo.trim().length < 5}
                  onClick={async () => {
                    try { await onEncerrar(motivo.trim()); }
                    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível.'); }
                  }}>Encerrar contato</button>
        </div>
      </div>
    </div>
  );
}


/**
 * AS CONQUISTAS, NO PERFIL DA CRIANÇA.
 *
 * Todo mundo da casa lê — é a parte boa da história, e escondê-la de quem
 * acorda a criança todo dia seria transformar em relatório o que devia ser
 * motivo de a casa inteira saber. Escrever é da técnica, da coordenação e do
 * Gestor Geral.
 *
 * A lista é curta de propósito: as três últimas, e um botão para a trajetória
 * inteira. O perfil já é longo, e conquista não é o que se procura ali às 23h.
 */
function Conquistas({ perfil, papel }: { perfil: Perfil; papel: string }) {
  const [lista, setLista] = useState<any[] | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [erro, setErro] = useState('');
  const podeEscrever = QUEM_CADASTRA.includes(papel);

  const carregar = useCallback(async () => {
    try {
      setLista(await api<any[]>(`/impacto/marcos?personId=${perfil.id}&de=1900-01-01`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : '');
    }
  }, [perfil.id]);

  useEffect(() => { void carregar(); }, [carregar]);
  if (erro) return null;

  return (
    <>
      <div className="eyebrow">O que {perfil.nome} conquistou · {(lista ?? []).length}</div>
      {lista && !lista.length && (
        <p className="mutetxt">
          Nada registrado ainda. Isso não é uma avaliação dela: é a informação de que
          ninguém escreveu.
        </p>
      )}
      <div className="stack">
        {(lista ?? []).slice(0, 3).map((m) => (
          <div key={m.id} className="card">
            <div className="row">
              <span aria-hidden="true">{m.icone}</span>
              <b className="ff grow">{m.tipoRotulo}</b>
              <span className="pill c-ok">{dia(m.quando)}</span>
            </div>
            <div>{m.descricao}</div>
            {m.instituicao && <div className="mutetxt">{m.instituicao}</div>}
          </div>
        ))}
      </div>
      {podeEscrever && (
        <button className="btn sec block" style={{ marginBottom: 12 }}
                onClick={() => setRegistrando(true)}>
          ✨ Registrar conquista
        </button>
      )}

      {registrando && (
        <FolhaConquistaDoPerfil
          perfil={perfil}
          onFechar={() => setRegistrando(false)}
          onSalvou={() => { setRegistrando(false); void carregar(); }} />
      )}
    </>
  );
}

function FolhaConquistaDoPerfil({ perfil, onFechar, onSalvou }: {
  perfil: Perfil; onFechar: () => void; onSalvou: () => void;
}) {
  const [tipos, setTipos] = useState<{ cod: string; label: string; icone: string }[]>([]);
  const [d, setD] = useState({
    tipo: 'aprovacao_escolar', tipoOutro: '', quando: '', descricao: '', instituicao: '',
  });
  const [arquivo, setArquivo] = useState<{ nome: string; base64: string } | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api<{ tipos: any[] }>('/impacto/kinds').then((v) => setTipos(v.tipos)).catch(() => setTipos([]));
  }, []);

  /* A descrição é obrigatória e curta demais é recusada pelo servidor: o tipo
   * já diz a categoria, e esta linha é a história que a criança vai ouvir
   * daqui a dez anos. */
  const pode = d.descricao.trim().length >= 10
    && (d.tipo !== 'outro' || d.tipoOutro.trim().length >= 2);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-cqp"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-cqp">Uma conquista de {perfil.nome}</h3>

        <label className="f" htmlFor="cp-t">O que foi</label>
        <select id="cp-t" value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value })}>
          {tipos.map((t) => <option key={t.cod} value={t.cod}>{t.icone} {t.label}</option>)}
        </select>
        {d.tipo === 'outro' && (
          <>
            <label className="f" htmlFor="cp-o">Qual foi a conquista</label>
            <input id="cp-o" value={d.tipoOutro}
                   onChange={(e) => setD({ ...d, tipoOutro: e.target.value })} />
          </>
        )}

        <label className="f" htmlFor="cp-q">Quando</label>
        <input id="cp-q" type="date" value={d.quando}
               onChange={(e) => setD({ ...d, quando: e.target.value })} />

        <label className="f" htmlFor="cp-d">
          A história <small>— o tipo já diz a categoria; aqui vai o que aconteceu</small>
        </label>
        <textarea id="cp-d" value={d.descricao}
                  onChange={(e) => setD({ ...d, descricao: e.target.value })}
                  placeholder="Ex.: passou para o 7º ano na Escola Fictícia, com recuperação em matemática vencida no fim do ano." />

        <label className="f" htmlFor="cp-i">Escola, curso ou empresa</label>
        <input id="cp-i" value={d.instituicao}
               onChange={(e) => setD({ ...d, instituicao: e.target.value })} />

        <label className="f">
          Comprovante <small>— diploma, certificado, carteira. PDF, JPG ou PNG, opcional</small>
        </label>
        <input type="file" accept="application/pdf,image/*" onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) { setArquivo(null); return; }
          const r = new FileReader();
          r.onload = () => setArquivo({ nome: f.name, base64: String(r.result).split(',')[1] ?? '' });
          r.readAsDataURL(f);
        }} />

        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode || ocupado} onClick={async () => {
            setOcupado(true); setErro('');
            try {
              await api('/impacto/marcos', {
                method: 'POST',
                body: JSON.stringify({
                  ...d, personId: perfil.id, quando: d.quando || undefined,
                  descricao: d.descricao.trim(),
                  conteudo: arquivo?.base64, nomeArquivo: arquivo?.nome,
                }),
              });
              onSalvou();
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível registrar.');
            } finally {
              setOcupado(false);
            }
          }}>{ocupado ? 'Registrando…' : 'Registrar'}</button>
        </div>
      </div>
    </div>
  );
}
