import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * A ROTINA DA CASA (§8.1).
 *
 * Três rotas existiam desde a fase 2 e nenhuma tela as chamava. O dia da casa
 * nascia de dados semeados: a linha do tempo do turno mostrava atividades que
 * ninguém tinha escrito, e a pergunta "a que horas é a janta aqui?" não tinha
 * resposta dentro do sistema — tinha no papel colado na parede da cozinha.
 *
 * O que esta tela faz de propósito, e que uma tela de "configuração" não faria:
 *
 *  * **alterar não reescreve.** Mudar a rotina abre uma VERSÃO NOVA, com o
 *    motivo escrito, e copia os itens. A versão anterior continua inteira: é
 *    ela que explica por que o dia de dois meses atrás foi daquele jeito, e
 *    sem ela o registro antigo vira uma lista de horários que não batem com
 *    nada;
 *  * **quem lê não é quem altera.** A casa inteira precisa saber a que horas é
 *    o banho; mudar o molde é da equipe técnica e da coordenação. O turno não
 *    altera o planejamento regular — o que ele pode criar é atividade urgente
 *    e pontual, que vive na tela do Dia;
 *  * **o histórico fica à vista, e não escondido num menu.** Ver que a rotina
 *    mudou três vezes desde março, e por quê, é metade da informação.
 *
 * O vocabulário — tipos de item e dias da semana — vem do SERVIDOR. O enum
 * `routine_kind` é do banco, e uma segunda lista escrita aqui divergiria na
 * primeira correção.
 */

interface ItemRotina {
  id: string; tipo: string; titulo: string;
  inicio: string; fim: string | null;
  diasSemana: number[]; coletiva: boolean;
  acolhido: { id: string; nome: string; visivel: boolean } | null;
  instrucoes: string | null; transporte: string | null;
  prioridade: number; exigeCiencia: boolean;
}
interface Rotina {
  versao: { id: string; numero: number; vigenteDesde: string; nota: string | null } | null;
  itens: ItemRotina[];
  tipos: { code: string; label: string }[];
  dias: { n: number; curto: string; label: string }[];
  podeAlterar: boolean;
  aviso: string;
}
interface VersaoAntiga {
  numero: number; vigenteDesde: string; vigenteAte: string | null;
  nota: string | null; atual: boolean;
}
interface AcolhidoDaCasa { id: string; nome: string; }

/** Cor por TIPO de item — categoria da atividade, nunca juízo sobre a casa. */
const TOM: Record<string, string> = {
  acordar: 'c-warn', higiene: 'c-move', refeicao: 'c-ok', escola: 'c-info',
  curso: 'c-info', contraturno: 'c-info', esporte: 'c-ok', lazer: 'c-other',
  educacao: 'c-info', medicamento: 'c-med', banho: 'c-move', sono: 'c-brand',
  saude: 'c-med', outro: 'c-mute',
};

const data = (iso: string | null) => (iso
  ? new Date(`${String(iso).slice(0, 10)}T12:00:00-03:00`).toLocaleDateString('pt-BR',
      { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
  : '—');

export function Rotina({ houseId, papel }: { houseId: string; papel: string }) {
  const [rotina, setRotina] = useState<Rotina | null>(null);
  const [historico, setHistorico] = useState<VersaoAntiga[]>([]);
  const [acolhidos, setAcolhidos] = useState<AcolhidoDaCasa[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [aba, setAba] = useState<'hoje' | 'historico'>('hoje');
  const [abrindoVersao, setAbrindoVersao] = useState(false);
  const [adicionando, setAdicionando] = useState(false);

  async function carregar() {
    setErro('');
    try {
      const [r, h, gente] = await Promise.all([
        api<Rotina>(`/routine?houseId=${houseId}`),
        api<VersaoAntiga[]>(`/routine/history?houseId=${houseId}`).catch(() => [] as VersaoAntiga[]),
        api<AcolhidoDaCasa[]>(`/people?houseId=${houseId}`).catch(() => [] as AcolhidoDaCasa[]),
      ]);
      setRotina(r); setHistorico(h); setAcolhidos(gente);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a rotina.');
    }
  }
  useEffect(() => { carregar(); }, [houseId]);

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

  const pode = rotina?.podeAlterar ?? false;
  const rotulo = (t: string) => rotina?.tipos.find((x) => x.code === t)?.label ?? t;
  /** "todos os dias" quando são os sete — a lista completa não informa nada. */
  const dias = (ds: number[]) => {
    if (!rotina || ds.length >= 7) return 'todos os dias';
    return ds.map((n) => rotina.dias.find((d) => d.n === n)?.curto ?? n).join(', ');
  };

  return (
    <>
      <div className="diahead">
        <div><h2>A rotina da casa</h2></div>
        {rotina?.versao && (
          <div className="resumo">
            <span className="pill c-brand">Versão {rotina.versao.numero}</span>
            <span className="pill c-mute">desde {data(rotina.versao.vigenteDesde)}</span>
          </div>
        )}
      </div>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      <div className="filtros" role="tablist" aria-label="Rotina">
        <button role="tab" aria-selected={aba === 'hoje'} className={aba === 'hoje' ? 'on' : ''}
                onClick={() => setAba('hoje')}>O molde de agora</button>
        <button role="tab" aria-selected={aba === 'historico'} className={aba === 'historico' ? 'on' : ''}
                onClick={() => setAba('historico')}>Como já foi</button>
      </div>

      {aba === 'hoje' && rotina && (
        <div className="card raise stack">
          <div className="notice c-info">{rotina.aviso}</div>

          {rotina.versao?.nota && (
            <div className="bloco destaque">
              <small>Por que esta versão existe</small>
              {rotina.versao.nota}
            </div>
          )}

          {rotina.itens.length === 0 && (
            <p className="mutetxt" style={{ margin: 0 }}>
              Nenhum item nesta versão. {pode
                ? 'Comece pelo que a casa faz todo dia: acordar, café, escola, almoço, banho, janta, dormir.'
                : 'Quem escreve o molde é a equipe técnica ou a coordenação.'}
            </p>
          )}

          <ul className="linha">
            {rotina.itens.map((i) => (
              <li key={i.id} className="ev">
                <span className="hora">{i.inicio}</span>
                <div className="corpo">
                  <div className="row">
                    <b className="ff grow">{i.titulo}</b>
                    <span className={`pill ${TOM[i.tipo] ?? 'c-mute'}`}>{rotulo(i.tipo)}</span>
                  </div>
                  <div className="mutetxt">
                    {i.fim ? `${i.inicio}–${i.fim}` : i.inicio} · {dias(i.diasSemana)}
                    {/* Individual diz DE QUEM. Um item sem nome numa rotina de
                        vinte crianças é um item que ninguém cumpre. */}
                    {!i.coletiva && (
                      <> · {i.acolhido?.visivel ? i.acolhido.nome : 'acolhido fora do seu alcance'}</>
                    )}
                  </div>
                  {i.instrucoes && <div className="mutetxt">{i.instrucoes}</div>}
                  {i.transporte && <div className="mutetxt">Transporte: {i.transporte}</div>}
                  {i.exigeCiencia && (
                    <span className="pill c-warn">Exige ciência de quem conduz</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {pode && rotina.versao && (
            <button className="btn sec block" onClick={() => setAdicionando(true)}>
              + Acrescentar item a esta versão
            </button>
          )}
          {pode && (
            <button className="btn block" onClick={() => setAbrindoVersao(true)}>
              {rotina.versao ? 'Abrir uma versão nova' : 'Escrever a primeira rotina'}
            </button>
          )}
          {!pode && (
            <p className="mutetxt" style={{ marginBottom: 0 }}>
              Alterar a rotina é da equipe técnica e da coordenação. O que o turno cria — a
              atividade que apareceu agora — entra pelo Dia, e não muda o molde da casa.
            </p>
          )}
        </div>
      )}

      {aba === 'historico' && (
        <div className="card raise stack">
          <p className="mutetxt" style={{ margin: 0 }}>
            Cada versão continua inteira depois de encerrada. Não é histórico de auditoria:
            é o molde que a casa realmente seguiu naquele período, e é ele que explica o
            registro daquela época.
          </p>
          {historico.length === 0 && (
            <p className="mutetxt" style={{ margin: 0 }}>Esta casa ainda não tem versão de rotina.</p>
          )}
          <ul className="lista">
            {historico.map((v) => (
              <li key={v.numero} className="row">
                <div className="grow">
                  <b className="ff">Versão {v.numero}</b>
                  <div className="mutetxt linhadois">
                    {data(v.vigenteDesde)} — {v.vigenteAte ? data(v.vigenteAte) : 'em vigor'}
                  </div>
                  {v.nota && <div className="mutetxt">{v.nota}</div>}
                </div>
                <span className={`pill ${v.atual ? 'c-ok' : 'c-mute'}`}>
                  {v.atual ? 'Em vigor' : 'Encerrada'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {abrindoVersao && (
        <FolhaVersao
          primeira={!rotina?.versao}
          onFechar={() => setAbrindoVersao(false)}
          onEnviar={async (motivo) => {
            const ok = await acao(() => api('/routine/versions', {
              method: 'POST', body: JSON.stringify({ houseId, motivo }) }));
            if (ok) { setAbrindoVersao(false); setAviso('Versão nova aberta. A anterior continua consultável em "Como já foi".'); }
          }} />
      )}

      {adicionando && rotina?.versao && (
        <FolhaItem
          tipos={rotina.tipos} dias={rotina.dias} acolhidos={acolhidos}
          onFechar={() => setAdicionando(false)}
          onEnviar={async (dados) => {
            const ok = await acao(() => api(`/routine/versions/${rotina.versao!.id}/items`, {
              method: 'POST', body: JSON.stringify({ houseId, ...dados }) }));
            if (ok) setAdicionando(false);
          }} />
      )}

      {/* O cargo aparece só para explicar por que o botão não está aí. */}
      {!pode && papel === 'educador' && aba === 'hoje' && (
        <p className="mutetxt">
          Se a rotina escrita não é a que a casa pratica, avise a coordenação: corrigir o molde
          é o que faz o dia nascer certo amanhã.
        </p>
      )}
    </>
  );
}

/**
 * A FOLHA DA VERSÃO NOVA.
 *
 * O motivo é obrigatório e não é burocracia: daqui a um ano, "versão 4" sem
 * motivo não explica nada, e quem for ler o registro de abril precisa saber
 * que a escola mudou de turno em março.
 */
function FolhaVersao({ primeira, onFechar, onEnviar }: {
  primeira: boolean; onFechar: () => void; onEnviar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const pode = motivo.trim().length >= 10;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-ver"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-ver">{primeira ? 'Escrever a primeira rotina' : 'Abrir uma versão nova'}</h3>
        <div className="notice c-info">
          {primeira
            ? 'A primeira versão nasce vazia; os itens entram um a um depois. Nada do que já foi '
              + 'registrado na casa muda por causa disso.'
            : 'A versão nova COPIA os itens da atual, e a atual é encerrada com a data de hoje. '
              + 'Nada é apagado: a anterior continua explicando o dia que nasceu dela.'}
        </div>
        <label className="f" htmlFor="ver-txt">
          Por que a rotina está mudando <small>— pelo menos 10 caracteres</small>
        </label>
        <textarea id="ver-txt" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: a escola passou os cinco maiores para o turno da tarde a partir deste mês." />
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onEnviar(motivo.trim())}>
            {primeira ? 'Criar a primeira versão' : 'Abrir versão nova'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DO ITEM.
 *
 * "Coletiva" é o padrão porque quase tudo o que a casa faz é da casa toda:
 * acordar, refeição, banho, dormir. O item individual — a fono da terça, o
 * curso do Igor — pede o nome, e o servidor recusa item individual sem
 * acolhido. Os dias começam todos marcados pela mesma razão.
 */
function FolhaItem({ tipos, dias, acolhidos, onFechar, onEnviar }: {
  tipos: { code: string; label: string }[];
  dias: { n: number; curto: string; label: string }[];
  acolhidos: AcolhidoDaCasa[];
  onFechar: () => void;
  onEnviar: (dados: {
    kind: string; title: string; startTime: string; endTime?: string;
    weekdays: number[]; collective: boolean; personId?: string; instructions?: string;
  }) => void;
}) {
  const [tipo, setTipo] = useState('');
  const [titulo, setTitulo] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [semana, setSemana] = useState<number[]>(dias.map((d) => d.n));
  const [coletiva, setColetiva] = useState(true);
  const [pessoa, setPessoa] = useState('');
  const [instrucoes, setInstrucoes] = useState('');

  const alterna = (n: number) => setSemana(
    (s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n].sort()));

  const pode = tipo !== '' && titulo.trim().length >= 3
    && /^\d{2}:\d{2}$/.test(inicio) && semana.length > 0
    && (coletiva || pessoa !== '');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-item"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-item">Acrescentar item à rotina</h3>

        <label className="f">O que é</label>
        <div className="opts">
          {tipos.map((t) => (
            <button type="button" key={t.code} className="opt c-info"
                    aria-pressed={tipo === t.code} onClick={() => setTipo(t.code)}>
              {t.label}
            </button>
          ))}
        </div>

        <label className="f" htmlFor="it-titulo">
          Como se chama <small>— é o que a educadora lê na linha do dia</small>
        </label>
        <input id="it-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)}
               placeholder="Ex.: Janta" />

        <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div className="grow">
            <label className="f" htmlFor="it-inicio">Começa</label>
            <input id="it-inicio" type="time" value={inicio}
                   onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="grow">
            <label className="f" htmlFor="it-fim">Termina <small>— opcional</small></label>
            <input id="it-fim" type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>

        <label className="f">Em quais dias</label>
        <div className="opts">
          {dias.map((d) => (
            <button type="button" key={d.n} className="opt c-move"
                    aria-pressed={semana.includes(d.n)} onClick={() => alterna(d.n)}>
              {d.curto}
            </button>
          ))}
        </div>

        <label className="f">De quem</label>
        <div className="opts">
          <button type="button" className="opt c-ok" aria-pressed={coletiva}
                  onClick={() => setColetiva(true)}>Da casa toda</button>
          <button type="button" className="opt c-other" aria-pressed={!coletiva}
                  onClick={() => setColetiva(false)}>De um acolhido</button>
        </div>
        {!coletiva && (
          <>
            <label className="f" htmlFor="it-quem">Acolhido</label>
            <select id="it-quem" value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
              <option value="">Escolha…</option>
              {acolhidos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            <p className="mutetxt">
              Item individual nasce exigindo ciência de quem conduz: ele é de uma criança,
              e alguém precisa dizer que assumiu.
            </p>
          </>
        )}

        <label className="f" htmlFor="it-instr">
          Como se faz <small>— opcional, e é o que evita a pergunta às 23h</small>
        </label>
        <textarea id="it-instr" value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)}
                  placeholder="Ex.: os menores jantam primeiro; a mesa é posta pelos maiores em escala." />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode} onClick={() => onEnviar({
            kind: tipo, title: titulo.trim(), startTime: inicio,
            endTime: fim || undefined, weekdays: semana, collective: coletiva,
            personId: coletiva ? undefined : pessoa,
            instructions: instrucoes.trim() || undefined,
          })}>
            Acrescentar
          </button>
        </div>
      </div>
    </div>
  );
}
