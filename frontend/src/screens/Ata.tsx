import { useEffect, useState } from 'react';
import { cargo } from '../rotulos';
import { api } from '../api';
import { FolhaDocumento, documentoDaAta } from '../documentos';
import type { DocumentoWord } from '../docx';
import { quemAssina } from '../quem-assina';

/**
 * ATAS — a da casa e a Geral Noturna.
 *
 * O ponto inteiro desta tela é uma recusa: o sistema não assina no lugar de
 * ninguém. Quando falta a passagem de alguém, a ATA não "fecha assim mesmo"
 * nem inventa uma assinatura — ela fecha COM PENDÊNCIA, dizendo o nome de
 * quem faltou e o motivo, com a assinatura de quem fechou.
 *
 * Na ATA Geral, casa sem chamado também aparece: a ausência de demanda é
 * registrada, não omitida. Silêncio no papel é sempre ambíguo.
 *
 * ROTAS — 31/08/2026. A tela chamava `/minutes`, `/minutes/house/close` e
 * `/minutes/general/close`. Não existe módulo `minutes`: a ATA da casa VIVE
 * DENTRO DO PLANTÃO (`/shifts?houseId=` lista o dia, `/shifts/:id` abre o
 * plantão com a ATA, as passagens e quem falta assinar; fechar é
 * `/shifts/ata/:ataId/close`), e a Geral tem rotas próprias em
 * `/shifts/general-ata/*`.
 *
 * A diferença não é de nome. A ATA da casa não é um documento à parte que
 * alguém preenche: ela é o que o plantão consolidou, e por isso o dia pode ter
 * duas — a diurna e a noturna —, cada uma com as suas assinaturas. A tela
 * antiga mostrava uma só, sem dizer de qual turno.
 */

interface PlantaoDoDia {
  id: string; turno: 'diurno' | 'noturno'; status: string;
  abertoEm: string; fechadoEm: string | null;
  ataId: string | null; ataStatus: string | null;
  assinaturasFaltantes: number; passagensAssinadas: number; recebimentos: number;
}
/**
 * EPISÓDIO (§12.5): "um acolhido apresentou problema no turno".
 *
 * O relato é IMUTÁVEL — o banco tem gatilho que recusa UPDATE e DELETE. Quem
 * assume o turno seguinte não corrige o que o colega escreveu: registra
 * CIÊNCIA, com comentário próprio se quiser. As duas coisas ficam lado a lado,
 * cada uma com o seu nome, e é assim que se lê um ano depois.
 *
 * A classificação descreve o FATO ("briga ou conflito"), nunca a pessoa. Não
 * existe classificação da criança, nem gravidade, nem nota (§2).
 */
interface CienciaDoEpisodio {
  id: string; quem: string; comentario: string | null; quando: string;
}
interface Episodio {
  id: string; acolhidoId: string; acolhido: string;
  classificacao: string; relato: string; quando: string;
  ocorrenciaId: string | null; registradoPor: string;
  ciencias: number; cienciaPropria: boolean;
  quemDeuCiencia: CienciaDoEpisodio[];
}
interface Plantao {
  id: string; casaId: string; data: string; turno: string; status: string;
  abertoEm: string; fechadoEm: string | null;
  ata: { id: string; status: string; versao: number; conteudo: Record<string, string> | null;
         pendencias: string | null; assinaturasFaltantes: number;
         fechadaEm: string | null } | null;
  passagens: { id: string; quem: string; cargo: string; assinadaEm: string | null;
               propria: boolean }[];
  assinaturasPendentes: { quem: string; cargo: string }[];
  episodios: Episodio[];
}
/** O acolhido, como a lista da casa o devolve — só o que o episódio precisa. */
interface AcolhidoDaCasa { id: string; nome: string; }
/**
 * A estrutura vem do SERVIDOR, com a forma real do LIVRO ATA da Casa 03.
 *
 * A tela declarava `{ cod, label }` e o servidor devolve
 * `{ chave, titulo, tipo, ajuda, obrigatoria }`: as etiquetas saíam vazias e a
 * `key` do React era `undefined` em todas. E o `mock.ts` tinha inventado nove
 * seções com outros nomes — a demonstração mostrava um formulário que a casa
 * não usa, para quem entregou o livro de papel.
 */
interface SecaoAta {
  chave: string; titulo: string; ajuda: string; obrigatoria: boolean;
  tipo: 'texto' | 'lista' | 'sim_nao_detalhe' | 'checklist_ambientes';
}
interface Secoes {
  secoes: SecaoAta[];
  ambientes: { chave: string; label: string }[];
  classificacoesEpisodio: { code: string; label: string }[];
  aviso?: string;
}
/**
 * Um adendo: o antes e o depois que o §26.2 #20 exige poder ver.
 *
 * O estado vem EMBRULHADO — `{status, versao, conteudo}` na reabertura e
 * `{conteudo}` na correção. A tela presumia o texto cru e listava "sem
 * mudança de texto" em toda correção que houvesse acontecido.
 */
interface EstadoDoAdendo {
  status?: string; versao?: number; conteudo?: Record<string, string> | null;
}
interface Adendo {
  id: string; tipo: string; motivo: string; autor: string; quando: string;
  antes: EstadoDoAdendo | null; depois: EstadoDoAdendo | null;
}
/** Uma ATA como ela aparece no arquivo: a capa, sem o conteúdo. */
interface AtaNoArquivo {
  ataId: string; plantaoId: string; status: string; pendencias: string | null;
  assinaturasFaltantes: number; fechadaEm: string | null; fechadaPor: string | null;
  aditamentos: number; episodios: number; passagens: number;
}
interface DiaDoArquivo {
  data: string;
  diurno: AtaNoArquivo | null;
  noturno: AtaNoArquivo | null;
  /** A LINHA desta casa na ATA Geral Noturna — nunca a folha das oito. */
  geral: { id: string | null; status: string; houveContato: boolean;
           categoria: string | null; motivo: string | null; acao: string | null;
           pendencias: string | null; chegada: string | null; saida: string | null } | null;
}
interface Arquivo { de: string; ate: string; escala: string; dias: DiaDoArquivo[]; notaAtaGeral: string }
interface CasaGeral {
  casaId: string; codigo: string; nome: string;
  houveContato: boolean; motivo: string | null; acao: string | null;
  pendencias: string | null; ataNoturnaConfirmada: boolean;
}
interface AtaGeral {
  id: string; data: string; status: string;
  pendencias: string | null; assinadaEm: string | null;
  casas: CasaGeral[];
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('pt-BR',
  { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/** Quem fecha a ATA da casa (§12.4) — o mesmo alcance do servidor. */
const FECHA_ATA = ['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica', 'coordenador', 'gestor_geral'];

/**
 * Quem dá CIÊNCIA de um episódio (§12.5).
 *
 * O servidor não restringe o cargo: qualquer conta com alcance na casa pode
 * registrar que leu. A tela oferece o botão a quem assume o turno e a quem
 * responde pela casa, porque é deles que a ciência é cobrada — o educador que
 * quiser registrar a sua continua podendo pela sua própria passagem.
 */
const DA_CIENCIA = ['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica',
                    'coordenador', 'gestor_geral'];

/** Quem REABRE e CORRIGE ATA fechada (§12.7) — o mesmo alcance do servidor. */
const CORRIGE_ATA = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

const TIPO_ADENDO: Record<string, string> = {
  reabertura: 'Reabertura', correcao: 'Correção', complemento_tardio: 'Complemento tardio',
};

/* alcance:ata — quem folheia o arquivo. Conferido contra app_consulta_arquivo_ata(). */
const CONSULTA_ARQUIVO = ['coordenador', 'equipe_tecnica', 'lider_diurno',
                          'lider_noturno_geral', 'gestor_geral'];

/** Rótulo do que o Líder Noturno Geral registrou sobre a casa. */
const CATEGORIA_GERAL: Record<string, string> = {
  ocorrencia: 'Ocorrência', saude: 'Saúde', medicamento: 'Medicamento',
  saida_nao_autorizada: 'Saída não autorizada', falta_de_pessoal: 'Falta de pessoal',
  outro_apoio: 'Outro apoio',
};
const SITUACAO: Record<string, { rotulo: string; tom: string }> = {
  rascunho: { rotulo: 'Aberta', tom: 'c-info' },
  reaberta: { rotulo: 'Reaberta', tom: 'c-warn' },
  fechada: { rotulo: 'Fechada', tom: 'c-ok' },
  fechada_com_pendencia: { rotulo: 'Fechada com pendência', tom: 'c-warn' },
};

export function Ata({ houseId, papel, casaLabel = 'Casa 03 (piloto)' }: {
  houseId: string; papel: string; casaLabel?: string;
}) {
  const [aba, setAba] = useState<'casa' | 'geral' | 'arquivo'>('casa');
  const [doDia, setDoDia] = useState<PlantaoDoDia[]>([]);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [plantao, setPlantao] = useState<Plantao | null>(null);
  const [secoes, setSecoes] = useState<Secoes | null>(null);
  const [geral, setGeral] = useState<AtaGeral | null>(null);
  const [semGeral, setSemGeral] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [fechando, setFechando] = useState<'casa' | 'geral' | null>(null);
  /*
   * Abre no MÊS, e não na semana. A semana de calendário começa vazia toda
   * segunda-feira: quem abrisse o arquivo na manhã de segunda veria "nenhuma
   * ATA neste período" com o livro cheio logo atrás, e a conclusão razoável
   * seria que o sistema perdeu os registros. O mês sempre tem o que mostrar,
   * e estreitar é um toque.
   */
  const [escala, setEscala] = useState<'dia' | 'semana' | 'mes'>('mes');
  const [quando, setQuando] = useState('');
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [conteudo, setConteudo] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [adendos, setAdendos] = useState<Adendo[]>([]);
  /* A ATA em folha: ver antes de baixar, e baixar o que se viu. */
  const [documento, setDocumento] = useState<DocumentoWord | null>(null);
  const [reabrindo, setReabrindo] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const [acolhidos, setAcolhidos] = useState<AcolhidoDaCasa[]>([]);
  const [registrandoEpisodio, setRegistrandoEpisodio] = useState(false);
  const [dandoCiencia, setDandoCiencia] = useState<Episodio | null>(null);

  async function carregar() {
    setErro('');
    try {
      // A lista da casa é do módulo `people` e chega junto: o episódio é de UM
      // acolhido, e escolher pelo nome é o que evita o registro no perfil
      // errado às 3h da manhã. Quem não alcança a lista fica sem o botão de
      // registrar — e continua lendo os episódios normalmente.
      const [lista, s, gente] = await Promise.all([
        api<PlantaoDoDia[]>(`/shifts?houseId=${houseId}`),
        api<Secoes>('/shifts/ata-sections'),
        api<AcolhidoDaCasa[]>(`/people?houseId=${houseId}`).catch(() => [] as AcolhidoDaCasa[]),
      ]);
      setDoDia(lista); setSecoes(s); setAcolhidos(gente);
      // Abre no plantão que ainda está aberto; se todos fecharam, no último.
      const alvo = escolhido && lista.some((p) => p.id === escolhido)
        ? escolhido
        : (lista.find((p) => p.status !== 'fechado') ?? lista[lista.length - 1])?.id ?? null;
      setEscolhido(alvo);
      const p = alvo ? await api<Plantao>(`/shifts/${alvo}`) : null;
      setPlantao(p);
      // O rascunho da tela parte SEMPRE do que o servidor tem: quem digitou
      // aqui e recarregou não pode ver o próprio texto sobreviver a um
      // salvamento que não aconteceu.
      setConteudo((p?.ata?.conteudo ?? {}) as Record<string, string>);
      setAdendos(p?.ata ? await api<Adendo[]>(`/shifts/ata/${p.ata.id}/addenda`).catch(() => []) : []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as ATAs.');
    }
  }
  useEffect(() => { carregar(); }, [houseId]);

  /**
   * A ATA Geral do dia só se alcança abrindo-a, e abrir é do Líder Noturno
   * Geral. Não existe rota que a encontre pela data para os outros cargos —
   * está anotado como lacuna; a tela diz a verdade em vez de fingir vazio.
   */
  async function carregarGeral() {
    setErro(''); setSemGeral('');
    if (papel !== 'lider_noturno_geral') {
      setSemGeral('A ATA Geral Noturna do dia é aberta pelo Líder Noturno Geral. Para consultar '
        + 'o que ele registrou sobre ESTA casa, em qualquer data, use o Arquivo — a folha '
        + 'completa das oito casas fica com quem responde pela instituição.');
      return;
    }
    try {
      const aberta = await api<{ id: string }>('/shifts/general-ata', {
        method: 'POST', body: '{}' });
      setGeral(await api<AtaGeral>(`/shifts/general-ata/${aberta.id}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir a ATA Geral.');
    }
  }
  useEffect(() => { if (aba === 'geral' && !geral) carregarGeral(); }, [aba]);

  /**
   * O ARQUIVO — folhear o livro para trás.
   *
   * A data vai VAZIA por padrão e o servidor entende como hoje. Preencher com
   * `new Date()` aqui na tela parece inofensivo e não é: o navegador do
   * celular pode estar em outro fuso, e o dia da instituição é decidido num
   * lugar só (§23).
   */
  async function consultar(nova = escala, data = quando) {
    setErro(''); setBuscando(true);
    try {
      // Escrita por extenso, e não montada: é assim que o teste de contrato
      // consegue conferir que a rota existe do outro lado.
      setArquivo(await api<Arquivo>(
        `/shifts/ata-archive?houseId=${houseId}&escala=${nova}&data=${data}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.');
    } finally { setBuscando(false); }
  }

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try {
      const r = await fn();
      if (r?.aviso) setAviso(r.aviso);
      await carregar();
      if (aba === 'geral') await carregarGeral();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false;
    }
  }

  /**
   * Salva o corpo da ATA. Só enquanto ela está aberta ou reaberta — o servidor
   * recusa o resto, e a recusa dele é a frase que a tela mostra.
   */
  async function salvarConteudo() {
    if (!plantao?.ata || fechada) return;
    setSalvando(true); setErro('');
    try {
      await api(`/shifts/ata/${plantao.ata.id}`, {
        method: 'PATCH', body: JSON.stringify({ conteudo }) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a ATA.');
    } finally { setSalvando(false); }
  }

  const ata = plantao?.ata ?? null;
  /*
   * FECHADA é fechada COM ou SEM pendência.
   *
   * A tela comparava só com `'fechada'`, e por isso uma ATA fechada com
   * pendência — que é o caminho normal quando falta assinatura — voltava com
   * os campos editáveis e o botão de fechar de novo. Quem escrevesse ali
   * levava a recusa do servidor no `onBlur`, depois de ter digitado.
   */
  const fechada = ata?.status === 'fechada' || ata?.status === 'fechada_com_pendencia';
  const podeFechar = FECHA_ATA.includes(papel);
  const faltam = ata?.assinaturasFaltantes ?? plantao?.assinaturasPendentes.length ?? 0;
  const casasAguardando = geral ? geral.casas.filter((c) => !c.ataNoturnaConfirmada).length : 0;
  /*
   * As seções obrigatórias ainda em branco. A tela AVISA e não impede: fechar
   * com pendência é o caminho previsto, e uma ATA que se recusa a fechar às
   * 23h empurra a casa de volta para o papel.
   */
  const faltamObrigatorias = (secoes?.secoes ?? [])
    .filter((sec) => sec.obrigatoria && !(conteudo[sec.chave] ?? '').trim())
    .map((sec) => sec.titulo);

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

      <div className="filtros" role="tablist" aria-label="Qual ATA">
        <button role="tab" aria-selected={aba === 'casa'} className={aba === 'casa' ? 'on' : ''}
                onClick={() => setAba('casa')}>ATA da casa</button>
        <button role="tab" aria-selected={aba === 'geral'} className={aba === 'geral' ? 'on' : ''}
                onClick={() => setAba('geral')}>ATA Geral Noturna</button>
        {CONSULTA_ARQUIVO.includes(papel) && (
          <button role="tab" aria-selected={aba === 'arquivo'} className={aba === 'arquivo' ? 'on' : ''}
                  onClick={() => { setAba('arquivo'); if (!arquivo) consultar(); }}>
            📚 Arquivo
          </button>
        )}
      </div>

      {aba === 'casa' && (
        <>
          {doDia.length > 1 && (
            <div className="filtros" role="tablist" aria-label="Turno">
              {doDia.map((p) => (
                <button key={p.id} role="tab" aria-selected={escolhido === p.id}
                        className={escolhido === p.id ? 'on' : ''}
                        onClick={async () => {
                          setEscolhido(p.id);
                          const novo = await api<Plantao>(`/shifts/${p.id}`);
                          setPlantao(novo);
                          setConteudo((novo.ata?.conteudo ?? {}) as Record<string, string>);
                          setAdendos(novo.ata
                            ? await api<Adendo[]>(`/shifts/ata/${novo.ata.id}/addenda`).catch(() => [])
                            : []);
                        }}>
                  {p.turno === 'diurno' ? 'Turno diurno' : 'Turno noturno'}
                </button>
              ))}
            </div>
          )}

          {doDia.length === 0 && (
            <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
              Nenhum plantão aberto hoje nesta casa. A ATA nasce com o plantão — não é um
              documento à parte.</p></div>
          )}

          {plantao && (
            <>
              <div className="card raise stack">
                <div className="row">
                  <h3 className="grow" style={{ fontSize: 17, margin: 0 }}>
                    ATA {plantao.turno} · {dia(plantao.data)}
                  </h3>
                  <span className={`pill ${fechada
                    ? (ata?.pendencias ? 'c-warn' : 'c-ok') : 'c-info'}`}>
                    {fechada ? (ata?.pendencias ? 'Fechada com pendência' : 'Fechada') : 'Aberta'}
                  </span>
                </div>
                <div className="mutetxt">
                  Plantão aberto às {hhmm(plantao.abertoEm)}
                  {plantao.fechadoEm ? ` · fechado às ${hhmm(plantao.fechadoEm)}` : ''}
                  {ata ? ` · versão ${ata.versao}` : ''}
                </div>

                <div className="eyebrow">Passagens do plantão</div>
                <ul className="lista">
                  {plantao.passagens.map((p) => (
                    <li key={p.id} className="row">
                      {/* Nome numa linha, cargo embaixo: junto, o separador
                          caía no fim da linha e o cargo ficava solto. */}
                      <span className="grow">
                        {p.quem}{p.propria ? ' (sua)' : ''}
                        <span className="mutetxt linhadois">{cargo(p.cargo)}</span>
                      </span>
                      <span className={`pill ${p.assinadaEm ? 'c-ok' : 'c-warn'}`}>
                        {p.assinadaEm ? `Assinada às ${hhmm(p.assinadaEm)}` : 'Pendente'}
                      </span>
                    </li>
                  ))}
                  {plantao.assinaturasPendentes.map((f) => (
                    <li key={f.quem} className="row">
                      <span className="grow">{f.quem}
                        <span className="mutetxt linhadois">{cargo(f.cargo)}</span></span>
                      <span className="pill c-warn">Não passou o plantão</span>
                    </li>
                  ))}
                  {plantao.passagens.length === 0 && plantao.assinaturasPendentes.length === 0 && (
                    <li className="mutetxt">Ninguém escalado para este turno.</li>
                  )}
                </ul>

                {/*
                  * O CORPO DA ATA — as dezesseis seções do LIVRO ATA da Casa 03.
                  *
                  * Até 31/08/2026 a tela só listava os NOMES das seções como
                  * etiquetas, e o campo `content` da ATA nunca recebia nada:
                  * fechava-se, todo dia, uma ATA vazia. `PATCH /shifts/ata/:id`
                  * existia desde a fase 5 e não tinha por onde ser chamado.
                  *
                  * Enquanto a ATA está aberta (ou reaberta), escreve-se aqui.
                  * Fechada, o texto fica — e corrigir é reabrir e registrar a
                  * correção, que nasce ao lado com antes e depois (§12.7).
                  */}
                {secoes && (
                  <>
                    <div className="eyebrow">O livro ATA da casa</div>
                    {secoes.aviso && <p className="mutetxt" style={{ margin: 0 }}>{secoes.aviso}</p>}

                    {secoes.secoes.map((sec) => {
                      const valor = conteudo[sec.chave] ?? '';
                      const editavel = !fechada && podeFechar;
                      if (!editavel && !valor) return null;
                      return (
                        <div key={sec.chave} className={valor ? 'bloco' : 'bloco'}>
                          <small>
                            {sec.titulo}
                            {sec.obrigatoria && !valor ? ' · obrigatória' : ''}
                          </small>
                          {editavel ? (
                            <>
                              <textarea
                                aria-label={sec.titulo}
                                value={valor}
                                placeholder={sec.ajuda}
                                onChange={(e) => setConteudo(
                                  (m) => ({ ...m, [sec.chave]: e.target.value }))}
                                onBlur={() => salvarConteudo()} />
                              {sec.tipo === 'checklist_ambientes' && secoes.ambientes.length > 0 && (
                                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                                  {/*
                                    * "Todos organizados" ESCREVE a linha de cada
                                    * ambiente, uma por uma, em vez de uma frase
                                    * só: o campo continua sendo texto de quem
                                    * assina, e a pessoa apaga ou corrige a
                                    * linha do ambiente que não estava assim.
                                    * Uma frase única ("tudo ok") não deixaria
                                    * onde escrever que o banheiro alagou.
                                    */}
                                  <button type="button" className="btn sm sec"
                                          onClick={() => setConteudo((m) => ({
                                            ...m,
                                            [sec.chave]: secoes.ambientes
                                              .map((a) => `${a.label}: organizado`).join('\n'),
                                          }))}>
                                    ✓ Todos organizados
                                  </button>
                                  {/* Os ambientes do formulário de papel, como
                                      atalho de escrita. O registro é do
                                      AMBIENTE, nunca de quem arrumou (§3.3). */}
                                  {secoes.ambientes.map((amb) => (
                                    <button type="button" key={amb.chave} className="btn sm ghost"
                                            onClick={() => setConteudo((m) => ({
                                              ...m,
                                              [sec.chave]: `${(m[sec.chave] ?? '').trimEnd()}${
                                                m[sec.chave] ? '\n' : ''}${amb.label}: `,
                                            }))}>
                                      + {amb.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : valor}
                        </div>
                      );
                    })}

                    {!fechada && podeFechar && (
                      <div className="mutetxt">
                        {salvando ? 'Salvando…' : 'O texto é salvo ao sair de cada campo.'}
                        {faltamObrigatorias.length > 0 && (
                          <> · Ainda em branco: <b>{faltamObrigatorias.join(', ')}</b>.</>
                        )}
                      </div>
                    )}
                    {fechada && Object.keys(conteudo).length === 0 && (
                      <p className="mutetxt" style={{ margin: 0 }}>
                        Esta ATA foi fechada sem texto nas seções.
                      </p>
                    )}
                  </>
                )}

                {/*
                  * EPISÓDIOS DO TURNO (§12.5).
                  *
                  * As duas rotas existiam desde a fase 5 e nunca tiveram porta:
                  * o que acontecia de madrugada — a briga, a saída não
                  * autorizada, a crise — ou virava texto solto numa seção da
                  * ATA, ou não era registrado. Registrado UMA vez, aparece no
                  * perfil do acolhido, na linha do tempo e nesta ATA.
                  *
                  * Fica DEPOIS do corpo da ATA de propósito: o corpo descreve o
                  * turno, o episódio descreve uma pessoa naquele turno — e
                  * misturar os dois foi o que fez o livro de papel virar um
                  * bloco de texto que ninguém encontra.
                  */}
                <div className="eyebrow">Episódios do turno</div>
                <p className="mutetxt" style={{ margin: 0 }}>
                  O que aconteceu com um acolhido neste turno, descrito pelo fato. A
                  classificação é do FATO, nunca da criança — não existe gravidade, nota nem
                  comparação entre acolhidos. O relato não pode ser alterado depois: quem assume
                  o turno registra <b>ciência</b>, e o comentário dele nasce ao lado.
                </p>

                {plantao.episodios.length === 0 && (
                  <p className="mutetxt">Nenhum episódio registrado neste turno.</p>
                )}
                <div className="stack">
                  {plantao.episodios.map((ep) => (
                    <article className="card" key={ep.id}>
                      <div className="row">
                        <div className="grow">
                          <b className="ff">{ep.acolhido}</b>
                          <div className="mutetxt linhadois">
                            {hhmm(ep.quando)} · registrado por {ep.registradoPor}
                          </div>
                        </div>
                        <span className="pill c-other">
                          {secoes?.classificacoesEpisodio.find((c) => c.code === ep.classificacao)
                            ?.label ?? ep.classificacao}
                        </span>
                      </div>
                      <p style={{ margin: '8px 0 0' }}>{ep.relato}</p>

                      {ep.quemDeuCiencia.length > 0 && (
                        <ul className="lista" style={{ marginTop: 10 }}>
                          {ep.quemDeuCiencia.map((k) => (
                            <li key={k.id}>
                              <span className="pill c-ok">Ciência</span>{' '}
                              {k.quem} · {hhmm(k.quando)}
                              {k.comentario && (
                                <div className="mutetxt linhadois">{k.comentario}</div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {DA_CIENCIA.includes(papel) && !ep.cienciaPropria && (
                        <button className="btn sec sm" onClick={() => setDandoCiencia(ep)}>
                          Registrar ciência
                        </button>
                      )}
                      {ep.cienciaPropria && (
                        <p className="mutetxt" style={{ marginBottom: 0 }}>
                          Você já registrou ciência deste episódio.
                        </p>
                      )}
                    </article>
                  ))}
                </div>

                {/* Registrar exige a ATA ABERTA: episódio é do turno que está
                    acontecendo, e o servidor recusa em ATA fechada. */}
                {!fechada && acolhidos.length > 0 && (
                  <button className="btn sec block" style={{ marginTop: 12 }}
                          onClick={() => setRegistrandoEpisodio(true)}>
                    Registrar um episódio
                  </button>
                )}
                {fechada && (
                  <p className="mutetxt">
                    A ATA está fechada: episódio novo entra no plantão aberto, não neste.
                  </p>
                )}

                {/*
                  * A ATA EM FOLHA.
                  *
                  * A equipe técnica leva a ATA para a reunião, e a coordenação
                  * a leva para a Fundação. Até aqui, isso significava copiar da
                  * tela para o Word à mão — e o que chega à reunião passa a ser
                  * a memória de quem copiou.
                  */}
                {ata && (
                  <button className="btn sec sm"
                          onClick={() => setDocumento(documentoDaAta(
                            {
                              data: plantao.data, turno: plantao.turno,
                              status: ata.status,
                              conteudo: ata.conteudo,
                              pendencias: ata.pendencias,
                              episodios: plantao.episodios,
                              passagens: plantao.passagens,
                            },
                            secoes?.secoes ?? [], casaLabel, quemAssina()))}>
                    📄 Ver em folha / baixar em Word
                  </button>
                )}

                {/*
                  * CORRIGIR DEPOIS DE FECHADA (§12.7).
                  *
                  * Nunca por cima: reabrir grava o estado anterior no adendo,
                  * e a correção grava o antes e o depois. Duas etapas porque
                  * são dois atos — e porque quem lê a ATA daqui a um ano
                  * precisa ver que houve correção, quando e por quê.
                  */}
                {fechada && CORRIGE_ATA.includes(papel) && (
                  <button className="btn sec sm" onClick={() => setReabrindo(true)}>
                    ✏️ Reabrir para corrigir
                  </button>
                )}
                {ata?.status === 'reaberta' && CORRIGE_ATA.includes(papel) && (
                  <>
                    <div className="notice c-warn">
                      ATA <b>reaberta</b>. O estado anterior já foi gravado no adendo. Escreva a
                      correção nas seções acima e registre — o que estava antes continua
                      consultável.
                    </div>
                    <button className="btn sm" onClick={() => setCorrigindo(true)}>
                      Registrar a correção
                    </button>
                  </>
                )}

                {adendos.length > 0 && (
                  <>
                    <div className="eyebrow">Correções desta ATA</div>
                    {adendos.map((d) => (
                      <div className="bloco compl" key={d.id}>
                        <small>
                          {TIPO_ADENDO[d.tipo] ?? d.tipo} · {d.autor} · {hhmm(d.quando)}
                        </small>
                        {d.motivo}
                        {d.antes?.conteudo && d.depois?.conteudo && (
                          <div className="mutetxt" style={{ marginTop: 6 }}>
                            {/* Quais SEÇÕES mudaram. O texto de antes não é
                                repetido aqui: quem precisa compará-lo abre o
                                registro, e a lista serve para saber ONDE
                                olhar. */}
                            Seções alteradas: {Object.keys({ ...d.antes.conteudo, ...d.depois.conteudo })
                              .filter((k) => (d.antes?.conteudo?.[k] ?? '')
                                          !== (d.depois?.conteudo?.[k] ?? ''))
                              .map((k) => secoes?.secoes.find((x) => x.chave === k)?.titulo ?? k)
                              .join(' · ') || 'nenhuma — só a situação da ATA mudou.'}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}

                {fechada ? (
                  <div className={`notice ${ata?.pendencias ? 'c-warn' : 'c-ok'}`}>
                    Fechada{ata?.fechadaEm ? ` às ${hhmm(ata.fechadaEm)}` : ''}.
                    {ata?.pendencias && (
                      <> Pendência registrada: {ata.pendencias} Nenhuma assinatura foi criada em
                        nome de terceiros; equipe técnica e coordenação foram avisadas.</>
                    )}
                    {' '}A cópia documental entrou na fila do arquivo.
                  </div>
                ) : podeFechar && ata ? (
                  <>
                    {faltam > 0 && (
                      <div className="notice c-warn">
                        {faltam === 1 ? 'Falta 1 passagem' : `Faltam ${faltam} passagens`}. O
                        sistema não assina no lugar de ninguém: ou a pessoa assina, ou a ATA
                        fecha <b>com pendência</b>.
                      </div>
                    )}
                    <button className="btn block" onClick={() => setFechando('casa')}>
                      Fechar a ATA da casa
                    </button>
                  </>
                ) : (
                  <p className="mutetxt" style={{ margin: 0 }}>
                    Quem fecha esta ATA é o Líder Diurno, o Líder Noturno Geral, a equipe
                    técnica ou a coordenação. Você lê, e o que escreveu na sua passagem já
                    está aqui.
                  </p>
                )}
              </div>

              <p className="mutetxt" style={{ marginTop: 12 }}>
                ATA fechada não é reescrita. Correção entra como adendo, ao lado, com autor e
                horário reais.
              </p>
            </>
          )}
        </>
      )}

      {aba === 'geral' && (
        <>
          {semGeral && <div className="notice c-info">{semGeral}</div>}
          {geral && (
            <div className="card raise stack">
              <div className="row">
                <h3 className="grow" style={{ fontSize: 17, margin: 0 }}>
                  ATA Geral Noturna · {dia(geral.data)}
                </h3>
                <span className={`pill ${geral.status === 'fechada'
                  ? (geral.pendencias ? 'c-warn' : 'c-ok') : 'c-info'}`}>
                  {geral.status === 'fechada'
                    ? (geral.pendencias ? 'Fechada com pendência' : 'Fechada') : 'Aberta'}
                </span>
              </div>
              <p className="mutetxt" style={{ margin: 0 }}>
                Casa sem chamado também é indicada: a ausência de demanda é
                <b> registrada, não omitida</b>.
              </p>

              <ul className="lista">
                {geral.casas.map((c) => (
                  <li key={c.casaId} className="row">
                    <b className="ff code">{c.codigo}</b>
                    <span className="grow">
                      {c.houveContato
                        ? (c.motivo ?? 'Contato registrado.')
                        : <span className="mutetxt">Sem chamado ou visita.</span>}
                      {c.pendencias && <div className="mutetxt">Pendência: {c.pendencias}</div>}
                    </span>
                    <span className={`pill ${c.ataNoturnaConfirmada ? 'c-ok' : 'c-warn'}`}>
                      ATA da casa {c.ataNoturnaConfirmada ? 'confirmada' : 'aguardando'}
                    </span>
                  </li>
                ))}
              </ul>

              {geral.status === 'fechada' ? (
                <div className={`notice ${geral.pendencias ? 'c-warn' : 'c-ok'}`}>
                  Assinada e fechada{geral.assinadaEm ? ` às ${hhmm(geral.assinadaEm)}` : ''}.
                  {geral.pendencias && <> Pendência: {geral.pendencias}</>}
                  {' '}Cada educador assinou apenas a própria passagem.
                </div>
              ) : (
                <>
                  {casasAguardando > 0 && (
                    <div className="notice c-warn">
                      {casasAguardando} casa{casasAguardando === 1 ? '' : 's'} ainda não
                      confirmou a ATA noturna. Feche <b>com pendência</b>, dizendo o que faltou.
                    </div>
                  )}
                  <button className="btn block" onClick={() => setFechando('geral')}>
                    ✍️ Assinar e fechar a ATA Geral
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {aba === 'arquivo' && (
        <>
          {/*
            * O ARQUIVO DAS ATAS.
            *
            * Duas decisões que esta aba carrega:
            *
            *  * o recorte é de CALENDÁRIO. "A semana do dia 12" é segunda a
            *    domingo e "março" é o mês inteiro, porque é assim que o pedido
            *    chega — ninguém pede "a ATA dos últimos sete dias";
            *  * o arquivo mostra a CAPA de cada ATA, não o conteúdo. Quem
            *    precisa do que foi escrito abre a ATA, e a permissão é
            *    conferida de novo lá dentro. Uma lista que já traz tudo é uma
            *    lista que vaza tudo quando alguém tira um print.
            */}
          <div className="card raise stack">
            <h3 style={{ fontSize: 17, margin: 0 }}>Arquivo das ATAS</h3>
            <div className="mutetxt">
              O livro folheado para trás: um dia, uma semana ou um mês desta casa.
            </div>

            <div className="filtros" role="tablist" aria-label="Recorte">
              {([['dia', 'Um dia'], ['semana', 'A semana'], ['mes', 'O mês']] as const).map(
                ([cod, label]) => (
                  <button key={cod} role="tab" aria-selected={escala === cod}
                          className={escala === cod ? 'on' : ''}
                          onClick={() => { setEscala(cod); consultar(cod, quando); }}>
                    {label}
                  </button>
                ))}
            </div>

            <label className="f" htmlFor="arq-data">
              Data <small>— a semana e o mês são os DESTA data</small>
            </label>
            <div className="row">
              <input id="arq-data" type="date" className="grow" value={quando}
                     onChange={(e) => { setQuando(e.target.value); consultar(escala, e.target.value); }} />
              <button className="btn sm sec" onClick={() => { setQuando(''); consultar(escala, ''); }}>
                Hoje
              </button>
            </div>
          </div>

          {arquivo && (
            <>
              <p className="mutetxt" style={{ marginTop: 12 }}>
                De {dia(arquivo.de)} a {dia(arquivo.ate)} · {arquivo.dias.length} dia(s) com ATA.
              </p>
              <div className="notice c-info">{arquivo.notaAtaGeral}</div>
            </>
          )}

          {buscando && <div className="card"><p className="mutetxt" style={{ margin: 0 }}>Buscando…</p></div>}

          <div className="stack" style={{ marginTop: 12 }}>
            {(arquivo?.dias ?? []).map((d) => (
              <div className="card stack" key={d.data}>
                <b className="ff">{dia(d.data)}</b>

                {([['diurno', 'Turno diurno', d.diurno], ['noturno', 'Turno noturno', d.noturno]] as const)
                  .map(([cod, rotulo, a]) => a && (
                    <div className="bloco" key={cod}>
                      <div className="row">
                        <b className="grow">{rotulo}</b>
                        <span className={`pill ${SITUACAO[a.status]?.tom ?? 'c-mute'}`}>
                          {SITUACAO[a.status]?.rotulo ?? a.status}
                        </span>
                      </div>
                      <div className="mutetxt">
                        {a.passagens} passagem(ns) assinada(s)
                        {a.assinaturasFaltantes > 0 && ` · ${a.assinaturasFaltantes} faltando`}
                        {a.episodios > 0 && ` · ${a.episodios} episódio(s)`}
                        {/* Aditamento aparece na CAPA: uma ATA corrigida depois
                            precisa se anunciar antes de ser lida. */}
                        {a.aditamentos > 0 && ` · ${a.aditamentos} aditamento(s)`}
                        {a.fechadaEm && ` · fechada às ${hhmm(a.fechadaEm)}`}
                        {a.fechadaPor && ` por ${a.fechadaPor}`}
                      </div>
                      {a.pendencias && (
                        <div className="notice c-warn" style={{ marginTop: 8 }}>
                          <b>Pendência registrada:</b> {a.pendencias}
                        </div>
                      )}
                      <button className="btn sm sec" style={{ marginTop: 8 }}
                              onClick={async () => {
                                setAba('casa'); setEscolhido(a.plantaoId);
                                setPlantao(await api<Plantao>(`/shifts/${a.plantaoId}`));
                              }}>
                        Abrir esta ATA
                      </button>
                    </div>
                  ))}

                {d.geral && (
                  <div className="bloco destaque">
                    <small>ATA Geral Noturna — o que foi registrado sobre esta casa</small>
                    {d.geral.houveContato ? (
                      <>
                        {d.geral.categoria && (
                          <div className="mutetxt">
                            {CATEGORIA_GERAL[d.geral.categoria] ?? d.geral.categoria}
                            {d.geral.chegada && ` · chegou às ${hhmm(d.geral.chegada)}`}
                            {d.geral.saida && ` · saiu às ${hhmm(d.geral.saida)}`}
                          </div>
                        )}
                        {d.geral.motivo && <div>{d.geral.motivo}</div>}
                        {d.geral.acao && <div className="mutetxt">O que foi feito: {d.geral.acao}</div>}
                        {d.geral.pendencias && (
                          <div className="notice c-warn" style={{ marginTop: 8 }}>
                            <b>Ficou pendente:</b> {d.geral.pendencias}
                          </div>
                        )}
                      </>
                    ) : (
                      /* Casa sem chamado é REGISTRO, não silêncio (§12.6). */
                      <div className="mutetxt">
                        Sem chamado nesta noite. A ausência de demanda fica registrada.
                      </div>
                    )}
                    {d.geral.id && (
                      <button className="btn sm ghost" style={{ marginTop: 8 }}
                              onClick={async () => {
                                setAba('geral');
                                setGeral(await api<AtaGeral>(`/shifts/general-ata/${d.geral!.id}`));
                                setSemGeral('');
                              }}>
                        Ver a folha completa das oito casas
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {arquivo && arquivo.dias.length === 0 && !buscando && (
              <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
                Nenhuma ATA neste período. A ATA nasce com o plantão: dia sem plantão aberto
                é dia sem ATA — e isso também é informação. Se procurava algo mais antigo,
                abra <b>O mês</b> ou escolha outra data.</p></div>
            )}
          </div>

          <p className="mutetxt" style={{ marginTop: 12 }}>
            <b>Consultar deixa rastro.</b> Fica registrado quem abriu o arquivo, de que casa e
            de que período — nunca o que estava escrito nas ATAS.
          </p>
        </>
      )}

      {reabrindo && ata && (
        <FolhaMotivo
          titulo="Reabrir a ATA para corrigir"
          explicacao={'Reabrir NÃO apaga nada. O estado atual da ATA é gravado no adendo antes '
            + 'de qualquer alteração, e o motivo que você escrever fica junto — é ele que '
            + 'explica, daqui a um ano, por que este documento foi mexido.'}
          rotulo="Por que precisa ser corrigida"
          botao="Reabrir"
          onFechar={() => setReabrindo(false)}
          onEnviar={async (motivo) => {
            const ok = await acao(() => api(`/shifts/ata/${ata.id}/reopen`, {
              method: 'POST', body: JSON.stringify({ motivo }) }));
            if (ok) setReabrindo(false);
          }} />
      )}

      {corrigindo && ata && (
        <FolhaMotivo
          titulo="Registrar a correção"
          explicacao={'A correção grava o ANTES e o DEPOIS. A versão anterior continua '
            + 'consultável; ninguém, em nenhum cargo, reescreve o que já foi assinado.'}
          rotulo="O que está sendo corrigido, e por quê"
          botao="Registrar a correção"
          onFechar={() => setCorrigindo(false)}
          onEnviar={async (motivo) => {
            const ok = await acao(() => api(`/shifts/ata/${ata.id}/amend`, {
              method: 'POST', body: JSON.stringify({ motivo, conteudo }) }));
            if (ok) setCorrigindo(false);
          }} />
      )}

      {registrandoEpisodio && ata && secoes && (
        <FolhaEpisodio
          acolhidos={acolhidos}
          classificacoes={secoes.classificacoesEpisodio}
          onFechar={() => setRegistrandoEpisodio(false)}
          onEnviar={async (dados) => {
            const ok = await acao(() => api(`/shifts/ata/${ata.id}/episodes`, {
              method: 'POST', body: JSON.stringify(dados) }));
            if (ok) setRegistrandoEpisodio(false);
          }} />
      )}

      {dandoCiencia && (
        <FolhaCiencia
          episodio={dandoCiencia}
          onFechar={() => setDandoCiencia(null)}
          onEnviar={async (comentario) => {
            const ok = await acao(() => api(`/shifts/episodes/${dandoCiencia.id}/ack`, {
              method: 'POST', body: JSON.stringify({ comentario }) }));
            if (ok) setDandoCiencia(null);
          }} />
      )}

      {fechando && (
        <FolhaFechar
          qual={fechando}
          faltam={fechando === 'casa' ? faltam : casasAguardando}
          onFechar={() => setFechando(null)}
          onConfirmar={async (comPendencia, motivoPendencia) => {
            // Uma chave só, e ela é a pendência: fechar "consolidada" é fechar
            // sem pendência. O servidor não tem um booleano à parte, porque a
            // frase escrita É o registro.
            const corpo = JSON.stringify({ pendencias: comPendencia ? motivoPendencia : null });
            // Escritas por extenso, e não escolhidas numa variável: a rota
            // montada some do teste de contrato, e fechar a ATA da casa e
            // assinar a Geral Noturna são atos distintos, com destinatários
            // distintos. Se uma delas mudar de nome no servidor, é aqui que
            // precisa quebrar.
            const ok = await acao(() => fechando === 'casa'
              ? api(`/shifts/ata/${ata?.id}/close`, { method: 'POST', body: corpo })
              : api(`/shifts/general-ata/${geral?.id}/sign`, { method: 'POST', body: corpo }));
            if (ok) setFechando(null);
          }} />
      )}

      {documento && (
        <FolhaDocumento doc={documento} onFechar={() => setDocumento(null)} />
      )}
    </>
  );
}

/**
 * A FOLHA DO MOTIVO — reabertura e correção.
 *
 * O mínimo de quinze caracteres não é capricho: "erro" e "ajuste" não
 * explicam nada a quem ler a ATA no ano que vem, e é justamente essa pessoa
 * que o adendo existe para servir. O servidor recusa abaixo disso; a tela
 * segura o botão antes, para a recusa não chegar depois de escrever.
 */
function FolhaMotivo({ titulo, explicacao, rotulo, botao, onFechar, onEnviar }: {
  titulo: string; explicacao: string; rotulo: string; botao: string;
  onFechar: () => void; onEnviar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const pode = motivo.trim().length >= 15;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-mot"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-mot">{titulo}</h3>
        <div className="notice c-info">{explicacao}</div>
        <label className="f" htmlFor="mot-txt">
          {rotulo} <small>— pelo menos 15 caracteres</small>
        </label>
        <textarea id="mot-txt" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: o horário do acionamento da Enfermagem foi anotado como 21h e o correto é 23h10." />
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onEnviar(motivo.trim())}>
            {botao}
          </button>
        </div>
      </div>
    </div>
  );
}

function FolhaFechar({ qual, faltam, onFechar, onConfirmar }: {
  qual: 'casa' | 'geral'; faltam: number; onFechar: () => void;
  onConfirmar: (comPendencia: boolean, motivo: string) => void;
}) {
  const [comPendencia, setComPendencia] = useState(faltam > 0);
  const [motivo, setMotivo] = useState('');
  const pode = !comPendencia || motivo.trim().length >= 10;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-ata"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-ata">
          Fechar a {qual === 'casa' ? 'ATA da casa' : 'ATA Geral Noturna'}
        </h3>
        <div className="notice c-info">
          O fechamento leva o <b>seu nome</b> e o horário de agora. Ele não cria assinatura
          de mais ninguém.
        </div>

        <label className="f">Como fechar</label>
        <div className="opts">
          <button type="button" className="opt c-ok" aria-pressed={!comPendencia}
                  disabled={faltam > 0} onClick={() => setComPendencia(false)}>
            Tudo assinado — fechar consolidada
          </button>
          <button type="button" className="opt c-warn" aria-pressed={comPendencia}
                  onClick={() => setComPendencia(true)}>
            Fechar com pendência
          </button>
        </div>
        {faltam > 0 && (
          <p className="mutetxt">
            Ainda falta{faltam === 1 ? '' : 'm'} {faltam} assinatura{faltam === 1 ? '' : 's'}.
            Fechar como consolidada afirmaria algo que não aconteceu.
          </p>
        )}

        {comPendencia && (
          <>
            <label className="f" htmlFor="mot-ata">
              Qual é a pendência <small>— quem faltou e por quê, até onde você sabe</small>
            </label>
            <textarea id="mot-ata" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex.: passagem de Joana Lima ausente; saiu antes do fim do turno para atendimento." />
          </>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onConfirmar(comPendencia, motivo)}>
            Confirmar fechamento
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DO EPISÓDIO (§12.5).
 *
 * Três coisas que ela faz de propósito:
 *
 *  * **o acolhido é escolhido pelo nome, numa lista da casa.** Digitar o nome
 *    às 3h da manhã acerta o perfil errado, e o registro é imutável — não há
 *    como corrigir depois de gravado;
 *  * **a classificação vem do servidor**, e descreve o FATO. A tela não inventa
 *    opção nenhuma, e não existe campo de gravidade: classificar a criança é
 *    proibido (§2);
 *  * **o horário é editável.** O episódio de 2h20 costuma ser escrito às 6h, na
 *    troca do turno, e gravá-lo com a hora do formulário é perder o único dado
 *    que a próxima leitura vai querer.
 */
function FolhaEpisodio({ acolhidos, classificacoes, onFechar, onEnviar }: {
  acolhidos: AcolhidoDaCasa[];
  classificacoes: { code: string; label: string }[];
  onFechar: () => void;
  onEnviar: (dados: { acolhidoId: string; classificacao: string;
                      relato: string; happenedAt?: string }) => void;
}) {
  const [acolhidoId, setAcolhidoId] = useState('');
  const [classificacao, setClassificacao] = useState('');
  const [relato, setRelato] = useState('');
  const [quando, setQuando] = useState('');
  const pode = acolhidoId !== '' && classificacao !== '' && relato.trim().length >= 10;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-epi"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-epi">Registrar um episódio</h3>
        <div className="notice c-info">
          Registrado <b>uma única vez</b>: aparece no perfil do acolhido, na linha do tempo e
          nesta ATA. O relato <b>não pode ser alterado depois</b> — quem discordar ou tiver algo
          a acrescentar registra ciência com comentário próprio, ao lado.
        </div>

        <label className="f" htmlFor="epi-quem">Acolhido</label>
        <select id="epi-quem" value={acolhidoId} onChange={(e) => setAcolhidoId(e.target.value)}>
          <option value="">Escolha…</option>
          {acolhidos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>

        <label className="f">O que foi <small>— a classificação é do fato</small></label>
        <div className="opts">
          {classificacoes.map((c) => (
            <button type="button" key={c.code} className="opt c-other"
                    aria-pressed={classificacao === c.code}
                    onClick={() => setClassificacao(c.code)}>
              {c.label}
            </button>
          ))}
        </div>

        <label className="f" htmlFor="epi-relato">
          O que aconteceu <small>— fato, hora e o que foi feito</small>
        </label>
        <textarea id="epi-relato" value={relato} onChange={(e) => setRelato(e.target.value)}
                  placeholder="Ex.: por volta das 2h20 acordou chorando e não quis voltar para o quarto; ficou na sala com a educadora até as 3h e dormiu em seguida." />

        <label className="f" htmlFor="epi-quando">
          Quando aconteceu <small>— em branco, vale a hora de agora</small>
        </label>
        <input id="epi-quando" type="datetime-local" value={quando}
               onChange={(e) => setQuando(e.target.value)} />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onEnviar({
            acolhidoId, classificacao, relato: relato.trim(),
            happenedAt: quando ? new Date(quando).toISOString() : undefined,
          })}>
            Registrar episódio
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DA CIÊNCIA (§12.5).
 *
 * O comentário é OPCIONAL, e a folha diz isso com todas as letras: obrigar a
 * escrever para poder registrar que leu produz "ciente" repetido vinte vezes,
 * que é o mesmo que não ter registro nenhum. O relato do colega aparece inteiro
 * acima do campo — dar ciência do que não se leu não é ciência.
 */
function FolhaCiencia({ episodio, onFechar, onEnviar }: {
  episodio: Episodio; onFechar: () => void; onEnviar: (comentario?: string) => void;
}) {
  const [comentario, setComentario] = useState('');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-cie"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-cie">Ciência do episódio · {episodio.acolhido}</h3>
        <div className="bloco">
          <small>O que foi registrado</small>
          {episodio.relato}
        </div>
        <p className="mutetxt">
          Registrar ciência não altera nada do que está acima e não é concordância: é o registro
          de que você leu. Se tiver algo a acrescentar, escreva — o seu texto nasce ao lado, com
          o seu nome, e o relato original continua como foi escrito.
        </p>

        <label className="f" htmlFor="cie-txt">
          Comentário <small>— opcional</small>
        </label>
        <textarea id="cie-txt" value={comentario} onChange={(e) => setComentario(e.target.value)}
                  placeholder="Ex.: acompanhei pela manhã; ela acordou bem e foi para a escola no horário." />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow"
                  onClick={() => onEnviar(comentario.trim() || undefined)}>
            Registrar ciência
          </button>
        </div>
      </div>
    </div>
  );
}
