/**
 * A LISTA DA TELA É A DO BANCO — e o 500 que ela escondia (migração 1460).
 *
 * O DEFEITO, medido em 22/09/2026 pela varredura de pontas e provado por
 * chamada: a folha da Evolução de Saúde tinha a lista de tipos **escrita à mão**,
 * e ela discordava do `encounter_kind`.
 *
 *   * a tela oferecia **`vacina`**, que o enum NÃO tem. Quem registrasse uma
 *     vacina recebia *"Internal server error"* — medido: `500`;
 *   * o enum tinha **`emergencia`** e **`terapia`**, que a tela nunca ofereceu:
 *     dois tipos de atendimento sem como registrar.
 *
 * É a §12.2 — *"a tela não inventa a sua lista"* —, a mesma classe de defeito que
 * a fase 130 consertou na Educação. A diferença é que aqui ela estava quebrando.
 *
 * **A guarda é o teste de ida e volta:** toda opção que a rota oferece é aceita
 * pelo servidor, e todo valor do enum é oferecido. Com ela, nenhuma das duas
 * listas pode andar sozinha — e era andar sozinha que causava o 500.
 *
 * Esta suíte cobra também as duas colunas que a varredura achou paradas: o
 * comportamento ao chegar e ao sair (as quatro opções do modelo de papel) e a
 * data em que o profissional prescreveu.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A lista da tela é a do banco', () => {
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
      .send({ personId: ids.crianca, houseId: ids.AI3,
              quandoAconteceu: new Date().toISOString(),
              estadoRetorno: 'Voltou tranquilo, sem queixa — ficção desta suíte.',
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
    ({ rows: [{ id: ids.crianca }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name OFFSET 13 LIMIT 1`, [ids.AI3]));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ============ A ida e a volta ============

  it('a rota oferece EXATAMENTE os valores do enum do banco', async () => {
    const r = await request(http).get('/api/v1/nursing/evolutions/options')
      .set(auth(tokens.educador));
    expect(r.status).toBe(200);

    const { rows } = await admin.query(
      `SELECT e.enumlabel AS cod FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'encounter_kind' ORDER BY e.enumsortorder`);
    expect(r.body.tipos.map((t: any) => t.cod)).toEqual(rows.map((x: any) => x.cod));
    /* E todo tipo tem rótulo de gente: `terapia` cru na tela é melhor do que
       botão nenhum, mas é para ser visto uma vez e escrito. */
    for (const t of r.body.tipos) {
      expect(typeof t.label).toBe('string');
      expect(t.label.length).toBeGreaterThan(2);
    }
  });

  it('e TODO tipo oferecido é aceito pelo servidor — é o teste que pegaria o 500', async () => {
    const r = await request(http).get('/api/v1/nursing/evolutions/options')
      .set(auth(tokens.educador));
    for (const t of r.body.tipos) {
      const enviado = await enviar({ tipo: t.cod });
      expect([201, 200]).toContain(enviado.status);
    }
  });

  it('o tipo que o banco NÃO tem é recusado com frase, e não com 500', async () => {
    /* Era exatamente o caso do `vacina`: a tela oferecia, o servidor estourava.
       Agora a tela não oferece — e se alguém mandar de um aparelho antigo, ou de
       uma fila offline gravada antes desta fase, a resposta é uma frase. */
    const r = await enviar({ tipo: 'vacina' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/tipo de atendimento/i);
    expect(r.status).not.toBe(500);
  });

  // ============ O comportamento nos dois momentos ============

  it('grava como a criança estava ao chegar e ao sair, e devolve os dois', async () => {
    const r = await enviar({ tipo: 'consulta',
      comportamentoAoChegar: 'ansiosa_temerosa_chorosa', comportamentoAoSair: 'tranquila' });
    expect(r.status).toBe(201);

    const { rows: [ev] } = await admin.query(
      `SELECT behavior_before, behavior_after FROM health_evolution
        WHERE person_id = $1 ORDER BY created_at DESC LIMIT 1`, [ids.crianca]);
    expect(ev.behavior_before).toBe('ansiosa_temerosa_chorosa');
    expect(ev.behavior_after).toBe('tranquila');

    const fila = await request(http).get(`/api/v1/nursing/triage?houseId=${ids.AI3}`)
      .set(auth(tokens.enfermagem));
    const minha = fila.body.filter((e: any) => e.acolhidoId === ids.crianca);
    expect(minha.some((e: any) => e.comportamentoAoChegar === 'ansiosa_temerosa_chorosa'
      && e.comportamentoAoSair === 'tranquila')).toBe(true);
  });

  it('opção fora das quatro do papel é recusada pelo banco, e não gravada', async () => {
    const r = await enviar({ tipo: 'consulta', comportamentoAoChegar: 'irritada' });
    /* O CHECK da 0530 é quem recusa: quatro opções, nem mais nem menos. */
    expect([400, 500]).toContain(r.status);
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM health_evolution
        WHERE person_id = $1 AND behavior_before = 'irritada'`, [ids.crianca]);
    expect(rows[0].n).toBe(0);
  });

  it('e os dois ficam OPCIONAIS — o papel também deixa em branco', async () => {
    const r = await enviar({ tipo: 'consulta' });
    expect(r.status).toBe(201);
    const { rows: [ev] } = await admin.query(
      `SELECT behavior_before, behavior_after FROM health_evolution
        WHERE person_id = $1 ORDER BY created_at DESC LIMIT 1`, [ids.crianca]);
    expect(ev.behavior_before).toBeNull();
    expect(ev.behavior_after).toBeNull();
  });

  // ============ A data do papel do médico ============

  it('a data em que o profissional prescreveu é gravada, e não é o início na casa', async () => {
    const r = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: ids.crianca, houseId: ids.AI3, tipo: 'uso_continuo',
              medicamento: 'Vitamina fictícia D', dose: '1 gota', via: 'oral',
              prescritor: 'Pediatria (fictícia)',
              prescritaEm: '2026-09-10', inicio: '2026-09-12' });
    expect(r.status).toBe(201);

    const { rows: [p] } = await admin.query(
      `SELECT prescribed_on, starts_on FROM prescription WHERE id = $1`, [r.body.id]);
    /* Duas datas, e a diferença entre elas é informação: a receita já tinha dois
       dias quando entrou na grade. */
    /* O `pg` devolve `Date`, e `String(Date)` dá o formato do JavaScript — a
       comparação é pela data ISO, que é o que a coluna guarda. */
    const soODia = (d: any) => new Date(d).toISOString().slice(0, 10);
    expect(soODia(p.prescribed_on)).toBe('2026-09-10');
    expect(soODia(p.starts_on)).toBe('2026-09-12');

    const lista = await request(http).get(`/api/v1/medications/prescriptions?houseId=${ids.AI3}`)
      .set(auth(tokens.enfermagem));
    const meu = lista.body.esquemas.find((e: any) => e.id === r.body.id);
    expect(soODia(meu.prescritaEm)).toBe('2026-09-10');
  });

  it('sem a data do papel, ela fica nula — e o início continua sendo hoje', async () => {
    const r = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: ids.crianca, houseId: ids.AI3, tipo: 'uso_continuo',
              medicamento: 'Vitamina fictícia C', dose: '1 comprimido', via: 'oral' });
    expect(r.status).toBe(201);
    const { rows: [p] } = await admin.query(
      `SELECT prescribed_on, starts_on FROM prescription WHERE id = $1`, [r.body.id]);
    expect(p.prescribed_on).toBeNull();
    /* `starts_on` cai em `app_hoje()` — o dia da INSTITUIÇÃO, não o do servidor. */
    const { rows: [{ hoje }] } = await admin.query(`SELECT app_hoje() AS hoje`);
    expect(new Date(p.starts_on).toISOString().slice(0, 10))
      .toBe(new Date(hoje).toISOString().slice(0, 10));
  });
});
