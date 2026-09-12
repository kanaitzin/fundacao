/**
 * O ESTATUTO — as regras de convivência (fase 95, migração 1150).
 *
 * O que esta suíte defende:
 *  - regra da CASA é da coordenação; regra da INSTITUIÇÃO é só do Gestor Geral,
 *    e aparece nas oito casas sem que nenhuma a edite;
 *  - o texto é imutável: mudar é escrever outra que substitui, e a anterior
 *    continua legível — quem foi advertido em março tem direito a ler a regra
 *    de março;
 *  - revogar exige motivo;
 *  - a folha que vai para a parede filtra por PÚBLICO: a folha das crianças
 *    não leva regra da equipe. Procurado no Word ABERTO, com sentinela;
 *  - regra com início no futuro aparece na tela dizendo que ainda não vale, e
 *    NÃO vai para a folha afixada;
 *  - o educador lê e não escreve.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { dentroDoDocx } from './setup/dentro-do-docx';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const REGRA_EQUIPE = 'Não se fala do processo judicial da criança na frente dela (sentinela E7).';
const REGRA_CRIANCAS = 'O silêncio no corredor começa às 22h, para quem dorme cedo (teste).';
const REGRA_INSTITUICAO = 'Nenhuma criança é chamada por apelido que ela não escolheu (teste).';
const MOTIVO = 'A rotina da casa mudou com o horário novo da escola (teste).';

describe('O estatuto — regras de convivência', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3 = '', AI4 = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const escrever = (token: string, corpo: Record<string, unknown>) =>
    request(http).post('/api/v1/alignments/statute').set(auth(token)).send(corpo);
  const ler = (token: string, casa = AI3) =>
    request(http).get(`/api/v1/alignments/statute?houseId=${casa}`).set(auth(token));
  const revogar = (token: string, id: string, motivo: string) =>
    request(http).post(`/api/v1/alignments/statute/${id}/revoke`).set(auth(token)).send({ motivo });
  const folha = (token: string, publico: string, casa = AI3) =>
    request(http).get(`/api/v1/alignments/statute/folha?houseId=${casa}&publico=${publico}`)
      .set(auth(token));
  const regraDe = (body: any, id: string) => body.regras.find((r: any) => r.id === id);

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
      coord: 'coord.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) {
      tokens[k] = (await request(http).post('/api/v1/auth/login')
        .send({ email, password: SENHA })).body.token;
    }
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('a coordenação escreve a regra da casa, com público e data; o educador lê e não escreve', async () => {
    const curta = await escrever(tokens.coord, { houseId: AI3, texto: 'silêncio' });
    expect(curta.status).toBe(400);
    expect(curta.body.message).toMatch(/quem chegar depois de você/);

    const r = await escrever(tokens.coord, {
      houseId: AI3, texto: REGRA_CRIANCAS, publico: 'acolhidos' });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/parede/);

    const e = await escrever(tokens.coord, {
      houseId: AI3, texto: REGRA_EQUIPE, publico: 'equipe' });
    expect(e.status).toBe(201);

    const lida = await ler(tokens.educador);
    expect(lida.status).toBe(200);
    expect(lida.body.podeEscrever).toBe(false);
    const daCrianca = regraDe(lida.body, r.body.id);
    expect(daCrianca.publicoRotulo).toBe('Crianças e adolescentes');
    expect(daCrianca.origem).toBe('Regra desta casa');
    expect(daCrianca.situacao).toBe('vigente');
    expect(daCrianca.aindaNaoVale).toBe(false);

    const tentativa = await escrever(tokens.educador, { houseId: AI3, texto: REGRA_CRIANCAS });
    expect(tentativa.status).toBe(403);
    expect(tentativa.body.message).toMatch(/Ler é de todo mundo/);
  });

  it('a regra da instituição é só do Gestor Geral, e aparece nas duas casas', async () => {
    const daCoord = await escrever(tokens.coord, {
      houseId: AI3, texto: REGRA_INSTITUICAO, daInstituicao: true });
    expect(daCoord.status).toBe(403);
    expect(daCoord.body.message).toMatch(/oito casas/);

    const r = await escrever(tokens.gestor, {
      houseId: AI3, texto: REGRA_INSTITUICAO, daInstituicao: true, publico: 'todos' });
    expect(r.status).toBe(201);

    for (const [token, casa] of [[tokens.coord, AI3], [tokens.coord4, AI4]] as const) {
      const lida = await ler(token, casa);
      const regra = regraDe(lida.body, r.body.id);
      expect(regra).toBeTruthy();
      expect(regra.daInstituicao).toBe(true);
      expect(regra.origem).toBe('Regra da instituição');
    }
    /* E a coordenação da casa não a revoga. */
    const tenta = await revogar(tokens.coord, r.body.id, MOTIVO);
    expect([403, 404]).toContain(tenta.status);
  });

  it('mudar é escrever outra: o texto não se reescreve e a anterior continua legível', async () => {
    const velha = await escrever(tokens.coord, {
      houseId: AI3, texto: 'A TV da sala desliga às 21h nos dias de aula (teste).',
      publico: 'acolhidos' });
    const nova = await escrever(tokens.coord, {
      houseId: AI3, texto: 'A TV da sala desliga às 21h30 nos dias de aula (teste).',
      publico: 'acolhidos', substituiId: velha.body.id });
    expect(nova.status).toBe(201);
    expect(nova.body.aviso).toMatch(/continua legível/);

    const lida = await ler(tokens.educador);
    expect(regraDe(lida.body, velha.body.id).situacao).toBe('substituida');
    expect(regraDe(lida.body, velha.body.id).texto).toMatch(/21h nos dias/);
    expect(regraDe(lida.body, nova.body.id).situacao).toBe('vigente');
    expect(regraDe(lida.body, nova.body.id).substitui).toBe(velha.body.id);

    await expect(admin.query(
      `UPDATE house_statute SET body = 'outra coisa' WHERE id = $1`, [nova.body.id]))
      .rejects.toThrow(/estatuto_nao_se_reescreve/);
    await expect(admin.query(`DELETE FROM house_statute WHERE id = $1`, [nova.body.id]))
      .rejects.toThrow();

    /* Substituir duas vezes a mesma: a segunda é recusada. */
    const outra = await escrever(tokens.coord, {
      houseId: AI3, texto: 'A TV da sala desliga às 22h nos dias de aula (teste).',
      publico: 'acolhidos', substituiId: velha.body.id });
    expect(outra.status).toBe(409);
  });

  it('revogar exige motivo, e a regra revogada continua legível com ele', async () => {
    const r = await escrever(tokens.coord, {
      houseId: AI3, texto: 'O lanche da noite é servido até as 21h (teste).' });
    const sem = await revogar(tokens.coord, r.body.id, 'acabou');
    expect(sem.status).toBe(400);
    expect(sem.body.message).toMatch(/apagou por engano/);

    expect((await revogar(tokens.coord, r.body.id, MOTIVO)).status).toBe(201);
    const lida = await ler(tokens.educador);
    const regra = regraDe(lida.body, r.body.id);
    expect(regra.situacao).toBe('revogada');
    expect(regra.motivoDaSituacao).toBe(MOTIVO);
    expect(regra.mudadaPor).toBeTruthy();

    expect((await revogar(tokens.coord, r.body.id, MOTIVO)).status).toBe(409);
  });

  it('a regra que ainda não vale aparece na tela dizendo isso, e não vai para a parede', async () => {
    const amanha = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    const r = await escrever(tokens.coord, {
      houseId: AI3, texto: 'A escala de louça passa a ser por dupla (sentinela F9).',
      publico: 'todos', desde: amanha });
    expect(r.status).toBe(201);

    const regra = regraDe((await ler(tokens.educador)).body, r.body.id);
    expect(regra.aindaNaoVale).toBe(true);
    expect(regra.desde.slice(0, 10)).toBe(amanha);

    const f = await folha(tokens.coord, 'todos');
    expect(JSON.stringify(f.body)).not.toContain('sentinela F9');
  });

  it('a folha das crianças não leva regra da equipe — conferido no Word aberto', async () => {
    const daCrianca = await folha(tokens.coord, 'acolhidos');
    expect(daCrianca.status).toBe(200);
    const texto = JSON.stringify(daCrianca.body);
    expect(texto).toContain('silêncio no corredor');
    expect(texto).not.toContain('sentinela E7');
    expect(daCrianca.body.subtitulo).toMatch(/crianças e adolescentes/i);
    /* A regra da instituição, que é para todos, entra na folha das crianças. */
    expect(texto).toContain('apelido que ela não escolheu');

    const daEquipe = await folha(tokens.coord, 'equipe');
    expect(JSON.stringify(daEquipe.body)).toContain('sentinela E7');

    const semFinalidade = await request(http).post('/api/v1/alignments/statute/export')
      .set(auth(tokens.coord)).send({ houseId: AI3, publico: 'acolhidos', finalidade: 'curta' });
    expect(semFinalidade.status).toBe(400);

    const finalidade = 'Afixar as regras no corredor das crianças (teste).';
    const exp = await request(http).post('/api/v1/alignments/statute/export')
      .set(auth(tokens.coord)).send({ houseId: AI3, publico: 'acolhidos', finalidade });
    expect(exp.status).toBe(201);
    const xml = dentroDoDocx(exp.body.conteudoBase64).conteudo['word/document.xml'];
    expect(xml).toMatch(/silêncio no corredor/);
    expect(xml).not.toContain('sentinela E7');
    expect(xml).not.toContain('sentinela F9');

    const { rows: [ev] } = await admin.query(
      `SELECT purpose FROM audit_event WHERE action='documento.export' AND entity='estatuto'
        ORDER BY at DESC LIMIT 1`);
    expect(ev.purpose).toBe(finalidade);
  });

  it('uma casa não lê nem escreve o estatuto da outra', async () => {
    expect((await ler(tokens.coord4, AI3)).status).toBe(404);
    expect((await escrever(tokens.coord4, {
      houseId: AI3, texto: 'Regra que a Casa 04 não pode escrever aqui (teste).' })).status)
      .toBe(404);
  });
});
