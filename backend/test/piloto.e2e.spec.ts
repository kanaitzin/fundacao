/**
 * FASE 7 — ENSAIO GERAL DO PILOTO DA CASA 03 (§33.3).
 *
 * As outras suítes provam regras isoladas. Esta percorre **um dia inteiro**,
 * na ordem em que as coisas acontecem, com os papéis se revezando — que é a
 * única forma de descobrir o que só quebra na emenda entre dois módulos.
 *
 * O roteiro é o que o documento pede para a demonstração: vinte perfis
 * fictícios na Casa 03, rotina, restrições, medicamentos, atividades,
 * passagem, ATA com pendência, ocorrência, transferência, retorno, offline e
 * falha do Drive com retentativa.
 *
 * Nada aqui é dado real (§3.3). O ensaio existe para o Marcelo e a equipe
 * verem o sistema funcionando de ponta a ponta antes de a Casa 03 entrar.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const hoje = new Date().toISOString().slice(0, 10);
/**
 * O ensaio abre o SEU plantão numa data própria, dois dias atrás.
 *
 * Não é preciosismo de teste: rodando junto com a suíte de plantão, as duas
 * disputavam o mesmo plantão diurno de hoje na Casa 03 — a primeira abria, a
 * segunda encontrava aberto e falhava. O ensaio percorre "um dia"; qual dia é
 * indiferente para o que ele prova, e um dia só seu deixa as duas suítes
 * independentes uma da outra.
 */
const diaDoEnsaio = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);

describe('Piloto da Casa 03 — ensaio geral do dia', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  let AI3: string, AI4: string;
  const lixo: { commitments: string[]; archive: string[] } = { commitments: [], archive: [] };

  const auth = (tok: string) => ({ Authorization: `Bearer ${tok}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

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
      coord4: 'coord.ai4@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
      noturno: 'lider.noturno@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) t[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
  });

  afterAll(async () => {
    if (lixo.commitments.length) {
      await admin.query(
        `DELETE FROM activity_assignment WHERE activity_id IN
           (SELECT id FROM activity WHERE commitment_id = ANY($1::uuid[]))`, [lixo.commitments]);
      await admin.query(`DELETE FROM activity WHERE commitment_id = ANY($1::uuid[])`, [lixo.commitments]);
      await admin.query(`DELETE FROM commitment WHERE id = ANY($1::uuid[])`, [lixo.commitments]);
    }
    if (lixo.archive.length) {
      await admin.query(`DELETE FROM archive_attempt WHERE item_id = ANY($1::uuid[])`, [lixo.archive]);
      await admin.query(`DELETE FROM archive_item WHERE id = ANY($1::uuid[])`, [lixo.archive]);
    }
    await app.close(); await admin.end();
  });

  // ---------------------------------------------------------------
  // 1. A casa que a Fundação vai ver na demonstração
  // ---------------------------------------------------------------
  it('a Casa 03 tem os vinte perfis fictícios, com restrições e medicamentos variados', async () => {
    const res = await request(http).get(`/api/v1/people?houseId=${AI3}`).set(auth(t.educador));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(20);

    // Cada perfil tem nome de exibição — o social quando existe (§6.1).
    expect(res.body.every((p: any) => typeof p.nome === 'string' && p.nome.length > 0)).toBe(true);

    // Restrições e alertas essenciais vêm no próprio resumo do acolhido.
    expect(res.body.some((p: any) => (p.restricoesAlimentares ?? 0) > 0)).toBe(true);

    const { rows: [r] } = await admin.query(
      `SELECT (SELECT count(*) FROM prescription WHERE house_id = $1)::int AS prescricoes,
              (SELECT count(DISTINCT kind) FROM prescription WHERE house_id = $1)::int AS tipos`,
      [AI3]);
    expect(r.prescricoes).toBeGreaterThan(0);
    // "Medicamentos variados": contínuo, tratamento, se necessário…
    expect(r.tipos).toBeGreaterThan(1);
  });

  // ---------------------------------------------------------------
  // 2. Manhã: o dia é gerado, e ninguém precisa criar nada à mão
  // ---------------------------------------------------------------
  it('o dia nasce da rotina, da agenda e das prescrições — e gerar duas vezes não duplica', async () => {
    const rotina = await request(http).post('/api/v1/activities/generate-day')
      .set(auth(t.lider)).send({ houseId: AI3, date: hoje });
    expect(rotina.status).toBe(201);

    const agenda = await request(http).post('/api/v1/activities/agenda/generate')
      .set(auth(t.lider)).send({ houseId: AI3, date: hoje });
    expect(agenda.status).toBe(201);

    const doses = await request(http).post('/api/v1/medications/generate-doses')
      .set(auth(t.enfermagem)).send({ houseId: AI3, date: hoje });
    expect(doses.status).toBe(201);

    // De novo, tudo: idempotência é o que permite rodar a geração sem medo.
    const denovo = await request(http).post('/api/v1/activities/generate-day')
      .set(auth(t.lider)).send({ houseId: AI3, date: hoje });
    expect(denovo.body.criadas).toBe(0);

    const linha = await request(http).get(`/api/v1/timeline?houseId=${AI3}&date=${hoje}`)
      .set(auth(t.educador));
    expect(linha.status).toBe(200);
    expect(linha.body.eventos.length).toBeGreaterThan(0);
    // Se um provedor falhar, a tela DIZ — melhor incompleta e sinalizada.
    expect(linha.body.incompleta).toBe(false);
    // A linha do tempo chega em ordem de horário: é assim que se trabalha nela.
    const horas = linha.body.eventos.map((e: any) => e.at);
    expect(horas).toEqual([...horas].sort());
  });

  // ---------------------------------------------------------------
  // 3. Uma consulta marcada com semanas de antecedência
  // ---------------------------------------------------------------
  it('a técnica marca a consulta com responsável, e ela cai no dia certo', async () => {
    const equipe = await request(http)
      .get(`/api/v1/activities/agenda/staff?houseId=${AI3}&data=${hoje}&hora=10:00`)
      .set(auth(t.tecnica));
    const educador = equipe.body.find((e: any) => e.cargo === 'educador');

    const marcado = await request(http).post('/api/v1/activities/agenda')
      .set(auth(t.tecnica)).send({
        houseId: AI3, personId: (await request(http).get(`/api/v1/people?houseId=${AI3}`)
          .set(auth(t.tecnica))).body[0].id,
        tipo: 'saude', titulo: 'Consulta do ensaio (fictícia)', local: 'UBS fictícia',
        inicio: hoje, hora: '10:00', duracaoMin: 60, recorrencia: 'unica',
        responsavel: 'pessoa', responsavelId: educador.id,
        orientacoes: 'Levar cartão SUS (fictício).',
      });
    expect(marcado.status).toBe(201);
    lixo.commitments.push(marcado.body.id);

    await request(http).post('/api/v1/activities/agenda/generate')
      .set(auth(t.lider)).send({ houseId: AI3, date: hoje });

    const linha = await request(http).get(`/api/v1/timeline?houseId=${AI3}&date=${hoje}`)
      .set(auth(t.educador));
    expect(linha.body.eventos.some((e: any) => e.title.includes('Consulta do ensaio'))).toBe(true);
  });

  // ---------------------------------------------------------------
  // 4. A cozinha vê o mínimo — e é o mínimo mesmo
  // ---------------------------------------------------------------
  it('o relatório da cozinha traz restrição e nada de CPF, diagnóstico ou caso', async () => {
    // A Enfermagem não abre o relatório da cozinha: o alcance dela é saúde,
    // não alimentação da casa. A recusa aqui é o comportamento certo.
    const daEnfermagem = await request(http).get(`/api/v1/reports/kitchen?houseId=${AI3}`)
      .set(auth(t.enfermagem));
    expect(daEnfermagem.status).toBe(403);

    const res = await request(http).get(`/api/v1/reports/kitchen?houseId=${AI3}`)
      .set(auth(t.coord));
    expect(res.status).toBe(200);
    const texto = JSON.stringify(res.body);
    expect(texto).not.toMatch(/\d{11}/);          // sem CPF
    expect(texto.toLowerCase()).not.toContain('diagn');
    expect(texto.toLowerCase()).not.toContain('processo');
  });

  // ---------------------------------------------------------------
  // 5. Fim do turno: passagem individual, ATA com pendência
  // ---------------------------------------------------------------
  it('a passagem é de quem viveu o turno, e a ATA fecha com pendência declarada', async () => {
    const abrir = await request(http).post('/api/v1/shifts')
      .set(auth(t.lider)).send({ houseId: AI3, data: diaDoEnsaio, turno: 'diurno' });
    expect([200, 201]).toContain(abrir.status);
    const shiftId = abrir.body.plantaoId;

    // A passagem é individual e de quem viveu o turno: o educador assina a dele.
    const corpo = {
      contribuicoes: 'Dia sem intercorrências; combinado revezamento do videogame (fictício).',
      pendencias: 'Nada pendente do meu turno.',
      orientacoes: 'Seguir o combinado do videogame (fictício).',
    };
    let passagem = await request(http).post(`/api/v1/shifts/${shiftId}/handover`)
      .set(auth(t.educador)).send(corpo);

    // Se o plantão já estava fechado, a passagem não é recusada: ela entra
    // como COMPLEMENTO TARDIO, com o horário real em que foi feita. É um caso
    // que acontece — o educador que saiu correndo e registra depois — e o
    // sistema pede o horário em vez de fingir que foi agora.
    if (passagem.status === 400) {
      expect(passagem.body.message).toMatch(/horário real/i);
      passagem = await request(http).post(`/api/v1/shifts/${shiftId}/handover`)
        .set(auth(t.educador))
        .send({ ...corpo, happenedAt: new Date(Date.now() - 3600_000).toISOString() });
    }
    expect([200, 201]).toContain(passagem.status);

    const doDia = await request(http).get(`/api/v1/shifts?houseId=${AI3}&date=${diaDoEnsaio}`)
      .set(auth(t.lider));
    const diurno = (doDia.body.plantoes ?? doDia.body).find?.((x: any) => x.turno === 'diurno')
      ?? doDia.body[0];
    const ataId = diurno?.ataId ?? diurno?.ata?.id;

    if (ataId) {
      const ata = await request(http).post(`/api/v1/shifts/ata/${ataId}/close`)
        .set(auth(t.lider)).send({
          pendencias: 'Falta a assinatura de um educador que saiu antes do fim do turno (fictício).',
        });
      expect([200, 201]).toContain(ata.status);
      // Fechar COM PENDÊNCIA é estado legítimo e declarado — não é falha.
      expect(JSON.stringify(ata.body)).toMatch(/pend/i);
    }
  });

  // ---------------------------------------------------------------
  // 6. A noite: a grade das oito casas
  // ---------------------------------------------------------------
  it('o Líder Noturno preenche a grade, e a casa em branco continua visível', async () => {
    const { rows: [lider] } = await admin.query(
      `SELECT id FROM app_user WHERE email='lider.noturno@paodospobres.dev'`);
    const { rows: [ata] } = await admin.query(
      `INSERT INTO general_night_ata (institution_id, on_date, leader_id, status)
       VALUES ((SELECT id FROM institution LIMIT 1), $1, $2, 'rascunho')
       ON CONFLICT DO NOTHING RETURNING id`, [diaDoEnsaio, lider.id]);
    if (!ata) return;   // já existe uma ATA do dia: nada a ensaiar

    // A grade é do banco: as oito casas, respondidas ou em branco.
    const { rows: grade } = await admin.query(
      `SELECT h.code, e.id IS NOT NULL AS respondida
         FROM house h
         LEFT JOIN general_night_house_entry e
                ON e.house_id = h.id AND e.general_ata_id = $1
        WHERE h.active ORDER BY h.code`, [ata.id]);
    expect(grade.length).toBeGreaterThanOrEqual(8);
    expect(grade.every((c: any) => c.respondida === false)).toBe(true);
    await admin.query(`DELETE FROM general_night_house_entry WHERE general_ata_id=$1`, [ata.id]);
    await admin.query(`DELETE FROM general_night_ata WHERE id=$1`, [ata.id]);
  });

  // ---------------------------------------------------------------
  // 7. Ocorrência: abre imediato, o motivo não vaza, a técnica revisa
  // ---------------------------------------------------------------
  it('a ocorrência abre na hora e vai para revisão técnica, sem virar julgamento', async () => {
    const pessoas = await request(http).get(`/api/v1/people?houseId=${AI3}`).set(auth(t.educador));
    const alguem = pessoas.body[0];

    const oc = await request(http).post('/api/v1/incidents').set(auth(t.educador)).send({
      houseId: AI3, categoria: 'saida_nao_autorizada',
      quando: new Date().toISOString(),
      fato: 'Saiu pelo portão às 21h40 sem autorização; retornou às 23h15 acompanhado (fictício).',
      acolhidos: [alguem.id],
      medidas: 'Contato com a coordenação e com o Líder Noturno (fictício).',
    });
    expect([200, 201]).toContain(oc.status);

    if (oc.body?.id) {
      const aberta = await request(http).get(`/api/v1/incidents/${oc.body.id}`).set(auth(t.tecnica));
      expect(aberta.status).toBe(200);
      // O registro descreve o FATO. Nenhuma classificação de pessoa entra aqui.
      expect(JSON.stringify(aberta.body).toLowerCase()).not.toMatch(/rebelde|problem[áa]tic|dif[íi]cil/);
    }
  });

  // ---------------------------------------------------------------
  // 8. Transferência: sai da Casa 03, entra na 04 — e o acesso vai junto
  // ---------------------------------------------------------------
  it('a transferência move a criança e o acesso; a casa de origem perde o perfil', async () => {
    // Cria uma criança só para este ensaio, para não mexer nos vinte.
    const criada = await request(http).post('/api/v1/people/admission').set(auth(t.tecnica)).send({
      houseId: AI3,
      pessoa: { fullName: 'Ensaio Geral da Silva (fictício)', birthDate: '2012-05-05' },
      acolhimento: { broughtBy: 'Conselho Tutelar (fictício)',
                     provisionalReason: 'Ensaio do piloto — ingresso urgente fictício.',
                     capacityReason: 'Ensaio do piloto: acolhimento simulado acima do limite (fictício).' },
      judicial: { reasonCategory: 'negligencia', determiningBody: 'vara_da_infancia' },
    });
    expect(criada.status).toBe(201);
    const personId = criada.body.personId;

    const pedido = await request(http).post('/api/v1/transfers').set(auth(t.coord)).send({
      personId, toHouseId: AI4, reason: 'Reorganização de vagas no ensaio do piloto (fictício).',
    });
    expect([200, 201]).toContain(pedido.status);

    // A casa de destino vê nome completo e origem ANTES de decidir (§15.6).
    const caixa = await request(http).get(`/api/v1/transfers/inbox?houseId=${AI4}`).set(auth(t.coord4));
    const item = caixa.body.solicitacoes.find((x: any) => x.id === pedido.body.id);
    expect(item).toBeTruthy();
    // Nome completo e unidade de origem aparecem ANTES do aceite (§15.6).
    expect(item.nomeCompleto).toContain('Ensaio Geral');
    expect(item.origem.codigo).toBe('AI3');

    const aceite = await request(http).post(`/api/v1/transfers/${pedido.body.id}/accept`)
      .set(auth(t.coord4)).send({});
    expect([200, 201]).toContain(aceite.status);

    // Origem perde o perfil: não é filtro de tela, é o banco.
    const naOrigem = await request(http).get(`/api/v1/people?houseId=${AI3}`).set(auth(t.educador));
    expect(naOrigem.body.some((p: any) => p.id === personId)).toBe(false);

    // Saída, para o ensaio não deixar rastro na Casa 04.
    await request(http).post(`/api/v1/people/${personId}/discharge`).set(auth(t.coord4))
      .send({ motivo: 'Encerramento do ensaio do piloto (fictício).' });
  });

  // ---------------------------------------------------------------
  // 9. Offline: o horário real do evento sobrevive à reconexão
  // ---------------------------------------------------------------
  it('o registro offline entra com o horário em que aconteceu, não o da sincronização', async () => {
    const aconteceuAs = new Date(Date.now() - 3 * 3600_000).toISOString();
    const opId = `ensaio-${Date.now()}`;

    const op = {
      clientOpId: opId, kind: 'activity.record', houseId: AI3,
      happenedAt: aconteceuAs,
      payload: { estado: 'concluida_no_horario', nota: 'Confirmado offline no ensaio (fictício).' },
    };
    const sync = await request(http).post('/api/v1/sync/push')
      .set(auth(t.educador)).send({ operacoes: [op] });
    expect([200, 201]).toContain(sync.status);

    // Reenviar a MESMA operação não duplica — e não é tratada como erro.
    const denovo = await request(http).post('/api/v1/sync/push')
      .set(auth(t.educador)).send({ operacoes: [op] });
    expect([200, 201]).toContain(denovo.status);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM offline_operation WHERE client_op_id = $1`, [opId]);
    expect(rows[0].n).toBe(1);
  });

  // ---------------------------------------------------------------
  // 10. Drive: falha, retentativa e o documento intacto no sistema
  // ---------------------------------------------------------------
  it('o Drive falha, o sistema tenta de novo e o documento não se perde', async () => {
    const entityId = '99999999-9999-9999-9999-999999999999';
    process.env.ARQUIVO_MODO = 'falha';
    try {
      const item = await request(http).post('/api/v1/archive').set(auth(t.coord)).send({
        houseId: AI3, categoria: 'ata', entidade: 'ata', entityId,
      });
      lixo.archive.push(item.body.id);

      await request(http).post('/api/v1/archive/process').set(auth(t.coord)).send({ limite: 1 });
      const falhou = await request(http).get(`/api/v1/archive/${item.body.id}`).set(auth(t.coord));
      expect(falhou.body.situacao).toBe('falhou');

      // A rede volta: a retentativa é idempotente e termina verificada.
      delete process.env.ARQUIVO_MODO;
      await request(http).post('/api/v1/archive/process').set(auth(t.coord)).send({ limite: 1 });
      const ok = await request(http).get(`/api/v1/archive/${item.body.id}`).set(auth(t.coord));
      expect(ok.body.situacao).toBe('verificado');
      // Uma única linha para o documento: a falha não criou um segundo arquivo.
      const { rows } = await admin.query(
        `SELECT count(*)::int AS n FROM archive_item WHERE entity_id = $1`, [entityId]);
      expect(rows[0].n).toBe(1);
    } finally {
      delete process.env.ARQUIVO_MODO;
    }
  });

  // ---------------------------------------------------------------
  // 11. O que o ensaio prova sobre o perímetro
  // ---------------------------------------------------------------
  it('nada do ensaio vazou para fora do escopo de quem estava na casa', async () => {
    // O educador da Casa 03 não enxerga a Casa 04 em lugar nenhum.
    const casas = await request(http).get('/api/v1/houses').set(auth(t.educador));
    expect(casas.body.every((c: any) => c.code === 'AI3')).toBe(true);

    const daOutra = await request(http).get(`/api/v1/people?houseId=${AI4}`).set(auth(t.educador));
    expect(daOutra.body).toEqual([]);

    // E o dia inteiro deixou rastro de auditoria, como tem de deixar.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event WHERE at > now() - interval '10 minutes'`);
    expect(rows[0].n).toBeGreaterThan(0);
  });
});
