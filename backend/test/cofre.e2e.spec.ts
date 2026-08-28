/**
 * COFRE DE ACESSOS DO ACOLHIDO (§6.10).
 *
 * A Fundação decidiu guardar aqui as senhas de gov.br, INSS, CTPS e banco das
 * crianças, sob a coordenação de cada casa. A alternativa real nunca foi "não
 * existir" — era continuar numa planilha compartilhada, em texto claro, sem
 * saber quem abriu.
 *
 * Estes testes existem para que o cofre seja mesmo um cofre:
 *
 *  1. o segredo NÃO fica legível no banco — nem para quem tem o papel da
 *     aplicação e faz SELECT direto na tabela;
 *  2. só a coordenação DA CASA ATUAL abre. Educador, técnica, enfermagem e a
 *     coordenação de outra casa não abrem nem enxergam;
 *  3. abrir exige finalidade e vira registro nominal — a pergunta "quem viu a
 *     senha do fulano em março?" precisa ter resposta;
 *  4. o Gestor Geral só entra pela exceção, com motivo maior, e a exceção fica
 *     marcada como exceção;
 *  5. trocar a senha não apaga o histórico de quem já a viu.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { cifrarSegredo, decifrarSegredo, dicaDe } from '../src/kernel/common/segredo';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const appUrl = process.env.DATABASE_APP_URL ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher';

/** Senha fictícia, no formato que a planilha real usava. Nenhuma é real. */
const SENHA_FICTICIA = 'Ficticia@2013';

describe('Cofre de acessos — gov.br, INSS, CTPS e banco', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let pessoa: string, credencial: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

  /** A área bancária exige reautenticação recente. */
  const reauth = (token: string) =>
    request(http).post('/api/v1/auth/reauth').set(auth(token)).send({ password: SENHA });

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
      coord: 'coord.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    const { rows: [p] } = await admin.query(
      `SELECT s.person_id FROM house_stay s JOIN house h ON h.id = s.house_id
        WHERE h.code='AI3' AND s.status='ativa' LIMIT 1`);
    pessoa = p.person_id;
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM person_credential WHERE person_id=$1`, [pessoa]);
    await app.close(); await admin.end();
  });

  it('a cifra vai e volta, e a dica confere sem revelar', () => {
    const guardado = cifrarSegredo(SENHA_FICTICIA);
    expect(guardado).not.toContain(SENHA_FICTICIA);
    expect(guardado.startsWith('v1.')).toBe(true);
    expect(decifrarSegredo(guardado)).toBe(SENHA_FICTICIA);

    // Um byte alterado não devolve lixo silencioso: falha.
    const adulterado = guardado.slice(0, -2) + 'AA';
    expect(() => decifrarSegredo(adulterado)).toThrow();

    // A dica mostra o suficiente para conferir e nada além disso.
    const dica = dicaDe(SENHA_FICTICIA);
    expect(dica).toContain('F');
    expect(dica).not.toContain('icticia');
    expect(dica).toContain(String(SENHA_FICTICIA.length));
  });

  it('a coordenação guarda o acesso, e a lista mostra a dica em vez da senha', async () => {
    await reauth(tokens.coord);
    const res = await request(http).post(`/api/v1/people/${pessoa}/credentials`)
      .set(auth(tokens.coord)).send({
        tipo: 'gov_br', login: '000.000.000-00', senha: SENHA_FICTICIA,
        responsavel: 'Coordenação da Casa 03', observacao: 'Conta usada para benefício (fictício).',
      });
    expect(res.status).toBe(201);
    credencial = res.body.id;

    const lista = await request(http).post(`/api/v1/people/${pessoa}/credentials/view`)
      .set(auth(tokens.coord)).send({});
    expect(lista.status).toBe(201);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].tipo).toBe('gov.br');
    expect(lista.body[0].dica).toBeTruthy();
    // A senha não vem na listagem, de forma nenhuma.
    expect(JSON.stringify(lista.body)).not.toContain(SENHA_FICTICIA);
  });

  it('o segredo não é legível no banco pelo papel da aplicação', async () => {
    const { rows: [u] } = await admin.query(
      `SELECT id FROM app_user WHERE email='coord.ai3@paodospobres.dev'`);
    const c = new Client({ connectionString: appUrl });
    await c.connect();
    try {
      // Mesmo a coordenação, com a policy satisfeita, não lê a coluna cifrada:
      // privilégio por coluna. É isso que impede a senha de vazar num
      // relatório escrito com pressa. (Uma transação só para a recusa: um erro
      // de permissão aborta a transação inteira no Postgres.)
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.user_id', $1, true)`, [u.id]);
      await expect(c.query(`SELECT secret_enc FROM person_credential WHERE person_id=$1`, [pessoa]))
        .rejects.toThrow(/permission denied|permissão negada/i);
      await c.query('ROLLBACK');

      // E o que ela lê, na transação seguinte, não contém segredo nenhum.
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.user_id', $1, true)`, [u.id]);
      const { rows } = await c.query(
        `SELECT kind, login, secret_hint FROM person_credential WHERE person_id=$1`, [pessoa]);
      expect(rows[0].secret_hint).not.toContain(SENHA_FICTICIA);
      await c.query('ROLLBACK');
    } finally {
      await c.end();
    }

    // No banco, o valor guardado é cifrado — nem o administrador do banco lê a senha.
    const { rows: [linha] } = await admin.query(
      `SELECT secret_enc FROM person_credential WHERE person_id=$1`, [pessoa]);
    expect(linha.secret_enc).not.toContain(SENHA_FICTICIA);
    expect(linha.secret_enc.startsWith('v1.')).toBe(true);
  });

  it('abrir exige finalidade, devolve a senha e registra antes de devolver', async () => {
    await reauth(tokens.coord);
    const semFinalidade = await request(http)
      .post(`/api/v1/people/${pessoa}/credentials/${credencial}/reveal`)
      .set(auth(tokens.coord)).send({ finalidade: '' });
    expect(semFinalidade.status).toBe(400);

    const res = await request(http)
      .post(`/api/v1/people/${pessoa}/credentials/${credencial}/reveal`)
      .set(auth(tokens.coord)).send({ finalidade: 'Atualizar cadastro do benefício no gov.br' });
    expect(res.status).toBe(201);
    expect(res.body.senha).toBe(SENHA_FICTICIA);
    expect(res.body.excepcional).toBe(false);

    const { rows } = await admin.query(
      `SELECT action, purpose FROM audit_event
        WHERE entity='person_credential' AND entity_id=$1 AND action='credential.reveal'`, [credencial]);
    expect(rows).toHaveLength(1);
    expect(rows[0].purpose).toMatch(/benefício no gov\.br/);
    // O registro guarda a finalidade — nunca a senha (§20).
    const { rows: [tudo] } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event WHERE detail::text LIKE $1 OR purpose LIKE $1`,
      [`%${SENHA_FICTICIA}%`]);
    expect(tudo.n).toBe(0);
  });

  it('quem não é a coordenação desta casa não abre — nem sabe que existe', async () => {
    for (const papel of ['educador', 'tecnica'] as const) {
      const lista = await request(http).post(`/api/v1/people/${pessoa}/credentials/view`)
        .set(auth(tokens[papel])).send({});
      expect(lista.status).toBe(403);
    }

    // A coordenação de OUTRA casa: papel certo, criança errada.
    await reauth(tokens.coord4);
    const deOutraCasa = await request(http).post(`/api/v1/people/${pessoa}/credentials/view`)
      .set(auth(tokens.coord4)).send({});
    expect(deOutraCasa.body).toEqual([]);

    const abrirDeOutraCasa = await request(http)
      .post(`/api/v1/people/${pessoa}/credentials/${credencial}/reveal`)
      .set(auth(tokens.coord4)).send({ finalidade: 'curiosidade' });
    expect(abrirDeOutraCasa.status).toBe(403);
  });

  it('o Gestor Geral entra pela exceção, com motivo maior, e a exceção fica marcada', async () => {
    await reauth(tokens.gestor);
    const curto = await request(http)
      .post(`/api/v1/people/${pessoa}/credentials/${credencial}/reveal`)
      .set(auth(tokens.gestor)).send({ finalidade: 'preciso ver' });
    expect(curto.status).toBe(400);
    expect(curto.body.message).toMatch(/excepcional/i);

    const res = await request(http)
      .post(`/api/v1/people/${pessoa}/credentials/${credencial}/reveal`)
      .set(auth(tokens.gestor)).send({
        finalidade: 'Coordenadora afastada por licença; benefício vence esta semana (fictício).',
      });
    expect(res.status).toBe(201);
    expect(res.body.excepcional).toBe(true);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event
        WHERE action='credential.reveal_exceptional' AND entity_id=$1`, [credencial]);
    expect(rows[0].n).toBe(1);
  });

  it('trocar a senha não apaga quem já a viu', async () => {
    await reauth(tokens.coord);
    const troca = await request(http).post(`/api/v1/people/${pessoa}/credentials`)
      .set(auth(tokens.coord)).send({
        tipo: 'gov_br', login: '000.000.000-00', senha: 'NovaFicticia@2026',
        responsavel: 'Coordenação da Casa 03',
      });
    expect(troca.status).toBe(201);
    expect(troca.body.substituiu).toBe(true);

    const hist = await request(http).post(`/api/v1/people/${pessoa}/credentials/history`)
      .set(auth(tokens.coord)).send({});
    const acoes = hist.body.map((h: any) => h.acao);
    expect(acoes).toContain('troca de senha');
    expect(acoes).toContain('abertura');
    expect(acoes).toContain('abertura excepcional');

    // E a senha nova é a que abre agora.
    const abre = await request(http)
      .post(`/api/v1/people/${pessoa}/credentials/${credencial}/reveal`)
      .set(auth(tokens.coord)).send({ finalidade: 'Conferir após a troca' });
    expect(abre.body.senha).toBe('NovaFicticia@2026');
  });

  it('sem reautenticação recente o cofre não abre', async () => {
    // Uma sessão sem reauth recente: simula o aparelho esquecido aberto.
    const { body } = await login('coord.ai3@paodospobres.dev');
    const lista = await request(http).post(`/api/v1/people/${pessoa}/credentials/view`)
      .set(auth(body.token)).send({});
    expect(lista.status).toBe(403);
    expect(lista.body.message).toMatch(/confirme sua senha/i);
  });
});
