/**
 * A SAÚDE DA IMPLANTAÇÃO (fase 185, ideia 9 de 30/09; quem vê decidido em 05/10).
 *
 * O que roda sozinho no servidor anota como terminou, e o Gestor Geral e a
 * Coordenação Geral leem num painel. Cobra-se aqui:
 *
 *  - quem lê e quem não lê, pela rota (a coordenação de UMA casa, não);
 *  - o efeito que a pessoa vê: o e-mail que não saiu aparece PARADO no painel,
 *    e o que saiu depois volta a EM DIA — lido pela rota, não pelo banco;
 *  - que a anotação não carrega o endereço de ninguém;
 *  - que ninguém escreve nem lê a tabela direto, e que nada nela se reescreve;
 *  - a regra de cada sinal, pela função, com o instante como parâmetro (lição
 *    da 168: não depende do relógio de hoje);
 *  - e que cada um dos que rodam sozinhos continua chamando a anotação, porque
 *    o relógio e os scripts do servidor não sobem na suíte.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/kernel/database/database.service';
import { MailGateway } from '../src/modules/identity/mail.gateway';
import { avaliar, avaliarDrive } from '../src/modules/relogio/implantacao.service';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const RAIZ = join(__dirname, '..', '..');

describe('A saúde da implantação', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const rodada = Date.now().toString(36);

  const login = async (email: string, senha = SENHA) => {
    const r = await request(http).post('/api/v1/auth/login').send({ email, password: senha });
    if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
    return r.body.token as string;
  };
  const get = (tk: string, rota: string) =>
    request(http).get(`/api/v1${rota}`).set({ Authorization: `Bearer ${tk}` });
  const sinal = async (tk: string, cod: string) =>
    ((await get(tk, '/implantacao/saude')).body.sinais as any[]).find((s) => s.cod === cod);

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    t.gestor = await login('gestor@paodospobres.dev');
    t.coord3 = await login('coord.ai3@paodospobres.dev');
    t.educador = await login('educador.ai3@paodospobres.dev');

    const email = `coordenacao.geral.saude.${rodada}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set({ Authorization: `Bearer ${t.gestor}` })
      .send({ nome: 'Coordenação Geral da Saúde da Implantação (fictício)', email,
        cargo: 'coordenador', todasAsCasas: true, senhaInicial: 'senha-geral-1' });
    expect(r.status).toBe(201);
    ids.geral = r.body.id;
    t.geral = await login(email, 'senha-geral-1');
  });

  afterAll(async () => {
    delete process.env.EMAIL_MODO;
    if (ids.drive) await admin.query(`UPDATE archive_item SET status = 'verificado' WHERE id = $1`, [ids.drive]);
    if (ids.geral) {
      await request(http).post(`/api/v1/staff/${ids.geral}/deactivate`)
        .set({ Authorization: `Bearer ${t.gestor}` })
        .send({ motivo: 'Conta fictícia da suíte da saúde da implantação.' });
    }
    await app.close(); await admin.end();
  });

  it('o Gestor Geral e a Coordenação Geral leem; a coordenação de uma casa e o educador, não', async () => {
    for (const quem of ['gestor', 'geral']) {
      const r = await get(t[quem], '/implantacao/saude');
      expect(r.status).toBe(200);
      expect((r.body.sinais as any[]).map((s) => s.cod))
        .toEqual(['relogio', 'fim_do_plantao', 'backup', 'restauracao', 'email', 'drive']);
    }
    for (const quem of ['coord3', 'educador']) {
      const r = await get(t[quem], '/implantacao/saude');
      expect(r.status).toBe(403);
      expect(r.body.message).toMatch(/Gestor Geral e da Coordenação Geral/);
    }
  });

  it('o e-mail que não saiu aparece parado no painel, e o que saiu depois volta a em dia', async () => {
    const correio = app.get(MailGateway, { strict: false });
    const para = `alguem.${rodada}@exemplo.dev`;
    process.env.EMAIL_MODO = 'falha';
    await expect(correio.enviar({ para, assunto: 'Convite', corpo: 'link-secreto' })).rejects.toThrow();
    const parado = await sinal(t.gestor, 'email');
    expect(parado.estado).toBe('parado');
    expect(parado.frase).toMatch(/NÃO saiu/);
    expect(parado.falhas7d).toBeGreaterThanOrEqual(1);

    delete process.env.EMAIL_MODO;
    await correio.enviar({ para, assunto: 'Convite', corpo: 'link-secreto' });
    const emDia = await sinal(t.geral, 'email');
    expect(emDia.estado).toBe('em_dia');
    expect(emDia.falhas7d).toBeGreaterThanOrEqual(1);

    /* Nem o endereço, nem o assunto, nem o corpo entram na anotação. */
    const { rows } = await admin.query(
      `SELECT detalhe::text AS d FROM implantacao_evento WHERE tipo = 'email' ORDER BY em DESC LIMIT 2`);
    for (const r of rows) expect(r.d).not.toMatch(/@|Convite|link-secreto/);
  });

  it('o relógio que anota falha aparece parado, dizendo quando foi o último que deu certo', async () => {
    await admin.query(`SELECT app_anotar_implantacao('relogio', true, '{"casas": 8}')`);
    expect((await sinal(t.gestor, 'relogio')).estado).toBe('em_dia');
    await admin.query(`SELECT app_anotar_implantacao('relogio', false, '{"falhas": 1}')`);
    const s = await sinal(t.gestor, 'relogio');
    expect(s.estado).toBe('parado');
    expect(s.frase).toMatch(/falha.*O último que deu certo foi agora há pouco/);
  });

  it('documento que não foi para o Drive deixa a fila parada, em contagem e sem nome', async () => {
    const casa = (await admin.query(`SELECT id FROM house WHERE code = 'AI3'`)).rows[0].id;
    const { rows: [item] } = await admin.query(
      `INSERT INTO archive_item (house_id, ano, mes, categoria, entity, entity_id, caminho, filename, status, tentativas)
       VALUES ($1, 2040, 1, 'ata', 'ata', gen_random_uuid(), 'AI3/2040/01/ata', $2, 'falhou', 5) RETURNING id`,
      [casa, `ata-suite-${rodada}.pdf`]);
    ids.drive = item.id;
    const s = await sinal(t.gestor, 'drive');
    expect(s.estado).toBe('parado');
    expect(s.frase).toMatch(/não consegui(u|ram) ir para o Drive/);
    expect(JSON.stringify(s)).not.toContain('ata-suite');
  });

  it('ninguém escreve nem lê a tabela direto, nada nela se reescreve, e detalhe grande é recusado', async () => {
    const db = app.get(DatabaseService);
    await expect(db.query(`SELECT * FROM implantacao_evento`)).rejects.toThrow(/permission denied/);
    await expect(db.query(`INSERT INTO implantacao_evento (tipo, ok) VALUES ('backup', true)`))
      .rejects.toThrow(/permission denied/);
    await expect(admin.query(`UPDATE implantacao_evento SET ok = true WHERE NOT ok`))
      .rejects.toThrow(/registro_imutavel/);
    await expect(admin.query(`DELETE FROM implantacao_evento`)).rejects.toThrow(/registro_imutavel/);
    await expect(db.query(`SELECT app_anotar_implantacao('backup', true, $1::jsonb)`,
      [JSON.stringify({ texto: 'x'.repeat(1200) })])).rejects.toThrow(/detalhe_grande_demais/);
    /* E a leitura sem identidade não passa pela conferência de cargo. */
    await expect(db.query(`SELECT app_saude_da_implantacao()`)).rejects.toThrow(/sem_permissao_implantacao/);
  });

  describe('a regra de cada sinal, com o instante como parâmetro', () => {
    const agora = Date.UTC(2040, 5, 10, 12, 0);
    const em = (horas: number) => new Date(agora - horas * 3_600_000).toISOString();
    const ok = (horas: number) => ({ ultimo: { em: em(horas), ok: true, detalhe: {} }, ultimoOk: em(horas), falhas7d: 0 });

    it('backup: em dia até 26 horas, atenção até três dias, parado depois', () => {
      expect(avaliar('backup', ok(20), agora).estado).toBe('em_dia');
      expect(avaliar('backup', ok(30), agora).estado).toBe('atencao');
      expect(avaliar('backup', ok(80), agora).estado).toBe('parado');
      expect(avaliar('backup', undefined, agora).estado).toBe('sem_registro');
    });
    it('relógio: o dia que não nasceu em 26 horas é parado', () => {
      expect(avaliar('relogio', ok(10), agora).estado).toBe('em_dia');
      expect(avaliar('relogio', ok(27), agora).estado).toBe('parado');
    });
    it('o aviso de meia hora roda de dez em dez minutos', () => {
      expect(avaliar('fim_do_plantao', ok(0.2), agora).estado).toBe('em_dia');
      expect(avaliar('fim_do_plantao', ok(1), agora).estado).toBe('atencao');
      expect(avaliar('fim_do_plantao', ok(3), agora).estado).toBe('parado');
    });
    it('restauração conferida: uma vez por mês', () => {
      expect(avaliar('restauracao', ok(24 * 30), agora).estado).toBe('em_dia');
      expect(avaliar('restauracao', ok(24 * 40), agora).estado).toBe('atencao');
    });
    it('e-mail que nunca saiu não é defeito; o que falhou por último é', () => {
      expect(avaliar('email', undefined, agora).estado).toBe('em_dia');
      const falhou = { ultimo: { em: em(1), ok: false, detalhe: {} }, ultimoOk: em(30), falhas7d: 2 };
      expect(avaliar('email', falhou, agora).estado).toBe('parado');
    });
    it('fila do Drive: espera de mais de um dia é atenção, falha é parado', () => {
      expect(avaliarDrive({ aguardando: 0, falhou: 0 }, agora).estado).toBe('em_dia');
      expect(avaliarDrive({ aguardando: 3, falhou: 0, maisAntigoAguardando: em(2) }, agora).estado).toBe('em_dia');
      expect(avaliarDrive({ aguardando: 3, falhou: 0, maisAntigoAguardando: em(30) }, agora).estado).toBe('atencao');
      expect(avaliarDrive({ aguardando: 0, falhou: 1 }, agora).estado).toBe('parado');
    });
  });

  it('cada um que roda sozinho continua anotando', () => {
    const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8');
    expect(ler('backend/src/modules/relogio/relogio.service.ts')).toMatch(/anotarImplantacao\(this\.db, 'relogio'/);
    expect(ler('backend/src/relogio.ts')).toMatch(/'relogio', false, \{ motivo: 'nao_rodou' \}/);
    expect(ler('backend/src/fim-do-plantao.ts')).toMatch(/'fim_do_plantao', true/);
    expect(ler('backend/src/fim-do-plantao.ts')).toMatch(/'fim_do_plantao', false/);
    expect(ler('backend/src/modules/identity/mail.gateway.ts')).toMatch(/anotarImplantacao\(this\.db, 'email'/);
    expect(ler('scripts/backup.sh')).toMatch(/app_anotar_implantacao\('backup'/);
    expect(ler('scripts/restaurar.sh')).toMatch(/app_anotar_implantacao\('restauracao'/);
    /* O backup descartável do ensaio não se passa pelo backup da casa. */
    expect(ler('scripts/restaurar.sh')).toMatch(/BACKUP_NAO_ANOTAR=1 .*backup\.sh/);
  });
});
