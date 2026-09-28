/**
 * A VISITA ENTRA E SAI (fase 160).
 *
 * Decisões do humano em 26/09, e o que esta suíte cobra de cada uma:
 *
 *  1. PORTARIA COM LOGIN MÍNIMO — ela vê a lista de quem pode visitar hoje e
 *     registra entrada e saída, e NADA mais: nem perfil, nem saúde, nem ATA,
 *     nem outra casa. A regra geral (`app_house_in_scope`) diz NÃO a ela.
 *  2. FORA DO COMBINADO, RECUSA — dia, horário, validade da autorização, criança
 *     fora da casa. A exceção é da coordenação, da técnica ou do líder, com motivo
 *     escrito; a portaria não abre exceção.
 *  3. A CONTAGEM DE UMA CRIANÇA MORA SÓ NO PERFIL DELA, e os visitantes saem por
 *     NOME, com o número ao lado — nunca ordenados por quantidade.
 *  4. NADA SE APAGA: a visita esquecida aberta se CORRIGE, com o antes e o
 *     depois e o motivo; cada ato vai à auditoria DA CASA.
 *
 * Os visitantes desta suíte são fictícios e ficam inativos no fim — a lista do
 * portão das outras suítes não os vê.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A visita entra e sai', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const criados: string[] = [];

  const login = async (email: string, senha = SENHA) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: senha })).body.token as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** Um visitante fictício, autorizado; `extra` muda o combinado. */
  const visitante = async (nome: string, extra: Record<string, unknown> = {}) => {
    const c = {
      visit_weekdays: '{0,1,2,3,4,5,6}', visit_from: '00:00', visit_to: '23:59',
      visit_valid_from: null, visit_valid_to: null, social_name: null, ...extra,
    };
    const { rows: [r] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, cpf, rg, social_name, visit_authorized,
                                   visit_authorized_by, visit_authorized_at, visit_weekdays,
                                   visit_from, visit_to, visit_valid_from, visit_valid_to,
                                   created_by, updated_by)
       VALUES ($1, $2, 'tio', '52998224725', '1234567890', $3, true, $4, now(), $5::smallint[],
               $6::time, $7::time, $8::date, $9::date, $4, $4)
       RETURNING id`,
      [ids.crianca, nome, c.social_name, ids.coordId, c.visit_weekdays, c.visit_from, c.visit_to,
       c.visit_valid_from, c.visit_valid_to]);
    criados.push(r.id);
    return r.id as string;
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
      coord: 'coord.ai3@paodospobres.dev', educador: 'educador.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ id: ids.coordId }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='coord.ai3@paodospobres.dev'`));
    /* Uma criança da Casa 03 que está na casa hoje. */
    ({ rows: [{ person_id: ids.crianca }] } = await admin.query(
      `SELECT person_id FROM house_stay
        WHERE house_id = $1 AND status = 'ativa' AND NOT app_ausente_da_casa(person_id, app_hoje())
        ORDER BY person_id LIMIT 1`, [ids.AI3]));
    ({ rows: [{ person_id: ids.crianca4 }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa'
        ORDER BY person_id LIMIT 1`, [ids.AI4]));

    /* A conta da portaria é desta suíte, criada pela coordenação da casa. */
    const email = `portaria.160.${Date.now()}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set(auth(tokens.coord))
      .send({ nome: 'Porteiro da Conferência 160 (fictício)', email, cargo: 'portaria', casaId: ids.AI3 });
    expect(r.status).toBe(201);
    ids.portariaId = r.body.id;
    tokens.portaria = await login(email, r.body.senhaInicial);
    expect(tokens.portaria).toBeTruthy();

    ids.tia = await visitante('Tia Conferência Fictícia', { social_name: 'Tia Bia' });
    ids.avo = await visitante('Avó Conferência Fictícia');
  });

  afterAll(async () => {
    /* Nada se apaga: as visitas ficam fechadas, e os visitantes fictícios saem
       da lista do portão (inativos, com o motivo). */
    await admin.query(
      `UPDATE visit SET ended_at = now(), ended_by = $2 WHERE contact_id = ANY($1::uuid[]) AND ended_at IS NULL`,
      [criados, ids.coordId]);
    await admin.query(
      `UPDATE person_contact SET visit_authorized = false, active = false,
              ended_reason = 'Visitante fictício da conferência da fase 160.'
        WHERE id = ANY($1::uuid[])`, [criados]);
    await app.close(); await admin.end();
  });

  // ============ 1. A portaria vê o portão, e só ele ============

  it('a portaria vê a lista do portão da própria casa, com o documento mascarado', async () => {
    const r = await request(http).get(`/api/v1/people/portaria/hoje?houseId=${ids.AI3}`)
      .set(auth(tokens.portaria));
    expect(r.status).toBe(200);
    expect(r.body.podeAbrirExcecao).toBe(false);
    const tia = r.body.visitantes.find((v: any) => v.contatoId === ids.tia);
    expect(tia).toBeTruthy();
    expect(tia.nomeSocial).toBe('Tia Bia');
    expect(tia.acolhido).toBeTruthy();
    expect(tia.foraDoCombinado).toBeNull();
    /* O CPF é de terceiro: no portão, só o que basta para conferir. */
    expect(tia.cpf).not.toBe('52998224725');
    expect(tia.rg).toBe('•••••••890');
  });

  it('a portaria entra sabendo em que casa está — e só nela', async () => {
    const me = await request(http).get('/api/v1/users/me').set(auth(tokens.portaria));
    expect(me.body.role).toBe('portaria');
    expect(me.body.assignments.map((a: any) => a.code)).toEqual(['AI3']);
    const casas = await request(http).get('/api/v1/houses').set(auth(tokens.portaria));
    expect(casas.body.map((h: any) => h.code)).toEqual(['AI3']);
  });

  it('a portaria NÃO abre o perfil, a saúde, a ATA, a lista de acolhidos, nem outra casa', async () => {
    const perfil = await request(http).get(`/api/v1/people/${ids.crianca}`).set(auth(tokens.portaria));
    expect([403, 404]).toContain(perfil.status);
    const visitas = await request(http).get(`/api/v1/people/${ids.crianca}/visitas`).set(auth(tokens.portaria));
    expect([403, 404]).toContain(visitas.status);
    const lista = await request(http).get(`/api/v1/people?houseId=${ids.AI3}`).set(auth(tokens.portaria));
    expect(lista.status === 200 ? (lista.body.items ?? lista.body).length : 0).toBe(0);
    const outra = await request(http).get(`/api/v1/people/portaria/hoje?houseId=${ids.AI4}`)
      .set(auth(tokens.portaria));
    expect(outra.status).toBe(404);

    /* E pelo banco, com a identidade dela: nenhuma linha de nada. */
    let n: any;
    await admin.query('BEGIN');
    try {
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [ids.portariaId]);
      ({ rows: [n] } = await admin.query(
        `SELECT app_house_in_scope($1) AS dentro,
                (SELECT count(*)::int FROM app_casas_no_alcance()) AS casas`, [ids.AI3]));
    } finally { await admin.query('ROLLBACK'); }
    expect(n.dentro).toBe(false);
    expect(n.casas).toBe(0);
  });

  it('a coordenação de outra casa não vê o portão desta', async () => {
    const r = await request(http).get(`/api/v1/people/portaria/hoje?houseId=${ids.AI3}`)
      .set(auth(tokens.coord4));
    expect(r.status).toBe(404);
  });

  // ============ 2. Entrada e saída ============

  it('a portaria registra a entrada com o documento; sem documento, recusa; duas vezes, recusa', async () => {
    const sem = await request(http).post('/api/v1/people/portaria/visitas').set(auth(tokens.portaria))
      .send({ contatoId: ids.tia, documento: '' });
    expect(sem.status).toBe(400);
    expect(sem.body.message).toMatch(/documento/);

    const r = await request(http).post('/api/v1/people/portaria/visitas').set(auth(tokens.portaria))
      .send({ contatoId: ids.tia, documento: 'RG', nota: 'Trouxe um livro.' });
    expect(r.status).toBe(201);
    expect(r.body.excecao).toBe(false);
    ids.visitaTia = r.body.id;

    /* O toque duplo no portão. */
    const dup = await request(http).post('/api/v1/people/portaria/visitas').set(auth(tokens.portaria))
      .send({ contatoId: ids.tia, documento: 'RG' });
    expect(dup.status).toBe(409);

    const g = await request(http).get(`/api/v1/people/portaria/hoje?houseId=${ids.AI3}`)
      .set(auth(tokens.portaria));
    expect(g.body.visitantes.find((v: any) => v.contatoId === ids.tia).visitaAberta.id).toBe(ids.visitaTia);
  });

  it('a coordenação de outra casa não registra entrada no portão desta', async () => {
    const r = await request(http).post('/api/v1/people/portaria/visitas').set(auth(tokens.coord4))
      .send({ contatoId: ids.avo, documento: 'RG' });
    expect(r.status).toBe(404);
  });

  it('a saída encerra, diz a duração, e não encerra duas vezes', async () => {
    const r = await request(http).post(`/api/v1/people/portaria/visitas/${ids.visitaTia}/saida`)
      .set(auth(tokens.portaria)).send({});
    expect(r.status).toBe(201);
    expect(typeof r.body.minutos).toBe('number');
    expect(r.body.aviso).toMatch(/durou/);
    const de2 = await request(http).post(`/api/v1/people/portaria/visitas/${ids.visitaTia}/saida`)
      .set(auth(tokens.portaria)).send({});
    expect(de2.status).toBe(409);
  });

  // ============ 3. Fora do combinado ============

  it('autorização vencida: a portaria é recusada, com a frase que diz por quê', async () => {
    ids.vencida = await visitante('Padrinho Vencido Fictício', {
      visit_valid_from: '2025-01-01', visit_valid_to: '2025-12-31' });
    const r = await request(http).post('/api/v1/people/portaria/visitas').set(auth(tokens.portaria))
      .send({ contatoId: ids.vencida, documento: 'RG', excecao: 'A portaria tentando abrir exceção.' });
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/terminou em 31\/12\/2025/);
  });

  it('a coordenação abre a exceção só com motivo — e a visita guarda o motivo', async () => {
    const curto = await request(http).post('/api/v1/people/portaria/visitas').set(auth(tokens.coord))
      .send({ contatoId: ids.vencida, documento: 'RG', excecao: 'ok' });
    expect(curto.status).toBe(400);
    expect(curto.body.message).toMatch(/motivo/);

    const r = await request(http).post('/api/v1/people/portaria/visitas').set(auth(tokens.coord))
      .send({ contatoId: ids.vencida, documento: 'RG',
              excecao: 'Renovação da autorização em andamento com a equipe técnica.' });
    expect(r.status).toBe(201);
    expect(r.body.excecao).toBe(true);
    const { rows: [v] } = await admin.query(`SELECT exception_reason FROM visit WHERE id = $1`, [r.body.id]);
    expect(v.exception_reason).toMatch(/Renovação/);
    await request(http).post(`/api/v1/people/portaria/visitas/${r.body.id}/saida`)
      .set(auth(tokens.coord)).send({});
  });

  it('o educador também registra, mas não abre exceção', async () => {
    const r = await request(http).post('/api/v1/people/portaria/visitas').set(auth(tokens.educador))
      .send({ contatoId: ids.vencida, documento: 'RG', excecao: 'Educador tentando abrir exceção.' });
    expect(r.status).toBe(403);
  });

  it('visitante de dia combinado que não é hoje: recusa', async () => {
    const { rows: [{ dow }] } = await admin.query(
      `SELECT extract(dow FROM now() AT TIME ZONE app_fuso())::int AS dow`);
    const outroDia = await visitante('Irmão de Outro Dia Fictício', {
      visit_weekdays: `{${(dow + 3) % 7}}` });
    const r = await request(http).post('/api/v1/people/portaria/visitas').set(auth(tokens.portaria))
      .send({ contatoId: outroDia, documento: 'RG' });
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/não é dia de visita/);
  });

  // ============ 4. Correção ============

  it('a portaria não corrige; a técnica corrige com motivo, e o antes fica guardado', async () => {
    const e = await request(http).post('/api/v1/people/portaria/visitas').set(auth(tokens.portaria))
      .send({ contatoId: ids.avo, documento: 'CPF' });
    expect(e.status).toBe(201);
    const id = e.body.id;
    const entrada = new Date(Date.now() - 90 * 60000).toISOString();
    const saida = new Date(Date.now() - 30 * 60000).toISOString();

    const p = await request(http).post(`/api/v1/people/portaria/visitas/${id}/correcao`)
      .set(auth(tokens.portaria)).send({ entrada, saida, motivo: 'Esqueci de registrar a saída.' });
    expect(p.status).toBe(403);
    const curto = await request(http).post(`/api/v1/people/portaria/visitas/${id}/correcao`)
      .set(auth(tokens.tecnica)).send({ entrada, saida, motivo: 'erro' });
    expect(curto.status).toBe(400);
    const invertido = await request(http).post(`/api/v1/people/portaria/visitas/${id}/correcao`)
      .set(auth(tokens.tecnica)).send({ entrada: saida, saida: entrada, motivo: 'Horários trocados na folha.' });
    expect(invertido.status).toBe(400);

    const r = await request(http).post(`/api/v1/people/portaria/visitas/${id}/correcao`)
      .set(auth(tokens.tecnica)).send({ entrada, saida, motivo: 'A saída ficou sem registro no portão.' });
    expect(r.status).toBe(201);
    const { rows: [k] } = await admin.query(
      `SELECT before_end, after_end, reason FROM visit_correction WHERE visit_id = $1`, [id]);
    expect(k.before_end).toBeNull();
    expect(new Date(k.after_end).toISOString()).toBe(saida);
    const { rows: [v] } = await admin.query(`SELECT ended_at, ended_by FROM visit WHERE id = $1`, [id]);
    expect(v.ended_by).toBeTruthy();
  });

  // ============ 5. No perfil, e só nele ============

  it('o perfil da criança conta as visitas e lista os visitantes por NOME', async () => {
    const r = await request(http).get(`/api/v1/people/${ids.crianca}/visitas`).set(auth(tokens.tecnica));
    expect(r.status).toBe(200);
    expect(r.body.contagem.noPeriodo).toBeGreaterThanOrEqual(3);
    expect(r.body.contagem.total).toBeGreaterThanOrEqual(r.body.contagem.noAno);
    /* Sem período, desde o acolhimento, e não desde 1º de janeiro (28/09). */
    const { rows: [chegou] } = await admin.query(
      `SELECT min((started_at AT TIME ZONE 'America/Sao_Paulo')::date)::text AS d
         FROM house_stay WHERE person_id = $1`, [ids.crianca]);
    expect(r.body.periodo.de).toBe(chegou.d);
    const nomes = r.body.visitantes.map((v: any) => v.nome);
    expect([...nomes].sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'))).toEqual(nomes);
    /* O nome social é o nome com que a pessoa é chamada. */
    expect(nomes).toContain('Tia Bia');
    expect(r.body.aviso).toMatch(/não é avaliação da família/);
    const exc = r.body.visitas.find((v: any) => v.excecao);
    expect(exc).toBeTruthy();
    expect(r.body.visitas.some((v: any) => v.corrigida)).toBe(true);
    /* Quem registrou aparece por nome — lido como OUTRO cargo (lição da 152). */
    expect(r.body.visitas.find((v: any) => v.visitante === 'Tia Bia').entradaPor).toMatch(/Porteiro/);
  });

  it('a coordenação de outra casa não lê as visitas desta criança', async () => {
    const r = await request(http).get(`/api/v1/people/${ids.crianca}/visitas`).set(auth(tokens.coord4));
    expect(r.status).toBe(404);
  });

  it('o relatório sai em Word, com finalidade, e a auditoria diz a casa', async () => {
    const r = await request(http).post(`/api/v1/people/${ids.crianca}/visitas/export`)
      .set(auth(tokens.tecnica)).send({ finalidade: 'Relatório para a audiência concentrada.' });
    expect(r.status).toBe(201);
    const { rows } = await admin.query(
      `SELECT house_id, action FROM audit_event
        WHERE entity_id = $1 AND entity = 'visit_report' ORDER BY at DESC LIMIT 1`, [ids.crianca]);
    expect(rows[0]?.house_id).toBe(ids.AI3);
    const lixo = await request(http).post(`/api/v1/people/${ids.crianca}/visitas/export`)
      .set(auth(tokens.tecnica)).send('lixo');
    expect(lixo.status).toBe(400);
  });

  it('cada entrada, saída e correção foi à auditoria DA CASA', async () => {
    const { rows } = await admin.query(
      `SELECT action, count(*)::int AS n, bool_and(house_id = $2) AS da_casa FROM audit_event
        WHERE entity = 'visit' AND entity_id IN (SELECT id FROM visit WHERE contact_id = ANY($1::uuid[]))
        GROUP BY action`, [criados, ids.AI3]);
    const por = Object.fromEntries(rows.map((r: any) => [r.action, r]));
    expect(por['visita.entrada'].n).toBeGreaterThanOrEqual(3);
    expect(por['visita.saida'].n).toBeGreaterThanOrEqual(2);
    expect(por['visita.correcao'].n).toBe(1);
    expect(rows.every((r: any) => r.da_casa)).toBe(true);
  });

  it('a outra casa continua com o portão dela', async () => {
    const r = await request(http).get(`/api/v1/people/portaria/hoje?houseId=${ids.AI4}`)
      .set(auth(tokens.coord4));
    expect(r.status).toBe(200);
    expect(r.body.visitantes.some((v: any) => criados.includes(v.contatoId))).toBe(false);
    void ids.crianca4;
  });
});
