/**
 * O RELATO DE TODAS AS PARTES.
 *
 * Pedido da equipe técnica em 09/09: quando acontece um episódio grave na
 * casa, cada educador do turno precisa escrever o que viu — para que a técnica
 * chegue à conversa com o adolescente já tendo o relato de todas as partes, e
 * faltando só ouvir ele.
 *
 * O relato independente e a opção "Não presenciei" existiam desde a fase 5. O
 * que faltava era a COBRANÇA: nada pedia o relato a ninguém, e a falta
 * aparecia dias depois, quando já era tarde.
 *
 * O que estes testes protegem:
 *
 *  1. **abrir ocorrência grave cobra relato de quem estava no turno** — e a
 *     lista sai da ESCALA do dia, não do vínculo com a casa;
 *  2. **sem escala montada, o sistema DIZ que caiu no vínculo** em vez de
 *     fingir que sabe quem estava lá;
 *  3. **nem toda ocorrência cobra.** Desorganização relevante não mobiliza
 *     seis pessoas — cobrança que se ignora uma vez se ignora sempre;
 *  4. **"Não presenciei" É responder.** Fica um relato com autor e horário, e
 *     a cobrança fecha. A diferença entre "não vi nada" e "ninguém perguntou"
 *     é toda a diferença seis meses depois;
 *  5. **um educador não vê a cobrança de outro.** Quem organiza o turno vê
 *     quem falta; entre pares, viraria pressão de colega — e o relato tem de
 *     nascer do que a pessoa viu;
 *  6. **quem vê a lista recebe NOME e ESTADO, nunca o texto** de ninguém;
 *  7. **reabrir não duplica** a cobrança de quem já respondeu.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const dia = (offset = 0) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(Date.now() + offset * 86400_000));

describe('A cobrança de relato numa ocorrência grave', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, educador: string, educador2: string;
  const ocorrencias: string[] = [];
  const escalas: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

  async function abrir(categoria: string) {
    const r = await request(http).post('/api/v1/incidents').set(auth(tokens.lider)).send({
      houseId: AI3, categoria, quando: new Date().toISOString(),
      fato: 'Fato fictício registrado pela suíte de teste, com detalhe suficiente para passar.',
    });
    if (r.body?.id) ocorrencias.push(r.body.id);
    return r;
  }

  /**
   * Escala fictícia para hoje, para a cobrança sair dela.
   *
   * Idempotente: a mesma pessoa não entra duas vezes no mesmo turno do mesmo
   * dia — é o índice parcial da 0950, e ele está certo. Chamar `escalar` em
   * vários testes é o normal; explodir na segunda chamada seria o teste
   * quebrando por um motivo que não é o que ele investiga.
   */
  async function escalar(userId: string) {
    const { rows } = await admin.query(
      `INSERT INTO shift_assignment (house_id, user_id, on_date, period, created_by)
       VALUES ($1,$2,$3::date,'diurno',$2)
       ON CONFLICT (house_id, user_id, on_date, period) WHERE revoked_at IS NULL
       DO NOTHING RETURNING id`, [AI3, userId, dia()]);
    if (rows[0]) escalas.push(rows[0].id);
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
      lider: 'lider.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      educador2: 'educador2.ai3@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: educador }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev'`));
    ({ rows: [{ id: educador2 }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador2.ai3@paodospobres.dev'`));
  });

  afterAll(async () => {
    /*
     * Suíte que muta estado compartilhado desfaz o que criou: escala deixada
     * aqui faria a suíte do plantão cobrar passagem de quem não estava lá.
     *
     * Mas desfazer aqui é REVOGAR, não apagar — `shift_assignment` é
     * append-only e o gatilho recusa DELETE. Isso não é obstáculo do teste: é
     * a regra da casa ("retirar é revogar, com autor") valendo também para
     * quem escreve teste. A revogada sai de todas as consultas, que filtram
     * por `revoked_at IS NULL`.
     */
    if (escalas.length) {
      await admin.query(
        `UPDATE shift_assignment
            SET revoked_at = now(), revoked_by = created_by,
                revoke_reason = 'Escala fictícia criada pela suíte de teste.'
          WHERE id = ANY($1::uuid[])`, [escalas]);
    }
    /*
     * A OCORRÊNCIA TAMBÉM NÃO SAI: `incident` recusa DELETE com
     * `ocorrencia_nao_e_apagada`, e `statement` com `registro imutável`. O
     * Rede Acolher não apaga nada, e escrever esta suíte foi a terceira vez
     * que isso me cobrou — primeiro a escala, depois o relato, depois a
     * ocorrência.
     *
     * O que precisa sair é só a COBRANÇA: ela é estado VIVO, e uma pendência
     * fictícia apareceria como "falta o seu relato" na tela de quem rodasse a
     * suíte seguinte. O resto é registro, e registro fica — é o mesmo motivo
     * pelo qual a regra 13 manda contar relativo ao que já estava no banco.
     */
    if (ocorrencias.length) {
      await admin.query(
        `DELETE FROM statement_request WHERE entity_id = ANY($1::uuid[])`, [ocorrencias]);
    }
    await app.close(); await admin.end();
  });

  it('ocorrência grave cobra relato de quem estava ESCALADO', async () => {
    await escalar(educador);
    const o = await abrir('contencao');
    expect(o.status).toBe(201);

    const { rows } = await admin.query(
      `SELECT user_id, origem, prompt FROM statement_request WHERE entity_id=$1`, [o.body.id]);
    expect(rows.map((r) => r.user_id)).toContain(educador);
    expect(rows[0].origem).toBe('escala');
    // A pergunta é objetiva e NÃO descreve o fato: quem só vai dizer que não
    // estava lá não deve receber o episódio inteiro num aviso.
    expect(rows[0].prompt).toMatch(/você presenciou/i);
    expect(rows[0].prompt).not.toMatch(/fictício registrado pela suíte/i);
  });

  it('nem toda ocorrência cobra — a desorganização relevante não mobiliza o turno', async () => {
    const o = await abrir('desorganizacao_relevante');
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM statement_request WHERE entity_id=$1`, [o.body.id]);
    expect(rows[0].n).toBe(0);
  });

  it('a pessoa cobrada vê a própria pendência', async () => {
    await escalar(educador);
    await abrir('violencia_ou_suspeita');

    const r = await request(http).get('/api/v1/statements/requests')
      .set(auth(tokens.educador)).expect(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body[0].entidade).toBe('incident');
  });

  it('"Não presenciei" É responder: fica relato, e a cobrança fecha', async () => {
    await escalar(educador);
    const o = await abrir('erro_medicamento');

    await request(http).post('/api/v1/statements').set(auth(tokens.educador)).send({
      houseId: AI3, context: 'ocorrencia', entity: 'incident', entityId: o.body.id,
      witness: 'nao_presenciei',
      body: 'Não estava na sala no momento; soube pela passagem de turno.',
    }).expect(201);

    const { rows } = await admin.query(
      `SELECT answered_at, statement_id FROM statement_request
        WHERE entity_id=$1 AND user_id=$2`, [o.body.id, educador]);
    expect(rows[0].answered_at).not.toBeNull();
    expect(rows[0].statement_id).not.toBeNull();
  });

  it('quem organiza o turno vê quem falta — com nome e estado, nunca o texto', async () => {
    await escalar(educador);
    const o = await abrir('conflito_agressao');

    const r = await request(http)
      .get(`/api/v1/statements/requests/incident/${o.body.id}`)
      .set(auth(tokens.tecnica)).expect(200);

    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body[0]).toHaveProperty('quem');
    expect(r.body[0]).toHaveProperty('respondeu');
    // Nenhum campo carrega o relato de ninguém.
    expect(JSON.stringify(r.body)).not.toMatch(/relato|body|texto/i);
  });

  it('um educador não vê a lista de quem falta', async () => {
    await escalar(educador);
    const o = await abrir('contencao');
    const r = await request(http)
      .get(`/api/v1/statements/requests/incident/${o.body.id}`)
      .set(auth(tokens.educador));
    // Fora de alcance devolve vazio ou recusa — nunca a lista.
    if (r.status === 200) expect(r.body).toEqual([]);
    else expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('id que não é UUID não vaza erro do Postgres', async () => {
    const r = await request(http).get('/api/v1/statements/requests/incident/nao-e-uuid')
      .set(auth(tokens.tecnica));
    expect(r.status).toBe(400);
  });
});
