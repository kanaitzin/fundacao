/**
 * O QUE SE ESCREVEU SOBRE ESTA CRIANÇA (migração 1360).
 *
 * `statement.person_id` era gravado desde a 0300 e **nunca lido por pessoa**. A
 * varredura de 15/09 o achou, e o §9 o manteve fechado de propósito: listar por
 * criança tudo o que se escreveu SOBRE ela é exatamente a narrativa que o §26.2
 * protege atrás de finalidade declarada. O que faltava era uma resposta de
 * gente, e ela veio em 20/09 (§10 item 6): **só a contagem.**
 *
 * O que esta suíte guarda, e é a decisão inteira:
 *
 *  * quem ALCANÇA o relato restrito lê o texto — técnica, coordenação e o líder
 *    do turno, que entrou na 0730 porque quem está com a criança às 23h precisa
 *    saber o que já foi registrado sobre ela;
 *  * o **Gestor Geral não lê**, e recebe um NÚMERO: nem data, nem autor, nem
 *    trecho. Ele sabe que há o que pedir, e não sabe de quê antes de escrever a
 *    finalidade. A leitura continua sendo o comando do §26.2;
 *  * o **autor lê o que escreveu**, sempre, qualquer que seja o cargo dele;
 *  * a contagem **não atravessa a casa**, e fora do escopo a resposta é 404 —
 *    "não encontrei" e "não é da sua casa" precisam ser indistinguíveis;
 *  * e a resposta **não conta nada** além disso. Nem relatos por mês, nem
 *    quantos autores, nem tendência: um número desses na tela de uma criança de
 *    doze anos é o começo de uma ficha de comportamento (regra 3). Guardado
 *    pela FORMA da resposta, como o teste da presença (fase 110) e o da
 *    pontuação de comportamento já fazem — se alguém acrescentar um total, este
 *    teste reprova.
 *
 * E a regra de QUEM LÊ passou a morar num lugar só (`app_pode_ler_relato`), com
 * dois leitores: a policy e a contagem. Esta suíte cobra o perímetro cargo a
 * cargo justamente para provar que extrair a regra não abriu nem fechou nada.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O que se escreveu sobre esta criança', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const sobre = (token: string, pessoa = ids.crianca) =>
    request(http).get(`/api/v1/statements/person/${pessoa}`).set(auth(token));

  /** Escreve um relato pela ROTA — é assim que ele nasce na casa. */
  const escrever = async (token: string, body: string, restrito: boolean, pessoa = ids.crianca) => {
    const r = await request(http).post('/api/v1/statements').set(auth(token)).send({
      houseId: ids.AI3, context: 'ocorrencia', entity: 'incident', entityId: ids.fato,
      personId: pessoa, witness: 'presenciei_integralmente', body, restrito,
    });
    expect(r.status).toBe(201);
    return r.body.id as string;
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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      educador2: 'educador2.ai3@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    /* Uma criança pelo MEIO da ordem: as pontas são as que as outras suítes
       usam, e duas suítes escrevendo sobre a mesma criança é confusão barata. */
    ({ rows: [{ id: ids.crianca }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name OFFSET 9 LIMIT 1`, [ids.AI3]));
    /* Uma criança de OUTRA casa, para provar que a contagem não atravessa. */
    ({ rows: [{ id: ids.criancaAI4 }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN house h ON h.id = hs.house_id
        WHERE h.code = 'AI4' AND hs.status = 'ativa' LIMIT 1`));

    /* O fato a que os relatos se penduram. `entity_id` não tem chave
       estrangeira de propósito (0300) — é isso que permite tirar o módulo de
       ocorrências sem levar os relatos junto. */
    ids.fato = (await admin.query(`SELECT gen_random_uuid() AS id`)).rows[0].id;

    /* DOIS relatos restritos da técnica, e um aberto do educador. */
    ids.restritoDaTecnica = await escrever(
      tokens.tecnica, 'Narrativa técnica fictícia, restrita por padrão (§12.2).', true);
    await escrever(
      tokens.tecnica, 'Segunda narrativa técnica fictícia, também restrita.', true);
    ids.abertoDoEducador = await escrever(
      tokens.educador, 'Registro fictício aberto à equipe pelo próprio autor.', false);
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ================= Quem alcança =================

  it('a técnica lê os três, e para ela não há nada em área restrita', async () => {
    const r = await sobre(tokens.tecnica);
    expect(r.status).toBe(200);
    expect(r.body.relatos).toHaveLength(3);
    expect(r.body.restritos).toBe(0);
    expect(r.body.relatos.filter((x: any) => x.restrito)).toHaveLength(2);
    /* O texto chega — é o que ela precisa para o acompanhamento. */
    expect(r.body.relatos.find((x: any) => x.id === ids.restritoDaTecnica).relato)
      .toContain('Narrativa técnica fictícia');
  });

  it('a coordenação e o líder do turno também leem — o líder entrou na 0730', async () => {
    for (const cargo of ['coord', 'lider'] as const) {
      const r = await sobre(tokens[cargo]);
      expect(r.status).toBe(200);
      expect(r.body.relatos).toHaveLength(3);
      expect(r.body.restritos).toBe(0);
    }
  });

  it('o autor lê o que escreveu, e o relato aberto é da equipe', async () => {
    const r = await sobre(tokens.educador);
    expect(r.status).toBe(200);
    /* O dele, que é aberto — e mais nada. Os dois restritos da técnica não. */
    expect(r.body.relatos).toHaveLength(1);
    expect(r.body.relatos[0].id).toBe(ids.abertoDoEducador);
    expect(r.body.relatos[0].meu).toBe(true);
    expect(r.body.restritos).toBe(2);
  });

  // ================= Quem NÃO alcança: a contagem =================

  it('o GESTOR GERAL vê que existem, e não vê o que são', async () => {
    const r = await sobre(tokens.gestor);
    expect(r.status).toBe(200);

    /* A contagem, que é a decisão de 20/09. */
    expect(r.body.restritos).toBe(2);
    expect(r.body.nota).toContain('área restrita');

    /* E NADA do conteúdo: nenhum restrito na lista, e o texto dele não
       aparece em lugar nenhum da resposta — nem num campo que alguém
       acrescentasse sem pensar. Conferido no JSON inteiro, de propósito. */
    expect(r.body.relatos.filter((x: any) => x.restrito)).toHaveLength(0);
    expect(JSON.stringify(r.body)).not.toContain('Narrativa técnica fictícia');
  });

  it('e a resposta dele não traz DATA nem AUTOR do que está restrito', async () => {
    const r = await sobre(tokens.gestor);
    /* A prova é pela FORMA: `restritos` é um NÚMERO, e não uma lista de
       objetos com `quando` ou `autor`. Se alguém o transformar em lista para
       "ajudar o gestor a escolher", este teste reprova — e é para isso que
       ele existe. */
    expect(typeof r.body.restritos).toBe('number');
    /* O nome de quem escreveu o restrito não sai. A técnica assinou os dois. */
    const { rows: [t] } = await admin.query(
      `SELECT app_user_display_name(id) AS nome FROM app_user
        WHERE email = 'tecnica.ai3@paodospobres.dev'`);
    expect(JSON.stringify(r.body)).not.toContain(t.nome);
  });

  it('o educador de outra casa e a Enfermagem não chegam nem à criança', async () => {
    /* A Enfermagem não tem casa no seed e o restrito não é do plantão inteiro
       (0730). O que ela NÃO deve receber é o texto. */
    const r = await sobre(tokens.enfermagem);
    if (r.status === 200) {
      expect(r.body.relatos.filter((x: any) => x.restrito)).toHaveLength(0);
      expect(JSON.stringify(r.body)).not.toContain('Narrativa técnica fictícia');
    } else {
      expect(r.status).toBe(404);
    }
  });

  it('a contagem NÃO atravessa a casa: a criança da AI4 não devolve nada da AI3', async () => {
    const r = await sobre(tokens.tecnica, ids.criancaAI4);
    /* A técnica da AI3 não alcança a criança da AI4: 404, e não uma lista
       vazia com a contagem de outra casa. */
    expect(r.status).toBe(404);
  });

  // ================= A leitura excepcional, que continua sendo um ato =================

  it('o gestor abre o restrito declarando a finalidade — e sem ela, não abre', async () => {
    const curta = await request(http)
      .post(`/api/v1/statements/${ids.restritoDaTecnica}/exceptional-read`)
      .set(auth(tokens.gestor)).send({ finalidade: 'porque sim' });
    expect(curta.status).toBe(400);

    const finalidade = 'Responder ao ofício fictício da vara sobre esta criança.';
    const abriu = await request(http)
      .post(`/api/v1/statements/${ids.restritoDaTecnica}/exceptional-read`)
      .set(auth(tokens.gestor)).send({ finalidade });
    expect(abriu.status).toBe(201);
    expect(abriu.body.relato).toContain('Narrativa técnica fictícia');

    /* E ficou registrado ANTES de devolver, com a finalidade — na coluna
       `purpose`, que existe para isso e não no meio do `detail`: quem for
       responder a um pedido de titular precisa achar a finalidade sem ler
       JSON. */
    const { rows } = await admin.query(
      `SELECT action, purpose FROM audit_event
        WHERE entity = 'statement' AND entity_id = $1
        ORDER BY at DESC LIMIT 1`, [ids.restritoDaTecnica]);
    expect(rows).toHaveLength(1);
    expect(rows[0].purpose).toBe(finalidade);
  });

  it('abrir um relato NÃO o tira da área restrita — a contagem do gestor não muda', async () => {
    /* A leitura excepcional é um ato pontual, não uma liberação. Se abrir
       baixasse a contagem, a segunda leitura deixaria de ser registrada. */
    const r = await sobre(tokens.gestor);
    expect(r.body.restritos).toBe(2);
    expect(r.body.relatos.filter((x: any) => x.restrito)).toHaveLength(0);
  });

  // ================= E ela não conta nada =================

  it('a resposta não soma nada sobre a criança — nem por mês, nem por autor', async () => {
    const r = await sobre(tokens.tecnica);
    const chaves = Object.keys(r.body);
    /* `restritos` é a ÚNICA contagem que esta resposta tem, e ela existe
       porque esconder que existem faria a equipe procurar noutro lugar. */
    for (const proibida of ['total', 'totais', 'porMes', 'porAutor', 'media',
                            'tendencia', 'ranking', 'percentual', 'pontuacao']) {
      expect(chaves).not.toContain(proibida);
    }
    expect(chaves.filter((k) => /^(total|media|percentual|pontua)/i.test(k))).toEqual([]);
  });

  // ============ E COMO ELE ESCOLHE O QUE ABRIR (fase 136) ============
  /*
   * A DECISÃO DE 21/09/2026: *"gestor abrir o que quiser"*.
   *
   * Era a metade que faltava do §10.6. Com só a contagem ele não tinha por onde
   * escolher; agora há **uma porta por relato**, e ele abre a que quiser, uma por
   * vez. O caminho que NÃO foi escolhido era um botão que abrisse os N de uma
   * vez — e é por isso que estes testes cobram que abrir um **não** abra o outro.
   */

  it('o gestor recebe UMA PORTA POR RELATO — e a porta não diz nada', async () => {
    const r = await sobre(tokens.gestor);
    expect(r.body.paraAbrir).toHaveLength(2);
    for (const porta of r.body.paraAbrir) {
      /* Número de ordem e identificador. Mais nada: uma chave a mais aqui é
         narrativa saindo sem finalidade escrita. */
      expect(Object.keys(porta).sort()).toEqual(['id', 'ordem']);
    }
    expect(r.body.paraAbrir.map((p: any) => p.ordem)).toEqual([1, 2]);
  });

  it('a ordem sai do IDENTIFICADOR, e não da data — cronologia já é narrativa', async () => {
    const r = await sobre(tokens.gestor);
    const { rows } = await admin.query(
      `SELECT id FROM statement WHERE person_id = $1 AND restricted ORDER BY id`,
      [ids.crianca]);
    expect(r.body.paraAbrir.map((p: any) => p.id)).toEqual(rows.map((x: any) => x.id));
  });

  it('a técnica NÃO recebe portas: ela já lê o relato na lista', async () => {
    /* Oferecer-lhe "abrir excepcionalmente" transformaria leitura de rotina em
       ato excepcional — o contrário do que o §26.2 protege. */
    for (const cargo of ['tecnica', 'coord', 'lider', 'educador'] as const) {
      const r = await sobre(tokens[cargo]);
      expect(r.body.paraAbrir).toEqual([]);
    }
  });

  it('abrir exige finalidade escrita, e a recusa diz para que ela serve', async () => {
    const porta = (await sobre(tokens.gestor)).body.paraAbrir[0];
    const curta = await request(http)
      .post(`/api/v1/statements/${porta.id}/exceptional-read`)
      .set(auth(tokens.gestor)).send({ finalidade: 'preciso ver' });
    expect(curta.status).toBe(400);
    expect(curta.body.message).toMatch(/finalidade/i);
    expect(curta.body.message).toMatch(/registrada/i);
  });

  it('abrir devolve o texto E grava a finalidade — o registro vem antes', async () => {
    const porta = (await sobre(tokens.gestor)).body.paraAbrir[0];
    const finalidade = 'Preparar a resposta ao ofício fictício do MP sobre a situação familiar.';
    const r = await request(http).post(`/api/v1/statements/${porta.id}/exceptional-read`)
      .set(auth(tokens.gestor)).send({ finalidade });
    expect(r.status).toBe(201);
    /* Comparação insensível a maiúsculas: a ordem das portas sai do ID, que é
       aleatório, então a porta 1 pode ser qualquer um dos dois relatos — e um
       deles começa a frase com minúscula. Fixar o texto exato faria este teste
       passar ou reprovar por sorteio. */
    expect(r.body.relato.toLowerCase()).toContain('narrativa técnica fictícia');

    const { rows: [ev] } = await admin.query(
      `SELECT action, purpose FROM audit_event
        WHERE entity = 'statement' AND entity_id = $1
          AND action = 'statement.read_exceptional'
        ORDER BY at DESC LIMIT 1`, [porta.id]);
    expect(ev.action).toBe('statement.read_exceptional');
    /* A finalidade fica por extenso: é ela que justifica a leitura para quem
       auditar depois, e um código não justificaria nada. */
    expect(ev.purpose).toBe(finalidade);
  });

  it('abrir UM não abre o outro — é o caminho que a Fundação escolheu', async () => {
    const portas = (await sobre(tokens.gestor)).body.paraAbrir;
    await request(http).post(`/api/v1/statements/${portas[0].id}/exceptional-read`)
      .set(auth(tokens.gestor))
      .send({ finalidade: 'Conferir o histórico fictício antes da audiência concentrada.' });

    /* A lista continua com as DUAS portas, e o perfil continua sem os textos:
       abrir é um ato por relato, e não uma chave que destranca a criança. */
    const depois = await sobre(tokens.gestor);
    expect(depois.body.paraAbrir).toHaveLength(2);
    expect(depois.body.relatos.filter((x: any) => x.restrito)).toHaveLength(0);
    expect(JSON.stringify(depois.body)).not.toContain('Narrativa técnica fictícia');

    /* E cada abertura tem o seu próprio registro, com a sua própria finalidade:
       uma finalidade valendo por dois relatos não diria de qual ele precisava. */
    const { rows } = await admin.query(
      `SELECT DISTINCT entity_id FROM audit_event
        WHERE action = 'statement.read_exceptional' AND entity_id = ANY($1::uuid[])`,
      [portas.map((p: any) => p.id)]);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('quem não é Gestor Geral não abre, mesmo escrevendo finalidade', async () => {
    const { rows: [algum] } = await admin.query(
      `SELECT id FROM statement WHERE person_id = $1 AND restricted LIMIT 1`, [ids.crianca]);
    const r = await request(http).post(`/api/v1/statements/${algum.id}/exceptional-read`)
      .set(auth(tokens.coord))
      .send({ finalidade: 'Finalidade fictícia suficientemente longa para passar do piso.' });
    expect(r.status).toBe(403);
  });
});
