import { useEffect, useState } from 'react';
import { api } from '../api';
import { baixarArquivo, FolhaDocumento } from '../documentos';
import type { ArquivoGerado } from '../documentos';
import type { DocumentoWord } from '../docx';
import { dia } from '../rotulos';
import { Icone } from '../icones';
import { EscolherAnexo, LerTextoDoPapel, miniaturaDe } from '../anexos';
import type { Escolhido } from '../anexos';
import { Explica } from '../explica';

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
  /** O texto conferido do papel (fase 234). */
  texto?: { texto: string; versao: number; origem: string; por: string; em: string } | null;
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
interface QuemAparece {
  marcaId: string; personId: string; nome: string; autorizacaoRegistrada: boolean; marcadaPor: string | null;
}
interface FotoDaVivencia {
  id: string; nome: string | null; tipo: string | null; autorizacaoRegistrada: boolean;
  /* Fase 209: a foto pequena para a lista, e quem aparece nela. */
  temMiniatura?: boolean; quemAparece?: QuemAparece[];
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

const tam = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB`
                                        : `${Math.max(1, Math.round(b / 1024))} KB`);
const TOM_SITUACAO: Record<string, string> = {
  falta: 'c-mute', aguardando_conferencia: 'c-warn', aceito: 'c-ok',
};
const ROTULO_SITUACAO: Record<string, string> = {
  falta: 'Falta', aguardando_conferencia: 'Conferir', aceito: 'Conferido',
};

/* A leitura do arquivo é a do `anexos.tsx` (fase 175): aqui havia uma cópia, e a
   cópia não reduziria a foto que a Fundação decidiu reduzir. */

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
  /* O relatório das vivências em Word (fase 237): as escolhas, e depois a folha. */
  const [relatorio, setRelatorio] = useState(false);
  /* A busca pelo título e pelo texto conferido do papel (fase 234). */
  const [procura, setProcura] = useState('');

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
                onClick={() => setAba('dossie')}><Icone nome="pasta" /> Documentos</button>
        <button role="tab" aria-selected={aba === 'album'} className={aba === 'album' ? 'on' : ''}
                onClick={() => setAba('album')}><Icone nome="foto" /> Vivências</button>
      </div>

      {aba === 'dossie' && dossie && (
        <>
          <Explica className="notice c-info">{dossie.aviso}</Explica>

          <ProcurarNosDocumentos dossie={dossie} procura={procura} onProcura={setProcura}
                                 onAbrir={setConferindo} />

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
                            {d.aceitoEm ? <><Icone nome="olhar" /> Abrir</> : 'Conferir agora'}
                          </button>
                        </div>
                      ))}
                    </div>
                    <span className={`pill ${TOM_SITUACAO[i.situacao]}`}>
                      {ROTULO_SITUACAO[i.situacao]}
                    </span>
                    <button className="btn sm sec" onClick={() => setAnexando(i)}><Icone nome="anexo" /> Anexar</button>
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
                      {d.aceitoEm ? <><Icone nome="olhar" /> Abrir</> : 'Conferir agora'}
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
          <Explica className="notice c-info">{album.aviso}</Explica>
          {album.avisoDaAutorizacao && (
            <div className="notice c-warn" role="status">{album.avisoDaAutorizacao}</div>
          )}

          <button data-acolhe-abre="" className="btn block" onClick={() => setNovaVivencia(true)}>
            + Registrar uma vivência
          </button>
          {album.itens.length > 0 && (
            <button data-acolhe-abre="" className="btn sec block" onClick={() => setRelatorio(true)}>
              <Icone nome="documento" /> Relatório das vivências em Word
            </button>
          )}
          {relatorio && (
            <FolhaRelatorioDasVivencias personId={personId} album={album} onFechar={() => setRelatorio(false)} />
          )}

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
                  <Miniaturas personId={personId} vivencia={v} onAbrir={() => setVendoFoto(v)} />
                )}
                {v.temFoto && (
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn sm sec" onClick={() => setVendoFoto(v)}><Icone nome="foto" /> Ver a foto</button>
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
          onTextoGuardado={() => void carregar()} papel={papel}
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
        <FolhaFoto personId={personId} vivencia={vendoFoto} papel={papel}
                   onFechar={() => setVendoFoto(null)} onMudou={carregar} />
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
  onEnviar: (d: { chave?: string; categoria: string; titulo: string; conteudo: string;
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

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-anx"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-anx">Anexar · {item.label}</h3>
        <Explica className="notice c-info">{catalogo.aviso}</Explica>

        <label className="f" htmlFor="anx-arq-arquivo">
          O arquivo <small>({catalogo.aceitos.join(', ')}, até {tam(catalogo.tamanhoMaximo)})</small>
        </label>
        {/* A câmera do sistema e o documento digitalizado em PDF (fase 194): a
            certidão de duas folhas vira UM documento, e não duas fotos. */}
        <EscolherAnexo id="anx-arq" arquivo={arquivo} onEscolher={setArquivo}
          aceita="application/pdf,image/jpeg,image/png,image/heic,image/heif"
          maximoMb={Math.floor(catalogo.tamanhoMaximo / 1048576)} />

        <label className="f" htmlFor="anx-tit">
          Título <small>(sem CPF, diagnóstico ou teor de decisão)</small>
        </label>
        <input id="anx-tit" value={titulo}
               onChange={(e) => { setTitulo(e.target.value); conferirTitulo(e.target.value); }} />
        {problema && <div className="notice c-crit" role="alert">{problema}</div>}

        <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div className="grow">
            <label className="f" htmlFor="anx-em">Data <small>(opcional)</small></label>
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
            chave: item.chave || undefined, categoria: item.categoria, titulo: titulo.trim(),
            conteudo: arquivo!.dataUrl, nomeArquivo: arquivo!.nome,
            emitidoEm: emitidoEm || undefined, validoAte: validoAte || undefined,
          })}>
            {item.chave ? `É o ${item.label}: anexar` : 'Anexar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sem acento e sem maiúscula, para a busca achar *oficio* em *Ofício*. */
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * PROCURAR NOS DOCUMENTOS (fase 234): pelo título e pelo texto conferido do
 * papel. Acha o ofício que fala da audiência sem abrir um por um. Procura só no
 * que esta pessoa já vê: a lista é a do dossiê que o servidor devolveu.
 */
function ProcurarNosDocumentos({ dossie, procura, onProcura, onAbrir }: {
  dossie: Dossie; procura: string; onProcura: (t: string) => void;
  onAbrir: (d: DocumentoDoDossie) => void;
}) {
  const todos = [
    ...dossie.categorias.flatMap((c) => c.itens.flatMap((i) => i.documentos)),
    ...dossie.avulsos,
  ].filter((d, k, l) => l.findIndex((x) => x.id === d.id) === k);
  const termo = semAcento(procura.trim());
  const achados = termo.length < 2 ? [] : todos.filter((d) =>
    semAcento(d.titulo).includes(termo) || semAcento(d.texto?.texto ?? '').includes(termo));
  const trecho = (d: DocumentoDoDossie) => {
    const t = d.texto?.texto ?? '';
    const k = semAcento(t).indexOf(termo);
    if (k < 0) return '';
    const ini = Math.max(0, k - 40);
    return `${ini > 0 ? '…' : ''}${t.slice(ini, k + termo.length + 60).replace(/\s+/g, ' ')}…`;
  };
  if (!todos.length) return null;
  return (
    <div className="card stack" style={{ marginTop: 12 }}>
      <label className="f" htmlFor="dossie-procura">Procurar nos documentos</label>
      <input id="dossie-procura" type="search" value={procura} onChange={(e) => onProcura(e.target.value)}
             placeholder="Pelo título ou pelo texto conferido do papel" />
      {termo.length >= 2 && (
        achados.length ? (
          <ul className="lista" aria-label="Documentos achados">
            {achados.map((d) => (
              <li key={d.id} className="row">
                <span className="grow">{d.titulo}
                  {trecho(d) && <span className="mutetxt linhadois">{trecho(d)}</span>}
                </span>
                <button className="btn sm sec" aria-label={`Abrir ${d.titulo}`} onClick={() => onAbrir(d)}>Abrir</button>
              </li>
            ))}
          </ul>
        ) : <p className="mutetxt" role="status">Nenhum documento com esse título ou texto.</p>
      )}
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
/** Quem guarda o texto conferido: quem pode anexar ao perfil (o servidor confere de novo). */
const GUARDA_TEXTO = ['enfermagem', 'equipe_tecnica', 'coordenador', 'gestor_geral'];

function FolhaConferencia({ personId, documento, onFechar, onAceitar, onTextoGuardado, papel }: {
  personId: string; documento: DocumentoDoDossie;
  onFechar: () => void; onAceitar: (nota?: string) => void;
  /** Depois de guardar o texto conferido, quem abriu recarrega a lista (fase 234). */
  onTextoGuardado?: () => void;
  /** O cargo de quem abriu: quem não guarda lê e copia. Sem ele, o servidor responde. */
  papel?: string;
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

        {/* O texto do papel, lido neste aparelho e conferido pela pessoa (fase 234). */}
        {arquivo && (arquivo.tipo.startsWith('image') || arquivo.tipo === 'application/pdf') && (
          <LerTextoDoPapel
            guardado={documento.texto ?? null}
            paginas={async () => arquivo.tipo.startsWith('image')
              ? [arquivo.dataUrl]
              : (await api<{ paginas: string[] }>(`/people/${personId}/documents/${documento.id}/paginas`)).paginas}
            onGuardar={papel && !GUARDA_TEXTO.includes(papel) ? undefined : async (texto, origem) => {
              await api(`/people/${personId}/documents/${documento.id}/texto`,
                { method: 'POST', body: JSON.stringify({ texto, origem }) });
              onTextoGuardado?.();
            }} />
        )}

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
                <Icone nome="baixar" /> Baixar
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
            <label className="f" htmlFor="conf-nota">Observação <small>(opcional)</small></label>
            <input id="conf-nota" value={nota} onChange={(e) => setNota(e.target.value)}
                   placeholder="Ex.: legível; a segunda via chegou pela escola." />
            <div className="row rodape">
              <button className="btn sec grow" onClick={onFechar}>Ainda não</button>
              <button className="btn grow" disabled={!arquivo}
                      onClick={() => onAceitar(nota.trim() || undefined)}>
                <Icone nome="conferido" /> Conferi — é este e está legível
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * O RELATÓRIO DAS VIVÊNCIAS (fase 237): quem pede escolhe o que entra (o período,
 * os tipos, quais vivências e se vai com as fotos), vê a folha e baixa o Word com
 * a finalidade. As fotos seguem o cargo: a tela diz quantas ficam de fora e por quê.
 */
function FolhaRelatorioDasVivencias({ personId, album, onFechar }: {
  personId: string; album: Album; onFechar: () => void;
}) {
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [tipos, setTipos] = useState<Set<string>>(new Set());
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [comFotos, setComFotos] = useState(true);
  const [erro, setErro] = useState('');
  const [previa, setPrevia] = useState<{ folha: DocumentoWord; fotosForaPeloCargo: number; incluiTodasAsFotos: boolean } | null>(null);
  const tiposUsados = album.tipos.filter((t) => album.itens.some((v) => v.tipo === t.code));
  const visiveis = album.itens.filter((v) => (!de || v.quando.slice(0, 10) >= de) && (!ate || v.quando.slice(0, 10) <= ate)
    && (!tipos.size || tipos.has(v.tipo)));
  const corpo = () => ({
    de: de || undefined, ate: ate || undefined, tipos: tipos.size ? [...tipos] : undefined,
    ids: visiveis.filter((v) => !fora.has(v.id)).map((v) => v.id), comFotos,
  });
  const quantas = visiveis.filter((v) => !fora.has(v.id)).length;

  if (previa) {
    return (
      <>
        {previa.fotosForaPeloCargo > 0 && (
          <div className="notice c-warn" role="status">
            {previa.fotosForaPeloCargo} {previa.fotosForaPeloCargo === 1 ? 'foto fica' : 'fotos ficam'} só como legenda:
            {' '}sem a autorização de imagem registrada, a foto entra no relatório de quem é da equipe técnica, liderança,
            coordenação ou gestão. Se precisar dela, peça a uma dessas pessoas.
          </div>
        )}
        <FolhaDocumento doc={previa.folha} onFechar={() => { setPrevia(null); onFechar(); }}
          exportar={(finalidade) => api<ArquivoGerado>(`/people/${personId}/memories/export`, {
            method: 'POST', body: JSON.stringify({ ...corpo(), finalidade }) })} />
      </>
    );
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-relviv"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-relviv">Relatório das vivências</h3>
        <p className="mutetxt" style={{ marginTop: 0 }}>Escolha o que entra. Depois você vê a folha e baixa em Word.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="grow"><label className="f" htmlFor="rv-de">De <small>(opcional)</small></label>
            <input id="rv-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div className="grow"><label className="f" htmlFor="rv-ate">Até <small>(opcional)</small></label>
            <input id="rv-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        </div>
        {tiposUsados.length > 1 && (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="f">Tipos <small>(sem marcar nenhum, vão todos)</small></legend>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {tiposUsados.map((t) => (
                <label key={t.code} className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={tipos.has(t.code)} onChange={(e) => {
                    const n = new Set(tipos); if (e.target.checked) n.add(t.code); else n.delete(t.code); setTipos(n);
                  }} /> {t.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="f">Vivências que entram <small>({quantas} de {visiveis.length})</small></legend>
          <ul className="lista" aria-label="Vivências do relatório">
            {visiveis.map((v) => (
              <li key={v.id}>
                <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={!fora.has(v.id)} onChange={(e) => {
                    const n = new Set(fora); if (e.target.checked) n.delete(v.id); else n.add(v.id); setFora(n);
                  }} />
                  <span className="grow">{dia(v.quando)} · {album.tipos.find((t) => t.code === v.tipo)?.label ?? v.tipo}
                    <span className="mutetxt linhadois">{v.descricao.slice(0, 90)}{v.descricao.length > 90 ? '…' : ''}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={comFotos} onChange={(e) => setComFotos(e.target.checked)} /> Com as fotos
        </label>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!quantas} onClick={async () => {
            setErro('');
            try {
              setPrevia(await api(`/people/${personId}/memories/folha`, { method: 'POST', body: JSON.stringify(corpo()) }));
            } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível montar o relatório.'); }
          }}>Ver a folha</button>
        </div>
      </div>
    </div>
  );
}

/** A FOLHA DA VIVÊNCIA. A foto é opcional; o que aconteceu, não. */
function FolhaVivencia({ tipos, onFechar, onEnviar }: {
  tipos: { code: string; label: string }[]; onFechar: () => void;
  onEnviar: (d: { tipo: string; quando: string; descricao: string;
                  fotos: { conteudo: string; nomeArquivo?: string;
                           autorizacaoRegistrada: boolean; miniatura?: string }[];
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
        <label className="f" htmlFor="viv-foto-arquivo">
          Fotos <small>— opcional, e pode escolher várias</small>
        </label>
        {/* Pela câmera do sistema (fase 194), uma a uma, ou várias da galeria. */}
        <EscolherAnexo id="viv-foto" arquivo={null} multiplos aceita="image/jpeg,image/png"
          onEscolher={(f) => { if (f) setFotos((xs) => [...xs, f]); }} />
        {fotos.length > 0 && (
          <>
            <p className="mutetxt">
              {fotos.length === 1 ? 'Uma foto escolhida' : `${fotos.length} fotos escolhidas`}
              {' '}— confira antes de guardar.
            </p>
            <div className="stack">
              {fotos.map((f, i) => (
                <div key={i} className="stack" style={{ gap: 4 }}>
                  <img src={f.dataUrl} alt={`Prévia da foto ${i + 1}`}
                       style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
                  <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }}
                          onClick={() => setFotos((xs) => xs.filter((_, j) => j !== i))}>
                    Tirar a foto {i + 1}
                  </button>
                </div>
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
          <button className="btn grow" disabled={!pode} onClick={async () => onEnviar({
            tipo, quando, descricao: descricao.trim(),
            /* A autorização vale para as fotos DESTE envio. Ela é por foto no
               banco — a festa pode ter uma com uma criança de outra casa —, e
               a tela ainda não pergunta uma a uma: quando perguntar, o campo
               já está lá. */
            fotos: await Promise.all(fotos.map(async (f) => ({
              conteudo: f.dataUrl, nomeArquivo: f.nome, autorizacaoRegistrada: autorizada,
              /* A miniatura vai junto (fase 209): o álbum lista as pequenas. */
              miniatura: (await miniaturaDe(f.dataUrl)) ?? undefined,
            }))),
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
function FolhaFoto({ personId, vivencia, papel, onFechar, onMudou }: {
  personId: string; vivencia: Vivencia; papel: string; onFechar: () => void; onMudou: () => void;
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
        {atual.id && <QuemApareceNaFoto personId={personId} foto={atual} papel={papel} onMudou={onMudou} />}
        {/* Passar de foto mora no rodapé que acompanha a rolagem (fase 184):
            no celular a foto ocupa a tela, e os botões abaixo dela ficavam
            cobertos pelo Fechar. */}
        <div className="row rodape" style={{ flexWrap: 'wrap' }}>
          {fotos.length > 1 && (
            <>
              <button className="btn sec grow" disabled={i === 0}
                      onClick={() => setI((n) => Math.max(0, n - 1))}>← Anterior</button>
              <button className="btn sec grow" disabled={i >= fotos.length - 1}
                      onClick={() => setI((n) => Math.min(fotos.length - 1, n + 1))}>Próxima →</button>
            </>
          )}
          <button className="btn grow" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

/* AS MINIATURAS do álbum (fase 209): a foto pequena na lista, a inteira no toque.
   Foto guardada antes da miniatura existir mostra o botão, como antes. */
function Miniaturas({ personId, vivencia, onAbrir }: { personId: string; vivencia: Vivencia; onAbrir: () => void }) {
  const [srcs, setSrcs] = useState<Record<string, string>>({});
  const comMini = (vivencia.fotos ?? []).filter((f) => f.temMiniatura);
  useEffect(() => {
    let vivo = true;
    (async () => {
      for (const f of comMini) {
        try {
          const a = await api<{ tipo: string; conteudo: string }>(
            `/people/${personId}/memories/${vivencia.id}/photos/${f.id}/miniatura`);
          if (vivo) setSrcs((x) => ({ ...x, [f.id]: `data:${a.tipo};base64,${a.conteudo}` }));
        } catch { /* sem a miniatura, fica o botão */ }
      }
    })();
    return () => { vivo = false; };
  }, [personId, vivencia.id]);
  if (!comMini.length) return null;
  return (
    <div className="miniaturas">
      {comMini.map((f, i) => srcs[f.id] && (
        <button key={f.id} type="button" className="miniatura" onClick={onAbrir}
                aria-label={`Abrir a foto ${i + 1} de ${vivencia.descricao}`}>
          <img src={srcs[f.id]} alt="" />
        </button>
      ))}
    </div>
  );
}

/* QUEM APARECE NA FOTO (fase 209): a pessoa marca, e a foto entra no álbum de
   cada criança marcada. Desmarcar pede o motivo. Nenhum rosto é reconhecido
   pela máquina: é dado biométrico de criança. */
const MARCA_NA_FOTO = ['educador', 'lider_diurno', 'lider_noturno_geral', 'equipe_tecnica', 'coordenador'];
function QuemApareceNaFoto({ personId, foto, papel, onMudou }: {
  personId: string; foto: FotoDaVivencia; papel: string; onMudou: () => void;
}) {
  const [casa, setCasa] = useState<{ id: string; nome: string }[]>([]);
  const [escolhida, setEscolhida] = useState('');
  const [autorizada, setAutorizada] = useState(false);
  const [msg, setMsg] = useState('');
  const [tirando, setTirando] = useState<QuemAparece | null>(null);
  const [motivo, setMotivo] = useState('');
  const pode = MARCA_NA_FOTO.includes(papel);
  const marcados = foto.quemAparece ?? [];
  useEffect(() => {
    if (!pode) return;
    api<{ casaAtual?: { id: string } }>(`/people/${personId}`)
      .then((p) => p.casaAtual?.id
        ? api<{ id: string; nome: string }[]>(`/people?houseId=${p.casaAtual.id}`) : [])
      .then((l) => setCasa(l.filter((c) => c.id !== personId)))
      .catch(() => setCasa([]));
  }, [personId, pode]);

  async function marcar() {
    setMsg('');
    try {
      const r = await api<{ aviso: string }>(`/people/memory-photos/${foto.id}/pessoas`, {
        method: 'POST', body: JSON.stringify({ personId: escolhida, autorizacaoRegistrada: autorizada }) });
      setMsg(r.aviso); setEscolhida(''); setAutorizada(false); onMudou();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Não foi possível marcar.'); }
  }
  async function desmarcar() {
    if (!tirando) return;
    setMsg('');
    try {
      const r = await api<{ aviso: string }>(`/people/memory-tags/${tirando.marcaId}/remover`, {
        method: 'POST', body: JSON.stringify({ motivo: motivo.trim() }) });
      setMsg(r.aviso); setTirando(null); setMotivo(''); onMudou();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Não foi possível tirar a marca.'); }
  }

  return (
    <div className="quem-aparece">
      <div className="eyebrow">Quem mais aparece nesta foto</div>
      {marcados.length === 0 && <p className="mutetxt" style={{ margin: 0 }}>Ninguém marcado ainda.</p>}
      <ul className="lista-seca">
        {marcados.map((m) => (
          <li key={m.marcaId} className="row">
            <span className="grow">
              <b>{m.nome}</b>
              <span className="mutetxt">{m.marcadaPor ? ` · marcou ${m.marcadaPor}` : ''}</span>
              {!m.autorizacaoRegistrada && <span className="pill c-warn" style={{ marginLeft: 6 }}>sem autorização de imagem</span>}
            </span>
            {pode && <button type="button" className="btn sm ghost" onClick={() => setTirando(m)}>Tirar a marca</button>}
          </li>
        ))}
      </ul>
      {tirando && (
        <div className="stack">
          <label className="f" htmlFor="tirar-mot">Por que a marca de {tirando.nome} sai</label>
          <input id="tirar-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                 placeholder="Ex.: não é ela na foto" />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn sm sec grow" onClick={() => setTirando(null)}>Cancelar</button>
            <button type="button" className="btn sm grow" disabled={motivo.trim().length < 5} onClick={desmarcar}>Tirar a marca</button>
          </div>
        </div>
      )}
      {pode && casa.length > 0 && (
        <div className="stack">
          <label className="f" htmlFor="marcar-quem">Marcar mais alguém da casa</label>
          <select id="marcar-quem" value={escolhida} onChange={(e) => setEscolhida(e.target.value)}>
            <option value="">Escolha a criança</option>
            {casa.filter((c) => !marcados.some((m) => m.personId === c.id))
              .map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={autorizada} onChange={(e) => setAutorizada(e.target.checked)} />
            <span>A autorização de imagem desta criança está registrada</span>
          </label>
          <button type="button" className="btn sm sec" disabled={!escolhida} onClick={marcar}>Marcar na foto</button>
        </div>
      )}
      {msg && <div className="notice c-info" role="status">{msg}</div>}
    </div>
  );
}

/**
 * OS DOCUMENTOS DE UMA CATEGORIA, FORA DO DOSSIÊ (fase 216, pedido de 14/10).
 *
 * A pasta é a mesma do dossiê: a mesma lista do que a casa precisa ter, a mesma
 * conferência, o mesmo arquivo aberto pelo servidor e registrado. O que muda é
 * ONDE ela aparece: o judicial dentro da área restrita do Judiciário, a saúde
 * junto do que protege a criança. E além da lista, qualquer outro documento da
 * categoria entra avulso, com o título que a equipe der.
 */
export function DocumentosDaCategoria({ personId, categoria, titulo, explicacao, podeAnexar }: {
  personId: string; categoria: string; titulo: string; explicacao?: string; podeAnexar: boolean;
}) {
  const [dossie, setDossie] = useState<Dossie | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [anexando, setAnexando] = useState<ItemDoDossie | null>(null);
  const [abrindo, setAbrindo] = useState<DocumentoDoDossie | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function carregar() {
    try {
      const [d, c] = await Promise.all([
        api<Dossie>(`/people/${personId}/dossie`), api<Catalogo>('/people/dossie/catalogo')]);
      setDossie(d); setCatalogo(c);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir os documentos.'); }
  }
  useEffect(() => { void carregar(); }, [personId]);

  const cat = dossie?.categorias.find((c) => c.code === categoria);
  const avulsos = (dossie?.avulsos ?? []).filter((d) => d.categoria === categoria);
  const avulso: ItemDoDossie = { chave: '', label: 'Outro documento', categoria, titulo: '',
    obrigatorio: false, documentos: [], situacao: 'falta' };

  const linhaDoDocumento = (d: DocumentoDoDossie) => (
    <li key={d.id} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
      <div className="grow">
        <b className="ff">{d.titulo}</b>
        <div className="mutetxt">
          {d.arquivo?.nome ?? 'sem arquivo'} · anexado por {d.anexadoPor} em {dia(String(d.anexadoEm).slice(0, 10))}
          {d.aceitoEm ? ` · conferido por ${d.aceitoPor}` : ' · ainda não conferido'}
        </div>
      </div>
      {d.arquivo && (
        <button className="btn sm sec" onClick={() => setAbrindo(d)} aria-label={`Abrir ${d.titulo}`}>Abrir</button>
      )}
    </li>
  );

  return (
    <section className="documentos-da-categoria" aria-label={titulo}>
      <div className="eyebrow">{titulo}</div>
      {explicacao && <p className="mutetxt" style={{ marginTop: 0 }}>{explicacao}</p>}
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}
      {!dossie && !erro && <p className="mutetxt">Abrindo os documentos…</p>}
      {cat && (
        <ul className="lista">
          {cat.itens.map((i) => (
            <li key={i.chave}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <div className="grow">
                  <b className="ff">{i.label}</b>{i.obrigatorio ? <small className="mutetxt"> · a casa precisa ter</small> : null}
                  {i.ajuda && <div className="mutetxt">{i.ajuda}</div>}
                </div>
                <span className={`pill ${TOM_SITUACAO[i.situacao]}`}>{ROTULO_SITUACAO[i.situacao]}</span>
                {podeAnexar && (
                  <button data-acolhe-abre="" className="btn sm sec" aria-label={`Anexar ${i.label}`}
                          onClick={() => setAnexando(i)}>Anexar</button>
                )}
              </div>
              {i.documentos.length > 0 && <ul className="lista">{i.documentos.map(linhaDoDocumento)}</ul>}
            </li>
          ))}
        </ul>
      )}
      {avulsos.length > 0 && (
        <>
          <div className="mutetxt" style={{ marginTop: 8 }}>Outros documentos</div>
          <ul className="lista">{avulsos.map(linhaDoDocumento)}</ul>
        </>
      )}
      {podeAnexar && dossie && (
        <button data-acolhe-abre="" className="btn sec block" style={{ marginTop: 8 }} onClick={() => setAnexando(avulso)}>
          <Icone nome="anexo" /> Anexar outro documento
        </button>
      )}

      {anexando && catalogo && (
        <FolhaAnexo item={anexando} catalogo={catalogo} onFechar={() => setAnexando(null)}
          onEnviar={async (dados) => {
            setErro(''); setAviso('');
            try {
              await api(`/people/${personId}/documents`, { method: 'POST', body: JSON.stringify(dados) });
              setAnexando(null); setAviso('Documento anexado. Falta alguém conferir.');
              await carregar();
            } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível anexar o documento.'); }
          }} />
      )}
      {abrindo && (
        <FolhaConferencia personId={personId} documento={abrindo} onFechar={() => setAbrindo(null)}
          onTextoGuardado={() => void carregar()}
          onAceitar={async (nota) => {
            setErro('');
            try {
              await api(`/people/${personId}/documents/${abrindo.id}/accept`, { method: 'POST', body: JSON.stringify({ nota }) });
              setAbrindo(null); await carregar();
            } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível conferir o documento.'); }
          }} />
      )}
    </section>
  );
}

/**
 * O LAUDO E A RECEITA DE UM REGISTRO DE SAÚDE (fase 217, pedido de 14/10).
 *
 * A alergia, a condição e a restrição alimentar eram só o que alguém escreveu.
 * O papel do médico entra aqui, na pasta da saúde do dossiê, já dizendo a que
 * registro responde, e aparece junto dele no perfil. Abrir é o mesmo do dossiê:
 * pelo servidor, registrado, com a conferência de quem olhou.
 */
export function AnexosDoRegistroDeSaude({ personId, registro, documentos, podeAnexar, onMudou }: {
  personId: string;
  registro: { qual: 'condicao' | 'restricao'; id: string; nome: string };
  documentos: { id: string; titulo: string; anexadoEm: string; conferido: boolean }[];
  podeAnexar: boolean; onMudou: () => void;
}) {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [anexando, setAnexando] = useState(false);
  const [abrindo, setAbrindo] = useState<DocumentoDoDossie | null>(null);
  const [erro, setErro] = useState('');
  const item: ItemDoDossie = { chave: '', label: `Laudo ou receita · ${registro.nome}`,
    categoria: 'saude', titulo: registro.qual === 'restricao' ? 'Receita médica' : 'Laudo médico',
    obrigatorio: false, documentos: [], situacao: 'falta' };

  useEffect(() => {
    if (anexando && !catalogo) {
      api<Catalogo>('/people/dossie/catalogo').then(setCatalogo)
        .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível abrir o anexo.'));
    }
  }, [anexando, catalogo]);

  async function abrir(id: string) {
    setErro('');
    try {
      const d = await api<Dossie>(`/people/${personId}/dossie`);
      const doc = d.avulsos.find((x) => x.id === id);
      if (doc) setAbrindo(doc); else setErro('Documento não encontrado.');
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir o documento.'); }
  }

  if (!documentos.length && !podeAnexar) return null;
  return (
    <div className="anexos-do-registro">
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {documentos.map((d) => (
        <div key={d.id} className="row" style={{ gap: 8 }}>
          <span className="mutetxt grow">
            <Icone nome="anexo" /> {d.titulo} · {dia(String(d.anexadoEm).slice(0, 10))}
            {d.conferido ? '' : ' · ainda não conferido'}
          </span>
          <button className="btn sm sec" aria-label={`Abrir ${d.titulo} de ${registro.nome}`}
                  onClick={() => void abrir(d.id)}>Abrir</button>
        </div>
      ))}
      {podeAnexar && (
        <button data-acolhe-abre="" className="btn sm ghost" aria-label={`Anexar laudo ou receita de ${registro.nome}`}
                onClick={() => setAnexando(true)}>
          <Icone nome="anexo" /> Anexar laudo ou receita
        </button>
      )}

      {anexando && catalogo && (
        <FolhaAnexo item={item} catalogo={catalogo} onFechar={() => setAnexando(false)}
          onEnviar={async (dados) => {
            setErro('');
            try {
              await api(`/people/${personId}/documents`, {
                method: 'POST',
                body: JSON.stringify({
                  ...dados,
                  ...(registro.qual === 'condicao' ? { condicaoId: registro.id } : { restricaoId: registro.id }),
                }),
              });
              setAnexando(false); onMudou();
            } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível anexar o documento.'); }
          }} />
      )}
      {abrindo && (
        <FolhaConferencia personId={personId} documento={abrindo} onFechar={() => setAbrindo(null)}
          onTextoGuardado={onMudou}
          onAceitar={async (nota) => {
            setErro('');
            try {
              await api(`/people/${personId}/documents/${abrindo.id}/accept`, { method: 'POST', body: JSON.stringify({ nota }) });
              setAbrindo(null); onMudou();
            } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível conferir o documento.'); }
          }} />
      )}
    </div>
  );
}
