import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Icone } from './icones';
import { EscolherAnexo, Escolhido, base64De } from './anexos';
import { rotaDeLeituraPermitida } from '../../backend/src/modules/assistente/ferramentas';
import { responderPeloGuia, TelaDoGuia } from './acolhe-guia';

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
 *  - anota as sugestões de melhoria da equipe.
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

interface Linha {
  id: number;
  quem: 'pessoa' | 'acolhe' | 'nota';
  texto: string;
  anexo?: string;
  proposta?: Proposta & { estado: 'aberta' | 'feita' | 'recusada' | 'erro'; detalhe?: string };
}

const VOZES = ['Toda a equipe', 'Coordenação de acolhimento', 'Psicologia', 'Análise de sistemas', 'Engenharia'];
const MAX_VOLTAS = 6;
const LIMITE_RESULTADO = 30_000;
const CHAVE_AVISO_VOZ = 'rede-acolher.acolhe.aviso-do-microfone';

type Reconhecedor = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void;
};
const ReconhecimentoDeVoz = (): (new () => Reconhecedor) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

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
  const [ocupada, setOcupada] = useState(false);
  const [lendo, setLendo] = useState('');
  const [voz, setVoz] = useState(VOZES[0]);
  const [lerRespostas, setLerRespostas] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [avisoVoz, setAvisoVoz] = useState(false);
  const historico = useRef<MensagemDoModelo[]>([]);
  const anexos = useRef<Escolhido[]>([]);
  const seq = useRef(0);
  const fim = useRef<HTMLDivElement | null>(null);
  const reconhecedor = useRef<Reconhecedor | null>(null);
  /** O que a pessoa confirmou ou recusou desde a última pergunta: vai junto com a próxima. */
  const pendenteParaOModelo = useRef<string[]>([]);

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
    setLinhas([]); setTexto(''); setAnexo(null); setLendo('');
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function dizer(t: string) {
    acrescentar({ quem: 'acolhe', texto: t });
    if (lerRespostas) falar(t);
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

  function pelosGuias(t: string, comAnexo = false) {
    if (comAnexo) {
      const dossie = telas.find((x) => x.chave === 'acolhidos');
      dizer(`No modo guia eu não leio arquivos. Para guardar um documento, abra o perfil da criança e o dossiê dela${dossie ? ': [Abrir os Acolhidos](tela:acolhidos)' : '.'}`);
      return;
    }
    const r = responderPeloGuia(t, telas, linhas.filter((l) => l.quem === 'acolhe').length === 0);
    dizer(r.texto);
    if (r.ir) navegar(r.ir);
    if (r.sugestao) acrescentar({ quem: 'acolhe', texto: DESCRICAO.propor_sugestao,
      proposta: { tipo: 'propor_sugestao', texto: r.sugestao, tela: telaAtual, estado: 'aberta' } });
  }

  async function enviar() {
    const t = texto.trim();
    if ((!t && !anexo) || ocupada) return;
    const meu = anexo;
    setTexto(''); setAnexo(null); setAnexando(false);
    acrescentar({ quem: 'pessoa', texto: t || 'Veja este arquivo.', anexo: meu?.nome });
    if (!ligada) { pelosGuias(t, !!meu && !t); return; }

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
    }
  }

  function ouvir() {
    const R = ReconhecimentoDeVoz();
    if (!R) { dizer('Este navegador não ouve pelo microfone. Escreva a pergunta, por favor.'); return; }
    let avisado = false;
    try { avisado = localStorage.getItem(CHAVE_AVISO_VOZ) === '1'; } catch { /* sem armazenamento */ }
    if (!avisado) { setAvisoVoz(true); return; }
    if (ouvindo) { reconhecedor.current?.stop(); return; }
    const r = new R();
    r.lang = 'pt-BR'; r.interimResults = false; r.continuous = false;
    r.onresult = (e) => {
      const fala = Array.from(e.results).map((x) => x[0]?.transcript ?? '').join(' ').trim();
      if (fala) setTexto((t) => (t ? `${t} ${fala}` : fala));
    };
    r.onend = () => setOuvindo(false);
    r.onerror = () => setOuvindo(false);
    reconhecedor.current = r;
    setOuvindo(true);
    r.start();
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

  if (!aberta) {
    return (
      <button className="acolhe-botao" aria-label="Abrir a Acolhe+AI, a assistente" onClick={() => setAberta(true)}>
        <Icone nome="acolhe" tamanho={26} />
        <span className="acolhe-nome">Acolhe+AI</span>
      </button>
    );
  }

  return (
    <div className="acolhe-painel" role="dialog" aria-modal="false" aria-labelledby="t-acolhe">
      <header className="acolhe-topo">
        <Icone nome="acolhe" />
        <h2 id="t-acolhe" className="grow">Acolhe+AI</h2>
        <button className="iconbtn" aria-label="Ler esta tela em voz alta" title="Ler esta tela" onClick={lerTela}>
          <Icone nome="ouvir" />
        </button>
        <button className="iconbtn" aria-label="Minimizar a Acolhe+AI" title="Minimizar" onClick={() => setAberta(false)}>
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
            Oi! Pergunte o que quiser sobre o sistema, peça para ir a uma tela ou anexe um documento.
            Eu proponho, e você confirma.
          </p>
        )}
        {linhas.map((l) => (
          <div key={l.id} className={`acolhe-linha ${l.quem}`}>
            {l.quem === 'pessoa' && <span className="so-leitor">Você: </span>}
            {l.quem === 'acolhe' && <span className="so-leitor">Acolhe+AI: </span>}
            {l.anexo && <span className="acolhe-anexo"><Icone nome="anexo" tamanho={14} /> {l.anexo}</span>}
            {l.proposta ? <Cartao l={l} /> : <Texto t={l.texto} />}
            {l.quem === 'acolhe' && !l.proposta && (
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
            <button className="btn sm" onClick={() => {
              try { localStorage.setItem(CHAVE_AVISO_VOZ, '1'); } catch { /* sem armazenamento */ }
              setAvisoVoz(false); ouvir();
            }}>Entendi, usar o microfone</button>
            <button className="btn sm sec" onClick={() => setAvisoVoz(false)}>Agora não</button>
          </div>
        </div>
      )}
      {anexando && (
        <div className="acolhe-anexar">
          <EscolherAnexo id="acolhe-anexo" arquivo={anexo} onEscolher={setAnexo}
                         pergunta="Foto ou PDF para a Acolhe+AI ler" />
        </div>
      )}
      <form className="acolhe-escrever" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        <label htmlFor="acolhe-pergunta" className="so-leitor">Sua pergunta para a Acolhe+AI</label>
        <textarea id="acolhe-pergunta" rows={2} value={texto} placeholder="Escreva ou fale com a Acolhe+AI"
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }} />
        <div className="row acolhe-acoes">
          <button type="button" className={`iconbtn ${anexando ? 'ativo' : ''}`} aria-pressed={anexando}
                  aria-label="Anexar foto ou documento" title="Anexar" onClick={() => setAnexando((x) => !x)}>
            <Icone nome="anexo" />
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
