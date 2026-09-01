/**
 * OS DADOS DESCRITIVOS DO PERFIL (§6.4) — a rota que existia sem porta.
 *
 * `PATCH /people/:id` está no servidor desde a fase 2, com regra de cargo e
 * RLS, e nunca teve tela. O perfil MOSTRAVA cuidados essenciais, escola e
 * equipe de referência — e ninguém, em cargo nenhum, conseguia escrever neles.
 *
 * E, quando a porta se abriu, apareceu o que ela abriria junto: até 01/09/2026
 * a atualização SOBRESCREVIA. O bloco "cuidados essenciais" é o que a educadora
 * lê antes de dar banho, antes de deixar sozinha, antes de servir o prato — e
 * reescrevê-lo às 23h por cima do que a Enfermagem orientou apagava uma
 * instrução de proteção sem deixar rastro, porque a auditoria guarda o NOME do
 * campo alterado e nunca o conteúdo (§20).
 *
 * O que este teste guarda:
 *
 *  * o educador NÃO altera dado estrutural — e a recusa vem do banco também;
 *  * toda alteração deixa o valor ANTERIOR, legível por quem cuida (inclusive
 *    pelo educador, que é quem vai agir sobre o texto novo);
 *  * campo que não mudou não vira linha;
 *  * o histórico não se altera nem se apaga, nem pelo administrador;
 *  * fora de escopo é 404 igual a inexistente, e não 403 (§23).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Os dados descritivos do perfil', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const atualizar = (token: string, corpo: any, quem = ids.crianca) =>
    request(http).patch(`/api/v1/people/${quem}`).set(auth(token)).send(corpo);
  const historico = async (token: string) =>
    (await request(http).get(`/api/v1/people/${ids.crianca}/detalhe-historico`)
      .set(auth(token))).body;

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
      educador: 'educador.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      coordAi4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));

    // Fixture PRÓPRIO: reescrever o cuidado essencial de uma criança do seed
    // mudaria o que outras suítes leem. Esta nasce aqui e sai no fim.
    const nasce = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: ids.AI3, fullName: 'Nara Fictícia de Oliveira', socialName: 'Nara',
              birthDate: '2016-09-02',
              provisionalReason: 'Ingresso de teste automatizado — dados fictícios' });
    expect(nasce.status).toBe(201);
    ids.crianca = nasce.body.personId;
  });

  afterAll(async () => {
    await request(http).post(`/api/v1/people/${ids.crianca}/discharge`)
      .set(auth(tokens.coord)).send({ motivo: 'Encerramento de fixture de teste' });
    await app.close(); await admin.end();
  });

  // ==================== Quem altera ====================

  it('o educador não altera dado estrutural — nem pela API, nem no banco', async () => {
    const res = await atualizar(tokens.educador, { cuidadosEssenciais: 'Texto do educador.' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/educador/i);

    // A segunda camada: a política do banco recusa a chamada direta ao comando.
    const { rows: [u] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'educador.ai3@paodospobres.dev'`);
    const c = new Client({ connectionString: adminUrl });
    await c.connect();
    await c.query('BEGIN');
    await c.query(`SET LOCAL ROLE rede_app`);
    await c.query(`SELECT set_config('app.user_id', $1, true)`, [u.id]);
    await expect(c.query(
      `SELECT * FROM app_atualizar_detalhe_perfil($1, '{"notes":"pela porta dos fundos"}'::jsonb)`,
      [ids.crianca])).rejects.toThrow();
    await c.query('ROLLBACK');
    await c.end();
  });

  it('fora de escopo responde 404, e não 403', async () => {
    // 403 confirmaria que a criança existe em outra casa (§23).
    const res = await atualizar(tokens.coordAi4, { escolaSerie: '3º ano' });
    expect(res.status).toBe(404);
  });

  // ==================== O que fica registrado ====================

  it('atualiza, e guarda o que estava escrito antes', async () => {
    const res = await atualizar(tokens.tecnica, {
      cuidadosEssenciais: 'Usa aparelho auditivo do lado direito; avisar antes de encostar.',
      escolaNome: 'EMEF Fictícia do Bairro',
      escolaSerie: '4º ano',
      equipeReferencia: 'CRAS fictício — técnica de referência Joana.',
    });
    expect(res.status).toBe(200);
    expect(res.body.alterado).toBe(4);
    expect(res.body.aviso).toMatch(/continua registrado/i);

    const { rows: [d] } = await admin.query(
      `SELECT essential_care, school_name, version FROM profile_detail WHERE person_id = $1`,
      [ids.crianca]);
    expect(d.essential_care).toMatch(/aparelho auditivo/);
    expect(d.school_name).toBe('EMEF Fictícia do Bairro');
    expect(d.version).toBeGreaterThan(1);

    const hist = await historico(tokens.tecnica);
    expect(hist).toHaveLength(4);
    const cuidado = hist.find((h: any) => h.campo === 'Cuidados essenciais');
    expect(cuidado.antes).toBeNull();          // o fixture nasceu sem
    expect(cuidado.depois).toMatch(/aparelho auditivo/);
    expect(cuidado.por).toBeTruthy();
  });

  it('a segunda escrita guarda o texto da primeira — não o apaga', async () => {
    const antes = 'Usa aparelho auditivo do lado direito; avisar antes de encostar.';
    const res = await atualizar(tokens.coord, {
      cuidadosEssenciais: 'Aparelho auditivo à direita. Engasga com alimento em pedaço: '
        + 'comida cortada pequena.',
    });
    expect(res.status).toBe(200);
    expect(res.body.alterado).toBe(1);

    const hist = await historico(tokens.coord);
    const ultima = hist[0];
    expect(ultima.campo).toBe('Cuidados essenciais');
    expect(ultima.antes).toBe(antes);
    expect(ultima.depois).toMatch(/comida cortada pequena/);
  });

  it('quem CUIDA da criança lê o histórico — não é área restrita', async () => {
    const hist = await historico(tokens.educador);
    expect(hist.length).toBe(5);
    expect(hist[0].antes).toBeTruthy();
  });

  it('campo que não mudou não vira linha', async () => {
    const res = await atualizar(tokens.tecnica, { escolaSerie: '4º ano' });
    expect(res.status).toBe(200);
    expect(res.body.alterado).toBe(0);
    expect(res.body.aviso).toMatch(/nada mudou/i);
    expect(await historico(tokens.tecnica)).toHaveLength(5);
  });

  it('as observações só vão para quem pode escrevê-las', async () => {
    await atualizar(tokens.tecnica, { observacoes: 'Anotação da equipe técnica.' });

    const daTecnica = await request(http).get(`/api/v1/people/${ids.crianca}`)
      .set(auth(tokens.tecnica));
    expect(daTecnica.body.observacoes).toBe('Anotação da equipe técnica.');

    const doEducador = await request(http).get(`/api/v1/people/${ids.crianca}`)
      .set(auth(tokens.educador));
    expect(doEducador.status).toBe(200);
    expect(doEducador.body.observacoes).toBeUndefined();
  });

  it('o histórico não se altera nem se apaga — nem pelo administrador', async () => {
    await expect(admin.query(
      `UPDATE profile_detail_change SET after_value = 'reescrito' WHERE person_id = $1`,
      [ids.crianca])).rejects.toThrow();
    await expect(admin.query(
      `DELETE FROM profile_detail_change WHERE person_id = $1`,
      [ids.crianca])).rejects.toThrow();
  });
});
