/**
 * O ARQUIVO DAS ATAS — folhear o livro para trás.
 *
 * O que precisa continuar verdadeiro depois de qualquer mudança:
 *
 *  * a ATA GERAL NOTURNA cobre as oito casas, e o arquivo entrega só a LINHA
 *    da casa consultada. A coordenação e a equipe técnica leem o que o Líder
 *    Noturno Geral escreveu sobre a casa DELAS; o que ele escreveu sobre as
 *    outras sete não passa por aqui, nem em texto nem em identificador —
 *    entregar o `id` da folha completa é entregar o caminho para ela;
 *  * quem não é da casa não folheia a casa: `app_house_in_scope` vale aqui
 *    como vale em qualquer função com `p_house` (regra 8);
 *  * o educador não consulta o arquivo. A passagem dele é do turno;
 *  * semana é de calendário, segunda a domingo, e mês é do dia 1 ao último —
 *    "últimos 7 dias" é conta fácil e pedido impossível;
 *  * consultar deixa rastro, e o rastro é o RECORTE, nunca o conteúdo (§20).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { janelaDeConsulta } from '../src/kernel/common/tempo';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const emPortoAlegre = (d: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);
/*
 * ONTEM, e não hoje.
 *
 * A primeira versão montava a noite de HOJE, e a suíte passava sozinha e
 * falhava a cada duas rodadas: `plantao.e2e` também escreve a linha da AI3 na
 * ATA Geral de hoje, e quem rodasse por último ganhava. Não era defeito do
 * sistema — era um teste afirmando sobre um estado que não era só dele.
 *
 * O dia anterior resolve pela raiz e é mais fiel ao que se está testando: o
 * arquivo existe justamente para os dias que já passaram.
 */
const ONTEM = emPortoAlegre(new Date(Date.now() - 86_400_000));

describe('Arquivo das ATAS', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const arquivo = (token: string, casa: string, escala = 'dia', data = ONTEM) =>
    request(http).get(`/api/v1/shifts/ata-archive?houseId=${casa}&escala=${escala}&data=${data}`)
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
      lider: 'lider.ai3@paodospobres.dev',
      noturno: 'lider.noturno@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const outra = await admin.query(`SELECT id, code FROM house WHERE code <> 'AI3' LIMIT 1`);
    ids.outra = outra.rows[0]?.id;

    // Uma noite completa na Casa 03: plantão noturno com ATA, e a ATA Geral
    // Noturna com a linha desta casa e a linha de OUTRA — é a linha da outra
    // que não pode vazar.
    await request(http).post('/api/v1/shifts').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, data: ONTEM, turno: 'noturno' });
    const geral = await request(http).post('/api/v1/shifts/general-ata')
      .set(auth(tokens.noturno)).send({ data: ONTEM });
    ids.geral = geral.body?.id ?? geral.body?.ataId;

    if (ids.geral) {
      await request(http)
        .patch(`/api/v1/shifts/general-ata/${ids.geral}/house/${ids.AI3}`)
        .set(auth(tokens.noturno))
        .send({ houveContato: true, motivo: 'Apoio pedido pela casa (ficção de teste).',
                acao: 'Fui à casa e acompanhei a rotina de dormir.', categoria: 'outro_apoio' });
      if (ids.outra) {
        await request(http)
          .patch(`/api/v1/shifts/general-ata/${ids.geral}/house/${ids.outra}`)
          .set(auth(tokens.noturno))
          .send({ houveContato: true,
                  motivo: 'SEGREDO DA OUTRA CASA — não pode aparecer no arquivo da AI3.',
                  acao: 'Registro fictício da outra casa.', categoria: 'outro_apoio' });
      }
    }
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== Alcance ====================

  it('a coordenação e a equipe técnica folheiam o arquivo da casa', async () => {
    for (const quem of ['coord', 'tecnica', 'lider', 'noturno', 'gestor']) {
      const res = await arquivo(tokens[quem], ids.AI3);
      expect([quem, res.status]).toEqual([quem, 200]);
      expect(Array.isArray(res.body.dias)).toBe(true);
    }
  });

  it('o educador e a enfermagem não folheiam o arquivo', async () => {
    for (const quem of ['educador', 'enfermagem']) {
      const res = await arquivo(tokens[quem], ids.AI3);
      expect([quem, res.status]).toEqual([quem, 403]);
      // A recusa diz de quem é o arquivo, e não "acesso negado".
      expect(res.body.message).toMatch(/coordenação|equipe técnica|líderes/i);
    }
  });

  it('não se folheia o arquivo de uma casa fora do alcance', async () => {
    if (!ids.outra) return;
    const res = await arquivo(tokens.lider, ids.outra);
    expect(res.status).toBe(403);
  });

  // ==================== A linha da casa, e só ela ====================

  it('da ATA Geral Noturna sai a linha DESTA casa — o que foi escrito sobre as outras, não', async () => {
    const res = await arquivo(tokens.coord, ids.AI3);
    expect(res.status).toBe(200);

    const inteiro = JSON.stringify(res.body);
    expect(inteiro).not.toContain('SEGREDO DA OUTRA CASA');
    // E nem o identificador da folha completa: com ele em mãos, a linha das
    // outras sete está a uma chamada de distância.
    if (ids.geral) expect(inteiro).not.toContain(ids.geral);

    const hoje = res.body.dias.find((d: any) => d.data === ONTEM);
    expect(hoje?.geral).toBeTruthy();
    expect(hoje.geral.motivo).toContain('Apoio pedido pela casa');
    expect(res.body.notaAtaGeral).toMatch(/assunto delas/);
  });

  it('o Gestor Geral recebe o caminho para a folha completa das oito casas', async () => {
    const res = await arquivo(tokens.gestor, ids.AI3);
    expect(res.status).toBe(200);
    const hoje = res.body.dias.find((d: any) => d.data === ONTEM);
    if (ids.geral) expect(hoje?.geral?.id).toBe(ids.geral);

    // E ela abre de verdade, com as oito linhas.
    if (ids.geral) {
      const folha = await request(http).get(`/api/v1/shifts/general-ata/${ids.geral}`)
        .set(auth(tokens.gestor));
      expect(folha.status).toBe(200);
      expect(folha.body.casas.length).toBeGreaterThan(1);
    }
  });

  // ==================== O recorte ====================

  it('semana é de calendário (segunda a domingo) e mês vai do dia 1 ao último', () => {
    // 2026-08-31 é uma segunda-feira.
    expect(janelaDeConsulta('semana', '2026-08-31')).toEqual({ de: '2026-08-31', ate: '2026-09-06' });
    // 2026-09-06 é o domingo da MESMA semana — e não o começo da seguinte.
    expect(janelaDeConsulta('semana', '2026-09-06')).toEqual({ de: '2026-08-31', ate: '2026-09-06' });
    expect(janelaDeConsulta('mes', '2026-02-14')).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
    expect(janelaDeConsulta('mes', '2024-02-14')).toEqual({ de: '2024-02-01', ate: '2024-02-29' });
    expect(janelaDeConsulta('dia', '2026-08-31')).toEqual({ de: '2026-08-31', ate: '2026-08-31' });
  });

  it('a semana e o mês devolvem a janela que pediram', async () => {
    const semana = await arquivo(tokens.coord, ids.AI3, 'semana');
    expect(semana.status).toBe(200);
    expect(semana.body).toMatchObject(janelaDeConsulta('semana', ONTEM));

    const mes = await arquivo(tokens.coord, ids.AI3, 'mes');
    expect(mes.status).toBe(200);
    expect(mes.body).toMatchObject(janelaDeConsulta('mes', ONTEM));
  });

  it('consultar deixa rastro, e o rastro é o recorte — não o conteúdo', async () => {
    await arquivo(tokens.tecnica, ids.AI3, 'semana');
    const { rows } = await admin.query(
      `SELECT detail::text FROM audit_event WHERE action = 'ata.arquivo.consulta'
        ORDER BY at DESC LIMIT 1`);
    expect(rows.length).toBe(1);
    expect(rows[0].detail).toContain('semana');
    // O que estava escrito nas ATAS não entra no log de jeito nenhum.
    expect(rows[0].detail).not.toContain('Apoio pedido pela casa');
  });
});
