import { useState } from 'react';
import { api, setToken } from './api';
import logo from './assets/logo.png';

interface Me {
  fullName: string; role: string;
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

function AppBar({ titulo, sub, role }: { titulo: string; sub: string; role?: string }) {
  return (
    <header className="appbar">
      <div className="top">
        <span className="logochip"><img src={logo} alt="Fundação O Pão dos Pobres" /></span>
        <span className="wordmark">Rede Acolher</span>
        {role && <span className="rolechip">{ROLE_LABEL[role] ?? role}</span>}
      </div>
      <h1>{titulo}</h1>
      <div className="sub">{sub}</div>
    </header>
  );
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await api<{ token: string }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      setMe(await api<Me>('/users/me'));
      setHouses(await api<House[]>('/houses'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* sessão pode já ter expirado */ }
    setToken(null); setMe(null); setHouses([]); setPassword('');
  }

  if (!me) {
    return (
      <div className="wrap">
        <AppBar titulo="Entrar" sub="Acesso individual e auditado" />
        <main>
          <form className="card raise" onSubmit={login}>
            <label htmlFor="email">E-mail institucional</label>
            <input id="email" type="email" autoComplete="username" value={email}
                   onChange={(e) => setEmail(e.target.value)} required />
            <label htmlFor="pw">Senha</label>
            <input id="pw" type="password" autoComplete="current-password" value={password}
                   onChange={(e) => setPassword(e.target.value)} required />
            {err && <div className="err" role="alert">{err}</div>}
            <button className="btn" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          </form>
          <div className="notice c-info" style={{ marginTop: 16 }}>
            Cada pessoa tem sua <b>própria conta</b>. Conta compartilhada não é permitida — a autoria
            de cada registro precisa ser real.
          </div>
        </main>
      </div>
    );
  }

  const transversal = houses.length > 1;
  return (
    <div className="wrap">
      <AppBar titulo={me.fullName.split(' ')[0]} sub={ROLE_LABEL[me.role] ?? me.role} role={me.role} />
      <main>
        <div className="eyebrow" style={{ marginTop: 2 }}>
          {transversal ? `Unidades no seu escopo · ${houses.length}` : 'Sua unidade'}
        </div>
        <div className="card">
          {houses.map((h) => (
            <div className="houseitem" key={h.id}>
              <span className="code">{h.code}</span>
              <span className="grow">{h.name}</span>
              <span className={`pill ${KIND_TONE[h.kind] ?? 'c-mute'}`}>
                {h.kind === 'casa_lar' ? 'Casa-Lar' : 'Abrigo'}
              </span>
            </div>
          ))}
        </div>
        <div className={`notice ${transversal ? 'c-med' : 'c-ok'}`} style={{ marginTop: 14 }}>
          {transversal
            ? <>Escopo transversal às {houses.length} unidades, <b>limitado à finalidade do seu cargo</b>. Aberturas e acessos sensíveis ficam auditados.</>
            : <>Seu acesso está restrito à sua casa — o isolamento é aplicado <b>no servidor e no banco de dados</b>, não só na tela.</>}
        </div>
        <button className="btn ghost" onClick={logout}>Sair e revogar esta sessão</button>
      </main>
    </div>
  );
}
