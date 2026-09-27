/**
 * O ALCANCE DAS QUATRO SUPERFÍCIES QUE FICARAM SEM DADO (fase 169).
 *
 * As sondagens de alcance das fases 156 (escrita) e 158 (leitura) passaram a
 * coordenação da Casa 04 por todas as rotas com registros REAIS da Casa 03 —
 * a lição da 156: com identificador inventado a sondagem volta limpa, porque o
 * RLS esconde o que não existe e o que não é seu do mesmo jeito. Quatro
 * superfícies ficaram sem registro no banco da suíte e nunca foram sondadas:
 * o pedido da cozinha, a credencial do cofre, o acompanhamento e a foto de
 * memória. E a sondagem foi feita à mão, e se perdeu com a sessão dela.
 *
 * Esta suíte cria um registro real de cada na Casa 03, passa a coordenação da
 * Casa 04 por TODA rota que toca cada um — leitura e escrita, e também com a
 * criança DELA na rota e o registro da Casa 03 no outro parâmetro —, e confere
 * no banco que nada mudou.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const JPEG = `data:image/jpeg;base64,${Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ...new Array(64).fill(0x20), 0xff, 0xd9,
]).toString('base64')}`;

describe('O alcance das quatro superfícies que ficaram sem dado', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const rodada = Date.now().toString(36);
  const auth = (tk: string) => ({ Authorization: `Bearer ${tk}` });

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
      educador: 'educador.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
    })) {
      const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
      t[k] = r.body.token;
    }
    /* O cofre pede a senha de novo. A coordenação da Casa 04 também a
       confirma: sem isto, o 403 dela diria "confirme a senha", e não "esta
       casa não é sua", e a sondagem não mediria o alcance. */
    for (const k of ['coord', 'coord4']) {
      expect((await request(http).post('/api/v1/auth/reauth').set(auth(t[k]))
        .send({ password: SENHA })).status).toBeLessThan(300);
    }
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    const p = await request(http).post('/api/v1/people').set(auth(t.tecnica)).send({
      houseId: ids.AI3, fullName: `Criança do Alcance ${rodada} (fictícia)`, socialName: `Alc${rodada}`,
      birthDate: '2014-04-04', provisionalReason: 'Ingresso de teste automatizado, dados fictícios' });
    ids.crianca = p.body.personId;
    ({ rows: [{ person_id: ids.crianca4 }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa' LIMIT 1`, [ids.AI4]));

    /* Os quatro registros reais, criados pela Casa 03 pelas rotas de verdade. */
    const amanha = (await admin.query(`SELECT (app_hoje() + 1)::text AS d`)).rows[0].d;
    const pedido = await request(http).post('/api/v1/people/kitchen-requests').set(auth(t.coord))
      .send({ houseId: ids.AI3, tipo: 'lanche', pessoas: [ids.crianca], em: amanha, quantidade: 1,
              finalidade: `Passeio do alcance ${rodada}` });
    expect(pedido.status).toBe(201);
    ({ rows: [{ id: ids.pedido }] } = await admin.query(
      `SELECT id FROM kitchen_request WHERE purpose = $1`, [`Passeio do alcance ${rodada}`]));

    const cred = await request(http).post(`/api/v1/people/${ids.crianca}/credentials`).set(auth(t.coord))
      .send({ tipo: 'gov_br', login: '000.000.000-00', senha: 'Ficticia@Alcance1',
              responsavel: 'Coordenação da Casa 03' });
    expect(cred.status).toBe(201);
    ({ rows: [{ id: ids.credencial }] } = await admin.query(
      `SELECT id FROM person_credential WHERE person_id = $1`, [ids.crianca]));

    const viv = await request(http).post(`/api/v1/people/${ids.crianca}/memories`).set(auth(t.educador))
      .send({ tipo: 'aniversario', quando: '2026-09-10',
              descricao: 'Aniversário com bolo feito na casa, registrado para a sondagem.',
              fotos: [{ conteudo: JPEG, nomeArquivo: 'festa.jpg', autorizacaoRegistrada: true }] });
    expect(viv.status).toBe(201);
    ids.vivencia = viv.body.id;
    ({ rows: [{ id: ids.foto }] } = await admin.query(
      `SELECT id FROM memory_photo WHERE memory_id = $1 LIMIT 1`, [ids.vivencia]));

    await request(http).post('/api/v1/followups/generate').set(auth(t.tecnica)).send({ houseId: ids.AI3 });
    ({ rows: [{ id: ids.acompanhamento }] } = await admin.query(
      `SELECT id FROM followup WHERE house_id = $1 AND status NOT IN ('aprovado') ORDER BY created_at DESC LIMIT 1`,
      [ids.AI3]));
  });

  afterAll(async () => {
    await request(http).post(`/api/v1/people/kitchen-requests/${ids.pedido}/cancel`).set(auth(t.coord))
      .send({ motivo: 'Encerramento de fixture de teste' });
    await request(http).post(`/api/v1/people/${ids.crianca}/discharge`).set(auth(t.tecnica))
      .send({ motivo: 'Encerramento de fixture de teste' });
    await app.close(); await admin.end();
  });

  /** O estado dos quatro registros e do que nasce deles, lido como dono. */
  async function estado() {
    const { rows: [e] } = await admin.query(`
      SELECT (SELECT row_to_json(k) FROM kitchen_request k WHERE k.id = $1) AS pedido,
             (SELECT count(*) FROM kitchen_request_change WHERE request_id = $1)::int AS mudancas,
             (SELECT row_to_json(c) FROM person_credential c WHERE c.id = $2) AS credencial,
             (SELECT count(*) FROM person_credential WHERE person_id = $5)::int AS credenciais,
             (SELECT row_to_json(f) FROM followup f WHERE f.id = $3) AS acompanhamento,
             (SELECT count(*) FROM followup_source WHERE followup_id = $3)::int AS fontes,
             (SELECT count(*) FROM followup WHERE supersedes_id = $3)::int AS versoes,
             (SELECT count(*) FROM memory_record WHERE person_id = $5)::int AS vivencias,
             (SELECT row_to_json(m) FROM memory_photo m WHERE m.id = $4) AS foto`,
      [ids.pedido, ids.credencial, ids.acompanhamento, ids.foto, ids.crianca]);
    return e;
  }

  it('os quatro registros reais existem na Casa 03 antes da sondagem', () => {
    expect(ids).toEqual(expect.objectContaining({
      pedido: expect.any(String), credencial: expect.any(String),
      acompanhamento: expect.any(String), vivencia: expect.any(String), foto: expect.any(String),
    }));
  });

  it('a coordenação da Casa 04 não lê nem escreve nenhum dos quatro, por rota nenhuma', async () => {
    const antes = await estado();
    const c = ids.crianca, c4 = ids.crianca4;
    const hoje = (await admin.query(`SELECT app_hoje()::text AS d`)).rows[0].d;
    const sondas: Array<[string, string, any?]> = [
      /* O pedido da cozinha. */
      ['POST', `/people/kitchen-requests/${ids.pedido}/edit`, { quantidade: 9, finalidade: 'Tentativa de outra casa' }],
      ['GET', `/people/kitchen-requests/${ids.pedido}/history`],
      ['POST', `/people/kitchen-requests/${ids.pedido}/cancel`, { motivo: 'Tentativa de outra casa' }],
      ['GET', `/people/kitchen-requests?houseId=${ids.AI3}&de=${hoje}&ate=${hoje}`],
      ['GET', `/people/kitchen-requests/summary?houseId=${ids.AI3}&de=${hoje}&ate=${hoje}`],
      ['GET', `/people/kitchen-requests/folha/lanches?houseId=${ids.AI3}`],
      ['GET', `/people/kitchen-requests/folha/restricoes?houseId=${ids.AI3}`],
      ['GET', `/people/kitchen-requests/folha/cestas?houseId=${ids.AI3}`],
      ['POST', '/people/kitchen-requests/export/lanches', { houseId: ids.AI3, finalidade: 'Tentativa de outra casa' }],
      ['POST', '/people/kitchen-requests', { houseId: ids.AI3, tipo: 'lanche', pessoas: [c], em: hoje,
                                             quantidade: 1, finalidade: 'Tentativa de outra casa' }],
      /* A credencial do cofre, com a criança de lá E com a criança de cá. */
      ['POST', `/people/${c}/credentials/view`, {}],
      ['POST', `/people/${c}/credentials`, { tipo: 'gov_br', login: 'x', senha: 'Outra@Casa1', responsavel: 'Casa 04' }],
      ['POST', `/people/${c}/credentials/${ids.credencial}/reveal`, { finalidade: 'Tentativa de outra casa' }],
      ['POST', `/people/${c4}/credentials/${ids.credencial}/reveal`, { finalidade: 'Tentativa de outra casa' }],
      ['POST', `/people/${c}/credentials/history`, {}],
      /* O acompanhamento. */
      ['GET', `/followups/${ids.acompanhamento}`],
      ['POST', `/followups/${ids.acompanhamento}/draft`, { saude: 'Escrito por outra casa.' }],
      ['GET', `/followups/${ids.acompanhamento}/sources`],
      ['POST', `/followups/${ids.acompanhamento}/sources`, {
        entidade: 'incident', entityId: '11111111-1111-1111-1111-111111111111',
        origem: 'Outra casa', autor: 'Outra casa', registradoEm: '2026-08-12T21:40:00Z', classificacao: 'equipe' }],
      ['POST', `/followups/${ids.acompanhamento}/submit`, {}],
      ['POST', `/followups/${ids.acompanhamento}/approve`, { nota: 'Aprovado por outra casa.' }],
      ['POST', `/followups/${ids.acompanhamento}/amend`, { motivo: 'Nova versão pedida por outra casa.' }],
      ['GET', `/followups?houseId=${ids.AI3}`],
      /* A foto de memória, com a criança de lá E com a criança de cá. */
      ['GET', `/people/${c}/memories`],
      ['POST', `/people/${c}/memories`, { tipo: 'aniversario', quando: '2026-09-11',
        descricao: 'Vivência registrada por outra casa, que não deveria entrar.' }],
      ['GET', `/people/${c}/memories/${ids.vivencia}/file`],
      ['GET', `/people/${c}/memories/${ids.vivencia}/photos/${ids.foto}`],
      ['GET', `/people/${c4}/memories/${ids.vivencia}/file`],
      ['GET', `/people/${c4}/memories/${ids.vivencia}/photos/${ids.foto}`],
    ];
    const aceitas: string[] = [];
    for (const [metodo, rota, corpo] of sondas) {
      for (const quem of ['coord4']) {
        const req = metodo === 'GET'
          ? request(http).get(`/api/v1${rota}`)
          : request(http).post(`/api/v1${rota}`).send(corpo ?? {});
        const r = await req.set(auth(t[quem]));
        /* Resposta de sucesso é vazamento, a não ser que venha VAZIA de
           propósito numa lista da casa de fora — e isso a 158 já proibiu:
           fora do alcance é 403 ou 404, não 200 vazio. */
        if (r.status < 400) {
          aceitas.push(`${quem} ${metodo} ${rota} → ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
        }
        if (r.status >= 500) aceitas.push(`${quem} ${metodo} ${rota} → ${r.status} (erro)`);
      }
    }
    expect(aceitas).toEqual([]);
    expect(await estado()).toEqual(antes);
    /* E a auditoria não diz que a Casa 04 abriu o cofre da criança da Casa 03:
       a lista vazia era registrada como abertura (fase 169). */
    const { rows: [n] } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event a JOIN app_user u ON u.id = a.actor_id
        WHERE a.action = 'credential.list' AND a.entity_id = $1 AND u.email = 'coord.ai4@paodospobres.dev'`,
      [ids.crianca]);
    expect(n.n).toBe(0);
  });

  it('a Casa 03 continua lendo os quatro, para a sondagem não passar por estarem quebrados', async () => {
    expect((await request(http).get(`/api/v1/people/kitchen-requests/${ids.pedido}/history`)
      .set(auth(t.coord))).status).toBe(200);
    expect((await request(http).post(`/api/v1/people/${ids.crianca}/credentials/view`)
      .set(auth(t.coord)).send({})).status).toBe(201);
    expect((await request(http).get(`/api/v1/followups/${ids.acompanhamento}`)
      .set(auth(t.tecnica))).status).toBe(200);
    expect((await request(http).get(`/api/v1/people/${ids.crianca}/memories/${ids.vivencia}/photos/${ids.foto}`)
      .set(auth(t.educador))).status).toBe(200);
  });
});
