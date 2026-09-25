/**
 * O PEDIDO PARA LER A OBSERVAÇÃO RESTRITA DA ATA (migração 1540).
 *
 * Decisão da Fundação em 22/09, e ela veio em duas partes: *"todos leem a ata
 * coletiva, seja manhã ou noite, para consultar informações de como os atendidos
 * estavam — menos as restritas, que são apenas para quem tem autorização. A
 * pessoa pode solicitar ler alguma coisa, e cabe à equipe deixar ou não."*
 *
 * O PEDIDO É PELA ATA, E NÃO PELA LINHA, e esta suíte guarda isso junto com o
 * resto: quem não alcança a linha restrita **não sabe qual linha é** — a tela lhe
 * diz apenas *"há N observações restritas"*. Uma lista de linhas restritas para
 * escolher seria exatamente o vazamento que a restrição existe para impedir.
 *
 * As propriedades que ela cobra, e que são fáceis de perder:
 *
 *  * **a liberação é POR ATA e POR PESSOA** — liberar a Enfermagem numa ATA não a
 *    libera na ATA de ontem, nem libera outra pessoa;
 *  * **é REVOGÁVEL**, porque liberação que não se retira é ampliação permanente de
 *    acesso pela porta dos fundos;
 *  * **as duas respostas pedem motivo** — negar é o que a pessoa vai perguntar,
 *    liberar é o que alguém vai perguntar pela criança;
 *  * **ninguém libera o próprio pedido**;
 *  * **e nada se apaga**: o pedido fica com a liberação, a retirada e os dois
 *    motivos, porque é a história que responde depois.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O pedido de leitura da observação restrita', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const pedir = (quem: string, motivo: string, ata = ids.ata) =>
    request(http).post(`/api/v1/shifts/ata/${ata}/read-request`)
      .set(auth(quem)).send({ motivo });
  const decidir = (quem: string, pedido: string, liberar: boolean, motivo: string) =>
    request(http).post(`/api/v1/shifts/ata-read-requests/${pedido}/decide`)
      .set(auth(quem)).send({ liberar, motivo });
  const revogar = (quem: string, pedido: string, motivo: string) =>
    request(http).post(`/api/v1/shifts/ata-read-requests/${pedido}/revoke`)
      .set(auth(quem)).send({ motivo });
  const lista = async (quem: string) =>
    (await request(http).get(`/api/v1/shifts/ata-read-requests?houseId=${ids.AI3}`)
      .set(auth(quem))).body;
  /** O que esta pessoa LÊ da ATA: a linha restrita aparece ou não. */
  const leARestrita = async (quem: string) => {
    const { rows } = await admin.query(
      `SELECT shift_id FROM ata WHERE id = $1`, [ids.ata]);
    const r = await request(http).get(`/api/v1/shifts/${rows[0].shift_id}`).set(auth(quem));
    expect(r.status).toBe(200);
    return JSON.stringify(r.body.linhas?.notas ?? []).includes('SEGREDO RESTRITO DA SUÍTE');
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
      enfermagem: 'enfermagem@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));

    /*
     * A ATA COM UMA LINHA RESTRITA — e ela nasce NUMA DATA QUE NINGUÉM ALCANÇA,
     * de propósito.
     *
     * A semente não traz linha restrita nenhuma, então a suíte cria a sua (é o
     * desenho do defeito da fase 141: superfície sem dado de partida é superfície
     * sem teste). O que ela NÃO pode fazer é desfazer: a `ata` tem gatilho que
     * recusa DELETE (`ata_nao_e_apagada`) e a `ata_note` é IMUTÁVEL — qualquer
     * UPDATE ou DELETE nela estoura. **As duas regras estão certas**, e desligar
     * um gatilho de integridade para limpar teste seria mexer no que guarda o
     * registro da criança.
     *
     * Então a fixação vai para **quatrocentos dias atrás**: a maior janela que
     * alguma consulta oferece é de um mês, e nenhuma suíte olha para lá. É o
     * contrário da lição da fase 127 — lá a suíte tinha de FECHAR o que abria;
     * aqui ela não tem como, e a saída é não pôr o que abre no caminho de
     * ninguém.
     */
    const { rows: [t] } = await admin.query(
      `SELECT u.id FROM app_user u WHERE u.email = 'tecnica.ai3@paodospobres.dev'`);
    const { rows: [s] } = await admin.query(
      `INSERT INTO shift (house_id, period, on_date, opened_by, opened_at)
       VALUES ($1, 'noturno', app_hoje() - 400, $2, now()) RETURNING id`, [ids.AI3, t.id]);
    ids.shift = s.id;
    const { rows: [a] } = await admin.query(
      `INSERT INTO ata (shift_id, house_id, on_date, period, status)
       VALUES ($1, $2, app_hoje() - 400, 'noturno', 'rascunho') RETURNING id`, [s.id, ids.AI3]);
    ids.ata = a.id;
    await admin.query(
      `INSERT INTO ata_note (ata_id, house_id, author_id, body, restricted, happened_at)
       VALUES ($1, $2, $3, 'SEGREDO RESTRITO DA SUÍTE — observação fictícia.', true, now())`,
      [a.id, ids.AI3, t.id]);
  });

  afterAll(async () => {
    /* Os PEDIDOS saem — eles são só desta suíte e a fila da casa é lida por quem
       decide. A ATA e a linha FICAM, porque não se apagam (ver o `beforeAll`):
       elas moram quatrocentos dias atrás, fora de toda janela, e o `npm test`
       recria o schema antes de cada rodada. */
    await admin.query(`DELETE FROM ata_read_request WHERE ata_id = $1`, [ids.ata]);
    await app.close();
    await admin.end();
  });

  // ================== Antes do pedido ==================

  it('sem liberação, a linha restrita NÃO sai — e a contagem dela sai', async () => {
    expect(await leARestrita(tokens.enfermagem)).toBe(false);
    /* A contagem é o precedente do §13.7: quem não lê o texto precisa saber que
       ele existe, senão conclui que não existe. */
    const r = await request(http).get(`/api/v1/shifts/${ids.shift}`).set(auth(tokens.enfermagem));
    expect(r.body.linhas.restritasOcultas).toBeGreaterThan(0);
  });

  it('quem já lê a linha restrita não pede — a recusa diz isso', async () => {
    const r = await pedir(tokens.coord, 'Motivo fictício de dez caracteres ou mais.');
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/já lê as observações restritas/i);
  });

  it('pedir sem motivo é recusado, e a frase diz para que a frase serve', async () => {
    const r = await pedir(tokens.enfermagem, 'urgente');
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/quem decide lê esta frase/i);
  });

  // ================== O pedido ==================

  it('a Enfermagem pede, e o pedido aparece para quem decide — com o motivo', async () => {
    const r = await pedir(tokens.enfermagem,
      'Preciso saber como a criança passou a noite antes da dose das 9h.');
    expect(r.status).toBe(201);
    ids.pedido = r.body.id;

    const daTecnica = await lista(tokens.tecnica);
    expect(daTecnica.podeDecidir).toBe(true);
    const p = daTecnica.pedidos.find((x: any) => x.id === ids.pedido);
    expect(p.situacao).toBe('esperando');
    expect(p.motivo).toMatch(/passou a noite/);
    expect(p.meu).toBe(false);

    /* E quem pediu vê o seu, com a situação — um pedido que some é um pedido que
       se refaz. */
    const dela = await lista(tokens.enfermagem);
    expect(dela.podeDecidir).toBe(false);
    expect(dela.pedidos.find((x: any) => x.id === ids.pedido).meu).toBe(true);
  });

  it('e o pedido CHEGA a quem decide, como aviso — não só na lista da ATA', async () => {
    /*
     * O defeito que esta cobrança guarda (fase 154): o pedido publicava
     * `priority: 'media'`, que o banco não aceita. A notificação era recusada, o
     * ouvinte escrevia o erro no log, e o pedido acima — 201, com a lista certa —
     * nunca virava aviso para a técnica nem para a coordenação. Um pedido que
     * ninguém abre é um pedido que morre, diz o próprio serviço; e ele morria
     * aqui, sem nenhuma suíte ver, porque todas liam a LISTA e nenhuma o AVISO.
     */
    const r = await request(http).get('/api/v1/notifications').set(auth(tokens.tecnica));
    expect(r.status).toBe(200);
    const aviso = r.body.find((n: any) =>
      n.entidade === 'ata_read_request' && n.entidadeId === ids.pedido);
    expect(aviso).toBeTruthy();
    expect(aviso.titulo).toMatch(/Pedido para ler/);
  });

  it('o mesmo pedido duas vezes não vira dois', async () => {
    const r = await pedir(tokens.enfermagem, 'Outra tentativa fictícia, no mesmo dia.');
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/já está esperando resposta/i);
  });

  it('o educador não decide, e ninguém libera o próprio pedido', async () => {
    const dele = await decidir(tokens.educador, ids.pedido, true,
      'Tentativa fictícia de quem não decide.');
    expect(dele.status).toBe(400);

    /* A Enfermagem pediu: liberar a si mesma seria a regra existindo e não
       valendo. Ela também não decide, então a recusa é a do cargo — e as duas
       barreiras existem de propósito. */
    const dela = await decidir(tokens.enfermagem, ids.pedido, true,
      'Tentativa fictícia de liberar o próprio pedido.');
    expect(dela.status).toBe(400);
  });

  it('decidir sem motivo é recusado — as DUAS respostas pedem', async () => {
    const r = await decidir(tokens.tecnica, ids.pedido, true, 'ok');
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/liberar é o que alguém vai perguntar pela criança/i);
  });

  // ================== A liberação ==================

  it('liberada, a linha restrita passa a sair — para ELA, e não para o colega', async () => {
    const r = await decidir(tokens.tecnica, ids.pedido, true,
      'A observação é sobre o sono, e a Enfermagem precisa dela para a dose.');
    expect(r.status).toBe(201);

    expect(await leARestrita(tokens.enfermagem)).toBe(true);
    /* E o educador, que não pediu nada, continua sem ler: a liberação é por
       pessoa, e não um interruptor da ATA. */
    expect(await leARestrita(tokens.educador)).toBe(false);
  });

  it('a liberação é POR ATA — não abre a ATA de ontem', async () => {
    const { rows: [t] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'tecnica.ai3@paodospobres.dev'`);
    const { rows: [s2] } = await admin.query(
      `INSERT INTO shift (house_id, period, on_date, opened_by, opened_at)
       VALUES ($1, 'diurno', app_hoje() - 401, $2, now()) RETURNING id`, [ids.AI3, t.id]);
    const { rows: [a2] } = await admin.query(
      `INSERT INTO ata (shift_id, house_id, on_date, period, status)
       VALUES ($1, $2, app_hoje() - 401, 'diurno', 'rascunho') RETURNING id`, [s2.id, ids.AI3]);
    await admin.query(
      `INSERT INTO ata_note (ata_id, house_id, author_id, body, restricted, happened_at)
       VALUES ($1, $2, $3, 'OUTRA RESTRITA DA SUÍTE — fictícia.', true, now())`,
      [a2.id, ids.AI3, t.id]);

    const outra = await request(http).get(`/api/v1/shifts/${s2.id}`).set(auth(tokens.enfermagem));
    expect(outra.status).toBe(200);
    expect(JSON.stringify(outra.body.linhas.notas)).not.toContain('OUTRA RESTRITA');
    expect(outra.body.linhas.restritasOcultas).toBeGreaterThan(0);

    /* Também não se apaga — e também não está no caminho de ninguém. */
  });

  // ================== A retirada ==================

  it('retirada a liberação, a linha volta a não sair — e nada se apaga', async () => {
    const r = await revogar(tokens.coord, ids.pedido,
      'A dúvida foi resolvida na reunião de equipe de hoje.');
    expect(r.status).toBe(201);
    expect(r.body.mudou).toBe(true);

    expect(await leARestrita(tokens.enfermagem)).toBe(false);

    /* A HISTÓRIA INTEIRA fica: o pedido, o motivo dele, a liberação com o motivo
       dela, e a retirada com o seu. É isso que responde a pergunta de março. */
    const p = (await lista(tokens.tecnica)).pedidos.find((x: any) => x.id === ids.pedido);
    expect(p.situacao).toBe('retirada');
    expect(p.motivo).toMatch(/passou a noite/);
    expect(p.motivoDaDecisao).toMatch(/sobre o sono/);
    expect(p.motivoDaRetirada).toMatch(/reunião de equipe/);
    expect(p.decididoPor).toBeTruthy();
    expect(p.retiradoPor).toBeTruthy();
  });

  it('retirar de novo não é erro, e não inventa uma segunda retirada', async () => {
    const r = await revogar(tokens.coord, ids.pedido, 'Segunda tentativa fictícia de retirar.');
    expect(r.status).toBe(201);
    expect(r.body.mudou).toBe(false);
  });

  it('depois da retirada ela pode pedir DE NOVO — a situação muda', async () => {
    const r = await pedir(tokens.enfermagem, 'A criança voltou a não dormir; preciso outra vez.');
    expect(r.status).toBe(201);
    /* E o pedido antigo continua na lista: dois pedidos, e não um sobrescrito. */
    const todos = (await lista(tokens.tecnica)).pedidos
      .filter((x: any) => x.ataId === ids.ata);
    expect(todos.length).toBeGreaterThanOrEqual(2);
  });

  it('a aplicação não escreve no pedido por fora das funções', async () => {
    /* O `REVOKE INSERT, UPDATE, DELETE` é o que garante que o pedido e a decisão
       passem pelas guardas. Sem ele, um `UPDATE` da aplicação liberaria leitura
       sem motivo, sem autor e sem registro. */
    const { rows: [g] } = await admin.query(
      `SELECT bool_or(privilege_type IN ('INSERT','UPDATE','DELETE')) AS escreve
         FROM information_schema.role_table_grants
        WHERE grantee = 'rede_app' AND table_name = 'ata_read_request'`);
    expect(g.escreve ?? false).toBe(false);
  });
});
