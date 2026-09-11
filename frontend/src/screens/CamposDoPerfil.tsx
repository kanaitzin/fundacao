import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * O QUE O PLANTÃO VÊ NO PERFIL (fase 93, pedido do Marcelo em 09/09).
 *
 * A coordenação liga e desliga campos do perfil para o EDUCADOR, dentro da
 * própria casa. A lista é fechada no código e no banco: campo novo entra por
 * migração, revisado.
 *
 * A tela diz também o que o botão NÃO alcança. Uma tela de permissões que
 * mostra só o que dá para mexer faz a pessoa procurar o resto, e concluir que
 * está escondido em algum lugar.
 */
interface Campo {
  code: string; rotulo: string; oQueSome: string; visivel: boolean;
  decisao: { por: string; em: string; motivo: string | null } | null;
}

export function CamposDoPerfil({ houseId, casaLabel }: { houseId: string; casaLabel: string }) {
  const [campos, setCampos] = useState<Campo[]>([]);
  const [podeDecidir, setPodeDecidir] = useState(false);
  const [foraDoAlcance, setForaDoAlcance] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  /* A recusa de dentro da folha fica DENTRO dela: posta no topo da tela, ela
     aparece atrás do que a pessoa está lendo, e ninguém vê (fase 93). */
  const [erroDaFolha, setErroDaFolha] = useState('');
  const [aviso, setAviso] = useState('');
  const [desligando, setDesligando] = useState<Campo | null>(null);
  const [motivo, setMotivo] = useState('');

  const carregar = () => {
    setErro('');
    api<{ campos: Campo[]; podeDecidir: boolean; foraDoAlcance: string[] }>(
      `/people/profile-fields?houseId=${houseId}`)
      .then((r) => { setCampos(r.campos); setPodeDecidir(r.podeDecidir); setForaDoAlcance(r.foraDoAlcance); })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível ler o quadro.'));
  };
  useEffect(carregar, [houseId]);

  async function definir(campo: Campo, visivel: boolean, motivoDado?: string) {
    setErro(''); setErroDaFolha(''); setAviso('');
    try {
      const r = await api<{ aviso: string }>('/people/profile-fields', {
        method: 'POST',
        body: JSON.stringify({ houseId, campo: campo.code, visivel, motivo: motivoDado }),
      });
      setAviso(r.aviso); setDesligando(null); setMotivo(''); carregar();
    } catch (e) {
      const frase = e instanceof Error ? e.message : 'Não foi possível salvar.';
      if (desligando) setErroDaFolha(frase); else setErro(frase);
    }
  }

  return (
    <>
      <h2 className="ff">O que o plantão vê no perfil</h2>
      <p className="mutetxt">
        {casaLabel}. O educador em plantão vê estes campos do perfil das crianças desta casa.
        Desligar não apaga nada: a equipe técnica continua vendo, e quem estiver no plantão lê
        que o campo existe e por que foi desligado.
      </p>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}
      {aviso && <div className="notice c-ok" role="status">{aviso}</div>}

      <ul className="stack lista">
        {campos.map((c) => (
          <li key={c.code} className="card">
            <div className="row">
              <div className="grow">
                <b className="ff">{c.rotulo}</b>
                <div className="mutetxt">{c.oQueSome}</div>
              </div>
              <span className={`pill ${c.visivel ? 'c-ok' : 'c-warn'}`}>
                {c.visivel ? 'à vista' : 'desligado'}
              </span>
            </div>
            {!c.visivel && c.decisao && (
              <div className="mutetxt">
                {c.decisao.motivo} — {c.decisao.por}
              </div>
            )}
            {podeDecidir && (
              <button className="btn sm ghost"
                      onClick={() => (c.visivel ? setDesligando(c) : definir(c, true))}>
                {c.visivel ? 'Tirar da vista do plantão' : 'Pôr à vista do plantão'}
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="notice c-info">
        <b>O botão não alcança:</b> {foraDoAlcance.join(', ')}. Estes seguem o alcance do cargo,
        e não se ligam nem se desligam por casa.
      </div>

      {desligando && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-desl"
             onClick={(e) => { if (e.target === e.currentTarget) { setDesligando(null); setErroDaFolha(''); } }}>
          <div className="sheet modal">
            <h3 id="t-desl">Tirar “{desligando.rotulo}” da vista do plantão</h3>
            <p className="mutetxt">{desligando.oQueSome}</p>
            {erroDaFolha && <div className="notice c-crit" role="alert">{erroDaFolha}</div>}
            <label className="f" htmlFor="desl-motivo">Por quê?</label>
            <textarea id="desl-motivo" rows={3} value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Quem estiver com a criança vai ler este motivo quando procurar o dado." />
            <div className="acoes">
              <button className="btn ghost"
                      onClick={() => { setDesligando(null); setErroDaFolha(''); }}>Cancelar</button>
              <button className="btn" onClick={() => definir(desligando, false, motivo)}>
                Tirar da vista
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
