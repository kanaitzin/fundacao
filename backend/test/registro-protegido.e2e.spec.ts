/**
 * REGISTRAR FALA ESPONTÂNEA E SINAIS OBSERVADOS DEPOIS DA ABERTURA (§13.2).
 *
 * A folha de abrir ocorrência já recebia os dois campos. O que faltava porta é
 * o caso mais comum de todos: a criança fala DEPOIS. Três dias depois, às 23h,
 * na hora de dormir, para a educadora que estava perto — e não para quem abriu
 * a ocorrência. Sem esta porta só sobravam dois caminhos, e os dois são
 * piores: escrever no campo "fato", que o plantão inteiro lê, ou não registrar.
 *
 * O que este teste guarda:
 *
 *  * o registro NASCE do plantão e é lido por quem escreveu, pela equipe
 *    técnica e pela coordenação — nunca pelo colega de turno;
 *  * vazio não se registra. O lugar é único por ocorrência: um registro em
 *    branco tomaria a vaga de quem tem o que dizer;
 *  * a ocorrência FECHADA não recebe. A cópia documental já foi arquivada, e
 *    sistema e cópia não podem passar a dizer coisas diferentes em silêncio —
 *    é a mesma correção do episódio em ATA fechada;
 *  * a recusa do "já existe" NÃO conta o que já está lá. Quem não pode LER o
 *    conteúdo protegido não fica sabendo o que ele diz por causa de um erro;
 *  * e nada disso se reescreve nem se apaga: o trigger recusa UPDATE e DELETE.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const FALA = '"eu não quero ir lá no sábado, ele grita comigo".';
const SINAIS = 'Mancha arroxeada de cerca de 3 cm na face interna do braço esquerdo.';

describe('Registro protegido depois da abertura', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const abrir = async (categoria: string) => {
    const res = await request(http).post('/api/v1/incidents').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, categoria, quando: new Date().toISOString(),
              fato: 'Desentendimento no pátio no fim da tarde, encerrado com conversa e separação '
                + 'dos envolvidos pela equipe do plantão.',
              acolhidos: [ids.acolhido],
              medidasImediatas: 'Conversa individual com cada um e comunicação ao Líder Diurno.' });
    expect(res.status).toBe(201);
    return res.body.id as string;
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
      colega: 'educador2.ai3@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ person_id: ids.acolhido }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa'
        ORDER BY person_id LIMIT 1`, [ids.AI3]));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('vazio não se registra: o lugar é único e não se reescreve', async () => {
    // Categoria NÃO restrita de propósito: assim o colega alcança a ocorrência,
    // e o que ele não alcança é só o conteúdo protegido. Numa categoria
    // restrita ele não veria nem a ocorrência, e o teste provaria menos.
    ids.oc = await abrir('conflito_agressao');

    const vazio = await request(http).post(`/api/v1/incidents/${ids.oc}/protected`)
      .set(auth(tokens.educador)).send({ falaEspontanea: '   ', sinaisObservados: '' });
    expect(vazio.status).toBe(400);
    expect(vazio.body.message).toMatch(/único por ocorrência/i);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM incident_protected WHERE incident_id=$1`, [ids.oc]);
    expect(rows[0].n).toBe(0);
  });

  it('a criança fala depois, e quem ouviu registra — mesmo sem ter aberto a ocorrência',
     async () => {
    const res = await request(http).post(`/api/v1/incidents/${ids.oc}/protected`)
      .set(auth(tokens.colega)).send({ falaEspontanea: FALA, sinaisObservados: SINAIS });
    expect(res.status).toBe(201);
    expect(res.body.aviso).toMatch(/não aparece para colegas/i);

    // Quem escreveu lê o que escreveu.
    const autor = await request(http).get(`/api/v1/incidents/${ids.oc}`).set(auth(tokens.colega));
    expect(autor.body.protegido.falaEspontanea).toBe(FALA);
    expect(autor.body.protegido.sinaisObservados).toBe(SINAIS);
  });

  /**
   * O LÍDER MUDOU DE LADO NA FASE 144, e é decisão da Fundação — não conserto meu.
   *
   * O teste dizia *"o colega do plantão não lê — e o líder também não"*, e
   * guardava a regra certa até 22/09. A conferência daquele dia levou à Fundação
   * uma assimetria que o sistema tinha: o RELATO restrito inclui o Líder Diurno
   * desde a 0730, com a razão escrita — *"quem está com a criança às 23h precisa
   * saber o que já foi registrado sobre ela, para não repetir uma pergunta que já
   * feriu"* —, e o BLOCO PROTEGIDO da ocorrência não incluía. **Eu não desfiz a
   * assimetria sozinho**, porque ocorrência protegida é material mais pesado que
   * relato; perguntada, ela respondeu: incluir o Líder Diurno.
   *
   * O EDUCADOR continua fora, e é a metade que este teste passa a guardar
   * sozinho — junto com a que não mudou: a fala da criança não aparece em
   * lugar nenhum da resposta de quem não a alcança.
   */
  it('o colega do plantão não lê — o Líder Diurno passou a ler, desde 22/09', async () => {
    const dele = await request(http).get(`/api/v1/incidents/${ids.oc}`).set(auth(tokens.educador));
    expect(dele.status).toBe(200);                      // alcança a ocorrência
    expect(dele.body.protegido).toBeNull();             // e não o conteúdo
    expect(dele.body.avisoProtegido).toMatch(/equipe técnica/i);
    /* E a frase passou a NOMEAR o Líder Diurno: quem lê o aviso precisa saber a
       quem pedir. Uma frase que envelhece é uma frase que mente. */
    expect(dele.body.avisoProtegido).toMatch(/Líder Diurno/i);
    expect(JSON.stringify(dele.body)).not.toContain('grita comigo');

    const lider = await request(http).get(`/api/v1/incidents/${ids.oc}`).set(auth(tokens.lider));
    expect(lider.status).toBe(200);
    expect(lider.body.protegido.falaEspontanea).toBe(FALA);

    const tecnica = await request(http).get(`/api/v1/incidents/${ids.oc}`).set(auth(tokens.tecnica));
    expect(tecnica.body.protegido.falaEspontanea).toBe(FALA);
  });

  it('e a leitura do bloco protegido deixa linha — para todos, não só para ele', async () => {
    /*
     * Não deixava, para ninguém: a auditoria registrava quem ESCREVEU e não quem
     * abriu. Ampliar quem lê o material mais pesado do sistema sem rastro nenhum
     * seria a única coisa desta fase indefensável numa audiência — e a casa já
     * tinha o precedente (`person.judicial_view`, fase 112).
     *
     * NÃO é a porta com finalidade escrita, que a Fundação recusou para este
     * caso: nada é perguntado a quem abre o caso para trabalhar.
     */
    const { rows } = await admin.query(
      `SELECT actor_id, detail FROM audit_event
        WHERE action = 'incident.protected_view' AND entity_id = $1`, [ids.oc]);
    expect(rows.length).toBeGreaterThanOrEqual(2);      // o líder e a técnica

    /* E o log leva metadado, nunca a fala da criança (§5). */
    expect(JSON.stringify(rows)).not.toContain('grita comigo');
    expect(JSON.stringify(rows)).toMatch(/cargo/);
  });

  it('a recusa do segundo registro NÃO conta o que já está no primeiro', async () => {
    const denovo = await request(http).post(`/api/v1/incidents/${ids.oc}/protected`)
      .set(auth(tokens.educador))
      .send({ falaEspontanea: '"ela me contou de novo na hora de dormir".' });
    expect(denovo.status).toBe(400);
    expect(denovo.body.message).toMatch(/não recebe outro registro protegido/i);
    // Quem levou a recusa não pode ler o conteúdo protegido; a frase da recusa
    // não pode ser a porta dos fundos para lê-lo.
    expect(denovo.body.message).not.toMatch(/grita comigo|braço esquerdo/);
    // E indica o caminho que continua aberto para essa pessoa.
    expect(denovo.body.message).toMatch(/relato em seu nome/i);
  });

  it('não se reescreve nem se apaga, nem por dentro do banco', async () => {
    await expect(admin.query(
      `UPDATE incident_protected SET spontaneous_speech='outra coisa' WHERE incident_id=$1`,
      [ids.oc])).rejects.toThrow();
    await expect(admin.query(
      `DELETE FROM incident_protected WHERE incident_id=$1`, [ids.oc])).rejects.toThrow();

    const { rows: [r] } = await admin.query(
      `SELECT spontaneous_speech FROM incident_protected WHERE incident_id=$1`, [ids.oc]);
    expect(r.spontaneous_speech).toBe(FALA);
  });

  it('a ocorrência fechada não recebe: a cópia documental dela já foi arquivada', async () => {
    const outra = await abrir('conflito_agressao');
    await request(http).post(`/api/v1/incidents/${outra}/operational-close`)
      .set(auth(tokens.lider)).send({ nota: 'Conversado com os dois e comunicado à técnica.' })
      .expect(201);
    const fechada = await request(http).post(`/api/v1/incidents/${outra}/review`)
      .set(auth(tokens.tecnica)).send({ decisao: 'validar', nota: 'Sem desdobramento.' });
    expect(fechada.body.status).toBe('fechada');

    const tarde = await request(http).post(`/api/v1/incidents/${outra}/protected`)
      .set(auth(tokens.educador)).send({ falaEspontanea: FALA });
    expect(tarde.status).toBe(400);
    expect(tarde.body.message).toMatch(/reabertura/i);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM incident_protected WHERE incident_id=$1`, [outra]);
    expect(rows[0].n).toBe(0);
  });

  it('a auditoria registra QUE houve registro protegido, e não o que ele diz', async () => {
    const { rows } = await admin.query(
      `SELECT detail FROM audit_event WHERE action='incident.protected' AND entity_id=$1`,
      [ids.oc]);
    expect(rows).toHaveLength(1);
    // Regra 2: o log guarda id e metadado, nunca o conteúdo sensível.
    expect(JSON.stringify(rows[0].detail)).not.toMatch(/grita comigo|braço esquerdo/);
    expect(rows[0].detail).toMatchObject({ fala: true, sinais: true });
  });
});
