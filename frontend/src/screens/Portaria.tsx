import { useEffect, useState } from 'react';
import { api } from '../api';
import { FolhaDocumento, ArquivoGerado } from '../documentos';
import type { DocumentoWord } from '../docx';

/**
 * PORTARIA — quem pode visitar (fase 92, pedido do Marcelo em 09/09).
 *
 * A portaria não entra no sistema, como a cozinha: recebe a folha em papel e
 * confere quem chega. Esta tela é de quem a GERA — a equipe técnica e a
 * coordenação, que são quem responde por quem está autorizado nela.
 *
 * A autorização não se dá aqui: dá-se no CONTATO, no perfil da criança, porque
 * é lá que se sabe quem a pessoa é. Aqui se vê o resultado — quantas crianças
 * estão sem ninguém autorizado, quem está sem foto — e se gera a folha.
 *
 * A pré-visualização não carrega fotos; o arquivo em Word leva.
 */
export function Portaria({ houseId, casaLabel }: { houseId: string; casaLabel: string }) {
  const [folha, setFolha] = useState<DocumentoWord | null>(null);
  const [aberta, setAberta] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setErro('');
    api<DocumentoWord>(`/people/portaria/folha?houseId=${houseId}`)
      .then(setFolha)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível montar a folha.'));
  }, [houseId]);

  const exportar = (finalidade: string): Promise<ArquivoGerado> =>
    api<ArquivoGerado>('/people/portaria/export', {
      method: 'POST', body: JSON.stringify({ houseId, finalidade }),
    });

  const linhas = folha?.secoes[0]?.tabela?.linhas ?? [];
  /* Agrupa de volta por criança: a folha repete a criança só na primeira linha. */
  const grupos: { crianca: string; visitantes: string[][] }[] = [];
  for (const l of linhas) {
    if (l[1]) grupos.push({ crianca: l[1], visitantes: [] });
    if (grupos.length && l[3] !== 'Nenhum visitante autorizado') grupos[grupos.length - 1].visitantes.push(l);
  }
  const semNinguem = grupos.filter((g) => !g.visitantes.length);

  return (
    <>
      <h2 className="ff">Portaria — quem pode visitar</h2>
      <p className="mutetxt">
        {casaLabel}. A portaria recebe esta folha em papel e confere quem chega. Só entra nela
        quem a equipe técnica ou a coordenação marcou como <b>autorizado a visitar</b>, no
        contato da criança — estar no cadastro não basta.
      </p>

      {erro && <div className="notice c-crit" role="alert">{erro}</div>}

      {folha && (
        <>
          <div className="stack">
            {folha.identificacao.map((i) => (
              <div key={i.rotulo} className="row">
                <span className="grow">{i.rotulo}</span><b>{i.valor}</b>
              </div>
            ))}
          </div>

          {semNinguem.length > 0 && (
            <div className="notice c-warn">
              <b>Sem ninguém autorizado a visitar:</b>{' '}
              {semNinguem.map((g) => g.crianca).join(', ')}. Na folha elas aparecem dizendo isso —
              quem chegar por elas, a portaria liga para a casa.
            </div>
          )}

          <div className="eyebrow">Por criança</div>
          <ul className="stack lista">
            {grupos.map((g) => (
              <li key={g.crianca} className="card">
                <b className="ff">{g.crianca}</b>
                {g.visitantes.length
                  ? g.visitantes.map((v) => (
                    <div key={v[3]} className="row">
                      <span className="grow">{v[3]} <span className="mutetxt">({v[4]})</span></span>
                      {/^sem foto/.test(v[2]) && <span className="pill c-warn">sem foto</span>}
                      {/^não cadastrado/.test(v[5]) && <span className="pill c-warn">sem CPF</span>}
                    </div>
                  ))
                  : <div className="mutetxt">Nenhum visitante autorizado.</div>}
              </li>
            ))}
          </ul>

          <button className="btn block" onClick={() => setAberta(true)}>
            Ver a folha da portaria e gerar em Word
          </button>
          {aberta && (
            <FolhaDocumento doc={folha} onFechar={() => setAberta(false)} exportar={exportar} />
          )}
        </>
      )}
    </>
  );
}
