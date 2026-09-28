/**
 * A ATA DO FIM DE SEMANA (fase 173, decisão de 28/09).
 *
 * A simulação de noventa dias da ARM1 deixou as vinte e cinco ATAs diurnas de
 * sábado e domingo abertas para sempre: quem fecha a diurna é o Líder Diurno, a
 * técnica ou a coordenação, e nenhum deles trabalha no fim de semana. A
 * Fundação decidiu que na segunda o Líder Diurno as encontra e as fecha.
 *
 * `GET /shifts/abertas` devolve as ATAs cujo turno JÁ TERMINOU e que ninguém
 * fechou, com quem pode fechar cada uma pela mesma regra de `app_close_ata`.
 *
 * As datas são de quinhentos dias atrás (quatrocentos é da suíte do pedido de leitura), fora de toda janela de consulta: a
 * `ata` não aceita DELETE, e a suíte não tem como desfazer o que abre (145).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A ATA do fim de semana', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  let AI3 = '', SABADO = '', DOMINGO = '';
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    return r.body.token as string;
  };
  const auth = (tk: string) => ({ Authorization: `Bearer ${tk}` });
  const abertas = (tk: string, casa = AI3) =>
    request(http).get(`/api/v1/shifts/abertas?houseId=${casa}`).set(auth(tk));

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
      lider: 'lider.ai3@paodospobres.dev', noturno: 'lider.noturno@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
    })) t[k] = await login(email);
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code = 'AI3'`));
    /* O sábado de quinhentos e poucos dias atrás, e o domingo seguinte. */
    ({ rows: [{ sab: SABADO, dom: DOMINGO }] } = await admin.query(
      `SELECT s::text AS sab, (s + 1)::text AS dom
         FROM (SELECT (app_hoje() - 500) - ((extract(dow FROM app_hoje() - 500)::int + 1) % 7) AS s) x`));
    for (const [k, data, turno] of [['sab', SABADO, 'diurno'], ['dom', DOMINGO, 'noturno']]) {
      const r = await request(http).post('/api/v1/shifts').set(auth(t.lider)).send({ houseId: AI3, data, turno });
      expect(r.status).toBe(201);
      ids[`plantao_${k}`] = r.body.plantaoId; ids[`ata_${k}`] = r.body.ataId;
    }
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('o Líder Diurno encontra a diurna de sábado, e pode fechá-la; a noturna ele vê e não fecha', async () => {
    const r = await abertas(t.lider);
    expect(r.status).toBe(200);
    const sab = r.body.find((a: any) => a.ataId === ids.ata_sab);
    const dom = r.body.find((a: any) => a.ataId === ids.ata_dom);
    expect(sab).toMatchObject({ data: SABADO, turno: 'diurno', podeFechar: true, plantaoId: ids.plantao_sab });
    expect(dom).toMatchObject({ data: DOMINGO, turno: 'noturno', podeFechar: false });
    /* Da mais antiga à mais nova. */
    expect(r.body.findIndex((a: any) => a.ataId === ids.ata_sab))
      .toBeLessThan(r.body.findIndex((a: any) => a.ataId === ids.ata_dom));
  });

  it('o Líder Noturno Geral fecha a noturna, e o educador vê as duas sem poder fechar', async () => {
    const noite = (await abertas(t.noturno)).body.find((a: any) => a.ataId === ids.ata_dom);
    expect(noite.podeFechar).toBe(true);
    const doEducador = (await abertas(t.educador)).body.filter((a: any) =>
      [ids.ata_sab, ids.ata_dom].includes(a.ataId));
    expect(doEducador).toHaveLength(2);
    expect(doEducador.every((a: any) => a.podeFechar === false)).toBe(true);
  });

  it('o turno de agora não entra: só a ATA cujo turno já terminou', async () => {
    const hoje = await request(http).post('/api/v1/shifts').set(auth(t.lider))
      .send({ houseId: AI3, turno: 'diurno' });
    const r = await abertas(t.lider);
    expect(r.body.some((a: any) => a.plantaoId === hoje.body.plantaoId)).toBe(false);
  });

  it('fechada na segunda, ela sai da lista, com a pendência de quem não assinou', async () => {
    const f = await request(http).post(`/api/v1/shifts/ata/${ids.ata_sab}/close`).set(auth(t.lider)).send({});
    expect(f.status).toBe(201);
    const r = await abertas(t.lider);
    expect(r.body.some((a: any) => a.ataId === ids.ata_sab)).toBe(false);
    const { rows: [a] } = await admin.query(`SELECT status, closed_by FROM ata WHERE id = $1`, [ids.ata_sab]);
    expect(a.status).toBe('fechada_com_pendencia');
    expect(a.closed_by).toBeTruthy();
  });

  it('a casa de fora não é lista vazia: é 404', async () => {
    expect((await abertas(t.coord4)).status).toBe(404);
  });
});
