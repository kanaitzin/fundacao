/**
 * QUEM APARECE NA FOTO, E A FOTO PEQUENA (fase 209, pedido de 12/10).
 *
 * O pedido foi reconhecer o rosto da criança e levar a foto à pasta dela. Não
 * entrou: é dado biométrico de criança. Entrou a pessoa MARCAR quem aparece.
 * O que esta suíte cobra:
 *
 *  1. a miniatura vai junto da foto, e a lista do álbum diz que ela existe;
 *  2. a miniatura abre SEM ir à auditoria (é a lista), a foto inteira vai;
 *  3. marcar põe a foto no álbum da criança marcada, com quem marcou;
 *  4. só criança da mesma casa; outra casa não marca nem lê;
 *  5. desmarcar pede o motivo e a marca fica no banco, retirada;
 *  6. a cozinha e a portaria não marcam.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]),
  Buffer.alloc(64, 0x20),
  Buffer.from([0xff, 0xd9]),
]).toString('base64');
const MINI = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]),
  Buffer.alloc(8, 0x21),
  Buffer.from([0xff, 0xd9]),
]).toString('base64');

describe('Quem aparece na foto', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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
      educador: 'educador.ai3@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev', cozinha: 'cozinha.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows: tres } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa' ORDER BY person_id LIMIT 2`, [ids.AI3]);
    ids.dono = tres[0].person_id; ids.outra = tres[1].person_id;
    ({ rows: [{ person_id: ids.deFora }] } = await admin.query(
      `SELECT person_id FROM house_stay s JOIN house h ON h.id = s.house_id
        WHERE h.code = 'AI4' AND s.status = 'ativa' LIMIT 1`));

    const r = await request(http).post(`/api/v1/people/${ids.dono}/memories`).set(auth(tokens.educador))
      .send({ tipo: 'passeio', quando: '2020-01-15', descricao: 'Passeio ao parque da conferência 209 (fictício)',
              fotos: [{ conteudo: JPEG, miniatura: MINI, nomeArquivo: 'parque.jpg', autorizacaoRegistrada: true }] });
    expect(r.status).toBe(201);
    ids.vivencia = r.body.id;
    ({ rows: [{ id: ids.foto }] } = await admin.query(`SELECT id FROM memory_photo WHERE memory_id = $1`, [ids.vivencia]));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('a miniatura vai junto, e abre sem ir à auditoria; a inteira vai', async () => {
    const album = await request(http).get(`/api/v1/people/${ids.dono}/memories`).set(auth(tokens.tecnica)).expect(200);
    const viv = album.body.itens.find((x: any) => x.id === ids.vivencia);
    expect(viv.fotos[0].temMiniatura).toBe(true);
    const antes = (await admin.query(`SELECT count(*)::int n FROM audit_event WHERE action='memory.open' AND entity_id=$1`, [ids.vivencia])).rows[0].n;
    const mini = await request(http).get(`/api/v1/people/${ids.dono}/memories/${ids.vivencia}/photos/${ids.foto}/miniatura`)
      .set(auth(tokens.tecnica)).expect(200);
    expect(mini.body.conteudo).toBe(MINI);
    const meio = (await admin.query(`SELECT count(*)::int n FROM audit_event WHERE action='memory.open' AND entity_id=$1`, [ids.vivencia])).rows[0].n;
    expect(meio).toBe(antes);
    const inteira = await request(http).get(`/api/v1/people/${ids.dono}/memories/${ids.vivencia}/photos/${ids.foto}`)
      .set(auth(tokens.tecnica)).expect(200);
    expect(inteira.body.conteudo).toBe(JPEG);
    const depois = (await admin.query(`SELECT count(*)::int n FROM audit_event WHERE action='memory.open' AND entity_id=$1`, [ids.vivencia])).rows[0].n;
    expect(depois).toBe(antes + 1);
  });

  it('marcar põe a foto no álbum da outra criança, com quem marcou', async () => {
    const r = await request(http).post(`/api/v1/people/memory-photos/${ids.foto}/pessoas`).set(auth(tokens.educador))
      .send({ personId: ids.outra, autorizacaoRegistrada: false }).expect(201);
    ids.marca = r.body.marcaId;
    expect((await request(http).post(`/api/v1/people/memory-photos/${ids.foto}/pessoas`).set(auth(tokens.educador))
      .send({ personId: ids.outra })).status).toBe(409);
    expect((await request(http).post(`/api/v1/people/memory-photos/${ids.foto}/pessoas`).set(auth(tokens.educador))
      .send({ personId: ids.dono })).status).toBe(400);
    /* Lido pela técnica, que não marcou: o nome sai por função. */
    const em = await request(http).get(`/api/v1/people/${ids.outra}/aparece-em`).set(auth(tokens.tecnica)).expect(200);
    const f = em.body.find((x: any) => x.fotoId === ids.foto);
    expect(f.marcadaPor).toBeTruthy();
    expect(f.autorizacaoRegistrada).toBe(false);
    const album = await request(http).get(`/api/v1/people/${ids.dono}/memories`).set(auth(tokens.tecnica)).expect(200);
    const foto = album.body.itens.find((x: any) => x.id === ids.vivencia).fotos[0];
    expect(foto.quemAparece.map((q: any) => q.personId)).toContain(ids.outra);
    const { rows: [a] } = await admin.query(
      `SELECT house_id FROM audit_event WHERE action='memory.tag' AND entity_id=$1 ORDER BY at DESC LIMIT 1`, [ids.foto]);
    expect(a.house_id).toBe(ids.AI3);
  });

  it('só criança da mesma casa; outra casa não marca nem lê', async () => {
    expect((await request(http).post(`/api/v1/people/memory-photos/${ids.foto}/pessoas`).set(auth(tokens.educador))
      .send({ personId: ids.deFora })).status).toBe(404);
    expect((await request(http).post(`/api/v1/people/memory-photos/${ids.foto}/pessoas`).set(auth(tokens.coord4))
      .send({ personId: ids.outra })).status).toBe(404);
    expect([403, 404]).toContain((await request(http).get(`/api/v1/people/${ids.outra}/aparece-em`)
      .set(auth(tokens.coord4))).status);
  });

  it('a cozinha não marca', async () => {
    expect((await request(http).post(`/api/v1/people/memory-photos/${ids.foto}/pessoas`).set(auth(tokens.cozinha))
      .send({ personId: ids.outra })).status).toBe(403);
  });

  it('desmarcar pede o motivo, e a marca fica no banco, retirada', async () => {
    expect((await request(http).post(`/api/v1/people/memory-tags/${ids.marca}/remover`).set(auth(tokens.tecnica))
      .send({})).status).toBe(400);
    await request(http).post(`/api/v1/people/memory-tags/${ids.marca}/remover`).set(auth(tokens.tecnica))
      .send({ motivo: 'Não é ela na foto.' }).expect(201);
    const { rows: [m] } = await admin.query(`SELECT removed_at, removed_reason FROM memory_photo_person WHERE id = $1`, [ids.marca]);
    expect(m.removed_at).not.toBeNull();
    expect(m.removed_reason).toBe('Não é ela na foto.');
    const em = await request(http).get(`/api/v1/people/${ids.outra}/aparece-em`).set(auth(tokens.tecnica)).expect(200);
    expect(em.body.find((x: any) => x.fotoId === ids.foto)).toBeUndefined();
  });
});
