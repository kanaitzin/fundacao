/**
 * O QUE A EQUIPE DA CASA CONSEGUE LER — o histórico do limite, o nome de quem
 * responde por um compromisso, e o painel que não atravessa a fronteira.
 *
 * Esta suíte nasceu com as telas do limite da unidade
 * (`POST /houses/:id/capacity`) e da visão dos 20
 * (`GET /timeline/house-panel`), duas rotas que existiam desde as fases 1 e 3
 * e nunca tiveram porta.
 *
 * As REGRAS do limite — motivo obrigatório, faixa, quem decide — já são
 * cobradas por `cadastro.e2e.spec.ts` ("mudar o limite é decisão registrada"),
 * e a ORDEM do painel por `operacao.e2e.spec.ts` ("painel da casa mostra
 * situação por acolhido, sem ranking"). Repeti-las aqui só criou colisão: a
 * primeira versão desta suíte contava as linhas do histórico da Casa 03 em
 * NÚMEROS ABSOLUTOS, e `house_capacity_change` é append-only — as linhas que
 * as outras suítes deixam nunca somem. Ela passava sozinha e derrubava uma
 * rodada em três, conforme a ordem dos arquivos. Foi a rodada das 21h que
 * pegou, que é exatamente para isso que a regra existe.
 *
 * Ficou aqui só o que as outras não cobrem, e toda contagem é RELATIVA ao que
 * já estava no banco:
 *
 *  * quem TRABALHA na casa lê o histórico do limite — não é área restrita;
 *  * o educador vê o NOME de quem responde por um compromisso da agenda;
 *  * o painel da casa não devolve o dia de outra unidade.
 *
 * Os dois primeiros são o mesmo defeito, e é a terceira aparição dele no
 * projeto: `JOIN app_user` sumia com a LINHA e `LEFT JOIN app_user` sumia com
 * o NOME, porque `user_select` (migração 0010) só entrega o cadastro de um
 * colega a gestor, coordenação e equipe técnica. A marca `rls-join-ok:` que
 * havia ali afirmava o contrário — e o `arquitetura.spec` cobra que a marca
 * exista, não que ela diga a verdade.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** A frase que identifica a mudança DESTA suíte no histórico da casa. */
const MOTIVO = 'Reforma do segundo andar concluída em agosto: dois quartos voltaram a ser '
  + 'usados, conforme vistoria da Fundação.';

describe('O que a equipe da casa consegue ler', () => {
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
  const historico = async (token: string) =>
    (await request(http).get(`/api/v1/houses/${ids.AI3}/capacity-history`)
      .set(auth(token))).body as any[];

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
    // Casa 03 é lido pela admissão, pelo painel e pelo cadastro. As LINHAS do
    // histórico não se apagam (append-only), e é por isso que nenhuma
    // contagem absoluta aparece nesta suíte.
    await admin.query(`UPDATE house SET capacity = $1 WHERE id = $2`,
      [limiteOriginal, ids.AI3]);
    await app.close(); await admin.end();
  });

  // ==================== O limite ====================

  it('a coordenação de outra casa não altera o limite desta', async () => {
    const antes = (await historico(tokens.coord)).length;
    const res = await request(http).post(`/api/v1/houses/${ids.AI3}/capacity`)
      .set(auth(tokens.coordAi4))
      .send({ capacidade: 22, motivo: 'Escrito por quem não é desta unidade.' });
    expect([403, 404]).toContain(res.status);
    // A recusa não deixou linha: a contagem não subiu.
    expect(await historico(tokens.coord)).toHaveLength(antes);
  });

  it('altera com motivo, e a mudança fica registrada com autor e valor anterior', async () => {
    const antes = (await historico(tokens.coord)).length;
    const alvo = limiteOriginal + 2;

    const res = await request(http).post(`/api/v1/houses/${ids.AI3}/capacity`)
      .set(auth(tokens.coord)).send({ capacidade: alvo, motivo: MOTIVO });
    expect(res.status).toBe(201);
    expect(res.body.anterior).toBe(limiteOriginal);
    expect(res.body.capacidade).toBe(alvo);
    expect(res.body.aviso).toMatch(/registrada com o seu nome/i);

    const { rows: [h] } = await admin.query(
      `SELECT capacity FROM house WHERE id = $1`, [ids.AI3]);
    expect(h.capacity).toBe(alvo);

    const hist = await historico(tokens.coord);
    expect(hist).toHaveLength(antes + 1);
    const minha = hist.find((x) => /vistoria da Fundação/.test(x.motivo ?? ''));
    expect(minha).toEqual(expect.objectContaining({
      de: limiteOriginal, para: alvo, autor: expect.any(String),
    }));
  });

  it('a ocupação passa a contar contra o limite NOVO', async () => {
    const res = await request(http).get(`/api/v1/houses/${ids.AI3}/occupancy`)
      .set(auth(tokens.coord));
    expect(res.status).toBe(200);
    expect(res.body.capacidade).toBe(limiteOriginal + 2);
    expect(res.body.podeAlterar).toBe(true);
  });

  /*
   * ======================================================================
   * O NOME DE QUEM TRABALHA, PARA QUEM TRABALHA AO LADO
   * ======================================================================
   */

  it('quem trabalha na casa LÊ o histórico do limite — não é área restrita', async () => {
    /*
     * `JOIN app_user` sumia com a LINHA INTEIRA aqui: o educador, o líder e a
     * Enfermagem recebiam um histórico VAZIO, sem erro nenhum. "Por que esta
     * casa recebe 22?" voltava a ser suposição justamente para quem trabalha
     * dentro dela.
     */
    const daCoord = await historico(tokens.coord);
    const doEducador = await historico(tokens.educador);
    expect(daCoord.length).toBeGreaterThan(0);
    expect(doEducador).toHaveLength(daCoord.length);
    expect(doEducador.find((x) => /vistoria da Fundação/.test(x.motivo ?? '')))
      .toBeDefined();
    expect(doEducador.every((x) => Boolean(x.autor))).toBe(true);
  });

  it('o educador vê o NOME de quem responde pelo compromisso da casa', async () => {
    /*
     * E `LEFT JOIN app_user` sumia com o NOME: a agenda mostrava o compromisso
     * sem dizer quem vai levar a criança — que é a informação pela qual aquela
     * tela existe. Mesmo defeito da fase 4, em outro lugar.
     */
    const marcado = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.tecnica)).send({
        houseId: ids.AI3, tipo: 'saude', titulo: 'Fonoaudiologia (fixture de teste)',
        local: 'Clínica fictícia', inicio: '2026-09-01', hora: '14:00',
        recorrencia: 'semanal', diasSemana: [2],
        responsavel: 'pessoa', responsavelId: ids.tecnicaId,
        motivoSemPrazo: 'Acompanhamento continuado, sem alta prevista.',
      });
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

  // ==================== A visão dos 20 ====================
  //
  // A ORDEM alfabética e a ausência de pontuação já são cobradas por
  // `operacao.e2e.spec.ts`, que gera o dia a partir da rotina antes de olhar.
  // Repetir aqui exigiria gerar o dia de novo, e `generate-day` é idempotente:
  // aquela suíte passaria a contar zero atividades criadas conforme a ordem em
  // que as duas rodassem. Fica aqui o que ela não cobre.

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
