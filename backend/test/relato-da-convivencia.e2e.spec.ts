/**
 * O RELATO DA CONVIVÊNCIA FAMILIAR — a porta que não fecha.
 *
 * Este arquivo guarda uma CORREÇÃO DA FUNDAÇÃO, e é por isso que ele existe
 * com este nome. O pedido de 15/09 era um acompanhamento que *"fica aberto
 * para ser preenchido por algum educador depois de uma semana"*, e eu ia
 * construir isso como pendência com prazo. Ele voltou, em 16/09:
 *
 *   *"Acho mais fácil não dar um prazo, mas deixar em aberto para ser
 *   registrado quando de fato tivermos uma informação. […] Dessa forma não
 *   haverá uma pressão para arrancar a informação da criança. Mas isso pode ser
 *   registrado quantas vezes for necessário, por qualquer educador, tudo
 *   ficando no perfil do jovem."*
 *
 * As cinco coisas que este arquivo impede de voltar:
 *
 *  1. **nenhum prazo e nenhum estado.** Não existe rota, coluna ou função que
 *     feche um relato. O teste confere pela FORMA da resposta — se alguém
 *     acrescentar `status`, `prazo` ou `vence_em`, ele reprova;
 *  2. **quantas vezes for necessário.** Dois, três, dez relatos da mesma ida,
 *     todos guardados, em ordem de escrita;
 *  3. **por qualquer educador.** O cargo mais baixo da casa escreve. A criança
 *     conta para quem ela confia;
 *  4. **a porta abre na SAÍDA**, e não no retorno: dá para relatar enquanto ela
 *     ainda está com a família;
 *  5. **e nada se apaga nem se reescreve.** O banco recusa UPDATE e DELETE.
 *
 * Mais a que veio da outra metade da resposta: *"se houve alguma alteração, sim,
 * tem que ser notificado"* — e só nesse caso.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const appUrl = process.env.DATABASE_APP_URL
  ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher';

describe('O relato da convivência familiar', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const relatar = (token: string, saida: string, corpo: any) =>
    request(http).post(`/api/v1/people/family-stays/${saida}/notes`)
      .set(auth(token)).send(corpo);

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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code = 'AI3'`));

    /* Uma criança da casa, um contato dela, e uma saída ABERTA: é o estado em
       que a porta do relato já existe, que é a metade do pedido. */
    const { rows: [p] } = await admin.query(
      `SELECT s.person_id FROM house_stay s
        WHERE s.house_id = $1 AND s.status = 'ativa'
        ORDER BY s.started_at LIMIT 1`, [ids.AI3]);
    ids.pessoa = p.person_id;

    const { rows: [c] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, active, restricted)
       VALUES ($1, 'Avó do ensaio (fictícia)', 'avo', true, false)
       RETURNING id`, [ids.pessoa]);
    ids.contato = c.id;

    const saida = await request(http).post('/api/v1/people/family-stays')
      .set(auth(tokens.tecnica))
      .send({
        personId: ids.pessoa, contatoId: ids.contato,
        inicio: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        retornoPrevisto: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        finalidade: 'Fim de semana com a avó, para o ensaio do relato.',
      });
    expect(saida.status).toBe(201);
    ids.saida = saida.body.id;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== O que a correção da Fundação impôs ====================

  it('a porta abre na SAÍDA: dá para relatar antes de ela voltar', async () => {
    const r = await relatar(tokens.educador, ids.saida, {
      relato: 'A avó ligou para avisar que está tudo bem e que ela volta no horário.',
    });
    expect(r.status).toBe(201);
    /* A saída continua em andamento: relatar não encerra nada. */
    const { rows: [f] } = await admin.query(
      `SELECT status FROM family_stay WHERE id = $1`, [ids.saida]);
    expect(f.status).toBe('em_andamento');
  });

  it('o EDUCADOR escreve — é o cargo mais baixo da casa, e é o desenho', async () => {
    const r = await relatar(tokens.educador, ids.saida, {
      relato: 'Perguntei como tinha sido, e ela disse que não queria falar agora.',
    });
    expect(r.status).toBe(201);
    /* A criança conta para quem ela confia, e quem ela confia quase nunca é
       quem tem o cargo mais alto. Exigir a técnica faria o educador contar
       para a técnica, que escreveria — e o registro perderia o nome de quem
       ouviu. */
    expect(r.body.aviso).toMatch(/continua aberto/i);
  });

  it('quantas vezes for necessário — e tudo fica, em ordem de escrita', async () => {
    await relatar(tokens.educador, ids.saida, {
      relato: 'Quatro dias depois, ela contou por conta própria o que tinha acontecido.',
    });
    const r = await request(http).get(`/api/v1/people/family-stays/${ids.saida}/notes`)
      .set(auth(tokens.coord));
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThanOrEqual(3);
    /* O que ela disse na terça não substitui o que se observou no domingo:
       soma. Se algum dia isto virar coluna em `family_stay`, a última versão
       apagará a primeira — e este teste é o que avisa. */
    const ordenado = [...r.body].sort((a: any, b: any) =>
      String(a.quando).localeCompare(String(b.quando)));
    expect(r.body.map((n: any) => n.id)).toEqual(ordenado.map((n: any) => n.id));
  });

  it('não existe prazo, estado nem quem feche — nem na resposta', async () => {
    const r = await request(http).get(`/api/v1/people/family-stays/${ids.saida}/notes`)
      .set(auth(tokens.coord));
    expect(r.status).toBe(200);
    for (const n of r.body) {
      expect(Object.keys(n).sort())
        .toEqual(['houveAlteracao', 'id', 'por', 'quando', 'relato']);
    }
    /* A FORMA é o teste: um campo de prazo aqui viraria cobrança sobre o
       educador, e o educador só tem uma forma de baixar uma cobrança dessas —
       perguntar de novo para a criança. */
    expect(JSON.stringify(r.body))
      .not.toMatch(/"(status|prazo|vence|venceEm|pendente|fechado|encerrado)"/i);

    /* E não há rota para fechar: a lista de rotas do módulo não tem nenhuma. */
    const fechar = await request(http)
      .post(`/api/v1/people/family-stays/${ids.saida}/notes/close`)
      .set(auth(tokens.coord)).send({});
    expect(fechar.status).toBe(404);
  });

  it('o relato não se apaga nem se reescreve — o banco recusa os dois', async () => {
    const app_ = new Client({ connectionString: appUrl });
    await app_.connect();
    try {
      const { rows: [u] } = await admin.query(
        `SELECT id FROM app_user WHERE email = 'coord.ai3@paodospobres.dev'`);
      /* SAVEPOINT entre os dois, e não uma transação só: a primeira recusa
         aborta a transação, e a segunda voltaria com "current transaction is
         aborted" — que passaria por erro sem ser o erro certo. */
      await app_.query('BEGIN');
      await app_.query(`SELECT set_config('app.user_id', $1, true)`, [u.id]);

      await app_.query('SAVEPOINT s1');
      await expect(app_.query(
        `UPDATE family_stay_note SET narrative = 'reescrito' WHERE family_stay_id = $1`,
        [ids.saida])).rejects.toThrow(/permission denied|permissão negada/i);
      await app_.query('ROLLBACK TO SAVEPOINT s1');

      await expect(app_.query(
        `DELETE FROM family_stay_note WHERE family_stay_id = $1`,
        [ids.saida])).rejects.toThrow(/permission denied|permissão negada/i);
      await app_.query('ROLLBACK');
    } finally { await app_.end(); }
  });

  // ==================== A outra metade: "se houve alteração" ====================

  it('sem a marca de alteração, ninguém é avisado de nada', async () => {
    const antes = (await admin.query(
      `SELECT count(*)::int AS n FROM escalation
        WHERE entity = 'family_stay' AND entity_id = $1`, [ids.saida])).rows[0].n;
    const r = await relatar(tokens.educador, ids.saida, {
      relato: 'Dormiu bem e foi para a escola no horário, sem nenhuma queixa.',
    });
    expect(r.status).toBe(201);
    const depois = (await admin.query(
      `SELECT count(*)::int AS n FROM escalation
        WHERE entity = 'family_stay' AND entity_id = $1`, [ids.saida])).rows[0].n;
    /* Um aviso a cada linha escrita ensinaria a equipe a ignorar o sino — e aí
       o aviso que importa some junto. */
    expect(depois).toBe(antes);
  });

  it('com a marca, a técnica e a coordenação são avisadas — e o aviso não leva o texto', async () => {
    const SEGREDO = 'FRASE-DO-RELATO-QUE-NAO-PODE-IR-NO-AVISO';
    const r = await relatar(tokens.educador, ids.saida, {
      relato: `Ela contou que ${SEGREDO} no sábado, e ficou com medo.`,
      houveAlteracao: true,
    });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/avisad/i);

    const { rows } = await admin.query(
      `SELECT n.title, n.body, u.role::text AS cargo
         FROM notification n JOIN app_user u ON u.id = n.user_id
        WHERE n.entity = 'family_stay' AND n.entity_id = $1`, [ids.saida]);
    expect(rows.length).toBeGreaterThan(0);
    for (const n of rows) {
      expect(['equipe_tecnica', 'coordenador']).toContain(n.cargo);
      /* §19: nada sensível na tela bloqueada. O aviso diz que existe e onde
         está — nunca o que a criança contou. */
      expect(`${n.title} ${n.body}`).not.toContain(SEGREDO);
    }
  });

  // ==================== Onde tudo fica: o perfil ====================

  it('tudo fica no perfil do jovem, junto com a ida a que pertence', async () => {
    const r = await request(http).get(`/api/v1/people/${ids.pessoa}/family-stays`)
      .set(auth(tokens.educador));
    expect(r.status).toBe(200);
    const ida = r.body.find((f: any) => f.id === ids.saida);
    expect(ida).toBeDefined();
    expect(ida.relatos.length).toBeGreaterThanOrEqual(4);
    /* E sem contagem nenhuma na resposta: "3 relatos" ou "sem relato há 12
       dias" no perfil de uma criança é a cobrança voltando pela porta dos
       fundos. */
    expect(JSON.stringify(ida)).not.toMatch(/"(quantosRelatos|totalRelatos|semRelatoHa)"/i);
  });

  it('e registrar um relato deixa linha na auditoria, sem o texto', async () => {
    const { rows } = await admin.query(
      `SELECT detail FROM audit_event
        WHERE action = 'family_stay.note' AND entity_id = $1
        ORDER BY at DESC LIMIT 1`, [ids.saida]);
    expect(rows).toHaveLength(1);
    /* Regra 2: o log guarda ID e metadado. O relato descreve uma criança e a
       família dela, e ele fica no perfil — não na auditoria. */
    expect(JSON.stringify(rows[0].detail)).not.toMatch(/contou|sábado|medo/i);
    expect(rows[0].detail.houveAlteracao).toBeDefined();
  });
});
