import { AvisoNoCelular } from '../aviso-no-celular';
import { CameraNesteAparelho } from '../camera';
import { useState } from 'react';
import { api } from '../api';
import { Icone } from '../icones';
import { FRASE_DA_SENHA, oQueFaltaNaSenha, senhaAceita, fraseDoQueFalta } from '../../../backend/src/kernel/common/senha.regra';

/**
 * A SENHA PESSOAL.
 *
 * No primeiro acesso com a senha inicial, a troca é OBRIGATÓRIA (fase 291; decisão do
 * dono do projeto em 08/11, que troca a de antes, quando só se sugeria): quem cadastrou
 * a conta conhece a senha inicial, e até a troca entra no lugar da pessoa. O servidor
 * recusa o resto até a troca; aqui, a folha aparece sozinha, sem o botão de adiar, e o
 * que se pode fazer é criar a senha ou sair. A regra da senha é a do `senha.regra.ts`,
 * a mesma do servidor.
 */
export function SenhaPessoal({ email, primeiroAcesso, semSenhaAinda, onPronto, onAdiar, casa }: {
  /** O primeiro acesso, com a senha inicial: a troca não se adia (fase 291). */
  email: string; primeiroAcesso: boolean; semSenhaAinda?: boolean;
  /** A casa, para o exemplo do aviso no computador (fase 191). */
  casa?: string | null;
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
    if (!senhaAceita(nova)) return setErro(FRASE_DA_SENHA);
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
          <Icone nome="chave" /> {semSenhaAinda ? 'Crie a sua senha'
             : primeiroAcesso ? 'Crie a sua senha para começar' : 'Trocar minha senha'}
        </h3>
        <p className="mutetxt">
          {semSenhaAinda
            ? 'Esta conta ainda não tem senha. A que você escrever agora é só sua: nem a coordenação, nem a Fundação, nem quem fez o sistema consegue vê-la. O que você registrar daqui em diante vai com o seu nome.'
            : primeiroAcesso
              ? 'A senha que você recebeu serve só para esta primeira entrada. Crie agora a sua: ela é só sua, e o que você registrar daqui em diante vai com o seu nome.'
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
                 placeholder="8 ou mais, com maiúscula e símbolo" />
          {nova && oQueFaltaNaSenha(nova).length > 0 && (
            <p className="mutetxt" aria-live="polite">{fraseDoQueFalta(nova)}</p>
          )}

          <label className="f" htmlFor="repete">Repita a senha</label>
          <input id="repete" type="password" autoComplete="new-password"
                 value={repete} onChange={(e) => setRepete(e.target.value)}
                 placeholder="Repita a senha" />

          {erro && <div className="notice c-crit" role="alert">{erro}</div>}

          <div className="row" style={{ gap: 8, marginTop: 16 }}>
            {!semSenhaAinda && (
              <button type="button" className="btn sec grow" onClick={onAdiar}>
                {primeiroAcesso ? 'Sair' : 'Cancelar'}
              </button>
            )}
            <button type="submit" className="btn grow" disabled={ocupado}>
              {ocupado ? 'Salvando…' : semSenhaAinda ? 'Criar minha senha' : 'Salvar nova senha'}
            </button>
          </div>
        </form>

        {/* O AVISO NESTE COMPUTADOR (decisão de 08/10, fase 191). No monitor não
            há a folha Minha conta: o aviso mora aqui, junto do que é da conta.
            No celular ele já está na Minha conta, e esta parte se esconde. */}
        {!primeiroAcesso && (
          <div className="so-monitor">
            <AvisoNoCelular casa={casa ?? null} onde="computador" />
            <CameraNesteAparelho onde="computador" />
          </div>
        )}
      </div>
    </div>
  );
}
