/**
 * Testes de aceite da Fase 5 — Plantão, ATA, relatos e ocorrências.
 * Cenários do Prompt Master §26.2:
 *   #11 Narrativa pessoal não aparece a colega
 *   #12 Equipe técnica vê relatos lado a lado
 *   #18 Cada educador assina só a própria passagem
 *   #19 ATA fecha com pendência, sem assinatura falsa
 *   #20 Reabertura registra antes e depois
 *   #21 Todos do próximo turno confirmam recebimento
 *   #22 Ocorrência crítica fechada pelo líder aguarda revisão técnica
 *   #23 Comunicação externa não é enviada automaticamente
 *   #29 Gestor só abre narrativa pessoal com justificativa
 *   #36 Líder Noturno Geral confirma as oito ATAs e fecha a sua sem assinar por educadores
 *   +   ATA fechada não é reescrita; nome de arquivo sem CPF/diagnóstico;
 *       referência do anexo ilegível para o papel da aplicação.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const appUrl = process.env.DATABASE_APP_URL ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher';
const HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

describe('Fase 5 — Plantão, ATA e proteção', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let plantaoDiurno: string, ataDiurna: string;
  let relatoRestrito: string, ocorrencia: string, comunicacao: string;

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
      educador2: 'educador2.ai3@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev',
      noturno: 'lider.noturno@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.sofia }] } = await admin.query(`SELECT id FROM person WHERE social_name='Sofia'`));
    ({ rows: [{ id: ids.educador }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev'`));
    ({ rows: [{ id: ids.educador2 }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador2.ai3@paodospobres.dev'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== Plantão e passagem ====================

  it('abre o plantão diurno e já cria o rascunho da ATA — uma por plantão', async () => {
    const res = await request(http).post('/api/v1/shifts').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, data: HOJE, turno: 'diurno' });
    expect(res.status).toBe(201);
    /*
     * `novo` diz se ESTA chamada criou o plantão, e a suíte afirmava que sim.
     * Isso só era verdade enquanto ela fosse a primeira a rodar: a
     * `regressao-saida` também abre o diurno de hoje na Casa 03, e a ordem em
     * que o Jest escolhe os arquivos mudou quando outros arquivos mudaram de
     * tamanho. Catorze testes quebraram sem que nada no sistema tivesse
     * mudado.
     *
     * O que este teste prova continua valendo: abrir o plantão devolve UMA
     * ATA, e abrir de novo devolve a mesma. Quem cria a primeira é
     * indiferente, e afirmar isso era afirmar sobre a ordem dos arquivos.
     */
    expect(typeof res.body.novo).toBe('boolean');
    expect(res.body.ataId).toBeTruthy();
    plantaoDiurno = res.body.plantaoId;
    ataDiurna = res.body.ataId;

    // Abrir de novo devolve o mesmo plantão: a unicidade é do banco.
    const outra = await request(http).post('/api/v1/shifts').set(auth(tokens.lider))
      .send({ houseId: ids.AI3, data: HOJE, turno: 'diurno' });
    expect(outra.body.plantaoId).toBe(plantaoDiurno);
    expect(outra.body.novo).toBe(false);
  });

  it('#18 cada educador assina a PRÓPRIA passagem — e o banco recusa a assinatura alheia', async () => {
    const a = await request(http).post(`/api/v1/shifts/${plantaoDiurno}/handover`)
      .set(auth(tokens.educador))
      .send({ aparelho: 'tablet-casa03', contribuicoes: 'Acompanhei o café e a saída para a escola.',
              pendencias: 'Sofia precisa de retorno na UBS.', orientacoes: 'Conferir mochila da tarde.' });
    expect(a.status).toBe(201);

    // A mesma pessoa não assina duas vezes.
    const duplicada = await request(http).post(`/api/v1/shifts/${plantaoDiurno}/handover`)
      .set(auth(tokens.educador)).send({ contribuicoes: 'Outra versão.' });
    expect(duplicada.status).toBe(400);
    expect(duplicada.body.message).toMatch(/já assinou/i);

    // Prova no nível do banco: com a identidade de um educador, gravar a
    // passagem EM NOME DE OUTRO é recusado pela política, não pela tela.
    const cliente = new Client({ connectionString: appUrl });
    await cliente.connect();
    await cliente.query('BEGIN');
    await cliente.query(`SELECT set_config('app.user_id', $1, true)`, [ids.educador]);
    await expect(cliente.query(
      `INSERT INTO handover (shift_id, house_id, user_id, role, contributions)
       VALUES ($1,$2,$3,'educador','Assinatura forjada')`,
      [plantaoDiurno, ids.AI3, ids.educador2])).rejects.toThrow(/row-level security|violates/i);
    await cliente.query('ROLLBACK');
    await cliente.end();
  });

  /**
   * A tela da passagem encontrou uma promessa sem caminho: ao recusar a
   * segunda assinatura, o sistema dizia "entra como relato complementar" — e
   * não havia rota nenhuma para isso. Quem lembrasse de algo às 20h só tinha
   * saídas ruins. Estes três testes guardam a saída boa.
   */
  it('a pessoa complementa a PRÓPRIA passagem — ao lado dela, sem reescrever nada', async () => {
    const c = await request(http).post(`/api/v1/shifts/${plantaoDiurno}/handover/note`)
      .set(auth(tokens.educador))
      .send({ texto: 'A mãe do Bruno ligou às 17h30 e avisou que não vem na visita de sábado.' });
    expect(c.status).toBe(201);

    const visto = await request(http).get(`/api/v1/shifts/${plantaoDiurno}`).set(auth(tokens.educador));
    const minha = visto.body.passagens.find((p: any) => p.propria);
    // O que foi assinado continua exatamente como foi assinado...
    expect(minha.contribuicoes).toMatch(/Acompanhei o café/);
    // ...e o que veio depois aparece ao lado, com hora própria.
    expect(minha.complementos).toHaveLength(1);
    expect(minha.complementos[0].texto).toMatch(/não vem na visita de sábado/);

    const curto = await request(http).post(`/api/v1/shifts/${plantaoDiurno}/handover/note`)
      .set(auth(tokens.educador)).send({ texto: 'ok' });
    expect(curto.status).toBe(400);
  });

  it('quem não assinou a passagem não a complementa — nem pela rota, nem pelo banco', async () => {
    const semPassagem = await request(http).post(`/api/v1/shifts/${plantaoDiurno}/handover/note`)
      .set(auth(tokens.educador2)).send({ texto: 'Quero acrescentar algo ao turno de hoje.' });
    expect(semPassagem.status).toBe(400);
    expect(semPassagem.body.message).toMatch(/ainda não assinou/i);

    // E a prova onde importa: com a identidade do colega, escrever um
    // complemento NA PASSAGEM DO OUTRO é recusado pela política.
    const { rows: [h] } = await admin.query(
      `SELECT id FROM handover WHERE shift_id = $1 AND user_id = $2`, [plantaoDiurno, ids.educador]);
    const cliente = new Client({ connectionString: appUrl });
    await cliente.connect();
    await cliente.query('BEGIN');
    await cliente.query(`SELECT set_config('app.user_id', $1, true)`, [ids.educador2]);
    await expect(cliente.query(
      `INSERT INTO handover_note (handover_id, shift_id, house_id, user_id, body)
       VALUES ($1,$2,$3,$4,'Complemento escrito por quem não assinou.')`,
      [h.id, plantaoDiurno, ids.AI3, ids.educador2])).rejects.toThrow(/row-level security|violates/i);
    await cliente.query('ROLLBACK');
    await cliente.end();
  });

  /**
   * A tela mostrou "sua passagem falta" para a equipe técnica num plantão em
   * que ela nunca esteve. Falta é de quem era ESPERADO; para os demais,
   * assinar continua possível — quem cobre um turno fora da escala precisa
   * registrar —, só não é cobrança.
   */
  it('falta de passagem é de quem era esperado no plantão, não de quem apenas enxerga a casa', async () => {
    const doEducador = await request(http).get(`/api/v1/shifts/${plantaoDiurno}`).set(auth(tokens.educador2));
    expect(doEducador.body.minhaPassagemEsperada).toBe(true);

    const daTecnica = await request(http).get(`/api/v1/shifts/${plantaoDiurno}`).set(auth(tokens.tecnica));
    expect(daTecnica.body.minhaPassagemEsperada).toBe(false);
    // Mas ela continua vendo o plantão inteiro, e o recebimento é dela mesma.
    expect(daTecnica.body.passagens.length).toBeGreaterThan(0);
    expect(daTecnica.body.passagens.every((p: any) => p.propria === false)).toBe(true);
  });

  it('o complemento também não é reescrito nem apagado', async () => {
    const { rows: [n] } = await admin.query(
      `SELECT id FROM handover_note WHERE shift_id = $1 LIMIT 1`, [plantaoDiurno]);
    await expect(admin.query(
      `UPDATE handover_note SET body = 'outra coisa' WHERE id = $1`, [n.id])).rejects.toThrow();
    await expect(admin.query(
      `DELETE FROM handover_note WHERE id = $1`, [n.id])).rejects.toThrow();
  });

  it('#11 a narrativa pessoal do colega não aparece ao par', async () => {
    const criado = await request(http).post('/api/v1/statements').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, context: 'passagem', entity: 'handover', entityId: plantaoDiurno,
              witness: 'presenciei_integralmente',
              body: 'Percebi que Sofia ficou retraída depois da ligação da tarde; conversei e ela pediu para ficar sozinha.',
              restrito: true });
    expect(criado.status).toBe(201);
    relatoRestrito = criado.body.id;

    const doColega = await request(http).get('/api/v1/statements')
      .query({ entity: 'handover', entityId: plantaoDiurno }).set(auth(tokens.educador2));
    expect(doColega.status).toBe(200);
    expect(doColega.body.modo).toBe('restrito_ao_proprio');
    expect(doColega.body.relatos.map((r: any) => r.id)).not.toContain(relatoRestrito);
  });

  it('#12 a equipe técnica vê os relatos lado a lado, sem que nenhum tenha sido alterado', async () => {
    await request(http).post('/api/v1/statements').set(auth(tokens.educador2))
      .send({ houseId: ids.AI3, context: 'passagem', entity: 'handover', entityId: plantaoDiurno,
              witness: 'soube_depois',
              body: 'Soube pela equipe da tarde; não estava na sala no momento da ligação.',
              restrito: true });

    const tecnica = await request(http).get('/api/v1/statements')
      .query({ entity: 'handover', entityId: plantaoDiurno }).set(auth(tokens.tecnica));
    expect(tecnica.body.modo).toBe('lado_a_lado');
    expect(tecnica.body.relatos.length).toBe(2);
    expect(tecnica.body.relatos.map((r: any) => r.codigoTestemunho).sort())
      .toEqual(['presenciei_integralmente', 'soube_depois']);
  });

  it('#29 o Gestor Geral só abre narrativa pessoal com finalidade declarada — e fica registrado', async () => {
    const semJustificativa = await request(http)
      .post(`/api/v1/statements/${relatoRestrito}/exceptional-read`)
      .set(auth(tokens.gestor)).send({ finalidade: 'curiosidade' });
    expect(semJustificativa.status).toBe(400);

    const comJustificativa = await request(http)
      .post(`/api/v1/statements/${relatoRestrito}/exceptional-read`)
      .set(auth(tokens.gestor))
      .send({ finalidade: 'Apuração institucional solicitada pela coordenação sobre o plantão de hoje.' });
    expect(comJustificativa.status).toBe(201);
    expect(comJustificativa.body.relato).toMatch(/retraída/);

    const { rows } = await admin.query(
      `SELECT purpose FROM audit_event WHERE action = 'statement.read_exceptional' AND entity_id = $1`,
      [relatoRestrito]);
    expect(rows.length).toBe(1);
    expect(rows[0].purpose).toMatch(/Apuração institucional/);

    // O educador não alcança a narrativa do colega nem por esta porta.
    const educadorTenta = await request(http)
      .post(`/api/v1/statements/${relatoRestrito}/exceptional-read`)
      .set(auth(tokens.educador2))
      .send({ finalidade: 'Quero entender o que aconteceu no plantão de ontem à tarde.' });
    expect(educadorTenta.status).toBe(403);
  });

  it('#21 cada profissional do turno que entra confirma o recebimento individualmente', async () => {
    const um = await request(http).post(`/api/v1/shifts/${plantaoDiurno}/receipt`)
      .set(auth(tokens.educador2)).send({ leuOrientacoes: true, assumiuPendencias: true });
    expect(um.status).toBe(201);
    expect(um.body.aviso).toMatch(/não significa concordância/i);

    const dois = await request(http).post(`/api/v1/shifts/${plantaoDiurno}/receipt`)
      .set(auth(tokens.lider)).send({ leuOrientacoes: true, assumiuPendencias: true });
    expect(dois.status).toBe(201);

    const repetido = await request(http).post(`/api/v1/shifts/${plantaoDiurno}/receipt`)
      .set(auth(tokens.educador2)).send({ leuOrientacoes: true });
    expect(repetido.status).toBe(400);

    const plantao = await request(http).get(`/api/v1/shifts/${plantaoDiurno}`).set(auth(tokens.lider));
    expect(plantao.body.recebimentos.length).toBe(2);
  });

  it('registra o episódio de um acolhido uma única vez, e o líder dá ciência sem alterar o relato', async () => {
    const ep = await request(http).post(`/api/v1/shifts/ata/${ataDiurna}/episodes`)
      .set(auth(tokens.educador))
      .send({ acolhidoId: ids.sofia, classificacao: 'desorganizacao',
              relato: 'Recusou-se a entrar na sala e bateu a porta; foi acolhida e voltou em dez minutos.' });
    expect(ep.status).toBe(201);

    const ciencia = await request(http).post(`/api/v1/shifts/episodes/${ep.body.id}/ack`)
      .set(auth(tokens.lider)).send({ comentario: 'Ciente. Conversar com a equipe da tarde.' });
    expect(ciencia.status).toBe(201);

    const { rows } = await admin.query(`SELECT factual FROM ata_episode WHERE id = $1`, [ep.body.id]);
    expect(rows[0].factual).toMatch(/^Recusou-se a entrar/);
  });

  it('#19 a ATA fecha COM PENDÊNCIA quando falta assinatura — e nenhuma é presumida', async () => {
    await request(http).patch(`/api/v1/shifts/ata/${ataDiurna}`).set(auth(tokens.lider))
      .send({ conteudo: { equipe_presente: ['Mário', 'Joana', 'Lúcia'],
                          acolhidos: '20 ativos, sem intercorrências graves.',
                          medicamentos: 'Sem recusas.', orientacoes: 'Conferir mochilas.' } });

    const fechada = await request(http).post(`/api/v1/shifts/ata/${ataDiurna}/close`)
      .set(auth(tokens.lider)).send({ pendencias: 'Duas passagens não assinadas até o fim do turno.' });
    expect(fechada.status).toBe(201);
    expect(fechada.body.status).toBe('fechada_com_pendencia');
    expect(fechada.body.assinaturasFaltantes).toBe(2);
    expect(fechada.body.aviso).toMatch(/Nenhuma assinatura foi presumida/i);

    // O sistema NÃO criou passagens no lugar de quem faltou.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM handover WHERE shift_id = $1`, [plantaoDiurno]);
    expect(rows[0].n).toBe(1);

    // E a equipe técnica foi avisada (§12.4).
    const { rows: notif } = await admin.query(
      `SELECT count(*)::int AS n FROM escalation WHERE entity = 'ata' AND entity_id = $1`, [ataDiurna]);
    expect(notif[0].n).toBe(1);
  });

  it('ATA fechada não é reescrita, nem pelo líder que a fechou', async () => {
    const tentativa = await request(http).patch(`/api/v1/shifts/ata/${ataDiurna}`)
      .set(auth(tokens.lider)).send({ conteudo: { orientacoes: 'Versão nova por cima da fechada.' } });
    expect(tentativa.status).toBe(400);
    expect(tentativa.body.message).toMatch(/não é reescrita|reabertura/i);
  });

  it('#20 a reabertura registra o antes; a correção registra o depois', async () => {
    const negada = await request(http).post(`/api/v1/shifts/ata/${ataDiurna}/reopen`)
      .set(auth(tokens.lider)).send({ motivo: 'Quero corrigir a redação do turno da tarde.' });
    expect(negada.status).toBe(403);

    const reaberta = await request(http).post(`/api/v1/shifts/ata/${ataDiurna}/reopen`)
      .set(auth(tokens.tecnica))
      .send({ motivo: 'Correção do horário do atendimento de saúde registrado no turno.' });
    expect(reaberta.status).toBe(201);
    expect(reaberta.body.versao).toBe(2);

    const corrigida = await request(http).post(`/api/v1/shifts/ata/${ataDiurna}/amend`)
      .set(auth(tokens.tecnica))
      .send({ motivo: 'Correção do horário do atendimento de saúde registrado no turno.',
              conteudo: { equipe_presente: ['Mário', 'Joana', 'Lúcia'],
                          acolhidos: '20 ativos, sem intercorrências graves.',
                          saude_deslocamentos: 'Consulta às 14h20 (registro anterior dizia 13h20).',
                          medicamentos: 'Sem recusas.', orientacoes: 'Conferir mochilas.' } });
    expect(corrigida.status).toBe(201);
    expect(corrigida.body.status).toBe('fechada_com_pendencia');

    const adendos = await request(http).get(`/api/v1/shifts/ata/${ataDiurna}/addenda`)
      .set(auth(tokens.tecnica));
    const tipos = adendos.body.map((a: any) => a.tipo);
    expect(tipos).toContain('reabertura');
    expect(tipos).toContain('correcao');
    const correcao = adendos.body.find((a: any) => a.tipo === 'correcao');
    expect(correcao.antes.conteudo.saude_deslocamentos).toBeUndefined();
    expect(correcao.depois.conteudo.saude_deslocamentos).toMatch(/14h20/);
  });

  // ==================== ATA Geral Noturna ====================

  it('#36 o Líder Noturno Geral confirma as oito ATAs e assina a sua, sem assinar por ninguém', async () => {
    const geral = await request(http).post('/api/v1/shifts/general-ata')
      .set(auth(tokens.noturno)).send({ data: HOJE });
    expect(geral.status).toBe(201);
    expect(geral.body.casas).toBe(8);   // as oito aparecem por construção

    const naoPode = await request(http).post('/api/v1/shifts/general-ata')
      .set(auth(tokens.lider)).send({ data: HOJE });
    expect(naoPode.status).toBe(403);

    // Confirmar o fechamento de uma casa cuja ATA noturna não existe é recusado:
    // ele confirma um fato, não o produz.
    const cedoDemais = await request(http)
      .patch(`/api/v1/shifts/general-ata/${geral.body.id}/house/${ids.AI3}`)
      .set(auth(tokens.noturno)).send({ confirmarAtaNoturna: true });
    expect(cedoDemais.status).toBe(400);

    // Abre e fecha a ATA noturna da Casa 03 — ninguém assinou passagem, então
    // ela fecha com pendência, e é ISSO que fica registrado.
    const noturno = await request(http).post('/api/v1/shifts').set(auth(tokens.noturno))
      .send({ houseId: ids.AI3, data: HOJE, turno: 'noturno' });
    const fecha = await request(http).post(`/api/v1/shifts/ata/${noturno.body.ataId}/close`)
      .set(auth(tokens.noturno)).send({ pendencias: 'Equipe noturna assinará ao fim do plantão.' });
    expect(fecha.body.status).toBe('fechada_com_pendencia');

    const agora = await request(http)
      .patch(`/api/v1/shifts/general-ata/${geral.body.id}/house/${ids.AI3}`)
      .set(auth(tokens.noturno))
      .send({ houveContato: true, motivo: 'Chamado por indisposição de um acolhido',
              acao: 'Acompanhamento e contato com a Enfermagem', categoria: 'saude',
              confirmarAtaNoturna: true });
    expect(agora.status).toBe(200);

    const assinada = await request(http).post(`/api/v1/shifts/general-ata/${geral.body.id}/sign`)
      .set(auth(tokens.noturno))
      .send({ pendencias: 'Sete casas sem ATA noturna fechada no momento da assinatura.' });
    expect(assinada.status).toBe(201);
    expect(assinada.body.status).toBe('fechada_com_pendencia');
    expect(assinada.body.confirmadas).toBe(1);
    expect(assinada.body.total).toBe(8);
    expect(assinada.body.casasSemConfirmacao.length).toBe(7);

    // Em nenhum momento o Líder Noturno Geral assinou passagem de educador.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM handover h
        JOIN app_user u ON u.id = h.user_id WHERE u.role = 'lider_noturno_geral'`);
    expect(rows[0].n).toBe(0);
  });

  // ==================== Ocorrências ====================

  it('#22 ocorrência crítica encerrada pelo líder AGUARDA revisão técnica', async () => {
    const aberta = await request(http).post('/api/v1/incidents').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, categoria: 'erro_medicamento', quando: new Date().toISOString(),
              fato: 'Dose da tarde foi preparada com o comprimido de outro acolhido e o erro foi percebido antes da administração.',
              acolhidos: [ids.sofia], medicamento: true,
              medidasImediatas: 'Dose descartada, Enfermagem acionada imediatamente.' });
    expect(aberta.status).toBe(201);
    expect(aberta.body.revisaoTecnicaObrigatoria).toBe(true);
    expect(aberta.body.avisados).toContain('enfermagem');
    ocorrencia = aberta.body.id;

    const encerrada = await request(http).post(`/api/v1/incidents/${ocorrencia}/operational-close`)
      .set(auth(tokens.lider)).send({ nota: 'Estoque conferido e equipe orientada.' });
    expect(encerrada.status).toBe(201);
    expect(encerrada.body.status).toBe('aguardando_revisao_tecnica');
    expect(encerrada.body.aviso).toMatch(/não está fechada/i);

    // Fechar sem síntese, em caso de medicamento, é recusado.
    const semSintese = await request(http).post(`/api/v1/incidents/${ocorrencia}/review`)
      .set(auth(tokens.tecnica)).send({ decisao: 'validar' });
    expect(semSintese.status).toBe(400);

    await request(http).post(`/api/v1/incidents/${ocorrencia}/synthesis`)
      .set(auth(tokens.tecnica))
      .send({ texto: 'Erro interceptado antes da administração; revisada a conferência dupla no preparo das doses.' });

    const fechada = await request(http).post(`/api/v1/incidents/${ocorrencia}/review`)
      .set(auth(tokens.tecnica)).send({ decisao: 'validar', nota: 'Validado com a Enfermagem.' });
    expect(fechada.body.status).toBe('fechada');
  });

  it('a fala espontânea e os sinais observados não chegam ao colega do plantão', async () => {
    const aberta = await request(http).post('/api/v1/incidents').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, categoria: 'violencia_ou_suspeita', quando: new Date().toISOString(),
              fato: 'Durante o banho, a criança relatou espontaneamente um episódio ocorrido antes do acolhimento.',
              acolhidos: [ids.sofia],
              falaEspontanea: 'Transcrição literal da fala, sem interpretação.',
              sinaisObservados: 'Descrição objetiva do que foi observado.' });
    expect(aberta.status).toBe(201);
    expect(aberta.body.nivelAcesso).toBe('restrito');

    // O colega não alcança nem a ocorrência.
    const colega = await request(http).get(`/api/v1/incidents/${aberta.body.id}`).set(auth(tokens.educador2));
    expect(colega.status).toBe(404);

    // A equipe técnica alcança tudo.
    const tecnica = await request(http).get(`/api/v1/incidents/${aberta.body.id}`).set(auth(tokens.tecnica));
    expect(tecnica.status).toBe(200);
    expect(tecnica.body.protegido.falaEspontanea).toMatch(/Transcrição literal/);

    // O líder encerra a etapa operacional sem ler o conteúdo protegido.
    const lider = await request(http).get(`/api/v1/incidents/${aberta.body.id}`).set(auth(tokens.lider));
    expect(lider.status).toBe(200);
    expect(lider.body.protegido).toBeNull();
    expect(lider.body.avisoProtegido).toMatch(/equipe técnica/i);
  });

  it('anexo: foto exige justificativa, nome de arquivo não carrega CPF nem diagnóstico', async () => {
    const semJustificativa = await request(http).post(`/api/v1/incidents/${ocorrencia}/attachments`)
      .set(auth(tokens.tecnica))
      .send({ tipo: 'foto_autorizada', nome: 'registro-01.jpg', referencia: 'store://ficticio/1' });
    expect(semJustificativa.status).toBe(400);

    const nomeProibido = await request(http).post(`/api/v1/incidents/${ocorrencia}/attachments`)
      .set(auth(tokens.tecnica))
      .send({ tipo: 'documento_medico', nome: 'laudo-depressao-123.456.789-00.pdf',
              referencia: 'store://ficticio/2' });
    expect(nomeProibido.status).toBe(400);
    expect(nomeProibido.body.message).toMatch(/CPF, diagnóstico ou referência judicial/i);

    const ok = await request(http).post(`/api/v1/incidents/${ocorrencia}/attachments`)
      .set(auth(tokens.tecnica))
      .send({ tipo: 'documento_medico', nome: 'documento-de-saude-01.pdf',
              referencia: 'store://ficticio/3', restrito: true });
    expect(ok.status).toBe(201);

    // O educador vê que existe anexo, mas não o abre.
    const tentativa = await request(http).post(`/api/v1/incidents/attachments/${ok.body.id}/open`)
      .set(auth(tokens.educador))
      .send({ finalidade: 'Quero ver o documento anexado à ocorrência de medicamento.' });
    expect(tentativa.status).toBe(403);

    // E a referência do arquivo não é legível nem pelo papel da aplicação:
    // o privilégio é negado por COLUNA, não por disciplina do código.
    const cliente = new Client({ connectionString: appUrl });
    await cliente.connect();
    await cliente.query(`SELECT set_config('app.user_id', $1, false)`, [ids.educador]);
    await expect(cliente.query(`SELECT storage_ref FROM incident_attachment LIMIT 1`))
      .rejects.toThrow(/permission denied/i);
    await cliente.end();
  });

  it('#23 comunicação externa é registrada, revisada e aprovada — nunca enviada pelo sistema', async () => {
    const criada = await request(http).post('/api/v1/incidents/communications')
      .set(auth(tokens.tecnica))
      .send({ houseId: ids.AI3, incidentId: ocorrencia, orgao: 'conselho_tutelar',
              destinatarioFuncional: 'Conselheiro tutelar de plantão',
              canal: 'oficio',
              resumo: 'Comunicação do erro de medicamento interceptado e das medidas adotadas pela equipe.' });
    expect(criada.status).toBe(201);
    expect(criada.body.aviso).toMatch(/NÃO envia/i);
    comunicacao = criada.body.id;

    // Registrar entrega antes da aprovação é recusado.
    const cedo = await request(http).post(`/api/v1/incidents/communications/${comunicacao}/delivery`)
      .set(auth(tokens.tecnica)).send({ nota: 'Entregue na portaria.' });
    expect(cedo.status).toBe(400);

    const aprovada = await request(http).post(`/api/v1/incidents/communications/${comunicacao}/approve`)
      .set(auth(tokens.coord)).send({});
    expect(aprovada.status).toBe(201);
    expect(aprovada.body.aviso).toMatch(/não realiza o envio/i);

    const entregue = await request(http).post(`/api/v1/incidents/communications/${comunicacao}/delivery`)
      .set(auth(tokens.tecnica)).send({ nota: 'Protocolo recebido pelo plantão do Conselho.' });
    expect(entregue.body.status).toBe('entregue_manualmente');

    // Não existe estado "enviado automaticamente": o esquema só conhece
    // rascunho, em revisão, aprovado e entregue por uma pessoa.
    const { rows } = await admin.query(
      `SELECT delivered_by IS NOT NULL AS tem_humano FROM external_communication WHERE id = $1`, [comunicacao]);
    expect(rows[0].tem_humano).toBe(true);
  });

  it('a linha do tempo mostra que houve ocorrência, sem contar o que aconteceu', async () => {
    const res = await request(http).get('/api/v1/timeline')
      .query({ houseId: ids.AI3, date: HOJE }).set(auth(tokens.educador));
    expect(res.status).toBe(200);
    expect(res.body.fontes).toEqual(expect.arrayContaining(['shifts', 'incidents']));

    const ocorrencias = res.body.eventos.filter((e: any) => e.kind === 'ocorrencia');
    expect(ocorrencias.length).toBeGreaterThan(0);
    const texto = JSON.stringify(ocorrencias);
    expect(texto).not.toMatch(/comprimido de outro acolhido/);
    expect(texto).not.toMatch(/Transcrição literal/);

    const plantoes = res.body.eventos.filter((e: any) => e.kind === 'plantao');
    expect(plantoes.length).toBeGreaterThan(0);
  });
});
