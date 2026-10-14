/**
 * O LAUDO JUNTO DA ALERGIA (fase 217, pedido de 14/10).
 *
 * "A restrição alimentar e o remédio poderiam ter em anexo a receita médica,
 * não só o registro à mão." O que esta suíte cobra:
 *
 *  1. a Enfermagem anexa o laudo à alergia, e o perfil o traz junto dela;
 *  2. a receita da restrição alimentar também, e o educador a vê no perfil;
 *  3. o laudo vai para a pasta da saúde, de um registro só, e da mesma criança;
 *  4. a ligação não se reescreve depois;
 *  5. a outra casa não põe documento no dossiê desta criança. A política de
 *     INSERT do `document` não conferia a casa; quem recusava era o
 *     `RETURNING`, que passa a linha nova pela política de leitura. Hoje a
 *     própria política confere, e este teste cobra o efeito.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');

describe('O laudo junto da alergia', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const anexar = (t: string, personId: string, corpo: any) =>
    request(http).post(`/api/v1/people/${personId}/documents`).set(auth(t))
      .send({ categoria: 'saude', nomeArquivo: 'laudo.pdf', conteudo: PDF, ...corpo });

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
      enfermagem: 'enfermagem@paodospobres.dev', educador: 'educador.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa' ORDER BY person_id LIMIT 2`,
      [ids.AI3]);
    ids.crianca = rows[0].person_id;
    ids.outra = rows[1].person_id;
    const cond = await request(http).post(`/api/v1/people/${ids.crianca}/health-conditions`)
      .set(auth(tokens.enfermagem))
      .send({ tipo: 'alergia', descricao: 'Castanha da conferência 217', gravidade: 'grave' }).expect(201);
    ids.condicao = cond.body.id;
    const rest = await request(http).post(`/api/v1/people/${ids.crianca}/food-restrictions`)
      .set(auth(tokens.enfermagem)).send({ restricao: 'Leite da conferência 217' }).expect(201);
    ids.restricao = rest.body.id;
  });

  afterAll(async () => {
    // Nada se apaga: os registros de teste são encerrados, como na casa.
    await request(http).post(`/api/v1/people/health-conditions/${ids.condicao}/end`)
      .set(auth(tokens.enfermagem)).send({ motivo: 'Fim da conferência 217.' });
    await request(http).post(`/api/v1/people/food-restrictions/${ids.restricao}/end`)
      .set(auth(tokens.enfermagem)).send({ motivo: 'Fim da conferência 217.' });
    await app.close(); await admin.end();
  });

  it('a Enfermagem anexa o laudo à alergia, e o perfil o traz junto dela', async () => {
    const r = await anexar(tokens.enfermagem, ids.crianca, { titulo: 'Laudo médico', condicaoId: ids.condicao });
    expect(r.status).toBe(201);
    ids.laudo = r.body.id;
    const perfil = await request(http).get(`/api/v1/people/${ids.crianca}`).set(auth(tokens.coord)).expect(200);
    const c = perfil.body.condicoesSaude.find((x: any) => x.id === ids.condicao);
    expect(c.documentos).toEqual([expect.objectContaining({ id: ids.laudo, titulo: 'Laudo médico', conferido: false })]);
    const dossie = await request(http).get(`/api/v1/people/${ids.crianca}/dossie`).set(auth(tokens.coord)).expect(200);
    expect(dossie.body.avulsos.find((d: any) => d.id === ids.laudo).condicaoId).toBe(ids.condicao);
  });

  it('a receita da restrição também, e o educador a vê no perfil', async () => {
    const r = await anexar(tokens.enfermagem, ids.crianca, { titulo: 'Receita médica', restricaoId: ids.restricao });
    expect(r.status).toBe(201);
    const perfil = await request(http).get(`/api/v1/people/${ids.crianca}`).set(auth(tokens.educador)).expect(200);
    const f = perfil.body.restricoesAlimentares.find((x: any) => x.id === ids.restricao);
    expect(f.documentos.map((d: any) => d.id)).toEqual([r.body.id]);
  });

  it('o laudo vai para a pasta da saúde, de um registro só, e da mesma criança', async () => {
    expect((await anexar(tokens.coord, ids.crianca,
      { titulo: 'Laudo médico', categoria: 'pessoal', condicaoId: ids.condicao })).status).toBe(400);
    expect((await anexar(tokens.coord, ids.crianca,
      { titulo: 'Laudo médico', condicaoId: ids.condicao, restricaoId: ids.restricao })).status).toBe(400);
    const deOutra = await anexar(tokens.coord, ids.outra, { titulo: 'Laudo médico', condicaoId: ids.condicao });
    expect(deOutra.status).toBe(400);
    expect(deOutra.body.message).toMatch(/não é desta criança/);
  });

  it('a ligação não se reescreve depois', async () => {
    await expect(admin.query(`UPDATE document SET health_condition_id = NULL WHERE id = $1`, [ids.laudo]))
      .rejects.toThrow(/registro_de_saude_nao_muda/);
  });

  it('a outra casa não põe documento no dossiê desta criança', async () => {
    const { rows: [{ n: antes }] } = await admin.query(
      `SELECT count(*)::int AS n FROM document WHERE person_id = $1`, [ids.crianca]);
    const r = await anexar(tokens.coord4, ids.crianca, { titulo: 'Laudo médico' });
    expect([403, 404]).toContain(r.status);
    const { rows: [{ n: depois }] } = await admin.query(
      `SELECT count(*)::int AS n FROM document WHERE person_id = $1`, [ids.crianca]);
    expect(depois).toBe(antes);
  });
});
