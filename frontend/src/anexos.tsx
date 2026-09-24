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
import { ReactNode, useEffect, useState } from 'react';
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
