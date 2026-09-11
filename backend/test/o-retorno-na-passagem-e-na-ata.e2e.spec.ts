/**
 * O RETORNO DA EXPERIÊNCIA FAMILIAR CHEGA À PASSAGEM E À ATA (1060/1070).
 *
 * Pedido do Marcelo em 09/09, item 3 da fila: "quando a criança volta da
 * família: se houve alteração, se trouxe algo de casa. Hoje o retorno é
 * registrado no perfil (fase 80); falta ecoar na ATA do turno e na passagem,
 * para a equipe seguinte ler sem procurar".
 *
 * O QUE ESTES TESTES PROTEGEM:
 *
 *  1. **o retorno guarda o que ela trouxe de casa**, em campo próprio — porque
 *     é fato logístico do turno seguinte, e não detalhe de um texto sobre a
 *     criança;
 *  2. **quem voltou aparece no plantão daquele turno**, com a hora, o nome de
 *     quem recebeu, como chegou e o que trouxe. Uma consulta, servida ao
 *     mesmo tempo que as doses — a Passagem e a ATA leem a MESMA;
 *  3. **quem CONTINUA fora também aparece**, e é o caso que quase ficou fora:
 *     uma criança que saiu na terça e volta no domingo não apareceria em
 *     nenhum turno se o recorte fosse só o das bordas, e é nos dias do meio
 *     que ninguém sabe o que está acontecendo;
 *  4. **`situacao` fala do TURNO, não da criança.** Não existe "voltou bem"
 *     nem "voltou alterada": os três valores são o que aconteceu naquelas doze
 *     horas;
 *  5. **`atrasado` fala do RELÓGIO.** A hora prevista passou e o retorno não
 *     foi registrado. Nada aqui chama isso de evasão (regra 3);
 *  6. **o retorno antes da saída é recusado** — erro de digitação que faria a
 *     convivência aparecer na passagem de um turno em que a criança ainda não
 *     tinha ido;
 *  7. **quem não alcança a casa não lê nada disso**, e recebe o mesmo 404 de
 *     inexistente.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { corrida } from './setup/corrida-no-banco';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O retorno da experiência familiar na passagem e na ATA', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, AI4: string, pessoa: string, contato: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

  /**
   * Um plantão com HORA CONHECIDA, criado pelo dono do banco.
   *
   * A rota `POST /shifts` abre o plantão de HOJE, e o recorte da função é o do
   * turno no fuso da instituição: se a suíte rodasse às 23h, um retorno
   * "agora" cairia no plantão noturno e não no diurno. Fixar a data e o turno
   * é o que faz este teste dizer a mesma coisa às 9h e às 23h — a armadilha 2
   * dos ensaios em Playwright, na forma de suíte.
   */
  const plantoes: string[] = [];

  async function plantaoEm(dia: string, turno: 'diurno' | 'noturno') {
    /*
     * APAGA O DE ANTES, SE HOUVER.
     *
     * `shift` tem única em (casa, data, turno) — e está certa: era ela que
     * impedia dois plantões para a mesma noite. Dentro de um teste, dois
     * cenários no mesmo dia batiam nela, e a suíte falhava por motivo que não
     * era o do teste. Nada de estado compartilhado aqui: as datas são de
     * janeiro e escolhidas por esta suíte (regra 13).
     */
    await admin.query(
      `DELETE FROM shift WHERE house_id=$1 AND on_date=$2::date AND period=$3`,
      [AI3, dia, turno]);
    const { rows: [s] } = await admin.query(
      `INSERT INTO shift (house_id, on_date, period, status, opened_by, opened_at)
       VALUES ($1, $2::date, $3, 'aberto',
               (SELECT id FROM app_user WHERE email='coord.ai3@paodospobres.dev'), now())
       RETURNING id`, [AI3, dia, turno]);
    plantoes.push(s.id);
    return s.id as string;
  }

  /** Uma convivência com horas escolhidas, direto no banco. */
  async function convivencia(inicio: string, previsto: string,
                             volta?: { em: string; nota?: string; trouxe?: string }) {
    const { rows: [f] } = await admin.query(
      `INSERT INTO family_stay (person_id, house_id, contact_id, purpose,
                                started_at, expected_return_at, opened_by,
                                returned_at, return_note, brought_back, status, closed_by)
       VALUES ($1,$2,$3,'Fim de semana em casa (fictício).',$4::timestamptz,$5::timestamptz,
               (SELECT id FROM app_user WHERE email='tecnica.ai3@paodospobres.dev'),
               $6::timestamptz, $7, $8,
               CASE WHEN $6 IS NULL THEN 'em_andamento' ELSE 'encerrada' END,
               CASE WHEN $6 IS NULL THEN NULL
                    ELSE (SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev')
               END)
       RETURNING id`,
      [pessoa, AI3, contato, inicio, previsto,
       volta?.em ?? null, volta?.nota ?? null, volta?.trouxe ?? null]);
    return f.id as string;
  }

  /**
   * O QUE AS TELAS RECEBEM, e não o que o banco devolve.
   *
   * A primeira versão chamava `app_convivencias_do_turno` pelo cliente do DONO
   * do banco — e a função recusou com `casa_fora_de_escopo`, certíssima: sem
   * `app.user_id` não há alcance nenhum a conferir (regra 8). A lição é boa e
   * fica: o caminho de verdade é a rota, com uma pessoa autenticada, que é
   * exatamente o que a Passagem e a ATA fazem. Um teste que consulta a função
   * por fora prova menos e mente mais.
   */
  async function doTurno(shift: string, token = tokens.educador) {
    const r = await request(http).get(`/api/v1/shifts/${shift}`).set(auth(token));
    expect(r.status).toBe(200);
    return r.body.convivencias as any[];
  }

  async function limpar() {
    /* `family_stay` é estado VIVO: uma saída deixada aberta tiraria a criança
       da grade nas outras suítes. Desfaz-se o que se criou (regra 13). */
    await admin.query(`DELETE FROM family_stay WHERE person_id = $1`, [pessoa]);
  }

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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      outraCasa: 'educador.ai4@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    const { rows: [p] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]);
    pessoa = p.person_id;
    const { rows: [c] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, phone)
       VALUES ($1,'Contato do Eco (fictício)','genitora','51 90000-0000') RETURNING id`,
      [pessoa]);
    contato = c.id;
  });

  afterAll(async () => {
    await limpar();
    if (plantoes.length) {
      await admin.query(`DELETE FROM shift WHERE id = ANY($1::uuid[])`, [plantoes]);
    }
    /* Contato não se apaga: encerra-se com motivo. */
    await admin.query(
      `UPDATE person_contact SET active = false,
              ended_reason = 'Contato fictício criado pela suíte de teste.'
        WHERE id = $1`, [contato]);
    await app.close(); await admin.end();
  });

  beforeEach(limpar);

  it('o retorno guarda como ela chegou E o que trouxe de casa', async () => {
    const id = await convivencia(
      new Date(Date.now() - 3 * 86400_000).toISOString(),
      new Date(Date.now() - 3600_000).toISOString());

    const r = await request(http)
      .post(`/api/v1/people/family-stays/${id}/return`).set(auth(tokens.educador))
      .send({
        quando: new Date().toISOString(),
        nota: 'Chegou no horário, ficou quieta e foi direto para o quarto.',
        trouxe: 'Mochila com roupa suja, um frasco de xarope e a carteira de vacina.',
      });
    expect(r.status).toBe(201);

    const { rows: [f] } = await admin.query(
      `SELECT return_note, brought_back, status FROM family_stay WHERE id = $1`, [id]);
    expect(f.status).toBe('encerrada');
    expect(f.return_note).toMatch(/foi direto para o quarto/);
    /* O campo próprio é a coisa toda: misturado à observação, o xarope viraria
       detalhe de um texto sobre a criança — e é a única das duas coisas que
       alguém tem de FAZER algo a respeito. */
    expect(f.brought_back).toMatch(/xarope/);
  });

  it('o log do retorno não copia o que foi escrito sobre a criança', async () => {
    const id = await convivencia(
      new Date(Date.now() - 2 * 86400_000).toISOString(),
      new Date(Date.now() - 3600_000).toISOString());
    const segredo = 'frase-que-nao-deve-aparecer-no-log-de-auditoria';

    await request(http).post(`/api/v1/people/family-stays/${id}/return`)
      .set(auth(tokens.educador))
      .send({ quando: new Date().toISOString(), nota: segredo, trouxe: segredo });

    /* Regra 2: o log guarda ID e metadado, nunca conteúdo sensível — e o que
       se escreve na chegada de uma criança é exatamente isso. */
    const { rows } = await admin.query(
      `SELECT detail::text AS d FROM audit_event
        WHERE entity='family_stay' AND entity_id=$1 AND action='family_stay.close'`, [id]);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.d).not.toContain(segredo);
    /* Mas ele diz que houve nota: o metadado é o que se pode guardar. */
    expect(rows.some((r: any) => /comTrouxe/.test(r.d))).toBe(true);
  });

  it('quem voltou no turno aparece no plantão daquele turno, com quem recebeu', async () => {
    /* 12h de um dia bem no passado: dentro do diurno (07h–19h) em qualquer
       fuso que a instituição use, e longe de qualquer plantão real da casa. */
    const dia = '2026-01-15';
    const shift = await plantaoEm(dia, 'diurno');
    await convivencia(`${dia}T10:00:00-03:00`, `${dia}T18:00:00-03:00`,
      { em: `${dia}T12:30:00-03:00`,
        nota: 'Chegou falando da irmã.',
        trouxe: 'Uma sacola de roupa e o cartão do SUS.' });

    const linhas = await doTurno(shift);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].situacao).toBe('voltou');
    expect(linhas[0].comoChegou).toMatch(/falando da irmã/);
    expect(linhas[0].trouxe).toMatch(/cartão do SUS/);
    /* O nome de quem recebeu sai por `app_user_display_name` (regra 10): com
       JOIN em `app_user` sumiria a convivência, com LEFT JOIN sumiria o nome —
       e um retorno sem quem recebeu é um retorno que ninguém pode conferir. */
    expect(linhas[0].recebidaPor).toBeTruthy();
    expect(linhas[0].atrasado).toBe(false);
  });

  it('a mesma consulta serve a Passagem e a ATA — e vem junto do plantão', async () => {
    const dia = '2026-01-16';
    const shift = await plantaoEm(dia, 'diurno');
    await convivencia(`${dia}T09:00:00-03:00`, `${dia}T17:00:00-03:00`,
      { em: `${dia}T14:00:00-03:00`, trouxe: 'Uma muda de roupa.' });

    /* A tela não faz uma segunda ida ao servidor: `GET /shifts/:id` traz as
       convivências ao lado das doses, porque a Passagem e a ATA precisam
       delas antes de qualquer clique. */
    const r = await request(http).get(`/api/v1/shifts/${shift}`).set(auth(tokens.educador));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.convivencias)).toBe(true);
    expect(r.body.convivencias).toHaveLength(1);
    expect(r.body.convivencias[0]).toMatchObject({ situacao: 'voltou' });
    expect(r.body.convivencias[0].trouxe).toMatch(/muda de roupa/);
    /* E o educador lê: é ele que está na casa às 19h, e era esse o pedido. */
    expect(r.body.convivencias[0].acolhido).toBeTruthy();
  });

  it('quem CONTINUA fora aparece nos dias do meio, com a hora de voltar', async () => {
    /* Saiu na terça, volta no domingo. O turno de quinta não tem borda
       nenhuma — e é o turno em que a equipe mais precisa saber. */
    const shift = await plantaoEm('2026-01-22', 'diurno');
    await convivencia('2026-01-20T10:00:00-03:00', '2026-01-25T18:00:00-03:00');

    const linhas = await doTurno(shift);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].situacao).toBe('fora');
    expect(linhas[0].voltouEm).toBeNull();
    expect(linhas[0].retornoPrevisto).toBeTruthy();
  });

  it('quem saiu no turno aparece como "saiu", e a saída de um turno só é "voltou"', async () => {
    const dia = '2026-01-23';
    const so_saiu = await plantaoEm(dia, 'diurno');
    await convivencia(`${dia}T11:00:00-03:00`, `${dia}T23:00:00-03:00`);
    expect((await doTurno(so_saiu))[0].situacao).toBe('saiu');

    /* Saiu E voltou no mesmo turno: o que o turno seguinte precisa saber é que
       ela está de volta, não que ela saiu. A ordem de teste do CASE é isso. */
    await limpar();
    const outro = '2026-01-28';
    const ida_e_volta = await plantaoEm(outro, 'diurno');
    await convivencia(`${outro}T11:00:00-03:00`, `${outro}T16:00:00-03:00`,
      { em: `${outro}T15:40:00-03:00` });
    expect((await doTurno(ida_e_volta))[0].situacao).toBe('voltou');
  });

  it('`atrasado` fala do relógio, e só de quem não voltou', async () => {
    const shift = await plantaoEm('2026-01-24', 'diurno');
    /* Previsto há muito tempo, sem retorno registrado. */
    await convivencia('2026-01-22T10:00:00-03:00', '2026-01-23T18:00:00-03:00');
    expect((await doTurno(shift))[0].atrasado).toBe(true);

    /* Nenhuma coluna chama isso de evasão, fuga ou descumprimento: não voltar
       às 18h e evadir são coisas diferentes até alguém apurar (regra 3). */
    const { rows: cols } = await admin.query(
      `SELECT string_agg(column_name, ',') AS c FROM information_schema.columns
        WHERE table_name = 'family_stay'`);
    expect(cols[0].c).not.toMatch(/evas|fuga|descumpr/i);
  });

  /**
   * DOIS RETORNOS AO MESMO TEMPO — o segundo é recusado, e o primeiro fica.
   *
   * Achado na verificação da fase 88 (fase 89): a função lia o estado numa
   * consulta e gravava com `UPDATE … WHERE id = p_id`. Duas pessoas registrando
   * a mesma chegada — a educadora na porta e o líder no celular — passavam as
   * duas pela leitura; a segunda esperava a trava da linha e, liberada,
   * SOBRESCREVIA a primeira: outro texto, outro "o que trouxe", outro nome em
   * quem recebeu. As duas recebiam sucesso, e ninguém via erro nenhum.
   * Registro fechado sobrescrito com a autoria trocada (regra 3), pelo caminho
   * exato da regra 11: a atomicidade mora no `UPDATE … WHERE status = …`.
   *
   * O teste é determinístico, não sorte de agenda: `setup/corrida-no-banco.ts`.
   */
  it('dois retornos ao mesmo tempo: o segundo é recusado e o primeiro não é sobrescrito', async () => {
    const id = await convivencia(
      new Date(Date.now() - 2 * 86400_000).toISOString(),
      new Date(Date.now() + 86400_000).toISOString());
    const { rows: [{ id: educadora }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev'`);
    const retorno = `SELECT * FROM app_registrar_retorno_familiar($1, now(), $2, $3)`;

    const desfecho = await corrida(admin,
      { email: 'educador.ai3@paodospobres.dev', sql: retorno,
        params: [id, 'A: chegou com a tia, conversando.', 'A: mochila de roupa'] },
      { email: 'lider.ai3@paodospobres.dev', sql: retorno,
        params: [id, 'B: chegou sozinha.', 'B: nada'] });
    expect(desfecho).toMatch(/retorno_ja_registrado/);

    const { rows: [f] } = await admin.query(
      `SELECT return_note, brought_back, closed_by FROM family_stay WHERE id = $1`, [id]);
    expect(f.return_note).toMatch(/^A:/);
    expect(f.brought_back).toMatch(/^A:/);
    expect(f.closed_by).toBe(educadora);
  });

  it('o retorno antes da saída é recusado, com a frase dizendo por quê', async () => {
    const id = await convivencia('2026-02-10T10:00:00-03:00', '2026-02-12T18:00:00-03:00');
    const r = await request(http)
      .post(`/api/v1/people/family-stays/${id}/return`).set(auth(tokens.educador))
      .send({ quando: '2026-02-09T20:00:00-03:00', nota: 'Chegou.' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/anterior à da saída/i);

    /* E nada foi gravado: a convivência continua aberta. */
    const { rows: [f] } = await admin.query(
      `SELECT status FROM family_stay WHERE id = $1`, [id]);
    expect(f.status).toBe('em_andamento');
  });

  it('quem não alcança a casa recebe 404 idêntico a inexistente', async () => {
    const dia = '2026-01-26';
    const shift = await plantaoEm(dia, 'diurno');
    await convivencia(`${dia}T10:00:00-03:00`, `${dia}T18:00:00-03:00`,
      { em: `${dia}T17:00:00-03:00`, trouxe: 'Nada.' });

    const r = await request(http).get(`/api/v1/shifts/${shift}`).set(auth(tokens.outraCasa));
    /* Negar de um jeito diferente vazaria a existência do plantão — e com ele,
       a de que uma criança daquela casa esteve com a família. */
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toMatch(/Nada\./);
  });

  it('a função recusa plantão de casa fora do alcance, e não devolve vazio', async () => {
    /* Zerar não é recusar (regra 12): uma lista vazia se leria como "nenhuma
       criança esteve com a família", e não como "esta casa não é sua". */
    const { rows: [s] } = await admin.query(
      `INSERT INTO shift (house_id, on_date, period, status, opened_by, opened_at)
       VALUES ($1, '2026-01-27'::date, 'diurno', 'aberto',
               (SELECT id FROM app_user WHERE email='coord.ai4@paodospobres.dev'), now())
       RETURNING id`, [AI4]);

    const app_ = new Client({ connectionString: adminUrl });
    await app_.connect();
    try {
      const { rows: [u] } = await app_.query(
        `SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev'`);
      await app_.query('BEGIN');
      await app_.query(`SELECT set_config('app.user_id', $1, true)`, [u.id]);
      await expect(
        app_.query(`SELECT * FROM app_convivencias_do_turno($1)`, [s.id]),
      ).rejects.toThrow(/casa_fora_de_escopo/);
      await app_.query('ROLLBACK');
    } finally {
      await app_.end();
      await admin.query(`DELETE FROM shift WHERE id = $1`, [s.id]);
    }
  });
});
