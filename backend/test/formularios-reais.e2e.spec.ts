/**
 * OS FORMULÁRIOS REAIS DA FUNDAÇÃO.
 *
 * Escrito depois de ler os documentos que o Marcelo entregou: LIVRO ATA –
 * AI 03, ATA – LÍDERES NOTURNO, Modelo de Evolução de Saúde, Prontuário
 * Individual de Evolução (Educação), Audiência Concentrada e a planilha de
 * dados bancários.
 *
 * Nenhum dado real entrou aqui. Os documentos foram lidos como referência de
 * CAMPO e FLUXO; as pessoas destes testes são fictícias (§3.3).
 *
 * O que se prova:
 *
 *  1. a ATA Geral Noturna é uma GRADE das oito casas, e casa não respondida
 *     aparece em branco em vez de sumir;
 *  2. "sim" sem descrição não é registro: intercorrência de saúde e evasão
 *     exigem o fato;
 *  3. a Evolução de Saúde tem os campos do papel, inclusive o comportamento
 *     ao chegar e ao sair, e é assinada por duas pessoas diferentes;
 *  4. o sistema NÃO guarda senha de gov.br/INSS/CTPS — nem escondida num
 *     campo de observação.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { SECOES_ATA, AMBIENTES_CASA } from '../src/modules/shifts/ata-secoes';
import { SECOES_AUDIENCIA } from '../src/modules/reports';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Formulários reais — ATA, evolução, educação e benefícios', () => {
  let app: INestApplication, admin: Client;
  let AI3: string, AI4: string;
  const criados: { ata?: string } = {};

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
  });

  afterAll(async () => {
    if (criados.ata) {
      await admin.query(`DELETE FROM general_night_house_entry WHERE general_ata_id=$1`, [criados.ata]);
      await admin.query(`DELETE FROM general_night_ata WHERE id=$1`, [criados.ata]);
    }
    await admin.query(`DELETE FROM education_evolution WHERE narrative LIKE '%(fictício)%'`);
    await admin.query(`DELETE FROM education_support WHERE course_name LIKE '%fictício%'`);
    await app.close(); await admin.end();
  });

  /** Executa como o papel `rede_app`, com RLS valendo, no papel informado. */
  async function como(email: string, fn: (c: Client) => Promise<void>) {
    const { rows: [u] } = await admin.query(`SELECT id FROM app_user WHERE email=$1`, [email]);
    const c = new Client({
      connectionString: process.env.DATABASE_APP_URL
        ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher',
    });
    await c.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.user_id', $1, true)`, [u.id]);
      await fn(c);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      await c.end();
    }
  }

  it('a ATA da casa tem as seções do LIVRO ATA — inclusive experiência familiar e organização', () => {
    const chaves = SECOES_ATA.map((s) => s.chave);
    // Estavam no formulário de papel e faltavam no sistema.
    expect(chaves).toContain('experiencia_familiar');
    expect(chaves).toContain('organizacao');
    // A organização é conferida por ambiente, como no formulário.
    expect(AMBIENTES_CASA.map((a) => a.chave)).toEqual(
      ['cozinha', 'banheiros', 'quartos', 'lavanderia', 'sala_estudos', 'armarios']);

    // E o que o formulário associa a pessoas continua sendo do FATO: nenhuma
    // seção pede "quem estava desorganizado".
    const ajudas = SECOES_ATA.map((s) => s.ajuda.toLowerCase()).join(' ');
    expect(ajudas).not.toMatch(/comportamento d[oa] acolhid/);
  });

  it('a Audiência Concentrada segue o documento real: quatro blocos, não onze campos vazios', () => {
    expect(SECOES_AUDIENCIA).toEqual([
      'acompanhamento', 'saúde', 'educação e profissionalização', 'contexto sociofamiliar',
    ]);
  });

  it('a ATA Geral Noturna é uma grade das oito casas, e o não respondido aparece', async () => {
    const { rows: [lider] } = await admin.query(
      `SELECT id FROM app_user WHERE email='lider.noturno@paodospobres.dev'`);
    const { rows: [ata] } = await admin.query(
      `INSERT INTO general_night_ata (institution_id, on_date, leader_id, status)
       VALUES ((SELECT id FROM institution LIMIT 1), '2026-08-20', $1, 'rascunho')
       RETURNING id`, [lider.id]);
    criados.ata = ata.id;

    await como('lider.noturno@paodospobres.dev', async (c) => {
      // Responde duas casas; as outras seis ficam em branco de propósito.
      await c.query(
        `SELECT app_night_house_entry($1,$2,$3::jsonb)`, [ata.id, AI3, JSON.stringify({
          situacaoPlantao: 'completo', precisouApoio: false, apoiou: true, intervalos: true,
          intercorrenciaSaude: false, presencaLider: true, houveContato: true,
          meioContato: 'telefone_institucional', casaAcionou: false, evasao: false,
          outrosFatos: 'Noite tranquila (fictício).',
        })]);
      await c.query(
        `SELECT app_night_house_entry($1,$2,$3::jsonb)`, [ata.id, AI4, JSON.stringify({
          situacaoPlantao: 'ferias_folga', precisouApoio: true, apoiou: false, intervalos: false,
          intercorrenciaSaude: true,
          intercorrenciaNota: 'Adolescente com febre; Enfermagem orientou por telefone (fictício).',
          presencaLider: true, houveContato: true, meioContato: 'presencial',
          casaAcionou: true, motivo: 'Febre à 1h', acaoTomada: 'Fui à casa e acompanhei a medicação (fictício).',
          evasao: false,
        })]);

      const { rows } = await c.query(`SELECT * FROM app_night_grid($1)`, [ata.id]);
      expect(rows.length).toBeGreaterThanOrEqual(8);
      const ai3 = rows.find((r) => r.codigo === 'AI3');
      const ai4 = rows.find((r) => r.codigo === 'AI4');
      const ai1 = rows.find((r) => r.codigo === 'AI1');
      expect(ai3.respondida).toBe(true);
      expect(ai4.intercorrencia).toBe(true);
      // A casa não respondida NÃO some da grade: em branco é pergunta aberta,
      // não casa sem novidade.
      expect(ai1.respondida).toBe(false);
      expect(ai1.situacao).toBeNull();
    });
  });

  it('"sim" sem o fato não é registro: intercorrência e evasão exigem descrição', async () => {
    await expect(como('lider.noturno@paodospobres.dev', async (c) => {
      await c.query(`SELECT app_night_house_entry($1,$2,$3::jsonb)`, [criados.ata, AI3,
        JSON.stringify({ situacaoPlantao: 'completo', evasao: true, evasaoNota: 'saiu' })]);
    })).rejects.toThrow(/ck_night_entry_descreve/);
  });

  it('a linha da noite é do Líder Noturno Geral — o educador não escreve nela', async () => {
    await expect(como('educador.ai3@paodospobres.dev', async (c) => {
      await c.query(`SELECT app_night_house_entry($1,$2,$3::jsonb)`, [criados.ata, AI3,
        JSON.stringify({ situacaoPlantao: 'completo' })]);
    })).rejects.toThrow(/somente_lider_noturno_geral/);
  });

  it('a Evolução de Saúde guarda o comportamento ao chegar e ao sair, como no modelo', async () => {
    const { rows: [col] } = await admin.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name='health_evolution'
          AND column_name IN ('companion_name','behavior_before','behavior_after',
                              'trip_incidents','reconsult_on')`);
    expect(col.n).toBe(5);

    // As quatro opções são as do papel — nem mais, nem menos.
    await expect(admin.query(
      `INSERT INTO health_evolution (person_id, house_id, kind, happened_at, accompanied_by, behavior_before)
       SELECT s.person_id, s.house_id, 'consulta', now(),
              (SELECT id FROM app_user WHERE email='enfermagem@paodospobres.dev'), 'irritada'
         FROM house_stay s WHERE s.house_id=$1 AND s.status='ativa' LIMIT 1`, [AI3]))
      .rejects.toThrow(/behavior_before/);
  });

  it('a evolução é assinada por duas pessoas: Enfermagem e coordenação', async () => {
    const { rows: [ev] } = await admin.query(
      `INSERT INTO health_evolution (person_id, house_id, kind, happened_at, accompanied_by,
                                     companion_name, behavior_before, behavior_after, place, specialty)
       SELECT s.person_id, s.house_id, 'consulta', now(),
              (SELECT id FROM app_user WHERE email='enfermagem@paodospobres.dev'),
              'Motorista da Fundação (fictício)', 'ansiosa_temerosa_chorosa', 'tranquila',
              'UBS fictícia', 'odontologia'
         FROM house_stay s WHERE s.house_id=$1 AND s.status='ativa' LIMIT 1
       RETURNING id`, [AI3]);

    // A coordenação não assina no lugar da Enfermagem.
    await expect(como('coord.ai3@paodospobres.dev', async (c) => {
      await c.query(`SELECT app_sign_evolution($1,'enfermagem')`, [ev.id]);
    })).rejects.toThrow(/somente_enfermagem_assina/);

    await como('enfermagem@paodospobres.dev', async (c) => {
      const { rows: [r] } = await c.query(`SELECT * FROM app_sign_evolution($1,'enfermagem')`, [ev.id]);
      expect(r.assinada_enfermagem).toBe(true);
      expect(r.assinada_coordenacao).toBe(false);
    });
    await como('coord.ai3@paodospobres.dev', async (c) => {
      const { rows: [r] } = await c.query(`SELECT * FROM app_sign_evolution($1,'coordenacao')`, [ev.id]);
      expect(r.assinada_coordenacao).toBe(true);
    });
    // Assinar duas vezes não acontece: assinatura não é botão de salvar.
    await expect(como('enfermagem@paodospobres.dev', async (c) => {
      await c.query(`SELECT app_sign_evolution($1,'enfermagem')`, [ev.id]);
    })).rejects.toThrow(/ja_assinada/);

    await admin.query(`DELETE FROM health_evolution WHERE id=$1`, [ev.id]);
  });

  it('o prontuário de educação guarda sala de recursos, equipe multiprofissional e Jovem Aprendiz', async () => {
    await como('tecnica.ai3@paodospobres.dev', async (c) => {
      const { rows: [pessoa] } = await c.query(
        `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]);
      await c.query(
        `INSERT INTO education_support (person_id, house_id, resource_room, resource_reason,
            service_kind, service_place, service_professional, apprentice, apprentice_mode,
            course_name, course_shift, training_unit, created_by)
         VALUES ($1,$2,true,'Apoio em leitura (fictício)','fono','Clínica fictícia',
                 'Fga. fictícia', true, 'presencial','Assistente administrativo (fictício)',
                 'manhã','Unidade fictícia', app_current_user())`,
        [pessoa.person_id, AI3]);

      const { rows } = await c.query(
        `SELECT resource_room, service_kind, apprentice, course_name
           FROM education_support WHERE person_id=$1`, [pessoa.person_id]);
      expect(rows[0].service_kind).toBe('fono');
      expect(rows[0].apprentice).toBe(true);
    });
  });

  it('a evolução educacional é do autor, e o educador também escreve a dele', async () => {
    const { rows: [tec] } = await admin.query(
      `SELECT id FROM app_user WHERE email='tecnica.ai3@paodospobres.dev'`);
    const outroUsuario = tec.id;
    await como('educador.ai3@paodospobres.dev', async (c) => {
      const { rows: [pessoa] } = await c.query(
        `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]);
      await c.query(
        `INSERT INTO education_evolution (person_id, house_id, narrative, created_by)
         VALUES ($1,$2,'Levou o boletim para a casa e pediu ajuda na tarefa (fictício).',
                 app_current_user())`, [pessoa.person_id, AI3]);

      // Escrever em nome de outra pessoa: a policy recusa (§5.1).
      await expect(c.query(
        `INSERT INTO education_evolution (person_id, house_id, narrative, created_by)
         VALUES ($1,$2,'em nome de outro (fictício)',$3)`,
        [pessoa.person_id, AI3, outroUsuario])).rejects.toThrow(/row-level security/);
    });
  });

  it('o sistema não guarda senha de gov.br, INSS ou CTPS — nem disfarçada em observação', async () => {
    const { rows: colunas } = await admin.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='benefit_record'`);
    const nomes = colunas.map((c) => c.column_name);
    // Existe o registro de QUE há credencial e de quem responde por ela…
    expect(nomes).toContain('has_gov_access');
    expect(nomes).toContain('gov_access_holder');
    // …e não existe campo de senha em lugar nenhum.
    expect(nomes.filter((n) => /senha|password|passwd|pin/i.test(n))).toEqual([]);

    // E o campo de observação recusa o disfarce mais comum.
    const { rows: [pessoa] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]);
    await expect(admin.query(
      `INSERT INTO benefit_record (person_id, benefit_type, notes)
       VALUES ($1,'poupanca_social','senha: Exemplo@2013')`, [pessoa.person_id]))
      .rejects.toThrow(/ck_benefit_sem_senha/);

    // A planilha real também tem número do benefício, operação e pendência.
    for (const col of ['benefit_number', 'account_op', 'bank_pending', 'pending_note']) {
      expect(nomes).toContain(col);
    }
  });
});
