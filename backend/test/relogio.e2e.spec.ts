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
    /* Oito rotinas por casa (a sétima, o PIA, é da fase 178; a oitava, a receita
       e a vacinação, da 191). Se alguma sumir, o número cai e o teste avisa. */
    expect(r.rodadas).toBe(r.casas * 8);
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

  /*
   * O PIA QUE ESTÁ CHEGANDO (fase 178, decisão de 28/09, §10 item 9): trinta dias
   * antes, por criança, a técnica e a coordenação da casa são avisadas, uma vez
   * por PIA. O PIA vencendo em quarenta dias ainda não avisa.
   */
  it('avisa a técnica do PIA que vence em até trinta dias, uma vez só', async () => {
    const tok = async (email: string) =>
      (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const tecnica = await tok('tecnica.ai3@paodospobres.dev');
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==';
    const somar = (n: number) => {
      const d = new Date(`${hojeNaInstituicao()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const pessoas: string[] = [];
    const docs: string[] = [];
    for (const [nome, dias] of [['PIA Perto', 10], ['PIA Longe', 40]] as const) {
      const nova = await request(http).post('/api/v1/people').set(auth(tecnica))
        .send({ houseId: AI3, fullName: `Criança do ${nome} (fictícia)`, socialName: nome,
                birthDate: '2014-03-03', provisionalReason: 'Ingresso de teste automatizado' });
      expect(nova.status).toBe(201);
      pessoas.push(nova.body.personId);
      const doc = await request(http).post(`/api/v1/people/${nova.body.personId}/documents`).set(auth(tecnica))
        .send({ chave: 'pia', categoria: 'judicial_socioassistencial', titulo: 'PIA',
                conteudo: PNG, nomeArquivo: 'pia.png', validoAte: somar(dias) });
      expect(doc.status).toBe(201);
      docs.push(doc.body.id);
    }
    try {
      const quem = await relogio.quemSou(enfermagem);
      await relogio.rodarODia(quem);
      await relogio.rodarODia(quem);
      const { rows } = await admin.query(
        `SELECT n.entity_id, count(*)::int AS n FROM notification n
           JOIN app_user u ON u.id = n.user_id
          WHERE u.email = 'tecnica.ai3@paodospobres.dev' AND n.entity = 'pia'
            AND n.entity_id = ANY($1::uuid[]) GROUP BY 1`, [docs]);
      /* O de dez dias avisa, uma vez; o de quarenta, não. */
      expect(rows).toEqual([{ entity_id: docs[0], n: 1 }]);
      const lista = (await request(http).get('/api/v1/notifications').set(auth(tecnica))).body as any[];
      const aviso = lista.find((a) => a.entidadeId === docs[0]);
      expect(aviso.titulo).toMatch(/^O PIA de PIA Perto vence em \d{2}\/\d{2}$/);
    } finally {
      for (const p of pessoas) {
        await request(http).post(`/api/v1/people/${p}/discharge`).set(auth(tecnica))
          .send({ motivo: 'Encerramento de fixture de teste' });
      }
    }
  });

  /*
   * A RECEITA E A VACINAÇÃO QUE ESTÃO VENCENDO (fase 191, decidido em 08/10): a
   * receita dez dias antes, a caderneta quinze, para a Enfermagem e para a
   * técnica e a coordenação da casa, uma vez por documento. A receita que vence
   * em doze dias ainda não avisa; a caderneta em doze, sim. E a receita velha,
   * substituída por uma nova, não avisa: vale a última.
   */
  it('avisa a Enfermagem e a técnica da receita e da vacinação que vencem, uma vez só', async () => {
    const tok = async (email: string) =>
      (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const tecnica = await tok('tecnica.ai3@paodospobres.dev');
    const enf = await tok(enfermagem);
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==';
    const somar = (n: number) => {
      const d = new Date(`${hojeNaInstituicao()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const nova = await request(http).post('/api/v1/people').set(auth(tecnica))
      .send({ houseId: AI3, fullName: 'Criança da Receita (fictícia)', socialName: 'Receita Perto',
              birthDate: '2015-05-05', provisionalReason: 'Ingresso de teste automatizado' });
    expect(nova.status).toBe(201);
    const pessoa = nova.body.personId;
    let outraPessoa = '';
    const anexar = async (chave: string, categoria: string, titulo: string, dias: number) => {
      const r = await request(http).post(`/api/v1/people/${pessoa}/documents`).set(auth(tecnica))
        .send({ chave, categoria, titulo, conteudo: PNG, nomeArquivo: `${chave}.png`, validoAte: somar(dias) });
      expect(r.status).toBe(201);
      return r.body.id as string;
    };
    try {
      /* A receita antiga vence em 3 dias, mas foi renovada: a nova vence em 12. */
      const receitaVelha = await anexar('receita', 'saude', 'Receita', 3);
      const receitaNova = await anexar('receita', 'saude', 'Receita', 12);
      const caderneta = await anexar('caderneta_vacinacao', 'pessoal', 'Caderneta de vacinação', 12);
      const docs = [receitaVelha, receitaNova, caderneta];

      const quem = await relogio.quemSou(enfermagem);
      await relogio.rodarODia(quem);
      await relogio.rodarODia(quem);
      const { rows } = await admin.query(
        `SELECT u.email, n.entity_id, count(*)::int AS n FROM notification n
           JOIN app_user u ON u.id = n.user_id
          WHERE u.email IN ('tecnica.ai3@paodospobres.dev', 'coord.ai3@paodospobres.dev', $2)
            AND n.entity = 'document' AND n.entity_id = ANY($1::uuid[])
          GROUP BY 1, 2 ORDER BY 1`, [docs, enfermagem]);
      /* Só a caderneta (12 de 15 dias); a receita nova está a 12 de 10, e a velha foi substituída. */
      expect(rows).toEqual([
        { email: 'coord.ai3@paodospobres.dev', entity_id: caderneta, n: 1 },
        { email: enfermagem, entity_id: caderneta, n: 1 },
        { email: 'tecnica.ai3@paodospobres.dev', entity_id: caderneta, n: 1 },
      ]);
      const lista = (await request(http).get('/api/v1/notifications').set(auth(enf))).body as any[];
      const aviso = lista.find((a) => a.entidadeId === caderneta);
      expect(aviso.titulo).toMatch(/^A caderneta de vacinação de Receita Perto vence em \d{2}\/\d{2}$/);

      /* A receita que vence em nove dias, noutra criança: avisa, e com o nome do documento. */
      const outra = await request(http).post('/api/v1/people').set(auth(tecnica))
        .send({ houseId: AI3, fullName: 'Criança da Receita Curta (fictícia)', socialName: 'Receita Curta',
                birthDate: '2016-06-06', provisionalReason: 'Ingresso de teste automatizado' });
      expect(outra.status).toBe(201);
      outraPessoa = outra.body.personId;
      const r9 = await request(http).post(`/api/v1/people/${outraPessoa}/documents`).set(auth(tecnica))
        .send({ chave: 'receita', categoria: 'saude', titulo: 'Receita', conteudo: PNG,
                nomeArquivo: 'receita.png', validoAte: somar(9) });
      expect(r9.status).toBe(201);
      await relogio.rodarODia(quem);
      await relogio.rodarODia(quem);
      const { rows: receita } = await admin.query(
        `SELECT u.email, count(*)::int AS n FROM notification n JOIN app_user u ON u.id = n.user_id
          WHERE n.entity = 'document' AND n.entity_id = $1 GROUP BY 1 ORDER BY 1`, [r9.body.id]);
      expect(receita.map((x) => [x.email, x.n])).toEqual(expect.arrayContaining([
        ['coord.ai3@paodospobres.dev', 1], [enfermagem, 1], ['tecnica.ai3@paodospobres.dev', 1]]));
      const avisoReceita = ((await request(http).get('/api/v1/notifications').set(auth(enf))).body as any[])
        .find((a) => a.entidadeId === r9.body.id);
      expect(avisoReceita.titulo).toMatch(/^A receita de Receita Curta vence em \d{2}\/\d{2}$/);
      expect(avisoReceita.corpo ?? avisoReceita.body ?? '').not.toMatch(/mg|comprimido/i);
    } finally {
      for (const p of [pessoa, outraPessoa].filter(Boolean)) {
        await request(http).post(`/api/v1/people/${p}/discharge`).set(auth(tecnica))
          .send({ motivo: 'Encerramento de fixture de teste' });
      }
    }
  });
});
