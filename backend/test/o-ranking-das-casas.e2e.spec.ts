/**
 * O RANKING DAS CASAS E DA EQUIPE (fase 323, reports/1727, pedido e decidido pelo dono em 14/11).
 *
 * O que esta suíte cobra:
 *  1. o Gestor Geral e a Coordenação Geral leem as oito casas, com o aviso de que se mede
 *     o registro e não o cuidado; nenhuma criança aparece na resposta;
 *  2. a coordenação de uma casa, a técnica e o educador são recusados com frase, no
 *     servidor e no banco;
 *  3. o que se registra muda a conta da casa e a da pessoa que registrou;
 *  4. a lista das pessoas traz quem não registrou, com zero, e nunca uma criança;
 *  5. a regra do banco e a do TypeScript dizem o mesmo dossiê e o mesmo prazo.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { hojeNaInstituicao } from '../src/kernel/common/tempo';
import { entrarPelaPrimeiraVez } from './setup/a-senha-dela';
import {
  AVISO_DO_RANKING, FRASE_QUEM_VE_O_RANKING, RANKING_REAVALIACAO_MESES, ContagensDaCasa,
  emOrdem, montarRanking, veORanking,
} from '../src/modules/reports/ranking.regra';
import { DOSSIE_EXIGIDO } from '../src/modules/people/dossie-exigido';
import { REAVALIACAO_MESES } from '../src/modules/people/reavaliacao.regra';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** Vinte dias atrás, no dia da instituição: longe das listas de hoje das outras suítes. */
function diasAtras(n: number) {
  const d = new Date(`${hojeNaInstituicao()}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('O ranking das casas e da equipe', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const auth = (k: string) => ({ Authorization: `Bearer ${t[k]}` });
  const get = (k: string, url: string) => request(http).get(`/api/v1${url}`).set(auth(k));
  const dia = diasAtras(20);

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
      gestor: 'gestor@paodospobres.dev', coord: 'coord.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev', educ: 'educador.ai3@paodospobres.dev',
    })) {
      const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
      if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
      t[k] = r.body.token; ids[k] = r.body.user.id;
    }
    const email = `geral.ranking.${Date.now()}@paodospobres.dev`;
    const cg = await request(http).post('/api/v1/staff').set(auth('gestor')).send({
      nome: 'Geral do Ranking', email, cargo: 'coordenador', todasAsCasas: true, senhaInicial: 'Senha-geral-1!' });
    if (cg.status !== 201) throw new Error(`a Coordenação Geral não nasceu: ${cg.status} ${JSON.stringify(cg.body)}`);
    t.geral = await entrarPelaPrimeiraVez(http, email, 'Senha-geral-1!');
    ids.casa = (await admin.query(`SELECT id FROM house WHERE code = 'AI3'`)).rows[0].id;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('o Gestor Geral e a Coordenação Geral leem as oito casas, com o aviso, e nenhuma criança', async () => {
    const { rows: criancas } = await admin.query(
      `SELECT p.id, p.full_name FROM person p JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa'`);
    for (const quem of ['gestor', 'geral']) {
      const r = await get(quem, '/reports/ranking');
      expect(r.status).toBe(200);
      expect(r.body.aviso).toBe(AVISO_DO_RANKING);
      expect(r.body.casas.length).toBe(Number((await admin.query(
        `SELECT count(*) FROM house WHERE institution_id = (SELECT institution_id FROM house WHERE code = 'AI3')`)).rows[0].count));
      const ai3 = r.body.casas.find((c: any) => c.codigo === 'AI3');
      expect(ai3.indicadores.length).toBeGreaterThan(10);
      expect(Object.keys(ai3.notas).sort()).toEqual(['cuidado', 'documentos', 'geral', 'uso']);
      const texto = JSON.stringify(r.body);
      for (const c of criancas) {
        expect(texto).not.toContain(c.id);
        expect(texto).not.toContain(c.full_name);
      }
    }
  });

  it('a coordenação de uma casa, a técnica e o educador são recusados, no servidor e no banco', async () => {
    for (const quem of ['coord', 'tecnica', 'educ']) {
      const r = await get(quem, '/reports/ranking');
      expect(r.status).toBe(403);
      expect(r.body.message).toBe(FRASE_QUEM_VE_O_RANKING);
      const p = await get(quem, `/reports/ranking/${ids.casa}/pessoas`);
      expect(p.status).toBe(403);
    }
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE rede_app');
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [ids.coord]);
      await expect(admin.query(`SELECT * FROM app_ranking_das_casas(app_hoje() - 7, app_hoje())`))
        .rejects.toThrow(/ranking_fora_do_alcance/);
    } finally { await admin.query('ROLLBACK'); }
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE rede_app');
      await expect(admin.query(`SELECT * FROM app_ranking_das_pessoas($1, app_hoje() - 7, app_hoje())`, [ids.casa]))
        .rejects.toThrow(/ranking_fora_do_alcance/);
    } finally { await admin.query('ROLLBACK'); }
  });

  it('a chamada confirmada conta para a casa e para quem confirmou', async () => {
    const url = `/reports/ranking?de=${dia}&ate=${dia}`;
    const antes = (await get('gestor', url).expect(200)).body.casas.find((c: any) => c.codigo === 'AI3');
    const pessoasAntes = (await get('gestor', `/reports/ranking/${ids.casa}/pessoas?de=${dia}&ate=${dia}`).expect(200)).body;
    const educAntes = pessoasAntes.pessoas.find((p: any) => p.id === ids.educ);
    await admin.query(
      `INSERT INTO collective_check (house_id, kind, title, reference_at, status, confirmed_at, confirmed_by, created_by)
       VALUES ($1, 'lazer', 'Chamada da conferência do ranking', ($2::date + time '15:00') AT TIME ZONE 'America/Sao_Paulo',
               'confirmada', ($2::date + time '15:10') AT TIME ZONE 'America/Sao_Paulo', $3, $3)`,
      [ids.casa, dia, ids.educ]);
    const depois = (await get('gestor', url).expect(200)).body.casas.find((c: any) => c.codigo === 'AI3');
    expect(depois.chamadas).toBe(antes.chamadas + 1);
    expect(depois.chamadasConfirmadas).toBe(antes.chamadasConfirmadas + 1);
    expect(depois.registros).toBe(antes.registros + 1);
    const pessoas = (await get('geral', `/reports/ranking/${ids.casa}/pessoas?de=${dia}&ate=${dia}`).expect(200)).body;
    const educ = pessoas.pessoas.find((p: any) => p.id === ids.educ);
    expect(educ.porTipo.chamada).toBe((educAntes?.porTipo.chamada ?? 0) + 1);
    expect(educ.total).toBe((educAntes?.total ?? 0) + 1);
  });

  it('a lista das pessoas traz quem não registrou, com zero, em ordem, e nunca uma criança', async () => {
    const longe = diasAtras(300);
    const r = await get('gestor', `/reports/ranking/${ids.casa}/pessoas?de=${longe}&ate=${longe}`).expect(200);
    expect(r.body.pessoas.length).toBeGreaterThan(0);
    expect(r.body.pessoas.some((p: any) => p.id === ids.coord && p.total === 0)).toBe(true);
    const totais = r.body.pessoas.map((p: any) => p.total);
    expect(totais).toEqual([...totais].sort((a, b) => b - a));
    const { rows } = await admin.query(`SELECT count(*)::int AS n FROM person WHERE id = ANY($1::uuid[])`,
      [r.body.pessoas.map((p: any) => p.id)]);
    expect(rows[0].n).toBe(0);
    expect(r.body.pessoas.every((p: any) => typeof p.cargo === 'string' && p.cargo !== '')).toBe(true);
  });

  it('o banco e o TypeScript dizem o mesmo dossiê, o mesmo prazo e quem vê', async () => {
    const { rows: [f] } = await admin.query(
      `SELECT prosrc FROM pg_proc WHERE proname = 'app_ranking_das_casas'`);
    const obrigatorios = DOSSIE_EXIGIDO.filter((i) => i.obrigatorio).map((i) => i.chave);
    for (const chave of obrigatorios) expect(f.prosrc).toContain(`'${chave}'`);
    expect(f.prosrc).toContain(`) = ${obrigatorios.length}`);
    expect(f.prosrc).toContain(`interval '${RANKING_REAVALIACAO_MESES} months'`);
    expect(RANKING_REAVALIACAO_MESES).toBe(REAVALIACAO_MESES);
    expect(veORanking('gestor_geral')).toBe(true);
    expect(veORanking('coordenador', true)).toBe(true);
    expect(veORanking('coordenador', false)).toBe(false);
    expect(veORanking('educador', true)).toBe(false);
  });

  it('a nota de cada grupo é a média do que há para medir, e a ordem põe a maior em cima', () => {
    const base: ContagensDaCasa = {
      houseId: 'a', codigo: 'A', nome: 'A', acolhidos: 10, equipe: 10,
      piaEmDia: 10, reavaliacaoEmDia: 10, comReceita: 0, receitaEmDia: 0, vacinaEmDia: 10, dossieCompleto: 10,
      atas: 0, atasSemPendencia: 0, doses: 10, dosesNoHorario: 5, chamadas: 0, chamadasConfirmadas: 0,
      frequenciaEsperada: 0, frequenciaMarcada: 0, atendimentos: 0, visitas: 0,
      registros: 0, pessoasQueRegistraram: 0, notasCentavos: 10000, notasSemValor: 0,
    };
    const [a, b] = montarRanking([base, { ...base, houseId: 'b', codigo: 'B', nome: 'B', dossieCompleto: 5 }]);
    /* Sem receita e sem ATA, os dois não entram na média: 4 indicadores de 100. */
    expect(a.notas.documentos).toBe(100);
    expect(b.notas.documentos).toBe(88);
    expect(a.notas.uso).toBe(0); // equipe de dez e ninguém registrou: zero, e não sem medida
    expect(montarRanking([{ ...base, equipe: 0 }])[0].notas.uso).toBeNull();
    expect(a.gastoPorAcolhidoCentavos).toBe(1000);
    expect(emOrdem([b, a], 'documentos').map((c) => c.codigo)).toEqual(['A', 'B']);
  });
});
