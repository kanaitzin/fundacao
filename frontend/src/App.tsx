import { useState } from 'react';
import { api, setToken } from './api';
import logo from './assets/logo.png';
import { Login } from './screens/Login';
import { SenhaPessoal } from './screens/SenhaPessoal';
import { Equipe } from './screens/Equipe';
import { Dia } from './screens/Dia';
import { Chamada } from './screens/Chamada';
import { Passagem } from './screens/Passagem';

interface Me {
  id: string; email: string; fullName: string; role: string;
  mustChangePassword: boolean;
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

/** Quem administra equipe (§5.3). O menu não oferece o que o cargo não faz. */
const ADMINISTRA_EQUIPE = ['coordenador', 'gestor_geral', 'admin_tecnico'];

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aba, setAba] = useState<'dia' | 'chamada' | 'passagem' | 'casas' | 'equipe'>('dia');
  const [sugerirSenha, setSugerirSenha] = useState(false);
  const [trocarSenha, setTrocarSenha] = useState(false);

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
      if (eu.mustChangePassword) setSugerirSenha(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setOcupado(false);
    }
  }

  async function sair() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* sessão pode já ter expirado */ }
    setToken(null); setMe(null); setHouses([]); setAba('dia'); setSugerirSenha(false);
  }

  if (!me) return <Login onSubmit={entrar} erro={erro} ocupado={ocupado} />;

  const casa = me.assignments[0];
  const administra = ADMINISTRA_EQUIPE.includes(me.role);
  // A casa de trabalho: o vínculo do usuário quando existe; senão, a primeira
  // do alcance — que é o caso das funções transversais (§5.13).
  const casaAtual = houses.find((h) => h.code === casa?.code) ?? houses[0] ?? null;

  return (
    <div className="app">
      <header className="appbar">
        <div className="top">
          <span className="logochip"><img src={logo} alt="Fundação O Pão dos Pobres" /></span>
          <span className="wordmark">Rede Acolher</span>
          <span className="rolechip">{ROLE_LABEL[me.role] ?? me.role}</span>
          <span className="grow" />
          <button className="iconbtn" title="Trocar minha senha" aria-label="Trocar minha senha"
                  onClick={() => setTrocarSenha(true)}>🔑</button>
          <button className="btn sm ghost" onClick={sair}>Sair</button>
        </div>
        <h1>{me.fullName}</h1>
        <div className="sub">
          {casa ? `${casa.code} — ${casa.name}` : 'Escopo institucional'} · {me.email}
        </div>
      </header>

      <nav className="tabbar" aria-label="Seções">
        <button className={aba === 'dia' ? 'on' : ''} onClick={() => setAba('dia')}>
          <span aria-hidden="true">📋</span> Dia
        </button>
        <button className={aba === 'chamada' ? 'on' : ''} onClick={() => setAba('chamada')}>
          <span aria-hidden="true">✅</span> Chamada
        </button>
        <button className={aba === 'passagem' ? 'on' : ''} onClick={() => setAba('passagem')}>
          <span aria-hidden="true">🔁</span> Passagem
        </button>
        {administra && (
          <button className={aba === 'equipe' ? 'on' : ''} onClick={() => setAba('equipe')}>
            <span aria-hidden="true">👥</span> Equipe
          </button>
        )}
        <button className={aba === 'casas' ? 'on' : ''} onClick={() => setAba('casas')}>
          <span aria-hidden="true">🏠</span> Unidades
        </button>
      </nav>

      <main className="conteudo">
        {aba === 'dia' && (
          casaAtual
            ? <Dia houseId={casaAtual.id} casaLabel={`${casaAtual.code} · ${casaAtual.name}`} />
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

        {aba === 'passagem' && casaAtual && (
          <Passagem houseId={casaAtual.id} />
        )}

        {aba === 'equipe' && administra && <Equipe />}

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

      {(sugerirSenha || trocarSenha) && (
        <SenhaPessoal
          email={me.email}
          primeiroAcesso={sugerirSenha}
          onPronto={() => {
            setSugerirSenha(false); setTrocarSenha(false);
            setMe({ ...me, mustChangePassword: false });
          }}
          onAdiar={() => { setSugerirSenha(false); setTrocarSenha(false); }}
        />
      )}
    </div>
  );
}
