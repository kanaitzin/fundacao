/**
 * A LINHA DE UMA CASA NA ATA GERAL SE CORRIGE, COM REGISTRO (migração 1440).
 *
 * A DECISÃO, de 21/09/2026: *"quem corrige a ata é o educador líder, equipe
 * técnica ou coordenador, tudo ficando registrado para esses 3"*.
 *
 * O DEFEITO QUE ISTO FECHA: a rota existia e **só o autor da ATA Geral a
 * alcançava, e só enquanto ela fosse rascunho**. Depois de assinada, ninguém
 * mexia — um horário digitado errado às 3h da manhã ficava errado para sempre, e
 * a casa aprendia que a ATA Geral não se conserta. Era o último item do Grupo 2
 * do §9, esperando esta resposta.
 *
 * **Corrigir não é sobrescrever, e a diferença é o histórico.** O §6 proíbe
 * sobrescrita de registro fechado, e o que ele proíbe é a sobrescrita SEM RASTRO
 * — o sistema já resolveu isso na chamada (0670): o que constava antes fica
 * guardado por gatilho, e a tela diz *"Antes constava…"* com o nome de quem
 * corrigiu. Esta suíte cobra que aqui seja igual.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A linha da casa na ATA Geral se corrige', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const corrigir = (token: string, corpo: Record<string, unknown>) =>
    request(http).patch(`/api/v1/shifts/general-ata/${ids.geral}/house/${ids.AI3}`)
      .set(auth(token)).send(corpo);
  const ler = (token: string) =>
    request(http).get(`/api/v1/shifts/general-ata/${ids.geral}`).set(auth(token));

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
      noturno: 'lider.noturno@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));

    /*
     * UMA ATA GERAL PRÓPRIA, em data própria (regra 13 da casa: data desta
     * suíte, para não disputar a de hoje com as outras). Ela nasce rascunho, é
     * preenchida pelo autor e depois ASSINADA — é o estado em que a correção
     * passa a fazer sentido.
     */
    const geral = await request(http).post('/api/v1/shifts/general-ata')
      .set(auth(tokens.noturno)).send({ data: '2024-03-07' });
    expect(geral.status).toBe(201);
    ids.geral = geral.body.id;

    const preenche = await corrigir(tokens.noturno, {
      houveContato: true, motivo: 'Chamado às 3h por causa de um pesadelo.',
      acao: 'Fui até a casa, conversei e a criança voltou a dormir.',
    });
    expect(preenche.status).toBe(200);

    /* Assinada com pendência: as oito ATAs noturnas desta data não existem, e é
       exatamente assim que a ATA Geral fecha na vida real. */
    const fecha = await request(http).post(`/api/v1/shifts/general-ata/${ids.geral}/sign`)
      .set(auth(tokens.noturno))
      .send({ pendencias: 'Casas sem ATA noturna fechada nesta data fictícia da suíte.' });
    expect(fecha.status).toBe(201);
  });

  afterAll(async () => {
    /* Um banco só: o que esta suíte abre, ela fecha (a lição da fase 127). */
    await admin.query(
      `DELETE FROM general_night_house_amendment WHERE general_ata_id = $1`, [ids.geral]);
    await admin.query(
      `DELETE FROM general_night_house_entry WHERE general_ata_id = $1`, [ids.geral]);
    await admin.query(`DELETE FROM general_night_ata WHERE id = $1`, [ids.geral]);
    await app.close(); await admin.end();
  });

  // ==================== Quem corrige ====================

  it('depois de assinada, o Líder Diurno corrige — e o motivo é obrigatório', async () => {
    const semMotivo = await corrigir(tokens.lider, { chegada: '2024-03-07T03:10:00-03:00' });
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.message).toMatch(/já foi assinada/i);
    expect(semMotivo.body.message).toMatch(/por que/i);

    const r = await corrigir(tokens.lider, {
      chegada: '2024-03-07T03:10:00-03:00',
      motivoDaCorrecao: 'O horário de chegada estava 03:40; o registro da portaria mostra 03:10.',
    });
    expect(r.status).toBe(200);
    expect(r.body.aviso).toMatch(/nada se apaga/i);
  });

  it('a equipe técnica e a coordenação também corrigem', async () => {
    for (const [i, cargo] of (['tecnica', 'coord'] as const).entries()) {
      const r = await corrigir(tokens[cargo], {
        acao: `Ação fictícia corrigida pela suíte, versão ${i + 2}.`,
        motivoDaCorrecao: `Correção fictícia ${i} desta suíte, com o motivo por extenso.`,
      });
      expect(r.status).toBe(200);
    }
  });

  it('o educador de plantão NÃO corrige a ATA Geral assinada', async () => {
    const r = await corrigir(tokens.educador, {
      acao: 'Tentativa fictícia do educador.',
      motivoDaCorrecao: 'Motivo fictício suficientemente longo para passar do piso de dez.',
    });
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/Líder Diurno|equipe técnica|coordenação/i);
  });

  // ==================== O que constava antes ====================

  it('o que constava ANTES fica guardado, com quem corrigiu e por quê', async () => {
    const { rows } = await admin.query(
      `SELECT arrived_at, action_taken, motivo,
              app_user_display_name(replaced_by) AS por
         FROM general_night_house_amendment
        WHERE general_ata_id = $1 AND house_id = $2
        ORDER BY replaced_at`, [ids.geral, ids.AI3]);

    /* Três correções aconteceram: a do Líder e as duas do teste acima. */
    expect(rows.length).toBeGreaterThanOrEqual(3);
    /* A PRIMEIRA guarda o estado ANTERIOR a ela — a chegada ainda nula, e a
       ação como o autor a escreveu. É isto que faz a folha poder dizer
       "antes constava". */
    expect(rows[0].arrived_at).toBeNull();
    expect(rows[0].action_taken).toMatch(/voltou a dormir/i);
    expect(rows[0].motivo).toMatch(/registro da portaria/i);
    expect(rows[0].por).toBeTruthy();
  });

  it('a leitura da ATA Geral devolve as correções na linha da casa', async () => {
    const r = await ler(tokens.coord);
    expect(r.status).toBe(200);
    const casa = r.body.casas.find((c: any) => c.casaId === ids.AI3);
    expect(casa.correcoes.length).toBeGreaterThanOrEqual(3);
    /* Registrar e não mostrar seria pior do que não registrar: criaria a
       impressão de rastro onde ninguém vê rastro. */
    expect(casa.correcoes[0].por).toBeTruthy();
    expect(casa.correcoes[0].motivo).toBeTruthy();
    expect(casa.correcoes.some((k: any) => /voltou a dormir/i.test(k.antes.acao ?? ''))).toBe(true);
    /* E o valor VIGENTE é o corrigido. */
    expect(casa.chegada).not.toBeNull();
  });

  it('salvar a mesma coisa não é correção — o histórico não ganha linha igual', async () => {
    const { rows: [antes] } = await admin.query(
      `SELECT count(*)::int AS n FROM general_night_house_amendment
        WHERE general_ata_id = $1 AND house_id = $2`, [ids.geral, ids.AI3]);

    const atual = (await ler(tokens.coord)).body.casas.find((c: any) => c.casaId === ids.AI3);
    const r = await corrigir(tokens.coord, {
      acao: atual.acao,
      motivoDaCorrecao: 'Reenvio idêntico, para provar que não vira linha de histórico.',
    });
    expect(r.status).toBe(200);

    const { rows: [depois] } = await admin.query(
      `SELECT count(*)::int AS n FROM general_night_house_amendment
        WHERE general_ata_id = $1 AND house_id = $2`, [ids.geral, ids.AI3]);
    /* Quem abrir daqui a um ano precisa distinguir "corrigido três vezes" de
       "alguém clicou três vezes". */
    expect(depois.n).toBe(antes.n);
  });

  it('ninguém escreve no histórico pela aplicação — nem apaga', async () => {
    /* O passado não se edita: o `INSERT` é do gatilho, e os outros verbos foram
       revogados do papel da aplicação. Conferido pelo CATÁLOGO, e não por
       tentativa — a conexão da suíte é de dono, e com ela tudo passaria. */
    const { rows } = await admin.query(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'rede_app' AND table_name = 'general_night_house_amendment'
        ORDER BY 1`);
    expect(rows.map((r: any) => r.privilege_type)).toEqual(['SELECT']);
  });

  it('o log registra a correção, e não copia o motivo nem o conteúdo', async () => {
    const { rows } = await admin.query(
      `SELECT action, detail FROM audit_event
        WHERE action = 'ata_geral.house_amend' ORDER BY at DESC LIMIT 1`);
    expect(rows[0].action).toBe('ata_geral.house_amend');
    expect(JSON.stringify(rows[0].detail)).not.toMatch(/portaria|pesadelo|dormir/i);
  });
});
