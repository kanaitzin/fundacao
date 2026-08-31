import { useEffect, useState } from 'react';
import { api } from '../api';

interface Setor {
  code: string; label: string; descricao: string; transversal: boolean; exigeCasa: boolean;
}
interface Membro {
  id: string; nome: string; email: string; cargo: string; setor: string;
  transversal: boolean; casa: string | null; casaId: string | null;
  ativo: boolean; ultimoAcesso: string | null;
  senhaInicialPendente: boolean; editavel: boolean; proprio: boolean;
}
interface Casa { id: string; codigo: string; nome: string; propria: boolean; }

const TOM: Record<string, string> = {
  educador: 'c-info', lider_diurno: 'c-ok', equipe_tecnica: 'c-other',
  cozinha: 'c-warn', enfermagem: 'c-med', lider_noturno_geral: 'c-move',
  coordenador: 'c-brand', gestor_geral: 'c-brand', admin_tecnico: 'c-mute',
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
export function Equipe() {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [casas, setCasas] = useState<Casa[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState<{ texto: string; senha?: string } | null>(null);
  const [form, setForm] = useState(false);
  const [editando, setEditando] = useState<Membro | null>(null);

  async function carregar() {
    setErro('');
    try {
      const [m, s, c] = await Promise.all([
        api<Membro[]>('/staff'),
        api<Setor[]>('/staff/sectors'),
        api<Casa[]>('/houses/directory').catch(() => [] as Casa[]),
      ]);
      setMembros(m); setSetores(s); setCasas(c);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a equipe.');
    }
  }
  useEffect(() => { carregar(); }, []);

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
                <th>Situação</th><th aria-label="Ações"></th>
              </tr>
            </thead>
            <tbody>
              {membros.map((m) => (
                <tr key={m.id} className={m.ativo ? '' : 'inativo'}>
                  <td><b className="ff">{m.nome}</b>{m.proprio && <> <span className="pill c-mute">você</span></>}</td>
                  <td className="mono">{m.email}</td>
                  <td><span className={`pill ${TOM[m.cargo] ?? 'c-mute'}`}>{m.setor}</span></td>
                  <td>{m.transversal ? <span className="mutetxt">8 casas</span> : (m.casa ?? '—')}</td>
                  <td>
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
