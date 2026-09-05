/**
 * O TRABALHO SOCIAL — e a recusa que é o desenho.
 *
 * O Gestor Geral pediu a outra leitura das oito casas: quantas crianças,
 * quantas entraram e saíram, e o que aconteceu de bom — passou de ano, curso
 * profissionalizante, faculdade, primeiro emprego.
 *
 * Contar isso por casa é a distância de um `ORDER BY` de virar ranking de
 * casas, que é proibido (regra 3). E a proibição não é burocracia: a casa que
 * recebe adolescentes com medida protetiva recente e a casa-lar com quatro
 * crianças pequenas não estão na mesma corrida — transformar isso em placar
 * faz a primeira parecer pior no exato momento em que ela faz o trabalho mais
 * difícil.
 *
 * Por isso metade desta suíte testa o que o painel NÃO faz.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Painel de impacto — o trabalho social nas oito casas', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3 = '', crianca = '', marco = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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
      gestor: 'gestor@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
    })) {
      const r = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
      tokens[k] = r.body.token;
    }

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: crianca }] } = await admin.query(
      `SELECT person_id AS id FROM house_stay
        WHERE house_id = $1 AND status = 'ativa' LIMIT 1`, [AI3]));
  });

  afterAll(async () => {
    /* Marco não se apaga — é a regra que esta suíte testa. Quem limpa é o
     * `globalSetup`, recriando o schema. */
    await app.close(); await admin.end();
  });

  // ------------------------------------------------------------- Registrar

  it('o educador não registra marco; a técnica registra', async () => {
    const doEducador = await request(http).post('/api/v1/impacto/marcos')
      .set(auth(tokens.educador))
      .send({ personId: crianca, tipo: 'aprovacao_escolar',
              descricao: 'tentativa do educador, deve ser recusada' });
    expect(doEducador.status).toBe(403);

    const semDescricao = await request(http).post('/api/v1/impacto/marcos')
      .set(auth(tokens.tecnica))
      .send({ personId: crianca, tipo: 'aprovacao_escolar', descricao: 'passou' });
    expect(semDescricao.status).toBe(400);
    expect(semDescricao.body.message).toMatch(/esta linha é a história/);

    const r = await request(http).post('/api/v1/impacto/marcos')
      .set(auth(tokens.tecnica))
      .send({ personId: crianca, tipo: 'aprovacao_escolar',
              instituicao: 'Escola Fictícia Municipal',
              descricao: 'Passou para o 7º ano na Escola Fictícia, com recuperação em '
                + 'matemática vencida no fim do ano.' });
    expect(r.status).toBe(201);
    marco = r.body.id;
  });

  it('o marco guarda a casa em que ela estava, e o educador LÊ', async () => {
    /*
     * A parte boa da história não se esconde de quem acorda a criança todo
     * dia. Ler é de toda a casa; escrever é da técnica e da coordenação.
     */
    const r = await request(http).get(`/api/v1/impacto/marcos?personId=${crianca}`)
      .set(auth(tokens.educador));
    expect(r.status).toBe(200);
    const meu = r.body.find((m: any) => m.id === marco);
    expect(meu.tipoRotulo).toBe('Passou de ano');
    expect(meu.casa).toBe('AI3');
    expect(meu.instituicao).toBe('Escola Fictícia Municipal');
  });

  it('marco não se apaga', async () => {
    await expect(admin.query(`DELETE FROM life_milestone WHERE id = $1`, [marco]))
      .rejects.toThrow(/marco_nao_e_apagado/);
  });

  // -------------------------------------------------------------- Panorama

  it('o panorama é do Gestor Geral; a coordenação tem o painel da casa dela', async () => {
    const daCoord = await request(http).get('/api/v1/impacto/panorama')
      .set(auth(tokens.coord));
    expect(daCoord.status).toBe(403);

    const doGestor = await request(http).get('/api/v1/impacto/panorama')
      .set(auth(tokens.gestor));
    expect(doGestor.status).toBe(200);
    expect(doGestor.body.casas.length).toBe(8);
  });

  it('AS CASAS SAEM NA ORDEM DO CADASTRO, e nunca por resultado', async () => {
    /*
     * O teste central desta suíte. Ordenar por marcos, por ocorrências ou por
     * ocupação seria publicar um ranking sem chamá-lo assim — e a próxima
     * pessoa que mexer nisto vai QUERER ordenar por marcos, porque parece
     * mais útil. Este teste está aqui para ela.
     */
    const r = await request(http).get('/api/v1/impacto/panorama').set(auth(tokens.gestor));
    const codigos = r.body.casas.map((c: any) => c.codigo);
    expect(codigos).toEqual([...codigos].sort());

    // E o painel diz isso em voz alta, para quem lê a tela.
    expect(r.body.aviso).toMatch(/ordem do cadastro/);
    expect(r.body.aviso).toMatch(/não compara casas/);
  });

  it('o panorama não calcula média, meta, percentual nem destaque', async () => {
    const r = await request(http).get('/api/v1/impacto/panorama').set(auth(tokens.gestor));
    const texto = JSON.stringify(r.body).toLowerCase();
    for (const proibido of ['media', 'média', 'meta', 'percentual', 'ranking',
                            'destaque', 'melhor', 'pior', 'nota', 'score']) {
      expect(texto).not.toContain(proibido);
    }
  });

  it('o panorama conta o que o gestor pediu — e o marco novo aparece', async () => {
    const r = await request(http).get('/api/v1/impacto/panorama').set(auth(tokens.gestor));
    const ai3 = r.body.casas.find((c: any) => c.codigo === 'AI3');
    expect(ai3.acolhidos).toBeGreaterThan(0);
    expect(ai3.capacidade).toBeGreaterThan(0);
    expect(ai3.marcos).toBeGreaterThanOrEqual(1);

    expect(r.body.total.acolhidos).toBeGreaterThanOrEqual(ai3.acolhidos);
    const passouDeAno = r.body.marcosPorTipo.find((t: any) => t.cod === 'aprovacao_escolar');
    expect(passouDeAno.n).toBeGreaterThanOrEqual(1);
    expect(passouDeAno.label).toBe('Passou de ano');
  });

  // ------------------------------------------------------------ Trajetória

  it('a trajetória traz o que foi conquistado — e NÃO o prontuário', async () => {
    const r = await request(http).get(`/api/v1/impacto/trajetoria/${crianca}`)
      .set(auth(tokens.gestor));
    expect(r.status).toBe(200);
    expect(r.body.marcos.length).toBeGreaterThanOrEqual(1);
    expect(r.body.casasPorOndePassou.length).toBeGreaterThanOrEqual(1);

    /*
     * Uma visão de impacto que abrisse o prontuário viraria outra coisa. Saúde,
     * ocorrência e conteúdo judicial ficam nas telas do caso, com quem cuida
     * dele — e o que o Gestor Geral vê antes de abrir um relato restrito é
     * uma decisão institucional ainda em aberto (§7.6 do RETOMAR-AQUI).
     */
    /*
     * A varredura é sobre os DADOS, e não sobre o aviso — a primeira versão
     * reprovava a própria frase que promete não trazer o prontuário
     * ("saúde, ocorrências e conteúdo judicial não entram aqui"). Um
     * conferidor que proíbe a palavra ensina a não escrever a explicação, e
     * a explicação é metade do valor da tela.
     */
    const { aviso, ...dados } = r.body;
    const chaves = JSON.stringify(dados).toLowerCase();
    for (const proibido of ['diagnostic', 'medicament', 'ocorrenc', 'judicial',
                            'processo', 'internac']) {
      expect(chaves).not.toContain(proibido);
    }
    expect(aviso).toMatch(/não entram aqui/);
  });

  // ----------------------------------------------------------- A folha

  it('a folha do impacto não vira placar de casas, e diz por quê', async () => {
    const r = await request(http).get('/api/v1/impacto/folha').set(auth(tokens.gestor));
    expect(r.status).toBe(200);
    expect(r.body.titulo).toMatch(/^O trabalho social/);

    const casaACasa = r.body.secoes.find((s: any) => s.titulo === 'Casa a casa');
    const codigos = casaACasa.tabela.linhas.map((l: string[]) => l[0].split(' —')[0]);
    expect(codigos).toEqual([...codigos].sort());
    expect(casaACasa.procedencia).toMatch(/ordem do cadastro/);
    expect(casaACasa.procedencia).toMatch(/não compara casas/);

    /*
     * A ressalva é o que impede a folha de virar outra coisa quando ela sair
     * da instituição. Quem lê de fora não sabe que parte do trabalho não cabe
     * em categoria, e vai concluir o contrário se ninguém escrever.
     */
    expect(r.body.ressalva).toMatch(/Ausência de registro não é ausência de trabalho/);
    expect(r.body.ressalva).toMatch(/não são comparáveis entre si/);
  });

  it('exportar o relatório exige finalidade e registra a saída', async () => {
    await request(http).post('/api/v1/impacto/export')
      .set(auth(tokens.gestor)).send({ finalidade: 'anual' }).expect(400);

    const finalidade = 'relatório anual para o Conselho Municipal dos Direitos';
    const r = await request(http).post('/api/v1/impacto/export')
      .set(auth(tokens.gestor)).send({ finalidade });
    expect(r.status).toBe(201);
    expect(r.body.nomeArquivo).toMatch(/\.docx$/);

    const { rows } = await admin.query(
      `SELECT purpose FROM audit_event
        WHERE action='documento.export' AND entity='impacto'
        ORDER BY at DESC LIMIT 1`);
    expect(rows[0].purpose).toBe(finalidade);
  });

  it('a trajetória de quem está fora do alcance é recusada', async () => {
    const { rows: [outra] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs
        JOIN house h ON h.id = hs.house_id
       WHERE h.code = 'AI4' AND hs.status = 'ativa' LIMIT 1`);
    if (!outra) return;
    const r = await request(http).get(`/api/v1/impacto/trajetoria/${outra.id}`)
      .set(auth(tokens.tecnica));
    expect([403, 404]).toContain(r.status);
  });
});
