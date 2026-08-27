/**
 * Testes de aceite da Fase 3 — Operação do plantão.
 * Cenários do Prompt Master §26.2:
 *   #8  Tarefa individual aparece na linha geral
 *   #9  Tarefa específica exige ciência
 *   #10 Coletiva registra autor e resultados individuais
 *   #16 Offline preserva horário real
 *   #17 Conflito mantém versões
 *   +   Escalonamento idempotente (§8.5), substituição (§8.3),
 *       "sem confirmação" nunca vira "não realizada",
 *       e o isolamento entre partições (linha do tempo sem acoplamento).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
// A data do sistema é a da INSTITUIÇÃO (America/Sao_Paulo), não a UTC do
// servidor: às 02h UTC ainda é ontem em Porto Alegre, e o plantão noturno
// cairia no dia errado (§23).
const HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

describe('Fase 3 — Rotina, atividades, chamadas, linha do tempo e offline', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, alice: string, bruno: string, educador2: string;

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
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

    for (const [k, email] of Object.entries({
      educador: 'educador.ai3@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: alice }] } = await admin.query(`SELECT id FROM person WHERE social_name='Alice'`));
    ({ rows: [{ id: bruno }] } = await admin.query(`SELECT id FROM person WHERE social_name='Bruno'`));
    ({ rows: [{ id: educador2 }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='lider.ai3@paodospobres.dev'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ---------- Rotina ----------

  it('equipe técnica cria a rotina da casa; educador não altera', async () => {
    const v = await request(http).post('/api/v1/routine/versions').set(auth(tokens.tecnica))
      .send({ houseId: AI3, motivo: 'Rotina inicial do piloto' });
    expect(v.status).toBe(201);
    const versionId = v.body.versaoId;

    // Coletiva: café da manhã para todos
    await request(http).post(`/api/v1/routine/versions/${versionId}/items`).set(auth(tokens.tecnica))
      .send({ houseId: AI3, kind: 'refeicao', title: 'Café da manhã', startTime: '07:00', collective: true })
      .expect(201);

    // Individual: reforço escolar do Bruno, exigindo ciência
    await request(http).post(`/api/v1/routine/versions/${versionId}/items`).set(auth(tokens.tecnica))
      .send({ houseId: AI3, kind: 'educacao', title: 'Reforço escolar', startTime: '10:00',
              collective: false, personId: bruno, requiresAck: true })
      .expect(201);

    const negado = await request(http).post('/api/v1/routine/versions').set(auth(tokens.educador))
      .send({ houseId: AI3, motivo: 'tentativa' });
    expect(negado.status).toBe(403);
  });

  it('alterar a rotina cria versão nova preservando a anterior', async () => {
    const v2 = await request(http).post('/api/v1/routine/versions').set(auth(tokens.coord))
      .send({ houseId: AI3, motivo: 'Ajuste no horário do lanche' });
    expect(v2.body.numero).toBe(2);

    const hist = await request(http).get(`/api/v1/routine/history?houseId=${AI3}`).set(auth(tokens.coord));
    expect(hist.body).toHaveLength(2);
    expect(hist.body.find((h: any) => h.numero === 1).vigenteAte).not.toBeNull();

    // Os itens foram copiados para a nova versão: alterar não recomeça do zero.
    const atual = await request(http).get(`/api/v1/routine?houseId=${AI3}`).set(auth(tokens.coord));
    expect(atual.body.itens).toHaveLength(2);
  });

  // ---------- Atividades ----------

  it('gera o dia a partir da rotina; gerar de novo não duplica', async () => {
    const g1 = await request(http).post('/api/v1/activities/generate-day').set(auth(tokens.tecnica))
      .send({ houseId: AI3, date: HOJE });
    expect(g1.body.criadas).toBe(2);

    const g2 = await request(http).post('/api/v1/activities/generate-day').set(auth(tokens.tecnica))
      .send({ houseId: AI3, date: HOJE });
    expect(g2.body.criadas).toBe(0);      // idempotente
    expect(g2.body.jaExistiam).toBe(2);
  });

  it('cenário #8 — tarefa individual aparece na visão da casa, não fica oculta', async () => {
    const tl = await request(http).get(`/api/v1/timeline?houseId=${AI3}&date=${HOJE}&mode=casa`)
      .set(auth(tokens.educador));
    expect(tl.status).toBe(200);

    const individual = tl.body.eventos.find((e: any) => e.title === 'Reforço escolar');
    expect(individual).toBeDefined();
    expect(individual.personId).toBe(bruno);
    expect(individual.personName).toBe('Bruno');       // o acolhido fica claro (§9)

    const coletiva = tl.body.eventos.find((e: any) => e.title === 'Café da manhã');
    expect(coletiva.personId).toBeNull();
    expect(tl.body.resumo.individuais).toBeGreaterThan(0);
  });

  it('cenário #9 — tarefa específica exige ciência, e ciência não é conclusão', async () => {
    const { rows: [a] } = await admin.query(
      `SELECT id, state FROM activity WHERE title='Reforço escolar' AND person_id=$1`, [bruno]);
    expect(a.state).toBe('aguardando_ciencia');

    const ack = await request(http).post(`/api/v1/activities/${a.id}/acknowledge`)
      .set(auth(tokens.educador)).send({});
    expect(ack.status).toBe(201);
    expect(ack.body.aviso).toMatch(/não é conclusão/i);

    const { rows: [depois] } = await admin.query(`SELECT state FROM activity WHERE id=$1`, [a.id]);
    expect(depois.state).toBe('ciente');               // ciente ≠ concluída

    // Ciência é ato pessoal: não se toma duas vezes.
    const dup = await request(http).post(`/api/v1/activities/${a.id}/acknowledge`)
      .set(auth(tokens.educador)).send({});
    expect(dup.status).toBe(409);
  });

  it('exceção exige justificativa objetiva', async () => {
    const { rows: [a] } = await admin.query(`SELECT id FROM activity WHERE title='Café da manhã'`);

    const semNota = await request(http).post(`/api/v1/activities/${a.id}/record`)
      .set(auth(tokens.educador)).send({ estado: 'nao_realizada_transporte' });
    expect(semNota.status).toBe(400);
    expect(semNota.body.message).toMatch(/justificativa/i);

    const comNota = await request(http).post(`/api/v1/activities/${a.id}/record`)
      .set(auth(tokens.educador))
      .send({ estado: 'concluida_no_horario', nota: 'Servido às 07:05' });
    expect(comNota.status).toBe(201);
    expect(comNota.body.rotulo).toBe('Concluída no horário');
  });

  it('vencida sem confirmação vira “sem confirmação”, nunca “não realizada”', async () => {
    // Cria uma atividade no passado e deixa vencer
    const urg = await request(http).post('/api/v1/activities/urgent').set(auth(tokens.lider))
      .send({ houseId: AI3, title: 'Atividade que vai vencer', reason: 'teste de vencimento',
              scheduledAt: new Date(Date.now() - 3 * 3600_000).toISOString() });
    expect(urg.status).toBe(201);

    const r = await request(http).post('/api/v1/activities/mark-unconfirmed')
      .set(auth(tokens.tecnica)).send({ houseId: AI3, minutos: 60 });
    expect(r.body.marcadas).toBeGreaterThan(0);
    expect(r.body.aviso).toMatch(/não conclui omissão/i);

    const { rows } = await admin.query(
      `SELECT state FROM activity WHERE id=$1`, [urg.body.id]);
    expect(rows[0].state).toBe('sem_confirmacao');
    expect(rows[0].state).not.toBe('nao_realizada_decisao_institucional');
  });

  it('escalonamento avisa técnica/coordenação e é idempotente por atividade', async () => {
    // O primeiro mark-unconfirmed (teste anterior) já escalonou. O
    // escalonamento é POR ATIVIDADE: usar a casa como entidade gastava a chave
    // de idempotência no primeiro dia e calava o aviso para sempre.
    const { rows: esc } = await admin.query(
      `SELECT count(*)::int AS n FROM escalation
        WHERE entity='activity_unconfirmed' AND level='tecnica_coordenacao'`);
    expect(esc[0].n).toBeGreaterThan(0);
    const antes = esc[0].n;

    // Reprocessar a fila não duplica: é o que a idempotência protege.
    await request(http).post('/api/v1/activities/mark-unconfirmed')
      .set(auth(tokens.tecnica)).send({ houseId: AI3, minutos: 60 });
    const { rows: depois } = await admin.query(
      `SELECT count(*)::int AS n FROM escalation
        WHERE entity='activity_unconfirmed' AND level='tecnica_coordenacao'`);
    expect(depois[0].n).toBe(antes);

    // Mas uma atividade DIFERENTE vencendo gera aviso novo — o defeito antigo
    // era exatamente este silêncio a partir do segundo caso.
    const outra = await request(http).post('/api/v1/activities/urgent')
      .set(auth(tokens.lider))
      .send({ houseId: AI3, title: 'Reunião de equipe extraordinária',
              scheduledAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
              reason: 'Convocação da coordenação para alinhar o plantão' });
    expect(outra.status).toBe(201);
    await request(http).post('/api/v1/activities/mark-unconfirmed')
      .set(auth(tokens.tecnica)).send({ houseId: AI3, minutos: 60 });
    const { rows: nova } = await admin.query(
      `SELECT count(*)::int AS n FROM escalation
        WHERE entity='activity_unconfirmed' AND level='tecnica_coordenacao'`);
    expect(nova[0].n).toBeGreaterThan(antes);

    // A técnica recebeu notificação na central — agrupada, não uma por atividade.
    const notif = await request(http).get('/api/v1/notifications').set(auth(tokens.tecnica));
    expect(notif.body.length).toBeGreaterThan(0);
    // Agrupada: uma notificação para N atividades vencidas, não uma por
    // atividade. (Doses vencidas têm título e agrupamento próprios.)
    const agrupadas = notif.body.filter((n: any) => n.titulo === 'Atividades sem confirmação');
    expect(agrupadas.length).toBe(1);
  });

  it('notificação não revela conteúdo sensível fora do app', async () => {
    const { rows } = await admin.query(`SELECT DISTINCT safe_title FROM notification`);
    for (const r of rows) {
      expect(r.safe_title).toBe('Há uma pendência na Rede Acolher');
      expect(r.safe_title).not.toMatch(/Alice|Bruno|insulina|judicial/i);
    }
    const count = await request(http).get('/api/v1/notifications/count').set(auth(tokens.tecnica));
    expect(count.body.tituloSeguro).toBe('Há uma pendência na Rede Acolher');
  });

  it('substituição registra a cadeia completa e exige ciência do substituto', async () => {
    const { rows: [a] } = await admin.query(
      `SELECT id FROM activity WHERE title='Reforço escolar' AND person_id=$1`, [bruno]);

    const pedido = await request(http).post(`/api/v1/activities/${a.id}/substitution`)
      .set(auth(tokens.educador)).send({ motivo: 'Acompanhará retorno da UPA com outro acolhido' });
    expect(pedido.status).toBe(201);

    const { rows: [act] } = await admin.query(`SELECT state FROM activity WHERE id=$1`, [a.id]);
    expect(act.state).toBe('aguardando_substituicao');

    const atribuir = await request(http).post(`/api/v1/activities/substitutions/${pedido.body.id}/assign`)
      .set(auth(tokens.lider)).send({ substitutoId: educador2, nota: 'Cobertura confirmada' });
    expect(atribuir.status).toBe(201);
    expect(atribuir.body.aviso).toMatch(/ciência/i);

    // A cadeia inteira está registrada: quem pediu, motivo, quem autorizou, quem assumiu
    const lista = await request(http).get(`/api/v1/activities/substitutions?houseId=${AI3}`)
      .set(auth(tokens.coord));
    const s = lista.body[0];
    expect(s.pedidoPor).toBeTruthy();
    expect(s.motivo).toMatch(/UPA/);
    expect(s.substituto).toBeTruthy();
    expect(s.status).toBe('atribuida');
  });

  it('atividade urgente do líder exige motivo e não altera a rotina regular', async () => {
    const semMotivo = await request(http).post('/api/v1/activities/urgent').set(auth(tokens.lider))
      .send({ houseId: AI3, title: 'Sem motivo', scheduledAt: new Date().toISOString() });
    expect(semMotivo.status).toBe(400);

    const antes = await request(http).get(`/api/v1/routine?houseId=${AI3}`).set(auth(tokens.coord));
    const ok = await request(http).post('/api/v1/activities/urgent').set(auth(tokens.lider))
      .send({ houseId: AI3, title: 'Levar Igor ao retorno da UPA', reason: 'Retorno marcado na alta',
              scheduledAt: new Date().toISOString() });
    expect(ok.status).toBe(201);
    expect(ok.body.aviso).toMatch(/planejamento regular não foi alterado/i);

    const depois = await request(http).get(`/api/v1/routine?houseId=${AI3}`).set(auth(tokens.coord));
    expect(depois.body.itens).toHaveLength(antes.body.itens.length);   // rotina intacta

    // Educador comum não cria atividade urgente
    const negado = await request(http).post('/api/v1/activities/urgent').set(auth(tokens.educador))
      .send({ houseId: AI3, title: 'x', reason: 'y', scheduledAt: new Date().toISOString() });
    expect(negado.status).toBe(403);
  });

  // ---------- Chamadas coletivas ----------

  it('cenário #10 — chamada coletiva gera registro individual por acolhido, com autoria', async () => {
    const ab = await request(http).post('/api/v1/checks').set(auth(tokens.educador))
      .send({ houseId: AI3, kind: 'alimentacao', titulo: 'Almoço' });
    expect(ab.status).toBe(201);
    const checkId = ab.body.id;
    const esperados = ab.body.esperados;
    expect(esperados).toBeGreaterThan(0);

    // Não confirma com conferência incompleta
    const cedo = await request(http).post(`/api/v1/checks/${checkId}/confirm`).set(auth(tokens.educador));
    expect(cedo.status).toBe(400);
    expect(cedo.body.message).toMatch(/conferidos individualmente/i);

    // Exceção exige justificativa
    const semNota = await request(http).post(`/api/v1/checks/${checkId}/mark`).set(auth(tokens.educador))
      .send({ personId: bruno, opcao: 'recusou' });
    expect(semNota.status).toBe(400);

    // Marca todos, um a um
    const { rows: ativos } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa'`, [AI3]);
    for (const p of ativos) {
      await request(http).post(`/api/v1/checks/${checkId}/mark`).set(auth(tokens.educador))
        .send({ personId: p.person_id, opcao: 'normal' }).expect(201);
    }
    await request(http).post(`/api/v1/checks/${checkId}/mark`).set(auth(tokens.educador))
      .send({ personId: bruno, opcao: 'parcial', nota: 'Comeu metade do prato; aceitou fruta depois' })
      .expect(201);

    // A chamada da casa não alcança quem não está nela (isolamento, §5.13).
    const { rows: [fora] } = await admin.query(
      `SELECT p.id FROM person p
       JOIN house_stay s ON s.person_id = p.id AND s.status='ativa'
       WHERE s.house_id <> $1 LIMIT 1`, [AI3]);
    if (fora) {
      const r = await request(http).post(`/api/v1/checks/${checkId}/mark`).set(auth(tokens.educador))
        .send({ personId: fora.id, opcao: 'normal' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/não está ativo nesta casa/i);
    }

    const conf = await request(http).post(`/api/v1/checks/${checkId}/confirm`).set(auth(tokens.educador));
    expect(conf.status).toBe(201);
    expect(conf.body.conferidos).toBe(esperados);
    expect(conf.body.aviso).toMatch(/registros individuais/i);

    // Cada acolhido tem SEU registro, com autor
    const { rows } = await admin.query(
      `SELECT r.person_id, r.option_code, r.note, r.recorded_by FROM check_result r WHERE r.check_id=$1`, [checkId]);
    expect(rows).toHaveLength(esperados);
    expect(rows.every((r: any) => r.recorded_by)).toBe(true);
    const brunoRow = rows.find((r: any) => r.person_id === bruno);
    expect(brunoRow.option_code).toBe('parcial');
    expect(brunoRow.note).toMatch(/metade do prato/);
  });

  it('chamada confirmada não aceita alteração direta', async () => {
    const { rows: [k] } = await admin.query(`SELECT id FROM collective_check WHERE status='confirmada' LIMIT 1`);
    const r = await request(http).post(`/api/v1/checks/${k.id}/mark`).set(auth(tokens.educador))
      .send({ personId: bruno, opcao: 'normal' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/adendo/i);
  });

  // ---------- Linha do tempo e painel ----------

  it('linha do tempo agrega provedores registrados, em ordem cronológica', async () => {
    const tl = await request(http).get(`/api/v1/timeline?houseId=${AI3}&date=${HOJE}`)
      .set(auth(tokens.educador));
    // Verifica o COMPORTAMENTO (os provedores registrados aparecem), não a
    // lista exata: congelar os nomes faria este teste quebrar a cada módulo
    // novo — justamente o oposto do que a arquitetura de partições promete.
    expect(tl.body.fontes).toEqual(expect.arrayContaining(['activities', 'checks']));
    expect(tl.body.incompleta).toBe(false);

    const horas = tl.body.eventos.map((e: any) => e.at);
    expect([...horas].sort()).toEqual(horas);          // já vem ordenado

    // Eventos de módulos diferentes convivem na mesma lista
    const fontes = new Set(tl.body.eventos.map((e: any) => e.source));
    expect(fontes.has('activities')).toBe(true);
    expect(fontes.has('checks')).toBe(true);
  });

  it('painel da casa mostra situação por acolhido, sem ranking', async () => {
    const p = await request(http).get(`/api/v1/timeline/house-panel?houseId=${AI3}&date=${HOJE}`)
      .set(auth(tokens.educador));
    expect(p.status).toBe(200);
    expect(p.body.acolhidos.length).toBeGreaterThan(0);

    const nomes = p.body.acolhidos.map((a: any) => a.nome);
    expect([...nomes].sort()).toEqual(nomes);          // ordem alfabética, não classificação

    const texto = JSON.stringify(p.body);
    expect(texto).not.toMatch(/pontua|ranking|nota geral|melhor|pior/i);
  });

  it('modo “minhas responsabilidades” filtra a visão sem esconder o que exige ciência', async () => {
    const minhas = await request(http).get(`/api/v1/timeline?houseId=${AI3}&date=${HOJE}&mode=minhas`)
      .set(auth(tokens.educador));
    expect(minhas.body.modo).toBe('minhas');
    // A visão da casa continua completa — o filtro é escolha do educador (§9)
    const casa = await request(http).get(`/api/v1/timeline?houseId=${AI3}&date=${HOJE}&mode=casa`)
      .set(auth(tokens.educador));
    expect(casa.body.eventos.length).toBeGreaterThanOrEqual(minhas.body.eventos.length);
  });

  // ---------- Offline ----------

  it('cenário #16 — offline preserva o horário REAL do evento', async () => {
    const { rows: [a] } = await admin.query(
      `SELECT id FROM activity WHERE title='Levar Igor ao retorno da UPA' LIMIT 1`);
    const horarioReal = new Date(Date.now() - 5 * 3600_000).toISOString();  // 5h atrás

    const r = await request(http).post('/api/v1/sync/push').set(auth(tokens.educador)).send({
      operacoes: [{
        clientOpId: 'op-real-001', kind: 'activity.record', houseId: AI3,
        payload: { activityId: a.id, estado: 'concluida_com_atraso', nota: 'Registrado sem internet' },
        happenedAt: horarioReal, queuedAt: horarioReal, device: 'aparelho-casa-03',
      }],
    });
    expect(r.status).toBe(201);
    expect(r.body.resultados[0].status).toBe('aplicada');

    const { rows: [exec] } = await admin.query(
      `SELECT happened_at, synced_at, offline FROM activity_execution WHERE client_op_id='op-real-001'`);
    expect(exec.offline).toBe(true);
    expect(new Date(exec.happened_at).toISOString()).toBe(horarioReal);   // horário real intacto
    expect(new Date(exec.synced_at).getTime()).toBeGreaterThan(new Date(horarioReal).getTime());
  });

  it('reenvio da mesma operação não duplica (idempotência)', async () => {
    const { rows: [a] } = await admin.query(
      `SELECT id FROM activity WHERE title='Levar Igor ao retorno da UPA' LIMIT 1`);
    const r = await request(http).post('/api/v1/sync/push').set(auth(tokens.educador)).send({
      operacoes: [{
        clientOpId: 'op-real-001', kind: 'activity.record', houseId: AI3,
        payload: { activityId: a.id, estado: 'concluida_com_atraso' },
        happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
      }],
    });
    expect(r.body.resultados[0].status).toBe('duplicada');

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM activity_execution WHERE client_op_id='op-real-001'`);
    expect(rows[0].n).toBe(1);
  });

  it('offline só aceita medicamento no aparelho institucional designado (§11.7)', async () => {
    const r = await request(http).post('/api/v1/sync/push').set(auth(tokens.educador)).send({
      operacoes: [{
        clientOpId: 'op-med-pessoal', kind: 'medication.confirm', houseId: AI3,
        payload: { dose: 'x' }, happenedAt: new Date().toISOString(),
        queuedAt: new Date().toISOString(), institutionalDevice: false,
      }],
    });
    expect(r.body.resultados[0].status).toBe('rejeitada');
    expect(r.body.resultados[0].motivo).toMatch(/aparelho institucional/i);
    expect(r.body.podeLimpar).not.toContain('op-med-pessoal');   // não some do aparelho
  });

  it('cenário #17 — conflito preserva as duas versões e espera decisão humana', async () => {
    const r = await request(http).post('/api/v1/sync/push').set(auth(tokens.educador)).send({
      operacoes: [{
        clientOpId: 'op-conflito-001', kind: 'activity.record', houseId: AI3,
        payload: { activityId: '00000000-0000-0000-0000-000000000000', estado: 'concluida_no_horario' },
        happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
      }],
    });
    expect(r.body.resultados[0].status).toBe('conflito');

    const conflitos = await request(http).get(`/api/v1/sync/conflicts?houseId=${AI3}`)
      .set(auth(tokens.tecnica));
    expect(conflitos.body.length).toBeGreaterThan(0);
    const c = conflitos.body[0];
    expect(c.versaoA).toBeTruthy();
    expect(c.versaoB).toBeTruthy();
    expect(c.aviso).toMatch(/não escolhe a versão correta/i);

    // Educador não resolve conflito; técnica resolve registrando a decisão
    await request(http).post(`/api/v1/sync/conflicts/${c.id}/resolve`)
      .set(auth(tokens.educador)).send({ decisao: 'x' }).expect(403);

    const res = await request(http).post(`/api/v1/sync/conflicts/${c.id}/resolve`)
      .set(auth(tokens.tecnica))
      .send({ decisao: 'Registro do aparelho arquivado como duplicidade; original mantido.' });
    expect(res.status).toBe(201);
    expect(res.body.aviso).toMatch(/versões originais permanecem/i);

    const { rows } = await admin.query(
      `SELECT status, version_a, version_b, resolution FROM sync_conflict WHERE id=$1`, [c.id]);
    expect(rows[0].status).toBe('resolvido');
    expect(rows[0].version_a).toBeTruthy();      // nada foi apagado
    expect(rows[0].version_b).toBeTruthy();
  });

  it('o aparelho só limpa o que foi confirmado pelo servidor (§17.2)', async () => {
    const { rows: [a] } = await admin.query(`SELECT id FROM activity LIMIT 1`);
    const r = await request(http).post('/api/v1/sync/push').set(auth(tokens.educador)).send({
      operacoes: [
        { clientOpId: 'op-ok-002', kind: 'activity.acknowledge', houseId: AI3,
          payload: { activityId: a.id }, happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString() },
        { clientOpId: 'op-desconhecida', kind: 'tipo.inexistente', houseId: AI3,
          payload: {}, happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString() },
      ],
    });
    expect(r.body.podeLimpar).toContain('op-ok-002');
    expect(r.body.podeLimpar).not.toContain('op-desconhecida');
  });
});
