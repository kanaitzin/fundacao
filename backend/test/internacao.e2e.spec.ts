/**
 * INTERNAÇÃO HOSPITALAR — a criança que está no hospital e continua da casa.
 *
 * Pedido da coordenação em 03/09/2026, e as respostas dela são as regras que
 * esta suíte guarda:
 *
 *  * **a criança continua da casa.** Continua na contagem, continua ocupando a
 *    vaga. Ela só sai do sistema quando a técnica ou a coordenação a
 *    removerem, com motivo — e aí é saída, que é outra coisa;
 *  * **ela sai da linha do dia**: some da chamada e da grade de medicação, e
 *    volta sozinha na alta;
 *  * **abrir e encerrar é da técnica e da coordenação**;
 *  * **o educador social comum não vê** — com a exceção do designado para
 *    acompanhar, que precisa escrever o relato do dia;
 *  * **a medicação dada no hospital entra no sistema com a origem escrita.**
 *    Ela não entra na grade da casa: registrá-la lá faria a casa aparecer
 *    administrando o que não administrou;
 *  * **o relato diário não é obrigatório** e não vira pendência de ninguém. O
 *    que o sistema conta é quantos dias TÊM relato, não quantos faltam;
 *  * **nada disto se apaga.**
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Internação hospitalar', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let AI3 = '', crianca = '', nomeDaCrianca = '', internacao = '', chamada = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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
      enfermagem: 'enfermagem@paodospobres.dev',
    })) {
      const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
      tokens[k] = r.body.token;
      ids[k] = r.body.user?.id ?? '';
    }

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: crianca, nome: nomeDaCrianca }] } = await admin.query(
      `SELECT hs.person_id AS id, coalesce(nullif(p.social_name,''), p.full_name) AS nome
         FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name LIMIT 1`, [AI3]));
    ({ rows: [{ id: ids.educadorUser }] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'educador.ai3@paodospobres.dev'`));
  });

  afterAll(async () => {
    /* Internação não se apaga — é a regra que esta suíte testa. O que ela
     * cria fica, e quem limpa é o `globalSetup`, recriando o schema. */
    await app.close(); await admin.end();
  });

  it('o educador não abre internação', async () => {
    const r = await request(http).post('/api/v1/nursing/hospitalizations')
      .set(auth(tokens.educador))
      .send({ personId: crianca, houseId: AI3, hospital: 'Hospital Fictício',
              motivo: 'tentativa do educador, deve ser recusada' });
    expect(r.status).toBe(403);
  });

  it('abrir exige hospital e um motivo que explique alguma coisa', async () => {
    const semHospital = await request(http).post('/api/v1/nursing/hospitalizations')
      .set(auth(tokens.tecnica))
      .send({ personId: crianca, houseId: AI3, motivo: 'crise respiratória (fictícia)' });
    expect(semHospital.status).toBe(400);

    const motivoCurto = await request(http).post('/api/v1/nursing/hospitalizations')
      .set(auth(tokens.tecnica))
      .send({ personId: crianca, houseId: AI3, hospital: 'Hospital Fictício',
              /* "internação" tem exatamente 10 caracteres e PASSARIA. O caso
               * curto precisa ser curto de verdade — a primeira versão deste
               * teste criou, sem querer, a internação que o teste seguinte
               * tentava criar, e o erro apareceu três testes adiante. */
              motivo: 'internou' });
    expect(motivoCurto.status).toBe(400);
    expect(motivoCurto.body.message).toMatch(/não explica nada/);
  });

  it('a técnica abre, e a criança sai da chamada e da grade da casa', async () => {
    /* Antes: a criança está na lista de quem falta conferir. */
    const abrindo = await request(http).post('/api/v1/checks')
      .set(auth(tokens.coord))
      .send({ houseId: AI3, kind: 'alimentacao', titulo: 'Almoço (teste de internação)' });
    chamada = abrindo.body.id ?? abrindo.body.checkId;
    const antes = await request(http).get(`/api/v1/checks/${chamada}`).set(auth(tokens.educador));
    expect(antes.body.linhas.some((l: any) => l.acolhidoId === crianca)).toBe(true);

    const r = await request(http).post('/api/v1/nursing/hospitalizations')
      .set(auth(tokens.tecnica))
      .send({ personId: crianca, houseId: AI3, hospital: 'Hospital Fictício da Criança',
              motivo: 'Crise respiratória fictícia; internada para observação.' });
    expect(r.status).toBe(201);
    internacao = r.body.id;
    expect(r.body.aviso).toMatch(/sai da chamada/);

    /* Depois: some da chamada — de uma NOVA chamada, porque na anterior ela
     * já tinha sido vista, e o registro de quem já foi olhado não some. */
    const outra = await request(http).post('/api/v1/checks')
      .set(auth(tokens.coord))
      .send({ houseId: AI3, kind: 'alimentacao', titulo: 'Janta (teste de internação)' });
    const depois = await request(http)
      .get(`/api/v1/checks/${outra.body.id ?? outra.body.checkId}`).set(auth(tokens.educador));
    expect(depois.body.linhas.some((l: any) => l.acolhidoId === crianca)).toBe(false);

    /* E some da grade de medicação. */
    const grade = await request(http).get(`/api/v1/medications?houseId=${AI3}`)
      .set(auth(tokens.enfermagem));
    expect(grade.body.some((d: any) => d.acolhido?.id === crianca)).toBe(false);
  });

  it('a criança CONTINUA da casa: a vaga segue ocupada', async () => {
    /*
     * A diferença entre internação e saída. Saída manda a criança para o
     * acervo e libera a vaga; internação não mexe em nenhuma das duas coisas.
     */
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM house_stay
        WHERE house_id = $1 AND status = 'ativa' AND person_id = $2`, [AI3, crianca]);
    expect(rows[0].n).toBe(1);

    const lista = await request(http).get(`/api/v1/people?houseId=${AI3}`)
      .set(auth(tokens.coord));
    expect(lista.body.some((p: any) => p.id === crianca)).toBe(true);
  });

  it('duas internações abertas para a mesma criança não existem', async () => {
    const r = await request(http).post('/api/v1/nursing/hospitalizations')
      .set(auth(tokens.tecnica))
      .send({ personId: crianca, houseId: AI3, hospital: 'Outro Hospital Fictício',
              motivo: 'segunda internação, que não deve ser aceita' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/já tem uma internação aberta/);
  });

  it('o educador comum não vê a internação; o designado para acompanhar, sim', async () => {
    const semAlcance = await request(http).get(`/api/v1/nursing/hospitalizations/${internacao}`)
      .set(auth(tokens.educador));
    expect([403, 404]).toContain(semAlcance.status);

    const designou = await request(http)
      .post(`/api/v1/nursing/hospitalizations/${internacao}/companion`)
      .set(auth(tokens.coord))
      .send({ userId: ids.educadorUser, observacao: 'Visitas da tarde nesta semana.' });
    expect(designou.status).toBe(201);

    const agoraVe = await request(http).get(`/api/v1/nursing/hospitalizations/${internacao}`)
      .set(auth(tokens.educador));
    expect(agoraVe.status).toBe(200);
    expect(agoraVe.body.acolhido).toBe(nomeDaCrianca);

    /* E escreve o relato do dia — que é a razão de ele alcançar. */
    const relato = await request(http)
      .post(`/api/v1/nursing/hospitalizations/${internacao}/notes`)
      .set(auth(tokens.educador))
      .send({ tipo: 'relato', texto: 'Visita da tarde: acordada, comeu bem, pediu o urso.' });
    expect(relato.status).toBe(201);
  });

  it('o relato exige texto — o anexo sozinho não conta a história', async () => {
    const r = await request(http)
      .post(`/api/v1/nursing/hospitalizations/${internacao}/notes`)
      .set(auth(tokens.tecnica))
      .send({ tipo: 'exame', conteudo: Buffer.from('%PDF-1.7 fictício').toString('base64') });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/daqui a um ano/);
  });

  it('a medicação do hospital entra com a origem escrita, e não na grade da casa', async () => {
    /*
     * A contagem é RELATIVA ao que já estava no banco (regra 13).
     *
     * A primeira versão contava as doses da criança numa janela de cinco
     * minutos e esperava zero — e falhava de vez em quando, porque
     * `medication_administration` é compartilhada: os seeds e as outras
     * suítes escrevem lá dentro da mesma janela. O teste acusava um defeito
     * que não existia, e uma suíte que falha às vezes é pior do que uma suíte
     * que falta: ensina a rodar de novo até passar.
     */
    const { rows: [{ n: antesDaDose }] } = await admin.query(
      `SELECT count(*)::int AS n FROM medication_administration WHERE person_id = $1`,
      [crianca]);

    const r = await request(http)
      .post(`/api/v1/nursing/hospitalizations/${internacao}/medications`)
      .set(auth(tokens.enfermagem))
      .send({ medicamento: 'Antibiótico fictício', dose: '500 mg', via: 'endovenosa',
              observacao: 'Prescrito pelo hospital.' });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/PELO HOSPITAL/);

    const periodo = await request(http).get(`/api/v1/nursing/hospitalizations/${internacao}`)
      .set(auth(tokens.tecnica));
    const med = periodo.body.medicacaoNoHospital[0];
    expect(med.medicamento).toBe('Antibiótico fictício');
    expect(med.origem).toBe('Administrada pelo hospital');
    /* Ninguém da casa aparece como quem administrou: só quem REGISTROU. */
    expect(Object.keys(med)).not.toContain('administradaPor');

    /* E ela não entra na grade da casa: a tabela da casa não mudou de tamanho. */
    const { rows: [{ n: depoisDaDose }] } = await admin.query(
      `SELECT count(*)::int AS n FROM medication_administration WHERE person_id = $1`,
      [crianca]);
    expect(depoisDaDose).toBe(antesDaDose);
  });

  it('o diário conta os dias COM relato, e não os que faltam', async () => {
    const lista = await request(http).get(`/api/v1/nursing/hospitalizations?houseId=${AI3}`)
      .set(auth(tokens.coord));
    const minha = lista.body.find((i: any) => i.id === internacao);
    expect(minha.diasComRelato).toBeGreaterThanOrEqual(1);
    expect(minha.acompanhante).toBeTruthy();
    // Nada de "diasSemRelato": o relato diário não é obrigatório.
    expect(Object.keys(minha)).not.toContain('diasSemRelato');
    expect(Object.keys(minha)).not.toContain('pendencias');
  });

  it('o educador sabe ONDE ela está, sem saber por quê', async () => {
    /*
     * A criança sumiu da chamada dele. Sem esta linha, ele conta dezenove
     * onde havia vinte e não tem como saber se ela foi internada,
     * transferida, ou se alguém errou o cadastro — e liga para a coordenação
     * às onze da noite para perguntar.
     *
     * O que ele recebe é o FATO e o lugar. O motivo, o diário e a medicação
     * do hospital continuam atrás do alcance da internação.
     */
    const lista = await request(http).get(`/api/v1/people?houseId=${AI3}`)
      .set(auth(tokens.educador));
    const dela = lista.body.find((p: any) => p.id === crianca);
    expect(dela.noHospital).toBe('Hospital Fictício da Criança');
    expect(JSON.stringify(dela)).not.toMatch(/Crise respiratória/);
  });

  it('a internação e a medicação do hospital entram no histórico de saúde', async () => {
    /* "O sistema está cuidando da criança como um todo" — sem isto, o
     * histórico teria um buraco no período em que mais coisa aconteceu. */
    const h = await request(http).get(`/api/v1/nursing/history/${crianca}`)
      .set(auth(tokens.enfermagem));
    expect(h.body.internacoes.some((i: any) => i.hospital === 'Hospital Fictício da Criança'))
      .toBe(true);
    expect(h.body.pendencias.internacaoEmAndamento).toBe(true);

    const med = h.body.medicacaoNoHospital.find(
      (m: any) => m.medicamento === 'Antibiótico fictício');
    expect(med).toBeTruthy();
    // A origem vai escrita em cada linha, sempre.
    expect(med.origem).toMatch(/Administrada pelo Hospital/);

    /* E a folha que a Enfermagem leva para a consulta traz o período. */
    const folha = await request(http).get(`/api/v1/nursing/history/${crianca}/folha`)
      .set(auth(tokens.enfermagem));
    const titulos = folha.body.secoes.map((x: any) => x.titulo);
    expect(titulos).toContain('Internações');
    expect(titulos).toContain('Medicação administrada durante a internação');
  });

  it('nada da internação se apaga', async () => {
    await expect(admin.query(`DELETE FROM hospitalization WHERE id = $1`, [internacao]))
      .rejects.toThrow(/internacao_nao_e_apagada/);
    await expect(admin.query(
      `DELETE FROM hospitalization_note WHERE hospitalization_id = $1`, [internacao]))
      .rejects.toThrow(/internacao_nao_e_apagada/);
  });

  it('na alta a criança volta para a chamada e para a grade', async () => {
    const semDesfecho = await request(http)
      .post(`/api/v1/nursing/hospitalizations/${internacao}/close`)
      .set(auth(tokens.tecnica)).send({});
    expect(semDesfecho.status).toBe(400);

    const alta = await request(http)
      .post(`/api/v1/nursing/hospitalizations/${internacao}/close`)
      .set(auth(tokens.coord))
      .send({ desfecho: 'alta', observacao: 'Alta com receita de antibiótico por 7 dias.' });
    expect(alta.status).toBe(201);
    expect(alta.body.aviso).toMatch(/volta à chamada/);

    const nova = await request(http).post('/api/v1/checks')
      .set(auth(tokens.coord))
      .send({ houseId: AI3, kind: 'alimentacao', titulo: 'Café (depois da alta)' });
    const depois = await request(http)
      .get(`/api/v1/checks/${nova.body.id ?? nova.body.checkId}`).set(auth(tokens.educador));
    expect(depois.body.linhas.some((l: any) => l.acolhidoId === crianca)).toBe(true);
  });
});
