/**
 * O VOCABULÁRIO QUE A TELA LÊ (fase 147).
 *
 * COMO ESTAS ROTAS FORAM ACHADAS, e o método é o da fase 146 aplicado ao outro
 * lado. Lá a pergunta foi *"que TABELA nenhum teste escreveu?"*; aqui é *"que
 * ROTA nenhum teste chamou?"* — e ela tem resposta medível
 * (`scripts/rotas-sem-teste.mjs`). Das **342 rotas** do servidor, 28 nunca foram
 * chamadas por teste nenhum, e **oito delas são a mesma família**: as que
 * entregam à tela a lista de opções que ela oferece.
 *
 * POR QUE JUSTAMENTE ESSA FAMÍLIA IMPORTA. O §12.2 diz que *a tela nunca inventa
 * a própria lista*, e a fase 140 mostrou o que acontece quando a lista da tela
 * discorda de onde o valor é guardado: a folha da Evolução oferecia `vacina`, que
 * o `encounter_kind` não tem, e **quem registrasse uma vacina recebia 500**. Ao
 * mesmo tempo o banco aceitava `emergencia` e `terapia`, que a tela nunca ofereceu
 * — dois tipos de atendimento sem como registrar. Uma rota de vocabulário quebrada
 * é uma tela que não oferece nada; uma rota de vocabulário DESALINHADA é um erro
 * na cara de quem está de plantão.
 *
 * ENTÃO A COBRANÇA É NOS DOIS SENTIDOS, e é a da fase 140 generalizada: **o que a
 * rota oferece é exatamente o que o banco aceita.** Onde o valor mora numa regra
 * do banco (`CHECK`) ou numa tabela, o teste lê o CATÁLOGO e compara conjunto com
 * conjunto — não "contém", que passaria com a metade faltando.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O vocabulário que a tela lê', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const pegar = async (rota: string, quem = tokens.coord) => {
    const r = await request(http).get(rota).set(auth(quem));
    expect([rota, r.status]).toEqual([rota, 200]);
    return r.body;
  };

  /**
   * Os valores que uma regra `CHECK ... IN (...)` do banco aceita, lidos do
   * catálogo. É o catálogo e não o texto da migração porque um `ALTER` posterior
   * troca a regra e deixa a migração antiga mentindo (a lição da fase 131).
   */
  const aceitosPorRegra = async (tabela: string, regra: string) => {
    const { rows: [r] } = await admin.query(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
        WHERE conrelid = $1::regclass AND conname = $2`, [tabela, regra]);
    expect(r).toBeTruthy();
    return new Set([...String(r.d).matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]));
  };
  const ordenado = (s: Iterable<string>) => [...new Set(s)].sort();

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    tokens.coord = await login('coord.ai3@paodospobres.dev');
    tokens.tecnica = await login('tecnica.ai3@paodospobres.dev');
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // =============== As oito respondem, e nenhuma vem vazia ===============

  it('as oito rotas de vocabulário respondem — e nenhuma devolve lista vazia', async () => {
    /*
     * Parece pouco e é o que faltava: rota de vocabulário que estoura deixa a tela
     * sem NADA para oferecer, e a educadora não consegue registrar. Nenhuma das
     * oito tinha teste — este é o piso.
     */
    const familia: [string, string, (b: any) => unknown[]][] = [
      ['/api/v1/activities/agenda/options', tokens.coord, (b) => b.tipos],
      ['/api/v1/alignments/kinds', tokens.coord, (b) => b.tipos],
      ['/api/v1/staff/alcance', tokens.coord, (b) => b.cargos],
      ['/api/v1/staff/work/options', tokens.coord, (b) => b.setores],
      ['/api/v1/impacto/kinds', tokens.coord, (b) => b.tipos],
      ['/api/v1/reports/period/options', tokens.coord, (b) => b.secoes],
      ['/api/v1/people/contacts/kinds', tokens.tecnica, (b) => b.vinculos],
      ['/api/v1/statements/options', tokens.coord, (b) => (Array.isArray(b) ? b : b.opcoes)],
    ];
    for (const [rota, quem, lista] of familia) {
      const corpo = await pegar(rota, quem);
      const itens = lista(corpo);
      expect([rota, Array.isArray(itens)]).toEqual([rota, true]);
      expect([rota, itens.length > 0]).toEqual([rota, true]);
      /* E cada item tem rótulo: uma lista de códigos crus é um `select` em inglês
         de programador na tela de quem está com a criança. */
      for (const i of itens as any[]) {
        expect([rota, typeof (i.label ?? i.titulo ?? i.resumo)]).toEqual([rota, 'string']);
      }
    }
  });

  // =============== O que se oferece é o que o banco aceita ===============

  it('os tipos de compromisso são os que a regra do banco aceita — nos dois sentidos', async () => {
    const b = await pegar('/api/v1/activities/agenda/options');
    expect(ordenado((b.tipos as any[]).map((t) => t.cod)))
      .toEqual(ordenado(await aceitosPorRegra('commitment', 'commitment_kind_check')));
  });

  it('e as recorrências também', async () => {
    const b = await pegar('/api/v1/activities/agenda/options');
    expect(ordenado((b.recorrencias as any[]).map((t) => t.cod)))
      .toEqual(ordenado(await aceitosPorRegra('commitment', 'commitment_recurrence_check')));
  });

  it('os tipos de reunião são os que a regra do banco aceita', async () => {
    const b = await pegar('/api/v1/alignments/kinds');
    expect(ordenado((b.tipos as any[]).map((t) => t.code)))
      .toEqual(ordenado(await aceitosPorRegra('team_meeting', 'team_meeting_kind_check')));
  });

  it('os marcos de vida são os que a regra do banco aceita', async () => {
    const b = await pegar('/api/v1/impacto/kinds');
    expect(ordenado((b.tipos as any[]).map((t) => t.cod)))
      .toEqual(ordenado(await aceitosPorRegra('life_milestone', 'life_milestone_kind_check')));
  });

  it('os vínculos do contato são os que a regra do banco aceita', async () => {
    const b = await pegar('/api/v1/people/contacts/kinds', tokens.tecnica);
    expect(ordenado((b.vinculos as any[]).map((v) => v.code)))
      .toEqual(ordenado(await aceitosPorRegra('person_contact', 'person_contact_bond_check')));
  });

  it('as opções de testemunho SÃO a tabela — e na ordem dela', async () => {
    /*
     * Aqui a lista não é uma regra `CHECK`: `statement.witness` é chave
     * estrangeira para a tabela `witness_option`. É o desenho mais forte dos dois
     * — o valor novo entra por `INSERT` e aparece na tela sem ninguém lembrar de
     * nada —, e por isso a comparação é com a tabela, na ORDEM dela: a ordem
     * decide o que a educadora vê primeiro às 23h.
     */
    const corpo = await pegar('/api/v1/statements/options');
    const oferecidas = (Array.isArray(corpo) ? corpo : corpo.opcoes) as any[];
    const { rows } = await admin.query(
      `SELECT code, pendente FROM witness_option ORDER BY ordem`);
    expect(oferecidas.map((o) => o.code)).toEqual(rows.map((r) => r.code));
    /* E a marca de "ainda tenho o que dizer" vem junto: sem ela a tela não sabe
       que aquele relato fica pendente de complemento. */
    expect(oferecidas.map((o) => o.pendente)).toEqual(rows.map((r) => r.pendente));
  });

  // =============== O alcance por cargo ===============

  it('todo cargo descrito no alcance é um cargo que existe no banco', async () => {
    /*
     * O sentido que importa é ESTE: um cargo escrito com erro de digitação, ou que
     * deixou de existir, descreveria um alcance que não é de ninguém — e a tela de
     * Setores mostraria uma coluna fantasma.
     *
     * O SENTIDO CONTRÁRIO não se cobra, e é decisão: o `admin_tecnico` é o único
     * dos nove cargos sem descrição, e ele é conta técnica — não cuida de criança
     * nenhuma, e escrever para ele uma descrição institucional que a Fundação nunca
     * deu seria eu inventando o que o sistema promete. *Fica anotado no §9.*
     */
    const b = await pegar('/api/v1/staff/alcance');
    const { rows } = await admin.query(
      `SELECT unnest(enum_range(NULL::role_code))::text AS cargo`);
    const doBanco = new Set(rows.map((r) => r.cargo));
    const descritos = (b.cargos as any[]).map((c) => c.cargo);
    expect(descritos.length).toBeGreaterThan(5);
    for (const c of descritos) expect([c, doBanco.has(c)]).toEqual([c, true]);
  });

  it('e cada cargo descrito diz o que FAZ em cada área — não só que a alcança', async () => {
    /* Uma lista de áreas sem o "faz" é um mapa de permissões; o que a tela de
       Setores promete é a rotina de cada um em português. */
    const b = await pegar('/api/v1/staff/alcance');
    for (const c of b.cargos as any[]) {
      expect([c.cargo, typeof c.resumo]).toEqual([c.cargo, 'string']);
      expect([c.cargo, Array.isArray(c.areas)]).toEqual([c.cargo, true]);
      for (const a of c.areas) {
        expect([c.cargo, a.area, typeof a.faz]).toEqual([c.cargo, a.area, 'string']);
      }
    }
  });
});
