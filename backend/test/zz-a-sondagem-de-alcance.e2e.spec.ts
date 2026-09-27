/**
 * A SONDAGEM DE ALCANCE, PERMANENTE (fase 170).
 *
 * A fase 158 passou a coordenação da Casa 04 por toda leitura do servidor, com
 * os registros REAIS da Casa 03 no lugar de cada identificador, e achou 24
 * leituras respondendo 200 vazio a quem é de fora. A sondagem foi feita à mão
 * e se perdeu com aquela sessão: o que ficou foi a lista do que ela não tinha
 * dado para sondar. Esta suíte é a sondagem, e roda POR ÚLTIMO
 * (`test/setup/sequenciador.js`), sobre o banco que as outras deixam povoado.
 *
 * O QUE ELA FAZ. Lê dos controladores toda rota `GET` que aponta para uma
 * casa ou uma criança: as que têm parâmetro na URL, e as que leem `houseId` ou
 * `personId` na consulta. Troca cada parâmetro por um registro real da Casa 03
 * (o `@RegistroDaRota` da rota diz a tabela; sem ele, o MAPA abaixo diz), põe
 * a Casa 03 e uma criança dela na consulta, e pede como a coordenação e como o
 * educador da Casa 04. Reprova em três casos:
 *
 *  * **sucesso para quem é de fora** (a menos que a rota esteja em LEGITIMO,
 *    com a razão escrita): fora do alcance é 403 ou 404, nunca 200 vazio;
 *  * **erro 500**;
 *  * **nome de alguém da Casa 03 na resposta**, com qualquer status: criança
 *    que nunca passou pela Casa 04, ou pessoa da equipe só da Casa 03.
 *
 * O QUE ELA NÃO FAZ: as escritas. Com o corpo vazio, a recusa por campo
 * faltando vem antes da pergunta de alcance, e a sondagem não mediria nada;
 * as escritas entre casas foram medidas na 156 com corpos de verdade, e as
 * quatro superfícies que ficaram de fora têm suíte própria (169).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

interface Leitura { url: string; params: string[]; declarado: Record<string, string>; consulta: boolean }

/** As leituras que apontam para uma casa ou uma criança, lidas do código. */
function leiturasComAlvo(): Leitura[] {
  const raiz = join(__dirname, '..', 'src', 'modules');
  const out: Leitura[] = [];
  for (const mod of readdirSync(raiz)) {
    if (!statSync(join(raiz, mod)).isDirectory()) continue;
    for (const f of readdirSync(join(raiz, mod))) {
      if (!f.endsWith('.controller.ts')) continue;
      const L = readFileSync(join(raiz, mod, f), 'utf8').split('\n');
      let prefixo = '';
      L.forEach((l, i) => {
        const c = /@Controller\('([^']*)'\)/.exec(l);
        if (c) prefixo = c[1];
        const g = /^\s*@Get\((?:'([^']*)')?\)/.exec(l);
        if (!g) return;
        const caminho = g[1] ?? '';
        const url = `/${prefixo}${caminho ? `/${caminho}` : ''}`;
        const params = [...caminho.matchAll(/:(\w+)/g)].map((m) => m[1]);
        const declarado: Record<string, string> = {};
        for (const k of [1, 2, 3]) {
          const d = /@RegistroDaRota\('(\w+)', '(\w+)'\)/.exec(L[i - k] ?? '');
          if (d) declarado[d[1]] = d[2];
        }
        /* A assinatura do método: das linhas seguintes até o corpo. */
        let assinatura = '';
        for (let j = i + 1; j < Math.min(L.length, i + 8); j++) {
          assinatura += L[j];
          if (/\)\s*\{/.test(L[j])) break;
        }
        const consulta = /@Query\('(houseId|personId)'/.test(assinatura);
        if (params.length || consulta) out.push({ url, params, declarado, consulta });
      });
    }
  }
  return out;
}

/**
 * O PARÂMETRO SEM `@RegistroDaRota`, e a tabela dele. Nega por padrão (lição
 * da 153): parâmetro que não está aqui nem declarado na rota reprova a suíte
 * até alguém dizer o que ele é.
 */
const MAPA: Record<string, string> = {
  '/archive/:id#id': 'archive_item',
  '/checks/:id#id': 'collective_check',
  '/audit/report/:reportId#reportId': 'report_document',
  '/incidents/:id#id': 'incident',
  '/incidents/:id/folha#id': 'incident',
  '/medications/family-stays/:id/to-take/folha#id': 'family_stay',
  '/medications/prescriptions/documents/:docId/file#docId': 'prescription_document',
  '/medications/purchases/:compraId/file#compraId': 'medication_purchase',
  '/medications/stock/:id/movements#id': 'medication_stock',
  '/nursing/hospitalizations/:id#id': 'hospitalization',
  '/nursing/hospitalizations/:id/folha#id': 'hospitalization',
  '/nursing/hospitalizations/:id/notes/:notaId/anexo#id': 'hospitalization',
  '/nursing/hospitalizations/:id/notes/:notaId/anexo#notaId': 'hospitalization_note',
  '/people/kitchen-requests/:id/history#id': 'kitchen_request',
  '/people/portaria/visitante/:contactId/foto#contactId': 'person_contact',
  '/people/:id/documents/:docId/file#docId': 'document',
  '/people/:id/memories/:memId/file#memId': 'memory_record',
  '/people/:id/memories/:memId/photos/:fotoId#memId': 'memory_record',
  '/people/:id/memories/:memId/photos/:fotoId#fotoId': 'memory_photo',
  '/followups/:id#id': 'followup',
  '/followups/:id/sources#id': 'followup',
  '/impacto/marcos/:id/comprovante#id': 'life_milestone',
  '/reports/:id#id': 'report_document',
  '/shifts/general-ata/:id#id': 'general_night_ata',
  '/shifts/:id#id': 'shift',
  '/shifts/:id/folha#id': 'shift',
};

/**
 * AS LEITURAS QUE RESPONDEM A QUEM É DE FORA, E POR QUÊ. Cada uma com a razão;
 * a sondagem reprova a que não estiver aqui.
 */
const LEGITIMO: Record<string, string> = {
  '/shifts/general-ata/:id':
    'A ATA Geral Noturna é das oito casas: a coordenação de qualquer casa lê a linha da sua.',
};

describe('A sondagem de alcance — toda leitura, com registro real da Casa 03', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  let AI3 = '', AI4 = '', crianca = '';
  let nomes: string[] = [];
  const achados: string[] = [];
  const semDado: string[] = [];
  let sondadas = 0;

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
      coord4: 'coord.ai4@paodospobres.dev', educador4: 'educador.ai4@paodospobres.dev',
    })) {
      t[k] = (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
      await request(http).post('/api/v1/auth/reauth').set({ Authorization: `Bearer ${t[k]}` })
        .send({ password: SENHA });
    }
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    /* As crianças que são SÓ da Casa 03: nunca passaram pela Casa 04. A que
       foi transferida para lá é vista pela casa que a recebeu (§7.2), e a 158
       já anotou as duas vezes em que isso apareceu. */
    const { rows: so3 } = await admin.query(`
      SELECT p.id, p.full_name FROM person p
       WHERE EXISTS (SELECT 1 FROM house_stay s WHERE s.person_id = p.id AND s.house_id = $1 AND s.status = 'ativa')
         AND NOT EXISTS (SELECT 1 FROM house_stay s WHERE s.person_id = p.id AND s.house_id = $2)
         AND NOT EXISTS (SELECT 1 FROM transfer_request r WHERE r.person_id = p.id)
       ORDER BY p.full_name`, [AI3, AI4]);
    crianca = so3[0]?.id;
    const { rows: equipe } = await admin.query(`
      SELECT u.full_name FROM app_user u
       WHERE EXISTS (SELECT 1 FROM user_house_assignment a WHERE a.user_id = u.id AND a.house_id = $1)
         AND NOT EXISTS (SELECT 1 FROM user_house_assignment a WHERE a.user_id = u.id AND a.house_id <> $1)
         AND u.role NOT IN ('gestor_geral', 'enfermagem', 'lider_noturno_geral')`, [AI3]);
    nomes = [...so3.map((r) => r.full_name), ...equipe.map((r) => r.full_name)]
      .filter((n: string) => n && n.length >= 8);
  });

  afterAll(async () => {
    console.log(`Sondagem de alcance: ${sondadas} pedidos; sem registro da Casa 03 para sondar: `
      + `${semDado.length ? semDado.join(', ') : 'nenhuma'}`);
    await app.close(); await admin.end();
  });

  /** Um registro real da Casa 03 na tabela, pelo caminho que a tabela tem até a casa. */
  async function daCasa3(tabela: string): Promise<string | undefined> {
    if (tabela === 'person') return crianca;
    if (tabela === 'house') return AI3;
    const { rows: cols } = await admin.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [tabela]);
    const tem = (c: string) => cols.some((x) => x.column_name === c);
    let onde: string;
    if (tabela === 'transfer_request') onde = `from_house_id = $1 AND to_house_id <> $2`;
    else if (tabela === 'hospitalization_note') {
      onde = `hospitalization_id IN (SELECT id FROM hospitalization WHERE house_id = $1)`;
    } else if (tabela === 'memory_photo') {
      onde = `memory_id IN (SELECT id FROM memory_record m WHERE m.person_id IN (
                SELECT s.person_id FROM house_stay s WHERE s.house_id = $1)
              AND m.person_id NOT IN (SELECT s.person_id FROM house_stay s WHERE s.house_id = $2))`;
    } else if (tem('house_id')) onde = `house_id = $1 AND $2::uuid IS NOT NULL`;
    else if (tem('person_id')) {
      onde = `person_id IN (SELECT s.person_id FROM house_stay s WHERE s.house_id = $1)
              AND person_id NOT IN (SELECT s.person_id FROM house_stay s WHERE s.house_id = $2)`;
    } else return (await admin.query(`SELECT id::text FROM ${tabela} LIMIT 1`)).rows[0]?.id;
    const { rows } = await admin.query(`SELECT id::text FROM ${tabela} WHERE ${onde} LIMIT 1`, [AI3, AI4]);
    return rows[0]?.id;
  }

  it('a sondagem acha as leituras, e conhece todo parâmetro delas', () => {
    const rotas = leiturasComAlvo();
    expect(rotas.length).toBeGreaterThanOrEqual(80);
    const semNome = rotas.flatMap((r) => r.params
      .filter((p) => !r.declarado[p] && !MAPA[`${r.url}#${p}`])
      .map((p) => `${r.url} :${p}`));
    expect(semNome).toEqual([]);
  });

  it('a Casa 04 não recebe sucesso, erro nem nome da Casa 03 em leitura nenhuma', async () => {
    expect(crianca).toBeTruthy();
    const { rows: [{ hoje }] } = await admin.query(`SELECT app_hoje()::text AS hoje`);
    const consulta = `houseId=${AI3}&personId=${crianca}&de=${hoje}&ate=${hoje}&data=${hoje}`
      + `&date=${hoje}&mes=${hoje.slice(0, 7)}`;
    for (const r of leiturasComAlvo()) {
      let url = r.url;
      let falta = false;
      for (const p of r.params) {
        const tabela = r.declarado[p] ?? MAPA[`${r.url}#${p}`];
        const id = tabela ? await daCasa3(tabela) : undefined;
        if (!id) { falta = true; break; }
        url = url.replace(`:${p}`, id);
      }
      if (falta) { semDado.push(r.url); continue; }
      for (const quem of ['coord4', 'educador4']) {
        const x = await request(http).get(`/api/v1${url}?${consulta}`)
          .set({ Authorization: `Bearer ${t[quem]}` });
        sondadas++;
        const texto = JSON.stringify(x.body ?? '') + (typeof x.text === 'string' ? x.text : '');
        const nome = nomes.find((n) => texto.includes(n));
        if (nome) achados.push(`${quem} GET ${r.url} → ${x.status} traz o nome de ${nome}`);
        if (x.status >= 500) achados.push(`${quem} GET ${r.url} → ${x.status}`);
        else if (x.status < 400 && !LEGITIMO[r.url]) {
          achados.push(`${quem} GET ${r.url} → ${x.status} ${JSON.stringify(x.body).slice(0, 120)}`);
        }
      }
    }
    expect(achados).toEqual([]);
  }, 300000);
});
