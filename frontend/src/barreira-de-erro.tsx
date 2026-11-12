import React from 'react';

/**
 * A BARREIRA DE ERRO (fase 315).
 *
 * Sem ela, um erro ao desenhar UMA tela desmontava o aplicativo inteiro: a
 * página ficava em branco, sem menu, sem Sair e sem dizer nada, e quem estava
 * no plantão só saía dali recarregando. O React faz isso por regra: erro de
 * desenho que ninguém segura derruba a árvore toda.
 *
 * Aqui o erro para na tela em que nasceu. O menu, o topo e a Acolhe+AI
 * continuam de pé, a pessoa lê o que aconteceu em uma frase e escolhe entre
 * tentar de novo e ir para outra tela.
 *
 * O QUE ELA NÃO FAZ, de propósito:
 * - não manda o erro a lugar nenhum e não o escreve na tela: mensagem de erro
 *   pode carregar nome de criança ou texto de registro, e log não copia
 *   conteúdo sensível (regra do §5). Vai só ao console do navegador, que é de
 *   quem está com o aparelho na mão;
 * - não segura erro de rede nem recusa do servidor: esses já chegam à pessoa
 *   pela tela que os pediu. Isto é só para a tela que não conseguiu se desenhar.
 */
interface Props {
  /** Onde a barreira está: a tela (o menu fica de pé) ou o sistema inteiro. */
  alcance: 'tela' | 'sistema';
  /** Leva a pessoa a uma tela que abre sempre. Só faz sentido no alcance de tela. */
  aoIrParaOInicio?: () => void;
  children: React.ReactNode;
}

interface Estado { quebrou: boolean }

export class BarreiraDeErro extends React.Component<Props, Estado> {
  state: Estado = { quebrou: false };

  static getDerivedStateFromError(): Estado {
    return { quebrou: true };
  }

  componentDidCatch(erro: unknown) {
    // Só o console: nada de conteúdo vai para fora do aparelho.
    console.error('[rede-acolher] uma tela não conseguiu se desenhar', erro);
  }

  render() {
    if (!this.state.quebrou) return this.props.children;
    const daTela = this.props.alcance === 'tela';
    return (
      <div className="card stack barreira-de-erro" role="alert">
        <h2>{daTela ? 'Esta tela não abriu' : 'O Rede Acolher não abriu'}</h2>
        <p>
          {daTela
            ? 'Aconteceu um erro ao mostrar esta tela. O que já estava registrado continua guardado, e as outras telas seguem funcionando.'
            : 'Aconteceu um erro ao abrir. O que já estava registrado continua guardado.'}
        </p>
        <p className="mutetxt">
          Se você estava escrevendo algo que ainda não tinha sido registrado, confira depois se ficou gravado.
          Se o erro voltar, avise a coordenação dizendo em que tela foi.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {daTela && (
            <button className="btn" onClick={() => this.setState({ quebrou: false })}>
              Tentar de novo
            </button>
          )}
          {daTela && this.props.aoIrParaOInicio && (
            <button className="btn sec" onClick={() => { this.setState({ quebrou: false }); this.props.aoIrParaOInicio?.(); }}>
              Ir para o começo
            </button>
          )}
          <button className={daTela ? 'btn ghost' : 'btn'} onClick={() => window.location.reload()}>
            Recarregar a página
          </button>
        </div>
      </div>
    );
  }
}
