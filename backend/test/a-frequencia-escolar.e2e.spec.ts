/**
 * A FREQUÊNCIA ESCOLAR (fase 283, primeira avaliação humana de 05/11, módulo 07;
 * decidido em 06/11: o educador marca no Dia da Casa, e a técnica e a coordenação
 * corrigem com o motivo e o comprovante).
 *
 * Esta suíte cobra:
 *  1. o vínculo com aula hoje aparece no Dia, ainda não verificado, e nunca como falta;
 *  2. o educador marca, não marca de novo, e não marca dia antigo;
 *  3. não foi e não teve aula pedem o motivo; dia sem aula do vínculo é recusado;
 *  4. a técnica corrige com o motivo e o comprovante, e a marca anterior continua legível;
 *  5. o perfil conta o mês do vínculo, com o não verificado separado;
 *  6. o comprovante abre, e a abertura fica na auditoria da casa.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
/* Uma imagem PNG pequena e inteira, para o comprovante. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==';

describe('A frequência escolar', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let hoje = '', ontem = '', anteontem = '';

  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const auth = (k: string) => ({ Authorization: `Bearer ${t[k]}` });
  const marcar = (quem: string, corpo: Record<string, unknown>) =>
    request(http).post(`/api/v1/nursing/education-links/${ids.vinculo}/attendance`).set(auth(quem)).send(corpo);

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
      educador: 'educador.ai3@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      cozinha: 'cozinha.ai3@paodospobres.dev',
    })) t[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.pessoa }] } = await admin.query(
      `SELECT p.id FROM person p JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa'
        WHERE s.house_id = $1 AND p.full_name LIKE 'Felipe%' LIMIT 1`, [ids.AI3]));
    ({ rows: [{ hoje, ontem, anteontem }] } = await admin.query(
      `SELECT app_hoje()::text AS hoje, (app_hoje() - 1)::text AS ontem, (app_hoje() - 2)::text AS anteontem`));
    /* Todos os dias da semana são de aula, menos o dia da semana de ontem: assim o teste
       tem um dia sem aula conhecido, qualquer que seja o dia de hoje. */
    const { rows: [{ dow }] } = await admin.query(`SELECT extract(isodow FROM app_hoje() - 1)::int AS dow`);
    const dias = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== dow);
    const r = await request(http).post(`/api/v1/nursing/education/${ids.pessoa}/links`).set(auth('tecnica'))
      .send({ tipo: 'ensino_fundamental', instituicao: 'Escola da Frequência', turno: 'manha', dias,
              inicio: (await admin.query(`SELECT (app_hoje() - 40)::text AS d`)).rows[0].d });
    expect(r.status).toBe(201);
    ids.vinculo = r.body.id;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('o vínculo com aula hoje aparece no Dia, ainda não verificado', async () => {
    const r = await request(http).get(`/api/v1/nursing/education-attendance?houseId=${ids.AI3}`).set(auth('educador'));
    expect(r.status).toBe(200);
    expect(r.body.marca).toBe(true);
    expect(r.body.corrige).toBe(false);
    const v = r.body.vinculos.find((x: any) => x.id === ids.vinculo);
    expect(v.situacao).toBe('nao_verificado');
    expect(v.rotulo).toBe('Ainda não verificado');
  });

  it('o educador marca hoje, não marca de novo, e não marca dia antigo', async () => {
    expect((await marcar('educador', { dia: hoje, situacao: 'presente' })).status).toBe(201);
    const de2 = await marcar('educador', { dia: hoje, situacao: 'ausente', motivo: 'Febre (fictício)' });
    expect(de2.status).toBe(400);
    expect(de2.body.message).toMatch(/técnica ou a coordenação/);
    const antigo = await marcar('educador', { dia: anteontem, situacao: 'presente' });
    expect(antigo.status).toBe(400);
    const r = await request(http).get(`/api/v1/nursing/education-attendance?houseId=${ids.AI3}`).set(auth('tecnica'));
    const v = r.body.vinculos.find((x: any) => x.id === ids.vinculo);
    expect(v.situacao).toBe('presente');
    expect(v.por).toBeTruthy();
  });

  it('não foi pede o motivo, e o dia sem aula do vínculo é recusado', async () => {
    expect((await marcar('tecnica', { dia: anteontem, situacao: 'ausente' })).status).toBe(400);
    const semAula = await marcar('tecnica', { dia: ontem, situacao: 'presente' });
    expect(semAula.status).toBe(400);
    expect(semAula.body.message).toMatch(/não é dia de aula/);
    expect((await marcar('tecnica', { dia: anteontem, situacao: 'ausente', motivo: 'Consulta médica (fictício).' })).status).toBe(201);
  });

  it('a técnica corrige com o motivo e o comprovante, e a anterior continua legível', async () => {
    const semMotivo = await marcar('tecnica', { dia: hoje, situacao: 'sem_aula', motivo: 'Suspensão (fictício)' });
    expect(semMotivo.status).toBe(400);
    const ok = await marcar('tecnica', { dia: hoje, situacao: 'sem_aula', motivo: 'Aula suspensa pela escola (fictício)',
      correcao: 'A escola avisou depois que não houve aula.', comprovante: PNG });
    expect(ok.status).toBe(201);
    const d = (await request(http).get(`/api/v1/nursing/education/${ids.pessoa}`).set(auth('educador'))).body;
    const v = d.vinculos.find((x: any) => x.id === ids.vinculo);
    const doDia = v.frequencia.marcas.filter((m: any) => m.dia === hoje);
    expect(doDia).toHaveLength(2);
    expect(doDia.find((m: any) => m.corrigida).situacao).toBe('presente');
    const viva = doDia.find((m: any) => !m.corrigida);
    expect(viva.situacao).toBe('sem_aula');
    expect(viva.corrigeUmaAnterior).toBe(true);
    expect(viva.comprovante).toBeTruthy();
    ids.marca = viva.id;
  });

  it('o perfil conta os dias do vínculo, com o não verificado separado e sem falta', async () => {
    const d = (await request(http).get(`/api/v1/nursing/education/${ids.pessoa}`).set(auth('tecnica'))).body;
    const f = d.vinculos.find((x: any) => x.id === ids.vinculo).frequencia;
    expect(f.contagem.sem_aula).toBe(1);
    expect(f.contagem.ausente).toBe(1);
    expect(f.contagem.presente).toBe(0);
    expect(f.contagem.nao_verificado).toBeGreaterThan(0);
    expect(Object.keys(f.contagem).sort()).toEqual(['ausente', 'nao_verificado', 'presente', 'sem_aula']);
    expect(f.dias.some((x: any) => x.dia === ontem)).toBe(false);
  });

  it('a cozinha não marca', async () => {
    expect((await marcar('cozinha', { dia: hoje, situacao: 'presente' })).status).toBe(403);
  });

  it('o comprovante abre, e a abertura fica na auditoria da casa', async () => {
    const r = await request(http).post(`/api/v1/nursing/education-attendance/${ids.marca}/proof`).set(auth('tecnica'));
    expect(r.status).toBe(201);
    expect(r.body.conteudo).toBe(PNG);
    const { rows } = await admin.query(
      `SELECT action, house_id FROM audit_event
        WHERE (entity_id = $1 AND action = 'education.attendance.proof.read')
           OR (entity_id = $2 AND action LIKE 'education.attendance%') ORDER BY at`, [ids.marca, ids.vinculo]);
    expect(rows.map((x) => x.action)).toEqual(['education.attendance', 'education.attendance',
      'education.attendance.corrected', 'education.attendance.proof.read']);
    expect(rows.every((x) => x.house_id === ids.AI3)).toBe(true);
  });
});
