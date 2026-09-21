/**
 * A MEDICAÇÃO "QUANDO NECESSÁRIO", REGISTRADA (migração 1390).
 *
 * O DEFEITO QUE ESTA SUÍTE EXISTE PARA GUARDAR, medido em 21/09/2026 pelo
 * catálogo e pelas rotas:
 *
 *   * a prescrição tem `kind = 'quando_necessario'` desde a 0200, com a
 *     `use_condition` escrita — e ela é lida, sai na tela de Saúde e sai na
 *     folha da parede, marcada `s/n`;
 *   * `app_generate_doses` junta `medication_schedule`, e uma prescrição sem
 *     horário **não gera dose nenhuma**;
 *   * a única porta de registro era `POST /doses/:id/confirm`, que confirma uma
 *     dose QUE JÁ EXISTE.
 *
 * Então **o remédio "se necessário" era dado e não ficava em lugar nenhum** — e
 * é justamente o que o educador dá às 2h da manhã, sozinho, quando a criança
 * acorda com febre. As colunas `prn_reason` e `prn_outcome` foram criadas na
 * 0200 para exatamente isto e ficaram sem um `INSERT` e sem um `SELECT` em todo
 * o repositório.
 *
 * O que esta suíte cobra:
 *
 *   * registrar exige **motivo escrito** — a condição da prescrição diz quando
 *     se PODE dar; o motivo diz o que aconteceu naquela noite;
 *   * as guardas são as MESMAS da confirmação de dose, e a exceção
 *     `nurse_only` por medicamento (0930) vale aqui igual: "quando necessário"
 *     não é atalho para contorná-la;
 *   * a dose registrada **aparece na grade do dia, com o motivo** — senão o dado
 *     volta a ser invisível, que é o defeito que esta fase conserta;
 *   * o **desfecho se escreve depois**, sem prazo, e **uma vez** — nada se
 *     sobrescreve;
 *   * e prescrição **com** horário não entra por esta porta: a dose dela é
 *     confirmada na grade.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A medicação "quando necessário"', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** Uma prescrição "quando necessário", assinada — a orientação válida. */
  const prescrever = async (opcoes: { soEnfermagem?: boolean } = {}) => {
    const r = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: ids.crianca, houseId: ids.AI3, tipo: 'quando_necessario',
              medicamento: 'Antitérmico (fictício)', dose: '1 comprimido', via: 'oral',
              condicaoUso: 'Se a temperatura passar de 38°C (fictício).',
              prescritor: 'Pediatria (fictícia)' });
    expect(r.status).toBe(201);
    const id = r.body.id as string;
    const assinou = await request(http).post(`/api/v1/medications/prescriptions/${id}/sign`)
      .set(auth(tokens.enfermagem)).send({});
    expect(assinou.status).toBe(201);
    if (opcoes.soEnfermagem) {
      const so = await request(http).post(`/api/v1/medications/prescriptions/${id}/nurse-only`)
        .set(auth(tokens.enfermagem))
        .send({ soEnfermagem: true,
                motivo: 'Manejo difícil; fictício, para a suíte do quando necessário.' });
      expect(so.status).toBe(201);
    }
    return id;
  };

  const registrar = (token: string, prescricao: string, corpo: Record<string, unknown>) =>
    request(http).post(`/api/v1/medications/prescriptions/${prescricao}/prn`)
      .set(auth(token)).send(corpo);

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
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    /* Uma criança pelo meio da ordem: as pontas são as que as outras suítes
       usam, e duas suítes medicando a mesma criança é confusão barata. */
    ({ rows: [{ id: ids.crianca }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name OFFSET 5 LIMIT 1`, [ids.AI3]));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== O registro ====================

  it('sem motivo escrito, não registra — e a recusa diz para que serve o motivo', async () => {
    const pr = await prescrever();
    const curto = await registrar(tokens.educador, pr, { motivo: 'febre' });
    expect(curto.status).toBe(400);
    expect(curto.body.message).toMatch(/mínimo 10/i);
    /* A recusa explica POR QUE, e é isso que faz a pessoa escrever melhor em
       vez de preencher dez caracteres quaisquer. */
    expect(curto.body.message).toMatch(/dose fixa|Enfermagem/i);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM medication_administration WHERE prescription_id = $1`, [pr]);
    expect(rows[0].n).toBe(0);
  });

  it('o educador de plantão registra, com o motivo — e a dose nasce deste ato', async () => {
    const pr = await prescrever();
    /* Antes desta fase não havia dose nenhuma: a prescrição sem horário não é
       alcançada pela geração do dia. */
    const antes = await admin.query(
      `SELECT count(*)::int AS n FROM medication_administration WHERE prescription_id = $1`, [pr]);
    expect(antes.rows[0].n).toBe(0);

    const r = await registrar(tokens.educador, pr, {
      motivo: 'Acordou às 2h com 38,4°C e queixa de dor de cabeça (fictício).',
      nota: 'Bebeu água depois.',
    });
    expect(r.status).toBe(201);
    ids.dose = r.body.id;
    /* O aviso diz que o depois pode esperar — é a decisão de 16/09 aplicada. */
    expect(r.body.aviso).toMatch(/não há prazo/i);

    const { rows: [d] } = await admin.query(
      `SELECT state, prn_reason, prn_outcome, administered_by, administered_at, scheduled_at
         FROM medication_administration WHERE id = $1`, [ids.dose]);
    expect(d.prn_reason).toMatch(/38,4/);
    expect(d.prn_outcome).toBeNull();
    expect(d.administered_by).toBeTruthy();
    /*
     * Para uma dose sem hora marcada, o horário previsto É o momento em que foi
     * preciso — e por isso o estado é "no horário" e nunca "com atraso": dose
     * sem hora marcada não pode atrasar.
     */
    expect(d.state).toBe('administrado_no_horario');
    expect(new Date(d.scheduled_at).getTime()).toBe(new Date(d.administered_at).getTime());
  });

  it('e ela aparece na grade do dia COM o motivo — senão o dado volta a ser invisível', async () => {
    const { rows: [{ hoje }] } = await admin.query(`SELECT app_hoje()::text AS hoje`);
    /* `GET /medications` é a GRADE do dia; `/folha` é o papel do armário. */
    const grade = await request(http)
      .get(`/api/v1/medications?houseId=${ids.AI3}&date=${hoje}`)
      .set(auth(tokens.educador));
    expect(grade.status).toBe(200);

    const lista = grade.body.doses ?? grade.body;
    const nossa = (Array.isArray(lista) ? lista : []).find((d: any) => d.id === ids.dose);
    expect(nossa).toBeTruthy();
    expect(nossa.motivoQuandoNecessario).toMatch(/38,4/);
    expect(nossa.tipo).toBe('quando_necessario');
    /* E ela não aparece como pendência: já foi dada. */
    expect(nossa.pendente).toBe(false);
  });

  // ==================== O desfecho, depois ====================

  it('o desfecho se escreve depois — e só uma vez', async () => {
    const curto = await request(http)
      .post(`/api/v1/medications/doses/${ids.dose}/prn-outcome`)
      .set(auth(tokens.enfermagem)).send({ desfecho: 'ok' });
    expect(curto.status).toBe(400);

    const r = await request(http)
      .post(`/api/v1/medications/doses/${ids.dose}/prn-outcome`)
      .set(auth(tokens.enfermagem))
      .send({ desfecho: 'Febre cedeu em cerca de 40 minutos; dormiu o resto da noite (fictício).' });
    expect(r.status).toBe(201);

    /*
     * A SEGUNDA VEZ É RECUSADA, e a recusa diz o caminho.
     *
     * Nada se sobrescreve (§5.1): a primeira observação é justamente a que a
     * Enfermagem compara. Se a casa precisar registrar mais de uma — a febre que
     * cedeu e voltou —, isso é uma tabela e é decisão da Fundação.
     */
    const denovo = await request(http)
      .post(`/api/v1/medications/doses/${ids.dose}/prn-outcome`)
      .set(auth(tokens.enfermagem))
      .send({ desfecho: 'Voltou a subir às 6h (fictício).' });
    expect(denovo.status).toBe(409);
    expect(denovo.body.message).toMatch(/não se reescreve/i);

    const { rows: [d] } = await admin.query(
      `SELECT prn_outcome FROM medication_administration WHERE id = $1`, [ids.dose]);
    expect(d.prn_outcome).toMatch(/40 minutos/);
  });

  // ==================== As guardas, que são as mesmas ====================

  it('a exceção "só a Enfermagem" vale aqui igual — não é atalho para contorná-la', async () => {
    const pr = await prescrever({ soEnfermagem: true });

    const doEducador = await registrar(tokens.educador, pr, {
      motivo: 'Acordou com febre alta de madrugada (fictício).',
    });
    expect(doEducador.status).toBe(403);
    expect(doEducador.body.message).toMatch(/exclusivo da Enfermagem/i);

    /* E a Enfermagem registra. */
    const daEnf = await registrar(tokens.enfermagem, pr, {
      motivo: 'Dei eu mesma, às 10h, com 38,6°C (fictício).',
    });
    expect(daEnf.status).toBe(201);
  });

  it('prescrição com HORÁRIO não entra por esta porta', async () => {
    const comHorario = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: ids.crianca, houseId: ids.AI3, tipo: 'uso_continuo',
              medicamento: 'Vitamina (fictícia)', dose: '10 gotas', via: 'oral',
              horarios: ['09:00'], prescritor: 'Pediatria (fictícia)' });
    expect(comHorario.status).toBe(201);
    await request(http).post(`/api/v1/medications/prescriptions/${comHorario.body.id}/sign`)
      .set(auth(tokens.enfermagem)).send({});

    const r = await registrar(tokens.educador, comHorario.body.id, {
      motivo: 'Tentando registrar pela porta errada (fictício).',
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/grade do dia/i);
  });

  it('prescrição suspensa não recebe dose — a orientação tem de estar válida', async () => {
    const pr = await prescrever();
    const suspendeu = await request(http)
      .post(`/api/v1/medications/prescriptions/${pr}/suspend`)
      .set(auth(tokens.enfermagem))
      .send({ motivo: 'Suspensa pela pediatra na consulta de ontem (fictício).' });
    expect(suspendeu.status).toBe(201);

    const r = await registrar(tokens.educador, pr, {
      motivo: 'Criança com febre, mas a prescrição está suspensa (fictício).',
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/suspensa|orientação válida/i);
  });

  it('hora no futuro é recusada: dose que será dada não é dose dada', async () => {
    const pr = await prescrever();
    const r = await registrar(tokens.educador, pr, {
      motivo: 'Vou dar mais tarde, se precisar (fictício).',
      quando: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/futuro/i);
  });

  // ==================== E o registro fica na auditoria ====================

  it('o registro tem autor na auditoria, e o motivo NÃO vai para o log', async () => {
    const { rows } = await admin.query(
      `SELECT action, detail FROM audit_event
        WHERE entity = 'medication_administration' AND entity_id = $1
        ORDER BY at`, [ids.dose]);
    const acoes = rows.map((r: any) => r.action);
    expect(acoes).toContain('medication.prn_registered');
    expect(acoes).toContain('medication.prn_outcome');
    /* O conteúdo não vai para o log (§20) — só metadado. */
    expect(JSON.stringify(rows)).not.toMatch(/38,4/);
    expect(JSON.stringify(rows)).not.toMatch(/40 minutos/);
  });
});
