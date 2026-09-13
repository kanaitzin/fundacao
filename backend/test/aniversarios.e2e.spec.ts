/**
 * OS ANIVERSÁRIOS (fase 98, migração 1160).
 *
 * Pedido do Marcelo: a casa saber com uma semana de antecedência, três dias
 * antes e no dia — para se organizar, sem depender do papel na parede.
 *
 * O que esta suíte defende:
 *  - a data vem do PERFIL, e não de um cadastro novo;
 *  - a lista atravessa a virada do ano (em 28/12, quem nasceu em 3/1 aparece);
 *  - quem nasceu em 29/02 não some da lista em ano comum;
 *  - a ciência faz o aviso parar, e é de quem trabalha na casa — o educador
 *    inclusive, porque é ele quem vai estar lá no dia;
 *  - o aviso sai nos três marcos e não repete no mesmo dia;
 *  - uma casa não vê o aniversário da outra.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** Uma data com o mesmo dia/mês de hoje + `dias`, em ano antigo. */
/**
 * A data de nascimento que faz a criança aniversariar daqui a `dias` — contada
 * no FUSO DA INSTITUIÇÃO, que é onde o banco conta (`app_hoje()`).
 *
 * A primeira versão usava UTC. Às 23h de Porto Alegre o UTC já é o dia
 * seguinte: "daqui a 7 dias" virava 8 para o banco, a criança saía da janela e
 * a suíte reprovava — um teste que passa de dia e falha à noite. É a armadilha
 * 2 do §6 cometida dentro do próprio teste, e foi a rodada das 23h que achou.
 */
function nascidoDaquiA(dias: number, anosAtras: number) {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  /* Meia-noite do dia da instituição, em UTC, para somar dias sem escorregar. */
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  const ano = d.getUTCFullYear() - anosAtras;
  return `${ano}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

describe('Os aniversários', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3 = '', AI4 = '';
  const kids: Record<string, string> = {};

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const lista = (token: string, casa = AI3, dias?: number) =>
    request(http).get(`/api/v1/people/birthdays?houseId=${casa}${dias ? `&dias=${dias}` : ''}`)
      .set(auth(token));
  const ciente = (token: string, personId: string) =>
    request(http).post(`/api/v1/people/birthdays/${personId}/ack`).set(auth(token)).send({});
  const avisar = (token: string, casa = AI3) =>
    request(http).post('/api/v1/people/birthdays/notify').set(auth(token)).send({ houseId: casa });
  const naoLidas = (token: string) =>
    request(http).get('/api/v1/notifications').set(auth(token));

  const nova = async (nome: string, nascimento: string, casa: string, quem = 'tecnica') => {
    const r = await request(http).post('/api/v1/people').set(auth(tokens[quem]))
      .send({ houseId: casa, fullName: `${nome} (fictícia)`, socialName: nome,
              birthDate: nascimento, provisionalReason: 'Ingresso de teste automatizado' });
    expect(r.status).toBe(201);
    return r.body.personId as string;
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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
    })) {
      tokens[k] = (await request(http).post('/api/v1/auth/login')
        .send({ email, password: SENHA })).body.token;
    }
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));

    kids.hoje = await nova('AniversarioHoje', nascidoDaquiA(0, 9), AI3);
    kids.tres = await nova('AniversarioEm3', nascidoDaquiA(3, 12), AI3);
    kids.sete = await nova('AniversarioEm7', nascidoDaquiA(7, 15), AI3);
    kids.longe = await nova('AniversarioLonge', nascidoDaquiA(40, 10), AI3);
    /* Na Casa 04 quem cadastra é a coordenação de lá: a técnica da 03 não
       alcança, e receber 403 aqui seria o teste provando o alcance sem querer. */
    kids.outraCasa = await nova('AniversarioDa04', nascidoDaquiA(1, 8), AI4, 'coord4');
  });

  afterAll(async () => {
    for (const [chave, id] of Object.entries(kids)) {
      await request(http).post(`/api/v1/people/${id}/discharge`)
        .set(auth(tokens[chave === 'outraCasa' ? 'coord4' : 'tecnica']))
        .send({ motivo: 'Encerramento de fixture de teste' });
    }
    await app.close(); await admin.end();
  });

  it('a lista sai do perfil, ordenada, com a idade que a criança faz', async () => {
    const r = await lista(tokens.educador);
    expect(r.status).toBe(200);
    const nomes = r.body.aniversariantes.map((a: any) => a.nome);
    expect(nomes).toEqual(expect.arrayContaining(
      ['AniversarioHoje', 'AniversarioEm3', 'AniversarioEm7']));
    expect(nomes).not.toContain('AniversarioLonge');
    expect(nomes).not.toContain('AniversarioDa04');

    const hoje = r.body.aniversariantes.find((a: any) => a.nome === 'AniversarioHoje');
    expect(hoje.faltam).toBe(0);
    expect(hoje.quando).toBe('hoje');
    expect(hoje.idadeQueFaz).toBe(9);
    expect(hoje.ciente).toBe(false);
    expect(r.body.aniversariantes.find((a: any) => a.nome === 'AniversarioEm3').faltam).toBe(3);

    /* Ordenada por data: quem é hoje vem antes de quem é daqui a sete dias. */
    const faltam = r.body.aniversariantes.map((a: any) => a.faltam);
    expect([...faltam].sort((x, y) => x - y)).toEqual(faltam);

    /* Com 40 dias, o que está longe aparece — é a lista do mês. */
    const mes = await lista(tokens.educador, AI3, 45);
    expect(mes.body.aniversariantes.map((a: any) => a.nome)).toContain('AniversarioLonge');
  });

  it('a conta atravessa a virada do ano e não perde quem nasceu em 29 de fevereiro', async () => {
    const { rows: [r] } = await admin.query(
      `SELECT (make_date(2026,1,3) - make_date(2025,12,28))::int AS dias`);
    expect(r.dias).toBe(6);

    /* Com o relógio do banco em 28/12, quem nasceu em 3/1 tem de estar na
       lista de sete dias — e a conta é sobre a PRÓXIMA ocorrência, não sobre
       a data crua, que daria um número negativo. */
    const { rows: [v] } = await admin.query(
      `WITH b AS (SELECT make_date(2015,1,3) AS nasc, make_date(2025,12,28) AS hoje)
       SELECT (CASE WHEN make_date(extract(year FROM hoje)::int, 1, 3) >= hoje
                    THEN make_date(extract(year FROM hoje)::int, 1, 3)
                    ELSE make_date(extract(year FROM hoje)::int + 1, 1, 3) END - hoje)::int AS faltam
         FROM b`);
    expect(v.faltam).toBe(6);

    /* 29/02 em ano comum: a função trata como 28/02 em vez de falhar. */
    const bissexto = await nova('AniversarioBissexto', '2016-02-29', AI3);
    kids.bissexto = bissexto;
    const { rows: [b] } = await admin.query(
      /* `dia::text`: vindo como Date, a comparação vira "Sun Feb 28 2027…" — o
         mesmo tropeço da fase 95, e por isso a data sai como texto. */
      `SELECT dia::text AS dia FROM app_aniversarios_proximos($1, 366) WHERE person_id = $2`,
      [AI3, bissexto]);
    expect(b).toBeTruthy();
    expect(String(b.dia)).toMatch(/-02-28$/);
  });

  it('a ciência é do educador também, e faz o aviso parar', async () => {
    const r = await ciente(tokens.educador, kids.tres);
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/para de ser avisada/);

    const depois = await lista(tokens.educador);
    const tres = depois.body.aniversariantes.find((a: any) => a.nome === 'AniversarioEm3');
    expect(tres.ciente).toBe(true);
    expect(tres.cientePor).toBeTruthy();

    /* Duas pessoas clicando: a segunda não é erro, e quem viu primeiro fica. */
    expect((await ciente(tokens.coord, kids.tres)).status).toBe(201);
    const { rows } = await admin.query(
      `SELECT u.email FROM birthday_ack a JOIN app_user u ON u.id = a.acked_by
        WHERE a.person_id = $1`, [kids.tres]);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('educador.ai3@paodospobres.dev');
  });

  it('o aviso sai nos marcos, não repete, e pula quem já está ciente', async () => {
    /*
     * CONTA SÓ AS CRIANÇAS DESTA SUÍTE, não o total da casa.
     *
     * A primeira versão esperava `avisados === 2`, e passou por quatro dias
     * seguidos — até rodar em 12/09, que é o aniversário da Vitória, do SEED.
     * Aí eram 3. Um teste de aniversário que conta o total da casa passa em
     * 362 dias do ano e reprova em três, sempre por motivo que ninguém
     * entende na hora. Regra 13, na variante da data: o teste não pode
     * depender do dia em que roda.
     */
    const meus = new Set([kids.hoje, kids.tres, kids.sete]);
    const antes = (await naoLidas(tokens.educador)).body
      .filter((n: any) => meus.has(n.entidadeId)).length;
    const r = await avisar(tokens.coord);
    expect(r.status).toBe(201);
    /* Hoje e daqui a sete dias; o de três dias está ciente e não conta. */
    expect(r.body.avisados).toBeGreaterThanOrEqual(2);

    const avisos = (await naoLidas(tokens.educador)).body;
    expect(avisos.filter((n: any) => meus.has(n.entidadeId)).length).toBe(antes + 2);
    const doDia = avisos.find((n: any) => n.entidadeId === kids.hoje);
    expect(doDia.titulo).toMatch(/^Hoje é aniversário de AniversarioHoje/);
    const daSemana = avisos.find((n: any) => n.entidadeId === kids.sete);
    expect(daSemana.titulo).toMatch(/faz 15 anos em 7 dias/);
    expect(avisos.some((n: any) => n.entidadeId === kids.tres)).toBe(false);

    /* Rodar de novo no mesmo dia não inunda ninguém. */
    await avisar(tokens.coord);
    expect((await naoLidas(tokens.educador)).body
      .filter((n: any) => meus.has(n.entidadeId)).length).toBe(antes + 2);
  });

  it('uma casa não vê nem dá ciência do aniversário da outra', async () => {
    expect((await lista(tokens.coord4, AI3)).status).toBe(404);
    expect((await ciente(tokens.coord4, kids.hoje)).status).toBe(404);
    const daQuatro = await lista(tokens.coord4, AI4);
    expect(daQuatro.body.aniversariantes.map((a: any) => a.nome)).toContain('AniversarioDa04');
  });
});
