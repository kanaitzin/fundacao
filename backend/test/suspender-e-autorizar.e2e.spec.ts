/**
 * SUSPENDER O ESQUEMA, E O QUE A CASA DECIDIU ANTES (§11.1 e §11.3).
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
 * A segunda metade desta suíte — a autorização nominal e o protocolo por
 * período — saiu em 08/09/2026: a Fundação respondeu a pendência 33.4.1 e o
 * educador de plantão passou a poder dar o remédio por padrão (migração 0930).
 * A regra nova tem suíte própria, `quem-da-o-remedio.e2e.spec.ts`. Ficou aqui
 * a leitura do que a casa decidiu ANTES, que não foi apagada.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Suspender o esquema, e o que a casa decidiu antes', () => {
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
  //
  // Os quatro testes que ficavam aqui guardavam a regra do protocolo por
  // período e da autorização nominal — a hipótese que valia enquanto a
  // pendência 33.4.1 estava em aberto. Ela foi respondida em 08/09/2026, e a
  // regra que a substituiu tem suíte própria: `quem-da-o-remedio.e2e.spec.ts`.
  //
  // Fica aqui só o que continua sendo desta suíte: a leitura do que a casa
  // decidiu ANTES, que não foi apagada (regra 6).

  it('o que a casa decidiu antes continua legível, e não decide mais nada', async () => {
    const historico = await request(http)
      .get(`/api/v1/medications/protocol-history?houseId=${ids.AI4}`).set(auth(tokens.coord));
    expect(historico.status).toBe(200);
    expect(Array.isArray(historico.body)).toBe(true);

    const vigente = await request(http)
      .get(`/api/v1/medications/protocol?houseId=${ids.AI4}`).set(auth(tokens.coord));
    expect(vigente.body.historico).toBe(true);

    // E o educador continua podendo dar o remédio da noite, que é o ponto
    // inteiro da mudança: antes, esta mesma casa o recusaria.
    const pode = await request(http)
      .get(`/api/v1/medications/can-administer?houseId=${ids.AI4}&periodo=noturno`)
      .set(auth(tokens.educador));
    expect(pode.body.pode).toBe(true);
  });
});
