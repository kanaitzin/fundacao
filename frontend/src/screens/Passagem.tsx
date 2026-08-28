import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

/**
 * PASSAGEM INDIVIDUAL (§12.1–§12.4).
 *
 * O fim do turno é o momento mais frágil do dia: a pessoa está há doze horas
 * de pé e o que ela souber e não escrever, ninguém saberá. É a tela que
 * substitui o grupo de mensagens — e por isso a régua não é "ficou bonita",
 * é **mais rápida que digitar no aplicativo de conversa**.
 *
 * Três decisões que não são de estilo:
 *
 *  * **cada um assina a sua.** Não existe tela, botão ou rota para assinar a
 *    passagem de outra pessoa. O líder pode fechar a ATA com a passagem
 *    faltando — com o nome de quem faltou —, nunca assiná-la por ele;
 *  * **o que já foi assinado não se reescreve.** A própria passagem aparece
 *    depois como texto, não como formulário. Correção é complemento, com
 *    horário, e a ATA guarda o adendo;
 *  * **quem chega lê antes de confirmar.** As orientações do turno anterior
 *    aparecem inteiras na tela do recebimento, e o sistema diz, com todas as
 *    letras, que confirmar o recebimento não é concordar com o relato de
 *    ninguém (§12.3).
 */

interface Complemento {
  id: string; quem: string; texto: string; quando: string; escritoEm: string; offline: boolean;
}
interface PassagemFeita {
  id: string; quem: string; cargo: string; aparelho: string | null;
  contribuicoes: string | null; pendencias: string | null; orientacoes: string | null;
  assinadaEm: string; horarioReal: string; complementoTardio: boolean;
  offline: boolean; propria: boolean; complementos: Complemento[];
}
interface Recebimento {
  id: string; quem: string; recebidoEm: string;
  leuOrientacoes: boolean; assumiuPendencias: boolean; nota: string | null;
  propria: boolean;
}
interface Plantao {
  id: string; casaId: string; data: string; turno: string; status: string;
  fechadoEm?: string | null;
  ata: { id: string; status: string } | null;
  passagens: PassagemFeita[];
  assinaturasPendentes: { quem: string; cargo: string }[];
  minhaPassagemEsperada: boolean;
  recebimentos: Recebimento[];
}
interface Resumo {
  id: string; turno: string; status: string;
  abertoEm: string; fechadoEm: string | null;
  passagensAssinadas: number; assinaturasFaltantes: number | null;
  recebimentos: number;
}

const TURNO_LABEL: Record<string, string> = { diurno: 'Plantão diurno', noturno: 'Plantão noturno' };
const STATUS_LABEL: Record<string, string> = {
  aberto: 'Aberto', fechado: 'Fechado', fechado_com_pendencia: 'Fechado com pendência',
};
const FECHADO = new Set(['fechado', 'fechado_com_pendencia']);

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** ISO → o formato que o campo datetime-local aceita, na hora local. */
function paraCampo(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
       + `T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** O turno de agora, pela hora da instituição: 7h–19h é diurno. */
function turnoAgora(): 'diurno' | 'noturno' {
  const h = Number(new Intl.DateTimeFormat('pt-BR',
    { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()));
  return h >= 7 && h < 19 ? 'diurno' : 'noturno';
}

export function Passagem({ houseId }: { houseId: string }) {
  const [lista, setLista] = useState<Resumo[]>([]);
  const [aberto, setAberto] = useState<Plantao | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [recebendo, setRecebendo] = useState(false);
  const [complementando, setComplementando] = useState(false);

  const carregarLista = useCallback(async () => {
    setErro('');
    try { setLista(await api<Resumo[]>(`/shifts?houseId=${houseId}`)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar os plantões.'); }
  }, [houseId]);

  useEffect(() => { carregarLista(); }, [carregarLista]);

  const abrirPlantao = useCallback(async (id: string) => {
    setErro('');
    try { setAberto(await api<Plantao>(`/shifts/${id}`)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir o plantão.'); }
  }, []);

  /**
   * Abrir o plantão do turno é o único caminho quando o Líder ainda não abriu.
   * Sem isto, o educador que chega às 19h não teria onde assinar — e o
   * registro do turno inteiro dependeria de outra pessoa estar no celular.
   */
  async function abrirTurno() {
    setErro(''); setAviso(''); setOcupado(true);
    try {
      const r = await api<{ plantaoId: string; novo: boolean }>('/shifts', {
        method: 'POST', body: JSON.stringify({ houseId, turno: turnoAgora() }),
      });
      if (r.novo) setAviso('Plantão aberto. A ATA do turno nasceu junto, em rascunho.');
      await carregarLista();
      await abrirPlantao(r.plantaoId);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o plantão.');
    } finally {
      setOcupado(false);
    }
  }

  async function assinar(dados: {
    contribuicoes: string; pendencias: string; orientacoes: string; happenedAt?: string;
  }) {
    if (!aberto) return;
    setErro(''); setAviso(''); setOcupado(true);
    try {
      const r = await api<{ aviso?: string }>(`/shifts/${aberto.id}/handover`, {
        method: 'POST', body: JSON.stringify(dados),
      });
      setAviso(r?.aviso ?? 'Passagem assinada.');
      await abrirPlantao(aberto.id);
      await carregarLista();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível assinar a passagem.');
    } finally {
      setOcupado(false);
    }
  }

  /** O que a pessoa lembrou depois. Nunca reescreve a passagem: nasce ao lado. */
  async function complementar(texto: string) {
    if (!aberto) return;
    setErro(''); setAviso(''); setOcupado(true);
    try {
      const r = await api<{ aviso?: string }>(`/shifts/${aberto.id}/handover/note`, {
        method: 'POST', body: JSON.stringify({ texto }),
      });
      setComplementando(false);
      setAviso(r?.aviso ?? 'Complemento registrado.');
      await abrirPlantao(aberto.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar o complemento.');
    } finally {
      setOcupado(false);
    }
  }

  async function receber(dados: { leuOrientacoes: boolean; assumiuPendencias: boolean; nota?: string }) {
    if (!aberto) return;
    setErro(''); setAviso(''); setOcupado(true);
    try {
      const r = await api<{ aviso?: string }>(`/shifts/${aberto.id}/receipt`, {
        method: 'POST', body: JSON.stringify(dados),
      });
      setRecebendo(false);
      setAviso(r?.aviso ?? 'Recebimento registrado.');
      await abrirPlantao(aberto.id);
      await carregarLista();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar o recebimento.');
    } finally {
      setOcupado(false);
    }
  }

  // ---------- lista dos plantões do dia ----------

  if (!aberto) {
    const jaTemDoTurno = lista.some((p) => p.turno === turnoAgora());
    return (
      <>
        <div className="diahead"><div><h2>Passagem de plantão</h2></div></div>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

        <div className="stack">
          {lista.map((p) => (
            <button key={p.id} className="card row chamadacard" onClick={() => abrirPlantao(p.id)}>
              <div className="grow" style={{ textAlign: 'left' }}>
                <b className="ff">{TURNO_LABEL[p.turno] ?? p.turno}</b>
                <div className="mutetxt">
                  desde {hhmm(p.abertoEm)} · {p.passagensAssinadas} passagem(ns) assinada(s)
                  {p.recebimentos > 0 ? ` · ${p.recebimentos} recebimento(s)` : ''}
                </div>
              </div>
              <span className={`pill ${FECHADO.has(p.status) ? 'c-mute' : 'c-ok'}`}>
                {STATUS_LABEL[p.status] ?? p.status}
              </span>
            </button>
          ))}
          {lista.length === 0 && (
            <div className="card">
              <p className="mutetxt" style={{ margin: 0 }}>
                Nenhum plantão aberto hoje nesta casa.
              </p>
            </div>
          )}
        </div>

        {!jaTemDoTurno && (
          <button className="btn block" style={{ marginTop: 14 }} disabled={ocupado} onClick={abrirTurno}>
            Abrir o {turnoAgora() === 'diurno' ? 'plantão diurno' : 'plantão noturno'}
          </button>
        )}
      </>
    );
  }

  // ---------- um plantão ----------

  const minha = aberto.passagens.find((p) => p.propria) ?? null;
  const dosOutros = aberto.passagens.filter((p) => !p.propria);
  const fechado = FECHADO.has(aberto.status);
  const jaRecebi = aberto.recebimentos.some((r) => r.propria);

  return (
    <>
      <div className="diahead">
        <div>
          <button className="btn sm ghost" onClick={() => { setAberto(null); carregarLista(); }}>
            ← Plantões
          </button>
          <h2>{TURNO_LABEL[aberto.turno] ?? aberto.turno}</h2>
        </div>
        <div className="resumo">
          <span className={`pill ${fechado ? 'c-mute' : 'c-ok'}`}>
            {STATUS_LABEL[aberto.status] ?? aberto.status}
          </span>
          {minha ? (
            <span className="pill c-ok">Sua passagem assinada</span>
          ) : aberto.minhaPassagemEsperada ? (
            <span className="pill c-warn">Sua passagem falta</span>
          ) : (
            <span className="pill c-mute">Você não estava na escala</span>
          )}
        </div>
      </div>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      {/* O que quem chega precisa ler. Fica no topo porque é para isso que a
          pessoa abriu a tela às 19h — não para escrever, para saber. */}
      {dosOutros.length > 0 && (
        <section className="passagem">
          <div className="eyebrow">Do turno, por quem já assinou</div>
          <div className="stack">
            {dosOutros.map((p) => <Assinada key={p.id} p={p} />)}
          </div>
        </section>
      )}

      {/* Quem falta aparece por nome — é o que permite ir atrás da pessoa
          antes de fechar a ATA com pendência (§12.4). Nome, nunca botão de
          assinar por ela. */}
      {aberto.assinaturasPendentes.length > 0 && (
        <div className="notice c-warn" role="status">
          Sem passagem até agora: <b>{aberto.assinaturasPendentes.map((f) => f.quem).join(', ')}</b>.
          <div className="mutetxt" style={{ marginTop: 4 }}>
            Cada pessoa assina a sua. Se alguém não puder assinar, a ATA fecha com pendência
            e o nome fica registrado — ninguém assina no lugar de ninguém.
          </div>
        </div>
      )}

      {minha && (
        <section className="passagem">
          <div className="eyebrow">A sua passagem</div>
          <Assinada p={minha} />
          <p className="mutetxt">
            Assinada em seu nome e não reescrita. Se lembrou de algo depois, registre um
            complemento — ele entra ao lado desta, com horário próprio, e a ATA guarda o
            adendo. O que está escrito acima continua como foi escrito.
          </p>
          {complementando ? (
            <FormComplemento ocupado={ocupado}
                             onCancelar={() => setComplementando(false)}
                             onEnviar={complementar} />
          ) : (
            <button className="btn sec block" onClick={() => setComplementando(true)}>
              Registrar um complemento
            </button>
          )}
        </section>
      )}

      {!minha && (
        <Formulario fechado={fechado} fechadoEm={aberto.fechadoEm ?? null}
                    esperada={aberto.minhaPassagemEsperada}
                    ocupado={ocupado} onAssinar={assinar} />
      )}

      {/* Recebimento: de quem CHEGA, sobre o turno que terminou.
          Quem assinou a passagem deste plantão é quem SAI — oferecer a ele o
          botão de receber foi o que a tela de verdade mostrou: dois botões
          iguais, um deles sem sentido nenhum para quem estava ali. */}
      {!jaRecebi && !minha && aberto.passagens.length > 0 && (
        <button className="btn sec block" style={{ marginTop: 14 }} onClick={() => setRecebendo(true)}>
          Recebi este plantão
        </button>
      )}
      {aberto.recebimentos.length > 0 && (
        <p className="mutetxt" style={{ marginTop: 12 }}>
          Recebido por {aberto.recebimentos.map((r) => `${r.quem} (${hhmm(r.recebidoEm)})`).join(', ')}.
        </p>
      )}

      {recebendo && (
        <FolhaRecebimento
          orientacoes={aberto.passagens.map((p) => ({ quem: p.quem, texto: p.orientacoes, pendencias: p.pendencias }))}
          ocupado={ocupado}
          onFechar={() => setRecebendo(false)}
          onConfirmar={receber}
        />
      )}
    </>
  );
}

/** Uma passagem já assinada — texto, nunca campo. */
function Assinada({ p }: { p: PassagemFeita }) {
  return (
    <article className="card">
      <div className="row">
        <b className="ff grow">{p.quem}</b>
        <span className="pill c-mute">{hhmm(p.horarioReal)}</span>
        {p.complementoTardio && <span className="pill c-warn">complemento tardio</span>}
        {p.offline && <span className="pill c-info">registrada offline</span>}
      </div>
      {p.contribuicoes && <p className="bloco"><small>O que foi feito</small>{p.contribuicoes}</p>}
      {p.pendencias && <p className="bloco"><small>Fica pendente</small>{p.pendencias}</p>}
      {p.orientacoes && <p className="bloco destaque"><small>Para o próximo turno</small>{p.orientacoes}</p>}
      {!p.contribuicoes && !p.pendencias && !p.orientacoes && (
        <p className="mutetxt" style={{ margin: 0 }}>Assinada sem observações.</p>
      )}
      {/* Ao lado, nunca dentro: o que foi assinado continua como foi assinado. */}
      {(p.complementos ?? []).map((c) => (
        <p key={c.id} className="bloco compl">
          <small>Complemento · {hhmm(c.escritoEm)}</small>{c.texto}
        </p>
      ))}
    </article>
  );
}

/**
 * O formulário.
 *
 * Três campos, e a ordem importa: o que foi feito, o que ficou pendente, e o
 * que o próximo turno precisa saber. O terceiro é o único que aparece na tela
 * de quem chega — e é o que a equipe escreveria no grupo de mensagens.
 */
function Formulario({ esperada, fechado, fechadoEm, ocupado, onAssinar }: {
  esperada: boolean; fechado: boolean; fechadoEm: string | null; ocupado: boolean;
  onAssinar: (d: { contribuicoes: string; pendencias: string; orientacoes: string; happenedAt?: string }) => void;
}) {
  const [contribuicoes, setContribuicoes] = useState('');
  const [pendencias, setPendencias] = useState('');
  const [orientacoes, setOrientacoes] = useState('');
  /**
   * O horário real vem preenchido com o fechamento do plantão — que é quando
   * a passagem quase sempre aconteceu: na troca de turno, com a pessoa ainda
   * na casa; o que atrasou foi digitar. Digitar dia, mês, ano e hora depois de
   * doze horas em pé é o tipo de campo que faz voltar para o papel. Vem
   * preenchido, e é alterável — não é presunção, é o palpite que o sistema
   * tem, à vista, para a pessoa corrigir.
   */
  const [quando, setQuando] = useState(paraCampo(fechadoEm));
  // Assinar em branco não passa a informação nenhuma; um dos três basta.
  const temConteudo = [contribuicoes, pendencias, orientacoes].some((t) => t.trim().length >= 5);
  const pronto = temConteudo && (!fechado || quando !== '') && !ocupado;

  return (
    <section className="passagem">
      <div className="eyebrow">A sua passagem</div>

      {/* Quem não estava na escala pode ter coberto o turno — e então precisa
          registrar. O sistema avisa que não esperava a assinatura; não a
          impede. */}
      {!esperada && (
        <p className="mutetxt" style={{ marginTop: 0 }}>
          Você não consta na escala deste plantão. Se trabalhou nele, assine normalmente —
          a passagem é de quem esteve, não de quem estava previsto.
        </p>
      )}

      {fechado && (
        <div className="notice c-warn" role="status">
          Este plantão já foi fechado. A sua passagem entra como <b>complemento tardio</b>,
          com o horário real em que ela foi feita — a ATA guarda o adendo, e nada do que já
          está lá é reescrito.
        </div>
      )}

      <label className="f" htmlFor="contrib">
        O que foi feito <small>— o turno em poucas linhas</small>
      </label>
      <textarea id="contrib" value={contribuicoes} rows={3}
                onChange={(e) => setContribuicoes(e.target.value)}
                placeholder="Ex.: rotina cumprida, almoço e janta sem intercorrência; saída para a consulta da Helena às 14h." />

      <label className="f" htmlFor="pend">
        Fica pendente <small>— o que não deu tempo</small>
      </label>
      <textarea id="pend" value={pendencias} rows={2}
                onChange={(e) => setPendencias(e.target.value)}
                placeholder="Ex.: falta buscar o resultado do exame do Bruno na unidade de saúde." />

      <label className="f" htmlFor="orient">
        Para o próximo turno <small>— o que a próxima pessoa precisa saber</small>
      </label>
      <textarea id="orient" value={orientacoes} rows={3}
                onChange={(e) => setOrientacoes(e.target.value)}
                placeholder="Ex.: a Alice acordou com dor de garganta; se piorar, acionar a Enfermagem." />

      {fechado && (
        <>
          <label className="f" htmlFor="quando">
            Horário real em que a passagem foi feita{' '}
            <small>— veio com o fim do plantão; corrija se foi outra hora</small>
          </label>
          <input id="quando" type="datetime-local" className="field"
                 value={quando} onChange={(e) => setQuando(e.target.value)} />
        </>
      )}

      <button className="btn block" style={{ marginTop: 14 }} disabled={!pronto}
              onClick={() => onAssinar({
                contribuicoes: contribuicoes.trim(), pendencias: pendencias.trim(),
                orientacoes: orientacoes.trim(),
                happenedAt: fechado && quando ? new Date(quando).toISOString() : undefined,
              })}>
        Assinar minha passagem
      </button>

      <p className="mutetxt">
        {!temConteudo
          ? 'Escreva ao menos um dos três campos — passagem em branco não passa nada adiante.'
          : fechado && !quando
            ? 'Informe o horário real: é ele que diz quando a passagem foi feita, não quando foi digitada.'
            : 'Depois de assinada, ela não é reescrita. Correção entra como complemento, com horário.'}
      </p>
    </section>
  );
}

/**
 * O complemento: um campo só.
 *
 * Quem lembra de algo às 20h não vai preencher três campos de novo. E não
 * precisa: o complemento não substitui a passagem, acrescenta a ela.
 */
function FormComplemento({ ocupado, onCancelar, onEnviar }: {
  ocupado: boolean; onCancelar: () => void; onEnviar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const pronto = texto.trim().length >= 5 && !ocupado;

  return (
    <>
      <label className="f" htmlFor="compl">
        O que você lembrou <small>— entra ao lado da sua passagem, com a hora de agora</small>
      </label>
      <textarea id="compl" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="Ex.: a mãe do Bruno ligou às 17h30 e avisou que não vem na visita de sábado." />
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button type="button" className="btn sec grow" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn grow" disabled={!pronto}
                onClick={() => onEnviar(texto.trim())}>
          Registrar complemento
        </button>
      </div>
    </>
  );
}

/**
 * A folha de recebimento (§12.3).
 *
 * Ela mostra as orientações do turno anterior INTEIRAS antes de qualquer
 * caixa de confirmação, e diz, em texto, que receber não é concordar. A
 * pessoa que discorda tem onde escrever a própria versão — no campo da nota,
 * que fica com o nome dela.
 */
function FolhaRecebimento({ orientacoes, ocupado, onFechar, onConfirmar }: {
  orientacoes: { quem: string; texto: string | null; pendencias: string | null }[];
  ocupado: boolean;
  onFechar: () => void;
  onConfirmar: (d: { leuOrientacoes: boolean; assumiuPendencias: boolean; nota?: string }) => void;
}) {
  const [leu, setLeu] = useState(false);
  const [assumiu, setAssumiu] = useState(false);
  const [nota, setNota] = useState('');
  const comTexto = orientacoes.filter((o) => o.texto || o.pendencias);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-rec"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet">
        <h3 id="t-rec">Recebimento do plantão</h3>

        {comTexto.length > 0 ? (
          <div className="stack">
            {comTexto.map((o, i) => (
              <div key={i} className="card">
                <b className="ff">{o.quem}</b>
                {o.texto && <p className="bloco destaque"><small>Para o próximo turno</small>{o.texto}</p>}
                {o.pendencias && <p className="bloco"><small>Fica pendente</small>{o.pendencias}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="mutetxt">As passagens deste turno não deixaram orientações escritas.</p>
        )}

        <label className="check">
          <input type="checkbox" checked={leu} onChange={(e) => setLeu(e.target.checked)} />
          <span>Li as orientações acima</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={assumiu} onChange={(e) => setAssumiu(e.target.checked)} />
          <span>Assumo as pendências do turno</span>
        </label>

        <label className="f" htmlFor="notarec">
          Sua observação <small>— opcional, e fica com o seu nome</small>
        </label>
        <textarea id="notarec" rows={2} value={nota} onChange={(e) => setNota(e.target.value)}
                  placeholder="Ex.: recebi sem a chave do armário de medicamentos." />

        <p className="mutetxt">
          Confirmar o recebimento <b>não é concordar</b> com o relato de ninguém. Se você tem
          outra versão de um fato, registre o seu próprio relato — ele fica ao lado, não no
          lugar do outro.
        </p>

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={ocupado}
                  onClick={() => onConfirmar({
                    leuOrientacoes: leu, assumiuPendencias: assumiu,
                    nota: nota.trim() || undefined,
                  })}>
            Confirmar recebimento
          </button>
        </div>
      </div>
    </div>
  );
}
