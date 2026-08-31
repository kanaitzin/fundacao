import { useState } from 'react';
import { api } from '../api';
import marca from '../assets/logo-marca.png';

/**
 * ENTRADA NO SISTEMA.
 *
 * Conta individual e e-mail institucional (§5.1) — não há login por casa, por
 * turno ou compartilhado.
 *
 * A entrada tem DOIS passos, e o segundo às vezes não acontece: a pessoa
 * digita o e-mail, e o sistema responde se aquela conta já tem senha. Quem
 * ainda não tem entra direto e cria a sua ali; quem já tem, digita.
 *
 * A razão é a coordenação, não a tecnologia. Distribuir senha inicial para
 * quarenta pessoas por WhatsApp — que é como isso acabaria acontecendo — é
 * pior do que qualquer senha fraca: a senha circula em grupo, some no
 * histórico e nunca é trocada. Aqui a primeira senha da pessoa é criada pela
 * própria pessoa, no aparelho dela.
 *
 * O que isso exige do servidor, e ainda não está feito: o primeiro acesso sem
 * senha precisa valer UMA vez, por convite da coordenação e com prazo — senão
 * o e-mail sozinho vira porta permanente. Enquanto essa rota não existe, o
 * aplicativo de verdade continua pedindo a senha (o passo 1 responde 404 e a
 * tela mostra o campo). Quem usa o caminho curto é o protótipo.
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
  /** '' = ainda não perguntamos; 'senha' = tem senha; 'primeira' = não tem. */
  const [passo, setPasso] = useState<'' | 'senha' | 'primeira'>('');
  const [conferindo, setConferindo] = useState(false);

  async function continuar(e: React.FormEvent) {
    e.preventDefault();
    if (passo === 'primeira') { setPasso(''); setSenha(''); return; }
    if (passo !== '') { onSubmit(email.trim(), senha); return; }

    setConferindo(true);
    try {
      const r = await api<{ temSenha: boolean }>('/auth/primeiro-acesso', {
        method: 'POST', body: JSON.stringify({ email: email.trim() }),
      });
      if (r.temSenha) { setPasso('senha'); return; }
      // Conta ainda sem senha: a criação acontece pelo link do convite, no
      // e-mail institucional. Criar senha aqui, só com o e-mail, devolveria a
      // porta permanente que o convite existe para fechar (§8.2).
      setPasso('primeira');
    } catch {
      // Servidor sem essa rota: o caminho de sempre, com senha. Falhar aqui
      // não pode impedir ninguém de entrar.
      setPasso('senha');
    } finally {
      setConferindo(false);
    }
  }

  return (
    <div className="loginwrap">
      <main className="logincard" role="main">
        <div className="loginbrand">
          <span className="loginlogo">
            <img src={marca} alt="Fundação O Pão dos Pobres" />
          </span>
          <h1>Rede Acolher<span>Acolhimento Institucional</span></h1>
          <p className="loginsub">Sistema de gestão do acolhimento</p>
        </div>

        <form onSubmit={continuar}>
          <label className="f" htmlFor="email">E-mail institucional</label>
          <input
            id="email" type="email" autoComplete="username" required
            value={email} onChange={(e) => { setEmail(e.target.value); setPasso(''); }}
            placeholder="nome@paodospobres.com.br"
          />

          {passo === 'senha' && (
            <>
              <label className="f" htmlFor="senha">Senha</label>
              <input
                id="senha" type="password" autoComplete="current-password" required autoFocus
                value={senha} onChange={(e) => setSenha(e.target.value)}
                placeholder="Sua senha"
              />
              <p className="loginhint">
                🔒 Esqueceu? A coordenação reenvia o primeiro acesso — ninguém, nem ela,
                consegue ver a sua senha.
              </p>
            </>
          )}

          {passo === '' && (
            <p className="loginhint">
              🔒 No primeiro acesso, a senha quem cria é você — pelo link que a
              coordenação envia para o seu e-mail institucional.
            </p>
          )}

          {passo === 'primeira' && (
            <div className="notice c-info" role="status">
              Esta conta ainda não tem senha. Abra o e-mail institucional e use o link
              do convite para criar a sua — ele vale 24 horas e serve uma vez.
              Se não chegou, peça um novo à coordenação.
            </div>
          )}

          {erro && <div className="notice c-crit" role="alert">{erro}</div>}

          <button className="btn block" type="submit" disabled={ocupado || conferindo}>
            {ocupado || conferindo
              ? 'Entrando…'
              : passo === 'senha' ? 'Entrar no sistema'
              : passo === 'primeira' ? 'Tentar outro e-mail' : 'Continuar'}
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
                        onClick={() => { setEmail(d.email); setSenha(SENHA_DEMO); setPasso('senha'); }}>
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
