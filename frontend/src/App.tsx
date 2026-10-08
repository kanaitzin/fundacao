import { useEffect, useState } from 'react';
import { ROTULO_CARGO } from './rotulos';
import {
  aplicarTema, nomeDoTema, temaAtual, temaGuardado, TEMAS, type Tema,
  LETRAS, letraGuardada, aplicarLetra, type Letra, escuroANoiteLigado, ligarEscuroANoite,
} from './tema';
import { Icone } from './icones';
import { Cargo } from './cargos';
import { PORTAS, GRUPOS } from './portas';
import { AvisoNoCelular, desligarAoSair } from './aviso-no-celular';
import { api, setToken, ligarFilaAoServidor, quandoASessaoTerminar } from './api';
import { definirAutor } from './fila-offline';
import logo from './assets/logo.png';
import { definirQuemAssina } from './quem-assina';
import { Login } from './screens/Login';
import { PrimeiroAcesso } from './screens/PrimeiroAcesso';
import { SenhaPessoal } from './screens/SenhaPessoal';
import { Equipe } from './screens/Equipe';
import { Trabalho } from './screens/Trabalho';
import { Periodo } from './screens/Periodo';
import { Metricas } from './screens/Metricas';
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
import { Implantacao } from './screens/Implantacao';
import { Alinhamentos } from './screens/Alinhamentos';
import { Arquivo } from './screens/Arquivo';
import { Rotina } from './screens/Rotina';
import { Escala } from './screens/Escala';
import { Setores } from './screens/Setores';
import { Cozinha } from './screens/Cozinha';
import { Portaria } from './screens/Portaria';
import { CamposDoPerfil } from './screens/CamposDoPerfil';
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
  /** A Coordenação Geral (fase 176): coordenação que alcança as oito casas. */
  todasAsCasas?: boolean;
}
interface House { id: string; code: string; name: string; kind: string; }

const ROLE_LABEL = ROTULO_CARGO;
/** Cor por tipo de unidade — categoria, nunca ranking entre casas. */
const KIND_TONE: Record<string, string> = { casa_lar: 'c-move', abrigo_institucional: 'c-brand' };

/** As telas que não são do turno; a aba "Mais" fica acesa quando uma delas está aberta. */
const OUTRAS = new Set(['agenda', 'equipe', 'casas', 'saude', 'internacao', 'impacto', 'ocorrencias', 'ata',
  'cofre', 'transferencias', 'acompanhamentos', 'arquivo', 'setores', 'unidades', 'plantao', 'trabalho', 'periodo', 'metricas',
  'rotina', 'escala', 'alinhamentos', 'painel', 'sincronizacao', 'implantacao']);
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
  { value: 'coordenador',         label: 'Coordenação' },
  { value: 'equipe_tecnica',      label: 'Equipe técnica' },
  { value: 'educador',            label: 'Educador social' },
  { value: 'lider_diurno',        label: 'Líder Diurno' },
  { value: 'lider_noturno_geral', label: 'Líder Noturno' },
  { value: 'enfermagem',          label: 'Enfermagem' },
  { value: 'gestor_geral',        label: 'Gestor Geral' },
  /* A PORTARIA ENTROU em 26/09 (fase 160), com login mínimo: uma tela só, o
     portão. É o caminho inverso do da cozinha, abaixo — e pela mesma razão
     está aqui: quem decide precisa ver com os olhos de quem vai usar. */
  { value: 'portaria',            label: 'Portaria' },
  /*
   * A COZINHA SAIU DAQUI em 09/09/2026, por decisão da Fundação: ela não entra
   * no sistema por enquanto. O cargo continua existindo no banco — ocultar é
   * reversível numa linha, apagar exigiria migração destrutiva —, mas não se
   * oferece para ninguém escolher.
   *
   * A tela não sumiu: virou "Cozinha — pedidos e restrições", e agora pertence
   * a quem trabalha na casa, que é quem pede o lanche e gera as folhas.
   */
];

/*
 * A COR DA TELA (fase 182). Eram três temas numa roda; com sete, rodar um por
 * um pediria seis toques para voltar ao claro. O botão abre uma folha com
 * todos lado a lado, e a amostra de cada um.
 */
/** O nome da cor escolhida neste aparelho, para o rótulo do botão que abre a folha. */
const rotuloDoTema = () =>
  `Escolher a cor da tela e o tamanho da letra (agora: ${nomeDoTema(temaGuardado() ?? temaAtual())})`;

/*
 * A FOLHA DA COR E DA LETRA. Mora no App, e não dentro do botão: no celular o
 * botão está na folha da conta (fase 184), e uma folha aberta por cima da
 * outra deixava dois "Fechar" na tela. Quem abre esta fecha a da conta antes.
 */
function FolhaTema({ onFechar }: { onFechar: () => void }) {
  /* A folha marca a cor ESCOLHIDA, e não a que está na tela: à noite, com o
     escuro automático, a tela está escura e a escolha continua sendo o rosa. */
  const [tema, setTema] = useState<Tema>(() => temaGuardado() ?? temaAtual());
  const [letra, setLetra] = useState<Letra>(() => letraGuardada());
  const [noite, setNoite] = useState(() => escuroANoiteLigado());
  return (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-tema"
             onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
          <div className="sheet">
            <h3 id="t-tema">Cor e letra da tela</h3>
            <p className="mutetxt">
              Vale só neste aparelho. As cores que avisam alguma coisa (o que está pendente,
              quem escreveu, o cargo de cada um) são as mesmas em todas.
            </p>
            <div className="temas-lista">
              {TEMAS.map((t) => (
                <button key={t.cod} aria-pressed={tema === t.cod}
                        onClick={() => { aplicarTema(t.cod); setTema(t.cod); }}>
                  <span className="amostra" style={{ background: t.amostra }} aria-hidden="true" />
                  {t.nome}
                </button>
              ))}
            </div>
            {/* A noite e a letra (fase 183): as duas preferências que a equipe
                mais muda no turno, ao lado da cor. */}
            <label className="prefs-noite">
              <input type="checkbox" checked={noite}
                     onChange={(e) => { ligarEscuroANoite(e.target.checked); setNoite(e.target.checked); }} />
              <span>Escuro automático das 20h às 8h. De manhã, a tela volta à cor escolhida.</span>
            </label>
            <div className="eyebrow" id="t-letra">Tamanho da letra</div>
            <div className="prefs-linha" role="group" aria-labelledby="t-letra">
              {LETRAS.map((l) => (
                <button key={l.cod} aria-pressed={letra === l.cod}
                        onClick={() => { aplicarLetra(l.cod); setLetra(l.cod); }}>
                  {l.nome}
                </button>
              ))}
            </div>
            <button className="btn sec block" onClick={onFechar}>Fechar</button>
          </div>
        </div>
  );
}

/*
 * A BUSCA DE CRIANÇA (fase 183): pelo nome ou pelo nome social, de qualquer
 * tela, só na casa aberta e só para quem vê os acolhidos. Escolher leva ao
 * perfil dela. É a lista que a casa já lê, filtrada aqui: não há busca por
 * pessoa da equipe, nem entre casas.
 */
function BuscaCrianca({ houseId, onAbrir }: { houseId: string; onAbrir: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const [lista, setLista] = useState<{ id: string; nome: string; idade: number }[] | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (!aberto) return;
    setErro('');
    api<{ id: string; nome: string; idade: number }[]>(`/people?houseId=${houseId}`)
      .then(setLista).catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível buscar.'));
  }, [aberto, houseId]);
  const sem = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const achadas = (lista ?? []).filter((p) => termo.trim() && sem(p.nome).includes(sem(termo.trim())));
  return (
    <>
      <button className="iconbtn" title="Buscar criança" aria-label="Buscar criança pelo nome"
              onClick={() => { setTermo(''); setAberto(true); }}>
        <Icone nome="busca" />
      </button>
      {aberto && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-busca"
             onClick={(e) => { if (e.target === e.currentTarget) setAberto(false); }}>
          <div className="sheet">
            <h3 id="t-busca">Buscar criança</h3>
            <label className="f" htmlFor="busca-crianca">Nome ou nome social</label>
            <input id="busca-crianca" className="field" type="search" autoFocus value={termo}
                   onChange={(e) => setTermo(e.target.value)} placeholder="Comece a digitar" />
            {erro && <div className="notice c-crit" role="alert">{erro}</div>}
            <ul className="lista" aria-live="polite">
              {achadas.map((p) => (
                <li key={p.id}>
                  <button className="btn ghost block" onClick={() => { setAberto(false); onAbrir(p.id); }}>
                    {p.nome} <span className="mutetxt">· {p.idade} anos</span>
                  </button>
                </li>
              ))}
            </ul>
            {termo.trim() && lista && !achadas.length && (
              <p className="mutetxt">Nenhuma criança desta casa com esse nome.</p>
            )}
            <button className="btn sec block" onClick={() => setAberto(false)}>Fechar</button>
          </div>
        </div>
      )}
    </>
  );
}

function TrocaCargo({ cargoAtual, onChange }: { cargoAtual: string; onChange: (role: string) => void }) {
  if (import.meta.env.VITE_PROTOTIPO !== '1') return null;
  return (
    <div className="troca-cargo">
      <span className="troca-cargo-label"><Icone nome="olhar" tamanho={16} /> Ver como:</span>
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
      <Icone nome={sem ? 'sem_sinal' : 'com_sinal'} />
    </button>
  );
}

/*
 * O CONVITE DA URL, lido UMA vez, quando o arquivo carrega (fase 190). Lia-se
 * no inicializador do `useState`, que apagava o token da barra de endereço: no
 * desenvolvimento, o `StrictMode` do React roda o inicializador DUAS vezes, a
 * segunda achava a barra limpa, e o link do e-mail abria a tela de entrada.
 * O ensaio contra o servidor de verdade é que viu. Efeito colateral não mora em
 * inicializador.
 */
const CONVITE_DA_URL = (() => {
  if (typeof window === 'undefined') return '';
  const t = new URLSearchParams(window.location.search).get('convite') ?? '';
  if (t) window.history.replaceState({}, '', window.location.pathname);
  return t;
})();

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  /* A criança escolhida na busca do topo (fase 183): a tela de Acolhidos abre
     com o perfil dela. */
  const [abrirCrianca, setAbrirCrianca] = useState<{ id: string } | null>(null);
  const [aba, setAba] = useState<
    'dia' | 'chamada' | 'passagem' | 'acolhidos' | 'agenda' | 'casas' | 'equipe'
    | 'saude' | 'internacao' | 'impacto' | 'ocorrencias' | 'ata' | 'cofre' | 'transferencias'
    | 'acompanhamentos' | 'arquivo' | 'plantao' | 'unidades' | 'setores' | 'cozinha' | 'portaria' | 'campos_do_perfil'
    | 'trabalho' | 'periodo' | 'metricas'
    | 'alinhamentos' | 'painel' | 'sincronizacao' | 'implantacao'
    | 'rotina' | 'escala' | 'avisos' | null>(null);
  /* Vale para UMA abertura: saindo dos Acolhidos, a escolha some. Sem isto,
     voltar à aba reabria a criança buscada antes, em vez da lista. */
  useEffect(() => { if (aba !== 'acolhidos') setAbrirCrianca(null); }, [aba]);
  const [sugerirSenha, setSugerirSenha] = useState(false);
  const [sessaoTerminou, setSessaoTerminou] = useState(false);

  /* Fase 168: o 401 de quem tinha sessão abre a entrada por cima da tela. */
  useEffect(() => {
    quandoASessaoTerminar(() => setSessaoTerminou(true));
    return () => quandoASessaoTerminar(null);
  }, []);

  /*
   * O BOTÃO VOLTAR (fase 168).
   *
   * O aplicativo não registrava nada no histórico do navegador: o voltar do
   * celular saía da página, a sessão (que mora só na memória) acabava, e o
   * que estivesse aberto ia junto. Agora cada troca de tela entra no
   * histórico, e o voltar volta de tela. Com uma folha aberta ele não faz
   * nada: a folha é onde está o texto que a pessoa escreveu, e ela se fecha
   * pelo botão dela. Sair da página com a sessão aberta pede confirmação.
   */
  useEffect(() => {
    if (!me) return;
    if ((window.history.state as { aba?: unknown } | null)?.aba !== aba) {
      window.history.pushState({ aba }, '');
    }
  }, [me, aba]);
  useEffect(() => {
    if (!me) return;
    const voltar = (e: PopStateEvent) => {
      if (document.querySelector('.overlay[role="dialog"]')) {
        window.history.pushState({ aba }, '');
        return;
      }
      setAba(((e.state as { aba?: typeof aba } | null)?.aba ?? null) as typeof aba);
    };
    const sair = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('popstate', voltar);
    window.addEventListener('beforeunload', sair);
    return () => {
      window.removeEventListener('popstate', voltar);
      window.removeEventListener('beforeunload', sair);
    };
  }, [me, aba]);
  const [trocarSenha, setTrocarSenha] = useState(false);
  /* A folha da conta, que no celular guarda o que saiu do topo (fase 184). */
  const [conta, setConta] = useState(false);
  const [folhaTema, setFolhaTema] = useState(false);
  const [mais, setMais] = useState(false);
  const [escolhida, setEscolhida] = useState<string | null>(null);
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

  const [convite, setConvite] = useState(CONVITE_DA_URL);

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
      definirAutor(eu.id);
      setHouses(await api<House[]>('/houses'));
      /* A fila local começa a trabalhar assim que há sessão: ela envia o que
       * ficou do turno anterior antes de a pessoa tocar em qualquer coisa
       * (§17.1). Sem sessão não há para quem enviar. */
      void ligarFilaAoServidor();
      /*
       * ABRE NA PRIMEIRA TELA DO CARGO — e não em "Dia" por padrão (fase 120).
       *
       * Quem trabalha no plantão continua abrindo no DIA, porque é a primeira
       * aba dele; quem não alcança o Dia — a cozinha — abre na tela que tem; e
       * o Gestor Geral passa a abrir no PAINEL, que ele pediu com todas as
       * letras: *"como o dia a dia é controlado pelos coordenadores, ele não
       * vai querer que a tela inicial dele seja essa de controle total."*
       *
       * Deixar `null` faz a tela cair na primeira aba do cargo. Era uma
       * decisão escrita em DOIS lugares — aqui e no `abaEfetiva` —, e agora é
       * um só: duas cópias da mesma regra divergem no primeiro ajuste.
       */
      setAba(null);
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
      definirAutor(eu.id);
      setHouses(await api<House[]>('/houses'));
      void ligarFilaAoServidor();
      setAba(null);           // a primeira tela do cargo, como no login
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Senha criada, mas não foi possível entrar. Tente pela tela de entrada.');
    } finally {
      setOcupado(false);
    }
  }

  async function sair() {
    setSessaoTerminou(false);
    await desligarAoSair();
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* sessão pode já ter expirado */ }
    setToken(null); setMe(null); setHouses([]); setAba(null); setSugerirSenha(false);
    /* As folhas da conta fecham junto: saindo pela folha Minha conta, ela
       reabria por cima da tela de quem entrasse a seguir no mesmo aparelho. */
    setConta(false); setFolhaTema(false); setTrocarSenha(false);
    definirAutor(null);
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
  /*
   * A CASA QUE SE ESTÁ OLHANDO (fase 98, pedido do Marcelo).
   *
   * Antes, quem tem alcance em várias — o Gestor Geral, a Enfermagem — ficava
   * preso à PRIMEIRA da lista, sem nenhum jeito de dizer "quero olhar a Casa
   * 05": a tela de unidades mostrava os nomes e os cartões não clicavam. Ele
   * pediu uma coisa simples, e era isso: poder olhar as casas pelo nome.
   *
   * Nulo significa "a minha" — o vínculo, ou a primeira do alcance. Quem tem
   * uma casa só nunca vê nada disto.
   */
  /* A saúde da implantação é do servidor das oito: na coordenação, só a
     Coordenação Geral a alcança (decisão de 05/10). O mapa é por cargo, e esta
     é a única área que depende da marca. */
  const ve = (area: string) => (area === 'implantacao' && me.role === 'coordenador'
    ? !!me.todasAsCasas : alcanca(me.role, area));
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
    /*
     * O PAINEL VEM PRIMEIRO — e só para quem o alcança (fase 120).
     *
     * Ele pediu isto com todas as letras: *"como o dia a dia é controlado
     * pelos coordenadores, ele não vai querer que a tela inicial dele seja
     * essa de controle total."* Estar em primeiro nesta lista é o que faz o
     * painel ser a tela inicial do Gestor Geral, porque `abaEfetiva` cai na
     * primeira aba do cargo. O acesso total continua inteiro, uma aba adiante.
     */
    { aba: 'metricas', icone: 'painel_numeros', label: 'Painel' },
    { aba: 'dia', icone: 'dia', label: 'Dia' },
    { aba: 'chamada', icone: 'chamada', label: 'Chamada' },
    { aba: 'acolhidos', icone: 'acolhidos', label: 'Acolhidos' },
    { aba: 'passagem', icone: 'passagem', label: 'Passagem' },
  ].filter((t) => ve(t.aba));
  /*
   * AS PORTAS QUE ESTE CARGO ALCANÇA — da tabela, e não de uma lista à parte.
   *
   * Esta linha era um vetor de vinte e três chaves escrito aqui, ao lado de
   * uma folha com vinte e cinco botões: a rotina da casa e a escala de plantão
   * estavam na folha e fora da contagem. Ninguém percebia porque o efeito era
   * só no `temMais`, que outra porta já deixava verdadeiro — até o dia em que
   * fosse a única do cargo, e aí a pessoa ficaria sem o botão que abre a tela.
   */
  const doMais = PORTAS.map((porta) => porta.aba).filter((a) => ve(a));
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
  /*
   * E a aba começa VAZIA, e não em "Dia" (fase 120).
   *
   * Antes ela nascia `'dia'`, que todo cargo alcança — e por isso o Gestor
   * Geral abria o sistema na linha do tempo de uma casa. Ele pediu o
   * contrário, com todas as letras: *"como o dia a dia é controlado pelos
   * coordenadores, ele não vai querer que a tela inicial dele seja essa de
   * controle total."*
   *
   * Começando vazia, a primeira tela é a PRIMEIRA ABA DO CARGO — o que para
   * todo mundo continua sendo "Dia", porque é o primeiro item da lista, e para
   * quem tem o painel passa a ser o painel. Uma regra a menos, e não uma a
   * mais.
   */
  /* A Coordenação Geral não tem casa de trabalho: abre nas Unidades, para
     escolher em qual entra, em vez de cair na primeira da lista (fase 176). */
  const primeira = me.todasAsCasas && !escolhida && ve('casas')
    ? 'casas' : (abasDoTurno[0]?.aba ?? doMais[0] ?? 'casas');
  const abaEfetiva = ((aba && (aba === 'avisos' || ve(aba)))
    ? aba : primeira) as Exclude<typeof aba, null>;
  // A casa de trabalho: o vínculo do usuário quando existe; senão, a primeira
  // do alcance — que é o caso das funções transversais (§5.13).
  const casaAtual = (escolhida ? houses.find((h) => h.id === escolhida) : undefined)
    ?? houses.find((h) => h.code === casa?.code) ?? houses[0] ?? null;
  const olhandoOutra = !!casaAtual && !!casa && casaAtual.code !== casa.code;

  return (
    <div className={`app${abasDoTurno.length + doMais.length > 1 ? ' com-barra' : ''}`}>
      <Tarja />
      <header className="appbar">
        <div className="top">
          <span className="logochip"><img src={logo} alt="Fundação O Pão dos Pobres" /></span>
          <span className="wordmark">Rede Acolher</span>
          {/* Quem está usando o sistema, com o círculo do cargo (fase 151). O
              nome do cargo continua escrito ao lado: o círculo é apoio. */}
          <span className="so-no-monitor"><Cargo nome={me.fullName} cargo={me.role} tamanho="sm" /></span>
          {/* NO CELULAR, O TOPO É UMA LINHA (fase 184, escolha da Fundação em
              05/10): o círculo da pessoa vira o botão da conta, e o nome, a
              casa, a cor da tela, a senha e o Sair moram na folha dele. */}
          <button className="conta-celular" aria-label={`Minha conta: ${me.fullName}`}
                  onClick={() => setConta(true)}>
            <Cargo nome={me.fullName} cargo={me.role} tamanho="sm" />
          </button>
          <span className="rolechip so-no-monitor">
            {me.todasAsCasas ? 'Coordenação Geral' : (ROLE_LABEL[me.role] ?? me.role)}
          </span>
          <span className="grow" />
          {/* A BUSCA DE CRIANÇA (fase 183): só para quem vê os acolhidos, e só na
              casa aberta. */}
          {casaAtual && ve('acolhidos') && (
            <BuscaCrianca houseId={casaAtual.id}
                          onAbrir={(id) => { setAbrirCrianca({ id }); setAba('acolhidos'); setMais(false); }} />
          )}
          {/* A COR E A LETRA DA TELA (27/09 e fase 183), lembradas neste aparelho. */}
          <button className="iconbtn so-no-monitor" title={`Cor da tela: ${nomeDoTema(temaGuardado() ?? temaAtual())}`}
                  aria-label={rotuloDoTema()} onClick={() => setFolhaTema(true)}>
            <Icone nome="tema" />
          </button>
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
              <Icone nome={aba === 'impacto' ? 'casas' : 'impacto'} />
            </button>
          )}
          {import.meta.env.VITE_PROTOTIPO === '1' && <BotaoSemSinal />}
          <SeloDaFila />
          <button className="iconbtn" title="Avisos"
                  aria-label={naoLidos ? `Avisos: ${naoLidos} não lidos` : 'Avisos'}
                  onClick={() => setAba('avisos')}>
            <Icone nome="sino" />
            {naoLidos > 0 && <span className="badge">{naoLidos > 9 ? '9+' : naoLidos}</span>}
          </button>
          <button className="iconbtn so-no-monitor" title="Trocar minha senha" aria-label="Trocar minha senha"
                  onClick={() => setTrocarSenha(true)}><Icone nome="chave" /></button>
          <button className="btn sm ghost so-no-monitor" onClick={sair}>Sair</button>
        </div>
        {/*
          * QUEM ESTÁ USANDO, numa linha só (fase 172). O nome ocupava um título
          * grande, e ele já está no círculo do cargo acima; a casa se repete no
          * rótulo de cada tela. O título continua sendo o principal da página
          * (é `h1`, para quem navega por títulos), só que do tamanho do que ele
          * é: a confirmação de qual conta está aberta neste aparelho.
          */}
        <div className="quem">
          <h1>{me.fullName}</h1>
          <span className="sub">
            {casa ? `${casa.code} — ${casa.name}` : 'Escopo institucional'} · {me.email}
          </span>
        </div>
      </header>

      {folhaTema && <FolhaTema onFechar={() => setFolhaTema(false)} />}
      {conta && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-conta"
             onClick={(e) => { if (e.target === e.currentTarget) setConta(false); }}>
          <div className="sheet">
            <div className="row" style={{ gap: 12, alignItems: 'center' }}>
              <Cargo nome={me.fullName} cargo={me.role} />
              <div>
                <h3 id="t-conta" style={{ margin: 0 }}>{me.fullName}</h3>
                <div className="mutetxt">
                  {me.todasAsCasas ? 'Coordenação Geral' : (ROLE_LABEL[me.role] ?? me.role)}
                </div>
              </div>
            </div>
            <p className="mutetxt" style={{ marginTop: 12 }}>
              {casa ? `${casa.code} — ${casa.name}` : 'Escopo institucional'}<br />{me.email}
            </p>
            <div className="conta-acoes">
              <button className="btn sec" aria-label={rotuloDoTema()}
                      onClick={() => { setConta(false); setFolhaTema(true); }}>
                <Icone nome="tema" /> Cor e letra da tela
              </button>
              <button className="btn sec" onClick={() => { setConta(false); setTrocarSenha(true); }}>
                <Icone nome="chave" /> Trocar minha senha
              </button>
              <button className="btn ghost" onClick={sair}>Sair</button>
              <button className="btn ghost" onClick={() => setConta(false)}>Fechar</button>
            </div>
            <AvisoNoCelular casa={casa?.name ?? null} />
          </div>
        </div>
      )}

      {/*
        A barra carrega o TURNO: as quatro telas que a pessoa de plantão abre
        dezenas de vezes. O resto — unidades, equipe, e o que a coordenação vai
        ganhar — mora em "Mais".

        Foi a tela de verdade que decidiu isso: com cinco abas, "Unidades" já
        saía pela borda do celular, e a sexta chegaria com a coordenação. Aba
        que não cabe é aba que ninguém acha.
      */}
      <TrocaCargo cargoAtual={me.role} onChange={async (role) => {
        /*
         * TROCAR DE CARGO TROCA DE PESSOA — e o nome no alto tem de dizer isso.
         *
         * O servidor de mentira devolve quem passou a ser (a coordenação
         * continua sendo o Marcelo; ver PESSOA_DO_CARGO no `mock.ts`). Sem
         * aplicar o nome aqui, a tela mostrava "Marcelo Barbosa" enquanto o
         * servidor de mentira já respondia como Mário Silva — e o documento
         * saía assinado por um e registrado pelo outro.
         *
         * Fora do protótipo o seletor não existe, e este bloco não roda: a
         * pessoa é a da sessão, e cargo não se escolhe.
         */
        setMe({ ...me, role });
        definirQuemAssina(me.fullName, role);
        if (import.meta.env.VITE_PROTOTIPO === '1') {
          try {
            const quem = await api<{ fullName?: string; id?: string; email?: string }>(
              '/prototipo/cargo', { method: 'POST', body: JSON.stringify({ role }) });
            if (quem?.fullName) {
              setMe({ ...me, role, fullName: quem.fullName, id: quem.id ?? me.id,
                      email: quem.email ?? me.email });
              definirQuemAssina(quem.fullName, role);
              definirAutor(quem.id ?? me.id);
            }
          } catch { /* o seletor é de demonstração; falhar aqui não trava a tela */ }
          /*
           * E RECARREGA AS CASAS: o alcance muda com o cargo — o Gestor Geral
           * enxerga as oito, o educador só a dele. Sem isto, quem trocasse
           * para gestor continuava com a lista de uma casa só, e o seletor de
           * casas nascia com um cartão (fase 98).
           */
          try { setHouses(await api<House[]>('/houses')); } catch { /* idem */ }
          setEscolhida(null);
        }
      }} />

      {/*
        * A barra carrega o TURNO, e só o que o cargo alcança. Quem tem uma
        * tela só não recebe barra nenhuma: cinco botões para uma tela é ruído.
        */}
      {/*
        * A NAVEGAÇÃO TEM DUAS FORMAS, e é a MESMA navegação (fase 150).
        *
        * No celular ela é a barra de abas de sempre, com o "Mais" abrindo a
        * folha — é o que cabe no polegar de quem está no corredor às 23h, e
        * mudar isso seria trocar o que funciona por um menu bonito.
        *
        * No monitor ela vira COLUNA À ESQUERDA, com as portas todas abertas e
        * agrupadas: quem usa a coordenação passa o dia numa tela grande, e
        * esconder vinte e cinco telas atrás de um "Mais" ali é desperdiçar
        * metade do monitor para depois pedir dois cliques.
        *
        * O `nav.tabbar` continua existindo nos dois — ele só muda de eixo. Foi
        * decisão consciente: os seis ensaios de navegador entram por ele, e
        * trocar o elemento por outro deixaria a navegação sem conferência
        * exatamente na fase que a reescreve.
        */}
      {/* Quem tem uma tela só (a portaria) não ganha barra com um "Mais" que
          abre uma folha com a tela onde ela já está (fase 184). */}
      {abasDoTurno.length + doMais.length > 1 && (
        <div className="navegacao">
        <div className="marca-lateral" aria-hidden="true">
          <span className="logochip"><img src={logo} alt="" /></span>
          <div>
            <b>Rede Acolher</b>
            <small>{casa ? `${casa.code} · ${casa.name}` : 'Escopo institucional'}</small>
          </div>
        </div>
        <nav className="tabbar" aria-label="Seções">
          {abasDoTurno.map((t) => (
            <button key={t.aba} className={abaEfetiva === t.aba ? 'on' : ''}
                    onClick={() => setAba(t.aba as typeof aba)}>
              <Icone nome={t.icone} /> <span className="rotulo">{t.label}</span>
            </button>
          ))}
          {temMais && (
            <button className={`so-no-celular ${OUTRAS.has(abaEfetiva) && !abasDoTurno.some((t) => t.aba === abaEfetiva) ? 'on' : ''}`}
                    onClick={() => setMais(true)}>
              <Icone nome="mais" /> <span className="rotulo">Mais</span>
            </button>
          )}
        </nav>
        {/*
          * As portas, agrupadas — só no monitor. No celular este bloco não é
          * desenhado (o CSS o esconde) e quem procura usa a folha "Mais", que
          * lê a MESMA tabela. Uma lista, duas formas.
          */}
        <nav className="portas-lateral" aria-label="Todas as telas">
          {GRUPOS.map((grupo) => {
            const dele = PORTAS.filter((porta) => porta.grupo === grupo.cod && ve(porta.aba));
            if (!dele.length) return null;
            return (
              <div key={grupo.cod} className="grupo">
                <h2>{grupo.titulo}</h2>
                {dele.map((porta) => (
                  <button key={porta.aba} className={aba === porta.aba ? 'on' : ''}
                          title={porta.descricao}
                          onClick={() => setAba(porta.aba as typeof aba)}>
                    <Icone nome={porta.icone} /> <span className="rotulo">{porta.titulo}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        </div>
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
        {/*
          * Olhando uma casa que não é a sua: a faixa diz qual, e devolve. Sem
          * ela, quem trocou de casa lê a tela inteira achando que é a dele — e
          * um turno de outra casa é exatamente o tipo de coisa que se confunde.
          */}
        {olhandoOutra && casaAtual && (
          <div className="notice c-info" role="status">
            <b>Você está olhando {casaAtual.code} · {casaAtual.name}.</b>{' '}
            Não é a sua casa de trabalho.{' '}
            {import.meta.env.VITE_PROTOTIPO === '1' && (
              <>Nesta demonstração só a Casa 03 tem dados; as outras aparecem para você poder
              escolher.{' '}</>
            )}
            <button className="btn sm ghost" onClick={() => setEscolhida(null)}>
              Voltar para a minha
            </button>
          </div>
        )}

        {abaEfetiva === 'dia' && ve('dia') && (
          casaAtual
            ? <Dia houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`}
                   papel={me.role}
                   /* A linha do tempo aponta para outras telas: "chamada
                      aberta", "passagem por assinar", "ocorrência em
                      acompanhamento". Sem esta função, o evento chegava com
                      a ação escrita pelo servidor e sem botão nenhum. */
                   irPara={(destino) => { setAba(destino as typeof aba); setMais(false); }}
                   alcanca={ve} pessoa={me.id} />
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

        {abaEfetiva === 'campos_do_perfil' && casaAtual && ve('campos_do_perfil') && (
          <CamposDoPerfil houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`} />
        )}

        {abaEfetiva === 'portaria' && casaAtual && ve('portaria') && (
          <Portaria houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`} />
        )}

        {abaEfetiva === 'cozinha' && casaAtual && (
          <Cozinha houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`}
                   papel={me.role} />
        )}

        {abaEfetiva === 'chamada' && ve('chamada') && casaAtual && <Chamada houseId={casaAtual.id} />}

        {abaEfetiva === 'acolhidos' && ve('acolhidos') && casaAtual && (
          <Acolhidos houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`}
                     papel={me.role} abrir={abrirCrianca} />
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

        {abaEfetiva === 'metricas' && ve('metricas') && <Metricas />}
        {abaEfetiva === 'trabalho' && ve('trabalho') && <Trabalho />}
        {abaEfetiva === 'periodo' && ve('periodo') && (
          <Periodo casaId={casaAtual?.id ?? null} />
        )}
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
                           casaLabel={`${casaAtual.code} — ${casaAtual.name}`}
                           papel={me.role} />
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

        {abaEfetiva === 'implantacao' && ve('implantacao') && <Implantacao />}

        {abaEfetiva === 'arquivo' && veArquivo && casaAtual && (
          <Arquivo houseId={casaAtual.id} papel={me.role} />
        )}

        {abaEfetiva === 'casas' && ve('casas') && (
          <>
            <div className="eyebrow">Unidades no seu alcance</div>
            <div className="stack">
              {houses.map((h) => (
                <button className="card row" key={h.id}
                        aria-current={casaAtual?.id === h.id ? 'true' : undefined}
                        onClick={() => { setEscolhida(h.id); setAba('dia'); }}>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">{h.code}</b>
                    <div className="mutetxt">{h.name}</div>
                  </div>
                  {casaAtual?.id === h.id && <span className="pill c-ok">olhando</span>}
                  <span className={`pill ${KIND_TONE[h.kind] ?? 'c-mute'}`}>
                    {h.kind === 'casa_lar' ? 'Casa-lar' : 'Abrigo institucional'}
                  </span>
                </button>
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

      {sessaoTerminou && (
        <FolhaSessaoTerminou email={me.email} onEntrou={() => setSessaoTerminou(false)}
                             onOutraConta={() => void sair()} />
      )}

      {mais && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-mais"
             onClick={(e) => { if (e.target === e.currentTarget) setMais(false); }}>
          <div className="sheet">
            <h3 id="t-mais">Mais</h3>
            {/*
              * A FOLHA LÊ A TABELA DE PORTAS (fase 150), e antes eram vinte e
              * cinco blocos escritos um a um aqui dentro. Lista escrita à mão ao
              * lado de outra lista com as mesmas chaves é como uma tela nasce
              * sem porta: quem acrescenta a tela mexe numa e esquece a outra.
              *
              * No celular ela continua CORRIDA, sem os grupos da barra lateral:
              * rolar o polegar é mais barato do que decidir em qual seção olhar,
              * e quem abre o "Mais" às 23h já sabe o nome do que procura.
              */}
            <div className="stack">
              {PORTAS.filter((porta) => ve(porta.aba)).map((porta) => (
                <button key={porta.aba} className="card row"
                        onClick={() => { setAba(porta.aba as typeof aba); setMais(false); }}>
                  <span className="porta-icone"><Icone nome={porta.icone} /></span>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <b className="ff">{porta.titulo}</b>
                    <div className="mutetxt">{porta.descricao}</div>
                  </div>
                </button>
              ))}
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
          casa={casa?.name ?? null}
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

/**
 * ENTRAR DE NOVO SEM PERDER A TELA (fase 168).
 *
 * Na MESMA conta: o e-mail vem da sessão que terminou e não se troca aqui.
 * Outra pessoa assumindo a tela de quem saiu escreveria em nome de quem
 * estava; para trocar de pessoa, o caminho é sair, que desmonta a tela de
 * propósito.
 */
function FolhaSessaoTerminou({ email, onEntrou, onOutraConta }: {
  email: string; onEntrou: () => void; onOutraConta: () => void;
}) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setOcupado(true);
    try {
      const r = await api<{ token: string }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password: senha }),
      });
      setToken(r.token);
      onEntrou();
    } catch (x) {
      setErro(x instanceof Error ? x.message : 'Não foi possível entrar. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  }
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-sessao">
      <form className="sheet" onSubmit={entrar}>
        <h3 id="t-sessao">Sua sessão terminou</h3>
        <p>
          O que você escreveu continua nesta tela. Entre de novo e toque em salvar outra vez.
        </p>
        <label className="f" htmlFor="sessao-email">E-mail</label>
        <input id="sessao-email" className="field" value={email} readOnly />
        <label className="f" htmlFor="sessao-senha">Senha</label>
        <input id="sessao-senha" className="field" type="password" autoComplete="current-password"
               value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <div className="acoes" style={{ marginTop: 16 }}>
          <button className="btn" type="submit" disabled={ocupado}>
            {ocupado ? 'Entrando…' : 'Entrar e continuar'}
          </button>
          <button className="btn sec" type="button" onClick={onOutraConta}>
            Sair e entrar com outra conta
          </button>
        </div>
      </form>
    </div>
  );
}
