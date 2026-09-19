/**
 * VÁRIAS FOTOS NUMA VIVÊNCIA, E O BAIXAR NO DOSSIÊ — os dois pedidos da equipe.
 *
 * A Fundação repassou em 15/09 o que a equipe pediu:
 *
 *   *"Eles querem também ter foto das crianças no perfil […] podendo
 *   previamente visualizar o que está sendo hospedado e confirmar."*
 *   *"Dentro do perfil deles tem que ter um lugar onde fique os documentos
 *   reais […] poder visualizar a hora que eles quiserem e baixar."*
 *
 * O que esta suíte guarda:
 *
 *  1. **uma vivência tem quantas fotos tiver.** A educadora que volta da festa
 *     com seis fotos registrava seis vivências — seis vezes a mesma data, seis
 *     vezes a mesma descrição, e o álbum da criança contando a festa seis
 *     vezes;
 *  2. **a autorização de imagem é POR FOTO**, e não por vivência: a festa pode
 *     ter uma foto com uma criança de outra casa;
 *  3. **o fato não fica em dois lugares.** As colunas de arquivo de
 *     `memory_record` deixaram de ser escritas — a foto vive em
 *     `memory_photo`, e é de lá que ela sai;
 *  4. **baixar é outro ato, com nome próprio na auditoria.** Abrir é ler na
 *     tela; baixar é o arquivo saindo do sistema;
 *  5. **e o sha continua sendo conferido nos dois.** Um arquivo trocado por
 *     baixo não sai do sistema nem para a tela, nem para o disco de ninguém.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** Um JPEG mínimo de verdade: o kernel confere os primeiros bytes, não a extensão. */
const JPEG = `data:image/jpeg;base64,${Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ...new Array(64).fill(0x20), 0xff, 0xd9,
]).toString('base64')}`;

describe('Várias fotos numa vivência, e o baixar no dossiê', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
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

    tokens.educador = await login('educador.ai3@paodospobres.dev');
    tokens.tecnica = await login('tecnica.ai3@paodospobres.dev');

    const { rows: [{ id: casa }] } = await admin.query(
      `SELECT id FROM house WHERE code = 'AI3'`);
    const { rows: [p] } = await admin.query(
      `SELECT s.person_id FROM house_stay s
        WHERE s.house_id = $1 AND s.status = 'ativa'
        ORDER BY s.started_at LIMIT 1`, [casa]);
    ids.pessoa = p.person_id;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== As fotos ====================

  it('uma vivência aceita VÁRIAS fotos, e a autorização é por foto', async () => {
    const r = await request(http).post(`/api/v1/people/${ids.pessoa}/memories`)
      .set(auth(tokens.educador))
      .send({
        tipo: 'aniversario', quando: '2026-09-10',
        descricao: 'Aniversário de 8 anos, com bolo feito na casa e a turma toda cantando.',
        fotos: [
          { conteudo: JPEG, nomeArquivo: 'festa-1.jpg', autorizacaoRegistrada: true },
          { conteudo: JPEG, nomeArquivo: 'festa-2.jpg', autorizacaoRegistrada: false },
          { conteudo: JPEG, nomeArquivo: 'festa-3.jpg', autorizacaoRegistrada: true },
        ],
      });
    expect(r.status).toBe(201);
    expect(r.body.fotos).toBe(3);
    ids.vivencia = r.body.id;

    /* UMA vivência, e não três: é o pedido inteiro. Seis fotos da festa não
       são seis festas. */
    const { rows: [v] } = await admin.query(
      `SELECT count(*)::int AS n FROM memory_record WHERE id = $1`, [ids.vivencia]);
    expect(v.n).toBe(1);

    const { rows: fotos } = await admin.query(
      `SELECT file_name, photo_authorized, position FROM memory_photo
        WHERE memory_id = $1 ORDER BY position`, [ids.vivencia]);
    expect(fotos).toHaveLength(3);
    /* A ORDEM da escolha. Sem ela, seis fotos saem embaralhadas a cada
       consulta, e a primeira — que costuma ser a que a educadora escolheria
       para mostrar — deixa de ser a primeira. */
    expect(fotos.map((f: any) => f.file_name))
      .toEqual(['festa-1.jpg', 'festa-2.jpg', 'festa-3.jpg']);
    /* POR FOTO: a festa pode ter uma com uma criança de outra casa. */
    expect(fotos.map((f: any) => f.photo_authorized)).toEqual([true, false, true]);
  });

  it('o álbum devolve as fotos, e a vivência só está autorizada se TODAS estiverem', async () => {
    const r = await request(http).get(`/api/v1/people/${ids.pessoa}/memories`)
      .set(auth(tokens.educador));
    expect(r.status).toBe(200);
    const v = r.body.itens.find((x: any) => x.id === ids.vivencia);
    expect(v.fotos).toHaveLength(3);
    expect(v.temFoto).toBe(true);
    /* Uma das três não tem autorização, então a vivência não está autorizada —
       e o aviso conta FOTOS, não vivências. */
    expect(v.autorizacaoRegistrada).toBe(false);
    expect(r.body.semAutorizacao).toBeGreaterThanOrEqual(1);
    expect(r.body.avisoDaAutorizacao).toMatch(/autorização de uso de imagem/i);
  });

  it('o mesmo fato NÃO fica em dois lugares', async () => {
    /* As colunas de arquivo de `memory_record` deixaram de ser escritas. Elas
       ficam como origem histórica — nada se apaga —, mas guardar a foto nos
       dois lugares é como duas versões da verdade começam. */
    const { rows: [m] } = await admin.query(
      `SELECT storage_key, mime, sha256, file_name FROM memory_record WHERE id = $1`,
      [ids.vivencia]);
    expect(m.storage_key).toBeNull();
    expect(m.mime).toBeNull();
    expect(m.sha256).toBeNull();
    expect(m.file_name).toBeNull();
  });

  it('cada foto abre pela rota que a nomeia, e a abertura fica registrada', async () => {
    const { rows: fotos } = await admin.query(
      `SELECT id FROM memory_photo WHERE memory_id = $1 ORDER BY position`, [ids.vivencia]);

    for (const f of fotos) {
      const r = await request(http)
        .get(`/api/v1/people/${ids.pessoa}/memories/${ids.vivencia}/photos/${f.id}`)
        .set(auth(tokens.educador));
      expect(r.status).toBe(200);
      expect(r.body.conteudo.length).toBeGreaterThan(10);
    }

    const { rows } = await admin.query(
      `SELECT detail FROM audit_event
        WHERE action = 'memory.open' AND entity_id = $1
        ORDER BY at DESC LIMIT 3`, [ids.vivencia]);
    expect(rows).toHaveLength(3);
    /* A entidade continua sendo a VIVÊNCIA: quem procura "quem abriu o álbum
       da Alice" procura por `memory_record`, e um segundo nome de entidade
       esconderia metade das aberturas. A foto vai no detalhe. */
    expect(rows.every((r: any) => r.detail.fotoId)).toBe(true);
  });

  it('a rota antiga continua valendo, e devolve a PRIMEIRA foto', async () => {
    const r = await request(http)
      .get(`/api/v1/people/${ids.pessoa}/memories/${ids.vivencia}/file`)
      .set(auth(tokens.educador));
    expect(r.status).toBe(200);
    expect(r.body.nome).toBe('festa-1.jpg');
  });

  it('o envio tem teto, e a recusa diz o que fazer no lugar', async () => {
    const r = await request(http).post(`/api/v1/people/${ids.pessoa}/memories`)
      .set(auth(tokens.educador))
      .send({
        tipo: 'passeio', quando: '2026-09-11',
        descricao: 'Passeio ao parque com a turma toda, num sábado de sol.',
        fotos: new Array(13).fill(null)
          .map((_, i) => ({ conteudo: JPEG, nomeArquivo: `p${i}.jpg` })),
      });
    expect(r.status).toBe(400);
    /* Não é limite do álbum — ele nunca teve um. É o tamanho de um envio que
       cabe numa conexão de casa, e a recusa diz isso. */
    expect(r.body.message).toMatch(/duas levas|outra vivência/i);
  });

  // ==================== O baixar ====================

  it('baixar o documento do dossiê é outro ato, com nome próprio na auditoria', async () => {
    /* Um documento com arquivo, anexado pela via normal da tela. */
    const anexo = await request(http).post(`/api/v1/people/${ids.pessoa}/documents`)
      .set(auth(tokens.tecnica))
      .send({
        chave: 'certidao_nascimento', categoria: 'pessoal',
        titulo: 'Certidão de nascimento', conteudo: JPEG, nomeArquivo: 'certidao.jpg',
      });
    expect(anexo.status).toBe(201);
    const docId = anexo.body.id;

    const antesOpen = (await admin.query(
      `SELECT count(*)::int AS n FROM audit_event
        WHERE action = 'document.open' AND entity_id = $1`, [docId])).rows[0].n;

    const r = await request(http)
      .post(`/api/v1/people/${ids.pessoa}/documents/${docId}/download`)
      .set(auth(tokens.tecnica)).send({});
    expect(r.status).toBe(201);
    expect(r.body.nome).toBe('certidao.jpg');
    expect(r.body.conteudo.length).toBeGreaterThan(10);

    const { rows } = await admin.query(
      `SELECT detail FROM audit_event
        WHERE action = 'document.download' AND entity_id = $1`, [docId]);
    expect(rows).toHaveLength(1);
    /* E NÃO conta como abertura: são dois atos, e quem for apurar de onde saiu
       uma cópia procura pelo segundo, não pelo primeiro. */
    const depoisOpen = (await admin.query(
      `SELECT count(*)::int AS n FROM audit_event
        WHERE action = 'document.open' AND entity_id = $1`, [docId])).rows[0].n;
    expect(depoisOpen).toBe(antesOpen);
  });

  it('e um arquivo trocado por baixo não sai — nem para a tela, nem para o disco', async () => {
    const anexo = await request(http).post(`/api/v1/people/${ids.pessoa}/documents`)
      .set(auth(tokens.tecnica))
      .send({
        chave: 'cartao_sus', categoria: 'saude', titulo: 'Cartão SUS',
        conteudo: JPEG, nomeArquivo: 'sus.jpg',
      });
    expect(anexo.status).toBe(201);

    /* O sha guardado passa a não conferir com os bytes. É o cenário que o
       §6.13 descreve: um documento trocado por baixo é pior do que um
       documento que falta. */
    await admin.query(
      `UPDATE document_version SET sha256 = 'nao-confere' WHERE document_id = $1`,
      [anexo.body.id]);

    for (const [verbo, caminho] of [
      ['get', `/api/v1/people/${ids.pessoa}/documents/${anexo.body.id}/file`],
      ['post', `/api/v1/people/${ids.pessoa}/documents/${anexo.body.id}/download`],
    ] as const) {
      const r = verbo === 'get'
        ? await request(http).get(caminho).set(auth(tokens.tecnica))
        : await request(http).post(caminho).set(auth(tokens.tecnica)).send({});
      expect([verbo, r.status]).toEqual([verbo, 400]);
      expect(r.body.message).toMatch(/não confere/i);
    }
  });
});
