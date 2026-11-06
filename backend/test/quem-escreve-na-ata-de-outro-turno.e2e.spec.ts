/**
 * QUEM ESCREVE NA ATA DE OUTRO TURNO (fase 281, primeira avaliação humana de 05/11,
 * módulo 10; decidido em 06/11).
 *
 * Escrevem sem pedir a técnica, a coordenação, a Enfermagem, o líder do próprio
 * turno e quem está na escala dele. Sem escala lançada no turno, ninguém é travado.
 * Os outros pedem, com o motivo, e o líder do turno ou a coordenação autoriza ou
 * recusa, com o nome e a hora. Esta suíte cobra:
 *
 *  1. o educador fora da escala recebe a recusa em português, e a tela sabe disso;
 *  2. ele pede, não pede duas vezes, e não decide o próprio pedido;
 *  3. o Líder Diurno autoriza o pedido da ATA diurna, e a linha passa;
 *  4. a técnica escreve sem pedir;
 *  5. no turno sem escala lançada, o educador escreve sem pedir;
 *  6. o pedido e a decisão ficam na auditoria da casa.
 *
 * As ATAs nascem quatrocentos dias atrás, fora de toda janela de consulta: a ATA não
 * se apaga e a linha é imutável (a lição da 145).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Quem escreve na ATA de outro turno', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const escrever = (quem: string, ata: string, texto: string) =>
    request(http).post(`/api/v1/shifts/ata/${ata}/notes`).set(auth(quem)).send({ texto });

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    for (const [k, email] of Object.entries({
      educador: 'educador.ai3@paodospobres.dev', lider: 'lider.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev', coord: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.lider }] } = await admin.query(`SELECT id FROM app_user WHERE email='lider.ai3@paodospobres.dev'`));
    ({ rows: [{ id: ids.coord }] } = await admin.query(`SELECT id FROM app_user WHERE email='coord.ai3@paodospobres.dev'`));

    /* A ATA diurna COM escala lançada (só o Líder Diurno nela) e a ATA diurna SEM escala. */
    for (const [chave, dias, comEscala] of [['comEscala', 410, true], ['semEscala', 411, false]] as const) {
      const { rows: [s] } = await admin.query(
        `INSERT INTO shift (house_id, period, on_date, opened_by, opened_at)
         VALUES ($1, 'diurno', app_hoje() - $2::int, $3, now()) RETURNING id`, [ids.AI3, dias, ids.coord]);
      const { rows: [a] } = await admin.query(
        `INSERT INTO ata (shift_id, house_id, on_date, period, status)
         VALUES ($1, $2, app_hoje() - $3::int, 'diurno', 'rascunho') RETURNING id`, [s.id, ids.AI3, dias]);
      ids[chave] = a.id;
      if (comEscala) {
        await admin.query(
          `INSERT INTO shift_assignment (house_id, user_id, on_date, period, created_by)
           VALUES ($1, $2, app_hoje() - $3::int, 'diurno', $4)`, [ids.AI3, ids.lider, dias, ids.coord]);
      }
    }
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('o educador fora da escala do turno recebe a recusa, e a tela sabe', async () => {
    const r = await escrever(tokens.educador, ids.comEscala, 'Linha de quem não está na escala (fictícia).');
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/não está na escala deste turno/);
    const e = await request(http).get(`/api/v1/shifts/ata/${ids.comEscala}/write-requests`).set(auth(tokens.educador));
    expect(e.status).toBe(200);
    expect(e.body.podeEscrever).toBe(false);
    expect(e.body.decide).toBe(false);
  });

  it('ele pede com o motivo, não pede duas vezes e não decide o próprio pedido', async () => {
    const curto = await request(http).post(`/api/v1/shifts/ata/${ids.comEscala}/write-request`)
      .set(auth(tokens.educador)).send({ motivo: 'ok' });
    expect(curto.status).toBe(400);
    const r = await request(http).post(`/api/v1/shifts/ata/${ids.comEscala}/write-request`)
      .set(auth(tokens.educador)).send({ motivo: 'Fiquei até as 21h e acompanhei a volta da visita (fictício).' });
    expect(r.status).toBe(201);
    ids.pedido = r.body.id;
    const de2 = await request(http).post(`/api/v1/shifts/ata/${ids.comEscala}/write-request`)
      .set(auth(tokens.educador)).send({ motivo: 'De novo, para ver a recusa (fictício).' });
    expect(de2.status).toBe(400);
    expect(de2.body.message).toMatch(/já está esperando/);
    const proprio = await request(http).post(`/api/v1/shifts/ata-write-requests/${ids.pedido}/decide`)
      .set(auth(tokens.educador)).send({ autoriza: true });
    expect(proprio.status).toBe(403);
    expect(proprio.body.message).toMatch(/líder deste turno ou a coordenação/);
  });

  it('o Líder Diurno vê o pedido, autoriza, e a linha passa', async () => {
    const l = await request(http).get(`/api/v1/shifts/ata/${ids.comEscala}/write-requests`).set(auth(tokens.lider));
    expect(l.body.decide).toBe(true);
    const p = l.body.pedidos.find((x: any) => x.id === ids.pedido);
    expect(p.situacao).toBe('esperando');
    expect(p.quem).toBeTruthy();
    const d = await request(http).post(`/api/v1/shifts/ata-write-requests/${ids.pedido}/decide`)
      .set(auth(tokens.lider)).send({ autoriza: true, motivo: 'Combinado no plantão (fictício).' });
    expect(d.status).toBe(201);
    const outra = await request(http).post(`/api/v1/shifts/ata-write-requests/${ids.pedido}/decide`)
      .set(auth(tokens.coord)).send({ autoriza: false });
    expect(outra.status).toBe(400);
    const w = await escrever(tokens.educador, ids.comEscala, 'Linha autorizada pelo líder (fictícia).');
    expect(w.status).toBe(201);
    const e = await request(http).get(`/api/v1/shifts/ata/${ids.comEscala}/write-requests`).set(auth(tokens.educador));
    expect(e.body.podeEscrever).toBe(true);
    expect(e.body.pedidos[0].situacao).toBe('autorizado');
    expect(e.body.pedidos[0].decidiu).toBeTruthy();
  });

  it('a técnica escreve sem pedir, e no turno sem escala o educador também', async () => {
    expect((await escrever(tokens.tecnica, ids.comEscala, 'Linha da técnica (fictícia).')).status).toBe(201);
    expect((await escrever(tokens.educador, ids.semEscala, 'Linha sem escala lançada (fictícia).')).status).toBe(201);
  });

  it('o pedido e a decisão ficam na auditoria da casa', async () => {
    const { rows } = await admin.query(
      `SELECT action, house_id FROM audit_event WHERE entity = 'ata_write_request' AND entity_id = $1 AND action LIKE 'ata.escrita.%'
        ORDER BY at`, [ids.pedido]);
    expect(rows.map((r) => r.action)).toEqual(['ata.escrita.pedida', 'ata.escrita.autorizada']);
    expect(rows.every((r) => r.house_id === ids.AI3)).toBe(true);
  });
});
