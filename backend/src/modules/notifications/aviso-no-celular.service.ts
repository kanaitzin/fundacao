import {
  BadRequestException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException,
} from '@nestjs/common';
import * as webpush from 'web-push';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * O AVISO NO CELULAR, MESMO COM O SISTEMA FECHADO (fase 189; decidido em 06/10:
 * TODOS os avisos vão, e a tela bloqueada mostra só o título neutro).
 *
 * O padrão é o Web Push com chaves VAPID: o servidor cifra um texto curto para
 * o aparelho e o entrega ao serviço de push do navegador (Google, Apple,
 * Mozilla, Microsoft), que o leva ao celular. O serviço de push não lê o texto;
 * e o texto, de propósito, não diz nada que valha ler: *"Há um aviso para você
 * na Casa 03"*. Nem nome de criança, nem assunto, nem prioridade por escrito.
 * O conteúdo continua dentro do sistema, depois de entrar, onde o cargo e a
 * casa são conferidos como em qualquer outra tela.
 *
 * DESLIGADO enquanto a instalação não tiver as três variáveis (`PUSH_VAPID_*`
 * e `PUSH_CONTATO`, §12.11): as chaves são segredo e nunca moram no código.
 *
 * O endereço do aparelho é uma porta para a tela dele: o log nunca o copia, e
 * o servidor só manda para os serviços de push conhecidos. Sem essa lista,
 * qualquer pessoa com login faria o servidor da Fundação mandar pedidos para
 * onde quisesse, inclusive para dentro da rede da casa.
 */
const SERVICOS_CONHECIDOS = [
  'fcm.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com',
];
/** De quanto em quanto tempo o servidor olha se há aviso para mandar. */
const INTERVALO_MS = 10_000;
/** O aviso que não chegou num dia já não é aviso. */
const VALIDADE_S = 24 * 60 * 60;

export interface Assinatura { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }

/** O que aparece na tela bloqueada. É TODO o texto que sai do servidor. */
export function textoDoAviso(casa: string | null) {
  return {
    titulo: 'Rede Acolher',
    texto: casa ? `Há um aviso para você na ${casa}.` : 'Há um aviso para você.',
    // Avisos da mesma casa se juntam numa notificação só: dez doses não são dez toques.
    marca: `rede-acolher:${casa ?? 'geral'}`,
  };
}

@Injectable()
export class AvisoNoCelularService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('AvisoNoCelular');
  private relogio: NodeJS.Timeout | null = null;
  private rodando = false;

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  onModuleInit() {
    if (!this.chaves()) return;
    this.relogio = setInterval(() => { void this.enviarPendentes(); }, INTERVALO_MS);
    this.relogio.unref();
  }

  onModuleDestroy() {
    if (this.relogio) clearInterval(this.relogio);
  }

  private chaves() {
    const publica = process.env.PUSH_VAPID_PUBLICA?.trim();
    const privada = process.env.PUSH_VAPID_PRIVADA?.trim();
    const contato = process.env.PUSH_CONTATO?.trim();
    if (!publica || !privada || !contato) return null;
    return { publicKey: publica, privateKey: privada, subject: contato };
  }

  /** A chave pública vai à tela, que a entrega ao navegador ao ligar. */
  estadoDaInstalacao() {
    const c = this.chaves();
    return { ligado: !!c, chave: c?.publicKey ?? null };
  }

  private conferirEndereco(endpoint: unknown): string {
    if (typeof endpoint !== 'string' || endpoint.length > 1000) {
      throw new BadRequestException('O endereço do aparelho não veio.');
    }
    let url: URL;
    try { url = new URL(endpoint); } catch { throw new BadRequestException('O endereço do aparelho não é válido.'); }
    const extras = (process.env.PUSH_SERVICOS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
    const host = url.hostname;
    const conhecido = [...SERVICOS_CONHECIDOS, ...extras].some((s) => host === s || host.endsWith(`.${s}`));
    const local = host === '127.0.0.1' || host === 'localhost';
    // http só para o serviço de teste local, e só quando a instalação o declarou.
    const protocoloOk = url.protocol === 'https:' || (url.protocol === 'http:' && local && extras.includes(host));
    if (!conhecido || !protocoloOk) {
      throw new BadRequestException('Este navegador entregou um serviço de aviso que o sistema não conhece.');
    }
    return endpoint;
  }

  private conferirChave(v: unknown, nome: string, max: number): string {
    if (typeof v !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(v) || v.length > max) {
      throw new BadRequestException(`A chave ${nome} do aparelho não veio certa.`);
    }
    return v;
  }

  async ligar(user: AuthenticatedUser, corpo: Assinatura) {
    // O corpo primeiro: o que veio errado é recusa de quem pediu (400), e não
    // falta da instalação (503).
    const endpoint = this.conferirEndereco(corpo?.endpoint);
    const p256dh = this.conferirChave(corpo?.keys?.p256dh, 'pública', 200);
    const auth = this.conferirChave(corpo?.keys?.auth, 'de autenticação', 64);
    if (!this.chaves()) {
      throw new ServiceUnavailableException('O aviso no celular ainda não foi ligado nesta instalação do sistema.');
    }
    await this.db.asUser(user.id, (c) => c.query(`SELECT app_push_ligar($1, $2, $3)`, [endpoint, p256dh, auth]));
    return { ligado: true };
  }

  async desligar(user: AuthenticatedUser, corpo: { endpoint?: unknown; motivo?: unknown }) {
    const motivo = corpo?.motivo === 'saiu_do_sistema' ? 'saiu_do_sistema' : 'desligado';
    if (typeof corpo?.endpoint !== 'string' || !corpo.endpoint) {
      throw new BadRequestException('O endereço do aparelho não veio.');
    }
    const { rows: [r] } = await this.db.asUser(user.id, (c) =>
      c.query(`SELECT app_push_desligar($1, $2) AS ok`, [corpo.endpoint, motivo]));
    return { ligado: false, desligado: r.ok as boolean };
  }

  async estado(user: AuthenticatedUser, corpo: { endpoint?: unknown }) {
    if (typeof corpo?.endpoint !== 'string' || !corpo.endpoint) return { ligado: false };
    const { rows: [r] } = await this.db.asUser(user.id, (c) =>
      c.query(`SELECT app_push_ligado($1) AS ok`, [corpo.endpoint]));
    return { ligado: r.ok as boolean };
  }

  /**
   * Manda o que estiver esperando. Roda de dez em dez segundos quando a
   * instalação tem as chaves; a suíte a chama direto. Nunca lança: aviso que
   * não saiu não derruba o servidor, e o banco guarda o status de cada um.
   */
  async enviarPendentes(): Promise<{ enviados: number; recusados: number; falhas: number }> {
    const conta = { enviados: 0, recusados: 0, falhas: 0 };
    const vapid = this.chaves();
    if (!vapid || this.rodando) return conta;
    this.rodando = true;
    try {
      // O instante vai e volta como TEXTO: o `Date` do JavaScript não tem os
      // microssegundos do banco, e com ele o resultado não casava com linha
      // nenhuma (fase 190: na 189, nenhum envio teve o status gravado).
      const { rows } = await this.db.query(
        `SELECT *, out_raised::text AS raised_exato FROM app_push_reservar(200)`);
      for (const r of rows) {
        const status = await this.mandar(r, vapid);
        if (status >= 200 && status < 300) conta.enviados++;
        else if (status === 404 || status === 410) conta.recusados++;
        else conta.falhas++;
        await this.db.query(`SELECT app_push_resultado($1, $2, $3, $4)`,
          [r.out_notification, r.raised_exato, r.out_subscription, status]);
      }
      if (rows.length) {
        this.log.log(`avisos no celular: ${conta.enviados} enviados, ${conta.recusados} aparelhos que não existem mais, ${conta.falhas} falhas`);
      }
    } catch (e) {
      this.log.error(`avisos no celular: a rodada falhou (${(e as Error).name})`);
    } finally {
      this.rodando = false;
    }
    return conta;
  }

  private async mandar(r: any, vapid: { publicKey: string; privateKey: string; subject: string }): Promise<number> {
    try {
      const pedido = webpush.generateRequestDetails(
        { endpoint: r.out_endpoint, keys: { p256dh: r.out_p256dh, auth: r.out_auth } },
        JSON.stringify(textoDoAviso(r.out_casa)),
        { vapidDetails: vapid, TTL: VALIDADE_S, urgency: r.out_prioridade === 'normal' ? 'normal' : 'high' },
      );
      const resp = await fetch(pedido.endpoint, {
        method: pedido.method, headers: pedido.headers as Record<string, string>,
        body: pedido.body as Buffer, signal: AbortSignal.timeout(10_000),
      });
      return resp.status;
    } catch {
      return 0;
    }
  }
}
