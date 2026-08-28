import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * ATAS — a da casa e a Geral Noturna.
 *
 * O ponto inteiro desta tela é uma recusa: o sistema não assina no lugar de
 * ninguém. Quando falta a passagem de alguém, a ATA não "fecha assim mesmo"
 * nem inventa uma assinatura — ela fecha COM PENDÊNCIA, dizendo o nome de
 * quem faltou e o motivo, com a assinatura de quem fechou.
 *
 * Na ATA Geral, casa sem chamado também aparece: a ausência de demanda é
 * registrada, não omitida. Silêncio no papel é sempre ambíguo.
 */

interface Passagem { quem: string; cargo: string; assinada: boolean }
interface AtaCasa {
  data: string; turno: string; horario: string; estado: 'aberta' | 'fechada';
  comPendencia: boolean; motivoPendencia: string | null;
  fechadaPor: string | null; fechadaEm: string | null;
  passagens: Passagem[]; secoes: string[];
  podeFechar: boolean; assinaturasFaltantes: number;
}
interface AtaGeral {
  data: string; turno: string; horario: string; estado: 'aberta' | 'fechada';
  comPendencia: boolean; motivoPendencia: string | null;
  fechadaPor: string | null; fechadaEm: string | null;
  casas: { codigo: string; nome: string; registro: string | null; ataNoturna: string }[];
  podeFechar: boolean; casasAguardando: number;
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('pt-BR',
  { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

export function Ata() {
  const [aba, setAba] = useState<'casa' | 'geral'>('casa');
  const [casa, setCasa] = useState<AtaCasa | null>(null);
  const [geral, setGeral] = useState<AtaGeral | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [fechando, setFechando] = useState<'casa' | 'geral' | null>(null);

  async function carregar() {
    setErro('');
    try {
      const r = await api<{ casa: AtaCasa; geral: AtaGeral }>('/minutes');
      setCasa(r.casa); setGeral(r.geral);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as ATAs.');
    }
  }
  useEffect(() => { carregar(); }, []);

  async function acao(fn: () => Promise<any>) {
    setErro(''); setAviso('');
    try { const r = await fn(); if (r?.aviso) setAviso(r.aviso); await carregar(); return true; }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
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

      <div className="filtros" role="tablist" aria-label="Qual ATA">
        <button role="tab" aria-selected={aba === 'casa'} className={aba === 'casa' ? 'on' : ''}
                onClick={() => setAba('casa')}>ATA da casa</button>
        <button role="tab" aria-selected={aba === 'geral'} className={aba === 'geral' ? 'on' : ''}
                onClick={() => setAba('geral')}>ATA Geral Noturna</button>
      </div>

      {aba === 'casa' && casa && (
        <>
          <div className="card raise stack">
            <div className="row">
              <h3 className="grow" style={{ fontSize: 17, margin: 0 }}>
                ATA {casa.turno} · {dia(casa.data)}
              </h3>
              <span className={`pill ${casa.estado === 'fechada'
                ? (casa.comPendencia ? 'c-warn' : 'c-ok') : 'c-info'}`}>
                {casa.estado === 'fechada'
                  ? (casa.comPendencia ? 'Fechada com pendência' : 'Fechada') : 'Aberta'}
              </span>
            </div>
            <div className="mutetxt">Plantão {casa.horario}.</div>

            <div className="eyebrow">Passagens do plantão</div>
            <ul className="lista">
              {casa.passagens.map((p) => (
                <li key={p.quem} className="row">
                  <span className="grow">{p.quem}</span>
                  <span className={`pill ${p.assinada ? 'c-ok' : 'c-warn'}`}>
                    {p.assinada ? 'Assinada' : 'Pendente'}
                  </span>
                </li>
              ))}
            </ul>

            <div className="eyebrow">O que a ATA consolida</div>
            <div className="row">
              {casa.secoes.map((s) => <span className="pill c-mute" key={s}>{s}</span>)}
            </div>

            {casa.estado === 'fechada' ? (
              <div className={`notice ${casa.comPendencia ? 'c-warn' : 'c-ok'}`}>
                Fechada por <b>{casa.fechadaPor}</b>
                {casa.fechadaEm ? ` às ${hhmm(casa.fechadaEm)}` : ''}.
                {casa.comPendencia && (
                  <> Pendência registrada: {casa.motivoPendencia} Nenhuma assinatura foi
                    criada em nome de terceiros; equipe técnica e coordenação foram avisadas.</>
                )}
                {' '}A cópia documental entrou na fila do arquivo.
              </div>
            ) : casa.podeFechar ? (
              <>
                {casa.assinaturasFaltantes > 0 && (
                  <div className="notice c-warn">
                    Falta {casa.assinaturasFaltantes} passagem
                    {casa.assinaturasFaltantes === 1 ? '' : 's'}. O sistema não assina no lugar
                    de ninguém: ou a pessoa assina, ou a ATA fecha <b>com pendência</b>.
                  </div>
                )}
                <button className="btn block" onClick={() => setFechando('casa')}>
                  Fechar a ATA da casa
                </button>
              </>
            ) : (
              <p className="mutetxt" style={{ margin: 0 }}>
                Quem fecha esta ATA é o Líder Diurno ou a coordenação. Você lê, e o que
                escreveu na sua passagem já está aqui.
              </p>
            )}
          </div>

          <p className="mutetxt" style={{ marginTop: 12 }}>
            ATA fechada não é reescrita. Correção entra como adendo, ao lado, com autor e
            horário reais.
          </p>
        </>
      )}

      {aba === 'geral' && geral && (
        <>
          <div className="card raise stack">
            <div className="row">
              <h3 className="grow" style={{ fontSize: 17, margin: 0 }}>
                ATA Geral Noturna · {dia(geral.data)}
              </h3>
              <span className={`pill ${geral.estado === 'fechada'
                ? (geral.comPendencia ? 'c-warn' : 'c-ok') : 'c-info'}`}>
                {geral.estado === 'fechada'
                  ? (geral.comPendencia ? 'Fechada com pendência' : 'Fechada') : 'Aberta'}
              </span>
            </div>
            <div className="mutetxt">Turno {geral.horario} · as oito unidades.</div>
            <p className="mutetxt" style={{ margin: 0 }}>
              Casa sem chamado também é indicada: a ausência de demanda é
              <b> registrada, não omitida</b>.
            </p>

            <ul className="lista">
              {geral.casas.map((c) => (
                <li key={c.codigo} className="row">
                  <b className="ff code">{c.codigo}</b>
                  <span className="grow">
                    {c.registro ?? <span className="mutetxt">Sem chamado ou visita.</span>}
                  </span>
                  <span className={`pill ${c.ataNoturna === 'confirmada' ? 'c-ok' : 'c-warn'}`}>
                    ATA da casa {c.ataNoturna}
                  </span>
                </li>
              ))}
            </ul>

            {geral.estado === 'fechada' ? (
              <div className={`notice ${geral.comPendencia ? 'c-warn' : 'c-ok'}`}>
                Assinada e fechada por <b>{geral.fechadaPor}</b>
                {geral.fechadaEm ? ` às ${hhmm(geral.fechadaEm)}` : ''}.
                {geral.comPendencia && <> Pendência: {geral.motivoPendencia}</>}
                {' '}Cada educador assinou apenas a própria passagem.
              </div>
            ) : geral.podeFechar ? (
              <>
                {geral.casasAguardando > 0 && (
                  <div className="notice c-warn">
                    {geral.casasAguardando} casa{geral.casasAguardando === 1 ? '' : 's'} ainda
                    não confirmou a ATA noturna. Feche <b>com pendência</b>, dizendo o que faltou.
                  </div>
                )}
                <button className="btn block" onClick={() => setFechando('geral')}>
                  ✍️ Assinar e fechar a ATA Geral
                </button>
              </>
            ) : (
              <p className="mutetxt" style={{ margin: 0 }}>
                Quem assina a ATA Geral é o Líder Noturno Geral ou a coordenação.
              </p>
            )}
          </div>
        </>
      )}

      {fechando && (
        <FolhaFechar
          qual={fechando}
          faltam={fechando === 'casa'
            ? (casa?.assinaturasFaltantes ?? 0) : (geral?.casasAguardando ?? 0)}
          onFechar={() => setFechando(null)}
          onConfirmar={async (comPendencia, motivoPendencia) => {
            const rota = fechando === 'casa' ? '/minutes/house/close' : '/minutes/general/close';
            const ok = await acao(() => api(rota, {
              method: 'POST', body: JSON.stringify({ comPendencia, motivoPendencia }) }));
            if (ok) setFechando(null);
          }} />
      )}
    </>
  );
}

function FolhaFechar({ qual, faltam, onFechar, onConfirmar }: {
  qual: 'casa' | 'geral'; faltam: number; onFechar: () => void;
  onConfirmar: (comPendencia: boolean, motivo: string) => void;
}) {
  const [comPendencia, setComPendencia] = useState(faltam > 0);
  const [motivo, setMotivo] = useState('');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-ata"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-ata">
          Fechar a {qual === 'casa' ? 'ATA da casa' : 'ATA Geral Noturna'}
        </h3>
        <div className="notice c-info">
          O fechamento leva o <b>seu nome</b> e o horário de agora. Ele não cria assinatura
          de mais ninguém.
        </div>

        <label className="f">Como fechar</label>
        <div className="opts">
          <button type="button" className="opt c-ok" aria-pressed={!comPendencia}
                  disabled={faltam > 0} onClick={() => setComPendencia(false)}>
            Tudo assinado — fechar consolidada
          </button>
          <button type="button" className="opt c-warn" aria-pressed={comPendencia}
                  onClick={() => setComPendencia(true)}>
            Fechar com pendência
          </button>
        </div>
        {faltam > 0 && (
          <p className="mutetxt">
            Ainda falta{faltam === 1 ? '' : 'm'} {faltam} assinatura{faltam === 1 ? '' : 's'}.
            Fechar como consolidada afirmaria algo que não aconteceu.
          </p>
        )}

        {comPendencia && (
          <>
            <label className="f" htmlFor="mot-ata">
              Qual é a pendência <small>— quem faltou e por quê, até onde você sabe</small>
            </label>
            <textarea id="mot-ata" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex.: passagem de Joana Lima ausente; saiu antes do fim do turno para atendimento." />
          </>
        )}

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Cancelar</button>
          <button className="btn grow" onClick={() => onConfirmar(comPendencia, motivo)}>
            Confirmar fechamento
          </button>
        </div>
      </div>
    </div>
  );
}
