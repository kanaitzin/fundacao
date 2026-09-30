/**
 * O ENVIO POR SMTP (fase 179), provado contra um servidor de captura.
 *
 * Até a análise de 30/09 o `MailGateway` só escrevia numa caixa local: não
 * havia caminho nenhum para o convite sair para a rede, e o primeiro acesso da
 * equipe dependia disso. O servidor de captura daqui é o Mailpit do §12.8
 * reduzido ao que o teste precisa: ele fala SMTP, guarda o que recebe e não
 * entrega a ninguém.
 *
 * O que esta suíte guarda:
 *  1. o convite sai pelo SMTP, do remetente institucional, e o link que chega
 *     no e-mail abre a conta (é o caminho inteiro, não só o envio);
 *  2. a conta e a senha do SMTP são usadas quando existem;
 *  3. sem STARTTLS o envio é RECUSADO por padrão: o link é credencial;
 *  4. servidor fora do ar e configuração faltando respondem em português, com
 *     503, e o log nunca leva o corpo nem o link.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { createServer, Server, Socket } from 'net';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

interface Capturado { de: string; para: string[]; dados: string; auth?: string }

/** Um servidor SMTP de captura: o bastante do protocolo para um cliente de verdade. */
function servidorDeCaptura(opcoes: { auth?: boolean } = {}) {
  const recebidos: Capturado[] = [];
  const conexoes = new Set<Socket>();
  const srv: Server = createServer((s) => {
    conexoes.add(s);
    s.on('close', () => conexoes.delete(s));
    let atual: Capturado = { de: '', para: [], dados: '' };
    let emDados = false, buffer = '', esperandoLogin = 0, usuario = '';
    s.write('220 captura ESMTP\r\n');
    s.on('data', (pedaco) => {
      buffer += pedaco.toString('utf8');
      let i: number;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const linha = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        if (emDados) {
          if (linha === '.') {
            emDados = false; recebidos.push(atual);
            atual = { de: '', para: [], dados: '', auth: atual.auth };
            s.write('250 guardado\r\n');
          } else atual.dados += (linha.startsWith('..') ? linha.slice(1) : linha) + '\r\n';
          continue;
        }
        if (esperandoLogin === 1) {
          usuario = Buffer.from(linha, 'base64').toString(); esperandoLogin = 2;
          s.write('334 UGFzc3dvcmQ6\r\n'); continue;
        }
        if (esperandoLogin === 2) {
          atual.auth = `${usuario}:${Buffer.from(linha, 'base64').toString()}`; esperandoLogin = 0;
          s.write('235 ok\r\n'); continue;
        }
        const cmd = linha.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') {
          s.write(`250-captura\r\n${opcoes.auth ? '250-AUTH PLAIN LOGIN\r\n' : ''}250 8BITMIME\r\n`);
        } else if (cmd === 'HELO') s.write('250 captura\r\n');
        else if (cmd === 'AUTH') {
          const [, tipo, dado] = linha.split(' ');
          if (tipo?.toUpperCase() === 'PLAIN') {
            const [, u, p] = Buffer.from(dado ?? '', 'base64').toString().split('\0');
            atual.auth = `${u}:${p}`; s.write('235 ok\r\n');
          } else { esperandoLogin = 1; s.write('334 VXNlcm5hbWU6\r\n'); }
        } else if (cmd === 'MAIL') { atual.de = linha.replace(/^.*?<|>.*$/g, ''); s.write('250 ok\r\n'); }
        else if (cmd === 'RCPT') { atual.para.push(linha.replace(/^.*?<|>.*$/g, '')); s.write('250 ok\r\n'); }
        else if (cmd === 'DATA') { emDados = true; s.write('354 pode mandar\r\n'); }
        /* Servidor de captura não tem certificado: responde como um servidor de
           verdade sem TLS responderia. */
        else if (linha.toUpperCase() === 'STARTTLS') s.write('502 sem TLS aqui\r\n');
        else if (cmd === 'QUIT') { s.write('221 tchau\r\n'); s.end(); }
        else s.write('250 ok\r\n');
      }
    });
  });
  return {
    recebidos,
    abrir: () => new Promise<number>((ok) => srv.listen(0, '127.0.0.1', () => ok((srv.address() as any).port))),
    fechar: () => new Promise<void>((ok) => { conexoes.forEach((c) => c.destroy()); srv.close(() => ok()); }),
  };
}

/** O corpo em quoted-printable, de volta a texto. */
const texto = (dados: string) => Buffer.from(
  dados.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
  'latin1').toString('utf8');

describe('O envio por SMTP', () => {
  let app: INestApplication, http: any, admin: Client;
  let coord = '', AI3 = '';
  const criadas: string[] = [];
  const antes = { ...process.env };
  const logs: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const novaPessoa = async () => {
    const email = `smtp.${Date.now()}.${criadas.length}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set(auth(coord))
      .send({ nome: 'Pessoa do Ensaio de E-mail (fictícia)', email, cargo: 'educador', casaId: AI3 });
    expect(r.status).toBe(201);
    criadas.push(r.body.id);
    return { id: r.body.id as string, email };
  };
  const convidar = (id: string) =>
    request(http).post(`/api/v1/staff/${id}/convite`).set(auth(coord)).send({});
  const smtp = (porta: number, extra: Record<string, string> = {}) => {
    for (const k of ['SMTP_USER', 'SMTP_PASS', 'SMTP_EXIGIR_TLS', 'EMAIL_REMETENTE']) delete process.env[k];
    Object.assign(process.env, {
      EMAIL_MODO: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(porta),
      EMAIL_REMETENTE: 'Rede Acolher <nao-responda@paodospobres.dev>', SMTP_EXIGIR_TLS: 'nao',
    }, extra);
  };

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    coord = (await request(http).post('/api/v1/auth/login')
      .send({ email: 'coord.ai3@paodospobres.dev', password: SENHA })).body.token;
    AI3 = (await admin.query(`SELECT id FROM house WHERE code = 'AI3'`)).rows[0].id;
    for (const nivel of ['log', 'error', 'warn'] as const) {
      jest.spyOn(Logger.prototype, nivel).mockImplementation((m: any, ..._resto: any[]) => {
        logs.push(String(m));
      });
    }
  });

  afterAll(async () => {
    process.env = antes;
    jest.restoreAllMocks();
    /* Nada se apaga: a pessoa criada sai da casa, como na suíte do convite, para
       não entrar na conta da equipe da AI3 que outras suítes fazem. */
    for (const id of criadas) {
      await admin.query(`UPDATE app_user SET active = false WHERE id = $1`, [id]);
      await admin.query(`UPDATE user_house_assignment SET valid_to = app_hoje() - 1
                          WHERE user_id = $1 AND valid_to IS NULL`, [id]);
      await admin.query(`DELETE FROM work_schedule WHERE user_id = $1`, [id]);
    }
    await app.close(); await admin.end();
  });

  it('o convite sai pelo SMTP, do remetente institucional, e o link dele abre a conta', async () => {
    const cap = servidorDeCaptura();
    smtp(await cap.abrir());
    const p = await novaPessoa();
    const r = await convidar(p.id);
    await cap.fechar();
    expect(r.status).toBe(201);

    expect(cap.recebidos).toHaveLength(1);
    const [e] = cap.recebidos;
    expect(e.de).toBe('nao-responda@paodospobres.dev');
    expect(e.para).toEqual([p.email]);
    const corpo = texto(e.dados);
    expect(corpo).toMatch(/escolha a sua senha/);
    const token = corpo.match(/convite=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();

    /* O caminho inteiro: o link que chegou na caixa é o que abre a conta. */
    const fim = await request(http).post('/api/v1/auth/convite/concluir')
      .send({ convite: token, novaSenha: 'senha-nova-do-email-123' });
    expect(fim.status).toBe(201);

    /* E o log disse que saiu, para quem, sem o link. */
    expect(logs.some((l) => l.includes(`e-mail enviado para ${p.email}`))).toBe(true);
    expect(logs.join('\n')).not.toContain(token!);
  });

  it('com conta e senha do SMTP, entra com elas', async () => {
    const cap = servidorDeCaptura({ auth: true });
    smtp(await cap.abrir(), { SMTP_USER: 'rede-acolher', SMTP_PASS: 'senha-de-aplicativo' });
    const r = await convidar((await novaPessoa()).id);
    await cap.fechar();
    expect(r.status).toBe(201);
    expect(cap.recebidos[0]?.auth).toBe('rede-acolher:senha-de-aplicativo');
    expect(logs.join('\n')).not.toContain('senha-de-aplicativo');
  });

  it('sem STARTTLS, o padrão RECUSA: o link do convite não atravessa a rede em texto claro', async () => {
    const cap = servidorDeCaptura();
    const porta = await cap.abrir();
    smtp(porta);
    delete process.env.SMTP_EXIGIR_TLS;
    const r = await convidar((await novaPessoa()).id);
    await cap.fechar();
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/não saiu/);
    expect(cap.recebidos).toHaveLength(0);
  });

  it('servidor fora do ar: 503 em português, e o log sem o corpo', async () => {
    const cap = servidorDeCaptura();
    const porta = await cap.abrir();
    await cap.fechar();
    smtp(porta);
    const antesDoErro = logs.length;
    const r = await convidar((await novaPessoa()).id);
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/servidor de e-mail não respondeu/);
    const novos = logs.slice(antesDoErro).join('\n');
    expect(novos).toMatch(/NÃO saiu/);
    expect(novos).not.toMatch(/convite=|escolha a sua senha|Ninguém da Fundação/);
  });

  it('sem remetente configurado, não envia e diz por quê', async () => {
    const cap = servidorDeCaptura();
    smtp(await cap.abrir());
    delete process.env.EMAIL_REMETENTE;
    const r = await convidar((await novaPessoa()).id);
    await cap.fechar();
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/não está configurado/);
    expect(cap.recebidos).toHaveLength(0);
  });
});
