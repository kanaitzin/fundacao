/**
 * ACOLHIDO EM EXPERIÊNCIA FAMILIAR.
 *
 * Pedido do Marcelo em 09/09: a criança sai para passar dias com a família de
 * origem ou com o padrinho, e precisa sair da chamada, da grade e da rotina —
 * sem sair da casa.
 *
 * O que estes testes protegem:
 *
 *  1. **a vaga continua ocupada.** Quem está com a família NÃO sai do
 *     `house_stay`: a lista da casa continua contando ela;
 *  2. **sai da grade de medicamentos.** E por razão diferente da internação:
 *     no hospital outro profissional dá a dose; com a mãe, ninguém da casa dá;
 *  3. **contato com aproximação restrita é BARRADO** — não avisado. A casa não
 *     entrega criança a quem não pode se aproximar dela;
 *  4. **uma saída aberta por criança.** Duas ao mesmo tempo não são caso raro:
 *     são erro de digitação que ninguém vê até o retorno não fechar nada;
 *  5. **o aviso é sobre o RELÓGIO, nunca sobre a criança.** `avisar` na última
 *     hora, `atrasado` depois. Nenhum campo chama isso de evasão;
 *  6. **quem recebe registra.** O educador de plantão fecha o retorno — exigir
 *     a técnica às 18h de domingo deixaria a criança marcada como fora da casa
 *     a noite inteira;
 *  7. **volta sozinha.** Registrado o retorno, ela reaparece na grade.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const emHoras = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

describe('Acolhido em experiência familiar', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, pessoa: string, contato: string, restrito: string;
  const saidas: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

  async function sair(token: string, contactId: string, retornoEmHoras = 48) {
    const r = await request(http).post('/api/v1/people/family-stays').set(auth(token)).send({
      personId: pessoa, contatoId: contactId,
      inicio: emHoras(-1), retornoPrevisto: emHoras(retornoEmHoras),
      finalidade: 'Fim de semana em casa (fictício).',
    });
    if (r.body?.id) saidas.push(r.body.id);
    return r;
  }

  const abertas = (token: string) =>
    request(http).get(`/api/v1/people/family-stays?houseId=${AI3}`).set(auth(token));

  /** Fecha e limpa toda saída aberta desta criança, entre um teste e outro. */
  async function limpar() {
    await admin.query(`DELETE FROM family_stay WHERE person_id = $1`, [pessoa]);
  }

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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows: [p] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]);
    pessoa = p.person_id;

    const { rows: [c1] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, phone)
       VALUES ($1,'Contato Fictício da Suíte','genitora','51 90000-0000') RETURNING id`, [pessoa]);
    contato = c1.id;
    const { rows: [c2] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, restricted, restriction_note)
       VALUES ($1,'Contato Restrito da Suíte','tio',true,'Aproximação suspensa (fictício).')
       RETURNING id`, [pessoa]);
    restrito = c2.id;
  });

  afterAll(async () => {
    /* `family_stay` é estado VIVO, não registro histórico imutável: uma saída
       deixada aberta tiraria a criança da grade nas outras suítes. */
    await limpar();
    /* Contato NÃO se apaga — `contato_nao_e_apagado`. É a quarta tabela a
       cobrar a mesma regra ao escrever teste, e ela está certa: um contato
       encerrado guarda o motivo, e apagar levaria o motivo junto. Encerrar é o
       que a tela faz. */
    await admin.query(
      `UPDATE person_contact SET active = false,
              ended_reason = 'Contato fictício criado pela suíte de teste.'
        WHERE id = ANY($1::uuid[])`, [[contato, restrito]]);
    await app.close(); await admin.end();
  });

  beforeEach(limpar);

  it('a criança sai da grade de medicamentos — e a vaga continua ocupada', async () => {
    expect((await sair(tokens.tecnica, contato)).status).toBe(201);

    const { rows: [g] } = await admin.query(
      `SELECT app_em_convivencia_familiar($1) AS fora`, [pessoa]);
    expect(g.fora).toBe(true);

    // A vaga NÃO é liberada: ela continua na casa, e nos vinte.
    const { rows: [v] } = await admin.query(
      `SELECT count(*)::int AS n FROM house_stay
        WHERE person_id=$1 AND house_id=$2 AND status='ativa'`, [pessoa, AI3]);
    expect(v.n).toBe(1);
  });

  it('contato com aproximação restrita é BARRADO, não avisado', async () => {
    const r = await sair(tokens.tecnica, restrito);
    expect(r.status).toBe(403);
    // A frase diz o motivo: a pessoa vai perguntar por quê.
    expect(JSON.stringify(r.body)).toMatch(/aproximação restrita/i);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM family_stay WHERE person_id=$1`, [pessoa]);
    expect(rows[0].n).toBe(0);
  });

  it('uma saída aberta por criança', async () => {
    await sair(tokens.tecnica, contato);
    const r = await sair(tokens.coord, contato);
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('o educador não registra a saída, mas registra a chegada', async () => {
    expect((await sair(tokens.educador, contato)).status).toBe(403);

    await sair(tokens.tecnica, contato);
    const lista = await abertas(tokens.educador).expect(200);
    const f = lista.body.find((x: any) => x.personId === pessoa);
    expect(f).toBeDefined();

    // Quem recebe a criança na porta às 18h de domingo é ele.
    await request(http).post(`/api/v1/people/family-stays/${f.id}/return`)
      .set(auth(tokens.educador))
      .send({ quando: new Date().toISOString(), nota: 'Chegou no horário, trouxe uma mochila.' })
      .expect(201);
  });

  it('o aviso fala do relógio, e nunca chama isso de evasão', async () => {
    // Retorno previsto para daqui a 30 minutos: dentro da janela do lembrete.
    await request(http).post('/api/v1/people/family-stays').set(auth(tokens.tecnica)).send({
      personId: pessoa, contatoId: contato,
      inicio: emHoras(-24), retornoPrevisto: emHoras(0.5),
    }).expect(201);

    const r = await abertas(tokens.tecnica).expect(200);
    const f = r.body.find((x: any) => x.personId === pessoa);
    expect(f.avisar).toBe(true);
    expect(f.atrasado).toBe(false);
    // Nenhum campo classifica a criança.
    expect(JSON.stringify(r.body)).not.toMatch(/evas|fuga|descumpr|falta grave/i);
  });

  it('passada a hora sem chegada, o estado é "atrasado" — e o retorno devolve à grade', async () => {
    await request(http).post('/api/v1/people/family-stays').set(auth(tokens.tecnica)).send({
      personId: pessoa, contatoId: contato,
      inicio: emHoras(-48), retornoPrevisto: emHoras(-2),
    }).expect(201);

    let r = await abertas(tokens.coord).expect(200);
    let f = r.body.find((x: any) => x.personId === pessoa);
    expect(f.atrasado).toBe(true);

    await request(http).post(`/api/v1/people/family-stays/${f.id}/return`)
      .set(auth(tokens.coord)).send({ quando: new Date().toISOString() }).expect(201);

    // Volta sozinha: sai da lista de abertas e volta à grade.
    r = await abertas(tokens.coord).expect(200);
    expect(r.body.find((x: any) => x.personId === pessoa)).toBeUndefined();
    const { rows: [g] } = await admin.query(
      `SELECT app_em_convivencia_familiar($1) AS fora`, [pessoa]);
    expect(g.fora).toBe(false);
  });

  it('registrar o retorno duas vezes é recusado', async () => {
    await sair(tokens.tecnica, contato);
    const r = await abertas(tokens.tecnica).expect(200);
    const f = r.body.find((x: any) => x.personId === pessoa);

    const corpo = { quando: new Date().toISOString() };
    await request(http).post(`/api/v1/people/family-stays/${f.id}/return`)
      .set(auth(tokens.coord)).send(corpo).expect(201);
    await request(http).post(`/api/v1/people/family-stays/${f.id}/return`)
      .set(auth(tokens.coord)).send(corpo)
      .expect((x) => { expect(x.status).toBeGreaterThanOrEqual(400); });
  });
});
