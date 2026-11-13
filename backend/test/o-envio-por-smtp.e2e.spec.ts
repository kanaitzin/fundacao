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
import { emHtml } from '../src/modules/identity/mensagem-do-email';
import { CID_DO_LOGO, LOGO_DO_EMAIL } from '../src/modules/identity/logo-do-email';
import { readFileSync } from 'fs';
import { join } from 'path';

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
      .send({ convite: token, novaSenha: 'Senha-nova-do-email-123' });
    expect(fim.status).toBe(201);

    /* E o log disse que saiu, para quem, sem o link. */
    expect(logs.some((l) => l.includes(`e-mail enviado para ${p.email}`))).toBe(true);
    expect(logs.join('\n')).not.toContain(token!);
  });

  it('a mensagem sai em texto e com apresentação, com o logo da Fundação dentro, o mesmo link e nada buscado de fora', async () => {
    const cap = servidorDeCaptura();
    smtp(await cap.abrir());
    const p = await novaPessoa();
    const r = await convidar(p.id);
    await cap.fechar();
    expect(r.status).toBe(201);
    const corpo = texto(cap.recebidos[0].dados);

    /* As duas versões na mesma mensagem: quem não mostra HTML lê o texto de sempre. */
    expect(corpo).toMatch(/Content-Type: multipart\/alternative/i);
    expect(corpo).toMatch(/Content-Type: text\/plain/i);
    expect(corpo).toMatch(/Content-Type: text\/html/i);
    const html = corpo.slice(corpo.search(/<!DOCTYPE html>/i), corpo.search(/<\/html>/i));
    expect(html).toContain('Escolher a minha senha');
    expect(html).toContain('Fundação O Pão dos Pobres');

    /* O mesmo link nas duas, e só ele: nenhum outro endereço, imagem, script ou formulário. */
    const links = [...corpo.matchAll(/convite=([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThanOrEqual(3);
    expect(new Set(links).size).toBe(1);
    const enderecos = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(enderecos.length).toBeGreaterThan(0);
    for (const e of enderecos) expect(e).toMatch(/\/entrar\?convite=/);
    expect(html).not.toMatch(/<script|<form|<link|@import|url\(/i);

    /* A única imagem é o logo, e ele vai DENTRO da mensagem: a etiqueta aponta para a parte
       de mesmo nome, e essa parte é o logo da tela, byte por byte. */
    const imagens = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    expect(imagens).toEqual([`cid:${CID_DO_LOGO}`]);
    expect(html).toContain('alt="Fundação O Pão dos Pobres"');
    expect(cap.recebidos[0].dados).toMatch(new RegExp(`Content-ID: <${CID_DO_LOGO}>`, 'i'));
    expect(cap.recebidos[0].dados).toMatch(/Content-Disposition: inline/i);
    expect(LOGO_DO_EMAIL.equals(readFileSync(join(__dirname, '../../frontend/src/assets/logo.png')))).toBe(true);
  });

  it('o nome de quem recebe entra na mensagem como texto, nunca como HTML', () => {
    const html = emHtml({
      resumo: 'r', nome: 'Ana <img src=x onerror=alert(1)> & "Cia"', titulo: 't', antes: ['a'],
      botao: 'b', link: 'https://exemplo.dev/entrar?convite=abc&x="1"', validade: 'v', depois: ['d'],
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Ana &lt;img src=x onerror=alert(1)&gt; &amp; &quot;Cia&quot;');
    expect(html).toContain('href="https://exemplo.dev/entrar?convite=abc&amp;x=&quot;1&quot;"');
  });

  it('pela API do Gmail, a mesma mensagem sai num pedido só, e o log não leva a autorização nem o link', async () => {
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']) delete process.env[k];
    Object.assign(process.env, {
      EMAIL_MODO: 'gmail', EMAIL_REMETENTE: 'Rede Acolher <nao-responda@paodospobres.dev>',
      GMAIL_TOKEN: 'autorizacao-de-teste-123',
    });
    const pedidos: { url: string; init: any }[] = [];
    const deVerdade = global.fetch;
    global.fetch = (async (url: any, init: any) => {
      pedidos.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: 'mensagem-1' }), { status: 200 });
    }) as any;
    let r: any, p: { id: string; email: string };
    try {
      p = await novaPessoa();
      r = await convidar(p.id);
    } finally { global.fetch = deVerdade; }
    expect(r.status).toBe(201);

    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(pedidos[0].init.headers.authorization).toBe('Bearer autorizacao-de-teste-123');
    const inteira = Buffer.from(JSON.parse(pedidos[0].init.body).raw, 'base64url').toString('utf8');
    expect(inteira).toMatch(new RegExp(`^To: ${p!.email}`, 'm'));
    expect(inteira).toMatch(/Content-Type: multipart\/alternative/i);
    expect(inteira).toMatch(new RegExp(`Content-ID: <${CID_DO_LOGO}>`, 'i'));
    const token = texto(inteira).match(/convite=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();

    expect(logs.some((l) => l.includes(`e-mail enviado para ${p!.email}`) && l.includes('gmail mensagem-1'))).toBe(true);
    expect(logs.join('\n')).not.toContain(token!);
    expect(logs.join('\n')).not.toContain('autorizacao-de-teste-123');
  });

  it('pela API do Gmail, a autorização recusada responde em português, com 503', async () => {
    Object.assign(process.env, {
      EMAIL_MODO: 'gmail', EMAIL_REMETENTE: 'Rede Acolher <nao-responda@paodospobres.dev>',
      GMAIL_TOKEN: 'autorizacao-vencida',
    });
    const deVerdade = global.fetch;
    global.fetch = (async () => new Response('{}', { status: 401 })) as any;
    let r: any;
    try { r = await convidar((await novaPessoa()).id); } finally { global.fetch = deVerdade; }
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/não saiu/);
    expect(logs.some((l) => l.includes('NÃO saiu · gmail 401'))).toBe(true);
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
