/**
 * QUEM DÁ O REMÉDIO NESTA CASA (§11.3, migração 0930).
 *
 * Esta suíte era `protocolo-da-casa.e2e.spec.ts` e guardava a regra que valia
 * enquanto a pendência institucional 33.4.1 estava em aberto: só a Enfermagem
 * administrava, e o educador dependia de um protocolo escrito pela coordenação
 * MAIS uma autorização nominal.
 *
 * A Fundação respondeu em 08/09/2026, e a resposta desfaz a hipótese:
 *
 *   * o remédio é dado pela Enfermagem OU pelo pessoal da casa, conforme a
 *     bula do acolhido;
 *   * a Enfermagem atende das 9h às 17h. Depois disso é o educador de plantão,
 *     porque é ele quem está lá — e vários tratamentos têm dose à noite.
 *
 * A regra antiga, aplicada a esse horário, recusaria TODA dose noturna
 * mandando "acionar a Enfermagem", que foi embora às 17h. A dose seria dada — a
 * criança precisa dela — e ficaria sem registro.
 *
 * O que esta suíte guarda agora:
 *
 *  * o educador de plantão confirma dose por padrão, de dia e de noite;
 *  * a EXCEÇÃO é por medicamento, não por turno nem por pessoa, e ela barra de
 *    verdade — com o motivo escrito chegando a quem foi barrado;
 *  * marcar exige motivo, guarda o antes-e-depois, e o histórico não se apaga;
 *  * a casa de fora continua fora (regra 8);
 *  * e o que a casa decidiu ANTES continua legível: as tabelas do protocolo
 *    deixaram de decidir, não de existir (regra 6).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Quem dá o remédio nesta casa', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let esquema = '';
  let dose = '';

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const marcar = (token: string, corpo: any, prescricao = esquema) =>
    request(http).post(`/api/v1/medications/prescriptions/${prescricao}/nurse-only`)
      .set(auth(token)).send(corpo);

  const MOTIVO = 'Aplicação subcutânea com ajuste pela glicemia, conforme orientação da '
    + 'consulta de endocrinologia (fictícia) de 04/09.';

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
      coord: 'coord.ai3@paodospobres.dev',
      coordAi4: 'coord.ai4@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows: [pessoa] } = await admin.query(
      `SELECT p.id FROM person p
         JOIN house_stay s ON s.person_id = p.id AND s.ended_at IS NULL
        WHERE s.house_id = $1 LIMIT 1`, [ids.AI3]);
    ids.pessoa = pessoa.id;

    /*
     * A suíte cria o PRÓPRIO esquema, em vez de marcar um do seed: marcar um
     * medicamento como exclusivo da Enfermagem muda o que as outras suítes
     * conseguem confirmar, e a regra 13 vale também para estado que não é
     * contagem.
     */
    const criado = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: ids.pessoa, houseId: ids.AI3, tipo: 'uso_continuo',
              medicamento: 'Insulina (fictícia) — suíte da exceção', dose: '8 UI',
              via: 'subcutânea', horarios: ['22:00'] });
    esquema = criado.body.id;
    await request(http).post(`/api/v1/medications/prescriptions/${esquema}/sign`)
      .set(auth(tokens.enfermagem)).expect(201);
    await request(http).post('/api/v1/medications/generate-doses')
      .set(auth(tokens.enfermagem)).send({ houseId: ids.AI3 });
    const { rows: [d] } = await admin.query(
      `SELECT id FROM medication_administration
        WHERE prescription_id = $1 AND state = 'aguardando_confirmacao'
        ORDER BY scheduled_at LIMIT 1`, [esquema]);
    dose = d?.id;
  });

  afterAll(async () => {
    // Desfaz o que criou: o esquema sai da grade da casa, e a exceção com ele.
    if (esquema) {
      await admin.query(`UPDATE prescription SET status='encerrada' WHERE id=$1`, [esquema]);
    }
    await app.close(); await admin.end();
  });

  // ==================== O padrão ====================

  it('o educador de plantão confirma dose, de dia e de noite', async () => {
    for (const periodo of ['diurno', 'noturno']) {
      const r = await request(http)
        .get(`/api/v1/medications/can-administer?houseId=${ids.AI3}&periodo=${periodo}`)
        .set(auth(tokens.educador));
      expect(r.body.pode).toBe(true);
    }
  });

  it('a Enfermagem confirma sempre; quem não está no cuidado direto, não', async () => {
    const enf = await request(http)
      .get(`/api/v1/medications/can-administer?houseId=${ids.AI3}&periodo=noturno`)
      .set(auth(tokens.enfermagem));
    expect(enf.body.pode).toBe(true);

    const tec = await request(http)
      .get(`/api/v1/medications/can-administer?houseId=${ids.AI3}&periodo=noturno`)
      .set(auth(tokens.tecnica));
    expect(tec.body.pode).toBe(false);
    expect(tec.body.motivo).toMatch(/quem a administrou/i);
  });

  it('a casa de fora continua fora', async () => {
    const { rows: [ai4] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`);
    const r = await request(http)
      .get(`/api/v1/medications/can-administer?houseId=${ai4.id}&periodo=diurno`)
      .set(auth(tokens.educador));
    expect(r.body.pode).toBe(false);
    expect(r.body.motivo).toMatch(/alcance/i);
  });

  // ==================== A exceção ====================

  it('marcar exige motivo, e uma palavra não basta', async () => {
    const sem = await marcar(tokens.enfermagem, { soEnfermagem: true });
    expect(sem.status).toBe(400);
    expect(sem.body.message).toMatch(/escreva por que/i);

    const curto = await marcar(tokens.enfermagem, { soEnfermagem: true, motivo: 'injetável' });
    expect(curto.status).toBe(400);
  });

  it('o educador NÃO marca a exceção — ela decide o que ele pode fazer', async () => {
    const r = await marcar(tokens.educador, { soEnfermagem: true, motivo: MOTIVO });
    expect(r.status).toBe(403);
  });

  it('a coordenação de outra casa não marca o medicamento desta', async () => {
    const r = await marcar(tokens.coordAi4, { soEnfermagem: true, motivo: MOTIVO });
    expect([403, 404]).toContain(r.status);
  });

  it('marcada, a exceção barra o educador — e ele lê o motivo', async () => {
    const antes = await request(http).post(`/api/v1/medications/doses/${dose}/confirm`)
      .set(auth(tokens.educador)).send({ estado: 'administrado_no_horario' });
    expect(antes.status).toBe(201);   // sem exceção, o educador dá o remédio

    // Uma dose nova para a segunda metade da prova.
    const { rows: [outra] } = await admin.query(
      `INSERT INTO medication_administration (prescription_id, person_id, house_id, scheduled_at)
       SELECT prescription_id, person_id, house_id, now() + interval '2 hours'
         FROM medication_administration WHERE id = $1 RETURNING id`, [dose]);

    const marcou = await marcar(tokens.enfermagem, { soEnfermagem: true, motivo: MOTIVO });
    expect(marcou.status).toBe(201);
    expect(marcou.body.mudou).toBe(true);

    const depois = await request(http).post(`/api/v1/medications/doses/${outra.id}/confirm`)
      .set(auth(tokens.educador)).send({ estado: 'administrado_no_horario' });
    expect(depois.status).toBe(403);
    // A frase carrega o motivo escrito: "não autorizado" sem explicação é o
    // que faz alguém dar o remédio por fora do sistema.
    expect(depois.body.message).toMatch(/exclusivo da Enfermagem/i);
    expect(depois.body.message).toMatch(/glicemia/i);

    // E a Enfermagem continua podendo.
    const pelaEnf = await request(http).post(`/api/v1/medications/doses/${outra.id}/confirm`)
      .set(auth(tokens.enfermagem)).send({ estado: 'administrado_no_horario' });
    expect(pelaEnf.status).toBe(201);
  });

  it('marcar duas vezes o mesmo estado não vira decisão', async () => {
    const r = await marcar(tokens.enfermagem, { soEnfermagem: true, motivo: MOTIVO });
    expect(r.status).toBe(201);
    expect(r.body.mudou).toBe(false);
  });

  it('o histórico guarda o antes-e-depois, e quem lê é quem alcança a casa', async () => {
    const hist = await request(http)
      .get(`/api/v1/medications/prescriptions/${esquema}/nurse-only-history`)
      .set(auth(tokens.educador));       // o educador LÊ: é ele quem é barrado
    expect(hist.status).toBe(200);
    expect(hist.body).toHaveLength(1);
    expect(hist.body[0].antes).toBe(false);
    expect(hist.body[0].depois).toBe(true);
    expect(hist.body[0].motivo).toMatch(/glicemia/i);
    expect(hist.body[0].por).toBeTruthy();
  });

  it('desmarcar devolve o medicamento ao educador, sem apagar o que valia antes', async () => {
    const r = await marcar(tokens.coord, { soEnfermagem: false,
      motivo: 'Receita de 08/09 (fictícia) trocou para via oral; não exige mais aplicação.' });
    expect(r.status).toBe(201);
    expect(r.body.mudou).toBe(true);

    const hist = await request(http)
      .get(`/api/v1/medications/prescriptions/${esquema}/nurse-only-history`)
      .set(auth(tokens.coord));
    expect(hist.body).toHaveLength(2);      // a marcação anterior continua lá
    expect(hist.body[0].depois).toBe(false);
  });

  it('o histórico não se altera nem se apaga — nem pelo dono do banco', async () => {
    await expect(admin.query(
      `UPDATE prescription_restriction_change SET reason = 'outro motivo'
        WHERE prescription_id = $1`, [esquema])).rejects.toThrow();
    await expect(admin.query(
      `DELETE FROM prescription_restriction_change WHERE prescription_id = $1`, [esquema]))
      .rejects.toThrow();
  });

  // ==================== O que valia antes ====================

  it('o protocolo por período vira LEITURA, e diz o que a Fundação respondeu', async () => {
    const r = await request(http).get(`/api/v1/medications/protocol?houseId=${ids.AI3}`)
      .set(auth(tokens.coord));
    expect(r.status).toBe(200);
    expect(r.body.historico).toBe(true);
    expect(r.body.respostaDaFundacao).toMatch(/9h às 17h/);

    // E não existe mais porta de escrita: a decisão foi tomada pela Fundação,
    // e uma tela que pedisse de novo faria a coordenação achar que ainda
    // decide — inclusive esquecendo de decidir, com a dose da noite recusada.
    const escreve = await request(http).post('/api/v1/medications/protocol')
      .set(auth(tokens.coord))
      .send({ houseId: ids.AI3, periodo: 'noturno', enfermagem: true,
              educadorAutorizado: true, motivo: 'tentativa de escrever o protocolo antigo' });
    expect(escreve.status).toBe(404);
  });
});
