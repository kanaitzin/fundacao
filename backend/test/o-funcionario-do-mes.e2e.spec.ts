/**
 * O FUNCIONÁRIO DO MÊS (fase 324, alignments/1728, pedido e decidido pelo dono em 14/11).
 *
 * O que esta suíte cobra:
 *  1. a coordenação da casa escolhe, com o porquê, quem trabalha na casa dela; a pessoa é
 *     avisada; a equipe da casa lê, a cozinha também; a coordenação de outra casa não;
 *  2. a coordenação da casa não escolhe a si mesma, nem gente de outra casa, nem o da
 *     Fundação, nem sem o porquê, nem um mês que não começou;
 *  3. trocar pede o motivo, e a escolha de antes continua registrada;
 *  4. a Coordenação Geral escolhe o da Fundação, e todas as casas leem; o Gestor Geral não escolhe;
 *  5. ninguém grava direto na tabela, e a regra do banco é a do TypeScript.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { hojeNaInstituicao } from '../src/kernel/common/tempo';
import { entrarPelaPrimeiraVez } from './setup/a-senha-dela';
import {
  FRASE_QUEM_ESCOLHE_O_DO_MES, MOTIVO_DA_TROCA_MINIMO, PORQUE_MINIMO, mesesQueSeEscolhem, rotuloDoMes,
} from '../src/modules/alignments/funcionario-do-mes.regra';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O funcionário do mês', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const auth = (k: string) => ({ Authorization: `Bearer ${t[k]}` });
  const get = (k: string, url: string) => request(http).get(`/api/v1${url}`).set(auth(k));
  const post = (k: string, corpo: unknown) =>
    request(http).post('/api/v1/alignments/funcionario-do-mes').set(auth(k)).send(corpo as object);
  const [mes, anterior] = mesesQueSeEscolhem(hojeNaInstituicao());
  const porque = 'Acolheu as crianças novas com calma e organizou a rotina da noite.';

  async function limpar() {
    await admin.query(`DELETE FROM staff_of_month WHERE replaces_id IS NOT NULL AND month IN ($1, $2)`, [mes, anterior]);
    await admin.query(`DELETE FROM staff_of_month WHERE month IN ($1, $2)`, [mes, anterior]);
  }

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
      coord3: 'coord.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
      educ: 'educador.ai3@paodospobres.dev', educ2: 'educador2.ai3@paodospobres.dev',
      cozinha: 'cozinha.ai3@paodospobres.dev', gestor: 'gestor@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) {
      const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
      if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
      t[k] = r.body.token; ids[k] = r.body.user.id;
    }
    const email = `geral.do-mes.${Date.now()}@paodospobres.dev`;
    const cg = await request(http).post('/api/v1/staff').set(auth('gestor')).send({
      nome: 'Geral do Mês', email, cargo: 'coordenador', todasAsCasas: true, senhaInicial: 'Senha-geral-1!' });
    if (cg.status !== 201) throw new Error(`a Coordenação Geral não nasceu: ${cg.status} ${JSON.stringify(cg.body)}`);
    t.geral = await entrarPelaPrimeiraVez(http, email, 'Senha-geral-1!');
    ids.ai3 = (await admin.query(`SELECT id FROM house WHERE code = 'AI3'`)).rows[0].id;
    ids.ai4 = (await admin.query(`SELECT id FROM house WHERE code = 'AI4'`)).rows[0].id;
    ids.de4 = (await admin.query(
      `SELECT a.user_id FROM user_house_assignment a JOIN app_user u ON u.id = a.user_id AND u.active
        WHERE a.house_id = $1 AND a.valid_to IS NULL AND u.role = 'educador'
          AND NOT EXISTS (SELECT 1 FROM user_house_assignment b WHERE b.user_id = u.id AND b.house_id = $2)
        LIMIT 1`, [ids.ai4, ids.ai3])).rows[0]?.user_id;
    await limpar();
  });

  afterAll(async () => { await limpar(); await app.close(); await admin.end(); });

  it('a coordenação da casa escolhe com o porquê, a pessoa é avisada, e a casa lê', async () => {
    const r = await post('coord3', { houseId: ids.ai3, mes, pessoaId: ids.educ, porque });
    expect(r.status).toBe(201);
    ids.escolha = r.body.id;
    const { rows } = await admin.query(
      `SELECT title FROM notification WHERE user_id = $1 AND entity = 'staff_of_month' AND entity_id = $2`,
      [ids.educ, ids.escolha]);
    expect(rows[0]?.title).toBe(`O funcionário do mês da casa em ${rotuloDoMes(mes)} é você`);
    for (const quem of ['educ', 'educ2', 'cozinha', 'geral', 'gestor']) {
      const l = await get(quem, `/alignments/funcionario-do-mes?houseId=${ids.ai3}`);
      expect(l.status).toBe(200);
      const daCasa = l.body.daCasa.find((e: any) => e.id === ids.escolha);
      expect(daCasa?.porque).toBe(porque);
      expect(daCasa?.vale).toBe(true);
    }
    expect((await get('coord4', `/alignments/funcionario-do-mes?houseId=${ids.ai3}`)).status).toBe(404);
  });

  it('a coordenação da casa não escolhe a si mesma, nem outra casa, nem a Fundação, nem sem porquê', async () => {
    expect((await post('coord3', { houseId: ids.ai3, mes: anterior, pessoaId: ids.coord3, porque })).status).toBe(400);
    if (ids.de4) {
      expect((await post('coord3', { houseId: ids.ai3, mes: anterior, pessoaId: ids.de4, porque })).status).toBe(400);
    }
    const fundacao = await post('coord3', { houseId: null, mes: anterior, pessoaId: ids.educ, porque });
    expect(fundacao.status).toBe(403);
    expect(fundacao.body.message).toBe(FRASE_QUEM_ESCOLHE_O_DO_MES);
    expect((await post('coord4', { houseId: ids.ai3, mes: anterior, pessoaId: ids.educ, porque })).status).toBe(403);
    expect((await post('coord3', { houseId: ids.ai3, mes: anterior, pessoaId: ids.educ, porque: 'Muito bom.' })).status).toBe(400);
    const futuro = `${Number(mes.slice(0, 4)) + 1}${mes.slice(4)}`;
    expect((await post('coord3', { houseId: ids.ai3, mes: futuro, pessoaId: ids.educ, porque })).status).toBe(400);
    for (const quem of ['educ', 'cozinha', 'gestor']) {
      expect((await post(quem, { houseId: ids.ai3, mes: anterior, pessoaId: ids.educ2, porque })).status).toBe(403);
    }
  });

  it('trocar pede o motivo, e a escolha de antes continua registrada', async () => {
    const sem = await post('coord3', { houseId: ids.ai3, mes, pessoaId: ids.educ2, porque });
    expect(sem.status).toBe(409);
    const com = await post('coord3', {
      houseId: ids.ai3, mes, pessoaId: ids.educ2, porque, motivoDaTroca: 'A escolha foi feita antes da reunião da equipe.' });
    expect(com.status).toBe(201);
    const l = await get('educ', `/alignments/funcionario-do-mes?houseId=${ids.ai3}`);
    const doMes = l.body.daCasa.filter((e: any) => e.mes === mes);
    expect(doMes.map((e: any) => [e.pessoaId, e.vale])).toEqual(
      expect.arrayContaining([[ids.educ, false], [ids.educ2, true]]));
    expect(doMes.find((e: any) => e.vale).motivoDaTroca).toMatch(/antes da reunião/);
  });

  it('a Coordenação Geral escolhe o da Fundação, e todas as casas leem', async () => {
    const r = await post('geral', { houseId: null, mes, pessoaId: ids.enfermagem, porque });
    expect(r.status).toBe(201);
    expect((await post('geral', { houseId: ids.ai3, mes: anterior, pessoaId: ids.educ, porque })).status).toBe(403);
    for (const quem of ['educ', 'coord4', 'cozinha', 'gestor']) {
      const l = await get(quem, '/alignments/funcionario-do-mes');
      expect(l.status).toBe(200);
      expect(l.body.daFundacao.some((e: any) => e.id === r.body.id && e.vale)).toBe(true);
    }
    const c = await get('geral', '/alignments/funcionario-do-mes/candidatos');
    expect(c.status).toBe(200);
    expect(c.body.pessoas.some((p: any) => p.cargo === 'gestor_geral')).toBe(false);
    expect((await get('educ', '/alignments/funcionario-do-mes/candidatos')).status).toBe(403);
  });

  it('duas escolhas do mesmo mês ao mesmo tempo: uma vale, e a outra recebe a frase, nunca 500', async () => {
    const [x, y] = await Promise.all([
      post('coord3', { houseId: ids.ai3, mes: anterior, pessoaId: ids.educ, porque }),
      post('coord3', { houseId: ids.ai3, mes: anterior, pessoaId: ids.educ2, porque }),
    ]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM staff_of_month WHERE house_id = $1 AND month = $2`, [ids.ai3, anterior]);
    expect(rows[0].n).toBe(1);
  });

  it('ninguém grava direto na tabela, e o banco diz os mesmos mínimos do TypeScript', async () => {
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE rede_app');
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [ids.coord3]);
      await expect(admin.query(
        `INSERT INTO staff_of_month (institution_id, house_id, month, person_id, reason, chosen_by)
         SELECT institution_id, $1, $2::date, $3, $4, $5 FROM house WHERE id = $1`,
        [ids.ai3, anterior, ids.educ, porque, ids.coord3])).rejects.toThrow(/permission denied/);
    } finally { await admin.query('ROLLBACK'); }
    const { rows: [tab] } = await admin.query(
      `SELECT string_agg(pg_get_constraintdef(oid), ' ') AS c FROM pg_constraint WHERE conrelid = 'staff_of_month'::regclass`);
    expect(tab.c).toContain(`length(btrim(reason)) >= ${PORQUE_MINIMO}`);
    expect(tab.c).toContain(`length(btrim(change_reason)) >= ${MOTIVO_DA_TROCA_MINIMO}`);
    expect(mesesQueSeEscolhem('2027-01-15')).toEqual(['2027-01-01', '2026-12-01']);
    expect(rotuloDoMes('2026-11-01')).toBe('novembro de 2026');
  });
});
