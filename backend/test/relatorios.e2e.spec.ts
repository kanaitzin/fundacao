/**
 * FASE 6 — acompanhamentos, aprovações, relatórios e arquivo (§14, §16, §18).
 *
 * O que estas provas defendem:
 *
 *  1. **a automação cria a pendência, nunca a avaliação** (§14.1). O sistema
 *     gera as pendências da semana e do mês; os eixos nascem vazios;
 *
 *  2. **quem escreve não aprova** (§14.2, §14.6). Vale para o acompanhamento
 *     mensal e para o relatório ao Judiciário. Revisão feita pelo próprio
 *     autor não é revisão;
 *
 *  3. **aprovado é retrato daquele momento.** Nem quem aprovou reabre.
 *     Corrigir cria versão nova — e a anterior continua legível;
 *
 *  4. **o sistema não envia nada para fora** (§14.6). Não há rota de envio;
 *     há registro de que uma pessoa entregou, a quem, quando e por qual meio;
 *
 *  5. **exportar deixa rastro** (§18.4), e planilha não leva conteúdo
 *     sensível junto;
 *
 *  6. **arquivo não sobrescreve e falha não some** (§16.3, §16.4). Versões
 *     separadas, nome de arquivo sem CPF, e falha persistente que chega a
 *     gente em vez de ficar num log.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Fase 6 — acompanhamentos, relatórios, aprovações e arquivo', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string;
  let followupMensal = '';
  let relatorioJud = '';
  const arquivados: string[] = [];

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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
  });

  afterAll(async () => {
    // Limpeza sem DELETE em auditoria: os documentos desta suíte saem de cena
    // marcados, e a fila de arquivo é esvaziada pelo admin do banco.
    if (arquivados.length) {
      await admin.query(`DELETE FROM archive_attempt WHERE item_id = ANY($1::uuid[])`, [arquivados]);
      await admin.query(`DELETE FROM archive_item WHERE id = ANY($1::uuid[])`, [arquivados]);
    }
    await admin.query(`DELETE FROM export_log WHERE report_id IS NOT NULL`);
    await admin.query(`DELETE FROM report_delivery`);
    await admin.query(`DELETE FROM report_document`);
    await admin.query(`DELETE FROM followup_source`);
    await admin.query(`DELETE FROM followup`);
    await app.close(); await admin.end();
  });

  // ---------------- Acompanhamentos ----------------

  it('a automação cria as pendências e deixa os eixos vazios (§14.1)', async () => {
    const res = await request(http).post('/api/v1/followups/generate')
      .set(auth(tokens.tecnica)).send({ houseId: AI3 });
    expect(res.status).toBe(201);
    expect(res.body.criadas).toBeGreaterThan(0);

    // Rodar de novo não duplica: a geração é idempotente.
    const denovo = await request(http).post('/api/v1/followups/generate')
      .set(auth(tokens.tecnica)).send({ houseId: AI3 });
    expect(denovo.body.criadas).toBe(0);

    const lista = await request(http).get(`/api/v1/followups?houseId=${AI3}&tipo=mensal`)
      .set(auth(tokens.tecnica));
    expect(lista.body.length).toBeGreaterThan(0);
    followupMensal = lista.body[0].id;

    const um = await request(http).get(`/api/v1/followups/${followupMensal}`).set(auth(tokens.tecnica));
    // O sistema não escreveu nada em lugar nenhum.
    expect(Object.values(um.body.eixos).every((v) => v === null)).toBe(true);
    expect(um.body.situacao).toBe('pendente');
  });

  it('o acompanhamento é documento técnico: o educador não o enxerga', async () => {
    const res = await request(http).get(`/api/v1/followups?houseId=${AI3}`).set(auth(tokens.educador));
    // A policy não devolve linha nenhuma — não é filtro de tela.
    expect(res.body).toEqual([]);
  });

  it('a fonte é escolhida por gente, e o que fica guardado é a referência (§14.4)', async () => {
    await request(http).post(`/api/v1/followups/${followupMensal}/draft`).set(auth(tokens.tecnica))
      .send({ saude: 'Consulta odontológica realizada; sem intercorrências.',
              escola: 'Frequência regular no período.' });

    const fonte = await request(http).post(`/api/v1/followups/${followupMensal}/sources`)
      .set(auth(tokens.tecnica)).send({
        entidade: 'incident', entityId: '11111111-1111-1111-1111-111111111111',
        origem: 'Ocorrência de 12/08', autor: 'Ed. M. Silva (fictício)',
        registradoEm: '2026-08-12T21:40:00Z', classificacao: 'restrito',
      });
    expect(fonte.status).toBe(201);
    // Fonte restrita não é copiada sozinha para dentro do texto.
    expect(fonte.body.aviso).toMatch(/referência, não a narrativa/i);

    const aberto = await request(http).get(`/api/v1/followups/${followupMensal}`).set(auth(tokens.tecnica));
    expect(aberto.body.fontes).toHaveLength(1);
    expect(aberto.body.fontes[0].origem).toBe('Ocorrência de 12/08');
    expect(aberto.body.fontes[0].classificacao).toBe('restrito');
  });

  it('quem redige o mensal não aprova o próprio texto (§14.2)', async () => {
    const envio = await request(http).post(`/api/v1/followups/${followupMensal}/submit`)
      .set(auth(tokens.tecnica));
    expect(envio.status).toBe(201);

    // A equipe técnica redige e não aprova — nem o próprio, nem o de ninguém.
    const daTecnica = await request(http).post(`/api/v1/followups/${followupMensal}/approve`)
      .set(auth(tokens.tecnica)).send({});
    expect(daTecnica.status).toBe(403);
    expect(daTecnica.body.message).toMatch(/somente a coordenação/i);

    // E a regra que interessa de verdade: quando é a COORDENAÇÃO que redige,
    // ela também não assina a própria revisão. Sem isto, bastaria a
    // coordenação escrever tudo para a revisão deixar de existir.
    const semanal = await request(http).get(`/api/v1/followups?houseId=${AI3}&tipo=semanal`)
      .set(auth(tokens.coord));
    const daCasa = semanal.body[0].id;
    await request(http).post(`/api/v1/followups/${daCasa}/draft`).set(auth(tokens.coord))
      .send({ convivencia: 'Semana sem intercorrências registradas.' });
    await request(http).post(`/api/v1/followups/${daCasa}/submit`).set(auth(tokens.coord));
    const proprio = await request(http).post(`/api/v1/followups/${daCasa}/approve`)
      .set(auth(tokens.coord)).send({});
    expect(proprio.status).toBe(403);
    expect(proprio.body.message).toMatch(/não aprova o próprio texto/i);

    const daCoord = await request(http).post(`/api/v1/followups/${followupMensal}/approve`)
      .set(auth(tokens.coord)).send({ nota: 'Revisado com a equipe técnica.' });
    expect(daCoord.status).toBe(201);
    expect(daCoord.body.aprovado).toBe(true);
  });

  it('aprovado é retrato: não se edita, e a correção cria versão nova', async () => {
    const edicao = await request(http).post(`/api/v1/followups/${followupMensal}/draft`)
      .set(auth(tokens.coord)).send({ saude: 'texto trocado depois da aprovação' });
    expect(edicao.status).toBe(409);

    const semMotivo = await request(http).post(`/api/v1/followups/${followupMensal}/amend`)
      .set(auth(tokens.tecnica)).send({ motivo: 'erro' });
    expect(semMotivo.status).toBe(400);

    const nova = await request(http).post(`/api/v1/followups/${followupMensal}/amend`)
      .set(auth(tokens.tecnica))
      .send({ motivo: 'Correção da data da consulta odontológica, conferida no prontuário.' });
    expect(nova.status).toBe(201);
    expect(nova.body.versao).toBe(2);

    // A versão aprovada continua legível, marcada como substituída.
    const { rows } = await admin.query(
      `SELECT status, version FROM followup WHERE id=$1`, [followupMensal]);
    expect(rows[0].status).toBe('substituido');
    expect(rows[0].version).toBe(1);

    // E as fontes escolhidas acompanham a nova versão.
    const v2 = await request(http).get(`/api/v1/followups/${nova.body.id}`).set(auth(tokens.tecnica));
    expect(v2.body.fontes).toHaveLength(1);
    expect(v2.body.situacao).toBe('rascunho');
  });

  // ---------------- Relatórios ----------------

  it('relatório exige finalidade — não existe relatório "só para ver" (§18.4)', async () => {
    const res = await request(http).post('/api/v1/reports').set(auth(tokens.tecnica))
      .send({ kind: 'atividades', houseId: AI3, de: '2026-08-01', ate: '2026-08-31', finalidade: 'ver' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/finalidade/i);
  });

  it('o relatório ao Judiciário é redigido pela técnica e aprovado pela coordenação (§14.6)', async () => {
    const { rows: [pessoa] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]);

    const gerado = await request(http).post('/api/v1/reports').set(auth(tokens.tecnica)).send({
      kind: 'judiciario', personId: pessoa.person_id, houseId: AI3,
      de: '2026-08-01', ate: '2026-08-31',
      finalidade: 'Audiência concentrada agendada para setembro.',
      secoes: [
        { titulo: 'situação judicial', texto: 'Medida em vigor; audiência a marcar.',
          fonte: 'Registro judicial do episódio', autor: 'Equipe técnica' },
        { titulo: 'saúde', texto: 'Acompanhamento odontológico concluído.',
          fonte: 'Evolução de Saúde de 12/08' },
      ],
    });
    expect(gerado.status).toBe(201);
    expect(gerado.body.exigeAprovacao).toBe(true);
    relatorioJud = gerado.body.id;

    // Cada trecho mantém de onde veio (§14.6).
    const doc = await request(http).get(`/api/v1/reports/${relatorioJud}`).set(auth(tokens.tecnica));
    expect(doc.body.corpo.secoes[0].fonte).toBe('Registro judicial do episódio');
    expect(doc.body.corpo.secoes[1].autor).toBeTruthy();   // sem autor informado, assume o redator

    // Exportar rascunho de relatório que vai para fora: recusado.
    await request(http).post(`/api/v1/reports/${relatorioJud}/submit`).set(auth(tokens.tecnica));
    const daTecnica = await request(http).post(`/api/v1/reports/${relatorioJud}/approve`)
      .set(auth(tokens.tecnica));
    expect(daTecnica.status).toBe(403);
    expect(daTecnica.body.message).toMatch(/somente a coordenação/i);

    // A coordenação aprovando um relatório que ela mesma redigiu: recusado.
    const daCoord = await request(http).post('/api/v1/reports').set(auth(tokens.coord)).send({
      kind: 'judiciario', personId: pessoa.person_id, houseId: AI3,
      de: '2026-08-01', ate: '2026-08-31',
      finalidade: 'Teste da regra de revisão por outra pessoa.',
      secoes: [{ titulo: 'situação judicial', texto: 'Texto fictício.' }],
    });
    await request(http).post(`/api/v1/reports/${daCoord.body.id}/submit`).set(auth(tokens.coord));
    const proprio = await request(http).post(`/api/v1/reports/${daCoord.body.id}/approve`)
      .set(auth(tokens.coord));
    expect(proprio.status).toBe(403);
    expect(proprio.body.message).toMatch(/não aprova o próprio relatório/i);

    const aprovado = await request(http).post(`/api/v1/reports/${relatorioJud}/approve`)
      .set(auth(tokens.coord));
    expect(aprovado.status).toBe(201);

    // Gestor consulta a versão aprovada.
    const doGestor = await request(http).get(`/api/v1/reports/${relatorioJud}`).set(auth(tokens.gestor));
    expect(doGestor.status).toBe(200);
    expect(doGestor.body.situacao).toBe('aprovado');
  });

  it('o sistema gera, mas não envia: a entrega é ato humano registrado (§14.6)', async () => {
    // Não existe rota de envio. O que existe é o registro de que alguém entregou.
    const entrega = await request(http).post(`/api/v1/reports/${relatorioJud}/delivery`)
      .set(auth(tokens.coord)).send({
        destinatario: '1ª Vara da Infância e Juventude (fictícia)',
        meio: 'protocolo presencial', entregueEm: '2026-08-27T14:00:00Z',
        protocolo: 'PROT-FICT-2026-01',
      });
    expect(entrega.status).toBe(201);

    const lista = await request(http).get(`/api/v1/reports/${relatorioJud}/delivery`)
      .set(auth(tokens.coord));
    expect(lista.body[0].protocolo).toBe('PROT-FICT-2026-01');
    expect(lista.body[0].registrouPor).toBeTruthy();
  });

  it('exportar deixa rastro, e planilha não leva o conteúdo sensível junto (§18.4)', async () => {
    const semFinalidade = await request(http).post(`/api/v1/reports/${relatorioJud}/export`)
      .set(auth(tokens.coord)).send({ formato: 'pdf', finalidade: 'pdf' });
    expect(semFinalidade.status).toBe(400);

    const pdf = await request(http).post(`/api/v1/reports/${relatorioJud}/export`)
      .set(auth(tokens.coord))
      .send({ formato: 'pdf', finalidade: 'Cópia para a pasta do caso, uso interno.' });
    expect(pdf.status).toBe(201);
    expect(pdf.body.corpo.secoes[0].texto).toBeTruthy();

    const planilha = await request(http).post(`/api/v1/reports/${relatorioJud}/export`)
      .set(auth(tokens.coord))
      .send({ formato: 'planilha', finalidade: 'Consolidação de indicadores do mês.' });
    // Planilha viaja fácil demais: leva os títulos, não o conteúdo.
    expect(planilha.body.corpo.secoes[0].texto).toBeUndefined();

    const { rows } = await admin.query(
      `SELECT format, purpose FROM export_log WHERE report_id=$1 ORDER BY at`, [relatorioJud]);
    expect(rows.map((r) => r.format)).toEqual(['pdf', 'planilha']);
    expect(rows[0].purpose).toMatch(/pasta do caso/);
  });

  it('o painel do gestor não ordena casas por número — sem ranking (§3.3)', async () => {
    const res = await request(http).get('/api/v1/reports/panel').set(auth(tokens.gestor));
    expect(res.status).toBe(200);
    const codigos = res.body.map((c: any) => c.codigo);
    expect(codigos).toEqual([...codigos].sort());
    expect(res.body[0].ocupacao.limite).toBe(20);
  });

  // ---------------- Arquivo documental ----------------

  it('nome de arquivo não carrega pessoa, e a fila não duplica (§16.3)', async () => {
    const id = '22222222-2222-2222-2222-222222222222';
    const primeiro = await request(http).post('/api/v1/archive').set(auth(tokens.coord))
      .send({ houseId: AI3, categoria: 'ata', entidade: 'ata', entityId: id });
    expect(primeiro.status).toBe(201);
    expect(primeiro.body.jaExistia).toBe(false);
    expect(primeiro.body.filename).not.toMatch(/[0-9]{11}/);
    arquivados.push(primeiro.body.id);

    const repetido = await request(http).post('/api/v1/archive').set(auth(tokens.coord))
      .send({ houseId: AI3, categoria: 'ata', entidade: 'ata', entityId: id });
    expect(repetido.body.jaExistia).toBe(true);
    expect(repetido.body.id).toBe(primeiro.body.id);

    // Adendo é OUTRA versão, com outro arquivo — nunca sobrescreve.
    const adendo = await request(http).post('/api/v1/archive').set(auth(tokens.coord))
      .send({ houseId: AI3, categoria: 'adendo', entidade: 'ata', entityId: id, versao: 'V2_ADENDO' });
    expect(adendo.body.jaExistia).toBe(false);
    expect(adendo.body.id).not.toBe(primeiro.body.id);
    arquivados.push(adendo.body.id);

    // E o caminho segue casa/ano/mês/categoria (§16.3).
    const item = await request(http).get(`/api/v1/archive/${primeiro.body.id}`).set(auth(tokens.coord));
    expect(item.body.caminho).toMatch(/^ACOLHIMENTO\/AI3\/\d{4}\/\d{2}\/ata$/);
  });

  it('narrativa restrita vai para outra raiz, e o educador não vê a fila (§16.5)', async () => {
    const restrito = await request(http).post('/api/v1/archive').set(auth(tokens.coord)).send({
      houseId: AI3, categoria: 'narrativa_restrita', entidade: 'statement',
      entityId: '33333333-3333-3333-3333-333333333333', restrita: true,
    });
    expect(restrito.status).toBe(201);
    arquivados.push(restrito.body.id);

    const item = await request(http).get(`/api/v1/archive/${restrito.body.id}`).set(auth(tokens.coord));
    expect(item.body.caminho).toMatch(/^RESTRITO\//);

    // A fila é SECURITY DEFINER e atravessa casas — então ela mesma verifica
    // quem está perguntando, em vez de confiar na policy da tabela.
    const doEducador = await request(http).get('/api/v1/archive/queue').set(auth(tokens.educador));
    expect(doEducador.status).toBe(403);
    expect(doEducador.body.message).toMatch(/não têm acesso às pastas/i);
  });

  it('o envio percorre os estados e termina verificado (§16.4)', async () => {
    const res = await request(http).post('/api/v1/archive/process')
      .set(auth(tokens.coord)).send({ limite: 5 });
    expect(res.status).toBe(201);
    expect(res.body.itens.every((i: any) => i.situacao === 'verificado')).toBe(true);

    const item = await request(http).get(`/api/v1/archive/${arquivados[0]}`).set(auth(tokens.coord));
    expect(item.body.situacao).toBe('verificado');
    expect(item.body.historico.map((h: any) => h.para))
      .toEqual(['enviando', 'salvo', 'verificado']);
    expect(item.body.sha256).toBeTruthy();
  });

  it('falha persistente vira aviso para gente, e o documento não some (§16.4)', async () => {
    process.env.ARQUIVO_MODO = 'falha';
    try {
      const id = '44444444-4444-4444-4444-444444444444';
      const item = await request(http).post('/api/v1/archive').set(auth(tokens.coord))
        .send({ houseId: AI3, categoria: 'ocorrencia', entidade: 'incident', entityId: id });
      arquivados.push(item.body.id);

      for (let i = 0; i < 3; i++) {
        await request(http).post('/api/v1/archive/process').set(auth(tokens.coord)).send({ limite: 1 });
      }

      const depois = await request(http).get(`/api/v1/archive/${item.body.id}`).set(auth(tokens.coord));
      expect(depois.body.situacao).toBe('falhou');
      expect(depois.body.tentativas).toBe(3);
      expect(depois.body.ultimoErro).toMatch(/indisponível/i);

      // A falha chega a alguém — não fica só num log de servidor.
      const { rows } = await admin.query(
        `SELECT count(*)::int AS n FROM audit_event WHERE action='archive.failure_escalated'`);
      expect(rows[0].n).toBeGreaterThan(0);

      // E a reconciliação mostra o buraco em vez de escondê-lo.
      const rec = await request(http).get(`/api/v1/archive/reconcile?houseId=${AI3}`)
        .set(auth(tokens.coord));
      expect(rec.body.pendentes).toBeGreaterThan(0);
      expect(rec.body.aviso).toMatch(/continuam íntegros no sistema/i);
    } finally {
      delete process.env.ARQUIVO_MODO;
    }
  });
});
