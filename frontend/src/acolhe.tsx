import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Icone } from './icones';
import { EscolherAnexo, Escolhido, base64De, oferecerFotosDaAcolhe } from './anexos';
import { MEXEM_NA_TELA, rotaDeLeituraPermitida } from '../../backend/src/modules/assistente/ferramentas';
import { calcular, numeroEmPortugues } from '../../backend/src/modules/assistente/calculo';
import { CriancaDaCasa, DESTINOS_DE_TEXTO, criancasNoPedido, pedeAcao, pedeFormulario, responderPeloGuia, TelaDoGuia } from './acolhe-guia';
import { apertarBotao, apertarEste, botoesDaTela, camposDaTela, preencherCampo, textoDaTela } from './acolhe-tela';
import { Ditado, aceitarAvisoDaVoz, avisoDaVozAceito, iniciarDitado, juntarAoTexto, reconhecimentoDeVoz } from './ditado';

/**
 * A ACOLHE+AI, EM TODAS AS TELAS (fase 192; pedido e decisões de 08/10).
 *
 * Minimizada num botão no canto; aberta, é uma conversa. Ela:
 *  - explica o sistema e leva à tela certa, por link ou indo junto;
 *  - lê os dados com o acesso de quem conversa: quem executa a leitura é ESTA
 *    tela, pelas rotas de sempre (`ferramentas.ts` explica por quê);
 *  - propõe registros, e NUNCA grava sozinha: a proposta é um cartão, e a
 *    pessoa confirma; a gravação sai no nome dela, e a auditoria anota que foi
 *    preparada com a assistente;
 *  - lê o que a pessoa anexar (foto ou PDF) e propõe onde guardar;
 *  - fala (lê a resposta e a tela em voz alta) e ouve (o microfone do navegador);
 *  - anota as sugestões de melhoria da equipe;
 *  - mexe na tela junto com a pessoa (fase 193): com a licença dela, uma vez
 *    por conversa, abre o formulário e escreve nos campos à vista, e o painel
 *    vira uma faixa para a pessoa ver o trabalho. NUNCA salva (`acolhe-tela.ts`);
 *  - faz a conta exata e monta a tabela para apresentar, com a planilha para
 *    baixar, que fica na auditoria como toda exportação (fase 193).
 *
 * E escreve como gente (fase 193): o `humanizar` tira o travessão, a lista e o
 * negrito que escaparem do modelo, porque a conversa é de colega para colega.
 *
 * A conversa mora AQUI, e some ao sair ou ao começar outra: não é registro, e
 * o que importa dela vira registro pela proposta confirmada.
 */
type Bloco = { type: string; [k: string]: unknown };
type MensagemDoModelo = { role: 'user' | 'assistant'; content: string | Bloco[] };

type Proposta =
  | { tipo: 'propor_linha_na_ata'; ataId: string; texto: string; restrita?: boolean }
  | { tipo: 'propor_anexo_no_dossie'; pessoaId: string; anexo: number; chave: string; titulo: string; validoAte?: string }
  | { tipo: 'propor_sugestao'; texto: string; tela?: string };

interface Tabela { titulo: string; colunas: string[]; linhas: (string | number | null)[][]; fonte: string }

interface Linha {
  id: number;
  quem: 'pessoa' | 'acolhe' | 'nota';
  texto: string;
  anexo?: string;
  proposta?: Proposta & { estado: 'aberta' | 'feita' | 'recusada' | 'erro'; detalhe?: string };
  conta?: { rotulo: string; conta: string; resultado: string };
  tabela?: Tabela;
  licenca?: 'aberta' | 'sim' | 'nao';
  rascunho?: Rascunho;
  /** O que a Acolhe+AI escreveu na tela nesta vez, para a pessoa conferir (fase 195). */
  feito?: { campo: string; valor: string }[];
}

/**
 * O RASCUNHO (fase 195): o texto que a Acolhe+AI organizou, antes de qualquer
 * registro. A pessoa edita, aprova, acrescenta falando, anexa foto e o leva
 * para a tela onde ele fica, e ali ainda confere e salva.
 */
interface Rascunho {
  titulo: string; texto: string; tela?: string; fotos: Escolhido[];
  estado: 'aberto' | 'aprovado' | 'levado' | 'descartado';
}


/**
 * A conversa de colega para colega (fase 193): o que escapar do modelo em
 * forma de documento técnico vira frase. Travessão vira vírgula, marcador de
 * lista e título somem, negrito some. O link [texto](tela:x) fica.
 */
export function humanizar(t: string): string {
  return t
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*\u2022]|\d{1,2}[.)])\s+/gm, '')
    .replace(/\*\*|__/g, '')
    .replace(/,\s*,/g, ',')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A planilha como o Excel em português abre: ponto e vírgula, vírgula decimal, BOM. */
function emPlanilha(t: Tabela): string {
  const celula = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    const x = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  };
  return '\ufeff' + [t.colunas, ...t.linhas].map((l) => l.map(celula).join(';')).join('\r\n');
}

const VOZES = ['Toda a equipe', 'Coordenação de acolhimento', 'Psicologia', 'Análise de sistemas', 'Engenharia'];
const MAX_VOLTAS = 12;
const LIMITE_RESULTADO = 30_000;

/** Lê em voz alta, em português, com a voz que o aparelho tiver. */
function falar(texto: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const fala = new SpeechSynthesisUtterance(texto.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 4000));
  fala.lang = 'pt-BR';
  const voz = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt'));
  if (voz) fala.voice = voz;
  window.speechSynthesis.speak(fala);
}

const DESCRICAO: Record<Proposta['tipo'], string> = {
  propor_linha_na_ata: 'Escrever esta linha na ATA do plantão',
  propor_anexo_no_dossie: 'Guardar o anexo no dossiê da criança',
  propor_sugestao: 'Registrar esta sugestão de melhoria',
};

const sem = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** No perfil, o verbo e as palavras de ligação não escolhem botão: o que escolhe é o assunto. */
const GENERICAS = /^(quero|preciso|gostaria|registrar|registra|escrever|escreve|acrescentar|acrescenta|atualizar|atualiza|lancar|lanca|anotar|anota|cadastrar|incluir|abrir|abre|abra|perfil|ficha|dela|dele|sobre|para|crianca|fazer|nova|novo|uma|pode|leva|mostra|mostrar)$/;

export function AcolheAI({ casa, telaAtual, telas, navegar, abrirCrianca }: {
  casa: { id: string; nome: string } | null;
  telaAtual: string;
  telas: TelaDoGuia[];
  navegar: (tela: string) => void;
  abrirCrianca: (pessoaId: string) => void;
}) {
  const [aberta, setAberta] = useState(false);
  const [ligada, setLigada] = useState<boolean | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [texto, setTexto] = useState('');
  const [anexo, setAnexo] = useState<Escolhido | null>(null);
  const [anexando, setAnexando] = useState(false);
  /* O botão de câmera (fase 194) abre o anexo já na câmera, no modo documento. */
  const [pelaCamera, setPelaCamera] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [lendo, setLendo] = useState('');
  const [voz, setVoz] = useState(VOZES[0]);
  const [lerRespostas, setLerRespostas] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [avisoVoz, setAvisoVoz] = useState(false);
  /** Recolhida numa faixa enquanto mexe na tela, para a pessoa ver o trabalho. */
  const [recolhida, setRecolhida] = useState(false);
  const [faixa, setFaixa] = useState('');
  const licenca = useRef<'perguntar' | 'sim' | 'nao'>('perguntar');
  const respostaDaLicenca = useRef<((sim: boolean) => void) | null>(null);
  const parar = useRef(false);
  const historico = useRef<MensagemDoModelo[]>([]);
  const anexos = useRef<Escolhido[]>([]);
  const seq = useRef(0);
  const fim = useRef<HTMLDivElement | null>(null);
  const ditado = useRef<Ditado | null>(null);
  const preenchidos = useRef<{ campo: string; valor: string }[]>([]);
  const ditadoDoRascunho = useRef<{ id: number; d: Ditado } | null>(null);
  const [rascunhoOuvindo, setRascunhoOuvindo] = useState<number | null>(null);
  const [falaProvisoria, setFalaProvisoria] = useState('');
  /** O que a pessoa confirmou ou recusou desde a última pergunta: vai junto com a próxima. */
  const pendenteParaOModelo = useRef<string[]>([]);
  /** As crianças da casa aberta, para o guia achar o nome no pedido (fase 196). */
  const criancas = useRef<{ casa: string; lista: CriancaDaCasa[] } | null>(null);

  useEffect(() => {
    if (!aberta || ligada !== null) return;
    api<{ ligada: boolean }>('/assistente/estado')
      .then((r) => setLigada(!!r.ligada)).catch(() => setLigada(false));
  }, [aberta, ligada]);

  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [linhas, lendo]);

  const acrescentar = (l: Omit<Linha, 'id'>) => setLinhas((xs) => [...xs, { ...l, id: ++seq.current }]);
  const mudarProposta = (id: number, estado: NonNullable<Linha['proposta']>['estado'], detalhe?: string) =>
    setLinhas((xs) => xs.map((l) => (l.id === id && l.proposta ? { ...l, proposta: { ...l.proposta, estado, detalhe } } : l)));

  function novaConversa() {
    historico.current = []; anexos.current = [];
    licenca.current = 'perguntar'; respostaDaLicenca.current?.(false); respostaDaLicenca.current = null;
    setPelaCamera(false); setAnexando(false);
    setLinhas([]); setTexto(''); setAnexo(null); setLendo(''); setRecolhida(false);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function dizer(t: string) {
    const h = humanizar(t);
    acrescentar({ quem: 'acolhe', texto: h });
    setFaixa(h.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').split('\n')[0].slice(0, 160));
    if (lerRespostas) falar(h);
  }

  /** A licença para mexer na tela: uma vez por conversa, e a resposta fica na auditoria. */
  function pedirLicenca(): Promise<boolean> {
    if (licenca.current === 'sim') return Promise.resolve(true);
    if (licenca.current === 'nao') return Promise.resolve(false);
    setRecolhida(false);
    acrescentar({ quem: 'acolhe', texto: '', licenca: 'aberta' });
    return new Promise((resolver) => { respostaDaLicenca.current = resolver; });
  }
  function responderLicenca(id: number, sim: boolean) {
    licenca.current = sim ? 'sim' : 'nao';
    setLinhas((xs) => xs.map((l) => (l.id === id ? { ...l, licenca: sim ? 'sim' : 'nao' } : l)));
    if (sim) {
      void api('/assistente/licenca', { method: 'POST', body: JSON.stringify({ tela: telaAtual, casaId: casa?.id }) })
        .catch(() => undefined);
    }
    respostaDaLicenca.current?.(sim);
    respostaDaLicenca.current = null;
  }

  // ---------- As ferramentas, executadas aqui, com a sessão de quem conversa ----------

  async function executar(nome: string, entrada: Record<string, unknown>): Promise<{ conteudo: string; erro?: boolean }> {
    if (nome === 'consultar_sistema') {
      const rota = String(entrada.rota ?? '');
      if (!rotaDeLeituraPermitida(rota)) return { conteudo: 'Esta rota não está no catálogo de leitura.', erro: true };
      setLendo(typeof entrada.motivo === 'string' ? entrada.motivo : 'lendo o sistema');
      try {
        const r = await api<unknown>(rota);
        const s = JSON.stringify(r);
        return { conteudo: s.length > LIMITE_RESULTADO ? `${s.slice(0, LIMITE_RESULTADO)} …(cortado)` : s };
      } catch (e) {
        const status = (e as { status?: number })?.status ?? 0;
        return { conteudo: `A tela recebeu ${status || 'falha de conexão'}: ${(e as Error).message}`, erro: true };
      }
    }
    if (nome === 'abrir_tela') {
      const tela = String(entrada.tela ?? '');
      if (typeof entrada.pessoaId === 'string' && entrada.pessoaId) {
        abrirCrianca(entrada.pessoaId);
        return { conteudo: 'O perfil da criança foi aberto.' };
      }
      if (!telas.some((t) => t.chave === tela)) return { conteudo: 'Esta tela não está no alcance da pessoa.', erro: true };
      navegar(tela);
      return { conteudo: `A tela ${tela} foi aberta.` };
    }
    if (nome === 'ver_tela') {
      await new Promise((r) => setTimeout(r, 200));
      return { conteudo: JSON.stringify({ tela: telaAtual, campos: camposDaTela(), botoes: botoesDaTela(), texto: textoDaTela() }) };
    }
    if (MEXEM_NA_TELA.includes(nome)) {
      if (parar.current) return { conteudo: 'A pessoa pediu para parar. Não mexa mais na tela nesta resposta.', erro: true };
      if (!(await pedirLicenca())) {
        return { conteudo: 'A pessoa não deixou mexer na tela. Explique o passo a passo para ela fazer.', erro: true };
      }
      setRecolhida(true);
      if (nome === 'preencher_campo') {
        setFaixa(`Escrevendo em ${String(entrada.campo ?? '')}…`);
        const r = await preencherCampo(String(entrada.campo ?? ''), String(entrada.valor ?? ''));
        if (r.ok && r.campo) preenchidos.current.push({ campo: r.campo, valor: String(entrada.valor ?? '') });
        return { conteudo: r.frase, erro: !r.ok };
      }
      setFaixa(`Abrindo ${String(entrada.botao ?? '')}…`);
      const r = await apertarBotao(String(entrada.botao ?? ''));
      return { conteudo: r.frase, erro: !r.ok };
    }
    if (nome === 'mostrar_rascunho') {
      const texto = humanizar(String(entrada.texto ?? '')).slice(0, 8000);
      if (texto.length < 3) return { conteudo: 'O rascunho veio vazio.', erro: true };
      const tela = typeof entrada.tela === 'string' && telas.some((x) => x.chave === entrada.tela) ? entrada.tela : undefined;
      acrescentar({ quem: 'acolhe', texto: '', rascunho: {
        titulo: humanizar(String(entrada.titulo ?? 'Rascunho')).slice(0, 120), texto, tela, fotos: [], estado: 'aberto' } });
      return { conteudo: 'O rascunho foi mostrado. Espere a pessoa aprovar, editar, acrescentar ou anexar foto; não preencha a tela antes.' };
    }
    if (nome === 'calcular') {
      const conta = String(entrada.conta ?? '');
      const rotulo = String(entrada.rotulo ?? 'Conta');
      const r = calcular(conta);
      if (!r.ok) return { conteudo: `A conta não fechou: ${r.erro}`, erro: true };
      acrescentar({ quem: 'nota', texto: '', conta: { rotulo, conta, resultado: numeroEmPortugues(r.valor) } });
      return { conteudo: `${rotulo}: ${conta} = ${r.valor}` };
    }
    if (nome === 'montar_tabela') {
      const colunas = Array.isArray(entrada.colunas) ? entrada.colunas.map((c) => String(c).slice(0, 60)) : [];
      const brutas = Array.isArray(entrada.linhas) ? entrada.linhas : [];
      if (!colunas.length || colunas.length > 12) return { conteudo: 'A tabela precisa de 1 a 12 colunas.', erro: true };
      if (brutas.length > 500) return { conteudo: 'A tabela passou de 500 linhas: resuma ou divida.', erro: true };
      const linhas = brutas.map((l) => (Array.isArray(l) ? l : []).slice(0, colunas.length)
        .map((v) => (typeof v === 'number' || v === null ? v : String(v).slice(0, 300))));
      if (linhas.some((l) => l.length !== colunas.length)) return { conteudo: 'Cada linha precisa de um valor por coluna.', erro: true };
      acrescentar({ quem: 'acolhe', texto: '', tabela: {
        titulo: humanizar(String(entrada.titulo ?? 'Tabela')).slice(0, 120), colunas, linhas,
        fonte: humanizar(String(entrada.fonte ?? '')).slice(0, 300) } });
      return { conteudo: 'A tabela foi mostrada à pessoa, com o botão de baixar como planilha.' };
    }
    if (nome.startsWith('propor_')) {
      const p = { ...entrada, tipo: nome } as unknown as Proposta;
      if (p.tipo === 'propor_anexo_no_dossie' && !anexos.current[(p.anexo ?? 0) - 1]) {
        return { conteudo: 'Não há anexo com esse número nesta conversa.', erro: true };
      }
      acrescentar({ quem: 'acolhe', texto: DESCRICAO[p.tipo], proposta: { ...p, estado: 'aberta' } });
      return { conteudo: 'A proposta foi mostrada à pessoa, que decide se confirma. Não diga que foi gravado.' };
    }
    return { conteudo: 'Ferramenta desconhecida.', erro: true };
  }

  async function confirmar(l: Linha) {
    const p = l.proposta!;
    try {
      let entidadeId: string | undefined;
      if (p.tipo === 'propor_linha_na_ata') {
        const r = await api<{ id?: string }>(`/shifts/ata/${p.ataId}/notes`, {
          method: 'POST', body: JSON.stringify({ texto: p.texto, restrita: p.restrita === true }) });
        entidadeId = r?.id;
      } else if (p.tipo === 'propor_anexo_no_dossie') {
        const arq = anexos.current[p.anexo - 1];
        const cat = await api<{ itens: { chave: string; categoria: string }[] }>('/people/dossie/catalogo');
        const item = cat.itens.find((i) => i.chave === p.chave);
        if (!item) throw new Error('Esse tipo de documento não está no catálogo do dossiê.');
        const r = await api<{ id?: string }>(`/people/${p.pessoaId}/documents`, {
          method: 'POST', body: JSON.stringify({ chave: item.chave, categoria: item.categoria, titulo: p.titulo,
            conteudo: arq.dataUrl, nomeArquivo: arq.nome, validoAte: p.validoAte || undefined }) });
        entidadeId = r?.id;
      } else {
        const r = await api<{ id?: string }>('/assistente/sugestoes', {
          method: 'POST', body: JSON.stringify({ texto: p.texto, tela: p.tela ?? telaAtual, casaId: casa?.id }) });
        entidadeId = r?.id;
      }
      await api('/assistente/preparado', { method: 'POST',
        body: JSON.stringify({ acao: p.tipo, entidadeId, casaId: casa?.id }) }).catch(() => undefined);
      mudarProposta(l.id, 'feita', 'Feito, em seu nome.');
      pendenteParaOModelo.current.push(`[A pessoa confirmou e foi gravado: ${DESCRICAO[p.tipo].toLowerCase()}.]`);
    } catch (e) {
      mudarProposta(l.id, 'erro', e instanceof Error ? e.message : 'Não foi possível gravar.');
    }
  }
  function recusar(l: Linha) {
    mudarProposta(l.id, 'recusada', 'Não foi feito.');
    pendenteParaOModelo.current.push(`[A pessoa recusou: ${DESCRICAO[l.proposta!.tipo].toLowerCase()}.]`);
  }

  // ---------- A conversa ----------

  /** A lista que a busca do topo já lê: só a casa aberta, só para quem vê os acolhidos. */
  async function criancasDaCasa(): Promise<CriancaDaCasa[]> {
    if (!casa || !telas.some((x) => x.chave === 'acolhidos')) return [];
    if (criancas.current?.casa === casa.id) return criancas.current.lista;
    const lista = await api<CriancaDaCasa[]>(`/people?houseId=${casa.id}`).catch(() => []);
    criancas.current = { casa: casa.id, lista: Array.isArray(lista) ? lista : [] };
    return criancas.current.lista;
  }

  async function pelosGuias(t: string, comAnexo = false) {
    if (comAnexo) {
      const dossie = telas.find((x) => x.chave === 'acolhidos');
      dizer(`No modo guia eu não leio arquivos. Para guardar um documento, abra o perfil da criança e o dossiê dela${dossie ? ': [Abrir os Acolhidos](tela:acolhidos)' : '.'}`);
      return;
    }
    const r = responderPeloGuia(t, telas, linhas.filter((l) => l.quem === 'acolhe').length === 0);
    /* A criança nomeada (fase 196): o perfil é o lugar dela. O rascunho, a
       sugestão e a conta continuam vindo antes: "relatório: a Alice voltou da
       escola" é texto para conferir, e não ida ao perfil. */
    let daCrianca: CriancaDaCasa | undefined;
    if (!r.rascunho && !r.sugestao && !r.conta) {
      const achadas = criancasNoPedido(t, await criancasDaCasa());
      if (achadas.length > 1) {
        dizer(`Há ${achadas.length} crianças com esse nome nesta casa: ${achadas.map((c) => `[${c.nome}](crianca:${c.id})`).join('  ')}. Qual delas?`);
        return;
      }
      if (achadas.length === 1 && (await peloPerfil(t, achadas[0], r.ir))) return;
      daCrianca = achadas[0];
    }
    /* Pedido sem nome de tela ("quero registrar um complemento", com o plantão
       aberto): vale para a tela em que a pessoa está, se ela tem esse formulário. */
    if (!r.ir && !r.rascunho && !r.sugestao && !r.conta && !daCrianca && pedeAcao(t)) {
      const aqui = telas.find((x) => x.chave === telaAtual);
      if (await abrirOFormulario(t, true, { tela: aqui?.titulo, chave: telaAtual })) {
        dizer('Abri o formulário aqui nesta tela. Preencha e salve quando estiver certo.');
        return;
      }
    }
    dizer(r.texto);
    if (r.conta) void executar('calcular', { conta: r.conta, rotulo: 'A conta' }).then((x) => { if (x.erro) dizer(x.conteudo); });
    if (r.ir) navegar(r.ir);
    /* "O diário da internação da Alice": na tela de destino, entra primeiro no
       registro dela (o cartão com o nome) e abre o formulário de dentro. */
    const titulo = telas.find((x) => x.chave === r.ir)?.titulo;
    const daCriancaNaTela = daCrianca
      ? { ignorar: sem(daCrianca.nome).split(/[^a-z0-9]+/), entrar: true, nomeDaCrianca: daCrianca.nome, tela: titulo }
      : { tela: titulo, chave: r.ir };
    if (r.ir && r.abrirFormulario) await abrirOFormulario(t, false, daCriancaNaTela);
    else if (r.ir) await abrirOFormulario(t, true, daCriancaNaTela);
    if (r.rascunho) {
      const tela = r.rascunho.tela && telas.some((x) => x.chave === r.rascunho!.tela) ? r.rascunho.tela : undefined;
      acrescentar({ quem: 'acolhe', texto: '', rascunho: { ...r.rascunho, tela, fotos: [], estado: 'aberto' } });
    }
    if (r.sugestao) acrescentar({ quem: 'acolhe', texto: DESCRICAO.propor_sugestao,
      proposta: { tipo: 'propor_sugestao', texto: r.sugestao, tela: telaAtual, estado: 'aberta' } });
  }

  /**
   * Abre o perfil da criança e, se o pedido nomeia um formulário dele, abre o
   * formulário (ou entra no dossiê e abre o de lá). Devolve falso quando o pedido
   * era de outra tela ("a ocorrência da Alice"): aí o caminho de sempre segue.
   */
  async function peloPerfil(t: string, c: CriancaDaCasa, outraTela?: string): Promise<boolean> {
    abrirCrianca(c.id);
    const primeiro = sem(c.nome).split(/[^a-z0-9]+/)[0];
    for (let i = 0; i < 30; i++) {
      const h = document.querySelector<HTMLElement>('main.conteudo h2');
      if (h && sem(h.innerText).includes(primeiro)) break;
      await new Promise((ok) => setTimeout(ok, 150));
    }
    const ignorar = sem(c.nome).split(/[^a-z0-9]+/);
    const abriu = await abrirOFormulario(t, true, { ignorar, entrar: true });
    if (abriu) { dizer(`Abri o perfil de ${c.nome} e o que você pediu. Se for um formulário, preencha e salve quando estiver certo.`); return true; }
    /* "Ver a internação da Alice": o pedido nomeou outra tela e não o perfil. */
    if (outraTela && outraTela !== 'acolhidos' && !/\b(perfil|ficha)\b/.test(sem(t))) return false;
    dizer(pedeFormulario(t)
      ? `Abri o perfil de ${c.nome}. Não achei nele um formulário com esse nome: os botões de registrar ficam em cada parte do perfil.`
      : `Abrindo o perfil de ${c.nome}.`);
    return true;
  }

  /**
   * No modo guia: com a licença, aperta o botão que abre o formulário da tela.
   * Com `ignorar` (o nome da criança) e `entrar` (fase 196), conta só as palavras
   * do que se quer, aceita uma em comum, e passa por um botão de entrar (o
   * dossiê) antes do formulário de dentro dele.
   */
  async function abrirOFormulario(pedido: string, soSeCombinar = false,
    { ignorar = [], entrar = false, nomeDaCrianca, tela, chave }: { ignorar?: string[]; entrar?: boolean; nomeDaCrianca?: string; tela?: string; chave?: string } = {}): Promise<boolean> {
    await new Promise((r) => setTimeout(r, 350));
    /* O nome da tela de destino já levou à tela: não escolhe aba nem cartão
       ("me leva para Internação hospitalar" não entra no Hospital Fictício). */
    const daTela = tela ? sem(tela).split(/[^a-z]+/) : [];
    const palavras = sem(pedido).split(/[^a-z]+/)
      .filter((w) => w.length > 3 && !ignorar.includes(w) && !(entrar && GENERICAS.test(w)));
    const tem = (texto: string) => palavras.filter((w) => sem(texto).includes(w.slice(0, 5))).length;
    /* O que o pedido diz além do nome da tela e dos verbos: "me leva para a Cozinha" não diz nada. */
    const assunto = palavras.filter((w) => !daTela.includes(w) && !GENERICAS.test(w));
    const temNoCaminho = (texto: string) => palavras.filter((w) => !daTela.includes(w) && sem(texto).includes(w.slice(0, 5))).length;
    /* Formulário pedido sem a criança precisa de duas palavras em comum ("quero
       abrir uma chamada"); com ela, ou no perfil, uma basta. */
    const minimo = entrar ? 1 : 2;
    const jaApertados: HTMLElement[] = [];
    const abasOlhadas: string[] = [];
    /* O caminho pode passar por uma entrada (o dossiê, o acervo, o plantão) e por
       uma aba (Vivências, Compras) antes do formulário: até três passos, mais as
       abas que ela olha uma a uma quando nenhuma casa com o pedido. */
    for (let nivel = 0, passos = 0; nivel < 3 && passos < 10; passos++) {
      const visivel = (el: HTMLElement) => el.getClientRects().length > 0 && !jaApertados.includes(el);
      const formularios = Array.from(document.querySelectorAll<HTMLElement>('main.conteudo [data-acolhe-abre]')).filter(visivel);
      const caminhos = Array.from(document.querySelectorAll<HTMLElement>(
        'main.conteudo [data-acolhe-entra], main.conteudo [role="tab"]:not([aria-selected="true"])')).filter(visivel);
      /* O botão repetido em cada linha (o "Registrar retorno" de cada criança)
         desempata pela linha: a palavra do pedido escrita ao lado dele. */
      const pontos = (el: HTMLElement) => {
        const linha = el.closest('li, .card, .row');
        return tem(el.innerText) * 2 + (linha && linha !== el ? Math.min(1, tem((linha as HTMLElement).innerText) - tem(el.innerText)) : 0);
      };
      const melhor = (xs: HTMLElement[]) => xs.reduce<HTMLElement | undefined>((m, el) => (!m || pontos(el) > pontos(m) ? el : m), undefined);
      /* O registro com o nome da criança vem antes de tudo. */
      const doNome = nomeDaCrianca && nivel === 0
        ? caminhos.find((el) => el.hasAttribute('data-acolhe-entra') && sem(el.innerText).includes(sem(nomeDaCrianca).split(/[^a-z0-9]+/)[0]))
        : undefined;
      const form = melhor(formularios);
      const caminho = caminhos.reduce<HTMLElement | undefined>((m, el) => (!m || temNoCaminho(el.innerText) > temNoCaminho(m.innerText) ? el : m), undefined);
      const pf = form ? tem(form.innerText) : 0;
      const pc = caminho ? temNoCaminho(caminho.innerText) : 0;
      let alvo: HTMLElement | undefined;
      if (doNome) alvo = doNome;
      else if (form && pf >= minimo && pf >= pc) alvo = form;
      else if (caminho && pc >= 1) alvo = caminho;
      else if (form && !soSeCombinar && nivel === 0) alvo = form; // pediu para criar: o primeiro formulário da tela
      /* Nada casa, mas a tela tem abas que ela ainda não olhou: olha a próxima
         (aba só mostra; o formulário pedido pode estar atrás dela). */
      if (!alvo && !(form && pf >= 1) && assunto.length >= (soSeCombinar ? 2 : 1)) {
        const aba = Array.from(document.querySelectorAll<HTMLElement>('main.conteudo [role="tab"]'))
          .find((el) => el.getClientRects().length > 0 && !abasOlhadas.includes(el.innerText.trim()) && el.getAttribute('aria-selected') !== 'true');
        if (aba) {
          document.querySelectorAll<HTMLElement>('main.conteudo [role="tab"][aria-selected="true"]').forEach((el) => abasOlhadas.push(el.innerText.trim()));
          abasOlhadas.push(aba.innerText.trim());
          const r = await apertarAqui(aba);
          if (r.erro) { dizer(r.conteudo); return false; }
          await new Promise((ok) => setTimeout(ok, 350));
          continue;
        }
      }
      /* Nada casa e não há aba: o formulário pode morar dentro de um dos
         registros da tela (o complemento, no plantão em que a pessoa assinou).
         Ela entra em cada um, até quatro, e procura. */
      if (!alvo && nivel === 0 && chave && !nomeDaCrianca && assunto.length >= (soSeCombinar ? 2 : 1)) {
        if (await procurarNasEntradas(chave, (t) => assunto.filter((w) => sem(t).includes(w.slice(0, 5))).length)) return true;
      }
      if (!alvo) {
        if (nivel > 0) return true;
        if (!soSeCombinar) dizer('Esta tela não tem um formulário que eu saiba abrir. O botão para começar está no alto da tela.');
        return false;
      }
      const r = await apertarAqui(alvo);
      if (r.erro) { dizer(r.conteudo); return false; }
      if (alvo.hasAttribute('data-acolhe-abre')) {
        setFaixa('Abri o formulário. Preencha e salve quando estiver certo.');
        return true;
      }
      jaApertados.push(alvo);
      abasOlhadas.length = 0;
      nivel++;
      await new Promise((ok) => setTimeout(ok, 450));
    }
    return true;
  }

  async function procurarNasEntradas(chave: string, tem: (t: string) => number): Promise<boolean> {
    const entradas = () => Array.from(document.querySelectorAll<HTMLElement>('main.conteudo [data-acolhe-entra]'))
      .filter((el) => el.getClientRects().length > 0);
    const total = Math.min(4, entradas().length);
    const outra = telas.find((x) => x.chave !== chave)?.chave;
    for (let k = 0; k < total; k++) {
      if (k > 0) {
        if (!outra) return false;
        navegar(outra); await new Promise((ok) => setTimeout(ok, 250));
        navegar(chave); await new Promise((ok) => setTimeout(ok, 700));
      }
      const el = entradas()[k];
      if (!el) break;
      const r = await apertarAqui(el);
      if (r.erro) { dizer(r.conteudo); return false; }
      await new Promise((ok) => setTimeout(ok, 700));
      const form = Array.from(document.querySelectorAll<HTMLElement>('main.conteudo [data-acolhe-abre]'))
        .filter((x) => x.getClientRects().length > 0)
        .reduce<HTMLElement | undefined>((m, x) => (!m || tem(x.innerText) > tem(m.innerText) ? x : m), undefined);
      if (form && tem(form.innerText) >= 1) {
        const f = await apertarAqui(form);
        if (f.erro) { dizer(f.conteudo); return false; }
        setFaixa('Abri o formulário. Preencha e salve quando estiver certo.');
        return true;
      }
    }
    if (total && outra) { navegar(outra); await new Promise((ok) => setTimeout(ok, 250)); navegar(chave); }
    return false;
  }

  /** O guia aperta o elemento que escolheu, com as mesmas regras das ferramentas: parar, licença, faixa. */
  async function apertarAqui(el: HTMLElement): Promise<{ conteudo: string; erro?: boolean }> {
    if (parar.current) return { conteudo: 'Parei, como você pediu.', erro: true };
    if (!(await pedirLicenca())) return { conteudo: 'Tudo bem, não mexo na tela. O botão para começar está na própria tela.', erro: true };
    setRecolhida(true);
    const nome = (el.getAttribute('aria-label') || el.innerText || '').trim().split('\n')[0];
    setFaixa(`Abrindo ${nome}…`);
    const r = await apertarEste(el);
    return { conteudo: r.frase, erro: !r.ok };
  }

  // ---------- O rascunho (fase 195) ----------

  const mudarRascunho = (id: number, patch: Partial<Rascunho>) =>
    setLinhas((xs) => xs.map((l) => (l.id === id && l.rascunho ? { ...l, rascunho: { ...l.rascunho, ...patch } } : l)));

  /** O resumo do que foi escrito na tela, para a pessoa conferir antes de salvar. */
  function mostrarFeito() {
    const lista = preenchidos.current.splice(0);
    if (lista.length) acrescentar({ quem: 'nota', texto: '', feito: lista });
  }

  function acrescentarFalando(l: Linha) {
    if (ditadoDoRascunho.current) {
      const era = ditadoDoRascunho.current.id;
      ditadoDoRascunho.current.d.parar();
      if (era === l.id) return;
    }
    if (!reconhecimentoDeVoz()) { dizer('Este navegador não ouve pelo microfone. Escreva no rascunho, por favor.'); return; }
    if (!avisoDaVozAceito()) { setAvisoVoz(true); return; }
    const d = iniciarDitado({
      onCerto: (t) => setLinhas((xs) => xs.map((x) => (x.id === l.id && x.rascunho
        ? { ...x, rascunho: { ...x.rascunho, texto: juntarAoTexto(x.rascunho.texto, t) } } : x))),
      onProvisorio: setFalaProvisoria,
      onFim: () => { ditadoDoRascunho.current = null; setRascunhoOuvindo(null); setFalaProvisoria(''); },
      onErro: (f) => dizer(f),
    });
    if (d) { ditadoDoRascunho.current = { id: l.id, d }; setRascunhoOuvindo(l.id); }
  }

  function aprovar(l: Linha) {
    const r = l.rascunho!;
    ditadoDoRascunho.current?.d.parar();
    mudarRascunho(l.id, { estado: 'aprovado' });
    if (ligada) {
      r.fotos.forEach((f) => anexos.current.push(f));
      pendenteParaOModelo.current.push(`[A pessoa aprovou o rascunho "${r.titulo}"${r.fotos.length ? `, com ${r.fotos.length} foto(s) anexada(s) à conversa` : ''}. O texto final, como ela deixou:\n${r.texto}]`);
      void enviar('Aprovei o rascunho.');
      return;
    }
    dizer(r.tela
      ? 'Ótimo. Agora é só levar o texto para a tela: eu abro o formulário e escrevo, e você confere e salva.'
      : 'Ótimo. Escolha no cartão onde o texto vai ficar, e eu levo: abro o formulário e escrevo, e você confere e salva.');
  }

  /** Leva o rascunho aprovado à tela: abre, abre o formulário, escreve no campo de texto longo, oferece as fotos. */
  async function levar(l: Linha) {
    const r = l.rascunho!;
    if (!r.tela) return;
    navegar(r.tela);
    await new Promise((ok) => setTimeout(ok, 500));
    const abriu = await abrirOFormulario(`${r.titulo} ${r.texto.slice(0, 200)}`);
    if (!abriu) return;
    await new Promise((ok) => setTimeout(ok, 400));
    const campo = camposDaTela().find((c) => c.tipo === 'texto longo');
    if (!campo) {
      dizer('Abri o formulário, mas não achei nele um campo de texto longo. O rascunho continua aqui para você copiar.');
      return;
    }
    const e = await executar('preencher_campo', { campo: String(campo.n), valor: r.texto });
    if (e.erro) { dizer(e.conteudo); return; }
    if (r.fotos.length) oferecerFotosDaAcolhe(r.fotos);
    mudarRascunho(l.id, { estado: 'levado' });
    mostrarFeito();
    setFaixa(r.fotos.length
      ? 'Escrevi o rascunho no formulário. No anexo, use Usar a foto da Acolhe+AI. Confira tudo e salve.'
      : 'Escrevi o rascunho no formulário. Confira, mude o que quiser e salve.');
  }

  async function enviar(forcado?: string) {
    const t = (forcado ?? texto).trim();
    if ((!t && !anexo) || ocupada) return;
    const meu = forcado ? null : anexo;
    ditado.current?.parar();
    if (!forcado) { setTexto(''); setAnexo(null); setAnexando(false); setPelaCamera(false); }
    acrescentar({ quem: 'pessoa', texto: t || 'Veja este arquivo.', anexo: meu?.nome });
    if (!ligada) {
      /* O guia também trabalha na tela (abre o perfil, o formulário): "Pensando…" enquanto isso. */
      setOcupada(true);
      void pelosGuias(t, !!meu && !t).finally(() => setOcupada(false));
      return;
    }

    const conteudo: Bloco[] = [];
    if (meu) {
      anexos.current.push(meu);
      const dados = base64De(meu.dataUrl);
      conteudo.push(meu.tipo === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: dados } }
        : { type: 'image', source: { type: 'base64', media_type: meu.tipo, data: dados } });
    }
    const notas = pendenteParaOModelo.current.splice(0);
    const fala = [...notas, meu ? `(Anexo ${anexos.current.length}: ${meu.nome})` : '', t || 'Veja este arquivo.']
      .filter(Boolean).join('\n');
    conteudo.push({ type: 'text', text: fala });
    historico.current.push({ role: 'user', content: conteudo });

    setOcupada(true);
    parar.current = false;
    try {
      for (let volta = 0; volta < MAX_VOLTAS; volta++) {
        const r = await api<{ conteudo: Bloco[]; parada: string; guardar: boolean }>('/assistente/conversa', {
          method: 'POST',
          body: JSON.stringify({ mensagens: historico.current, contexto: {
            casaId: casa?.id, casaNome: casa?.nome, tela: telaAtual, voz: voz === VOZES[0] ? null : voz,
            telas: telas.map((x) => ({ chave: x.chave, titulo: x.titulo, frase: x.frase })),
          } }),
        });
        if (!r.guardar) {
          historico.current.pop();
          r.conteudo.forEach((b) => b.type === 'text' && dizer(String(b.text)));
          break;
        }
        historico.current.push({ role: 'assistant', content: r.conteudo });
        const falas = r.conteudo.filter((b) => b.type === 'text').map((b) => String(b.text)).join('\n').trim();
        if (falas) dizer(falas);
        const pedidos = r.conteudo.filter((b) => b.type === 'tool_use');
        if (!pedidos.length) break;
        const resultados: Bloco[] = [];
        if (parar.current) {
          pedidos.forEach((p) => resultados.push({ type: 'tool_result', tool_use_id: p.id, content: 'A pessoa pediu para parar.', is_error: true }));
          historico.current.push({ role: 'user', content: resultados });
          dizer('Parei. O que já estava escrito na tela continua lá, para você conferir.');
          break;
        }
        for (const p of pedidos) {
          const res = await executar(String(p.name), (p.input ?? {}) as Record<string, unknown>);
          resultados.push({ type: 'tool_result', tool_use_id: p.id, content: res.conteudo, ...(res.erro ? { is_error: true } : {}) });
        }
        setLendo('');
        historico.current.push({ role: 'user', content: resultados });
        if (volta === MAX_VOLTAS - 1) dizer('Parei aqui para não demorar demais. Pergunte de novo, por partes, se precisar.');
      }
    } catch (e) {
      historico.current = historico.current.filter((m) => m.content !== conteudo);
      /* O protótipo recusa como o servidor sem a chave: 503, "responde só pelo guia". */
      if ((e as { status?: number })?.status === 503 && /guia/.test((e as Error).message)) {
        setLigada(false);
        pelosGuias(t);
      } else {
        dizer(e instanceof Error ? e.message : 'A Acolhe+AI não respondeu agora.');
      }
    } finally {
      setOcupada(false); setLendo('');
      mostrarFeito();
    }
  }

  /**
   * O microfone da Acolhe+AI é o ditado longo (fase 195): o relatório falado
   * aparece na caixa enquanto a pessoa fala, e ela confere antes de enviar.
   * Fala até apertar de novo; uma pausa para pensar não corta.
   */
  function ouvir() {
    if (ouvindo) { ditado.current?.parar(); return; }
    if (!reconhecimentoDeVoz()) { dizer('Este navegador não ouve pelo microfone. Escreva, por favor.'); return; }
    if (!avisoDaVozAceito()) { setAvisoVoz(true); return; }
    ditado.current = iniciarDitado({
      onCerto: (t) => setTexto((x) => juntarAoTexto(x, t)),
      onProvisorio: setFalaProvisoria,
      onFim: () => { ditado.current = null; setOuvindo(false); setFalaProvisoria(''); },
      onErro: (f) => dizer(f),
    });
    if (ditado.current) setOuvindo(true);
  }

  function lerTela() {
    const t = (document.querySelector('main.conteudo') as HTMLElement | null)?.innerText?.trim();
    if (!t) { dizer('Não achei texto nesta tela para ler.'); return; }
    falar(t);
  }

  // ---------- A tela ----------

  function Texto({ t }: { t: string }) {
    const partes = t.split(/(\[[^\]]+\]\((?:tela|crianca):[^)\s]+\))/g);
    return (
      <p className="acolhe-texto">
        {partes.map((p, i) => {
          const m = /^\[([^\]]+)\]\((tela|crianca):([^)\s]+)\)$/.exec(p);
          if (!m) return <Fragment key={i}>{p.replace(/\*\*/g, '')}</Fragment>;
          const [, rotulo, tipo, alvo] = m;
          if (tipo === 'tela' && !telas.some((x) => x.chave === alvo)) return <Fragment key={i}>{rotulo}</Fragment>;
          return (
            <button key={i} type="button" className="acolhe-link"
                    onClick={() => (tipo === 'tela' ? navegar(alvo) : abrirCrianca(alvo))}>
              {rotulo}
            </button>
          );
        })}
      </p>
    );
  }

  function Cartao({ l }: { l: Linha }) {
    const p = l.proposta!;
    return (
      <div className="acolhe-proposta" role="group" aria-label={DESCRICAO[p.tipo]}>
        <strong>{DESCRICAO[p.tipo]}</strong>
        {p.tipo === 'propor_linha_na_ata' && <p className="acolhe-texto">{p.texto}{p.restrita ? ' (restrita)' : ''}</p>}
        {p.tipo === 'propor_sugestao' && <p className="acolhe-texto">{p.texto}</p>}
        {p.tipo === 'propor_anexo_no_dossie' && (
          <p className="acolhe-texto">
            {anexos.current[p.anexo - 1]?.nome} · {p.titulo}{p.validoAte ? ` · vale até ${p.validoAte.split('-').reverse().join('/')}` : ''}
          </p>
        )}
        {p.estado === 'aberta' ? (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => void confirmar(l)}>Confirmar</button>
            <button className="btn sm sec" onClick={() => recusar(l)}>Não fazer</button>
          </div>
        ) : (
          <p className={`acolhe-estado ${p.estado}`} role="status">{p.detalhe}</p>
        )}
      </div>
    );
  }

  function Licenca({ l }: { l: Linha }) {
    if (l.licenca !== 'aberta') {
      return (
        <p className="acolhe-estado" role="status">
          {l.licenca === 'sim' ? 'Você deixou a Acolhe+AI preencher a tela nesta conversa.' : 'Você preferiu fazer na tela por conta própria.'}
        </p>
      );
    }
    return (
      <div className="acolhe-proposta" role="group" aria-labelledby={`t-licenca-${l.id}`}>
        <strong id={`t-licenca-${l.id}`}>Posso mexer na tela com você?</strong>
        <p className="acolhe-texto">
          Eu abro o formulário e escrevo nos campos, e você vê tudo acontecendo. Nada é salvo por mim:
          você confere, muda o que quiser e salva quando estiver certo.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => responderLicenca(l.id, true)}>Pode mexer</button>
          <button className="btn sm sec" onClick={() => responderLicenca(l.id, false)}>Prefiro eu fazer</button>
        </div>
      </div>
    );
  }

  /*
   * O CARTÃO DO RASCUNHO. Chamado como função, e não como componente: um
   * componente declarado aqui dentro nasceria de novo a cada letra, e o campo
   * perderia o cursor no meio da frase.
   */
  function cartaoDoRascunho(l: Linha) {
    const r = l.rascunho!;
    const destinos = telas.filter((x) => DESTINOS_DE_TEXTO.includes(x.chave));
    const aberto = r.estado === 'aberto';
    const ouvindoAqui = rascunhoOuvindo === l.id;
    return (
      <div className="acolhe-proposta acolhe-rascunho" role="group" aria-labelledby={`t-rasc-${l.id}`}>
        <strong id={`t-rasc-${l.id}`}>Rascunho: {r.titulo}</strong>
        <label htmlFor={`rasc-${l.id}`} className="so-leitor">O texto do rascunho</label>
        <textarea id={`rasc-${l.id}`} rows={Math.min(12, Math.max(4, Math.ceil(r.texto.length / 50)))}
                  value={r.texto} readOnly={r.estado === 'levado' || r.estado === 'descartado'}
                  onChange={(e) => mudarRascunho(l.id, { texto: e.target.value })} />
        {ouvindoAqui && (
          <p className="acolhe-fala" role="status" aria-live="polite">{falaProvisoria || 'Ouvindo. O que você falar entra no fim do rascunho.'}</p>
        )}
        {r.fotos.length > 0 && (
          <ul className="acolhe-rascunho-fotos" aria-label="Fotos do rascunho">
            {r.fotos.map((f, i) => (
              <li key={i}>
                {f.dataUrl.startsWith('data:image')
                  ? <img src={f.dataUrl} alt={`Foto ${i + 1} do rascunho`} />
                  : <span className="mutetxt">{f.nome}</span>}
                {aberto && (
                  <button type="button" className="btn sm ghost" onClick={() => mudarRascunho(l.id, { fotos: r.fotos.filter((_, j) => j !== i) })}>
                    Tirar a foto {i + 1}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {aberto && (
          <EscolherAnexo id={`rasc-foto-${l.id}`} arquivo={null} multiplos aceita="image/jpeg,image/png"
                         onEscolher={(f) => { if (f) mudarRascunho(l.id, { fotos: [...r.fotos, f] }); }} />
        )}
        {(aberto || r.estado === 'aprovado') && destinos.length > 0 && (
          <label className="acolhe-destino">
            <span>Onde vai ficar</span>
            <select value={r.tela ?? ''} onChange={(e) => mudarRascunho(l.id, { tela: e.target.value || undefined })}>
              <option value="">Escolha a tela</option>
              {destinos.map((d) => <option key={d.chave} value={d.chave}>{d.titulo}</option>)}
            </select>
          </label>
        )}
        {aberto && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={() => aprovar(l)}><Icone nome="certo" /> Está bom</button>
            <button className="btn sm sec" aria-pressed={ouvindoAqui} onClick={() => acrescentarFalando(l)}>
              <Icone nome="microfone" /> {ouvindoAqui ? 'Parar de ouvir' : 'Acrescentar falando'}
            </button>
            <button className="btn sm ghost" onClick={() => mudarRascunho(l.id, { estado: 'descartado' })}>Descartar</button>
          </div>
        )}
        {r.estado === 'aprovado' && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn sm" disabled={!r.tela} onClick={() => void levar(l)}>
              Levar para a tela{r.tela ? `: ${telas.find((x) => x.chave === r.tela)?.titulo ?? r.tela}` : ''}
            </button>
            <button className="btn sm ghost" onClick={() => mudarRascunho(l.id, { estado: 'aberto' })}>Mexer mais</button>
          </div>
        )}
        {r.estado === 'levado' && <p className="acolhe-estado feita" role="status">Escrito no formulário. Confira lá e salve.</p>}
        {r.estado === 'descartado' && <p className="acolhe-estado" role="status">Descartado. Nada foi guardado.</p>}
      </div>
    );
  }

  /** O que a Acolhe+AI escreveu na tela, campo por campo, para a pessoa conferir. */
  function feitoNaTela(lista: { campo: string; valor: string }[]) {
    return (
      <div className="acolhe-proposta" role="group" aria-label="O que eu escrevi na tela">
        <strong>O que eu escrevi na tela</strong>
        <dl className="acolhe-feito">
          {lista.map((f, i) => (
            <div key={i}><dt>{f.campo}</dt><dd>{f.valor.length > 240 ? `${f.valor.slice(0, 240)}…` : f.valor}</dd></div>
          ))}
        </dl>
        <p className="mutetxt" style={{ margin: 0 }}>Confira na tela, mude o que quiser e salve. Nada foi salvo por mim.</p>
      </div>
    );
  }

  function Conta({ c }: { c: NonNullable<Linha['conta']> }) {
    return (
      <p className="acolhe-conta">
        <span>{c.rotulo}</span>
        <span className="acolhe-conta-linha"><code>{c.conta}</code> = <strong>{c.resultado}</strong></span>
      </p>
    );
  }

  async function baixar(t: Tabela) {
    await api('/assistente/tabela', { method: 'POST',
      body: JSON.stringify({ linhas: t.linhas.length, colunas: t.colunas.length, casaId: casa?.id }) }).catch(() => undefined);
    const url = URL.createObjectURL(new Blob([emPlanilha(t)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tabela-acolhe-${new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function TabelaDaConversa({ t }: { t: Tabela }) {
    const fmt = (v: string | number | null) => (typeof v === 'number' ? numeroEmPortugues(v) : v ?? '');
    return (
      <div className="acolhe-tabela">
        <strong>{t.titulo}</strong>
        <div className="acolhe-tabela-rolar" tabIndex={0} role="region" aria-label={t.titulo}>
          <table>
            <thead><tr>{t.colunas.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
            <tbody>
              {t.linhas.map((l, i) => (
                <tr key={i}>{l.map((v, j) => <td key={j} className={typeof v === 'number' ? 'num' : undefined}>{fmt(v)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        {t.fonte && <p className="mutetxt" style={{ margin: 0, fontSize: 13 }}>Fonte: {t.fonte}</p>}
        <button className="btn sm sec" onClick={() => void baixar(t)}>Baixar como planilha</button>
      </div>
    );
  }

  if (aberta && recolhida) {
    return (
      <div className="acolhe-faixa" role="status" aria-live="polite" data-ocupada={ocupada ? '1' : undefined}>
        <Icone nome="acolhe" />
        <span className="acolhe-faixa-texto">{ocupada ? (faixa || 'Trabalhando na tela…') : (faixa || 'Pronto. Confira a tela.')}</span>
        {ocupada && (
          <button className="btn sm sec" onClick={() => { parar.current = true; setFaixa('Parando…'); }}>Parar</button>
        )}
        <button className="btn sm" onClick={() => setRecolhida(false)}>Ver a conversa</button>
        {!ocupada && (
          <button className="iconbtn" aria-label="Fechar a Acolhe+AI" title="Fechar"
                  onClick={() => { setAberta(false); setRecolhida(false); setPelaCamera(false); }}>
            <Icone nome="fechar" />
          </button>
        )}
      </div>
    );
  }

  if (!aberta) {
    return (
      <button className="acolhe-botao" aria-label="Abrir a Acolhe+AI, a assistente" onClick={() => setAberta(true)}>
        <Icone nome="acolhe" tamanho={26} />
        <span className="acolhe-nome">Acolhe+AI</span>
      </button>
    );
  }

  return (
    <div className="acolhe-painel" role="dialog" aria-modal="false" aria-labelledby="t-acolhe" data-ocupada={ocupada ? '1' : undefined}>
      <header className="acolhe-topo">
        <Icone nome="acolhe" />
        <h2 id="t-acolhe" className="grow">Acolhe+AI</h2>
        <button className="iconbtn" aria-label="Ler esta tela em voz alta" title="Ler esta tela" onClick={lerTela}>
          <Icone nome="ouvir" />
        </button>
        <button className="iconbtn" aria-label="Minimizar a Acolhe+AI" title="Minimizar" onClick={() => { setAberta(false); setRecolhida(false); setPelaCamera(false); }}>
          <Icone nome="fechar" />
        </button>
      </header>
      <div className="acolhe-opcoes">
        <label className="acolhe-voz">
          <span>Falar com</span>
          <select value={voz} onChange={(e) => setVoz(e.target.value)}>
            {VOZES.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label className="acolhe-ler">
          <input type="checkbox" checked={lerRespostas} onChange={(e) => setLerRespostas(e.target.checked)} />
          <span>Ler as respostas em voz alta</span>
        </label>
      </div>
      {ligada === false && (
        <p className="acolhe-aviso">Modo guia: explico as telas, levo você até elas e anoto sugestões. Ler dados e montar relatórios pede a Acolhe+AI ligada na instalação.</p>
      )}
      <div className="acolhe-conversa" aria-live="polite">
        {linhas.length === 0 && (
          <p className="mutetxt">
            Oi! Pergunte o que quiser sobre o sistema, peça para ir a uma tela, faça uma conta ou anexe um
            documento. Se você deixar, eu preencho a tela com você; quem salva é sempre você.
          </p>
        )}
        {linhas.map((l) => (
          <div key={l.id} className={`acolhe-linha ${l.quem}`}>
            {l.quem === 'pessoa' && <span className="so-leitor">Você: </span>}
            {l.quem === 'acolhe' && <span className="so-leitor">Acolhe+AI: </span>}
            {l.anexo && <span className="acolhe-anexo"><Icone nome="anexo" tamanho={14} /> {l.anexo}</span>}
            {l.licenca ? <Licenca l={l} />
              : l.rascunho ? cartaoDoRascunho(l)
              : l.feito ? feitoNaTela(l.feito)
              : l.conta ? <Conta c={l.conta} />
                : l.tabela ? <TabelaDaConversa t={l.tabela} />
                  : l.proposta ? <Cartao l={l} /> : <Texto t={l.texto} />}
            {l.quem === 'acolhe' && !l.proposta && !l.licenca && !l.tabela && !l.rascunho && (
              <button className="acolhe-ouvir" aria-label="Ouvir esta resposta" onClick={() => falar(l.texto)}>
                <Icone nome="ouvir" tamanho={14} /> Ouvir
              </button>
            )}
          </div>
        ))}
        {(ocupada || lendo) && <p className="mutetxt" role="status">{lendo ? `Lendo: ${lendo}…` : 'Pensando…'}</p>}
        <div ref={fim} />
      </div>
      {avisoVoz && (
        <div className="acolhe-aviso" role="alertdialog" aria-labelledby="t-aviso-voz">
          <strong id="t-aviso-voz">Antes de usar o microfone</strong>
          <p>O que você falar é transformado em texto pelo serviço do navegador (no Chrome, o do Google). Evite dizer nome completo e dados de criança em voz alta; escreva quando puder.</p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => { aceitarAvisoDaVoz(); setAvisoVoz(false); ouvir(); }}>
              Entendi, usar o microfone
            </button>
            <button className="btn sm sec" onClick={() => setAvisoVoz(false)}>Agora não</button>
          </div>
        </div>
      )}
      {anexando && (
        <div className="acolhe-anexar">
          <EscolherAnexo key={pelaCamera ? 'camera' : 'anexo'} id="acolhe-anexo" arquivo={anexo} onEscolher={setAnexo}
                         iniciarNaCamera={pelaCamera ? 'documento' : undefined}
                         pergunta="Foto ou PDF para a Acolhe+AI ler" />
        </div>
      )}
      <form className="acolhe-escrever" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        <label htmlFor="acolhe-pergunta" className="so-leitor">Sua pergunta para a Acolhe+AI</label>
        <textarea id="acolhe-pergunta" rows={2} value={texto} placeholder="Escreva ou fale com a Acolhe+AI"
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }} />
        {ouvindo && (
          <p className="acolhe-fala" role="status" aria-live="polite">
            {falaProvisoria || 'Ouvindo. Fale à vontade, pausas não cortam; aperte o microfone para parar e confira antes de enviar.'}
          </p>
        )}
        <div className="row acolhe-acoes">
          <button type="button" className={`iconbtn ${anexando && !pelaCamera ? 'ativo' : ''}`} aria-pressed={anexando && !pelaCamera}
                  aria-label="Anexar foto ou documento" title="Anexar"
                  onClick={() => { setPelaCamera(false); setAnexando((x) => !(x && !pelaCamera)); }}>
            <Icone nome="anexo" />
          </button>
          <button type="button" className="iconbtn" aria-label="Fotografar ou digitalizar um documento" title="Câmera"
                  onClick={() => { setPelaCamera(true); setAnexando(true); setAnexo(null); }}>
            <Icone nome="foto" />
          </button>
          <button type="button" className={`iconbtn ${ouvindo ? 'ativo' : ''}`} aria-pressed={ouvindo}
                  aria-label={ouvindo ? 'Parar de ouvir' : 'Falar pelo microfone'} title="Microfone" onClick={ouvir}>
            <Icone nome="microfone" />
          </button>
          <button type="button" className="btn sm ghost" onClick={novaConversa}>Nova conversa</button>
          <span className="grow" />
          <button type="submit" className="btn sm" disabled={ocupada || (!texto.trim() && !anexo)}>Enviar</button>
        </div>
      </form>
    </div>
  );
}
