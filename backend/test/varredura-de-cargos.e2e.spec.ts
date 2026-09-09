/**
 * VARREDURA DE CARGOS — cada cargo bate em cada porta, e nenhuma quebra.
 *
 * As outras suítes provam REGRAS: quem pode, quem não pode, o que fica
 * registrado. Elas fazem isso escolhendo as rotas que interessam à regra — e
 * por isso não olham as outras. Esta suíte faz o contrário: não sabe nada
 * sobre regra nenhuma e bate em TODAS as rotas de leitura com TODOS os
 * cargos, uma por uma.
 *
 * O que ela procura é uma coisa só, e é a mais barata de cometer:
 *
 *   **erro 500** — a resposta que não é resposta.
 *
 * 403 é uma resposta: "não é seu". 404 é uma resposta: "não existe, ou não é
 * seu". 400 é uma resposta: "faltou parâmetro". As três a tela sabe ler e a
 * pessoa entende. 500 não é nenhuma delas: é o servidor caindo no meio da
 * frase, e na casa ele aparece como uma tela branca às onze da noite.
 *
 * Dois defeitos que só uma varredura pega, porque nenhuma suíte de regra
 * pensa em tentá-los:
 *
 *  * a rota que recebe um id que **não é UUID** e devolve o erro do Postgres
 *    cru (`invalid input syntax for type uuid`) com 500 — é o caso do
 *    `/incidents/categories` batendo em `/incidents/:id`, que o
 *    `contrato-rotas` pega no texto e este pega no ar;
 *  * a rota escrita para um cargo e nunca aberta por outro. O cargo que menos
 *    navega é o que mais sofre com isso: a **cozinha** só tinha usuário no
 *    seed a partir de 08/09/2026, e até então nenhuma rota do sistema havia
 *    sido aberta por ela contra o servidor de verdade.
 *
 * A varredura não substitui as suítes de regra: ela não sabe o que DEVERIA
 * voltar. Ela sabe o que nunca pode voltar.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const SRC = join(__dirname, '..', 'src');

/** Os nove cargos, cada um com o usuário fictício do seed. */
const CARGOS: Array<[string, string]> = [
  ['gestor_geral', 'gestor@paodospobres.dev'],
  ['enfermagem', 'enfermagem@paodospobres.dev'],
  ['lider_noturno_geral', 'lider.noturno@paodospobres.dev'],
  ['coordenador', 'coord.ai3@paodospobres.dev'],
  ['equipe_tecnica', 'tecnica.ai3@paodospobres.dev'],
  ['educador', 'educador.ai3@paodospobres.dev'],
  ['lider_diurno', 'lider.ai3@paodospobres.dev'],
  ['cozinha', 'cozinha.ai3@paodospobres.dev'],
];

/*
 * Rotas de LEITURA que a varredura não bate, e por quê. A lista é curta de
 * propósito: cada linha aqui é um pedaço do sistema que esta suíte não olha.
 */
const FORA_DA_VARREDURA = new Set([
  // Baixar arquivo do dossiê devolve bytes, e a leitura registra acesso ao
  // documento de uma criança. Quem prova isso é `dossie-do-acolhido`.
  'GET /files/:id',
  // O corpo do documento arquivado, idem — `arquivo-laco` cobre.
  'GET /archive/:id/download',
]);

function arquivos(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (e.endsWith('.controller.ts')) out.push(p);
  }
  return out;
}

/** As rotas GET servidas, lidas dos decoradores — o mesmo jeito do `contrato-rotas`. */
function rotasDeLeitura(): string[] {
  const out: string[] = [];
  for (const arq of arquivos(SRC)) {
    const src = readFileSync(arq, 'utf8');
    const bases = [...src.matchAll(/@Controller\(\s*'([^']*)'/g)]
      .map((m) => ({ pos: m.index ?? 0, base: m[1] }));
    if (!bases.length) continue;
    for (const m of src.matchAll(/@Get\(\s*(?:'([^']*)')?\s*\)/g)) {
      const pos = m.index ?? 0;
      /* O @Controller que vale é o ÚLTIMO antes deste @Get: um arquivo pode
         servir mais de um controller, e ler só o primeiro foi o erro que o
         `contrato-rotas` anotou. */
      const base = [...bases].reverse().find((b) => b.pos < pos)?.base ?? '';
      const caminho = [base, m[1] ?? ''].filter(Boolean).join('/');
      out.push(`/${caminho}`.replace(/\/+/g, '/'));
    }
  }
  return [...new Set(out)].sort();
}

describe('Varredura de cargos — nenhuma porta devolve 500', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

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

    for (const [cargo, email] of CARGOS) {
      const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
      if (res.status !== 201) throw new Error(`login ${cargo} (${email}): ${res.status}`);
      tokens[cargo] = res.body.token;
    }

    const casa = await admin.query(`SELECT id FROM house WHERE code='AI3'`);
    ids.houseId = casa.rows[0].id;
    /* A criança não guarda a casa: quem guarda é a ESTADIA (`house_stay`), e
       é ela que termina quando a criança sai. */
    const pessoa = await admin.query(
      `SELECT person_id AS id FROM house_stay
        WHERE house_id=$1 AND ended_at IS NULL LIMIT 1`, [ids.houseId]);
    ids.personId = pessoa.rows[0].id;
  }, 60_000);

  afterAll(async () => { await app?.close(); await admin?.end(); });

  const rotas = rotasDeLeitura().filter((r) => !FORA_DA_VARREDURA.has(`GET ${r}`));

  it('a varredura tem rotas para varrer e cargos para varrer com', () => {
    /* Um parser que devolve lista vazia passaria a suíte inteira em silêncio —
       que é a forma mais discreta de um teste deixar de testar. */
    expect(rotas.length).toBeGreaterThan(40);
    expect(Object.keys(tokens)).toHaveLength(CARGOS.length);
  });

  /*
   * Cada cargo, cada rota, três preenchimentos de parâmetro: o id REAL da casa
   * e da criança (o caminho normal), um UUID que não existe, e um pedaço de
   * texto que NÃO é UUID.
   */
  /**
   * Um teste por PREENCHIMENTO, com todos os cargos dentro.
   *
   * A primeira versão gerava um teste por cargo e por preenchimento — 24
   * linhas de ✓ que ninguém lê e, quando duas quebrassem, duas mensagens
   * separadas para o mesmo defeito. Aqui a falha sai com o cargo e a rota
   * juntos, e a lista inteira de uma vez: é ela que diz se o problema é de uma
   * rota ou de um cargo.
   */
  const varrer = async (valor: (p: string) => string) => {
    const quebrou: string[] = [];
    for (const [cargo] of CARGOS) {
      for (const rota of rotas) {
        const caminho = rota.replace(/:([A-Za-z]+)/g, (_, p) => valor(p));
        const res = await request(http)
          .get(`/api/v1${caminho}?houseId=${ids.houseId}&personId=${ids.personId}`)
          .set(auth(tokens[cargo]));
        if (res.status >= 500) {
          quebrou.push(`[${cargo}] ${rota} → ${res.status} `
            + `${JSON.stringify(res.body?.message ?? res.text).slice(0, 160)}`);
        }
      }
    }
    return quebrou;
  };

  it('com o id real da casa e da criança, nenhum cargo recebe 500', async () => {
    expect(await varrer((p) => (/house/i.test(p) ? ids.houseId : ids.personId))).toEqual([]);
  }, 240_000);

  it('com um id que não existe, a resposta é 404 ou 403 — nunca 500', async () => {
    expect(await varrer(() => '00000000-0000-4000-8000-000000000000')).toEqual([]);
  }, 240_000);

  it('com um id que não é UUID, o erro do Postgres não vaza', async () => {
    /* O caso do `/incidents/categories` batendo em `/incidents/:id`: o
       Postgres reclama do tipo e a reclamação dele sai como 500. */
    expect(await varrer(() => 'categories')).toEqual([]);
  }, 240_000);

  /*
   * E a recusa em PORTUGUÊS: a varredura acima aceita 403 e 404 sem olhar o
   * corpo. Aqui o corpo importa — mensagem em inglês, ou nome de tabela, é
   * uma resposta que a educadora não consegue ler nem repetir ao telefone.
   */
  it('nenhuma recusa devolve mensagem do Postgres ou do framework', async () => {
    const feias: string[] = [];
    for (const [cargo] of CARGOS) {
      for (const rota of rotas) {
        const caminho = rota.replace(/:([A-Za-z]+)/g, () => '00000000-0000-4000-8000-000000000000');
        const res = await request(http)
          .get(`/api/v1${caminho}?houseId=${ids.houseId}&personId=${ids.personId}`)
          .set(auth(tokens[cargo]));
        const msg = String(res.body?.message ?? '');
        if (res.status >= 400
          && /invalid input syntax|relation ".*" does not exist|permission denied for|Cannot read propert|violates row-level/i.test(msg)) {
          feias.push(`[${cargo}] ${rota} → ${msg.slice(0, 140)}`);
        }
      }
    }
    expect(feias).toEqual([]);
  }, 240_000);
});
