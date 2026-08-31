import { useEffect, useState } from 'react';
import { api, ErroApi } from '../api';

/**
 * COFRE DE ACESSOS DO ACOLHIDO (§6.10).
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
 *
 * ROTAS — 31/08/2026. Chamava `/vault`, `/vault/history` e `/vault/reauth`.
 * Nenhuma existe, e o desenho por trás delas estava errado: no servidor o
 * cofre é DE UM ACOLHIDO, não da casa — `/people/:id/credentials/*`. Uma lista
 * única com as senhas de vinte crianças é exatamente a planilha solta que este
 * módulo veio substituir; aqui se escolhe a criança primeiro, e cada abertura
 * responde por ela.
 *
 * Outras três coisas que o descompasso escondia:
 *
 *  * a reautenticação é `POST /auth/reauth` e o campo é `password`. A tela
 *    mandava `senha`: o servidor leria vazio e recusaria SEMPRE, com "senha
 *    incorreta" — a porta do cofre não abriria nunca;
 *  * listar é POST, não GET (`/credentials/view`), justamente porque listar
 *    JÁ É um ato auditado;
 *  * o formulário de guardar não enviava senha, login nem responsável: os
 *    campos eram soltos, e só o tipo ia junto. Guardava um acesso vazio.
 */

interface Tipo { cod: string; label: string }
interface Pessoa { id: string; nome: string }
interface Acesso {
  id: string; tipo: string; tipoCodigo: string; qual: string | null;
  login: string | null; dica: string | null; responsavel: string | null;
  observacao: string | null; atualizadoEm: string;
}
interface Registro {
  quando: string; quem: string; finalidade: string | null;
  acao: string; excepcional: boolean;
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR',
  { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo' });

export function Cofre({ houseId, papel }: { houseId: string; papel: string }) {
  const [liberado, setLiberado] = useState(false);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [pessoaId, setPessoaId] = useState('');
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [historico, setHistorico] = useState<Registro[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [abrindo, setAbrindo] = useState<Acesso | null>(null);
  const [revelada, setRevelada] = useState<{ acesso: Acesso; senha: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const pessoa = pessoas.find((p) => p.id === pessoaId) ?? null;

  useEffect(() => {
    (async () => {
      try {
        const [p, t] = await Promise.all([
          api<Pessoa[]>(`/people?houseId=${houseId}`),
          api<Tipo[]>('/people/credentials/kinds'),
        ]);
        setPessoas(p); setTipos(t);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar a lista.');
      }
    })();
  }, [houseId]);

  /** Abre o cofre DE UMA criança. Listar já é um ato auditado — por isso POST. */
  async function carregar(id = pessoaId) {
    if (!id) { setAcessos([]); setHistorico([]); return; }
    setErro('');
    try {
      const [a, h] = await Promise.all([
        api<Acesso[]>(`/people/${id}/credentials/view`, { method: 'POST', body: '{}' }),
        api<Registro[]>(`/people/${id}/credentials/history`, { method: 'POST', body: '{}' }),
      ]);
      setAcessos(a); setHistorico(h);
    } catch (e) {
      // A janela da reautenticação expira: o cofre volta a pedir a senha.
      if (e instanceof ErroApi && (e.status === 401 || e.status === 403)) {
        setLiberado(false); setAcessos([]); setHistorico([]);
        setErro(e.message);
        return;
      }
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o cofre.');
    }
  }

  if (!liberado) {
    return <Reautenticar erro={erro} onErro={setErro}
                         onLiberado={() => {
                           setErro('');
                           setAviso('Cofre aberto. A entrada ficou registrada com o seu nome.');
                           setLiberado(true);
                           carregar();
                         }} />;
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

        <label className="f" htmlFor="cofre-pessoa">
          Acolhido <small>— o cofre é de uma criança por vez, e não uma lista da casa</small>
        </label>
        <select id="cofre-pessoa" value={pessoaId}
                onChange={(e) => { setPessoaId(e.target.value); carregar(e.target.value); }}>
          <option value="">Escolha…</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        {pessoa && acessos.length === 0 && (
          <p className="mutetxt" style={{ margin: 0 }}>
            Nenhum acesso guardado para {pessoa.nome}.
          </p>
        )}

        {acessos.map((c) => (
          <div className="card stack" key={c.id}>
            <div className="row">
              <b className="ff grow">{c.tipo}{c.qual ? ` · ${c.qual}` : ''}</b>
              <span className="pill c-med">cifrado</span>
            </div>
            {c.login && <div className="mutetxt mono">{c.login}</div>}
            <div className="row">
              <span className="grow">
                <span className="mutetxt">Senha: </span>
                <b className="ff mono">{c.dica ?? '—'}</b>
              </span>
              <button className="btn sm ghost" onClick={() => setAbrindo(c)}>Ver senha</button>
            </div>
            {c.responsavel && <div className="mutetxt">Responsável: {c.responsavel}.</div>}
            <div className="mutetxt">Atualizado em {quando(c.atualizadoEm)}.</div>
          </div>
        ))}

        {pessoa && papel === 'coordenador' && (
          <button className="btn sec block" onClick={() => setGuardando(true)}>
            + Guardar um acesso de {pessoa.nome}
          </button>
        )}
        {pessoa && papel !== 'coordenador' && (
          <p className="mutetxt" style={{ margin: 0 }}>
            Guardar e trocar acesso é da coordenação da casa. O Gestor Geral abre pela
            exceção, e a exceção fica marcada no histórico.
          </p>
        )}
      </div>

      {pessoa && (
        <>
          <div className="eyebrow">Quem abriu, quando e para quê</div>
          <div className="card">
            <ul className="lista">
              {historico.map((h, i) => (
                <li key={i} className="row">
                  <div className="grow">
                    <b className="ff">{h.quem}</b>
                    <div className="mutetxt">{h.acao} · {quando(h.quando)}</div>
                    {h.finalidade && <div className="mutetxt">Finalidade: {h.finalidade}</div>}
                  </div>
                  {h.excepcional && <span className="pill c-crit">exceção</span>}
                </li>
              ))}
              {historico.length === 0 && (
                <li className="mutetxt">Nada aberto ainda.</li>
              )}
            </ul>
            <p className="mutetxt" style={{ margin: '10px 0 0' }}>
              O histórico não se apaga, e trocar a senha depois não apaga quem já a viu.
            </p>
          </div>
        </>
      )}

      {abrindo && pessoa && (
        <FolhaAbrir acesso={abrindo} nome={pessoa.nome} onFechar={() => setAbrindo(null)}
                    onAbrir={async (finalidade) => {
                      setErro('');
                      try {
                        const r = await api<{ senha: string; aviso: string }>(
                          `/people/${pessoa.id}/credentials/${abrindo.id}/reveal`,
                          { method: 'POST', body: JSON.stringify({ finalidade }) });
                        setRevelada({ acesso: abrindo, senha: r.senha });
                        setAbrindo(null);
                        carregar();
                      } catch (e) {
                        setErro(e instanceof Error ? e.message : 'Não foi possível abrir.');
                      }
                    }} />
      )}

      {revelada && pessoa && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-senha"
             onClick={(e) => { if (e.target === e.currentTarget) setRevelada(null); }}>
          <div className="sheet modal">
            <h3 id="t-senha">{revelada.acesso.tipo} · {pessoa.nome}</h3>
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

      {guardando && pessoa && (
        <FolhaGuardar
          tipos={tipos} nome={pessoa.nome} onFechar={() => setGuardando(false)}
          onSalvar={async (corpo) => {
            setErro('');
            try {
              const r = await api<{ aviso: string }>(`/people/${pessoa.id}/credentials`, {
                method: 'POST', body: JSON.stringify(corpo) });
              setGuardando(false); setAviso(r.aviso); carregar();
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível guardar.');
            }
          }} />
      )}
    </>
  );
}

/** A porta do cofre: a sessão aberta não basta. */
function Reautenticar({ erro, onErro, onLiberado }: {
  erro: string; onErro: (e: string) => void; onLiberado: () => void;
}) {
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    onErro(''); setOcupado(true);
    try {
      // `password`, como o servidor espera. Com `senha`, ele lia vazio e
      // recusava sempre — a porta não abria nunca.
      await api<{ ok: boolean }>('/auth/reauth', {
        method: 'POST', body: JSON.stringify({ password: senha }) });
      onLiberado();
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

function FolhaAbrir({ acesso, nome, onFechar, onAbrir }: {
  acesso: Acesso; nome: string; onFechar: () => void; onAbrir: (finalidade: string) => void;
}) {
  const [finalidade, setFinalidade] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-abrir"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-abrir">Ver senha · {nome}</h3>
        <p className="mutetxt">{acesso.tipo}{acesso.login ? ` · ${acesso.login}` : ''}</p>
        <div className="notice c-med">
          Esta abertura fica registrada com o seu nome, o horário e a finalidade. Se você
          só precisa conferir se a senha é a que espera, a dica
          <b className="ff mono"> {acesso.dica ?? '—'}</b> costuma bastar.
        </div>
        <label className="f" htmlFor="fin-cofre">Para que você precisa deste acesso?</label>
        <input id="fin-cofre" value={finalidade} onChange={(e) => setFinalidade(e.target.value)}
               placeholder="Ex.: atualizar cadastro do benefício no gov.br" autoFocus />
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={finalidade.trim().length < 5}
                  onClick={() => onAbrir(finalidade)}>Ver senha</button>
        </div>
      </div>
    </div>
  );
}

function FolhaGuardar({ tipos, nome, onFechar, onSalvar }: {
  tipos: Tipo[]; nome: string; onFechar: () => void;
  onSalvar: (corpo: Record<string, unknown>) => void;
}) {
  const [tipo, setTipo] = useState(tipos[0]?.cod ?? 'gov_br');
  const [qual, setQual] = useState('');
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [responsavel, setResponsavel] = useState('Coordenação da casa');
  const [observacao, setObservacao] = useState('');
  // O formulário antigo mandava só o tipo: os campos eram soltos e o que
  // chegava ao servidor era um acesso vazio.
  const pode = senha.trim().length > 0 && (tipo !== 'outro' || qual.trim().length > 0);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-guardar"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-guardar">Guardar um acesso · {nome}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSalvar({
          tipo, qual: qual || undefined, login: login || undefined,
          senha, responsavel: responsavel || undefined, observacao: observacao || undefined }); }}>
          <label className="f" htmlFor="tipo-cofre">Tipo de acesso</label>
          <select id="tipo-cofre" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {tipos.map((t) => <option key={t.cod} value={t.cod}>{t.label}</option>)}
          </select>

          {tipo === 'outro' && (
            <>
              <label className="f" htmlFor="qual-cofre">Qual acesso</label>
              <input id="qual-cofre" value={qual} onChange={(e) => setQual(e.target.value)}
                     placeholder="Ex.: portal do plano de saúde" />
            </>
          )}

          <label className="f" htmlFor="login-cofre">
            Login <small>— CPF, matrícula ou usuário</small>
          </label>
          <input id="login-cofre" value={login} onChange={(e) => setLogin(e.target.value)}
                 placeholder="Identifica o acesso; não abre nada sozinho" />

          <label className="f" htmlFor="pw-cofre">Senha</label>
          <input id="pw-cofre" type="password" value={senha}
                 onChange={(e) => setSenha(e.target.value)}
                 placeholder="Fica cifrada no sistema" autoComplete="new-password" />

          <label className="f" htmlFor="resp-cofre">Quem responde por este acesso</label>
          <input id="resp-cofre" value={responsavel}
                 onChange={(e) => setResponsavel(e.target.value)} />

          <label className="f" htmlFor="obs-cofre">Observação</label>
          <input id="obs-cofre" value={observacao} onChange={(e) => setObservacao(e.target.value)}
                 placeholder="Ex.: cadastro feito no CRAS em maio" />

          <div className="notice c-info">
            A senha é cifrada antes de ser guardada. Depois disso a tela mostra só a dica,
            e cada abertura pede finalidade. Trocar não apaga: substitui e fica datado.
          </div>

          <div className="row rodape">
            <button className="btn sec grow" type="button" onClick={onFechar}>Cancelar</button>
            <button className="btn grow" type="submit" disabled={!pode}>Guardar acesso</button>
          </div>
        </form>
      </div>
    </div>
  );
}
