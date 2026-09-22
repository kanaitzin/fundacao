/**
 * O EDUCADOR FOLHEIA OS DIAS ANTERIORES (migração 1510).
 *
 * A Fundação disse em 22/09, e deu a razão junto: *"as atas de dias passados
 * podem ser vistas por todos, menos os registros e situações marcadas como
 * confidencial; cada educador pode ver uma ata unificada da passagem dos dias
 * anteriores para poder controlar e ajustar se necessário o comportamento ou a
 * dinâmica da casa, assim como acompanhar a alimentação e o comportamental do
 * todo dos atendidos."*
 *
 * O QUE ESTAVA MEDIDO, e é menos do que parece: o DADO já era dele —
 * `ata_select` é `app_house_in_scope`, e `note_select` já excluía a linha
 * restrita de quem não a alcança, para TODO cargo. A confidencialidade que ela
 * descreveu mora no banco desde sempre. O que o barrava era uma lista de cargos
 * na porta do arquivo: `app_consulta_arquivo_ata()` não tinha `educador`, e ele
 * lia a ATA do turno ANTERIOR e mais nada.
 *
 * E POR QUE A JANELA DE VÁRIOS DIAS É OUTRA COISA: o turno anterior responde "o
 * que houve ontem à noite". A pergunta dela é *"esta criança está comendo mal
 * desde quando?"* — e essa não se responde com uma ATA.
 *
 * A SUÍTE COBRA AS DUAS METADES, e a segunda é a que eu podia ter errado: a ATA
 * GERAL NOTURNA continua FORA para o educador. A função é `SECURITY DEFINER`, o
 * RLS não vale lá dentro, e devolver a Geral de carona responderia à **§10.2** —
 * *"quem lê a ATA Geral de dia"* —, que é pergunta ABERTA e é da Fundação.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O educador folheia os dias anteriores', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const arquivo = (token: string, escala = 'semana') =>
    request(http).get(`/api/v1/shifts/ata-archive?houseId=${ids.AI3}&escala=${escala}`)
      .set(auth(token));

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
      coord: 'coord.ai3@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) tokens[k] = await login(email).catch(() => '');

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('o educador abre a janela de vários dias — era só isso que o barrava', async () => {
    const r = await arquivo(tokens.educador);
    expect(r.status).toBe(200);
    expect(r.body.escala).toBe('semana');
    expect(Array.isArray(r.body.dias)).toBe(true);
    expect(r.body.de).toBeTruthy();
    expect(r.body.ate).toBeTruthy();
  });

  it('e o mês também — é a janela que responde "desde quando?"', async () => {
    const r = await arquivo(tokens.educador, 'mes');
    expect(r.status).toBe(200);
    expect(r.body.escala).toBe('mes');
  });

  it('a ATA GERAL NOTURNA continua fora para ele — a §10.2 é da Fundação', async () => {
    const dele = await arquivo(tokens.educador);
    expect(dele.status).toBe(200);
    for (const d of dele.body.dias as any[]) {
      expect(d.geral).toBeNull();
    }
    /* E a frase DIZ isso, em vez de o campo simplesmente faltar: quem abre a
       tela e não encontra a Geral tem de saber que ela existe e é de outro
       cargo — senão conclui que o sistema não a tem. */
    expect(dele.body.notaAtaGeral).toMatch(/não\s+aparece aqui/i);
  });

  it('para a coordenação a linha da casa na Geral continua aparecendo', async () => {
    if (!tokens.coord) return;
    const dela = await arquivo(tokens.coord);
    expect(dela.status).toBe(200);
    /* Não se cobra que HAJA linha — isso depende do dia; cobra-se que a Geral não
       tenha sido zerada para quem a lê, que é o defeito que a 1510 poderia
       introduzir. */
    expect(dela.body.notaAtaGeral).not.toMatch(/não\s+aparece aqui/i);
  });

  it('a Enfermagem, que não trabalha na casa, continua fora', async () => {
    if (!tokens.enfermagem) return;
    const r = await arquivo(tokens.enfermagem);
    expect([403, 404]).toContain(r.status);
  });

  it('a lista de quem folheia e a de quem lê a Geral são DUAS, e o banco sabe', async () => {
    /* O teste olha o catálogo, e não o texto da migração: `CREATE OR REPLACE`
       espalha a verdade por vários arquivos e a única cópia que vale é a que o
       banco executa (a lição da fase 131). */
    const { rows: [f] } = await admin.query(
      `SELECT pg_get_functiondef(oid) AS d FROM pg_proc WHERE proname='app_consulta_arquivo_ata'`);
    expect(f.d).toContain('educador');

    const { rows: [g] } = await admin.query(
      `SELECT pg_get_functiondef(oid) AS d FROM pg_proc WHERE proname='app_le_ata_geral'`);
    expect(g.d).not.toMatch(/'educador'/);

    /* E a função do arquivo pergunta a ela — senão a separação existe e ninguém
       a usa, que é o jeito silencioso de este defeito voltar. */
    const { rows: [a] } = await admin.query(
      `SELECT pg_get_functiondef(oid) AS d FROM pg_proc WHERE proname='app_arquivo_atas'`);
    expect(a.d).toContain('app_le_ata_geral()');
  });

  it('a linha RESTRITA da ATA nunca sai para quem não a alcança — e quem garante é o banco', async () => {
    /* A confidencialidade que a Fundação descreveu não depende da lista de
       cargos do arquivo: é a política `note_select`. O teste pergunta à
       política, porque é ela que vale mesmo que uma consulta nova esqueça. */
    const { rows: [p] } = await admin.query(
      `SELECT qual FROM pg_policies WHERE tablename='ata_note' AND policyname='note_select'`);
    expect(p.qual).toMatch(/restricted/);
  });
});
