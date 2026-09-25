/**
 * O QUE A PESSOA LÊ QUANDO O SISTEMA FALHA.
 *
 * Este projeto cuida das frases das telas há dezenas de fases. As frases dos
 * ERROS ficaram de fora — e são as que aparecem no pior momento, quando a
 * pessoa já estava com pressa.
 *
 * Um levantamento encontrou o pior caso: abrir uma internação para uma criança
 * que não existe devolvia **"Internal server error"**. Em inglês, sem dizer o
 * que aconteceu, sem dizer se o registro foi salvo, e sem dizer o que fazer.
 *
 * O oposto seria pior: repassar o texto do Postgres conta o nome da tabela, a
 * existência da política de segurança e a forma do banco — e ainda assim não
 * ajuda ninguém.
 *
 * Esta suíte provoca falhas de verdade e cobra três coisas de cada resposta:
 * que esteja em português, que não tenha jargão de banco, e que diga alguma
 * coisa útil.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** O que jamais pode aparecer numa tela. */
const JARGAO = [
  'Internal server error', 'row-level security', 'violates', 'constraint',
  'duplicate key', 'null value in column', 'relation', 'ERROR:', 'pg_', 'uuid',
  'syntax error', 'undefined', 'null', 'Error:',
];

describe('Nenhuma falha chega em jargão à pessoa', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3 = '';

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    /* O filtro vem do AppModule desde a fase 155 — antes ele era ligado aqui à
     * mão, e as outras suítes rodavam sem ele. */
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();

    for (const [k, email] of Object.entries({
      coord: 'coord.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
    })) {
      tokens[k] = (await request(http).post('/api/v1/auth/login')
        .send({ email, password: SENHA })).body.token;
    }
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  const conferir = (nome: string, r: any) => {
    const msg = String(r.body?.message ?? '');
    /* Uma mensagem vazia é tão ruim quanto uma em inglês. */
    expect({ nome, tem: msg.length > 20 }).toEqual({ nome, tem: true });
    for (const proibido of JARGAO) {
      expect({ nome, contem: msg.includes(proibido) ? proibido : null })
        .toEqual({ nome, contem: null });
    }
    /* Português: uma frase de verdade tem acento ou uma palavra nossa. */
    expect({ nome, portugues: /[áâãéêíóôõúç]|\bde\b|\bque\b|\bnão\b/i.test(msg) })
      .toEqual({ nome, portugues: true });
  };

  it('chave estrangeira: apontar para uma criança que não existe', async () => {
    /*
     * O caso que motivou tudo. Antes: 500 "Internal server error".
     */
    const r = await request(http).post('/api/v1/nursing/hospitalizations')
      .set({ Authorization: `Bearer ${tokens.coord}` })
      .send({ personId: '00000000-0000-0000-0000-000000000000', houseId: AI3,
              hospital: 'Hospital fictício',
              motivo: 'motivo suficientemente longo para passar na validação' });
    expect(r.status).toBe(400);
    conferir('chave estrangeira', r);
    expect(String(r.body.message)).toMatch(/não existe mais|digitado errado/i);
  });

  it('fora do alcance: escrever sobre criança de outra casa', async () => {
    const { rows: [outra] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN house h ON h.id = hs.house_id
        WHERE h.code = 'AI4' AND hs.status = 'ativa' LIMIT 1`);
    if (!outra) return;
    const r = await request(http).post('/api/v1/impacto/marcos')
      .set({ Authorization: `Bearer ${tokens.tecnica}` })
      .send({ personId: outra.id, tipo: 'aprovacao_escolar',
              descricao: 'tentativa fora do alcance, para conferir a mensagem' });
    expect([403, 404]).toContain(r.status);
    conferir('fora do alcance', r);
  });

  it('permissão: quem não pode fazer, lê por que e o que fazer', async () => {
    const r = await request(http).post('/api/v1/impacto/marcos')
      .set({ Authorization: `Bearer ${tokens.educador}` })
      .send({ personId: '00000000-0000-0000-0000-000000000000',
              tipo: 'aprovacao_escolar', descricao: 'o educador não registra marco' });
    expect(r.status).toBe(403);
    conferir('sem permissão', r);
    /* A recusa diz de QUEM é a função — sem isso, a pessoa não sabe a quem
     * pedir, e o sistema vira um muro. */
    expect(String(r.body.message)).toMatch(/técnica|coordenação|Gestor/i);
  });

  it('sessão vencida ou ausente também fala português', async () => {
    const r = await request(http).get(`/api/v1/people?houseId=${AI3}`);
    expect([401, 403]).toContain(r.status);
    conferir('sem sessão', r);
  });

  it('validação: campo obrigatório em branco', async () => {
    const r = await request(http).post('/api/v1/nursing/hospitalizations')
      .set({ Authorization: `Bearer ${tokens.coord}` })
      .send({ houseId: AI3, motivo: 'sem dizer em que hospital a criança está' });
    expect(r.status).toBe(400);
    conferir('campo obrigatório', r);
  });

  it('a falha imprevista diz que NÃO foi salvo — e não manda tentar mais tarde', async () => {
    /*
     * A frase do caso que ninguém previu é a mais difícil de escrever, e a
     * mais importante: quem registrou uma dose às 23h precisa saber que aquilo
     * não entrou. "Tente mais tarde" deixa a dúvida no ar justamente onde ela
     * não pode ficar.
     */
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const fonte = readFileSync(
      join(__dirname, '..', 'src', 'kernel', 'common', 'falhas-em-portugues.ts'), 'utf8');
    expect(fonte).toContain('NÃO foi salvo');
    expect(fonte).not.toMatch(/tente mais tarde/i);
    /* E o detalhe técnico precisa ir para o log, senão ninguém descobre nada. */
    expect(fonte).toMatch(/this\.log\.error/);
  });
});
