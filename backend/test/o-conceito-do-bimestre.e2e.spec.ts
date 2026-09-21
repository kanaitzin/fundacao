/**
 * O CONCEITO EDUCACIONAL DO BIMESTRE (migração 1430).
 *
 * A DECISÃO, em duas rodadas. Em 20/09/2026 a Fundação disse COMO a métrica
 * *"quantas crianças tiveram boas notas"* pode existir: **um conceito geral por
 * período, por bimestre, com espaço para o porquê** — e não boletim por
 * disciplina (*"a métrica que ninguém consegue digitar não existe"*). Em
 * 21/09/2026 veio a outra metade, que era a minha pergunta: **quem digita** —
 * *"a equipe técnica, coordenador e educador líder"*.
 *
 * O que esta suíte cobra, e cada item é uma frase da decisão:
 *
 *   * **o motivo é obrigatório.** Um conceito sozinho atravessa meses e vira
 *     característica da criança — é o argumento que recusou a pontuação de
 *     comportamento (§7), aplicado ao boletim;
 *   * **quem digita são os três**, e o educador de plantão NÃO é um deles — ele
 *     escreve a evolução educacional, que é outra coisa e continua sendo dele;
 *   * **quem LÊ é quem alcança a criança**, o educador inclusive: esconder dele
 *     o conceito faria a casa ter uma informação sobre a escola que justamente
 *     quem senta ao lado na lição de casa não vê;
 *   * **corrigir não sobrescreve.** Registrar de novo o mesmo bimestre insere
 *     outra linha, e a anterior continua legível com o nome de quem a escreveu;
 *   * **o bimestre que ainda não aconteceu é recusado** — escrevê-lo seria
 *     escrever sobre o que não houve, e o painel contaria.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O conceito educacional do bimestre', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** O bimestre anterior ao corrente — sempre um período que já aconteceu. */
  let ano = 0; let bimestre = 0;

  const registrar = (token: string, corpo: Record<string, unknown>) =>
    request(http).post(`/api/v1/nursing/education/${ids.crianca}/concepts`)
      .set(auth(token)).send(corpo);
  const ler = (token: string) =>
    request(http).get(`/api/v1/nursing/education/${ids.crianca}`).set(auth(token));

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
      lider: 'lider.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.crianca }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name OFFSET 11 LIMIT 1`, [ids.AI3]));

    /*
     * O PERÍODO SAI DO `app_hoje()`, e não do relógio do processo: o bimestre
     * corrente é do calendário da instituição. Escolho o ANTERIOR ao corrente,
     * que é sempre um período que já terminou de acontecer — assim a suíte não
     * depende do mês em que roda nem de eu lembrar de trocar o número.
     */
    const { rows: [p] } = await admin.query(
      `SELECT EXTRACT(YEAR FROM app_hoje())::int AS ano,
              LEAST(4, GREATEST(1, ceil(EXTRACT(MONTH FROM app_hoje())::numeric / 3)::int)) AS bim`);
    ano = p.bim > 1 ? p.ano : p.ano - 1;
    bimestre = p.bim > 1 ? p.bim - 1 : 4;
  });

  afterAll(async () => {
    /* Um banco só: o que esta suíte escreve, ela apaga (a lição da fase 127). */
    await admin.query(`DELETE FROM education_concept WHERE person_id = $1`, [ids.crianca]);
    await app.close(); await admin.end();
  });

  // ==================== O motivo ====================

  it('sem o porquê não registra — e a recusa diz o que o motivo impede', async () => {
    const r = await registrar(tokens.tecnica,
      { ano, bimestre, conceito: 'acompanha', motivo: 'foi bem' });
    expect(r.status).toBe(400);
    /* A recusa ensina: conceito sozinho vira característica da criança. */
    expect(r.body.message).toMatch(/característica da criança/i);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM education_concept WHERE person_id = $1`, [ids.crianca]);
    expect(rows[0].n).toBe(0);
  });

  it('conceito fora da lista não entra', async () => {
    const r = await registrar(tokens.tecnica, {
      ano, bimestre, conceito: 'otimo_aluno',
      motivo: 'Motivo fictício suficientemente longo para passar do piso de dez.',
    });
    expect(r.status).toBe(400);
  });

  // ==================== Quem digita ====================

  it('a equipe técnica, a coordenação e o Líder Diurno digitam', async () => {
    /* Os três escrevem o MESMO bimestre, de propósito: cada um corrige o
       anterior, e é assim que se prova que os três alcançam a porta. O teste da
       correção, mais abaixo, cobra o que essa sequência deixa no banco. */
    for (const [i, cargo] of (['tecnica', 'coord', 'lider'] as const).entries()) {
      const r = await registrar(tokens[cargo], {
        ano, bimestre, conceito: 'acompanha',
        motivo: `Registro fictício ${i} do bimestre, com o porquê escrito por extenso.`,
      });
      expect(r.status).toBe(201);
    }
    /* E depois dos três, UM vigente — nunca três. */
    const { rows: [n] } = await admin.query(
      `SELECT count(*)::int AS n FROM education_concept
        WHERE person_id = $1 AND ano = $2 AND bimestre = $3 AND substituido_em IS NULL`,
      [ids.crianca, ano, bimestre]);
    expect(n.n).toBe(1);
  });

  it('o educador de plantão NÃO digita o conceito — ele escreve a evolução', async () => {
    const r = await registrar(tokens.educador, {
      ano, bimestre, conceito: 'acompanha',
      motivo: 'Motivo fictício suficientemente longo para passar do piso de dez.',
    });
    expect(r.status).toBe(403);
    /* A recusa manda para o lugar certo, em vez de só dizer "não pode". */
    expect(r.body.message).toMatch(/evolução educacional/i);
  });

  it('e a Enfermagem também não — a escola não é ato de saúde', async () => {
    const r = await registrar(tokens.enfermagem, {
      ano, bimestre, conceito: 'acompanha',
      motivo: 'Motivo fictício suficientemente longo para passar do piso de dez.',
    });
    expect(r.status).toBe(403);
  });

  // ==================== Quem lê ====================

  it('o educador LÊ o conceito — é ele quem senta ao lado na lição de casa', async () => {
    const r = await ler(tokens.educador);
    expect(r.status).toBe(200);
    expect(r.body.conceitos.length).toBeGreaterThan(0);
    /* E o motivo vem junto: o conceito nunca aparece sozinho. */
    for (const k of r.body.conceitos) {
      expect(String(k.motivo).length).toBeGreaterThanOrEqual(10);
      expect(typeof k.rotulo).toBe('string');
    }
  });

  // ==================== A correção ====================

  it('registrar de novo o mesmo bimestre CORRIGE, e o anterior continua legível', async () => {
    const { rows: [antes] } = await admin.query(
      `SELECT id FROM education_concept
        WHERE person_id = $1 AND ano = $2 AND bimestre = $3 AND substituido_em IS NULL`,
      [ids.crianca, ano, bimestre]);
    expect(antes).toBeDefined();

    const r = await registrar(tokens.coord, {
      ano, bimestre, conceito: 'nao_acompanha',
      motivo: 'A escola devolveu o retorno do bimestre depois: ficou para trás em matemática.',
    });
    expect(r.status).toBe(201);
    expect(r.body.substituiu).toBe(antes.id);
    expect(r.body.aviso).toMatch(/nada se apaga/i);

    /* A linha antiga NÃO foi alterada no conteúdo: ela só ficou marcada como
       substituída, e continua com o autor e o motivo que tinha. */
    const { rows: [velha] } = await admin.query(
      `SELECT conceito, motivo, substituido_em FROM education_concept WHERE id = $1`, [antes.id]);
    expect(velha.substituido_em).not.toBeNull();
    expect(velha.conceito).toBe('acompanha');

    /* E há UM vigente por período — nunca dois. */
    const { rows: [n] } = await admin.query(
      `SELECT count(*)::int AS n FROM education_concept
        WHERE person_id = $1 AND ano = $2 AND bimestre = $3 AND substituido_em IS NULL`,
      [ids.crianca, ano, bimestre]);
    expect(n.n).toBe(1);

    /* A tela recebe as duas, e sabe qual é qual. */
    const lido = await ler(tokens.tecnica);
    const doPeriodo = lido.body.conceitos.filter(
      (k: any) => k.ano === ano && k.bimestre === bimestre);
    expect(doPeriodo.length).toBeGreaterThanOrEqual(2);
    expect(doPeriodo.some((k: any) => k.substituido)).toBe(true);
    expect(doPeriodo.some((k: any) => k.corrigeUmAnterior)).toBe(true);
  });

  // ==================== O período ====================

  it('o bimestre que ainda não aconteceu é recusado', async () => {
    const r = await registrar(tokens.tecnica, {
      ano: ano + 5, bimestre: 4, conceito: 'acompanha',
      motivo: 'Motivo fictício suficientemente longo para passar do piso de dez.',
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/não terminou de acontecer|não houve/i);
  });

  it('a lista de conceitos vem do SERVIDOR, e não da tela', async () => {
    const r = await request(http).get('/api/v1/nursing/education/kinds')
      .set(auth(tokens.tecnica));
    expect(r.status).toBe(200);
    expect(r.body.conceitos.map((c: any) => c.cod).sort())
      .toEqual(['acompanha', 'acompanha_com_apoio', 'nao_acompanha']);
    expect(r.body.bimestres).toHaveLength(4);
  });

  it('o log guarda a ação e o período, e NUNCA o motivo', async () => {
    const { rows } = await admin.query(
      `SELECT action, detail FROM audit_event
        WHERE action = 'education.concept' ORDER BY at DESC LIMIT 1`);
    expect(rows[0].action).toBe('education.concept');
    /* Metadado, nunca conteúdo (§20). */
    expect(JSON.stringify(rows[0].detail)).not.toMatch(/matemática|retorno do bimestre/i);
    expect(rows[0].detail.bimestre).toBeDefined();
  });
});
