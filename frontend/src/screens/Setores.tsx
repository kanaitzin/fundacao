import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icone } from '../icones';

/**
 * O QUE CADA SETOR ENXERGA (§8.3).
 *
 * A pergunta que abriu esta tela é da coordenação e se repete toda semana: "o
 * educador vê isso?". Até aqui ela só se respondia entrando com a conta de
 * outra pessoa — e conta emprestada é justamente o que o §2 proíbe. Agora a
 * resposta está escrita, e vem do servidor, ao lado das regras que descreve.
 *
 * A tela diz três coisas de propósito:
 *
 *  * o que o cargo alcança, área por área, na língua de quem trabalha na casa;
 *  * a regra que o SERVIDOR aplica quando ela é mais estrita que o menu —
 *    porque esconder o botão é gentileza, e a proteção mora embaixo;
 *  * o que o cargo NÃO alcança, por extenso. Ausência é informação: uma lista
 *    que só mostra o que a pessoa vê deixa a outra metade para a imaginação.
 *
 * Não há dado de criança nenhuma aqui. É a descrição do sistema.
 */

interface Area { area: string; titulo: string; faz: string; servidor?: string }
interface Alcance {
  cargo: string; transversal: boolean; resumo: string;
  areas: Area[]; naoAlcanca: string[];
}

const ROTULO: Record<string, string> = {
  educador: 'Educador social', lider_diurno: 'Líder Diurno',
  equipe_tecnica: 'Equipe técnica', cozinha: 'Cozinha', enfermagem: 'Enfermagem',
  lider_noturno_geral: 'Líder Noturno Geral', coordenador: 'Coordenação',
  gestor_geral: 'Gestor Geral',
};

export function Setores({ papel }: { papel: string }) {
  const [cargos, setCargos] = useState<Alcance[]>([]);
  const [escolhido, setEscolhido] = useState<string>('educador');
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ cargos: Alcance[] }>('/staff/alcance');
        setCargos(r.cargos);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar os setores.');
      }
    })();
  }, []);

  const a = cargos.find((c) => c.cargo === escolhido) ?? null;

  return (
    <>
      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      <div className="card raise stack">
        <h3 style={{ fontSize: 17, margin: 0 }}>O que cada setor enxerga</h3>
        <p className="mutetxt" style={{ margin: 0 }}>
          Para responder “o educador vê isso?” sem entrar com a conta de ninguém.
          Conta é individual — emprestar uma para conferir uma tela é o começo de um
          registro sem autoria.
        </p>
        <div className="notice c-info">
          Esta página descreve o alcance. Quem <b>recusa</b> é o banco: o servidor confere
          de novo, por baixo, mesmo quando a tela ofereceu o botão.
        </div>
      </div>

      <div className="eyebrow">Escolha o setor</div>
      <div className="opts">
        {cargos.map((c) => (
          <button type="button" key={c.cargo}
                  className={`opt ${c.cargo === papel ? 'c-brand' : 'c-mute'}`}
                  aria-pressed={escolhido === c.cargo}
                  onClick={() => setEscolhido(c.cargo)}>
            {ROTULO[c.cargo] ?? c.cargo}{c.cargo === papel ? ' (você)' : ''}
          </button>
        ))}
      </div>

      {a && (
        <>
          <div className="card raise stack" style={{ marginTop: 12 }}>
            <div className="row">
              <b className="ff grow" style={{ fontSize: 16 }}>{ROTULO[a.cargo] ?? a.cargo}</b>
              <span className={`pill ${a.transversal ? 'c-move' : 'c-mute'}`}>
                {a.transversal ? 'Alcança mais de uma casa' : 'Uma casa'}
              </span>
            </div>
            <p style={{ margin: 0 }}>{a.resumo}</p>
            {a.transversal && (
              <div className="mutetxt">
                Alcançar outra casa é <b>exceção funcional</b>, prevista para a função — não
                é acesso amplo, e continua registrado.
              </div>
            )}
          </div>

          <div className="eyebrow">O que alcança</div>
          <div className="stack">
            {a.areas.map((ar) => (
              <div className="card stack" key={ar.area + ar.titulo}>
                <b className="ff">{ar.titulo}</b>
                <div>{ar.faz}</div>
                {ar.servidor && (
                  <div className="notice c-med" style={{ margin: 0 }}>
                    <Icone nome="cadeado" /> <b>O servidor recusa por baixo:</b> {ar.servidor}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="eyebrow">O que NÃO alcança</div>
          <div className="card">
            <ul className="lista">
              {a.naoAlcanca.map((n) => (
                <li key={n} className="mutetxt">{n}</li>
              ))}
            </ul>
          </div>

          <p className="mutetxt" style={{ marginTop: 12 }}>
            Se alguma linha aqui não bater com o que a pessoa vê na prática, é defeito —
            de um lado ou do outro. Anote e avise: a página e o menu são conferidos juntos
            por teste, e discordância entre eles não é detalhe de tela.
          </p>
        </>
      )}
    </>
  );
}
