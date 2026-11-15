/**
 * O ENCONTRO DE ALINHAMENTO COM QUEM TRABALHA (fase 322, decidido pelo dono em 14/11).
 *
 * O que esta suíte cobra:
 *
 *  1. a coordenação da casa registra com quem trabalha na casa dela, e a pessoa é avisada;
 *  2. o educador, a técnica, o Gestor Geral, a coordenação de outra casa, e a própria
 *     pessoa consigo mesma, não registram;
 *  3. lê a pessoa, quem registrou, a coordenação da casa e a Coordenação Geral; o colega,
 *     a técnica, o Gestor Geral e a outra casa recebem 404;
 *  4. a pessoa dá ciência uma vez, com comentário, e quem registrou é avisado;
 *  5. o adendo é de quem registrou e não muda o que estava escrito;
 *  6. a Coordenação Geral registra com a coordenação da casa e com quem atende todas as
 *     casas, e a coordenação da casa não lê o encontro de outra coordenação;
 *  7. o dia no futuro, o próximo antes do encontro e os pontos positivos curtos são recusados;
 *  8. o relógio avisa quem registrou quando o próximo encontro chega, uma vez só;
 *  9. a aplicação não escreve nas tabelas direto, e a regra da tela é a do banco.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { EncontrosService } from '../src/modules/alignments/encontros.service';
import { RelogioService } from '../src/modules/relogio/relogio.service';
import { QUEM_REGISTRA_ALINHAMENTO } from '../src/modules/alignments/encontros.regra';
import { hojeNaInstituicao } from '../src/kernel/common/tempo';
import { entrarPelaPrimeiraVez } from './setup/a-senha-dela';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const somar = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

describe('O encontro de alinhamento com quem trabalha', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const hoje = hojeNaInstituicao();
  const auth = (k: string) => ({ Authorization: `Bearer ${t[k]}` });
  const post = (k: string, url: string, corpo: unknown) =>
    request(http).post(`/api/v1${url}`).set(auth(k)).send(corpo as object);
  const get = (k: string, url: string) => request(http).get(`/api/v1${url}`).set(auth(k));
  const encontro = (pessoaId: string, extra: Record<string, unknown> = {}) => ({
    pessoaId, periodicidade: 'mensal', dia: hoje,
    positivos: 'Chega no horário e acolhe as crianças com calma na hora de dormir.',
    melhorar: 'Escrever a linha da ATA antes de sair do turno.',
    combinados: 'Conversar de novo no mês que vem.', ...extra,
  });
  const avisos = async (userId: string, titulo: RegExp) => {
    const { rows } = await admin.query(
      `SELECT title FROM notification WHERE user_id = $1 AND entity = 'staff_alignment'`, [userId]);
    return rows.filter((r) => titulo.test(r.title)).length;
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
    for (const [k, email] of Object.entries({
      coord3: 'coord.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
      educ: 'educador.ai3@paodospobres.dev', educ2: 'educador2.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev', gestor: 'gestor@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) {
      const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
      if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
      t[k] = r.body.token;
      ids[k] = r.body.user.id;
    }
    /* A Coordenação Geral, criada pelo Gestor Geral como na suíte dela. */
    const email = `geral.encontro.${Date.now()}@paodospobres.dev`;
    const cg = await post('gestor', '/staff', {
      nome: 'Geral dos Encontros', email, cargo: 'coordenador', todasAsCasas: true,
      senhaInicial: 'Senha-geral-1!' });
    if (cg.status !== 201) throw new Error(`a Coordenação Geral não nasceu: ${cg.status} ${JSON.stringify(cg.body)}`);
    ids.geral = cg.body.id;
    t.geral = await entrarPelaPrimeiraVez(http, email, 'Senha-geral-1!');
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('a coordenação da casa registra com quem trabalha nela, e a pessoa é avisada', async () => {
    const r = await post('coord3', '/alignments/encontros', encontro(ids.educ));
    expect(r.status).toBe(201);
    ids.encontro = r.body.id;
    const meus = await get('educ', '/alignments/encontros/comigo').expect(200);
    const meu = meus.body.encontros.find((e: any) => e.id === ids.encontro);
    expect(meu.positivos).toMatch(/acolhe as crianças/);
    expect(meu.periodicidadeRotulo).toBe('Mensal');
    expect(meu.por).toBeTruthy();
    expect(meu.casa).toBe('AI3');
    expect(meu.ciencia).toBeNull();
    expect(await avisos(ids.educ, /seu encontro de alinhamento/)).toBeGreaterThanOrEqual(1);
    const { rows: [a] } = await admin.query(
      `SELECT house_id FROM audit_event WHERE action = 'alinhamento.registrado' AND entity_id = $1`, [ids.encontro]);
    expect(a.house_id).toBeTruthy();
  });

  it('o educador, a técnica, o Gestor Geral, a outra casa e a própria pessoa não registram', async () => {
    expect((await post('educ', '/alignments/encontros', encontro(ids.educ2))).status).toBe(403);
    expect((await post('tecnica', '/alignments/encontros', encontro(ids.educ))).status).toBe(403);
    expect((await post('gestor', '/alignments/encontros', encontro(ids.coord3))).status).toBe(403);
    expect((await post('coord4', '/alignments/encontros', encontro(ids.educ))).status).toBe(403);
    expect((await post('coord3', '/alignments/encontros', encontro(ids.coord3))).status).toBe(403);
    expect((await post('coord3', '/alignments/encontros', encontro(ids.coord4))).status).toBe(403);
  });

  it('lê a pessoa, quem registrou e a Coordenação Geral; o colega, a técnica, o gestor e a outra casa não', async () => {
    for (const k of ['coord3', 'geral']) {
      const r = await get(k, `/alignments/encontros/pessoa/${ids.educ}`).expect(200);
      expect(r.body.encontros.map((e: any) => e.id)).toContain(ids.encontro);
    }
    for (const k of ['educ2', 'tecnica', 'gestor', 'coord4']) {
      expect((await get(k, `/alignments/encontros/pessoa/${ids.educ}`)).status).toBe(404);
    }
    const lida = await admin.query(
      `SELECT 1 FROM audit_event WHERE action = 'alinhamento.lido' AND entity_id = $1`, [ids.educ]);
    expect(lida.rowCount).toBeGreaterThanOrEqual(1);
  });

  it('a pessoa dá ciência uma vez, com comentário, e quem registrou é avisado', async () => {
    expect((await post('coord3', `/alignments/encontros/${ids.encontro}/ciencia`, {})).status).toBe(404);
    const r = await post('educ', `/alignments/encontros/${ids.encontro}/ciencia`,
      { comentario: 'Combinado, vou escrever a linha antes de sair.' });
    expect(r.status).toBe(201);
    expect((await post('educ', `/alignments/encontros/${ids.encontro}/ciencia`, {})).status).toBe(409);
    const lido = await get('coord3', `/alignments/encontros/pessoa/${ids.educ}`).expect(200);
    const e = lido.body.encontros.find((x: any) => x.id === ids.encontro);
    expect(e.ciencia.comentario).toMatch(/linha antes de sair/);
    expect(await avisos(ids.coord3, /Ciência e comentário/)).toBeGreaterThanOrEqual(1);
  });

  it('o adendo é de quem registrou, e o que estava escrito não muda', async () => {
    const { rows: [antes] } = await admin.query(
      `SELECT positives, to_improve FROM staff_alignment WHERE id = $1`, [ids.encontro]);
    expect((await post('educ', `/alignments/encontros/${ids.encontro}/adendo`,
      { texto: 'Escrevendo um adendo que não é meu.' })).status).toBe(404);
    expect((await post('coord3', `/alignments/encontros/${ids.encontro}/adendo`, { texto: 'curto' })).status).toBe(400);
    const r = await post('coord3', `/alignments/encontros/${ids.encontro}/adendo`,
      { texto: 'Faltou dizer que a passagem de plantão dela é das mais completas.' });
    expect(r.status).toBe(201);
    const { rows: [depois] } = await admin.query(
      `SELECT positives, to_improve FROM staff_alignment WHERE id = $1`, [ids.encontro]);
    expect(depois).toEqual(antes);
    const meus = await get('educ', '/alignments/encontros/comigo').expect(200);
    expect(meus.body.encontros.find((e: any) => e.id === ids.encontro).adendos).toHaveLength(1);
    expect(await avisos(ids.educ, /adendo/i)).toBeGreaterThanOrEqual(1);
  });

  it('nenhum colega lê o encontro, a ciência ou o adendo do outro, nem pelo banco (pedido de 15/11)', async () => {
    const colegas = (await admin.query(
      `SELECT id FROM app_user WHERE email = ANY($1)`,
      [['educador2.ai3@paodospobres.dev', 'lider.ai3@paodospobres.dev', 'lider.noturno@paodospobres.dev',
        'cozinha.ai3@paodospobres.dev', 'tecnica.ai3@paodospobres.dev']])).rows.map((r) => r.id);
    expect(colegas).toHaveLength(5);
    const { rows: [tem] } = await admin.query(
      `SELECT (SELECT count(*) FROM staff_alignment_reply WHERE alignment_id = $1)::int AS r,
              (SELECT count(*) FROM staff_alignment_addendum WHERE alignment_id = $1)::int AS a`, [ids.encontro]);
    expect(tem).toEqual({ r: 1, a: 1 });
    for (const quem of colegas) {
      const vistos = await comoAplicacao(quem, async () => (await admin.query(
        `SELECT (SELECT count(*) FROM staff_alignment WHERE subject_id = $1)::int
              + (SELECT count(*) FROM staff_alignment_reply WHERE alignment_id = $2)::int
              + (SELECT count(*) FROM staff_alignment_addendum WHERE alignment_id = $2)::int AS n`,
        [ids.educ, ids.encontro])).rows[0].n);
      expect(vistos).toBe(0);
    }
    const doColega = await get('educ2', '/alignments/encontros/comigo').expect(200);
    expect(doColega.body.encontros.some((e: any) => e.id === ids.encontro)).toBe(false);
  });

  it('a Coordenação Geral registra com a coordenação e com quem atende todas as casas', async () => {
    const comCoord = await post('geral', '/alignments/encontros',
      encontro(ids.coord3, { periodicidade: 'trimestral' }));
    expect(comCoord.status).toBe(201);
    const comEnf = await post('geral', '/alignments/encontros',
      encontro(ids.enfermagem, { periodicidade: 'anual' }));
    expect(comEnf.status).toBe(201);
    const { rows: [enf] } = await admin.query(`SELECT house_id FROM staff_alignment WHERE id = $1`, [comEnf.body.id]);
    expect(enf.house_id).toBeNull();
    /* A coordenação lê o próprio; a outra casa não; e o Gestor Geral não alinha com a CG. */
    const proprio = await get('coord3', '/alignments/encontros/comigo').expect(200);
    expect(proprio.body.encontros.map((e: any) => e.id)).toContain(comCoord.body.id);
    expect((await get('coord4', `/alignments/encontros/pessoa/${ids.coord3}`)).status).toBe(404);
    expect((await post('geral', '/alignments/encontros', encontro(ids.gestor))).status).toBe(403);
    const equipe = await get('geral', '/alignments/encontros/equipe').expect(200);
    const nomes = equipe.body.pessoas.map((p: any) => p.id);
    expect(nomes).toEqual(expect.arrayContaining([ids.coord3, ids.coord4, ids.educ, ids.enfermagem]));
    expect(nomes).not.toContain(ids.gestor);
    const daCasa = await get('coord3', '/alignments/encontros/equipe').expect(200);
    const daCasaIds = daCasa.body.pessoas.map((p: any) => p.id);
    expect(daCasaIds).toEqual(expect.arrayContaining([ids.educ, ids.tecnica]));
    expect(daCasaIds).not.toContain(ids.coord4);
    expect(daCasaIds).not.toContain(ids.enfermagem);
  });

  it('recusa o dia no futuro, o próximo antes do encontro e os pontos positivos curtos', async () => {
    const futuro = await post('coord3', '/alignments/encontros', encontro(ids.educ2, { dia: somar(hoje, 2) }));
    expect(futuro.status).toBe(400);
    expect(futuro.body.message).toMatch(/depois de hoje/);
    const antes = await post('coord3', '/alignments/encontros', encontro(ids.educ2, { proximo: hoje }));
    expect(antes.status).toBe(400);
    expect(antes.body.message).toMatch(/depois deste/);
    const curto = await post('coord3', '/alignments/encontros', encontro(ids.educ2, { positivos: 'Bom.' }));
    expect(curto.status).toBe(400);
    const sem = await post('coord3', '/alignments/encontros', encontro(ids.educ2, { periodicidade: 'semanal' }));
    expect(sem.status).toBe(400);
    const dia = await post('coord3', '/alignments/encontros', encontro(ids.educ2, { dia: '2026-02-30' }));
    expect(dia.status).toBe(400);
  });

  it('o relógio avisa quem registrou quando o próximo encontro chega, uma vez só', async () => {
    const r = await post('coord3', '/alignments/encontros',
      encontro(ids.educ2, { dia: somar(hoje, -1), proximo: hoje, periodicidade: 'mensal' }));
    expect(r.status).toBe(201);
    const relogio = app.get(RelogioService);
    const quem = await relogio.quemSou('enfermagem@paodospobres.dev');
    const { rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code = 'AI3'`);
    const encontros = app.get(EncontrosService);
    const primeiro = await encontros.avisarProximos(quem, AI3);
    expect(primeiro.avisados).toBeGreaterThanOrEqual(1);
    expect(await avisos(ids.coord3, /Chegou o dia do próximo encontro/)).toBeGreaterThanOrEqual(1);
    const segundo = await encontros.avisarProximos(quem, AI3);
    expect(segundo.avisados).toBe(0);
    /* Sem casa: os de quem atende todas as casas; quem não alcança todas não pergunta. */
    await expect(encontros.avisarProximos(
      { ...quem, id: ids.educ, role: 'educador' as any }, null)).rejects.toThrow(/fora_de_escopo/);
  });

  /** Roda como o papel da aplicação, com a identidade dada, e desfaz no fim. */
  const comoAplicacao = async <T>(quem: string, fn: () => Promise<T>) => {
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE rede_app');
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [quem]);
      return await fn();
    } finally { await admin.query('ROLLBACK'); }
  };

  it('a conta desativada não lê, não dá ciência e não escreve adendo (1723)', async () => {
    const r = await post('coord3', '/alignments/encontros', encontro(ids.educ2));
    expect(r.status).toBe(201);
    const id = r.body.id as string;
    await admin.query(`SELECT set_config('app.user_id', '', false)`);
    await admin.query(`UPDATE app_user SET active = false WHERE id = ANY($1)`, [[ids.educ2, ids.coord3]]);
    try {
      expect(await comoAplicacao(ids.educ2, async () =>
        (await admin.query(`SELECT count(*)::int AS n FROM staff_alignment WHERE id = $1`, [id])).rows[0].n)).toBe(0);
      await expect(comoAplicacao(ids.educ2, () =>
        admin.query(`SELECT app_responder_alinhamento($1, 'resposta de quem saiu')`, [id]))).rejects.toThrow(/alinhamento_inexistente/);
      await expect(comoAplicacao(ids.coord3, () =>
        admin.query(`SELECT app_adendo_do_alinhamento($1, 'adendo de quem saiu da casa')`, [id]))).rejects.toThrow(/alinhamento_inexistente/);
    } finally {
      await admin.query(`UPDATE app_user SET active = true WHERE id = ANY($1)`, [[ids.educ2, ids.coord3]]);
    }
  });

  it('o próximo encontro de quem registrou e saiu fica pendente, sem se perder (1723)', async () => {
    const r = await post('coord3', '/alignments/encontros',
      encontro(ids.tecnica, { dia: somar(hoje, -1), proximo: hoje }));
    expect(r.status).toBe(201);
    const id = r.body.id as string;
    const { rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code = 'AI3'`);
    await admin.query(`UPDATE app_user SET active = false WHERE id = $1`, [ids.coord3]);
    try {
      const encontros = app.get(EncontrosService);
      const quem = await app.get(RelogioService).quemSou('enfermagem@paodospobres.dev');
      await encontros.avisarProximos(quem, AI3);
      const { rows: [linha] } = await admin.query(
        `SELECT next_noticed_at FROM staff_alignment WHERE id = $1`, [id]);
      expect(linha.next_noticed_at).toBeNull();
    } finally {
      await admin.query(`UPDATE app_user SET active = true WHERE id = $1`, [ids.coord3]);
    }
  });

  it('a aplicação não escreve nas tabelas direto, e a regra da tela é a do banco', async () => {
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE rede_app');
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [ids.coord3]);
      await expect(admin.query(
        `INSERT INTO staff_alignment (institution_id, subject_id, periodicity, met_on, positives, written_by)
         SELECT institution_id, $1, 'mensal', '2026-01-01', 'escrito por fora da função', $2
           FROM app_user WHERE id = $2`, [ids.educ, ids.coord3])).rejects.toThrow(/permission denied/);
    } finally { await admin.query('ROLLBACK'); }
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE rede_app');
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [ids.coord3]);
      await expect(admin.query(`UPDATE staff_alignment SET positives = 'trocado depois' WHERE id = $1`,
        [ids.encontro])).rejects.toThrow(/permission denied/);
    } finally { await admin.query('ROLLBACK'); }
    const { rows: [f] } = await admin.query(`SELECT prosrc FROM pg_proc WHERE proname = 'app_alinha_com'`);
    for (const cargo of QUEM_REGISTRA_ALINHAMENTO) expect(f.prosrc).toContain(`'${cargo}'`);
  });
});
