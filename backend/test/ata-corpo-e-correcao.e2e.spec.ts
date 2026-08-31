/**
 * O CORPO DA ATA E A CORREÇÃO (§12.5, §12.7).
 *
 * Dois silêncios, encontrados em 31/08/2026:
 *
 *  * `PATCH /shifts/ata/:id` existia desde a fase 5 e nenhuma tela o chamava.
 *    O campo `content` da ATA nunca recebia nada: fechava-se, todo dia, uma
 *    ATA VAZIA — dezesseis seções transcritas do livro de papel da Casa 03,
 *    servidas pelo servidor, e nenhuma escrita;
 *  * reabrir e corrigir também não tinham porta. Uma ATA fechada com pendência
 *    ficava fechada com a pendência, sem caminho para o complemento.
 *
 * O que este teste guarda:
 *
 *  * escreve-se enquanto a ATA está aberta; fechada, o servidor RECUSA — e a
 *    recusa diz o caminho, em vez de dizer "não";
 *  * reabrir grava o estado ANTERIOR no adendo antes de qualquer alteração;
 *  * corrigir grava o antes e o depois, e é a equipe técnica ou a coordenação
 *    quem faz — o líder que fechou não corrige sozinho;
 *  * motivo curto é recusado: "erro" não explica nada a quem ler a ATA no ano
 *    que vem, e é essa pessoa que o adendo existe para servir.
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
/* Um dia só desta suíte: fechar a ATA de hoje disputaria com as outras. */
const DIA = emPortoAlegre(new Date(Date.now() - 6 * 86_400_000));

describe('O corpo da ATA e a correção', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const conteudoNoBanco = async () => (await admin.query(
    `SELECT content, status FROM ata WHERE id = $1`, [ids.ata])).rows[0];

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

    const plantao = await request(http).post('/api/v1/shifts').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, data: DIA, turno: 'diurno' });
    ids.plantao = plantao.body.plantaoId;
    ids.ata = plantao.body.ataId;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== A estrutura ====================

  it('o servidor serve as seções do livro de papel, e os ambientes da casa', async () => {
    const res = await request(http).get('/api/v1/shifts/ata-sections').set(auth(tokens.lider));
    expect(res.status).toBe(200);
    // Dezesseis seções, cada uma com chave, título, tipo e ajuda — e não um
    // par {cod,label} inventado pela tela.
    expect(res.body.secoes.length).toBeGreaterThan(10);
    for (const s of res.body.secoes) {
      expect(typeof s.chave).toBe('string');
      expect(typeof s.titulo).toBe('string');
      expect(typeof s.obrigatoria).toBe('boolean');
    }
    // A seção "Organização da casa" precisa dos ambientes para ser desenhada.
    expect(res.body.ambientes.length).toBeGreaterThan(3);
    expect(res.body.secoes.some((s: any) => s.tipo === 'checklist_ambientes')).toBe(true);
  });

  // ==================== O corpo ====================

  it('escreve-se no corpo da ATA enquanto ela está aberta', async () => {
    const res = await request(http).patch(`/api/v1/shifts/ata/${ids.ata}`)
      .set(auth(tokens.lider))
      .send({ conteudo: {
        equipe_presente: 'Mário Silva e Joana Lima.',
        acolhidos: 'Vinte acolhidos, sem intercorrência (ficção de teste).',
        organizacao: 'Cozinha: organizada. Banheiros: organizados.',
      } });
    expect(res.status).toBe(200);

    const gravado = await conteudoNoBanco();
    expect(gravado.content.acolhidos).toContain('Vinte acolhidos');
    // A organização descreve o AMBIENTE, e é assim que ela é guardada.
    expect(gravado.content.organizacao).toContain('Cozinha');
  });

  it('a ATA fechada não é reescrita, e a recusa diz o caminho', async () => {
    const fechou = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/close`)
      .set(auth(tokens.lider))
      .send({ pendencias: 'Fechada no ensaio automatizado do corpo da ATA.' });
    expect([201, 400]).toContain(fechou.status);

    const res = await request(http).patch(`/api/v1/shifts/ata/${ids.ata}`)
      .set(auth(tokens.lider)).send({ conteudo: { acolhidos: 'TEXTO QUE NÃO PODE ENTRAR' } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/reabertura|adendo/i);

    const gravado = await conteudoNoBanco();
    expect(JSON.stringify(gravado.content)).not.toContain('NÃO PODE ENTRAR');
  });

  // ==================== A correção ====================

  it('o líder que fechou não reabre sozinho — a reabertura é da técnica e da coordenação', async () => {
    const res = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/reopen`)
      .set(auth(tokens.lider))
      .send({ motivo: 'Quero corrigir o horário anotado na seção da Enfermagem.' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/equipe técnica|coordenação/i);
  });

  it('motivo curto é recusado: o adendo serve quem vai ler daqui a um ano', async () => {
    const res = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/reopen`)
      .set(auth(tokens.coord)).send({ motivo: 'erro' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/15/);
  });

  it('reabrir grava o estado ANTERIOR antes de qualquer alteração', async () => {
    const antesDeReabrir = (await conteudoNoBanco()).content;

    const res = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/reopen`)
      .set(auth(tokens.coord))
      .send({ motivo: 'O horário do acionamento da Enfermagem foi anotado errado no turno.' });
    expect(res.status).toBe(201);

    const adendos = await request(http).get(`/api/v1/shifts/ata/${ids.ata}/addenda`)
      .set(auth(tokens.coord));
    const reabertura = adendos.body.find((a: any) => a.tipo === 'reabertura');
    expect(reabertura).toBeTruthy();
    /*
     * O adendo guarda o estado EMBRULHADO: `{status, versao, conteudo}` na
     * reabertura e `{conteudo}` na correção. A tela precisa saber disso — ela
     * presumia o texto cru e mostrava uma lista de mudanças vazia.
     */
    expect(reabertura.antes.conteudo).toEqual(antesDeReabrir);
    expect(reabertura.antes.status).toBe('fechada_com_pendencia');
    expect(reabertura.motivo).toMatch(/Enfermagem/);
    expect(reabertura.autor).toBeTruthy();
  });

  it('a correção grava o antes e o depois, e a versão anterior não se perde', async () => {
    const antes = (await conteudoNoBanco()).content;

    const res = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/amend`)
      .set(auth(tokens.coord))
      .send({
        motivo: 'O acionamento da Enfermagem foi às 23h10, e não às 21h como constava.',
        conteudo: { ...antes, enfermagem: 'Acionada às 23h10; orientação por telefone.' },
      });
    expect(res.status).toBe(201);

    const adendos = await request(http).get(`/api/v1/shifts/ata/${ids.ata}/addenda`)
      .set(auth(tokens.coord));
    const correcao = adendos.body.find((a: any) => a.tipo === 'correcao');
    expect(correcao).toBeTruthy();
    // O antes continua legível: é essa a diferença entre corrigir e apagar.
    expect(correcao.antes.conteudo).toEqual(antes);
    expect(correcao.depois.conteudo.enfermagem).toContain('23h10');

    const agora = await conteudoNoBanco();
    expect(agora.content.enfermagem).toContain('23h10');
    // E o resto do texto sobreviveu à correção de uma seção só.
    expect(agora.content.acolhidos).toContain('Vinte acolhidos');
  });

  it('corrigir sem reabrir é recusado — a reabertura é o que grava o anterior', async () => {
    const res = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/amend`)
      .set(auth(tokens.coord))
      .send({ motivo: 'Tentativa de corrigir sem reabrir, no ensaio automatizado.',
              conteudo: { acolhidos: 'não deve entrar' } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/reabrir/i);
  });
});
