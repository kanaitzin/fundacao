import { useEffect, useState } from 'react';
import { api } from '../api';
import { Explica } from '../explica';
import { OQueFalta } from '../o-que-falta';
import { dia, diaEHora } from '../rotulos';
import { EtiquetaDoCargo } from '../cargos';
import { pedirAPessoa, pessoaPedida } from '../pessoa-a-abrir';
import { FuncionarioDoMes } from '../funcionario-do-mes';

/**
 * OS ENCONTROS DE ALINHAMENTO (fase 322, pedido e decisões do dono em 14/11).
 *
 * Mensal, trimestral, semestral ou anual: a coordenação da casa senta com quem trabalha
 * na casa, e a Coordenação Geral com todos abaixo dela, e o encontro fica escrito com os
 * pontos positivos, o que podemos melhorar e os combinados. A pessoa lê o registro aqui,
 * dá ciência e pode comentar. Sem nota e sem pontuação: o encontro é texto, com a
 * intenção de alinhar a casa.
 *
 * Quem registra e quem lê é o banco que decide (alignments/1721); esta tela mostra o que
 * a rota devolve.
 */

interface Encontro {
  id: string; pessoaId: string; pessoa: string; casa: string | null;
  periodicidade: string; periodicidadeRotulo: string; dia: string;
  positivos: string; melhorar: string | null; combinados: string | null;
  proximo: string | null; por: string; porId: string; em: string;
  ciencia: { em: string; comentario: string | null } | null;
  adendos: { id: string; texto: string; por: string; em: string }[];
}
interface Pessoa {
  id: string; nome: string; cargo: string; profissao?: string | null; casa: string | null;
  ultimo: string | null; proximo: string | null;
}
interface Periodicidade { code: string; label: string }

export function Encontros({ meuId, ve, irPara, casaId = null }: {
  meuId: string; ve: (aba: string) => boolean; irPara: (aba: string) => void; casaId?: string | null;
}) {
  const [meus, setMeus] = useState<Encontro[]>([]);
  const [equipe, setEquipe] = useState<Pessoa[]>([]);
  const [podeRegistrar, setPodeRegistrar] = useState(false);
  const [periodicidades, setPeriodicidades] = useState<Periodicidade[]>([]);
  const [carregou, setCarregou] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [recado, setRecado] = useState('');

  const carregar = async () => {
    try {
      const [c, e, v] = await Promise.all([
        api<{ encontros: Encontro[] }>('/alignments/encontros/comigo'),
        api<{ pessoas: Pessoa[]; podeRegistrar: boolean }>('/alignments/encontros/equipe'),
        api<{ periodicidades: Periodicidade[] }>('/alignments/encontros/vocabulario'),
      ]);
      setMeus(c.encontros); setEquipe(e.pessoas); setPodeRegistrar(e.podeRegistrar);
      setPeriodicidades(v.periodicidades);
    } catch (x) {
      setErro(x instanceof Error ? x.message : 'Não foi possível abrir os encontros.');
    } finally { setCarregou(true); }
  };

  useEffect(() => {
    void carregar();
    const pedida = pessoaPedida('encontros');
    if (pedida) setAberta(pedida);
  }, []);

  if (aberta) {
    return (
      <DaPessoa pessoaId={aberta} meuId={meuId} periodicidades={periodicidades}
                veTrabalho={ve('trabalho')}
                onVoltar={() => { setAberta(null); void carregar(); }}
                onTrabalho={() => { pedirAPessoa('trabalho', aberta); irPara('trabalho'); }} />
    );
  }

  const semCiencia = meus.filter((m) => !m.ciencia);
  return (
    <div>
      <div className="card">
        <h2>Encontros de alinhamento</h2>
        <Explica resumo={<>O registro de cada encontro com a coordenação, com os pontos positivos, o que podemos melhorar e os combinados.</>}>
          O registro de cada encontro com a coordenação, com os pontos positivos, o que podemos
          melhorar e os combinados. Mensal, trimestral, semestral ou anual. Você lê o seu, dá
          ciência e pode escrever um comentário. Leem também quem registrou, a coordenação da
          casa e a Coordenação Geral. Não há nota nem pontuação.
        </Explica>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {recado && <div className="notice c-ok recado-da-vez" role="status">{recado}</div>}
      </div>

      {/* O funcionário do mês (fase 324): o da casa aberta e o da Fundação, com o porquê. */}
      <FuncionarioDoMes key={`${meuId}|${casaId ?? ''}`} casaId={casaId} />

      {podeRegistrar && (
        <div className="card">
          <h3>A equipe</h3>
          <p className="mutetxt">Com quem você faz o encontro, em ordem de nome.</p>
          {!carregou ? <p className="mutetxt">Abrindo…</p> : equipe.length === 0 ? (
            <p className="mutetxt">Ninguém da equipe no seu alcance agora.</p>
          ) : (
            <ul className="lista-encontros-equipe">
              {equipe.map((p) => (
                <li key={p.id} className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <div className="grow">
                    <b>{p.nome}</b> <EtiquetaDoCargo cargo={p.cargo} profissao={p.profissao} />
                    <div className="mutetxt">
                      {p.casa ? `${p.casa} · ` : ''}{p.ultimo ? `último encontro em ${dia(p.ultimo)}` : 'nenhum encontro registrado'}
                      {p.proximo ? ` · próximo em ${dia(p.proximo)}` : ''}
                    </div>
                  </div>
                  <button data-acolhe-entra="" className="btn sm sec" aria-label={`Abrir os encontros de ${p.nome}`}
                          onClick={() => setAberta(p.id)}>
                    Abrir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card">
        <h3>Os meus encontros</h3>
        {!carregou ? <p className="mutetxt">Abrindo…</p> : meus.length === 0 ? (
          <p className="mutetxt">Nenhum encontro de alinhamento registrado com você ainda.</p>
        ) : (
          <>
            {semCiencia.length > 0 && (
              <div className="notice c-warn">
                {semCiencia.length === 1 ? 'Um encontro espera a sua ciência.' : `${semCiencia.length} encontros esperam a sua ciência.`}
              </div>
            )}
            <ul className="lista-encontros">
              {meus.map((e) => (
                <CartaoDoEncontro key={e.id} e={e} meuId={meuId}
                                  onCiencia={async (comentario) => {
                                    const r = await api<{ aviso: string }>(`/alignments/encontros/${e.id}/ciencia`, {
                                      method: 'POST', body: JSON.stringify({ comentario }) });
                                    setRecado(r.aviso); await carregar();
                                  }} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function DaPessoa({ pessoaId, meuId, periodicidades, veTrabalho, onVoltar, onTrabalho }: {
  pessoaId: string; meuId: string; periodicidades: Periodicidade[]; veTrabalho: boolean;
  onVoltar: () => void; onTrabalho: () => void;
}) {
  const [r, setR] = useState<{ pessoa: string | null; podeRegistrar: boolean; encontros: Encontro[] } | null>(null);
  const [erro, setErro] = useState('');
  const [recado, setRecado] = useState('');
  const [folha, setFolha] = useState(false);
  const [adendo, setAdendo] = useState<Encontro | null>(null);

  const carregar = async () => {
    try { setR(await api(`/alignments/encontros/pessoa/${pessoaId}`)); }
    catch (x) { setErro(x instanceof Error ? x.message : 'Não foi possível abrir os encontros desta pessoa.'); }
  };
  useEffect(() => { void carregar(); }, [pessoaId]);

  return (
    <div>
      <div className="card">
        <button className="btn sm ghost" onClick={onVoltar}>← Voltar aos encontros</button>
        <h2 style={{ marginTop: 8 }}>{r?.pessoa ?? 'Encontros de alinhamento'}</h2>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        {recado && <div className="notice c-ok recado-da-vez" role="status">{recado}</div>}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {r?.podeRegistrar && (
            <button data-acolhe-abre="" className="btn sm" onClick={() => setFolha(true)}>
              Registrar um encontro
            </button>
          )}
          {veTrabalho && (
            <button className="btn sm sec" onClick={onTrabalho}>Ver o trabalho desta pessoa</button>
          )}
        </div>
      </div>
      <div className="card">
        <h3>Os encontros</h3>
        {!r ? <p className="mutetxt">Abrindo…</p> : r.encontros.length === 0 ? (
          <p className="mutetxt">Nenhum encontro registrado ainda.</p>
        ) : (
          <ul className="lista-encontros">
            {r.encontros.map((e) => (
              <CartaoDoEncontro key={e.id} e={e} meuId={meuId}
                                onAdendo={e.porId === meuId ? () => setAdendo(e) : undefined} />
            ))}
          </ul>
        )}
      </div>
      {folha && (
        <FolhaDoEncontro nome={r?.pessoa ?? ''} periodicidades={periodicidades}
                         onFechar={() => setFolha(false)}
                         onRegistrar={async (corpo) => {
                           const x = await api<{ aviso: string }>('/alignments/encontros', {
                             method: 'POST', body: JSON.stringify({ ...corpo, pessoaId }) });
                           setFolha(false); setRecado(x.aviso); await carregar();
                         }} />
      )}
      {adendo && (
        <FolhaDoAdendo encontro={adendo} onFechar={() => setAdendo(null)}
                       onEscrever={async (texto) => {
                         const x = await api<{ aviso: string }>(`/alignments/encontros/${adendo.id}/adendo`, {
                           method: 'POST', body: JSON.stringify({ texto }) });
                         setAdendo(null); setRecado(x.aviso); await carregar();
                       }} />
      )}
    </div>
  );
}

function CartaoDoEncontro({ e, meuId, onCiencia, onAdendo }: {
  e: Encontro; meuId: string;
  onCiencia?: (comentario: string) => Promise<void>;
  onAdendo?: () => void;
}) {
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const minha = e.pessoaId === meuId;
  return (
    <li className="card encontro">
      <div className="row" style={{ alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span className="pill c-mute">{e.periodicidadeRotulo}</span>
        <b>{dia(e.dia)}</b>
        <span className="mutetxt">registrado por {e.por}{e.casa ? ` · ${e.casa}` : ''}</span>
      </div>
      <dl className="encontro-partes">
        <dt>Pontos positivos</dt><dd>{e.positivos}</dd>
        {e.melhorar && (<><dt>O que podemos melhorar</dt><dd>{e.melhorar}</dd></>)}
        {e.combinados && (<><dt>Combinados</dt><dd>{e.combinados}</dd></>)}
        {e.proximo && (<><dt>Próximo encontro</dt><dd>{dia(e.proximo)}</dd></>)}
      </dl>
      {e.adendos.map((a) => (
        <div key={a.id} className="notice c-info">
          <b>Adendo</b> de {a.por}, em {diaEHora(a.em)}: {a.texto}
        </div>
      ))}
      {e.ciencia ? (
        <p className="mutetxt">
          Ciência dada em {diaEHora(e.ciencia.em)}.
          {e.ciencia.comentario && <> Comentário: <i>{e.ciencia.comentario}</i></>}
        </p>
      ) : minha && onCiencia ? (
        <div>
          {erro && <div className="notice c-crit" role="alert">{erro}</div>}
          <label className="f" htmlFor={`com-${e.id}`}>O seu comentário (se quiser)</label>
          <textarea id={`com-${e.id}`} value={comentario} maxLength={4000}
                    onChange={(x) => setComentario(x.target.value)}
                    placeholder="O que você leva deste encontro, ou o que vê diferente." />
          <button className="btn sm" disabled={salvando} onClick={async () => {
            setSalvando(true); setErro('');
            try { await onCiencia(comentario.trim()); }
            catch (x) { setErro(x instanceof Error ? x.message : 'Não foi possível registrar a ciência.'); }
            finally { setSalvando(false); }
          }}>{comentario.trim() ? 'Dar ciência e comentar' : 'Dar ciência'}</button>
        </div>
      ) : (
        <p className="mutetxt">Ainda sem a ciência da pessoa.</p>
      )}
      {onAdendo && (
        <button className="btn sm ghost" onClick={onAdendo}>Escrever um adendo</button>
      )}
    </li>
  );
}

function FolhaDoEncontro({ nome, periodicidades, onFechar, onRegistrar }: {
  nome: string; periodicidades: Periodicidade[];
  onFechar: () => void;
  onRegistrar: (corpo: Record<string, string | null>) => Promise<void>;
}) {
  const [periodicidade, setPeriodicidade] = useState('');
  const [quando, setQuando] = useState('');
  const [positivos, setPositivos] = useState('');
  const [melhorar, setMelhorar] = useState('');
  const [combinados, setCombinados] = useState('');
  const [proximo, setProximo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const pode = periodicidade !== '' && positivos.trim().length >= 10 && !salvando;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-encontro"
         onClick={(x) => { if (x.target === x.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-encontro">Encontro de alinhamento · {nome}</h3>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <p className="mutetxt">
          A pessoa lê este registro, dá ciência e pode comentar. Escreva com a intenção de alinhar a casa.
        </p>
        <label className="f">É o encontro</label>
        <div className="opts">
          {periodicidades.map((p) => (
            <button key={p.code} type="button" className="opt c-info" aria-pressed={periodicidade === p.code}
                    onClick={() => setPeriodicidade(p.code)}>{p.label}</button>
          ))}
        </div>
        <label className="f" htmlFor="enc-dia">Dia do encontro</label>
        <input id="enc-dia" type="date" value={quando} onChange={(x) => setQuando(x.target.value)} />
        <p className="mutetxt" style={{ marginTop: 4 }}>Em branco, fica hoje.</p>
        <label className="f" htmlFor="enc-positivos">Pontos positivos</label>
        <textarea id="enc-positivos" value={positivos} maxLength={4000}
                  onChange={(x) => setPositivos(x.target.value)}
                  placeholder="O que a pessoa tem feito bem, com exemplos do dia a dia da casa." />
        <label className="f" htmlFor="enc-melhorar">O que podemos melhorar (se tiver)</label>
        <textarea id="enc-melhorar" value={melhorar} maxLength={4000}
                  onChange={(x) => setMelhorar(x.target.value)}
                  placeholder="O que combinar para o próximo período, dito como caminho." />
        <label className="f" htmlFor="enc-combinados">Combinados</label>
        <textarea id="enc-combinados" value={combinados} maxLength={4000}
                  onChange={(x) => setCombinados(x.target.value)}
                  placeholder="O que cada um leva deste encontro." />
        <label className="f" htmlFor="enc-proximo">Próximo encontro (se já combinado)</label>
        <input id="enc-proximo" type="date" value={proximo} onChange={(x) => setProximo(x.target.value)} />
        <p className="mutetxt" style={{ marginTop: 4 }}>No dia, você recebe o aviso no sino.</p>
        <OQueFalta itens={[
          !periodicidade && 'escolher se o encontro é mensal, trimestral, semestral ou anual',
          positivos.trim().length < 10 && 'escrever os pontos positivos, com pelo menos 10 letras',
        ]} />
        <div className="row rodape">
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!pode} onClick={async () => {
            setSalvando(true); setErro('');
            try {
              await onRegistrar({
                periodicidade, dia: quando || null, positivos: positivos.trim(),
                melhorar: melhorar.trim() || null, combinados: combinados.trim() || null,
                proximo: proximo || null,
              });
            } catch (x) { setErro(x instanceof Error ? x.message : 'Não foi possível registrar o encontro.'); }
            finally { setSalvando(false); }
          }}>{salvando ? 'Registrando…' : 'Registrar o encontro'}</button>
        </div>
      </div>
    </div>
  );
}

function FolhaDoAdendo({ encontro, onFechar, onEscrever }: {
  encontro: Encontro; onFechar: () => void; onEscrever: (texto: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const pode = texto.trim().length >= 10 && !salvando;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-adendo-enc"
         onClick={(x) => { if (x.target === x.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-adendo-enc">Adendo ao encontro de {dia(encontro.dia)}</h3>
        {erro && <div className="notice c-crit" role="alert">{erro}</div>}
        <p className="mutetxt">O que estava escrito continua como estava, e a pessoa é avisada do adendo.</p>
        <label className="f" htmlFor="adendo-enc">O adendo</label>
        <textarea id="adendo-enc" value={texto} maxLength={4000} onChange={(x) => setTexto(x.target.value)}
                  placeholder="O que precisa ser acrescentado ou corrigido, e por quê." />
        <OQueFalta itens={[texto.trim().length < 10 && 'escrever o adendo, com pelo menos 10 letras']} />
        <div className="row rodape">
          <button type="button" className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn grow" disabled={!pode} onClick={async () => {
            setSalvando(true); setErro('');
            try { await onEscrever(texto.trim()); }
            catch (x) { setErro(x instanceof Error ? x.message : 'Não foi possível registrar o adendo.'); }
            finally { setSalvando(false); }
          }}>{salvando ? 'Registrando…' : 'Registrar o adendo'}</button>
        </div>
      </div>
    </div>
  );
}
