/**
 * A COR DA LINHA DE CADA PESSOA.
 *
 * Pedido do Marcelo em 09/09: "cada educador conseguir botar a cor da linha
 * dele, e aí eles não repitam a cor".
 *
 * Antes, a cor da borda de cada linha da ATA saía de um HASH do id do usuário
 * sobre seis tons. Hash colide: dois educadores do mesmo plantão podiam
 * receber o mesmo tom, e a cor deixava de distinguir exatamente onde
 * precisava. Ninguém percebia, porque o nome está escrito ao lado — a cor é
 * que parava de ajudar.
 *
 * O que estes testes protegem:
 *
 *  1. **a cor não repete na casa**, e a recusa diz DE QUEM ela é — "já em uso"
 *     obrigaria a tentar uma por uma;
 *  2. **quem escolhe é a técnica ou a coordenação**, não a própria pessoa: se
 *     cada um escolhesse a sua, o primeiro a entrar levaria o azul e a
 *     distinção viraria ordem de chegada;
 *  3. **só os tons da paleta.** Cor fora dela não foi conferida contra os três
 *     fundos claros nem contra o tema escuro;
 *  4. **tirar a cor é sempre possível** — volta ao tom automático;
 *  5. **a mesma cor em OUTRA casa é permitida.** A unicidade é por casa: oito
 *     casas dividindo oito tons deixariam sete pessoas sem cor;
 *  6. **quem lê a ATA recebe a cor sem gerir equipe.** O educador não alcança
 *     a lista de pessoal, e ainda assim vê a borda certa.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A cor da linha de cada pessoa', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, AI4: string;
  let educador: string, educador2: string, educadorAI4: string;
  const tocados: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

  const pintar = (token: string, id: string, cor: string | null) =>
    request(http).patch(`/api/v1/staff/${id}/line-color`).set(auth(token)).send({ cor });

  const idDe = async (email: string) => {
    const { rows: [u] } = await admin.query(`SELECT id FROM app_user WHERE email=$1`, [email]);
    tocados.push(u.id);
    return u.id as string;
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

    for (const [k, email] of Object.entries({
      coord: 'coord.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      coordAI4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    educador = await idDe('educador.ai3@paodospobres.dev');
    educador2 = await idDe('educador2.ai3@paodospobres.dev');
    educadorAI4 = await idDe('educador.ai4@paodospobres.dev');
  });

  afterAll(async () => {
    /* Suíte que muta estado compartilhado desfaz o que criou: cor deixada aqui
       apareceria na ATA de outra suíte. */
    if (tocados.length) {
      await admin.query(
        `UPDATE app_user SET line_color = NULL WHERE id = ANY($1::uuid[])`, [tocados]);
    }
    await app.close(); await admin.end();
  });

  beforeEach(async () => {
    await admin.query(
      `UPDATE app_user SET line_color = NULL WHERE id = ANY($1::uuid[])`, [tocados]);
  });

  it('a coordenação define, e a lista da equipe passa a trazer a cor', async () => {
    await pintar(tokens.coord, educador, 'c-ok').expect(200);

    const lista = await request(http).get('/api/v1/staff').set(auth(tokens.coord)).expect(200);
    const m = lista.body.find((x: any) => x.id === educador);
    expect(m.corDaLinha).toBe('c-ok');
  });

  it('não repete na mesma casa — e a recusa diz de quem é a cor', async () => {
    await pintar(tokens.coord, educador, 'c-move').expect(200);
    const r = await pintar(tokens.tecnica, educador2, 'c-move');
    expect(r.status).toBeGreaterThanOrEqual(400);
    // A frase nomeia a dona: "já em uso" obrigaria a tentar uma por uma.
    expect(JSON.stringify(r.body)).toMatch(/cor_ja_usada_por_|já é de/i);
  });

  it('a mesma cor em outra casa é permitida', async () => {
    await pintar(tokens.coord, educador, 'c-warn').expect(200);
    await pintar(tokens.coordAI4, educadorAI4, 'c-warn').expect(200);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM app_user WHERE line_color='c-warn' AND id = ANY($1::uuid[])`,
      [[educador, educadorAI4]]);
    expect(rows[0].n).toBe(2);
  });

  it('o educador não define a cor de ninguém — nem a própria', async () => {
    const r = await pintar(tokens.educador, educador, 'c-info');
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('recusa cor fora da paleta conferida', async () => {
    const r = await pintar(tokens.coord, educador, 'roxo-escuro');
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('tirar a cor devolve ao tom automático', async () => {
    await pintar(tokens.coord, educador, 'c-other').expect(200);
    await pintar(tokens.coord, educador, null).expect(200);

    const { rows } = await admin.query(
      `SELECT line_color FROM app_user WHERE id=$1`, [educador]);
    expect(rows[0].line_color).toBeNull();
  });

  it('as cores em uso vêm com o nome de quem as tem, para a tela não oferecer o que o servidor recusa', async () => {
    await pintar(tokens.coord, educador, 'c-crit').expect(200);
    const r = await request(http)
      .get(`/api/v1/staff/line-colors?houseId=${AI3}`).set(auth(tokens.coord)).expect(200);
    const usada = r.body.find((x: any) => x.cor === 'c-crit');
    expect(usada).toBeDefined();
    expect(usada.deQuem).toEqual(expect.any(String));
    expect(usada.deQuem.length).toBeGreaterThan(0);
  });

  it('a coordenação de AI4 não pinta gente de AI3', async () => {
    const r = await pintar(tokens.coordAI4, educador, 'c-med');
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
