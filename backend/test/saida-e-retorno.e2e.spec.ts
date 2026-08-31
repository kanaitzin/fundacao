/**
 * SAÍDA, ACERVO E RETORNO (§15.2, §15.3) — o ciclo inteiro, pelas portas.
 *
 * A saída e o retorno existiam no servidor desde a fase 2 e não tinham como
 * ser chamados: registrar retorno pede o `personId` de alguém que nenhuma
 * lista devolvia. O acervo é a porta que faltava, e este teste guarda as
 * regras que ela não pode afrouxar:
 *
 *  * o acervo é da equipe técnica e da coordenação. O educador e o líder não
 *    desligam ninguém, e não leem a lista de quem saiu;
 *  * quem saiu sai MESMO: some da visão da casa, da contagem, da chamada —
 *    e continua existindo, com o histórico, no acervo;
 *  * o retorno abre episódio NOVO. Não é desfazer a saída;
 *  * o motivo da saída é obrigatório, e fica gravado onde possa ser lido
 *    depois — foi a última frase escrita sobre aquele acolhimento;
 *  * consultar o acervo deixa rastro, e o rastro NÃO carrega nome de criança.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Saída, acervo e retorno', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let saiu: { id: string; nome: string };

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const acervo = (token: string, casa = ids.AI3) =>
    request(http).get(`/api/v1/people/archive?houseId=${casa}`).set(auth(token));
  const daCasa = async (token: string) =>
    (await request(http).get(`/api/v1/people?houseId=${ids.AI3}`).set(auth(token))).body;

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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));

    /*
     * Uma criança SÓ DESTE TESTE, criada aqui.
     *
     * Desligar alguém da semeadura seria mexer no estado que as outras suítes
     * usam — e "a suíte que roda depois encontra a casa com um a menos" é
     * exatamente a contaminação que a regra das duas rodadas existe para
     * pegar. A saída é definitiva por natureza: o teste precisa da sua.
     */
    const opcoes = await request(http).get('/api/v1/people/admission/options')
      .set(auth(tokens.tecnica));
    const adm = await request(http).post('/api/v1/people/admission').set(auth(tokens.tecnica))
      .send({
        houseId: ids.AI3,
        pessoa: { fullName: 'Criança de Teste da Saída', socialName: 'Teste Saída',
                  birthDate: '2014-03-11', cpf: '' },
        // Sem CPF, o servidor exige o motivo do ingresso urgente (§6.1) — e é
        // o caminho certo aqui: um CPF fixo colidiria na segunda rodada.
        acolhimento: { admittedOn: new Date().toISOString().slice(0, 10),
                       provisionalReason: 'Ingresso urgente — ficção de teste.',
                       // A Casa 03 da semeadura já está no limite de vagas, e o
                       // servidor pede a justificativa por escrito antes de
                       // acolher assim mesmo. O teste responde como a
                       // coordenação responderia.
                       capacityReason: 'Acolhimento em caráter excepcional para o ensaio '
                         + 'automatizado; vaga conferida com a coordenação.' },
        judicial: { reasonCategory: opcoes.body?.motivos?.[0]?.cod,
                    measureType: opcoes.body?.medidas?.[0]?.cod,
                    determiningBody: opcoes.body?.orgaos?.[0]?.cod },
      });
    if (adm.status !== 201) {
      throw new Error(`admissão do teste falhou: ${adm.status} ${JSON.stringify(adm.body)}`);
    }
    saiu = { id: adm.body.personId, nome: 'Teste Saída' };
  });

  /*
   * A criança do teste volta a sair no fim.
   *
   * O último caso a deixa ATIVA na casa — é o que ele prova. Sem desfazer
   * isso, cada rodada acrescentaria um nome à Casa 03 e a casa cresceria
   * sozinha, quebrando as suítes que contam os vinte. O perfil continua no
   * acervo, que é onde ele deve ficar: nada é apagado.
   */
  afterAll(async () => {
    if (saiu?.id) {
      await request(http).post(`/api/v1/people/${saiu.id}/discharge`)
        .set(auth(tokens.tecnica))
        .send({ motivo: 'Encerramento do ensaio automatizado.' })
        .catch(() => { /* já saiu: o estado desejado é este */ });
    }
    await app.close(); await admin.end();
  });

  // ==================== Alcance ====================

  it('o acervo é da equipe técnica e da coordenação — o educador e o líder não abrem', async () => {
    for (const quem of ['educador', 'lider']) {
      const res = await acervo(tokens[quem]);
      expect([quem, res.status]).toEqual([quem, 403]);
      expect(res.body.message).toMatch(/equipe técnica|coordenação/i);
    }
    for (const quem of ['tecnica', 'coord', 'gestor']) {
      const res = await acervo(tokens[quem]);
      expect([quem, res.status]).toEqual([quem, 200]);
      expect(Array.isArray(res.body.pessoas)).toBe(true);
    }
  });

  it('o educador não registra saída nem retorno', async () => {
    const s = await request(http).post(`/api/v1/people/${saiu.id}/discharge`)
      .set(auth(tokens.educador)).send({ motivo: 'qualquer coisa' });
    expect(s.status).toBe(403);
    const r = await request(http).post(`/api/v1/people/${saiu.id}/readmit`)
      .set(auth(tokens.educador)).send({ houseId: ids.AI3 });
    expect(r.status).toBe(403);
  });

  // ==================== O ciclo ====================

  it('a saída exige motivo escrito', async () => {
    const res = await request(http).post(`/api/v1/people/${saiu.id}/discharge`)
      .set(auth(tokens.tecnica)).send({ motivo: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/motivo/i);
  });

  it('quem sai deixa a casa e passa a existir no acervo, com o motivo', async () => {
    const antes = await daCasa(tokens.educador);
    expect(antes.some((p: any) => p.id === saiu.id)).toBe(true);

    const MOTIVO = 'Reintegração familiar, com acompanhamento da rede de origem (ficção de teste).';
    const res = await request(http).post(`/api/v1/people/${saiu.id}/discharge`)
      .set(auth(tokens.tecnica)).send({ motivo: MOTIVO });
    expect(res.status).toBe(201);

    // Some da visão da casa — que é a lista da chamada e da contagem.
    const depois = await daCasa(tokens.educador);
    expect(depois.some((p: any) => p.id === saiu.id)).toBe(false);

    // E aparece no acervo, com a última frase escrita sobre o acolhimento.
    const arq = await acervo(tokens.tecnica);
    const registro = arq.body.pessoas.find((p: any) => p.id === saiu.id);
    expect(registro).toBeTruthy();
    expect(registro.motivoDaSaida).toBe(MOTIVO);
    expect(registro.saiuEm).toBeTruthy();
  });

  it('o acervo é pobre de propósito: nem CPF, nem saúde, nem judicial', async () => {
    const arq = await acervo(tokens.coord);
    const registro = arq.body.pessoas.find((p: any) => p.id === saiu.id);
    expect(Object.keys(registro).sort()).toEqual(
      ['episodios', 'id', 'idade', 'motivoDaSaida', 'nome', 'saiuEm']);
  });

  it('o retorno abre episódio NOVO e devolve a criança à casa', async () => {
    const res = await request(http).post(`/api/v1/people/${saiu.id}/readmit`)
      .set(auth(tokens.coord)).send({ houseId: ids.AI3 });
    expect(res.status).toBe(201);
    expect(res.body.episodio).toBeGreaterThan(1);
    // O sistema não reativa nada sozinho, e o aviso diz isso a quem registrou.
    expect(res.body.aviso).toMatch(/Enfermagem/);

    const depois = await daCasa(tokens.educador);
    expect(depois.some((p: any) => p.id === saiu.id)).toBe(true);

    // Quem voltou não é acervo: é acolhido.
    const arq = await acervo(tokens.tecnica);
    expect(arq.body.pessoas.some((p: any) => p.id === saiu.id)).toBe(false);
  });

  it('não se registra retorno de quem já está ativo', async () => {
    const res = await request(http).post(`/api/v1/people/${saiu.id}/readmit`)
      .set(auth(tokens.coord)).send({ houseId: ids.AI3 });
    expect(res.status).toBe(409);
  });

  // ==================== O rastro ====================

  it('consultar o acervo deixa rastro, e o rastro não carrega nome de criança', async () => {
    await acervo(tokens.tecnica);
    const { rows } = await admin.query(
      `SELECT detail::text FROM audit_event WHERE action = 'person.acervo.consulta'
        ORDER BY at DESC LIMIT 1`);
    expect(rows.length).toBe(1);
    expect(rows[0].detail).toMatch(/registros/);
    expect(rows[0].detail).not.toContain('Teste Saída');
  });
});
