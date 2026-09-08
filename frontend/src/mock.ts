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
import { SemConexao } from './api';
import { ALCANCE_POR_CARGO } from '../../backend/src/modules/identity/alcance';
import { TIPOS_OFFLINE, TIPOS_OFFLINE_KINDS } from '../../backend/src/modules/sync/tipos-offline';
import { cargoNoDocumento, nomeDoArquivo as nomeDaFolha }
  from '../../backend/src/kernel/documentos/folha';
import { folhaDaAta } from '../../backend/src/modules/shifts/ata-folha';
import { folhaDaOcorrencia } from '../../backend/src/modules/incidents/ocorrencia-folha';
import { folhaDeSaude } from '../../backend/src/modules/nursing/saude-folha';
import { folhaDaGrade } from '../../backend/src/modules/medications/grade-folha';
import { folhaDosCombinados } from '../../backend/src/modules/alignments/combinados-folha';
import { folhaDaEscala } from '../../backend/src/modules/identity/escala-folha';
import { folhaDoImpacto, folhaDaTrajetoria }
  from '../../backend/src/modules/reports/impacto-folha';
import { SECOES_ATA, AMBIENTES_CASA, CLASSIFICACOES_EPISODIO }
  from '../../backend/src/modules/shifts/ata-secoes';
import { TIPOS_ROTINA, DIAS_DA_SEMANA }
  from '../../backend/src/modules/routine/rotina-vocabulario';
import { gerarDocx, nomeDeArquivo } from './docx';
import type { DocumentoWord, SecaoDoDocumento } from './docx';
import { timbreEmBytes } from './timbre';
import { ROTULO_CARGO } from './rotulos';
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
/**
 * Relógio RELATIVO. Suspender um esquema tira da grade a dose que AINDA NÃO
 * chegou a hora — e "ainda não chegou" depende da hora em que a demonstração
 * for aberta. Com horário fixo, a mesma tela contava histórias diferentes às
 * 10h e às 22h. Estas duas leem o relógio de quem abriu.
 */
const daquiA = (min: number) => new Date(Date.now() + min * 60000).toISOString();
const haMinutos = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const diasAtras = (n: number) => new Intl.DateTimeFormat('en-CA',
  { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(Date.now() - n * 86_400_000));
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- pessoas

const CASA = { id: 'casa-ai3', code: 'AI3', name: 'Casa 03 (piloto)', kind: 'abrigo_institucional' };
/** O limite da unidade. Objeto, e não `let`, para a demonstração poder mudá-lo. */
const LIMITE = { valor: 20 };
/** As mudanças de limite feitas nesta sessão da demonstração. */
const MUDANCAS_DE_LIMITE: {
  de: number; para: number; motivo: string; autor: string; em: string;
}[] = [];
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
  /* Os campos que vieram da lista que a equipe técnica mantinha à mão. */
  rg?: string; cns?: string; filiacao?: string;
  foto?: string; fotoEm?: string;
}

const KIDS: Kid[] = [
  { id: 'p01', nome: 'Alice', civil: 'Alice Ribeiro (fictícia)', idade: 7, nascimento: '2019-03-14',
    rg: '1234567890', cns: '700000000000000',
    filiacao: 'Rosângela Ribeiro (fictícia)',
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
    prioridade: 'alta', entidade: 'medication_administration', entidadeId: 'd2',
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
  /** O que a pessoa escreveu sobre as doses do turno (0940). */
  medicacao: string | null;
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
  /* O turno anterior — a noite que acabou de terminar. É o que a equipe que
     entra abre para ler, e por isso vem fechado, com passagem assinada. */
  { id: 's0', turno: 'noturno', status: 'fechado', abertoEm: emHoras(19, 0),
    fechadoEm: emHoras(7, 10),
    passagens: [
      { id: 'h0', quem: 'Nélio Noturno (fictício)', cargo: 'educador', userId: 'u8',
        contribuicoes: 'Plantão noturno sem intercorrência grave; dois despertares.',
        pendencias: 'O portão dos fundos está emperrado.',
        orientacoes: 'A Maria pode estar cansada hoje — não dormiu bem.',
        medicacao: 'As doses das 22h foram dadas e confirmadas.',
        assinadaEm: emHoras(7, 5), horarioReal: emHoras(7, 5),
        complementoTardio: false, offline: false, complementos: [] },
    ],
    recebimentos: [],
    esperados: [{ quem: 'Nélio Noturno (fictício)', cargo: 'educador', userId: 'u8' }] },
  { id: 's1', turno: 'diurno', status: 'aberto', abertoEm: emHoras(7, 0), fechadoEm: null,
    passagens: [
      { id: 'h1', quem: 'Tainá Souza (fictícia)', cargo: 'educador', userId: 'u7',
        contribuicoes: 'Acompanhei o café e a saída para a escola; tudo tranquilo.',
        pendencias: 'Falta buscar o resultado do exame do Bruno na unidade de saúde.',
        orientacoes: 'A Alice acordou com tosse; se piorar, acionar a Enfermagem.',
        medicacao: null,
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
/**
 * Os ESQUEMAS de medicamento da casa (§11.1), semeados com os três estados:
 * um na grade, um já suspenso. Sem os três, a tela abre mostrando um só e não
 * explica a diferença — que é a coisa inteira que ela existe para mostrar.
 */
interface EsquemaMock {
  id: string; medicamento: string; dose: string; via: string; tipo: string;
  status: string; rotulo: string;
  acolhido: { id: string; nome: string };
  condicaoUso: string | null; prescritor: string | null;
  inicio: string; fim: string | null; horarios: string[];
  assinadaPor: string | null; assinadaEm: string | null; motivoDaSuspensao: string | null;
  /** A exceção do 0930: o padrão é o educador de plantão poder dar. */
  soEnfermagem: boolean; motivoSoEnfermagem: string | null;
}
/** O antes-e-depois de cada exceção marcada (0930). */
const EXCECOES_MEDICAMENTO: { id: string; prescriptionId: string; antes: boolean;
  depois: boolean; motivo: string; por: string; quando: string }[] = [];
const ESQUEMAS: EsquemaMock[] = [
  { id: 'esq1', medicamento: 'Colírio lubrificante (fictício)', dose: '1 gota em cada olho',
    via: 'oftálmica', tipo: 'uso_continuo', status: 'ativa', rotulo: 'Na grade',
    acolhido: { id: 'p11', nome: 'Lara' }, condicaoUso: null,
    prescritor: 'Oftalmologia — Clínica Fictícia', inicio: '2026-06-01', fim: null,
    horarios: ['07:30', '19:30'], assinadaPor: 'Enfermeira Fictícia',
    assinadaEm: '2026-06-01T10:00:00-03:00', motivoDaSuspensao: null,
    soEnfermagem: false, motivoSoEnfermagem: null },
  { id: 'esq2', medicamento: 'Amoxicilina (fictícia) 250 mg/5 mL', dose: '5 mL',
    via: 'oral', tipo: 'tratamento', status: 'ativa', rotulo: 'Na grade',
    acolhido: { id: 'p02', nome: 'Bruno' }, condicaoUso: null,
    prescritor: 'Pediatria — UBS Fictícia', inicio: '2026-08-28', fim: '2026-09-04',
    horarios: ['08:00', '16:00', '00:00'], assinadaPor: 'Enfermeira Fictícia',
    assinadaEm: '2026-08-28T09:20:00-03:00', motivoDaSuspensao: null,
    soEnfermagem: false, motivoSoEnfermagem: null },
  { id: 'esq3', medicamento: 'Anti-histamínico (fictício)', dose: '1 comprimido',
    via: 'oral', tipo: 'uso_continuo', status: 'suspensa', rotulo: 'Suspenso',
    acolhido: { id: 'p01', nome: 'Alice' }, condicaoUso: null,
    prescritor: 'Alergologia — Clínica Fictícia', inicio: '2026-04-10', fim: null,
    horarios: ['20:00'], assinadaPor: 'Enfermeira Fictícia',
    assinadaEm: '2026-04-10T11:00:00-03:00',
    motivoDaSuspensao: 'Consulta de retorno em 12/08 na Clínica Fictícia: a alergologista '
      + 'suspendeu o uso contínuo e manterá só o inalador em crise.',
    soEnfermagem: false, motivoSoEnfermagem: null },
  /* Um esquema com a EXCEÇÃO marcada, para a demonstração mostrar como ela
     aparece para quem NÃO pode dar — que é o educador, à noite. */
  { id: 'esq4', medicamento: 'Insulina (fictícia) NPH', dose: '8 unidades',
    via: 'subcutânea', tipo: 'uso_continuo', status: 'ativa', rotulo: 'Na grade',
    acolhido: { id: 'p07', nome: 'Rayssa' }, condicaoUso: null,
    prescritor: 'Endocrinologia — Ambulatório Fictício', inicio: '2026-07-15', fim: null,
    horarios: ['07:00', '22:00'], assinadaPor: 'Enfermeira Fictícia',
    assinadaEm: '2026-07-15T08:40:00-03:00', motivoDaSuspensao: null,
    soEnfermagem: true,
    motivoSoEnfermagem: 'Aplicação subcutânea com ajuste de dose pela glicemia; a Enfermagem '
      + 'orientou que a aplicação seja feita por ela, conforme a consulta de 15/07.' },
];

/** Quem está nominalmente autorizado a administrar (§11.3). */
interface AutorizacaoMock {
  id: string; userId: string; quem: string; de: string; ate: string | null;
  nota: string | null; autorizadoPor: string | null;
}
/** O protocolo por período. O noturno fica em aberto de propósito (33.4.1). */
const PROTOCOLO: { periodo: string; enfermagem: boolean; educadorAutorizado: boolean;
                   nota: string | null; definidoEm: string | null }[] = [
  { periodo: 'diurno', enfermagem: true, educadorAutorizado: false,
    nota: 'Enfermagem presente das 7h às 19h.', definidoEm: '2026-03-02T10:00:00-03:00' },
];

const AUTORIZACOES: AutorizacaoMock[] = [];

/** Os conflitos de sincronização em aberto (§17.4). */
const CONFLITOS: {
  id: string; entidade: string; entidadeId: string | null; tipo: string;
  descricao: string; versaoA: Record<string, unknown>; versaoB: Record<string, unknown>;
  criadoEm: string; aberto: boolean;
}[] = [
  { id: 'cf1', entidade: 'medication_administration', entidadeId: 'd3',
    tipo: 'medication.confirm', aberto: true,
    descricao: 'A mesma dose foi confirmada duas vezes: uma no tablet que estava sem sinal '
      + 'e subiu às 23h, outra no aparelho com rede.',
    versaoA: {
      'medicamento': 'Amoxicilina (fictícia) 250 mg/5 mL',
      'estado': 'administrado_no_horario',
      'confirmada por': 'Tainá Souza (fictícia)',
      'horário do fato': '08:05',
      'chegou ao servidor': '08:05',
    },
    versaoB: {
      'medicamento': 'Amoxicilina (fictícia) 250 mg/5 mL',
      'estado': 'administrado_com_atraso',
      'confirmada por': 'Mário Silva (fictício)',
      'horário do fato': '08:20',
      'chegou ao servidor': '23:04',
      'observação': 'Sem sinal na casa; registrado no tablet do plantão.',
    },
    criadoEm: emHoras(23, 4) },
];

/**
 * Os aparelhos institucionais da casa (§11.7, pendência #7).
 *
 * A demonstração começa com UM aparelho ativo e um revogado — porque o que a
 * folha precisa mostrar não é a lista cheia, é que o revogado NÃO some: as
 * doses que ele confirmou continuam rastreáveis.
 */
const APARELHOS: {
  id: string; rotulo: string; ativo: boolean; escopo: 'casa' | 'instituicao';
  registradoEm: string; revogadoEm: string | null;
  motivoRevogacao: string | null; ultimoUso: string | null;
}[] = [
  { id: 'ap1', rotulo: 'Tablet da sala da coordenação', ativo: true, escopo: 'casa',
    registradoEm: '2026-03-02T09:00:00-03:00', revogadoEm: null, motivoRevogacao: null,
    ultimoUso: emHoras(8, 5) },
  { id: 'ap2', rotulo: 'Celular do plantão noturno (antigo)', ativo: false, escopo: 'casa',
    registradoEm: '2025-11-10T10:00:00-03:00', revogadoEm: '2026-06-18T14:20:00-03:00',
    motivoRevogacao: 'Aparelho devolvido à administração na troca dos equipamentos da casa.',
    ultimoUso: '2026-06-17T21:40:00-03:00' },
];

/** Cada decisão sobre quem pode administrar, com o que valia antes (0860). */
const DECISOES_PROTOCOLO: {
  id: string; periodo: string;
  antes: { enfermagem: boolean; educadorAutorizado: boolean } | null;
  depois: { enfermagem: boolean; educadorAutorizado: boolean };
  motivo: string; por: string; quando: string;
}[] = [];

let DOSES: DoseMock[] = [
  { id: 'd1', personId: 'p11', horario: emHoras(7, 30), medicamento: 'Colírio lubrificante (fictício)',
    dose: '1 gota em cada olho', via: 'oftálmica', tipo: 'uso_continuo', condicaoUso: null,
    estado: 'aguardando_confirmacao', rotulo: 'Aguardando confirmação', pendente: true,
    confirmadaPor: null, administradaEm: null, observacao: null },
  { id: 'd2', personId: 'p11', horario: haMinutos(45), medicamento: 'Colírio lubrificante (fictício)',
    dose: '1 gota em cada olho', via: 'oftálmica', tipo: 'uso_continuo', condicaoUso: null,
    estado: 'aguardando_confirmacao', rotulo: 'Aguardando confirmação', pendente: true,
    confirmadaPor: null, administradaEm: null, observacao: null },
  { id: 'd3', personId: 'p02', horario: haMinutos(300), medicamento: 'Amoxicilina (fictícia) 250 mg/5 mL',
    dose: '5 mL', via: 'oral', tipo: 'tratamento', condicaoUso: null,
    estado: 'administrado_no_horario', rotulo: 'Administrado no horário', pendente: false,
    confirmadaPor: 'Tainá Souza (fictícia)', administradaEm: emHoras(8, 5), observacao: null },
  { id: 'd4', personId: 'p02', horario: daquiA(120), medicamento: 'Amoxicilina (fictícia) 250 mg/5 mL',
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
 * A ESCALA DE PLANTÃO (§5.12, migração 0950).
 *
 * A demonstração começa com a semana montada e com DOIS BURACOS de propósito —
 * a noite de um dia e o dia de outro sem ninguém. Um protótipo com a escala
 * completa esconderia justamente a coisa que o Marcelo pediu para ver: o turno
 * sem gente, antes de virar noite sem educador.
 */
interface EscalaMock {
  id: string; userId: string; quem: string; cargo: string;
  data: string; turno: 'diurno' | 'noturno';
  inicio: string | null; fim: string | null; nota: string | null;
  revogadaEm: string | null; motivoRevogacao: string | null; revogadaPor: string | null;
}

function diaRelativo(n: number): string {
  const d = new Date(`${HOJE}T12:00:00-03:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

const ESCALA: EscalaMock[] = (() => {
  const out: EscalaMock[] = [];
  const gente = [
    { userId: 'u1', quem: 'Mário Silva (fictício)', cargo: 'educador' },
    { userId: 'u6', quem: 'Joana Lima (fictícia)', cargo: 'educador' },
    { userId: 'u7', quem: 'Tainá Souza (fictícia)', cargo: 'educador' },
    { userId: 'u2', quem: 'Lúcia Líder Diurna (fictícia)', cargo: 'lider_diurno' },
  ];
  let n = 0;
  for (let d = -7; d <= 21; d++) {
    const data = diaRelativo(d);
    /* Dois buracos combinados: a noite de depois de amanhã e o dia do sábado
       seguinte. São eles que fazem o aviso aparecer na demonstração. */
    const semNoturno = d === 2;
    const semDiurno = d === 5;
    if (!semDiurno) {
      const p = gente[(d + 7) % 2];
      out.push({ id: `esc-${++n}`, ...p, data, turno: 'diurno',
        inicio: null, fim: null, nota: null,
        revogadaEm: null, motivoRevogacao: null, revogadaPor: null });
      if (d % 3 === 0) {
        const l = gente[3];
        out.push({ id: `esc-${++n}`, ...l, data, turno: 'diurno',
          inicio: null, fim: null, nota: null,
          revogadaEm: null, motivoRevogacao: null, revogadaPor: null });
      }
    }
    if (!semNoturno) {
      const p = gente[2 - ((d + 7) % 2)];
      out.push({ id: `esc-${++n}`, ...p, data, turno: 'noturno',
        inicio: null, fim: null, nota: null,
        revogadaEm: null, motivoRevogacao: null, revogadaPor: null });
    }
  }
  /* Uma retirada, para a demonstração mostrar que nada some: a linha fica
     riscada, com quem retirou e o motivo. */
  out.push({ id: 'esc-ret-1', userId: 'u6', quem: 'Joana Lima (fictícia)', cargo: 'educador',
    data: diaRelativo(3), turno: 'noturno', inicio: null, fim: null, nota: null,
    revogadaEm: emHoras(9, 15), motivoRevogacao: 'Trocou o plantão com a Tainá.',
    revogadaPor: 'Carla Coordenadora (fictícia)' });
  return out;
})();

/**
 * AS LINHAS DA ATA, com autor (0970).
 *
 * A demonstração começa com quatro linhas de três pessoas — e uma RESTRITA, que
 * é a que mostra a regra: quem entra como educador vê a contagem, e não o
 * texto. Sem a linha restrita semeada, a demonstração ensinaria que a restrição
 * não existe.
 */
interface LinhaAtaMock {
  id: string; ataId: string; autorId: string; quem: string; cargo: string;
  texto: string; restrita: boolean; quando: string; escritaEm: string;
}
const LINHAS_ATA: LinhaAtaMock[] = [
  { id: 'ln1', ataId: 'ata-noturna', autorId: 'u8', quem: 'Nélio Noturno (fictício)',
    cargo: 'educador',
    texto: 'A Maria não dormiu bem e fez xixi à noite; troquei a roupa de cama às 4h e ela '
      + 'voltou a dormir. Vale ficar de olho hoje à tarde.',
    restrita: false, quando: emHoras(4, 10), escritaEm: emHoras(4, 12) },
  { id: 'ln2', ataId: 'ata-noturna', autorId: 'u8', quem: 'Nélio Noturno (fictício)',
    cargo: 'educador',
    texto: 'O portão dos fundos ficou emperrado. Avisei a manutenção pelo caderno da casa.',
    restrita: false, quando: emHoras(5, 30), escritaEm: emHoras(5, 31) },
  { id: 'ln3', ataId: 'ata-noturna', autorId: 'u6', quem: 'Joana Lima (fictícia)',
    cargo: 'educador',
    texto: 'O Bruno acordou duas vezes com dor de barriga; tomou água e melhorou.',
    restrita: false, quando: emHoras(3, 5), escritaEm: emHoras(3, 6) },
  { id: 'ln4', ataId: 'ata-noturna', autorId: 'u3', quem: 'Carla Coordenadora (fictícia)',
    cargo: 'coordenador',
    texto: 'A visita da genitora da Alice, marcada para sexta, foi remarcada pela Vara. A '
      + 'equipe técnica conversa com ela antes de contar.',
    restrita: true, quando: emHoras(6, 40), escritaEm: emHoras(6, 41) },
];

const LE_RESTRITA = ['coordenador', 'equipe_tecnica', 'lider_diurno',
                     'lider_noturno_geral', 'gestor_geral'];

/** As linhas de uma ATA, já filtradas pelo que o cargo alcança. */
function linhasDaAta(ataId: string, papel: string) {
  const todas = LINHAS_ATA.filter((l) => l.ataId === ataId);
  const restritas = todas.filter((l) => l.restrita).length;
  const visiveis = LE_RESTRITA.includes(papel) ? todas : todas.filter((l) => !l.restrita);
  return {
    notas: visiveis.map((l) => ({
      id: l.id, autorId: l.autorId, quem: l.quem, cargo: l.cargo,
      texto: l.texto, restrita: l.restrita,
      quando: l.quando, escritaEm: l.escritaEm, propria: false,
    })),
    restritas,
    restritasOcultas: restritas - visiveis.filter((l) => l.restrita).length,
    podeEscreverRestrita: LE_RESTRITA.includes(papel),
  };
}

/** O período com os dois turnos de TODOS os dias, como o servidor devolve. */
function escalaDoPeriodo(de: string, ate: string) {
  const dias: any[] = [];
  for (let d = new Date(`${de}T12:00:00-03:00`);
       d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) <= ate;
       d.setDate(d.getDate() + 1)) {
    const data = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const doDia = ESCALA.filter((x) => x.data === data);
    const vivos = (t: string) => doDia.filter((x) => x.turno === t && !x.revogadaEm);
    dias.push({
      data,
      diurno: vivos('diurno'),
      noturno: vivos('noturno'),
      revogadas: doDia.filter((x) => x.revogadaEm),
      semNinguem: [
        ...(vivos('diurno').length ? [] : ['diurno']),
        ...(vivos('noturno').length ? [] : ['noturno']),
      ],
    });
  }
  const buracos = dias.flatMap((x) => x.semNinguem.map((t: string) => ({ data: x.data, turno: t })));
  return {
    de, ate, dias, turnosSemNinguem: buracos,
    aviso: buracos.length
      ? `${buracos.length} turno(s) deste período ainda não têm ninguém escalado. A escala `
        + 'informa quem devia estar; ela não impede ninguém de trabalhar.'
      : 'Todos os turnos deste período têm alguém escalado.',
  };
}

/** As linhas que a folha da parede desenha — o turno vazio sai ESCRITO. */
function linhasDaEscalaParaFolha(de: string, ate: string) {
  return escalaDoPeriodo(de, ate).dias.flatMap((d: any) => {
    const dos = (turno: 'diurno' | 'noturno') => (d[turno].length
      ? d[turno].map((p: any) => ({ data: d.data, turno, quem: p.quem, cargo: p.cargo,
                                    inicio: p.inicio, fim: p.fim, nota: p.nota }))
      : [{ data: d.data, turno, quem: null, cargo: null, inicio: null, fim: null, nota: null }]);
    return [...dos('diurno'), ...dos('noturno')];
  });
}

/**
 * OS REMÉDIOS DE UM TURNO (0940), para a passagem ler de volta.
 *
 * O recorte é o mesmo do servidor: 07h–19h no diurno, o resto no noturno. Ele
 * lê a MESMA grade que a tela da Saúde mostra — se fosse uma lista à parte, a
 * demonstração poderia dizer "tudo confirmado" na passagem enquanto a Saúde
 * mostrava dose pendente, e o protótipo ensinaria a não olhar nem uma nem
 * outra.
 */
function remediosDoTurno(turno: string) {
  const noTurno = (iso: string) => {
    const h = new Date(iso).getHours();
    return turno === 'diurno' ? h >= 7 && h < 19 : h >= 19 || h < 7;
  };
  const doses = DOSES.filter((d) => noTurno(d.horario)).map((d) => ({
    id: d.id,
    acolhido: KIDS.find((k) => k.id === d.personId)?.nome ?? '—',
    medicamento: d.medicamento,
    previsto: d.horario,
    estado: d.estado,
    confirmou: d.confirmadaPor,
    soEnfermagem: ESQUEMAS.some(
      (e) => e.medicamento === d.medicamento && e.soEnfermagem),
    semResposta: d.estado === 'aguardando_confirmacao',
  }));
  const semResposta = doses.filter((d) => d.semResposta).length;
  /* "Alguém tem que dizer", e não "cada um tem que dizer": a cobrança é de
     quem assina primeiro. */
  const jaEscrito = PLANTOES.some((p) => p.turno === turno
    && p.passagens.some((h) => (h.medicacao ?? '').trim().length > 0));
  return { doses, total: doses.length, semResposta, jaEscrito,
           exigeFrase: semResposta > 0 && !jaEscrito };
}

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

/**
 * ATENDIMENTOS DE SAÚDE — a linha única do §7.3.
 *
 * O protótipo não tinha nenhum, e por isso o painel devolvia `internacao: false`
 * e `retornoPendente: null` escritos na mão: não havia de onde tirar. Com estes
 * quatro, as três situações que a casa realmente vive aparecem — o retorno que
 * já venceu, o que ainda vem, e a internação em andamento.
 */
const ATENDIMENTOS: {
  id: string; personId: string; tipo: string; quando: string; local: string | null;
  especialidade: string | null; profissional: string | null; motivo: string | null;
  desfecho: string | null; status: string; retornoEm: string | null;
}[] = [
  { id: 'at1', personId: 'p08', tipo: 'consulta', quando: `${diasAtras(21)}T09:30:00-03:00`,
    local: 'UBS fictícia Centro', especialidade: 'Pediatria',
    profissional: 'Dra. Fictícia (CRM 00000)',
    motivo: 'Consulta de rotina do acolhimento.',
    desfecho: 'Solicitado exame de sangue; retorno marcado.',
    // Retorno que JÁ PASSOU: é a pendência que some quando ninguém a escreve.
    status: 'retorno_pendente', retornoEm: diasAtras(4) },
  { id: 'at2', personId: 'p08', tipo: 'exame', quando: `${diasAtras(9)}T08:00:00-03:00`,
    local: 'Laboratório fictício', especialidade: null, profissional: null,
    motivo: 'Hemograma pedido na consulta de pediatria.',
    desfecho: 'Coleta realizada; resultado ainda não retirado.',
    status: 'concluido', retornoEm: null },
  { id: 'at3', personId: 'p15', tipo: 'retorno', quando: `${diasAtras(6)}T14:00:00-03:00`,
    local: 'Ambulatório fictício', especialidade: 'Endocrinologia',
    profissional: 'Dr. Fictício (CRM 00000)',
    motivo: 'Retorno para ajuste de dose.',
    desfecho: 'Dose ajustada conforme laudo; nova avaliação em 60 dias.',
    status: 'retorno_pendente', retornoEm: diasAtras(-54) },
  { id: 'at4', personId: 'p09', tipo: 'urgencia', quando: `${diasAtras(1)}T19:20:00-03:00`,
    local: 'Pronto-atendimento fictício', especialidade: 'Odontologia',
    profissional: 'Equipe do plantão', motivo: 'Dor de dente referida depois do almoço.',
    desfecho: 'Prescrito antibiótico por 7 dias; orientado retorno se piorar.',
    status: 'concluido', retornoEm: null },
];

/** Cada emissão de Resumo de Saúde pede finalidade — e a finalidade fica. */
const RESUMOS: { id: string; personId: string; finalidade: string;
                 por: string; em: string; baixadoEm?: string | null;
                 offline?: boolean }[] = [
  // Gerado e nunca retirado: o papel que ninguém pegou não chegou a lugar
  // nenhum, e é por isso que ele continua aparecendo na lista.
  { id: 'res1', personId: 'p08', finalidade: 'consulta',
    por: 'Enfermeira Fictícia', em: `${diasAtras(22)}T08:10:00-03:00`, baixadoEm: null },
  { id: 'res2', personId: 'p15', finalidade: 'exame',
    por: 'Enfermeira Fictícia', em: `${diasAtras(30)}T11:00:00-03:00`,
    baixadoEm: `${diasAtras(30)}T11:05:00-03:00` },
];

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
  falaEspontanea: string | null; sinaisObservados?: string | null;
  protegidoPor?: string | null; protegidoPorCargo?: string | null;
  protegidoEm?: string | null;
  abertaPor: string; abertaEm: string;
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
/*
 * A ATA do turno ANTERIOR já nasce semeada e FECHADA (0970).
 *
 * O protótipo só tinha o plantão de hoje, e "todos leem a ATA do turno
 * anterior" — o pedido do Marcelo — não teria o que mostrar: a tela responderia
 * "ainda não há plantão anterior", que é verdade no arquivo e mentira na casa.
 */
let ATAS: AtaMock[] = [
  { id: 'ata-noturna', plantaoId: 's0', status: 'fechada', versao: 2,
    pendencias: null, fechadaEm: emHoras(7, 10),
    conteudo: {
      intercorrencias: 'Noite tranquila, com dois despertares.',
      medicacao: 'Doses das 22h administradas e confirmadas.',
    },
    adendos: [] },
];
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
/**
 * REUNIÕES E COMBINADOS (§9.4).
 *
 * O que a equipe estabeleceu, escrito num lugar só. Escreve a técnica e a
 * coordenação; lê todo mundo da casa — inclusive quem não estava na reunião,
 * que é quem mais precisa.
 */
const TIPOS_REUNIAO_MOCK = [
  { code: 'equipe', label: 'Reunião de equipe' },
  { code: 'tecnica', label: 'Reunião técnica' },
  { code: 'extraordinaria', label: 'Reunião extraordinária' },
  { code: 'capacitacao', label: 'Capacitação' },
  { code: 'supervisao', label: 'Supervisão' },
];
const SITUACAO_COMBINADO: Record<string, string> = {
  vigente: 'Vigente', cumprido: 'Cumprido',
  revogado: 'Revogado', substituido: 'Substituído por outro',
};
interface CombinadoMock {
  id: string; reuniaoId: string | null; texto: string;
  responsavel: string | null; prazo: string | null; situacao: string;
  motivoDaSituacao: string | null; mudadoPor: string | null; mudadoEm: string | null;
  por: string; criadoEm: string;
  historico: { de: string; para: string; motivo: string; quem: string; quando: string }[];
}
interface ReuniaoMock {
  id: string; data: string; tipo: string; titulo: string;
  participantes: string | null; pauta: string | null; notas: string | null;
  por: string; registradaEm: string;
}
const REUNIOES: ReuniaoMock[] = [
  { id: 'rn1', data: diasAtras(3), tipo: 'equipe',
    titulo: 'Organização das saídas para a escola',
    participantes: 'Carla Coordenadora, Tatiane Técnica, Joana Lima, Mário Silva e a '
      + 'Enfermagem (fictícios).',
    pauta: 'Horários de saída, quem acompanha cada criança e o que fazer quando falta '
      + 'gente no turno.',
    notas: 'A escola mudou o horário da saída da tarde. A equipe combinou dois ajustes, '
      + 'registrados abaixo, e a coordenação ficou de avisar a Enfermagem sobre o novo '
      + 'horário da medicação da volta.',
    por: 'Tatiane Técnica (fictícia)', registradaEm: `${diasAtras(3)}T16:40:00-03:00` },
  { id: 'rn2', data: diasAtras(24), tipo: 'tecnica',
    titulo: 'Revisão dos PIAs do trimestre',
    participantes: 'Tatiane Técnica e Carla Coordenadora (fictícias).',
    pauta: 'Prazos de revisão e o que falta de documento em cada dossiê.',
    notas: 'Combinado que o dossiê é conferido junto com o PIA, para não descobrir '
      + 'documento vencido na véspera da audiência.',
    por: 'Tatiane Técnica (fictícia)', registradaEm: `${diasAtras(24)}T15:10:00-03:00` },
];
let COMBINADOS: CombinadoMock[] = [
  { id: 'cb1', reuniaoId: 'rn1',
    texto: 'A partir de segunda, a saída para a fono é com a educadora do turno da tarde, '
      + 'e não mais com quem estiver de folga entrando mais cedo.',
    responsavel: 'Turno da tarde', prazo: null, situacao: 'vigente',
    motivoDaSituacao: null, mudadoPor: null, mudadoEm: null,
    por: 'Tatiane Técnica (fictícia)', criadoEm: `${diasAtras(3)}T16:45:00-03:00`,
    historico: [] },
  { id: 'cb2', reuniaoId: 'rn1',
    texto: 'Ninguém entra no quarto do Bruno sem bater e esperar resposta — inclusive na '
      + 'ronda da noite, que passa a bater antes de abrir.',
    responsavel: 'Todos os turnos', prazo: null, situacao: 'vigente',
    motivoDaSituacao: null, mudadoPor: null, mudadoEm: null,
    por: 'Carla Coordenadora (fictícia)', criadoEm: `${diasAtras(3)}T16:52:00-03:00`,
    historico: [] },
  { id: 'cb3', reuniaoId: 'rn2',
    texto: 'O dossiê é conferido junto com a revisão do PIA, e o que estiver vencido entra '
      + 'na pauta da reunião seguinte.',
    responsavel: 'Equipe técnica', prazo: diasAtras(-45), situacao: 'vigente',
    motivoDaSituacao: null, mudadoPor: null, mudadoEm: null,
    por: 'Tatiane Técnica (fictícia)', criadoEm: `${diasAtras(24)}T15:20:00-03:00`,
    historico: [] },
  // O encerrado NÃO some: ele fica, com o motivo, porque a equipe cumpriu ele
  // durante semanas e precisa entender por que parou.
  { id: 'cb4', reuniaoId: 'rn2',
    texto: 'A conferência do armário de medicação passa a ser às quintas, no fim do turno '
      + 'da tarde.',
    responsavel: 'Enfermagem', prazo: null, situacao: 'revogado',
    motivoDaSituacao: 'A Enfermagem passou a vir às terças. A conferência foi para a terça, '
      + 'e o combinado novo está registrado.',
    mudadoPor: 'Carla Coordenadora (fictícia)', mudadoEm: `${diasAtras(10)}T11:00:00-03:00`,
    por: 'Tatiane Técnica (fictícia)', criadoEm: `${diasAtras(24)}T15:25:00-03:00`,
    historico: [{ de: 'Vigente', para: 'Revogado',
      motivo: 'A Enfermagem passou a vir às terças. A conferência foi para a terça, e o '
        + 'combinado novo está registrado.',
      quem: 'Carla Coordenadora (fictícia)', quando: `${diasAtras(10)}T11:00:00-03:00` }] },
];

/** A reautenticação vale enquanto a página estiver aberta. */
let cofreLiberado = false;

/**
 * BENEFÍCIOS E DADOS BANCÁRIOS (§6.10) — os campos da planilha real.
 *
 * A planilha "DADOS BANCÁRIOS - AI 03" tem número do benefício, operação da
 * conta, nome da agência e a coluna PENDÊNCIA BANCÁRIA, que é o motivo de ela
 * existir. O banco tinha as colunas desde a migração 055 e o serviço nunca as
 * leu; aqui elas aparecem para que a demonstração mostre a casa como ela é.
 */
const TIPOS_BENEFICIO_MOCK = [
  { cod: 'bpc', label: 'BPC — Benefício de Prestação Continuada' },
  { cod: 'pensao', label: 'Pensão' },
  { cod: 'poupanca_institucional', label: 'Poupança institucional' },
  { cod: 'bolsa_familia', label: 'Bolsa Família / transferência de renda' },
  { cod: 'auxilio_judicial', label: 'Valor depositado por decisão judicial' },
  { cod: 'outro', label: 'Outro benefício ou conta' },
];
const SITUACOES_BENEFICIO_MOCK = [
  { cod: 'ativo', label: 'Ativo' },
  { cod: 'em_regularizacao', label: 'Em regularização' },
  { cod: 'encerrado', label: 'Encerrado' },
];
interface BeneficioMock {
  id: string; personId: string; tipo: string; numero: string | null;
  banco: string | null; agencia: string | null; agenciaNome: string | null;
  conta: string | null; operacao: string | null; situacao: string;
  pendenciaBancaria: boolean; pendenciaNota: string | null; observacoes: string | null;
  temAcessoGov: boolean; responsavelPeloAcesso: string | null; ondeEstaGuardado: string | null;
  atualizadoEm: string; atualizadoPor: string | null;
}
const BENEFICIOS: BeneficioMock[] = [
  { id: 'b1', personId: 'p01', tipo: 'bpc', numero: '000.000.000-0',
    banco: 'Banco fictício', agencia: '0000', agenciaNome: 'Agência Centro (fictícia)',
    conta: '00000-0', operacao: '013', situacao: 'ativo',
    pendenciaBancaria: false, pendenciaNota: null,
    observacoes: 'Saque mensal acompanhado pela coordenação, com recibo arquivado.',
    temAcessoGov: true, responsavelPeloAcesso: 'Coordenação da Casa 03',
    ondeEstaGuardado: 'Guardada no cofre de acessos deste sistema.',
    atualizadoEm: emHoras(7, 50), atualizadoPor: 'Carla Coordenadora (fictícia)' },
  // A pendência é o caso que a planilha existe para lembrar.
  { id: 'b2', personId: 'p01', tipo: 'poupanca_institucional', numero: null,
    banco: 'Banco fictício', agencia: '0000', agenciaNome: 'Agência Centro (fictícia)',
    conta: '11111-1', operacao: '023', situacao: 'em_regularizacao',
    pendenciaBancaria: true,
    pendenciaNota: 'Conta bloqueada por falta de atualização cadastral. Atendimento agendado '
      + 'na agência para o dia 12; levar certidão de nascimento e a guia de acolhimento.',
    observacoes: null,
    temAcessoGov: false, responsavelPeloAcesso: null, ondeEstaGuardado: null,
    atualizadoEm: emHoras(8, 20), atualizadoPor: 'Carla Coordenadora (fictícia)' },
  { id: 'b3', personId: 'p02', tipo: 'pensao', numero: '111.111.111-1',
    banco: 'Banco fictício', agencia: '0001', agenciaNome: 'Agência Norte (fictícia)',
    conta: '22222-2', operacao: null, situacao: 'ativo',
    pendenciaBancaria: false, pendenciaNota: null,
    observacoes: 'Depósito por decisão judicial; extrato conferido todo mês.',
    temAcessoGov: false, responsavelPeloAcesso: null, ondeEstaGuardado: null,
    atualizadoEm: emHoras(9, 5), atualizadoPor: 'Carla Coordenadora (fictícia)' },
];
/** Quem abriu, alterou — ou TENTOU e foi recusado. A tentativa não some. */
let BENEFICIO_HIST: { personId: string; quando: string; quem: string;
                      finalidade: string | null; acao: string; recusada: boolean }[] = [
  { personId: 'p01', quem: 'Carla Coordenadora (fictícia)', acao: 'consulta',
    quando: emHoras(9, 30), finalidade: 'Conferir a conta para o saque do BPC de setembro',
    recusada: false },
  { personId: 'p01', quem: 'Mário Silva (fictício)', acao: 'tentativa recusada',
    quando: emHoras(8, 55), finalidade: null, recusada: true },
  { personId: 'p01', quem: 'Carla Coordenadora (fictícia)', acao: 'alteração',
    quando: emHoras(8, 20), finalidade: 'Registro da pendência informada pelo banco',
    recusada: false },
];

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
/**
 * O relatório do protótipo, no MESMO formato que o servidor devolve.
 *
 * Esta interface já divergiu: `periodo` era frase aqui e objeto lá, e o
 * `entregas` que a tela percorre não existia na resposta de verdade. O
 * protótipo mostrava a aba inteira funcionando e ela quebrava contra o
 * servidor. O mock é o servidor de mentira — quando ele responde outra coisa,
 * a demonstração passa a ensaiar um sistema que não existe.
 */
interface Relatorio {
  id: string; tipo: string; tipoCod: string; personId: string | null;
  periodo: { de: string; ate: string }; unidade: string | null;
  situacao: 'rascunho' | 'em_aprovacao' | 'aprovado';
  finalidade: string; autor: string; em: string;
  entregas: { id: string; destino: string; meio: string; em: string; protocolo: string | null;
              por: string }[];
}
/** Os que exigem aprovação de outra pessoa — a mesma lista do servidor. */
const EXIGEM_APROVACAO = ['judiciario', 'audiencia', 'mensal_da_casa'];
/** O rótulo do tipo. O servidor devolve a frase, não o código. */
const TIPOS_RELATORIO_ROTULO: Record<string, string> = {
  diario: 'Diário', semanal: 'Semanal', mensal: 'Mensal',
  periodo: 'Período personalizado', individual: 'Individual completo',
  desenvolvimento: 'Desenvolvimento da criança na casa', ocorrencias: 'Ocorrências',
  alimentacao: 'Alimentação e restrições', saude: 'Evolução e Resumo de Saúde',
  judiciario: 'Judiciário', audiencia: 'Audiência concentrada',
  mensal_da_casa: 'Mensal da casa', beneficios: 'Benefícios e dados bancários',
};

let RELATORIOS: Relatorio[] = [
  { id: 'r1', tipo: 'Judiciário', tipoCod: 'judiciario', personId: 'p02',
    periodo: { de: '2026-08-01', ate: '2026-08-31' }, unidade: 'AI3',
    situacao: 'em_aprovacao', finalidade: 'Audiência concentrada marcada para setembro.',
    autor: 'Tatiane Técnica (fictícia)', em: emHoras(10, 0), entregas: [] },
  { id: 'r2', tipo: 'Mensal da casa', tipoCod: 'mensal_da_casa', personId: null,
    periodo: { de: '2026-07-01', ate: '2026-07-31' }, unidade: 'AI3',
    situacao: 'aprovado', finalidade: 'Prestação de contas interna da unidade.',
    autor: 'Carla Coordenadora (fictícia)', em: emHoras(9, 0),
    entregas: [{ id: 'en1', destino: 'Diretoria da Fundação', meio: 'Entrega em mãos',
      em: emHoras(9, 30), protocolo: null, por: 'Carla Coordenadora (fictícia)' }] },
  { id: 'r3', tipo: 'Alimentação e restrições', tipoCod: 'alimentacao', personId: null,
    periodo: { de: '2026-08-01', ate: '2026-08-31' }, unidade: 'AI3',
    situacao: 'aprovado', finalidade: 'Planejamento do cardápio da cozinha.',
    autor: 'Tatiane Técnica (fictícia)', em: emHoras(11, 0), entregas: [] },
];

/**
 * O RELATÓRIO COMO DOCUMENTO — a folha que sai daqui e vai para fora.
 *
 * O que o sistema sabe escrever sozinho, ele escreve, e diz de ONDE tirou. O
 * que só uma pessoa pode escrever — avaliação técnica, encaminhamento,
 * parecer — sai em branco e marcado "a preencher". Um relatório que chegasse
 * preenchido pelo sistema seria decisão automática sobre a vida de uma
 * criança, que é a coisa que este projeto mais recusa.
 */
function documentoDoRelatorio(
  r: Relatorio, crianca: ReturnType<typeof kid> | null, finalidade: string, rascunho: boolean,
): DocumentoWord {
  const secoes: SecaoDoDocumento[] = [];
  // O período é objeto, como no servidor; a folha o escreve como frase.
  const dePara = (d: string) => {
    const data = new Date(`${String(d).slice(0, 10)}T12:00:00`);
    return Number.isNaN(data.getTime()) ? String(d)
      : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const periodoEscrito = `${dePara(r.periodo.de)} a ${dePara(r.periodo.ate)}`;

  if (crianca) {
    const doses = DOSES.filter((d) => d.personId === crianca.id);
    const atend = ATENDIMENTOS.filter((a) => a.personId === crianca.id);
    const acomp = ACOMPANHAMENTOS
      .filter((a) => a.personId === crianca.id && a.situacao === 'aprovado');

    secoes.push({
      titulo: 'Saúde no período',
      paragrafos: atend.length
        ? []
        : ['Não há atendimento de saúde registrado para o acolhido no período.'],
      tabela: atend.length ? {
        cabecalho: ['Data', 'Atendimento', 'Serviço', 'Situação'],
        linhas: atend.map((a) => [
          String(a.quando).slice(8, 10) + '/' + String(a.quando).slice(5, 7),
          a.tipo, a.local ?? '—',
          a.status === 'retorno_pendente'
            ? `Retorno em ${a.retornoEm ?? '—'}` : 'Concluído',
        ]),
      } : undefined,
      procedencia: 'atendimentos e evoluções registrados no módulo de Enfermagem.',
    });

    secoes.push({
      titulo: 'Medicação',
      paragrafos: doses.length
        ? [`No período constam ${doses.length} dose(s) previstas na grade da casa, `
           + `das quais ${doses.filter((d) => !d.pendente).length} com confirmação `
           + 'registrada por quem administrou.']
        : ['O acolhido não tem medicação prevista na grade da casa.'],
      procedencia: 'grade de medicamentos; cada dose é confirmada por quem a administrou.',
    });

    if (acomp.length) {
      secoes.push({
        titulo: 'Acompanhamento aprovado',
        itens: acomp.flatMap((a) => Object.entries(a.eixos ?? {})
          .map(([eixo, texto]) => `${eixo}: ${texto}`)),
        procedencia: 'acompanhamentos com aprovação de segunda pessoa.',
      });
    }
  } else {
    const ocorr = OCORRENCIAS.length;
    secoes.push({
      titulo: 'Movimento da unidade no período',
      itens: [
        `${todosKids().length} acolhidos na unidade ao fim do período.`,
        `${ocorr} ocorrência(s) registrada(s), com etapa operacional encerrada `
        + 'ou em revisão técnica.',
        `${DOSES.length} dose(s) na grade de medicamentos do dia de referência.`,
      ],
      procedencia: 'registros operacionais da unidade no período informado.',
    });
  }

  secoes.push({
    titulo: 'Avaliação técnica',
    aPreencher: 'escrito por quem assina o documento; o sistema não avalia',
  });
  secoes.push({
    titulo: 'Encaminhamentos',
    aPreencher: 'o que a equipe propõe, e para quem',
  });

  return {
    titulo: `Relatório ${r.tipo}`,
    subtitulo: `Período de referência: ${periodoEscrito}`,
    identificacao: [
      ...(crianca
        ? [{ rotulo: 'Acolhido', valor: `${crianca.nome} (${crianca.idade} anos)` }]
        : [{ rotulo: 'Abrangência', valor: 'Unidade — todos os acolhidos' }]),
      { rotulo: 'Unidade', valor: 'AI3 — Casa 03 (piloto)' },
      { rotulo: 'Período', valor: periodoEscrito },
      { rotulo: 'Finalidade declarada', valor: finalidade },
      { rotulo: 'Situação do documento', valor: rascunho ? 'Rascunho — sem aprovação' : 'Aprovado' },
    ],
    secoes,
    rascunho,
    geradoPor: eu.fullName,
    cargo: ROTULO_CARGO[eu.role] ?? eu.role,
    ressalva: 'Documento gerado pelo protótipo do Rede Acolher com DADOS FICTÍCIOS, para '
      + 'demonstração. A parte factual é escrita pelo sistema a partir dos registros; a '
      + 'avaliação e os encaminhamentos são escritos por pessoas.',
  };
}

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

/**
 * As correções de cadastro (§6.2). Nada é apagado: a linha guarda o que estava,
 * o que passou a estar, quem corrigiu e por quê.
 */
interface CorrecaoMock {
  id: string; personId: string; campo: string;
  antes: string | null; depois: string | null;
  motivo: string; por: string; quando: string;
}
const CORRECOES: CorrecaoMock[] = [];

/**
 * Os campos descritivos do perfil (§6.4) e o que já mudou neles.
 *
 * `DETALHE` guarda o que está VALENDO agora, por acolhido — a demonstração
 * precisa mostrar o texto novo depois de salvar, e não voltar ao de fábrica.
 * `ALTERACOES` guarda o que estava antes, que é o ponto da migração 0850.
 */
interface AlteracaoMock {
  id: string; personId: string; campo: string;
  antes: string | null; depois: string | null; por: string; quando: string;
}
const ALTERACOES: AlteracaoMock[] = [];
const DETALHE: Record<string, Record<string, string | null>> = {};
/** O rótulo é o mesmo que o servidor devolve — escrito duas vezes, divergiria. */
const ROTULO_DETALHE: Record<string, string> = {
  cuidadosEssenciais: 'Cuidados essenciais', escolaNome: 'Escola',
  escolaSerie: 'Série', escolaTurno: 'Turno da escola',
  escolaEndereco: 'Endereço da escola', equipeReferencia: 'Equipe de referência',
  observacoes: 'Observações',
};
/** O que está valendo: o de fábrica da criança, coberto pelo que foi editado. */
function detalheDe(k: Kid): Record<string, string | null> {
  return {
    cuidadosEssenciais: k.cuidado ?? null,
    escolaNome: 'EMEF Vila Nova (fictícia)',
    escolaSerie: k.serie,
    escolaTurno: k.turno,
    escolaEndereco: 'Rua Fictícia, 100 — Porto Alegre/RS',
    equipeReferencia: 'Equipe técnica Casa 03',
    observacoes: null,
    ...(DETALHE[k.id] ?? {}),
  };
}

/** O que a atualização judicial já mudou nesta sessão da demonstração. */
const JUDICIAL_EXTRA: Record<string, string | null> = {};

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

/*
 * SEM SINAL, NO PROTÓTIPO.
 *
 * O arquivo do protótipo não tem rede: sem isto, a fila local seria a única
 * parte do sistema que ninguém consegue ver antes do piloto — e ela é
 * justamente a que muda o comportamento do aplicativo fora da tela. Com o
 * botão ligado, o servidor de mentira para de responder como um servidor
 * inalcançável responde: silêncio, e não recusa. É o que a `SemConexao` do
 * `api.ts` distingue.
 *
 * Isto NÃO existe no aplicativo de verdade, como o "Ver como" não existe.
 */
let semSinal = false;
export function simularSemSinal(ligado: boolean) { semSinal = ligado; }
export function estaSemSinal() { return semSinal; }

export async function mockApi<T>(path: string, init?: RequestInit): Promise<T> {
  await new Promise((r) => setTimeout(r, 120));   // uma pausa curta, como a rede real
  if (semSinal) {
    throw new SemConexao(
      'Sem conexão com o servidor. O que você registrar fica guardado neste aparelho.',
    );
  }
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

/*
 * O ESTADO DO SERVIDOR DE MENTIRA VIVE FORA DA FUNÇÃO QUE RESPONDE.
 *
 * A primeira versão destes dois blocos foi declarada DENTRO de `responder()`.
 * Compilava, e a demonstração respondia "internação aberta" — e a lista
 * seguinte vinha vazia, porque o array nascia de novo a cada chamada. O
 * defeito não aparece num teste de tela: aparece quando alguém tenta usar a
 * demonstração como se fosse o sistema, que é exatamente o que a casa vai
 * fazer com ela.
 */
/*
 * INTERNAÇÃO HOSPITALAR, no servidor de mentira.
 *
 * O efeito que importa aqui é o mesmo do servidor: a criança internada SOME da
 * chamada e da grade de medicação da casa. Um mock que mostrasse a internação
 * como uma lista bonita, sem tirar a criança da linha do dia, ensaiaria
 * exatamente o contrário do que o sistema faz — e a demonstração combinaria
 * com a explicação enquanto nenhuma das duas combinasse com o produto.
 */
interface InternacaoMock {
  id: string; acolhidoId: string; hospital: string; motivo: string;
  desde: string; ate: string | null; status: string; desfecho: string | null;
  abertaPor: string; encerradaPor: string | null; observacaoDoDesfecho: string | null;
  diario: any[]; medicacaoNoHospital: any[]; acompanhantes: any[];
}
const INTERNACOES: InternacaoMock[] = [];
let proximaInternacao = 1;

/** A regra do dia: o dia da ALTA é dia de casa. */
function estaInternado(personId: string) {
  return INTERNACOES.some((i) => i.acolhidoId === personId && i.status === 'em_andamento');
}

const TIPOS_DE_NOTA_INT = [
  { cod: 'relato', label: 'Relato do dia' },
  { cod: 'retorno_medico', label: 'Retorno médico' },
  { cod: 'exame', label: 'Exame' },
  { cod: 'atendimento', label: 'Atendimento' },
  { cod: 'medicacao', label: 'Medicação' },
  { cod: 'solicitacao_do_hospital', label: 'Solicitação do hospital' },
  { cod: 'alta_prevista', label: 'Alta prevista' },
];

const QUEM_ABRE_INT = ['equipe_tecnica', 'coordenador', 'gestor_geral'];
const QUEM_VE_INT = [...QUEM_ABRE_INT, 'lider_diurno', 'lider_noturno_geral', 'enfermagem'];

function resumoInternacao(i: InternacaoMock) {
  const dias = new Set(i.diario.map((n: any) => n.dia));
  const acomp = i.acompanhantes.find((a: any) => !a.ate);
  return {
    id: i.id, acolhidoId: i.acolhidoId, acolhido: kid(i.acolhidoId)?.nome ?? '—',
    hospital: i.hospital, motivo: i.motivo, desde: i.desde, ate: i.ate,
    status: i.status, desfecho: i.desfecho, abertaPor: i.abertaPor,
    acompanhante: acomp?.quem ?? null,
    diasComRelato: dias.size, registros: i.diario.length,
    diasInternada: Math.max(1, Math.ceil(
      ((i.ate ? new Date(i.ate) : new Date()).getTime() - new Date(i.desde).getTime()) / 86400000)),
  };
}


/*
 * OS CONTATOS FICTÍCIOS, na forma da lista que a casa mantém à mão.
 *
 * Genitora, madrinha e vínculo comunitário na mesma lista, como está no
 * documento de texto que a equipe técnica reenvia inteiro toda vez que uma
 * linha muda — e um contato com aproximação restrita, que é o caso que a tela
 * precisa saber mostrar antes dos outros.
 */
const CONTATOS: Record<string, any[]> = {};
let proximoContato = 1;
function contatosDe(id: string) {
  if (!CONTATOS[id]) {
    CONTATOS[id] = [
      { id: `ct-${id}-1`, nome: 'Rosângela (fictícia)', vinculo: 'genitora',
        vinculoRotulo: 'Genitora', telefone: '51 98888-0001',
        observacao: 'Liga aos domingos de manhã.',
        restrito: false, motivoDaRestricao: null, ativo: true, motivoDoEncerramento: null,
        por: 'Equipe técnica (fictícia)', em: emHoras(9, 0) },
      { id: `ct-${id}-2`, nome: 'Madrinha Simoni (fictícia)', vinculo: 'madrinha',
        vinculoRotulo: 'Madrinha', telefone: '51 98888-0002',
        observacao: 'Busca na escola às sextas.',
        restrito: false, motivoDaRestricao: null, ativo: true, motivoDoEncerramento: null,
        por: 'Equipe técnica (fictícia)', em: emHoras(9, 0) },
      { id: `ct-${id}-3`, nome: 'Tio Fictício', vinculo: 'tio', vinculoRotulo: 'Tia ou tio',
        telefone: '51 98888-0003', observacao: null,
        restrito: true,
        motivoDaRestricao: 'Aproximação suspensa por decisão judicial de 06/2026. '
          + 'Antes de qualquer contato, falar com a equipe técnica.',
        ativo: true, motivoDoEncerramento: null,
        por: 'Equipe técnica (fictícia)', em: emHoras(10, 30) },
    ];
  }
  return CONTATOS[id];
}

/*
 * O TRABALHO SOCIAL — os marcos de vida, no servidor de mentira.
 *
 * Números fictícios que fazem a leitura do Gestor Geral ter alguma coisa para
 * mostrar. Duas coisas são de propósito e valem mais que os números:
 *
 *  * as casas SAEM NA ORDEM DO CADASTRO, e a casa com mais conquistas não é a
 *    primeira. Se o mock ordenasse por resultado, a demonstração ensinaria um
 *    ranking que o sistema recusa a fazer;
 *  * há casa com zero conquistas registradas. Ela existe na lista para a
 *    conversa acontecer na frente de quem decide: zero aqui quer dizer que
 *    ninguém escreveu, e não que nada aconteceu.
 */
const TIPOS_DE_MARCO = [
  { cod: 'aprovacao_escolar', label: 'Passou de ano', icone: '📚' },
  { cod: 'conclusao_ensino_fundamental', label: 'Terminou o Fundamental', icone: '🎓' },
  { cod: 'conclusao_ensino_medio', label: 'Terminou o Ensino Médio', icone: '🎓' },
  { cod: 'curso_profissionalizante', label: 'Curso profissionalizante', icone: '🛠️' },
  { cod: 'certificado', label: 'Certificado', icone: '📜' },
  { cod: 'ingresso_faculdade', label: 'Entrou na faculdade', icone: '🏛️' },
  { cod: 'primeiro_emprego', label: 'Primeiro emprego', icone: '💼' },
  { cod: 'estagio', label: 'Estágio', icone: '💼' },
  { cod: 'documento_conquistado', label: 'Documento conquistado', icone: '🪪' },
  { cod: 'esporte_ou_arte', label: 'Esporte, arte ou cultura', icone: '⚽' },
  { cod: 'reinsercao_familiar', label: 'Reinserção familiar', icone: '🏠' },
  { cod: 'outro', label: 'Outro', icone: '✨' },
];

const MARCOS: any[] = [
  { id: 'mk1', acolhidoId: 'p12', acolhido: 'Miguel', casa: 'AI3', casaId: 'casa-ai3',
    tipo: 'primeiro_emprego', quando: `${HOJE.slice(0, 4)}-03-11`,
    descricao: 'Assinou a primeira carteira como jovem aprendiz na Padaria Fictícia, '
      + 'depois do curso de panificação.', instituicao: 'Padaria Fictícia',
    temComprovante: true, por: 'Tatiane Técnica (fictícia)' },
  { id: 'mk2', acolhidoId: 'p18', acolhido: 'Rafa', casa: 'AI3', casaId: 'casa-ai3',
    tipo: 'ingresso_faculdade', quando: `${HOJE.slice(0, 4)}-02-04`,
    descricao: 'Passou em Pedagogia pelo ProUni. Vai continuar na casa até completar 18.',
    instituicao: 'Faculdade Fictícia', temComprovante: true,
    por: 'Tatiane Técnica (fictícia)' },
  { id: 'mk3', acolhidoId: 'p01', acolhido: 'Alice', casa: 'AI3', casaId: 'casa-ai3',
    tipo: 'aprovacao_escolar', quando: `${Number(HOJE.slice(0, 4)) - 1}-12-18`,
    descricao: 'Passou para o 2º ano na Escola Fictícia, com reforço em leitura '
      + 'desde agosto.', instituicao: 'Escola Fictícia Municipal',
    temComprovante: false, por: 'Tatiane Técnica (fictícia)' },
  { id: 'mk4', acolhidoId: 'p09', acolhido: 'Igor', casa: 'AI3', casaId: 'casa-ai3',
    tipo: 'curso_profissionalizante', quando: `${HOJE.slice(0, 4)}-05-30`,
    descricao: 'Concluiu o curso de elétrica predial de 160 horas.',
    instituicao: 'Centro Fictício de Formação', temComprovante: true,
    por: 'Carla Coordenadora (fictícia)' },
  { id: 'mk5', acolhidoId: 'p14', acolhido: 'Nina', casa: 'AI3', casaId: 'casa-ai3',
    tipo: 'esporte_ou_arte', quando: `${HOJE.slice(0, 4)}-04-20`,
    descricao: 'Entrou no time de vôlei da escola e viajou para o intermunicipal.',
    instituicao: 'Escola Fictícia Municipal', temComprovante: false,
    por: 'Tatiane Técnica (fictícia)' },
];

/* Conquistas das outras casas, só como contagem — a demonstração não inventa
 * nome de criança de casa que não é a do piloto. */
const MARCOS_DE_OUTRAS: Record<string, number> = {
  'casa-ai1': 7, 'casa-ai2': 3, 'casa-ai4': 0,
  'casa-arm1': 2, 'casa-arm2': 4, 'casa-arm3': 1, 'casa-arm4': 2,
};
const ACOLHIDOS_POR_CASA: Record<string, number> = {
  'casa-ai1': 19, 'casa-ai2': 20, 'casa-ai4': 17,
  'casa-arm1': 8, 'casa-arm2': 7, 'casa-arm3': 9, 'casa-arm4': 6,
};

/*
 * O IMPACTO RESPONDE FORA DE `responder()`.
 *
 * Não é organização: é necessidade. `responder()` passou de seis mil linhas, e
 * quando estes quatro tratadores entraram nela o `vite build` começou a
 * estourar a memória — "JavaScript heap out of memory", com 3 GB de heap, numa
 * função que o esbuild precisa analisar inteira de uma vez. O protótipo
 * simplesmente parou de ser gerado.
 *
 * O sintoma some quebrando a função. A lição fica: o servidor de mentira
 * cresce a cada fase, e uma função única não escala — as próximas partições
 * nascem aqui fora.
 *
 * `chamar` é o próprio `responder`, passado de fora: estes tratadores montam a
 * folha a partir das MESMAS rotas que a tela usa, e não de uma segunda versão
 * dos dados.
 */
function responderImpacto(
  rota: string, seg: string[], q: URLSearchParams, b: any, metodo: string,
  ctx: {
    eu: any;
    chamar: (rota: string, seg: string[], q: URLSearchParams, b: any, metodo: string) => unknown;
    exportarFolha: (folha: any) => unknown;
  },
): unknown {
  const { eu, chamar: responder, exportarFolha } = ctx;
  {
  if (rota === '/impacto/kinds') {
    return {
      tipos: TIPOS_DE_MARCO,
      nota: 'O marco é da criança; a casa é onde ela estava. Esta tela não compara casas '
        + 'e não ordena por resultado.',
    };
    }

    if (rota === '/impacto/panorama' || rota.startsWith('/impacto/panorama?')) {
    /*
     * COM `houseId`, é a casa da própria pessoa — e aí a coordenação entra. A
     * visão das OITO continua sendo só do Gestor Geral.
     */
    const soUma = q.get('houseId');
    if (!soUma && !['gestor_geral', 'admin_tecnico'].includes(eu.role)) {
      return new Recusa(403,
        'O panorama das oito casas é do Gestor Geral. A coordenação tem o painel da casa dela.');
    }
    /* ORDEM DO CADASTRO. A casa com mais conquistas não é a primeira, e isso
     * é o que a demonstração precisa mostrar. */
    const casas = [...CASAS].sort((a, b) => a.code.localeCompare(b.code)).map((c) => ({
      id: c.id, codigo: c.code, nome: c.name,
      acolhidos: c.id === CASA.id ? todosKids().length : (ACOLHIDOS_POR_CASA[c.id] ?? 0),
      capacidade: c.id === CASA.id ? LIMITE.valor : 20,
      entradas: c.id === CASA.id ? 4 : 2,
      saidas: c.id === CASA.id ? 2 : 1,
      ocorrencias: c.id === CASA.id ? OCORRENCIAS.length : 1,
      marcos: c.id === CASA.id ? MARCOS.length : (MARCOS_DE_OUTRAS[c.id] ?? 0),
    }));
    const soUmaLista = soUma ? casas.filter((c) => c.id === soUma) : casas;
    if (soUma && !soUmaLista.length) {
      /* Casa fora do alcance é RECUSA, e não painel zerado: zero se leria
       * como "esta casa não fez nada". */
      return new Recusa(404, 'Unidade não encontrada — ou fora do seu alcance.');
    }
    const soma = (campo: string) =>
      soUmaLista.reduce((t, x: any) => t + Number(x[campo] ?? 0), 0);
    return {
      periodo: { de: `${HOJE.slice(0, 4)}-01-01`, ate: HOJE },
      casas: soUmaLista,
      total: {
        casas: soUmaLista.length, acolhidos: soma('acolhidos'), capacidade: soma('capacidade'),
        entradas: soma('entradas'), saidas: soma('saidas'),
        ocorrencias: soma('ocorrencias'), marcos: soma('marcos'),
      },
      marcosPorTipo: TIPOS_DE_MARCO
        .map((t) => ({ ...t, n: MARCOS.filter((m) => m.tipo === t.cod).length }))
        .filter((t) => t.n > 0),
      aviso: 'As casas aparecem na ordem do cadastro, e não por resultado. Este painel '
        + 'não compara casas: o número de cada uma se lê ao lado do número de acolhidos '
        + 'dela, e por quem conhece a casa.',
    };
    }

    if (rota === '/impacto/marcos' || rota.startsWith('/impacto/marcos?')) {
    if (metodo === 'POST') {
      if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
        return new Recusa(403,
          'Registrar um marco é da equipe técnica, da coordenação e do Gestor Geral.');
      }
      if (String(b.descricao ?? '').trim().length < 10) {
        return new Recusa(400,
          'Escreva o que aconteceu. O tipo já diz a categoria — esta linha é a história.');
      }
      const t = TIPOS_DE_MARCO.find((x) => x.cod === b.tipo);
      if (!t) return new Recusa(400, 'Escolha o tipo do marco.');
      MARCOS.unshift({
        id: `mk-${MARCOS.length + 1}`, acolhidoId: String(b.personId),
        acolhido: kid(String(b.personId))?.nome ?? '—', casa: CASA.code, casaId: CASA.id,
        tipo: b.tipo, quando: b.quando ?? HOJE, descricao: String(b.descricao).trim(),
        instituicao: b.instituicao || null, temComprovante: !!b.conteudo, por: eu.fullName,
      });
      return { id: MARCOS[0].id, ok: true };
    }
    const tipo = q.get('tipo');
    const pid = q.get('personId');
    return MARCOS
      .filter((m) => (!tipo || m.tipo === tipo) && (!pid || m.acolhidoId === pid))
      /* Por DATA, e nunca por criança com mais conquistas. */
      .sort((a, b2) => String(b2.quando).localeCompare(String(a.quando)))
      .map((m) => ({
        ...m,
        tipoRotulo: TIPOS_DE_MARCO.find((t) => t.cod === m.tipo)?.label ?? m.tipo,
        icone: TIPOS_DE_MARCO.find((t) => t.cod === m.tipo)?.icone ?? '✨',
      }));
    }

    /* `seg.length === 3`: sem isto, esta rota captura também
     * `/impacto/trajetoria/:id/folha` e devolve a trajetória crua no lugar da
     * folha — a tela recebe um objeto sem seções e não desenha nada, sem erro
     * nenhum na tela. */
    if (seg[0] === 'impacto' && seg[1] === 'marcos' && seg[3] === 'comprovante') {
      const m = MARCOS.find((x) => x.id === seg[2]);
      if (!m?.temComprovante) return new Recusa(404, 'Este marco não tem comprovante.');
      /* Um PDF mínimo de mentira: o que a demonstração precisa provar é que o
       * arquivo SAI, e não o conteúdo dele. */
      return { nome: 'comprovante.pdf', tipo: 'application/pdf',
               conteudo: btoa('%PDF-1.7 comprovante fictício') };
    }

    if (seg[0] === 'impacto' && seg[1] === 'trajetoria' && seg.length === 3
        && metodo === 'GET') {
    const k = kid(seg[2]);
    if (!k) return new Recusa(404, 'Acolhido não encontrado — ou fora do seu alcance.');
    return {
      acolhido: k.nome,
      acolhidoDesde: emHoras(9, 0),
      casasPorOndePassou: [{ casa: CASA.code, de: emHoras(9, 0), ate: null }],
      marcos: MARCOS.filter((m) => m.acolhidoId === k.id).map((m) => ({
        ...m,
        tipoRotulo: TIPOS_DE_MARCO.find((t) => t.cod === m.tipo)?.label ?? m.tipo,
        icone: TIPOS_DE_MARCO.find((t) => t.cod === m.tipo)?.icone ?? '✨',
      })),
      aviso: 'Esta é a linha do que foi conquistado. Saúde, ocorrências e conteúdo '
        + 'judicial não entram aqui — eles ficam nas telas do caso, com quem cuida dele.',
    };
    }

    if (rota === '/impacto/folha' || rota.startsWith('/impacto/folha?')) {
    /* A MESMA folha do servidor, montada pela MESMA função compartilhada. */
    const pan: any = responder('/impacto/panorama', ['impacto', 'panorama'], q, {}, 'GET');
    if (pan instanceof Recusa) return pan;
    const lista: any = responder('/impacto/marcos', ['impacto', 'marcos'], q, {}, 'GET');
    return folhaDoImpacto(
      pan.periodo, pan.total, pan.casas,
      pan.marcosPorTipo.map((t: any) => ({ label: t.label, n: t.n })),
      (lista as any[]).map((m) => ({
        acolhido: m.acolhido, casa: m.casa, tipoRotulo: m.tipoRotulo,
        quando: m.quando, descricao: m.descricao, instituicao: m.instituicao,
      })),
      { nome: eu.fullName, cargo: cargoNoDocumento(eu.role) },
      /* Uma casa só: o título diz qual, e o quadro "casa a casa" não entra. */
      q.get('houseId') ? `${pan.casas[0].codigo} — ${pan.casas[0].nome}` : undefined,
    );
    }

    if (seg[0] === 'impacto' && seg[1] === 'trajetoria' && seg[3] === 'folha') {
    const t: any = responder(`/impacto/trajetoria/${seg[2]}`,
      ['impacto', 'trajetoria', seg[2]], q, {}, 'GET');
    if (t instanceof Recusa) return t;
    return folhaDaTrajetoria(t.acolhido, t.acolhidoDesde, t.casasPorOndePassou,
      t.marcos.map((m: any) => ({
        tipoRotulo: m.tipoRotulo, quando: m.quando,
        descricao: m.descricao, instituicao: m.instituicao,
      })),
      { nome: eu.fullName, cargo: cargoNoDocumento(eu.role) });
  }

  if (seg[0] === 'impacto' && seg[1] === 'trajetoria' && seg[3] === 'export'
      && metodo === 'POST') {
    const f: any = responder(`/impacto/trajetoria/${seg[2]}/folha`,
      ['impacto', 'trajetoria', seg[2], 'folha'], q, {}, 'GET');
    if (f instanceof Recusa) return f;
    return exportarFolha(f);
  }

  if (rota === '/impacto/export' && metodo === 'POST') {
    const f: any = responder('/impacto/folha', ['impacto', 'folha'], q, {}, 'GET');
    if (f instanceof Recusa) return f;
    return exportarFolha(f);
    }
  }
  return undefined;
}

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
      capacidade: LIMITE.valor, ocupadas, vagas: Math.max(0, LIMITE.valor - ocupadas),
      acimaDoLimite: ocupadas > LIMITE.valor,
      podeAlterar: ['coordenador', 'gestor_geral'].includes(eu.role),
    };
  }
  /*
   * O LIMITE DA UNIDADE — motivo obrigatório, e a mudança não some.
   *
   * As oito casas nascem com 20, que é o número praticado, e até 01/09/2026
   * não havia por onde mudar: a tarja "acima do limite" da admissão apontava
   * para um teto que ninguém conseguia corrigir.
   */
  if (rota.startsWith('/houses/') && rota.endsWith('/capacity-history')
      && metodo === 'GET') {
    return MUDANCAS_DE_LIMITE;
  }
  if (rota.startsWith('/houses/') && rota.endsWith('/capacity') && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403,
        'Somente a coordenação da casa e o Gestor Geral alteram o limite.');
    }
    const nova = Number(b.capacidade);
    if (!Number.isInteger(nova) || nova < 1 || nova > 60) {
      return new Recusa(400, 'O limite precisa estar entre 1 e 60.');
    }
    if (nova === LIMITE.valor) return new Recusa(400, 'O limite informado já é o atual.');
    if (String(b.motivo ?? '').trim().length < 15) {
      return new Recusa(400,
        'Descreva o motivo da mudança de limite (mínimo 15 caracteres).');
    }
    const anterior = LIMITE.valor;
    MUDANCAS_DE_LIMITE.unshift({ de: anterior, para: nova,
      motivo: String(b.motivo).trim(), autor: eu.fullName, em: new Date().toISOString() });
    LIMITE.valor = nova;
    return { capacidade: nova, anterior,
      aviso: `Limite da unidade alterado de ${anterior} para ${nova}. A mudança fica `
        + 'registrada com o seu nome.' };
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
  /*
   * OS APARELHOS INSTITUCIONAIS (§11.7, pendência #7).
   *
   * O aparelho é uma CREDENCIAL: o código nasce no registro, aparece UMA vez,
   * e o sistema guarda só a impressão digital dele. Aqui, na demonstração, o
   * "código" é fictício e nada é conferido contra ele — o que a folha precisa
   * ensaiar é o gesto: registrar, anotar o código na hora, e revogar com
   * motivo sem apagar o histórico.
   */
  if (rota === '/devices' && metodo === 'GET') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'O cadastro de aparelhos é da coordenação.');
    }
    return APARELHOS;
  }
  if (rota === '/devices' && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'O registro de aparelhos é da coordenação.');
    }
    const institucional = !b.houseId;
    if (institucional && eu.role !== 'gestor_geral') {
      return new Recusa(403,
        'O aparelho da instituição — o que vale nas oito casas — é registrado pelo Gestor '
        + 'Geral. A coordenação registra aparelhos da própria casa, informando a casa.');
    }
    const rotulo = String(b.rotulo ?? '').trim();
    if (rotulo.length < 3) {
      return new Recusa(400,
        'Dê um nome ao aparelho — algo que a equipe reconheça na prateleira.');
    }
    if (APARELHOS.some((a) => a.ativo && a.rotulo === rotulo)) {
      return new Recusa(400, 'Já existe um aparelho com este nome nesta casa.');
    }
    const id = uid();
    APARELHOS.unshift({
      id, rotulo, ativo: true,
      escopo: institucional ? 'instituicao' : 'casa',
      registradoEm: new Date().toISOString(),
      revogadoEm: null, motivoRevogacao: null, ultimoUso: null,
    });
    return {
      id, rotulo, escopo: institucional ? 'instituicao' : 'casa',
      // Fictício de propósito, e com o formato do de verdade: quem ensaia
      // precisa ver que é longo o bastante para não ser digitado de cabeça.
      token: `demo-${uid()}${uid()}`.replace(/-/g, '').slice(0, 40),
      aviso: 'Guarde este código no aparelho agora: ele é mostrado uma única vez. O sistema '
        + 'conserva apenas a impressão digital dele — se perder, registre outro aparelho e '
        + 'revogue este.',
    };
  }
  if (seg[0] === 'devices' && seg[2] === 'revoke' && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'A revogação de aparelhos é da coordenação.');
    }
    const alvo = APARELHOS.find((a) => a.id === seg[1]);
    if (!alvo) return new Recusa(404, 'Aparelho não encontrado.');
    // Revogado NÃO some da lista: as doses que ele confirmou continuam
    // rastreáveis, e apagá-lo transformaria cada uma num aparelho desconhecido.
    alvo.ativo = false;
    alvo.revogadoEm = new Date().toISOString();
    alvo.motivoRevogacao = String(b.motivo ?? '').trim() || null;
    return { ok: true,
      aviso: 'Aparelho revogado. O registro permanece: as confirmações feitas por ele '
        + 'continuam rastreáveis.' };
  }

  /*
   * SINCRONIZAÇÃO (§17).
   *
   * A demonstração começa com UM conflito em aberto, e ele é o caso real que a
   * regra do §17.4 existe para tratar: a mesma dose confirmada duas vezes —
   * uma pelo tablet que estava sem sinal e subiu depois, outra pelo aparelho
   * que tinha rede. Nenhuma das duas está "errada"; o que resolve é a frase
   * que a equipe escreve, e é ela que fica ao lado das duas versões.
   */
  if (rota === '/sync/status' && metodo === 'GET') {
    return {
      aplicadas: 12,
      conflitos: CONFLITOS.filter((c) => c.aberto).length,
      ultimaSincronizacao: emHoras(7, 10),
      /* A lista vem do arquivo compartilhado, e não escrita à mão aqui: a
       * versão anterior anunciava `check.confirm`, que o servidor não sabe
       * aplicar, e omitia `activity.acknowledge` e `health.evolution`, que
       * ele sabe. Servidor de mentira que responde melhor (ou pior) que o
       * servidor ensaia um sistema que não existe. */
      tiposSuportados: [...TIPOS_OFFLINE_KINDS],
    };
  }

  /*
   * A CHEGADA DA FILA LOCAL (§17.1).
   *
   * Responde como o servidor responde, e não como a tela gostaria: cada
   * operação recebe um destino, e `podeLimpar` traz SÓ o que foi aplicado.
   * O aparelho apaga por essa lista — se ela viesse cheia por educação, o
   * protótipo ensinaria a equipe a confiar num apagamento que o sistema real
   * não faz (§17.2).
   */
  if (rota === '/sync/push' && metodo === 'POST') {
    const ops: any[] = Array.isArray(b.operacoes) ? b.operacoes : [];
    if (!ops.length) return new Recusa(400, 'Nada a sincronizar.');
    const resultados = ops.map((op) => {
      const tipo = TIPOS_OFFLINE.find((t) => t.kind === op.kind);
      if (!tipo) {
        return { clientOpId: op.clientOpId, status: 'rejeitada', motivo: 'tipo de operação desconhecido' };
      }
      // 0930: confirmação de dose não se guarda sem sinal, em aparelho nenhum.
      if (tipo.foraDaFilaOffline) {
        return { clientOpId: op.clientOpId, status: 'rejeitada',
                 motivo: 'Sem internet não dá para confirmar remédio: a mesma dose poderia ser '
                   + 'confirmada em dois aparelhos. Confirme quando o sinal voltar.' };
      }
      return { clientOpId: op.clientOpId, status: 'aplicada' };
    });
    return {
      recebidas: ops.length,
      resultados,
      podeLimpar: resultados.filter((r) => ['aplicada', 'duplicada'].includes(r.status))
        .map((r) => r.clientOpId),
      sincronizadoEm: new Date().toISOString(),
    };
  }
  if (rota.startsWith('/sync/conflicts') && metodo === 'GET') {
    return CONFLITOS.filter((c) => c.aberto).map(({ aberto, ...resto }) => ({
      ...resto,
      aviso: 'O sistema não escolhe a versão correta. Ambas permanecem registradas.',
    }));
  }
  if (seg[0] === 'sync' && seg[1] === 'conflicts' && seg[3] === 'resolve'
      && metodo === 'POST') {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403,
        'Somente equipe técnica e coordenação resolvem conflitos de sincronização.');
    }
    const alvo = CONFLITOS.find((c) => c.id === seg[2] && c.aberto);
    if (!alvo) return new Recusa(404, 'Conflito não encontrado ou já resolvido.');
    if (!String(b.decisao ?? '').trim()) {
      return new Recusa(400, 'Descreva a decisão e o motivo.');
    }
    // Resolver é registrar a decisão: nenhuma das duas versões é apagada.
    alvo.aberto = false;
    return { ok: true,
      aviso: 'Decisão registrada. As versões originais permanecem preservadas.' };
  }

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
  /*
   * O PAINEL DAS UNIDADES (§18.1–§18.3).
   *
   * A ordem é a do CÓDIGO da casa, como no servidor, e nunca a do número:
   * ordenar por ocorrências vira cobrança sobre quem registra mais (§3.3).
   *
   * A Casa 03 é a única com dados de verdade na demonstração; as outras sete
   * aparecem com o que se sabe delas — existir, e ter um teto. Inventar
   * números para as sete faria a demonstração ensinar comparação entre casas,
   * que é exatamente o que o painel recusa.
   */
  if (rota === '/reports/panel' && metodo === 'GET') {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'O painel das unidades é da equipe técnica, da coordenação e do '
        + 'Gestor Geral.');
    }
    const oitoCasas = ['gestor_geral'].includes(eu.role);
    return (oitoCasas ? CASAS : [CASA]).map((c) => {
      const daCasa = c.id === CASA.id;
      const ativos = daCasa ? todosKids().length : 0;
      return {
        id: c.id, codigo: c.code, nome: c.name,
        // Só a Casa 03 tem dados de verdade na demonstração; o limite das
        // outras sete é o número praticado, e mudar o desta não mexe no delas.
        ocupacao: { ativos, limite: daCasa ? LIMITE.valor : 20,
                    acimaDoLimite: ativos > (daCasa ? LIMITE.valor : 20) },
        entradas30d: daCasa ? NOVOS.length : 0,
        transferenciasAguardando: daCasa
          ? TRANSFERENCIAS.filter((t) => t.caixa === 'recebida' && t.situacao === 'solicitada').length
          : 0,
        acompanhamentosAbertos: daCasa
          ? ACOMPANHAMENTOS.filter((f) => f.situacao !== 'aprovado').length : 0,
        arquivoComFalha: daCasa ? ARQUIVO.filter((a) => a.estado === 'falhou').length : 0,
      };
    });
  }
  if (rota.startsWith('/reports/house-monthly') && metodo === 'GET') {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'O quadro do mês é da equipe técnica, da coordenação e do '
        + 'Gestor Geral.');
    }
    const mesPedido = q.get('mes') ?? '';
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(mesPedido)) {
      return new Recusa(400, 'Informe o mês no formato AAAA-MM.');
    }
    const daCasa = (q.get('houseId') ?? CASA.id) === CASA.id;
    // Mês que não é o corrente volta sem registro — e a folha diz que isso não
    // é fato negativo, que é o ponto do §14.6.
    const corrente = mesPedido.slice(0, 7) === new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
    }).format(new Date()).slice(0, 7);
    const cheio = daCasa && corrente;
    return {
      mes: mesPedido.slice(0, 7),
      ocupacao: { ativosHoje: daCasa ? todosKids().length : 0 },
      fluxo: { entradas: cheio ? NOVOS.length : 0, saidas: cheio ? ACERVO.length : 0 },
      'ocorrências': cheio ? OCORRENCIAS.length : 0,
      acompanhamentos: {
        aprovados: cheio ? ACOMPANHAMENTOS.filter((f) => f.situacao === 'aprovado').length : 0,
        abertos: cheio ? ACOMPANHAMENTOS.filter((f) => f.situacao !== 'aprovado').length : 0,
      },
      atasFechadas: cheio ? 1 : 0,
      documentosArquivados: cheio ? ARQUIVO.filter((a) => a.estado === 'verificado').length : 0,
      nota: 'Contagens do mês. Nenhum número aqui classifica casas, equipes ou acolhidos, e '
        + 'ausência de registro não é fato negativo (§3.3, §14.6).',
    };
  }
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

  /*
   * O PAINEL DA CASA — a visão dos 20 (§9). Uma linha por criança, em ORDEM
   * ALFABÉTICA: ordenar por pendência produziria a mesma lista de crianças no
   * topo todo dia, que é ranking de acolhido (§3.3).
   */
  if (rota.startsWith('/timeline/house-panel')) {
    const agora = new Date().toISOString();
    const porPessoa = new Map<string, typeof LINHA>();
    const coletivos: typeof LINHA = [];
    for (const e of LINHA) {
      if (!e.personId) { coletivos.push(e); continue; }
      porPessoa.set(e.personId, [...(porPessoa.get(e.personId) ?? []), e]);
    }
    return {
      data: HOJE, incompleta: false, fontesIndisponiveis: [],
      coletivos: coletivos.map((e) => ({
        titulo: e.title, horario: e.at, estado: e.state, severidade: e.severity })),
      acolhidos: [...porPessoa.entries()].map(([id, eventos]) => {
        const proxima = eventos.find((e) => e.at >= agora) ?? null;
        const ultimo = [...eventos].reverse().find((e) => e.at < agora) ?? null;
        const criticos = eventos.filter((e) => e.severity === 'critico');
        return {
          acolhidoId: id,
          nome: kid(id)?.nome ?? '—',
          situacaoAtual: ultimo?.state ?? 'Sem registro hoje',
          ultimoRegistro: ultimo
            ? { titulo: ultimo.title, horario: ultimo.at, estado: ultimo.state } : null,
          proximaAtividade: proxima ? { titulo: proxima.title, horario: proxima.at } : null,
          pendencias: criticos.length,
          alertaEssencial: criticos[0]?.title ?? null,
        };
      }).sort((a, b) => a.nome.localeCompare(b.nome)),
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
    /*
     * Quem está internado sai da chamada — e quem JÁ FOI marcado antes de ser
     * internado continua na lista, como no servidor: o registro de quem foi
     * olhado não some.
     */
    const linhas = todosKids()
      .filter((p) => !estaInternado(p.id) || k.resultados[p.id])
      .map((p) => {
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

  // ------------------------------------------------------------------ ATA
  /*
   * A ATA DO TURNO ANTERIOR (0970). Palavra fixa ANTES de `/shifts/:id`: os
   * dois roteadores decidem por segmento, e trocar a ordem faria a consulta
   * virar busca de um plantão chamado "anterior".
   */
  if (rota.startsWith('/shifts/anterior') && metodo === 'GET') {
    const anterior = PLANTOES.find((p) => p.id === 's0');
    if (!anterior) {
      return { existe: false,
        aviso: 'Ainda não há plantão anterior registrado nesta casa. O primeiro turno a fechar '
          + 'é o que a próxima equipe vai ler.' };
    }
    return { existe: true, ...(responder(`/shifts/${anterior.id}`, ['shifts', anterior.id],
                                          q, {}, 'GET') as object) };
  }
  if (seg[0] === 'shifts' && seg[1] === 'ata' && seg[3] === 'notes' && metodo === 'POST') {
    const texto = String(b.texto ?? '').trim();
    if (texto.length < 3) return new Recusa(400, 'Escreva a linha antes de registrar.');
    const restrita = b.restrita === true;
    if (restrita && !LE_RESTRITA.includes(eu.role)) {
      return new Recusa(403, 'A linha restrita é da coordenação, da equipe técnica e dos '
        + 'líderes — quem escreve uma linha precisa poder relê-la depois.');
    }
    LINHAS_ATA.push({ id: uid(), ataId: seg[2], autorId: eu.id, quem: eu.fullName,
      cargo: eu.role, texto, restrita,
      quando: new Date().toISOString(), escritaEm: new Date().toISOString() });
    return { id: 'ln',
      aviso: restrita
        ? 'Linha registrada, restrita à coordenação, à equipe técnica e aos líderes. Quem não a '
          + 'alcança vê que ela existe, e não o que ela diz.'
        : 'Linha registrada com o seu nome. Ela não é reescrita: para corrigir, escreva outra.' };
  }

  // ---------------------------------------------------------------- ESCALA
  /*
   * A ESCALA (§5.12). Palavra fixa ANTES do `:id`, como no servidor: os dois
   * roteadores decidem por segmento, e `/escala/folha` cairia em
   * `/escala/:id/...` se a ordem se invertesse — foi o defeito da fase 60 no
   * mock, e o do arquivo das ATAS antes dele.
   */
  if (rota.startsWith('/escala/folha') && metodo === 'GET') {
    const de = String(q.get('de') ?? HOJE);
    const ate = String(q.get('ate') ?? HOJE);
    return folhaDaEscala({
      casa: `${CASA.code} — ${CASA.name}`,
      de, ate,
      linhas: linhasDaEscalaParaFolha(de, ate),
      autor: { nome: eu.fullName, cargo: cargoNoDocumento(eu.role) },
    });
  }
  if (rota === '/escala/export' && metodo === 'POST') {
    const finalidade = String(b.finalidade ?? '').trim();
    if (finalidade.length < 10) {
      return new Recusa(400, 'Descreva a finalidade da exportação (mínimo 10 caracteres).');
    }
    const de = String(b.de ?? HOJE);
    const ate = String(b.ate ?? HOJE);
    const folha = folhaDaEscala({
      casa: `${CASA.code} — ${CASA.name}`, de, ate,
      linhas: linhasDaEscalaParaFolha(de, ate),
      autor: { nome: eu.fullName, cargo: cargoNoDocumento(eu.role) },
    });
    return {
      nomeArquivo: nomeDaFolha(folha.titulo),
      conteudoBase64: gerarDocx(folha, timbreEmBytes()),
      aviso: 'Escala exportada em Word. A saída fica registrada com o seu nome, a finalidade e '
        + 'o horário.',
    };
  }
  if (rota.startsWith('/escala') && metodo === 'GET') {
    const de = String(q.get('de') ?? HOJE);
    const ate = String(q.get('ate') ?? HOJE);
    return escalaDoPeriodo(de, ate);
  }
  if (rota === '/escala' && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Quem monta a escala da casa é a coordenação dela.');
    }
    if (b.repetirACada && !b.ate) {
      return new Recusa(400, 'Para repetir, diga até quando — uma repetição sem fim escreveria '
        + 'plantão para sempre.');
    }
    const quem = EQUIPE_CASA.find((m) => m.id === String(b.userId ?? ''));
    if (!quem) return new Recusa(400, 'Esta pessoa não está ativa no sistema.');
    const passo = Number(b.repetirACada ?? 0);
    let data = String(b.data);
    let criadas = 0; let jaExistiam = 0;
    for (;;) {
      const existe = ESCALA.some((x) => x.data === data && x.turno === b.turno
        && x.userId === quem.id && !x.revogadaEm);
      if (existe) { jaExistiam++; } else {
        ESCALA.push({ id: uid(), userId: quem.id, quem: quem.nome, cargo: quem.cargo,
          data, turno: b.turno === 'noturno' ? 'noturno' : 'diurno',
          inicio: b.inicio ? String(b.inicio) : null, fim: b.fim ? String(b.fim) : null,
          nota: b.nota ? String(b.nota) : null,
          revogadaEm: null, motivoRevogacao: null, revogadaPor: null });
        criadas++;
      }
      if (!passo || !b.ate) break;
      const d = new Date(`${data}T12:00:00-03:00`);
      d.setDate(d.getDate() + passo);
      data = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      if (data > String(b.ate)) break;
    }
    return { criadas, jaExistiam,
      aviso: jaExistiam > 0
        ? `${criadas} plantão(ões) escalado(s). ${jaExistiam} já existia(m) e ficou(aram) como `
          + 'está(vam) — escalar de novo não duplica.'
        : `${criadas} plantão(ões) escalado(s).` };
  }
  if (seg[0] === 'escala' && seg[2] === 'revogar' && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Quem monta a escala da casa é a coordenação dela.');
    }
    const alvo = ESCALA.find((x) => x.id === seg[1]);
    if (!alvo) return new Recusa(404, 'Plantão não encontrado na escala.');
    if (alvo.revogadaEm) {
      return { ok: true, mudou: false, aviso: 'Este plantão já havia sido retirado da escala.' };
    }
    const motivo = String(b.motivo ?? '').trim();
    if (alvo.data < HOJE && motivo.length < 10) {
      return new Recusa(400, 'Este plantão já passou. Escreva por que a escala dele muda — é ela '
        + 'que responde quem estava na casa naquela noite.');
    }
    alvo.revogadaEm = new Date().toISOString();
    alvo.motivoRevogacao = motivo || null;
    alvo.revogadaPor = eu.fullName;
    return { ok: true, mudou: true,
      aviso: 'Plantão retirado da escala. A linha continua registrada, com o seu nome e o '
        + 'horário — é ela que responde, meses depois, quem estava escalado naquela noite.' };
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
      /*
       * OS REMÉDIOS DO TURNO (0940), como o servidor devolve. A demonstração
       * precisa mostrar a dose SEM RESPOSTA, que é o caso que motivou o
       * bloco: se aqui viesse tudo confirmado, a passagem pareceria uma tela
       * a mais, e não a hora em que a casa percebe o esquecimento.
       */
      remedios: remediosDoTurno(s.turno),
      /* As linhas da ATA, com autor — e a restrita filtrada pelo CARGO, como o
         servidor filtra pela política (regra 14). */
      linhas: linhasDaAta(ataDo(s.id).id, eu.role),
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
    /* A MESMA RECUSA DO SERVIDOR (0940, regra 14): dose sem resposta no turno
       exige a frase. O servidor de mentira que aceitasse aqui ensinaria a
       equipe a assinar sem escrever, e a demonstração mentiria sobre a única
       cobrança nova desta tela. */
    const rem = remediosDoTurno(s.turno);
    if (rem.exigeFrase && String(b.medicacao ?? '').trim().length < 10) {
      const quais = rem.doses.filter((d) => d.semResposta)
        .map((d) => `${d.medicamento} (${d.acolhido})`).join(', ');
      return new Recusa(400,
        `${rem.semResposta === 1 ? 'Uma dose deste turno ficou' : `${rem.semResposta} doses deste turno ficaram`}`
        + ` sem resposta: ${quais}. Escreva o que aconteceu antes de assinar — quem deu o `
        + 'remédio ainda está na casa agora, e amanhã ninguém vai saber dizer.');
    }
    const tardia = !!b.happenedAt;
    s.passagens = [...s.passagens, {
      id: uid(), quem: eu.fullName, cargo: eu.role, userId: eu.id,
      contribuicoes: b.contribuicoes || null, pendencias: b.pendencias || null,
      orientacoes: b.orientacoes || null, medicacao: b.medicacao || null,
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
      /* Onde ela está — o FATO e o lugar, para todo mundo da casa. Nunca o
       * motivo, que continua atrás do alcance da internação. */
      noHospital: INTERNACOES.find(
        (i) => i.acolhidoId === k.id && i.status === 'em_andamento')?.hospital,
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
  /* CORRIGIR O CADASTRO (§6.2). Antes do ramo `:id`, e com o mesmo caminho do
     servidor: motivo obrigatório, campo que não mudou não vira correção. */
  if (seg[0] === 'people' && seg[2] === 'corrigir-identificacao' && metodo === 'POST') {
    const k = kid(seg[1]);
    if (!k) return new Recusa(404, 'Acolhido não encontrado — ou fora do seu alcance.');
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Corrigir a identificação é da equipe técnica e da coordenação.');
    }
    if (String(b.motivo ?? '').trim().length < 10) {
      return new Recusa(400,
        'Escreva por que o cadastro está sendo corrigido. Quem ler o caso daqui a um ano '
        + 'precisa saber por que o nome mudou — "erro" não explica nada.');
    }
    if (b.nome !== undefined && String(b.nome).trim().length < 2) {
      return new Recusa(400,
        'Nome civil e data de nascimento não podem ficar em branco. Se o que está lá é '
        + 'provisório, corrija para o que a certidão diz.');
    }
    const trocas: [string, string, string | null, string | null][] = [];
    /* Os três da lista da casa passam pela MESMA porta do nome — com motivo,
     * e deixando o que constava antes. */
    for (const [campo, rotulo, chave] of [
      ['rg', 'RG', 'rg'], ['cns', 'Cartão SUS', 'cns'], ['filiacao', 'Filiação', 'filiacao'],
    ] as const) {
      const enviado = (b as any)[campo];
      const atual = (k as any)[chave] ?? null;
      if (enviado !== undefined && (enviado || null) !== atual) {
        trocas.push([chave, rotulo, atual, enviado ? String(enviado) : null]);
        (k as any)[chave] = enviado ? String(enviado) : undefined;
      }
    }
    if (b.nome !== undefined && String(b.nome).trim() !== k.civil) {
      trocas.push(['full_name', 'Nome civil', k.civil, String(b.nome).trim()]);
      k.civil = String(b.nome).trim();
    }
    if (b.nomeSocial !== undefined && (b.nomeSocial ?? '') !== k.nome) {
      trocas.push(['social_name', 'Nome social', k.nome, b.nomeSocial ? String(b.nomeSocial) : null]);
      k.nome = b.nomeSocial ? String(b.nomeSocial) : k.civil;
    }
    if (b.nascimento !== undefined && String(b.nascimento) !== k.nascimento) {
      trocas.push(['birth_date', 'Data de nascimento', k.nascimento, String(b.nascimento)]);
      k.nascimento = String(b.nascimento);
      k.idade = new Date().getFullYear() - Number(String(b.nascimento).slice(0, 4));
    }
    if (!trocas.length) {
      return { corrigidos: 0,
        aviso: 'Nada mudou: o que você enviou é igual ao que já estava. Nenhuma correção foi '
          + 'registrada — uma lista de correções cheia de linhas iguais é uma lista que '
          + 'ninguém lê.' };
    }
    for (const [, campo, antes, depois] of trocas) {
      CORRECOES.unshift({ id: uid(), personId: k.id, campo, antes, depois,
        motivo: String(b.motivo).trim(), por: eu.fullName, quando: new Date().toISOString() });
    }
    return { corrigidos: trocas.length,
      aviso: `${trocas.length} campo(s) corrigido(s). O que estava antes continua registrado, `
        + 'com o seu nome, o horário e o motivo — e aparece no perfil para quem cuida da criança.' };
  }
  if (seg[0] === 'people' && seg[2] === 'correcoes' && metodo === 'GET') {
    return CORRECOES.filter((c) => c.personId === seg[1]);
  }
  /* O que o perfil dizia antes (§6.4, migração 0850). Lê quem alcança a
     criança — inclusive o educador, que é quem age sobre o texto novo. */
  if (seg[0] === 'people' && seg[2] === 'detalhe-historico' && metodo === 'GET') {
    return ALTERACOES.filter((a) => a.personId === seg[1]);
  }
  if (seg[0] === 'people' && seg[2] === 'judicial' && metodo === 'PATCH') {
    const k = kid(seg[1]);
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Somente equipe técnica e coordenação atualizam a área judicial.');
    }
    if (!k?.judicial) return new Recusa(404, 'Não encontrado.');
    // A atualização vale para o acolhimento EM CURSO; o motivo e a medida são
    // do episódio e não se editam por aqui.
    for (const campo of ['vara', 'processo', 'guia', 'situacao', 'observacoes']) {
      if (b[campo] !== undefined) JUDICIAL_EXTRA[campo] = b[campo] ? String(b[campo]) : null;
    }
    return { atualizado: true };
  }
  if (seg[0] === 'people' && seg[2] === 'judicial') {
    const k = kid(seg[1]);
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Seu cargo não tem acesso a este conteúdo.');
    }
    if (!k?.judicial) return new Recusa(404, 'Não encontrado.');
    return { ...k.judicial, situacao: 'Em acompanhamento', observacoes: null,
             ...JUDICIAL_EXTRA };
  }
  /* ATUALIZAR O QUE É DESCRIÇÃO (§6.4). Vem ANTES do ramo de leitura, que casa
     com o mesmo caminho: o verbo é o que separa os dois. Não pede motivo — o
     que fica é o rastro do que estava escrito antes. */
  if (seg[0] === 'people' && seg.length === 2 && metodo === 'PATCH') {
    const k = kid(seg[1]);
    if (!k) return new Recusa(404, 'Perfil não encontrado — ou fora do seu alcance.');
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Educadores não alteram dados estruturais do perfil.');
    }
    const atual = detalheDe(k);
    let n = 0;
    for (const campo of Object.keys(ROTULO_DETALHE)) {
      if (b[campo] === undefined) continue;
      const novo = String(b[campo] ?? '').trim() || null;
      if (novo === atual[campo]) continue;   // campo que não mudou não vira linha
      ALTERACOES.unshift({ id: uid(), personId: k.id, campo: ROTULO_DETALHE[campo],
        antes: atual[campo], depois: novo, por: eu.fullName,
        quando: new Date().toISOString() });
      DETALHE[k.id] = { ...(DETALHE[k.id] ?? {}), [campo]: novo };
      n += 1;
    }
    if (n === 0) {
      return { ok: true, alterado: 0,
        aviso: 'Nada mudou: o que você enviou é igual ao que já estava.' };
    }
    return { ok: true, alterado: n,
      aviso: `${n} campo(s) atualizado(s). O que estava antes continua registrado, com o seu `
        + 'nome e o horário, e aparece no perfil para quem cuida da criança.' };
  }
  if (rota === '/nursing/hospitalizations/kinds') {
    return {
      tiposDeNota: TIPOS_DE_NOTA_INT,
      desfechos: [
        { cod: 'alta', label: 'Alta — volta para a casa' },
        { cod: 'transferencia_hospitalar', label: 'Transferência para outro hospital' },
        { cod: 'obito', label: 'Óbito' },
      ],
      nota: 'O relato diário não é obrigatório e não vira pendência de ninguém. '
        + 'Ele existe porque a equipe visita todo dia, e o que foi visto lá se perde '
        + 'se não for escrito no mesmo dia.',
    };
  }

  if (rota === '/nursing/hospitalizations' || rota.startsWith('/nursing/hospitalizations?')) {
    if (metodo === 'GET') {
      if (!QUEM_VE_INT.includes(eu.role)
          && !INTERNACOES.some((i) => i.acompanhantes.some((a: any) => a.quem === eu.fullName))) {
        return new Recusa(403, 'A internação não é do educador social.');
      }
      const todas = q.get('encerradas') === '1';
      return INTERNACOES.filter((i) => todas || i.status === 'em_andamento').map(resumoInternacao);
    }
    if (metodo === 'POST') {
      if (!QUEM_ABRE_INT.includes(eu.role)) {
        return new Recusa(403,
          'Abrir e encerrar internação é da equipe técnica e da coordenação.');
      }
      if (!String(b.hospital ?? '').trim()) {
        return new Recusa(400, 'Escreva em que hospital a criança está.');
      }
      if (String(b.motivo ?? '').trim().length < 10) {
        return new Recusa(400,
          'Escreva por que a criança foi internada. Quem ler daqui a um ano precisa '
          + 'saber o que aconteceu — "internação" não explica nada.');
      }
      if (estaInternado(String(b.personId))) {
        return new Recusa(400,
          'Esta criança já tem uma internação aberta. Encerre a anterior antes.');
      }
      INTERNACOES.unshift({
        id: `int-${proximaInternacao++}`, acolhidoId: String(b.personId),
        hospital: String(b.hospital).trim(), motivo: String(b.motivo).trim(),
        desde: new Date().toISOString(), ate: null, status: 'em_andamento', desfecho: null,
        abertaPor: eu.fullName, encerradaPor: null, observacaoDoDesfecho: null,
        diario: [], medicacaoNoHospital: [], acompanhantes: [],
      });
      return {
        id: INTERNACOES[0].id,
        aviso: 'Internação aberta. A criança sai da chamada e da grade de medicação da '
          + 'casa enquanto estiver internada, e continua ocupando a vaga. As doses que '
          + 'estavam previstas não foram apagadas nem marcadas como não administradas — '
          + 'o sistema não conclui o que não viu.',
      };
    }
  }

  if (seg[0] === 'nursing' && seg[1] === 'hospitalizations' && seg.length >= 3) {
    const i = INTERNACOES.find((x) => x.id === seg[2]);
    if (!i) return new Recusa(404, 'Internação não encontrada — ou fora do seu alcance.');
    const souAcompanhante = i.acompanhantes.some((a: any) => a.quem === eu.fullName);
    if (!QUEM_VE_INT.includes(eu.role) && !souAcompanhante) {
      return new Recusa(403, 'A internação não é do educador social.');
    }

    if (seg.length === 3 && metodo === 'GET') {
      return { ...resumoInternacao(i), observacaoDoDesfecho: i.observacaoDoDesfecho,
               encerradaPor: i.encerradaPor, diario: i.diario,
               medicacaoNoHospital: i.medicacaoNoHospital, acompanhantes: i.acompanhantes };
    }
    if (seg[3] === 'notes' && metodo === 'POST') {
      if (!String(b.texto ?? '').trim()) {
        return new Recusa(400,
          'Escreva o que aconteceu. O anexo sozinho, daqui a um ano, não diz o que foi feito.');
      }
      const tipo = String(b.tipo ?? 'relato');
      i.diario.unshift({
        id: `nota-${i.diario.length + 1}`, dia: HOJE, tipo,
        tipoRotulo: TIPOS_DE_NOTA_INT.find((t) => t.cod === tipo)?.label ?? tipo,
        texto: String(b.texto).trim(), temAnexo: !!b.conteudo,
        nomeDoArquivo: b.nomeArquivo ?? null, por: eu.fullName,
        em: new Date().toISOString(),
      });
      return { ok: true };
    }
    if (seg[3] === 'notes' && seg[5] === 'anexo' && metodo === 'GET') {
      const n = i.diario.find((x: any) => x.id === seg[4]);
      if (!n?.temAnexo) return new Recusa(404, 'Este registro não tem anexo.');
      return { nome: n.nomeDoArquivo ?? 'documento.pdf', tipo: 'application/pdf',
               conteudo: btoa('%PDF-1.7 documento do hospital, fictício') };
    }

    if (seg[3] === 'medications' && metodo === 'POST') {
      if (!String(b.medicamento ?? '').trim()) {
        return new Recusa(400, 'Escreva qual medicamento o hospital administrou.');
      }
      i.medicacaoNoHospital.unshift({
        id: `intmed-${i.medicacaoNoHospital.length + 1}`, quando: new Date().toISOString(),
        medicamento: String(b.medicamento).trim(), dose: b.dose || null, via: b.via || null,
        observacao: b.observacao || null,
        /* A origem vai SEMPRE escrita, como no servidor. */
        origem: 'Administrada pelo hospital', registradoPor: eu.fullName,
      });
      return { ok: true,
        aviso: 'Registrado como administrado PELO HOSPITAL. Ele entra no histórico de '
          + 'saúde da criança com essa origem, e não na grade da casa.' };
    }
    if (seg[3] === 'companion' && metodo === 'POST') {
      if (!QUEM_ABRE_INT.includes(eu.role)) {
        return new Recusa(403, 'Designar acompanhante é da equipe técnica e da coordenação.');
      }
      for (const a of i.acompanhantes) if (!a.ate) a.ate = HOJE;
      /* A tela manda `userId`; o mock traduz para o nome, como o servidor faz
       * com `app_user_display_name`. */
      const escolhido = EQUIPE_CASA.find((m: any) => m.id === b.userId);
      i.acompanhantes.unshift({
        id: `acomp-${i.acompanhantes.length + 1}`,
        quem: escolhido?.nome ?? String(b.quem ?? 'Educador (fictício)'), de: HOJE, ate: null,
        observacao: b.observacao || null, designadoPor: eu.fullName,
      });
      return { ok: true };
    }
    if (seg[3] === 'close' && metodo === 'POST') {
      if (!QUEM_ABRE_INT.includes(eu.role)) {
        return new Recusa(403,
          'Abrir e encerrar internação é da equipe técnica e da coordenação.');
      }
      if (!['alta', 'transferencia_hospitalar', 'obito'].includes(String(b.desfecho))) {
        return new Recusa(400, 'Informe como a internação terminou.');
      }
      i.status = 'encerrada';
      i.ate = new Date().toISOString();
      i.desfecho = String(b.desfecho);
      i.observacaoDoDesfecho = b.observacao || null;
      i.encerradaPor = eu.fullName;
      return { ok: true,
        aviso: b.desfecho === 'alta'
          ? 'Internação encerrada. A criança volta à chamada, à grade e à rotina da casa a '
            + 'partir de hoje. Confira com a Enfermagem se a medicação mudou no hospital.'
          : 'Internação encerrada.' };
    }
  }

  if (rota === '/people/contacts/kinds') {
    return {
      vinculos: [
        { code: 'genitora', label: 'Genitora' }, { code: 'genitor', label: 'Genitor' },
        { code: 'irmao', label: 'Irmão ou irmã' }, { code: 'avo', label: 'Avó ou avô' },
        { code: 'tio', label: 'Tia ou tio' }, { code: 'padrinho', label: 'Padrinho' },
        { code: 'madrinha', label: 'Madrinha' },
        { code: 'vinculo_comunitario', label: 'Vínculo comunitário' },
        { code: 'servico_da_rede', label: 'Serviço da rede' },
        { code: 'outro', label: 'Outro' },
      ],
      nota: 'O vínculo diz quem é, não quem vale mais. Contato com aproximação suspensa '
        + 'entra marcado, com o motivo — quem descobre isso às 23h descobre tarde.',
    };
  }

  if (seg[0] === 'people' && seg[2] === 'contacts' && metodo === 'GET') {
    return contatosDe(seg[1]);
  }

  if (seg[0] === 'people' && seg[2] === 'contacts' && metodo === 'POST') {
    // A MESMA recusa do servidor: o educador lê e não escreve.
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403,
        'Escrever no cadastro de contatos é da equipe técnica e da coordenação.');
    }
    if (!String(b.nome ?? '').trim()) {
      return new Recusa(400, 'Escreva o nome de quem é este contato.');
    }
    if (b.restrito && String(b.motivoDaRestricao ?? '').trim().length < 10) {
      return new Recusa(400,
        'Escreva por que este contato tem aproximação restrita. Quem ler às 23h '
        + 'precisa saber se ainda vale.');
    }
    const rotulos: Record<string, string> = {
      genitora: 'Genitora', genitor: 'Genitor', irmao: 'Irmão ou irmã', avo: 'Avó ou avô',
      tio: 'Tia ou tio', padrinho: 'Padrinho', madrinha: 'Madrinha',
      vinculo_comunitario: 'Vínculo comunitário', servico_da_rede: 'Serviço da rede',
    };
    const novoContato = {
      id: `ct-novo-${proximoContato++}`, nome: String(b.nome).trim(),
      vinculo: b.vinculo,
      vinculoRotulo: b.vinculo === 'outro' ? String(b.vinculoOutro ?? 'Outro')
        : (rotulos[String(b.vinculo)] ?? String(b.vinculo)),
      telefone: b.telefone || null, observacao: b.observacao || null,
      restrito: !!b.restrito, motivoDaRestricao: b.restrito ? String(b.motivoDaRestricao) : null,
      ativo: true, motivoDoEncerramento: null,
      por: eu.fullName, em: new Date().toISOString(),
    };
    contatosDe(seg[1]).unshift(novoContato);
    return { id: novoContato.id, ok: true };
  }

  if (seg[0] === 'people' && seg[1] === 'contacts' && seg[3] === 'end' && metodo === 'POST') {
    if (String(b.motivo ?? '').trim().length < 5) {
      return new Recusa(400, 'Escreva por que este contato não vale mais.');
    }
    for (const lista of Object.values(CONTATOS)) {
      const c = lista.find((x) => x.id === seg[2]);
      /* Encerra, não apaga: o telefone que deixou de valer é informação. */
      if (c) { c.ativo = false; c.motivoDoEncerramento = String(b.motivo).trim(); return { ok: true }; }
    }
    return new Recusa(404, 'Contato não encontrado — ou já encerrado.');
  }

  if (seg[0] === 'people' && seg[2] === 'photo' && metodo === 'GET') {
    const k = kid(seg[1]);
    if (!k?.foto) return new Recusa(404, 'Este acolhido ainda não tem foto.');
    return { nome: 'identificacao', tipo: 'image/png', conteudo: k.foto };
  }

  if (seg[0] === 'people' && seg[2] === 'photo' && metodo === 'POST') {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403,
        'A foto de identificação é cadastrada pela técnica ou pela coordenação.');
    }
    const k = kid(seg[1]);
    if (!k) return new Recusa(404, 'Acolhido não encontrado — ou fora do seu alcance.');
    const limpo = String(b.conteudo ?? '').replace(/^data:[^;]+;base64,/, '');
    if (!limpo) return new Recusa(400, 'Nenhuma foto foi enviada.');
    /* O servidor confere a ASSINATURA do arquivo, e não a extensão. O mock
     * confere o mesmo: um PDF renomeado para .png é recusado nos dois. */
    const cabeca = atob(limpo.slice(0, 24));
    const ehImagem = cabeca.startsWith('\x89PNG') || cabeca.startsWith('\xFF\xD8\xFF')
      || cabeca.slice(0, 4) === 'RIFF';
    if (!ehImagem) return new Recusa(400, 'Envie uma foto em JPG, PNG ou WEBP.');
    k.foto = limpo;
    k.fotoEm = new Date().toISOString();
    return { ok: true, aviso: 'Foto de identificação guardada. Ela aparece no alto do perfil '
      + 'e não entra em documento nenhum por padrão.' };
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
      cuidadosEssenciais: detalheDe(k).cuidadosEssenciais,
      escola: { nome: detalheDe(k).escolaNome, serie: detalheDe(k).escolaSerie,
                turno: detalheDe(k).escolaTurno, endereco: detalheDe(k).escolaEndereco },
      equipeReferencia: detalheDe(k).equipeReferencia,
      // As observações só vão para quem pode escrevê-las (§6.2): `undefined`
      // some do JSON, e é assim que a tela sabe que não deve desenhar a seção.
      observacoes: ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)
        ? detalheDe(k).observacoes : undefined,
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
      rg: k.rg ?? null,
      cns: k.cns ?? null,
      filiacao: k.filiacao ?? null,
      foto: k.foto ? { rota: `/people/${k.id}/photo`, em: k.fotoEm } : null,
      contatos: contatosDe(k.id).filter((c: any) => c.ativo),
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
    /* A criança internada sai da grade da casa — igual ao servidor. A dose
     * dela não é dada aqui, e uma grade cheia de pendência impossível é uma
     * grade que a equipe aprende a não olhar. */
    return DOSES.filter((d) => (!pid || d.personId === pid) && !estaInternado(d.personId))
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
    /* A EXCEÇÃO POR MEDICAMENTO (0930), com a mesma recusa do servidor: o
       educador lê POR QUE aquele frasco não é com ele. Sem isto no servidor de
       mentira, a demonstração deixaria o educador confirmar a insulina — e
       ensinaria o contrário do que o sistema faz. */
    const esqDaDose = ESQUEMAS.find((e) => e.medicamento === d.medicamento);
    if (esqDaDose?.soEnfermagem && eu.role !== 'enfermagem') {
      return new Recusa(403, `${d.medicamento} está marcado como exclusivo da Enfermagem: `
        + `${esqDaDose.motivoSoEnfermagem ?? 'sem motivo registrado'}. Acione a Enfermagem e `
        + 'registre a dose com ela.');
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
    if (!['enfermagem', 'coordenador', 'equipe_tecnica', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403,
        'Quem cadastra esquema de medicamento é a Enfermagem, a coordenação ou a equipe técnica.');
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
      aviso: 'Esquema registrado como rascunho. Ele só começa a gerar dose quando alguém o '
        + 'ativar — e o nome de quem ativou fica ao lado de cada dose.' };
  }

  /**
   * `GET /medications/prescriptions` — os esquemas da casa.
   *
   * Palavra fixa, e ANTES dos ramos `prescriptions/:id/*`. Antes desta rota, o
   * rascunho ficava gravado e invisível, e não havia de onde suspender.
   */
  if (rota === '/medications/prescriptions' && metodo === 'GET') {
    const ROTULO: Record<string, string> = {
      rascunho: 'Rascunho — fora da grade', ativa: 'Na grade', suspensa: 'Suspenso',
    };
    const daPessoa = (id: string) => KIDS.find((k) => k.id === id)?.nome ?? '(fora do seu alcance)';
    const esquemas = [
      ...[...RASCUNHOS.entries()].map(([id, r]) => ({
        id, medicamento: r.medicamento, dose: r.dose, via: r.via, tipo: r.tipo,
        status: 'rascunho', rotulo: ROTULO.rascunho,
        acolhido: { id: r.personId, nome: daPessoa(r.personId) },
        condicaoUso: r.condicaoUso, prescritor: null,
        inicio: HOJE, fim: null, horarios: r.horarios,
        assinadaPor: null, assinadaEm: null, motivoDaSuspensao: null,
        soEnfermagem: false, motivoSoEnfermagem: null,
      })),
      ...ESQUEMAS,
    ];
    return { esquemas,
      aviso: 'Rascunho NÃO está na grade: ele só começa a gerar dose quando alguém confere e '
        + 'ativa. Suspender é o contrário — tira da grade a partir de hoje, e o que já foi '
        + 'confirmado continua registrado.' };
  }
  /*
   * O PROTOCOLO (§11.3) e a pendência institucional 33.4.1.
   *
   * Enquanto a instituição não decide quem administra em cada período, vale o
   * padrão mais protetivo: somente Enfermagem. A demonstração mostra a casa
   * com o diurno DEFINIDO e o noturno ainda em aberto — que é a situação real
   * da maioria das casas, e é o que a tela precisa saber dizer.
   */
  if (rota === '/medications/protocol' && metodo === 'GET') {
    return { periodos: PROTOCOLO, historico: true,
      respostaDaFundacao:
        'A Enfermagem atende das 9h às 17h; fora disso, quem administra é o educador de '
        + 'plantão, conforme a bula do acolhido. O que existe agora é a exceção por '
        + 'MEDICAMENTO — o que só a Enfermagem dá —, marcada no próprio esquema, com motivo '
        + 'escrito.' };
  }
  /* Cada decisão, com o que valia antes (migração 0860). Lê quem alcança a
     casa: a educadora tem o direito de saber quando a regra mudou. */
  if (rota === '/medications/protocol-history' && metodo === 'GET') {
    return DECISOES_PROTOCOLO;
  }
  if (rota === '/medications/authorizations' && metodo === 'GET') {
    return AUTORIZACOES.map((a) => ({ ...a,
      vigente: (a.ate == null || a.ate >= HOJE) }));
  }
  /*
   * A EXCEÇÃO POR MEDICAMENTO (0930).
   *
   * Substituiu o protocolo por período e a autorização nominal, que decidiam
   * quem podia dar remédio em cada turno. A Fundação respondeu em 08/09/2026:
   * a Enfermagem atende das 9h às 17h e o educador de plantão dá o resto.
   */
  if (seg[0] === 'medications' && seg[1] === 'prescriptions' && seg[3] === 'nurse-only'
      && metodo === 'POST') {
    if (!['enfermagem', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Somente a Enfermagem, a coordenação ou a gestão marcam um '
        + 'medicamento como exclusivo da Enfermagem.');
    }
    const e = ESQUEMAS.find((x) => x.id === seg[2]);
    if (!e) return new Recusa(404, 'Esquema não encontrado.');
    const motivoE = String(b.motivo ?? '').trim();
    if (motivoE.length < 15) {
      return new Recusa(400, 'Escreva por que este medicamento exige a Enfermagem — quem ler '
        + 'daqui a seis meses precisa entender a decisão.');
    }
    const querMarcar = b.soEnfermagem === true;
    if (e.soEnfermagem === querMarcar) {
      return { ok: true, mudou: false,
        aviso: 'Este esquema já estava assim. Nada foi registrado — marcar duas vezes o mesmo '
          + 'estado não é decisão.' };
    }
    EXCECOES_MEDICAMENTO.unshift({ id: uid(), prescriptionId: e.id,
      antes: e.soEnfermagem, depois: querMarcar, motivo: motivoE,
      por: eu.fullName, quando: new Date().toISOString() });
    e.soEnfermagem = querMarcar;
    e.motivoSoEnfermagem = querMarcar ? motivoE : null;
    return { ok: true, mudou: true,
      aviso: querMarcar
        ? 'Marcado: só a Enfermagem administra este medicamento. O educador que tentar '
          + 'confirmar lê o motivo que você escreveu.'
        : 'Desmarcado: o educador de plantão volta a poder dar este medicamento. O que valia '
          + 'antes continua registrado.' };
  }
  if (seg[0] === 'medications' && seg[1] === 'prescriptions' && seg[3] === 'nurse-only-history'
      && metodo === 'GET') {
    return EXCECOES_MEDICAMENTO.filter((x) => x.prescriptionId === seg[2]);
  }
  /* SUSPENDER — só o que está na grade, e a orientação é obrigatória. */
  if (seg[0] === 'medications' && seg[1] === 'prescriptions' && seg[3] === 'suspend'
      && metodo === 'POST') {
    if (!['enfermagem', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Somente a Enfermagem suspende um esquema.');
    }
    const e = ESQUEMAS.find((x) => x.id === seg[2]);
    if (!e) return new Recusa(404, 'Prescrição não encontrada.');
    if (e.status !== 'ativa') {
      return new Recusa(400, e.status === 'suspensa'
        ? 'Este esquema já está suspenso.'
        : `Só se suspende um esquema ativo. Este está como "${e.status}".`);
    }
    if (String(b.motivo ?? '').trim().length < 3) {
      return new Recusa(400, 'Informe a orientação que motivou a suspensão.');
    }
    e.status = 'suspensa'; e.rotulo = 'Suspenso';
    e.motivoDaSuspensao = String(b.motivo).trim();
    // A MESMA regra do servidor, e é uma regra de três partes:
    //
    //  * a dose que AINDA NÃO chegou a hora sai da grade — com estado próprio
    //    e a orientação escrita ao lado. Nada é apagado;
    //  * a dose já confirmada fica exatamente como está: suspender não apaga o
    //    que a criança tomou;
    //  * e a dose que passou da hora e ninguém confirmou CONTINUA pendente. Ela
    //    não foi suspensa — ficou sem resposta, e alguém ainda deve essa
    //    resposta. Suspender hoje não é caneta para apagar a manhã.
    const agora = new Date().toISOString();
    let retiradas = 0;
    for (const d of DOSES) {
      if (d.medicamento !== e.medicamento || !d.pendente || d.horario <= agora) continue;
      d.pendente = false;
      d.estado = 'suspenso_conforme_orientacao';
      d.rotulo = 'Suspenso conforme orientação';
      d.observacao = `Esquema suspenso: ${e.motivoDaSuspensao}`;
      retiradas += 1;
    }
    return { ok: true, status: 'suspensa', dosesRetiradasDaGrade: retiradas,
      aviso: retiradas > 0
        ? `${retiradas} dose(s) ainda por vir saíram da grade de hoje, com a orientação `
          + 'escrita ao lado. O que já foi confirmado continua registrado.'
        : 'Não havia dose por vir hoje. O que já foi confirmado continua registrado.' };
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
    ESQUEMAS.unshift({ id: seg[2], medicamento: r.medicamento, dose: r.dose, via: r.via,
      tipo: r.tipo, status: 'ativa', rotulo: 'Na grade',
      acolhido: { id: r.personId, nome: KIDS.find((k) => k.id === r.personId)?.nome ?? '—' },
      condicaoUso: r.condicaoUso, prescritor: null, inicio: HOJE, fim: null,
      horarios: r.horarios, assinadaPor: eu.fullName, assinadaEm: new Date().toISOString(),
      motivoDaSuspensao: null, soEnfermagem: false, motivoSoEnfermagem: null });
    return { ok: true, status: 'ativa',
      aviso: `Esquema ativado por você. ${r.medicamento} entrou na grade da casa — a partir `
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
        // Antes eram três valores escritos na mão, porque não havia atendimento
        // nenhum no protótipo de onde tirá-los. Agora saem da mesma lista que o
        // histórico lê — e o retorno do Bruno aparece no painel e na folha
        // dizendo a mesma coisa.
        internacaoEmAndamento: ATENDIMENTOS.some(
          (a) => a.personId === k.id && a.tipo === 'internacao' && a.status === 'em_andamento'),
        retornoPendente: ATENDIMENTOS
          .filter((a) => a.personId === k.id && a.status === 'retorno_pendente' && a.retornoEm)
          .map((a) => a.retornoEm!)
          .sort()[0] ?? null,
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

  /**
   * `GET /nursing/history/:personId` — a linha única do §7.3.
   *
   * Existia no servidor desde a fase 4 e nunca teve tela. Os rótulos vêm daqui
   * porque no servidor vêm de lá: a tela não mantém uma lista paralela.
   */
  if (seg[0] === 'nursing' && seg[1] === 'history' && seg.length === 3 && metodo === 'GET') {
    const pid = seg[2];
    const TIPO: Record<string, string> = {
      consulta: 'Consulta', exame: 'Exame', urgencia: 'Urgência', emergencia: 'Emergência',
      internacao: 'Internação', retorno: 'Retorno', terapia: 'Terapia',
    };
    const EST_AT: Record<string, string> = {
      em_andamento: 'Em andamento', concluido: 'Concluído', retorno_pendente: 'Retorno marcado',
    };
    const EST_EV: Record<string, string> = {
      aguardando_triagem: 'Aguardando triagem da Enfermagem',
      complemento_solicitado: 'Devolvida para complemento',
      assinada: 'Conferida e assinada',
    };
    const EST_DOSE: Record<string, string> = {
      aguardando_confirmacao: 'Aguardando confirmação',
      administrado_no_horario: 'Administrado no horário',
      administrado_com_atraso: 'Administrado com atraso',
      recusado: 'Recusado pelo acolhido', nao_administrado: 'Não administrado',
      indisponivel: 'Medicamento indisponível',
      suspenso_conforme_orientacao: 'Suspenso conforme orientação',
      acolhido_ausente: 'Acolhido ausente', incidente: 'Incidente registrado',
    };
    const atendimentos = ATENDIMENTOS
      .filter((a) => a.personId === pid)
      .sort((a, x) => (a.quando < x.quando ? 1 : -1))
      .map((a) => ({
        id: a.id, tipo: a.tipo, tipoRotulo: TIPO[a.tipo] ?? a.tipo, quando: a.quando,
        local: a.local, especialidade: a.especialidade, profissional: a.profissional,
        motivo: a.motivo, desfecho: a.desfecho,
        status: a.status, statusRotulo: EST_AT[a.status] ?? a.status,
        retornoEm: a.retornoEm,
        // A data que já passou não é histórico: é pendência, e vem escrita.
        retornoVencido: a.status === 'retorno_pendente'
          && a.retornoEm != null && a.retornoEm < HOJE,
      }));
    const evolucoes = TRIAGENS.filter((t) => t.personId === pid).map((t) => ({
      id: t.id, tipoRotulo: t.tipo, quando: t.enviadaEm,
      estadoRetorno: t.resumo, orientacoes: null, acompanhante: t.enviadaPor,
      status: t.assinada ? 'assinada'
        : t.pedidoComplemento ? 'complemento_solicitado' : 'aguardando_triagem',
      statusRotulo: EST_EV[t.assinada ? 'assinada'
        : t.pedidoComplemento ? 'complemento_solicitado' : 'aguardando_triagem'],
      complementoEnfermagem: t.complemento,
    }));
    const administracoes = DOSES.filter((d) => d.personId === pid && !d.pendente).map((d) => ({
      previsto: d.horario, estado: d.estado, estadoRotulo: EST_DOSE[d.estado] ?? d.rotulo,
      realizado: d.administradaEm, medicamento: d.medicamento, dose: d.dose,
      por: d.confirmadaPor, observacao: d.observacao,
    }));
    return {
      atendimentos, evolucoes, administracoes,
      pendencias: {
        retornosVencidos: atendimentos.filter((a) => a.retornoVencido).length,
        retornosMarcados: atendimentos.filter(
          (a) => a.status === 'retorno_pendente' && !a.retornoVencido).length,
        internacaoEmAndamento: atendimentos.some(
          (a) => a.tipo === 'internacao' && a.status === 'em_andamento'),
        evolucoesAguardandoTriagem: evolucoes.filter((e) => e.status !== 'assinada').length,
      },
      aviso: 'O histórico é a linha única do acolhido: atendimento, evolução de quem '
        + 'acompanhou e dose administrada, na ordem em que aconteceram. Ele não resume, '
        + 'não conclui e não ordena por gravidade — quem lê é quem interpreta.',
    };
  }

  /** `GET /nursing/summary/:personId/issues` — o que já saiu, e para quê. */
  if (seg[0] === 'nursing' && seg[1] === 'summary' && seg[3] === 'issues' && metodo === 'GET') {
    return RESUMOS.filter((r) => r.personId === seg[2])
      .sort((a, b2) => (a.em < b2.em ? 1 : -1))
      .map((r) => ({
        id: r.id, finalidade: r.finalidade, geradoEm: r.em,
        baixadoEm: r.baixadoEm ?? null, versaoOffline: r.offline ?? false, por: r.por,
      }));
  }

  /** `POST /nursing/summary/issues/:id/download` — quem retirou o papel, e quando. */
  if (seg[0] === 'nursing' && seg[1] === 'summary' && seg[2] === 'issues'
      && seg[4] === 'download' && metodo === 'POST') {
    const r = RESUMOS.find((x) => x.id === seg[3]);
    if (!r) return new Recusa(404, 'Emissão não encontrada.');
    r.baixadoEm = new Date().toISOString();
    return { ok: true };
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

  /*
   * Fala espontânea e sinais observados (§13.2), DEPOIS da abertura — que é
   * quando a criança fala de verdade. As mesmas três recusas do servidor:
   * vazio não registra, ocorrência fechada não recebe, e o registro é único.
   */
  if (seg[0] === 'incidents' && seg[2] === 'protected' && metodo === 'POST') {
    const o = OCORRENCIAS.find((x) => x.id === seg[1]);
    if (!o) return new Recusa(404, 'Ocorrência não encontrada — ou fora do seu alcance.');
    const fala = String(b.falaEspontanea ?? '').trim();
    const sinais = String(b.sinaisObservados ?? '').trim();
    if (!fala && !sinais) {
      return new Recusa(400,
        'Escreva ao menos a fala espontânea ou os sinais observados. Este registro é único '
        + 'por ocorrência e não é reescrito — um registro vazio ocuparia o lugar de quem '
        + 'tem o que dizer.');
    }
    if (o.status === 'fechada') {
      return new Recusa(400,
        'A ocorrência está fechada e a cópia documental dela já foi arquivada. Para acrescentar '
        + 'algo, peça a reabertura à equipe técnica — a reabertura fica registrada, e o que '
        + 'você escrever depois nasce datado do dia em que foi escrito.');
    }
    if (o.falaEspontanea || o.sinaisObservados) {
      // Não diz o que já está lá: quem não pode LER o conteúdo protegido não
      // fica sabendo o que ele diz por causa de uma recusa.
      return new Recusa(400,
        'Esta ocorrência não recebe outro registro protegido: ele é único e não se reescreve. '
        + 'Escreva um relato em seu nome — ele fica ao lado, com a sua assinatura e a sua hora, '
        + 'e ninguém o altera depois.');
    }
    o.falaEspontanea = fala || null;
    o.sinaisObservados = sinais || null;
    o.protegidoPor = eu.fullName;
    o.protegidoPorCargo = eu.role;
    o.protegidoEm = new Date().toISOString();
    return { ok: true, aviso: 'Registrado. Este conteúdo não aparece para colegas do plantão.' };
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
    /*
     * A política real é `author_id = app_current_user()` — quem ESCREVEU lê o
     * que escreveu. Aqui o "Ver como" troca o cargo e mantém a pessoa, então
     * comparar só o nome faria toda troca de cargo continuar lendo o registro
     * protegido, e a demonstração mentiria justamente sobre a política mais
     * estreita do sistema. No protótipo, portanto, "a mesma pessoa" é o mesmo
     * nome NO MESMO cargo.
     */
    const souAutorDoProtegido = o.protegidoPor === eu.fullName
      && o.protegidoPorCargo === eu.role;
    const podeProtegido = tecnica || souAutorDoProtegido
      || (eu.role === 'enfermagem' && /saude|medicamento/.test(cat.cod));
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
      protegido: podeProtegido && (o.falaEspontanea || o.sinaisObservados)
        ? { falaEspontanea: o.falaEspontanea, sinaisObservados: o.sinaisObservados ?? null,
            registradoEm: o.protegidoEm ?? o.abertaEm }
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
      protegidoPor: eu.fullName, protegidoPorCargo: eu.role,
      protegidoEm: new Date().toISOString(),
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

  // ---- alinhamentos: reuniões e combinados (§9.4)
  //
  // Ler é de todo mundo com alcance na casa. Escrever é da equipe técnica e da
  // coordenação — e o servidor recusa de novo por baixo, na policy.

  if (rota === '/alignments/kinds' && metodo === 'GET') {
    return {
      tipos: TIPOS_REUNIAO_MOCK,
      aviso: 'A reunião e os combinados são escritos pela equipe técnica e pela coordenação, '
        + 'e lidos por todo mundo da casa — inclusive por quem não estava na reunião, que é '
        + 'justamente quem mais precisa deles.',
    };
  }

  if (seg[0] === 'alignments' && seg.length === 1 && metodo === 'GET') {
    const escreve = ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role);
    const comRotulo = (c: CombinadoMock) => ({
      ...c, situacaoRotulo: SITUACAO_COMBINADO[c.situacao] ?? c.situacao,
    });
    const todos = [...COMBINADOS]
      .sort((a, b2) => (Number(b2.situacao === 'vigente') - Number(a.situacao === 'vigente'))
        || (a.criadoEm < b2.criadoEm ? 1 : -1))
      .map(comRotulo);
    const vigentes = todos.filter((c) => c.situacao === 'vigente');
    return {
      reunioes: REUNIOES.map((r) => ({
        ...r,
        tipoRotulo: TIPOS_REUNIAO_MOCK.find((t) => t.code === r.tipo)?.label ?? r.tipo,
        combinados: todos.filter((c) => c.reuniaoId === r.id),
      })),
      combinados: todos,
      ultimo: vigentes[0] ?? null,
      vigentes: vigentes.length,
      podeEscrever: escreve,
      aviso: escreve
        ? 'O texto de um combinado não se reescreve. Mudou de ideia? Registre outro, dizendo '
          + 'que substitui o anterior — é assim que a equipe muda de acordo sem apagar o que '
          + 'todo mundo cumpriu até ontem.'
        : 'Aqui está o que a equipe combinou. Quem registra é a equipe técnica e a '
          + 'coordenação; ler é de todo mundo da casa, e é para isso que existe.',
    };
  }

  if (seg[0] === 'alignments' && seg[1] === 'meetings' && metodo === 'POST') {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403,
        'Registrar reunião é da equipe técnica e da coordenação. Ler é de todo mundo da casa.');
    }
    if (String(b.titulo ?? '').trim().length < 4) {
      return new Recusa(400, 'Dê um assunto à reunião — é como ela vai ser achada depois.');
    }
    for (const c of (b.combinados ?? []) as any[]) {
      if (String(c.texto ?? '').trim().length < 10) {
        return new Recusa(400,
          'Cada combinado precisa estar escrito por inteiro. Uma linha de três palavras não '
          + 'diz a quem não estava na reunião o que foi que ficou acertado.');
      }
    }
    const id = uid();
    REUNIOES.unshift({
      id, data: String(b.data), tipo: String(b.tipo ?? 'equipe'),
      titulo: String(b.titulo).trim(),
      participantes: (b.participantes as string) ?? null,
      pauta: (b.pauta as string) ?? null, notas: (b.notas as string) ?? null,
      por: eu.fullName, registradaEm: new Date().toISOString(),
    });
    for (const c of (b.combinados ?? []) as any[]) {
      COMBINADOS.unshift({
        id: uid(), reuniaoId: id, texto: String(c.texto).trim(),
        responsavel: c.responsavel ?? null, prazo: c.prazo ?? null, situacao: 'vigente',
        motivoDaSituacao: null, mudadoPor: null, mudadoEm: null,
        por: eu.fullName, criadoEm: new Date().toISOString(), historico: [],
      });
    }
    return { id, ok: true,
      aviso: 'Reunião registrada. Os combinados já aparecem para todo mundo da casa — '
        + 'inclusive para quem não estava.' };
  }

  if (seg[0] === 'alignments' && seg[1] === 'agreements' && seg.length === 2
      && metodo === 'POST') {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Registrar combinado é da equipe técnica e da coordenação.');
    }
    if (String(b.texto ?? '').trim().length < 10) {
      return new Recusa(400, 'Escreva o combinado por inteiro. Quem lê não estava na conversa.');
    }
    const id = uid();
    COMBINADOS.unshift({
      id, reuniaoId: (b.reuniaoId as string) ?? null, texto: String(b.texto).trim(),
      responsavel: (b.responsavel as string) ?? null, prazo: (b.prazo as string) ?? null,
      situacao: 'vigente', motivoDaSituacao: null, mudadoPor: null, mudadoEm: null,
      por: eu.fullName, criadoEm: new Date().toISOString(), historico: [],
    });
    return { id, ok: true, aviso: 'Combinado registrado e visível para a casa.' };
  }

  if (seg[0] === 'alignments' && seg[1] === 'agreements' && seg[3] === 'status'
      && metodo === 'POST') {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Mudar um combinado é da equipe técnica e da coordenação.');
    }
    const c = COMBINADOS.find((x) => x.id === seg[2]);
    if (!c) return new Recusa(404, 'Combinado não encontrado.');
    if (c.situacao !== 'vigente') {
      return new Recusa(400,
        'Este combinado já não está vigente. Registre um novo em vez de mexer neste.');
    }
    const motivo = String(b.motivo ?? '').trim();
    if (motivo.length < 5) {
      return new Recusa(400,
        'Escreva por que este combinado mudou. Um combinado que some sem explicação deixa a '
        + 'equipe cumprindo o que já foi desfeito.');
    }
    const situacao = String(b.situacao ?? '');
    if (!['cumprido', 'revogado', 'substituido'].includes(situacao)) {
      return new Recusa(400, 'Situação inválida.');
    }
    // O texto não muda: muda a SITUAÇÃO, e a mudança fica registrada ao lado.
    c.historico = [{ de: SITUACAO_COMBINADO[c.situacao], para: SITUACAO_COMBINADO[situacao],
      motivo, quem: eu.fullName, quando: new Date().toISOString() }, ...c.historico];
    c.situacao = situacao; c.motivoDaSituacao = motivo;
    c.mudadoPor = eu.fullName; c.mudadoEm = new Date().toISOString();
    return { ok: true, situacao, rotulo: SITUACAO_COMBINADO[situacao] };
  }

  if (rota === '/people/credentials/kinds' && metodo === 'GET') return TIPOS_CREDENCIAL;

  // ---- benefícios e dados bancários (§6.10): a outra metade da mesma porta
  //
  // Três rotas que o servidor serve com RLS, reautenticação e log por
  // visualização, e que não tinham tela. Aqui valem as mesmas fricções: a
  // consulta pede finalidade, a alteração também, e a tentativa de quem não
  // pode fica escrita.

  if (rota === '/people/benefits/kinds' && metodo === 'GET') {
    return {
      tipos: TIPOS_BENEFICIO_MOCK, situacoes: SITUACOES_BENEFICIO_MOCK,
      aviso: 'Esta área exige a sua senha de novo e registra cada visualização, alteração e '
        + 'exportação, com a finalidade que você declarar. Nada daqui aparece em linha do '
        + 'tempo, ATA, notificação, relatório geral ou busca.',
    };
  }

  if (seg[0] === 'people' && seg[2] === 'benefits' && seg[3] === 'view' && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      // A recusa fica registrada: quem responde pela criança precisa saber que
      // alguém tentou abrir a conta dela.
      BENEFICIO_HIST = [{ personId: seg[1], quem: eu.fullName, acao: 'tentativa recusada',
        quando: new Date().toISOString(), finalidade: null, recusada: true }, ...BENEFICIO_HIST];
      return new Recusa(403,
        'Somente a coordenação da casa atual e o Gestor Geral acessam esta área.');
    }
    if (!cofreLiberado) {
      return new Recusa(403, 'Confirme sua senha para acessar benefícios e dados bancários.');
    }
    const finalidade = String(b.finalidade ?? '').trim();
    if (finalidade.length < 5) return new Recusa(400, 'Informe a finalidade do acesso.');
    BENEFICIO_HIST = [{ personId: seg[1], quem: eu.fullName, acao: 'consulta',
      quando: new Date().toISOString(), finalidade, recusada: false }, ...BENEFICIO_HIST];
    const registros = BENEFICIOS.filter((x) => x.personId === seg[1])
      .sort((a, x) => Number(x.pendenciaBancaria) - Number(a.pendenciaBancaria))
      .map((x) => ({
        ...x,
        tipoRotulo: TIPOS_BENEFICIO_MOCK.find((t) => t.cod === x.tipo)?.label ?? x.tipo,
        situacaoRotulo: SITUACOES_BENEFICIO_MOCK.find((s) => s.cod === x.situacao)?.label
          ?? x.situacao,
      }));
    return {
      registros, pendencias: registros.filter((r) => r.pendenciaBancaria).length,
      ultimoAcesso: null,
      aviso: 'Cada visualização, edição, impressão e exportação desta área é registrada.',
    };
  }

  if (seg[0] === 'people' && seg[2] === 'benefits' && seg[3] === 'history' && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403,
        'Somente a coordenação da casa atual e o Gestor Geral acessam esta área.');
    }
    return BENEFICIO_HIST.filter((h) => h.personId === seg[1]);
  }

  if (seg[0] === 'people' && seg[2] === 'benefits' && seg[3] === 'export' && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Sem permissão para exportar esta área.');
    }
    const finalidade = String(b.finalidade ?? '').trim();
    if (finalidade.length < 5) return new Recusa(400, 'Informe a finalidade da exportação.');
    BENEFICIO_HIST = [{ personId: seg[1], quem: eu.fullName, acao: 'exportação',
      quando: new Date().toISOString(), finalidade, recusada: false }, ...BENEFICIO_HIST];
    return { ok: true, formato: 'pdf',
      aviso: 'Exportação registrada em auditoria com finalidade declarada.' };
  }

  if (seg[0] === 'people' && seg[2] === 'benefits' && seg.length === 3 && metodo === 'POST') {
    if (!['coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403, 'Sem permissão para editar benefícios.');
    }
    if (!cofreLiberado) {
      return new Recusa(403, 'Confirme sua senha para acessar benefícios e dados bancários.');
    }
    const finalidade = String(b.finalidade ?? '').trim();
    if (finalidade.length < 5) return new Recusa(400, 'Informe a finalidade da alteração.');
    if (!TIPOS_BENEFICIO_MOCK.some((t) => t.cod === b.tipo)) {
      return new Recusa(400,
        `Escolha o tipo do benefício: ${TIPOS_BENEFICIO_MOCK.map((t) => t.label).join(', ')}.`);
    }
    if (b.pendenciaBancaria && !String(b.pendenciaNota ?? '').trim()) {
      return new Recusa(400,
        'Escreva qual é a pendência bancária. "Pendente" sozinho não diz a ninguém o que '
        + 'falta fazer — e é justamente isso que precisa passar de uma coordenação para a '
        + 'próxima.');
    }
    // O CHECK da migração 055, em forma de frase: senha não entra aqui.
    const comCaraDeSenha = /(senha|password|passwd)\s*[:=]/i;
    for (const campo of ['observacoes', 'pendenciaNota', 'ondeEstaGuardado']) {
      const valor = String((b as Record<string, unknown>)[campo] ?? '');
      if (valor && comCaraDeSenha.test(valor)) {
        return new Recusa(400,
          `O campo "${campo}" parece conter uma senha. A senha tem lugar próprio e cifrado no `
          + 'cofre de acessos; aqui fica só ONDE ela está guardada e quem responde por ela.');
      }
    }
    const campos = {
      tipo: String(b.tipo), numero: (b.numero as string) ?? null,
      banco: (b.banco as string) ?? null, agencia: (b.agencia as string) ?? null,
      agenciaNome: (b.agenciaNome as string) ?? null, conta: (b.conta as string) ?? null,
      operacao: (b.operacao as string) ?? null, situacao: String(b.situacao ?? 'ativo'),
      pendenciaBancaria: !!b.pendenciaBancaria,
      pendenciaNota: (b.pendenciaNota as string) ?? null,
      observacoes: (b.observacoes as string) ?? null,
      temAcessoGov: !!b.temAcessoGov,
      responsavelPeloAcesso: (b.responsavelPeloAcesso as string) ?? null,
      ondeEstaGuardado: (b.ondeEstaGuardado as string) ?? null,
      atualizadoEm: new Date().toISOString(), atualizadoPor: eu.fullName,
    };
    const existente = b.id ? BENEFICIOS.find((x) => x.id === b.id && x.personId === seg[1]) : null;
    if (b.id && !existente) {
      return new Recusa(404, 'Registro de benefício não encontrado para este acolhido.');
    }
    if (existente) Object.assign(existente, campos);
    else BENEFICIOS.push({ id: uid(), personId: seg[1], ...campos });
    BENEFICIO_HIST = [{ personId: seg[1], quem: eu.fullName,
      acao: existente ? 'alteração' : 'cadastro',
      quando: new Date().toISOString(), finalidade, recusada: false }, ...BENEFICIO_HIST];
    return { ok: true, id: existente?.id ?? BENEFICIOS[BENEFICIOS.length - 1].id };
  }

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
    const cod = String(b.kind ?? '');
    const acolhido = b.personId ? kid(String(b.personId))?.nome ?? null : null;
    const novo: Relatorio = {
      id: `rel-${Date.now()}`,
      tipo: TIPOS_RELATORIO_ROTULO[cod] ?? cod,
      tipoCod: cod,
      personId: (b.personId as string) ?? null,
      periodo: { de: String(b.de ?? ''), ate: String(b.ate ?? '') },
      unidade: b.personId ? null : CASA.code,
      finalidade: String(b.finalidade ?? ''),
      situacao: 'rascunho',
      autor: eu.fullName,
      em: new Date().toISOString(),
      entregas: [],
    };
    RELATORIOS.unshift(novo);
    return {
      id: novo.id, situacao: 'rascunho', acolhido,
      exigeAprovacao: EXIGEM_APROVACAO.includes(cod),
      aviso: EXIGEM_APROVACAO.includes(cod)
        ? 'Rascunho criado, com a parte factual já preenchida pelo sistema. Ele ainda NÃO '
          + 'vale: envie para aprovação, e outra pessoa confere e assina.'
        : 'Rascunho criado com a parte factual já preenchida pelo sistema. '
          + 'Os campos de avaliação ficam em branco para a equipe escrever.',
    };
  }
  if (rota === '/reports' && metodo === 'GET') {
    return RELATORIOS.map((r) => ({
      ...r, acolhido: r.personId ? kid(r.personId)?.nome ?? '—' : null,
      exigeAprovacao: EXIGEM_APROVACAO.includes(r.tipoCod),
      // A mesma regra do servidor: em aprovação, cargo que aprova, e nunca
      // quem redigiu.
      podeAprovar: r.situacao === 'em_aprovacao'
        && ['coordenador', 'gestor_geral'].includes(eu.role) && r.autor !== eu.fullName,
    }));
  }
  /* ENVIAR PARA APROVAÇÃO — o passo que faltava entre gerar e aprovar. */
  if (seg[0] === 'reports' && seg[2] === 'submit' && metodo === 'POST') {
    const r = RELATORIOS.find((x) => x.id === seg[1]);
    if (!r) return new Recusa(404, 'Relatório não encontrado.');
    if (r.situacao === 'em_aprovacao') {
      return new Recusa(409, 'Este relatório já está aguardando aprovação da coordenação.');
    }
    if (r.situacao === 'aprovado') {
      return new Recusa(409,
        'Este relatório já foi aprovado. Aprovado não se reenvia: corrigir gera a versão '
        + 'seguinte, e a anterior continua legível como estava.');
    }
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(eu.role)) {
      return new Recusa(403,
        'Seu cargo gera o relatório, mas não o envia para aprovação. Quem envia é a equipe '
        + 'técnica ou a coordenação da casa.');
    }
    r.situacao = 'em_aprovacao';
    return { situacao: 'em_aprovacao',
      aviso: 'Enviado para aprovação. Quem redigiu não aprova o próprio relatório: a '
        + 'coordenação da casa é quem confere e assina (§14.6).' };
  }
  if (seg[0] === 'reports' && seg[2] === 'delivery' && metodo === 'GET') {
    return RELATORIOS.find((x) => x.id === seg[1])?.entregas ?? [];
  }
  /*
   * EXPORTAÇÃO EM WORD, DE VERDADE, NO PROTÓTIPO.
   *
   * Antes daqui saía um .txt explicando que "no sistema real isto vem em
   * Word". Era verdade — o servidor gera .docx com timbre desde a fase 7 —,
   * mas quem testa clica em baixar, abre um bloco de notas e conclui, com toda
   * a razão, que o relatório não existe. A parte mais visível da entrega
   * parecia a menos pronta.
   *
   * Agora o protótipo monta o documento no navegador (`docx.ts`), com o timbre
   * do Pão dos Pobres e a folha na ABNT. O CONTEÚDO continua fictício e a
   * primeira folha diz isso — o que muda é que a forma do documento é a de
   * verdade, e é a forma que precisa ser conferida por quem assina.
   */
  /**
   * `POST /reports/:id/preview` — a folha ANTES de baixar.
   *
   * Devolve a ESTRUTURA do documento, não o arquivo: a tela desenha a mesma
   * folha que o Word vai imprimir, e quem confere confere de verdade, sem
   * baixar, achar na pasta e abrir o Word. Baixar continua sendo outro ato, com
   * finalidade declarada e registro próprio — a pré-visualização não substitui
   * nem dispensa isso.
   */

  /*
   * AS FOLHAS DOS DOCUMENTOS (§16).
   *
   * Estas rotas montam a folha com as MESMAS funções que o servidor usa —
   * `ata-folha.ts`, `ocorrencia-folha.ts`, `saude-folha.ts`, `grade-folha.ts`,
   * `combinados-folha.ts` —, e a partir dos MESMOS dados que a tela recebe,
   * chamando aqui dentro a rota de leitura. Um mock que montasse a folha por
   * conta própria seria a terceira versão do documento, e a demonstração
   * ensaiaria um sistema que não existe (a lição que a aba de relatórios
   * cobrou caro).
   *
   * Gerar o .docx no navegador, AQUI, é legítimo: o servidor de mentira é o
   * navegador. No aplicativo de verdade quem gera é o servidor, e é ele que
   * registra a saída.
   */
  const autorDaFolha = () => ({
    nome: eu.fullName, cargo: cargoNoDocumento(eu.role),
  });
  const casaDaFolha = `${CASA.code} — ${CASA.name}`;

  /** Exportar exige a finalidade escrita — a mesma recusa do servidor. */
  const exportarFolha = (folha: any) => {
    const finalidade = String(b.finalidade ?? '').trim();
    if (finalidade.length < 10) {
      return new Recusa(400, 'Descreva a finalidade da exportação (mínimo 10 caracteres).');
    }
    return {
      nomeArquivo: nomeDaFolha(folha.titulo),
      conteudoBase64: gerarDocx(folha, timbreEmBytes()),
      aviso: folha.rascunho
        ? 'Documento gerado em Word, marcado como RASCUNHO na primeira página. '
          + 'Exportação registrada com o seu nome, a finalidade e o horário.'
        : 'Documento gerado em Word, com timbre. Exportação registrada com o seu nome, '
          + 'a finalidade e o horário. Converta para PDF na hora de enviar.',
    };
  };

  const folhaDoPlantao = (plantaoId: string) => {
    const p: any = responder(`/shifts/${plantaoId}`, ['shifts', plantaoId], q, {}, 'GET');
    if (p instanceof Recusa) return p;
    return folhaDaAta(
      {
        data: p.data, turno: p.turno,
        status: p.ata?.status ?? p.status,
        conteudo: p.ata?.conteudo ?? null,
        pendencias: p.ata?.pendencias ?? null,
        episodios: (p.episodios ?? []).map((e: any) => ({
          quando: e.quando, classificacao: e.classificacao,
          relato: e.relato, por: e.registradoPor,
        })),
        passagens: (p.passagens ?? []).map((h: any) => ({
          quem: h.quem, cargo: cargoNoDocumento(h.cargo), assinadaEm: h.assinadaEm,
        })),
      },
      SECOES_ATA.map((x) => ({ chave: x.chave, titulo: x.titulo })),
      casaDaFolha, autorDaFolha());
  };

  const folhaDaOcorrenciaMock = (id: string) => {
    const o: any = responder(`/incidents/${id}`, ['incidents', id], q, {}, 'GET');
    if (o instanceof Recusa) return o;
    return folhaDaOcorrencia({
      categoria: o.categoria, quando: o.quando, status: o.status,
      fato: o.fato, medidasImediatas: o.medidasImediatas,
      acolhidos: (o.acolhidos ?? []).map((a: any) => ({ nome: a.nome })),
      relatos: { relatos: (o.relatos?.relatos ?? []) },
      sinteses: o.sinteses ?? [],
    }, autorDaFolha());
  };

  const folhaDaSaudeMock = (pid: string) => {
    const h: any = responder(`/nursing/history/${pid}`, ['nursing', 'history', pid], q, {}, 'GET');
    if (h instanceof Recusa) return h;
    const pessoa = kid(pid);
    if (!pessoa) return new Recusa(404, 'Acolhido não encontrado — ou fora do seu alcance.');
    return folhaDeSaude({ nome: pessoa.nome }, h, casaDaFolha, autorDaFolha());
  };

  const folhaDaGradeMock = () => {
    const doses: any = responder('/medications', ['medications'], q, {}, 'GET');
    if (doses instanceof Recusa) return doses;
    return folhaDaGrade(casaDaFolha, doses, autorDaFolha());
  };

  const folhaDosCombinadosMock = () => {
    const d: any = responder('/alignments', ['alignments'], q, {}, 'GET');
    if (d instanceof Recusa) return d;
    return folhaDosCombinados(
      casaDaFolha,
      (d.combinados ?? []).map((a: any) => ({
        texto: a.texto, responsavel: a.responsavel, prazo: a.prazo,
        por: a.por, criadoEm: a.criadoEm, situacao: a.situacao,
      })),
      (d.reunioes ?? []).map((m: any) => ({ data: m.data, titulo: m.titulo, por: m.por })),
      autorDaFolha());
  };

  {
    const doImpacto = responderImpacto(rota, seg, q, b, metodo, {
      eu, chamar: responder, exportarFolha,
    });
    if (doImpacto !== undefined) return doImpacto;
  }

  if (seg[0] === 'shifts' && seg[2] === 'folha' && metodo === 'GET') {
    return folhaDoPlantao(seg[1]);
  }
  if (seg[0] === 'shifts' && seg[2] === 'export' && metodo === 'POST') {
    const f = folhaDoPlantao(seg[1]);
    return f instanceof Recusa ? f : exportarFolha(f);
  }
  if (seg[0] === 'incidents' && seg[2] === 'folha' && metodo === 'GET') {
    return folhaDaOcorrenciaMock(seg[1]);
  }
  if (seg[0] === 'incidents' && seg[2] === 'export' && metodo === 'POST') {
    const f = folhaDaOcorrenciaMock(seg[1]);
    return f instanceof Recusa ? f : exportarFolha(f);
  }
  if (seg[0] === 'nursing' && seg[1] === 'history' && seg[3] === 'folha' && metodo === 'GET') {
    return folhaDaSaudeMock(seg[2]);
  }
  if (seg[0] === 'nursing' && seg[1] === 'history' && seg[3] === 'export' && metodo === 'POST') {
    const f = folhaDaSaudeMock(seg[2]);
    return f instanceof Recusa ? f : exportarFolha(f);
  }
  if (rota === '/medications/folha' || rota.startsWith('/medications/folha?')) {
    return folhaDaGradeMock();
  }
  if (rota === '/medications/export' && metodo === 'POST') {
    const f = folhaDaGradeMock();
    return f instanceof Recusa ? f : exportarFolha(f);
  }
  if (rota === '/alignments/folha' || rota.startsWith('/alignments/folha?')) {
    return folhaDosCombinadosMock();
  }
  if (rota === '/alignments/export' && metodo === 'POST') {
    const f = folhaDosCombinadosMock();
    return f instanceof Recusa ? f : exportarFolha(f);
  }

  if (seg[0] === 'reports' && seg[2] === 'preview' && metodo === 'POST') {
    const r = RELATORIOS.find((x) => x.id === seg[1]);
    if (!r) return new Recusa(404, 'Relatório não encontrado.');
    return documentoDoRelatorio(
      r, r.personId ? kid(r.personId) : null,
      r.finalidade, r.situacao !== 'aprovado');
  }

  if (seg[0] === 'reports' && seg[2] === 'export') {
    const r = RELATORIOS.find((x) => x.id === seg[1]);
    if (!r) return new Recusa(404, 'Relatório não encontrado.');
    const finalidade = String(b.finalidade ?? '').trim();
    if (!finalidade) return new Recusa(400, 'Informe a finalidade da exportação.');
    const crianca = r.personId ? kid(r.personId) : null;
    const rascunho = r.situacao !== 'aprovado';

    const doc = documentoDoRelatorio(r, crianca, finalidade, rascunho);
    return {
      formato: 'docx',
      nomeArquivo: nomeDeArquivo(`relatorio-${r.tipo}-${r.periodo}`),
      conteudoBase64: gerarDocx(doc, timbreEmBytes()),
      aviso: rascunho
        ? 'Documento gerado em Word, com o timbre e marcado como RASCUNHO na primeira '
          + 'folha — ele ainda não foi aprovado por outra pessoa.'
        : 'Documento gerado em Word, com o timbre. A exportação ficou registrada com o seu '
          + 'nome e a finalidade que você declarou.',
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
