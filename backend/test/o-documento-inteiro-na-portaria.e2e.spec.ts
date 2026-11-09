/**
 * O DOCUMENTO INTEIRO DO VISITANTE, AO TOCAR (fase 277, decisão de 05/11).
 *
 * A lista do portão chega com o CPF e o RG escondidos para todos os cargos.
 * Quem confere a identidade (a portaria) e quem responde pelo cadastro (a equipe
 * técnica e a coordenação) toca em Ver o documento e recebe os números de UM
 * visitante; cada pedido vai à auditoria da casa, com o nome de quem pediu e sem
 * o número. Esta suíte cobra:
 *
 *  1. a lista escondida para todos, inclusive para a coordenação;
 *  2. os três cargos recebem CPF e RG inteiros, e o servidor diz `podeVerCpfInteiro`;
 *  3. o educador e o Gestor Geral recebem a recusa em português;
 *  4. a coordenação de outra casa não acha o visitante;
 *  5. a linha da auditoria tem a casa e não tem o número.
 *
 * O visitante é fictício e fica inativo no fim.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { entrarPelaPrimeiraVez } from './setup/a-senha-dela';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const CPF = '52998224725';
const RG = '9876543210';

describe('O documento inteiro do visitante, ao tocar', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string, senha = SENHA) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: senha })).body.token as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const ver = (t: string, contato = ids.visitante) =>
    request(http).post(`/api/v1/people/portaria/visitante/${contato}/cpf`).set(auth(t)).send({});

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
      coord: 'coord.ai3@paodospobres.dev', educador: 'educador.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.coordId }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='coord.ai3@paodospobres.dev'`));
    ({ rows: [{ person_id: ids.crianca }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa'
        ORDER BY person_id LIMIT 1`, [ids.AI3]));

    const email = `portaria.277.${Date.now()}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set(auth(tokens.coord))
      .send({ nome: 'Porteira da Conferência 277 (fictícia)', email, cargo: 'portaria', casaId: ids.AI3 });
    expect(r.status).toBe(201);
    tokens.portaria = await entrarPelaPrimeiraVez(http, email, r.body.senhaInicial);
    ({ rows: [{ id: ids.portariaId }] } = await admin.query(`SELECT id FROM app_user WHERE email = $1`, [email]));

    const { rows: [c] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, cpf, rg, visit_authorized, visit_authorized_by,
                                   visit_authorized_at, visit_weekdays, visit_from, visit_to,
                                   created_by, updated_by)
       VALUES ($1, 'Madrinha da Conferência 277 (fictícia)', 'madrinha', $2, $3, true, $4, now(),
               '{0,1,2,3,4,5,6}'::smallint[], '00:00'::time, '23:59'::time, $4, $4)
       RETURNING id`, [ids.crianca, CPF, RG, ids.coordId]);
    ids.visitante = c.id;
  });

  afterAll(async () => {
    await admin.query(
      `UPDATE person_contact SET visit_authorized = false, active = false,
              ended_reason = 'Visitante fictício da conferência da fase 277.'
        WHERE id = $1`, [ids.visitante]);
    await app.close(); await admin.end();
  });

  it('a lista do portão chega escondida para todos, e diz quem pode tocar', async () => {
    for (const [cargo, pode] of [['portaria', true], ['tecnica', true], ['coord', true], ['educador', false]] as const) {
      const r = await request(http).get(`/api/v1/people/portaria/hoje?houseId=${ids.AI3}`).set(auth(tokens[cargo]));
      expect(r.status).toBe(200);
      expect(r.body.podeVerCpfInteiro).toBe(pode);
      const v = r.body.visitantes.find((x: any) => x.contatoId === ids.visitante);
      expect(v.cpf).toBe('***.***.247-**');
      expect(v.rg).toBe('•••••••210');
    }
  });

  it('a portaria, a técnica e a coordenação recebem o CPF e o RG inteiros', async () => {
    for (const cargo of ['portaria', 'tecnica', 'coord']) {
      const r = await ver(tokens[cargo]);
      expect(r.status).toBe(201);
      expect(r.body.cpf).toBe(CPF);
      expect(r.body.rg).toBe(RG);
      expect(r.body.aviso).toMatch(/registrada com o seu nome/);
    }
  });

  it('o educador e o Gestor Geral recebem a recusa, e a outra casa não acha o visitante', async () => {
    for (const cargo of ['educador', 'gestor']) {
      const r = await ver(tokens[cargo]);
      expect(r.status).toBe(403);
      expect(r.body.message).toMatch(/portaria, pela equipe técnica ou pela coordenação/);
    }
    const fora = await ver(tokens.coord4);
    expect(fora.status).toBe(404);
    expect(JSON.stringify(fora.body)).not.toContain(CPF);
  });

  it('cada abertura fica na auditoria da casa, com quem pediu e sem o número', async () => {
    const antes = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event WHERE action = 'visitante.cpf_visto' AND entity_id = $1`,
      [ids.visitante]);
    expect((await ver(tokens.portaria)).status).toBe(201);
    const { rows } = await admin.query(
      `SELECT house_id, actor_id, entity, detail FROM audit_event
        WHERE action = 'visitante.cpf_visto' AND entity_id = $1 ORDER BY at DESC`, [ids.visitante]);
    expect(rows.length).toBe(antes.rows[0].n + 1);
    expect(rows[0].house_id).toBe(ids.AI3);
    expect(rows[0].actor_id).toBe(ids.portariaId);
    expect(rows[0].entity).toBe('person_contact');
    expect(JSON.stringify(rows[0].detail)).not.toContain(CPF);
    expect(JSON.stringify(rows[0].detail)).not.toContain(RG);
    /* As três aberturas do teste anterior, uma por cargo, e nenhuma da recusa. */
    expect(rows.length).toBe(4);
  });
});
