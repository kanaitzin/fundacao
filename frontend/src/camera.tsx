import { useEffect, useRef, useState } from 'react';
import { Icone } from './icones';
import type { Escolhido } from './anexos';
import { pdfDeJpegs } from '../../backend/src/kernel/documentos/pdf-de-imagens';

/**
 * A CÂMERA DO SISTEMA (fase 194; pedido de 10/10).
 *
 * *"Quando eles tirem foto usando o app, eles tenham a opção de ver o que eles
 * estão tirando foto, e clicar X para recusar, ou avançar dizendo que aquela
 * ali está boa. Que nem um WhatsApp."* E: *"uma forma de digitalizar
 * documentos, não pegar só um PNG"*.
 *
 * DOIS MODOS, a mesma câmera, no celular e no computador:
 *  - FOTO: o visor ao vivo, o disparo, e a foto em tela cheia com X (refazer)
 *    e ✓ (usar). Para a 3×4, a foto da vivência, o rosto do visitante;
 *  - DOCUMENTO: a moldura de uma folha, e página por página, cada uma com o
 *    mesmo X e ✓; a página aceita volta ao visor para a próxima, e
 *    "Concluir" junta todas num PDF A4 (`pdf-de-imagens.ts`), montado AQUI,
 *    no aparelho. O realce (preto e branco, contraste) vem ligado, porque é o
 *    que deixa a letra do médico legível; quem fotografa um desenho desliga.
 *
 * O QUE ELA NÃO FAZ, dito para não virar promessa: não acha a borda do papel
 * sozinha nem endireita a perspectiva. A moldura é o guia; girar resolve a
 * folha deitada.
 *
 * A PERMISSÃO. Quem pergunta é o navegador, uma vez, e quem guarda a resposta
 * também é ele, por aparelho e por endereço (o sistema não tem como "pedir para
 * sempre" por cima disso). Enquanto o navegador pergunta, a tela diz o que
 * responder; se a câmera estiver bloqueada, a frase diz onde liberar, e quem
 * chamou oferece a câmera do próprio celular e o arquivo. Nada quebra.
 *
 * A câmera é desligada ao fechar e ao fotografar: luz acesa sem ninguém
 * fotografando é pergunta que ninguém na sala sabe responder.
 */
const LADO_FOTO = 2000;
const LADO_PAGINA = 1800;
const MAX_PAGINAS = 20;

type Modo = 'foto' | 'documento';
interface Captura { tela: HTMLCanvasElement }
interface Pagina { dataUrl: string; tamanho: number }

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gira, realça e reduz a captura; devolve o JPEG pronto para enviar. */
function processar(fonte: HTMLCanvasElement, giro: number, realce: boolean, lado: number): Pagina {
  const deitado = giro % 180 !== 0;
  const w0 = deitado ? fonte.height : fonte.width;
  const h0 = deitado ? fonte.width : fonte.height;
  const escala = Math.min(1, lado / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * escala));
  const h = Math.max(1, Math.round(h0 * escala));
  const tela = document.createElement('canvas');
  tela.width = w; tela.height = h;
  const ctx = tela.getContext('2d');
  if (!ctx) throw new Error('Este navegador não consegue preparar a foto.');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((giro * Math.PI) / 180);
  const dw = (deitado ? h : w);
  const dh = (deitado ? w : h);
  ctx.drawImage(fonte, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  if (realce) realcar(ctx, w, h);
  const dataUrl = tela.toDataURL('image/jpeg', realce ? 0.8 : 0.85);
  return { dataUrl, tamanho: Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75) };
}

/**
 * O REALCE DE DOCUMENTO: tons de cinza, e o contraste esticado entre o 2% mais
 * escuro (a tinta) e o 2% mais claro (o papel). A sombra da mão some e a letra
 * fica preta, sem inventar nada que não estava na folha.
 */
function realcar(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = y; hist[y]++;
  }
  const total = w * h;
  let acc = 0; let baixo = 0; let alto = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { baixo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { alto = v; break; } }
  const faixa = Math.max(1, alto - baixo);
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.max(0, Math.min(255, ((d[i] - baixo) * 255) / faixa));
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
}

function bytesDe(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.replace(/^data:[^;]+;base64,/, ''));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
function base64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** O nome do arquivo diz o que é e quando, e nunca de quem é (§5). */
function nomeDoArquivo(tipo: 'foto' | 'documento', ext: string) {
  const agora = new Date();
  const dia = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const hora = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  return `${tipo}-${dia}-${hora}.${ext}`;
}

/** Se este navegador tem câmera pelo sistema (o `getUserMedia`, que pede HTTPS). */
export const temCameraDoSistema = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  && (typeof window === 'undefined' || window.isSecureContext !== false);

export function FolhaCamera({ podeDocumento, inicial = 'foto', onFoto, onDocumento, onFechar, onSemCamera }: {
  podeDocumento: boolean;
  inicial?: Modo;
  onFoto: (a: Escolhido) => void;
  onDocumento: (a: Escolhido) => void;
  onFechar: () => void;
  onSemCamera: (frase: string) => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const [ligada, setLigada] = useState(false);
  const [perguntando, setPerguntando] = useState(false);
  const [modo, setModo] = useState<Modo>(podeDocumento ? inicial : 'foto');
  const [cameras, setCameras] = useState<string[]>([]);
  const [qual, setQual] = useState(0);
  const [captura, setCaptura] = useState<Captura | null>(null);
  const [giro, setGiro] = useState(0);
  const [realce, setRealce] = useState(true);
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [revisao, setRevisao] = useState<Pagina | null>(null);
  const [aviso, setAviso] = useState('');
  const [ocupada, setOcupada] = useState(false);

  const desligar = () => { fluxo.current?.getTracks().forEach((t) => t.stop()); fluxo.current = null; setLigada(false); };

  /* Liga a câmera escolhida; a traseira primeiro, que é a que fotografa papel. */
  useEffect(() => {
    if (captura) return undefined;
    let vivo = true;
    (async () => {
      try {
        const estado = await navigator.permissions?.query({ name: 'camera' as PermissionName }).catch(() => null);
        if (vivo && estado?.state === 'prompt') setPerguntando(true);
      } catch { /* navegador sem a pergunta da permissão */ }
      const id = cameras[qual];
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: id ? { deviceId: { exact: id } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
        fluxo.current = s;
        setPerguntando(false);
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => undefined); }
        setLigada(true);
        if (!cameras.length) {
          const lista = (await navigator.mediaDevices.enumerateDevices().catch(() => []))
            .filter((d) => d.kind === 'videoinput' && d.deviceId).map((d) => d.deviceId);
          if (vivo && lista.length > 1) setCameras(lista);
        }
      } catch (e) {
        if (!vivo) return;
        const nome = String((e as { name?: string })?.name ?? '');
        onSemCamera(nome === 'NotAllowedError' || nome === 'SecurityError'
          ? 'A câmera está bloqueada neste navegador. Para liberar, toque no cadeado ao lado do endereço e permita a câmera. Enquanto isso, use a câmera do aparelho ou escolha o arquivo.'
          : 'Não foi possível ligar a câmera deste aparelho. Use a câmera do aparelho ou escolha o arquivo.');
      }
    })();
    return () => { vivo = false; desligar(); };
  }, [qual, captura === null]);

  /* A revisão é recalculada quando a pessoa gira ou liga e desliga o realce. */
  useEffect(() => {
    if (!captura) { setRevisao(null); return; }
    try {
      setRevisao(processar(captura.tela, giro, modo === 'documento' && realce, modo === 'documento' ? LADO_PAGINA : LADO_FOTO));
    } catch (e) { setAviso(e instanceof Error ? e.message : 'Não foi possível preparar a foto.'); }
  }, [captura, giro, realce, modo]);

  async function fotografar() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const tela = document.createElement('canvas');
    tela.width = v.videoWidth; tela.height = v.videoHeight;
    tela.getContext('2d')?.drawImage(v, 0, 0);
    desligar();
    setGiro(0);
    setCaptura({ tela });
  }

  function refazer() { setCaptura(null); setAviso(''); }

  async function usar() {
    if (!revisao) return;
    if (modo === 'foto') {
      onFoto({ nome: nomeDoArquivo('foto', 'jpg'), tipo: 'image/jpeg', tamanho: revisao.tamanho, dataUrl: revisao.dataUrl });
      return;
    }
    const novas = [...paginas, revisao];
    setPaginas(novas);
    setAviso(`Página ${novas.length} guardada. Fotografe a próxima, ou conclua.`);
    if (novas.length >= MAX_PAGINAS) { await concluir(novas); return; }
    setCaptura(null);
  }

  async function concluir(lista = paginas) {
    if (!lista.length) return;
    setOcupada(true);
    await espera(0);
    try {
      const pdf = pdfDeJpegs(lista.map((p) => ({ jpeg: bytesDe(p.dataUrl) })));
      desligar();
      onDocumento({
        nome: nomeDoArquivo('documento', 'pdf'), tipo: 'application/pdf', tamanho: pdf.length,
        dataUrl: `data:application/pdf;base64,${base64(pdf)}`, paginas: lista.map((p) => p.dataUrl),
      });
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível montar o PDF.');
    } finally { setOcupada(false); }
  }

  const fechar = () => { desligar(); onFechar(); };
  const doc = modo === 'documento';

  return (
    <div className="camera" role="dialog" aria-modal="true" aria-labelledby="t-camera">
      <div className="camera-topo">
        <button type="button" className="camera-btn" aria-label="Fechar a câmera" onClick={fechar}>
          <Icone nome="fechar" />
        </button>
        <h2 id="t-camera" className="camera-titulo">{doc ? 'Digitalizar documento' : 'Tirar foto'}</h2>
        {podeDocumento && !captura && (
          <div className="camera-modos" role="group" aria-label="O que fotografar">
            <button type="button" aria-pressed={!doc} onClick={() => setModo('foto')} disabled={paginas.length > 0}>Foto</button>
            <button type="button" aria-pressed={doc} onClick={() => setModo('documento')}>Documento</button>
          </div>
        )}
      </div>

      <div className="camera-palco">
        {!captura && (
          <>
            <video ref={video} className="camera-video" playsInline muted aria-label="Imagem da câmera, ao vivo" />
            {doc && <div className="camera-moldura" aria-hidden="true" />}
            {!ligada && (
              <p className="camera-espera" role="status">
                {perguntando
                  ? 'O navegador vai perguntar se o Rede Acolher pode usar a câmera. Toque em Permitir: ele guarda a resposta neste aparelho e não pergunta de novo.'
                  : 'Ligando a câmera…'}
              </p>
            )}
          </>
        )}
        {captura && revisao && (
          <img src={revisao.dataUrl} className="camera-revisao"
               alt={doc ? `Página ${paginas.length + 1}, para conferir` : 'A foto, para conferir'} />
        )}
      </div>

      <p className="camera-aviso" role="status" aria-live="polite">
        {captura
          ? (doc ? 'A página está legível? Use o X para refazer, ou o certo para guardar.' : 'Ficou boa? Use o X para refazer, ou o certo para usar.')
          : (aviso || (doc ? 'Encaixe a folha na moldura, com boa luz, e fotografe.' : ''))}
      </p>

      {doc && paginas.length > 0 && !captura && (
        <ol className="camera-paginas" aria-label="Páginas guardadas">
          {paginas.map((p, i) => (
            <li key={i}>
              <img src={p.dataUrl} alt={`Página ${i + 1}`} />
              <button type="button" className="camera-tirar" aria-label={`Tirar a página ${i + 1}`}
                      onClick={() => setPaginas(paginas.filter((_, j) => j !== i))}>
                <Icone nome="fechar" tamanho={14} />
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="camera-pe">
        {!captura ? (
          <>
            <span className="camera-lado">
              {cameras.length > 1 && (
                <button type="button" className="camera-btn" aria-label="Trocar de câmera"
                        onClick={() => setQual((q) => (q + 1) % cameras.length)}>
                  <Icone nome="girar" />
                </button>
              )}
            </span>
            <button type="button" className="camera-disparo" aria-label={doc ? `Fotografar a página ${paginas.length + 1}` : 'Fotografar'}
                    disabled={!ligada} onClick={() => void fotografar()} />
            <span className="camera-lado">
              {doc && paginas.length > 0 && (
                <button type="button" className="camera-concluir" disabled={ocupada} onClick={() => void concluir()}>
                  {ocupada ? 'Montando…' : `Concluir (${paginas.length} ${paginas.length === 1 ? 'página' : 'páginas'})`}
                </button>
              )}
            </span>
          </>
        ) : (
          <>
            <button type="button" className="camera-redondo nao" aria-label="Refazer a foto" onClick={refazer}>
              <Icone nome="fechar" tamanho={28} />
            </button>
            <span className="camera-ajustes">
              <button type="button" className="camera-btn" aria-label="Girar a foto" onClick={() => setGiro((g) => (g + 90) % 360)}>
                <Icone nome="girar" />
              </button>
              {doc && (
                <button type="button" className="camera-btn" aria-pressed={realce} aria-label="Realçar o documento"
                        onClick={() => setRealce((r) => !r)}>
                  <Icone nome="realce" />
                </button>
              )}
            </span>
            <button type="button" className="camera-redondo sim" disabled={!revisao}
                    aria-label={doc ? 'Guardar esta página' : 'Usar esta foto'} onClick={() => void usar()}>
              <Icone nome="certo" tamanho={28} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A CÂMERA NESTE APARELHO, na Minha conta (fase 194).
 *
 * *"Pede permissão para sempre, e toda vez que ele logar tem a opção câmera
 * ali."* Quem guarda a permissão é o navegador, por aparelho: aqui a pessoa
 * vê se ela já foi dada e, se não, dá de uma vez, sem estar no meio de um
 * anexo. A câmera liga e desliga no mesmo instante: é só para a pergunta.
 */
export function CameraNesteAparelho({ onde = 'celular' }: { onde?: 'celular' | 'computador' }) {
  type Estado = 'carregando' | 'sem-suporte' | 'permitida' | 'perguntar' | 'bloqueada';
  const [estado, setEstado] = useState<Estado>('carregando');
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let vivo = true;
    if (!temCameraDoSistema()) { setEstado('sem-suporte'); return undefined; }
    navigator.permissions?.query({ name: 'camera' as PermissionName })
      .then((p) => {
        if (!vivo) return;
        const ler = () => setEstado(p.state === 'granted' ? 'permitida' : p.state === 'denied' ? 'bloqueada' : 'perguntar');
        ler(); p.onchange = ler;
      })
      .catch(() => { if (vivo) setEstado('perguntar'); });
    return () => { vivo = false; };
  }, []);

  async function permitir() {
    setOcupado(true); setMsg('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach((t) => t.stop());
      setEstado('permitida');
      setMsg('Pronto. Este aparelho já pode fotografar e digitalizar documentos no sistema.');
    } catch (e) {
      const nome = String((e as { name?: string })?.name ?? '');
      setEstado(nome === 'NotAllowedError' || nome === 'SecurityError' ? 'bloqueada' : 'sem-suporte');
    } finally { setOcupado(false); }
  }

  return (
    <section className="aviso-celular" aria-labelledby={`t-camera-${onde}`}>
      <h4 id={`t-camera-${onde}`}>Câmera neste {onde === 'computador' ? 'computador' : 'aparelho'}</h4>
      <p className="mutetxt">
        A câmera tira foto e digitaliza documento em PDF em todo lugar que recebe anexo. O navegador
        pergunta uma vez e guarda a resposta neste aparelho.
      </p>
      {estado === 'carregando' && <p className="mutetxt">Conferindo…</p>}
      {estado === 'permitida' && <p role="status"><b>Permitida.</b> Nada mais a fazer aqui.</p>}
      {estado === 'perguntar' && (
        <button className="btn sec" disabled={ocupado} onClick={() => void permitir()}>
          <Icone nome="foto" /> {ocupado ? 'Perguntando…' : 'Permitir a câmera'}
        </button>
      )}
      {estado === 'bloqueada' && (
        <p role="status">
          <b>Bloqueada neste navegador.</b> Para liberar, toque no cadeado ao lado do endereço e
          permita a câmera. Enquanto isso, o anexo continua aceitando arquivo e galeria.
        </p>
      )}
      {estado === 'sem-suporte' && (
        <p className="mutetxt">Este navegador não oferece câmera ao sistema. O anexo usa a câmera do próprio aparelho ou o arquivo.</p>
      )}
      {msg && <p role="status" className="mutetxt">{msg}</p>}
    </section>
  );
}
