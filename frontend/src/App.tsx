import { useEffect, useState } from 'react';
import { ROTULO_CARGO } from './rotulos';
import { Icone } from './icones';
import { PORTAS, GRUPOS } from './portas';
import { api, setToken, ligarFilaAoServidor } from './api';
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
}
interface House { id: string; code: string; name: string; kind: string; }

const ROLE_LABEL = ROTULO_CARGO;
/** Cor por tipo de unidade — categoria, nunca ranking entre casas. */
const KIND_TONE: Record<string, string> = { casa_lar: 'c-move', abrigo_institucional: 'c-brand' };

/** As telas que não são do turno; a aba "Mais" fica acesa quando uma delas está aberta. */
const OUTRAS = new Set(['agenda', 'equipe', 'casas', 'saude', 'internacao', 'impacto', 'ocorrencias', 'ata',
  'cofre', 'transferencias', 'acompanhamentos', 'arquivo', 'setores', 'unidades', 'plantao', 'trabalho', 'periodo', 'metricas',
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
  { value: 'coordenador',         label: 'Coordenação' },
  { value: 'equipe_tecnica',      label: 'Equipe técnica' },
  { value: 'educador',            label: 'Educador social' },
  { value: 'lider_diurno',        label: 'Líder Diurno' },
  { value: 'lider_noturno_geral', label: 'Líder Noturno' },
  { value: 'enfermagem',          label: 'Enfermagem' },
  { value: 'gestor_geral',        label: 'Gestor Geral' },
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

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aba, setAba] = useState<
    'dia' | 'chamada' | 'passagem' | 'acolhidos' | 'agenda' | 'casas' | 'equipe'
    | 'saude' | 'internacao' | 'impacto' | 'ocorrencias' | 'ata' | 'cofre' | 'transferencias'
    | 'acompanhamentos' | 'arquivo' | 'plantao' | 'unidades' | 'setores' | 'cozinha' | 'portaria' | 'campos_do_perfil'
    | 'trabalho' | 'periodo' | 'metricas'
    | 'alinhamentos' | 'painel' | 'sincronizacao'
    | 'rotina' | 'escala' | 'avisos' | null>(null);
  const [sugerirSenha, setSugerirSenha] = useState(false);
  const [trocarSenha, setTrocarSenha] = useState(false);
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
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* sessão pode já ter expirado */ }
    setToken(null); setMe(null); setHouses([]); setAba(null); setSugerirSenha(false);
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
  const abaEfetiva = ((aba && (aba === 'avisos' || ve(aba)))
    ? aba : (abasDoTurno[0]?.aba ?? doMais[0] ?? 'casas')) as Exclude<typeof aba, null>;
  // A casa de trabalho: o vínculo do usuário quando existe; senão, a primeira
  // do alcance — que é o caso das funções transversais (§5.13).
  const casaAtual = (escolhida ? houses.find((h) => h.id === escolhida) : undefined)
    ?? houses.find((h) => h.code === casa?.code) ?? houses[0] ?? null;
  const olhandoOutra = !!casaAtual && !!casa && casaAtual.code !== casa.code;

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
                    }}><Icone nome="tema" /></button>
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
          <button className="iconbtn" title="Trocar minha senha" aria-label="Trocar minha senha"
                  onClick={() => setTrocarSenha(true)}><Icone nome="chave" /></button>
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
            const quem = await api<{ fullName?: string; id?: string }>(
              '/prototipo/cargo', { method: 'POST', body: JSON.stringify({ role }) });
            if (quem?.fullName) {
              setMe({ ...me, role, fullName: quem.fullName, id: quem.id ?? me.id });
              definirQuemAssina(quem.fullName, role);
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
      {(abasDoTurno.length > 1 || temMais) && (
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
            <button className={`so-no-celular ${OUTRAS.has(abaEfetiva) ? 'on' : ''}`}
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
