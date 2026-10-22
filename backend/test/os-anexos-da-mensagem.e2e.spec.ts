/**
 * OS ANEXOS DA MENSAGEM (fase 233, pedido de 22/10).
 *
 * *"Podendo enviar até 10 anexos por mensagem."* Decidido no mesmo dia onde
 * vale: a linha da ATA, o diário da internação, a ocorrência, o atendimento da
 * equipe técnica e a conversa da Acolhe+AI. Esta suíte cobra, em cada uma:
 *
 *  1. dez entram, numa mensagem só, e voltam um por um, iguais ao que foi;
 *  2. o décimo primeiro é recusado com a frase da regra, e nada nasce pela metade;
 *  3. o total acima de 15 MB é recusado antes de qualquer arquivo ir ao disco;
 *  4. o Word cita os anexos de cada linha e reproduz as fotos no fim;
 *  5. a linha restrita esconde os anexos dela de quem não a lê.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { createHash, randomBytes } from 'crypto';
import JSZip from 'jszip';
import { createCanvas } from '@napi-rs/canvas';
import { AppModule } from '../src/app.module';
import {
  MAXIMO_DE_ANEXOS_POR_MENSAGEM, bytesDoBase64, recusaDosAnexos,
} from '../src/kernel/arquivos/anexos-da-mensagem.regra';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Uma foto diferente a cada chamada: a soma repetida seria recusada (1622). */
function foto(): Buffer {
  const c = createCanvas(800, 600);
  const g = c.getContext('2d');
  g.fillStyle = `#${randomBytes(3).toString('hex')}`;
  g.fillRect(0, 0, 800, 600);
  g.fillStyle = '#fff';
  g.font = '48px sans-serif';
  g.fillText(randomBytes(6).toString('hex'), 60, 300);
  return c.toBuffer('image/jpeg', 80);
}
function pdf(): Buffer {
  const texto = `BT /F1 18 Tf 72 760 Td (Documento ficticio ${randomBytes(4).toString('hex')}) Tj ET`;
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
  return Buffer.from(corpo, 'latin1');
}
const b64 = (b: Buffer) => b.toString('base64');

describe('Os anexos da mensagem', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
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
      coord: 'coord.ai4@paodospobres.dev', educador: 'educador.ai4@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev', coord3: 'coord.ai3@paodospobres.dev',
    })) {
      const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
      if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
      tokens[k] = r.body.token;
    }
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    /* Um turno de dias atrás, na Casa 04: as linhas e os anexos ficam fora da
       ATA de hoje que as outras suítes leem (a lição da 145). */
    const dia = (await admin.query(`SELECT (app_hoje()-6)::text AS d`)).rows[0].d;
    const aberto = await request(http).post('/api/v1/shifts').set(auth(tokens.coord))
      .send({ houseId: ids.AI4, data: dia, turno: 'diurno' });
    ids.plantao = aberto.body.plantaoId;
    ids.ata = aberto.body.ataId;
    ({ rows: [{ id: ids.crianca }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa' AND NOT app_esta_internado(hs.person_id)
        ORDER BY p.full_name DESC LIMIT 1`, [ids.AI4]));
    /* A semente não tem técnica na Casa 04: o atendimento é da Casa 03. */
    ({ rows: [{ person_id: ids.crianca3 }] } = await admin.query(
      `SELECT s.person_id FROM house_stay s JOIN house h ON h.id = s.house_id
        WHERE h.code = 'AI3' AND s.status = 'ativa' ORDER BY s.person_id DESC LIMIT 1`));
  });

  afterAll(async () => {
    /* Encerrada de verdade, ou a suíte reprova: a criança internada some da
       chamada e das doses das outras suítes (a lição da 176, que voltou aqui
       com o campo do desfecho escrito errado). */
    if (ids.internacao) {
      const fim = await request(http).post(`/api/v1/nursing/hospitalizations/${ids.internacao}/close`)
        .set(auth(tokens.coord)).send({ desfecho: 'alta', observacao: 'Alta no mesmo dia (conferência dos anexos).' });
      if (fim.status !== 201) throw new Error(`a internação da suíte não encerrou: ${fim.status} ${fim.body?.message}`);
    }
    await app.close(); await admin.end();
  });

  // ================================================================ a regra

  it('a regra é uma só: dez anexos e quinze megabytes por mensagem', () => {
    expect(MAXIMO_DE_ANEXOS_POR_MENSAGEM).toBe(10);
    expect(recusaDosAnexos(Array(10).fill(1000))).toBeNull();
    expect(recusaDosAnexos(Array(11).fill(1000))).toMatch(/Cabem até 10 anexos por mensagem/);
    expect(recusaDosAnexos([8 * 1024 * 1024, 8 * 1024 * 1024])).toMatch(/somam 16,0 MB/);
    expect(bytesDoBase64(Buffer.alloc(1234).toString('base64'))).toBe(1234);
    expect(bytesDoBase64(`data:image/jpeg;base64,${Buffer.alloc(77).toString('base64')}`)).toBe(77);
  });

  // ================================================================ a linha da ATA

  it('a linha da ATA leva dez anexos, e cada um volta igual', async () => {
    const arquivos = [...Array(9).fill(0).map(foto), pdf()];
    const r = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/notes`).set(auth(tokens.educador))
      .send({ texto: 'Curativo do joelho trocado depois do futebol; fotos do antes e do depois.',
              anexos: arquivos.map((b, i) => ({ conteudo: b64(b), nomeArquivo: `IMG_${i}.jpg` })) });
    expect(r.status).toBe(201);
    expect(r.body.anexos).toBe(10);
    ids.linha = r.body.id;

    const ata = await request(http).get(`/api/v1/shifts/${ids.plantao}`).set(auth(tokens.coord));
    const linha = ata.body.linhas.notas.find((n: any) => n.id === ids.linha);
    expect(linha.anexos).toHaveLength(10);
    /* O nome do aparelho não entra: ele pode trazer CPF ou diagnóstico. */
    expect(linha.anexos.map((a: any) => a.nome)).toEqual([
      ...Array(9).fill(0).map((_, i) => `foto-${i + 1}.jpg`), 'documento-10.pdf']);
    for (const [i, a] of linha.anexos.entries()) {
      const v = await request(http).get(`/api/v1/shifts/ata-notes/attachments/${a.id}/file`).set(auth(tokens.coord));
      expect(v.status).toBe(200);
      expect(sha(Buffer.from(v.body.conteudo, 'base64'))).toBe(sha(arquivos[i]));
    }
    const { rows: [lido] } = await admin.query(
      `SELECT house_id FROM audit_event WHERE action = 'ata.anexo.lido' AND entity_id = $1 LIMIT 1`, [linha.anexos[0].id]);
    expect(lido.house_id).toBe(ids.AI4);
  });

  it('o décimo primeiro é recusado, e a linha não nasce', async () => {
    const antes = (await admin.query(`SELECT count(*)::int AS n FROM ata_note WHERE ata_id = $1`, [ids.ata])).rows[0].n;
    const r = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/notes`).set(auth(tokens.educador))
      .send({ texto: 'Fotos do passeio.', anexos: Array(11).fill(0).map(() => ({ conteudo: b64(foto()) })) });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Cabem até 10 anexos por mensagem/);
    const depois = (await admin.query(`SELECT count(*)::int AS n FROM ata_note WHERE ata_id = $1`, [ids.ata])).rows[0].n;
    expect(depois).toBe(antes);
  });

  it('acima de quinze megabytes somados também, com o total na frase', async () => {
    const grande = Buffer.concat([Buffer.from('%PDF-1.4\n'), randomBytes(8 * 1024 * 1024), Buffer.from('\n%%EOF\n')]);
    const r = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/notes`).set(auth(tokens.educador))
      .send({ texto: 'Dois documentos grandes.', anexos: [{ conteudo: b64(grande) }, { conteudo: b64(grande) }] });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/somam 16,0 MB, e cabem 15 MB por mensagem/);
  });

  it('a linha restrita esconde os anexos dela de quem não a lê', async () => {
    const r = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/notes`).set(auth(tokens.coord))
      .send({ texto: 'Conversa com a família sobre a audiência; ofício fotografado.', restrita: true,
              anexos: [{ conteudo: b64(foto()) }] });
    expect(r.status).toBe(201);
    const { rows: [x] } = await admin.query(`SELECT id FROM ata_note_attachment WHERE note_id = $1`, [r.body.id]);
    const doEducador = await request(http).get(`/api/v1/shifts/ata-notes/attachments/${x.id}/file`).set(auth(tokens.educador));
    expect(doEducador.status).toBe(404);
    const daCoordenacao = await request(http).get(`/api/v1/shifts/ata-notes/attachments/${x.id}/file`).set(auth(tokens.coord));
    expect(daCoordenacao.status).toBe(200);
    /* E a coordenação de outra casa não abre nem o anexo da linha aberta. */
    const { rows: [aberto] } = await admin.query(
      `SELECT id FROM ata_note_attachment WHERE note_id = $1 ORDER BY position LIMIT 1`, [ids.linha]);
    const deFora = await request(http).get(`/api/v1/shifts/ata-notes/attachments/${aberto.id}/file`).set(auth(tokens.coord3));
    expect(deFora.status).toBe(404);
  });

  it('o Word da ATA cita os anexos de cada linha e reproduz as fotos no fim', async () => {
    const r = await request(http).post(`/api/v1/shifts/${ids.plantao}/export`).set(auth(tokens.coord))
      .send({ finalidade: 'Livro da casa (conferência dos anexos).' });
    expect(r.status).toBe(201);
    const zip = await JSZip.loadAsync(Buffer.from(r.body.conteudoBase64, 'base64'));
    const xml = await zip.file('word/document.xml')!.async('string');
    const texto = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(' ');
    expect(texto).toMatch(/Anexos 1, 2, 3, 4, 5, 6, 7, 8, 9 e 10, reproduzidos ao final/);
    expect(texto).toMatch(/Anexos dos registros/);
    /* Nove fotos da linha aberta (o PDF fica citado), e o timbre. A foto da
       linha restrita não vai ao papel. */
    const fotos = Object.keys(zip.files).filter((n) => n.startsWith('word/media/') && /\.jpe?g$/.test(n));
    expect(fotos.length).toBe(9);
  });

  // ================================================================ o diário da internação

  it('o registro do diário leva vários anexos, cada um no dossiê, e o relatório cita todos', async () => {
    const int = await request(http).post('/api/v1/nursing/hospitalizations').set(auth(tokens.coord))
      .send({ personId: ids.crianca, houseId: ids.AI4, hospital: 'Hospital Fictício do Sul',
              motivo: 'Desidratação (fictícia), com soro e observação.' });
    expect(int.status).toBe(201);
    ids.internacao = int.body.id;
    const arquivos = [foto(), pdf(), foto()];
    const r = await request(http).post(`/api/v1/nursing/hospitalizations/${ids.internacao}/notes`).set(auth(tokens.coord))
      .send({ tipo: 'relato', texto: 'Alta com a receita, o exame de sangue e o atestado da escola.',
              anexos: [{ conteudo: b64(arquivos[0]), nomeArquivo: 'receita.jpg', categoria: 'receita' },
                       { conteudo: b64(arquivos[1]), nomeArquivo: 'exame.pdf', categoria: 'exame' },
                       { conteudo: b64(arquivos[2]), nomeArquivo: 'atestado.jpg', categoria: 'atestado' }] });
    expect(r.status).toBe(201);
    expect(r.body.anexos).toBe(3);

    const p = await request(http).get(`/api/v1/nursing/hospitalizations/${ids.internacao}`).set(auth(tokens.coord));
    const nota = p.body.diario.find((n: any) => n.id === r.body.id);
    expect(nota.anexos.map((a: any) => a.categoria)).toEqual(['receita', 'exame', 'atestado']);
    for (const [i, a] of nota.anexos.entries()) {
      const v = await request(http).get(`/api/v1/nursing/hospitalizations/${ids.internacao}/notes/${r.body.id}/anexos/${a.id}`)
        .set(auth(tokens.coord));
      expect(sha(Buffer.from(v.body.conteudo, 'base64'))).toBe(sha(arquivos[i]));
    }
    /* A rota de antes, sem o número, abre o primeiro. */
    const antiga = await request(http).get(`/api/v1/nursing/hospitalizations/${ids.internacao}/notes/${r.body.id}/anexo`)
      .set(auth(tokens.coord));
    expect(sha(Buffer.from(antiga.body.conteudo, 'base64'))).toBe(sha(arquivos[0]));

    const { rows: espelhos } = await admin.query(
      `SELECT count(*)::int AS n FROM document WHERE person_id = $1 AND mirror_of LIKE 'hospitalization_note_attachment:%'`,
      [ids.crianca]);
    expect(espelhos[0].n).toBeGreaterThanOrEqual(3);

    const folha = await request(http).get(`/api/v1/nursing/hospitalizations/${ids.internacao}/folha`).set(auth(tokens.coord));
    const textos = JSON.stringify(folha.body);
    expect(textos).toMatch(/Anexos 1 \(receita\), 2 \(exame\) e 3 \(atestado\), reproduzidos ao final/);
  });

  it('o mesmo arquivo duas vezes na mensagem é recusado', async () => {
    const igual = b64(foto());
    const r = await request(http).post(`/api/v1/nursing/hospitalizations/${ids.internacao}/notes`).set(auth(tokens.coord))
      .send({ texto: 'Duas cópias da mesma receita.', anexos: [{ conteudo: igual, categoria: 'receita' }, { conteudo: igual, categoria: 'receita' }] });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/duas vezes nesta mensagem/);
  });

  it('o registro não nasce em nome de outra pessoa: o banco confere o autor', async () => {
    const { rows: [outro] } = await admin.query(`SELECT id FROM app_user WHERE email = 'educador.ai4@paodospobres.dev'`);
    const { rows: [eu] } = await admin.query(`SELECT id FROM app_user WHERE email = 'coord.ai4@paodospobres.dev'`);
    /* Com o papel da aplicação, como o servidor conecta (a lição da 219). */
    const c = new Client({ connectionString: process.env.DATABASE_APP_URL
      ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher' });
    await c.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.user_id', $1, true)`, [eu.id]);
      await expect(c.query(
        `INSERT INTO hospitalization_note (hospitalization_id, on_date, kind, body, written_by)
         VALUES ($1, app_hoje(), 'relato', 'Escrito em nome de outra pessoa.', $2)`, [ids.internacao, outro.id]))
        .rejects.toThrow(/row-level security/);
    } finally { await c.query('ROLLBACK'); await c.end(); }
  });

  // ================================================================ a ocorrência e o atendimento

  it('a ocorrência recebe vários anexos de uma vez, todos com o mesmo tipo', async () => {
    const o = await request(http).post('/api/v1/incidents').set(auth(tokens.coord)).send({
      houseId: ids.AI4, categoria: 'emergencia_saude', quando: new Date().toISOString(),
      fato: 'Acolhido (fictício) cortou o dedo na cozinha; curativo e ida ao posto.', acolhidos: [ids.crianca] });
    const arquivos = [foto(), foto(), pdf()];
    const r = await request(http).post(`/api/v1/incidents/${o.body.id}/attachments`).set(auth(tokens.coord))
      .send({ tipo: 'documento_medico', nome: 'Atendimento no posto',
              anexos: arquivos.map((b) => ({ conteudo: b64(b) })) });
    expect(r.status).toBe(201);
    expect(r.body.ids).toHaveLength(3);
    const { rows } = await admin.query(
      `SELECT display_name, sha256 FROM incident_attachment WHERE id = ANY($1) ORDER BY display_name`, [r.body.ids]);
    expect(rows.map((x) => x.display_name)).toEqual([
      'Atendimento no posto (1 de 3)', 'Atendimento no posto (2 de 3)', 'Atendimento no posto (3 de 3)']);
    expect(rows.map((x) => x.sha256).sort()).toEqual(arquivos.map(sha).sort());
    const onze = await request(http).post(`/api/v1/incidents/${o.body.id}/attachments`).set(auth(tokens.coord))
      .send({ tipo: 'documento_medico', nome: 'Demais', anexos: Array(11).fill(0).map(() => ({ conteudo: b64(foto()) })) });
    expect(onze.status).toBe(400);
  });

  it('o atendimento técnico leva dez arquivos, e não onze', async () => {
    const hoje = (await admin.query(`SELECT app_hoje()::text AS d`)).rows[0].d;
    const corpo = (n: number) => ({ area: 'psicopedagogia', dia: hoje,
      relato: 'Atividade de leitura com fotos das folhas preenchidas.',
      anexos: Array(n).fill(0).map((_, i) => ({ conteudo: b64(foto()), nomeArquivo: `folha-${i + 1}.jpg` })) });
    const dez = await request(http).post(`/api/v1/people/${ids.crianca3}/technical-sessions`).set(auth(tokens.tecnica)).send(corpo(10));
    expect(dez.status).toBe(201);
    const onze = await request(http).post(`/api/v1/people/${ids.crianca3}/technical-sessions`).set(auth(tokens.tecnica)).send(corpo(11));
    expect(onze.status).toBe(400);
    expect(onze.body.message).toMatch(/até 10 arquivos/);
  });
});
