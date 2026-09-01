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
/*
 * A única coisa que o protótipo importa de fora: a descrição do alcance por
 * cargo, LIDA DA MESMA FONTE que o servidor usa. Uma cópia aqui divergiria na
 * primeira correção — e divergiria justamente na demonstração para a equipe.
 * O arquivo é dado puro, sem dependência nenhuma, e por isso atravessa.
 */
import { ALCANCE_POR_CARGO } from '../../backend/src/modules/identity/alcance';
import { SECOES_ATA, AMBIENTES_CASA, CLASSIFICACOES_EPISODIO }
  from '../../backend/src/modules/shifts/ata-secoes';
import { TIPOS_ROTINA, DIAS_DA_SEMANA }
  from '../../backend/src/modules/routine/rotina-vocabulario';
import { CATEGORIAS_DOSSIE, DOSSIE_EXIGIDO, TIPOS_DE_VIVENCIA, TAMANHO_MAXIMO,
         TIPOS_DE_ARQUIVO, tituloProibido }
  from '../../backend/src/modules/people/dossie-exigido';

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
/*
 * CONTAS DO PROTÓTIPO.
 *
 * A conta do Marcelo estava aqui com `senha: null` — o que, no caminho de dois
 * passos da entrada, significa "ainda não tem senha, use o link do convite".
 * No sistema de verdade isso é o certo; no protótipo, que não manda e-mail
 * nenhum, era um beco sem saída: ele digitava o e-mail dele e não entrava.
 *
 * Agora ele entra em um clique, com o e-mail já escrito na tela. As demais
 * contas existem uma por cargo, para que a demonstração possa ser feita
 * entrando COMO cada função — e não só trocando o cargo depois de entrar.
 */
const USUARIOS: Record<string, { id: string; fullName: string; role: string; senha: string | null }> = {
  'mbarbosa@paodospobres.com.br': { id: 'u0', fullName: 'Marcelo Barbosa', role: 'coordenador', senha: 'senha-dev-123' },
  'educador.ai3@paodospobres.dev': { id: 'u1', fullName: 'Mário Silva (fictício)', role: 'educador', senha: 'senha-dev-123' },
  'lider.ai3@paodospobres.dev': { id: 'u2', fullName: 'Lúcia Líder Diurna (fictícia)', role: 'lider_diurno', senha: 'senha-dev-123' },
  'tecnica.ai3@paodospobres.dev': { id: 'u3', fullName: 'Tatiane Técnica (fictícia)', role: 'equipe_tecnica', senha: 'senha-dev-123' },
  'coord.ai3@paodospobres.dev': { id: 'u4', fullName: 'Carla Coordenadora (fictícia)', role: 'coordenador', senha: 'senha-dev-123' },
  'enfermagem@paodospobres.dev': { id: 'u5', fullName: 'Enfermeira Fictícia', role: 'enfermagem', senha: 'senha-dev-123' },
  'lider.noturno@paodospobres.dev': { id: 'u8', fullName: 'Nélio Noturno (fictício)', role: 'lider_noturno_geral', senha: 'senha-dev-123' },
  'cozinha@paodospobres.dev': { id: 'u9', fullName: 'Cida da Cozinha (fictícia)', role: 'cozinha', senha: 'senha-dev-123' },
  'gestor@paodospobres.dev': { id: 'u11', fullName: 'Gilberto Gestor (fictício)', role: 'gestor_geral', senha: 'senha-dev-123' },
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
/**
 * AVISOS (§19). O texto diz que existe algo e onde continuar — nunca repete o
 * conteúdo: a notificação chega na tela de bloqueio do aparelho da casa, que
 * fica em cima da mesa.
 */
const AVISOS = [
  { id: 'n1', titulo: 'ATA fechada com assinatura pendente',
    texto: '1 passagem não assinada no plantão de ontem. A ATA foi fechada com pendência registrada.',
    prioridade: 'alta', entidade: 'ata', entidadeId: 'a1',
    lida: false, ciente: false, em: emHoras(19, 40) },
  { id: 'n2', titulo: 'Ocorrência aguardando revisão técnica',
    texto: 'A etapa operacional foi encerrada. A validação técnica ainda é necessária para fechar.',
    prioridade: 'critica', entidade: 'incident_review', entidadeId: 'o2',
    lida: false, ciente: false, em: emHoras(9, 5) },
  { id: 'n3', titulo: 'Dose sem confirmação há mais de 30 minutos',
    texto: 'Uma dose prevista continua aguardando confirmação. O sistema não conclui por ninguém.',
    prioridade: 'alta', entidade: 'medication_administration', entidadeId: 'd4',
    lida: false, ciente: false, em: emHoras(16, 35) },
  { id: 'n4', titulo: 'Documento não chegou ao arquivo',
    texto: 'Terceira tentativa de envio ao Drive falhou. O documento continua íntegro no sistema.',
    prioridade: 'alta', entidade: 'archive', entidadeId: 'a4',
    lida: true, ciente: false, em: emHoras(7, 10) },
  { id: 'n5', titulo: 'Compromisso marcado para a casa',
    texto: 'Fonoaudiologia da Lara às 15h, na Clínica Fictícia. Responsável designado.',
    prioridade: 'normal', entidade: 'activity', entidadeId: 'c1',
    lida: true, ciente: true, em: emHoras(8, 0) },
];

/**
 * RELATOS INDEPENDENTES (§12.2) — as sete opções e o que já foi escrito.
 *
 * A narrativa pessoal (`restrito`) não circula pelo plantão: abrem a equipe
 * técnica, a coordenação e o líder do turno. Educador e enfermagem só veem o
 * próprio — e a tela DIZ isso, em vez de mostrar uma lista curta sem explicar.
 */
const OPCOES_TESTEMUNHO = [
  { code: 'presenciei_integralmente', label: 'Presenciei integralmente', pendente: false },
  { code: 'presenciei_parcialmente', label: 'Presenciei parcialmente', pendente: false },
  { code: 'nao_presenciei', label: 'Não presenciei', pendente: false },
  { code: 'soube_depois', label: 'Soube depois', pendente: false },
  { code: 'intervim', label: 'Intervim', pendente: false },
  { code: 'sem_informacao_adicional', label: 'Sem informação adicional', pendente: false },
  { code: 'preciso_complementar', label: 'Preciso complementar', pendente: true },
];
interface RelatoMock {
  id: string; entity: string; entityId: string; autor: string; autorId: string;
  testemunho: string; codigoTestemunho: string; relato: string;
  restrito: boolean; quando: string;
}
const RELATOS: RelatoMock[] = [
  { id: 'r1', entity: 'incident', entityId: 'o1', autor: 'Joana Lima (fictícia)', autorId: 'u6',
    testemunho: 'Presenciei parcialmente', codigoTestemunho: 'presenciei_parcialmente',
    relato: 'Por volta das 21h40 vi o portão dos fundos aberto e o Kauã não estava na sala. '
      + 'Avisei o Líder Noturno Geral na hora e conferi os quartos.',
    restrito: false, quando: emHoras(21, 45) },
  { id: 'r2', entity: 'incident', entityId: 'o1', autor: 'Nélio Noturno (fictício)', autorId: 'u8',
    testemunho: 'Intervim', codigoTestemunho: 'intervim',
    relato: 'Recebi o aviso às 21h45 e segui o protocolo da casa. O acolhido retornou às '
      + '23h15, acompanhado, sem lesão referida.',
    restrito: false, quando: emHoras(23, 20) },
  // Narrativa pessoal (§26.2 #11): fala do que a pessoa sentiu. Não circula
  // pelo plantão — a equipe técnica, a coordenação e o líder do turno abrem;
  // o colega educador não. Está aqui no protótipo justamente para que a
  // diferença apareça na demonstração, e não só no texto da tela.
  { id: 'r3', entity: 'incident', entityId: 'o1', autor: 'Tainá Souza (fictícia)', autorId: 'u7',
    testemunho: 'Presenciei parcialmente', codigoTestemunho: 'presenciei_parcialmente',
    relato: 'Estava sozinha com os outros seis quando percebi a ausência. Fiquei com medo '
      + 'de sair para procurar e deixar a casa, e por isso chamei antes de ir.',
    restrito: true, quando: emHoras(21, 50) },
];
function relatosDe(entity: string, entityId: string) {
  const ladoALado = ['equipe_tecnica', 'coordenador', 'lider_diurno', 'lider_noturno_geral']
    .includes(eu.role);
  const meus = RELATOS.filter((r) => r.entity === entity && r.entityId === entityId
    && (ladoALado || !r.restrito || r.autorId === eu.id));
  return {
    modo: ladoALado ? 'lado_a_lado' : 'restrito_ao_proprio',
    nota: ladoALado
      ? 'Todos os relatos deste fato, na ordem em que aconteceram. Nenhum foi alterado.'
      : 'Você vê o seu relato e os registros abertos à equipe. Narrativas pessoais de '
        + 'colegas não são exibidas.',
    relatos: meus
      .sort((a, b2) => a.quando.localeCompare(b2.quando))
      .map((r) => ({
        id: r.id, autor: r.autor, meu: r.autorId === eu.id,
        testemunho: r.testemunho, codigoTestemunho: r.codigoTestemunho,
        relato: r.relato, restrito: r.restrito, acolhidoId: null,
        quando: r.quando, registradoEm: r.quando, complementaId: null,
      })),
  };
}

/** Prescrições em rascunho — no protótipo, enquanto a página está aberta. */
const RASCUNHOS = new Map<string, {
  medicamento: string; dose: string; via: string; tipo: string; personId: string;
  horarios: string[]; condicaoUso: string | null;
}>();

/** Quem foi desativado no protótipo — some da escala, nunca do histórico. */
const DESATIVADOS = new Set<string>();

/** Os setores do §5, na ordem da casa para fora — como em `staff.service.ts`. */
const TIPOS_SETOR = [
  { code: 'educador', label: 'Educador social', transversal: false,
    descricao: 'Plantão, rotina, chamadas e passagem individual' },
  { code: 'lider_diurno', label: 'Líder Diurno', transversal: false,
    descricao: 'Conduz o plantão diurno e fecha a ATA da casa' },
  { code: 'equipe_tecnica', label: 'Equipe técnica', transversal: false,
    descricao: 'Perfil do acolhido, acompanhamentos e revisão técnica' },
  { code: 'cozinha', label: 'Cozinha', transversal: false,
    descricao: 'Somente o relatório de restrições alimentares' },
  { code: 'enfermagem', label: 'Enfermagem', transversal: true,
    descricao: 'Saúde das oito casas' },
  { code: 'lider_noturno_geral', label: 'Líder Noturno Geral', transversal: true,
    descricao: 'Plantão noturno das oito casas e ATA Geral Noturna' },
  { code: 'coordenador', label: 'Coordenação', transversal: false,
    descricao: 'Equipe da casa, aprovações, transferências e cofre' },
  { code: 'gestor_geral', label: 'Gestor Geral', transversal: true,
    descricao: 'Escopo institucional; abre uma casa por vez, com auditoria' },
];

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

/*
 * As OPÇÕES por tipo de chamada, nos códigos do servidor (`checks.service`).
 *
 * A lista antiga tinha "comeu_pouco" e "ausente_sem_autorizacao", que o
 * servidor não conhece — e o `tipo` de uma das chamadas semeadas era
 * "presenca", fora do enum `check_type`. O protótipo mostrava um vocabulário
 * que o sistema recusaria.
 */
const OPCOES_POR_TIPO: Record<string, { code: string; label: string; excecao: boolean }[]> = {
  alimentacao: [
    { code: 'normal', label: 'Normal', excecao: false },
    { code: 'parcial', label: 'Parcial', excecao: true },
    { code: 'recusou', label: 'Recusou', excecao: true },
    { code: 'ausente_externa', label: 'Ausente / atividade externa', excecao: true },
    { code: 'dieta_adaptada', label: 'Dieta adaptada', excecao: false },
    { code: 'desconforto', label: 'Desconforto', excecao: true },
    { code: 'nao_aplicavel', label: 'Não aplicável', excecao: false },
    { code: 'outro', label: 'Outro', excecao: true },
  ],
  escola: [
    { code: 'compareceu', label: 'Compareceu', excecao: false },
    { code: 'atraso', label: 'Atraso', excecao: true },
    { code: 'ausencia_saude', label: 'Ausência por saúde', excecao: true },
    { code: 'transporte', label: 'Transporte', excecao: true },
    { code: 'cancelamento', label: 'Cancelamento', excecao: true },
    { code: 'decisao_institucional', label: 'Decisão institucional', excecao: true },
    { code: 'outro', label: 'Outro', excecao: true },
  ],
  lazer: [
    { code: 'participou', label: 'Participou', excecao: false },
    { code: 'preferiu_nao', label: 'Preferiu não participar', excecao: false },
    { code: 'outra_atividade', label: 'Estava em outra atividade', excecao: false },
    { code: 'doenca', label: 'Doença', excecao: true },
    { code: 'restricao_saude', label: 'Restrição de saúde', excecao: true },
    { code: 'transporte_indisponivel', label: 'Transporte indisponível', excecao: true },
    { code: 'decisao_institucional', label: 'Decisão institucional', excecao: true },
    { code: 'outro', label: 'Outro', excecao: true },
  ],
  chamada_final: [
    { code: 'sem_alteracao', label: 'Sem alteração relevante', excecao: false },
    { code: 'com_registro', label: 'Com registro no plantão', excecao: true },
  ],
};
const opcoesDoTipo = (tipo: string) => OPCOES_POR_TIPO[tipo] ?? OPCOES_POR_TIPO.alimentacao;

/** Os oito tipos do enum `check_type`, com o nome que a casa usa. */
const TIPOS_DE_CHAMADA = [
  { cod: 'acordar', label: 'Acordar', sugestao: 'Acordar' },
  { cod: 'alimentacao', label: 'Refeição', sugestao: 'Refeição' },
  { cod: 'escola', label: 'Escola', sugestao: 'Saída para a escola' },
  { cod: 'banho', label: 'Banho', sugestao: 'Banho' },
  { cod: 'lazer', label: 'Lazer ou atividade', sugestao: 'Atividade de lazer' },
  { cod: 'dormir', label: 'Rotina de dormir', sugestao: 'Rotina de dormir' },
  { cod: 'chamada_final', label: 'Chamada final do turno', sugestao: 'Chamada final do turno' },
  { cod: 'outro', label: 'Outra conferência', sugestao: '' },
];

interface Chamada {
  id: string; tipo: string; titulo: string; status: string; horario: string;
  /** `mesa` guarda de qual conferência de mesa a linha nasceu, se nasceu. */
  resultados: Record<string, { opcao: string; nota?: string; mesa?: string }>;
  /** As conferências de mesa desta chamada — o ato, com nome e horário. */
  mesas?: { id: string; opcao: string; quantos: number; por: string; quando: string }[];
}
let CHAMADAS: Chamada[] = [
  { id: 'k1', tipo: 'alimentacao', titulo: 'Café da manhã', status: 'confirmada',
    horario: emHoras(7, 30), resultados: Object.fromEntries(KIDS.map((k) => [k.id, { opcao: 'normal' }])) },
  { id: 'k2', tipo: 'alimentacao', titulo: 'Almoço', status: 'aberta', horario: emHoras(11, 30),
    resultados: { p02: { opcao: 'normal' }, p04: { opcao: 'normal' },
                  p11: { opcao: 'parcial', nota: 'Comeu metade e disse que estava sem fome.' } } },
  { id: 'k3', tipo: 'alimentacao', titulo: 'Janta', status: 'aberta', horario: emHoras(18, 30),
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

interface DoseMock {
  id: string; personId: string; horario: string; medicamento: string; dose: string;
  via: string; tipo: string; condicaoUso: string | null;
  estado: string; rotulo: string; pendente: boolean;
  confirmadaPor: string | null; administradaEm: string | null; observacao: string | null;
}
const DOSES: DoseMock[] = [
  { id: 'd1', personId: 'p11', horario: emHoras(7, 30), medicamento: 'Colírio lubrificante (fictício)',
    dose: '1 gota em cada olho', via: 'oftálmica', tipo: 'uso_continuo', condicaoUso: null,
    estado: 'aguardando_confirmacao', rotulo: 'Aguardando confirmação', pendente: true,
    confirmadaPor: null, administradaEm: null, observacao: null },
  { id: 'd2', personId: 'p11', horario: emHoras(19, 30), medicamento: 'Colírio lubrificante (fictício)',
    dose: '1 gota em cada olho', via: 'oftálmica', tipo: 'uso_continuo', condicaoUso: null,
    estado: 'aguardando_confirmacao', rotulo: 'Aguardando confirmação', pendente: true,
    confirmadaPor: null, administradaEm: null, observacao: null },
  { id: 'd3', personId: 'p02', horario: emHoras(8, 0), medicamento: 'Amoxicilina (fictícia) 250 mg/5 mL',
    dose: '5 mL', via: 'oral', tipo: 'tratamento', condicaoUso: null,
    estado: 'administrado_no_horario', rotulo: 'Administrado no horário', pendente: false,
    confirmadaPor: 'Tainá Souza (fictícia)', administradaEm: emHoras(8, 5), observacao: null },
  { id: 'd4', personId: 'p02', horario: emHoras(16, 0), medicamento: 'Amoxicilina (fictícia) 250 mg/5 mL',
    dose: '5 mL', via: 'oral', tipo: 'tratamento', condicaoUso: null,
    estado: 'aguardando_confirmacao', rotulo: 'Aguardando confirmação', pendente: true,
    confirmadaPor: null, administradaEm: null, observacao: null },
  { id: 'd5', personId: 'p10', horario: emHoras(0, 0), medicamento: 'Paracetamol (fictício) 500 mg',
    dose: '1 comprimido', via: 'oral', tipo: 'quando_necessario',
    condicaoUso: 'Dor de cabeça referida ou temperatura acima de 37,8 °C. Intervalo mínimo de 6 horas.',
    estado: 'aguardando_confirmacao', rotulo: 'Se necessário', pendente: true,
    confirmadaPor: null, administradaEm: null, observacao: null },
];

/**
 * Estoque da casa. Não é farmácia: é o que existe no armário, para a
 * Enfermagem ver o que vai faltar antes de faltar. Quantidade baixa é
 * ESTADO OPERACIONAL do armário — não diz nada sobre nenhuma criança.
 *
 * Estoque no formato do servidor (`GET /medications/stock`): sem "mínimo".
 *
 * O protótipo tinha um campo `minimo` e pintava "Abaixo do mínimo" sozinho.
 * O sistema de verdade recusa isso de propósito (§11.6): estoque baixo é
 * SINALIZADO À MÃO, com autor, porque só a equipe sabe o que é pouco em cada
 * caso — dois frascos de um xarope eventual sobram, e dois de um contínuo
 * acabam na quinta. O protótipo estava mostrando um julgamento automático que
 * o aplicativo nunca faria.
 */
interface ItemEstoque {
  id: string; medicamento: string; quantidade: number; unidade: string;
  personId: string | null; validade: string | null; estoqueBaixo: boolean;
  atualizadoEm: string;
}
const ESTOQUE: ItemEstoque[] = [
  { id: 'e1', medicamento: 'Amoxicilina (fictícia) 250 mg/5 mL', unidade: 'frasco',
    quantidade: 2, personId: null, validade: '2027-01-31', estoqueBaixo: false,
    atualizadoEm: emHoras(9, 15) },
  { id: 'e2', medicamento: 'Colírio lubrificante (fictício)', unidade: 'frasco',
    quantidade: 5, personId: null, validade: '2026-12-10', estoqueBaixo: false,
    atualizadoEm: emHoras(9, 20) },
  { id: 'e3', medicamento: 'Paracetamol (fictício) 500 mg', unidade: 'comprimido',
    quantidade: 8, personId: null, validade: '2026-11-30', estoqueBaixo: true,
    atualizadoEm: emHoras(20, 30) },
  { id: 'e4', medicamento: 'Insulina (fictícia) — caneta', unidade: 'caneta',
    quantidade: 3, personId: 'p11', validade: '2026-10-05', estoqueBaixo: false,
    atualizadoEm: emHoras(9, 25) },
];

/**
 * Triagem de enfermagem: evoluções escritas pelo educador que acompanhou o
 * atendimento. A Enfermagem tria, complementa e assina — e a coordenação
 * cobra a pendência, mas nunca assina no lugar dela.
 */
interface Triagem {
  id: string; personId: string; tipo: string; enviadaPor: string; enviadaEm: string;
  resumo: string; receita?: string | null; orientacoes?: string | null;
  assinada: boolean; assinadaPor: string | null; complemento: string | null;
  /** Devolvida pedindo o que falta — o pedido fica escrito para quem acompanhou. */
  pedidoComplemento?: string | null;
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

/**
 * COMUNICAÇÃO EXTERNA (§13.6) — o vocabulário e o que já foi escrito.
 *
 * O protótipo demonstra o que mais importa aqui: as QUATRO ETAPAS e a ausência
 * de envio. Uma comunicação semeada fica em "aprovada e não entregue", que é o
 * estado que engana — parece pronto, e a criança continua sem que o órgão
 * saiba.
 */
/**
 * TIPOS DE ANEXO (§13.7). Anexo não é upload: é a REFERÊNCIA de um arquivo que
 * vive no Drive da instituição, com nome neutro e finalidade para abrir.
 */
const TIPOS_ANEXO = [
  { cod: 'documento_medico', label: 'Documento médico',
    ajuda: 'Receita, atestado, encaminhamento, laudo.',
    restritoPorPadrao: true, exigeJustificativa: false },
  { cod: 'comunicacao_oficial', label: 'Comunicação oficial',
    ajuda: 'Ofício recebido ou enviado, decisão, guia.',
    restritoPorPadrao: false, exigeJustificativa: false },
  { cod: 'foto_autorizada', label: 'Foto autorizada',
    ajuda: 'Só com autorização, e nunca na linha do tempo. Exige justificativa escrita.',
    restritoPorPadrao: true, exigeJustificativa: true },
  { cod: 'documento_escolar', label: 'Documento escolar',
    ajuda: 'Boletim, declaração de matrícula, comunicado da escola.',
    restritoPorPadrao: false, exigeJustificativa: false },
  { cod: 'documento_tecnico', label: 'Documento técnico',
    ajuda: 'Relatório ou parecer produzido pela equipe.',
    restritoPorPadrao: true, exigeJustificativa: false },
];
interface AnexoMock {
  id: string; ocorrenciaId: string; tipo: string; nome: string;
  referencia: string; restrito: boolean; autor: string;
}
let ANEXOS: AnexoMock[] = [
  { id: 'ax1', ocorrenciaId: 'o2', tipo: 'documento_medico',
    nome: 'orientação da consulta de 31-08',
    referencia: 'RESTRITO/AI3/2026/08/saude/orientacao-3108.pdf',
    restrito: true, autor: 'Enfermeira Fictícia' },
];
/** A contenção registrada por ocorrência (§13.3). */
const CONTENCOES: Record<string, Record<string, unknown>> = {};

const ORGAOS_EXTERNOS = [
  { cod: 'judiciario', label: 'Judiciário (Vara da Infância)' },
  { cod: 'conselho_tutelar', label: 'Conselho Tutelar' },
  { cod: 'ministerio_publico', label: 'Ministério Público' },
  { cod: 'saude', label: 'Rede de saúde' },
  { cod: 'escola', label: 'Escola' },
  { cod: 'rede', label: 'Outro serviço da rede' },
  { cod: 'outro', label: 'Outro' },
];
const CANAIS_EXTERNOS = [
  { cod: 'oficio', label: 'Ofício em papel' },
  { cod: 'email_institucional', label: 'E-mail institucional' },
  { cod: 'presencial', label: 'Entrega presencial' },
  { cod: 'telefone', label: 'Telefone' },
  { cod: 'sistema_externo', label: 'Sistema do órgão' },
];
interface ComunicacaoMock {
  id: string; orgao: string; destinatarioFuncional: string; canal: string;
  status: 'rascunho' | 'em_revisao' | 'aprovado' | 'entregue_manualmente';
  resumo: string; quando: string | null; aprovadaEm: string | null;
  entregueEm: string | null; ocorrenciaId: string | null;
  responsavel: string; autorId: string;
}
let COMUNICACOES: ComunicacaoMock[] = [
  { id: 'c1', orgao: 'conselho_tutelar',
    destinatarioFuncional: 'Conselho Tutelar — Regional Centro', canal: 'oficio',
    status: 'aprovado',
    resumo: 'Comunicamos a saída não autorizada ocorrida em 31/08, o retorno às 23h15 '
      + 'acompanhado e as medidas adotadas pela unidade.',
    quando: emHoras(9, 20), aprovadaEm: emHoras(11, 5), entregueEm: null,
    ocorrenciaId: 'o1', responsavel: 'Tatiane Técnica (fictícia)', autorId: 'u3' },
  { id: 'c2', orgao: 'judiciario',
    destinatarioFuncional: 'Vara da Infância e Juventude — 1ª Vara', canal: 'oficio',
    status: 'entregue_manualmente',
    resumo: 'Encaminhamento do relatório semestral de acompanhamento, conforme determinação.',
    quando: emHoras(8, 0), aprovadaEm: emHoras(8, 40),
    entregueEm: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    ocorrenciaId: null, responsavel: 'Carla Coordenadora (fictícia)', autorId: 'u4' },
];

/**
 * Ocorrência no vocabulário do servidor: um `status` só, com os mesmos valores
 * do CHECK do banco. O protótipo tinha DOIS campos paralelos
 * (`etapaOperacional` + `situacao`) que juntos diziam menos e podiam
 * contradizer um ao outro — "operacional aberta" com "aguardando revisão".
 */
type StatusOcorrencia = 'aberta' | 'em_acompanhamento' | 'encerrada_operacional'
  | 'aguardando_revisao_tecnica' | 'fechada' | 'reaberta';
interface Ocorrencia {
  id: string; categoria: string; personId: string | null; fato: string; medidas: string;
  falaEspontanea: string | null; abertaPor: string; abertaEm: string;
  status: StatusOcorrencia;
  avisados: string[];
  sinteses: { id: string; texto: string; autor: string; quando: string }[];
}
let OCORRENCIAS: Ocorrencia[] = [
  { id: 'o1', categoria: 'saida_nao_autorizada', personId: 'p10',
    fato: 'Saiu pelo portão dos fundos por volta das 21h40. Retornou às 23h15, acompanhado.',
    medidas: 'Líder Noturno Geral acionado na hora; busca conforme protocolo da casa; '
      + 'acolhido recebido e avaliado pela equipe do plantão.',
    falaEspontanea: null, abertaPor: 'Joana Lima (fictícia)', abertaEm: emHoras(21, 40),
    status: 'encerrada_operacional',
    avisados: ['Líder Diurno', 'equipe técnica', 'coordenação'],
    sinteses: [
      { id: 'oa1', autor: 'Nélio Noturno (fictício)',
        texto: 'Etapa operacional encerrada às 23h40, com o acolhido na casa e sem lesão referida.',
        quando: emHoras(23, 40) },
    ] },
  { id: 'o2', categoria: 'erro_medicamento', personId: 'p02',
    fato: 'A dose das 8h foi ofertada com 40 minutos de atraso, por indisponibilidade do frasco na casa.',
    medidas: 'Enfermagem avisada na hora; frasco reposto do estoque da unidade; '
      + 'horário real anotado na grade.',
    falaEspontanea: null, abertaPor: 'Tainá Souza (fictícia)', abertaEm: emHoras(8, 45),
    status: 'aguardando_revisao_tecnica',
    avisados: ['Líder Diurno', 'equipe técnica', 'coordenação', 'Enfermagem'],
    sinteses: [] },
];

/**
 * ATAs. A da casa fecha depois das passagens; a Geral Noturna fecha depois
 * das oito ATAs de casa. Fechar COM PENDÊNCIA é uma saída de verdade — a
 * alternativa seria o sistema presumir uma assinatura que ninguém deu.
 */
/**
 * A ATA da casa VIVE DENTRO DO PLANTÃO, como no servidor: uma por turno, com
 * as assinaturas daquele turno. O protótipo tinha uma ATA solta, sem turno, e
 * por isso não sabia dizer de qual plantão eram as passagens que mostrava.
 */
interface AtaMock {
  id: string; plantaoId: string; status: 'aberta' | 'fechada' | 'reaberta'; versao: number;
  pendencias: string | null; fechadaEm: string | null;
  /** O corpo do livro, por seção. Vazio até alguém escrever. */
  conteudo: Record<string, string>;
  /*
   * Adendos: o antes e o depois de cada correção (§12.7).
   *
   * O estado vai EMBRULHADO, como o servidor guarda — `{status, versao,
   * conteudo}` na reabertura e `{conteudo}` na correção. A primeira versão
   * daqui guardava o texto cru, e a tela, que lê `antes.conteudo`, mostrava
   * "nenhuma seção alterada" em toda correção do protótipo.
   */
  adendos: { id: string; tipo: string; motivo: string; autor: string; quando: string;
             antes: Record<string, unknown> | null;
             depois: Record<string, unknown> | null }[];
}
let ATAS: AtaMock[] = [];
/*
 * As seções vêm do MESMO arquivo que o servidor usa.
 *
 * Aqui havia nove seções inventadas — "Presentes e ausências", "Visitas" —
 * enquanto o servidor serve as dezesseis do LIVRO ATA de papel da Casa 03. A
 * demonstração mostrava um formulário que a casa não usa, para quem entregou
 * o livro. `ata-secoes.ts` não importa nada, exatamente para poder ser lido
 * daqui.
 */
let ATA_GERAL = {
  id: 'g1', data: HOJE, status: 'aberta' as 'aberta' | 'fechada',
  pendencias: null as string | null, assinadaEm: null as string | null,
  casas: CASAS.map((c, i) => ({
    casaId: c.id, codigo: c.code, nome: c.name,
    // Casa sem chamado também entra: a ausência de demanda é registrada, não omitida.
    houveContato: i === 2 || i === 5,
    motivo: i === 2 ? 'Chamado às 02h10 — saúde; enfermagem orientou por telefone.'
          : i === 5 ? 'Visita de rotina às 01h20; sem intercorrência.' : null,
    acao: null as string | null, pendencias: null as string | null,
    ataNoturnaConfirmada: i !== 2,
  })),
};

/**
 * O ARQUIVO DAS ATAS — dias anteriores desta casa.
 *
 * No servidor o arquivo é uma consulta; aqui é uma semeadura, porque o
 * protótipo não tem um livro com meses dentro. O que ele PRECISA demonstrar é
 * o recorte e o alcance: que dá para pedir a semana e o mês, que a ATA
 * fechada com pendência se anuncia na capa, e que da ATA Geral Noturna sai a
 * LINHA desta casa — nunca a folha das oito.
 */
const diasAtras = (n: number) => new Intl.DateTimeFormat('en-CA',
  { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(Date.now() - n * 86_400_000));

interface AtaArquivada {
  data: string;
  diurno: any; noturno: any; geral: any;
}
const capa = (o: Partial<Record<string, any>> = {}) => ({
  ataId: uid(), plantaoId: uid(), status: 'fechada',
  pendencias: null, assinaturasFaltantes: 0, fechadaEm: null, fechadaPor: null,
  aditamentos: 0, episodios: 0, passagens: 3, ...o,
});
/**
 * A janela de consulta — a MESMA conta do servidor
 * (`kernel/common/tempo.ts`). Semana é de calendário, segunda a domingo, e
 * mês vai do dia 1 ao último. Se as duas contas divergirem, o protótipo
 * mostra um período e o sistema real mostra outro — e a diferença só
 * apareceria na frente da equipe.
 */
function janelaDeConsulta(escala: string, data: string): { de: string; ate: string } {
  if (escala === 'dia') return { de: data, ate: data };
  if (escala === 'mes') {
    const [ano, mes] = data.split('-').map(Number);
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return { de: `${data.slice(0, 7)}-01`,
             ate: `${data.slice(0, 7)}-${String(ultimo).padStart(2, '0')}` };
  }
  const d = new Date(`${data}T00:00:00Z`);
  const recuo = (d.getUTCDay() + 6) % 7;
  const segunda = new Date(d.getTime() - recuo * 86_400_000);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { de: iso(segunda), ate: iso(new Date(segunda.getTime() + 6 * 86_400_000)) };
}

const ARQUIVO_ATAS: AtaArquivada[] = [
  { data: diasAtras(1),
    diurno: capa({ fechadaEm: emHoras(19, 10), fechadaPor: 'Lúcia Líder Diurna (fictícia)' }),
    noturno: capa({ status: 'fechada_com_pendencia', assinaturasFaltantes: 1,
                    pendencias: 'Mário Silva (fictício) saiu antes do fim do turno e não assinou '
                      + 'a passagem. Fechada com pendência, sem assinatura em nome dele.',
                    episodios: 1, passagens: 2,
                    fechadaEm: emHoras(7, 20), fechadaPor: 'Nélio Noturno (fictício)' }),
    geral: { id: null, status: 'fechada', houveContato: true, categoria: 'saude',
             motivo: 'Chamado às 02h10 — Bruno com febre; enfermagem orientada por telefone.',
             acao: 'Fui à casa, acompanhei a medicação e conferi o registro.',
             pendencias: null, chegada: emHoras(2, 25), saida: emHoras(3, 40) } },
  { data: diasAtras(2),
    diurno: capa({ fechadaEm: emHoras(19, 5), fechadaPor: 'Lúcia Líder Diurna (fictícia)' }),
    noturno: capa({ fechadaEm: emHoras(7, 5), fechadaPor: 'Nélio Noturno (fictício)', passagens: 2 }),
    geral: { id: null, status: 'fechada', houveContato: false, categoria: null,
             motivo: null, acao: null, pendencias: null, chegada: null, saida: null } },
  { data: diasAtras(5),
    diurno: capa({ aditamentos: 1, fechadaEm: emHoras(19, 30),
                   fechadaPor: 'Carla Coordenadora (fictícia)' }),
    noturno: null,
    geral: null },
];

/** A capa da ATA de hoje, montada a partir do plantão vivo. */
function capaDoPlantao(turno: string) {
  const s = PLANTOES.find((x) => x.turno === turno);
  if (!s) return null;
  const a = ataDo(s.id);
  const faltam = s.esperados.filter(
    (e) => !s.passagens.some((p) => p.userId === e.userId)).length;
  return { ataId: a.id, plantaoId: s.id, status: a.status === 'aberta' ? 'rascunho' : a.status,
    pendencias: a.pendencias, assinaturasFaltantes: faltam,
    fechadaEm: a.fechadaEm, fechadaPor: a.fechadaEm ? 'Lúcia Líder Diurna (fictícia)' : null,
    aditamentos: 0, episodios: 0, passagens: s.passagens.length };
}

/**
 * A linha DESTA casa na ATA Geral Noturna de hoje — e só ela. O recorte é
 * feito aqui, do lado do servidor de mentira, pelo mesmo motivo do servidor
 * de verdade: se a tela recebesse as oito e escondesse sete, a primeira tela
 * nova perderia a proteção.
 */
function linhaDaCasaNaGeral() {
  const linha = ATA_GERAL.casas.find((c) => c.casaId === CASA.id);
  if (!linha) return null;
  return { id: null as string | null, status: ATA_GERAL.status,
    houveContato: linha.houveContato, categoria: null as string | null,
    motivo: linha.motivo, acao: linha.acao, pendencias: linha.pendencias,
    chegada: null as string | null, saida: null as string | null };
}

/**
 * COFRE DE ACESSOS.
 *
 * A coordenação tem a guarda e precisa destes acessos. O que muda em relação
 * à planilha não é o guardar — é o cofre ter porta: a lista mostra a DICA, a
 * senha só aparece com finalidade escrita, e cada abertura fica com nome e
 * hora. No protótipo a "cifra" é de mentira; no sistema real nem quem
 * administra o banco lê a senha.
 */
/** Tipos de acesso, nos códigos do servidor (§6.10). */
const TIPOS_CREDENCIAL = [
  { cod: 'gov_br', label: 'gov.br' },
  { cod: 'inss', label: 'INSS / Meu INSS' },
  { cod: 'ctps', label: 'Carteira de Trabalho Digital' },
  { cod: 'banco', label: 'Banco / poupança social' },
  { cod: 'escola', label: 'Portal da escola' },
  { cod: 'outro', label: 'Outro acesso' },
];
interface Credencial {
  id: string; personId: string; tipoCodigo: string; qual: string | null;
  login: string | null; dica: string; senha: string;
  responsavel: string | null; observacao: string | null; atualizadoEm: string;
}
const COFRE: Credencial[] = [
  { id: 'v1', personId: 'p01', tipoCodigo: 'gov_br', qual: null, login: '000.000.000-00',
    dica: 'F••••••••3 (13)', senha: 'Ficticia@2013', responsavel: 'Coordenação da Casa 03',
    observacao: null, atualizadoEm: emHoras(7, 40) },
  { id: 'v2', personId: 'p01', tipoCodigo: 'banco', qual: null, login: 'ag. 0000 · c/ 00000-0',
    dica: 'P••••••••1 (11)', senha: 'Poupanca#1', responsavel: 'Coordenação da Casa 03',
    observacao: null, atualizadoEm: emHoras(7, 45) },
  { id: 'v3', personId: 'p02', tipoCodigo: 'inss', qual: null, login: '000.000.000-00',
    dica: 'M•••••••0 (10)', senha: 'MeuINSS@10', responsavel: 'Coordenação da Casa 03',
    observacao: null, atualizadoEm: emHoras(8, 10) },
  { id: 'v4', personId: 'p10', tipoCodigo: 'ctps', qual: null, login: '000.000.000-00',
    dica: 'C•••••••7 (12)', senha: 'CtpsFicti@7', responsavel: 'Coordenação da Casa 03',
    observacao: null, atualizadoEm: emHoras(8, 30) },
];
/** Histórico POR ACOLHIDO, como no servidor. */
let COFRE_HIST: { personId: string; quando: string; quem: string;
                  finalidade: string | null; acao: string; excepcional: boolean }[] = [
  { personId: 'p01', quem: 'Carla Coordenadora (fictícia)', acao: 'abertura', quando: emHoras(9, 12),
    finalidade: 'Atualizar cadastro do benefício no gov.br', excepcional: false },
  { personId: 'p01', quem: 'João Gestor (fictício)', acao: 'abertura excepcional', quando: emHoras(8, 5),
    finalidade: 'Coordenadora em licença; benefício vencia na semana', excepcional: true },
  { personId: 'p01', quem: 'Carla Coordenadora (fictícia)', acao: 'cadastro',
    quando: emHoras(7, 40), finalidade: null, excepcional: false },
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

/**
 * O LAÇO DO ARQUIVO no protótipo (§16.2): fechou, entra na fila.
 *
 * O protótipo já dizia, ao fechar a ATA, que "a cópia documental entrou na
 * fila do arquivo" — e não entrava, nem aqui nem no servidor. Agora entra dos
 * dois lados, e a tela do Arquivo mostra o que a demonstração acabou de gerar.
 *
 * Idempotente pela mesma chave do servidor: fechar de novo depois de reabrir
 * não cria uma segunda cópia.
 */
function enfileirarCopia(categoria: string, entidade: string, entityId: string,
                         restrito = false) {
  const rotulo: Record<string, string> = {
    ata: 'ATA', ocorrencia: 'Ocorrência', acompanhamento: 'Acompanhamento',
  };
  const dia = HOJE;
  const arquivo = `${categoria}_${dia}_${entityId.slice(0, 8).padEnd(8, '0')}_V1.pdf`;
  if (ARQUIVO.some((a) => a.arquivo === arquivo)) return;
  const raiz = restrito ? 'RESTRITO' : 'ACOLHIMENTO';
  ARQUIVO = [{
    id: uid(), categoria: rotulo[categoria] ?? categoria,
    caminho: `${raiz}/${CASA.code}/${dia.slice(0, 4)}/${dia.slice(5, 7)}/${categoria}`,
    arquivo, estado: 'aguardando', restrito, tentativas: 0, erro: null,
    fechadoEm: new Date().toISOString(),
  }, ...ARQUIVO];
}
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

/**
 * O ACERVO HISTÓRICO (§15.2) — quem saiu.
 *
 * No protótipo a saída MOVE o acolhido para cá e o retorno o traz de volta, do
 * mesmo jeito que no servidor: nada é apagado, e o perfil é o mesmo. Dois
 * nomes já nascem no acervo para que a tela tenha o que mostrar antes de
 * alguém registrar a primeira saída na demonstração.
 */
interface NoAcervo { kid: Kid; saiuEm: string; motivo: string; episodios: number }
const ACERVO: NoAcervo[] = [
  { kid: { id: 'ac1', nome: 'Marina', civil: 'Marina (fictícia)', idade: 13,
           nascimento: '2013-04-18' } as Kid,
    saiuEm: new Date(Date.now() - 47 * 86_400_000).toISOString(),
    motivo: 'Reintegração familiar, com acompanhamento da rede de origem.', episodios: 1 },
  { kid: { id: 'ac2', nome: 'Tiago', civil: 'Tiago (fictício)', idade: 16,
           nascimento: '2010-01-09' } as Kid,
    saiuEm: new Date(Date.now() - 12 * 86_400_000).toISOString(),
    motivo: 'Transferência para outro serviço de acolhimento, por decisão da Vara.',
    episodios: 2 },
];

const todosKids = () => [...KIDS, ...NOVOS].filter(
  (k) => !ACERVO.some((a) => a.kid.id === k.id));
const kid = (id: string) => [...KIDS, ...NOVOS, ...ACERVO.map((a) => a.kid)]
  .find((k) => k.id === id);

/** A ATA de um plantão — criada junto com ele, como no servidor. */
/**
 * EPISÓDIOS (§12.5). O relato é imutável — no banco há gatilho que recusa
 * UPDATE e DELETE, e aqui não existe caminho que reescreva `relato`. A ciência
 * é ato pessoal e única por pessoa: o servidor devolve 400 na segunda.
 */
interface EpisodioMock {
  id: string; ataId: string; acolhidoId: string; classificacao: string;
  relato: string; quando: string; registradoPor: string;
  ciencias: { id: string; quem: string; userId: string;
              comentario: string | null; quando: string }[];
}
/**
 * A ROTINA VERSIONADA (§8.1).
 *
 * Duas versões semeadas de propósito: uma encerrada e a que vale. Com uma só, o
 * histórico abre vazio e a coisa inteira que a tela precisa mostrar — que a
 * versão antiga CONTINUA e é ela que explica o registro daquela época — fica
 * invisível justamente na conversa em que ela importa.
 */
interface VersaoRotina {
  id: string; numero: number; vigenteDesde: string; vigenteAte: string | null; nota: string | null;
}
interface ItemRotinaMock {
  id: string; versaoId: string; tipo: string; titulo: string;
  inicio: string; fim: string | null; diasSemana: number[];
  coletiva: boolean; acolhidoId: string | null; instrucoes: string | null;
}
const ALTERA_ROTINA = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

const VERSOES_ROTINA: VersaoRotina[] = [
  { id: 'rv1', numero: 1, vigenteDesde: '2026-02-01', vigenteAte: '2026-07-31',
    nota: 'Primeira rotina escrita da casa, transcrita do quadro da cozinha.' },
  { id: 'rv2', numero: 2, vigenteDesde: '2026-08-01', vigenteAte: null,
    nota: 'A escola passou os cinco maiores para o turno da tarde; o almoço e o banho '
      + 'mudaram de hora por causa disso.' },
];

const DIAS_UTEIS = [1, 2, 3, 4, 5];
const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];
const ITENS_ROTINA: ItemRotinaMock[] = [
  { id: 'ri1', versaoId: 'rv2', tipo: 'acordar', titulo: 'Acordar', inicio: '06:40', fim: '07:00',
    diasSemana: DIAS_UTEIS, coletiva: true, acolhidoId: null,
    instrucoes: 'Os menores primeiro; quem vai para a escola da manhã sai às 07h20.' },
  { id: 'ri2', versaoId: 'rv2', tipo: 'refeicao', titulo: 'Café da manhã', inicio: '07:00',
    fim: '07:40', diasSemana: TODOS_OS_DIAS, coletiva: true, acolhidoId: null,
    instrucoes: 'Conferir as restrições alimentares antes de servir.' },
  { id: 'ri3', versaoId: 'rv2', tipo: 'escola', titulo: 'Escola — turno da manhã', inicio: '07:20',
    fim: '12:00', diasSemana: DIAS_UTEIS, coletiva: true, acolhidoId: null, instrucoes: null },
  { id: 'ri4', versaoId: 'rv2', tipo: 'refeicao', titulo: 'Almoço', inicio: '11:30', fim: '12:30',
    diasSemana: TODOS_OS_DIAS, coletiva: true, acolhidoId: null,
    instrucoes: 'Quem estuda de tarde almoça primeiro.' },
  { id: 'ri5', versaoId: 'rv2', tipo: 'escola', titulo: 'Escola — turno da tarde', inicio: '13:00',
    fim: '17:20', diasSemana: DIAS_UTEIS, coletiva: true, acolhidoId: null, instrucoes: null },
  { id: 'ri6', versaoId: 'rv2', tipo: 'saude', titulo: 'Fonoaudiologia', inicio: '15:00',
    fim: '16:00', diasSemana: [2], coletiva: false, acolhidoId: 'p11',
    instrucoes: 'Clínica Fictícia, no Centro. Levar a carteirinha e o caderno de casa.' },
  { id: 'ri7', versaoId: 'rv2', tipo: 'educacao', titulo: 'Reforço escolar', inicio: '16:00',
    fim: '17:00', diasSemana: [1, 3, 5], coletiva: true, acolhidoId: null, instrucoes: null },
  { id: 'ri8', versaoId: 'rv2', tipo: 'banho', titulo: 'Banho', inicio: '17:30', fim: '18:20',
    diasSemana: TODOS_OS_DIAS, coletiva: true, acolhidoId: null,
    instrucoes: 'Em escala, dos menores para os maiores.' },
  { id: 'ri9', versaoId: 'rv2', tipo: 'refeicao', titulo: 'Janta', inicio: '18:30', fim: '19:15',
    diasSemana: TODOS_OS_DIAS, coletiva: true, acolhidoId: null, instrucoes: null },
  { id: 'ri10', versaoId: 'rv2', tipo: 'lazer', titulo: 'Convivência na sala', inicio: '19:15',
    fim: '20:45', diasSemana: TODOS_OS_DIAS, coletiva: true, acolhidoId: null, instrucoes: null },
  { id: 'ri11', versaoId: 'rv2', tipo: 'sono', titulo: 'Dormir', inicio: '21:00', fim: null,
    diasSemana: TODOS_OS_DIAS, coletiva: true, acolhidoId: null,
    instrucoes: 'Os maiores podem ficar até as 22h na sexta e no sábado.' },
  // A versão encerrada, com o horário antigo — é o que prova que ela continua.
  { id: 'ri0a', versaoId: 'rv1', tipo: 'refeicao', titulo: 'Almoço', inicio: '12:00', fim: '13:00',
    diasSemana: TODOS_OS_DIAS, coletiva: true, acolhidoId: null, instrucoes: null },
  { id: 'ri0b', versaoId: 'rv1', tipo: 'banho', titulo: 'Banho', inicio: '16:30', fim: '17:30',
    diasSemana: TODOS_OS_DIAS, coletiva: true, acolhidoId: null, instrucoes: null },
];

/**
 * O DOSSIÊ e as VIVÊNCIAS no protótipo.
 *
 * Os arquivos ficam em memória, como data-URL — é o que o navegador consegue
 * fazer sozinho, e some ao fechar, como todo o resto da demonstração. O que
 * importa é o CAMINHO ser o mesmo do servidor: anexar não confere, o aceite
 * tem nome, e o judicial some para quem não o alcança.
 */
interface DocumentoMock {
  id: string; personId: string; chave: string | null; categoria: string; titulo: string;
  emitidoEm: string | null; validoAte: string | null; origem: string | null;
  anexadoEm: string; anexadoPor: string;
  aceitoEm: string | null; aceitoPor: string | null; notaDoAceite: string | null;
  versao: number; conteudo: string;
  arquivo: { nome: string; tipo: string; tamanho: number; sha256: string };
}
interface VivenciaMock {
  id: string; personId: string; tipo: string; quando: string; descricao: string;
  temFoto: boolean; autorizacaoRegistrada: boolean;
  arquivo: { nome: string; tipo: string } | null; conteudo: string | null;
  registradoPor: string; registradoEm: string;
}
/* alcance:judicial — quem lê a área restrita. O educador não entra. */
const VE_JUDICIAL = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

/** O tipo REAL, pelos primeiros bytes — a extensão não entra na conta. */
function tipoDoDataUrl(dataUrl: string): string | null {
  const b64 = (dataUrl.split(',')[1] ?? '').slice(0, 24);
  let bin = '';
  try { bin = atob(b64); } catch { return null; }
  const hex = [...bin].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  if (hex.slice(8, 16) === '66747970') return 'image/heic';
  const achado = TIPOS_DE_ARQUIVO.find((t) => hex.startsWith(t.assinatura));
  return achado ? achado.tipo : null;
}

/**
 * Um JPEG mínimo de verdade, desenhado no momento: a demonstração precisa de
 * uma prévia que ABRA, e não de um retângulo cinza dizendo "documento".
 */
function jpegFicticio(rotulo: string): string {
  const cv = document.createElement('canvas');
  cv.width = 560; cv.height = 360;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#E8EEF5'; x.fillRect(0, 0, 560, 360);
  x.fillStyle = '#FFFFFF'; x.fillRect(20, 20, 520, 320);
  x.fillStyle = '#003262'; x.font = 'bold 24px system-ui';
  x.fillText(rotulo.toUpperCase(), 44, 78);
  x.font = '15px system-ui'; x.fillStyle = '#26374D';
  x.fillText('Documento FICTÍCIO, gerado para a demonstração.', 44, 124);
  x.fillText('Nenhum dado real de criança entra aqui.', 44, 150);
  x.save(); x.translate(280, 250); x.rotate(-0.08);
  x.font = 'bold 30px system-ui'; x.fillStyle = 'rgba(185,28,28,.72)';
  x.textAlign = 'center'; x.fillText('FICTÍCIO — DEMONSTRAÇÃO', 0, 0); x.restore();
  return cv.toDataURL('image/jpeg', 0.82);
}

const DOSSIE_DOCS: DocumentoMock[] = [];
const VIVENCIAS: VivenciaMock[] = [];

/**
 * Semeia a pasta da Alice: um documento CONFERIDO, um AGUARDANDO conferência e
 * uma vivência com foto sem autorização registrada. Sem isso a tela abre em
 * três estados vazios e não mostra a diferença entre eles — que é a coisa
 * inteira que ela existe para mostrar.
 */
function semearDossie() {
  if (DOSSIE_DOCS.length) return;
  const doc = (chave: string, categoria: string, titulo: string, aceito: boolean,
               validoAte: string | null = null): DocumentoMock => ({
    id: uid(), personId: 'p01', chave, categoria, titulo,
    emitidoEm: null, validoAte, origem: null,
    anexadoEm: emHoras(9, 15), anexadoPor: 'Tatiane Técnica (fictícia)',
    aceitoEm: aceito ? emHoras(9, 40) : null,
    aceitoPor: aceito ? 'Marcelo Barbosa' : null,
    notaDoAceite: aceito ? 'Legível, e é a certidão dela.' : null,
    versao: 1, conteudo: jpegFicticio(titulo),
    arquivo: { nome: `${chave}.jpg`, tipo: 'image/jpeg', tamanho: 48_000, sha256: uid() },
  });
  DOSSIE_DOCS.push(
    doc('certidao_nascimento', 'pessoal', 'Certidão de nascimento', true),
    doc('cartao_sus', 'pessoal', 'Cartão SUS', false),
    doc('caderneta_vacinacao', 'pessoal', 'Caderneta de vacinação', true, diasAtras(-120)),
    doc('guia_acolhimento', 'judicial_socioassistencial', 'Guia de acolhimento', true),
  );
  VIVENCIAS.push(
    { id: uid(), personId: 'p01', tipo: 'aniversario', quando: diasAtras(110),
      descricao: 'Aniversário de 7 anos, com bolo de chocolate feito na casa e a turma toda cantando.',
      temFoto: true, autorizacaoRegistrada: false,
      arquivo: { nome: 'aniversario.jpg', tipo: 'image/jpeg' },
      conteudo: jpegFicticio('Foto do aniversário'),
      registradoPor: 'Tainá Souza (fictícia)', registradoEm: emHoras(20, 0) },
    { id: uid(), personId: 'p01', tipo: 'conquista', quando: diasAtras(30),
      descricao: 'Aprendeu a andar de bicicleta sem rodinhas no pátio, num sábado de manhã.',
      temFoto: false, autorizacaoRegistrada: false, arquivo: null, conteudo: null,
      registradoPor: 'Lúcia Líder Diurna (fictícia)', registradoEm: emHoras(11, 30) },
  );
}

const EPISODIOS: EpisodioMock[] = [];

/**
 * Um episódio semeado, com uma ciência já registrada: sem ele a seção abre
 * vazia e quem está vendo o protótipo não descobre que o relato do colega e o
 * comentário de quem assume ficam LADO A LADO, cada um com o seu nome — que é
 * a coisa inteira que a seção existe para mostrar.
 */
function semearEpisodio() {
  if (EPISODIOS.length) return;
  const s = PLANTOES.find((x) => x.turno === 'diurno');
  if (!s) return;
  EPISODIOS.push({
    id: 'ep1', ataId: ataDo(s.id).id, acolhidoId: 'p01',
    classificacao: 'desorganizacao',
    relato: 'Por volta das 2h20 acordou chorando e não quis voltar para o quarto. '
      + 'Ficou na sala com a educadora até as 3h05, tomou água e dormiu em seguida.',
    quando: emHoras(2, 20), registradoPor: 'Nélio Noturno (fictício)',
    ciencias: [{ id: 'k1', quem: 'Lúcia Líder Diurna (fictícia)', userId: 'u2',
      comentario: 'Acompanhei pela manhã; acordou bem e foi para a escola no horário.',
      quando: emHoras(7, 15) }],
  });
}

function ataDo(plantaoId: string): AtaMock {
  let a = ATAS.find((x) => x.plantaoId === plantaoId);
  if (!a) {
    a = { id: uid(), plantaoId, status: 'aberta', versao: 1, pendencias: null,
          fechadaEm: null, conteudo: {}, adendos: [] };
    ATAS.push(a);
  }
  return a;
}

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

/**
 * Os estados de dose são os do servidor (§11.2) — mesma chave, mesmo rótulo.
 * A tela e o protótipo tinham uma lista paralela, no feminino, que o servidor
 * teria recusado com 400 em toda confirmação.
 */
const ESTADO_DOSE: Record<string, string> = {
  aguardando_confirmacao: 'Aguardando confirmação',
  administrado_no_horario: 'Administrado no horário',
  administrado_com_atraso: 'Administrado com atraso',
  recusado: 'Recusado',
  nao_administrado: 'Não administrado',
  indisponivel: 'Indisponível',
  suspenso_conforme_orientacao: 'Suspenso conforme orientação',
  acolhido_ausente: 'Acolhido ausente',
  incidente: 'Incidente',
};
/** Estados que exigem observação obrigatória (§11.4). */
const EXIGEM_NOTA = new Set([
  'administrado_com_atraso', 'recusado', 'nao_administrado',
  'indisponivel', 'acolhido_ausente', 'incidente',
]);
/** Finalidades do Resumo de Saúde, nos códigos do servidor (§7.4). */
const FINALIDADES_RESUMO = [
  'consulta', 'exame', 'urgencia', 'internacao', 'transferencia_assistencial',
];

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
/* alcance:substituicao — quem decide. Espelha PODE_AUTORIZAR_SUB do servidor. */
const DECIDE_SUB_MOCK = ['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica', 'coordenador'];
/* Quem cria atividade urgente (§8.2) — espelha PODE_URGENTE do servidor. */
const CRIA_URGENTE_MOCK = ['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica',
                           'coordenador', 'gestor_geral'];

interface PedidoSub {
  id: string; atividade: string; horario: string; motivo: string; status: string;
  pedidoPor: string; substituto: string | null; decidiuNota: string | null;
  solicitadoEm: string; semEfeito: boolean; aviso: string | null;
}
const PEDIDOS_SUB: PedidoSub[] = [
  { id: 'sub1', atividade: 'Consulta odontológica — Luiz', horario: emHoras(15, 0),
    motivo: 'Preciso sair às 16h para uma consulta e não volto a tempo de levá-lo.',
    status: 'solicitada', pedidoPor: 'Mário Silva (fictício)', substituto: null,
    decidiuNota: null, solicitadoEm: new Date().toISOString(),
    semEfeito: false, aviso: null },
  { id: 'sub2', atividade: 'Café da manhã', horario: emHoras(7, 0),
    motivo: 'Fiquei retido no transporte e cheguei depois das oito.',
    status: 'solicitada', pedidoPor: 'Joana Lima (fictícia)', substituto: null,
    decidiuNota: null, solicitadoEm: new Date().toISOString(), semEfeito: true,
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
  /**
   * `GET /houses/directory` no formato do servidor: código, nome, tipo e se é
   * a casa da pessoa. O mock devolvia `CASAS` cru (id/code/name/kind), e a
   * tela lê `codigo`/`nome`/`propria` — a lista aparecia sem nome nenhum.
   */
  if (rota === '/houses/directory') {
    return CASAS.map((c) => ({
      id: c.id, codigo: c.code, nome: c.name, tipo: c.kind, propria: c.id === CASA.id,
    }));
  }
  if (rota.startsWith('/houses/') && rota.endsWith('/occupancy')) {
    const ocupadas = todosKids().length;
    return {
      capacidade: 20, ocupadas, vagas: Math.max(0, 20 - ocupadas),
      acimaDoLimite: ocupadas > 20,
      podeAlterar: ['coordenador', 'gestor_geral'].includes(eu.role),
    };
  }

  // ---- relatos independentes (§12.2)
  /*
   * As sete opções vêm do SERVIDOR, e é por isso que a tela não inventa a
   * lista: "presenciei integralmente" e "soube depois" não são a mesma frase,
   * e num caso de proteção a diferença entre elas é o dado.
   */
  if (rota === '/statements/options') return OPCOES_TESTEMUNHO;

  if (rota === '/statements' && metodo === 'POST') {
    const op = OPCOES_TESTEMUNHO.find((o) => o.code === String(b.witness ?? ''));
    if (!op) {
      return new Recusa(400, 'Informe como você participou do fato: '
        + OPCOES_TESTEMUNHO.map((o) => o.label).join('; ') + '.');
    }
    // "Sem informação adicional" é resposta legítima e dispensa texto. As
    // demais afirmam algo sobre um fato e precisam dizer o quê.
    if (op.code !== 'sem_informacao_adicional' && String(b.body ?? '').trim().length < 10) {
      return new Recusa(400, 'Escreva o que você viu: o fato, o horário e o que foi feito.');
    }
    RELATOS.push({
      id: uid(), entity: String(b.entity ?? ''), entityId: String(b.entityId ?? ''),
      autor: eu.fullName, autorId: eu.id, testemunho: op.label, codigoTestemunho: op.code,
      relato: String(b.body ?? ''), restrito: b.restrito === true,
      quando: String(b.happenedAt ?? new Date().toISOString()),
    });
    return { ok: true,
      aviso: 'Relato registrado com o seu nome. Ninguém edita o relato de ninguém — se '
        + 'precisar corrigir, escreva outro ao lado.' };
  }

  if (rota === '/statements' && metodo === 'GET') {
    return relatosDe(String(q.get('entity') ?? ''), String(q.get('entityId') ?? ''));
  }

  // ---- avisos (§19): a caixa do escalonamento
  /*
   * O protótipo mostra a caixa com o que o sistema escalaria num dia comum da
   * casa: a ATA fechada com pendência, a dose sem confirmação, a ocorrência
   * crítica aguardando análise e a falha do Drive na terceira tentativa. É
   * assim que o educador descobre que "avisa a técnica na hora" tem endereço.
   */
  if (rota === '/notifications/count') {
    return { naoLidas: AVISOS.filter((a) => !a.lida).length,
             tituloSeguro: 'Há uma pendência na Rede Acolher' };
  }
  if (rota === '/notifications' && metodo === 'GET') {
    const so = q.get('unread') === 'true';
    return AVISOS.filter((a) => !so || !a.lida);
  }
  if (seg[0] === 'notifications' && seg[2] === 'read' && metodo === 'POST') {
    const a = AVISOS.find((x) => x.id === seg[1]);
    if (!a) return new Recusa(404, 'Aviso não encontrado.');
    a.lida = true; return { ok: true };
  }
  if (seg[0] === 'notifications' && seg[2] === 'acknowledge' && metodo === 'POST') {
    const a = AVISOS.find((x) => x.id === seg[1]);
    if (!a) return new Recusa(404, 'Aviso não encontrado.');
    a.lida = true; a.ciente = true; return { ok: true };
  }

  // ---- equipe
  /**
   * `GET /staff` no formato do servidor — em PORTUGUÊS.
   *
   * O mock devolvia `fullName`, `role`, `active` e `houses`, e a tela lê
   * `nome`, `cargo`, `setor`, `casa` e `ativo`. O resultado no protótipo era a
   * equipe inteira aparecendo como DESATIVADA, sem setor e com "0 pessoas" em
   * cada função — e ninguém tinha notado, porque a tela não quebra: ela mente
   * baixinho.
   */
  if (rota === '/staff') {
    const podeEditar = ['coordenador', 'gestor_geral', 'equipe_tecnica'].includes(eu.role);
    return EQUIPE_CASA.map((m) => ({
      id: m.id,
      nome: m.nome,
      email: `${m.nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@paodospobres.dev`,
      cargo: m.cargo,
      setor: TIPOS_SETOR.find((t) => t.code === m.cargo)?.label ?? m.cargo,
      transversal: TIPOS_SETOR.find((t) => t.code === m.cargo)?.transversal ?? false,
      casa: CASA.code, casaId: CASA.id,
      ativo: !DESATIVADOS.has(m.id),
      ultimoAcesso: null,
      senhaInicialPendente: false,
      editavel: podeEditar,
      proprio: m.id === eu.id,
    }));
  }
  /**
   * O que cada setor enxerga. No protótipo a lista é a mesma do servidor,
   * copiada de `backend/src/modules/identity/alcance.ts` — e o teste de
   * contrato cobra que as duas não divirjam.
   */
  /**
   * `GET /reports/kitchen` — a projeção deliberadamente pobre da cozinha:
   * nome, o que evitar, a substituição e quando revisar. Sem motivo, sem CPF,
   * sem caso, sem histórico.
   */
  if (rota === '/reports/kitchen' && metodo === 'GET') {
    if (!['cozinha', 'coordenador', 'equipe_tecnica', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Sem acesso ao relatório de alimentação.');
    }
    return todosKids()
      .filter((k) => k.restricao)
      .map((k) => ({
        nome: k.nome,
        evitar: k.restricao!.restriction,
        substituicao: k.restricao!.substitution ?? null,
        orientacao: k.restricao!.guidance ?? null,
        revisarEm: null,
      }));
  }

  if (rota === '/staff/alcance') return { cargos: ALCANCE_POR_CARGO };

  /**
   * `GET /staff/sectors` — os setores que ESTE cargo pode cadastrar, no
   * formato do servidor (`code`, não `cod`). A coordenação monta a equipe da
   * casa e cadastra a Enfermagem; conta de alcance institucional é do Gestor
   * Geral (§5.13) — se a coordenação pudesse criar Gestor Geral, bastaria
   * cadastrar alguém para enxergar as oito casas.
   */
  if (rota === '/staff/sectors') {
    const podeCadastrar: Record<string, string[]> = {
      coordenador: ['educador', 'lider_diurno', 'equipe_tecnica', 'cozinha', 'enfermagem'],
      gestor_geral: TIPOS_SETOR.map((t) => t.code),
      equipe_tecnica: ['educador', 'lider_diurno', 'equipe_tecnica', 'cozinha', 'enfermagem'],
    };
    const meus = podeCadastrar[eu.role] ?? [];
    return TIPOS_SETOR.filter((t) => meus.includes(t.code))
      .map((t) => ({ ...t, exigeCasa: !t.transversal }));
  }
  /**
   * Desativar, reativar e redefinir senha — cada um com a sua frase.
   *
   * Havia um curinga aqui que respondia "no protótipo, a alteração vale só
   * nesta tela" para QUALQUER coisa sob /staff/. Redefinir a senha de alguém
   * não é "uma alteração": encerra as sessões abertas e devolve uma senha que
   * aparece uma única vez. Um curinga que engole isso ensina a equipe uma
   * operação que não é a do sistema.
   */
  if (seg[0] === 'staff' && seg[2] === 'deactivate' && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral', 'equipe_tecnica'].includes(eu.role)) {
      return new Recusa(403, 'Administrar a equipe é da coordenação, da gestão ou da '
        + 'equipe técnica.');
    }
    DESATIVADOS.add(seg[1]);
    return { ok: true, ativo: false,
      aviso: 'Desativado, e as sessões abertas foram encerradas. O histórico e a autoria '
        + 'de tudo o que registrou permanecem — o sistema não apaga pessoas.' };
  }
  if (seg[0] === 'staff' && seg[2] === 'reactivate' && metodo === 'POST') {
    DESATIVADOS.delete(seg[1]);
    return { ok: true, ativo: true, aviso: 'Reativado. O histórico dele nunca deixou de existir.' };
  }
  if (seg[0] === 'staff' && seg[2] === 'reset-password' && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral', 'equipe_tecnica'].includes(eu.role)) {
      return new Recusa(403, 'Redefinir senha é da coordenação, da gestão ou da '
        + 'equipe técnica.');
    }
    const senha = String(b.senha ?? '').trim() || `inicial-${uid()}`;
    if (senha.length < 6) return new Recusa(400, 'A senha precisa de pelo menos 6 caracteres.');
    return { senhaInicial: senha,
      aviso: 'Senha redefinida e sessões encerradas. Entregue a senha à pessoa; ela é '
        + 'mostrada uma única vez. Quando der, prefira o convite: assim a senha não passa '
        + 'pela mão de quem convida.' };
  }
  if (seg[0] === 'staff' && seg.length === 2 && metodo === 'PATCH') {
    return { ok: true, aviso: 'Cadastro atualizado. No protótipo a alteração vale só nesta tela.' };
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
  /* A ATIVIDADE URGENTE (§8.2): pontual, com autoria e motivo. Antes dos
     ramos `:id`, porque "urgent" é palavra fixa no lugar do identificador. */
  if (rota === '/activities/urgent' && metodo === 'POST') {
    if (!CRIA_URGENTE_MOCK.includes(eu.role)) {
      return new Recusa(403,
        'Somente líderes de plantão, equipe técnica e coordenação criam atividade urgente.');
    }
    if (String(b.reason ?? '').trim().length < 5) {
      return new Recusa(400, 'Informe o motivo da atividade urgente.');
    }
    if (String(b.title ?? '').trim().length < 3) {
      return new Recusa(400, 'Dê um nome à atividade — é o que a próxima pessoa lê na linha.');
    }
    const quem = b.personId ? KIDS.find((k) => k.id === b.personId)?.nome ?? null : null;
    LINHA.push({ id: `activity:${uid()}`, source: 'agenda',
      at: String(b.scheduledAt), kind: 'outro', title: String(b.title).trim(),
      person: quem, responsible: eu.fullName, state: 'Aguardando ciência',
      severity: 'alta', instructions: b.instructions ? String(b.instructions) : null,
      urgente: true, motivoUrgente: String(b.reason).trim() } as any);
    return { aviso: 'Atividade urgente e pontual registrada com autoria e motivo. O '
      + 'planejamento regular não foi alterado.' };
  }
  if (seg[0] === 'activities' && seg[2] === 'acknowledge') {
    const ev = LINHA.find((e) => e.id.endsWith(seg[1]));
    if (ev) ev.state = 'Ciente';
    return { ok: true, aviso: 'Ciência registrada em seu nome.' };
  }
  /**
   * `POST /activities/:id/delegate` — o caminho de CIMA para baixo (§10).
   *
   * A decisão é da fase 10 e existia só no servidor: o líder passa a atividade
   * adiante, com motivo, sem apagar a designação anterior. Quem faltou não
   * pede nada — o pedido de substituição nasce de quem vai sair.
   */
  if (seg[0] === 'activities' && seg[2] === 'delegate' && metodo === 'POST') {
    if (!['lider_diurno', 'lider_noturno_geral', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Somente o líder do turno e a coordenação delegam atividade.');
    }
    if (String(b.motivo ?? '').trim().length < 5) {
      return new Recusa(400, 'Informe o motivo da delegação.');
    }
    const quem = EQUIPE_CASA.find((m) => m.id === String(b.paraId ?? ''));
    if (!quem) return new Recusa(400, 'Esta pessoa não está na equipe desta unidade hoje.');
    const ev = LINHA.find((e) => (e.id.split(':')[1] ?? e.id) === seg[1]);
    if (ev) {
      ev.responsible = quem.nome;
      // O estado aqui é RÓTULO, como no resto da linha do tempo: a tela mostra
      // o que está escrito. "aguardando_ciencia" cru vazava para o corredor.
      ev.state = 'Aguardando ciência';
      ev.actions = [{ command: 'activity.acknowledge', label: 'Estou ciente' }];
    }
    AVISOS.unshift({ id: uid(), titulo: 'Uma atividade passou para você',
      texto: `"${ev?.title ?? 'Atividade'}" — tome ciência para assumir.`,
      prioridade: 'alta', entidade: 'activity', entidadeId: seg[1],
      lida: false, ciente: false, em: new Date().toISOString() });
    return { ok: true, para: quem.nome,
      aviso: `Atividade passada para ${quem.nome}, com o motivo registrado. A designação `
        + 'anterior não foi apagada, e a atividade volta a aguardar ciência: designado não '
        + 'é o mesmo que avisado.' };
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
    // Os decididos vêm junto: quem pediu precisa poder ler a recusa e o motivo
    // dela sem perguntar a ninguém.
    return PEDIDOS_SUB;
  }
  /* O pedido nasce de QUEM VAI SAIR — e a atividade fica marcada na linha. */
  if (seg[0] === 'activities' && seg[2] === 'substitution' && metodo === 'POST') {
    if (String(b.motivo ?? '').trim().length < 5) {
      return new Recusa(400, 'Informe o motivo do pedido de substituição.');
    }
    const ev = LINHA.find((e) => e.id.endsWith(seg[1]));
    if (!ev) return new Recusa(404, 'Atividade não encontrada');
    if (['Concluída no horário', 'Concluída com atraso', 'Cancelada externamente']
          .includes(ev.state)) {
      return new Recusa(400,
        `Esta atividade já foi encerrada como "${ev.state}". Não cabe substituição no que já `
        + 'aconteceu — uma correção entra como adendo pela equipe técnica.');
    }
    PEDIDOS_SUB.unshift({ id: uid(), atividade: ev.title, horario: ev.at,
      motivo: String(b.motivo).trim(), status: 'solicitada', pedidoPor: eu.fullName,
      substituto: null, decidiuNota: null, solicitadoEm: new Date().toISOString(),
      semEfeito: false, aviso: null });
    ev.state = 'Aguardando substituição';
    return { aviso: 'Pedido registrado, com o seu nome e o motivo. Ele fica em aberto até o '
      + 'líder do turno, a equipe técnica ou a coordenação decidir — ninguém é dado como '
      + 'substituído sozinho.' };
  }
  if (seg[0] === 'activities' && seg[1] === 'substitutions' && seg[3] === 'assign') {
    const p = PEDIDOS_SUB.find((x) => x.id === seg[2]);
    if (!p || p.status !== 'solicitada') {
      return new Recusa(404, 'Pedido não encontrado ou já decidido.');
    }
    if (!DECIDE_SUB_MOCK.includes(eu.role)) {
      return new Recusa(403,
        'Somente o líder do turno, a equipe técnica ou a coordenação decidem substituição.');
    }
    if (p.semEfeito) {
      return new Recusa(400,
        'A atividade já foi encerrada enquanto o pedido esperava. Não cabe substituir o que já '
        + 'aconteceu — recuse o pedido, com o motivo.');
    }
    const nome = EQUIPE_CASA.find((m) => m.id === b.substitutoId)?.nome ?? 'Colega';
    // `atribuida` é o valor que o banco aceita — o mock não pode inventar outro.
    p.status = 'atribuida'; p.substituto = nome;
    p.decidiuNota = b.nota ? String(b.nota) : null;
    const ev = LINHA.find((e) => e.title === p.atividade);
    if (ev) { ev.state = 'Aguardando ciência'; ev.responsible = nome; }
    return { ok: true, status: 'atribuida',
      aviso: `Substituição autorizada: ${nome} assume, e precisa tomar ciência. O sistema não `
        + 'dá ninguém como avisado por ter sido escolhido.' };
  }
  if (seg[0] === 'activities' && seg[1] === 'substitutions' && seg[3] === 'decline') {
    const p = PEDIDOS_SUB.find((x) => x.id === seg[2]);
    if (!p) return new Recusa(404, 'Pedido não encontrado ou já decidido.');
    if (!DECIDE_SUB_MOCK.includes(eu.role)) {
      return new Recusa(403,
        'Somente o líder do turno, a equipe técnica ou a coordenação decidem substituição.');
    }
    if (String(b.motivo ?? '').trim().length < 5) {
      return new Recusa(400, 'Informe o motivo da recusa — quem pediu vai ler.');
    }
    p.status = 'recusada'; p.decidiuNota = String(b.motivo).trim();
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
  /* Palavra fixa antes de `/checks/:id`: dois segmentos dos dois lados. */
  if (rota === '/checks/kinds' && metodo === 'GET') {
    return {
      tipos: TIPOS_DE_CHAMADA.map((t) => ({ ...t, opcoes: opcoesDoTipo(t.cod) })),
      aviso: 'A chamada confere UMA pessoa por vez. Não existe marcar todos de uma vez: '
        + 'a conferência coletiva é justamente o que impede que alguém passe despercebido.',
    };
  }

  if (rota === '/checks' && metodo === 'POST') {
    const tipo = TIPOS_DE_CHAMADA.find((t) => t.cod === String(b.kind ?? ''));
    if (!tipo) {
      return new Recusa(400, 'Escolha o tipo da chamada: '
        + TIPOS_DE_CHAMADA.map((t) => t.label).join('; ') + '.');
    }
    const titulo = String(b.titulo ?? '').trim() || tipo.sugestao;
    if (titulo.length < 3) {
      return new Recusa(400,
        'Dê um nome à chamada — é o que a próxima pessoa lê na lista do dia.');
    }
    const nova: Chamada = { id: uid(), tipo: tipo.cod, titulo,
                            status: 'aberta', horario: new Date().toISOString(), resultados: {} };
    CHAMADAS = [...CHAMADAS, nova];
    return { id: nova.id, esperados: todosKids().length, opcoes: opcoesDoTipo(tipo.cod) };
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
        naConferenciaDeMesa: !!res?.mesa,
      };
    });
    const conferidos = linhas.filter((l) => l.resultado).length;
    const comum = opcoesDoTipo(k.tipo).find((o) => !o.excecao) ?? null;
    return {
      id: k.id, tipo: k.tipo, titulo: k.titulo, status: k.status,
      esperados: linhas.length, conferidos, faltam: linhas.length - conferidos,
      quemFalta: linhas.filter((l) => !l.resultado).map((l) => l.nome),
      linhas, opcoes: opcoesDoTipo(k.tipo),
      // A chamada final do turno é um a um: ela existe para alguém CONTAR as
      // crianças antes de dormir, e "todos" ali seria suposição.
      aceitaConferenciaDeMesa: k.tipo !== 'chamada_final' && k.status === 'aberta',
      opcaoDaMesa: comum?.code ?? null,
      conferenciasDeMesa: k.mesas ?? [],
      avisoDaMesa: k.tipo === 'chamada_final'
        ? 'A chamada final do turno é um a um: ela existe para alguém contar as crianças '
          + 'antes de dormir, e "todos" aqui seria suposição, não observação.'
        : 'Conferir a mesa registra, de uma vez, o que você olhou de uma vez — com o seu nome, '
          + 'o horário e quantos. Quem já foi marcado NÃO é sobrescrito, e exceção continua '
          + 'sendo uma a uma, com o motivo escrito.',
    };
  }
  // A conferência de mesa ANTES do ramo `mark`/`confirm` não é necessária aqui
  // (os três segmentos diferem), mas fica junto deles por leitura.
  if (seg[0] === 'checks' && seg[2] === 'bulk' && metodo === 'POST') {
    const k = CHAMADAS.find((x) => x.id === seg[1]);
    if (!k) return new Recusa(404, 'Chamada não encontrada');
    if (k.status !== 'aberta') {
      return new Recusa(400,
        'Chamada já confirmada. Correções entram como adendo pela equipe técnica.');
    }
    if (k.tipo === 'chamada_final') {
      return new Recusa(400,
        'A chamada final do turno é um a um. Ela existe para alguém contar as crianças antes '
        + 'de dormir — "todos" aqui seria suposição, não observação.');
    }
    const comum = opcoesDoTipo(k.tipo).find((o) => !o.excecao);
    if (!comum) {
      return new Recusa(400, 'Este tipo de chamada não tem uma opção comum a conferir em bloco.');
    }
    // Só quem AINDA NÃO tem registro. Quem já foi marcado fica como está —
    // inclusive a criança marcada "recusou" antes de a mesa ser conferida.
    const pendentes = todosKids().filter((p) => !k.resultados[p.id]);
    if (!pendentes.length) {
      return new Recusa(400, 'Todos já foram conferidos nesta chamada — não há o que marcar em bloco.');
    }
    const mesa = uid();
    for (const p of pendentes) k.resultados[p.id] = { opcao: comum.code, mesa };
    k.mesas = [...(k.mesas ?? []), { id: mesa, opcao: comum.code, quantos: pendentes.length,
                                     por: eu.fullName, quando: new Date().toISOString() }];
    return { id: mesa, marcados: pendentes.length, opcao: comum.label,
      aviso: `Conferência de mesa registrada: ${pendentes.length} como "${comum.label}", com o `
        + 'seu nome e o horário. Quem já estava marcado não foi tocado. Se alguém não estiver '
        + 'assim, abra o nome dessa criança e corrija — a correção guarda o que constava antes.' };
  }
  if (seg[0] === 'checks' && seg[2] === 'mark') {
    const k = CHAMADAS.find((x) => x.id === seg[1])!;
    if (k.status === 'confirmada') {
      return new Recusa(400, 'Chamada confirmada não é reescrita — a correção entra como adendo.');
    }
    // Corrigir uma linha que veio da mesa a torna INDIVIDUAL: alguém olhou
    // aquela criança. A procedência não pode continuar dizendo "na mesa".
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
  if (rota === '/shifts/ata-sections') {
    return {
      secoes: SECOES_ATA, ambientes: AMBIENTES_CASA,
      classificacoesEpisodio: CLASSIFICACOES_EPISODIO,
      aviso: 'A ATA descreve o TURNO e os AMBIENTES. A organização da casa é do ambiente, '
        + 'nunca de quem arrumou ou deixou de arrumar (§3.3).',
    };
  }
  if (rota === '/shifts' && metodo === 'GET') {
    return PLANTOES.map((s) => {
      const a = ataDo(s.id);
      return {
        id: s.id, turno: s.turno, status: s.status, abertoEm: s.abertoEm, fechadoEm: s.fechadoEm,
        ataId: a.id, ataStatus: a.status,
        passagensAssinadas: s.passagens.length, recebimentos: s.recebimentos.length,
        assinaturasFaltantes: s.esperados.filter(
          (e) => !s.passagens.some((p) => p.userId === e.userId)).length,
      };
    });
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
  /**
   * O ARQUIVO DAS ATAS. Fica ANTES de `/shifts/:id`, e não por arrumação: o
   * roteador decide por segmento, `['shifts','ata-archive']` tem o mesmo
   * tamanho de `['shifts', id]`, e a consulta caía na busca do plantão — que
   * não achava nada e estourava com "reading 'id'". É a mesma regra do
   * servidor, onde a rota de palavra fixa vem antes do `:id`.
   *
   * Duas regras de alcance vivem aqui, e são as mesmas do servidor:
   * quem folheia (coordenação, equipe técnica e os dois líderes — o educador
   * não), e o que sai da ATA Geral Noturna (a linha desta casa; o caminho para
   * a folha das oito só para quem responde por ela).
   */
  if (rota === '/shifts/ata-archive' && metodo === 'GET') {
    const folheia = ['coordenador', 'equipe_tecnica', 'lider_diurno',
                     'lider_noturno_geral', 'gestor_geral'].includes(eu.role);
    if (!folheia) {
      return new Recusa(403,
        'O arquivo das ATAS é da coordenação, da equipe técnica e dos líderes.');
    }
    const escala = String(q.get('escala') ?? 'dia');
    const base = String(q.get('data') || HOJE);
    const { de, ate } = janelaDeConsulta(escala, base);
    const veFolhaCompleta = eu.role === 'gestor_geral' || eu.role === 'lider_noturno_geral';

    const dias = [
      // O dia de hoje sai dos plantões vivos: o arquivo e a tela do dia
      // contam a mesma história, e é isso que o Marcelo vai conferir.
      { data: HOJE,
        diurno: capaDoPlantao('diurno'), noturno: capaDoPlantao('noturno'),
        geral: linhaDaCasaNaGeral() },
      ...ARQUIVO_ATAS,
    ].filter((d) => d.data >= de && d.data <= ate)
     .filter((d) => d.diurno || d.noturno || d.geral)
     .map((d) => ({ ...d,
       geral: d.geral && { ...d.geral, id: veFolhaCompleta ? ATA_GERAL.id : null } }));

    return { de, ate, escala, dias,
      notaAtaGeral: veFolhaCompleta
        ? 'Da ATA Geral Noturna aparece aqui a linha desta casa. A folha completa das oito '
          + 'casas você abre pela ATA Geral do dia.'
        : 'Da ATA Geral Noturna aparece a linha desta casa — o que o Líder Noturno Geral '
          + 'registrou sobre ela. O que ele registrou sobre as outras casas é assunto delas.' };
  }

  // ---------- A ROTINA DA CASA (§8.1) ----------
  // Versionada de verdade também aqui: abrir versão nova ENCERRA a atual com a
  // data de hoje e COPIA os itens. Se a demonstração deixasse a rotina ser
  // reescrita, ela ensinaria o contrário do que o sistema faz.
  // ---------- O DOSSIÊ DO ACOLHIDO (§6.1) e as VIVÊNCIAS (§6.9) ----------
  // Palavra fixa antes dos ramos `:id`, pela mesma razão do servidor.
  if (rota === '/people/dossie/catalogo') {
    semearDossie();
    return { categorias: CATEGORIAS_DOSSIE, itens: DOSSIE_EXIGIDO,
      tiposDeVivencia: TIPOS_DE_VIVENCIA, tamanhoMaximo: TAMANHO_MAXIMO,
      aceitos: TIPOS_DE_ARQUIVO.map((t) => t.rotulo),
      aviso: 'O arquivo é conferido pela assinatura dele, não pela extensão. E o título nunca '
        + 'leva CPF, diagnóstico nem teor de decisão judicial: nome de arquivo aparece em '
        + 'lista, em busca e em pasta compartilhada.' };
  }
  if (seg[0] === 'people' && seg[2] === 'dossie' && metodo === 'GET') {
    semearDossie();
    const meus = DOSSIE_DOCS.filter((d) => d.personId === seg[1]);
    const podeJudicial = VE_JUDICIAL.includes(eu.role);
    const categorias = CATEGORIAS_DOSSIE
      .filter((c) => !c.restrita || podeJudicial)
      .map((cat) => {
        const itens = DOSSIE_EXIGIDO.filter((i) => i.categoria === cat.code).map((i) => {
          const dele = meus.filter((d) => d.chave === i.chave);
          return { ...i, documentos: dele,
            situacao: dele.some((d) => d.aceitoEm) ? 'aceito'
              : dele.length ? 'aguardando_conferencia' : 'falta' };
        });
        return { ...cat, itens,
          obrigatoriosQueFaltam: itens.filter((i) => i.obrigatorio && i.situacao === 'falta')
            .map((i) => i.label),
          aguardandoConferencia: itens.filter((i) => i.situacao === 'aguardando_conferencia').length };
      });
    return { categorias, avulsos: meus.filter((d) => !d.chave),
      vence: meus.filter((d) => d.validoAte).slice(0, 5),
      aviso: 'Anexar não é conferir. O arquivo entra, e o aceite é de quem OLHOU e disse que é '
        + 'aquele documento e que está legível — com o nome dessa pessoa e o horário.' };
  }
  if (seg[0] === 'people' && seg[2] === 'documents' && seg.length === 3 && metodo === 'POST') {
    const proibido = tituloProibido(String(b.titulo ?? ''));
    if (proibido) return new Recusa(400, proibido);
    const noNome = tituloProibido(String(b.nomeArquivo ?? 'arquivo'));
    if (noNome) return new Recusa(400, `O NOME DO ARQUIVO tem o mesmo problema: ${noNome}`);
    const tipo = tipoDoDataUrl(String(b.conteudo ?? ''));
    if (!tipo) {
      return new Recusa(400,
        'Este arquivo não é imagem nem PDF. O dossiê guarda documento digitalizado — e a '
        + 'conferência é pela assinatura do arquivo, não pela extensão do nome.');
    }
    const id = uid();
    DOSSIE_DOCS.unshift({ id, personId: String(seg[1]), chave: b.chave ? String(b.chave) : null,
      categoria: String(b.categoria), titulo: String(b.titulo).trim(),
      emitidoEm: b.emitidoEm ? String(b.emitidoEm) : null,
      validoAte: b.validoAte ? String(b.validoAte) : null, origem: null,
      anexadoEm: new Date().toISOString(), anexadoPor: eu.fullName,
      aceitoEm: null, aceitoPor: null, notaDoAceite: null, versao: 1,
      conteudo: String(b.conteudo),
      arquivo: { nome: String(b.nomeArquivo), tipo,
                 tamanho: Math.round(String(b.conteudo).length * 0.75), sha256: uid() } });
    return { id, tipo,
      aviso: 'Arquivo guardado — e ainda NÃO conferido. Abra a prévia e confirme que é este '
        + 'documento e que está legível; o aceite fica com o seu nome e o horário.' };
  }
  if (seg[0] === 'people' && seg[2] === 'documents' && seg[4] === 'accept' && metodo === 'POST') {
    const d = DOSSIE_DOCS.find((x) => x.id === seg[3]);
    if (!d) return new Recusa(404, 'Documento não encontrado.');
    if (d.aceitoEm) {
      return new Recusa(400,
        'Este documento não existe nesta criança, ou já foi conferido. Se o arquivo estiver '
        + 'errado, anexe a versão certa — o que foi aceito antes continua registrado.');
    }
    d.aceitoEm = new Date().toISOString(); d.aceitoPor = eu.fullName;
    d.notaDoAceite = b.nota ? String(b.nota) : null;
    return { ok: true, aviso: 'Conferido, com o seu nome e o horário.' };
  }
  if (seg[0] === 'people' && seg[2] === 'documents' && seg[4] === 'file' && metodo === 'GET') {
    const d = DOSSIE_DOCS.find((x) => x.id === seg[3]);
    if (!d) return new Recusa(404, 'Documento não encontrado.');
    const [cab, dados] = d.conteudo.split(',');
    return { nome: d.arquivo.nome, tipo: (cab.match(/data:([^;]+)/) ?? [])[1] ?? 'image/jpeg',
             conteudo: dados ?? '' };
  }
  if (seg[0] === 'people' && seg[2] === 'memories' && seg.length === 3 && metodo === 'GET') {
    semearDossie();
    const itens = VIVENCIAS.filter((v) => v.personId === seg[1]);
    const semAutorizacao = itens.filter((v) => v.temFoto && !v.autorizacaoRegistrada).length;
    return { itens, tipos: TIPOS_DE_VIVENCIA, semAutorizacao,
      aviso: 'Este álbum é da criança. É o que ela leva quando sai, e costuma ser a única '
        + 'coisa do acolhimento que ela vai querer rever.',
      avisoDaAutorizacao: semAutorizacao > 0
        ? `${semAutorizacao} ${semAutorizacao === 1 ? 'foto está' : 'fotos estão'} sem a `
          + 'autorização de uso de imagem registrada. O sistema não impede — mas registra que '
          + 'não está, para ninguém ser pego de surpresa quando alguém perguntar.'
        : '' };
  }
  if (seg[0] === 'people' && seg[2] === 'memories' && seg.length === 3 && metodo === 'POST') {
    if (!TIPOS_DE_VIVENCIA.some((t) => t.code === b.tipo)) {
      return new Recusa(400, 'Tipo de vivência inválido.');
    }
    if (String(b.descricao ?? '').trim().length < 5) {
      return new Recusa(400,
        'Escreva o que aconteceu. A foto sozinha, daqui a dez anos, não diz de que dia foi.');
    }
    if (b.conteudo && !String(b.conteudo).startsWith('data:image')) {
      return new Recusa(400, 'A vivência recebe FOTO. Documento vai para o dossiê.');
    }
    const id = uid();
    VIVENCIAS.unshift({ id, personId: String(seg[1]), tipo: String(b.tipo),
      quando: String(b.quando), descricao: String(b.descricao).trim(),
      temFoto: !!b.conteudo, autorizacaoRegistrada: b.autorizacaoRegistrada === true,
      arquivo: b.conteudo ? { nome: String(b.nomeArquivo ?? 'foto'), tipo: 'image/jpeg' } : null,
      conteudo: b.conteudo ? String(b.conteudo) : null,
      registradoPor: eu.fullName, registradoEm: new Date().toISOString() });
    return { id, aviso: b.conteudo && b.autorizacaoRegistrada !== true
      ? 'Vivência registrada. A autorização de uso de imagem NÃO está registrada nesta foto — '
        + 'fica anotado assim, e o álbum mostra.'
      : 'Vivência registrada no álbum da criança.' };
  }
  if (seg[0] === 'people' && seg[2] === 'memories' && seg[4] === 'file' && metodo === 'GET') {
    const v = VIVENCIAS.find((x) => x.id === seg[3]);
    if (!v?.conteudo) return new Recusa(404, 'Esta vivência não tem foto.');
    return { nome: v.arquivo?.nome ?? 'foto', tipo: 'image/jpeg',
             conteudo: v.conteudo.split(',')[1] ?? '' };
  }

  if (seg[0] === 'routine' && seg.length === 1 && metodo === 'GET') {
    const v = VERSOES_ROTINA.find((x) => x.vigenteAte === null) ?? null;
    return {
      versao: v ? { id: v.id, numero: v.numero, vigenteDesde: v.vigenteDesde, nota: v.nota } : null,
      itens: v ? ITENS_ROTINA.filter((i) => i.versaoId === v.id)
        .sort((a, z) => a.inicio.localeCompare(z.inicio))
        .map((i) => ({
          id: i.id, tipo: i.tipo, titulo: i.titulo, inicio: i.inicio, fim: i.fim,
          diasSemana: i.diasSemana, coletiva: i.coletiva,
          acolhido: i.acolhidoId
            ? { id: i.acolhidoId,
                nome: KIDS.find((k) => k.id === i.acolhidoId)?.nome ?? '(fora do seu alcance)',
                visivel: KIDS.some((k) => k.id === i.acolhidoId) }
            : null,
          instrucoes: i.instrucoes, transporte: null,
          prioridade: 3, exigeCiencia: !i.coletiva,
        })) : [],
      tipos: TIPOS_ROTINA, dias: DIAS_DA_SEMANA,
      podeAlterar: ALTERA_ROTINA.includes(eu.role),
      aviso: v
        ? 'Alterar a rotina cria uma VERSÃO NOVA. A anterior continua inteira: é ela que '
          + 'explica por que o dia de dois meses atrás foi daquele jeito.'
        : 'Esta casa ainda não tem rotina registrada. Enquanto não tiver, o dia nasce '
          + 'do que está na agenda e do que a equipe lançar — e não de um molde escrito.',
    };
  }
  if (seg[0] === 'routine' && seg[1] === 'history' && metodo === 'GET') {
    return [...VERSOES_ROTINA].sort((a, z) => z.numero - a.numero).map((v) => ({
      numero: v.numero, vigenteDesde: v.vigenteDesde, vigenteAte: v.vigenteAte,
      nota: v.nota, atual: v.vigenteAte === null,
    }));
  }
  if (seg[0] === 'routine' && seg[1] === 'versions' && seg.length === 2 && metodo === 'POST') {
    if (!ALTERA_ROTINA.includes(eu.role)) {
      return new Recusa(403, 'Somente equipe técnica e coordenação alteram a rotina.');
    }
    if (!String(b.motivo ?? '').trim()) {
      return new Recusa(400, 'Descreva o motivo da nova versão da rotina.');
    }
    const atual = VERSOES_ROTINA.find((x) => x.vigenteAte === null) ?? null;
    if (atual) atual.vigenteAte = HOJE;
    const nova = { id: uid(), numero: (atual?.numero ?? 0) + 1, vigenteDesde: HOJE,
                   vigenteAte: null as string | null, nota: String(b.motivo).trim() };
    VERSOES_ROTINA.push(nova);
    // Copiar os itens é o que faz a versão nova ser um PONTO DE PARTIDA e não
    // uma folha em branco: ninguém reescreve a rotina inteira para mudar a
    // hora da janta.
    if (atual) {
      for (const i of ITENS_ROTINA.filter((x) => x.versaoId === atual.id)) {
        ITENS_ROTINA.push({ ...i, id: uid(), versaoId: nova.id });
      }
    }
    return { versaoId: nova.id, numero: nova.numero };
  }
  if (seg[0] === 'routine' && seg[1] === 'versions' && seg[3] === 'items' && metodo === 'POST') {
    if (!ALTERA_ROTINA.includes(eu.role)) {
      return new Recusa(403, 'Somente equipe técnica e coordenação alteram a rotina.');
    }
    const v = VERSOES_ROTINA.find((x) => x.id === seg[2]);
    if (!v) return new Recusa(404, 'Versão de rotina não encontrada.');
    if (v.vigenteAte !== null) {
      return new Recusa(409,
        'Esta versão da rotina já foi encerrada e não recebe itens novos — o que ela contém é o '
        + 'que a casa seguiu naquele período. Abra uma versão nova para alterar a rotina.');
    }
    if (!TIPOS_ROTINA.some((t) => t.code === b.kind)) {
      return new Recusa(400, 'Tipo de item de rotina inválido.');
    }
    if (!/^\d{2}:\d{2}$/.test(String(b.startTime ?? ''))) {
      return new Recusa(400, 'Informe o horário de início no formato 07:00.');
    }
    if (String(b.title ?? '').trim().length < 3) {
      return new Recusa(400, 'Dê um nome ao item: é o que a educadora lê na linha do dia.');
    }
    if (!b.collective && !b.personId) {
      return new Recusa(400, 'Item individual precisa indicar o acolhido.');
    }
    const id = uid();
    ITENS_ROTINA.push({
      id, versaoId: v.id, tipo: String(b.kind), titulo: String(b.title).trim(),
      inicio: String(b.startTime), fim: b.endTime ? String(b.endTime) : null,
      diasSemana: Array.isArray(b.weekdays) ? b.weekdays : [0, 1, 2, 3, 4, 5, 6],
      coletiva: b.collective !== false,
      acolhidoId: b.collective === false ? String(b.personId) : null,
      instrucoes: b.instructions ? String(b.instructions) : null,
    });
    return { id };
  }

  if (seg[0] === 'shifts' && seg.length === 2) {
    semearEpisodio();
    const s = PLANTOES.find((x) => x.id === seg[1])!;
    return {
      id: s.id, casaId: CASA.id, data: HOJE, turno: s.turno, status: s.status,
      abertoEm: s.abertoEm, fechadoEm: s.fechadoEm,
      // A ATA vem DENTRO do plantão, como no servidor.
      ata: (() => {
        const a = ataDo(s.id);
        return { id: a.id, status: a.status, versao: a.versao, conteudo: a.conteudo,
                 pendencias: a.pendencias,
                 assinaturasFaltantes: s.esperados.filter(
                   (e) => !s.passagens.some((p) => p.userId === e.userId)).length,
                 fechadaEm: a.fechadaEm };
      })(),
      passagens: s.passagens.map((p) => ({ ...p, propria: p.userId === eu.id })),
      assinaturasPendentes: s.esperados
        .filter((e) => !s.passagens.some((p) => p.userId === e.userId))
        .map((e) => ({ quem: e.quem, cargo: e.cargo })),
      minhaPassagemEsperada: s.esperados.some((e) => e.userId === eu.id)
        && !s.passagens.some((p) => p.userId === eu.id),
      recebimentos: s.recebimentos.map((r) => ({ ...r, propria: r.userId === eu.id })),
      episodios: EPISODIOS.filter((e) => e.ataId === ataDo(s.id).id).map((e) => ({
        id: e.id, acolhidoId: e.acolhidoId,
        acolhido: KIDS.find((k) => k.id === e.acolhidoId)?.nome ?? '—',
        classificacao: e.classificacao, relato: e.relato, quando: e.quando,
        ocorrenciaId: null, registradoPor: e.registradoPor,
        ciencias: e.ciencias.length,
        cienciaPropria: e.ciencias.some((k) => k.userId === eu.id),
        quemDeuCiencia: e.ciencias.map((k) => ({
          id: k.id, quem: k.quem, comentario: k.comentario, quando: k.quando })),
      })),
    };
  }

  // ---------- Episódio: registrar, e dar ciência ----------
  // Antes dos ramos `:id` do bloco de ATA, pela mesma razão do servidor: um
  // roteador que casa `ata/:id` primeiro engole `ata/:id/episodes`.
  if (seg[0] === 'shifts' && seg[1] === 'ata' && seg[3] === 'episodes' && metodo === 'POST') {
    const ata = ATAS.find((x) => x.id === seg[2]);
    if (!ata) return new Recusa(404, 'ATA não encontrada.');
    // A mesma frase do servidor, palavra por palavra: a demonstração não pode
    // ensinar uma recusa que a casa não vai ver.
    if (ata.status !== 'aberta' && ata.status !== 'reaberta') {
      return new Recusa(400,
        'Esta ATA está fechada e não recebe registro novo. O episódio pertence ao plantão que '
        + 'está aberto — registre nele, com o horário real do fato. Se o que precisa mudar é o '
        + 'texto desta ATA, o caminho é a reabertura, e ela deixa adendo.');
    }
    if (!CLASSIFICACOES_EPISODIO.some((c) => c.code === b.classificacao)) {
      return new Recusa(400, 'Classificação inválida para o episódio.');
    }
    if (String(b.relato ?? '').trim().length < 10) {
      return new Recusa(400,
        'Descreva o fato objetivamente: o que aconteceu, quando e o que foi feito.');
    }
    if (!KIDS.some((k) => k.id === b.acolhidoId)) {
      return new Recusa(400,
        'Este acolhido não está ativo nesta casa. O episódio pertence à casa onde ele está.');
    }
    EPISODIOS.push({
      id: uid(), ataId: ata.id, acolhidoId: String(b.acolhidoId),
      classificacao: String(b.classificacao), relato: String(b.relato).trim(),
      quando: b.happenedAt ? String(b.happenedAt) : new Date().toISOString(),
      registradoPor: eu.fullName, ciencias: [],
    });
    return { aviso: 'Registrado uma única vez: aparece no perfil do acolhido, na linha do tempo '
      + 'e nesta ATA. O relato original não pode ser alterado — o líder registra ciência e, se '
      + 'quiser, comentário próprio.' };
  }
  if (seg[0] === 'shifts' && seg[1] === 'episodes' && seg[3] === 'ack' && metodo === 'POST') {
    const ep = EPISODIOS.find((e) => e.id === seg[2]);
    if (!ep) return new Recusa(404, 'Episódio não encontrado.');
    if (ep.ciencias.some((k) => k.userId === eu.id)) {
      return new Recusa(400, 'Você já registrou ciência sobre este episódio.');
    }
    ep.ciencias.push({ id: uid(), quem: eu.fullName, userId: eu.id,
      comentario: b.comentario ? String(b.comentario) : null,
      quando: new Date().toISOString() });
    return { ok: true, aviso: 'Ciência registrada. O relato original permanece como foi escrito.' };
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
  /*
   * O ACERVO e as duas pontas do ciclo. Fica ANTES de `/people/:id`: palavra
   * fixa antes do curinga, como no servidor — `['people','archive']` tem dois
   * segmentos, exatamente como `['people', id]`.
   */
  if (rota === '/people/archive' && metodo === 'GET') {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'O acervo histórico é da equipe técnica e da coordenação.');
    }
    return {
      aviso: 'O perfil de quem saiu não é apagado — ele fica no acervo, com o histórico '
        + 'inteiro. Um retorno abre episódio NOVO no mesmo perfil, e nada do episódio '
        + 'anterior é reativado sozinho.',
      pessoas: ACERVO.map((a) => ({
        id: a.kid.id, nome: a.kid.nome, idade: a.kid.idade,
        saiuEm: a.saiuEm, motivoDaSaida: a.motivo, episodios: a.episodios,
      })),
    };
  }

  if (seg[0] === 'people' && seg[2] === 'discharge' && metodo === 'POST') {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Somente equipe técnica e coordenação registram saída.');
    }
    const k = kid(seg[1]);
    if (!k) return new Recusa(404, 'Acolhido não encontrado entre os ativos.');
    const motivo = String(b.motivo ?? '').trim();
    if (!motivo) return new Recusa(400, 'Informe o motivo da saída.');
    ACERVO.unshift({ kid: k, saiuEm: new Date().toISOString(), motivo, episodios: 1 });
    return { ok: true, acervo: true,
      aviso: `${k.nome} saiu da casa. O perfil foi para o acervo com o histórico inteiro.` };
  }

  if (seg[0] === 'people' && seg[2] === 'readmit' && metodo === 'POST') {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Somente equipe técnica e coordenação registram retorno.');
    }
    const i = ACERVO.findIndex((a) => a.kid.id === seg[1]);
    if (i < 0) return new Recusa(404, 'Perfil não encontrado no acervo.');
    const [saiu] = ACERVO.splice(i, 1);
    // Quem nasceu no acervo (a semeadura) precisa passar a existir na casa.
    if (!KIDS.some((k) => k.id === saiu.kid.id) && !NOVOS.some((k) => k.id === saiu.kid.id)) {
      NOVOS.push(saiu.kid);
    }
    return { personId: saiu.kid.id, episodio: saiu.episodios + 1,
      aviso: 'Revise medicamentos, alergias e restrições com a Enfermagem antes de reativá-los.' };
  }

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

  // ---- saúde: as rotas do SERVIDOR, com os formatos do servidor
  //
  // Este bloco falava `/health/*`, que não existe no backend. O protótipo
  // funcionava e o aplicativo teria falhado inteiro. Agora responde
  // `/nursing/*` e `/medications/*`, com os mesmos campos, os mesmos códigos
  // de estado e as mesmas recusas — é o que impede protótipo e aplicativo de
  // divergirem de novo.

  /** `GET /medications?houseId=&date=` — a grade do dia (mapDose no servidor). */
  if (rota === '/medications' && metodo === 'GET') {
    return DOSES.map((d) => ({
      id: d.id, horario: d.horario,
      acolhido: { id: d.personId, nome: kid(d.personId)?.nome ?? '—' },
      medicamento: d.medicamento, dose: d.dose, via: d.via,
      tipo: d.tipo, condicaoUso: d.condicaoUso,
      estado: d.estado, rotulo: d.rotulo, pendente: d.pendente,
      confirmadaPor: d.confirmadaPor, administradaEm: d.administradaEm,
      offline: false, observacao: d.observacao,
      // Ao lado de uma dose, "Dipirona" sozinha se lê como o que dar.
      alergias: kid(d.personId)?.alerta?.tipo === 'alergia'
        ? kid(d.personId)!.alerta!.descricao : null,
    }));
  }

  /** `POST /medications/doses/:id/confirm` — uma dose, uma confirmação (§11.2). */
  if (seg[0] === 'medications' && seg[1] === 'doses' && seg[3] === 'confirm' && metodo === 'POST') {
    const d = DOSES.find((x) => x.id === seg[2]);
    if (!d) return new Recusa(404, 'Dose não encontrada.');
    if (!d.pendente) {
      return new Recusa(409, 'Esta dose já foi confirmada por outro profissional.');
    }
    const estado = String(b.estado ?? '');
    if (!ESTADO_DOSE[estado] || estado === 'aguardando_confirmacao') {
      return new Recusa(400, 'Estado inválido para confirmação.');
    }
    if (EXIGEM_NOTA.has(estado) && !String(b.nota ?? '').trim()) {
      return new Recusa(400, `"${ESTADO_DOSE[estado]}" exige observação: descreva o fato de `
        + 'forma objetiva.');
    }
    d.pendente = false;
    d.estado = estado;
    d.rotulo = ESTADO_DOSE[estado];
    d.confirmadaPor = eu.fullName;
    d.administradaEm = new Date().toISOString();
    d.observacao = String(b.nota ?? '').trim() || null;
    return { ok: true, estado, rotulo: ESTADO_DOSE[estado] };
  }

  /**
   * `POST /medications/prescriptions` — nasce RASCUNHO (§11.1).
   *
   * A receita entregue numa consulta não altera a grade sozinha: alguém
   * confere e assume, com nome e horário. E "quando necessário" exige a
   * condição de uso escrita pelo profissional — o sistema não decide quando
   * dar.
   */
  if (rota === '/medications/prescriptions' && metodo === 'POST') {
    if (!['enfermagem', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Somente a Enfermagem cadastra e assina esquema de medicamentos.');
    }
    if (b.tipo === 'quando_necessario' && !String(b.condicaoUso ?? '').trim()) {
      return new Recusa(400, 'Medicamento "quando necessário" exige a condição de uso escrita '
        + 'pelo profissional.');
    }
    const id = uid();
    RASCUNHOS.set(id, { medicamento: String(b.medicamento ?? ''), dose: String(b.dose ?? ''),
      via: String(b.via ?? 'oral'), tipo: String(b.tipo ?? 'uso_continuo'),
      personId: String(b.personId ?? ''), horarios: (b.horarios as string[]) ?? [],
      condicaoUso: (b.condicaoUso as string) ?? null });
    return { id, status: 'rascunho',
      aviso: 'Prescrição registrada como rascunho. Só entra na grade após conferência e '
        + 'assinatura da Enfermagem.' };
  }

  /** `POST /medications/prescriptions/:id/sign` — é a assinatura que faz valer. */
  if (seg[0] === 'medications' && seg[1] === 'prescriptions' && seg[3] === 'sign' && metodo === 'POST') {
    const r = RASCUNHOS.get(seg[2]);
    if (!r) return new Recusa(404, 'Prescrição não encontrada ou já assinada.');
    RASCUNHOS.delete(seg[2]);
    // Assinada: as doses do dia entram na grade da casa.
    for (const h of (r.horarios.length ? r.horarios : ['08:00'])) {
      DOSES.push({ id: uid(), personId: r.personId,
        horario: emHoras(Number(h.split(':')[0]), Number(h.split(':')[1] ?? 0)),
        medicamento: r.medicamento, dose: r.dose, via: r.via, tipo: r.tipo,
        condicaoUso: r.condicaoUso,
        estado: 'aguardando_confirmacao', rotulo: 'Aguardando confirmação',
        pendente: true, confirmadaPor: null, administradaEm: null, observacao: null });
    }
    return { ok: true, status: 'ativa',
      aviso: `Esquema assinado por você. ${r.medicamento} entrou na grade da casa — a partir `
        + 'de agora existe dose para alguém confirmar, uma a uma.' };
  }

  /** `GET /medications/stock?houseId=` — o armário, sem mínimo calculado. */
  if (rota === '/medications/stock' && metodo === 'GET') {
    const hoje = new Date(`${HOJE}T12:00:00-03:00`).getTime();
    return ESTOQUE.map((i) => {
      const dias = i.validade
        ? Math.ceil((new Date(`${i.validade}T12:00:00-03:00`).getTime() - hoje) / 86_400_000) : null;
      return {
        id: i.id, medicamento: i.medicamento, quantidade: i.quantidade, unidade: i.unidade,
        individual: i.personId != null,
        acolhido: i.personId ? (kid(i.personId)?.nome ?? '(fora do seu alcance)') : null,
        validade: i.validade, diasParaVencer: dias,
        validadeProxima: dias !== null && dias <= 30,
        estoqueBaixo: i.estoqueBaixo, atualizadoEm: i.atualizadoEm,
      };
    });
  }

  /**
   * `POST /medications/stock` — as DUAS ações (§8.4).
   *
   * `entrada` soma o que chegou; `contagem` substitui pelo que foi conferido,
   * exige motivo e grava a diferença. O protótipo recusa nos mesmos pontos em
   * que o banco recusa: é o que faz a demonstração valer como conversa com a
   * equipe, e não como propaganda.
   */
  if (rota === '/medications/stock' && metodo === 'POST') {
    if (!['enfermagem', 'equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Sem permissão para movimentar estoque.');
    }
    const tipo = String(b.tipo ?? '');
    if (tipo !== 'entrada' && tipo !== 'contagem') {
      return new Recusa(400, 'Informe tipo: "entrada" (chegou remédio, soma) ou "contagem" '
        + '(conferência do armário, substitui).');
    }
    const q = Number(b.quantidade);
    if (!Number.isFinite(q) || q < 0) return new Recusa(400, 'Quantidade inválida.');
    if (tipo === 'entrada' && q === 0) return new Recusa(400, 'Entrada de zero não é entrada.');
    const motivo = String(b.motivo ?? '').trim();
    if (tipo === 'contagem' && motivo.length < 3) {
      return new Recusa(400, 'A contagem exige motivo: o que foi conferido, e por quê.');
    }
    const nome = String(b.medicamento ?? '');
    const pid = (b.personId as string | undefined) ?? null;
    let item = ESTOQUE.find((x) => x.medicamento === nome && x.personId === pid);
    if (!item) {
      item = { id: uid(), medicamento: nome, quantidade: 0, unidade: String(b.unidade ?? 'unidade'),
               personId: pid, validade: (b.validade as string | undefined) ?? null,
               estoqueBaixo: false, atualizadoEm: new Date().toISOString() };
      ESTOQUE.push(item);
    }
    const anterior = item.quantidade;
    item.quantidade = tipo === 'entrada' ? anterior + q : q;
    // Validade: na entrada fica a MAIS PRÓXIMA; na contagem, o que foi conferido.
    const nova = (b.validade as string | undefined) ?? null;
    if (nova) {
      item.validade = tipo === 'entrada' && item.validade
        ? (item.validade < nova ? item.validade : nova) : nova;
    }
    item.atualizadoEm = new Date().toISOString();
    const diferenca = tipo === 'entrada' ? q : item.quantidade - anterior;
    return {
      id: item.id, ok: true, tipo, anterior, quantidade: item.quantidade, diferenca,
      aviso: tipo === 'entrada'
        ? `Entrada registrada: ${anterior} + ${q} = ${item.quantidade} ${item.unidade}(s).`
        : `Contagem registrada: de ${anterior} para ${item.quantidade} ${item.unidade}(s). `
          + 'A diferença ficou no histórico, com o motivo e o seu nome.',
    };
  }

  /** `POST /medications/stock/:id/flag-low` — estoque baixo é sinalizado à mão (§11.6). */
  if (seg[0] === 'medications' && seg[1] === 'stock' && seg[3] === 'flag-low' && metodo === 'POST') {
    const item = ESTOQUE.find((x) => x.id === seg[2]);
    if (!item) return new Recusa(404, 'Não encontrado.');
    if (!['enfermagem', 'equipe_tecnica', 'coordenador'].includes(eu.role)) {
      return new Recusa(403, 'Somente Enfermagem ou equipe técnica sinalizam estoque baixo.');
    }
    item.estoqueBaixo = b.baixo !== false;
    return { ok: true, estoqueBaixo: item.estoqueBaixo };
  }

  /** `GET /nursing/panel?houseId=&date=` — todos os acolhidos, inclusive sem medicação. */
  if (rota === '/nursing/panel' && metodo === 'GET') {
    const data = String(q.get('date') ?? HOJE);
    const acolhidos = todosKids().map((k) => {
      const doses = DOSES.filter((d) => d.personId === k.id);
      const pendentes = doses.filter((d) => d.pendente);
      const triagens = TRIAGENS.filter((t) => t.personId === k.id && !t.assinada);
      return {
        acolhidoId: k.id, nome: k.nome, nomeCivil: k.civil, idade: k.idade,
        // Dois formatos, de propósito, como no servidor: o PAINEL devolve a
        // descrição crua ("Amendoim e derivados") e a tela põe o rótulo; a
        // GRADE devolve já rotulada, porque ao lado de uma dose o nome sozinho
        // se lê como o que dar. Aqui os dados nascem rotulados, então o painel
        // tira o prefixo — era o que produzia "Alergia a Alergia a Amendoim".
        alergias: k.alerta?.tipo === 'alergia'
          ? k.alerta.descricao.replace(/^Alergia a /, '') : null,
        restricoes: k.restricao?.restriction ?? null,
        condicoes: k.alerta && k.alerta.tipo === 'condicao' ? k.alerta.descricao : null,
        dosesPrevistas: doses.length,
        proximaDose: pendentes[0]?.horario ?? null,
        ultimaDose: doses.find((d) => !d.pendente)?.administradaEm ?? null,
        dosesPendentes: pendentes.length,
        evolucoesAguardandoTriagem: triagens.length,
        internacaoEmAndamento: false,
        retornoPendente: null,
        receitaVencendo: null,
        semMedicacaoPrevista: doses.length === 0,
      };
    });
    return {
      data,
      hoje: HOJE,
      receitaVencendoAncoradaEm: HOJE,
      revendoOutroDia: data !== HOJE,
      total: acolhidos.length,
      resumo: {
        comMedicacao: acolhidos.filter((a) => !a.semMedicacaoPrevista).length,
        semMedicacao: acolhidos.filter((a) => a.semMedicacaoPrevista).length,
        dosesPendentes: acolhidos.reduce((n, a) => n + a.dosesPendentes, 0),
        triagensPendentes: TRIAGENS.filter((t) => !t.assinada).length,
        internacoes: 0,
      },
      acolhidos,
      aviso: 'Indicadores operacionais. Não constituem diagnóstico nem prioridade clínica automática.',
    };
  }

  /** `GET /nursing/triage?houseId=` — a fila do que ainda não foi assinado. */
  if (rota === '/nursing/triage' && metodo === 'GET') {
    return TRIAGENS.filter((t) => !t.assinada).map((t) => {
      const horas = Math.floor((Date.now() - new Date(t.enviadaEm).getTime()) / 3_600_000);
      return {
        id: t.id, acolhidoId: t.personId, acolhido: kid(t.personId)?.nome ?? '—',
        casa: 'AI3 · Casa 03', tipo: t.tipo, quando: t.enviadaEm,
        local: null, especialidade: null, acompanhante: t.enviadaPor,
        estadoRetorno: t.resumo, receita: t.receita ?? null,
        orientacoes: t.orientacoes ?? null, restricoes: null,
        prazoRetorno: null, offline: false,
        status: t.pedidoComplemento ? 'complemento_solicitado' : 'aguardando_triagem',
        pedidoComplemento: t.pedidoComplemento,
        horasNaFila: horas,
        // Prazo é acompanhamento, não punição.
        foraDoPrazo: horas > 24,
      };
    });
  }

  /**
   * `POST /nursing/evolutions` — quem acompanhou relata; a Enfermagem tria.
   *
   * A fila de triagem existia e não era alimentada por tela nenhuma: a criança
   * ia ao médico e o sistema não ficava sabendo.
   */
  if (rota === '/nursing/evolutions' && metodo === 'POST') {
    if (!String(b.quandoAconteceu ?? '')) {
      return new Recusa(400, 'Informe o horário real do atendimento.');
    }
    if (String(b.estadoRetorno ?? '').trim().length < 5) {
      return new Recusa(400, 'Descreva o estado observado no retorno.');
    }
    const k = kid(String(b.personId ?? ''));
    const TIPO: Record<string, string> = {
      consulta: 'Consulta', exame: 'Exame', urgencia: 'Urgência ou emergência',
      internacao: 'Internação', retorno: 'Retorno', vacina: 'Vacina',
    };
    TRIAGENS = [{
      id: uid(), personId: String(b.personId ?? ''),
      tipo: `${TIPO[String(b.tipo)] ?? 'Atendimento'}${b.especialidade ? ` de ${b.especialidade}` : ''}`,
      enviadaPor: eu.fullName, enviadaEm: String(b.quandoAconteceu),
      resumo: String(b.estadoRetorno),
      receita: (b.receita as string) ?? null,
      orientacoes: (b.orientacoes as string) ?? null,
      assinada: false, assinadaPor: null, complemento: null, pedidoComplemento: null,
    }, ...TRIAGENS];
    AVISOS.unshift({ id: uid(), titulo: 'Evolução de Saúde aguardando triagem',
      texto: `Atendimento de ${k?.nome ?? 'acolhido'} registrado por ${eu.fullName}.`,
      prioridade: 'normal', entidade: 'health_evolution', entidadeId: 't0',
      lida: false, ciente: false, em: new Date().toISOString() });
    return { ok: true,
      aviso: 'Evolução registrada e enviada para a triagem da Enfermagem. Receita nova só '
        + 'altera a grade de medicamentos depois que a Enfermagem conferir e assinar.' };
  }

  /** `POST /nursing/evolutions/:id/triage` — assinar, ou devolver pedindo complemento. */
  if (seg[0] === 'nursing' && seg[1] === 'evolutions' && seg[3] === 'triage' && metodo === 'POST') {
    const t = TRIAGENS.find((x) => x.id === seg[2]);
    if (!t) return new Recusa(404, 'Evolução não encontrada.');
    if (!['enfermagem', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Somente a Enfermagem tria e assina Evoluções de Saúde. '
        + 'A coordenação acompanha e cobra a pendência.');
    }
    if (t.assinada) return new Recusa(400, 'Esta evolução já foi triada e assinada.');
    if (b.acao === 'pedir_complemento') {
      if (!String(b.pedido ?? '').trim()) {
        return new Recusa(400, 'Descreva o que falta para o acompanhante complementar.');
      }
      t.pedidoComplemento = String(b.pedido);
      return { ok: true, status: 'complemento_solicitado',
               aviso: 'Devolvida ao acompanhante com o pedido registrado.' };
    }
    t.assinada = true; t.assinadaPor = eu.fullName;
    t.complemento = String(b.complemento ?? '').trim() || null;
    return { ok: true, status: 'assinada',
             aviso: 'Evolução conferida e assinada. Agora a grade de medicamentos pode ser '
               + 'atualizada, se for o caso.' };
  }

  /** `POST /nursing/summary/:personId` — emissão com finalidade registrada (§7.4). */
  if (seg[0] === 'nursing' && seg[1] === 'summary' && seg.length === 3 && metodo === 'POST') {
    if (!['enfermagem', 'equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Seu cargo não emite Resumo de Saúde.');
    }
    if (!FINALIDADES_RESUMO.includes(String(b.finalidade ?? ''))) {
      return new Recusa(400, `Informe a finalidade da emissão: ${FINALIDADES_RESUMO.join(', ')}.`);
    }
    RESUMOS.push({ id: uid(), personId: seg[2], finalidade: String(b.finalidade),
      por: eu.fullName, em: new Date().toISOString() });
    return { ok: true, aviso: 'Resumo de Saúde gerado com o mínimo necessário: identificação, '
      + 'alergias, restrições, condições relevantes, medicamentos ativos e atendimentos '
      + 'recentes. Sem dados bancários, conteúdo judicial nem narrativas. A finalidade e o '
      + 'download ficaram registrados com o seu nome.' };
  }

  // ---- ocorrências: as rotas do servidor (§13)
  //
  // Chamava /incidents/categories, /:id/note, /:id/close e /:id/reopen. O
  // catálogo é /incidents/catalog; a nota é uma SÍNTESE; fechar e reabrir são
  // a MESMA rota de revisão, com decisões opostas. E /categories casava com
  // GET /incidents/:id: o servidor leria "categories" como um id.

  /* Abrir anexo: palavra fixa antes de `/incidents/:id`. */
  if (seg[0] === 'incidents' && seg[1] === 'attachments' && seg[3] === 'open'
      && metodo === 'POST') {
    const a = ANEXOS.find((x) => x.id === seg[2]);
    if (!a) return new Recusa(404, 'Anexo não encontrado.');
    if (a.restrito && !['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Anexo restrito. Você pode ver que ele existe; abri-lo cabe à '
        + 'equipe técnica e à coordenação.');
    }
    if (a.restrito && String(b.finalidade ?? '').trim().length < 15) {
      return new Recusa(400, 'Descreva a finalidade da abertura (mínimo 15 caracteres).');
    }
    return { referencia: a.referencia, tipo: a.tipo, nome: a.nome,
             aviso: 'Abertura registrada em auditoria.' };
  }

  if (seg[0] === 'incidents' && seg[2] === 'attachments' && metodo === 'POST') {
    const o = OCORRENCIAS.find((x) => x.id === seg[1]);
    if (!o) return new Recusa(404, 'Ocorrência não encontrada.');
    const tipo = TIPOS_ANEXO.find((t) => t.cod === String(b.tipo ?? ''));
    if (!tipo) {
      return new Recusa(400,
        'Escolha o tipo do anexo: ' + TIPOS_ANEXO.map((t) => t.label).join('; ') + '.');
    }
    const nome = String(b.nome ?? '').trim();
    if (!nome) return new Recusa(400, 'Informe um nome de exibição para o anexo.');
    // §3.3 — a mesma recusa do servidor, pelas mesmas expressões.
    if (/\d{11}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(nome)
        || /\b(hiv|aids|soropositiv|cid[\s-]?\d|autis|esquizo|depress|transtorn|psiquiatr)/i.test(nome)) {
      return new Recusa(400, 'O nome do arquivo não pode conter CPF, diagnóstico ou '
        + 'referência judicial. Use um nome neutro; o conteúdo fica protegido dentro do anexo.');
    }
    if (!String(b.referencia ?? '').trim()) {
      return new Recusa(400, 'Informe onde o arquivo está — a pasta ou o link no Drive da '
        + 'instituição. O sistema guarda a referência, não o arquivo.');
    }
    if (tipo.exigeJustificativa && String(b.justificativa ?? '').trim().length < 15) {
      return new Recusa(400,
        'Foto exige justificativa: para que ela é necessária e qual autorização a ampara.');
    }
    ANEXOS = [...ANEXOS, {
      id: uid(), ocorrenciaId: o.id, tipo: tipo.cod, nome,
      referencia: String(b.referencia).trim(),
      restrito: b.restrito ?? tipo.restritoPorPadrao, autor: eu.fullName,
    }];
    return { id: ANEXOS[ANEXOS.length - 1].id,
      aviso: 'Anexo registrado. Fotos não aparecem na linha do tempo.' };
  }

  /* Contenção (§13.3): cinco campos obrigatórios, e nenhuma avaliação. */
  if (seg[0] === 'incidents' && seg[2] === 'restraint' && metodo === 'POST') {
    const o = OCORRENCIAS.find((x) => x.id === seg[1]);
    if (!o) return new Recusa(404, 'Ocorrência não encontrada.');
    if (CONTENCOES[o.id]) {
      return new Recusa(400, 'Esta contenção já foi registrada e não é reescrita.');
    }
    const obrigatorios: [string, string][] = [
      ['antecedentes', 'fatos antecedentes'], ['local', 'local'],
      ['presentes', 'pessoas presentes'], ['tentativasAnteriores', 'tentativas anteriores'],
      ['metodo', 'método utilizado'],
    ];
    const faltando = obrigatorios.filter(([k]) => !String(b[k] ?? '').trim());
    if (faltando.length) {
      return new Recusa(400,
        'Registro de contenção exige: ' + faltando.map(([, l]) => l).join(', ') + '.');
    }
    CONTENCOES[o.id] = { ...b, registradoPor: eu.fullName, em: new Date().toISOString() };
    return { ok: true,
      aviso: 'Registrado. O sistema não avalia se a medida foi adequada — a análise é da '
        + 'equipe técnica.' };
  }

  /*
   * As rotas da comunicação externa. Ficam ANTES de `/incidents/:id`:
   * `['incidents','communications']` tem o mesmo tamanho de
   * `['incidents', id]` — palavra fixa primeiro, como no servidor.
   */
  if (rota === '/incidents/communications' && metodo === 'GET') {
    return COMUNICACOES.map((c) => ({ ...c }));
  }

  if (rota === '/incidents/communications' && metodo === 'POST') {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403,
        'A comunicação externa é registrada pela equipe técnica ou pela coordenação.');
    }
    if (!ORGAOS_EXTERNOS.some((o) => o.cod === String(b.orgao ?? ''))) {
      return new Recusa(400, 'Órgão inválido.');
    }
    if (!CANAIS_EXTERNOS.some((c) => c.cod === String(b.canal ?? ''))) {
      return new Recusa(400, 'Canal inválido.');
    }
    if (String(b.resumo ?? '').trim().length < 20) {
      return new Recusa(400, 'Descreva o teor da comunicação (mínimo 20 caracteres).');
    }
    if (!String(b.destinatarioFuncional ?? '').trim()) {
      return new Recusa(400,
        'Informe o destinatário funcional (o cargo ou setor), não o nome de uma pessoa.');
    }
    const nova: ComunicacaoMock = {
      id: uid(), orgao: String(b.orgao), canal: String(b.canal),
      destinatarioFuncional: String(b.destinatarioFuncional).trim(),
      status: 'rascunho', resumo: String(b.resumo).trim(),
      quando: String(b.quando ?? new Date().toISOString()),
      aprovadaEm: null, entregueEm: null,
      ocorrenciaId: b.incidentId ? String(b.incidentId) : null,
      responsavel: eu.fullName, autorId: eu.id,
    };
    COMUNICACOES = [nova, ...COMUNICACOES];
    return { id: nova.id, status: 'rascunho',
      aviso: 'Registrada como rascunho. O sistema NÃO envia nada para fora: depois de revisada '
        + 'e aprovada, a entrega é feita por uma pessoa e registrada aqui.' };
  }

  if (seg[0] === 'incidents' && seg[1] === 'communications' && seg[3] === 'submit') {
    const c = COMUNICACOES.find((x) => x.id === seg[2]);
    if (!c) return new Recusa(404, 'Comunicação não encontrada.');
    if (c.status !== 'rascunho') {
      return new Recusa(400, 'Transição não permitida a partir do estado atual.');
    }
    c.status = 'em_revisao';
    return { status: 'em_revisao', aviso: 'Enviada para revisão interna.' };
  }

  if (seg[0] === 'incidents' && seg[1] === 'communications' && seg[3] === 'approve') {
    const c = COMUNICACOES.find((x) => x.id === seg[2]);
    if (!c) return new Recusa(404, 'Comunicação não encontrada.');
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403,
        'A aprovação cabe à equipe técnica, à coordenação ou ao Gestor Geral.');
    }
    // Padrão protetivo: quem redigiu não aprova. Uma comunicação ao Conselho
    // Tutelar aprovada pelo próprio autor não passou por revisão nenhuma.
    if (c.autorId === eu.id) {
      return new Recusa(400, 'Quem redigiu a comunicação não pode aprová-la. A aprovação é de '
        + 'outra pessoa da equipe técnica, da coordenação ou do Gestor Geral.');
    }
    if (!['rascunho', 'em_revisao'].includes(c.status)) {
      return new Recusa(400, 'Só se aprova comunicação em rascunho ou em revisão.');
    }
    c.status = 'aprovado'; c.aprovadaEm = new Date().toISOString();
    return { status: 'aprovado',
      aviso: 'Aprovada. O documento pode ser gerado e entregue por uma pessoa — o sistema não '
        + 'realiza o envio.' };
  }

  if (seg[0] === 'incidents' && seg[1] === 'communications' && seg[3] === 'delivery') {
    const c = COMUNICACOES.find((x) => x.id === seg[2]);
    if (!c) return new Recusa(404, 'Comunicação não encontrada.');
    if (c.status !== 'aprovado') {
      return new Recusa(400, 'A entrega só é registrada depois da aprovação.');
    }
    c.status = 'entregue_manualmente';
    c.entregueEm = String(b.quando ?? new Date().toISOString());
    return { status: 'entregue_manualmente',
      aviso: 'Entrega registrada, com responsável e horário.' };
  }

  if (rota === '/incidents/catalog') {
    return {
      categorias: CATEGORIAS_OCORRENCIA.map((c) => ({
        code: c.cod, label: c.label, revisaoTecnica: c.exigeRevisao, restrito: c.restrita,
      })),
      orgaos: ORGAOS_EXTERNOS, canais: CANAIS_EXTERNOS, tiposAnexo: TIPOS_ANEXO,
      avisoAnexo: 'O sistema não guarda o arquivo: guarda a REFERÊNCIA dele no Drive da '
        + 'instituição, o nome neutro e quem pode abrir. Nome de arquivo nunca leva CPF, '
        + 'diagnóstico nem conteúdo judicial (§3.3), e abrir um anexo restrito exige dizer '
        + 'para quê — a abertura fica registrada com o seu nome.',
      aviso: 'O registro nunca deve atrasar proteção imediata, atendimento de saúde ou o '
        + 'protocolo institucional. Abra a ocorrência com o mínimo e complete depois.',
      avisoComunicacao: 'O sistema NÃO envia nada para fora. Ele registra o que foi redigido, '
        + 'quem revisou, quem aprovou e quem entregou — a entrega é sempre de uma pessoa.',
    };
  }

  /** Lista MAGRA, como a do servidor: nada de fato, medidas ou fala espontânea. */
  if (rota === '/incidents' && metodo === 'GET') {
    return OCORRENCIAS.map((o) => {
      const cat = CATEGORIAS_OCORRENCIA.find((c) => c.cod === o.categoria)!;
      return {
        id: o.id, categoria: cat.label, codigoCategoria: cat.cod,
        quando: o.abertaEm, status: o.status,
        nivelAcesso: cat.restrita ? 'restrito' : 'equipe',
        revisaoTecnicaObrigatoria: cat.exigeRevisao,
        prazo: null, abertaPor: o.abertaPor,
        acolhidos: o.personId ? 1 : 0,
        anexos: ANEXOS.filter((a) => a.ocorrenciaId === o.id).length,
      };
    });
  }

  /** Detalhe: é AQUI que a política decide o que devolver. */
  if (seg[0] === 'incidents' && seg.length === 2 && metodo === 'GET') {
    const o = OCORRENCIAS.find((x) => x.id === seg[1]);
    if (!o) return new Recusa(404, 'Ocorrência não encontrada — ou fora do seu alcance.');
    const cat = CATEGORIAS_OCORRENCIA.find((c) => c.cod === o.categoria)!;
    const tecnica = ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role);
    // Conteúdo protegido não é escondido na tela: NÃO É DEVOLVIDO.
    const podeProtegido = tecnica || o.abertaPor === eu.fullName;
    return {
      id: o.id, casaId: 'AI3', categoria: cat.label, codigoCategoria: cat.cod,
      quando: o.abertaEm, atividade: null,
      fato: o.fato, presentes: null, medidasImediatas: o.medidas,
      saude: /saude|medicamento/.test(cat.cod), medicamento: cat.cod === 'erro_medicamento',
      contatos: null, pendencias: null, prazo: null,
      status: o.status, nivelAcesso: cat.restrita ? 'restrito' : 'equipe',
      revisaoTecnicaObrigatoria: cat.exigeRevisao,
      acolhidos: o.personId
        ? [{ id: o.personId, nome: kid(o.personId)?.nome ?? '(fora do seu alcance)', visivel: true }]
        : [],
      protegido: podeProtegido && o.falaEspontanea
        ? { falaEspontanea: o.falaEspontanea, sinaisObservados: null, registradoEm: o.abertaEm }
        : null,
      avisoProtegido: podeProtegido ? null
        : 'Fala espontânea e sinais observados, quando existem, são acessíveis à equipe '
          + 'técnica e à coordenação.',
      contencao: CONTENCOES[o.id] ?? null,
      sinteses: tecnica ? o.sinteses : [],
      relatos: relatosDe('incident', o.id),
      avisoAnaliseTecnica: tecnica ? null
        : 'Sínteses técnicas e comunicações externas, quando existem, são acessíveis à '
          + 'equipe técnica e à coordenação.',
      anexos: ANEXOS.filter((a) => a.ocorrenciaId === o.id).map((a) => ({
        id: a.id, tipo: a.tipo, nome: a.nome, restrito: a.restrito, autor: a.autor,
      })),
      comunicacoesExternas: COMUNICACOES
        .filter((c) => c.ocorrenciaId === o.id)
        .map((c) => ({ id: c.id, orgao: c.orgao, canal: c.canal, status: c.status })),
    };
  }

  if (rota === '/incidents' && metodo === 'POST') {
    const cat = CATEGORIAS_OCORRENCIA.find((c) => c.cod === b.categoria);
    if (!cat) return new Recusa(400, 'Categoria inválida.');
    if (String(b.fato ?? '').trim().length < 15) {
      return new Recusa(400, 'Descreva o fato objetivamente: o que aconteceu, onde e quando. '
        + 'Sem interpretação e sem juízo sobre a pessoa.');
    }
    if (!b.quando) return new Recusa(400, 'Informe a data e a hora do fato.');
    const avisados = ['Líder Diurno', 'equipe técnica', 'coordenação']
      .concat(/saude|medicamento/.test(String(b.categoria)) ? ['Enfermagem'] : []);
    const acolhidos: string[] = Array.isArray(b.acolhidos) ? b.acolhidos : [];
    const nova: Ocorrencia = {
      id: uid(), categoria: cat.cod, personId: acolhidos[0] ?? null,
      fato: String(b.fato), medidas: String(b.medidasImediatas ?? ''),
      falaEspontanea: cat.restrita ? (String(b.falaEspontanea ?? '').trim() || null) : null,
      abertaPor: eu.fullName, abertaEm: String(b.quando),
      status: 'aberta', avisados, sinteses: [],
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

  /** Síntese: registro NOVO, ao lado. Nunca reescreve relato nenhum. */
  if (seg[0] === 'incidents' && seg[2] === 'synthesis' && metodo === 'POST') {
    const o = OCORRENCIAS.find((x) => x.id === seg[1]);
    if (!o) return new Recusa(404, 'Não encontrado.');
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'A síntese cabe à equipe técnica e à coordenação.');
    }
    if (String(b.texto ?? '').trim().length < 20) {
      return new Recusa(400, 'A síntese precisa de conteúdo (mínimo 20 caracteres).');
    }
    o.sinteses = [...o.sinteses, { id: uid(), autor: eu.fullName,
      texto: String(b.texto), quando: new Date().toISOString() }];
    return { ok: true, aviso: 'Síntese gravada. Nenhum relato original foi alterado ou apagado.' };
  }

  if (seg[0] === 'incidents' && seg[2] === 'operational-close' && metodo === 'POST') {
    const o = OCORRENCIAS.find((x) => x.id === seg[1]);
    if (!o) return new Recusa(404, 'Ocorrência não encontrada.');
    if (o.status === 'fechada') return new Recusa(400, 'Esta ocorrência já está fechada.');
    if (['encerrada_operacional', 'aguardando_revisao_tecnica'].includes(o.status)) {
      return new Recusa(400, 'A etapa operacional desta ocorrência já foi encerrada.');
    }
    if (!['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica', 'coordenador', 'gestor_geral']
        .includes(eu.role)) {
      return new Recusa(403, 'O encerramento da etapa operacional cabe ao líder responsável, '
        + 'à equipe técnica ou à coordenação.');
    }
    const cat = CATEGORIAS_OCORRENCIA.find((c) => c.cod === o.categoria)!;
    o.status = cat.exigeRevisao ? 'aguardando_revisao_tecnica' : 'encerrada_operacional';
    return { status: o.status,
      aviso: cat.exigeRevisao
        ? 'Etapa operacional encerrada. A ocorrência permanece AGUARDANDO REVISÃO TÉCNICA — '
          + 'ela não está fechada.'
        : 'Etapa operacional encerrada.' };
  }

  /** Fechar e reabrir: a MESMA rota, decisões opostas — como no servidor. */
  if (seg[0] === 'incidents' && seg[2] === 'review' && metodo === 'POST') {
    const o = OCORRENCIAS.find((x) => x.id === seg[1]);
    if (!o) return new Recusa(404, 'Ocorrência não encontrada.');
    const decisao = String(b.decisao ?? '');
    if (!['validar', 'reabrir'].includes(decisao)) {
      return new Recusa(400, 'Decisão deve ser "validar" ou "reabrir".');
    }
    if (!['equipe_tecnica', 'coordenador'].includes(eu.role)) {
      return new Recusa(403, 'A validação técnica cabe à equipe técnica e à coordenação.');
    }
    if (decisao === 'reabrir') {
      if (!['fechada', 'encerrada_operacional', 'aguardando_revisao_tecnica'].includes(o.status)) {
        return new Recusa(400, 'Só se reabre uma ocorrência encerrada ou fechada.');
      }
      o.status = 'reaberta';
      return { status: 'reaberta', aviso: 'Reaberta, com histórico preservado.' };
    }
    if (o.status === 'fechada') return new Recusa(400, 'Esta ocorrência já está fechada.');
    if (!['aguardando_revisao_tecnica', 'encerrada_operacional'].includes(o.status)) {
      return new Recusa(400, 'A revisão técnica vem depois do encerramento da etapa '
        + 'operacional. O líder responsável precisa encerrá-la primeiro.');
    }
    const cat = CATEGORIAS_OCORRENCIA.find((c) => c.cod === o.categoria)!;
    const grave = /saude|medicamento/.test(cat.cod)
      || ['contencao', 'violencia_ou_suspeita'].includes(cat.cod);
    if (grave && o.sinteses.length === 0) {
      return new Recusa(400, 'Registre a síntese técnica antes de fechar. Em caso de saúde, '
        + 'medicamento, contenção ou violência, o fechamento precisa dizer a que se chegou.');
    }
    o.status = 'fechada';
    enfileirarCopia('ocorrencia', 'incident', o.id);
    return { status: 'fechada',
      aviso: 'Fechada após validação técnica. O histórico permanece consultável e pode ser reaberto.' };
  }

  // ---- ATA: as rotas do servidor (§12)
  //
  // A tela chamava /minutes, /minutes/house/close e /minutes/general/close.
  // Não existe módulo `minutes`: a ATA da casa vive dentro do plantão
  // (/shifts/:id, fechada em /shifts/ata/:ataId/close) e a Geral tem rotas
  // próprias em /shifts/general-ata/*.

  /* PATCH /shifts/ata/:id — escrever o corpo do livro enquanto ela está aberta. */
  if (seg[0] === 'shifts' && seg[1] === 'ata' && seg.length === 3 && metodo === 'PATCH') {
    const a = ATAS.find((x) => x.id === seg[2]);
    if (!a) return new Recusa(404, 'ATA não encontrada.');
    if (a.status === 'fechada') {
      return new Recusa(400, 'ATA fechada não é reescrita. Peça reabertura à equipe técnica — '
        + 'a correção entra como adendo, com antes e depois.');
    }
    a.conteudo = { ...(b.conteudo ?? {}) };
    return { ok: true };
  }

  /* Reabrir: grava o estado ANTERIOR no adendo, antes de qualquer alteração. */
  if (seg[0] === 'shifts' && seg[1] === 'ata' && seg[3] === 'reopen' && metodo === 'POST') {
    const a = ATAS.find((x) => x.id === seg[2]);
    if (!a) return new Recusa(404, 'ATA não encontrada.');
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'A reabertura de ATA cabe à equipe técnica e à coordenação.');
    }
    if (a.status !== 'fechada') return new Recusa(400, 'Esta ATA não está fechada.');
    const motivo = String(b.motivo ?? '').trim();
    if (motivo.length < 15) {
      return new Recusa(400,
        'Descreva o motivo da reabertura (mínimo 15 caracteres). Ele fica gravado no adendo.');
    }
    a.adendos.push({ id: uid(), tipo: 'reabertura', motivo, autor: eu.fullName,
                     quando: new Date().toISOString(),
                     antes: { status: a.status, versao: a.versao, conteudo: { ...a.conteudo } },
                     depois: null });
    a.status = 'reaberta';
    a.versao += 1;
    return { versao: a.versao,
      aviso: 'Reaberta. O estado anterior foi gravado no adendo antes de qualquer alteração.' };
  }

  /* Corrigir: grava o antes e o depois. */
  if (seg[0] === 'shifts' && seg[1] === 'ata' && seg[3] === 'amend' && metodo === 'POST') {
    const a = ATAS.find((x) => x.id === seg[2]);
    if (!a) return new Recusa(404, 'ATA não encontrada.');
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'A correção de ATA cabe à equipe técnica e à coordenação.');
    }
    if (a.status !== 'reaberta') {
      return new Recusa(400,
        'Corrija apenas depois de reabrir: a reabertura é o que grava o estado anterior.');
    }
    const motivo = String(b.motivo ?? '').trim();
    if (motivo.length < 15) return new Recusa(400, 'Descreva o motivo da correção (mínimo 15 caracteres).');
    const antes = { ...a.conteudo };
    a.conteudo = { ...(b.conteudo ?? a.conteudo) };
    a.adendos.push({ id: uid(), tipo: 'correcao', motivo, autor: eu.fullName,
                     quando: new Date().toISOString(),
                     antes: { conteudo: antes }, depois: { conteudo: { ...a.conteudo } } });
    a.status = 'fechada';
    a.versao += 1;
    return { versao: a.versao, status: 'fechada',
      aviso: 'Correção gravada com antes e depois. A versão anterior continua consultável.' };
  }

  if (seg[0] === 'shifts' && seg[1] === 'ata' && seg[3] === 'addenda' && metodo === 'GET') {
    const a = ATAS.find((x) => x.id === seg[2]);
    return a ? a.adendos : [];
  }

  if (seg[0] === 'shifts' && seg[1] === 'ata' && seg[3] === 'close' && metodo === 'POST') {
    const a = ATAS.find((x) => x.id === seg[2]);
    if (!a) return new Recusa(404, 'ATA não encontrada.');
    if (a.status === 'fechada') {
      return new Recusa(400, 'Esta ATA já foi fechada. O que vier depois entra como adendo, '
        + 'ao lado — registro fechado não é reescrito.');
    }
    if (!['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica', 'coordenador', 'gestor_geral']
        .includes(eu.role)) {
      return new Recusa(403, 'O fechamento da ATA cabe ao líder do turno, à equipe técnica '
        + 'ou à coordenação.');
    }
    const plantao = PLANTOES.find((x) => x.id === a.plantaoId)!;
    const faltam = plantao.esperados.filter(
      (e) => !plantao.passagens.some((p) => p.userId === e.userId));
    const pendencias = String(b.pendencias ?? '').trim();
    if (faltam.length && !pendencias) {
      return new Recusa(400, `Falta a passagem de ${faltam.map((f) => f.quem).join(', ')}. `
        + 'O sistema não assina no lugar de ninguém: feche com pendência, dizendo o que faltou.');
    }
    a.status = 'fechada';
    a.pendencias = pendencias || null;
    a.fechadaEm = new Date().toISOString();
    // Fechou, entra na fila do arquivo — a mesma coisa que o servidor faz por
    // evento. O aviso abaixo prometia isso desde sempre; agora é verdade.
    enfileirarCopia('ata', 'ata', a.id);
    ARQUIVO = [{ id: uid(), categoria: 'ATA', caminho: `ACOLHIMENTO/${CASA.code}/2026/08/ata`,
      arquivo: `ata_${HOJE}_${uid()}_V${a.versao}.pdf`, estado: 'aguardando', restrito: false,
      tentativas: 0, erro: null, fechadoEm: new Date().toISOString() }, ...ARQUIVO];
    return { status: 'fechada', assinaturasFaltantes: faltam.length,
      aviso: pendencias
        ? 'ATA fechada COM PENDÊNCIA, com a sua assinatura e o motivo escrito. Nenhuma '
          + 'assinatura foi criada em nome de terceiros. Equipe técnica e coordenação avisadas.'
        : 'ATA fechada e consolidada. A cópia documental entrou na fila do arquivo.' };
  }

  /** Abrir a ATA Geral é do Líder Noturno Geral — e é assim que ela é achada. */
  if (rota === '/shifts/general-ata' && metodo === 'POST') {
    if (eu.role !== 'lider_noturno_geral') {
      return new Recusa(403, 'A ATA Geral Noturna é do Líder Noturno Geral.');
    }
    return { id: ATA_GERAL.id, data: ATA_GERAL.data, casas: ATA_GERAL.casas.length,
      aviso: 'As oito casas já constam na ATA. Casa sem chamado também é registro — não pode '
        + 'ficar em branco.' };
  }

  if (seg[0] === 'shifts' && seg[1] === 'general-ata' && seg.length === 3 && metodo === 'GET') {
    if (seg[2] !== ATA_GERAL.id) return new Recusa(404, 'ATA Geral não encontrada.');
    return ATA_GERAL;
  }

  if (seg[0] === 'shifts' && seg[1] === 'general-ata' && seg[3] === 'sign' && metodo === 'POST') {
    if (ATA_GERAL.status === 'fechada') {
      return new Recusa(400, 'A ATA Geral desta noite já foi fechada.');
    }
    const aguardando = ATA_GERAL.casas.filter((c) => !c.ataNoturnaConfirmada);
    const pendencias = String(b.pendencias ?? '').trim();
    if (aguardando.length && !pendencias) {
      return new Recusa(400, `${aguardando.map((c) => c.codigo).join(', ')} ainda não confirmou `
        + 'a ATA noturna da casa. Feche com pendência, dizendo o que faltou.');
    }
    ATA_GERAL = { ...ATA_GERAL, status: 'fechada', pendencias: pendencias || null,
      assinadaEm: new Date().toISOString() };
    enfileirarCopia('ata', 'general_night_ata', ATA_GERAL.id);
    return { status: 'fechada', aviso: 'ATA Geral Noturna assinada e fechada por você. Cada '
      + 'educador assinou apenas a própria passagem — nenhuma assinatura foi presumida.' };
  }

  // ---- cofre de acessos
  // ---- cofre de acessos: as rotas do servidor (§6.10)
  //
  // Chamava /vault, /vault/history e /vault/reauth — e, pior que o 404, com o
  // desenho errado: no servidor o cofre é DE UM ACOLHIDO
  // (/people/:id/credentials/*), não uma lista da casa. Uma lista única com as
  // senhas de vinte crianças é a planilha solta de novo.

  if (rota === '/people/credentials/kinds' && metodo === 'GET') return TIPOS_CREDENCIAL;

  /** Reautenticação: o campo é `password`, e a sessão aberta não basta. */
  if (rota === '/auth/reauth' && metodo === 'POST') {
    if (String(b.password ?? '').length < 4) {
      return new Recusa(401, 'Senha incorreta');
    }
    cofreLiberado = true;
    return { ok: true };
  }

  if (seg[0] === 'people' && seg[2] === 'credentials' && seg[3] === 'view' && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Somente a coordenação da casa acessa o cofre de acessos.');
    }
    if (!cofreLiberado) return new Recusa(403, 'Confirme sua senha para abrir o cofre de acessos.');
    // Listar JÁ É um ato auditado — por isso é POST, e não GET.
    return COFRE.filter((c) => c.personId === seg[1]).map((c) => ({
      id: c.id,
      tipo: TIPOS_CREDENCIAL.find((t) => t.cod === c.tipoCodigo)?.label ?? c.tipoCodigo,
      tipoCodigo: c.tipoCodigo, qual: c.qual, login: c.login, dica: c.dica,
      responsavel: c.responsavel, observacao: c.observacao, atualizadoEm: c.atualizadoEm,
    }));
  }

  if (seg[0] === 'people' && seg[2] === 'credentials' && seg[3] === 'history' && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Somente a coordenação da casa acessa o cofre de acessos.');
    }
    return COFRE_HIST.filter((h) => h.personId === seg[1]);
  }

  if (seg[0] === 'people' && seg[2] === 'credentials' && seg[4] === 'reveal' && metodo === 'POST') {
    if (!cofreLiberado) return new Recusa(403, 'Confirme sua senha para abrir o cofre de acessos.');
    const c = COFRE.find((x) => x.id === seg[3]);
    if (!c) return new Recusa(404, 'Acesso não encontrado.');
    const finalidade = String(b.finalidade ?? '').trim();
    if (finalidade.length < 5) {
      return new Recusa(400, 'Descreva para que precisa deste acesso (mínimo 5 caracteres).');
    }
    // O Gestor Geral entra pela EXCEÇÃO, e a exceção pede motivo institucional.
    if (eu.role === 'gestor_geral' && finalidade.length < 20) {
      return new Recusa(400, 'Acesso excepcional do Gestor Geral: descreva o motivo '
        + 'institucional (mínimo 20 caracteres). Fica registrado como exceção.');
    }
    const excepcional = eu.role === 'gestor_geral';
    COFRE_HIST = [{ personId: c.personId, quem: eu.fullName,
      acao: excepcional ? 'abertura excepcional' : 'abertura',
      quando: new Date().toISOString(), finalidade, excepcional }, ...COFRE_HIST];
    return { senha: c.senha, excepcional,
      aviso: excepcional
        ? 'Acesso excepcional do Gestor Geral registrado como exceção, com o motivo informado.'
        : 'Abertura registrada com o seu nome, o horário e a finalidade.' };
  }

  if (seg[0] === 'people' && seg[2] === 'credentials' && seg.length === 3 && metodo === 'POST') {
    if (eu.role !== 'coordenador') {
      return new Recusa(403, 'O cofre de acessos é da coordenação da casa. O Gestor Geral '
        + 'tem acesso excepcional e justificado.');
    }
    if (!cofreLiberado) return new Recusa(403, 'Confirme sua senha para abrir o cofre de acessos.');
    if (!TIPOS_CREDENCIAL.some((t) => t.cod === b.tipo)) {
      return new Recusa(400, 'Tipo de acesso desconhecido.');
    }
    const senha = String(b.senha ?? '').trim();
    if (!senha) return new Recusa(400, 'Informe a senha a guardar.');
    if (b.tipo === 'outro' && !String(b.qual ?? '').trim()) {
      return new Recusa(400, 'Descreva qual é o acesso.');
    }
    // A "cifra" do protótipo é de mentira; o que importa aqui é a FORMA: a
    // tela nunca mais vê a senha, só a dica.
    const dica = `${senha[0]}${'•'.repeat(Math.max(senha.length - 2, 1))}`
      + `${senha[senha.length - 1]} (${senha.length})`;
    const existente = COFRE.find((c) => c.personId === seg[1] && c.tipoCodigo === b.tipo
      && (c.qual ?? '') === String(b.qual ?? ''));
    if (existente) {
      existente.senha = senha; existente.dica = dica;
      existente.login = (b.login as string) ?? existente.login;
      existente.responsavel = (b.responsavel as string) ?? existente.responsavel;
      existente.observacao = (b.observacao as string) ?? existente.observacao;
      existente.atualizadoEm = new Date().toISOString();
    } else {
      COFRE.push({ id: uid(), personId: seg[1], tipoCodigo: String(b.tipo),
        qual: (b.qual as string) ?? null, login: (b.login as string) ?? null,
        dica, senha, responsavel: (b.responsavel as string) ?? null,
        observacao: (b.observacao as string) ?? null, atualizadoEm: new Date().toISOString() });
    }
    COFRE_HIST = [{ personId: seg[1], quem: eu.fullName,
      acao: existente ? 'troca de senha' : 'cadastro',
      quando: new Date().toISOString(), finalidade: null, excepcional: false }, ...COFRE_HIST];
    return { id: uid(), substituiu: !!existente,
      aviso: existente
        ? 'Acesso atualizado. A troca fica registrada com a data e o seu nome.'
        : 'Acesso guardado e cifrado. Só a coordenação desta casa abre — e cada abertura '
          + 'fica registrada.' };
  }

  // ---- transferências: as rotas do servidor (§15.6)
  //
  // As rotas existiam; a tela é que falava errado com elas. `GET /transfers`
  // só aceita POST no servidor: as caixas são /transfers/inbox e
  // /transfers/outbox, com FORMATOS DIFERENTES — quem recebe vê menos do que
  // quem pediu, e é essa diferença que protege o perfil antes do aceite.
  // Recusar é `decline` (era `refuse`), a conversa é `messages` (era
  // `message`) e sai por rota própria, não junto da lista.

  if (rota === '/transfers/inbox' && metodo === 'GET') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Seu cargo não tem acesso a este conteúdo.');
    }
    return {
      aviso: 'Você vê quem é, de onde vem e por quê. O perfil completo — saúde, documentos, '
        + 'benefícios e histórico — só abre depois do aceite.',
      solicitacoes: TRANSFERENCIAS
        .filter((t) => t.caixa === 'recebida' && t.situacao === 'solicitada')
        .map((t) => ({
          id: t.id, nomeCompleto: t.nomeCivil, nomeSocial: t.nome, idade: t.idade,
          origem: { codigo: t.outraCasa.split(' · ')[0], nome: t.outraCasa.split(' · ')[1] ?? t.outraCasa },
          motivo: t.motivo, solicitadaPor: t.pedidaPor, solicitadaEm: t.pedidaEm,
          mensagens: t.mensagens.length,
        })),
    };
  }

  if (rota === '/transfers/outbox' && metodo === 'GET') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Seu cargo não tem acesso a este conteúdo.');
    }
    const ROTULO: Record<string, string> = {
      solicitada: 'Aguardando decisão do destino', aceita: 'Aceita — acolhido transferido',
      recusada: 'Recusada com justificativa', cancelada: 'Cancelada pela origem',
    };
    return {
      solicitacoes: TRANSFERENCIAS.filter((t) => t.caixa === 'enviada').map((t) => ({
        id: t.id, nomeCompleto: t.nomeCivil, nomeSocial: t.nome, idade: t.idade,
        destino: { codigo: t.outraCasa.split(' · ')[0], nome: t.outraCasa.split(' · ')[1] ?? t.outraCasa },
        motivo: t.motivo, status: t.situacao, situacao: ROTULO[t.situacao] ?? t.situacao,
        solicitadaPor: t.pedidaPor, solicitadaEm: t.pedidaEm,
        decididaPor: t.decididaPor, decididaEm: t.decididaEm,
        justificativa: t.justificativa, mensagens: t.mensagens.length,
      })),
    };
  }

  if (rota === '/transfers' && metodo === 'POST') {
    if (String(b.reason ?? '').trim().length < 15) {
      return new Recusa(400, 'O motivo é obrigatório: é ele que a outra coordenação vai ler '
        + 'para decidir.');
    }
    const k = kid(String(b.personId ?? ''));
    if (!k) return new Recusa(400, 'Escolha o acolhido.');
    const casa = CASAS.find((c) => c.id === String(b.toHouseId ?? ''));
    if (!casa) return new Recusa(400, 'Escolha a unidade de destino.');
    TRANSFERENCIAS = [{
      id: uid(), caixa: 'enviada', nomeCivil: k.civil, nome: k.nome, idade: k.idade,
      outraCasa: `${casa.code} · ${casa.name}`, motivo: String(b.reason),
      pedidaPor: eu.fullName, pedidaEm: new Date().toISOString(), situacao: 'solicitada',
      justificativa: null, decididaPor: null, decididaEm: null, mensagens: [],
    }, ...TRANSFERENCIAS];
    return { ok: true, aviso: 'Pedido enviado à coordenação de destino. A criança só muda de '
      + 'casa no aceite — até lá, a responsabilidade continua sendo desta unidade.' };
  }

  if (seg[0] === 'transfers' && seg[2] === 'messages' && metodo === 'GET') {
    const t = TRANSFERENCIAS.find((x) => x.id === seg[1]);
    if (!t) return new Recusa(404, 'Solicitação não encontrada.');
    return t.mensagens.map((m) => ({
      id: m.id, autor: m.autor, casa: m.casa, texto: m.texto, quando: m.em,
      minha: m.autor === eu.fullName,
    }));
  }

  if (seg[0] === 'transfers' && seg[2] === 'messages' && metodo === 'POST') {
    const t = TRANSFERENCIAS.find((x) => x.id === seg[1]);
    if (!t) return new Recusa(404, 'Solicitação não encontrada.');
    if (String(b.texto ?? '').trim().length < 2) return new Recusa(400, 'Escreva a mensagem.');
    t.mensagens = [...t.mensagens, { id: uid(), casa: CASA.code, autor: eu.fullName,
      texto: String(b.texto), em: new Date().toISOString() }];
    return { ok: true, aviso: 'Mensagem registrada dentro do sistema, ligada a esta '
      + 'solicitação. Ela não pode ser apagada, e nenhuma coordenação entra na casa da outra.' };
  }

  if (seg[0] === 'transfers' && seg[2] === 'accept' && metodo === 'POST') {
    const t = TRANSFERENCIAS.find((x) => x.id === seg[1]);
    if (!t) return new Recusa(404, 'Solicitação não encontrada.');
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

  if (seg[0] === 'transfers' && seg[2] === 'decline' && metodo === 'POST') {
    const t = TRANSFERENCIAS.find((x) => x.id === seg[1]);
    if (!t) return new Recusa(404, 'Solicitação não encontrada.');
    if (String(b.motivo ?? '').trim().length < 15) {
      return new Recusa(400, 'A justificativa é obrigatória e fica registrada nas duas casas. '
        + 'É por ela que a coordenação de origem decide o próximo passo da criança.');
    }
    t.situacao = 'recusada'; t.justificativa = String(b.motivo);
    t.decididaPor = eu.fullName; t.decididaEm = new Date().toISOString();
    return { ok: true, aviso: 'Recusa registrada com justificativa nas duas casas. '
      + 'Nada mudou de lugar.' };
  }

  if (seg[0] === 'transfers' && seg[2] === 'cancel' && metodo === 'POST') {
    const t = TRANSFERENCIAS.find((x) => x.id === seg[1]);
    if (!t) return new Recusa(404, 'Solicitação não encontrada.');
    if (t.caixa !== 'enviada') {
      return new Recusa(400, 'Só a casa que pediu cancela o pedido.');
    }
    if (t.situacao !== 'solicitada') return new Recusa(400, 'Esta solicitação já foi decidida.');
    if (String(b.motivo ?? '').trim().length < 10) {
      return new Recusa(400, 'Diga por que o pedido está sendo cancelado. A outra coordenação lê.');
    }
    t.situacao = 'cancelada'; t.justificativa = String(b.motivo);
    t.decididaPor = eu.fullName; t.decididaEm = new Date().toISOString();
    return { ok: true, aviso: 'Pedido cancelado, com o motivo registrado nas duas casas.' };
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
  /**
   * Rascunho e envio são DOIS atos, como no servidor: `draft` recebe os eixos
   * direto no corpo e `submit` é a decisão de entregar para aprovação. A tela
   * mandava tudo junto para `/save`, que não existe.
   */
  if (seg[0] === 'followups' && seg[2] === 'draft' && metodo === 'POST') {
    const f = ACOMPANHAMENTOS.find((x) => x.id === seg[1]);
    if (!f) return new Recusa(404, 'Acompanhamento não encontrado.');
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Somente equipe técnica e coordenação redigem acompanhamentos.');
    }
    if (f.situacao === 'aprovado') {
      return new Recusa(400, 'Acompanhamento aprovado não se edita. Corrigir cria a versão '
        + 'seguinte, que precisa de nova aprovação — e a anterior continua legível.');
    }
    const eixos = b as Record<string, string>;
    if (!Object.keys(eixos).length) return new Recusa(400, 'Nenhum eixo informado.');
    f.eixos = eixos;
    f.redator = eu.fullName;
    f.situacao = 'rascunho';
    f.devolucao = null;
    f.historico = [...f.historico, { id: uid(), quem: eu.fullName, acao: 'rascunho salvo',
      em: new Date().toISOString(), nota: null }];
    return { ok: true, aviso: 'Rascunho salvo. Ninguém além de você o lê enquanto não for enviado.' };
  }

  if (seg[0] === 'followups' && seg[2] === 'submit' && metodo === 'POST') {
    const f = ACOMPANHAMENTOS.find((x) => x.id === seg[1]);
    if (!f) return new Recusa(404, 'Acompanhamento não encontrado.');
    const vazios = EIXOS.filter((e) => !String(f.eixos[e.cod] ?? '').trim());
    if (vazios.length) {
      return new Recusa(400, `Faltam eixos: ${vazios.map((e) => e.label).join('; ')}. `
        + 'Os eixos são obrigatórios — o que não foi observado se escreve como não observado, '
        + 'não se deixa em branco.');
    }
    f.situacao = 'em_aprovacao';
    f.historico = [...f.historico, { id: uid(), quem: eu.fullName,
      acao: 'enviado para aprovação', em: new Date().toISOString(), nota: null }];
    return { ok: true, aviso: 'Enviado para aprovação, com o seu nome como quem redigiu.' };
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
  /*
   * `/followups/:id/return` — a devolução com motivo — NÃO EXISTE no servidor,
   * e por isso saiu daqui também. O protótipo que aceita o que o sistema
   * recusa é propaganda: alguém aprova a tela, e a função não chega na casa.
   * Criar a devolução é decisão de produto, e está anotada.
   */
  if (seg[0] === 'followups' && seg[2] === 'amend' && metodo === 'POST') {
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
  // ---- arquivo documental: as rotas do servidor (§16)
  //
  // Chamava /archive (é /archive/queue), /archive/:id/retry (não existe: a
  // retentativa é da FILA, em /archive/process) e /archive/documents, que
  // casava com GET /archive/:id — o servidor leria "documents" como um id.

  if (rota === '/archive/queue' && metodo === 'GET') {
    if (['educador', 'cozinha', 'enfermagem'].includes(eu.role)) {
      return new Recusa(403, 'A fila do arquivo é da equipe técnica, da coordenação e do '
        + 'Gestor Geral. Educadores não têm acesso às pastas (§16.5).');
    }
    return ARQUIVO
      // A pasta restrita é outra raiz e outra permissão: quem não alcança não
      // recebe a linha. Não é filtro de tela — o item não é devolvido.
      .filter((a) => !a.restrito || ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role))
      .map((a) => ({
        id: a.id, caminho: a.caminho, arquivo: a.arquivo, entidade: a.categoria,
        versao: a.arquivo.includes('_V2') ? 'V2_ADENDO' : 'V1',
        situacao: a.estado, tentativas: a.tentativas, areaRestrita: a.restrito,
      }));
  }

  if (rota === '/archive/reconcile' && metodo === 'GET') {
    if (['educador', 'cozinha'].includes(eu.role)) {
      return new Recusa(403, 'Seu cargo não tem acesso a este conteúdo.');
    }
    const cats = [...new Set(ARQUIVO.map((a) => a.categoria))];
    const porCategoria = cats.map((c) => {
      const dela = ARQUIVO.filter((a) => a.categoria === c);
      return {
        categoria: c,
        aguardando: dela.filter((a) => ['aguardando', 'enviando'].includes(a.estado)).length,
        falhou: dela.filter((a) => a.estado === 'falhou').length,
        verificado: dela.filter((a) => a.estado === 'verificado').length,
      };
    });
    const pendentes = porCategoria.reduce((n, c) => n + c.aguardando + c.falhou, 0);
    return {
      porCategoria, pendentes,
      aviso: pendentes
        ? 'Há documentos fechados que ainda não estão no arquivo. Eles continuam íntegros no sistema.'
        : 'Nada pendente: tudo o que fechou está arquivado e verificado.',
    };
  }

  /** Retentativa é da FILA e é idempotente: mesma versão, mesmo arquivo. */
  if (rota === '/archive/process' && metodo === 'POST') {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Sem permissão para processar a fila do arquivo.');
    }
    const limite = Number(b.limite ?? 5);
    const pendentes = ARQUIVO
      .filter((a) => ['aguardando', 'enviando', 'falhou', 'salvo'].includes(a.estado))
      .slice(0, limite);
    const itens = pendentes.map((a) => {
      a.tentativas += 1;
      a.estado = 'verificado';
      a.erro = null;
      return { id: a.id, situacao: 'verificado' };
    });
    return { processados: itens.length, itens };
  }

  if (seg[0] === 'archive' && seg.length === 2 && metodo === 'GET') {
    const a = ARQUIVO.find((x) => x.id === seg[1]);
    if (!a) return new Recusa(404, 'Item de arquivo não encontrado.');
    return {
      id: a.id, caminho: a.caminho, arquivo: a.arquivo, categoria: a.categoria,
      entidade: a.categoria, entityId: a.id,
      versao: a.arquivo.includes('_V2') ? 'V2_ADENDO' : 'V1',
      situacao: a.estado, tentativas: a.tentativas, ultimoErro: a.erro,
      driveFileId: null, sha256: null, areaRestrita: a.restrito,
      fechadoEm: a.fechadoEm,
      enviadoEm: a.estado === 'aguardando' ? null : a.fechadoEm,
      verificadoEm: a.estado === 'verificado' ? a.fechadoEm : null,
      historico: a.estado === 'falhou'
        ? [{ de: 'aguardando', para: 'enviando', erro: null, em: a.fechadoEm },
           { de: 'enviando', para: 'falhou', erro: a.erro, em: a.fechadoEm }]
        : [{ de: 'aguardando', para: 'salvo', erro: null, em: a.fechadoEm }],
    };
  }

  return new Recusa(404, 'Esta parte do sistema ainda não está no protótipo.');
}
