/**
 * O RASTRO QUE A COORDENAÇÃO NÃO LIA (fase 149).
 *
 * COMO O DEFEITO APARECEU, e o caminho importa: eu estava cumprindo a lista das
 * rotas medidas-e-não-testadas do §9, e a próxima era `GET /audit/report/:id` —
 * *"por onde esta cópia saiu, e para quê"*. Antes de escrever o teste, li os dois
 * lados, como a fase 145 ensinou. A hipótese era que algum cargo passasse pelo
 * `podeLer` do serviço e fosse recusado calado pelo RLS; não era — `LEEM` e a
 * policy `audit_select` nomeiam os MESMOS três cargos.
 *
 * O defeito estava do outro lado da mesma linha. A `audit_select` (0920) dá à
 * coordenação o que está na casa dela:
 *
 *     WHEN app_current_role() = 'coordenador' THEN house_id = ANY(app_casas_no_alcance())
 *
 * e `house_id IS NULL` não é igual a nada — `NULL = ANY(...)` é NULL, e NULL não
 * é verdadeiro. **A linha de auditoria que nasce sem casa é invisível para a
 * coordenação da casa.** Medido no repositório inteiro: das 152 chamadas de
 * `audit.log`, **79 não passavam `houseId`**.
 *
 * O que isso queria dizer na mesa da coordenadora da Casa 03:
 *
 *  * o relatório JUDICIÁRIO de uma criança da casa dela era gerado, aprovado,
 *    exportado em Word e entregue ao Ministério Público — e a auditoria dela
 *    respondia *"nada aconteceu com este registro"*, porque só o `report.generate`
 *    de relatório DE CASA levava casa, e relatório de criança nem esse;
 *  * a leitura do dado bancário, o anexo da internação aberto, a foto de
 *    identificação guardada, a memória da criança aberta, a dose confirmada, a
 *    situação judicial consultada — tudo gravado, e tudo fora do alcance de quem
 *    responde pela casa. A promessa da §7 é *"a coordenação lê o rastro da
 *    própria casa"*; o sistema cumpria *"a coordenação lê metade dele"*.
 *
 * E a auditoria é append-only: o que nasceu sem casa **fica** sem casa. A
 * correção vale de hoje para frente, e é por isso que ela não podia esperar mais
 * uma fase.
 *
 * O CONFERIDOR é que impede a volta: `auditoria-tem-casa.spec.ts` lê o código do
 * servidor e cobra `houseId` em toda chamada, com uma lista curta e ESCRITA das
 * ações que não têm casa — login, troca de senha, a conta do relógio. Lista de
 * exceção escrita é a diferença entre uma regra e uma lembrança.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O rastro que a coordenação não lia', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** O rastro de um relatório, como a tela o recebe. */
  const rastro = async (token: string, id: string) =>
    request(http).get(`/api/v1/audit/report/${id}`).set(auth(token));

  const PERIODO = { de: '2026-09-01', ate: '2026-09-20' };

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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      deOutraCasa: 'coord.ai4@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows: [crianca] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name LIMIT 1`, [ids.AI3]);
    ids.crianca = crianca.id;
  });

  afterAll(async () => {
    /* Nada a desfazer: relatório e auditoria são história, e a auditoria não se
       apaga nem pelo dono. O relatório fica em rascunho/aprovado como ficou. */
    await app.close();
    await admin.end();
  });

  // ============ O relatório DA CASA ============

  it('a técnica gera o relatório da casa e a coordenação lê a linha, em português', async () => {
    const gerado = await request(http).post('/api/v1/reports').set(auth(tokens.tecnica))
      .send({ kind: 'diario', houseId: ids.AI3, ...PERIODO,
              finalidade: 'Conferência da fase 149 — relatório fictício da casa.' });
    expect(gerado.status).toBe(201);
    ids.daCasa = gerado.body.id;

    const r = await rastro(tokens.coord, ids.daCasa);
    expect(r.status).toBe(200);
    const gerar = r.body.linhas.find((l: any) => l.codigo === 'report.generate');
    expect(gerar).toBeTruthy();
    /* A ação chega TRADUZIDA — o código cru em inglês no rastro de uma criança é
       o defeito que a fase 115 mediu. */
    expect(gerar.acao).not.toBe('report.generate');
    expect(gerar.acao).toMatch(/relat/i);
    /* Quem agiu tem nome, e a casa aparece. */
    expect(gerar.por).not.toBe('—');
    expect(gerar.casa).toBe('AI3');
  });

  it('A EXPORTAÇÃO APARECE PARA A COORDENAÇÃO — era o buraco', async () => {
    const exportado = await request(http).post(`/api/v1/reports/${ids.daCasa}/export`)
      .set(auth(tokens.tecnica))
      .send({ formato: 'docx',
              finalidade: 'Levar à reunião de rede fictícia da conferência 149.' });
    expect(exportado.status).toBe(201);

    const r = await rastro(tokens.coord, ids.daCasa);
    const saiu = r.body.linhas.find((l: any) => l.codigo === 'report.export');
    /*
     * Esta é a linha que dá nome à suíte. Sem a correção, ela não vem: o
     * `audit.log` do `exportar` não passava `houseId`, a linha nascia com
     * `house_id NULL`, e a coordenadora da casa lia *"nada aconteceu com este
     * relatório"* sobre um documento que já tinha saído em Word.
     */
    expect(saiu).toBeTruthy();
    expect(saiu.casa).toBe('AI3');
    /*
     * E A FINALIDADE VEM COM ELA. O `linha()` do serviço expõe `finalidade:
     * r.purpose` e o comentário dele diz que *"exportar um relatório exige dizer
     * para quê"* — só que o `audit.log` da exportação não passava `purpose`
     * nenhum. A frase escrita pela técnica ficava no `export_log`, numa tabela
     * que esta rota não lê, e a auditoria devolvia a exportação SEM o para quê,
     * que é a única pergunta que se faz seis meses depois.
     */
    expect(saiu.finalidade).toMatch(/reunião de rede fictícia/i);
  });

  // ============ O relatório DE UMA CRIANÇA ============

  it('o relatório de uma criança da casa também deixa rastro que a casa lê', async () => {
    const gerado = await request(http).post('/api/v1/reports').set(auth(tokens.tecnica))
      .send({ kind: 'individual', personId: ids.crianca, ...PERIODO,
              finalidade: 'Conferência da fase 149 — relatório fictício de acolhido.' });
    expect(gerado.status).toBe(201);
    ids.daCrianca = gerado.body.id;

    const r = await rastro(tokens.coord, ids.daCrianca);
    expect(r.status).toBe(200);
    /*
     * Aqui o `houseId` não vem do corpo do pedido: relatório de pessoa não tem
     * unidade no formulário. Ele vem da criança — `app_person_house` —, e é essa
     * a única forma de a casa ver o que se escreveu sobre quem mora nela. Sem a
     * correção esta lista vinha VAZIA, inclusive a linha de geração.
     */
    const gerar = r.body.linhas.find((l: any) => l.codigo === 'report.generate');
    expect(gerar).toBeTruthy();
    expect(gerar.casa).toBe('AI3');
  });

  it('e a entrega ao órgão externo aparece para quem responde pela casa', async () => {
    /* Um relatório que exige aprovação, porque é o caminho real: judiciário sai
       aprovado, e a entrega é o último ato — o que a coordenação mais precisa ver. */
    const gerado = await request(http).post('/api/v1/reports').set(auth(tokens.tecnica))
      .send({ kind: 'judiciario', personId: ids.crianca, ...PERIODO,
              finalidade: 'Conferência da fase 149 — judiciário fictício.' });
    expect(gerado.status).toBe(201);
    const id = gerado.body.id;

    expect((await request(http).post(`/api/v1/reports/${id}/submit`)
      .set(auth(tokens.tecnica)).send({})).status).toBe(201);
    /* Quem redigiu não aprova o próprio relatório (§14.6). */
    expect((await request(http).post(`/api/v1/reports/${id}/approve`)
      .set(auth(tokens.coord)).send({})).status).toBe(201);
    expect((await request(http).post(`/api/v1/reports/${id}/delivery`).set(auth(tokens.tecnica))
      .send({ destinatario: 'Vara da Infância (fictícia)', meio: 'protocolo físico', entregueEm: '2026-09-21',
              protocolo: 'FIC-149' })).status).toBe(201);

    const r = await rastro(tokens.coord, id);
    const codigos = r.body.linhas.map((l: any) => l.codigo);
    /* Os quatro atos da vida do documento, os quatro na casa. */
    expect(codigos).toContain('report.generate');
    expect(codigos).toContain('report.submit');
    expect(codigos).toContain('report.approve');
    expect(codigos).toContain('report.delivery_registered');
    expect(r.body.linhas.every((l: any) => l.casa === 'AI3')).toBe(true);
  });

  // ============ E A PROVA QUE FALTAVA: a casa CHEGA na linha ============

  /**
   * ESTE TESTE EXISTE POR UM FALSO VERDE MEU, e ele é a lição da fase.
   *
   * A primeira correção desta fase lia a casa pelo `db.query` do kernel — a
   * consulta SEM identidade. Sem identidade o `stay_select` não devolve linha
   * nenhuma (`SELECT count(*) FROM house_stay` como a aplicação sem usuário dá
   * **zero**), então as cinquenta e três correções gravavam `null` do mesmo
   * jeito. Os testes acima continuavam passando porque o relatório lê a casa por
   * outro caminho, e o conferidor estático só cobra que o `houseId` ESTEJA
   * escrito — nenhum dos dois olha o que chega ao banco.
   *
   * Então aqui entra um ato que NÃO é de relatório, escrito pela técnica sobre
   * uma criança, lido de volta pela coordenação na rota do ACOLHIDO. É a única
   * cobrança que prova o que a fase promete.
   */
  it('o que a técnica escreve sobre a criança aparece no rastro que a casa lê', async () => {
    const mudou = await request(http).patch(`/api/v1/people/${ids.crianca}`)
      .set(auth(tokens.tecnica))
      .send({ observacoes: `Conferência da fase 149 — ${Date.now()}.` });
    expect(mudou.status).toBe(200);

    const r = await request(http).get(`/api/v1/audit/person/${ids.crianca}`)
      .set(auth(tokens.coord));
    expect(r.status).toBe(200);
    const linha = r.body.linhas.find((l: any) => l.codigo === 'person.profile_update');
    expect(linha).toBeTruthy();
    expect(linha.casa).toBe('AI3');
  });

  it('e a coordenação de outra casa não vê esse ato', async () => {
    const r = await request(http).get(`/api/v1/audit/person/${ids.crianca}`)
      .set(auth(tokens.deOutraCasa));
    /* Regra 8: fora do alcance responde igual a inexistente — e aqui o serviço
       PODE distinguir, porque a criança tem alcance próprio. */
    expect(r.status).toBe(404);
  });

  // ============ Quem NÃO lê ============

  it('a coordenação de OUTRA casa não lê o rastro desta', async () => {
    const r = await rastro(tokens.deOutraCasa, ids.daCasa);
    /*
     * 404, e não mais 200 com lista vazia (fase 158). A frase que estava aqui
     * dizia que distinguir "nada aconteceu" de "não é sua casa" exigiria olhar
     * por fora do RLS. Não exige: a pergunta "você enxerga este relatório?" é
     * feita COM a identidade de quem lê, e o RLS de `report_document` responde.
     * A lista vazia se lia "ninguém abriu este relatório" — a regra 12.
     */
    expect(r.status).toBe(404);
  });

  it('educador e Enfermagem recebem a recusa escrita, e não uma lista vazia', async () => {
    for (const cargo of ['educador', 'enfermagem'] as const) {
      const r = await rastro(tokens[cargo], ids.daCasa);
      expect(r.status).toBe(403);
      /* A recusa DIZ quem lê, e diz a razão — ler o rastro é outro ato. */
      expect(r.body.message).toMatch(/coordena/i);
      expect(r.body.message).toMatch(/gest/i);
    }
  });

  it('o Gestor Geral lê o rastro das oito casas', async () => {
    const r = await rastro(tokens.gestor, ids.daCasa);
    expect(r.status).toBe(200);
    expect(r.body.linhas.length).toBeGreaterThan(0);
  });

  it('relatório que não existe responde que não foi encontrado — e não lista vazia', async () => {
    const r = await rastro(tokens.gestor, '00000000-0000-4000-8000-000000000000');
    expect(r.status).toBe(404);
  });
});
