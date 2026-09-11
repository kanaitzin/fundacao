/**
 * O QUE A COORDENAÇÃO LIGA E DESLIGA PARA O EDUCADOR (fase 93, migração 1130).
 *
 * Pedido do Marcelo em 09/09. O que esta suíte garante:
 *
 *  - a lista é FECHADA e igual nos dois lados (TypeScript e CHECK do banco) —
 *    é ela que impede a coordenação de alcançar os cinco campos que não são
 *    negociáveis, e uma lista que diverge do banco é uma promessa;
 *  - o padrão é LIGADO: nada mudou de comportamento quando a migração rodou;
 *  - desligar vale só para o EDUCADOR e só na CASA que decidiu — a coordenação
 *    de uma casa não mexe no que a outra enxerga (o isolamento entre as oito
 *    casas foi a razão de recusar a tela de alcance de cargo, em 27/08);
 *  - campo desligado não some calado: o perfil diz que existe, quem desligou e
 *    por quê. Sem isso o educador lê a ausência como "não há telefone da
 *    escola" e liga para ninguém;
 *  - desligar pede motivo; religar, não.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { CAMPOS_DO_PERFIL, CODIGOS_DE_CAMPO } from '../src/modules/people/campos-do-perfil';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const MOTIVO = 'A lista de contatos passou a ser tratada só pela técnica nesta casa (teste).';

describe('O que a coordenação liga e desliga para o educador', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3 = '', AI4 = '', crianca = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const quadro = (token: string, casa: string) =>
    request(http).get(`/api/v1/people/profile-fields?houseId=${casa}`).set(auth(token));
  const definir = (token: string, corpo: Record<string, unknown>) =>
    request(http).post('/api/v1/people/profile-fields').set(auth(token)).send(corpo);
  const perfil = (token: string) =>
    request(http).get(`/api/v1/people/${crianca}`).set(auth(token));

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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
      educador4: 'educador.ai4@paodospobres.dev',
    })) {
      tokens[k] = (await request(http).post('/api/v1/auth/login')
        .send({ email, password: SENHA })).body.token;
    }
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));

    const novo = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Criança dos Campos (fictícia)', socialName: 'CamposTeste',
              birthDate: '2013-07-21', provisionalReason: 'Ingresso de teste automatizado' });
    expect(novo.status).toBe(201);
    crianca = novo.body.personId;
    const desc = await request(http).patch(`/api/v1/people/${crianca}`).set(auth(tokens.tecnica))
      .send({ escolaNome: 'EMEF Sentinela', escolaSerie: '5º ano', escolaTurno: 'manhã',
              escolaEndereco: 'Rua de Teste, 100',
              equipeReferencia: 'CRAS Sentinela', cuidadosEssenciais: 'Cuidado de teste.' });
    expect(desc.status).toBe(200);
    await request(http).post(`/api/v1/people/${crianca}/contacts`).set(auth(tokens.tecnica))
      .send({ nome: 'Madrinha dos Campos (fictícia)', vinculo: 'madrinha', telefone: '(51) 99999-7777' });
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM house_field_permission WHERE house_id = $1`, [AI3]);
    await request(http).post(`/api/v1/people/${crianca}/discharge`)
      .set(auth(tokens.tecnica)).send({ motivo: 'Encerramento de fixture de teste' });
    await app.close(); await admin.end();
  });

  it('a lista do código é a mesma lista fechada do banco', () => {
    const sql = readFileSync(join(__dirname, '..', 'src', 'modules', 'people', 'migrations',
      '1130_o_que_a_coordenacao_liga.sql'), 'utf8');
    const trecho = sql.slice(sql.indexOf('campo_da_lista_fechada'));
    const noBanco = [...trecho.slice(0, trecho.indexOf('))')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(noBanco.length).toBeGreaterThan(0);
    expect([...noBanco].sort()).toEqual([...CODIGOS_DE_CAMPO].sort());
  });

  it('o padrão é ligado: o educador vê tudo antes de alguém decidir', async () => {
    const q = await quadro(tokens.coord, AI3);
    expect(q.status).toBe(200);
    expect(q.body.campos).toHaveLength(CAMPOS_DO_PERFIL.length);
    expect(q.body.campos.every((c: any) => c.visivel)).toBe(true);
    expect(q.body.foraDoAlcance).toEqual(expect.arrayContaining(['Cofre de acessos']));

    const p = await perfil(tokens.educador);
    expect(p.body.escola.nome).toBe('EMEF Sentinela');
    expect(p.body.contatos).toHaveLength(1);
    expect(p.body.camposDesligados).toEqual([]);
  });

  it('desligar pede motivo, e o campo sai da vista do plantão dizendo por quê', async () => {
    const semMotivo = await definir(tokens.coord, { houseId: AI3, campo: 'escola', visivel: false });
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.message).toMatch(/por que este campo sai/);

    const r = await definir(tokens.coord, {
      houseId: AI3, campo: 'escola', visivel: false,
      motivo: 'A escola pediu que o contato passe só pela equipe técnica (teste).' });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/não some sem explicação/);

    const p = await perfil(tokens.educador);
    expect(p.body.escola).toBeNull();
    expect(p.body.camposDesligados).toHaveLength(1);
    expect(p.body.camposDesligados[0].rotulo).toBe('Escola');
    expect(p.body.camposDesligados[0].motivo).toMatch(/equipe técnica/);
    expect(p.body.camposDesligados[0].por).toBeTruthy();

    /* A técnica e a coordenação continuam vendo: o botão é sobre o plantão. */
    for (const t of ['tecnica', 'coord']) {
      const outro = await perfil(tokens[t]);
      expect(outro.body.escola.nome).toBe('EMEF Sentinela');
      expect(outro.body.camposDesligados).toEqual([]);
    }
  });

  it('religar não pede motivo, e o campo volta', async () => {
    expect((await definir(tokens.coord, { houseId: AI3, campo: 'escola', visivel: true })).status).toBe(201);
    const p = await perfil(tokens.educador);
    expect(p.body.escola.nome).toBe('EMEF Sentinela');
    expect(p.body.camposDesligados).toEqual([]);
  });

  it('desligar os contatos esvazia a lista do plantão, e diz que existe', async () => {
    expect((await definir(tokens.coord, {
      houseId: AI3, campo: 'contatos', visivel: false, motivo: MOTIVO })).status).toBe(201);
    const p = await perfil(tokens.educador);
    expect(p.body.contatos).toEqual([]);
    expect(p.body.camposDesligados.map((c: any) => c.code)).toEqual(['contatos']);
    /* E a lista de contatos, que é outra rota, continua sendo da técnica. */
    expect((await perfil(tokens.tecnica)).body.contatos).toHaveLength(1);
    await definir(tokens.coord, { houseId: AI3, campo: 'contatos', visivel: true });
  });

  it('a decisão é da casa: a coordenação da 04 não mexe na 03, nem alcança o perfil de lá', async () => {
    const deFora = await definir(tokens.coord4, {
      houseId: AI3, campo: 'escola', visivel: false, motivo: MOTIVO });
    expect(deFora.status).toBe(404);
    expect((await quadro(tokens.coord4, AI3)).status).toBe(404);

    /* E desligar na 04 não muda a 03 — nem para o educador da 03. */
    expect((await definir(tokens.coord4, {
      houseId: AI4, campo: 'escola', visivel: false, motivo: MOTIVO })).status).toBe(201);
    const p = await perfil(tokens.educador);
    expect(p.body.escola.nome).toBe('EMEF Sentinela');
    expect(p.body.camposDesligados).toEqual([]);
    await admin.query(`DELETE FROM house_field_permission WHERE house_id = $1`, [AI4]);
  });

  it('o educador lê o quadro mas não decide; e campo fora da lista é recusado', async () => {
    const q = await quadro(tokens.educador, AI3);
    expect(q.status).toBe(200);
    expect(q.body.podeDecidir).toBe(false);

    const tenta = await definir(tokens.educador, { houseId: AI3, campo: 'escola', visivel: false, motivo: MOTIVO });
    expect(tenta.status).toBe(403);

    /* Os cinco que não são negociáveis não estão na lista — e a lista é fechada. */
    for (const proibido of ['motivo_judicial', 'cofre', 'beneficios', 'ocorrencia_restrita']) {
      const r = await definir(tokens.coord, { houseId: AI3, campo: proibido, visivel: false, motivo: MOTIVO });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/lista é fechada/);
    }
    await expect(admin.query(
      `INSERT INTO house_field_permission (house_id, field_code, visible) VALUES ($1,'cofre',false)`,
      [AI3])).rejects.toThrow(/campo_da_lista_fechada/);
  });
});
