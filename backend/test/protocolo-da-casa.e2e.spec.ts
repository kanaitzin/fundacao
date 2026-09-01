/**
 * QUEM PODE DAR REMÉDIO NESTA CASA (§11.3, pendência institucional 33.4.1).
 *
 * `POST /medications/protocol` existia desde a fase 4 e nunca teve tela. A
 * Saúde LIA o protocolo e desenhava, em cada período, a tarja "Sem definição"
 * — sem nenhum botão que definisse. A autorização NOMINAL de um educador tinha
 * formulário; a regra que fica POR CIMA dela, não.
 *
 * O que este teste guarda:
 *
 *  * só a coordenação define, e só a da PRÓPRIA casa (a 0820 corrigiu isso nas
 *    policies; aqui a recusa é conferida pela porta);
 *  * o motivo é obrigatório — "quem pode dar remédio" é decisão da instituição,
 *    e uma decisão sem a linha que a explica não se revê;
 *  * cada decisão guarda o que valia ANTES, e `null` no antes significa "não
 *    havia definição, valia somente Enfermagem" — diferente de uma decisão que
 *    negava;
 *  * um período não fica sem ninguém: a dose venceria todo dia sem que
 *    existisse quem a confirmasse;
 *  * quem alcança a casa LÊ o histórico, inclusive o educador — é ele quem vai,
 *    ou não vai, dar o remédio;
 *  * e o histórico não se altera nem se apaga.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O protocolo de administração da casa', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const definir = (token: string, corpo: any) =>
    request(http).post('/api/v1/medications/protocol').set(auth(token)).send(corpo);
  /*
   * O histórico é DA CASA, e outras suítes definem o protocolo DIURNO da Casa
   * 03. Contar a lista inteira faria esta suíte passar sozinha e falhar
   * conforme a ordem em que ela roda — que é exatamente a contaminação que a
   * fase 11 já custou caro. Este fixture é o turno NOTURNO, e é só ele que se
   * conta aqui.
   */
  const historico = async (token: string, houseId = ids.AI3) => {
    const { body } = await request(http)
      .get(`/api/v1/medications/protocol-history?houseId=${houseId}`).set(auth(token));
    return (body as any[]).filter((d) => d.periodo === 'noturno');
  };
  const vigente = async (token: string) =>
    (await request(http).get(`/api/v1/medications/protocol?houseId=${ids.AI3}`)
      .set(auth(token))).body;

  const MOTIVO = 'Reunião da coordenação com a Enfermagem em 28/08: educadores capacitados '
    + 'na administração por via oral passam a poder administrar no turno noturno.';

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
      enfermagem: 'enfermagem@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      coordAi4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
  });

  afterAll(async () => {
    // Suíte que muta estado compartilhado desfaz o que criou: o protocolo do
    // turno noturno da Casa 03 é lido por outras suítes.
    await admin.query(
      `DELETE FROM medication_protocol WHERE house_id = $1 AND period = 'noturno'`, [ids.AI3]);
    await app.close(); await admin.end();
  });

  // ==================== Quem decide ====================

  it('o educador e a Enfermagem não definem o protocolo', async () => {
    for (const quem of ['educador', 'enfermagem']) {
      const res = await definir(tokens[quem],
        { houseId: ids.AI3, periodo: 'noturno', enfermagem: true,
          educadorAutorizado: true, motivo: MOTIVO });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/coordenação/i);
    }
  });

  it('a coordenação de OUTRA casa não define o protocolo desta', async () => {
    const res = await definir(tokens.coordAi4,
      { houseId: ids.AI3, periodo: 'noturno', enfermagem: true,
        educadorAutorizado: true, motivo: MOTIVO });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/DESTA casa/i);
    expect(await historico(tokens.coord)).toHaveLength(0);
  });

  // ==================== O que a decisão exige ====================

  it('o motivo é obrigatório, e uma palavra não basta', async () => {
    const sem = await definir(tokens.coord,
      { houseId: ids.AI3, periodo: 'noturno', enfermagem: true, educadorAutorizado: true });
    expect(sem.status).toBe(400);
    expect(sem.body.message).toMatch(/sob qual decisão/i);

    const curto = await definir(tokens.coord,
      { houseId: ids.AI3, periodo: 'noturno', enfermagem: true,
        educadorAutorizado: true, motivo: 'combinado' });
    expect(curto.status).toBe(400);
  });

  it('um período não fica sem ninguém que possa administrar', async () => {
    const res = await definir(tokens.coord,
      { houseId: ids.AI3, periodo: 'noturno', enfermagem: false,
        educadorAutorizado: false, motivo: MOTIVO });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/vence/i);
  });

  // ==================== A decisão, e o que valia antes ====================

  it('define, e registra que ANTES não havia definição', async () => {
    const res = await definir(tokens.coord,
      { houseId: ids.AI3, periodo: 'noturno', enfermagem: true,
        educadorAutorizado: true, motivo: MOTIVO });
    expect(res.status).toBe(201);
    expect(res.body.aviso).toMatch(/continua registrado/i);

    const p = await vigente(tokens.coord);
    const noturno = p.periodos.find((x: any) => x.periodo === 'noturno');
    expect(noturno.educadorAutorizado).toBe(true);
    expect(noturno.definidoEm).toBeTruthy();
    expect(noturno.nota).toMatch(/28\/08/);

    const hist = await historico(tokens.coord);
    expect(hist).toHaveLength(1);
    // `null`, e não `{enfermagem:false,...}`: não havia decisão nenhuma, e a
    // tela precisa saber dizer a diferença.
    expect(hist[0].antes).toBeNull();
    expect(hist[0].depois).toEqual({ enfermagem: true, educadorAutorizado: true });
    expect(hist[0].motivo).toMatch(/capacitados/);
    expect(hist[0].por).toBeTruthy();
  });

  it('a decisão seguinte guarda a anterior — inclusive quando ela é revogada', async () => {
    const res = await definir(tokens.coord,
      { houseId: ids.AI3, periodo: 'noturno', enfermagem: true, educadorAutorizado: false,
        motivo: 'Suspenso a partir de hoje: a capacitação venceu e a reciclagem está marcada '
          + 'para outubro.' });
    expect(res.status).toBe(201);

    const hist = await historico(tokens.coord);
    expect(hist).toHaveLength(2);
    expect(hist[0].antes).toEqual({ enfermagem: true, educadorAutorizado: true });
    expect(hist[0].depois).toEqual({ enfermagem: true, educadorAutorizado: false });
    expect(hist[0].motivo).toMatch(/reciclagem/);
  });

  it('quem alcança a casa LÊ o histórico — o educador e a Enfermagem', async () => {
    for (const quem of ['educador', 'enfermagem']) {
      const hist = await historico(tokens[quem]);
      expect(hist).toHaveLength(2);
      expect(hist[0].motivo).toBeTruthy();
    }
  });

  it('a coordenação de outra casa não lê o histórico desta', async () => {
    expect(await historico(tokens.coordAi4)).toHaveLength(0);
  });

  it('o histórico não se altera nem se apaga — nem pelo administrador', async () => {
    await expect(admin.query(
      `UPDATE medication_protocol_change SET reason = 'reescrito' WHERE house_id = $1`,
      [ids.AI3])).rejects.toThrow();
    await expect(admin.query(
      `DELETE FROM medication_protocol_change WHERE house_id = $1`,
      [ids.AI3])).rejects.toThrow();
  });
});
