import { HORAS_DO_TURNO } from '../turno';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { FolhaDocumento } from '../documentos';
import type { ArquivoGerado } from '../documentos';
import type { DocumentoWord } from '../docx';
import { cargo as rotuloCargo, diaCurto as dia, tomDoAutor } from '../rotulos';
import { Cargo } from '../cargos';
import { Icone } from '../icones';

/**
 * A ESCALA DE PLANTÃO (§5.12).
 *
 * A tela responde duas perguntas com a mesma lista: *"quem está na casa hoje à
 * noite?"* e *"quem estava na casa naquela noite?"* — e é a segunda que decide
 * o desenho. Por isso o período é escolhível, o passado se abre inteiro, e o
 * que foi retirado da escala aparece riscado, com o nome de quem retirou.
 *
 * Três coisas que ela mostra e que nenhuma lista de nomes mostraria:
 *
 *  * o TURNO SEM NINGUÉM, escrito. Dia vazio se lê como "ainda não montei";
 *    "ninguém escalado para a noite de sábado" é o que precisa ser visto antes
 *    de virar noite sem educador;
 *  * a REPETIÇÃO, que é o que torna a tela usável: montar trinta dias um a um
 *    faz a escala voltar para o papel na primeira semana. "A cada 2 dias" é o
 *    desenho de uma 12x36;
 *  * a FOLHA da parede, que sai daqui em Word.
 *
 * E uma que ela não mostra de propósito: total de plantões por pessoa. Somar
 * plantão por nome é medição de gente com outro nome (§3.3).
 */

interface Pessoa {
  id: string; userId: string; quem: string; cargo: string | null;
  /** A cor que a pessoa escolheu (0990) — a MESMA que a ATA usa (fase 123). */
  cor: string | null;
  inicio: string | null; fim: string | null; nota: string | null;
  revogadaEm: string | null; motivoRevogacao: string | null; revogadaPor: string | null;
  /** De quem é o lugar que ela ocupou, quando entrou por substituição. */
  substituiu: string | null;
}
interface Dia {
  data: string; diurno: Pessoa[]; noturno: Pessoa[];
  revogadas: Pessoa[]; semNinguem: string[];
}
interface Periodo {
  de: string; ate: string; dias: Dia[];
  turnosSemNinguem: { data: string; turno: string }[];
  aviso: string;
}
interface Membro { id: string; nome: string; cargo: string; ativo: boolean }

/** O horário dos turnos da casa (fase 159), como o servidor o devolve. */
interface Janela { de: string; ate: string }
interface Turnos {
  hoje: { diurno: Janela; noturno: Janela };
  amanha: { diurno: Janela; noturno: Janela; desde: string } | null;
  podeMudar: boolean;
  historico: { diurno: Janela; desde: string; motivo: string | null; autor: string; em: string }[];
  aviso: string;
}

/** Os dois turnos com o horário DA CASA; sem resposta, o padrão da Fundação. */
function turnosDaCasa(t: Turnos | null) {
  const h = t?.hoje;
  return [
    { cod: 'diurno' as const, label: 'Diurno',
      horas: h ? `${h.diurno.de}–${h.diurno.ate}` : HORAS_DO_TURNO.diurno },
    { cod: 'noturno' as const, label: 'Noturno',
      horas: h ? `${h.noturno.de}–${h.noturno.ate}` : HORAS_DO_TURNO.noturno },
  ];
}

/** Soma minutos a um HH:MM, para a prévia do noturno. */
function somaMinutos(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const x = ((h * 60 + m + delta) % 1440 + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
}
const diaBR = (iso: string) => iso.split('-').reverse().join('/');

const diaSemana = (iso: string) =>
  new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'short' });
const hhmm = (t: string | null) => (t ? String(t).slice(0, 5) : null);

/** Hoje no fuso da instituição — nunca `toISOString()` cru, que é UTC. */
function hojeNaCasa(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}
function somaDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00-03:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

export function Escala({ houseId, casaLabel, papel }: {
  houseId: string; casaLabel: string; papel: string;
}) {
  const hoje = hojeNaCasa();
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(somaDias(hoje, 29));
  const [dados, setDados] = useState<Periodo | null>(null);
  const [equipe, setEquipe] = useState<Membro[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [escalando, setEscalando] = useState<{ data: string; turno: string } | null>(null);
  const [retirando, setRetirando] = useState<{ p: Pessoa; data: string } | null>(null);
  /* Substituir num gesto (fase 123) — *"substituir ou deixar a menos"*. */
  const [substituindo, setSubstituindo] = useState<{ p: Pessoa; data: string } | null>(null);
  const [documento, setDocumento] = useState<DocumentoWord | null>(null);
  const [turnos, setTurnos] = useState<Turnos | null>(null);
  const TURNOS = turnosDaCasa(turnos);

  /*
   * QUEM MONTA — os três cargos que a Fundação nomeou em 15/09, mais a gestão:
   * *"pela equipe técnica, o coordenador ou o educador líder"*. O Líder Diurno
   * é quem descobre às 6h50 que alguém não veio; a técnica é quem remaneja
   * quando a coordenação está em audiência.
   */
  const monta = ['lider_diurno', 'equipe_tecnica', 'coordenador', 'gestor_geral']
    .includes(papel);

  async function carregar() {
    setErro('');
    try {
      setDados(await api<Periodo>(`/escala?houseId=${houseId}&de=${de}&ate=${ate}`));
      setTurnos(await api<Turnos>(`/houses/${houseId}/turnos`).catch(() => null));
      if (monta) {
        /* `GET /staff` devolve a LISTA crua, como o servidor a serve — e não um
           objeto com `equipe` dentro. Ler o formato errado aqui daria uma lista
           vazia sem erro nenhum, que é como a tela mente sem quebrar. */
        const eq = await api<Membro[]>('/staff').catch(() => [] as Membro[]);
        setEquipe(eq.filter((m) => m.ativo));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir a escala.');
    }
  }
  useEffect(() => { carregar(); }, [houseId, de, ate]);

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try { const r = await fn(); if (r?.aviso) setAviso(r.aviso); await carregar(); return true; }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
  }

  const passado = (d: string) => d < hoje;

  return (
    <>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok">{aviso}</div>}

      <div className="eyebrow">Escala de plantão · {casaLabel}</div>

      <div className="card stack">
        <div className="row">
          <label className="f grow" htmlFor="esc-de">
            De
            <input id="esc-de" type="date" className="field" value={de}
                   onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="f grow" htmlFor="esc-ate">
            Até
            <input id="esc-ate" type="date" className="field" value={ate}
                   onChange={(e) => setAte(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button className="btn sec grow" onClick={() => { setDe(hoje); setAte(somaDias(hoje, 29)); }}>
            Próximos 30 dias
          </button>
          <button className="btn sec grow" onClick={() => {
            /* O mês passado inteiro: é o recorte de quem está investigando um
               evento, que foi o motivo do pedido. */
            const primeiroDesteMes = `${hoje.slice(0, 7)}-01`;
            setDe(somaDias(primeiroDesteMes, -31).slice(0, 8) + '01');
            setAte(somaDias(primeiroDesteMes, -1));
          }}>
            Mês passado
          </button>
        </div>
        {dados && (
          <div className={`notice ${dados.turnosSemNinguem.length ? 'c-warn' : 'c-ok'}`}>
            {dados.aviso}
          </div>
        )}
        <button className="btn sec block" onClick={async () => {
          setErro('');
          try {
            const folha = await api<DocumentoWord>(
              `/escala/folha?houseId=${houseId}&de=${de}&ate=${ate}`);
            setDocumento(folha);
          } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível montar a folha.');
          }
        }}>
          <Icone nome="documento" /> Folha para a parede
        </button>
      </div>

      {turnos && (
        <HorarioDosTurnos houseId={houseId} turnos={turnos}
                          onMudou={async (msg) => { setAviso(msg); await carregar(); }} />
      )}

      {dados?.dias.map((d) => (
        <article className={`card stack ${d.data === hoje ? 'raise' : ''}`} key={d.data}>
          <div className="row">
            <b className="ff grow">
              {dia(d.data)} · {diaSemana(d.data)}
              {d.data === hoje ? ' · hoje' : ''}
            </b>
            {d.semNinguem.length > 0 && (
              <span className="pill c-warn">
                {d.semNinguem.length === 2 ? 'sem escala' : `${d.semNinguem[0]} sem ninguém`}
              </span>
            )}
          </div>

          {TURNOS.map(({ cod, label, horas }) => {
            const gente = d[cod];
            return (
              <div className="bloco" key={cod}>
                <small>{label} <span className="mutetxt">{horas}</span></small>
                {gente.length === 0 ? (
                  <div className="mutetxt">— ninguém escalado —</div>
                ) : (
                  <ul className="lista">
                    {gente.map((p) => (
                      /*
                       * A COR DA PESSOA na borda da linha, e o nome escrito ao
                       * lado — a mesma regra da ATA (0990): tinta na borda,
                       * nunca no texto, e a cor é apoio. A folha da parede sai
                       * na impressora em preto e branco, e continua legível
                       * porque o nome nunca dependeu da cor.
                       */
                      <li key={p.id} className={`row linha-ata ${tomDoAutor(p.userId, p.cor)}`}>
                        {/*
                          * O CÍRCULO É DO CARGO, a borda é da PESSOA (fase 151).
                          *
                          * São duas perguntas e por isso são duas marcas: a borda
                          * responde *"qual colega é este"* — e a coordenação
                          * escolhe a cor dela, para dois educadores do mesmo
                          * plantão não caírem no mesmo tom (0990) —, e o círculo
                          * responde *"há técnica neste turno?"*, que é o que se
                          * pergunta olhando a escala da semana de longe.
                          */}
                        <Cargo nome={p.quem} cargo={p.cargo} />
                        <div className="grow">
                          <b className="ff">{p.quem}</b>
                          <div className="mutetxt linhadois">
                            {rotuloCargo(p.cargo ?? '')}
                            {hhmm(p.inicio) ? ` · ${hhmm(p.inicio)}–${hhmm(p.fim)}` : ''}
                          </div>
                          {/* De quem é o lugar. Sem esta linha, a escala mostra
                              uma revogação e uma escalação no mesmo turno e
                              deixa a coincidência para quem lê deduzir. */}
                          {p.substituiu && (
                            <div className="mutetxt">entrou no lugar de {p.substituiu}</div>
                          )}
                          {p.nota && <div className="mutetxt">{p.nota}</div>}
                        </div>
                        {monta && (
                          <div className="acoes">
                            <button className="btn sec sm"
                                    onClick={() => setSubstituindo({ p, data: d.data })}>
                              Substituir
                            </button>
                            <button className="btn sec sm"
                                    onClick={() => setRetirando({ p, data: d.data })}>
                              Retirar
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {monta && (
                  <button className="btn sec sm" style={{ marginTop: 6 }}
                          onClick={() => setEscalando({ data: d.data, turno: cod })}>
                    Escalar alguém
                  </button>
                )}
              </div>
            );
          })}

          {/* O que saiu da escala não some: é o que responde "quem estava
              escalado naquela noite?" meses depois. */}
          {d.revogadas.length > 0 && (
            <div className="bloco">
              <small>Retirados da escala</small>
              <ul className="lista">
                {d.revogadas.map((p) => (
                  <li key={p.id}>
                    <span className="mutetxt" style={{ textDecoration: 'line-through' }}>{p.quem}</span>
                    <div className="mutetxt">
                      retirado por {p.revogadaPor}
                      {p.motivoRevogacao ? ` — ${p.motivoRevogacao}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      ))}

      {escalando && (
        <FolhaEscalar
          equipe={equipe}
          data={escalando.data}
          turno={escalando.turno}
          passado={passado(escalando.data)}
          onFechar={() => setEscalando(null)}
          onEscalar={async (corpo) => {
            const ok = await acao(() => api('/escala', {
              method: 'POST',
              body: JSON.stringify({ houseId, ...corpo, data: escalando.data, turno: escalando.turno }),
            }));
            if (ok) setEscalando(null);
          }} />
      )}

      {retirando && (
        <FolhaRetirar
          pessoa={retirando.p}
          jaPassou={passado(retirando.data)}
          onFechar={() => setRetirando(null)}
          onRetirar={async (motivo) => {
            const ok = await acao(() => api(`/escala/${retirando.p.id}/revogar`, {
              method: 'POST', body: JSON.stringify({ motivo }),
            }));
            if (ok) setRetirando(null);
          }} />
      )}

      {substituindo && (
        <FolhaSubstituir
          pessoa={substituindo.p}
          equipe={equipe.filter((m) => m.id !== substituindo.p.userId)}
          jaPassou={passado(substituindo.data)}
          onFechar={() => setSubstituindo(null)}
          onSubstituir={async (novoUserId, motivo) => {
            const ok = await acao(() => api(`/escala/${substituindo.p.id}/substituir`, {
              method: 'POST', body: JSON.stringify({ novoUserId, motivo }),
            }));
            if (ok) setSubstituindo(null);
          }} />
      )}

      {documento && (
        <FolhaDocumento doc={documento} onFechar={() => setDocumento(null)}
          exportar={async (finalidade: string): Promise<ArquivoGerado> =>
            api<ArquivoGerado>('/escala/export', {
              method: 'POST',
              body: JSON.stringify({ houseId, de, ate, finalidade }),
            })} />
      )}
    </>
  );
}

/**
 * A folha de escalar.
 *
 * A repetição vem DESLIGADA e com o passo em 2 quando ligada: 2 é a 12x36, que
 * é como a Fundação trabalha. O campo "até" só aparece com a repetição ligada —
 * uma data de fim sozinha na tela faz a pessoa achar que está escalando um
 * período inteiro quando escalou um dia.
 */
function FolhaEscalar({ equipe, data, turno, passado, onFechar, onEscalar }: {
  equipe: Membro[]; data: string; turno: string; passado: boolean;
  onFechar: () => void;
  onEscalar: (c: { userId: string; inicio?: string; fim?: string; nota?: string;
                   repetirACada?: number; ate?: string }) => void;
}) {
  const [userId, setUserId] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [nota, setNota] = useState('');
  const [repetir, setRepetir] = useState(false);
  const [passo, setPasso] = useState(2);
  const [ate, setAte] = useState(somaDias(data, 30));
  const pode = !!userId && (!repetir || (ate > data));

  return (
    <div className="folha" role="dialog" aria-modal="true" aria-labelledby="t-esc">
      <div className="folha-corpo stack">
        <h3 id="t-esc">
          Escalar para {dia(data)} · plantão {turno}
        </h3>
        {passado && (
          <div className="notice c-warn">
            Este dia já passou. Escalar aqui é registrar quem esteve na casa — o que fica
            gravado com o seu nome e o horário.
          </div>
        )}

        <label className="f" htmlFor="esc-quem">Quem</label>
        <select id="esc-quem" className="field" value={userId}
                onChange={(e) => setUserId(e.target.value)}>
          <option value="">Escolha alguém da equipe</option>
          {equipe.map((m) => (
            <option key={m.id} value={m.id}>{m.nome} — {rotuloCargo(m.cargo)}</option>
          ))}
        </select>

        <div className="row">
          <label className="f grow" htmlFor="esc-ini">
            Entra às <small>— opcional</small>
            <input id="esc-ini" type="time" className="field" value={inicio}
                   onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label className="f grow" htmlFor="esc-fim">
            Sai às <small>— opcional</small>
            <input id="esc-fim" type="time" className="field" value={fim}
                   onChange={(e) => setFim(e.target.value)} />
          </label>
        </div>
        <p className="mutetxt">
          Em branco, vale o horário do turno. Preencha quando alguém cobrir só parte dele.
        </p>

        <label className="f" htmlFor="esc-nota">Observação <small>— opcional</small></label>
        <input id="esc-nota" className="field" value={nota} maxLength={120}
               onChange={(e) => setNota(e.target.value)}
               placeholder="Ex.: cobrindo a folga da Joana." />

        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} />
          <span>Repetir este plantão</span>
        </label>

        {repetir && (
          <>
            <div className="row">
              <label className="f grow" htmlFor="esc-passo">
                A cada
                <select id="esc-passo" className="field" value={passo}
                        onChange={(e) => setPasso(Number(e.target.value))}>
                  <option value={1}>1 dia</option>
                  <option value={2}>2 dias — 12x36</option>
                  <option value={3}>3 dias</option>
                  <option value={4}>4 dias</option>
                  <option value={7}>7 dias — sempre no mesmo dia da semana</option>
                </select>
              </label>
              <label className="f grow" htmlFor="esc-ate">
                Até
                <input id="esc-ate" type="date" className="field" value={ate}
                       onChange={(e) => setAte(e.target.value)} />
              </label>
            </div>
            <p className="mutetxt">
              Escalar de novo em cima do que já existe não duplica: os dias que já têm esta
              pessoa neste turno ficam como estão.
            </p>
          </>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onEscalar({
            userId,
            inicio: inicio || undefined, fim: fim || undefined,
            nota: nota.trim() || undefined,
            repetirACada: repetir ? passo : undefined,
            ate: repetir ? ate : undefined,
          })}>
            Escalar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DE SUBSTITUIR (fase 123) — *"substituir ou deixar a menos"*.
 *
 * Eram dois atos: Retirar, e depois Escalar outra pessoa. Entre um e outro o
 * turno ficava vazio na tela de quem estivesse olhando, e os dois não se
 * sabiam parentes — três meses depois a escala mostrava uma revogação e uma
 * escalação no mesmo dia, sem relação nenhuma entre si.
 *
 * *"Deixar a menos" continua existindo:* o botão Retirar não saiu do lado. Uma
 * casa pode mesmo passar o turno com uma pessoa a menos, e transformar toda
 * retirada numa substituição obrigatória seria o sistema cobrando da casa uma
 * pessoa que ela não tem.
 */
function FolhaSubstituir({ pessoa, equipe, jaPassou, onFechar, onSubstituir }: {
  pessoa: Pessoa; equipe: Membro[]; jaPassou: boolean;
  onFechar: () => void; onSubstituir: (novoUserId: string, motivo: string) => void;
}) {
  const [novo, setNovo] = useState('');
  const [motivo, setMotivo] = useState('');
  /* Motivo obrigatório também aqui, desde a 144: "a Joana entrou no lugar" não
     explica por que a Marta saiu — e deixar só a substituição sem a frase faria
     quem não quisesse escrever substituir em vez de retirar. */
  const pode = !!novo && motivo.trim().length >= 10;
  return (
    <div className="folha" role="dialog" aria-modal="true" aria-labelledby="t-sub">
      <div className="folha-corpo stack">
        <h3 id="t-sub">Substituir {pessoa.quem}</h3>
        <p className="mutetxt" style={{ marginTop: 0 }}>
          Quem entrar assume o mesmo dia, o mesmo turno e o mesmo horário. A linha de{' '}
          {pessoa.quem} continua registrada, retirada e com o seu nome — é ela que responde,
          meses depois, quem estava escalado naquela noite.
        </p>

        <label className="f" htmlFor="sub-quem">Quem entra no lugar</label>
        <select id="sub-quem" value={novo} onChange={(e) => setNovo(e.target.value)}>
          <option value="">Escolha…</option>
          {equipe.map((m) => (
            <option key={m.id} value={m.id}>{m.nome} — {rotuloCargo(m.cargo)}</option>
          ))}
        </select>

        <label className="f" htmlFor="sub-motivo">Motivo</label>
        <div className={`notice ${jaPassou ? 'c-warn' : 'c-info'}`} role="status">
          {jaPassou
            ? 'Este plantão já passou. Substituir alguém nele muda a resposta de "quem estava '
              + 'na casa naquela noite" — escreva por quê.'
            : 'Escreva por que esta troca acontece. Quem sai vai perguntar, e é esta frase que '
              + 'responde — o parentesco entre as duas linhas o sistema já guarda sozinho.'}
        </div>
        <textarea id="sub-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: atestado médico; troca combinada com a equipe." />

        <div className="row">
          <button className="btn grow" disabled={!pode}
                  onClick={() => onSubstituir(novo, motivo.trim())}>
            Substituir
          </button>
          <button className="btn ghost" onClick={onFechar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DE RETIRAR.
 *
 * O MOTIVO É OBRIGATÓRIO SEMPRE desde a fase 144 — decisão da Fundação em 22/09,
 * respondendo à pergunta que a conferência daquele dia abriu. Até aqui só o
 * plantão JÁ PASSADO exigia, com o argumento da 1310: *"mudar o futuro é
 * organização; mudar o passado é dizer que a pessoa não estava lá"*. O argumento
 * continua correto sobre o histórico, e não era o único em jogo: quem pergunta
 * *"por que eu fui tirado do plantão de sábado?"* pergunta na segunda, sobre um
 * plantão que era futuro quando a mudança foi feita.
 *
 * `jaPassou` deixou de decidir SE o motivo é exigido e passou a decidir QUAL
 * frase aparece — porque o motivo é outro nos dois casos, e uma frase só
 * explicaria mal os dois.
 */
function FolhaRetirar({ pessoa, jaPassou, onFechar, onRetirar }: {
  pessoa: Pessoa; jaPassou: boolean;
  onFechar: () => void; onRetirar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const pode = motivo.trim().length >= 10;
  return (
    <div className="folha" role="dialog" aria-modal="true" aria-labelledby="t-ret">
      <div className="folha-corpo stack">
        <h3 id="t-ret">Retirar {pessoa.quem} da escala</h3>
        <div className={`notice ${jaPassou ? 'c-warn' : 'c-info'}`}>
          {jaPassou
            ? 'Este plantão já passou. Retirar alguém dele muda a resposta de "quem estava na '
              + 'casa naquela noite" — escreva por quê.'
            : 'A linha não é apagada: ela fica registrada como retirada, com o seu nome e o '
              + 'horário. Escreva por que esta pessoa sai — ela vai perguntar, e é esta frase '
              + 'que responde.'}
        </div>
        <label className="f" htmlFor="ret-motivo">Motivo</label>
        <input id="ret-motivo" className="field" value={motivo} maxLength={200}
               onChange={(e) => setMotivo(e.target.value)}
               placeholder="Ex.: trocou o plantão com a Tainá." />
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onRetirar(motivo.trim())}>
            Retirar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * O HORÁRIO DOS TURNOS DA CASA (fase 159) — pedido da Fundação em 26/09.
 *
 * Quem muda: coordenação, Líder Diurno e equipe técnica da casa. A casa diz o
 * DIURNO; o noturno é o resto do dia, e a tela mostra como ele fica antes de
 * gravar — é a conta que evita buraco e sobreposição. A mudança vale a partir
 * de amanhã, e a tela diz isso duas vezes: no formulário e no aviso de "amanhã
 * muda", que fica até o dia virar.
 */
function HorarioDosTurnos({ houseId, turnos, onMudou }: {
  houseId: string; turnos: Turnos; onMudou: (aviso: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [de, setDe] = useState(turnos.hoje.diurno.de);
  const [ate, setAte] = useState(turnos.hoje.diurno.ate);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const valido = !!de && !!ate && de > '00:00' && de < ate && ate < '23:59';

  async function salvar() {
    setErro(''); setSalvando(true);
    try {
      const r = await api<{ aviso: string }>(`/houses/${houseId}/turnos`, {
        method: 'POST', body: JSON.stringify({ diurnoDe: de, diurnoAte: ate, motivo: motivo.trim() || undefined }),
      });
      setEditando(false); setMotivo('');
      onMudou(r.aviso);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar o horário.');
    } finally { setSalvando(false); }
  }

  return (
    <section className="card stack" aria-labelledby="h-turnos">
      <h3 id="h-turnos" style={{ margin: 0 }}><Icone nome="agenda" /> Horário dos turnos</h3>
      <p style={{ margin: 0 }}>
        Diurno das <strong>{turnos.hoje.diurno.de}</strong> às <strong>{turnos.hoje.diurno.ate}</strong>
        {' · '}Noturno das <strong>{turnos.hoje.noturno.de}</strong> às <strong>{turnos.hoje.noturno.ate}</strong>
      </p>
      {turnos.amanha && (
        <div className="notice c-warn" role="status">
          A partir de {diaBR(turnos.amanha.desde)}: diurno das {turnos.amanha.diurno.de} às{' '}
          {turnos.amanha.diurno.ate}, noturno das {turnos.amanha.noturno.de} às {turnos.amanha.noturno.ate}.
        </div>
      )}

      {turnos.podeMudar && !editando && (
        <button className="btn sec block" onClick={() => { setEditando(true); setErro(''); }}>
          Mudar o horário dos turnos
        </button>
      )}

      {editando && (
        <div className="stack">
          <p className="mutetxt" style={{ margin: 0 }}>{turnos.aviso}</p>
          <div className="row">
            <label className="f grow" htmlFor="turno-de">
              O diurno começa às
              <input id="turno-de" type="time" className="field" value={de}
                     onChange={(e) => setDe(e.target.value)} />
            </label>
            <label className="f grow" htmlFor="turno-ate">
              e termina às
              <input id="turno-ate" type="time" className="field" value={ate}
                     onChange={(e) => setAte(e.target.value)} />
            </label>
          </div>
          {valido ? (
            <p style={{ margin: 0 }}>
              O noturno fica das <strong>{somaMinutos(ate, 1)}</strong> às <strong>{somaMinutos(de, -1)}</strong>.
            </p>
          ) : (
            <div className="notice c-warn" role="alert">
              O diurno precisa começar antes de terminar, depois da meia-noite e antes das 23:59.
            </div>
          )}
          <label className="f" htmlFor="turno-motivo">
            Motivo (opcional)
            <input id="turno-motivo" className="field" value={motivo}
                   onChange={(e) => setMotivo(e.target.value)}
                   placeholder="Ex.: a troca de equipe desta casa é às 7h" />
          </label>
          {erro && <div className="notice c-crit" role="alert">{erro}</div>}
          <div className="row">
            <button className="btn grow" disabled={!valido || salvando} onClick={salvar}>
              Gravar — vale a partir de amanhã
            </button>
            <button className="btn sec grow" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {turnos.historico.length > 0 && (
        <details>
          <summary>Quem mudou o horário ({turnos.historico.length})</summary>
          <ul>
            {turnos.historico.map((h, i) => (
              <li key={i}>
                Diurno {h.diurno.de}–{h.diurno.ate}, a partir de {diaBR(h.desde)} — {h.autor}
                {h.motivo ? ` · ${h.motivo}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
