import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * AVISOS (§19) — a caixa de entrada do escalonamento.
 *
 * O sistema escalona desde a fase 3: ATA fechada com pendência avisa a equipe
 * técnica e a coordenação; dose sem confirmação sobe de nível; ocorrência
 * crítica encerrada pelo líder fica aguardando análise e avisa quem responde;
 * falha do Drive na terceira tentativa chama alguém. **Nada disso tinha tela.**
 * O servidor mandava avisos para uma caixa que ninguém abria.
 *
 * Três decisões que esta tela carrega:
 *
 *  * **ler não é dar ciência.** "Li" acontece ao abrir; "estou ciente" é um
 *    ato separado, com registro em auditoria. Numa casa, "eu vi passar" e "eu
 *    assumi" são coisas diferentes, e a diferença aparece quando alguém
 *    pergunta quem sabia;
 *  * **o aviso não repete o conteúdo.** Ele diz que existe algo e para onde
 *    ir. Quem precisa do fato abre a ocorrência, a ATA, o painel — onde a
 *    permissão é conferida de novo;
 *  * **prioridade é da situação, não da pessoa.** "Crítica" fala do fato que
 *    está esperando; não é nota de desempenho de ninguém.
 */

interface Aviso {
  id: string; titulo: string; texto: string; prioridade: string;
  entidade: string | null; entidadeId: string | null;
  lida: boolean; ciente: boolean; em: string;
}

const TOM: Record<string, string> = {
  critica: 'c-crit', alta: 'c-warn', normal: 'c-info', baixa: 'c-mute',
};
const ROTULO: Record<string, string> = {
  critica: 'Crítica', alta: 'Alta', normal: 'Normal', baixa: 'Informativa',
};
/** De onde o aviso veio — para a pessoa saber onde continuar. */
const ONDE: Record<string, string> = {
  ata: 'ATA', incident: 'Ocorrências', incident_review: 'Ocorrências',
  medication_administration: 'Saúde', prescription: 'Saúde',
  archive: 'Arquivo documental', activity: 'O dia da casa',
  followup: 'Acompanhamentos', transfer: 'Transferências',
  health_evolution: 'Saúde',
};

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR',
  { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo' });

export function Avisos({ onMudou }: { onMudou?: () => void }) {
  const [lista, setLista] = useState<Aviso[]>([]);
  const [so, setSo] = useState<'todos' | 'nao_lidos'>('nao_lidos');
  const [erro, setErro] = useState('');

  async function carregar(filtro = so) {
    setErro('');
    try {
      // A rota vai escrita, e não montada dentro da string: é assim que o
      // teste de contrato consegue conferir se ela existe no servidor.
      setLista(filtro === 'nao_lidos'
        ? await api<Aviso[]>('/notifications?unread=true')
        : await api<Aviso[]>('/notifications'));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os avisos.');
    }
  }
  useEffect(() => { carregar(); }, []);

  async function agir(id: string, acao: 'read' | 'acknowledge') {
    setErro('');
    try {
      // Duas rotas escritas por extenso, pelo mesmo motivo: `${acao}` no meio
      // do caminho esconde do verificador qual rota está sendo chamada.
      if (acao === 'read') await api(`/notifications/${id}/read`, { method: 'POST', body: '{}' });
      else await api(`/notifications/${id}/acknowledge`, { method: 'POST', body: '{}' });
      await carregar();
      // O sino da barra de cima conta os não lidos: ele precisa saber agora,
      // e não daqui a dois minutos.
      onMudou?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
    }
  }

  const naoLidos = lista.filter((a) => !a.lida).length;

  return (
    <>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      <div className="card raise stack">
        <h3 style={{ fontSize: 17, margin: 0 }}>Avisos</h3>
        <div className="mutetxt">O que o sistema escalou para você.</div>
        <div className="notice c-info">
          O aviso diz que existe algo e onde continuar — <b>não repete o conteúdo</b>.
          Quem precisa do fato abre a tela dele, onde a permissão é conferida de novo.
        </div>
      </div>

      <div className="filtros" role="tablist" aria-label="Filtro dos avisos">
        <button role="tab" aria-selected={so === 'nao_lidos'} className={so === 'nao_lidos' ? 'on' : ''}
                onClick={() => { setSo('nao_lidos'); carregar('nao_lidos'); }}>
          Não lidos{naoLidos ? ` · ${naoLidos}` : ''}
        </button>
        <button role="tab" aria-selected={so === 'todos'} className={so === 'todos' ? 'on' : ''}
                onClick={() => { setSo('todos'); carregar('todos'); }}>
          Tudo
        </button>
      </div>

      <div className="stack" style={{ marginTop: 12 }}>
        {lista.map((a) => (
          <div className={`card stack ${a.lida ? 'feito' : ''}`} key={a.id}>
            <div className="row">
              <span className={`pill ${TOM[a.prioridade] ?? 'c-mute'}`}>
                {ROTULO[a.prioridade] ?? a.prioridade}
              </span>
              <span className="grow" />
              <span className="mutetxt">{quando(a.em)}</span>
            </div>
            <b className="ff">{a.titulo}</b>
            <div>{a.texto}</div>
            {a.entidade && (
              <div className="mutetxt">Continua em: {ONDE[a.entidade] ?? a.entidade}.</div>
            )}
            <div className="row">
              {a.ciente ? (
                <span className="pill c-ok">Ciência registrada</span>
              ) : (
                <>
                  {!a.lida && (
                    <button className="btn sm ghost" onClick={() => agir(a.id, 'read')}>
                      Marcar como lido
                    </button>
                  )}
                  <button className="btn sm" onClick={() => agir(a.id, 'acknowledge')}>
                    Estou ciente
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {lista.length === 0 && (
          <div className="card">
            <p className="mutetxt" style={{ margin: 0 }}>
              {so === 'nao_lidos'
                ? 'Nada esperando você. Toque em "Tudo" para ver os avisos já lidos.'
                : 'Nenhum aviso até agora.'}
            </p>
          </div>
        )}
      </div>

      <p className="mutetxt" style={{ marginTop: 12 }}>
        <b>Ler não é dar ciência.</b> "Li" acontece ao abrir; "estou ciente" é um ato
        separado, com o seu nome e o horário. Numa casa, "eu vi passar" e "eu assumi" são
        coisas diferentes — e a diferença aparece quando alguém pergunta quem sabia.
      </p>
    </>
  );
}
