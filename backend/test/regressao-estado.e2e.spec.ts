/**
 * REGRESSÃO — estado, concorrência e silêncio.
 *
 * Segunda auditoria do sistema, sobre máquinas de estado, corrida entre duas
 * pessoas e fuso horário. Vinte e um achados; aqui estão travados os que
 * causavam dano diário sem que ninguém percebesse pela tela.
 *
 * O fio comum é o mesmo da primeira auditoria: o defeito não dava erro.
 * O alerta de medicação parava de sair, a dose era sobrescrita, o registro
 * offline sumia do aparelho, a rotina noturna duplicava — e a tela continuava
 * mostrando tudo normal.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { dataDoPlantao } from '../src/kernel/common/tempo';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

describe('Regressão — estado, concorrência e silêncio', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, AI4: string, crianca: string;

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const reauth = (t: string) =>
    request(http).post('/api/v1/auth/reauth').set(auth(t)).send({ password: SENHA });

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
      educador2: 'educador2.ai3@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord3: 'coord.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));

    // Fixture próprio: esta suíte mexe em estado e não pode contaminar as outras.
    const res = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Marcos Teste Estado (fictício)', socialName: 'MarcosE',
              birthDate: '2013-03-15',
              provisionalReason: 'Ingresso de teste automatizado — dados fictícios' });
    expect(res.status).toBe(201);
    crianca = res.body.personId;
  });

  afterAll(async () => {
    await request(http).post(`/api/v1/people/${crianca}/discharge`)
      .set(auth(tokens.tecnica)).send({ motivo: 'Encerramento de fixture de teste' });
    await app.close(); await admin.end();
  });

  // ==================== Medicamentos ====================

  it('o alerta de dose vencida não morre na primeira vez — cada dose avisa a sua', async () => {
    const presc = async (medicamento: string, hora: string) => {
      const p = await request(http).post('/api/v1/medications/prescriptions')
        .set(auth(tokens.enfermagem))
        .send({ personId: crianca, houseId: AI3, tipo: 'uso_continuo',
                medicamento, dose: '1 comprimido', via: 'oral',
                horarios: [hora], prescritor: 'Clínica (fictícia)' });
      expect(p.status).toBe(201);
      await request(http).post(`/api/v1/medications/prescriptions/${p.body.id}/sign`)
        .set(auth(tokens.enfermagem)).send({});
      return p.body.id as string;
    };
    await presc('Medicamento Regressão A', '06:00');
    await presc('Medicamento Regressão B', '06:30');

    const g = await request(http).post('/api/v1/medications/generate-doses')
      .set(auth(tokens.enfermagem)).send({ houseId: AI3, date: HOJE });
    expect(g.status).toBe(201);

    const um = await request(http).post('/api/v1/medications/escalate-overdue')
      .set(auth(tokens.enfermagem)).send({ houseId: AI3, minutos: 1 });
    expect(um.status).toBe(201);
    expect(um.body.pendentes).toBeGreaterThanOrEqual(2);

    // ANTES: `entityId` era a CASA. A primeira vez gastava a chave de
    // idempotência e, do segundo caso em diante — em qualquer dia, para
    // qualquer criança —, o aviso era engolido. Para sempre, em silêncio.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM escalation
        WHERE entity='medication_dose' AND level='enfermagem'`);
    expect(rows[0].n).toBeGreaterThanOrEqual(2);

    // Reprocessar a fila continua sendo idempotente — é o que ela protege.
    await request(http).post('/api/v1/medications/escalate-overdue')
      .set(auth(tokens.enfermagem)).send({ houseId: AI3, minutos: 1 });
    const { rows: depois } = await admin.query(
      `SELECT count(*)::int AS n FROM escalation
        WHERE entity='medication_dose' AND level='enfermagem'`);
    expect(depois[0].n).toBe(rows[0].n);
  });

  it('ninguém confirma a dose por cima de outro, e o estoque cai uma vez só', async () => {
    const { rows: [dose] } = await admin.query(
      `SELECT a.id FROM medication_administration a
        WHERE a.person_id = $1 AND a.administered_by IS NULL LIMIT 1`, [crianca]);
    expect(dose).toBeDefined();

    const { rows: [med] } = await admin.query(
      `SELECT pr.medication FROM medication_administration a
        JOIN prescription pr ON pr.id = a.prescription_id WHERE a.id = $1`, [dose.id]);

    // Dois estoques do mesmo medicamento: o comum da casa e o nominal.
    await admin.query(
      `INSERT INTO medication_stock (house_id, person_id, medication, quantity, unit)
       VALUES ($1, NULL, $2, 30, 'comprimido'), ($1, $3, $2, 20, 'comprimido')`,
      [AI3, med.medication, crianca]);

    // O protocolo protetivo (pendência 33.4.1) não autoriza educador por
    // padrão; quem administra aqui é a Enfermagem. O que se prova é que o
    // SEGUNDO registro não passa por cima do primeiro.
    const primeira = await request(http).post(`/api/v1/medications/doses/${dose.id}/confirm`)
      .set(auth(tokens.enfermagem)).send({ estado: 'administrado_no_horario' });
    expect(primeira.status).toBe(201);

    const segunda = await request(http).post(`/api/v1/medications/doses/${dose.id}/confirm`)
      .set(auth(tokens.enfermagem)).send({ estado: 'recusado', nota: 'Recusou o comprimido.' });
    expect(segunda.status).toBe(409);

    // O ato do primeiro continua lá, com o nome dele.
    const { rows: [gravada] } = await admin.query(
      `SELECT state, administered_by FROM medication_administration WHERE id = $1`, [dose.id]);
    expect(gravada.state).toBe('administrado_no_horario');

    // Uma dose, UM estoque. Antes o UPDATE atingia as duas linhas e o estoque
    // comum da casa caía sem ninguém ter tocado nele.
    const { rows: estoques } = await admin.query(
      `SELECT person_id, quantity FROM medication_stock
        WHERE house_id = $1 AND medication = $2 ORDER BY person_id NULLS FIRST`,
      [AI3, med.medication]);
    const comum = estoques.find((e: any) => e.person_id === null);
    const nominal = estoques.find((e: any) => e.person_id === crianca);
    expect(Number(comum.quantity)).toBe(30);    // intacto
    expect(Number(nominal.quantity)).toBe(19);  // o nominal tem precedência
  });

  it('a prescrição já encerrada não aparece como medicamento em uso no Resumo de Saúde', async () => {
    const p = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: crianca, houseId: AI3, tipo: 'tratamento',
              medicamento: 'Antibiótico Regressão', dose: '5 ml', via: 'oral',
              horarios: ['08:00'], prescritor: 'Pediatria (fictícia)',
              inicio: '2026-01-05', fim: '2026-01-12' });
    expect(p.status).toBe(201);
    await request(http).post(`/api/v1/medications/prescriptions/${p.body.id}/sign`)
      .set(auth(tokens.enfermagem)).send({});

    const resumo = await request(http).post(`/api/v1/nursing/summary/${crianca}`)
      .set(auth(tokens.enfermagem)).send({ finalidade: 'urgencia' });
    expect(resumo.status).toBe(201);
    // É o único documento que sai da instituição. Um tratamento de janeiro não
    // pode chegar às mãos de um médico em setembro como uso atual.
    expect(JSON.stringify(resumo.body.medicamentosAtivos)).not.toMatch(/Antibiótico Regressão/);
  });

  it('suspender um esquema que não está ativo é recusado, e não vira auditoria falsa', async () => {
    const p = await request(http).post('/api/v1/medications/prescriptions')
      .set(auth(tokens.enfermagem))
      .send({ personId: crianca, houseId: AI3, tipo: 'uso_continuo',
              medicamento: 'Rascunho Regressão', dose: '1', via: 'oral',
              prescritor: 'Clínica (fictícia)' });
    // Rascunho: nunca foi assinado, logo não está ativo.
    const r = await request(http).post(`/api/v1/medications/prescriptions/${p.body.id}/suspend`)
      .set(auth(tokens.enfermagem)).send({ motivo: 'Orientação da pediatria' });
    expect(r.status).toBe(400);
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event
        WHERE action='prescription.suspend' AND entity_id=$1`, [p.body.id]);
    expect(rows[0].n).toBe(0);
  });

  // ==================== Plantão e rotina ====================

  it('a noite pertence ao dia em que começou', () => {
    const vinteDuasHoras = new Date('2026-09-04T01:10:00Z');  // 22h10 de 03/09 em Porto Alegre
    const duasDaManha = new Date('2026-09-04T05:10:00Z');     // 02h10 de 04/09 em Porto Alegre
    const oitoDaManha = new Date('2026-09-04T11:10:00Z');     // 08h10 de 04/09

    expect(dataDoPlantao('noturno', vinteDuasHoras)).toBe('2026-09-03');
    // O ponto do defeito: quem abre depois da meia-noite tem de cair na MESMA
    // noite, senão vira um segundo plantão com sua própria ATA.
    expect(dataDoPlantao('noturno', duasDaManha)).toBe('2026-09-03');
    expect(dataDoPlantao('noturno', oitoDaManha)).toBe('2026-09-04');
    // O diurno é sempre o dia corrente.
    expect(dataDoPlantao('diurno', duasDaManha)).toBe('2026-09-04');
  });

  it('gerar o dia duas vezes não duplica a rotina — inclusive a da madrugada', async () => {
    const um = await request(http).post('/api/v1/activities/generate-day')
      .set(auth(tokens.lider)).send({ houseId: AI3, date: HOJE });
    expect(um.status).toBe(201);

    const antes = await request(http).get('/api/v1/activities')
      .query({ houseId: AI3, date: HOJE }).set(auth(tokens.educador));
    const daRotina = antes.body.filter((a: any) => !a.urgente).length;

    // A tela recarregada no meio do plantão: o cenário que o defeito atingia.
    await request(http).post('/api/v1/activities/generate-day')
      .set(auth(tokens.lider)).send({ houseId: AI3, date: HOJE });
    const depois = await request(http).get('/api/v1/activities')
      .query({ houseId: AI3, date: HOJE }).set(auth(tokens.educador));
    expect(depois.body.filter((a: any) => !a.urgente).length).toBe(daRotina);

    // E o índice único torna a duplicidade impossível, não só improvável.
    const { rows } = await admin.query(
      `SELECT routine_item_id, count(*)::int AS n FROM activity
        WHERE house_id = $1 AND routine_item_id IS NOT NULL
          AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date
        GROUP BY routine_item_id HAVING count(*) > 1`, [AI3, HOJE]);
    expect(rows).toEqual([]);
  });

  it('a atividade já encerrada não é reescrita horas depois', async () => {
    const atv = await request(http).post('/api/v1/activities/urgent')
      .set(auth(tokens.lider))
      .send({ houseId: AI3, title: 'Consulta de rotina', scheduledAt: new Date().toISOString(),
              reason: 'Encaixe da UBS' });
    await request(http).post(`/api/v1/activities/${atv.body.id}/acknowledge`)
      .set(auth(tokens.educador)).send({});
    const ok = await request(http).post(`/api/v1/activities/${atv.body.id}/record`)
      .set(auth(tokens.educador)).send({ estado: 'concluida_no_horario' });
    expect(ok.status).toBe(201);

    // Outro profissional, na tela errada, horas depois.
    const tarde = await request(http).post(`/api/v1/activities/${atv.body.id}/record`)
      .set(auth(tokens.educador2))
      .send({ estado: 'nao_realizada_transporte', nota: 'Van não apareceu.' });
    expect(tarde.status).toBe(400);
    expect(tarde.body.message).toMatch(/adendo/i);

    const { rows } = await admin.query(`SELECT state FROM activity WHERE id=$1`, [atv.body.id]);
    expect(rows[0].state).toBe('concluida_no_horario');
  });

  // ==================== Chamada coletiva ====================

  it('a chamada dos 20 não fecha com 21 na casa: quem chega no meio é conferido', async () => {
    const chamada = await request(http).post('/api/v1/checks').set(auth(tokens.educador))
      .send({ houseId: AI3, kind: 'chamada_final', titulo: 'Chamada final (regressão)' });
    expect(chamada.status).toBe(201);
    const esperadosNaAbertura = chamada.body.esperados;

    // Confere todo mundo que existia quando a chamada abriu.
    const antes = await request(http).get(`/api/v1/checks/${chamada.body.id}`).set(auth(tokens.educador));
    for (const linha of antes.body.linhas) {
      await request(http).post(`/api/v1/checks/${chamada.body.id}/mark`)
        .set(auth(tokens.educador))
        .send({ personId: linha.acolhidoId, opcao: 'sem_alteracao' });
    }

    // Às 21h30 chega um acolhido de urgência. A casa tem um a mais.
    const chegou = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Recém-chegado Teste (fictício)', socialName: 'RecemR',
              birthDate: '2014-02-02', provisionalReason: 'Acolhimento de urgência (teste)' });
    const novoAcolhido = chegou.body.personId;

    // ANTES: `conferidos >= expected` dava verdadeiro e a chamada FECHAVA
    // declarando todos conferidos, com uma criança que ninguém olhou.
    const cedo = await request(http).post(`/api/v1/checks/${chamada.body.id}/confirm`)
      .set(auth(tokens.educador)).send({});
    expect(cedo.status).toBe(400);
    expect(cedo.body.message).toMatch(/RecemR/);   // nomeia quem falta

    // A tela também mostra quem falta ANTES de tentar fechar.
    const durante = await request(http).get(`/api/v1/checks/${chamada.body.id}`).set(auth(tokens.educador));
    expect(durante.body.esperados).toBe(esperadosNaAbertura + 1);
    expect(durante.body.quemFalta).toContain('RecemR');

    await request(http).post(`/api/v1/checks/${chamada.body.id}/mark`)
      .set(auth(tokens.educador))
      .send({ personId: novoAcolhido, opcao: 'sem_alteracao' });
    const fecha = await request(http).post(`/api/v1/checks/${chamada.body.id}/confirm`)
      .set(auth(tokens.educador)).send({});
    expect(fecha.status).toBe(201);

    await request(http).post(`/api/v1/people/${novoAcolhido}/discharge`)
      .set(auth(tokens.tecnica)).send({ motivo: 'Encerramento de fixture de teste' });
  });

  it('a chamada não trava quando alguém sai no meio dela', async () => {
    const sai = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Sai No Meio Teste (fictício)', socialName: 'SaiR',
              birthDate: '2011-06-06', provisionalReason: 'Ingresso de teste automatizado' });
    const pessoa = sai.body.personId;

    const chamada = await request(http).post('/api/v1/checks').set(auth(tokens.educador))
      .send({ houseId: AI3, kind: 'alimentacao', titulo: 'Almoço (regressão saída)' });

    const lista = await request(http).get(`/api/v1/checks/${chamada.body.id}`).set(auth(tokens.educador));
    for (const linha of lista.body.linhas) {
      await request(http).post(`/api/v1/checks/${chamada.body.id}/mark`)
        .set(auth(tokens.educador)).send({ personId: linha.acolhidoId, opcao: 'normal' });
    }

    // A criança é transferida com a chamada ainda aberta.
    const req = await request(http).post('/api/v1/transfers').set(auth(tokens.tecnica))
      .send({ personId: pessoa, toHouseId: AI4, reason: 'Vaga aberta na outra unidade' });
    await request(http).post(`/api/v1/transfers/${req.body.id}/accept`)
      .set(auth(tokens.coord4)).send({});

    // ANTES: os resultados existiam mas o cruzamento com permanência ativa
    // devolvia um a menos que o `expected` congelado — a chamada ficava
    // impossível de fechar, para sempre, sem rota de ajuste.
    const fecha = await request(http).post(`/api/v1/checks/${chamada.body.id}/confirm`)
      .set(auth(tokens.educador)).send({});
    expect(fecha.status).toBe(201);

    // E o registro de quem saiu continua lá, marcado como não mais ativo.
    const depois = await request(http).get(`/api/v1/checks/${chamada.body.id}`).set(auth(tokens.educador));
    const linha = depois.body.linhas.find((l: any) => l.acolhidoId === pessoa);
    expect(linha).toBeDefined();
    expect(linha.resultado).toBe('normal');
    expect(linha.ativo).toBe(false);

    await request(http).post(`/api/v1/people/${pessoa}/discharge`)
      .set(auth(tokens.coord4)).send({ motivo: 'Encerramento de fixture de teste' });
  });

  // ==================== Ocorrências ====================

  it('a revisão técnica não fecha o que ninguém encerrou', async () => {
    const oc = await request(http).post('/api/v1/incidents').set(auth(tokens.educador))
      .send({ houseId: AI3, categoria: 'contencao', quando: new Date().toISOString(),
              fato: 'Contenção breve após escalada; equipe seguiu o protocolo institucional.',
              acolhidos: [crianca] });
    expect(oc.status).toBe(201);

    // Ainda ABERTA: a etapa operacional é do líder e vem antes (§13.5, §24).
    const cedo = await request(http).post(`/api/v1/incidents/${oc.body.id}/review`)
      .set(auth(tokens.tecnica)).send({ decisao: 'validar' });
    expect(cedo.status).toBe(400);

    await request(http).post(`/api/v1/incidents/${oc.body.id}/operational-close`)
      .set(auth(tokens.lider)).send({ nota: 'Equipe orientada.' });

    // Contenção sem síntese também não fecha — a categoria mais delicada era
    // justamente a que passava, porque a exigência só cobria saúde e medicamento.
    const semSintese = await request(http).post(`/api/v1/incidents/${oc.body.id}/review`)
      .set(auth(tokens.tecnica)).send({ decisao: 'validar' });
    expect(semSintese.status).toBe(400);

    await request(http).post(`/api/v1/incidents/${oc.body.id}/synthesis`)
      .set(auth(tokens.tecnica))
      .send({ texto: 'Medida revista com a equipe; combinado protocolo de desescalada antes de contato físico.' });
    const fecha = await request(http).post(`/api/v1/incidents/${oc.body.id}/review`)
      .set(auth(tokens.tecnica)).send({ decisao: 'validar' });
    expect(fecha.body.status).toBe('fechada');

    // E fechar de novo não apaga quem validou primeiro.
    const denovo = await request(http).post(`/api/v1/incidents/${oc.body.id}/review`)
      .set(auth(tokens.coord3)).send({ decisao: 'validar' });
    expect(denovo.status).toBe(400);
  });

  it('quem redige a comunicação externa não é quem a aprova', async () => {
    const c = await request(http).post('/api/v1/incidents/communications')
      .set(auth(tokens.tecnica))
      .send({ houseId: AI3, orgao: 'conselho_tutelar',
              destinatarioFuncional: 'Conselheiro tutelar de plantão', canal: 'oficio',
              resumo: 'Comunicação de acompanhamento sobre situação da unidade.' });
    expect(c.status).toBe(201);

    const propria = await request(http).post(`/api/v1/incidents/communications/${c.body.id}/approve`)
      .set(auth(tokens.tecnica)).send({});
    expect(propria.status).toBe(400);

    const outra = await request(http).post(`/api/v1/incidents/communications/${c.body.id}/approve`)
      .set(auth(tokens.coord3)).send({});
    expect(outra.status).toBe(201);
  });

  // ==================== Transferência ====================

  it('não se aceita transferência de quem já saiu da casa', async () => {
    const novo = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Paula Teste Obsoleta (fictícia)', socialName: 'PaulaO',
              birthDate: '2012-08-20', provisionalReason: 'Ingresso de teste automatizado' });
    const pessoa = novo.body.personId;

    const pedido = await request(http).post('/api/v1/transfers').set(auth(tokens.tecnica))
      .send({ personId: pessoa, toHouseId: AI4, reason: 'Aproximação da rede de apoio familiar' });
    expect(pedido.status).toBe(201);

    // A criança é reintegrada à família antes de o destino decidir.
    const saida = await request(http).post(`/api/v1/people/${pessoa}/discharge`)
      .set(auth(tokens.tecnica)).send({ motivo: 'Reintegração familiar' });
    expect(saida.status).toBe(201);

    // A solicitação pendente foi cancelada junto com a saída — não fica
    // esperando alguém "limpar a caixa" dias depois.
    const { rows } = await admin.query(
      `SELECT status FROM transfer_request WHERE id=$1`, [pedido.body.id]);
    expect(rows[0].status).toBe('cancelada');

    const aceite = await request(http).post(`/api/v1/transfers/${pedido.body.id}/accept`)
      .set(auth(tokens.coord4)).send({});
    expect(aceite.status).toBe(404);

    // E ela NÃO voltou a existir operacionalmente em nenhuma casa.
    const { rows: perm } = await admin.query(
      `SELECT count(*)::int AS n FROM house_stay WHERE person_id=$1 AND status='ativa'`, [pessoa]);
    expect(perm[0].n).toBe(0);
  });

  // ==================== Offline ====================

  it('operação offline que falhou não volta como "duplicada", e o aparelho não a apaga', async () => {
    const opId = `teste-conflito-${Date.now()}`;
    const falha = await request(http).post('/api/v1/sync/push').set(auth(tokens.educador))
      .send({ operacoes: [{
        clientOpId: opId, kind: 'activity.record', houseId: AI3,
        happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
        // Atividade inexistente: a aplicação falha e a operação vira conflito.
        payload: { activityId: '00000000-0000-0000-0000-000000000000', estado: 'concluida_no_horario' },
      }] });
    expect(falha.status).toBe(201);
    expect(falha.body.resultados[0].status).toBe('conflito');
    // O ponto exato do defeito: o aparelho não pode apagar o que não entrou.
    expect(falha.body.podeLimpar).not.toContain(opId);

    // Reenvio: é NOVA TENTATIVA, não duplicata. Antes respondia "duplicada" e
    // devolvia o id em podeLimpar — o registro sumia do aparelho e do servidor.
    const atv = await request(http).post('/api/v1/activities/urgent')
      .set(auth(tokens.lider))
      .send({ houseId: AI3, title: 'Atividade da retentativa', scheduledAt: new Date().toISOString(),
              reason: 'Teste de retentativa da fila offline' });
    await request(http).post(`/api/v1/activities/${atv.body.id}/acknowledge`)
      .set(auth(tokens.educador)).send({});

    const retentativa = await request(http).post('/api/v1/sync/push').set(auth(tokens.educador))
      .send({ operacoes: [{
        clientOpId: opId, kind: 'activity.record', houseId: AI3,
        happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
        payload: { activityId: atv.body.id, estado: 'concluida_no_horario' },
      }] });
    expect(retentativa.body.resultados[0].status).toBe('aplicada');
    expect(retentativa.body.podeLimpar).toContain(opId);
  });

  it('a fila offline não é atalho para gravar o que a regra recusa', async () => {
    const chamada = await request(http).post('/api/v1/checks').set(auth(tokens.educador))
      .send({ houseId: AI3, kind: 'alimentacao', titulo: 'Almoço (regressão)' });
    expect(chamada.status).toBe(201);

    // "Recusou" é exceção: exige justificativa objetiva. Pela API dá 400 —
    // pela fila, entrava calada, e a chamada fechava como completa.
    const semNota = await request(http).post('/api/v1/sync/push').set(auth(tokens.educador))
      .send({ operacoes: [{
        clientOpId: `teste-check-${Date.now()}`, kind: 'check.mark', houseId: AI3,
        happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
        payload: { checkId: chamada.body.id, personId: crianca, opcao: 'recusou' },
      }] });
    expect(semNota.body.resultados[0].status).toBe('conflito');
    expect(semNota.body.resultados[0].motivo).toMatch(/justificativa/i);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM check_result WHERE check_id=$1`, [chamada.body.id]);
    expect(rows[0].n).toBe(0);
  });
});
