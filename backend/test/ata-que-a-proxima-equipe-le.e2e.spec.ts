/**
 * A ATA QUE A PRÓXIMA EQUIPE LÊ (§12.5, migração 0970).
 *
 * Pedido do Marcelo em 08/09/2026: "todos leem a ATA do turno anterior, para
 * saber se tudo ocorreu bem e as informações necessárias para o dia — tipo, 'a
 * Maria não dormiu bem, fez xixi à noite'. Não se trata de exposição: é uma
 * informação que vai afetar o dia da criança."
 *
 * O que esta suíte guarda:
 *
 *  * cada linha da ATA tem AUTOR, e é imutável — corrigir é escrever outra;
 *  * a linha RESTRITA é fechada no BANCO, e não na tela: o educador não a lê
 *    nem consultando com a identidade dele;
 *  * quem não a lê vê a CONTAGEM, e não o silêncio (precedente do §13.7);
 *  * quem não pode LER uma linha restrita também não pode ESCREVER uma;
 *  * e o "turno anterior" é o último plantão que COMEÇOU antes deste — não
 *    "ontem", que erraria toda manhã e toda noite.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A ATA que a próxima equipe lê', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const escrever = (token: string, corpo: any) =>
    request(http).post(`/api/v1/shifts/ata/${ids.ata}/notes`).set(auth(token)).send(corpo);
  const abrir = async (token: string) =>
    (await request(http).get(`/api/v1/shifts/${ids.plantao}`).set(auth(token))).body;

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
      // Casa 04, pelo mesmo motivo das outras suítes recentes (regra 13).
      educador: 'educador.ai4@paodospobres.dev',
      coord: 'coord.ai4@paodospobres.dev',
      coordDeFora: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));

    // Um plantão só desta suíte, quatro dias atrás: as outras disputam hoje.
    const dia = (await admin.query(`SELECT (app_hoje()-4)::text AS d`)).rows[0].d;
    const aberto = await request(http).post('/api/v1/shifts').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, data: dia, turno: 'noturno' });
    ids.plantao = aberto.body.plantaoId;
    ids.ata = aberto.body.ataId;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== A linha com autor ====================

  it('a linha nasce com o nome de quem escreveu, e o educador escreve', async () => {
    const r = await escrever(tokens.educador, {
      texto: 'A Maria não dormiu bem e fez xixi à noite; troquei a roupa de cama às 4h.',
    });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/não é reescrita/i);

    const p = await abrir(tokens.educador);
    const minha = p.linhas.notas.find((n: any) => /não dormiu bem/.test(n.texto));
    expect(minha.quem).toBeTruthy();
    expect(minha.propria).toBe(true);
    expect(minha.restrita).toBe(false);
  });

  it('linha vazia não se registra', async () => {
    const r = await escrever(tokens.educador, { texto: '  ' });
    expect(r.status).toBe(400);
  });

  it('a linha não se reescreve nem se apaga — nem pelo dono do banco', async () => {
    const { rows: [n] } = await admin.query(
      `SELECT id FROM ata_note WHERE ata_id = $1 LIMIT 1`, [ids.ata]);
    await expect(admin.query(
      `UPDATE ata_note SET body = 'outra coisa' WHERE id = $1`, [n.id])).rejects.toThrow();
    await expect(admin.query(
      `DELETE FROM ata_note WHERE id = $1`, [n.id])).rejects.toThrow();
  });

  // ==================== A linha restrita ====================

  it('o educador NÃO escreve linha restrita — ele não poderia relê-la', async () => {
    const r = await escrever(tokens.educador, {
      texto: 'Tentativa de linha restrita pelo educador.', restrita: true,
    });
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/relê-la|coordenação/i);
  });

  it('a coordenação escreve a linha restrita, e o educador não a lê', async () => {
    const r = await escrever(tokens.coord, {
      texto: 'A visita da genitora foi remarcada pela Vara; a técnica conversa antes de contar.',
      restrita: true,
    });
    expect(r.status).toBe(201);

    const daCoord = await abrir(tokens.coord);
    expect(daCoord.linhas.notas.some((n: any) => /remarcada pela Vara/.test(n.texto))).toBe(true);

    const doEducador = await abrir(tokens.educador);
    expect(doEducador.linhas.notas.some((n: any) => /remarcada pela Vara/.test(n.texto))).toBe(false);
    // Mas ele SABE que existe: contagem, e nada além dela (§13.7).
    expect(doEducador.linhas.restritas).toBe(1);
    expect(doEducador.linhas.restritasOcultas).toBe(1);
    expect(doEducador.linhas.podeEscreverRestrita).toBe(false);
  });

  it('a restrição é do BANCO: nem consultando direto o educador a lê', async () => {
    /*
     * A prova precisa ser na identidade dele, e não pela rota — se a política
     * dependesse da tela, a primeira tela nova mostraria tudo. É a mesma prova
     * que a 0760 exigiu da ATA Geral.
     */
    const appUrl = process.env.DATABASE_APP_URL
      ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher';
    const { rows: [u] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai4@paodospobres.dev'`);
    const cliente = new Client({ connectionString: appUrl });
    await cliente.connect();
    try {
      await cliente.query(`SELECT set_config('app.user_id', $1, false)`, [u.id]);
      const { rows } = await cliente.query(
        `SELECT body FROM ata_note WHERE ata_id = $1 AND restricted`, [ids.ata]);
      expect(rows).toHaveLength(0);
    } finally {
      await cliente.end();
    }
  });

  it('a casa de fora não lê linha nenhuma', async () => {
    const r = await request(http).get(`/api/v1/shifts/${ids.plantao}`)
      .set(auth(tokens.coordDeFora));
    // Fora de escopo é 404 idêntico a inexistente: não vaza a existência.
    expect([403, 404]).toContain(r.status);
  });

  // ==================== O turno anterior ====================

  it('o turno anterior é o último que COMEÇOU antes deste, e toda a equipe o lê', async () => {
    const r = await request(http).get(`/api/v1/shifts/anterior?houseId=${ids.AI4}`)
      .set(auth(tokens.educador));
    expect(r.status).toBe(200);
    expect(r.body.existe).toBe(true);
    expect(r.body.linhas).toBeTruthy();

    // O anterior é sempre mais antigo que agora — nunca um plantão futuro.
    const { rows: [{ agora }] } = await admin.query(`SELECT now() AS agora`);
    const inicio = new Date(`${String(r.body.data).slice(0, 10)}T${r.body.turno === 'diurno' ? '07' : '19'}:00:00-03:00`);
    expect(inicio.getTime()).toBeLessThan(new Date(agora).getTime());
  });

  it('a casa sem plantão anterior recebe a frase, e não um erro', async () => {
    /*
     * Casa recém-cadastrada: a resposta honesta é "ainda não há", com a frase
     * que explica o que vai aparecer ali — e não uma lista vazia, que se lê
     * como defeito.
     */
    const { rows: [{ id: nova }] } = await admin.query(
      `INSERT INTO house (institution_id, code, name, kind)
       SELECT institution_id, 'TMP1', 'Casa temporária da suíte', kind FROM house WHERE code='AI4'
       RETURNING id`);
    try {
      const { rows: [{ id: gestor }] } = await admin.query(
        `SELECT id FROM app_user WHERE email='gestor@paodospobres.dev'`);
      expect(gestor).toBeTruthy();
      const token = await login('gestor@paodospobres.dev');
      const r = await request(http).get(`/api/v1/shifts/anterior?houseId=${nova}`)
        .set(auth(token));
      expect(r.status).toBe(200);
      expect(r.body.existe).toBe(false);
      expect(r.body.aviso).toMatch(/ainda não há/i);
    } finally {
      await admin.query(`DELETE FROM house WHERE id = $1`, [nova]);
    }
  });
});
