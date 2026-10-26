/**
 * A FOLHA DAS VIVÊNCIAS, CONFORME O CARGO (fase 237; teste da varredura de 26/10).
 *
 * O `rotas-sem-teste.mjs` apontou o `POST /people/:id/memories/folha` sem suíte
 * nenhuma, e a exportação só com o Word aberto, sem olhar as fotos. É nessas duas
 * que mora a decisão de 23/10: a equipe técnica, os líderes, a coordenação e a
 * gestão incluem todas as fotos; os outros cargos, só as que têm a autorização de
 * imagem registrada, e a outra sai como legenda. Até aqui só o `ensaio:uso`
 * conferia, e pelo protótipo.
 *
 * O que esta suíte cobra, lendo de volta o que o servidor devolve:
 *
 *  1. o educador vê a foto sem autorização como legenda, e a tela é avisada de quantas;
 *  2. a técnica vê as duas, e o papel ganha a ressalva do uso interno;
 *  3. as escolhas (período, tipo, quais e sem fotos) mudam a folha;
 *  4. a data que não é data e o período ao contrário são recusados;
 *  5. a coordenação de outra casa não alcança a criança;
 *  6. o Word do educador leva UMA imagem, e o da técnica, DUAS.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import JSZip from 'jszip';
import { randomBytes } from 'crypto';
import { createCanvas } from '@napi-rs/canvas';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** Uma foto de verdade, que o Word consegue medir e embutir. */
function foto(cor: number): string {
  const c = createCanvas(640, 480);
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${cor}, 140, 110)`;
  g.fillRect(0, 0, 640, 480);
  return c.toBuffer('image/jpeg', 80).toString('base64');
}

describe('A folha das vivências, conforme o cargo', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const marca = randomBytes(3).toString('hex');
  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const folha = (quem: string, corpo: Record<string, unknown>) =>
    request(http).post(`/api/v1/people/${ids.crianca}/memories/folha`).set(auth(tokens[quem])).send(corpo);
  const secaoDe = (f: any, trecho: string) => f.secoes.find((s: any) => s.paragrafos.some((p: string) => p.includes(trecho)));

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
      educador: 'educador.ai3@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);
    /* A criança fora das que as outras suítes do álbum contam: o dossiê e a de quem
       aparece na foto escolhem as duas primeiras pelo identificador, que muda a cada
       banco recriado. Pelo nome só, ela caiu uma vez na do dossiê, e a foto sem
       autorização daqui virou a segunda dele (rodada adiantada de 26/10). */
    ({ rows: [{ person_id: ids.crianca }] } = await admin.query(
      `SELECT s.person_id FROM house_stay s JOIN house h ON h.id = s.house_id JOIN person p ON p.id = s.person_id
        WHERE h.code = 'AI3' AND s.status = 'ativa'
          AND s.person_id NOT IN (SELECT person_id FROM house_stay WHERE house_id = h.id AND status = 'ativa'
                                   ORDER BY person_id LIMIT 2)
        ORDER BY p.full_name OFFSET 7 LIMIT 1`));

    /* Duas vivências de 2019, fora de toda janela das outras suítes: uma com a
       autorização de imagem registrada, a outra sem. */
    const viver = async (tipo: string, quando: string, descricao: string, autorizada: boolean, cor: number) => {
      const r = await request(http).post(`/api/v1/people/${ids.crianca}/memories`).set(auth(tokens.educador))
        .send({ tipo, quando, descricao,
                fotos: [{ conteudo: foto(cor), nomeArquivo: 'vivencia.jpg', autorizacaoRegistrada: autorizada }] });
      expect(r.status).toBe(201);
      return r.body.id as string;
    };
    ids.comAutorizacao = await viver('passeio', '2019-03-10', `Passeio ao parque, com autorização (${marca})`, true, 40);
    ids.semAutorizacao = await viver('aniversario', '2019-05-20', `Aniversário na casa, sem autorização (${marca})`, false, 200);
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  const as2 = () => ({ ids: [ids.comAutorizacao, ids.semAutorizacao] });

  it('o educador vê a foto sem autorização como legenda, e a tela sabe quantas ficaram de fora', async () => {
    const r = await folha('educador', as2()).expect(201);
    expect(r.body.incluiTodasAsFotos).toBe(false);
    expect(r.body.fotosForaPeloCargo).toBe(1);
    const com = secaoDe(r.body.folha, 'com autorização');
    const sem = secaoDe(r.body.folha, 'sem autorização');
    expect(com.imagens[0].semFoto).toBeUndefined();
    expect(sem.imagens[0].semFoto).toBe('Fotografia não reproduzida: autorização de imagem não registrada');
    expect(r.body.folha.ressalva).not.toMatch(/uso interno/);
  });

  it('a técnica vê as duas, e o papel diz que é de uso interno', async () => {
    const r = await folha('tecnica', as2()).expect(201);
    expect(r.body.incluiTodasAsFotos).toBe(true);
    expect(r.body.fotosForaPeloCargo).toBe(0);
    for (const s of r.body.folha.secoes) expect(s.imagens[0].semFoto).toBeUndefined();
    expect(r.body.folha.ressalva).toMatch(/sem autorização de imagem registrada: uso interno da equipe de acolhimento/);
  });

  it('as escolhas mudam a folha: período, tipo, quais e sem fotos, da mais antiga para a mais nova', async () => {
    const periodo = await folha('educador', { de: '2019-01-01', ate: '2019-12-31' }).expect(201);
    expect(periodo.body.folha.secoes.map((s: any) => s.paragrafos[0]))
      .toEqual([`Passeio ao parque, com autorização (${marca})`, `Aniversário na casa, sem autorização (${marca})`]);
    expect(periodo.body.folha.identificacao.find((i: any) => i.rotulo === 'Período').valor).toBe('01/01/2019 a 31/12/2019');

    const tipo = await folha('educador', { ...as2(), tipos: ['aniversario'] }).expect(201);
    expect(tipo.body.folha.secoes).toHaveLength(1);
    expect(tipo.body.folha.secoes[0].paragrafos[0]).toMatch(/Aniversário/);

    const semFotos = await folha('educador', { ...as2(), comFotos: false }).expect(201);
    expect(semFotos.body.fotosForaPeloCargo).toBe(0);
    for (const s of semFotos.body.folha.secoes) expect(s.imagens).toEqual([]);

    const nada = await folha('educador', { de: '2018-01-01', ate: '2018-01-31' }).expect(201);
    expect(nada.body.folha.secoes[0].paragrafos[0]).toBe('Sem vivência registrada nas escolhas deste relatório.');
  });

  it('a data que não é data e o período ao contrário são recusados, em português', async () => {
    const torta = await folha('educador', { de: '10/03/2019' }).expect(400);
    /* Quem recusa primeiro é a conferência do corpo, com a frase de toda data. */
    expect(torta.body.message).toMatch(/^A data precisa vir como \d{4}-\d{2}-\d{2}\. Ano, mês e dia\./);
    const contrario = await folha('educador', { de: '2019-12-31', ate: '2019-01-01' }).expect(400);
    expect(contrario.body.message).toBe('A data inicial vem depois da final.');
  });

  it('a coordenação de outra casa não alcança a criança, nem na folha nem no Word', async () => {
    await folha('coord4', as2()).expect(404);
    await request(http).post(`/api/v1/people/${ids.crianca}/memories/export`).set(auth(tokens.coord4))
      .send({ ...as2(), finalidade: `Conferência (${marca})` }).expect(404);
  });

  it('o Word do educador leva uma imagem das vivências, e o da técnica, as duas', async () => {
    const imagensDoWord = async (quem: string) => {
      const r = await request(http).post(`/api/v1/people/${ids.crianca}/memories/export`).set(auth(tokens[quem]))
        .send({ ...as2(), finalidade: `Pasta do PIA (${marca})` });
      expect(r.status).toBe(201);
      const zip = await JSZip.loadAsync(Buffer.from(r.body.conteudoBase64, 'base64'));
      const doc = await zip.file('word/document.xml')!.async('string');
      /* As fotos são as imagens do corpo; o timbre mora no cabeçalho. */
      return { fotos: (doc.match(/<w:drawing>/g) ?? []).length, doc };
    };
    const educador = await imagensDoWord('educador');
    const tecnica = await imagensDoWord('tecnica');
    expect(tecnica.fotos - educador.fotos).toBe(1);
    expect(educador.doc).toMatch(/Fotografia não reproduzida: autorização de imagem não registrada/);
    expect(tecnica.doc).not.toMatch(/Fotografia não reproduzida/);
    expect(tecnica.doc).toMatch(/uso interno da equipe de acolhimento/);
  });
});
