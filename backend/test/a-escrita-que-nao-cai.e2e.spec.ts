/**
 * NENHUMA ESCRITA CAI COM 500 (fase 155).
 *
 * A 148 conferiu a data do `@Param`, a 153 a do `@Query`, a 154 o corpo das
 * exportações. Cada uma olhou uma porta, e a seguinte achou a porta ao lado.
 * Esta suíte deixa de escolher porta: **passa por TODA rota de escrita do
 * servidor**, lida do código, com o corpo vazio e com o corpo cheio de lixo, e
 * cobra que nenhuma responda 500.
 *
 * O QUE ELA ACHOU NA PRIMEIRA VEZ, em 25/09: **28 das 174 rotas respondiam 500
 * em 35 casos.** Vinte e nove eram a mesma classe — o banco não reconhecia o
 * formato de um identificador, de uma data, de uma hora ou de um número — e o
 * filtro `FalhasEmPortugues` não conhecia a classe: a pessoa que só preencheu
 * um campo errado lia *"alguma coisa falhou aqui dentro"*. E o filtro só estava
 * ligado no `main.ts`: **as suítes rodavam sem ele**, testando um servidor que
 * não é o que sobe. Hoje ele mora no `AppModule`.
 *
 * NEGA POR PADRÃO. Rota nova entra na medição sem ninguém lembrar dela; sair
 * da medição é uma linha escrita em `FORA`, com a razão.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** As rotas de escrita, lidas dos controladores — a lista não é escrita à mão. */
function rotasDeEscrita(): { metodo: 'post' | 'patch' | 'put'; url: string }[] {
  const raiz = join(__dirname, '..', 'src', 'modules');
  const out: { metodo: 'post' | 'patch' | 'put'; url: string }[] = [];
  for (const mod of readdirSync(raiz)) {
    for (const f of readdirSync(join(raiz, mod))) {
      if (!f.endsWith('.controller.ts')) continue;
      const t = readFileSync(join(raiz, mod, f), 'utf8');
      const re = /@Controller\('([^']*)'\)|@(Post|Patch|Put)\((?:'([^']*)')?\)/g;
      let prefixo = '';
      let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        if (m[1] !== undefined) { prefixo = m[1]; continue; }
        out.push({
          metodo: m[2].toLowerCase() as 'post' | 'patch' | 'put',
          url: `/${prefixo}${m[3] ? `/${m[3]}` : ''}`,
        });
      }
    }
  }
  return out;
}

/**
 * AS QUE FICAM DE FORA — e por quê. Nenhuma está aqui por cair: estão porque
 * rodá-las com corpo vazio FAZ o que elas fazem, no banco que as outras suítes
 * dividem.
 */
const FORA: Record<string, string> = {
  /* A sessão. Sair ou revogar derrubaria o próprio token da medição. */
  '/auth': 'sessão de quem mede',
  /* Os atos do relógio: com corpo vazio eles PROCESSAM o dia — geram doses e
     atividades, escalam atrasos, arquivam. Cada um tem a sua suíte. */
  '/activities/agenda/generate': 'ato do relógio',
  '/activities/generate-day': 'ato do relógio',
  '/archive/process': 'ato do relógio',
  '/medications/generate-doses': 'ato do relógio',
  '/medications/escalate-overdue': 'ato do relógio',
  '/followups/generate': 'ato do relógio',
};

/** Todo nome de campo que carrega casa, pessoa, data, hora ou número. */
const LIXO: Record<string, string> = Object.fromEntries([
  'houseId', 'personId', 'userId', 'id', 'prescriptionId', 'ataId',
  'de', 'ate', 'date', 'data', 'dia', 'em', 'inicio', 'fim', 'prazo', 'hora', 'horario',
  'horarios', 'quando', 'scheduledAt', 'startedAt', 'endedAt', 'nascimento', 'birthDate',
  'retorno', 'validade', 'quantidade', 'minutos', 'capacidade',
].map((k) => [k, 'nao-e-isso']));

describe('Nenhuma escrita cai com 500', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};

  const login = async (email: string) => {
    const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
    return r.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    tokens.coord = await login('coord.ai3@paodospobres.dev');
    tokens.deOutraCasa = await login('coord.ai4@paodospobres.dev');
    tokens.enfermagem = await login('enfermagem@paodospobres.dev');
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('a medição acha as rotas — senão ela passa por não olhar', () => {
    /* Eram 174 fora da sessão em 25/09. */
    expect(rotasDeEscrita().filter((r) => !r.url.startsWith('/auth')).length)
      .toBeGreaterThanOrEqual(170);
  });

  it('corpo vazio ou com lixo recebe recusa com frase em TODA rota de escrita', async () => {
    const caidas: string[] = [];
    for (const r of rotasDeEscrita()) {
      if (Object.keys(FORA).some((f) => r.url === f || r.url.startsWith(`${f}/`))) continue;
      /* Identificador inventado em todo `:param`: nada real é tocado. */
      const url = `/api/v1${r.url.replace(/:[A-Za-z]+/g, () => randomUUID())}`;
      for (const [rotulo, corpo] of [['vazio', {}], ['lixo', LIXO]] as const) {
        const x = await request(http)[r.metodo](url).set(auth(tokens.coord)).send(corpo);
        if (x.status >= 500) caidas.push(`${r.metodo.toUpperCase()} ${r.url} [${rotulo}]: ${x.status}`);
      }
    }
    expect(caidas).toEqual([]);
  }, 180000);

  it('e nenhuma LEITURA cai com lixo na URL (fase 156)', async () => {
    /* As 160 rotas `GET`, lidas do código, com identificador inventado em todo
       `:param` e casa, pessoa, número e palavra de lixo na consulta. Medido em
       25/09: nenhuma caía — o filtro da 155 já as cobria. A cobrança fica para
       que a próxima rota de leitura entre medida sem ninguém lembrar dela. */
    const raiz = join(__dirname, '..', 'src', 'modules');
    const leituras: string[] = [];
    for (const mod of readdirSync(raiz)) {
      for (const f of readdirSync(join(raiz, mod))) {
        if (!f.endsWith('.controller.ts')) continue;
        const t = readFileSync(join(raiz, mod, f), 'utf8');
        const re = /@Controller\('([^']*)'\)|@Get\((?:'([^']*)')?\)/g;
        let prefixo = '';
        let m: RegExpExecArray | null;
        while ((m = re.exec(t))) {
          if (m[1] !== undefined) { prefixo = m[1]; continue; }
          leituras.push(`/${prefixo}${m[2] ? `/${m[2]}` : ''}`);
        }
      }
    }
    expect(leituras.length).toBeGreaterThanOrEqual(150);
    const consulta = ['houseId', 'personId', 'userId', 'id', 'limite', 'dias', 'tipo', 'mes',
      'periodo', 'escala', 'entity', 'mode', 'publico'].map((k) => `${k}=nao-e-isso`).join('&');
    const caidas: string[] = [];
    for (const r of leituras) {
      const base = `/api/v1${r.replace(/:[A-Za-z]+/g, () => randomUUID())}`;
      for (const url of [base, `${base}?${consulta}`]) {
        const x = await request(http).get(url).set(auth(tokens.coord));
        if (x.status >= 500) caidas.push(`GET ${r}: ${x.status}`);
      }
    }
    expect(caidas).toEqual([]);
  }, 180000);

  it('e o formato errado chega como frase em português, sem o texto do banco', async () => {
    const r = await request(http).post('/api/v1/escala').set(auth(tokens.coord))
      .send({ houseId: 'nao-e-isso', userId: randomUUID(), data: '2026-10-01', turno: 'diurno' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/formato que o sistema não reconhece/);
    expect(JSON.stringify(r.body)).not.toMatch(/invalid input syntax|uuid/i);
  });

  // ============ O estoque baixo que dizia "sinalizado" sem sinalizar ============

  it('marcar estoque baixo de OUTRA casa é recusado — antes dizia ok, e nada mudava', async () => {
    const { rows: [item] } = await admin.query(
      `SELECT s.id, s.low_flag FROM medication_stock s JOIN house h ON h.id = s.house_id
        WHERE h.code = 'AI3' ORDER BY s.id LIMIT 1`);
    const r = await request(http).post(`/api/v1/medications/stock/${item.id}/flag-low`)
      .set(auth(tokens.deOutraCasa)).send({ baixo: !item.low_flag });
    expect(r.status).toBe(404);

    const { rows: [depois] } = await admin.query(
      `SELECT low_flag FROM medication_stock WHERE id = $1`, [item.id]);
    expect(depois.low_flag).toBe(item.low_flag);
  });

  it('e o item que não existe também — e o da própria casa continua sendo marcado', async () => {
    const r = await request(http).post(`/api/v1/medications/stock/${randomUUID()}/flag-low`)
      .set(auth(tokens.enfermagem)).send({ baixo: true });
    expect(r.status).toBe(404);

    const { rows: [item] } = await admin.query(
      `SELECT s.id, s.low_flag FROM medication_stock s JOIN house h ON h.id = s.house_id
        WHERE h.code = 'AI3' ORDER BY s.id LIMIT 1`);
    const ok = await request(http).post(`/api/v1/medications/stock/${item.id}/flag-low`)
      .set(auth(tokens.enfermagem)).send({ baixo: item.low_flag });
    expect(ok.status).toBe(201);
    expect(ok.body.estoqueBaixo).toBe(item.low_flag);
  });
});
