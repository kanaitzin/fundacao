/**
 * O PERÍODO DA CASA — *"uma ata geral de toda semana"*, e as regras que ela
 * carrega.
 *
 * A Fundação pediu em 15/09/2026: *"acompanhamento semanal é um bom caminho:
 * ver como foi a casa toda aquela semana […] com quem tira o relatório podendo
 * escolher o tempo de período que ele quer tirar. Se é um dia, dois, três, uma
 * semana, um mês, seis meses."*
 *
 * As quatro coisas que este arquivo existe para não deixar cair no primeiro
 * ajuste de tela:
 *
 *  1. **o círculo de quem lê** é o que ele desenhou para o dado sensível —
 *     Líder Diurno, técnica, coordenação e gestão. O educador não abre, e a
 *     recusa diz por quê;
 *  2. **o período é livre, com teto de seis meses.** Um dia é válido; 200 dias
 *     não são, e a recusa explica o que fazer;
 *  3. **texto restrito não sai na folha.** A ocorrência de acesso restrito
 *     entra como CONTAGEM, e o relato dela não aparece em lugar nenhum da
 *     resposta. Esta é a que mais facilmente se perde: basta alguém achar que
 *     "a coordenação pode ver mesmo" e tirar o filtro;
 *  4. **nada é somado por criança.** A seção de alimentação agrupa por nome e
 *     não traz número nenhum ao lado dele. O teste confere pela FORMA da
 *     resposta — se alguém acrescentar `quantas`, ele reprova.
 *
 * E uma quinta, que o desenho impõe: o recorte por casa é do BANCO. A
 * coordenação de uma casa não tira o relatório da casa vizinha nem pedindo
 * pelo id.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const FINALIDADE = 'Reunião de rede da semana, pedida pela coordenação da unidade.';

describe('O período da casa', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const abrir = (token: string, casa: string, de?: string, ate?: string) =>
    request(http).get('/api/v1/reports/period')
      .query({ houseId: casa, ...(de ? { de } : {}), ...(ate ? { ate } : {}) })
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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code = 'AI3'`));
    ({ rows: [{ id: ids.AI1 }] } = await admin.query(`SELECT id FROM house WHERE code = 'AI1'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== Quem lê ====================

  it('os quatro cargos do círculo estreito leem — e o educador não', async () => {
    for (const cargo of ['lider', 'tecnica', 'coord', 'gestor']) {
      const r = await abrir(tokens[cargo], ids.AI3);
      expect([cargo, r.status]).toEqual([cargo, 200]);
    }
    const negado = await abrir(tokens.educador, ids.AI3);
    expect(negado.status).toBe(403);
    /* A recusa diz onde o trabalho dele continua inteiro: um 403 sem saída
       ensina que o sistema esconde coisas de quem cuida da criança. */
    expect(negado.body.message).toMatch(/sua tela|seu nome/i);
  });

  it('a coordenação de uma casa não tira o relatório da casa vizinha', async () => {
    const r = await abrir(tokens.coord, ids.AI1);
    expect(r.status).toBe(404);
  });

  // ==================== O período livre ====================

  it('um dia é um período válido, e a resposta diz que é um dia', async () => {
    const hoje = (await admin.query(`SELECT app_hoje()::text AS d`)).rows[0].d;
    const r = await abrir(tokens.coord, ids.AI3, hoje, hoje);
    expect(r.status).toBe(200);
    expect(r.body.periodo).toEqual({ de: hoje, ate: hoje, dias: 1 });
  });

  it('seis meses passam; mais do que isso é recusado com o que fazer no lugar', async () => {
    const hoje = (await admin.query(`SELECT app_hoje()::text AS d`)).rows[0].d;
    const menos = (n: number) => diasAntes(hoje, n);
    const seisMeses = await abrir(tokens.coord, ids.AI3, menos(183), hoje);
    expect(seisMeses.status).toBe(200);
    expect(seisMeses.body.periodo.dias).toBe(184);

    const demais = await abrir(tokens.coord, ids.AI3, menos(200), hoje);
    expect(demais.status).toBe(400);
    expect(demais.body.message).toMatch(/dois relatórios|seis meses/i);
  });

  it('data inicial depois da final é recusada antes de consultar nada', async () => {
    const hoje = (await admin.query(`SELECT app_hoje()::text AS d`)).rows[0].d;
    const r = await abrir(tokens.coord, ids.AI3, hoje, diasAntes(hoje, 10));
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/depois da final/i);
  });

  it('o período anterior tem a MESMA duração, e vem nomeado', async () => {
    const hoje = (await admin.query(`SELECT app_hoje()::text AS d`)).rows[0].d;
    const r = await abrir(tokens.coord, ids.AI3, diasAntes(hoje, 6), hoje);
    expect(r.status).toBe(200);
    expect(r.body.periodo.dias).toBe(7);
    /* Sete dias no período, sete dias antes dele — e não "o mês passado". */
    expect(r.body.periodoAnterior.ate).toBe(diasAntes(hoje, 7));
    expect(r.body.periodoAnterior.de).toBe(diasAntes(hoje, 13));
  });

  // ==================== O que o relatório não carrega ====================

  it('o relato de uma ocorrência restrita NÃO sai no relatório — só a contagem', async () => {
    const hoje = (await admin.query(`SELECT app_hoje()::text AS d`)).rows[0].d;
    const SEGREDO = 'FRASE-RESTRITA-QUE-NAO-PODE-SAIR-NA-FOLHA';

    const { rows: [u] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'tecnica.ai3@paodospobres.dev'`);
    await admin.query(
      `INSERT INTO incident (house_id, category, happened_at, objective_fact,
                             access_level, status, opened_by)
       VALUES ($1, 'violencia_ou_suspeita', now(), $2, 'restrito', 'aberta', $3)`,
      [ids.AI3, SEGREDO, u.id]);

    const r = await abrir(tokens.coord, ids.AI3, diasAntes(hoje, 6), hoje);
    expect(r.status).toBe(200);
    /* Nem no corpo da resposta, nem na folha que sai dela. */
    expect(JSON.stringify(r.body)).not.toContain(SEGREDO);
    expect(r.body.numeros.ocorrenciasRestritas).toBeGreaterThan(0);
    /* E a ressalva diz onde ela se lê — a contagem sozinha seria um enigma. */
    expect(r.body.ressalvas.join(' ')).toMatch(/acesso restrito/i);

    const folha = await request(http).post('/api/v1/reports/period/preview')
      .set(auth(tokens.coord))
      .send({ houseId: ids.AI3, de: diasAntes(hoje, 6), ate: hoje });
    expect(folha.status).toBe(201);
    expect(JSON.stringify(folha.body)).not.toContain(SEGREDO);

    /*
     * E A OCORRÊNCIA FICA — não há faxina no fim deste teste.
     *
     * A primeira versão terminava com um `DELETE`, e o banco recusou:
     * `ocorrencia_nao_e_apagada`. É a regra 3 do §6 funcionando contra o meu
     * próprio teste, e ela está certa — se um teste pudesse apagar uma
     * ocorrência, alguém acabaria copiando a linha para um script de
     * manutenção. O que era um estorvo virou a verificação abaixo.
     */
    await expect(admin.query(
      `DELETE FROM incident WHERE objective_fact = $1`, [SEGREDO]))
      .rejects.toThrow(/ocorrencia_nao_e_apagada/);
  });

  it('nada é somado por criança: a alimentação agrupa por nome e não conta', async () => {
    const r = await abrir(tokens.coord, ids.AI3);
    expect(r.status).toBe(200);
    for (const c of r.body.alimentacao ?? []) {
      expect(Object.keys(c).sort()).toEqual(['linhas', 'personId', 'quem']);
      /* Nenhum total ao lado do nome. "3" ao lado de um nome é o começo de
         uma ficha, e o §8.7.2 explica por que o número viaja e o motivo não. */
      expect(JSON.stringify(c)).not.toMatch(/"(quantas|quantos|total|vezes)"/i);
    }
  });

  it('a parte boa vem ANTES da parte ruim, e a ordem é do servidor', async () => {
    const r = await abrir(tokens.coord, ids.AI3);
    expect(r.status).toBe(200);
    const ordem = (r.body.secoes as any[]).map((s) => s.cod);
    expect(ordem.indexOf('conquista')).toBeLessThan(ordem.indexOf('ocorrencia'));
    expect(ordem.indexOf('memoria')).toBeLessThan(ordem.indexOf('episodio'));
  });

  // ==================== O rastro ====================

  it('abrir o período é, ele mesmo, uma ação auditada', async () => {
    const r = await abrir(tokens.coord, ids.AI3);
    expect(r.status).toBe(200);

    const { rows } = await admin.query(
      `SELECT actor_id, detail FROM audit_event
        WHERE action = 'periodo.leitura' ORDER BY at DESC LIMIT 1`);
    expect(rows).toHaveLength(1);
    expect(rows[0].detail.de).toBe(r.body.periodo.de);
    expect(rows[0].detail.ate).toBe(r.body.periodo.ate);
  });

  it('exportar exige finalidade escrita, e deixa a linha do documento', async () => {
    const semFinalidade = await request(http).post('/api/v1/reports/period/export')
      .set(auth(tokens.coord)).send({ houseId: ids.AI3 });
    expect(semFinalidade.status).toBe(400);
    expect(semFinalidade.body.message).toMatch(/finalidade/i);

    const r = await request(http).post('/api/v1/reports/period/export')
      .set(auth(tokens.coord)).send({ houseId: ids.AI3, finalidade: FINALIDADE });
    expect(r.status).toBe(201);
    expect(r.body.nomeArquivo).toMatch(/\.docx$/);

    const { rows } = await admin.query(
      `SELECT purpose, entity FROM audit_event
        WHERE action = 'documento.export' AND entity = 'periodo'
        ORDER BY at DESC LIMIT 1`);
    expect(rows).toHaveLength(1);
    expect(rows[0].purpose).toBe(FINALIDADE);
  });
});

/**
 * N dias antes de uma data, sem tocar no relógio da máquina.
 *
 * A data de partida vem do BANCO — `app_hoje()`, no fuso da instituição — e
 * nunca de `new Date()` do processo de teste. A regra 13 do §6 é sobre isto:
 * um teste que calcula "hoje" em UTC passa o dia inteiro e falha às 21h de
 * Porto Alegre, quando em Londres já é o dia seguinte.
 */
function diasAntes(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
