/**
 * A PORTA PARA A INTERNET (fase 179).
 *
 * O que a análise de 30/09 achou no servidor que ia sair da rede da casa:
 *  - CORS aberto a QUALQUER origem, com credencial, quando faltava a variável;
 *  - nenhum cabeçalho dizendo ao navegador para não guardar o dossiê em cache,
 *    não abrir a API em moldura, não adivinhar tipo de arquivo;
 *  - atrás de proxy, o IP de toda sessão era o do proxy.
 *
 * Esta suíte sobe DOIS servidores: um como vem de fábrica, e um configurado
 * como na implantação (atrás de um proxy, com a origem da instituição).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const INSTITUICAO = 'https://rede.paodospobres.com.br';

async function subir(env: Record<string, string | undefined>) {
  const antes: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    antes[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.setGlobalPrefix('api/v1');
  await app.init();
  for (const [k, v] of Object.entries(antes)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return app;
}

describe('A porta para a internet', () => {
  let fabrica: INestApplication, implantado: INestApplication, admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    fabrica = await subir({ CORS_ORIGIN: undefined, TRUST_PROXY: undefined });
    implantado = await subir({ CORS_ORIGIN: INSTITUICAO, TRUST_PROXY: '1' });
  });

  afterAll(async () => { await fabrica.close(); await implantado.close(); await admin.end(); });

  const entrar = (app: INestApplication, ip: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip).set('X-Forwarded-Proto', 'https')
      .send({ email: 'educador.ai3@paodospobres.dev', password: SENHA });

  it('toda resposta diz ao navegador: sem cache, sem moldura, sem adivinhar tipo', async () => {
    const http = fabrica.getHttpServer();
    const login = await entrar(fabrica, '198.51.100.1');
    for (const r of [
      await request(http).get('/api/v1/health'),
      await request(http).get('/api/v1/rota-que-nao-existe'),
      await request(http).get('/api/v1/people').set('Authorization', `Bearer ${login.body.token}`),
      login,
    ]) {
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['x-frame-options']).toBe('DENY');
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['referrer-policy']).toBe('no-referrer');
      expect(r.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
      expect(r.headers['x-powered-by']).toBeUndefined();
    }
  });

  it('de fábrica, NENHUMA origem de fora é aceita', async () => {
    const r = await request(fabrica.getHttpServer()).options('/api/v1/auth/login')
      .set('Origin', 'https://pagina-qualquer.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    const g = await request(fabrica.getHttpServer()).get('/api/v1/health')
      .set('Origin', 'https://pagina-qualquer.example');
    expect(g.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('configurado, só a origem da instituição', async () => {
    const http = implantado.getHttpServer();
    const nossa = await request(http).options('/api/v1/auth/login')
      .set('Origin', INSTITUICAO).set('Access-Control-Request-Method', 'POST');
    expect(nossa.headers['access-control-allow-origin']).toBe(INSTITUICAO);
    const outra = await request(http).options('/api/v1/auth/login')
      .set('Origin', 'https://pagina-qualquer.example').set('Access-Control-Request-Method', 'POST');
    expect(outra.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('atrás do proxy, a sessão guarda o IP de quem entrou; sem proxy, ninguém escreve o IP que quiser', async () => {
    const pelaPorta = await entrar(implantado, '203.0.113.7');
    expect(pelaPorta.status).toBe(201);
    const inventado = await entrar(fabrica, '203.0.113.99');
    expect(inventado.status).toBe(201);
    const { rows } = await admin.query(
      `SELECT host(ip) AS ip FROM user_session
        WHERE user_id = (SELECT id FROM app_user WHERE email = 'educador.ai3@paodospobres.dev')
        ORDER BY created_at DESC LIMIT 2`);
    expect(rows.map((r: any) => r.ip)).toContain('203.0.113.7');
    expect(rows.map((r: any) => r.ip)).not.toContain('203.0.113.99');
  });

  it('HSTS só quando o pedido chegou por HTTPS, pelo proxy de confiança', async () => {
    const pelaPorta = await entrar(implantado, '203.0.113.8');
    expect(pelaPorta.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    /* Sem proxy de confiança, o cabeçalho que diz "é HTTPS" é só um cabeçalho. */
    const semProxy = await entrar(fabrica, '203.0.113.9');
    expect(semProxy.headers['strict-transport-security']).toBeUndefined();
  });
});
