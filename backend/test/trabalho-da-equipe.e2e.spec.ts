/**
 * O TRABALHO DA EQUIPE — e as quatro condições que eu tinha escrito.
 *
 * A fase 112 recusou a busca por pessoa da equipe, e escreveu a recusa no
 * código: *"'tudo o que a Joana fez ontem' é vigilância — mede a pessoa"*. E
 * terminou dizendo que, **se a Fundação quisesse**, viraria outro caminho,
 * *"com finalidade escrita e registro da própria consulta"*.
 *
 * A Fundação quis, em 15/09/2026. Este arquivo existe para que as condições
 * que eu mesmo pus não se percam no primeiro ajuste de tela:
 *
 *  1. **outro caminho** — a auditoria da criança continua sem filtro por ator,
 *     e os três caminhos de busca por ator continuam devolvendo 404;
 *  2. **finalidade escrita**, cobrada pelo BANCO e não só pelo serviço;
 *  3. **registro da própria consulta** — quem abre deixa linha com o nome;
 *  4. **nada é contado.** Esta é a que mais facilmente se perde, porque um
 *     total parece inofensivo. O teste confere pela FORMA da resposta: se
 *     alguém acrescentar `total` ou `quantidade`, ele reprova.
 *
 * E uma quinta que ninguém pediu e que o desenho impõe: **o recorte por casa
 * continua sendo do banco.** Uma coordenadora não abre a equipe da casa
 * vizinha, ainda que peça pelo id.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const FINALIDADE = 'Apuração do episódio da noite de ontem, pedida pela coordenação.';

describe('O trabalho da equipe', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const ver = (token: string, corpo: any) =>
    request(http).post('/api/v1/staff/work').set(auth(token)).send(corpo);

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

    ({ rows: [{ id: ids.educadorId }] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'educador.ai3@paodospobres.dev'`));
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code = 'AI3'`));

    /* Uma ação de trabalho, para haver o que ler. A chamada é a mais barata e
       a mais parecida com o dia: ela nasce com casa, autor e horário. */
    const chamada = await request(http).post('/api/v1/checks').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, kind: 'alimentacao', titulo: 'Café do ensaio do trabalho' });
    expect(chamada.status).toBe(201);
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ==================== Quem lê ====================

  it('os três cargos que a Fundação nomeou leem — e o educador não', async () => {
    for (const cargo of ['tecnica', 'lider', 'coord']) {
      const r = await ver(tokens[cargo], { pessoaId: ids.educadorId, finalidade: FINALIDADE });
      expect([cargo, r.status]).toEqual([cargo, 201]);
    }
    const negado = await ver(tokens.educador, { pessoaId: ids.educadorId, finalidade: FINALIDADE });
    expect(negado.status).toBe(403);
  });

  /**
   * O GESTOR GERAL PASSOU A LER — e este teste mudou de propósito.
   *
   * A fase 117 o deixou de fora e guardou o 403 aqui, com o motivo escrito:
   * ele não tinha sido nomeado, e num painel de oito casas é onde a comparação
   * entre equipes fica mais fácil de fazer. Era decisão minha, sujeita à da
   * Fundação — que decidiu em 15/09: *"o gestor vê tudo o que ele quiser […]
   * afinal ele é o chefe de todas as casas."*
   *
   * O teste virou o contrário, e a inversão fica registrada para quem ler o
   * histórico: não foi um 403 que "parou de funcionar", foi uma decisão.
   */
  it('o Gestor Geral lê, nas oito casas (decisão da Fundação, 15/09)', async () => {
    const r = await ver(tokens.gestor, { pessoaId: ids.educadorId, finalidade: FINALIDADE });
    expect(r.status).toBe(201);
    expect(Array.isArray(r.body.linhas)).toBe(true);

    /* E a leitura DELE continua sem contar: as contagens são a outra visão,
       com rota própria. Esta aqui é a mesma para os quatro cargos. */
    expect(JSON.stringify(r.body)).not.toMatch(/"(total|quantidade|quantos)"/i);
  });

  // ==================== As condições ====================

  it('sem finalidade escrita não abre, e a recusa diz o que escrever', async () => {
    const vazia = await ver(tokens.coord, { pessoaId: ids.educadorId });
    expect(vazia.status).toBe(400);
    expect(vazia.body.message).toMatch(/finalidade/i);

    const curta = await ver(tokens.coord, { pessoaId: ids.educadorId, finalidade: 'apuração' });
    expect(curta.status).toBe(400);
  });

  it('a finalidade é cobrada pelo BANCO, não só pelo serviço', async () => {
    const app_ = new Client({
      connectionString: process.env.DATABASE_APP_URL
        ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher',
    });
    await app_.connect();
    try {
      const { rows: [u] } = await admin.query(
        `SELECT id FROM app_user WHERE email = 'coord.ai3@paodospobres.dev'`);
      await app_.query('BEGIN');
      await app_.query(`SELECT set_config('app.user_id', $1, true)`, [u.id]);
      await expect(app_.query(
        `SELECT * FROM app_trabalho_da_equipe($1,null,current_date - 7,current_date,$2)`,
        [ids.educadorId, '   '])).rejects.toThrow(/finalidade_obrigatoria/);
      await app_.query('ROLLBACK');
    } finally { await app_.end(); }
  });

  it('abrir o trabalho de alguém é, ele mesmo, uma ação auditada', async () => {
    const antes = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event WHERE action = 'staff.work_view'`);
    const r = await ver(tokens.coord, { pessoaId: ids.educadorId, finalidade: FINALIDADE });
    expect(r.status).toBe(201);

    const { rows } = await admin.query(
      `SELECT actor_id, purpose, detail FROM audit_event
        WHERE action = 'staff.work_view' ORDER BY at DESC LIMIT 1`);
    expect(rows[0].purpose).toBe(FINALIDADE);
    expect(rows[0].actor_id).toBeTruthy();
    const depois = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event WHERE action = 'staff.work_view'`);
    expect(depois.rows[0].n).toBeGreaterThan(antes.rows[0].n);
  });

  it('NÃO conta nada — e o teste é pela FORMA, para o total não voltar de carona', async () => {
    const r = await ver(tokens.coord, { pessoaId: ids.educadorId, finalidade: FINALIDADE });
    expect(r.status).toBe(201);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toMatch(/"(total|quantidade|quantos|contagem|media|média|percentual)"/i);
    expect(Object.keys(r.body).sort()).toEqual(['ate', 'aviso', 'cortado', 'de', 'linhas']);
    for (const l of r.body.linhas) {
      expect(Object.keys(l).sort()).toEqual([
        'acao', 'cargo', 'casa', 'codigo', 'entidade', 'entidadeId',
        'finalidadeDeclarada', 'id', 'quando', 'quem',
      ]);
    }
  });

  it('a ação chega em português, e não como código', async () => {
    const r = await ver(tokens.coord, { pessoaId: ids.educadorId, finalidade: FINALIDADE });
    const abertura = r.body.linhas.find((l: any) => l.codigo === 'check.open');
    expect(abertura).toBeTruthy();
    expect(abertura.acao).toBe('Chamada aberta');
    expect(abertura.quem).toBeTruthy();
  });

  it('pessoa E setor juntos é recusado — a busca é por um dos dois', async () => {
    const r = await ver(tokens.coord,
      { pessoaId: ids.educadorId, setor: 'educador', finalidade: FINALIDADE });
    expect(r.status).toBe(400);
  });

  it('a busca por SETOR devolve o trabalho do setor, com o nome em cada linha', async () => {
    const r = await ver(tokens.coord, { setor: 'educador', finalidade: FINALIDADE });
    expect(r.status).toBe(201);
    expect(r.body.linhas.length).toBeGreaterThan(0);
    for (const l of r.body.linhas) expect(l.quem).toBeTruthy();
    // E sem agrupar por pessoa: a lista é uma só, em ordem de acontecimento.
    expect(Array.isArray(r.body.linhas)).toBe(true);
  });

  it('o período tem limite: três meses, e a recusa diz por quê', async () => {
    const r = await ver(tokens.coord,
      { pessoaId: ids.educadorId, de: '2025-01-01', ate: '2026-09-15', finalidade: FINALIDADE });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/dossiê|92|dias/i);
  });

  it('o recorte por casa é do banco: a coordenação vizinha não alcança esta equipe', async () => {
    const t = await login('coord.ai4@paodospobres.dev');
    const r = await ver(t, { pessoaId: ids.educadorId, finalidade: FINALIDADE });
    expect(r.status).toBe(201);
    // Não é 403 — é vazio, que é a resposta honesta: o id existe, o alcance não.
    expect(r.body.linhas).toEqual([]);
  });

  // ==================== As contagens (fase 119) ====================

  /**
   * A PRIMEIRA CONTAGEM POR PESSOA DO SISTEMA, e o que ela não conta.
   *
   * Decisão da Fundação em 15/09: *"em uma visão apenas contagens e métricas."*
   * O que estes testes guardam não é que ela existe — é o que ficou de fora
   * dela, que é a parte que se perde primeiro quando alguém mexe na tela.
   */
  const metricas = (token: string, corpo: any) =>
    request(http).post('/api/v1/staff/work/metrics').set(auth(token)).send(corpo);

  it('as contagens são do Gestor Geral — e de mais ninguém', async () => {
    const r = await metricas(tokens.gestor, { finalidade: FINALIDADE });
    expect(r.status).toBe(201);
    for (const cargo of ['coord', 'tecnica', 'lider', 'educador']) {
      const negado = await metricas(tokens[cargo], { finalidade: FINALIDADE });
      expect([cargo, negado.status]).toEqual([cargo, 403]);
    }
  });

  it('conta por casa, por setor, por pessoa e por tipo de ação', async () => {
    const r = await metricas(tokens.gestor, { finalidade: FINALIDADE });
    expect(r.status).toBe(201);
    expect(Object.keys(r.body).sort()).toEqual([
      'ate', 'aviso', 'de', 'porAcao', 'porCasa', 'porPessoa', 'porSetor', 'sobreCriancas',
    ]);
    expect(r.body.porPessoa.length).toBeGreaterThan(0);
    expect(r.body.porPessoa[0].quantos).toBeGreaterThan(0);
    // A ação chega em português, e não como código (fase 115).
    const abertura = r.body.porAcao.find((a: any) => a.codigo === 'check.open');
    if (abertura) expect(abertura.acao).toBe('Chamada aberta');
  });

  /**
   * A ORDEM É POR NOME, NUNCA POR TOTAL — e este teste achou um defeito.
   *
   * Ele reprovava de forma INTERMITENTE: sozinho passava, e na suíte inteira
   * — onde entram as contas de todas as casas — caía. O banco punha **"Cátia"
   * depois de "Cida"**, porque a colação dele não é a do português. Numa lista
   * de Cátia, Lúcia, Mário e Nélio, "ordem alfabética" que separa os
   * acentuados é ordem que ninguém reconhece — e numa tela cuja promessa é
   * *"por nome, nunca por total"*, ordem irreconhecível é pior que nenhuma:
   * quem lê procura o critério, e o único visível na linha é o número.
   *
   * E escondia um segundo: os SETORES eram ordenados pelo CÓDIGO
   * (`lider_diurno`) e mostrados pelo RÓTULO ("Líder Diurno"). A ordenação
   * passou para o serviço, sobre o texto que a pessoa lê.
   *
   * A cobrança principal é a que não pode se perder: **não está ordenado por
   * total.** A ordem alfabética é conferida depois, e em português.
   */
  it('a ordem é por NOME, nunca por total — e em português', async () => {
    const r = await metricas(tokens.gestor, { finalidade: FINALIDADE });

    const totais = r.body.porPessoa.map((p: any) => p.quantos);
    const decrescente = [...totais].sort((a: number, b: number) => b - a);
    /* Só vale como prova quando há números diferentes: com todos iguais,
       qualquer ordem é "decrescente" e o teste não estaria olhando nada. */
    if (new Set(totais).size > 1) expect(totais).not.toEqual(decrescente);

    const ptBR = (xs: string[]) =>
      [...xs].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    for (const [campo, lista] of [
      ['quem', r.body.porPessoa.map((p: any) => p.quem)],
      ['setor', r.body.porSetor.map((p: any) => p.setor)],
      ['casa', r.body.porCasa.map((c: any) => c.casa)],
      ['acao', r.body.porAcao.map((a: any) => a.acao)],
    ] as [string, string[]][]) {
      expect([campo, lista]).toEqual([campo, ptBR(lista)]);
    }
  });

  it('NENHUMA contagem é por criança — a regra 3 não foi o que a Fundação revisou', async () => {
    const r = await metricas(tokens.gestor, { finalidade: FINALIDADE });
    /* Só os DADOS: as duas frases da resposta falam de criança de propósito —
       é nelas que o sistema diz o que não conta. O conferidor olha os quatro
       recortes, que é onde um número por criança apareceria. */
    const recortes = [r.body.porCasa, r.body.porSetor, r.body.porPessoa, r.body.porAcao];
    /*
     * A CONFERÊNCIA É DA DIMENSÃO, E NÃO DA PALAVRA — corrigido na fase 149.
     *
     * Ela lia o JSON inteiro à procura de "acolhido" ou "criança", e passou a
     * acusar o que não é defeito: o NOME de uma ação pode falar de criança —
     * *"Cadastro do acolhido alterado"*, *"Relatos de uma criança lidos no perfil
     * dela"* —, porque a ação É sobre uma criança, e o vocabulário da auditoria
     * existe justamente para dizer isso em português. **O que a regra 3 proíbe é
     * CONTAR por criança**, e isso aparece na DIMENSÃO do recorte: nos campos, não
     * nos rótulos. *Ela só passava porque as linhas que nomeiam criança não
     * chegavam aqui — e a 149 fez com que chegassem, que é o conserto dela.*
     *
     * Fixar os campos por extenso é mais forte do que procurar palavra: recorte
     * novo por criança reprova mesmo que ninguém o chame de criança.
     */
    const campos = [...new Set(recortes.flat().flatMap((x: any) => Object.keys(x)))].sort();
    expect(campos).toEqual(['acao', 'cargo', 'casa', 'codigo', 'quantos', 'quem', 'setor']);
    /* E nenhum identificador de criança viaja nos dados, com nome ou sem ele. */
    expect(JSON.stringify(recortes)).not.toMatch(/personId|person_id|[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(r.body.sobreCriancas).toMatch(/Nenhuma contagem aqui é por criança/);
    /* E o aviso sobre o que o número é vai JUNTO da resposta, não numa nota de
       rodapé da tela: ele é a razão de eu ter recusado esta visão antes. */
    expect(r.body.aviso).toMatch(/contam REGISTROS, não trabalho/i);
  });

  it('contar também é olhar: a consulta de contagens fica auditada', async () => {
    await metricas(tokens.gestor, { finalidade: FINALIDADE });
    const { rows } = await admin.query(
      `SELECT actor_id, purpose FROM audit_event
        WHERE action = 'staff.work_metrics' ORDER BY at DESC LIMIT 1`);
    expect(rows[0].purpose).toBe(FINALIDADE);
    expect(rows[0].actor_id).toBeTruthy();
  });

  it('sem finalidade escrita, não conta', async () => {
    const r = await metricas(tokens.gestor, {});
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/finalidade/i);
  });

  it('e a auditoria da CRIANÇA continua sem busca por ator (a recusa da 112 fica de pé)', async () => {
    for (const caminho of [
      `/api/v1/audit/actor/${ids.educadorId}`,
      `/api/v1/audit/user/${ids.educadorId}`,
      `/api/v1/audit?actorId=${ids.educadorId}`,
    ]) {
      const r = await request(http).get(caminho).set(auth(tokens.coord));
      expect([caminho, r.status]).toEqual([caminho, 404]);
    }
  });
});
