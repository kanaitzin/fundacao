import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { BotaoOlho, Escolhido, PreviaEscolhida, base64De, lerArquivo } from '../anexos';
import { FolhaDocumento } from '../documentos';
import type { ArquivoGerado } from '../documentos';
import type { DocumentoWord } from '../docx';
import { quemAssina } from '../quem-assina';

/**
 * SAÚDE — MEDICAMENTOS E ENFERMAGEM.
 *
 * Três coisas que esta tela faz de propósito:
 *
 *  * a dose é confirmada UMA A UMA, por acolhido, por quem administrou. Não
 *    existe "marcar todas": marcação em lote é assinatura em branco;
 *  * dose que passou da hora aparece como "sem confirmação", nunca como "não
 *    administrada" — a segunda frase é uma conclusão, e conclusão é de gente;
 *  * a triagem só a Enfermagem assina. A coordenação cobra a pendência e vê a
 *    fila, mas não assina no lugar dela.
 *
 * ROTAS — 31/08/2026. Esta tela falava uma língua que o servidor não entende:
 * `/health/panel`, `/health/stock`, `/health/triage`, `/health/doses/:id/confirm`.
 * Nenhuma existia. Funcionava no protótipo porque o servidor de mentira havia
 * sido escrito para ela, e teria falhado inteira no primeiro dia contra o
 * servidor de verdade. Agora chama o que existe — `/nursing/*` e
 * `/medications/*` — com os formatos que o backend devolve, e o `mock.ts`
 * responde exatamente ao mesmo contrato. É um sistema só.
 */

export interface Dose {
  id: string; horario: string;
  acolhido: { id: string; nome: string };
  medicamento: string; dose: string; via: string;
  tipo: string; condicaoUso: string | null;
  estado: string; rotulo: string; pendente: boolean;
  confirmadaPor: string | null; administradaEm: string | null;
  offline: boolean; observacao: string | null;
  /** Sai do servidor já como "Alergia a Dipirona": ao lado de uma dose, o nome
   *  do medicamento sozinho se lê como o que dar. */
  alergias: string | null;
  /** A exceção do 0930, que precisa ser lida ANTES da hora — não depois do
   *  clique. Quem não é Enfermagem lê o motivo no lugar do botão. */
  soEnfermagem: boolean;
  motivoSoEnfermagem: string | null;
}

interface AcolhidoPainel {
  acolhidoId: string; nome: string; nomeCivil: string; idade: number;
  alergias: string | null; restricoes: string | null; condicoes: string | null;
  dosesPrevistas: number; proximaDose: string | null; ultimaDose: string | null;
  dosesPendentes: number; evolucoesAguardandoTriagem: number;
  internacaoEmAndamento: boolean; retornoPendente: string | null;
  receitaVencendo: string | null; semMedicacaoPrevista: boolean;
}

interface Painel {
  data: string;
  /** O dia da instituição, e a âncora do aviso de receita vencendo (§8.4). */
  hoje: string;
  receitaVencendoAncoradaEm: string;
  revendoOutroDia: boolean;
  total: number;
  resumo: {
    comMedicacao: number; semMedicacao: number; dosesPendentes: number;
    triagensPendentes: number; internacoes: number;
  };
  acolhidos: AcolhidoPainel[];
  aviso: string;
}

interface Item {
  id: string; medicamento: string; quantidade: number; unidade: string;
  /** Estoque nominal de um acolhido, contra estoque de uso comum da casa. */
  individual: boolean; acolhido: string | null;
  validade: string | null; diasParaVencer: number | null; validadeProxima: boolean;
  /** Sinalizado À MÃO, com autor (§11.6). O sistema não calcula o que é pouco. */
  estoqueBaixo: boolean;
  atualizadoEm: string;
}

interface Evolucao {
  id: string; acolhidoId: string; acolhido: string; casa: string;
  tipo: string; quando: string; local: string | null; especialidade: string | null;
  acompanhante: string | null; estadoRetorno: string | null;
  receita: string | null; orientacoes: string | null; restricoes: string | null;
  prazoRetorno: string | null; offline: boolean;
  status: string; pedidoComplemento: string | null;
  horasNaFila: number; foraDoPrazo: boolean;
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('pt-BR',
  { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/**
 * Um instante para ler. O `dia` acima recebe dia puro ("2026-09-01") e monta a
 * hora por cima; um timestamp completo passado por ele vira "Invalid Date" na
 * tela. Corta em dez caracteres antes, como o perfil já faz.
 */
const quando = (iso: string) => dia(String(iso).slice(0, 10));

/** Quem pode administrar, numa frase — a mesma nos dois lugares que a mostram. */
const quemAdministra = (p: { enfermagem: boolean; educadorAutorizado: boolean }) =>
  [p.enfermagem ? 'Enfermagem' : null,
   p.educadorAutorizado ? 'educador autorizado' : null]
    .filter(Boolean).join(' e ') || 'ninguém';

/** O tom fala do ESTADO da dose, nunca do acolhido. */
const TOM_DOSE: Record<string, string> = {
  administrado_no_horario: 'c-ok',
  administrado_com_atraso: 'c-warn',
  aguardando_confirmacao: 'c-warn',
  suspenso_conforme_orientacao: 'c-info',
  recusado: 'c-crit', incidente: 'c-crit',
  nao_administrado: 'c-crit', indisponivel: 'c-other',
  acolhido_ausente: 'c-move',
};

/**
 * Os códigos são os do servidor (`ESTADO_DOSE`, §11.2), não uma lista paralela.
 * A tela tinha os mesmos rótulos com outros códigos — `administrada_no_horario`
 * contra `administrado_no_horario` — e toda confirmação teria voltado 400.
 */
const RESULTADOS: { cod: string; label: string; tom: string; exigeObs: boolean }[] = [
  { cod: 'administrado_no_horario', label: 'Administrada no horário', tom: 'c-ok', exigeObs: false },
  { cod: 'administrado_com_atraso', label: 'Administrada com atraso', tom: 'c-warn', exigeObs: true },
  { cod: 'recusado', label: 'Recusada pelo acolhido', tom: 'c-crit', exigeObs: true },
  { cod: 'nao_administrado', label: 'Não administrada', tom: 'c-crit', exigeObs: true },
  { cod: 'indisponivel', label: 'Medicamento indisponível', tom: 'c-other', exigeObs: true },
  { cod: 'suspenso_conforme_orientacao', label: 'Suspensa conforme orientação', tom: 'c-info', exigeObs: false },
  { cod: 'acolhido_ausente', label: 'Acolhido ausente', tom: 'c-move', exigeObs: true },
  { cod: 'incidente', label: 'Incidente', tom: 'c-crit', exigeObs: true },
];

/** Códigos do servidor, rótulo para gente. */
const FINALIDADES: { cod: string; label: string }[] = [
  { cod: 'consulta', label: 'Consulta' },
  { cod: 'exame', label: 'Exame' },
  { cod: 'urgencia', label: 'Urgência ou emergência' },
  { cod: 'internacao', label: 'Internação' },
  { cod: 'transferencia_assistencial', label: 'Transferência assistencial' },
];

/**
 * Um ESQUEMA de medicamento — rascunho, na grade ou suspenso.
 *
 * Rascunho não gera dose: ele espera a Enfermagem conferir e assinar. Suspenso
 * saiu da grade a partir de hoje, e o que já foi confirmado continua registrado
 * — suspender não apaga o que a criança tomou.
 */
interface Esquema {
  id: string; medicamento: string; dose: string; via: string; tipo: string;
  status: string; rotulo: string;
  acolhido: { id: string; nome: string };
  condicaoUso: string | null; prescritor: string | null;
  inicio: string; fim: string | null; horarios: string[];
  assinadaPor: string | null; assinadaEm: string | null;
  motivoDaSuspensao: string | null;
  /** A exceção do 0930: por padrão o educador de plantão pode dar. */
  soEnfermagem: boolean; motivoSoEnfermagem: string | null;
}
/** Quem está nominalmente autorizado a administrar nesta casa (§11.3). */
interface Autorizacao {
  id: string; userId: string; quem: string; de: string; ate: string | null;
  nota: string | null; autorizadoPor: string | null; vigente: boolean;
}
interface Protocolo {
  periodos: { periodo: string; enfermagem: boolean; educadorAutorizado: boolean;
              nota: string | null; definidoEm: string | null }[];
  /** O que a Fundação respondeu em 08/09/2026; os períodos viraram história. */
  respostaDaFundacao?: string;
}

/**
 * Uma decisão sobre quem pode administrar (migração 0860).
 *
 * `antes: null` não é o mesmo que "antes ninguém podia": significa que não
 * havia definição nenhuma e valia o padrão protetivo — somente Enfermagem. A
 * tela precisa dizer a diferença, senão a primeira decisão de cada casa se lê
 * como se alguém tivesse revogado alguma coisa.
 */
interface DecisaoProtocolo {
  id: string; periodo: string;
  antes: { enfermagem: boolean; educadorAutorizado: boolean } | null;
  depois: { enfermagem: boolean; educadorAutorizado: boolean };
  motivo: string; por: string; quando: string;
}

/** Os dois turnos da casa. `integral` existe no banco e não se define por aqui. */
const PERIODOS = [
  { cod: 'diurno', label: 'Turno diurno' },
  { cod: 'noturno', label: 'Turno noturno' },
];

/**
 * O HISTÓRICO DE SAÚDE do acolhido — a linha única do §7.3.
 *
 * Atendimento, evolução de quem acompanhou e dose administrada, na ordem em
 * que aconteceram. A tela NÃO resume e NÃO conclui: ela mostra o que está
 * escrito e diz o que está esperando alguém.
 */
interface Historico {
  atendimentos: {
    id: string; tipo: string; tipoRotulo: string; quando: string;
    local: string | null; especialidade: string | null; profissional: string | null;
    motivo: string | null; desfecho: string | null;
    status: string; statusRotulo: string;
    retornoEm: string | null; retornoVencido: boolean;
  }[];
  evolucoes: {
    id: string; tipoRotulo: string; quando: string; estadoRetorno: string | null;
    orientacoes: string | null; acompanhante: string | null;
    status: string; statusRotulo: string; complementoEnfermagem: string | null;
  }[];
  administracoes: {
    previsto: string; estado: string; estadoRotulo: string; realizado: string | null;
    medicamento: string; dose: string; por: string | null; observacao: string | null;
  }[];
  pendencias: {
    retornosVencidos: number; retornosMarcados: number;
    internacaoEmAndamento: boolean; evolucoesAguardandoTriagem: number;
  };
  aviso: string;
}
/** Cada emissão do Resumo de Saúde pede finalidade — e a finalidade fica (§7.4). */
interface Emissao {
  id: string; finalidade: string; geradoEm: string;
  baixadoEm: string | null; versaoOffline: boolean; por: string | null;
}

interface Compra {
  id: string; em: string; itens: string; fornecedor: string | null;
  totalCentavos: number | null; nota: string | null; observacao: string | null;
  temAnexo: boolean; nomeDoAnexo: string | null; compradoPor: string;
}
interface Compras { linhas: Compra[]; gastoCentavos: number; semAnexo: number }

/**
 * Quem vê as compras.
 *
 * O educador NÃO: nota fiscal é documento financeiro da instituição, e não há
 * nada nela que ajude o turno.
 */
const VE_COMPRAS = ['enfermagem', 'equipe_tecnica', 'lider_diurno',
                    'coordenador', 'gestor_geral'];

export function Saude({ houseId, casaLabel, papel }: {
  houseId: string; casaLabel: string; papel: string;
}) {
  const [aba, setAba] = useState<
    'doses' | 'triagem' | 'estoque' | 'compras' | 'prescricoes' | 'resumo'>('doses');
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const inicioDoMes = `${hoje.slice(0, 7)}-01`;
  /* Compras de medicamento com nota fiscal (1040) — prestação de contas. */
  const [compras, setCompras] = useState<Compras | null>(null);
  const [comprando, setComprando] = useState(false);
  const [vendoReceitas, setVendoReceitas] = useState<any | null>(null);
  const [vendoNota, setVendoNota] = useState<{ id: string; nome: string } | null>(null);
  const [vendoMovimento, setVendoMovimento] =
    useState<{ id: string; medicamento: string } | null>(null);

  async function carregarCompras() {
    setCompras(await api<Compras>(
      `/medications/purchases?houseId=${houseId}&de=${inicioDoMes}&ate=${hoje}`)
      .catch(() => null));
  }
  useEffect(() => { if (aba === 'compras') carregarCompras(); }, [aba, houseId]);
  const [prescrevendo, setPrescrevendo] = useState(false);
  /*
   * O rascunho recém-criado fica na mão até ser assinado ou deixado como está.
   *
   * A lacuna que estava anotada aqui — "nenhuma tela lista rascunhos" — deixou
   * de existir em 01/09/2026: `GET /medications/prescriptions` passou a listar
   * os esquemas da casa, e o rascunho aparece PRIMEIRO, porque é o que está
   * esperando alguém. Deixar como rascunho agora é uma escolha, e não um
   * sumiço.
   */
  const [rascunho, setRascunho] = useState<{ id: string; medicamento: string } | null>(null);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [estoque, setEstoque] = useState<Item[]>([]);
  const [triagem, setTriagem] = useState<Evolucao[]>([]);
  const [erro, setErro] = useState('');
  /* A folha aberta pode ser de dois documentos diferentes — a grade da casa e
   * a saúde de um acolhido —, e cada um chama a sua rota. */
  const [exportarFolha, setExportarFolha] =
    useState<((finalidade: string) => Promise<ArquivoGerado>) | null>(null);
  const [aviso, setAviso] = useState('');
  const [confirmando, setConfirmando] = useState<Dose | null>(null);
  const [triando, setTriando] = useState<Evolucao | null>(null);
  const [resumindo, setResumindo] = useState<{ id: string; nome: string } | null>(null);
  const [esquemas, setEsquemas] = useState<Esquema[]>([]);
  const [avisoEsquemas, setAvisoEsquemas] = useState('');
  const [suspendendo, setSuspendendo] = useState<Esquema | null>(null);
  const [protocolo, setProtocolo] = useState<Protocolo | null>(null);
  const [autorizacoes, setAutorizacoes] = useState<Autorizacao[]>([]);
  /**
   * Marcar um medicamento como exclusivo da Enfermagem (0930). Substituiu a
   * definição por período: desde 08/09/2026 sabe-se que a Enfermagem atende
   * das 9h às 17h, e a dose das 22h é do educador de plantão por definição.
   */
  const [excecao, setExcecao] = useState<Esquema | null>(null);
  const [decisoes, setDecisoes] = useState<DecisaoProtocolo[]>([]);
  const [movendo, setMovendo] = useState<{ item: Item; tipo: 'entrada' | 'contagem' } | null>(null);
  const [historico, setHistorico] = useState<
    { pessoa: { id: string; nome: string }; dados: Historico; emissoes: Emissao[] } | null>(null);
  /* A folha de papel: o que se vê aqui é o que sai no Word. */
  const [documento, setDocumento] = useState<DocumentoWord | null>(null);

  async function carregar() {
    setErro('');
    try {
      const [p, g, e, t] = await Promise.all([
        api<Painel>(`/nursing/panel?houseId=${houseId}`),
        api<Dose[]>(`/medications?houseId=${houseId}`),
        api<Item[]>(`/medications/stock?houseId=${houseId}`),
        api<Evolucao[]>(`/nursing/triage?houseId=${houseId}`),
      ]);
      setPainel(p); setDoses(g); setEstoque(e); setTriagem(t);
      // Os esquemas e o protocolo não travam a grade do dia: falhar aqui não
      // pode impedir a Enfermagem de confirmar a dose das 19h30.
      const esq = await api<{ esquemas: Esquema[]; aviso: string }>(
        `/medications/prescriptions?houseId=${houseId}`).catch(() => null);
      setEsquemas(esq?.esquemas ?? []); setAvisoEsquemas(esq?.aviso ?? '');
      setProtocolo(await api<Protocolo>(`/medications/protocol?houseId=${houseId}`)
        .catch(() => null));
      setAutorizacoes(await api<Autorizacao[]>(
        `/medications/authorizations?houseId=${houseId}`).catch(() => []));
      setDecisoes(await api<DecisaoProtocolo[]>(
        `/medications/protocol-history?houseId=${houseId}`).catch(() => []));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a saúde da casa.');
    }
  }
  useEffect(() => { carregar(); }, [houseId]);

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try { const r = await fn(); if (r?.aviso) setAviso(r.aviso); await carregar(); return true; }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
  }

  /**
   * Abre a linha única de um acolhido. As emissões do Resumo vêm junto porque
   * respondem à mesma pergunta que se faz olhando o histórico — "isto já foi
   * para alguém, e para quê?" — e porque uma emissão gerada e nunca baixada é
   * uma pendência que ninguém via.
   */
  async function abrirHistorico(id: string, nome: string) {
    setErro('');
    try {
      const [dados, emissoes] = await Promise.all([
        api<Historico>(`/nursing/history/${id}`),
        api<Emissao[]>(`/nursing/summary/${id}/issues`).catch(() => [] as Emissao[]),
      ]);
      setHistorico({ pessoa: { id, nome }, dados, emissoes });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o histórico.');
    }
  }

  const enfermagem = papel === 'enfermagem' || papel === 'gestor_geral';
  /*
   * QUEM CONFIRMA DOSE — o espelho exato de `app_can_administer` (0930).
   *
   * Não é o mesmo conjunto de `enfermagem` acima: o Gestor Geral enxerga a
   * grade inteira e não administra nada. Botão que o servidor recusa é pior
   * que botão ausente — ele ensina a equipe a duvidar do que a tela oferece.
   */
  const administra = ['enfermagem', 'educador', 'lider_diurno'].includes(papel);
  /* E a dose marcada como exclusiva é só da Enfermagem, sem exceção de cargo. */
  const administraExclusiva = papel === 'enfermagem';
  /** Quem mexe no armário — o mesmo alcance do servidor. O educador vê e não mexe. */
  const movimenta = ['enfermagem', 'equipe_tecnica', 'coordenador', 'gestor_geral'].includes(papel);
  /* alcance:protocolo — quem marca o medicamento que só a Enfermagem dá (§11.3). */
  const defineProtocolo = ['enfermagem', 'coordenador', 'gestor_geral'].includes(papel);
  /** Quem cadastra e ativa esquema, desde 0930: não é mais só a Enfermagem. */
  const cadastraEsquema =
    ['enfermagem', 'coordenador', 'equipe_tecnica', 'gestor_geral'].includes(papel);
  const emiteResumo = ['enfermagem', 'equipe_tecnica', 'coordenador', 'gestor_geral'].includes(papel);

  // Os números vêm do que já está na tela, não de um resumo paralelo: o painel
  // do servidor conta acolhidos e pendências, e a grade conta doses.
  const administradas = doses.filter((d) => !d.pendente).length;
  const aguardando = doses.filter((d) => d.pendente).length;
  const baixos = estoque.filter((i) => i.estoqueBaixo).length;

  return (
    <>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && (
        <div className="notice c-ok" role="status">
          {aviso}
          <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setAviso('')}>
            Entendi
          </button>
        </div>
      )}

      {painel && (
        <>
          <div className="eyebrow">{casaLabel} · {dia(painel.data)}</div>
          <div className="painel">
            <div className="tile c-ok"><b>{administradas}</b><span>Doses confirmadas hoje</span></div>
            <div className="tile c-warn"><b>{aguardando}</b><span>Aguardando confirmação</span></div>
            <div className="tile c-med"><b>{painel.resumo.triagensPendentes}</b><span>Evoluções na triagem</span></div>
            <div className="tile c-info"><b>{baixos}</b><span>Itens sinalizados como baixos</span></div>
          </div>
          {painel.revendoOutroDia && (
            <div className="notice c-info">
              Você está revendo <b>{dia(painel.data)}</b>. O aviso de receita vencendo continua
              contado a partir de hoje, {dia(painel.receitaVencendoAncoradaEm)} — a receita vence
              numa data, e ela não muda conforme o dia que a tela mostra.
            </div>
          )}
        </>
      )}

      <div className="filtros" role="tablist" aria-label="Seções da saúde">
        <button role="tab" aria-selected={aba === 'doses'} className={aba === 'doses' ? 'on' : ''}
                onClick={() => setAba('doses')}>Doses do dia</button>
        <button role="tab" aria-selected={aba === 'triagem'} className={aba === 'triagem' ? 'on' : ''}
                onClick={() => setAba('triagem')}>Triagem</button>
        <button role="tab" aria-selected={aba === 'estoque'} className={aba === 'estoque' ? 'on' : ''}
                onClick={() => setAba('estoque')}>Estoque</button>
        {VE_COMPRAS.includes(papel) && (
          <button role="tab" aria-selected={aba === 'compras'}
                  className={aba === 'compras' ? 'on' : ''}
                  onClick={() => setAba('compras')}>Compras</button>
        )}
        {(cadastraEsquema || defineProtocolo) && (
          <button role="tab" aria-selected={aba === 'prescricoes'}
                  className={aba === 'prescricoes' ? 'on' : ''}
                  onClick={() => setAba('prescricoes')}>Esquemas</button>
        )}
        <button role="tab" aria-selected={aba === 'resumo'} className={aba === 'resumo' ? 'on' : ''}
                onClick={() => setAba('resumo')}>Resumo de saúde</button>
      </div>

      {aba === 'doses' && (
        <>
          <div className="notice c-crit">
            Cada dose é confirmada <b>somente por quem a administrou</b>, na conta dela.
            Ninguém confirma pelo outro, e não existe marcação em lote.
          </div>
          {/* A folha que fica no armário da medicação. Vem depois do resumo do
              dia porque conferir na tela é o caminho normal; o papel é para o
              turno que confere de porta aberta, com as mãos ocupadas. */}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn sm ghost"
                    onClick={async () => {
                      try {
                        setDocumento(await api<DocumentoWord>(
                          `/medications/folha?houseId=${houseId}`));
                        /* `useState` com função guardada precisa do
                         * embrulho: sem ele o React CHAMA a função, tratando-a
                         * como atualizador de estado. */
                        setExportarFolha(() => (finalidade: string) =>
                          api<ArquivoGerado>('/medications/export', {
                            method: 'POST',
                            body: JSON.stringify({ houseId, finalidade }),
                          }));
                      } catch (e) {
                        setErro(e instanceof Error ? e.message
                          : 'Não foi possível montar a grade em folha.');
                      }
                    }}>
              🖨️ Grade do dia em Word
            </button>
          </div>
          <div className="eyebrow">Doses de hoje</div>
          <ul className="doses">
            {doses.map((d) => (
              <li key={d.id} className={d.pendente ? '' : 'feito'}>
                <span className="hora">{d.tipo === 'quando_necessario' ? 's/n' : hhmm(d.horario)}</span>
                <div className="grow">
                  {/* Nome em cima, remédio embaixo: numa linha só, o separador
                      caía no fim da linha e a via ficava órfã. */}
                  <b className="ff">{d.acolhido.nome}</b>
                  <div>{d.medicamento} {d.dose} <span className="mutetxt">· {d.via}</span></div>
                  {d.condicaoUso && (
                    <div className="mutetxt">Condição de uso: {d.condicaoUso}</div>
                  )}
                  <div className="row" style={{ marginTop: 5 }}>
                    <span className={`pill ${TOM_DOSE[d.estado] ?? 'c-mute'}`}>{d.rotulo}</span>
                    {d.alergias && <span className="pill c-crit">⚠ {d.alergias}</span>}
                    {d.soEnfermagem && (
                      <span className="pill c-warn">Só a Enfermagem administra</span>
                    )}
                    {d.offline && <span className="pill c-mute">Registrada offline</span>}
                  </div>
                  {d.observacao && <div className="mutetxt">{d.observacao}</div>}
                  {d.confirmadaPor && (
                    <div className="mutetxt">
                      Confirmada por {d.confirmadaPor}
                      {d.administradaEm ? ` às ${hhmm(d.administradaEm)}` : ''}.
                    </div>
                  )}
                </div>
                {/*
                  * O BOTÃO QUE NÃO EXISTE PARA QUEM NÃO PODE.
                  *
                  * Deixar "Confirmar" aceso para o educador numa dose marcada
                  * como exclusiva é oferecer um caminho que termina em recusa
                  * — depois de escolher o estado e escrever a observação. No
                  * lugar dele fica o MOTIVO, que é o que ele precisa para
                  * decidir o que fazer às 22h.
                  */}
                {d.pendente && administra && (d.soEnfermagem ? administraExclusiva : true) && (
                  <button className="btn sm" onClick={() => setConfirmando(d)}>Confirmar</button>
                )}
                {d.pendente && d.soEnfermagem && !administraExclusiva && (
                  <div className="bloco">
                    <small>Esta dose não é com você</small>
                    {d.motivoSoEnfermagem ?? 'Só a Enfermagem administra este medicamento.'}
                  </div>
                )}
              </li>
            ))}
            {doses.length === 0 && (
              <li><div className="mutetxt">Nenhuma dose na grade de hoje nesta casa.</div></li>
            )}
          </ul>
          <p className="mutetxt" style={{ marginTop: 12 }}>
            Dose que passou da hora aparece como <b>sem confirmação</b>, nunca como
            “não administrada”. A diferença entre as duas frases é uma conclusão — e a
            conclusão é da equipe, não do sistema.
          </p>
        </>
      )}

      {aba === 'triagem' && (
        <>
          <div className="notice c-info">
            Evoluções de saúde escritas pelo educador que acompanhou o atendimento. A
            Enfermagem tria, complementa, confere e assina. A coordenação cobra a
            pendência, mas <b>não substitui a assinatura de saúde</b>.
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {triagem.map((t) => (
              <div className="card stack" key={t.id}>
                <div className="row">
                  <b className="ff grow">{t.acolhido} · {t.tipo}</b>
                  <span className={`pill ${t.status === 'complemento_solicitado' ? 'c-other' : 'c-warn'}`}>
                    {t.status === 'complemento_solicitado' ? 'Devolvida para complemento' : 'Aguardando triagem'}
                  </span>
                </div>
                <div className="mutetxt">
                  {t.casa} · atendimento em {hhmm(t.quando)}
                  {t.local ? ` · ${t.local}` : ''}{t.especialidade ? ` · ${t.especialidade}` : ''}
                  {t.acompanhante ? ` · acompanhou: ${t.acompanhante}` : ''}
                </div>
                {t.estadoRetorno && (
                  <div className="bloco"><small>Estado no retorno</small>{t.estadoRetorno}</div>
                )}
                {t.orientacoes && (
                  <div className="bloco"><small>Orientações recebidas</small>{t.orientacoes}</div>
                )}
                {t.receita && (
                  <div className="mutetxt">
                    Receita entregue: {t.receita} — <b>só altera a grade depois da triagem</b>.
                  </div>
                )}
                {t.pedidoComplemento && (
                  <div className="bloco"><small>Complemento pedido pela Enfermagem</small>{t.pedidoComplemento}</div>
                )}
                <div className="row">
                  <span className={`pill ${t.foraDoPrazo ? 'c-warn' : 'c-mute'} grow`}>
                    {t.horasNaFila}h na fila{t.foraDoPrazo ? ' · passou do combinado' : ''}
                  </span>
                  {enfermagem
                    ? <button className="btn sm" onClick={() => setTriando(t)}>Revisar</button>
                    : <span className="mutetxt">Só a Enfermagem assina. Você enxerga a fila para
                        cobrar a pendência.</span>}
                </div>
              </div>
            ))}
            {triagem.length === 0 && (
              <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
                Nenhuma evolução na fila.</p></div>
            )}
          </div>
          <p className="mutetxt" style={{ marginTop: 12 }}>
            A fila mostra o que ainda não foi assinado. O prazo sinaliza o que passou do
            combinado — é acompanhamento, não punição, e não ordena ninguém por desempenho.
          </p>
        </>
      )}

      {vendoReceitas && (
        <FolhaReceitas esquema={vendoReceitas} papel={papel}
                       onFechar={() => setVendoReceitas(null)} />
      )}

      {vendoMovimento && (
        <FolhaMovimento item={vendoMovimento} onFechar={() => setVendoMovimento(null)} />
      )}

      {vendoNota && (
        <FolhaDocumentoGuardado
          titulo={vendoNota.nome}
          legenda="Documento financeiro. A abertura fica registrada com o seu nome."
          carregar={() => api<DocumentoOuCaminho>(
            `/medications/purchases/${vendoNota.id}/file`)}
          onFechar={() => setVendoNota(null)} />
      )}

      {aba === 'compras' && VE_COMPRAS.includes(papel) && (
        <>
          <div className="card raise stack">
            <h3 style={{ fontSize: 17, margin: 0 }}>Compras de medicamento</h3>
            <div className="mutetxt">
              O que a casa comprou no mês, com a nota fiscal anexada. É daqui que
              sai a prestação de contas.
            </div>
            {compras && (
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <div className="tile c-brand">
                  <b>{(compras.gastoCentavos / 100).toLocaleString('pt-BR',
                      { style: 'currency', currency: 'BRL' })}</b>
                  <div className="mutetxt">no período</div>
                </div>
                {/* Quantas linhas estão sem o papel: a prestação de contas para
                    por causa delas, e no fim do mês ninguém lembra qual foi. */}
                {compras.semAnexo > 0 && (
                  <div className="tile c-warn">
                    <b>{compras.semAnexo}</b>
                    <div className="mutetxt">sem a nota anexada</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <button className="btn block" onClick={() => setComprando(true)}>
            🧾 Registrar compra
          </button>

          <div className="eyebrow">Compras do período · {compras?.linhas.length ?? 0}</div>
          <div className="stack">
            {(compras?.linhas ?? []).length === 0 && (
              <p className="mutetxt">
                Nenhuma compra registrada no período. A lista vazia quer dizer que ninguém
                registrou — não que a casa não comprou.
              </p>
            )}
            {(compras?.linhas ?? []).map((c) => (
              <div className="card stack" key={c.id}>
                <div className="row">
                  <b className="ff grow">{c.itens}</b>
                  <span className={`pill ${c.temAnexo ? 'c-ok' : 'c-warn'}`}>
                    {c.temAnexo ? 'com nota' : 'sem nota'}
                  </span>
                </div>
                <div className="mutetxt">
                  {new Date(`${c.em}T12:00:00-03:00`).toLocaleDateString('pt-BR')}
                  {c.fornecedor ? ` · ${c.fornecedor}` : ''}
                  {c.totalCentavos != null
                    ? ` · ${(c.totalCentavos / 100).toLocaleString('pt-BR',
                        { style: 'currency', currency: 'BRL' })}` : ''}
                </div>
                {c.nota && <div className="mutetxt">Nota {c.nota}</div>}
                <div className="row">
                  <span className="mutetxt grow">Registrado por {c.compradoPor}.</span>
                  {/* O papel abre aqui. Antes dele existir, "com nota" queria
                      dizer que alguém tinha digitado alguma coisa no campo. */}
                  {c.temAnexo && (
                    <BotaoOlho rotulo="Ver a nota"
                               onClick={() => setVendoNota({ id: c.id, nome: c.nomeDoAnexo ?? 'Nota fiscal' })} />
                  )}
                </div>
              </div>
            ))}
          </div>

          {comprando && (
            <FolhaCompra houseId={houseId} onFechar={() => setComprando(false)}
                         onPronto={() => { setComprando(false); carregarCompras(); }} />
          )}
        </>
      )}

      {aba === 'estoque' && (
        <>
          <div className="eyebrow">Armário de medicamentos da casa</div>
          <div className="stack">
            {estoque.map((i) => (
              <div className="card" key={i.id}>
                <div className="row">
                  <div className="grow">
                    <b className="ff">{i.medicamento}</b>
                    <div className="mutetxt">
                      {i.quantidade} {i.unidade}{i.quantidade === 1 ? '' : 's'}
                      {i.validade ? ` · validade ${dia(i.validade)}` : ' · sem validade registrada'}
                      {i.diasParaVencer !== null ? ` (${i.diasParaVencer} dia(s))` : ''}
                    </div>
                    <div className="mutetxt">
                      {i.individual
                        ? `Estoque nominal de ${i.acolhido ?? '—'} — não é do uso comum da casa.`
                        : 'Uso comum da casa.'}
                    </div>
                  </div>
                  <div className="stack">
                    {i.validadeProxima && <span className="pill c-warn">Validade próxima</span>}
                    {i.estoqueBaixo && <span className="pill c-info">Sinalizado como baixo</span>}
                  </div>
                </div>
                {/*
                  * O MOVIMENTO ABRE PARA QUEM ALCANÇA O ARMÁRIO (fase 109).
                  *
                  * Ver a história não é mexer no armário: quem conferiu a
                  * gaveta e achou dois a menos precisa saber para onde eles
                  * foram, e essa pessoa nem sempre é a que dá entrada.
                  */}
                <div className="row" style={{ marginTop: 10 }}>
                  <BotaoOlho rotulo="Ver o movimento"
                             onClick={() => setVendoMovimento(i)} />
                </div>
                {movimenta && (
                  <div className="row" style={{ marginTop: 10, gap: 8 }}>
                    <button className="btn sm" onClick={() => setMovendo({ item: i, tipo: 'entrada' })}>
                      Chegou remédio
                    </button>
                    <button className="btn sm ghost" onClick={() => setMovendo({ item: i, tipo: 'contagem' })}>
                      Conferi o armário
                    </button>
                    <button className="btn sm ghost"
                            onClick={() => acao(() => api(`/medications/stock/${i.id}/flag-low`, {
                              method: 'POST', body: JSON.stringify({ baixo: !i.estoqueBaixo }) }))}>
                      {i.estoqueBaixo ? 'Tirar o sinal de baixo' : 'Sinalizar como baixo'}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {estoque.length === 0 && (
              <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
                Nada registrado no armário desta casa.</p></div>
            )}
          </div>
          <p className="mutetxt" style={{ marginTop: 12 }}>
            <b>Chegou remédio</b> soma ao que já estava lá. <b>Conferi o armário</b> troca pelo
            número que você contou e guarda a diferença, com o seu motivo. São duas coisas
            diferentes, e o sistema não adivinha qual delas você está fazendo.
          </p>
          <p className="mutetxt" style={{ marginTop: 12 }}>
            <b>Estoque baixo é sinalizado por gente.</b> Não existe "mínimo" calculado: só a
            equipe sabe o que é pouco para cada caso — dois frascos de um xarope de uso
            eventual podem sobrar, e dois de um contínuo acabam na quinta-feira. O estoque diz
            o estado do <b>armário</b>: falta de medicamento é problema de compra e de
            logística, não indicador sobre nenhuma criança.
          </p>
        </>
      )}

      {aba === 'prescricoes' && (cadastraEsquema || defineProtocolo) && (
        <>
          {/*
            * OS ESQUEMAS DA CASA — rascunho, na grade, suspenso.
            *
            * O rascunho vem primeiro porque é o que está esperando alguém: ele
            * NÃO gera dose, e antes desta lista ficava gravado e invisível.
            */}
          {avisoEsquemas && <div className="notice c-info">{avisoEsquemas}</div>}

          {esquemas.length === 0 && (
            <p className="mutetxt">Nenhum esquema de medicamento nesta casa.</p>
          )}
          <div className="stack">
            {esquemas.map((e) => (
              <article className="card" key={e.id}>
                <div className="row">
                  <div className="grow">
                    <b className="ff">{e.acolhido.nome}</b>
                    <div className="mutetxt linhadois">
                      {e.medicamento} {e.dose} · {e.via}
                      {e.horarios.length ? ` · ${e.horarios.join(', ')}` : ''}
                    </div>
                  </div>
                  <span className={`pill ${e.status === 'ativa' ? 'c-ok'
                    : e.status === 'suspensa' ? 'c-mute' : 'c-warn'}`}>
                    {e.rotulo}
                  </span>
                </div>
                {e.condicaoUso && (
                  <div className="mutetxt">Condição de uso: {e.condicaoUso}</div>
                )}
                {e.prescritor && <div className="mutetxt">Prescrito por {e.prescritor}</div>}
                {e.assinadaPor && (
                  <div className="mutetxt">Assinado por {e.assinadaPor}</div>
                )}
                {e.motivoDaSuspensao && (
                  <div className="bloco"><small>Motivo da suspensão</small>{e.motivoDaSuspensao}</div>
                )}
                {/* A EXCEÇÃO (0930). Ela aparece para TODA a equipe, e não só
                    para quem pode marcá-la: o educador precisa saber, antes de
                    chegar a hora, que este frasco não é com ele. */}
                {e.soEnfermagem && (
                  <div className="bloco">
                    <small>Só a Enfermagem administra</small>
                    {e.motivoSoEnfermagem ?? 'sem motivo registrado'}
                  </div>
                )}
                {cadastraEsquema && e.status === 'rascunho' && (
                  <button className="btn sm" onClick={() => acao(() =>
                    api(`/medications/prescriptions/${e.id}/sign`, { method: 'POST', body: '{}' }))}>
                    Conferir e ativar
                  </button>
                )}
                {defineProtocolo && e.status !== 'rascunho' && (
                  <button className="btn sm sec" onClick={() => setExcecao(e)}>
                    {e.soEnfermagem
                      ? 'Voltar a permitir o educador'
                      : 'Só a Enfermagem pode dar'}
                  </button>
                )}
                {/* SUSPENDER é da Enfermagem, e só do que está na grade. O
                    médico suspendeu o remédio e a grade continuava cobrando a
                    dose todo dia — este botão é o que fecha esse silêncio. */}
                {cadastraEsquema && e.status === 'ativa' && (
                  <button className="btn sm sec" onClick={() => setSuspendendo(e)}>
                    Suspender este esquema
                  </button>
                )}
                {/*
                  * A RECEITA DIGITALIZADA fica junto da prescrição que ela
                  * autoriza — não numa pasta de documentos separada. Quem
                  * confere o esquema é quem quer ver o papel do médico.
                  */}
                <button className="btn sm ghost" onClick={() => setVendoReceitas(e)}>
                  📄 Receitas
                </button>
              </article>
            ))}
          </div>

          {/*
            * QUEM DÁ O REMÉDIO NESTA CASA (§11.3).
            *
            * Até 08/09/2026 este bloco era uma pendência institucional em
            * aberto, e o sistema valia-se do padrão mais protetivo — somente
            * Enfermagem, educador só por autorização nominal. A Fundação
            * respondeu, e a resposta desfaz a hipótese: a Enfermagem atende
            * das 9h às 17h; fora disso quem dá é o educador de plantão,
            * conforme a bula do acolhido.
            *
            * A regra passou a ser LIDA, e não configurada. O que se configura
            * agora é a exceção, e ela vive no esquema do medicamento.
            */}
          <div className="eyebrow">Quem dá o remédio</div>
          <div className="card stack">
            <div className="notice c-info">
              <b>A Enfermagem atende das 9h às 17h.</b> Fora desse horário, quem administra é o
              educador de plantão, conforme a bula do acolhido. Quem dá é quem confirma — uma
              dose por vez, com o nome de quem deu.
            </div>
            <p className="mutetxt">
              A exceção é por <b>medicamento</b>, e não por turno nem por pessoa: se algum exigir
              a Enfermagem, marque no esquema dele, na lista acima, com o motivo escrito. O
              educador que tentar confirmar lê esse motivo.
            </p>

            {/*
              * O que valia ANTES continua legível — regra 6. Estas decisões
              * foram tomadas quando ninguém sabia o horário da Enfermagem, e
              * apagá-las esconderia por que a casa operava daquele jeito.
              */}
            {(decisoes.length > 0 || autorizacoes.length > 0) && (
              <>
                <div className="eyebrow" style={{ marginTop: 8 }}>O que valia antes de 08/09</div>
                {decisoes.length > 0 && (
                  <ul className="lista">
                    {decisoes.map((d) => (
                      <li key={d.id}>
                        <b className="ff">
                          {PERIODOS.find((p) => p.cod === d.periodo)?.label ?? d.periodo}
                        </b>
                        <div className="mutetxt linhadois">
                          {d.antes === null
                            ? 'não havia definição (valia somente Enfermagem)'
                            : `${quemAdministra(d.antes)}`}
                          {' → '}
                          <b>{quemAdministra(d.depois)}</b>
                        </div>
                        <div className="mutetxt">{d.motivo}</div>
                        <div className="mutetxt">{d.por} · {quando(d.quando)}</div>
                      </li>
                    ))}
                  </ul>
                )}
                {autorizacoes.length > 0 && (
                  <>
                    <div className="mutetxt" style={{ marginTop: 8 }}>
                      Educadores que estavam autorizados nominalmente — a autorização deixou de
                      ser necessária, e a lista fica porque o registro é de quem trabalhou.
                    </div>
                    <ul className="lista">
                      {autorizacoes.map((a) => (
                        <li key={a.id} className="row">
                          <div className="grow">
                            <b className="ff">{a.quem}</b>
                            <div className="mutetxt linhadois">
                              de {dia(String(a.de).slice(0, 10))}
                              {a.ate ? ` até ${dia(String(a.ate).slice(0, 10))}` : ' — sem prazo'}
                              {a.autorizadoPor ? ` · por ${a.autorizadoPor}` : ''}
                            </div>
                            {a.nota && <div className="mutetxt">{a.nota}</div>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {aba === 'prescricoes' && cadastraEsquema && (
        <>
          <div className="notice c-crit">
            Um esquema nasce como <b>rascunho</b> e só entra na grade quando alguém
            <b> confere e ativa</b>. Receita entregue numa consulta não altera a grade sozinha:
            alguém assume, com nome e horário. Cadastram a Enfermagem, a coordenação e a
            equipe técnica — quem estiver na casa quando a receita chegar.
          </div>
          {rascunho && (
            <div className="card raise stack">
              <b className="ff">Rascunho: {rascunho.medicamento}</b>
              <div className="mutetxt">
                Ainda NÃO está na grade. Confira o que você cadastrou e ative — é isso que
                faz a casa começar a dar o medicamento, e o seu nome fica ao lado de cada dose.
              </div>
              <div className="row">
                <button className="btn grow" onClick={async () => {
                  const ok = await acao(() => api(`/medications/prescriptions/${rascunho.id}/sign`, {
                    method: 'POST', body: '{}' }));
                  if (ok) setRascunho(null);
                }}>
                  Conferir e assinar
                </button>
                <button className="btn sec grow" onClick={() => setRascunho(null)}>
                  Deixar como rascunho
                </button>
              </div>
              <p className="mutetxt" style={{ margin: 0 }}>
                Deixando como rascunho, ele fica gravado e <b>aparece no alto da lista de
                esquemas desta aba</b>, porque é o que está esperando alguém. Enquanto não
                for assinado, <b>não gera dose nenhuma</b>.
              </p>
            </div>
          )}
          <button className="btn block" onClick={() => setPrescrevendo(true)}>
            + Cadastrar esquema de medicamento
          </button>
          <p className="mutetxt" style={{ marginTop: 12 }}>
            "Quando necessário" exige a <b>condição de uso escrita pelo profissional</b> — o
            sistema não decide quando dar. Sem essa frase, a decisão cairia no colo de quem
            está no plantão às três da manhã.
          </p>
        </>
      )}

      {aba === 'resumo' && painel && (
        <>
          <div className="notice c-warn">
            O Resumo de Saúde leva só o necessário: identificação, alergias, restrições,
            condições relevantes, medicamentos ativos e atendimentos recentes.
            <b> Sem</b> dados bancários, conteúdo judicial, comportamento ou narrativas.
            Toda emissão pede finalidade, e a finalidade fica registrada.
          </div>
          <div className="eyebrow">Todos os acolhidos · {painel.total}</div>
          <div className="stack">
            {painel.acolhidos.map((k) => (
              <div className="card row" key={k.acolhidoId}>
                <div className="grow">
                  <b className="ff">{k.nome}</b> <span className="mutetxt">{k.idade} anos</span>
                  {k.alergias && <div><span className="pill c-crit">⚠ Alergia a {k.alergias}</span></div>}
                  {k.restricoes && <div className="mutetxt">Restrição alimentar: {k.restricoes}</div>}
                  {k.condicoes && <div className="mutetxt">Condições: {k.condicoes}</div>}
                  <div className="row" style={{ marginTop: 5 }}>
                    {k.internacaoEmAndamento && <span className="pill c-crit">Internação em andamento</span>}
                    {k.retornoPendente && (
                      <span className="pill c-warn">Retorno em {dia(k.retornoPendente)}</span>
                    )}
                    {k.receitaVencendo && (
                      <span className="pill c-warn">Receita vence em {dia(k.receitaVencendo)}</span>
                    )}
                    {k.evolucoesAguardandoTriagem > 0 && (
                      <span className="pill c-med">{k.evolucoesAguardandoTriagem} evolução(ões) na triagem</span>
                    )}
                  </div>
                </div>
                <span className={`pill ${k.semMedicacaoPrevista ? 'c-mute' : 'c-med'}`}>
                  {k.semMedicacaoPrevista
                    ? 'Sem medicação prevista'
                    : `${k.dosesPrevistas} dose(s) na grade`}
                </span>
                {/* A linha única vem ANTES de gerar resumo, de propósito: o
                    resumo é o que sai da casa, e ninguém deveria emiti-lo sem
                    ter olhado o que está escrito. */}
                <button className="btn sm ghost"
                        onClick={() => abrirHistorico(k.acolhidoId, k.nome)}>
                  Histórico
                </button>
                {emiteResumo && (
                  <button className="btn sm ghost"
                          onClick={() => setResumindo({ id: k.acolhidoId, nome: k.nome })}>
                    Gerar resumo
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mutetxt" style={{ marginTop: 12 }}>
            {painel.aviso} Todos aparecem, inclusive quem não tem medicação. A lista não
            ordena por gravidade nem sugere prioridade clínica — isso seria uma decisão que
            o sistema não pode tomar.
          </p>
        </>
      )}

      {confirmando && (
        <FolhaDose dose={confirmando} onFechar={() => setConfirmando(null)}
                   onConfirmar={async (estado, nota) => {
                     const ok = await acao(() => api(`/medications/doses/${confirmando.id}/confirm`, {
                       method: 'POST', body: JSON.stringify({ estado, nota }) }));
                     if (ok) setConfirmando(null);
                   }} />
      )}

      {triando && (
        <FolhaTriagem evolucao={triando} onFechar={() => setTriando(null)}
                      onEnviar={async (corpo) => {
                        const ok = await acao(() => api(`/nursing/evolutions/${triando.id}/triage`, {
                          method: 'POST', body: JSON.stringify(corpo) }));
                        if (ok) setTriando(null);
                      }} />
      )}

      {suspendendo && (
        <FolhaSuspender
          esquema={suspendendo}
          onFechar={() => setSuspendendo(null)}
          onSuspender={async (motivo) => {
            const ok = await acao(() => api(
              `/medications/prescriptions/${suspendendo.id}/suspend`,
              { method: 'POST', body: JSON.stringify({ motivo }) }));
            if (ok) setSuspendendo(null);
          }} />
      )}

      {excecao && (
        <FolhaSoEnfermagem
          esquema={excecao}
          onFechar={() => setExcecao(null)}
          onMarcar={async (soEnfermagem, motivo) => {
            const ok = await acao(() => api(
              `/medications/prescriptions/${excecao.id}/nurse-only`,
              { method: 'POST', body: JSON.stringify({ soEnfermagem, motivo }) }));
            if (ok) setExcecao(null);
          }} />
      )}

      {resumindo && (
        <FolhaResumo pessoa={resumindo} onFechar={() => setResumindo(null)}
                     onGerar={async (finalidade) => {
                       const ok = await acao(() => api(`/nursing/summary/${resumindo.id}`, {
                         method: 'POST', body: JSON.stringify({ finalidade }) }));
                       if (ok) setResumindo(null);
                     }} />
      )}

      {documento && (
        <FolhaDocumento doc={documento} onFechar={() => setDocumento(null)}
                        exportar={exportarFolha ?? undefined} />
      )}

      {historico && (
        <FolhaHistorico
          pessoa={historico.pessoa} dados={historico.dados} emissoes={historico.emissoes}
          onFechar={() => setHistorico(null)}
          /* Fecha o histórico ao abrir a folha: duas folhas empilhadas
             deixam quem lê sem saber em qual delas está o botão. */
          onDocumento={async () => {
            try {
              const id = historico.pessoa.id;
              setDocumento(await api<DocumentoWord>(`/nursing/history/${id}/folha`));
              setExportarFolha(() => (finalidade: string) =>
                api<ArquivoGerado>(`/nursing/history/${id}/export`, {
                  method: 'POST', body: JSON.stringify({ finalidade }),
                }));
              setHistorico(null);
            } catch (e) {
              setErro(e instanceof Error ? e.message
                : 'Não foi possível montar a folha de saúde.');
            }
          }}
          onBaixar={async (emissaoId) => {
            setErro('');
            try {
              await api(`/nursing/summary/issues/${emissaoId}/download`,
                        { method: 'POST', body: '{}' });
              await abrirHistorico(historico.pessoa.id, historico.pessoa.nome);
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível registrar a retirada.');
            }
          }} />
      )}

      {prescrevendo && painel && (
        <FolhaPrescricao
          acolhidos={painel.acolhidos}
          onFechar={() => setPrescrevendo(false)}
          onGravar={async (corpo) => {
            setErro(''); setAviso('');
            try {
              const r = await api<{ id: string; aviso?: string }>('/medications/prescriptions', {
                method: 'POST', body: JSON.stringify({ houseId, ...corpo }) });
              setPrescrevendo(false);
              setRascunho({ id: r.id, medicamento: String(corpo.medicamento) });
              if (r.aviso) setAviso(r.aviso);
              await carregar();
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível cadastrar.');
            }
          }} />
      )}

      {movendo && (
        <FolhaEstoque
          item={movendo.item} tipo={movendo.tipo} onFechar={() => setMovendo(null)}
          onGravar={async (quantidade, motivo) => {
            const ok = await acao(() => api('/medications/stock', {
              method: 'POST',
              body: JSON.stringify({
                tipo: movendo.tipo, houseId, medicamento: movendo.item.medicamento,
                unidade: movendo.item.unidade, quantidade, motivo,
              }) }));
            if (ok) setMovendo(null);
          }} />
      )}
    </>
  );
}

/**
 * Uma folha, dois sentidos — e a diferença aparece antes de gravar.
 *
 * O campo de "entrada" pergunta o que CHEGOU; o de "contagem" pergunta o que
 * EXISTE. A linha de prévia diz em que número o armário vai ficar, porque foi
 * exatamente essa confusão que produziu o defeito: uma entrada de 10 sobre 30
 * deixava 10, e ninguém via isso até faltar remédio.
 */
function FolhaEstoque({ item, tipo, onFechar, onGravar }: {
  item: Item; tipo: 'entrada' | 'contagem';
  onFechar: () => void; onGravar: (quantidade: number, motivo: string) => void;
}) {
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const entrada = tipo === 'entrada';
  const q = Number(valor);
  const valido = valor.trim() !== '' && Number.isFinite(q) && q >= 0 && (!entrada || q > 0);
  const depois = !valido ? null : entrada ? item.quantidade + q : q;
  const podeGravar = valido && (entrada || motivo.trim().length >= 3);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-est"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-est">{entrada ? 'Chegou remédio' : 'Conferi o armário'} · {item.medicamento}</h3>
        <p className="mutetxt">
          Registrado agora: <b>{item.quantidade} {item.unidade}(s)</b>.
        </p>
        <div className={`notice ${entrada ? 'c-info' : 'c-warn'}`}>
          {entrada
            ? 'A quantidade que você digitar SOMA ao que já estava no armário.'
            : 'A quantidade que você digitar SUBSTITUI o registro, e a diferença fica no '
              + 'histórico com o seu nome e o seu motivo.'}
        </div>

        <label className="f" htmlFor="q-est">
          {entrada ? 'Quanto chegou' : 'Quanto você contou'} <small>— em {item.unidade}(s)</small>
        </label>
        <input id="q-est" type="number" min={entrada ? 1 : 0} inputMode="numeric"
               value={valor} onChange={(e) => setValor(e.target.value)} />

        {depois !== null && (
          <p className="mutetxt">
            O armário fica com <b>{depois} {item.unidade}(s)</b>
            {!entrada && depois !== item.quantidade
              ? ` — diferença de ${depois > item.quantidade ? '+' : ''}${depois - item.quantidade}.`
              : '.'}
          </p>
        )}

        <label className="f" htmlFor="m-est">
          Motivo {entrada
            ? <small>— opcional: nota de compra, doação</small>
            : <small>— obrigatório</small>}
        </label>
        <textarea id="m-est" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder={entrada
                    ? 'Ex.: entrega da farmácia, nota 4471.'
                    : 'Ex.: conferência do armário na passagem; quatro a menos que o registrado.'} />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!podeGravar}
                  onClick={() => onGravar(q, motivo)}>
            {entrada ? 'Registrar entrada' : 'Registrar contagem'}
          </button>
        </div>
      </div>
    </div>
  );
}

/*
 * A folha de confirmar dose é EXPORTADA porque a dose não mora só aqui.
 *
 * A tela de Saúde é da Enfermagem e da coordenação; o educador quase não a
 * abre — e, desde a decisão de 08/09, é ele quem dá o remédio à noite. A dose
 * chega a ele pela LINHA DO TEMPO, e é lá que ela precisa ser confirmada, com
 * esta mesma folha: os mesmos resultados, a mesma observação obrigatória, o
 * mesmo alerta de alergia. Duas folhas diferentes para o mesmo ato seria a
 * forma mais discreta de as duas divergirem.
 */
export function FolhaDose({ dose, onFechar, onConfirmar }: {
  dose: Dose; onFechar: () => void; onConfirmar: (estado: string, nota: string) => void;
}) {
  const [estado, setEstado] = useState('');
  const [nota, setNota] = useState('');
  const escolhido = RESULTADOS.find((r) => r.cod === estado);
  const podeConfirmar = !!estado && (!escolhido?.exigeObs || nota.trim().length > 0);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-dose"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-dose">Confirmar dose · {dose.acolhido.nome}</h3>
        <p className="mutetxt">
          {dose.medicamento} {dose.dose} · {dose.via} · previsto para {hhmm(dose.horario)}
        </p>
        {dose.alergias && (
          <div className="notice c-crit">⚠ Alerta essencial registrado: <b>{dose.alergias}</b></div>
        )}
        <div className="notice c-info">
          A confirmação é individual e intransferível: <b>só confirma quem administrou</b>.
          Fica com o seu nome e o horário de agora.
        </div>

        <label className="f">Resultado</label>
        <div className="opts">
          {RESULTADOS.map((r) => (
            <button type="button" key={r.cod} className={`opt ${r.tom}`}
                    aria-pressed={estado === r.cod}
                    onClick={() => setEstado(r.cod)}>{r.label}</button>
          ))}
        </div>

        {escolhido?.exigeObs && (
          <>
            <label className="f" htmlFor="obs-dose">
              Observação <small>— obrigatória neste resultado</small>
            </label>
            <textarea id="obs-dose" value={nota} onChange={(e) => setNota(e.target.value)}
                      placeholder="Ex.: recusou a primeira oferta; aceitou depois de conversar." />
          </>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!podeConfirmar}
                  onClick={() => onConfirmar(estado, nota)}>Confirmar dose</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Triar é conferir e assinar — ou devolver pedindo o que falta.
 *
 * A tela só sabia assinar, e o servidor sempre soube fazer as duas coisas. A
 * evolução incompleta ficava entre assinar algo que a Enfermagem não confere e
 * deixar na fila para sempre; devolver com o pedido escrito é o caminho que a
 * casa já usa.
 */
function FolhaTriagem({ evolucao, onFechar, onEnviar }: {
  evolucao: Evolucao; onFechar: () => void;
  onEnviar: (corpo: { acao: 'assinar' | 'pedir_complemento'; complemento?: string;
                      notaClinica?: string; pedido?: string }) => void;
}) {
  const [acao, setAcao] = useState<'assinar' | 'pedir_complemento'>('assinar');
  const [complemento, setComplemento] = useState('');
  const [pedido, setPedido] = useState('');
  const assinar = acao === 'assinar';
  const pode = assinar || pedido.trim().length > 0;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-tri"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-tri">Revisar · {evolucao.acolhido}</h3>
        <p className="mutetxt">
          {evolucao.tipo}
          {evolucao.acompanhante ? ` · acompanhou: ${evolucao.acompanhante}` : ''}
          {' '}· {evolucao.horasNaFila}h na fila.
        </p>
        {evolucao.estadoRetorno && (
          <div className="bloco"><small>Estado no retorno</small>{evolucao.estadoRetorno}</div>
        )}
        {evolucao.orientacoes && (
          <div className="bloco"><small>Orientações recebidas</small>{evolucao.orientacoes}</div>
        )}

        <div className="opts">
          <button type="button" className="opt c-ok" aria-pressed={assinar}
                  onClick={() => setAcao('assinar')}>Conferir e assinar</button>
          <button type="button" className="opt c-other" aria-pressed={!assinar}
                  onClick={() => setAcao('pedir_complemento')}>Devolver pedindo complemento</button>
        </div>

        {assinar ? (
          <>
            <label className="f" htmlFor="compl">
              Complemento da Enfermagem <small>— entra ao lado, sem reescrever o relato</small>
            </label>
            <textarea id="compl" value={complemento} onChange={(e) => setComplemento(e.target.value)}
                      placeholder="Ex.: grade conferida com a receita nova antes de valer na casa." />
          </>
        ) : (
          <>
            <label className="f" htmlFor="ped">
              O que falta <small>— obrigatório: quem acompanhou precisa saber o que completar</small>
            </label>
            <textarea id="ped" value={pedido} onChange={(e) => setPedido(e.target.value)}
                      placeholder="Ex.: falta o horário da próxima dose e o nome de quem atendeu." />
          </>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onEnviar(assinar
                    ? { acao: 'assinar', complemento }
                    : { acao: 'pedir_complemento', pedido })}>
            {assinar ? 'Assinar como Enfermagem' : 'Devolver com o pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A LINHA ÚNICA DA CRIANÇA (§7.3), e o que já saiu dela (§7.4).
 *
 * `GET /nursing/history/:personId` existia desde a fase 4 sem tela nenhuma. O
 * sistema guardava cada consulta, cada evolução assinada por quem acompanhou e
 * cada dose administrada — e a pergunta mais comum da casa, "quando é o retorno
 * do Bruno?", se respondia perguntando a um colega. Retorno se perde assim.
 *
 * Quatro decisões desta folha:
 *
 *  * o que está ESPERANDO alguém vem primeiro, contado pelo servidor. Retorno
 *    que já venceu não é história antiga: é pendência, e aparece como tal;
 *  * nada aqui ordena por gravidade nem sugere prioridade clínica — isso seria
 *    o sistema decidindo sobre a criança;
 *  * a evolução mostra quem ACOMPANHOU e o complemento da Enfermagem lado a
 *    lado. São duas vozes, e nenhuma escreve por cima da outra;
 *  * e a emissão do Resumo que foi gerada e nunca retirada fica marcada. O
 *    papel que ninguém pegou não chegou a lugar nenhum.
 */
function FolhaHistorico({ pessoa, dados, emissoes, onFechar, onBaixar, onDocumento }: {
  pessoa: { id: string; nome: string };
  dados: Historico; emissoes: Emissao[];
  onFechar: () => void; onBaixar: (emissaoId: string) => void; onDocumento: () => void;
}) {
  const [aba, setAba] = useState<'atendimentos' | 'evolucoes' | 'doses' | 'emissoes'>('atendimentos');
  const p = dados.pendencias;
  const nada = (o: string) => <li><div className="mutetxt">{o}</div></li>;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-hist"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-hist">Histórico de saúde · {pessoa.nome}</h3>

        {(p.retornosVencidos > 0 || p.retornosMarcados > 0 || p.internacaoEmAndamento
          || p.evolucoesAguardandoTriagem > 0) && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {p.internacaoEmAndamento && <span className="pill c-crit">Internação em andamento</span>}
            {p.retornosVencidos > 0 && (
              <span className="pill c-crit">
                {p.retornosVencidos} retorno(s) com a data já passada
              </span>
            )}
            {p.retornosMarcados > 0 && (
              <span className="pill c-warn">{p.retornosMarcados} retorno(s) marcado(s)</span>
            )}
            {p.evolucoesAguardandoTriagem > 0 && (
              <span className="pill c-med">
                {p.evolucoesAguardandoTriagem} evolução(ões) esperando a Enfermagem
              </span>
            )}
          </div>
        )}

        <div className="filtros" role="tablist">
          <button role="tab" aria-selected={aba === 'atendimentos'}
                  className={aba === 'atendimentos' ? 'on' : ''}
                  onClick={() => setAba('atendimentos')}>
            Atendimentos ({dados.atendimentos.length})
          </button>
          <button role="tab" aria-selected={aba === 'evolucoes'}
                  className={aba === 'evolucoes' ? 'on' : ''} onClick={() => setAba('evolucoes')}>
            Evoluções ({dados.evolucoes.length})
          </button>
          <button role="tab" aria-selected={aba === 'doses'}
                  className={aba === 'doses' ? 'on' : ''} onClick={() => setAba('doses')}>
            Doses ({dados.administracoes.length})
          </button>
          <button role="tab" aria-selected={aba === 'emissoes'}
                  className={aba === 'emissoes' ? 'on' : ''} onClick={() => setAba('emissoes')}>
            Resumos ({emissoes.length})
          </button>
        </div>

        {aba === 'atendimentos' && (
          <ul className="lista">
            {dados.atendimentos.map((a) => (
              <li key={a.id} className="row">
                <div className="grow">
                  <b className="ff">{a.tipoRotulo}</b>
                  <div className="mutetxt linhadois">
                    {dia(String(a.quando).slice(0, 10))}
                    {a.especialidade ? ` · ${a.especialidade}` : ''}
                    {a.local ? ` · ${a.local}` : ''}
                  </div>
                  {a.profissional && <div className="mutetxt">Atendeu: {a.profissional}</div>}
                  {a.motivo && <div className="mutetxt">Motivo: {a.motivo}</div>}
                  {a.desfecho && <div className="mutetxt">Desfecho: {a.desfecho}</div>}
                  {a.retornoEm && (
                    <div className={a.retornoVencido ? '' : 'mutetxt'}>
                      Retorno em {dia(a.retornoEm)}
                      {a.retornoVencido && <b> — a data já passou.</b>}
                    </div>
                  )}
                </div>
                <span className={`pill ${a.retornoVencido ? 'c-crit'
                  : a.status === 'em_andamento' ? 'c-warn'
                  : a.status === 'retorno_pendente' ? 'c-med' : 'c-ok'}`}>
                  {a.statusRotulo}
                </span>
              </li>
            ))}
            {dados.atendimentos.length === 0
              && nada('Nenhum atendimento registrado para esta criança.')}
          </ul>
        )}

        {aba === 'evolucoes' && (
          <ul className="lista">
            {dados.evolucoes.map((e) => (
              <li key={e.id}>
                <div className="row">
                  <div className="grow">
                    <b className="ff">{e.tipoRotulo}</b>
                    <div className="mutetxt linhadois">
                      {dia(String(e.quando).slice(0, 10))}
                      {e.acompanhante ? ` · acompanhou: ${e.acompanhante}` : ''}
                    </div>
                  </div>
                  <span className={`pill ${e.status === 'assinada' ? 'c-ok'
                    : e.status === 'complemento_solicitado' ? 'c-warn' : 'c-med'}`}>
                    {e.statusRotulo}
                  </span>
                </div>
                {e.estadoRetorno && (
                  <div className="bloco"><small>Como voltou</small>{e.estadoRetorno}</div>
                )}
                {e.orientacoes && (
                  <div className="bloco"><small>Orientações recebidas</small>{e.orientacoes}</div>
                )}
                {/* Duas vozes, lado a lado: quem acompanhou escreveu o que viu,
                    a Enfermagem complementou o que faltava. Nenhuma apaga a
                    outra. */}
                {e.complementoEnfermagem && (
                  <div className="bloco compl">
                    <small>Complemento da Enfermagem</small>{e.complementoEnfermagem}
                  </div>
                )}
              </li>
            ))}
            {dados.evolucoes.length === 0 && nada('Nenhuma evolução registrada.')}
          </ul>
        )}

        {aba === 'doses' && (
          <ul className="lista">
            {dados.administracoes.map((d, i) => (
              <li key={`${d.previsto}-${i}`} className="row">
                <div className="grow">
                  <b className="ff">{d.medicamento}</b>
                  <div className="mutetxt linhadois">
                    {d.dose} · previsto para {dia(String(d.previsto).slice(0, 10))} às {hhmm(d.previsto)}
                    {d.realizado ? ` · dado às ${hhmm(d.realizado)}` : ''}
                  </div>
                  {d.por && <div className="mutetxt">Confirmada por {d.por}.</div>}
                  {d.observacao && <div className="mutetxt">{d.observacao}</div>}
                </div>
                <span className={`pill ${TOM_DOSE[d.estado] ?? 'c-mute'}`}>{d.estadoRotulo}</span>
              </li>
            ))}
            {dados.administracoes.length === 0
              && nada('Nenhuma dose administrada registrada. Dose ainda por confirmar está na '
                      + 'grade do dia, não aqui.')}
          </ul>
        )}

        {aba === 'emissoes' && (
          <>
            <ul className="lista">
              {emissoes.map((em) => (
                <li key={em.id} className="row">
                  <div className="grow">
                    <b className="ff">
                      {FINALIDADES.find((f) => f.cod === em.finalidade)?.label ?? em.finalidade}
                    </b>
                    <div className="mutetxt linhadois">
                      {dia(String(em.geradoEm).slice(0, 10))} às {hhmm(em.geradoEm)}
                      {em.por ? ` · por ${em.por}` : ''}
                      {em.versaoOffline ? ' · versão offline' : ''}
                    </div>
                  </div>
                  {em.baixadoEm ? (
                    <span className="pill c-ok">Retirado em {dia(String(em.baixadoEm).slice(0, 10))}</span>
                  ) : (
                    <button className="btn sm" onClick={() => onBaixar(em.id)}>
                      Registrar que retirei
                    </button>
                  )}
                </li>
              ))}
              {emissoes.length === 0 && nada('Nenhum Resumo de Saúde emitido para esta criança.')}
            </ul>
            <p className="mutetxt" style={{ margin: '10px 0 0' }}>
              Cada emissão guarda a finalidade e quem emitiu. Um resumo <b>gerado e nunca
              retirado</b> não chegou a lugar nenhum — e é por isso que ele continua na lista.
            </p>
          </>
        )}

        <p className="mutetxt" style={{ marginTop: 12 }}>{dados.aviso}</p>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Fechar</button>
          {/* O documento que a enfermagem leva para a consulta. */}
          <button className="btn grow" onClick={onDocumento}>Ver em folha / baixar</button>
        </div>
      </div>
    </div>
  );
}

function FolhaResumo({ pessoa, onFechar, onGerar }: {
  pessoa: { id: string; nome: string }; onFechar: () => void; onGerar: (f: string) => void;
}) {
  const [finalidade, setFinalidade] = useState(FINALIDADES[0].cod);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-res"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-res">Resumo de Saúde · {pessoa.nome}</h3>
        <label className="f" htmlFor="fin-res">
          Finalidade da emissão <small>— obrigatória e registrada</small>
        </label>
        <select id="fin-res" value={finalidade} onChange={(e) => setFinalidade(e.target.value)}>
          {FINALIDADES.map((f) => <option key={f.cod} value={f.cod}>{f.label}</option>)}
        </select>
        <div className="notice c-warn">
          O documento sai marcado <b>confidencial — uso em saúde</b> e leva apenas o
          necessário para o atendimento.
        </div>
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" onClick={() => onGerar(finalidade)}>Gerar resumo</button>
        </div>
      </div>
    </div>
  );
}

/**
 * CADASTRAR ESQUEMA DE MEDICAMENTO (§11.1).
 *
 * O ato mais delicado da Enfermagem, e o que a tela protege:
 *
 *  * nasce RASCUNHO. Só entra na grade com a assinatura — a receita que veio
 *    da consulta não muda o que a casa dá sozinha;
 *  * "quando necessário" exige a CONDIÇÃO DE USO escrita pelo profissional. O
 *    sistema não decide quando dar; sem a frase, a decisão cai no colo de quem
 *    está no plantão às três da manhã;
 *  * horários são a grade. Sem horário, não há dose para ninguém confirmar —
 *    e "tomar de 8 em 8 horas" não é horário: é conta que alguém faz errado.
 */
function FolhaPrescricao({ acolhidos, onFechar, onGravar }: {
  acolhidos: AcolhidoPainel[]; onFechar: () => void;
  onGravar: (corpo: Record<string, unknown>) => void;
}) {
  const [personId, setPersonId] = useState('');
  const [tipo, setTipo] = useState('uso_continuo');
  const [medicamento, setMedicamento] = useState('');
  const [dose, setDose] = useState('');
  const [via, setVia] = useState('oral');
  const [horarios, setHorarios] = useState<string[]>(['08:00']);
  const [condicaoUso, setCondicaoUso] = useState('');
  const [prescritor, setPrescritor] = useState('');
  const [fim, setFim] = useState('');

  const seNecessario = tipo === 'quando_necessario';
  const pode = personId !== '' && medicamento.trim() !== '' && dose.trim() !== ''
    && (seNecessario ? condicaoUso.trim().length >= 10 : horarios.some((h) => h));

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-presc"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-presc">Cadastrar esquema de medicamento</h3>
        <div className="notice c-info">
          Entra como <b>rascunho</b>. A grade da casa só muda depois que você assinar.
        </div>

        <label className="f" htmlFor="pr-pessoa">Acolhido</label>
        <select id="pr-pessoa" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Escolha…</option>
          {acolhidos.map((k) => (
            <option key={k.acolhidoId} value={k.acolhidoId}>{k.nome}</option>
          ))}
        </select>

        <label className="f">Tipo</label>
        <div className="opts">
          {[
            { cod: 'uso_continuo', label: 'Uso contínuo' },
            { cod: 'tratamento', label: 'Tratamento com prazo' },
            { cod: 'quando_necessario', label: 'Quando necessário' },
            { cod: 'episodio_agudo', label: 'Episódio agudo' },
          ].map((t) => (
            <button type="button" key={t.cod} className="opt c-med"
                    aria-pressed={tipo === t.cod} onClick={() => setTipo(t.cod)}>{t.label}</button>
          ))}
        </div>

        <label className="f" htmlFor="pr-med">Medicamento</label>
        <input id="pr-med" value={medicamento} onChange={(e) => setMedicamento(e.target.value)}
               placeholder="Ex.: Amoxicilina 250 mg/5 mL" />

        <label className="f" htmlFor="pr-dose">Dose</label>
        <input id="pr-dose" value={dose} onChange={(e) => setDose(e.target.value)}
               placeholder="Ex.: 5 mL" />

        <label className="f" htmlFor="pr-via">Via</label>
        <select id="pr-via" value={via} onChange={(e) => setVia(e.target.value)}>
          {['oral', 'tópica', 'oftálmica', 'nasal', 'inalatória', 'subcutânea'].map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        {seNecessario ? (
          <>
            <label className="f" htmlFor="pr-cond">
              Condição de uso <small>— obrigatória, escrita pelo profissional</small>
            </label>
            <textarea id="pr-cond" value={condicaoUso} onChange={(e) => setCondicaoUso(e.target.value)}
                      placeholder="Ex.: dor referida ou temperatura acima de 37,8 °C; intervalo mínimo de 6 horas." />
            <p className="mutetxt">
              Sem esta frase, quem está no plantão decide sozinho quando dar — e essa
              decisão não é dele.
            </p>
          </>
        ) : (
          <>
            <label className="f">Horários da grade</label>
            {horarios.map((h, i) => (
              <div className="row" key={i} style={{ marginBottom: 6 }}>
                <input type="time" value={h} className="grow"
                       onChange={(e) => setHorarios(horarios.map((x, j) => j === i ? e.target.value : x))} />
                {horarios.length > 1 && (
                  <button className="btn sm ghost" type="button"
                          onClick={() => setHorarios(horarios.filter((_, j) => j !== i))}>
                    Remover
                  </button>
                )}
              </div>
            ))}
            <button className="btn sm ghost" type="button"
                    onClick={() => setHorarios([...horarios, '20:00'])}>
              + Outro horário
            </button>
          </>
        )}

        <label className="f" htmlFor="pr-quem">Quem prescreveu</label>
        <input id="pr-quem" value={prescritor} onChange={(e) => setPrescritor(e.target.value)}
               placeholder="Ex.: Dra. Fulana, UBS do bairro" />

        {tipo === 'tratamento' && (
          <>
            <label className="f" htmlFor="pr-fim">Até quando</label>
            <input id="pr-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            <p className="mutetxt">
              Tratamento com prazo que termina deixa de gerar dose — e deixa de aparecer como
              uso atual no Resumo de Saúde.
            </p>
          </>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onGravar({
                    personId, tipo, medicamento, dose, via,
                    horarios: seNecessario ? [] : horarios.filter(Boolean),
                    condicaoUso: seNecessario ? condicaoUso : undefined,
                    prescritor: prescritor || undefined,
                    fim: fim || undefined,
                  })}>
            Salvar como rascunho
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DA SUSPENSÃO (§11.1).
 *
 * O médico suspendeu o remédio e a grade continuava cobrando a dose todo dia —
 * e a Enfermagem só tinha o caminho de marcar "não administrada"
 * indefinidamente, o que num relatório se lê como negligência da casa.
 *
 * O motivo é a ORIENTAÇÃO que suspendeu, e não uma opinião: quem lê daqui a
 * seis meses precisa saber quem mandou parar. E a folha diz, com todas as
 * letras, que o que já foi confirmado continua registrado — suspender não
 * apaga o que a criança tomou.
 */
function FolhaSuspender({ esquema, onFechar, onSuspender }: {
  esquema: Esquema; onFechar: () => void; onSuspender: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const pode = motivo.trim().length >= 10;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-susp"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-susp">Suspender · {esquema.medicamento}</h3>
        <p className="mutetxt">
          {esquema.acolhido.nome} · {esquema.dose} · {esquema.via}
          {esquema.horarios.length ? ` · ${esquema.horarios.join(', ')}` : ''}
        </p>

        <div className="notice c-crit">
          Suspender tira o esquema da grade <b>a partir de agora</b>: as próximas doses deixam
          de ser geradas. O que já foi confirmado <b>continua registrado</b> — suspender não
          apaga o que a criança tomou, e não altera nenhuma dose de ontem.
        </div>

        <label className="f" htmlFor="susp-mot">
          A orientação que suspendeu <small>— quem mandou parar, e quando</small>
        </label>
        <textarea id="susp-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: consulta de retorno em 01/09 na UBS: a pediatra suspendeu o antibiótico por término do ciclo." />
        <p className="mutetxt">
          Escreva a orientação, não uma conclusão. Quem ler daqui a seis meses precisa saber
          <b> quem mandou parar</b> — "não estava fazendo efeito" não é orientação de ninguém.
        </p>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onSuspender(motivo.trim())}>
            Suspender, com esta orientação
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DA AUTORIZAÇÃO NOMINAL (§11.3).
 *
 * Autorizar um educador a administrar medicamento é a decisão mais pesada
 * desta tela, e por isso ela é NOMINAL — desta pessoa, nesta casa — e não do
 * cargo. Duas coisas que a folha diz de propósito:
 *
 *  * **o prazo é recomendado, não exigido.** Uma autorização sem fim é a que
 *    ninguém revisa; a tela sugere, e a coordenação decide;
 *  * **isto não substitui o protocolo.** Se o protocolo da casa não permite
 *    educador naquele período, a autorização nominal sozinha não faz a pessoa
 *    poder — e o servidor recusa a confirmação da dose por baixo.
 */
/**
 * A FOLHA DA EXCEÇÃO — o medicamento que só a Enfermagem dá (0930).
 *
 * Substituiu a folha do protocolo por período e a da autorização nominal, que
 * decidiam quem podia dar remédio em cada turno. Elas existiam porque a
 * instituição não tinha respondido a pendência 33.4.1; a resposta veio em
 * 08/09/2026 e diz que a Enfermagem atende das 9h às 17h e o educador de
 * plantão dá o resto. Manter aquelas telas seria pedir à coordenação uma
 * decisão que já foi tomada — e, pior, deixá-la ESQUECER de tomá-la, com a
 * dose da noite sendo recusada por isso.
 *
 * O que sobrou é real e é raro: injetável, controlado, de manejo difícil. O
 * motivo é obrigatório porque quem o lê é a educadora barrada às 22h, e "não
 * autorizado" sem explicação é a frase que faz alguém dar o remédio por fora
 * do sistema.
 */
function FolhaSoEnfermagem({ esquema, onFechar, onMarcar }: {
  esquema: Esquema;
  onFechar: () => void;
  onMarcar: (soEnfermagem: boolean, motivo: string) => void;
}) {
  const marcando = !esquema.soEnfermagem;
  const [motivo, setMotivo] = useState('');
  const pode = motivo.trim().length >= 15;
  /* O que já foi decidido sobre ESTE medicamento. Quem vai marcar precisa
     saber se alguém já marcou e desmarcou antes, e por quê — senão a decisão
     fica indo e voltando sem que ninguém veja a conversa. */
  const [historico, setHistorico] = useState<
    { id: string; antes: boolean; depois: boolean; motivo: string;
      por: string; quando: string }[]>([]);
  useEffect(() => {
    api<typeof historico>(`/medications/prescriptions/${esquema.id}/nurse-only-history`)
      .then(setHistorico).catch(() => setHistorico([]));
  }, [esquema.id]);
  return (
    <div className="folha" role="dialog" aria-modal="true" aria-labelledby="t-exc">
      <div className="folha-corpo stack">
        <h3 id="t-exc">
          {marcando ? 'Só a Enfermagem dá este medicamento' : 'Voltar a permitir o educador'}
        </h3>
        <p className="mutetxt">
          <b className="ff">{esquema.medicamento} {esquema.dose}</b> · {esquema.via}
          <br />{esquema.acolhido.nome}
        </p>
        <div className={`notice ${marcando ? 'c-warn' : 'c-info'}`}>
          {marcando
            ? 'Marcado assim, o educador de plantão NÃO poderá confirmar esta dose — nem à noite, '
              + 'quando a Enfermagem já foi embora. Use só quando o medicamento realmente exigir: '
              + 'injetável, controlado, de manejo difícil.'
            : 'O educador de plantão volta a poder dar este medicamento. O que valia antes '
              + 'continua registrado, com o seu nome.'}
        </div>
        <label className="f" htmlFor="exc-motivo">
          Por quê <small>— quem lê esta frase é quem for barrado às 22h</small>
        </label>
        <textarea id="exc-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder={marcando
                    ? 'Ex.: injetável, aplicação subcutânea conforme orientação da consulta de 04/09.'
                    : 'Ex.: passou a ser via oral na receita de 08/09; não exige mais aplicação.'} />
        {!pode && motivo.length > 0 && (
          <div className="mutetxt">Escreva um pouco mais — o motivo precisa explicar a decisão.</div>
        )}
        {historico.length > 0 && (
          <>
            <div className="eyebrow">O que já se decidiu sobre este medicamento</div>
            <ul className="lista">
              {historico.map((h) => (
                <li key={h.id}>
                  <b className="ff">
                    {h.depois ? 'passou a exigir a Enfermagem' : 'voltou a permitir o educador'}
                  </b>
                  <div className="mutetxt">{h.motivo}</div>
                  <div className="mutetxt">{h.por} · {quando(h.quando)}</div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onMarcar(marcando, motivo.trim())}>
            {marcando ? 'Marcar' : 'Desmarcar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Registrar uma compra de medicamento.
 *
 * `itens` é TEXTO e não vínculo com o estoque: uma nota traz cinco linhas, e
 * obrigar a casar cada uma com uma caixa cadastrada faria a prestação de
 * contas parar por um detalhe de cadastro. Quem confere a gaveta é a
 * Enfermagem, e ela faz isso pelo armário.
 */
function FolhaCompra({ houseId, onFechar, onPronto }: {
  houseId: string; onFechar: () => void; onPronto: () => void;
}) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [em, setEm] = useState(hoje);
  const [itens, setItens] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState('');
  const [anexo, setAnexo] = useState('');
  const [arquivo, setArquivo] = useState<Escolhido | null>(null);
  const [erro, setErro] = useState('');

  async function salvar() {
    setErro('');
    try {
      const centavos = valor.trim()
        ? Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100) : null;
      await api('/medications/purchases', {
        method: 'POST',
        body: JSON.stringify({
          houseId, em, itens: itens.trim(),
          fornecedor: fornecedor.trim(), totalCentavos: centavos,
          nota: nota.trim(),
          /* As duas formas, e nenhuma delas é obrigatória: a compra pode ser
             lançada antes de o papel aparecer, e é isso que o resumo conta. */
          conteudo: arquivo ? base64De(arquivo.dataUrl) : undefined,
          anexoRef: anexo.trim() || undefined,
          anexoNome: arquivo ? arquivo.nome : (anexo.trim() ? 'Nota fiscal' : undefined),
        }),
      });
      onPronto();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar a compra.');
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-compra"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-compra">Registrar compra</h3>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}

        <label className="f" htmlFor="cp-em">Comprado em</label>
        <input id="cp-em" type="date" value={em} onChange={(e) => setEm(e.target.value)} />

        <label className="f" htmlFor="cp-itens">O que foi comprado</label>
        <textarea id="cp-itens" rows={3} value={itens}
                  onChange={(e) => setItens(e.target.value)}
                  placeholder="Ex.: Dipirona 500mg — 2 caixas; Amoxicilina suspensão — 1 frasco." />
        <div className="mutetxt">
          Escreva como está na nota. Uma nota sem itens não presta contas de nada.
        </div>

        <label className="f" htmlFor="cp-forn">Onde (opcional)</label>
        <input id="cp-forn" value={fornecedor} maxLength={80}
               onChange={(e) => setFornecedor(e.target.value)} />

        <label className="f" htmlFor="cp-valor">Valor total (opcional)</label>
        <input id="cp-valor" inputMode="decimal" value={valor}
               onChange={(e) => setValor(e.target.value)} placeholder="0,00" />

        <label className="f" htmlFor="cp-nota">Número da nota (opcional)</label>
        <input id="cp-nota" value={nota} maxLength={40}
               onChange={(e) => setNota(e.target.value)} />

        {/* A NOTA, DE VERDADE (fase 108). Este campo era um texto onde a pessoa
            digitava uma referência qualquer: a nota "digitalizada" nunca teve
            por onde ser digitalizada. Agora sobe o papel — e quem só tem o
            caminho no Drive continua podendo escrevê-lo. */}
        <label className="f" htmlFor="cp-arq">Nota fiscal digitalizada (opcional)</label>
        <input id="cp-arq" type="file" accept="image/*,application/pdf"
               onChange={async (e) => {
                 const f = e.target.files?.[0];
                 setArquivo(f ? await lerArquivo(f) : null);
               }} />
        {arquivo && <PreviaEscolhida arquivo={arquivo}
          pergunta={<>É esta a nota? Ela é o que a prestação de contas pede no fim do mês.</>} />}

        <label className="f" htmlFor="cp-anexo">
          Ou onde ela está <small>— o caminho no Drive, se o papel já estiver lá</small>
        </label>
        <input id="cp-anexo" value={anexo} maxLength={200}
               onChange={(e) => setAnexo(e.target.value)}
               placeholder="Ex.: ADMINISTRATIVO/AI3/2026/09/notas/nota-1234.pdf" />
        <div className="mutetxt">
          Pode registrar agora e anexar depois — mas a lista mostra quantas ainda
          estão sem o papel, porque no fim do mês ninguém lembra qual foi.
        </div>

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={itens.trim().length < 3}
                  onClick={salvar}>Registrar</button>
        </div>
      </div>
    </div>
  );
}

/**
 * As receitas de um esquema.
 *
 * Documento médico: nasce restrito. O educador administra a dose e vê o
 * esquema, mas a receita traz CID e o nome do prescritor — e nada disso muda o
 * que ele faz às 22h. Por isso este botão não aparece para ele, e o servidor
 * recusa de qualquer jeito.
 */
function FolhaReceitas({ esquema, papel, onFechar }: {
  esquema: { id: string; medicamento: string }; papel: string; onFechar: () => void;
}) {
  const [lista, setLista] = useState<{ id: string; nome: string; tipo: string;
    em: string | null;
    prescritor: string | null; anexadoPor: string; anexadoEm: string;
    temArquivo: boolean; nomeDoArquivo: string | null;
    /** O espelho no dossiê da criança (fase 125). Nulo quando é referência. */
    noDossie: string | null }[]>([]);
  const [nome, setNome] = useState('');
  /* Receita ou BULA (fase 125) — *"se elas quiserem botar alguma bula, alguma
     receita […] que já caia direto no perfil da criança"*. */
  const [tipo, setTipo] = useState<'receita' | 'bula'>('receita');
  /* O PAPEL, e não um texto inventado (fase 108). Até aqui esta tela mandava
     `anexoRef: 'receita-' + Date.now()`: uma referência fabricada, que não
     apontava para lugar nenhum — a receita "digitalizada" do §8.6 nunca teve
     por onde ser digitalizada. */
  const [arquivo, setArquivo] = useState<Escolhido | null>(null);
  const [referencia, setReferencia] = useState('');
  const [vendo, setVendo] = useState<{ id: string; nome: string } | null>(null);
  const [prescritor, setPrescritor] = useState('');
  const [em, setEm] = useState('');
  const [erro, setErro] = useState('');
  const podeAnexar = ['enfermagem', 'equipe_tecnica', 'coordenador', 'gestor_geral']
    .includes(papel);

  const carregar = useCallback(async () => {
    try { setLista(await api(`/medications/prescriptions/${esquema.id}/documents`)); }
    catch (e) { setErro(e instanceof Error ? e.message : ''); }
  }, [esquema.id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function anexar() {
    setErro('');
    try {
      await api(`/medications/prescriptions/${esquema.id}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          nome: nome.trim(),
          conteudo: arquivo ? base64De(arquivo.dataUrl) : undefined,
          nomeArquivo: arquivo?.nome,
          anexoRef: referencia.trim() || undefined,
          em: em || null, prescritor: prescritor.trim(), tipo,
        }),
      });
      setNome(''); setPrescritor(''); setEm(''); setArquivo(null); setReferencia('');
      setTipo('receita');
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível anexar.');
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-rec"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-rec">Receitas e bulas — {esquema.medicamento}</h3>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}

        {lista.length === 0 && (
          <p className="mutetxt">
            Nenhuma receita anexada a este esquema. A lista vazia quer dizer que ninguém
            anexou — não que não exista receita.
          </p>
        )}
        <div className="stack">
          {lista.map((r) => (
            <div className="card" key={r.id}>
              <b className="ff">{r.nome}</b>
              <div className="mutetxt">
                {r.em ? new Date(`${r.em}T12:00:00-03:00`).toLocaleDateString('pt-BR') : 'sem data'}
                {r.prescritor ? ` · ${r.prescritor}` : ''}
              </div>
              <div className="row">
                <span className="pill c-info">{r.tipo === 'bula' ? 'bula' : 'receita'}</span>
                <span className={`pill ${r.temArquivo ? 'c-ok' : 'c-mute'}`}>
                  {r.temArquivo ? 'no sistema' : 'no Drive'}
                </span>
                <span className="mutetxt grow">Anexada por {r.anexadoPor}.</span>
                <BotaoOlho rotulo={r.temArquivo ? 'Ver o papel' : 'Onde está'}
                           onClick={() => setVendo({ id: r.id, nome: r.nome })} />
              </div>
              {/*
                * CHEGOU AO PERFIL DELA (fase 125) — e a tela diz, em vez de
                * deixar a Enfermagem na dúvida. O que veio por REFERÊNCIA não
                * chega, e a frase explica por quê: um documento na pasta da
                * criança que não abre é uma linha a mais e nada a mais.
                */}
              <div className="mutetxt">
                {r.noDossie
                  ? 'Também está no dossiê da criança — é o mesmo arquivo, não uma cópia.'
                  : 'Não entra no dossiê da criança: só o papel guardado no sistema entra, '
                    + 'porque um documento que não abre não ajuda ninguém.'}
              </div>
            </div>
          ))}
        </div>

        {podeAnexar && (
          <>
            <div className="eyebrow">Anexar</div>
            <label className="f">Que papel é este</label>
            <div className="opts">
              {([['receita', 'Receita'], ['bula', 'Bula']] as const).map(([cod, rot]) => (
                <button type="button" key={cod} className="opt c-other"
                        aria-pressed={tipo === cod} onClick={() => setTipo(cod)}>
                  {rot}
                </button>
              ))}
            </div>
            <label className="f" htmlFor="rc-nome">Como chamar este documento</label>
            {/* Nome NEUTRO: CPF e diagnóstico nunca em nome de arquivo. */}
            <input id="rc-nome" value={nome} maxLength={80}
                   onChange={(e) => setNome(e.target.value)}
                   placeholder="Ex.: Receita da consulta de setembro." />
            <label className="f" htmlFor="rc-em">Data da receita</label>
            <input id="rc-em" type="date" value={em} onChange={(e) => setEm(e.target.value)} />
            <label className="f" htmlFor="rc-presc">Quem receitou</label>
            <input id="rc-presc" value={prescritor} maxLength={80}
                   onChange={(e) => setPrescritor(e.target.value)} />

            <label className="f" htmlFor="rc-arq">
              A receita digitalizada <small>— foto ou PDF</small>
            </label>
            <input id="rc-arq" type="file" accept="image/*,application/pdf"
                   onChange={async (e) => {
                     const f = e.target.files?.[0];
                     setArquivo(f ? await lerArquivo(f) : null);
                   }} />
            {arquivo && <PreviaEscolhida arquivo={arquivo}
              pergunta={<>É esta a receita deste esquema? Ela é o que autoriza a
                prescrição — e é contra ela que a Enfermagem confere o que está na grade.</>} />}

            <label className="f" htmlFor="rc-ref">
              Ou onde ela está <small>— o caminho no Drive</small>
            </label>
            <input id="rc-ref" value={referencia} maxLength={200}
                   onChange={(e) => setReferencia(e.target.value)}
                   placeholder="Ex.: ACOLHIMENTO/AI3/2026/09/saude/receita.pdf" />

            <button className="btn block"
                    disabled={nome.trim().length < 3 || (!arquivo && !referencia.trim())}
                    onClick={anexar}>
              Anexar
            </button>
          </>
        )}

        <button className="btn sec block" style={{ marginTop: 12 }} onClick={onFechar}>
          Fechar
        </button>
      </div>

      {vendo && (
        <FolhaDocumentoGuardado
          titulo={vendo.nome}
          legenda="A abertura fica registrada com o seu nome e o horário."
          carregar={() => api<DocumentoOuCaminho>(
            `/medications/prescriptions/documents/${vendo.id}/file`)}
          onFechar={() => setVendo(null)} />
      )}
    </div>
  );
}

/**
 * O QUE O OLHO ABRE, NAS DUAS FORMAS.
 *
 * A rota devolve `arquivo` quando o papel está guardado aqui, e `referencia`
 * quando ele está no Drive. A tela diz qual das duas é — um botão que às vezes
 * mostra um PDF e às vezes um caminho de pasta, sem avisar, ensina a não
 * confiar nele.
 */
/* `carregar` é uma FUNÇÃO, e não o caminho da rota: rota guardada em variável
   escapa do `contrato-rotas.spec`, que confere se toda rota chamada pela tela
   existe no servidor. Quem pega isso é o próprio conferidor — e pegou. */
interface DocumentoOuCaminho {
  arquivo: { nome: string; tipo: string; conteudo: string } | null;
  referencia: string | null;
}
function FolhaDocumentoGuardado({ titulo, legenda, carregar, onFechar }: {
  titulo: string; legenda: string;
  carregar: () => Promise<DocumentoOuCaminho>; onFechar: () => void;
}) {
  const [r, setR] = useState<DocumentoOuCaminho | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    carregar()
      .then((x) => { if (vivo) setR(x); })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível abrir.'); });
    return () => { vivo = false; };
  }, []);

  const url = r?.arquivo ? `data:${r.arquivo.tipo};base64,${r.arquivo.conteudo}` : '';
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-docg"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-docg">{titulo}</h3>
        <p className="mutetxt">{legenda}</p>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {!r && !erro && <p className="mutetxt">Abrindo…</p>}
        {r?.arquivo && (r.arquivo.tipo.startsWith('image')
          ? <img className="previa-img" src={url} alt={titulo} />
          : <iframe className="previa-quadro" src={url} title={titulo} />)}
        {r && !r.arquivo && (
          <div className="bloco"><small>Onde está</small>{r.referencia ?? '—'}</div>
        )}
        <div className="row rodape">
          <button className="btn grow" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

/**
 * O MOVIMENTO DE UM ITEM DO ARMÁRIO.
 *
 * O saldo responde "quanto tem". Isto responde "para onde foram" — que é a
 * pergunta de quem conferiu a gaveta e achou dois a menos. A tabela existia
 * desde a migração 0200 e NINGUÉM a lia: três lugares escreviam, e o lugar de
 * abrir nunca tinha sido construído (§9, item 2).
 *
 * A lista é cronológica e **não conta por pessoa**. Cada linha traz o nome de
 * quem a fez, porque toda ação tem autor; somar movimento por educador é medir
 * gente, e o painel do plantão já proíbe isso pelo mesmo motivo.
 */
const MOVIMENTO_ROTULO: Record<string, string> = {
  entrada: 'Chegou remédio',
  ajuste: 'Conferência do armário',
  consumo: 'Dose administrada',
  descarte: 'Descarte',
  saida_com_acolhido: 'Foi com a criança',
};
/* A cor diz o ESTADO OPERACIONAL, nunca julgamento (§4.9): o que entrou, o que
   saiu pela dose, o que saiu com a criança, o que foi ajustado na contagem. */
const MOVIMENTO_TOM: Record<string, string> = {
  entrada: 'c-ok', ajuste: 'c-info', consumo: 'c-med',
  descarte: 'c-crit', saida_com_acolhido: 'c-move',
};

function FolhaMovimento({ item, onFechar }: {
  item: { id: string; medicamento: string }; onFechar: () => void;
}) {
  const [dados, setDados] = useState<{
    medicamento: string; unidade: string; quantidadeAgora: number; cortado: boolean;
    linhas: { id: string; tipo: string; quantidade: number; motivo: string | null;
              quando: string; por: string | null }[];
  } | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    api<typeof dados>(`/medications/stock/${item.id}/movements`)
      .then((d) => { if (vivo) setDados(d); })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível abrir o movimento.');
      });
    return () => { vivo = false; };
  }, [item.id]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-mov"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-mov">Movimento · {item.medicamento}</h3>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {!dados && !erro && <p className="mutetxt">Abrindo…</p>}

        {dados && (
          <>
            <p className="mutetxt">
              No armário agora: <b>{dados.quantidadeAgora} {dados.unidade}
              {dados.quantidadeAgora === 1 ? '' : 's'}</b>.
            </p>
            {dados.linhas.length === 0 && (
              <p className="mutetxt">
                Nenhum movimento registrado neste item. A lista vazia quer dizer que ninguém
                deu entrada nem conferiu — não que nada aconteceu.
              </p>
            )}
            <div className="stack">
              {dados.linhas.map((m) => (
                <div className="card" key={m.id}>
                  <div className="row">
                    <span className={`pill ${MOVIMENTO_TOM[m.tipo] ?? 'c-mute'}`}>
                      {MOVIMENTO_ROTULO[m.tipo] ?? m.tipo}
                    </span>
                    <b className="ff grow">
                      {m.quantidade > 0 ? '+' : ''}{m.quantidade} {dados.unidade}
                      {Math.abs(m.quantidade) === 1 ? '' : 's'}
                    </b>
                    <span className="mutetxt">{hhmm(m.quando)}</span>
                  </div>
                  {m.motivo && <div className="mutetxt">{m.motivo}</div>}
                  <div className="mutetxt">{m.por ?? '—'} · {dia(m.quando)}</div>
                </div>
              ))}
            </div>
            {dados.cortado && (
              <p className="mutetxt">
                Mostrando os 200 movimentos mais recentes. Há mais atrás deles.
              </p>
            )}
          </>
        )}

        <div className="row rodape">
          <button className="btn grow" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
