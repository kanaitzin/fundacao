/**
 * O SIGILO DE SAÚDE TAMBÉM NO BANCO (fase 297; o M4 da análise geral de 08/11).
 *
 * Até a 1691, o conteúdo da consulta e do atendimento sigilosos era escondido só pelo
 * servidor: o papel da aplicação lia `reason`, `state_return` e o complemento da Enfermagem
 * de qualquer registro da casa, e uma consulta nova que esquecesse o CASE entregava tudo.
 * Esta suíte prova, como o papel da aplicação e com a identidade de cada cargo:
 *  1. as tabelas não entregam o conteúdo a ninguém, e a escrita direta ficou só na
 *     situação do atendimento e na triagem;
 *  2. as visões entregam o conteúdo do registro sigiloso só a quem lê o sigilo;
 *  3. as visões devolvem as mesmas linhas que a política de leitura das tabelas;
 *  4. nega por padrão: coluna nova das três tabelas reprova até alguém dizer se ela é
 *     conteúdo (só pela visão) ou o que diz que o registro existe (lista abaixo);
 *  5. o retorno de uma consulta sigilosa nasce sigiloso, e o histórico do sigilo (quem
 *     marcou e por quê) só se lê com o sigilo (1692).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/kernel/database/database.service';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const SEGREDO = 'Conteúdo sigiloso da conferência 297';
const ABERTO = 'Conteúdo aberto da conferência 297';

/** O que diz que o registro existe: a aplicação lê direto na tabela. O resto é conteúdo. */
const O_QUE_DIZ_QUE_EXISTE: Record<string, string[]> = {
  health_encounter: ['id', 'person_id', 'house_id', 'kind', 'happened_at', 'status', 'return_on',
    'created_at', 'created_by', 'return_done_in', 'confidential'],
  health_evolution: ['id', 'person_id', 'house_id', 'encounter_id', 'kind', 'happened_at',
    'accompanied_by', 'signed_at', 'offline', 'synced_at', 'client_op_id', 'status', 'created_at',
    'nurse_signed_by', 'nurse_signed_at', 'coord_signed_by', 'coord_signed_at', 'confidential'],
  nursing_triage: ['id', 'evolution_id', 'nurse_id', 'action', 'at'],
};
const VISAO: Record<string, string> = {
  health_encounter: 'health_encounter_legivel',
  health_evolution: 'health_evolution_legivel',
  nursing_triage: 'nursing_triage_legivel',
};

describe('O sigilo de saúde também no banco', () => {
  let app: INestApplication, http: any, admin: Client, db: DatabaseService;
  const t: Record<string, string> = {};
  const u: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const auth = (k: string) => ({ Authorization: `Bearer ${t[k]}` });
  const enviar = (sigiloso: boolean, texto: string, extra: Record<string, unknown> = {}) =>
    request(http).post('/api/v1/nursing/evolutions').set(auth('educador'))
      .send({ personId: ids.crianca, houseId: ids.AI3, tipo: 'consulta',
              quandoAconteceu: new Date().toISOString(), especialidade: texto,
              estadoRetorno: texto, sigiloso, prazoRetorno: null, ...extra });
  /** Uma consulta como o papel da aplicação, com a identidade de quem. */
  const comoApp = <T>(quem: string, sql: string, p: unknown[] = []) =>
    db.asUser(u[quem], async (c) => (await c.query(sql, p)).rows as T[]);
  const erroComoApp = async (quem: string, sql: string, p: unknown[] = []) => {
    try { await comoApp(quem, sql, p); return ''; } catch (e: any) { return String(e?.message ?? e); }
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
    db = app.get(DatabaseService);
    for (const [k, email] of Object.entries({
      educador: 'educador.ai3@paodospobres.dev', gestor: 'gestor@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
    })) {
      u[k] = (await admin.query(`SELECT id FROM app_user WHERE email = $1`, [email])).rows[0].id;
      t[k] = (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
    }
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.crianca }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa' ORDER BY p.full_name OFFSET 8 LIMIT 1`, [ids.AI3]));
    const s = await enviar(true, SEGREDO);
    const a = await enviar(false, ABERTO);
    expect([s.status, a.status]).toEqual([201, 201]);
    ids.evoSigilosa = s.body.id ?? s.body.evolutionId ?? s.body.out_evolution_id;
    ids.evoAberta = a.body.id ?? a.body.evolutionId ?? a.body.out_evolution_id;
    ({ rows: [{ encounter_id: ids.consultaSigilosa }] } = await admin.query(
      `SELECT encounter_id FROM health_evolution WHERE id = $1`, [ids.evoSigilosa]));
    // A Enfermagem pede complemento no sigiloso, com o texto dela.
    const tr = await request(http).post(`/api/v1/nursing/evolutions/${ids.evoSigilosa}/triage`)
      .set(auth('enfermagem')).send({ acao: 'pedir_complemento', pedido: SEGREDO });
    expect(tr.status).toBeLessThan(300);
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('as tabelas não entregam o conteúdo a ninguém, e a escrita direta ficou na situação e na triagem', async () => {
    for (const quem of ['educador', 'enfermagem', 'tecnica', 'coord']) {
      expect(await erroComoApp(quem, `SELECT reason FROM health_encounter LIMIT 1`)).toMatch(/permission denied/);
      expect(await erroComoApp(quem, `SELECT state_return FROM health_evolution LIMIT 1`)).toMatch(/permission denied/);
      expect(await erroComoApp(quem, `SELECT request_note FROM nursing_triage LIMIT 1`)).toMatch(/permission denied/);
      expect(await erroComoApp(quem, `SELECT * FROM health_evolution LIMIT 1`)).toMatch(/permission denied/);
    }
    // O que diz que existe continua legível, e a política continua valendo.
    const [l] = await comoApp<any>('educador',
      `SELECT id, confidential FROM health_encounter WHERE id = $1`, [ids.consultaSigilosa]);
    expect(l.confidential).toBe(true);
    // Sobrescrever o conteúdo, ou inserir por fora da função, não passa.
    expect(await erroComoApp('enfermagem',
      `UPDATE health_evolution SET state_return = 'x' WHERE id = $1`, [ids.evoSigilosa])).toMatch(/permission denied/);
    expect(await erroComoApp('enfermagem',
      `UPDATE health_encounter SET reason = 'x' WHERE id = $1`, [ids.consultaSigilosa])).toMatch(/permission denied/);
    expect(await erroComoApp('educador',
      `INSERT INTO health_encounter (person_id, house_id, kind, happened_at) VALUES ($1, $2, 'consulta', now())`,
      [ids.crianca, ids.AI3])).toMatch(/permission denied/);
    const { rows: [txt] } = await admin.query(
      `SELECT state_return FROM health_evolution WHERE id = $1`, [ids.evoSigilosa]);
    expect(txt.state_return).toBe(SEGREDO);
  });

  it('as visões entregam o conteúdo do sigiloso só a quem lê o sigilo', async () => {
    const ler = (quem: string) => Promise.all([
      comoApp<any>(quem, `SELECT id, specialty, reason FROM health_encounter_legivel WHERE person_id = $1`, [ids.crianca]),
      comoApp<any>(quem, `SELECT id, state_return, specialty FROM health_evolution_legivel WHERE id = ANY($1)`,
        [[ids.evoSigilosa, ids.evoAberta]]),
      comoApp<any>(quem, `SELECT request_note FROM nursing_triage_legivel WHERE evolution_id = $1`, [ids.evoSigilosa]),
    ]);
    for (const quem of ['educador', 'gestor']) {
      const [enc, evo, tri] = await ler(quem);
      const tudo = JSON.stringify([enc, evo, tri]);
      expect(tudo).not.toContain(SEGREDO);
      expect(tudo).toContain(ABERTO);
      expect(evo.find((x) => x.id === ids.evoSigilosa)).toBeTruthy();
      expect(enc.find((x) => x.id === ids.consultaSigilosa)).toBeTruthy();
      expect(tri).toHaveLength(1);
    }
    for (const quem of ['enfermagem', 'tecnica', 'coord']) {
      const [enc, evo, tri] = await ler(quem);
      expect(enc.find((x) => x.id === ids.consultaSigilosa)?.specialty).toBe(SEGREDO);
      expect(evo.find((x) => x.id === ids.evoSigilosa)?.state_return).toBe(SEGREDO);
      expect(tri[0].request_note).toBe(SEGREDO);
    }
  });

  it('as visões devolvem as mesmas linhas que a política de leitura das tabelas', async () => {
    for (const quem of ['educador', 'gestor', 'enfermagem', 'tecnica', 'coord', 'coord4']) {
      for (const [tabela, visao] of Object.entries(VISAO)) {
        const daTabela = (await comoApp<any>(quem, `SELECT id FROM ${tabela} ORDER BY id`)).map((r) => r.id);
        const daVisao = (await comoApp<any>(quem, `SELECT id FROM ${visao} ORDER BY id`)).map((r) => r.id);
        expect({ quem, tabela, linhas: daVisao }).toEqual({ quem, tabela, linhas: daTabela });
      }
    }
    // A Casa 04 não vê a criança da Casa 03, nem pela visão.
    const fora = await comoApp<any>('coord4',
      `SELECT id FROM health_evolution_legivel WHERE id = $1`, [ids.evoSigilosa]);
    expect(fora).toHaveLength(0);
  });

  it('coluna nova reprova até alguém dizer se é conteúdo ou o que diz que o registro existe', async () => {
    for (const [tabela, meta] of Object.entries(O_QUE_DIZ_QUE_EXISTE)) {
      const { rows } = await admin.query(
        `SELECT a.attname AS col,
                has_column_privilege('rede_app', a.attrelid, a.attname, 'SELECT') AS le
           FROM pg_attribute a
          WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
          ORDER BY a.attname`, [tabela]);
      const legiveis = rows.filter((r) => r.le).map((r) => r.col).sort();
      expect({ tabela, legiveis }).toEqual({ tabela, legiveis: [...meta].sort() });
      // Toda coluna da tabela chega pela visão (o conteúdo, mascarado).
      const { rows: daVisao } = await admin.query(
        `SELECT attname FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped`,
        [VISAO[tabela]]);
      const naVisao = new Set(daVisao.map((r) => r.attname));
      expect({ tabela, faltam: rows.map((r) => r.col).filter((c) => !naVisao.has(c)) })
        .toEqual({ tabela, faltam: [] });
      // E a visão só se lê, como a aplicação.
      const { rows: [p] } = await admin.query(
        `SELECT has_table_privilege('rede_app', $1, 'INSERT') AS ins,
                has_table_privilege('rede_app', $1, 'UPDATE') AS upd,
                has_table_privilege('public', $1, 'SELECT') AS publico`, [VISAO[tabela]]);
      expect(p).toEqual({ ins: false, upd: false, publico: false });
    }
  });

  it('o retorno de uma consulta sigilosa nasce sigiloso, e o histórico do sigilo só se lê com o sigilo', async () => {
    const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const marcada = await enviar(true, SEGREDO, { prazoRetorno: amanha });
    expect(marcada.status).toBe(201);
    const op = await request(http).get(`/api/v1/nursing/evolutions/options?personId=${ids.crianca}`)
      .set(auth('educador'));
    const { rows: [{ encounter_id: consulta }] } = await admin.query(
      `SELECT encounter_id FROM health_evolution WHERE id = $1`,
      [marcada.body.id ?? marcada.body.evolutionId ?? marcada.body.out_evolution_id]);
    const retorno = op.body.retornosMarcados.find((r: any) => r.id === consulta);
    expect(retorno.rotulo).toBe('Retorno de um registro sigiloso');
    // A educadora registra o retorno sem marcar o sigilo: ele nasce sigiloso assim mesmo.
    const ret = await enviar(false, SEGREDO, { retornoDe: consulta });
    expect(ret.status).toBe(201);
    const novo = ret.body.id ?? ret.body.evolutionId ?? ret.body.out_evolution_id;
    const { rows: [n] } = await admin.query(
      `SELECT ev.confidential AS ev, en.confidential AS en,
              (SELECT count(*)::int FROM health_confidential_change h WHERE h.evolution_id = ev.id) AS hist
         FROM health_evolution ev JOIN health_encounter en ON en.id = ev.encounter_id WHERE ev.id = $1`, [novo]);
    expect(n).toEqual({ ev: true, en: true, hist: 1 });
    const [lido] = await comoApp<any>('educador',
      `SELECT state_return FROM health_evolution_legivel WHERE id = $1`, [novo]);
    expect(lido.state_return).toBeNull();
    // Quem marcou e por quê: só com o sigilo.
    const conta = async (quem: string) => (await comoApp<any>(quem,
      `SELECT count(*)::int AS n FROM health_confidential_change WHERE person_id = $1`, [ids.crianca]))[0].n;
    expect(await conta('educador')).toBe(0);
    expect(await conta('gestor')).toBe(0);
    expect(await conta('tecnica')).toBeGreaterThanOrEqual(2);
  });
});
