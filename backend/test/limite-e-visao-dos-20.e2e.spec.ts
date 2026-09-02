/**
 * O LIMITE DA UNIDADE E A VISÃO DOS 20 — duas rotas da fase 1 e da fase 3 que
 * nunca tiveram tela.
 *
 * **O limite** (`POST /houses/:id/capacity`, `GET /houses/:id/capacity-history`).
 * As oito casas nasceram com 20, que é o número praticado, e não havia por onde
 * mudar. A tarja "acima do limite" da admissão apontava para um teto que
 * ninguém conseguia corrigir quando a unidade de fato passava a operar com
 * outro — e a admissão acima do teto, que é decisão registrada com
 * justificativa, virava rotina por defeito de cadastro.
 *
 * **A visão dos 20** (`GET /timeline/house-panel`). A linha do dia responde "o
 * que acontece agora"; esta responde à pergunta da troca de turno: "e a Alice,
 * como está?", vinte vezes, sem rolar a cronologia inteira. A ordem é
 * ALFABÉTICA e o teste cobra isso: ordenar por pendência produziria, todo dia,
 * a mesma lista de crianças no topo — ranking de acolhido, proibido pelo §3.3.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O limite da unidade e a visão dos 20', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let limiteOriginal = 20;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const alterar = (token: string, corpo: any, casa = ids.AI3) =>
    request(http).post(`/api/v1/houses/${casa}/capacity`).set(auth(token)).send(corpo);
  const historico = async (token: string) =>
    (await request(http).get(`/api/v1/houses/${ids.AI3}/capacity-history`)
      .set(auth(token))).body;

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
      coordAi4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);

    const { rows } = await admin.query(
      `SELECT id, code, capacity FROM house WHERE code IN ('AI3','AI4')`);
    ids.AI3 = rows.find((r) => r.code === 'AI3').id;
    ids.AI4 = rows.find((r) => r.code === 'AI4').id;
    limiteOriginal = rows.find((r) => r.code === 'AI3').capacity;

    const { rows: [t] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'tecnica.ai3@paodospobres.dev'`);
    ids.tecnicaId = t.id;
  });

  afterAll(async () => {
    // Suíte que muta estado compartilhado desfaz o que criou: o limite da
    // Casa 03 é lido pela admissão, pelo painel e pelo cadastro.
    await admin.query(`UPDATE house SET capacity = $1 WHERE id = $2`,
      [limiteOriginal, ids.AI3]);
    await app.close(); await admin.end();
  });

  // ==================== O limite ====================

  it('educador e equipe técnica não alteram o limite da unidade', async () => {
    for (const quem of ['educador', 'tecnica']) {
      const res = await alterar(tokens[quem],
        { capacidade: 22, motivo: 'Tentativa de quem não decide isto.' });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/coordenação|Gestor Geral/i);
    }
  });

  it('a coordenação de outra casa não altera o limite desta', async () => {
    const res = await alterar(tokens.coordAi4,
      { capacidade: 22, motivo: 'Escrito por quem não é desta unidade.' });
    expect([403, 404]).toContain(res.status);
    expect(await historico(tokens.coord)).toHaveLength(0);
  });

  it('o motivo é obrigatório, e o limite tem faixa', async () => {
    const semMotivo = await alterar(tokens.coord, { capacidade: 22, motivo: 'reforma' });
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.message).toMatch(/motivo/i);

    const foraDaFaixa = await alterar(tokens.coord,
      { capacidade: 0, motivo: 'Zerar o limite da unidade, o que não faz sentido.' });
    expect(foraDaFaixa.status).toBe(400);
    expect(foraDaFaixa.body.message).toMatch(/entre 1 e 60/);

    // Nenhuma das recusas deixou linha no histórico.
    expect(await historico(tokens.coord)).toHaveLength(0);
  });

  it('altera com motivo, e a mudança fica registrada com autor e valor anterior', async () => {
    const res = await alterar(tokens.coord, {
      capacidade: limiteOriginal + 2,
      motivo: 'Reforma do segundo andar concluída em agosto: dois quartos voltaram a ser '
        + 'usados, conforme vistoria da Fundação.',
    });
    expect(res.status).toBe(201);
    expect(res.body.anterior).toBe(limiteOriginal);
    expect(res.body.capacidade).toBe(limiteOriginal + 2);
    expect(res.body.aviso).toMatch(/registrada com o seu nome/i);

    const { rows: [h] } = await admin.query(
      `SELECT capacity FROM house WHERE id = $1`, [ids.AI3]);
    expect(h.capacity).toBe(limiteOriginal + 2);

    const hist = await historico(tokens.coord);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toEqual(expect.objectContaining({
      de: limiteOriginal, para: limiteOriginal + 2,
      motivo: expect.stringMatching(/vistoria/), autor: expect.any(String),
    }));
  });

  it('o limite igual ao atual não vira mudança', async () => {
    const res = await alterar(tokens.coord, {
      capacidade: limiteOriginal + 2,
      motivo: 'Conferindo se o sistema registra uma mudança que não mudou nada.',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/já é o atual/i);
    expect(await historico(tokens.coord)).toHaveLength(1);
  });

  it('a ocupação passa a contar contra o limite NOVO', async () => {
    const res = await request(http).get(`/api/v1/houses/${ids.AI3}/occupancy`)
      .set(auth(tokens.coord));
    expect(res.status).toBe(200);
    expect(res.body.capacidade).toBe(limiteOriginal + 2);
    expect(res.body.podeAlterar).toBe(true);
  });

  it('quem trabalha na casa LÊ o histórico do limite — não é área restrita', async () => {
    // A pergunta "por que esta casa recebe 22?" é da equipe inteira, e a
    // resposta escrita é o que impede que ela vire suposição.
    const hist = await historico(tokens.educador);
    expect(hist).toHaveLength(1);
    expect(hist[0].motivo).toMatch(/vistoria/);
  });

  // ==================== A visão dos 20 ====================
  //
  // A ORDEM e a ausência de pontuação já são cobradas por
  // `operacao.e2e.spec.ts` ("painel da casa mostra situação por acolhido, sem
  // ranking"), que gera o dia a partir da rotina antes de olhar. Repetir aqui
  // exigiria gerar o dia de novo — e `generate-day` é idempotente, o que faria
  // aquela suíte contar zero atividades criadas conforme a ordem em que as
  // duas rodassem. Esta suíte cobre então o que aquela não cobre: que o painel
  // não atravessa a fronteira da casa.

  /*
   * ======================================================================
   * O NOME DE QUEM TRABALHA, PARA QUEM TRABALHA AO LADO
   * ======================================================================
   *
   * Terceira aparição do mesmo defeito no projeto, e a primeira em que a marca
   * `rls-join-ok:` estava AFIRMANDO UMA COISA FALSA: "app_user não tem RLS de
   * linha". Tem. `user_select` (migração 0010) só entrega o cadastro de um
   * colega a gestor, coordenação e equipe técnica — o educador enxerga apenas
   * a si mesmo.
   *
   * Com isso, `JOIN app_user` SUMIA COM A LINHA (o histórico do limite voltava
   * vazio para quem trabalha na casa) e `LEFT JOIN app_user` sumia com o NOME
   * (a agenda mostrava o compromisso sem dizer quem vai levar a criança). Nada
   * disso dava erro: a tela ficava em branco no lugar certo.
   *
   * O teste abaixo cobra o caso operacional — o educador precisa saber quem
   * leva o Bruno na fono, e essa é a informação que sumia.
   */
  it('o educador vê o NOME de quem responde pelo compromisso da casa', async () => {
    const marcado = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.tecnica)).send({
        houseId: ids.AI3, tipo: 'saude', titulo: 'Fonoaudiologia (fixture de teste)',
        local: 'Clínica fictícia', inicio: '2026-09-01', hora: '14:00',
        recorrencia: 'semanal', diasSemana: [2],
        responsavel: 'pessoa', responsavelId: ids.tecnicaId,
        motivoSemPrazo: 'Acompanhamento continuado, sem alta prevista.',
      });
    // Se o cadastro do compromisso mudar de contrato, este teste não deve
    // mentir passando: ou ele cria o fixture, ou ele diz que não conseguiu.
    if (![200, 201].includes(marcado.status)) {
      throw new Error(`fixture do compromisso: ${marcado.status} ${JSON.stringify(marcado.body)}`);
    }

    const daTecnica = await request(http)
      .get(`/api/v1/activities/agenda/commitments?houseId=${ids.AI3}`)
      .set(auth(tokens.tecnica));
    const doEducador = await request(http)
      .get(`/api/v1/activities/agenda/commitments?houseId=${ids.AI3}`)
      .set(auth(tokens.educador));
    expect(doEducador.status).toBe(200);

    // A MESMA lista, com os MESMOS nomes: o alcance do compromisso é da casa,
    // e o nome de quem responde por ele não é dado restrito.
    expect(doEducador.body.length).toBe(daTecnica.body.length);
    const criado = doEducador.body.find(
      (c: any) => c.titulo === 'Fonoaudiologia (fixture de teste)');
    expect(criado).toBeDefined();
    expect(criado.responsavel).toBeTruthy();
    expect(criado.responsavel).not.toBe('Plantão do horário');
    expect(criado.marcadoPor).toBeTruthy();
  });

  it('casa fora do alcance não devolve o painel de ninguém', async () => {
    const res = await request(http)
      .get(`/api/v1/timeline/house-panel?houseId=${ids.AI4}`).set(auth(tokens.educador));
    // Fora de escopo, o RLS não entrega evento nenhum: a lista vem vazia, e
    // nunca com o dia de outra unidade.
    expect(res.status).toBe(200);
    expect(res.body.acolhidos).toEqual([]);
    expect(res.body.coletivos).toEqual([]);
  });
});
