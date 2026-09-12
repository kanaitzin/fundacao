/**
 * A PAUTA QUE O EDUCADOR PROPÕE (fase 94, migração 1140).
 *
 * Último item da fila de 09/09. A frase do pedido é a que esta suíte defende:
 * **"uma pauta recusada sem resposta é pior do que não poder propor"**.
 *
 * O que fica garantido:
 *  - quem trabalha na casa propõe — inclusive o educador e a enfermagem;
 *  - recusar e adiar EXIGEM resposta escrita, no serviço e no banco;
 *  - aceitar não exige: a resposta é o assunto aparecer na pauta;
 *  - quem propôs LÊ a resposta, e é AVISADO — principalmente quando é não;
 *  - o texto proposto é imutável, como o corpo do combinado;
 *  - duas pessoas respondendo ao mesmo tempo: uma vale, a outra é recusada
 *    (regra 11, a prova de `setup/corrida-no-banco.ts`);
 *  - uma casa não lê nem responde a pauta da outra.
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
const ASSUNTO = 'A troca de turno às 19h está atropelando o jantar das crianças menores.';
const RECUSA = 'Isto é assunto da escala, e já está sendo tratado com a coordenação geral (teste).';

describe('A pauta que o educador propõe', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3 = '', AI4 = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const propor = (token: string, corpo: Record<string, unknown>) =>
    request(http).post('/api/v1/alignments/agenda').set(auth(token)).send(corpo);
  const responder = (token: string, id: string, corpo: Record<string, unknown>) =>
    request(http).post(`/api/v1/alignments/agenda/${id}/answer`).set(auth(token)).send(corpo);
  const listar = (token: string, casa = AI3) =>
    request(http).get(`/api/v1/alignments/agenda?houseId=${casa}`).set(auth(token));
  const naoLidas = (token: string) =>
    request(http).get('/api/v1/notifications').set(auth(token));

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
      lider: 'lider.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
      noturno: 'lider.noturno@paodospobres.dev',
    })) {
      tokens[k] = (await request(http).post('/api/v1/auth/login')
        .send({ email, password: SENHA })).body.token;
    }
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
  });

  afterAll(async () => {
    /*
     * NÃO se apaga a fixture aqui: `pauta_no_delete` proíbe apagar proposta, e
     * é isso que o teste do texto imutável cobra. A primeira versão tentava, o
     * afterAll lançava, e as conexões nunca fechavam — a suíte passava e o Jest
     * ficava pendurado. O schema é recriado a cada rodada pelo globalSetup.
     */
    await app.close(); await admin.end();
  });

  it('o educador propõe, e a proposta aparece para toda a casa esperando resposta', async () => {
    const curta = await propor(tokens.educador, { houseId: AI3, texto: 'jantar' });
    expect(curta.status).toBe(400);
    expect(curta.body.message).toMatch(/quem não estava no seu turno entenda/);

    const r = await propor(tokens.educador, {
      houseId: AI3, texto: ASSUNTO,
      contexto: 'Na quarta e na quinta as menores comeram às 20h30 (teste).' });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/você lê aqui o motivo/);

    /* Quem não estava no turno dele lê a proposta — é o ponto do módulo. */
    const daTecnica = await listar(tokens.tecnica);
    const item = daTecnica.body.itens.find((i: any) => i.id === r.body.id);
    expect(item.situacao).toBe('proposta');
    expect(item.situacaoRotulo).toBe('esperando resposta');
    expect(item.por).toBeTruthy();
    expect(item.minha).toBe(false);
    expect(daTecnica.body.podeResponder).toBe(true);

    const doEducador = await listar(tokens.educador);
    expect(doEducador.body.podeResponder).toBe(false);
    expect(doEducador.body.itens.find((i: any) => i.id === r.body.id).minha).toBe(true);

    /* E a enfermagem também propõe: é de quem trabalha na casa. */
    expect((await propor(tokens.enfermagem, {
      houseId: AI3, texto: 'Rever com a equipe o horário da medicação da tarde (teste).' })).status)
      .toBe(201);
  });

  it('recusar sem resposta é impossível — no serviço e no banco', async () => {
    const { body: { id } } = await propor(tokens.educador, {
      houseId: AI3, texto: 'Rever a divisão das tarefas da cozinha aos domingos (teste).' });

    const sem = await responder(tokens.tecnica, id, { situacao: 'recusada' });
    expect(sem.status).toBe(400);
    expect(sem.body.message).toMatch(/pior do que não poder propor/);

    const adiarSem = await responder(tokens.tecnica, id, { situacao: 'adiada', resposta: 'depois' });
    expect(adiarSem.status).toBe(400);
    expect(adiarSem.body.message).toMatch(/recusa com outro nome/);

    /* E por dentro do banco também não passa. */
    await expect(admin.query(
      `UPDATE meeting_agenda_item SET status='recusada', answered_by=proposed_by, answered_at=now()
        WHERE id=$1`, [id])).rejects.toThrow(/ck_pauta_recusa_responde/);

    const r = await responder(tokens.tecnica, id, { situacao: 'recusada', resposta: RECUSA });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/Quem propôs vai ler/);
  });

  it('quem propôs lê a resposta e é avisado, inclusive quando é não', async () => {
    const { body: { id } } = await propor(tokens.educador, {
      houseId: AI3, texto: 'Combinar quem acompanha a ida ao dentista na terça (teste).' });
    expect((await responder(tokens.lider, id, { situacao: 'recusada', resposta: RECUSA })).status)
      .toBe(201);

    const lista = await listar(tokens.educador);
    const item = lista.body.itens.find((i: any) => i.id === id);
    expect(item.situacao).toBe('recusada');
    expect(item.situacaoRotulo).toBe('não entra');
    expect(item.resposta).toBe(RECUSA);
    expect(item.respondidaPor).toBeTruthy();

    const avisos = await naoLidas(tokens.educador);
    const aviso = avisos.body.find((n: any) => n.entidadeId === id);
    expect(aviso).toBeTruthy();
    expect(JSON.stringify(aviso)).toContain('não entra');
  });

  it('aceitar não exige resposta, e o texto proposto não se reescreve', async () => {
    const { body: { id } } = await propor(tokens.educador, {
      houseId: AI3, texto: 'Levar à reunião o barulho do portão à noite (teste).' });
    const r = await responder(tokens.coord, id, { situacao: 'aceita' });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/entra na pauta/);

    const denovo = await responder(tokens.tecnica, id, { situacao: 'recusada', resposta: RECUSA });
    expect(denovo.status).toBe(409);
    expect(denovo.body.message).toMatch(/já respondeu/);

    await expect(admin.query(
      `UPDATE meeting_agenda_item SET body = 'outra coisa' WHERE id=$1`, [id]))
      .rejects.toThrow(/pauta_nao_se_reescreve/);
    await expect(admin.query(`DELETE FROM meeting_agenda_item WHERE id=$1`, [id]))
      .rejects.toThrow();
  });

  it('duas respostas ao mesmo tempo: uma vale, e a outra é recusada', async () => {
    const { body: { id } } = await propor(tokens.educador, {
      houseId: AI3, texto: 'Rever o horário do banho das crianças menores (teste).' });
    const SQL = `SELECT * FROM app_responder_pauta($1,$2,$3)`;
    const r = await corrida(admin,
      { email: 'tecnica.ai3@paodospobres.dev', sql: SQL, params: [id, 'aceita', ''] },
      { email: 'lider.ai3@paodospobres.dev', sql: SQL,
        params: [id, 'recusada', 'A: este assunto já foi para a coordenação geral (teste).'] });
    expect(r).toMatch(/pauta_ja_respondida/);

    const { rows: [x] } = await admin.query(
      `SELECT status, answer FROM meeting_agenda_item WHERE id=$1`, [id]);
    expect(x.status).toBe('aceita');
    expect(x.answer).toBeNull();
  });

  it('uma casa não lê nem responde a pauta da outra', async () => {
    const { body: { id } } = await propor(tokens.educador, {
      houseId: AI3, texto: 'Assunto que a Casa 04 não deve alcançar (teste).' });
    expect((await listar(tokens.coord4, AI3)).status).toBe(404);
    const r = await responder(tokens.coord4, id, { situacao: 'recusada', resposta: RECUSA });
    expect(r.status).toBe(404);
    expect((await propor(tokens.educador, {
      houseId: AI4, texto: 'Proposta para a casa errada (teste).' })).status).toBe(404);
  });

  /*
   * O QUE FOI DECIDIDO CHEGA A QUEM NÃO ESTAVA (fase 94).
   *
   * "A maioria das reuniões é diurna e o noturno não vai." Até aqui o
   * combinado ficava visível para todos, que não é a mesma coisa que avisar.
   */
  it('a reunião com combinados avisa o plantão e o Líder Noturno, e não quem conduziu', async () => {
    const antes = async (t: string) => (await naoLidas(t)).body.length;
    const [eduAntes, notAntes, tecAntes] = await Promise.all(
      [tokens.educador, tokens.noturno, tokens.tecnica].map(antes));

    const r = await request(http).post('/api/v1/alignments/meetings').set(auth(tokens.tecnica))
      .send({ houseId: AI3, data: '2026-03-02', tipo: 'equipe',
              titulo: 'Reunião de equipe (teste)',
              combinados: [
                { texto: 'A saída para a fono passa a ser com a educadora da tarde (teste).' },
                { texto: 'Ninguém entra no quarto sem bater, em nenhum turno (teste).' },
              ] });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/Líder Noturno/);

    const avisoDe = async (t: string) =>
      (await naoLidas(t)).body.find((n: any) => n.entidadeId === r.body.id);
    const doEducador = await avisoDe(tokens.educador);
    expect(doEducador).toBeTruthy();
    expect(doEducador.titulo).toMatch(/2 combinados novos/);
    expect(doEducador.texto).toMatch(/fono/);
    expect(doEducador.texto).toMatch(/e mais 1 combinado/);
    expect(await avisoDe(tokens.noturno)).toBeTruthy();

    /* Quem conduziu a reunião não recebe aviso do que acabou de decidir. */
    expect(await avisoDe(tokens.tecnica)).toBeUndefined();
    expect((await naoLidas(tokens.tecnica)).body.length).toBe(tecAntes);
    expect((await naoLidas(tokens.educador)).body.length).toBe(eduAntes + 1);
    expect((await naoLidas(tokens.noturno)).body.length).toBe(notAntes + 1);
  });

  it('reunião sem combinado não avisa ninguém — não houve o que avisar', async () => {
    const antes = (await naoLidas(tokens.educador)).body.length;
    const r = await request(http).post('/api/v1/alignments/meetings').set(auth(tokens.coord))
      .send({ houseId: AI3, data: '2026-03-03', tipo: 'tecnica',
              titulo: 'Conversa sem combinado (teste)' });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/ninguém foi avisado/);
    expect((await naoLidas(tokens.educador)).body.length).toBe(antes);
  });
});
