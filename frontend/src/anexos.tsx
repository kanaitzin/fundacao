/**
 * A PRÉVIA DOS ANEXOS — o botão de olho, em todo lugar que recebe documento.
 *
 * O dossiê já tinha isto desde a fase em que nasceu, e a razão está escrita
 * lá: *"quem escolheu o arquivo errado descobre ali, e não depois de o
 * documento de uma criança estar guardado no perfil de outra"*. A varredura da
 * fase 106 (§9) mostrou que os outros quatro lugares que recebem arquivo de
 * verdade não tinham nenhuma prévia — e um deles, a foto de identificação do
 * acolhido, **subia no instante em que o arquivo era escolhido**, sem
 * confirmação e sem ninguém ver o que tinha subido. Essa foto sai impressa na
 * folha da guarita.
 *
 * Este arquivo existe para que os cinco se pareçam. Cinco prévias escritas
 * cinco vezes divergem no primeiro ajuste, e aí a pessoa aprende um gesto numa
 * tela que não vale na outra — que é o oposto do que o plantão precisa.
 *
 * DUAS PRÉVIAS, E ELAS SÃO DIFERENTES:
 *
 *  * `PreviaEscolhida` — ANTES de enviar, e acontece **no aparelho**: o arquivo
 *    ainda não saiu de lá. É a que evita o erro;
 *  * `FolhaArquivo` — DEPOIS, abrindo o que está guardado. É a que faz o anexo
 *    ter saída (§6, "anexo que entra e não sai").
 *
 * Imagem abre como imagem; PDF abre em quadro. Nunca "documento.pdf" num
 * retângulo cinza: um nome de arquivo não diz se a foto está tremida, se a
 * página saiu cortada, ou se é a criança certa.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Icone, SimboloDaAcolhe } from './icones';
import { FolhaCamera, temCameraDoSistema } from './camera';

/** O que a prévia precisa saber sobre um arquivo escolhido, antes de enviar. */
export interface Escolhido {
  nome: string; tipo: string; tamanho: number; dataUrl: string;
  /** O tamanho antes da redução, quando a foto foi reduzida no aparelho. */
  original?: number;
  /** As páginas, em miniatura, do documento digitalizado pela câmera do sistema (fase 194). */
  paginas?: string[];
}

/*
 * A FOTO REDUZIDA NO APARELHO (decisão de 28/09, fase 175).
 *
 * A foto da câmera era guardada do tamanho em que foi tirada, de 2 a 5 MB, e o
 * ano simulado da fase 174 mostrou que é isso, e não o banco, o que cresce:
 * oito casas passariam de 6 GB por ano só em documentos e fotos. A Fundação
 * decidiu reduzir antes de enviar: 2000 pixels no lado maior, em JPEG de boa
 * qualidade, o que deixa a certidão legível e a foto perto de 500 KB. Reduzir
 * aqui, e não no servidor, é também o que poupa o sinal fraco do hospital.
 *
 * PDF não se toca. Imagem que já é pequena (até 2000 pixels e 600 KB) também
 * não: um PNG de tela com letra miúda perderia nitidez para ganhar nada. E se
 * o navegador não conseguir abrir a imagem, ela vai como veio.
 */
const LADO_MAXIMO = 2000;
const QUALIDADE = 0.85;
const JA_PEQUENA = 600 * 1024;
const REDUZIVEIS = ['image/jpeg', 'image/png', 'image/webp'];

function lerComoDataUrl(f: File): Promise<Escolhido> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ nome: f.name, tipo: f.type, tamanho: f.size, dataUrl: String(r.result) });
    r.onerror = () => rej(r.error ?? new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(f);
  });
}

/** Desenha a imagem numa tela menor e devolve o JPEG, ou null se não couber reduzir. */
export function reduzirNaTela(fonte: CanvasImageSource, largura: number, altura: number) {
  const escala = Math.min(1, LADO_MAXIMO / Math.max(largura, altura));
  const w = Math.max(1, Math.round(largura * escala));
  const h = Math.max(1, Math.round(altura * escala));
  const tela = document.createElement('canvas');
  tela.width = w; tela.height = h;
  const ctx = tela.getContext('2d');
  if (!ctx) return null;
  /* Fundo branco: o PNG transparente viraria preto no JPEG. */
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(fonte, 0, 0, w, h);
  const dataUrl = tela.toDataURL('image/jpeg', QUALIDADE);
  return { dataUrl, tamanho: Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75) };
}

async function reduzirFoto(f: File): Promise<Escolhido | null> {
  if (!REDUZIVEIS.includes(f.type) || typeof createImageBitmap !== 'function') return null;
  /* `from-image` respeita a orientação da câmera: sem ela a certidão deitada
     sairia deitada. */
  const img = await createImageBitmap(f, { imageOrientation: 'from-image' });
  try {
    if (Math.max(img.width, img.height) <= LADO_MAXIMO && f.size <= JA_PEQUENA) return null;
    const r = reduzirNaTela(img, img.width, img.height);
    if (!r || r.tamanho >= f.size) return null;
    return { nome: f.name.replace(/\.[^./]+$/, '') + '.jpg', tipo: 'image/jpeg',
             tamanho: r.tamanho, dataUrl: r.dataUrl, original: f.size };
  } finally { img.close(); }
}

/** Lê o arquivo escolhido SEM enviar: a prévia acontece no aparelho. A foto grande sai reduzida. */
export async function lerArquivo(f: File): Promise<Escolhido> {
  try {
    const reduzida = await reduzirFoto(f);
    if (reduzida) return reduzida;
  } catch { /* a imagem que o navegador não abre vai como veio */ }
  return lerComoDataUrl(f);
}

/** O tamanho como a pessoa lê, não como a máquina guarda. */
export function tamanhoLegivel(b: number): string {
  return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

/** O conteúdo sem o cabeçalho `data:`, que é o que as rotas de envio esperam. */
export function base64De(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, '');
}

/**
 * O BOTÃO DE OLHO.
 *
 * O olho vem **com palavra ao lado**, sempre. Ícone sozinho é adivinhação — e
 * quem lê a tela por leitor de voz recebe só "botão". A palavra também é o que
 * o ensaio de navegador procura: porta que só existe como desenho não é porta
 * que alguém ache às 23h.
 */
export function BotaoOlho({ rotulo, onClick, titulo }: {
  rotulo: string; onClick: () => void; titulo?: string;
}) {
  return (
    <button type="button" className="btn sm ghost olho" onClick={onClick} title={titulo}>
      <Icone nome="olhar" /> {rotulo}
    </button>
  );
}

/**
 * A PRÉVIA ANTES DE ENVIAR — no aparelho, antes de o arquivo sair dele.
 *
 * O PDF não abre aqui de propósito: num `data:` recém-lido o quadro do PDF
 * briga com o teclado do celular e come a folha inteira. Ele abre depois, na
 * `FolhaArquivo`, onde há espaço. O que aparece aqui, nesse caso, é o nome e o
 * tamanho — e a frase que diz onde a conferência de verdade acontece.
 */
export function PreviaEscolhida({ arquivo, pergunta }: {
  arquivo: Escolhido; pergunta?: ReactNode;
}) {
  const ehImagem = arquivo.dataUrl.startsWith('data:image');
  return (
    <div className="bloco previa">
      <small>Confira antes de enviar</small>
      {arquivo.paginas?.length ? (
        /* O documento digitalizado pela câmera do sistema (fase 194): as páginas
           estão no aparelho, e a conferência é delas, uma por uma. */
        <ol className="previa-paginas" aria-label={`As ${arquivo.paginas.length} páginas do documento`}>
          {arquivo.paginas.map((p, i) => (
            <li key={i}><img src={p} alt={`Página ${i + 1} de ${arquivo.paginas!.length}`} /></li>
          ))}
        </ol>
      ) : ehImagem ? (
        <img src={arquivo.dataUrl} alt={`Prévia de ${arquivo.nome}`} className="previa-img" />
      ) : (
        <p className="mutetxt" style={{ margin: 0 }}>
          {arquivo.nome} · {tamanhoLegivel(arquivo.tamanho)} — a prévia de PDF abre depois de
          guardado, no botão de olho.
        </p>
      )}
      <p className="mutetxt" style={{ marginBottom: 0 }}>
        {arquivo.nome} · {tamanhoLegivel(arquivo.tamanho)}
        {arquivo.paginas?.length ? ` · PDF com ${arquivo.paginas.length} ${arquivo.paginas.length === 1 ? 'página' : 'páginas'}` : ''}
        {arquivo.original ? ` (reduzida de ${tamanhoLegivel(arquivo.original)} para enviar)` : ''}.{' '}
        {pergunta ?? <>O sistema confere o tipo pela assinatura do arquivo;{' '}
          <b>só os seus olhos</b> confirmam que é o documento certo, e desta criança.</>}
      </p>
    </div>
  );
}

/**
 * A FOLHA DO ARQUIVO GUARDADO — o que o botão de olho abre.
 *
 * `carregar` é de quem chama: cada anexo tem a rota dele, e esta folha não
 * conhece nenhuma. `onBaixar` é opcional, e quando existe fica **depois** de a
 * pessoa ter visto: baixar antes de olhar é como o documento errado sai do
 * sistema.
 */
export function FolhaArquivo({ titulo, legenda, carregar, onFechar, onBaixar }: {
  titulo: string;
  legenda?: string;
  carregar: () => Promise<{ nome: string; tipo: string; conteudo: string }>;
  onFechar: () => void;
  onBaixar?: (a: { nome: string; tipo: string; conteudo: string }) => void;
}) {
  const [arquivo, setArquivo] = useState<{ nome: string; tipo: string; conteudo: string } | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    carregar()
      .then((a) => { if (vivo) setArquivo(a); })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.');
      });
    return () => { vivo = false; };
  }, []);

  const url = arquivo ? `data:${arquivo.tipo};base64,${arquivo.conteudo}` : '';

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-arq"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-arq">{titulo}</h3>
        {legenda && <p className="mutetxt">{legenda}</p>}

        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {!arquivo && !erro && <p className="mutetxt">Abrindo o arquivo…</p>}

        {arquivo && (arquivo.tipo.startsWith('image')
          ? <img src={url} alt={titulo} className="previa-img" />
          : <iframe src={url} title={titulo} className="previa-quadro" />)}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Fechar</button>
          {onBaixar && (
            <button className="btn grow" disabled={!arquivo}
                    onClick={() => arquivo && onBaixar(arquivo)}>
              Baixar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== */

/**
 * AS FOTOS QUE A ACOLHE+AI TRAZ (fase 195).
 *
 * A pessoa fotografa no rascunho da Acolhe+AI e leva o texto para a tela; a
 * foto vai junto, mas não entra sozinha: o anexo da tela OFERECE "Usar a foto
 * da Acolhe+AI", e a pessoa confirma ali, vendo a prévia, como em todo anexo.
 */
let fotosDaAcolhe: Escolhido[] = [];
const quemOuve = new Set<() => void>();
export function oferecerFotosDaAcolhe(lista: Escolhido[]) {
  fotosDaAcolhe = lista.slice(0, 10);
  quemOuve.forEach((f) => f());
}
function usarFotoDaAcolhe(a: Escolhido) {
  fotosDaAcolhe = fotosDaAcolhe.filter((x) => x !== a);
  quemOuve.forEach((f) => f());
}
function useFotosDaAcolhe(): Escolhido[] {
  const [, mexeu] = useState(0);
  useEffect(() => {
    const f = () => mexeu((n) => n + 1);
    quemOuve.add(f);
    return () => { quemOuve.delete(f); };
  }, []);
  return fotosDaAcolhe;
}

/**
 * ESCOLHER O ANEXO: CÂMERA, DOCUMENTO, GALERIA OU ARQUIVO (fases 165 e 194).
 *
 * Pedido de 25/09, para a internação: *"quando o navegador e o dispositivo
 * permitirem, oferecer: tirar foto agora, escolher da galeria, selecionar
 * arquivo; no computador, escolher arquivo e utilizar webcam quando disponível
 * e autorizado. Nunca presumir que a câmera estará disponível. Se a permissão
 * for negada, oferecer upload normal sem quebrar a tela."*
 *
 * Desde a fase 194 a câmera é a DO SISTEMA (`camera.tsx`), igual no celular e
 * no computador: o visor ao vivo, o X e o certo de cada foto, e o modo
 * documento, que junta as páginas num PDF. A câmera do próprio aparelho (o
 * `capture` do navegador) continua como reserva, para o navegador sem câmera
 * pelo sistema ou com ela bloqueada.
 *
 * É ESTE o lugar de todo anexo do sistema: o teste
 * `todo-anexo-pela-camera.spec.ts` reprova `<input type="file">` solto numa tela.
 *
 * O ENVIO É DE QUEM CHAMA: este componente escolhe e mostra; o botão de salvar
 * da folha é a confirmação. A foto nunca sai do aparelho antes disso.
 *
 * `multiplos`: para o álbum de vivências. A galeria aceita várias de uma vez,
 * cada foto chega por `onEscolher`, e quem chama guarda a lista e a mostra.
 */
export function EscolherAnexo({ arquivo, onEscolher, aceita = 'application/pdf,image/jpeg,image/png',
                                maximoMb = 10, pergunta, id, multiplos = false, iniciarNaCamera }: {
  arquivo: Escolhido | null;
  onEscolher: (a: Escolhido | null) => void;
  aceita?: string;
  maximoMb?: number;
  pergunta?: ReactNode;
  id: string;
  multiplos?: boolean;
  /** Já abre a câmera do sistema, neste modo (o botão de câmera da Acolhe+AI). */
  iniciarNaCamera?: 'foto' | 'documento';
}) {
  const [erro, setErro] = useState('');
  const [origem, setOrigem] = useState<'camera' | 'sistema' | 'documento' | 'arquivo' | null>(null);
  const [camera, setCamera] = useState<'foto' | 'documento' | null>(
    () => (iniciarNaCamera && temCameraDoSistema() ? iniciarNaCamera : null));
  const [semCamera, setSemCamera] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const campo = useRef<Record<string, HTMLInputElement | null>>({});
  const abrir = (qual: string) => campo.current[qual]?.click();
  const dedo = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const doSistema = temCameraDoSistema() && !semCamera;
  const aceitos = aceita.split(',').map((t) => t.trim());
  const aceitaPdf = aceitos.includes('application/pdf');
  const daAcolhe = useFotosDaAcolhe().filter((a) => aceitos.includes(a.tipo));

  async function receber(f: File | undefined, de: 'camera' | 'arquivo') {
    setErro('');
    if (!f) return;
    if (f.type && !aceitos.includes(f.type)) {
      setErro(aceitaPdf ? 'Este tipo de arquivo não é aceito aqui. Envie PDF, JPG ou PNG.'
        : 'Aqui vai uma foto, em JPG ou PNG.');
      return;
    }
    /* A mesma conferência do servidor, adiantada: recusar aqui poupa o envio
       de 10 MB pelo sinal fraco do hospital. O servidor confere de novo.
       Confere-se DEPOIS de reduzir (fase 175): a foto de 12 MB que vira 500 KB
       não pode ser recusada pelo tamanho que ela não vai ter. */
    const lido = await lerArquivo(f);
    if (!cabe(lido)) return;
    setOrigem(de);
    onEscolher(lido);
  }

  function cabe(a: Escolhido) {
    if (a.tamanho <= maximoMb * 1024 * 1024) return true;
    setErro(`O arquivo tem ${tamanhoLegivel(a.tamanho)} e o limite é ${maximoMb} MB. `
      + 'Digitalize com menos páginas, ou divida o documento em partes.');
    return false;
  }

  function daCamera(a: Escolhido, de: 'sistema' | 'documento') {
    setCamera(null);
    if (!cabe(a)) return;
    setOrigem(de);
    onEscolher(a);
  }

  const folhaDaCamera = camera && (
    <FolhaCamera podeDocumento={aceitaPdf && !multiplos} inicial={camera}
      onFechar={() => setCamera(null)}
      onFoto={(a) => daCamera(a, 'sistema')}
      onDocumento={(a) => daCamera(a, 'documento')}
      onSemCamera={(frase) => { setCamera(null); setSemCamera(true); setErro(frase); }} />
  );

  if (arquivo && !multiplos) {
    const ehImagem = arquivo.dataUrl.startsWith('data:image');
    return (
      <div className="stack">
        <PreviaEscolhida arquivo={arquivo} pergunta={pergunta} />
        <div className="acoes">
          {ehImagem && (
            <button type="button" className="btn sm sec" onClick={() => setAmpliada(true)}>
              <Icone nome="olhar" /> Ampliar
            </button>
          )}
          {(origem === 'sistema' || origem === 'documento') && (
            <button type="button" className="btn sm sec"
                    onClick={() => { onEscolher(null); setCamera(origem === 'documento' ? 'documento' : 'foto'); }}>
              {origem === 'documento' ? 'Digitalizar de novo' : 'Tirar outra'}
            </button>
          )}
          {origem === 'camera' && (
            <button type="button" className="btn sm sec" onClick={() => abrir('camera')}>Tirar outra</button>
          )}
          <button type="button" className="btn sm ghost" onClick={() => { onEscolher(null); setOrigem(null); }}>
            Descartar
          </button>
        </div>
        {origem === 'camera' && (
          <input id={`${id}-camera`} ref={(el) => { campo.current.camera = el; }} className="so-leitor"
                 type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true"
                 onChange={(e) => { void receber(e.target.files?.[0], 'camera'); e.target.value = ''; }} />
        )}
        {folhaDaCamera}
        {ampliada && (
          <div className="overlay" role="dialog" aria-modal="true" aria-label="Foto ampliada"
               onClick={() => setAmpliada(false)}>
            <div className="sheet modal">
              <img src={arquivo.dataUrl} alt={`Ampliação de ${arquivo.nome}`} className="previa-img ampliada" />
              <button className="btn sec block" onClick={() => setAmpliada(false)}>Fechar</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      {daAcolhe.length > 0 && (
        <div className="acoes" role="group" aria-label="Fotos trazidas pela Acolhe+AI">
          {daAcolhe.map((a, i) => (
            <button key={i} type="button" className="btn sm sec"
                    onClick={() => { if (cabe(a)) { usarFotoDaAcolhe(a); setOrigem('arquivo'); onEscolher(a); } }}>
              <SimboloDaAcolhe tamanho={22} /> Usar a foto da Acolhe+AI{daAcolhe.length > 1 ? ` (${i + 1})` : ''}
            </button>
          ))}
        </div>
      )}
      <div className="acoes">
        {doSistema && (
          <button type="button" className="btn sm" onClick={() => { setErro(''); setCamera('foto'); }}>
            <Icone nome="foto" /> {multiplos ? 'Tirar uma foto' : 'Abrir a câmera'}
          </button>
        )}
        {doSistema && aceitaPdf && !multiplos && (
          <button type="button" className="btn sm" onClick={() => { setErro(''); setCamera('documento'); }}>
            <Icone nome="documento" /> Digitalizar documento
          </button>
        )}
        {dedo && !doSistema && (
          <button type="button" className="btn sm" onClick={() => abrir('camera')}>
            <Icone nome="foto" /> Tirar foto agora
          </button>
        )}
        {dedo && (
          <button type="button" className="btn sm sec" onClick={() => abrir('galeria')}>Escolher da galeria</button>
        )}
        <button type="button" className="btn sm sec" onClick={() => abrir('arquivo')}>Selecionar arquivo</button>
      </div>
      {/* Os campos de arquivo ficam escondidos: quem os aciona são os botões
          acima, que recebem foco de teclado e têm nome. */}
      <input id={`${id}-camera`} ref={(el) => { campo.current.camera = el; }} className="so-leitor"
             type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true"
             onChange={(e) => { void receber(e.target.files?.[0], 'camera'); e.target.value = ''; }} />
      <input id={`${id}-galeria`} ref={(el) => { campo.current.galeria = el; }} className="so-leitor"
             type="file" accept="image/*" tabIndex={-1} aria-hidden="true" multiple={multiplos}
             onChange={(e) => { void receberVarios(e.target.files); e.target.value = ''; }} />
      <input id={`${id}-arquivo`} ref={(el) => { campo.current.arquivo = el; }} className="so-leitor"
             type="file" accept={aceita} tabIndex={-1} aria-hidden="true" multiple={multiplos}
             onChange={(e) => { void receberVarios(e.target.files); e.target.value = ''; }} />
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {folhaDaCamera}
    </div>
  );

  async function receberVarios(lista: FileList | null) {
    for (const f of Array.from(lista ?? []).slice(0, multiplos ? 20 : 1)) await receber(f, 'arquivo');
  }
}
