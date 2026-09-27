/**
 * O RELATÓRIO DA INTERNAÇÃO EM UM WORD SÓ, E OS ANEXOS QUE CHEGAM (fase 165).
 *
 * Pedido de 25/09, seções 14, 15, 16 e 32: capa com o timbre, os registros em
 * ordem cronológica, os anexos dentro do documento (as páginas do PDF do
 * hospital como imagem), e os testes de arquivo — válido, cortado, repetido.
 * Decisão de 27/09: a conversão do PDF é do servidor.
 *
 * Na Casa 04: abrir internação tira a criança da chamada, e a Casa 03 é
 * disputada por meia dúzia de suítes (regra 13). A internação é encerrada no
 * fim, e a criança volta à rotina da casa.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { tempoDeInternacao } from '../src/modules/nursing/internacao-folha';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** Um PDF de verdade, com duas páginas e texto, montado à mão. */
function pdfDeDuasPaginas(texto: string): Buffer {
  const conteudo = `BT /F1 24 Tf 72 700 Td (${texto}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 6 0 R >> >> >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 6 0 R >> >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let s = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(s, 'latin1');
}

/** PNG 1x1 inteiro (termina no bloco IEND). */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==';

describe('O relatório da internação', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const PDF = pdfDeDuasPaginas('Exame ficticio').toString('base64');

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const anexar = (corpo: any, token = tokens.coord) =>
    request(http).post(`/api/v1/nursing/hospitalizations/${ids.int}/notes`).set(auth(token)).send(corpo);

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
      coord: 'coord.ai4@paodospobres.dev',
      educador: 'educador.ai4@paodospobres.dev',
      coord3: 'coord.ai3@paodospobres.dev',
    })) {
      const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
      tokens[k] = r.body.token;
      ids[k] = r.body.user?.id ?? '';
    }
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ id: ids.crianca }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
          AND NOT app_esta_internado(hs.person_id)
        ORDER BY p.full_name DESC LIMIT 1`, [ids.AI4]));

    const aberta = await request(http).post('/api/v1/nursing/hospitalizations').set(auth(tokens.coord))
      .send({ personId: ids.crianca, houseId: ids.AI4, hospital: 'Hospital Fictício da Zona Norte',
              /* Sem data retroativa: a entrada no passado faria a criança constar
                 internada em dias que outras suítes leem (a grade de ontem
                 escondia a dose dela da `suspender-e-autorizar`). Aberta e
                 encerrada no mesmo dia, nenhum dia fica marcado: o dia da alta
                 é dia de casa. */
              motivo: 'Pneumonia (fictícia), com necessidade de antibiótico venoso.' });
    expect(aberta.status).toBe(201);
    ids.int = aberta.body.id;
    await request(http).post(`/api/v1/nursing/hospitalizations/${ids.int}/companion`)
      .set(auth(tokens.coord)).send({ userId: ids.educador });
  });

  afterAll(async () => {
    await request(http).post(`/api/v1/nursing/hospitalizations/${ids.int}/close`)
      .set(auth(tokens.coord)).send({ desfecho: 'alta', observacao: 'Alta com orientação (fictícia).' });
    await app.close(); await admin.end();
  });

  // ---------------------------------------------------------- os arquivos

  it('o anexo sem categoria é recusado: é preciso dizer que documento é', async () => {
    const r = await anexar({ texto: 'Receita da alta.', conteudo: PDF, nomeArquivo: 'receita.pdf' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Diga que documento é o anexo/);
  });

  it('o PDF que chegou cortado é recusado, e a frase fala do sinal', async () => {
    const cortado = Buffer.from(PDF, 'base64').subarray(0, 200).toString('base64');
    const r = await anexar({ texto: 'Exame de sangue.', conteudo: cortado, categoria: 'exame' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/chegou incompleto/);
  });

  it('extensão falsa não engana: texto com nome de .pdf é recusado pelo conteúdo', async () => {
    const r = await anexar({ texto: 'Laudo.', categoria: 'exame', nomeArquivo: 'laudo.pdf',
      conteudo: Buffer.from('isto não é um PDF, só tem o nome').toString('base64') });
    expect(r.status).toBe(400);
  });

  it('o exame entra, com categoria e autoria, e o mesmo arquivo de novo é recusado', async () => {
    const r = await anexar({ tipo: 'exame', texto: 'Hemograma e raio-X entregues pelo hospital.',
      conteudo: PDF, nomeArquivo: 'hemograma.pdf', categoria: 'exame' });
    expect(r.status).toBe(201);
    const outra = await anexar({ tipo: 'exame', texto: 'Reenviado depois de o sinal cair.',
      conteudo: PDF, nomeArquivo: 'hemograma (1).pdf', categoria: 'exame' });
    expect(outra.status).toBe(409);
    expect(outra.body.message).toMatch(/já foi anexado a esta internação/);

    const p = await request(http).get(`/api/v1/nursing/hospitalizations/${ids.int}`).set(auth(tokens.coord));
    const nota = p.body.diario.find((n: any) => /Hemograma/.test(n.texto));
    expect(nota.categoria).toBe('exame');
    expect(nota.categoriaRotulo).toBe('Exame');
    expect(nota.cargo).toBe('coordenador');
  });

  it('o acompanhante anexa a foto da receita do dia', async () => {
    const r = await anexar({ tipo: 'relato', texto: 'Visita da tarde; febre baixou e aceitou o jantar.',
      conteudo: PNG, nomeArquivo: 'receita.png', categoria: 'receita' }, tokens.educador);
    expect(r.status).toBe(201);
    await request(http).post(`/api/v1/nursing/hospitalizations/${ids.int}/medications`)
      .set(auth(tokens.educador)).send({ medicamento: 'Ceftriaxona (fictícia)', dose: '1 g', via: 'venosa' });
  });

  // ---------------------------------------------------------- o relatório

  it('o acompanhante consulta na tela, mas não baixa; outra casa nem vê', async () => {
    const dele = await request(http).get(`/api/v1/nursing/hospitalizations/${ids.int}/folha`)
      .set(auth(tokens.educador));
    expect(dele.status).toBe(403);
    expect(dele.body.message).toMatch(/consulta o diário na tela/);
    const fora = await request(http).get(`/api/v1/nursing/hospitalizations/${ids.int}/folha`)
      .set(auth(tokens.coord3));
    expect(fora.status).toBe(404);
  });

  it('a folha tem capa, identificação, os dias em ordem, o cargo de quem escreveu e os anexos', async () => {
    const r = await request(http).get(`/api/v1/nursing/hospitalizations/${ids.int}/folha`)
      .set(auth(tokens.coord));
    expect(r.status).toBe(200);
    const f = r.body;
    expect(f.capa).toBe(true);
    expect(f.titulo).toBe('Relatório de internação hospitalar');
    const rot = f.identificacao.map((l: any) => l.rotulo);
    expect(rot).toEqual(expect.arrayContaining(['Acolhido', 'Unidade', 'Hospital', 'Entrada', 'Tempo de internação']));
    expect(f.identificacao.find((l: any) => l.rotulo === 'Unidade').valor).toMatch(/^AI4 · /);

    const titulos = f.secoes.map((s: any) => s.titulo);
    expect(titulos[0]).toBe('Motivo da internação');
    expect(titulos).toContain('Acompanhamento pela equipe');
    expect(titulos).toContain('Medicação administrada pelo hospital');
    expect(titulos.indexOf('Anexos')).toBeGreaterThan(titulos.indexOf('Motivo da internação'));
    const dias = f.secoes.filter((s: any) => /^Registros de /.test(s.titulo));
    expect(dias.length).toBeGreaterThanOrEqual(1);
    const texto = JSON.stringify(dias);
    expect(texto).toMatch(/Registrado por [^,]+, Coordenação da unidade/);
    expect(texto).toMatch(/Registrado por [^,]+, Educador social/);
    expect(texto).toMatch(/Anexo 1 \(exame\), reproduzido ao final/);
    expect(f.secoes.find((s: any) => s.titulo === 'Anexos').quebraAntes).toBe(true);
    expect(f.ressalva).toMatch(/originais permanecem arquivados/);
  });

  it('o Word sai com as duas páginas do PDF e a foto dentro, e a saída é registrada', async () => {
    const r = await request(http).post(`/api/v1/nursing/hospitalizations/${ids.int}/export`)
      .set(auth(tokens.coord)).send({ finalidade: 'enviar à equipe técnica para o PIA do acolhido' });
    expect(r.status).toBe(201);
    const docx = Buffer.from(r.body.conteudoBase64, 'base64');
    /* O .docx é um zip: os nomes das mídias ficam legíveis no índice. Duas
       páginas do PDF e a foto da receita, além do timbre. */
    const midias = new Set(docx.toString('latin1').match(/word\/media\/[A-Za-z0-9_.-]+/g) ?? []);
    expect(midias.size).toBeGreaterThanOrEqual(3);

    const { rows: [a] } = await admin.query(
      `SELECT house_id, purpose FROM audit_event
        WHERE action = 'documento.export' AND entity = 'hospitalization' AND entity_id = $1
        ORDER BY at DESC LIMIT 1`, [ids.int]);
    expect(a.house_id).toBe(ids.AI4);
    expect(a.purpose).toMatch(/PIA do acolhido/);
  });

  it('o tempo de internação se lê em dias e horas', () => {
    expect(tempoDeInternacao('2026-09-01T10:00:00Z', '2026-09-04T15:00:00Z')).toBe('3 dias e 5 horas');
    expect(tempoDeInternacao('2026-09-01T10:00:00Z', '2026-09-02T10:00:00Z')).toBe('1 dia');
    expect(tempoDeInternacao('2026-09-01T10:00:00Z', '2026-09-01T13:30:00Z')).toBe('3 horas');
    expect(tempoDeInternacao('2026-09-01T10:00:00Z', '2026-09-01T10:40:00Z')).toBe('menos de uma hora');
  });
});
