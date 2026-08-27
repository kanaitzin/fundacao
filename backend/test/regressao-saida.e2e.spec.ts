/**
 * REGRESSÃO — "o dia em que a criança sai da casa".
 *
 * Existe por causa de uma classe inteira de defeitos encontrada numa auditoria
 * do código: **`JOIN` com tabela protegida por RLS não filtra coluna — ele
 * elimina a linha, em silêncio, sem erro.**
 *
 * A causa de fundo é um descasamento legítimo entre duas regras corretas:
 *   * um REGISTRO (episódio de ATA, ocorrência, atividade, evolução) pertence
 *     a uma CASA e continua visível para ela — inclusive depois de fechado;
 *   * a PESSOA é visível pela PERMANÊNCIA ATIVA, que muda na transferência.
 *
 * Consequência antes da correção: no instante da transferência, o episódio de
 * contenção sumia da ATA fechada, a ocorrência de violência perdia o nome de
 * quem ela tratava, e a ATA Geral Noturna mostrava 1 casa em vez de 8 — tudo
 * sem erro, sem aviso, sem rastro. Num sistema de proteção, sumir em silêncio
 * é o pior comportamento possível.
 *
 * Cada teste aqui transfere uma criança de propósito e verifica que o registro
 * deixado para trás continua legível para quem tem direito a ele.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

describe('Regressão — registros deixados para trás quando a criança sai', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, AI4: string;
  // Fixtures PRÓPRIOS desta suíte. Reaproveitar os 20 do seed quebraria as
  // contagens de outras suítes: transferir uma criança muda o efetivo da casa.
  // Aqui elas nascem, são transferidas e saem para o acervo no fim.
  const criadas: string[] = [];
  let gabi: string, igor: string, nina: string, rafa: string;

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** Transfere de fato: solicita na origem, aceita no destino. */
  const transferir = async (personId: string, motivo: string) => {
    const req = await request(http).post('/api/v1/transfers').set(auth(tokens.tecnica))
      .send({ personId, toHouseId: AI4, reason: motivo });
    expect(req.status).toBe(201);
    const ok = await request(http).post(`/api/v1/transfers/${req.body.id}/accept`)
      .set(auth(tokens.coord4)).send({});
    expect(ok.status).toBe(201);
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
      lider: 'lider.ai3@paodospobres.dev',
      noturno: 'lider.noturno@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord3: 'coord.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    const nascer = async (nome: string, social: string, anos: number) => {
      const res = await request(http).post('/api/v1/people').set(auth(tokens.tecnica))
        .send({ houseId: AI3, fullName: nome, socialName: social,
                birthDate: `${new Date().getUTCFullYear() - anos}-05-10`,
                provisionalReason: 'Ingresso de teste automatizado — dados fictícios' });
      if (res.status !== 201) throw new Error(`admissão ${social}: ${res.status} ${JSON.stringify(res.body)}`);
      criadas.push(res.body.personId);
      return res.body.personId as string;
    };
    gabi = await nascer('Gabriela Teste Regressão (fictícia)', 'GabiR', 12);
    igor = await nascer('Igor Teste Regressão (fictício)', 'IgorR', 14);
    nina = await nascer('Nina Teste Regressão (fictícia)', 'NinaR', 7);
    rafa = await nascer('Rafaela Teste Regressão (fictícia)', 'RafaR', 13);
  });

  afterAll(async () => {
    // Devolve as casas ao efetivo original: as quatro saem para o acervo.
    // Sem isso, esta suíte alteraria a contagem de acolhidos vista pelas outras.
    for (const id of criadas) {
      await request(http).post(`/api/v1/people/${id}/discharge`)
        .set(auth(tokens.coord4)).send({ motivo: 'Encerramento de fixture de teste' });
    }
    await app.close(); await admin.end();
  });

  it('o episódio continua na ATA fechada depois que a criança é transferida', async () => {
    const plantao = await request(http).post('/api/v1/shifts').set(auth(tokens.educador))
      .send({ houseId: AI3, data: HOJE, turno: 'diurno' });
    const ataId = plantao.body.ataId;

    const ep = await request(http).post(`/api/v1/shifts/ata/${ataId}/episodes`)
      .set(auth(tokens.educador))
      .send({ acolhidoId: gabi, classificacao: 'contencao',
              relato: 'Contenção física breve após escalada de conflito; equipe seguiu o protocolo e a Enfermagem foi acionada.' });
    expect(ep.status).toBe(201);

    await transferir(gabi, 'Aproximação de irmãos acolhidos na outra unidade');

    // A criança saiu; o episódio é da CASA e é imutável. Ele tem de continuar
    // legível — com nome — para quem responde por aquela ATA.
    const depois = await request(http).get(`/api/v1/shifts/${plantao.body.plantaoId}`)
      .set(auth(tokens.coord3));
    expect(depois.status).toBe(200);
    const episodio = depois.body.episodios.find((e: any) => e.id === ep.body.id);
    expect(episodio).toBeDefined();
    expect(episodio.acolhido).toMatch(/GabiR/);
    expect(episodio.relato).toMatch(/^Contenção física breve/);

    // E o educador da casa, que não é coordenação, também continua vendo.
    const doEducador = await request(http).get(`/api/v1/shifts/${plantao.body.plantaoId}`)
      .set(auth(tokens.educador));
    expect(doEducador.body.episodios.map((e: any) => e.acolhido)).toContain(episodio.acolhido);
  });

  it('a ocorrência não perde de quem ela trata quando a criança é transferida', async () => {
    const oc = await request(http).post('/api/v1/incidents').set(auth(tokens.educador))
      .send({ houseId: AI3, categoria: 'violencia_ou_suspeita', quando: new Date().toISOString(),
              fato: 'Relato espontâneo durante a rotina noturna sobre episódio anterior ao acolhimento.',
              acolhidos: [igor],
              falaEspontanea: 'Transcrição literal, sem interpretação.' });
    expect(oc.status).toBe(201);

    await transferir(igor, 'Determinação judicial de aproximação da comarca de origem');

    // Categoria que exige revisão técnica: quem PRECISA revisar não pode abrir
    // o caso e encontrar "nenhuma criança envolvida".
    const depois = await request(http).get(`/api/v1/incidents/${oc.body.id}`).set(auth(tokens.tecnica));
    expect(depois.status).toBe(200);
    expect(depois.body.acolhidos).toHaveLength(1);
    expect(depois.body.acolhidos[0].nome).toMatch(/IgorR/);
    expect(depois.body.acolhidos[0].visivel).toBe(true);
    expect(depois.body.protegido.falaEspontanea).toMatch(/Transcrição literal/);

    // Na linha do tempo, segue como ocorrência DE ALGUÉM, não coletiva.
    const tl = await request(http).get('/api/v1/timeline')
      .query({ houseId: AI3, date: HOJE }).set(auth(tokens.tecnica));
    const ev = tl.body.eventos.find((e: any) => e.id === `incident:${oc.body.id}`);
    expect(ev.personId).toBe(igor);
    expect(ev.personName).toMatch(/IgorR/);
  });

  it('a atividade individual mantém o nome do acolhido que já saiu', async () => {
    const atv = await request(http).post('/api/v1/activities/urgent')
      .set(auth(tokens.lider))
      .send({ houseId: AI3, personId: nina, title: 'Consulta odontológica remarcada',
              scheduledAt: new Date().toISOString(), kind: 'saude',
              reason: 'Encaixe aberto pela UBS para hoje à tarde' });
    expect(atv.status).toBe(201);

    await transferir(nina, 'Reorganização de vagas por perfil etário');

    const depois = await request(http).get('/api/v1/activities')
      .query({ houseId: AI3, date: HOJE }).set(auth(tokens.educador));
    const linha = depois.body.find((a: any) => a.id === atv.body.id);
    expect(linha).toBeDefined();
    // Antes da correção: nome null, e o Painel da Casa criava uma linha "—".
    expect(linha.acolhido).not.toBeNull();
    expect(linha.acolhido.visivel).toBe(true);
    expect(linha.acolhido.nome).toMatch(/NinaR/);
    expect(linha.acolhido.idade).toBeGreaterThan(0);
  });

  it('a evolução pendente acompanha a criança: a técnica do destino a encontra', async () => {
    // A evolução nasce na AI3, com `house_id` congelado na casa do ATENDIMENTO.
    const evo = await request(http).post('/api/v1/nursing/evolutions')
      .set(auth(tokens.educador))
      .send({ personId: rafa, houseId: AI3, tipo: 'consulta',
              quandoAconteceu: new Date().toISOString(), local: 'UBS (fictícia)',
              estadoRetorno: 'Tranquila, sem queixas', orientacoes: 'Retorno em 30 dias' });
    expect(evo.status).toBe(201);

    // No dia seguinte, a criança é transferida com a pendência clínica aberta.
    await transferir(rafa, 'Vaga em unidade mais próxima da escola atual');

    // Quem acabou de receber a criança PRECISA achar a pendência. Antes da
    // correção, o JOIN pela casa do atendimento (AI3) apagava a linha para a
    // coordenação da AI4 — a pendência de saúde sumia justo na troca de mãos.
    const fila = await request(http).get('/api/v1/nursing/triage').set(auth(tokens.coord4));
    expect(fila.status).toBe(200);
    const item = fila.body.find((f: any) => f.id === evo.body.id);
    expect(item).toBeDefined();
    expect(item.acolhido).toMatch(/RafaR/);
    expect(item.casa).toBe('AI3');   // a casa do atendimento, não a atual

    // A Enfermagem, transversal, sempre enxergou — por isso o defeito passou
    // despercebido: ele só atingia técnica e coordenação.
    const daEnfermagem = await request(http).get('/api/v1/nursing/triage').set(auth(tokens.enfermagem));
    expect(daEnfermagem.body.map((f: any) => f.id)).toContain(evo.body.id);
  });

  it('a ATA Geral Noturna mostra as OITO casas para a coordenação, com nome', async () => {
    const geral = await request(http).post('/api/v1/shifts/general-ata')
      .set(auth(tokens.noturno)).send({ data: HOJE });

    const vistaPelaCoordenacao = await request(http)
      .get(`/api/v1/shifts/general-ata/${geral.body.id}`).set(auth(tokens.coord3));
    expect(vistaPelaCoordenacao.status).toBe(200);
    expect(vistaPelaCoordenacao.body.total).toBe(8);
    expect(vistaPelaCoordenacao.body.casas).toHaveLength(8);
    // Antes da correção sobrava só AI3, e "1 de 1 confirmada" parecia noite
    // inteira em ordem.
    expect(vistaPelaCoordenacao.body.casas.map((c: any) => c.codigo).sort())
      .toEqual(['AI1', 'AI2', 'AI3', 'AI4', 'ARM1', 'ARM2', 'ARM3', 'ARM4']);
    for (const c of vistaPelaCoordenacao.body.casas) {
      expect(c.codigo).toBeTruthy();
      expect(c.nome).toBeTruthy();
      // "não existe" e "não posso ver" deixaram de ser a mesma frase.
      expect(c.situacaoAtaDaCasa).not.toBe('sem ATA aberta');
    }
  });

  it('nomear um acolhido que nunca passou pela sua casa continua impossível', async () => {
    // A função de rótulo é a peça central da correção. Se ela nomeasse
    // qualquer pessoa, teria trocado um defeito por um vazamento.
    const { rows: [outro] } = await admin.query(
      `SELECT p.id, p.social_name FROM person p
       JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa'
       JOIN house h ON h.id = s.house_id AND h.code = 'AI4'
       WHERE NOT EXISTS (SELECT 1 FROM house_stay s2 JOIN house h2 ON h2.id = s2.house_id
                         WHERE s2.person_id = p.id AND h2.code = 'AI3')
       LIMIT 1`);
    expect(outro).toBeDefined();

    const { rows: [r] } = await admin.query(
      `SELECT set_config('app.user_id', (SELECT id::text FROM app_user
         WHERE email='educador.ai3@paodospobres.dev'), false) AS _`);
    expect(r).toBeDefined();

    const app3 = new Client({
      connectionString: process.env.DATABASE_APP_URL
        ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher',
    });
    await app3.connect();
    const { rows: [edu] } = await admin.query(
      `SELECT id FROM app_user WHERE email='educador.ai3@paodospobres.dev'`);
    await app3.query(`SELECT set_config('app.user_id', $1, false)`, [edu.id]);
    const { rows: [nome] } = await app3.query(
      `SELECT app_person_display_name($1) AS n`, [outro.id]);
    expect(nome.n).toBeNull();
    await app3.end();
  });
});
