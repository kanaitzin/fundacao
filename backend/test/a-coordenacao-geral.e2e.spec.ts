/**
 * A COORDENAÇÃO GERAL (fase 176, decisão de 28/09).
 *
 * O cargo novo do Marcelo: a coordenação das oito casas. A Fundação decidiu que
 * ela faz tudo o que a coordenação de uma casa faz, nas oito, e que o Gestor
 * Geral continua olhando. No banco é o cargo coordenador com a marca
 * todas_as_casas (1634), e quem responde de quais casas a pessoa é continua
 * sendo uma função só, app_user_house_ids.
 *
 * O que se cobra aqui: só o gestor põe ou tira a marca; só coordenador a
 * recebe; quem é marcado alcança as oito, e age em mais de uma (cadastra
 * educador na Casa 03 e na Casa 04, lê as crianças de cada uma); o vínculo
 * antigo fecha com data; desmarcada, a pessoa não alcança casa nenhuma; e ela
 * não entra no escalonamento de casa nenhuma, porque não é da equipe de uma.
 *
 * As contas são criadas pela suíte e desativadas no fim: a Casa 03 é contada
 * por outras suítes, e a equipe dela não pode mudar de tamanho.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A Coordenação Geral', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const criados: string[] = [];
  const rodada = Date.now().toString(36);

  const login = async (email: string, senha = SENHA) => {
    const r = await request(http).post('/api/v1/auth/login').send({ email, password: senha });
    if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
    return r.body.token as string;
  };
  const auth = (tk: string) => ({ Authorization: `Bearer ${tk}` });
  const post = (tk: string, rota: string, corpo: any = {}) =>
    request(http).post(`/api/v1${rota}`).set(auth(tk)).send(corpo);
  const get = (tk: string, rota: string) => request(http).get(`/api/v1${rota}`).set(auth(tk));
  const casasDe = async (tk: string) =>
    ((await get(tk, '/houses')).body as any[]).map((h) => h.code ?? h.codigo).sort();

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    t.gestor = await login('gestor@paodospobres.dev');
    t.coord3 = await login('coord.ai3@paodospobres.dev');
    const { rows } = await admin.query(`SELECT code, id FROM house`);
    for (const r of rows) ids[r.code] = r.id;
  });

  afterAll(async () => {
    if (ids.internacao) {
      await post(t.tecnica2, `/nursing/hospitalizations/${ids.internacao}/close`,
        { desfecho: 'alta', observacao: 'Alta fictícia, encerramento da suíte da Coordenação Geral.' });
    }
    if (ids.crianca) {
      await post(t.tecnica2, `/people/${ids.crianca}/discharge`,
        { motivo: 'Encerramento da suíte da Coordenação Geral (dados fictícios).' });
    }
    if (ids.ataGeral) {
      await admin.query(`DELETE FROM general_night_house_entry WHERE general_ata_id = $1`, [ids.ataGeral]);
      await admin.query(`DELETE FROM general_night_ata WHERE id = $1`, [ids.ataGeral]);
    }
    for (const id of criados) {
      await post(t.gestor, `/staff/${id}/deactivate`, { motivo: 'Conta fictícia da suíte da Coordenação Geral.' });
    }
    await app.close(); await admin.end();
  });

  it('o gestor cadastra a Coordenação Geral sem casa, e ela alcança as oito', async () => {
    const email = `coordenacao.geral.${rodada}@paodospobres.dev`;
    const r = await post(t.gestor, '/staff', { nome: 'Coordenação Geral da Suíte (fictício)',
      email, cargo: 'coordenador', todasAsCasas: true, senhaInicial: 'senha-geral-1' });
    expect(r.status).toBe(201);
    ids.geral = r.body.id;
    criados.push(ids.geral);
    t.geral = await login(email, 'senha-geral-1');

    const eu = await get(t.geral, '/users/me');
    expect(eu.body.todasAsCasas).toBe(true);
    expect(await casasDe(t.geral)).toHaveLength(8);

    /* Nenhum vínculo inventado: ela nunca foi da equipe de casa nenhuma. */
    const { rows } = await admin.query(
      `SELECT count(*)::int n FROM user_house_assignment WHERE user_id = $1`, [ids.geral]);
    expect(rows[0].n).toBe(0);

    /* A lista da equipe, lida pelo gestor, diz as oito casas. */
    const equipe = (await get(t.gestor, '/staff')).body as any[];
    expect(equipe.find((p) => p.id === ids.geral)?.todasAsCasas).toBe(true);

    const { rows: [linha] } = await admin.query(
      `SELECT house_id FROM audit_event WHERE action = 'staff.coordenacao_geral' AND entity_id = $1`, [ids.geral]);
    expect(linha).toBeDefined();
  });

  it('age como a coordenação de cada casa, em mais de uma', async () => {
    for (const casa of ['AI3', 'AI4', 'ARM3']) {
      const lista = await get(t.geral, `/people?houseId=${ids[casa]}`);
      expect(lista.status).toBe(200);
      const turnos = await get(t.geral, `/houses/${ids[casa]}/turnos`);
      expect(turnos.status).toBe(200);
    }
    /* Cadastra educador na Casa 03 e na Casa 04: é ato da coordenação da casa. */
    for (const casa of ['AI3', 'AI4']) {
      const r = await post(t.geral, '/staff', { nome: `Educador da ${casa} pela Geral (fictício)`,
        email: `educador.${casa.toLowerCase()}.geral.${rodada}@paodospobres.dev`, cargo: 'educador',
        casaId: ids[casa], senhaInicial: 'senha-educ-1' });
      expect(r.status).toBe(201);
      criados.push(r.body.id);
    }
    const equipe = (await get(t.geral, '/staff')).body as any[];
    const casas = new Set(equipe.map((p) => p.casa).filter(Boolean));
    expect(casas.size).toBeGreaterThanOrEqual(2);
  });

  it('só o gestor põe a marca, e só em quem é da coordenação', async () => {
    /* A coordenação de uma casa não cria nem marca a Coordenação Geral: seria
       uma conta nova enxergando as oito. */
    const criar = await post(t.coord3, '/staff', { nome: 'Tentativa (fictício)',
      email: `tentativa.${rodada}@paodospobres.dev`, cargo: 'coordenador', todasAsCasas: true });
    expect(criar.status).toBe(403);
    const marcarPelaCasa = await post(t.coord3, `/staff/${ids.geral}/coordenacao-geral`, { todas: false });
    expect(marcarPelaCasa.status).toBe(403);
    const marcarPelaGeral = await post(t.geral, `/staff/${ids.geral}/coordenacao-geral`, { todas: false });
    expect(marcarPelaGeral.status).toBe(403);

    /* Educador não recebe a marca. */
    const { rows: [educ] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'educador.ai3@paodospobres.dev'`);
    const educador = await post(t.gestor, `/staff/${educ.id}/coordenacao-geral`, { todas: true });
    expect(educador.status).toBe(400);
    expect(educador.body.message).toMatch(/cargo Coordenação/);
    /* E o banco recusa por conta própria, mesmo sem o servidor. */
    await expect(admin.query(`UPDATE app_user SET todas_as_casas = true WHERE id = $1`, [educ.id]))
      .rejects.toThrow(/todas_as_casas_so_coordenador/);

    /* O cadastro com casa e marca ao mesmo tempo é recusado em português. */
    const comCasa = await post(t.gestor, '/staff', { nome: 'Com casa (fictício)',
      email: `comcasa.${rodada}@paodospobres.dev`, cargo: 'coordenador', casaId: ids.AI3, todasAsCasas: true });
    expect(comCasa.status).toBe(400);
  });

  it('a coordenação de uma casa promovida deixa a equipe dela, com data, e desmarcada não alcança nada', async () => {
    const email = `coord.arm2.${rodada}@paodospobres.dev`;
    const r = await post(t.gestor, '/staff', { nome: 'Coordenação da ARM2 da Suíte (fictício)',
      email, cargo: 'coordenador', casaId: ids.ARM2, senhaInicial: 'senha-coord-1' });
    expect(r.status).toBe(201);
    ids.promovida = r.body.id;
    criados.push(ids.promovida);
    let tk = await login(email, 'senha-coord-1');
    expect(await casasDe(tk)).toEqual(['ARM2']);

    const marcar = await post(t.gestor, `/staff/${ids.promovida}/coordenacao-geral`, { todas: true });
    expect(marcar.status).toBe(201);
    expect(marcar.body.aviso).toMatch(/oito casas/);
    tk = await login(email, 'senha-coord-1');
    expect(await casasDe(tk)).toHaveLength(8);
    const { rows: vinculos } = await admin.query(
      `SELECT valid_to FROM user_house_assignment WHERE user_id = $1`, [ids.promovida]);
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0].valid_to).not.toBeNull();

    const tirar = await post(t.gestor, `/staff/${ids.promovida}/coordenacao-geral`, { todas: false });
    expect(tirar.status).toBe(201);
    tk = await login(email, 'senha-coord-1');
    expect(await casasDe(tk)).toEqual([]);
  });

  it('não entra no escalonamento de casa nenhuma: não é da equipe de uma, e nas oito seria uma enxurrada', async () => {
    for (const casa of ['AI3', 'AI4']) {
      const { rows: coord } = await admin.query(
        `SELECT user_id FROM app_escalation_targets($1, 'tecnica_coordenacao')`, [ids[casa]]);
      /* O nível existe e tem gente (a coordenação da casa), e ela não está nele. */
      expect(coord.length).toBeGreaterThan(0);
      expect(coord.map((x) => x.user_id)).not.toContain(ids.geral);
    }
  });
  /*
   * OS GRAVES CHEGAM A ELA (fase 178, decisão de 28/09). Ocorrência das
   * categorias que exigem revisão técnica, internação aberta e ATA Geral assinada
   * com pendência, de qualquer casa. O resto continua com a coordenação de cada
   * casa. A suíte usa a ARM2, vazia na semente, com contas e criança dela.
   */
  it('recebe os avisos graves das oito casas, e só os graves', async () => {
    for (const [k, cargo] of [['educador2', 'educador'], ['tecnica2', 'equipe_tecnica']]) {
      const email = `${k}.cg.${rodada}@paodospobres.dev`;
      const r = await post(t.gestor, '/staff', { nome: `${k} da ARM2 (fictício)`, email, cargo,
        casaId: ids.ARM2, senhaInicial: 'senha-arm2-1' });
      expect(r.status).toBe(201);
      criados.push(r.body.id);
      t[k] = await login(email, 'senha-arm2-1');
    }
    const chegou = await post(t.educador2, '/people/chegada', { houseId: ids.ARM2,
      nome: `Criança da Suíte ${rodada} (fictícia)`, idadeAproximada: 10,
      trazidaPor: 'Conselho Tutelar', chegada: 'Chegou à tarde, com a mochila da escola.' });
    expect(chegou.status).toBe(201);
    ids.crianca = chegou.body.personId;
    const avisos = async () => {
      const r = await get(t.geral, '/notifications');
      return (Array.isArray(r.body) ? r.body : r.body.itens) as any[];
    };
    const antes = (await avisos()).length;

    /* Conflito sem revisão técnica: não chega. */
    const comum = await post(t.tecnica2, '/incidents', { houseId: ids.ARM2, categoria: 'conflito_agressao',
      quando: new Date().toISOString(), acolhidos: [ids.crianca],
      fato: 'Discussão com um colega por causa da bola; separados na hora.',
      medidasImediatas: 'Conversa com os dois e combinado do revezamento.' });
    expect(comum.status).toBe(201);
    expect((await avisos()).length).toBe(antes);

    /* Emergência de saúde exige revisão técnica: chega. */
    const grave = await post(t.tecnica2, '/incidents', { houseId: ids.ARM2, categoria: 'emergencia_saude',
      quando: new Date().toISOString(), acolhidos: [ids.crianca], saude: true,
      fato: 'Febre alta e vômito durante a tarde; levada ao pronto atendimento.',
      medidasImediatas: 'Educadora acompanhou a criança e avisou a Enfermagem.' });
    expect(grave.status).toBe(201);
    let lista = await avisos();
    expect(lista.some((a) => a.entidade === 'incident' && a.entidadeId === grave.body.id)).toBe(true);
    /* O aviso não carrega o fato. */
    expect(JSON.stringify(lista)).not.toMatch(/Febre alta/);

    /* A internação aberta: chega. */
    const int = await post(t.tecnica2, '/nursing/hospitalizations', { personId: ids.crianca, houseId: ids.ARM2,
      hospital: 'Hospital Fictício da Suíte', motivo: 'Observação depois da febre alta da tarde.' });
    expect(int.status).toBe(201);
    ids.internacao = int.body.id;
    lista = await avisos();
    const daInternacao = lista.find((a) => a.entidade === 'hospitalization' && a.entidadeId === ids.internacao);
    expect(daInternacao?.titulo).toBe('Internação aberta');
    expect(JSON.stringify(daInternacao)).not.toMatch(/Hospital Fictício|febre/);

    /* A coordenação de UMA casa não recebe o grave de outra. */
    const { rows: [outra] } = await admin.query(
      `SELECT count(*)::int AS n FROM notification n JOIN app_user u ON u.id = n.user_id
        WHERE u.email = 'coord.ai3@paodospobres.dev' AND n.entity_id = $1`, [ids.internacao]);
    expect(outra.n).toBe(0);

    /* A ATA Geral assinada com pendência: chega UM aviso, e não um por casa. */
    const noturno = await login('lider.noturno@paodospobres.dev');
    const g = await post(noturno, '/shifts/general-ata', { data: '2024-05-11' });
    expect(g.status).toBe(201);
    ids.ataGeral = g.body.id;
    const assinada = await post(noturno, `/shifts/general-ata/${ids.ataGeral}/sign`,
      { pendencias: 'Casas sem ATA noturna fechada nesta data fictícia da suíte.' });
    expect(assinada.status).toBe(201);
    lista = await avisos();
    expect(lista.filter((a) => a.entidade === 'general_night_ata' && a.entidadeId === ids.ataGeral)).toHaveLength(1);
  });
});
