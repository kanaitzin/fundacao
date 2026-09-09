import { useEffect, useState } from 'react';
import { api } from '../api';

interface Setor {
  code: string; label: string; descricao: string; transversal: boolean; exigeCasa: boolean;
}
interface Membro {
  id: string; nome: string; email: string; cargo: string; setor: string;
  transversal: boolean; casa: string | null; casaId: string | null;
  corDaLinha?: string | null;
  ativo: boolean; ultimoAcesso: string | null;
  senhaInicialPendente: boolean; editavel: boolean; proprio: boolean;
}
interface Casa { id: string; codigo: string; nome: string; propria: boolean; }

/**
 * UM APARELHO INSTITUCIONAL (§11.7, pendência institucional #7).
 *
 * `GET/POST /devices` e `POST /devices/:id/revoke` existiam desde a fase 8 e
 * nunca tiveram tela. Sem elas, "quais aparelhos existem em cada casa" seguia
 * sendo suposição — e é sobre essa suposição que a regra mais dura do sistema
 * se apoia: offline, SÓ o aparelho designado da casa confirma medicamento.
 *
 * O aparelho é uma CREDENCIAL, não uma marcação de tela: o código nasce no
 * registro, aparece UMA vez, e o banco guarda só a impressão digital dele —
 * mesmo desenho das sessões. Antes disso, a regra era conferida contra um
 * booleano enviado pelo próprio cliente: quem mandasse `true` passava.
 */
interface Aparelho {
  id: string; rotulo: string; ativo: boolean;
  escopo: 'casa' | 'instituicao';
  registradoEm: string; revogadoEm: string | null;
  motivoRevogacao: string | null; ultimoUso: string | null;
}

const quando = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('pt-BR',
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo' });
};

const TOM: Record<string, string> = {
  educador: 'c-info', lider_diurno: 'c-ok', equipe_tecnica: 'c-other',
  cozinha: 'c-warn', enfermagem: 'c-med', lider_noturno_geral: 'c-move',
  coordenador: 'c-brand', gestor_geral: 'c-brand',
};

/**
 * EQUIPE DA CASA (§5.3).
 *
 * Duas coisas que esta tela faz de propósito e que o sistema antigo não fazia:
 *
 *  * não tem botão "Remover". Desligado é DESATIVADO — apagar a conta
 *    transformaria em "usuário desconhecido" toda passagem assinada, toda ATA
 *    fechada e toda dose confirmada por aquela pessoa;
 *  * só oferece os setores que ESTE cargo pode cadastrar. A coordenação monta
 *    a equipe da casa e cadastra a Enfermagem; criar conta de alcance
 *    institucional é do Gestor Geral.
 */
/**
 * Os oito tons da paleta, com NOME.
 *
 * O nome não é enfeite: sem ele, escolher a cor de alguém exigiria distinguir
 * oito matizes na tela — e quem não distingue não é caso raro. Com o nome
 * escrito, a escolha e a conferência funcionam sem enxergar a cor.
 */
const NOME_DO_TOM: Record<string, string> = {
  'c-brand': 'Azul institucional', 'c-info': 'Azul', 'c-move': 'Ciano',
  'c-ok': 'Verde', 'c-warn': 'Âmbar', 'c-med': 'Violeta',
  'c-other': 'Rosa', 'c-crit': 'Vermelho',
};
const TONS = Object.keys(NOME_DO_TOM);

export function Equipe({ papel }: { papel: string }) {
  const [aba, setAba] = useState<'pessoas' | 'aparelhos'>('pessoas');
  const [membros, setMembros] = useState<Membro[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [casas, setCasas] = useState<Casa[]>([]);
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState<{ texto: string; senha?: string } | null>(null);
  const [form, setForm] = useState(false);
  const [editando, setEditando] = useState<Membro | null>(null);
  const [pintando, setPintando] = useState<Membro | null>(null);
  const [ocupadas, setOcupadas] = useState<{ cor: string; deQuem: string; userId: string }[]>([]);
  /* O código do aparelho, mostrado UMA vez e nunca mais recuperável. */
  const [codigoNovo, setCodigoNovo] = useState<
    { rotulo: string; token: string; aviso: string } | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [revogando, setRevogando] = useState<Aparelho | null>(null);

  const ehGestor = papel === 'gestor_geral';
  const minhaCasa = casas.find((c) => c.propria) ?? null;

  async function carregar() {
    setErro('');
    try {
      const [m, s, c] = await Promise.all([
        api<Membro[]>('/staff'),
        api<Setor[]>('/staff/sectors'),
        api<Casa[]>('/houses/directory').catch(() => [] as Casa[]),
      ]);
      setMembros(m); setSetores(s); setCasas(c);
      // Falhar aqui não pode travar a equipe: a aba dos aparelhos apenas fica
      // vazia, e a de pessoas continua servindo a coordenação.
      setAparelhos(await api<Aparelho[]>('/devices').catch(() => []));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a equipe.');
    }
  }
  useEffect(() => { carregar(); }, []);

  /* As cores já em uso na casa DESTA pessoa — para a folha não oferecer o que
     o servidor vai recusar. */
  useEffect(() => {
    if (!pintando?.casaId) { setOcupadas([]); return; }
    api<{ cor: string; deQuem: string; userId: string }[]>(
      `/staff/line-colors?houseId=${pintando.casaId}`)
      .then(setOcupadas).catch(() => setOcupadas([]));
  }, [pintando?.id, pintando?.casaId]);

  async function pintar(m: Membro, cor: string | null) {
    setErro('');
    try {
      await api(`/staff/${m.id}/line-color`, {
        method: 'PATCH', body: JSON.stringify({ cor }),
      });
      setPintando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível definir a cor.');
    }
  }

  async function acao(fn: () => Promise<any>) {
    setErro('');
    try { const r = await fn(); if (r?.aviso) setAviso({ texto: r.aviso, senha: r.senhaInicial }); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); }
  }

  const porSetor = (code: string) => membros.filter((m) => m.cargo === code && m.ativo).length;

  return (
    <>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && (
        <div className="notice c-ok" role="status">
          {aviso.texto}
          {aviso.senha && (
            <div className="senhabox">
              <span className="mutetxt">Senha inicial</span>
              <code>{aviso.senha}</code>
            </div>
          )}
          <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setAviso(null)}>
            Entendi
          </button>
        </div>
      )}

      <nav className="filtros" aria-label="Equipe e aparelhos">
        {([['pessoas', 'Pessoas'], ['aparelhos', 'Aparelhos']] as const).map(([cod, label]) => (
          <button key={cod} className={aba === cod ? 'on' : ''}
                  aria-pressed={aba === cod} onClick={() => setAba(cod)}>
            {label}
          </button>
        ))}
      </nav>

      {aba === 'pessoas' && (
      <div className="card raise">
        <div className="row" style={{ marginBottom: 12 }}>
          <h3 className="grow" style={{ fontSize: 17, margin: 0 }}>Equipe cadastrada</h3>
          <span className="mutetxt">{membros.filter((m) => m.ativo).length} ativos · {membros.length} no total</span>
          {setores.length > 0 && (
            <button className="btn sm" onClick={() => { setEditando(null); setForm(true); }}>
              + Novo cadastro
            </button>
          )}
        </div>

        <div className="tablewrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th><th>E-mail</th><th>Setor</th><th>Casa</th>
                <th>Cor da linha</th><th>Situação</th><th aria-label="Ações"></th>
              </tr>
            </thead>
            <tbody>
              {membros.map((m) => (
                <tr key={m.id} className={m.ativo ? '' : 'inativo'}>
                  <td><b className="ff">{m.nome}</b>{m.proprio && <> <span className="pill c-mute">você</span></>}</td>
                  {/* `data-rotulo` é o que vira etiqueta quando a tabela vira
                      lista no celular: o cabeçalho da coluna some, e sem ele
                      "AI3" sozinho não diz que é a casa. */}
                  <td className="mono" data-rotulo="E-mail">{m.email}</td>
                  <td data-rotulo="Setor">
                    <span className={`pill ${TOM[m.cargo] ?? 'c-mute'}`}>{m.setor}</span>
                  </td>
                  <td data-rotulo="Casa">
                    {m.transversal ? <span className="mutetxt">8 casas</span> : (m.casa ?? '—')}
                  </td>
                  <td data-rotulo="Cor da linha">
                    {/* A cor da ATA. Sempre com o NOME do tom escrito: quem não
                        distingue os matizes ainda consegue escolher e conferir. */}
                    {m.transversal || !m.casaId ? <span className="mutetxt">—</span> : (
                      <button type="button"
                              className={`pill ${m.corDaLinha ?? 'c-mute'}`}
                              onClick={() => setPintando(m)}
                              aria-label={`Cor da linha de ${m.nome}: ${NOME_DO_TOM[m.corDaLinha ?? ''] ?? 'automática'}`}>
                        {NOME_DO_TOM[m.corDaLinha ?? ''] ?? 'automática'}
                      </button>
                    )}
                  </td>
                  <td data-rotulo="Situação">
                    {m.ativo
                      ? <span className="pill c-ok">Ativo</span>
                      : <span className="pill c-mute">Desativado</span>}
                    {m.ativo && m.senhaInicialPendente && (
                      <span className="pill c-warn" title="Ainda usando a senha entregue pela coordenação">
                        senha inicial
                      </span>
                    )}
                  </td>
                  <td className="acoes">
                    {m.editavel && !m.proprio && (
                      <>
                        <button className="btn sm ghost" onClick={() => { setEditando(m); setForm(true); }}>
                          Editar
                        </button>
                        {/*
                          * Convidar vem ANTES de "Nova senha", e é o caminho
                          * preferido: a senha não passa pela mão de quem
                          * convida, o link vale 24 horas e serve uma vez. O
                          * botão não existia — o servidor tinha a rota desde a
                          * fase 9, e a tela só oferecia a senha inicial, que é
                          * justamente o que vira recado de WhatsApp.
                          */}
                        <button className="btn sm" onClick={() => acao(() =>
                          api(`/staff/${m.id}/convite`, { method: 'POST', body: '{}' }))}>
                          Convidar
                        </button>
                        <button className="btn sm ghost" onClick={() => {
                          const ok = confirm(
                            'Prefira o convite: a senha não passa pela sua mão.\n\n'
                            + 'A senha inicial aparece UMA vez e você precisa entregá-la à '
                            + 'pessoa. Continuar mesmo assim?');
                          if (ok) {
                            acao(() => api(`/staff/${m.id}/reset-password`, { method: 'POST', body: '{}' }));
                          }
                        }}>
                          Nova senha
                        </button>
                        {m.ativo ? (
                          <button className="btn sm ghost" onClick={() => {
                            const motivo = prompt('Motivo da desativação (fica registrado):') ?? '';
                            if (motivo.trim().length >= 5) {
                              acao(() => api(`/staff/${m.id}/deactivate`, {
                                method: 'POST', body: JSON.stringify({ motivo }) }));
                            }
                          }}>Desativar</button>
                        ) : (
                          <button className="btn sm ghost" onClick={() => acao(() =>
                            api(`/staff/${m.id}/reactivate`, { method: 'POST', body: '{}' }))}>
                            Reativar
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mutetxt" style={{ marginTop: 12, marginBottom: 0 }}>
          Não existe remover. Desligado é <b>desativado</b>: o acesso acaba na hora e as
          sessões abertas caem, mas tudo o que a pessoa registrou continua com o nome dela.
        </p>
      </div>
      )}

      {aba === 'pessoas' && (
      <>
      <div className="eyebrow">Setores e o que cada um alcança</div>
      <div className="setores">
        {setores.map((s) => (
          <div className="card" key={s.code}>
            <div className="row">
              <span className={`pill ${TOM[s.code] ?? 'c-mute'}`}>{s.label}</span>
              <span className="mutetxt grow">
                {porSetor(s.code)} {porSetor(s.code) === 1 ? 'pessoa' : 'pessoas'}
              </span>
              {s.transversal && <span className="pill c-move">8 casas</span>}
            </div>
            <div className="mutetxt">{s.descricao}</div>
          </div>
        ))}
      </div>
      </>
      )}

      {aba === 'aparelhos' && (
        <Aparelhos
          lista={aparelhos} ehGestor={ehGestor} minhaCasa={minhaCasa}
          onRegistrar={() => setRegistrando(true)}
          onRevogar={(a) => setRevogando(a)} />
      )}

      {/*
        * O CÓDIGO DO APARELHO, UMA VEZ SÓ.
        *
        * Fica numa folha própria e não some sozinho: se aparecesse como aviso
        * de topo, a primeira rolagem da tela o perderia — e não existe rota
        * que o recupere. Quem fecha, fecha sabendo.
        */}
      {codigoNovo && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-cod">
          <div className="sheet modal">
            <h3 id="t-cod">Código de {codigoNovo.rotulo}</h3>
            <div className="notice c-crit">{codigoNovo.aviso}</div>
            <div className="senhabox">
              <span className="mutetxt">Código do aparelho</span>
              <code>{codigoNovo.token}</code>
            </div>
            <p className="mutetxt">
              Digite-o no aparelho da casa AGORA. O sistema guarda apenas a impressão digital
              dele: não há tela, rota nem suporte que o mostre de novo. Perdeu? Registre outro
              aparelho e revogue este — o histórico do revogado continua inteiro.
            </p>
            <div className="row rodape">
              <button className="btn grow" onClick={() => setCodigoNovo(null)}>
                Guardei o código
              </button>
            </div>
          </div>
        </div>
      )}

      {registrando && (
        <FolhaAparelho
          ehGestor={ehGestor} minhaCasa={minhaCasa}
          onFechar={() => setRegistrando(false)}
          onRegistrar={async (rotulo, institucional) => {
            setErro('');
            try {
              const r = await api<{ rotulo: string; token: string; aviso: string }>('/devices', {
                method: 'POST',
                body: JSON.stringify(institucional
                  ? { rotulo }
                  : { rotulo, houseId: minhaCasa?.id }),
              });
              setRegistrando(false);
              setCodigoNovo({ rotulo: r.rotulo ?? rotulo, token: r.token, aviso: r.aviso });
              await carregar();
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível registrar o aparelho.');
            }
          }} />
      )}

      {revogando && (
        <FolhaRevogar
          aparelho={revogando}
          onFechar={() => setRevogando(null)}
          onRevogar={async (motivo) => {
            const alvo = revogando;
            setRevogando(null);
            await acao(() => api(`/devices/${alvo.id}/revoke`, {
              method: 'POST', body: JSON.stringify({ motivo }) }));
          }} />
      )}

      {pintando && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-cor"
             onClick={(e) => { if (e.target === e.currentTarget) setPintando(null); }}>
          <div className="sheet">
            <h3 id="t-cor">Cor da linha de {pintando.nome}</h3>
            <p className="mutetxt">
              É a cor da borda das linhas que esta pessoa escreve na ATA. <b>Duas
              pessoas da mesma casa não podem ter a mesma cor</b> — as que já estão
              com alguém aparecem com o nome de quem as tem. A cor é apoio: o nome
              de quem escreveu continua escrito em toda linha.
            </p>
            <div className="opts">
              {TONS.map((t) => {
                const dona = ocupadas.find((o) => o.cor === t && o.userId !== pintando.id);
                return (
                  <button key={t} type="button" disabled={!!dona}
                          className={`opt ${t} ${pintando.corDaLinha === t ? 'on' : ''}`}
                          onClick={() => pintar(pintando, t)}>
                    {NOME_DO_TOM[t]}
                    {dona && <div className="mutetxt">com {dona.deQuem}</div>}
                  </button>
                );
              })}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              <button type="button" className="btn sec grow" onClick={() => setPintando(null)}>
                Fechar
              </button>
              {/* Tirar a cor é sempre possível: volta ao tom automático. */}
              <button type="button" className="btn ghost grow"
                      onClick={() => pintar(pintando, null)}>
                Deixar automática
              </button>
            </div>
          </div>
        </div>
      )}

      {form && (
        <FormCadastro
          setores={setores} casas={casas} membro={editando}
          onFechar={() => { setForm(false); setEditando(null); }}
          onSalvo={(r) => {
            setForm(false); setEditando(null);
            if (r?.aviso) setAviso({ texto: r.aviso, senha: r.senhaInicial });
            carregar();
          }}
          onErro={setErro}
        />
      )}
    </>
  );
}

function FormCadastro({ setores, casas, membro, onFechar, onSalvo, onErro }: {
  setores: Setor[]; casas: Casa[]; membro: Membro | null;
  onFechar: () => void; onSalvo: (r: any) => void; onErro: (e: string) => void;
}) {
  const [nome, setNome] = useState(membro?.nome ?? '');
  const [email, setEmail] = useState(membro?.email ?? '');
  const [cargo, setCargo] = useState(membro?.cargo ?? setores[0]?.code ?? '');
  const [casaId, setCasaId] = useState(membro?.casaId ?? casas.find((c) => c.propria)?.id ?? '');
  const [ocupado, setOcupado] = useState(false);

  const setor = setores.find((s) => s.code === cargo);
  const editar = membro != null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const r = editar
        ? await api(`/staff/${membro!.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ nome, cargo, casaId: setor?.exigeCasa ? casaId : null }),
          })
        : await api('/staff', {
            method: 'POST',
            body: JSON.stringify({ nome, email, cargo, casaId: setor?.exigeCasa ? casaId : null }),
          });
      onSalvo(r);
    } catch (e) {
      onErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      onFechar();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={(e) => {
      if (e.target === e.currentTarget) onFechar();
    }}>
      <div className="sheet modal">
        <h3>{editar ? `Editar ${membro!.nome}` : 'Cadastrar profissional'}</h3>

        <form onSubmit={salvar}>
          <label className="f" htmlFor="nome">Nome completo</label>
          <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />

          <label className="f" htmlFor="mail">E-mail institucional</label>
          <input id="mail" type="email" value={email} disabled={editar}
                 onChange={(e) => setEmail(e.target.value)} required
                 placeholder="nome@paodospobres.org.br" />
          {editar && <p className="mutetxt">O e-mail identifica a conta e não muda.</p>}

          <label className="f" htmlFor="setor">Setor</label>
          <select id="setor" value={cargo} onChange={(e) => setCargo(e.target.value)}>
            {setores.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
          {setor && <p className="mutetxt">{setor.descricao}</p>}

          {setor?.exigeCasa ? (
            <>
              <label className="f" htmlFor="casa">Casa</label>
              <select id="casa" value={casaId} onChange={(e) => setCasaId(e.target.value)} required>
                <option value="">Escolha a unidade</option>
                {casas.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
                ))}
              </select>
            </>
          ) : (
            <div className="notice c-move">
              Este é um cargo <b>transversal</b>: alcança as oito casas por função, sem
              vínculo com uma unidade (§5.13).
            </div>
          )}

          {!editar && (
            <div className="notice c-info">
              O sistema gera uma <b>senha inicial</b> e mostra uma única vez. Entregue à
              pessoa; no primeiro acesso ela é convidada a criar a sua.
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 16 }}>
            <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="btn grow" disabled={ocupado}>
              {ocupado ? 'Salvando…' : editar ? 'Salvar alterações' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * A LISTA DE APARELHOS DA CASA.
 *
 * O aparelho revogado NÃO some: ele continua na lista, marcado, com o motivo e
 * a data. As doses que ele confirmou continuam rastreáveis, e apagá-lo daqui
 * transformaria cada uma delas num registro de aparelho desconhecido.
 */
function Aparelhos({ lista, ehGestor, minhaCasa, onRegistrar, onRevogar }: {
  lista: Aparelho[]; ehGestor: boolean; minhaCasa: Casa | null;
  onRegistrar: () => void; onRevogar: (a: Aparelho) => void;
}) {
  const ativos = lista.filter((a) => a.ativo);
  return (
    <>
      <div className="card raise stack">
        <div className="row">
          <h3 className="grow" style={{ fontSize: 17, margin: 0 }}>
            Aparelhos institucionais
          </h3>
          <span className="mutetxt">
            {ativos.length} ativo(s) · {lista.length} no total
          </span>
          <button className="btn sm" onClick={onRegistrar}>+ Registrar aparelho</button>
        </div>

        <div className="notice c-crit">
          Isto é o que decide, <b>offline</b>, quem pode confirmar medicamento (§11.7). Um
          aparelho não se declara institucional: ele recebe um <b>código</b> no registro, e o
          servidor confere contra o que a casa tem cadastrado.
        </div>

        {lista.length === 0 && (
          <p className="mutetxt" style={{ margin: 0 }}>
            Nenhum aparelho registrado{minhaCasa ? ` em ${minhaCasa.codigo}` : ''}. Enquanto
            não houver, <b>nenhuma confirmação de dose offline é aceita</b> — que é o padrão
            protetivo, e não um defeito.
          </p>
        )}

        <ul className="lista">
          {lista.map((a) => (
            <li key={a.id} className="row">
              <div className="grow">
                <b className="ff">{a.rotulo}</b>
                <div className="mutetxt linhadois">
                  {a.escopo === 'instituicao' ? 'Vale nas oito casas' : 'Aparelho desta casa'}
                  {' · registrado em '}{quando(a.registradoEm) ?? '—'}
                </div>
                <div className="mutetxt">
                  {a.ultimoUso
                    ? `Último uso: ${quando(a.ultimoUso)}`
                    : 'Nunca usado para confirmar dose.'}
                </div>
                {/* Revogado continua contando o que houve: quando, e por quê. */}
                {!a.ativo && (
                  <div className="mutetxt">
                    Revogado em {quando(a.revogadoEm) ?? '—'}
                    {a.motivoRevogacao ? ` — ${a.motivoRevogacao}` : ''}
                  </div>
                )}
              </div>
              <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
                <span className={`pill ${a.ativo ? 'c-ok' : 'c-mute'}`}>
                  {a.ativo ? 'Ativo' : 'Revogado'}
                </span>
                {a.ativo && (
                  <button className="btn sec sm" onClick={() => onRevogar(a)}>Revogar</button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <p className="mutetxt" style={{ margin: 0 }}>
          Revogar não apaga: o aparelho continua nesta lista, com a data e o motivo, e as
          doses que ele confirmou seguem rastreáveis.
          {ehGestor
            ? ' Como Gestor Geral, você registra também o aparelho que vale nas oito casas.'
            : ' O aparelho que vale nas oito casas é registrado pelo Gestor Geral.'}
        </p>
      </div>
    </>
  );
}

/**
 * A FOLHA DE REGISTRO.
 *
 * O rótulo é o que a equipe vai reconhecer na prateleira às 23h — "tablet da
 * sala" serve, "Aparelho 1" não. Por isso o exemplo está no campo, e não numa
 * ajuda que ninguém abre.
 */
function FolhaAparelho({ ehGestor, minhaCasa, onFechar, onRegistrar }: {
  ehGestor: boolean; minhaCasa: Casa | null; onFechar: () => void;
  onRegistrar: (rotulo: string, institucional: boolean) => void;
}) {
  const [rotulo, setRotulo] = useState('');
  const [institucional, setInstitucional] = useState(false);
  const pode = rotulo.trim().length >= 3 && (institucional || Boolean(minhaCasa));

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-ap"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-ap">Registrar aparelho</h3>
        <div className="notice c-info">
          O código aparece <b>uma única vez</b>, na tela seguinte. O sistema guarda só a
          impressão digital dele — como faz com as senhas.
        </div>

        <label className="f" htmlFor="ap-rot">
          Nome do aparelho <small>— o que a equipe reconhece na prateleira</small>
        </label>
        <input id="ap-rot" value={rotulo} onChange={(e) => setRotulo(e.target.value)}
               placeholder="Ex.: tablet da sala da coordenação" />

        {ehGestor && (
          <label className="row" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={institucional}
                   onChange={(e) => setInstitucional(e.target.checked)} />
            <span className="grow">
              <b className="ff">Vale nas oito casas</b>
              <div className="mutetxt">
                Aparelho da instituição, não de uma unidade. Só o Gestor Geral registra.
              </div>
            </span>
          </label>
        )}

        {!institucional && (
          <p className="mutetxt">
            {minhaCasa
              ? `Será registrado em ${minhaCasa.codigo} — ${minhaCasa.nome}.`
              : 'Sem uma casa no seu alcance, só é possível registrar o aparelho da instituição.'}
          </p>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onRegistrar(rotulo.trim(), institucional)}>
            Registrar e ver o código
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A FOLHA DE REVOGAÇÃO.
 *
 * O motivo não é burocracia: um aparelho revogado é um aparelho que sumiu, que
 * quebrou ou que saiu da casa — e a diferença entre esses três importa para
 * quem for ler o histórico das doses que ele confirmou.
 */
function FolhaRevogar({ aparelho, onFechar, onRevogar }: {
  aparelho: Aparelho; onFechar: () => void; onRevogar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-rev"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-rev">Revogar {aparelho.rotulo}</h3>
        <div className="notice c-warn">
          A partir daqui este aparelho <b>não confirma mais dose offline</b>. O registro dele
          permanece, e as confirmações que já fez continuam rastreáveis.
        </div>

        <label className="f" htmlFor="rev-mot">
          Por que está sendo revogado <small>— sumiu, quebrou, saiu da casa?</small>
        </label>
        <textarea id="rev-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: aparelho devolvido à administração após a troca do tablet da sala." />

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" onClick={() => onRevogar(motivo.trim())}>
            Revogar
          </button>
        </div>
      </div>
    </div>
  );
}
