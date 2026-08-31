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

/**
 * As contas do protótipo.
 *
 * `senha: null` é conta sem senha ainda: entra só com o e-mail e cria a
 * própria senha na hora — é assim que a primeira pessoa da Fundação vai
 * entrar, sem senha inicial circulando em grupo de mensagens.
 */
const USUARIOS: Record<string, { id: string; fullName: string; role: string; senha: string | null }> = {
  'mbarbosa@paodospobres.com.br': { id: 'u0', fullName: 'Marcelo Barbosa', role: 'coordenador', senha: null },
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

/**
 * Estoque da casa. Não é farmácia: é o que existe no armário, para a
 * Enfermagem ver o que vai faltar antes de faltar. Quantidade baixa é
 * ESTADO OPERACIONAL do armário — não diz nada sobre nenhuma criança.
 */
const ESTOQUE = [
  { id: 'e1', medicamento: 'Amoxicilina (fictícia) 250 mg/5 mL', unidade: 'frasco',
    quantidade: 2, minimo: 2, validade: '2027-01-31', conferidoPor: 'Enfermeira Fictícia' },
  { id: 'e2', medicamento: 'Colírio lubrificante (fictício)', unidade: 'frasco',
    quantidade: 5, minimo: 2, validade: '2026-12-10', conferidoPor: 'Enfermeira Fictícia' },
  { id: 'e3', medicamento: 'Paracetamol (fictício) 500 mg', unidade: 'comprimido',
    quantidade: 8, minimo: 20, validade: '2026-11-30', conferidoPor: 'Enfermeira Fictícia' },
  { id: 'e4', medicamento: 'Insulina (fictícia) — caneta', unidade: 'caneta',
    quantidade: 3, minimo: 2, validade: '2026-10-05', conferidoPor: 'Enfermeira Fictícia' },
];

/**
 * Triagem de enfermagem: evoluções escritas pelo educador que acompanhou o
 * atendimento. A Enfermagem tria, complementa e assina — e a coordenação
 * cobra a pendência, mas nunca assina no lugar dela.
 */
interface Triagem {
  id: string; personId: string; tipo: string; enviadaPor: string; enviadaEm: string;
  resumo: string; assinada: boolean; assinadaPor: string | null; complemento: string | null;
}
let TRIAGENS: Triagem[] = [
  { id: 't1', personId: 'p08', tipo: 'Consulta de pediatria', enviadaPor: 'Mário Silva (fictício)',
    enviadaEm: emHoras(10, 40), assinada: false, assinadaPor: null, complemento: null,
    resumo: 'Consulta de rotina. Pediatra pediu exame de sangue e retorno em 30 dias. '
      + 'Receita anexada; vitamina D mantida.' },
  { id: 't2', personId: 'p09', tipo: 'Urgência odontológica', enviadaPor: 'Joana Lima (fictícia)',
    enviadaEm: emHoras(16, 20), assinada: false, assinadaPor: null, complemento: null,
    resumo: 'Dor de dente referida depois do almoço. Atendido na unidade fictícia; '
      + 'prescrita amoxicilina 500 mg 8/8h por 7 dias.' },
  { id: 't3', personId: 'p15', tipo: 'Retorno de endocrinologia', enviadaPor: 'Tainá Souza (fictícia)',
    enviadaEm: emHoras(9, 10), assinada: true, assinadaPor: 'Enfermeira Fictícia',
    complemento: 'Grade de glicemia conferida com a receita nova antes de valer na casa.',
    resumo: 'Ajuste de dose conforme laudo. Glicemia antes das refeições mantida.' },
];

/** Cada emissão de Resumo de Saúde pede finalidade — e a finalidade fica. */
const RESUMOS: { id: string; personId: string; finalidade: string;
                 por: string; em: string }[] = [];

/**
 * OCORRÊNCIAS (§13).
 *
 * `exigeRevisao` = a categoria não encerra sem validação técnica ou da
 * coordenação. `restrita` = o registro nasce restrito: colega de plantão não
 * abre. Nenhuma delas se encerra sozinha, e nenhuma delas é classificada
 * pelo sistema — quem classifica é quem estava lá.
 */
const CATEGORIAS_OCORRENCIA = [
  { cod: 'violencia_ou_suspeita', label: 'Violência ou suspeita de violação', tom: 'c-crit',
    exigeRevisao: true, restrita: true },
  { cod: 'conflito_agressao', label: 'Conflito ou agressão', tom: 'c-warn',
    exigeRevisao: false, restrita: false },
  { cod: 'saida_nao_autorizada', label: 'Saída não autorizada', tom: 'c-move',
    exigeRevisao: false, restrita: false },
  { cod: 'erro_medicamento', label: 'Erro de medicamento', tom: 'c-med',
    exigeRevisao: true, restrita: false },
  { cod: 'emergencia_saude', label: 'Emergência de saúde', tom: 'c-crit',
    exigeRevisao: true, restrita: false },
  { cod: 'contencao', label: 'Contenção', tom: 'c-other', exigeRevisao: true, restrita: true },
  { cod: 'desorganizacao_relevante', label: 'Desorganização relevante', tom: 'c-info',
    exigeRevisao: false, restrita: false },
  { cod: 'dano_recusa_critica', label: 'Dano ou recusa crítica', tom: 'c-warn',
    exigeRevisao: false, restrita: false },
  { cod: 'outro', label: 'Outro', tom: 'c-mute', exigeRevisao: false, restrita: false },
];

interface Ocorrencia {
  id: string; categoria: string; personId: string | null; fato: string; medidas: string;
  falaEspontanea: string | null; abertaPor: string; abertaEm: string;
  etapaOperacional: 'aberta' | 'encerrada'; situacao: 'em_andamento' | 'aguardando_revisao' | 'encerrada';
  avisados: string[];
  acompanhamento: { id: string; quem: string; texto: string; em: string }[];
}
let OCORRENCIAS: Ocorrencia[] = [
  { id: 'o1', categoria: 'saida_nao_autorizada', personId: 'p10',
    fato: 'Saiu pelo portão dos fundos por volta das 21h40. Retornou às 23h15, acompanhado.',
    medidas: 'Líder Noturno Geral acionado na hora; busca conforme protocolo da casa; '
      + 'acolhido recebido e avaliado pela equipe do plantão.',
    falaEspontanea: null, abertaPor: 'Joana Lima (fictícia)', abertaEm: emHoras(21, 40),
    etapaOperacional: 'encerrada', situacao: 'aguardando_revisao',
    avisados: ['Líder Diurno', 'equipe técnica', 'coordenação'],
    acompanhamento: [
      { id: 'oa1', quem: 'Nélio Noturno (fictício)',
        texto: 'Etapa operacional encerrada às 23h40, com o acolhido na casa e sem lesão referida.',
        em: emHoras(23, 40) },
    ] },
  { id: 'o2', categoria: 'erro_medicamento', personId: 'p02',
    fato: 'A dose das 8h foi ofertada com 40 minutos de atraso, por indisponibilidade do frasco na casa.',
    medidas: 'Enfermagem avisada na hora; frasco reposto do estoque da unidade; '
      + 'horário real anotado na grade.',
    falaEspontanea: null, abertaPor: 'Tainá Souza (fictícia)', abertaEm: emHoras(8, 45),
    etapaOperacional: 'encerrada', situacao: 'aguardando_revisao',
    avisados: ['Líder Diurno', 'equipe técnica', 'coordenação', 'Enfermagem'],
    acompanhamento: [] },
];

/**
 * ATAs. A da casa fecha depois das passagens; a Geral Noturna fecha depois
 * das oito ATAs de casa. Fechar COM PENDÊNCIA é uma saída de verdade — a
 * alternativa seria o sistema presumir uma assinatura que ninguém deu.
 */
let ATA_CASA = {
  data: HOJE, turno: 'diurno', horario: '07h–19h', estado: 'aberta' as 'aberta' | 'fechada',
  comPendencia: false, motivoPendencia: null as string | null,
  fechadaPor: null as string | null, fechadaEm: null as string | null,
  passagens: [
    { quem: 'Mário Silva (fictício)', cargo: 'educador', assinada: true },
    { quem: 'Tainá Souza (fictícia)', cargo: 'educador', assinada: true },
    { quem: 'Joana Lima (fictícia)', cargo: 'educador', assinada: false },
    { quem: 'Lúcia Líder Diurna (fictícia)', cargo: 'lider_diurno', assinada: true },
  ],
  secoes: ['Presentes e ausências', 'Situação dos acolhidos', 'Convivência familiar',
    'Saídas e retornos', 'Visitas', 'Enfermagem', 'Escola', 'Medicamentos',
    'Organização da casa', 'Ocorrências', 'Orientações ao próximo turno'],
};
let ATA_GERAL = {
  data: HOJE, turno: 'noturno', horario: '19h–07h',
  estado: 'aberta' as 'aberta' | 'fechada', comPendencia: false,
  motivoPendencia: null as string | null,
  fechadaPor: null as string | null, fechadaEm: null as string | null,
  casas: CASAS.map((c, i) => ({
    codigo: c.code, nome: c.name,
    // Casa sem chamado também entra: a ausência de demanda é registrada, não omitida.
    registro: i === 2 ? 'Chamado às 02h10 — saúde; enfermagem orientou por telefone.'
            : i === 5 ? 'Visita de rotina às 01h20; sem intercorrência.' : null,
    ataNoturna: i === 2 ? 'aguardando' : 'confirmada',
  })),
};

/**
 * COFRE DE ACESSOS.
 *
 * A coordenação tem a guarda e precisa destes acessos. O que muda em relação
 * à planilha não é o guardar — é o cofre ter porta: a lista mostra a DICA, a
 * senha só aparece com finalidade escrita, e cada abertura fica com nome e
 * hora. No protótipo a "cifra" é de mentira; no sistema real nem quem
 * administra o banco lê a senha.
 */
const COFRE = [
  { id: 'v1', personId: 'p01', tipo: 'gov.br', login: '000.000.000-00',
    dica: 'F••••••••3 (13)', senha: 'Ficticia@2013', responsavel: 'Coordenação da Casa 03' },
  { id: 'v2', personId: 'p01', tipo: 'Banco — poupança social', login: 'ag. 0000 · c/ 00000-0',
    dica: 'P••••••••1 (11)', senha: 'Poupanca#1', responsavel: 'Coordenação da Casa 03' },
  { id: 'v3', personId: 'p02', tipo: 'INSS — Meu INSS', login: '000.000.000-00',
    dica: 'M•••••••0 (10)', senha: 'MeuINSS@10', responsavel: 'Coordenação da Casa 03' },
  { id: 'v4', personId: 'p10', tipo: 'Carteira de Trabalho Digital', login: '000.000.000-00',
    dica: 'C•••••••7 (12)', senha: 'CtpsFicti@7', responsavel: 'Coordenação da Casa 03' },
];
let COFRE_HIST = [
  { id: 'ch1', quem: 'Carla Coordenadora (fictícia)', acao: 'abertura', em: emHoras(9, 12),
    finalidade: 'Atualizar cadastro do benefício no gov.br', excepcional: false },
  { id: 'ch2', quem: 'João Gestor (fictício)', acao: 'abertura excepcional', em: emHoras(8, 5),
    finalidade: 'Coordenadora em licença; benefício vencia na semana', excepcional: true },
  { id: 'ch3', quem: 'Carla Coordenadora (fictícia)', acao: 'cadastro do acesso',
    em: emHoras(7, 40), finalidade: '—', excepcional: false },
];
/** A reautenticação vale enquanto a página estiver aberta. */
let cofreLiberado = false;

/**
 * TRANSFERÊNCIAS (§15.6). Duas caixas: o que chegou de outras unidades e o
 * que esta casa pediu. A decisão é sempre do DESTINO, recusar exige motivo, e
 * o motivo aparece nas duas casas. O sistema não decide nada disso.
 */
interface Transferencia {
  id: string; caixa: 'recebida' | 'enviada'; nomeCivil: string; nome: string; idade: number;
  outraCasa: string; motivo: string; pedidaPor: string; pedidaEm: string;
  situacao: 'solicitada' | 'aceita' | 'recusada' | 'cancelada';
  justificativa: string | null; decididaPor: string | null; decididaEm: string | null;
  mensagens: { id: string; casa: string; autor: string; texto: string; em: string }[];
}
let TRANSFERENCIAS: Transferencia[] = [
  { id: 'x1', caixa: 'recebida', nomeCivil: 'Kauã Teixeira (fictício)', nome: 'Kauã', idade: 16,
    outraCasa: 'AI4 · Abrigo Institucional 4',
    motivo: 'Aproximação da rede de apoio familiar materna, que reside no bairro desta unidade.',
    pedidaPor: 'Cátia Coordenadora (fictícia)', pedidaEm: emHoras(16, 20), situacao: 'solicitada',
    justificativa: null, decididaPor: null, decididaEm: null,
    mensagens: [{ id: 'm1', casa: 'AI4', autor: 'Cátia Coordenadora (fictícia)',
      texto: 'Temos relatório escolar e da equipe técnica prontos para enviar assim que houver aceite.',
      em: emHoras(16, 25) }] },
  { id: 'x2', caixa: 'enviada', nomeCivil: 'Helena Prado (fictícia)', nome: 'Helena', idade: 6,
    outraCasa: 'ARM2 · Casa-Lar ARM2',
    motivo: 'Perfil de casa-lar indicado pela equipe técnica depois da audiência concentrada.',
    pedidaPor: 'Carla Coordenadora (fictícia)', pedidaEm: emHoras(10, 0), situacao: 'solicitada',
    justificativa: null, decididaPor: null, decididaEm: null, mensagens: [] },
  { id: 'x3', caixa: 'enviada', nomeCivil: 'Enzo Farias (fictício)', nome: 'Enzo', idade: 13,
    outraCasa: 'AI1 · Abrigo Institucional 1',
    motivo: 'Pedido da equipe técnica para reaproximação de irmãos.',
    pedidaPor: 'Tatiane Técnica (fictícia)', pedidaEm: emHoras(9, 0), situacao: 'recusada',
    justificativa: 'Sem vaga no perfil etário até o fim do mês; sugerimos reavaliar em 30 dias.',
    decididaPor: 'Coordenação AI1', decididaEm: emHoras(11, 0), mensagens: [] },
];

/**
 * ACOMPANHAMENTOS E RELATÓRIOS.
 *
 * A automação cria a PENDÊNCIA e nunca escreve a avaliação: os eixos nascem
 * vazios. Aprovado não se edita — corrigir gera a versão seguinte, e a
 * anterior continua legível como estava.
 */
const EIXOS = [
  { cod: 'saude', label: 'Saúde, alimentação e medicamentos' },
  { cod: 'escola', label: 'Escola, cursos e atividades' },
  { cod: 'convivencia', label: 'Convivência e desenvolvimento' },
  { cod: 'familia', label: 'Família, rede e situação judicial' },
];
interface Acompanhamento {
  id: string; personId: string; tipo: 'semanal' | 'mensal'; periodo: string;
  situacao: 'pendente' | 'rascunho' | 'em_aprovacao' | 'aprovado';
  versao: number; redator: string | null; aprovador: string | null;
  eixos: Record<string, string>;
  devolucao: string | null;
  historico: { id: string; quem: string; acao: string; em: string; nota: string | null }[];
}
let ACOMPANHAMENTOS: Acompanhamento[] = [
  { id: 'f1', personId: 'p01', tipo: 'mensal', periodo: 'agosto de 2026', situacao: 'pendente',
    versao: 1, redator: null, aprovador: null, eixos: {}, devolucao: null, historico: [] },
  { id: 'f2', personId: 'p02', tipo: 'mensal', periodo: 'agosto de 2026', situacao: 'em_aprovacao',
    versao: 1, redator: 'Tatiane Técnica (fictícia)', aprovador: null, devolucao: null,
    eixos: {
      saude: 'Consulta odontológica realizada em 12/08, sem intercorrências.',
      escola: 'Frequência regular; reunião de responsáveis em 20/08.',
      convivencia: 'Participou das atividades coletivas e combinou o revezamento do videogame.',
      familia: 'Visita da avó materna autorizada em 16/08.',
    },
    historico: [{ id: 'h1', quem: 'Tatiane Técnica (fictícia)', acao: 'enviado para aprovação',
      em: emHoras(11, 0), nota: null }] },
  { id: 'f3', personId: 'p03', tipo: 'semanal', periodo: 'semana de 24 a 30 de agosto',
    situacao: 'rascunho', versao: 1, redator: 'Tatiane Técnica (fictícia)', aprovador: null,
    devolucao: null, eixos: { escola: 'Entregou o trabalho de ciências em atraso combinado com a escola.' },
    historico: [] },
  { id: 'f4', personId: 'p04', tipo: 'mensal', periodo: 'julho de 2026', situacao: 'aprovado',
    versao: 1, redator: 'Tatiane Técnica (fictícia)', aprovador: 'Carla Coordenadora (fictícia)',
    devolucao: null,
    eixos: {
      saude: 'Dieta sem lactose mantida; sem intercorrência no período.',
      escola: 'Boletim do semestre entregue; sem faltas.',
      convivencia: 'Boa adaptação ao quarto novo.',
      familia: 'Sem visitas no período; contato telefônico autorizado mantido.',
    },
    historico: [{ id: 'h2', quem: 'Carla Coordenadora (fictícia)', acao: 'aprovado',
      em: emHoras(8, 0), nota: null }] },
];
interface Relatorio {
  id: string; tipo: string; personId: string | null; periodo: string;
  situacao: 'em_aprovacao' | 'aprovado'; finalidade: string; autor: string;
  entregas: { id: string; destino: string; meio: string; em: string; protocolo: string | null;
              por: string }[];
}
let RELATORIOS: Relatorio[] = [
  { id: 'r1', tipo: 'Judiciário', personId: 'p02', periodo: 'agosto de 2026',
    situacao: 'em_aprovacao', finalidade: 'Audiência concentrada marcada para setembro.',
    autor: 'Tatiane Técnica (fictícia)', entregas: [] },
  { id: 'r2', tipo: 'Mensal da casa', personId: null, periodo: 'julho de 2026',
    situacao: 'aprovado', finalidade: 'Prestação de contas interna da unidade.',
    autor: 'Carla Coordenadora (fictícia)',
    entregas: [{ id: 'en1', destino: 'Diretoria da Fundação', meio: 'Entrega em mãos',
      em: emHoras(9, 30), protocolo: null, por: 'Carla Coordenadora (fictícia)' }] },
  { id: 'r3', tipo: 'Alimentação e restrições', personId: null, periodo: 'agosto de 2026',
    situacao: 'aprovado', finalidade: 'Planejamento do cardápio da cozinha.',
    autor: 'Tatiane Técnica (fictícia)', entregas: [] },
];

/**
 * ARQUIVO DOCUMENTAL (Drive institucional).
 *
 * Não é backup do sistema: banco e arquivos têm backup técnico próprio. Aqui
 * vai a CÓPIA do que a instituição fechou. Nunca sobrescreve — correção vira
 * V2_ADENDO ao lado da V1 — e o nome do arquivo não carrega nome, CPF nem
 * diagnóstico.
 */
interface Arquivado {
  id: string; categoria: string; caminho: string; arquivo: string;
  estado: 'verificado' | 'salvo' | 'enviando' | 'aguardando' | 'falhou';
  restrito: boolean; tentativas: number; erro: string | null; fechadoEm: string;
}
let ARQUIVO: Arquivado[] = [
  { id: 'a1', categoria: 'ATA', caminho: 'ACOLHIMENTO/AI3/2026/08/ata',
    arquivo: 'ata_2026-08-27_9f2c1a44_V1.pdf', estado: 'verificado', restrito: false,
    tentativas: 1, erro: null, fechadoEm: emHoras(19, 10) },
  { id: 'a2', categoria: 'Adendo', caminho: 'ACOLHIMENTO/AI3/2026/08/adendo',
    arquivo: 'adendo_2026-08-27_9f2c1a44_V2_ADENDO.pdf', estado: 'verificado', restrito: false,
    tentativas: 1, erro: null, fechadoEm: emHoras(20, 5) },
  { id: 'a3', categoria: 'Narrativa restrita', caminho: 'RESTRITO/AI3/2026/08/narrativa_restrita',
    arquivo: 'narrativa_restrita_2026-08-26_5b1e77a0_V1.pdf', estado: 'salvo', restrito: true,
    tentativas: 1, erro: null, fechadoEm: emHoras(7, 50) },
  { id: 'a4', categoria: 'Ocorrência', caminho: 'ACOLHIMENTO/AI3/2026/08/ocorrencia',
    arquivo: 'ocorrencia_2026-08-26_c31d0e12_V1.pdf', estado: 'falhou', restrito: false,
    tentativas: 3, erro: 'Drive indisponível', fechadoEm: emHoras(6, 30) },
];
/** Documentos por acolhido, com versões. A V1 nunca some quando entra a V2. */
const DOCUMENTOS = [
  { id: 'dc1', personId: 'p01', categoria: 'saude', titulo: 'Receita em vigência',
    versoes: [
      { versao: 1, arquivo: 'receita_2026-06-02_1a2b3c44_V1.pdf', em: emHoras(6, 0),
        por: 'Enfermeira Fictícia', vigente: false },
      { versao: 2, arquivo: 'receita_2026-08-01_1a2b3c44_V2_ADENDO.pdf', em: emHoras(6, 10),
        por: 'Enfermeira Fictícia', vigente: true },
    ] },
  { id: 'dc2', personId: 'p01', categoria: 'escolar', titulo: 'Boletim do semestre',
    versoes: [{ versao: 1, arquivo: 'boletim_2026-07-15_7c9d0e21_V1.pdf', em: emHoras(6, 20),
      por: 'Tatiane Técnica (fictícia)', vigente: true }] },
  { id: 'dc3', personId: 'p11', categoria: 'judicial_socioassistencial', titulo: 'Guia de acolhimento',
    versoes: [{ versao: 1, arquivo: 'guia_2026-02-25_44ff10ab_V1.pdf', em: emHoras(6, 30),
      por: 'Carla Coordenadora (fictícia)', vigente: true }] },
  { id: 'dc4', personId: 'p02', categoria: 'saude', titulo: 'Encaminhamento odontológico',
    versoes: [{ versao: 1, arquivo: 'encaminhamento_2026-08-12_31ac77e0_V1.pdf', em: emHoras(6, 40),
      por: 'Tatiane Técnica (fictícia)', vigente: true }] },
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

/** Pedidos de substituição do protótipo — um deles já sem efeito. */
const PEDIDOS_SUB = [
  { id: 'sub1', atividade: 'Consulta odontológica — Luiz', motivo: 'Preciso sair mais cedo hoje.',
    status: 'solicitada', pedidoPor: 'Mário Silva (fictício)',
    solicitadoEm: new Date().toISOString(), semEfeito: false, aviso: null as string | null },
  { id: 'sub2', atividade: 'Café da manhã', motivo: 'Fiquei retido no transporte.',
    status: 'solicitada', pedidoPor: 'Joana Lima (fictícia)',
    solicitadoEm: new Date().toISOString(), semEfeito: true,
    aviso: 'A atividade já foi encerrada como "Concluída no horário" enquanto o pedido '
         + 'aguardava. Não cabe substituir o que já aconteceu — recuse o pedido com o motivo.' },
];

/** Token de mentira do protótipo: entre com ?convite=demo na barra de endereço. */
const CONVITE_DEMO = 'demo';
const EMAIL_DEMO = 'mbarbosa@paodospobres.com.br';
let conviteGasto = false;

function responder(rota: string, seg: string[], q: URLSearchParams,
                   b: any, metodo: string): unknown {
  // ---- entrada
  // Passo 1 da entrada: esta conta já tem senha?
  if (rota === '/auth/primeiro-acesso') {
    const u = USUARIOS[String(b.email ?? '').toLowerCase().trim()];
    // Conta que não existe responde como as que têm senha: quem digita um
    // e-mail errado não descobre por aqui quem trabalha na Fundação.
    return { temSenha: !u || u.senha !== null };
  }
  /*
   * Convite de primeiro acesso. No protótipo o "e-mail" não sai daqui: o
   * token de mentira é sempre o mesmo, e a tarja já avisa que nada é real.
   * O que este trecho demonstra é o CAMINHO — conferir antes de pedir senha,
   * gastar o convite uma vez, e o link vencido não contar de quem era.
   */
  if (rota === '/auth/convite/conferir') {
    if (String(b.convite ?? '') !== CONVITE_DEMO || conviteGasto) {
      return new Recusa(410, 'Convite inválido ou vencido. Peça um novo à coordenação.');
    }
    return { valido: true, nome: eu.fullName, email: EMAIL_DEMO };
  }
  if (rota === '/auth/convite/concluir') {
    if (String(b.convite ?? '') !== CONVITE_DEMO || conviteGasto) {
      return new Recusa(410, 'Convite inválido ou vencido. Peça um novo à coordenação.');
    }
    if (String(b.novaSenha ?? '').length < 8) {
      return new Recusa(400, 'A senha precisa de pelo menos 8 caracteres.');
    }
    conviteGasto = true;                 // uma vez só, também aqui
    eu.senha = String(b.novaSenha);
    return { ok: true, token: 'prototipo' };
  }
  if (rota.startsWith('/staff/') && rota.endsWith('/convite')) {
    return {
      ok: true,
      expiraEm: new Date(Date.now() + 24 * 3600_000).toISOString(),
      aviso: 'Convite enviado para o e-mail institucional. Vale 24 horas e serve uma vez. '
           + 'No protótipo nenhum e-mail é enviado de verdade.',
    };
  }
  if (rota === '/auth/login') {
    const u = USUARIOS[String(b.email ?? '').toLowerCase().trim()];
    if (!u) return new Recusa(401, 'E-mail ou senha inválidos.');
    if (u.senha !== null && b.password !== u.senha) {
      return new Recusa(401, 'E-mail ou senha inválidos.');
    }
    eu = u;
    return { token: 'prototipo' };
  }
  if (rota === '/auth/logout') return { ok: true };
  /*
   * Só no protótipo: o seletor "Ver como" troca o cargo da sessão de mentira
   * também aqui dentro. Sem isto, a tela mudava de cargo e o servidor de
   * mentira continuava respondendo com o cargo do login — e as áreas
   * restritas devolviam 403 para um cargo que, na tela, podia entrar.
   */
  if (rota === '/prototipo/cargo') {
    eu.role = String(b.role ?? eu.role);
    cofreLiberado = false;   // trocar de cargo fecha o cofre: a porta é por pessoa.
    return { ok: true };
  }
  if (rota === '/auth/password') {
    // Vale enquanto a página estiver aberta: a partir daqui a conta pede senha.
    eu.senha = String(b.novaSenha ?? '');
    return { ok: true, aviso: 'Senha criada. No protótipo ela vale só nesta janela.' };
  }
  if (rota === '/users/me') {
    return {
      id: eu.id, email: Object.keys(USUARIOS).find((e) => USUARIOS[e].id === eu.id),
      fullName: eu.fullName, role: eu.role,
      mustChangePassword: false, semSenha: eu.senha === null,
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
  /*
   * O dia das unidades no protótipo.
   *
   * O servidor de mentira tem uma casa só, então a lista repete a linha do
   * tempo da Casa 03 com a etiqueta da unidade. O que a tela precisa mostrar
   * é o formato: tudo em ordem, com a origem em cada linha, sem contagem que
   * vire comparação entre casas.
   */
  if (rota === '/timeline/all') {
    const eventos = LINHA.map((e) => ({ ...e, casa: 'AI3' }))
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return {
      data: String(q.get('date') ?? ''),
      modo: 'casa',
      unidades: [{ casa: 'AI3', nome: 'Casa 03 (piloto)', eventos: eventos.length }],
      incompleta: false,
      fontesIndisponiveis: [],
      eventos,
      nota: 'Dia completo das unidades que você alcança, das 00h00 às 23h59 no horário '
          + 'de Porto Alegre, em ordem. Não é medição de casa nem de equipe: não há '
          + 'contagem por pessoa nem comparação entre unidades.',
    };
  }

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
    // Registro pelo colega: os DOIS nomes, sempre juntos (§8.2). No protótipo
    // isso aparece exatamente como vai aparecer na linha do tempo real.
    const colega = b.realizadoPor
      ? EQUIPE_CASA.find((m) => m.id === b.realizadoPor)?.nome ?? 'Colega'
      : null;
    if (ev) {
      ev.state = ESTADO_LABEL[b.estado] ?? b.estado;
      ev.severity = b.estado === 'concluida_no_horario' ? 'normal' : 'atencao';
      if (colega) {
        ev.responsible = `${colega} — registrado por ${eu.fullName}`;
        ev.note = `Registrado em nome do colega: ${b.motivoRegistroPorOutro ?? ''}`;
      } else {
        ev.note = b.nota ?? null;
      }
    }
    return colega
      ? { ok: true, aviso: 'Registrado em nome do colega. A atividade mostra os dois nomes, '
                         + 'quem realizou e quem registrou, com o motivo.' }
      : { ok: true, aviso: 'Registrado com o seu nome e o horário de agora.' };
  }
  if (seg[0] === 'activities' && seg[2] === 'delegate') {
    const ev = LINHA.find((e) => e.id.endsWith(seg[1]));
    const para = EQUIPE_CASA.find((m) => m.id === b.paraId)?.nome ?? 'Colega';
    if (ev) { ev.state = 'Aguardando ciência'; ev.responsible = para; }
    return { ok: true, aviso: `Atividade delegada a ${para}. Ela volta a aguardar ciência: `
                            + 'designado não é o mesmo que avisado.' };
  }
  /*
   * Substituição no protótipo. Um dos dois pedidos é justamente o caso que
   * o painel existe para explicar: a atividade foi concluída enquanto o
   * pedido aguardava, e a autorização não cabe mais. A tela precisa mostrar
   * isso, não quebrar no clique.
   */
  if (rota === '/activities/substitutions' && metodo === 'GET') {
    return PEDIDOS_SUB.filter((p) => p.status === 'solicitada');
  }
  if (seg[0] === 'activities' && seg[1] === 'substitutions' && seg[3] === 'decline') {
    const p = PEDIDOS_SUB.find((x) => x.id === seg[2]);
    if (!p) return new Recusa(404, 'Pedido não encontrado ou já decidido.');
    if (String(b.motivo ?? '').trim().length < 5) {
      return new Recusa(400, 'Informe o motivo da recusa — quem pediu vai ler.');
    }
    p.status = 'recusada';
    return { ok: true, status: 'recusada',
             aviso: 'Pedido recusado, com motivo e autoria. Quem pediu foi avisado.' };
  }
  if (rota === '/activities/shift-board') {
    // O servidor de verdade devolve o CÓDIGO do estado em `estado` e o texto em
    // `rotulo`; aqui a linha guarda só o texto. A conversão de volta mantém o
    // protótipo fiel ao contrato — sem ela, a tela não separava o que já foi
    // registrado do que está em aberto.
    const codigoDe = (texto: string) =>
      Object.keys(ESTADO_LABEL).find((k) => ESTADO_LABEL[k] === texto) ?? texto;
    return {
      linhas: LINHA.filter((e) => e.id.startsWith('activity:')).map((e) => ({
        atividadeId: e.id, titulo: e.title, horario: e.at,
        estado: codigoDe(e.state), rotulo: e.state,
        responsavel: e.responsible ?? 'Equipe do plantão',
        acolhido: e.personName,
      })),
      nota: 'Quem está em quê neste turno. Não é medição de ninguém: não há contagem '
          + 'por pessoa, ordenação por desempenho nem histórico de deslocamento.',
    };
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

  // ---- saúde: doses, estoque, triagem e resumo
  if (rota === '/health/panel') {
    const doses = DOSES.map((d) => ({
      id: d.id, horario: d.horario, medicamento: d.medicamento, dose: d.dose, via: d.via,
      tipo: d.tipo, condicaoUso: d.condicaoUso, estado: d.estado, rotulo: d.rotulo,
      pendente: d.pendente, confirmadaPor: d.confirmadaPor,
      acolhido: kid(d.personId)?.nome ?? '—',
      alerta: kid(d.personId)?.alerta?.descricao ?? null,
    }));
    return {
      data: HOJE,
      resumo: {
        administradas: doses.filter((d) => d.estado === 'administrada').length,
        aguardando: doses.filter((d) => d.pendente).length,
        triagensPendentes: TRIAGENS.filter((t) => !t.assinada).length,
        estoqueBaixo: ESTOQUE.filter((e) => e.quantidade < e.minimo).length,
      },
      doses,
      acolhidos: todosKids().map((k) => ({
        id: k.id, nome: k.nome, idade: k.idade,
        alerta: k.alerta?.descricao ?? null,
        cuidado: k.cuidado ?? null,
        doses: DOSES.filter((d) => d.personId === k.id).length,
      })),
    };
  }
  if (rota === '/health/stock') return ESTOQUE;
  if (rota === '/health/triage' && metodo === 'GET') {
    return TRIAGENS.map((t) => ({ ...t, acolhido: kid(t.personId)?.nome ?? '—' }));
  }
  if (seg[0] === 'health' && seg[1] === 'doses' && seg[3] === 'confirm') {
    const d = DOSES.find((x) => x.id === seg[2]);
    if (!d) return new Recusa(404, 'Não encontrado.');
    if (!d.pendente) {
      return new Recusa(400, 'Esta dose já foi confirmada. A correção entra como '
        + 'ocorrência de medicamento, não como reescrita do que foi registrado.');
    }
    if (!String(b.resultado ?? '').trim()) {
      return new Recusa(400, 'Escolha o resultado da dose.');
    }
    if (b.resultado !== 'administrada_no_horario' && String(b.observacao ?? '').trim().length < 5) {
      return new Recusa(400, 'Atraso, recusa, ausência ou incidente pedem observação — '
        + 'é ela que explica o que aconteceu.');
    }
    d.pendente = false;
    d.confirmadaPor = eu.fullName;
    d.estado = b.resultado === 'administrada_no_horario' ? 'administrada' : 'registrada';
    d.rotulo = { administrada_no_horario: 'Administrada no horário',
      administrada_com_atraso: 'Administrada com atraso', recusada: 'Recusada pelo acolhido',
      indisponivel: 'Medicamento indisponível', acolhido_ausente: 'Acolhido ausente',
      incidente: 'Incidente registrado' }[String(b.resultado)] ?? 'Registrada';
    return { ok: true, aviso: 'Dose confirmada em seu nome, com o horário de agora. '
      + 'Só confirma quem administrou; ninguém confirma pelo outro.' };
  }
  if (seg[0] === 'health' && seg[1] === 'triage' && seg[3] === 'sign') {
    const t = TRIAGENS.find((x) => x.id === seg[2]);
    if (!t) return new Recusa(404, 'Não encontrado.');
    if (eu.role !== 'enfermagem') {
      return new Recusa(403, 'A assinatura de saúde é da Enfermagem. A coordenação cobra '
        + 'a pendência, mas não assina no lugar dela.');
    }
    t.assinada = true; t.assinadaPor = eu.fullName;
    t.complemento = String(b.complemento ?? '').trim() || null;
    return { ok: true, aviso: 'Evolução triada, conferida e assinada. Receita nova só altera '
      + 'a grade de medicamentos depois desta revisão.' };
  }
  if (seg[0] === 'health' && seg[1] === 'summary' && metodo === 'POST') {
    if (String(b.finalidade ?? '').trim().length < 3) {
      return new Recusa(400, 'A finalidade da emissão é obrigatória e fica registrada.');
    }
    RESUMOS.push({ id: uid(), personId: String(b.personId ?? ''), finalidade: b.finalidade,
      por: eu.fullName, em: new Date().toISOString() });
    return { ok: true, aviso: 'Resumo de Saúde gerado com o mínimo necessário: identificação, '
      + 'alergias, restrições, condições relevantes, medicamentos ativos e atendimentos '
      + 'recentes. Sem dados bancários, conteúdo judicial nem narrativas. A finalidade e o '
      + 'download ficaram registrados com o seu nome.' };
  }

  // ---- ocorrências
  if (rota === '/incidents/categories') return CATEGORIAS_OCORRENCIA;
  if (rota === '/incidents' && metodo === 'GET') {
    return OCORRENCIAS.map((o) => {
      const cat = CATEGORIAS_OCORRENCIA.find((c) => c.cod === o.categoria)!;
      return {
        id: o.id, categoria: cat.label, tom: cat.tom, exigeRevisao: cat.exigeRevisao,
        restrita: cat.restrita, acolhido: o.personId ? kid(o.personId)?.nome ?? '—' : 'Casa toda',
        fato: o.fato, medidas: o.medidas,
        // Campo restrito não é filtro de tela por acaso: quem não pode ler recebe null.
        falaEspontanea: ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)
          ? o.falaEspontanea : null,
        abertaPor: o.abertaPor, abertaEm: o.abertaEm,
        etapaOperacional: o.etapaOperacional, situacao: o.situacao,
        avisados: o.avisados, acompanhamento: o.acompanhamento,
      };
    });
  }
  if (rota === '/incidents' && metodo === 'POST') {
    const cat = CATEGORIAS_OCORRENCIA.find((c) => c.cod === b.categoria);
    if (!cat) return new Recusa(400, 'Escolha a categoria da ocorrência.');
    if (String(b.fato ?? '').trim().length < 10) {
      return new Recusa(400, 'Descreva o fato: o que aconteceu, o horário e o que foi '
        + 'feito na hora. Fato e contexto, sem rótulo.');
    }
    if (String(b.medidas ?? '').trim().length < 5) {
      return new Recusa(400, 'Descreva as medidas imediatas de proteção e atendimento.');
    }
    const avisados = ['Líder Diurno', 'equipe técnica', 'coordenação']
      .concat(/saude|medicamento/.test(String(b.categoria)) ? ['Enfermagem'] : []);
    const nova: Ocorrencia = {
      id: uid(), categoria: cat.cod, personId: b.personId || null,
      fato: b.fato, medidas: b.medidas,
      falaEspontanea: cat.restrita ? (String(b.falaEspontanea ?? '').trim() || null) : null,
      abertaPor: eu.fullName, abertaEm: new Date().toISOString(),
      etapaOperacional: 'aberta', situacao: 'em_andamento', avisados, acompanhamento: [],
    };
    OCORRENCIAS = [nova, ...OCORRENCIAS];
    return { id: nova.id, avisados, exigeRevisao: cat.exigeRevisao,
      aviso: (cat.exigeRevisao
        ? 'Ocorrência aberta. Encerrada a etapa operacional, ela AGUARDA revisão técnica — '
          + 'não se encerra sozinha.'
        : 'Ocorrência aberta e em acompanhamento. Ela não se encerra sozinha.')
        + ` Avisados agora: ${avisados.join(', ')}. O Gestor Geral não recebe automaticamente: `
        + 'quem escalona é a equipe técnica ou a coordenação.' };
  }
  if (seg[0] === 'incidents' && seg[2] === 'note') {
    const o = OCORRENCIAS.find((x) => x.id === seg[1]);
    if (!o) return new Recusa(404, 'Não encontrado.');
    if (String(b.texto ?? '').trim().length < 5) {
      return new Recusa(400, 'Escreva o acompanhamento antes de registrar.');
    }
    o.acompanhamento = [...o.acompanhamento, { id: uid(), quem: eu.fullName,
      texto: b.texto, em: new Date().toISOString() }];
    return { ok: true, aviso: 'Acompanhamento registrado ao lado do que já estava escrito. '
      + 'Nada foi reescrito.' };
  }
  if (seg[0] === 'incidents' && seg[2] === 'operational-close') {
    const o = OCORRENCIAS.find((x) => x.id === seg[1]);
    if (!o) return new Recusa(404, 'Não encontrado.');
    const cat = CATEGORIAS_OCORRENCIA.find((c) => c.cod === o.categoria)!;
    o.etapaOperacional = 'encerrada';
    o.situacao = cat.exigeRevisao ? 'aguardando_revisao' : 'aguardando_revisao';
    return { ok: true, aviso: 'Etapa operacional encerrada. A ocorrência continua aberta '
      + 'aguardando a análise de quem responde pelo caso.' };
  }
  if (seg[0] === 'incidents' && seg[2] === 'close') {
    const o = OCORRENCIAS.find((x) => x.id === seg[1]);
    if (!o) return new Recusa(404, 'Não encontrado.');
    const cat = CATEGORIAS_OCORRENCIA.find((c) => c.cod === o.categoria)!;
    if (cat.exigeRevisao && !['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Esta categoria só se encerra com validação da equipe técnica '
        + 'ou da coordenação. A etapa operacional você pode encerrar; a análise, não.');
    }
    if (String(b.sintese ?? '').trim().length < 15) {
      return new Recusa(400, 'A síntese é obrigatória: é ela que diz a que se chegou e o que '
        + 'fica combinado. Ela entra como registro novo, sem apagar nenhum relato.');
    }
    o.acompanhamento = [...o.acompanhamento, { id: uid(), quem: eu.fullName,
      texto: b.sintese, em: new Date().toISOString() }];
    o.situacao = 'encerrada';
    return { ok: true, aviso: 'Ocorrência encerrada com síntese assinada por você. Os relatos '
      + 'originais continuam como foram escritos, e a ocorrência pode ser reaberta com histórico.' };
  }
  if (seg[0] === 'incidents' && seg[2] === 'reopen') {
    const o = OCORRENCIAS.find((x) => x.id === seg[1]);
    if (!o) return new Recusa(404, 'Não encontrado.');
    o.situacao = 'aguardando_revisao';
    o.acompanhamento = [...o.acompanhamento, { id: uid(), quem: eu.fullName,
      texto: `Reaberta. Motivo: ${String(b.motivo ?? '—')}`, em: new Date().toISOString() }];
    return { ok: true, aviso: 'Reaberta com histórico. Nada foi apagado.' };
  }

  // ---- ATA
  if (rota === '/minutes') {
    return {
      casa: { ...ATA_CASA,
        podeFechar: ['lider_diurno', 'coordenador', 'gestor_geral'].includes(eu.role),
        assinaturasFaltantes: ATA_CASA.passagens.filter((p) => !p.assinada).length },
      geral: { ...ATA_GERAL,
        podeFechar: ['lider_noturno_geral', 'coordenador', 'gestor_geral'].includes(eu.role),
        casasAguardando: ATA_GERAL.casas.filter((c) => c.ataNoturna !== 'confirmada').length },
    };
  }
  if (rota === '/minutes/house/close') {
    if (ATA_CASA.estado === 'fechada') {
      return new Recusa(400, 'Esta ATA já foi fechada. O que vier depois entra como adendo, '
        + 'ao lado — registro fechado não é reescrito.');
    }
    const faltam = ATA_CASA.passagens.filter((p) => !p.assinada);
    if (faltam.length && !b.comPendencia) {
      return new Recusa(400, `Falta a passagem de ${faltam.map((p) => p.quem).join(', ')}. `
        + 'O sistema não assina no lugar de ninguém: feche com pendência, dizendo o que faltou.');
    }
    if (b.comPendencia && String(b.motivoPendencia ?? '').trim().length < 10) {
      return new Recusa(400, 'Descreva a pendência — é ela que a equipe técnica e a coordenação '
        + 'vão ler amanhã.');
    }
    ATA_CASA = { ...ATA_CASA, estado: 'fechada', comPendencia: !!b.comPendencia,
      motivoPendencia: b.comPendencia ? b.motivoPendencia : null,
      fechadaPor: eu.fullName, fechadaEm: new Date().toISOString() };
    ARQUIVO = [{ id: uid(), categoria: 'ATA', caminho: `ACOLHIMENTO/${CASA.code}/2026/08/ata`,
      arquivo: `ata_${HOJE}_${uid()}_V1.pdf`, estado: 'aguardando', restrito: false,
      tentativas: 0, erro: null, fechadoEm: new Date().toISOString() }, ...ARQUIVO];
    return { ok: true, aviso: b.comPendencia
      ? 'ATA fechada COM PENDÊNCIA, com a sua assinatura e o motivo escrito. Nenhuma assinatura '
        + 'foi criada em nome de terceiros. Equipe técnica e coordenação avisadas.'
      : 'ATA fechada e consolidada. A cópia documental entrou na fila do arquivo.' };
  }
  if (rota === '/minutes/general/close') {
    if (ATA_GERAL.estado === 'fechada') {
      return new Recusa(400, 'A ATA Geral desta noite já foi fechada.');
    }
    const aguardando = ATA_GERAL.casas.filter((c) => c.ataNoturna !== 'confirmada');
    if (aguardando.length && !b.comPendencia) {
      return new Recusa(400, `${aguardando.map((c) => c.codigo).join(', ')} ainda não confirmou `
        + 'a ATA noturna da casa. Feche com pendência, dizendo o que faltou.');
    }
    if (b.comPendencia && String(b.motivoPendencia ?? '').trim().length < 10) {
      return new Recusa(400, 'Descreva a pendência da ATA Geral.');
    }
    ATA_GERAL = { ...ATA_GERAL, estado: 'fechada', comPendencia: !!b.comPendencia,
      motivoPendencia: b.comPendencia ? b.motivoPendencia : null,
      fechadaPor: eu.fullName, fechadaEm: new Date().toISOString() };
    return { ok: true, aviso: 'ATA Geral Noturna assinada e fechada por você. Cada educador '
      + 'assinou apenas a própria passagem — nenhuma assinatura foi presumida.' };
  }

  // ---- cofre de acessos
  if (rota.startsWith('/vault')) {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Seu cargo não tem acesso a este conteúdo.');
    }
  }
  if (rota === '/vault/reauth') {
    // No protótipo qualquer senha com 4 caracteres serve; no sistema real é a
    // senha da própria conta, conferida de novo, mesmo com a sessão aberta.
    if (String(b.senha ?? '').length < 4) {
      return new Recusa(401, 'Senha incorreta. O cofre pede a sua senha de novo, mesmo com a '
        + 'sessão já aberta.');
    }
    cofreLiberado = true;
    return { ok: true, aviso: 'Acesso liberado nesta janela. Cada abertura de senha continua '
      + 'pedindo finalidade e fica registrada.' };
  }
  if (rota === '/vault' && metodo === 'GET') {
    if (!cofreLiberado) return new Recusa(401, 'Confirme sua senha para continuar.');
    return COFRE.map((c) => ({
      id: c.id, acolhido: kid(c.personId)?.nome ?? '—', tipo: c.tipo, login: c.login,
      dica: c.dica, responsavel: c.responsavel,
    }));
  }
  if (rota === '/vault/history') {
    if (!cofreLiberado) return new Recusa(401, 'Confirme sua senha para continuar.');
    return COFRE_HIST;
  }
  if (seg[0] === 'vault' && seg[2] === 'reveal') {
    if (!cofreLiberado) return new Recusa(401, 'Confirme sua senha para continuar.');
    const c = COFRE.find((x) => x.id === seg[1]);
    if (!c) return new Recusa(404, 'Não encontrado.');
    if (String(b.finalidade ?? '').trim().length < 5) {
      return new Recusa(400, 'Descreva para que você precisa deste acesso. A finalidade fica '
        + 'registrada com o seu nome e o horário.');
    }
    COFRE_HIST = [{ id: uid(), quem: eu.fullName,
      acao: eu.role === 'gestor_geral' ? 'abertura excepcional' : 'abertura',
      em: new Date().toISOString(), finalidade: b.finalidade,
      excepcional: eu.role === 'gestor_geral' }, ...COFRE_HIST];
    return { senha: c.senha, aviso: 'Abertura registrada. Feche a janela quando terminar — '
      + 'a senha não fica na tela.' };
  }
  if (rota === '/vault' && metodo === 'POST') {
    if (!cofreLiberado) return new Recusa(401, 'Confirme sua senha para continuar.');
    return { ok: true, aviso: 'No protótipo o acesso não é guardado. No sistema real ele é '
      + 'cifrado antes de ser gravado, e trocar a senha depois não apaga o histórico de '
      + 'quem já a abriu.' };
  }

  // ---- transferências
  if (rota === '/transfers' && metodo === 'GET') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Seu cargo não tem acesso a este conteúdo.');
    }
    return TRANSFERENCIAS;
  }
  if (rota === '/transfers' && metodo === 'POST') {
    if (String(b.motivo ?? '').trim().length < 15) {
      return new Recusa(400, 'O motivo é obrigatório: é ele que a outra coordenação vai ler '
        + 'para decidir.');
    }
    const k = kid(String(b.personId ?? ''));
    if (!k) return new Recusa(400, 'Escolha o acolhido.');
    TRANSFERENCIAS = [{
      id: uid(), caixa: 'enviada', nomeCivil: k.civil, nome: k.nome, idade: k.idade,
      outraCasa: String(b.destino ?? ''), motivo: b.motivo, pedidaPor: eu.fullName,
      pedidaEm: new Date().toISOString(), situacao: 'solicitada', justificativa: null,
      decididaPor: null, decididaEm: null, mensagens: [],
    }, ...TRANSFERENCIAS];
    return { ok: true, aviso: 'Pedido enviado à coordenação de destino. A criança só muda de '
      + 'casa no aceite — até lá, a responsabilidade continua sendo desta unidade.' };
  }
  if (seg[0] === 'transfers' && seg[2] === 'message') {
    const t = TRANSFERENCIAS.find((x) => x.id === seg[1]);
    if (!t) return new Recusa(404, 'Não encontrado.');
    if (!String(b.texto ?? '').trim()) return new Recusa(400, 'Escreva a mensagem antes de enviar.');
    t.mensagens = [...t.mensagens, { id: uid(), casa: CASA.code, autor: eu.fullName,
      texto: b.texto, em: new Date().toISOString() }];
    return { ok: true, aviso: 'Mensagem registrada dentro do sistema, ligada a esta '
      + 'solicitação. Ela não pode ser apagada, e nenhuma coordenação entra na casa da outra.' };
  }
  if (seg[0] === 'transfers' && seg[2] === 'accept') {
    const t = TRANSFERENCIAS.find((x) => x.id === seg[1]);
    if (!t) return new Recusa(404, 'Não encontrado.');
    if (t.caixa !== 'recebida') {
      return new Recusa(400, 'Quem decide é a coordenação de destino. Este pedido é seu; '
        + 'a decisão é da outra casa.');
    }
    if (t.situacao !== 'solicitada') return new Recusa(400, 'Esta solicitação já foi decidida.');
    t.situacao = 'aceita'; t.decididaPor = eu.fullName; t.decididaEm = new Date().toISOString();
    return { ok: true, aviso: `${t.nome} passa a ser desta casa e o perfil abre por completo. `
      + 'Histórico, documentos, medicamentos, alergias e pendências vêm junto; as ATAs fechadas '
      + 'da origem continuam imutáveis; e os dados bancários deixam a coordenação de origem.' };
  }
  if (seg[0] === 'transfers' && seg[2] === 'refuse') {
    const t = TRANSFERENCIAS.find((x) => x.id === seg[1]);
    if (!t) return new Recusa(404, 'Não encontrado.');
    if (String(b.justificativa ?? '').trim().length < 15) {
      return new Recusa(400, 'A justificativa é obrigatória e fica registrada nas duas casas. '
        + 'É por ela que a coordenação de origem decide o próximo passo da criança.');
    }
    t.situacao = 'recusada'; t.justificativa = b.justificativa;
    t.decididaPor = eu.fullName; t.decididaEm = new Date().toISOString();
    return { ok: true, aviso: 'Recusa registrada com justificativa nas duas casas. '
      + 'Nada mudou de lugar.' };
  }
  if (seg[0] === 'transfers' && seg[2] === 'cancel') {
    const t = TRANSFERENCIAS.find((x) => x.id === seg[1]);
    if (!t) return new Recusa(404, 'Não encontrado.');
    if (String(b.motivo ?? '').trim().length < 10) {
      return new Recusa(400, 'Diga por que o pedido está sendo cancelado — a outra '
        + 'coordenação vai ler.');
    }
    t.situacao = 'cancelada'; t.justificativa = b.motivo;
    t.decididaPor = eu.fullName; t.decididaEm = new Date().toISOString();
    return { ok: true, aviso: 'Pedido cancelado com motivo. O histórico continua visível '
      + 'nas duas casas.' };
  }

  // ---- acompanhamentos e relatórios
  if (rota === '/followups/axes') return EIXOS;
  if (rota === '/followups' && metodo === 'GET') {
    return ACOMPANHAMENTOS.map((f) => ({
      ...f, acolhido: kid(f.personId)?.nome ?? '—',
      proprio: f.redator === eu.fullName,
      podeAprovar: ['coordenador', 'gestor_geral'].includes(eu.role),
    }));
  }
  if (rota === '/followups/generate') {
    return { criadas: 0, aviso: 'Pendências da semana e do mês criadas para os acolhidos '
      + 'ativos. Os eixos nascem vazios: a automação cria a pendência e nunca escreve a '
      + 'avaliação — o texto é de quem acompanha o caso.' };
  }
  if (seg[0] === 'followups' && seg[2] === 'save') {
    const f = ACOMPANHAMENTOS.find((x) => x.id === seg[1]);
    if (!f) return new Recusa(404, 'Não encontrado.');
    if (f.situacao === 'aprovado') {
      return new Recusa(400, 'Acompanhamento aprovado não se edita. Corrigir cria a versão '
        + 'seguinte, que precisa de nova aprovação — e a anterior continua legível.');
    }
    const eixos = (b.eixos ?? {}) as Record<string, string>;
    const enviar = !!b.enviar;
    if (enviar) {
      const vazios = EIXOS.filter((e) => !String(eixos[e.cod] ?? '').trim());
      if (vazios.length) {
        return new Recusa(400, `Faltam eixos: ${vazios.map((e) => e.label).join('; ')}. `
          + 'Os eixos são obrigatórios — o que não foi observado se escreve como não observado, '
          + 'não se deixa em branco.');
      }
    }
    f.eixos = eixos;
    f.redator = eu.fullName;
    f.situacao = enviar ? 'em_aprovacao' : 'rascunho';
    f.devolucao = null;
    f.historico = [...f.historico, { id: uid(), quem: eu.fullName,
      acao: enviar ? 'enviado para aprovação' : 'rascunho salvo',
      em: new Date().toISOString(), nota: null }];
    return { ok: true, aviso: enviar
      ? 'Enviado para aprovação, com o seu nome como quem redigiu.'
      : 'Rascunho salvo. Ninguém além de você o lê enquanto não for enviado.' };
  }
  if (seg[0] === 'followups' && seg[2] === 'approve') {
    const f = ACOMPANHAMENTOS.find((x) => x.id === seg[1]);
    if (!f) return new Recusa(404, 'Não encontrado.');
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Aprovar acompanhamento é da coordenação.');
    }
    if (f.redator === eu.fullName) {
      return new Recusa(400, 'Você redigiu este acompanhamento. Revisão feita pelo próprio '
        + 'autor não é revisão.');
    }
    f.situacao = 'aprovado'; f.aprovador = eu.fullName;
    f.historico = [...f.historico, { id: uid(), quem: eu.fullName, acao: 'aprovado',
      em: new Date().toISOString(), nota: String(b.nota ?? '') || null }];
    ARQUIVO = [{ id: uid(), categoria: 'Acompanhamento',
      caminho: `ACOLHIMENTO/${CASA.code}/2026/08/acompanhamento`,
      arquivo: `acompanhamento_${HOJE}_${uid()}_V${f.versao}.pdf`, estado: 'aguardando',
      restrito: false, tentativas: 0, erro: null, fechadoEm: new Date().toISOString() },
      ...ARQUIVO];
    return { ok: true, aviso: 'Aprovado. Esta versão virou o retrato daquele momento: não se '
      + 'edita mais, e a cópia documental entrou na fila do arquivo.' };
  }
  if (seg[0] === 'followups' && seg[2] === 'return') {
    const f = ACOMPANHAMENTOS.find((x) => x.id === seg[1]);
    if (!f) return new Recusa(404, 'Não encontrado.');
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Devolver acompanhamento é da coordenação.');
    }
    if (String(b.motivo ?? '').trim().length < 10) {
      return new Recusa(400, 'Escreva o que precisa ser revisto. Devolver sem dizer o que '
        + 'falta devolve o trabalho duas vezes.');
    }
    f.situacao = 'rascunho'; f.devolucao = b.motivo;
    f.historico = [...f.historico, { id: uid(), quem: eu.fullName, acao: 'devolvido para revisão',
      em: new Date().toISOString(), nota: b.motivo }];
    return { ok: true, aviso: 'Devolvido a quem redigiu, com o seu nome e o que você pediu. '
      + 'O texto anterior continua lá — nada foi apagado.' };
  }
  if (seg[0] === 'followups' && seg[2] === 'correct') {
    const f = ACOMPANHAMENTOS.find((x) => x.id === seg[1]);
    if (!f) return new Recusa(404, 'Não encontrado.');
    if (String(b.motivo ?? '').trim().length < 10) {
      return new Recusa(400, 'Diga o que está sendo corrigido e por quê.');
    }
    const nova: Acompanhamento = {
      ...f, id: uid(), versao: f.versao + 1, situacao: 'rascunho',
      aprovador: null, redator: eu.fullName, devolucao: null,
      historico: [{ id: uid(), quem: eu.fullName,
        acao: `nova versão a partir da V${f.versao}`, em: new Date().toISOString(),
        nota: b.motivo }],
    };
    ACOMPANHAMENTOS = [nova, ...ACOMPANHAMENTOS];
    return { ok: true, aviso: `Criada a versão ${nova.versao}, que precisa de nova aprovação. `
      + `A V${f.versao} continua legível exatamente como foi aprovada.` };
  }
  if (rota === '/reports/kinds') {
    // Mesma lista do servidor, com o mesmo filtro por cargo: quem não pode
    // ver dado bancário não recebe o tipo de benefícios.
    const podeBanco = ['coordenador', 'gestor_geral'].includes(eu.role);
    return [
      { cod: 'diario', label: 'Diário', escopo: 'casa' },
      { cod: 'semanal', label: 'Semanal', escopo: 'pessoa' },
      { cod: 'mensal', label: 'Mensal', escopo: 'pessoa' },
      { cod: 'periodo', label: 'Período personalizado', escopo: 'casa' },
      { cod: 'individual', label: 'Individual completo', escopo: 'pessoa' },
      { cod: 'desenvolvimento', label: 'Desenvolvimento da criança na casa', escopo: 'pessoa' },
      { cod: 'ocorrencias', label: 'Ocorrências', escopo: 'casa' },
      { cod: 'alimentacao', label: 'Alimentação e restrições', escopo: 'casa' },
      { cod: 'saude', label: 'Evolução e Resumo de Saúde', escopo: 'pessoa' },
      { cod: 'judiciario', label: 'Judiciário', escopo: 'pessoa', exigeAprovacao: true },
      { cod: 'audiencia', label: 'Audiência concentrada', escopo: 'pessoa', exigeAprovacao: true },
      { cod: 'mensal_da_casa', label: 'Mensal da casa', escopo: 'casa', exigeAprovacao: true },
      ...(podeBanco
        ? [{ cod: 'beneficios', label: 'Benefícios e dados bancários', escopo: 'pessoa' }]
        : []),
    ];
  }
  if (rota === '/reports' && metodo === 'POST') {
    const acolhido = b.personId ? kid(String(b.personId))?.nome ?? null : null;
    const novo = {
      id: `rel-${Date.now()}`,
      tipo: String(b.kind ?? ''),
      personId: b.personId ?? null,
      periodo: `${String(b.de ?? '')} a ${String(b.ate ?? '')}`,
      finalidade: String(b.finalidade ?? ''),
      situacao: 'rascunho',
      autor: eu.fullName,
      entregas: [] as any[],
    };
    RELATORIOS.unshift(novo as any);
    return {
      id: novo.id, situacao: 'rascunho', acolhido,
      aviso: 'Relatório criado com a parte factual já preenchida pelo sistema. '
           + 'Os campos de avaliação ficam em branco para a equipe escrever.',
    };
  }
  if (rota === '/reports' && metodo === 'GET') {
    return RELATORIOS.map((r) => ({
      ...r, acolhido: r.personId ? kid(r.personId)?.nome ?? '—' : null,
      podeAprovar: ['coordenador', 'gestor_geral'].includes(eu.role) && r.autor !== eu.fullName,
    }));
  }
  /*
   * Exportação em Word no protótipo.
   *
   * O documento de verdade é montado no servidor, com o timbre da Fundação e o
   * conteúdo puxado dos registros. Aqui não há servidor, então o protótipo
   * entrega um arquivo de texto que explica isso e mostra o que o documento
   * real traz. Fingir um .docx com timbre daria a impressão de que a parte
   * mais delicada já está pronta e conferida, e ela precisa ser conferida
   * contra o banco, não contra uma tela.
   */
  if (seg[0] === 'reports' && seg[2] === 'export') {
    const r = RELATORIOS.find((x) => x.id === seg[1]);
    const texto = [
      'PROTÓTIPO — DOCUMENTO DE MENTIRA, DADOS FICTÍCIOS',
      '',
      `Relatório: ${r?.tipo ?? '—'}`,
      `Período: ${r?.periodo ?? '—'}`,
      `Finalidade informada: ${String(b.finalidade ?? '')}`,
      '',
      'No sistema real este download é um arquivo do Word (.docx) com:',
      '  · o timbre da Fundação O Pão dos Pobres no cabeçalho;',
      '  · identificação do acolhido, unidade, período e finalidade;',
      '  · a parte factual já escrita pelo sistema (atividades, saúde,',
      '    medicação, ocorrências e acompanhamentos aprovados), cada seção',
      '    dizendo de onde a informação veio;',
      '  · os campos de avaliação e encaminhamento em branco, marcados como',
      '    "a preencher", porque são o que só uma pessoa pode escrever;',
      '  · tarja de RASCUNHO enquanto não houver aprovação de outra pessoa;',
      '  · rodapé com quem gerou, quando, e a numeração das páginas;',
      '  · linha de assinatura com nome e cargo.',
      '',
      'O arquivo sai em Word para a equipe editar. A conversão para PDF é feita',
      'pela própria pessoa, na hora de imprimir ou enviar.',
    ].join('\n');
    return {
      formato: 'docx',
      nomeArquivo: 'PROTOTIPO-relatorio-exemplo.txt',
      conteudoBase64: btoa(unescape(encodeURIComponent(texto))),
      aviso: 'Protótipo: o documento com timbre é gerado pelo servidor. '
           + 'Aqui vai um arquivo de exemplo explicando o que ele contém.',
    };
  }
  if (seg[0] === 'reports' && seg[2] === 'approve') {
    const r = RELATORIOS.find((x) => x.id === seg[1]);
    if (!r) return new Recusa(404, 'Não encontrado.');
    if (r.autor === eu.fullName) {
      return new Recusa(400, 'Você escreveu este relatório. Quem aprova é outra pessoa.');
    }
    r.situacao = 'aprovado';
    return { ok: true, aviso: 'Relatório aprovado. O sistema gera e não envia: a entrega ao '
      + 'Judiciário, ao Conselho Tutelar ou ao Ministério Público é feita por uma pessoa e '
      + 'registrada aqui.' };
  }
  if (seg[0] === 'reports' && seg[2] === 'delivery') {
    const r = RELATORIOS.find((x) => x.id === seg[1]);
    if (!r) return new Recusa(404, 'Não encontrado.');
    if (!String(b.destino ?? '').trim()) return new Recusa(400, 'Informe o destinatário.');
    r.entregas = [...r.entregas, { id: uid(), destino: b.destino,
      meio: b.meio ?? 'Protocolo presencial', em: new Date().toISOString(),
      protocolo: String(b.protocolo ?? '').trim() || null, por: eu.fullName }];
    return { ok: true, aviso: 'Entrega registrada com destinatário, meio, data e o seu nome. '
      + 'Nenhum envio automático saiu do sistema.' };
  }

  // ---- arquivo documental
  if (rota === '/archive') {
    if (eu.role === 'educador' || eu.role === 'cozinha') {
      return new Recusa(403, 'O Drive institucional não abre para o plantão. O que você '
        + 'precisa ler do acolhido está no perfil, com permissão e registro.');
    }
    return {
      itens: ARQUIVO.map((a) => ({ ...a,
        // A pasta restrita é outra raiz e outra permissão — nem todo cargo a enxerga.
        visivel: !a.restrito || ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role) })),
      falhas: ARQUIVO.filter((a) => a.estado === 'falhou').length,
      naFila: ARQUIVO.filter((a) => ['aguardando', 'enviando'].includes(a.estado)).length,
    };
  }
  if (rota === '/archive/documents') {
    if (eu.role === 'educador' || eu.role === 'cozinha') {
      return new Recusa(403, 'Seu cargo não tem acesso a este conteúdo.');
    }
    const pid = q.get('personId');
    return DOCUMENTOS.filter((d) => !pid || d.personId === pid)
      .map((d) => ({ ...d, acolhido: kid(d.personId)?.nome ?? '—' }));
  }
  if (seg[0] === 'archive' && seg[2] === 'retry') {
    const a = ARQUIVO.find((x) => x.id === seg[1]);
    if (!a) return new Recusa(404, 'Não encontrado.');
    a.tentativas += 1; a.estado = 'verificado'; a.erro = null;
    return { ok: true, aviso: 'Reenviado e conferido. A retentativa não duplica: mesma '
      + 'versão, mesmo arquivo.' };
  }

  return new Recusa(404, 'Esta parte do sistema ainda não está no protótipo.');
}
