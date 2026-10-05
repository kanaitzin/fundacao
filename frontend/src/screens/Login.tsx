import { useState } from 'react';
import { api } from '../api';
import marca from '../assets/logo-marca.png';
import { Icone } from '../icones';

/**
 * ENTRADA NO SISTEMA.
 *
 * Conta individual e e-mail institucional (§5.1): não há login por casa, por
 * turno ou compartilhado.
 *
 * UMA TELA, COMO A PESSOA ESPERA (pedido de 05/10): e-mail e senha juntos, em
 * branco, e o botão de entrar. A entrada em dois passos (primeiro o e-mail,
 * depois a pergunta "esta conta tem senha?") saiu: quem tem conta nova entra
 * pelo link do convite que chega no e-mail, e a tela diz isso embaixo.
 *
 * ESQUECI MINHA SENHA manda ao e-mail cadastrado um link de uma hora e uso
 * único, que leva à mesma tela de criar a senha do convite. A resposta é a
 * mesma para qualquer e-mail: a tela de entrada não conta quem trabalha na
 * Fundação.
 *
 * No protótipo os atalhos por função ficam embaixo e só preenchem os campos:
 * a demonstração é entrar COMO cada função, e o que se vê ao abrir é a tela
 * de verdade, vazia.
 */
const DEMO = [
  { label: 'Marcelo Barbosa', email: 'mbarbosa@paodospobres.com.br' },
  { label: 'Coordenação', email: 'coord.ai3@paodospobres.dev' },
  { label: 'Coordenação Geral', email: 'coordenacao.geral@paodospobres.dev' },
  { label: 'Equipe técnica', email: 'tecnica.ai3@paodospobres.dev' },
  { label: 'Educador social', email: 'educador.ai3@paodospobres.dev' },
  { label: 'Líder Diurno', email: 'lider.ai3@paodospobres.dev' },
  { label: 'Líder Noturno', email: 'lider.noturno@paodospobres.dev' },
  { label: 'Enfermagem', email: 'enfermagem@paodospobres.dev' },
  { label: 'Cozinha', email: 'cozinha@paodospobres.dev' },
  { label: 'Administração técnica', email: 'admin@paodospobres.dev' },
  { label: 'Gestor Geral', email: 'gestor@paodospobres.dev' },
];
const SENHA_DEMO = 'senha-dev-123';
/*
 * Antes era só `import.meta.env.DEV` — falso no build do protótipo. Os atalhos
 * existiam e nunca apareciam justamente no arquivo que vai para a mão de quem
 * precisa deles.
 */
const ehPrototipo = import.meta.env.VITE_PROTOTIPO === '1';
const demoDisponivel = import.meta.env.DEV || ehPrototipo;

export function Login({ onSubmit, erro, ocupado }: {
  onSubmit: (email: string, senha: string) => void;
  erro: string; ocupado: boolean;
}) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  /* "Esqueci minha senha": o pedido do link, na mesma tela. */
  const [esqueci, setEsqueci] = useState(false);
  const [aviso, setAviso] = useState('');
  const [linkDoPrototipo, setLinkDoPrototipo] = useState('');
  const [pedindo, setPedindo] = useState(false);
  const [erroEsqueci, setErroEsqueci] = useState('');

  async function pedirLink(e: React.FormEvent) {
    e.preventDefault();
    setErroEsqueci(''); setPedindo(true);
    try {
      const r = await api<{ aviso: string; linkDoPrototipo?: string }>('/auth/esqueci-a-senha', {
        method: 'POST', body: JSON.stringify({ email: email.trim() }),
      });
      setAviso(r.aviso); setLinkDoPrototipo(r.linkDoPrototipo ?? '');
    } catch (x) {
      setErroEsqueci(x instanceof Error ? x.message : 'Não foi possível pedir o link. Tente de novo.');
    } finally {
      setPedindo(false);
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

        {!esqueci ? (
          <form onSubmit={(e) => { e.preventDefault(); onSubmit(email.trim(), senha); }}>
            <label className="f" htmlFor="email">E-mail institucional</label>
            <input id="email" type="email" autoComplete="username" required
                   value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="nome@paodospobres.com.br" />
            <label className="f" htmlFor="senha">Senha</label>
            <input id="senha" type="password" autoComplete="current-password" required
                   value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Sua senha" />
            {erro && <div className="notice c-crit" role="alert">{erro}</div>}
            <button className="btn block" type="submit" disabled={ocupado}>
              {ocupado ? 'Entrando…' : 'Entrar no sistema'}
            </button>
            <button type="button" className="btn ghost block" style={{ marginTop: 8 }}
                    onClick={() => { setEsqueci(true); setAviso(''); setErroEsqueci(''); }}>
              Esqueci minha senha
            </button>
            <p className="loginhint">
              <Icone nome="cadeado" /> Primeiro acesso? A senha quem cria é você, pelo link que a
              coordenação envia para o seu e-mail institucional.
            </p>
          </form>
        ) : (
          <form onSubmit={pedirLink}>
            <p className="loginhint" style={{ marginTop: 0 }}>
              Digite o seu e-mail institucional. Enviamos para ele um link para você criar uma senha
              nova. O link vale uma hora e serve uma vez, e a senha atual continua valendo até você
              criar a nova.
            </p>
            <label className="f" htmlFor="email-esqueci">E-mail institucional</label>
            <input id="email-esqueci" type="email" autoComplete="username" required autoFocus
                   value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="nome@paodospobres.com.br" />
            {aviso && <div className="notice c-ok" role="status">{aviso}</div>}
            {linkDoPrototipo && (
              <a className="btn sec block" href={linkDoPrototipo}>
                Abrir o link que iria por e-mail (só no protótipo)
              </a>
            )}
            {erroEsqueci && <div className="notice c-crit" role="alert">{erroEsqueci}</div>}
            {!aviso && (
              <button className="btn block" type="submit" disabled={pedindo}>
                {pedindo ? 'Enviando…' : 'Enviar o link para o meu e-mail'}
              </button>
            )}
            <button type="button" className="btn ghost block" style={{ marginTop: 8 }}
                    onClick={() => { setEsqueci(false); setAviso(''); setLinkDoPrototipo(''); }}>
              Voltar para a entrada
            </button>
          </form>
        )}

        {demoDisponivel && !esqueci && (
          <>
            <hr className="divider" />
            <p className="loginsub" style={{ marginBottom: 8 }}>
              Protótipo, com dados fictícios: toque numa função para preencher o e-mail e a senha
              de demonstração, e depois em Entrar no sistema.
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
