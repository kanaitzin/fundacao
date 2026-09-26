import { useEffect, useState } from 'react';
import { api } from '../api';
import { FolhaDocumento, ArquivoGerado } from '../documentos';
import type { DocumentoWord } from '../docx';

/**
 * PORTARIA — quem pode visitar, e quem visitou.
 *
 * Nasceu na fase 92 como a FOLHA em papel para a guarita (pedido do Marcelo em
 * 09/09). Na fase 160, pela decisão de 26/09, a portaria passou a ENTRAR no
 * sistema com login mínimo, e esta tela virou o PORTÃO:
 *
 *  * a lista de quem pode vir, por criança, com o combinado — dia, hora,
 *    validade — e a frase que diz, AGORA, se a pessoa está dentro dele;
 *  * a entrada, com o documento conferido; a saída, com a duração;
 *  * fora do combinado, a portaria vê o porquê e NÃO abre exceção: a exceção é
 *    da coordenação, da técnica ou do líder, com motivo escrito;
 *  * a visita esquecida aberta se CORRIGE, com motivo — nunca se apaga.
 *
 * A folha em papel continua, para quem responde pelo cadastro: é o que o
 * servidor diz em `podeGerarFolha`, e a tela não guarda cópia da lista de
 * cargos (lição da 145).
 *
 * A cor aqui é ESTADO: "dentro do combinado", "fora do combinado", "na casa
 * agora". Nunca diz nada sobre a família.
 */
interface Visitante {
  contatoId: string; nome: string; nomeSocial: string | null; vinculoRotulo: string;
  cpf: string | null; rg: string | null; temFoto: boolean; acolhido: string;
  dias: string | null; de: string | null; ate: string | null;
  validoDe: string | null; validoAte: string | null; observacao: string | null;
  foraDoCombinado: string | null;
  visitaAberta: { id: string; entrouEm: string } | null;
}
interface Portao { podeAbrirExcecao: boolean; podeGerarFolha: boolean; visitantes: Visitante[] }

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', {
  timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const dataBR = (d: string) => d.split('-').reverse().join('/');
/** O instante como o campo `datetime-local` escreve, no relógio da instituição. */
const paraCampo = (iso: string) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(' ', 'T');
/** E de volta: o que a pessoa digitou é a hora de Porto Alegre, não a do aparelho. */
const doCampo = (v: string) => (v ? `${v}:00-03:00` : '');
const erroDe = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);

export function Portaria({ houseId, casaLabel }: { houseId: string; casaLabel: string }) {
  const [portao, setPortao] = useState<Portao | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [entrando, setEntrando] = useState<Visitante | null>(null);
  const [corrigindo, setCorrigindo] = useState<Visitante | null>(null);
  const [foto, setFoto] = useState<{ nome: string; src: string } | null>(null);
  const [volta, setVolta] = useState(0);
  /* A BUSCA: vinte crianças com dois ou três visitantes cada são uma lista de
     dez telas. Quem chega diz um nome — o dele ou o da criança. */
  const [busca, setBusca] = useState('');

  useEffect(() => {
    setErro('');
    api<Portao>(`/people/portaria/hoje?houseId=${houseId}`)
      .then(setPortao)
      .catch((e) => setErro(erroDe(e, 'Não foi possível abrir a lista do portão.')));
  }, [houseId, volta]);

  const recarregar = (msg: string) => { setAviso(msg); setVolta((n) => n + 1); };

  async function sair(v: Visitante) {
    setErro(''); setAviso('');
    try {
      const r = await api<{ aviso: string }>(`/people/portaria/visitas/${v.visitaAberta!.id}/saida`, {
        method: 'POST', body: JSON.stringify({}) });
      recarregar(`${v.nomeSocial || v.nome}: ${r.aviso}`);
    } catch (e) { setErro(erroDe(e, 'Não foi possível registrar a saída.')); }
  }

  async function verFoto(v: Visitante) {
    try {
      const f = await api<{ tipo: string; conteudo: string }>(
        `/people/portaria/visitante/${v.contatoId}/foto`);
      setFoto({ nome: v.nomeSocial || v.nome, src: `data:${f.tipo};base64,${f.conteudo}` });
    } catch (e) { setErro(erroDe(e, 'Não foi possível abrir a foto.')); }
  }

  const lista = portao?.visitantes ?? [];
  const dentro = lista.filter((v) => v.visitaAberta);
  /* Por criança: é o nome que quem chega diz no portão. */
  const sem = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const termo = sem(busca.trim());
  const achados = termo
    ? lista.filter((v) => [v.nome, v.nomeSocial ?? '', v.acolhido].some((t) => sem(t).includes(termo)))
    : lista;
  const porCrianca = new Map<string, Visitante[]>();
  for (const v of achados) porCrianca.set(v.acolhido, [...(porCrianca.get(v.acolhido) ?? []), v]);

  return (
    <>
      <h2 className="ff">Portaria — quem pode visitar</h2>
      <p className="mutetxt">
        {casaLabel}. Confira quem chega pela foto e pelo documento, e registre a entrada e a
        saída. Só está na lista quem a equipe técnica ou a coordenação autorizou, no contato da
        criança. <b>Quem não está aqui não entra sem falar com a casa.</b>
      </p>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      {portao && (
        <>
          <div className="eyebrow">Na casa agora</div>
          {dentro.length === 0
            ? <p className="mutetxt">Nenhum visitante dentro da casa agora.</p>
            : (
              <ul className="stack lista">
                {dentro.map((v) => (
                  <li key={v.contatoId} className="card">
                    <div className="row">
                      <span className="grow">
                        <b>{v.nomeSocial || v.nome}</b>{' '}
                        <span className="mutetxt">({v.vinculoRotulo}) — visita a {v.acolhido}</span>
                      </span>
                      <span className="pill c-info">entrou às {hora(v.visitaAberta!.entrouEm)}</span>
                    </div>
                    <div className="row">
                      <button className="btn grow" onClick={() => sair(v)}>
                        Registrar a saída de {v.nomeSocial || v.nome}
                      </button>
                      {portao.podeAbrirExcecao && (
                        <button className="btn sec sm" onClick={() => setCorrigindo(v)}>
                          Corrigir horário
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

          <div className="eyebrow">Quem pode visitar, por criança</div>
          <label className="f" htmlFor="port-busca">
            Procurar <small>— pelo nome de quem chegou ou da criança</small>
          </label>
          <input id="port-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
                 placeholder="Ex.: Simoni, ou Alice" />
          {termo && achados.length === 0 && lista.length > 0 && (
            <div className="notice c-warn">
              Ninguém com esse nome na lista. <b>Quem não está aqui não entra sem falar com a casa.</b>
            </div>
          )}
          {lista.length === 0 && (
            <p className="mutetxt">Nenhum visitante autorizado nesta casa. Quem chegar, a portaria
              liga para a casa.</p>
          )}
          <ul className="stack lista">
            {[...porCrianca.entries()].map(([crianca, vs]) => (
              <li key={crianca} className="card">
                <b className="ff">{crianca}</b>
                {vs.map((v) => (
                  <div key={v.contatoId} className="stack">
                    <div className="row">
                      <span className="grow">
                        <b>{v.nomeSocial || v.nome}</b>
                        {v.nomeSocial && <span className="mutetxt"> — no documento: {v.nome}</span>}
                        {' '}<span className="mutetxt">({v.vinculoRotulo})</span>
                      </span>
                      {v.visitaAberta
                        ? <span className="pill c-info">na casa</span>
                        : v.foraDoCombinado
                          ? <span className="pill c-warn">fora do combinado</span>
                          : <span className="pill c-ok">pode entrar agora</span>}
                    </div>
                    <div className="mutetxt">
                      {v.dias ? `${v.dias}, das ${v.de} às ${v.ate}` : 'Sem dia combinado'}
                      {v.validoAte && ` · autorizado até ${dataBR(v.validoAte)}`}
                      {v.observacao && ` · ${v.observacao}`}
                    </div>
                    <div className="mutetxt">
                      {v.cpf ? `CPF ${v.cpf}` : 'CPF não cadastrado'}
                      {v.rg && ` · RG ${v.rg}`}
                    </div>
                    {v.foraDoCombinado && !v.visitaAberta && (
                      <div className="mutetxt"><b>{v.foraDoCombinado}</b></div>
                    )}
                    {!v.visitaAberta && (
                      <div className="row">
                        {v.temFoto
                          ? <button className="btn sm ghost" onClick={() => verFoto(v)}>
                              Ver a foto de {v.nomeSocial || v.nome}
                            </button>
                          : <span className="pill c-warn">sem foto — peça documento com foto</span>}
                        <span className="grow" />
                        {(!v.foraDoCombinado || portao.podeAbrirExcecao) && (
                          <button className="btn sm" onClick={() => setEntrando(v)}>
                            {v.foraDoCombinado ? 'Entrada com exceção' : 'Registrar entrada'}
                          </button>
                        )}
                      </div>
                    )}
                    {v.foraDoCombinado && !v.visitaAberta && !portao.podeAbrirExcecao && (
                      <div className="mutetxt">
                        Para entrar fora do combinado, ligue para a casa: a exceção é da
                        coordenação, da equipe técnica ou do líder.
                      </div>
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ul>

          {portao.podeGerarFolha && <FolhaEmPapel houseId={houseId} />}
        </>
      )}

      {entrando && (
        <Entrada v={entrando} onFechar={() => setEntrando(null)}
                 onFeito={(msg) => { setEntrando(null); recarregar(msg); }} />
      )}
      {corrigindo && (
        <Correcao v={corrigindo} onFechar={() => setCorrigindo(null)}
                  onFeito={(msg) => { setCorrigindo(null); recarregar(msg); }} />
      )}
      {foto && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-foto-vis"
             onClick={(e) => { if (e.target === e.currentTarget) setFoto(null); }}>
          <div className="sheet">
            <h3 id="t-foto-vis">{foto.nome}</h3>
            <img src={foto.src} alt={`Foto 3×4 de ${foto.nome}`} style={{ maxWidth: '100%' }} />
            <button className="btn sec block" onClick={() => setFoto(null)}>Fechar</button>
          </div>
        </div>
      )}
    </>
  );
}

/** A entrada: o documento que foi conferido, e — fora do combinado — o motivo. */
function Entrada({ v, onFechar, onFeito }: {
  v: Visitante; onFechar: () => void; onFeito: (msg: string) => void;
}) {
  const [documento, setDocumento] = useState('');
  const [nota, setNota] = useState('');
  const [excecao, setExcecao] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const nome = v.nomeSocial || v.nome;
  const pode = documento.trim().length >= 2 && (!v.foraDoCombinado || excecao.trim().length >= 10);

  async function enviar() {
    setErro(''); setOcupado(true);
    try {
      const r = await api<{ aviso: string }>('/people/portaria/visitas', {
        method: 'POST',
        body: JSON.stringify({ contatoId: v.contatoId, documento: documento.trim(),
          nota: nota.trim() || undefined, excecao: v.foraDoCombinado ? excecao.trim() : undefined }),
      });
      onFeito(`${nome}: ${r.aviso}`);
    } catch (e) { setErro(erroDe(e, 'Não foi possível registrar a entrada.')); }
    finally { setOcupado(false); }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-entrada"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-entrada">Entrada de {nome}</h3>
        <p className="mutetxt">Visita a {v.acolhido}. A hora é a de agora.</p>
        {v.foraDoCombinado && (
          <div className="notice c-warn"><b>Fora do combinado:</b> {v.foraDoCombinado}</div>
        )}

        <label className="f" htmlFor="ent-doc">Documento conferido <small>— qual você olhou</small></label>
        <input id="ent-doc" value={documento} onChange={(e) => setDocumento(e.target.value)}
               placeholder="Ex.: RG, CPF, CNH" />
        <div className="row">
          {['RG', 'CPF', 'CNH'].map((d) => (
            <button key={d} className="btn sm sec" onClick={() => setDocumento(d)}>{d}</button>
          ))}
        </div>

        <label className="f" htmlFor="ent-nota">Observação <small>— opcional</small></label>
        <input id="ent-nota" value={nota} onChange={(e) => setNota(e.target.value)}
               placeholder="Ex.: trouxe um livro para a criança" />

        {v.foraDoCombinado && (
          <>
            <label className="f" htmlFor="ent-exc">
              Por que entra fora do combinado <small>— fica registrado com o seu nome</small>
            </label>
            <textarea id="ent-exc" value={excecao} onChange={(e) => setExcecao(e.target.value)}
                      placeholder="Ex.: visita remarcada por telefone com a equipe técnica." />
          </>
        )}

        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode || ocupado} onClick={enviar}>
            Registrar entrada
          </button>
        </div>
      </div>
    </div>
  );
}

/** A correção: o horário certo e o motivo. O horário anterior fica guardado no servidor. */
function Correcao({ v, onFechar, onFeito }: {
  v: Visitante; onFechar: () => void; onFeito: (msg: string) => void;
}) {
  const [entrada, setEntrada] = useState(paraCampo(v.visitaAberta!.entrouEm));
  const [saida, setSaida] = useState(paraCampo(new Date().toISOString()));
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const nome = v.nomeSocial || v.nome;

  async function enviar() {
    setErro('');
    try {
      const r = await api<{ aviso: string }>(`/people/portaria/visitas/${v.visitaAberta!.id}/correcao`, {
        method: 'POST',
        body: JSON.stringify({ entrada: doCampo(entrada), saida: doCampo(saida), motivo: motivo.trim() }),
      });
      onFeito(`${nome}: ${r.aviso}`);
    } catch (e) { setErro(erroDe(e, 'Não foi possível corrigir a visita.')); }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-corr"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-corr">Corrigir a visita de {nome}</h3>
        <p className="mutetxt">Para a visita que ficou aberta por engano, ou com a hora errada. O
          horário anterior e o motivo ficam no histórico — nada se apaga.</p>
        <label className="f" htmlFor="corr-ent">Entrou</label>
        <input id="corr-ent" type="datetime-local" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
        <label className="f" htmlFor="corr-sai">Saiu</label>
        <input id="corr-sai" type="datetime-local" value={saida} onChange={(e) => setSaida(e.target.value)} />
        <label className="f" htmlFor="corr-mot">Motivo da correção</label>
        <textarea id="corr-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: a saída não foi registrada no portão; confirmado com a educadora." />
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={motivo.trim().length < 10} onClick={enviar}>
            Corrigir
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA EM PAPEL (fase 92) — de quem responde pelo cadastro. Continua valendo
 * para o dia sem sinal: a guarita com a folha impressa não depende da rede.
 */
function FolhaEmPapel({ houseId }: { houseId: string }) {
  const [folha, setFolha] = useState<DocumentoWord | null>(null);
  const [aberta, setAberta] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setErro('');
    api<DocumentoWord>(`/people/portaria/folha?houseId=${houseId}`)
      .then(setFolha)
      .catch((e) => setErro(erroDe(e, 'Não foi possível montar a folha.')));
  }, [houseId]);

  const exportar = (finalidade: string): Promise<ArquivoGerado> =>
    api<ArquivoGerado>('/people/portaria/export', {
      method: 'POST', body: JSON.stringify({ houseId, finalidade }),
    });

  const linhas = folha?.secoes[0]?.tabela?.linhas ?? [];
  /* Agrupa de volta por criança: a folha repete a criança só na primeira linha. */
  const grupos: { crianca: string; visitantes: string[][] }[] = [];
  for (const l of linhas) {
    if (l[1]) grupos.push({ crianca: l[1], visitantes: [] });
    if (grupos.length && l[3] !== 'Nenhum visitante autorizado') grupos[grupos.length - 1].visitantes.push(l);
  }
  const semNinguem = grupos.filter((g) => !g.visitantes.length);

  return (
    <>
      <div className="eyebrow">A folha em papel, para o dia sem sinal</div>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {folha && (
        <>
          <div className="stack">
            {folha.identificacao.map((i) => (
              <div key={i.rotulo} className="row">
                <span className="grow">{i.rotulo}</span><b>{i.valor}</b>
              </div>
            ))}
          </div>

          {semNinguem.length > 0 && (
            <div className="notice c-warn">
              <b>Sem ninguém autorizado a visitar:</b>{' '}
              {semNinguem.map((g) => g.crianca).join(', ')}. Na folha elas aparecem dizendo isso —
              quem chegar por elas, a portaria liga para a casa.
            </div>
          )}

          <button className="btn block" onClick={() => setAberta(true)}>
            Ver a folha da portaria e gerar em Word
          </button>
          {aberta && (
            <FolhaDocumento doc={folha} onFechar={() => setAberta(false)} exportar={exportar} />
          )}
        </>
      )}
    </>
  );
}
