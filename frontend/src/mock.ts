/**
 * O SERVIDOR DE MENTIRA — só para o protótipo navegável.
 *
 * O protótipo antigo era um arquivo à parte, escrito à mão, com as telas
 * desenhadas duas vezes: uma em React, outra em HTML solto. Duas versões da
 * mesma tela divergem — e divergiram: o protótipo mostrava coisas que o app
 * não fazia, e o app ganhou telas que o protótipo não tinha.
 *
 * Aqui o protótipo é o APLICATIVO DE VERDADE, com as mesmas telas, o mesmo
 * CSS e o mesmo código; o que muda é só de onde vêm os dados. Este arquivo
 * responde no lugar do servidor, com dados **inteiramente fictícios** (§3.3),
 * em memória: o que for digitado dura enquanto a página estiver aberta e some
 * quando ela fechar. Nada é gravado em lugar nenhum.
 *
 * O que ele NÃO faz, e é bom que não faça: isolamento por casa, Row-Level
 * Security, auditoria, criptografia. Essas proteções vivem no banco de dados,
 * e é lá que elas têm de ser conferidas — um protótipo que fingisse tê-las
 * daria uma sensação de segurança que ele não tem como sustentar.
 */

const HOJE = new Intl.DateTimeFormat('en-CA',
  { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date());

/**
 * Um horário de hoje, na hora de Porto Alegre.
 *
 * A primeira versão montava a data e depois chamava `setHours`, que usa o
 * fuso de QUEM ABRE a página. O plantão das 7h aparecia como 04:00 num
 * navegador em UTC. O horário aqui é sempre o da instituição, escrito no
 * próprio texto da data.
 */
const emHoras = (h: number, m = 0) =>
  new Date(`${HOJE}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`)
    .toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- pessoas

const CASA = { id: 'casa-ai3', code: 'AI3', name: 'Casa 03 (piloto)', kind: 'abrigo_institucional' };
const CASAS = [
  CASA,
  { id: 'casa-ai1', code: 'AI1', name: 'Abrigo Institucional 1', kind: 'abrigo_institucional' },
  { id: 'casa-ai2', code: 'AI2', name: 'Abrigo Institucional 2', kind: 'abrigo_institucional' },
  { id: 'casa-ai4', code: 'AI4', name: 'Abrigo Institucional 4', kind: 'abrigo_institucional' },
  { id: 'casa-arm1', code: 'ARM1', name: 'Casa-Lar ARM1', kind: 'casa_lar' },
  { id: 'casa-arm2', code: 'ARM2', name: 'Casa-Lar ARM2', kind: 'casa_lar' },
  { id: 'casa-arm3', code: 'ARM3', name: 'Casa-Lar ARM3', kind: 'casa_lar' },
  { id: 'casa-arm4', code: 'ARM4', name: 'Casa-Lar ARM4', kind: 'casa_lar' },
];

interface Kid {
  id: string; nome: string; civil: string; idade: number; nascimento: string;
  alerta?: { tipo: string; descricao: string; gravidade: string };
  restricao?: { restriction: string; substitution: string; guidance: string };
  cuidado?: string; serie: string; turno: string;
  semCpf?: boolean; provisorio?: string;
  judicial?: Record<string, string>;
}

const KIDS: Kid[] = [
  { id: 'p01', nome: 'Alice', civil: 'Alice Ribeiro (fictícia)', idade: 7, nascimento: '2019-03-14',
    alerta: { tipo: 'alergia', descricao: 'Alergia a Amendoim e derivados', gravidade: 'grave' },
    restricao: { restriction: 'Amendoim, pasta de amendoim, doces com traços',
                 substitution: 'Sobremesa de frutas', guidance: 'Conferir rótulos antes de servir.' },
    cuidado: 'Usa inalador em crise; a bombinha fica na sala da técnica.',
    serie: '2º ano', turno: 'manhã' },
  { id: 'p02', nome: 'Bruno', civil: 'Bruno Santos (fictício)', idade: 9, nascimento: '2017-01-22',
    serie: '4º ano', turno: 'manhã' },
  { id: 'p03', nome: 'Caio', civil: 'Caio Martins (fictício)', idade: 11, nascimento: '2015-07-02',
    serie: '6º ano', turno: 'tarde' },
  { id: 'p04', nome: 'Davi', civil: 'Davi Lima (fictício)', idade: 8, nascimento: '2018-05-27',
    alerta: { tipo: 'intolerancia', descricao: 'Intolerância à lactose', gravidade: 'moderada' },
    restricao: { restriction: 'Leite e derivados', substitution: 'Bebida vegetal sem lactose',
                 guidance: 'Conferir rótulos antes de servir.' },
    serie: '3º ano', turno: 'manhã' },
  { id: 'p05', nome: 'Enzo', civil: 'Enzo Farias (fictício)', idade: 13, nascimento: '2013-02-09',
    serie: '8º ano', turno: 'manhã' },
  { id: 'p06', nome: 'Felipe', civil: 'Felipe Rocha (fictício)', idade: 10, nascimento: '2016-04-30',
    serie: '5º ano', turno: 'tarde' },
  { id: 'p07', nome: 'Gabi', civil: 'Gabriela Nunes (fictícia)', idade: 12, nascimento: '2014-09-18',
    serie: '7º ano', turno: 'manhã' },
  { id: 'p08', nome: 'Helena', civil: 'Helena Prado (fictícia)', idade: 6, nascimento: '2020-06-05',
    serie: '1º ano', turno: 'manhã' },
  { id: 'p09', nome: 'Igor', civil: 'Igor Bastos (fictício)', idade: 15, nascimento: '2011-11-11',
    serie: '9º ano', turno: 'manhã' },
  { id: 'p10', nome: 'Kauã', civil: 'Kauã Teixeira (fictício)', idade: 16, nascimento: '2010-08-23',
    serie: '1º ano médio', turno: 'manhã' },
  { id: 'p11', nome: 'Lara', civil: 'Lara Moreira (fictícia)', idade: 9, nascimento: '2017-08-24',
    alerta: { tipo: 'alergia', descricao: 'Alergia a Dipirona', gravidade: 'grave' },
    cuidado: 'Nunca administrar dipirona. Em dor ou febre, acionar a Enfermagem.',
    serie: '4º ano', turno: 'manhã',
    judicial: { motivo: 'Negligência', detalhe: 'Determinação por negligência reiterada (fictício).',
                medida: 'Acolhimento institucional', orgao: 'Vara da Infância e Juventude',
                vara: '1ª Vara da Infância (fictícia)', processo: '0000000-00.2026.8.21.0001',
                guia: 'GA-2026-0007', guiaEm: '2026-02-25' } },
  { id: 'p12', nome: 'Miguel', civil: 'Miguel Antunes (fictício)', idade: 12, nascimento: '2014-01-07',
    serie: '7º ano', turno: 'tarde' },
  { id: 'p13', nome: 'Nina', civil: 'Nina Cardoso (fictícia)', idade: 7, nascimento: '2019-10-02',
    serie: '2º ano', turno: 'manhã' },
  { id: 'p14', nome: 'Otávio', civil: 'Otávio Ramos (fictício)', idade: 16, nascimento: '2010-03-19',
    serie: '1º ano médio', turno: 'noite' },
  { id: 'p15', nome: 'Pedro', civil: 'Pedro Vasques (fictício)', idade: 11, nascimento: '2015-12-01',
    alerta: { tipo: 'condicao', descricao: 'Diabetes tipo 1', gravidade: 'grave' },
    cuidado: 'Glicemia antes das refeições; lanche extra às 15h.',
    serie: '6º ano', turno: 'manhã' },
  { id: 'p16', nome: 'Rafa', civil: 'Rafael Duarte (fictício)', idade: 12, nascimento: '2014-05-16',
    serie: '7º ano', turno: 'tarde' },
  { id: 'p17', nome: 'Sofia', civil: 'Sofia Almeida (fictícia)', idade: 8, nascimento: '2018-02-28',
    alerta: { tipo: 'alergia', descricao: 'Alergia a Picada de abelha', gravidade: 'grave' },
    restricao: { restriction: 'Mel e derivados', substitution: 'Geleia de frutas',
                 guidance: 'Conferir rótulos antes de servir.' },
    serie: '3º ano', turno: 'manhã' },
  { id: 'p18', nome: 'Vitória', civil: 'Vitória Lopes (fictícia)', idade: 14, nascimento: '2012-07-21',
    serie: '9º ano', turno: 'manhã' },
  { id: 'p19', nome: 'Yasmin', civil: 'Yasmin Correia (fictícia)', idade: 14, nascimento: '2012-04-04',
    serie: '9º ano', turno: 'manhã' },
  { id: 'p20', nome: 'Théo', civil: 'Théo Barbosa (fictício)', idade: 10,
    nascimento: '2016-09-09', serie: '5º ano', turno: 'tarde' },
];

// ---------------------------------------------------------------- pessoas do sistema

const USUARIOS: Record<string, { id: string; fullName: string; role: string; senha: string }> = {
  'educador.ai3@paodospobres.dev': { id: 'u1', fullName: 'Mário Silva (fictício)', role: 'educador', senha: 'senha-dev-123' },
  'lider.ai3@paodospobres.dev': { id: 'u2', fullName: 'Lúcia Líder Diurna (fictícia)', role: 'lider_diurno', senha: 'senha-dev-123' },
  'tecnica.ai3@paodospobres.dev': { id: 'u3', fullName: 'Tatiane Técnica (fictícia)', role: 'equipe_tecnica', senha: 'senha-dev-123' },
  'coord.ai3@paodospobres.dev': { id: 'u4', fullName: 'Carla Coordenadora (fictícia)', role: 'coordenador', senha: 'senha-dev-123' },
  'enfermagem@paodospobres.dev': { id: 'u5', fullName: 'Enfermeira Fictícia', role: 'enfermagem', senha: 'senha-dev-123' },
};
const EQUIPE_CASA = [
  { id: 'u1', nome: 'Mário Silva (fictício)', cargo: 'educador' },
  { id: 'u6', nome: 'Joana Lima (fictícia)', cargo: 'educador' },
  { id: 'u7', nome: 'Tainá Souza (fictícia)', cargo: 'educador' },
  { id: 'u2', nome: 'Lúcia Líder Diurna (fictícia)', cargo: 'lider_diurno' },
  { id: 'u3', nome: 'Tatiane Técnica (fictícia)', cargo: 'equipe_tecnica' },
  { id: 'u4', nome: 'Carla Coordenadora (fictícia)', cargo: 'coordenador' },
];

let eu = USUARIOS['educador.ai3@paodospobres.dev'];

// ---------------------------------------------------------------- estado vivo

interface Ev {
  id: string; source: string; at: string; kind: string; title: string;
  personId: string | null; personName: string | null; state: string;
  severity: 'normal' | 'atencao' | 'critico'; responsible?: string | null; note?: string | null;
  actions?: { command: string; label: string }[];
}

const acoes = (e: Ev) => (['Concluída no horário', 'Concluída com atraso', 'Reagendada',
  'Cancelada externamente', 'Recusada pelo acolhido', 'Não realizada — saúde',
  'Não realizada — ausência profissional', 'Não realizada — transporte',
  'Não realizada — decisão institucional', 'Não aplicável'].includes(e.state)
  ? [] : [{ command: 'activity.record', label: 'Registrar' }]);

let LINHA: Ev[] = [
  { id: 'activity:a1', source: 'rotina', at: emHoras(7, 0), kind: 'rotina', title: 'Despertar e higiene',
    personId: null, personName: null, state: 'Concluída no horário', severity: 'normal' },
  { id: 'activity:a2', source: 'rotina', at: emHoras(7, 30), kind: 'refeicao', title: 'Café da manhã',
    personId: null, personName: null, state: 'Concluída no horário', severity: 'normal' },
  { id: 'medication:m1', source: 'medicamento', at: emHoras(7, 30), kind: 'medicamento',
    title: 'Colírio lubrificante (fictício) — 1 gota em cada olho', personId: 'p11', personName: 'Lara',
    state: 'Aguardando confirmação', severity: 'atencao' },
  { id: 'activity:a3', source: 'rotina', at: emHoras(8, 0), kind: 'saida', title: 'Saída para a escola',
    personId: null, personName: null, state: 'Concluída no horário', severity: 'normal' },
  { id: 'activity:a4', source: 'agenda', at: emHoras(11, 30), kind: 'refeicao', title: 'Almoço',
    personId: null, personName: null, state: 'Concluída no horário', severity: 'normal' },
  { id: 'activity:a5', source: 'agenda', at: emHoras(15, 0), kind: 'saida',
    title: 'Fonoaudiologia — Clínica Fictícia', personId: 'p11', personName: 'Lara',
    state: 'Agendada', severity: 'normal', responsible: 'Mário Silva (fictício)',
    actions: [{ command: 'activity.acknowledge', label: 'Estou ciente' },
              { command: 'activity.record', label: 'Registrar' }] },
  { id: 'activity:a6', source: 'agenda', at: emHoras(16, 0), kind: 'atividade',
    title: 'Reforço escolar', personId: null, personName: null, state: 'Agendada',
    severity: 'normal', actions: [{ command: 'activity.record', label: 'Registrar' }] },
  { id: 'medication:m2', source: 'medicamento', at: emHoras(16, 0), kind: 'medicamento',
    title: 'Amoxicilina (fictícia) 250 mg/5 mL — 5 mL', personId: 'p02', personName: 'Bruno',
    state: 'Aguardando confirmação', severity: 'critico' },
  { id: 'activity:a7', source: 'rotina', at: emHoras(18, 30), kind: 'refeicao', title: 'Janta',
    personId: null, personName: null, state: 'Agendada', severity: 'normal',
    actions: [{ command: 'activity.record', label: 'Registrar' }] },
  { id: 'activity:a8', source: 'rotina', at: emHoras(20, 30), kind: 'rotina', title: 'Rotina de dormir',
    personId: null, personName: null, state: 'Agendada', severity: 'normal',
    actions: [{ command: 'activity.record', label: 'Registrar' }] },
];

const OPCOES_CHAMADA = [
  { code: 'normal', label: 'Normal', excecao: false },
  { code: 'comeu_pouco', label: 'Comeu pouco', excecao: true },
  { code: 'recusou', label: 'Recusou', excecao: true },
  { code: 'ausente_autorizado', label: 'Ausente — autorizado', excecao: true },
  { code: 'ausente_sem_autorizacao', label: 'Ausente — sem autorização', excecao: true },
];

interface Chamada {
  id: string; tipo: string; titulo: string; status: string; horario: string;
  resultados: Record<string, { opcao: string; nota?: string }>;
}
let CHAMADAS: Chamada[] = [
  { id: 'k1', tipo: 'alimentacao', titulo: 'Café da manhã', status: 'confirmada',
    horario: emHoras(7, 30), resultados: Object.fromEntries(KIDS.map((k) => [k.id, { opcao: 'normal' }])) },
  { id: 'k2', tipo: 'alimentacao', titulo: 'Almoço', status: 'aberta', horario: emHoras(11, 30),
    resultados: { p02: { opcao: 'normal' }, p04: { opcao: 'normal' },
                  p11: { opcao: 'comeu_pouco', nota: 'Comeu metade e disse que estava sem fome.' } } },
  { id: 'k3', tipo: 'presenca', titulo: 'Janta', status: 'aberta', horario: emHoras(18, 30),
    resultados: {} },
];

interface Passagem {
  id: string; quem: string; cargo: string; userId: string;
  contribuicoes: string | null; pendencias: string | null; orientacoes: string | null;
  assinadaEm: string; horarioReal: string; complementoTardio: boolean; offline: boolean;
  complementos: { id: string; quem: string; texto: string; quando: string; escritoEm: string; offline: boolean }[];
}
interface Plantao {
  id: string; turno: string; status: string; abertoEm: string; fechadoEm: string | null;
  passagens: Passagem[];
  recebimentos: { id: string; quem: string; userId: string; recebidoEm: string;
                  leuOrientacoes: boolean; assumiuPendencias: boolean; nota: string | null }[];
  esperados: { quem: string; cargo: string; userId: string }[];
}
let PLANTOES: Plantao[] = [
  { id: 's1', turno: 'diurno', status: 'aberto', abertoEm: emHoras(7, 0), fechadoEm: null,
    passagens: [
      { id: 'h1', quem: 'Tainá Souza (fictícia)', cargo: 'educador', userId: 'u7',
        contribuicoes: 'Acompanhei o café e a saída para a escola; tudo tranquilo.',
        pendencias: 'Falta buscar o resultado do exame do Bruno na unidade de saúde.',
        orientacoes: 'A Alice acordou com tosse; se piorar, acionar a Enfermagem.',
        assinadaEm: emHoras(13, 0), horarioReal: emHoras(13, 0),
        complementoTardio: false, offline: false, complementos: [] },
    ],
    recebimentos: [],
    esperados: [
      { quem: 'Mário Silva (fictício)', cargo: 'educador', userId: 'u1' },
      { quem: 'Joana Lima (fictícia)', cargo: 'educador', userId: 'u6' },
      { quem: 'Lúcia Líder Diurna (fictícia)', cargo: 'lider_diurno', userId: 'u2' },
    ] },
];

interface Compromisso {
  id: string; tipo: string; titulo: string; local: string | null;
  personId: string | null; hora: string; duracaoMin: number | null;
  recorrencia: string; diasSemana: number[]; inicio: string; fim: string | null;
  motivoSemPrazo: string | null; responsavelModo: string; responsavelNome: string | null;
  marcadoPor: string;
}
let COMPROMISSOS: Compromisso[] = [
  { id: 'c1', tipo: 'saude', titulo: 'Fonoaudiologia', local: 'Clínica Fictícia — Centro',
    personId: 'p11', hora: '15:00', duracaoMin: 45, recorrencia: 'semanal', diasSemana: [2, 4],
    inicio: HOJE, fim: null,
    motivoSemPrazo: 'Tratamento contínuo conforme laudo fonoaudiológico, sem previsão de alta.',
    responsavelModo: 'pessoa', responsavelNome: 'Mário Silva (fictício)',
    marcadoPor: 'Tatiane Técnica (fictícia)' },
  { id: 'c2', tipo: 'atividade', titulo: 'Reforço escolar', local: 'Sala de estudos',
    personId: null, hora: '16:00', duracaoMin: 60, recorrencia: 'semanal', diasSemana: [1, 3, 5],
    inicio: HOJE, fim: null, motivoSemPrazo: 'Acompanhamento pedagógico contínuo da casa.',
    responsavelModo: 'plantao', responsavelNome: null, marcadoPor: 'Lúcia Líder Diurna (fictícia)' },
  { id: 'c3', tipo: 'visita', titulo: 'Visita da avó materna', local: 'Sala de visitas',
    personId: 'p02', hora: '14:00', duracaoMin: 90, recorrencia: 'quinzenal', diasSemana: [6],
    inicio: HOJE, fim: null, motivoSemPrazo: 'Convivência familiar autorizada, sem prazo na decisão.',
    responsavelModo: 'pessoa', responsavelNome: 'Tatiane Técnica (fictícia)',
    marcadoPor: 'Tatiane Técnica (fictícia)' },
];

const DOSES = [
  { id: 'd1', personId: 'p11', horario: emHoras(7, 30), medicamento: 'Colírio lubrificante (fictício)',
    dose: '1 gota em cada olho', via: 'oftálmica', tipo: 'uso_continuo', condicaoUso: null,
    estado: 'aguardando_confirmacao', rotulo: 'Aguardando confirmação', pendente: true, confirmadaPor: null },
  { id: 'd2', personId: 'p11', horario: emHoras(19, 30), medicamento: 'Colírio lubrificante (fictício)',
    dose: '1 gota em cada olho', via: 'oftálmica', tipo: 'uso_continuo', condicaoUso: null,
    estado: 'aguardando_confirmacao', rotulo: 'Aguardando confirmação', pendente: true, confirmadaPor: null },
  { id: 'd3', personId: 'p02', horario: emHoras(8, 0), medicamento: 'Amoxicilina (fictícia) 250 mg/5 mL',
    dose: '5 mL', via: 'oral', tipo: 'tratamento', condicaoUso: null,
    estado: 'administrada', rotulo: 'Administrada', pendente: false, confirmadaPor: 'Tainá Souza (fictícia)' },
  { id: 'd4', personId: 'p02', horario: emHoras(16, 0), medicamento: 'Amoxicilina (fictícia) 250 mg/5 mL',
    dose: '5 mL', via: 'oral', tipo: 'tratamento', condicaoUso: null,
    estado: 'aguardando_confirmacao', rotulo: 'Aguardando confirmação', pendente: true, confirmadaPor: null },
  { id: 'd5', personId: 'p10', horario: emHoras(0, 0), medicamento: 'Paracetamol (fictício) 500 mg',
    dose: '1 comprimido', via: 'oral', tipo: 'quando_necessario',
    condicaoUso: 'Dor de cabeça referida ou temperatura acima de 37,8 °C. Intervalo mínimo de 6 horas.',
    estado: 'aguardando_confirmacao', rotulo: 'Se necessário', pendente: true, confirmadaPor: null },
];

/** Acolhidos criados no protótipo entram aqui e aparecem em tudo. */
const NOVOS: Kid[] = [];
const todosKids = () => [...KIDS, ...NOVOS];
const kid = (id: string) => todosKids().find((k) => k.id === id);

// ---------------------------------------------------------------- roteador

const ESTADO_LABEL: Record<string, string> = {
  concluida_no_horario: 'Concluída no horário', concluida_com_atraso: 'Concluída com atraso',
  reagendada: 'Reagendada', cancelada_externamente: 'Cancelada externamente',
  recusada_pelo_acolhido: 'Recusada pelo acolhido', nao_realizada_saude: 'Não realizada — saúde',
  nao_realizada_ausencia_profissional: 'Não realizada — ausência profissional',
  nao_realizada_transporte: 'Não realizada — transporte',
  nao_realizada_decisao_institucional: 'Não realizada — decisão institucional',
  nao_aplicavel: 'Não aplicável',
};

class Recusa extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function mockApi<T>(path: string, init?: RequestInit): Promise<T> {
  await new Promise((r) => setTimeout(r, 120));   // uma pausa curta, como a rede real
  const [rota, busca] = path.split('?');
  const q = new URLSearchParams(busca ?? '');
  const corpo = init?.body ? JSON.parse(String(init.body)) : {};
  const seg = rota.split('/').filter(Boolean);

  const r = responder(rota, seg, q, corpo, init?.method ?? 'GET');
  if (r instanceof Recusa) throw r;
  return r as T;
}

function responder(rota: string, seg: string[], q: URLSearchParams,
                   b: any, metodo: string): unknown {
  // ---- entrada
  if (rota === '/auth/login') {
    const u = USUARIOS[String(b.email ?? '').toLowerCase().trim()];
    if (!u || b.password !== u.senha) {
      return new Recusa(401, 'E-mail ou senha inválidos.');
    }
    eu = u;
    return { token: 'prototipo' };
  }
  if (rota === '/auth/logout') return { ok: true };
  if (rota === '/auth/password') {
    return { ok: true, aviso: 'No protótipo a senha não é gravada em lugar nenhum.' };
  }
  if (rota === '/users/me') {
    return {
      id: eu.id, email: Object.keys(USUARIOS).find((e) => USUARIOS[e].id === eu.id),
      fullName: eu.fullName, role: eu.role, mustChangePassword: false,
      assignments: [{ code: CASA.code, name: CASA.name, role: eu.role }],
    };
  }
  if (rota === '/houses') return [CASA];
  if (rota === '/houses/directory') return CASAS;
  if (rota.startsWith('/houses/') && rota.endsWith('/occupancy')) {
    const ocupadas = todosKids().length;
    return {
      capacidade: 20, ocupadas, vagas: Math.max(0, 20 - ocupadas),
      acimaDoLimite: ocupadas > 20,
      podeAlterar: ['coordenador', 'gestor_geral'].includes(eu.role),
    };
  }

  // ---- equipe
  if (rota === '/staff') {
    return EQUIPE_CASA.map((m) => ({
      id: m.id, fullName: m.nome, email: `${m.nome.split(' ')[0].toLowerCase()}@paodospobres.dev`,
      role: m.cargo, active: true, mustChangePassword: false,
      houses: [{ code: CASA.code, name: CASA.name }],
    }));
  }
  if (rota === '/staff/sectors') {
    return [
      { cod: 'educador', label: 'Educador social', ajuda: 'Cuida do dia a dia da casa.' },
      { cod: 'lider_diurno', label: 'Líder Diurno', ajuda: 'Coordena o turno e fecha a ATA.' },
      { cod: 'equipe_tecnica', label: 'Equipe técnica', ajuda: 'Psicologia e serviço social.' },
      { cod: 'coordenador', label: 'Coordenação', ajuda: 'Responde pela casa.' },
      { cod: 'enfermagem', label: 'Enfermagem', ajuda: 'Alcança as oito unidades.' },
      { cod: 'cozinha', label: 'Cozinha', ajuda: 'Só o relatório de restrições.' },
    ];
  }
  if (rota.startsWith('/staff/')) {
    return { ok: true, aviso: 'No protótipo, a alteração vale só nesta tela.' };
  }

  // ---- o dia
  if (rota === '/timeline') {
    const so = q.get('mode') === 'minhas';
    const eventos = so ? LINHA.filter((e) => e.responsible === eu.fullName) : LINHA;
    const criticos = eventos.filter((e) => e.severity === 'critico').length;
    const atencao = eventos.filter((e) => e.severity === 'atencao').length;
    return {
      data: HOJE, incompleta: false, fontesIndisponiveis: [],
      resumo: { total: eventos.length, criticos, atencao,
                individuais: eventos.filter((e) => e.personId).length,
                coletivos: eventos.filter((e) => !e.personId).length },
      eventos: eventos.map((e) => ({ ...e, actions: acoes(e) })),
    };
  }
  if (seg[0] === 'activities' && seg[2] === 'acknowledge') {
    const ev = LINHA.find((e) => e.id.endsWith(seg[1]));
    if (ev) ev.state = 'Ciente';
    return { ok: true, aviso: 'Ciência registrada em seu nome.' };
  }
  if (seg[0] === 'activities' && seg[2] === 'record') {
    const ev = LINHA.find((e) => e.id.endsWith(seg[1]));
    if (ev) {
      ev.state = ESTADO_LABEL[b.estado] ?? b.estado;
      ev.note = b.nota ?? null;
      ev.severity = b.estado === 'concluida_no_horario' ? 'normal' : 'atencao';
    }
    return { ok: true, aviso: 'Registrado com o seu nome e o horário de agora.' };
  }

  // ---- chamada
  if (rota === '/checks' && metodo === 'GET') {
    return CHAMADAS.map((k) => ({
      id: k.id, tipo: k.tipo, titulo: k.titulo, status: k.status, horario: k.horario,
      esperados: todosKids().length, conferidos: Object.keys(k.resultados).length,
    }));
  }
  if (rota === '/checks' && metodo === 'POST') {
    const nova: Chamada = { id: uid(), tipo: b.kind ?? 'presenca', titulo: b.titulo ?? 'Chamada',
                            status: 'aberta', horario: new Date().toISOString(), resultados: {} };
    CHAMADAS = [...CHAMADAS, nova];
    return { id: nova.id, esperados: todosKids().length, opcoes: OPCOES_CHAMADA };
  }
  if (seg[0] === 'checks' && seg.length === 2) {
    const k = CHAMADAS.find((x) => x.id === seg[1])!;
    const linhas = todosKids().map((p) => {
      const res = k.resultados[p.id];
      return {
        acolhidoId: p.id, nome: p.nome, idade: p.idade, ativo: true,
        alertas: p.alerta ? p.alerta.descricao : null,
        restricoes: p.restricao ? p.restricao.restriction : null,
        resultado: res?.opcao ?? null, justificativa: res?.nota ?? null,
        registradoPor: res ? eu.fullName : null, registradoEm: res ? new Date().toISOString() : null,
      };
    });
    const conferidos = linhas.filter((l) => l.resultado).length;
    return {
      id: k.id, tipo: k.tipo, titulo: k.titulo, status: k.status,
      esperados: linhas.length, conferidos, faltam: linhas.length - conferidos,
      quemFalta: linhas.filter((l) => !l.resultado).map((l) => l.nome),
      linhas, opcoes: OPCOES_CHAMADA,
    };
  }
  if (seg[0] === 'checks' && seg[2] === 'mark') {
    const k = CHAMADAS.find((x) => x.id === seg[1])!;
    if (k.status === 'confirmada') {
      return new Recusa(400, 'Chamada confirmada não é reescrita — a correção entra como adendo.');
    }
    k.resultados[b.personId] = { opcao: b.opcao, nota: b.nota };
    return { ok: true };
  }
  if (seg[0] === 'checks' && seg[2] === 'confirm') {
    const k = CHAMADAS.find((x) => x.id === seg[1])!;
    const faltam = todosKids().filter((p) => !k.resultados[p.id]);
    if (faltam.length) {
      return new Recusa(400,
        `Faltam ${faltam.length}: ${faltam.slice(0, 5).map((p) => p.nome).join(', ')}`
        + `${faltam.length > 5 ? ' e outros' : ''}. Ninguém é dado como conferido sem registro.`);
    }
    k.status = 'confirmada';
    return { aviso: 'Chamada confirmada. O que foi registrado na hora continua como foi registrado.' };
  }

  // ---- plantão e passagem
  if (rota === '/shifts' && metodo === 'GET') {
    return PLANTOES.map((s) => ({
      id: s.id, turno: s.turno, status: s.status, abertoEm: s.abertoEm, fechadoEm: s.fechadoEm,
      passagensAssinadas: s.passagens.length, recebimentos: s.recebimentos.length,
      assinaturasFaltantes: s.esperados.filter(
        (e) => !s.passagens.some((p) => p.userId === e.userId)).length,
    }));
  }
  if (rota === '/shifts' && metodo === 'POST') {
    const existente = PLANTOES.find((s) => s.turno === b.turno);
    if (existente) return { plantaoId: existente.id, novo: false, turno: b.turno };
    const novo: Plantao = {
      id: uid(), turno: b.turno, status: 'aberto', abertoEm: new Date().toISOString(),
      fechadoEm: null, passagens: [], recebimentos: [],
      esperados: [{ quem: 'Nélio Noturno (fictício)', cargo: 'educador', userId: 'u8' }],
    };
    PLANTOES = [...PLANTOES, novo];
    return { plantaoId: novo.id, novo: true, turno: b.turno };
  }
  if (seg[0] === 'shifts' && seg.length === 2) {
    const s = PLANTOES.find((x) => x.id === seg[1])!;
    return {
      id: s.id, casaId: CASA.id, data: HOJE, turno: s.turno, status: s.status,
      abertoEm: s.abertoEm, fechadoEm: s.fechadoEm, ata: null,
      passagens: s.passagens.map((p) => ({ ...p, propria: p.userId === eu.id })),
      assinaturasPendentes: s.esperados
        .filter((e) => !s.passagens.some((p) => p.userId === e.userId))
        .map((e) => ({ quem: e.quem, cargo: e.cargo })),
      minhaPassagemEsperada: s.esperados.some((e) => e.userId === eu.id)
        && !s.passagens.some((p) => p.userId === eu.id),
      recebimentos: s.recebimentos.map((r) => ({ ...r, propria: r.userId === eu.id })),
      episodios: [],
    };
  }
  if (seg[0] === 'shifts' && seg[2] === 'handover' && seg.length === 3) {
    const s = PLANTOES.find((x) => x.id === seg[1])!;
    if (s.passagens.some((p) => p.userId === eu.id)) {
      return new Recusa(400, 'Você já assinou a passagem deste plantão. Para acrescentar algo, '
        + 'registre um complemento — ele entra ao lado, sem reescrever o que você assinou.');
    }
    const tardia = !!b.happenedAt;
    s.passagens = [...s.passagens, {
      id: uid(), quem: eu.fullName, cargo: eu.role, userId: eu.id,
      contribuicoes: b.contribuicoes || null, pendencias: b.pendencias || null,
      orientacoes: b.orientacoes || null,
      assinadaEm: new Date().toISOString(),
      horarioReal: b.happenedAt ?? new Date().toISOString(),
      complementoTardio: tardia, offline: false, complementos: [],
    }];
    return { id: 'h', tardia, aviso: tardia
      ? 'Registrada como complemento tardio, com o horário real informado.'
      : 'Passagem assinada. Somente você pode assiná-la, e ela não pode ser reescrita.' };
  }
  if (seg[0] === 'shifts' && seg[3] === 'note') {
    const s = PLANTOES.find((x) => x.id === seg[1])!;
    const minha = s.passagens.find((p) => p.userId === eu.id);
    if (!minha) {
      return new Recusa(400, 'Você ainda não assinou a passagem deste plantão. Assine primeiro.');
    }
    minha.complementos = [...minha.complementos, {
      id: uid(), quem: eu.fullName, texto: b.texto,
      quando: new Date().toISOString(), escritoEm: new Date().toISOString(), offline: false,
    }];
    return { id: 'n', aviso: 'Complemento registrado ao lado da sua passagem. '
      + 'O que já estava escrito continua como estava.' };
  }
  if (seg[0] === 'shifts' && seg[2] === 'receipt') {
    const s = PLANTOES.find((x) => x.id === seg[1])!;
    if (s.recebimentos.some((r) => r.userId === eu.id)) {
      return new Recusa(400, 'Você já confirmou o recebimento deste plantão.');
    }
    s.recebimentos = [...s.recebimentos, {
      id: uid(), quem: eu.fullName, userId: eu.id, recebidoEm: new Date().toISOString(),
      leuOrientacoes: !!b.leuOrientacoes, assumiuPendencias: !!b.assumiuPendencias,
      nota: b.nota ?? null,
    }];
    return { ok: true, aviso: 'Recebimento registrado em seu nome. Confirmar o recebimento não '
      + 'significa concordância com narrativas de colegas — se você tem outra versão do fato, '
      + 'registre o seu relato.' };
  }

  // ---- acolhidos
  if (rota === '/people' && metodo === 'GET') {
    return todosKids().map((k) => ({
      id: k.id, nome: k.nome, nomeCivil: k.civil, idade: k.idade, nascimento: k.nascimento,
      cpf: k.semCpf ? null : '***.***.123-**', cpfPendente: !!k.semCpf,
      alertasEssenciais: k.alerta ? 1 : 0, restricoesAlimentares: k.restricao ? 1 : 0,
    }));
  }
  if (rota === '/people/admission/options') {
    return {
      motivos: [['negligencia', 'Negligência'], ['abandono', 'Abandono'],
        ['violencia_fisica', 'Violência física'], ['violencia_psicologica', 'Violência psicológica'],
        ['violencia_sexual', 'Violência sexual'], ['trabalho_infantil', 'Trabalho infantil'],
        ['situacao_de_rua', 'Situação de rua'],
        ['dependencia_quimica_do_responsavel', 'Dependência química do responsável'],
        ['orfandade', 'Orfandade'], ['ausencia_de_responsavel', 'Ausência de responsável'],
        ['entrega_voluntaria', 'Entrega voluntária'], ['outro', 'Outro'],
      ].map(([cod, label]) => ({ cod, label })),
      orgaos: [['vara_da_infancia', 'Vara da Infância e Juventude'],
        ['conselho_tutelar', 'Conselho Tutelar'], ['ministerio_publico', 'Ministério Público'],
        ['delegacia', 'Delegacia'], ['outro', 'Outro'],
      ].map(([cod, label]) => ({ cod, label })),
      medidas: [['acolhimento_institucional', 'Acolhimento institucional'],
        ['acolhimento_familiar', 'Acolhimento familiar'],
        ['medida_protetiva_outra', 'Outra medida protetiva'],
      ].map(([cod, label]) => ({ cod, label })),
    };
  }
  if (rota === '/people/check-cpf') {
    const digitos = String(b.cpf ?? '').replace(/\D/g, '');
    if (digitos.length !== 11) return new Recusa(400, 'CPF inválido. Confira os números digitados.');
    // No protótipo: um CPF terminado em 0 finge ser alguém que já tem perfil.
    if (digitos.endsWith('0')) {
      return { situacao: 'no_acervo', personId: 'p01',
               acao: 'Iniciar retorno — novo episódio no mesmo perfil' };
    }
    return { situacao: 'livre', personId: null, acao: 'Cadastrar novo acolhido' };
  }
  if (rota === '/people/admission') {
    const acima = todosKids().length + 1 > 20;
    if (acima && String(b.acolhimento?.capacityReason ?? '').trim().length < 15) {
      return new Recusa(409, 'A casa está no limite de vagas. Para acolher assim mesmo, '
        + 'descreva a justificativa — ela fica registrada com o seu nome.');
    }
    const semCpf = !String(b.pessoa?.cpf ?? '').trim();
    const nasc = String(b.pessoa?.birthDate ?? HOJE);
    const novo: Kid = {
      id: uid(), nome: b.pessoa?.socialName || b.pessoa?.fullName,
      civil: b.pessoa?.fullName, nascimento: nasc,
      idade: Math.max(0, new Date().getFullYear() - Number(nasc.slice(0, 4))),
      cuidado: b.pessoa?.essentialCare, serie: '—', turno: '—',
      semCpf, provisorio: semCpf ? `PROV-${uid().toUpperCase()}` : undefined,
      judicial: {
        motivo: (responder('/people/admission/options', [], q, {}, 'GET') as any)
          .motivos.find((m: any) => m.cod === b.judicial?.reasonCategory)?.label ?? '—',
        detalhe: b.judicial?.reasonDetail ?? '',
        medida: 'Acolhimento institucional',
        orgao: (responder('/people/admission/options', [], q, {}, 'GET') as any)
          .orgaos.find((o: any) => o.cod === b.judicial?.determiningBody)?.label ?? '—',
        vara: b.judicial?.courtName ?? '', processo: b.judicial?.processNumber ?? '',
        guia: b.judicial?.guideNumber ?? '', guiaEm: b.judicial?.guideDate ?? '',
      },
    };
    NOVOS.push(novo);
    return {
      personId: novo.id, episodeId: uid(), episodio: 1, cpfPendente: semCpf,
      acimaDoLimite: acima, capacidade: 20, ocupadas: todosKids().length,
      aviso: acima
        ? `Cadastro feito com a casa acima do limite (${todosKids().length} de 20). A justificativa ficou registrada.`
        : 'Acolhido cadastrado. Continue pelo perfil: saúde, escola e documentos.',
    };
  }
  if (seg[0] === 'people' && seg[2] === 'judicial') {
    const k = kid(seg[1]);
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Seu cargo não tem acesso a este conteúdo.');
    }
    if (!k?.judicial) return new Recusa(404, 'Não encontrado.');
    return { ...k.judicial, situacao: 'Em acompanhamento', observacoes: null };
  }
  if (seg[0] === 'people' && seg.length === 2) {
    const k = kid(seg[1]);
    if (!k) return new Recusa(404, 'Não encontrado.');
    const podeDoc = !['cozinha'].includes(eu.role);
    const restritos = ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role) ? 0 : 2;
    return {
      id: k.id, nome: k.nome, nomeCivil: k.civil, nomeSocial: k.nome, idade: k.idade,
      nascimento: k.nascimento, cpf: k.semCpf ? null : '***.***.123-**',
      cpfPendente: !!k.semCpf, idProvisorio: k.provisorio ?? null,
      casaAtual: { id: CASA.id, codigo: CASA.code, nome: CASA.name, desde: '2026-02-28' },
      noAcervo: false,
      alertasEssenciais: k.alerta ? [{ tipo: k.alerta.tipo, descricao: k.alerta.descricao,
                                       gravidade: k.alerta.gravidade }] : [],
      condicoesSaude: k.alerta ? [{ id: 'h1', kind: k.alerta.tipo, description: k.alerta.descricao,
        rotulo: k.alerta.descricao, severity: k.alerta.gravidade, essential_alert: true,
        source: 'Relatório médico (fictício)', review_on: null }] : [],
      restricoesAlimentares: k.restricao ? [{ id: 'r1', ...k.restricao, review_on: null }] : [],
      cuidadosEssenciais: k.cuidado ?? null,
      escola: { nome: 'EMEF Vila Nova (fictícia)', serie: k.serie, turno: k.turno,
                endereco: 'Rua Fictícia, 100 — Porto Alegre/RS' },
      equipeReferencia: 'Equipe técnica Casa 03',
      episodios: [{ number: 1, started_at: '2026-02-28', ended_at: null, end_reason: null, status: 'ativo' }],
      documentos: podeDoc ? [
        { id: 'doc1', category: 'saude', title: 'Receita em vigência', issued_on: '2026-08-01', valid_until: null },
        { id: 'doc2', category: 'escolar', title: 'Boletim do semestre', issued_on: '2026-07-15', valid_until: null },
        ...(restritos === 0 ? [
          { id: 'doc3', category: 'pessoal', title: 'Certidão de nascimento', issued_on: null, valid_until: null },
          { id: 'doc4', category: 'judicial_socioassistencial', title: 'Guia de acolhimento', issued_on: '2026-02-25', valid_until: null },
        ] : []),
      ] : [],
      documentosRestritos: restritos,
      memorias: [{ id: 'mem1', event_type: 'aniversário', happened_on: '2026-07-14',
                   description: 'Comemoração na casa com bolo escolhido pelo grupo.',
                   has_photo: false, photo_authorized: false }],
      beneficios: { acessivel: ['coordenador', 'gestor_geral'].includes(eu.role),
                    rota: `/people/${k.id}/benefits` },
    };
  }

  // ---- medicamentos
  if (rota === '/medications' || rota.startsWith('/medications?')) {
    const pid = q.get('personId');
    return DOSES.filter((d) => !pid || d.personId === pid)
      .map((d) => ({ ...d, acolhido: { id: d.personId, nome: kid(d.personId)?.nome } }));
  }

  // ---- agenda
  if (rota === '/activities/agenda/options') {
    return {
      tipos: [['atividade', 'Atividade'], ['saude', 'Saúde — consulta, exame, terapia'],
        ['tratamento', 'Tratamento continuado'], ['escola', 'Escola'],
        ['curso', 'Curso ou profissionalização'], ['visita', 'Visita ou convivência familiar'],
        ['documentacao', 'Documentação'], ['lazer', 'Lazer'], ['outro', 'Outro'],
      ].map(([cod, label]) => ({ cod, label })),
      recorrencias: [['unica', 'Uma vez'], ['diaria', 'Todos os dias'],
        ['semanal', 'Toda semana, nos dias escolhidos'], ['quinzenal', 'A cada 15 dias'],
        ['mensal', 'Todo mês, no mesmo dia'],
      ].map(([cod, label]) => ({ cod, label })),
      diasSemana: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((label, n) => ({ n, label })),
      responsaveis: [
        { cod: 'plantao', label: 'Quem estiver no plantão do horário',
          ajuda: 'Para a rotina e o que qualquer educador de serviço faz.' },
        { cod: 'pessoa', label: 'Um educador com nome',
          ajuda: 'Para o que precisa de preparo — consulta, saída, audiência.' },
      ],
    };
  }
  if (rota === '/activities/agenda/staff') {
    // O protótipo tem escala cadastrada: das 7h às 19h, de segunda a sexta.
    const hora = Number((q.get('hora') ?? '12:00').slice(0, 2));
    const diaSemana = new Date(`${q.get('data')}T12:00:00`).getDay();
    const haEscala = diaSemana >= 1 && diaSemana <= 5;
    return {
      haEscala,
      equipe: EQUIPE_CASA.map((m) => ({
        id: m.id, nome: m.nome, cargo: m.cargo,
        naEscala: haEscala && hora >= 7 && hora < 19,
      })),
    };
  }
  if (rota === '/activities/agenda/commitments') {
    return COMPROMISSOS.map((c) => ({
      id: c.id, tipo: c.tipo, titulo: c.titulo, local: c.local,
      pessoa: c.personId ? kid(c.personId)?.nome ?? '—' : 'Casa toda', coletivo: !c.personId,
      inicio: c.inicio, fim: c.fim, indeterminado: c.fim === null,
      motivoSemPrazo: c.motivoSemPrazo, hora: c.hora, duracaoMin: c.duracaoMin,
      recorrencia: c.recorrencia, diasSemana: c.diasSemana,
      responsavel: c.responsavelModo === 'pessoa' ? c.responsavelNome : 'Plantão do horário',
      responsavelNomeado: c.responsavelModo === 'pessoa',
      observacaoResponsavel: null, marcadoPor: c.marcadoPor, marcadoEm: HOJE,
    }));
  }
  if (rota === '/activities/agenda' && metodo === 'GET') {
    // A projeção do período: os dias em que cada compromisso cai.
    const de = q.get('de')!, ate = q.get('ate')!;
    const saida: unknown[] = [];
    for (let d = new Date(`${de}T12:00:00`); d <= new Date(`${ate}T12:00:00`);
         d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const dow = d.getDay();
      for (const c of COMPROMISSOS) {
        if (iso < c.inicio || (c.fim && iso > c.fim)) continue;
        const cai = c.recorrencia === 'diaria'
          || (c.recorrencia === 'unica' && iso === c.inicio)
          || (['semanal', 'quinzenal'].includes(c.recorrencia) && c.diasSemana.includes(dow))
          || (c.recorrencia === 'mensal' && iso.slice(8) === c.inicio.slice(8));
        if (!cai) continue;
        saida.push({
          compromissoId: c.id, em: iso, hora: c.hora, duracaoMin: c.duracaoMin,
          tipo: c.tipo, titulo: c.titulo, local: c.local, personId: c.personId,
          pessoa: c.personId ? kid(c.personId)?.nome ?? '—' : 'Casa toda',
          coletivo: !c.personId, recorrencia: c.recorrencia, indeterminado: c.fim === null,
        });
      }
    }
    return saida;
  }
  if (rota === '/activities/agenda' && metodo === 'POST') {
    const modo = b.responsavel === 'pessoa' ? 'pessoa' : 'plantao';
    const nome = EQUIPE_CASA.find((m) => m.id === b.responsavelId)?.nome ?? null;
    COMPROMISSOS = [...COMPROMISSOS, {
      id: uid(), tipo: b.tipo, titulo: b.titulo, local: b.local ?? null,
      personId: b.personId ?? null, hora: b.hora, duracaoMin: b.duracaoMin ?? null,
      recorrencia: b.recorrencia, diasSemana: b.diasSemana ?? [],
      inicio: b.inicio, fim: b.recorrencia === 'unica' ? b.inicio : (b.fim ?? null),
      motivoSemPrazo: b.motivoSemPrazo ?? null,
      responsavelModo: modo, responsavelNome: nome, marcadoPor: eu.fullName,
    }];
    return {
      id: 'novo', coletivo: !b.personId, indeterminado: !b.fim, responsavel: modo,
      foraDaEscala: null,
      aviso: (b.fim ? 'Marcado. Aparece na linha do tempo no dia e no horário, inclusive semanas à frente.'
                    : 'Marcado por tempo indeterminado. Vai continuar aparecendo até alguém encerrar.')
        + (modo === 'pessoa'
            ? ' O responsável recebe isto em "Minhas responsabilidades" no dia.'
            : ' Sem nome: quem estiver no plantão daquele horário assume.'),
    };
  }
  if (seg[0] === 'activities' && seg[1] === 'agenda' && seg[3] === 'cancel') {
    COMPROMISSOS = COMPROMISSOS.filter((c) => c.id !== seg[2]);
    return { cancelado: true, futurasRemovidas: 0,
             aviso: 'Compromisso encerrado. O que já aconteceu continua na linha do tempo.' };
  }

  return new Recusa(404, 'Esta parte do sistema ainda não está no protótipo.');
}
