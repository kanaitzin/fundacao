import { useState } from 'react';
import { api, setToken } from './api';
import logo from './assets/logo.png';
import { Login } from './screens/Login';
import { PrimeiroAcesso } from './screens/PrimeiroAcesso';
import { SenhaPessoal } from './screens/SenhaPessoal';
import { Equipe } from './screens/Equipe';
import { Dia } from './screens/Dia';
import { PainelPlantao } from './screens/PainelPlantao';
import { DiaDasUnidades } from './screens/DiaDasUnidades';
import { Chamada } from './screens/Chamada';
import { Passagem } from './screens/Passagem';
import { Acolhidos } from './screens/Acolhidos';
import { Agenda } from './screens/Agenda';
import { Saude } from './screens/Saude';
import { Ocorrencias } from './screens/Ocorrencias';
import { Ata } from './screens/Ata';
import { Cofre } from './screens/Cofre';
import { Transferencias } from './screens/Transferencias';
import { Acompanhamentos } from './screens/Acompanhamentos';
import { Arquivo } from './screens/Arquivo';
import { Setores } from './screens/Setores';

interface Me {
  id: string; email: string; fullName: string; role: string;
  mustChangePassword: boolean;
  /** A conta ainda não tem senha nenhuma: o primeiro acesso é criá-la. */
  semSenha?: boolean;
  assignments: { code: string; name: string; role: string }[];
}
interface House { id: string; code: string; name: string; kind: string; }

const ROLE_LABEL: Record<string, string> = {
  gestor_geral: 'Gestor Geral', coordenador: 'Coordenação', equipe_tecnica: 'Equipe técnica',
  educador: 'Educador social', lider_diurno: 'Líder Diurno', lider_noturno_geral: 'Líder Noturno Geral',
  enfermagem: 'Enfermagem', cozinha: 'Cozinha', admin_tecnico: 'Administração técnica',
};
/** Cor por tipo de unidade — categoria, nunca ranking entre casas. */
const KIND_TONE: Record<string, string> = { casa_lar: 'c-move', abrigo_institucional: 'c-brand' };

/** As telas que não são do turno; a aba "Mais" fica acesa quando uma delas está aberta. */
const OUTRAS = new Set(['agenda', 'equipe', 'casas', 'saude', 'ocorrencias', 'ata',
  'cofre', 'transferencias', 'acompanhamentos', 'arquivo', 'setores']);

/** Quem administra equipe (§5.3). O menu não oferece o que o cargo não faz. */
const ADMINISTRA_EQUIPE = ['coordenador', 'gestor_geral', 'admin_tecnico'];

/*
 * Os demais alcances. Esconder o botão é gentileza com quem usa; a proteção
 * de verdade mora no banco, e o servidor recusa de novo por baixo.
 */
/**
 * Saúde: a Enfermagem trabalha aqui; a liderança e a gestão acompanham.
 *
 * A equipe técnica entrou em 31/08. O servidor já a autorizava a movimentar o
 * armário e a ler o painel, e o menu não oferecia a tela: permissão sem porta.
 * Na casa é ela quem costuma estar quando a Enfermagem não está, e o armário é
 * da casa. Continua sem assinar evolução de saúde — isso é da Enfermagem, e o
 * servidor recusa.
 */
const VE_SAUDE = ['enfermagem', 'equipe_tecnica', 'coordenador', 'lider_diurno',
  'lider_noturno_geral', 'gestor_geral'];
/** O cofre guarda as contas das crianças: só quem tem a guarda entra. */
const VE_COFRE = ['coordenador', 'gestor_geral'];
/** Acompanhar e relatar é da técnica, com aprovação da coordenação. */
const VE_ACOMPANHAMENTOS = ['equipe_tecnica', 'coordenador', 'gestor_geral'];
/** Transferir criança de casa é decisão de coordenação. */
const VE_TRANSFERENCIAS = ['coordenador', 'gestor_geral'];
/**
 * O Drive não abre para o plantão: o educador lê o perfil, com registro.
 *
 * A administração técnica entrou em 31/08, e só pela fila: reenviar o que
 * falhou é trabalho de infraestrutura, e quando o Drive cai às 22h quem sabe
 * consertar precisa conseguir reprocessar. Ela vê nomes de arquivo e caminhos
 * — que por regra já não carregam nome, CPF nem diagnóstico — e não abre
 * perfil, ocorrência nem documento.
 */
const VE_ARQUIVO = ['equipe_tecnica', 'coordenador', 'gestor_geral', 'admin_tecnico'];

/**
 * Só no protótipo, e desde a tela de entrada: quem abre o arquivo precisa
 * saber, antes de digitar qualquer coisa, que nada ali é real e nada fica
 * salvo — senão alguém um dia usa isto para anotar o dia de uma criança de
 * verdade.
 */
function Tarja() {
  if (import.meta.env.VITE_PROTOTIPO !== '1') return null;
  return <div className="tarja">Protótipo · dados fictícios · nada é salvo ao fechar</div>;
}

/**
 * Seletor de cargo — só aparece no protótipo.
 * Permite alternar entre funções sem sair do sistema, para avaliação do design.
 */
const CARGOS_DEMO = [
  { value: 'coordenador',         label: '👩‍💼 Coordenação' },
  { value: 'equipe_tecnica',      label: '🧠 Equipe técnica' },
  { value: 'educador',            label: '🏫 Educador social' },
  { value: 'lider_diurno',        label: '☀️ Líder Diurno' },
  { value: 'lider_noturno_geral', label: '🌙 Líder Noturno' },
  { value: 'enfermagem',          label: '🩺 Enfermagem' },
  { value: 'cozinha',             label: '🍽️ Cozinha' },
  { value: 'admin_tecnico',       label: '🗂️ Administração técnica' },
  { value: 'gestor_geral',        label: '🏛️ Gestor Geral' },
];

function TrocaCargo({ cargoAtual, onChange }: { cargoAtual: string; onChange: (role: string) => void }) {
  if (import.meta.env.VITE_PROTOTIPO !== '1') return null;
  return (
    <div className="troca-cargo">
      <span className="troca-cargo-label">👁 Ver como:</span>
      <select
        value={cargoAtual}
        onChange={(e) => onChange(e.target.value)}
        className="troca-cargo-sel"
        aria-label="Trocar cargo para visualização"
      >
        {CARGOS_DEMO.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    </div>
  );
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aba, setAba] = useState<
    'dia' | 'chamada' | 'passagem' | 'acolhidos' | 'agenda' | 'casas' | 'equipe'
    | 'saude' | 'ocorrencias' | 'ata' | 'cofre' | 'transferencias'
    | 'acompanhamentos' | 'arquivo' | 'plantao' | 'unidades' | 'setores'>('dia');
  const [sugerirSenha, setSugerirSenha] = useState(false);
  const [trocarSenha, setTrocarSenha] = useState(false);
  const [mais, setMais] = useState(false);
  /*
   * O convite chega pela URL, no link do e-mail. Lido UMA vez, na montagem, e
   * apagado da barra de endereço logo em seguida: token em URL fica no
   * histórico do navegador, e o aparelho da casa é compartilhado entre turnos.
   */
  const [convite, setConvite] = useState(() => {
    const t = new URLSearchParams(window.location.search).get('convite') ?? '';
    if (t) window.history.replaceState({}, '', window.location.pathname);
    return t;
  });

  async function entrar(email: string, password: string) {
    setErro(''); setOcupado(true);
    try {
      const res = await api<{ token: string }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      const eu = await api<Me>('/users/me');
      setMe(eu);
      setHouses(await api<House[]>('/houses'));
      // Quem trabalha no plantão abre no DIA. É a tela que ele veio usar; a
      // lista de unidades é consulta, não trabalho.
      setAba('dia');
      if (eu.semSenha || eu.mustChangePassword) setSugerirSenha(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setOcupado(false);
    }
  }

  /** Sessão já criada pelo convite: só falta carregar quem é e abrir o DIA. */
  async function entrarComToken(t: string) {
    setErro(''); setOcupado(true);
    try {
      setToken(t);
      const eu = await api<Me>('/users/me');
      setMe(eu);
      setHouses(await api<House[]>('/houses'));
      setAba('dia');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Senha criada, mas não foi possível entrar. Tente pela tela de entrada.');
    } finally {
      setOcupado(false);
    }
  }

  async function sair() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* sessão pode já ter expirado */ }
    setToken(null); setMe(null); setHouses([]); setAba('dia'); setSugerirSenha(false);
  }

  if (!me && convite) {
    return (
      <>
        <Tarja />
        <PrimeiroAcesso convite={convite} onEntrou={(t) => { setConvite(''); entrarComToken(t); }} />
      </>
    );
  }

  if (!me) {
    return (
      <>
        <Tarja />
        <Login onSubmit={entrar} erro={erro} ocupado={ocupado} />
      </>
    );
  }

  const casa = me.assignments[0];
  const administra = ADMINISTRA_EQUIPE.includes(me.role);
  const veSaude = VE_SAUDE.includes(me.role);
  const veCofre = VE_COFRE.includes(me.role);
  const veAcompanhamentos = VE_ACOMPANHAMENTOS.includes(me.role);
  const veTransferencias = VE_TRANSFERENCIAS.includes(me.role);
  const veArquivo = VE_ARQUIVO.includes(me.role);
  // A casa de trabalho: o vínculo do usuário quando existe; senão, a primeira
  // do alcance — que é o caso das funções transversais (§5.13).
  const casaAtual = houses.find((h) => h.code === casa?.code) ?? houses[0] ?? null;

  return (
    <div className="app">
      <Tarja />
      <header className="appbar">
        <div className="top">
          <span className="logochip"><img src={logo} alt="Fundação O Pão dos Pobres" /></span>
          <span className="wordmark">Rede Acolher</span>
          <span className="rolechip">{ROLE_LABEL[me.role] ?? me.role}</span>
          <span className="grow" />
          {import.meta.env.VITE_PROTOTIPO === '1' && (
            <button className="iconbtn" title="Alternar tema claro/escuro"
                    aria-label="Alternar tema"
                    onClick={() => {
                      const root = document.documentElement;
                      root.setAttribute('data-theme',
                        root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
                    }}>🌓</button>
          )}
          <button className="iconbtn" title="Trocar minha senha" aria-label="Trocar minha senha"
                  onClick={() => setTrocarSenha(true)}>🔑</button>
          <button className="btn sm ghost" onClick={sair}>Sair</button>
        </div>
        <h1>{me.fullName}</h1>
        <div className="sub">
          {casa ? `${casa.code} — ${casa.name}` : 'Escopo institucional'} · {me.email}
        </div>
      </header>

      {/*
        A barra carrega o TURNO: as quatro telas que a pessoa de plantão abre
        dezenas de vezes. O resto — unidades, equipe, e o que a coordenação vai
        ganhar — mora em "Mais".

        Foi a tela de verdade que decidiu isso: com cinco abas, "Unidades" já
        saía pela borda do celular, e a sexta chegaria com a coordenação. Aba
        que não cabe é aba que ninguém acha.
      */}
      <TrocaCargo cargoAtual={me.role} onChange={(role) => {
        setMe({ ...me, role });
        // No protótipo o servidor de mentira precisa saber do mesmo cargo, senão
        // as áreas restritas respondem pelo cargo do login, e não pelo escolhido.
        if (import.meta.env.VITE_PROTOTIPO === '1') {
          api('/prototipo/cargo', { method: 'POST', body: JSON.stringify({ role }) })
            .catch(() => { /* o seletor é de demonstração; falhar aqui não trava a tela */ });
        }
      }} />

      <nav className="tabbar" aria-label="Seções">
        <button className={aba === 'dia' ? 'on' : ''} onClick={() => setAba('dia')}>
          <span aria-hidden="true">📋</span> Dia
        </button>
        <button className={aba === 'chamada' ? 'on' : ''} onClick={() => setAba('chamada')}>
          <span aria-hidden="true">✅</span> Chamada
        </button>
        <button className={aba === 'acolhidos' ? 'on' : ''} onClick={() => setAba('acolhidos')}>
          <span aria-hidden="true">🧒</span> Acolhidos
        </button>
        <button className={aba === 'passagem' ? 'on' : ''} onClick={() => setAba('passagem')}>
          <span aria-hidden="true">🔁</span> Passagem
        </button>
        <button className={OUTRAS.has(aba) ? 'on' : ''} onClick={() => setMais(true)}>
          <span aria-hidden="true">⋯</span> Mais
        </button>
      </nav>

      <main className="conteudo">
        {aba === 'dia' && (
          casaAtual
            ? <Dia houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`}
                   papel={me.role} />
            : (
              <div className="card">
                <p className="mutetxt" style={{ margin: 0 }}>
                  Você não tem uma unidade no seu alcance hoje. Se isso parece errado,
                  fale com a coordenação.
                </p>
              </div>
            )
        )}

        {aba === 'chamada' && casaAtual && <Chamada houseId={casaAtual.id} />}

        {aba === 'acolhidos' && casaAtual && (
          <Acolhidos houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`}
                     papel={me.role} />
        )}

        {aba === 'passagem' && casaAtual && (
          <Passagem houseId={casaAtual.id} />
        )}

        {aba === 'agenda' && casaAtual && <Agenda houseId={casaAtual.id} papel={me.role} />}

        {aba === 'unidades' && <DiaDasUnidades />}

        {aba === 'plantao' && casaAtual && (
          <PainelPlantao houseId={casaAtual.id}
                         casaLabel={`${casaAtual.code} · ${casaAtual.name}`}
                         papel={me.role} />
        )}

        {aba === 'equipe' && administra && <Equipe />}

        {aba === 'setores' && administra && <Setores papel={me.role} />}

        {aba === 'saude' && veSaude && casaAtual && (
          <Saude houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`}
                 papel={me.role} />
        )}

        {/* Ocorrência e ATA são de todo mundo do plantão: quem viu o fato é
            quem registra, e quem conduz o turno é quem fecha. */}
        {aba === 'ocorrencias' && casaAtual && <Ocorrencias houseId={casaAtual.id} papel={me.role} />}

        {aba === 'ata' && casaAtual && <Ata houseId={casaAtual.id} papel={me.role} />}

        {aba === 'cofre' && veCofre && casaAtual && (
          <Cofre houseId={casaAtual.id} papel={me.role} />
        )}

        {aba === 'transferencias' && veTransferencias && casaAtual && (
          <Transferencias houseId={casaAtual.id} />
        )}

        {aba === 'acompanhamentos' && veAcompanhamentos && <Acompanhamentos />}

        {aba === 'arquivo' && veArquivo && casaAtual && (
          <Arquivo houseId={casaAtual.id} papel={me.role} />
        )}

        {aba === 'casas' && (
          <>
            <div className="eyebrow">Unidades no seu alcance</div>
            <div className="stack">
              {houses.map((h) => (
                <div className="card row" key={h.id}>
                  <div className="grow">
                    <b className="ff">{h.code}</b>
                    <div className="mutetxt">{h.name}</div>
                  </div>
                  <span className={`pill ${KIND_TONE[h.kind] ?? 'c-mute'}`}>
                    {h.kind === 'casa_lar' ? 'Casa-lar' : 'Abrigo institucional'}
                  </span>
                </div>
              ))}
              {houses.length === 0 && (
                <div className="card">
                  <p className="mutetxt" style={{ margin: 0 }}>
                    Nenhuma unidade no seu alcance. Se isso parece errado, fale com a coordenação.
                  </p>
                </div>
              )}
            </div>
            <p className="mutetxt" style={{ marginTop: 12 }}>
              Você enxerga apenas as unidades do seu escopo. Não é filtro de tela: o banco
              não devolve as demais.
            </p>
          </>
        )}
      </main>

      {mais && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-mais"
             onClick={(e) => { if (e.target === e.currentTarget) setMais(false); }}>
          <div className="sheet">
            <h3 id="t-mais">Mais</h3>
            <div className="stack">
              {['gestor_geral', 'coordenador', 'equipe_tecnica', 'enfermagem',
                'lider_noturno_geral'].includes(me.role) && (
                <button className="card row" onClick={() => { setAba('unidades'); setMais(false); }}>
                  <span aria-hidden="true">🗓️</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">O dia, em ordem</b>
                    <div className="mutetxt">
                      Todas as unidades que você acompanha, das 00h às 23h59.
                    </div>
                  </div>
                </button>
              )}
              <button className="card row" onClick={() => { setAba('plantao'); setMais(false); }}>
                <span aria-hidden="true">🧭</span>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b className="ff">Painel do plantão</b>
                  <div className="mutetxt">Quem está em quê agora, neste turno.</div>
                </div>
              </button>
              <button className="card row" onClick={() => { setAba('agenda'); setMais(false); }}>
                <span aria-hidden="true">📅</span>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b className="ff">Agenda</b>
                  <div className="mutetxt">O que está marcado e o que vem pela frente.</div>
                </div>
              </button>
              {administra && (
                <button className="card row" onClick={() => { setAba('equipe'); setMais(false); }}>
                  <span aria-hidden="true">👥</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">Equipe</b>
                    <div className="mutetxt">Quem trabalha nesta casa, por setor.</div>
                  </div>
                </button>
              )}
              {administra && (
                <button className="card row" onClick={() => { setAba('setores'); setMais(false); }}>
                  <span aria-hidden="true">🔎</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">O que cada setor enxerga</b>
                    <div className="mutetxt">
                      A resposta escrita, sem entrar com a conta de ninguém.
                    </div>
                  </div>
                </button>
              )}
              <button className="card row" onClick={() => { setAba('ocorrencias'); setMais(false); }}>
                <span aria-hidden="true">🚨</span>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b className="ff">Ocorrências</b>
                  <div className="mutetxt">Abrir, acompanhar e encerrar com análise — nunca sozinha.</div>
                </div>
              </button>
              <button className="card row" onClick={() => { setAba('ata'); setMais(false); }}>
                <span aria-hidden="true">📔</span>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b className="ff">ATA</b>
                  <div className="mutetxt">A da casa e a Geral Noturna, com pendência quando for o caso.</div>
                </div>
              </button>
              {veSaude && (
                <button className="card row" onClick={() => { setAba('saude'); setMais(false); }}>
                  <span aria-hidden="true">🩺</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">Saúde</b>
                    <div className="mutetxt">Doses do dia, estoque, triagem e resumo de saúde.</div>
                  </div>
                </button>
              )}
              {veAcompanhamentos && (
                <button className="card row" onClick={() => { setAba('acompanhamentos'); setMais(false); }}>
                  <span aria-hidden="true">📝</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">Acompanhamentos</b>
                    <div className="mutetxt">Eixos obrigatórios, aprovação e relatórios.</div>
                  </div>
                </button>
              )}
              {veArquivo && (
                <button className="card row" onClick={() => { setAba('arquivo'); setMais(false); }}>
                  <span aria-hidden="true">🗄️</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">Arquivo documental</b>
                    <div className="mutetxt">Cópia do que fechou, com versões e fila de envio.</div>
                  </div>
                </button>
              )}
              {veTransferencias && (
                <button className="card row" onClick={() => { setAba('transferencias'); setMais(false); }}>
                  <span aria-hidden="true">🔁</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">Transferências</b>
                    <div className="mutetxt">Pedidos enviados e recebidos, com conversa entre coordenações.</div>
                  </div>
                </button>
              )}
              {veCofre && (
                <button className="card row" onClick={() => { setAba('cofre'); setMais(false); }}>
                  <span aria-hidden="true">🔑</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">Cofre de acessos</b>
                    <div className="mutetxt">Contas do acolhido. Pede a sua senha de novo e é auditado.</div>
                  </div>
                </button>
              )}
              <button className="card row" onClick={() => { setAba('casas'); setMais(false); }}>
                <span aria-hidden="true">🏠</span>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b className="ff">Unidades</b>
                  <div className="mutetxt">As unidades no seu alcance.</div>
                </div>
              </button>
            </div>
            <button className="btn sec block" style={{ marginTop: 16 }} onClick={() => setMais(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {(sugerirSenha || trocarSenha) && (
        <SenhaPessoal
          email={me.email}
          primeiroAcesso={sugerirSenha}
          semSenhaAinda={!!me.semSenha && sugerirSenha}
          onPronto={() => {
            setSugerirSenha(false); setTrocarSenha(false);
            setMe({ ...me, mustChangePassword: false, semSenha: false });
          }}
          onAdiar={() => { setSugerirSenha(false); setTrocarSenha(false); }}
        />
      )}
    </div>
  );
}
