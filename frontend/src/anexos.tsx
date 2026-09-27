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
import { Icone } from './icones';

/** O que a prévia precisa saber sobre um arquivo escolhido, antes de enviar. */
export interface Escolhido { nome: string; tipo: string; tamanho: number; dataUrl: string }

/** Lê o arquivo escolhido SEM enviar: a prévia acontece no aparelho. */
export function lerArquivo(f: File): Promise<Escolhido> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ nome: f.name, tipo: f.type, tamanho: f.size, dataUrl: String(r.result) });
    r.onerror = () => rej(r.error ?? new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(f);
  });
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
      {ehImagem ? (
        <img src={arquivo.dataUrl} alt={`Prévia de ${arquivo.nome}`} className="previa-img" />
      ) : (
        <p className="mutetxt" style={{ margin: 0 }}>
          {arquivo.nome} · {tamanhoLegivel(arquivo.tamanho)} — a prévia de PDF abre depois de
          guardado, no botão de olho.
        </p>
      )}
      <p className="mutetxt" style={{ marginBottom: 0 }}>
        {arquivo.nome} · {tamanhoLegivel(arquivo.tamanho)}.{' '}
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
 * ESCOLHER O ANEXO: CÂMERA, GALERIA OU ARQUIVO (fase 165).
 *
 * Pedido de 25/09, para a internação: *"quando o navegador e o dispositivo
 * permitirem, oferecer: tirar foto agora, escolher da galeria, selecionar
 * arquivo; no computador, escolher arquivo e utilizar webcam quando disponível
 * e autorizado. Nunca presumir que a câmera estará disponível. Se a permissão
 * for negada, oferecer upload normal sem quebrar a tela."* E depois da foto:
 * prévia, ampliar, descartar, tirar de novo, e enviar só depois de confirmar.
 *
 * O ENVIO É DE QUEM CHAMA: este componente escolhe e mostra; o botão de salvar
 * da folha é a confirmação. A foto nunca sai do aparelho antes disso.
 *
 * O celular e o computador pedem gestos diferentes, e a pergunta é o
 * PONTEIRO, e não o tamanho da tela: `pointer: coarse` é dedo. No celular, o
 * `capture` do próprio navegador abre a câmera traseira; no computador, a
 * webcam só aparece se o navegador tiver `getUserMedia`, e a recusa da
 * permissão vira frase, e não tela quebrada.
 */
export function EscolherAnexo({ arquivo, onEscolher, aceita = 'application/pdf,image/jpeg,image/png',
                                maximoMb = 10, pergunta, id }: {
  arquivo: Escolhido | null;
  onEscolher: (a: Escolhido | null) => void;
  aceita?: string;
  maximoMb?: number;
  pergunta?: ReactNode;
  id: string;
}) {
  const [erro, setErro] = useState('');
  const [origem, setOrigem] = useState<'camera' | 'webcam' | 'arquivo' | null>(null);
  const [webcam, setWebcam] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const campo = useRef<Record<string, HTMLInputElement | null>>({});
  const abrir = (qual: string) => campo.current[qual]?.click();
  const dedo = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const temWebcam = !dedo && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const aceitos = aceita.split(',').map((t) => t.trim());

  async function receber(f: File | undefined, de: 'camera' | 'arquivo') {
    setErro('');
    if (!f) return;
    /* A mesma conferência do servidor, adiantada: recusar aqui poupa o envio
       de 10 MB pelo sinal fraco do hospital. O servidor confere de novo. */
    if (f.size > maximoMb * 1024 * 1024) {
      setErro(`O arquivo tem ${tamanhoLegivel(f.size)} e o limite é ${maximoMb} MB. `
        + 'Fotografe de novo em qualidade menor, ou digitalize a página.');
      return;
    }
    if (f.type && !aceitos.includes(f.type)) {
      setErro('Este tipo de arquivo não é aceito aqui. Envie PDF, JPG ou PNG.');
      return;
    }
    setOrigem(de);
    onEscolher(await lerArquivo(f));
  }

  if (arquivo) {
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
          {origem === 'webcam' && (
            <button type="button" className="btn sm sec" onClick={() => { onEscolher(null); setWebcam(true); }}>
              Tirar outra
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
      <div className="acoes">
        {dedo && (
          <button type="button" className="btn sm" onClick={() => abrir('camera')}>
            <Icone nome="foto" /> Tirar foto agora
          </button>
        )}
        {temWebcam && (
          <button type="button" className="btn sm" onClick={() => setWebcam(true)}>
            <Icone nome="foto" /> Usar a câmera do computador
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
             type="file" accept="image/*" tabIndex={-1} aria-hidden="true"
             onChange={(e) => { void receber(e.target.files?.[0], 'arquivo'); e.target.value = ''; }} />
      <input id={`${id}-arquivo`} ref={(el) => { campo.current.arquivo = el; }} className="so-leitor"
             type="file" accept={aceita} tabIndex={-1} aria-hidden="true"
             onChange={(e) => { void receber(e.target.files?.[0], 'arquivo'); e.target.value = ''; }} />
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {webcam && (
        <FolhaWebcam onFechar={() => setWebcam(false)}
          onFoto={(a) => { setWebcam(false); setOrigem('webcam'); onEscolher(a); }}
          onSemCamera={(frase) => { setWebcam(false); setErro(frase); }} />
      )}
    </div>
  );
}

/**
 * A WEBCAM DO COMPUTADOR. Abre só depois do gesto de quem pediu, e a câmera
 * é desligada ao fechar: luz de câmera acesa sem ninguém fotografando é
 * pergunta que ninguém na sala sabe responder.
 */
function FolhaWebcam({ onFechar, onFoto, onSemCamera }: {
  onFechar: () => void; onFoto: (a: Escolhido) => void; onSemCamera: (frase: string) => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [fluxo, setFluxo] = useState<MediaStream | null>(null);

  useEffect(() => {
    let vivo = true; let aberto: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
        aberto = s; setFluxo(s);
        if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => undefined); }
      })
      .catch((e: any) => {
        const nome = String(e?.name ?? '');
        onSemCamera(nome === 'NotAllowedError' || nome === 'SecurityError'
          ? 'A permissão da câmera foi negada neste navegador. Use Selecionar arquivo.'
          : 'Nenhuma câmera disponível neste aparelho. Use Selecionar arquivo.');
      });
    return () => { vivo = false; aberto?.getTracks().forEach((t) => t.stop()); };
  }, []);

  function fotografar() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const tela = document.createElement('canvas');
    tela.width = v.videoWidth; tela.height = v.videoHeight;
    tela.getContext('2d')!.drawImage(v, 0, 0);
    const dataUrl = tela.toDataURL('image/jpeg', 0.9);
    const agora = new Date();
    const nome = `foto-${agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}`
      + `-${agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).replace(':', 'h')}.jpg`;
    fluxo?.getTracks().forEach((t) => t.stop());
    onFoto({ nome, tipo: 'image/jpeg', tamanho: Math.round((dataUrl.length - 23) * 0.75), dataUrl });
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-webcam">
      <div className="sheet modal">
        <h3 id="t-webcam">Fotografar o documento</h3>
        <p className="mutetxt">Segure o papel de frente para a câmera, com boa luz, e fotografe.</p>
        <video ref={video} className="previa-img" playsInline muted aria-label="Imagem da câmera" />
        <div className="row rodape">
          <button className="btn sec grow" onClick={() => { fluxo?.getTracks().forEach((t) => t.stop()); onFechar(); }}>
            Cancelar
          </button>
          <button className="btn grow" disabled={!fluxo} onClick={fotografar}>Fotografar</button>
        </div>
      </div>
    </div>
  );
}
