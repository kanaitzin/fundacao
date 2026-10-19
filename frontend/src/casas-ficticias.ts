/**
 * AS OITO CASAS DO PROTÓTIPO (fase 225, pedido de 19/10).
 *
 * "Construa já os espaços e equipes das 8 casas de forma fictícia." Até aqui o
 * servidor de mentira tinha UMA casa de verdade, a Casa 03; as outras sete eram
 * nome e número no painel, e quem entrava nelas via as crianças da Casa 03.
 *
 * Cada casa agora é uma cópia própria do servidor de mentira (`mock-casa.ts`),
 * criada na primeira vez que alguém entra nela, com o próprio estado: o que se
 * registra na Casa 01 fica na Casa 01. A cópia nasce da casa-modelo (a Casa 03)
 * e troca, dentro dos próprios dados, os nomes das crianças, das famílias e da
 * equipe pelos desta casa, e a semente das histórias do livro das ATAs.
 *
 * Os nomes e os códigos seguem a semente do sistema de verdade
 * (`AI1`–`AI4`, `ARM1`–`ARM4`, vinte vagas em cada, decisão de 28/08). Os
 * nomes reais das unidades são decisão da Fundação (§10, item 3). Endereços,
 * pessoas e telefones são todos inventados.
 *
 * Arquivo de dado puro, sem dependência: o `mock.ts` e o `mock-casa.ts` leem
 * daqui.
 */

export interface CasaFicticia {
  id: string;
  code: string;
  name: string;
  kind: 'abrigo_institucional' | 'casa_lar';
  /** Como a equipe chama a casa na conversa ("na Casa 01"). */
  apelido: string;
  endereco: string;
  telefone: string;
  capacidade: number;
}

export const CASAS_DA_FUNDACAO: CasaFicticia[] = [
  { id: 'casa-ai1', code: 'AI1', name: 'Abrigo Institucional 1', kind: 'abrigo_institucional', apelido: 'Casa 01',
    endereco: 'Rua das Acácias, 120, Partenon (endereço fictício)', telefone: '51 3000-0101', capacidade: 20 },
  { id: 'casa-ai2', code: 'AI2', name: 'Abrigo Institucional 2', kind: 'abrigo_institucional', apelido: 'Casa 02',
    endereco: 'Rua dos Ipês, 45, Glória (endereço fictício)', telefone: '51 3000-0102', capacidade: 20 },
  { id: 'casa-ai3', code: 'AI3', name: 'Casa 03 (piloto)', kind: 'abrigo_institucional', apelido: 'Casa 03',
    endereco: 'Rua das Hortênsias, 300, Santana (endereço fictício)', telefone: '51 3000-0103', capacidade: 20 },
  { id: 'casa-ai4', code: 'AI4', name: 'Abrigo Institucional 4', kind: 'abrigo_institucional', apelido: 'Casa 04',
    endereco: 'Avenida dos Jacarandás, 812, Teresópolis (endereço fictício)', telefone: '51 3000-0104', capacidade: 20 },
  { id: 'casa-arm1', code: 'ARM1', name: 'Casa-Lar ARM1', kind: 'casa_lar', apelido: 'Casa-Lar 1',
    endereco: 'Rua das Margaridas, 77, Menino Deus (endereço fictício)', telefone: '51 3000-0201', capacidade: 20 },
  { id: 'casa-arm2', code: 'ARM2', name: 'Casa-Lar ARM2', kind: 'casa_lar', apelido: 'Casa-Lar 2',
    endereco: 'Rua dos Girassóis, 19, Cristal (endereço fictício)', telefone: '51 3000-0202', capacidade: 20 },
  { id: 'casa-arm3', code: 'ARM3', name: 'Casa-Lar ARM3', kind: 'casa_lar', apelido: 'Casa-Lar 3',
    endereco: 'Rua das Violetas, 254, Medianeira (endereço fictício)', telefone: '51 3000-0203', capacidade: 20 },
  { id: 'casa-arm4', code: 'ARM4', name: 'Casa-Lar ARM4', kind: 'casa_lar', apelido: 'Casa-Lar 4',
    endereco: 'Rua das Camélias, 63, Petrópolis (endereço fictício)', telefone: '51 3000-0204', capacidade: 20 },
];

export const CASA_MODELO = 'casa-ai3';

/** Os nomes da casa-modelo que mudam de casa para casa. */
const MENINAS_DO_MODELO = ['Alice', 'Gabi', 'Helena', 'Lara', 'Nina', 'Sofia', 'Vitória', 'Yasmin'];
const MENINOS_DO_MODELO = ['Bruno', 'Caio', 'Davi', 'Enzo', 'Felipe', 'Igor', 'Kauã', 'Miguel',
  'Otávio', 'Pedro', 'Rafa', 'Théo'];

/**
 * A equipe da casa-modelo: o nome inteiro, o primeiro nome que aparece nos
 * relatos, o cargo e se a pessoa é mulher (para o nome novo e o "fictícia").
 * Quem é da instituição e não da casa (Enfermagem, Líder Noturno Geral,
 * Gestor, Coordenação Geral, Marcelo) não está aqui: é a mesma pessoa nas oito.
 */
const EQUIPE_DO_MODELO: { nome: string; curto: string; cargo: string; f: boolean }[] = [
  { nome: 'Carla Coordenadora (fictícia)', curto: 'Carla', cargo: 'coordenador', f: true },
  { nome: 'Cátia Coordenadora (fictícia)', curto: 'Cátia', cargo: 'coordenador', f: true },
  { nome: 'Tatiane Técnica (fictícia)', curto: 'Tatiane', cargo: 'equipe_tecnica', f: true },
  { nome: 'Sara Assistente Social (fictícia)', curto: 'Sara', cargo: 'equipe_tecnica', f: true },
  { nome: 'Paula Psicopedagoga (fictícia)', curto: 'Paula', cargo: 'equipe_tecnica', f: true },
  { nome: 'Lúcia Líder Diurna (fictícia)', curto: 'Lúcia', cargo: 'lider_diurno', f: true },
  { nome: 'Mário Silva (fictício)', curto: 'Mário', cargo: 'educador', f: false },
  { nome: 'Joana Lima (fictícia)', curto: 'Joana', cargo: 'educador', f: true },
  { nome: 'Tainá Souza (fictícia)', curto: 'Tainá', cargo: 'educador', f: true },
  { nome: 'Paulo da Portaria (fictício)', curto: 'Paulo', cargo: 'portaria', f: false },
  { nome: 'Cida da Cozinha (fictícia)', curto: 'Cida', cargo: 'cozinha', f: true },
];

/** As famílias da casa-modelo que aparecem por nome (contatos e visitas). */
const FAMILIAS_DO_MODELO = ['Rosângela', 'Simoni', 'Terezinha'];

/**
 * Quem completa a equipe de cada casa, além de quem já aparece nos registros
 * da casa-modelo: mais educadores, para o dia e para a noite. Uma casa de
 * vinte crianças tem perto de vinte pessoas na equipe (a simulação da fase 205
 * mediu a instituição assim).
 */
const CARGOS_DE_QUEM_COMPLETA = ['educador', 'educador', 'educador', 'educador', 'educador',
  'educador', 'educador', 'lider_diurno'];

const NOMES_DE_MENINA = ['Bianca', 'Clara', 'Duda', 'Elisa', 'Fernanda', 'Giovana', 'Heloísa',
  'Isadora', 'Júlia', 'Larissa', 'Manuela', 'Natália', 'Olívia', 'Paola', 'Rebeca', 'Sabrina',
  'Valentina', 'Bruna', 'Camila', 'Débora', 'Emanuelly', 'Flávia', 'Iara', 'Lívia', 'Melissa',
  'Nicole', 'Pietra', 'Raíssa', 'Stella', 'Thaís', 'Luana', 'Mirela', 'Cecília', 'Ágata',
  'Kiara', 'Milena', 'Jade', 'Laís', 'Bárbara', 'Esther'];
const NOMES_DE_MENINO = ['Arthur', 'Benício', 'Cauã', 'Diego', 'Eduardo', 'Gustavo', 'Henrique',
  'Ítalo', 'João', 'Kevin', 'Lucas', 'Mateus', 'Nícolas', 'Pablo', 'Ruan', 'Samuel', 'Vinícius',
  'Wesley', 'Yuri', 'Breno', 'César', 'Daniel', 'Emanuel', 'Guilherme', 'Heitor', 'Iago', 'Jonas',
  'Leonardo', 'Murilo', 'Natan', 'Patrick', 'Renan', 'Tales', 'Vitor', 'Bernardo', 'Cristian',
  'Danilo', 'Erick', 'Hugo', 'Joaquim', 'Kaique', 'Lorenzo', 'Ícaro', 'Wagner', 'Raul'];
const NOMES_DE_MULHER = ['Adriana', 'Beatriz', 'Cláudia', 'Daniela', 'Eliane', 'Fabiana', 'Gisele',
  'Hilda', 'Ivone', 'Jaqueline', 'Kátia', 'Luciana', 'Márcia', 'Neusa', 'Odete', 'Patrícia',
  'Regina', 'Sandra', 'Teresa', 'Vânia', 'Rosana', 'Silvana', 'Marlene', 'Denise', 'Elaine',
  'Fátima', 'Glória', 'Inês', 'Jussara', 'Lourdes', 'Mônica', 'Nádia', 'Priscila',
  'Rita', 'Simone', 'Vera', 'Andreia', 'Cristina', 'Eva', 'Leda', 'Noemi', 'Sueli', 'Tânia'];
const NOMES_DE_HOMEM = ['Alexandre', 'Carlos', 'Douglas', 'Everton', 'Fernando', 'Gilson', 'Jorge',
  'Luís', 'Maurício', 'Nelson', 'Osvaldo', 'Rodrigo', 'Sílvio', 'Valter', 'Adilson', 'Cleber',
  'Edson', 'Fábio', 'Gérson', 'Ivan', 'Júlio', 'Leandro', 'Moacir', 'Roberto', 'Sandro', 'Wilson'];
const SOBRENOMES = ['Andrade', 'Barros', 'Campos', 'Dorneles', 'Escobar', 'Fagundes', 'Garcia',
  'Huber', 'Jardim', 'Kunz', 'Lemos', 'Machado', 'Nogueira', 'Oliveira', 'Pacheco', 'Quadros',
  'Rocha', 'Saldanha', 'Teixeira', 'Ventura', 'Weber', 'Xavier', 'Zanella', 'Borges', 'Cunha',
  'Duarte', 'Farias', 'Goulart', 'Lopes', 'Medeiros', 'Pereira', 'Ramos', 'Silveira', 'Vargas'];
const FAMILIA_MULHER = ['Marlene', 'Josiane', 'Cleonice', 'Rosemeri', 'Elisete', 'Ivanete', 'Zuleica',
  'Neiva', 'Sirlei', 'Dalva', 'Loiva', 'Lenir', 'Iolanda', 'Maristela', 'Nair', 'Vilma', 'Zélia',
  'Odila', 'Celoí', 'Irene', 'Jandira'];

/** Sorteio com semente: a mesma casa tem sempre as mesmas pessoas. */
function sorteio(semente: string) {
  let h = 2166136261;
  for (const ch of semente) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let x = h >>> 0;
  return () => {
    x = (x + 0x6D2B79F5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function embaralhar<T>(xs: readonly T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface PessoaDaEquipe { id: string; nome: string; cargo: string }

export interface ConfigDaCasa {
  casa: CasaFicticia;
  /** Vazia na casa-modelo: o livro das ATAs dela continua contando o que contava. */
  semente: string;
  /** Pares [o nome da casa-modelo, o desta casa], do mais longo para o mais curto. */
  trocas: [string, string][];
  /** Quem completa a equipe desta casa, além de quem aparece nos registros. */
  equipeQueCompleta: PessoaDaEquipe[];
  /** Os nomes de menina desta casa, para o gênero dos retratos e das frases. */
  meninas: string[];
}

function nomeDeEquipe(r: () => number, mulher: boolean, usados: Set<string>) {
  for (;;) {
    const primeiro = embaralhar(mulher ? NOMES_DE_MULHER : NOMES_DE_HOMEM, r)[0];
    const sobrenome = embaralhar(SOBRENOMES, r)[0];
    const nome = `${primeiro} ${sobrenome} (${mulher ? 'fictícia' : 'fictício'})`;
    if (!usados.has(primeiro)) { usados.add(primeiro); return { nome, curto: primeiro }; }
  }
}

const CACHE = new Map<string, ConfigDaCasa>();

export function configDaCasa(id: string): ConfigDaCasa {
  const ja = CACHE.get(id);
  if (ja) return ja;
  const casa = CASAS_DA_FUNDACAO.find((c) => c.id === id) ?? CASAS_DA_FUNDACAO.find((c) => c.id === CASA_MODELO)!;
  const modelo = casa.id === CASA_MODELO;
  const r = sorteio(`rede-acolher|${casa.code}`);
  const trocas: [string, string][] = [];
  const usados = new Set<string>();
  let meninas = MENINAS_DO_MODELO;

  if (!modelo) {
    const novasMeninas = embaralhar(NOMES_DE_MENINA, r).slice(0, MENINAS_DO_MODELO.length);
    const novosMeninos = embaralhar(NOMES_DE_MENINO, r).slice(0, MENINOS_DO_MODELO.length);
    MENINAS_DO_MODELO.forEach((n, i) => trocas.push([n, novasMeninas[i]]));
    MENINOS_DO_MODELO.forEach((n, i) => trocas.push([n, novosMeninos[i]]));
    meninas = novasMeninas;
    for (const p of EQUIPE_DO_MODELO) {
      const novo = nomeDeEquipe(r, p.f, usados);
      trocas.push([p.nome, novo.nome], [p.curto, novo.curto]);
    }
    const familias = embaralhar(FAMILIA_MULHER, r);
    FAMILIAS_DO_MODELO.forEach((n, i) => trocas.push([n, familias[i]]));
    trocas.push(['Casa 03 (piloto)', casa.name], ['Casa 03', casa.apelido], ['AI3', casa.code]);
  } else {
    EQUIPE_DO_MODELO.forEach((p) => usados.add(p.curto));
  }

  const equipeQueCompleta = CARGOS_DE_QUEM_COMPLETA.map((cargo, i) => {
    const novo = nomeDeEquipe(r, r() < 0.7, usados);
    return { id: `eq-${casa.code.toLowerCase()}-${i + 1}`, nome: novo.nome, cargo };
  });

  trocas.sort((a, b) => b[0].length - a[0].length);
  const cfg = { casa, semente: modelo ? '' : `${casa.code}|`, trocas, equipeQueCompleta, meninas };
  CACHE.set(id, cfg);
  return cfg;
}

/**
 * A troca de nomes, numa passada só: "Alice" vira "Bianca" sem que "Bianca"
 * vire outra coisa depois. Só a palavra inteira, com acento, e respeitando a
 * maiúscula: "caio" (do verbo) não é o Caio.
 */
export function trocadorDeNomes(trocas: [string, string][]): (s: string) => string {
  if (!trocas.length) return (s) => s;
  const para = new Map(trocas);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${trocas.map(([de]) => esc(de)).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  return (s) => (s.length < 2 ? s : s.replace(re, (m) => para.get(m) ?? m));
}
