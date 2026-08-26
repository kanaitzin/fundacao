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
      setErr(e instanceof Error ? e.message : 'Falha no login');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* sessão pode já ter expirado */ }
    setToken(null); setMe(null); setHouses([]);
  }

  if (!me) {
    return (
      <div className="wrap">
        <div className="brand"><img src={logo} alt="" height={40} /><h1>Rede Acolher</h1></div>
        <form className="card" onSubmit={login}>
          <label htmlFor="email">E-mail institucional</label>
          <input id="email" type="email" autoComplete="username" value={email}
                 onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="pw">Senha</label>
          <input id="pw" type="password" autoComplete="current-password" value={password}
                 onChange={(e) => setPassword(e.target.value)} required />
          {err && <div className="err" role="alert">{err}</div>}
          <button className="btn" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          <p className="muted">Acesso individual e auditado. Conta compartilhada não é permitida.</p>
        </form>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="brand"><img src={logo} alt="" height={40} /><h1>Rede Acolher</h1></div>
      <div className="card">
        <p style={{ margin: 0 }}><b>{me.fullName}</b></p>
        <p className="muted" style={{ margin: '2px 0 12px' }}>{ROLE_LABEL[me.role] ?? me.role}</p>
        {houses.map((h) => (
          <div className="houseitem" key={h.id}>
            <span className="code">{h.code}</span>
            <span style={{ flex: 1 }}>{h.name}</span>
            <span className="pill">{h.kind === 'casa_lar' ? 'Casa-Lar' : 'Abrigo'}</span>
          </div>
        ))}
        <p className="muted">
          {houses.length === 1
            ? 'Seu acesso está restrito à sua casa — o isolamento é aplicado no servidor e no banco.'
            : `Escopo transversal: ${houses.length} unidades, limitado à finalidade do seu cargo.`}
        </p>
        <button className="btn" onClick={logout}>Sair (revoga a sessão)</button>
      </div>
    </div>
  );
}
