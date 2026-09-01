/**
 * A LINHA ÚNICA DE SAÚDE DO ACOLHIDO (§7.3) e o que já saiu dela (§7.4).
 *
 * `GET /nursing/history/:personId`, `GET /nursing/summary/:personId/issues` e
 * `POST /nursing/summary/issues/:id/download` existiam desde a fase 4 e nunca
 * tiveram tela. O sistema guardava cada consulta, cada evolução assinada por
 * quem acompanhou e cada dose administrada — e a pergunta mais comum da casa,
 * "quando é o retorno dele?", se respondia perguntando a um colega. É assim que
 * um retorno se perde.
 *
 * O que este teste guarda:
 *
 *  * o histórico é UMA LINHA de três origens — atendimento, evolução e dose —
 *    e cada uma continua com a autoria dela;
 *  * o RETORNO CUJA DATA JÁ PASSOU vem marcado como vencido, contado à parte.
 *    Uma data antiga sem essa marca se lê como história, não como pendência,
 *    e a diferença entre as duas leituras é uma consulta perdida;
 *  * a evolução mostra as duas vozes: quem acompanhou e o complemento da
 *    Enfermagem. Nenhuma escreve por cima da outra;
 *  * dose AINDA POR CONFIRMAR não entra no histórico. Ela está na grade do dia,
 *    esperando alguém; contá-la como coisa acontecida seria o sistema afirmando
 *    que a criança tomou;
 *  * a emissão do Resumo guarda a finalidade e quem emitiu, e a que foi gerada
 *    e nunca retirada continua aparecendo — papel que ninguém pegou não chegou
 *    a lugar nenhum;
 *  * e o alcance é o de sempre: quem não alcança a criança não lê a saúde dela.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O histórico de saúde do acolhido', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let HOJE = '';

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const historico = async (token = tokens.enfermagem) =>
    (await request(http).get(`/api/v1/nursing/history/${ids.acolhido}`).set(auth(token))).body;

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
      enfermagem: 'enfermagem@paodospobres.dev',
      // A Casa 04 de novo: a AI3 é disputada por meia dúzia de suítes, e um
      // teste que conta linhas não pode depender da ordem das outras.
      educador: 'educador.ai4@paodospobres.dev',
      coord: 'coord.ai4@paodospobres.dev',
      deOutraCasa: 'educador.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ person_id: ids.acolhido }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [ids.AI4]));
    ({ rows: [{ hoje: HOJE }] } = await admin.query(`SELECT app_hoje()::text AS hoje`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== A linha única ====================

  it('atendimento, evolução e dose entram na mesma linha, cada um com a autoria dele',
     async () => {
    const evo = await request(http).post('/api/v1/nursing/evolutions').set(auth(tokens.educador))
      .send({ personId: ids.acolhido, houseId: ids.AI4, tipo: 'consulta',
              quandoAconteceu: new Date(Date.now() - 3 * 3600_000).toISOString(),
              local: 'UBS fictícia', especialidade: 'Pediatria',
              servicoProfissional: 'Dra. Fictícia (CRM 00000)',
              motivo: 'Consulta de rotina do acolhimento.',
              estadoRetorno: 'Voltou tranquilo, comeu bem e dormiu no horário.',
              orientacoes: 'Manter hidratação e observar febre nas próximas 48 horas.',
              // Um retorno marcado para daqui a um mês: pendência que ainda não venceu.
              prazoRetorno: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) });
    expect(evo.status).toBe(201);
    ids.evolucao = evo.body.id;

    const h = await historico();
    expect(h.atendimentos.length).toBeGreaterThanOrEqual(1);
    const at = h.atendimentos[0];
    // O rótulo vem do servidor, dos códigos do banco — a tela não traduz sozinha.
    expect(at.tipo).toBe('consulta');
    expect(at.tipoRotulo).toBe('Consulta');
    expect(at.especialidade).toBe('Pediatria');
    expect(at.statusRotulo).toBe('Retorno marcado');

    const ev = h.evolucoes.find((e: any) => e.id === ids.evolucao);
    expect(ev.acompanhante).toBeTruthy();               // quem esteve lá assina
    expect(ev.status).toBe('aguardando_triagem');
    expect(ev.statusRotulo).toMatch(/Aguardando triagem/);
    expect(ev.complementoEnfermagem).toBeNull();

    expect(h.aviso).toMatch(/não resume, não conclui/i);
  });

  it('a triagem da Enfermagem entra AO LADO, sem escrever por cima', async () => {
    const t = await request(http)
      .post(`/api/v1/nursing/evolutions/${ids.evolucao}/triage`).set(auth(tokens.enfermagem))
      .send({ acao: 'assinar',
              complemento: 'Receita conferida com a grade da casa antes de valer no plantão.' });
    expect(t.status).toBe(201);

    const h = await historico();
    const ev = h.evolucoes.find((e: any) => e.id === ids.evolucao);
    expect(ev.status).toBe('assinada');
    expect(ev.statusRotulo).toBe('Conferida e assinada');
    // As duas vozes continuam lá: o que o acompanhante escreveu e o que a
    // Enfermagem acrescentou.
    expect(ev.estadoRetorno).toMatch(/comeu bem/);
    expect(ev.complementoEnfermagem).toMatch(/Receita conferida/);
    expect(h.pendencias.evolucoesAguardandoTriagem).toBe(0);
  });

  // ==================== O retorno que venceu ====================

  it('o retorno com a data já passada vem MARCADO, e não como data antiga em cinza',
     async () => {
    const antes = await historico();
    expect(antes.pendencias.retornosMarcados).toBeGreaterThanOrEqual(1);
    expect(antes.pendencias.retornosVencidos).toBe(0);

    // O tempo passa: o retorno marcado fica para trás sem ninguém tocar nele.
    await admin.query(
      `UPDATE health_encounter SET return_on = app_hoje() - 3
        WHERE person_id = $1 AND status = 'retorno_pendente'`, [ids.acolhido]);

    const h = await historico();
    const vencido = h.atendimentos.find((a: any) => a.retornoVencido);
    expect(vencido).toBeTruthy();
    expect(vencido.retornoEm < HOJE).toBe(true);
    expect(h.pendencias.retornosVencidos).toBeGreaterThanOrEqual(1);
    // E deixa de ser contado como "ainda vem": as duas contas não se somam.
    expect(h.pendencias.retornosMarcados).toBe(0);
  });

  it('a data do retorno é o dia da INSTITUIÇÃO, não o do banco', async () => {
    // `app_hoje()` e não `current_date`: depois das 21h de Porto Alegre o banco
    // já virou o dia em UTC, e o retorno de hoje apareceria como vencido — a
    // tela mandaria correr atrás de uma consulta que é amanhã.
    await admin.query(
      `UPDATE health_encounter SET return_on = app_hoje()
        WHERE person_id = $1 AND status = 'retorno_pendente'`, [ids.acolhido]);
    const h = await historico();
    expect(h.pendencias.retornosVencidos).toBe(0);
    expect(h.pendencias.retornosMarcados).toBeGreaterThanOrEqual(1);
  });

  // ==================== Doses ====================

  it('dose ainda por confirmar NÃO entra no histórico: ela está na grade, esperando alguém',
     async () => {
    const pr = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: ids.acolhido, houseId: ids.AI4, tipo: 'uso_continuo',
              medicamento: 'Vitamina D (fictícia)', dose: '5 gotas', via: 'oral',
              horarios: ['09:00'], prescritor: 'Pediatria (fictícia)', inicio: HOJE });
    await request(http).post(`/api/v1/medications/prescriptions/${pr.body.id}/sign`)
      .set(auth(tokens.enfermagem)).expect(201);
    await request(http).post('/api/v1/medications/generate-doses')
      .set(auth(tokens.enfermagem)).send({ houseId: ids.AI4, date: HOJE }).expect(201);

    const { rows: [d] } = await admin.query(
      `SELECT id FROM medication_administration WHERE prescription_id = $1`, [pr.body.id]);

    const pendente = await historico();
    expect(pendente.administracoes.some((a: any) => /Vitamina D/.test(a.medicamento))).toBe(false);

    await request(http).post(`/api/v1/medications/doses/${d.id}/confirm`)
      .set(auth(tokens.enfermagem)).send({ estado: 'administrado_no_horario' }).expect(201);

    const h = await historico();
    const dose = h.administracoes.find((a: any) => /Vitamina D/.test(a.medicamento));
    expect(dose).toBeTruthy();
    expect(dose.estadoRotulo).toBe('Administrado no horário');
    expect(dose.por).toBeTruthy();                    // quem confirmou é quem deu
  });

  // ==================== O que já saiu da casa ====================

  it('a emissão do Resumo guarda a finalidade, e a que ninguém retirou continua na lista',
     async () => {
    const vazio = await request(http)
      .get(`/api/v1/nursing/summary/${ids.acolhido}/issues`).set(auth(tokens.enfermagem));
    expect(vazio.status).toBe(200);
    const antes = vazio.body.length;

    await request(http).post(`/api/v1/nursing/summary/${ids.acolhido}`)
      .set(auth(tokens.enfermagem)).send({ finalidade: 'consulta' }).expect(201);

    const lista = await request(http)
      .get(`/api/v1/nursing/summary/${ids.acolhido}/issues`).set(auth(tokens.enfermagem));
    expect(lista.body).toHaveLength(antes + 1);
    const emissao = lista.body[0];
    expect(emissao.finalidade).toBe('consulta');
    expect(emissao.por).toBeTruthy();
    // Gerado e não retirado: o papel que ninguém pegou não chegou a ninguém.
    expect(emissao.baixadoEm).toBeNull();
    ids.emissao = emissao.id;
  });

  it('registrar a retirada é ato de quem emitiu, e fica com data', async () => {
    // Outra pessoa não registra a retirada da emissão alheia: quem levou o
    // papel é quem diz que levou.
    const outra = await request(http)
      .post(`/api/v1/nursing/summary/issues/${ids.emissao}/download`).set(auth(tokens.coord));
    expect(outra.status).toBe(404);

    await request(http).post(`/api/v1/nursing/summary/issues/${ids.emissao}/download`)
      .set(auth(tokens.enfermagem)).expect(201);

    const lista = await request(http)
      .get(`/api/v1/nursing/summary/${ids.acolhido}/issues`).set(auth(tokens.enfermagem));
    expect(lista.body.find((e: any) => e.id === ids.emissao).baixadoEm).toBeTruthy();

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event
        WHERE action = 'health.summary_download' AND entity_id = $1`, [ids.emissao]);
    expect(rows[0].n).toBe(1);
  });

  // ==================== Alcance ====================

  it('quem não alcança a criança não lê a saúde dela', async () => {
    const fora = await request(http)
      .get(`/api/v1/nursing/history/${ids.acolhido}`).set(auth(tokens.deOutraCasa));
    // O RLS não devolve linha nenhuma — e a resposta não é um erro de sistema,
    // é um histórico vazio para quem não alcança a pessoa.
    expect(fora.status).toBe(200);
    expect(fora.body.atendimentos).toEqual([]);
    expect(fora.body.evolucoes).toEqual([]);
    expect(fora.body.administracoes).toEqual([]);

    const emissoes = await request(http)
      .get(`/api/v1/nursing/summary/${ids.acolhido}/issues`).set(auth(tokens.deOutraCasa));
    expect(emissoes.body).toEqual([]);
  });
});
