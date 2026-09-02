/**
 * AS FOLHAS SAEM DO SERVIDOR — e a saída fica registrada.
 *
 * Até 02/09/2026 a folha da ATA, da ocorrência, da saúde, da grade e dos
 * combinados era montada NO NAVEGADOR, e o .docx era escrito lá. O documento
 * saía certo e o sistema ficava sem resposta para a pergunta que importa meses
 * depois: quem tirou esta cópia daqui, e para quê?
 *
 * O que esta suíte prova, e por que cada coisa está aqui:
 *
 *  1. **ver não é exportar.** `GET .../folha` monta a estrutura, não gera
 *     arquivo e não registra nada. É o caminho de conferir antes de baixar, e
 *     conferir não pode custar um registro de exportação que nunca aconteceu;
 *  2. **exportar exige a finalidade escrita**, e a recusa é do servidor —
 *     não da tela;
 *  3. **a exportação fica na auditoria**, com quem pediu, o quê e para quê —
 *     e NUNCA com o conteúdo (§20);
 *  4. **fala espontânea e sinais observados não entram na folha da
 *     ocorrência**, nem para quem tem política para lê-los na tela. Ver na
 *     tela é um acesso registrado, de uma pessoa, num momento; a folha
 *     impressa é uma cópia que anda sozinha pela casa (§13.2);
 *  5. **a grade não leva diagnóstico nem alergia** — é papel de serviço, e a
 *     folha diz isso dentro dela;
 *  6. **casa fora do alcance é recusa, não folha vazia.** O RLS devolveria
 *     lista vazia, que se lê como "casa sem medicação hoje" — a mesma
 *     armadilha do "zerar não é recusar";
 *  7. **a ATA aberta sai marcada como rascunho**: uma cópia de ATA não
 *     fechada circulando como institucional é o registro do turno antes de a
 *     equipe ter terminado o turno.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** O .docx é um ZIP: os dois primeiros bytes dizem se saiu arquivo de verdade. */
const eUmDocx = (base64: string) => {
  const b = Buffer.from(base64, 'base64');
  return b.length > 5000 && b[0] === 0x50 && b[1] === 0x4b;
};

describe('Folhas em Word — do servidor, com a saída registrada', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3 = '', AI4 = '';
  let plantao = '', ocorrencia = '', acolhido = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

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
      coord: 'coord.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ person_id: acolhido }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]));

    const p = await request(http).post('/api/v1/shifts')
      .set(auth(tokens.coord)).send({ houseId: AI3, turno: 'diurno' });
    plantao = p.body.plantaoId;

    const o = await request(http).post('/api/v1/incidents')
      .set(auth(tokens.coord)).send({
        houseId: AI3, categoria: 'emergencia_saude', quando: new Date().toISOString(),
        fato: 'Acolhida (fictícia) relatou dor de cabeça após a aula; foi levada à enfermaria.',
        acolhidos: [acolhido],
      });
    ocorrencia = o.body.id;
  });

  afterAll(async () => {
    /*
     * NÃO SE APAGA A OCORRÊNCIA — e a tentativa de fazê-lo foi o primeiro
     * achado desta suíte.
     *
     * O banco recusa com `ocorrencia_nao_e_apagada`, que é exatamente o que a
     * regra manda (exclusão simples ou silenciosa é proibida). A limpeza da
     * suíte não é exceção à regra: o que ela cria fica, como ficaria na casa.
     * O `globalSetup` recria o schema a cada rodada, e é ele quem limpa.
     *
     * Fica também o rastro na auditoria — append-only por gatilho —, e é
     * assim que tem de ser: uma suíte que apaga o próprio registro de
     * exportação provaria que a exportação é rastreável usando um caminho que
     * ninguém tem em produção.
     */
    await app.close();
    await admin.end();
  });

  // ------------------------------------------------------------------ ATA

  it('a folha da ATA vem montada, com as seções do livro e a marca de rascunho', async () => {
    const r = await request(http).get(`/api/v1/shifts/${plantao}/folha`).set(auth(tokens.coord));
    expect(r.status).toBe(200);
    expect(r.body.titulo).toMatch(/^ATA do turno/);
    expect(r.body.secoes.length).toBeGreaterThan(3);
    // A ATA ainda não fechou: a folha precisa dizer isso na cara.
    expect(r.body.rascunho).toBe(true);
    // Identificação é o que se confere primeiro.
    const rotulos = r.body.identificacao.map((i: any) => i.rotulo);
    expect(rotulos).toContain('Unidade');
    expect(rotulos).toContain('Turno');
    // Seção vazia diz "não há" — ela não some.
    const vazias = r.body.secoes.filter((s: any) =>
      (s.paragrafos ?? []).some((p: string) => /Nada registrado/.test(p)));
    expect(vazias.length).toBeGreaterThan(0);
  });

  it('ver a folha NÃO registra exportação', async () => {
    const antes = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event WHERE action='documento.export'`);
    await request(http).get(`/api/v1/shifts/${plantao}/folha`).set(auth(tokens.coord)).expect(200);
    const depois = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event WHERE action='documento.export'`);
    // Contagem RELATIVA: a tabela é append-only e guarda o que outras suítes
    // deixaram (a lição da suíte do limite da casa).
    expect(depois.rows[0].n).toBe(antes.rows[0].n);
  });

  it('exportar sem finalidade é recusado pelo SERVIDOR, não pela tela', async () => {
    await request(http).post(`/api/v1/shifts/${plantao}/export`)
      .set(auth(tokens.coord)).send({}).expect(400);
    await request(http).post(`/api/v1/shifts/${plantao}/export`)
      .set(auth(tokens.coord)).send({ finalidade: 'reunião' }).expect(400);
  });

  it('exportar gera .docx e registra a saída com a finalidade — e sem o conteúdo', async () => {
    const finalidade = 'levar à reunião de equipe técnica de quinta-feira';
    const r = await request(http).post(`/api/v1/shifts/${plantao}/export`)
      .set(auth(tokens.coord)).send({ finalidade });
    expect(r.status).toBe(201);
    expect(eUmDocx(r.body.conteudoBase64)).toBe(true);
    expect(r.body.nomeArquivo).toMatch(/\.docx$/);
    // Nome de arquivo não leva CPF, diagnóstico nem conteúdo judicial (§3.3).
    expect(r.body.nomeArquivo).not.toMatch(/\d{11}/);

    const { rows } = await admin.query(
      `SELECT purpose, detail FROM audit_event
       WHERE action='documento.export' AND entity='ata'
       ORDER BY at DESC LIMIT 1`);
    expect(rows[0].purpose).toBe(finalidade);
    // Metadado, nunca conteúdo: o detalhe traz o título e a contagem, e só.
    expect(Object.keys(rows[0].detail).sort()).toEqual(['formato', 'secoes', 'titulo']);
    expect(JSON.stringify(rows[0].detail)).not.toMatch(/Nada registrado/);
  });

  // ---------------------------------------------------------- Ocorrência

  it('a folha da ocorrência NÃO leva fala espontânea nem sinais observados', async () => {
    const fala = 'FALA ESPONTANEA FICTICIA QUE NAO PODE SAIR EM PAPEL';
    const sinais = 'SINAIS OBSERVADOS FICTICIOS QUE NAO PODEM SAIR EM PAPEL';
    const protegido = await request(http).post(`/api/v1/incidents/${ocorrencia}/protected`)
      .set(auth(tokens.tecnica))
      .send({ falaEspontanea: fala, sinaisObservados: sinais });
    expect(protegido.status).toBe(201);

    // A técnica ALCANÇA o registro protegido na tela...
    const naTela = await request(http).get(`/api/v1/incidents/${ocorrencia}`)
      .set(auth(tokens.tecnica));
    expect(naTela.body.protegido?.falaEspontanea).toBe(fala);

    // ...e mesmo assim ele não entra na folha que vira papel.
    const folha = await request(http).get(`/api/v1/incidents/${ocorrencia}/folha`)
      .set(auth(tokens.tecnica));
    expect(folha.status).toBe(200);
    const inteiro = JSON.stringify(folha.body);
    expect(inteiro).not.toContain(fala);
    expect(inteiro).not.toContain(sinais);
    // E a folha DIZ que não leva, em vez de simplesmente omitir.
    expect(folha.body.ressalva).toMatch(/Fala espontânea/);

    // Nem no arquivo gerado.
    const arq = await request(http).post(`/api/v1/incidents/${ocorrencia}/export`)
      .set(auth(tokens.tecnica))
      .send({ finalidade: 'anexar ao encaminhamento para a rede de saúde' });
    expect(arq.status).toBe(201);
    expect(Buffer.from(arq.body.conteudoBase64, 'base64').includes(fala)).toBe(false);
  });

  // --------------------------------------------------------------- Saúde

  it('a folha de saúde do acolhido traz o que espera alguém, e sem juízo', async () => {
    const r = await request(http).get(`/api/v1/nursing/history/${acolhido}/folha`)
      .set(auth(tokens.coord));
    expect(r.status).toBe(200);
    expect(r.body.titulo).toMatch(/^Situação de saúde/);
    expect(r.body.secoes[0].titulo).toBe('O que está esperando alguém');
    expect(r.body.ressalva).toMatch(/não conclui, não avalia/);
  });

  // --------------------------------------------------------------- Grade

  it('a grade da casa é papel de serviço: sem diagnóstico e com o aviso dentro', async () => {
    const r = await request(http).get(`/api/v1/medications/folha?houseId=${AI3}`)
      .set(auth(tokens.coord));
    expect(r.status).toBe(200);
    expect(r.body.titulo).toMatch(/^Grade de medicação do dia/);
    const cabecalho = r.body.secoes[0].tabela?.cabecalho ?? [];
    // Hora, nome e medicamento — e nada de diagnóstico ou alergia.
    expect(cabecalho.join(' ')).not.toMatch(/diagn|alergia/i);
    expect(r.body.ressalva).toMatch(/FOLHA DE SERVIÇO/);
    // O campo que só uma pessoa preenche sai visível como pendência.
    expect(r.body.secoes.some((s: any) => s.aPreencher)).toBe(true);
  });

  it('grade de casa fora do alcance é RECUSA, e não folha vazia', async () => {
    /*
     * Sem esta recusa, o RLS devolveria lista vazia e a folha sairia com o
     * título sem unidade — que se lê como "a Casa 04 não tem medicação hoje".
     * Zerar não é recusar.
     */
    const r = await request(http).get(`/api/v1/medications/folha?houseId=${AI4}`)
      .set(auth(tokens.coord));
    expect(r.status).toBe(404);
  });

  // ---------------------------------------------------------- Combinados

  it('a folha dos combinados leva só os vigentes, e diz que o sistema é quem manda', async () => {
    const r = await request(http).get(`/api/v1/alignments/folha?houseId=${AI3}`)
      .set(auth(tokens.coord));
    expect(r.status).toBe(200);
    expect(r.body.titulo).toMatch(/^Combinados vigentes/);
    expect(r.body.ressalva).toMatch(/O que manda é o sistema/);
  });

  // ------------------------------------------------------------- Alcance

  it('quem não alcança a casa não recebe a folha dela', async () => {
    /* A coordenação da Casa 04 não abre a ATA da Casa 03. A recusa é do RLS,
     * na leitura que a folha usa — e não de uma segunda lista de permissões
     * escrita ao lado do gerador de documento. */
    const r = await request(http).get(`/api/v1/shifts/${plantao}/folha`).set(auth(tokens.coord4));
    expect([403, 404]).toContain(r.status);
  });
});
