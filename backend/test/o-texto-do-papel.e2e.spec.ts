/**
 * O TEXTO DO PAPEL (fase 234, pedido de 22/10: trazer o que melhora o sistema).
 *
 * A leitura do texto acontece no aparelho (`frontend/src/ocr.ts`), e o servidor
 * só recebe o texto que a pessoa conferiu com o papel. Esta suíte cobra o que é
 * do servidor:
 *
 *  1. o texto conferido volta no dossiê, com quem conferiu, e a correção é uma
 *     versão nova, sem apagar a anterior;
 *  2. guarda quem pode anexar documento ao perfil; o educador lê e não guarda;
 *  3. quem é de outra casa não acha o documento;
 *  4. a auditoria leva o tamanho, nunca o texto;
 *  5. as páginas do PDF voltam como imagem, para a leitura no aparelho, e a
 *     abertura fica registrada como a da prévia.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { randomBytes } from 'crypto';
import { createCanvas } from '@napi-rs/canvas';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

function foto(): string {
  const c = createCanvas(900, 500);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 500);
  g.fillStyle = '#111'; g.font = '40px sans-serif';
  g.fillText(`Oficio ${randomBytes(4).toString('hex')}`, 40, 120);
  return `data:image/jpeg;base64,${c.toBuffer('image/jpeg', 85).toString('base64')}`;
}
function pdf(): string {
  const texto = `BT /F1 18 Tf 72 760 Td (Guia de acolhimento ${randomBytes(4).toString('hex')}) Tj ET`;
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${texto.length}>>stream\n${texto}\nendstream`, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  let corpo = '%PDF-1.4\n';
  const pos: number[] = [];
  objs.forEach((o, i) => { pos.push(corpo.length); corpo += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = corpo.length;
  corpo += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    + pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return `data:application/pdf;base64,${Buffer.from(corpo, 'latin1').toString('base64')}`;
}

describe('O texto do papel', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const marca = `Audiencia-${randomBytes(3).toString('hex')}`;

  const guardar = (t: string, docId: string, corpo: any, pessoa = ids.crianca) =>
    request(http).post(`/api/v1/people/${pessoa}/documents/${docId}/texto`).set(auth(t)).send(corpo);
  const doDossie = async (t: string, docId: string) => {
    const d = (await request(http).get(`/api/v1/people/${ids.crianca}/dossie`).set(auth(t))).body;
    const todos = [...d.categorias.flatMap((c: any) => c.itens.flatMap((i: any) => i.documentos)), ...d.avulsos];
    return todos.find((x: any) => x.id === docId);
  };

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
      tecnica: 'tecnica.ai3@paodospobres.dev', educador: 'educador.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
    })) {
      const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
      if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
      tokens[k] = r.body.token;
    }
    ({ rows: [{ person_id: ids.crianca }] } = await admin.query(
      `SELECT s.person_id FROM house_stay s JOIN house h ON h.id = s.house_id
        WHERE h.code = 'AI3' AND s.status = 'ativa' ORDER BY s.person_id LIMIT 1`));
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code = 'AI3'`));
    /* O bilhete da escola o educador alcança; a guia (pessoal), não. */
    for (const [k, conteudo, nome, categoria] of [['foto', foto(), 'bilhete.jpg', 'escolar'], ['pdf', pdf(), 'guia.pdf', 'pessoal']]) {
      const r = await request(http).post(`/api/v1/people/${ids.crianca}/documents`).set(auth(tokens.tecnica))
        .send({ categoria, titulo: `Papel para ler ${k}`, nomeArquivo: nome, conteudo });
      if (r.status !== 201) throw new Error(`anexar ${k}: ${r.status} ${r.body?.message}`);
      ids[k] = r.body.id;
    }
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('o texto conferido volta no dossiê, e a correção é uma versão nova', async () => {
    const r1 = await guardar(tokens.tecnica, ids.foto, { texto: `Oficio da Vara. ${marca} em 12/11.`, origem: 'leitura_no_aparelho' });
    expect([r1.status, r1.body.versao]).toEqual([201, 1]);
    const d1 = await doDossie(tokens.tecnica, ids.foto);
    expect(d1.texto).toMatchObject({ versao: 1, origem: 'leitura_no_aparelho' });
    expect(d1.texto.texto).toContain(marca);
    expect(d1.texto.por).toBeTruthy();

    const r2 = await guardar(tokens.tecnica, ids.foto, { texto: `Ofício da Vara. ${marca} em 13/11.`, origem: 'digitado' });
    expect([r2.status, r2.body.versao]).toEqual([201, 2]);
    expect((await doDossie(tokens.tecnica, ids.foto)).texto).toMatchObject({ versao: 2, origem: 'digitado' });
    const { rows } = await admin.query(
      `SELECT version, texto FROM document_text WHERE document_id = $1 ORDER BY version`, [ids.foto]);
    expect(rows.map((x) => x.version)).toEqual([1, 2]);
    expect(rows[0].texto).toContain('12/11');
  });

  it('o educador lê o texto do que ele alcança, não guarda, e não vê o da categoria que não alcança', async () => {
    const d = await doDossie(tokens.educador, ids.foto);
    expect(d?.texto?.texto).toContain(marca);
    expect((await guardar(tokens.tecnica, ids.pdf, { texto: `Guia ${marca}` })).status).toBe(201);
    expect(await doDossie(tokens.educador, ids.pdf)).toBeUndefined();
    const { rows } = await admin.query(`SELECT count(*)::int AS n FROM document_text WHERE document_id = $1`, [ids.pdf]);
    expect(rows[0].n).toBe(1);
    const r = await guardar(tokens.educador, ids.foto, { texto: 'tentativa' });
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toMatch(/pode anexar documento/);
  });

  it('quem é de outra casa não acha o documento', async () => {
    const r = await guardar(tokens.coord4, ids.foto, { texto: 'de fora' });
    expect(r.status).toBe(404);
    const p = await request(http).get(`/api/v1/people/${ids.crianca}/documents/${ids.foto}/paginas`).set(auth(tokens.coord4));
    expect(p.status).toBe(404);
  });

  it('recusa texto vazio e texto grande demais', async () => {
    expect((await guardar(tokens.tecnica, ids.foto, { texto: '   ' })).status).toBe(400);
    expect((await guardar(tokens.tecnica, ids.foto, { texto: 'x'.repeat(20001) })).status).toBe(400);
    expect((await guardar(tokens.tecnica, ids.foto, {})).status).toBe(400);
  });

  it('a auditoria leva o tamanho e a casa, nunca o texto', async () => {
    const { rows } = await admin.query(
      `SELECT house_id, detail FROM audit_event WHERE action = 'document.texto' AND entity_id = $1 ORDER BY at`, [ids.foto]);
    expect(rows.length).toBe(2);
    expect(rows.every((x) => x.house_id === ids.AI3)).toBe(true);
    expect(rows[0].detail).toMatchObject({ versao: 1, origem: 'leitura_no_aparelho' });
    expect(JSON.stringify(rows)).not.toContain(marca);
  });

  it('as páginas voltam como imagem para a leitura no aparelho, e a abertura fica registrada', async () => {
    const antes = Number((await admin.query(
      `SELECT count(*) FROM audit_event WHERE action = 'document.open' AND entity_id = $1`, [ids.pdf])).rows[0].count);
    const r = await request(http).get(`/api/v1/people/${ids.crianca}/documents/${ids.pdf}/paginas`).set(auth(tokens.tecnica));
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.paginas[0]).toMatch(/^data:image\/png;base64,iVBOR/);
    const f = await request(http).get(`/api/v1/people/${ids.crianca}/documents/${ids.foto}/paginas`).set(auth(tokens.tecnica));
    expect(f.body.paginas[0]).toMatch(/^data:image\/jpeg;base64,/);
    const depois = Number((await admin.query(
      `SELECT count(*) FROM audit_event WHERE action = 'document.open' AND entity_id = $1`, [ids.pdf])).rows[0].count);
    expect(depois).toBe(antes + 1);
  });
});
