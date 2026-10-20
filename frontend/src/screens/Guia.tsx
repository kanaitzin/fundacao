/**
 * O GUIA DO SISTEMA (fase 231): o primeiro item do menu.
 *
 * Cada tela que o cargo alcança, com o link que abre a tela, o que ela é, o
 * que o cargo faz nela e o que a Acolhe+AI faz junto; as abas do perfil da
 * criança; a Acolhe+AI e a Minha conta; e as novidades de cada atualização.
 * O texto vem de `guia-do-sistema.ts`, que explica de onde sai cada parte.
 *
 * Só mostra o que o cargo alcança: um guia que ensina a tela que a pessoa não
 * abre só confunde quem está no turno.
 */
import { useMemo, useState } from 'react';
import { ALCANCE_POR_CARGO } from '../../../backend/src/modules/identity/alcance';
import { QUEM_LE_ATENDIMENTO } from '../../../backend/src/modules/people/atendimento-tecnico.regra';
import { GRUPOS, PORTAS } from '../portas';
import { Icone } from '../icones';
import { ROTULO_CARGO } from '../rotulos';
import {
  ABAS_DO_PERFIL_NO_GUIA, ALTO_DO_PERFIL, A_ACOLHE_EM_TODA_TELA, COM_A_ACOLHE, CURTA_DO_TURNO,
  MINHA_CONTA_NO_GUIA, NOVIDADES, telasDescritas,
} from '../guia-do-sistema';

interface TelaDoTurno { aba: string; icone: string; label: string }

/** Sem acento e em minúsculas, para a busca achar "saude" em "Saúde". */
const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Guia({ papel, todasAsCasas, doTurno, ve, irPara }: {
  papel: string;
  todasAsCasas: boolean;
  /** As abas do turno que o cargo tem (Painel, Dia, Chamada, Acolhidos, Passagem). */
  doTurno: TelaDoTurno[];
  ve: (aba: string) => boolean;
  irPara: (aba: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const descritas = useMemo(() => telasDescritas(), []);
  const alcance = ALCANCE_POR_CARGO.find((a) => a.cargo === papel);
  const doCargo = (aba: string) => alcance?.areas.find((x) => x.area === aba);

  const grupos = [
    { cod: 'turno', titulo: 'O turno',
      telas: doTurno.map((t) => ({ aba: t.aba, icone: t.icone, titulo: t.label, curta: CURTA_DO_TURNO[t.aba] ?? '' })) },
    ...GRUPOS.filter((g) => g.cod !== 'comeco').map((g) => ({
      cod: g.cod, titulo: g.titulo,
      telas: PORTAS.filter((p) => p.grupo === g.cod && ve(p.aba))
        .map((p) => ({ aba: p.aba, icone: p.icone, titulo: p.titulo, curta: p.descricao })),
    })),
  ].filter((g) => g.telas.length > 0);

  const termo = plano(busca.trim());
  const casa = (...textos: (string | undefined)[]) => !termo || plano(textos.filter(Boolean).join(' ')).includes(termo);
  const abas = ABAS_DO_PERFIL_NO_GUIA.filter((a) => a.id !== 'atendimentos' || QUEM_LE_ATENDIMENTO.includes(papel));
  const cargo = todasAsCasas ? 'Coordenação Geral' : (ROTULO_CARGO[papel] ?? papel);

  const abrirAcolhe = () => document.querySelector<HTMLButtonElement>('.acolhe-botao')?.click();

  return (
    <div className="guia">
      <div className="diahead">
        <div>
          <div className="eyebrow">Comece aqui</div>
          <h2>Guia do sistema</h2>
          <p className="mutetxt" style={{ margin: '4px 0 0' }}>
            As telas que você alcança como {cargo}. Toque numa tela para ver o que você faz
            nela e o que a Acolhe+AI faz junto, e abra a tela pelo botão.
          </p>
        </div>
      </div>

      <label className="f" htmlFor="guia-busca">Procurar no guia</label>
      <input id="guia-busca" type="search" className="field" value={busca} data-sem-ditado
             placeholder="Por exemplo: remédio, visita, escala"
             onChange={(e) => setBusca(e.target.value)} />

      {/* Botões, e não âncoras: a âncora muda o endereço, e o voltar do
          aparelho leva para fora do Guia. */}
      <nav className="guia-indice" aria-label="Partes do guia">
        {[['guia-novidades', 'Novidades', !termo], ['guia-telas', 'As telas', true],
          ['guia-perfil', 'O perfil da criança', ve('acolhidos')], ['guia-acolhe', 'A Acolhe+AI', true],
          ['guia-conta', 'Minha conta e avisos', true]]
          .filter(([, , mostra]) => mostra).map(([id, rotulo]) => (
            <button key={String(id)} type="button" className="guia-link"
                    onClick={() => document.getElementById(String(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              {rotulo}
            </button>
          ))}
      </nav>

      {!termo && (
        <section id="guia-novidades" className="guia-secao">
          <h3>Novidades</h3>
          <ul className="guia-novidades">
            {NOVIDADES.slice(0, 3).map((n) => (
              <li key={n.fase}>
                <span className="guia-dia">{n.dia}</span>
                <span>
                  {n.texto}{' '}
                  {n.aba && n.aba !== 'guia' && ve(n.aba) && (
                    <button type="button" className="guia-link" onClick={() => irPara(n.aba!)}>
                      Abrir {descritas.get(n.aba)?.titulo ?? n.aba}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="guia-telas" className="guia-secao">
        <h3>As telas</h3>
        {grupos.map((g) => {
          const telas = g.telas.filter((t) => casa(t.titulo, descritas.get(t.aba)?.texto,
            doCargo(t.aba)?.faz, COM_A_ACOLHE[t.aba]));
          if (!telas.length) return null;
          return (
            <div key={g.cod} className="guia-grupo">
              <div className="eyebrow">{g.titulo}</div>
              {telas.map((t) => {
                const area = doCargo(t.aba);
                /* Fechada, a tela mostra o nome e uma linha; aberta, o resto e o
                   link. Com a busca, as que casam já vêm abertas. */
                return (
                  <details key={`${t.aba}:${termo ? 'b' : ''}`} className="card guia-tela" open={!!termo}>
                    <summary>
                      <Icone nome={t.icone} />
                      <span className="guia-nome"><b>{t.titulo}</b><small>{t.curta}</small></span>
                    </summary>
                    {descritas.get(t.aba) && <p>{descritas.get(t.aba)!.texto}</p>}
                    {area && <p><b>O que você faz aqui.</b> {area.faz}</p>}
                    {area?.servidor && <p className="mutetxt"><b>Quem pode.</b> {area.servidor}</p>}
                    {COM_A_ACOLHE[t.aba] && <p><b>Com a Acolhe+AI.</b> {COM_A_ACOLHE[t.aba]}</p>}
                    {t.aba !== 'guia' && (
                      <button type="button" className="btn sm sec guia-abrir" onClick={() => irPara(t.aba)}>
                        Abrir {t.titulo} <Icone nome="avancar" tamanho={16} />
                      </button>
                    )}
                  </details>
                );
              })}
            </div>
          );
        })}
      </section>

      {ve('acolhidos') && casa('perfil criança', ALTO_DO_PERFIL, ...abas.map((a) => `${a.titulo} ${a.texto}`)) && (
        <section id="guia-perfil" className="guia-secao">
          <h3>O perfil da criança</h3>
          <p>{ALTO_DO_PERFIL}</p>
          <ul className="guia-abas">
            {abas.filter((a) => casa('perfil', a.titulo, a.texto)).map((a) => (
              <li key={a.id} className={`aba-${a.id}`}>
                <b>{a.titulo}.</b> {a.texto} {a.quem && <span className="mutetxt">{a.quem}</span>}
              </li>
            ))}
          </ul>
          <p>
            <b>Com a Acolhe+AI.</b> {COM_A_ACOLHE.acolhidos}{' '}
            <button type="button" className="guia-link" onClick={() => irPara('acolhidos')}>Abrir os Acolhidos</button>
          </p>
        </section>
      )}

      {casa('acolhe assistente', ...A_ACOLHE_EM_TODA_TELA) && (
        <section id="guia-acolhe" className="guia-secao">
          <h3>A Acolhe+AI</h3>
          {A_ACOLHE_EM_TODA_TELA.map((p) => <p key={p}>{p}</p>)}
          <button type="button" className="btn sec" onClick={abrirAcolhe}>
            <Icone nome="acolhe" /> Conversar com a Acolhe+AI
          </button>
        </section>
      )}

      {casa('conta senha avisos sino', ...MINHA_CONTA_NO_GUIA) && (
        <section id="guia-conta" className="guia-secao">
          <h3>Minha conta e avisos</h3>
          {MINHA_CONTA_NO_GUIA.map((p) => <p key={p}>{p}</p>)}
          <button type="button" className="guia-link" onClick={() => irPara('avisos')}>Abrir os avisos</button>
        </section>
      )}
    </div>
  );
}
