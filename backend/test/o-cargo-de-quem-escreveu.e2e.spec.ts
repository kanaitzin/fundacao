/**
 * O CARGO DE QUEM ESCREVEU A LINHA DA ATA (fase 152).
 *
 * O MESMO DEFEITO da lista do "se necessário", achado procurando os irmãos dele:
 * `app_user` tem RLS por linha, e educador, líder e Enfermagem só leem a PRÓPRIA.
 * O NOME de quem escreveu cada linha da ATA sempre veio por função
 * (`app_user_display_name`, 0060); o CARGO vinha por subconsulta direta — e
 * voltava NULO. A educadora que abria a ATA de ontem para saber como a casa
 * passou a noite lia **"— · 02:10"** na linha da coordenadora.
 *
 * E o protótipo mostrava o cargo, porque o servidor de mentira o preenche
 * sempre. A pergunta que esta suíte responde é a de quem LÊ, e não a de quem
 * escreve: quem escreve sempre via o próprio cargo.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O cargo de quem escreveu a linha da ATA', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const abrir = async (token: string) =>
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
      educador: 'educador.ai4@paodospobres.dev',
      coord: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    /* Um plantão só desta suíte, SEIS dias atrás: a `ata-que-a-proxima-equipe-le`
       usa quatro, e as outras disputam hoje. A ATA recusa DELETE, então a
       fixação mora onde ninguém mais olha (lição da 145). */
    const dia = (await admin.query(`SELECT (app_hoje()-6)::text AS d`)).rows[0].d;
    const aberto = await request(http).post('/api/v1/shifts').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, data: dia, turno: 'noturno' });
    ids.plantao = aberto.body.plantaoId;
    ids.ata = aberto.body.ataId;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('A EDUCADORA LÊ O CARGO DA LINHA QUE A COORDENAÇÃO ESCREVEU — era o defeito', async () => {
    const escrita = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/notes`)
      .set(auth(tokens.coord))
      .send({ texto: 'Passei na casa às duas; tudo calmo, três acordados vendo filme (fictício).' });
    expect(escrita.status).toBe(201);

    const p = await abrir(tokens.educador);
    const linha = p.linhas.notas.find((n: any) => /Passei na casa às duas/.test(n.texto));
    expect(linha).toBeTruthy();
    /* O nome sempre veio (por função, desde a 0060). O cargo vinha NULO. */
    expect(linha.quem).toBeTruthy();
    expect(linha.cargo).toBe('coordenador');
  });

  it('e quem escreveu continua vendo o próprio cargo — o caso que sempre funcionou', async () => {
    const p = await abrir(tokens.coord);
    const linha = p.linhas.notas.find((n: any) => /Passei na casa às duas/.test(n.texto));
    expect(linha.cargo).toBe('coordenador');
  });
});
