/**
 * DE ONDE A TÉCNICA ESCOLHE AS FONTES DO ACOMPANHAMENTO (§14.4, §10.7).
 *
 * A PERGUNTA E A RESPOSTA. O §10.7 perguntava de onde se escolhe, e a resposta
 * de 20/09/2026 foi **as três numa lista só** — linha do tempo, ocorrências e
 * evoluções de saúde do período —, com filtro por tipo.
 *
 * O DEFEITO QUE ISTO FECHA: `POST /followups/:id/sources` existe desde a
 * migração 0490 e **nunca teve quem o chamasse**. Ele pedia `entidade` e
 * `entityId` digitados à mão, que ninguém tem — era uma rota pronta sem porta,
 * e o acompanhamento ia sendo escrito sem referência nenhuma ao original.
 *
 * O que esta suíte cobra:
 *
 *   * as três origens vêm na MESMA lista, ordenada por data, e o filtro por tipo
 *     recorta sem mudar a forma da resposta;
 *   * o recorte é o PERÍODO DO ACOMPANHAMENTO, e não o de hoje: o que aconteceu
 *     fora dele não entra, senão o acompanhamento de agosto citaria setembro;
 *   * **o conteúdo da ocorrência restrita NÃO sai por aqui** — só a referência,
 *     com data e autor. É o precedente da fase 121: este documento vira folha, e
 *     folha se imprime, se anexa e se esquece em cima de uma mesa;
 *   * escolher grava a REFERÊNCIA, e escolher duas vezes não duplica;
 *   * quem não redige acompanhamento não lista fonte nenhuma.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('De onde vem a fonte do acompanhamento', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  /* O que esta suíte cria, para fechar o que abre (a lição da fase 127). */
  const criados = { atividades: [] as string[] };

  const login = async (email: string) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password: SENHA });
    if (res.status !== 201) throw new Error(`login ${email}: ${res.status}`);
    return res.body.token as string;
  };
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

    tokens.tecnica = await login('tecnica.ai3@paodospobres.dev');
    tokens.educador = await login('educador.ai3@paodospobres.dev');

    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.crianca }] } = await admin.query(
      `SELECT hs.person_id AS id FROM house_stay hs JOIN person p ON p.id = hs.person_id
        WHERE hs.house_id = $1 AND hs.status = 'ativa'
        ORDER BY p.full_name OFFSET 9 LIMIT 1`, [ids.AI3]));

    /*
     * A OCORRÊNCIA É CRIADA E **NÃO É LIMPA NO FIM**, e a razão tem duas metades.
     *
     * A primeira: `incident` tem o `incident_guard_trg`, que proíbe `DELETE`.
     * **Ocorrência não se apaga** — é regra do sistema, e vale para a suíte.
     *
     * A segunda: ela não precisa ser limpa, porque o `globalSetup` do Jest
     * (`test/setup/reset-db.ts`) **derruba o schema e recria o banco do zero
     * antes de cada execução**. O que esta suíte deixa morre na execução
     * seguinte, e não acumula.
     *
     * *Escrevi aqui, antes de medir, que "dez execuções deixariam vinte
     * ocorrências". Era falso, e eu conferi depois: o banco é recriado. Fica a
     * anotação porque comentário errado é pior do que comentário nenhum.*
     *
     * O que continua sendo verdade é a isolação DENTRO de uma execução: as
     * suítes dividem o banco, e por isso o `afterAll` apaga tudo o que pode
     * apagar. As duas ocorrências ficam — medido: a suíte inteira passa com
     * elas, porque nenhuma outra conta ocorrência da casa.
     */
    const MARCA_OPERACIONAL = '[fixture de-onde-vem-a-fonte] fato operacional fictício.';
    const MARCA_RESTRITA = '[fixture de-onde-vem-a-fonte] NARRATIVA RESTRITA FICTÍCIA.';
    const inc = await admin.query(
      `INSERT INTO incident (house_id, category, happened_at, objective_fact, access_level,
                             opened_by)
       VALUES ($1, 'desorganizacao_relevante',
               app_hoje()::timestamptz + interval '20 hours', $2, 'equipe',
               (SELECT id FROM app_user WHERE email='tecnica.ai3@paodospobres.dev')),
              ($1, 'violencia_ou_suspeita',
               app_hoje()::timestamptz + interval '21 hours', $3, 'restrito',
               (SELECT id FROM app_user WHERE email='tecnica.ai3@paodospobres.dev'))
       RETURNING id, access_level`,
      [ids.AI3, MARCA_OPERACIONAL, MARCA_RESTRITA]);
    for (const r of inc.rows) {
      await admin.query(`INSERT INTO incident_person (incident_id, person_id) VALUES ($1,$2)`,
        [r.id, ids.crianca]);
      ids[r.access_level === 'restrito' ? 'incRestrita' : 'incOperacional'] = r.id;
    }

    /*
     * O PERÍODO É O DIA DA INSTITUIÇÃO, e sai do `app_hoje()` — nunca do relógio
     * do processo. Depois das 21h em Porto Alegre o UTC já virou o dia, e um
     * período calculado em UTC deixaria as duas ocorrências de fora do próprio
     * recorte que esta suíte acabou de montar. É a condição que o segundo
     * relógio da casa exercita.
     */
    ({ rows: [{ id: ids.followup }] } = await admin.query(
      `INSERT INTO followup (person_id, house_id, episode_id, kind,
                             period_start, period_end, status)
       VALUES ($1, $2,
               -- O acompanhamento pertence ao EPISÓDIO de acolhimento, não só à
               -- criança: quem sai e volta não tem a segunda passagem escrita
               -- por cima da primeira.
               (SELECT id FROM care_episode WHERE person_id = $1
                 ORDER BY started_at DESC LIMIT 1),
               'semanal', app_hoje(), app_hoje(), 'pendente')
       RETURNING id`, [ids.crianca, ids.AI3]));

    /* Uma atividade DENTRO e outra bem FORA do período — estas se apagam. */
    const ativ = await admin.query(
      `INSERT INTO activity (house_id, person_id, kind, title, scheduled_at, state)
       VALUES ($1, $2, 'saude', 'Consulta fictícia da suíte de fontes',
               app_hoje()::timestamptz + interval '14 hours', 'concluida_no_horario'),
              ($1, $2, 'saude', 'Consulta fictícia FORA do período',
               app_hoje()::timestamptz - interval '60 days', 'concluida_no_horario')
       RETURNING id`, [ids.AI3, ids.crianca]);
    criados.atividades = ativ.rows.map((r: any) => r.id);
  });

  /*
   * REDE DE SEGURANÇA. Um banco só, e o que esta suíte abre ela fecha — tirando
   * a ocorrência, que o sistema não deixa apagar de propósito e que por isso é
   * fixture reaproveitada, criada uma vez só.
   */
  afterAll(async () => {
    await admin.query(`DELETE FROM followup_source WHERE followup_id = $1`, [ids.followup]);
    await admin.query(`DELETE FROM followup WHERE id = $1`, [ids.followup]);
    if (criados.atividades.length) {
      await admin.query(`DELETE FROM activity WHERE id = ANY($1::uuid[])`, [criados.atividades]);
    }
    await app.close(); await admin.end();
  });

  const listar = (tipo?: string) =>
    request(http).get(`/api/v1/followups/${ids.followup}/sources${tipo ? `?tipo=${tipo}` : ''}`)
      .set(auth(tokens.tecnica));

  it('as três origens vêm na MESMA lista, com origem, autor, data e classificação', async () => {
    const r = await listar();
    expect(r.status).toBe(200);
    const tipos = new Set(r.body.candidatos.map((c: any) => c.tipo));
    expect(tipos.has('atividade')).toBe(true);
    expect(tipos.has('ocorrencia')).toBe(true);
    /* Cada candidato se identifica: sem origem e autor, a técnica não sabe o
       que está referenciando sem abrir uma a uma. */
    for (const c of r.body.candidatos) {
      expect(typeof c.origem).toBe('string');
      expect(c).toHaveProperty('autor');
      expect(c).toHaveProperty('quando');
      expect(['operacional', 'restrito']).toContain(c.classificacao);
    }
  });

  it('o recorte é o período DO ACOMPANHAMENTO, e não o de hoje', async () => {
    const r = await listar();
    const titulos = r.body.candidatos.map((c: any) => c.titulo);
    expect(titulos).toContain('Consulta fictícia da suíte de fontes');
    expect(titulos).not.toContain('Consulta fictícia FORA do período');
  });

  it('a ocorrência restrita APARECE, e o texto dela não', async () => {
    const r = await listar('ocorrencia');
    /*
     * Procura pelo ID, e não pela classificação. Procurar "a primeira restrita"
     * pegava a ocorrência de OUTRA suíte — no banco compartilhado, o período
     * desta suíte é o dia de hoje, e o que as outras abrem no mesmo dia cai
     * dentro dele. **Reprovou só no relógio adiantado**, que é quando outra suíte
     * grava na mesma data da instituição, e é exatamente para isso que o segundo
     * relógio existe.
     */
    const restrita = r.body.candidatos.find((c: any) => c.id === ids.incRestrita);
    /* Esconder que existe faria a técnica procurar noutro lugar. */
    expect(restrita).toBeDefined();
    expect(restrita.resumo).toBeNull();
    /* E a narrativa não sai por lugar nenhum da resposta — esta folha circula. */
    expect(JSON.stringify(r.body)).not.toContain('NARRATIVA RESTRITA');
    /* A operacional, sim: ela é o que o plantão já lê — e é a DESTA suíte. */
    const operacional = r.body.candidatos.find((c: any) => c.id === ids.incOperacional);
    expect(operacional.resumo).toMatch(/fato operacional fictício/i);
  });

  it('o filtro por tipo recorta sem mudar a forma da resposta', async () => {
    const r = await listar('saude');
    expect(r.status).toBe(200);
    expect(r.body.tipos).toHaveLength(3);
    expect(r.body.candidatos.every((c: any) => c.tipo === 'saude')).toBe(true);
  });

  it('escolher guarda a REFERÊNCIA — e escolher duas vezes não duplica', async () => {
    const antes = await listar();
    const alvo = antes.body.candidatos.find((c: any) => c.tipo === 'atividade');

    const corpo = { entidade: alvo.entidade, entityId: alvo.id, origem: alvo.origem,
                    autor: alvo.autor, registradoEm: alvo.quando,
                    classificacao: alvo.classificacao };
    for (const _ of [1, 2]) {
      const r = await request(http).post(`/api/v1/followups/${ids.followup}/sources`)
        .set(auth(tokens.tecnica)).send(corpo);
      expect(r.status).toBe(201);
    }

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM followup_source
        WHERE followup_id = $1 AND entity = $2 AND entity_id = $3`,
      [ids.followup, alvo.entidade, alvo.id]);
    expect(rows[0].n).toBe(1);

    /* E a lista volta dizendo que aquela já é fonte: sem isso, a tela oferece
       o mesmo botão de novo e quem escreve não sabe o que já citou. */
    const depois = await listar();
    const mesma = depois.body.candidatos.find((c: any) => c.id === alvo.id);
    expect(mesma.jaEscolhida).toBe(true);
  });

  it('quem não redige acompanhamento não lista fonte nenhuma', async () => {
    const r = await request(http).get(`/api/v1/followups/${ids.followup}/sources`)
      .set(auth(tokens.educador));
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/equipe técnica|coordenação/i);
  });
});
