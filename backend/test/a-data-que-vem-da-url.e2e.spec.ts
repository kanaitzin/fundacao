/**
 * A DATA QUE VEM DA URL (fase 148).
 *
 * O DEFEITO, medido em 22/09 enquanto eu escrevia teste para as rotas que o
 * `scripts/rotas-sem-teste.mjs` apontou. A primeira que abri —
 * `PATCH /shifts/general-night-line/:data/house/:houseId`, a que a coordenação usa
 * para corrigir a linha da casa dela na ATA Geral — devolveu **500, "Internal
 * server error"**, para uma data que não é data. A data chegava do `@Param` sem
 * conferência nenhuma e ia direto para um `::date` do Postgres.
 *
 * E NÃO ERA SÓ ALI. Sondadas dez rotas que recebem data, **sete devolveram 500**:
 * a agenda, a escala, a folha da escala, as compras de medicamento, os pedidos da
 * cozinha, o resumo deles e o arquivo das ATAS. Dezesseis pontos do servidor
 * recebem data e nenhum conferia.
 *
 * QUEM CAI NISSO, porque "a tela manda data boa" não é resposta: um link guardado
 * de outro mês, um endereço digitado à mão, um campo de data do celular que envia
 * metade do valor, uma fila offline que sobe um parâmetro truncado. Quem vê o 500
 * é quem está de plantão, e ele não diz o que fazer.
 *
 * A CORREÇÃO É NUM LUGAR SÓ — `DataDoDia`, no kernel —, e é a lição da fase 141:
 * regra nova sobre data se escreve uma vez, e não em dezesseis lugares dos quais
 * quinze vão esquecer.
 *
 * ESTA SUÍTE VARRE TODAS, e não as que eu sondei: ela lê os controladores,
 * descobre quem recebe data e cobra que nenhuma devolva 500. Uma lista escrita à
 * mão aqui envelheceria na primeira rota nova — e a rota nova é exatamente a que
 * vai esquecer o pipe.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** Os controladores, lidos do disco — a lista não se escreve à mão. */
const controladores = () => {
  const raiz = join(__dirname, '..', 'src', 'modules');
  const fora: string[] = [];
  for (const mod of readdirSync(raiz)) {
    for (const f of readdirSync(join(raiz, mod))) {
      if (f.endsWith('.controller.ts')) fora.push(join(raiz, mod, f));
    }
  }
  return fora;
};

describe('A data que vem da URL', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
    return r.body.token as string;
  };
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
    tokens.coord = await login('coord.ai3@paodospobres.dev');
    tokens.tecnica = await login('tecnica.ai3@paodospobres.dev');
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows: [p] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status='ativa' LIMIT 1`, [ids.AI3]);
    ids.crianca = p.person_id;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ============ Todo ponto que recebe data tem a conferência ============

  it('todo parâmetro de data passa pelo DataDoDia — e a lista sai do código', async () => {
    /*
     * A cobrança ESTÁTICA, que é a que pega a rota nova.
     *
     * ELA NEGA POR PADRÃO desde a fase 153, e o motivo é um defeito meu. A
     * primeira versão procurava só os nomes `data`, `dia`, `de` e `ate` — em
     * português — e deixou passar DEZ `@Query('date')`, em inglês, nas rotas
     * mais abertas do turno: a chamada, o plantão, as atividades e a grade do
     * remédio devolviam 500 para uma data que não é data, e a linha do tempo
     * respondia 200 sobre um dia qualquer. Era a lição que eu mesmo escrevi
     * nesta suíte: lista escrita à mão envelhece — e a lista era a DO CONFERIDOR.
     *
     * Agora todo parâmetro de URL do servidor tem de estar CLASSIFICADO. Nome
     * novo que ninguém classificou reprova, com a frase dizendo o que fazer:
     * `dataInicio` não passa por fora só porque ninguém lembrou de acrescentá-lo.
     * Os que terminam em `Id` ficam de fora: têm a sua própria conferência.
     */
    const DIA = new Set(['data', 'dia', 'de', 'ate', 'date']);
    const HORA = new Set(['hora']);
    /* Conferência própria, no serviço, e MEDIDA: `mes` devolve "Informe o mês
       no formato AAAA-MM" para lixo (sondado na fase 153). */
    const PROPRIA = new Set(['mes']);
    /* Não são data nem hora: números, filtros e palavras de um conjunto fechado
       que o serviço resolve sem mandar ao banco como tempo. */
    const OUTROS = new Set(['tipo', 'dias', 'mode', 'unread', 'publico', 'periodo', 'mine',
      'limite', 'escala', 'entity', 'encerradas', 'abertas']);

    const sem: string[] = [];
    const semClasse: string[] = [];
    for (const arquivo of controladores()) {
      const texto = readFileSync(arquivo, 'utf8');
      for (const m of texto.matchAll(
        /@(Query|Param)\(\s*'([A-Za-z]+)'\s*(,\s*[A-Za-z]+\s*)?\)/g)) {
        const [, onde, nome, pipe = ''] = m;
        const aqui = `${arquivo.split('/modules/')[1]} → @${onde}('${nome}')`;
        if (/Id$/.test(nome) || nome === 'id') continue;
        if (DIA.has(nome)) { if (!pipe.includes('DataDoDia')) sem.push(aqui); continue; }
        if (HORA.has(nome)) { if (!pipe.includes('HoraDoDia')) sem.push(aqui); continue; }
        if (PROPRIA.has(nome) || OUTROS.has(nome)) continue;
        semClasse.push(`${aqui} — é data? use DataDoDia; é hora? HoraDoDia; `
          + 'não é tempo? acrescente o nome em OUTROS, nesta suíte, dizendo por quê');
      }
    }
    expect(sem).toEqual([]);
    expect(semClasse).toEqual([]);
  });

  // ============ E nenhuma delas responde com 500 ============

  it('data que não é data devolve FRASE, e nunca 500', async () => {
    const RUIM = 'nao-e-data';
    const rotas: [string, string][] = [
      [`/api/v1/activities/agenda?houseId=${ids.AI3}&de=${RUIM}&ate=${RUIM}`, tokens.coord],
      [`/api/v1/escala?houseId=${ids.AI3}&de=${RUIM}&ate=${RUIM}`, tokens.coord],
      [`/api/v1/escala/folha?houseId=${ids.AI3}&de=${RUIM}&ate=${RUIM}`, tokens.coord],
      [`/api/v1/medications/purchases?houseId=${ids.AI3}&de=${RUIM}&ate=${RUIM}`, tokens.coord],
      [`/api/v1/people/kitchen-requests?houseId=${ids.AI3}&de=${RUIM}&ate=${RUIM}`, tokens.coord],
      [`/api/v1/people/kitchen-requests/summary?houseId=${ids.AI3}&de=${RUIM}&ate=${RUIM}`,
        tokens.coord],
      [`/api/v1/reports/period?personId=${ids.crianca}&de=${RUIM}&ate=${RUIM}`, tokens.tecnica],
      /* ERA `data=` AQUI, e a rota lê `date`: ela ignorava o parâmetro,
         respondia sobre hoje com 200, e esta linha passava sobre um parâmetro
         que ninguém lia — o falso verde da fase 148, achado na 153. */
      [`/api/v1/shifts?houseId=${ids.AI3}&date=${RUIM}`, tokens.coord],
      /* As quatro que devolviam 500 na fase 153, e são as mais abertas do
         turno: a chamada, as atividades, a grade do remédio e o painel da
         casa. E a linha do tempo, que respondia 200 sobre um dia qualquer. */
      [`/api/v1/checks?houseId=${ids.AI3}&date=${RUIM}`, tokens.coord],
      [`/api/v1/activities?houseId=${ids.AI3}&date=${RUIM}`, tokens.coord],
      [`/api/v1/medications?houseId=${ids.AI3}&date=${RUIM}`, tokens.coord],
      [`/api/v1/timeline?houseId=${ids.AI3}&date=${RUIM}`, tokens.coord],
      [`/api/v1/timeline/all?date=${RUIM}`, tokens.coord],
      [`/api/v1/timeline/house-panel?houseId=${ids.AI3}&date=${RUIM}`, tokens.coord],
      [`/api/v1/shifts/ata-archive?houseId=${ids.AI3}&escala=dia&data=${RUIM}`, tokens.coord],
    ];
    for (const [rota, tok] of rotas) {
      const r = await request(http).get(rota).set(auth(tok));
      /* 400, e não "qualquer coisa menos 500": a linha do tempo respondia 200
         para lixo, sobre um dia que ninguém pediu, e uma cobrança que só
         proibisse o 500 teria passado por ela. */
      expect([rota, r.status]).toEqual([rota, 400]);
      {
        /* E a frase é em português e diz o que fazer — "Bad Request" sozinho não
           socorre quem está de plantão. */
        expect([rota, String(r.body.message)]).toEqual([rota, expect.stringMatching(/data precisa vir como/i)]);
      }
    }
  });

  it('a correção da linha da casa na ATA Geral também — era a primeira que eu abri', async () => {
    /*
     * Esta é a rota do achado, e ela merece nome: existe desde a 1440 para o
     * identificador da folha das oito casas NÃO sair do servidor para quem só
     * corrige a linha da casa dele. Ela nunca tinha sido chamada por teste
     * nenhum — a suíte da fase 138 exercita a outra, a que leva o id.
     */
    const r = await request(http)
      .patch(`/api/v1/shifts/general-night-line/nao-e-data/house/${ids.AI3}`)
      .set(auth(tokens.coord))
      .send({ houveContato: true, categoria: 'outro_apoio',
              motivo: 'Motivo fictício da suíte da data.', acao: 'Ação fictícia.' });
    expect(r.status).toBe(400);
    expect(String(r.body.message)).toMatch(/data precisa vir como/i);
  });

  it('e uma data com a FORMA certa e o dia inexistente também é recusada', async () => {
    /*
     * `2026-02-30` passa pela forma, e o `Date` do JavaScript a "conserta"
     * virando 2 de março — é assim que uma consulta responde sobre outro dia sem
     * avisar ninguém. A conferência é a volta: montar a data e comparar o texto.
     */
    for (const data of ['2026-02-30', '2026-13-01', '2026-04-31']) {
      const r = await request(http)
        .patch(`/api/v1/shifts/general-night-line/${data}/house/${ids.AI3}`)
        .set(auth(tokens.coord))
        .send({ houveContato: true, categoria: 'outro_apoio',
                motivo: 'Motivo fictício da suíte da data.', acao: 'Ação fictícia.' });
      expect([data, r.status]).toEqual([data, 400]);
      expect([data, String(r.body.message)])
        .toEqual([data, expect.stringMatching(/não existe o dia/i)]);
    }
  });

  it('a HORA também: a agenda perguntava "quem está às 14h" e 14h virava 500 (fase 153)', async () => {
    for (const hora of ['14h', '25:00', '12:60']) {
      const r = await request(http)
        .get(`/api/v1/activities/agenda/staff?houseId=${ids.AI3}&data=2026-09-20&hora=${hora}`)
        .set(auth(tokens.coord));
      expect([hora, r.status]).toEqual([hora, 400]);
      expect(String(r.body.message)).toMatch(/hora precisa vir como/i);
    }
    const boa = await request(http)
      .get(`/api/v1/activities/agenda/staff?houseId=${ids.AI3}&data=2026-09-20&hora=14:00`)
      .set(auth(tokens.coord));
    expect(boa.status).toBe(200);
  });

  it('a data BOA continua passando — a conferência não pode fechar a porta certa', async () => {
    const hoje = (await admin.query(`SELECT app_hoje()::text AS d`)).rows[0].d;
    const r = await request(http)
      .get(`/api/v1/shifts/ata-archive?houseId=${ids.AI3}&escala=dia&data=${hoje}`)
      .set(auth(tokens.coord));
    expect(r.status).toBe(200);

    /* E o vazio continua valendo como "hoje" — quem decide o que é hoje é o
       banco (`app_hoje()`), e não o navegador nem o pipe. */
    const vazio = await request(http)
      .get(`/api/v1/shifts/ata-archive?houseId=${ids.AI3}&escala=dia&data=`)
      .set(auth(tokens.coord));
    expect(vazio.status).toBe(200);
  });
});
