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

/**
 * BENEFÍCIOS E DADOS BANCÁRIOS (§6.10) — a outra metade da mesma porta.
 *
 * Três rotas existiam com RLS, reautenticação e log por visualização, e não
 * tinham tela: hoje isso mora numa planilha compartilhada, com o número do
 * benefício ao lado do CPF. Entram AQUI, atrás da mesma senha do cofre, porque
 * é a mesma área e a mesma regra — e porque quem abre uma costuma precisar da
 * outra na mesma tarefa.
 *
 * O que a planilha tem e o sistema não mostrava: número do benefício, operação
 * da conta, nome da agência e a PENDÊNCIA BANCÁRIA — que é o motivo de a
 * planilha existir. Estavam no banco desde a migração 055; o serviço nunca as
 * leu nem as gravou.
 */
interface Beneficio {
  id: string; tipo: string; tipoRotulo: string; numero: string | null;
  banco: string | null; agencia: string | null; agenciaNome: string | null;
  conta: string | null; operacao: string | null;
  situacao: string; situacaoRotulo: string;
  pendenciaBancaria: boolean; pendenciaNota: string | null;
  observacoes: string | null;
  temAcessoGov: boolean; responsavelPeloAcesso: string | null;
  ondeEstaGuardado: string | null;
  atualizadoEm: string; atualizadoPor: string | null;
}
interface Vocabulario {
  tipos: { cod: string; label: string }[];
  situacoes: { cod: string; label: string }[];
  aviso: string;
}
interface AcessoBeneficio {
  quando: string; quem: string; finalidade: string | null;
  acao: string; recusada: boolean;
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
  const [aba, setAba] = useState<'acessos' | 'beneficios'>('acessos');
  const [vocab, setVocab] = useState<Vocabulario | null>(null);
  const [beneficios, setBeneficios] = useState<Beneficio[] | null>(null);
  const [acessosBeneficio, setAcessosBeneficio] = useState<AcessoBeneficio[]>([]);
  const [editando, setEditando] = useState<Beneficio | 'novo' | null>(null);
  const [exportando, setExportando] = useState(false);

  const pessoa = pessoas.find((p) => p.id === pessoaId) ?? null;
  /* alcance:beneficios — coordenação da casa ATUAL e Gestor Geral (§6.10). */
  const podeEditarBeneficio = ['coordenador', 'gestor_geral'].includes(papel);

  useEffect(() => {
    (async () => {
      try {
        const [p, t, v] = await Promise.all([
          api<Pessoa[]>(`/people?houseId=${houseId}`),
          api<Tipo[]>('/people/credentials/kinds'),
          api<Vocabulario>('/people/benefits/kinds'),
        ]);
        setPessoas(p); setTipos(t); setVocab(v);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar a lista.');
      }
    })();
  }, [houseId]);

  /**
   * Ver os benefícios é um ato com finalidade DECLARADA, e não uma tela que
   * abre sozinha ao trocar de aba. Por isso a lista começa nula: enquanto
   * ninguém escreveu para que precisa, não há dado bancário na tela.
   */
  async function abrirBeneficios(finalidade: string) {
    setErro('');
    try {
      const r = await api<{ registros: Beneficio[]; pendencias: number }>(
        `/people/${pessoaId}/benefits/view`,
        { method: 'POST', body: JSON.stringify({ finalidade }) });
      setBeneficios(r.registros);
      setAcessosBeneficio(await api<AcessoBeneficio[]>(
        `/people/${pessoaId}/benefits/history`, { method: 'POST', body: '{}' }).catch(() => []));
    } catch (e) {
      if (e instanceof ErroApi && (e.status === 401 || e.status === 403)) {
        setLiberado(false); setBeneficios(null); setErro(e.message); return;
      }
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir os benefícios.');
    }
  }

  /** Abre o cofre DE UMA criança. Listar já é um ato auditado — por isso POST. */
  async function carregar(id = pessoaId) {
    // Trocar de criança fecha os benefícios: a finalidade declarada era para
    // AQUELA criança, e não um passe para percorrer a casa inteira.
    setBeneficios(null); setAcessosBeneficio([]);
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

      {/* A criança vem ANTES da aba: as duas áreas são de uma criança por vez,
          e não uma lista da casa. Trocar de criança fecha os benefícios. */}
      <div className="card raise stack">
        <label className="f" htmlFor="cofre-pessoa">
          Acolhido <small>— uma criança por vez, e não uma lista da casa</small>
        </label>
        <select id="cofre-pessoa" value={pessoaId}
                onChange={(e) => { setPessoaId(e.target.value); carregar(e.target.value); }}>
          <option value="">Escolha…</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

      <div className="filtros" role="tablist">
        <button role="tab" aria-selected={aba === 'acessos'}
                className={aba === 'acessos' ? 'on' : ''} onClick={() => setAba('acessos')}>
          🔑 Acessos
        </button>
        <button role="tab" aria-selected={aba === 'beneficios'}
                className={aba === 'beneficios' ? 'on' : ''} onClick={() => setAba('beneficios')}>
          🏦 Benefícios
        </button>
      </div>

      {aba === 'acessos' && (
      <>
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
      </>
      )}

      {/* ---------------------------------------------------------------
        * BENEFÍCIOS E DADOS BANCÁRIOS (§6.10)
        *
        * A lista não abre sozinha ao trocar de aba: ver dado bancário de uma
        * criança é um ato com finalidade declarada, e é isso que fica no log.
        * Uma tela que abre sozinha transformaria a finalidade em formalidade.
        * -------------------------------------------------------------- */}
      {aba === 'beneficios' && (
      <>
      <div className="eyebrow">Benefícios e dados bancários</div>

      {!pessoa && (
        <div className="card">
          <p className="mutetxt" style={{ margin: 0 }}>
            Escolha o acolhido acima. Esta área é de uma criança por vez.
          </p>
        </div>
      )}

      {pessoa && beneficios === null && (
        <div className="card raise stack">
          <div className="notice c-med">
            🏦 Para ver os benefícios de <b>{pessoa.nome}</b> você precisa dizer para quê.
            A finalidade fica registrada com o seu nome e o horário — é o que separa
            "consultei porque precisava" de "abri porque estava ali".
          </div>
          <FinalidadeInline
            rotulo={`Para que você precisa dos dados bancários de ${pessoa.nome}?`}
            placeholder="Ex.: conferir a conta para o saque do BPC de setembro"
            botao="Abrir os benefícios"
            onEnviar={abrirBeneficios} />
        </div>
      )}

      {pessoa && beneficios !== null && (
        <>
          {beneficios.some((b) => b.pendenciaBancaria) && (
            <div className="notice c-warn">
              <b>Há pendência bancária registrada.</b> É o que a planilha da casa existe
              para lembrar: o benefício existe e está travado em algum lugar da rede.
            </div>
          )}

          <div className="stack">
            {beneficios.map((b) => (
              <div className="card stack" key={b.id}>
                <div className="row">
                  <b className="ff grow">{b.tipoRotulo}</b>
                  {b.pendenciaBancaria && <span className="pill c-warn">pendência</span>}
                  <span className={`pill ${b.situacao === 'ativo' ? 'c-ok'
                    : b.situacao === 'em_regularizacao' ? 'c-med' : 'c-mute'}`}>
                    {b.situacaoRotulo}
                  </span>
                </div>
                {b.numero && <div className="mutetxt mono">Nº {b.numero}</div>}
                {(b.banco || b.agencia || b.conta) && (
                  <div className="mutetxt mono">
                    {b.banco ?? '—'}
                    {b.agencia ? ` · ag. ${b.agencia}` : ''}
                    {b.agenciaNome ? ` (${b.agenciaNome})` : ''}
                    {b.conta ? ` · c/c ${b.conta}` : ''}
                    {b.operacao ? ` · op. ${b.operacao}` : ''}
                  </div>
                )}
                {b.pendenciaNota && (
                  <div className="bloco"><small>O que falta resolver</small>{b.pendenciaNota}</div>
                )}
                {b.observacoes && <div className="mutetxt">{b.observacoes}</div>}
                {b.temAcessoGov && (
                  <div className="notice c-info">
                    Existe credencial (gov.br / INSS / CTPS) para este benefício.
                    {b.responsavelPeloAcesso ? ` Responde por ela: ${b.responsavelPeloAcesso}.` : ''}
                    {b.ondeEstaGuardado ? ` ${b.ondeEstaGuardado}` : ''}
                    {' '}<b>A senha não fica aqui</b> — ela tem lugar próprio e cifrado, na
                    aba Acessos.
                  </div>
                )}
                <div className="row">
                  <span className="mutetxt grow">
                    Atualizado em {quando(b.atualizadoEm)}
                    {b.atualizadoPor ? ` por ${b.atualizadoPor}` : ''}.
                  </span>
                  {podeEditarBeneficio && (
                    <button className="btn sm ghost" onClick={() => setEditando(b)}>Editar</button>
                  )}
                </div>
              </div>
            ))}
            {beneficios.length === 0 && (
              <div className="card">
                <p className="mutetxt" style={{ margin: 0 }}>
                  Nenhum benefício registrado para {pessoa.nome}. A consulta ficou registrada
                  mesmo assim — perguntar também é um acesso.
                </p>
              </div>
            )}
          </div>

          {podeEditarBeneficio && (
            <button className="btn sec block" style={{ marginTop: 12 }}
                    onClick={() => setEditando('novo')}>
              + Registrar um benefício de {pessoa.nome}
            </button>
          )}
          <button className="btn sec block" style={{ marginTop: 8 }}
                  onClick={() => setExportando(true)}>
            🖨️ Imprimir ou exportar
          </button>

          <div className="eyebrow">Quem abriu, quando e para quê</div>
          <div className="card">
            <ul className="lista">
              {acessosBeneficio.map((h, i) => (
                <li key={i} className="row">
                  <div className="grow">
                    <b className="ff">{h.quem}</b>
                    <div className="mutetxt">{h.acao} · {quando(h.quando)}</div>
                    {h.finalidade && <div className="mutetxt">Finalidade: {h.finalidade}</div>}
                  </div>
                  {/* A tentativa recusada é a linha mais importante desta lista. */}
                  {h.recusada && <span className="pill c-crit">recusada</span>}
                </li>
              ))}
              {acessosBeneficio.length === 0 && <li className="mutetxt">Nada aberto ainda.</li>}
            </ul>
            <p className="mutetxt" style={{ margin: '10px 0 0' }}>
              Inclusive a tentativa de quem <b>não podia</b> abrir: ela fica escrita, com o
              nome de quem tentou.
            </p>
          </div>
        </>
      )}
      </>
      )}

      {editando && pessoa && vocab && (
        <FolhaBeneficio
          vocab={vocab} nome={pessoa.nome}
          registro={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvar={async (corpo) => {
            setErro('');
            try {
              await api(`/people/${pessoa.id}/benefits`, {
                method: 'POST', body: JSON.stringify(corpo) });
              setEditando(null);
              setAviso('Registrado. A alteração ficou no histórico com a finalidade que você '
                       + 'declarou — os valores não vão para o log, só quais campos mudaram.');
              await abrirBeneficios('Conferência após alteração feita por mim.');
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível gravar.');
            }
          }} />
      )}

      {exportando && pessoa && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-exp"
             onClick={(e) => { if (e.target === e.currentTarget) setExportando(false); }}>
          <div className="sheet modal">
            <h3 id="t-exp">Imprimir ou exportar · {pessoa.nome}</h3>
            <div className="notice c-med">
              Imprimir tem a <b>mesma fricção de ver</b>: a finalidade fica registrada. Papel
              impresso sai do sistema e não volta — depois disso, quem cuida é quem guardou.
            </div>
            <FinalidadeInline
              rotulo="Para que você precisa da via impressa?"
              placeholder="Ex.: levar ao INSS na perícia de 12/09"
              botao="Registrar e exportar"
              onEnviar={async (finalidade) => {
                setErro('');
                try {
                  const r = await api<{ aviso: string }>(`/people/${pessoa.id}/benefits/export`, {
                    method: 'POST', body: JSON.stringify({ formato: 'pdf', finalidade }) });
                  setExportando(false); setAviso(r.aviso);
                  setAcessosBeneficio(await api<AcessoBeneficio[]>(
                    `/people/${pessoa.id}/benefits/history`,
                    { method: 'POST', body: '{}' }).catch(() => acessosBeneficio));
                } catch (e) {
                  setErro(e instanceof Error ? e.message : 'Não foi possível exportar.');
                }
              }} />
            <button className="btn sec block" style={{ marginTop: 10 }}
                    onClick={() => setExportando(false)}>Cancelar</button>
          </div>
        </div>
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

      {/*
        * A SENHA DO PROTÓTIPO PRECISA ESTAR ESCRITA NA TELA.
        *
        * O arquivo abre sem senha — "Entrar no sistema" e pronto —, e três
        * telas depois ele pede "sua senha". Quem está demonstrando não tem
        * senha nenhuma para dar, tenta, erra, e conclui que o cofre está
        * quebrado. Foi exatamente o que aconteceu.
        *
        * No sistema real esta dica não existe: lá a pessoa tem senha, e
        * escrevê-la na tela seria o oposto do que este cofre defende.
        */}
      {import.meta.env.VITE_PROTOTIPO === '1' && (
        <div className="notice c-info" role="note">
          <b>No protótipo, a senha é</b> <code>senha-dev-123</code>. No sistema real é a
          senha da pessoa, e ela é conferida no servidor.
        </div>
      )}

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

/**
 * A FINALIDADE, pedida no lugar onde o ato acontece.
 *
 * Não é uma folha por cima da folha: quem vai ver os dados bancários escreve
 * ali mesmo por que precisa, e só então a tela abre. Cinco caracteres é pouco
 * de propósito — o objetivo não é dificultar, é fazer a pessoa dizer em voz
 * alta o que está fazendo.
 */
function FinalidadeInline({ rotulo, placeholder, botao, onEnviar }: {
  rotulo: string; placeholder: string; botao: string;
  onEnviar: (finalidade: string) => void | Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setOcupado(true);
      try { await onEnviar(texto.trim()); } finally { setOcupado(false); }
    }}>
      <label className="f" htmlFor="fin-ben">{rotulo}</label>
      <input id="fin-ben" value={texto} onChange={(e) => setTexto(e.target.value)}
             placeholder={placeholder} autoComplete="off" />
      <button className="btn block" type="submit"
              disabled={ocupado || texto.trim().length < 5}>
        {ocupado ? 'Registrando…' : botao}
      </button>
    </form>
  );
}

/**
 * REGISTRAR OU CORRIGIR UM BENEFÍCIO.
 *
 * Os campos são os da planilha real da casa, inclusive os que o serviço tinha
 * no banco e nunca gravou: número, operação, nome da agência e a pendência.
 *
 * Duas recusas que a folha carrega, e que existem pelo mesmo motivo:
 *
 *  * pendência marcada exige uma linha dizendo QUAL é. "Pendente" sozinho é
 *    uma caixa marcada que a próxima coordenação não sabe resolver;
 *  * senha não entra aqui. O sistema registra que a credencial EXISTE e quem
 *    responde por ela; o segredo fica cifrado na aba Acessos. É a diferença
 *    entre um vazamento constrangedor e um vazamento que abre o gov.br de uma
 *    criança com o CPF dela na linha de cima.
 */
function FolhaBeneficio({ vocab, nome, registro, onFechar, onSalvar }: {
  vocab: Vocabulario; nome: string; registro: Beneficio | null;
  onFechar: () => void; onSalvar: (corpo: Record<string, unknown>) => void;
}) {
  const [tipo, setTipo] = useState(registro?.tipo ?? vocab.tipos[0].cod);
  const [numero, setNumero] = useState(registro?.numero ?? '');
  const [banco, setBanco] = useState(registro?.banco ?? '');
  const [agencia, setAgencia] = useState(registro?.agencia ?? '');
  const [agenciaNome, setAgenciaNome] = useState(registro?.agenciaNome ?? '');
  const [conta, setConta] = useState(registro?.conta ?? '');
  const [operacao, setOperacao] = useState(registro?.operacao ?? '');
  const [situacao, setSituacao] = useState(registro?.situacao ?? vocab.situacoes[0].cod);
  const [pendencia, setPendencia] = useState(registro?.pendenciaBancaria ?? false);
  const [pendenciaNota, setPendenciaNota] = useState(registro?.pendenciaNota ?? '');
  const [observacoes, setObservacoes] = useState(registro?.observacoes ?? '');
  const [temGov, setTemGov] = useState(registro?.temAcessoGov ?? false);
  const [respGov, setRespGov] = useState(registro?.responsavelPeloAcesso ?? 'Coordenação da casa');
  const [ondeGov, setOndeGov] = useState(registro?.ondeEstaGuardado ?? '');
  const [finalidade, setFinalidade] = useState('');

  const pode = finalidade.trim().length >= 5
    && (!pendencia || pendenciaNota.trim().length >= 5);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-ben"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-ben">
          {registro ? 'Corrigir benefício' : 'Registrar benefício'} · {nome}
        </h3>

        <label className="f" htmlFor="ben-tipo">Tipo</label>
        <select id="ben-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {vocab.tipos.map((t) => <option key={t.cod} value={t.cod}>{t.label}</option>)}
        </select>

        <label className="f" htmlFor="ben-num">
          Número do benefício <small>— o que a rede pede ao telefone</small>
        </label>
        <input id="ben-num" value={numero} onChange={(e) => setNumero(e.target.value)} />

        <label className="f" htmlFor="ben-banco">Banco</label>
        <input id="ben-banco" value={banco} onChange={(e) => setBanco(e.target.value)} />

        <div className="row">
          <div className="grow">
            <label className="f" htmlFor="ben-ag">Agência</label>
            <input id="ben-ag" value={agencia} onChange={(e) => setAgencia(e.target.value)} />
          </div>
          <div className="grow">
            <label className="f" htmlFor="ben-op">
              Operação <small>— 013, 023, 644…</small>
            </label>
            <input id="ben-op" value={operacao} onChange={(e) => setOperacao(e.target.value)} />
          </div>
        </div>

        <label className="f" htmlFor="ben-agnome">
          Nome da agência <small>— porque o número sozinho não acha a fila certa</small>
        </label>
        <input id="ben-agnome" value={agenciaNome}
               onChange={(e) => setAgenciaNome(e.target.value)} />

        <label className="f" htmlFor="ben-conta">Conta</label>
        <input id="ben-conta" value={conta} onChange={(e) => setConta(e.target.value)} />

        <label className="f" htmlFor="ben-sit">Situação</label>
        <select id="ben-sit" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
          {vocab.situacoes.map((s) => <option key={s.cod} value={s.cod}>{s.label}</option>)}
        </select>

        <label className="check">
          <input type="checkbox" checked={pendencia}
                 onChange={(e) => setPendencia(e.target.checked)} />
          <span>Há pendência bancária</span>
        </label>
        {pendencia && (
          <>
            <label className="f" htmlFor="ben-pend">
              Qual é a pendência
              <small> — o que falta fazer, e onde. É isto que passa de uma coordenação
                para a próxima.</small>
            </label>
            <textarea id="ben-pend" value={pendenciaNota}
                      onChange={(e) => setPendenciaNota(e.target.value)}
                      placeholder="Ex.: conta bloqueada por falta de atualização cadastral; agendado no banco para 12/09." />
          </>
        )}

        <label className="f" htmlFor="ben-obs">Observações</label>
        <textarea id="ben-obs" value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)} />

        <label className="check">
          <input type="checkbox" checked={temGov}
                 onChange={(e) => setTemGov(e.target.checked)} />
          <span>Existe credencial gov.br / INSS / CTPS para este benefício</span>
        </label>
        {temGov && (
          <>
            <label className="f" htmlFor="ben-resp">Quem responde por ela</label>
            <input id="ben-resp" value={respGov} onChange={(e) => setRespGov(e.target.value)} />
            <label className="f" htmlFor="ben-onde">
              Onde está guardada <small>— o LUGAR, nunca a senha</small>
            </label>
            <input id="ben-onde" value={ondeGov} onChange={(e) => setOndeGov(e.target.value)}
                   placeholder="Ex.: guardada no cofre de acessos deste sistema" />
            <div className="notice c-med">
              🔒 <b>A senha não vai aqui.</b> Ela tem lugar próprio e cifrado, na aba
              Acessos, onde cada abertura pede finalidade e fica com nome e hora.
            </div>
          </>
        )}

        <label className="f" htmlFor="ben-fin">Para que você está alterando isto?</label>
        <input id="ben-fin" value={finalidade} onChange={(e) => setFinalidade(e.target.value)}
               placeholder="Ex.: atualização depois do atendimento no INSS" />
        <p className="mutetxt" style={{ margin: '6px 0 0' }}>
          O log guarda <b>quais campos</b> mudaram e a finalidade — nunca os valores.
        </p>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" disabled={!pode}
                  onClick={() => onSalvar({
                    id: registro?.id, tipo,
                    numero: numero.trim() || undefined,
                    banco: banco.trim() || undefined,
                    agencia: agencia.trim() || undefined,
                    agenciaNome: agenciaNome.trim() || undefined,
                    conta: conta.trim() || undefined,
                    operacao: operacao.trim() || undefined,
                    situacao,
                    observacoes: observacoes.trim() || undefined,
                    pendenciaBancaria: pendencia,
                    pendenciaNota: pendenciaNota.trim() || undefined,
                    temAcessoGov: temGov,
                    responsavelPeloAcesso: temGov ? respGov.trim() || undefined : undefined,
                    ondeEstaGuardado: temGov ? ondeGov.trim() || undefined : undefined,
                    finalidade: finalidade.trim(),
                  })}>
            {registro ? 'Gravar correção' : 'Registrar'}
          </button>
        </div>
      </div>
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
