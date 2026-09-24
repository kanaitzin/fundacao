import { useCallback, useEffect, useState } from 'react';
import { FolhaDocumento } from '../documentos';
import { Dossie } from './Dossie';
import { api, ErroApi } from '../api';
import { Cadastro } from './Cadastro';
import { VINCULO, FolhaDoRelato, RelatoDaConvivencia } from '../convivencias';
import {
  BotaoOlho, Escolhido, FolhaArquivo, PreviaEscolhida, base64De, lerArquivo,
} from '../anexos';
import { dia, horaSemSegundos } from '../rotulos';
import { Icone } from '../icones';

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
  /* A portaria (fase 92). CPF inteiro só para quem escreve no cadastro. */
  cpf?: string | null; autorizadoAVisitar?: boolean;
  autorizacao?: { por: string; em: string } | null; temFoto?: boolean;
  /* QUANDO ele pode vir (1500) — o servidor manda os dias já escritos em
     português, porque quem lê isto no celular não conta números da semana. */
  visita?: { dias: number[] | null; diasEscritos: string | null;
             de: string | null; ate: string | null;
             observacao: string | null; combinado: boolean } | null;
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
  /* Pedidos no cadastro desde a fase 40, lidos por nada até a 116. */
  identificacaoComplementar: {
    genero: string | null; raca: string | null; naturalidade: string | null;
    nis: string | null; registroCivil: string | null;
  };
  /* O servidor mandava desde a fase 0 e a tela não tinha o campo (fase 116). */
  episodios: { number: number; started_at: string; ended_at: string | null;
               end_reason: string | null; status: string }[];
  foto: { rota: string; em: string } | null;
  contatos: Contato[];
  /* O que a coordenação desligou para o plantão (fase 93). */
  camposDesligados?: { code: string; rotulo: string; motivo: string; por: string; em: string }[];
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
/**
 * COMO ELA CHEGOU — a ficha de entrada (§6.1).
 *
 * `admission_record` nasceu na migração 0480, tem rota de leitura desde
 * então, e **nenhuma tela a chamava**: o que se preenchia no cadastro só
 * reaparecia dentro de um relatório gerado meses depois (fase 116).
 */
interface Acolhimento {
  ingressoEm: string; conduzidoPor: string | null; municipioOrigem: string | null;
  acolhimentoAnterior: string | null; irmaos: string | null;
  referenciaFamiliar: string | null; chegada: string | null;
  acimaDoLimite: boolean; justificativaLimite: string | null;
  /** Só para quem abre a área restrita — pode carregar a razão da retirada. */
  motivoProvisorio?: string | null;
  cadastradoPor: string | null; cadastradoEm: string | null;
}
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
/*
 * A LISTA DE TIPOS SAIU DAQUI (fase 140), e é conserto de um DEFEITO DE 500.
 *
 * Ela estava escrita à mão e **discordava do banco**: oferecia `vacina`, que o
 * `encounter_kind` não tem — quem registrasse uma vacina recebia *"Internal
 * server error"*, medido em 22/09/2026. E o enum tem `emergencia` e `terapia`,
 * que esta lista nunca ofereceu: dois tipos de atendimento sem como registrar.
 *
 * Agora vem de `GET /nursing/evolutions/options`, que lê o ENUM. É a §12.2 — a
 * tela não inventa a sua lista —, e é a mesma classe de defeito que a fase 130
 * consertou na Educação. A diferença é que aqui ela estava quebrando de verdade.
 */

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

/** Quem trata do remédio que vai com a criança. */
const VE_REMEDIO = ['enfermagem', 'equipe_tecnica', 'coordenador', 'gestor_geral'];


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
  const [remedios, setRemedios] = useState<Convivencia | null>(null);
  /* A porta que não fecha (1300): o relato da convivência, sem prazo. */
  const [relatando, setRelatando] = useState<Convivencia | null>(null);
  /* Quem sai acompanhado ou não sai. Quem está liberado NÃO vem: a lista
     inteira todo dia vira paisagem. */
  const [observar, setObservar] = useState<SaidaSozinho[]>([]);
  const [notaRetorno, setNotaRetorno] = useState('');
  /** O que ela trouxe de casa na volta (1060). */
  const [trouxeRetorno, setTrouxeRetorno] = useState('');

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
        body: JSON.stringify({ quando: new Date().toISOString(),
                               nota: notaRetorno.trim(), trouxe: trouxeRetorno.trim() }),
      });
      setRecebendo(null); setNotaRetorno(''); setTrouxeRetorno('');
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
              <div className="acoes">
                {/*
                  * O REMÉDIO QUE VAI JUNTO (1050).
                  *
                  * Quem está com a família saiu da grade — a casa não é
                  * lembrada da dose das 20h porque não é ela quem vai dar. Este
                  * botão fecha o buraco que essa decisão abriu.
                  */}
                {VE_REMEDIO.includes(papel) && (
                  <button className="btn sec sm" onClick={() => setRemedios(c)}>
                    <Icone nome="medicamento" /> Remédios
                  </button>
                )}
                {/*
                  * O RELATO, DISPONÍVEL DESDE A SAÍDA (fase 122).
                  *
                  * *"Quando o jovem sair para a visita em casa, se abre essa
                  * pergunta para ser respondida depois."* O botão existe
                  * enquanto ela está fora e continua existindo depois que ela
                  * volta — no perfil. Não há prazo, não há tarja de pendente e
                  * não há contador: um campo que cobra faz o educador
                  * perguntar de novo para a criança.
                  */}
                <button className="btn sec sm" onClick={() => setRelatando(c)}>
                  <Icone nome="escrever" /> Relato
                </button>
                <button className="btn sec sm"
                        onClick={() => { setRecebendo(c); setNotaRetorno(''); setTrouxeRetorno(''); }}>
                  Chegou
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {remedios && (
        <FolhaRemedios convivencia={remedios} houseId={houseId}
                       onFechar={() => setRemedios(null)} />
      )}

      {relatando && (
        <FolhaDoRelato saidaId={relatando.id} quem={relatando.quem}
                       onFechar={() => setRelatando(null)}
                       onGravou={(msg) => setAviso(msg)} />
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
            <label className="f" htmlFor="nota-ret">Como ela chegou (opcional)</label>
            {/* A ajuda pede FATO, não rótulo: "voltou agressiva" gruda, "chegou
                sem falar e foi para o quarto" pode mudar (§8.14).

                O Marcelo pediu "se houve alteração". Não existe campo com esse
                nome, e é decisão consciente: um "alteração: sim" atravessa seis
                meses e um relatório judicial muito depois de o detalhe ao lado
                ter sido esquecido. A pergunta dele é respondida aqui, em fato
                observado — e o que ela trouxe ganhou campo próprio abaixo. */}
            <textarea id="nota-ret" rows={3} value={notaRetorno}
                      onChange={(e) => setNotaRetorno(e.target.value)}
                      placeholder="O que você observou. Ex.: chegou no horário, ficou quieta e foi direto para o quarto." />

            {/*
              * O QUE ELA TROUXE DE CASA (1060) — pedido do Marcelo.
              *
              * Campo próprio, e não uma frase dentro da observação: isto é fato
              * LOGÍSTICO do turno seguinte, e é o que muda o que a casa faz nas
              * próximas duas horas. Veio remédio que não é o da grade? Roupa
              * para lavar antes da escola de segunda? O documento que a técnica
              * esperava? Misturado à observação, viraria detalhe de um texto
              * sobre a criança — e é a única das duas coisas que alguém tem de
              * FAZER algo a respeito.
              *
              * Sem lista de opções: a quinta opção sempre existe, e "Outro com
              * nota" é o que a casa acabaria usando em metade dos retornos.
              */}
            <label className="f" htmlFor="trouxe-ret">
              Trouxe algo de casa? <small>— opcional</small>
            </label>
            <input id="trouxe-ret" maxLength={200} value={trouxeRetorno}
                   onChange={(e) => setTrouxeRetorno(e.target.value)}
                   placeholder="Ex.: mochila com roupa suja, um frasco de xarope e a carteira de vacina." />
            <div className="mutetxt">
              Aparece na passagem e na ATA deste turno, para a equipe seguinte ler sem
              procurar. Se veio medicamento, avise a Enfermagem: ele não entra na grade
              sozinho.
            </div>

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
          <Icone nome="arquivo" /> Acervo histórico — quem saiu, e registrar retorno
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
                <span className="pill c-info" title={`No ${p.noHospital}`}><Icone nome="internacao" tamanho={14} /></span>
              )}
              {p.alertasEssenciais > 0 && (
                <span className="pill c-crit" title="Alertas essenciais">
                  <Icone nome="alerta" /> {p.alertasEssenciais}
                </span>
              )}
              {p.restricoesAlimentares > 0 && (
                <span className="pill c-warn" title="Restrições alimentares">
                  <Icone nome="refeicao" /> {p.restricoesAlimentares}
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
  /** A ficha de entrada: existia, tinha rota, e nenhuma tela a pedia (fase 116). */
  const [acolhimento, setAcolhimento] = useState<Acolhimento | null>(null);

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
        /* A ficha de entrada. Cai em silêncio quando não há: cadastro antigo,
           feito antes do cadastro completo, não tem — e isso não é erro de
           quem está abrindo o perfil agora. */
        setAcolhimento(
          await api<Acolhimento>(`/people/${personId}/admission`).catch(() => null));
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
            {/*
              * A IDENTIFICAÇÃO COMPLEMENTAR (fase 116).
              *
              * Cinco campos que o cadastro pede, que o banco grava desde a
              * migração 0480, e que NENHUM `SELECT` do sistema nomeava. Quem
              * preenchia escrevia num campo que não ia a lugar nenhum.
              *
              * Dois deles não são detalhe: a **cor/raça autodeclarada** é como
              * a política pública se mede, e o **NIS** é o que abre o CadÚnico
              * para o benefício dela. Ficavam invisíveis exatamente para quem
              * monta o relatório que precisa dos dois.
              */}
            {(() => {
              const ic = p.identificacaoComplementar;
              const linha = [
                ic?.genero, ic?.raca,
                ic?.naturalidade && `natural de ${ic.naturalidade}`,
                ic?.nis && `NIS ${ic.nis}`,
              ].filter(Boolean).join(' · ');
              if (!linha && !ic?.registroCivil) return null;
              return (
                <div className="mutetxt" style={{ marginTop: 4 }}>
                  {linha}
                  {ic?.registroCivil && <div>Registro civil: {ic.registroCivil}</div>}
                </div>
              );
            })()}
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

      {/*
        * A PRESENÇA, NA VIDA DELA (fase 110).
        *
        * A chamada é coletiva e o registro de cada criança ficava DENTRO dela:
        * para saber se a Alice esteve no almoço de terça, alguém abria a
        * chamada daquele almoço. O provedor da linha do tempo dizia, num
        * comentário, que "o registro dele está no perfil" — e não estava.
        */}
      <Presenca personId={p.id} nome={p.nome} />

      {/*
        * O QUE SE ESCREVEU SOBRE ELA (fase 128).
        *
        * `statement.person_id` era gravado desde a 0300 e nunca lido por
        * pessoa. Ficou fechado de propósito até 20/09, esperando a resposta do
        * §10 item 6: listar por criança tudo o que se escreveu SOBRE ela é
        * exatamente a narrativa que o §26.2 protege. A resposta foi "só a
        * contagem", e é ela que desenha este bloco.
        */}
      <Relatos personId={p.id} nome={p.nome} />

      {/*
        * O PRONTUÁRIO DE EDUCAÇÃO (fase 111).
        *
        * As duas tabelas existiam desde a migração 0530 e o relatório as lia;
        * NENHUMA rota as escrevia (§9, item 3). No piloto, o relatório de
        * desenvolvimento e a audiência diriam "não há" sobre escola e
        * profissionalização para sempre.
        */}
      <Educacao personId={p.id} houseId={houseId} papel={papel} />

      {/*
        * QUEM MEXEU NO REGISTRO DESTA CRIANÇA (fase 112).
        *
        * A auditoria era escrita por todo serviço e não tinha por onde ser
        * lida (§9, item 1). Entra-se por AQUI — pela criança — e não pela
        * pessoa da equipe: a mesma tabela que responde "quem abriu o dossiê da
        * Alice" responderia "tudo o que a Joana fez ontem", e a segunda
        * pergunta é vigilância com outro nome.
        */}
      {/*
        * O QUE ACONTECEU COM ELA, E QUE NÃO CHEGAVA AQUI (fase 118).
        *
        * Três informações eram gravadas com o id dela e lidas só de fora: a
        * convivência familiar (aberta DAQUI desde a fase 89, e lida só na lista
        * da casa), a internação (lida pela casa) e o ofício a órgão externo
        * (`person_id` gravado desde a 0320 e por nenhuma consulta lido).
        *
        * Os três somem quando não há o que mostrar: um perfil com três blocos
        * vazios ensina a passar o olho por cima deles.
        */}
      <ConvivenciaFamiliar personId={p.id} quem={p.nome} />
      <InternacoesDoAcolhido personId={p.id} />
      <OficiosDoAcolhido personId={p.id} />

      <AuditoriaDoAcolhido personId={p.id} papel={papel} />

      {/* A pasta da criança: o que a casa precisa ter, e o álbum dela. */}
      <button className="btn sec block" style={{ marginBottom: 12 }} onClick={() => setDossie(true)}>
        <Icone nome="pasta" /> Dossiê e vivências
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
          <Icone nome="escrever" /> Corrigir o cadastro
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
          <Icone nome="escrever" /> Atualizar escola, cuidados e equipe
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
          <b><Icone nome="alerta" /> {a.descricao}</b>
          <div className="mutetxt">{a.tipo}{a.gravidade ? ` · ${a.gravidade}` : ''}</div>
        </div>
      ))}
      {p.restricoesAlimentares.map((r) => (
        <div key={r.id} className="notice c-warn" role="status">
          <b><Icone nome="refeicao" /> {r.restriction}</b>
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
              <Icone nome="saude_ic" /> Registrar atendimento de saúde
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

      {/*
        * O QUE A COORDENAÇÃO DESLIGOU (fase 93).
        *
        * Campo desligado não some calado: o educador lê que existe, quem
        * desligou e por quê. Sem isto ele leria a ausência como "não há
        * telefone da escola" — e ligaria para ninguém.
        */}
      {(p.camposDesligados ?? []).length > 0 && (
        <div className="notice c-info">
          <b>Fora da vista do plantão, por decisão da coordenação:</b>
          <ul className="lista">
            {p.camposDesligados!.map((c) => (
              <li key={c.code}>
                <b className="ff">{c.rotulo}</b>
                <div className="mutetxt">{c.motivo}</div>
                <div className="mutetxt">{c.por}</div>
              </li>
            ))}
          </ul>
          O dado existe e a equipe técnica o vê. Se você precisar dele agora, peça a ela.
        </div>
      )}

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

      {/*
        * COMO ELA CHEGOU (fase 116).
        *
        * A ficha de entrada existe desde a migração 0480 e tinha rota de
        * leitura desde então; **nenhuma tela a chamava**. O que a técnica
        * preenchia no cadastro — quem trouxe, de onde veio, se há irmãos
        * acolhidos, como ela chegou — só reaparecia dentro de um relatório
        * gerado meses depois, se alguém gerasse.
        *
        * Não é área restrita: quem alcança a criança alcança esta ficha, e o
        * RLS já diz isso (`adm_select`). É informação de CUIDADO — a educadora
        * que recebe a criança no primeiro plantão precisa saber que ela tem
        * uma irmã na Casa 01 e que chegou sem nada além da roupa do corpo.
        */}
      {acolhimento && (
        <Secao titulo="Como ela chegou">
          <ul className="lista">
            <li>
              <b className="ff">{dia(acolhimento.ingressoEm)}</b>
              <div className="mutetxt">entrada na unidade</div>
            </li>
            {acolhimento.conduzidoPor && (
              <li><b className="ff">{acolhimento.conduzidoPor}</b><div className="mutetxt">quem trouxe</div></li>
            )}
            {acolhimento.municipioOrigem && (
              <li><b className="ff">{acolhimento.municipioOrigem}</b><div className="mutetxt">município de origem</div></li>
            )}
            {acolhimento.acolhimentoAnterior && (
              <li><b className="ff">{acolhimento.acolhimentoAnterior}</b><div className="mutetxt">acolhimento anterior</div></li>
            )}
          </ul>
          {/* Os irmãos vêm em bloco, e não em item de lista: "tem uma irmã na
              Casa 01, e elas se veem aos domingos" é uma frase, não um dado. */}
          {acolhimento.irmaos && <p className="bloco"><small>Irmãos</small>{acolhimento.irmaos}</p>}
          {acolhimento.referenciaFamiliar && (
            <p className="bloco"><small>Referência familiar</small>{acolhimento.referenciaFamiliar}</p>
          )}
          {acolhimento.chegada && <p className="bloco"><small>Como chegou</small>{acolhimento.chegada}</p>}
          {/* Entrada acima do limite é FATO REGISTRADO, nunca escondido: o
              banco exige a justificativa e ela aparece onde a decisão foi
              tomada, não num relatório de gestão. */}
          {acolhimento.acimaDoLimite && (
            <div className="notice c-warn" role="status">
              <b>Entrou com a casa no limite de vagas.</b>
              {acolhimento.justificativaLimite && <div>{acolhimento.justificativaLimite}</div>}
            </div>
          )}
          {acolhimento.motivoProvisorio && (
            <p className="bloco destaque">
              <small>Ingresso sem CPF — o que foi escrito na hora</small>
              {acolhimento.motivoProvisorio}
            </p>
          )}
          {acolhimento.cadastradoPor && (
            <p className="mutetxt" style={{ marginBottom: 0 }}>
              Cadastro feito por {acolhimento.cadastradoPor}
              {acolhimento.cadastradoEm ? ` em ${dia(String(acolhimento.cadastradoEm).slice(0, 10))}` : ''}.
            </p>
          )}
        </Secao>
      )}

      {/*
        * OS EPISÓDIOS DE ACOLHIMENTO.
        *
        * O servidor devolvia `episodios` desde a fase 0 e a interface da tela
        * nem tinha o campo — ele só era desenhado no Acervo, para quem já
        * saiu. Uma criança que voltou é a informação mais importante do alto
        * de um perfil, e era justamente onde não aparecia (fase 116).
        */}
      {p.episodios && p.episodios.length > 1 && (
        <Secao titulo="Episódios de acolhimento">
          <p className="mutetxt" style={{ marginTop: 0 }}>
            Esta criança já esteve acolhida antes. O que aconteceu em cada passagem continua
            no registro dela — reacolhimento não recomeça a história do zero.
          </p>
          <ul className="lista">
            {p.episodios.map((e) => (
              <li key={e.number}>
                <b className="ff">{e.number}º episódio</b>
                <div className="mutetxt">
                  {dia(String(e.started_at).slice(0, 10))}
                  {e.ended_at ? ` — ${dia(String(e.ended_at).slice(0, 10))}` : ' — em curso'}
                  {e.end_reason ? ` · ${e.end_reason}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </Secao>
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
  const [tipo, setTipo] = useState('');
  const [quando, setQuando] = useState(
    `${agora.getFullYear()}-${local2(agora.getMonth() + 1)}-${local2(agora.getDate())}`
    + `T${local2(agora.getHours())}:${local2(agora.getMinutes())}`);
  const [local, setLocal] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [estadoRetorno, setEstadoRetorno] = useState('');
  const [orientacoes, setOrientacoes] = useState('');
  const [receita, setReceita] = useState('');
  const [prazoRetorno, setPrazoRetorno] = useState('');
  /*
   * AS OPÇÕES VÊM DO SERVIDOR (fase 140), e não de uma lista escrita aqui.
   *
   * A lista à mão discordava do banco e devolvia 500 em "Vacina". Enquanto ela
   * não chega, a folha **não oferece tipo nenhum** em vez de adivinhar: oferecer
   * uma lista que pode estar diferente da do servidor é como o defeito nasceu.
   */
  const [opcoes, setOpcoes] = useState<{
    tipos: { cod: string; label: string }[];
    comportamentos: { cod: string; label: string }[];
    aviso?: string;
  } | null>(null);
  useEffect(() => {
    let vivo = true;
    api<typeof opcoes>('/nursing/evolutions/options')
      .then((o) => { if (vivo) setOpcoes(o); })
      .catch(() => { if (vivo) setOpcoes(null); });
    return () => { vivo = false; };
  }, []);
  /* Como a criança estava, na chegada e na saída (1460). */
  const [aoChegar, setAoChegar] = useState('');
  const [aoSair, setAoSair] = useState('');
  /*
   * QUEM LEVOU A CRIANÇA (1400).
   *
   * Nasce "fui eu", que é o caso comum — e por isso a pergunta é um botão e não
   * um campo: perguntar sempre o nome faria a Enfermagem digitar o próprio nome
   * vinte vezes por semana, e campo que se digita por obrigação vira campo
   * preenchido de qualquer jeito. O nome só aparece quando foi OUTRA pessoa, que
   * é justamente quando ele não tem outro lugar onde caber: o motorista da
   * Fundação, a tia autorizada, o educador de outra casa que estava com o carro.
   */
  const [foiOutro, setFoiOutro] = useState(false);
  const [quemLevou, setQuemLevou] = useState('');
  const pode = tipo !== '' && quando.length >= 16 && estadoRetorno.trim().length >= 5
    && (!foiOutro || quemLevou.trim().length >= 3);

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
        {!opcoes && (
          <div className="notice c-warn">
            A lista de tipos não chegou do servidor. Tente de novo em instantes — a tela não
            inventa a própria lista, porque foi assim que ela passou a oferecer um tipo que o
            sistema não aceita.
          </div>
        )}
        <div className="opts">
          {(opcoes?.tipos ?? []).map((t) => (
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

        <label className="f">Quem levou a criança</label>
        <div className="opts">
          <button type="button" className="opt c-med" aria-pressed={!foiOutro}
                  onClick={() => { setFoiOutro(false); setQuemLevou(''); }}>
            Fui eu
          </button>
          <button type="button" className="opt c-med" aria-pressed={foiOutro}
                  onClick={() => setFoiOutro(true)}>
            Outra pessoa
          </button>
        </div>
        {foiOutro && (
          <>
            <label className="f" htmlFor="evo-quem">
              Quem <small>— o nome, como se escreve no papel</small>
            </label>
            <input id="evo-quem" value={quemLevou} onChange={(e) => setQuemLevou(e.target.value)}
                   placeholder="Ex.: motorista da Fundação, Seu Jorge; a tia Cláudia (autorizada)" />
          </>
        )}

        <label className="f" htmlFor="evo-ret">
          Como a criança voltou <small>— obrigatório: é o que o próximo plantão mais precisa</small>
        </label>
        <textarea id="evo-ret" value={estadoRetorno} onChange={(e) => setEstadoRetorno(e.target.value)}
                  placeholder="Ex.: voltou tranquila, sem dor referida; comeu bem no jantar." />

        {/*
          * COMO ELA ESTAVA, NA CHEGADA E NA SAÍDA (fase 140, colunas da 0530).
          *
          * As quatro opções são as do modelo de papel da Fundação. **Não é
          * avaliação da criança**: é estado observado em dois momentos, e a
          * comparação entre eles é o que a Enfermagem lê — está escrito na tela,
          * porque quem preenche às 19h precisa saber para que serve.
          *
          * Opcional, os dois: o papel também deixa em branco quando ninguém
          * observou, e campo obrigatório que ninguém observou vira chute.
          */}
        {!!opcoes?.comportamentos?.length && (
          <>
            <label className="f">Como ela estava ao CHEGAR <small>— opcional</small></label>
            <div className="opts">
              {opcoes.comportamentos.map((c) => (
                <button type="button" key={`ch-${c.cod}`} className="opt c-med"
                        aria-pressed={aoChegar === c.cod}
                        onClick={() => setAoChegar(aoChegar === c.cod ? '' : c.cod)}>
                  {c.label}
                </button>
              ))}
            </div>
            <label className="f">E ao SAIR <small>— opcional</small></label>
            <div className="opts">
              {opcoes.comportamentos.map((c) => (
                <button type="button" key={`sa-${c.cod}`} className="opt c-med"
                        aria-pressed={aoSair === c.cod}
                        onClick={() => setAoSair(aoSair === c.cod ? '' : c.cod)}>
                  {c.label}
                </button>
              ))}
            </div>
            {opcoes.aviso && <p className="mutetxt">{opcoes.aviso}</p>}
          </>
        )}

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
                    acompanhanteNome: foiOutro ? quemLevou.trim() : undefined,
                    comportamentoAoChegar: aoChegar || undefined,
                    comportamentoAoSair: aoSair || undefined,
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
  /* O arquivo escolhido e AINDA NÃO ENVIADO. Até a fase 106 este estado não
     existia: escolher o arquivo já o enviava, e ninguém via o que tinha subido
     — numa foto que sai impressa na folha da guarita (§8.9.2). */
  const [escolhida, setEscolhida] = useState<Escolhido | null>(null);
  const [vendoMaior, setVendoMaior] = useState(false);
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

  /** Só depois de a pessoa dizer "é esta" é que a foto sai do aparelho. */
  async function enviar(escolha: Escolhido) {
    setErro(''); setOcupado(true);
    try {
      await api(`/people/${perfil.id}/photo`, {
        method: 'POST',
        body: JSON.stringify({ conteudo: base64De(escolha.dataUrl), nomeArquivo: escolha.nome }),
      });
      setEscolhida(null);
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

      {src && (
        <div style={{ marginTop: 6 }}>
          <BotaoOlho rotulo="Ver a foto" onClick={() => setVendoMaior(true)} />
        </div>
      )}

      {podeTrocar && (
        <label className="btn sm ghost" style={{ marginTop: 6, display: 'inline-block' }}>
          {ocupado ? 'Enviando…' : (src ? 'Trocar foto' : 'Pôr foto')}
          <input type="file" accept="image/*" style={{ display: 'none' }}
                 onChange={async (e) => {
                   const f = e.target.files?.[0];
                   if (!f) return;
                   setErro('');
                   setEscolhida(await lerArquivo(f));
                   /* Limpa o campo: sem isto, escolher o MESMO arquivo depois
                      de cancelar não dispara `change`, e a folha não reabre. */
                   e.target.value = '';
                 }} />
        </label>
      )}
      {erro && <div className="mutetxt">{erro}</div>}

      {/* A foto GUARDADA, em tamanho de olhar. Sem botão de baixar: ela é vista
          aqui, e quem precisar dela num documento pede — a decisão é de quem
          pede, e fica com o nome dele. */}
      {vendoMaior && src && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-foto-id"
             onClick={(e) => { if (e.target === e.currentTarget) setVendoMaior(false); }}>
          <div className="sheet modal">
            <h3 id="t-foto-id">Foto de identificação · {perfil.nome}</h3>
            <img src={src} alt={`Foto de identificação de ${perfil.nome}`} className="previa-img" />
            <div className="row rodape">
              <button className="btn grow" onClick={() => setVendoMaior(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* A CONFIRMAÇÃO. O texto pergunta as duas coisas que dão errado: é a
          foto certa, e é desta criança. */}
      {escolhida && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-foto-nova"
             onClick={(e) => { if (e.target === e.currentTarget) setEscolhida(null); }}>
          <div className="sheet modal" style={{ textAlign: 'left' }}>
            <h3 id="t-foto-nova">A foto de {perfil.nome}</h3>
            <PreviaEscolhida arquivo={escolhida}
              pergunta={<>Esta foto vai identificar a criança na tela e sai impressa na{' '}
                <b>folha da portaria</b>. É esta foto, e é <b>desta</b> criança?</>} />
            {erro && <div className="notice c-crit" role="alert">{erro}</div>}
            <div className="row rodape">
              <button className="btn sec grow" onClick={() => setEscolhida(null)}>Cancelar</button>
              <button className="btn grow" disabled={ocupado}
                      onClick={() => void enviar(escolhida)}>
                {ocupado ? 'Enviando…' : <><Icone nome="conferido" /> É esta foto</>}
              </button>
            </div>
          </div>
        </div>
      )}
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
          <Icone nome="portaria" /> Registrar decisão sobre sair sozinho
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
  const [portariaDe, setPortariaDe] = useState<Contato | null>(null);
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
            {c.cpf && <div className="mutetxt">CPF {c.cpf}</div>}
            {c.observacao && <div className="mutetxt">{c.observacao}</div>}
            {c.autorizadoAVisitar && (
              <>
                <div className="row">
                  <span className="pill c-ok">Autorizado a visitar</span>
                  {!c.temFoto && <span className="pill c-warn">sem foto 3×4</span>}
                  {/* Sem dia combinado é estado OPERACIONAL, e não juízo sobre a
                      pessoa: é a casa que ainda não combinou, e é a casa que
                      resolve. Sem este aviso, a falha só aparece na guarita. */}
                  {!c.visita?.combinado && <span className="pill c-warn">sem dia e hora</span>}
                </div>
                {c.visita?.combinado && (
                  <div className="mutetxt">
                    Visita: {c.visita.diasEscritos}, das {horaSemSegundos(c.visita.de)} às {horaSemSegundos(c.visita.ate)}
                    {c.visita.observacao ? ` · ${c.visita.observacao}` : ''}
                  </div>
                )}
              </>
            )}
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
                {/*
                  * A PORTARIA (fase 92). A marca de visita nasce no contato, pelo
                  * mesmo motivo da saída: é aqui que se sabe quem a pessoa é. No
                  * contato restrito o botão não aparece — e o banco recusa.
                  */}
                {!c.restrito && (
                  <button className="btn sm ghost" onClick={() => setPortariaDe(c)}>
                    {c.autorizadoAVisitar ? 'Portaria: CPF, foto ou retirar' : 'Autorizar a visitar'}
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
          <Icone nome="telefone" /> Acrescentar contato
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

      {portariaDe && (
        <FolhaVisita contato={portariaDe} crianca={perfil.nome}
                     onFechar={() => setPortariaDe(null)}
                     onSalvou={() => { setPortariaDe(null); onMudou(); }} />
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

/**
 * QUEM PODE VISITAR — a marca que põe o contato na folha da portaria (fase 92).
 *
 * CPF e foto 3×4 são opcionais: a folha sai sem eles, com o espaço marcado
 * para a portaria pedir documento com foto. Travar a autorização neles
 * deixaria o visitante de verdade do lado de fora.
 */
function FolhaVisita({ contato, crianca, onFechar, onSalvou }: {
  contato: Contato; crianca: string; onFechar: () => void; onSalvou: () => void;
}) {
  const [autorizado, setAutorizado] = useState(!!contato.autorizadoAVisitar);
  const [cpf, setCpf] = useState(/\*/.test(contato.cpf ?? '') ? '' : (contato.cpf ?? ''));
  /* O QUANDO (1500). Nasce com o que já está combinado — reautorizar alguém não
     pode pedir à técnica que digite de novo o horário que ela já combinou. */
  const [dias, setDias] = useState<number[]>(contato.visita?.dias ?? []);
  const [de, setDe] = useState(horaSemSegundos(contato.visita?.de));
  const [ate, setAte] = useState(horaSemSegundos(contato.visita?.ate));
  const [obsVisita, setObsVisita] = useState(contato.visita?.observacao ?? '');
  const [motivo, setMotivo] = useState('');
  /*
   * OS DIAS VÊM DO SERVIDOR (§12.2), e não de uma lista escrita aqui.
   *
   * Não é cerimônia: a numeração da semana tem de ser a MESMA do banco — 0 é
   * domingo, como no `dow` do Postgres e no `weekdays` da rotina da casa. Uma
   * lista local que começasse na segunda faria a folha impressa trocar terça por
   * quarta, e ninguém descobriria isso numa tela.
   */
  const [vocabVisita, setVocabVisita] =
    useState<{ n: number; curto: string; label: string }[] | null>(null);
  const [notaVisita, setNotaVisita] = useState('');
  const [foto, setFoto] = useState<Escolhido | null>(null);
  const [vendoFoto, setVendoFoto] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);

  /*
   * O HISTÓRICO DA FOLHA (1500) — quem entrou, quem saiu e por quê.
   *
   * Carregado junto, e não num botão: a técnica que abre esta folha para retirar
   * alguém precisa ver se ele já saiu antes e por quê. Botão que ninguém aperta é
   * informação que não existe. Para o educador a rota devolve lista vazia, e o
   * bloco simplesmente não aparece.
   */
  const [passado, setPassado] = useState<
    { id: string; autorizado: boolean; motivo: string | null; por: string; em: string }[]>([]);

  useEffect(() => {
    api<{ dias: { n: number; curto: string; label: string }[]; notaDaVisita: string }>(
      '/people/contacts/kinds')
      .then((v) => { setVocabVisita(v.dias ?? null); setNotaVisita(v.notaDaVisita ?? ''); })
      .catch(() => setVocabVisita(null));
    api<typeof passado>(`/people/contacts/${contato.id}/visit-history`)
      .then(setPassado).catch(() => setPassado([]));
  }, [contato.id]);

  async function salvar() {
    setErro(''); setSalvando(true);
    try {
      const r = await api<{ aviso: string }>(`/people/contacts/${contato.id}/visit`, {
        method: 'POST',
        body: JSON.stringify({ autorizado, cpf, dias, de, ate, observacao: obsVisita, motivo }),
      });
      if (foto) {
        await api(`/people/contacts/${contato.id}/photo`, {
          method: 'POST', body: JSON.stringify({ conteudo: foto.dataUrl }),
        });
      }
      setAviso(r.aviso);
      setTimeout(onSalvou, 900);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  /*
   * A FOTO ABRE NO LUGAR DA FOLHA, E NÃO POR CIMA DELA.
   *
   * Duas caixas empilhadas é o que a tela de Saúde já tinha aprendido a evitar:
   * no celular a segunda cobre a primeira pela metade, e quem fecha uma fecha
   * a errada. Aqui a folha some enquanto a foto está aberta e volta inteira
   * depois — o que já foi digitado vive no estado deste componente, e não na
   * tela.
   */
  if (vendoFoto) {
    return (
      <FolhaArquivo
        titulo={`Foto 3×4 · ${contato.nome}`}
        legenda="É esta a foto que a portaria vai receber na próxima folha."
        carregar={() => api<{ nome: string; tipo: string; conteudo: string }>(
          `/people/contacts/${contato.id}/photo`)}
        onFechar={() => setVendoFoto(false)} />
    );
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-visita"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-visita">{contato.nome} pode visitar {crianca}?</h3>
        <p className="mutetxt">
          Só quem está marcado aqui entra na folha da portaria. A marca registra o seu nome:
          é você quem responde por quem entra.
        </p>

        <label className="f">
          <input type="checkbox" checked={autorizado} onChange={(e) => setAutorizado(e.target.checked)} />
          {' '}Autorizado a visitar
        </label>

        {/*
          * QUANDO ELE PODE VIR (1500), e por que este bloco existe.
          *
          * A folha da guarita dizia QUEM podia entrar e não dizia QUANDO — e
          * assim ela transferia para o porteiro uma decisão que é da casa: às 21h
          * de uma terça ele só tinha duas saídas, barrar um familiar autorizado
          * ou deixar entrar fora da hora, e nenhuma das duas é dele.
          *
          * O dia e a hora são deste visitante, e não da casa: a avó que vem de
          * ônibus de outra cidade vem no sábado de manhã; o padrinho que trabalha
          * vem à noite. Uma regra única seria mais simples e estaria errada.
          *
          * Os campos aparecem MESMO SEM a autorização marcada, porque a técnica
          * combina o horário antes de autorizar — e se eles só aparecessem depois,
          * ela teria de autorizar primeiro para poder combinar.
          */}
        <label className="f">
          Quando pode vir <small>— sai impresso na folha da guarita</small>
        </label>
        {/* O MESMO desenho da rotina da casa (`Rotina.tsx`): `opts` com `opt` e
            `aria-pressed`. Não é economia de CSS — é a mesma pergunta ("em que
            dias?") feita do mesmo jeito em duas telas, e a educadora que aprendeu
            numa não reaprende na outra. */}
        <div className="opts">
          {(vocabVisita ?? []).map((d) => (
            <button type="button" key={d.n} className="opt c-move"
                    aria-pressed={dias.includes(d.n)}
                    onClick={() => setDias(dias.includes(d.n)
                      ? dias.filter((x) => x !== d.n)
                      : [...dias, d.n].sort((a, b) => a - b))}>
              {d.curto}
            </button>
          ))}
        </div>
        <div className="row">
          <label className="f" htmlFor="vis-de">Das</label>
          <input id="vis-de" type="time" className="field" value={de}
                 onChange={(e) => setDe(e.target.value)} />
          <label className="f" htmlFor="vis-ate">às</label>
          <input id="vis-ate" type="time" className="field" value={ate}
                 onChange={(e) => setAte(e.target.value)} />
        </div>

        <label className="f" htmlFor="vis-obs">
          O que a guarita precisa saber <small>— opcional</small>
        </label>
        <input id="vis-obs" value={obsVisita} maxLength={120}
               placeholder="Sempre acompanhada pela técnica"
               onChange={(e) => setObsVisita(e.target.value)} />
        {notaVisita && <p className="mutetxt">{notaVisita}</p>}

        {/*
          * O MOTIVO DA RETIRADA (1500) — só quando ela está sendo retirada.
          *
          * A autorização já é o ato, e não precisa de justificativa. A retirada é
          * o que alguém vai perguntar depois: a família chega ao portão, ouve
          * "não está na folha", e se ninguém escreveu o porquê não há quem
          * responda. Fica registrado para a equipe técnica e a coordenação, e
          * NÃO vai para o log — a frase conta algo sobre uma família.
          */}
        {contato.autorizadoAVisitar && !autorizado && (
          <>
            <label className="f" htmlFor="vis-motivo">
              Por que {contato.nome.split(' ')[0]} sai da folha da portaria
            </label>
            <textarea id="vis-motivo" rows={3} value={motivo} maxLength={500}
                      placeholder="A Vara suspendeu as visitas até a próxima audiência."
                      onChange={(e) => setMotivo(e.target.value)} />
            <p className="mutetxt">
              Quem chegar ao portão daqui a seis meses vai ouvir “não está na folha”. É esta
              frase que responde — e ela fica com a equipe técnica e a coordenação, não no
              plantão inteiro.
            </p>
          </>
        )}

        <label className="f" htmlFor="vis-cpf">
          CPF <small>— sai impresso na folha da guarita</small>
        </label>
        <input id="vis-cpf" inputMode="numeric" value={cpf} maxLength={14}
               placeholder="000.000.000-00" onChange={(e) => setCpf(e.target.value)} />

        <label className="f" htmlFor="vis-foto">
          Foto 3×4 <small>— opcional; sem ela a portaria pede documento com foto</small>
        </label>
        <input id="vis-foto" type="file" accept="image/jpeg,image/png"
               onChange={async (e) => {
                 const arquivo = e.target.files?.[0];
                 if (!arquivo) { setFoto(null); return; }
                 setFoto(await lerArquivo(arquivo));
               }} />

        {/* A prévia, pelo mesmo motivo da foto da criança: esta imagem vai
            IMPRESSA na folha da guarita, ao lado do nome de um familiar. A
            foto errada aqui é a pessoa errada entrando — ou a certa ficando
            do lado de fora. */}
        {foto && <PreviaEscolhida arquivo={foto}
          pergunta={<>Esta foto sai impressa na <b>folha da portaria</b>, ao lado do nome de{' '}
            {contato.nome}. É esta pessoa?</>} />}

        {contato.temFoto && !foto && (
          <p className="mutetxt">
            Já tem foto cadastrada.{' '}
            <BotaoOlho rotulo="Ver a foto de agora" onClick={() => setVendoFoto(true)} />
          </p>
        )}

        {passado.length > 0 && (
          <div className="bloco">
            <h4>O que já aconteceu com esta autorização</h4>
            <div className="stack">
              {passado.map((h) => (
                <div key={h.id} className="card">
                  <div className="row">
                    <span className={`pill ${h.autorizado ? 'c-ok' : 'c-warn'}`}>
                      {h.autorizado ? 'Entrou na folha' : 'Saiu da folha'}
                    </span>
                    <span className="mutetxt grow">{h.por} · {dia(h.em)}</span>
                  </div>
                  {h.motivo && <div>{h.motivo}</div>}
                </div>
              ))}
            </div>
            <p className="mutetxt">
              Nada aqui se apaga: a retirada de hoje não substitui a de antes.
            </p>
          </div>
        )}

        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

        <div className="acoes">
          <button className="btn ghost" onClick={onFechar}>Cancelar</button>
          <button className="btn" disabled={salvando} onClick={salvar}>Salvar</button>
        </div>
      </div>
    </div>
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
              <span className="ic"><Icone nome={m.icone} /></span>
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
          <Icone nome="conquista" /> Registrar conquista
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
  const [arquivo, setArquivo] = useState<Escolhido | null>(null);
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
          {tipos.map((t) => <option key={t.cod} value={t.cod}>{t.label}</option>)}
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
        <input type="file" accept="application/pdf,image/*" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) { setArquivo(null); return; }
          setArquivo(await lerArquivo(f));
        }} />

        {arquivo && <PreviaEscolhida arquivo={arquivo}
          pergunta={<>É este o comprovante? Ele fica na trajetória da criança — é{' '}
            <b>o documento que ela leva</b> quando sair daqui.</>} />}

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
                  conteudo: arquivo ? base64De(arquivo.dataUrl) : undefined,
                  nomeArquivo: arquivo?.nome,
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

/**
 * O remédio que vai com a criança no período com a família.
 *
 * Duas ações separadas de propósito: **ver a folha** pode ser feito quantas
 * vezes for preciso — o papel amassou, a mãe pediu outra via — e não muda nada.
 * **Registrar a saída** é um ato, tira os comprimidos do armário e acontece uma
 * vez só. Se fossem a mesma coisa, imprimir de novo daria baixa duas vezes.
 */
function FolhaRemedios({ convivencia, houseId, onFechar }: {
  convivencia: { id: string; quem: string; comQuem: string };
  houseId: string; onFechar: () => void;
}) {
  const [dados, setDados] = useState<any | null>(null);
  const [folha, setFolha] = useState<any | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    try { setDados(await api(`/medications/family-stays/${convivencia.id}/to-take`)); }
    catch (e) { setErro(e instanceof Error ? e.message : ''); }
  }, [convivencia.id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function registrar() {
    setErro(''); setAviso('');
    try {
      await api(`/medications/family-stays/${convivencia.id}/to-take/register`,
        { method: 'POST', body: JSON.stringify({}) });
      setAviso('Saída registrada. Os comprimidos saíram do armário.');
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar.');
    }
  }

  if (folha) {
    return (
      <FolhaDocumento
        doc={folha} onFechar={() => setFolha(null)}
        exportar={(finalidade: string) =>
          api(`/medications/family-stays/${convivencia.id}/to-take/export`, {
            method: 'POST', body: JSON.stringify({ houseId, finalidade }),
          })} />
    );
  }

  const itens = dados?.itens ?? [];
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-rem"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-rem">Remédios de {convivencia.quem}</h3>
        <p className="mutetxt">
          Para o período com {convivencia.comQuem}. Enquanto estiver fora, a casa não é
          lembrada destas doses — quem dá é a família.
        </p>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

        {itens.length === 0 && (
          <p className="mutetxt">
            Nenhum medicamento em uso registrado para o período. A lista vazia significa
            que não há esquema ativo — não que a conferência foi dispensada.
          </p>
        )}
        <div className="stack">
          {itens.map((i: any) => (
            <div className="card" key={i.prescriptionId}>
              <div className="row">
                <b className="ff grow">{i.medicamento}</b>
                <span className="pill c-med">{i.doses} doses</span>
              </div>
              <div className="mutetxt">{i.dose} · {i.horarios}</div>
              {/* A restrição da casa NÃO viaja com a criança: quem recebe
                  precisa saber que tem de falar com a casa antes. */}
              {i.soEnfermagem && (
                <div className="notice c-warn" role="status">
                  Na casa, só a Enfermagem administra este. Converse com ela antes da saída.
                </div>
              )}
              {i.emEstoque != null && i.emEstoque < i.doses && (
                <div className="notice c-crit" role="status">
                  O armário tem {i.emEstoque} — menos que as {i.doses} do período.
                </div>
              )}
            </div>
          ))}
        </div>

        {dados?.jaRegistrada && (
          <div className="notice c-ok" role="status">
            Saída já registrada por {dados.jaRegistrada.registradoPor}. A folha pode ser
            gerada de novo sem dar baixa outra vez.
          </div>
        )}

        <div className="stack" style={{ marginTop: 12 }}>
          <button className="btn sec block" onClick={async () => {
            try {
              setFolha(await api(`/medications/family-stays/${convivencia.id}/to-take/folha`));
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível montar a folha.');
            }
          }}>
            <Icone nome="documento" /> Folha para levar
          </button>
          {!dados?.jaRegistrada && itens.length > 0 && (
            <button className="btn block" onClick={registrar}>
              Registrar saída do armário
            </button>
          )}
          <button className="btn sec block" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

/**
 * O QUE FOI REGISTRADO DESTA CRIANÇA NAS CHAMADAS.
 *
 * Duas semanas, em ordem, com o que ficou escrito. **Sem contar nada**: nem
 * faltas, nem recusas, nem percentual de presença. Um número desses na tela de
 * uma criança de doze anos é o começo de uma ficha de comportamento (regra 3),
 * e o motivo continua sendo o do §8.7.2 — o número viaja, e a frase que o
 * explicava fica para trás.
 *
 * A EXCEÇÃO VEM COM O QUE FOI ESCRITO, e a correção também: `recusou` sozinho
 * é um rótulo; "recusou o jantar, comeu a fruta depois" é um fato. E quem
 * corrigiu um registro aparece, porque o histórico da chamada era guardado por
 * gatilho desde a fase 67 e nunca tinha sido lido por nada.
 */

/**
 * AS IDAS PARA A FAMÍLIA, NA VIDA DELA (fase 118).
 *
 * A convivência familiar é ABERTA de dentro do perfil desde a fase 89, e lida
 * só na lista da casa — que mostra quem está fora AGORA. Quem abrisse o perfil
 * da Alice em outubro não via que ela passou quatro fins de semana com a avó
 * em setembro, nem como voltou de cada um.
 *
 * **Sem contar as idas.** Um "4 saídas em setembro" no alto do perfil de uma
 * criança é a primeira linha de um julgamento sobre a família dela — e o
 * número atravessaria meses sem o motivo ao lado (§8.14).
 */
function ConvivenciaFamiliar({ personId, quem }: { personId: string; quem: string }) {
  const [linhas, setLinhas] = useState<{
    id: string; comQuem: string; vinculo: string | null; finalidade: string | null;
    saiuEm: string; retornoPrevisto: string; voltouEm: string | null; status: string;
    comoChegou: string | null; trouxeDeCasa: string | null;
    liberou: string | null; recebeu: string | null;
    relatos: RelatoDaConvivencia[];
  }[] | null>(null);
  /* A porta que não fecha (fase 122) — aqui ela é a mesma de meses atrás. */
  const [relatando, setRelatando] = useState<string | null>(null);

  const carregar = useCallback(() => {
    api<any[]>(`/people/${personId}/family-stays`)
      .then(setLinhas)
      .catch(() => setLinhas([]));
  }, [personId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!linhas || linhas.length === 0) return null;
  return (
    <Secao titulo="Convivência familiar">
      <div className="stack">
        {linhas.map((f) => (
          <div className="card" key={f.id}>
            <div className="row">
              <span className={`pill ${f.status === 'em_andamento' ? 'c-warn' : 'c-ok'}`}>
                {f.status === 'em_andamento' ? 'Está fora' : 'Voltou'}
              </span>
              <b className="ff grow">{f.comQuem}{f.vinculo ? ` · ${f.vinculo}` : ''}</b>
            </div>
            <div className="mutetxt">
              Saiu {dia(String(f.saiuEm).slice(0, 10))}
              {f.voltouEm ? ` · voltou ${dia(String(f.voltouEm).slice(0, 10))}` : ''}
              {f.liberou ? ` · liberou: ${f.liberou}` : ''}
              {f.recebeu ? ` · recebeu: ${f.recebeu}` : ''}
            </div>
            {f.finalidade && <div>{f.finalidade}</div>}
            {/* Como ela chegou, COMO FOI ESCRITO. Sem rótulo e sem resumo: é o
                campo em que "voltou agressiva" e "chegou sem falar e foi para
                o quarto" são coisas diferentes, e só a segunda é um fato. */}
            {f.comoChegou && (
              <p className="bloco" style={{ marginBottom: 0 }}>
                <small>Como chegou</small>{f.comoChegou}
              </p>
            )}
            {f.trouxeDeCasa && (
              <p className="bloco" style={{ marginBottom: 0 }}>
                <small>Trouxe de casa</small>{f.trouxeDeCasa}
              </p>
            )}

            {/*
              * OS RELATOS DESTA IDA (fase 122).
              *
              * *"Pode ser registrado quantas vezes for necessário, por
              * qualquer educador, tudo ficando no perfil do jovem."* Aqui é o
              * "tudo ficando no perfil": o que ela contou no domingo, e o que
              * ela contou na terça, um debaixo do outro, com quem ouviu.
              *
              * Nenhuma contagem — nem "3 relatos", nem "sem relato há 12
              * dias". A ausência de um número é o que impede esta seção de
              * virar uma cobrança sobre o educador, que foi a correção que a
              * Fundação fez ao pedido original.
              */}
            {f.relatos?.length > 0 && (
              <>
              {/* Um rótulo, porque "como chegou" e "o que foi registrado
                  depois" são coisas diferentes: o primeiro é da chegada, estes
                  podem ser de meses depois. Sem a linha, a terceira caixa
                  cinza parecia mais um campo da volta. */}
              <div className="mutetxt" style={{ marginTop: 8 }}>
                O que foi sendo registrado depois
              </div>
              <ul className="lista">
                {f.relatos.map((n) => (
                  <li key={n.id}>
                    {n.houveAlteracao && (
                      <span className="pill c-warn">alteração observada</span>
                    )}
                    <div className="bloco" style={{ marginBottom: 0 }}>{n.relato}</div>
                    <div className="mutetxt">
                      {n.por ?? '—'} · {dia(String(n.quando).slice(0, 10))}
                    </div>
                  </li>
                ))}
              </ul>
              </>
            )}

            {/* Aberto para sempre: a ida de setembro aceita um relato em
                março, e é justamente esse o que mais importa. */}
            <button className="btn sec sm" onClick={() => setRelatando(f.id)}>
              <Icone nome="escrever" /> Registrar o que ela contou
            </button>
          </div>
        ))}
      </div>

      {relatando && (
        <FolhaDoRelato saidaId={relatando} quem={quem}
                       onFechar={() => setRelatando(null)}
                       onGravou={() => carregar()} />
      )}
    </Secao>
  );
}

/**
 * AS INTERNAÇÕES, NA VIDA DELA (fase 118).
 *
 * A internação era lida pela CASA — quem está no hospital agora. O perfil não
 * dizia que ela esteve quinze dias internada em agosto: para saber, alguém
 * tinha de abrir a tela de internação e pedir também as encerradas.
 */
function InternacoesDoAcolhido({ personId }: { personId: string }) {
  const [linhas, setLinhas] = useState<{
    id: string; hospital: string; motivo: string | null;
    desde: string; ate: string | null; status: string; desfecho: string | null;
    abriu: string | null; encerrou: string | null;
  }[] | null>(null);

  useEffect(() => {
    let vivo = true;
    api<any[]>(`/nursing/hospitalizations/person/${personId}`)
      .then((d) => { if (vivo) setLinhas(d); })
      .catch(() => { if (vivo) setLinhas([]); });
    return () => { vivo = false; };
  }, [personId]);

  if (!linhas || linhas.length === 0) return null;
  return (
    <Secao titulo="Internações hospitalares">
      <ul className="lista">
        {linhas.map((h) => (
          <li key={h.id}>
            <div className="grow">
              <b className="ff">{h.hospital}</b>
              <div className="mutetxt linhadois">
                {dia(String(h.desde).slice(0, 10))}
                {h.ate ? ` — ${dia(String(h.ate).slice(0, 10))}` : ' — em andamento'}
                {h.desfecho ? ` · ${h.desfecho}` : ''}
                {h.abriu ? ` · abriu: ${h.abriu}` : ''}
              </div>
              {h.motivo && <div>{h.motivo}</div>}
            </div>
          </li>
        ))}
      </ul>
    </Secao>
  );
}

/**
 * OS OFÍCIOS SOBRE ELA (fase 118).
 *
 * `external_communication.person_id` era gravado desde a migração 0320 e
 * **nenhuma consulta o lia** — nem o detalhe da ocorrência, nem a lista da
 * casa. Um ofício ao Judiciário, ao Conselho Tutelar ou ao Ministério Público
 * SOBRE a Alice não aparecia em lugar nenhum da vida da Alice. É o tipo de
 * documento que a audiência pergunta se existe.
 *
 * O alcance é o da `ec_select`, e o educador de plantão continua sem ler
 * ofício: quando não há nada a mostrar, o bloco não existe.
 */
function OficiosDoAcolhido({ personId }: { personId: string }) {
  const [linhas, setLinhas] = useState<{
    id: string; orgao: string; destinatarioFuncional: string | null;
    canal: string | null; status: string; resumo: string | null;
    quando: string | null; entregueEm: string | null; responsavel: string | null;
  }[] | null>(null);

  useEffect(() => {
    let vivo = true;
    api<any[]>(`/incidents/communications/person/${personId}`)
      .then((d) => { if (vivo) setLinhas(d); })
      .catch(() => { if (vivo) setLinhas([]); });
    return () => { vivo = false; };
  }, [personId]);

  if (!linhas || linhas.length === 0) return null;
  return (
    <Secao titulo="Comunicações a órgãos externos">
      <p className="mutetxt" style={{ marginTop: 0 }}>
        Ofícios redigidos sobre esta criança. O sistema <b>não despacha nada</b>: a entrega é
        feita pelo canal que a instituição decidir, e fica registrada aqui com o responsável.
      </p>
      <ul className="lista">
        {linhas.map((o) => (
          <li key={o.id}>
            <div className="grow">
              <b className="ff">{o.orgao}</b>
              {o.destinatarioFuncional ? <> · {o.destinatarioFuncional}</> : null}
              <div className="mutetxt linhadois">
                {o.quando ? dia(String(o.quando).slice(0, 10)) : '—'}
                {o.entregueEm ? ` · entregue ${dia(String(o.entregueEm).slice(0, 10))}` : ''}
                {o.responsavel ? ` · responsável: ${o.responsavel}` : ''}
              </div>
              {o.resumo && <div>{o.resumo}</div>}
            </div>
            <span className={`pill ${o.status === 'entregue_manualmente' ? 'c-ok' : 'c-warn'}`}>
              {o.status === 'entregue_manualmente' ? 'entregue'
                : o.status === 'aprovado' ? 'aprovado'
                : o.status === 'em_revisao' ? 'em revisão' : 'rascunho'}
            </span>
          </li>
        ))}
      </ul>
    </Secao>
  );
}

function Presenca({ personId, nome }: { personId: string; nome: string }) {
  const [dados, setDados] = useState<{
    dias: number;
    linhas: { id: string; tipo: string; titulo: string; quando: string;
              resultado: string; excecao: boolean; justificativa: string | null;
              por: string; offline: boolean;
              correcoes: { antes: string; justificativaAntes: string | null;
                           eraDe: string; corrigidoPor: string; em: string }[] }[];
  } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    api<typeof dados>(`/checks/person/${personId}?dias=14`)
      .then((d) => { if (vivo) setDados(d); })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : ''); });
    return () => { vivo = false; };
  }, [personId]);

  if (erro) return null;
  const linhas = dados?.linhas ?? [];

  return (
    <>
      <div className="eyebrow">Presença nas chamadas · últimos {dados?.dias ?? 14} dias</div>
      {dados && linhas.length === 0 && (
        <p className="mutetxt">
          Nada registrado para {nome} nas chamadas deste período. A lista vazia quer dizer que
          ninguém registrou — não que ela não esteve.
        </p>
      )}
      {!dados && <p className="mutetxt">Abrindo…</p>}

      {/* Só as exceções por padrão: a lista inteira, com quatro refeições por
          dia, vira paisagem — e é o mesmo motivo pelo qual a lista de quem sai
          sozinho mostra só quem NÃO está simplesmente liberado (§8.7.2). */}
      <div className="stack">
        {linhas.filter((l) => aberto || l.excecao || l.correcoes.length).map((l) => (
          <div className="card" key={l.id}>
            <div className="row">
              <span className={`pill ${l.excecao ? 'c-warn' : 'c-ok'}`}>{l.resultado}</span>
              <b className="ff grow">{l.titulo}</b>
              <span className="mutetxt">{dia(l.quando)}</span>
            </div>
            {l.justificativa && <div>{l.justificativa}</div>}
            <div className="mutetxt">
              Registrado por {l.por}{l.offline ? ' · registrado sem sinal' : ''}
            </div>
            {l.correcoes.map((c, n) => (
              <div className="notice c-info" key={n}>
                Antes constava <b>{c.antes}</b>
                {c.justificativaAntes ? ` — "${c.justificativaAntes}"` : ''}, de {c.eraDe}.
                Corrigido por {c.corrigidoPor} em {dia(c.em)}.
              </div>
            ))}
          </div>
        ))}
      </div>

      {linhas.length > 0 && (
        <button className="btn sec block" style={{ marginBottom: 12 }}
                onClick={() => setAberto(!aberto)}>
          {aberto
            ? 'Mostrar só o que teve exceção'
            : `Ver tudo o que foi registrado (${linhas.length})`}
        </button>
      )}
    </>
  );
}

/**
 * O QUE SE ESCREVEU SOBRE ESTA CRIANÇA (fase 128, migração 1360).
 *
 * A decisão de 20/09 desenha esta tela inteira, e ela é de uma linha: **o
 * Gestor Geral vê só a contagem.** Nem data, nem autor, nem trecho.
 *
 * Três cuidados que não são de tela, e é aqui que eles aparecem:
 *
 *  * **o que este papel não pode ver aparece como CONTAGEM, não some.** É o
 *    mesmo que o dossiê faz com o documento restrito: esconder que existem
 *    faria a equipe procurar noutro lugar;
 *  * **a contagem é uma frase, não um número num selo.** "Existem 2 relatos em
 *    área restrita" é informação; um `2` vermelho ao lado do nome de uma
 *    criança de doze anos começa a parecer nota de comportamento (regra 3);
 *  * **o botão de abrir existe, e é UM POR RELATO** (fase 136). A pergunta que
 *    ficou aberta em 20/09 era COMO ele escolhe o que abrir, e a Fundação
 *    respondeu em 21/09: *"gestor abrir o que quiser"*. Então não há um botão
 *    que abra os N de uma vez — há N portas opacas, e ele abre uma, lê, e para
 *    quando achar o que procurava. **Cada abertura leva a sua própria
 *    finalidade escrita e o seu próprio registro**, e quem ler a auditoria
 *    depois sabe de qual narrativa ele precisava; uma finalidade valendo por
 *    três relatos não diria isso. As portas não trazem data, autor nem trecho —
 *    nem a ordem diz algo, porque ela sai do identificador, que é aleatório.
 */
function Relatos({ personId, nome }: { personId: string; nome: string }) {
  const [dados, setDados] = useState<{
    relatos: { id: string; contexto: string; autor: string; meu: boolean;
               testemunho: string; relato: string; restrito: boolean; quando: string }[];
    restritos: number;
    nota: string;
    /** As portas opacas, para quem pode abrir (fase 136). */
    paraAbrir: { ordem: number; id: string }[];
  } | null>(null);
  const [erro, setErro] = useState('');
  /** Qual porta está com a folha da finalidade aberta — uma por vez. */
  const [abrindo, setAbrindo] = useState<{ ordem: number; id: string } | null>(null);
  /** O que já foi aberto NESTA visita, com a finalidade que foi escrita. */
  const [abertos, setAbertos] = useState<Record<string, { relato: string; finalidade: string }>>({});
  const [erroAbrir, setErroAbrir] = useState('');

  useEffect(() => {
    let vivo = true;
    api<typeof dados>(`/statements/person/${personId}`)
      .then((d) => { if (vivo) setDados(d); })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : ''); });
    return () => { vivo = false; };
  }, [personId]);

  /* Quem não alcança a criança não vê o bloco — oferecer uma seção que o
     servidor vai recusar ensina a não confiar na tela (fase 112). */
  if (erro) return null;
  const relatos = dados?.relatos ?? [];

  /* Nada escrito e nada restrito: o bloco não aparece. Uma seção vazia no
     perfil de uma criança se lê como ausência de trabalho (§8.12). */
  if (dados && !relatos.length && !dados.restritos) return null;

  return (
    <>
      <div className="eyebrow">O que se escreveu sobre {nome}</div>
      {!dados && <p className="mutetxt">Abrindo…</p>}

      {/*
        * A CONTAGEM VEM PRIMEIRO, e em frase.
        *
        * Quem chega aqui sem alcançar o restrito precisa saber que ele existe
        * ANTES de ler a lista curta — senão a lista curta parece ser tudo, e é
        * assim que alguém conclui que não há nada escrito sobre a criança.
        */}
      {!!dados?.restritos && (
        <div className="notice c-info">
          {dados.nota}
        </div>
      )}

      <div className="stack">
        {relatos.map((r) => (
          <div className="card" key={r.id}>
            <div className="row">
              <span className={`pill ${r.restrito ? 'c-warn' : 'c-ok'}`}>
                {r.restrito ? 'área restrita' : 'aberto à equipe'}
              </span>
              <b className="ff grow">{r.testemunho}</b>
              <span className="mutetxt">{dia(r.quando)}</span>
            </div>
            <div>{r.relato}</div>
            {/* O nome de quem escreveu aparece na linha, como em toda tela
                deste sistema — e nunca é o filtro (fase 112). */}
            <div className="mutetxt">
              {r.meu ? 'Escrito por você' : `Escrito por ${r.autor}`} · {r.contexto}
            </div>
          </div>
        ))}
      </div>

      {dados && !relatos.length && !!dados.restritos && !dados.paraAbrir?.length && (
        <p className="mutetxt">
          Você não alcança nenhum destes relatos. A contagem acima existe para você saber que
          eles existem, e não para saber o que dizem.
        </p>
      )}

      {/*
        * AS PORTAS OPACAS (fase 136) — *"gestor abrir o que quiser"*.
        *
        * Uma por relato, sem data, sem autor e sem trecho. O que já foi aberto
        * nesta visita fica na tela COM a finalidade escrita ao lado: quem abriu
        * precisa ver, na mesma tela, o que declarou — é a única forma de a
        * declaração não virar formalidade.
        */}
      {!!dados?.paraAbrir?.length && (
        <>
          <p className="mutetxt">
            Abrir é um ato: cada um destes exige uma finalidade escrita, e o acesso fica
            registrado com o seu nome e a finalidade. <b>Abra o que precisar, e pare quando
            encontrar</b> — não há como abrir todos de uma vez, de propósito.
          </p>
          {erroAbrir && <div className="notice c-crit" role="alert">{erroAbrir}</div>}
          <div className="stack">
            {dados.paraAbrir.map((porta) => {
              const aberto = abertos[porta.id];
              return (
                <div className="card" key={porta.id}>
                  <div className="row">
                    <span className="pill c-warn">área restrita</span>
                    <b className="ff grow">
                      Relato {porta.ordem} de {dados.paraAbrir.length}
                    </b>
                  </div>
                  {aberto ? (
                    <>
                      <div>{aberto.relato}</div>
                      <div className="mutetxt">
                        Aberto por você agora, com a finalidade: “{aberto.finalidade}”.
                        O acesso está registrado.
                      </div>
                    </>
                  ) : (
                    <div className="row">
                      <button type="button" className="btn sm sec"
                              onClick={() => { setErroAbrir(''); setAbrindo(porta); }}>
                        Abrir com finalidade escrita
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {abrindo && (
        <FolhaFinalidade
          ordem={abrindo.ordem} total={dados?.paraAbrir?.length ?? 0} nome={nome}
          onFechar={() => setAbrindo(null)}
          onAbrir={async (finalidade) => {
            setErroAbrir('');
            try {
              const r = await api<{ relato: string }>(
                `/statements/${abrindo.id}/exceptional-read`,
                { method: 'POST', body: JSON.stringify({ finalidade }) });
              setAbertos((a) => ({ ...a, [abrindo.id]: { relato: r.relato, finalidade } }));
              setAbrindo(null);
            } catch (e) {
              setErroAbrir(e instanceof Error ? e.message : 'Não foi possível abrir.');
            }
          }} />
      )}
    </>
  );
}

/**
 * A FINALIDADE, ESCRITA ANTES DE ABRIR (§26.2 #29).
 *
 * Quinze caracteres é o piso do servidor, e a folha o cobra antes de mandar —
 * mas o que faz a finalidade valer não é o tamanho: é ela ficar registrada com o
 * nome de quem abriu e **ser lida por quem auditar depois**. A folha diz isso
 * com as palavras que a pessoa vai ler, e não em letra pequena.
 *
 * A folha NÃO diz de que relato se trata, porque ela não sabe: o número de
 * ordem é tudo o que existe antes de abrir.
 */
function FolhaFinalidade({ ordem, total, nome, onFechar, onAbrir }: {
  ordem: number; total: number; nome: string;
  onFechar: () => void;
  onAbrir: (finalidade: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const pode = texto.trim().length >= 15;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-fin"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-fin">Abrir o relato {ordem} de {total}</h3>
        <p className="mutetxt">
          Uma narrativa pessoal sobre {nome}, em área restrita. Você não sabe ainda de que ela
          trata — e é assim de propósito.
        </p>

        <label className="f" htmlFor="fin">
          Para que você precisa ler <small>— fica registrado junto com o acesso</small>
        </label>
        <textarea id="fin" value={texto} onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ex.: preparar a resposta ao ofício do Ministério Público de 18/09 sobre a situação familiar." />

        <div className="row rodape">
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!pode}
                  onClick={() => onAbrir(texto.trim())}>
            Registrar a finalidade e abrir
          </button>
        </div>
        <p className="mutetxt" style={{ marginBottom: 0 }}>
          {pode
            ? 'Ao abrir, o seu nome, o horário e esta finalidade ficam gravados.'
            : 'Escreva a finalidade (mínimo 15 caracteres). Ela é o que justifica a leitura '
              + 'para quem auditar depois.'}
        </p>
      </div>
    </div>
  );
}

/**
 * O PRONTUÁRIO DE EDUCAÇÃO.
 *
 * Veio do "Prontuário Individual de Evolução — Educação" que a Fundação
 * entregou em 28/08 (§8.12): sala de recursos, equipe multiprofissional,
 * aprendizagem profissional, e a evolução datada. As tabelas existiam desde a
 * migração 0530 e o RELATÓRIO já as lia — só não havia por onde escrever
 * (§9, item 3). No piloto, a audiência concentrada diria "não há" sobre escola
 * e profissionalização para sempre, e num documento judicial seção vazia se lê
 * como ausência de trabalho.
 *
 * A EVOLUÇÃO NÃO SE EDITA: correção é registro novo, como no caderno. E quem
 * escreve inclui o EDUCADOR — quem acompanha a tarefa de casa é ele.
 */
interface ApoioEducacional {
  salaDeRecursos: boolean; motivoDaSala: string | null; professorDaSala: string | null;
  servico: string | null; servicoOutro: string | null; servicoLocal: string | null;
  servicoProfissional: string | null;
  aprendiz: boolean; modo: string | null; curso: string | null;
  cursoInicio: string | null; cursoFim: string | null; turno: string | null;
  unidade: string | null; empresa: string | null; enderecoDaEmpresa: string | null;
  atualizadoEm: string; atualizadoPor: string | null;
}
interface EvolucaoEducacional {
  id: string; em: string; texto: string; por: string | null; escritoEm: string;
}
/** O conceito do bimestre (fase 137). Substituído NÃO é apagado: fica em cinza. */
interface ConceitoEducacional {
  id: string; ano: number; bimestre: number;
  conceito: string; rotulo: string; motivo: string;
  por: string | null; escritoEm: string;
  substituido: boolean; corrigeUmAnterior: boolean;
}

const ESCREVEM_EDUCACAO = ['educador', 'lider_diurno', 'equipe_tecnica', 'coordenador', 'gestor_geral'];

function Educacao({ personId, houseId, papel }: {
  personId: string; houseId: string; papel: string;
}) {
  const [dados, setDados] = useState<{ apoio: ApoioEducacional | null;
                                       evolucoes: EvolucaoEducacional[];
                                       conceitos: ConceitoEducacional[] } | null>(null);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(false);
  const [escrevendo, setEscrevendo] = useState(false);
  /* O conceito do bimestre (fase 137). */
  const [conceituando, setConceituando] = useState(false);
  const [avisoConceito, setAvisoConceito] = useState('');
  const pode = ESCREVEM_EDUCACAO.includes(papel);
  /*
   * QUEM DIGITA O CONCEITO é a equipe técnica, a coordenação e o Líder Diurno —
   * decisão da Fundação em 21/09/2026, e NÃO é o mesmo conjunto de quem escreve
   * a evolução: o educador de plantão escreve a evolução, porque é ele quem
   * senta ao lado na lição de casa; o conceito do bimestre é leitura do
   * acompanhamento, e é dos três. O servidor recusa igual — isto aqui só evita
   * oferecer um botão que ele vai recusar (fase 112).
   */
  const podeConceito = ['equipe_tecnica', 'coordenador', 'lider_diurno'].includes(papel);

  /*
   * A LISTA VEM DO SERVIDOR (fase 130) — a tela não inventa a sua lista (§12.2).
   *
   * Até aqui os serviços estavam escritos no HTML, em `<option value="fono">`,
   * enquanto `GET /nursing/education/kinds` existia e ninguém a chamava. O dia
   * em que a Fundação acrescentar um serviço, o servidor saberia e a tela não —
   * e é a mesma classe de defeito que fez as opções de testemunho virarem rota
   * em vez de constante.
   *
   * *Achado ao apertar o `rotas-sem-porta`, que até 20/09 dava porta a esta
   * rota por engano: o casamento aceitava que o `:x` de uma chamada casasse com
   * uma PALAVRA da rota.*
   */
  const [vocabulario, setVocabulario] = useState<{
    servicos: { cod: string; label: string }[];
    modos: { cod: string; label: string }[];
    conceitos: { cod: string; label: string }[];
    bimestres: { cod: number; label: string }[];
    aviso?: string;
  } | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await api(`/nursing/education/${personId}`));
    } catch (e) { setErro(e instanceof Error ? e.message : ''); }
  }, [personId]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    let vivo = true;
    api<typeof vocabulario>('/nursing/education/kinds')
      .then((v) => { if (vivo) setVocabulario(v); })
      /* Sem a lista, o formulário não abre — e é melhor assim do que abrir com
         uma lista inventada que divergiu da do servidor. */
      .catch(() => { if (vivo) setVocabulario(null); });
    return () => { vivo = false; };
  }, []);

  if (erro) return null;
  const a = dados?.apoio ?? null;

  return (
    <>
      <div className="eyebrow">Educação</div>
      {!dados && <p className="mutetxt">Abrindo…</p>}

      {dados && (
        <div className="card stack">
          {!a && (
            <p className="mutetxt" style={{ margin: 0 }}>
              Nada registrado sobre apoio educacional. <b>O que fica em branco aqui sai como
              "não há"</b> no relatório de desenvolvimento e na audiência concentrada.
            </p>
          )}
          {a && (
            <>
              <div className="row">
                <span className={`pill ${a.salaDeRecursos ? 'c-info' : 'c-mute'}`}>
                  {a.salaDeRecursos ? 'Sala de recursos' : 'Sem sala de recursos'}
                </span>
                {a.servico && <span className="pill c-info">
                  {a.servico === 'outro' ? (a.servicoOutro ?? 'Outro serviço') : a.servico}
                </span>}
                {a.aprendiz && <span className="pill c-ok">Aprendizagem profissional</span>}
              </div>
              {a.salaDeRecursos && a.motivoDaSala && (
                <div className="mutetxt">
                  {a.motivoDaSala}{a.professorDaSala ? ` · ${a.professorDaSala}` : ''}
                </div>
              )}
              {a.servico && (
                <div className="mutetxt">
                  {a.servicoProfissional ?? 'Profissional não informado'}
                  {a.servicoLocal ? ` · ${a.servicoLocal}` : ''}
                </div>
              )}
              {a.aprendiz && (
                <div className="mutetxt">
                  {a.curso}{a.turno ? ` · turno da ${a.turno}` : ''}
                  {a.unidade ? ` · ${a.unidade}` : ''}
                  {a.empresa ? ` · trabalha em ${a.empresa}` : ''}
                  {/* O endereço é logística — quem leva a criança precisa dele.
                      Nunca rastreamento: ninguém é seguido por aqui (§7.5). */}
                  {a.enderecoDaEmpresa ? ` (${a.enderecoDaEmpresa})` : ''}
                </div>
              )}
              <div className="mutetxt">
                Atualizado por {a.atualizadoPor ?? '—'} em {dia(a.atualizadoEm)}.
              </div>
            </>
          )}
          {pode && (
            <button className="btn sm ghost" onClick={() => setEditando(true)}>
              {a ? 'Atualizar o apoio educacional' : 'Registrar o apoio educacional'}
            </button>
          )}
        </div>
      )}

      {dados && (
        <>
          <div className="eyebrow">Evolução educacional</div>
          {dados.evolucoes.length === 0 && (
            <p className="mutetxt">
              Nenhuma evolução escrita. A lista vazia quer dizer que ninguém escreveu — não que
              não houve nada. <b>Quem acompanha a tarefa de casa é quem tem o que contar aqui.</b>
            </p>
          )}
          <div className="stack">
            {dados.evolucoes.slice(0, 6).map((e) => (
              <div className="card" key={e.id}>
                <div className="row">
                  <span className="pill c-info">{dia(e.em)}</span>
                  <span className="mutetxt grow">{e.por ?? '—'}</span>
                </div>
                <div>{e.texto}</div>
              </div>
            ))}
          </div>
          {pode && (
            <button className="btn sec block" style={{ marginBottom: 12 }}
                    onClick={() => setEscrevendo(true)}>
              Escrever uma evolução
            </button>
          )}
        </>
      )}

      {/*
        * O CONCEITO DO BIMESTRE (fase 137).
        *
        * Fica DEPOIS da evolução, e não antes: a evolução é o que se escreve
        * durante o bimestre, e o conceito é a leitura dele — ler antes do que se
        * escreveu inverteria a ordem do trabalho. E cada conceito aparece **com
        * o motivo ao lado**, sempre: um conceito sozinho numa lista é a nota
        * colada no nome da criança que a Fundação recusou.
        */}
      {dados && (
        <>
          <div className="eyebrow">Conceito por bimestre</div>
          {avisoConceito && <div className="notice c-ok" role="status">{avisoConceito}</div>}
          {dados.conceitos.length === 0 && (
            <p className="mutetxt">
              Nenhum conceito registrado. <b>Ele fala do acompanhamento no bimestre</b> — não é
              nota, e o porquê é obrigatório.
            </p>
          )}
          <div className="stack">
            {dados.conceitos.map((k) => (
              <div className="card" key={k.id} style={k.substituido ? { opacity: 0.65 } : undefined}>
                <div className="row">
                  <span className={`pill ${k.conceito === 'nao_acompanha' ? 'c-warn' : 'c-info'}`}>
                    {k.ano} · {k.bimestre}º bimestre
                  </span>
                  <b className="ff grow">{k.rotulo}</b>
                </div>
                <div>{k.motivo}</div>
                <div className="mutetxt">
                  {k.por ?? '—'}
                  {k.corrigeUmAnterior ? ' · corrige um registro anterior' : ''}
                  {k.substituido ? ' · substituído por um registro posterior' : ''}
                </div>
              </div>
            ))}
          </div>
          {podeConceito && (
            <button className="btn sec block" style={{ marginBottom: 12 }}
                    onClick={() => { setAvisoConceito(''); setConceituando(true); }}>
              Registrar o conceito de um bimestre
            </button>
          )}
        </>
      )}

      {conceituando && (
        <FolhaConceito
          conceitos={vocabulario?.conceitos ?? []}
          bimestres={vocabulario?.bimestres ?? []}
          onFechar={() => setConceituando(false)}
          onSalvar={async (corpo) => {
            const r = await api<{ aviso?: string }>(
              `/nursing/education/${personId}/concepts`,
              { method: 'POST', body: JSON.stringify(corpo) });
            setConceituando(false);
            if (r?.aviso) setAvisoConceito(r.aviso);
            await carregar();
          }} />
      )}

      {editando && (
        <FolhaApoioEducacional
          servicos={vocabulario?.servicos ?? []}
          atual={a} onFechar={() => setEditando(false)}
          onSalvar={async (corpo) => {
            await api(`/nursing/education/${personId}/support`, {
              method: 'POST', body: JSON.stringify({ ...corpo, houseId }),
            });
            setEditando(false); await carregar();
          }} />
      )}

      {escrevendo && (
        <FolhaEvolucaoEducacional
          onFechar={() => setEscrevendo(false)}
          onSalvar={async (corpo) => {
            await api(`/nursing/education/${personId}/evolutions`, {
              method: 'POST', body: JSON.stringify({ ...corpo, houseId }),
            });
            setEscrevendo(false); await carregar();
          }} />
      )}
    </>
  );
}

/** O apoio. Substituir NÃO apaga: o anterior fica no histórico, com autor. */
function FolhaApoioEducacional({ atual, servicos, onFechar, onSalvar }: {
  atual: ApoioEducacional | null;
  /** Os serviços que o SERVIDOR oferece, por `GET /nursing/education/kinds`. */
  servicos: { cod: string; label: string }[];
  onFechar: () => void;
  onSalvar: (c: Record<string, unknown>) => Promise<void>;
}) {
  const [sala, setSala] = useState(atual?.salaDeRecursos ?? false);
  const [motivo, setMotivo] = useState(atual?.motivoDaSala ?? '');
  const [professor, setProfessor] = useState(atual?.professorDaSala ?? '');
  const [servico, setServico] = useState(atual?.servico ?? '');
  const [profissional, setProfissional] = useState(atual?.servicoProfissional ?? '');
  const [local, setLocal] = useState(atual?.servicoLocal ?? '');
  const [aprendiz, setAprendiz] = useState(atual?.aprendiz ?? false);
  const [curso, setCurso] = useState(atual?.curso ?? '');
  const [turno, setTurno] = useState(atual?.turno ?? '');
  const [unidade, setUnidade] = useState(atual?.unidade ?? '');
  const [empresa, setEmpresa] = useState(atual?.empresa ?? '');
  const [endereco, setEndereco] = useState(atual?.enderecoDaEmpresa ?? '');
  const [erro, setErro] = useState('');

  /* As mesmas recusas do servidor, para o aviso chegar antes dele. */
  const problema = sala && !motivo.trim()
    ? 'Sala de recursos exige o motivo: é ele que a escola e a audiência perguntam.'
    : aprendiz && !curso.trim()
      ? 'Aprendizagem profissional sem o nome do curso não diz nada a quem ler o relatório.'
      : '';

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-edu"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-edu">Apoio educacional</h3>
        <div className="notice c-info">
          O que ficar em branco aqui sai como <b>"não há"</b> no relatório e na audiência — e num
          documento judicial, seção vazia se lê como ausência de trabalho.
        </div>

        <label className="f">
          <input type="checkbox" checked={sala} onChange={(e) => setSala(e.target.checked)} />
          {' '}Frequenta sala de recursos
        </label>
        {sala && (
          <>
            <label className="f" htmlFor="edu-mot">Por quê</label>
            <textarea id="edu-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex.: apoio em leitura e escrita, duas vezes por semana." />
            <label className="f" htmlFor="edu-prof">Professor ou professora</label>
            <input id="edu-prof" value={professor} onChange={(e) => setProfessor(e.target.value)} />
          </>
        )}

        <label className="f" htmlFor="edu-serv">Equipe multiprofissional</label>
        {/* A lista é a do servidor. Vazia quer dizer que ela não chegou — e aí a
            tela diz isso, em vez de oferecer uma lista escrita à mão que pode
            já estar diferente da do servidor. */}
        {servicos.length === 0 ? (
          <p className="mutetxt" style={{ marginTop: 0 }}>
            A lista de serviços não chegou do servidor. Recarregue a tela para escolher um
            serviço — o resto da folha continua podendo ser salvo.
          </p>
        ) : (
          <select id="edu-serv" value={servico} onChange={(e) => setServico(e.target.value)}>
            <option value="">— nenhum —</option>
            {servicos.map((sv) => (
              <option key={sv.cod} value={sv.cod}>{sv.label}</option>
            ))}
          </select>
        )}
        {servico && (
          <>
            <label className="f" htmlFor="edu-pro2">Quem atende</label>
            <input id="edu-pro2" value={profissional}
                   onChange={(e) => setProfissional(e.target.value)} />
            <label className="f" htmlFor="edu-loc">Onde</label>
            <input id="edu-loc" value={local} onChange={(e) => setLocal(e.target.value)} />
          </>
        )}

        <label className="f">
          <input type="checkbox" checked={aprendiz}
                 onChange={(e) => setAprendiz(e.target.checked)} />
          {' '}Aprendizagem profissional (Jovem Aprendiz)
        </label>
        {aprendiz && (
          <>
            <label className="f" htmlFor="edu-cur">Curso</label>
            <input id="edu-cur" value={curso} onChange={(e) => setCurso(e.target.value)} />
            <label className="f" htmlFor="edu-tur">Turno</label>
            <input id="edu-tur" value={turno} onChange={(e) => setTurno(e.target.value)}
                   placeholder="manhã / tarde / noite" />
            <label className="f" htmlFor="edu-uni">Unidade de formação</label>
            <input id="edu-uni" value={unidade} onChange={(e) => setUnidade(e.target.value)} />
            <label className="f" htmlFor="edu-emp">Onde trabalha</label>
            <input id="edu-emp" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
            <label className="f" htmlFor="edu-end">
              Endereço <small>— para quem leva; o sistema não rastreia ninguém</small>
            </label>
            <input id="edu-end" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </>
        )}

        {problema && <div className="notice c-crit" role="alert">{problema}</div>}
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!!problema} onClick={async () => {
            try {
              await onSalvar({
                salaDeRecursos: sala, motivoDaSala: motivo.trim() || null,
                professorDaSala: professor.trim() || null,
                servico: servico || null, servicoProfissional: profissional.trim() || null,
                servicoLocal: local.trim() || null,
                aprendiz, curso: curso.trim() || null, turno: turno.trim() || null,
                unidade: unidade.trim() || null, empresa: empresa.trim() || null,
                enderecoDaEmpresa: endereco.trim() || null,
              });
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
            }
          }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

/** A evolução do dia. Não se edita — correção é registro novo. */
function FolhaEvolucaoEducacional({ onFechar, onSalvar }: {
  onFechar: () => void; onSalvar: (c: Record<string, unknown>) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [em, setEm] = useState('');
  const [erro, setErro] = useState('');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-evo"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-evo">Evolução educacional</h3>
        <div className="notice c-info">
          Escreva o que aconteceu, e não o que a criança "é". Isto entra no relatório de
          desenvolvimento — e um documento judicial acompanha a pessoa por anos.
        </div>

        <label className="f" htmlFor="evo-dia">Quando</label>
        <input id="evo-dia" type="date" value={em} onChange={(e) => setEm(e.target.value)} />

        <label className="f" htmlFor="evo-txt">O que aconteceu</label>
        <textarea id="evo-txt" value={texto} onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ex.: entregou o trabalho de ciências sem lembrete; a professora mandou bilhete elogiando." />

        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={texto.trim().length < 10} onClick={async () => {
            try { await onSalvar({ texto: texto.trim(), em: em || undefined }); }
            catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
          }}>Registrar</button>
        </div>
      </div>
    </div>
  );
}

/**
 * O RASTRO DO REGISTRO DESTA CRIANÇA.
 *
 * Quem lê está na §7 e na policy `audit_select`: a coordenação na própria
 * casa, e o Gestor Geral nas oito. O bloco nem aparece para quem não alcança —
 * e não é por discrição: oferecer uma porta que o servidor vai recusar ensina
 * a pessoa a não confiar na tela.
 *
 * O NOME DE QUEM AGIU aparece em cada linha, como aparece em toda tela deste
 * sistema. O que não existe é o caminho inverso: não há busca por pessoa da
 * equipe, e não há contagem de nada. Um total ao lado de um nome é uma
 * avaliação que ninguém assinou.
 */
const LEEM_AUDITORIA = ['coordenador', 'gestor_geral', 'admin_tecnico'];

function AuditoriaDoAcolhido({ personId, papel }: { personId: string; papel: string }) {
  const [linhas, setLinhas] = useState<{
    id: string; acao: string; codigo: string; quando: string; por: string;
    finalidade: string | null; detalhe: Record<string, unknown> }[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!aberto || linhas) return;
    let vivo = true;
    api<{ linhas: any[] }>(`/audit/person/${personId}?dias=90`)
      .then((d) => { if (vivo) setLinhas(d.linhas); })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível abrir.'); });
    return () => { vivo = false; };
  }, [aberto, personId]);

  if (!LEEM_AUDITORIA.includes(papel)) return null;

  return (
    <>
      <div className="eyebrow">Quem mexeu no registro desta criança</div>
      {!aberto && (
        <p className="mutetxt">
          Últimos 90 dias, com o nome de quem agiu e a finalidade declarada, quando houve.{' '}
          <b>Abrir a auditoria também é um ato</b> — e ela não responde "o que fulano fez": a
          pergunta aqui é sobre a criança.
        </p>
      )}
      {!aberto && (
        <button className="btn sec block" style={{ marginBottom: 12 }}
                onClick={() => setAberto(true)}>
          Ver o rastro dos últimos 90 dias
        </button>
      )}

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aberto && !linhas && !erro && <p className="mutetxt">Abrindo…</p>}

      {aberto && linhas && linhas.length === 0 && (
        <p className="mutetxt">
          Nada registrado nos últimos 90 dias. A lista vazia quer dizer que ninguém abriu nem
          alterou o registro dela no período — não que a auditoria esteja desligada.
        </p>
      )}

      {aberto && linhas && linhas.length > 0 && (
        <>
          <div className="stack">
            {linhas.slice(0, 40).map((l) => (
              <div className="card" key={l.id}>
                <div className="row">
                  {/* A finalidade é o que separa "abriu" de "abriu e disse
                      para quê": ela pinta a linha, porque é o que alguém vai
                      procurar seis meses depois. */}
                  <span className={`pill ${l.finalidade ? 'c-med' : 'c-info'}`}>{l.acao}</span>
                  <span className="mutetxt grow">{l.por}</span>
                  <span className="mutetxt">{dia(l.quando)} {horaCurta(l.quando)}</span>
                </div>
                {l.finalidade && (
                  <div className="bloco"><small>Finalidade declarada</small>{l.finalidade}</div>
                )}
              </div>
            ))}
          </div>
          {linhas.length > 40 && (
            <p className="mutetxt">
              Mostrando as 40 mais recentes de {linhas.length}. Há mais atrás delas.
            </p>
          )}
          <button className="btn sec block" style={{ marginBottom: 12 }}
                  onClick={() => setAberto(false)}>Fechar o rastro</button>
        </>
      )}
    </>
  );
}

/**
 * A FOLHA DO CONCEITO DO BIMESTRE (fase 137).
 *
 * Três campos e nada mais: o período, o conceito e o porquê. **O porquê é
 * obrigatório**, e a folha diz por quê em vez de só barrar o botão — um conceito
 * sozinho atravessa meses e vira característica da criança, que é exatamente o
 * que a Fundação recusou ao dizer *"não boletim com notas por disciplina"*.
 *
 * A lista de conceitos vem do SERVIDOR (§12.2). Se ela não chegar, a folha diz
 * isso em vez de oferecer uma lista escrita à mão que pode já estar diferente —
 * é a lição da fase 130.
 */
function FolhaConceito({ conceitos, bimestres, onFechar, onSalvar }: {
  conceitos: { cod: string; label: string }[];
  bimestres: { cod: number; label: string }[];
  onFechar: () => void;
  onSalvar: (c: Record<string, unknown>) => Promise<void>;
}) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  /* Abre no bimestre CORRENTE, que é o que quase sempre se digita; quem for
     lançar o retorno atrasado da escola troca num toque. */
  const [bimestre, setBimestre] = useState(
    Math.min(4, Math.max(1, Math.ceil((hoje.getMonth() + 1) / 3))));
  const [conceito, setConceito] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const pode = conceito !== '' && motivo.trim().length >= 10 && !salvando;

  if (!conceitos.length) {
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-cnc"
           onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
        <div className="sheet">
          <h3 id="t-cnc">Conceito do bimestre</h3>
          <div className="notice c-warn">
            A lista de conceitos não chegou do servidor. Tente de novo em instantes — a tela não
            inventa a própria lista, porque ela pode já estar diferente da do sistema.
          </div>
          <button type="button" className="btn sec block" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-cnc"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-cnc">Conceito do bimestre</h3>
        <div className="notice c-info">
          Ele fala do <b>acompanhamento neste bimestre</b>, e não da criança. Registrar de novo o
          mesmo bimestre corrige — e o anterior continua legível, com o nome de quem o escreveu.
        </div>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}

        <label className="f" htmlFor="cnc-ano">Ano</label>
        <input id="cnc-ano" type="number" value={ano}
               onChange={(e) => setAno(Number(e.target.value))} />

        <label className="f">Bimestre</label>
        <div className="opts">
          {bimestres.map((b) => (
            <button type="button" key={b.cod} className="opt c-med"
                    aria-pressed={bimestre === b.cod} onClick={() => setBimestre(b.cod)}>
              {b.label}
            </button>
          ))}
        </div>

        <label className="f">Como foi o acompanhamento</label>
        <div className="opts">
          {conceitos.map((c) => (
            <button type="button" key={c.cod} className="opt c-med"
                    aria-pressed={conceito === c.cod} onClick={() => setConceito(c.cod)}>
              {c.label}
            </button>
          ))}
        </div>

        <label className="f" htmlFor="cnc-mot">
          Por quê <small>— obrigatório, e é o que impede o conceito de virar rótulo</small>
        </label>
        <textarea id="cnc-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: entregou os trabalhos do bimestre; a professora relatou melhora em leitura depois do reforço às terças." />

        <div className="row rodape">
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!pode}
                  onClick={async () => {
                    setSalvando(true); setErro('');
                    try {
                      await onSalvar({ ano, bimestre, conceito, motivo: motivo.trim() });
                    } catch (e) {
                      setErro(e instanceof Error ? e.message : 'Não foi possível registrar.');
                    } finally {
                      setSalvando(false);
                    }
                  }}>
            {salvando ? 'Registrando…' : 'Registrar com o meu nome'}
          </button>
        </div>
        {!pode && !salvando && (
          <p className="mutetxt" style={{ marginBottom: 0 }}>
            Escolha o conceito e escreva o porquê. Sem o porquê, o conceito atravessa meses e
            passa a ser lido como característica da criança.
          </p>
        )}
      </div>
    </div>
  );
}
