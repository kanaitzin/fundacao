/**
 * Seed de DESENVOLVIMENTO — dados 100% fictícios (§29).
 * Cria a instituição, as 8 casas e usuários por papel.
 * Nunca usar dados reais em desenvolvimento/teste (§3.3).
 */
import { Client } from 'pg';
import { hashPassword } from '../src/kernel/common/crypto';

const SENHA_DEV = 'senha-dev-123'; // troca obrigatória no primeiro login (must_change_password)

const CASAS = [
  { code: 'AI1', name: 'Abrigo Institucional 1', kind: 'abrigo_institucional' },
  { code: 'AI2', name: 'Abrigo Institucional 2', kind: 'abrigo_institucional' },
  { code: 'AI3', name: 'Casa 03 (piloto)', kind: 'abrigo_institucional' },
  { code: 'AI4', name: 'Abrigo Institucional 4', kind: 'abrigo_institucional' },
  { code: 'ARM1', name: 'Casa-Lar ARM1', kind: 'casa_lar' },
  { code: 'ARM2', name: 'Casa-Lar ARM2', kind: 'casa_lar' },
  { code: 'ARM3', name: 'Casa-Lar ARM3', kind: 'casa_lar' },
  { code: 'ARM4', name: 'Casa-Lar ARM4', kind: 'casa_lar' },
];

// (email, nome, papel, casa) — casa null = transversal
const USUARIOS: Array<[string, string, string, string | null]> = [
  ['gestor@paodospobres.dev', 'Gustavo Gestor (fictício)', 'gestor_geral', null],
  ['enfermagem@paodospobres.dev', 'Tainá Souza (fictícia)', 'enfermagem', null],
  ['lider.noturno@paodospobres.dev', 'Nélio Noturno (fictício)', 'lider_noturno_geral', null],
  ['coord.ai3@paodospobres.dev', 'Carla Coordenadora (fictícia)', 'coordenador', 'AI3'],
  ['tecnica.ai3@paodospobres.dev', 'Tatiane Técnica (fictícia)', 'equipe_tecnica', 'AI3'],
  ['educador.ai3@paodospobres.dev', 'Mário Silva (fictício)', 'educador', 'AI3'],
  // Um segundo educador na casa piloto não é enfeite do seed: sem um par, não
  // há como PROVAR que ninguém assina a passagem do outro (§26.2 #18) nem que
  // o colega não lê a narrativa pessoal (§26.2 #11).
  ['educador2.ai3@paodospobres.dev', 'Joana Lima (fictícia)', 'educador', 'AI3'],
  ['lider.ai3@paodospobres.dev', 'Lúcia Líder Diurna (fictícia)', 'lider_diurno', 'AI3'],
  ['educador.ai4@paodospobres.dev', 'Paula Rocha (fictícia)', 'educador', 'AI4'],
  ['coord.ai4@paodospobres.dev', 'Cátia Coordenadora (fictícia)', 'coordenador', 'AI4'],
];

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@localhost:5432/rede_acolher';
  const c = new Client({ connectionString: url });
  await c.connect();

  const { rows: [inst] } = await c.query(
    `INSERT INTO institution (name) VALUES ('Fundação O Pão dos Pobres (dev)')
     ON CONFLICT DO NOTHING RETURNING id`);
  const instId = inst?.id ?? (await c.query(`SELECT id FROM institution LIMIT 1`)).rows[0].id;

  const houseIds: Record<string, string> = {};
  for (const h of CASAS) {
    const { rows: [row] } = await c.query(
      `INSERT INTO house (institution_id, code, name, kind) VALUES ($1,$2,$3,$4)
       ON CONFLICT (institution_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [instId, h.code, h.name, h.kind]);
    houseIds[h.code] = row.id;
  }

  const hash = await hashPassword(SENHA_DEV);
  for (const [email, nome, role, casa] of USUARIOS) {
    const { rows: [u] } = await c.query(
      `INSERT INTO app_user (institution_id, email, full_name, password_hash, role)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role RETURNING id`,
      [instId, email, nome, hash, role]);
    if (casa) {
      await c.query(
        `INSERT INTO user_house_assignment (user_id, house_id, role)
         SELECT $1, $2, $3
         WHERE NOT EXISTS (SELECT 1 FROM user_house_assignment
                           WHERE user_id = $1 AND house_id = $2 AND valid_to IS NULL)`,
        [u.id, houseIds[casa], role]);
    }
  }

  await c.end();
  console.log(`Seed concluído. Usuários fictícios criados com a senha: ${SENHA_DEV}`);
  console.log(USUARIOS.map(([e, , r, h]) => `  ${e} — ${r}${h ? ' @ ' + h : ''}`).join('\n'));
}
main().catch((e) => { console.error(e); process.exit(1); });
