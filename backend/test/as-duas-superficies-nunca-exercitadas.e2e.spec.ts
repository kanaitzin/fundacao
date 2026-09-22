/**
 * AS DUAS SUPERFÍCIES QUE NENHUM TESTE JAMAIS EXERCITOU (fase 146).
 *
 * COMO ELAS FORAM ACHADAS, e o método vale mais que o achado. Depois de a suíte
 * inteira rodar — 892 testes —, **dezenove tabelas continuavam VAZIAS**. Vazio no
 * fim, porém, não distingue *"ninguém escreveu"* de *"a suíte limpou": quem
 * separa é `pg_stat_user_tables.n_tup_ins`, que conta as inserções da rodada
 * mesmo das linhas apagadas depois. Treze das dezenove tinham sido escritas.
 * **Seis nunca receberam uma linha.**
 *
 * Quatro estão vazias por DECISÃO ESCRITA, e não são defeito: `work_schedule`
 * (MORTA), `medication_authorization` (dormente desde 08/09) e
 * `medication_protocol` com o seu histórico — *"o protocolo por período e a
 * autorização nominal deixaram de DECIDIR em 08/09"*, as rotas de escrita saíram,
 * e ler o que a casa decidiu em agosto continua sendo história dela.
 *
 * Sobraram DUAS, e esta suíte é o teste que faltava para as duas:
 *
 *  * **a CONTENÇÃO.** E ela tinha um buraco: a política de inserção exigia só que
 *    quem assina seja quem está logado — **nada exigia que a ocorrência estivesse
 *    no alcance de quem escreve** —, e `addRestraint` era o único dos irmãos que
 *    não conferia a casa no serviço. A chave estrangeira não ajuda: ela é
 *    conferida como DONA da tabela, por fora do RLS. Uma conta de outra casa, com
 *    o uuid na mão, escrevia uma contenção na ocorrência de uma criança que ela
 *    não alcança — e a casa depois LERIA essa linha, assinada por um estranho.
 *    **Contenção é o registro mais grave que este sistema guarda sobre uma
 *    criança**, é append-only, e uma linha falsa aqui não se corrige depois;
 *  * **a saída de medicamentos com o acolhido** (1050), que estava CORRETA — ela
 *    confere a casa, o cargo e tem índice único. O que faltava era alguém provar.
 *    Ela importa: é o remédio que a criança leva para o fim de semana com a
 *    família, e o que sai do armário.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('As duas superfícies nunca exercitadas', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const CONTENCAO = {
    antecedentes: 'O adolescente começou a bater a cabeça na parede do corredor (ficção).',
    local: 'Corredor do primeiro andar',
    presentes: 'Educador de plantão e Líder Diurno',
    tentativasAnteriores: 'Conversa, água, e sair para o pátio — as três sem efeito.',
    metodo: 'Contenção com os braços, de frente, por dois educadores.',
    duracaoMinutos: 4,
    possivelLesao: 'Nenhuma lesão visível.',
    avaliacaoSaude: 'Enfermagem avaliada por telefone; sem indicação de atendimento.',
    acaoPosterior: 'Ficou com o educador no pátio até dormir; equipe técnica avisada.',
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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      /* De OUTRA casa — é com ela que o buraco se mede. */
      deOutraCasa: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email).catch(() => '');

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows: [crianca] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name DESC OFFSET 4 LIMIT 1`, [ids.AI3]);
    ids.crianca = crianca.id;
  });

  afterAll(async () => {
    /*
     * UM afterAll SÓ, e nesta ordem — eu escrevi DOIS na primeira versão e o
     * primeiro fechava a conexão: o segundo morreu com *"Client was closed and is
     * not queryable"* e a limpeza não aconteceu. Jest roda os hooks na ordem de
     * declaração, e quem fecha a conexão fecha por último.
     *
     * A convivência FECHA — nada se apaga, e uma criança fora da casa mudaria a
     * chamada de todas as suítes seguintes (a lição da fase 127). O contato
     * encerra-se com motivo. A ocorrência e a contenção ficam, porque são
     * append-only por regra e a semente as recria a cada rodada.
     */
    await admin.query(
      `UPDATE family_stay SET status='encerrada', returned_at=now()
        WHERE person_id = ANY($1::uuid[]) AND returned_at IS NULL`,
      [[ids.crianca, ids.outraCrianca].filter(Boolean)]);
    await admin.query(
      `UPDATE person_contact SET active = false, visit_authorized = false,
              ended_reason = 'Contato fictício da suíte das superfícies.'
        WHERE id = ANY($1::uuid[])`, [[ids.contato, ids.outroContato].filter(Boolean)]);
    await app.close();
    await admin.end();
  });

  // ====================== A contenção ======================

  it('a contenção exige os cinco campos do papel, e diz quais faltam', async () => {
    const oc = await request(http).post('/api/v1/incidents').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, categoria: 'contencao', quando: new Date().toISOString(),
              fato: 'Contenção fictícia registrada pela suíte das superfícies.',
              acolhidos: [ids.crianca] });
    expect(oc.status).toBe(201);
    ids.ocorrencia = oc.body.id;

    const vazia = await request(http)
      .post(`/api/v1/incidents/${ids.ocorrencia}/restraint`).set(auth(tokens.educador)).send({});
    expect(vazia.status).toBe(400);
    /* A recusa NOMEIA o que falta: é o formulário de papel da Fundação, e quem
       preenche às 3h não pode ficar adivinhando qual campo o sistema quer. */
    expect(vazia.body.message).toMatch(/fatos antecedentes/i);
    expect(vazia.body.message).toMatch(/método utilizado/i);
  });

  it('UMA CONTA DE OUTRA CASA não escreve contenção na ocorrência desta — era o buraco', async () => {
    if (!tokens.deOutraCasa) return;
    const r = await request(http).post(`/api/v1/incidents/${ids.ocorrencia}/restraint`)
      .set(auth(tokens.deOutraCasa)).send(CONTENCAO);
    /* Regra 8: fora do alcance responde igual a inexistente. */
    expect(r.status).toBe(404);

    /* E NADA foi escrito — a conferência não pode ser só a frase. */
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM incident_restraint WHERE incident_id = $1`,
      [ids.ocorrencia]);
    expect(rows[0].n).toBe(0);
  });

  it('nem por dentro do banco: a política recusa, e não só o serviço', async () => {
    /*
     * A política é o que vale para qualquer caminho novo — um endpoint futuro que
     * esqueça a conferência bate aqui. O teste escreve como a APLICAÇÃO escreve
     * (papel `rede_app`, com o `app.user_id` de quem está fora da casa), porque é
     * assim que o RLS entra em jogo.
     *
     * **NUMA OCORRÊNCIA SEM CONTENÇÃO, e isto é conserto de um falso verde meu.**
     * Na primeira versão este teste usava a mesma ocorrência dos outros, e quando
     * eu medi a suíte SEM a correção ele passou — não pela política, mas porque a
     * chave primária já estava ocupada pela linha que o buraco havia deixado
     * entrar. Teste que passa pelo motivo errado é pior do que teste que falta:
     * ele afirma que a guarda existe quando o que respondeu foi outra coisa.
     */
    const { rows: [fora] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'coord.ai4@paodospobres.dev'`);
    if (!fora) return;
    const limpa = await request(http).post('/api/v1/incidents').set(auth(tokens.educador))
      .send({ houseId: ids.AI3, categoria: 'contencao', quando: new Date().toISOString(),
              fato: 'Segunda ocorrência fictícia, sem contenção, para medir a política.',
              acolhidos: [ids.crianca] });
    expect(limpa.status).toBe(201);

    await admin.query('BEGIN');
    await admin.query(`SELECT set_config('app.user_id', $1, true)`, [fora.id]);
    await admin.query('SET LOCAL ROLE rede_app');
    await expect(admin.query(
      `INSERT INTO incident_restraint (incident_id, antecedents, place, people_present,
         previous_attempts, method, recorded_by)
       VALUES ($1,'a','b','c','d','e',$2)`, [limpa.body.id, fora.id])).rejects.toThrow();
    await admin.query('ROLLBACK');

    /* E a MESMA escrita, por quem alcança a casa, passa — senão o teste acima
       estaria provando apenas que algum erro acontece. */
    const { rows: [dentro] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'educador.ai3@paodospobres.dev'`);
    await admin.query('BEGIN');
    await admin.query(`SELECT set_config('app.user_id', $1, true)`, [dentro.id]);
    await admin.query('SET LOCAL ROLE rede_app');
    await admin.query(
      `INSERT INTO incident_restraint (incident_id, antecedents, place, people_present,
         previous_attempts, method, recorded_by)
       VALUES ($1,'a','b','c','d','e',$2)`, [limpa.body.id, dentro.id]);
    await admin.query('ROLLBACK');
  });

  it('o educador da casa registra, e o sistema NÃO julga a medida', async () => {
    const r = await request(http).post(`/api/v1/incidents/${ids.ocorrencia}/restraint`)
      .set(auth(tokens.educador)).send(CONTENCAO);
    expect(r.status).toBe(201);
    /* A frase é a decisão do §6: o sistema não conclui sobre culpa nem sobre
       adequação — a análise é da equipe técnica. */
    expect(r.body.aviso).toMatch(/não avalia se a medida foi adequada/i);

    const { rows } = await admin.query(
      `SELECT method, duration_minutes, recorded_by FROM incident_restraint
        WHERE incident_id = $1`, [ids.ocorrencia]);
    expect(rows).toHaveLength(1);
    expect(rows[0].method).toMatch(/Contenção com os braços/);
    expect(rows[0].duration_minutes).toBe(4);
  });

  it('a segunda contenção na mesma ocorrência é recusada com frase — não reescreve', async () => {
    const r = await request(http).post(`/api/v1/incidents/${ids.ocorrencia}/restraint`)
      .set(auth(tokens.lider)).send({ ...CONTENCAO, metodo: 'Outro método fictício.' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/já foi registrada e não é reescrita/i);

    /* E a primeira continua intacta: append-only não é só não apagar. */
    const { rows } = await admin.query(
      `SELECT method FROM incident_restraint WHERE incident_id = $1`, [ids.ocorrencia]);
    expect(rows[0].method).toMatch(/Contenção com os braços/);
  });

  it('e a contenção sai na leitura da ocorrência, para quem alcança a casa', async () => {
    const r = await request(http).get(`/api/v1/incidents/${ids.ocorrencia}`)
      .set(auth(tokens.tecnica));
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body.contencao ?? {})).toMatch(/Contenção com os braços/);
  });

  // ============ A saída de medicamentos com o acolhido ============

  it('o remédio que vai junto: a folha conta as doses, e a saída dá baixa UMA vez', async () => {
    /*
     * A superfície estava correta e ninguém a havia exercitado. O que ela faz, e
     * é por isso que importa: a criança sai para o fim de semana com a família, e
     * quem a recebe precisa da orientação escrita e dos comprimidos. Sem isto, o
     * remédio de uso contínuo simplesmente não ia.
     */
    const { rows: [contato] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, phone)
       VALUES ($1, 'Contato Fictício das Superfícies', 'genitora', '51 90000-0009')
       RETURNING id`, [ids.crianca]);
    ids.contato = contato.id;

    const saida = await request(http).post('/api/v1/people/family-stays').set(auth(tokens.tecnica))
      .send({ personId: ids.crianca, contatoId: ids.contato,
              inicio: new Date(Date.now() + 3600_000).toISOString(),
              retornoPrevisto: new Date(Date.now() + 3 * 86400_000).toISOString(),
              finalidade: 'Convivência fictícia da suíte das superfícies.' });
    expect(saida.status).toBe(201);
    ids.saida = saida.body.id;

    const folha = await request(http)
      .get(`/api/v1/medications/family-stays/${ids.saida}/to-take`).set(auth(tokens.tecnica));
    expect(folha.status).toBe(200);
    expect(Array.isArray(folha.body.itens ?? folha.body)).toBe(true);

    const reg = await request(http)
      .post(`/api/v1/medications/family-stays/${ids.saida}/to-take/register`)
      .set(auth(tokens.tecnica)).send({});
    expect([200, 201]).toContain(reg.status);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM family_stay_medication WHERE family_stay_id = $1`,
      [ids.saida]);
    expect(rows[0].n).toBe(1);

    /* DUAS VEZES NÃO DÁ BAIXA DUAS VEZES — imprimir a folha de novo, porque o
       papel amassou, não pode tirar comprimido do armário outra vez (1050). */
    const denovo = await request(http)
      .post(`/api/v1/medications/family-stays/${ids.saida}/to-take/register`)
      .set(auth(tokens.tecnica)).send({});
    const { rows: depois } = await admin.query(
      `SELECT count(*)::int AS n FROM family_stay_medication WHERE family_stay_id = $1`,
      [ids.saida]);
    expect(depois[0].n).toBe(1);
    /* 409 com a frase que diz o que PODE ser feito: gerar a folha de novo. */
    expect(denovo.status).toBe(409);
    expect(denovo.body.message).toMatch(/sem dar baixa outra vez|já foi registrada/i);
  });

  it('o educador NÃO registra a saída de medicamentos — e o guarda é o do CARGO', async () => {
    /*
     * NUMA SAÍDA NOVA, e é medição, não capricho.
     *
     * Na saída acima a resposta ao educador era **409** — porque o serviço confere
     * *"já registrada"* ANTES do cargo, e a baixa já tinha acontecido. A ordem
     * está certa (*"já foi feito"* é resposta mais verdadeira que *"você não
     * pode"*, e não conta nada a ninguém), mas significa que **o guarda de cargo
     * desta rota nunca era alcançado** — e era exatamente isto que a medição das
     * tabelas vazias existia para achar.
     */
    const { rows: [outra] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa' AND hs.person_id <> $2
        ORDER BY p.full_name DESC OFFSET 6 LIMIT 1`, [ids.AI3, ids.crianca]);
    ids.outraCrianca = outra.id;
    const { rows: [ct] } = await admin.query(
      `INSERT INTO person_contact (person_id, name, bond, phone)
       VALUES ($1, 'Segundo Contato Fictício das Superfícies', 'avo', '51 90000-0010')
       RETURNING id`, [ids.outraCrianca]);
    ids.outroContato = ct.id;

    const saida2 = await request(http).post('/api/v1/people/family-stays').set(auth(tokens.tecnica))
      .send({ personId: ids.outraCrianca, contatoId: ids.outroContato,
              inicio: new Date(Date.now() + 3600_000).toISOString(),
              retornoPrevisto: new Date(Date.now() + 3 * 86400_000).toISOString(),
              finalidade: 'Segunda convivência fictícia, para medir o guarda de cargo.' });
    expect(saida2.status).toBe(201);

    const r = await request(http)
      .post(`/api/v1/medications/family-stays/${saida2.body.id}/to-take/register`)
      .set(auth(tokens.educador)).send({});
    expect(r.status).toBe(403);
    /* A recusa NOMEIA quem pode — quem levou a recusa precisa saber a quem pedir. */
    expect(r.body.message).toMatch(/Enfermagem, a equipe técnica e a coordenação/i);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM family_stay_medication WHERE family_stay_id = $1`,
      [saida2.body.id]);
    expect(rows[0].n).toBe(0);
  });

});
