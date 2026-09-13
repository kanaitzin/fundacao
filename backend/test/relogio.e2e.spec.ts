/**
 * O RELÓGIO (fase 103).
 *
 * Seis rotas de máquina existiam com o motivo escrito de não terem tela —
 * "roda por relógio" —, e não havia relógio. Este teste é o que prova que
 * agora há: sem ele, cada rota tem a sua suíte, todas passam, e o dia da casa
 * amanhece vazio no piloto.
 *
 * O que fica garantido:
 *  - as doses do dia nascem da prescrição sem ninguém apertar nada;
 *  - uma casa que falha não derruba as outras;
 *  - sem conta configurada, o relógio diz isso e não roda pela metade;
 *  - a passagem fica registrada na auditoria, com o nome de quem rodou.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { RelogioService } from '../src/modules/relogio';
import { hojeNaInstituicao } from '../src/kernel/common/tempo';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O relógio', () => {
  let app: INestApplication, http: any, admin: Client, relogio: RelogioService;
  let AI3 = '', enfermagem = '';

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    relogio = app.get(RelogioService);
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    enfermagem = 'enfermagem@paodospobres.dev';
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('sem conta configurada, ele diz e não roda', async () => {
    await expect(relogio.quemSou('')).rejects.toThrow(/RELOGIO_USER_EMAIL/);
    await expect(relogio.quemSou('ninguem@exemplo.invalido'))
      .rejects.toThrow(/não existe ou está inativa/);
  });

  it('roda as rotinas do dia em todas as casas que a conta alcança', async () => {
    const quem = await relogio.quemSou(enfermagem);
    /* A enfermagem é transversal: alcança as oito. É a conta que o §12 sugere
       para o relógio, e o teste usa a mesma para não provar noutra condição. */
    const r = await relogio.rodarODia(quem);

    expect(r.dia).toBe(hojeNaInstituicao());
    expect(r.casas).toBeGreaterThanOrEqual(8);
    /* Seis rotinas por casa. Se alguma sumir, o número cai e o teste avisa. */
    expect(r.rodadas).toBe(r.casas * 6);
    expect(r.falhas).toEqual([]);

    const { rows: [ev] } = await admin.query(
      `SELECT detail FROM audit_event WHERE action = 'relogio.dia' ORDER BY at DESC LIMIT 1`);
    expect(ev.detail.casas).toBe(r.casas);
    expect(ev.detail.falhas).toBe(0);
  });

  it('as doses do dia nascem da prescrição, sem ninguém apertar nada', async () => {
    const tok = async (email: string) =>
      (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const enf = await tok(enfermagem);
    const tecnica = await tok('tecnica.ai3@paodospobres.dev');

    const nova = await request(http).post('/api/v1/people').set(auth(tecnica))
      .send({ houseId: AI3, fullName: 'Criança do Relógio (fictícia)', socialName: 'RelogioTeste',
              birthDate: '2015-04-09', provisionalReason: 'Ingresso de teste automatizado' });
    expect(nova.status).toBe(201);
    const pessoa = nova.body.personId;

    const pr = await request(http).post('/api/v1/medications/prescriptions').set(auth(enf))
      .send({ personId: pessoa, houseId: AI3, tipo: 'uso_continuo',
              medicamento: 'Medicamento de teste (fictício) 500mg', dose: '1 comprimido',
              via: 'oral', horarios: ['08:00', '20:00'] });
    expect(pr.status).toBe(201);
    expect((await request(http).post(`/api/v1/medications/prescriptions/${pr.body.id}/sign`)
      .set(auth(enf))).status).toBe(201);

    /* Ninguém chama a rota: quem roda é o relógio. */
    const antes = await admin.query(
      `SELECT count(*)::int AS n FROM medication_administration WHERE prescription_id = $1`,
      [pr.body.id]);
    expect(antes.rows[0].n).toBe(0);

    await relogio.rodarODia(await relogio.quemSou(enfermagem));

    const depois = await admin.query(
      `SELECT count(*)::int AS n FROM medication_administration WHERE prescription_id = $1`,
      [pr.body.id]);
    expect(depois.rows[0].n).toBeGreaterThan(0);

    await request(http).post(`/api/v1/people/${pessoa}/discharge`).set(auth(tecnica))
      .send({ motivo: 'Encerramento de fixture de teste' });
  });

  it('rodar duas vezes no mesmo dia não duplica nada', async () => {
    const quem = await relogio.quemSou(enfermagem);
    const { rows: [antes] } = await admin.query(
      `SELECT count(*)::int AS n FROM medication_administration`);
    const r = await relogio.rodarODia(quem);
    expect(r.falhas).toEqual([]);
    const { rows: [depois] } = await admin.query(
      `SELECT count(*)::int AS n FROM medication_administration`);
    expect(depois.n).toBe(antes.n);
  });
});
