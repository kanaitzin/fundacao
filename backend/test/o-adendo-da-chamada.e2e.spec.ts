/**
 * O ADENDO DA CHAMADA CONFIRMADA (fase 320, decidido pelo dono em 13/11).
 *
 * A tela dizia que a correção da chamada confirmada entrava como adendo pela equipe
 * técnica, e o adendo não existia. O que esta suíte cobra:
 *
 *  1. com a chamada aberta não há adendo: a correção é na própria marcação;
 *  2. confirmada, a técnica e a coordenação escrevem; o educador, o Gestor Geral e a
 *     coordenação de outra casa, não;
 *  3. a opção vem do tipo da chamada, o motivo tem pelo menos 10 letras, e a criança
 *     é da chamada;
 *  4. a marcação da hora não muda, e o adendo volta na chamada com quem e quando,
 *     para quem lê a chamada, inclusive o educador;
 *  5. a aplicação não escreve na tabela direto, e a auditoria tem a casa.
 *
 * A chamada nasce em 2021, fora de toda janela que as outras suítes leem: a
 * chamada confirmada não se apaga.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { ESCREVEM_ADENDO } from '../src/modules/checks/adendo.regra';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O adendo da chamada confirmada', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const adendo = (t: string, corpo: Record<string, unknown>) =>
    request(http).post(`/api/v1/checks/${ids.chamada}/adendo`).set(auth(t)).send(corpo);

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
      coord: 'coord.ai3@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev', gestor: 'gestor@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const aberta = await request(http).post('/api/v1/checks').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, kind: 'alimentacao', titulo: 'Almoço do adendo 320',
              referenceAt: '2021-03-10T12:00:00-03:00' }).expect(201);
    ids.chamada = aberta.body.id;
    const c = (await request(http).get(`/api/v1/checks/${ids.chamada}`).set(auth(tokens.educador)).expect(200)).body;
    ids.crianca = c.linhas.find((l: any) => l.ativo).acolhidoId;
    await request(http).post(`/api/v1/checks/${ids.chamada}/mark`).set(auth(tokens.educador))
      .send({ personId: ids.crianca, opcao: 'normal' }).expect(201);
    ({ rows: [{ id: ids.fora }] } = await admin.query(
      `SELECT p.id FROM person p JOIN house_stay s ON s.person_id = p.id
        WHERE s.house_id <> $1 AND s.status = 'ativa' LIMIT 1`, [ids.AI3]));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('com a chamada aberta não há adendo: a correção é na própria marcação', async () => {
    const r = await adendo(tokens.tecnica, { personId: ids.crianca, opcao: 'recusou',
      nota: 'Não almoçou, conforme a cozinha.' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/ainda está aberta/);
    await request(http).post(`/api/v1/checks/${ids.chamada}/bulk`).set(auth(tokens.educador)).send({}).expect(201);
    await request(http).post(`/api/v1/checks/${ids.chamada}/confirm`).set(auth(tokens.educador)).send({}).expect(201);
  });

  it('confirmada, quem não é técnica nem coordenação da casa não escreve', async () => {
    const corpo = { personId: ids.crianca, opcao: 'recusou', nota: 'Não almoçou, conforme a cozinha.' };
    expect((await adendo(tokens.educador, corpo)).status).toBe(403);
    expect((await adendo(tokens.gestor, corpo)).status).toBe(403);
    expect((await adendo(tokens.coord4, corpo)).status).toBe(404);
    const { rows: [{ n }] } = await admin.query(
      `SELECT count(*)::int AS n FROM check_result_addendum WHERE check_id = $1`, [ids.chamada]);
    expect(n).toBe(0);
  });

  it('a opção é do tipo da chamada, o motivo tem 10 letras e a criança é da chamada', async () => {
    const base = { personId: ids.crianca, opcao: 'recusou', nota: 'Não almoçou, conforme a cozinha.' };
    const opcao = await adendo(tokens.tecnica, { ...base, opcao: 'compareceu' });
    expect(opcao.status).toBe(400);
    expect(opcao.body.message).toMatch(/Escolha o que de fato aconteceu/);
    const curto = await adendo(tokens.tecnica, { ...base, nota: 'errado' });
    expect(curto.status).toBe(400);
    expect(curto.body.message).toMatch(/pelo menos 10 letras/);
    const fora = await adendo(tokens.tecnica, { ...base, personId: ids.fora });
    expect(fora.status).toBe(400);
    expect(fora.body.message).toMatch(/não está nesta chamada/);
    const semCrianca = await adendo(tokens.tecnica, { opcao: 'recusou', nota: base.nota });
    expect(semCrianca.status).toBe(400);
  });

  it('a técnica e a coordenação escrevem, e a marcação da hora não muda', async () => {
    const { rows: [antes] } = await admin.query(
      `SELECT option_code, recorded_by FROM check_result WHERE check_id = $1 AND person_id = $2`,
      [ids.chamada, ids.crianca]);
    const r = await adendo(tokens.tecnica, { personId: ids.crianca, opcao: 'recusou',
      nota: 'A cozinha avisou que ela não almoçou; a marcação ficou como Normal na pressa.' });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/Recusou/);
    ids.adendo = r.body.id;
    await adendo(tokens.coord, { personId: ids.crianca, opcao: 'parcial',
      nota: 'Conversei com a cozinha de novo: comeu um pouco depois, às 13h.' }).expect(201);
    const { rows: [depois] } = await admin.query(
      `SELECT option_code, recorded_by FROM check_result WHERE check_id = $1 AND person_id = $2`,
      [ids.chamada, ids.crianca]);
    expect(depois).toEqual(antes);
    const { rows: [a] } = await admin.query(
      `SELECT house_id FROM audit_event WHERE action = 'check.addendum' AND entity_id = $1`, [ids.adendo]);
    expect(a.house_id).toBe(ids.AI3);
  });

  it('o adendo volta na chamada, com quem e quando, para quem lê a chamada', async () => {
    const pelo = async (t: string) =>
      (await request(http).get(`/api/v1/checks/${ids.chamada}`).set(auth(t)).expect(200)).body;
    const doEducador = await pelo(tokens.educador);
    const linha = doEducador.linhas.find((l: any) => l.acolhidoId === ids.crianca);
    expect(linha.resultado).toBe('normal');
    expect(linha.adendos.map((x: any) => x.resultado)).toEqual(['Recusou', 'Parcial']);
    expect(linha.adendos[0].por).toBeTruthy();
    expect(linha.adendos[0].em).toBeTruthy();
    expect(doEducador.podeEscreverAdendo).toBe(false);
    expect((await pelo(tokens.tecnica)).podeEscreverAdendo).toBe(true);
    expect((await pelo(tokens.gestor)).podeEscreverAdendo).toBe(false);
    expect((await request(http).get(`/api/v1/checks/${ids.chamada}`).set(auth(tokens.coord4))).status).toBe(404);
  });

  it('a aplicação não escreve na tabela direto, e o banco repete quem escreve', async () => {
    const { rows: [t] } = await admin.query(`SELECT id FROM app_user WHERE email = 'tecnica.ai3@paodospobres.dev'`);
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE rede_app');
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [t.id]);
      await expect(admin.query(
        `INSERT INTO check_result_addendum (check_id, person_id, house_id, option_code, note, written_by)
         VALUES ($1, $2, $3, 'normal', 'escrito por fora da função', $4)`,
        [ids.chamada, ids.crianca, ids.AI3, t.id])).rejects.toThrow(/permission denied/);
    } finally { await admin.query('ROLLBACK'); }
    const { rows: [f] } = await admin.query(
      `SELECT prosrc FROM pg_proc WHERE proname = 'app_adendo_da_chamada'`);
    const doBanco = [...f.prosrc.match(/NOT IN \(([^)]*)\)/)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(doBanco.sort()).toEqual([...ESCREVEM_ADENDO].sort());
  });
});
