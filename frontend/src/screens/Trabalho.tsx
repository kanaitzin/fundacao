import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * ============================================================================
 * O TRABALHO DA EQUIPE (fase 117) — e o que esta tela não desenha.
 *
 * Pedido da Fundação em 15/09/2026: *"quero que seja possível ver todo o
 * trabalho e ações de cada educador e setor para a visão do coordenador."*
 *
 * Ela desfaz uma recusa minha, que estava escrita no `auditoria.service.ts` —
 * *"'tudo o que a Joana fez ontem' é vigilância"* — e que terminava dizendo
 * que, se a Fundação pedisse, viraria OUTRO CAMINHO, com finalidade escrita e
 * registro da própria consulta. É este. A auditoria da criança não mudou.
 *
 * O QUE NÃO EXISTE AQUI, E É METADE DO DESENHO:
 *
 *  * **nenhum número.** Nem "34 doses", nem "12 linhas de ATA", nem média,
 *    nem barra, nem percentual. A tela responde *"o que a Joana fez na
 *    terça"*; não responde *"quem fez mais"*. Um número sobrevive ao contexto
 *    que o explicava: daqui a seis meses o total continua, e a noite em que
 *    ela ficou com uma criança no colo, não;
 *  * **nenhuma lista de pessoas lado a lado.** Abrir um SETOR devolve o
 *    trabalho do setor em ordem de acontecimento, com o nome em cada linha —
 *    e não uma coluna por pessoa, que é a mesma comparação com outro desenho;
 *  * **nenhum horário de entrada e saída.** Login e logout não têm casa e
 *    ficam de fora pela própria consulta do servidor. Supervisão que mostra
 *    horário de chegada é controle de ponto, e ninguém pediu isso.
 *
 * E a FINALIDADE é pedida antes, não depois: quem abre escreve por quê, e a
 * frase fica registrada com o nome de quem olhou. Quem consulta também é
 * consultável — é a mesma regra do cofre de acessos e do relato restrito.
 * ============================================================================
 */

interface SetorOpcao { cod: string; label: string; descricao: string }
interface Vocabulario {
  setores: SetorOpcao[]; janelaMaximaDias: number;
  aviso: string; sobreAFinalidade: string;
  /** O servidor diz se a aba de contagens existe para quem abriu (fase 119). */
  temMetricas: boolean;
}
/**
 * AS CONTAGENS (fase 119).
 *
 * Decisão da Fundação em 15/09: *"o gestor vê tudo o que ele quiser, em uma
 * visão apenas contagens e métricas."* A fase 117 tinha deixado o Gestor Geral
 * de fora, e a ausência estava escrita como decisão minha, sujeita à dele.
 *
 * **A ordem desta tela é por nome, nunca por total** — e isso não é detalhe de
 * apresentação: a lista ordenada por número JÁ É a classificação, e ela
 * apareceria sem ninguém ter decidido fazê-la. Quem quiser ordenar por total
 * ordena na cabeça, e vai saber que está fazendo isso.
 */
interface Metricas {
  de: string; ate: string;
  porCasa: { casa: string; quantos: number }[];
  porSetor: { setor: string; quantos: number }[];
  porPessoa: { quem: string; cargo: string; quantos: number }[];
  porAcao: { acao: string; codigo: string; quantos: number }[];
  aviso: string; sobreCriancas: string;
}
interface Membro {
  id: string; nome: string; cargo: string; setor: string; ativo: boolean;
}
interface Linha {
  id: string; quando: string; acao: string; codigo: string;
  quem: string; cargo: string; casa: string | null;
  entidade: string | null; entidadeId: string | null;
  finalidadeDeclarada: string | null;
}
interface Resposta {
  de: string; ate: string; cortado: boolean; linhas: Linha[]; aviso: string;
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
const diaDe = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo',
});

export function Trabalho() {
  const [voc, setVoc] = useState<Vocabulario | null>(null);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [alvo, setAlvo] = useState('');            // "pessoa:<id>" ou "setor:<cod>"
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [r, setR] = useState<Resposta | null>(null);
  const [erro, setErro] = useState('');
  const [buscando, setBuscando] = useState(false);
  /** 'trabalho' é a leitura detalhada; 'contagens' é a visão do Gestor Geral. */
  const [visao, setVisao] = useState<'trabalho' | 'contagens'>('trabalho');
  const [m, setM] = useState<Metricas | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setVoc(await api<Vocabulario>('/staff/work/options'));
        /* A lista de pessoas vem da mesma rota do cadastro de equipe. Se o
           cargo não a alcança — é o caso do Líder Diurno —, a busca por SETOR
           continua inteira: é por isso que o erro aqui não derruba a tela. */
        setMembros(await api<Membro[]>('/staff').catch(() => []));
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível abrir esta tela.');
      }
    })();
  }, []);

  async function buscar() {
    setErro(''); setR(null);
    const [tipo, valor] = alvo.split(':');
    if (!tipo || !valor) { setErro('Escolha uma pessoa da equipe ou um setor.'); return; }
    if (finalidade.trim().length < 10) {
      setErro('Escreva a finalidade desta consulta — ela fica registrada com o seu nome.');
      return;
    }
    setBuscando(true);
    try {
      setR(await api<Resposta>('/staff/work', {
        method: 'POST',
        body: JSON.stringify({
          pessoaId: tipo === 'pessoa' ? valor : null,
          setor: tipo === 'setor' ? valor : null,
          de: de || undefined, ate: ate || undefined,
          finalidade: finalidade.trim(),
        }),
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o período.');
    } finally {
      setBuscando(false);
    }
  }

  async function contar() {
    setErro(''); setM(null);
    if (finalidade.trim().length < 10) {
      setErro('Escreva a finalidade desta consulta — ela fica registrada com o seu nome.');
      return;
    }
    setBuscando(true);
    try {
      setM(await api<Metricas>('/staff/work/metrics', {
        method: 'POST',
        body: JSON.stringify({ de: de || undefined, ate: ate || undefined,
                               finalidade: finalidade.trim() }),
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir as contagens.');
    } finally {
      setBuscando(false);
    }
  }

  if (erro && !voc) {
    return <div className="notice c-crit" role="alert">{erro}</div>;
  }

  return (
    <>
      <div className="diahead">
        <div>
          <h2>O trabalho da equipe</h2>
          <p className="mutetxt">
            O que uma pessoa ou um setor registrou, em ordem, nas casas que você alcança.
          </p>
        </div>
      </div>

      {/* As duas visões, e só para quem tem as duas. Desenhar uma aba que
          responde 403 ensina que o sistema é caprichoso — por isso quem decide
          se ela existe é o servidor, no `temMetricas`. */}
      {voc?.temMetricas && (
        <div className="filtros" role="tablist" aria-label="Como ver">
          <button role="tab" aria-selected={visao === 'trabalho'}
                  className={visao === 'trabalho' ? 'on' : ''}
                  onClick={() => { setVisao('trabalho'); setErro(''); }}>
            O trabalho, em ordem
          </button>
          <button role="tab" aria-selected={visao === 'contagens'}
                  className={visao === 'contagens' ? 'on' : ''}
                  onClick={() => { setVisao('contagens'); setErro(''); }}>
            Contagens
          </button>
        </div>
      )}

      {/* O aviso vem do SERVIDOR, e não daqui: a regra é dele, e uma tela que
          escrevesse a própria versão dela começaria a divergir no primeiro
          ajuste. */}
      {voc && visao === 'trabalho' && (
        <div className="notice c-info" role="status">{voc.aviso}</div>
      )}

      {visao === 'trabalho' && (
      <>
      <label className="f" htmlFor="tr-alvo">Quem, ou qual setor</label>
      <select id="tr-alvo" value={alvo} onChange={(e) => setAlvo(e.target.value)}>
        <option value="">Escolha…</option>
        {membros.length > 0 && (
          <optgroup label="Pessoas da equipe">
            {membros.filter((m) => m.ativo).map((m) => (
              <option key={m.id} value={`pessoa:${m.id}`}>{m.nome} — {m.setor}</option>
            ))}
          </optgroup>
        )}
        <optgroup label="Setores">
          {(voc?.setores ?? []).map((s) => (
            <option key={s.cod} value={`setor:${s.cod}`}>{s.label}</option>
          ))}
        </optgroup>
      </select>
      </>
      )}

      <div className="row">
        <div className="grow">
          <label className="f" htmlFor="tr-de">De</label>
          <input id="tr-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="grow">
          <label className="f" htmlFor="tr-ate">Até</label>
          <input id="tr-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>
      <p className="mutetxt">
        Sem datas, são os últimos catorze dias. O período vai até{' '}
        {voc?.janelaMaximaDias ?? 92} dias — mais que três meses não é supervisão, é dossiê.
      </p>

      {/* A FINALIDADE vem ANTES do botão, e não numa confirmação depois: quem
          escreve o motivo antes de olhar pensa no motivo; quem escreve depois
          preenche um campo. */}
      <label className="f" htmlFor="tr-fim">
        Por que está abrindo <small>— fica registrado com o seu nome</small>
      </label>
      <textarea id="tr-fim" value={finalidade} onChange={(e) => setFinalidade(e.target.value)}
                placeholder="Ex.: apuração do episódio de 12/09 · preparação da avaliação semestral" />
      {voc && <p className="mutetxt">{voc.sobreAFinalidade}</p>}

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      <button className="btn block"
              onClick={() => void (visao === 'trabalho' ? buscar() : contar())}
              disabled={buscando}>
        {buscando ? 'Abrindo…' : visao === 'trabalho' ? 'Abrir o período' : 'Contar o período'}
      </button>

      {m && visao === 'contagens' && (
        <>
          {/* O AVISO VEM ANTES DOS NÚMEROS, e não depois: é a razão pela qual
              esta tela não existia, e ela não deixou de valer por a decisão ter
              sido tomada. */}
          <div className="notice c-warn" role="status" style={{ marginTop: 14 }}>
            <b>{m.aviso}</b>
            <div style={{ marginTop: 6 }}>{m.sobreCriancas}</div>
          </div>
          <Contagem titulo="Por unidade" linhas={
            m.porCasa.map((x) => ({ rotulo: x.casa, quantos: x.quantos }))} />
          <Contagem titulo="Por setor" linhas={
            m.porSetor.map((x) => ({ rotulo: x.setor, quantos: x.quantos }))} />
          <Contagem titulo="Por pessoa" linhas={
            m.porPessoa.map((x) => ({ rotulo: x.quem, nota: x.cargo, quantos: x.quantos }))} />
          <Contagem titulo="Por tipo de registro" linhas={
            m.porAcao.map((x) => ({ rotulo: x.acao, quantos: x.quantos }))} />
          {m.porCasa.length === 0 && (
            <p className="mutetxt">Nenhum registro no período.</p>
          )}
        </>
      )}

      {r && (
        <>
          <div className="notice c-info" role="status" style={{ marginTop: 14 }}>
            {diaDe(`${r.de}T12:00:00-03:00`)} a {diaDe(`${r.ate}T12:00:00-03:00`)}. {r.aviso}
          </div>
          {r.cortado && (
            <div className="notice c-warn" role="status">
              O período tem mais do que cabe numa leitura. Estreite as datas para ver o resto —
              e note que esta tela não diz <b>quantos</b> registros existem, de propósito.
            </div>
          )}
          <ul className="lista">
            {r.linhas.map((l) => (
              <li key={l.id}>
                <div className="grow">
                  <b className="ff">{l.acao}</b>
                  <div className="mutetxt linhadois">
                    {quando(l.quando)} · {l.quem}
                    {l.cargo ? ` (${l.cargo})` : ''}
                    {l.casa ? ` · ${l.casa}` : ''}
                  </div>
                  {/* A finalidade que a PESSOA declarou quando fez aquilo. É o
                      que explica metade das linhas sensíveis, e é o que falta
                      em toda planilha de controle. */}
                  {l.finalidadeDeclarada && (
                    <p className="bloco" style={{ marginBottom: 0 }}>
                      <small>Finalidade declarada na hora</small>{l.finalidadeDeclarada}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * UMA LISTA DE CONTAGENS — e por que ela não tem barra nem ordenação.
 *
 * Sem gráfico de barras: a barra é uma comparação desenhada, e ela transforma
 * "quatro" e "onze" numa imagem de quem trabalhou mais antes de qualquer
 * conversa. Sem ordenar por total, pelo mesmo motivo — a ordem vem do servidor,
 * por nome. E sem cor: a cor comunica estado operacional neste sistema, e um
 * número baixo não é um estado, é um número.
 */
function Contagem({ titulo, linhas }: {
  titulo: string;
  linhas: { rotulo: string; nota?: string; quantos: number }[];
}) {
  if (linhas.length === 0) return null;
  return (
    <>
      <div className="eyebrow">{titulo}</div>
      <ul className="lista">
        {linhas.map((l) => (
          <li key={`${titulo}-${l.rotulo}`}>
            <div className="grow">
              <b className="ff">{l.rotulo}</b>
              {l.nota && <div className="mutetxt linhadois">{l.nota}</div>}
            </div>
            <span className="mono">{l.quantos}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
