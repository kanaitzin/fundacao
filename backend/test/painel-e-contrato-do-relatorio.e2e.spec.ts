/**
 * O PAINEL DAS UNIDADES, E O FORMATO QUE A TELA LÊ (§18.1–§18.3, §14.6).
 *
 * Duas coisas nasceram juntas porque o mesmo levantamento as encontrou.
 *
 * 1. `GET /reports/panel` e `GET /reports/house-monthly` existiam desde a fase
 *    6 e nunca tiveram tela.
 *
 * 2. `GET /reports` existia, tinha tela — e respondia OUTRA COISA. A lista de
 *    relatórios devolvia sete campos e a aba lia onze: o nome do acolhido, o
 *    autor, se este usuário pode aprovar, e as entregas já registradas.
 *    `r.entregas.map(...)` derrubava a aba inteira contra o servidor de
 *    verdade, e no protótipo funcionava, porque o `mock.ts` fora escrito
 *    olhando a tela. O `contrato-rotas.spec` pega a rota que não existe; ele
 *    não pega a rota que existe e responde diferente. Este teste pega.
 *
 * E junto veio o passo que faltava entre gerar e aprovar: `POST /reports`
 * cria em RASCUNHO, `app_approve_report` só aprova o que está `em_aprovacao`,
 * e não havia botão nem teste ligando os dois. O que a equipe gerava ficava
 * rascunho para sempre.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O painel das unidades e o contrato da lista de relatórios', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  /** O mês corrente na instituição — o mesmo que a tela manda. */
  const mesAgora = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).format(new Date()).slice(0, 7);

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
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== O painel ====================

  it('o educador não abre o painel das unidades', async () => {
    const res = await request(http).get('/api/v1/reports/panel').set(auth(tokens.educador));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/equipe técnica|coordenação/i);
  });

  it('a coordenação recebe a própria casa; o gestor, as oito — sem ranking', async () => {
    const daCoord = await request(http).get('/api/v1/reports/panel').set(auth(tokens.coord));
    expect(daCoord.status).toBe(200);
    expect(daCoord.body.map((c: any) => c.codigo)).toEqual(['AI3']);

    const doGestor = await request(http).get('/api/v1/reports/panel').set(auth(tokens.gestor));
    const codigos = doGestor.body.map((c: any) => c.codigo);
    expect(codigos.length).toBeGreaterThan(1);
    // A ordem é a do código, e não a de nenhuma contagem (§3.3).
    expect(codigos).toEqual([...codigos].sort());

    const ai3 = doGestor.body.find((c: any) => c.codigo === 'AI3');
    expect(ai3.ocupacao).toEqual(expect.objectContaining({
      ativos: expect.any(Number), limite: expect.any(Number),
      acimaDoLimite: expect.any(Boolean),
    }));
  });

  // ==================== O mês da casa ====================

  it('o quadro do mês responde com as contagens e a nota do §14.6', async () => {
    const res = await request(http)
      .get(`/api/v1/reports/house-monthly?houseId=${ids.AI3}&mes=${mesAgora}`)
      .set(auth(tokens.coord));
    expect(res.status).toBe(200);
    expect(res.body.mes).toBe(mesAgora);
    expect(res.body.ocupacao.ativosHoje).toEqual(expect.any(Number));
    expect(res.body.fluxo).toEqual(expect.objectContaining({
      entradas: expect.any(Number), saidas: expect.any(Number),
    }));
    // "Sem registro" continua sendo sem registro, e a folha diz isso.
    expect(res.body.nota).toMatch(/ausência de registro não é fato negativo/i);
  });

  it('mês fora de formato é recusado com uma frase, e não com 500', async () => {
    const res = await request(http)
      .get(`/api/v1/reports/house-monthly?houseId=${ids.AI3}&mes=agosto`)
      .set(auth(tokens.coord));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/AAAA-MM/);
  });

  it('casa fora do alcance responde 404, e não um retrato zerado', async () => {
    /*
     * Este é o defeito que a conferência de escopo evita: o RLS filtra as
     * LINHAS, então a casa de outra unidade voltava com todos os números em
     * zero — e zero se lê como "casa vazia", não como "não é sua". A
     * coordenação da Casa 03 acharia que a Casa 04 passou o mês sem nada.
     */
    const res = await request(http)
      .get(`/api/v1/reports/house-monthly?houseId=${ids.AI4}&mes=${mesAgora}`)
      .set(auth(tokens.coord));
    expect(res.status).toBe(404);
  });

  // ==================== O contrato da lista ====================

  it('a lista de relatórios devolve TODOS os campos que a aba lê', async () => {
    const gerado = await request(http).post('/api/v1/reports').set(auth(tokens.tecnica)).send({
      kind: 'mensal_da_casa', houseId: ids.AI3,
      de: `${mesAgora}-01`, ate: `${mesAgora}-28`,
      finalidade: 'Conferência do contrato da lista de relatórios (teste automatizado).',
    });
    expect(gerado.status).toBe(201);
    ids.relatorio = gerado.body.id;

    const lista = await request(http)
      .get(`/api/v1/reports?houseId=${ids.AI3}`).set(auth(tokens.tecnica));
    expect(lista.status).toBe(200);
    const r = lista.body.find((x: any) => x.id === ids.relatorio);
    expect(r).toBeDefined();

    // Campo a campo, com o nome que a tela usa. `entregas` é array SEMPRE:
    // era a ausência dele que derrubava a aba.
    expect(r).toEqual(expect.objectContaining({
      id: expect.any(String),
      tipo: 'Mensal da casa',            // o rótulo, não o código
      tipoCod: 'mensal_da_casa',
      situacao: 'rascunho',
      periodo: expect.objectContaining({ de: expect.anything(), ate: expect.anything() }),
      finalidade: expect.any(String),
      autor: expect.any(String),
      unidade: 'AI3',
      exigeAprovacao: true,
      podeAprovar: false,                 // rascunho não se aprova
    }));
    expect(Array.isArray(r.entregas)).toBe(true);
    expect(r.acolhido).toBeNull();        // relatório de casa não tem acolhido
  });

  // ==================== O passo que faltava ====================

  it('quem redigiu não aparece como quem pode aprovar', async () => {
    await request(http).post(`/api/v1/reports/${ids.relatorio}/submit`)
      .set(auth(tokens.tecnica)).expect(201);

    const daTecnica = await request(http)
      .get(`/api/v1/reports?houseId=${ids.AI3}`).set(auth(tokens.tecnica));
    expect(daTecnica.body.find((x: any) => x.id === ids.relatorio))
      .toEqual(expect.objectContaining({ situacao: 'em_aprovacao', podeAprovar: false }));

    // A coordenação, que não redigiu, pode — e é a mesma regra do banco.
    const daCoord = await request(http)
      .get(`/api/v1/reports?houseId=${ids.AI3}`).set(auth(tokens.coord));
    expect(daCoord.body.find((x: any) => x.id === ids.relatorio))
      .toEqual(expect.objectContaining({ podeAprovar: true }));
  });

  it('o que já está em aprovação não se reenvia, e a recusa DIZ por quê', async () => {
    const res = await request(http).post(`/api/v1/reports/${ids.relatorio}/submit`)
      .set(auth(tokens.tecnica));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/já está aguardando aprovação/i);
  });

  it('o aprovado não volta para aprovação: corrigir é versão nova', async () => {
    await request(http).post(`/api/v1/reports/${ids.relatorio}/approve`)
      .set(auth(tokens.coord)).expect(201);

    const res = await request(http).post(`/api/v1/reports/${ids.relatorio}/submit`)
      .set(auth(tokens.coord));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/versão seguinte/i);
  });

  it('as entregas registradas voltam DENTRO da lista, prontas para desenhar', async () => {
    await request(http).post(`/api/v1/reports/${ids.relatorio}/delivery`)
      .set(auth(tokens.coord))
      .send({ destinatario: 'Vara fictícia da Infância', meio: 'Protocolo presencial',
              entregueEm: `${mesAgora}-15`, protocolo: 'PROT-FICT-01' })
      .expect(201);

    const lista = await request(http)
      .get(`/api/v1/reports?houseId=${ids.AI3}`).set(auth(tokens.coord));
    const r = lista.body.find((x: any) => x.id === ids.relatorio);
    expect(r.entregas).toHaveLength(1);
    expect(r.entregas[0]).toEqual(expect.objectContaining({
      destino: 'Vara fictícia da Infância', meio: 'Protocolo presencial',
      protocolo: 'PROT-FICT-01', por: expect.any(String),
    }));
  });
});
