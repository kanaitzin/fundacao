/**
 * O DOSSIÊ DO ACOLHIDO (§6.1) e o ÁLBUM DE VIVÊNCIAS (§6.9).
 *
 * `document`, `document_version` e `memory_record` existiam desde a fase 0 e
 * nunca tiveram porta: o perfil listava documentos e não abria nenhum, e não
 * havia como pôr um lá dentro. A casa continuava com a pasta de papel.
 *
 * O que este teste guarda:
 *
 *  * **o tipo é conferido pela ASSINATURA do arquivo.** Renomear um executável
 *    para `.pdf` é um toque, e um sistema que guarda documento de criança não
 *    pode cair nisso;
 *  * **o título é barrado quando parece CPF, diagnóstico ou teor judicial**
 *    (regra 3) — e o NOME DO ARQUIVO também, que é onde o sigilo vaza sem
 *    ninguém decidir nada;
 *  * **anexar não é conferir.** O documento nasce sem aceite, e o aceite é de
 *    quem olhou — o gatilho do banco recusa aceitar em nome de outro, e recusa
 *    apagar um aceite;
 *  * **abrir gera registro** (§20), e o sha256 é conferido: objeto trocado por
 *    baixo não passa como se fosse o que foi aceito;
 *  * **o judicial é área restrita.** O educador não vê a categoria, e a recusa
 *    é idêntica a "não existe" — dizer 403 já contaria que existe;
 *  * **a vivência não se reescreve**, e a foto sem autorização de imagem
 *    registrada ENTRA (decisão da Fundação em 01/09) mas fica marcada como tal.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** Um JPEG mínimo de verdade: assinatura ffd8ff e um fim de arquivo. */
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]),
  Buffer.alloc(64, 0x20),
  Buffer.from([0xff, 0xd9]),
]).toString('base64');
/** Um PDF mínimo. */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF').toString('base64');
/** Um executável disfarçado: assinatura MZ, nome `.pdf`. */
const FALSO = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(40, 0)]).toString('base64');
/**
 * Um AVI: contêiner RIFF, formato `AVI ` no 9º byte.
 *
 * Ele existe para uma linha só, e ela é a da fase 114. `RIFF` sozinho não é
 * WebP — carrega AVI e WAV também —, e o dossiê dava `image/webp` a qualquer
 * um dos três desde a fase 82. A cópia da foto de identificação conferia o 9º
 * byte e estava certa; ao juntar as seis cópias num lugar só, a certa ganhou.
 */
const AVI = Buffer.concat([
  Buffer.from('RIFF'), Buffer.alloc(4, 0), Buffer.from('AVI '), Buffer.alloc(64, 0),
]).toString('base64');

describe('O dossiê do acolhido', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const dossie = async (token: string) =>
    (await request(http).get(`/api/v1/people/${ids.crianca}/dossie`).set(auth(token))).body;
  const anexar = (token: string, corpo: any) =>
    request(http).post(`/api/v1/people/${ids.crianca}/documents`).set(auth(token)).send(corpo);

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
      educador: 'educador.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ person_id: ids.crianca }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa'
        ORDER BY person_id LIMIT 1`, [ids.AI3]));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== O catálogo ====================

  it('a lista exigida vem do servidor, com a categoria judicial marcada como restrita', async () => {
    const res = await request(http).get('/api/v1/people/dossie/catalogo').set(auth(tokens.tecnica));
    expect(res.status).toBe(200);
    const cats = res.body.categorias.map((c: any) => c.code);
    expect(cats).toEqual(expect.arrayContaining(
      ['pessoal', 'saude', 'escolar', 'convivencia', 'judicial_socioassistencial']));
    expect(res.body.categorias.find((c: any) => c.code === 'judicial_socioassistencial').restrita)
      .toBe(true);
    // O PIA e a guia de acolhimento são obrigatórios; o RG não é — nem toda
    // criança tem, e não ter não é pendência dela.
    const pia = res.body.itens.find((i: any) => i.chave === 'pia');
    expect(pia.obrigatorio).toBe(true);
    expect(res.body.itens.find((i: any) => i.chave === 'rg').obrigatorio).toBe(false);
  });

  // ==================== O que o arquivo é ====================

  it('o tipo é conferido pela assinatura: `.pdf` renomeado não passa', async () => {
    const res = await anexar(tokens.tecnica, {
      chave: 'rg', categoria: 'pessoal', titulo: 'RG',
      nomeArquivo: 'rg.pdf', conteudo: FALSO,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/assinatura do arquivo/i);
  });

  it('um AVI não entra como WebP — `RIFF` sozinho não é imagem', async () => {
    const res = await anexar(tokens.tecnica, {
      chave: 'rg', categoria: 'pessoal', titulo: 'RG',
      nomeArquivo: 'rg.webp', conteudo: AVI,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/assinatura do arquivo/i);

    // E nada foi gravado: a recusa acontece ANTES do disco e antes da tabela.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM document_version WHERE mime = 'image/webp'`);
    expect(rows[0].n).toBe(0);
  });

  it('título com CPF é barrado, e o NOME DO ARQUIVO também', async () => {
    const comCpf = await anexar(tokens.tecnica, {
      chave: 'cpf', categoria: 'pessoal', titulo: 'CPF 529.982.247-25',
      nomeArquivo: 'cpf.jpg', conteudo: JPEG,
    });
    expect(comCpf.status).toBe(400);
    expect(comCpf.body.message).toMatch(/CPF/);

    const noNome = await anexar(tokens.tecnica, {
      chave: 'cpf', categoria: 'pessoal', titulo: 'CPF',
      nomeArquivo: 'cpf 529.982.247-25.jpg', conteudo: JPEG,
    });
    expect(noNome.status).toBe(400);
    expect(noNome.body.message).toMatch(/NOME DO ARQUIVO/);
  });

  it('título com diagnóstico ou com teor judicial é barrado', async () => {
    const diag = await anexar(tokens.tecnica, {
      chave: 'laudo', categoria: 'saude', titulo: 'Laudo transtorno do espectro',
      nomeArquivo: 'laudo.pdf', conteudo: PDF,
    });
    expect(diag.status).toBe(400);
    expect(diag.body.message).toMatch(/diagn[óo]stico/i);

    const jud = await anexar(tokens.tecnica, {
      chave: 'decisao_judicial', categoria: 'judicial_socioassistencial',
      titulo: 'Decisão — negligência da mãe', nomeArquivo: 'decisao.pdf', conteudo: PDF,
    });
    expect(jud.status).toBe(400);
    expect(jud.body.message).toMatch(/teor/i);
  });

  // ==================== Anexar não é conferir ====================

  it('o documento entra SEM aceite, e o aviso diz que falta conferir', async () => {
    const res = await anexar(tokens.tecnica, {
      chave: 'certidao_nascimento', categoria: 'pessoal', titulo: 'Certidão de nascimento',
      nomeArquivo: 'certidao.jpg', conteudo: JPEG,
    });
    expect(res.status).toBe(201);
    expect(res.body.tipo).toMatch(/JPEG/);
    expect(res.body.sha256).toHaveLength(64);
    expect(res.body.aviso).toMatch(/ainda N[ÃA]O conferido/i);
    ids.certidao = res.body.id;

    const d = await dossie(tokens.tecnica);
    const pessoal = d.categorias.find((c: any) => c.code === 'pessoal');
    const item = pessoal.itens.find((i: any) => i.chave === 'certidao_nascimento');
    expect(item.situacao).toBe('aguardando_conferencia');
    expect(item.documentos[0].aceitoEm).toBeNull();
    expect(pessoal.aguardandoConferencia).toBeGreaterThan(0);
  });

  it('o que falta aparece por nome, e só o que é obrigatório', async () => {
    const d = await dossie(tokens.tecnica);
    const pessoal = d.categorias.find((c: any) => c.code === 'pessoal');
    expect(pessoal.obrigatoriosQueFaltam).toEqual(expect.arrayContaining(['Cartão SUS']));
    // O RG não é obrigatório: não ter não é pendência da criança.
    expect(pessoal.obrigatoriosQueFaltam).not.toContain('RG');
    // E a certidão saiu da lista de faltas assim que o arquivo entrou.
    expect(pessoal.obrigatoriosQueFaltam).not.toContain('Certidão de nascimento');
  });

  it('o aceite é de quem olhou, e fica com nome e horário', async () => {
    const res = await request(http)
      .post(`/api/v1/people/${ids.crianca}/documents/${ids.certidao}/accept`)
      .set(auth(tokens.coord)).send({ nota: 'Legível, e é a certidão dela.' });
    expect(res.status).toBe(201);

    const d = await dossie(tokens.coord);
    const item = d.categorias.find((c: any) => c.code === 'pessoal')
      .itens.find((i: any) => i.chave === 'certidao_nascimento');
    expect(item.situacao).toBe('aceito');
    expect(item.documentos[0].aceitoPor).toBeTruthy();
    expect(item.documentos[0].notaDoAceite).toMatch(/Leg[íi]vel/);
  });

  it('conferir duas vezes é recusado, e o banco não deixa apagar o aceite', async () => {
    const denovo = await request(http)
      .post(`/api/v1/people/${ids.crianca}/documents/${ids.certidao}/accept`)
      .set(auth(tokens.tecnica)).send({});
    expect(denovo.status).toBe(400);
    expect(denovo.body.message).toMatch(/já foi conferido/i);

    await expect(admin.query(
      `UPDATE document SET accepted_at = NULL WHERE id = $1`, [ids.certidao])).rejects.toThrow();
  });

  // ==================== Abrir ====================

  it('abrir devolve os bytes, gera registro e confere o sha256', async () => {
    const res = await request(http)
      .get(`/api/v1/people/${ids.crianca}/documents/${ids.certidao}/file`)
      .set(auth(tokens.tecnica));
    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('image/jpeg');
    expect(res.body.conteudo).toBe(JPEG);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event
        WHERE action = 'document.open' AND entity_id = $1`, [ids.certidao]);
    expect(rows[0].n).toBeGreaterThan(0);
  });

  // ==================== O judicial é restrito ====================

  it('o educador não alcança a categoria judicial, e a recusa parece inexistência', async () => {
    const guia = await anexar(tokens.tecnica, {
      chave: 'guia_acolhimento', categoria: 'judicial_socioassistencial',
      titulo: 'Guia de acolhimento', nomeArquivo: 'guia.pdf', conteudo: PDF,
    });
    expect(guia.status).toBe(201);

    const doEducador = await dossie(tokens.educador);
    const cats = doEducador.categorias.map((c: any) => c.code);
    expect(cats).not.toContain('judicial_socioassistencial');

    const abrir = await request(http)
      .get(`/api/v1/people/${ids.crianca}/documents/${guia.body.id}/file`)
      .set(auth(tokens.educador));
    // 404, e não 403: dizer "proibido" já contaria que o documento existe.
    expect(abrir.status).toBe(404);
  });

  // ==================== O álbum de vivências ====================

  it('a vivência sem foto entra, e pede que se escreva o que aconteceu', async () => {
    const curta = await request(http).post(`/api/v1/people/${ids.crianca}/memories`)
      .set(auth(tokens.educador))
      .send({ tipo: 'aniversario', quando: '2026-05-14', descricao: 'ok' });
    expect(curta.status).toBe(400);
    expect(curta.body.message).toMatch(/o que aconteceu/i);

    const res = await request(http).post(`/api/v1/people/${ids.crianca}/memories`)
      .set(auth(tokens.educador))
      .send({ tipo: 'aniversario', quando: '2026-05-14',
              descricao: 'Aniversário de 8 anos, com bolo de chocolate feito na casa.' });
    expect(res.status).toBe(201);
  });

  it('a foto sem autorização de imagem ENTRA, e fica marcada como tal', async () => {
    const res = await request(http).post(`/api/v1/people/${ids.crianca}/memories`)
      .set(auth(tokens.educador))
      .send({ tipo: 'conquista', quando: '2026-06-20', nomeArquivo: 'medalha.jpg',
              descricao: 'Primeira medalha no campeonato de natação da escola.',
              conteudo: JPEG });
    expect(res.status).toBe(201);
    expect(res.body.aviso).toMatch(/N[ÃA]O está registrada/i);

    const alb = await request(http).get(`/api/v1/people/${ids.crianca}/memories`)
      .set(auth(tokens.educador));
    expect(alb.body.semAutorizacao).toBe(1);
    expect(alb.body.avisoDaAutorizacao).toMatch(/não impede/i);
    const comFoto = alb.body.itens.find((i: any) => i.temFoto);
    expect(comFoto.autorizacaoRegistrada).toBe(false);
    expect(comFoto.registradoPor).toBeTruthy();
  });

  it('a vivência recebe FOTO, não documento — e não se reescreve', async () => {
    const pdf = await request(http).post(`/api/v1/people/${ids.crianca}/memories`)
      .set(auth(tokens.educador))
      .send({ tipo: 'festa', quando: '2026-07-01', nomeArquivo: 'convite.pdf',
              descricao: 'Festa junina da casa, com quadrilha no pátio.', conteudo: PDF });
    expect(pdf.status).toBe(400);
    expect(pdf.body.message).toMatch(/FOTO/);

    await expect(admin.query(
      `UPDATE memory_record SET description = 'reescrito' WHERE person_id = $1`,
      [ids.crianca])).rejects.toThrow();
  });

  it('tudo ficou auditado, com autor (regra 6)', async () => {
    const { rows } = await admin.query(
      `SELECT DISTINCT action FROM audit_event
        WHERE action IN ('document.attach','document.accept','document.open','memory.record')`);
    expect(rows.map((r) => r.action).sort()).toEqual(
      ['document.accept', 'document.attach', 'document.open', 'memory.record']);
    const { rows: semAutor } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event
        WHERE action LIKE 'document.%' AND actor_id IS NULL`);
    expect(semAutor[0].n).toBe(0);
  });
});
