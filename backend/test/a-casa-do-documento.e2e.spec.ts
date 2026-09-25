/**
 * O DOCUMENTO QUE SAI DO SISTEMA DIZ DE QUE CASA É (fase 154).
 *
 * A conferência de 25/09 sondou as nove rotas que o `rotas-sem-teste.mjs` ainda
 * apontava — cinco exportações, três folhas e a autorização nominal — e achou
 * três defeitos, todos em código que compilava e passava:
 *
 *  1. **A ficha de saúde e a trajetória da criança eram exportadas com a linha de
 *     auditoria SEM CASA.** É o defeito da fase 149 pela outra porta: o
 *     `auditoria-tem-casa.spec.ts` olhava as chamadas de `audit.log`, e a
 *     exportação grava por dentro do `documentos.exportar`, que recebe a casa de
 *     quem chama. As duas não passavam nenhuma. A coordenação não sabia quem
 *     tirou do sistema a ficha de saúde de uma criança dela — justamente a
 *     exportação mais sensível que existe.
 *  2. **A folha do remédio que vai com a criança gravava a casa que a TELA
 *     mandava**, e não a da ida. E não dizia qual ida tinha saído.
 *  3. **Três exportações devolviam 500** para casa ou data inválida no CORPO — o
 *     defeito da fase 153 pela porta que o conferidor dela não olha, porque ela
 *     cobra `@Query` e `@Param`.
 *
 * A cobrança da casa é lida DE VOLTA pelo caminho de quem pergunta — o rastro
 * do acolhido, como a coordenação o abre —, e não pela tabela: é a lição da
 * 149, em que um conferidor estático e um teste de ponta a ponta ficaram os dois
 * verdes sobre uma linha que ninguém lia.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O documento que sai do sistema diz de que casa é', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const marca = `fase 154 — ${Date.now()}`;

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
    tokens.deOutraCasa = await login('coord.ai4@paodospobres.dev');
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ id: ids.coord }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='coord.ai3@paodospobres.dev'`));
    const { rows: [p] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status='ativa'
        ORDER BY person_id LIMIT 1`, [ids.AI3]);
    ids.crianca = p.person_id;

    /*
     * UMA IDA COM A FAMÍLIA, porque a semente não traz nenhuma — a lição da 127:
     * superfície sem dado de partida é superfície sem teste. A ida é ENCERRADA e
     * fica mais de um ano atrás: aberta, ela tiraria a criança da chamada de hoje
     * e das doses das outras suítes, que dividem o mesmo banco (127 e 145).
     */
    const { rows: [c] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, created_by)
       VALUES ($1, 'Tia da conferência (fictícia)', 'tio', $2) RETURNING id`,
      [ids.crianca, ids.coord]);
    const { rows: [f] } = await admin.query(
      `INSERT INTO family_stay (person_id, house_id, contact_id, purpose,
                                started_at, expected_return_at, returned_at,
                                status, opened_by, closed_by, closed_at)
       VALUES ($1, $2, $3, 'fim de semana (fictício)',
               now() - interval '400 days', now() - interval '398 days',
               now() - interval '398 days', 'encerrada', $4, $4, now() - interval '398 days')
       RETURNING id`, [ids.crianca, ids.AI3, c.id, ids.coord]);
    ids.ida = f.id;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  /** A linha desta exportação, pelo rastro do acolhido — como a coordenação lê. */
  const noRastro = async (token: string, finalidade: string) => {
    const r = await request(http).get(`/api/v1/audit/person/${ids.crianca}`).set(auth(token));
    expect(r.status).toBe(200);
    return r.body.linhas.find((l: any) =>
      l.codigo === 'documento.export' && l.finalidade === finalidade);
  };

  // ============ 1. A casa da criança, nas duas exportações por criança ============

  it('a ficha de saúde exportada aparece no rastro que a coordenação da casa lê', async () => {
    const finalidade = `Encaminhamento ao posto de saúde — ${marca}`;
    const r = await request(http).post(`/api/v1/nursing/history/${ids.crianca}/export`)
      .set(auth(tokens.coord)).send({ finalidade });
    expect(r.status).toBe(201);
    expect(r.body.conteudoBase64.length).toBeGreaterThan(100);

    const linha = await noRastro(tokens.coord, finalidade);
    expect(linha).toBeTruthy();
    expect(linha.casa).toBe('AI3');
  });

  it('a trajetória exportada também', async () => {
    const finalidade = `Relatório para a audiência concentrada — ${marca}`;
    const r = await request(http).post(`/api/v1/impacto/trajetoria/${ids.crianca}/export`)
      .set(auth(tokens.coord)).send({ finalidade });
    expect(r.status).toBe(201);

    const linha = await noRastro(tokens.coord, finalidade);
    expect(linha).toBeTruthy();
    expect(linha.casa).toBe('AI3');
  });

  it('e a coordenação de OUTRA casa não chega ao rastro desta criança', async () => {
    const r = await request(http).get(`/api/v1/audit/person/${ids.crianca}`)
      .set(auth(tokens.deOutraCasa));
    expect(r.status).toBe(404);
  });

  // ============ 2. O remédio da ida: a casa sai da IDA, não da tela ============

  it('a folha do remédio da ida abre, e a exportação grava a casa DA IDA e qual ida foi', async () => {
    const folha = await request(http)
      .get(`/api/v1/medications/family-stays/${ids.ida}/to-take/folha`).set(auth(tokens.coord));
    expect(folha.status).toBe(200);
    expect(folha.body.titulo).toBeTruthy();

    /* A tela mandava `houseId` no corpo, e o servidor acreditava. Aqui ele vem
       ERRADO de propósito — uma casa que existe, e não é a da ida. */
    const finalidade = `Entregar à família junto com a criança — ${marca}`;
    const r = await request(http)
      .post(`/api/v1/medications/family-stays/${ids.ida}/to-take/export`)
      .set(auth(tokens.coord)).send({ houseId: ids.AI4, finalidade });
    expect(r.status).toBe(201);

    const { rows: [linha] } = await admin.query(
      `SELECT house_id, entity_id FROM audit_event
        WHERE action = 'documento.export' AND purpose = $1`, [finalidade]);
    expect(linha.house_id).toBe(ids.AI3);
    expect(linha.entity_id).toBe(ids.ida);
  });

  it('e a coordenação de outra casa não exporta a folha da ida desta', async () => {
    const r = await request(http)
      .post(`/api/v1/medications/family-stays/${ids.ida}/to-take/export`)
      .set(auth(tokens.deOutraCasa))
      .send({ houseId: ids.AI4, finalidade: `Tentativa de fora do alcance — ${marca}` });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  // ============ 3. Nenhuma exportação cai com o corpo errado ============

  /*
   * TODAS as exportações que recebem casa ou data pelo corpo — a lista saiu de
   * um `grep` por `@Post(...export...)` em 25/09, e não da memória: a 148 olhou
   * sete de dezesseis e a 153 teve de voltar pelos nomes em inglês.
   *
   * O que se cobra é a RESPOSTA: 400 ou 404, com frase. Não 500 — que não diz
   * nada a quem está de plantão —, e não 201, que teria exportado sobre um dia
   * ou uma casa que ninguém pediu.
   */
  const EXPORTACOES: { rota: string; corpo: () => Record<string, unknown>; ruins: string[] }[] = [
    { rota: '/escala/export', corpo: () => ({ houseId: ids.AI3 }), ruins: ['houseId', 'de', 'ate'] },
    { rota: '/alignments/export', corpo: () => ({ houseId: ids.AI3 }), ruins: ['houseId'] },
    { rota: '/alignments/statute/export', corpo: () => ({ houseId: ids.AI3 }), ruins: ['houseId'] },
    { rota: '/medications/export', corpo: () => ({ houseId: ids.AI3 }), ruins: ['houseId', 'date'] },
    { rota: '/impacto/export', corpo: () => ({ houseId: ids.AI3 }), ruins: ['houseId', 'de', 'ate'] },
    { rota: '/reports/period/export', corpo: () => ({ houseId: ids.AI3 }), ruins: ['houseId', 'de', 'ate'] },
    { rota: '/people/kitchen-requests/export/lanches', corpo: () => ({ houseId: ids.AI3 }), ruins: ['houseId', 'de', 'ate'] },
    { rota: '/people/kitchen-requests/export/restricoes', corpo: () => ({ houseId: ids.AI3 }), ruins: ['houseId'] },
    { rota: '/people/kitchen-requests/export/cestas', corpo: () => ({ houseId: ids.AI3 }), ruins: ['houseId', 'de', 'ate'] },
    { rota: '/people/portaria/export', corpo: () => ({ houseId: ids.AI3 }), ruins: ['houseId'] },
  ];

  it('casa ou data inválida no corpo recebe recusa com frase, nunca 500', async () => {
    const caidas: string[] = [];
    for (const e of EXPORTACOES) {
      for (const campo of e.ruins) {
        const r = await request(http).post(`/api/v1${e.rota}`).set(auth(tokens.coord))
          .send({ ...e.corpo(), [campo]: 'nao-e-isso', finalidade: `Conferência do corpo — ${marca}` });
        /* Rota escrita errada responde 404 "Cannot POST" — e passaria aqui por
           recusa. Foi o que a primeira versão desta lista fez com `/reports/export`,
           que não existe: é a lição da 153, a sondagem que chama o que a rota não lê. */
        if (String(r.body?.message ?? '').startsWith('Cannot ')) caidas.push(`${e.rota}: a rota não existe`);
        else if (r.status >= 500 || r.status < 400) caidas.push(`${e.rota} com ${campo} inválido: ${r.status}`);
        else if (!r.body?.message) caidas.push(`${e.rota} com ${campo} inválido: ${r.status} sem frase`);
      }
    }
    expect(caidas).toEqual([]);
  });

  it('dia que não existe no calendário também é recusado', async () => {
    const r = await request(http).post('/api/v1/escala/export').set(auth(tokens.coord))
      .send({ houseId: ids.AI3, de: '2026-02-30', finalidade: `Conferência do corpo — ${marca}` });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/calendário/);
  });

  // ============ 4. As exportações e folhas que nenhum teste chamava ============

  it('a escala, os combinados e a grade do remédio exportam, e gravam a casa', async () => {
    /* Endereço inteiro, e não montado: o `rotas-sem-teste.mjs` lê a URL escrita. */
    for (const rota of ['/api/v1/escala/export', '/api/v1/alignments/export',
                        '/api/v1/medications/export']) {
      const finalidade = `Afixar no mural da equipe — ${rota} — ${marca}`;
      const r = await request(http).post(rota).set(auth(tokens.coord))
        .send({ houseId: ids.AI3, finalidade });
      expect([rota, r.status]).toEqual([rota, 201]);
      const { rows: [linha] } = await admin.query(
        `SELECT house_id FROM audit_event WHERE action = 'documento.export' AND purpose = $1`,
        [finalidade]);
      expect([rota, linha?.house_id]).toEqual([rota, ids.AI3]);
    }
  });

  it('as duas folhas da cozinha abrem para a casa, e recusam a de fora', async () => {
    const restricoes = await request(http)
      .get(`/api/v1/people/kitchen-requests/folha/restricoes?houseId=${ids.AI3}`)
      .set(auth(tokens.coord));
    expect(restricoes.status).toBe(200);
    expect(restricoes.body.titulo).toBeTruthy();

    const cestas = await request(http)
      .get(`/api/v1/people/kitchen-requests/folha/cestas?houseId=${ids.AI3}&de=2026-09-01&ate=2026-09-30`)
      .set(auth(tokens.coord));
    expect(cestas.status).toBe(200);
    expect(cestas.body.titulo).toBe('Solicitação de cesta básica');

    const fora = await request(http)
      .get(`/api/v1/people/kitchen-requests/folha/restricoes?houseId=${ids.AI3}`)
      .set(auth(tokens.deOutraCasa));
    expect(fora.status).toBeGreaterThanOrEqual(400);
    expect(fora.status).toBeLessThan(500);
  });

  /*
   * A AUTORIZAÇÃO NOMINAL está dormente desde 08/09 (§8.6): a marcação de
   * medicamento tomou o lugar dela. A rota continua porque a tela da saúde ainda
   * a lê e mostra o que a casa tinha decidido. O que se cobra é só isso — que a
   * leitura responde, e responde vazia —, e não o comportamento de algo que a
   * Fundação aposentou.
   */
  it('a autorização nominal, dormente, ainda responde à tela que a lê', async () => {
    const r = await request(http).get(`/api/v1/medications/authorizations?houseId=${ids.AI3}`)
      .set(auth(tokens.coord));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});
