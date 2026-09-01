/**
 * SUSPENDER O ESQUEMA, E AUTORIZAR QUEM PODE DAR (§11.1 e §11.3).
 *
 * Dois buracos que se encontravam na mesma frase da casa: "o médico suspendeu,
 * mas o sistema continua cobrando a dose".
 *
 *  * suspender mudava o status da prescrição e DEIXAVA AS DOSES DE HOJE na
 *    grade, com o botão "Confirmar" ao lado. `app_generate_doses` só gera para
 *    prescrição ativa, então amanhã ficava limpo — e hoje alguém dava o remédio
 *    suspenso. Este teste guarda a regra de três partes: o que ainda não chegou
 *    a hora sai da grade DIZENDO por quê; o que já foi confirmado fica como
 *    está; e o que passou da hora sem ninguém confirmar CONTINUA pendente,
 *    porque não foi suspenso — ficou sem resposta, e alguém ainda a deve;
 *  * e não havia rota que LISTASSE prescrições: um rascunho salvo e não
 *    assinado ficava gravado e invisível, e não havia de onde suspender.
 *
 * Do lado de quem pode dar remédio, três coisas que a autorização nominal não
 * é: não é o cargo (é a PESSOA), não substitui o protocolo da casa (as duas
 * condições valem juntas), e não vale para casa nenhuma além da sua — que era
 * um defeito de verdade, encontrado ao escrever este teste e corrigido na 0820.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Suspender o esquema e autorizar quem pode dar', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let HOJE = '';

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const doses = async () => {
    const { rows } = await admin.query(
      `SELECT id, state, note, administered_by, scheduled_at
         FROM medication_administration WHERE prescription_id = $1 ORDER BY scheduled_at`,
      [ids.esquema]);
    return rows;
  };

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
      enfermagem: 'enfermagem@paodospobres.dev',
      // A Casa 04 é de propósito: a AI3 é disputada por meia dúzia de suítes, e
      // um teste que depende da ordem das outras não protege nada.
      coord: 'coord.ai4@paodospobres.dev',
      educador: 'educador.ai4@paodospobres.dev',
      coordDeOutraCasa: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ person_id: ids.acolhido }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status='ativa' LIMIT 1`, [ids.AI4]));
    ({ rows: [{ id: ids.educadorId }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai4@paodospobres.dev'`));
    ({ rows: [{ hoje: HOJE }] } = await admin.query(`SELECT app_hoje()::text AS hoje`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== A lista de esquemas ====================

  it('o rascunho aparece na lista — antes ele ficava gravado e invisível', async () => {
    const criou = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: ids.acolhido, houseId: ids.AI4, tipo: 'tratamento',
              medicamento: 'Amoxicilina (fictícia) 250 mg/5 mL', dose: '5 mL', via: 'oral',
              horarios: ['06:00', '07:00', '19:00'], prescritor: 'Pediatria (fictícia)',
              inicio: HOJE });
    expect(criou.status).toBe(201);
    ids.esquema = criou.body.id;

    const lista = await request(http)
      .get(`/api/v1/medications/prescriptions?houseId=${ids.AI4}`).set(auth(tokens.enfermagem));
    expect(lista.status).toBe(200);
    const meu = lista.body.esquemas.find((e: any) => e.id === ids.esquema);
    expect(meu.status).toBe('rascunho');
    expect(meu.rotulo).toMatch(/fora da grade/i);
    expect(meu.horarios).toEqual(['06:00', '07:00', '19:00']);
    // O rascunho vem primeiro: é o que está esperando alguém.
    expect(lista.body.esquemas[0].status).toBe('rascunho');
    expect(lista.body.aviso).toMatch(/Rascunho NÃO está na grade/);
  });

  // ==================== Suspender ====================

  it('a coordenação NÃO suspende, e a Enfermagem não suspende sem a orientação', async () => {
    await request(http).post(`/api/v1/medications/prescriptions/${ids.esquema}/sign`)
      .set(auth(tokens.enfermagem)).expect(201);
    await request(http).post('/api/v1/medications/generate-doses')
      .set(auth(tokens.enfermagem)).send({ houseId: ids.AI4, date: HOJE }).expect(201);
    expect(await doses()).toHaveLength(3);

    const cargoErrado = await request(http)
      .post(`/api/v1/medications/prescriptions/${ids.esquema}/suspend`)
      .set(auth(tokens.coord)).send({ motivo: 'O médico disse que era para parar.' });
    expect(cargoErrado.status).toBe(403);

    const semMotivo = await request(http)
      .post(`/api/v1/medications/prescriptions/${ids.esquema}/suspend`)
      .set(auth(tokens.enfermagem)).send({ motivo: '   ' });
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.message).toMatch(/orientação/i);

    // Nada mudou: a recusa não deixa meio-caminho.
    const { rows: [pr] } = await admin.query(
      `SELECT status FROM prescription WHERE id=$1`, [ids.esquema]);
    expect(pr.status).toBe('ativa');
  });

  it('suspender tira da grade o que AINDA NÃO chegou a hora — e diz por quê', async () => {
    /*
     * O relógio da suíte não pode depender da hora em que ela roda: às 23h não
     * existe "daqui a duas horas" dentro do dia. As três doses são reancoradas
     * em relação a AGORA, que é a única coisa que a regra realmente lê.
     */
    const [d1, d2, d3] = await doses();
    await admin.query(
      `UPDATE medication_administration SET scheduled_at = now() - interval '3 hours' WHERE id=$1`,
      [d1.id]);
    await admin.query(
      `UPDATE medication_administration SET scheduled_at = now() - interval '1 hour' WHERE id=$1`,
      [d2.id]);
    await admin.query(
      `UPDATE medication_administration SET scheduled_at = now() + interval '2 hours' WHERE id=$1`,
      [d3.id]);

    // A primeira foi dada de verdade, por quem a deu.
    await request(http).post(`/api/v1/medications/doses/${d1.id}/confirm`)
      .set(auth(tokens.enfermagem)).send({ estado: 'administrado_no_horario' }).expect(201);

    const res = await request(http)
      .post(`/api/v1/medications/prescriptions/${ids.esquema}/suspend`)
      .set(auth(tokens.enfermagem))
      .send({ motivo: 'Pediatria suspendeu no retorno de hoje: término do ciclo antecipado.' });
    expect(res.status).toBe(201);
    expect(res.body.dosesRetiradasDaGrade).toBe(1);
    expect(res.body.aviso).toMatch(/continua registrado/i);

    const depois = await doses();
    const porId = (id: string) => depois.find((d: any) => d.id === id);

    // 1. O que a criança tomou continua exatamente como estava.
    expect(porId(d1.id).state).toBe('administrado_no_horario');
    expect(porId(d1.id).administered_by).not.toBeNull();

    // 2. O que passou da hora e ninguém confirmou CONTINUA pendente: não foi
    //    suspenso, ficou sem resposta — e alguém ainda deve essa resposta.
    expect(porId(d2.id).state).toBe('aguardando_confirmacao');

    // 3. O que ainda não chegou a hora sai da grade DIZENDO por quê, e sem
    //    ninguém no lugar de quem administrou, porque ninguém administrou.
    expect(porId(d3.id).state).toBe('suspenso_conforme_orientacao');
    expect(porId(d3.id).note).toMatch(/término do ciclo antecipado/);
    expect(porId(d3.id).administered_by).toBeNull();

    // Nenhuma linha sumiu (regra 6).
    expect(depois).toHaveLength(3);
  });

  it('a grade do dia deixa de oferecer a dose suspensa, sem escondê-la', async () => {
    // A grade é por DIA da instituição, e as três doses foram reancoradas em
    // relação a agora: perto da meia-noite, "daqui a duas horas" é outro dia.
    // Cada uma é procurada no dia dela — que é como a casa lê a grade.
    const noDia = async (id: string) => {
      const { rows: [r] } = await admin.query(
        `SELECT (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS d
           FROM medication_administration WHERE id=$1`, [id]);
      const grade = await request(http)
        .get(`/api/v1/medications?houseId=${ids.AI4}&date=${r.d}`).set(auth(tokens.enfermagem));
      expect(grade.status).toBe(200);
      return grade.body.find((x: any) => x.id === id);
    };
    const todas = await doses();

    const suspensa = await noDia(todas[2].id);
    expect(suspensa.estado).toBe('suspenso_conforme_orientacao');
    expect(suspensa.pendente).toBe(false);          // some da fila, não da tela
    expect(suspensa.rotulo).toBe('Suspenso conforme orientação');
    expect(suspensa.observacao).toMatch(/Esquema suspenso/);
    expect(suspensa.confirmadaPor).toBeNull();      // ninguém administrou

    // A que passou da hora continua cobrando resposta de alguém.
    const semResposta = await noDia(todas[1].id);
    expect(semResposta.pendente).toBe(true);

    // E a que foi dada continua dizendo quem a deu.
    const dada = await noDia(todas[0].id);
    expect(dada.pendente).toBe(false);
    expect(dada.confirmadaPor).toBeTruthy();
  });

  it('suspender de novo é recusado, e gerar doses não ressuscita o esquema', async () => {
    const denovo = await request(http)
      .post(`/api/v1/medications/prescriptions/${ids.esquema}/suspend`)
      .set(auth(tokens.enfermagem)).send({ motivo: 'De novo, por engano.' });
    expect(denovo.status).toBe(400);
    expect(denovo.body.message).toMatch(/já está suspenso/i);

    await request(http).post('/api/v1/medications/generate-doses')
      .set(auth(tokens.enfermagem)).send({ houseId: ids.AI4, date: HOJE }).expect(201);
    expect(await doses()).toHaveLength(3);

    const lista = await request(http)
      .get(`/api/v1/medications/prescriptions?houseId=${ids.AI4}`).set(auth(tokens.enfermagem));
    const meu = lista.body.esquemas.find((e: any) => e.id === ids.esquema);
    expect(meu.status).toBe('suspensa');
    expect(meu.rotulo).toBe('Suspenso');
    // A orientação fica NO esquema: quem abrir amanhã lê por que parou.
    expect(meu.motivoDaSuspensao).toMatch(/término do ciclo antecipado/);
  });

  // ==================== Quem pode dar remédio ====================

  it('autorização nominal NÃO substitui o protocolo da casa: as duas valem juntas',
     async () => {
    const antes = await request(http)
      .get(`/api/v1/medications/can-administer?houseId=${ids.AI4}&periodo=noturno`)
      .set(auth(tokens.educador));
    expect(antes.body.pode).toBe(false);
    expect(antes.body.motivo).toMatch(/protocolo desta casa não autoriza/i);

    // Só a coordenação autoriza nominalmente.
    const negado = await request(http).post('/api/v1/medications/authorize-educator')
      .set(auth(tokens.educador))
      .send({ userId: ids.educadorId, houseId: ids.AI4 });
    expect(negado.status).toBe(403);

    const autorizou = await request(http).post('/api/v1/medications/authorize-educator')
      .set(auth(tokens.coord))
      .send({ userId: ids.educadorId, houseId: ids.AI4, validoAte: '2099-12-31',
              nota: 'Capacitação da Enfermagem registrada; turno noturno.' });
    expect(autorizou.status).toBe(201);

    // Autorizada nominalmente e AINDA ASSIM recusada: o protocolo da casa não
    // abriu o período. É a regra §11.3 inteira, não a metade dela.
    const soNominal = await request(http)
      .get(`/api/v1/medications/can-administer?houseId=${ids.AI4}&periodo=noturno`)
      .set(auth(tokens.educador));
    expect(soNominal.body.pode).toBe(false);
    expect(soNominal.body.motivo).toMatch(/protocolo desta casa não autoriza/i);

    await request(http).post('/api/v1/medications/protocol').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, periodo: 'noturno', enfermagem: true, educadorAutorizado: true,
              nota: 'Definido em reunião da casa; vale para quem estiver nominalmente autorizado.' })
      .expect(201);

    const agora = await request(http)
      .get(`/api/v1/medications/can-administer?houseId=${ids.AI4}&periodo=noturno`)
      .set(auth(tokens.educador));
    expect(agora.body.pode).toBe(true);
  });

  it('a autorização é da PESSOA e vale a partir de HOJE — não do dia do banco', async () => {
    /*
     * `valid_from` nascia com `DEFAULT current_date`, que é o dia do banco em
     * UTC. Depois das 21h de Porto Alegre, a autorização escrita hoje nascia
     * datada de amanhã e `app_can_administer` recusava a dose a noite inteira,
     * com a autorização visível na tela. Regra 9, no lugar mais caro.
     */
    const { rows: [a] } = await admin.query(
      `SELECT valid_from::text AS de FROM medication_authorization
        WHERE user_id=$1 AND house_id=$2`, [ids.educadorId, ids.AI4]);
    expect(a.de).toBe(HOJE);

    const lista = await request(http)
      .get(`/api/v1/medications/authorizations?houseId=${ids.AI4}`).set(auth(tokens.coord));
    expect(lista.status).toBe(200);
    const minha = lista.body.find((x: any) => x.userId === ids.educadorId);
    expect(minha.vigente).toBe(true);
    expect(minha.quem).toBeTruthy();
    expect(minha.autorizadoPor).toBeTruthy();
    expect(minha.nota).toMatch(/Capacitação/);
  });

  it('a autorização vencida NÃO some da lista — some do alcance, não do papel', async () => {
    await admin.query(
      `INSERT INTO medication_authorization (user_id, house_id, valid_from, valid_to, note)
       VALUES ($1,$2, app_hoje() - 90, app_hoje() - 30, 'Autorização do ano passado.')`,
      [ids.educadorId, ids.AI4]);

    const lista = await request(http)
      .get(`/api/v1/medications/authorizations?houseId=${ids.AI4}`).set(auth(tokens.coord));
    const vencida = lista.body.find((x: any) => x.nota === 'Autorização do ano passado.');
    expect(vencida).toBeTruthy();
    expect(vencida.vigente).toBe(false);
  });

  it('a coordenação de outra casa não escreve o protocolo nem autoriza aqui (0820)',
     async () => {
    const protocolo = await request(http).post('/api/v1/medications/protocol')
      .set(auth(tokens.coordDeOutraCasa))
      .send({ houseId: ids.AI4, periodo: 'diurno', enfermagem: true, educadorAutorizado: true,
              nota: 'Escrito por quem não é desta casa.' });
    // E recusa com uma FRASE, não com "new row violates row-level security".
    expect(protocolo.status).toBe(403);
    expect(protocolo.body.message).toMatch(/coordenação DESTA casa/i);

    const autorizacao = await request(http).post('/api/v1/medications/authorize-educator')
      .set(auth(tokens.coordDeOutraCasa))
      .send({ userId: ids.educadorId, houseId: ids.AI4, nota: 'De fora.' });
    expect(autorizacao.status).toBe(403);
    expect(autorizacao.body.message).toMatch(/DESTA casa/i);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM medication_authorization
        WHERE house_id=$1 AND note='De fora.'`, [ids.AI4]);
    expect(rows[0].n).toBe(0);
  });
});
