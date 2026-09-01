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
