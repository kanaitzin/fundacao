/**
 * A SAÍDA COM A HISTÓRIA (fase 270, pedido de 03/11).
 *
 * Quando a criança sai, a folha de transição vai com quem a recebe e o livro da
 * vida vai com ela. Esta suíte cobra o que entra e, sobretudo, o que nunca entra:
 *  - a transição leva os cuidados, a alergia, a alimentação, os remédios em uso
 *    com os horários (os mesmos do banco), a escola e os documentos, e NÃO leva
 *    documento da área restrita;
 *  - o livro leva as vivências e as conquistas, e SÓ as fotografias com a
 *    autorização de imagem registrada, mesmo para a técnica, que no relatório das
 *    vivências inclui todas;
 *  - o educador não prepara nenhuma das duas;
 *  - os nomes dos tipos de vivência do livro são os do álbum.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import JSZip from 'jszip';
import { AppModule } from '../src/app.module';
import { TIPOS_DE_VIVENCIA } from '../src/modules/people/dossie-exigido';
import { ROTULO_DA_VIVENCIA, QUEM_PREPARA_A_SAIDA } from '../src/modules/reports/saida-folha';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const JPEG = `data:image/jpeg;base64,${Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ...new Array(64).fill(0x20), 0xff, 0xd9,
]).toString('base64')}`;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==';

describe('A saída com a história', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  let AI3 = '', crianca = '', comRemedio = '';
  const auth = (x: string) => ({ Authorization: `Bearer ${x}` });
  const post = (tok: string, url: string, body: any) =>
    request(http).post(`/api/v1${url}`).set(auth(tok)).send(body);
  const texto = (folha: any) => JSON.stringify(folha);

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    for (const [k, email] of Object.entries({
      tecnica: 'tecnica.ai3@paodospobres.dev', educador: 'educador.ai3@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) {
      t[k] = (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
    }
    const nova = await post(t.tecnica, '/people/admission', {
      houseId: AI3,
      pessoa: { fullName: 'Criança da Saída (fictícia)', socialName: 'Saída', birthDate: '2016-06-06',
                schoolName: 'EMEF Fictícia da Saída', schoolGrade: '4º ano', schoolShift: 'manhã',
                essentialCare: 'Dorme com a luz do corredor acesa.' },
      acolhimento: { broughtBy: 'Conselho Tutelar', provisionalReason: 'Fixture de teste, sem documentos.',
                     capacityReason: 'Fixture de teste automatizado da saída com a história.' },
      judicial: { reasonCategory: 'negligencia', determiningBody: 'vara_da_infancia' },
    });
    expect(nova.status).toBe(201);
    crianca = nova.body.personId;
    /* Uma criança da casa com remédio ativo e horário, para conferir a grade contra o banco. */
    const { rows: [r] } = await admin.query(
      `SELECT pr.person_id FROM prescription pr
         JOIN house_stay s ON s.person_id = pr.person_id AND s.status = 'ativa' AND s.house_id = $1
        WHERE pr.status = 'ativa' AND EXISTS (SELECT 1 FROM medication_schedule ms WHERE ms.prescription_id = pr.id)
          AND (pr.ends_on IS NULL OR pr.ends_on >= app_hoje())
        LIMIT 1`, [AI3]);
    comRemedio = r.person_id;
  });

  afterAll(async () => {
    const r = await post(t.tecnica, `/people/${crianca}/discharge`, { motivo: 'Encerramento de fixture de teste' });
    expect([200, 201]).toContain(r.status);
    await app.close(); await admin.end();
  });

  it('os nomes dos tipos de vivência do livro são os do álbum, e quem prepara é a área restrita', () => {
    expect(ROTULO_DA_VIVENCIA).toEqual(Object.fromEntries(TIPOS_DE_VIVENCIA.map((x) => [x.code, x.label])));
    expect(QUEM_PREPARA_A_SAIDA).toEqual(['equipe_tecnica', 'coordenador', 'gestor_geral']);
  });

  it('a folha de transição leva o que quem recebe precisa, e nada da área restrita', async () => {
    expect((await post(t.enfermagem, `/people/${crianca}/health-conditions`,
      { tipo: 'alergia', descricao: 'camarão', gravidade: 'grave', alertaEssencial: true })).status).toBe(201);
    expect((await post(t.tecnica, `/people/${crianca}/food-restrictions`,
      { restricao: 'Lactose', substituicao: 'Leite sem lactose', orientacao: 'Conferir o rótulo' })).status).toBe(201);
    expect((await post(t.tecnica, `/people/${crianca}/documents`, {
      chave: 'certidao_nascimento', categoria: 'pessoal', titulo: 'Certidão de nascimento',
      conteudo: PNG, nomeArquivo: 'certidao.png', emitidoEm: '2016-06-10' })).status).toBe(201);
    expect((await post(t.tecnica, `/people/${crianca}/documents`, {
      chave: 'decisao_judicial', categoria: 'judicial_socioassistencial', titulo: 'Decisão judicial',
      conteudo: PNG, nomeArquivo: 'decisao.png' })).status).toBe(201);

    const r = await request(http).get(`/api/v1/impacto/saida/${crianca}/transicao/folha`).set(auth(t.tecnica));
    expect(r.status).toBe(200);
    const f = texto(r.body);
    for (const deve of ['Folha de transição', 'Dorme com a luz do corredor acesa.', 'camarão',
      'Evitar: Lactose.', 'No lugar: Leite sem lactose.', 'EMEF Fictícia da Saída', 'Certidão de nascimento',
      'Recebi a criança']) {
      expect(f).toContain(deve);
    }
    /* O documento da área restrita não vai, nem o motivo do acolhimento. */
    expect(f).not.toContain('Decisão judicial');
    expect(f).not.toMatch(/[Nn]eglig/);
    expect(f).not.toMatch(/undefined|null|NaN/);

    /* Os remédios, com os horários do banco. */
    const { rows: remedios } = await admin.query(
      `SELECT pr.medication, array_agg(to_char(ms.time_of_day, 'HH24:MI') ORDER BY ms.time_of_day) AS h
         FROM prescription pr JOIN medication_schedule ms ON ms.prescription_id = pr.id
        WHERE pr.person_id = $1 AND pr.status = 'ativa' AND (pr.ends_on IS NULL OR pr.ends_on >= app_hoje())
        GROUP BY pr.medication`, [comRemedio]);
    const r2 = await request(http).get(`/api/v1/impacto/saida/${comRemedio}/transicao/folha`).set(auth(t.tecnica));
    expect(r2.status).toBe(200);
    const tabela = r2.body.secoes.find((s: any) => s.titulo === 'Medicamentos em uso').tabela;
    expect(remedios.length).toBeGreaterThan(0);
    for (const m of remedios) {
      const linha = tabela.linhas.find((l: string[]) => l[0].startsWith(m.medication));
      expect(linha?.[2]).toBe(m.h.join(', '));
    }
  });

  it('o livro da vida leva as vivências e só as fotografias com autorização', async () => {
    const v = await post(t.educador, `/people/${crianca}/memories`, {
      tipo: 'passeio', quando: '2026-09-20', descricao: 'Passeio ao parque com a turma, com pipoca.',
      fotos: [
        { conteudo: JPEG, nomeArquivo: 'parque-1.jpg', autorizacaoRegistrada: true },
        { conteudo: JPEG, nomeArquivo: 'parque-2.jpg', autorizacaoRegistrada: false },
      ],
    });
    expect(v.status).toBe(201);
    const r = await request(http).get(`/api/v1/impacto/saida/${crianca}/livro/folha`).set(auth(t.tecnica));
    expect(r.status).toBe(200);
    expect(r.body.titulo).toBe('Livro da vida');
    const secao = r.body.secoes.find((s: any) => /Passeio/.test(s.titulo));
    expect(secao.paragrafos).toEqual(['Passeio ao parque com a turma, com pipoca.']);
    /* Duas fotos, uma autorizada: o livro sai da instituição e leva só a autorizada. */
    expect(secao.imagens).toHaveLength(1);
    const f = texto(r.body);
    for (const nunca of ['camarão', 'Lactose', 'Certidão', 'Decisão', 'Neglig']) expect(f).not.toContain(nunca);

    /* O Word abre, e leva uma imagem só. */
    const w = await post(t.tecnica, `/impacto/saida/${crianca}/livro/export`,
      { finalidade: 'Entregar à criança na saída (teste automatizado)' });
    expect(w.status).toBe(201);
    const zip = await JSZip.loadAsync(Buffer.from(w.body.conteudoBase64, 'base64'));
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).toContain('LIVRO DA VIDA');
    expect(doc).toContain('Passeio ao parque com a turma, com pipoca.');
    /* Uma entrada de fotografia só: a sem autorização não aparece nem como legenda. */
    expect(doc.match(/Fotografia/g)?.length).toBe(1);
  });

  it('o educador não prepara nenhuma das duas folhas', async () => {
    for (const rota of [`/impacto/saida/${crianca}/transicao/folha`, `/impacto/saida/${crianca}/livro/folha`]) {
      const r = await request(http).get(`/api/v1${rota}`).set(auth(t.educador));
      expect(r.status).toBe(403);
      expect(r.body.message).toMatch(/equipe técnica e pela coordenação/);
    }
    const r = await post(t.educador, `/impacto/saida/${crianca}/transicao/export`, { finalidade: 'Tentativa de exportação' });
    expect(r.status).toBe(403);
  });
});
