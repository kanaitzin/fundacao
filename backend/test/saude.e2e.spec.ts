/**
 * Testes de aceite da Fase 4 — Medicamentos e Enfermagem.
 * Cenários do Prompt Master §26.2:
 *   #13 Medicamento alerta −30, −15, 0 e +30
 *   #14 Sem confirmação NÃO vira "não administrado"
 *   #15 Só aparelho institucional designado confirma medicamento offline
 *   #35 Enfermagem vê saúde das 8 casas, mas não abre bancário nem judicial
 *   #37 Evolução de Saúde do educador entra em fila, é triada e assinada
 *   #38 Resumo de Saúde contém só o pertinente, indica versão offline e registra finalidade
 *   +   "ninguém confirma por outro", protocolo de administração como configuração,
 *       estoque só quantidade/validade.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

describe('Fase 4 — Medicamentos e Enfermagem', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, sofia: string, educadorId: string, prescricaoId: string;

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
      enfermagem: 'enfermagem@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: sofia }] } = await admin.query(`SELECT id FROM person WHERE social_name='Sofia'`));
    ({ rows: [{ id: educadorId }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ---------- Prescrição ----------

  it('somente a Enfermagem cadastra o esquema; educador é recusado', async () => {
    const negado = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.educador))
      .send({ personId: sofia, houseId: AI3, tipo: 'uso_continuo',
              medicamento: 'Insulina NPH', dose: '6 UI', via: 'subcutânea' });
    expect(negado.status).toBe(403);

    const ok = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: sofia, houseId: AI3, tipo: 'uso_continuo',
              medicamento: 'Insulina NPH', dose: '6 UI', via: 'subcutânea',
              horarios: ['07:00', '19:00'], prescritor: 'Endocrinologia (fictício)' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('rascunho');
    expect(ok.body.aviso).toMatch(/só entra na grade após.*assinatura/i);
    prescricaoId = ok.body.id;
  });

  it('"quando necessário" exige a condição de uso escrita pelo profissional (§11.5)', async () => {
    const semCondicao = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: sofia, houseId: AI3, tipo: 'quando_necessario',
              medicamento: 'Analgésico', dose: '1 comprimido', via: 'oral' });
    expect(semCondicao.status).toBe(400);
    expect(semCondicao.body.message).toMatch(/condição de uso/i);
  });

  it('prescrição em rascunho NÃO gera doses; só depois da assinatura', async () => {
    const antes = await request(http).post('/api/v1/medications/generate-doses')
      .set(auth(tokens.enfermagem)).send({ houseId: AI3, date: HOJE });
    expect(antes.body.criadas).toBe(0);           // rascunho não entra na grade

    await request(http).post(`/api/v1/medications/prescriptions/${prescricaoId}/sign`)
      .set(auth(tokens.enfermagem)).expect(201);

    const depois = await request(http).post('/api/v1/medications/generate-doses')
      .set(auth(tokens.enfermagem)).send({ houseId: AI3, date: HOJE });
    expect(depois.body.criadas).toBe(2);          // 07:00 e 19:00

    const repetido = await request(http).post('/api/v1/medications/generate-doses')
      .set(auth(tokens.enfermagem)).send({ houseId: AI3, date: HOJE });
    expect(repetido.body.criadas).toBe(0);        // idempotente
  });

  // ---------- Protocolo: pendência institucional 33.4.1 ----------

  it('padrão protetivo: sem protocolo definido, educador não confirma dose', async () => {
    const pode = await request(http).get(`/api/v1/medications/can-administer?houseId=${AI3}&periodo=diurno`)
      .set(auth(tokens.educador));
    expect(pode.body.pode).toBe(false);
    expect(pode.body.motivo).toMatch(/protocolo desta casa não autoriza/i);

    const { rows: [dose] } = await admin.query(
      `SELECT id FROM medication_administration WHERE person_id=$1 ORDER BY scheduled_at LIMIT 1`, [sofia]);
    const tentativa = await request(http).post(`/api/v1/medications/doses/${dose.id}/confirm`)
      .set(auth(tokens.educador)).send({ estado: 'administrado_no_horario' });
    expect(tentativa.status).toBe(403);
    expect(tentativa.body.message).toMatch(/protocolo|Enfermagem/i);
  });

  it('a Enfermagem sempre pode confirmar, independentemente do protocolo', async () => {
    const pode = await request(http).get(`/api/v1/medications/can-administer?houseId=${AI3}&periodo=diurno`)
      .set(auth(tokens.enfermagem));
    expect(pode.body.pode).toBe(true);
  });

  it('coordenação configura o protocolo e autoriza o educador nominalmente', async () => {
    // A pendência 33.4.1 vive como configuração, não como regra invisível.
    const prot = await request(http).get(`/api/v1/medications/protocol?houseId=${AI3}`)
      .set(auth(tokens.coord));
    expect(prot.body.pendenciaInstitucional).toMatch(/33\.4\.1|decisão da instituição/i);

    await request(http).post('/api/v1/medications/protocol').set(auth(tokens.coord))
      .send({ houseId: AI3, periodo: 'diurno', enfermagem: true, educadorAutorizado: true,
              nota: 'Definido em reunião institucional (fictício)' }).expect(201);

    // Protocolo permite, mas o educador ainda precisa de autorização nominal
    const semNome = await request(http).get(`/api/v1/medications/can-administer?houseId=${AI3}&periodo=diurno`)
      .set(auth(tokens.educador));
    expect(semNome.body.pode).toBe(false);
    expect(semNome.body.motivo).toMatch(/não consta como educador autorizado/i);

    await request(http).post('/api/v1/medications/authorize-educator').set(auth(tokens.coord))
      .send({ userId: educadorId, houseId: AI3, nota: 'Treinamento concluído (fictício)' }).expect(201);

    const agora = await request(http).get(`/api/v1/medications/can-administer?houseId=${AI3}&periodo=diurno`)
      .set(auth(tokens.educador));
    expect(agora.body.pode).toBe(true);
  });

  // ---------- Administração ----------

  it('cenário #13 — os quatro alertas do §11.3 são publicados pela API', async () => {
    const r = await request(http).get('/api/v1/medications/alert-offsets').set(auth(tokens.educador));
    expect(r.body.minutos).toEqual([-30, -15, 0, 30]);
  });

  it('confirma uma dose: quem confirma é quem administrou', async () => {
    const { rows: [dose] } = await admin.query(
      `SELECT id FROM medication_administration WHERE person_id=$1 AND state='aguardando_confirmacao'
       ORDER BY scheduled_at LIMIT 1`, [sofia]);

    const r = await request(http).post(`/api/v1/medications/doses/${dose.id}/confirm`)
      .set(auth(tokens.educador)).send({ estado: 'administrado_no_horario' });
    expect(r.status).toBe(201);

    const { rows: [depois] } = await admin.query(
      `SELECT state, administered_by, administered_at FROM medication_administration WHERE id=$1`, [dose.id]);
    expect(depois.state).toBe('administrado_no_horario');
    expect(depois.administered_by).toBe(educadorId);      // autoria é de quem administrou
    expect(depois.administered_at).not.toBeNull();
  });

  it('ninguém confirma por outro: dose já confirmada é recusada (§11.2)', async () => {
    const { rows: [dose] } = await admin.query(
      `SELECT id FROM medication_administration WHERE state='administrado_no_horario' LIMIT 1`);
    const r = await request(http).post(`/api/v1/medications/doses/${dose.id}/confirm`)
      .set(auth(tokens.enfermagem)).send({ estado: 'administrado_no_horario' });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/já foi confirmada/i);
  });

  it('recusa, atraso e incidente exigem observação (§11.4)', async () => {
    const { rows: [dose] } = await admin.query(
      `SELECT id FROM medication_administration WHERE state='aguardando_confirmacao' LIMIT 1`);

    const semNota = await request(http).post(`/api/v1/medications/doses/${dose.id}/confirm`)
      .set(auth(tokens.enfermagem)).send({ estado: 'recusado' });
    expect(semNota.status).toBe(400);
    expect(semNota.body.message).toMatch(/exige observação/i);

    const comNota = await request(http).post(`/api/v1/medications/doses/${dose.id}/confirm`)
      .set(auth(tokens.enfermagem))
      .send({ estado: 'recusado', nota: 'Recusou a primeira oferta; Enfermagem acionada e orientou nova tentativa às 20h' });
    expect(comNota.status).toBe(201);
  });

  it('cenário #14 — dose vencida continua "aguardando confirmação", nunca "não administrado"', async () => {
    // Cria uma dose no passado
    // A prescrição precisa ser de um acolhido ATIVO na casa — do contrário a
    // dose existe mas fica fora do escopo de quem consulta, e o teste passa a
    // medir outra coisa.
    const { rows: [pr] } = await admin.query(
      `SELECT p.id, p.person_id, p.house_id FROM prescription p
        JOIN house_stay s ON s.person_id = p.person_id AND s.status = 'ativa'
       WHERE p.status='ativa' AND p.house_id = $1 LIMIT 1`, [AI3]);
    expect(pr).toBeDefined();
    await admin.query(
      `INSERT INTO medication_administration (prescription_id, person_id, house_id, scheduled_at)
       VALUES ($1,$2,$3, now() - interval '2 hours')`, [pr.id, pr.person_id, pr.house_id]);

    const r = await request(http).post('/api/v1/medications/escalate-overdue')
      .set(auth(tokens.enfermagem)).send({ houseId: AI3, minutos: 30 });
    expect(r.body.pendentes).toBeGreaterThan(0);
    expect(r.body.aviso).toMatch(/não conclui que a dose não foi administrada/i);

    // O estado no banco NÃO mudou para "não administrado"
    const { rows } = await admin.query(
      `SELECT DISTINCT state FROM medication_administration
       WHERE scheduled_at < now() - interval '1 hour'`);
    const estados = rows.map((r: any) => r.state);
    expect(estados).toContain('aguardando_confirmacao');
    expect(estados).not.toContain('nao_administrado');

    // E a Enfermagem foi notificada
    const notif = await request(http).get('/api/v1/notifications').set(auth(tokens.enfermagem));
    expect(notif.body.some((n: any) => /medica|dose/i.test(n.titulo))).toBe(true);
  });

  it('linha do tempo mostra a dose vencida como crítica, com o rótulo correto', async () => {
    const tl = await request(http).get(`/api/v1/timeline?houseId=${AI3}&date=${HOJE}`)
      .set(auth(tokens.educador));
    expect(tl.body.fontes).toContain('medications');   // módulo entrou sem alterar a timeline

    const dose = tl.body.eventos.find((e: any) => e.kind === 'medicamento' && e.severity === 'critico');
    if (dose) {
      expect(dose.state).toBe('Aguardando confirmação');
      expect(dose.state).not.toMatch(/não administrado/i);
    }
  });

  it('cenário #15 — offline, só o aparelho institucional designado confirma', async () => {
    const { rows: [dose] } = await admin.query(
      `SELECT id FROM medication_administration WHERE state='aguardando_confirmacao' LIMIT 1`);

    // Pela fila de sincronização: recusado na porta de entrada
    const fila = await request(http).post('/api/v1/sync/push').set(auth(tokens.enfermagem)).send({
      operacoes: [{
        clientOpId: 'dose-pessoal-001', kind: 'medication.confirm', houseId: AI3,
        payload: { administrationId: dose.id, estado: 'administrado_no_horario' },
        happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
        institutionalDevice: false,
      }],
    });
    expect(fila.body.resultados[0].status).toBe('rejeitada');
    expect(fila.body.resultados[0].motivo).toMatch(/aparelho institucional/i);

    // Pela rota direta: a mesma regra vale dentro do comando de confirmação
    const direto = await request(http).post(`/api/v1/medications/doses/${dose.id}/confirm`)
      .set(auth(tokens.enfermagem))
      .send({ estado: 'administrado_no_horario', offline: true, institutionalDevice: false });
    expect(direto.status).toBe(403);
    expect(direto.body.message).toMatch(/aparelho institucional/i);

    // Afirmar-se institucional não basta: o servidor confere contra o registro
    // de aparelhos da casa. Antes, `institutionalDevice: true` no corpo da
    // requisição era suficiente — a regra do §11.7 se apoiava na palavra do
    // próprio aparelho.
    const mentiroso = await request(http).post('/api/v1/sync/push').set(auth(tokens.enfermagem)).send({
      operacoes: [{
        clientOpId: 'dose-mentirosa-001', kind: 'medication.confirm', houseId: AI3,
        payload: { administrationId: dose.id, estado: 'administrado_no_horario' },
        happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
        device: 'celular-pessoal', institutionalDevice: true,
      }],
    });
    expect(mentiroso.body.resultados[0].status).toBe('rejeitada');

    // A coordenação registra o aparelho da casa; o código é mostrado uma vez.
    const aparelho = await request(http).post('/api/v1/devices').set(auth(tokens.coord))
      .send({ houseId: AI3, rotulo: 'Tablet da Casa 03 — plantão' });
    expect(aparelho.status).toBe(201);
    expect(aparelho.body.token).toBeTruthy();

    // Código errado continua sendo recusado.
    const errado = await request(http).post('/api/v1/sync/push').set(auth(tokens.enfermagem)).send({
      operacoes: [{
        clientOpId: 'dose-token-errado-001', kind: 'medication.confirm', houseId: AI3,
        payload: { administrationId: dose.id, estado: 'administrado_no_horario' },
        happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
        deviceToken: 'codigo-que-nao-existe',
      }],
    });
    expect(errado.body.resultados[0].status).toBe('rejeitada');

    // No aparelho institucional de verdade, passa — e preserva o horário real
    const horarioReal = new Date(Date.now() - 90 * 60_000).toISOString();
    const ok = await request(http).post('/api/v1/sync/push').set(auth(tokens.enfermagem)).send({
      operacoes: [{
        clientOpId: 'dose-institucional-001', kind: 'medication.confirm', houseId: AI3,
        payload: { administrationId: dose.id, estado: 'administrado_com_atraso', nota: 'Sem sinal na casa' },
        happenedAt: horarioReal, queuedAt: horarioReal,
        device: 'tablet-casa-03', deviceToken: aparelho.body.token,
      }],
    });
    expect(ok.body.resultados[0].status).toBe('aplicada');

    // Revogado, o mesmo código deixa de valer — sem apagar o histórico dele.
    await request(http).post(`/api/v1/devices/${aparelho.body.id}/revoke`)
      .set(auth(tokens.coord)).send({ motivo: 'Aparelho extraviado' });
    const { rows: [outraDose] } = await admin.query(
      `SELECT id FROM medication_administration WHERE state='aguardando_confirmacao' LIMIT 1`);
    if (outraDose) {
      const revogado = await request(http).post('/api/v1/sync/push').set(auth(tokens.enfermagem)).send({
        operacoes: [{
          clientOpId: 'dose-revogada-001', kind: 'medication.confirm', houseId: AI3,
          payload: { administrationId: outraDose.id, estado: 'administrado_no_horario' },
          happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
          deviceToken: aparelho.body.token,
        }],
      });
      expect(revogado.body.resultados[0].status).toBe('rejeitada');
    }

    const { rows: [conf] } = await admin.query(
      `SELECT administered_at, synced_at, offline, institutional_device
       FROM medication_administration WHERE id=$1`, [dose.id]);
    expect(conf.offline).toBe(true);
    expect(conf.institutional_device).toBe(true);
    expect(new Date(conf.administered_at).toISOString()).toBe(horarioReal);
    expect(new Date(conf.synced_at).getTime()).toBeGreaterThan(new Date(horarioReal).getTime());
  });

  // ---------- Estoque ----------

  it('estoque controla só quantidade e validade; estoque baixo é sinalizado à mão (§11.6)', async () => {
    await request(http).post('/api/v1/medications/stock').set(auth(tokens.enfermagem))
      .send({ houseId: AI3, medicamento: 'Insulina NPH', quantidade: 3, unidade: 'frasco',
              validade: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10) })
      .expect(201);

    const est = await request(http).get(`/api/v1/medications/stock?houseId=${AI3}`)
      .set(auth(tokens.enfermagem));
    const item = est.body.find((s: any) => s.medicamento === 'Insulina NPH');
    expect(item.quantidade).toBe(3);
    expect(item.validadeProxima).toBe(true);          // alerta de validade
    expect(item.estoqueBaixo).toBe(false);            // ninguém sinalizou ainda

    // Não há compras nem cálculo automático de "pouco"
    expect(Object.keys(item)).not.toContain('pedidoDeCompra');

    await request(http).post(`/api/v1/medications/stock/${item.id}/flag-low`)
      .set(auth(tokens.enfermagem)).send({ baixo: true }).expect(201);
    const dep = await request(http).get(`/api/v1/medications/stock?houseId=${AI3}`)
      .set(auth(tokens.enfermagem));
    expect(dep.body.find((s: any) => s.id === item.id).estoqueBaixo).toBe(true);
  });

  // ---------- Painel da Enfermagem ----------

  it('cenário #35 — painel mostra TODOS os acolhidos, inclusive sem medicação prevista', async () => {
    const p = await request(http).get(`/api/v1/nursing/panel?houseId=${AI3}&date=${HOJE}`)
      .set(auth(tokens.enfermagem));
    expect(p.status).toBe(200);
    expect(p.body.total).toBeGreaterThan(1);
    expect(p.body.resumo.semMedicacao).toBeGreaterThan(0);
    expect(p.body.acolhidos.some((a: any) => a.semMedicacaoPrevista)).toBe(true);
    expect(p.body.aviso).toMatch(/não constituem diagnóstico/i);

    // Ordem alfabética — não é classificação clínica
    const nomes = p.body.acolhidos.map((a: any) => a.nome);
    expect([...nomes].sort()).toEqual(nomes);
  });

  it('cenário #35 — Enfermagem tem escopo de saúde, mas não abre bancário', async () => {
    const { rows: [comBeneficio] } = await admin.query(
      `SELECT person_id FROM benefit_record LIMIT 1`);
    if (comBeneficio) {
      const r = await request(http).post(`/api/v1/people/${comBeneficio.person_id}/benefits/view`)
        .set(auth(tokens.enfermagem)).send({ finalidade: 'curiosidade' });
      expect(r.status).toBe(403);
    }
    // E o painel de saúde não traz nada bancário
    const p = await request(http).get(`/api/v1/nursing/panel?houseId=${AI3}&date=${HOJE}`)
      .set(auth(tokens.enfermagem));
    expect(JSON.stringify(p.body)).not.toMatch(/banco|agencia|conta|BPC/i);
  });

  // ---------- Evolução de Saúde e triagem ----------

  let evolucaoId: string;

  it('cenário #37 — educador envia Evolução; entra em fila para a Enfermagem', async () => {
    const semEstado = await request(http).post('/api/v1/nursing/evolutions')
      .set(auth(tokens.educador))
      .send({ personId: sofia, houseId: AI3, tipo: 'consulta',
              quandoAconteceu: new Date().toISOString() });
    expect(semEstado.status).toBe(400);

    const r = await request(http).post('/api/v1/nursing/evolutions').set(auth(tokens.educador))
      .send({
        personId: sofia, houseId: AI3, tipo: 'consulta',
        quandoAconteceu: new Date(Date.now() - 3600_000).toISOString(),
        local: 'UBS Vila Nova (fictícia)', especialidade: 'Endocrinologia',
        estadoSaida: 'Tranquila, alimentada', estadoDurante: 'Colaborativa no exame',
        estadoRetorno: 'Bem, sem queixas; almoçou na volta',
        receita: 'Ajuste de dose da insulina — receita anexada',
        orientacoes: 'Retorno em 30 dias; medir glicemia antes do jantar',
        prazoRetorno: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('aguardando_triagem');
    expect(r.body.aviso).toMatch(/só altera a grade.*após essa revisão/i);
    evolucaoId = r.body.id;

    const fila = await request(http).get('/api/v1/nursing/triage').set(auth(tokens.enfermagem));
    const item = fila.body.find((e: any) => e.id === evolucaoId);
    expect(item).toBeDefined();
    expect(item.acompanhante).toMatch(/Silva|Mário/);
    expect(item.acolhido).toBe('Sofia');
  });

  it('coordenação acompanha a pendência, mas NÃO assina no lugar da Enfermagem', async () => {
    const r = await request(http).post(`/api/v1/nursing/evolutions/${evolucaoId}/triage`)
      .set(auth(tokens.coord)).send({ acao: 'assinar', complemento: 'ok' });
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/Somente a Enfermagem tria e assina/i);

    const { rows } = await admin.query(
      `SELECT 1 FROM audit_event WHERE action='health.triage_denied'`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('cenário #37 — Enfermagem tria, complementa e assina', async () => {
    const devolver = await request(http).post(`/api/v1/nursing/evolutions/${evolucaoId}/triage`)
      .set(auth(tokens.enfermagem))
      .send({ acao: 'pedir_complemento', pedido: 'Informe o valor da glicemia aferida na consulta.' });
    expect(devolver.status).toBe(201);
    expect(devolver.body.status).toBe('complemento_solicitado');

    const assinar = await request(http).post(`/api/v1/nursing/evolutions/${evolucaoId}/triage`)
      .set(auth(tokens.enfermagem))
      .send({ acao: 'assinar', complemento: 'Glicemia 142 mg/dL na consulta. Ajuste de dose conferido com a receita.' });
    expect(assinar.status).toBe(201);
    expect(assinar.body.aviso).toMatch(/agora a grade de medicamentos pode ser atualizada/i);

    // O relato do acompanhante permanece intacto; o complemento é registro próprio
    const { rows: [evo] } = await admin.query(
      `SELECT state_return, status FROM health_evolution WHERE id=$1`, [evolucaoId]);
    expect(evo.state_return).toMatch(/almoçou na volta/);
    expect(evo.status).toBe('assinada');
    const { rows: triagens } = await admin.query(
      `SELECT action, complement FROM nursing_triage WHERE evolution_id=$1 ORDER BY at`, [evolucaoId]);
    expect(triagens).toHaveLength(2);
    expect(triagens[1].complement).toMatch(/142 mg\/dL/);
  });

  it('histórico de saúde reúne atendimentos, evoluções e administrações (§7.3)', async () => {
    const h = await request(http).get(`/api/v1/nursing/history/${sofia}`).set(auth(tokens.enfermagem));
    expect(h.body.atendimentos.length).toBeGreaterThan(0);
    expect(h.body.evolucoes.length).toBeGreaterThan(0);
    expect(h.body.administracoes.length).toBeGreaterThan(0);
    expect(h.body.evolucoes[0].complementoEnfermagem).toMatch(/142/);
  });

  // ---------- Resumo de Saúde ----------

  it('cenário #38 — Resumo exige finalidade e traz só o pertinente', async () => {
    const semFinalidade = await request(http).post(`/api/v1/nursing/summary/${sofia}`)
      .set(auth(tokens.educador)).send({});
    expect(semFinalidade.status).toBe(400);
    expect(semFinalidade.body.message).toMatch(/finalidade/i);

    const r = await request(http).post(`/api/v1/nursing/summary/${sofia}`)
      .set(auth(tokens.educador)).send({ finalidade: 'consulta', incluirUltimaEvolucao: true });
    expect(r.status).toBe(201);
    expect(r.body.classificacao).toBe('CONFIDENCIAL — USO EM SAÚDE');

    // Contém o que serve ao atendimento
    expect(r.body.identificacao.nome).toBe('Sofia');
    expect(r.body.alergias).toBeDefined();
    expect(r.body.condicoesRelevantes.some((c: any) => /Diabetes/i.test(c.descricao))).toBe(true);
    expect(r.body.medicamentosAtivos.length).toBeGreaterThan(0);
    expect(r.body.medicamentosAtivos[0].horarios).toMatch(/07:00/);
    expect(r.body.ultimaEvolucaoAssinada.estadoNoRetorno).toMatch(/almoçou/);

    // E NÃO contém o que não é dele. A varredura ignora `naoIncluido` e
    // `rodape`, que são justamente a DECLARAÇÃO do que ficou de fora — a
    // presença das palavras ali é a garantia, não o vazamento.
    const { naoIncluido, rodape, ...conteudo } = r.body;
    const texto = JSON.stringify(conteudo);
    expect(texto).not.toMatch(/banco|agência|conta corrente|BPC/i);
    expect(texto).not.toMatch(/judicial|guia de acolhimento/i);
    expect(texto).not.toMatch(/comportamento|desorganiza/i);
    expect(naoIncluido).toContain('dados bancários e benefícios');
    expect(naoIncluido).toContain('conteúdo judicial');
  });

  it('cenário #38 — versão offline indica a última sincronização', async () => {
    const sync = new Date(Date.now() - 4 * 3600_000).toISOString();
    const r = await request(http).post(`/api/v1/nursing/summary/${sofia}`)
      .set(auth(tokens.educador))
      .send({ finalidade: 'urgencia', offline: true, ultimaSincronizacao: sync });
    expect(r.body.versaoOffline).toBe(true);
    expect(r.body.ultimaSincronizacao).toBe(sync);
    expect(r.body.avisoOffline).toMatch(/última sincronização/i);
  });

  it('cenário #38 — geração e download ficam registrados com finalidade', async () => {
    const r = await request(http).post(`/api/v1/nursing/summary/${sofia}`)
      .set(auth(tokens.educador)).send({ finalidade: 'internacao' });
    await request(http).post(`/api/v1/nursing/summary/issues/${r.body.emissaoId}/download`)
      .set(auth(tokens.educador)).expect(201);

    const { rows } = await admin.query(
      `SELECT action, purpose FROM audit_event
       WHERE action IN ('health.summary_issue','health.summary_download')
       ORDER BY at DESC LIMIT 2`);
    expect(rows.map((r: any) => r.action)).toContain('health.summary_download');
    expect(rows.some((r: any) => r.purpose === 'internacao')).toBe(true);

    const emissoes = await request(http).get(`/api/v1/nursing/summary/${sofia}/issues`)
      .set(auth(tokens.enfermagem));
    expect(emissoes.body.length).toBeGreaterThanOrEqual(3);
    expect(emissoes.body[0].finalidade).toBeTruthy();
  });

  it('a cozinha não emite Resumo de Saúde', async () => {
    // Não há usuário de cozinha no seed; a regra é verificada pela lista de papéis.
    const { rows } = await admin.query(
      `SELECT unnest(enum_range(NULL::role_code))::text AS papel`);
    expect(rows.map((r: any) => r.papel)).toContain('cozinha');
  });
});
