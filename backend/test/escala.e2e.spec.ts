/**
 * A ESCALA DE PLANTÃO (§5.12, migrações 0950 e 0960).
 *
 * O pedido do Marcelo em 08/09/2026 tinha quatro partes, e cada uma virou um
 * grupo aqui: montar com antecedência por dia e por turno; não deixar a casa
 * desassistida; gerar a folha para a parede; e guardar o mês passado, para o
 * dia em que for preciso investigar um evento de meses atrás.
 *
 * O que esta suíte guarda:
 *
 *  * quem monta é a coordenação DESTA casa (a lição da 0820, de novo);
 *  * a repetição preenche o mês e é idempotente — clicar duas vezes no fim de
 *    um turno de doze horas não pode duplicar plantão;
 *  * o turno sem ninguém é DEVOLVIDO, e não deduzido da ausência de linha;
 *  * nada se apaga: retirar é revogar, com autor; e retirar plantão que já
 *    passou exige motivo, porque muda a resposta de quem estava na casa;
 *  * e a passagem passa a cobrar a assinatura de QUEM ESTAVA ESCALADO, com a
 *    fonte declarada — que era o buraco que a 0420 tinha deixado aberto.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A escala de plantão', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let HOJE = '';
  let ONTEM = '';
  let AMANHA = '';

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const escalar = (token: string, corpo: any) =>
    request(http).post('/api/v1/escala').set(auth(token)).send({ houseId: ids.AI4, ...corpo });
  const periodo = async (token: string, de: string, ate: string) =>
    (await request(http).get(`/api/v1/escala?houseId=${ids.AI4}&de=${de}&ate=${ate}`)
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
      // Casa 04: a AI3 é disputada por meia dúzia de suítes (regra 13).
      coord: 'coord.ai4@paodospobres.dev',
      educador: 'educador.ai4@paodospobres.dev',
      coordDeFora: 'coord.ai3@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ id: ids.educadorId }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai4@paodospobres.dev'`));
    ({ rows: [{ hoje: HOJE, ontem: ONTEM, amanha: AMANHA }] } = await admin.query(
      `SELECT app_hoje()::text AS hoje, (app_hoje()-1)::text AS ontem, (app_hoje()+1)::text AS amanha`));
  });

  afterAll(async () => {
    /*
     * Suíte que muta estado compartilhado desfaz o que criou: a partir da 0960,
     * `app_missing_handovers` LÊ esta escala, e outras suítes fecham ATA na
     * mesma casa — deixar a escala montada mudaria quem elas esperam assinar.
     *
     * Desfazer aqui é REVOGAR, e não apagar: a tabela não aceita DELETE nem do
     * dono do banco, que é justamente o que o teste da imutabilidade prova.
     * Revogada, a linha some do cálculo (que só olha `revoked_at IS NULL`) sem
     * sumir do registro.
     */
    await admin.query(
      `UPDATE shift_assignment SET revoked_at = now(), revoked_by = created_by,
              revoke_reason = 'Escala criada pela suíte de teste.'
        WHERE house_id = $1 AND revoked_at IS NULL`, [ids.AI4]);
    await app.close(); await admin.end();
  });

  // ==================== Quem monta ====================

  it('o educador não monta a escala', async () => {
    const r = await escalar(tokens.educador,
      { userId: ids.educadorId, data: AMANHA, turno: 'noturno' });
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/coordenação/i);
  });

  it('a coordenação de outra casa não monta a escala desta', async () => {
    const r = await escalar(tokens.coordDeFora,
      { userId: ids.educadorId, data: AMANHA, turno: 'noturno' });
    expect(r.status).toBe(403);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM shift_assignment WHERE house_id=$1 AND on_date=$2`,
      [ids.AI4, AMANHA]);
    expect(rows[0].n).toBe(0);
  });

  // ==================== Montar, e repetir ====================

  it('escala um plantão, e a repetição preenche o mês sem duplicar', async () => {
    const um = await escalar(tokens.coord,
      { userId: ids.educadorId, data: AMANHA, turno: 'noturno', nota: 'Cobrindo a folga.' });
    expect(um.status).toBe(201);
    expect(um.body.criadas).toBe(1);

    /* A cada 2 dias é o desenho de uma 12x36 — o ciclo anda pelo calendário, e
     * é justamente por isso que a escala SEMANAL não servia. */
    const daqui20 = (await admin.query(`SELECT (app_hoje()+20)::text AS d`)).rows[0].d;
    const varios = await escalar(tokens.coord, {
      userId: ids.educadorId, data: AMANHA, turno: 'noturno',
      repetirACada: 2, ate: daqui20,
    });
    expect(varios.status).toBe(201);
    // O primeiro dia já existia: repetir não duplica, e o servidor diz isso.
    expect(varios.body.jaExistiam).toBe(1);
    expect(varios.body.criadas).toBeGreaterThan(8);

    const denovo = await escalar(tokens.coord, {
      userId: ids.educadorId, data: AMANHA, turno: 'noturno',
      repetirACada: 2, ate: daqui20,
    });
    expect(denovo.body.criadas).toBe(0);
    expect(denovo.body.jaExistiam).toBeGreaterThan(8);
  });

  it('repetir sem dizer até quando é recusado', async () => {
    const r = await escalar(tokens.coord,
      { userId: ids.educadorId, data: AMANHA, turno: 'diurno', repetirACada: 2 });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/até quando/i);
  });

  // ==================== O turno sem ninguém ====================

  it('o período devolve os dois turnos de todos os dias, e nomeia os vazios', async () => {
    const p = await periodo(tokens.educador, HOJE, AMANHA);
    expect(p.dias).toHaveLength(2);

    const amanha = p.dias.find((d: any) => d.data === AMANHA);
    expect(amanha.noturno.length).toBeGreaterThan(0);
    // O diurno de amanhã não foi escalado: o buraco vem ESCRITO, e não como
    // ausência de linha — dia vazio se lê como "ainda não montei".
    expect(amanha.semNinguem).toContain('diurno');
    expect(p.turnosSemNinguem.some((x: any) => x.data === AMANHA && x.turno === 'diurno')).toBe(true);
    expect(p.aviso).toMatch(/não têm ninguém escalado/i);
  });

  it('a escala é LIDA por quem trabalha na casa — inclusive o educador', async () => {
    const p = await periodo(tokens.educador, AMANHA, AMANHA);
    expect(p.dias[0].noturno[0].quem).toBeTruthy();
  });

  // ==================== Retirar ====================

  it('retirar do futuro não pede motivo; a linha fica, revogada', async () => {
    const p = await periodo(tokens.coord, AMANHA, AMANHA);
    const alvo = p.dias[0].noturno[0];

    const r = await request(http).post(`/api/v1/escala/${alvo.id}/revogar`)
      .set(auth(tokens.coord)).send({ motivo: '' });
    expect(r.status).toBe(201);
    expect(r.body.mudou).toBe(true);

    const depois = await periodo(tokens.coord, AMANHA, AMANHA);
    expect(depois.dias[0].noturno.some((x: any) => x.id === alvo.id)).toBe(false);
    // Nada some: a linha aparece na lista do que foi retirado, com quem retirou.
    const revogada = depois.dias[0].revogadas.find((x: any) => x.id === alvo.id);
    expect(revogada).toBeTruthy();
    expect(revogada.revogadaPor).toBeTruthy();

    // Revogar de novo não é erro, e não inventa uma segunda revogação.
    const outra = await request(http).post(`/api/v1/escala/${alvo.id}/revogar`)
      .set(auth(tokens.coord)).send({});
    expect(outra.body.mudou).toBe(false);
  });

  it('retirar plantão que JÁ PASSOU exige motivo escrito', async () => {
    const criou = await escalar(tokens.coord,
      { userId: ids.educadorId, data: ONTEM, turno: 'diurno' });
    expect(criou.status).toBe(201);
    const p = await periodo(tokens.coord, ONTEM, ONTEM);
    const alvo = p.dias[0].diurno[0];

    const sem = await request(http).post(`/api/v1/escala/${alvo.id}/revogar`)
      .set(auth(tokens.coord)).send({ motivo: 'erro' });
    expect(sem.status).toBe(400);
    expect(sem.body.message).toMatch(/já passou/i);

    const com = await request(http).post(`/api/v1/escala/${alvo.id}/revogar`)
      .set(auth(tokens.coord))
      .send({ motivo: 'Escalado por engano; quem cobriu foi a Tainá, e ela assinou a passagem.' });
    expect(com.status).toBe(201);
  });

  it('a escala não se reescreve por dentro do banco', async () => {
    const p = await periodo(tokens.coord, AMANHA, AMANHA);
    const linha = [...p.dias[0].noturno, ...p.dias[0].revogadas][0];
    await expect(admin.query(
      `UPDATE shift_assignment SET on_date = on_date + 1 WHERE id = $1`, [linha.id]))
      .rejects.toThrow();
    await expect(admin.query(
      `DELETE FROM shift_assignment WHERE id = $1`, [linha.id])).rejects.toThrow();
  });

  // ==================== A folha da parede ====================

  it('a folha traz um quadro por semana, e o turno vazio sai escrito', async () => {
    const daqui7 = (await admin.query(`SELECT (app_hoje()+7)::text AS d`)).rows[0].d;
    const r = await request(http)
      .get(`/api/v1/escala/folha?houseId=${ids.AI4}&de=${HOJE}&ate=${daqui7}`)
      .set(auth(tokens.coord));
    expect(r.status).toBe(200);
    expect(r.body.titulo).toMatch(/Escala/i);
    expect(r.body.secoes[0].titulo).toMatch(/Semana de/);
    expect(r.body.secoes[0].tabela.cabecalho).toHaveLength(3);

    const corpo = JSON.stringify(r.body.secoes);
    expect(corpo).toContain('— sem escala —');
    // Nenhuma contagem por pessoa: somar plantão por nome é medição de gente.
    expect(corpo).not.toMatch(/total de plantões|plantões no mês/i);
  });

  it('a casa de fora não devolve folha vazia — devolve recusa', async () => {
    const { rows: [ai3] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`);
    const r = await request(http)
      .get(`/api/v1/escala/folha?houseId=${ai3.id}&de=${HOJE}&ate=${HOJE}`)
      .set(auth(tokens.coord));
    // Zero se leria como "ninguém escalado nesta casa", e não como "não é sua".
    expect([403, 404]).toContain(r.status);
  });

  // ==================== A passagem olha a escala (0960) ====================

  it('quem devia assinar a passagem passa a vir da escala do dia', async () => {
    const { rows: [{ d: depois }] } = await admin.query(`SELECT (app_hoje()-3)::text AS d`);
    // Um plantão num dia sem disputa com outras suítes.
    const aberto = await request(http).post('/api/v1/shifts').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, data: depois, turno: 'diurno' });
    const plantao = aberto.body.plantaoId;

    const semEscala = await admin.query(
      `SELECT * FROM app_missing_handovers($1)`, [plantao]);
    expect(semEscala.rows[0].fonte).toBe('vinculo_da_casa');

    await escalar(tokens.coord, { userId: ids.educadorId, data: depois, turno: 'diurno' });

    const comEscala = await admin.query(
      `SELECT * FROM app_missing_handovers($1)`, [plantao]);
    expect(comEscala.rows.every((r: any) => r.fonte === 'escala_do_dia')).toBe(true);
    // A cobrança passou a ser de quem estava escalado — e só dele.
    expect(comEscala.rows.map((r: any) => r.user_id)).toEqual([ids.educadorId]);

    /*
     * E a escala NÃO é porta: quem cobriu o turno sem constar assina do mesmo
     * jeito. Escala que trava é escala que a casa contorna.
     */
    const assinou = await request(http).post(`/api/v1/shifts/${plantao}/handover`)
      .set(auth(tokens.coord))
      .send({ contribuicoes: 'Cobri o fim do turno; não constava na escala.' });
    expect(assinou.status).toBe(201);
  });
});
