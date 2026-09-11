/**
 * A COZINHA — o Word com timbre, e a contabilização.
 *
 * A cozinha não entra no sistema: o que sai daqui é PAPEL. Por isso estes
 * testes não se contentam em ver a folha montada — eles pedem o `.docx`, abrem
 * o arquivo e conferem que o timbre do Pão dos Pobres está dentro dele.
 *
 * Uma folha que "gera" um Word sem imagem passaria em qualquer teste de rota e
 * chegaria à cozinha como papel branco.
 *
 * O que estes testes protegem:
 *
 *  1. **os três documentos saem em `.docx` de verdade**, e o arquivo contém o
 *     timbre — conferido abrindo o zip, não confiando no nome;
 *  2. **a contabilização separa PORÇÕES de PEDIDOS.** Vinte lanches para a
 *     saída do grupo é um pedido e vinte porções, e confundir os dois faz a
 *     casa parecer que pede pouco;
 *  3. **a cesta básica conta junto**, e por criança;
 *  4. **não há trava de data.** A casa tem dezenove crianças e chega a
 *     vigésima: o lanche sai de qualquer jeito, e recusar o registro só faz a
 *     contagem do mês nascer errada;
 *  5. **cancelar não apaga** — o pedido continua na folha, na seção própria,
 *     com o motivo, e sai da contagem de porções;
 *  6. **a folha da cozinha não carrega o motivo da restrição.** Papel circula.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { dentroDoDocx } from './setup/dentro-do-docx';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const dia = (offset = 0) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(Date.now() + offset * 86400_000));


describe('Cozinha — Word com timbre e contabilização', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, pessoa: string;
  const criados: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

  async function pedir(token: string, corpo: Record<string, unknown>) {
    const r = await request(http).post('/api/v1/people/kitchen-requests')
      .set(auth(token)).send({ houseId: AI3, ...corpo });
    if (r.body?.id) criados.push(r.body.id);
    return r;
  }

  const resumo = (token: string) =>
    request(http).get(
      `/api/v1/people/kitchen-requests/summary?houseId=${AI3}&de=${dia(-30)}&ate=${dia(30)}`)
      .set(auth(token));

  const exportar = (token: string, qual: string, corpo: Record<string, unknown>) =>
    request(http).post(`/api/v1/people/kitchen-requests/export/${qual}`)
      .set(auth(token)).send({ houseId: AI3, finalidade: 'Entrega à cozinha (teste).', ...corpo });

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
      coord: 'coord.ai3@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows: [p] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]);
    pessoa = p.person_id;
  });

  afterAll(async () => {
    /* Estado VIVO: pedido deixado aqui entraria na contagem de outra suíte. */
    await admin.query(`DELETE FROM kitchen_request WHERE house_id = $1`, [AI3]);
    await app.close(); await admin.end();
  });

  beforeEach(async () => {
    await admin.query(`DELETE FROM kitchen_request WHERE house_id = $1`, [AI3]);
  });

  it('o lanche sai em .docx, e o timbre do Pão dos Pobres está DENTRO do arquivo', async () => {
    await pedir(tokens.educador, {
      tipo: 'lanche', personId: null, em: dia(2), quantidade: 20,
      finalidade: 'Saída ao parque no sábado à tarde.',
    }).then((r) => expect(r.status).toBe(201));

    const r = await exportar(tokens.educador, 'lanches', { de: dia(-30), ate: dia(30) })
      .expect(201);

    expect(r.body.nomeArquivo).toMatch(/\.docx$/i);
    const { buf, nomes } = dentroDoDocx(r.body.conteudoBase64);

    // É um zip de verdade, e é um Word de verdade.
    expect(buf.slice(0, 2).toString('latin1')).toBe('PK');
    expect(nomes).toEqual(expect.arrayContaining(['word/document.xml']));

    // E o TIMBRE está lá dentro — não basta a folha dizer que tem.
    expect(nomes.some((n) => /^word\/media\/.+\.(png|jpe?g)$/i.test(n))).toBe(true);

    // O conteúdo chegou ao documento — lido do XML DESCOMPRIMIDO.
    const xml = dentroDoDocx(r.body.conteudoBase64).conteudo['word/document.xml'];
    expect(xml).toBeDefined();
    /* Caixa ALTA: o gerador põe o título em maiúsculas, e regex sensível a
       caixa falha por motivo que não é o do teste. É a lição nº 1 dos ensaios
       de navegador valendo também aqui. */
    expect(xml).toMatch(/solicita/i);
    expect(xml).toMatch(/parque no s/i);   // a finalidade que a casa escreveu
    expect(xml).toMatch(/20/);             // as vinte porções
  });

  it('a cesta básica sai no mesmo caminho, com timbre', async () => {
    await pedir(tokens.coord, {
      tipo: 'cesta_basica', personId: pessoa, em: dia(4), quantidade: 1,
      finalidade: 'Fim de semana com a família.',
    }).then((r) => expect(r.status).toBe(201));

    const r = await exportar(tokens.coord, 'cestas', { de: dia(-30), ate: dia(30) }).expect(201);
    const { nomes } = dentroDoDocx(r.body.conteudoBase64);
    expect(nomes).toEqual(expect.arrayContaining(['word/document.xml']));
    expect(nomes.some((n) => /^word\/media\//i.test(n))).toBe(true);
  });

  it('a folha de restrições sai com timbre — e sem o motivo médico', async () => {
    const r = await exportar(tokens.coord, 'restricoes', {}).expect(201);
    const { buf, nomes } = dentroDoDocx(r.body.conteudoBase64);
    expect(nomes.some((n) => /^word\/media\//i.test(n))).toBe(true);

    /* Papel circula entre setores. A folha traz o que evitar e o que servir no
       lugar — nunca por quê. Lido do XML descomprimido: procurar isto nos bytes
       crus passaria sempre, e não provaria nada. */
    const { conteudo } = dentroDoDocx(r.body.conteudoBase64);
    const xml = conteudo['word/document.xml'];
    expect(xml).toBeDefined();
    expect(xml).toMatch(/restri/i);
    expect(xml).not.toMatch(/diagn|CPF|processo judicial|alergia grave/i);
  });

  it('a contabilização separa porções de pedidos', async () => {
    await pedir(tokens.educador, {
      tipo: 'lanche', personId: null, em: dia(1), quantidade: 20,
      finalidade: 'Saída ao parque com a casa toda.',
    });
    await pedir(tokens.educador, {
      tipo: 'lanche', personId: pessoa, em: dia(1), quantidade: 1,
      finalidade: 'Consulta no posto pela manhã.',
    });

    const r = await resumo(tokens.educador).expect(200);
    // Dois pedidos, vinte e uma porções. Confundir os dois faria a casa
    // parecer que pede pouco.
    expect(r.body.lanchesPedidos).toBe(2);
    expect(r.body.lanchesPorcoes).toBe(21);
  });

  it('a cesta básica conta junto, e por criança', async () => {
    await pedir(tokens.coord, {
      tipo: 'cesta_basica', personId: pessoa, em: dia(3), quantidade: 2,
      finalidade: 'Fim de semana com a família.',
    });

    const r = await resumo(tokens.coord).expect(200);
    expect(r.body.cestas).toBe(2);
    expect(r.body.cestasCriancas).toBe(1);
    expect(r.body.quemPediu).toBeGreaterThanOrEqual(1);
  });

  it('não há trava de data: o lanche esquecido de ontem entra', async () => {
    /*
     * A casa tem dezenove crianças e no dia chega a vigésima. O lanche sai de
     * qualquer jeito — recusar o registro só faria a contagem do mês nascer
     * errada.
     */
    const r = await pedir(tokens.educador, {
      tipo: 'lanche', personId: pessoa, em: dia(-1), quantidade: 1,
      finalidade: 'Acolhimento novo que chegou no dia.',
    });
    expect(r.status).toBe(201);

    const s = await resumo(tokens.educador).expect(200);
    expect(s.body.lanchesPorcoes).toBe(1);
  });

  it('cancelar não apaga: sai da contagem, fica na folha com o motivo', async () => {
    const p = await pedir(tokens.educador, {
      tipo: 'lanche', personId: pessoa, em: dia(1), quantidade: 5,
      finalidade: 'Consulta no posto pela manhã.',
    });
    await request(http).post(`/api/v1/people/kitchen-requests/${p.body.id}/cancel`)
      .set(auth(tokens.educador))
      .send({ motivo: 'A consulta foi remarcada para a semana que vem.' })
      .expect(201);

    const s = await resumo(tokens.educador).expect(200);
    expect(s.body.lanchesPorcoes).toBe(0);
    expect(s.body.cancelados).toBe(1);

    // E continua na folha — a cozinha pode já ter comprado.
    const f = await request(http).get(
      `/api/v1/people/kitchen-requests/folha/lanches?houseId=${AI3}&de=${dia(-30)}&ate=${dia(30)}`)
      .set(auth(tokens.educador)).expect(200);
    expect(JSON.stringify(f.body)).toMatch(/remarcada para a semana/i);
  });

  it('cancelar exige motivo — a cozinha vai ler isto', async () => {
    const p = await pedir(tokens.educador, {
      tipo: 'lanche', personId: pessoa, em: dia(1), quantidade: 1,
      finalidade: 'Consulta no posto pela manhã.',
    });
    await request(http).post(`/api/v1/people/kitchen-requests/${p.body.id}/cancel`)
      .set(auth(tokens.educador)).send({ motivo: 'x' })
      .expect((r) => { expect(r.status).toBeGreaterThanOrEqual(400); });
  });

  it('o apoio alimentar entra no quadro do mês — em porções, e sem o cancelado', async () => {
    const mes = dia().slice(0, 7);
    const noMes = `${mes}-15`;

    await pedir(tokens.educador, {
      tipo: 'lanche', personId: null, em: noMes, quantidade: 20,
      finalidade: 'Saída ao parque com a casa toda.',
    });
    await pedir(tokens.coord, {
      tipo: 'cesta_basica', personId: pessoa, em: noMes, quantidade: 1,
      finalidade: 'Fim de semana com a família.',
    });
    const cancelado = await pedir(tokens.educador, {
      tipo: 'lanche', personId: pessoa, em: noMes, quantidade: 7,
      finalidade: 'Consulta no posto pela manhã.',
    });
    await request(http).post(`/api/v1/people/kitchen-requests/${cancelado.body.id}/cancel`)
      .set(auth(tokens.educador)).send({ motivo: 'A consulta foi remarcada.' }).expect(201);

    const r = await request(http)
      .get(`/api/v1/reports/house-monthly?houseId=${AI3}&mes=${mes}`)
      .set(auth(tokens.coord)).expect(200);

    /* Porções, não pedidos — e o cancelado fora: comida cancelada não é comida
       que saiu, e este é o número que a Fundação usa para pedir doação. */
    expect(r.body.porcoesDeLanche).toBe(20);
    expect(r.body.cestasBasicas).toBe(1);
  });

  it('a finalidade é obrigatória: "1 lanche" sozinho obriga a cozinha a adivinhar', async () => {
    const r = await pedir(tokens.educador, {
      tipo: 'lanche', personId: pessoa, em: dia(1), quantidade: 1, finalidade: 'x',
    });
    expect(r.status).toBe(400);
  });
});
