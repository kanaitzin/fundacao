/**
 * A FOLHA DA PORTARIA — quem pode visitar (fase 92, pedido do Marcelo em 09/09).
 *
 * O que esta suíte garante, e por quê:
 *
 *  - ESTAR NO CADASTRO NÃO É ESTAR AUTORIZADO. Só a marca da técnica ou da
 *    coordenação põe um contato na folha da guarita;
 *  - contato com aproximação restrita NUNCA aparece — nem pela rota, nem por
 *    dentro do banco, que recusa a combinação;
 *  - encerrar um contato retira a autorização junto;
 *  - a folha não carrega motivo de restrição nem observação do contato, e isso
 *    é procurado no Word ABERTO, não nos bytes comprimidos (ver
 *    `setup/dentro-do-docx.ts`: um conferidor que só diz "sim" não foi visto);
 *  - o CPF é de terceiro: inteiro para quem escreve no cadastro e na folha,
 *    mascarado para o educador;
 *  - exportar exige finalidade e registra a saída, sai em paisagem e leva as
 *    fotos.
 *
 * Fixture própria, numa criança criada aqui e desligada no fim (regra 13).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { dentroDoDocx } from './setup/dentro-do-docx';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** Um PNG mínimo de verdade: a assinatura precisa ser real, não um texto. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154'
  + '789c6300010000050001' + '0d0a2db4' + '0000000049454e44ae426082', 'hex');

/* CPFs de exemplo com dígitos verificadores válidos — não são de ninguém. */
const CPF_MADRINHA = '529.982.247-25';
const CPF_OUTRO = '111.444.777-35';

const MOTIVO_RESTRICAO = 'Aproximação suspensa por decisão judicial de teste — frase-sentinela 7Q';
const OBSERVACAO_SENTINELA = 'Observação interna sentinela K9 — não pode ir para a guarita';

describe('A folha da portaria — quem pode visitar', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3 = '';
  let crianca = '';
  const ct: Record<string, string> = {};

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;

  const novoContato = async (corpo: Record<string, unknown>) => {
    const r = await request(http).post(`/api/v1/people/${crianca}/contacts`)
      .set(auth(tokens.tecnica)).send(corpo);
    expect(r.status).toBe(201);
    return r.body.id as string;
  };
  /*
   * O DIA E A HORA ENTRAM POR PADRÃO (1500, fase 142).
   *
   * Desde a 1500, autorizar exige que o contato TERMINE com dia e faixa de
   * horário — a folha da guarita sai com isso, e sem ele quem está no portão às
   * 21h de uma terça tem de decidir por conta própria. Esta suíte é de 92 e trata
   * de OUTRA coisa (quem entra na folha, o CPF, o contato restrito), então o
   * horário vem de graça aqui em vez de aparecer em sete chamadas: quem lê um
   * teste desta suíte não deveria ter de pensar em horário nenhum.
   *
   * A suíte que cobra o horário em si é a `quando-o-visitante-pode-vir`.
   */
  const AGENDA_PADRAO = { dias: [0, 6], de: '09:00', ate: '11:30' };
  const visita = (token: string, id: string, corpo: Record<string, unknown>) =>
    request(http).post(`/api/v1/people/contacts/${id}/visit`).set(auth(token))
      .send(corpo.autorizado ? { ...AGENDA_PADRAO, ...corpo } : corpo);
  const folha = (token: string, casa = AI3) =>
    request(http).get(`/api/v1/people/portaria/folha?houseId=${casa}`).set(auth(token));
  /** As linhas da folha que são desta criança — a casa tem outras. */
  const linhasDaCrianca = (body: any) => {
    const linhas: string[][] = body.secoes[0].tabela.linhas;
    const ini = linhas.findIndex((l) => l[1] === 'PortariaTeste');
    if (ini < 0) return [];
    const out = [linhas[ini]];
    for (let i = ini + 1; i < linhas.length && linhas[i][1] === ''; i++) out.push(linhas[i]);
    return out;
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
      educador: 'educador.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const novo = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
      .send({ houseId: AI3, fullName: 'Criança da Portaria (fictícia)', socialName: 'PortariaTeste',
              birthDate: '2014-02-03', provisionalReason: 'Ingresso de teste automatizado' });
    expect(novo.status).toBe(201);
    crianca = novo.body.personId;

    ct.madrinha = await novoContato({ nome: 'Madrinha Autorizada (fictícia)', vinculo: 'madrinha',
      telefone: '(51) 99999-0001', observacao: OBSERVACAO_SENTINELA });
    ct.tio = await novoContato({ nome: 'Tio Sem CPF (fictício)', vinculo: 'tio', telefone: '(51) 99999-0002' });
    ct.comunitario = await novoContato({ nome: 'Vizinha Não Autorizada (fictícia)',
      vinculo: 'vinculo_comunitario' });
    ct.restrito = await novoContato({ nome: 'Genitor Restrito (fictício)', vinculo: 'genitor',
      restrito: true, motivoDaRestricao: MOTIVO_RESTRICAO });
    ct.avo = await novoContato({ nome: 'Avó Que Sai (fictícia)', vinculo: 'avo', cpf: CPF_OUTRO });
  });

  afterAll(async () => {
    await request(http).post(`/api/v1/people/${crianca}/discharge`)
      .set(auth(tokens.tecnica)).send({ motivo: 'Encerramento de fixture de teste' });
    await app.close(); await admin.end();
  });

  it('estar no cadastro não é estar autorizado: só a marca da técnica põe o contato na folha', async () => {
    const antes = linhasDaCrianca((await folha(tokens.tecnica)).body);
    expect(antes).toHaveLength(1);
    expect(antes[0][3]).toBe('Nenhum visitante autorizado');

    const r = await visita(tokens.tecnica, ct.madrinha, { autorizado: true, cpf: CPF_MADRINHA });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/próxima folha/i);
    expect((await visita(tokens.coord, ct.tio, { autorizado: true })).status).toBe(201);
    expect((await visita(tokens.tecnica, ct.avo, { autorizado: true })).status).toBe(201);

    const depois = linhasDaCrianca((await folha(tokens.tecnica)).body);
    const nomes = depois.map((l) => l[3]);
    expect(nomes).toEqual(expect.arrayContaining(
      ['Madrinha Autorizada (fictícia)', 'Tio Sem CPF (fictício)', 'Avó Que Sai (fictícia)']));
    expect(nomes).not.toContain('Vizinha Não Autorizada (fictícia)');
    expect(nomes).not.toContain('Genitor Restrito (fictício)');

    /*
     * A LINHA SE LÊ PELO CONTEÚDO, e não pela POSIÇÃO — corrigido na fase 142.
     *
     * Estava `madrinha[5] === CPF`, e a 1500 inseriu a coluna "Quando pode vir"
     * antes do CPF: o teste passou a comparar o CPF com "dom e sáb, das 09:00 às
     * 11:30" e reprovou uma folha certa. Índice fixo em tabela que cresce é um
     * teste que cobra o desenho de ontem — e a coluna nova era exatamente o que a
     * Fundação pediu.
     */
    const madrinha = depois.find((l) => l[3] === 'Madrinha Autorizada (fictícia)')!;
    expect(madrinha).toContain('Madrinha');
    expect(madrinha).toContain(CPF_MADRINHA);
    expect(madrinha).toContain('(51) 99999-0001');
    const tio = depois.find((l) => l[3] === 'Tio Sem CPF (fictício)')!;
    expect(tio.join(' | ')).toMatch(/não cadastrado — pedir documento com foto/);

    const { rows: [a] } = await admin.query(
      `SELECT u.email FROM person_contact c JOIN app_user u ON u.id = c.visit_authorized_by WHERE c.id=$1`,
      [ct.madrinha]);
    expect(a.email).toBe('tecnica.ai3@paodospobres.dev');
  });

  it('CPF que não confere é recusado com a frase; o educador vê o CPF mascarado', async () => {
    const ruim = await visita(tokens.tecnica, ct.tio, { autorizado: true, cpf: '123.456.789-00' });
    expect(ruim.status).toBe(400);
    expect(ruim.body.message).toMatch(/dígitos verificadores/);

    const doEducador = await request(http).get(`/api/v1/people/${crianca}/contacts`)
      .set(auth(tokens.educador));
    const m = doEducador.body.find((c: any) => c.id === ct.madrinha);
    expect(m.autorizadoAVisitar).toBe(true);
    expect(m.cpf).toBe('***.***.247-**');

    const daTecnica = await request(http).get(`/api/v1/people/${crianca}/contacts`)
      .set(auth(tokens.tecnica));
    const t = daTecnica.body.find((c: any) => c.id === ct.madrinha);
    expect(t.cpf).toBe(CPF_MADRINHA);
    expect(t.autorizacao.por).toBeTruthy();
  });

  it('contato restrito nunca é autorizado — nem pela rota, nem por dentro do banco', async () => {
    const r = await visita(tokens.coord, ct.restrito, { autorizado: true });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/aproximação restrita/);

    await expect(admin.query(
      `UPDATE person_contact SET visit_authorized = true WHERE id = $1`, [ct.restrito]))
      .rejects.toThrow(/contato_restrito_nao_visita/);

    const nomes = linhasDaCrianca((await folha(tokens.coord)).body).map((l) => l[3]);
    expect(nomes).not.toContain('Genitor Restrito (fictício)');
  });

  it('encerrar o contato retira a autorização, e ele sai da folha', async () => {
    const fim = await request(http).post(`/api/v1/people/contacts/${ct.avo}/end`)
      .set(auth(tokens.tecnica)).send({ motivo: 'Mudou de cidade (teste).' });
    expect(fim.status).toBe(201);
    const { rows: [c] } = await admin.query(
      `SELECT visit_authorized FROM person_contact WHERE id=$1`, [ct.avo]);
    expect(c.visit_authorized).toBe(false);
    const nomes = linhasDaCrianca((await folha(tokens.tecnica)).body).map((l) => l[3]);
    expect(nomes).not.toContain('Avó Que Sai (fictícia)');

    const reabrir = await visita(tokens.tecnica, ct.avo, { autorizado: true });
    expect(reabrir.status).toBe(400);
    expect(reabrir.body.message).toMatch(/encerrado/);
  });

  it('o educador não autoriza nem gera a folha; a casa fora do alcance responde 404', async () => {
    const autorizar = await visita(tokens.educador, ct.comunitario, { autorizado: true });
    expect(autorizar.status).toBe(403);
    expect(autorizar.body.message).toMatch(/quem responde por quem entra/);
    expect((await folha(tokens.educador)).status).toBe(403);

    const outraCasa = await folha(tokens.coord4);
    expect(outraCasa.status).toBe(404);
    const exportOutra = await request(http).post('/api/v1/people/portaria/export')
      .set(auth(tokens.coord4)).send({ houseId: AI3, finalidade: 'Tentativa de outra casa (teste).' });
    expect(exportOutra.status).toBe(404);
    const semCasa = await request(http).post('/api/v1/people/portaria/export')
      .set(auth(tokens.coord)).send({ finalidade: 'Sem casa nenhuma (teste).' });
    expect(semCasa.status).toBe(404);
  });

  it('exportar exige finalidade, registra a saída, sai em paisagem e leva as fotos', async () => {
    expect((await request(http).post(`/api/v1/people/${crianca}/photo`).set(auth(tokens.tecnica))
      .send({ conteudo: PNG.toString('base64') })).status).toBe(201);
    const fotoMadrinha = await request(http).post(`/api/v1/people/contacts/${ct.madrinha}/photo`)
      .set(auth(tokens.tecnica)).send({ conteudo: PNG.toString('base64') });
    expect(fotoMadrinha.status).toBe(201);
    expect((await request(http).post(`/api/v1/people/contacts/${ct.madrinha}/photo`)
      .set(auth(tokens.educador)).send({ conteudo: PNG.toString('base64') })).status).toBe(403);
    const lida = await request(http).get(`/api/v1/people/contacts/${ct.madrinha}/photo`)
      .set(auth(tokens.educador));
    expect(lida.body.tipo).toBe('image/png');

    const semFinalidade = await request(http).post('/api/v1/people/portaria/export')
      .set(auth(tokens.coord)).send({ houseId: AI3, finalidade: 'curta' });
    expect(semFinalidade.status).toBe(400);

    const finalidade = 'Entrega da folha atualizada à portaria (teste).';
    const r = await request(http).post('/api/v1/people/portaria/export')
      .set(auth(tokens.coord)).send({ houseId: AI3, finalidade });
    expect(r.status).toBe(201);

    const { nomes, conteudo } = dentroDoDocx(r.body.conteudoBase64);
    const xml = conteudo['word/document.xml'];
    /* O conferidor precisa ter lido alguma coisa antes de dizer "não tem". */
    expect(xml).toMatch(/Madrinha Autorizada/);
    expect(xml).toContain(CPF_MADRINHA);
    expect(xml).toMatch(/w:orient="landscape"/);
    /* Duas fotos PNG desta criança — a dela e a da madrinha — viraram imagem. */
    expect(nomes.filter((n) => n.startsWith('word/media/')).length).toBeGreaterThanOrEqual(3);

    /* E o que não pode ir para a guarita, procurado no XML aberto. */
    expect(xml).not.toContain('frase-sentinela 7Q');
    expect(xml).not.toContain('sentinela K9');
    expect(xml).not.toContain('Genitor Restrito');
    expect(xml).not.toContain('Vizinha Não Autorizada');

    const { rows: [ev] } = await admin.query(
      `SELECT purpose, entity FROM audit_event
        WHERE action = 'documento.export' AND entity = 'portaria_visitantes'
        ORDER BY at DESC LIMIT 1`);
    expect(ev.purpose).toBe(finalidade);
  });
});
