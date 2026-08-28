import { useEffect, useState } from 'react';
import { api, ErroApi } from '../api';

/**
 * COFRE DE ACESSOS DO ACOLHIDO.
 *
 * A coordenação tem a guarda das crianças e precisa dos acessos delas —
 * gov.br, INSS, CTPS, banco, portal da escola. Hoje isso mora numa planilha.
 * O que muda aqui não é o guardar: é o cofre ter porta.
 *
 *  * a sessão já aberta não basta: entrar no cofre pede a senha DE NOVO;
 *  * a lista mostra a DICA, não a senha. Conferir "é a que eu esperava?"
 *    resolve sem abrir nada;
 *  * abrir a senha exige finalidade escrita, e fica registrado com nome e
 *    hora. O Gestor Geral entra só pela exceção — e a exceção aparece
 *    marcada, para todo mundo que lê o histórico.
 */

interface Acesso {
  id: string; acolhido: string; tipo: string; login: string; dica: string; responsavel: string;
}
interface Registro {
  id: string; quem: string; acao: string; em: string; finalidade: string; excepcional: boolean;
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR',
  { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo' });

export function Cofre() {
  const [liberado, setLiberado] = useState(false);
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [historico, setHistorico] = useState<Registro[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [abrindo, setAbrindo] = useState<Acesso | null>(null);
  const [revelada, setRevelada] = useState<{ acesso: Acesso; senha: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function carregar() {
    setErro('');
    try {
      const [a, h] = await Promise.all([
        api<Acesso[]>('/vault'), api<Registro[]>('/vault/history'),
      ]);
      setAcessos(a); setHistorico(h); setLiberado(true);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) { setLiberado(false); return; }
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o cofre.');
    }
  }
  useEffect(() => { carregar(); }, []);

  if (!liberado) {
    return <Reautenticar erro={erro} onErro={setErro}
                         onLiberado={(msg) => { setAviso(msg); carregar(); }} />;
  }

  return (
    <>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && (
        <div className="notice c-ok" role="status">
          {aviso}
          <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setAviso('')}>
            Entendi
          </button>
        </div>
      )}

      <div className="notice c-med">
        🔒 <b>Área auditada.</b> Cada visualização, abertura, cadastro e exportação gera
        registro próprio, com o seu nome e o horário. Nada daqui aparece na linha do
        tempo, na ATA, em notificação ou em busca ampla.
      </div>

      <div className="eyebrow">Cofre de acessos do acolhido</div>
      <div className="card raise stack">
        <div className="row">
          <span aria-hidden="true" style={{ fontSize: 20 }}>🔑</span>
          <h3 className="grow" style={{ fontSize: 16, margin: 0 }}>
            gov.br, INSS, CTPS, banco e escola
          </h3>
        </div>
        <div className="notice c-info">
          As senhas ficam <b>cifradas</b>: nem quem administra o banco de dados as lê. A
          lista mostra uma <b>dica</b> — ela costuma bastar para conferir se a senha é a
          que você espera, sem abrir nada.
        </div>

        {acessos.map((c) => (
          <div className="card stack" key={c.id}>
            <div className="row">
              <b className="ff grow">{c.acolhido} · {c.tipo}</b>
              <span className="pill c-med">cifrado</span>
            </div>
            <div className="mutetxt mono">{c.login}</div>
            <div className="row">
              <span className="grow">
                <span className="mutetxt">Senha: </span><b className="ff mono">{c.dica}</b>
              </span>
              <button className="btn sm ghost" onClick={() => setAbrindo(c)}>Ver senha</button>
            </div>
            <div className="mutetxt">Responsável: {c.responsavel}.</div>
          </div>
        ))}

        <button className="btn sec block" onClick={() => setGuardando(true)}>
          + Guardar um acesso
        </button>
      </div>

      <div className="eyebrow">Quem abriu, quando e para quê</div>
      <div className="card">
        <ul className="lista">
          {historico.map((h) => (
            <li key={h.id} className="row">
              <div className="grow">
                <b className="ff">{h.quem}</b>
                <div className="mutetxt">{h.acao} · {quando(h.em)}</div>
                <div className="mutetxt">Finalidade: {h.finalidade}</div>
              </div>
              {h.excepcional && <span className="pill c-crit">exceção</span>}
            </li>
          ))}
        </ul>
        <p className="mutetxt" style={{ margin: '10px 0 0' }}>
          O histórico não se apaga, e trocar a senha depois não apaga quem já a viu.
        </p>
      </div>

      {abrindo && (
        <FolhaAbrir acesso={abrindo} onFechar={() => setAbrindo(null)}
                    onAbrir={async (finalidade) => {
                      setErro('');
                      try {
                        const r = await api<{ senha: string; aviso: string }>(
                          `/vault/${abrindo.id}/reveal`,
                          { method: 'POST', body: JSON.stringify({ finalidade }) });
                        setRevelada({ acesso: abrindo, senha: r.senha });
                        setAbrindo(null);
                        carregar();
                      } catch (e) {
                        setErro(e instanceof Error ? e.message : 'Não foi possível abrir.');
                      }
                    }} />
      )}

      {revelada && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-senha"
             onClick={(e) => { if (e.target === e.currentTarget) setRevelada(null); }}>
          <div className="sheet modal">
            <h3 id="t-senha">{revelada.acesso.tipo} · {revelada.acesso.acolhido}</h3>
            <div className="senhabox">
              <span className="mutetxt">Senha</span>
              <code>{revelada.senha}</code>
            </div>
            <p className="mutetxt" style={{ marginTop: 10 }}>
              Abertura registrada com o seu nome e o horário. Feche esta janela quando
              terminar — a senha não fica na tela.
            </p>
            <button className="btn block" onClick={() => setRevelada(null)}>Fechar</button>
          </div>
        </div>
      )}

      {guardando && (
        <FolhaGuardar onFechar={() => setGuardando(false)}
                      onSalvo={(msg) => { setGuardando(false); setAviso(msg); carregar(); }}
                      onErro={setErro} />
      )}
    </>
  );
}

/** A porta do cofre: a sessão aberta não basta. */
function Reautenticar({ erro, onErro, onLiberado }: {
  erro: string; onErro: (e: string) => void; onLiberado: (aviso: string) => void;
}) {
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    onErro(''); setOcupado(true);
    try {
      const r = await api<{ aviso: string }>('/vault/reauth', {
        method: 'POST', body: JSON.stringify({ senha }) });
      onLiberado(r.aviso);
    } catch (err) {
      onErro(err instanceof Error ? err.message : 'Não foi possível confirmar sua senha.');
    } finally {
      setOcupado(false); setSenha('');
    }
  }

  return (
    <div className="card raise">
      <h3 style={{ fontSize: 17, margin: 0 }}>Confirme sua senha para continuar</h3>
      <p className="mutetxt">
        O cofre guarda as contas das crianças. Entrar nele pede a sua senha de novo,
        mesmo com a sessão já aberta — celular esquecido destravado em cima da mesa não
        pode virar acesso ao gov.br de ninguém.
      </p>
      <div className="notice c-med">
        🔒 Este acesso é <b>auditado</b>: a entrada, cada senha aberta e a finalidade
        ficam registradas com o seu nome.
      </div>

      <form onSubmit={entrar}>
        <label className="f" htmlFor="senha-cofre">Sua senha</label>
        <input id="senha-cofre" type="password" value={senha} autoFocus
               onChange={(e) => setSenha(e.target.value)}
               autoComplete="current-password" required />
        {erro && <div className="err" role="alert">{erro}</div>}
        <button className="btn block" type="submit" disabled={ocupado || senha.length === 0}>
          {ocupado ? 'Conferindo…' : 'Entrar no cofre'}
        </button>
      </form>
    </div>
  );
}

function FolhaAbrir({ acesso, onFechar, onAbrir }: {
  acesso: Acesso; onFechar: () => void; onAbrir: (finalidade: string) => void;
}) {
  const [finalidade, setFinalidade] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-abrir"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-abrir">Ver senha · {acesso.acolhido}</h3>
        <p className="mutetxt">{acesso.tipo} · {acesso.login}</p>
        <div className="notice c-med">
          Esta abertura fica registrada com o seu nome, o horário e a finalidade. Se você
          só precisa conferir se a senha é a que espera, a dica
          <b className="ff mono"> {acesso.dica}</b> costuma bastar.
        </div>
        <label className="f" htmlFor="fin-cofre">Para que você precisa deste acesso?</label>
        <input id="fin-cofre" value={finalidade} onChange={(e) => setFinalidade(e.target.value)}
               placeholder="Ex.: atualizar cadastro do benefício no gov.br" autoFocus />
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" onClick={() => onAbrir(finalidade)}>Ver senha</button>
        </div>
      </div>
    </div>
  );
}

const TIPOS = ['gov.br', 'INSS — Meu INSS', 'Carteira de Trabalho Digital',
  'Banco — poupança social', 'Portal da escola', 'Outro acesso'];

function FolhaGuardar({ onFechar, onSalvo, onErro }: {
  onFechar: () => void; onSalvo: (aviso: string) => void; onErro: (e: string) => void;
}) {
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [ocupado, setOcupado] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const r = await api<{ aviso: string }>('/vault', {
        method: 'POST', body: JSON.stringify({ tipo }) });
      onSalvo(r.aviso);
    } catch (err) {
      onErro(err instanceof Error ? err.message : 'Não foi possível guardar.');
      onFechar();
    } finally { setOcupado(false); }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-guardar"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-guardar">Guardar um acesso</h3>
        <form onSubmit={salvar}>
          <label className="f" htmlFor="tipo-cofre">Tipo de acesso</label>
          <select id="tipo-cofre" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          <label className="f" htmlFor="login-cofre">
            Login <small>— CPF, matrícula ou usuário</small>
          </label>
          <input id="login-cofre" placeholder="Identifica o acesso; não abre nada sozinho" />

          <label className="f" htmlFor="pw-cofre">Senha</label>
          <input id="pw-cofre" type="password" placeholder="Fica cifrada no sistema" />

          <label className="f" htmlFor="resp-cofre">Quem responde por este acesso</label>
          <input id="resp-cofre" defaultValue="Coordenação da Casa 03" />

          <div className="notice c-info">
            A senha é cifrada antes de ser guardada. Depois disso a tela mostra só a dica,
            e cada abertura pede finalidade.
          </div>

          <div className="row rodape">
            <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="btn grow" disabled={ocupado}>
              {ocupado ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
