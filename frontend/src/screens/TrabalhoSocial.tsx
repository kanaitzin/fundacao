import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { FolhaDocumento, baixarArquivo } from '../documentos';
import { BotaoOlho, FolhaArquivo } from '../anexos';
import type { ArquivoGerado } from '../documentos';
import type { DocumentoWord } from '../docx';

/**
 * O TRABALHO SOCIAL — a outra leitura das oito casas.
 *
 * O Gestor Geral responde por todas e não vai abrir a grade de medicação de
 * nenhuma. O que ele precisa é do que o acolhimento produziu: quantas crianças
 * estão acolhidas, quantas entraram e saíram, e o que aconteceu de bom —
 * passou de ano, terminou o Médio, entrou no curso, assinou a primeira
 * carteira.
 *
 * **O que esta tela recusa a fazer, e a recusa é o desenho:**
 *
 *  * as casas aparecem na ordem do CADASTRO, nunca por resultado. Ordenar por
 *    marcos parece mais útil e é um ranking com outro nome — e a casa que
 *    recebe adolescentes com medida protetiva recente não está na mesma
 *    corrida da casa-lar com quatro crianças pequenas;
 *  * nada de média, meta, percentual de sucesso ou "casa destaque". O número
 *    de cada casa se lê ao lado do número de acolhidos dela;
 *  * ausência de marco não é dado. A criança sem linha aqui não fracassou:
 *    ela pode ter passado o ano inteiro sobrevivendo a uma coisa que não cabe
 *    em categoria — e é justamente essa que o trabalho da casa mais tocou.
 */
interface Casa {
  id: string; codigo: string; nome: string;
  acolhidos: number; capacidade: number;
  entradas: number; saidas: number; ocorrencias: number; marcos: number;
}

interface Panorama {
  periodo: { de: string; ate: string };
  casas: Casa[];
  total: {
    casas: number; acolhidos: number; capacidade: number;
    entradas: number; saidas: number; ocorrencias: number; marcos: number;
  };
  marcosPorTipo: { cod: string; label: string; icone: string; n: number }[];
  aviso: string;
}

interface Marco {
  id: string; acolhidoId: string; acolhido: string; casa: string;
  tipo: string; tipoRotulo: string; icone: string;
  quando: string; descricao: string; instituicao: string | null;
  temComprovante: boolean; por: string;
}

const dia = (iso: string) =>
  new Date(String(iso).length <= 10 ? `${iso}T12:00:00-03:00` : iso)
    .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export function TrabalhoSocial({ papel }: { papel: string }) {
  const [p, setP] = useState<Panorama | null>(null);
  const [marcos, setMarcos] = useState<Marco[] | null>(null);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [tipo, setTipo] = useState('');
  const [pessoa, setPessoa] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [documento, setDocumento] = useState<DocumentoWord | null>(null);
  const [erro, setErro] = useState('');
  const podeRegistrar = ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(papel);

  const carregar = useCallback(async () => {
    setErro('');
    /*
     * A rota vai por EXTENSO, com os parâmetros na query string — e não
     * montada numa variável. O `contrato-rotas.spec` lê o código para conferir
     * cada chamada da tela contra as rotas do servidor, e uma rota escondida
     * numa variável some do conferidor. É a mesma lição da fase 47.
     */
    const q = [de && `de=${de}`, ate && `ate=${ate}`].filter(Boolean).join('&');
    try {
      setP(await api<Panorama>(`/impacto/panorama?${q}`));
      setMarcos(await api<Marco[]>(
        `/impacto/marcos?${[q, tipo && `tipo=${tipo}`].filter(Boolean).join('&')}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o panorama.');
    }
  }, [de, ate, tipo]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (pessoa) return <Trajetoria personId={pessoa} onVoltar={() => setPessoa(null)} />;
  if (erro) return <div className="notice c-crit" role="alert">{erro}</div>;
  if (!p) return <p className="mutetxt">Carregando…</p>;

  return (
    <>
      <div className="eyebrow">Fundação · {p.total.casas} casas</div>
      <h2>O trabalho social</h2>
      <p className="mutetxt">
        De {dia(p.periodo.de)} a {dia(p.periodo.ate)}. Esta é a leitura do que o
        acolhimento produziu — a operação do dia fica nas telas da casa.
      </p>

      <div className="acoes">
        {podeRegistrar && (
          <button className="btn sm" onClick={() => setRegistrando(true)}>
            ✨ Registrar conquista
          </button>
        )}
        <button className="btn sm sec" onClick={async () => {
          try {
            /* Sem `houseId`, é a folha das oito. A coordenação, que só alcança
             * a casa dela, usa o botão equivalente no painel da unidade. */
            setDocumento(await api<DocumentoWord>(
              `/impacto/folha?de=${de}&ate=${ate}`));
          } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível montar a folha.');
          }
        }}>📄 Relatório em Word</button>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className="f grow" htmlFor="ts-de">De
          <input id="ts-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="f grow" htmlFor="ts-ate">Até
          <input id="ts-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
      </div>

      {/* ------------------------------------------------------------ total */}
      {/* `painel`/`tile` é o mesmo bloco de números do painel da Enfermagem:
        * a cor comunica CATEGORIA, e nunca julgamento sobre a casa (regra 7). */}
      <div className="painel">
        <div className="tile c-info"><b>{p.total.acolhidos}</b>
          <span>acolhidos agora, em {p.total.capacidade} vagas</span></div>
        <div className="tile c-info"><b>{p.total.entradas}</b>
          <span>entradas no período</span></div>
        <div className="tile c-info"><b>{p.total.saidas}</b>
          <span>saídas no período</span></div>
        <div className="tile c-ok"><b>{p.total.marcos}</b>
          <span>conquistas registradas</span></div>
      </div>

      {/* ------------------------------------------------- o que aconteceu */}
      <div className="eyebrow">O que aconteceu de bom</div>
      {!p.marcosPorTipo.length && (
        <p className="mutetxt">
          Nada registrado neste período. Isso diz que ninguém escreveu — não diz que
          não aconteceu.
        </p>
      )}
      <div className="stack">
        {p.marcosPorTipo.map((t) => (
          <button key={t.cod} className="card row"
                  onClick={() => setTipo(tipo === t.cod ? '' : t.cod)}>
            <span aria-hidden="true">{t.icone}</span>
            <b className="ff grow" style={{ textAlign: 'left' }}>{t.label}</b>
            <span className={`pill ${tipo === t.cod ? 'c-ok' : 'c-info'}`}>{t.n}</span>
          </button>
        ))}
      </div>

      {/* -------------------------------------------------------- as casas */}
      <div className="eyebrow" style={{ marginTop: 16 }}>Casa a casa</div>
      <p className="mutetxt">{p.aviso}</p>
      <div className="stack">
        {p.casas.map((c) => (
          <div key={c.id} className="card">
            <div className="row">
              <b className="ff grow">{c.codigo} — {c.nome}</b>
              <span className="pill c-info">{c.acolhidos} de {c.capacidade}</span>
            </div>
            <div className="mutetxt">
              {c.entradas} entrada(s) · {c.saidas} saída(s) · {c.ocorrencias} ocorrência(s)
              {' · '}{c.marcos} conquista(s)
            </div>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------ quem conquistou */}
      <div className="eyebrow" style={{ marginTop: 16 }}>
        Quem conquistou {tipo ? '· filtrado' : ''}
      </div>
      <p className="mutetxt">
        Por data, e não por criança com mais conquistas. Toque no nome para ver a
        trajetória dela.
      </p>
      <div className="stack">
        {!(marcos ?? []).length && <p className="mutetxt">Nada no período.</p>}
        {(marcos ?? []).map((m) => (
          <button key={m.id} className="card" style={{ textAlign: 'left' }}
                  onClick={() => setPessoa(m.acolhidoId)}>
            <div className="row">
              <span aria-hidden="true">{m.icone}</span>
              <b className="ff grow">{m.acolhido}</b>
              <span className="pill c-info">{m.casa}</span>
            </div>
            <div><b>{m.tipoRotulo}</b> · {dia(m.quando)}</div>
            <div className="mutetxt">{m.descricao}</div>
            {m.instituicao && <div className="mutetxt">{m.instituicao}</div>}
          </button>
        ))}
      </div>

      {registrando && (
        <FolhaConquista
          onFechar={() => setRegistrando(false)}
          onSalvou={() => { setRegistrando(false); void carregar(); }} />
      )}

      {documento && (
        <FolhaDocumento doc={documento} onFechar={() => setDocumento(null)}
                        exportar={(finalidade) => api<ArquivoGerado>('/impacto/export', {
                          method: 'POST', body: JSON.stringify({ de, ate, finalidade }),
                        })} />
      )}
    </>
  );
}

/**
 * REGISTRAR UMA CONQUISTA.
 *
 * A descrição é obrigatória e o servidor recusa frase curta — e a recusa tem
 * motivo: o tipo já diz a categoria ("passou de ano"), e esta linha é a
 * história que a criança vai ouvir daqui a dez anos. Em que escola, em que
 * série, com quem.
 */
function FolhaConquista({ onFechar, onSalvou }: {
  onFechar: () => void; onSalvou: () => void;
}) {
  const [tipos, setTipos] = useState<{ cod: string; label: string; icone: string }[]>([]);
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([]);
  const [d, setD] = useState({
    personId: '', tipo: 'aprovacao_escolar', tipoOutro: '',
    quando: '', descricao: '', instituicao: '',
  });
  const [arquivo, setArquivo] = useState<{ nome: string; base64: string } | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api<{ tipos: any[] }>('/impacto/kinds').then((v) => setTipos(v.tipos)).catch(() => setTipos([]));
    api<{ id: string; nome: string }[]>('/people')
      .then((r) => { setPessoas(r); setD((x) => ({ ...x, personId: r[0]?.id ?? '' })); })
      .catch(() => setPessoas([]));
  }, []);

  const pode = d.personId && d.descricao.trim().length >= 10
    && (d.tipo !== 'outro' || d.tipoOutro.trim().length >= 2);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-cq"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-cq">Registrar conquista</h3>
        <p className="mutetxt">
          O marco é da criança; a casa é onde ela estava. Isto entra no histórico dela e
          pode sair em relatório da Fundação.
        </p>

        <label className="f" htmlFor="cq-p">Quem</label>
        <select id="cq-p" value={d.personId}
                onChange={(e) => setD({ ...d, personId: e.target.value })}>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        <label className="f" htmlFor="cq-t">O que foi</label>
        <select id="cq-t" value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value })}>
          {tipos.map((t) => (
            <option key={t.cod} value={t.cod}>{t.icone} {t.label}</option>
          ))}
        </select>
        {d.tipo === 'outro' && (
          <>
            <label className="f" htmlFor="cq-o">Qual foi a conquista</label>
            <input id="cq-o" value={d.tipoOutro}
                   onChange={(e) => setD({ ...d, tipoOutro: e.target.value })} />
          </>
        )}

        <label className="f" htmlFor="cq-q">Quando</label>
        <input id="cq-q" type="date" value={d.quando}
               onChange={(e) => setD({ ...d, quando: e.target.value })} />

        <label className="f" htmlFor="cq-d">
          A história <small>— o tipo já diz a categoria; aqui vai o que aconteceu</small>
        </label>
        <textarea id="cq-d" value={d.descricao}
                  onChange={(e) => setD({ ...d, descricao: e.target.value })}
                  placeholder="Ex.: passou para o 7º ano na Escola Fictícia, com recuperação em matemática vencida no fim do ano." />

        <label className="f" htmlFor="cq-i">Escola, curso ou empresa</label>
        <input id="cq-i" value={d.instituicao}
               onChange={(e) => setD({ ...d, instituicao: e.target.value })} />

        <label className="f">
          Comprovante <small>— diploma, certificado, carteira. PDF, JPG ou PNG, opcional</small>
        </label>
        <input type="file" accept="application/pdf,image/*" onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) { setArquivo(null); return; }
          const r = new FileReader();
          r.onload = () => setArquivo({ nome: f.name, base64: String(r.result).split(',')[1] ?? '' });
          r.readAsDataURL(f);
        }} />

        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode || ocupado} onClick={async () => {
            setOcupado(true); setErro('');
            try {
              await api('/impacto/marcos', {
                method: 'POST',
                body: JSON.stringify({
                  ...d, quando: d.quando || undefined,
                  descricao: d.descricao.trim(),
                  conteudo: arquivo?.base64, nomeArquivo: arquivo?.nome,
                }),
              });
              onSalvou();
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível registrar.');
            } finally {
              setOcupado(false);
            }
          }}>{ocupado ? 'Registrando…' : 'Registrar'}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * A TRAJETÓRIA DE UMA CRIANÇA.
 *
 * O que foi conquistado, e as casas por onde ela passou. Saúde, ocorrência e
 * conteúdo judicial não entram: para isso existem as telas do caso, com o
 * alcance de quem cuida dele. Uma visão de impacto que abrisse o prontuário
 * viraria outra coisa.
 */
function Trajetoria({ personId, onVoltar }: { personId: string; onVoltar: () => void }) {
  const [t, setT] = useState<any>(null);
  const [doc, setDoc] = useState<DocumentoWord | null>(null);
  const [erro, setErro] = useState('');
  const [vendoComprovante, setVendoComprovante] = useState<{ id: string; o: string } | null>(null);

  useEffect(() => {
    api(`/impacto/trajetoria/${personId}`).then(setT)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível abrir.'));
  }, [personId]);

  if (erro) return (<><button className="btn sm ghost" onClick={onVoltar}>← Voltar</button>
    <div className="notice c-crit" role="alert">{erro}</div></>);
  if (!t) return <p className="mutetxt">Carregando…</p>;

  return (
    <>
      <button className="btn sm ghost" onClick={onVoltar}>← O trabalho social</button>
      <h2>{t.acolhido}</h2>
      {/*
        * A HISTÓRIA DELA, EM FOLHA.
        *
        * É o documento que o Juízo mais pergunta e que o sistema não tinha. Ele
        * não substitui o relatório técnico — e a própria folha diz isso, porque
        * quem recebe papel timbrado numa audiência não tem obrigação de saber a
        * diferença.
        */}
      <div className="acoes">
        <button className="btn sm sec" onClick={async () => {
          try {
            setDoc(await api<DocumentoWord>(`/impacto/trajetoria/${personId}/folha`));
          } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível montar a folha.');
          }
        }}>📄 A trajetória em Word</button>
      </div>
      <div className="mutetxt">
        Acolhida desde {dia(t.acolhidoDesde)} ·{' '}
        {t.casasPorOndePassou.map((c: any) => c.casa).join(' → ')}
      </div>

      <div className="eyebrow" style={{ marginTop: 12 }}>
        O que ela conquistou · {t.marcos.length}
      </div>
      {!t.marcos.length && (
        <p className="mutetxt">
          Nada registrado ainda. Isso não é uma avaliação dela: é a informação de que
          ninguém escreveu.
        </p>
      )}
      <div className="stack">
        {t.marcos.map((m: any) => (
          <div key={m.id} className="card">
            <div className="row">
              <span aria-hidden="true">{m.icone}</span>
              <b className="ff grow">{m.tipoRotulo}</b>
              <span className="pill c-info">{dia(m.quando)}</span>
            </div>
            <div>{m.descricao}</div>
            {m.instituicao && <div className="mutetxt">{m.instituicao}</div>}
            {m.temComprovante && (
              /* O comprovante é a prova da conquista — e é o documento que a
               * criança vai querer ter na mão quando sair do acolhimento.
               * Guardar sem poder ler seria guardar nada; e só baixar, sem
               * abrir, obriga a tirar uma cópia do sistema para descobrir se é
               * o diploma certo (fase 106, §9). Abre aqui, e baixa depois. */
              <BotaoOlho rotulo="Ver o comprovante"
                         onClick={() => setVendoComprovante({ id: m.id, o: m.tipoRotulo })} />
            )}
            <div className="mutetxt">registrado por {m.por}</div>
          </div>
        ))}
      </div>
      <p className="mutetxt" style={{ marginTop: 12 }}>{t.aviso}</p>

      {doc && (
        <FolhaDocumento doc={doc} onFechar={() => setDoc(null)}
                        exportar={(finalidade) => api<ArquivoGerado>(
                          `/impacto/trajetoria/${personId}/export`,
                          { method: 'POST', body: JSON.stringify({ finalidade }) })} />
      )}

      {vendoComprovante && (
        <FolhaArquivo
          titulo={`Comprovante · ${vendoComprovante.o}`}
          legenda="A prova da conquista. É o documento que ela leva quando sair daqui."
          carregar={() => api<{ nome: string; tipo: string; conteudo: string }>(
            `/impacto/marcos/${vendoComprovante.id}/comprovante`)}
          onFechar={() => setVendoComprovante(null)}
          onBaixar={(a) => baixarArquivo(a.nome, a.tipo, a.conteudo)} />
      )}
    </>
  );
}
