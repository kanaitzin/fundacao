/**
 * O AVISO NO CELULAR, MESMO COM O SISTEMA FECHADO (fase 189; decidido em
 * 06/10: todos os avisos vão, e a tela bloqueada mostra só o título neutro).
 *
 * O serviço de push é um servidor local que faz o papel do Google: guarda o
 * que chegou, e a suíte DECIFRA com a chave privada do "aparelho", como o
 * celular faria. É o que a pessoa recebe, e não o que o servidor diz que mandou.
 *
 * Cobra-se: o que a tela bloqueada mostra (a casa, e nada do aviso: nem
 * criança, nem assunto); a assinatura VAPID e a urgência; um aviso uma vez por
 * aparelho; o aviso que volta a subir indo de novo; o lido não indo; o aparelho
 * que não existe mais saindo; o tablet da casa, em que só quem ligou por último
 * recebe; desligar; sair do sistema; o endereço que não é de serviço de push
 * recusado; a instalação sem chaves recusando ligar; e a auditoria.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { createServer, Server } from 'node:http';
import { createECDH, randomBytes } from 'node:crypto';
import * as webpush from 'web-push';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ece = require('http_ece');
import { AppModule } from '../src/app.module';
import { AvisoNoCelularService } from '../src/modules/notifications/aviso-no-celular.service';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const SENHA = 'senha-dev-123';

interface Chegada { caminho: string; cabecalhos: Record<string, string | string[] | undefined>; corpo: Buffer }

/** Um "aparelho": o par de chaves que o navegador gera ao ligar o aviso. */
function aparelho(porta: number, nome: string) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh, auth, endpoint: `http://127.0.0.1:${porta}/push/${nome}-${Date.now()}`,
    assinatura() {
      return { endpoint: this.endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
    },
    abrir(c: Chegada) {
      return JSON.parse(ece.decrypt(c.corpo, { version: 'aes128gcm', privateKey: ecdh, authSecret: auth.toString('base64url') }).toString('utf8'));
    },
  };
}

describe('O aviso no celular', () => {
  let app: INestApplication, http: any, admin: Client, servico: AvisoNoCelularService;
  let push: Server, porta = 0;
  const chegadas: Chegada[] = [];
  /** O que o "Google" responde: muda por endereço para simular o aparelho que sumiu. */
  const resposta = new Map<string, number>();
  const ids: Record<string, string> = {};
  const tok: Record<string, string> = {};
  const envAntes = { ...process.env };
  const vapid = webpush.generateVAPIDKeys();

  const entrar = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const comTok = (t: string) => ({ Authorization: `Bearer ${t}` });
  const avisar = async (userId: string, titulo: string, prioridade = 'normal') =>
    (await admin.query(`SELECT app_emit_notification($1, $2, $3, $4, $5, 'teste_push', NULL) AS id`,
      [userId, ids.AI3, titulo, `Corpo com detalhe do Theo (fictício): ${titulo}`, prioridade])).rows[0].id as string;
  const doAparelho = (a: { endpoint: string }) => chegadas.filter((c) => a.endpoint.endsWith(c.caminho));

  beforeAll(async () => {
    push = createServer((req, res) => {
      const partes: Buffer[] = [];
      req.on('data', (p) => partes.push(p));
      req.on('end', () => {
        chegadas.push({ caminho: req.url!, cabecalhos: req.headers, corpo: Buffer.concat(partes) });
        res.statusCode = resposta.get(req.url!) ?? 201;
        res.end();
      });
    });
    await new Promise<void>((ok) => push.listen(0, '127.0.0.1', ok));
    porta = (push.address() as any).port;

    process.env.PUSH_VAPID_PUBLICA = vapid.publicKey;
    process.env.PUSH_VAPID_PRIVADA = vapid.privateKey;
    process.env.PUSH_CONTATO = 'mailto:ti@paodospobres.dev';
    process.env.PUSH_SERVICOS = '127.0.0.1';

    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    servico = app.get(AvisoNoCelularService);
    ids.AI3 = (await admin.query(`SELECT id FROM house WHERE code = 'AI3'`)).rows[0].id;
    for (const [k, e] of [['edu', 'educador.ai3@paodospobres.dev'], ['edu2', 'educador2.ai3@paodospobres.dev']]) {
      ids[k] = (await admin.query(`SELECT id FROM app_user WHERE email = $1`, [e])).rows[0].id;
      tok[k] = await entrar(e);
    }
  });

  afterAll(async () => {
    // Nada se apaga: os aparelhos de teste saem desligados, para nenhuma suíte
    // seguinte mandar aviso a um endereço que não existe mais.
    await admin.query(`UPDATE push_subscription SET revoked_at = now(), revoked_reason = 'desligado'
                        WHERE endpoint LIKE 'http://127.0.0.1:%' AND revoked_at IS NULL`);
    await admin.query(`UPDATE notification SET read_at = now() WHERE entity = 'teste_push' AND read_at IS NULL`);
    process.env = envAntes;
    await app.close(); await admin.end();
    await new Promise((ok) => push.close(ok));
  });

  it('a tela diz se a instalação tem o aviso, e entrega a chave pública', async () => {
    const r = await request(http).get('/api/v1/avisos-no-celular/chave').set(comTok(tok.edu));
    expect(r.body).toEqual({ ligado: true, chave: vapid.publicKey });
  });

  it('o que chega ao celular é só o título neutro, com a casa', async () => {
    const cel = aparelho(porta, 'celular-edu');
    expect((await request(http).post('/api/v1/avisos-no-celular').set(comTok(tok.edu)).send(cel.assinatura())).status).toBe(201);
    expect((await request(http).post('/api/v1/avisos-no-celular/estado').set(comTok(tok.edu))
      .send({ endpoint: cel.endpoint })).body).toEqual({ ligado: true });
    /* Outra pessoa não fica sabendo se o aparelho de alguém está ligado. */
    expect((await request(http).post('/api/v1/avisos-no-celular/estado').set(comTok(tok.edu2))
      .send({ endpoint: cel.endpoint })).body).toEqual({ ligado: false });

    await avisar(ids.edu, 'Dose do Theo (fictício) passou do horário', 'alta');
    const conta = await servico.enviarPendentes();
    expect(conta.enviados).toBeGreaterThanOrEqual(1);
    const [c] = doAparelho(cel);
    expect(c).toBeTruthy();
    expect(c.cabecalhos['content-encoding']).toBe('aes128gcm');
    expect(String(c.cabecalhos.authorization)).toMatch(/^vapid t=.+, k=/);
    expect(c.cabecalhos.urgency).toBe('high');
    expect(Number(c.cabecalhos.ttl)).toBe(86400);

    const texto = cel.abrir(c);
    expect(texto).toEqual({ titulo: 'Rede Acolher', texto: 'Há um aviso para você na Casa 03 (piloto).', marca: 'rede-acolher:Casa 03 (piloto)' });
    expect(JSON.stringify(texto)).not.toMatch(/Theo|Dose|horário/);
    /* E o corpo, cifrado, também não leva nada legível. */
    expect(c.corpo.toString('latin1')).not.toMatch(/Rede Acolher|Casa 03/);
  });

  it('cada aviso vai uma vez por aparelho; o que volta a subir vai de novo; o lido não vai', async () => {
    const cel = aparelho(porta, 'segundo-edu');
    await request(http).post('/api/v1/avisos-no-celular').set(comTok(tok.edu)).send(cel.assinatura());
    const n = await avisar(ids.edu, 'Aviso comum');
    await servico.enviarPendentes();
    expect(doAparelho(cel)).toHaveLength(1);
    expect(doAparelho(cel)[0].cabecalhos.urgency).toBe('normal');
    await servico.enviarPendentes();
    expect(doAparelho(cel)).toHaveLength(1);

    /* O mesmo aviso subindo outra vez (o escalonamento renova o created_at). */
    await admin.query(`UPDATE notification SET created_at = now() WHERE id = $1`, [n]);
    await servico.enviarPendentes();
    expect(doAparelho(cel)).toHaveLength(2);

    const lido = await avisar(ids.edu, 'Aviso que já foi lido');
    await admin.query(`UPDATE notification SET read_at = now() WHERE id = $1`, [lido]);
    await servico.enviarPendentes();
    expect(doAparelho(cel)).toHaveLength(2);
  });

  it('o aparelho que não existe mais sai, e não recebe o próximo', async () => {
    const cel = aparelho(porta, 'sumiu');
    await request(http).post('/api/v1/avisos-no-celular').set(comTok(tok.edu)).send(cel.assinatura());
    resposta.set(new URL(cel.endpoint).pathname, 410);
    await avisar(ids.edu, 'Primeiro');
    await servico.enviarPendentes();
    expect(doAparelho(cel)).toHaveLength(1);
    const { rows: [s] } = await admin.query(`SELECT revoked_reason FROM push_subscription WHERE endpoint = $1`, [cel.endpoint]);
    expect(s.revoked_reason).toBe('aparelho_recusou');
    await avisar(ids.edu, 'Segundo');
    await servico.enviarPendentes();
    expect(doAparelho(cel)).toHaveLength(1);
  });

  it('o tablet da casa: só quem ligou por último recebe', async () => {
    const tablet = aparelho(porta, 'tablet');
    await request(http).post('/api/v1/avisos-no-celular').set(comTok(tok.edu)).send(tablet.assinatura());
    await request(http).post('/api/v1/avisos-no-celular').set(comTok(tok.edu2)).send(tablet.assinatura());
    const { rows } = await admin.query(
      `SELECT user_id, revoked_reason FROM push_subscription WHERE endpoint = $1 ORDER BY created_at`, [tablet.endpoint]);
    expect(rows.map((r) => [r.user_id, r.revoked_reason])).toEqual([[ids.edu, 'outra_pessoa_no_aparelho'], [ids.edu2, null]]);

    await avisar(ids.edu, 'Aviso da primeira educadora');
    await servico.enviarPendentes();
    expect(doAparelho(tablet)).toHaveLength(0);
    await avisar(ids.edu2, 'Aviso da segunda educadora');
    await servico.enviarPendentes();
    expect(doAparelho(tablet)).toHaveLength(1);
  });

  it('desligar e sair do sistema param o aviso; ninguém desliga o aparelho de outra pessoa', async () => {
    const cel = aparelho(porta, 'desligar');
    await request(http).post('/api/v1/avisos-no-celular').set(comTok(tok.edu)).send(cel.assinatura());
    const outra = await request(http).post('/api/v1/avisos-no-celular/desligar').set(comTok(tok.edu2)).send({ endpoint: cel.endpoint });
    expect(outra.body).toEqual({ ligado: false, desligado: false });
    const eu = await request(http).post('/api/v1/avisos-no-celular/desligar').set(comTok(tok.edu)).send({ endpoint: cel.endpoint });
    expect(eu.body).toEqual({ ligado: false, desligado: true });
    await avisar(ids.edu, 'Depois de desligar');
    await servico.enviarPendentes();
    expect(doAparelho(cel)).toHaveLength(0);

    const outro = aparelho(porta, 'saiu');
    await request(http).post('/api/v1/avisos-no-celular').set(comTok(tok.edu)).send(outro.assinatura());
    await request(http).post('/api/v1/avisos-no-celular/desligar').set(comTok(tok.edu))
      .send({ endpoint: outro.endpoint, motivo: 'saiu_do_sistema' });
    const { rows: [s] } = await admin.query(`SELECT revoked_reason FROM push_subscription WHERE endpoint = $1`, [outro.endpoint]);
    expect(s.revoked_reason).toBe('saiu_do_sistema');

    const { rows: aud } = await admin.query(
      `SELECT action FROM audit_event WHERE actor_id = $1 AND action IN ('push.ligado', 'push.desligado')
         AND at > now() - interval '10 minutes'`, [ids.edu]);
    expect(aud.map((a) => a.action)).toEqual(expect.arrayContaining(['push.ligado', 'push.desligado']));
  });

  it('o endereço que não é de serviço de push é recusado', async () => {
    const chaves = aparelho(porta, 'x').assinatura().keys;
    for (const endpoint of ['https://exemplo.com.br/push', 'http://fcm.googleapis.com/fcm/send/x',
      'http://10.0.0.5/push', 'https://fcm.googleapis.com.exemplo.com/x', 'não é endereço', '']) {
      const r = await request(http).post('/api/v1/avisos-no-celular').set(comTok(tok.edu)).send({ endpoint, keys: chaves });
      expect([endpoint, r.status]).toEqual([endpoint, 400]);
    }
    const semChave = await request(http).post('/api/v1/avisos-no-celular').set(comTok(tok.edu))
      .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: '<script>', auth: '' } });
    expect(semChave.status).toBe(400);
    expect((await request(http).post('/api/v1/avisos-no-celular').send({})).status).toBe(401);
  });

  it('a instalação sem as chaves não liga, e diz por quê', async () => {
    delete process.env.PUSH_VAPID_PRIVADA;
    try {
      expect((await request(http).get('/api/v1/avisos-no-celular/chave').set(comTok(tok.edu))).body)
        .toEqual({ ligado: false, chave: null });
      const r = await request(http).post('/api/v1/avisos-no-celular').set(comTok(tok.edu))
        .send(aparelho(porta, 'sem-chave').assinatura());
      expect(r.status).toBe(503);
      expect(r.body.message).toMatch(/ainda não foi ligado/);
      expect(await servico.enviarPendentes()).toEqual({ enviados: 0, recusados: 0, falhas: 0 });
    } finally {
      process.env.PUSH_VAPID_PRIVADA = vapid.privateKey;
    }
  });
});
