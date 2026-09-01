/**
 * CORRIGIR O CADASTRO DEPOIS DA ADMISSÃO (§6.2).
 *
 * O sistema só sabia CADASTRAR. Nome escrito errado às 23h com a criança na
 * porta, data de nascimento trocada porque a certidão veio depois, CPF que
 * chegou uma semana mais tarde — nada disso tinha onde ser corrigido, e a
 * saída de quem usa é RECADASTRAR. Aí existem duas crianças no sistema, o
 * histórico parte em dois, e é exatamente isso que a audiência pergunta.
 *
 * O que este teste guarda:
 *
 *  * **corrigir deixa histórico legível por quem cuida.** `person_correction`
 *    guarda o que estava, o que passou a estar, quem, quando e POR QUÊ — e o
 *    educador da casa lê, porque "por que o nome dela mudou em março?" é
 *    pergunta do caso, não de auditoria;
 *  * **o motivo é obrigatório**, com mínimo: "erro" não explica nada a quem
 *    ler daqui a um ano;
 *  * **campo que não mudou não vira correção** — uma lista cheia de linhas
 *    iguais é uma lista que ninguém lê;
 *  * **nome civil e nascimento não se esvaziam.** O sistema não fica com
 *    criança sem nome;
 *  * **o histórico não se altera nem se apaga**, e o educador não corrige;
 *  * e a **área judicial** atualiza só o EPISÓDIO ATIVO: um acolhimento
 *    anterior continua contando o que houve naquela época.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Corrigir o cadastro depois da admissão', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const corrigir = (token: string, corpo: any) =>
    request(http).post(`/api/v1/people/${ids.crianca}/corrigir-identificacao`)
      .set(auth(token)).send(corpo);
  const correcoes = async (token: string) =>
    (await request(http).get(`/api/v1/people/${ids.crianca}/correcoes`).set(auth(token))).body;

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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));

    // Fixture PRÓPRIO: corrigir o nome de uma criança do seed mudaria o que as
    // outras suítes leem. Esta nasce aqui, e sai para o acervo no fim.
    const nasce = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: ids.AI3, fullName: 'Alise Ribero (fictícia)', socialName: 'Alise',
              birthDate: '2018-03-14',
              provisionalReason: 'Ingresso de teste automatizado — dados fictícios' });
    expect(nasce.status).toBe(201);
    ids.crianca = nasce.body.personId;
  });

  afterAll(async () => {
    // Os fixtures saem por SAÍDA, não por DELETE: é assim que a instituição
    // encerra um acolhimento, e é o que mantém a contagem das outras suítes.
    for (const id of [ids.crianca, ids.comJudicial].filter(Boolean)) {
      await request(http).post(`/api/v1/people/${id}/discharge`)
        .set(auth(tokens.coord)).send({ motivo: 'Encerramento de fixture de teste' });
    }
    await app.close(); await admin.end();
  });

  // ==================== Quem corrige ====================

  it('o educador não corrige a identificação', async () => {
    const res = await corrigir(tokens.educador,
      { nome: 'Outro Nome', motivo: 'O educador não decide isto.' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/equipe técnica|coordenação/i);
  });

  it('o motivo é obrigatório, e "erro" não basta', async () => {
    const sem = await corrigir(tokens.tecnica, { nome: 'Alice Ribeiro (fictícia)' });
    expect(sem.status).toBe(400);
    expect(sem.body.message).toMatch(/por que/i);

    const curto = await corrigir(tokens.tecnica,
      { nome: 'Alice Ribeiro (fictícia)', motivo: 'erro' });
    expect(curto.status).toBe(400);
  });

  // ==================== A correção ====================

  it('corrige nome e nascimento, e guarda o que estava com o motivo', async () => {
    const res = await corrigir(tokens.tecnica, {
      nome: 'Alice Ribeiro (fictícia)', nomeSocial: 'Alice', nascimento: '2018-04-02',
      motivo: 'A certidão de nascimento chegou hoje: o nome estava escrito de ouvido e a data '
            + 'era a que a avó lembrava.',
    });
    expect(res.status).toBe(201);
    expect(res.body.corrigidos).toBe(3);
    expect(res.body.aviso).toMatch(/continua registrado/i);

    const { rows: [p] } = await admin.query(
      `SELECT full_name, social_name, birth_date::text AS nasc, version
         FROM person WHERE id = $1`, [ids.crianca]);
    expect(p.full_name).toBe('Alice Ribeiro (fictícia)');
    expect(p.nasc).toBe('2018-04-02');
    expect(p.version).toBeGreaterThan(1);

    const hist = await correcoes(tokens.tecnica);
    expect(hist).toHaveLength(3);
    const nome = hist.find((c: any) => c.campo === 'Nome civil');
    expect(nome.antes).toBe('Alise Ribero (fictícia)');
    expect(nome.depois).toBe('Alice Ribeiro (fictícia)');
    expect(nome.motivo).toMatch(/escrito de ouvido/);
    expect(nome.por).toBeTruthy();
  });

  it('quem CUIDA da criança lê o histórico — não é área restrita', async () => {
    const hist = await correcoes(tokens.educador);
    expect(hist.length).toBe(3);
    expect(hist[0].motivo).toBeTruthy();
  });

  it('campo que não mudou não vira correção', async () => {
    const res = await corrigir(tokens.tecnica, {
      nome: 'Alice Ribeiro (fictícia)',
      motivo: 'Conferindo o cadastro depois da audiência de agosto.',
    });
    expect(res.status).toBe(201);
    expect(res.body.corrigidos).toBe(0);
    expect(res.body.aviso).toMatch(/nada mudou/i);
    expect(await correcoes(tokens.tecnica)).toHaveLength(3);
  });

  it('nome civil e nascimento não ficam em branco', async () => {
    const res = await corrigir(tokens.tecnica, {
      nome: '   ', motivo: 'Tentativa de esvaziar o nome da criança.' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/em branco/i);
  });

  it('o histórico não se altera nem se apaga — nem pelo administrador', async () => {
    await expect(admin.query(
      `UPDATE person_correction SET reason = 'reescrito' WHERE person_id = $1`,
      [ids.crianca])).rejects.toThrow();
    await expect(admin.query(
      `DELETE FROM person_correction WHERE person_id = $1`, [ids.crianca])).rejects.toThrow();
  });

  // ==================== A área judicial ====================

  it('a situação judicial atualiza, e só o episódio ATIVO', async () => {
    // Sem registro judicial (ingresso urgente), o servidor diz a lacuna em vez
    // de fingir que gravou.
    const semRegistro = await request(http).patch(`/api/v1/people/${ids.crianca}/judicial`)
      .set(auth(tokens.tecnica)).send({ situacao: 'Audiência marcada.' });
    expect(semRegistro.status).toBe(404);
    expect(semRegistro.body.message).toMatch(/episódio ativo/i);

    // Numa criança COM registro, a atualização entra. O seed não tem nenhuma:
    // `judicial_record` nasce da admissão COMPLETA, e é ela que este teste faz.
    const comJudicial = await request(http).post('/api/v1/people/admission')
      .set(auth(tokens.tecnica)).send({
        houseId: ids.AI3,
        pessoa: { fullName: 'Judite Fictícia da Silva', socialName: 'Judite',
                  birthDate: '2015-06-01', gender: 'menina', race: 'parda',
                  birthplace: 'Porto Alegre/RS', schoolName: 'EMEF fictícia',
                  schoolGrade: '5º ano', schoolShift: 'manhã' },
        acolhimento: { admittedOn: '2026-08-20', broughtBy: 'Conselho Tutelar',
                       originCity: 'Porto Alegre/RS',
                       provisionalReason: 'Ingresso de teste automatizado.',
                       // A Casa 03 opera no limite: a admissão acima do teto é
                       // decisão registrada, como a coordenação faria às 23h.
                       capacityReason: 'Fixture do ensaio: chegada com guia e sem outra '
                         + 'unidade disponível.' },
        judicial: { reasonCategory: 'negligencia', reasonDetail: 'Situação fictícia de teste.',
                    determiningBody: 'vara_da_infancia', courtName: 'Vara fictícia',
                    processNumber: '0000000-00.2026.8.21.0002', guideNumber: 'GA-FICT-02',
                    guideDate: '2026-08-19', determinedOn: '2026-08-19',
                    legalStatus: 'Audiência a marcar.' },
      });
    expect(comJudicial.status).toBe(201);
    ids.comJudicial = comJudicial.body.personId;

    const res = await request(http).patch(`/api/v1/people/${ids.comJudicial}/judicial`)
      .set(auth(tokens.tecnica))
      .send({ situacao: 'Audiência concentrada em 12/08: manutenção e reavaliação em 90 dias.' });
    expect(res.status).toBe(200);

    const depois = await request(http).get(`/api/v1/people/${ids.comJudicial}/judicial`)
      .set(auth(tokens.tecnica));
    expect(depois.body.situacao).toMatch(/reavaliação em 90 dias/);

    // E o educador continua sem alcançar a área.
    const doEducador = await request(http).get(`/api/v1/people/${ids.comJudicial}/judicial`)
      .set(auth(tokens.educador));
    expect([403, 404]).toContain(doEducador.status);
  });

  it('tudo ficou auditado, com autor e sem o conteúdo (regra 6, §20)', async () => {
    const { rows } = await admin.query(
      `SELECT actor_id, detail FROM audit_event
        WHERE action = 'person.correct_identity' AND entity_id = $1`, [ids.crianca]);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.actor_id).toBeTruthy();
      // Nomes dos campos, nunca o conteúdo: o valor vive em `person_correction`.
      expect(JSON.stringify(r.detail)).not.toMatch(/Alise|Alice/);
    }
  });
});
