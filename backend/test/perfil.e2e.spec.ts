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

/*
 * Um JPEG mínimo e VÁLIDO: a conferência do dossiê é pela assinatura dos
 * primeiros bytes, não pela extensão do nome (§6.8). Usado pelo cenário #24,
 * que precisa de um documento com arquivo para provar a fronteira no `/file`.
 */
const JPEG_DE_TESTE = `data:image/jpeg;base64,${Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ...new Array(64).fill(0x20), 0xff, 0xd9,
]).toString('base64')}`;

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
      lider: 'lider.ai3@paodospobres.dev',
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

  /**
   * A tela do perfil mostrava "⚠ Dipirona" como alerta essencial — o tipo
   * ficava numa coluna e o texto noutra, e só o texto ia para a tela. Lido de
   * relance, logo acima de "Remédio de hoje", isso não parece aviso de
   * alergia: parece prescrição. O alerta agora sai do banco já como frase que
   * se lê sozinha, no perfil e em toda tela que o mostre.
   */
  it('o alerta essencial diz DO QUE ele é — "Alergia a", nunca só o nome do remédio', async () => {
    const { rows: [lara] } = await admin.query(`SELECT id FROM person WHERE social_name = 'Lara'`);
    const res = await request(http).get(`/api/v1/people/${lara.id}`).set(auth(tokens.educador));
    expect(res.body.alertasEssenciais[0].descricao).toBe('Alergia a Dipirona');

    // E o que já era frase inteira não vira "Intolerância a Intolerância…".
    const { rows: [davi] } = await admin.query(`SELECT id FROM person WHERE social_name = 'Davi'`);
    const dele = await request(http).get(`/api/v1/people/${davi.id}`).set(auth(tokens.educador));
    expect(dele.body.alertasEssenciais[0].descricao).toBe('Intolerância à lactose');

    // A mesma frase na chamada do almoço, que é onde ela decide o prato.
    const chamada = await request(http).post('/api/v1/checks').set(auth(tokens.lider))
      .send({ houseId: AI3, kind: 'alimentacao', titulo: 'Almoço (alerta legível)' });
    if (chamada.status !== 201) throw new Error(`abrir chamada: ${chamada.status} ${JSON.stringify(chamada.body)}`);
    const aberta = await request(http).get(`/api/v1/checks/${chamada.body.id}`).set(auth(tokens.lider));
    if (aberta.status !== 200) throw new Error(`ler chamada: ${aberta.status} ${JSON.stringify(aberta.body)}`);
    const linhaDaLara = aberta.body.linhas.find((l: any) => l.nome === 'Lara');
    expect(linhaDaLara.alertas).toMatch(/^Alergia a Dipirona/);
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

    /*
     * A FRONTEIRA É PROVADA NO `/file` — a rota por onde a TELA passa (fase 130).
     *
     * Até aqui este cenário usava `GET :id/documents/:docId`, uma rota curta que
     * nenhuma tela chamava e que o servidor de mentira nem atendia. Ela devolvia
     * metadado e registrava `document.open` sem nada ser aberto, e era restolho
     * de um plano que não aconteceu — anunciava um download que chegou na fase
     * 124 por outra rota. Provar a fronteira nela era provar onde ninguém passa.
     */
    const { rows: [judicial] } = await admin.query(
      `SELECT id FROM document WHERE person_id=$1 AND category='judicial_socioassistencial'`, [alice]);
    await request(http).get(`/api/v1/people/${alice}/documents/${judicial.id}/file`)
      .set(auth(tokens.educador)).expect(404);                 // idêntico a inexistente

    /*
     * E o de SAÚDE abre. Ele é anexado aqui, com arquivo, pela via normal da
     * tela: o documento de saúde do seed não tem bytes, e o `/file` recusa por
     * FALTA DE ARQUIVO antes de chegar à questão da política — o que faria este
     * cenário passar por motivo errado. A rota curta antiga não mostrava isso
     * porque devolvia só metadado, com `LEFT JOIN`.
     */
    const anexo = await request(http).post(`/api/v1/people/${alice}/documents`)
      .set(auth(tokens.tecnica))
      .send({ chave: 'caderneta_vacinacao', categoria: 'saude',
              titulo: 'Caderneta de vacinação (fictícia)',
              conteudo: JPEG_DE_TESTE, nomeArquivo: 'caderneta.jpg' });
    expect(anexo.status).toBe(201);

    const ok = await request(http).get(`/api/v1/people/${alice}/documents/${anexo.body.id}/file`)
      .set(auth(tokens.educador));
    expect(ok.status).toBe(200);
    const { rows } = await admin.query(
      `SELECT 1 FROM audit_event WHERE action='document.open' AND entity_id=$1`, [anexo.body.id]);
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

  /**
   * O MOTIVO DO INGRESSO URGENTE — exigido desde sempre, gravado desde a 1250.
   *
   * A tela pedia a frase com o mínimo de dez caracteres, o serviço recusava o
   * cadastro sem ela, e o banco **não tinha coluna para ela**: o `INSERT` da
   * 0480 não a listava, e a porta curta (`app_admit_person`) nem criava ficha
   * de entrada. Quem entrava pela urgência — que é exatamente quem entra sem
   * documento — era quem ficava sem nada escrito.
   *
   * A trava mudou de lugar junto: estava só no serviço, e serviço é um caminho
   * entre vários. Este teste chama a função do BANCO por baixo da aplicação
   * para provar que ela recusa sozinha.
   */
  it('cadastro sem CPF exige motivo, gera ID provisório — e o motivo é GRAVADO', async () => {
    const semMotivo = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Ingresso urgente (fictício)', birthDate: '2012-03-04' });
    expect(semMotivo.status).toBe(400);

    const MOTIVO = 'Acolhimento de urgência à noite, sem documentos';
    const ok = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Ingresso urgente (fictício)', birthDate: '2012-03-04',
              provisionalReason: MOTIVO });
    expect(ok.status).toBe(201);
    expect(ok.body.cpfPendente).toBe(true);

    // A frase está no banco, e não só na validação que a deixava passar reto.
    const { rows: [a] } = await admin.query(
      `SELECT provisional_reason, admitted_on FROM admission_record WHERE person_id = $1`,
      [ok.body.personId]);
    expect(a?.provisional_reason).toBe(MOTIVO);
    // E a ficha de entrada existe: a porta curta não criava nenhuma.
    expect(a?.admitted_on).toBeTruthy();

    // E ela sai pela rota que o perfil lê.
    const ficha = await request(http).get(`/api/v1/people/${ok.body.personId}/admission`)
      .set(auth(tokens.tecnica));
    expect(ficha.status).toBe(200);
    expect(ficha.body.motivoProvisorio).toBe(MOTIVO);
    expect(ficha.body.cadastradoPor).toBeTruthy();

    /*
     * E a criança sai da casa no fim (regra 13).
     *
     * Sem isto, cada rodada deixava MAIS UMA criança ativa na AI3. A casa tem
     * capacidade 20; quando ela lota, duas outras suítes — a do cadastro e a da
     * regressão de estado, que testam justamente o LIMITE — reprovam por 400,
     * e o motivo aparece a três arquivos de distância de onde está a causa.
     * Isoladas elas passam, o que é o pior sintoma possível: a suíte inteira
     * fica vermelha e cada parte, sozinha, diz que está tudo bem.
     */
    await request(http).post(`/api/v1/people/${ok.body.personId}/discharge`)
      .set(auth(tokens.tecnica)).send({ motivo: 'Encerramento de fixture de teste' });
  });

  it('a trava do motivo é do BANCO, não do serviço', async () => {
    /*
     * Chamando a função direto, com a conexão da aplicação e o papel da
     * técnica: se a regra vivesse só no NestJS, este caminho passaria — e um
     * script de implantação, ou uma rota nova, entraria sem a frase.
     */
    const { rows: [u] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'tecnica.ai3@paodospobres.dev'`);
    const app_ = new Client({
      connectionString: process.env.DATABASE_APP_URL
        ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher',
    });
    await app_.connect();
    try {
      await app_.query('BEGIN');
      await app_.query(`SELECT set_config('app.user_id', $1, true)`, [u.id]);
      await expect(app_.query(
        `SELECT * FROM app_admit_person($1,$2,$3,$4,$5,$6,$7)`,
        [AI3, 'Sem motivo (fictício)', null, '2013-01-01', null, 'PROV-TESTE', '   '])
      ).rejects.toThrow(/ingresso_sem_cpf_sem_motivo/);
      await app_.query('ROLLBACK');
    } finally { await app_.end(); }
  });

  it('o perfil devolve a identificação complementar que o cadastro pede', async () => {
    /*
     * `gender`, `race`, `birthplace`, `nis` e `civil_registry` são pedidos na
     * tela de cadastro e gravados desde a migração 0480 — e NENHUM `SELECT`
     * do sistema os nomeava. Quem preenchia escrevia num campo que não ia a
     * lugar nenhum; a cor/raça autodeclarada, que é como a política pública se
     * mede, era invisível para quem monta o relatório.
     */
    await admin.query(
      `UPDATE person SET race = 'parda', gender = 'menina', birthplace = 'Viamão / RS',
              nis = '000.00000.00-0', civil_registry = 'Termo 1, livro A-1, folha 1'
        WHERE id = $1`, [otavio]);
    const perfil = await request(http).get(`/api/v1/people/${otavio}`).set(auth(tokens.tecnica));
    expect(perfil.status).toBe(200);
    expect(perfil.body.identificacaoComplementar).toEqual({
      genero: 'menina', raca: 'parda', naturalidade: 'Viamão / RS',
      nis: '000.00000.00-0', registroCivil: 'Termo 1, livro A-1, folha 1',
    });
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
    /*
     * A criança é DESTA suíte, e não o Theo do seed.
     *
     * Até aqui o teste desligava o Theo e nunca o devolvia: cada rodada tirava
     * uma criança da Casa 03, e a suíte do piloto — que cobra os vinte — só não
     * reprovava porque o teste do ingresso urgente, alguns casos acima,
     * deixava OUTRA criança a mais. **Dois vazamentos que se cancelavam**, e a
     * conta fechava por coincidência. Ao consertar um, o outro apareceu.
     */
    const nova = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Acervo Fictício da Saída', socialName: 'AcervoTeste',
              birthDate: '2011-11-11', provisionalReason: 'Ingresso de teste automatizado' });
    expect(nova.status).toBe(201);
    const theo = { id: nova.body.personId as string };

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

  /* =========================================================================
   * O PRONTUÁRIO DE EDUCAÇÃO TEM POR ONDE SER PREENCHIDO (fase 111).
   *
   * `education_support` e `education_evolution` nasceram na migração 0530, do
   * papel que a Fundação entregou em 28/08, e o RELATÓRIO já as lia. Nenhuma
   * rota as escrevia: o único INSERT do repositório estava dentro de um teste
   * (§9, item 3). No piloto, o relatório de desenvolvimento e a audiência
   * concentrada diriam "não há" sobre escola e profissionalização para sempre.
   * ====================================================================== */

  /* A criança é resolvida NA HORA, e não no começo do arquivo: os testes de
     transferência acima movem a Alice entre casas, e quem pega uma referência
     guardada testa outra coisa. É a mesma lição da §6.13, um degrau adiante. */
  async function criancaDaCasa(): Promise<string> {
    const { rows: [r] } = await admin.query(
      `SELECT person_id FROM house_stay
        WHERE house_id = $1 AND status = 'ativa' ORDER BY started_at LIMIT 1`, [AI3]);
    return r.person_id as string;
  }

  it('a educação abre vazia, e a técnica registra o apoio — que o relatório lê', async () => {
    const quem = await criancaDaCasa();
    const vazio = await request(http).get(`/api/v1/nursing/education/${quem}`)
      .set(auth(tokens.tecnica)).expect(200);
    expect(vazio.body.apoio).toBeNull();

    /* Sala de recursos SEM o motivo é recusada: é o motivo que a escola e a
       audiência perguntam, e um "sim" sozinho não responde nada. */
    const semMotivo = await request(http)
      .post(`/api/v1/nursing/education/${quem}/support`)
      .set(auth(tokens.tecnica)).send({ houseId: AI3, salaDeRecursos: true });
    expect(semMotivo.status).toBe(400);

    /* Aprendizagem profissional sem o nome do curso, idem. */
    const semCurso = await request(http)
      .post(`/api/v1/nursing/education/${quem}/support`)
      .set(auth(tokens.tecnica)).send({ houseId: AI3, aprendiz: true });
    expect(semCurso.status).toBe(400);

    const ok = await request(http)
      .post(`/api/v1/nursing/education/${quem}/support`)
      .set(auth(tokens.tecnica)).send({
        houseId: AI3, salaDeRecursos: true,
        motivoDaSala: 'Apoio em leitura e escrita, duas vezes por semana (fictício).',
        servico: 'fono', servicoProfissional: 'Fga. fictícia',
      });
    expect(ok.status).toBe(201);

    const depois = await request(http).get(`/api/v1/nursing/education/${quem}`)
      .set(auth(tokens.tecnica)).expect(200);
    expect(depois.body.apoio.salaDeRecursos).toBe(true);
    expect(depois.body.apoio.servico).toBe('fono');
    /* Toda ação tem autor (regra 6). */
    expect(depois.body.apoio.atualizadoPor).toBeTruthy();

    await admin.query(`DELETE FROM education_support WHERE person_id = $1`, [quem]);
  });

  it('a evolução educacional é do EDUCADOR também — quem acompanha a tarefa é ele', async () => {
    const quem = await criancaDaCasa();
    /* O §8.12 é explícito, e a policy da 0530 já dizia o mesmo. Este teste
       existe porque, até a fase 111, não havia rota nenhuma para provar. */
    const curta = await request(http)
      .post(`/api/v1/nursing/education/${quem}/evolutions`)
      .set(auth(tokens.educador)).send({ houseId: AI3, texto: 'ok' });
    expect(curta.status).toBe(400);

    const escrita = await request(http)
      .post(`/api/v1/nursing/education/${quem}/evolutions`)
      .set(auth(tokens.educador)).send({
        houseId: AI3,
        texto: 'Entregou o trabalho de ciências sem lembrete (registro fictício de teste).',
      });
    expect(escrita.status).toBe(201);

    const lida = await request(http).get(`/api/v1/nursing/education/${quem}`)
      .set(auth(tokens.tecnica)).expect(200);
    const minha = (lida.body.evolucoes as any[]).find((e) => e.id === escrita.body.id);
    expect(minha.texto).toMatch(/ciências/i);
    expect(minha.por).toBeTruthy();

    /* E NÃO SE EDITA: a policy da 0530 não oferece UPDATE, e correção é
       registro novo — como no caderno. */
    await expect(admin.query(
      `UPDATE education_evolution SET narrative = 'reescrito' WHERE id = $1`,
      [escrita.body.id])).resolves.toBeTruthy();   // o DONO do banco pode; a aplicação, não

    await admin.query(`DELETE FROM education_evolution WHERE person_id = $1`, [quem]);
  });

  /* =========================================================================
   * A AUDITORIA PASSA A TER POR ONDE SER LIDA (fase 112).
   *
   * Todo serviço escreve em `audit_event` desde a migração 0010, e NENHUMA
   * rota a lia (§9, item 1) — uma capacidade que a §7 promete a dois cargos,
   * sem porta nenhuma. A policy `audit_select` (0920) já dizia exatamente
   * quem pode: a coordenação na própria casa, e a gestão geral.
   * ====================================================================== */

  it('a auditoria de uma criança abre para a coordenação — e traz a finalidade', async () => {
    const quem = await criancaDaCasa();

    /* Um ato que DECLARA finalidade: é a metade das linhas que alguém vai
       querer ler seis meses depois. */
    await request(http).post(`/api/v1/nursing/education/${quem}/evolutions`)
      .set(auth(tokens.educador))
      .send({ houseId: AI3, texto: 'Registro fictício para a auditoria deste teste.' })
      .expect(201);

    const vista = await request(http).get(`/api/v1/audit/person/${quem}`)
      .set(auth(tokens.coord3)).expect(200);
    expect(vista.body.linhas.length).toBeGreaterThan(0);

    const linha = (vista.body.linhas as any[])[0];
    /* A AÇÃO EM PORTUGUÊS, e o código ao lado: quem lê uma auditoria não tem
       de decorar `education.evolution`. */
    expect(linha.acao).toBeTruthy();
    expect(linha.codigo).toBeTruthy();
    expect(linha.por).toBeTruthy();

    await admin.query(`DELETE FROM education_evolution WHERE person_id = $1`, [quem]);
  });

  it('o educador e a técnica NÃO leem a auditoria — a §7 dá isso a dois cargos', async () => {
    const quem = await criancaDaCasa();
    await request(http).get(`/api/v1/audit/person/${quem}`)
      .set(auth(tokens.educador)).expect(403);
    await request(http).get(`/api/v1/audit/person/${quem}`)
      .set(auth(tokens.tecnica)).expect(403);
  });

  it('NÃO existe busca por pessoa da equipe — e a ausência é a decisão', async () => {
    /*
     * A MESMA TABELA responde "quem abriu o dossiê da Alice" e "tudo o que a
     * Joana fez ontem". A primeira pergunta protege a criança; a segunda mede
     * a pessoa. Este teste existe para que a segunda não apareça numa
     * refatoração distraída — é o mesmo cuidado que guarda a pontuação de
     * comportamento (§8.7.2) por expressão regular.
     */
    const { rows: [alguem] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'educador.ai3@paodospobres.dev'`);
    for (const caminho of [`/api/v1/audit/actor/${alguem.id}`,
                           `/api/v1/audit/user/${alguem.id}`,
                           `/api/v1/audit?actorId=${alguem.id}`]) {
      const r = await request(http).get(caminho).set(auth(tokens.gestor ?? tokens.coord3));
      expect(r.status).toBe(404);
    }

    /* E a resposta que existe não conta NADA: nem acessos, nem aberturas por
       pessoa. Um total ao lado de um nome é uma avaliação que ninguém
       assinou. */
    const quem = await criancaDaCasa();
    const vista = await request(http).get(`/api/v1/audit/person/${quem}`)
      .set(auth(tokens.coord3)).expect(200);
    expect(Object.keys(vista.body).sort()).toEqual(['cortado', 'dias', 'linhas']);
    for (const l of vista.body.linhas as any[]) {
      const proibido = Object.keys(l).filter((k) =>
        /total|quantidade|contagem|acessos|ranking|score/i.test(k));
      expect(proibido).toEqual([]);
    }
  });
});
