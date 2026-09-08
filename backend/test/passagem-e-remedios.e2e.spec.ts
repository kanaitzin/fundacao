/**
 * A PASSAGEM LÊ AS DOSES DE VOLTA (§12.1, §11.2, migração 0940).
 *
 * Pedido do Marcelo em 08/09/2026: "no final da passagem do turno alguém tem
 * que dizer que deu o remédio e se está tudo ok".
 *
 * O jeito errado seria um botão que marcasse as doses do turno como dadas —
 * marcação em lote de medicamento, que o §11.2 proíbe sem a palavra
 * "silenciosa": é absoluto. O que existe aqui é o contrário: a passagem LÊ o
 * que ficou gravado e mostra a dose sem resposta enquanto quem a deu ainda
 * está na casa.
 *
 * O que esta suíte guarda:
 *
 *  * a passagem devolve as doses DO TURNO, com estado e com quem confirmou;
 *  * dose sem resposta faz a frase ser obrigatória, e a recusa NOMEIA quais;
 *  * escrever a frase NÃO confirma dose nenhuma — a dose continua esperando;
 *  * "alguém tem que dizer" é UMA vez por turno, e não uma por pessoa;
 *  * e a frase fica na passagem, legível para quem chega.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A passagem e os remédios do turno', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let plantao = '';
  let doseSemResposta = '';

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const abrir = async (token: string) =>
    (await request(http).get(`/api/v1/shifts/${plantao}`).set(auth(token))).body;

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
      // A Casa 04: a AI3 é disputada por meia dúzia de suítes, e um turno
      // compartilhado faria esta prova depender da ordem das outras (regra 13).
      educador: 'educador.ai4@paodospobres.dev',
      coord: 'coord.ai4@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ person_id: ids.acolhido }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [ids.AI4]));

    /*
     * O plantão é o de ONTEM, e o esquema é criado por esta suíte.
     *
     * Ontem porque o plantão de hoje da Casa 04 é aberto e fechado por outras
     * suítes; e próprio porque marcar dose de um esquema alheio mudaria o que
     * elas leem. As duas coisas são a regra 13 aplicada a estado que não é
     * contagem.
     */
    const ontem = (await admin.query(`SELECT (app_hoje() - 1)::text AS d`)).rows[0].d;
    const aberto = await request(http).post('/api/v1/shifts').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, data: ontem, turno: 'noturno' });
    plantao = aberto.body.plantaoId;

    const esquema = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: ids.acolhido, houseId: ids.AI4, tipo: 'uso_continuo',
              medicamento: 'Anticonvulsivante (fictício) — suíte da passagem',
              dose: '1 comprimido', via: 'oral', horarios: ['22:00'] });
    ids.esquema = esquema.body.id;
    await request(http).post(`/api/v1/medications/prescriptions/${ids.esquema}/sign`)
      .set(auth(tokens.enfermagem)).expect(201);

    // Duas doses DENTRO da janela do plantão noturno de ontem (19h→07h): uma
    // confirmada e uma sem resposta, que é o caso que motivou o bloco.
    const { rows } = await admin.query(
      `INSERT INTO medication_administration (prescription_id, person_id, house_id, scheduled_at)
       VALUES ($1,$2,$3, ($4::date + time '22:00') AT TIME ZONE app_fuso()),
              ($1,$2,$3, ($4::date + time '23:30') AT TIME ZONE app_fuso())
       RETURNING id`, [ids.esquema, ids.acolhido, ids.AI4, ontem]);
    doseSemResposta = rows[1].id;
    await request(http).post(`/api/v1/medications/doses/${rows[0].id}/confirm`)
      .set(auth(tokens.enfermagem))
      .send({ estado: 'administrado_com_atraso', nota: 'Dada às 22h20, criança já deitada.' })
      .expect(201);
  });

  afterAll(async () => {
    if (ids.esquema) {
      await admin.query(`UPDATE prescription SET status='encerrada' WHERE id=$1`, [ids.esquema]);
    }
    await app.close(); await admin.end();
  });

  it('o plantão devolve as doses do turno, com estado e com quem confirmou', async () => {
    const p = await abrir(tokens.educador);
    const minhas = p.remedios.doses.filter(
      (d: any) => String(d.medicamento).includes('suíte da passagem'));
    expect(minhas).toHaveLength(2);

    const dada = minhas.find((d: any) => !d.semResposta);
    expect(dada.confirmou).toBeTruthy();
    expect(dada.estado).toBe('administrado_com_atraso');

    const esperando = minhas.find((d: any) => d.semResposta);
    expect(esperando.confirmou).toBeNull();
    expect(esperando.acolhido).toBeTruthy();
    expect(p.remedios.exigeFrase).toBe(true);
  });

  it('sem a frase, a passagem não é assinada — e a recusa diz QUAIS doses', async () => {
    const r = await request(http).post(`/api/v1/shifts/${plantao}/handover`)
      .set(auth(tokens.educador))
      .send({ contribuicoes: 'Turno da noite sem intercorrência.' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/sem resposta/i);
    expect(r.body.message).toMatch(/suíte da passagem/);

    // Frase curta demais também não passa: "ok" não diz nada a quem lê amanhã.
    const curta = await request(http).post(`/api/v1/shifts/${plantao}/handover`)
      .set(auth(tokens.educador))
      .send({ contribuicoes: 'Turno da noite sem intercorrência.', medicacao: 'ok' });
    expect(curta.status).toBe(400);
  });

  it('a frase NÃO confirma dose nenhuma — a dose continua esperando alguém', async () => {
    const r = await request(http).post(`/api/v1/shifts/${plantao}/handover`)
      .set(auth(tokens.educador))
      .send({ contribuicoes: 'Turno da noite sem intercorrência.',
              medicacao: 'A dose das 23h30 foi dada pela Joana, que não conseguiu confirmar no '
                + 'aplicativo; ela confirma amanhã cedo.' });
    expect(r.status).toBe(201);

    const { rows: [dose] } = await admin.query(
      `SELECT state, administered_by FROM medication_administration WHERE id=$1`, [doseSemResposta]);
    expect(dose.state).toBe('aguardando_confirmacao');
    expect(dose.administered_by).toBeNull();
  });

  it('"alguém tem que dizer" é uma vez por turno, não uma vez por pessoa', async () => {
    /*
     * Quatro pessoas assinam a passagem do mesmo turno. Cobrar a frase de
     * todas seria pedir quatro vezes a mesma coisa sobre as mesmas doses — e
     * a quarta escreveria qualquer coisa para conseguir ir embora.
     */
    const p = await abrir(tokens.coord);
    expect(p.remedios.jaEscrito).toBe(true);
    expect(p.remedios.exigeFrase).toBe(false);
    // A dose sem resposta continua na lista: ainda dá para resolver.
    expect(p.remedios.semResposta).toBeGreaterThan(0);

    const segunda = await request(http).post(`/api/v1/shifts/${plantao}/handover`)
      .set(auth(tokens.coord))
      .send({ contribuicoes: 'Passei na casa no fim do turno.' });
    expect(segunda.status).toBe(201);
  });

  it('a frase fica na passagem, para quem chega ler', async () => {
    const p = await abrir(tokens.coord);
    const doEducador = p.passagens.find((x: any) => x.medicacao);
    expect(doEducador.medicacao).toMatch(/23h30/);
  });

  it('turno sem dose não pede frase nenhuma', async () => {
    const ontem = (await admin.query(`SELECT (app_hoje() - 1)::text AS d`)).rows[0].d;
    const outro = await request(http).post('/api/v1/shifts').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, data: ontem, turno: 'diurno' });
    const p = (await request(http).get(`/api/v1/shifts/${outro.body.plantaoId}`)
      .set(auth(tokens.coord))).body;
    const minhas = p.remedios.doses.filter(
      (d: any) => String(d.medicamento).includes('suíte da passagem'));
    expect(minhas).toHaveLength(0);   // as duas doses são do turno da noite
  });
});
