import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * OCORRÊNCIAS (§13).
 *
 * O que esta tela recusa fazer:
 *
 *  * classificar sozinha. A categoria é escolhida por quem estava lá, e o
 *    sistema não opina sobre gravidade, culpa ou risco;
 *  * encerrar sozinha. Nenhuma ocorrência se fecha por decurso de prazo. A
 *    etapa operacional pode terminar; a análise, só com nome e síntese;
 *  * apagar. A síntese entra como registro NOVO, ao lado dos relatos — que
 *    continuam como foram escritos, mesmo quando se contradizem.
 *
 * A cor aqui diz em que ponto do fluxo a ocorrência está. Nunca diz o que
 * alguém fez de errado.
 *
 * ROTAS — 31/08/2026. Chamava `/incidents/categories`, `/incidents/:id/note`,
 * `/incidents/:id/close` e `/incidents/:id/reopen`. Nenhuma existe: o catálogo
 * é `/incidents/catalog`, a nota é uma SÍNTESE (`/:id/synthesis`), e fechar e
 * reabrir são a mesma rota de revisão com decisões opostas
 * (`/:id/review` com `validar` ou `reabrir`). Pior que o 404: `/categories`
 * casava com `GET /incidents/:id` e o servidor tentaria ler "categories" como
 * um id — falha silenciosa, do tipo que só aparece na casa.
 *
 * A lista do servidor é MAGRA de propósito: fato, medidas, fala espontânea e
 * relatos só saem no detalhe, um por vez, com a política decidindo o que
 * devolver. Uma lista que já trouxesse tudo entregaria conteúdo restrito a
 * quem só precisava ver que a ocorrência existe.
 */

interface Categoria {
  code: string; label: string; revisaoTecnica: boolean; restrito: boolean;
}
interface Opcao { cod: string; label: string }
interface TipoAnexo {
  cod: string; label: string; ajuda: string;
  restritoPorPadrao: boolean; exigeJustificativa: boolean;
}
interface Catalogo {
  categorias: Categoria[]; orgaos: Opcao[]; canais: Opcao[];
  tiposAnexo?: TipoAnexo[];
  aviso: string; avisoComunicacao?: string; avisoAnexo?: string;
}

/**
 * COMUNICAÇÃO EXTERNA (§13.6) — quatro etapas, quatro pessoas possíveis.
 *
 * Redigir, revisar, aprovar e ENTREGAR são atos distintos. A entrega é a
 * única que acontece fora do sistema: alguém leva o ofício, manda o e-mail
 * institucional ou entra no sistema do órgão — e volta aqui para registrar
 * que fez. Não existe rota de envio; procurar por ela é a forma mais rápida
 * de conferir a proibição do §2.
 */
interface Comunicacao {
  id: string; orgao: string; destinatarioFuncional: string; canal: string;
  status: string; resumo: string; quando: string | null;
  aprovadaEm: string | null; entregueEm: string | null;
  ocorrenciaId: string | null; responsavel: string | null;
}
const ETAPA: Record<string, { rotulo: string; tom: string; oQueFalta: string }> = {
  rascunho: { rotulo: 'Rascunho', tom: 'c-info',
    oQueFalta: 'Ainda sendo escrita. Envie para revisão quando o teor estiver pronto.' },
  em_revisao: { rotulo: 'Em revisão', tom: 'c-warn',
    oQueFalta: 'Aguardando quem revisa. Quem redigiu não aprova o próprio texto.' },
  aprovado: { rotulo: 'Aprovada', tom: 'c-ok',
    oQueFalta: 'Aprovada e AINDA NÃO ENTREGUE. A entrega é feita por uma pessoa — depois, registre aqui.' },
  entregue_manualmente: { rotulo: 'Entregue', tom: 'c-ok',
    oQueFalta: 'Entrega registrada, com responsável e horário.' },
};

interface ItemLista {
  id: string; categoria: string; codigoCategoria: string; quando: string;
  status: string; nivelAcesso: 'equipe' | 'restrito';
  revisaoTecnicaObrigatoria: boolean; prazo: string | null;
  abertaPor: string; acolhidos: number; anexos: number;
}

interface Detalhe {
  id: string; casaId: string; categoria: string; codigoCategoria: string;
  quando: string; atividade: string | null; fato: string; presentes: string | null;
  medidasImediatas: string | null; saude: boolean; medicamento: boolean;
  contatos: string | null; pendencias: string | null; prazo: string | null;
  status: string; nivelAcesso: string; revisaoTecnicaObrigatoria: boolean;
  acolhidos: { id: string; nome: string; visivel: boolean }[];
  protegido: { falaEspontanea: string | null; sinaisObservados: string | null;
               registradoEm: string } | null;
  avisoProtegido: string | null;
  contencao: Record<string, unknown> | null;
  sinteses: { id: string; texto: string; autor: string; quando: string }[];
  relatos: { modo: string; nota: string;
             relatos: { id: string; autor: string; meu: boolean; testemunho: string;
                        relato: string; restrito: boolean; quando: string }[] };
  avisoAnaliseTecnica: string | null;
  anexos: { id: string; tipo: string; nome: string; restrito: boolean; autor: string }[];
  comunicacoesExternas: { id: string; orgao: string; canal: string; status: string }[];
}

interface Pessoa { id: string; nome: string }
interface OpcaoTestemunho { code: string; label: string; pendente: boolean }

/** Os estados são os do banco (§13.5) — a tela não inventa um fluxo paralelo. */
const SITUACAO: Record<string, { label: string; tom: string }> = {
  aberta: { label: 'Aberta', tom: 'c-warn' },
  em_acompanhamento: { label: 'Em acompanhamento', tom: 'c-warn' },
  encerrada_operacional: { label: 'Etapa operacional encerrada', tom: 'c-info' },
  aguardando_revisao_tecnica: { label: 'Aguardando análise técnica', tom: 'c-med' },
  fechada: { label: 'Fechada após análise', tom: 'c-ok' },
  reaberta: { label: 'Reaberta com histórico', tom: 'c-other' },
};
const TOM_CATEGORIA: Record<string, string> = {
  violencia_ou_suspeita: 'c-crit', conflito_agressao: 'c-warn',
  saida_nao_autorizada: 'c-move', erro_medicamento: 'c-med',
  emergencia_saude: 'c-crit', contencao: 'c-other',
  desorganizacao_relevante: 'c-info', dano_recusa_critica: 'c-info', outro: 'c-mute',
};
/** Etapa operacional já encerrada? Depois dela é que vem a análise. */
const OPERACIONAL_ENCERRADA = ['encerrada_operacional', 'aguardando_revisao_tecnica', 'fechada'];

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR',
  { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

const ANALISA = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

export function Ocorrencias({ houseId, papel }: { houseId: string; papel: string }) {
  const [lista, setLista] = useState<ItemLista[]>([]);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [detalhes, setDetalhes] = useState<Record<string, Detalhe>>({});
  const [testemunhos, setTestemunhos] = useState<OpcaoTestemunho[]>([]);
  const [relatando, setRelatando] = useState<ItemLista | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [abrindo, setAbrindo] = useState(false);
  const [aba, setAba] = useState<'ocorrencias' | 'comunicacoes'>('ocorrencias');
  const [comunicacoes, setComunicacoes] = useState<Comunicacao[]>([]);
  const [comunicando, setComunicando] = useState<ItemLista | 'avulsa' | null>(null);
  const [anexando, setAnexando] = useState<ItemLista | null>(null);
  const [contendo, setContendo] = useState<ItemLista | null>(null);
  const [protegendo, setProtegendo] = useState<ItemLista | null>(null);
  const [abrindoAnexo, setAbrindoAnexo] = useState<{ id: string; nome: string } | null>(null);
  const [anexoAberto, setAnexoAberto] = useState<{ nome: string; referencia: string } | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState<ItemLista | null>(null);

  async function carregar() {
    setErro('');
    try {
      const [o, c, p, t] = await Promise.all([
        api<ItemLista[]>(`/incidents?houseId=${houseId}`),
        api<Catalogo>('/incidents/catalog'),
        api<Pessoa[]>(`/people?houseId=${houseId}`),
        api<OpcaoTestemunho[]>('/statements/options').catch(() => [] as OpcaoTestemunho[]),
      ]);
      setLista(o); setCatalogo(c); setPessoas(p); setTestemunhos(t);
      // Detalhes já abertos são recarregados: o que a tela mostra continua
      // sendo o que o servidor devolve agora, não o que devolveu antes.
      const abertos = Object.keys(detalhes);
      if (abertos.length) {
        const novos: Record<string, Detalhe> = {};
        for (const id of abertos) {
          try { novos[id] = await api<Detalhe>(`/incidents/${id}`); } catch { /* saiu do alcance */ }
        }
        setDetalhes(novos);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as ocorrências.');
    }
  }
  useEffect(() => { carregar(); }, [houseId]);

  /** `recarregar` traz o detalhe de novo depois de escrever nele. */
  async function abrirDetalhe(id: string, recarregar = false) {
    if (!recarregar) {
      if (aberta === id) { setAberta(null); return; }
      setAberta(id);
      if (detalhes[id]) return;
    }
    try {
      const d = await api<Detalhe>(`/incidents/${id}`);
      setDetalhes((m) => ({ ...m, [id]: d }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir a ocorrência.');
    }
  }

  async function carregarComunicacoes() {
    setErro('');
    try { setComunicacoes(await api<Comunicacao[]>(`/incidents/communications?houseId=${houseId}`)); }
    catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as comunicações.');
    }
  }

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try {
      const r = await fn();
      if (r?.aviso) setAviso(r.aviso);
      await carregar();
      if (aba === 'comunicacoes') await carregarComunicacoes();
      return true;
    }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
  }

  const analisa = ANALISA.includes(papel);
  const abertas = lista.filter((o) => o.status !== 'fechada');

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

      <div className="filtros" role="tablist" aria-label="Ocorrências ou comunicações">
        <button role="tab" aria-selected={aba === 'ocorrencias'}
                className={aba === 'ocorrencias' ? 'on' : ''}
                onClick={() => setAba('ocorrencias')}>Ocorrências</button>
        {ANALISA.includes(papel) && (
          <button role="tab" aria-selected={aba === 'comunicacoes'}
                  className={aba === 'comunicacoes' ? 'on' : ''}
                  onClick={() => { setAba('comunicacoes'); carregarComunicacoes(); }}>
            📨 Comunicações externas
          </button>
        )}
      </div>

      {aba === 'ocorrencias' && (
       <>
      <div className="card raise stack">
        <h3 style={{ fontSize: 17, margin: 0 }}>Fato que exige acompanhamento formal</h3>
        <p className="mutetxt" style={{ margin: 0 }}>
          Alguns fatos não cabem na passagem: abrem fluxo próprio, avisam o líder, a
          equipe técnica e a coordenação na hora — e alguns não se encerram sem análise
          de quem responde pelo caso.
        </p>
        <div className="notice c-crit">
          {catalogo?.aviso ?? 'O registro nunca deve atrasar a proteção imediata, o atendimento '
            + 'de saúde ou o protocolo da instituição.'}
        </div>
        <button className="btn block" onClick={() => setAbrindo(true)}>
          🚨 Registrar ocorrência
        </button>
      </div>

      <div className="eyebrow">Em acompanhamento · {abertas.length}</div>
      <div className="stack">
        {lista.map((o) => {
          const s = SITUACAO[o.status] ?? { label: o.status, tom: 'c-mute' };
          const expandida = aberta === o.id;
          const d = detalhes[o.id];
          const operacionalEncerrada = OPERACIONAL_ENCERRADA.includes(o.status);
          return (
            <div className="card stack" key={o.id}>
              <div className="row">
                <span className={`pill ${TOM_CATEGORIA[o.codigoCategoria] ?? 'c-mute'}`}>
                  {o.categoria}
                </span>
                <span className="grow" />
                <span className={`pill ${s.tom}`}>{s.label}</span>
              </div>
              <div className="mutetxt">
                {dia(o.quando)} às {hhmm(o.quando)} · aberta por {o.abertaPor} ·
                {' '}{o.acolhidos} acolhido(s){o.anexos ? ` · ${o.anexos} anexo(s)` : ''}
              </div>
              <div className="row">
                {o.revisaoTecnicaObrigatoria && <span className="pill c-med">Exige análise técnica</span>}
                {o.nivelAcesso === 'restrito' && <span className="pill c-crit">Acesso restrito</span>}
                {o.prazo && <span className="pill c-warn">Pendência até {dia(o.prazo)}</span>}
              </div>

              <button className="btn sm ghost" onClick={() => abrirDetalhe(o.id)}>
                {expandida ? 'Fechar detalhes' : 'Abrir detalhes'}
              </button>

              {expandida && !d && <p className="mutetxt">Abrindo…</p>}
              {expandida && d && (
                <>
                  <div className="mutetxt">
                    Acolhidos: {d.acolhidos.length
                      ? d.acolhidos.map((a) => a.nome).join(', ')
                      : 'não se aplica a uma pessoa'}
                  </div>
                  <div className="bloco"><small>Fato</small>{d.fato}</div>
                  {d.medidasImediatas && (
                    <div className="bloco"><small>Medidas imediatas</small>{d.medidasImediatas}</div>
                  )}

                  {d.protegido
                    ? (d.protegido.falaEspontanea || d.protegido.sinaisObservados) && (
                        <div className="bloco destaque">
                          <small>Registro protegido — restrito</small>
                          {d.protegido.falaEspontanea}
                          {d.protegido.sinaisObservados && (
                            <div className="mutetxt">Sinais observados: {d.protegido.sinaisObservados}</div>
                          )}
                        </div>
                      )
                    : d.avisoProtegido && (
                        <div className="notice c-med">
                          {d.avisoProtegido} <b>Não é filtro de tela</b>: o conteúdo não é devolvido.
                        </div>
                      )}

                  {/*
                    * FALA ESPONTÂNEA E SINAIS OBSERVADOS (§13.2), depois da
                    * abertura.
                    *
                    * A folha de abrir ocorrência já tinha o campo. O que
                    * faltava é o caso mais comum: a criança fala DEPOIS —
                    * três dias depois, às 23h, na hora de dormir. Sem esta
                    * porta, o que ela disse ou ia para o campo "fato", que o
                    * plantão inteiro lê, ou não era registrado em lugar
                    * nenhum.
                    *
                    * O botão não aparece quando o registro já existe (é único
                    * por ocorrência) nem na ocorrência fechada — nos dois
                    * casos o caminho é o relato em nome próprio.
                    */}
                  {!d.protegido && d.status !== 'fechada' && (
                    <button className="btn sec sm" onClick={() => setProtegendo(o)}>
                      🔒 Registrar fala espontânea ou sinais observados
                    </button>
                  )}

                  {d.contencao && (
                    <div className="notice c-warn">
                      Contenção registrada com campos próprios. <b>O sistema não avalia se a
                      medida foi adequada</b> — essa análise é humana e técnica.
                    </div>
                  )}

                  <div className="eyebrow">Relatos</div>
                  <p className="mutetxt" style={{ margin: 0 }}>{d.relatos.nota}</p>
                  {d.relatos.relatos.map((r) => (
                    <div className="bloco compl" key={r.id}>
                      <small>
                        {r.autor}{r.meu ? ' (seu)' : ''} · {r.testemunho} · {hhmm(r.quando)}
                        {/* A mesma palavra da caixa que a pessoa marcou ao
                            escrever: "restrito" sozinho não diz por quê. */}
                        {r.restrito ? ' · narrativa pessoal' : ''}
                      </small>{r.relato}
                    </div>
                  ))}
                  {d.relatos.relatos.length === 0 && (
                    <p className="mutetxt" style={{ margin: 0 }}>Nenhum relato escrito ainda.</p>
                  )}
                  {/*
                    * RELATO INDEPENDENTE (§12.2). Cada pessoa escreve o que
                    * viu, do jeito dela, e a versão de cada um fica. Não é um
                    * campo de "observações" da ocorrência: é o relato DELA,
                    * com o grau de participação declarado — presenciei
                    * integralmente, presenciei em parte, soube depois,
                    * intervim. Num caso de proteção, a diferença entre essas
                    * frases é o dado.
                    */}
                  {d.status !== 'fechada' && (
                    <button className="btn sec sm" onClick={() => setRelatando(o)}>
                      ✍️ Escrever o meu relato
                    </button>
                  )}

                  <div className="eyebrow">Sínteses técnicas</div>
                  {d.avisoAnaliseTecnica && (
                    <p className="mutetxt" style={{ margin: 0 }}>{d.avisoAnaliseTecnica}</p>
                  )}
                  {!d.avisoAnaliseTecnica && d.sinteses.length === 0 && (
                    <p className="mutetxt" style={{ margin: 0 }}>Nada registrado ainda.</p>
                  )}
                  {d.sinteses.map((a) => (
                    <div className="bloco compl" key={a.id}>
                      <small>{a.autor} · {hhmm(a.quando)}</small>{a.texto}
                    </div>
                  ))}

                  {/*
                    * ANEXOS (§13.7).
                    *
                    * O sistema não guarda o arquivo — guarda a REFERÊNCIA dele
                    * no Drive da instituição, o nome neutro e quem pode abrir.
                    * É o desenho que existe porque o educador não tem acesso
                    * direto às pastas (§2): sem esta porta, a foto do machucado
                    * sai da casa por celular, que é o que se está tentando
                    * evitar.
                    *
                    * Anexo restrito APARECE para todos — some seria pior, cria
                    * a impressão de que não existe — e abrir exige dizer para
                    * quê, com o nome de quem abriu no registro.
                    */}
                  <div className="eyebrow">Anexos</div>
                  {d.anexos.length === 0 && (
                    <p className="mutetxt" style={{ margin: 0 }}>Nenhum anexo registrado.</p>
                  )}
                  {d.anexos.map((a) => {
                    const tipo = catalogo?.tiposAnexo?.find((t) => t.cod === a.tipo);
                    return (
                      <div className="row" key={a.id}>
                        <div className="grow">
                          <b className="ff">{a.nome}</b>
                          <div className="mutetxt">
                            {tipo?.label ?? a.tipo} · registrado por {a.autor}
                          </div>
                        </div>
                        {a.restrito && <span className="pill c-warn">Restrito</span>}
                        <button className="btn sm ghost"
                                onClick={() => (a.restrito
                                  ? setAbrindoAnexo({ id: a.id, nome: a.nome })
                                  : acao(async () => {
                                      const r = await api<{ nome: string; referencia: string }>(
                                        `/incidents/attachments/${a.id}/open`,
                                        { method: 'POST', body: '{}' });
                                      setAnexoAberto(r);
                                      return r;
                                    }))}>
                          Abrir
                        </button>
                      </div>
                    );
                  })}
                  {d.status !== 'fechada' && (
                    <button className="btn sec sm" onClick={() => setAnexando(o)}>
                      📎 Registrar anexo
                    </button>
                  )}

                  {/*
                    * CONTENÇÃO (§13.3).
                    *
                    * Cinco campos obrigatórios, e o sistema NÃO avalia se a
                    * medida foi adequada — essa análise é humana e técnica. O
                    * que o registro garante é que ela possa ser analisada:
                    * o que veio antes, o que se tentou antes, quem estava, o
                    * método e o que se fez depois.
                    */}
                  {(d.contencao || d.codigoCategoria === 'contencao') && (
                    <>
                      <div className="eyebrow">Contenção</div>
                      {d.contencao ? (
                        <div className="notice c-info">
                          Contenção registrada nesta ocorrência, com antecedentes, tentativas
                          anteriores, método e o que foi feito depois. O sistema não avalia se a
                          medida foi adequada — a análise é da equipe técnica.
                        </div>
                      ) : (
                        <>
                          <p className="mutetxt" style={{ margin: 0 }}>
                            Esta ocorrência é de contenção e ainda não tem o registro próprio,
                            que o §13.3 exige.
                          </p>
                          {d.status !== 'fechada' && (
                            <button className="btn sec sm" onClick={() => setContendo(o)}>
                              ✋ Registrar a contenção
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {analisa && (
                    <>
                      <div className="eyebrow">Comunicação externa</div>
                      {d.comunicacoesExternas.length > 0 ? (
                        d.comunicacoesExternas.map((c) => (
                          <div className="row" key={c.id}>
                            <span className="grow">
                              {catalogo?.orgaos.find((o) => o.cod === c.orgao)?.label ?? c.orgao}
                            </span>
                            <span className={`pill ${ETAPA[c.status]?.tom ?? 'c-mute'}`}>
                              {ETAPA[c.status]?.rotulo ?? c.status}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="mutetxt" style={{ margin: 0 }}>
                          Nada comunicado para fora sobre esta ocorrência.
                        </p>
                      )}
                      <button className="btn sec sm" onClick={() => setComunicando(o)}>
                        📨 Comunicar a um órgão externo
                      </button>
                    </>
                  )}

                  {d.status !== 'fechada' && analisa && (
                    <Sintese onEnviar={(texto) => acao(() =>
                      api(`/incidents/${o.id}/synthesis`, {
                        method: 'POST', body: JSON.stringify({ texto }) }))} />
                  )}

                  <div className="row">
                    {!operacionalEncerrada && (
                      <button className="btn sm ghost" onClick={() => acao(() =>
                        api(`/incidents/${o.id}/operational-close`, { method: 'POST', body: '{}' }))}>
                        Encerrar etapa operacional
                      </button>
                    )}
                    {operacionalEncerrada && d.status !== 'fechada' && analisa && (
                      <button className="btn sm" onClick={() => setEncerrando(o)}>
                        Analisar e fechar
                      </button>
                    )}
                    {d.status === 'fechada' && analisa && (
                      <button className="btn sm ghost" onClick={() => {
                        const motivo = prompt('Por que reabrir? Fica registrado com o seu nome:') ?? '';
                        if (motivo.trim().length >= 5) {
                          acao(() => api(`/incidents/${o.id}/review`, {
                            method: 'POST',
                            body: JSON.stringify({ decisao: 'reabrir', nota: motivo }) }));
                        }
                      }}>Reabrir com histórico</button>
                    )}
                  </div>
                  {d.status !== 'fechada' && !analisa && (
                    <p className="mutetxt" style={{ margin: 0 }}>
                      {operacionalEncerrada
                        ? 'A etapa operacional já foi encerrada. A análise é da equipe técnica ou '
                          + 'da coordenação — e é ela que fecha a ocorrência.'
                        : 'Você encerra a etapa operacional. A análise é da equipe técnica ou da '
                          + 'coordenação — e é ela que fecha a ocorrência.'}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
        {lista.length === 0 && (
          <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
            Nenhuma ocorrência registrada nesta casa.</p></div>
        )}
      </div>

      <p className="mutetxt" style={{ marginTop: 12 }}>
        Nenhuma ocorrência se encerra sozinha, nem por tempo. O que foi escrito por
        alguém continua como aquela pessoa escreveu; a síntese entra ao lado, com autor
        e horário.
      </p>
       </>
      )}

      {/*
        * COMUNICAÇÕES EXTERNAS (§13.6).
        *
        * Quatro etapas e nenhum envio. Redigir, revisar, aprovar e ENTREGAR são
        * atos distintos, e a entrega é a única que acontece fora do sistema:
        * alguém leva o ofício ou manda o e-mail institucional e volta aqui para
        * registrar que fez, com o horário e o nome.
        *
        * A tela mostra em que etapa cada comunicação está e O QUE FALTA — sem
        * isso, "aprovado" parece "pronto", e uma comunicação ao Conselho
        * Tutelar aprovada e nunca entregue passa por entregue.
        */}
      {aba === 'comunicacoes' && (
        <>
          <div className="card raise stack">
            <h3 style={{ fontSize: 17, margin: 0 }}>Comunicações a órgãos externos</h3>
            <div className="notice c-crit">
              {catalogo?.avisoComunicacao
                ?? 'O sistema NÃO envia nada para fora. Ele registra o que foi redigido, quem '
                 + 'revisou, quem aprovou e quem entregou — a entrega é sempre de uma pessoa.'}
            </div>
            <button className="btn block" onClick={() => setComunicando('avulsa')}>
              📨 Registrar comunicação externa
            </button>
          </div>

          <div className="stack" style={{ marginTop: 12 }}>
            {comunicacoes.map((c) => {
              const etapa = ETAPA[c.status] ?? { rotulo: c.status, tom: 'c-mute', oQueFalta: '' };
              const orgao = catalogo?.orgaos.find((o) => o.cod === c.orgao)?.label ?? c.orgao;
              const canal = catalogo?.canais.find((x) => x.cod === c.canal)?.label ?? c.canal;
              return (
                <div className="card stack" key={c.id}>
                  <div className="row">
                    <b className="ff grow">{orgao}</b>
                    <span className={`pill ${etapa.tom}`}>{etapa.rotulo}</span>
                  </div>
                  <div className="mutetxt">
                    {c.destinatarioFuncional} · {canal}
                    {c.responsavel && ` · redigida por ${c.responsavel}`}
                    {c.entregueEm && ` · entregue em ${dia(c.entregueEm)} às ${hhmm(c.entregueEm)}`}
                  </div>
                  <div className="bloco"><small>Teor</small>{c.resumo}</div>
                  <div className={`notice ${c.status === 'aprovado' ? 'c-warn' : 'c-info'}`}>
                    {etapa.oQueFalta}
                  </div>

                  <div className="row">
                    {c.status === 'rascunho' && (
                      <button className="btn sm sec" onClick={() => acao(() =>
                        api(`/incidents/communications/${c.id}/submit`,
                            { method: 'POST', body: '{}' }))}>
                        Enviar para revisão
                      </button>
                    )}
                    {(c.status === 'rascunho' || c.status === 'em_revisao') && (
                      <button className="btn sm" onClick={() => acao(() =>
                        api(`/incidents/communications/${c.id}/approve`,
                            { method: 'POST', body: '{}' }))}>
                        Aprovar
                      </button>
                    )}
                    {c.status === 'aprovado' && (
                      <button className="btn sm" onClick={() => acao(() =>
                        api(`/incidents/communications/${c.id}/delivery`, {
                          method: 'POST',
                          body: JSON.stringify({
                            quando: new Date().toISOString(),
                            nota: 'Entrega registrada pela tela.',
                          }) }))}>
                        Registrar que foi entregue
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {comunicacoes.length === 0 && (
              <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
                Nenhuma comunicação externa registrada nesta casa. Comunicar não é o mesmo
                que registrar a ocorrência: aqui fica o que a instituição escreveu PARA FORA,
                com quem aprovou e quem entregou.</p></div>
            )}
          </div>

          <p className="mutetxt" style={{ marginTop: 12 }}>
            <b>Quem redige não aprova.</b> Uma comunicação ao Conselho Tutelar ou ao
            Judiciário aprovada pelo próprio autor não passou por revisão nenhuma — e o
            servidor recusa antes de a tela opinar.
          </p>
        </>
      )}

      {abrindo && catalogo && (
        <FolhaNova categorias={catalogo.categorias} pessoas={pessoas}
                   onFechar={() => setAbrindo(false)}
                   onAbrir={async (corpo) => {
                     const ok = await acao(() => api('/incidents', {
                       method: 'POST', body: JSON.stringify({ houseId, ...corpo }) }));
                     if (ok) setAbrindo(false);
                   }} />
      )}

      {relatando && (
        <FolhaRelato
          opcoes={testemunhos}
          onFechar={() => setRelatando(null)}
          onEnviar={async (corpo) => {
            const ok = await acao(() => api('/statements', {
              method: 'POST',
              body: JSON.stringify({
                houseId, context: 'ocorrencia',
                entity: 'incident', entityId: relatando.id, ...corpo,
              }),
            }));
            if (ok) setRelatando(null);
          }} />
      )}

      {anexando && catalogo && (
        <FolhaAnexo
          tipos={catalogo.tiposAnexo ?? []} aviso={catalogo.avisoAnexo ?? ''}
          onFechar={() => setAnexando(null)}
          onEnviar={async (corpo) => {
            const ok = await acao(() => api(`/incidents/${anexando.id}/attachments`, {
              method: 'POST', body: JSON.stringify(corpo) }));
            if (ok) setAnexando(null);
          }} />
      )}

      {contendo && (
        <FolhaContencao
          onFechar={() => setContendo(null)}
          onEnviar={async (corpo) => {
            const ok = await acao(() => api(`/incidents/${contendo.id}/restraint`, {
              method: 'POST', body: JSON.stringify(corpo) }));
            if (ok) setContendo(null);
          }} />
      )}

      {protegendo && (
        <FolhaProtegido
          onFechar={() => setProtegendo(null)}
          onEnviar={async (corpo) => {
            const ok = await acao(() => api(`/incidents/${protegendo.id}/protected`, {
              method: 'POST', body: JSON.stringify(corpo) }));
            if (ok) { await abrirDetalhe(protegendo.id, true); setProtegendo(null); }
          }} />
      )}

      {abrindoAnexo && (
        <FolhaFinalidade
          nome={abrindoAnexo.nome}
          onFechar={() => setAbrindoAnexo(null)}
          onAbrir={async (finalidade) => {
            const ok = await acao(async () => {
              const r = await api<{ nome: string; referencia: string; aviso?: string }>(
                `/incidents/attachments/${abrindoAnexo.id}/open`,
                { method: 'POST', body: JSON.stringify({ finalidade }) });
              setAnexoAberto(r);
              return r;
            });
            if (ok) setAbrindoAnexo(null);
          }} />
      )}

      {anexoAberto && (
        <div className="overlay" role="dialog" aria-modal="true"
             onClick={(e) => { if (e.target === e.currentTarget) setAnexoAberto(null); }}>
          <div className="sheet modal">
            <h3>{anexoAberto.nome}</h3>
            {/* O sistema não abre o arquivo: ele diz ONDE ele está, no Drive
                da instituição, e registra que você perguntou. */}
            <div className="notice c-info">
              A abertura foi registrada com o seu nome e o horário. O arquivo está no Drive
              da instituição, no caminho abaixo.
            </div>
            <div className="bloco"><small>Onde está</small>{anexoAberto.referencia}</div>
            <div className="row rodape">
              <button className="btn block" onClick={() => setAnexoAberto(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {comunicando && catalogo && (
        <FolhaComunicacao
          orgaos={catalogo.orgaos} canais={catalogo.canais}
          aviso={catalogo.avisoComunicacao ?? ''}
          ocorrencia={comunicando === 'avulsa' ? null : comunicando}
          onFechar={() => setComunicando(null)}
          onEnviar={async (corpo) => {
            const ok = await acao(() => api('/incidents/communications', {
              method: 'POST',
              body: JSON.stringify({
                houseId,
                incidentId: comunicando === 'avulsa' ? undefined : comunicando.id,
                ...corpo,
              }),
            }));
            if (ok) { setComunicando(null); setAba('comunicacoes'); await carregarComunicacoes(); }
          }} />
      )}

      {encerrando && (
        <FolhaEncerrar
          ocorrencia={encerrando}
          jaTemSintese={(detalhes[encerrando.id]?.sinteses.length ?? 0) > 0}
          onFechar={() => setEncerrando(null)}
          onEncerrar={async (sintese) => {
            // Duas coisas, na ordem em que o servidor as exige: a síntese é um
            // registro novo e assinado; o fechamento é a decisão que vem depois
            // dela. Fechar caso grave sem síntese é fechar sem ninguém escrever
            // a que se chegou — e o banco recusa.
            const ok = await acao(async () => {
              if (sintese.trim().length >= 20) {
                await api(`/incidents/${encerrando.id}/synthesis`, {
                  method: 'POST', body: JSON.stringify({ texto: sintese }) });
              }
              return api(`/incidents/${encerrando.id}/review`, {
                method: 'POST', body: JSON.stringify({ decisao: 'validar' }) });
            });
            if (ok) setEncerrando(null);
          }} />
      )}
    </>
  );
}

function Sintese({ onEnviar }: { onEnviar: (texto: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState('');
  return (
    <>
      <label className="f" htmlFor="nota-oco">
        Registrar síntese técnica <small>— entra ao lado, sem reescrever nada</small>
      </label>
      <textarea id="nota-oco" value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="Ex.: conversado com a equipe técnica; retorno marcado para amanhã." />
      <button className="btn sec sm" disabled={texto.trim().length < 20}
              onClick={async () => { if (await onEnviar(texto)) setTexto(''); }}>
        Registrar
      </button>
    </>
  );
}

function FolhaNova({ categorias, pessoas, onFechar, onAbrir }: {
  categorias: Categoria[]; pessoas: Pessoa[]; onFechar: () => void;
  onAbrir: (corpo: Record<string, unknown>) => void;
}) {
  const [categoria, setCategoria] = useState('');
  const [personId, setPersonId] = useState('');
  const [fato, setFato] = useState('');
  const [medidas, setMedidas] = useState('');
  const [fala, setFala] = useState('');
  const cat = categorias.find((c) => c.code === categoria);
  // O servidor exige o fato com 15 caracteres e a data-hora. A tela cobra antes
  // de enviar, com a mesma régua — recusa na cara da pessoa é pior que aviso.
  const pode = !!categoria && fato.trim().length >= 15;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-oco"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-oco">Registrar ocorrência</h3>
        <div className="notice c-crit">
          Proteção primeiro. Este formulário existe para o depois — e aceita o mínimo,
          para não roubar tempo do que importa agora.
        </div>

        <label className="f">Categoria</label>
        <div className="opts">
          {categorias.map((c) => (
            <button type="button" key={c.code} className={`opt ${TOM_CATEGORIA[c.code] ?? 'c-mute'}`}
                    aria-pressed={categoria === c.code}
                    onClick={() => setCategoria(c.code)}>{c.label}</button>
          ))}
        </div>
        {cat && (
          <div className="row" style={{ marginTop: 8 }}>
            <span className={`pill ${cat.revisaoTecnica ? 'c-med' : 'c-info'}`}>
              {cat.revisaoTecnica ? 'Exige análise técnica' : 'Encerramento pela coordenação do caso'}
            </span>
            {cat.restrito && <span className="pill c-crit">Nasce restrita</span>}
          </div>
        )}

        <label className="f" htmlFor="oc-pessoa">Acolhido envolvido</label>
        <select id="oc-pessoa" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Casa toda / não se aplica a uma pessoa</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        <label className="f" htmlFor="oc-fato">
          Fato objetivo <small>— o que aconteceu, sem interpretação</small>
        </label>
        <textarea id="oc-fato" value={fato} onChange={(e) => setFato(e.target.value)}
                  placeholder="Descreva o fato, o horário e o que foi feito imediatamente." />

        <label className="f" htmlFor="oc-med">Medidas imediatas</label>
        <textarea id="oc-med" value={medidas} onChange={(e) => setMedidas(e.target.value)}
                  placeholder="O que foi feito para proteger e atender." />

        {cat?.restrito && (
          <>
            <label className="f" htmlFor="oc-fala">
              Fala espontânea do acolhido <small>— transcrição, sem interpretação</small>
            </label>
            <div className="notice c-med">
              Este campo <b>não aparece</b> para colegas de plantão. Abrem: você, a equipe
              técnica e a coordenação.
            </div>
            <textarea id="oc-fala" value={fala} onChange={(e) => setFala(e.target.value)}
                      placeholder="Transcreva o que foi dito, entre aspas." />
          </>
        )}

        {categoria === 'contencao' && (
          <div className="notice c-warn">
            A contenção pede campos próprios: antecedentes, local, presentes, tentativas
            anteriores, método, duração, possível lesão e avaliação de saúde.
            <b> O sistema não avalia se a medida foi adequada</b> — essa análise é humana.
          </div>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onAbrir({
                    categoria,
                    // O servidor guarda a hora do FATO, não a do registro.
                    quando: new Date().toISOString(),
                    acolhidos: personId ? [personId] : [],
                    fato, medidasImediatas: medidas,
                    falaEspontanea: fala || undefined,
                  })}>
            Abrir ocorrência e avisar
          </button>
        </div>
      </div>
    </div>
  );
}

function FolhaEncerrar({ ocorrencia, jaTemSintese, onFechar, onEncerrar }: {
  ocorrencia: ItemLista; jaTemSintese: boolean;
  onFechar: () => void; onEncerrar: (sintese: string) => void;
}) {
  const [sintese, setSintese] = useState('');
  const pode = jaTemSintese || sintese.trim().length >= 20;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-enc"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-enc">Analisar e fechar</h3>
        <p className="mutetxt">{ocorrencia.categoria} · {dia(ocorrencia.quando)}</p>
        <div className="notice c-info">
          A síntese é um registro <b>novo</b>. Ela não apaga nem corrige nenhum relato:
          os originais continuam legíveis como foram escritos.
        </div>
        <label className="f" htmlFor="sintese">
          Síntese <small>— a que se chegou e o que fica combinado{jaTemSintese
            ? '; já existe uma registrada, esta entra ao lado' : ''}</small>
        </label>
        <textarea id="sintese" value={sintese} onChange={(e) => setSintese(e.target.value)}
                  placeholder="Ex.: conversado com o acolhido e com a escola; combinada a rotina de saída." />
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onEncerrar(sintese)}>
            Fechar com a minha assinatura
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * O RELATO INDEPENDENTE (§12.2).
 *
 * Duas coisas que esta folha protege:
 *
 *  * **cada um escreve o seu.** Ninguém edita o relato de ninguém, e relatos
 *    que se contradizem continuam os dois. Corrigir é escrever outro, ao lado;
 *  * **o grau de participação é declarado, não deduzido.** "Presenciei
 *    integralmente" e "soube depois" não são a mesma frase, e num caso de
 *    proteção a diferença entre elas é o dado. Por isso a lista vem do
 *    servidor: a tela não inventa opção nem junta duas numa só.
 *
 * "Sem informação adicional" é resposta legítima e dispensa texto — quem foi
 * chamado a relatar e não tem o que dizer precisa poder dizer isso.
 */
/**
 * A FOLHA DA COMUNICAÇÃO EXTERNA (§13.6).
 *
 * Três coisas que ela protege:
 *
 *  * **o destinatário é FUNCIONAL, não pessoal.** "Conselheira Marta" muda de
 *    emprego; "Conselho Tutelar — Regional Centro" continua sendo quem
 *    responde. Guardar o nome de uma pessoa de fora num registro que fala de
 *    uma criança é dado pessoal sem necessidade;
 *  * **o canal é o que uma PESSOA fez**, e não o que o sistema fez. "E-mail
 *    institucional" aqui significa "alguém mandou e anotou". Não existe rota
 *    de envio, e a folha diz isso antes de escrever a primeira letra;
 *  * **o teor é escrito à mão.** Nenhum texto é gerado a partir da ocorrência:
 *    quem comunica a um órgão externo assina o que escreveu.
 */
/**
 * A FOLHA DO ANEXO (§13.7).
 *
 * O sistema não recebe o arquivo. Ele registra ONDE ele está, com que nome
 * neutro, de que tipo, e quem pode abrir. Três recusas moram aqui:
 *
 *  * **nome de arquivo não leva CPF, diagnóstico nem conteúdo judicial**
 *    (§3.3). O servidor recusa por expressão regular; a tela avisa antes, para
 *    a recusa não chegar depois de digitar;
 *  * **foto exige justificativa escrita** — para que ela é necessária e qual
 *    autorização a ampara. Uma foto de criança sem isso é o tipo de registro
 *    que ninguém consegue explicar depois;
 *  * **restrito é o padrão do tipo**, e não uma caixinha esquecida: foto,
 *    documento médico e documento técnico nascem fechados.
 */
function FolhaAnexo({ tipos, aviso, onFechar, onEnviar }: {
  tipos: TipoAnexo[]; aviso: string;
  onFechar: () => void; onEnviar: (corpo: Record<string, unknown>) => void;
}) {
  const [tipo, setTipo] = useState('');
  const [nome, setNome] = useState('');
  const [referencia, setReferencia] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const escolhido = tipos.find((t) => t.cod === tipo);
  // A mesma checagem do servidor, para o aviso chegar antes da recusa.
  const nomeSuspeito = /\d{11}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}|hiv|aids|autis|esquizo|depress|transtorn|psiquiatr|cid[\s-]?\d/i
    .test(nome);
  const pode = tipo !== '' && nome.trim().length >= 3 && !nomeSuspeito
    && referencia.trim().length >= 3
    && (!escolhido?.exigeJustificativa || justificativa.trim().length >= 15);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-anx"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-anx">Registrar anexo</h3>
        <div className="notice c-info">{aviso}</div>

        <label className="f">Tipo</label>
        <div className="opts">
          {tipos.map((t) => (
            <button type="button" key={t.cod} className={`opt ${t.restritoPorPadrao ? 'c-warn' : 'c-info'}`}
                    aria-pressed={tipo === t.cod} onClick={() => setTipo(t.cod)}>
              {t.label}
            </button>
          ))}
        </div>
        {escolhido && <p className="mutetxt">{escolhido.ajuda}</p>}

        <label className="f" htmlFor="anx-nome">
          Nome de exibição <small>— neutro: sem CPF, diagnóstico ou processo</small>
        </label>
        <input id="anx-nome" className="field" value={nome}
               onChange={(e) => setNome(e.target.value)}
               placeholder="Ex.: receita da consulta de 31-08" />
        {nomeSuspeito && (
          <div className="notice c-crit">
            Este nome parece conter CPF, diagnóstico ou referência judicial. Use um nome
            neutro — o conteúdo fica protegido dentro do anexo, e o nome circula em lista,
            em pasta e em notificação.
          </div>
        )}

        <label className="f" htmlFor="anx-ref">
          Onde o arquivo está <small>— a pasta ou o link no Drive da instituição</small>
        </label>
        <input id="anx-ref" className="field" value={referencia}
               onChange={(e) => setReferencia(e.target.value)}
               placeholder="Ex.: ACOLHIMENTO/AI3/2026/08/saude/receita-3108.pdf" />

        {escolhido?.exigeJustificativa && (
          <>
            <label className="f" htmlFor="anx-just">
              Por que a foto é necessária <small>— e qual autorização a ampara</small>
            </label>
            <textarea id="anx-just" value={justificativa}
                      onChange={(e) => setJustificativa(e.target.value)}
                      placeholder="Ex.: registro da lesão pedido pela Enfermagem para a consulta de amanhã; autorização da coordenação em 31/08." />
          </>
        )}

        {escolhido?.restritoPorPadrao && (
          <p className="mutetxt">
            Este tipo nasce <b>restrito</b>: a equipe vê que o anexo existe, e abri-lo cabe
            à equipe técnica e à coordenação, com finalidade declarada.
          </p>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onEnviar({
                    tipo, nome: nome.trim(), referencia: referencia.trim(),
                    justificativa: justificativa.trim() || undefined,
                  })}>
            Registrar anexo
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ABRIR UM ANEXO RESTRITO — a finalidade é a condição, não um formulário.
 *
 * Não existe abertura sem dizer para quê. O texto escrito aqui vai para a
 * auditoria junto com o nome de quem abriu: é o que permite, depois, perguntar
 * por que alguém abriu a foto de uma criança numa terça-feira à tarde.
 */
function FolhaFinalidade({ nome, onFechar, onAbrir }: {
  nome: string; onFechar: () => void; onAbrir: (finalidade: string) => void;
}) {
  const [finalidade, setFinalidade] = useState('');
  const pode = finalidade.trim().length >= 15;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-fin"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-fin">Abrir “{nome}”</h3>
        <div className="notice c-warn">
          Anexo restrito. A abertura fica registrada com o seu nome, o horário e a
          finalidade que você escrever.
        </div>
        <label className="f" htmlFor="fin-txt">
          Para que você precisa abrir <small>— pelo menos 15 caracteres</small>
        </label>
        <textarea id="fin-txt" value={finalidade}
                  onChange={(e) => setFinalidade(e.target.value)}
                  placeholder="Ex.: conferir a receita antes da consulta de retorno de amanhã." />
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onAbrir(finalidade.trim())}>
            Abrir com esta finalidade
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DA CONTENÇÃO (§13.3).
 *
 * Cinco campos obrigatórios, e nenhum deles opina. O sistema NÃO avalia se a
 * contenção foi adequada — essa análise é humana e técnica, e um sistema que
 * a fizesse estaria julgando conduta por formulário. O que estes campos
 * garantem é que a análise SEJA POSSÍVEL: o que veio antes, o que já se tentou
 * antes de conter, quem estava presente, o método e o que se fez depois.
 */
function FolhaContencao({ onFechar, onEnviar }: {
  onFechar: () => void; onEnviar: (corpo: Record<string, unknown>) => void;
}) {
  const [c, setC] = useState<Record<string, string>>({});
  const põe = (k: string) => (e: { target: { value: string } }) =>
    setC((m) => ({ ...m, [k]: e.target.value }));
  const CAMPOS: { chave: string; rotulo: string; ajuda: string; obrigatorio: boolean }[] = [
    { chave: 'antecedentes', rotulo: 'O que aconteceu antes', obrigatorio: true,
      ajuda: 'Os fatos que antecederam, na ordem em que aconteceram.' },
    { chave: 'tentativasAnteriores', rotulo: 'O que foi tentado antes', obrigatorio: true,
      ajuda: 'Conversa, afastamento, mudança de ambiente — o que se tentou antes de conter.' },
    { chave: 'local', rotulo: 'Local', obrigatorio: true, ajuda: 'Onde aconteceu.' },
    { chave: 'presentes', rotulo: 'Quem estava presente', obrigatorio: true,
      ajuda: 'Profissionais presentes. Nomes de acolhidos ficam na ocorrência, não aqui.' },
    { chave: 'metodo', rotulo: 'Método utilizado', obrigatorio: true,
      ajuda: 'Descreva objetivamente o que foi feito.' },
    { chave: 'duracaoMinutos', rotulo: 'Duração, em minutos', obrigatorio: false, ajuda: '' },
    { chave: 'possivelLesao', rotulo: 'Possível lesão', obrigatorio: false,
      ajuda: 'O que foi observado, sem diagnóstico.' },
    { chave: 'avaliacaoSaude', rotulo: 'Avaliação de saúde', obrigatorio: false,
      ajuda: 'A Enfermagem foi acionada? Houve atendimento?' },
    { chave: 'acaoPosterior', rotulo: 'O que foi feito depois', obrigatorio: false,
      ajuda: 'Acolhimento, conversa, comunicação à equipe técnica.' },
  ];
  const pode = CAMPOS.filter((x) => x.obrigatorio).every((x) => (c[x.chave] ?? '').trim());

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-cont"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-cont">Registrar a contenção</h3>
        <div className="notice c-warn">
          O sistema <b>não avalia</b> se a contenção foi adequada — essa análise é da equipe
          técnica. O registro existe para que ela seja possível.
        </div>

        {CAMPOS.map((x) => (
          <div key={x.chave}>
            <label className="f" htmlFor={`ct-${x.chave}`}>
              {x.rotulo}{x.obrigatorio ? '' : ' (opcional)'}
              {x.ajuda && <small> — {x.ajuda}</small>}
            </label>
            {x.chave === 'duracaoMinutos' ? (
              <input id={`ct-${x.chave}`} className="field" type="number" min="0"
                     value={c[x.chave] ?? ''} onChange={põe(x.chave)} />
            ) : (
              <textarea id={`ct-${x.chave}`} value={c[x.chave] ?? ''} onChange={põe(x.chave)} />
            )}
          </div>
        ))}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onEnviar({
                    ...c,
                    duracaoMinutos: c.duracaoMinutos ? Number(c.duracaoMinutos) : undefined,
                  })}>
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * REGISTRAR FALA ESPONTÂNEA E SINAIS OBSERVADOS (§13.2).
 *
 * É a folha mais delicada do sistema, e ela pede DUAS coisas difíceis de quem
 * está cansada às 23h:
 *
 *  * transcrever, não interpretar. "Ele disse que o tio bateu" é a leitura de
 *    quem ouviu; "Ele disse: 'o tio me bateu'" é o que a criança disse. A
 *    diferença entre as duas frases já decidiu processo;
 *  * descrever o sinal, não diagnosticar. "Mancha roxa de uns 3 cm no braço
 *    esquerdo" é observação; "hematoma de agressão" é conclusão, e conclusão
 *    não é trabalho de quem está de plantão — nem do sistema.
 *
 * E uma coisa que a folha diz por escrito porque a pessoa precisa saber ANTES
 * de escrever: isto não é enviado a lugar nenhum automaticamente. Nem ao
 * Judiciário, nem ao Conselho Tutelar. O sistema registra e protege; acionar a
 * rede é decisão humana, com nome.
 */
function FolhaProtegido({ onFechar, onEnviar }: {
  onFechar: () => void; onEnviar: (corpo: Record<string, unknown>) => void;
}) {
  const [fala, setFala] = useState('');
  const [sinais, setSinais] = useState('');
  const pode = fala.trim().length > 2 || sinais.trim().length > 2;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-prot"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-prot">Registro protegido</h3>

        <div className="notice c-med">
          Este conteúdo <b>não aparece para os colegas do plantão</b>. Ficam com ele a equipe
          técnica, a coordenação, você — que está escrevendo — e a Enfermagem, quando a
          ocorrência for de saúde.
        </div>

        <label className="f" htmlFor="pr-fala">
          O que a criança disse
          <small> — com as palavras dela, entre aspas. Escreva a fala, não o que você
            entendeu dela.</small>
        </label>
        <textarea id="pr-fala" value={fala} onChange={(e) => setFala(e.target.value)}
                  placeholder={'Ex.: "eu não quero ir lá no sábado, ele grita comigo".'} />

        <label className="f" htmlFor="pr-sinais">
          Sinais observados
          <small> — o que os seus olhos viram: onde, de que tamanho, de que cor. Sem
            diagnóstico e sem supor a causa.</small>
        </label>
        <textarea id="pr-sinais" value={sinais} onChange={(e) => setSinais(e.target.value)}
                  placeholder="Ex.: mancha arroxeada de cerca de 3 cm na face interna do braço esquerdo." />

        <div className="notice c-info">
          O sistema <b>não envia isto a ninguém</b> — nem ao Judiciário, nem ao Conselho
          Tutelar. Acionar a rede é decisão da equipe técnica, com nome e data.
        </div>
        <div className="notice c-warn">
          O registro protegido é <b>único por ocorrência e não se reescreve</b>. Escreva de uma
          vez o que tem para escrever; o que vier depois entra como relato em seu nome.
        </div>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onEnviar({
                    falaEspontanea: fala.trim() || undefined,
                    sinaisObservados: sinais.trim() || undefined,
                  })}>
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
}

function FolhaComunicacao({ orgaos, canais, aviso, ocorrencia, onFechar, onEnviar }: {
  orgaos: Opcao[]; canais: Opcao[]; aviso: string;
  ocorrencia: ItemLista | null;
  onFechar: () => void; onEnviar: (corpo: Record<string, unknown>) => void;
}) {
  const [orgao, setOrgao] = useState('');
  const [canal, setCanal] = useState('');
  const [destinatario, setDestinatario] = useState('');
  const [resumo, setResumo] = useState('');
  const [orientacao, setOrientacao] = useState('');
  const pode = orgao !== '' && canal !== '' && destinatario.trim().length >= 3
    && resumo.trim().length >= 20;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-com"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-com">Registrar comunicação externa</h3>
        <div className="notice c-crit">{aviso}</div>
        {ocorrencia && (
          <div className="bloco">
            <small>Sobre a ocorrência</small>
            {ocorrencia.categoria} · {dia(ocorrencia.quando)} às {hhmm(ocorrencia.quando)}
          </div>
        )}

        <label className="f">Órgão</label>
        <div className="opts">
          {orgaos.map((o) => (
            <button type="button" key={o.cod} className="opt c-info"
                    aria-pressed={orgao === o.cod} onClick={() => setOrgao(o.cod)}>
              {o.label}
            </button>
          ))}
        </div>

        <label className="f" htmlFor="com-dest">
          Destinatário <small>— o cargo ou o setor, nunca o nome de uma pessoa</small>
        </label>
        <input id="com-dest" className="field" value={destinatario}
               onChange={(e) => setDestinatario(e.target.value)}
               placeholder="Ex.: Conselho Tutelar — Regional Centro" />

        <label className="f">Como foi (ou vai ser) entregue</label>
        <div className="opts">
          {canais.map((c) => (
            <button type="button" key={c.cod} className="opt c-ok"
                    aria-pressed={canal === c.cod} onClick={() => setCanal(c.cod)}>
              {c.label}
            </button>
          ))}
        </div>

        <label className="f" htmlFor="com-resumo">
          Teor da comunicação <small>— o que a instituição está dizendo, com as suas palavras</small>
        </label>
        <textarea id="com-resumo" value={resumo} onChange={(e) => setResumo(e.target.value)}
                  placeholder="Ex.: comunicamos a saída não autorizada ocorrida em 31/08, o retorno às 23h15 e as medidas adotadas pela unidade." />

        <label className="f" htmlFor="com-orient">
          Orientação recebida <small>— se já houve alguma; pode ficar em branco</small>
        </label>
        <textarea id="com-orient" value={orientacao} onChange={(e) => setOrientacao(e.target.value)}
                  placeholder="Ex.: o Conselho orientou aguardar a audiência do dia 12." />

        <p className="mutetxt">
          Entra como <b>rascunho</b>. Depois vem a revisão, a aprovação — que é de outra
          pessoa — e, por último, o registro de quem entregou.
        </p>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onEnviar({
                    orgao, canal,
                    destinatarioFuncional: destinatario.trim(),
                    resumo: resumo.trim(),
                    orientacao: orientacao.trim() || undefined,
                    quando: new Date().toISOString(),
                  })}>
            Registrar como rascunho
          </button>
        </div>
      </div>
    </div>
  );
}

function FolhaRelato({ opcoes, onFechar, onEnviar }: {
  opcoes: OpcaoTestemunho[]; onFechar: () => void;
  onEnviar: (corpo: Record<string, unknown>) => void;
}) {
  const [witness, setWitness] = useState('');
  const [texto, setTexto] = useState('');
  const [restrito, setRestrito] = useState(false);
  const dispensaTexto = witness === 'sem_informacao_adicional';
  const pode = witness !== '' && (dispensaTexto || texto.trim().length >= 10);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-rel"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-rel">O meu relato</h3>
        <div className="notice c-info">
          Escreva o que <b>você</b> viu. Ninguém edita o relato de ninguém, e dois relatos
          que se contradizem continuam os dois — corrigir é escrever outro, ao lado.
        </div>

        <label className="f">Como você participou do fato</label>
        <div className="opts">
          {opcoes.map((o) => (
            <button type="button" key={o.code} className={`opt ${o.pendente ? 'c-warn' : 'c-info'}`}
                    aria-pressed={witness === o.code} onClick={() => setWitness(o.code)}>
              {o.label}
            </button>
          ))}
        </div>
        {opcoes.length === 0 && (
          <p className="mutetxt">Não foi possível carregar as opções de testemunho.</p>
        )}

        {dispensaTexto ? (
          <p className="mutetxt">
            Resposta legítima: você foi chamado a relatar e não tem o que acrescentar. Fica
            registrado assim mesmo, com o seu nome.
          </p>
        ) : (
          <>
            <label className="f" htmlFor="rel-texto">
              O que você viu <small>— o fato, o horário, o que foi feito. Sem rótulo sobre ninguém.</small>
            </label>
            <textarea id="rel-texto" value={texto} onChange={(e) => setTexto(e.target.value)}
                      placeholder="Ex.: por volta das 21h40 vi o portão dos fundos aberto; avisei o Líder Noturno na hora." />
          </>
        )}

        <label className="row" style={{ marginTop: 10, gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={restrito} onChange={(e) => setRestrito(e.target.checked)} />
          <span className="grow">
            <b>Narrativa pessoal</b>
            <div className="mutetxt">
              Marque quando o relato disser algo sobre você — o que sentiu, o que temeu.
              Assim ele não circula pelo plantão: abrem a equipe técnica e a coordenação.
            </div>
          </span>
        </label>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onEnviar({
                    witness,
                    body: dispensaTexto ? 'Sem informação adicional.' : texto,
                    restrito,
                    happenedAt: new Date().toISOString(),
                  })}>
            Registrar o meu relato
          </button>
        </div>
      </div>
    </div>
  );
}
