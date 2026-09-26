/**
 * O ARMÁRIO DIZ A VERDADE, E A NOTA PRESTA CONTAS (fase 161).
 *
 * Decisões do humano em 26/09, e o que esta suíte cobra de cada uma:
 *
 *  1. SALDO NEGATIVO, COM AVISO — a dose dada com o armário em zero deixava o
 *     saldo em 0 e o histórico com o consumo: duas contas que discordavam sem
 *     ninguém saber. Agora o saldo desce abaixo de zero e a tela pede a
 *     contagem. A dose nunca é bloqueada.
 *  2. A NOTA É SEPARADA DO ARMÁRIO — lançar a nota não dá entrada em nada.
 *  3. NOTA REPETIDA É RECUSADA — mesmo CNPJ e mesmo número, na mesma casa.
 *
 * E o que o inventário achou: a política de INSERT do movimento era
 * `WITH CHECK (true)` — a chave estrangeira não confere alcance (146).
 *
 * Fixture próprio (criança, prescrição e remédio com nome desta rodada): a
 * suíte mexe em saldo e não pode contaminar as outras.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
/* Um PNG de 1×1, fictício — a nota "digitalizada" desta suíte. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==';
const CNPJ = '11222333000181';

describe('O armário diz a verdade', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const rodada = Date.now().toString(36);
  const remedio = `Remédio da Conferência 161 ${rodada} (fictício)`;
  let hoje = '', ontem = '', inicioDoMes = '';

  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const saldo = async () => Number((await admin.query(
    `SELECT quantity FROM medication_stock WHERE id = $1`, [ids.estoque])).rows[0].quantity);

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
      enfermagem: 'enfermagem@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev', educador: 'educador.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ id: ids.coord4 }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='coord.ai4@paodospobres.dev'`));
    ({ rows: [{ hoje, ontem }] } = await admin.query(
      `SELECT app_hoje()::text AS hoje, (app_hoje() - 1)::text AS ontem`));
    inicioDoMes = `${hoje.slice(0, 7)}-01`;

    const p = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: ids.AI3, fullName: 'Criança da Conferência 161 (fictícia)', socialName: 'Cria161',
              birthDate: '2014-05-10', provisionalReason: 'Ingresso de teste automatizado — dados fictícios' });
    expect(p.status).toBe(201);
    ids.crianca = p.body.personId;

    const pr = await request(http).post('/api/v1/medications/prescriptions').set(auth(tokens.enfermagem))
      .send({ personId: ids.crianca, houseId: ids.AI3, tipo: 'uso_continuo', medicamento: remedio,
              dose: '1 comprimido', via: 'oral', horarios: ['06:00'], prescritor: 'Clínica (fictícia)',
              inicio: ontem });
    expect(pr.status).toBe(201);
    await request(http).post(`/api/v1/medications/prescriptions/${pr.body.id}/sign`)
      .set(auth(tokens.enfermagem)).send({});
    await request(http).post('/api/v1/medications/generate-doses')
      .set(auth(tokens.enfermagem)).send({ houseId: ids.AI3, date: ontem });

    /* O armário comum da casa, com ZERO do remédio: a caixa que ninguém lançou. */
    ({ rows: [{ id: ids.estoque }] } = await admin.query(
      `INSERT INTO medication_stock (house_id, person_id, medication, quantity, unit)
       VALUES ($1, NULL, $2, 0, 'comprimido') RETURNING id`, [ids.AI3, remedio]));
  });

  afterAll(async () => {
    await request(http).post(`/api/v1/people/${ids.crianca}/discharge`)
      .set(auth(tokens.tecnica)).send({ motivo: 'Encerramento de fixture de teste' });
    await app.close(); await admin.end();
  });

  // ============ 1. O saldo verdadeiro ============

  it('a dose dada com o armário em zero NÃO é bloqueada, e o saldo fica negativo', async () => {
    const { rows: [dose] } = await admin.query(
      `SELECT id FROM medication_administration WHERE person_id = $1 AND administered_by IS NULL LIMIT 1`,
      [ids.crianca]);
    const r = await request(http).post(`/api/v1/medications/doses/${dose.id}/confirm`)
      .set(auth(tokens.enfermagem)).send({ estado: 'administrado_no_horario' });
    expect(r.status).toBe(201);
    expect(await saldo()).toBe(-1);
  });

  it('a tela recebe o aviso de conferir, e o histórico tem o consumo', async () => {
    const r = await request(http).get(`/api/v1/medications/stock?houseId=${ids.AI3}`).set(auth(tokens.coord));
    const item = r.body.find((i: any) => i.id === ids.estoque);
    expect(item.quantidade).toBe(-1);
    expect(item.saldoNegativo).toBe(true);
    expect(item.aviso).toMatch(/conferir o armário/);
    const m = await request(http).get(`/api/v1/medications/stock/${ids.estoque}/movements`)
      .set(auth(tokens.coord));
    expect(m.body.linhas.some((l: any) => l.tipo === 'consumo')).toBe(true);
  });

  it('a contagem traz o saldo de volta, e o aviso some', async () => {
    const r = await request(http).post('/api/v1/medications/stock').set(auth(tokens.enfermagem))
      .send({ tipo: 'contagem', houseId: ids.AI3, medicamento: remedio, quantidade: 0,
              motivo: 'Conferência: a caixa que chegou ontem não tinha sido lançada.' });
    expect(r.status).toBe(201);
    expect(r.body.diferenca).toBe(1);
    const g = await request(http).get(`/api/v1/medications/stock?houseId=${ids.AI3}`).set(auth(tokens.coord));
    expect(g.body.find((i: any) => i.id === ids.estoque).saldoNegativo).toBe(false);
  });

  // ============ 2. Entrada com lote e origem; saída com motivo ============

  it('a entrada guarda de onde veio, o lote e a validade', async () => {
    const ruim = await request(http).post('/api/v1/medications/stock').set(auth(tokens.enfermagem))
      .send({ tipo: 'entrada', houseId: ids.AI3, medicamento: remedio, quantidade: 5, origem: 'mercado' });
    expect(ruim.status).toBe(400);
    const r = await request(http).post('/api/v1/medications/stock').set(auth(tokens.enfermagem))
      .send({ tipo: 'entrada', houseId: ids.AI3, medicamento: remedio, quantidade: 10,
              origem: 'farmacia_publica', lote: 'LT161', validade: '2027-08-31' });
    expect(r.status).toBe(201);
    expect(await saldo()).toBe(10);
    /* Lido como OUTRO cargo (lição da 152): o nome de quem lançou chega. */
    const m = await request(http).get(`/api/v1/medications/stock/${ids.estoque}/movements`)
      .set(auth(tokens.tecnica));
    const e = m.body.linhas.find((l: any) => l.tipo === 'entrada');
    expect(e).toMatchObject({ lote: 'LT161', validadeDoLote: '2027-08-31', origem: 'Farmácia pública (SUS)' });
    expect(e.por).toBeTruthy();
  });

  it('perda, descarte e devolução: cada uma com o seu nome e o seu motivo', async () => {
    const semMotivo = await request(http).post(`/api/v1/medications/stock/${ids.estoque}/saida`)
      .set(auth(tokens.enfermagem)).send({ tipo: 'perda', quantidade: 1, motivo: 'caiu' });
    expect(semMotivo.status).toBe(400);
    const tipoRuim = await request(http).post(`/api/v1/medications/stock/${ids.estoque}/saida`)
      .set(auth(tokens.enfermagem)).send({ tipo: 'sumiu', quantidade: 1, motivo: 'Não sei onde foi parar.' });
    expect(tipoRuim.status).toBe(400);
    const demais = await request(http).post(`/api/v1/medications/stock/${ids.estoque}/saida`)
      .set(auth(tokens.enfermagem)).send({ tipo: 'descarte', quantidade: 50, motivo: 'Descarte do lote inteiro.' });
    expect(demais.status).toBe(400);
    expect(demais.body.message).toMatch(/Faça a contagem antes/);

    const perda = await request(http).post(`/api/v1/medications/stock/${ids.estoque}/saida`)
      .set(auth(tokens.enfermagem)).send({ tipo: 'perda', quantidade: 2, motivo: 'A cartela caiu na pia e molhou.' });
    expect(perda.status).toBe(201);
    const dev = await request(http).post(`/api/v1/medications/stock/${ids.estoque}/saida`)
      .set(auth(tokens.enfermagem)).send({ tipo: 'devolucao', quantidade: 1, motivo: 'Devolvido à UBS: sobra do tratamento.' });
    expect(dev.status).toBe(201);
    expect(await saldo()).toBe(7);

    const { rows } = await admin.query(
      `SELECT action, house_id FROM audit_event WHERE entity_id = $1 AND action IN ('stock.perda','stock.devolucao')`,
      [ids.estoque]);
    expect(rows.map((x: any) => x.action).sort()).toEqual(['stock.devolucao', 'stock.perda']);
    expect(rows.every((x: any) => x.house_id === ids.AI3)).toBe(true);
  });

  it('o educador não tira do armário, e a coordenação de outra casa não acha o item', async () => {
    const e = await request(http).post(`/api/v1/medications/stock/${ids.estoque}/saida`)
      .set(auth(tokens.educador)).send({ tipo: 'perda', quantidade: 1, motivo: 'Tentativa do educador.' });
    expect(e.status).toBe(403);
    const f = await request(http).post(`/api/v1/medications/stock/${ids.estoque}/saida`)
      .set(auth(tokens.coord4)).send({ tipo: 'perda', quantidade: 1, motivo: 'Tentativa de outra casa.' });
    expect(f.status).toBe(404);
    expect(await saldo()).toBe(7);
  });

  it('o movimento não se escreve no armário de outra casa nem por consulta direta', async () => {
    /* A política era `WITH CHECK (true)`: a chave estrangeira confere que o
       item existe, não que ele é seu (146). */
    await admin.query('BEGIN');
    let erro: any = null;
    try {
      await admin.query('SET LOCAL ROLE rede_app');
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [ids.coord4]);
      await admin.query(
        `INSERT INTO medication_stock_movement (stock_id, kind, quantity, reason)
         VALUES ($1, 'ajuste', -3, 'escrita de outra casa')`, [ids.estoque]);
    } catch (e) { erro = e; } finally { await admin.query('ROLLBACK'); }
    expect(erro?.code).toBe('42501');
  });

  // ============ 3. A nota fiscal ============

  it('CNPJ que não confere é recusado', async () => {
    const r = await request(http).post('/api/v1/medications/purchases').set(auth(tokens.enfermagem))
      .send({ houseId: ids.AI3, em: hoje, cnpj: '11.222.333/0001-82', nota: `N${rodada}`,
              itensDaNota: [{ medicamento: remedio, quantidade: 1 }] });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/CNPJ não confere/);
  });

  it('a nota com itens entra, o total sai da soma, e o armário NÃO muda', async () => {
    const antes = await saldo();
    const r = await request(http).post('/api/v1/medications/purchases').set(auth(tokens.enfermagem))
      .send({ houseId: ids.AI3, em: hoje, fornecedor: 'Farmácia Fictícia 161', cnpj: '11.222.333/0001-81',
              nota: `N${rodada}`, conteudo: PNG, anexoNome: 'nota.png',
              itensDaNota: [
                { medicamento: remedio, quantidade: 2, unidade: 'caixa', valorUnitarioCentavos: 1250,
                  lote: 'LT161', validade: '2027-08-31' },
                { medicamento: 'Soro fisiológico (fictício)', quantidade: 3, valorUnitarioCentavos: 400 },
              ] });
    expect(r.status).toBe(201);
    expect(r.body.totalDosItensCentavos).toBe(3700);
    expect(await saldo()).toBe(antes);

    const l = await request(http).get(
      `/api/v1/medications/purchases?houseId=${ids.AI3}&de=${inicioDoMes}&ate=${hoje}`).set(auth(tokens.coord));
    const nota = l.body.linhas.find((x: any) => x.nota === `N${rodada}`);
    expect(nota.totalCentavos).toBe(3700);
    expect(nota.cnpj).toBe('11.222.333/0001-81');
    expect(nota.itensDaNota).toHaveLength(2);
    expect(nota.itensDaNota[0]).toMatchObject({ lote: 'LT161', validade: '2027-08-31', valorUnitarioCentavos: 1250 });
    expect(nota.compradoPor).toBeTruthy();
  });

  it('a mesma nota não entra duas vezes — e a recusa diz quando entrou', async () => {
    const r = await request(http).post('/api/v1/medications/purchases').set(auth(tokens.tecnica))
      .send({ houseId: ids.AI3, em: hoje, cnpj: CNPJ, nota: ` n${rodada} `, itens: 'A mesma nota de novo.' });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/já foi lançada em \d{2}\/\d{2}\/\d{4}/);
  });

  it('o mesmo número noutra casa é outra nota', async () => {
    const r = await request(http).post('/api/v1/medications/purchases').set(auth(tokens.coord4))
      .send({ houseId: ids.AI4, em: hoje, cnpj: CNPJ, nota: `N${rodada}`, itens: 'Compra da Casa 04.' });
    expect(r.status).toBe(201);
  });

  it('a soma dos itens diferente do total AVISA, e não recusa', async () => {
    const r = await request(http).post('/api/v1/medications/purchases').set(auth(tokens.enfermagem))
      .send({ houseId: ids.AI3, em: hoje, cnpj: CNPJ, nota: `F${rodada}`, totalCentavos: 1500,
              itensDaNota: [{ medicamento: remedio, quantidade: 1, valorUnitarioCentavos: 1000 }] });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/frete/);
  });

  // ============ 4. Métricas e relatórios ============

  it('as métricas são da CASA, com os remédios em ordem alfabética', async () => {
    const r = await request(http).get(
      `/api/v1/medications/metrics?houseId=${ids.AI3}&de=${ontem}&ate=${hoje}`).set(auth(tokens.enfermagem));
    expect(r.status).toBe(200);
    expect(r.body.doses.administradas).toBeGreaterThanOrEqual(1);
    const nomes = r.body.porRemedio.map((x: any) => x.remedio);
    expect([...nomes].sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'))).toEqual(nomes);
    const meu = r.body.porRemedio.find((x: any) => x.remedio === remedio);
    expect(meu).toMatchObject({ entrada: 10, consumo: 1, perda: 2, devolucao: 1 });
    expect(r.body.compras.notas).toBeGreaterThanOrEqual(2);
    expect(r.body.aviso).toMatch(/nunca de uma criança/);
    /* Nenhuma chave com cara de criança ou de pessoa. */
    expect(JSON.stringify(r.body)).not.toMatch(/acolhido"|personId|administeredBy|porPessoa/);
  });

  it('o educador não lê as métricas, e a outra casa não lê as desta', async () => {
    const e = await request(http).get(`/api/v1/medications/metrics?houseId=${ids.AI3}`).set(auth(tokens.educador));
    expect(e.status).toBe(403);
    const f = await request(http).get(`/api/v1/medications/metrics?houseId=${ids.AI3}`).set(auth(tokens.coord4));
    expect(f.status).toBe(404);
  });

  it('o relatório do armário e o das notas saem em Word, com a imagem da nota e a casa na auditoria', async () => {
    const a = await request(http).post('/api/v1/medications/stock/report/export').set(auth(tokens.enfermagem))
      .send({ houseId: ids.AI3, de: ontem, ate: hoje, finalidade: 'Prestação de contas do mês de teste.' });
    expect([a.status, a.body.message]).toEqual([201, undefined]);
    const n = await request(http).post('/api/v1/medications/purchases/export').set(auth(tokens.coord))
      .send({ houseId: ids.AI3, de: inicioDoMes, ate: hoje, finalidade: 'Prestação de contas do mês de teste.' });
    expect([n.status, n.body.message]).toEqual([201, undefined]);
    /* O Word é um zip: a imagem da nota mora em word/media. */
    expect(Buffer.from(n.body.conteudoBase64, 'base64').toString('latin1')).toMatch(/word\/media\//);
    const { rows } = await admin.query(
      `SELECT DISTINCT entity, house_id FROM audit_event
        WHERE entity IN ('medication_stock_report','medication_purchase_report') AND at > now() - interval '5 minutes'`);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((x: any) => x.house_id === ids.AI3)).toBe(true);
    const lixo = await request(http).post('/api/v1/medications/purchases/export').set(auth(tokens.coord))
      .send({ houseId: 'lixo', finalidade: 'Prestação de contas do mês de teste.' });
    expect(lixo.status).toBe(400);
  });
});
