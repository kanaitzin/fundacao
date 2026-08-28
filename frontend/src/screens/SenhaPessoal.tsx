import { useState } from 'react';
import { api } from '../api';

/**
 * PRIMEIRO ACESSO — sugestão de senha pessoal.
 *
 * Sugere, não obriga: a pessoa pode seguir com a senha inicial e trocar depois
 * pelo botão 🔑 da barra. Foi a escolha da Fundação, e ela tem uma razão
 * operacional boa — travar a entrada de um educador às 6h da manhã, no meio do
 * plantão, cria mais risco do que resolve.
 *
 * O que o sistema NÃO abre mão: enquanto a senha inicial estiver em uso, isso
 * fica visível para a coordenação na lista de equipe (coluna "senha inicial
 * pendente"). Sugerir sem esquecer.
 */
export function SenhaPessoal({ email, primeiroAcesso, semSenhaAinda, onPronto, onAdiar }: {
  email: string; primeiroAcesso: boolean; semSenhaAinda?: boolean;
  onPronto: () => void; onAdiar: () => void;
}) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repete, setRepete] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (nova.length < 6) return setErro('A senha precisa de pelo menos 6 caracteres.');
    if (nova !== repete) return setErro('As duas senhas não são iguais.');
    setOcupado(true);
    try {
      // A senha atual é exigida sempre: sem isso, uma sessão esquecida aberta
      // num aparelho vira uma troca de dono da conta.
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ senhaAtual: semSenhaAinda ? null : atual, novaSenha: nova }),
      });
      onPronto();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível trocar a senha.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-senha">
      <div className="sheet modal">
        <h3 id="t-senha">
          🔑 {semSenhaAinda ? 'Crie a sua senha'
             : primeiroAcesso ? 'Que tal criar uma senha pessoal?' : 'Trocar minha senha'}
        </h3>
        <p className="mutetxt">
          {semSenhaAinda
            ? 'Esta conta ainda não tem senha. A que você escrever agora é só sua: nem a coordenação, nem a Fundação, nem quem fez o sistema consegue vê-la. O que você registrar daqui em diante vai com o seu nome.'
            : primeiroAcesso
              ? 'Você está usando a senha inicial entregue pela coordenação. Uma senha só sua protege o que você registra — e o que você registra tem o seu nome. Se preferir, pode continuar com a atual e trocar quando quiser pelo botão 🔑 na barra.'
              : 'Trocar a senha encerra as outras sessões abertas em seu nome. A sua, aqui, continua.'}
        </p>
        <p className="mutetxt"><b className="ff">{email}</b></p>

        <form onSubmit={salvar}>
          {/* Sem senha nenhuma, não existe "senha atual" para pedir — e adiar
              deixaria a conta aberta só com o e-mail, que é justamente o que
              este passo fecha. */}
          {!semSenhaAinda && (
            <>
              <label className="f" htmlFor="atual">
                {primeiroAcesso ? 'Senha atual (a que a coordenação entregou)' : 'Senha atual'}
              </label>
              <input id="atual" type="password" autoComplete="current-password"
                     value={atual} onChange={(e) => setAtual(e.target.value)} autoFocus />
            </>
          )}

          <label className="f" htmlFor="nova">{semSenhaAinda ? 'Sua senha' : 'Nova senha'}</label>
          <input id="nova" type="password" autoComplete="new-password"
                 autoFocus={semSenhaAinda}
                 value={nova} onChange={(e) => setNova(e.target.value)}
                 placeholder="Mínimo 6 caracteres" />

          <label className="f" htmlFor="repete">Repita a senha</label>
          <input id="repete" type="password" autoComplete="new-password"
                 value={repete} onChange={(e) => setRepete(e.target.value)}
                 placeholder="Repita a senha" />

          {erro && <div className="notice c-crit" role="alert">{erro}</div>}

          <div className="row" style={{ gap: 8, marginTop: 16 }}>
            {!semSenhaAinda && (
              <button type="button" className="btn sec grow" onClick={onAdiar}>
                {primeiroAcesso ? 'Continuar com a senha atual' : 'Cancelar'}
              </button>
            )}
            <button type="submit" className="btn grow" disabled={ocupado}>
              {ocupado ? 'Salvando…' : semSenhaAinda ? 'Criar minha senha' : 'Salvar nova senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
