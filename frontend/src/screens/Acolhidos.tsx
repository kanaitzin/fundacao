import { useCallback, useEffect, useState } from 'react';
import { api, ErroApi } from '../api';

/**
 * OS ACOLHIDOS DA CASA e o PERFIL (§6, §13).
 *
 * O educador abre esta tela no meio do turno, por um motivo concreto: vai dar
 * o almoço e não lembra se a criança tem restrição; vai levar à escola e
 * precisa da série; a criança se queixa de dor e ele quer saber o que a
 * Enfermagem já sabe. A tela é feita para essas perguntas, nessa ordem.
 *
 * O que a ordem diz, e por quê:
 *
 *  * **alerta essencial e restrição alimentar primeiro, sempre.** Antes do
 *    nome da escola, antes de qualquer dado estrutural. São os dois campos em
 *    que errar machuca no mesmo dia;
 *  * **o dia da criança vem antes do cadastro dela.** Remédio de hoje e
 *    cuidado essencial acima de documento e memória;
 *  * **o motivo judicial não abre junto com o perfil.** Fica atrás de um
 *    toque, para a equipe técnica e a coordenação, e cada abertura é
 *    registrada. Ninguém precisa do processo para dar o jantar (§13.1);
 *  * **o que este papel não pode ver aparece como CONTAGEM, não some.** "3
 *    documentos em área restrita" é honesto; esconder que existem faria a
 *    equipe procurar noutro lugar.
 */

interface Resumo {
  id: string; nome: string; idade: number;
  alertasEssenciais: number; restricoesAlimentares: number;
}
interface Condicao {
  id: string; kind: string; description: string; rotulo: string; severity: string | null;
  essential_alert: boolean; source: string | null; review_on: string | null;
}
interface Restricao {
  id: string; restriction: string; substitution: string | null; guidance: string | null;
}
interface Doc {
  id: string; category: string; title: string; issued_on: string | null; valid_until: string | null;
}
interface Perfil {
  id: string; nome: string; nomeCivil: string; idade: number; nascimento: string;
  cpfPendente: boolean; idProvisorio: string | null;
  casaAtual: { id: string; codigo: string; nome: string; desde: string } | null;
  noAcervo: boolean;
  alertasEssenciais: { tipo: string; descricao: string; gravidade: string | null }[];
  condicoesSaude: Condicao[];
  restricoesAlimentares: Restricao[];
  cuidadosEssenciais: string | null;
  escola: { nome: string | null; serie: string | null; turno: string | null; endereco: string | null } | null;
  equipeReferencia: string | null;
  documentos: Doc[];
  documentosRestritos: number;
  memorias: { id: string; event_type: string; happened_on: string; description: string }[];
}
interface Dose {
  id: string; horario: string; medicamento: string; dose: string; via: string;
  tipo: string; condicaoUso: string | null; estado: string; rotulo: string;
  pendente: boolean; confirmadaPor: string | null;
}
interface Judicial {
  motivo: string; detalhe: string | null; medida: string; orgao: string;
  vara: string | null; processo: string | null; guia: string | null;
  guiaEm: string | null; determinadoEm: string | null; situacao: string | null;
  observacoes: string | null;
}

/** Quem tem a área restrita do §13.1. O menu não oferece o que o cargo não faz. */
const VE_JUDICIAL = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

const CATEGORIA: Record<string, string> = {
  saude: 'Saúde', escolar: 'Escolar', pessoal: 'Pessoal',
  judicial_socioassistencial: 'Judicial e socioassistencial',
};
const TIPO_DOSE: Record<string, string> = {
  uso_continuo: 'uso contínuo', tratamento: 'tratamento',
  quando_necessario: 'quando necessário', episodio_agudo: 'episódio agudo',
};

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
/**
 * Uma data para ler.
 *
 * O servidor devolve umas como dia puro ("2018-05-27") e outras já com hora
 * ("2018-05-27T00:00:00.000Z"), conforme a coluna. Concatenar a hora na
 * segunda dava "Invalid Date" — e a tela mostrava isso ao lado da idade de
 * uma criança. Corta em dez caracteres e monta ao meio-dia, que é o que
 * impede o fuso de recuar um dia.
 */
const dia = (d: string) => {
  const iso = String(d).slice(0, 10);
  const data = new Date(`${iso}T12:00:00`);
  return Number.isNaN(data.getTime())
    ? '—'
    : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function Acolhidos({ houseId, papel }: { houseId: string; papel: string }) {
  const [lista, setLista] = useState<Resumo[]>([]);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    try { setLista(await api<Resumo[]>(`/people?houseId=${houseId}`)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar os acolhidos.'); }
  }, [houseId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (abertoId) {
    return <Perfil personId={abertoId} houseId={houseId} papel={papel}
                   onVoltar={() => { setAbertoId(null); carregar(); }} />;
  }

  const filtrada = busca.trim()
    ? lista.filter((p) => p.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : lista;

  return (
    <>
      <div className="diahead">
        <div><h2>Os acolhidos da casa</h2></div>
        <div className="resumo"><span className="pill c-info">{lista.length} na casa</span></div>
      </div>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      {/* Vinte nomes cabem na tela; a busca é para a casa que crescer, e para
          quem está com pressa e sabe o nome. */}
      {lista.length > 8 && (
        <input className="field" type="search" value={busca} placeholder="Buscar pelo nome"
               aria-label="Buscar pelo nome" onChange={(e) => setBusca(e.target.value)} />
      )}

      <ol className="pessoas">
        {filtrada.map((p) => (
          <li key={p.id}>
            <button className="card row" onClick={() => setAbertoId(p.id)}>
              <div className="grow" style={{ textAlign: 'left' }}>
                <b className="ff">{p.nome}</b>
                <div className="mutetxt">{p.idade} anos</div>
              </div>
              {p.alertasEssenciais > 0 && (
                <span className="pill c-crit" title="Alertas essenciais">
                  ⚠ {p.alertasEssenciais}
                </span>
              )}
              {p.restricoesAlimentares > 0 && (
                <span className="pill c-warn" title="Restrições alimentares">
                  🍽 {p.restricoesAlimentares}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>

      {lista.length > 0 && filtrada.length === 0 && (
        <div className="card"><p className="mutetxt" style={{ margin: 0 }}>Nenhum nome com "{busca}".</p></div>
      )}
      {lista.length === 0 && !erro && (
        <div className="card">
          <p className="mutetxt" style={{ margin: 0 }}>
            Nenhum acolhido ativo nesta casa.
          </p>
        </div>
      )}
    </>
  );
}

function Perfil({ personId, houseId, papel, onVoltar }: {
  personId: string; houseId: string; papel: string; onVoltar: () => void;
}) {
  const [p, setP] = useState<Perfil | null>(null);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [judicial, setJudicial] = useState<Judicial | null>(null);
  const [erro, setErro] = useState('');
  const [erroJudicial, setErroJudicial] = useState('');
  const [semJudicial, setSemJudicial] = useState(false);

  useEffect(() => {
    (async () => {
      setErro('');
      try {
        setP(await api<Perfil>(`/people/${personId}`));
        // O remédio de hoje é do dia, não do cadastro: vem da grade da casa,
        // filtrada nesta criança. Se falhar, o perfil ainda serve.
        try { setDoses(await api<Dose[]>(`/medications?houseId=${houseId}&personId=${personId}`)); }
        catch { setDoses([]); }
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível abrir o perfil.');
      }
    })();
  }, [personId, houseId]);

  async function abrirJudicial() {
    setErroJudicial(''); setSemJudicial(false);
    try {
      setJudicial(await api<Judicial>(`/people/${personId}/judicial`));
    } catch (e) {
      // 404 aqui não é bloqueio: é campo que ninguém preencheu ainda — e, para
      // a equipe técnica, isso é trabalho a fazer, não porta fechada. O
      // cadastro incompleto é o débito que reaparece na primeira audiência.
      if (e instanceof ErroApi && e.status === 404) setSemJudicial(true);
      else setErroJudicial(e instanceof Error ? e.message : 'Não foi possível abrir a área restrita.');
    }
  }

  if (erro) {
    return (
      <>
        <button className="btn sm ghost" onClick={onVoltar}>← Acolhidos</button>
        <div className="notice c-crit" role="alert" style={{ marginTop: 12 }}>{erro}</div>
      </>
    );
  }
  if (!p) return <p className="mutetxt">Abrindo…</p>;

  const pendentes = doses.filter((d) => d.pendente);

  return (
    <>
      <div className="diahead">
        <div>
          <button className="btn sm ghost" onClick={onVoltar}>← Acolhidos</button>
          <h2>{p.nome}</h2>
          <div className="mutetxt">
            {p.idade} anos · {dia(p.nascimento)}
            {p.casaAtual ? ` · ${p.casaAtual.codigo} desde ${dia(p.casaAtual.desde)}` : ''}
          </div>
        </div>
      </div>

      {/* PRIMEIRO, e sem precisar rolar: o que machuca hoje se for ignorado. */}
      {p.alertasEssenciais.map((a, i) => (
        <div key={i} className="notice c-crit" role="alert">
          <b>⚠ {a.descricao}</b>
          <div className="mutetxt">{a.tipo}{a.gravidade ? ` · ${a.gravidade}` : ''}</div>
        </div>
      ))}
      {p.restricoesAlimentares.map((r) => (
        <div key={r.id} className="notice c-warn" role="status">
          <b>🍽 {r.restriction}</b>
          {r.substitution && <div>No lugar: {r.substitution}</div>}
          {r.guidance && <div className="mutetxt">{r.guidance}</div>}
        </div>
      ))}

      {/*
        A pendência de cadastro aparece para quem pode fechá-la.
        Um ingresso urgente entra sem CPF de propósito — a criança não espera
        documento —, mas a pendência não pode virar silêncio: é ela que
        reaparece na primeira audiência. Para o educador no meio do turno isso
        seria ruído; para a equipe técnica, é trabalho com nome e prazo.
      */}
      {p.cpfPendente && VE_JUDICIAL.includes(papel) && (
        <div className="notice c-warn" role="status">
          <b>Cadastro sem CPF</b>
          <div>
            Entrou como ingresso urgente{p.idProvisorio ? `, com o ID provisório ${p.idProvisorio}` : ''}.
            O CPF continua pendente — enquanto estiver assim, documento, benefício e
            matrícula esbarram nisso.
          </div>
        </div>
      )}

      {p.cuidadosEssenciais && (
        <Secao titulo="Cuidados essenciais">
          <p className="bloco" style={{ marginTop: 0 }}>{p.cuidadosEssenciais}</p>
        </Secao>
      )}

      <Secao titulo="Remédio de hoje">
        {doses.length === 0 ? (
          <p className="mutetxt" style={{ margin: 0 }}>Nenhuma dose prevista hoje.</p>
        ) : (
          <>
            {pendentes.length > 0 && (
              <p className="mutetxt" style={{ marginTop: 0 }}>
                {pendentes.length} dose(s) ainda sem confirmação. A confirmação é feita na
                tela do dia, por quem administra.
              </p>
            )}
            <ol className="doses">
              {doses.map((d) => (
                /* O nome do remédio ocupa a linha inteira e o estado vem
                   embaixo. Ao lado, "Colírio lubrificante (fictício)" quebrava
                   em três linhas e a leitura de relance — que é a única que
                   acontece no corredor — se perdia. */
                <li key={d.id} className={d.pendente ? '' : 'feito'}>
                  <span className="hora">{hhmm(d.horario)}</span>
                  <div className="grow">
                    <b className="ff">{d.medicamento}</b>
                    <div className="mutetxt">
                      {d.dose} · {d.via} · {TIPO_DOSE[d.tipo] ?? d.tipo}
                    </div>
                    {d.condicaoUso && <div className="mutetxt">Só se: {d.condicaoUso}</div>}
                    <div className="estado">
                      <span className={`pill ${d.pendente ? 'c-warn' : 'c-ok'}`}>{d.rotulo}</span>
                      {d.confirmadaPor && <span className="mutetxt"> por {d.confirmadaPor}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </Secao>

      {p.condicoesSaude.length > 0 && (
        <Secao titulo="Saúde">
          <ul className="lista">
            {p.condicoesSaude.map((c) => (
              <li key={c.id}>
                <b className="ff">{c.rotulo ?? c.description}</b>
                <div className="mutetxt">
                  {c.kind}{c.severity ? ` · ${c.severity}` : ''}
                  {c.source ? ` · ${c.source}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {p.escola && (p.escola.nome || p.escola.serie) && (
        <Secao titulo="Escola">
          <b className="ff">{p.escola.nome ?? 'Escola não informada'}</b>
          <div className="mutetxt">
            {[p.escola.serie, p.escola.turno].filter(Boolean).join(' · ') || 'Série e turno não informados'}
          </div>
          {p.escola.endereco && <div className="mutetxt">{p.escola.endereco}</div>}
        </Secao>
      )}

      {p.equipeReferencia && (
        <Secao titulo="Equipe de referência">
          <p className="bloco" style={{ marginTop: 0 }}>{p.equipeReferencia}</p>
        </Secao>
      )}

      <Secao titulo="Documentos">
        {p.documentos.length === 0 && p.documentosRestritos === 0 && (
          <p className="mutetxt" style={{ margin: 0 }}>Nenhum documento cadastrado.</p>
        )}
        <ul className="lista">
          {p.documentos.map((d) => (
            <li key={d.id}>
              <b className="ff">{d.title}</b>
              <div className="mutetxt">
                {CATEGORIA[d.category] ?? d.category}
                {d.valid_until ? ` · vence em ${dia(d.valid_until)}` : ''}
              </div>
            </li>
          ))}
        </ul>
        {/* Contagem, não conteúdo: esconder que existem faria a equipe
            procurar num lugar sem proteção nenhuma. */}
        {p.documentosRestritos > 0 && (
          <p className="mutetxt" style={{ marginBottom: 0 }}>
            Mais {p.documentosRestritos} documento(s) em área restrita ao seu cargo. Existem, e
            estão guardados — quem precisa deles é a equipe técnica.
          </p>
        )}
      </Secao>

      {/* A ÁREA RESTRITA. Não abre junto com o perfil: exige o toque, e o
          toque fica registrado com o nome de quem deu (§13.1, §20). */}
      {VE_JUDICIAL.includes(papel) && (
        <Secao titulo="Motivo do acolhimento e dados judiciais">
          {!judicial && !erroJudicial && !semJudicial && (
            <>
              <p className="mutetxt" style={{ marginTop: 0 }}>
                Área restrita. Abrir fica registrado em seu nome, com data e hora.
              </p>
              <button className="btn sec block" onClick={abrirJudicial}>
                Abrir a área restrita
              </button>
            </>
          )}
          {erroJudicial && <div className="notice c-crit" role="alert">{erroJudicial}</div>}
          {semJudicial && (
            <div className="notice c-warn" role="status">
              <b>Sem motivo judicial cadastrado.</b>
              <div>
                Esta criança está acolhida e o sistema não sabe por quê. É a lacuna que
                reaparece na primeira audiência — o cadastro completo, pela equipe técnica,
                é o que a fecha.
              </div>
            </div>
          )}
          {judicial && (
            <>
              <p className="bloco destaque" style={{ marginTop: 0 }}>
                <small>Motivo</small>{judicial.motivo}
              </p>
              {judicial.detalhe && <p className="bloco"><small>Detalhe</small>{judicial.detalhe}</p>}
              <ul className="lista">
                <li><b className="ff">{judicial.medida}</b><div className="mutetxt">medida</div></li>
                <li><b className="ff">{judicial.orgao}</b><div className="mutetxt">órgão determinante</div></li>
                {judicial.vara && <li><b className="ff">{judicial.vara}</b><div className="mutetxt">vara</div></li>}
                {judicial.processo && (
                  <li><b className="ff">{judicial.processo}</b><div className="mutetxt">processo</div></li>
                )}
                {judicial.guia && (
                  <li>
                    <b className="ff">{judicial.guia}</b>
                    <div className="mutetxt">
                      guia{judicial.guiaEm ? ` · ${dia(judicial.guiaEm)}` : ''}
                    </div>
                  </li>
                )}
              </ul>
              {judicial.observacoes && <p className="bloco"><small>Observações</small>{judicial.observacoes}</p>}
            </>
          )}
        </Secao>
      )}

      {p.memorias.length > 0 && (
        <Secao titulo="Memórias">
          <ul className="lista">
            {p.memorias.map((m) => (
              <li key={m.id}>
                <b className="ff">{m.description}</b>
                <div className="mutetxt">{m.event_type} · {dia(m.happened_on)}</div>
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="passagem">
      <div className="eyebrow">{titulo}</div>
      <div className="card">{children}</div>
    </section>
  );
}
