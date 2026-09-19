/**
 * A ESCALA COMO A FUNDAÇÃO A DESCREVEU — os três ajustes da fase 123.
 *
 * Em 15/09 ele descreveu a escala que quer, e a maior parte já existia. Antes
 * de construir eu MEDI a diferença (§9, Grupo 2.5), e ela eram quatro coisas.
 * Esta suíte guarda as três que foram feitas:
 *
 *  1. *"pela equipe técnica, o coordenador ou o educador líder"* — os dois
 *     cargos que faltavam passam a montar, e o educador continua só lendo;
 *  2. *"cada um com a sua cor diferente"* — a cor, que existe desde a 0990 e
 *     era usada só na ATA, chega à escala;
 *  3. *"substituir ou deixar a menos"* — a substituição num gesto, com o
 *     parentesco guardado, e a retirada continuando a existir sozinha.
 *
 * A quarta — *"a gente não vai deduzir a escala"* — NÃO está aqui de
 * propósito: retirar a dedução deixa a passagem de plantão sem ninguém para
 * assinar no primeiro dia de uso, e essa é uma consequência que a Fundação
 * precisa escolher. Está no §4.5 do `PARA-A-REUNIAO`.
 *
 * E a garantia que atravessa as três: **a escala continua não sendo porta.**
 * Ela informa quem devia estar e não impede ninguém de trabalhar.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A escala como a Fundação a descreveu', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let hoje = '';

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const escalar = (token: string, corpo: any) =>
    request(http).post('/api/v1/escala').set(auth(token)).send(corpo);
  const periodo = (token: string, de: string, ate: string) =>
    request(http).get('/api/v1/escala').query({ houseId: ids.AI3, de, ate }).set(auth(token));

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
      lider: 'lider.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code = 'AI3'`));
    /* O dia vem do BANCO, no fuso da instituição — nunca de `new Date()` do
       processo de teste (regra 13 do §6). */
    ({ rows: [{ d: hoje }] } = await admin.query(`SELECT app_hoje()::text AS d`));

    for (const [k, email] of Object.entries({
      uEducador: 'educador.ai3@paodospobres.dev',
      uLider: 'lider.ai3@paodospobres.dev',
      uTecnica: 'tecnica.ai3@paodospobres.dev',
    })) {
      const { rows: [u] } = await admin.query(
        `SELECT id FROM app_user WHERE email = $1`, [email]);
      ids[k] = u.id;
    }
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  const daquiA = (n: number) => {
    const d = new Date(`${hoje}T12:00:00-03:00`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // ==================== 1. Quem monta ====================

  it('a equipe técnica e o Líder Diurno passam a montar — e o educador não', async () => {
    const dia = daquiA(40);
    for (const cargo of ['tecnica', 'lider', 'coord']) {
      const r = await escalar(tokens[cargo], {
        houseId: ids.AI3, userId: ids.uEducador, data: dia, turno: 'diurno',
      });
      expect([cargo, r.status]).toEqual([cargo, 201]);
      /* Idempotente: o segundo e o terceiro caem em `jaExistiam`, e é isso que
         prova que os três passaram pela porta — um 403 não chegaria aqui. */
      expect(r.body.criadas + r.body.jaExistiam).toBe(1);
    }

    const negado = await escalar(tokens.educador, {
      houseId: ids.AI3, userId: ids.uEducador, data: daquiA(41), turno: 'diurno',
    });
    expect(negado.status).toBe(403);
    /* A recusa nomeia os três cargos: quem lê precisa saber a quem pedir. */
    expect(negado.body.message).toMatch(/equipe técnica|Líder Diurno/i);
  });

  it('a recusa vem do BANCO, e não só do serviço', async () => {
    const app_ = new Client({
      connectionString: process.env.DATABASE_APP_URL
        ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher',
    });
    await app_.connect();
    try {
      await app_.query('BEGIN');
      await app_.query(`SELECT set_config('app.user_id', $1, true)`, [ids.uEducador]);
      /* Pela FUNÇÃO e pela POLÍTICA: a fase 123 mexeu nas duas, e mexer só numa
         deixaria a porta do banco aberta por um lado e fechada por outro. */
      await expect(app_.query(
        `SELECT * FROM app_escalar($1,$2,$3::date,'diurno',null,null,null,null,null)`,
        [ids.AI3, ids.uEducador, daquiA(42)])).rejects.toThrow(/coordenação|Líder Diurno/i);
      await app_.query('ROLLBACK');

      await app_.query('BEGIN');
      await app_.query(`SELECT set_config('app.user_id', $1, true)`, [ids.uEducador]);
      await expect(app_.query(
        `INSERT INTO shift_assignment (house_id, user_id, on_date, period, created_by)
         VALUES ($1,$2,$3::date,'diurno',$2)`,
        [ids.AI3, ids.uEducador, daquiA(43)])).rejects.toThrow(/row-level security/i);
      await app_.query('ROLLBACK');
    } finally { await app_.end(); }
  });

  // ==================== 2. A cor ====================

  it('a escala carrega a cor que a pessoa escolheu — a MESMA que a ATA usa', async () => {
    const dia = daquiA(44);
    await admin.query(`UPDATE app_user SET line_color = 'c-move' WHERE id = $1`, [ids.uEducador]);
    await escalar(tokens.coord, {
      houseId: ids.AI3, userId: ids.uEducador, data: dia, turno: 'noturno',
    });

    const r = await periodo(tokens.educador, dia, dia);
    expect(r.status).toBe(200);
    const p = r.body.dias[0].noturno.find((x: any) => x.userId === ids.uEducador);
    expect(p.cor).toBe('c-move');
    /* E o NOME continua vindo, sempre. A cor é apoio: a folha da parede sai em
       preto e branco na impressora da casa, e quem não distingue os oito tons
       lê o nome do mesmo jeito (regra 7). */
    expect(p.quem).toBeTruthy();
  });

  it('sem cor escolhida, o campo vem nulo — a tela é que decide o tom automático', async () => {
    const dia = daquiA(45);
    await admin.query(`UPDATE app_user SET line_color = NULL WHERE id = $1`, [ids.uTecnica]);
    await escalar(tokens.coord, {
      houseId: ids.AI3, userId: ids.uTecnica, data: dia, turno: 'diurno',
    });
    const r = await periodo(tokens.educador, dia, dia);
    const p = r.body.dias[0].diurno.find((x: any) => x.userId === ids.uTecnica);
    expect(p.cor).toBeNull();
  });

  // ==================== 3. Substituir num gesto ====================

  it('substituir troca a pessoa e guarda de quem era o lugar', async () => {
    const dia = daquiA(46);
    await escalar(tokens.coord, {
      houseId: ids.AI3, userId: ids.uEducador, data: dia, turno: 'diurno',
    });
    const antes = await periodo(tokens.coord, dia, dia);
    const alvo = antes.body.dias[0].diurno.find((x: any) => x.userId === ids.uEducador);

    const r = await request(http).post(`/api/v1/escala/${alvo.id}/substituir`)
      .set(auth(tokens.lider)).send({ novoUserId: ids.uTecnica });
    expect(r.status).toBe(201);
    expect(r.body.saiu).toBeTruthy();
    expect(r.body.entrou).toBeTruthy();

    const depois = await periodo(tokens.coord, dia, dia);
    const turno = depois.body.dias[0];
    /* O turno NÃO ficou vazio em momento nenhum, e quem entrou sabe de quem é
       o lugar — sem isso, a tela mostraria uma revogação e uma escalação no
       mesmo dia, sem relação nenhuma entre si. */
    expect(turno.diurno.map((x: any) => x.userId)).toContain(ids.uTecnica);
    expect(turno.diurno.map((x: any) => x.userId)).not.toContain(ids.uEducador);
    expect(turno.diurno.find((x: any) => x.userId === ids.uTecnica).substituiu).toBeTruthy();

    /* E a linha de quem saiu continua registrada, com o motivo escrito — não
       um id, uma frase: é ela que responde quem estava escalado naquela noite. */
    const saiu = turno.revogadas.find((x: any) => x.userId === ids.uEducador);
    expect(saiu).toBeDefined();
    expect(saiu.motivoRevogacao).toMatch(/substitu/i);
  });

  it('se quem entra já está no turno, NADA muda — o turno não fica vazio', async () => {
    const dia = daquiA(47);
    await escalar(tokens.coord, {
      houseId: ids.AI3, userId: ids.uEducador, data: dia, turno: 'diurno',
    });
    await escalar(tokens.coord, {
      houseId: ids.AI3, userId: ids.uTecnica, data: dia, turno: 'diurno',
    });
    const antes = await periodo(tokens.coord, dia, dia);
    const alvo = antes.body.dias[0].diurno.find((x: any) => x.userId === ids.uEducador);

    const r = await request(http).post(`/api/v1/escala/${alvo.id}/substituir`)
      .set(auth(tokens.coord)).send({ novoUserId: ids.uTecnica });
    expect(r.status).toBe(409);
    /* A recusa chega EM PORTUGUÊS e diz o que fazer. Na primeira execução
       desta suíte ela subiu crua — "duplicate key value violates unique
       constraint" —, porque até aqui nenhum chamador humano batia nesse
       índice: `app_escalar` trata o conflito por dentro, e a substituição não
       pode tratá-lo assim (pular em silêncio deixaria a antiga fora e ninguém
       no lugar). Foi o log do Nest, neste teste, que mostrou. */
    expect(r.body.message).toMatch(/já está escalada neste turno/i);
    expect(r.body.message).not.toMatch(/duplicate key|constraint/i);

    /* A transação voltou inteira: a pessoa nova entra ANTES de a antiga sair,
       e é isso que garante que a recusa não deixe a casa sem quem estava
       escalado. Na ordem inversa, o erro chegaria depois do estrago. */
    const depois = await periodo(tokens.coord, dia, dia);
    expect(depois.body.dias[0].diurno.map((x: any) => x.userId)).toContain(ids.uEducador);
  });

  it('"deixar a menos" continua existindo: retirar sozinho não pede substituto', async () => {
    const dia = daquiA(48);
    await escalar(tokens.coord, {
      houseId: ids.AI3, userId: ids.uEducador, data: dia, turno: 'noturno',
    });
    const antes = await periodo(tokens.coord, dia, dia);
    const alvo = antes.body.dias[0].noturno.find((x: any) => x.userId === ids.uEducador);

    const r = await request(http).post(`/api/v1/escala/${alvo.id}/revogar`)
      .set(auth(tokens.tecnica)).send({});
    expect(r.status).toBe(201);
    expect(r.body.mudou).toBe(true);

    /* Uma casa pode mesmo passar o turno com uma pessoa a menos. Exigir
       substituto em toda retirada seria o sistema cobrando da casa uma pessoa
       que ela não tem — e o buraco continua aparecendo, que é o pedido. */
    const depois = await periodo(tokens.coord, dia, dia);
    expect(depois.body.dias[0].semNinguem).toContain('noturno');
  });

  it('substituir num plantão que JÁ PASSOU exige motivo escrito', async () => {
    const ontem = daquiA(-1);
    await escalar(tokens.coord, {
      houseId: ids.AI3, userId: ids.uEducador, data: ontem, turno: 'diurno',
    });
    const antes = await periodo(tokens.coord, ontem, ontem);
    const alvo = antes.body.dias[0].diurno.find((x: any) => x.userId === ids.uEducador);

    const sem = await request(http).post(`/api/v1/escala/${alvo.id}/substituir`)
      .set(auth(tokens.coord)).send({ novoUserId: ids.uTecnica });
    expect(sem.status).toBe(400);
    expect(sem.body.message).toMatch(/já passou/i);

    const com = await request(http).post(`/api/v1/escala/${alvo.id}/substituir`)
      .set(auth(tokens.coord))
      .send({ novoUserId: ids.uTecnica, motivo: 'Atestado médico apresentado na segunda.' });
    expect(com.status).toBe(201);
  });

  // ==================== O que não mudou ====================

  it('a escala continua sem contar plantões por pessoa', async () => {
    const r = await periodo(tokens.coord, hoje, daquiA(30));
    expect(r.status).toBe(200);
    /* Somar plantão por nome é medição de gente com outro nome (§3.3). Se
       alguém acrescentar um total por pessoa, este teste reprova. */
    expect(JSON.stringify(r.body))
      .not.toMatch(/"(totalPlantoes|plantoesPorPessoa|quantosPlantoes)"/i);
  });
});
