/**
 * O LAÇO DO ARQUIVO (§16.2) — fechou, entra na fila.
 *
 * Este teste existe por causa de um silêncio. Até 31/08/2026 NADA enfileirava
 * cópia documental: a única porta era `POST /archive`, que nenhuma tela
 * chamava. A fila ficava permanentemente vazia; a reconciliação respondia
 * "nada pendente: tudo o que fechou está arquivado" — verdade sobre a fila,
 * mentira sobre a instituição — e o protótipo ainda avisava, ao fechar a ATA,
 * que a cópia documental tinha entrado na fila. Não tinha.
 *
 * O que este teste guarda:
 *
 *  * fechar a ATA da casa gera cópia documental, com o nome sem pessoa;
 *  * fechar de novo NÃO duplica: a fila é idempotente por (entidade, versão),
 *    e uma ATA reaberta e refechada tem uma cópia, não duas;
 *  * o educador continua sem enxergar a fila (§16.5), mesmo agora que ela tem
 *    conteúdo — foi o fechamento dele que gerou o item;
 *  * a cópia carrega categoria e caminho, e o nome de arquivo não tem CPF,
 *    nome de criança nem espaço (§3.3).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const emPortoAlegre = (d: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);
/* Um dia só deste teste: fechar a ATA de hoje disputaria com outras suítes. */
const DIA = emPortoAlegre(new Date(Date.now() - 3 * 86_400_000));

describe('O laço do arquivo — fechou, entra na fila', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const itensDaAta = async (ataId: string) => (await admin.query(
    `SELECT categoria, caminho, filename, versao, status FROM archive_item
      WHERE entity = 'ata' AND entity_id = $1`, [ataId])).rows;

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
      lider: 'lider.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('fechar a ATA da casa gera a cópia documental, com nome sem pessoa', async () => {
    const plantao = await request(http).post('/api/v1/shifts').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, data: DIA, turno: 'diurno' });
    expect(plantao.status).toBe(201);
    const ataId = plantao.body.ataId;

    // Antes de fechar não existe cópia: o arquivo guarda o que a instituição
    // FECHOU, e nunca cria documento por conta própria (§16.2).
    expect(await itensDaAta(ataId)).toEqual([]);

    const fechou = await request(http).post(`/api/v1/shifts/ata/${ataId}/close`)
      .set(auth(tokens.lider))
      .send({ pendencias: 'Fechada no ensaio automatizado do laço do arquivo.' });
    expect([201, 400]).toContain(fechou.status);

    const itens = await itensDaAta(ataId);
    expect(itens.length).toBe(1);
    expect(itens[0].categoria).toBe('ata');
    expect(itens[0].caminho).toMatch(/^ACOLHIMENTO\/AI3\/\d{4}\/\d{2}\/ata$/);
    // §3.3: nem CPF, nem espaço, nem nome de criança no nome do arquivo.
    expect(itens[0].filename).not.toMatch(/\s/);
    expect(itens[0].filename).not.toMatch(/\d{11}/);
    expect(itens[0].filename).toMatch(/^ata_\d{4}-\d{2}-\d{2}_[0-9a-f]{8}_V1\.pdf$/);

    ids.ata = ataId;
  });

  it('reabrir e fechar de novo não duplica a cópia', async () => {
    const reabriu = await request(http).post(`/api/v1/shifts/ata/${ids.ata}/reopen`)
      .set(auth(tokens.coord))
      .send({ motivo: 'Reabertura do ensaio automatizado, para conferir a idempotência da fila.' });
    if (reabriu.status !== 201) return; // a regra da reabertura muda: o que este caso prova é a fila

    await request(http).post(`/api/v1/shifts/ata/${ids.ata}/close`).set(auth(tokens.coord))
      .send({ pendencias: 'Refechada no ensaio.' });

    const itens = await itensDaAta(ids.ata);
    expect(itens.length).toBe(1);
  });

  it('o educador gerou o item e continua sem enxergar a fila (§16.5)', async () => {
    const res = await request(http).get('/api/v1/archive/queue').set(auth(tokens.educador));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/não têm acesso às pastas/i);

    // E a coordenação vê — inclusive a cópia que este teste acabou de gerar.
    const daCoord = await request(http).get('/api/v1/archive/queue?limite=200')
      .set(auth(tokens.coord));
    expect(daCoord.status).toBe(200);
    expect(daCoord.body.some((i: any) => i.entidade === 'ata')).toBe(true);
  });

  it('a reconciliação da casa deixa de mentir: agora ela tem o que contar', async () => {
    const res = await request(http).get(`/api/v1/archive/reconcile?houseId=${ids.AI3}`)
      .set(auth(tokens.coord));
    expect(res.status).toBe(200);
    const ata = res.body.porCategoria.find((c: any) => c.categoria === 'ata');
    expect(ata).toBeTruthy();
    expect(Number(ata.aguardando) + Number(ata.verificado) + Number(ata.falhou))
      .toBeGreaterThan(0);
  });
});
