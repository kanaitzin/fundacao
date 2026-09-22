/**
 * O PAINEL DO GESTOR CONTA O CONCEITO DO BIMESTRE (migração 1450).
 *
 * A caixa pedida em 09/09/2026 era *"quantas crianças tiveram boas notas"*. O
 * painel respondeu com a verdade da época — **nota não existe neste sistema** — e
 * mostrou apoio educacional e evoluções escritas. A fase 137 criou o **conceito
 * por bimestre**; esta suíte cobra que ele passe a ser contado, e que seja contado
 * do jeito certo:
 *
 *   * **pelo BIMESTRE que encosta na janela**, e não pela data de digitação: o
 *     conceito do 3º bimestre lançado em novembro conta no 3º, porque o retorno
 *     atrasado da escola é o caso comum;
 *   * **uma vez por criança**: a versão corrigida é história, e somá-la faria a
 *     criança contar duas vezes — uma pelo que se pensava dela em agosto, outra
 *     pelo que se soube em setembro;
 *   * **duas caixas, e a segunda é a que age**: quem acompanha, e quem não
 *     acompanha. Um painel que mostrasse só quem vai bem ensinaria a olhar para o
 *     lado bom, e a criança que precisa de reforço não apareceria em lugar nenhum;
 *   * **"acompanha com apoio" NÃO vira caixa** — é uma criança que está
 *     acompanhando, e o apoio já tem a caixa dele desde a 1280.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O painel conta o conceito do bimestre', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  /** O 1º bimestre de um ano fictício que já passou — janela só desta suíte. */
  const ANO = 2024;
  const DE = `${ANO}-01-01`;
  const ATE = `${ANO}-03-31`;

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const painel = (de = DE, ate = ATE) =>
    request(http).get(`/api/v1/reports/metrics?de=${de}&ate=${ate}`).set(auth(tokens.gestor));

  /** Escreve um conceito direto no banco, como se a equipe o tivesse digitado. */
  const conceito = async (personId: string, bimestre: number, valor: string) => {
    const { rows: [r] } = await admin.query(
      `INSERT INTO education_concept
         (person_id, house_id, ano, bimestre, conceito, motivo, created_by)
       VALUES ($1, $2, $3, $4, $5,
               'Motivo fictício desta suíte, escrito por extenso para passar do piso.',
               (SELECT id FROM app_user WHERE email='tecnica.ai3@paodospobres.dev'))
       RETURNING id`, [personId, ids.AI3, ANO, bimestre, valor]);
    return r.id as string;
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

    tokens.gestor = await login('gestor@paodospobres.dev');
    tokens.tecnica = await login('tecnica.ai3@paodospobres.dev');

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows: criancas } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name LIMIT 4`, [ids.AI3]);
    [ids.a, ids.b, ids.c, ids.d] = criancas.map((r: any) => r.id);
  });

  afterAll(async () => {
    /* Um banco só: o que esta suíte escreve, ela apaga (a lição da fase 127). */
    await admin.query(`DELETE FROM education_concept WHERE ano = $1`, [ANO]);
    await app.close(); await admin.end();
  });

  it('a caixa nasce em zero quando ninguém escreveu conceito no período', async () => {
    const r = await painel();
    expect(r.status).toBe(200);
    const casa = r.body.casas.find((c: any) => c.id === ids.AI3);
    /* Zero aqui quer dizer "ninguém escreveu", e não "vai mal" — é a mesma
       distinção que o §8.12 cobra da lista vazia. */
    expect(casa.conceitoAcompanha).toBe(0);
    expect(casa.conceitoNaoAcompanha).toBe(0);
  });

  it('conta quem está acompanhando e quem NÃO está, em caixas separadas', async () => {
    await conceito(ids.a, 1, 'acompanha');
    await conceito(ids.b, 1, 'acompanha');
    await conceito(ids.c, 1, 'nao_acompanha');

    const casa = (await painel()).body.casas.find((c: any) => c.id === ids.AI3);
    expect(casa.conceitoAcompanha).toBe(2);
    expect(casa.conceitoNaoAcompanha).toBe(1);
  });

  it('"acompanha com apoio" não entra em nenhuma das duas caixas', async () => {
    await conceito(ids.d, 1, 'acompanha_com_apoio');
    const casa = (await painel()).body.casas.find((c: any) => c.id === ids.AI3);
    /* Ela ESTÁ acompanhando, e o apoio já tem a caixa dele — contá-la aqui faria
       a mesma criança aparecer em duas caixas que somam coisas diferentes. */
    expect(casa.conceitoAcompanha).toBe(2);
    expect(casa.conceitoNaoAcompanha).toBe(1);
  });

  it('a versão CORRIGIDA não soma: conta uma vez por criança', async () => {
    /*
     * A equipe se corrige: quem estava "não acompanhando" passou a acompanhar.
     *
     * **Pela ROTA, e não pela conexão de dono.** Chamar a função com o `admin`
     * parecia mais curto e recusava com `acolhido_fora_de_escopo`, porque a
     * conexão de dono não tem `app.user_id` — o RLS não sabe quem está
     * perguntando. O caminho certo é o mesmo que a equipe usa; e um teste que
     * escreve por fora da rota testa uma coisa que ninguém faz.
     */
    const correcao = await request(http)
      .post(`/api/v1/nursing/education/${ids.c}/concepts`)
      .set(auth(tokens.tecnica))
      .send({ ano: ANO, bimestre: 1, conceito: 'acompanha',
              motivo: 'A escola devolveu o retorno depois: recuperou as notas no reforço.' });
    expect(correcao.status).toBe(201);

    const casa = (await painel()).body.casas.find((c: any) => c.id === ids.AI3);
    /* Três acompanhando (as duas de antes e a corrigida), e NENHUMA na caixa de
       providência — a versão antiga continua na tabela, e não conta. */
    expect(casa.conceitoAcompanha).toBe(3);
    expect(casa.conceitoNaoAcompanha).toBe(0);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM education_concept
        WHERE person_id = $1 AND ano = $2 AND bimestre = 1`, [ids.c, ANO]);
    expect(rows[0].n).toBe(2);   // as duas versões continuam legíveis
  });

  it('o BIMESTRE manda, e não a data em que alguém digitou', async () => {
    /* Um conceito do 4º bimestre — digitado agora, como o retorno atrasado da
       escola chega — NÃO pode aparecer na janela do 1º. */
    await conceito(ids.a, 4, 'nao_acompanha');

    const noPrimeiro = (await painel()).body.casas.find((c: any) => c.id === ids.AI3);
    expect(noPrimeiro.conceitoNaoAcompanha).toBe(0);

    /* E aparece quando a janela é a do 4º bimestre. */
    const noQuarto = (await painel(`${ANO}-10-01`, `${ANO}-12-31`))
      .body.casas.find((c: any) => c.id === ids.AI3);
    expect(noQuarto.conceitoNaoAcompanha).toBe(1);
  });

  it('o total da instituição soma as casas, e a ressalva diz o que o número é', async () => {
    const r = await painel();
    const soma = r.body.casas.reduce((t: number, c: any) => t + c.conceitoAcompanha, 0);
    expect(r.body.total.conceitoAcompanha).toBe(soma);

    const texto = r.body.ressalvas.join(' ');
    /* A frase que envelheceu duas vezes: ela tem de dizer o que o painel conta
       HOJE, e não o que ele contava. */
    expect(texto).toMatch(/não existe nota escolar/i);
    expect(texto).toMatch(/CONCEITO do bimestre/);
    expect(texto).toMatch(/conta pelo BIMESTRE/);
    expect(texto).not.toMatch(/ainda não o conta/i);
  });
});
