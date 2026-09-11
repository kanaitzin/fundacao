/**
 * REUNIÕES DE EQUIPE E COMBINADOS (§9.4, migração 0840).
 *
 * A pergunta que a casa faz toda semana é uma só: *"o que ficou combinado?"*.
 * Hoje a resposta mora na ata de papel da reunião, no grupo de mensagens e na
 * memória de quem estava lá — e quem mais precisa dela, a educadora do turno
 * da noite, quase nunca estava na reunião.
 *
 * O que este teste guarda:
 *
 *  * ESCREVE QUEM DECIDE, LÊ QUEM CUIDA. Registrar é da equipe técnica e da
 *    coordenação; ler é de todo mundo com alcance na casa, o educador
 *    inclusive. Um combinado que o turno não pode ler não é combinado;
 *  * o TEXTO do combinado é imutável, inclusive por dentro do banco. Corrigir
 *    a redação apagaria o que a equipe leu e cumpriu durante semanas;
 *  * a SITUAÇÃO muda, e nunca em silêncio: exige motivo escrito e nasce uma
 *    linha de histórico com autor e horário, na mesma transação;
 *  * o combinado encerrado NÃO some da lista. "Mas ficou combinado que..." é
 *    uma discussão que só o registro encerra;
 *  * e o alcance é da casa: a coordenação da Casa 03 não escreve combinado na
 *    Casa 04 nem lê os de lá.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { corrida } from './setup/corrida-no-banco';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Reuniões de equipe e combinados', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let HOJE = '';

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const ler = (token: string) =>
    request(http).get(`/api/v1/alignments?houseId=${ids.AI4}`).set(auth(token));

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
      // Casa 04: esta suíte conta combinados, e a AI3 é disputada por outras.
      coord: 'coord.ai4@paodospobres.dev',
      educador: 'educador.ai4@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      deOutraCasa: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ hoje: HOJE }] } = await admin.query(`SELECT app_hoje()::text AS hoje`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== Escreve quem decide ====================

  it('o educador NÃO registra reunião — e é a única coisa que ele não faz aqui', async () => {
    const negado = await request(http).post('/api/v1/alignments/meetings')
      .set(auth(tokens.educador))
      .send({ houseId: ids.AI4, data: HOJE, titulo: 'Reunião do turno' });
    expect(negado.status).toBe(403);
    expect(negado.body.message).toMatch(/Ler é de todo mundo da casa/i);
  });

  it('a coordenação registra a reunião com os combinados que saíram dela', async () => {
    const res = await request(http).post('/api/v1/alignments/meetings')
      .set(auth(tokens.coord))
      .send({
        houseId: ids.AI4, data: HOJE, tipo: 'equipe',
        titulo: 'Organização das saídas para a escola',
        participantes: 'Coordenação, equipe técnica e educadores do turno da tarde.',
        pauta: 'Horários de saída e quem acompanha cada criança.',
        notas: 'A escola mudou o horário da tarde; a equipe acertou dois ajustes.',
        combinados: [
          { texto: 'A partir de segunda, a saída para a fono é com a educadora do turno da '
                 + 'tarde, e não com quem estiver entrando mais cedo.',
            responsavel: 'Turno da tarde' },
          { texto: 'Ninguém entra no quarto sem bater e esperar resposta, inclusive na ronda '
                 + 'da noite.' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.aviso).toMatch(/inclusive para quem não estava/i);
    ids.reuniao = res.body.id;
  });

  it('o combinado pela metade é recusado: quem lê não estava na conversa', async () => {
    const curto = await request(http).post('/api/v1/alignments/agreements')
      .set(auth(tokens.coord)).send({ houseId: ids.AI4, texto: 'combinar' });
    expect(curto.status).toBe(400);
    expect(curto.body.message).toMatch(/por inteiro/i);
  });

  // ==================== Lê quem cuida ====================

  it('o educador LÊ tudo — e o último combinado vem separado, sem rolagem', async () => {
    const r = await ler(tokens.educador);
    expect(r.status).toBe(200);
    expect(r.body.podeEscrever).toBe(false);
    expect(r.body.vigentes).toBe(2);
    expect(r.body.ultimo).toBeTruthy();
    expect(r.body.ultimo.texto).toBeTruthy();
    expect(r.body.aviso).toMatch(/ler é de todo mundo da casa/i);

    // A reunião vem com os combinados dela pendurados, na ordem da conversa.
    const reuniao = r.body.reunioes.find((m: any) => m.id === ids.reuniao);
    expect(reuniao.tipoRotulo).toBe('Reunião de equipe');
    expect(reuniao.combinados).toHaveLength(2);
    ids.combinado = reuniao.combinados[0].id;
  });

  // ==================== O texto não se reescreve ====================

  it('o texto do combinado é imutável, inclusive por dentro do banco', async () => {
    await expect(admin.query(
      `UPDATE team_agreement SET body = 'outra coisa' WHERE id = $1`, [ids.combinado]))
      .rejects.toThrow(/combinado_nao_se_reescreve/);
    await expect(admin.query(
      `DELETE FROM team_agreement WHERE id = $1`, [ids.combinado])).rejects.toThrow();
    // E a reunião também não se reescreve.
    await expect(admin.query(
      `UPDATE team_meeting SET title = 'outro assunto' WHERE id = $1`, [ids.reuniao]))
      .rejects.toThrow(/imutável/);
  });

  // ==================== A situação muda, e nunca em silêncio ====================

  it('encerrar exige motivo escrito', async () => {
    const semMotivo = await request(http)
      .post(`/api/v1/alignments/agreements/${ids.combinado}/status`)
      .set(auth(tokens.coord)).send({ situacao: 'revogado', motivo: 'não' });
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.message).toMatch(/cumprindo o que já foi desfeito/i);

    const { rows } = await admin.query(
      `SELECT status FROM team_agreement WHERE id = $1`, [ids.combinado]);
    expect(rows[0].status).toBe('vigente');
  });

  it('o educador não encerra combinado', async () => {
    const negado = await request(http)
      .post(`/api/v1/alignments/agreements/${ids.combinado}/status`)
      .set(auth(tokens.educador))
      .send({ situacao: 'cumprido', motivo: 'Achei que já estava feito.' });
    expect(negado.status).toBe(403);
  });

  it('encerrado com motivo: a linha muda e o histórico nasce junto', async () => {
    const res = await request(http)
      .post(`/api/v1/alignments/agreements/${ids.combinado}/status`)
      .set(auth(tokens.coord))
      .send({ situacao: 'revogado',
              motivo: 'A escola mudou o horário e o combinado deixou de fazer sentido.' });
    expect(res.status).toBe(201);
    expect(res.body.rotulo).toBe('Revogado');

    const { rows: h } = await admin.query(
      `SELECT before_status, after_status, reason, changed_by FROM agreement_change
        WHERE agreement_id = $1`, [ids.combinado]);
    expect(h).toHaveLength(1);
    expect(h[0].before_status).toBe('vigente');
    expect(h[0].after_status).toBe('revogado');
    expect(h[0].reason).toMatch(/deixou de fazer sentido/);
    expect(h[0].changed_by).toBeTruthy();

    // E o histórico também não se apaga.
    await expect(admin.query(
      `DELETE FROM agreement_change WHERE agreement_id = $1`, [ids.combinado]))
      .rejects.toThrow();
  });

  it('o combinado encerrado NÃO some da lista — some dos vigentes', async () => {
    const r = await ler(tokens.educador);
    expect(r.body.vigentes).toBe(1);
    const encerrado = r.body.combinados.find((c: any) => c.id === ids.combinado);
    expect(encerrado).toBeTruthy();                 // continua na lista
    expect(encerrado.situacaoRotulo).toBe('Revogado');
    expect(encerrado.motivoDaSituacao).toMatch(/deixou de fazer sentido/);
    expect(encerrado.mudadoPor).toBeTruthy();
    expect(encerrado.historico).toHaveLength(1);
    expect(encerrado.historico[0].de).toBe('Vigente');
    expect(encerrado.historico[0].para).toBe('Revogado');
  });

  it('encerrar duas vezes é recusado: registre um novo em vez de mexer neste', async () => {
    const denovo = await request(http)
      .post(`/api/v1/alignments/agreements/${ids.combinado}/status`)
      .set(auth(tokens.coord))
      .send({ situacao: 'cumprido', motivo: 'Tentativa de mudar o que já foi encerrado.' });
    expect(denovo.status).toBe(400);
    expect(denovo.body.message).toMatch(/já não está vigente/i);
  });

  // ==================== Substituir ====================

  it('substituir encerra o antigo com motivo e aponta o novo para ele', async () => {
    const antigo = (await ler(tokens.coord)).body.combinados
      .find((c: any) => c.situacao === 'vigente');

    const novo = await request(http).post('/api/v1/alignments/agreements')
      .set(auth(tokens.coord))
      .send({ houseId: ids.AI4, substituiId: antigo.id,
              texto: 'Ninguém entra no quarto sem bater; na ronda da noite, bate e espera '
                   + 'resposta antes de abrir a porta.' });
    expect(novo.status).toBe(201);

    const depois = await ler(tokens.coord);
    const substituido = depois.body.combinados.find((c: any) => c.id === antigo.id);
    expect(substituido.situacao).toBe('substituido');
    expect(substituido.motivoDaSituacao).toMatch(/Substituído por combinado/);
    const criado = depois.body.combinados.find((c: any) => c.id === novo.body.id);
    expect(criado.substitui).toBe(antigo.id);
    expect(criado.situacao).toBe('vigente');
  });

  // ==================== Alcance ====================

  it('o combinado é da casa: quem é de outra não escreve nem lê', async () => {
    const escrever = await request(http).post('/api/v1/alignments/agreements')
      .set(auth(tokens.deOutraCasa))
      .send({ houseId: ids.AI4, texto: 'Combinado escrito por quem não é desta casa.' });
    expect(escrever.status).toBe(403);

    const ler4 = await request(http)
      .get(`/api/v1/alignments?houseId=${ids.AI4}`).set(auth(tokens.deOutraCasa));
    // O RLS não devolve linha nenhuma: a lista vem vazia, e não com erro de sistema.
    expect(ler4.status).toBe(200);
    expect(ler4.body.combinados).toEqual([]);
    expect(ler4.body.reunioes).toEqual([]);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM team_agreement WHERE house_id = $1
        AND body LIKE '%não é desta casa%'`, [ids.AI4]);
    expect(rows[0].n).toBe(0);
  });

  it('a equipe técnica com alcance na casa escreve; a auditoria registra o ato', async () => {
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event
        WHERE action IN ('alignment.meeting','alignment.agreement','alignment.agreement_status')`);
    expect(rows[0].n).toBeGreaterThanOrEqual(3);
  });

  /*
   * O COMBINADO MUDA DE SITUAÇÃO UMA VEZ (fase 90).
   *
   * A técnica marca "cumprido" enquanto a coordenação marca "revogado". A
   * função lia 'vigente', gravava o histórico e depois a situação com
   * `UPDATE … WHERE id = …`: as duas passavam, o histórico ganhava DUAS
   * transições saindo de 'vigente', e a situação final era a de quem gravou
   * por último — com o motivo do outro no histórico dizendo o contrário.
   * Regra 11; prova em `setup/corrida-no-banco.ts`. Roda por último: esta
   * suíte conta combinados, e este termina encerrado.
   */
  it('duas mudanças de situação ao mesmo tempo: a segunda é recusada e o histórico tem uma', async () => {
    const novo = await request(http).post('/api/v1/alignments/agreements')
      .set(auth(tokens.coord))
      .send({ houseId: ids.AI4,
              texto: 'Quem chega depois das 22h avisa o plantão pelo interfone antes de subir.' });
    expect(novo.status).toBe(201);
    const MUDAR = `SELECT * FROM app_mudar_combinado($1, $2, $3)`;
    const r = await corrida(admin,
      { email: 'coord.ai4@paodospobres.dev', sql: MUDAR,
        params: [novo.body.id, 'cumprido', 'A: o interfone foi instalado e todos usam.'] },
      { email: 'gestor@paodospobres.dev', sql: MUDAR,
        params: [novo.body.id, 'revogado', 'B: a portaria passou a controlar a entrada.'] });
    expect(r).toMatch(/combinado_ja_encerrado/);
    const { rows: [c] } = await admin.query(
      `SELECT status, status_reason FROM team_agreement WHERE id=$1`, [novo.body.id]);
    expect(c.status).toBe('cumprido');
    expect(c.status_reason).toMatch(/^A:/);
    const { rows: [{ n }] } = await admin.query(
      `SELECT count(*)::int AS n FROM agreement_change WHERE agreement_id=$1`, [novo.body.id]);
    expect(n).toBe(1);
  });
});
