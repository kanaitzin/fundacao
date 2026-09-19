/**
 * O ESTOQUE QUE SE MEXE, A NOTA FISCAL E A RECEITA.
 *
 * Três coisas da fase 85, e a primeira nasceu de um erro meu que vale ficar
 * escrito: eu abri esta fase acreditando que confirmar a dose NÃO dava baixa no
 * estoque. Dá, desde a fase 6, dentro de `app_confirm_dose`. O gatilho que eu
 * escrevi criou uma SEGUNDA baixa, e o estoque caía duas vezes por dose.
 *
 * O que faltava era outra coisa: `medication_stock_movement` aceita `consumo`
 * desde a migração 0200 e NADA NUNCA ESCREVEU esse tipo. O armário caía e o
 * histórico só mostrava caixas chegando, nenhuma saindo.
 *
 * O que estes testes protegem:
 *
 *  1. **a dose confirmada registra `consumo`** — e o número do estoque cai
 *     UMA vez só, não duas;
 *  2. **recusada e não administrada não consomem nada.** É para isso que esses
 *     estados existem separados;
 *  3. **reconfirmar não lança dois consumos.** A guarda é a transição, não o
 *     estado final;
 *  4. **a nota fiscal exige os itens.** Uma nota sem itens não presta contas
 *     de nada;
 *  5. **o resumo conta quantas estão SEM o papel** — é o que trava a
 *     prestação de contas no fim do mês;
 *  6. **o educador não vê compra nem receita.** Nota fiscal é documento
 *     financeiro; receita traz CID e prescritor, e nada disso muda o que ele
 *     faz às 22h.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const dia = (offset = 0) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(Date.now() + offset * 86400_000));

describe('Estoque, nota fiscal e receita', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, pessoa: string;
  const compras: string[] = [];
  const prescricoes: string[] = [];
  const estoquesCriados: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

  /**
   * Uma dose pendente COM estoque, criada pela própria suíte.
   *
   * A primeira versão procurava uma dose já existente e saía calada quando não
   * achava — e o banco de teste começa VAZIO, porque as doses são geradas por
   * rodada. Os três testes de consumo passavam em 3 ms sem conferir nada. Um
   * teste que depende do acaso do seed não é teste: é sorte com nome de
   * verificação.
   */
  async function doseComEstoque(quantidade = 10) {
    const remedio = `Fictamol ${Math.random().toString(36).slice(2, 8)} 500mg`;

    const { rows: [pr] } = await admin.query(
      `INSERT INTO prescription (person_id, house_id, kind, medication, dose, route,
                                 status, starts_on)
       VALUES ($1,$2,'uso_continuo',$3,'1 comprimido','oral','ativa', current_date)
       RETURNING id`, [pessoa, AI3, remedio]);
    prescricoes.push(pr.id);

    const { rows: [adm] } = await admin.query(
      `INSERT INTO medication_administration
         (prescription_id, person_id, house_id, scheduled_at, state)
       VALUES ($1,$2,$3, now(), 'aguardando_confirmacao')
       RETURNING id`, [pr.id, pessoa, AI3]);

    const { rows: [st] } = await admin.query(
      `INSERT INTO medication_stock (house_id, person_id, medication, quantity, unit)
       VALUES ($1, NULL, $2, $3, 'comprimido') RETURNING id`, [AI3, remedio, quantidade]);
    estoquesCriados.push(st.id);

    return { id: adm.id as string, stockId: st.id as string, prescriptionId: pr.id as string };
  }

  const movimentos = async (stockId: string) => {
    const { rows } = await admin.query(
      `SELECT kind, quantity, reason FROM medication_stock_movement
        WHERE stock_id = $1 ORDER BY at`, [stockId]);
    return rows;
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
      enfermagem: 'enfermagem@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows: [p] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]);
    pessoa = p.person_id;
  });

  afterAll(async () => {
    /* Estado VIVO: compra e estoque deixados aqui entrariam na contagem de
       outra suíte, e o gasto do mês nasceria errado. */
    if (compras.length) {
      await admin.query(`DELETE FROM medication_purchase WHERE id = ANY($1::uuid[])`, [compras]);
    }
    if (prescricoes.length) {
      await admin.query(
        `DELETE FROM medication_administration WHERE prescription_id = ANY($1::uuid[])`,
        [prescricoes]);
      await admin.query(
        `DELETE FROM prescription_document WHERE prescription_id = ANY($1::uuid[])`,
        [prescricoes]);
      await admin.query(`DELETE FROM prescription WHERE id = ANY($1::uuid[])`, [prescricoes]);
    }
    if (estoquesCriados.length) {
      await admin.query(
        `DELETE FROM medication_stock_movement WHERE stock_id = ANY($1::uuid[])`,
        [estoquesCriados]);
      await admin.query(
        `DELETE FROM medication_stock WHERE id = ANY($1::uuid[])`, [estoquesCriados]);
    }
    await app.close(); await admin.end();
  });

  it('a dose confirmada registra consumo — e o estoque cai UMA vez', async () => {
    const d = await doseComEstoque(10);


    await request(http).post(`/api/v1/medications/doses/${d.id}/confirm`)
      .set(auth(tokens.enfermagem)).send({ estado: 'administrado_no_horario' })
      .expect(201);

    const { rows: [e] } = await admin.query(
      `SELECT quantity FROM medication_stock WHERE id = $1`, [d.stockId]);
    // Uma dose, uma unidade. Meu gatilho tinha criado uma segunda baixa.
    expect(Number(e.quantity)).toBe(9);

    const movs = await movimentos(d.stockId);
    const consumo = movs.filter((m) => m.kind === 'consumo');
    expect(consumo).toHaveLength(1);
    expect(Number(consumo[0].quantity)).toBe(1);
    // O motivo diz QUAL dose — o histórico existia sem dizer nada.
    expect(consumo[0].reason).toMatch(/dose confirmada/i);
  });

  it('recusar não consome nada — é para isso que o estado existe', async () => {
    const d = await doseComEstoque(10);

    await request(http).post(`/api/v1/medications/doses/${d.id}/confirm`)
      .set(auth(tokens.enfermagem))
      .send({ estado: 'recusado', nota: 'Recusou o comprimido; ofertado de novo às 21h.' })
      .expect(201);

    const { rows: [e] } = await admin.query(
      `SELECT quantity FROM medication_stock WHERE id = $1`, [d.stockId]);
    expect(Number(e.quantity)).toBe(10);
    expect((await movimentos(d.stockId)).filter((m) => m.kind === 'consumo')).toHaveLength(0);
  });

  it('reconfirmar não lança dois consumos', async () => {
    const d = await doseComEstoque(10);

    await request(http).post(`/api/v1/medications/doses/${d.id}/confirm`)
      .set(auth(tokens.enfermagem)).send({ estado: 'administrado_no_horario' }).expect(201);
    // A segunda é recusada pelo servidor — e mesmo assim o teste confere o
    // histórico, porque a guarda que importa é a da transição.
    await request(http).post(`/api/v1/medications/doses/${d.id}/confirm`)
      .set(auth(tokens.enfermagem)).send({ estado: 'administrado_com_atraso' });

    expect((await movimentos(d.stockId)).filter((m) => m.kind === 'consumo')).toHaveLength(1);
  });

  it('a compra exige os itens, e o gasto soma no período', async () => {
    const semItens = await request(http).post('/api/v1/medications/purchases')
      .set(auth(tokens.coord)).send({ houseId: AI3, em: dia(), itens: 'x' });
    expect(semItens.status).toBe(400);

    const r = await request(http).post('/api/v1/medications/purchases')
      .set(auth(tokens.coord)).send({
        houseId: AI3, em: dia(), totalCentavos: 8790,
        itens: 'Dipirona 500mg — 2 caixas; Amoxicilina suspensão — 1 frasco.',
        fornecedor: 'Farmácia Fictícia', nota: '00123',
        anexoRef: 'ref-fake-1', anexoNome: 'Nota fiscal',
      }).expect(201);
    compras.push(r.body.id);

    const lista = await request(http)
      .get(`/api/v1/medications/purchases?houseId=${AI3}&de=${dia(-5)}&ate=${dia(5)}`)
      .set(auth(tokens.enfermagem)).expect(200);
    expect(lista.body.gastoCentavos).toBeGreaterThanOrEqual(8790);
    expect(lista.body.linhas[0].temAnexo).toBe(true);
  });

  it('o resumo conta as compras SEM o papel — é o que trava a prestação de contas', async () => {
    const r = await request(http).post('/api/v1/medications/purchases')
      .set(auth(tokens.enfermagem)).send({
        houseId: AI3, em: dia(), itens: 'Soro fisiológico — 4 frascos.', totalCentavos: 2400,
      }).expect(201);
    compras.push(r.body.id);

    const lista = await request(http)
      .get(`/api/v1/medications/purchases?houseId=${AI3}&de=${dia(-5)}&ate=${dia(5)}`)
      .set(auth(tokens.coord)).expect(200);
    expect(lista.body.semAnexo).toBeGreaterThanOrEqual(1);
  });

  it('o educador não vê compra: nota fiscal é documento financeiro', async () => {
    const r = await request(http)
      .get(`/api/v1/medications/purchases?houseId=${AI3}&de=${dia(-5)}&ate=${dia(5)}`)
      .set(auth(tokens.educador));
    if (r.status === 200) expect(r.body.linhas).toEqual([]);
    else expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('a receita fica junto da prescrição, e o educador não a alcança', async () => {
    const d = await doseComEstoque();
    const p = { id: d.prescriptionId };

    await request(http).post(`/api/v1/medications/prescriptions/${p.id}/documents`)
      .set(auth(tokens.enfermagem)).send({
        nome: 'Receita da consulta de setembro.', anexoRef: 'ref-fake-2',
        em: dia(-10), prescritor: 'Dra. Fictícia',
      }).expect(201);

    const vista = await request(http)
      .get(`/api/v1/medications/prescriptions/${p.id}/documents`)
      .set(auth(tokens.enfermagem)).expect(200);
    expect(vista.body.length).toBeGreaterThan(0);
    expect(vista.body[0].nome).toMatch(/receita/i);

    /* O educador administra a dose e vê o esquema — mas a receita traz CID e o
       nome do prescritor, e isso não muda o que ele faz às 22h. */
    const negado = await request(http)
      .get(`/api/v1/medications/prescriptions/${p.id}/documents`)
      .set(auth(tokens.educador));
    if (negado.status === 200) expect(negado.body).toEqual([]);
    else expect(negado.status).toBeGreaterThanOrEqual(400);

    await admin.query(`DELETE FROM prescription_document WHERE prescription_id = $1`, [p.id]);
  });

  /* =======================================================================
   * O MOVIMENTO DO ARMÁRIO ABRE (fase 109).
   *
   * A tabela era escrita por três lugares e lida por NENHUM desde a migração
   * 0200. A fase 85 existiu para gravar o `consumo` que faltava — e o lugar de
   * abrir nunca tinha sido construído. Este teste é o que garante que a caixa
   * continua abrindo.
   * ==================================================================== */
  it('o movimento do armário ABRE — entrada, consumo e conferência, com autor', async () => {
    const d = await doseComEstoque();

    /* Uma dose confirmada, que é o `consumo` que a fase 85 passou a gravar. */
    await request(http).post(`/api/v1/medications/doses/${d.id}/confirm`)
      .set(auth(tokens.enfermagem)).send({ estado: 'administrado_no_horario' }).expect(201);

    /* E uma conferência do armário, que é o movimento com motivo e nome. */
    const { rows: [est0] } = await admin.query(
      `SELECT medication, unit FROM medication_stock WHERE id = $1`, [d.stockId]);
    await request(http).post('/api/v1/medications/stock').set(auth(tokens.enfermagem))
      .send({ houseId: AI3, medicamento: est0.medication, tipo: 'contagem',
              quantidade: 4, unidade: est0.unit,
              motivo: 'Conferência da gaveta no fim do turno.' }).expect(201);

    const mov = await request(http)
      .get(`/api/v1/medications/stock/${d.stockId}/movements`)
      .set(auth(tokens.enfermagem)).expect(200);

    const tipos = (mov.body.linhas as any[]).map((l) => l.tipo);
    expect(tipos).toContain('consumo');
    expect(tipos).toContain('ajuste');
    /* A conferência guarda o MOTIVO: é o que responde "achei quatro a menos". */
    const conferencia = (mov.body.linhas as any[]).find((l) => l.tipo === 'ajuste');
    expect(conferencia.motivo).toMatch(/gaveta/i);
    /* TODA LINHA TEM AUTOR — é a regra 6, e é o que permite perguntar depois
       quem conferiu a gaveta. O que o sistema NÃO faz é somar por pessoa. */
    for (const l of mov.body.linhas as any[]) expect(l.por).toBeTruthy();

    /* Fora de alcance responde 404 idêntico a inexistente (§4.5). */
    const forcaDeFora = await request(http)
      .get('/api/v1/medications/stock/00000000-0000-0000-0000-000000000000/movements')
      .set(auth(tokens.enfermagem));
    expect(forcaDeFora.status).toBe(404);
  });

  /* =======================================================================
   * O PAPEL, DE VERDADE (fase 108).
   *
   * Até aqui `storage_ref` era `NOT NULL` e guardava um TEXTO: a tela mandava
   * `receita-${Date.now()}`, uma referência fabricada que não apontava para
   * lugar nenhum. O §8.6 chamava as duas de "digitalizadas", e nenhuma das
   * duas tinha por onde ser digitalizada.
   *
   * O PNG abaixo é o menor PNG válido que existe — um pixel. Importa que ele
   * tenha ASSINATURA de imagem: o servidor confere os primeiros bytes, e não a
   * extensão do nome.
   * ==================================================================== */
  const PNG_DE_UM_PIXEL =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('a receita sobe como ARQUIVO, e abrir devolve os bytes', async () => {
    const d = await doseComEstoque();

    const criada = await request(http)
      .post(`/api/v1/medications/prescriptions/${d.prescriptionId}/documents`)
      .set(auth(tokens.enfermagem)).send({
        nome: 'Receita digitalizada de setembro.',
        conteudo: PNG_DE_UM_PIXEL, nomeArquivo: 'receita.png',
        em: dia(-3), prescritor: 'Dra. Fictícia',
      }).expect(201);

    const lista = await request(http)
      .get(`/api/v1/medications/prescriptions/${d.prescriptionId}/documents`)
      .set(auth(tokens.enfermagem)).expect(200);
    /* A TELA PRECISA SABER ANTES DO CLIQUE se o botão abre um documento ou
       devolve um caminho de pasta. */
    expect(lista.body[0].temArquivo).toBe(true);

    const aberta = await request(http)
      .get(`/api/v1/medications/prescriptions/documents/${criada.body.id}/file`)
      .set(auth(tokens.enfermagem)).expect(200);
    expect(aberta.body.arquivo).not.toBeNull();
    expect(aberta.body.arquivo.tipo).toBe('image/png');
    expect(aberta.body.arquivo.conteudo).toBe(PNG_DE_UM_PIXEL);

    /* E o educador continua sem alcançar: a receita traz CID. Fora de alcance
       responde 404 idêntico a inexistente (§4.5). */
    await request(http)
      .get(`/api/v1/medications/prescriptions/documents/${criada.body.id}/file`)
      .set(auth(tokens.educador)).expect(404);

    await admin.query(`DELETE FROM prescription_document WHERE prescription_id = $1`,
      [d.prescriptionId]);
  });

  it('a receita por REFERÊNCIA continua valendo — e sem nenhuma das duas, não entra', async () => {
    const d = await doseComEstoque();

    const porRef = await request(http)
      .post(`/api/v1/medications/prescriptions/${d.prescriptionId}/documents`)
      .set(auth(tokens.enfermagem))
      .send({ nome: 'Receita que está no Drive.', anexoRef: 'ACOLHIMENTO/AI3/receita.pdf' })
      .expect(201);

    const aberta = await request(http)
      .get(`/api/v1/medications/prescriptions/documents/${porRef.body.id}/file`)
      .set(auth(tokens.enfermagem)).expect(200);
    expect(aberta.body.arquivo).toBeNull();
    expect(aberta.body.referencia).toMatch(/receita\.pdf/);

    /* NENHUMA DAS DUAS é o que o `NOT NULL` antigo escondia: ele garantia um
       texto, nunca um documento. */
    await request(http)
      .post(`/api/v1/medications/prescriptions/${d.prescriptionId}/documents`)
      .set(auth(tokens.enfermagem)).send({ nome: 'Receita sem papel nenhum.' })
      .expect(400);

    await admin.query(`DELETE FROM prescription_document WHERE prescription_id = $1`,
      [d.prescriptionId]);
  });

  it('a nota fiscal sobe como arquivo, conta como "com papel" e abre', async () => {
    const criada = await request(http).post('/api/v1/medications/purchases')
      .set(auth(tokens.enfermagem)).send({
        houseId: AI3, em: dia(-1), itens: 'Paracetamol — 1 caixa (fictício).',
        totalCentavos: 1990, conteudo: PNG_DE_UM_PIXEL, anexoNome: 'nota.png',
      }).expect(201);

    const resumo = await request(http)
      .get(`/api/v1/medications/purchases?houseId=${AI3}&de=${dia(-3)}&ate=${dia(0)}`)
      .set(auth(tokens.enfermagem)).expect(200);
    const linha = (resumo.body.linhas as any[]).find((l) => l.id === criada.body.id);
    /* "com nota" passou a querer dizer que HÁ nota — antes queria dizer que
       alguém tinha digitado alguma coisa no campo. */
    expect(linha.temAnexo).toBe(true);

    const aberta = await request(http)
      .get(`/api/v1/medications/purchases/${criada.body.id}/file`)
      .set(auth(tokens.enfermagem)).expect(200);
    expect(aberta.body.arquivo.conteudo).toBe(PNG_DE_UM_PIXEL);

    /* O educador não lê nota fiscal: é documento financeiro, e não há nada
       nela que ajude o turno (§8.6). */
    await request(http)
      .get(`/api/v1/medications/purchases/${criada.body.id}/file`)
      .set(auth(tokens.educador)).expect(404);

    await admin.query(`DELETE FROM medication_purchase WHERE id = $1`, [criada.body.id]);
  });
});
