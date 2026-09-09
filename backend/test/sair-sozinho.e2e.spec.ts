/**
 * SAIR SOZINHO — um estado, não uma pontuação.
 *
 * Pedido do Marcelo em 09/09: há adolescentes autorizados a sair sozinhos, e a
 * autorização é retirada quando há medida disciplinar. O educador que vê o
 * jovem sair de manhã precisa saber, ali, se ele vai sozinho ou acompanhado.
 *
 * A conversa passou por um sistema de PONTOS. Não entrou — regra 3 —, e o que
 * entrou resolve a mesma necessidade sem as consequências: o número viaja e o
 * motivo fica para trás; duas crianças com dois números na mesma lista já é
 * comparação; e o número tira o autor da decisão.
 *
 * O que estes testes protegem:
 *
 *  1. **ausência não é liberação.** Sem registro, o vigente é `null` — e a
 *     tela escreve "sem definição" em vez de desenhar permissão que ninguém
 *     deu;
 *  2. **motivo obrigatório, inclusive para liberar.** "Por que ele pode sair
 *     sozinho" é a decisão que a técnica vai defender numa audiência;
 *  3. **suspender exige prazo.** Medida sem prazo vira permanente por
 *     esquecimento;
 *  4. **nada se sobrescreve.** Decisão nova encerra a anterior, e o histórico
 *     responde "por que ele perdeu a saída em março";
 *  5. **o prazo NÃO devolve a autorização sozinho.** Vencido, o sistema
 *     sinaliza `aRevisar` e o estado continua o mesmo: permissão que volta
 *     sozinha é decisão automática sobre a vida de alguém;
 *  6. **o educador lê e não decide** — ele é o motivo de isto existir;
 *  7. **quem está liberado não entra na lista de atenção.** A lista inteira
 *     todo dia vira paisagem;
 *  8. **nenhum campo carrega pontuação, nota ou contagem.**
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const emDias = (d: number) =>
  new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);

describe('Sair sozinho', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, pessoa: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

  const decidir = (token: string, corpo: any) =>
    request(http).post(`/api/v1/people/${pessoa}/outing-permission`)
      .set(auth(token)).send(corpo);

  const ver = (token: string) =>
    request(http).get(`/api/v1/people/${pessoa}/outing-permission`).set(auth(token));

  const aObservar = (token: string) =>
    request(http).get(`/api/v1/people/outing-permissions?houseId=${AI3}`).set(auth(token));

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
      coord: 'coord.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows: [p] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]);
    pessoa = p.person_id;
  });

  afterAll(async () => {
    /* Estado VIVO: uma suspensão deixada aqui apareceria na lista de atenção
       de quem rodasse a próxima suíte, com o nome de uma criança real. */
    await admin.query(`DELETE FROM outing_permission WHERE person_id = $1`, [pessoa]);
    await app.close(); await admin.end();
  });

  beforeEach(async () => {
    await admin.query(`DELETE FROM outing_permission WHERE person_id = $1`, [pessoa]);
  });

  it('sem registro, o vigente é nulo — ausência não é liberação', async () => {
    const r = await ver(tokens.educador).expect(200);
    expect(r.body.vigente).toBeNull();
    expect(r.body.historico).toEqual([]);
  });

  it('exige motivo, inclusive para liberar', async () => {
    const r = await decidir(tokens.tecnica, { status: 'liberada', motivo: 'ok' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/motivo/i);
  });

  it('suspender sem prazo é recusado — medida sem prazo vira permanente', async () => {
    const r = await decidir(tokens.tecnica, {
      status: 'suspensa', motivo: 'Medida disciplinar combinada com ele hoje.',
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/prazo|até quando/i);
  });

  it('decisão nova encerra a anterior, e o histórico guarda as duas', async () => {
    await decidir(tokens.tecnica, {
      status: 'liberada', motivo: 'Vai e volta da escola sozinho desde março, sem intercorrência.',
      onde: 'Escola e curso.',
    }).expect(201);
    await decidir(tokens.coord, {
      status: 'acompanhada', motivo: 'Medida combinada com ele na quinta; vai acompanhado.',
      ate: emDias(14),
    }).expect(201);

    const r = await ver(tokens.tecnica).expect(200);
    expect(r.body.vigente.status).toBe('acompanhada');
    expect(r.body.historico.length).toBe(2);
    // A anterior foi ENCERRADA, não apagada nem reescrita.
    expect(r.body.historico[1].status).toBe('liberada');
    expect(r.body.historico[1].ateQuando).not.toBeNull();

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM outing_permission
        WHERE person_id=$1 AND valid_to IS NULL`, [pessoa]);
    expect(rows[0].n).toBe(1);
  });

  it('o prazo vencido sinaliza revisão e NÃO devolve a autorização sozinho', async () => {
    /* Prazo no passado só entra pelo banco: a rota recusa, de propósito. */
    await admin.query(
      `INSERT INTO outing_permission (person_id, house_id, status, reason, review_on, decided_by)
       VALUES ($1,$2,'suspensa','Medida disciplinar fictícia da suíte de teste.',
               current_date - 3, (SELECT id FROM app_user WHERE email='tecnica.ai3@paodospobres.dev'))`,
      [pessoa, AI3]);

    const r = await ver(tokens.educador).expect(200);
    expect(r.body.vigente.status).toBe('suspensa');
    expect(r.body.vigente.aRevisar).toBe(true);
  });

  it('o educador lê, e não decide', async () => {
    const r = await decidir(tokens.educador, {
      status: 'liberada', motivo: 'Tentativa do educador, que não decide isto.',
    });
    expect(r.status).toBe(403);

    await decidir(tokens.tecnica, {
      status: 'acompanhada', motivo: 'Vai acompanhado esta semana, combinado com ele.',
      ate: emDias(7),
    }).expect(201);
    // Mas ele LÊ — é o motivo de isto existir.
    const lido = await ver(tokens.educador).expect(200);
    expect(lido.body.vigente.motivo).toMatch(/combinado com ele/i);
  });

  it('quem está liberado não entra na lista de atenção da manhã', async () => {
    await decidir(tokens.tecnica, {
      status: 'liberada', motivo: 'Autorizado a ir e voltar da escola sozinho.',
    }).expect(201);

    const r = await aObservar(tokens.educador).expect(200);
    expect(r.body.find((x: any) => x.personId === pessoa)).toBeUndefined();

    await decidir(tokens.tecnica, {
      status: 'suspensa', motivo: 'Medida disciplinar combinada com ele hoje de manhã.',
      ate: emDias(10),
    }).expect(201);

    const r2 = await aObservar(tokens.educador).expect(200);
    const item = r2.body.find((x: any) => x.personId === pessoa);
    expect(item).toBeDefined();
    // O motivo vem junto: "vai acompanhado" sem o porquê é ordem sem explicação.
    expect(item.motivo).toMatch(/medida disciplinar/i);
  });

  it('nenhum campo carrega pontuação, nota ou contagem', async () => {
    await decidir(tokens.tecnica, {
      status: 'acompanhada', motivo: 'Combinado com ele que sai acompanhado por duas semanas.',
      ate: emDias(14),
    }).expect(201);

    const corpo = JSON.stringify((await ver(tokens.tecnica)).body)
      + JSON.stringify((await aObservar(tokens.tecnica)).body);
    expect(corpo).not.toMatch(/pontos?|score|nota|ranking|nivel|nível/i);
  });
});
