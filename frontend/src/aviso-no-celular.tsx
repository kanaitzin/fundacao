import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * O AVISO NO CELULAR, MESMO COM O SISTEMA FECHADO (fase 189; decidido em
 * 06/10: todos os avisos vão, e a tela bloqueada mostra só o título neutro).
 *
 * Mora na folha Minha conta. Liga e desliga NESTE aparelho: o celular da
 * educadora recebe, o tablet da casa só se alguém ligar nele, e quem ligou por
 * último no aparelho é quem recebe. Sair do sistema desliga, porque o aparelho
 * pode ser da casa e a próxima pessoa não deve ver o aviso de outra.
 *
 * Na tela bloqueada aparece só *Rede Acolher: há um aviso para você na Casa
 * 03*. O que é o aviso, só entrando: o celular pode estar na mão de outra
 * pessoa, e criança acolhida não tem o nome na tela de bloqueio de ninguém.
 */
type Estado =
  | 'carregando' | 'prototipo' | 'instalacao' | 'sem-suporte' | 'bloqueado'
  | 'desligado' | 'ligado' | 'erro';

const suportado = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function chaveParaBytes(b64: string) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function assinaturaDesteAparelho(): Promise<PushSubscription | null> {
  if (!suportado()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Chamado pelo Sair, ANTES de encerrar a sessão (o servidor precisa saber quem
 * pede). Nunca impede de sair. O aviso é da pessoa, e não da sessão: por isso,
 * além de avisar o servidor, o aparelho esquece a assinatura. Sem rede, o
 * servidor não fica sabendo, mas o próximo aviso já não tem onde chegar.
 */
export async function desligarAoSair() {
  try {
    const sub = await assinaturaDesteAparelho();
    if (!sub) return;
    try {
      await api('/avisos-no-celular/desligar', {
        method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint, motivo: 'saiu_do_sistema' }),
      });
    } finally {
      await sub.unsubscribe();
    }
  } catch { /* sair nunca falha por causa do aviso */ }
}

/**
 * `onde`: no celular e no tablet a seção mora na folha Minha conta; no
 * computador, na folha da senha (decisão de 08/10, fase 191). O comportamento é
 * o mesmo; muda o nome e onde o aviso aparece no aparelho.
 */
export function AvisoNoCelular({ casa, onde = 'celular' }: { casa: string | null; onde?: 'celular' | 'computador' }) {
  const [estado, setEstado] = useState<Estado>('carregando');
  const [chave, setChave] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await api<{ ligado: boolean; chave: string | null; prototipo?: boolean }>('/avisos-no-celular/chave');
        if (!vivo) return;
        if (r.prototipo) return setEstado('prototipo');
        if (!r.ligado || !r.chave) return setEstado('instalacao');
        setChave(r.chave);
        if (!suportado()) return setEstado('sem-suporte');
        if (Notification.permission === 'denied') return setEstado('bloqueado');
        const sub = await assinaturaDesteAparelho();
        if (!sub) return setEstado('desligado');
        const e = await api<{ ligado: boolean }>('/avisos-no-celular/estado', {
          method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        if (vivo) setEstado(e.ligado ? 'ligado' : 'desligado');
      } catch {
        if (vivo) setEstado('erro');
      }
    })();
    return () => { vivo = false; };
  }, []);

  async function ligar() {
    if (!chave) return;
    setOcupado(true); setMsg('');
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') { setEstado(permissao === 'denied' ? 'bloqueado' : 'desligado'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) });
      await api('/avisos-no-celular', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
      setEstado('ligado');
      setMsg('Ligado. Os avisos chegam a este aparelho mesmo com o sistema fechado.');
    } catch (e) {
      setMsg(e instanceof Error && e.message ? e.message : 'Não foi possível ligar o aviso neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true); setMsg('');
    try {
      const sub = await assinaturaDesteAparelho();
      if (sub) {
        await api('/avisos-no-celular/desligar', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setEstado('desligado');
      setMsg('Desligado. Os avisos continuam no sino, dentro do sistema.');
    } catch {
      setMsg('Não foi possível desligar agora. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  }

  const exemplo = casa ? `Há um aviso para você na ${casa}.` : 'Há um aviso para você.';

  return (
    <section className="aviso-celular" aria-labelledby={`t-aviso-${onde}`}>
      <h4 id={`t-aviso-${onde}`}>{onde === 'computador' ? 'Aviso neste computador' : 'Aviso no celular'}</h4>
      <p className="mutetxt">
        {onde === 'computador'
          ? 'Os avisos do sino aparecem no canto da tela deste computador mesmo com o sistema fechado. O aviso diz só isto:'
          : 'Os avisos do sino chegam a este aparelho mesmo com o sistema fechado. Na tela bloqueada aparece só isto:'}
      </p>
      <div className="aviso-exemplo" aria-label={`Exemplo do aviso: Rede Acolher. ${exemplo}`}>
        <strong>Rede Acolher</strong>
        <span>{exemplo}</span>
      </div>
      <p className="mutetxt">O que é o aviso, só entrando no sistema.</p>

      {estado === 'carregando' && <p className="mutetxt">Conferindo este aparelho…</p>}
      {estado === 'prototipo' && (
        <p className="mutetxt">
          No protótipo nenhum aviso sai. No sistema instalado, aqui fica o botão
          <strong> Ligar o aviso neste aparelho</strong>.
        </p>
      )}
      {estado === 'instalacao' && (
        <p className="mutetxt">O aviso com o sistema fechado ainda não foi ligado nesta instalação do sistema.</p>
      )}
      {estado === 'sem-suporte' && (
        <p className="mutetxt">
          Este navegador não recebe aviso com o sistema fechado. No iPhone, abra o sistema
          pelo ícone na tela de início (no Safari, Compartilhar e depois Adicionar à Tela de Início).
        </p>
      )}
      {estado === 'bloqueado' && (
        <p className="mutetxt">
          O navegador está bloqueando os avisos deste sistema. Para receber, libere em
          Notificações, nas configurações do navegador, e volte aqui.
        </p>
      )}
      {estado === 'erro' && <p className="mutetxt">Não foi possível conferir o aviso agora.</p>}
      {estado === 'desligado' && (
        <button className="btn sec" disabled={ocupado} onClick={ligar}>Ligar o aviso neste aparelho</button>
      )}
      {estado === 'ligado' && (
        <>
          <p className="mutetxt">Ligado neste aparelho. Sair do sistema desliga.</p>
          <button className="btn ghost" disabled={ocupado} onClick={desligar}>Desligar neste aparelho</button>
        </>
      )}
      {msg && <p role="status" className="mutetxt">{msg}</p>}
    </section>
  );
}
