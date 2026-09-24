/**
 * A LISTA DO REMÉDIO "SE NECESSÁRIO" — a leitura (fase 152).
 *
 * `GET /medications/prn` é o que o educador abre às 2h da manhã: o que se PODE
 * dar, com a condição escrita pelo profissional ao lado, e o que JÁ foi dado
 * hoje. A rota de ESCREVER tem suíte desde a 1390; a de LER era a primeira da
 * lista das rotas medidas-e-não-testadas do §9.
 *
 * E ELA TINHA DEFEITO, achado lendo antes de testar. O que foi dado hoje trazia
 * o nome de quem deu por `LEFT JOIN app_user` — e `app_user` tem RLS por linha:
 * **educador, líder e Enfermagem só leem a PRÓPRIA linha**. A dose que a
 * educadora da noite deu às 2h chegava à Enfermagem, de manhã, **sem nome de
 * quem deu**. A tela não reclamava: ela escreve *"por Fulana"* só quando o nome
 * vem, e some com a frase quando não vem. E o protótipo mostrava o nome, porque
 * o `mock.ts` o preenche sempre — o produto e a demonstração discordavam, e
 * quem abria a demonstração via a versão certa.
 *
 * É justamente o caso que o comentário do serviço descreve como o motivo de a
 * lista existir: *"é assim que a Enfermagem a lê na manhã seguinte"*.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A lista do remédio "se necessário"', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const nomes: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const lista = (token: string, extra = '') =>
    request(http).get(`/api/v1/medications/prn?houseId=${ids.AI3}${extra}`).set(auth(token));

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
      educador: 'educador.ai3@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      deOutraCasa: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    /* Uma criança que as outras suítes de remédio não usam: a da 1390 pega a
       sexta da ordem; esta pega a oitava. */
    ({ rows: [{ id: ids.crianca }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name OFFSET 7 LIMIT 1`, [ids.AI3]));
    ({ rows: [{ full_name: nomes.educador }] } = await admin.query(
      `SELECT full_name FROM app_user WHERE email = 'educador.ai3@paodospobres.dev'`));

    /* A orientação válida: prescrita e ASSINADA pela Enfermagem. */
    const pr = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: ids.crianca, houseId: ids.AI3, tipo: 'quando_necessario',
              medicamento: 'Analgésico da fase 152 (fictício)', dose: '1 comprimido', via: 'oral',
              condicaoUso: 'Se a dor de cabeça não passar com água e descanso (fictício).',
              prescritor: 'Pediatria (fictícia)' });
    expect(pr.status).toBe(201);
    ids.prescricao = pr.body.id;
    expect((await request(http).post(`/api/v1/medications/prescriptions/${ids.prescricao}/sign`)
      .set(auth(tokens.enfermagem)).send({})).status).toBe(201);
  });

  afterAll(async () => {
    /* A suíte que abre ausência FECHA a ausência (lição da 127): uma criança
       fora da casa mudaria a chamada e a grade de todas as suítes seguintes. */
    await admin.query(
      `UPDATE family_stay SET status = 'encerrada', returned_at = now(),
              closed_at = now(), closed_by = opened_by
        WHERE person_id = $1 AND returned_at IS NULL`, [ids.crianca]);
    await app.close();
    await admin.end();
  });

  it('o educador vê o que pode dar, com a condição escrita ao lado', async () => {
    const r = await lista(tokens.educador);
    expect(r.status).toBe(200);
    const nosso = r.body.disponiveis.find((d: any) => d.prescricaoId === ids.prescricao);
    expect(nosso).toBeTruthy();
    /* A condição vem JUNTO do botão: quem decide às 2h precisa dela na frente. */
    expect(nosso.condicao).toMatch(/dor de cabeça/);
    expect(nosso.soEnfermagem).toBe(false);
    expect(nosso.vezesHoje).toBe(0);
  });

  it('a dose dada aparece na hora, e a contagem do dia sobe', async () => {
    const dada = await request(http)
      .post(`/api/v1/medications/prescriptions/${ids.prescricao}/prn`).set(auth(tokens.educador))
      .send({ motivo: 'Dor de cabeça forte depois do jantar, não passou com água (fictício).' });
    expect(dada.status).toBe(201);

    const r = await lista(tokens.educador);
    const nosso = r.body.disponiveis.find((d: any) => d.prescricaoId === ids.prescricao);
    expect(nosso.vezesHoje).toBe(1);
    const linha = r.body.dadasHoje.find((d: any) => d.prescricaoId === ids.prescricao);
    expect(linha).toBeTruthy();
    expect(linha.motivo).toMatch(/depois do jantar/);
    expect(linha.hora).toMatch(/^\d{2}:\d{2}$/);
  });

  it('A ENFERMAGEM LÊ DE MANHÃ QUEM DEU — era o defeito', async () => {
    const r = await lista(tokens.enfermagem);
    const linha = r.body.dadasHoje.find((d: any) => d.prescricaoId === ids.prescricao);
    expect(linha).toBeTruthy();
    /*
     * Sem a correção, `quemDeu` vinha `null`: a Enfermagem não alcança a linha
     * da educadora em `app_user`, e o `LEFT JOIN` devolvia vazio em silêncio. É a
     * pergunta que ela faz ao ler a lista — "quem deu, para eu perguntar como
     * foi?" —, e a resposta sumia justamente para ela.
     */
    expect(linha.quemDeu).toBe(nomes.educador);
  });

  it('e o Líder Diurno também — outro cargo que só lê a própria linha', async () => {
    const r = await lista(tokens.lider);
    const linha = r.body.dadasHoje.find((d: any) => d.prescricaoId === ids.prescricao);
    expect(linha?.quemDeu).toBe(nomes.educador);
  });

  it('o filtro por criança devolve só a dela', async () => {
    const r = await lista(tokens.educador, `&personId=${ids.crianca}`);
    expect(r.status).toBe(200);
    expect(r.body.disponiveis.every((d: any) => d.acolhido.id === ids.crianca)).toBe(true);
    expect(r.body.disponiveis.length).toBeGreaterThan(0);
  });

  it('a coordenação de outra casa não vê o remédio desta', async () => {
    const r = await lista(tokens.deOutraCasa);
    expect(r.status).toBe(200);
    expect(r.body.disponiveis.find((d: any) => d.prescricaoId === ids.prescricao)).toBeFalsy();
    expect(r.body.dadasHoje.find((d: any) => d.prescricaoId === ids.prescricao)).toBeFalsy();
  });

  it('a criança que está com a família sai da lista — a casa não dá a dose dela', async () => {
    const { rows: [contato] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, created_by, updated_by)
       SELECT $1, 'Tia da fase 152 (fictícia)', 'tio', u.id, u.id
         FROM app_user u WHERE u.email = 'tecnica.ai3@paodospobres.dev'
       RETURNING id, created_by`, [ids.crianca]);
    await admin.query(
      `INSERT INTO family_stay (person_id, house_id, contact_id, purpose, started_at,
                                expected_return_at, status, opened_by)
       VALUES ($1, $2, $3, 'Fim de semana com a tia (fictício).', now() - interval '1 hour',
               now() + interval '2 days', 'em_andamento', $4)`,
      [ids.crianca, ids.AI3, contato.id, contato.created_by]);

    const r = await lista(tokens.educador);
    /* Com a família, ninguém da casa dá a dose — a casa manda o remédio junto,
       listado para a técnica conferir na saída (1050). Oferecer o botão aqui
       seria convidar a registrar uma dose que não aconteceu. */
    expect(r.body.disponiveis.find((d: any) => d.prescricaoId === ids.prescricao)).toBeFalsy();
  });
});
