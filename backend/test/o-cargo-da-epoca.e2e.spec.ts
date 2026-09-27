/**
 * O CARGO DA ÉPOCA (fase 165).
 *
 * Pedido de 25/09: *"quando um funcionário trocar de cargo, registros antigos
 * devem continuar indicando corretamente qual era sua função naquele momento.
 * Teste mudança de Educador para Líder."*
 *
 * Até aqui o cargo ao lado de uma linha da ATA era o de HOJE
 * (`app_user_cargo`): a educadora promovida aparecia como Líder Diurno em tudo
 * o que escreveu como educadora. Esta suíte faz o percurso inteiro pelas rotas
 * de verdade: a coordenação cadastra, a pessoa escreve, a coordenação promove,
 * a pessoa escreve de novo, e OUTRA pessoa lê a ATA.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O cargo da época', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string, senha = SENHA) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: senha });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
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

    tokens.coord = await login('coord.ai4@paodospobres.dev');
    tokens.leitora = await login('educador.ai4@paodospobres.dev');
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));

    const nova = await request(http).post('/api/v1/staff').set(auth(tokens.coord)).send({
      nome: 'Rosana Promovida (fictícia)',
      email: `rosana.promovida.${Date.now()}@paodospobres.dev`,
      cargo: 'educador', casaId: ids.AI4, senhaInicial: 'senha-da-rosana',
    });
    expect(nova.status).toBe(201);
    ids.rosana = nova.body.id;
    const { rows: [u] } = await admin.query(`SELECT email FROM app_user WHERE id = $1`, [ids.rosana]);
    tokens.rosana = await login(u.email, 'senha-da-rosana');

    /* Oito dias atrás: nenhuma outra suíte abre plantão neste dia, e a ATA
       recusa DELETE (lição da 145). */
    const dia = (await admin.query(`SELECT (app_hoje()-8)::text AS d`)).rows[0].d;
    const aberto = await request(http).post('/api/v1/shifts').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, data: dia, turno: 'diurno' });
    ids.plantao = aberto.body.plantaoId;
    ids.ata = aberto.body.ataId;
  });

  afterAll(async () => {
    /* Quem foi cadastrado aqui sai do quadro ativo, como sairia de verdade:
       desativado, e não apagado. */
    await request(http).post(`/api/v1/staff/${ids.rosana}/deactivate`).set(auth(tokens.coord))
      .send({ motivo: 'Cadastro fictício da suíte do cargo da época.' });
    await app.close(); await admin.end();
  });

  const escrever = (token: string, texto: string) =>
    request(http).post(`/api/v1/shifts/ata/${ids.ata}/notes`).set(auth(token)).send({ texto });

  const linhaDe = async (trecho: RegExp) => {
    const p = (await request(http).get(`/api/v1/shifts/${ids.plantao}`).set(auth(tokens.leitora))).body;
    return p.linhas.notas.find((n: any) => trecho.test(n.texto));
  };

  it('a linha escrita como EDUCADORA continua dizendo educadora depois da promoção', async () => {
    expect((await escrever(tokens.rosana,
      'Acompanhei o almoço; a Lara comeu bem e pediu repetição (fictício).')).status).toBe(201);

    const promovida = await request(http).patch(`/api/v1/staff/${ids.rosana}`)
      .set(auth(tokens.coord)).send({ cargo: 'lider_diurno' });
    expect(promovida.status).toBe(200);

    /* O token antigo carrega o cargo antigo: ela entra de novo, como faria. */
    const { rows: [u] } = await admin.query(`SELECT email FROM app_user WHERE id = $1`, [ids.rosana]);
    tokens.rosana = await login(u.email, 'senha-da-rosana');
    expect((await escrever(tokens.rosana,
      'Conferi a passagem com a equipe da tarde; nada pendente (fictício).')).status).toBe(201);

    /* Lida por OUTRA pessoa (lição da 152): quem escreve sempre vê o próprio. */
    expect((await linhaDe(/Acompanhei o almoço/)).cargo).toBe('educador');
    expect((await linhaDe(/Conferi a passagem/)).cargo).toBe('lider_diurno');
  });

  it('a troca fica no histórico, com quem trocou, e o período anterior é fechado', async () => {
    const { rows } = await admin.query(
      `SELECT role::text, to_at IS NOT NULL AS fechado, changed_by
         FROM app_user_role_period WHERE user_id = $1 ORDER BY from_at`, [ids.rosana]);
    expect(rows.map((r) => r.role)).toEqual(['educador', 'lider_diurno']);
    expect(rows[0].fechado).toBe(true);
    expect(rows[1].fechado).toBe(false);
    const { rows: [coord] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'coord.ai4@paodospobres.dev'`);
    expect(rows[1].changed_by).toBe(coord.id);
  });

  it('a escala de um dia passado mostra o cargo daquele dia, e a de amanhã o de hoje', async () => {
    const { rows: [r] } = await admin.query(
      `SELECT app_user_cargo_em($1, now() - interval '1 day') AS ontem,
              app_user_cargo_em($1, now() + interval '1 day') AS amanha`, [ids.rosana]);
    expect(r).toEqual({ ontem: 'educador', amanha: 'lider_diurno' });
  });

  it('quem não trocou de cargo continua com o de sempre, em qualquer data', async () => {
    const { rows: [r] } = await admin.query(
      `SELECT app_user_cargo_em(id, '2020-01-01') AS antes, role::text AS hoje
         FROM app_user WHERE email = 'coord.ai4@paodospobres.dev'`);
    expect(r.antes).toBe(r.hoje);
  });
});
