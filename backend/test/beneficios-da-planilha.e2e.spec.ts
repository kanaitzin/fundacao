/**
 * BENEFÍCIOS E DADOS BANCÁRIOS: o que a planilha real tem (§6.10, migração 055).
 *
 * A migração 055 acrescentou as colunas que a planilha "DADOS BANCÁRIOS - AI 03"
 * usa todo mês — número do benefício, operação da conta, nome da agência e a
 * PENDÊNCIA BANCÁRIA, que é o motivo de a planilha existir. O serviço nunca as
 * leu nem as gravou: o sistema tinha as colunas e continuava sem responder "o
 * que falta resolver no banco desta criança?". Enquanto isso, a planilha
 * seguia aberta numa pasta compartilhada.
 *
 * O que este teste guarda:
 *
 *  * os campos da planilha entram e voltam, e a PENDÊNCIA vem primeiro na lista,
 *    porque é o que alguém precisa resolver;
 *  * pendência marcada EXIGE uma linha dizendo qual é. "Pendente" sozinho é uma
 *    caixa marcada que a próxima coordenação não sabe resolver;
 *  * senha não entra em campo de texto. O sistema registra que a credencial
 *    EXISTE e quem responde por ela; o segredo fica cifrado no cofre;
 *  * o tipo do benefício vem de uma lista do servidor — texto livre digitado por
 *    vinte pessoas vira quatro coisas para o sistema e uma só para quem cuida;
 *  * o histórico responde "quem abriu a conta desta criança?" para quem responde
 *    por ela, sem pedir auditoria — e inclui a TENTATIVA RECUSADA;
 *  * e o alcance do histórico é o do dado: quem não pode ver a conta não fica
 *    sabendo quem a viu.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Benefícios como a planilha da casa pede', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const reauth = (t: string) =>
    request(http).post('/api/v1/auth/reauth').set(auth(t)).send({ password: SENHA });
  const ver = async (finalidade = 'Conferência mensal da conta do acolhido.') => {
    await reauth(tokens.coord);
    return request(http).post(`/api/v1/people/${ids.acolhido}/benefits/view`)
      .set(auth(tokens.coord)).send({ finalidade });
  };
  const gravar = async (corpo: Record<string, unknown>) => {
    await reauth(tokens.coord);
    return request(http).post(`/api/v1/people/${ids.acolhido}/benefits`)
      .set(auth(tokens.coord)).send(corpo);
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
      // Casa 04: a AI3 é disputada por meia dúzia de suítes, e esta conta linhas.
      coord: 'coord.ai4@paodospobres.dev',
      educador: 'educador.ai4@paodospobres.dev',
      deOutraCasa: 'coord.ai3@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = await login(email);

    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ person_id: ids.acolhido }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [ids.AI4]));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== O vocabulário ====================

  it('o tipo do benefício vem de uma lista do servidor, e texto livre é recusado', async () => {
    const voc = await request(http).get('/api/v1/people/benefits/kinds').set(auth(tokens.coord));
    expect(voc.status).toBe(200);
    expect(voc.body.tipos.map((t: any) => t.cod)).toContain('bpc');
    expect(voc.body.situacoes.map((s: any) => s.cod)).toContain('em_regularizacao');

    const inventado = await gravar({
      tipo: 'B.P.C.', finalidade: 'Cadastro do benefício informado pelo CRAS.' });
    expect(inventado.status).toBe(400);
    expect(inventado.body.message).toMatch(/Escolha o tipo do benefício/i);
  });

  // ==================== Os campos da planilha ====================

  it('número, operação, nome da agência e pendência entram — e voltam', async () => {
    const res = await gravar({
      tipo: 'bpc', numero: '000.000.000-0', banco: 'Banco fictício',
      agencia: '0000', agenciaNome: 'Agência Centro (fictícia)',
      conta: '00000-0', operacao: '013', situacao: 'ativo',
      observacoes: 'Saque mensal acompanhado pela coordenação.',
      temAcessoGov: true, responsavelPeloAcesso: 'Coordenação da casa',
      ondeEstaGuardado: 'Guardada no cofre de acessos deste sistema.',
      finalidade: 'Cadastro do benefício informado pelo CRAS.' });
    expect(res.status).toBe(201);
    ids.bpc = res.body.id;

    const lista = await ver();
    expect(lista.status).toBe(201);
    const b = lista.body.registros.find((x: any) => x.id === ids.bpc);
    expect(b.tipoRotulo).toMatch(/Prestação Continuada/);
    expect(b.numero).toBe('000.000.000-0');
    expect(b.operacao).toBe('013');
    expect(b.agenciaNome).toMatch(/Agência Centro/);
    expect(b.situacaoRotulo).toBe('Ativo');
    // A EXISTÊNCIA da credencial, e quem responde por ela — nunca o segredo.
    expect(b.temAcessoGov).toBe(true);
    expect(b.responsavelPeloAcesso).toMatch(/Coordenação/);
    expect(b.atualizadoPor).toBeTruthy();
  });

  it('a pendência vem PRIMEIRO na lista: é o que alguém precisa resolver', async () => {
    const pend = await gravar({
      tipo: 'poupanca_institucional', banco: 'Banco fictício', conta: '11111-1',
      operacao: '023', situacao: 'em_regularizacao',
      pendenciaBancaria: true,
      pendenciaNota: 'Conta bloqueada por falta de atualização cadastral; atendimento '
        + 'agendado na agência para o dia 12.',
      finalidade: 'Registro da pendência informada pelo banco.' });
    expect(pend.status).toBe(201);

    const lista = await ver();
    expect(lista.body.pendencias).toBe(1);
    expect(lista.body.registros[0].pendenciaBancaria).toBe(true);
    expect(lista.body.registros[0].pendenciaNota).toMatch(/atualização cadastral/);
  });

  it('"pendente" sozinho não passa: a linha do que falta é obrigatória', async () => {
    const semLinha = await gravar({
      tipo: 'pensao', pendenciaBancaria: true,
      finalidade: 'Tentativa de marcar pendência sem descrever.' });
    expect(semLinha.status).toBe(400);
    expect(semLinha.body.message).toMatch(/Escreva qual é a pendência/i);
    // E a frase diz POR QUE é obrigatória — a próxima coordenação lê isso.
    expect(semLinha.body.message).toMatch(/para a próxima/i);
  });

  it('senha não entra em campo de texto: ela tem lugar próprio e cifrado', async () => {
    const comSenha = await gravar({
      tipo: 'outro', observacoes: 'senha: Ficticia@2013',
      finalidade: 'Tentativa de colar a senha na observação.' });
    expect(comSenha.status).toBe(400);
    expect(comSenha.body.message).toMatch(/parece conter uma senha/i);
    expect(comSenha.body.message).toMatch(/cofre de acessos/i);

    // E o CHECK do banco continua de pé por baixo, mesmo sem passar pela API.
    await expect(admin.query(
      `INSERT INTO benefit_record (person_id, benefit_type, notes)
       VALUES ($1,'outro','senha: Ficticia@2013')`, [ids.acolhido])).rejects.toThrow();
  });

  it('o log guarda QUAIS campos mudaram, e nunca os valores', async () => {
    await gravar({
      id: ids.bpc, tipo: 'bpc', numero: '999.999.999-9', banco: 'Outro banco fictício',
      agencia: '0000', conta: '00000-0', operacao: '013', situacao: 'ativo',
      finalidade: 'Correção do número depois do atendimento no INSS.' });

    const { rows } = await admin.query(
      `SELECT purpose, detail::text AS detail FROM audit_event
        WHERE action='benefits.update' AND entity_id=$1 ORDER BY at DESC LIMIT 1`, [ids.bpc]);
    expect(rows[0].purpose).toMatch(/INSS/);
    expect(rows[0].detail).toMatch(/numero/);          // qual campo
    expect(rows[0].detail).not.toMatch(/999\.999/);    // nunca o valor
    expect(rows[0].detail).not.toMatch(/Outro banco/);
  });

  // ==================== Quem abriu ====================

  it('o histórico responde "quem abriu a conta desta criança?" — sem pedir auditoria',
     async () => {
    // Uma tentativa de quem não pode: ela precisa ficar escrita.
    const negado = await request(http).post(`/api/v1/people/${ids.acolhido}/benefits/view`)
      .set(auth(tokens.educador)).send({ finalidade: 'Curiosidade.' });
    expect(negado.status).toBe(403);

    await reauth(tokens.coord);
    const h = await request(http).post(`/api/v1/people/${ids.acolhido}/benefits/history`)
      .set(auth(tokens.coord)).send({});
    expect(h.status).toBe(201);

    const acoes = h.body.map((x: any) => x.acao);
    expect(acoes).toContain('consulta');
    expect(acoes).toContain('cadastro');
    expect(acoes).toContain('alteração');
    // A linha mais importante da lista: alguém tentou e o sistema não deixou.
    const recusada = h.body.find((x: any) => x.recusada);
    expect(recusada).toBeTruthy();
    expect(recusada.acao).toBe('tentativa recusada');
    expect(recusada.quem).toBeTruthy();

    const consulta = h.body.find((x: any) => x.acao === 'consulta');
    expect(consulta.finalidade).toBeTruthy();
  });

  it('exportar tem a mesma fricção de ver, e entra no mesmo histórico', async () => {
    await reauth(tokens.coord);
    const semFinalidade = await request(http)
      .post(`/api/v1/people/${ids.acolhido}/benefits/export`)
      .set(auth(tokens.coord)).send({ formato: 'pdf' });
    expect(semFinalidade.status).toBe(400);

    await reauth(tokens.coord);
    await request(http).post(`/api/v1/people/${ids.acolhido}/benefits/export`)
      .set(auth(tokens.coord))
      .send({ formato: 'pdf', finalidade: 'Levar ao INSS na perícia de 12/09.' })
      .expect(201);

    await reauth(tokens.coord);
    const h = await request(http).post(`/api/v1/people/${ids.acolhido}/benefits/history`)
      .set(auth(tokens.coord)).send({});
    expect(h.body.some((x: any) => x.acao === 'exportação' && /perícia/.test(x.finalidade)))
      .toBe(true);
  });

  it('histórico de acesso a dado bancário é dado bancário: mesmo alcance', async () => {
    // A coordenação de OUTRA casa não vê nem a conta nem quem a viu.
    await reauth(tokens.deOutraCasa);
    const fora = await request(http).post(`/api/v1/people/${ids.acolhido}/benefits/history`)
      .set(auth(tokens.deOutraCasa)).send({});
    expect(fora.status).toBe(403);

    // O educador nem chega ao histórico.
    const educador = await request(http).post(`/api/v1/people/${ids.acolhido}/benefits/history`)
      .set(auth(tokens.educador)).send({});
    expect(educador.status).toBe(403);
  });

  it('sem senha recente, a área fecha — mesmo para quem tem o cargo', async () => {
    // Sessão recém-aberta e sem reautenticação: é o aparelho esquecido
    // destravado em cima da mesa. Ter o cargo não basta.
    const sessaoNova = await login('coord.ai4@paodospobres.dev');
    const velha = await request(http).post(`/api/v1/people/${ids.acolhido}/benefits/view`)
      .set(auth(sessaoNova)).send({ finalidade: 'Conferência de rotina.' });
    expect(velha.status).toBe(403);
    expect(velha.body.message).toMatch(/Confirme sua senha/i);

    const hist = await request(http).post(`/api/v1/people/${ids.acolhido}/benefits/history`)
      .set(auth(sessaoNova)).send({});
    expect(hist.status).toBe(403);

    // E a alteração também: a fricção é a mesma nas três portas.
    const edicao = await request(http).post(`/api/v1/people/${ids.acolhido}/benefits`)
      .set(auth(sessaoNova))
      .send({ tipo: 'bpc', finalidade: 'Alteração sem senha recente.' });
    expect(edicao.status).toBe(403);
  });
});
