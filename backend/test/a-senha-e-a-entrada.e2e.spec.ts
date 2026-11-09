/**
 * A SENHA E A ENTRADA (fase 291; o A4 da análise geral de 08/11, com as decisões do dono
 * do projeto em 08/11).
 *
 * O que estava aberto:
 *  - a senha inicial saía do `Math.random`, em 63 mil combinações, e a senha podia ter 6
 *    caracteres quaisquer;
 *  - a troca da senha inicial era só sugerida pela tela: quem cadastrou a conta conhecia a
 *    senha e entrava no lugar da pessoa pelo tempo que quisesse;
 *  - a entrada travava só pelo e-mail: uma senha comum tentada em muitos e-mails nunca
 *    chegava a cinco erros em nenhum;
 *  - a conta que passava para a Enfermagem ganhava de volta o vínculo com a casa que a
 *    tela mandava, logo depois de o gatilho da 1683 encerrá-lo;
 *  - o instalador não conferia a senha do `rede_app`.
 *
 * A regra da senha mora em `senha.regra.ts`, lida pelo servidor, pela tela e pelo
 * protótipo: pelo menos 8 caracteres, com uma letra maiúscula e um símbolo.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/kernel/database/database.service';
import { FRASE_DA_SENHA, PALAVRAS_DA_SENHA, oQueFaltaNaSenha, senhaAceita }
  from '../src/kernel/common/senha.regra';
import { senhaInicial } from '../src/modules/identity/staff.service';
import { daPropriaMaquina, enderecoDaTentativa, inteiroPositivo } from '../src/modules/identity/auth.service';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const RAIZ = join(__dirname, '..', '..');
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8');

async function subir(env: Record<string, string | undefined> = {}) {
  const antes: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    antes[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.setGlobalPrefix('api/v1');
  await app.init();
  for (const [k, v] of Object.entries(antes)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return app;
}

describe('A senha e a entrada', () => {
  let app: INestApplication, admin: Client, db: DatabaseService, http: any;
  const rodada = Date.now().toString(36);
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const criados: string[] = [];
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const entrar = (email: string, password: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password });

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    app = await subir();
    http = app.getHttpServer();
    db = app.get(DatabaseService);
    for (const code of ['AI3', 'AI4']) {
      ids[code] = (await admin.query(`SELECT id FROM house WHERE code = $1`, [code])).rows[0].id;
    }
    ids.gestor = (await admin.query(`SELECT id FROM app_user WHERE email = 'gestor@paodospobres.dev'`)).rows[0].id;
    for (const [k, email] of Object.entries({
      coord4: 'coord.ai4@paodospobres.dev', gestor: 'gestor@paodospobres.dev',
    })) {
      tokens[k] = (await entrar(email, SENHA)).body.token;
    }
  });

  afterAll(async () => {
    for (const id of criados) {
      await request(http).post(`/api/v1/staff/${id}/deactivate`).set(auth(tokens.gestor))
        .send({ motivo: 'Conta fictícia da suíte da senha e da entrada.' });
    }
    await app.close(); await admin.end();
  });

  it('a regra: 8 caracteres, uma maiúscula e um símbolo, e a tela diz o que falta', () => {
    for (const fraca of ['senha-dev-123', 'Curta-1', 'SemSimbolo123', 'sem-maiuscula-1', '', 'Com Espaco 12',
                         'Invisivel\u200b123', 'Acento\u0301solto1']) {
      expect([fraca, senhaAceita(fraca)]).toEqual([fraca, false]);
    }
    for (const boa of ['Plantao-da-noite', 'Ácido.amarelo', 'Farol-pipa-0427', 'Casa03!noite']) {
      expect([boa, senhaAceita(boa)]).toEqual([boa, true]);
    }
    expect(senhaAceita(undefined)).toBe(false);
    expect(oQueFaltaNaSenha('abc')).toEqual(['pelo menos 8 caracteres', 'uma letra maiúscula', 'um símbolo']);
    expect(oQueFaltaNaSenha('Plantao-1')).toEqual([]);
  });

  it('a senha inicial sai na regra, sorteada para segredo, e não se repete', () => {
    expect(PALAVRAS_DA_SENHA.length).toBe(64);
    const sorteadas = Array.from({ length: 300 }, () => senhaInicial());
    for (const s of sorteadas) expect([s, senhaAceita(s)]).toEqual([s, true]);
    expect(new Set(sorteadas).size).toBeGreaterThan(295);
    // O sorteio é do `node:crypto`, no servidor, e do `crypto.getRandomValues`, no protótipo.
    expect(ler('backend/src/modules/identity/staff.service.ts')).toMatch(/senhaInicialSorteada\(randomInt\)/);
    expect(ler('frontend/src/mock-casa.ts')).toMatch(/senhaInicialSorteada\(\(n\) => crypto\.getRandomValues/);
    for (const p of ['backend/src/modules/identity/staff.service.ts', 'backend/src/kernel/common/senha.regra.ts']) {
      expect([p, /Math\.random\(/.test(ler(p))]).toEqual([p, false]);
    }
  });

  it('o servidor recusa a senha fraca no cadastro, na redefinição e na troca', async () => {
    const email = `educador.fraco.${rodada}@paodospobres.dev`;
    const fraco = await request(http).post('/api/v1/staff').set(auth(tokens.coord4))
      .send({ nome: 'Educador da Senha Fraca (fictício)', email, cargo: 'educador', casaId: ids.AI4, senhaInicial: 'senha123' });
    expect(fraco.status).toBe(400);
    expect(fraco.body.message).toBe(FRASE_DA_SENHA);

    const r = await request(http).post('/api/v1/staff').set(auth(tokens.coord4))
      .send({ nome: 'Educador da Senha Fraca (fictício)', email, cargo: 'educador', casaId: ids.AI4 });
    expect(r.status).toBe(201);
    criados.push(r.body.id);
    expect(senhaAceita(r.body.senhaInicial)).toBe(true);

    const redefinida = await request(http).post(`/api/v1/staff/${r.body.id}/reset-password`)
      .set(auth(tokens.coord4)).send({ senha: 'fraca' });
    expect(redefinida.status).toBe(400);
    expect(redefinida.body.message).toBe(FRASE_DA_SENHA);

    const entrou = await entrar(email, r.body.senhaInicial);
    const troca = await request(http).post('/api/v1/auth/password').set(auth(entrou.body.token))
      .send({ senhaAtual: r.body.senhaInicial, novaSenha: 'semregra1' });
    expect(troca.status).toBe(400);
    expect(troca.body.message).toBe(FRASE_DA_SENHA);
  });

  it('com a senha inicial, o servidor só abre a troca; depois dela, o resto', async () => {
    const email = `educador.primeiro.${rodada}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set(auth(tokens.coord4))
      .send({ nome: 'Educador do Primeiro Acesso (fictício)', email, cargo: 'educador', casaId: ids.AI4 });
    expect(r.status).toBe(201);
    criados.push(r.body.id);

    const entrou = await entrar(email, r.body.senhaInicial);
    expect(entrou.status).toBe(201);
    expect(entrou.body.user.mustChangePassword).toBe(true);
    const token = entrou.body.token;

    const eu = await request(http).get('/api/v1/users/me').set(auth(token));
    expect(eu.status).toBe(200);
    expect(eu.body.mustChangePassword).toBe(true);
    for (const rota of ['/api/v1/houses', `/api/v1/people?houseId=${ids.AI4}`, '/api/v1/notifications/count']) {
      const recusada = await request(http).get(rota).set(auth(token));
      expect([rota, recusada.status]).toEqual([rota, 403]);
      expect(recusada.body.message).toMatch(/crie a sua senha/);
    }
    const escrita = await request(http).post('/api/v1/staff').set(auth(token)).send({});
    expect(escrita.status).toBe(403);

    const nova = 'Primeira-entrada.9';
    const troca = await request(http).post('/api/v1/auth/password').set(auth(token))
      .send({ senhaAtual: r.body.senhaInicial, novaSenha: nova });
    expect(troca.status).toBe(201);

    // A mesma sessão segue, agora com tudo.
    expect((await request(http).get('/api/v1/houses').set(auth(token))).status).toBe(200);
    expect((await request(http).get('/api/v1/users/me').set(auth(token))).body.mustChangePassword).toBe(false);
    expect((await entrar(email, r.body.senhaInicial)).status).toBe(401);
    expect((await entrar(email, nova)).status).toBe(201);
  });

  it('a senha redefinida pela coordenação também só abre a troca', async () => {
    const email = `educador.redefinido.${rodada}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set(auth(tokens.coord4))
      .send({ nome: 'Educador da Senha Redefinida (fictício)', email, cargo: 'educador', casaId: ids.AI4 });
    criados.push(r.body.id);
    const primeira = await entrar(email, r.body.senhaInicial);
    await request(http).post('/api/v1/auth/password').set(auth(primeira.body.token))
      .send({ senhaAtual: r.body.senhaInicial, novaSenha: 'Minha-senha-01' }).expect(201);

    const redefinida = await request(http).post(`/api/v1/staff/${r.body.id}/reset-password`)
      .set(auth(tokens.coord4)).send({});
    expect(redefinida.status).toBe(201);
    const depois = await entrar(email, redefinida.body.senhaInicial);
    expect(depois.body.user.mustChangePassword).toBe(true);
    expect((await request(http).get('/api/v1/houses').set(auth(depois.body.token))).status).toBe(403);
  });

  it('a senha atual na troca também trava depois de cinco erros, e a entrada junto', async () => {
    const email = `educador.tenta.${rodada}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set(auth(tokens.coord4))
      .send({ nome: 'Educador que Erra a Senha (fictício)', email, cargo: 'educador', casaId: ids.AI4 });
    criados.push(r.body.id);
    const token = (await entrar(email, r.body.senhaInicial)).body.token;
    for (let i = 0; i < 5; i++) {
      const errada = await request(http).post('/api/v1/auth/password').set(auth(token))
        .send({ senhaAtual: `Errada-${i}!`, novaSenha: 'Senha-boa-da-suite!' });
      expect(errada.status).toBe(401);
    }
    const travada = await request(http).post('/api/v1/auth/password').set(auth(token))
      .send({ senhaAtual: r.body.senhaInicial, novaSenha: 'Senha-boa-da-suite!' });
    expect(travada.status).toBe(429);
    expect((await entrar(email, r.body.senhaInicial)).status).toBe(429);
  });

  it('o que abre antes da troca é só quem sou eu, a troca e o sair', () => {
    const abertas: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome);
        if (statSync(p).isDirectory()) { varrer(p); continue; }
        if (!nome.endsWith('.controller.ts')) continue;
        const s = readFileSync(p, 'utf8');
        const prefixo = /@Controller\('([^']*)'\)/.exec(s)?.[1] ?? '';
        const linhas = s.split('\n');
        linhas.forEach((l, i) => {
          if (!l.includes('@PodeAntesDeTrocarASenha()')) return;
          const perto = linhas.slice(Math.max(0, i - 4), i + 2).join('\n');
          const m = /@(Get|Post|Put|Patch|Delete)\('([^']*)'\)/.exec(perto);
          abertas.push(`${m?.[1].toUpperCase()} /${prefixo}/${m?.[2]}`);
        });
      }
    };
    varrer(join(RAIZ, 'backend', 'src'));
    expect(abertas.sort()).toEqual(['GET /users/me', 'POST /auth/logout', 'POST /auth/password']);
  });

  it('o número do .env só vale inteiro e maior que zero, e o endereço se lê como o banco guarda', () => {
    expect(inteiroPositivo(undefined, 20)).toBe(20);
    expect(inteiroPositivo('', 20)).toBe(20);
    expect(inteiroPositivo('  ', 20)).toBe(20);
    expect(inteiroPositivo('trinta', 20)).toBe(20);
    expect(inteiroPositivo('0', 20)).toBe(20);
    expect(inteiroPositivo('-3', 20)).toBe(20);
    expect(inteiroPositivo('2.5', 20)).toBe(20);
    expect(inteiroPositivo('35', 20)).toBe(35);
    expect(enderecoDaTentativa('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(enderecoDaTentativa('2001:db8::1')).toBe('2001:db8::1');
    for (const local of ['127.0.0.1', '::1', '127.0.1.1']) expect(daPropriaMaquina(local)).toBe(true);
    expect(daPropriaMaquina('203.0.113.9')).toBe(false);
    // O servidor escuta só por dentro da máquina.
    expect(ler('backend/src/main.ts')).toMatch(/process\.env\.HOST\?\.trim\(\) \|\| '127\.0\.0\.1'/);
  });

  it('a entrada trava também pelo endereço, contando as contas diferentes que erraram', async () => {
    const atras = await subir({ TRUST_PROXY: '1' });
    const antes = process.env.LOGIN_MAX_POR_ENDERECO;
    const endereco = `203.0.113.${(Date.now() % 200) + 20}`;
    const tentar = (email: string, senha: string) =>
      request(atras.getHttpServer()).post('/api/v1/auth/login').set('X-Forwarded-For', endereco)
        .send({ email, password: senha });
    try {
      process.env.LOGIN_MAX_POR_ENDERECO = '3';
      // A mesma conta errando várias vezes conta uma vez só: é a troca de turno da casa.
      for (let i = 0; i < 3; i++) {
        expect((await tentar(`ninguem.${rodada}.0@paodospobres.dev`, `Errada-${i}!`)).status).toBe(401);
      }
      expect((await tentar('educador.ai4@paodospobres.dev', SENHA)).status).toBe(201);
      // Três e-mails diferentes, um erro em cada: nenhum chega aos cinco da trava por e-mail.
      for (let i = 1; i < 3; i++) {
        expect((await tentar(`ninguem.${rodada}.${i}@paodospobres.dev`, 'Errada-1!')).status).toBe(401);
      }
      // A quarta tentativa do endereço é recusada, mesmo com a senha certa.
      const certa = await tentar('educador.ai4@paodospobres.dev', SENHA);
      expect(certa.status).toBe(429);
      expect(certa.body.message).toMatch(/Muitas tentativas/);
      // O endereço do lado não é atingido.
      const outro = await request(atras.getHttpServer()).post('/api/v1/auth/login')
        .set('X-Forwarded-For', '198.51.100.77').send({ email: 'educador.ai4@paodospobres.dev', password: SENHA });
      expect(outro.status).toBe(201);

      // Na auditoria, a recusa sem o endereço e sem o e-mail.
      const { rows: [linha] } = await admin.query(
        `SELECT detail FROM audit_event WHERE action = 'auth.endereco_travado' ORDER BY at DESC LIMIT 1`);
      expect(linha).toBeTruthy();
      expect(JSON.stringify(linha.detail ?? {})).not.toMatch(/203\.0\.113|paodospobres/);

      // No IPv6, o bloco /64 conta como um endereço só.
      const bloco = `2001:db8:${(Date.now() % 9000) + 1000}:7`;
      const v6 = (sufixo: string, email: string, senha: string) =>
        request(atras.getHttpServer()).post('/api/v1/auth/login')
          .set('X-Forwarded-For', `${bloco}::${sufixo}`).send({ email, password: senha });
      for (let i = 0; i < 3; i++) {
        expect((await v6(`a${i}`, `ninguem.v6.${rodada}.${i}@paodospobres.dev`, 'Errada-1!')).status).toBe(401);
      }
      expect((await v6('b9', 'educador.ai4@paodospobres.dev', SENHA)).status).toBe(429);
    } finally {
      if (antes === undefined) delete process.env.LOGIN_MAX_POR_ENDERECO; else process.env.LOGIN_MAX_POR_ENDERECO = antes;
      await atras.close();
    }
  });

  it('a aplicação conta os erros do endereço, mas não lê as tentativas', async () => {
    const { rows } = await admin.query(`
      SELECT has_function_privilege('rede_app', 'auth_tentativas_do_endereco(inet, integer)', 'EXECUTE') AS conta,
             has_table_privilege('rede_app', 'login_attempt', 'SELECT') AS le,
             (SELECT proconfig FROM pg_proc WHERE proname = 'auth_tentativas_do_endereco') AS config`);
    expect(rows[0].conta).toBe(true);
    expect(rows[0].le).toBe(false);
    expect(String(rows[0].config)).toMatch(/search_path/);
  });

  it('quem passa para a Enfermagem não ganha de volta a casa que a tela mandou', async () => {
    const email = `educador.vira.enfermagem.${rodada}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set(auth(tokens.coord4))
      .send({ nome: 'Educador que Vira Enfermagem (fictício)', email, cargo: 'educador', casaId: ids.AI4 });
    expect(r.status).toBe(201);
    criados.push(r.body.id);

    const mudou = await request(http).patch(`/api/v1/staff/${r.body.id}`).set(auth(tokens.gestor))
      .send({ cargo: 'enfermagem', casaId: ids.AI4 });
    expect(mudou.status).toBe(200);
    const { rows } = await admin.query(
      `SELECT house_id FROM user_house_assignment WHERE user_id = $1 AND valid_to IS NULL`, [r.body.id]);
    expect(rows).toEqual([]);
    // O histórico continua: o vínculo da Casa 04 está encerrado, não apagado.
    const { rows: [h] } = await admin.query(
      `SELECT count(*)::int AS n FROM user_house_assignment WHERE user_id = $1`, [r.body.id]);
    expect(h.n).toBe(1);

    // A aplicação não escreve vínculo nenhum (1680); a segunda trava está no teste seguinte.
    await expect(db.asUser(ids.gestor, (c) => c.query(
      `INSERT INTO user_house_assignment (user_id, house_id, role, created_by)
       VALUES ($1, $2, 'enfermagem', $3)`, [r.body.id, ids.AI4, ids.gestor])))
      .rejects.toThrow(/permission denied/);
    // E a auditoria diz que a pessoa saiu da casa, e não que mudou de casa.
    const { rows: [aud] } = await admin.query(
      `SELECT house_id, detail FROM audit_event WHERE action = 'staff.update' AND entity_id = $1
        ORDER BY at DESC LIMIT 1`, [r.body.id]);
    expect(aud.house_id).toBe(ids.AI4);
    expect(aud.detail).toMatchObject({ cargo_novo: 'enfermagem', mudou_de_casa: false, saiu_da_casa: true });
    const { rows: depois } = await admin.query(
      `SELECT 1 FROM user_house_assignment WHERE user_id = $1 AND valid_to IS NULL`, [r.body.id]);
    expect(depois).toEqual([]);
  });

  it('o gatilho do vínculo recusa a casa aberta de quem atende todas, também pela função', async () => {
    // Pela função do dono, com a identidade do gestor: a aplicação não insere no vínculo (1680).
    const { rows: [enf] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'enfermagem@paodospobres.dev'`);
    await admin.query('BEGIN');
    try {
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [ids.gestor]);
      await expect(admin.query(
        `INSERT INTO user_house_assignment (user_id, house_id, role, created_by)
         VALUES ($1, $2, 'enfermagem', $3)`, [enf.id, ids.AI3, ids.gestor]))
        .rejects.toThrow(/vinculo_de_quem_atende_todas/);
    } finally {
      await admin.query('ROLLBACK');
    }
  });

  it('o instalador confere a senha do rede_app, no .env e no banco', () => {
    const i = ler('scripts/instalar.sh');
    expect(i).toMatch(/DATABASE_APP_URL\)" == \*dev-only-change-me\*/);
    expect(i).toMatch(/o rede_app aceita a senha de desenvolvimento/);
    expect(ler('.env.example')).toMatch(/^LOGIN_MAX_POR_ENDERECO=\d+$/m);
    expect(i).toMatch(/falta "TRUST_PROXY vazio"/);
    expect(i).toMatch(/LOGIN_MAX_ATTEMPTS LOGIN_MAX_POR_ENDERECO LOGIN_LOCK_MINUTES/);
  });
});
