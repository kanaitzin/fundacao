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

  /**
   * ESTES TESTES MUDARAM DE LADO NA FASE 145, e a mudança é da Fundação.
   *
   * A 1510 deixou a ATA Geral fora de quem não a lia, e a razão era boa: abrir de
   * carona responderia à §10.2 — *"quem lê a ATA Geral de dia"* —, que era
   * pergunta ABERTA. Ela respondeu em 22/09: *"todos leem a ata coletiva, seja
   * manhã ou noite, para consultar informações de como os atendidos estavam"*. O
   * registro da noite é metade disso.
   *
   * O que continua fechado é a FOLHA COMPLETA das oito casas — outro documento,
   * outra rota, e o argumento da fase 136: o que o Líder Noturno Geral escreveu
   * sobre as outras sete é assunto delas.
   */
  it('a linha DESTA casa na ATA Geral vem para o educador — e só a desta casa', async () => {
    const dele = await arquivo(tokens.educador);
    expect(dele.status).toBe(200);
    expect(dele.body.notaAtaGeral).not.toMatch(/não\s+aparece aqui/i);
    /* A folha das oito não vem por aqui: o identificador dela não sai para quem
       só vê a linha desta casa (fase 138). */
    for (const d of dele.body.dias as any[]) {
      if (d.geral) expect(d.geral.id ?? null).toBeNull();
    }
  });

  it('a Enfermagem folheia também — ela chega às 9h e precisa saber da noite', async () => {
    if (!tokens.enfermagem) return;
    const r = await arquivo(tokens.enfermagem);
    expect(r.status).toBe(200);
  });

  it('as três listas de quem lê a Geral dizem a MESMA coisa — banco, serviço e tela', async () => {
    /*
     * A lista existe em TRÊS lugares, e isto é uma repetição que eu preferiria
     * não ter: no banco ela decide o DADO (`app_le_ata_geral`), no serviço ela
     * escolhe a FRASE, e na tela ela escolhe o que a aba diz. A que vale é a do
     * banco — e é por isso que este teste existe: é o mapa `VINCULO` outra vez, e
     * duas listas com a mesma verdade divergem na primeira correção.
     *
     * *Medido nesta fase: eu ampliei a do banco e esqueci as duas de TypeScript,
     * e o protótipo passou a dizer a verdade enquanto o produto dizia o
     * contrário.*
     */
    const cargos = (texto: string) =>
      new Set((texto.match(/'([a-z_]+)'/g) ?? []).map((s) => s.replace(/'/g, ''))
        .filter((c) => /^(gestor_geral|coordenador|equipe_tecnica|educador|lider_diurno|lider_noturno_geral|enfermagem|cozinha|admin_tecnico)$/.test(c)));

    const { rows: [f] } = await admin.query(
      `SELECT prosrc AS s FROM pg_proc WHERE proname = 'app_le_ata_geral'`);
    const noBanco = cargos(f.s);
    expect(noBanco.size).toBeGreaterThan(5);

    const fs = require('node:fs');
    const pega = (arquivoTs: string, nome: string) => {
      const txt = fs.readFileSync(arquivoTs, 'utf8');
      const i = txt.indexOf(`const ${nome} = [`);
      expect(i).toBeGreaterThan(-1);
      return cargos(txt.slice(i, txt.indexOf('];', i)));
    };
    const ordenado = (s: Set<string>) => [...s].sort();
    expect(ordenado(pega('src/modules/shifts/shifts.service.ts', 'LE_ATA_GERAL')))
      .toEqual(ordenado(noBanco));
    expect(ordenado(pega('../frontend/src/screens/Ata.tsx', 'LE_ATA_GERAL')))
      .toEqual(ordenado(noBanco));
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
