import { useEffect, useState } from 'react';
import { api } from '../api';

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
interface Plantao {
  id: string; casaId: string; data: string; turno: string; status: string;
  abertoEm: string; fechadoEm: string | null;
  ata: { id: string; status: string; versao: number; conteudo: Record<string, string> | null;
         pendencias: string | null; assinaturasFaltantes: number;
         fechadaEm: string | null } | null;
  passagens: { id: string; quem: string; cargo: string; assinadaEm: string | null;
               propria: boolean }[];
  assinaturasPendentes: { quem: string; cargo: string }[];
}
interface Secoes { secoes: { cod: string; label: string }[] }
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

export function Ata({ houseId, papel }: { houseId: string; papel: string }) {
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

  async function carregar() {
    setErro('');
    try {
      const [lista, s] = await Promise.all([
        api<PlantaoDoDia[]>(`/shifts?houseId=${houseId}`),
        api<Secoes>('/shifts/ata-sections'),
      ]);
      setDoDia(lista); setSecoes(s);
      // Abre no plantão que ainda está aberto; se todos fecharam, no último.
      const alvo = escolhido && lista.some((p) => p.id === escolhido)
        ? escolhido
        : (lista.find((p) => p.status !== 'fechado') ?? lista[lista.length - 1])?.id ?? null;
      setEscolhido(alvo);
      setPlantao(alvo ? await api<Plantao>(`/shifts/${alvo}`) : null);
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

  const ata = plantao?.ata ?? null;
  const fechada = ata?.status === 'fechada';
  const podeFechar = FECHA_ATA.includes(papel);
  const faltam = ata?.assinaturasFaltantes ?? plantao?.assinaturasPendentes.length ?? 0;
  const casasAguardando = geral ? geral.casas.filter((c) => !c.ataNoturnaConfirmada).length : 0;

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
                          setPlantao(await api<Plantao>(`/shifts/${p.id}`));
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
                      <span className="grow">
                        {p.quem}{p.propria ? ' (sua)' : ''}
                        <span className="mutetxt"> · {p.cargo}</span>
                      </span>
                      <span className={`pill ${p.assinadaEm ? 'c-ok' : 'c-warn'}`}>
                        {p.assinadaEm ? `Assinada às ${hhmm(p.assinadaEm)}` : 'Pendente'}
                      </span>
                    </li>
                  ))}
                  {plantao.assinaturasPendentes.map((f) => (
                    <li key={f.quem} className="row">
                      <span className="grow">{f.quem}<span className="mutetxt"> · {f.cargo}</span></span>
                      <span className="pill c-warn">Não passou o plantão</span>
                    </li>
                  ))}
                  {plantao.passagens.length === 0 && plantao.assinaturasPendentes.length === 0 && (
                    <li className="mutetxt">Ninguém escalado para este turno.</li>
                  )}
                </ul>

                {secoes && (
                  <>
                    <div className="eyebrow">O que a ATA consolida</div>
                    <div className="row">
                      {secoes.secoes.map((s) => (
                        <span className="pill c-mute" key={s.cod}>{s.label}</span>
                      ))}
                    </div>
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
    </>
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
