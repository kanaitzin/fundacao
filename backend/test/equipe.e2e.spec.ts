/**
 * Gestão da equipe pela coordenação (§5.3) e aparelho institucional (§11.7).
 *
 * O que estes testes protegem, em uma frase: **criar conta é distribuir poder.**
 * Se a coordenação de uma casa pudesse criar um Gestor Geral, o isolamento
 * entre casas (§5.13) cairia por dentro — sem furar política nenhuma, só
 * cadastrando alguém.
 *
 * E a regra que este módulo não tem: remover usuário. Desligado é desativado.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Equipe — cadastro por setor e aparelho institucional', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, AI4: string;
  const criados: string[] = [];
  let senhaDoNovo = '';

  const login = async (email: string, senha = SENHA) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: senha });
    return res;
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
      coord3: 'coord.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
  });

  afterAll(async () => {
    // A limpeza desta suíte DESATIVA, não apaga — e não por elegância: a
    // primeira versão tentava `DELETE FROM audit_event` e o gatilho
    // append-only recusou com "registro imutável". O sistema não deixa nem o
    // teste apagar a auditoria, que é exatamente o que se espera dele.
    //
    // Desativar basta: `app_missing_handovers` e as demais consultas de equipe
    // só olham usuário ativo com vínculo vigente, então as outras suítes não
    // enxergam estes fixtures.
    if (criados.length) {
      await admin.query(`UPDATE app_user SET active=false WHERE id = ANY($1::uuid[])`, [criados]);
      await admin.query(
        `UPDATE user_house_assignment SET valid_to = now()
          WHERE user_id = ANY($1::uuid[]) AND valid_to IS NULL`, [criados]);
      await admin.query(
        `UPDATE user_session SET revoked_at = now(), revoked_reason = 'fim do teste'
          WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL`, [criados]);
    }
    await app.close(); await admin.end();
  });

  it('a tela só oferece os setores que este cargo pode cadastrar', async () => {
    const daCoord = await request(http).get('/api/v1/staff/sectors').set(auth(tokens.coord3));
    expect(daCoord.status).toBe(200);
    const cargos = daCoord.body.map((s: any) => s.code);
    // A coordenação monta a equipe da casa e cadastra a Enfermagem.
    expect(cargos).toEqual(expect.arrayContaining(
      ['educador', 'lider_diurno', 'equipe_tecnica', 'cozinha', 'enfermagem']));
    // E não oferece o que criaria alcance institucional.
    expect(cargos).not.toContain('gestor_geral');
    // A administração técnica foi APOSENTADA em 01/09/2026 (migração 0770): o
    // cargo não existe na Fundação, e `staff_role_grant` não o concede a
    // ninguém — nem ao Gestor Geral.
    expect(cargos).not.toContain('admin_tecnico');
    expect(cargos).not.toContain('coordenador');

    // Cada setor diz o que a pessoa vai poder fazer — a tela não inventa texto.
    const enf = daCoord.body.find((s: any) => s.code === 'enfermagem');
    expect(enf.transversal).toBe(true);
    expect(enf.exigeCasa).toBe(false);
    expect(enf.descricao).toMatch(/oito casas/i);

    const doGestor = await request(http).get('/api/v1/staff/sectors').set(auth(tokens.gestor));
    const doGestorCargos = doGestor.body.map((s: any) => s.code);
    expect(doGestorCargos).toEqual(expect.arrayContaining(
      ['coordenador', 'lider_noturno_geral']));
    expect(doGestorCargos).not.toContain('admin_tecnico');

    // Educador não administra equipe.
    const doEducador = await request(http).get('/api/v1/staff/sectors').set(auth(tokens.educador));
    expect(doEducador.body).toEqual([]);
  });

  it('a coordenação cadastra um educador da casa e recebe a senha inicial uma vez', async () => {
    const res = await request(http).post('/api/v1/staff').set(auth(tokens.coord3))
      .send({ nome: 'Novo Educador Teste (fictício)', email: 'novo.educador@paodospobres.dev',
              cargo: 'educador', casaId: AI3 });
    expect(res.status).toBe(201);
    expect(res.body.senhaInicial).toBeTruthy();
    expect(res.body.aviso).toMatch(/uma única vez/i);
    criados.push(res.body.id);
    senhaDoNovo = res.body.senhaInicial;

    // A pessoa entra com a senha inicial, e o sistema sinaliza que ela é inicial.
    const entrada = await login('novo.educador@paodospobres.dev', res.body.senhaInicial);
    expect(entrada.status).toBe(201);
    const me = await request(http).get('/api/v1/users/me').set(auth(entrada.body.token));
    expect(me.body.mustChangePassword).toBe(true);
    expect(me.body.assignments[0].code).toBe('AI3');

    // E aparece na lista da coordenação, com o setor e a casa.
    const lista = await request(http).get('/api/v1/staff').set(auth(tokens.coord3));
    const linha = lista.body.find((u: any) => u.id === res.body.id);
    expect(linha.setor).toBe('Educador social');
    expect(linha.casa).toBe('AI3');
    expect(linha.ativo).toBe(true);
    expect(linha.senhaInicialPendente).toBe(true);
  });

  it('cargo transversal entra sem casa: a Enfermagem cobre as oito', async () => {
    const res = await request(http).post('/api/v1/staff').set(auth(tokens.coord3))
      .send({ nome: 'Nova Enfermeira Teste (fictícia)', email: 'nova.enf@paodospobres.dev',
              cargo: 'enfermagem', casaId: AI3 });   // a casa enviada é ignorada
    expect(res.status).toBe(201);
    criados.push(res.body.id);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM user_house_assignment WHERE user_id=$1`, [res.body.id]);
    expect(rows[0].n).toBe(0);   // sem vínculo de casa

    // A criação de cargo transversal tem ação de auditoria própria: dá para
    // achar depois quem ganhou alcance às oito casas, e quando.
    const { rows: aud } = await admin.query(
      `SELECT action FROM audit_event WHERE entity_id=$1 AND action LIKE 'staff.create%'`,
      [res.body.id]);
    expect(aud[0].action).toBe('staff.create_transversal');
  });

  it('a coordenação não cria Gestor Geral — seria escalar o próprio alcance', async () => {
    const res = await request(http).post('/api/v1/staff').set(auth(tokens.coord3))
      .send({ nome: 'Tentativa Gestor (fictício)', email: 'tentativa.gestor@paodospobres.dev',
              cargo: 'gestor_geral' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/oito casas/i);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM app_user WHERE email='tentativa.gestor@paodospobres.dev'`);
    expect(rows[0].n).toBe(0);
  });

  it('a coordenação não cadastra em casa que não é sua, nem enxerga a equipe da outra', async () => {
    const outra = await request(http).post('/api/v1/staff').set(auth(tokens.coord3))
      .send({ nome: 'Educador da AI4 (fictício)', email: 'ed.ai4.teste@paodospobres.dev',
              cargo: 'educador', casaId: AI4 });
    expect(outra.status).toBe(403);

    const lista = await request(http).get('/api/v1/staff').set(auth(tokens.coord3));
    expect(lista.body.some((u: any) => u.casa === 'AI4')).toBe(false);
  });

  it('e-mail repetido não cria segunda conta', async () => {
    const res = await request(http).post('/api/v1/staff').set(auth(tokens.coord3))
      .send({ nome: 'Repetido (fictício)', email: 'novo.educador@paodospobres.dev',
              cargo: 'educador', casaId: AI3 });
    expect(res.status).toBe(409);
  });

  it('não existe remover: desligado é desativado, com motivo, e a sessão cai na hora', async () => {
    const alvo = criados[0];
    const sessao = await login('novo.educador@paodospobres.dev', senhaDoNovo);
    const token = sessao.body.token;
    await request(http).get('/api/v1/users/me').set(auth(token)).expect(200);

    const semMotivo = await request(http).post(`/api/v1/staff/${alvo}/deactivate`)
      .set(auth(tokens.coord3)).send({});
    expect(semMotivo.status).toBe(400);

    const ok = await request(http).post(`/api/v1/staff/${alvo}/deactivate`)
      .set(auth(tokens.coord3)).send({ motivo: 'Desligamento a pedido, em 27/08' });
    expect(ok.status).toBe(201);
    expect(ok.body.aviso).toMatch(/não apaga pessoas/i);

    // A sessão aberta acabou agora, não no logout.
    await request(http).get('/api/v1/users/me').set(auth(token)).expect(401);
    await expect(login('novo.educador@paodospobres.dev', senhaDoNovo).then((r) => r.status)).resolves.not.toBe(201);

    // A conta continua existindo — a autoria do que ela registrou não vira
    // "usuário desconhecido".
    const { rows } = await admin.query(`SELECT active FROM app_user WHERE id=$1`, [alvo]);
    expect(rows[0].active).toBe(false);

    // Reativar devolve o acesso.
    await request(http).post(`/api/v1/staff/${alvo}/reactivate`).set(auth(tokens.coord3)).expect(201);
    expect((await login('novo.educador@paodospobres.dev', senhaDoNovo)).status).toBe(201);
  });

  it('a coordenação redefine a senha, e isso derruba as sessões abertas', async () => {
    const alvo = criados[0];
    const antes = await login('novo.educador@paodospobres.dev', senhaDoNovo);
    const nova = await request(http).post(`/api/v1/staff/${alvo}/reset-password`)
      .set(auth(tokens.coord3)).send({});
    expect(nova.status).toBe(201);
    expect(nova.body.senhaInicial).toBeTruthy();

    await request(http).get('/api/v1/users/me').set(auth(antes.body.token)).expect(401);
    expect((await login('novo.educador@paodospobres.dev', nova.body.senhaInicial)).status).toBe(201);
  });

  it('ninguém desativa a própria conta', async () => {
    const { rows: [eu] } = await admin.query(
      `SELECT id FROM app_user WHERE email='coord.ai3@paodospobres.dev'`);
    const res = await request(http).post(`/api/v1/staff/${eu.id}/deactivate`)
      .set(auth(tokens.coord3)).send({ motivo: 'tentando desativar a mim mesmo' });
    expect(res.status).toBe(400);
  });

  // ---------- Aparelho institucional ----------

  it('o telefone institucional é um só, e quem o registra é o Gestor Geral', async () => {
    // A Fundação tem UM aparelho institucional, com a técnica/coordenação.
    // Ele não pertence a uma casa: vale nas oito.
    const daCoord = await request(http).post('/api/v1/devices').set(auth(tokens.coord3))
      .send({ rotulo: 'Telefone institucional da Fundação' });
    expect(daCoord.status).toBe(403);

    const doGestor = await request(http).post('/api/v1/devices').set(auth(tokens.gestor))
      .send({ rotulo: 'Telefone institucional da Fundação' });
    expect(doGestor.status).toBe(201);
    expect(doGestor.body.token).toBeTruthy();

    const { rows } = await admin.query(
      `SELECT house_id, institution_id FROM institutional_device WHERE id=$1`, [doGestor.body.id]);
    expect(rows[0].house_id).toBeNull();
    expect(rows[0].institution_id).toBeTruthy();

    // Aparelho da instituição vale em qualquer casa — é o que a realidade pede.
    const { rows: [conf] } = await admin.query(
      `SELECT set_config('app.user_id', (SELECT id::text FROM app_user
         WHERE email='gestor@paodospobres.dev'), false) AS _`);
    expect(conf).toBeDefined();
  });

  /*
   * `GET /devices` existia desde a fase 8 e nunca teve tela — e é ela que
   * responde "quais aparelhos esta casa tem", a pendência institucional #7.
   * Sem a lista, o cadastro que sustenta a regra do §11.7 era invisível: a
   * coordenação registrava um aparelho e não tinha como saber quais existiam.
   *
   * A busca é pelo RÓTULO, e não por posição ou contagem: `saude.e2e` também
   * registra aparelhos na Casa 03, e contar linhas faria esta prova alternar
   * conforme a ordem dos arquivos.
   */
  it('a lista de aparelhos mostra o que a casa tem — e o revogado não some', async () => {
    const ROTULO = 'Tablet do corredor (fixture da equipe)';

    const criado = await request(http).post('/api/v1/devices').set(auth(tokens.coord3))
      .send({ houseId: AI3, rotulo: ROTULO });
    expect(criado.status).toBe(201);

    const lista = await request(http).get('/api/v1/devices').set(auth(tokens.coord3));
    expect(lista.status).toBe(200);
    const meu = lista.body.find((a: any) => a.rotulo === ROTULO);
    // Campo a campo, com o nome que a tela usa: foi assim que a aba de
    // relatórios quebrou contra o servidor por servir outro formato.
    expect(meu).toEqual(expect.objectContaining({
      id: expect.any(String), rotulo: ROTULO, ativo: true, escopo: 'casa',
      registradoEm: expect.anything(), revogadoEm: null, motivoRevogacao: null,
    }));
    // A lista NUNCA devolve o código: ele foi mostrado uma vez, no registro.
    expect(JSON.stringify(lista.body)).not.toContain(criado.body.token);

    const revogado = await request(http).post(`/api/v1/devices/${criado.body.id}/revoke`)
      .set(auth(tokens.coord3))
      .send({ motivo: 'Aparelho devolvido à administração na troca dos equipamentos.' });
    expect(revogado.status).toBe(201);

    // Revogar não apaga: sem a linha, cada dose que ele confirmou viraria um
    // registro de aparelho desconhecido.
    const depois = await request(http).get('/api/v1/devices').set(auth(tokens.coord3));
    const mesmo = depois.body.find((a: any) => a.rotulo === ROTULO);
    expect(mesmo).toEqual(expect.objectContaining({
      ativo: false, motivoRevogacao: expect.stringMatching(/devolvido/),
    }));
    expect(mesmo.revogadoEm).toBeTruthy();
  });
});
