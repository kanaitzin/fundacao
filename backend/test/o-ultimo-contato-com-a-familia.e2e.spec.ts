/**
 * HÁ QUANTO TEMPO A FAMÍLIA NÃO VISITA (fase 271, pedido de 03/11).
 *
 * O perfil da criança diz à equipe técnica quando foi a última visita da
 * família e a última ida à casa dela, e há quantos dias. Esta suíte cobra:
 *  - a frase, pela regra (`ultimo-contato.regra.ts`), com o dia e os dias;
 *  - a última visita contra o banco, sem contar o serviço da rede, e a última
 *    ida à família contra o banco;
 *  - que só a técnica, a coordenação e a gestão recebem, e nunca o educador.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { hojeNaInstituicao } from '../src/kernel/common/tempo';
import { QUEM_LE_O_ULTIMO_CONTATO, ultimoContato } from '../src/modules/people/ultimo-contato.regra';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O último contato com a família', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const auth = (x: string) => ({ Authorization: `Bearer ${x}` });

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
      tecnica: 'tecnica.ai3@paodospobres.dev', educador: 'educador.ai3@paodospobres.dev',
    })) {
      t[k] = (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
    }
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('a frase diz o dia e há quantos dias, e diz quando não há visita', () => {
    const r = ultimoContato('2026-10-01', '2026-10-20', '2026-02-28', '2026-11-03');
    expect(r.diasDesdeAVisita).toBe(33);
    expect(r.diasDesdeAConvivencia).toBe(14);
    expect(r.frases).toEqual([
      'A última visita da família foi em 01/10/2026, há 33 dias.',
      'A última ida à casa da família começou em 20/10/2026, há 14 dias.',
    ]);
    expect(ultimoContato(null, null, '2026-02-28', '2026-11-03').frases)
      .toEqual(['Não há visita da família registrada desde o acolhimento, em 28/02/2026.']);
    expect(ultimoContato('2026-11-02', null, null, '2026-11-03').frases)
      .toEqual(['A última visita da família foi em 02/11/2026, há um dia.']);
    expect(QUEM_LE_O_ULTIMO_CONTATO).toEqual(['equipe_tecnica', 'coordenador', 'gestor_geral']);
  });

  it('a técnica lê a última visita como está no banco, sem o serviço da rede; o educador não', async () => {
    const hoje = hojeNaInstituicao();
    const somar = (n: number) => {
      const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
    };
    const { rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`);
    const nova = await request(http).post('/api/v1/people/admission').set(auth(t.tecnica)).send({
      houseId: AI3,
      pessoa: { fullName: 'Criança do Último Contato (fictícia)', socialName: 'Contato', birthDate: '2015-03-03' },
      acolhimento: { admittedOn: somar(-90), broughtBy: 'Conselho Tutelar',
                     provisionalReason: 'Fixture de teste, sem documentos.',
                     capacityReason: 'Fixture de teste automatizado do último contato.' },
      judicial: { reasonCategory: 'negligencia', determiningBody: 'vara_da_infancia' },
    });
    expect(nova.status).toBe(201);
    const crianca = nova.body.personId as string;
    try {
      /* Antes de qualquer visita: diz que não há, desde o ingresso. */
      const vazia = await request(http).get(`/api/v1/people/${crianca}/visitas`).set(auth(t.tecnica));
      expect(vazia.body.ultimoContato.frases[0]).toMatch(/^Não há visita da família registrada desde o acolhimento/);

      const contato = async (nome: string, vinculo: string) => {
        const r = await request(http).post(`/api/v1/people/${crianca}/contacts`).set(auth(t.tecnica))
          .send({ nome, vinculo, telefone: '51 90000-0000' });
        expect(r.status).toBe(201);
        return r.body.id as string;
      };
      const mae = await contato('Mãe Fictícia', 'genitora');
      const rede = await contato('CREAS Fictício', 'servico_da_rede');
      /* As visitas entram direto no banco: o portão tem suíte própria, e aqui o
         que se confere é a conta do tempo, com datas no passado. */
      const { rows: [{ id: quem }] } = await admin.query(
        `SELECT id FROM app_user WHERE email = 'tecnica.ai3@paodospobres.dev'`);
      for (const [contatoId, dias] of [[mae, -10], [rede, -2]] as const) {
        await admin.query(
          `INSERT INTO visit (house_id, person_id, contact_id, document_checked, started_at, started_by,
                              ended_at, ended_by)
           VALUES ($1, $2, $3, 'RG', ($4::date + time '15:00') AT TIME ZONE app_fuso(), $5,
                   ($4::date + time '16:00') AT TIME ZONE app_fuso(), $5)`,
          [AI3, crianca, contatoId, somar(dias), quem]);
      }

      const r = await request(http).get(`/api/v1/people/${crianca}/visitas`).set(auth(t.tecnica));
      expect(r.status).toBe(200);
      expect(r.body.ultimoContato).toEqual(ultimoContato(somar(-10), null, somar(-90), hoje));
      expect(r.body.ultimoContato.diasDesdeAVisita).toBe(10);

      const e = await request(http).get(`/api/v1/people/${crianca}/visitas`).set(auth(t.educador));
      expect(e.status).toBe(200);
      expect(e.body.ultimoContato).toBeUndefined();
      /* As visitas o educador continua lendo, como antes. */
      expect(e.body.contagem.total).toBe(2);
    } finally {
      const s = await request(http).post(`/api/v1/people/${crianca}/discharge`).set(auth(t.tecnica))
        .send({ motivo: 'Encerramento de fixture de teste' });
      expect([200, 201]).toContain(s.status);
    }
  });
});
