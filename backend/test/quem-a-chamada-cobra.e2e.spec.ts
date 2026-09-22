/**
 * QUEM A CHAMADA COBRA (migração 1350).
 *
 * O DEFEITO QUE ESTA SUÍTE EXISTE PARA GUARDAR, medido pelas rotas em
 * 20/09/2026: quem a chamada cobra estava escrito em QUATRO lugares, e só um
 * deles sabia que a criança pode não estar na casa.
 *
 *   * `checks.service.ts`, a lista que a tela mostra — excluía quem está
 *     internado (0890) e quem está em casa com a família (1010);
 *   * `app_bulk_check` (0780), `app_confirm_check` e `app_check_missing`
 *     (0440) — nenhuma das três excluía. Nasceram antes de a internação e a
 *     convivência familiar existirem, e ninguém voltou para lhes contar.
 *
 * O que a educadora via, e é por isso que o defeito importa:
 *
 *   1. a conferência de mesa gravava `normal` para a criança que estava no
 *      HOSPITAL — um registro dizendo que ela almoçou na casa. **Um fato
 *      inventado sobre uma criança**, e silencioso: a tela dizia `faltam: 0`;
 *   2. a chamada final NÃO FECHAVA. O fechamento cobrava pelo nome uma criança
 *      que a tela se recusava a listar, e **a educadora das 22h não tinha por
 *      onde sair** — marcar era impossível, e fechar também.
 *
 * POR QUE NENHUMA SUÍTE PEGAVA ISSO. `hospitalization` e `family_stay` chegam
 * **vazias do seed**: no dado de partida ninguém está fora da casa, então
 * nenhuma suíte encontrava a situação. Quem achou o defeito foi um rascunho que
 * criava a própria internação — e enquanto ele morou em `backend/test/`, ele
 * contaminou o banco compartilhado e derrubou três testes de
 * `conferencia-de-mesa`, que foram lidos como o defeito em vez de como o seu
 * eco. Esta suíte **fecha o que abre**, e é por isso.
 *
 * E ela cobra a propriedade que a correção promete: a chamada responde pelo
 * **DIA a que se refere**, não por "agora". A chamada de ontem, reaberta hoje
 * para correção, precisa saber como a casa estava ONTEM.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Quem a chamada cobra', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const ver = async (id: string) =>
    (await request(http).get(`/api/v1/checks/${id}`).set(auth(tokens.educador))).body;
  const abrir = async (kind: string, titulo: string) => {
    const res = await request(http).post('/api/v1/checks').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, kind, titulo });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };
  /** Marca, uma a uma, todas as crianças que a TELA oferece. É o gesto real. */
  const marcarTodasAsQueATelaOferece = async (checkId: string) => {
    const c = await ver(checkId);
    for (const l of c.linhas.filter((x: any) => !x.resultado)) {
      const r = await request(http).post(`/api/v1/checks/${checkId}/mark`).set(auth(tokens.educador))
        .send({ personId: l.acolhidoId, opcao: c.opcoes[0].code });
      expect(r.status).toBe(201);
    }
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
      tecnica: 'tecnica.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    /* Duas crianças da Casa 03, escolhidas pelo FIM da ordem alfabética: as do
       começo são as que as outras suítes usam, e duas suítes mexendo na mesma
       criança é o defeito que esta suíte foi escrita para não repetir. */
    const { rows: escolhidas } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name DESC LIMIT 2`, [ids.AI3]);
    ids.internada = escolhidas[0].id;
    ids.comAFamilia = escolhidas[1].id;

    /* A saída para convivência aponta para um contato JÁ CADASTRADO — digitar o
       nome à mão permitiria escrever qualquer um (1010). E o seed não traz
       contato nenhum na Casa 03, então a suíte cria o dela, como a
       `experiencia-familiar` já faz. */
    const { rows: [contato] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, phone)
       VALUES ($1, 'Contato Fictício de Quem a Chamada Cobra', 'genitora', '51 90000-0000')
       RETURNING id`, [ids.comAFamilia]);
    ids.contato = contato.id;
  });

  /*
   * A REDE DE SEGURANÇA, e ela é a lição do dia em que este defeito foi achado.
   *
   * Um teste que falhe no meio deixaria uma internação ou uma saída ABERTA, e
   * nada se apaga neste sistema: a próxima suíte a rodar encontraria uma
   * criança a menos na Casa 03 e reprovaria por um motivo que não é dela. Foi
   * exatamente isso que fez três testes de `conferencia-de-mesa` serem lidos
   * como o defeito. Aqui o fecho é por SQL de dono, de propósito — ele precisa
   * funcionar mesmo que a rota seja o que está quebrado.
   */
  afterAll(async () => {
    await admin.query(
      `UPDATE hospitalization SET status='encerrada', ended_at=now(), outcome='alta'
        WHERE status='em_andamento' AND house_id = $1`, [ids.AI3]);
    /* `encerrada`, e não `retornou`: são os dois únicos valores que a
       `family_stay_status_check` aceita, e esta rede de segurança passou da
       fase 127 até a 141 com o valor errado — ela só nunca estourou porque o
       teste do retorno fechava a saída antes, pela rota. Rede que só funciona
       quando nada deu errado não é rede (achado de passagem, fase 141). */
    await admin.query(
      `UPDATE family_stay SET status='encerrada', returned_at=now()
        WHERE returned_at IS NULL AND house_id = $1`, [ids.AI3]);
    /* Contato NÃO se apaga — `contato_nao_e_apagado`, e a regra está certa: um
       contato encerrado guarda o motivo, e apagar levaria o motivo junto.
       Encerrar é o que a tela faz. */
    await admin.query(
      `UPDATE person_contact SET active = false,
              ended_reason = 'Contato fictício criado pela suíte de teste.'
        WHERE id = $1`, [ids.contato]);
    await app.close();
    await admin.end();
  });

  // ============ A criança que está no hospital ============

  it('abrir a internação tira a criança da chamada — na tela E no lote', async () => {
    const semInternacao = await ver(await abrir('alimentacao', 'Café antes da internação'));
    const efetivoAntes = semInternacao.faltam;

    const r = await request(http).post('/api/v1/nursing/hospitalizations').set(auth(tokens.tecnica))
      .send({ personId: ids.internada, houseId: ids.AI3, hospital: 'Hospital Fictício da Suíte',
              motivo: 'Internação fictícia para guardar o defeito da chamada.' });
    expect(r.status).toBe(201);
    ids.internacao = r.body.id;

    const almoco = await abrir('alimentacao', 'Almoço com uma criança no hospital');
    const c = await ver(almoco);

    /* A tela cobra uma criança a menos, e ela não está na lista. */
    expect(c.faltam).toBe(efetivoAntes - 1);
    expect(c.linhas.map((l: any) => l.acolhidoId)).not.toContain(ids.internada);

    /* E o LOTE cobra a MESMA lista — era aqui que ele marcava 19 de 18. */
    const lote = await request(http).post(`/api/v1/checks/${almoco}/bulk`)
      .set(auth(tokens.educador)).send({});
    expect(lote.status).toBe(201);
    expect(lote.body.marcados).toBe(c.faltam);

    /* O que o defeito gravava: uma linha dizendo que ela almoçou na casa. */
    const { rows } = await admin.query(
      `SELECT option_code FROM check_result WHERE check_id = $1 AND person_id = $2`,
      [almoco, ids.internada]);
    expect(rows).toHaveLength(0);
  });

  it('e a chamada final FECHA — era isto que travava o fim do plantão', async () => {
    const chamada = await abrir('chamada_final', 'Chamada final com uma criança no hospital');
    await marcarTodasAsQueATelaOferece(chamada);

    const depois = await ver(chamada);
    expect(depois.faltam).toBe(0);

    const fechou = await request(http).post(`/api/v1/checks/${chamada}/confirm`)
      .set(auth(tokens.educador));
    expect(fechou.status).toBe(201);
  });

  it('a alta devolve a criança à chamada no MESMO dia — o dia da alta é dia de casa', async () => {
    const r = await request(http).post(`/api/v1/nursing/hospitalizations/${ids.internacao}/close`)
      .set(auth(tokens.tecnica))
      .send({ desfecho: 'alta', observacao: 'Alta fictícia, para a criança voltar à chamada.' });
    expect(r.status).toBe(201);

    const c = await ver(await abrir('alimentacao', 'Janta depois da alta'));
    expect(c.linhas.map((l: any) => l.acolhidoId)).toContain(ids.internada);
  });

  // ============ A criança que está em casa com a família ============

  it('a criança em casa com a família também não é cobrada, e a chamada fecha', async () => {
    const agora = new Date();
    const saida = await request(http).post('/api/v1/people/family-stays').set(auth(tokens.tecnica))
      .send({ personId: ids.comAFamilia, contatoId: ids.contato,
              inicio: agora.toISOString(),
              retornoPrevisto: new Date(agora.getTime() + 36e5 * 48).toISOString(),
              finalidade: 'Convivência fictícia para guardar o defeito da chamada.' });
    expect(saida.status).toBe(201);
    ids.saida = saida.body.id;

    const chamada = await abrir('chamada_final', 'Chamada final com uma criança em casa');
    const c = await ver(chamada);
    expect(c.linhas.map((l: any) => l.acolhidoId)).not.toContain(ids.comAFamilia);

    await marcarTodasAsQueATelaOferece(chamada);
    const fechou = await request(http).post(`/api/v1/checks/${chamada}/confirm`)
      .set(auth(tokens.educador));
    expect(fechou.status).toBe(201);

    /* E o retorno a devolve — o dia do retorno já conta como de volta (1010). */
    const volta = await request(http).post(`/api/v1/people/family-stays/${ids.saida}/return`)
      .set(auth(tokens.tecnica))
      .send({ quando: new Date().toISOString(), nota: 'Chegou bem, fictícia.' });
    expect(volta.status).toBe(201);

    const depois = await ver(await abrir('alimentacao', 'Café depois da volta'));
    expect(depois.linhas.map((l: any) => l.acolhidoId)).toContain(ids.comAFamilia);
  });

  // ============ Por DIA, e não por "agora" ============

  /*
   * A chamada de ontem, reaberta hoje, precisa saber como a casa estava ONTEM.
   * As duas funções de presença já respondiam por dia (0890 e 1010) e estavam
   * sendo chamadas SEM dia — quer dizer, sempre sobre hoje. A 1350 passa a
   * lhes dar o dia da chamada.
   *
   * A chamada de ontem se cria por SQL de dono porque a rota abre chamada para
   * HOJE, e é isso que ela deve fazer: uma rota que aceitasse data livre
   * deixaria qualquer pessoa registrar café da semana passada.
   */
  it('a chamada responde pelo DIA dela: internada ontem, cobrada hoje', async () => {
    const { rows: [{ ontem, anteontem }] } = await admin.query(
      `SELECT (app_hoje() - 1) AS ontem, (app_hoje() - 2) AS anteontem`);

    /*
     * Internada ANTEONTEM, com alta HOJE — e as duas pontas importam.
     *
     * Ontem ela estava no hospital, então a chamada de ontem não a cobra. HOJE
     * é o dia da alta, e **o dia da alta é dia de casa** (0890): a criança que
     * recebe alta às dez da manhã almoça aqui e dorme aqui, e contar o dia da
     * alta como internada a deixaria invisível na chamada do próprio dia em que
     * voltou. Então hoje ela é cobrada.
     *
     * *Escrito depois de errar: a primeira versão desta fixture dava entrada e
     * alta no MESMO dia e esperava que a criança não fosse cobrada nele — que é
     * exatamente o contrário do que a 0890 decidiu, por escrito, e com o motivo.
     * A regra estava certa; a fixture estava errada.*
     */
    await admin.query(
      `INSERT INTO hospitalization
         (person_id, house_id, hospital, reason, started_at, ended_at, outcome, status, opened_by)
       VALUES ($1, $2, 'Hospital Fictício de Anteontem',
               'Internação fictícia de dois dias, com alta hoje.',
               ($3::date + time '08:00') AT TIME ZONE app_fuso(),
               (app_hoje()::date + time '10:00') AT TIME ZONE app_fuso(),
               'alta', 'encerrada',
               (SELECT id FROM app_user WHERE email = 'tecnica.ai3@paodospobres.dev'))`,
      [ids.internada, ids.AI3, anteontem]);

    /* HOJE ela é cobrada: é o dia da alta, e o dia da alta é dia de casa. */
    const hoje = await ver(await abrir('alimentacao', 'Café de hoje, com alta hoje de manhã'));
    expect(hoje.linhas.map((l: any) => l.acolhidoId)).toContain(ids.internada);

    /* E a chamada de ONTEM não a cobra, porque ontem ela estava no hospital. */
    const { rows: [deOntem] } = await admin.query(
      `INSERT INTO collective_check (house_id, kind, title, reference_at, status, created_by)
       VALUES ($1, 'alimentacao', 'Almoço de ontem, reaberto para correção',
               ($2::date + time '12:00') AT TIME ZONE app_fuso(), 'aberta',
               (SELECT id FROM app_user WHERE email = 'educador.ai3@paodospobres.dev'))
       RETURNING id`, [ids.AI3, ontem]);

    const { rows: efetivoDeOntem } = await admin.query(
      `SELECT person_id FROM app_efetivo_da_chamada($1)`, [deOntem.id]);
    expect(efetivoDeOntem.map((r: any) => r.person_id)).not.toContain(ids.internada);

    /* A de hoje, a mesma função, cobra. É a MESMA lista das três funções do
       banco e da tela — e é o argumento da migração inteira. */
    const { rows: [hojeCheck] } = await admin.query(
      `SELECT id FROM collective_check WHERE house_id = $1 AND status = 'aberta'
         AND (coalesce(reference_at, created_at) AT TIME ZONE app_fuso())::date = app_hoje()
       ORDER BY created_at DESC LIMIT 1`, [ids.AI3]);
    const { rows: efetivoDeHoje } = await admin.query(
      `SELECT person_id FROM app_efetivo_da_chamada($1)`, [hojeCheck.id]);
    expect(efetivoDeHoje.map((r: any) => r.person_id)).toContain(ids.internada);
  });
});
