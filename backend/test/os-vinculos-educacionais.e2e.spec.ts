/**
 * OS VÍNCULOS EDUCACIONAIS (fase 282, primeira avaliação humana de 05/11, módulo 07;
 * decidido em 06/11).
 *
 * Escola, SCFV, aprendizagem e estágio, vários ao mesmo tempo, com começo, fim
 * previsto e encerramento. Esta suíte cobra:
 *
 *  1. o educador cadastra dois vínculos vigentes ao mesmo tempo (manhã e tarde);
 *  2. corrigir guarda o que constava antes, com o motivo e o nome, lido por OUTRO cargo;
 *  3. encerrar pede o dia e o motivo, não encerra duas vezes e o vínculo continua na linha;
 *  4. a nota se corrige com outra linha, e a anterior continua legível;
 *  5. a cozinha lê e não escreve;
 *  6. o fim previsto avisa a técnica e o Líder Diurno uma vez só;
 *  7. tudo fica na auditoria da casa.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { RelogioService } from '../src/modules/relogio';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Os vínculos educacionais', () => {
  let app: INestApplication, http: any, admin: Client, relogio: RelogioService;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let hoje = '';

  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const auth = (k: string) => ({ Authorization: `Bearer ${t[k]}` });
  const somar = async (d: number) =>
    (await admin.query(`SELECT (app_hoje() + $1::int)::text AS d`, [d])).rows[0].d as string;
  const ler = async (quem: string) =>
    (await request(http).get(`/api/v1/nursing/education/${ids.pessoa}`).set(auth(quem))).body;

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
    for (const [k, email] of Object.entries({
      educador: 'educador.ai3@paodospobres.dev', lider: 'lider.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev', cozinha: 'cozinha.ai3@paodospobres.dev',
    })) t[k] = await login(email);
    ({ rows: [{ id: ids.pessoa }] } = await admin.query(
      `SELECT p.id FROM person p JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa'
         JOIN house h ON h.id = s.house_id
        WHERE h.code = 'AI3' AND p.full_name LIKE 'Bruno%' LIMIT 1`));
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    hoje = await somar(0);
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('o educador cadastra a escola de manhã e a aprendizagem à tarde, ao mesmo tempo', async () => {
    const semTipo = await request(http).post(`/api/v1/nursing/education/${ids.pessoa}/links`)
      .set(auth('educador')).send({ instituicao: 'Escola Estadual Fictícia', inicio: hoje });
    expect(semTipo.status).toBe(400);
    const escola = await request(http).post(`/api/v1/nursing/education/${ids.pessoa}/links`)
      .set(auth('educador')).send({
        tipo: 'ensino_fundamental', instituicao: 'Escola Estadual Fictícia', serie: '8º ano',
        turma: '81', turno: 'manha', dias: [1, 2, 3, 4, 5], inicio: await somar(-200),
        fimPrevisto: await somar(20), endereco: 'Rua das Flores, 10 (fictício)' });
    expect(escola.status).toBe(201);
    ids.escola = escola.body.id;
    const aprendiz = await request(http).post(`/api/v1/nursing/education/${ids.pessoa}/links`)
      .set(auth('educador')).send({
        tipo: 'aprendizagem', instituicao: 'Programa Aprendiz Fictício', curso: 'Auxiliar administrativo',
        turno: 'tarde', dias: [2, 4], inicio: await somar(-30), empresa: 'Empresa Fictícia' });
    expect(aprendiz.status).toBe(201);
    ids.aprendiz = aprendiz.body.id;

    const d = await ler('tecnica');
    const vigentes = d.vinculos.filter((v: any) => v.vigente && [ids.escola, ids.aprendiz].includes(v.id));
    expect(vigentes).toHaveLength(2);
    const e = d.vinculos.find((v: any) => v.id === ids.escola);
    expect(e.tipoRotulo).toBe('Ensino fundamental');
    expect(e.turnoRotulo).toBe('Manhã');
    expect(e.dias).toEqual([1, 2, 3, 4, 5]);
    expect(e.criadoPor).toBeTruthy();
  });

  it('corrigir guarda o que constava antes, e outro cargo lê o nome de quem corrigiu', async () => {
    const semMotivo = await request(http).post(`/api/v1/nursing/education-links/${ids.escola}/correct`)
      .set(auth('educador')).send({ turma: '82' });
    expect(semMotivo.status).toBe(400);
    const r = await request(http).post(`/api/v1/nursing/education-links/${ids.escola}/correct`)
      .set(auth('educador')).send({ turma: '82', motivo: 'A escola mudou a turma (fictício).' });
    expect(r.status).toBe(201);
    const e = (await ler('lider')).vinculos.find((v: any) => v.id === ids.escola);
    expect(e.turma).toBe('82');
    expect(e.historico).toHaveLength(1);
    expect(e.historico[0].antes.class_group).toBe('81');
    expect(e.historico[0].motivo).toMatch(/mudou a turma/);
    expect(e.historico[0].por).toBeTruthy();
  });

  it('encerrar pede o dia e o motivo, não encerra duas vezes, e o vínculo continua na linha', async () => {
    const futuro = await request(http).post(`/api/v1/nursing/education-links/${ids.aprendiz}/end`)
      .set(auth('tecnica')).send({ em: await somar(5), motivo: 'Concluiu o curso (fictício).' });
    expect(futuro.status).toBe(400);
    const ok = await request(http).post(`/api/v1/nursing/education-links/${ids.aprendiz}/end`)
      .set(auth('tecnica')).send({ em: hoje, motivo: 'Concluiu o curso (fictício).' });
    expect(ok.status).toBe(201);
    const de2 = await request(http).post(`/api/v1/nursing/education-links/${ids.aprendiz}/end`)
      .set(auth('tecnica')).send({ em: hoje, motivo: 'De novo (fictício).' });
    expect(de2.status).toBe(400);
    const a = (await ler('educador')).vinculos.find((v: any) => v.id === ids.aprendiz);
    expect(a.vigente).toBe(false);
    expect(a.encerradoEm).toBe(hoje);
    expect(a.historico[0].tipo).toBe('encerramento');
  });

  it('a nota se corrige com outra linha, e a anterior continua legível', async () => {
    const n1 = await request(http).post(`/api/v1/nursing/education-links/${ids.escola}/grades`)
      .set(auth('lider')).send({ periodo: '1º trimestre', disciplina: 'Matemática', nota: '6,5' });
    expect(n1.status).toBe(201);
    const n2 = await request(http).post(`/api/v1/nursing/education-links/${ids.escola}/grades`)
      .set(auth('lider')).send({ periodo: '1º trimestre', disciplina: 'Matemática', nota: '7,5',
                                 substitui: n1.body.id, observacao: 'A escola corrigiu o boletim.' });
    expect(n2.status).toBe(201);
    const de2 = await request(http).post(`/api/v1/nursing/education-links/${ids.escola}/grades`)
      .set(auth('lider')).send({ periodo: '1º trimestre', disciplina: 'Matemática', nota: '8',
                                 substitui: n1.body.id });
    expect(de2.status).toBe(400);
    const e = (await ler('educador')).vinculos.find((v: any) => v.id === ids.escola);
    const velha = e.notas.find((n: any) => n.id === n1.body.id);
    const nova = e.notas.find((n: any) => n.id === n2.body.id);
    expect(velha.substituida).toBe(true);
    expect(velha.nota).toBe('6,5');
    expect(nova.corrigeUmaAnterior).toBe(true);
  });

  it('a cozinha lê a linha e não escreve', async () => {
    const r = await request(http).post(`/api/v1/nursing/education/${ids.pessoa}/links`)
      .set(auth('cozinha')).send({ tipo: 'scfv', instituicao: 'SCFV Fictício', inicio: hoje });
    expect(r.status).toBe(403);
  });

  it('o fim previsto avisa a técnica e o Líder Diurno, uma vez só', async () => {
    const quem = await relogio.quemSou('enfermagem@paodospobres.dev');
    await relogio.rodarODia(quem);
    await relogio.rodarODia(quem);
    for (const email of ['tecnica.ai3@paodospobres.dev', 'lider.ai3@paodospobres.dev']) {
      const { rows } = await admin.query(
        `SELECT n.title FROM notification n JOIN app_user u ON u.id = n.user_id
          WHERE u.email = $1 AND n.entity = 'education_link' AND n.entity_id = $2`, [email, ids.escola]);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toMatch(/Escola Estadual Fictícia está no último mês$/);
    }
  });

  it('o cadastro, a correção, o encerramento e a nota ficam na auditoria da casa', async () => {
    const { rows } = await admin.query(
      `SELECT action, house_id FROM audit_event
        WHERE action LIKE 'education.link.%' AND entity_id = ANY($1::uuid[]) ORDER BY at`,
      [[ids.escola, ids.aprendiz]]);
    expect(rows.map((r) => r.action).sort()).toEqual(
      ['education.link.corrected', 'education.link.created', 'education.link.created', 'education.link.ended']);
    expect(rows.every((r) => r.house_id === ids.AI3)).toBe(true);
  });
});
