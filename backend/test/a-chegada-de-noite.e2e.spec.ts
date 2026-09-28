/**
 * A CHEGADA DE NOITE (fase 173, decisão de 28/09).
 *
 * A criança que chega de madrugada, trazida pelo Conselho Tutelar, só podia
 * ser cadastrada pela técnica, pela coordenação ou pelo gestor: até a manhã,
 * ela não estava na chamada, na refeição nem na ATA. Agora o plantão registra
 * o mínimo (nome, idade aproximada, quem trouxe) e ela entra na casa na hora;
 * a técnica é avisada e completa de manhã.
 *
 * A suíte usa a ARM2, vazia na semente, com contas criadas por ela: a Casa 03
 * é contada por outras suítes, e uma criança a mais lá mudaria as contas delas.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A chegada de noite', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const rodada = Date.now().toString(36);

  const login = async (email: string, senha = SENHA) => {
    const r = await request(http).post('/api/v1/auth/login').send({ email, password: senha });
    if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
    return r.body.token as string;
  };
  const auth = (tk: string) => ({ Authorization: `Bearer ${tk}` });
  const post = (tk: string, rota: string, corpo: any = {}) =>
    request(http).post(`/api/v1${rota}`).set(auth(tk)).send(corpo);
  const get = (tk: string, rota: string) => request(http).get(`/api/v1${rota}`).set(auth(tk));
  const chegada = (tk: string, corpo: any = {}) => post(tk, '/people/chegada', {
    houseId: ids.ARM2, nome: `Menino da Noite ${rodada} (fictício)`, idadeAproximada: 9,
    trazidaPor: 'Conselho Tutelar, plantão noturno', chegada: 'Chegou às 23h40 com a roupa do corpo.',
    ...corpo });

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    t.gestor = await login('gestor@paodospobres.dev');
    t.coord4 = await login('coord.ai4@paodospobres.dev');
    ({ rows: [{ id: ids.ARM2 }] } = await admin.query(`SELECT id FROM house WHERE code = 'ARM2'`));
    for (const [k, cargo] of [['educador', 'educador'], ['tecnica', 'equipe_tecnica'], ['cozinha', 'cozinha']]) {
      const email = `${k}.noite.${rodada}@paodospobres.dev`;
      const r = await post(t.gestor, '/staff', { nome: `${k} da noite (fictício)`, email, cargo,
        casaId: ids.ARM2, senhaInicial: 'senha-da-noite-1' });
      expect(r.status).toBe(201);
      ids[k] = r.body.id;
      t[k] = await login(email, 'senha-da-noite-1');
    }
  });

  afterAll(async () => {
    if (ids.crianca) {
      await post(t.tecnica, `/people/${ids.crianca}/discharge`,
        { motivo: 'Encerramento da suíte da chegada de noite (dados fictícios).' });
    }
    for (const k of ['educador', 'tecnica', 'cozinha']) {
      if (ids[k]) await post(t.gestor, `/staff/${ids[k]}/deactivate`, { motivo: 'Conta fictícia da suíte da chegada de noite.' });
    }
    await app.close(); await admin.end();
  });

  it('o educador do plantão registra o mínimo, e a recusa diz o que falta em português', async () => {
    const semNome = await chegada(t.educador, { nome: '' });
    expect(semNome.status).toBe(400);
    expect(semNome.body.message).toMatch(/nome como a criança se apresentou/);
    const semQuem = await chegada(t.educador, { trazidaPor: '' });
    expect(semQuem.status).toBe(400);
    expect(semQuem.body.message).toMatch(/quem trouxe/);
    const semIdade = await chegada(t.educador, { idadeAproximada: 'uns nove' });
    expect(semIdade.status).toBe(400);
    expect(semIdade.body.message).toMatch(/idade aproximada/);

    const r = await chegada(t.educador);
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/já está na casa/);
    ids.crianca = r.body.personId;
  });

  it('ela entra na casa agora: na lista do educador, com a ficha de entrada do plantão', async () => {
    const lista = await get(t.educador, `/people?houseId=${ids.ARM2}`);
    expect(lista.body.some((p: any) => (p.id ?? p.personId) === ids.crianca)).toBe(true);
    const { rows: [f] } = await admin.query(
      `SELECT a.brought_by, a.arrival_note, a.provisional_reason, p.provisional_id, p.cpf_pending,
              extract(year FROM p.birth_date)::int AS ano, extract(year FROM app_hoje())::int AS agora,
              app_user_display_name(a.created_by) AS quem
         FROM admission_record a JOIN person p ON p.id = a.person_id WHERE a.person_id = $1`, [ids.crianca]);
    expect(f.brought_by).toBe('Conselho Tutelar, plantão noturno');
    expect(f.arrival_note).toMatch(/23h40/);
    expect(f.provisional_reason).toMatch(/Idade aproximada informada: 9 anos/);
    expect(f.provisional_id).toMatch(/^PROV-/);
    expect(f.cpf_pending).toBe(true);
    expect(f.agora - f.ano).toBe(9);
    expect(f.quem).toMatch(/educador da noite/);
  });

  it('na chamada da janta ela é marcada como qualquer criança da casa', async () => {
    const k = await post(t.educador, '/checks', { houseId: ids.ARM2, kind: 'alimentacao',
      titulo: `Janta da chegada ${rodada}`, referenceAt: new Date().toISOString() });
    expect(k.status).toBe(201);
    const m = await post(t.educador, `/checks/${k.body.checkId ?? k.body.id}/mark`,
      { personId: ids.crianca, opcao: 'normal' });
    expect(m.status).toBe(201);
  });

  it('a técnica é avisada para completar, e o aviso não leva o nome da criança', async () => {
    const avisos = await get(t.tecnica, '/notifications');
    const a = avisos.body.find((n: any) => /Chegou uma criança pelo plantão/.test(n.titulo));
    expect(a).toBeTruthy();
    expect(JSON.stringify(a)).not.toContain(`Menino da Noite ${rodada}`);
  });

  it('a cozinha não registra chegada, e a coordenação de outra casa também não', async () => {
    expect((await chegada(t.cozinha)).status).toBe(403);
    expect((await chegada(t.coord4)).status).toBe(403);
  });
});
