/**
 * A FOTO QUE NÃO SE APAGA (fase 274, pedido de 05/11).
 *
 * A foto da criança e a do familiar: só a equipe técnica e a coordenação põem,
 * trocam e tiram; o Gestor Geral e o educador veem e não mexem. Trocar guarda a
 * foto de antes no histórico (até aqui ela era esquecida pelo banco), e tirar
 * pede o motivo, guarda a de antes e deixa o arquivo onde estava.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { QUEM_POE_FOTO } from '../src/modules/people/contatos.service';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==';
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ...new Array(64).fill(0x20), 0xff, 0xd9,
]).toString('base64');

describe('A foto que não se apaga', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  let crianca = '', mae = '';
  const auth = (x: string) => ({ Authorization: `Bearer ${x}` });
  const post = (tok: string, url: string, body: any) =>
    request(http).post(`/api/v1${url}`).set(auth(tok)).send(body);

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
      tecnica: 'tecnica.ai3@paodospobres.dev', educador: 'educador.ai3@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) {
      t[k] = (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
    }
    const { rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`);
    const nova = await post(t.tecnica, '/people/admission', {
      houseId: AI3,
      pessoa: { fullName: 'Criança da Foto (fictícia)', socialName: 'Foto', birthDate: '2016-04-04' },
      acolhimento: { broughtBy: 'Conselho Tutelar', provisionalReason: 'Fixture de teste, sem documentos.',
                     capacityReason: 'Fixture de teste automatizado da foto que não se apaga.' },
      judicial: { reasonCategory: 'negligencia', determiningBody: 'vara_da_infancia' },
    });
    expect(nova.status).toBe(201);
    crianca = nova.body.personId;
    const c = await post(t.tecnica, `/people/${crianca}/contacts`,
      { nome: 'Mãe da Foto (fictícia)', vinculo: 'genitora', telefone: '51 90000-0001' });
    expect(c.status).toBe(201);
    mae = c.body.id;
  });

  afterAll(async () => {
    const r = await post(t.tecnica, `/people/${crianca}/discharge`, { motivo: 'Encerramento de fixture de teste' });
    expect([200, 201]).toContain(r.status);
    await app.close(); await admin.end();
  });

  it('só a equipe técnica e a coordenação mexem na foto', () => {
    expect(QUEM_POE_FOTO).toEqual(['equipe_tecnica', 'coordenador']);
  });

  for (const [qual, rota, tabela] of [
    ['da criança', () => `/people/${crianca}/photo`, 'person'],
    ['do familiar', () => `/people/contacts/${mae}/photo`, 'person_contact'],
  ] as const) {
    it(`a foto ${qual}: põe, troca guardando a de antes, e tira com motivo`, async () => {
      const id = tabela === 'person' ? crianca : mae;
      /* O Gestor Geral e o educador veem, e não mexem. */
      for (const quem of ['gestor', 'educador']) {
        const r = await post(t[quem], rota(), { conteudo: PNG, nomeArquivo: 'foto.png' });
        expect(r.status).toBe(403);
        expect(r.body.message).toMatch(/equipe técnica ou pela coordenação/);
      }
      expect((await post(t.tecnica, rota(), { conteudo: PNG, nomeArquivo: 'foto.png' })).status).toBe(201);
      const { rows: [primeira] } = await admin.query(`SELECT photo_key FROM ${tabela} WHERE id = $1`, [id]);
      expect(primeira.photo_key).toBeTruthy();

      /* Trocar guarda a de antes no histórico. */
      expect((await post(t.tecnica, rota(), { conteudo: JPEG, nomeArquivo: 'outra.jpg' })).status).toBe(201);
      const { rows: trocas } = await admin.query(
        `SELECT action, previous_key, reason FROM photo_change WHERE person_id = $1
            AND contact_id IS NOT DISTINCT FROM $2 ORDER BY changed_at`,
        [crianca, tabela === 'person' ? null : mae]);
      expect(trocas).toEqual([{ action: 'trocada', previous_key: primeira.photo_key, reason: null }]);

      /* Tirar pede o motivo, e só de quem pode. */
      expect((await post(t.tecnica, `${rota()}/retirar`, {})).status).toBe(400);
      expect((await post(t.gestor, `${rota()}/retirar`, { motivo: 'Tentativa do gestor' })).status).toBe(403);
      const { rows: [segunda] } = await admin.query(`SELECT photo_key FROM ${tabela} WHERE id = $1`, [id]);
      const tirou = await post(t.tecnica, `${rota()}/retirar`, { motivo: 'Foto de outra pessoa, posta por engano' });
      expect(tirou.status).toBe(201);
      expect(tirou.body.aviso).toMatch(/histórico/);

      /* Sem foto agora; a de antes no histórico, com o motivo; e nada a tirar de novo. */
      const ler = await request(http).get(`/api/v1${rota()}`).set(auth(t.tecnica));
      expect(ler.status).toBe(404);
      const { rows: hist } = await admin.query(
        `SELECT action, previous_key, reason FROM photo_change WHERE person_id = $1
            AND contact_id IS NOT DISTINCT FROM $2 ORDER BY changed_at`,
        [crianca, tabela === 'person' ? null : mae]);
      expect(hist[1]).toEqual({ action: 'retirada', previous_key: segunda.photo_key,
        reason: 'Foto de outra pessoa, posta por engano' });
      expect((await post(t.tecnica, `${rota()}/retirar`, { motivo: 'De novo, sem foto' })).status).toBe(400);
    });
  }
});
