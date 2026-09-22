/**
 * QUANDO O VISITANTE PODE VIR, E POR QUE ALGUÉM SAIU DA FOLHA (migração 1500).
 *
 * O QUE ESTA SUÍTE GUARDA, e as duas metades vêm do pedido da Fundação de 22/09.
 *
 * **(1) A folha da guarita não dizia QUANDO.** A 1120 deu ao portão quem pode
 * entrar — foto, nome, vínculo, CPF, telefone — e nada sobre dia ou hora.
 * Medido: `person_contact` não tinha coluna de horário nenhuma. O efeito é no
 * portão: quem está lá às 21h de uma terça só tem duas saídas, e as duas erram —
 * deixar entrar porque o nome está na lista, ou barrar um familiar autorizado.
 * Nenhuma das duas decisões é do porteiro.
 *
 * **(2) Retirar alguém da folha não deixava rastro do motivo.** A auditoria
 * registrava QUEM retirou e QUANDO, e nada mais — porque log não copia conteúdo
 * sensível (§5), e o motivo de uma retirada conta algo sobre uma família. Seis
 * meses depois a família chega ao portão, ouve *"não está na folha"*, e não há
 * ninguém na casa que saiba responder por quê.
 *
 * E ela cobra as duas propriedades que a correção promete e que são fáceis de
 * perder: o histórico é **append-only** — retirar, reautorizar e retirar de novo
 * deixa TRÊS linhas, e a primeira é justamente a que explica a história — e o
 * horário **sobrevive à retirada**, senão reautorizar amanhã pediria tudo de
 * novo à técnica.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Quando o visitante pode vir', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const definir = (corpo: any, quem = tokens.tecnica) =>
    request(http).post(`/api/v1/people/contacts/${ids.contato}/visit`).set(auth(quem)).send(corpo);
  const historico = async (quem = tokens.tecnica) =>
    (await request(http).get(`/api/v1/people/contacts/${ids.contato}/visit-history`)
      .set(auth(quem))).body as any[];
  const folha = async () =>
    (await request(http).get(`/api/v1/people/portaria/folha?houseId=${ids.AI3}`)
      .set(auth(tokens.tecnica))).body;
  /** A linha da folha que fala deste visitante. */
  const linhaDele = async () => {
    const f = await folha();
    return (f.secoes[0].tabela.linhas as string[][])
      .find((l) => l.some((cel) => String(cel).includes('Visitante Fictício de Quando')));
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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    /* Uma criança do MEIO da lista: as do fim são das duas suítes de ausência, e
       as do começo são as que as outras usam. */
    const { rows: [crianca] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name OFFSET 5 LIMIT 1`, [ids.AI3]);
    ids.crianca = crianca.id;

    const r = await request(http).post(`/api/v1/people/${ids.crianca}/contacts`)
      .set(auth(tokens.tecnica))
      .send({ nome: 'Visitante Fictício de Quando', vinculo: 'madrinha', telefone: '51 90000-0002' });
    expect(r.status).toBe(201);
    ids.contato = r.body.id;
  });

  afterAll(async () => {
    /* Contato não se apaga — `contato_nao_e_apagado`, e a regra está certa: um
       contato encerrado guarda o motivo, e apagar levaria o motivo junto. O
       histórico da folha é append-only e some com o schema do próximo `npm test`;
       o que não pode ficar é o contato ATIVO e AUTORIZADO, que entraria na folha
       da portaria das outras suítes. */
    await admin.query(
      `UPDATE person_contact SET visit_authorized = false, active = false,
              ended_reason = 'Contato fictício criado pela suíte da folha da portaria.'
        WHERE id = $1`, [ids.contato]);
    await app.close();
    await admin.end();
  });

  // ================== O dia e a hora ==================

  it('autorizar SEM dia e hora é recusado, com a frase do portão', async () => {
    const r = await definir({ autorizado: true });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/dias este visitante pode vir/i);
    /* E a frase diz o CUSTO, não só a regra: é ela que faz a técnica entender
       por que o campo existe em vez de procurar como pular. */
    expect(r.body.message).toMatch(/portão/i);
  });

  it('a faixa é inteira, e começa antes de terminar', async () => {
    const meia = await definir({ autorizado: true, dias: [6], de: '09:00' });
    expect(meia.status).toBe(400);
    expect(meia.body.message).toMatch(/inteira/i);

    const invertida = await definir({ autorizado: true, dias: [6], de: '18:00', ate: '09:00' });
    expect(invertida.status).toBe(400);
    expect(invertida.body.message).toMatch(/termina depois de começar/i);

    const foraDaSemana = await definir({ autorizado: true, dias: [9], de: '09:00', ate: '11:00' });
    expect(foraDaSemana.status).toBe(400);
    expect(foraDaSemana.body.message).toMatch(/fora da semana/i);
  });

  it('autorizado com dia e hora, a folha da guarita diz QUANDO — escrito em português', async () => {
    const r = await definir({ autorizado: true, dias: [0, 6], de: '09:00', ate: '11:30',
                              observacao: 'Entra pelo portão dos fundos' });
    expect(r.status).toBe(201);

    const linha = await linhaDele();
    expect(linha).toBeTruthy();
    const quando = linha!.join(' | ');
    /* Escrito, e não em números de dia da semana: quem lê está num portão. */
    expect(quando).toMatch(/dom e sáb/);
    expect(quando).toMatch(/das 09:00 às 11:30/);
    /* O segundo do `time` não vai impresso — a folha tem oito colunas. */
    expect(quando).not.toMatch(/09:00:00/);
    expect(quando).toMatch(/portão dos fundos/);
  });

  it('a folha traz a coluna do quando, e a ressalva fala do horário', async () => {
    const f = await folha();
    expect(f.secoes[0].tabela.cabecalho).toContain('Quando pode vir');
    expect(f.ressalva).toMatch(/FORA do dia ou da hora/);
    /* A ressalva diz de quem é a decisão de mudar — a guarita não muda horário. */
    expect(f.ressalva).toMatch(/equipe técnica, não da guarita/);
  });

  // ================== A retirada, e o motivo ==================

  it('retirar SEM motivo é recusado — e a recusa diz para quem a frase serve', async () => {
    const r = await definir({ autorizado: false });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/por que este contato sai da folha/i);

    const curto = await definir({ autorizado: false, motivo: 'mudou' });
    expect(curto.status).toBe(400);
  });

  it('retirado com motivo, ele sai da folha e o motivo fica escrito', async () => {
    const r = await definir({ autorizado: false,
      motivo: 'A Vara suspendeu as visitas até a próxima audiência.' });
    expect(r.status).toBe(201);
    expect(r.body.aviso).toMatch(/motivo registrado/i);

    /* Saiu da folha: a guarita não vê nem o nome nem o motivo. A folha não diz
       por que alguém não está nela, de propósito (1120). */
    expect(await linhaDele()).toBeUndefined();

    const h = await historico();
    expect(h[0].autorizado).toBe(false);
    expect(h[0].motivo).toMatch(/Vara suspendeu/);
    expect(h[0].por).toBeTruthy();
  });

  it('o horário SOBREVIVE à retirada — reautorizar não pede tudo de novo', async () => {
    const r = await definir({ autorizado: true });
    expect(r.status).toBe(201);
    const linha = await linhaDele();
    expect(linha!.join(' | ')).toMatch(/das 09:00 às 11:30/);
  });

  it('o histórico é append-only: a retirada de hoje não apaga a de antes', async () => {
    await definir({ autorizado: false, motivo: 'Segunda retirada fictícia, para medir o histórico.' });
    const h = await historico();
    /* Quatro atos: autorizou, retirou, reautorizou, retirou. A PRIMEIRA retirada
       continua lá — é ela que explica a história a quem ler em março. */
    expect(h).toHaveLength(4);
    expect(h.map((x) => x.autorizado)).toEqual([false, true, false, true]);
    expect(h.filter((x) => x.motivo?.includes('Vara suspendeu'))).toHaveLength(1);
  });

  it('o educador não lê o motivo da retirada — é juízo sobre um familiar', async () => {
    /* Ele LÊ a lista de contatos (decisão de 03/09: precisa saber quem aparece no
       portão). O que não alcança é a frase sobre por que alguém saiu. */
    const lista = await request(http).get(`/api/v1/people/${ids.crianca}/contacts`)
      .set(auth(tokens.educador));
    expect(lista.status).toBe(200);
    expect(JSON.stringify(lista.body)).toMatch(/Visitante Fictício de Quando/);

    expect(await historico(tokens.educador)).toEqual([]);
  });

  it('e o educador não autoriza nem retira — quem responde por quem entra é outro', async () => {
    const r = await definir({ autorizado: true, dias: [1], de: '14:00', ate: '16:00' },
                            tokens.educador);
    expect(r.status).toBe(403);
  });
});
