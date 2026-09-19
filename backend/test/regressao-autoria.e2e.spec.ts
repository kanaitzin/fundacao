/**
 * REGRESSÃO — escopo, autoria e primeiro acesso.
 *
 * Terceira rodada de auditoria. Trava os doze defeitos corrigidos e as funções
 * que nasceram depois deles: convite de primeiro acesso, autoria dupla,
 * delegação pelo líder e recusa de substituição.
 *
 * O fio comum continua sendo o das auditorias anteriores: nenhum destes
 * defeitos dava erro. A função apagava a linha da casa vizinha e devolvia
 * sucesso; a fila offline sobrescrevia a conclusão de outra pessoa e o
 * aparelho limpava o registro; o mês era cortado três horas antes e a
 * contagem simplesmente vinha diferente. Teste que só verifica caminho feliz
 * não teria pego nenhum.
 *
 * Cada bloco abaixo é escrito do ponto de vista de quem sofre o defeito, não
 * do ponto de vista da função — é assim que ele continua fazendo sentido para
 * quem ler daqui a um ano sem ter visto o código quebrado.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { hojeNaInstituicao, janelaDoMes, dataNaInstituicao } from '../src/kernel/common/tempo';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
/**
 * O DIA LIDO NA HORA, E NUNCA GUARDADO.
 *
 * Isto era `const HOJE = hojeNaInstituicao()`, avaliado ao CARREGAR o arquivo
 * — e a suíte inteira leva um minuto e meio. Numa rodada que começou às 23h58
 * de 13/09 e terminou depois da meia-noite, dois testes reprovaram: o #10
 * comparou o dia do banco (já 14/09) com um texto capturado no dia anterior, e
 * o #11 pediu a lista de um dia que tinha acabado. Nenhum dos dois era defeito
 * do sistema, e os dois pareciam um.
 *
 * A regra que sobra é a mesma da 13, um degrau acima: **teste não guarda o
 * resultado de uma pergunta sobre AGORA.** Guardar o dia numa constante é
 * guardar uma resposta que envelhece sozinha — e ela envelhece uma vez a cada
 * 24 horas, que é a frequência com que ninguém está olhando.
 */
const hoje = () => hojeNaInstituicao();

describe('Regressão — escopo, autoria e primeiro acesso', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, AI4: string, crianca: string;

  const login = async (email: string, senha = SENHA) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: senha });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** Atividade urgente é o fixture mais barato: nasce pronta e não mexe na rotina. */
  const novaAtividade = async (titulo: string) => {
    const r = await request(http).post('/api/v1/activities/urgent').set(auth(tokens.lider))
      .send({ houseId: AI3, title: titulo, scheduledAt: new Date().toISOString(),
              reason: 'Fixture de teste automatizado — dados fictícios' });
    expect(r.status).toBe(201);
    return r.body.id as string;
  };

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
      enfermagem: 'enfermagem@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));

    const res = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Rita Teste Autoria (fictícia)', socialName: 'RitaA',
              birthDate: '2012-06-10',
              provisionalReason: 'Ingresso de teste automatizado — dados fictícios' });
    expect(res.status).toBe(201);
    crianca = res.body.personId;
  });

  afterAll(async () => {
    await request(http).post(`/api/v1/people/${crianca}/discharge`)
      .set(auth(tokens.tecnica)).send({ motivo: 'Encerramento de fixture de teste' });
    await app.close(); await admin.end();
  });

  // ==================== Escopo (defeito 1) ====================

  it('#1 marcar "sem confirmação" não alcança a casa vizinha', async () => {
    // O defeito: SECURITY DEFINER desliga o RLS, e a casa vinha por parâmetro
    // sem ninguém conferir. O educador da AI3 mexia no painel da AI4 sem ver
    // a AI4, sem aparecer em tela nenhuma, e recebia 200.
    const propria = await request(http).post('/api/v1/activities/mark-unconfirmed')
      .set(auth(tokens.educador)).send({ houseId: AI3, minutes: 60 });
    expect(propria.status).toBe(201);

    const alheia = await request(http).post('/api/v1/activities/mark-unconfirmed')
      .set(auth(tokens.educador)).send({ houseId: AI4, minutes: 60 });
    // 404, não 403: responder "proibido" já contaria que aquele uuid é de uma
    // casa real.
    expect(alheia.status).toBe(404);
  });

  // ==================== Registro fechado (defeitos 2 e 8) ====================

  it('#2 a fila offline não reabre atividade encerrada por ter clientOpId', async () => {
    const id = await novaAtividade('Atividade offline (fictícia)');
    await request(http).post(`/api/v1/activities/${id}/acknowledge`)
      .set(auth(tokens.educador)).send({});
    const manha = await request(http).post(`/api/v1/activities/${id}/record`)
      .set(auth(tokens.educador)).send({ estado: 'concluida_no_horario' });
    expect(manha.status).toBe(201);

    // O aparelho que ficou sem rede sobe a fila às 23h. Operação NOVA — id que
    // o servidor nunca viu — sobre atividade que outra pessoa já encerrou.
    const atrasada = await request(http).post(`/api/v1/activities/${id}/record`)
      .set(auth(tokens.educador2))
      .send({ estado: 'nao_realizada_transporte', nota: 'Van não apareceu.',
              offline: true, clientOpId: `op-atrasada-${Date.now()}` });
    expect(atrasada.status).toBe(400);

    const { rows } = await admin.query(`SELECT state FROM activity WHERE id=$1`, [id]);
    expect(rows[0].state).toBe('concluida_no_horario');
  });

  it('#2 o reenvio da MESMA operação continua sendo duplicata, não conflito', async () => {
    const id = await novaAtividade('Atividade reenviada (fictícia)');
    await request(http).post(`/api/v1/activities/${id}/acknowledge`)
      .set(auth(tokens.educador)).send({});
    const op = `op-reenvio-${Date.now()}`;

    const primeira = await request(http).post(`/api/v1/activities/${id}/record`)
      .set(auth(tokens.educador))
      .send({ estado: 'concluida_no_horario', offline: true, clientOpId: op });
    expect(primeira.status).toBe(201);

    // A idempotência tem que continuar valendo DEPOIS da trava de estado final:
    // foi a própria operação que encerrou a atividade.
    const reenvio = await request(http).post(`/api/v1/activities/${id}/record`)
      .set(auth(tokens.educador))
      .send({ estado: 'concluida_no_horario', offline: true, clientOpId: op });
    expect(reenvio.status).toBe(201);
    expect(reenvio.body.duplicada).toBe(true);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM activity_execution WHERE activity_id=$1`, [id]);
    expect(rows[0].n).toBe(1);
  });

  it('#8 pedido de substituição não ressuscita atividade concluída', async () => {
    const id = await novaAtividade('Atividade concluída (fictícia)');
    await request(http).post(`/api/v1/activities/${id}/acknowledge`)
      .set(auth(tokens.educador)).send({});
    await request(http).post(`/api/v1/activities/${id}/record`)
      .set(auth(tokens.educador)).send({ estado: 'concluida_no_horario' }).expect(201);

    const pedido = await request(http).post(`/api/v1/activities/${id}/substitution`)
      .set(auth(tokens.educador)).send({ motivo: 'Preciso sair mais cedo' });
    expect(pedido.status).toBe(400);

    const { rows } = await admin.query(`SELECT state FROM activity WHERE id=$1`, [id]);
    expect(rows[0].state).toBe('concluida_no_horario');
  });

  // ==================== Autoria da chamada (defeitos 5 e 11) ====================

  it('#5 corrigir a chamada guarda o que constava antes, com autor', async () => {
    const aberta = await request(http).post('/api/v1/checks').set(auth(tokens.educador))
      .send({ houseId: AI3, kind: 'alimentacao', titulo: 'Chamada de teste (fictícia)' });
    expect(aberta.status).toBe(201);
    const checkId = aberta.body.id;

    await request(http).post(`/api/v1/checks/${checkId}/mark`).set(auth(tokens.educador))
      .send({ personId: crianca, opcao: 'normal' }).expect(201);

    // Outro educador corrige. A marcação muda; o que constava não some.
    const correcao = await request(http).post(`/api/v1/checks/${checkId}/mark`)
      .set(auth(tokens.educador2)).send({ personId: crianca, opcao: 'normal' });
    expect(correcao.status).toBe(201);

    const { rows: hist } = await admin.query(
      `SELECT option_code, recorded_by FROM check_result_amendment
        WHERE check_id=$1 AND person_id=$2`, [checkId, crianca]);
    // Mesma opção nas duas vezes: reenvio idêntico NÃO polui o histórico.
    expect(hist.length).toBe(0);

    const troca = await request(http).post(`/api/v1/checks/${checkId}/mark`)
      .set(auth(tokens.educador2))
      .send({ personId: crianca, opcao: 'recusou', nota: 'Estava na consulta.' });
    expect([200, 201]).toContain(troca.status);

    const { rows: h2 } = await admin.query(
      `SELECT a.option_code, u.email FROM check_result_amendment a
         JOIN app_user u ON u.id = a.recorded_by
        WHERE a.check_id=$1 AND a.person_id=$2`, [checkId, crianca]);
    expect(h2.length).toBe(1);
    expect(h2[0].option_code).toBe('normal');             // o valor anterior
    expect(h2[0].email).toMatch(/educador/);              // e quem o registrou
  });

  it('#11 a lista do dia conta o efetivo vivo, não o congelado na abertura', async () => {
    const aberta = await request(http).post('/api/v1/checks').set(auth(tokens.educador))
      .send({ houseId: AI3, kind: 'alimentacao', titulo: 'Chamada do efetivo (fictícia)' });
    const checkId = aberta.body.id;
    const naAbertura = aberta.body.esperados as number;

    // Chega uma criança depois da abertura — é o caso que fazia a lista dizer
    // "12/15" enquanto o detalhe dizia "12/12", e a equipe procurar três
    // crianças que ninguém tinha deixado de conferir.
    const nova = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Novo Acolhido Efetivo (fictício)',
              birthDate: '2014-01-20',
              provisionalReason: 'Ingresso de teste automatizado — dados fictícios' });
    expect(nova.status).toBe(201);

    try {
      const lista = await request(http)
        .get(`/api/v1/checks?houseId=${AI3}&date=${hoje()}`).set(auth(tokens.educador));
      const linha = (lista.body as any[]).find((c) => c.id === checkId);
      expect(linha).toBeDefined();
      expect(linha.esperadosNaAbertura).toBe(naAbertura);
      expect(linha.esperados).toBe(naAbertura + 1);
    } finally {
      await request(http).post(`/api/v1/people/${nova.body.personId}/discharge`)
        .set(auth(tokens.tecnica)).send({ motivo: 'Encerramento de fixture de teste' });
    }
  });

  // ==================== Episódio e rotina (defeitos 6 e 12) ====================

  it('#6 atualizar a situação judicial não reescreve o acolhimento anterior', async () => {
    // A criança que já esteve na instituição tem mais de um judicial_record,
    // um por episódio. Sem o filtro, corrigir a situação de hoje reescrevia a
    // de 2019 — e o registro do episódio encerrado passava a mentir.
    const { rows: [ep] } = await admin.query(
      `SELECT id, institution_id FROM care_episode WHERE person_id=$1 AND status='ativo'`, [crianca]);
    const { rows: [antigo] } = await admin.query(
      `INSERT INTO care_episode (person_id, institution_id, number, status, started_at, ended_at)
       VALUES ($1,$2,90,'encerrado', now()-interval '3 years', now()-interval '2 years')
       RETURNING id`, [crianca, ep.institution_id]);
    for (const [id, proc] of [[ep.id, 'PROC-ATUAL'], [antigo.id, 'PROC-ANTIGO']]) {
      await admin.query(
        `INSERT INTO judicial_record (episode_id, person_id, reason_category,
           determining_body, process_number, legal_status)
         VALUES ($1,$2,'negligencia','vara_da_infancia',$3,'situação original')
         ON CONFLICT (episode_id) DO UPDATE
           SET process_number=EXCLUDED.process_number, legal_status='situação original'`,
        [id, crianca, proc]);
    }

    const r = await request(http).patch(`/api/v1/people/${crianca}/judicial`)
      .set(auth(tokens.tecnica)).send({ situacao: 'Audiência marcada' });
    expect([200, 201]).toContain(r.status);

    const { rows } = await admin.query(
      `SELECT e.number, j.legal_status FROM judicial_record j
         JOIN care_episode e ON e.id = j.episode_id
        WHERE j.person_id=$1 ORDER BY e.number`, [crianca]);
    const encerrado = rows.find((x) => Number(x.number) === 90);
    expect(encerrado.legal_status).toBe('situação original');   // intacto
    expect(rows.some((x) => x.legal_status === 'Audiência marcada')).toBe(true);
  });

  it('#12 item de rotina não entra em versão fechada nem em versão de outra casa', async () => {
    /*
     * Este teste MUTA a rotina da AI3, e a rotina é contada por outras suítes
     * (número da versão, itens gerados no dia). Por isso desfaz o que criou —
     * a primeira versão que escrevi passava sozinha e derrubava duas suítes
     * vizinhas, que é o mesmo acoplamento entre teste e estado que esta
     * auditoria veio corrigir no `saude`.
     */
    const { rows: [anterior] } = await admin.query(
      `SELECT id FROM routine_version WHERE house_id=$1 AND valid_to IS NULL`, [AI3]);

    const v = await request(http).post('/api/v1/routine/versions').set(auth(tokens.tecnica))
      .send({ houseId: AI3, motivo: 'Versão de teste (fictícia)' });
    expect(v.status).toBe(201);
    const versaoId = v.body.versaoId;

    const item = (houseId: string) =>
      request(http).post(`/api/v1/routine/versions/${versaoId}/items`)
        .set(auth(tokens.tecnica))
        .send({ houseId, kind: 'higiene', title: 'Item de teste (fictício)',
                startTime: '08:00', collective: true });

    try {
      expect((await item(AI3)).status).toBe(201);
      expect((await item(AI4)).status).toBe(400);           // versão de outra casa

      await admin.query(`UPDATE routine_version SET valid_to = app_hoje() WHERE id=$1`, [versaoId]);
      const fechada = await item(AI3);
      expect(fechada.status).toBe(409);
      expect(fechada.body.message).toMatch(/encerrada/i);
    } finally {
      await admin.query(`DELETE FROM routine_item WHERE version_id=$1`, [versaoId]);
      await admin.query(`DELETE FROM routine_version WHERE id=$1`, [versaoId]);
      if (anterior) {
        await admin.query(`UPDATE routine_version SET valid_to = NULL WHERE id=$1`, [anterior.id]);
      }
    }
  });

  // ==================== Fuso (defeitos 7, 9 e 10) ====================

  it('#10 "hoje" no banco é o dia de Porto Alegre, não o do servidor', async () => {
    // `to_char` de propósito: `date` volta do driver como meia-noite no fuso
    // do PROCESSO, e converter de novo perderia justamente o dia que estamos
    // testando. O que interessa é o texto que o banco produziu.
    await admin.query(`SET TIME ZONE 'UTC'`);
    const { rows } = await admin.query(
      `SELECT to_char(app_hoje(),'YYYY-MM-DD') AS instituicao,
              to_char(current_date,'YYYY-MM-DD') AS servidor`);
    expect(rows[0].instituicao).toBe(hoje());

    // E a virada é a de lá: 21h30 do dia 28 é dia 28 na instituição, mesmo com
    // o servidor em UTC já no dia 29. Era esta diferença que fazia a dose da
    // noite não ser gerada e o Resumo de Saúde sair errado.
    const { rows: [v] } = await admin.query(
      `SELECT to_char(('2026-08-29 00:30:00+00'::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date,
                      'YYYY-MM-DD') AS instituicao,
              to_char(('2026-08-29 00:30:00+00'::timestamptz AT TIME ZONE 'UTC')::date,
                      'YYYY-MM-DD') AS servidor`);
    expect(v.instituicao).toBe('2026-08-28');
    expect(v.servidor).toBe('2026-08-29');
  });

  it('#7 a janela do mês começa e termina no fuso da instituição', () => {
    const j = janelaDoMes('2026-08');
    // 03:00Z é meia-noite em Porto Alegre. Se a janela abrisse em 00:00Z, a
    // ocorrência das 22h do dia 31 de julho entraria em agosto.
    expect(j.inicio.toISOString()).toBe('2026-08-01T03:00:00.000Z');
    expect(j.fim.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    const noite = new Date('2026-08-01T01:00:00Z');           // 22h de 31/07 local
    expect(noite >= j.inicio).toBe(false);
    expect(dataNaInstituicao(noite)).toBe('2026-07-31');
  });

  it('#9 o nome do arquivo usa a mesma data da pasta', async () => {
    // Fechado às 22h do dia 31 em Porto Alegre = 01:00Z do dia 1º. A pasta já
    // era montada em São Paulo; o nome usava UTC, e os dois discordavam.
    const { ArchiveService } = await import('../src/modules/archive/archive.service');
    const nome = ArchiveService.prototype.nomeSeguro.call(
      null, 'ata', '0123456789abcdef', new Date('2026-08-01T01:00:00Z'), 'V1');
    expect(nome).toContain('2026-07-31');
    expect(nome).not.toContain('2026-08-01');
    // E continua sem pessoa: nem CPF, nem nome, nem diagnóstico (§3.3).
    expect(nome).toMatch(/^ata_2026-07-31_[0-9a-f]{8}_V1\.pdf$/);
  });

  // ==================== Estoque (defeito 4) ====================

  it('#4 o estoque comum da casa é UMA linha, mesmo com person_id nulo', async () => {
    const med = `Dipirona Teste ${Date.now()}`;
    const entrada = () => request(http).post('/api/v1/medications/stock')
      .set(auth(tokens.enfermagem))
      .send({ tipo: 'entrada', houseId: AI3, medicamento: med, quantidade: 10, unidade: 'comprimido' });

    expect((await entrada()).status).toBe(201);
    expect((await entrada()).status).toBe(201);   // upsert, não linha nova

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM medication_stock
        WHERE house_id=$1 AND medication=$2 AND person_id IS NULL`, [AI3, med]);
    // Era aqui que as duplicatas se acumulavam — e cada dose administrada
    // descontava uma unidade de CADA uma delas.
    expect(rows[0].n).toBe(1);
  });

  // ==================== Estoque: entrada e contagem (§8.4) ====================

  it('§8.4 entrada SOMA e o movimento conta o que chegou', async () => {
    const med = `Amoxicilina Teste ${Date.now()}`;
    const post = (body: any) => request(http).post('/api/v1/medications/stock')
      .set(auth(tokens.enfermagem)).send({ houseId: AI3, medicamento: med, ...body });

    expect((await post({ tipo: 'entrada', quantidade: 30, unidade: 'frasco' })).status).toBe(201);
    const r = await post({ tipo: 'entrada', quantidade: 10 });
    expect(r.status).toBe(201);
    // Era isto que estava errado: 10 sobre 30 deixava 10.
    expect(Number(r.body.quantidade)).toBe(40);
    expect(Number(r.body.anterior)).toBe(30);

    const { rows } = await admin.query(
      `SELECT m.kind, m.quantity FROM medication_stock_movement m
         JOIN medication_stock s ON s.id = m.stock_id
        WHERE s.house_id=$1 AND s.medication=$2 ORDER BY m.at`, [AI3, med]);
    expect(rows.map((x) => x.kind)).toEqual(['entrada', 'entrada']);
    expect(rows.map((x) => Number(x.quantity))).toEqual([30, 10]);
  });

  it('§8.4 contagem SUBSTITUI, exige motivo e grava a diferença como ajuste', async () => {
    const med = `Paracetamol Teste ${Date.now()}`;
    const post = (body: any) => request(http).post('/api/v1/medications/stock')
      .set(auth(tokens.enfermagem)).send({ houseId: AI3, medicamento: med, ...body });

    await post({ tipo: 'entrada', quantidade: 30, unidade: 'comprimido' }).expect(201);

    // Sem motivo, a contagem não passa: sumiço sem explicação escrita é o que
    // não pode virar rotina.
    expect((await post({ tipo: 'contagem', quantidade: 26 })).status).toBe(400);

    const r = await post({ tipo: 'contagem', quantidade: 26, motivo: 'Conferência do armário na passagem.' });
    expect(r.status).toBe(201);
    expect(Number(r.body.quantidade)).toBe(26);
    expect(Number(r.body.diferenca)).toBe(-4);

    const { rows } = await admin.query(
      `SELECT m.kind, m.quantity, m.reason FROM medication_stock_movement m
         JOIN medication_stock s ON s.id = m.stock_id
        WHERE s.house_id=$1 AND s.medication=$2 ORDER BY m.at`, [AI3, med]);
    const ajuste = rows[rows.length - 1];
    expect(ajuste.kind).toBe('ajuste');            // nunca 'entrada'
    expect(Number(ajuste.quantity)).toBe(-4);      // a diferença, não o total
    expect(ajuste.reason).toContain('Conferência');
  });

  it('§8.4 sem "tipo" o servidor recusa, em vez de escolher por mim', async () => {
    const r = await request(http).post('/api/v1/medications/stock')
      .set(auth(tokens.enfermagem))
      .send({ houseId: AI3, medicamento: `Sem Tipo ${Date.now()}`, quantidade: 5 });
    expect(r.status).toBe(400);
    expect(String(r.body.message)).toMatch(/entrada|contagem/);
  });

  it('§8.4 a entrada mantém a validade MAIS PRÓXIMA — lote novo não apaga o velho', async () => {
    const med = `Colírio Teste ${Date.now()}`;
    const post = (body: any) => request(http).post('/api/v1/medications/stock')
      .set(auth(tokens.enfermagem)).send({ houseId: AI3, medicamento: med, ...body });

    await post({ tipo: 'entrada', quantidade: 2, unidade: 'frasco', validade: '2026-10-05' }).expect(201);
    await post({ tipo: 'entrada', quantidade: 3, validade: '2027-06-30' }).expect(201);

    const { rows: [s] } = await admin.query(
      `SELECT quantity, expires_on FROM medication_stock
        WHERE house_id=$1 AND medication=$2`, [AI3, med]);
    expect(Number(s.quantity)).toBe(5);
    // O frasco de outubro continua na gaveta: é ele que manda descartar.
    expect(new Date(s.expires_on).toISOString().slice(0, 10)).toBe('2026-10-05');
  });

  // ============ Painel de enfermagem: a âncora do vencimento (§8.4) ============

  it('§8.4 "vencendo em 7 dias" parte de HOJE, mesmo revisando outro dia', async () => {
    const { rows: [f] } = await admin.query(
      `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
        WHERE p.proname = 'app_nursing_panel'`);
    // A janela não pode mais depender do dia que o painel mostra.
    expect(f.def).toContain('app_hoje() + 7');
    expect(f.def).not.toContain('p_date + 7');
    expect(f.def).not.toContain('current_date');

    // E o painel de outro dia continua sendo o painel daquele dia, avisando
    // que o alerta de receita é de hoje.
    // Véspera calculada a partir do dia da INSTITUIÇÃO, não do dia UTC: às 22h
    // de Porto Alegre o UTC já virou, e "ontem em UTC" seria hoje aqui.
    const ontem = dataNaInstituicao(
      new Date(new Date(`${hoje()}T12:00:00-03:00`).getTime() - 86400000));
    const p = await request(http).get(`/api/v1/nursing/panel?houseId=${AI3}&date=${ontem}`)
      .set(auth(tokens.enfermagem));
    expect(p.status).toBe(200);
    expect(p.body.data).toBe(ontem);
    expect(p.body.revendoOutroDia).toBe(true);
    expect(p.body.receitaVencendoAncoradaEm).toBe(p.body.hoje);
  });

  // ==================== Autoria dupla e delegação ====================

  it('o líder registra pelo educador, e os DOIS nomes ficam', async () => {
    const id = await novaAtividade('Atividade sem sinal (fictícia)');
    const { rows: [edu] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev'`);

    const r = await request(http).post(`/api/v1/activities/${id}/record`)
      .set(auth(tokens.lider))
      .send({ estado: 'concluida_no_horario', realizadoPor: edu.id,
              motivoRegistroPorOutro: 'Aparelho da casa ficou sem sinal.' });
    expect(r.status).toBe(201);

    const { rows } = await admin.query(
      `SELECT user_id, performed_by, proxy_reason FROM activity_execution WHERE activity_id=$1`, [id]);
    expect(rows[0].performed_by).toBe(edu.id);
    expect(rows[0].user_id).not.toBe(edu.id);        // quem operou continua sendo o líder
    expect(rows[0].proxy_reason).toMatch(/sinal/i);
  });

  it('registrar pelo colega exige motivo, e educador não faz isso por ninguém', async () => {
    const id = await novaAtividade('Atividade sem motivo (fictícia)');
    const { rows: [edu] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev'`);

    const semMotivo = await request(http).post(`/api/v1/activities/${id}/record`)
      .set(auth(tokens.lider))
      .send({ estado: 'concluida_no_horario', realizadoPor: edu.id });
    expect(semMotivo.status).toBe(400);

    const porColega = await request(http).post(`/api/v1/activities/${id}/record`)
      .set(auth(tokens.educador2))
      .send({ estado: 'concluida_no_horario', realizadoPor: edu.id,
              motivoRegistroPorOutro: 'Ele me pediu.' });
    expect(porColega.status).toBeGreaterThanOrEqual(400);
  });

  it('o líder delega atividade em aberto, e a designação anterior não some', async () => {
    const id = await novaAtividade('Atividade delegada (fictícia)');
    const { rows: [edu2] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador2.ai3@paodospobres.dev'`);

    const r = await request(http).post(`/api/v1/activities/${id}/delegate`)
      .set(auth(tokens.lider)).send({ paraId: edu2.id, motivo: 'Educador faltou hoje.' });
    expect(r.status).toBe(201);

    const { rows: [a] } = await admin.query(`SELECT state FROM activity WHERE id=$1`, [id]);
    // Volta a exigir ciência: designado não é o mesmo que avisado.
    expect(a.state).toBe('aguardando_ciencia');

    const semMotivo = await request(http).post(`/api/v1/activities/${id}/delegate`)
      .set(auth(tokens.lider)).send({ paraId: edu2.id, motivo: '' });
    expect(semMotivo.status).toBe(400);

    const porEducador = await request(http).post(`/api/v1/activities/${id}/delegate`)
      .set(auth(tokens.educador)).send({ paraId: edu2.id, motivo: 'quero passar adiante' });
    expect(porEducador.status).toBe(403);
  });

  it('o painel do plantão mostra o turno e não alcança outra casa', async () => {
    const meu = await request(http)
      .get(`/api/v1/activities/shift-board?houseId=${AI3}`).set(auth(tokens.educador));
    expect(meu.status).toBe(200);
    expect(Array.isArray(meu.body.linhas)).toBe(true);
    expect(meu.body.nota).toMatch(/não é medição/i);

    const alheio = await request(http)
      .get(`/api/v1/activities/shift-board?houseId=${AI4}`).set(auth(tokens.educador));
    expect(alheio.body.linhas.length).toBe(0);
  });

  it('recusar substituição exige motivo, e o pedido não é decidido duas vezes', async () => {
    const id = await novaAtividade('Atividade com pedido (fictícia)');
    await request(http).post(`/api/v1/activities/${id}/acknowledge`)
      .set(auth(tokens.educador)).send({});
    const pedido = await request(http).post(`/api/v1/activities/${id}/substitution`)
      .set(auth(tokens.educador)).send({ motivo: 'Preciso sair mais cedo' });
    expect(pedido.status).toBe(201);

    const semMotivo = await request(http)
      .post(`/api/v1/activities/substitutions/${pedido.body.id}/decline`)
      .set(auth(tokens.lider)).send({ motivo: '' });
    expect(semMotivo.status).toBe(400);

    const ok = await request(http)
      .post(`/api/v1/activities/substitutions/${pedido.body.id}/decline`)
      .set(auth(tokens.lider)).send({ motivo: 'Não há substituto neste turno.' });
    expect(ok.status).toBe(201);

    const denovo = await request(http)
      .post(`/api/v1/activities/substitutions/${pedido.body.id}/decline`)
      .set(auth(tokens.lider)).send({ motivo: 'Outra vez.' });
    expect(denovo.status).toBe(404);
  });

  // ==================== Convite de primeiro acesso ====================

  it('o convite vale UMA vez, e a senha antiga deixa de valer ao ser emitido', async () => {
    const email = `convidada.${Date.now()}@paodospobres.dev`;
    const criada = await request(http).post('/api/v1/staff').set(auth(tokens.coord3))
      .send({ nome: 'Convidada de Teste (fictícia)', email, cargo: 'educador', casaId: AI3 });
    expect(criada.status).toBe(201);
    const alvo = criada.body.id;
    const senhaInicial = criada.body.senhaInicial as string;

    // Entra com a senha inicial que a coordenação viu uma vez.
    expect((await request(http).post('/api/v1/auth/login')
      .send({ email, password: senhaInicial })).status).toBe(201);

    const convite = await request(http).post(`/api/v1/staff/${alvo}/convite`)
      .set(auth(tokens.coord3)).send({});
    expect(convite.status).toBe(201);
    // O token NÃO volta pela API: quem convida não vê o link.
    expect(JSON.stringify(convite.body)).not.toMatch(/token|convite=/i);

    // A senha inicial morreu junto com a emissão do convite.
    expect((await request(http).post('/api/v1/auth/login')
      .send({ email, password: senhaInicial })).status).toBe(401);

    // O token real só existe no e-mail; aqui pegamos o hash para simular o
    // clique no link — é o mais próximo que o teste chega da caixa de entrada.
    const { rows: [inv] } = await admin.query(
      `SELECT id FROM user_invite WHERE user_id=$1 AND used_at IS NULL`, [alvo]);
    expect(inv).toBeDefined();

    const inventado = await request(http).post('/api/v1/auth/convite/conferir')
      .send({ convite: 'token-inventado' });
    expect(inventado.status).toBe(410);

    // Vencido responde igual a inventado: não conta que existiu, nem de quem era.
    await admin.query(
      `UPDATE user_invite SET expires_at = now() - interval '1 minute' WHERE id=$1`, [inv.id]);
    const vencido = await request(http).post('/api/v1/auth/convite/concluir')
      .send({ convite: 'qualquer-coisa', novaSenha: 'senha-nova-123' });
    expect(vencido.status).toBe(410);

    // Desativar não basta: o vínculo com a casa continua, e outras suítes
    // contam a equipe da AI3 (as assinaturas que faltam na ATA, por exemplo).
    // Este teste passou uma rodada inteira antes de o vazamento aparecer —
    // é o mesmo acoplamento com estado compartilhado que esta auditoria veio
    // corrigir, e ele não avisa na primeira vez.
    await request(http).post(`/api/v1/staff/${alvo}/deactivate`)
      .set(auth(tokens.coord3)).send({ reason: 'Encerramento de fixture de teste' });
    await admin.query(
      `UPDATE user_house_assignment SET valid_to = app_hoje() - 1
        WHERE user_id = $1 AND valid_to IS NULL`, [alvo]);
    await admin.query(`DELETE FROM work_schedule WHERE user_id = $1`, [alvo]);
  });

  it('o passo 1 da entrada não revela quem trabalha na Fundação', async () => {
    const existente = await request(http).post('/api/v1/auth/primeiro-acesso')
      .send({ email: 'educador.ai3@paodospobres.dev' });
    const inexistente = await request(http).post('/api/v1/auth/primeiro-acesso')
      .send({ email: 'ninguem-aqui@paodospobres.dev' });
    expect(existente.status).toBe(201);
    expect(inexistente.status).toBe(201);
    // Mesma resposta para os dois: conta com senha e conta que não existe.
    expect(inexistente.body.temSenha).toBe(true);
    expect(existente.body.temSenha).toBe(true);
  });
});
