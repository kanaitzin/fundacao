import { useState } from 'react';
import logo from '../assets/logo.png';

/**
 * ENTRADA NO SISTEMA.
 *
 * Conta individual e e-mail institucional (§5.1) — não há login por casa, por
 * turno ou compartilhado. A senha inicial é entregue pela coordenação e, no
 * primeiro acesso, o sistema sugere que a pessoa crie a sua.
 *
 * O acesso rápido só aparece no ambiente de demonstração, com dados fictícios:
 * é para o Marcelo e a equipe circularem pelas telas sem decorar senha, e
 * some em produção (§3.3 — nunca dados reais fora de produção, e nunca atalho
 * de autenticação dentro dela).
 */
const DEMO = [
  { label: 'Coordenação', email: 'coord.ai3@paodospobres.dev' },
  { label: 'Equipe técnica', email: 'tecnica.ai3@paodospobres.dev' },
  { label: 'Educador social', email: 'educador.ai3@paodospobres.dev' },
  { label: 'Líder Diurno', email: 'lider.ai3@paodospobres.dev' },
  { label: 'Enfermagem', email: 'enfermagem@paodospobres.dev' },
  { label: 'Líder Noturno', email: 'lider.noturno@paodospobres.dev' },
  { label: 'Gestor Geral', email: 'gestor@paodospobres.dev' },
];
const SENHA_DEMO = 'senha-dev-123';
const demoDisponivel = import.meta.env.DEV;

export function Login({ onSubmit, erro, ocupado }: {
  onSubmit: (email: string, senha: string) => void;
  erro: string; ocupado: boolean;
}) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  return (
    <div className="loginwrap">
      <main className="logincard" role="main">
        <div className="loginbrand">
          <span className="loginlogo">
            <img src={logo} alt="" aria-hidden="true" />
          </span>
          <h1>Fundação O Pão dos Pobres<span>Acolhimento Institucional</span></h1>
          <p className="loginsub">Rede Acolher · Sistema de gestão do acolhimento</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(email.trim(), senha); }}>
          <label className="f" htmlFor="email">E-mail institucional</label>
          <input
            id="email" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@paodospobres.org.br"
          />

          <label className="f" htmlFor="senha">Senha</label>
          <input
            id="senha" type="password" autoComplete="current-password" required
            value={senha} onChange={(e) => setSenha(e.target.value)}
            placeholder="Sua senha"
          />
          <p className="loginhint">
            🔒 No primeiro acesso, use a senha entregue pela coordenação — o sistema
            vai sugerir que você crie uma senha só sua.
          </p>

          {erro && <div className="notice c-crit" role="alert">{erro}</div>}

          <button className="btn block" type="submit" disabled={ocupado}>
            {ocupado ? 'Entrando…' : 'Entrar no sistema'}
          </button>
        </form>

        {demoDisponivel && (
          <>
            <hr className="divider" />
            <p className="loginsub" style={{ marginBottom: 8 }}>
              Acesso rápido — ambiente de demonstração, dados fictícios
            </p>
            <div className="demochips">
              {DEMO.map((d) => (
                <button key={d.email} type="button" className="chipbtn"
                        onClick={() => { setEmail(d.email); setSenha(SENHA_DEMO); }}>
                  {d.label}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="loginfoot">
          Conta individual. Ninguém assina, confirma ou registra em nome de outra pessoa.
        </p>
      </main>
    </div>
  );
}
