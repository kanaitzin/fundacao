/**
 * O QUE CADA SETOR ENXERGA — a resposta escrita, para não ser respondida
 * trocando de conta.
 *
 * A pergunta é da coordenação e é constante: "o educador vê isso?". Hoje ela
 * só se responde entrando com a conta de outra pessoa, e conta emprestada é
 * exatamente o que o §2 proíbe. Esta é a resposta, no código, ao lado das
 * regras que ela descreve.
 *
 * TRÊS AVISOS QUE ESTA LISTA PRECISA CARREGAR:
 *
 * 1. ela descreve o alcance de LEITURA e de AÇÃO por área. Não substitui o
 *    banco: quem recusa de verdade é a RLS e a regra do serviço, e é lá que
 *    uma dúvida se tira;
 * 2. esconder o botão é gentileza com quem usa. A proteção mora embaixo, e o
 *    servidor recusa de novo mesmo quando a tela ofereceu;
 * 3. a lista é mantida à mão, e por isso o teste `alcance.spec.ts` cobra que
 *    ela cubra todos os cargos, que não invente cargo nenhum, e que concorde
 *    com o menu do aplicativo. Divergência entre esta página e o menu é
 *    defeito dos dois lados — não se conserta só aqui.
 *
 * ESTE ARQUIVO NÃO IMPORTA NADA, de propósito: o protótipo o lê direto, para
 * que a resposta mostrada na demonstração seja a MESMA que o servidor dá. Uma
 * segunda cópia em `mock.ts` divergiria na primeira correção, e a divergência
 * apareceria justamente na conversa com a equipe.
 */

export interface AreaAlcance {
  /** Chave usada pelo menu do aplicativo, quando a área tem uma tela própria. */
  area: string;
  titulo: string;
  /** O que a pessoa faz ali. Frase de quem trabalha na casa, não de sistema. */
  faz: string;
  /** A regra que o SERVIDOR aplica, quando ela é mais estrita que o menu. */
  servidor?: string;
}

export interface Alcance {
  cargo: string;
  /** Alcança mais de uma casa por função (§2, exceções funcionais). */
  transversal: boolean;
  resumo: string;
  areas: AreaAlcance[];
  /** O que este cargo NÃO alcança, dito por extenso — ausência é informação. */
  naoAlcanca: string[];
}

/** Áreas com tela própria; a chave é a mesma que o menu usa. */
export const AREAS = {
  dia: 'O dia da casa',
  chamada: 'Chamada',
  acolhidos: 'Acolhidos',
  passagem: 'Passagem de plantão',
  agenda: 'Agenda',
  plantao: 'Painel do plantão',
  ata: 'ATA',
  ocorrencias: 'Ocorrências',
  saude: 'Saúde',
  acompanhamentos: 'Acompanhamentos e relatórios',
  transferencias: 'Transferências',
  cofre: 'Cofre de acessos',
  arquivo: 'Arquivo documental',
  equipe: 'Equipe',
  unidades: 'O dia das unidades',
} as const;

const NUNCA_NINGUEM = [
  'WhatsApp ou envio de dados por WhatsApp',
  'GPS ou rastreamento de pessoa',
  'conta compartilhada',
  'ranking de casas, de acolhidos ou de equipe',
  'pontuação de comportamento',
  'decisão automática sobre diagnóstico, culpa, risco, punição, visita, medicação, destino ou transferência',
  'exclusão de registro — nada some, nem pessoa nem texto',
];

export const ALCANCE_POR_CARGO: Alcance[] = [
  {
    cargo: 'educador',
    transversal: false,
    resumo: 'O turno da casa dele, com a criança na frente. É quem mais registra e quem menos '
      + 'precisa navegar.',
    areas: [
      { area: 'dia', titulo: AREAS.dia, faz: 'Vê a rotina do dia e registra o que aconteceu.' },
      { area: 'chamada', titulo: AREAS.chamada,
        faz: 'Confere presença um a um.',
        servidor: 'Quem marca presença é quem olhou a criança: não existe registro por outro na chamada.' },
      { area: 'acolhidos', titulo: AREAS.acolhidos,
        faz: 'Abre o perfil de quem está na casa dele.',
        servidor: 'Dados bancários, cofre e conteúdo judicial não são devolvidos ao educador.' },
      { area: 'passagem', titulo: AREAS.passagem,
        faz: 'Escreve e assina a própria passagem.',
        servidor: 'Assina a sua, e só a sua.' },
      { area: 'agenda', titulo: AREAS.agenda, faz: 'Vê o que está marcado para a casa.' },
      { area: 'plantao', titulo: AREAS.plantao, faz: 'Vê quem está em cada atividade agora.' },
      { area: 'ocorrencias', titulo: AREAS.ocorrencias,
        faz: 'Abre ocorrência e acompanha as da casa.',
        servidor: 'Fala espontânea e sinais observados não são devolvidos a quem não é técnica '
          + 'ou coordenação — nem para quem abriu a ocorrência de outra pessoa.' },
      { area: 'ata', titulo: AREAS.ata, faz: 'Lê a ATA do turno; não fecha.' },
    ],
    naoAlcanca: [
      'outra casa',
      'o Drive institucional — o que precisa ler está no perfil, com registro',
      'o cofre de acessos e os dados bancários',
      'acompanhamentos e relatórios técnicos',
      'transferências',
      'a equipe (cadastro, senha, desativação)',
      ...NUNCA_NINGUEM,
    ],
  },
  {
    cargo: 'lider_diurno',
    transversal: false,
    resumo: 'Conduz o turno diurno da casa: o que o educador alcança, mais o fechamento.',
    areas: [
      { area: 'dia', titulo: AREAS.dia, faz: 'Conduz o dia e distribui as atividades.' },
      { area: 'plantao', titulo: AREAS.plantao,
        faz: 'Vê o turno inteiro e delega atividade com motivo.',
        servidor: 'Delegar não apaga a designação anterior, e a atividade volta a aguardar ciência.' },
      { area: 'passagem', titulo: AREAS.passagem,
        faz: 'Assina a sua e registra pelo colega que não conseguiu registrar.',
        servidor: 'O registro por outro guarda os DOIS nomes e o motivo. Nunca vale para dose '
          + 'de medicamento nem para chamada.' },
      { area: 'ata', titulo: AREAS.ata,
        faz: 'Fecha a ATA da casa — com pendência, quando falta assinatura.',
        servidor: 'O sistema não assina por ninguém: ou a pessoa assina, ou fica registrada a pendência.' },
      { area: 'ocorrencias', titulo: AREAS.ocorrencias,
        faz: 'Encerra a ETAPA OPERACIONAL.',
        servidor: 'A análise técnica é de outro cargo, e é ela que fecha a ocorrência.' },
      { area: 'saude', titulo: AREAS.saude,
        faz: 'Acompanha doses e triagem da casa.',
        servidor: 'Não assina evolução de saúde: a assinatura é da Enfermagem.' },
    ],
    naoAlcanca: [
      'outra casa',
      'o cofre de acessos e os dados bancários',
      'aprovar acompanhamento',
      'transferências',
      ...NUNCA_NINGUEM,
    ],
  },
  {
    cargo: 'equipe_tecnica',
    transversal: false,
    resumo: 'Psicologia e serviço social da casa: o caso, não o turno.',
    areas: [
      { area: 'acolhidos', titulo: AREAS.acolhidos,
        faz: 'Perfil completo, histórico, documentos e situação judicial.' },
      { area: 'acompanhamentos', titulo: AREAS.acompanhamentos,
        faz: 'Redige acompanhamentos e gera relatórios.',
        servidor: 'Quem redigiu não aprova o próprio texto.' },
      { area: 'ocorrencias', titulo: AREAS.ocorrencias,
        faz: 'Lê os relatos lado a lado, escreve a síntese e valida o fechamento.',
        servidor: 'Caso de saúde, medicamento, contenção ou violência não fecha sem síntese.' },
      { area: 'arquivo', titulo: AREAS.arquivo, faz: 'Confere se o que fechou chegou ao Drive.' },
      { area: 'saude', titulo: AREAS.saude, faz: 'Acompanha o painel e movimenta o armário.' },
      { area: 'agenda', titulo: AREAS.agenda, faz: 'Marca compromissos e troca quem vai.' },
    ],
    naoAlcanca: [
      'outra casa',
      'o cofre de acessos e os dados bancários',
      'aprovar o próprio acompanhamento',
      'assinar evolução de saúde',
      ...NUNCA_NINGUEM,
    ],
  },
  {
    cargo: 'cozinha',
    transversal: false,
    resumo: 'Uma tela só, e de propósito: o que cada criança não pode comer.',
    areas: [
      { area: 'acolhidos', titulo: 'Restrições alimentares',
        faz: 'Vê nome, restrição e substituição orientada.',
        servidor: 'Sem perfil, sem CPF, sem diagnóstico, sem caso, sem histórico. A lista traz '
          + 'a restrição, não a razão dela.' },
    ],
    naoAlcanca: [
      'o perfil do acolhido',
      'ocorrências, ATA, plantão e agenda',
      'saúde além da restrição alimentar',
      'qualquer documento',
      ...NUNCA_NINGUEM,
    ],
  },
  {
    cargo: 'enfermagem',
    transversal: true,
    resumo: 'Saúde das oito unidades. Alcança mais de uma casa por FUNÇÃO — é uma das três '
      + 'exceções previstas.',
    areas: [
      { area: 'saude', titulo: AREAS.saude,
        faz: 'Prescreve, tria evoluções, assina e cuida do armário.',
        servidor: 'A dose continua sendo confirmada por quem administrou — a Enfermagem não '
          + 'confirma pelo educador.' },
      { area: 'acolhidos', titulo: AREAS.acolhidos,
        faz: 'Vê o necessário de saúde de quem atende.',
        servidor: 'Sem dados bancários, sem cofre, sem conteúdo judicial.' },
      { area: 'unidades', titulo: AREAS.unidades, faz: 'O dia das casas que alcança, em ordem.' },
    ],
    naoAlcanca: [
      'o cofre de acessos e os dados bancários',
      'ATA, transferências e equipe',
      'acompanhamentos técnicos',
      'varrer as oito casas atrás de uma criança — o servidor recusa o modo individual',
      ...NUNCA_NINGUEM,
    ],
  },
  {
    cargo: 'lider_noturno_geral',
    transversal: true,
    resumo: 'A noite das oito unidades. Também exceção funcional.',
    areas: [
      { area: 'plantao', titulo: AREAS.plantao, faz: 'Acompanha o turno das casas que alcança.' },
      { area: 'ata', titulo: 'ATA Geral Noturna',
        faz: 'Abre, preenche casa a casa e assina.',
        servidor: 'Casa sem chamado também entra: a ausência de demanda é registrada, não omitida.' },
      { area: 'ocorrencias', titulo: AREAS.ocorrencias, faz: 'Abre e encerra a etapa operacional.' },
      { area: 'unidades', titulo: AREAS.unidades, faz: 'O dia das unidades, em ordem.' },
    ],
    naoAlcanca: [
      'o cofre de acessos e os dados bancários',
      'aprovar acompanhamento',
      'transferências',
      ...NUNCA_NINGUEM,
    ],
  },
  {
    cargo: 'coordenador',
    transversal: false,
    resumo: 'Responde pela casa: equipe, aprovações, transferências e o cofre.',
    areas: [
      { area: 'equipe', titulo: AREAS.equipe,
        faz: 'Cadastra, convida, desativa e redefine senha.',
        servidor: 'Não existe apagar pessoa: desligado é desativado, e a autoria do que ela '
          + 'registrou permanece.' },
      { area: 'acompanhamentos', titulo: AREAS.acompanhamentos,
        faz: 'Aprova acompanhamentos e relatórios.',
        servidor: 'Não aprova o que ela mesma redigiu.' },
      { area: 'transferencias', titulo: AREAS.transferencias,
        faz: 'Pede, aceita e recusa com motivo.',
        servidor: 'A criança só muda de casa no aceite; recusar exige motivo, e o motivo '
          + 'aparece nas duas casas.' },
      { area: 'cofre', titulo: AREAS.cofre,
        faz: 'Guarda e abre os acessos das crianças da casa.',
        servidor: 'Pede a senha DE NOVO, mesmo com a sessão aberta, e cada abertura exige '
          + 'finalidade escrita e fica registrada.' },
      { area: 'ocorrencias', titulo: AREAS.ocorrencias, faz: 'Valida, fecha e reabre com histórico.' },
      { area: 'arquivo', titulo: AREAS.arquivo, faz: 'Confere a fila do arquivo.' },
      { area: 'ata', titulo: AREAS.ata, faz: 'Fecha a ATA quando o líder não está.' },
      { area: 'saude', titulo: AREAS.saude, faz: 'Acompanha o painel; não assina evolução.' },
    ],
    naoAlcanca: [
      'outra casa',
      'assinar evolução de saúde',
      'ver a senha de alguém da equipe — senha não se lê, se redefine',
      ...NUNCA_NINGUEM,
    ],
  },
  {
    cargo: 'gestor_geral',
    transversal: true,
    resumo: 'Escopo institucional. Abre UMA casa por vez, e cada abertura fica registrada.',
    areas: [
      { area: 'unidades', titulo: AREAS.unidades, faz: 'O dia das oito unidades, em ordem.' },
      { area: 'acompanhamentos', titulo: AREAS.acompanhamentos, faz: 'Aprova e acompanha.' },
      { area: 'cofre', titulo: AREAS.cofre,
        faz: 'Abre um acesso pela exceção.',
        servidor: 'Exceção pede motivo institucional de 20 caracteres, e aparece MARCADA como '
          + 'exceção no histórico, para quem vier depois.' },
      { area: 'arquivo', titulo: AREAS.arquivo, faz: 'Confere o arquivo das unidades.' },
    ],
    naoAlcanca: [
      'comparar unidades — não há ranking, e não há modo individual entre casas',
      'receber ocorrência automaticamente: quem escalona é a técnica ou a coordenação',
      ...NUNCA_NINGUEM,
    ],
  },
  {
    cargo: 'admin_tecnico',
    transversal: true,
    resumo: 'Infraestrutura e suporte. Não é um cargo do acolhimento: administra contas, e não '
      + 'lê o que a casa registra.',
    areas: [
      { area: 'equipe', titulo: AREAS.equipe, faz: 'Cadastra contas e redefine senha.' },
      { area: 'arquivo', titulo: AREAS.arquivo, faz: 'Processa a fila do arquivo.' },
    ],
    naoAlcanca: [
      'perfil de acolhido, ocorrências, ATA, saúde e acompanhamentos',
      'o cofre de acessos e os dados bancários',
      ...NUNCA_NINGUEM,
    ],
  },
];
