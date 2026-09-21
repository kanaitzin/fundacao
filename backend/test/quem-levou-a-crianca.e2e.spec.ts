/**
 * QUEM LEVOU A CRIANÇA NA CONSULTA (migração 1400).
 *
 * O DEFEITO, medido em 21/09/2026 pelo repositório inteiro: a coluna
 * `health_evolution.companion_name` nasceu na 0530 com o comentário *"quem
 * acompanhou, como no papel"* e **nunca recebeu uma escrita nem uma leitura**.
 * Era uma das pontas dormentes que o §9 listava.
 *
 * E ela não é duplicata do `accompanied_by`. A política da 0210 exige
 * `accompanied_by = app_current_user()`: ele é, por construção, **quem enviou a
 * evolução**. Quem LEVOU a criança muitas vezes não é usuário do sistema — é o
 * motorista da Fundação, é a tia autorizada —, e o nome dessa pessoa não tinha
 * para onde ir: a equipe o escrevia no meio das observações, onde ninguém
 * procura seis meses depois, quando a pergunta é *"quem estava com ele quando o
 * médico falou isso?"*.
 *
 * O que esta suíte cobra:
 *
 *   * o nome é GRAVADO quando vem, e a evolução continua sabendo quem escreveu;
 *   * a coluna fica **nula** quando não vem — é o caso comum, e nulo aqui quer
 *     dizer "foi quem escreveu", não "ninguém sabe";
 *   * espaço em branco não vira nome: `'   '` é ausência, não presença;
 *   * as DUAS leituras devolvem o campo — a fila de triagem da Enfermagem e o
 *     histórico de saúde da criança. Gravar sem ler é o defeito de origem desta
 *     coluna, e ele não se repete pela metade.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Quem levou a criança na consulta', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const enviar = (corpo: Record<string, unknown>) =>
    request(http).post('/api/v1/nursing/evolutions').set(auth(tokens.educador))
      .send({ personId: ids.crianca, houseId: ids.AI3, tipo: 'consulta',
              quandoAconteceu: new Date().toISOString(),
              local: 'UBS fictícia', especialidade: 'odontologia',
              estadoRetorno: 'Voltou tranquilo, sem dor referida; comeu bem no jantar.',
              ...corpo });

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();

    tokens.educador = await login('educador.ai3@paodospobres.dev');
    tokens.enfermagem = await login('enfermagem@paodospobres.dev');

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    /* Uma criança fora das pontas da lista: as pontas são as que outras suítes
       usam, e duas suítes escrevendo saúde da mesma criança é confusão barata. */
    ({ rows: [{ id: ids.crianca }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name OFFSET 7 LIMIT 1`, [ids.AI3]));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('o nome de quem levou é gravado — e quem escreveu continua sendo quem escreveu', async () => {
    const r = await enviar({ acompanhanteNome: 'Seu Jorge, motorista da Fundação (fictício)' });
    expect(r.status).toBe(201);

    const { rows: [ev] } = await admin.query(
      `SELECT e.companion_name, u.email AS autor
         FROM health_evolution e JOIN app_user u ON u.id = e.accompanied_by
        WHERE e.person_id = $1 ORDER BY e.created_at DESC LIMIT 1`, [ids.crianca]);
    expect(ev.companion_name).toBe('Seu Jorge, motorista da Fundação (fictício)');
    /* As duas perguntas continuam separadas: quem levou é o motorista, quem
       responde pelo que está escrito é o educador que escreveu. */
    expect(ev.autor).toBe('educador.ai3@paodospobres.dev');
  });

  it('sem o nome, a coluna fica nula — e nulo aqui quer dizer "foi quem escreveu"', async () => {
    const r = await enviar({});
    expect(r.status).toBe(201);
    const { rows: [ev] } = await admin.query(
      `SELECT companion_name FROM health_evolution
        WHERE person_id = $1 ORDER BY created_at DESC LIMIT 1`, [ids.crianca]);
    expect(ev.companion_name).toBeNull();
  });

  it('espaço em branco não vira nome', async () => {
    const r = await enviar({ acompanhanteNome: '    ' });
    expect(r.status).toBe(201);
    const { rows: [ev] } = await admin.query(
      `SELECT companion_name FROM health_evolution
        WHERE person_id = $1 ORDER BY created_at DESC LIMIT 1`, [ids.crianca]);
    expect(ev.companion_name).toBeNull();
  });

  /**
   * AS DUAS LEITURAS — e é por elas que esta fase existe.
   *
   * Gravar sem ler é exatamente o defeito de origem da coluna: ela esteve lá,
   * escrita no papel e prevista na migração, e ninguém a mostrava.
   */
  it('a fila de triagem da Enfermagem mostra quem levou', async () => {
    const nome = 'Tia Cláudia, autorizada na ficha (fictícia)';
    expect((await enviar({ acompanhanteNome: nome })).status).toBe(201);

    const fila = await request(http).get(`/api/v1/nursing/triage?houseId=${ids.AI3}`)
      .set(auth(tokens.enfermagem));
    expect(fila.status).toBe(200);
    const minha = fila.body.filter((e: any) => e.acolhidoId === ids.crianca);
    expect(minha.some((e: any) => e.quemLevou === nome)).toBe(true);
    /* Ao LADO, e não no lugar: a Enfermagem que tria precisa dos dois nomes. */
    expect(minha.every((e: any) => typeof e.acompanhante === 'string')).toBe(true);
  });

  it('o histórico de saúde da criança mostra quem levou', async () => {
    const nome = 'Motorista do convênio (fictício)';
    expect((await enviar({ acompanhanteNome: nome })).status).toBe(201);

    const hist = await request(http).get(`/api/v1/nursing/history/${ids.crianca}`)
      .set(auth(tokens.enfermagem));
    expect(hist.status).toBe(200);
    expect(hist.body.evolucoes.some((e: any) => e.quemLevou === nome)).toBe(true);
  });
});
