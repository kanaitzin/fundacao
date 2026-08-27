/**
 * Testes de aceite da Fase 2 — Perfil do Acolhido.
 * Cenários do Prompt Master §26.2:
 *   #4  CPF repetido não cria perfil
 *   #5  Retorno cria episódio no histórico
 *   #6  Transferência muda casa só após aceite
 *   #7  Origem perde acesso ativo após efetivação
 *   #24 Educador abre apenas documentos de escola/saúde permitidos
 *   #25 Relatório da cozinha não contém CPF nem conteúdo judicial
 *   #39 Coordenador de origem perde dados bancários após transferência aceita
 *   #40 Dados bancários não aparecem em telas gerais
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Fase 2 — Perfil, benefícios, transferência e acervo', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, AI4: string, alice: string, vitoria: string, lucas: string, otavio: string;
  let devolvida: string;

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login falhou p/ ${email}: ${res.status} ${JSON.stringify(res.body)}`);
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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord3: 'coord.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
      tecnica4: 'coord.ai4@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ id: alice }] } = await admin.query(`SELECT id FROM person WHERE social_name='Alice'`));
    ({ rows: [{ id: vitoria }] } = await admin.query(`SELECT id FROM person WHERE social_name='Vitória'`));
    ({ rows: [{ id: lucas }] } = await admin.query(`SELECT id FROM person WHERE social_name='Lucas'`));
    ({ rows: [{ id: otavio }] } = await admin.query(`SELECT id FROM person WHERE social_name='Otávio'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ---------- Visão da casa e perfil ----------

  it('educador vê os 20 acolhidos ativos da própria casa, com CPF mascarado', async () => {
    const res = await request(http).get(`/api/v1/people?houseId=${AI3}`).set(auth(tokens.educador));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(20);
    expect(res.body[0].cpf).toMatch(/^\*\*\*\.\*\*\*\.\d{3}-\*\*$/);   // minimização (§3.1)
    expect(res.body[0]).not.toHaveProperty('nomeCivilCompleto');
  });

  it('educador da Casa 03 não lista acolhidos da Casa 04', async () => {
    const res = await request(http).get(`/api/v1/people?houseId=${AI4}`).set(auth(tokens.educador));
    expect(res.body).toEqual([]);   // RLS filtra: casa fora do escopo não existe
  });

  it('perfil abre com alertas essenciais e restrições no topo', async () => {
    const res = await request(http).get(`/api/v1/people/${alice}`).set(auth(tokens.educador));
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Alice');                       // nome social nas telas (§6.1)
    expect(res.body.alertasEssenciais[0].descricao).toMatch(/Amendoim/);
    expect(res.body.restricoesAlimentares.length).toBeGreaterThan(0);
  });

  it('cenário #40 — perfil não expõe dados bancários em nenhum campo', async () => {
    const res = await request(http).get(`/api/v1/people/${otavio}`).set(auth(tokens.coord3));
    const texto = JSON.stringify(res.body);
    expect(texto).not.toMatch(/Banco Fict/);
    expect(texto).not.toMatch(/00000-0/);
    expect(res.body.beneficios).toEqual({ acessivel: true, rota: `/people/${otavio}/benefits` });
  });

  it('cenário #24 — educador abre documento de saúde/escola, mas não pessoal nem judicial', async () => {
    const perfil = await request(http).get(`/api/v1/people/${alice}`).set(auth(tokens.educador));
    const cats = perfil.body.documentos.map((d: any) => d.category);
    expect(new Set(cats)).toEqual(new Set(['saude', 'escolar']));
    expect(perfil.body.documentosRestritos).toBe(2);           // pessoais/judiciais contados, não listados

    const { rows: [judicial] } = await admin.query(
      `SELECT id FROM document WHERE person_id=$1 AND category='judicial_socioassistencial'`, [alice]);
    await request(http).get(`/api/v1/people/${alice}/documents/${judicial.id}`)
      .set(auth(tokens.educador)).expect(404);                 // idêntico a inexistente

    const { rows: [saude] } = await admin.query(
      `SELECT id FROM document WHERE person_id=$1 AND category='saude'`, [alice]);
    const ok = await request(http).get(`/api/v1/people/${alice}/documents/${saude.id}`)
      .set(auth(tokens.educador));
    expect(ok.status).toBe(200);
    const { rows } = await admin.query(
      `SELECT 1 FROM audit_event WHERE action='document.open' AND entity_id=$1`, [saude.id]);
    expect(rows.length).toBeGreaterThan(0);                    // abertura auditada
  });

  it('educador não altera dados estruturais do perfil', async () => {
    await request(http).patch(`/api/v1/people/${alice}`)
      .set(auth(tokens.educador)).send({ escolaNome: 'Outra escola' }).expect(403);
  });

  it('cenário #25 — relatório da cozinha traz só o mínimo, sem CPF nem judicial', async () => {
    const res = await request(http).get(`/api/v1/reports/kitchen?houseId=${AI3}`).set(auth(tokens.coord3));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const chaves = new Set(res.body.flatMap((r: any) => Object.keys(r)));
    expect(chaves).toEqual(new Set(['nome', 'evitar', 'substituicao', 'orientacao', 'revisarEm']));
    expect(JSON.stringify(res.body)).not.toMatch(/\d{11}|cpf|judicial/i);
  });

  // ---------- CPF, duplicidade e retorno ----------

  it('cenário #4 — CPF já ativo na casa não cria duplicata: manda abrir o existente', async () => {
    const { rows: [p] } = await admin.query(`SELECT cpf FROM person WHERE id=$1`, [alice]);
    const check = await request(http).post('/api/v1/people/check-cpf')
      .set(auth(tokens.tecnica)).send({ cpf: p.cpf });
    expect(check.body.situacao).toBe('ativo_mesma_casa');
    expect(check.body.personId).toBe(alice);

    const dup = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Tentativa duplicada', birthDate: '2015-01-01', cpf: p.cpf });
    expect(dup.status).toBe(409);
    const { rows } = await admin.query(`SELECT count(*)::int n FROM person WHERE cpf=$1`, [p.cpf]);
    expect(rows[0].n).toBe(1);
  });

  it('CPF ativo em outra casa: informa o estado e propõe transferência, sem revelar conteúdo', async () => {
    const { rows: [p] } = await admin.query(`SELECT cpf FROM person WHERE id=$1`, [lucas]);
    const check = await request(http).post('/api/v1/people/check-cpf')
      .set(auth(tokens.tecnica)).send({ cpf: p.cpf });
    expect(check.body.situacao).toBe('ativo_outra_casa');
    expect(check.body.personId).toBeNull();                    // nada de id, nome ou casa
    expect(check.body.acao).toMatch(/transferência/i);
    // e o perfil segue inacessível pela rota direta
    await request(http).get(`/api/v1/people/${lucas}`).set(auth(tokens.tecnica)).expect(404);
  });

  it('CPF inválido é recusado antes de qualquer escrita', async () => {
    const res = await request(http).post('/api/v1/people/check-cpf')
      .set(auth(tokens.tecnica)).send({ cpf: '111.111.111-11' });
    expect(res.status).toBe(400);
  });

  it('cenário #5 — retorno cria novo episódio no mesmo perfil, preservando o anterior', async () => {
    const { rows: [p] } = await admin.query(`SELECT cpf FROM person WHERE id=$1`, [vitoria]);
    const check = await request(http).post('/api/v1/people/check-cpf')
      .set(auth(tokens.tecnica)).send({ cpf: p.cpf });
    expect(check.body.situacao).toBe('no_acervo');

    const ret = await request(http).post(`/api/v1/people/${vitoria}/readmit`)
      .set(auth(tokens.tecnica)).send({ houseId: AI3 });
    expect(ret.status).toBe(201);
    expect(ret.body.episodio).toBe(2);
    expect(ret.body.aviso).toMatch(/Enfermagem/);              // não reativa medicação sozinho

    const { rows } = await admin.query(
      `SELECT number, status FROM care_episode WHERE person_id=$1 ORDER BY number`, [vitoria]);
    expect(rows).toEqual([
      { number: 1, status: 'encerrado' },                      // história preservada
      { number: 2, status: 'ativo' },
    ]);
  });

  it('cadastro sem CPF exige motivo e gera ID provisório com pendência', async () => {
    const semMotivo = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Ingresso urgente (fictício)', birthDate: '2012-03-04' });
    expect(semMotivo.status).toBe(400);

    const ok = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Ingresso urgente (fictício)', birthDate: '2012-03-04',
              provisionalReason: 'Acolhimento de urgência à noite, sem documentos' });
    expect(ok.status).toBe(201);
    expect(ok.body.cpfPendente).toBe(true);
  });

  // ---------- Benefícios ----------

  it('educador e enfermagem não acessam benefícios; a tentativa é auditada', async () => {
    await request(http).post(`/api/v1/people/${otavio}/benefits/view`)
      .set(auth(tokens.educador)).send({ finalidade: 'curiosidade' }).expect(403);
    await request(http).post(`/api/v1/people/${otavio}/benefits/view`)
      .set(auth(tokens.enfermagem)).send({ finalidade: 'x' }).expect(403);
    const { rows } = await admin.query(`SELECT count(*)::int n FROM audit_event WHERE action='benefits.denied'`);
    expect(rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it('coordenação precisa de reautenticação e finalidade para ver benefícios, e cada acesso vira log', async () => {
    const t = await login('coord.ai3@paodospobres.dev');       // sessão nova, sem reautenticação
    await request(http).post(`/api/v1/people/${otavio}/benefits/view`)
      .set(auth(t)).send({ finalidade: 'conferência mensal' }).expect(403);

    await reauth(t).expect(201);
    const semFinalidade = await request(http).post(`/api/v1/people/${otavio}/benefits/view`)
      .set(auth(t)).send({});
    expect(semFinalidade.status).toBe(400);

    const ok = await request(http).post(`/api/v1/people/${otavio}/benefits/view`)
      .set(auth(t)).send({ finalidade: 'conferência mensal' });
    expect(ok.status).toBe(201);
    expect(ok.body.registros[0].banco).toBe('Banco Fictício');

    const { rows } = await admin.query(
      `SELECT purpose FROM audit_event WHERE action='benefits.view' AND entity_id=$1 ORDER BY at DESC LIMIT 1`, [otavio]);
    expect(rows[0].purpose).toBe('conferência mensal');
  });

  it('log de benefícios guarda finalidade e metadados, nunca o número da conta', async () => {
    const { rows } = await admin.query(
      `SELECT detail::text FROM audit_event WHERE action LIKE 'benefits.%'`);
    for (const r of rows) expect(r.detail).not.toMatch(/00000-0|Banco Fict/);
  });

  // ---------- Transferência ----------

  it('cenários #6, #7 e #39 — casa muda só no aceite; origem perde acesso, destino ganha', async () => {
    // 1. origem solicita
    const req = await request(http).post('/api/v1/transfers').set(auth(tokens.tecnica))
      .send({ personId: alice, toHouseId: AI4, reason: 'Aproximação da rede de apoio familiar' });
    expect(req.status).toBe(201);
    const transferId = req.body.id;

    // 2. enquanto pendente, NADA muda: origem ainda vê, destino ainda não
    const naOrigem = await request(http).get(`/api/v1/people/${alice}`).set(auth(tokens.tecnica));
    expect(naOrigem.body.casaAtual.codigo).toBe('AI3');
    await request(http).get(`/api/v1/people/${alice}`).set(auth(tokens.coord4)).expect(404);

    // 3. o destino vê QUEM é, DE ONDE vem e POR QUÊ — e nada além disso.
    //    O perfil (saúde, documentos, benefícios, histórico) continua fechado
    //    até o aceite: o 404 do passo 2 é a prova.
    const caixa = await request(http).get(`/api/v1/transfers/inbox?houseId=${AI4}`).set(auth(tokens.coord4));
    expect(caixa.body.solicitacoes).toHaveLength(1);
    const s = caixa.body.solicitacoes[0];
    expect(s.nomeCompleto).toBeTruthy();
    expect(s.origem.codigo).toBe('AI3');
    expect(s.motivo).toMatch(/rede de apoio/i);
    expect(s.solicitadaPor).toBeTruthy();
    expect(Object.keys(s).sort()).toEqual(
      ['id', 'idade', 'mensagens', 'motivo', 'nomeCompleto', 'nomeSocial',
       'origem', 'solicitadaEm', 'solicitadaPor']);

    // 4. coordenação de origem AINDA acessa benefícios (responsabilidade é dela)
    const tOrigem = await login('coord.ai3@paodospobres.dev');
    await reauth(tOrigem);
    await request(http).post(`/api/v1/people/${alice}/benefits/view`)
      .set(auth(tOrigem)).send({ finalidade: 'antes da transferência' }).expect(201);

    // 5. destino aceita
    const aceite = await request(http).post(`/api/v1/transfers/${transferId}/accept`)
      .set(auth(tokens.coord4)).send({ nota: 'Vaga confirmada' });
    expect(aceite.status).toBe(201);

    // 6. perfil sumiu da origem e apareceu no destino
    await request(http).get(`/api/v1/people/${alice}`).set(auth(tokens.tecnica)).expect(404);
    const noDestino = await request(http).get(`/api/v1/people/${alice}`).set(auth(tokens.coord4));
    expect(noDestino.status).toBe(200);
    expect(noDestino.body.casaAtual.codigo).toBe('AI4');

    // 7. histórico inteiro acompanhou o acolhido
    expect(noDestino.body.alertasEssenciais[0].descricao).toMatch(/Amendoim/);
    expect(noDestino.body.restricoesAlimentares.length).toBeGreaterThan(0);
    expect(noDestino.body.episodios).toHaveLength(1);

    // 8. #39: origem perdeu os dados bancários; destino passou a acessá-los
    await request(http).post(`/api/v1/people/${alice}/benefits/view`)
      .set(auth(tOrigem)).send({ finalidade: 'depois da transferência' }).expect(403);
    const tDestino = await login('coord.ai4@paodospobres.dev');
    await reauth(tDestino);
    await request(http).post(`/api/v1/people/${alice}/benefits/view`)
      .set(auth(tDestino)).send({ finalidade: 'recebimento da transferência' }).expect(201);

    // 9. permanência anterior permanece no histórico, encerrada — nada foi apagado
    const { rows } = await admin.query(
      `SELECT status, end_reason FROM house_stay WHERE person_id=$1 ORDER BY started_at`, [alice]);
    expect(rows[0]).toEqual({ status: 'encerrada', end_reason: 'transferencia' });
    expect(rows[1].status).toBe('ativa');
  });

  it('não há duas transferências pendentes para o mesmo acolhido', async () => {
    const um = await request(http).post('/api/v1/transfers').set(auth(tokens.coord4))
      .send({ personId: alice, toHouseId: AI3, reason: 'retorno à casa de origem' });
    expect(um.status).toBe(201);
    devolvida = um.body.id;
    const dois = await request(http).post('/api/v1/transfers').set(auth(tokens.coord4))
      .send({ personId: alice, toHouseId: AI3, reason: 'pedido duplicado, para verificar o bloqueio' });
    expect(dois.status).toBe(409);
  });

  // ---------- Duas caixas, conversa e recusa justificada ----------

  it('a coordenação nomeia as unidades para escolher destino, e continua sem enxergar dentro delas', async () => {
    const cat = await request(http).get('/api/v1/houses/directory').set(auth(tokens.coord3));
    expect(cat.body).toHaveLength(8);
    expect(cat.body.filter((h: any) => h.propria).map((h: any) => h.codigo)).toEqual(['AI3']);
    // Só o catálogo: código, nome e tipo. Nada de dentro da casa.
    expect(Object.keys(cat.body[0]).sort()).toEqual(['codigo', 'id', 'nome', 'propria', 'tipo']);

    // O catálogo não amplia nada: a AI4 continua invisível por dentro.
    const outra = await request(http).get(`/api/v1/people?houseId=${AI4}`).set(auth(tokens.coord3));
    expect(outra.body).toEqual([]);
    await request(http).get(`/api/v1/houses/${AI4}`).set(auth(tokens.coord3)).expect(404);

    // Educador não decide transferência: não recebe o catálogo.
    const doEducador = await request(http).get('/api/v1/houses/directory').set(auth(tokens.educador));
    expect(doEducador.body).toEqual([]);
  });

  it('as duas coordenações conversam sobre a solicitação sem entrar na casa uma da outra', async () => {
    // O destino (AI3) escreve; a origem (AI4) responde.
    const daAI3 = await request(http).post(`/api/v1/transfers/${devolvida}/messages`)
      .set(auth(tokens.coord3)).send({ casaId: AI3, texto: 'Temos vaga a partir da semana que vem. Há acompanhamento escolar em curso?' });
    expect(daAI3.status).toBe(201);

    const daAI4 = await request(http).post(`/api/v1/transfers/${devolvida}/messages`)
      .set(auth(tokens.coord4)).send({ casaId: AI4, texto: 'Sim, matrícula ativa na EMEF do bairro; a equipe técnica envia o relatório.' });
    expect(daAI4.status).toBe(201);

    const conversa = await request(http).get(`/api/v1/transfers/${devolvida}/messages`)
      .set(auth(tokens.coord3));
    expect(conversa.body).toHaveLength(2);
    expect(conversa.body.map((m: any) => m.casa)).toEqual(['AI3', 'AI4']);
    expect(conversa.body[0].minha).toBe(true);
    expect(conversa.body[1].minha).toBe(false);

    // O educador não participa: transferência é ato de coordenação.
    const educadorTenta = await request(http).get(`/api/v1/transfers/${devolvida}/messages`)
      .set(auth(tokens.educador));
    expect(educadorTenta.body).toHaveLength(0);

    // Ninguém escreve em nome de uma casa que não é sua.
    const forjada = await request(http).post(`/api/v1/transfers/${devolvida}/messages`)
      .set(auth(tokens.coord3)).send({ casaId: AI4, texto: 'Falando pela outra casa.' });
    expect(forjada.status).toBe(403);
  });

  it('recusar exige motivo — e o motivo aparece nas duas casas', async () => {
    const semMotivo = await request(http).post(`/api/v1/transfers/${devolvida}/decline`)
      .set(auth(tokens.coord3)).send({ motivo: 'não dá' });
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.message).toMatch(/mínimo 15/);

    // Quem recusa é o DESTINO. A origem não decide pelo outro.
    const origemTenta = await request(http).post(`/api/v1/transfers/${devolvida}/decline`)
      .set(auth(tokens.coord4))
      .send({ motivo: 'Recusando a própria solicitação para testar a fronteira.' });
    expect(origemTenta.status).toBe(403);

    const recusa = await request(http).post(`/api/v1/transfers/${devolvida}/decline`)
      .set(auth(tokens.coord3))
      .send({ motivo: 'Sem vaga no perfil etário até o fim do mês; sugerimos reavaliar em 30 dias.' });
    expect(recusa.status).toBe(201);
    expect(recusa.body.status).toBe('devolvida');

    // A origem lê a justificativa na PRÓPRIA caixa, sem entrar na casa do destino.
    const daCasa = await request(http).get(`/api/v1/transfers/outbox?houseId=${AI4}`).set(auth(tokens.coord4));
    const item = daCasa.body.solicitacoes.find((x: any) => x.id === devolvida);
    expect(item.status).toBe('devolvida');
    expect(item.situacao).toMatch(/Recusada com justificativa/);
    expect(item.justificativa).toMatch(/perfil etário/);
    expect(item.destino.codigo).toBe('AI3');
    expect(item.nomeCompleto).toBeTruthy();

    // E o registro existe nas duas casas na auditoria.
    const { rows } = await admin.query(
      `SELECT h.code, a.action FROM audit_event a JOIN house h ON h.id = a.house_id
        WHERE a.entity_id = $1 AND a.action LIKE 'transfer.decline%' ORDER BY h.code`, [devolvida]);
    expect(rows.map((r: any) => r.code).sort()).toEqual(['AI3', 'AI4']);

    // Nada mudou de lugar: o acolhido continua na origem.
    const { rows: casa } = await admin.query(
      `SELECT h.code FROM house_stay s JOIN house h ON h.id = s.house_id
        WHERE s.person_id = $1 AND s.status = 'ativa'`, [alice]);
    expect(casa[0].code).toBe('AI4');
  });

  it('a origem cancela a própria solicitação; decisão já tomada não se apaga', async () => {
    const nova = await request(http).post('/api/v1/transfers').set(auth(tokens.coord4))
      .send({ personId: alice, toHouseId: AI3, reason: 'nova tentativa após reavaliação da equipe' });
    expect(nova.status).toBe(201);

    // O destino não cancela o pedido do outro.
    const destinoTenta = await request(http).post(`/api/v1/transfers/${nova.body.id}/cancel`)
      .set(auth(tokens.coord3)).send({ motivo: 'cancelando o pedido alheio' });
    expect(destinoTenta.status).toBe(403);

    const cancelada = await request(http).post(`/api/v1/transfers/${nova.body.id}/cancel`)
      .set(auth(tokens.coord4)).send({ motivo: 'Família mudou de endereço; destino deixou de fazer sentido.' });
    expect(cancelada.body.status).toBe('cancelada');

    // A recusa anterior continua lá, com a justificativa intacta.
    const tentaReescrever = await request(http).post(`/api/v1/transfers/${devolvida}/cancel`)
      .set(auth(tokens.coord4)).send({ motivo: 'tentando apagar a recusa recebida' });
    expect(tentaReescrever.status).toBe(400);
  });

  // ---------- Acervo ----------

  it('saída leva o perfil ao acervo: educador perde acesso, equipe técnica mantém continuidade', async () => {
    const { rows: [theo] } = await admin.query(`SELECT id FROM person WHERE social_name='Theo'`);
    await request(http).post(`/api/v1/people/${theo.id}/discharge`)
      .set(auth(tokens.tecnica)).send({ motivo: 'reintegração familiar' }).expect(201);

    await request(http).get(`/api/v1/people/${theo.id}`).set(auth(tokens.educador)).expect(404);
    const tecnica = await request(http).get(`/api/v1/people/${theo.id}`).set(auth(tokens.tecnica));
    expect(tecnica.status).toBe(200);
    expect(tecnica.body.noAcervo).toBe(true);
    expect(tecnica.body.casaAtual).toBeNull();

    const lista = await request(http).get(`/api/v1/people?houseId=${AI3}`).set(auth(tokens.educador));
    expect(lista.body.find((p: any) => p.id === theo.id)).toBeUndefined();
  });

  it('exclusão comum não existe: o papel de aplicação não tem DELETE', async () => {
    const appClient = new Client({
      connectionString: process.env.DATABASE_APP_URL ??
        'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher',
    });
    await appClient.connect();
    await expect(appClient.query(`DELETE FROM person`)).rejects.toThrow(/permission denied|permissão negada/i);
    await appClient.end();
  });
});
