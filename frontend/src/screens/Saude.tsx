import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * SAÚDE — MEDICAMENTOS E ENFERMAGEM.
 *
 * Três coisas que esta tela faz de propósito:
 *
 *  * a dose é confirmada UMA A UMA, por acolhido, por quem administrou. Não
 *    existe "marcar todas": marcação em lote é assinatura em branco;
 *  * dose que passou da hora aparece como "sem confirmação", nunca como "não
 *    administrada" — a segunda frase é uma conclusão, e conclusão é de gente;
 *  * a triagem só a Enfermagem assina. A coordenação cobra a pendência e vê a
 *    fila, mas não assina no lugar dela.
 */

interface Dose {
  id: string; horario: string; medicamento: string; dose: string; via: string;
  tipo: string; condicaoUso: string | null; estado: string; rotulo: string;
  pendente: boolean; confirmadaPor: string | null; acolhido: string; alerta: string | null;
}
interface Painel {
  data: string;
  resumo: { administradas: number; aguardando: number; triagensPendentes: number; estoqueBaixo: number };
  doses: Dose[];
  acolhidos: { id: string; nome: string; idade: number; alerta: string | null;
               cuidado: string | null; doses: number }[];
}
interface Item {
  id: string; medicamento: string; unidade: string; quantidade: number; minimo: number;
  validade: string; conferidoPor: string;
  ultimoMovimento: { tipo: 'entrada' | 'ajuste'; quantidade: number; motivo: string | null;
                     por: string; em: string } | null;
}
interface Evolucao {
  id: string; acolhido: string; tipo: string; enviadaPor: string; enviadaEm: string;
  resumo: string; assinada: boolean; assinadaPor: string | null; complemento: string | null;
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('pt-BR',
  { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/** O tom fala do ESTADO da dose, nunca do acolhido. */
const TOM_DOSE: Record<string, string> = {
  administrada: 'c-ok', registrada: 'c-info', aguardando_confirmacao: 'c-warn',
};

const RESULTADOS: { cod: string; label: string; tom: string; exigeObs: boolean }[] = [
  { cod: 'administrada_no_horario', label: 'Administrada no horário', tom: 'c-ok', exigeObs: false },
  { cod: 'administrada_com_atraso', label: 'Administrada com atraso', tom: 'c-warn', exigeObs: true },
  { cod: 'recusada', label: 'Recusada pelo acolhido', tom: 'c-crit', exigeObs: true },
  { cod: 'indisponivel', label: 'Medicamento indisponível', tom: 'c-other', exigeObs: true },
  { cod: 'acolhido_ausente', label: 'Acolhido ausente', tom: 'c-move', exigeObs: true },
  { cod: 'incidente', label: 'Incidente', tom: 'c-crit', exigeObs: true },
];

const FINALIDADES = ['Consulta', 'Exame', 'Urgência ou emergência', 'Internação',
  'Transferência assistencial'];

export function Saude({ papel }: { papel: string }) {
  const [aba, setAba] = useState<'doses' | 'triagem' | 'estoque' | 'resumo'>('doses');
  const [painel, setPainel] = useState<Painel | null>(null);
  const [estoque, setEstoque] = useState<Item[]>([]);
  const [triagem, setTriagem] = useState<Evolucao[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [confirmando, setConfirmando] = useState<Dose | null>(null);
  const [triando, setTriando] = useState<Evolucao | null>(null);
  const [resumindo, setResumindo] = useState<{ id: string; nome: string } | null>(null);
  const [movendo, setMovendo] = useState<{ item: Item; tipo: 'entrada' | 'contagem' } | null>(null);

  async function carregar() {
    setErro('');
    try {
      const [p, e, t] = await Promise.all([
        api<Painel>('/health/panel'),
        api<Item[]>('/health/stock'),
        api<Evolucao[]>('/health/triage'),
      ]);
      setPainel(p); setEstoque(e); setTriagem(t);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a saúde da casa.');
    }
  }
  useEffect(() => { carregar(); }, []);

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try { const r = await fn(); if (r?.aviso) setAviso(r.aviso); await carregar(); return true; }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
  }

  const enfermagem = papel === 'enfermagem';
  /** Quem mexe no armário — o mesmo alcance do servidor. O educador vê e não mexe. */
  const movimenta = ['enfermagem', 'equipe_tecnica', 'coordenador', 'gestor_geral'].includes(papel);

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

      {painel && (
        <div className="painel">
          <div className="tile c-ok"><b>{painel.resumo.administradas}</b><span>Doses confirmadas hoje</span></div>
          <div className="tile c-warn"><b>{painel.resumo.aguardando}</b><span>Aguardando confirmação</span></div>
          <div className="tile c-med"><b>{painel.resumo.triagensPendentes}</b><span>Evoluções na triagem</span></div>
          <div className="tile c-info"><b>{painel.resumo.estoqueBaixo}</b><span>Itens abaixo do mínimo</span></div>
        </div>
      )}

      <div className="filtros" role="tablist" aria-label="Seções da saúde">
        <button role="tab" aria-selected={aba === 'doses'} className={aba === 'doses' ? 'on' : ''}
                onClick={() => setAba('doses')}>Doses do dia</button>
        <button role="tab" aria-selected={aba === 'triagem'} className={aba === 'triagem' ? 'on' : ''}
                onClick={() => setAba('triagem')}>Triagem</button>
        <button role="tab" aria-selected={aba === 'estoque'} className={aba === 'estoque' ? 'on' : ''}
                onClick={() => setAba('estoque')}>Estoque</button>
        <button role="tab" aria-selected={aba === 'resumo'} className={aba === 'resumo' ? 'on' : ''}
                onClick={() => setAba('resumo')}>Resumo de saúde</button>
      </div>

      {aba === 'doses' && painel && (
        <>
          <div className="notice c-crit">
            Cada dose é confirmada <b>somente por quem a administrou</b>, na conta dela.
            Ninguém confirma pelo outro, e não existe marcação em lote.
          </div>
          <div className="eyebrow">Doses de hoje · {dia(painel.data)}</div>
          <ul className="doses">
            {painel.doses.map((d) => (
              <li key={d.id} className={d.pendente ? '' : 'feito'}>
                <span className="hora">{d.tipo === 'quando_necessario' ? 's/n' : hhmm(d.horario)}</span>
                <div className="grow">
                  <b className="ff">{d.acolhido}</b> · {d.medicamento} {d.dose}
                  <span className="mutetxt"> · {d.via}</span>
                  {d.condicaoUso && (
                    <div className="mutetxt">Condição de uso: {d.condicaoUso}</div>
                  )}
                  <div className="row" style={{ marginTop: 5 }}>
                    <span className={`pill ${TOM_DOSE[d.estado] ?? 'c-mute'}`}>{d.rotulo}</span>
                    {d.alerta && <span className="pill c-crit">⚠ {d.alerta}</span>}
                  </div>
                  {d.confirmadaPor && (
                    <div className="mutetxt">Confirmada por {d.confirmadaPor}.</div>
                  )}
                </div>
                {d.pendente && (
                  <button className="btn sm" onClick={() => setConfirmando(d)}>Confirmar</button>
                )}
              </li>
            ))}
          </ul>
          <p className="mutetxt" style={{ marginTop: 12 }}>
            Dose que passou da hora aparece como <b>sem confirmação</b>, nunca como
            “não administrada”. A diferença entre as duas frases é uma conclusão — e a
            conclusão é da equipe, não do sistema.
          </p>
        </>
      )}

      {aba === 'triagem' && (
        <>
          <div className="notice c-info">
            Evoluções de saúde escritas pelo educador que acompanhou o atendimento. A
            Enfermagem tria, complementa, confere e assina. A coordenação cobra a
            pendência, mas <b>não substitui a assinatura de saúde</b>.
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {triagem.map((t) => (
              <div className="card stack" key={t.id}>
                <div className="row">
                  <b className="ff grow">{t.acolhido} · {t.tipo}</b>
                  <span className={`pill ${t.assinada ? 'c-ok' : 'c-warn'}`}>
                    {t.assinada ? 'Assinada' : 'Aguardando triagem'}
                  </span>
                </div>
                <div className="mutetxt">Enviada por {t.enviadaPor} às {hhmm(t.enviadaEm)}.</div>
                <div>{t.resumo}</div>
                {t.complemento && (
                  <div className="bloco"><small>Complemento da Enfermagem</small>{t.complemento}</div>
                )}
                {t.assinada
                  ? <div className="mutetxt">✓ Triada, conferida e assinada por {t.assinadaPor}.
                      Receita nova só altera a grade depois desta revisão.</div>
                  : enfermagem
                    ? <button className="btn sm" onClick={() => setTriando(t)}>Revisar e assinar</button>
                    : <div className="mutetxt">Só a Enfermagem assina. Você enxerga a fila para
                        cobrar a pendência.</div>}
              </div>
            ))}
            {triagem.length === 0 && (
              <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
                Nenhuma evolução na fila.</p></div>
            )}
          </div>
        </>
      )}

      {aba === 'estoque' && (
        <>
          <div className="eyebrow">Armário de medicamentos da casa</div>
          <div className="stack">
            {estoque.map((i) => {
              const baixo = i.quantidade < i.minimo;
              const m = i.ultimoMovimento;
              return (
                <div className="card" key={i.id}>
                  <div className="row">
                    <div className="grow">
                      <b className="ff">{i.medicamento}</b>
                      <div className="mutetxt">
                        {i.quantidade} {i.unidade}{i.quantidade === 1 ? '' : 's'} ·
                        mínimo {i.minimo} · validade {dia(i.validade)}
                      </div>
                      <div className="mutetxt">Última conferência: {i.conferidoPor}.</div>
                      {m && (
                        <div className="mutetxt">
                          Último movimento: {m.tipo === 'entrada'
                            ? `entrada de ${m.quantidade}`
                            : `conferência, ${m.quantidade > 0 ? '+' : ''}${m.quantidade}`}
                          {' '}· {m.por}{m.motivo ? ` · ${m.motivo}` : ''}
                        </div>
                      )}
                    </div>
                    <span className={`pill ${baixo ? 'c-warn' : 'c-ok'}`}>
                      {baixo ? 'Abaixo do mínimo' : 'Suficiente'}
                    </span>
                  </div>
                  {movimenta && (
                    <div className="row" style={{ marginTop: 10, gap: 8 }}>
                      <button className="btn sm" onClick={() => setMovendo({ item: i, tipo: 'entrada' })}>
                        Chegou remédio
                      </button>
                      <button className="btn sm ghost" onClick={() => setMovendo({ item: i, tipo: 'contagem' })}>
                        Conferi o armário
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mutetxt" style={{ marginTop: 12 }}>
            <b>Chegou remédio</b> soma ao que já estava lá. <b>Conferi o armário</b> troca pelo
            número que você contou e guarda a diferença, com o seu motivo. São duas coisas
            diferentes, e o sistema não adivinha qual delas você está fazendo.
          </p>
          <p className="mutetxt" style={{ marginTop: 12 }}>
            O estoque diz o estado do <b>armário</b>. Falta de medicamento é problema de
            compra e de logística — não é indicador sobre nenhuma criança.
          </p>
        </>
      )}

      {aba === 'resumo' && painel && (
        <>
          <div className="notice c-warn">
            O Resumo de Saúde leva só o necessário: identificação, alergias, restrições,
            condições relevantes, medicamentos ativos e atendimentos recentes.
            <b> Sem</b> dados bancários, conteúdo judicial, comportamento ou narrativas.
            Toda emissão pede finalidade, e a finalidade fica registrada.
          </div>
          <div className="eyebrow">Todos os acolhidos</div>
          <div className="stack">
            {painel.acolhidos.map((k) => (
              <div className="card row" key={k.id}>
                <div className="grow">
                  <b className="ff">{k.nome}</b> <span className="mutetxt">{k.idade} anos</span>
                  {k.alerta && <div><span className="pill c-crit">⚠ {k.alerta}</span></div>}
                  {k.cuidado && <div className="mutetxt">{k.cuidado}</div>}
                </div>
                <span className={`pill ${k.doses ? 'c-med' : 'c-mute'}`}>
                  {k.doses ? `${k.doses} dose(s) na grade` : 'Sem medicação prevista'}
                </span>
                <button className="btn sm ghost"
                        onClick={() => setResumindo({ id: k.id, nome: k.nome })}>
                  Gerar resumo
                </button>
              </div>
            ))}
          </div>
          <p className="mutetxt" style={{ marginTop: 12 }}>
            Todos aparecem, inclusive quem não tem medicação. A lista não ordena por
            gravidade nem sugere prioridade clínica — isso seria uma decisão que o
            sistema não pode tomar.
          </p>
        </>
      )}

      {confirmando && (
        <FolhaDose dose={confirmando} onFechar={() => setConfirmando(null)}
                   onConfirmar={async (resultado, observacao) => {
                     const ok = await acao(() => api(`/health/doses/${confirmando.id}/confirm`, {
                       method: 'POST', body: JSON.stringify({ resultado, observacao }) }));
                     if (ok) setConfirmando(null);
                   }} />
      )}

      {triando && (
        <FolhaTriagem evolucao={triando} onFechar={() => setTriando(null)}
                      onAssinar={async (complemento) => {
                        const ok = await acao(() => api(`/health/triage/${triando.id}/sign`, {
                          method: 'POST', body: JSON.stringify({ complemento }) }));
                        if (ok) setTriando(null);
                      }} />
      )}

      {resumindo && (
        <FolhaResumo pessoa={resumindo} onFechar={() => setResumindo(null)}
                     onGerar={async (finalidade) => {
                       const ok = await acao(() => api('/health/summary', {
                         method: 'POST',
                         body: JSON.stringify({ personId: resumindo.id, finalidade }) }));
                       if (ok) setResumindo(null);
                     }} />
      )}

      {movendo && (
        <FolhaEstoque
          item={movendo.item} tipo={movendo.tipo} onFechar={() => setMovendo(null)}
          onGravar={async (quantidade, motivo) => {
            const ok = await acao(() => api(`/health/stock/${movendo.item.id}/movimento`, {
              method: 'POST',
              body: JSON.stringify({ tipo: movendo.tipo, quantidade, motivo }) }));
            if (ok) setMovendo(null);
          }} />
      )}
    </>
  );
}

/**
 * Uma folha, dois sentidos — e a diferença aparece antes de gravar.
 *
 * O campo de "entrada" pergunta o que CHEGOU; o de "contagem" pergunta o que
 * EXISTE. A linha de prévia diz em que número o armário vai ficar, porque foi
 * exatamente essa confusão que produziu o defeito: uma entrada de 10 sobre 30
 * deixava 10, e ninguém via isso até faltar remédio.
 */
function FolhaEstoque({ item, tipo, onFechar, onGravar }: {
  item: Item; tipo: 'entrada' | 'contagem';
  onFechar: () => void; onGravar: (quantidade: number, motivo: string) => void;
}) {
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const entrada = tipo === 'entrada';
  const q = Number(valor);
  const valido = valor.trim() !== '' && Number.isFinite(q) && q >= 0 && (!entrada || q > 0);
  const depois = !valido ? null : entrada ? item.quantidade + q : q;
  const podeGravar = valido && (entrada || motivo.trim().length >= 3);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-est"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-est">{entrada ? 'Chegou remédio' : 'Conferi o armário'} · {item.medicamento}</h3>
        <p className="mutetxt">
          Registrado agora: <b>{item.quantidade} {item.unidade}(s)</b>.
        </p>
        <div className={`notice ${entrada ? 'c-info' : 'c-warn'}`}>
          {entrada
            ? 'A quantidade que você digitar SOMA ao que já estava no armário.'
            : 'A quantidade que você digitar SUBSTITUI o registro, e a diferença fica no '
              + 'histórico com o seu nome e o seu motivo.'}
        </div>

        <label className="f" htmlFor="q-est">
          {entrada ? 'Quanto chegou' : 'Quanto você contou'} <small>— em {item.unidade}(s)</small>
        </label>
        <input id="q-est" type="number" min={entrada ? 1 : 0} inputMode="numeric"
               value={valor} onChange={(e) => setValor(e.target.value)} />

        {depois !== null && (
          <p className="mutetxt">
            O armário fica com <b>{depois} {item.unidade}(s)</b>
            {!entrada && depois !== item.quantidade
              ? ` — diferença de ${depois > item.quantidade ? '+' : ''}${depois - item.quantidade}.`
              : '.'}
          </p>
        )}

        <label className="f" htmlFor="m-est">
          Motivo {entrada
            ? <small>— opcional: nota de compra, doação</small>
            : <small>— obrigatório</small>}
        </label>
        <textarea id="m-est" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder={entrada
                    ? 'Ex.: entrega da farmácia, nota 4471.'
                    : 'Ex.: conferência do armário na passagem; quatro a menos que o registrado.'} />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!podeGravar}
                  onClick={() => onGravar(q, motivo)}>
            {entrada ? 'Registrar entrada' : 'Registrar contagem'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FolhaDose({ dose, onFechar, onConfirmar }: {
  dose: Dose; onFechar: () => void; onConfirmar: (resultado: string, obs: string) => void;
}) {
  const [resultado, setResultado] = useState('');
  const [obs, setObs] = useState('');
  const escolhido = RESULTADOS.find((r) => r.cod === resultado);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-dose"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-dose">Confirmar dose · {dose.acolhido}</h3>
        <p className="mutetxt">
          {dose.medicamento} {dose.dose} · {dose.via} · previsto para {hhmm(dose.horario)}
        </p>
        {dose.alerta && (
          <div className="notice c-crit">⚠ Alerta essencial registrado: <b>{dose.alerta}</b></div>
        )}
        <div className="notice c-info">
          A confirmação é individual e intransferível: <b>só confirma quem administrou</b>.
          Fica com o seu nome e o horário de agora.
        </div>

        <label className="f">Resultado</label>
        <div className="opts">
          {RESULTADOS.map((r) => (
            <button type="button" key={r.cod} className={`opt ${r.tom}`}
                    aria-pressed={resultado === r.cod}
                    onClick={() => setResultado(r.cod)}>{r.label}</button>
          ))}
        </div>

        {escolhido?.exigeObs && (
          <>
            <label className="f" htmlFor="obs-dose">
              Observação <small>— obrigatória neste resultado</small>
            </label>
            <textarea id="obs-dose" value={obs} onChange={(e) => setObs(e.target.value)}
                      placeholder="Ex.: recusou a primeira oferta; aceitou depois de conversar." />
          </>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!resultado}
                  onClick={() => onConfirmar(resultado, obs)}>Confirmar dose</button>
        </div>
      </div>
    </div>
  );
}

function FolhaTriagem({ evolucao, onFechar, onAssinar }: {
  evolucao: Evolucao; onFechar: () => void; onAssinar: (complemento: string) => void;
}) {
  const [complemento, setComplemento] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-tri"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-tri">Revisar e assinar · {evolucao.acolhido}</h3>
        <p className="mutetxt">{evolucao.tipo} · enviada por {evolucao.enviadaPor}.</p>
        <div className="bloco"><small>Relato de quem acompanhou</small>{evolucao.resumo}</div>
        <label className="f" htmlFor="compl">
          Complemento da Enfermagem <small>— entra ao lado, sem reescrever o relato</small>
        </label>
        <textarea id="compl" value={complemento} onChange={(e) => setComplemento(e.target.value)}
                  placeholder="Ex.: grade conferida com a receita nova antes de valer na casa." />
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" onClick={() => onAssinar(complemento)}>
            Assinar como Enfermagem
          </button>
        </div>
      </div>
    </div>
  );
}

function FolhaResumo({ pessoa, onFechar, onGerar }: {
  pessoa: { id: string; nome: string }; onFechar: () => void; onGerar: (f: string) => void;
}) {
  const [finalidade, setFinalidade] = useState(FINALIDADES[0]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-res"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-res">Resumo de Saúde · {pessoa.nome}</h3>
        <label className="f" htmlFor="fin-res">
          Finalidade da emissão <small>— obrigatória e registrada</small>
        </label>
        <select id="fin-res" value={finalidade} onChange={(e) => setFinalidade(e.target.value)}>
          {FINALIDADES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <div className="notice c-warn">
          O documento sai marcado <b>confidencial — uso em saúde</b> e leva apenas o
          necessário para o atendimento.
        </div>
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" onClick={() => onGerar(finalidade)}>Gerar resumo</button>
        </div>
      </div>
    </div>
  );
}
