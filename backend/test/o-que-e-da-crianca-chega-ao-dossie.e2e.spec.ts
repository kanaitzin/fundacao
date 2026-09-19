/**
 * O QUE É DA CRIANÇA CHEGA AO DOSSIÊ DELA — e o que NÃO é, não chega.
 *
 * A regra que a Fundação escreveu em 15/09, e que vale para o sistema inteiro:
 *
 *   *"Se a enfermagem já faz isso cair no perfil da criança, todos os outros
 *   lugares onde a gente preenche, seja almoço, seja outras coisas, os dados
 *   individuais de cada criança mesmo no coletivo, têm que ir individual para
 *   cada um no seu registro e vivência na casa."*
 *
 * O pedido concreto: *"se elas quiserem botar alguma bula, alguma receita,
 * alguma coisa ali pela enfermagem, que já caia direto no perfil da criança."*
 *
 * O que esta suíte guarda:
 *
 *  1. **a receita chega ao dossiê**, e é o MESMO arquivo — não uma cópia;
 *  2. **a bula também**, e ela não existia em lugar nenhum;
 *  3. **o anexo do diário de internação também** — é o laudo que o hospital
 *     entregou, e ele sumia junto com a internação encerrada;
 *  4. **o espelho é idempotente**: reprocessar a fila offline não enche a
 *     pasta da criança de receitas repetidas;
 *  5. **uma REFERÊNCIA não vira espelho.** Um documento no dossiê que não abre
 *     é uma linha a mais e nada a mais;
 *  6. **e a nota fiscal NÃO chega** — ela é uma compra da CASA, não tem
 *     pessoa, e pôr uma despesa da casa no prontuário de uma criança seria
 *     inventar um vínculo que o dado não tem. Este item corrige o meu próprio
 *     levantamento do §9, que contava "três vezes" o mesmo defeito quando são
 *     duas.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const PDF = `data:application/pdf;base64,${Buffer.from(
  `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
).toString('base64')}`;

describe('O que é da criança chega ao dossiê dela', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** O dossiê da criança, como a tela o lê. */
  const dossie = async () => {
    const r = await request(http).get(`/api/v1/people/${ids.pessoa}/dossie`)
      .set(auth(tokens.tecnica));
    expect(r.status).toBe(200);
    return [
      ...r.body.categorias.flatMap((c: any) => c.itens.flatMap((i: any) => i.documentos ?? [])),
      ...r.body.avulsos,
    ];
  };

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();

    tokens.enfermagem = await login('enfermagem@paodospobres.dev');
    tokens.tecnica = await login('tecnica.ai3@paodospobres.dev');

    const { rows: [{ id: casa }] } = await admin.query(
      `SELECT id FROM house WHERE code = 'AI3'`);
    ids.casa = casa;
    const { rows: [p] } = await admin.query(
      `SELECT s.person_id FROM house_stay s
        WHERE s.house_id = $1 AND s.status = 'ativa'
        ORDER BY s.started_at LIMIT 1`, [casa]);
    ids.pessoa = p.person_id;

    const { rows: [pr] } = await admin.query(
      `INSERT INTO prescription (person_id, house_id, kind, medication, dose, route,
                                 prescribed_on, starts_on, status, created_by)
       VALUES ($1,$2,'tratamento','Amoxicilina 250mg','5 ml','oral',
               app_hoje(), app_hoje(), 'ativa',
               (SELECT id FROM app_user WHERE email = 'enfermagem@paodospobres.dev'))
       RETURNING id`, [ids.pessoa, casa]);
    ids.prescricao = pr.id;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== A receita e a bula ====================

  it('a receita anexada à prescrição CHEGA ao dossiê da criança', async () => {
    const antes = (await dossie()).length;

    const r = await request(http)
      .post(`/api/v1/medications/prescriptions/${ids.prescricao}/documents`)
      .set(auth(tokens.enfermagem))
      .send({ nome: 'Receita — 15/09', conteudo: PDF, nomeArquivo: 'receita.pdf' });
    expect(r.status).toBe(201);
    expect(r.body.noDossie).toBeTruthy();
    expect(r.body.aviso).toMatch(/dossiê da criança/i);
    ids.receita = r.body.id;

    const depois = await dossie();
    expect(depois.length).toBe(antes + 1);
    const espelho = depois.find((d: any) => d.id === r.body.noDossie);
    expect(espelho).toBeDefined();
    /* A origem vai escrita: quem abre a pasta precisa saber de onde a receita
       veio, e não achar que ela apareceu do nada. */
    expect(espelho.origem).toMatch(/prescrição de Amoxicilina/i);
    /* E ela chega CONFERIDA, por quem anexou — ver o cabeçalho da 1330. */
    expect(espelho.aceitoEm).toBeTruthy();
  });

  it('e é o MESMO arquivo, não uma cópia', async () => {
    const { rows: [orig] } = await admin.query(
      `SELECT storage_key, sha256 FROM prescription_document WHERE id = $1`, [ids.receita]);
    const { rows: [esp] } = await admin.query(
      `SELECT v.storage_key, v.sha256 FROM document d
         JOIN document_version v ON v.document_id = d.id
        WHERE d.mirror_of = $1`, [`prescription_document:${ids.receita}`]);
    /* Duas cópias divergem no dia em que alguém substituir uma delas, e a
       segunda continuaria parecendo verdadeira. */
    expect(esp.storage_key).toBe(orig.storage_key);
    expect(esp.sha256).toBe(orig.sha256);
  });

  it('a BULA também — e ela não existia em lugar nenhum', async () => {
    const r = await request(http)
      .post(`/api/v1/medications/prescriptions/${ids.prescricao}/documents`)
      .set(auth(tokens.enfermagem))
      .send({ nome: 'Bula — Amoxicilina', tipo: 'bula',
              conteudo: PDF, nomeArquivo: 'bula.pdf' });
    expect(r.status).toBe(201);
    expect(r.body.noDossie).toBeTruthy();

    const { rows: [d] } = await admin.query(
      `SELECT kind FROM prescription_document WHERE id = $1`, [r.body.id]);
    expect(d.kind).toBe('bula');

    const no = (await dossie()).find((x: any) => x.id === r.body.noDossie);
    expect(no.origem).toMatch(/^Bula anexada/i);
    /* A receita ocupa a vaga do checklist; a bula é AVULSA, porque não é um
       documento que a casa precisa ter — é o papel que vem na caixa. */
    expect(no.chave).toBeNull();

    /* E a tela de Saúde passa a dizer QUAL papel é qual. */
    const lista = await request(http)
      .get(`/api/v1/medications/prescriptions/${ids.prescricao}/documents`)
      .set(auth(tokens.enfermagem));
    expect(lista.status).toBe(200);
    expect(lista.body.map((x: any) => x.tipo).sort()).toEqual(['bula', 'receita']);
    /* E diz que chegou ao dossiê, em vez de deixar a Enfermagem na dúvida. */
    expect(lista.body.every((x: any) => x.noDossie)).toBe(true);
  });

  it('um papel que é REFERÊNCIA não vira espelho', async () => {
    const antes = (await dossie()).length;
    const r = await request(http)
      .post(`/api/v1/medications/prescriptions/${ids.prescricao}/documents`)
      .set(auth(tokens.enfermagem))
      .send({ nome: 'Receita — no Drive', anexoRef: 'Drive/Saúde/receitas/2026-09.pdf' });
    expect(r.status).toBe(201);
    expect(r.body.noDossie).toBeNull();
    /* Um documento na pasta da criança que não abre é uma linha a mais e nada
       a mais — e a resposta diz isso a quem anexou. */
    expect(r.body.aviso).toMatch(/não abre|referência/i);
    expect((await dossie()).length).toBe(antes);
  });

  // ==================== O anexo do diário de internação ====================

  it('o anexo do diário de internação também chega — é o laudo do hospital', async () => {
    /* Abrir internação é da equipe técnica e da coordenação (§8.11); a
       Enfermagem escreve no diário, e é o diário que interessa aqui. */
    const int = await request(http).post('/api/v1/nursing/hospitalizations')
      .set(auth(tokens.tecnica))
      .send({ personId: ids.pessoa, houseId: ids.casa,
              hospital: 'Hospital do ensaio (fictício)',
              motivo: 'Crise respiratória.', desde: new Date().toISOString() });
    expect(int.status).toBe(201);

    const antes = (await dossie()).length;
    const nota = await request(http)
      .post(`/api/v1/nursing/hospitalizations/${int.body.id}/notes`)
      .set(auth(tokens.enfermagem))
      .send({ texto: 'O hospital entregou o laudo da radiografia de tórax.',
              conteudo: PDF, nomeArquivo: 'laudo-torax.pdf' });
    expect(nota.status).toBe(201);

    const depois = await dossie();
    expect(depois.length).toBe(antes + 1);
    const espelho = depois.find((d: any) => d.origem === 'Anexo do diário de internação');
    expect(espelho).toBeDefined();
    /* Uma internação encerrada some da tela da casa; o laudo é da criança e
       fica na vida dela. */
    expect(espelho.aceitoEm).toBeTruthy();
  });

  it('um registro do diário SEM anexo não põe nada na pasta', async () => {
    const { rows: [i] } = await admin.query(
      `SELECT id FROM hospitalization WHERE person_id = $1 ORDER BY opened_at DESC LIMIT 1`,
      [ids.pessoa]);
    const antes = (await dossie()).length;
    const r = await request(http).post(`/api/v1/nursing/hospitalizations/${i.id}/notes`)
      .set(auth(tokens.enfermagem))
      .send({ texto: 'Passou bem a noite; a febre cedeu de madrugada.' });
    expect(r.status).toBe(201);
    expect((await dossie()).length).toBe(antes);
  });

  // ==================== O espelho não se repete ====================

  it('reprocessar a mesma origem NÃO cria um segundo documento', async () => {
    const antes = (await dossie()).length;
    /* É o que uma fila offline reenviada faz, e o que um clique duplo no fim
       de um turno de doze horas faz. Sem a idempotência, a pasta da criança
       encheria de receitas repetidas que ninguém consegue distinguir. */
    await admin.query(
      `SELECT set_config('app.user_id',
         (SELECT id::text FROM app_user WHERE email = 'enfermagem@paodospobres.dev'), false)`);
    const { rows: [r] } = await admin.query(
      `SELECT * FROM app_espelhar_no_dossie($1,'saude','receita','Receita — 15/09',
         'Receita anexada à prescrição de Amoxicilina 250mg', $2, 'k', 's', 'application/pdf',
         'receita.pdf', NULL)`,
      [ids.pessoa, `prescription_document:${ids.receita}`]);
    expect(r.criado).toBe(false);
    expect((await dossie()).length).toBe(antes);
  });

  // ==================== O que NÃO é da criança ====================

  it('a nota fiscal do medicamento NÃO vai para o dossiê de ninguém', async () => {
    const antes = (await dossie()).length;
    const r = await request(http).post('/api/v1/medications/purchases')
      .set(auth(tokens.enfermagem))
      .send({ houseId: ids.casa, em: new Date().toISOString().slice(0, 10),
              itens: 'Amoxicilina 250mg — 2 frascos', fornecedor: 'Farmácia do ensaio',
              totalCents: 4200, conteudo: PDF, nomeArquivo: 'nota.pdf' });
    expect(r.status).toBe(201);

    /* `medication_purchase` tem casa e NÃO tem pessoa: a compra é da CASA, e o
       remédio serve a quem precisar dele. Espelhá-la no dossiê de uma criança
       seria inventar um vínculo que o dado não tem, e pôr uma despesa da casa
       no prontuário de alguém. O §9 dizia "três vezes"; são duas. */
    expect((await dossie()).length).toBe(antes);
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM document WHERE mirror_of LIKE 'medication_purchase:%'`);
    expect(rows[0].n).toBe(0);
  });
});
