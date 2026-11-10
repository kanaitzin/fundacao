/**
 * O ATENDIMENTO DA EQUIPE TÉCNICA (fase 218, pedido de 14/10).
 *
 * "Se a psicopedagoga ou a psicóloga está fazendo um atendimento, e algum
 * desenho tem alguma coisa, ela pode tirar foto, digitalizar ou anexar o
 * arquivo, e hospedar no perfil daquela criança como um acompanhamento."
 *
 *  1. a técnica registra o atendimento com o desenho, e a coordenação lê;
 *  2. o arquivo abre como foi guardado, e a abertura fica na auditoria, com a casa;
 *  3. o educador não lê nem registra, e a outra casa não alcança;
 *  4. sem área, sem relato ou com o dia por vir, não entra;
 *  5. o atendimento é fonte do acompanhamento, sem o que foi trabalhado;
 *  6. nada se reescreve, e a área tem o mesmo nome no banco e na regra.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import JSZip from 'jszip';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { AREAS_DO_ATENDIMENTO } from '../src/modules/people/atendimento-tecnico.regra';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
// Um PNG de 1x1, inteiro (assinatura e bloco IEND).
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('O atendimento da equipe técnica', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let hoje = '';

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
      tecnica: 'tecnica.ai3@paodospobres.dev', coord: 'coord.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ person_id: ids.crianca }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa' ORDER BY person_id LIMIT 1`, [ids.AI3]));
    ({ rows: [{ hoje }] } = await admin.query(`SELECT app_hoje()::text AS hoje`));
  });

  afterAll(async () => {
    if (ids.followup) await admin.query(`DELETE FROM followup WHERE id = $1`, [ids.followup]);
    await app.close(); await admin.end();
  });

  it('a técnica registra o atendimento com o desenho, e a coordenação lê', async () => {
    const r = await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.tecnica))
      .send({ area: 'psicologia', dia: hoje, hora: '00:00', relato: 'Sessão com desenho livre da família (conferência 218).',
              anexos: [{ conteudo: PNG, nomeArquivo: 'desenho.png', legenda: 'O desenho da sessão' }] })
      .expect(201);
    ids.sessao = r.body.id;
    const lista = await request(http).get(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.coord)).expect(200);
    const s = lista.body.find((x: any) => x.id === ids.sessao);
    expect(s).toMatchObject({ area: 'psicologia', areaRotulo: 'Psicologia', dia: hoje, hora: '00:00' });
    expect(s.por).toBeTruthy();
    expect(s.anexos).toEqual([expect.objectContaining({ nome: 'desenho.png', tipo: 'image/png', legenda: 'O desenho da sessão' })]);
    ids.anexo = s.anexos[0].id;
  });

  it('o mesmo dia em ordem de hora, o mais novo em cima, com a hora e quando foi registrado (fase 275)', async () => {
    const r = await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.tecnica))
      .send({ area: 'servico_social', dia: hoje, hora: '00:01', relato: 'Contato com a família por telefone (conferência 275).' })
      .expect(201);
    const lista = (await request(http).get(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.coord)).expect(200)).body;
    const meus = lista.filter((x: any) => [ids.sessao, r.body.id].includes(x.id));
    expect(meus.map((x: any) => x.hora)).toEqual(['00:01', '00:00']);
    expect(meus[0].registradoEm).toBeTruthy();
    const chaves = lista.map((x: any) => `${x.dia} ${x.hora ?? ''}`);
    expect(chaves).toEqual([...chaves].sort().reverse());
  });

  it('o arquivo abre como foi guardado, e a abertura fica na auditoria, com a casa', async () => {
    const r = await request(http).get(`/api/v1/people/technical-sessions/attachments/${ids.anexo}/file`)
      .set(auth(tokens.coord)).expect(200);
    expect(r.body.conteudo).toBe(PNG);
    const { rows } = await admin.query(
      `SELECT action, house_id FROM audit_event WHERE entity_id IN ($1, $2) ORDER BY at`, [ids.sessao, ids.anexo]);
    expect(rows.map((x) => x.action)).toEqual(['atendimento_tecnico.registrado', 'atendimento_tecnico.anexo.aberto']);
    expect(rows.every((x) => x.house_id === ids.AI3)).toBe(true);
  });

  it('baixar o arquivo depois de ver fica na auditoria como baixado, e a outra casa não baixa (fase 306)', async () => {
    const r = await request(http).post(`/api/v1/people/technical-sessions/attachments/${ids.anexo}/download`)
      .set(auth(tokens.coord)).expect(201);
    expect(r.body.conteudo).toBe(PNG);
    const { rows } = await admin.query(
      `SELECT house_id FROM audit_event WHERE entity_id = $1 AND action = 'atendimento_tecnico.anexo.baixado'`, [ids.anexo]);
    expect(rows).toHaveLength(1);
    expect(rows[0].house_id).toBe(ids.AI3);
    expect((await request(http).post(`/api/v1/people/technical-sessions/attachments/${ids.anexo}/download`)
      .set(auth(tokens.coord4))).status).toBe(404);
  });

  it('o atendimento comportamental da casa se registra como os outros, com o nome que educa (fase 306)', async () => {
    const r = await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.coord))
      .send({ area: 'comportamental', dia: hoje, hora: '00:02', ondeFoi: 'interno', local: 'Sala da coordenação',
              relato: 'Conversa sobre a briga no quarto e o combinado de chamar a educadora antes (fictício).' });
    expect(r.status).toBe(201);
    const lista = (await request(http).get(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.coord)).expect(200)).body;
    expect(lista.find((x: any) => x.id === r.body.id).areaRotulo).toBe('Atendimento comportamental da casa');
  });

  it('o plantão registra o atendimento comportamental, com arquivo, e continua sem ler os atendimentos (fase 307)', async () => {
    const r = await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.educador))
      .send({ area: 'comportamental', dia: hoje, hora: '00:03', ondeFoi: 'interno', local: 'Sala da casa',
              relato: 'Conversa depois da briga no pátio; combinado de chamar a educadora antes (fictício).',
              anexos: [{ conteudo: PNG, nomeArquivo: 'combinado.png', legenda: 'O combinado escrito' }] });
    expect(r.status).toBe(201);
    const { rows } = await admin.query(
      `SELECT s.area, s.created_by, (SELECT count(*)::int FROM technical_session_attachment a WHERE a.session_id = s.id) AS arquivos
         FROM technical_session s WHERE s.id = $1`, [r.body.id]);
    expect(rows[0]).toMatchObject({ area: 'comportamental', arquivos: 1 });
    expect((await request(http).get(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.educador))).status).toBe(403);
    const outra = await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.educador))
      .send({ area: 'psicologia', dia: hoje, hora: '00:03', ondeFoi: 'interno', local: 'Sala da casa',
              relato: 'Tentando registrar outra área pelo plantão (fictício).' });
    expect(outra.status).toBe(403);
    expect(outra.body.message).toMatch(/atendimento comportamental/);
  });

  it('o educador não lê nem registra, e a outra casa não alcança', async () => {
    expect((await request(http).get(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.educador))).status).toBe(403);
    expect((await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.educador))
      .send({ area: 'psicologia', dia: hoje, hora: '00:00', relato: 'Tentando registrar pelo plantão.' })).status).toBe(403);
    expect((await request(http).get(`/api/v1/people/technical-sessions/attachments/${ids.anexo}/file`)
      .set(auth(tokens.educador))).status).toBe(404);
    expect([403, 404]).toContain((await request(http).get(`/api/v1/people/${ids.crianca}/technical-sessions`)
      .set(auth(tokens.coord4))).status);
    expect((await request(http).get(`/api/v1/people/technical-sessions/attachments/${ids.anexo}/file`)
      .set(auth(tokens.coord4))).status).toBe(404);
    const { rows: [{ n: antes }] } = await admin.query(`SELECT count(*)::int AS n FROM technical_session WHERE person_id = $1`, [ids.crianca]);
    expect([403, 404]).toContain((await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions`)
      .set(auth(tokens.coord4)).send({ area: 'psicologia', dia: hoje, hora: '00:00', relato: 'De outra casa, não pode.' })).status);
    const { rows: [{ n: depois }] } = await admin.query(`SELECT count(*)::int AS n FROM technical_session WHERE person_id = $1`, [ids.crianca]);
    expect(depois).toBe(antes);
  });

  it('sem área, sem relato ou com o dia por vir, não entra', async () => {
    const enviar = (corpo: any) => request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions`)
      .set(auth(tokens.tecnica)).send(corpo);
    expect((await enviar({ dia: hoje, hora: '00:00', relato: 'Sem área nenhuma escrita.' })).status).toBe(400);
    /* Sem a hora, não entra (fase 275): cada anotação com a data e a hora. */
    const semHora = await enviar({ area: 'psicologia', dia: hoje, relato: 'Um atendimento sem a hora escrita.' });
    expect(semHora.status).toBe(400);
    expect(semHora.body.message).toMatch(/hora do atendimento/);
    expect((await enviar({ area: 'psicopedagogia', dia: hoje, relato: 'curto' })).status).toBe(400);
    expect((await enviar({ area: 'outra', dia: hoje, relato: 'Outra área sem dizer qual.' })).status).toBe(400);
    const futuro = await enviar({ area: 'psicologia', dia: '2099-01-01', hora: '10:00', relato: 'Um atendimento que não aconteceu.' });
    expect(futuro.status).toBe(400);
    expect(futuro.body.message).toMatch(/ainda não chegou/);
  });

  it('o atendimento é fonte do acompanhamento, sem o que foi trabalhado', async () => {
    // O acompanhamento de teste sai no fim, como na suíte das fontes: ele não é da casa.
    const { rows: [f] } = await admin.query(
      `INSERT INTO followup (person_id, house_id, episode_id, kind, period_start, period_end, status)
       VALUES ($1, $2, (SELECT id FROM care_episode WHERE person_id = $1 ORDER BY started_at DESC LIMIT 1),
               'semanal', app_hoje(), app_hoje(), 'pendente') RETURNING id`, [ids.crianca, ids.AI3]);
    ids.followup = f.id;
    const r = await request(http).get(`/api/v1/followups/${f.id}/sources`).set(auth(tokens.tecnica)).expect(200);
    const c = r.body.candidatos.find((x: any) => x.id === ids.sessao);
    expect(c).toMatchObject({ entidade: 'technical_session', tipo: 'atendimento_tecnico',
      titulo: 'Psicologia', classificacao: 'restrito', resumo: '1 arquivo anexado' });
    expect(JSON.stringify(c)).not.toMatch(/desenho livre/);
  });

  it('nada se reescreve, e a área tem o mesmo nome no banco e na regra', async () => {
    const { rows } = await admin.query(
      `SELECT a.cod, app_rotulo_da_area_do_atendimento(a.cod, NULL) AS rotulo
         FROM unnest($1::text[]) AS a(cod)`, [AREAS_DO_ATENDIMENTO.map((a) => a.cod)]);
    expect(rows.map((r) => r.rotulo)).toEqual(AREAS_DO_ATENDIMENTO.map((a) => a.label));
    const { rows: [g] } = await admin.query(
      `SELECT has_table_privilege('rede_app', 'technical_session', 'UPDATE') AS u,
              has_table_privilege('rede_app', 'technical_session', 'DELETE') AS d,
              has_table_privilege('rede_app', 'technical_session_attachment', 'UPDATE') AS ua`);
    expect(g).toEqual({ u: false, d: false, ua: false });
  });

  it('o atendimento diz onde foi e quem atendeu, e a Assistência Social tem esse nome (fase 284)', async () => {
    const errado = await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.tecnica))
      .send({ area: 'servico_social', dia: hoje, hora: '00:00', relato: 'Visita domiciliar com a família (fictício).',
              ondeFoi: 'na rua' });
    expect(errado.status).toBe(400);
    const r = await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.tecnica))
      .send({ area: 'servico_social', dia: hoje, hora: '00:00', relato: 'Visita domiciliar com a família (fictício).',
              ondeFoi: 'externo', local: 'Casa da avó, Restinga (fictício)', profissional: 'Assistente social do CREAS (fictício)' });
    expect(r.status).toBe(201);
    ids.externo = r.body.id;
    const lista = (await request(http).get(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.coord))).body;
    const s = lista.find((x: any) => x.id === ids.externo);
    expect(s).toMatchObject({ areaRotulo: 'Assistência Social', ondeFoi: 'externo', ondeFoiRotulo: 'Externo, fora da casa',
      local: 'Casa da avó, Restinga (fictício)', profissional: 'Assistente social do CREAS (fictício)', podeAnexar: false });
    const minha = (await request(http).get(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.tecnica))).body
      .find((x: any) => x.id === ids.externo);
    expect(minha.podeAnexar).toBe(true);
  });

  it('quem registrou junta o arquivo que faltou, e só quem registrou (fase 284)', async () => {
    const outra = await request(http).post(`/api/v1/people/technical-sessions/${ids.externo}/attachments`)
      .set(auth(tokens.coord)).send({ anexos: [{ conteudo: PNG, nomeArquivo: 'relatorio.png' }] });
    expect(outra.status).toBe(403);
    const ok = await request(http).post(`/api/v1/people/technical-sessions/${ids.externo}/attachments`)
      .set(auth(tokens.tecnica)).send({ anexos: [{ conteudo: PNG, nomeArquivo: 'relatorio.png', legenda: 'Relatório da visita' }] });
    expect(ok.status).toBe(201);
    const s = (await request(http).get(`/api/v1/people/${ids.crianca}/technical-sessions`).set(auth(tokens.coord))).body
      .find((x: any) => x.id === ids.externo);
    expect(s.anexos).toHaveLength(1);
    const { rows } = await admin.query(
      `SELECT house_id FROM audit_event WHERE action = 'atendimento_tecnico.anexo.juntado' AND entity_id = $1`, [ids.externo]);
    expect(rows).toEqual([{ house_id: ids.AI3 }]);
  });

  it('a técnica baixa os atendimentos do período em Word, com a finalidade, e o educador não (fase 284)', async () => {
    const corpo = { de: hoje, ate: hoje, finalidade: 'Reunião de estudo de caso (fictício)' };
    expect((await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions/export`)
      .set(auth(tokens.educador)).send(corpo)).status).toBe(403);
    expect((await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions/export`)
      .set(auth(tokens.tecnica)).send({ ...corpo, finalidade: 'curta' })).status).toBe(400);
    const r = await request(http).post(`/api/v1/people/${ids.crianca}/technical-sessions/export`)
      .set(auth(tokens.tecnica)).send(corpo);
    expect(r.status).toBe(201);
    expect(r.body.nomeArquivo).toMatch(/\.docx$/);
    const z = await JSZip.loadAsync(Buffer.from(r.body.conteudoBase64, 'base64'));
    const xml = await z.file('word/document.xml')!.async('string');
    expect(xml).toContain('Assistência Social');
    expect(xml).toContain('Externo, fora da casa');
    expect(xml).toContain('Relatório da visita');
    const { rows } = await admin.query(
      `SELECT purpose, house_id FROM audit_event WHERE action = 'documento.export' AND entity = 'technical_session'
         AND entity_id = $1 ORDER BY at DESC LIMIT 1`, [ids.crianca]);
    expect(rows[0]).toEqual({ purpose: 'Reunião de estudo de caso (fictício)', house_id: ids.AI3 });
  });
});

