import { useEffect, useState } from 'react';
import { api } from '../api';
import marca from '../assets/logo-marca.png';
import { Icone } from '../icones';

/**
 * PRIMEIRO ACESSO PELO CONVITE (§8.2).
 *
 * A pessoa chega aqui pelo link do e-mail institucional, no aparelho dela. A
 * tela confere o convite ANTES de pedir qualquer coisa: descobrir que o link
 * venceu depois de escolher e repetir uma senha é o tipo de tela que faz
 * alguém fechar o navegador e ficar sem acesso no dia em que entrou.
 *
 * A senha é digitada duas vezes porque não há como recuperá-la depois: nem a
 * coordenação vê senha de ninguém. Errar aqui custa um convite novo.
 */
export function PrimeiroAcesso({ convite, onEntrou }: {
  convite: string;
  onEntrou: (token: string) => void;
}) {
  const [estado, setEstado] = useState<'conferindo' | 'ok' | 'invalido'>('conferindo');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [repetida, setRepetida] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    api<{ nome: string; email: string }>('/auth/convite/conferir', {
      method: 'POST', body: JSON.stringify({ convite }),
    })
      .then((r) => { if (vivo) { setNome(r.nome); setEmail(r.email); setEstado('ok'); } })
      .catch((e) => {
        if (!vivo) return;
        setErro(e instanceof Error ? e.message : 'Convite inválido ou vencido.');
        setEstado('invalido');
      });
    return () => { vivo = false; };
  }, [convite]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (senha.length < 8) { setErro('A senha precisa de pelo menos 8 caracteres.'); return; }
    if (senha !== repetida) { setErro('As duas senhas não são iguais.'); return; }

    setOcupado(true);
    try {
      const r = await api<{ token: string }>('/auth/convite/concluir', {
        method: 'POST', body: JSON.stringify({ convite, novaSenha: senha }),
      });
      onEntrou(r.token);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível criar a senha.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="loginwrap">
      <main className="logincard" role="main">
        <div className="loginbrand">
          <span className="loginlogo"><img src={marca} alt="Fundação O Pão dos Pobres" /></span>
          <h1>Rede Acolher<span>Acolhimento Institucional</span></h1>
          <p className="loginsub">Criar a sua senha</p>
        </div>

        {estado === 'conferindo' && <p className="loginhint">Conferindo o convite…</p>}

        {estado === 'invalido' && (
          <>
            <div className="notice c-crit" role="alert">{erro}</div>
            <p className="loginhint">
              Peça um convite novo à coordenação. É rápido, e o link antigo não volta a valer.
            </p>
          </>
        )}

        {estado === 'ok' && (
          <form onSubmit={criar}>
            <p className="loginhint">
              Olá, <strong>{nome}</strong>. Você está criando a senha da conta <strong>{email}</strong>.
            </p>

            <label className="f" htmlFor="senha">Sua senha</label>
            <input
              id="senha" type="password" autoComplete="new-password" required autoFocus
              value={senha} onChange={(ev) => setSenha(ev.target.value)}
              placeholder="Ao menos 8 caracteres"
            />

            <label className="f" htmlFor="repetida">Repita a senha</label>
            <input
              id="repetida" type="password" autoComplete="new-password" required
              value={repetida} onChange={(ev) => setRepetida(ev.target.value)}
              placeholder="A mesma senha"
            />

            <p className="loginhint">
              <Icone nome="cadeado" /> Ninguém da Fundação vê a sua senha — nem a coordenação, nem o suporte.
              Se alguém pedir a sua senha, não é do sistema.
            </p>

            {erro && <div className="notice c-crit" role="alert">{erro}</div>}

            <button className="btn block" type="submit" disabled={ocupado}>
              {ocupado ? 'Criando…' : 'Criar senha e entrar'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
