/**
 * Seed da Fase 2 — 20 acolhidos FICTÍCIOS na Casa 03 (§29).
 *
 * Nomes, CPFs e histórias são inventados. Os CPFs têm dígitos verificadores
 * válidos apenas para exercitar a validação; são gerados a partir de um
 * prefixo reservado e não correspondem a pessoas reais.
 * NUNCA usar histórias reais em desenvolvimento (§3.3).
 */
import { Client } from 'pg';

/** Gera CPF sinteticamente válido a partir de um índice determinístico. */
function cpfFicticio(i: number): string {
  const base = String(90000000000 + i * 137).slice(0, 9); // prefixo fictício estável
  const dv = (b: string, len: number) => {
    let sum = 0;
    for (let k = 0; k < len; k++) sum += Number(b[k]) * (len + 1 - k);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base, 9);
  const d2 = dv(base + d1, 10);
  return `${base}${d1}${d2}`;
}

const ACOLHIDOS = [
  { nome: 'Alice Ribeiro (fictícia)', social: 'Alice', anos: 7, escola: 'EMEF Vila Nova', turno: 'manhã', serie: '2º ano',
    alergia: { desc: 'Amendoim e derivados', grav: 'grave' }, restricao: { evitar: 'Amendoim, pasta de amendoim, doces com traços', subst: 'Sobremesa de frutas' } },
  { nome: 'Bruno Santos (fictício)', social: 'Bruno', anos: 9, escola: 'EMEF Vila Nova', turno: 'manhã', serie: '4º ano' },
  { nome: 'Caio Martins (fictício)', social: 'Caio', anos: 11, escola: 'EMEF Vila Nova', turno: 'tarde', serie: '6º ano' },
  { nome: 'Davi Lima (fictício)', social: 'Davi', anos: 8, escola: 'EMEF Vila Nova', turno: 'manhã', serie: '3º ano',
    alergia: { desc: 'Intolerância à lactose', grav: 'moderada' }, restricao: { evitar: 'Leite e derivados', subst: 'Bebida vegetal sem lactose' } },
  { nome: 'Enzo Pereira (fictício)', social: 'Enzo', anos: 13, escola: 'EMEF Padre Cacique', turno: 'tarde', serie: '8º ano' },
  { nome: 'Felipe Almeida (fictício)', social: 'Felipe', anos: 15, escola: 'EEEM Centro', turno: 'manhã', serie: '1º ano EM' },
  { nome: 'Gabriela Teixeira (fictícia)', social: 'Gabi', anos: 12, escola: 'EMEF Padre Cacique', turno: 'tarde', serie: '7º ano' },
  { nome: 'Helena Cardoso (fictícia)', social: 'Helena', anos: 6, escola: 'EMEI Jardim', turno: 'tarde', serie: 'Pré II',
    restricao: { evitar: 'Alimentos de textura dura', subst: 'Textura pastosa conforme orientação fonoaudiológica' },
    cuidado: 'Acompanhamento fonoaudiológico semanal; oferecer água em intervalos regulares.' },
  { nome: 'Igor Ferreira (fictício)', social: 'Igor', anos: 14, escola: 'EEEM Centro', turno: 'manhã', serie: '9º ano' },
  { nome: 'João Vieira (fictício)', social: 'João', anos: 10, escola: 'EMEF Vila Nova', turno: 'tarde', serie: '5º ano' },
  { nome: 'Kauã Barbosa (fictício)', social: 'Kauã', anos: 16, escola: 'EEEM Centro', turno: 'noite', serie: '2º ano EM' },
  { nome: 'Lara Nunes (fictícia)', social: 'Lara', anos: 9, escola: 'EMEF Vila Nova', turno: 'manhã', serie: '4º ano',
    alergia: { desc: 'Dipirona', grav: 'grave' } },
  { nome: 'Miguel Duarte (fictício)', social: 'Miguel', anos: 12, escola: 'EMEF Padre Cacique', turno: 'tarde', serie: '7º ano' },
  { nome: 'Nina Oliveira (fictícia)', social: 'Nina', anos: 7, escola: 'EMEF Vila Nova', turno: 'manhã', serie: '2º ano' },
  { nome: 'Otávio Gomes (fictício)', social: 'Otávio', anos: 17, escola: 'Curso técnico em informática', turno: 'noite', serie: 'Módulo II' },
  { nome: 'Pedro Henrique Souza (fictício)', social: 'Pedro', anos: 11, escola: 'EMEF Vila Nova', turno: 'tarde', serie: '6º ano',
    alergia: { desc: 'Picada de abelha', grav: 'grave' },
    cuidado: 'Fisioterapia às terças, 15h. Levar relatório da última sessão.' },
  { nome: 'Rafaela Queiroz (fictícia)', social: 'Rafa', anos: 13, escola: 'EMEF Padre Cacique', turno: 'tarde', serie: '8º ano' },
  { nome: 'Sofia Jardim (fictícia)', social: 'Sofia', anos: 8, escola: 'EMEF Vila Nova', turno: 'manhã', serie: '3º ano',
    condicao: { desc: 'Diabetes tipo 1', grav: 'grave' }, restricao: { evitar: 'Açúcar e doces', subst: 'Sobremesa sem açúcar conforme orientação' } },
  { nome: 'Theo Wagner (fictício)', social: 'Theo', anos: 10, escola: 'EMEF Vila Nova', turno: 'tarde', serie: '5º ano' },
  { nome: 'Yasmin Klein (fictícia)', social: 'Yasmin', anos: 15, escola: 'EEEM Centro', turno: 'manhã', serie: '1º ano EM' },
];

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
  const c = new Client({ connectionString: url });
  await c.connect();

  const { rows: [inst] } = await c.query(`SELECT id FROM institution LIMIT 1`);
  const { rows: [casa] } = await c.query(`SELECT id FROM house WHERE code = 'AI3'`);
  const { rows: [tecnica] } = await c.query(`SELECT id FROM app_user WHERE email = 'tecnica.ai3@paodospobres.dev'`);
  const { rows: [coord] } = await c.query(`SELECT id FROM app_user WHERE email = 'coord.ai3@paodospobres.dev'`);

  const { rows: [{ n }] } = await c.query(`SELECT count(*)::int AS n FROM person`);
  if (n > 0) { console.log(`Seed da Fase 2 já aplicado (${n} pessoas). Nada a fazer.`); await c.end(); return; }

  const hoje = new Date();
  for (let i = 0; i < ACOLHIDOS.length; i++) {
    const a = ACOLHIDOS[i];
    const nascimento = new Date(hoje.getFullYear() - a.anos, (i * 5) % 12, ((i * 7) % 27) + 1)
      .toISOString().slice(0, 10);

    const { rows: [p] } = await c.query(
      `INSERT INTO person (institution_id, cpf, full_name, social_name, birth_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [inst.id, cpfFicticio(i + 1), a.nome, a.social, nascimento, tecnica.id]);

    const { rows: [ep] } = await c.query(
      `INSERT INTO care_episode (person_id, institution_id, number, started_at, created_by)
       VALUES ($1,$2,1, now() - ($3 || ' days')::interval, $4) RETURNING id`,
      [p.id, inst.id, 60 + i * 11, tecnica.id]);

    await c.query(
      `INSERT INTO house_stay (episode_id, person_id, house_id, started_at, created_by)
       VALUES ($1,$2,$3, now() - ($4 || ' days')::interval, $5)`,
      [ep.id, p.id, casa.id, 60 + i * 11, tecnica.id]);

    await c.query(
      `INSERT INTO profile_detail (person_id, essential_care, school_name, school_grade, school_shift, school_address, reference_team, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [p.id, a.cuidado ?? null, a.escola, a.serie, a.turno,
       'Rua Fictícia, 100 — Porto Alegre/RS', 'Equipe técnica Casa 03', tecnica.id]);

    if (a.alergia) {
      await c.query(
        `INSERT INTO health_condition (person_id, kind, description, severity, essential_alert, source, created_by)
         VALUES ($1,'alergia',$2,$3,true,'Relatório médico (fictício)',$4)`,
        [p.id, a.alergia.desc, a.alergia.grav, tecnica.id]);
    }
    if ((a as any).condicao) {
      const cond = (a as any).condicao;
      await c.query(
        `INSERT INTO health_condition (person_id, kind, description, severity, essential_alert, source, created_by)
         VALUES ($1,'condicao',$2,$3,true,'Acompanhamento endocrinológico (fictício)',$4)`,
        [p.id, cond.desc, cond.grav, tecnica.id]);
    }
    if (a.restricao) {
      await c.query(
        `INSERT INTO food_restriction (person_id, restriction, substitution, guidance, source, review_on, created_by)
         VALUES ($1,$2,$3,'Conferir rótulos antes de servir.','Orientação nutricional (fictícia)', current_date + 180, $4)`,
        [p.id, a.restricao.evitar, a.restricao.subst, tecnica.id]);
    }

    // Documentos: um de cada categoria para exercitar as permissões
    for (const [cat, titulo] of [
      ['saude', 'Receita em vigência'],
      ['escolar', 'Boletim do semestre'],
      ['pessoal', 'Certidão de nascimento'],
      ['judicial_socioassistencial', 'Guia de acolhimento'],
    ] as const) {
      const { rows: [d] } = await c.query(
        `INSERT INTO document (person_id, category, title, issued_on, source, created_by)
         VALUES ($1,$2,$3, current_date - 30, 'Documento fictício', $4) RETURNING id`,
        [p.id, cat, titulo, tecnica.id]);
      await c.query(
        `INSERT INTO document_version (document_id, version, storage_key, created_by)
         VALUES ($1, 1, $2, $3)`, [d.id, `dev/ficticio/${d.id}.pdf`, tecnica.id]);
    }

    // Benefícios só para os maiores (área restrita)
    if (a.anos >= 15) {
      await c.query(
        `INSERT INTO benefit_record (person_id, benefit_type, bank_name, agency, account, created_by, updated_by)
         VALUES ($1,'Poupança institucional (fictícia)','Banco Fictício','0000','00000-0',$2,$2)`,
        [p.id, coord.id]);
    }

    // Memórias autorizadas
    await c.query(
      `INSERT INTO memory_record (person_id, event_type, happened_on, description, created_by)
       VALUES ($1,'aniversário', current_date - 45, 'Comemoração na casa com bolo escolhido pelo grupo.', $2)`,
      [p.id, tecnica.id]);
  }

  // Um perfil no Acervo Histórico, para exercitar o retorno (§15.3)
  const { rows: [ex] } = await c.query(
    `INSERT INTO person (institution_id, cpf, full_name, social_name, birth_date, created_by)
     VALUES ($1,$2,'Vitória Antunes (fictícia)','Vitória', current_date - interval '14 years', $3) RETURNING id`,
    [inst.id, cpfFicticio(90), tecnica.id]);
  const { rows: [exEp] } = await c.query(
    `INSERT INTO care_episode (person_id, institution_id, number, started_at, ended_at, end_reason, status, created_by)
     VALUES ($1,$2,1, now() - interval '400 days', now() - interval '120 days', 'reintegração familiar', 'encerrado', $3)
     RETURNING id`, [ex.id, inst.id, tecnica.id]);
  await c.query(
    `INSERT INTO house_stay (episode_id, person_id, house_id, started_at, ended_at, end_reason, status, created_by)
     VALUES ($1,$2,$3, now() - interval '400 days', now() - interval '120 days', 'encerramento_episodio', 'encerrada', $4)`,
    [exEp.id, ex.id, casa.id, tecnica.id]);

  // Um acolhido ativo em OUTRA casa, para exercitar "ativo_outra_casa"
  const { rows: [casa4] } = await c.query(`SELECT id FROM house WHERE code = 'AI4'`);
  const { rows: [outro] } = await c.query(
    `INSERT INTO person (institution_id, cpf, full_name, social_name, birth_date, created_by)
     VALUES ($1,$2,'Lucas Prado (fictício)','Lucas', current_date - interval '12 years', $3) RETURNING id`,
    [inst.id, cpfFicticio(91), tecnica.id]);
  const { rows: [outroEp] } = await c.query(
    `INSERT INTO care_episode (person_id, institution_id, number, created_by) VALUES ($1,$2,1,$3) RETURNING id`,
    [outro.id, inst.id, tecnica.id]);
  await c.query(
    `INSERT INTO house_stay (episode_id, person_id, house_id, created_by) VALUES ($1,$2,$3,$4)`,
    [outroEp.id, outro.id, casa4.id, tecnica.id]);

  await c.end();
  console.log('Seed da Fase 2 concluído:');
  console.log(`  20 acolhidos fictícios ativos na Casa 03 (AI3)`);
  console.log(`  1 perfil no Acervo Histórico (retorno): CPF ${cpfFicticio(90)}`);
  console.log(`  1 acolhido ativo na AI4 (transferência): CPF ${cpfFicticio(91)}`);
  console.log(`  CPF do 1º acolhido: ${cpfFicticio(1)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
