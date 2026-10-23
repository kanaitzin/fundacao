/**
 * O QUE ENTRA VOLTA INTEIRO, E O QUE SE BAIXA ABRE (pedido de 22/10).
 *
 * *"Teste se todos os relatórios e downloads estão funcionando, se as
 * pré-visualizações abrem, e se o servidor armazena as mensagens e os arquivos
 * anexados."* Até aqui cada exportação tinha o seu teste, e quase todos
 * conferiam o STATUS e o tamanho do base64: um Word com o XML quebrado passava
 * em todos, e só falhava no computador de quem baixou. E o anexo era conferido
 * no envio, mas poucas suítes liam de volta o arquivo pela rota de quem abre.
 *
 * Esta suíte cobra duas coisas, por todas as portas de uma vez:
 *
 *  1. **Todo Word que o sistema entrega abre.** É um zip inteiro, tem as peças
 *     que o Word exige, todo XML de dentro é XML de verdade, toda imagem dentro
 *     dele é imagem, e o texto não traz `undefined`, `null`, `NaN`,
 *     `Invalid Date` nem `[object Object]`. A lista das rotas NEGA POR PADRÃO:
 *     ela é conferida contra os controladores, e exportação nova sem linha
 *     aqui reprova (a lição da 153). Com `DOCUMENTOS_DIR`, cada Word é gravado
 *     ali, para ser aberto no LibreOffice fora da suíte.
 *  2. **Todo anexo volta byte por byte.** Foto e PDF de tamanho real entram por
 *     cada porta que recebe arquivo, voltam pela rota de quem abre, e o que
 *     voltou tem a mesma soma do que foi; e o arquivo está no disco do
 *     servidor, com a mesma soma (é a pergunta "o servidor guarda?").
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';
import { xml2js } from 'xml-js';
import { createCanvas } from '@napi-rs/canvas';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const ARQUIVOS = process.env.ARQUIVOS_DIR ?? '';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Uma foto de verdade, do tamanho da que sai reduzida do celular (fase 175). */
function fotoDeVerdade(): Buffer {
  const c = createCanvas(1600, 1200);
  const g = c.getContext('2d');
  const img = g.createImageData(1600, 1200);
  const ruido = randomBytes(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 90 + (ruido[i] >> 2); img.data[i + 1] = 140 + (ruido[i + 1] >> 3);
    img.data[i + 2] = 110 + (ruido[i + 2] >> 3); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toBuffer('image/jpeg', 80);
}

/** Um PDF de verdade, de uma página, com texto (o que a câmera monta é parecido). */
function pdfDeVerdade(): Buffer {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    null,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  const texto = `BT /F1 18 Tf 72 760 Td (Laudo ficticio ${randomBytes(4).toString('hex')}) Tj ET`;
  objs[3] = `<</Length ${texto.length}>>stream\n${texto}\nendstream`;
  let corpo = '%PDF-1.4\n';
  const pos: number[] = [];
  objs.forEach((o, i) => { pos.push(corpo.length); corpo += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = corpo.length;
  corpo += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    + pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corpo, 'latin1');
}

/** Acha o conteúdo do arquivo na resposta, que muda de forma conforme a rota. */
function conteudoDa(resposta: any): Buffer | null {
  if (!resposta || typeof resposta !== 'object') return null;
  for (const k of ['conteudoBase64', 'conteudo']) {
    if (typeof resposta[k] === 'string' && resposta[k].length > 0) {
      return Buffer.from(resposta[k].replace(/^data:[^,]+,/, ''), 'base64');
    }
  }
  if (typeof resposta.dataUrl === 'string') return Buffer.from(resposta.dataUrl.replace(/^data:[^,]+,/, ''), 'base64');
  for (const v of Object.values(resposta)) {
    const achado = v && typeof v === 'object' ? conteudoDa(v) : null;
    if (achado) return achado;
  }
  return null;
}

/** O que impede o Word de abrir, ou o que envergonha quem o recebe. */
async function oQueHaDeErradoNoWord(b: Buffer): Promise<string[]> {
  const erros: string[] = [];
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(b); } catch { return ['não é um zip inteiro']; }
  for (const peca of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
    if (!zip.file(peca)) erros.push(`falta ${peca}`);
  }
  let texto = '';
  for (const nome of Object.keys(zip.files)) {
    const f = zip.file(nome);
    if (!f) continue;
    if (/\.(xml|rels)$/.test(nome)) {
      const xml = await f.async('string');
      try { xml2js(xml); } catch (e) { erros.push(`${nome} não é XML: ${(e as Error).message.slice(0, 80)}`); }
      /* Entrelinha sem o tipo: o LibreOffice a lê como altura EXATA e corta toda
         imagem numa faixa fina, o timbre inclusive (achado de 22/10). */
      const semTipo = (xml.match(/<w:spacing [^>]*w:line="\d+"[^>]*>/g) ?? []).filter((t) => !/w:lineRule=/.test(t));
      if (semTipo.length) erros.push(`${nome}: entrelinha sem lineRule (${semTipo[0]})`);
      if (nome === 'word/document.xml') {
        texto = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(' ');
      }
    } else if (nome.startsWith('word/media/')) {
      const m = await f.async('nodebuffer');
      const png = m.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const jpg = m[0] === 0xff && m[1] === 0xd8;
      if (!png && !jpg) erros.push(`${nome} não é imagem`);
    }
  }
  if (texto.trim().length < 20) erros.push('o documento está sem texto');
  for (const lixo of [/\bundefined\b/, /\bnull\b/, /\bNaN\b/, /Invalid Date/, /\[object Object\]/]) {
    if (lixo.test(texto)) erros.push(`o texto traz ${lixo.source}`);
  }
  return erros;
}

describe('O que entra volta inteiro, e o que se baixa abre', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  /* Sem número longo: o dossiê recusa título que parece CPF, e com razão. */
  const marca = `conferência de 22/10, ${randomBytes(3).toString('hex')}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

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
      coord: 'coord.ai3@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev', enfermagem: 'enfermagem@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
    })) {
      const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
      if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
      tokens[k] = r.body.token; ids[k] = r.body.user?.id ?? '';
    }
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ person_id: ids.crianca }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' ORDER BY person_id LIMIT 1`, [ids.AI3]));
    ({ rows: [{ id: ids.esquema }] } = await admin.query(
      `SELECT id FROM prescription WHERE house_id=$1 AND status='ativa' ORDER BY created_at LIMIT 1`, [ids.AI3]));

    /* A ida com a família, encerrada há mais de um ano (a lição da 127 e da 145). */
    const { rows: [c] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, created_by)
       VALUES ($1, 'Avó da conferência (fictícia)', 'avo', $2) RETURNING id`, [ids.crianca, ids.coord]);
    ids.contato = c.id;
    const { rows: [f] } = await admin.query(
      `INSERT INTO family_stay (person_id, house_id, contact_id, purpose, started_at, expected_return_at,
                                returned_at, status, opened_by, closed_by, closed_at)
       VALUES ($1, $2, $3, 'fim de semana (fictício)', now() - interval '420 days', now() - interval '418 days',
               now() - interval '418 days', 'encerrada', $4, $4, now() - interval '418 days') RETURNING id`,
      [ids.crianca, ids.AI3, c.id, ids.coord]);
    ids.ida = f.id;

    const p = await request(http).post('/api/v1/shifts').set(auth(tokens.coord)).send({ houseId: ids.AI3, turno: 'diurno' });
    ids.plantao = p.body.plantaoId;
    const o = await request(http).post('/api/v1/incidents').set(auth(tokens.coord)).send({
      houseId: ids.AI3, categoria: 'emergencia_saude', quando: new Date().toISOString(),
      fato: 'Acolhida (fictícia) caiu no pátio e foi levada ao posto; voltou com o braço imobilizado.',
      acolhidos: [ids.crianca],
    });
    ids.ocorrencia = o.body.id;
    const rel = await request(http).post('/api/v1/reports').set(auth(tokens.tecnica)).send({
      kind: 'judiciario', personId: ids.crianca, houseId: ids.AI3, de: '2026-08-01', ate: '2026-08-31',
      finalidade: 'Audiência concentrada (conferência dos documentos).',
    });
    ids.relatorio = rel.body.id;
    /* Relatório só sai da instituição aprovado, e por outra pessoa (§14.6). */
    await request(http).post(`/api/v1/reports/${ids.relatorio}/submit`).set(auth(tokens.tecnica)).send({});
    await request(http).post(`/api/v1/reports/${ids.relatorio}/approve`).set(auth(tokens.coord)).send({});
    /* Benefícios pedem a senha de novo antes de abrir (§6.10). */
    await request(http).post('/api/v1/auth/reauth').set(auth(tokens.coord)).send({ password: SENHA });

    /* A internação é aberta e encerrada no mesmo dia, na Casa 04: o dia da alta
       é dia de casa, e nenhuma outra suíte vê a criança internada (fase 176). */
    ({ rows: [{ id: ids.crianca4 }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa' AND NOT app_esta_internado(hs.person_id)
        ORDER BY p.full_name LIMIT 1`, [ids.AI4]));
    const int = await request(http).post('/api/v1/nursing/hospitalizations').set(auth(tokens.coord4))
      .send({ personId: ids.crianca4, houseId: ids.AI4, hospital: 'Hospital Fictício do Centro',
              motivo: 'Fratura (fictícia) no antebraço, com observação de uma noite.' });
    ids.internacao = int.body.id;
  });

  afterAll(async () => {
    /* Encerrada de verdade, ou a suíte reprova: a criança internada some da
       chamada e das doses das outras suítes (a lição da 176, que voltou aqui
       com o campo do desfecho escrito errado). */
    if (ids.internacao) {
      const fim = await request(http).post(`/api/v1/nursing/hospitalizations/${ids.internacao}/close`)
        .set(auth(tokens.coord4)).send({ desfecho: 'alta', observacao: 'Alta no mesmo dia (conferência dos documentos).' });
      if (fim.status !== 201) throw new Error(`a internação da suíte não encerrou: ${fim.status} ${fim.body?.message}`);
    }
    await app.close(); await admin.end();
  });

  // =================================================== 1. Todo Word abre

  /*
   * TODA rota de exportação, com quem a usa na casa. A lista é conferida contra
   * os controladores no teste seguinte: rota nova sem linha aqui reprova.
   */
  const EXPORTACOES = (): { rota: string; quem: string; corpo: Record<string, unknown> }[] => {
    const fin = (o: string) => `${o} (${marca})`;
    return [
      { rota: '/escala/export', quem: 'coord', corpo: { houseId: ids.AI3, finalidade: fin('Mural da equipe') } },
      { rota: '/alignments/export', quem: 'coord', corpo: { houseId: ids.AI3, finalidade: fin('Mural da equipe') } },
      { rota: '/alignments/statute/export', quem: 'coord', corpo: { houseId: ids.AI3, publico: 'acolhidos', finalidade: fin('Mural das crianças') } },
      { rota: `/incidents/${ids.ocorrencia}/export`, quem: 'coord', corpo: { finalidade: fin('Encaminhamento à rede de saúde') } },
      { rota: `/shifts/${ids.plantao}/export`, quem: 'coord', corpo: { finalidade: fin('Livro da casa') } },
      { rota: `/nursing/history/${ids.crianca}/export`, quem: 'coord', corpo: { finalidade: fin('Consulta no posto') } },
      { rota: `/nursing/hospitalizations/${ids.internacao}/export`, quem: 'coord4', corpo: { finalidade: fin('Prontuário da casa') } },
      { rota: '/impacto/export', quem: 'gestor', corpo: { finalidade: fin('Relatório de impacto do semestre') } },
      { rota: `/impacto/trajetoria/${ids.crianca}/export`, quem: 'coord', corpo: { finalidade: fin('Audiência concentrada') } },
      { rota: `/people/${ids.crianca}/memories/export`, quem: 'coord', corpo: { finalidade: fin('Reunião do PIA') } },
      { rota: '/reports/period/export', quem: 'coord', corpo: { houseId: ids.AI3, de: '2026-09-01', ate: hoje, finalidade: fin('Reunião de equipe') } },
      { rota: `/reports/${ids.relatorio}/export`, quem: 'tecnica', corpo: { formato: 'docx', finalidade: fin('Rascunho para a revisão') } },
      { rota: '/medications/export', quem: 'coord', corpo: { houseId: ids.AI3, finalidade: fin('Grade para a parede') } },
      { rota: `/medications/family-stays/${ids.ida}/to-take/export`, quem: 'coord', corpo: { finalidade: fin('Entregar à família') } },
      { rota: '/medications/stock/report/export', quem: 'enfermagem', corpo: { houseId: ids.AI3, de: '2026-09-01', ate: hoje, finalidade: fin('Prestação de contas') } },
      { rota: '/medications/purchases/export', quem: 'coord', corpo: { houseId: ids.AI3, de: '2026-09-01', ate: hoje, finalidade: fin('Prestação de contas') } },
      { rota: '/people/kitchen-requests/export/lanches', quem: 'coord', corpo: { houseId: ids.AI3, de: '2026-09-01', ate: hoje, finalidade: fin('Cozinha') } },
      { rota: '/people/kitchen-requests/export/restricoes', quem: 'coord', corpo: { houseId: ids.AI3, finalidade: fin('Cozinha') } },
      { rota: '/people/kitchen-requests/export/cestas', quem: 'coord', corpo: { houseId: ids.AI3, de: '2026-09-01', ate: hoje, finalidade: fin('Cozinha') } },
      { rota: '/people/portaria/export', quem: 'coord', corpo: { houseId: ids.AI3, finalidade: fin('Guarita') } },
      { rota: `/people/${ids.crianca}/visitas/export`, quem: 'tecnica', corpo: { finalidade: fin('Audiência concentrada') } },
      { rota: `/people/${ids.crianca}/benefits/export`, quem: 'coord', corpo: { formato: 'docx', finalidade: fin('Perícia do INSS') } },
    ];
  };

  it('a lista desta suíte tem toda exportação que os controladores oferecem', () => {
    const dir = join(__dirname, '..', 'src', 'modules');
    const controladores: string[] = [];
    const andar = (d: string) => readdirSync(d, { withFileTypes: true }).forEach((e) =>
      e.isDirectory() ? andar(join(d, e.name)) : e.name.endsWith('.controller.ts') && controladores.push(join(d, e.name)));
    andar(dir);
    const oferecidas: string[] = [];
    for (const arq of controladores) {
      const fonte = readFileSync(arq, 'utf8');
      /* Um arquivo pode ter mais de um controlador: cada rota pega o prefixo do
         `@Controller` que vem antes dela. */
      let prefixo = '';
      for (const linha of fonte.split('\n')) {
        const c = linha.match(/@Controller\('([^']*)'\)/);
        if (c) prefixo = c[1];
        const r = linha.match(/@Post\('([^']*export[^']*)'\)/);
        if (r) oferecidas.push(`/${prefixo}/${r[1]}`.replace(/:\w+/g, ':x'));
      }
    }
    const nossas = new Set(EXPORTACOES().map((e) =>
      e.rota.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':x').replace(/\/undefined\//, '/:x/')));
    expect(oferecidas.filter((o) => !nossas.has(o))).toEqual([]);
  });

  // =================================================== 2. Todo anexo volta inteiro (antes dos Words, para eles levarem as imagens)

  /** Confere que o arquivo está no disco do servidor, com a mesma soma. */
  const noDisco = (chave: string | null, esperado: string) => {
    if (!ARQUIVOS) return 'sem ARQUIVOS_DIR na suíte';
    if (!chave) return 'o banco não tem a chave do arquivo';
    const caminho = join(ARQUIVOS, chave);
    if (!existsSync(caminho)) return `não está no disco (${chave})`;
    return sha(readFileSync(caminho)) === esperado ? null : 'o disco tem outro conteúdo';
  };

  it('a foto e o PDF entram por cada porta, voltam iguais e estão no disco', async () => {
    const foto = fotoDeVerdade();
    const pdf = pdfDeVerdade();
    expect(foto.length).toBeGreaterThan(150 * 1024);
    const b64 = (b: Buffer) => b.toString('base64');
    const problemas: string[] = [];
    const conferir = (porta: string, volta: Buffer | null, foi: Buffer, chave: string | null) => {
      if (!volta) { problemas.push(`${porta}: não voltou arquivo`); return; }
      if (sha(volta) !== sha(foi)) problemas.push(`${porta}: voltou diferente (${volta.length} de ${foi.length} bytes)`);
      const d = noDisco(chave, sha(foi));
      if (d) problemas.push(`${porta}: ${d}`);
    };

    // O dossiê: a certidão em PDF, e o documento judicial na área restrita.
    for (const [categoria, quem] of [['saude', 'tecnica'], ['judicial_socioassistencial', 'tecnica']] as const) {
      const r = await request(http).post(`/api/v1/people/${ids.crianca}/documents`).set(auth(tokens[quem]))
        .send({ categoria, titulo: `Documento ${categoria} (${marca})`, conteudo: b64(pdf), nomeArquivo: 'documento.pdf' });
      if (r.status !== 201) { problemas.push(`dossiê ${categoria}: ${r.status} ${r.body?.message}`); continue; }
      const v = await request(http).get(`/api/v1/people/${ids.crianca}/documents/${r.body.id}/file`).set(auth(tokens[quem]));
      const { rows: [k] } = await admin.query(
        `SELECT storage_key FROM document_version WHERE document_id=$1 ORDER BY created_at DESC LIMIT 1`, [r.body.id]);
      conferir(`dossiê ${categoria}`, conteudoDa(v.body), pdf, k?.storage_key ?? null);
    }

    // A receita do esquema, pela Enfermagem.
    {
      const r = await request(http).post(`/api/v1/medications/prescriptions/${ids.esquema}/documents`)
        .set(auth(tokens.enfermagem)).send({ nome: `Receita (${marca})`, conteudo: b64(foto), nomeArquivo: 'receita.jpg' });
      if (r.status !== 201) problemas.push(`receita: ${r.status} ${r.body?.message}`);
      else {
        const v = await request(http).get(`/api/v1/medications/prescriptions/documents/${r.body.id}/file`).set(auth(tokens.enfermagem));
        const { rows: [k] } = await admin.query(`SELECT storage_key FROM prescription_document WHERE id=$1`, [r.body.id]);
        conferir('receita', conteudoDa(v.body), foto, k?.storage_key ?? null);
      }
    }

    // A nota fiscal da compra.
    {
      const r = await request(http).post('/api/v1/medications/purchases').set(auth(tokens.coord)).send({
        houseId: ids.AI3, em: hoje, totalCentavos: 4590, itens: 'Paracetamol gotas, 1 frasco (fictício).',
        fornecedor: 'Farmácia Fictícia', nota: `N${Date.now()}`, conteudo: b64(foto), anexoNome: 'nota.jpg' });
      if (r.status !== 201) problemas.push(`nota fiscal: ${r.status} ${r.body?.message}`);
      else {
        const v = await request(http).get(`/api/v1/medications/purchases/${r.body.id}/file`).set(auth(tokens.coord));
        const { rows: [k] } = await admin.query(`SELECT storage_key FROM medication_purchase WHERE id=$1`, [r.body.id]);
        conferir('nota fiscal', conteudoDa(v.body), foto, k?.storage_key ?? null);
      }
    }

    // O anexo da ocorrência, aberto com finalidade.
    {
      const r = await request(http).post(`/api/v1/incidents/${ids.ocorrencia}/attachments`).set(auth(tokens.coord))
        .send({ tipo: 'documento_medico', nome: 'Atestado do posto', conteudo: b64(pdf), nomeArquivo: 'atestado.pdf' });
      if (r.status !== 201) problemas.push(`ocorrência: ${r.status} ${r.body?.message}`);
      else {
        const v = await request(http).post(`/api/v1/incidents/attachments/${r.body.id}/open`).set(auth(tokens.coord))
          .send({ finalidade: 'Conferir o atestado antes da reunião.' });
        const { rows: [k] } = await admin.query(`SELECT storage_key FROM incident_attachment WHERE id=$1`, [r.body.id]);
        conferir('ocorrência', conteudoDa(v.body), pdf, k?.storage_key ?? null);
      }
    }

    // O diário da internação.
    {
      const r = await request(http).post(`/api/v1/nursing/hospitalizations/${ids.internacao}/notes`).set(auth(tokens.coord4))
        .send({ tipo: 'relato', texto: 'Raio-x do braço, entregue pelo hospital.', categoria: 'exame',
                conteudo: b64(foto), nomeArquivo: 'raio-x.jpg' });
      if (r.status !== 201) problemas.push(`internação: ${r.status} ${r.body?.message}`);
      else {
        const v = await request(http).get(`/api/v1/nursing/hospitalizations/${ids.internacao}/notes/${r.body.id}/anexo`).set(auth(tokens.coord4));
        const { rows: [k] } = await admin.query(
          `SELECT storage_key FROM hospitalization_note_attachment WHERE note_id=$1 ORDER BY position LIMIT 1`, [r.body.id]);
        conferir('internação', conteudoDa(v.body), foto, k?.storage_key ?? null);
      }
    }

    // O atendimento da equipe técnica, com dois arquivos.
    {
      const r = await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.tecnica))
        .send({ area: 'psicologia', dia: hoje, relato: `Desenho da família e conversa sobre a escola (${marca}).`,
                anexos: [{ conteudo: b64(foto), nomeArquivo: 'desenho.jpg' }, { conteudo: b64(pdf), nomeArquivo: 'folha.pdf' }] });
      if (r.status !== 201) problemas.push(`atendimento: ${r.status} ${r.body?.message}`);
      else {
        const { rows } = await admin.query(
          `SELECT id, storage_key, file_name FROM technical_session_attachment WHERE session_id=$1 ORDER BY file_name`, [r.body.id]);
        if (rows.length !== 2) problemas.push(`atendimento: guardou ${rows.length} de 2 arquivos`);
        for (const a of rows) {
          const v = await request(http).get(`/api/v1/people/technical-sessions/attachments/${a.id}/file`).set(auth(tokens.tecnica));
          conferir(`atendimento ${a.file_name}`, conteudoDa(v.body), a.file_name.endsWith('.pdf') ? pdf : foto, a.storage_key);
        }
      }
    }

    // A linha da ATA, com uma foto e um documento (fase 233).
    {
      const ata = await request(http).get(`/api/v1/shifts/${ids.plantao}`).set(auth(tokens.coord));
      const r = await request(http).post(`/api/v1/shifts/ata/${ata.body.ata?.id}/notes`).set(auth(tokens.educador))
        .send({ texto: `Curativo trocado, com a foto e o bilhete da escola (${marca}).`,
                anexos: [{ conteudo: b64(foto) }, { conteudo: b64(pdf) }] });
      if (r.status !== 201) problemas.push(`linha da ATA: ${r.status} ${r.body?.message}`);
      else {
        const { rows } = await admin.query(
          `SELECT id, storage_key, mime FROM ata_note_attachment WHERE note_id=$1 ORDER BY position`, [r.body.id]);
        for (const a of rows) {
          const v = await request(http).get(`/api/v1/shifts/ata-notes/attachments/${a.id}/file`).set(auth(tokens.educador));
          conferir(`linha da ATA ${a.mime}`, conteudoDa(v.body), a.mime === 'application/pdf' ? pdf : foto, a.storage_key);
        }
      }
    }

    // A vivência com foto.
    {
      const r = await request(http).post(`/api/v1/people/${ids.crianca}/memories`).set(auth(tokens.educador))
        .send({ tipo: 'passeio', quando: '2020-02-10', descricao: `Passeio ao parque (${marca})`,
                fotos: [{ conteudo: b64(foto), nomeArquivo: 'parque.jpg', autorizacaoRegistrada: true }] });
      if (r.status !== 201) problemas.push(`vivência: ${r.status} ${r.body?.message}`);
      else {
        const { rows: [m] } = await admin.query(`SELECT id, storage_key FROM memory_photo WHERE memory_id=$1`, [r.body.id]);
        const v = await request(http).get(`/api/v1/people/${ids.crianca}/memories/${r.body.id}/photos/${m.id}`).set(auth(tokens.educador));
        conferir('vivência', conteudoDa(v.body), foto, m.storage_key);
      }
    }

    // A foto do visitante e a foto de identificação da criança.
    {
      const r = await request(http).post(`/api/v1/people/contacts/${ids.contato}/photo`).set(auth(tokens.tecnica)).send({ conteudo: b64(foto) });
      if (r.status !== 201) problemas.push(`foto do visitante: ${r.status} ${r.body?.message}`);
      else {
        const v = await request(http).get(`/api/v1/people/contacts/${ids.contato}/photo`).set(auth(tokens.tecnica));
        const { rows: [k] } = await admin.query(`SELECT photo_key FROM person_contact WHERE id=$1`, [ids.contato]);
        conferir('foto do visitante', conteudoDa(v.body), foto, k.photo_key);
      }
      const s = await request(http).post(`/api/v1/people/${ids.crianca}/photo`).set(auth(tokens.tecnica)).send({ conteudo: b64(foto), nomeArquivo: 'rosto.jpg' });
      if (s.status !== 201) problemas.push(`foto da criança: ${s.status} ${s.body?.message}`);
      else {
        const v = await request(http).get(`/api/v1/people/${ids.crianca}/photo`).set(auth(tokens.tecnica));
        const { rows: [k] } = await admin.query(`SELECT photo_key FROM person WHERE id=$1`, [ids.crianca]);
        conferir('foto da criança', conteudoDa(v.body), foto, k.photo_key);
      }
    }

    expect(problemas).toEqual([]);
  });

  it('todo Word que o sistema entrega abre, e não traz lixo no texto', async () => {
    const pasta = process.env.DOCUMENTOS_DIR;
    if (pasta) mkdirSync(pasta, { recursive: true });
    const problemas: string[] = [];
    for (const e of EXPORTACOES()) {
      const r = await request(http).post(`/api/v1${e.rota}`).set(auth(tokens[e.quem])).send(e.corpo);
      if (r.status !== 201 && r.status !== 200) { problemas.push(`${e.rota}: ${r.status} ${r.body?.message ?? ''}`); continue; }
      const b = conteudoDa(r.body);
      if (!b) { problemas.push(`${e.rota}: a resposta não traz arquivo`); continue; }
      const erros = await oQueHaDeErradoNoWord(b);
      erros.forEach((x) => problemas.push(`${e.rota}: ${x}`));
      if (!/\.docx$/i.test(r.body.nomeArquivo ?? '')) problemas.push(`${e.rota}: o nome não termina em .docx (${r.body.nomeArquivo})`);
      if (pasta) writeFileSync(join(pasta, `doc${e.rota.split('/').filter((s) => !/^[0-9a-f-]{36}$/.test(s)).join('-')}.docx`), b);
    }
    expect(problemas).toEqual([]);
  });

});
