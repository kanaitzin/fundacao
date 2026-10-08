/**
 * A SONDAGEM DE ESCRITA ENTRE CASAS, PERMANENTE (fase 171).
 *
 * A fase 156 passou a coordenação da Casa 04 pelas rotas de escrita com os
 * registros REAIS da Casa 03 e achou a tomada de conta (a senha de um
 * educador de outra casa redefinida e devolvida a quem pediu). Foi feita à
 * mão, e se perdeu com a sessão dela. Esta suíte é a sondagem, e roda por
 * último (`test/setup/sequenciador.js`), depois da de leitura, sobre o banco
 * que as outras suítes deixam povoado.
 *
 * A PROVA NÃO DEPENDE DO STATUS. Com um corpo genérico, parte das rotas recusa
 * por formato antes de perguntar o alcance, e o 400 não diria nada. Por isso a
 * prova é o BANCO: uma fotografia de toda linha da Casa 03, em toda tabela que
 * chega a ela por casa ou por criança, tirada antes e depois de CADA rota. A
 * rota que muda uma linha da Casa 03 reprova, qualquer que tenha sido a
 * resposta. E a que responde sucesso sem mudar nada também reprova: é a
 * resposta que mente, a da marca de estoque baixo da fase 155.
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

interface Escrita { metodo: 'post' | 'patch' | 'put' | 'delete'; url: string; params: string[]; declarado: Record<string, string> }

function escritas(): Escrita[] {
  const raiz = join(__dirname, '..', 'src', 'modules');
  const out: Escrita[] = [];
  for (const mod of readdirSync(raiz)) {
    if (!statSync(join(raiz, mod)).isDirectory()) continue;
    for (const f of readdirSync(join(raiz, mod))) {
      if (!f.endsWith('.controller.ts')) continue;
      const L = readFileSync(join(raiz, mod, f), 'utf8').split('\n');
      let prefixo = '';
      L.forEach((l, i) => {
        const c = /@Controller\('([^']*)'\)/.exec(l);
        if (c) prefixo = c[1];
        const g = /^\s*@(Post|Patch|Put|Delete)\((?:'([^']*)')?\)/.exec(l);
        if (!g) return;
        const caminho = g[2] ?? '';
        const declarado: Record<string, string> = {};
        for (const k of [1, 2, 3]) {
          const d = /@RegistroDaRota\('(\w+)', '(\w+)'\)/.exec(L[i - k] ?? '');
          if (d) declarado[d[1]] = d[2];
        }
        out.push({
          metodo: g[1].toLowerCase() as Escrita['metodo'],
          url: `/${prefixo}${caminho ? `/${caminho}` : ''}`,
          params: [...caminho.matchAll(/:(\w+)/g)].map((m) => m[1]),
          declarado,
        });
      });
    }
  }
  return out;
}

/**
 * AS QUE FICAM DE FORA, e por quê. A sessão de quem mede, os atos do relógio
 * (processam o dia inteiro, de todas as casas, e cada um tem a sua suíte) e o
 * que é das oito casas por definição.
 */
const FORA: Record<string, string> = {
  '/auth': 'a sessão de quem mede',
  '/activities/agenda/generate': 'ato do relógio',
  '/activities/generate-day': 'ato do relógio',
  '/archive/process': 'ato do relógio',
  '/medications/generate-doses': 'ato do relógio',
  '/medications/escalate-overdue': 'ato do relógio',
  '/followups/generate': 'ato do relógio',
  '/shifts/general-ata': 'a ATA Geral Noturna é das oito casas: cada coordenação escreve a linha da sua',
  '/shifts/general-night-line': 'idem, a linha da casa na ATA Geral',
  '/notifications': 'o aviso é da pessoa, não da casa: a coordenação da Casa 04 só alcança os seus',
  '/assistente': 'a conversa e a sugestão são da pessoa, não da casa: quem é de fora sugere em nome próprio, e a casa que não alcança vira sugestão sem casa (suíte a-acolhe-ai)',
  '/avisos-no-celular': 'o aparelho é da pessoa, não da casa: ninguém liga, lê ou desliga o de outra (suíte o-aviso-no-celular)',
};

/**
 * O PARÂMETRO SEM `@RegistroDaRota`, e a tabela dele, pelo começo da rota. A
 * regra mais específica vem primeiro. Nega por padrão: parâmetro que nenhuma
 * regra classifica reprova a suíte.
 */
const REGRAS: Array<[RegExp, string, string]> = [
  [/^\/activities\/agenda\/:id/, 'id', 'commitment'],
  [/^\/activities\/substitutions\/:id/, 'id', 'substitution_request'],
  [/^\/activities\/:id/, 'id', 'activity'],
  [/^\/alignments\/agenda\/:id/, 'id', 'meeting_agenda_item'],
  [/^\/alignments\/agreements\/:id/, 'id', 'team_agreement'],
  [/^\/alignments\/statute\/:id/, 'id', 'house_statute'],
  [/^\/checks\/:id/, 'id', 'collective_check'],
  [/^\/devices\/:id/, 'id', 'institutional_device'],
  [/^\/escala\/rascunho\/itens\/:itemId/, 'itemId', 'shift_draft_item'],
  [/^\/escala\/rascunho\/:id/, 'id', 'shift_draft'],
  [/^\/escala\/:id/, 'id', 'shift_assignment'],
  [/^\/followups\/:id/, 'id', 'followup'],
  [/^\/houses\/:id/, 'id', 'house'],
  [/^\/incidents\/attachments\/:id/, 'id', 'incident_attachment'],
  [/^\/incidents\/communications\/:id/, 'id', 'external_communication'],
  [/^\/incidents\/:id/, 'id', 'incident'],
  [/^\/medications\/doses\/:id/, 'id', 'medication_administration'],
  [/^\/medications\/family-stays\/:id/, 'id', 'family_stay'],
  [/^\/medications\/prescriptions\/:id/, 'id', 'prescription'],
  [/^\/medications\/stock\/:id/, 'id', 'medication_stock'],
  [/^\/nursing\/evolutions\/:id/, 'id', 'health_evolution'],
  [/^\/nursing\/hospitalizations\/:id/, 'id', 'hospitalization'],
  [/^\/nursing\/summary\/issues\/:id/, 'id', 'health_summary_issue'],
  [/^\/nursing\/.*:personId/, 'personId', 'person'],
  [/^\/impacto\/.*:personId/, 'personId', 'person'],
  [/^\/people\/birthdays\/:personId/, 'personId', 'person'],
  [/^\/people\/contacts\/:contactId/, 'contactId', 'person_contact'],
  [/^\/people\/family-stays\/:id/, 'id', 'family_stay'],
  [/^\/people\/food-restrictions\/:restrictionId/, 'restrictionId', 'food_restriction'],
  [/^\/people\/health-conditions\/:conditionId/, 'conditionId', 'health_condition'],
  [/^\/people\/kitchen-requests\/:id/, 'id', 'kitchen_request'],
  [/^\/people\/portaria\/visitas\/:id/, 'id', 'visit'],
  [/^\/people\/:id\/credentials\/:credId/, 'credId', 'person_credential'],
  [/^\/people\/:id\/documents\/:docId/, 'docId', 'document'],
  [/^\/people\/:id/, 'id', 'person'],
  [/^\/reports\/:id/, 'id', 'report_document'],
  [/^\/routine\/versions\/:id/, 'id', 'routine_version'],
  [/^\/shifts\/ata-read-requests\/:id/, 'id', 'ata_read_request'],
  [/^\/shifts\/ata\/:ataId/, 'ataId', 'ata'],
  [/^\/shifts\/episodes\/:episodeId/, 'episodeId', 'ata_episode'],
  [/^\/shifts\/:id/, 'id', 'shift'],
  [/^\/staff\/:id/, 'id', 'app_user'],
  [/^\/statements\/:id/, 'id', 'statement'],
  [/^\/sync\/conflicts\/:id/, 'id', 'sync_conflict'],
  [/^\/transfers\/:id/, 'id', 'transfer_request'],
];

const tabelaDe = (e: Escrita, p: string) =>
  e.declarado[p] ?? REGRAS.find(([re, param]) => param === p && re.test(e.url))?.[2];

/**
 * AS QUE PODEM RESPONDER SUCESSO A QUEM É DE FORA, e por quê. Cada uma
 * precisa, também, deixar a Casa 03 como estava: esta lista dispensa só o
 * status, nunca a fotografia.
 */
const SUCESSO_LEGITIMO: Record<string, string> = {};

/** As tabelas que só registram o que aconteceu, e não são da casa. */
const REGISTRO_DO_QUE_ACONTECEU = new Set(['audit_event']);

describe('A sondagem de escrita — toda rota, com registro real da Casa 03', () => {
  let app: INestApplication, http: any, admin: Client;
  let token = '';
  let AI3 = '', AI4 = '', crianca = '', pessoaDaEquipe = '';
  let fotografia = '';
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
    token = (await request(http).post('/api/v1/auth/login')
      .send({ email: 'coord.ai4@paodospobres.dev', password: SENHA })).body.token;
    /* O cofre e a senha pedem a senha de novo: sem ela, o 403 mediria outra coisa. */
    await request(http).post('/api/v1/auth/reauth').set({ Authorization: `Bearer ${token}` })
      .send({ password: SENHA });
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    const { rows: [c] } = await admin.query(`
      SELECT p.id FROM person p
       WHERE EXISTS (SELECT 1 FROM house_stay s WHERE s.person_id = p.id AND s.house_id = $1 AND s.status = 'ativa')
         AND NOT EXISTS (SELECT 1 FROM house_stay s WHERE s.person_id = p.id AND s.house_id <> $1)
         AND NOT EXISTS (SELECT 1 FROM transfer_request r WHERE r.person_id = p.id)
       ORDER BY p.full_name LIMIT 1`, [AI3]);
    crianca = c?.id;
    const { rows: [u] } = await admin.query(`
      SELECT u.id FROM app_user u
       WHERE u.role = 'educador' AND u.active
         AND EXISTS (SELECT 1 FROM user_house_assignment a WHERE a.user_id = u.id AND a.house_id = $1)
         AND NOT EXISTS (SELECT 1 FROM user_house_assignment a WHERE a.user_id = u.id AND a.house_id <> $1)
       ORDER BY u.email LIMIT 1`, [AI3]);
    pessoaDaEquipe = u?.id;

    /*
     * A FOTOGRAFIA, montada do catálogo: toda tabela que chega à Casa 03 pela
     * casa (`house_id`, e a transferência pelas duas pontas), pela criança
     * (`person_id` de quem é SÓ da Casa 03) ou pela pessoa da equipe (quem é
     * só da Casa 03). Uma consulta só, com o resumo de cada tabela.
     */
    const { rows: cols } = await admin.query(`
      SELECT c.table_name, array_agg(c.column_name::text) AS cols
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = 'public'
                                        AND t.table_type = 'BASE TABLE'
       WHERE c.table_schema = 'public' GROUP BY c.table_name ORDER BY c.table_name`);
    const soDa3 = `(SELECT s.person_id FROM house_stay s WHERE s.house_id = '${AI3}'
                     AND s.person_id NOT IN (SELECT person_id FROM house_stay WHERE house_id <> '${AI3}'))`;
    const equipeDa3 = `(SELECT a.user_id FROM user_house_assignment a WHERE a.house_id = '${AI3}'
                         AND a.user_id NOT IN (SELECT user_id FROM user_house_assignment WHERE house_id <> '${AI3}'))`;
    const partes: string[] = [];
    for (const { table_name: tb, cols: cs } of cols) {
      if (REGISTRO_DO_QUE_ACONTECEU.has(tb)) continue;
      let onde = '';
      if (tb === 'house') onde = `id = '${AI3}'`;
      else if (tb === 'app_user') onde = `id IN ${equipeDa3}`;
      else if (cs.includes('from_house_id')) onde = `from_house_id = '${AI3}' OR to_house_id = '${AI3}'`;
      else if (cs.includes('house_id')) onde = `house_id = '${AI3}'`;
      else if (cs.includes('person_id')) onde = `person_id IN ${soDa3}`;
      else if (cs.includes('user_id')) onde = `user_id IN ${equipeDa3}`;
      else continue;
      partes.push(`SELECT '${tb}' AS t, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h
                     FROM ${tb} x WHERE ${onde}`);
    }
    fotografia = partes.join('\nUNION ALL\n');
  });

  afterAll(async () => {
    console.log(`Sondagem de escrita: ${sondadas} rotas; sem registro da Casa 03 para sondar: `
      + `${semDado.length ? semDado.join(', ') : 'nenhuma'}`);
    await app.close(); await admin.end();
  });

  const fotografar = async () =>
    Object.fromEntries((await admin.query(fotografia)).rows.map((r) => [r.t, r.h]));

  async function daCasa3(tabela: string): Promise<string | undefined> {
    if (tabela === 'person') return crianca;
    if (tabela === 'house') return AI3;
    if (tabela === 'app_user') return pessoaDaEquipe;
    const { rows: cs } = await admin.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [tabela]);
    const tem = (c: string) => cs.some((x) => x.column_name === c);
    let onde: string;
    if (tabela === 'shift_draft_item') onde = `draft_id IN (SELECT id FROM shift_draft WHERE house_id = $1)`;
    else if (tabela === 'transfer_request') onde = `from_house_id = $1 AND to_house_id <> $2`;
    else if (tem('house_id')) onde = `house_id = $1`;
    else if (tem('person_id')) {
      onde = `person_id IN (SELECT s.person_id FROM house_stay s WHERE s.house_id = $1)
              AND person_id NOT IN (SELECT s.person_id FROM house_stay s WHERE s.house_id = $2)`;
    } else return undefined;
    const { rows } = await admin.query(
      `SELECT id::text FROM ${tabela} WHERE (${onde}) AND $1::uuid IS NOT NULL AND $2::uuid IS NOT NULL
        ORDER BY id LIMIT 1`, [AI3, AI4]);
    return rows[0]?.id;
  }

  it('a sondagem acha as escritas, e conhece todo parâmetro delas', () => {
    const todas = escritas().filter((e) => !Object.keys(FORA).some((f) => e.url === f || e.url.startsWith(`${f}/`)));
    expect(todas.length).toBeGreaterThanOrEqual(170);
    const semNome = todas.flatMap((e) => e.params.filter((p) => !tabelaDe(e, p)).map((p) => `${e.url} :${p}`));
    expect(semNome).toEqual([]);
  });

  it('a coordenação da Casa 04 não muda linha nenhuma da Casa 03, por rota nenhuma', async () => {
    expect(crianca).toBeTruthy();
    expect(pessoaDaEquipe).toBeTruthy();
    const { rows: [{ hoje }] } = await admin.query(`SELECT app_hoje()::text AS hoje`);
    const TEXTO = 'Registro escrito pela coordenação de outra casa, que não deveria entrar aqui.';
    const corpo = {
      houseId: AI3, personId: crianca, userId: pessoaDaEquipe, pessoas: [crianca],
      motivo: TEXTO, texto: TEXTO, descricao: TEXTO, finalidade: TEXTO, nota: TEXTO,
      observacao: TEXTO, justificativa: TEXTO, comentario: TEXTO, decisao: TEXTO, relato: TEXTO,
      data: hoje, em: hoje, dia: hoje, quando: hoje, quantidade: 1, baixo: true, liberar: true,
      aprovado: true, password: SENHA, senha: 'Outra@Casa2026', novaSenha: 'Outra@Casa2026',
    };
    let antes = await fotografar();
    for (const e of escritas()) {
      if (Object.keys(FORA).some((f) => e.url === f || e.url.startsWith(`${f}/`))) continue;
      let url = e.url;
      let falta = false;
      for (const p of e.params) {
        const tb = tabelaDe(e, p);
        const id = tb ? await daCasa3(tb) : undefined;
        if (!id) { falta = true; break; }
        url = url.replace(`:${p}`, id);
      }
      if (falta) { semDado.push(e.url); continue; }
      const r = await request(http)[e.metodo](`/api/v1${url}`)
        .set({ Authorization: `Bearer ${token}` }).send(corpo);
      sondadas++;
      const depois = await fotografar();
      const mudou = Object.keys(depois).filter((t) => depois[t] !== antes[t]);
      if (mudou.length) achados.push(`${e.metodo.toUpperCase()} ${e.url} → ${r.status}; mudou ${mudou.join(', ')}`);
      else if (r.status < 400 && !SUCESSO_LEGITIMO[e.url]) {
        achados.push(`${e.metodo.toUpperCase()} ${e.url} → ${r.status} sem mudar nada: ${JSON.stringify(r.body).slice(0, 100)}`);
      }
      if (r.status >= 500) achados.push(`${e.metodo.toUpperCase()} ${e.url} → ${r.status}`);
      antes = depois;
    }
    expect(achados).toEqual([]);
  }, 600000);
});
