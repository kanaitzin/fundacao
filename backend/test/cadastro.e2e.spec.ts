/**
 * Cadastro completo do acolhido e limite da casa (§6.1, §13.1).
 *
 * Três coisas estão sendo protegidas aqui, e nenhuma delas é "o formulário
 * salvou":
 *
 *  1. **quem cadastra** — equipe técnica e coordenação. O educador que passa o
 *     dia com a criança não abre cadastro, e a recusa vem do banco;
 *
 *  2. **o motivo judicial é área restrita** — quem cuida no dia a dia não lê
 *     por que aquela criança foi retirada de casa. Saber muda o olhar, e essa
 *     informação existe para decidir o caso, não para acompanhar o banho;
 *
 *  3. **a casa cheia não fecha a porta** — mas exige uma decisão com nome. Uma
 *     criança com guia na mão às 23h não pode esbarrar num CHECK; o que o
 *     sistema faz é registrar que a casa estava no limite e por que se acolheu
 *     assim mesmo.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const appUrl = process.env.DATABASE_APP_URL ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher';

/** Consulta como a aplicação consulta: papel rede_app, com o RLS valendo. */
async function comoUsuario<T>(userId: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: appUrl });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
    return await fn(c);
  } finally {
    await c.query('ROLLBACK').catch(() => undefined);
    await c.end();
  }
}

describe('Cadastro do acolhido — dados completos, área judicial e limite da casa', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string;
  let capacidadeOriginal = 20;
  const pessoasCriadas: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

  /** Um cadastro fictício mínimo, completo o bastante para passar. */
  const cadastro = (nome: string, extra: Record<string, any> = {}) => ({
    houseId: AI3,
    pessoa: {
      fullName: nome, socialName: '', birthDate: '2013-04-11',
      gender: 'menino', race: 'parda', birthplace: 'Porto Alegre/RS',
      schoolName: 'EMEF fictícia', schoolGrade: '5º ano', schoolShift: 'manhã',
      essentialCare: 'Usa óculos para leitura.',
      ...(extra.pessoa ?? {}),
    },
    acolhimento: {
      admittedOn: '2026-08-20', broughtBy: 'Conselho Tutelar', originCity: 'Porto Alegre/RS',
      familyReference: 'Avó materna (fictícia) — contato autorizado',
      arrivalNote: 'Chegou com mochila e documentos.',
      provisionalReason: 'Ingresso urgente sem documentos em mãos.',
      ...(extra.acolhimento ?? {}),
    },
    judicial: {
      reasonCategory: 'negligencia', reasonDetail: 'Situação fictícia para teste.',
      determiningBody: 'vara_da_infancia', courtName: 'Vara fictícia',
      processNumber: '0000000-00.2026.8.21.0000', guideNumber: 'GA-FICT-01',
      guideDate: '2026-08-19', determinedOn: '2026-08-19',
      legalStatus: 'Audiência concentrada a marcar.',
      ...(extra.judicial ?? {}),
    },
  });

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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3, capacity: capacidadeOriginal }] } =
      await admin.query(`SELECT id, capacity FROM house WHERE code='AI3'`));

    // A Casa 03 do ambiente de demonstração já está com os 20. Esta suíte
    // trabalha com uma vaga a mais para poder testar os dois lados da regra —
    // e devolve o limite original no final.
    const { rows: [{ ocupadas }] } = await admin.query(
      `SELECT count(*)::int AS ocupadas FROM house_stay WHERE house_id=$1 AND status='ativa'`, [AI3]);
    await admin.query(`UPDATE house SET capacity=$1 WHERE id=$2`, [ocupadas + 1, AI3]);
  });

  afterAll(async () => {
    // Os fixtures desta suíte saem de cena por SAÍDA, não por DELETE: é assim
    // que a instituição encerra um acolhimento, e é o que o banco permite.
    if (pessoasCriadas.length) {
      await admin.query(
        `UPDATE house_stay SET status='encerrada', ended_at=now(), end_reason='saida'
          WHERE person_id = ANY($1::uuid[]) AND status='ativa'`, [pessoasCriadas]);
      await admin.query(
        `UPDATE care_episode SET status='encerrado', ended_at=now(), end_reason='fim do teste'
          WHERE person_id = ANY($1::uuid[]) AND status='ativo'`, [pessoasCriadas]);
    }
    await admin.query(`UPDATE house SET capacity=$1 WHERE id=$2`, [capacidadeOriginal, AI3]);
    await app.close(); await admin.end();
  });

  it('as oito casas nascem com o limite de 20 que a Fundação pratica', async () => {
    expect(capacidadeOriginal).toBe(20);
    const { rows } = await admin.query(
      `SELECT code, capacity FROM house WHERE id <> $1 ORDER BY code`, [AI3]);
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const casa of rows) expect(casa.capacity).toBe(20);
  });

  it('o educador não cadastra acolhido — e a recusa vem do banco, não da tela', async () => {
    const res = await request(http).post('/api/v1/people/admission')
      .set(auth(tokens.educador)).send(cadastro('Recusa Esperada (fictício)'));
    expect(res.status).toBe(403);

    // Não é só a rota: o comando de sistema recusa direto.
    const { rows: [ed] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev'`);
    await comoUsuario(ed.id, async (c) => {
      await expect(c.query(
        `SELECT * FROM app_admit_person_full($1, '{"fullName":"X","birthDate":"2014-01-01"}'::jsonb,
           '{}'::jsonb, '{"reasonCategory":"outro","determiningBody":"outro"}'::jsonb)`, [AI3]))
        .rejects.toThrow(/sem_permissao_para_admitir/);
    });
  });

  it('a equipe técnica cadastra com identificação, acolhimento e motivo judicial', async () => {
    const res = await request(http).post('/api/v1/people/admission')
      .set(auth(tokens.tecnica)).send(cadastro('Bruno Fictício da Silva'));
    expect(res.status).toBe(201);
    expect(res.body.personId).toBeTruthy();
    expect(res.body.episodio).toBe(1);
    expect(res.body.acimaDoLimite).toBe(false);
    pessoasCriadas.push(res.body.personId);

    const acolh = await request(http).get(`/api/v1/people/${res.body.personId}/admission`)
      .set(auth(tokens.tecnica));
    expect(acolh.status).toBe(200);
    expect(acolh.body.conduzidoPor).toBe('Conselho Tutelar');

    const jud = await request(http).get(`/api/v1/people/${res.body.personId}/judicial`)
      .set(auth(tokens.tecnica));
    expect(jud.status).toBe(200);
    expect(jud.body.motivo).toBe('Negligência');
    expect(jud.body.guia).toBe('GA-FICT-01');
  });

  it('o motivo judicial não chega a quem cuida — nem pela rota, nem pelo banco', async () => {
    const personId = pessoasCriadas[0];

    const pelaRota = await request(http).get(`/api/v1/people/${personId}/judicial`)
      .set(auth(tokens.educador));
    expect(pelaRota.status).toBe(403);

    // E se amanhã alguém escrever uma tela que consulte a tabela direto:
    const { rows: [ed] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev'`);
    const linhas = await comoUsuario(ed.id, async (c) => {
      const { rows } = await c.query(
        `SELECT reason_category FROM judicial_record WHERE person_id=$1`, [personId]);
      return rows;
    });
    expect(linhas).toHaveLength(0);

    // O bloco do acolhimento, esse sim, o educador enxerga: é o que ele precisa
    // para cuidar — quem trouxe, referência familiar, como chegou.
    const acolh = await request(http).get(`/api/v1/people/${personId}/admission`)
      .set(auth(tokens.educador));
    expect(acolh.status).toBe(200);
    expect(acolh.body.referenciaFamiliar).toContain('Avó materna');
  });

  it('o cadastro exige motivo do acolhimento — sem ele não existe medida protetiva', async () => {
    const res = await request(http).post('/api/v1/people/admission').set(auth(tokens.tecnica))
      .send(cadastro('Sem Motivo (fictício)', { judicial: { reasonCategory: '' } }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/motivo do acolhimento/i);
  });

  it('casa no limite: a porta não trava, mas exige uma decisão com nome', async () => {
    // Baixa o limite ao número de hoje: a próxima criança chega com a casa cheia.
    const { rows: [{ ocupadas }] } = await admin.query(
      `SELECT count(*)::int AS ocupadas FROM house_stay WHERE house_id=$1 AND status='ativa'`, [AI3]);
    await admin.query(`UPDATE house SET capacity=$1 WHERE id=$2`, [ocupadas, AI3]);

    const semJustificativa = await request(http).post('/api/v1/people/admission')
      .set(auth(tokens.tecnica)).send(cadastro('Chegada Noturna (fictícia)'));
    expect(semJustificativa.status).toBe(409);
    expect(semJustificativa.body.message).toMatch(/limite de vagas/i);

    const comJustificativa = await request(http).post('/api/v1/people/admission')
      .set(auth(tokens.tecnica)).send(cadastro('Chegada Noturna (fictícia)', {
        acolhimento: {
          capacityReason: 'Chegada às 23h com guia do plantão judiciário; sem outra unidade disponível hoje.',
        },
      }));
    expect(comJustificativa.status).toBe(201);
    expect(comJustificativa.body.acimaDoLimite).toBe(true);
    expect(comJustificativa.body.aviso).toMatch(/acima do limite/i);
    pessoasCriadas.push(comJustificativa.body.personId);

    // E o fato fica visível na casa, em vez de virar vaga fantasma.
    const oc = await request(http).get(`/api/v1/houses/${AI3}/occupancy`).set(auth(tokens.coord));
    expect(oc.body.acimaDoLimite).toBe(true);
    expect(oc.body.vagas).toBe(0);
  });

  it('mudar o limite é decisão registrada, e não campo de tela', async () => {
    const semMotivo = await request(http).post(`/api/v1/houses/${AI3}/capacity`)
      .set(auth(tokens.coord)).send({ capacidade: 22, motivo: 'porque sim' });
    expect(semMotivo.status).toBe(400);

    const doEducador = await request(http).post(`/api/v1/houses/${AI3}/capacity`)
      .set(auth(tokens.educador))
      .send({ capacidade: 22, motivo: 'Ampliação aprovada em reunião institucional de agosto.' });
    expect(doEducador.status).toBe(403);

    const daCoord = await request(http).post(`/api/v1/houses/${AI3}/capacity`)
      .set(auth(tokens.coord))
      .send({ capacidade: 22, motivo: 'Ampliação aprovada em reunião institucional de agosto.' });
    expect(daCoord.status).toBe(201);
    expect(daCoord.body.capacidade).toBe(22);

    const hist = await request(http).get(`/api/v1/houses/${AI3}/capacity-history`).set(auth(tokens.coord));
    expect(hist.body[0].para).toBe(22);
    expect(hist.body[0].motivo).toMatch(/reunião institucional/);
    expect(hist.body[0].autor).toBeTruthy();
  });

  it('o limite é da casa, não do sistema: mudar a Casa 03 não mexe nas outras', async () => {
    const { rows } = await admin.query(
      `SELECT code, capacity FROM house WHERE code <> 'AI3' ORDER BY code`);
    for (const casa of rows) expect(casa.capacity).toBe(20);
  });
});
