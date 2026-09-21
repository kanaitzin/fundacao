import { useEffect, useState } from 'react';
import { api } from '../api';
import { baixarArquivo } from '../documentos';
import { dia } from '../rotulos';

/**
 * O DOSSIÊ DO ACOLHIDO (§6.1) e o ÁLBUM DE VIVÊNCIAS (§6.9).
 *
 * A casa tem uma pasta de papel por criança, e a pergunta que ela responde é
 * sempre a mesma: *falta alguma coisa desta criança?* Uma lista de arquivos
 * soltos não responde isso. Por isso a tela é a LISTA EXIGIDA, e cada item tem
 * uma de três situações: falta, aguardando conferência, aceito.
 *
 * Quatro decisões, e nenhuma é de estilo:
 *
 *  * **anexar não é conferir.** O arquivo entra sem aceite. A prévia abre, e
 *    quem OLHOU confirma que é aquele documento e que está legível — com nome
 *    e horário. Um RG borrado, a segunda página do laudo no lugar da primeira,
 *    a foto do documento de outra criança: é o erro que só o olho pega, e um
 *    sistema que marca sozinho ao anexar promete uma conferência que não houve;
 *  * **a prévia antes de enviar é local.** O arquivo aparece na tela ANTES de
 *    sair do aparelho; quem escolheu o arquivo errado descobre ali, e não
 *    depois de o documento de uma criança estar guardado no perfil de outra;
 *  * **o título é barrado quando parece CPF, diagnóstico ou teor judicial**
 *    (regra 3). A tela avisa antes de enviar; o servidor recusa por baixo. Nome
 *    de arquivo aparece em lista, em busca e em pasta compartilhada — é onde o
 *    sigilo vaza sem ninguém decidir nada;
 *  * **o álbum é da criança.** Aniversário, festa, conquista. É o que ela leva
 *    quando sai, e costuma ser a única coisa do acolhimento que ela vai querer
 *    rever. Sobre a autorização de uso de imagem, a Fundação decidiu não
 *    bloquear — mas o álbum MOSTRA quando ela não está registrada. Ausência é
 *    informação, e ninguém é pego de surpresa quando alguém perguntar.
 */

interface DocumentoDoDossie {
  id: string; categoria: string; titulo: string; chave: string | null;
  emitidoEm: string | null; validoAte: string | null; origem: string | null;
  anexadoEm: string; anexadoPor: string;
  aceitoEm: string | null; aceitoPor: string | null; notaDoAceite: string | null;
  versao: number | null;
  arquivo: { nome: string; tipo: string; tamanho: number; sha256: string } | null;
}
interface ItemDoDossie {
  chave: string; label: string; categoria: string; titulo: string;
  obrigatorio: boolean; vence?: boolean; ajuda?: string;
  documentos: DocumentoDoDossie[];
  situacao: 'falta' | 'aguardando_conferencia' | 'aceito';
}
interface CategoriaDoDossie {
  code: string; label: string; descricao: string; restrita: boolean;
  itens: ItemDoDossie[]; obrigatoriosQueFaltam: string[]; aguardandoConferencia: number;
}
interface Dossie {
  categorias: CategoriaDoDossie[]; avulsos: DocumentoDoDossie[];
  vence: DocumentoDoDossie[]; aviso: string;
}
interface FotoDaVivencia {
  id: string; nome: string | null; tipo: string | null; autorizacaoRegistrada: boolean;
}
interface Vivencia {
  id: string; tipo: string; quando: string; descricao: string;
  temFoto: boolean; autorizacaoRegistrada: boolean;
  /** Quantas forem (fase 124) — uma festa é UMA vivência, com seis fotos. */
  fotos: FotoDaVivencia[];
  arquivo: { nome: string; tipo: string } | null;
  registradoPor: string; registradoEm: string;
}
interface Album {
  itens: Vivencia[]; tipos: { code: string; label: string }[];
  semAutorizacao: number; aviso: string; avisoDaAutorizacao: string;
}
interface Catalogo {
  tamanhoMaximo: number; aceitos: string[]; aviso: string;
  tiposDeVivencia: { code: string; label: string }[];
}
/** O que a prévia precisa saber sobre um arquivo escolhido, antes de enviar. */
interface Escolhido { nome: string; tipo: string; tamanho: number; dataUrl: string }

const tam = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB`
                                        : `${Math.max(1, Math.round(b / 1024))} KB`);
const TOM_SITUACAO: Record<string, string> = {
  falta: 'c-mute', aguardando_conferencia: 'c-warn', aceito: 'c-ok',
};
const ROTULO_SITUACAO: Record<string, string> = {
  falta: 'Falta', aguardando_conferencia: 'Conferir', aceito: 'Conferido',
};

/** Lê o arquivo escolhido SEM enviar: a prévia acontece no aparelho. */
function lerArquivo(f: File): Promise<Escolhido> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ nome: f.name, tipo: f.type, tamanho: f.size,
                           dataUrl: String(r.result) });
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

export function Dossie({ personId, nome, papel, onVoltar }: {
  personId: string; nome: string; papel: string; onVoltar: () => void;
}) {
  const [dossie, setDossie] = useState<Dossie | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [aba, setAba] = useState<'dossie' | 'album'>('dossie');
  const [anexando, setAnexando] = useState<ItemDoDossie | null>(null);
  const [conferindo, setConferindo] = useState<DocumentoDoDossie | null>(null);
  const [novaVivencia, setNovaVivencia] = useState(false);
  const [vendoFoto, setVendoFoto] = useState<Vivencia | null>(null);

  async function carregar() {
    setErro('');
    try {
      const [d, a, c] = await Promise.all([
        api<Dossie>(`/people/${personId}/dossie`),
        api<Album>(`/people/${personId}/memories`).catch(() => null),
        api<Catalogo>('/people/dossie/catalogo').catch(() => null),
      ]);
      setDossie(d); setAlbum(a); setCatalogo(c);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o dossiê.');
    }
  }
  useEffect(() => { carregar(); }, [personId]);

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try {
      const r = await fn();
      if (r?.aviso) setAviso(r.aviso);
      await carregar();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false;
    }
  }

  const faltamAoTodo = dossie
    ? dossie.categorias.reduce((n, c) => n + c.obrigatoriosQueFaltam.length, 0) : 0;
  const aConferir = dossie
    ? dossie.categorias.reduce((n, c) => n + c.aguardandoConferencia, 0) : 0;

  return (
    <>
      <div className="diahead">
        <div>
          <button className="btn sm ghost" onClick={onVoltar}>← Perfil</button>
          <h2>{nome}</h2>
          <div className="mutetxt">O dossiê da casa e o álbum de vivências</div>
        </div>
        {dossie && (
          <div className="resumo">
            <span className={`pill ${faltamAoTodo ? 'c-warn' : 'c-ok'}`}>
              {faltamAoTodo ? `${faltamAoTodo} obrigatório(s) faltando` : 'Dossiê completo'}
            </span>
            {aConferir > 0 && <span className="pill c-crit">{aConferir} a conferir</span>}
          </div>
        )}
      </div>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      <div className="filtros" role="tablist" aria-label="Dossiê">
        <button role="tab" aria-selected={aba === 'dossie'} className={aba === 'dossie' ? 'on' : ''}
                onClick={() => setAba('dossie')}>📂 Documentos</button>
        <button role="tab" aria-selected={aba === 'album'} className={aba === 'album' ? 'on' : ''}
                onClick={() => setAba('album')}>📷 Vivências</button>
      </div>

      {aba === 'dossie' && dossie && (
        <>
          <div className="notice c-info">{dossie.aviso}</div>

          {/* O que vence, antes de vencer. Uma pasta cheia que não avisa é uma
              pasta que só serve depois que o problema aconteceu. */}
          {dossie.vence.length > 0 && (
            <div className="card">
              <div className="eyebrow" style={{ marginTop: 0 }}>Com validade</div>
              <ul className="lista">
                {dossie.vence.map((d) => (
                  <li key={d.id} className="row">
                    <span className="grow">{d.titulo}
                      <span className="mutetxt linhadois">vale até {dia(d.validoAte)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dossie.categorias.map((cat) => (
            <div className="card raise stack" key={cat.code} style={{ marginTop: 12 }}>
              <div className="row">
                <div className="grow">
                  <b className="ff">{cat.label}</b>
                  <div className="mutetxt">{cat.descricao}</div>
                </div>
                {cat.restrita && <span className="pill c-med">Restrita</span>}
              </div>

              {cat.obrigatoriosQueFaltam.length > 0 && (
                <div className="notice c-warn" role="status">
                  Faltam: <b>{cat.obrigatoriosQueFaltam.join(', ')}</b>.
                </div>
              )}

              <ul className="lista">
                {cat.itens.map((i) => (
                  <li key={i.chave} className="row">
                    <div className="grow">
                      <b className="ff">
                        {i.label}
                        {i.obrigatorio && i.situacao === 'falta' && (
                          <> <span className="pill c-warn">obrigatório</span></>
                        )}
                      </b>
                      {i.ajuda && <div className="mutetxt">{i.ajuda}</div>}
                      {/* O arquivo numa linha, quem respondeu por ele noutra, e
                          o botão embaixo: enfiar o botão no meio da frase fazia
                          "conferido por Marcelo" quebrar em cima dele. */}
                      {i.documentos.map((d) => (
                        <div className="docdoitem" key={d.id}>
                          <div className="mutetxt">
                            {d.arquivo?.nome ?? d.titulo}
                            {d.arquivo ? ` · ${tam(d.arquivo.tamanho)}` : ''}
                          </div>
                          <div className="mutetxt">
                            anexado por {d.anexadoPor}
                            {d.aceitoEm
                              ? ` · conferido por ${d.aceitoPor}`
                              : ' · ainda não conferido'}
                          </div>
                          {/* DE ONDE ELE VEIO (fase 125). O documento que
                              nasceu na tela de Saúde chega aqui conferido, e
                              sem esta linha ele apareceria na pasta da criança
                              sem ninguém saber quem o pôs ali nem onde
                              conferi-lo de novo. */}
                          {d.origem && <div className="mutetxt">{d.origem}</div>}
                          <button className={`btn sm ${d.aceitoEm ? 'ghost' : 'sec'}`}
                                  onClick={() => setConferindo(d)}>
                            {d.aceitoEm ? '👁 Abrir' : 'Conferir agora'}
                          </button>
                        </div>
                      ))}
                    </div>
                    <span className={`pill ${TOM_SITUACAO[i.situacao]}`}>
                      {ROTULO_SITUACAO[i.situacao]}
                    </span>
                    <button className="btn sm sec" onClick={() => setAnexando(i)}>📎 Anexar</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/*
            * O QUE NÃO PREENCHE NENHUMA VAGA DA LISTA (fase 125).
            *
            * A lista de documentos da tela é a lista do que a casa PRECISA ter:
            * certidão, cartão do SUS, guia de acolhimento. A bula do colírio e
            * o laudo que o hospital entregou não têm vaga nenhuma — e a tela
            * desenhava só as vagas, então eles chegavam ao dossiê e ficavam
            * invisíveis. O servidor já os devolvia, em `avulsos`; faltava
            * alguém desenhá-los.
            *
            * Não vale inventar vaga para eles: uma vaga de checklist é uma
            * cobrança, e a casa passaria a ver "falta a bula" de uma criança
            * que não toma remédio nenhum.
            */}
          {dossie.avulsos.length > 0 && (
            <div className="card raise stack" style={{ marginTop: 12 }}>
              <div className="row">
                <div className="grow">
                  <b className="ff">Outros documentos dela</b>
                  <div className="mutetxt">
                    Não preenchem nenhuma vaga da lista acima — são papéis que
                    chegaram pela criança, e ficam com ela.
                  </div>
                </div>
              </div>
              <ul className="lista">
                {dossie.avulsos.map((d) => (
                  <li key={d.id} className="row">
                    <div className="grow">
                      <b className="ff">{d.titulo}</b>
                      <div className="mutetxt">
                        {d.arquivo?.nome ?? 'sem arquivo guardado'}
                        {d.arquivo ? ` · ${tam(d.arquivo.tamanho)}` : ''}
                      </div>
                      <div className="mutetxt">
                        anexado por {d.anexadoPor}
                        {d.aceitoEm
                          ? ` · conferido por ${d.aceitoPor}`
                          : ' · ainda não conferido'}
                      </div>
                      {d.origem && <div className="mutetxt">{d.origem}</div>}
                    </div>
                    <button className={`btn sm ${d.aceitoEm ? 'ghost' : 'sec'}`}
                            onClick={() => setConferindo(d)}>
                      {d.aceitoEm ? '👁 Abrir' : 'Conferir agora'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {aba === 'album' && album && (
        <>
          <div className="notice c-info">{album.aviso}</div>
          {album.avisoDaAutorizacao && (
            <div className="notice c-warn" role="status">{album.avisoDaAutorizacao}</div>
          )}

          <button className="btn block" onClick={() => setNovaVivencia(true)}>
            + Registrar uma vivência
          </button>

          {album.itens.length === 0 && (
            <p className="mutetxt">
              Nenhuma vivência registrada ainda. O primeiro aniversário na casa é um bom começo.
            </p>
          )}

          <div className="stack" style={{ marginTop: 12 }}>
            {album.itens.map((v) => (
              <article className="card" key={v.id}>
                <div className="row">
                  <div className="grow">
                    <b className="ff">{dia(v.quando)}</b>
                    <div className="mutetxt linhadois">
                      registrado por {v.registradoPor}
                    </div>
                  </div>
                  <span className="pill c-other">
                    {album.tipos.find((t) => t.code === v.tipo)?.label ?? v.tipo}
                  </span>
                </div>
                <p style={{ margin: '8px 0 0' }}>{v.descricao}</p>
                {v.temFoto && (
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn sm sec" onClick={() => setVendoFoto(v)}>📷 Ver a foto</button>
                    {!v.autorizacaoRegistrada && (
                      <span className="pill c-warn">autorização de imagem não registrada</span>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {anexando && catalogo && (
        <FolhaAnexo
          item={anexando} catalogo={catalogo}
          onFechar={() => setAnexando(null)}
          onEnviar={async (dados) => {
            const ok = await acao(() => api(`/people/${personId}/documents`, {
              method: 'POST', body: JSON.stringify(dados) }));
            if (ok) setAnexando(null);
          }} />
      )}

      {conferindo && (
        <FolhaConferencia
          personId={personId} documento={conferindo}
          onFechar={() => setConferindo(null)}
          onAceitar={async (nota) => {
            const ok = await acao(() => api(
              `/people/${personId}/documents/${conferindo.id}/accept`,
              { method: 'POST', body: JSON.stringify({ nota }) }));
            if (ok) setConferindo(null);
          }} />
      )}

      {novaVivencia && album && (
        <FolhaVivencia
          tipos={album.tipos}
          onFechar={() => setNovaVivencia(false)}
          onEnviar={async (dados) => {
            const ok = await acao(() => api(`/people/${personId}/memories`, {
              method: 'POST', body: JSON.stringify(dados) }));
            if (ok) setNovaVivencia(false);
          }} />
      )}

      {vendoFoto && (
        <FolhaFoto personId={personId} vivencia={vendoFoto} onFechar={() => setVendoFoto(null)} />
      )}

      {papel === 'educador' && aba === 'dossie' && (
        <p className="mutetxt" style={{ marginTop: 14 }}>
          Você vê o que a casa já tem e o que falta. Os registros judiciais são de outro alcance —
          e não aparecem aqui nem vazios.
        </p>
      )}
    </>
  );
}

/**
 * A FOLHA DO ANEXO.
 *
 * A prévia acontece ANTES de o arquivo sair do aparelho: quem escolheu o
 * arquivo errado descobre ali, e não depois de o documento de uma criança estar
 * guardado no perfil de outra. Só depois de a pessoa dizer "é este" é que ele
 * sobe — e mesmo então ele nasce SEM aceite.
 */
function FolhaAnexo({ item, catalogo, onFechar, onEnviar }: {
  item: ItemDoDossie; catalogo: Catalogo; onFechar: () => void;
  onEnviar: (d: { chave: string; categoria: string; titulo: string; conteudo: string;
                  nomeArquivo: string; emitidoEm?: string; validoAte?: string }) => void;
}) {
  const [arquivo, setArquivo] = useState<Escolhido | null>(null);
  const [titulo, setTitulo] = useState(item.titulo);
  const [emitidoEm, setEmitidoEm] = useState('');
  const [validoAte, setValidoAte] = useState('');
  const [problema, setProblema] = useState('');

  /**
   * A mesma verificação do servidor, aqui — para a recusa não chegar depois de
   * a pessoa esperar o envio de um arquivo de 8 MB.
   */
  function conferirTitulo(t: string) {
    if (/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(t)) {
      setProblema('O título parece conter um CPF. O número fica DENTRO do documento, nunca no '
        + 'nome dele: nome de arquivo aparece em lista, em busca e em pasta compartilhada.');
    } else if (/(transtorno|autis|deficien|hiv|soroposit|depress|esquizo|bipolar|epilep|cid[- ]?10)/i.test(t)) {
      setProblema('O título parece descrever um diagnóstico. Use um título neutro — '
        + '"Laudo — 12/03" — e deixe o conteúdo dentro do arquivo.');
    } else if (/(abuso|estupro|viol[êe]ncia sexual|neglig[êe]ncia|maus.tratos|destitui)/i.test(t)) {
      setProblema('O título parece descrever o teor de uma decisão. Use um título neutro e '
        + 'deixe o teor dentro do arquivo.');
    } else setProblema('');
  }

  const pode = arquivo != null && titulo.trim().length >= 2 && !problema;
  const ehImagem = arquivo?.dataUrl.startsWith('data:image');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-anx"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-anx">Anexar · {item.label}</h3>
        <div className="notice c-info">{catalogo.aviso}</div>

        <label className="f" htmlFor="anx-arq">
          O arquivo <small>— {catalogo.aceitos.join(', ')}, até {tam(catalogo.tamanhoMaximo)}</small>
        </label>
        <input id="anx-arq" type="file" accept="image/*,application/pdf,.heic"
               onChange={async (e) => {
                 const f = e.target.files?.[0];
                 if (f) setArquivo(await lerArquivo(f));
               }} />

        {arquivo && (
          <>
            <div className="bloco">
              <small>Confira antes de enviar</small>
              {ehImagem ? (
                <img src={arquivo.dataUrl} alt={`Prévia de ${arquivo.nome}`}
                     style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
              ) : (
                <p className="mutetxt" style={{ margin: 0 }}>
                  {arquivo.nome} · {tam(arquivo.tamanho)} — a prévia de PDF abre depois de
                  guardado, na conferência.
                </p>
              )}
            </div>
            <p className="mutetxt">
              {arquivo.nome} · {tam(arquivo.tamanho)}. O sistema confere o tipo pela assinatura do
              arquivo; <b>só os seus olhos</b> confirmam que é o documento certo, e desta criança.
            </p>
          </>
        )}

        <label className="f" htmlFor="anx-tit">
          Título <small>— sem CPF, diagnóstico ou teor de decisão</small>
        </label>
        <input id="anx-tit" value={titulo}
               onChange={(e) => { setTitulo(e.target.value); conferirTitulo(e.target.value); }} />
        {problema && <div className="notice c-crit" role="alert">{problema}</div>}

        <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div className="grow">
            <label className="f" htmlFor="anx-em">Data <small>— opcional</small></label>
            <input id="anx-em" type="date" value={emitidoEm}
                   onChange={(e) => setEmitidoEm(e.target.value)} />
          </div>
          {item.vence && (
            <div className="grow">
              <label className="f" htmlFor="anx-ate">Vale até</label>
              <input id="anx-ate" type="date" value={validoAte}
                     onChange={(e) => setValidoAte(e.target.value)} />
            </div>
          )}
        </div>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onEnviar({
            chave: item.chave, categoria: item.categoria, titulo: titulo.trim(),
            conteudo: arquivo!.dataUrl, nomeArquivo: arquivo!.nome,
            emitidoEm: emitidoEm || undefined, validoAte: validoAte || undefined,
          })}>
            É o {item.label} — anexar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DA CONFERÊNCIA — o aceite.
 *
 * Abre o arquivo GUARDADO (não o que estava no aparelho), porque é esse que
 * vai ficar. O servidor confere o sha256 antes de devolver: um objeto trocado
 * por baixo não passa como se fosse o que foi aceito.
 */
function FolhaConferencia({ personId, documento, onFechar, onAceitar }: {
  personId: string; documento: DocumentoDoDossie;
  onFechar: () => void; onAceitar: (nota?: string) => void;
}) {
  const [arquivo, setArquivo] = useState<{ tipo: string; dataUrl: string } | null>(null);
  const [erro, setErro] = useState('');
  const [nota, setNota] = useState('');

  async function baixar() {
    setErro('');
    try {
      const a = await api<{ nome: string; tipo: string; conteudo: string }>(
        `/people/${personId}/documents/${documento.id}/download`, { method: 'POST' });
      baixarArquivo(a.nome, a.tipo, a.conteudo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível baixar o arquivo.');
    }
  }

  useEffect(() => {
    api<{ nome: string; tipo: string; conteudo: string }>(
      `/people/${personId}/documents/${documento.id}/file`)
      .then((a) => setArquivo({ tipo: a.tipo, dataUrl: `data:${a.tipo};base64,${a.conteudo}` }))
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.'));
  }, [documento.id]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-conf"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-conf">{documento.aceitoEm ? 'Documento' : 'Conferir'} · {documento.titulo}</h3>
        <p className="mutetxt">
          {documento.arquivo?.nome} · anexado por {documento.anexadoPor}
          {documento.aceitoEm ? ` · conferido por ${documento.aceitoPor}` : ''}
        </p>

        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {!arquivo && !erro && <p className="mutetxt">Abrindo o arquivo…</p>}
        {arquivo && (arquivo.tipo.startsWith('image')
          ? <img src={arquivo.dataUrl} alt={documento.titulo}
                 style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
          : <iframe src={arquivo.dataUrl} title={documento.titulo}
                    style={{ width: '100%', height: '46vh', border: 0, borderRadius: 10,
                             background: '#fff' }} />)}

        {documento.aceitoEm ? (
          <>
            {documento.notaDoAceite && (
              <div className="bloco"><small>O que quem conferiu escreveu</small>
                {documento.notaDoAceite}</div>
            )}
            {/*
              * BAIXAR (fase 124) — *"poder visualizar a hora que eles quiserem
              * e baixar"*. Passa pelo SERVIDOR, e não salva os bytes que a
              * prévia já tem: sair com o arquivo é outro ato, e é o que alguém
              * vai querer rastrear no dia em que uma certidão aparecer onde
              * não devia.
              */}
            <div className="row rodape">
              <button className="btn sec grow" onClick={() => void baixar()}>
                ⬇️ Baixar
              </button>
              <button className="btn grow" onClick={onFechar}>Fechar</button>
            </div>
          </>
        ) : (
          <>
            <div className="notice c-warn">
              Este arquivo ainda não foi conferido. Olhe a prévia: é <b>este documento</b>, é
              <b> desta criança</b>, e está legível? O aceite fica com o seu nome e o horário.
            </div>
            <label className="f" htmlFor="conf-nota">Observação <small>— opcional</small></label>
            <input id="conf-nota" value={nota} onChange={(e) => setNota(e.target.value)}
                   placeholder="Ex.: legível; a segunda via chegou pela escola." />
            <div className="row rodape">
              <button className="btn sec grow" onClick={onFechar}>Ainda não</button>
              <button className="btn grow" disabled={!arquivo}
                      onClick={() => onAceitar(nota.trim() || undefined)}>
                ✓ Conferi — é este e está legível
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A FOLHA DA VIVÊNCIA. A foto é opcional; o que aconteceu, não. */
function FolhaVivencia({ tipos, onFechar, onEnviar }: {
  tipos: { code: string; label: string }[]; onFechar: () => void;
  onEnviar: (d: { tipo: string; quando: string; descricao: string;
                  fotos: { conteudo: string; nomeArquivo?: string;
                           autorizacaoRegistrada: boolean }[];
                  autorizacaoRegistrada: boolean }) => void;
}) {
  const [tipo, setTipo] = useState('');
  const [quando, setQuando] = useState('');
  const [descricao, setDescricao] = useState('');
  const [fotos, setFotos] = useState<Escolhido[]>([]);
  const [autorizada, setAutorizada] = useState(false);
  const pode = tipo !== '' && quando !== '' && descricao.trim().length >= 5;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-viv"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-viv">Registrar uma vivência</h3>
        <div className="notice c-info">
          Este álbum é da criança. É o que ela leva quando sai, e costuma ser a única coisa do
          acolhimento que ela vai querer rever.
        </div>

        <label className="f">O que foi</label>
        <div className="opts">
          {tipos.map((t) => (
            <button type="button" key={t.code} className="opt c-other"
                    aria-pressed={tipo === t.code} onClick={() => setTipo(t.code)}>
              {t.label}
            </button>
          ))}
        </div>

        <label className="f" htmlFor="viv-quando">Quando</label>
        <input id="viv-quando" type="date" value={quando}
               onChange={(e) => setQuando(e.target.value)} />

        <label className="f" htmlFor="viv-desc">
          O que aconteceu <small>— a foto sozinha, daqui a dez anos, não conta a história</small>
        </label>
        <textarea id="viv-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: aniversário de 8 anos, com bolo de chocolate feito na casa e a turma toda cantando." />

        {/*
          * VÁRIAS DE UMA VEZ (fase 124), e a prévia de TODAS antes de confirmar.
          *
          * *"Podendo previamente visualizar o que está sendo hospedado e
          * confirmar."* A educadora que volta da festa com seis fotos
          * registrava seis vivências — seis vezes a mesma data e a mesma
          * descrição, e o álbum contando a festa seis vezes.
          */}
        <label className="f" htmlFor="viv-foto">
          Fotos <small>— opcional, e pode escolher várias</small>
        </label>
        <input id="viv-foto" type="file" accept="image/*" multiple
               onChange={async (e) => {
                 const escolhidos = [...(e.target.files ?? [])];
                 if (escolhidos.length) {
                   setFotos(await Promise.all(escolhidos.map((f) => lerArquivo(f))));
                 }
               }} />
        {fotos.length > 0 && (
          <>
            <p className="mutetxt">
              {fotos.length === 1 ? 'Uma foto escolhida' : `${fotos.length} fotos escolhidas`}
              {' '}— confira antes de guardar.
            </p>
            <div className="stack">
              {fotos.map((f) => (
                <img key={f.nome + f.tamanho} src={f.dataUrl} alt={`Prévia de ${f.nome}`}
                     style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
              ))}
            </div>
            {/* NÃO bloqueia — registra. A decisão da Fundação foi não impedir; o
                que o sistema faz é dizer a verdade sobre o que ele sabe. */}
            <label className="f" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={autorizada} style={{ width: 'auto' }}
                     onChange={(e) => setAutorizada(e.target.checked)} />
              A autorização de uso de imagem desta criança está registrada
            </label>
            {!autorizada && (
              <p className="mutetxt">
                Sem marcar, a foto entra do mesmo jeito — e fica anotado que a autorização não
                está registrada. Ninguém é impedido; ninguém é pego de surpresa.
              </p>
            )}
          </>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onEnviar({
            tipo, quando, descricao: descricao.trim(),
            /* A autorização vale para as fotos DESTE envio. Ela é por foto no
               banco — a festa pode ter uma com uma criança de outra casa —, e
               a tela ainda não pergunta uma a uma: quando perguntar, o campo
               já está lá. */
            fotos: fotos.map((f) => ({
              conteudo: f.dataUrl, nomeArquivo: f.nome, autorizacaoRegistrada: autorizada,
            })),
            autorizacaoRegistrada: autorizada,
          })}>
            Guardar no álbum
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * AS FOTOS de uma vivência, abertas (fase 124).
 *
 * Cada abertura vira registro no servidor — e agora são quantas a vivência
 * tiver. Uma a uma, por rota própria: carregar seis fotos de celular de uma
 * vez numa conexão de casa é a tela que não abre, e o álbum é justamente o que
 * a equipe mostra para a criança no meio do plantão.
 */
function FolhaFoto({ personId, vivencia, onFechar }: {
  personId: string; vivencia: Vivencia; onFechar: () => void;
}) {
  const fotos = vivencia.fotos?.length
    ? vivencia.fotos
    : [{ id: '', nome: null, tipo: null,
         autorizacaoRegistrada: vivencia.autorizacaoRegistrada }];
  const [i, setI] = useState(0);
  const [url, setUrl] = useState('');
  const [erro, setErro] = useState('');
  const atual = fotos[Math.min(i, fotos.length - 1)];

  useEffect(() => {
    let vivo = true;
    setUrl(''); setErro('');
    /* Rota por extenso nos dois casos, e não uma interpolação condicional: ela
       esconde a rota do `contrato-rotas.spec` e de quem lê (lição da 120). */
    const pedido = atual.id
      ? api<{ tipo: string; conteudo: string }>(
          `/people/${personId}/memories/${vivencia.id}/photos/${atual.id}`)
      : api<{ tipo: string; conteudo: string }>(
          `/people/${personId}/memories/${vivencia.id}/file`);
    pedido
      .then((a) => { if (vivo) setUrl(`data:${a.tipo};base64,${a.conteudo}`); })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível abrir a foto.'); });
    return () => { vivo = false; };
  }, [vivencia.id, atual.id, personId]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-foto"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-foto">{dia(vivencia.quando)}</h3>
        <p className="mutetxt">{vivencia.descricao}</p>
        {fotos.length > 1 && (
          <p className="mutetxt">Foto {Math.min(i, fotos.length - 1) + 1} de {fotos.length}</p>
        )}
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {url && <img src={url} alt={vivencia.descricao}
                     style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />}
        {/* A autorização é POR FOTO: a festa pode ter uma com uma criança de
            outra casa, e a autorização dela é outra conversa. */}
        {!atual.autorizacaoRegistrada && (
          <div className="notice c-warn" style={{ marginTop: 10 }}>
            A autorização de uso de imagem desta criança não está registrada nesta foto.
          </div>
        )}
        {fotos.length > 1 && (
          <div className="row">
            <button className="btn sec grow" disabled={i === 0}
                    onClick={() => setI((n) => Math.max(0, n - 1))}>← Anterior</button>
            <button className="btn sec grow" disabled={i >= fotos.length - 1}
                    onClick={() => setI((n) => Math.min(fotos.length - 1, n + 1))}>Próxima →</button>
          </div>
        )}
        <div className="row rodape">
          <button className="btn grow" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
