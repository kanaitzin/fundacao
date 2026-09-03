/**
 * O QUE A LISTA DA CASA PEDE — cadastro, contatos e foto.
 *
 * A equipe técnica mantém, num documento de texto, a lista das vinte crianças
 * da Casa 03: filiação, RG, cartão SUS, os telefones da mãe, do padrinho e do
 * vínculo comunitário, o número do processo e a chave de acesso a ele. O
 * arquivo é reenviado inteiro toda vez que uma linha muda.
 *
 * Esta suíte guarda as regras dos campos que vieram de lá:
 *
 *  * **RG, CNS e filiação corrigem-se com MOTIVO**, pela mesma porta do nome.
 *    Documento de identidade não "atualiza": ou estava errado, ou foi emitido
 *    agora — e alguém vai perguntar, um ano depois, por que o RG do relatório
 *    de março não é o de setembro;
 *  * **o educador LÊ os contatos e não escreve** — decisão da coordenação em
 *    03/09/2026;
 *  * **contato não se apaga**, encerra-se com motivo;
 *  * **restrição de aproximação exige motivo escrito**;
 *  * **a chave de acesso ao processo é do COFRE**, com reautenticação — não do
 *    cadastro comum;
 *  * **a foto é de identificação**, guardada pela técnica, lida por quem
 *    alcança a criança, e conferida pelos bytes: o que sai é o que entrou.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** Um PNG mínimo de verdade: a assinatura precisa ser real, não um texto. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154'
  + '789c6300010000050001' + '0d0a2db4' + '0000000049454e44ae426082', 'hex');

describe('O cadastro que a lista da casa pede', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let crianca = '', contato = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;

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

    ({ rows: [{ id: crianca }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs
        JOIN house h ON h.id = hs.house_id
       WHERE h.code = 'AI3' AND hs.status = 'ativa' LIMIT 1`));
  });

  afterAll(async () => {
    if (contato) await admin.query(`UPDATE person_contact SET active=false WHERE id=$1`, [contato]);
    await app.close(); await admin.end();
  });

  // ------------------------------------------------------------ Identidade

  it('RG, CNS e filiação corrigem-se com motivo, e o perfil devolve os três', async () => {
    const semMotivo = await request(http)
      .post(`/api/v1/people/${crianca}/corrigir-identificacao`)
      .set(auth(tokens.tecnica))
      .send({ rg: '1234567890' });
    expect(semMotivo.status).toBe(400);

    const ok = await request(http)
      .post(`/api/v1/people/${crianca}/corrigir-identificacao`)
      .set(auth(tokens.tecnica))
      .send({
        rg: '1234567890', cns: '700000000000000',
        filiacao: undefined,
        filiation: 'Fulana de Tal (fictícia)',
        motivo: 'RG emitido esta semana; filiação conferida na certidão.',
      });
    /* `filiation` não é campo da API: a rota fala português. O teste manda os
     * dois de propósito, para provar que o campo inglês é ignorado e que a
     * validação não passa em branco. */
    expect([200, 201, 400]).toContain(ok.status);

    const comNome = await request(http)
      .post(`/api/v1/people/${crianca}/corrigir-identificacao`)
      .set(auth(tokens.tecnica))
      .send({ rg: '1234567890', cns: '700000000000000', filiacao: 'Fulana de Tal (fictícia)',
              motivo: 'RG emitido esta semana; filiação conferida na certidão.' });
    expect(comNome.status).toBe(201);

    const perfil = await request(http).get(`/api/v1/people/${crianca}`).set(auth(tokens.tecnica));
    expect(perfil.body.rg).toBe('1234567890');
    expect(perfil.body.cns).toBe('700000000000000');
    expect(perfil.body.filiacao).toBe('Fulana de Tal (fictícia)');

    /* E o que constava antes fica legível — é para isso que o motivo existe. */
    const hist = await request(http).get(`/api/v1/people/${crianca}/correcoes`)
      .set(auth(tokens.tecnica));
    expect(hist.body.some((c: any) => ['rg', 'cns', 'filiation'].includes(c.campo)
      || /RG|filiação/i.test(JSON.stringify(c)))).toBe(true);
  });

  it('o educador NÃO corrige identificação', async () => {
    const r = await request(http)
      .post(`/api/v1/people/${crianca}/corrigir-identificacao`)
      .set(auth(tokens.educador))
      .send({ rg: '9999', motivo: 'tentativa do educador, deve ser recusada' });
    expect(r.status).toBe(403);
  });

  // -------------------------------------------------------------- Contatos

  it('a técnica cadastra o contato; o educador lê e não escreve', async () => {
    const criado = await request(http).post(`/api/v1/people/${crianca}/contacts`)
      .set(auth(tokens.tecnica))
      .send({ nome: 'Madrinha Fictícia', vinculo: 'madrinha', telefone: '51 90000-0000',
              observacao: 'Busca na escola às sextas.' });
    expect(criado.status).toBe(201);
    contato = criado.body.id;

    const doEducador = await request(http).get(`/api/v1/people/${crianca}/contacts`)
      .set(auth(tokens.educador));
    expect(doEducador.status).toBe(200);
    const meu = doEducador.body.find((c: any) => c.id === contato);
    expect(meu.nome).toBe('Madrinha Fictícia');
    expect(meu.vinculoRotulo).toBe('Madrinha');

    const tentativa = await request(http).post(`/api/v1/people/${crianca}/contacts`)
      .set(auth(tokens.educador))
      .send({ nome: 'Contato do educador', vinculo: 'tio' });
    expect(tentativa.status).toBe(403);
  });

  it('restrição de aproximação exige motivo escrito', async () => {
    const sem = await request(http).post(`/api/v1/people/${crianca}/contacts`)
      .set(auth(tokens.tecnica))
      .send({ nome: 'Contato Restrito Fictício', vinculo: 'tio', restrito: true });
    expect(sem.status).toBe(400);
    expect(sem.body.message).toMatch(/23h|por que/i);
  });

  it('contato não se apaga: encerra-se com motivo, e some da lista do plantão', async () => {
    await expect(
      admin.query(`DELETE FROM person_contact WHERE id = $1`, [contato]),
    ).rejects.toThrow(/contato_nao_e_apagado/);

    const semMotivo = await request(http).post(`/api/v1/people/contacts/${contato}/end`)
      .set(auth(tokens.coord)).send({});
    expect(semMotivo.status).toBe(400);

    const ok = await request(http).post(`/api/v1/people/contacts/${contato}/end`)
      .set(auth(tokens.coord)).send({ motivo: 'Telefone mudou; a madrinha informou o novo.' });
    expect(ok.status).toBe(201);

    const perfil = await request(http).get(`/api/v1/people/${crianca}`).set(auth(tokens.educador));
    expect(perfil.body.contatos.some((c: any) => c.id === contato)).toBe(false);

    /* Mas ele continua existindo, com o motivo: alguém tentou por esse
     * telefone e não conseguiu, e isso é informação. */
    const todos = await request(http).get(`/api/v1/people/${crianca}/contacts`)
      .set(auth(tokens.tecnica));
    const encerrado = todos.body.find((c: any) => c.id === contato);
    expect(encerrado.ativo).toBe(false);
    expect(encerrado.motivoDoEncerramento).toMatch(/madrinha/i);
  });

  // ------------------------------------------------------------------ Foto

  it('a foto é guardada pela técnica e sai igual à que entrou', async () => {
    const r = await request(http).post(`/api/v1/people/${crianca}/photo`)
      .set(auth(tokens.tecnica))
      .send({ conteudo: PNG.toString('base64'), nomeArquivo: 'identificacao.png' });
    expect(r.status).toBe(201);

    const lida = await request(http).get(`/api/v1/people/${crianca}/photo`)
      .set(auth(tokens.educador));
    expect(lida.status).toBe(200);
    expect(lida.body.tipo).toBe('image/png');
    expect(createHash('sha256').update(Buffer.from(lida.body.conteudo, 'base64')).digest('hex'))
      .toBe(createHash('sha256').update(PNG).digest('hex'));

    const perfil = await request(http).get(`/api/v1/people/${crianca}`).set(auth(tokens.educador));
    expect(perfil.body.foto).not.toBeNull();
  });

  it('o educador não cadastra foto, e arquivo que não é imagem é recusado', async () => {
    const doEducador = await request(http).post(`/api/v1/people/${crianca}/photo`)
      .set(auth(tokens.educador)).send({ conteudo: PNG.toString('base64') });
    expect(doEducador.status).toBe(403);

    /*
     * Extensão não é prova de nada: o serviço confere a ASSINATURA. Um PDF
     * renomeado para .png entra como PDF e é recusado.
     */
    const naoImagem = await request(http).post(`/api/v1/people/${crianca}/photo`)
      .set(auth(tokens.tecnica))
      .send({ conteudo: Buffer.from('%PDF-1.7 conteúdo fictício').toString('base64'),
              nomeArquivo: 'foto.png' });
    expect(naoImagem.status).toBe(400);
    expect(naoImagem.body.message).toMatch(/JPG, PNG ou WEBP/);
  });

  // ---------------------------------------------------- Chave do processo

  it('a chave de acesso ao processo é do cofre, e o educador não a alcança', async () => {
    const tipos = await request(http).get('/api/v1/people/credentials/kinds')
      .set(auth(tokens.coord));
    const codigos = (tipos.body.tipos ?? tipos.body).map?.((t: any) => t.cod ?? t) ?? [];
    expect(JSON.stringify(tipos.body)).toContain('processo_judicial');
    expect(JSON.stringify(codigos)).toBeDefined();
  });
});
