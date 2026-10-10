/**
 * O BANCO QUE REINICIA NÃO DERRUBA O SERVIDOR (fase 194).
 *
 * A simulação de 30 dias da fase 194 viu o banco encerrar as conexões no meio
 * do ensaio de navegador, e a API morrer junto: o `pg` emite `error` na
 * conexão encerrada, e sem quem o ouça o Node encerra o processo. Em produção
 * é o reinício do banco para manutenção, a restauração do backup, uma queda:
 * o plantão ficaria sem sistema até alguém reiniciar a API à mão.
 *
 * Aqui o banco encerra, de propósito, TODAS as conexões do servidor (as
 * ociosas e uma emprestada no meio de uma transação), e o servidor tem de
 * continuar respondendo. Se o processo morresse, esta suíte morreria com ele.
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/kernel/database/database.service';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('o banco que reinicia não derruba o servidor', () => {
  let app: INestApplication, http: any, admin: Client, db: DatabaseService;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    db = app.get(DatabaseService);
  });
  afterAll(async () => { await app.close(); await admin.end(); });

  const derrubarAsConexoesDoServidor = () => admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE usename = 'rede_app' AND pid <> pg_backend_pid()`);

  it('com as conexões ociosas encerradas pelo banco, o servidor segue respondendo', async () => {
    // Enche o pool com algumas conexões ociosas.
    await Promise.all(Array.from({ length: 4 }, () => request(http).get('/api/v1/health')));
    expect(db.pool.idleCount).toBeGreaterThan(0);
    await derrubarAsConexoesDoServidor();
    await espera(300);
    const r = await request(http).get('/api/v1/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('com a conexão encerrada no meio de uma transação, a pergunta falha e a próxima funciona', async () => {
    const { rows: [u] } = await admin.query(`SELECT id FROM app_user WHERE email = 'educador.ai3@paodospobres.dev'`);
    const emCurso = db.asUser(u.id, async (c) => {
      await c.query('SELECT 1');
      await derrubarAsConexoesDoServidor();
      await espera(300);
      await c.query('SELECT 1');
    });
    await expect(emCurso).rejects.toThrow();
    await espera(100);
    const r = await request(http).get('/api/v1/health');
    expect(r.status).toBe(200);
  });
});
