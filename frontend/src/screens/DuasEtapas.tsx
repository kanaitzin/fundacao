import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icone } from '../icones';

/**
 * AS DUAS ETAPAS PARA ENTRAR (fase 187; decidido em 05/10: ninguém é
 * obrigado, qualquer pessoa liga para si).
 *
 * Ligar tem três passos, e nenhum se pula: a senha de novo (quem pegou o
 * celular destravado não liga por você), o segredo lido pelo aplicativo
 * autenticador, e o primeiro código certo. Só depois disso a entrada passa a
 * pedir o código, e é aí que aparecem os oito códigos de reserva, UMA vez.
 *
 * No celular, o botão "Abrir no aplicativo autenticador" leva o segredo direto
 * para o aplicativo; no computador, o segredo aparece para ser digitado nele.
 */
interface Estado { ligada: boolean; desde: string | null; reservasRestantes: number }

export function FolhaDuasEtapas({ onFechar }: { onFechar: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [passo, setPasso] = useState<'ver' | 'senha' | 'aplicativo' | 'reservas' | 'desligar'>('ver');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [segredo, setSegredo] = useState<{ segredo: string; endereco: string } | null>(null);
  const [reservas, setReservas] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = () => api<Estado>('/auth/segunda-etapa').then(setEstado).catch((e) =>
    setErro(e instanceof Error ? e.message : 'Não foi possível ler as duas etapas.'));
  useEffect(() => { void carregar(); }, []);

  async function fazer(f: () => Promise<void>) {
    setErro(''); setOcupado(true);
    try { await f(); } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); }
    finally { setOcupado(false); }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-duas"
         onClick={(e) => { if (e.target === e.currentTarget && passo !== 'reservas') onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-duas"><Icone nome="cadeado" /> Duas etapas para entrar</h3>

        {passo === 'ver' && estado && (
          <>
            <p className="mutetxt">
              Além da senha, a entrada pede os seis números de um aplicativo autenticador no seu
              celular (Google Authenticator, Microsoft Authenticator ou outro). Quem descobrir a sua
              senha não entra sem o seu celular. É opcional.
            </p>
            {estado.ligada ? (
              <>
                <div className="notice c-ok" role="status" style={{ margin: 0 }}>
                  Ligadas{estado.desde && <> desde {new Date(estado.desde).toLocaleDateString('pt-BR')}</>}.
                  {' '}Restam {estado.reservasRestantes} {estado.reservasRestantes === 1 ? 'código' : 'códigos'} de reserva.
                </div>
                <div className="conta-acoes">
                  <button className="btn ghost" onClick={() => { setSenha(''); setPasso('desligar'); }}>
                    Desligar as duas etapas
                  </button>
                  <button className="btn sec" onClick={onFechar}>Fechar</button>
                </div>
              </>
            ) : (
              <div className="conta-acoes">
                <button className="btn" onClick={() => { setSenha(''); setPasso('senha'); }}>Ligar as duas etapas</button>
                <button className="btn sec" onClick={onFechar}>Fechar</button>
              </div>
            )}
          </>
        )}

        {passo === 'senha' && (
          <form onSubmit={(e) => { e.preventDefault(); void fazer(async () => {
            setSegredo(await api('/auth/segunda-etapa/iniciar', { method: 'POST', body: JSON.stringify({ senha }) }));
            setCodigo(''); setPasso('aplicativo');
          }); }}>
            <p className="mutetxt">Primeiro, a sua senha, para confirmar que é você.</p>
            <label className="f" htmlFor="duas-senha">Senha</label>
            <input id="duas-senha" className="field" type="password" autoComplete="current-password" required
                   value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
            {erro && <div className="notice c-crit" role="alert">{erro}</div>}
            <div className="row rodape">
              <button type="button" className="btn sec grow" onClick={() => { setErro(''); setPasso('ver'); }}>Voltar</button>
              <button className="btn grow" disabled={ocupado}>{ocupado ? 'Conferindo…' : 'Continuar'}</button>
            </div>
          </form>
        )}

        {passo === 'aplicativo' && segredo && (
          <form onSubmit={(e) => { e.preventDefault(); void fazer(async () => {
            const r = await api<{ reservas: string[] }>('/auth/segunda-etapa/confirmar',
              { method: 'POST', body: JSON.stringify({ codigo }) });
            setReservas(r.reservas); setPasso('reservas');
          }); }}>
            <ol className="stack" style={{ paddingLeft: 20 }}>
              <li>
                No celular, toque em <b>Abrir no aplicativo autenticador</b>. No computador, abra o
                aplicativo no celular, escolha adicionar conta por chave e digite esta chave:
                <div className="bloco mono" style={{ fontSize: 17, letterSpacing: '.06em', margin: '8px 0', wordBreak: 'break-all' }}>
                  {segredo.segredo}
                </div>
                <a className="btn sec block" href={segredo.endereco}>Abrir no aplicativo autenticador</a>
              </li>
              <li>
                <label className="f" htmlFor="duas-codigo">Digite os seis números que o aplicativo mostra</label>
                <input id="duas-codigo" className="field" inputMode="numeric" autoComplete="one-time-code" required
                       value={codigo} onChange={(e) => setCodigo(e.target.value)} />
              </li>
            </ol>
            {erro && <div className="notice c-crit" role="alert">{erro}</div>}
            <div className="row rodape">
              <button type="button" className="btn sec grow" onClick={() => { setErro(''); setPasso('ver'); }}>Cancelar</button>
              <button className="btn grow" disabled={ocupado}>{ocupado ? 'Conferindo…' : 'Ligar'}</button>
            </div>
          </form>
        )}

        {passo === 'reservas' && (
          <>
            <div className="notice c-ok" role="status" style={{ margin: 0 }}>
              As duas etapas estão ligadas. Da próxima vez, a entrada vai pedir o código do aplicativo.
            </div>
            <p>
              <b>Os seus códigos de reserva.</b> Se o celular se perder, cada um entra uma vez no lugar do
              código do aplicativo. Anote num papel e guarde fora do celular: eles não aparecem de novo.
            </p>
            <ul className="lista mono" style={{ columns: 2, fontSize: 16 }} aria-label="Códigos de reserva">
              {reservas.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <p className="mutetxt">
              Sem o celular e sem os códigos, quem administra a sua conta desliga as duas etapas, com o
              motivo registrado.
            </p>
            <button className="btn block" onClick={() => { setReservas([]); setPasso('ver'); void carregar(); }}>
              Já anotei os códigos
            </button>
          </>
        )}

        {passo === 'desligar' && (
          <form onSubmit={(e) => { e.preventDefault(); void fazer(async () => {
            await api('/auth/segunda-etapa/desligar', { method: 'POST', body: JSON.stringify({ senha }) });
            setPasso('ver'); await carregar();
          }); }}>
            <p className="mutetxt">Depois de desligar, a entrada volta a pedir só a senha. Você pode ligar de novo quando quiser.</p>
            <label className="f" htmlFor="duas-senha-d">Senha</label>
            <input id="duas-senha-d" className="field" type="password" autoComplete="current-password" required
                   value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
            {erro && <div className="notice c-crit" role="alert">{erro}</div>}
            <div className="row rodape">
              <button type="button" className="btn sec grow" onClick={() => { setErro(''); setPasso('ver'); }}>Voltar</button>
              <button className="btn grow" disabled={ocupado}>{ocupado ? 'Desligando…' : 'Desligar'}</button>
            </div>
          </form>
        )}

        {!estado && !erro && <p className="mutetxt">Abrindo…</p>}
        {passo === 'ver' && erro && <div className="notice c-crit" role="alert">{erro}</div>}
      </div>
    </div>
  );
}
