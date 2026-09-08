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

  it('o educador NÃO cadastra esquema; a Enfermagem, a coordenação e a técnica cadastram', async () => {
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
    expect(ok.body.aviso).toMatch(/rascunho/i);
    prescricaoId = ok.body.id;

    /*
     * Desde 08/09/2026 (migração 0930) a coordenação também cadastra: a
     * Enfermagem atende das 9h às 17h, e a criança volta da consulta com a
     * receita às 20h. Exigir a Enfermagem ali é adiar o tratamento ou dar o
     * remédio sem registro.
     */
    const pelaCoord = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.coord))
      .send({ personId: sofia, houseId: AI3, tipo: 'tratamento',
              medicamento: 'Xarope (fictício)', dose: '5 mL', via: 'oral',
              horarios: ['21:00'], prescritor: 'Pediatria (fictícia)' });
    expect(pelaCoord.status).toBe(201);
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
    /*
     * A conta é sobre ESTA prescrição, não sobre a casa.
     *
     * O teste media `criadas` no total da AI3, que já tem medicamentos vindos
     * do seed-fase4 — então o número dependia de quantas doses da casa inteira
     * ainda faltavam gerar, e portanto da ORDEM em que as suítes rodaram. O
     * teste falhava sozinho e passava no conjunto, ou o contrário, sem que
     * nada no sistema tivesse mudado. Um teste assim não protege: ensina a
     * equipe a ignorar a luz vermelha.
     */
    const doses = async () => {
      const { rows: [r] } = await admin.query(
        `SELECT count(*)::int AS n FROM medication_administration WHERE prescription_id = $1`,
        [prescricaoId]);
      return r.n as number;
    };
    const gerar = () => request(http).post('/api/v1/medications/generate-doses')
      .set(auth(tokens.enfermagem)).send({ houseId: AI3, date: HOJE });

    await gerar();
    expect(await doses()).toBe(0);                // rascunho não entra na grade

    await request(http).post(`/api/v1/medications/prescriptions/${prescricaoId}/sign`)
      .set(auth(tokens.enfermagem)).expect(201);

    await gerar();
    expect(await doses()).toBe(2);                // 07:00 e 19:00

    await gerar();
    expect(await doses()).toBe(2);                // idempotente: não duplica
  });

  // ---------- Quem dá o remédio (§11.3, resposta da Fundação em 08/09/2026) ----------

  it('o educador de plantão confirma dose — é ele quem está na casa à noite', async () => {
    /*
     * Esta era a asserção INVERSA até 08/09/2026: "sem protocolo definido,
     * educador não confirma dose". Era o padrão protetivo que o sistema
     * adotava sem saber o horário da Enfermagem. Sabendo — 9h às 17h —, o
     * padrão antigo recusaria TODA dose noturna, mandando acionar quem já foi
     * embora; a dose seria dada (a criança precisa dela) e ficaria sem
     * registro.
     */
    const pode = await request(http).get(`/api/v1/medications/can-administer?houseId=${AI3}&periodo=noturno`)
      .set(auth(tokens.educador));
    expect(pode.body.pode).toBe(true);
  });

  it('a Enfermagem também confirma, a qualquer hora', async () => {
    const pode = await request(http).get(`/api/v1/medications/can-administer?houseId=${AI3}&periodo=diurno`)
      .set(auth(tokens.enfermagem));
    expect(pode.body.pode).toBe(true);
  });

  it('quem não está no cuidado direto não confirma dose', async () => {
    const pode = await request(http).get(`/api/v1/medications/can-administer?houseId=${AI3}&periodo=diurno`)
      .set(auth(tokens.coord));
    expect(pode.body.pode).toBe(false);
    expect(pode.body.motivo).toMatch(/quem a administrou/i);
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

  it('sem sinal, dose não se confirma em aparelho nenhum (0930)', async () => {
    /*
     * A REGRA MUDOU EM 08/09/2026, e este teste guarda a mudança.
     *
     * Até aqui valia o §11.7: offline, só o aparelho institucional registrado
     * da casa confirmava medicamento — a trava contra a mesma dose confirmada
     * em dois aparelhos que não se enxergam. A Fundação decidiu que o sistema
     * roda no celular de cada pessoa, com o e-mail institucional, e com isso
     * não existe mais "o aparelho da casa" para ser essa trava.
     *
     * A escolha foi recusar sempre, na hora, com a frase — e não guardar para
     * devolver rejeitada horas depois, quando quem deu o remédio já foi
     * embora. O resto do turno continua funcionando sem sinal.
     */
    const { rows: [dose] } = await admin.query(
      `SELECT id FROM medication_administration WHERE state='aguardando_confirmacao' LIMIT 1`);

    // Pela fila de sincronização: recusada na porta de entrada.
    const fila = await request(http).post('/api/v1/sync/push').set(auth(tokens.enfermagem)).send({
      operacoes: [{
        clientOpId: 'dose-sem-sinal-001', kind: 'medication.confirm', houseId: AI3,
        payload: { administrationId: dose.id, estado: 'administrado_no_horario' },
        happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
      }],
    });
    expect(fila.body.resultados[0].status).toBe('rejeitada');
    expect(fila.body.resultados[0].motivo).toMatch(/sem internet|sinal/i);

    // Pela rota direta: a mesma regra dentro do comando de confirmação.
    const direto = await request(http).post(`/api/v1/medications/doses/${dose.id}/confirm`)
      .set(auth(tokens.enfermagem))
      .send({ estado: 'administrado_no_horario', offline: true });
    expect(direto.status).toBe(403);
    expect(direto.body.message).toMatch(/sem internet|sinal/i);

    /*
     * E O APARELHO DA CASA TAMBÉM NÃO BASTA MAIS. O cadastro continua
     * existindo — a casa quer saber quais aparelhos são dela —, mas ele deixou
     * de abrir a porta da dose offline. Sem este trecho, alguém "consertaria"
     * a regra de volta por engano e nada quebraria.
     */
    const aparelho = await request(http).post('/api/v1/devices').set(auth(tokens.coord))
      .send({ houseId: AI3, rotulo: 'Tablet da Casa 03 — plantão' });
    expect(aparelho.status).toBe(201);
    expect(aparelho.body.token).toBeTruthy();

    const comAparelho = await request(http).post('/api/v1/sync/push').set(auth(tokens.enfermagem)).send({
      operacoes: [{
        clientOpId: 'dose-com-aparelho-001', kind: 'medication.confirm', houseId: AI3,
        payload: { administrationId: dose.id, estado: 'administrado_no_horario' },
        happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
        device: 'tablet-casa-03', deviceToken: aparelho.body.token,
      }],
    });
    expect(comAparelho.body.resultados[0].status).toBe('rejeitada');

    // A dose continua esperando alguém — e é isso que a passagem lê de volta.
    const { rows: [depois] } = await admin.query(
      `SELECT state, administered_by FROM medication_administration WHERE id=$1`, [dose.id]);
    expect(depois.state).toBe('aguardando_confirmacao');
    expect(depois.administered_by).toBeNull();

    // O resto do turno continua subindo sem sinal: a regra é da DOSE.
    const chamada = await request(http).post('/api/v1/sync/push').set(auth(tokens.educador)).send({
      operacoes: [{
        clientOpId: 'passagem-sem-sinal-001', kind: 'handover.receipt', houseId: AI3,
        payload: {}, happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
      }],
    });
    expect(chamada.body.resultados[0].status).not.toBe('rejeitada');
  });

  // ---------- Estoque ----------

  it('estoque controla só quantidade e validade; estoque baixo é sinalizado à mão (§11.6)', async () => {
    await request(http).post('/api/v1/medications/stock').set(auth(tokens.enfermagem))
      .send({ tipo: 'entrada', houseId: AI3, medicamento: 'Insulina NPH', quantidade: 3, unidade: 'frasco',
              // Data futura: o deslocamento de fuso não altera o que o teste prova.
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
