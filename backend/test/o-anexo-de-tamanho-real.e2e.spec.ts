/**
 * O ANEXO DE TAMANHO REAL (fase 179).
 *
 * Medido em 30/09 contra o servidor de verdade: a foto de 50 KB entrava, a de
 * 90 KB dava 500. O anexo viaja em base64 dentro do JSON, e o leitor do corpo
 * estava no padrão de 100 KB. Toda suíte e a simulação anexavam imagem de
 * poucos bytes, e por isso ninguém viu que nenhuma foto de celular entrava.
 *
 * O que esta suíte guarda:
 *  1. a foto reduzida no aparelho (perto de meio megabyte) ENTRA;
 *  2. o PDF de uma certidão escaneada de dez páginas (12 MB) ENTRA;
 *  3. o arquivo acima do limite do dossiê é recusado pelo SERVIÇO, com a frase
 *     dele, e não pelo leitor do corpo;
 *  4. e o corpo que passa do limite do leitor recebe 413 com uma frase em
 *     português que diz o que fazer, e não "alguma coisa falhou".
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomBytes } from 'crypto';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** Um JPEG do tamanho pedido: cabeçalho de verdade, miolo aleatório, fim de verdade. */
function jpeg(bytes: number): string {
  const cabeca = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const fim = Buffer.from([0xff, 0xd9]);
  const miolo = randomBytes(bytes - cabeca.length - fim.length);
  return `data:image/jpeg;base64,${Buffer.concat([cabeca, miolo, fim]).toString('base64')}`;
}

/** Um PDF do tamanho pedido, inteiro (termina em %%EOF). */
function pdf(bytes: number): string {
  const cabeca = Buffer.from('%PDF-1.4\n%');
  const fim = Buffer.from('\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
  const miolo = Buffer.from(randomBytes(Math.ceil((bytes - cabeca.length - fim.length) / 2))
    .toString('hex').slice(0, bytes - cabeca.length - fim.length));
  return Buffer.concat([cabeca, miolo, fim]).toString('base64');
}

describe('O anexo de tamanho real', () => {
  let app: INestApplication, http: any, admin: Client;
  let token = '', pessoa = '';
  const MB = 1024 * 1024;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();

    const r = await request(http).post('/api/v1/auth/login')
      .send({ email: 'tecnica.ai3@paodospobres.dev', password: SENHA });
    token = r.body.token;
    const { rows: [p] } = await admin.query(
      `SELECT s.person_id FROM house_stay s JOIN house h ON h.id = s.house_id
        WHERE h.code = 'AI3' AND s.status = 'ativa' ORDER BY s.started_at LIMIT 1`);
    pessoa = p.person_id;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  const anexar = (conteudo: string, nomeArquivo: string, titulo: string) =>
    request(http).post(`/api/v1/people/${pessoa}/documents`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ categoria: 'saude', titulo, conteudo, nomeArquivo });

  it('a foto reduzida no aparelho, perto de meio megabyte, entra', async () => {
    const r = await anexar(jpeg(520 * 1024), 'receita.jpg', 'Receita do posto');
    expect(r.status).toBe(201);
    const { rows: [v] } = await admin.query(
      `SELECT size_bytes FROM document_version WHERE document_id = $1`, [r.body.id]);
    expect(Number(v.size_bytes)).toBe(520 * 1024);
  });

  it('a certidão escaneada de 12 MB entra inteira', async () => {
    const r = await anexar(pdf(12 * MB), 'laudo.pdf', 'Laudo do atendimento');
    expect(r.status).toBe(201);
    const { rows: [v] } = await admin.query(
      `SELECT size_bytes FROM document_version WHERE document_id = $1`, [r.body.id]);
    expect(Number(v.size_bytes)).toBe(12 * MB);
  });

  it('acima do limite do dossiê, quem recusa é o serviço, com a frase dele', async () => {
    const r = await anexar(pdf(16 * MB), 'grande.pdf', 'Exame completo');
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/passa de 15 MB/);
  });

  it('o corpo acima do limite do leitor recebe 413 e uma frase que diz o que fazer', async () => {
    const r = await anexar(pdf(30 * MB), 'enorme.pdf', 'Exame enorme');
    expect(r.status).toBe(413);
    expect(r.body.message).toMatch(/grande demais/);
    expect(r.body.message).not.toMatch(/falhou aqui dentro/);
  });
});
