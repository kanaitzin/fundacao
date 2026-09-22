/**
 * A CRIANÇA FORA DA CASA SAI DA GRADE DO DIA (migração 1470).
 *
 * O DEFEITO QUE ESTA SUÍTE EXISTE PARA GUARDAR, medido em 22/09/2026 com o
 * Bruno internado desde o dia anterior: `app_generate_day` criou para ele o
 * "Reforço escolar" das 10h no estado `aguardando_ciencia`. Uma pendência
 * pedindo que o plantão dê ciência da atividade de uma criança que está no
 * hospital — e, uma hora depois, `app_mark_unconfirmed_ids` marcava o item como
 * "sem confirmação" e ESCALAVA, em prioridade alta, para a coordenação e a
 * equipe técnica: *"1 atividade venceu sem registro nesta casa"*.
 *
 * É O MESMO DEFEITO DA FASE 127, na superfície que faltou. A chamada aprendeu
 * na 1350 que a criança pode não estar na casa; a Enfermagem já sabia desde a
 * 0200, com o argumento escrito — *"uma tela cheia de pendência impossível é
 * uma tela que a equipe aprende a não olhar"*. A GRADE DO DIA não sabia:
 * `app_generate_day` (0110, refeita na 0400) nasceu antes da internação (0890)
 * e da convivência familiar (1010), e pergunta só se o acolhido está ATIVO na
 * casa — e a criança internada continua ativa, que é justamente o ponto.
 *
 * O QUE A CORREÇÃO NÃO FAZ, e a suíte cobra as duas coisas: o item **não é
 * apagado** nem marcado como não realizado — o sistema não conclui que ele não
 * aconteceu, porque não sabe —, e a atividade **coletiva não muda**. O café da
 * manhã da casa acontece com dezenove crianças do mesmo jeito que com vinte.
 *
 * ELA FECHA O QUE ABRE, como a `quem-a-chamada-cobra`, e pela mesma razão: um
 * teste que falhe no meio deixaria uma internação aberta, e nada se apaga neste
 * sistema — a próxima suíte encontraria uma criança a menos na Casa 03 e
 * reprovaria por um motivo que não é dela.
 *
 * E ELA TRABALHA NUM DIA DISTANTE, de propósito. Gerar a grade de HOJE mexeria
 * na grade que as outras suítes leem; um dia a quarenta dias daqui não é de
 * ninguém.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A criança fora da casa sai da grade do dia', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  /** O dia distante, e o de depois — dois dias limpos, um para cada ausência. */
  let diaInternada = '', diaFamilia = '';

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const gerar = async (dia: string) => {
    const r = await request(http).post('/api/v1/activities/generate-day')
      .set(auth(tokens.lider)).send({ houseId: ids.AI3, date: dia });
    expect(r.status).toBe(201);
    return r.body;
  };
  const grade = async (dia: string) => {
    const r = await request(http).get(`/api/v1/activities?houseId=${ids.AI3}&date=${dia}`)
      .set(auth(tokens.educador));
    expect(r.status).toBe(200);
    return r.body as any[];
  };
  const doBruno = (lista: any[]) => lista.filter((a) => a.acolhido?.id === ids.bruno);
  const coletivas = (lista: any[]) => lista.filter((a) => a.coletiva);

  /** Apaga só o que a suíte gerou, nos dois dias distantes. */
  const limparOsDiasDistantes = async () => {
    for (const dia of [diaInternada, diaFamilia].filter(Boolean)) {
      await admin.query(
        `DELETE FROM activity
          WHERE house_id = $1
            AND (scheduled_at AT TIME ZONE app_fuso())::date = $2::date`, [ids.AI3, dia]);
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
      lider: 'lider.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));

    /*
     * A ROTINA DA CASA CHEGA VAZIA DO SEED — e é ESTA a razão pela qual o
     * defeito sobreviveu quarenta fases. `routine_item` tem zero linhas no dado
     * de partida, então nenhuma suíte nunca gerou uma grade com item
     * INDIVIDUAL: `app_generate_day` era exercitada só no pedaço coletivo, que
     * é justamente o que a correção não muda. É o mesmo desenho do defeito da
     * fase 127, em que `hospitalization` e `family_stay` chegavam vazias.
     *
     * Então a suíte monta a rotina que vai medir, e desmonta depois.
     */
    const { rows: [vigente] } = await admin.query(
      `SELECT id FROM routine_version WHERE house_id = $1 AND valid_to IS NULL LIMIT 1`,
      [ids.AI3]);
    if (vigente) {
      ids.versao = vigente.id;
    } else {
      const { rows: [nova] } = await admin.query(
        `INSERT INTO routine_version (house_id, number, valid_from)
         VALUES ($1, coalesce((SELECT max(number) + 1 FROM routine_version WHERE house_id = $1), 1),
                 app_hoje())
         RETURNING id`, [ids.AI3]);
      ids.versao = nova.id;
      ids.versaoEMinha = 'sim';
    }

    /* A criança NÃO é uma das duas do fim do alfabeto: aquelas são as da
       `quem-a-chamada-cobra`, e duas suítes na mesma criança é o defeito que
       aquela suíte foi escrita para não repetir. Esta pega a terceira. */
    const { rows: [crianca] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name DESC OFFSET 2 LIMIT 1`, [ids.AI3]);
    ids.bruno = crianca.id;
    ids.tituloIndividual = 'Reforço escolar da suíte da grade';

    const { rows: [individual] } = await admin.query(
      `INSERT INTO routine_item (version_id, house_id, kind, title, start_time,
                                 weekdays, collective, person_id, requires_ack)
       VALUES ($1, $2, 'escola', $4, '10:00', '{0,1,2,3,4,5,6}', false, $3, true)
       RETURNING id`, [ids.versao, ids.AI3, ids.bruno, ids.tituloIndividual]);
    ids.itemIndividual = individual.id;

    /* E um item COLETIVO, porque a suíte cobra que ele NÃO mude. */
    const { rows: [coletivo] } = await admin.query(
      `INSERT INTO routine_item (version_id, house_id, kind, title, start_time,
                                 weekdays, collective, person_id, requires_ack)
       VALUES ($1, $2, 'refeicao', 'Café da manhã da suíte da grade', '07:00',
               '{0,1,2,3,4,5,6}', true, NULL, false)
       RETURNING id`, [ids.versao, ids.AI3]);
    ids.itemColetivo = coletivo.id;

    const { rows: [d] } = await admin.query(
      `SELECT (app_hoje() + 40)::text AS a, (app_hoje() + 41)::text AS b`);
    diaInternada = d.a; diaFamilia = d.b;

    /* O contato para a saída familiar: o seed não traz contato na Casa 03, e a
       1010 exige um JÁ CADASTRADO — digitar o nome à mão deixaria escrever
       qualquer um. */
    const { rows: [contato] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, phone)
       VALUES ($1, 'Contato Fictício da Grade do Dia', 'genitora', '51 90000-0001')
       RETURNING id`, [ids.bruno]);
    ids.contato = contato.id;

    await limparOsDiasDistantes();
  });

  afterAll(async () => {
    await limparOsDiasDistantes();
    /* A rotina que a suíte montou sai inteira — inclusive as atividades que
       qualquer outro dia tenha gerado a partir dela, senão a chave estrangeira
       segura o item. */
    for (const item of [ids.itemIndividual, ids.itemColetivo].filter(Boolean)) {
      await admin.query(
        `DELETE FROM activity_acknowledgement WHERE activity_id IN
           (SELECT id FROM activity WHERE routine_item_id = $1)`, [item]);
      await admin.query(
        `DELETE FROM activity_assignment WHERE activity_id IN
           (SELECT id FROM activity WHERE routine_item_id = $1)`, [item]);
      await admin.query(`DELETE FROM activity WHERE routine_item_id = $1`, [item]);
      await admin.query(`DELETE FROM routine_item WHERE id = $1`, [item]);
    }
    if (ids.versaoEMinha) {
      await admin.query(`DELETE FROM routine_version WHERE id = $1`, [ids.versao]);
    }
    /* A REDE DE SEGURANÇA. Fecha por SQL de dono, de propósito: precisa
       funcionar mesmo que a rota seja o que está quebrado. */
    await admin.query(
      `UPDATE hospitalization SET status='encerrada', ended_at=now(), outcome='alta',
              outcome_note='Internação fictícia da suíte da grade do dia.'
        WHERE status='em_andamento' AND person_id = $1`, [ids.bruno]);
    await admin.query(
      `UPDATE family_stay SET status='encerrada', returned_at=now()
        WHERE returned_at IS NULL AND person_id = $1`, [ids.bruno]);
    /* Contato não se apaga (`contato_nao_e_apagado`): encerra-se, com motivo. */
    await admin.query(
      `UPDATE person_contact SET active = false, visit_authorized = false,
              ended_reason = 'Contato fictício criado pela suíte da grade do dia.'
        WHERE id = $1`, [ids.contato]);
    await app.close();
    await admin.end();
  });

  // ================= Antes da ausência: a grade normal =================

  it('sem ausência nenhuma, o item individual nasce — é o que a correção não pode tirar', async () => {
    const r = await gerar(diaInternada);
    expect(r.criadas).toBeGreaterThan(0);

    const lista = await grade(diaInternada);
    expect(doBruno(lista).map((a) => a.titulo)).toContain(ids.tituloIndividual);
    expect(coletivas(lista).length).toBeGreaterThan(0);
  });

  // ================= A criança internada =================

  it('com a internação aberta, o item individual JÁ GERADO sai da grade — e não é apagado', async () => {
    const antes = await grade(diaInternada);
    const idDoItem = doBruno(antes).find((a) => a.titulo === ids.tituloIndividual)!.id;

    const r = await request(http).post('/api/v1/nursing/hospitalizations').set(auth(tokens.tecnica))
      .send({ personId: ids.bruno, houseId: ids.AI3,
              hospital: 'Hospital Fictício da Grade do Dia',
              motivo: 'Internação fictícia para guardar o defeito da grade do dia.' });
    expect(r.status).toBe(201);
    ids.internacao = r.body.id;

    const depois = await grade(diaInternada);
    expect(doBruno(depois)).toHaveLength(0);

    /* E O ITEM CONTINUA NO BANCO. É a metade que importa: o sistema não
       concluiu que a atividade não aconteceu — ele parou de cobrá-la. */
    const { rows: [ainda] } = await admin.query(
      `SELECT state FROM activity WHERE id = $1`, [idDoItem]);
    expect(ainda).toBeTruthy();
    expect(ainda.state).not.toBe('nao_realizada');
  });

  it('a atividade COLETIVA da casa continua na grade — dezenove crianças tomam café', async () => {
    const lista = await grade(diaInternada);
    expect(coletivas(lista).length).toBeGreaterThan(0);
  });

  it('com a internação aberta, o item individual NÃO NASCE de novo', async () => {
    /* Apaga só o do Bruno e regera: é o gesto de quem confere a grade do dia. */
    await admin.query(
      `DELETE FROM activity WHERE house_id = $1 AND person_id = $2
         AND (scheduled_at AT TIME ZONE app_fuso())::date = $3::date`,
      [ids.AI3, ids.bruno, diaInternada]);

    await gerar(diaInternada);
    expect(doBruno(await grade(diaInternada))).toHaveLength(0);

    /* E não nasceu NO BANCO — a diferença entre não gerar e gerar escondido. */
    const { rows: [{ n }] } = await admin.query(
      `SELECT count(*)::int AS n FROM activity
        WHERE house_id = $1 AND person_id = $2
          AND (scheduled_at AT TIME ZONE app_fuso())::date = $3::date`,
      [ids.AI3, ids.bruno, diaInternada]);
    expect(n).toBe(0);
  });

  it('o aviso de "sem confirmação" não cobra plantão de quem não está na casa', async () => {
    /* Um item individual vencido, no PASSADO, com a criança internada: é o caso
       exato que escalava de hora em hora para a coordenação. */
    const { rows: [novo] } = await admin.query(
      `INSERT INTO activity (house_id, person_id, kind, title, scheduled_at,
                             requires_ack, state, created_by)
       SELECT $1, $2, 'escola', 'Item vencido da suíte da grade',
              now() - interval '3 hours', true, 'aguardando_ciencia', u.id
         FROM app_user u WHERE u.email = 'lider.ai3@paodospobres.dev'
       RETURNING id`, [ids.AI3, ids.bruno]);

    const r = await request(http).post('/api/v1/activities/mark-unconfirmed')
      .set(auth(tokens.lider)).send({ houseId: ids.AI3, minutos: 60 });
    expect(r.status).toBe(201);

    const { rows: [depois] } = await admin.query(
      `SELECT state FROM activity WHERE id = $1`, [novo.id]);
    expect(depois.state).toBe('aguardando_ciencia');

    await admin.query(`DELETE FROM activity WHERE id = $1`, [novo.id]);
  });

  it('encerrada a internação, o item individual volta a nascer', async () => {
    const r = await request(http)
      .post(`/api/v1/nursing/hospitalizations/${ids.internacao}/close`).set(auth(tokens.tecnica))
      .send({ desfecho: 'alta', observacao: 'Alta fictícia da suíte da grade do dia.' });
    expect([200, 201]).toContain(r.status);

    await gerar(diaInternada);
    expect(doBruno(await grade(diaInternada)).map((a) => a.titulo))
      .toContain(ids.tituloIndividual);
  });

  // ================= A criança em convivência familiar =================

  it('a visita domiciliar tira o item individual do mesmo jeito que a internação', async () => {
    /* Primeiro a grade nasce inteira no segundo dia distante. */
    await gerar(diaFamilia);
    expect(doBruno(await grade(diaFamilia)).map((a) => a.titulo))
      .toContain(ids.tituloIndividual);

    const { rows: [j] } = await admin.query(
      `SELECT ($1::date || ' 09:00')::timestamp AT TIME ZONE app_fuso() AS ini,
              ($1::date || ' 20:00')::timestamp AT TIME ZONE app_fuso() AS fim`, [diaFamilia]);
    const r = await request(http).post('/api/v1/people/family-stays').set(auth(tokens.tecnica))
      .send({ personId: ids.bruno, contatoId: ids.contato,
              inicio: j.ini, retornoPrevisto: j.fim,
              finalidade: 'Convivência fictícia para guardar o defeito da grade do dia.' });
    expect(r.status).toBe(201);

    expect(doBruno(await grade(diaFamilia))).toHaveLength(0);

    await admin.query(
      `DELETE FROM activity WHERE house_id = $1 AND person_id = $2
         AND (scheduled_at AT TIME ZONE app_fuso())::date = $3::date`,
      [ids.AI3, ids.bruno, diaFamilia]);
    await gerar(diaFamilia);
    const { rows: [{ n }] } = await admin.query(
      `SELECT count(*)::int AS n FROM activity
        WHERE house_id = $1 AND person_id = $2
          AND (scheduled_at AT TIME ZONE app_fuso())::date = $3::date`,
      [ids.AI3, ids.bruno, diaFamilia]);
    expect(n).toBe(0);
  });

  // ================= A resposta num lugar só (1480) =================

  it('a ausência é UMA resposta, e ela é POR DIA — não por "agora"', async () => {
    /*
     * A propriedade de que a grade depende: a grade de ONTEM, regerada hoje
     * para conferência, tem de saber como a casa estava ontem.
     *
     * A comparação é com o dia ANTERIOR ao da saída, e não com o seguinte —
     * `app_em_convivencia_familiar` olha `returned_at`, e não o retorno
     * PREVISTO: enquanto a criança não voltou, ela está fora, e é isso que a
     * casa precisa que seja verdade. Eu escrevi este teste ao contrário na
     * primeira vez e ele reprovou com razão.
     */
    const { rows: [r] } = await admin.query(
      `SELECT app_ausente_da_casa($1, $2::date) AS no_dia_da_saida,
              app_ausente_da_casa($1, ($2::date - 1)) AS na_vespera`,
      [ids.bruno, diaFamilia]);
    expect(r.no_dia_da_saida).toBe(true);
    expect(r.na_vespera).toBe(false);
  });

  it('a chamada continua usando a MESMA resposta — a 1480 não mudou comportamento', async () => {
    const { rows: [f] } = await admin.query(
      `SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'app_efetivo_da_chamada'`);
    expect(f.def).toContain('app_ausente_da_casa');
    expect(f.def).not.toContain('app_esta_internado');
  });
});
