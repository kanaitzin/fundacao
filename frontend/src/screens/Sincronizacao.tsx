import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

/**
 * SINCRONIZAÇÃO — o que ficou pendurado entre o aparelho e o servidor (§17).
 *
 * `GET /sync/status`, `GET /sync/conflicts` e `POST /sync/conflicts/:id/resolve`
 * existiam desde a fase 3 e nunca tiveram tela. O conflito é gravado, a regra
 * do §17.4 é cumprida — as duas versões ficam inteiras, ninguém escolhe por
 * ninguém — e a decisão humana que ela exige **não tinha por onde ser tomada**.
 * Na prática: um registro feito sem sinal, que colidiu com outro, ficava
 * parado para sempre num estado que o sistema chama de "aguardando decisão
 * humana" e que nenhum humano conseguia ver.
 *
 * TRÊS COISAS QUE ESTA TELA FAZ DE PROPÓSITO:
 *
 *  * **mostra as duas versões inteiras, lado a lado, e não escolhe.** Nem
 *    destaca uma. O sistema não sabe qual está certa — quem estava na casa
 *    sabe, e é essa pessoa que decide;
 *  * **a decisão pede texto, e o texto é o registro.** "Resolver" aqui não
 *    apaga nem sobrescreve nada: grava o que a equipe concluiu, com nome e
 *    horário, ao lado das duas versões que continuam existindo;
 *  * **vazio é boa notícia, e diz isso.** Uma tela de conflitos em branco
 *    precisa dizer que está em branco porque não há conflito — e não porque
 *    não carregou.
 *
 * O que ela NÃO é: a fila offline. Guardar as operações no aparelho, enviar ao
 * reconectar e limpar só o que foi aplicado é fase própria, do lado do PWA.
 * Esta é a metade que já existe no servidor e faltava do lado de quem decide.
 */

interface Status {
  aplicadas: number;
  conflitos: number;
  ultimaSincronizacao: string | null;
  tiposSuportados: string[];
}

interface Conflito {
  id: string; entidade: string; entidadeId: string | null; tipo: string;
  descricao: string;
  versaoA: unknown; versaoB: unknown;
  criadoEm: string;
  aviso: string;
}

const quando = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('pt-BR',
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo' });
};

/** O rótulo do tipo de operação, com a palavra que a casa usa. */
const TIPO: Record<string, string> = {
  'medication.confirm': 'Confirmação de dose',
  'activity.record': 'Registro de atividade',
  'check.confirm': 'Conferência da chamada',
  'handover.sign': 'Assinatura de passagem',
  'handover.receipt': 'Recebimento do turno',
  'incident.open': 'Abertura de ocorrência',
};

/**
 * Uma versão do registro, desenhada campo a campo.
 *
 * Sem tabela e sem JSON cru: quem decide qual versão vale é a educadora ou a
 * coordenação, e um bloco de chaves e colchetes empurra a decisão para quem
 * lê código — que não é quem estava na casa naquela hora.
 */
function Versao({ titulo, dados }: { titulo: string; dados: unknown }) {
  const linhas = dados && typeof dados === 'object' && !Array.isArray(dados)
    ? Object.entries(dados as Record<string, unknown>)
    : [];
  return (
    <div className="card stack" style={{ marginTop: 0 }}>
      <b className="ff">{titulo}</b>
      {linhas.length === 0 ? (
        <pre className="bloco mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(dados, null, 2)}
        </pre>
      ) : (
        <ul className="lista">
          {linhas.map(([chave, valor]) => (
            <li key={chave}>
              <span className="mutetxt">{chave}</span>
              <div className="ff">
                {valor === null || valor === undefined || valor === ''
                  ? '(em branco)'
                  : typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Sincronizacao({ houseId, casaLabel, papel }: {
  houseId: string; casaLabel: string; papel: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [resolvendo, setResolvendo] = useState<Conflito | null>(null);

  /* Quem registra a decisão — a mesma lista de `SyncService.resolveConflict`. */
  const resolve = ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(papel);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      // O status é do USUÁRIO (o que este aparelho enviou) e os conflitos são
      // da CASA. São perguntas diferentes, e a tela não as mistura.
      const [s, c] = await Promise.all([
        api<Status>('/sync/status'),
        api<Conflito[]>(`/sync/conflicts?houseId=${houseId}`),
      ]);
      setStatus(s); setConflitos(c);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir a sincronização.');
    }
  }, [houseId]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <>
      <div className="diahead">
        <div>
          <div className="eyebrow" style={{ margin: 0 }}>{casaLabel}</div>
          <h2>Sincronização</h2>
        </div>
      </div>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      {/* ---------- O que este aparelho enviou ---------- */}
      <div className="card stack">
        <b className="ff">Este aparelho</b>
        {!status && !erro && <p className="mutetxt" style={{ margin: 0 }}>Abrindo…</p>}
        {status && (
          <>
            <ul className="lista">
              <li className="row">
                <span className="grow">Operações enviadas e aplicadas</span>
                <b className="ff">{status.aplicadas}</b>
              </li>
              <li className="row">
                <span className="grow">Operações que viraram conflito</span>
                <b className="ff">{status.conflitos}</b>
              </li>
            </ul>
            <div className="mutetxt">
              {status.ultimaSincronizacao
                ? `Última sincronização: ${quando(status.ultimaSincronizacao)}`
                : 'Este aparelho ainda não enviou nada — o que é normal quando a casa está '
                  + 'sempre com sinal.'}
            </div>
            <p className="mutetxt" style={{ margin: 0 }}>
              O registro feito sem sinal guarda o <b>horário real</b> do que aconteceu, e não
              o da hora em que subiu. É por isso que a dose das 21h30 continua sendo das
              21h30, mesmo tendo chegado ao servidor às 23h.
            </p>
          </>
        )}
      </div>

      {/* ---------- O que espera decisão ---------- */}
      <div className="eyebrow">
        Conflitos em aberto{conflitos.length > 0 ? ` · ${conflitos.length}` : ''}
      </div>

      {conflitos.length === 0 && !erro && (
        <div className="card">
          <p className="mutetxt" style={{ margin: 0 }}>
            <b>Nenhum conflito em aberto nesta casa.</b> Isto é o estado normal: o conflito só
            aparece quando duas versões do mesmo registro chegam ao servidor, e nenhuma delas
            pode ser descartada pelo sistema.
          </p>
        </div>
      )}

      <div className="stack">
        {conflitos.map((c) => (
          <article className="card stack" key={c.id}>
            <div className="row">
              <div className="grow">
                <b className="ff">{TIPO[c.tipo] ?? c.tipo}</b>
                <div className="mutetxt linhadois">{c.descricao}</div>
                <div className="mutetxt">Registrado em {quando(c.criadoEm) ?? '—'}</div>
              </div>
              <span className="pill c-warn">Aguardando decisão</span>
            </div>

            {/* As duas versões, íntegras e SEM destaque para nenhuma. Marcar
                uma como "provável" seria o sistema decidindo por baixo. */}
            <Versao titulo="Versão que já estava no servidor" dados={c.versaoA} />
            <Versao titulo="Versão que chegou do aparelho" dados={c.versaoB} />

            <div className="notice c-info">{c.aviso}</div>

            {resolve ? (
              <button className="btn" onClick={() => setResolvendo(c)}>
                Registrar a decisão
              </button>
            ) : (
              <p className="mutetxt" style={{ margin: 0 }}>
                Quem decide é a equipe técnica ou a coordenação. As duas versões continuam
                aqui até que alguém registre o que valeu, e por quê.
              </p>
            )}
          </article>
        ))}
      </div>

      {resolvendo && (
        <FolhaDecisao
          conflito={resolvendo}
          onFechar={() => setResolvendo(null)}
          onDecidir={async (decisao) => {
            setErro(''); setAviso('');
            try {
              const r = await api<{ aviso?: string }>(
                `/sync/conflicts/${resolvendo.id}/resolve`,
                { method: 'POST', body: JSON.stringify({ decisao }) });
              setResolvendo(null);
              setAviso(r?.aviso ?? 'Decisão registrada.');
              await carregar();
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível registrar a decisão.');
            }
          }} />
      )}
    </>
  );
}

/**
 * A FOLHA DA DECISÃO.
 *
 * Não há botão "escolher a versão A" nem "descartar a B", e a ausência é o
 * ponto: a decisão de um conflito de sincronização quase nunca é "uma está
 * certa e a outra errada" — é "a criança tomou o remédio uma vez, e duas
 * pessoas registraram". O que resolve isso é a frase que a equipe escreve, e
 * é ela que fica ao lado das duas versões para quem ler depois.
 */
function FolhaDecisao({ conflito, onFechar, onDecidir }: {
  conflito: Conflito; onFechar: () => void; onDecidir: (decisao: string) => void;
}) {
  const [decisao, setDecisao] = useState('');
  const pode = decisao.trim().length >= 15;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-sync"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-sync">Decidir · {TIPO[conflito.tipo] ?? conflito.tipo}</h3>
        <div className="notice c-info">
          Nada é apagado. As duas versões continuam registradas, e o que você escrever fica
          ao lado delas, com o seu nome e o horário — é isso que responde, meses depois, por
          que ficou assim.
        </div>

        <div className="bloco"><small>O que houve</small>{conflito.descricao}</div>

        <label className="f" htmlFor="sync-dec">
          A decisão da equipe <small>— pelo menos 15 caracteres</small>
        </label>
        <textarea id="sync-dec" value={decisao} onChange={(e) => setDecisao(e.target.value)}
                  placeholder="Ex.: a dose foi administrada uma única vez, às 21h30, pela educadora do plantão; o segundo registro é do tablet que estava sem sinal e subiu depois." />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onDecidir(decisao.trim())}>
            Registrar esta decisão
          </button>
        </div>
      </div>
    </div>
  );
}
