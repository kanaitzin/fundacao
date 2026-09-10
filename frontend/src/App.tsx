import { useEffect, useState } from 'react';
import { ROTULO_CARGO } from './rotulos';
import { api, setToken, ligarFilaAoServidor } from './api';
import logo from './assets/logo.png';
import { definirQuemAssina } from './quem-assina';
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
import { Painel } from './screens/Painel';
import { Sincronizacao } from './screens/Sincronizacao';
import { Alinhamentos } from './screens/Alinhamentos';
import { Arquivo } from './screens/Arquivo';
import { Rotina } from './screens/Rotina';
import { Escala } from './screens/Escala';
import { Setores } from './screens/Setores';
import { Cozinha } from './screens/Cozinha';
import { Avisos } from './screens/Avisos';
import { ALCANCE_POR_CARGO } from '../../backend/src/modules/identity/alcance';
import { SeloDaFila } from './screens/SeloDaFila';
import { Internacao } from './screens/Internacao';
import { TrabalhoSocial } from './screens/TrabalhoSocial';

interface Me {
  id: string; email: string; fullName: string; role: string;
  mustChangePassword: boolean;
  /** A conta ainda não tem senha nenhuma: o primeiro acesso é criá-la. */
  semSenha?: boolean;
  assignments: { code: string; name: string; role: string }[];
}
interface House { id: string; code: string; name: string; kind: string; }

const ROLE_LABEL = ROTULO_CARGO;
/** Cor por tipo de unidade — categoria, nunca ranking entre casas. */
const KIND_TONE: Record<string, string> = { casa_lar: 'c-move', abrigo_institucional: 'c-brand' };

/** As telas que não são do turno; a aba "Mais" fica acesa quando uma delas está aberta. */
const OUTRAS = new Set(['agenda', 'equipe', 'casas', 'saude', 'internacao', 'impacto', 'ocorrencias', 'ata',
  'cofre', 'transferencias', 'acompanhamentos', 'arquivo', 'setores', 'unidades', 'plantao',
  'rotina', 'escala', 'alinhamentos', 'painel', 'sincronizacao']);
/* O sino é de todo mundo: não há cargo que não receba escalonamento. */


/**
 * O MENU VEM DO ALCANCE PUBLICADO — não de listas paralelas.
 *
 * Até 31/08 as abas de baixo (Dia, Chamada, Acolhidos, Passagem) e metade do
 * "Mais" não tinham guarda NENHUMA: eram iguais para os nove cargos. A COZINHA
 * — que por regra vê uma tela só — enxergava o dia, a chamada, o perfil dos
 * acolhidos, a passagem, as ocorrências e a ATA. Para saber que a Alice não
 * come amendoim, ela passava pelo caso de cada criança.
 *
 * Havia constantes (VE_SAUDE, VE_COFRE…) para as outras telas, e elas eram uma
 * segunda fonte de verdade ao lado de `alcance.ts`. Agora é uma só: o menu
 * pergunta ao mesmo mapa que a página "O que cada setor enxerga" mostra. Se as
 * duas divergirem, é porque alguém mudou o mapa — e aí mudam as duas juntas.
 *
 * Continua valendo: esconder o botão é gentileza com quem usa. A proteção mora
 * no banco, e o servidor recusa de novo por baixo.
 */
const ALCANCE = new Map(ALCANCE_POR_CARGO.map(
  (a) => [a.cargo, new Set(a.areas.map((x) => x.area))] as const));
const alcanca = (papel: string, area: string) => ALCANCE.get(papel)?.has(area) ?? false;

/**
 * Só no protótipo, e desde a tela de entrada: quem abre o arquivo precisa
 * saber, antes de digitar qualquer coisa, que nada ali é real e nada fica
 * salvo — senão alguém um dia usa isto para anotar o dia de uma criança de
 * verdade.
 */
function Tarja() {
  if (import.meta.env.VITE_PROTOTIPO !== '1') return null;
  return (
    <div className="tarja">
      <span className="tarja-selo">Protótipo</span>
      <span className="tarja-txt">dados fictícios · nada é salvo ao fechar</span>
    </div>
  );
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

/**
 * Botão "sem sinal" — só no protótipo.
 *
 * Existe para a fila local poder ser VISTA antes do piloto: o arquivo do
 * protótipo não tem rede, e sem este botão a única parte do sistema que muda
 * o comportamento fora da tela seria também a única que ninguém consegue
 * experimentar. Desligado, tudo funciona como antes.
 */
function BotaoSemSinal() {
  const [sem, setSem] = useState(false);
  return (
    <button className="iconbtn" title={sem ? 'Voltar a ter sinal' : 'Simular sem sinal'}
            aria-label={sem ? 'Voltar a ter sinal' : 'Simular sem sinal'}
            onClick={async () => {
              const { simularSemSinal } = await import('./mock');
              simularSemSinal(!sem);
              setSem(!sem);
            }}>
      {sem ? '🚫' : '📶'}
    </button>
  );
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aba, setAba] = useState<
    'dia' | 'chamada' | 'passagem' | 'acolhidos' | 'agenda' | 'casas' | 'equipe'
    | 'saude' | 'internacao' | 'impacto' | 'ocorrencias' | 'ata' | 'cofre' | 'transferencias'
    | 'acompanhamentos' | 'arquivo' | 'plantao' | 'unidades' | 'setores' | 'cozinha'
    | 'alinhamentos' | 'painel' | 'sincronizacao'
    | 'rotina' | 'escala' | 'avisos'>('dia');
  const [sugerirSenha, setSugerirSenha] = useState(false);
  const [trocarSenha, setTrocarSenha] = useState(false);
  const [mais, setMais] = useState(false);
  /*
   * Quantos avisos esperam a pessoa. O sino fica na barra de cima, ao lado do
   * nome: o escalonamento existe desde a fase 3 e não tinha onde chegar.
   */
  const [naoLidos, setNaoLidos] = useState(0);
  /*
   * O convite chega pela URL, no link do e-mail. Lido UMA vez, na montagem, e
   * apagado da barra de endereço logo em seguida: token em URL fica no
   * histórico do navegador, e o aparelho da casa é compartilhado entre turnos.
   */
  /** Recontagem dos avisos: ao entrar, ao trocar de tela e a cada dois minutos. */
  useEffect(() => {
    if (!me) return;
    let vivo = true;
    const contar = async () => {
      try {
        const r = await api<{ naoLidas: number }>('/notifications/count');
        if (vivo) setNaoLidos(r.naoLidas);
      } catch { /* sem rede: o sino apenas não atualiza */ }
    };
    contar();
    const t = setInterval(contar, 120_000);
    return () => { vivo = false; clearInterval(t); };
  }, [me, aba]);

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
      definirQuemAssina(eu.fullName, eu.role);
      setHouses(await api<House[]>('/houses'));
      /* A fila local começa a trabalhar assim que há sessão: ela envia o que
       * ficou do turno anterior antes de a pessoa tocar em qualquer coisa
       * (§17.1). Sem sessão não há para quem enviar. */
      void ligarFilaAoServidor();
      // Quem trabalha no plantão abre no DIA. É a tela que ele veio usar; a
      // lista de unidades é consulta, não trabalho. Quem não alcança o Dia —
      // a cozinha — abre na tela que tem.
      setAba(alcanca(eu.role, 'dia') ? 'dia' : (alcanca(eu.role, 'cozinha') ? 'cozinha' : 'casas'));
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
      definirQuemAssina(eu.fullName, eu.role);
      setHouses(await api<House[]>('/houses'));
      void ligarFilaAoServidor();
      setAba(alcanca(eu.role, 'dia') ? 'dia' : (alcanca(eu.role, 'cozinha') ? 'cozinha' : 'casas'));
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
  const ve = (area: string) => alcanca(me.role, area);
  const administra = ve('equipe');
  const veSaude = ve('saude');
  const veCofre = ve('cofre');
  const veAcompanhamentos = ve('acompanhamentos');
  const vePainel = ve('painel');
  const veSync = ve('sincronizacao');
  const veTransferencias = ve('transferencias');
  const veArquivo = ve('arquivo');
  const veRotina = ve('rotina');

  /** As abas do turno que este cargo alcança, na ordem de quem trabalha na casa. */
  const abasDoTurno = [
    { aba: 'dia', icone: '📋', label: 'Dia' },
    { aba: 'cozinha', icone: '🍽️', label: 'Restrições' },
    { aba: 'chamada', icone: '✅', label: 'Chamada' },
    { aba: 'acolhidos', icone: '🧒', label: 'Acolhidos' },
    { aba: 'passagem', icone: '🔁', label: 'Passagem' },
  ].filter((t) => ve(t.aba));
  const doMais = ['unidades', 'plantao', 'agenda', 'equipe', 'setores', 'ocorrencias',
    'ata', 'saude', 'internacao', 'impacto', 'alinhamentos', 'acompanhamentos', 'painel', 'arquivo', 'transferencias',
    'cofre', 'sincronizacao', 'casas']
    .filter((a) => ve(a));
  const temMais = doMais.length > 0;

  /*
   * A aba EFETIVA, e não a guardada.
   *
   * Trocar de cargo no protótipo deixava a pessoa numa aba que o novo cargo
   * não alcança, e a tela ficava em branco — sem erro, sem explicação. No
   * sistema real o mesmo acontece quando alguém muda de função no meio do
   * expediente. Em vez de renderizar nada, cai na primeira tela que o cargo
   * tem: para a cozinha, as restrições; para o Gestor Geral, o dia das
   * unidades.
   */
  const abaEfetiva = ((aba === 'avisos' || ve(aba))
    ? aba : (abasDoTurno[0]?.aba ?? doMais[0] ?? 'casas')) as typeof aba;
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
          {/*
            * A CHAVE DO GESTOR — operação ou trabalho social.
            *
            * Ele responde pelas oito casas e não vai abrir a grade de
            * medicação de nenhuma. As duas leituras são legítimas e não cabem
            * na mesma tela: uma é o turno de hoje, a outra é o que o
            * acolhimento produziu no ano. A chave fica no alto, junto do tema,
            * porque é troca de MODO e não uma tela a mais no menu.
            *
            * Só aparece para quem tem as oito casas. A coordenação de uma casa
            * tem o painel dela, e ver as outras não é função de quem responde
            * por uma.
            */}
          {['gestor_geral', 'admin_tecnico'].includes(me.role) && (
            <button className="iconbtn"
                    title={aba === 'impacto' ? 'Voltar para a operação' : 'Ver o trabalho social'}
                    aria-label={aba === 'impacto'
                      ? 'Voltar para a operação das casas'
                      : 'Ver o trabalho social das oito casas'}
                    onClick={() => setAba(aba === 'impacto' ? 'casas' : 'impacto')}>
              {aba === 'impacto' ? '🏠' : '🌱'}
            </button>
          )}
          {import.meta.env.VITE_PROTOTIPO === '1' && <BotaoSemSinal />}
          <SeloDaFila />
          <button className="iconbtn" title="Avisos"
                  aria-label={naoLidos ? `Avisos: ${naoLidos} não lidos` : 'Avisos'}
                  onClick={() => setAba('avisos')}>
            🔔{naoLidos > 0 && <span className="badge">{naoLidos > 9 ? '9+' : naoLidos}</span>}
          </button>
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
        definirQuemAssina(me.fullName, role);
        // No protótipo o servidor de mentira precisa saber do mesmo cargo, senão
        // as áreas restritas respondem pelo cargo do login, e não pelo escolhido.
        if (import.meta.env.VITE_PROTOTIPO === '1') {
          api('/prototipo/cargo', { method: 'POST', body: JSON.stringify({ role }) })
            .catch(() => { /* o seletor é de demonstração; falhar aqui não trava a tela */ });
        }
      }} />

      {/*
        * A barra carrega o TURNO, e só o que o cargo alcança. Quem tem uma
        * tela só não recebe barra nenhuma: cinco botões para uma tela é ruído.
        */}
      {(abasDoTurno.length > 1 || temMais) && (
        <nav className="tabbar" aria-label="Seções">
          {abasDoTurno.map((t) => (
            <button key={t.aba} className={abaEfetiva === t.aba ? 'on' : ''}
                    onClick={() => setAba(t.aba as typeof aba)}>
              <span aria-hidden="true">{t.icone}</span> {t.label}
            </button>
          ))}
          {temMais && (
            <button className={OUTRAS.has(abaEfetiva) ? 'on' : ''} onClick={() => setMais(true)}>
              <span aria-hidden="true">⋯</span> Mais
            </button>
          )}
        </nav>
      )}

      {/*
        * A `key` remonta TODO o conteúdo quando muda o cargo ou a casa — e não
        * é detalhe de React. Sem ela, o que uma tela buscou sob um cargo
        * continuava na memória dela depois da troca: no ensaio, a equipe
        * técnica abriu uma ocorrência, o cargo virou educador, e a narrativa
        * pessoal de uma colega — que o educador não alcança — seguiu na tela,
        * com o texto "todos os relatos deste fato" por cima. O servidor tinha
        * recusado; a tela é que ainda mostrava a resposta antiga.
        *
        * No sistema de verdade ninguém troca de cargo no meio da sessão, mas
        * o cargo MUDA (a coordenação altera) e a casa muda o tempo todo — e a
        * regra que vale é a mesma: resposta buscada sob um alcance não
        * sobrevive à mudança de alcance.
        */}
      <main className="conteudo" key={`${me.role}:${casaAtual?.id ?? 'sem-casa'}`}>
        {abaEfetiva === 'dia' && ve('dia') && (
          casaAtual
            ? <Dia houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`}
                   papel={me.role}
                   /* A linha do tempo aponta para outras telas: "chamada
                      aberta", "passagem por assinar", "ocorrência em
                      acompanhamento". Sem esta função, o evento chegava com
                      a ação escrita pelo servidor e sem botão nenhum. */
                   irPara={(destino) => { setAba(destino as typeof aba); setMais(false); }} />
            : (
              <div className="card">
                <p className="mutetxt" style={{ margin: 0 }}>
                  Você não tem uma unidade no seu alcance hoje. Se isso parece errado,
                  fale com a coordenação.
                </p>
              </div>
            )
        )}

        {abaEfetiva === 'avisos' && (
          <Avisos onMudou={() => {
            api<{ naoLidas: number }>('/notifications/count')
              .then((r) => setNaoLidos(r.naoLidas)).catch(() => {});
          }} />
        )}

        {abaEfetiva === 'cozinha' && casaAtual && (
          <Cozinha houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`}
                   papel={me.role} />
        )}

        {abaEfetiva === 'chamada' && ve('chamada') && casaAtual && <Chamada houseId={casaAtual.id} />}

        {abaEfetiva === 'acolhidos' && ve('acolhidos') && casaAtual && (
          <Acolhidos houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`}
                     papel={me.role} />
        )}

        {abaEfetiva === 'passagem' && ve('passagem') && casaAtual && (
          <Passagem houseId={casaAtual.id} />
        )}

        {abaEfetiva === 'agenda' && ve('agenda') && casaAtual && <Agenda houseId={casaAtual.id} papel={me.role} />}

        {abaEfetiva === 'unidades' && ve('unidades') && <DiaDasUnidades />}

        {abaEfetiva === 'plantao' && ve('plantao') && casaAtual && (
          <PainelPlantao houseId={casaAtual.id}
                         casaLabel={`${casaAtual.code} · ${casaAtual.name}`}
                         papel={me.role} />
        )}

        {abaEfetiva === 'equipe' && administra && <Equipe papel={me.role} />}

        {abaEfetiva === 'setores' && administra && <Setores papel={me.role} />}

        {abaEfetiva === 'rotina' && veRotina && casaAtual && (
          <Rotina houseId={casaAtual.id} papel={me.role} />
        )}

        {abaEfetiva === 'escala' && ve('escala') && casaAtual && (
          <Escala houseId={casaAtual.id} papel={me.role}
                  casaLabel={`${casaAtual.code} — ${casaAtual.name}`} />
        )}

        {abaEfetiva === 'impacto' && ve('impacto') && (
          <TrabalhoSocial papel={me.role} />
        )}
        {abaEfetiva === 'internacao' && ve('internacao') && casaAtual && (
          <Internacao houseId={casaAtual.id} casaLabel={`${casaAtual.code} — ${casaAtual.name}`}
                      papel={me.role} />
        )}
        {abaEfetiva === 'saude' && veSaude && casaAtual && (
          <Saude houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`}
                 papel={me.role} />
        )}

        {/* Ocorrência e ATA são de todo mundo do plantão: quem viu o fato é
            quem registra, e quem conduz o turno é quem fecha. */}
        {abaEfetiva === 'ocorrencias' && ve('ocorrencias') && casaAtual && <Ocorrencias houseId={casaAtual.id} papel={me.role} />}

        {abaEfetiva === 'ata' && ve('ata') && casaAtual && (
          <Ata houseId={casaAtual.id} papel={me.role}
               casaLabel={`${casaAtual.code} — ${casaAtual.name}`} />
        )}

        {abaEfetiva === 'cofre' && veCofre && casaAtual && (
          <Cofre houseId={casaAtual.id} papel={me.role} />
        )}

        {abaEfetiva === 'transferencias' && veTransferencias && casaAtual && (
          <Transferencias houseId={casaAtual.id} />
        )}

        {abaEfetiva === 'alinhamentos' && ve('alinhamentos') && casaAtual && (
          <Alinhamentos houseId={casaAtual.id}
                        casaLabel={`${casaAtual.code} — ${casaAtual.name}`} />
        )}

        {abaEfetiva === 'acompanhamentos' && veAcompanhamentos && casaAtual && (
          <Acompanhamentos houseId={casaAtual.id}
                           casaLabel={`${casaAtual.code} — ${casaAtual.name}`} />
        )}

        {abaEfetiva === 'painel' && vePainel && casaAtual && (
          <Painel houseId={casaAtual.id}
                  casaLabel={`${casaAtual.code} — ${casaAtual.name}`}
                  papel={me.role} />
        )}

        {abaEfetiva === 'sincronizacao' && veSync && casaAtual && (
          <Sincronizacao houseId={casaAtual.id}
                         casaLabel={`${casaAtual.code} — ${casaAtual.name}`}
                         papel={me.role} />
        )}

        {abaEfetiva === 'arquivo' && veArquivo && casaAtual && (
          <Arquivo houseId={casaAtual.id} papel={me.role} />
        )}

        {abaEfetiva === 'casas' && ve('casas') && (
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
              {ve('unidades') && (
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
              {ve('plantao') && (
              <button className="card row" onClick={() => { setAba('plantao'); setMais(false); }}>
                <span aria-hidden="true">🧭</span>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b className="ff">Painel do plantão</b>
                  <div className="mutetxt">Quem está em quê agora, neste turno.</div>
                </div>
              </button>
              )}
              {ve('agenda') && (
              <button className="card row" onClick={() => { setAba('agenda'); setMais(false); }}>
                <span aria-hidden="true">📅</span>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b className="ff">Agenda</b>
                  <div className="mutetxt">O que está marcado e o que vem pela frente.</div>
                </div>
              </button>
              )}
              {veRotina && (
                <button className="card row" onClick={() => { setAba('rotina'); setMais(false); }}>
                  <span aria-hidden="true">🕰️</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">A rotina da casa</b>
                    <div className="mutetxt">
                      O molde do dia — e as versões que a casa já seguiu.
                    </div>
                  </div>
                </button>
              )}
              {/* A escala fica ao lado da rotina: as duas respondem "como esta
                  casa funciona" — uma pelo relógio do dia, a outra pelo
                  calendário de quem trabalha nele. */}
              {ve('escala') && (
                <button className="card row" onClick={() => { setAba('escala'); setMais(false); }}>
                  <span aria-hidden="true">🗓️</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">A escala de plantão</b>
                    <div className="mutetxt">
                      Quem assume cada dia e cada turno — e o que já passou.
                    </div>
                  </div>
                </button>
              )}
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
              {ve('ocorrencias') && (
              <button className="card row" onClick={() => { setAba('ocorrencias'); setMais(false); }}>
                <span aria-hidden="true">🚨</span>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b className="ff">Ocorrências</b>
                  <div className="mutetxt">Abrir, acompanhar e encerrar com análise — nunca sozinha.</div>
                </div>
              </button>
              )}
              {ve('ata') && (
              <button className="card row" onClick={() => { setAba('ata'); setMais(false); }}>
                <span aria-hidden="true">📔</span>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b className="ff">ATA</b>
                  <div className="mutetxt">A da casa e a Geral Noturna, com pendência quando for o caso.</div>
                </div>
              </button>
              )}
              {/*
                * DUAS PORTAS PARA A MESMA TELA, e é de propósito.
                *
                * A chave 🌱 no alto é a que o Gestor Geral vai usar todo dia —
                * é troca de MODO, e o modo não mora no menu. Mas quem não
                * reparar nela precisa achar a tela onde acha todas as outras;
                * e, do lado prático, tela que só existe atrás de um botão do
                * cabeçalho fica de fora dos ensaios de navegador, que
                * percorrem as abas e o "Mais".
                */}
              {ve('impacto') && (
                <button className="card row"
                        onClick={() => { setAba('impacto'); setMais(false); }}>
                  <span aria-hidden="true">🌱</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">O trabalho social</b>
                    <div className="mutetxt">
                      As oito casas pelo que o acolhimento produziu, e não pelo turno de hoje.
                    </div>
                  </div>
                </button>
              )}
              {ve('internacao') && (
                <button className="card row"
                        onClick={() => { setAba('internacao'); setMais(false); }}>
                  <span aria-hidden="true">🏥</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">Internação hospitalar</b>
                    <div className="mutetxt">
                      Quem está no hospital, o diário do período e a medicação de lá.
                    </div>
                  </div>
                </button>
              )}
              {veSaude && (
                <button className="card row" onClick={() => { setAba('saude'); setMais(false); }}>
                  <span aria-hidden="true">🩺</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">Saúde</b>
                    <div className="mutetxt">Doses do dia, estoque, triagem e resumo de saúde.</div>
                  </div>
                </button>
              )}
              {/*
                * OS COMBINADOS TÊM PORTA PRÓPRIA.
                *
                * Eles também vivem numa aba dentro de Acompanhamentos, onde a
                * técnica e a coordenação trabalham. Mas quem mais precisa do
                * combinado é o educador do turno da noite — e ele não alcança
                * Acompanhamentos. Um combinado que a equipe do turno não pode
                * abrir não é combinado: é recado que ninguém recebeu.
                */}
              {ve('alinhamentos') && (
                <button className="card row" onClick={() => { setAba('alinhamentos'); setMais(false); }}>
                  <span aria-hidden="true">🤝</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">Combinados da equipe</b>
                    <div className="mutetxt">
                      O que ficou estabelecido nas reuniões, e o que está valendo agora.
                    </div>
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
              {vePainel && (
                <button className="card row" onClick={() => { setAba('painel'); setMais(false); }}>
                  <span aria-hidden="true">🏠</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">Painel das unidades</b>
                    <div className="mutetxt">
                      Ocupação, entradas e saídas, e o quadro de cada mês. Sem ranking.
                    </div>
                  </div>
                </button>
              )}
              {veSync && (
                <button className="card row" onClick={() => { setAba('sincronizacao'); setMais(false); }}>
                  <span aria-hidden="true">🔄</span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">Sincronização</b>
                    <div className="mutetxt">
                      O que ficou pendurado entre o aparelho e o servidor, e o que espera
                      decisão da equipe.
                    </div>
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
              {ve('casas') && (
              <button className="card row" onClick={() => { setAba('casas'); setMais(false); }}>
                <span aria-hidden="true">🏠</span>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b className="ff">Unidades</b>
                  <div className="mutetxt">As unidades no seu alcance.</div>
                </div>
              </button>
              )}
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
