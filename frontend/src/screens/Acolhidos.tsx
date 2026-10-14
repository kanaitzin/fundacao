import { useCallback, useEffect, useState } from 'react';
import { FolhaDocumento, entregarArquivo } from '../documentos';
import { Dossie, DocumentosDaCategoria, AnexosDoRegistroDeSaude } from './Dossie';
import { FolhaReceitas } from './Saude';
import {
  AREAS_DO_ATENDIMENTO, MAXIMO_DE_ANEXOS_DO_ATENDIMENTO, QUEM_LE_ATENDIMENTO, QUEM_REGISTRA_ATENDIMENTO,
} from '../../../backend/src/modules/people/atendimento-tecnico.regra';
import { api, ErroApi } from '../api';
import { Cadastro } from './Cadastro';
import { VINCULO, FolhaDoRelato, RelatoDaConvivencia } from '../convivencias';
import {
  BotaoOlho, EscolherAnexo, Escolhido, FolhaArquivo, base64De,
} from '../anexos';
import { dia, horaSemSegundos } from '../rotulos';
import { Icone } from '../icones';
import { Avatar, esquecerFoto } from '../avatar';

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
 *  * **o perfil é dela, e não do plantão** (fase 221). Abre na Geral, com
 *    quem ela é, a casa, o tempo de acolhimento, a escola e a família; o dia
 *    de hoje (o remédio das 20h, o almoço) se cuida no Dia e na ATA, e no
 *    perfil se consulta pelo Dia a dia;
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
  /** Se há foto de identificação (fase 198): a lista mostra o rosto. */
  temFoto?: boolean;
  alertasEssenciais: number; restricoesAlimentares: number;
}
interface Condicao {
  id: string; kind: string; description: string; rotulo: string; severity: string | null;
  essential_alert: boolean; source: string | null; review_on: string | null;
  /** O laudo e a receita ligados a este registro (fase 217). */
  documentos?: DocDoRegistro[];
}
interface Restricao {
  id: string; restriction: string; substitution: string | null; guidance: string | null;
  documentos?: DocDoRegistro[];
}
interface DocDoRegistro { id: string; titulo: string; anexadoEm: string; conferido: boolean }
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
  /* Fase 160: o RG (inteiro só para quem escreve), o nome social, e a validade. */
  rg?: string | null; nomeSocial?: string | null;
  autorizacao?: { por: string; em: string } | null; temFoto?: boolean;
  /* QUANDO ele pode vir (1500) — o servidor manda os dias já escritos em
     português, porque quem lê isto no celular não conta números da semana. */
  visita?: { dias: number[] | null; diasEscritos: string | null;
             de: string | null; ate: string | null;
             observacao: string | null; combinado: boolean;
             validoDe?: string | null; validoAte?: string | null } | null;
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
/* Quem registra a chegada de noite, pelo plantão (decisão de 28/09). A técnica,
   a coordenação e o gestor usam o cadastro completo. A mesma lista está no banco,
   em `app_chegada_provisoria` (1633). */
const REGISTRA_CHEGADA = ['educador', 'lider_diurno', 'lider_noturno_geral'];
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
  liberada:    { txt: 'pode sair sem acompanhante', tom: 'c-ok' },
  acompanhada: { txt: 'só sai com acompanhante', tom: 'c-warn' },
  suspensa:    { txt: 'não pode sair sem acompanhante', tom: 'c-warn' },
};

interface Convivencia {
  id: string; personId: string; quem: string; comQuem: string; vinculo: string;
  saiuEm: string; retornoPrevisto: string;
  avisar: boolean; atrasado: boolean; finalidade: string | null;
}

/** Quem trata do remédio que vai com a criança. */
const VE_REMEDIO = ['enfermagem', 'equipe_tecnica', 'coordenador', 'gestor_geral'];


/* "quarta às 18:00", e não o "qua., 18:00" do navegador, que no celular se lê
   como abreviatura solta (fase 184). */
const horaCurta = (iso: string) => {
  const d = new Date(iso);
  const semana = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' })
    .replace('-feira', '');
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `${semana} às ${hora}`;
};

export function Acolhidos({ houseId, casaLabel, papel, abrir, paraALista }: {
  houseId: string; casaLabel: string; papel: string;
  /** A criança escolhida na busca do topo (fase 183). Um objeto novo a cada
      busca, para a mesma criança abrir de novo depois de fechada. */
  /** Muda quando a pessoa toca de novo em Acolhidos no menu: volta à lista (fase 204). */
  paraALista?: number;
  abrir?: { id: string } | null;
}) {
  const [lista, setLista] = useState<Resumo[]>([]);
  const [abertoId, setAbertoId] = useState<string | null>(abrir?.id ?? null);
  useEffect(() => { if (abrir) setAbertoId(abrir.id); }, [abrir]);
  useEffect(() => { if (paraALista) { setAbertoId(null); setVendoAcervo(false); } }, [paraALista]);
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
  const [chegando, setChegando] = useState(false);
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
  /* Entrar no acervo só muda o estado; a leitura vem daqui (fase 196: o botão de
     entrar tem a marca de entrada da Acolhe+AI, e o clique dele só pode mudar estado). */
  useEffect(() => { if (vendoAcervo) void carregarAcervo(); }, [vendoAcervo, carregarAcervo]);

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
    /* A chave é a criança (fase 205): sem ela, abrir outra criança pela busca ou pela
       Acolhe+AI com o dossiê da primeira aberto mostrava direto o dossiê da segunda. */
    return <Perfil key={abertoId} personId={abertoId} houseId={houseId} papel={papel}
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
                  <button data-acolhe-abre="" className="btn sm sec" onClick={() => setRetornando(p)}>
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
          <div className="eyebrow">Saídas de hoje: atenção</div>
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
        <button data-acolhe-abre="" className="btn block" onClick={() => setCadastrando(true)}>
          Cadastrar acolhido
        </button>
      )}
      {REGISTRA_CHEGADA.includes(papel) && (
        <button data-acolhe-abre="" className="btn block sec" onClick={() => setChegando(true)}>
          Chegou uma criança agora
        </button>
      )}
      {chegando && (
        <FolhaChegada houseId={houseId} onFechar={() => setChegando(false)}
                      onRegistrou={(msg) => { setChegando(false); setAviso(msg); void carregar(); }} />
      )}
      {REGISTRA_SAIDA.includes(papel) && (
        <button data-acolhe-entra="" className="btn block sec" style={{ marginTop: 8 }}
                onClick={() => setVendoAcervo(true)}>
          <Icone nome="arquivo" /> Acervo histórico: quem saiu, e registrar retorno
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
            <button className="card row pessoa-cartao" onClick={() => setAbertoId(p.id)}>
              <Avatar nome={p.nome} de={{ acolhido: p.id }} temFoto={p.temFoto} tamanho={52} />
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
  /* Os números da criança (fase 221): cada aba mostra os seus. Sem eles o
     perfil ainda serve, e cada aba diz o que tem. */
  const [numeros, setNumeros] = useState<NumerosDaCrianca | null>(null);
  const [judicial, setJudicial] = useState<Judicial | null>(null);
  const [erro, setErro] = useState('');
  const [erroJudicial, setErroJudicial] = useState('');
  const [semJudicial, setSemJudicial] = useState(false);
  const [evolucao, setEvolucao] = useState(false);
  /* Alergia, condição e restrição (fase 166): registrar e encerrar. */
  const [registrandoSaude, setRegistrandoSaude] = useState<'condicao' | 'restricao' | null>(null);
  const [encerrandoSaude, setEncerrandoSaude] = useState<{ qual: 'condicao' | 'restricao'; id: string; nome: string } | null>(null);
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
  /** A aba do perfil (fase 208): o perfil em partes, em vez de oito telas de rolagem.
      Desde a 221 ele abre na Geral, os dados dela; o dia de hoje fica na ATA. */
  const [aba, setAba] = useState<AbaDoPerfil>('geral');

  useEffect(() => {
    (async () => {
      setErro('');
      try {
        setP(await api<Perfil>(`/people/${personId}`));
        setNumeros(await api<NumerosDaCrianca>(`/reports/acolhido/${personId}/numeros`).catch(() => null));
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

  const leAtendimento = QUEM_LE_ATENDIMENTO.includes(papel);

  return (
    <>
      <div className="diahead perfil-topo">
        <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
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
              {p.idade} anos
              {p.casaAtual ? ` · ${p.casaAtual.codigo}` : ''}
              {numeros?.geral.diasNoAcolhimento != null ? ` · no acolhimento há ${duracao(numeros.geral.diasNoAcolhimento)}` : ''}
            </div>
          </div>
        </div>
      </div>

      {/*
        * PRIMEIRO, e sem precisar rolar: o que machuca hoje se for ignorado.
        *
        * O comentário sempre disse isto, e ao longo das fases doze blocos foram
        * entrando ANTES dele: a alergia ao amendoim da Alice estava a 5.185 px
        * do topo, seis telas abaixo, e a da Lara a três telas no celular (achado
        * na revisão do perfil, fase 202). Alergia, restrição, cuidados e o
        * remédio de hoje vêm logo depois do nome, e o resto vem depois.
        */}
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

      <AbasDoPerfil aba={aba} onAba={setAba} leAtendimento={leAtendimento} />

      {aba === 'geral' && (
        <VisaoGeral perfil={p} numeros={numeros} papel={papel} houseId={houseId} onAba={setAba} />
      )}

      {/*
        * O QUE ELA CONQUISTOU.
        *
        * A conquista se registra AQUI, no perfil, e não na tela do Gestor
        * Geral: quem escreve é a equipe técnica, que trabalha no caso da
        * criança — e a tela do gestor é a das oito casas, que a técnica nem
        * alcança. Sem este bloco, a fase 58 tinha criado uma tabela que só a
        * API sabia preencher.
        */}
      {aba === 'vida' && <VidaNaCasa perfil={p} numeros={numeros} />}
      {aba === 'vida' && <FotosEmQueAparece personId={p.id} nome={p.nome} />}
      {aba === 'vida' && <Conquistas perfil={p} papel={papel} />}

      {/*
        * QUEM APARECE POR ESTA CRIANÇA.
        *
        * Fica ALTO na tela, junto da identificação, porque é informação de
        * plantão: quem está com a criança precisa saber quem é a pessoa que
        * apareceu no portão às nove da noite, sem ligar para a técnica.
        */}
      {aba === 'familia' && (
      <div id="perfil-familia">
        {numeros && <NumerosDaFamilia numeros={numeros} nome={p.nome} />}
        <SairSozinho perfil={p} papel={papel} onMudou={recarregar} />
        <Contatos perfil={p} papel={papel} onMudou={recarregar} />
        <VisitasDoAcolhido personId={p.id} />
        <ConvivenciaFamiliar personId={p.id} quem={p.nome} />
      </div>
      )}

      {/*
        * A PRESENÇA, NA VIDA DELA (fase 110).
        *
        * A chamada é coletiva e o registro de cada criança ficava DENTRO dela:
        * para saber se a Alice esteve no almoço de terça, alguém abria a
        * chamada daquele almoço. O provedor da linha do tempo dizia, num
        * comentário, que "o registro dele está no perfil" — e não estava.
        */}
      {aba === 'atendimentos' && leAtendimento && (
        <AtendimentosDaEquipeTecnica personId={p.id} nome={p.nome} papel={papel} />
      )}
      {aba === 'rotina' && <DiaADia houseId={houseId} personId={p.id} nome={p.nome} />}
      {aba === 'rotina' && <div id="perfil-presenca"><Presenca personId={p.id} nome={p.nome} /></div>}

      {/*
        * O QUE SE ESCREVEU SOBRE ELA (fase 128).
        *
        * `statement.person_id` era gravado desde a 0300 e nunca lido por
        * pessoa. Ficou fechado de propósito até 20/09, esperando a resposta do
        * §10 item 6: listar por criança tudo o que se escreveu SOBRE ela é
        * exatamente a narrativa que o §26.2 protege. A resposta foi "só a
        * contagem", e é ela que desenha este bloco.
        */}
      {aba === 'rotina' && <Relatos personId={p.id} nome={p.nome} />}

      {/*
        * O PRONTUÁRIO DE EDUCAÇÃO (fase 111).
        *
        * As duas tabelas existiam desde a migração 0530 e o relatório as lia;
        * NENHUMA rota as escrevia (§9, item 3). No piloto, o relatório de
        * desenvolvimento e a audiência diriam "não há" sobre escola e
        * profissionalização para sempre.
        */}
      {aba === 'educacao' && <div id="perfil-educacao"><Educacao personId={p.id} houseId={houseId} papel={papel} /></div>}

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
      {aba === 'judiciario' && <OficiosDoAcolhido personId={p.id} />}

      {aba === 'cadastro' && <AuditoriaDoAcolhido personId={p.id} papel={papel} />}

      {/* A pasta da criança: o que a casa precisa ter, e o álbum dela. */}
      {(aba === 'vida' || aba === 'cadastro') && (
        <button data-acolhe-entra="" className="btn sec block" style={{ marginBottom: 12 }} onClick={() => setDossie(true)}>
          <Icone nome="pasta" /> Dossiê e vivências
        </button>
      )}

      {/*
        * CORRIGIR O CADASTRO (§6.2).
        *
        * Nome escrito errado às 23h, com a criança na porta. Data de
        * nascimento trocada porque a certidão veio depois. Sem esta porta, a
        * saída de quem usa é RECADASTRAR — e aí existem duas crianças, o
        * histórico parte em dois, e é isso que a audiência pergunta.
        */}
      {aba === 'cadastro' && QUEM_CADASTRA.includes(papel) && (
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
      {(aba === 'cadastro' || aba === 'educacao') && QUEM_CADASTRA.includes(papel) && (
        <button data-acolhe-abre="" className="btn ghost block" style={{ marginBottom: 12 }}
                onClick={() => setEditandoDetalhe(true)}>
          <Icone nome="escrever" /> Atualizar escola, cuidados e equipe
        </button>
      )}

      {/* O histórico fica À VISTA de quem cuida: "por que o nome dela mudou em
          março?" é pergunta do caso, não de auditoria. */}
      {aba === 'cadastro' && correcoes.length > 0 && (
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
      {aba === 'cadastro' && alteracoes.length > 0 && (
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

      {aba === 'saude' && numeros && <NumerosDaSaude numeros={numeros} nome={p.nome} />}
      {aba === 'saude' && (
      <Secao titulo="Saúde" id="perfil-saude">
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
            <button data-acolhe-abre="" className="btn sec block" onClick={() => setEvolucao(true)}>
              <Icone nome="saude_ic" /> Registrar atendimento de saúde
            </button>
            <p className="mutetxt">
              Voltou de consulta, exame, urgência ou internação? Quem acompanhou escreve o
              que viu; a Enfermagem tria e assina. <b>Receita nova só altera a grade de
              medicamentos depois dessa revisão.</b>
            </p>
          </>
        )}
        {ESCREVE_SAUDE.includes(papel) && (
          <div className="acoes">
            <button data-acolhe-abre="" className="btn sm sec" onClick={() => setRegistrandoSaude('condicao')}>
              <Icone nome="alerta" /> Registrar alergia ou condição
            </button>
            <button data-acolhe-abre="" className="btn sm sec" onClick={() => setRegistrandoSaude('restricao')}>
              <Icone nome="refeicao" /> Registrar restrição alimentar
            </button>
          </div>
        )}
        {p.condicoesSaude.length > 0 && (
          <ul className="lista">
            {p.condicoesSaude.map((c) => (
              <li key={c.id} className="row">
                <span className="grow">
                  <b className="ff">{c.rotulo ?? c.description}</b>
                  <span className="mutetxt linhadois">
                    {c.kind}{c.severity ? ` · ${c.severity}` : ''}
                    {c.source ? ` · ${c.source}` : ''}
                  </span>
                </span>
                {ESCREVE_SAUDE.includes(papel) && (
                  <button className="btn sm ghost" aria-label={`Encerrar ${c.rotulo ?? c.description}`}
                          onClick={() => setEncerrandoSaude({ qual: 'condicao', id: c.id, nome: c.rotulo ?? c.description })}>
                    Encerrar
                  </button>
                )}
                <div style={{ flexBasis: '100%' }}>
                  <AnexosDoRegistroDeSaude personId={p.id} documentos={c.documentos ?? []}
                    registro={{ qual: 'condicao', id: c.id, nome: c.rotulo ?? c.description }}
                    podeAnexar={ESCREVE_SAUDE.includes(papel)} onMudou={() => void recarregar()} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {p.restricoesAlimentares.length > 0 && (
          <ul className="lista">
            {p.restricoesAlimentares.map((r) => (
              <li key={r.id} className="row">
                <span className="grow">
                  <b className="ff">Não servir: {r.restriction}</b>
                  {r.substitution && <span className="mutetxt linhadois">No lugar: {r.substitution}</span>}
                </span>
                {ESCREVE_SAUDE.includes(papel) && (
                  <button className="btn sm ghost" aria-label={`Encerrar a restrição ${r.restriction}`}
                          onClick={() => setEncerrandoSaude({ qual: 'restricao', id: r.id, nome: r.restriction })}>
                    Encerrar
                  </button>
                )}
                <div style={{ flexBasis: '100%' }}>
                  <AnexosDoRegistroDeSaude personId={p.id} documentos={r.documentos ?? []}
                    registro={{ qual: 'restricao', id: r.id, nome: r.restriction }}
                    podeAnexar={ESCREVE_SAUDE.includes(papel)} onMudou={() => void recarregar()} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {ESCREVE_SAUDE.includes(papel) && houseId && (
          <RemediosEReceitas personId={p.id} houseId={houseId} papel={papel} />
        )}
      </Secao>
      )}
      {aba === 'saude' && <InternacoesDoAcolhido personId={p.id} />}

      {/*
        * O QUE A COORDENAÇÃO DESLIGOU (fase 93).
        *
        * Campo desligado não some calado: o educador lê que existe, quem
        * desligou e por quê. Sem isto ele leria a ausência como "não há
        * telefone da escola" — e ligaria para ninguém.
        */}
      {aba === 'geral' && (p.camposDesligados ?? []).length > 0 && (
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

      {aba === 'educacao' && ((p.escola && (p.escola.nome || p.escola.serie)) || QUEM_CADASTRA.includes(papel)) && (
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

      {/* As observações só chegam a quem pode escrevê-las: o servidor nem as
          devolve para os outros cargos (§6.2). */}
      {aba === 'cadastro' && p.observacoes !== undefined && (
        <Secao titulo="Observações">
          {p.observacoes
            ? <p className="bloco" style={{ marginTop: 0 }}>{p.observacoes}</p>
            : <p className="mutetxt" style={{ margin: 0 }}>Nada escrito ainda.</p>}
        </Secao>
      )}

      {aba === 'cadastro' && (
      <Secao titulo="Documentos" id="perfil-documentos">
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
            Mais {p.documentosRestritos} documento(s) em área restrita ao seu cargo. Estão guardados,
            e quem os consulta é a equipe técnica.
          </p>
        )}
      </Secao>
      )}

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
      {aba === 'judiciario' && acolhimento && (
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
      {aba === 'judiciario' && p.episodios && p.episodios.length > 1 && (
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

      {aba === 'judiciario' && VE_JUDICIAL.includes(papel) && (
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
                O motivo do acolhimento ainda não foi registrado. A equipe técnica completa o
                cadastro, e os documentos de quando a criança chegou podem ser anexados abaixo.
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
          {/* Os documentos da área restrita (fase 216, pedido de 14/10): a guia, a
              decisão, o relatório de quando a criança chegou e o que mais a equipe
              técnica precisar guardar, em PDF ou digitalizado, na mesma pasta do dossiê. */}
          {(judicial || semJudicial) && (
            <div style={{ marginTop: 14 }}>
              <DocumentosDaCategoria personId={p.id} categoria="judicial_socioassistencial"
                titulo="Documentos da área restrita"
                explicacao="A guia, as decisões, o relatório de acolhimento e o que mais a equipe técnica guardar. Cada arquivo aberto fica registrado."
                podeAnexar={VE_JUDICIAL.includes(papel)} />
            </div>
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
      {aba === 'cadastro' && REGISTRA_SAIDA.includes(papel) && (
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

      {registrandoSaude && (
        <FolhaRegistroDeSaude qual={registrandoSaude} onFechar={() => setRegistrandoSaude(null)}
          onSalvar={async (dados) => {
            const r = await api<{ aviso?: string }>(
              registrandoSaude === 'condicao'
                ? `/people/${personId}/health-conditions`
                : `/people/${personId}/food-restrictions`,
              { method: 'POST', body: JSON.stringify(dados) });
            setRegistrandoSaude(null); setAviso(r?.aviso ?? 'Registrado.');
            await recarregar();
          }} />
      )}

      {encerrandoSaude && (
        <FolhaEncerrarSaude nome={encerrandoSaude.nome} onFechar={() => setEncerrandoSaude(null)}
          onEncerrar={async (motivo) => {
            const r = await api<{ aviso?: string }>(
              encerrandoSaude.qual === 'condicao'
                ? `/people/health-conditions/${encerrandoSaude.id}/end`
                : `/people/food-restrictions/${encerrandoSaude.id}/end`,
              { method: 'POST', body: JSON.stringify({ motivo }) });
            setEncerrandoSaude(null); setAviso(r?.aviso ?? 'Encerrado.');
            await recarregar();
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

      {aba === 'vida' && p.memorias.length > 0 && (
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

/*
 * OS PRÓXIMOS COMPROMISSOS DELA (fase 202).
 *
 * A agenda guarda o compromisso com a criança (a consulta, a audiência, o
 * reforço) e o servidor sabe filtrar por ela desde a fase da agenda; o perfil
 * nunca perguntava. Quem abre o perfil antes de uma audiência, ou o educador
 * que vai levá-la ao dentista amanhã, precisava abrir a agenda da casa inteira
 * e procurar o nome. Some quando não há nada nos próximos trinta dias.
 */
/* O dia de hoje na instituição, como a Agenda calcula (en-CA dá AAAA-MM-DD). */
const hojeISO = () => new Intl.DateTimeFormat('en-CA',
  { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
type CompromissoDoDia = {
  compromissoId: string; em: string; hora: string; titulo: string; local: string | null;
  tipo: string; desmarcada?: boolean; coletivo?: boolean;
};
function CompromissosDoAcolhido({ houseId, personId, nome }: { houseId: string; personId: string; nome: string }) {
  const [lista, setLista] = useState<CompromissoDoDia[] | null>(null);
  useEffect(() => {
    let vivo = true;
    const de = hojeISO();
    const ate = new Date(`${de}T12:00:00`);
    ate.setDate(ate.getDate() + 30);
    api<CompromissoDoDia[]>(`/activities/agenda?houseId=${houseId}&de=${de}&ate=${ate.toISOString().slice(0, 10)}&personId=${personId}`)
      .then((l) => { if (vivo) setLista(Array.isArray(l) ? l.filter((c) => !c.coletivo) : []); })
      .catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [houseId, personId]);
  if (!lista?.length) return null;
  /* O compromisso que se repete (a fono de toda terça e quinta) aparece UMA vez,
     com a próxima data e quantas vezes mais ele cai: cinco linhas iguais
     escondiam a audiência que vinha depois delas. */
  const porCompromisso = new Map<string, { primeiro: CompromissoDoDia; vezes: number; ultimo: string }>();
  for (const c of lista) {
    const g = porCompromisso.get(c.compromissoId);
    if (g) { g.vezes++; g.ultimo = c.em; } else porCompromisso.set(c.compromissoId, { primeiro: c, vezes: 1, ultimo: c.em });
  }
  const grupos = [...porCompromisso.values()];
  return (
    <section className="passagem" id="perfil-agenda">
      <div className="eyebrow">Os próximos compromissos de {nome} · {grupos.length}</div>
      <div className="card">
        <ul className="lista">
          {grupos.map(({ primeiro: c, vezes, ultimo }) => (
            <li key={c.compromissoId} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <span className="oc-quando" style={{ width: 58 }}>
                <b>{dia(c.em).slice(0, 5)}</b>
                <span>{c.hora}</span>
              </span>
              <div className="grow">
                <b className="ff">{c.titulo}</b>
                {c.local && <div className="mutetxt">{c.local}</div>}
                {vezes > 1 && (
                  <div className="mutetxt">E mais {vezes - 1} vez(es) até {dia(ultimo).slice(0, 5)}.</div>
                )}
                {c.desmarcada && <span className="pill c-mute">Desmarcado</span>}
              </div>
            </li>
          ))}
        </ul>
        <p className="mutetxt" style={{ margin: '8px 0 0' }}>
          Os próximos trinta dias. A agenda inteira da casa fica na Agenda.
        </p>
      </div>
    </section>
  );
}

/*
 * AS ABAS DO PERFIL (fase 208; reorganizadas na 221, pedido de 14/10).
 *
 * O perfil é ferramenta de trabalho com aquela criança, e não o painel do
 * plantão. Ele abre na GERAL, com os dados dela: quem é, a casa, o tempo de
 * acolhimento, a escola e a família. O dia de hoje (o remédio das 20h, o
 * almoço, a chamada) é da ATA e do Dia; no perfil, o que a equipe registrou
 * se CONSULTA na aba Dia a dia, dia por dia. E os Atendimentos são os da
 * equipe técnica, em linha do tempo, o mais novo em cima.
 *
 * O que protege a criança (alergia e restrição) continua ACIMA das abas, em
 * todas elas: ninguém precisa escolher a aba certa para saber que a Alice não
 * come amendoim (fase 202).
 *
 * A cor da aba diz de que PARTE da vida dela é o que está aberto. Ela não é a
 * cor de estado, de autor nem de cargo: mora só na barra da aba e no desenho,
 * nunca numa pílula, e o nome da aba vem sempre escrito.
 */
type AbaDoPerfil = 'geral' | 'familia' | 'saude' | 'rotina' | 'educacao' | 'atendimentos'
  | 'judiciario' | 'vida' | 'cadastro';
const ABAS_DO_PERFIL: { id: AbaDoPerfil; rotulo: string; icone: string }[] = [
  { id: 'geral', rotulo: 'Geral', icone: 'identidade' },
  { id: 'familia', rotulo: 'Família e visitas', icone: 'casas' },
  { id: 'saude', rotulo: 'Saúde', icone: 'saude_ic' },
  { id: 'rotina', rotulo: 'Dia a dia', icone: 'linha_do_dia' },
  { id: 'educacao', rotulo: 'Educação', icone: 'formatura' },
  { id: 'atendimentos', rotulo: 'Atendimentos', icone: 'ouvir' },
  { id: 'judiciario', rotulo: 'Judiciário', icone: 'instituicao' },
  { id: 'vida', rotulo: 'Vida na casa', icone: 'conquista' },
  { id: 'cadastro', rotulo: 'Cadastro', icone: 'documento' },
];
function AbasDoPerfil({ aba, onAba, leAtendimento }: {
  aba: AbaDoPerfil; onAba: (a: AbaDoPerfil) => void; leAtendimento: boolean;
}) {
  /* Os Atendimentos da equipe técnica são lidos pela equipe técnica, pela
     coordenação e pela gestão: para os outros cargos a aba nem aparece. */
  const abas = ABAS_DO_PERFIL.filter((a) => a.id !== 'atendimentos' || leAtendimento);
  return (
    <nav className="abas-perfil" role="tablist" aria-label="Partes do perfil">
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={aba === a.id}
                className={`aba-perfil aba-${a.id}${aba === a.id ? ' on' : ''}`}
                onClick={() => onAba(a.id)}>
          <Icone nome={a.icone} tamanho={18} /> {a.rotulo}
        </button>
      ))}
    </nav>
  );
}

/** Os números da criança, da rota `/reports/acolhido/:id/numeros` (fase 221). */
interface NumerosDaCrianca {
  geral: {
    acolhidaDesde: string | null; diasNoAcolhimento: number | null; episodio: number | null;
    episodios: number; casaDesde: string | null; diasNaCasa: number | null;
    casasNesteAcolhimento: number; pia: { vence: string | null; dias: number | null } | null;
  };
  saude: {
    remediosEmUso: number;
    doses30: { previstas: number; noHorario: number; foraDoHorario: number; naoDadas: number;
               semConfirmacao: number; ausente: number };
    atendimentos90: number; ultimoAtendimento: { dia: string; tipo: string } | null;
    proximoRetorno: string | null;
    internacoes: { total: number; agora: boolean; ultima: string | null } | null;
  };
  familia: { convivencias90: number; comAFamiliaAgora: boolean; saidas30: number };
  vida: { conquistas: number; ultimaConquista: { dia: string; tipo: string } | null; fotosEmQueAparece: number };
}

/** "7 meses", "1 ano e 2 meses", "12 dias": o tempo como a equipe fala. */
function duracao(dias: number): string {
  if (dias < 31) return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  const meses = Math.floor(dias / 30.44);
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12); const resto = meses % 12;
  return `${anos} ${anos === 1 ? 'ano' : 'anos'}${resto ? ` e ${resto} ${resto === 1 ? 'mês' : 'meses'}` : ''}`;
}

/** Os números de uma aba em blocos: o número grande, a palavra embaixo (as contas da 200). */
function Contas({ titulo, itens }: { titulo: string; itens: { n: number | string; rotulo: string }[] }) {
  return (
    <section className="passagem" aria-label={titulo}>
      <div className="eyebrow">{titulo}</div>
      <ul className="lista contas">
        {itens.map((i) => (
          <li key={i.rotulo} className={i.n === 0 ? 'zero' : ''}><span>{i.rotulo}</span><b>{i.n}</b></li>
        ))}
      </ul>
    </section>
  );
}

const TIPO_DE_ATENDIMENTO_DE_SAUDE: Record<string, string> = {
  consulta: 'consulta', exame: 'exame', urgencia: 'urgência', emergencia: 'emergência',
  internacao: 'internação', retorno: 'retorno', terapia: 'terapia',
};

/*
 * A GERAL (fase 221): os dados DELA, que mudam devagar. É a primeira aba, e é
 * a que a técnica abre antes de uma audiência e a educadora nova abre no
 * primeiro plantão: quem é, onde mora, há quanto tempo está acolhida, em que
 * escola estuda, quem é a família dela e quem cuida do caso.
 */
function VisaoGeral({ perfil: p, numeros, papel, houseId, onAba }: {
  perfil: Perfil; numeros: NumerosDaCrianca | null; papel: string; houseId: string;
  onAba: (a: AbaDoPerfil) => void;
}) {
  const g = numeros?.geral;
  const familiares = p.contatos.filter((c) => c.ativo);
  const escola = p.escola && (p.escola.nome || p.escola.serie) ? p.escola : null;
  const ic = p.identificacaoComplementar;
  const identificacao = [
    p.rg && ['RG', p.rg], p.cns && ['Cartão SUS', p.cns], ic?.nis && ['NIS', ic.nis],
    ic?.registroCivil && ['Registro civil', ic.registroCivil], ic?.genero && ['Gênero', ic.genero],
    ic?.raca && ['Cor ou raça', ic.raca], ic?.naturalidade && ['Natural de', ic.naturalidade],
  ].filter(Boolean) as [string, string][];
  return (
    <>
      <section className="passagem" aria-label={`Quem é ${p.nome}`} id="perfil-geral">
        <div className="eyebrow">Quem é {p.nome}</div>
        <ul className="ficha-geral">
          <li>
            <span>Idade</span><b>{p.idade} anos</b>
            <small>nasceu em {dia(p.nascimento)}</small>
          </li>
          <li>
            <span>Casa</span><b>{p.casaAtual ? p.casaAtual.nome : 'Sem casa no momento'}</b>
            {p.casaAtual && (
              <small>desde {dia(p.casaAtual.desde)}{g?.diasNaCasa != null ? `, há ${duracao(g.diasNaCasa)}` : ''}</small>
            )}
          </li>
          <li>
            <span>No acolhimento</span>
            <b>{g?.diasNoAcolhimento != null ? `há ${duracao(g.diasNoAcolhimento)}` : 'Sem a data de entrada'}</b>
            {g?.acolhidaDesde && (
              <small>
                desde {dia(g.acolhidaDesde)}
                {g.episodios > 1 ? ` · ${g.episodio}º acolhimento` : ''}
                {g.casasNesteAcolhimento > 1 ? ` · ${g.casasNesteAcolhimento} casas neste acolhimento` : ''}
              </small>
            )}
          </li>
          <li>
            <span>Escola</span><b>{escola?.nome ?? 'Escola não informada'}</b>
            {escola && <small>{[escola.serie, escola.turno].filter(Boolean).join(' · ') || 'Série e turno não informados'}</small>}
          </li>
          {g?.pia && (
            <li>
              <span>PIA</span>
              <b>{!g.pia.vence ? 'Sem PIA com validade' : g.pia.dias! < 0 ? 'Vencido' : `Vale até ${dia(g.pia.vence)}`}</b>
              <small>
                {!g.pia.vence ? 'O PIA vai no dossiê, com a validade.'
                  : g.pia.dias! < 0 ? `venceu em ${dia(g.pia.vence)}, há ${duracao(-g.pia.dias!)}`
                  : `faltam ${duracao(g.pia.dias!)}`}
              </small>
            </li>
          )}
          <li>
            <span>Equipe de referência</span><b>{p.equipeReferencia ?? 'Não informada'}</b>
          </li>
        </ul>
      </section>

      <section className="passagem" aria-label={`A família de ${p.nome}`}>
        <div className="eyebrow">A família · {familiares.length}</div>
        <div className="card">
          {familiares.length === 0 && (
            <p className="mutetxt" style={{ margin: 0 }}>Nenhum familiar cadastrado ainda.</p>
          )}
          <ul className="familiares">
            {familiares.map((c) => (
              <li key={c.id}>
                <Avatar nome={c.nomeSocial || c.nome} de={{ contato: c.id }} temFoto={c.temFoto} tamanho={40} />
                <div className="grow">
                  <b className="ff">{c.nomeSocial || c.nome}</b>
                  <div className="mutetxt">
                    {c.vinculoRotulo}{c.telefone ? ` · ${c.telefone}` : ''}
                    {c.restrito ? ' · com restrição de contato' : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn sm sec" style={{ marginTop: 8 }} onClick={() => onAba('familia')}>
            Família e visitas
          </button>
        </div>
      </section>

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

      <CompromissosDoAcolhido houseId={houseId} personId={p.id} nome={p.nome} />

      {(identificacao.length > 0 || p.filiacao) && (
        <Secao titulo="Identificação">
          <ul className="ficha-geral ficha-miuda">
            {identificacao.map(([r, v]) => <li key={r}><span>{r}</span><b>{v}</b></li>)}
            {p.filiacao && (
              <li><span>Filiação</span><b>{p.filiacao.split('\n').filter(Boolean).join(' · ')}</b></li>
            )}
          </ul>
        </Secao>
      )}
    </>
  );
}

/* A família em números (fase 221): as visitas têm os seus logo abaixo, com a rota delas. */
function NumerosDaFamilia({ numeros, nome }: { numeros: NumerosDaCrianca; nome: string }) {
  const f = numeros.familia;
  return (
    <Contas titulo={`A convivência de ${nome} em números`} itens={[
      { n: f.convivencias90, rotulo: 'convivências com a família nos últimos 90 dias' },
      { n: f.comAFamiliaAgora ? 'Sim' : 'Não', rotulo: 'com a família agora' },
      { n: f.saidas30, rotulo: 'saídas pelo portão nos últimos 30 dias' },
    ]} />
  );
}

/* A saúde em números (fase 221): as doses dos últimos trinta dias, os atendimentos e a internação. */
function NumerosDaSaude({ numeros, nome }: { numeros: NumerosDaCrianca; nome: string }) {
  const s = numeros.saude;
  const d = s.doses30;
  return (
    <>
      <Contas titulo={`A saúde de ${nome} em números`} itens={[
        { n: s.remediosEmUso, rotulo: 'remédios em uso' },
        { n: d.previstas, rotulo: 'doses previstas nos últimos 30 dias' },
        { n: d.noHorario, rotulo: 'dadas no horário' },
        { n: d.foraDoHorario, rotulo: 'dadas fora do horário' },
        { n: d.naoDadas, rotulo: 'não dadas (recusa ou falta)' },
        { n: d.semConfirmacao, rotulo: 'sem confirmação' },
        { n: s.atendimentos90, rotulo: 'atendimentos de saúde nos últimos 90 dias' },
        ...(s.internacoes ? [{ n: s.internacoes.total, rotulo: 'internações registradas' }] : []),
      ]} />
      {(s.ultimoAtendimento || s.proximoRetorno || s.internacoes?.agora) && (
        <p className="mutetxt" style={{ marginTop: -6 }}>
          {s.internacoes?.agora ? `${nome} está internada agora. ` : ''}
          {s.ultimoAtendimento
            ? `Último atendimento: ${TIPO_DE_ATENDIMENTO_DE_SAUDE[s.ultimoAtendimento.tipo] ?? s.ultimoAtendimento.tipo} em ${dia(s.ultimoAtendimento.dia)}. ` : ''}
          {s.proximoRetorno ? `Retorno marcado até ${dia(s.proximoRetorno)}.` : ''}
        </p>
      )}
    </>
  );
}

/* A VIDA NA CASA (fase 208): o aniversário e o tempo de casa, em frase, e desde
   a 221 os números dela. As conquistas vêm logo abaixo. */
function VidaNaCasa({ perfil, numeros }: { perfil: Perfil; numeros: NumerosDaCrianca | null }) {
  const hoje = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) + 'T12:00:00Z');
  const linhas: string[] = [];
  if (perfil.nascimento) {
    const [, m, d] = perfil.nascimento.split('-').map(Number);
    let prox = new Date(Date.UTC(hoje.getUTCFullYear(), m - 1, d, 12));
    if (prox < hoje) prox = new Date(Date.UTC(hoje.getUTCFullYear() + 1, m - 1, d, 12));
    const faltam = Math.round((prox.getTime() - hoje.getTime()) / 86_400_000);
    const quando = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    linhas.push(faltam === 0 ? `Hoje é o aniversário de ${perfil.nome}: ${perfil.idade} anos.`
      : `Faz aniversário em ${quando}${faltam <= 30 ? `, daqui a ${faltam} ${faltam === 1 ? 'dia' : 'dias'}` : ''}.`);
  }
  if (perfil.casaAtual?.desde) {
    const dias = Math.max(0, Math.round((hoje.getTime() - new Date(perfil.casaAtual.desde + 'T12:00:00Z').getTime()) / 86_400_000));
    linhas.push(`Mora na ${perfil.casaAtual.codigo} desde ${dia(perfil.casaAtual.desde)}, há ${duracao(dias)}.`);
  }
  const v = numeros?.vida;
  return (
    <>
      {v && (
        <Contas titulo={`A vida de ${perfil.nome} na casa em números`} itens={[
          { n: v.conquistas, rotulo: 'conquistas registradas' },
          { n: v.fotosEmQueAparece, rotulo: 'fotos de vivências em que aparece' },
          { n: perfil.memorias.length, rotulo: 'memórias guardadas' },
        ]} />
      )}
      <Secao titulo="Vida na casa">
        {linhas.map((l) => <p key={l} className="bloco" style={{ marginTop: 0 }}>{l}</p>)}
        {v?.ultimaConquista && (
          <p className="bloco" style={{ marginTop: 0 }}>
            A conquista mais recente foi em {dia(v.ultimaConquista.dia)}.
          </p>
        )}
        <p className="mutetxt" style={{ margin: 0 }}>
          As fotos e as memórias de {perfil.nome} ficam no dossiê e vivências, logo abaixo.
        </p>
      </Secao>
    </>
  );
}

/*
 * AS FOTOS EM QUE ELA APARECE (fase 209): fotos de vivências de outras crianças
 * da casa em que alguém da equipe a marcou. A miniatura na lista, a inteira no
 * toque. Nenhum rosto é reconhecido pela máquina.
 */
interface FotoEmQueAparece {
  marcaId: string; fotoId: string; vivenciaId: string; donoId: string; descricao: string;
  quando: string; autorizacaoRegistrada: boolean; marcadaPor: string | null;
}
function FotosEmQueAparece({ personId, nome }: { personId: string; nome: string }) {
  const [fotos, setFotos] = useState<FotoEmQueAparece[]>([]);
  const [srcs, setSrcs] = useState<Record<string, string>>({});
  const [aberta, setAberta] = useState<{ f: FotoEmQueAparece; src: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    api<FotoEmQueAparece[]>(`/people/${personId}/aparece-em`).then(async (l) => {
      if (!vivo) return;
      setFotos(l);
      for (const f of l) {
        try {
          const a = await api<{ tipo: string; conteudo: string }>(
            `/people/${f.donoId}/memories/${f.vivenciaId}/photos/${f.fotoId}/miniatura`);
          if (vivo) setSrcs((x) => ({ ...x, [f.fotoId]: `data:${a.tipo};base64,${a.conteudo}` }));
        } catch { /* sem a miniatura, fica a frase */ }
      }
    }).catch(() => setFotos([]));
    return () => { vivo = false; };
  }, [personId]);
  async function abrir(f: FotoEmQueAparece) {
    try {
      const a = await api<{ tipo: string; conteudo: string }>(
        `/people/${f.donoId}/memories/${f.vivenciaId}/photos/${f.fotoId}`);
      setAberta({ f, src: `data:${a.tipo};base64,${a.conteudo}` });
    } catch { /* a foto que não abre não abre a folha */ }
  }
  if (!fotos.length) return null;
  return (
    <Secao titulo={`Fotos em que ${nome} aparece · ${fotos.length}`}>
      <div className="miniaturas">
        {fotos.map((f) => (
          <button key={f.marcaId} type="button" className="miniatura" onClick={() => abrir(f)}
                  aria-label={`Abrir a foto: ${f.descricao}`}>
            {srcs[f.fotoId] ? <img src={srcs[f.fotoId]} alt="" /> : <Icone nome="foto" />}
          </button>
        ))}
      </div>
      {aberta && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-aparece"
             onClick={(e) => { if (e.target === e.currentTarget) setAberta(null); }}>
          <div className="sheet modal">
            <h3 id="t-aparece">{dia(aberta.f.quando)}</h3>
            <p className="mutetxt">{aberta.f.descricao}</p>
            <img src={aberta.src} alt={aberta.f.descricao} style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
            <p className="mutetxt">
              Marcada por {aberta.f.marcadaPor ?? 'alguém da equipe'}.
              {!aberta.f.autorizacaoRegistrada && ' A autorização de imagem dela não está registrada nesta foto.'}
            </p>
            <button className="btn block" onClick={() => setAberta(null)}>Fechar</button>
          </div>
        </div>
      )}
    </Secao>
  );
}

/*
 * O DIA A DIA (fase 208 com o nome de Atendimentos; aba própria desde a 221).
 *
 * Tudo o que a casa registrou sobre esta criança num dia: a refeição, o
 * remédio, a chamada, a saída, a ocorrência. É a linha do tempo do dia no modo
 * de um acolhido, a mesma que o servidor já monta com o alcance de quem
 * pergunta, para CONSULTAR como na ATA. O dia de hoje se cuida no Dia e na
 * ATA; aqui se volta a ele e aos anteriores, para entender a semana dela.
 */
const TIPO_NO_DIA: Record<string, { rotulo: string; icone: string }> = {
  rotina: { rotulo: 'Rotina', icone: 'rotina' }, refeicao: { rotulo: 'Refeição', icone: 'refeicao' },
  atividade: { rotulo: 'Atividade', icone: 'atividade' }, saida: { rotulo: 'Saída', icone: 'saida' },
  medicamento: { rotulo: 'Remédio', icone: 'medicamento' }, chamada: { rotulo: 'Chamada', icone: 'chamada' },
  plantao: { rotulo: 'Plantão', icone: 'passagem' }, ocorrencia: { rotulo: 'Ocorrência', icone: 'ocorrencias' },
  saude: { rotulo: 'Saúde', icone: 'saude_ic' },
};
const TOM_DA_SEVERIDADE: Record<string, string> = { normal: 'c-mute', atencao: 'c-warn', critico: 'c-crit' };
function DiaADia({ houseId, personId, nome }: { houseId: string; personId: string; nome: string }) {
  const [data, setData] = useState('');
  const [hoje, setHoje] = useState('');
  const [dados, setDados] = useState<{ data: string; eventos: { id: string; at: string; kind: string; title: string;
    state: string; severity: string; responsible?: string | null }[] } | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    setErro('');
    api<NonNullable<typeof dados>>(`/timeline?houseId=${houseId}&date=${data}&mode=individual&personId=${personId}`)
      .then((r) => { if (!vivo) return; setDados(r); if (!data) setHoje(r.data); })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível abrir o dia.'); });
    return () => { vivo = false; };
  }, [houseId, personId, data]);
  const atual = data || dados?.data || '';
  const andar = (n: number) => {
    if (!atual) return;
    const d = new Date(`${atual}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
    setData(d.toISOString().slice(0, 10));
  };
  const eventos = [...(dados?.eventos ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <section className="passagem" id="perfil-dia-a-dia">
      <div className="eyebrow">O dia a dia de {nome}, como ficou registrado</div>
      <div className="card stack">
        <p className="mutetxt" style={{ margin: 0 }}>
          A refeição, o remédio, a chamada, as saídas e as ocorrências de um dia. Escolha o dia
          para ver o que a equipe registrou.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn sm ghost" aria-label="Dia anterior" onClick={() => andar(-1)}>
            <Icone nome="voltar" tamanho={16} />
          </button>
          <input type="date" className="grow" aria-label="O dia" value={atual} max={hoje || undefined}
                 style={{ textAlign: 'center' }} onChange={(e) => e.target.value && setData(e.target.value)} />
          <button type="button" className="btn sm ghost" aria-label="Dia seguinte"
                  disabled={!!hoje && atual >= hoje} onClick={() => andar(1)}>
            <Icone nome="avancar" tamanho={16} />
          </button>
        </div>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {dados && eventos.length === 0 && (
          <p className="mutetxt" style={{ margin: 0 }}>Nada registrado sobre {nome} neste dia.</p>
        )}
        <ol className="atendimentos">
          {eventos.map((e) => (
            <li key={e.id}>
              <span className="hora">{hhmm(e.at)}</span>
              <span className={`atend-tipo atend-${e.kind}`} aria-hidden="true">
                <Icone nome={TIPO_NO_DIA[e.kind]?.icone ?? 'ponto'} tamanho={16} />
              </span>
              <div className="grow">
                <b className="ff">{e.title}</b>
                <div className="mutetxt">
                  {TIPO_NO_DIA[e.kind]?.rotulo ?? e.kind}{e.responsible ? ` · ${e.responsible}` : ''}
                </div>
              </div>
              <span className={`pill ${TOM_DA_SEVERIDADE[e.severity] ?? 'c-mute'}`}>{e.state}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Secao({ titulo, id, children }: { titulo: string; id?: string; children: React.ReactNode }) {
  return (
    <section className="passagem" id={id}>
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
  /* A folha da foto abre ANTES de escolher (fase 194): é nela que estão a
     câmera do sistema, a galeria e o arquivo, e a confirmação logo abaixo. */
  const [pondoFoto, setPondoFoto] = useState(false);
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
      setPondoFoto(false);
      esquecerFoto({ acolhido: perfil.id });
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
        <button type="button" className="btn sm ghost" style={{ marginTop: 6 }}
                onClick={() => { setErro(''); setPondoFoto(true); }}>
          {ocupado ? 'Enviando…' : (src ? 'Trocar foto' : 'Pôr foto')}
        </button>
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
      {pondoFoto && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-foto-nova"
             onClick={(e) => { if (e.target === e.currentTarget) { setEscolhida(null); setPondoFoto(false); } }}>
          <div className="sheet modal" style={{ textAlign: 'left' }}>
            <h3 id="t-foto-nova">A foto de {perfil.nome}</h3>
            <EscolherAnexo id="foto-id" arquivo={escolhida} onEscolher={setEscolhida}
              aceita="image/jpeg,image/png" maximoMb={4}
              pergunta={<>Esta foto vai identificar a criança na tela e sai impressa na{' '}
                <b>folha da portaria</b>. É esta foto, e é <b>desta</b> criança?</>} />
            {erro && <div className="notice c-crit" role="alert">{erro}</div>}
            <div className="row rodape">
              <button className="btn sec grow" onClick={() => { setEscolhida(null); setPondoFoto(false); }}>Cancelar</button>
              <button className="btn grow" disabled={ocupado || !escolhida}
                      onClick={() => escolhida && void enviar(escolhida)}>
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
 * SAIR SEM ACOMPANHANTE — a decisão, o motivo, o prazo e as saídas pelo portão.
 *
 * Fica no perfil, junto dos contatos. Desde o pedido de 12/10 quem decide é a
 * equipe da casa: educador, líder, equipe técnica e coordenação (antes, só a
 * técnica e a coordenação). A portaria vê o que vale e quem decidiu, e nunca o
 * motivo, que é desta tela.
 */
interface SaidaPeloPortao {
  id: string; saiuEm: string; sozinho: boolean; comQuem: string | null; destino: string | null;
  voltaPrevista: string | null; voltouEm: string | null; quemSaida: string | null;
  quemVolta: string | null; notaSaida: string | null; notaVolta: string | null;
}
const DECIDE_SAIDA = ['educador', 'lider_diurno', 'lider_noturno_geral', 'equipe_tecnica', 'coordenador'];
const hhmmDe = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const diaDe = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

function SairSozinho({ perfil, papel, onMudou }: {
  perfil: Perfil; papel: string; onMudou: () => void;
}) {
  const [dados, setDados] = useState<{ vigente: any; historico: any[] } | null>(null);
  const [saidas, setSaidas] = useState<SaidaPeloPortao[]>([]);
  const [decidindo, setDecidindo] = useState(false);
  const [status, setStatus] = useState('liberada');
  const [motivo, setMotivo] = useState('');
  const [ate, setAte] = useState('');
  const [onde, setOnde] = useState('');
  const [erro, setErro] = useState('');
  const podeDecidir = DECIDE_SAIDA.includes(papel);

  const carregar = useCallback(async () => {
    try { setDados(await api(`/people/${perfil.id}/outing-permission`)); }
    catch { setDados(null); }
    try { setSaidas(await api<SaidaPeloPortao[]>(`/people/${perfil.id}/saidas`)); }
    catch { setSaidas([]); }
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
  const fora = saidas.find((x) => !x.voltouEm);
  return (
    <>
      <div className="eyebrow">Sair sem acompanhante</div>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      {!v && (
        <p className="mutetxt">
          Ainda não há decisão registrada. Até alguém da equipe decidir, {perfil.nome} só sai
          com acompanhante.
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
          {v.onde && <div className="mutetxt">Pode ir a: {v.onde.replace(/\.$/, '')}.</div>}
          <div className="mutetxt">Decidido por {v.quem}. A portaria vê o que vale e quem decidiu, sem o motivo.</div>
          {v.ate && (
            <div className={v.aRevisar ? 'notice c-warn' : 'mutetxt'} role="status">
              {v.status === 'suspensa' ? 'Vale até' : 'Revisar em'} {new Date(v.ate).toLocaleDateString('pt-BR')}.
              {v.aRevisar && ' O prazo chegou: continua valendo até alguém da equipe decidir de novo.'}
            </div>
          )}
        </div>
      )}

      {fora && (
        <div className="notice c-info" role="status">
          Saiu às {hhmmDe(fora.saiuEm)}{fora.sozinho ? ' sem acompanhante' : fora.comQuem ? `, com ${fora.comQuem}` : ''}
          {fora.destino ? `, para ${fora.destino}` : ''}
          {fora.voltaPrevista ? `. Combinou voltar às ${hhmmDe(fora.voltaPrevista)}` : ''}.
        </div>
      )}

      {podeDecidir && !decidindo && (
        <button className="btn sec block" style={{ marginBottom: 12 }}
                onClick={() => { setStatus(v?.status === 'liberada' ? 'suspensa' : 'liberada'); setDecidindo(true); }}>
          <Icone nome="portaria" /> Mudar o que vale para sair
        </button>
      )}

      {decidindo && (
        <div className="card stack">
          <label className="f" htmlFor="ss-st">O que vale a partir de agora</label>
          <select id="ss-st" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="liberada">Pode sair sem acompanhante</option>
            <option value="acompanhada">Só sai com acompanhante</option>
            <option value="suspensa">Não pode sair sem acompanhante, por um tempo</option>
          </select>

          <label className="f" htmlFor="ss-mot">Por quê</label>
          <textarea id="ss-mot" rows={2} value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder={status === 'liberada'
                      ? 'Ex.: vai e volta da escola desde março, sem intercorrência.'
                      : 'Ex.: combinado com ele depois da conversa de hoje.'} />
          <div className="mutetxt">O motivo fica com a equipe. A portaria não vê.</div>

          {status !== 'liberada' && (
            <>
              <label className="f" htmlFor="ss-ate">
                {status === 'suspensa' ? 'Até quando' : 'Revisar em (opcional)'}
              </label>
              <input id="ss-ate" type="date" value={ate}
                     onChange={(e) => setAte(e.target.value)} />
              {status === 'suspensa' && (
                <div className="mutetxt">
                  No dia marcado a equipe revisa e decide de novo. A autorização não volta sozinha.
                </div>
              )}
            </>
          )}

          {status === 'liberada' && (
            <>
              <label className="f" htmlFor="ss-onde">Aonde pode ir (opcional)</label>
              <input id="ss-onde" value={onde} maxLength={120}
                     onChange={(e) => setOnde(e.target.value)}
                     placeholder="Ex.: escola e curso." />
            </>
          )}

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
                {'. '}{h.motivo} <span className="mutetxt">({h.quem})</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {saidas.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary className="mutetxt">Saídas pelo portão · {saidas.length}</summary>
          <ul className="lista-seca">
            {saidas.map((x) => (
              <li key={x.id}>
                <b>{diaDe(x.saiuEm)}</b>, saiu às {hhmmDe(x.saiuEm)}
                {x.sozinho ? ' sem acompanhante' : x.comQuem ? ` com ${x.comQuem}` : ''}
                {x.destino ? `, para ${x.destino}` : ''}
                {x.voltouEm ? `, voltou às ${hhmmDe(x.voltouEm)}` : ', ainda fora'}.
                <span className="mutetxt"> Registrou {x.quemSaida ?? 'a portaria'}
                  {x.quemVolta ? `; a volta, ${x.quemVolta}` : ''}.</span>
                {x.notaVolta && <div className="mutetxt">{x.notaVolta}</div>}
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
  /* Corrigir o contato, com o antes guardado (fase 215). */
  const [corrigindo, setCorrigindo] = useState<Contato | null>(null);
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
          <div key={c.id} className="card contato-cartao">
            <div className="row contato-cabeca">
              <Avatar nome={c.nome} de={{ contato: c.id }} temFoto={c.temFoto} tamanho={48} />
              <div className="grow">
                <b className="ff">{c.nome}</b>
                {c.telefone && <div className="mutetxt">{c.telefone}</div>}
              </div>
              <span className="pill c-info">{c.vinculoRotulo}</span>
            </div>
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
                <button className="btn sm ghost" onClick={() => setCorrigindo(c)}
                        aria-label={`Corrigir o contato ${c.nome}`}>
                  Corrigir
                </button>
                <button className="btn sm ghost" onClick={() => setEncerrando(c)}>
                  Este contato não vale mais
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {podeEscrever && (
        <button data-acolhe-abre="" className="btn sec block" style={{ marginBottom: 12 }} onClick={() => setNovo(true)}>
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

      {corrigindo && (
        <FolhaCorrigirContato
          contato={corrigindo}
          onFechar={() => setCorrigindo(null)}
          onSalvar={async (d) => {
            await api(`/people/contacts/${corrigindo.id}/corrigir`, {
              method: 'POST', body: JSON.stringify(d),
            });
            setCorrigindo(null); onMudou();
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
  /* Fase 160: com que nome a pessoa é chamada, o RG, e até quando vale. */
  const [nomeSocial, setNomeSocial] = useState(contato.nomeSocial ?? '');
  const [rg, setRg] = useState(/•/.test(contato.rg ?? '') ? '' : (contato.rg ?? ''));
  const [validoDe, setValidoDe] = useState(contato.visita?.validoDe ?? '');
  const [validoAte, setValidoAte] = useState(contato.visita?.validoAte ?? '');
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
        body: JSON.stringify({ autorizado, cpf, dias, de, ate, observacao: obsVisita, motivo,
                               rg, nomeSocial, validoDe, validoAte }),
      });
      if (foto) {
        await api(`/people/contacts/${contato.id}/photo`, {
          method: 'POST', body: JSON.stringify({ conteudo: foto.dataUrl }),
        });
        esquecerFoto({ contato: contato.id });
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

        <label className="f" htmlFor="vis-rg">RG <small>— opcional</small></label>
        <input id="vis-rg" value={rg} maxLength={20} onChange={(e) => setRg(e.target.value)} />

        <label className="f" htmlFor="vis-social">
          Nome social <small>— como a pessoa é chamada; a portaria vê este primeiro</small>
        </label>
        <input id="vis-social" value={nomeSocial} maxLength={120}
               onChange={(e) => setNomeSocial(e.target.value)} />

        {/* A VALIDADE (fase 160): a autorização provisória, a que vale até a
            próxima audiência. Fora dela, o portão recusa — e a exceção é da
            coordenação, da técnica ou do líder. Em branco, vale sem prazo. */}
        <div className="row">
          <span className="grow">
            <label className="f" htmlFor="vis-valde">Autorização vale de <small>— opcional</small></label>
            <input id="vis-valde" type="date" value={validoDe} onChange={(e) => setValidoDe(e.target.value)} />
          </span>
          <span className="grow">
            <label className="f" htmlFor="vis-valate">até</label>
            <input id="vis-valate" type="date" value={validoAte} onChange={(e) => setValidoAte(e.target.value)} />
          </span>
        </div>

        <label className="f" htmlFor="vis-foto-arquivo">
          Foto 3×4 <small>— opcional; sem ela a portaria pede documento com foto</small>
        </label>
        {/* A prévia, pelo mesmo motivo da foto da criança: esta imagem vai
            IMPRESSA na folha da guarita, ao lado do nome de um familiar. A
            foto errada aqui é a pessoa errada entrando — ou a certa ficando
            do lado de fora. A câmera do sistema tira na hora (fase 194). */}
        <EscolherAnexo id="vis-foto" arquivo={foto} onEscolher={setFoto} aceita="image/jpeg,image/png" maximoMb={4}
          pergunta={<>Esta foto sai impressa na <b>folha da portaria</b>, ao lado do nome de{' '}
            {contato.nome}. É esta pessoa?</>} />

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

/**
 * CORRIGIR UM CONTATO (fase 215, pedido de 14/10).
 *
 * O telefone que mudou, o vínculo escrito errado, o CPF que chegou depois. A
 * folha vem preenchida com o que consta, pede o motivo e mostra, embaixo, o
 * que já foi corrigido antes. A aproximação restrita não se corrige aqui.
 */
function FolhaCorrigirContato({ contato, onFechar, onSalvar }: {
  contato: Contato; onFechar: () => void;
  onSalvar: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [vocab, setVocab] = useState<{ vinculos: { code: string; label: string }[] } | null>(null);
  const [dados, setDados] = useState({
    nome: contato.nome, vinculo: contato.vinculo,
    vinculoOutro: contato.vinculo === 'outro' ? contato.vinculoRotulo : '',
    telefone: contato.telefone ?? '', observacao: contato.observacao ?? '',
    cpf: contato.cpf && !contato.cpf.includes('*') ? contato.cpf : '',
  });
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [historico, setHistorico] = useState<{ antes: Record<string, unknown>; depois: Record<string, unknown>;
    motivo: string; em: string; por: string | null }[]>([]);

  useEffect(() => {
    api<{ vinculos: { code: string; label: string }[] }>('/people/contacts/kinds')
      .then(setVocab).catch(() => setVocab(null));
    api<typeof historico>(`/people/contacts/${contato.id}/correcoes`).then(setHistorico).catch(() => setHistorico([]));
  }, [contato.id]);

  const ROTULO: Record<string, string> = { name: 'nome', bond: 'vínculo', bond_other: 'vínculo escrito',
    phone: 'telefone', note: 'observação', cpf: 'CPF' };
  const pode = dados.nome.trim().length >= 2 && motivo.trim().length >= 5
    && (dados.vinculo !== 'outro' || dados.vinculoOutro.trim().length >= 2) && !ocupado;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-corr-cont"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-corr-cont">Corrigir o contato {contato.nome}</h3>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <label className="f" htmlFor="cc-nome">Nome</label>
        <input id="cc-nome" className="field" value={dados.nome}
               onChange={(e) => setDados({ ...dados, nome: e.target.value })} />
        <label className="f" htmlFor="cc-vinc">Vínculo</label>
        <select id="cc-vinc" className="field" value={dados.vinculo}
                onChange={(e) => setDados({ ...dados, vinculo: e.target.value })}>
          {(vocab?.vinculos ?? [{ code: contato.vinculo, label: contato.vinculoRotulo }])
            .map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}
        </select>
        {dados.vinculo === 'outro' && (
          <>
            <label className="f" htmlFor="cc-outro">Qual é o vínculo</label>
            <input id="cc-outro" className="field" value={dados.vinculoOutro}
                   onChange={(e) => setDados({ ...dados, vinculoOutro: e.target.value })} />
          </>
        )}
        <label className="f" htmlFor="cc-tel">Telefone</label>
        <input id="cc-tel" className="field" inputMode="tel" value={dados.telefone}
               onChange={(e) => setDados({ ...dados, telefone: e.target.value })} />
        <label className="f" htmlFor="cc-cpf">CPF</label>
        <input id="cc-cpf" className="field" inputMode="numeric" value={dados.cpf} placeholder="Opcional"
               onChange={(e) => setDados({ ...dados, cpf: e.target.value })} />
        <label className="f" htmlFor="cc-obs">Observação</label>
        <textarea id="cc-obs" rows={2} value={dados.observacao}
                  onChange={(e) => setDados({ ...dados, observacao: e.target.value })} />
        <label className="f" htmlFor="cc-motivo">Por que está corrigindo</label>
        <input id="cc-motivo" className="field" value={motivo} placeholder="Ex.: a mãe trocou de número"
               onChange={(e) => setMotivo(e.target.value)} />
        <p className="mutetxt">O que constava antes fica guardado, com o seu nome e o motivo.</p>
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={async () => {
            setErro(''); setOcupado(true);
            try {
              await onSalvar({ nome: dados.nome, vinculo: dados.vinculo, vinculoOutro: dados.vinculoOutro,
                telefone: dados.telefone, observacao: dados.observacao,
                ...(dados.cpf.trim() || !contato.cpf ? { cpf: dados.cpf } : {}), motivo });
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível corrigir o contato.');
            } finally { setOcupado(false); }
          }}>Guardar a correção</button>
        </div>
        {historico.length > 0 && (
          <>
            <div className="eyebrow" style={{ marginTop: 14 }}>Correções anteriores</div>
            <ul className="lista">
              {historico.map((h, i) => (
                <li key={i}>
                  <div>
                    {Object.keys(h.depois).map((k) => (
                      <span key={k}>{ROTULO[k] ?? k}: <s>{String(h.antes[k] ?? 'vazio')}</s> → {String(h.depois[k] ?? 'vazio')}. </span>
                    ))}
                  </div>
                  <div className="mutetxt">{h.motivo} · {h.por ?? 'equipe'} · {new Date(h.em).toLocaleDateString('pt-BR')}</div>
                </li>
              ))}
            </ul>
          </>
        )}
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
        <button data-acolhe-abre="" className="btn sec block" style={{ marginBottom: 12 }}
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
        <EscolherAnexo id="cp-comprovante" arquivo={arquivo} onEscolher={setArquivo}
          pergunta={<>É este o comprovante? Ele fica na trajetória da criança — é{' '}
            <b>o documento que ela leva</b> quando sair daqui.</>} />

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
            <button data-acolhe-abre="" className="btn sec sm" onClick={() => setRelatando(f.id)}>
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
/**
 * AS VISITAS DELA (fase 160) — no perfil, e SÓ no perfil.
 *
 * Decisão de 26/09: a contagem de uma criança mora aqui e em nenhum outro lugar
 * — nunca ao lado da de outra criança. Os visitantes saem por NOME, com o
 * número ao lado, em ordem alfabética: mostra quem vem sem montar um ranking da
 * família. E a frase de baixo não é enfeite: quantidade de visitas não é
 * avaliação de ninguém.
 */
function VisitasDoAcolhido({ personId }: { personId: string }) {
  const [dados, setDados] = useState<{
    periodo: { de: string; ate: string };
    contagem: { noPeriodo: number; noMes: number; noSemestre: number; noAno: number; total: number };
    visitantes: { nome: string; vinculo: string; visitas: number; minutos: number; contatoId?: string; temFoto?: boolean }[];
    visitas: { id: string; visitante: string; vinculoRotulo: string; entrouEm: string;
               saiuEm: string | null; minutos: number | null; entradaPor: string | null;
               excecao: string | null; corrigida: boolean; aberta: boolean;
               correcoes?: { antes: { entrouEm: string; saiuEm: string | null };
                             depois: { entrouEm: string; saiuEm: string | null };
                             motivo: string; por: string | null; em: string }[] }[];
    aviso: string;
  } | null>(null);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [todas, setTodas] = useState(false);
  const [finalidade, setFinalidade] = useState('');
  const [exportando, setExportando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let vivo = true;
    const q = [de && `de=${de}`, ate && `ate=${ate}`].filter(Boolean).join('&');
    api<NonNullable<typeof dados>>(`/people/${personId}/visitas${q ? `?${q}` : ''}`)
      .then((d) => { if (vivo) setDados(d); })
      .catch(() => { if (vivo) setDados(null); });
    return () => { vivo = false; };
  }, [personId, de, ate]);

  if (!dados) return null;
  const tempo = (min: number) => {
    if (!min) return '0 min';
    const h = Math.floor(min / 60); const m = min % 60;
    return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
  };
  const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const mostradas = todas ? dados.visitas : dados.visitas.slice(0, 5);

  async function exportar() {
    setMsg(''); setExportando(true);
    try {
      const r = await api<{ nomeArquivo: string; conteudoBase64: string; aviso: string }>(
        `/people/${personId}/visitas/export`, {
          method: 'POST',
          body: JSON.stringify({ de: dados!.periodo.de, ate: dados!.periodo.ate, finalidade: finalidade.trim() }),
        });
      entregarArquivo(r.nomeArquivo, r.conteudoBase64);
      setMsg(r.aviso); setFinalidade('');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Não foi possível gerar o relatório.'); }
    finally { setExportando(false); }
  }

  return (
    <Secao titulo="Visitas">
      <div className="row">
        <span className="grow">
          <label className="f" htmlFor="visp-de">De</label>
          <input id="visp-de" type="date" value={de || dados.periodo.de} onChange={(e) => setDe(e.target.value)} />
        </span>
        <span className="grow">
          <label className="f" htmlFor="visp-ate">Até</label>
          <input id="visp-ate" type="date" value={ate || dados.periodo.ate} onChange={(e) => setAte(e.target.value)} />
        </span>
      </div>
      <p>
        <b>{dados.contagem.noPeriodo}</b> {dados.contagem.noPeriodo === 1 ? 'visita' : 'visitas'} no período
        <span className="mutetxt"> · no mês: {dados.contagem.noMes} · no semestre: {dados.contagem.noSemestre}
          {' '}· no ano: {dados.contagem.noAno} · desde o início: {dados.contagem.total}</span>
      </p>
      {dados.visitantes.length > 0 && (
        <>
          <div className="eyebrow">Quem visitou, por nome</div>
          <ul className="lista visitantes">
            {dados.visitantes.map((v) => (
              <li key={`${v.nome}|${v.vinculo}`}>
                <Avatar nome={v.nome} de={v.contatoId ? { contato: v.contatoId } : undefined}
                        temFoto={v.temFoto} tamanho={38} />
                <span className="grow">{v.nome} <span className="mutetxt">({v.vinculo})</span></span>
                <span className="mutetxt">{v.visitas} {v.visitas === 1 ? 'visita' : 'visitas'} · {tempo(v.minutos)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {mostradas.length > 0 && (
        <>
          <div className="eyebrow">As visitas, da mais recente</div>
          <ul className="lista">
            {mostradas.map((v) => (
              <li key={v.id}>
                <div className="grow">
                  <b>{v.visitante}</b> <span className="mutetxt">({v.vinculoRotulo})</span>
                  <div className="mutetxt linhadois">
                    {quando(v.entrouEm)}
                    {v.aberta ? ' — na casa agora' : ` — ${v.saiuEm ? quando(v.saiuEm) : ''} (${tempo(v.minutos ?? 0)})`}
                    {v.entradaPor ? ` · registrou: ${v.entradaPor}` : ''}
                    {v.corrigida ? ' · horário corrigido, com motivo' : ''}
                  </div>
                  {v.excecao && <div className="mutetxt">Entrada por exceção: {v.excecao}</div>}
                  {/* O histórico da correção (fase 179): o que constava antes, quem
                      corrigiu, quando e por quê. A tela prometia e não mostrava. */}
                  {(v.correcoes ?? []).map((k, i) => (
                    <div key={i} className="mutetxt">
                      Corrigida em {quando(k.em)}{k.por ? ` por ${k.por}` : ''}. Constava:{' '}
                      {quando(k.antes.entrouEm)}{k.antes.saiuEm ? ` — ${quando(k.antes.saiuEm)}` : ', sem saída'}.
                      Motivo: {k.motivo}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {dados.visitas.length > 5 && !todas && (
            <button className="btn sm ghost" onClick={() => setTodas(true)}>
              Ver as {dados.visitas.length} visitas do período
            </button>
          )}
        </>
      )}
      <p className="mutetxt">{dados.aviso}</p>
      <label className="f" htmlFor="visp-fin">
        Relatório de visitas em Word <small>(para quê; fica registrado)</small>
      </label>
      <input id="visp-fin" value={finalidade} onChange={(e) => setFinalidade(e.target.value)}
             placeholder="Ex.: relatório para a audiência concentrada" />
      <button className="btn sec block" disabled={finalidade.trim().length < 10 || exportando}
              onClick={exportar}>
        Gerar o relatório de visitas do período
      </button>
      {msg && <div className="mutetxt" role="status">{msg}</div>}
    </Secao>
  );
}

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
        Ofícios redigidos sobre esta criança. A entrega é feita pelo canal de costume da
        instituição, e fica registrada aqui com o nome de quem entregou.
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
    api<typeof dados>(`/checks/person/${personId}?dias=30`)
      .then((d) => { if (vivo) setDados(d); })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : ''); });
    return () => { vivo = false; };
  }, [personId]);

  if (erro) return null;
  const linhas = dados?.linhas ?? [];

  return (
    <>
      {/* As chamadas em números (fase 221): a refeição, a escola, o banho e o resto
          que a chamada da casa registra, só desta criança e só dela. */}
      {dados && linhas.length > 0 && (
        <Contas titulo={`As chamadas de ${nome} nos últimos ${dados.dias} dias`} itens={[
          { n: linhas.length, rotulo: 'registros nas chamadas' },
          { n: linhas.filter((l) => l.excecao).length, rotulo: 'com exceção, com o motivo escrito' },
          { n: linhas.filter((l) => l.tipo === 'alimentacao' && l.excecao).length, rotulo: 'refeições com exceção' },
          { n: linhas.filter((l) => l.correcoes.length).length, rotulo: 'corrigidos depois' },
        ]} />
      )}
      <div className="eyebrow">Presença nas chamadas · últimos {dados?.dias ?? 30} dias</div>
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
            <button data-acolhe-abre="" className="btn sm ghost" onClick={() => setEditando(true)}>
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
            <button data-acolhe-abre="" className="btn sec block" style={{ marginBottom: 12 }}
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
            <button data-acolhe-abre="" className="btn sec block" style={{ marginBottom: 12 }}
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
          Abrir esta lista também fica registrado. Ela mostra o que foi feito com o registro
          desta criança, e não o trabalho de cada colega.
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

/** Quem registra alergia, condição e restrição (fase 166): o mesmo que o banco. */
const ESCREVE_SAUDE = ['enfermagem', 'equipe_tecnica', 'coordenador', 'gestor_geral'];

function FolhaRegistroDeSaude({ qual, onFechar, onSalvar }: {
  qual: 'condicao' | 'restricao'; onFechar: () => void;
  onSalvar: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [d, setD] = useState({ tipo: 'alergia', descricao: '', gravidade: '', alertaEssencial: false,
    restricao: '', substituicao: '', orientacao: '' });
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const pronto = qual === 'condicao' ? d.descricao.trim().length >= 3 : d.restricao.trim().length >= 2;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-saude-reg"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-saude-reg">{qual === 'condicao' ? 'Alergia ou condição de saúde' : 'Restrição alimentar'}</h3>
        {qual === 'condicao' ? (
          <>
            <label className="f" htmlFor="sr-tipo">O que é</label>
            <select id="sr-tipo" value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value })}>
              <option value="alergia">Alergia</option>
              <option value="intolerancia">Intolerância</option>
              <option value="condicao">Outra condição de saúde</option>
            </select>
            <label className="f" htmlFor="sr-desc">{d.tipo === 'condicao' ? 'Qual condição' : 'A quê'}</label>
            <input id="sr-desc" className="field" value={d.descricao}
                   onChange={(e) => setD({ ...d, descricao: e.target.value })}
                   placeholder={d.tipo === 'condicao' ? 'Ex.: asma' : 'Ex.: dipirona'} />
            <label className="f" htmlFor="sr-grav">Gravidade</label>
            <select id="sr-grav" value={d.gravidade} onChange={(e) => setD({ ...d, gravidade: e.target.value })}>
              <option value="">Não informada</option>
              <option value="leve">Leve</option>
              <option value="moderada">Moderada</option>
              <option value="grave">Grave</option>
            </select>
            <label className="f">
              <input id="sr-alerta" type="checkbox" checked={d.alertaEssencial}
                     onChange={(e) => setD({ ...d, alertaEssencial: e.target.checked })} />
              {' '}Alerta essencial <small>(aparece no alto do perfil, na chamada e no resumo de saúde)</small>
            </label>
          </>
        ) : (
          <>
            <label className="f" htmlFor="sr-rest">O que não pode ser servido</label>
            <input id="sr-rest" className="field" value={d.restricao}
                   onChange={(e) => setD({ ...d, restricao: e.target.value })} placeholder="Ex.: leite e derivados" />
            <label className="f" htmlFor="sr-subs">O que servir no lugar</label>
            <input id="sr-subs" className="field" value={d.substituicao}
                   onChange={(e) => setD({ ...d, substituicao: e.target.value })} placeholder="Ex.: bebida vegetal" />
            <label className="f" htmlFor="sr-ori">Orientação para a cozinha</label>
            <input id="sr-ori" className="field" value={d.orientacao}
                   onChange={(e) => setD({ ...d, orientacao: e.target.value })} />
            <p className="mutetxt">A folha da cozinha mostra a restrição e a substituição, e nunca o motivo clínico.</p>
          </>
        )}
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pronto || ocupado} onClick={async () => {
            setErro(''); setOcupado(true);
            try {
              await onSalvar(qual === 'condicao'
                ? { tipo: d.tipo, descricao: d.descricao.trim(), gravidade: d.gravidade || undefined,
                    alertaEssencial: d.alertaEssencial }
                : { restricao: d.restricao.trim(), substituicao: d.substituicao.trim() || undefined,
                    orientacao: d.orientacao.trim() || undefined });
            } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível registrar.'); }
            finally { setOcupado(false); }
          }}>Registrar</button>
        </div>
      </div>
    </div>
  );
}

function FolhaEncerrarSaude({ nome, onFechar, onEncerrar }: {
  nome: string; onFechar: () => void; onEncerrar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-saude-fim"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-saude-fim">Encerrar: {nome}</h3>
        <p className="mutetxt">O registro sai do perfil e continua no histórico, com o motivo e o seu nome.</p>
        <label className="f" htmlFor="sf-motivo">Por que deixou de valer</label>
        <input id="sf-motivo" className="field" value={motivo} onChange={(e) => setMotivo(e.target.value)}
               placeholder="Ex.: exame novo descartou a alergia" />
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={motivo.trim().length < 5} onClick={async () => {
            try { await onEncerrar(motivo.trim()); }
            catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível encerrar.'); }
          }}>Encerrar</button>
        </div>
      </div>
    </div>
  );
}

/**
 * A CHEGADA DE NOITE (decisão de 28/09).
 *
 * O Conselho Tutelar chega às 23h40 com uma criança, e a técnica só vem de
 * manhã. O plantão escreve o mínimo, e a criança entra na chamada, na janta e
 * na ATA agora; a técnica é avisada e completa o cadastro. Quatro campos, porque
 * quem preenche está com uma criança assustada ao lado.
 */
function FolhaChegada({ houseId, onFechar, onRegistrou }: {
  houseId: string; onFechar: () => void; onRegistrou: (aviso: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [idade, setIdade] = useState('');
  const [trazidaPor, setTrazidaPor] = useState('');
  const [comoChegou, setComoChegou] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function registrar() {
    setErro(''); setOcupado(true);
    try {
      const r = await api<{ aviso: string }>('/people/chegada', {
        method: 'POST',
        body: JSON.stringify({ houseId, nome, idadeAproximada: idade === '' ? null : Number(idade),
                               trazidaPor, chegada: comoChegou }),
      });
      onRegistrou(r.aviso);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar a chegada.');
    } finally { setOcupado(false); }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-chegada"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-chegada">Chegou uma criança agora</h3>
        <p className="mutetxt">
          Escreva só o que você sabe agora. Ela entra na chamada e na ATA deste turno, e a
          equipe técnica completa o cadastro de manhã.
        </p>
        <label className="f" htmlFor="chegada-nome">Nome, como ela se apresentou</label>
        <input id="chegada-nome" className="field" value={nome} maxLength={120}
               onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pedro, disse que o sobrenome é Silva" />
        <label className="f" htmlFor="chegada-idade">Idade aproximada, em anos</label>
        <input id="chegada-idade" className="field" type="number" inputMode="numeric" min={0} max={21}
               value={idade} onChange={(e) => setIdade(e.target.value)} placeholder="Pode ser um palpite" />
        <label className="f" htmlFor="chegada-quem">Quem trouxe</label>
        <input id="chegada-quem" className="field" value={trazidaPor} maxLength={200}
               onChange={(e) => setTrazidaPor(e.target.value)}
               placeholder="Ex.: Conselho Tutelar, conselheira Márcia, plantão da zona norte" />
        <label className="f" htmlFor="chegada-como">Como chegou <small>(opcional)</small></label>
        <textarea id="chegada-como" rows={3} value={comoChegou}
                  onChange={(e) => setComoChegou(e.target.value)}
                  placeholder="O que você observou. Ex.: chegou com a roupa do corpo, com fome, e dormiu logo." />
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={ocupado} onClick={registrar}>
            {ocupado ? 'Registrando…' : 'Registrar a chegada'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * OS REMÉDIOS DELA E AS RECEITAS (fase 217, pedido de 14/10).
 *
 * A receita sempre teve lugar, presa ao esquema na tela da Saúde, e espelhada
 * no dossiê. No perfil, quem cuida da saúde não via de qual remédio ela era.
 * Aqui ficam os esquemas desta criança, cada um com as receitas e bulas, e o
 * anexar é o mesmo da Saúde. O educador não vê: a receita traz o que não muda
 * o que ele faz no plantão, como na tela da Saúde.
 */
function RemediosEReceitas({ personId, houseId, papel }: { personId: string; houseId: string; papel: string }) {
  const [esquemas, setEsquemas] = useState<{ id: string; medicamento: string; dose: string;
    rotulo: string; acolhido: { id: string } }[] | null>(null);
  const [receitasDe, setReceitasDe] = useState<{ id: string; medicamento: string } | null>(null);
  useEffect(() => {
    api<{ esquemas: any[] }>(`/medications/prescriptions?houseId=${houseId}`)
      .then((r) => setEsquemas(r.esquemas.filter((e) => e.acolhido?.id === personId)))
      .catch(() => setEsquemas([]));
  }, [personId, houseId]);
  if (!esquemas) return null;
  return (
    <div className="remedios-e-receitas" style={{ marginTop: 14 }}>
      <div className="eyebrow">Remédios e receitas</div>
      {esquemas.length === 0 && <p className="mutetxt">Nenhum remédio em uso registrado.</p>}
      <ul className="lista">
        {esquemas.map((e) => (
          <li key={e.id} className="row">
            <span className="grow">
              <b className="ff">{e.medicamento}</b>
              <span className="mutetxt linhadois">{e.dose} · {e.rotulo}</span>
            </span>
            <button data-acolhe-entra="" className="btn sm sec" aria-label={`Receitas de ${e.medicamento}`}
                    onClick={() => setReceitasDe(e)}>Receitas</button>
          </li>
        ))}
      </ul>
      {receitasDe && <FolhaReceitas esquema={receitasDe} papel={papel} onFechar={() => setReceitasDe(null)} />}
    </div>
  );
}

/**
 * OS ATENDIMENTOS DA EQUIPE TÉCNICA (fase 218, pedido de 14/10).
 *
 * A psicóloga, a psicopedagoga, a assistente social registram o atendimento da
 * criança: a área, o dia, o que foi trabalhado, e os arquivos (o desenho
 * fotografado, a folha da atividade, o relatório digitalizado). Fica no perfil,
 * para a equipe técnica e a coordenação, e entra como fonte do acompanhamento.
 */
interface AtendimentoTecnico {
  id: string; area: string; areaRotulo: string; dia: string; relato: string; por: string;
  anexos: { id: string; nome: string; tipo: string; tamanho: number; legenda: string | null }[];
}
function AtendimentosDaEquipeTecnica({ personId, nome, papel }: { personId: string; nome: string; papel: string }) {
  const [lista, setLista] = useState<AtendimentoTecnico[] | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [vendo, setVendo] = useState<{ id: string; nome: string } | null>(null);
  /** O filtro por área: a psicopedagoga lê os dela sem perder os outros de vista. */
  const [area, setArea] = useState('');
  const carregar = useCallback(async () => {
    try { setLista(await api<AtendimentoTecnico[]>(`/people/${personId}/technical-sessions`)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir os atendimentos.'); }
  }, [personId]);
  useEffect(() => { void carregar(); }, [carregar]);

  /* O relatório é LINEAR: o mais novo em cima, e quem lê desce no tempo. O
     servidor já devolve nesta ordem; a tela garante, porque é o contrato. */
  const todos = [...(lista ?? [])].sort((a, b) => b.dia.localeCompare(a.dia));
  const mostrados = area ? todos.filter((a) => a.area === area) : todos;
  const hoje = hojeISO();
  const ultimo = todos[0];
  const desdeUltimo = ultimo
    ? Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${ultimo.dia}T12:00:00Z`)) / 86_400_000) : null;
  const porArea = AREAS_DO_ATENDIMENTO
    .map((a) => ({ ...a, n: todos.filter((x) => x.area === a.cod).length }))
    .filter((a) => a.n > 0);
  const noMes = todos.filter((a) => a.dia.slice(0, 7) === hoje.slice(0, 7)).length;
  const comArquivo = todos.reduce((t, a) => t + a.anexos.length, 0);
  /* Os meses em bloco: "outubro de 2026" separa o relatório como o caderno separava. */
  const mesDe = (d: string) => {
    const m = new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return m.charAt(0).toUpperCase() + m.slice(1);
  };

  return (
    <section className="atendimentos-tecnicos" aria-label="Atendimentos da equipe técnica" id="perfil-atendimentos">
      {lista && lista.length > 0 && (
        <Contas titulo={`Os atendimentos de ${nome} em números`} itens={[
          { n: todos.length, rotulo: 'atendimentos registrados' },
          { n: noMes, rotulo: 'neste mês' },
          { n: desdeUltimo == null ? '' : desdeUltimo === 0 ? 'Hoje' : duracao(desdeUltimo), rotulo: 'desde o último atendimento' },
          { n: comArquivo, rotulo: 'arquivos anexados' },
          ...porArea.map((a) => ({ n: a.n, rotulo: a.label.toLowerCase() })),
        ]} />
      )}
      <div className="eyebrow">O relatório dos atendimentos, o mais recente em cima</div>
      <div className="card stack">
        <p className="mutetxt" style={{ margin: 0 }}>
          Psicologia, psicopedagogia, serviço social e pedagogia. Cada atendimento entra aqui com
          o dia, a área e o que foi trabalhado. Leem a equipe técnica, a coordenação e a gestão, e
          cada arquivo aberto fica registrado.
        </p>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {aviso && <div className="notice c-ok" role="status">{aviso}</div>}
        {QUEM_REGISTRA_ATENDIMENTO.includes(papel) && (
          <button data-acolhe-abre="" className="btn block" onClick={() => setRegistrando(true)}>
            <Icone nome="escrever" /> Registrar atendimento da equipe técnica
          </button>
        )}
        {porArea.length > 1 && (
          <div className="opts" role="group" aria-label="Mostrar os atendimentos de">
            <button type="button" className="opt c-other" aria-pressed={!area} onClick={() => setArea('')}>
              Todas as áreas
            </button>
            {porArea.map((a) => (
              <button key={a.cod} type="button" className="opt c-other" aria-pressed={area === a.cod}
                      onClick={() => setArea(area === a.cod ? '' : a.cod)}>
                {a.label} · {a.n}
              </button>
            ))}
          </div>
        )}
        {lista && lista.length === 0 && (
          <p className="mutetxt" style={{ margin: 0 }}>Nenhum atendimento da equipe técnica registrado com {nome} ainda.</p>
        )}
        <ol className="relatorio-tecnico">
          {mostrados.map((a, i) => (
            <li key={a.id}>
              {(i === 0 || mesDe(mostrados[i - 1].dia) !== mesDe(a.dia)) && (
                <div className="relatorio-mes">{mesDe(a.dia)}</div>
              )}
              <article className={`relatorio-item area-${a.area}`}>
                <span className="oc-quando">
                  <b>{dia(a.dia).slice(0, 5)}</b>
                  <span>{a.dia.slice(0, 4)}</span>
                </span>
                <div className="grow">
                  <b className="ff">{a.areaRotulo}</b>
                  <div className="mutetxt">{a.por}</div>
                  <div className="relatorio-texto">{a.relato}</div>
                  {a.anexos.map((x) => (
                    <div key={x.id} className="row" style={{ gap: 8, marginTop: 4 }}>
                      <span className="mutetxt grow"><Icone nome="anexo" /> {x.legenda || x.nome}</span>
                      <button className="btn sm sec" aria-label={`Abrir ${x.legenda || x.nome}`}
                              onClick={() => setVendo({ id: x.id, nome: x.legenda || x.nome })}>Abrir</button>
                    </div>
                  ))}
                </div>
              </article>
            </li>
          ))}
        </ol>
      </div>
      {registrando && (
        <FolhaAtendimentoTecnico personId={personId} nome={nome} onFechar={() => setRegistrando(false)}
          onRegistrado={async (msg) => { setRegistrando(false); setAviso(msg); await carregar(); }} />
      )}
      {vendo && (
        <FolhaArquivo titulo={vendo.nome} legenda="A abertura fica registrada com o seu nome e o horário."
          carregar={() => api(`/people/technical-sessions/attachments/${vendo.id}/file`)}
          onFechar={() => setVendo(null)} />
      )}
    </section>
  );
}

function FolhaAtendimentoTecnico({ personId, nome, onFechar, onRegistrado }: {
  personId: string; nome: string; onFechar: () => void; onRegistrado: (aviso: string) => void;
}) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [area, setArea] = useState('');
  const [areaOutra, setAreaOutra] = useState('');
  const [quando, setQuando] = useState(hoje);
  const [relato, setRelato] = useState('');
  const [arquivos, setArquivos] = useState<{ arquivo: Escolhido; legenda: string }[]>([]);
  const [escolhendo, setEscolhendo] = useState<Escolhido | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const pode = !!area && (area !== 'outra' || areaOutra.trim().length >= 3) && relato.trim().length >= 10 && !enviando;

  async function guardar() {
    setErro(''); setEnviando(true);
    try {
      const r = await api<{ aviso: string }>(`/people/${personId}/technical-sessions`, {
        method: 'POST',
        body: JSON.stringify({
          area, areaOutra: area === 'outra' ? areaOutra.trim() : undefined, dia: quando, relato: relato.trim(),
          anexos: arquivos.map((a) => ({ conteudo: base64De(a.arquivo.dataUrl), nomeArquivo: a.arquivo.nome,
                                         legenda: a.legenda.trim() || undefined })),
        }),
      });
      onRegistrado(r.aviso);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar o atendimento.');
    } finally { setEnviando(false); }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-atend"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-atend">Atendimento da equipe técnica · {nome}</h3>
        <label className="f">A área</label>
        <div className="opts">
          {AREAS_DO_ATENDIMENTO.map((a) => (
            <button type="button" key={a.cod} className="opt c-other" aria-pressed={area === a.cod}
                    onClick={() => setArea(a.cod)}>{a.label}</button>
          ))}
        </div>
        {area === 'outra' && (
          <>
            <label className="f" htmlFor="at-outra">Qual área</label>
            <input id="at-outra" value={areaOutra} maxLength={60} onChange={(e) => setAreaOutra(e.target.value)} />
          </>
        )}
        <label className="f" htmlFor="at-dia">O dia</label>
        <input id="at-dia" type="date" value={quando} max={hoje} onChange={(e) => setQuando(e.target.value)} />
        <label className="f" htmlFor="at-relato">O que foi trabalhado</label>
        <textarea id="at-relato" rows={5} value={relato} onChange={(e) => setRelato(e.target.value)}
                  placeholder="O que foi proposto, como a criança participou, o que fica para o próximo encontro." />

        <label className="f" htmlFor="at-arq-arquivo">
          Arquivos <small>(o desenho, a folha da atividade, um relatório; até {MAXIMO_DE_ANEXOS_DO_ATENDIMENTO})</small>
        </label>
        {arquivos.map((a, i) => (
          <div key={i} className="row" style={{ gap: 8 }}>
            <span className="mutetxt grow"><Icone nome="anexo" /> {a.arquivo.nome}</span>
            <input aria-label={`O que é ${a.arquivo.nome}`} placeholder="O que é (opcional)" value={a.legenda}
                   style={{ maxWidth: 200 }} maxLength={80}
                   onChange={(e) => setArquivos(arquivos.map((x, j) => (j === i ? { ...x, legenda: e.target.value } : x)))} />
            <button className="btn sm ghost" aria-label={`Tirar ${a.arquivo.nome}`}
                    onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}>Tirar</button>
          </div>
        ))}
        {arquivos.length < MAXIMO_DE_ANEXOS_DO_ATENDIMENTO && (
          <>
            <EscolherAnexo id="at-arq" arquivo={escolhendo} onEscolher={setEscolhendo}
              aceita="application/pdf,image/jpeg,image/png,image/heic,image/heif" maximoMb={15}
              pergunta={<>É este o arquivo do atendimento?</>} />
            {escolhendo && (
              <button className="btn sm sec" onClick={() => { setArquivos([...arquivos, { arquivo: escolhendo, legenda: '' }]); setEscolhendo(null); }}>
                Pôr no atendimento
              </button>
            )}
          </>
        )}
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => void guardar()}>
            {enviando ? 'Guardando…' : 'Registrar o atendimento'}
          </button>
        </div>
      </div>
    </div>
  );
}
