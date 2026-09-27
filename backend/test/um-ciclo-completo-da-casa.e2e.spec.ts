/**
 * UM CICLO COMPLETO DA CASA 03, EM VÁRIOS DIAS (fase 166).
 *
 * Pedido de 25/09, seções 3 e 38: *"não teste apenas função por função;
 * simule vários dias consecutivos da Casa 03, trabalhe como aquela pessoa
 * trabalharia de verdade"*, e no fim *"verifique se os valores e informações
 * dos relatórios batem exatamente com os eventos simulados"*.
 *
 * O ciclo, pelas rotas de verdade e com o cargo de quem faz cada coisa:
 *
 *   dia 1 (há 12 dias) — o plantão diurno e o noturno abrem; a equipe escreve
 *     na ATA; o almoço é registrado, com a criança de restrição alimentar em
 *     dieta adaptada; a Asafe é internada à tarde e sai da rotina; o educador
 *     designado registra do hospital, com a foto de um documento;
 *   dia 2 — a dose das 06:00 é dada e desconta do armário; outro educador
 *     assume o hospital; a Asafe tem alta e volta à rotina;
 *   hoje — a visita da madrinha entra e sai pela portaria; a cozinha recebe o
 *     lanche de todos e a cesta de uma; a observação restrita da ATA é pedida,
 *     liberada pela técnica, e só então lida.
 *
 * E a virada dos turnos pela regra de 25/09: 20:00 ainda é diurno, 20:01 já é
 * noturno do mesmo dia, 06:00 e 07:59 são do noturno anterior, 08:00 abre o
 * diurno seguinte.
 *
 * As crianças são desta suíte, cadastradas e desligadas por ela: a Casa 03 é
 * contada por meia dúzia de outras suítes (regra 13). O banco não volta no
 * tempo, então o "dia 1" é uma data no passado, e o que só acontece no
 * instante presente (a portaria, a cozinha) acontece hoje.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** PNG 1x1 inteiro: a "foto do documento" tirada no hospital. */
const FOTO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==';

describe('Um ciclo completo da Casa 03', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const rodada = Date.now().toString(36);
  const REMEDIO = `Sulfato ferroso da simulação ${rodada} (fictício)`;
  const ALMOCO = `Almoço da simulação ${rodada}`;
  let D1 = '', D2 = '', HOJE = '';

  const login = async (email: string, senha = SENHA) => {
    const r = await request(http).post('/api/v1/auth/login').send({ email, password: senha });
    if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
    return r.body.token as string;
  };
  const auth = (tk: string) => ({ Authorization: `Bearer ${tk}` });
  const post = (tk: string, rota: string, corpo: any = {}) =>
    request(http).post(`/api/v1${rota}`).set(auth(tk)).send(corpo);
  const get = (tk: string, rota: string) => request(http).get(`/api/v1${rota}`).set(auth(tk));
  /** Um instante na hora de Porto Alegre. */
  const em = (dia: string, hhmm: string) => `${dia}T${hhmm}:00-03:00`;

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
      educador: 'educador.ai3@paodospobres.dev', educador2: 'educador2.ai3@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev', enfermagem: 'enfermagem@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
    })) t[k] = await login(email);
    for (const k of ['educador', 'educador2']) {
      ({ rows: [{ id: ids[k] }] } = await admin.query(
        `SELECT id FROM app_user WHERE email = $1`, [`${k}.ai3@paodospobres.dev`]));
    }
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ d1: D1, d2: D2, hoje: HOJE }] } = await admin.query(
      `SELECT (app_hoje()-12)::text AS d1, (app_hoje()-11)::text AS d2, app_hoje()::text AS hoje`));
  });

  afterAll(async () => {
    /* Nada se apaga: as crianças da simulação são desligadas, com motivo, e
       saem das contagens da casa. */
    for (const k of ['alice', 'asafe', 'clara']) {
      if (ids[k]) {
        await post(t.tecnica, `/people/${ids[k]}/discharge`,
          { motivo: 'Encerramento da simulação de ciclo completo (dados fictícios).' });
      }
    }
    if (ids.portaria) {
      await post(t.coord, `/staff/${ids.portaria}/deactivate`,
        { motivo: 'Conta fictícia da simulação de ciclo completo.' });
    }
    await app.close(); await admin.end();
  });

  // ==================================================== a preparação

  it('a técnica cadastra as três crianças do ciclo, com restrição, prescrição e visitante', async () => {
    for (const [k, nome, social] of [
      ['alice', 'Alice da Simulação (fictícia)', 'Alice Sim'],
      ['asafe', 'Asafe da Simulação (fictício)', 'Asafe Sim'],
      ['clara', 'Clara da Simulação (fictícia)', 'Clara Sim'],
    ]) {
      const r = await post(t.tecnica, '/people', {
        houseId: ids.AI3, fullName: nome, socialName: social, birthDate: '2015-03-10',
        provisionalReason: 'Ingresso de teste automatizado, dados fictícios' });
      expect(r.status).toBe(201);
      ids[k] = r.body.personId;
    }

    /* A restrição da Alice: é o que o almoço tem de respeitar. */
    const rest = await post(t.tecnica, `/people/${ids.alice}/food-restrictions`, {
      restricao: 'Leite e derivados', substituicao: 'Bebida vegetal',
      orientacao: 'Oferecer o leite sem lactose da despensa' });
    expect(rest.status).toBe(201);
    /* E a alergia do Asafe, pela Enfermagem, como alerta essencial. */
    const alergia = await post(t.enfermagem, `/people/${ids.asafe}/health-conditions`, {
      tipo: 'alergia', descricao: 'dipirona', gravidade: 'grave', alertaEssencial: true });
    expect(alergia.status).toBe(201);

    /* A prescrição da Clara, com dose às 06:00. */
    const pr = await post(t.enfermagem, '/medications/prescriptions', {
      personId: ids.clara, houseId: ids.AI3, tipo: 'uso_continuo', medicamento: REMEDIO,
      dose: '1 comprimido', via: 'oral', horarios: ['06:00'], prescritor: 'UBS (fictícia)', inicio: D1 });
    expect(pr.status).toBe(201);
    expect((await post(t.enfermagem, `/medications/prescriptions/${pr.body.id}/sign`)).status).toBe(201);

    /* A madrinha da Clara, autorizada a visitar todos os dias. */
    const c = await post(t.tecnica, `/people/${ids.clara}/contacts`, {
      nome: 'Madrinha da Simulação (fictícia)', vinculo: 'madrinha', telefone: '51 90000-1666' });
    expect(c.status).toBe(201);
    ids.madrinha = c.body.id ?? c.body.contatoId;
    const v = await post(t.tecnica, `/people/contacts/${ids.madrinha}/visit`,
      { autorizado: true, dias: [0, 1, 2, 3, 4, 5, 6], de: '00:00', ate: '23:59' });
    expect(v.status).toBe(201);
  });

  it('a nota fiscal é lançada e o remédio entra no armário, com lote e origem', async () => {
    const nf = await post(t.enfermagem, '/medications/purchases', {
      houseId: ids.AI3, em: D1, fornecedor: 'Farmácia da Simulação (fictícia)', cnpj: '11.222.333/0001-81',
      nota: `SIM-${rodada}`, itensDaNota: [{ medicamento: REMEDIO, quantidade: 1, unidade: 'caixa',
        valorUnitarioCentavos: 1890, lote: `L${rodada}`, validade: '2027-12-31' }] });
    expect(nf.status).toBe(201);
    /* A nota é do GASTO e o armário é outro registro (decisão de 26/09): a
       caixa de 30 comprimidos entra pelo armário. */
    const ent = await post(t.enfermagem, '/medications/stock', {
      tipo: 'entrada', houseId: ids.AI3, medicamento: REMEDIO, quantidade: 30,
      origem: 'compra', lote: `L${rodada}`, validade: '2027-12-31' });
    expect(ent.status).toBe(201);
  });

  // ==================================================== dia 1

  it('dia 1: o plantão diurno e o noturno abrem, e a equipe escreve na ATA de cada um', async () => {
    for (const turno of ['diurno', 'noturno']) {
      const r = await post(t.lider, '/shifts', { houseId: ids.AI3, data: D1, turno });
      expect(r.status).toBe(201);
      ids[`plantao_${turno}`] = r.body.plantaoId;
      ids[`ata_${turno}`] = r.body.ataId;
    }
    expect((await post(t.educador, `/shifts/ata/${ids.ata_diurno}/notes`,
      { texto: `Recebi o plantão às 08:00; almoço servido com a dieta da Alice (${rodada}).` })).status).toBe(201);
    expect((await post(t.educador2, `/shifts/ata/${ids.ata_noturno}/notes`,
      { texto: `Noite tranquila; a Clara acordou às 06:00 para o remédio (${rodada}).` })).status).toBe(201);
    /* A observação restrita, que o educador só vai ler com autorização. */
    expect((await post(t.tecnica, `/shifts/ata/${ids.ata_noturno}/notes`,
      { texto: `Contato do Conselho Tutelar sobre a Clara (${rodada}).`, restrita: true })).status).toBe(201);
  });

  it('dia 1: o almoço é registrado, e a Alice come em dieta adaptada', async () => {
    const k = await post(t.educador, '/checks', {
      houseId: ids.AI3, kind: 'alimentacao', titulo: ALMOCO, referenceAt: em(D1, '12:00') });
    expect(k.status).toBe(201);
    ids.almoco = k.body.checkId ?? k.body.check_id ?? k.body.id;
    for (const [crianca, opcao] of [['alice', 'dieta_adaptada'], ['asafe', 'normal'], ['clara', 'normal']]) {
      const m = await post(t.educador, `/checks/${ids.almoco}/mark`, { personId: ids[crianca], opcao });
      expect(m.status).toBe(201);
    }
  });

  it('dia 1: a Asafe é internada à tarde e sai da rotina da casa', async () => {
    const r = await post(t.tecnica, '/nursing/hospitalizations', {
      personId: ids.asafe, houseId: ids.AI3, hospital: 'Hospital da Simulação (fictício)',
      motivo: 'Febre alta e desidratação (fictícias), em observação.', desde: em(D1, '14:30') });
    expect(r.status).toBe(201);
    ids.internacao = r.body.id;
    const { rows: [x] } = await admin.query(
      `SELECT app_esta_internado($1, $2::date) AS d1, app_esta_internado($1, $3::date) AS antes`,
      [ids.asafe, D1, D2]);
    expect(x.d1).toBe(true);
    expect(x.antes).toBe(true);
  });

  it('dia 1: o educador designado registra do hospital pelo celular, com a foto de um documento', async () => {
    expect((await post(t.tecnica, `/nursing/hospitalizations/${ids.internacao}/companion`,
      { userId: ids.educador, de: D1 })).status).toBe(201);
    const nota = await post(t.educador, `/nursing/hospitalizations/${ids.internacao}/notes`, {
      dia: D1, tipo: 'relato', texto: 'Chegamos às 15h; soro na veia, dormiu à noite.',
      conteudo: FOTO, nomeArquivo: 'receita-do-plantao.png', categoria: 'receita' });
    expect(nota.status).toBe(201);
    /* O que ele enviou abre de volta, como entrou. */
    const lido = await get(t.educador, `/nursing/hospitalizations/${ids.internacao}/notes/${nota.body.id}/anexo`);
    expect(lido.status).toBe(200);
    expect(lido.body.conteudo).toBe(FOTO);
  });

  // ==================================================== a virada dos turnos

  it('a virada: 20:00 é diurno, 20:01 é noturno do mesmo dia, 06:00 e 07:59 são da noite anterior, 08:00 abre o dia', async () => {
    const turno = async (instante: string) => {
      const { rows: [r] } = await admin.query(
        `SELECT dia::text, periodo FROM app_turno_de($1, $2::timestamptz)`, [ids.AI3, instante]);
      return `${r.dia} ${r.periodo}`;
    };
    expect(await turno(em(D1, '08:00'))).toBe(`${D1} diurno`);
    expect(await turno(em(D1, '20:00'))).toBe(`${D1} diurno`);
    expect(await turno(em(D1, '20:01'))).toBe(`${D1} noturno`);
    expect(await turno(em(D2, '06:00'))).toBe(`${D1} noturno`);
    expect(await turno(em(D2, '07:59'))).toBe(`${D1} noturno`);
    expect(await turno(em(D2, '08:00'))).toBe(`${D2} diurno`);
  });

  // ==================================================== dia 2

  it('dia 2: a dose das 06:00 é dada e desconta um comprimido do armário', async () => {
    const g = await post(t.enfermagem, '/medications/generate-doses', { houseId: ids.AI3, date: D2 });
    expect([g.status, g.body]).toEqual([201, expect.anything()]);
    const { rows: [dose] } = await admin.query(
      `SELECT id, (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::time::text AS hora
         FROM medication_administration WHERE person_id = $1
          AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date`, [ids.clara, D2]);
    expect(dose.hora).toBe('06:00:00');
    const c = await post(t.educador2, `/medications/doses/${dose.id}/confirm`, { estado: 'administrado_no_horario' });
    expect(c.status).toBe(201);
    const { rows: [s] } = await admin.query(
      `SELECT quantity::int AS q FROM medication_stock WHERE house_id = $1 AND medication = $2`, [ids.AI3, REMEDIO]);
    expect(s.q).toBe(29);
  });

  it('dia 2: outro educador assume o hospital, e a Asafe tem alta e volta à rotina', async () => {
    expect((await post(t.coord, `/nursing/hospitalizations/${ids.internacao}/companion`,
      { userId: ids.educador2, de: D2 })).status).toBe(201);
    expect((await post(t.educador2, `/nursing/hospitalizations/${ids.internacao}/notes`,
      { dia: D2, tipo: 'retorno_medico', texto: 'Médico liberou a alta; seguir com hidratação em casa.' })).status)
      .toBe(201);
    expect((await post(t.tecnica, `/nursing/hospitalizations/${ids.internacao}/close`,
      { desfecho: 'alta', ate: em(D2, '16:00'), observacao: 'Alta com orientação de hidratação.' })).status)
      .toBe(201);
    const { rows: [x] } = await admin.query(
      `SELECT app_esta_internado($1, $2::date) AS d2, app_esta_internado($1, app_hoje()) AS hoje`,
      [ids.asafe, D2]);
    /* O dia da alta é dia de casa. */
    expect(x).toEqual({ d2: false, hoje: false });
  });

  // ==================================================== hoje

  it('hoje: a madrinha entra e sai pela portaria, com o documento conferido', async () => {
    const email = `portaria.sim.${rodada}@paodospobres.dev`;
    const p = await post(t.coord, '/staff', { nome: 'Portaria da Simulação (fictícia)', email,
      cargo: 'portaria', casaId: ids.AI3, senhaInicial: 'senha-da-portaria' });
    expect(p.status).toBe(201);
    ids.portaria = p.body.id;
    t.portaria = await login(email, 'senha-da-portaria');
    const lista = await get(t.portaria, `/people/portaria/hoje?houseId=${ids.AI3}`);
    expect(lista.body.visitantes.some((v: any) => v.contatoId === ids.madrinha)).toBe(true);
    const e = await post(t.portaria, '/people/portaria/visitas', { contatoId: ids.madrinha, documento: 'RG' });
    expect(e.status).toBe(201);
    ids.visita = e.body.id;
    expect((await post(t.portaria, `/people/portaria/visitas/${ids.visita}/saida`)).status).toBe(201);
  });

  it('hoje: a cozinha recebe o lanche de todos (Selecionar todos) e a cesta da Clara', async () => {
    const lanche = await post(t.educador, '/people/kitchen-requests', {
      houseId: ids.AI3, tipo: 'lanche', pessoas: [ids.alice, ids.asafe, ids.clara], em: HOJE,
      quantidade: 1, finalidade: `Passeio ao parque da simulação ${rodada}` });
    expect(lanche.status).toBe(201);
    expect(lanche.body.ids).toHaveLength(3);
    const cesta = await post(t.tecnica, '/people/kitchen-requests', {
      houseId: ids.AI3, tipo: 'cesta_basica', personId: ids.clara, em: HOJE, quantidade: 1,
      finalidade: `Fim de semana com a madrinha ${rodada}`, entregarA: 'Madrinha da Simulação' });
    expect(cesta.status).toBe(201);
  });

  it('hoje: o educador não lê a observação restrita; pede, a técnica libera, e só então ele lê', async () => {
    const antes = (await get(t.educador, `/shifts/${ids.plantao_noturno}`)).body;
    expect(JSON.stringify(antes)).not.toContain('Conselho Tutelar sobre a Clara');
    const pedido = await post(t.educador, `/shifts/ata/${ids.ata_noturno}/read-request`,
      { motivo: 'Vou acompanhar a Clara na visita de hoje e preciso saber do contato.' });
    expect(pedido.status).toBe(201);
    ids.pedido = pedido.body.id;
    const decisao = await post(t.tecnica, `/shifts/ata-read-requests/${ids.pedido}/decide`,
      { liberar: true, motivo: 'Ele acompanha a criança hoje.' });
    expect(decisao.status).toBe(201);
    const depois = (await get(t.educador, `/shifts/${ids.plantao_noturno}`)).body;
    expect(JSON.stringify(depois)).toContain('Conselho Tutelar sobre a Clara');
    /* Quem liberou fica registrado. */
    const { rows: [r] } = await admin.query(
      `SELECT app_user_display_name(decided_by) AS quem, granted FROM ata_read_request WHERE id = $1`, [ids.pedido]);
    expect(r.granted).toBe(true);
    expect(r.quem).toBeTruthy();
  });

  // ==================================================== os relatórios batem?

  it('as duas ATAs do dia 1 trazem o que foi escrito em cada turno', async () => {
    const diurna = await get(t.coord, `/shifts/${ids.plantao_diurno}/folha`);
    const noturna = await get(t.coord, `/shifts/${ids.plantao_noturno}/folha`);
    expect(diurna.status).toBe(200);
    expect(noturna.status).toBe(200);
    expect(JSON.stringify(diurna.body)).toContain(`dieta da Alice (${rodada})`);
    expect(JSON.stringify(diurna.body)).not.toContain(`remédio (${rodada})`);
    expect(JSON.stringify(noturna.body)).toContain(`remédio (${rodada})`);
    /* A linha vem com o nome e o cargo de quem escreveu. */
    expect(JSON.stringify(diurna.body)).toMatch(/dieta da Alice \([a-z0-9]+\)\. [^"]+, Educador social\./);
    /* A observação restrita não vai ao papel: vai a contagem. */
    expect(JSON.stringify(noturna.body)).not.toContain('Conselho Tutelar sobre a Clara');
    expect(JSON.stringify(noturna.body)).toContain('Há 1 observação de acesso restrito registrada no turno');
    for (const p of [ids.plantao_diurno, ids.plantao_noturno]) {
      const w = await post(t.coord, `/shifts/${p}/export`, { finalidade: 'Arquivo da simulação de ciclo completo.' });
      expect(w.status).toBe(201);
      expect(Buffer.from(w.body.conteudoBase64, 'base64').subarray(0, 2).toString()).toBe('PK');
    }
  });

  it('o relatório da internação tem os dois dias, os dois acompanhantes, a alta e a foto', async () => {
    const f = (await get(t.coord, `/nursing/hospitalizations/${ids.internacao}/folha`)).body;
    const titulos = f.secoes.map((s: any) => s.titulo);
    expect(titulos).toEqual(expect.arrayContaining([
      `Registros de ${D1.split('-').reverse().join('/')}`, `Registros de ${D2.split('-').reverse().join('/')}`,
      'Encerramento', 'Anexos', 'Anexo 1']));
    const acomp = f.secoes.find((s: any) => s.titulo === 'Acompanhamento pela equipe');
    expect(acomp.tabela.linhas).toHaveLength(2);
    expect(f.identificacao.find((l: any) => l.rotulo === 'Tempo de internação').valor).toBe('1 dia e 1 hora');
    const w = await post(t.coord, `/nursing/hospitalizations/${ids.internacao}/export`,
      { finalidade: 'Arquivo da simulação de ciclo completo.' });
    expect(w.status).toBe(201);
  });

  it('o relatório de visitas da Clara conta a visita de hoje', async () => {
    const r = await get(t.tecnica, `/people/${ids.clara}/visitas`);
    expect(r.status).toBe(200);
    expect(r.body.contagem.noPeriodo).toBe(1);
    expect(r.body.visitantes.map((v: any) => v.nome)).toEqual(['Madrinha da Simulação (fictícia)']);
    expect((await post(t.tecnica, `/people/${ids.clara}/visitas/export`,
      { finalidade: 'Arquivo da simulação de ciclo completo.' })).status).toBe(201);
  });

  it('o relatório de refeições do dia 1 tem o almoço, com três registros e uma dieta adaptada', async () => {
    const r = await get(t.coord, `/reports/period/meals?houseId=${ids.AI3}&de=${D1}&ate=${D1}`);
    expect(r.status).toBe(200);
    const linhas = r.body.porRefeicao;
    const almoco = (Array.isArray(linhas) ? linhas : []).find((l: any) => l.refeicao === ALMOCO);
    expect(almoco).toMatchObject({ chamadas: 1, registros: 3, comeram: 3, dietaAdaptada: 1 });
  });

  it('o relatório do armário e o das notas batem com a entrada, a dose e a compra', async () => {
    const m = (await get(t.enfermagem, `/medications/metrics?houseId=${ids.AI3}&de=${D1}&ate=${HOJE}`)).body;
    const item = m.porRemedio.find((x: any) => x.remedio === REMEDIO);
    expect(item).toMatchObject({ entrada: 30, consumo: 1 });
    const notas = await post(t.enfermagem, '/medications/purchases/export',
      { houseId: ids.AI3, de: D1, ate: HOJE, finalidade: 'Arquivo da simulação de ciclo completo.' });
    expect(notas.status).toBe(201);
    const armario = await post(t.enfermagem, '/medications/stock/report/export',
      { houseId: ids.AI3, de: D1, ate: HOJE, finalidade: 'Arquivo da simulação de ciclo completo.' });
    expect(armario.status).toBe(201);
    const { rows: [nf] } = await admin.query(
      `SELECT total_cents FROM medication_purchase WHERE house_id = $1 AND invoice_ref = $2`,
      [ids.AI3, `SIM-${rodada}`]);
    expect(Number(nf.total_cents)).toBe(1890);
  });

  it('o que a gestão, a coordenação e a técnica leem, e o que a outra casa não lê', async () => {
    for (const k of ['gestor', 'coord', 'tecnica']) {
      const r = await get(t[k], `/nursing/hospitalizations/${ids.internacao}`);
      expect(r.status).toBe(200);
    }
    const fora = await get(t.coord4, `/nursing/hospitalizations/${ids.internacao}`);
    expect([403, 404]).toContain(fora.status);
    const foraAta = await get(t.coord4, `/shifts/${ids.plantao_noturno}`);
    expect([403, 404]).toContain(foraAta.status);
  });
});
