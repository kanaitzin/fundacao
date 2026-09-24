import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icone } from '../icones';

/**
 * ARQUIVO DOCUMENTAL (Drive institucional).
 *
 * Não é backup do sistema: banco e arquivos têm backup técnico próprio. Aqui
 * vai a CÓPIA do que a instituição fechou — ATA, passagem, ocorrência,
 * acompanhamento, relatório.
 *
 * Duas coisas que a tela precisa dizer sem letra miúda:
 *
 *  * o educador não entra no Drive. Ele lê o que precisa no perfil do
 *    acolhido, onde a leitura tem permissão e registro. Uma pasta
 *    compartilhada não sabe quem abriu o quê;
 *  * nada é sobrescrito. Correção vira V2_ADENDO, ao lado da V1. E o nome do
 *    arquivo não carrega nome, CPF nem diagnóstico: pasta sincronizada em
 *    computador pessoal não pode virar vazamento por causa de um nome.
 *
 * ROTAS — 31/08/2026. Chamava `/archive` (é `/archive/queue`),
 * `/archive/:id/retry` (não existe) e `/archive/documents` (não existe).
 * `/archive/documents` era o caso silencioso: casava com `GET /archive/:id` e
 * o servidor leria "documents" como um id.
 *
 * A aba "Documentos por acolhido" saiu, e não por falta de rota. Esses
 * documentos vivem no PERFIL do acolhido, que é onde a leitura passa por
 * permissão e deixa registro (§16.5). Uma segunda porta para o mesmo conteúdo,
 * fora do perfil, é a pasta compartilhada de novo — com outro nome.
 *
 * A retentativa também mudou de forma, porque no servidor ela é da FILA e não
 * de um item: `POST /archive/process` reenvia os próximos pendentes, e é
 * idempotente — mesmo caminho e mesma versão substituem o mesmo objeto, nunca
 * criam um segundo. Um adendo é outra versão, com outro nome.
 */

interface ItemFila {
  id: string; caminho: string; arquivo: string; entidade: string;
  versao: string; situacao: 'verificado' | 'salvo' | 'enviando' | 'aguardando' | 'falhou';
  tentativas: number; areaRestrita: boolean;
}
interface Reconciliacao {
  porCategoria: { categoria: string; aguardando: number; falhou: number; verificado: number }[];
  pendentes: number;
  aviso: string;
}
interface Detalhe {
  id: string; caminho: string; arquivo: string; categoria: string;
  entidade: string; versao: string; situacao: string; tentativas: number;
  ultimoErro: string | null; areaRestrita: boolean;
  fechadoEm: string; enviadoEm: string | null; verificadoEm: string | null;
  historico: { de: string; para: string; erro: string | null; em: string }[];
}

const TOM: Record<string, string> = {
  verificado: 'c-ok', salvo: 'c-info', enviando: 'c-info',
  aguardando: 'c-warn', falhou: 'c-crit',
};
const ROTULO: Record<string, string> = {
  verificado: 'Verificado no Drive', salvo: 'Salvo, aguardando conferência',
  enviando: 'Enviando', aguardando: 'Na fila', falhou: 'Falhou',
};

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR',
  { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo' });

/** Quem processa a fila (§16.5) — a mesma lista do servidor. */
/* alcance:arquivo — o mesmo de app_pode_ver_fila_arquivo(), desde a 0770. */
const PROCESSA = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

export function Arquivo({ houseId, papel }: { houseId: string; papel: string }) {
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [conta, setConta] = useState<Reconciliacao | null>(null);
  const [detalhe, setDetalhe] = useState<Record<string, Detalhe>>({});
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function carregar() {
    setErro('');
    try {
      const [f, r] = await Promise.all([
        api<ItemFila[]>('/archive/queue?limite=50'),
        api<Reconciliacao>(`/archive/reconcile?houseId=${houseId}`),
      ]);
      setFila(f); setConta(r); setDetalhe({}); setAberto(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.');
    }
  }
  useEffect(() => { carregar(); }, [houseId]);

  async function abrir(id: string) {
    if (aberto === id) { setAberto(null); return; }
    setAberto(id);
    if (detalhe[id]) return;
    try {
      const d = await api<Detalhe>(`/archive/${id}`);
      setDetalhe((m) => ({ ...m, [id]: d }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o item.');
    }
  }

  async function processar() {
    setErro(''); setAviso(''); setOcupado(true);
    try {
      const r = await api<{ processados: number; itens: { situacao: string }[] }>(
        '/archive/process', { method: 'POST', body: JSON.stringify({ limite: 5 }) });
      const ok = r.itens.filter((i) => i.situacao === 'verificado').length;
      const falhos = r.itens.filter((i) => i.situacao === 'falhou').length;
      setAviso(`${r.processados} item(ns) processado(s): ${ok} verificado(s) no Drive`
        + `${falhos ? `, ${falhos} ainda com falha` : ''}. O reenvio não duplica — mesmo `
        + 'caminho e mesma versão substituem o mesmo arquivo.');
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível processar a fila.');
    } finally { setOcupado(false); }
  }

  const processa = PROCESSA.includes(papel);
  const falhas = fila.filter((a) => a.situacao === 'falhou').length;
  const naFila = fila.filter((a) => ['aguardando', 'enviando'].includes(a.situacao)).length;

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

      <div className="card raise stack">
        <h3 style={{ fontSize: 17, margin: 0 }}>Arquivo documental</h3>
        <div className="mutetxt">Cópia do que fechou, no Drive institucional.</div>
        <div className="notice c-info">
          Não é backup do sistema — banco e arquivos têm backup técnico próprio. Aqui vai
          a cópia documental do que a instituição <b>fechou</b>: ATA, passagem,
          ocorrência, acompanhamento, relatório.
        </div>
        <div className="notice c-med">
          O <b>educador social não abre o Drive</b>. O que ele precisa ler do acolhido
          está no perfil, onde a leitura tem permissão e deixa registro — pasta
          compartilhada não sabe quem abriu o quê.
        </div>
        {conta && (
          conta.pendentes > 0
            ? <div className="notice c-crit">{conta.aviso}</div>
            : <div className="notice c-ok">{conta.aviso}</div>
        )}
        {processa && (
          <button className="btn block" disabled={ocupado || (falhas + naFila) === 0}
                  onClick={processar}>
            {ocupado ? 'Processando…' : 'Processar a fila agora'}
          </button>
        )}
      </div>

      {conta && conta.porCategoria.length > 0 && (
        <>
          <div className="eyebrow">Conferência por categoria</div>
          <div className="stack">
            {conta.porCategoria.map((c) => (
              <div className="card row" key={c.categoria}>
                <b className="ff grow">{c.categoria}</b>
                <span className="pill c-ok">{c.verificado} verificado(s)</span>
                {Number(c.aguardando) > 0 && <span className="pill c-warn">{c.aguardando} na fila</span>}
                {Number(c.falhou) > 0 && <span className="pill c-crit">{c.falhou} com falha</span>}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="eyebrow">
        Fila de envio{naFila ? ` · ${naFila}` : ''}{falhas ? ` · ${falhas} com falha` : ''}
      </div>
      <div className="stack">
        {fila.map((a) => {
          const d = detalhe[a.id];
          return (
            <div className="card stack" key={a.id}>
              <div className="row">
                <span className="pill c-mute">{a.entidade}</span>
                <span className="grow" />
                <span className={`pill ${TOM[a.situacao] ?? 'c-mute'}`}>
                  {ROTULO[a.situacao] ?? a.situacao}
                </span>
              </div>
              <b className="ff mono" style={{ fontSize: 13 }}>{a.arquivo}</b>
              <div className="mutetxt mono">{a.caminho}</div>
              {a.areaRestrita && (
                <div className="mutetxt"><Icone nome="cadeado" /> Área restrita — outra raiz, outra permissão.</div>
              )}
              {a.situacao === 'falhou' && (
                <div className="notice c-crit">
                  {a.tentativas} tentativa(s). A equipe técnica e a coordenação foram
                  avisadas. <b>O documento continua íntegro no sistema</b> — o que faltou
                  foi a cópia no Drive.
                </div>
              )}

              <button className="btn sm ghost" onClick={() => abrir(a.id)}>
                {aberto === a.id ? 'Fechar histórico' : 'Ver histórico de tentativas'}
              </button>
              {aberto === a.id && !d && <p className="mutetxt">Abrindo…</p>}
              {aberto === a.id && d && (
                <>
                  <div className="mutetxt">
                    Versão {d.versao} · fechado em {quando(d.fechadoEm)}
                    {d.verificadoEm ? ` · verificado em ${quando(d.verificadoEm)}` : ''}
                  </div>
                  {d.ultimoErro && <div className="mutetxt">Último erro: {d.ultimoErro}</div>}
                  <ul className="lista">
                    {d.historico.map((h, i) => (
                      <li key={i} className="mutetxt">
                        {quando(h.em)} · {h.de} → {h.para}{h.erro ? ` · ${h.erro}` : ''}
                      </li>
                    ))}
                    {d.historico.length === 0 && (
                      <li className="mutetxt">Sem tentativas registradas ainda.</li>
                    )}
                  </ul>
                </>
              )}
            </div>
          );
        })}
        {fila.length === 0 && (
          <div className="card"><p className="mutetxt" style={{ margin: 0 }}>
            Nada na fila: tudo o que fechou já foi enviado e conferido.</p></div>
        )}
      </div>

      <p className="mutetxt" style={{ marginTop: 12 }}>
        Nunca sobrescreve: correção vira <b>V2_ADENDO</b>, ao lado da V1. O nome do
        arquivo não carrega nome, CPF nem diagnóstico — quem precisa saber de quem é
        abre o sistema.
      </p>
      <p className="mutetxt" style={{ marginTop: 12 }}>
        Procurando os documentos de uma criança? Eles ficam no <b>perfil dela</b>, em
        Acolhidos. É lá que a leitura passa por permissão e deixa registro — e por isso
        não há uma segunda lista aqui.
      </p>
    </>
  );
}
