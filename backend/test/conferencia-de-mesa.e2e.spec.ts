/**
 * A CONFERÊNCIA DE MESA (§10).
 *
 * A regra escrita é "sem marcação em lote SILENCIOSA", e a do banco é "nada
 * que preencha o que NÃO foi olhado". Nenhuma das duas proíbe registrar, de
 * uma vez, o que foi olhado de uma vez — desde que fique gravado que foi assim.
 *
 * O que a casa faz de verdade no almoço: a educadora olha a mesa, vê que as
 * vinte crianças estão comendo, e precisava de vinte toques para dizer isso.
 * Vinte toques não deixam o registro mais verdadeiro; deixam a pessoa com
 * pressa, e pressa é o que faz pular a criança que não comeu.
 *
 * O que este teste guarda:
 *
 *  * a conferência de mesa é UM ATO, com autor, horário e contagem próprios —
 *    e as linhas que nascem dela apontam para ele. Quem ler um ano depois sabe
 *    a diferença entre vinte observações e um olhar sobre a mesa;
 *  * ela NUNCA sobrescreve quem já foi marcado, inclusive a criança marcada
 *    "recusou" antes de a mesa ser conferida;
 *  * ela só usa a opção NÃO-EXCEÇÃO. Exceção exige justificativa por criança e
 *    continua individual;
 *  * corrigir uma linha que veio da mesa a torna INDIVIDUAL: alguém olhou
 *    aquela criança, e a procedência para de dizer "na mesa";
 *  * a CHAMADA FINAL DO TURNO não a aceita. Ela existe justamente para alguém
 *    contar as crianças uma a uma antes de dormir;
 *  * e o gatilho de histórico (0670) continua valendo: a correção guarda o que
 *    constava antes, venha de onde vier.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A conferência de mesa', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const ver = async (id: string, token = tokens.educador) =>
    (await request(http).get(`/api/v1/checks/${id}`).set(auth(token))).body;
  const abrir = async (kind: string, titulo: string) => {
    const res = await request(http).post('/api/v1/checks').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, kind, titulo });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

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
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ person_id: ids.recusou }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa'
        ORDER BY person_id LIMIT 1`, [ids.AI3]));
    ({ rows: [{ person_id: ids.outro }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa'
        ORDER BY person_id OFFSET 1 LIMIT 1`, [ids.AI3]));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== O ato ====================

  it('a chamada diz se aceita conferência de mesa, e com qual opção', async () => {
    ids.almoco = await abrir('alimentacao', 'Almoço do ensaio da conferência de mesa');
    const c = await ver(ids.almoco);
    expect(c.aceitaConferenciaDeMesa).toBe(true);
    // A opção da mesa é a NÃO-EXCEÇÃO do tipo; exceção exige o fato por criança.
    expect(c.opcaoDaMesa).toBe('normal');
    expect(c.opcoes.find((o: any) => o.code === c.opcaoDaMesa).excecao).toBe(false);
    expect(c.conferenciasDeMesa).toEqual([]);
  });

  it('não sobrescreve quem já foi marcado — nem a criança que recusou', async () => {
    const marcou = await request(http).post(`/api/v1/checks/${ids.almoco}/mark`)
      .set(auth(tokens.educador))
      .send({ personId: ids.recusou, opcao: 'recusou',
              nota: 'Disse que estava sem fome; comeu a fruta e foi para o quarto.' });
    expect(marcou.status).toBe(201);

    const antes = await ver(ids.almoco);
    const pendentes = antes.faltam;
    expect(pendentes).toBeGreaterThan(1);

    const res = await request(http).post(`/api/v1/checks/${ids.almoco}/bulk`)
      .set(auth(tokens.educador)).send({});
    expect(res.status).toBe(201);
    expect(res.body.marcados).toBe(pendentes);
    expect(res.body.aviso).toMatch(/não foi tocado/i);
    ids.mesa = res.body.id;

    const depois = await ver(ids.almoco);
    expect(depois.faltam).toBe(0);
    // A exceção continua exatamente como foi escrita.
    const oQueRecusou = depois.linhas.find((l: any) => l.acolhidoId === ids.recusou);
    expect(oQueRecusou.resultado).toBe('recusou');
    expect(oQueRecusou.justificativa).toMatch(/sem fome/);
    expect(oQueRecusou.naConferenciaDeMesa).toBe(false);
  });

  it('o ato fica gravado COMO ato: quem, quando e quantos', async () => {
    const c = await ver(ids.almoco);
    expect(c.conferenciasDeMesa).toHaveLength(1);
    const mesa = c.conferenciasDeMesa[0];
    expect(mesa.opcao).toBe('normal');
    expect(mesa.por).toBeTruthy();
    expect(mesa.quando).toBeTruthy();
    expect(mesa.quantos).toBeGreaterThan(1);

    // E as linhas que nasceram dele apontam para ele: é o que separa isto de
    // uma marcação em lote silenciosa.
    const daMesa = c.linhas.filter((l: any) => l.naConferenciaDeMesa);
    expect(daMesa).toHaveLength(mesa.quantos);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM check_result
        WHERE check_id = $1 AND bulk_id = $2`, [ids.almoco, ids.mesa]);
    expect(rows[0].n).toBe(mesa.quantos);
  });

  it('o banco recusa alterar ou apagar o ato — ele aconteceu', async () => {
    await expect(admin.query(
      `UPDATE check_bulk SET quantos = 1 WHERE id = $1`, [ids.mesa])).rejects.toThrow();
    await expect(admin.query(
      `DELETE FROM check_bulk WHERE id = $1`, [ids.mesa])).rejects.toThrow();
  });

  it('conferir de novo, sem ninguém pendente, é recusado', async () => {
    const res = await request(http).post(`/api/v1/checks/${ids.almoco}/bulk`)
      .set(auth(tokens.educador)).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/já foram conferidos/i);
  });

  // ==================== A correção ====================

  it('corrigir uma linha da mesa a torna individual, e guarda o que constava', async () => {
    const res = await request(http).post(`/api/v1/checks/${ids.almoco}/mark`)
      .set(auth(tokens.educador))
      .send({ personId: ids.outro, opcao: 'parcial',
              nota: 'Comeu só o arroz; pediu para guardar o resto para depois.' });
    expect(res.status).toBe(201);

    const c = await ver(ids.almoco);
    const linha = c.linhas.find((l: any) => l.acolhidoId === ids.outro);
    expect(linha.resultado).toBe('parcial');
    // Alguém olhou ESTA criança: a procedência para de dizer "na mesa".
    expect(linha.naConferenciaDeMesa).toBe(false);

    // E o gatilho de histórico (0670) guardou o que constava antes.
    const { rows } = await admin.query(
      `SELECT option_code FROM check_result_amendment
        WHERE check_id = $1 AND person_id = $2`, [ids.almoco, ids.outro]);
    expect(rows.map((r) => r.option_code)).toContain('normal');

    // A contagem do ato NÃO muda: ela é o que a pessoa confirmou naquele
    // momento, e não um número recalculado quando alguém corrige amanhã.
    expect(c.conferenciasDeMesa[0].quantos).toBe(
      c.linhas.filter((l: any) => l.naConferenciaDeMesa).length + 1);
  });

  /* =======================================================================
   * A PRESENÇA CHEGA À VIDA DA CRIANÇA (fase 110).
   *
   * `check_result` só era lido DENTRO da própria chamada: para saber se a
   * criança esteve no almoço de terça, alguém abria a chamada daquele almoço
   * (§9, item 4). E `check_result_amendment` — o que constava antes da
   * correção, guardado por gatilho desde a 0670 — não era lido por NADA.
   * ==================================================================== */
  it('a presença de uma criança abre por ela, com a exceção e a correção', async () => {
    const p = await request(http)
      .get(`/api/v1/checks/person/${ids.outro}?dias=14`)
      .set(auth(tokens.educador));
    expect(p.status).toBe(200);

    const doAlmoco = (p.body.linhas as any[]).find((l) => l.chamadaId === ids.almoco);
    expect(doAlmoco).toBeDefined();

    /* O RÓTULO, e não o código: "parcial" na tela de uma criança é uma palavra
       que ninguém fora do sistema entende. */
    expect(doAlmoco.resultado).toBe('Parcial');
    expect(doAlmoco.excecao).toBe(true);
    /* A EXCEÇÃO VEM COM O QUE FOI ESCRITO: sem a frase, "parcial" é um rótulo
       que atravessa meses (§8.14). */
    expect(doAlmoco.justificativa).toMatch(/arroz/i);
    /* E com o nome de quem registrou — toda ação tem autor (regra 6). */
    expect(doAlmoco.por).toBeTruthy();
    /* E com a DATA: sem ela a linha não se situa na vida da criança, e era
       para isso que este bloco existia. */
    expect(doAlmoco.quando).toBeTruthy();

    /* A CORREÇÃO VEM JUNTO: antes constava "Normal", da conferência de mesa. */
    expect(doAlmoco.correcoes.length).toBeGreaterThan(0);
    expect(doAlmoco.correcoes[0].antes).toBe('Normal');
    expect(doAlmoco.correcoes[0].corrigidoPor).toBeTruthy();
  });

  it('a presença NÃO conta nada — nem falta, nem recusa, nem percentual', async () => {
    const p = await request(http)
      .get(`/api/v1/checks/person/${ids.outro}`)
      .set(auth(tokens.educador)).expect(200);

    /*
     * Um número desses na tela de uma criança de doze anos é o começo de uma
     * ficha de comportamento (regra 3), e o motivo é o do §8.7.2: o número
     * viaja, e a frase que o explicava fica para trás. Este teste guarda isso
     * por FORMA — se alguém acrescentar `totalDeFaltas`, ele reprova.
     */
    const chaves = Object.keys(p.body);
    expect(chaves.sort()).toEqual(['dias', 'linhas']);
    for (const l of p.body.linhas as any[]) {
      const proibido = Object.keys(l).filter((k) =>
        /total|quantidade|percentual|faltas|recusas|contagem|score|pontos/i.test(k));
      expect(proibido).toEqual([]);
    }
  });

  // ==================== Onde ela não vale ====================

  it('a chamada final do turno é um a um, e a recusa diz por quê', async () => {
    const final = await abrir('chamada_final', 'Chamada final do ensaio');
    const c = await ver(final);
    expect(c.aceitaConferenciaDeMesa).toBe(false);
    expect(c.avisoDaMesa).toMatch(/contar as crianças/i);

    const res = await request(http).post(`/api/v1/checks/${final}/bulk`)
      .set(auth(tokens.educador)).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/um a um/i);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM check_result WHERE check_id = $1`, [final]);
    expect(rows[0].n).toBe(0);
  });

  it('chamada confirmada não recebe conferência de mesa', async () => {
    const conf = await request(http).post(`/api/v1/checks/${ids.almoco}/confirm`)
      .set(auth(tokens.educador)).send({});
    expect(conf.status).toBe(201);

    const res = await request(http).post(`/api/v1/checks/${ids.almoco}/bulk`)
      .set(auth(tokens.educador)).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/confirmada/i);

    const c = await ver(ids.almoco);
    expect(c.aceitaConferenciaDeMesa).toBe(false);
  });

  /**
   * QUEM ABRIU E QUEM FECHOU A CHAMADA (fase 113).
   *
   * `created_by` e `confirmed_by` existiam desde a migração 0120 e nenhuma
   * consulta os lia — a varredura da fase 106 os listou entre as pontas
   * soltas (§9, item 5). A tela dizia "Chamada confirmada" e nada mais.
   *
   * Confirmar não é ato administrativo: é alguém afirmando que olhou todas as
   * crianças da casa. Num sistema em que cada MARCAÇÃO tem nome por regra
   * (§8.2), o fecho sem nome era a única assinatura que faltava — e a
   * conferência de mesa, que é um ato menor, já trazia a dela.
   */
  it('quem abriu e quem fechou a chamada têm nome na resposta', async () => {
    const { rows: [quem] } = await admin.query(
      `SELECT app_user_display_name(id) AS nome FROM app_user
        WHERE email = 'educador.ai3@paodospobres.dev'`);

    const c = await ver(ids.almoco);
    expect(c.status).toBe('confirmada');
    expect(c.abertaPor).toBe(quem.nome);
    expect(c.abertaEm).toBeTruthy();
    // O fecho é o que faltava: nome e horário de quem disse "está tudo conferido".
    expect(c.confirmadaPor).toBe(quem.nome);
    expect(c.confirmadaEm).toBeTruthy();

    // E é o mesmo que o banco guardou — a tela não inventa a autoria.
    const { rows: [k] } = await admin.query(
      `SELECT app_user_display_name(created_by)   AS abriu,
              app_user_display_name(confirmed_by) AS fechou
         FROM collective_check WHERE id = $1`, [ids.almoco]);
    expect(k.abriu).toBe(c.abertaPor);
    expect(k.fechou).toBe(c.confirmadaPor);
  });

  it('a chamada ainda aberta não inventa quem a fechou', async () => {
    const nova = await abrir('alimentacao', 'Café do ensaio da autoria');
    const c = await ver(nova);
    expect(c.status).toBe('aberta');
    expect(c.abertaPor).toBeTruthy();
    // Nem string vazia, nem o nome de quem abriu: ninguém fechou ainda.
    expect(c.confirmadaPor).toBeNull();
    expect(c.confirmadaEm).toBeNull();
  });

  it('tudo ficou auditado, com autor e com a casa (regra 6)', async () => {
    const { rows } = await admin.query(
      `SELECT action, actor_id, house_id, detail FROM audit_event
        WHERE action = 'check.bulk' AND entity_id = $1`, [ids.almoco]);
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBeTruthy();
    expect(rows[0].house_id).toBe(ids.AI3);
    expect(rows[0].detail.opcao).toBe('normal');
  });
});
