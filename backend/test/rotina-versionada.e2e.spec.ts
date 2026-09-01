/**
 * A ROTINA VERSIONADA DA CASA (§8.1).
 *
 * `GET /routine`, `/routine/history`, `POST /routine/versions` e
 * `/versions/:id/items` existiam desde a fase 2 e nenhuma tela as chamava. O
 * dia da casa nascia de dados semeados, e a pergunta "a que horas é a janta
 * aqui?" não tinha resposta dentro do sistema — tinha no quadro da cozinha.
 *
 * O que este teste guarda:
 *
 *  * **alterar não reescreve.** Abrir versão nova ENCERRA a atual com data e
 *    COPIA os itens. A anterior continua inteira: é ela que explica por que o
 *    dia de dois meses atrás foi daquele jeito. Sem isso, o registro antigo
 *    vira uma lista de horários que não batem com nada;
 *  * **versão encerrada não recebe item novo.** A trava vive no gatilho do
 *    banco, não no serviço, e a mensagem diz o próximo passo — não só que deu
 *    errado;
 *  * **quem lê não é quem altera.** A casa inteira lê o molde; alterar é da
 *    equipe técnica e da coordenação, e a recusa vem do servidor;
 *  * **item individual pede o nome.** Um item de uma criança sem dizer de quem
 *    é um item que ninguém cumpre;
 *  * **o vocabulário é do servidor.** O enum `routine_kind` é do banco, e o
 *    servidor recusa tipo que não seja dele.
 *
 * A suíte trabalha na CASA 04, e não na Casa 03: `operacao.e2e` é dona da
 * rotina da AI3 (conta as versões e os itens dela pelo número exato), e as
 * duas juntas na mesma casa alternavam conforme a ordem dos arquivos — a
 * mesma contaminação que a regra das duas rodadas já pegou duas vezes.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A rotina versionada da casa', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  /* `ids.AI3` guarda a CASA DA SUÍTE — a 04. O nome ficou por herança do molde. */
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const rotina = async (token: string) =>
    (await request(http).get(`/api/v1/routine?houseId=${ids.AI3}`).set(auth(token))).body;

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
      educador: 'educador.ai4@paodospobres.dev',
      coord: 'coord.ai4@paodospobres.dev',
      // Transversal: alcança as oito casas por função, e é quem abre a segunda
      // versão — o teste precisa dos DOIS cargos que alteram.
      tecnica: 'gestor@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ person_id: ids.acolhido }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa' LIMIT 1`,
      [ids.AI3]));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== Ler ====================

  it('a casa inteira lê o molde, com o vocabulário que o servidor aplica', async () => {
    const res = await request(http).get(`/api/v1/routine?houseId=${ids.AI3}`)
      .set(auth(tokens.educador));
    expect(res.status).toBe(200);
    // Os tipos são o espelho do enum `routine_kind`; a tela não inventa nenhum.
    const codigos = res.body.tipos.map((t: any) => t.code);
    expect(codigos).toEqual(expect.arrayContaining(['refeicao', 'escola', 'banho', 'sono']));
    expect(res.body.dias).toHaveLength(7);
    // E ele sabe que NÃO altera, sem que a tela precise repetir a lista.
    expect(res.body.podeAlterar).toBe(false);
  });

  it('o educador não abre versão, e a recusa diz de quem é', async () => {
    const res = await request(http).post('/api/v1/routine/versions')
      .set(auth(tokens.educador))
      .send({ houseId: ids.AI3, motivo: 'Mudança que o educador não decide.' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/equipe técnica|coordenação/i);
  });

  // ==================== Escrever ====================

  it('a coordenação abre uma versão, e o motivo é obrigatório', async () => {
    const semMotivo = await request(http).post('/api/v1/routine/versions')
      .set(auth(tokens.coord)).send({ houseId: ids.AI3, motivo: '  ' });
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.message).toMatch(/motivo/i);

    const res = await request(http).post('/api/v1/routine/versions')
      .set(auth(tokens.coord))
      .send({ houseId: ids.AI3,
              motivo: 'Rotina inicial escrita no ensaio automatizado da Casa 03.' });
    expect(res.status).toBe(201);
    ids.v1 = res.body.versaoId;
    ids.n1 = String(res.body.numero);

    const r = await rotina(tokens.coord);
    expect(r.versao.id).toBe(ids.v1);
    expect(r.podeAlterar).toBe(true);
  });

  it('o item nasce com tipo, nome e horário — e o servidor cobra os três', async () => {
    const tipoInvalido = await request(http).post(`/api/v1/routine/versions/${ids.v1}/items`)
      .set(auth(tokens.coord))
      .send({ houseId: ids.AI3, kind: 'castigo', title: 'Item inválido', startTime: '19:00' });
    expect(tipoInvalido.status).toBe(400);
    expect(tipoInvalido.body.message).toMatch(/tipo/i);

    const semHora = await request(http).post(`/api/v1/routine/versions/${ids.v1}/items`)
      .set(auth(tokens.coord))
      .send({ houseId: ids.AI3, kind: 'refeicao', title: 'Janta', startTime: 'de noite' });
    expect(semHora.status).toBe(400);
    expect(semHora.body.message).toMatch(/07:00/);

    const semNome = await request(http).post(`/api/v1/routine/versions/${ids.v1}/items`)
      .set(auth(tokens.coord))
      .send({ houseId: ids.AI3, kind: 'refeicao', title: 'x', startTime: '18:30' });
    expect(semNome.status).toBe(400);

    const ok = await request(http).post(`/api/v1/routine/versions/${ids.v1}/items`)
      .set(auth(tokens.coord))
      .send({ houseId: ids.AI3, kind: 'refeicao', title: 'Janta do ensaio',
              startTime: '18:30', endTime: '19:15',
              instructions: 'Conferir as restrições alimentares antes de servir.' });
    expect(ok.status).toBe(201);
  });

  it('item individual precisa dizer de quem é', async () => {
    const semNinguem = await request(http).post(`/api/v1/routine/versions/${ids.v1}/items`)
      .set(auth(tokens.coord))
      .send({ houseId: ids.AI3, kind: 'saude', title: 'Fonoaudiologia do ensaio',
              startTime: '15:00', collective: false });
    expect(semNinguem.status).toBe(400);
    expect(semNinguem.body.message).toMatch(/acolhido/i);

    const res = await request(http).post(`/api/v1/routine/versions/${ids.v1}/items`)
      .set(auth(tokens.coord))
      .send({ houseId: ids.AI3, kind: 'saude', title: 'Fonoaudiologia do ensaio',
              startTime: '15:00', collective: false, personId: ids.acolhido, weekdays: [2] });
    expect(res.status).toBe(201);

    const r = await rotina(tokens.coord);
    const item = r.itens.find((i: any) => i.titulo === 'Fonoaudiologia do ensaio');
    expect(item.coletiva).toBe(false);
    expect(item.acolhido.visivel).toBe(true);
    // Item de uma criança nasce exigindo ciência de quem conduz.
    expect(item.exigeCiencia).toBe(true);
    expect(item.diasSemana).toEqual([2]);
  });

  // ==================== Versionar ====================

  it('a versão nova COPIA os itens e ENCERRA a anterior, sem apagar nada', async () => {
    const antes = await rotina(tokens.coord);
    const quantos = antes.itens.length;
    expect(quantos).toBeGreaterThanOrEqual(2);

    const res = await request(http).post('/api/v1/routine/versions')
      .set(auth(tokens.tecnica))
      .send({ houseId: ids.AI3,
              motivo: 'A escola passou os maiores para a tarde; o almoço mudou de hora.' });
    expect(res.status).toBe(201);
    ids.v2 = res.body.versaoId;
    expect(res.body.numero).toBe(Number(ids.n1) + 1);

    const depois = await rotina(tokens.coord);
    expect(depois.versao.id).toBe(ids.v2);
    // Copiou: a versão nova é ponto de partida, não folha em branco. Ninguém
    // reescreve a rotina inteira para mudar a hora da janta.
    expect(depois.itens.length).toBe(quantos);
    expect(depois.itens.map((i: any) => i.titulo))
      .toEqual(expect.arrayContaining(['Janta do ensaio', 'Fonoaudiologia do ensaio']));
    // E os itens são OUTROS registros: a versão anterior continua com os dela.
    const idsAntes = antes.itens.map((i: any) => i.id).sort();
    const idsDepois = depois.itens.map((i: any) => i.id).sort();
    expect(idsDepois).not.toEqual(idsAntes);
  });

  it('a versão encerrada não recebe item novo, e a recusa diz o próximo passo', async () => {
    const res = await request(http).post(`/api/v1/routine/versions/${ids.v1}/items`)
      .set(auth(tokens.coord))
      .send({ houseId: ids.AI3, kind: 'lazer', title: 'Item que chegou tarde',
              startTime: '20:00' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/versão nova/i);
  });

  it('o histórico mostra o que a casa seguiu, e quando deixou de seguir', async () => {
    const res = await request(http).get(`/api/v1/routine/history?houseId=${ids.AI3}`)
      .set(auth(tokens.educador));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    const atual = res.body.find((v: any) => v.atual);
    expect(atual.vigenteAte).toBeNull();
    const anterior = res.body.find((v: any) => v.numero === Number(ids.n1));
    expect(anterior.vigenteAte).not.toBeNull();
    // O motivo é o que explica o registro daquela época, um ano depois.
    expect(anterior.nota).toMatch(/ensaio automatizado/);
    // Nada foi apagado: a versão encerrada continua na lista.
    expect(res.body.filter((v: any) => v.atual)).toHaveLength(1);
  });

  it('tudo ficou auditado, com autor e com a casa (regra 6)', async () => {
    const { rows } = await admin.query(
      `SELECT action, actor_id, house_id FROM audit_event
        WHERE entity_id = $1 OR (entity = 'routine_version' AND entity_id = $2)`,
      [ids.v2, ids.v1]);
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['routine.new_version']));
    for (const r of rows) {
      expect(r.actor_id).toBeTruthy();
      expect(r.house_id).toBe(ids.AI3);
    }
  });
});
