/**
 * EPISÓDIOS DO TURNO (§12.5).
 *
 * `POST /shifts/ata/:id/episodes` e `POST /shifts/episodes/:id/ack` existiam
 * desde a fase 5 e nunca tiveram porta. O que acontecia de madrugada — a briga,
 * a saída não autorizada, a crise às 2h20 — ou virava texto solto dentro de uma
 * seção da ATA, ou não era registrado em lugar nenhum.
 *
 * O que este teste guarda:
 *
 *  * o relato é IMUTÁVEL. Não existe rota que o altere, e o banco tem gatilho
 *    que recusa UPDATE e DELETE — quem discorda registra CIÊNCIA, com
 *    comentário próprio, e as duas coisas ficam lado a lado com nomes
 *    distintos;
 *  * a classificação descreve o FATO. Não existe classificação da pessoa, nem
 *    gravidade, nem nota (§2) — e o servidor recusa código que não seja um dos
 *    sete;
 *  * o episódio pertence à CASA onde o acolhido está. Registrar sobre criança
 *    de outra casa é recusado pela RLS, e a recusa diz por quê;
 *  * a ciência é ato PESSOAL e única por pessoa: a segunda tentativa da mesma
 *    conta é recusada, e ninguém registra ciência no lugar de outro;
 *  * o episódio sobrevive ao fechamento da ATA e continua legível depois.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const emPortoAlegre = (d: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);
/*
 * Um dia só desta suíte, e longe de hoje. Fechar a ATA de hoje disputaria com
 * `plantao.e2e`, e a suíte rodada duas vezes seguidas descobriria a disputa na
 * segunda rodada — que foi exatamente como a contaminação entre `arquivo-atas`
 * e `plantao` apareceu em 31/08.
 */
const DIA = emPortoAlegre(new Date(Date.now() - 9 * 86_400_000));

describe('Episódios do turno', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const plantao = async (token: string) =>
    (await request(http).get(`/api/v1/shifts/${ids.plantao}`).set(auth(token))).body;

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
      coord: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    // Um acolhido ATIVO nesta casa — a política de INSERT do episódio exige a
    // permanência ativa, e não a simples existência da pessoa.
    ({ rows: [{ person_id: ids.acolhido }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa' LIMIT 1`, [ids.AI3]));
    // E um acolhido de OUTRA casa, para a recusa por alcance.
    ({ rows: [{ person_id: ids.deOutraCasa }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id <> $1 AND status = 'ativa' LIMIT 1`, [ids.AI3]));

    const abertura = await request(http).post('/api/v1/shifts').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, data: DIA, turno: 'noturno' });
    ids.plantao = abertura.body.plantaoId;
    ids.ata = abertura.body.ataId;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== O registro ====================

  it('a classificação descreve o fato, e o servidor recusa o que não é dela', async () => {
    const secoes = await request(http).get('/api/v1/shifts/ata-sections').set(auth(tokens.lider));
    expect(secoes.status).toBe(200);
    const codigos = secoes.body.classificacoesEpisodio.map((c: any) => c.code);
    expect(codigos).toContain('briga_conflito');
    // Nenhuma classificação é da PESSOA: sem gravidade, sem nota, sem nível.
    expect(codigos.join(' ')).not.toMatch(/grave|leve|nivel|nota|risco/i);

    const res = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/episodes`)
      .set(auth(tokens.lider))
      .send({ acolhidoId: ids.acolhido, classificacao: 'crianca_dificil',
              relato: 'Relato objetivo com mais de dez caracteres.' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/classifica/i);
  });

  it('relato curto é recusado, e a recusa diz o que escrever', async () => {
    const res = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/episodes`)
      .set(auth(tokens.lider))
      .send({ acolhidoId: ids.acolhido, classificacao: 'desorganizacao', relato: 'brigou' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/o que aconteceu/i);
  });

  it('o episódio é da casa onde o acolhido está — outra casa é recusada', async () => {
    const res = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/episodes`)
      .set(auth(tokens.lider))
      .send({ acolhidoId: ids.deOutraCasa, classificacao: 'desorganizacao',
              relato: 'Fato objetivo do ensaio automatizado, com mais de dez caracteres.' });
    expect([400, 403]).toContain(res.status);
    expect(res.body.message).toMatch(/casa/i);
  });

  it('registrado uma vez, aparece na ATA com o horário real do fato', async () => {
    // 2h20 do dia do plantão: o episódio da madrugada é escrito às 6h, na troca
    // do turno, e gravá-lo com a hora do formulário perderia o único dado que a
    // próxima leitura vai querer.
    const quando = new Date(`${DIA}T02:20:00-03:00`).toISOString();
    const res = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/episodes`)
      .set(auth(tokens.lider))
      .send({ acolhidoId: ids.acolhido, classificacao: 'desorganizacao', happenedAt: quando,
              relato: 'Por volta das 2h20 acordou chorando e não quis voltar para o quarto; '
                    + 'ficou na sala com a educadora até as 3h05 e dormiu em seguida.' });
    expect(res.status).toBe(201);
    expect(res.body.aviso).toMatch(/não pode ser alterado/i);
    ids.episodio = res.body.id;

    const p = await plantao(tokens.lider);
    const ep = p.episodios.find((e: any) => e.id === ids.episodio);
    expect(ep).toBeTruthy();
    expect(ep.relato).toMatch(/acordou chorando/);
    expect(new Date(ep.quando).toISOString()).toBe(quando);
    expect(ep.registradoPor).toBeTruthy();
    expect(ep.ciencias).toBe(0);
  });

  it('não existe rota que altere o relato, e o banco recusa por baixo', async () => {
    // Nenhum PATCH e nenhum DELETE respondem — e mesmo com a conexão de
    // administrador o gatilho recusa. É a garantia que a tela promete.
    const patch = await request(http).patch(`/api/v1/shifts/episodes/${ids.episodio}`)
      .set(auth(tokens.coord)).send({ relato: 'texto reescrito' });
    expect([404, 405]).toContain(patch.status);

    await expect(admin.query(
      `UPDATE ata_episode SET factual = 'reescrito' WHERE id = $1`, [ids.episodio],
    )).rejects.toThrow();
    await expect(admin.query(
      `DELETE FROM ata_episode WHERE id = $1`, [ids.episodio],
    )).rejects.toThrow();

    const p = await plantao(tokens.lider);
    expect(p.episodios.find((e: any) => e.id === ids.episodio).relato)
      .toMatch(/acordou chorando/);
  });

  // ==================== A ciência ====================

  it('a ciência nasce ao lado, com nome próprio, sem tocar no relato', async () => {
    const res = await request(http).post(`/api/v1/shifts/episodes/${ids.episodio}/ack`)
      .set(auth(tokens.tecnica))
      .send({ comentario: 'Acompanhei pela manhã; acordou bem e foi para a escola no horário.' });
    expect(res.status).toBe(201);
    expect(res.body.aviso).toMatch(/permanece como foi escrito/i);

    const p = await plantao(tokens.tecnica);
    const ep = p.episodios.find((e: any) => e.id === ids.episodio);
    expect(ep.ciencias).toBe(1);
    expect(ep.cienciaPropria).toBe(true);
    expect(ep.quemDeuCiencia[0].comentario).toMatch(/foi para a escola/);
    // O relato continua exatamente como foi escrito pelo colega da noite.
    expect(ep.relato).toMatch(/acordou chorando/);
    expect(ep.relato).not.toMatch(/foi para a escola/);
  });

  it('ciência é de quem a dá: a segunda da mesma conta é recusada', async () => {
    const res = await request(http).post(`/api/v1/shifts/episodes/${ids.episodio}/ack`)
      .set(auth(tokens.tecnica)).send({ comentario: 'De novo.' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/já registrou/i);
  });

  it('para quem NÃO deu ciência, a tela sabe que ainda falta a dele', async () => {
    const p = await plantao(tokens.coord);
    const ep = p.episodios.find((e: any) => e.id === ids.episodio);
    expect(ep.cienciaPropria).toBe(false);
    // Mas ele vê a da colega, com nome — ciência anônima não é ciência.
    expect(ep.quemDeuCiencia).toHaveLength(1);
    expect(ep.quemDeuCiencia[0].quem).toBeTruthy();
  });

  it('a ciência de cada um é a sua: o comentário fica no nome de quem escreveu', async () => {
    await request(http).post(`/api/v1/shifts/episodes/${ids.episodio}/ack`)
      .set(auth(tokens.coord)).send({});
    const p = await plantao(tokens.coord);
    const ep = p.episodios.find((e: any) => e.id === ids.episodio);
    expect(ep.ciencias).toBe(2);
    const nomes = ep.quemDeuCiencia.map((k: any) => k.quem);
    expect(new Set(nomes).size).toBe(2);
    // Comentário é OPCIONAL: obrigar a escrever produz "ciente" vinte vezes.
    expect(ep.quemDeuCiencia.some((k: any) => k.comentario === null)).toBe(true);
  });

  // ==================== Depois do fechamento ====================

  it('a ATA fechada não recebe episódio novo, e o que já entrou continua legível', async () => {
    // Quem fecha é a coordenação: este é um plantão NOTURNO, e o Líder Diurno
    // não fecha a ATA de um turno que não foi o dele.
    const fechou = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/close`)
      .set(auth(tokens.coord))
      .send({ pendencias: 'Fechada no ensaio automatizado dos episódios do turno.' });
    expect([201, 400]).toContain(fechou.status);

    const res = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/episodes`)
      .set(auth(tokens.lider))
      .send({ acolhidoId: ids.acolhido, classificacao: 'saude',
              relato: 'Episódio que não pode entrar numa ATA já fechada.' });
    expect([400, 403]).toContain(res.status);

    const p = await plantao(tokens.lider);
    expect(p.episodios.find((e: any) => e.id === ids.episodio).relato)
      .toMatch(/acordou chorando/);
  });

  it('tudo ficou auditado, com autor — nada é anônimo (regra 6)', async () => {
    const { rows } = await admin.query(
      `SELECT action, actor_id FROM audit_event
        WHERE entity = 'ata_episode' AND entity_id = $1 ORDER BY at`, [ids.episodio]);
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['ata.episode', 'ata.episode_ack']));
    for (const r of rows) expect(r.actor_id).toBeTruthy();
  });
});
