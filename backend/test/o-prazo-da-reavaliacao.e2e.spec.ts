/**
 * O PRAZO DA REAVALIAÇÃO (fase 269, pedido de 03/11).
 *
 * O ECA manda reavaliar a situação da criança acolhida no máximo a cada três
 * meses, com relatório da equipe técnica ao Juízo (art. 19, § 1º). A casa
 * guardava o ingresso e os relatórios e ninguém contava o prazo. Esta suíte
 * cobra:
 *  - que a conta da migração e a da regra (`reavaliacao.regra.ts`) dão o mesmo
 *    dia, inclusive no fim de mês, porque o aviso sai de uma e a tela lê a outra;
 *  - que o prazo conta do INGRESSO da ficha, e do último relatório quando há;
 *  - que a técnica é avisada quinze dias antes, uma vez por prazo, e nunca do
 *    prazo que está longe;
 *  - que a área restrita do perfil mostra o mesmo prazo, e só a ela.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { RelogioService } from '../src/modules/relogio';
import { hojeNaInstituicao } from '../src/kernel/common/tempo';
import {
  prazoDaReavaliacao, somarMeses, REAVALIACAO_AVISO_DIAS, REAVALIACAO_MESES,
} from '../src/modules/people/reavaliacao.regra';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==';

const somarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('O prazo da reavaliação', () => {
  let app: INestApplication, http: any, admin: Client, relogio: RelogioService;
  let AI3 = '', tecnica = '', educador = '';
  const criadas: string[] = [];
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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
    const tok = async (email: string) =>
      (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
    tecnica = await tok('tecnica.ai3@paodospobres.dev');
    educador = await tok('educador.ai3@paodospobres.dev');
  });

  afterAll(async () => {
    for (const p of criadas) {
      const r = await request(http).post(`/api/v1/people/${p}/discharge`).set(auth(tecnica))
        .send({ motivo: 'Encerramento de fixture de teste' });
      expect([200, 201]).toContain(r.status);
    }
    await app.close(); await admin.end();
  });

  async function admitir(nome: string, ingresso: string) {
    const r = await request(http).post('/api/v1/people/admission').set(auth(tecnica)).send({
      houseId: AI3,
      pessoa: { fullName: `${nome} (fictícia)`, socialName: nome, birthDate: '2015-05-05' },
      acolhimento: {
        admittedOn: ingresso, broughtBy: 'Conselho Tutelar',
        provisionalReason: 'Fixture de teste automatizado, sem documentos.',
        capacityReason: 'Fixture de teste automatizado do prazo da reavaliação.',
      },
      judicial: { reasonCategory: 'negligencia', determiningBody: 'vara_da_infancia' },
    });
    expect(r.status).toBe(201);
    criadas.push(r.body.personId);
    return r.body.personId as string;
  }

  it('a conta do banco e a da regra dão o mesmo dia, também no fim do mês', async () => {
    expect(REAVALIACAO_MESES).toBe(3);
    for (const dia of ['2026-01-31', '2026-11-30', '2027-11-29', '2028-02-29', '2026-06-15']) {
      const { rows: [r] } = await admin.query(
        `SELECT ($1::date + interval '3 months')::date::text AS d`, [dia]);
      expect(somarMeses(dia, REAVALIACAO_MESES)).toBe(r.d);
    }
    /* A regra lê a situação pelo dia de hoje, e o relatório de outro acolhimento não conta. */
    const p = prazoDaReavaliacao('2026-05-10', '2026-03-01', '2026-08-01');
    expect(p.ultimoRelatorio).toBeNull();
    expect(p.proximoAte).toBe('2026-08-10');
    expect(p.situacao).toBe('chegando');
    expect(prazoDaReavaliacao('2026-05-10', '2026-07-20', '2026-08-01').situacao).toBe('em_dia');
    expect(prazoDaReavaliacao('2026-01-10', null, '2026-08-01').situacao).toBe('passou');
    expect(prazoDaReavaliacao('2026-01-10', null, '2026-08-01').mesesAcolhido).toBe(6);
  });

  it('avisa a técnica quinze dias antes, uma vez por prazo, e mostra o prazo na área restrita', async () => {
    const hoje = hojeNaInstituicao();
    /* Ingresso há oitenta dias: o primeiro relatório cai daqui a uns dez. */
    const perto = await admitir('Reavaliação Perto', somarDias(hoje, -80));
    /* Ingresso há sessenta dias: o prazo está a uns trinta, ainda sem aviso. */
    const longe = await admitir('Reavaliação Longe', somarDias(hoje, -60));
    /* Ingresso há duzentos dias, e um relatório enviado há oitenta: conta do relatório. */
    const comRelatorio = await admitir('Reavaliação Com Relatório', somarDias(hoje, -200));
    const doc = await request(http).post(`/api/v1/people/${comRelatorio}/documents`).set(auth(tecnica))
      .send({ chave: 'relatorio_reavaliacao', categoria: 'judicial_socioassistencial',
              titulo: 'Relatório de reavaliação', conteudo: PNG, nomeArquivo: 'reavaliacao.png',
              emitidoEm: somarDias(hoje, -80) });
    expect(doc.status).toBe(201);

    const quem = await relogio.quemSou('enfermagem@paodospobres.dev');
    await relogio.rodarODia(quem);
    await relogio.rodarODia(quem);

    const { rows } = await admin.query(
      `SELECT n.entity_id::text AS id, count(*)::int AS n FROM notification n
         JOIN app_user u ON u.id = n.user_id
        WHERE u.email = 'tecnica.ai3@paodospobres.dev' AND n.entity = 'person'
          AND n.entity_id = ANY($1::uuid[]) GROUP BY 1 ORDER BY 1`, [[perto, longe, comRelatorio]]);
    expect(rows).toEqual([{ id: perto, n: 1 }, { id: comRelatorio, n: 1 }]
      .sort((a, b) => a.id.localeCompare(b.id)));
    const lista = (await request(http).get('/api/v1/notifications').set(auth(tecnica))).body as any[];
    const aviso = lista.find((a) => a.entidadeId === perto);
    expect(aviso.titulo).toMatch(/^O relatório de reavaliação de Reavaliação Perto vai ao Juízo até \d{2}\/\d{2}$/);

    /* A área restrita mostra o mesmo prazo que avisou, pela mesma regra. */
    for (const [id, ingresso, ultimo] of [
      [perto, somarDias(hoje, -80), null],
      [longe, somarDias(hoje, -60), null],
      [comRelatorio, somarDias(hoje, -200), somarDias(hoje, -80)],
    ] as const) {
      const res = await request(http).get(`/api/v1/people/${id}/reavaliacao`).set(auth(tecnica));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(prazoDaReavaliacao(ingresso, ultimo, hoje));
    }
    const r = (await request(http).get(`/api/v1/people/${perto}/reavaliacao`).set(auth(tecnica))).body;
    expect(r.situacao).toBe('chegando');
    expect(r.frase).toMatch(/O primeiro vai ao Juízo até/);
    expect(REAVALIACAO_AVISO_DIAS).toBe(15);

    /* O educador não abre a área restrita, e por isso não lê o prazo. */
    const ed = await request(http).get(`/api/v1/people/${perto}/reavaliacao`).set(auth(educador));
    expect(ed.status).toBe(403);
    expect(ed.body.message).toMatch(/área restrita/);
  });
});
