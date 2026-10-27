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
/**
 * DE ONDE O AVISO VEIO, E PARA ONDE ELE LEVA (varredura de 27/10).
 *
 * Cada tipo de registro que vira aviso no servidor tem aqui o nome da tela e a
 * aba que abre. A lista estava para trás: metade dos avisos dizia o nome cru da
 * tabela (*Continua em: medication_dose.*, no aviso da dose vencida), e nenhum
 * levava a lugar nenhum, só dizia onde procurar. O `todo-aviso-tem-destino.spec.ts`
 * lê os avisos do servidor e reprova o tipo que não estiver aqui.
 */
export const ONDE: Record<string, { tela: string; aba: string }> = {
  activity: { tela: 'O dia da casa', aba: 'dia' },
  activity_unconfirmed: { tela: 'O dia da casa', aba: 'dia' },
  birthday: { tela: 'O dia da casa', aba: 'dia' },
  substitution_request: { tela: 'Painel do plantão', aba: 'plantao' },
  ata: { tela: 'ATA', aba: 'ata' },
  ata_read_request: { tela: 'ATA', aba: 'ata' },
  general_night_ata: { tela: 'ATA', aba: 'ata' },
  shift: { tela: 'Passagem de plantão', aba: 'passagem' },
  shift_fim_aviso: { tela: 'Passagem de plantão', aba: 'passagem' },
  incident: { tela: 'Ocorrências', aba: 'ocorrencias' },
  incident_review: { tela: 'Ocorrências', aba: 'ocorrencias' },
  prescription: { tela: 'Saúde', aba: 'saude' },
  medication_dose: { tela: 'Saúde', aba: 'saude' },
  medication_administration: { tela: 'Saúde', aba: 'saude' },
  health_evolution: { tela: 'Saúde', aba: 'saude' },
  hospitalization: { tela: 'Internação hospitalar', aba: 'internacao' },
  person: { tela: 'Acolhidos', aba: 'acolhidos' },
  family_stay: { tela: 'Acolhidos', aba: 'acolhidos' },
  pia: { tela: 'Acolhidos, no perfil da criança', aba: 'acolhidos' },
  document: { tela: 'Acolhidos, na aba Documentos da criança', aba: 'acolhidos' },
  followup: { tela: 'Acompanhamentos', aba: 'acompanhamentos' },
  team_meeting: { tela: 'Combinados da equipe', aba: 'alinhamentos' },
  meeting_agenda_item: { tela: 'Combinados da equipe', aba: 'alinhamentos' },
  archive: { tela: 'Arquivo documental', aba: 'arquivo' },
  archive_item: { tela: 'Arquivo documental', aba: 'arquivo' },
  transfer: { tela: 'Transferências', aba: 'transferencias' },
  transfer_request: { tela: 'Transferências', aba: 'transferencias' },
  transfer_message: { tela: 'Transferências', aba: 'transferencias' },
  transfer_decision: { tela: 'Transferências', aba: 'transferencias' },
  sync_conflict: { tela: 'Sincronização', aba: 'sincronizacao' },
};

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR',
  { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo' });

export function Avisos({ onMudou, irPara, alcanca = () => false }: {
  onMudou?: () => void;
  /* Abrir a tela do aviso. Sem o alcance do cargo, o botão não aparece: a tela
     diz onde continuar, mas não leva a uma porta fechada. */
  irPara?: (aba: string) => void; alcanca?: (aba: string) => boolean;
}) {
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
        <div className="mutetxt">O que chegou para você.</div>
        <div className="notice c-info">
          O aviso diz o que aconteceu e onde continuar, <b>sem repetir o conteúdo</b>. Para ler
          o registro, abra a tela dele.
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
            {a.entidade && ONDE[a.entidade] && (
              <div className="mutetxt">Continua em: {ONDE[a.entidade].tela}.</div>
            )}
            <div className="row">
              {a.entidade && ONDE[a.entidade] && irPara && alcanca(ONDE[a.entidade].aba) && (
                <button className="btn sm sec" onClick={() => {
                  if (!a.lida) void agir(a.id, 'read');
                  irPara(ONDE[a.entidade!].aba);
                }}>
                  Abrir {ONDE[a.entidade].tela.split(',')[0]}
                </button>
              )}
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
        <b>Ler não é dar ciência.</b> O aviso fica lido quando você o abre; Estou ciente é um
        ato separado, com o seu nome e o horário, e diz que você assumiu.
      </p>
    </>
  );
}
