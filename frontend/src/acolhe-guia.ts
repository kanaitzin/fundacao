/**
 * O MODO GUIA DA ACOLHE+AI (fase 192).
 *
 * Sem o modelo (no protótipo, e na instalação que ainda não tem a chave), a
 * assistente não lê dado nenhum e não inventa resposta: ela reconhece o pedido
 * pelas palavras, explica a tela, leva até ela e anota a sugestão. É honesto
 * sobre o que é: a primeira resposta diz que está no modo guia.
 *
 * As telas oferecidas são SÓ as que a pessoa alcança (a lista vem do menu).
 */
export interface TelaDoGuia { chave: string; titulo: string; frase?: string }

export type RespostaDoGuia = {
  texto: string;
  /** Ir agora, porque a pessoa pediu para ir. */
  ir?: string;
  /** Propor registrar uma sugestão, com as palavras da pessoa. */
  sugestao?: string;
  /** Fazer esta conta (já com ponto decimal), pela mesma conta da Acolhe+AI. */
  conta?: string;
  /** Depois de ir, abrir o formulário da tela, com a licença da pessoa. */
  abrirFormulario?: boolean;
  /** Um rascunho com o que a pessoa falou ou escreveu, para conferir antes de guardar (fase 195). */
  rascunho?: { titulo: string; texto: string; tela?: string };
  /** Resposta de cuidado ou de limite (fase 200): a tela só responde, não abre perfil nem formulário. */
  cuidado?: boolean;
};

/** As telas onde um texto escrito pela equipe costuma ficar, na ordem em que a casa mais usa. */
export const DESTINOS_DE_TEXTO = ['ata', 'ocorrencias', 'acompanhamentos', 'internacao', 'passagem', 'alinhamentos', 'impacto'];

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** As palavras que a equipe usa para cada tela, além do nome dela. */
const PALAVRAS: Record<string, string[]> = {
  dia: ['dia', 'hoje', 'linha do dia', 'o que tem hoje', 'o que mudou', 'ultimo plantao', 'resumo do dia'],
  chamada: ['chamada', 'presenca', 'quem esta na casa', 'quem esta fora'],
  acolhidos: ['acolhido', 'crianca', 'perfil', 'dossie', 'documento da crianca', 'adolescente'],
  passagem: ['passagem', 'assinar a passagem', 'passar o plantao', 'passou o plantao', 'assinou o plantao', 'assinar o plantao'],
  /* "Quem não passou o plantão" é a pergunta do líder que vai fechar a ATA: é nela que a falta aparece com nome (fase 205). */
  ata: ['ata', 'livro', 'linha da ata', 'registro do turno', 'fechar a ata', 'assinou a ata', 'ronda', 'nao passou o plantao', 'nao passaram o plantao', 'quem nao assinou'],
  /* O nome do remédio e o que se faz com a caixa também levam à Saúde: "o colírio acabou",
     "joguei fora a dipirona vencida" recebiam "não achei" (fase 205). */
  saude: ['saude', 'remedio', 'dose', 'medicac', 'enfermagem', 'receita', 'vacina', 'estoque', 'armario', 'triagem', 'evolucao de saude', 'insulina',
    'colirio', 'xarope', 'pomada', 'comprimido', 'antibiotic', 'dipirona', 'paracetamol', 'ibuprofeno', 'amoxicilina', 'farmacia', 'vencid', 'descart', 'joguei fora', 'suspender', 'suspende'],
  internacao: ['internacao', 'hospital', 'internad'],
  /* O fato contado no passado ("o Felipe brigou com o Bruno", "o Kauã quebrou o vidro")
     recebia "não achei": a lista tinha só o substantivo (fase 205). */
  ocorrencias: ['ocorrencia', 'briga', 'brigou', 'brigaram', 'brigando', 'fuga', 'evasao', 'conflito', 'agressao', 'contencao',
    'quebrou', 'quebraram', 'danific', 'estragou', 'xingou', 'xingando', 'ameacou', 'empurrou', 'mordeu', 'chutou', 'bateu no', 'bateu na', 'bateu em'],
  cozinha: ['cozinha', 'lanche', 'cesta', 'refeic', 'comida', 'restric', 'alergia', 'amendoim', 'nao pode comer', 'dieta'],
  portaria: ['portaria', 'visita', 'visitante', 'portao', 'chegou a tia', 'chegou o tio', 'chegou a avo', 'chegou o avo', 'chegou a mae', 'chegou o pai', 'veio visitar'],
  escala: ['escala', 'folga', 'turno de quem', 'quem trabalha', 'horario do turno', 'horario dos turnos'],
  agenda: ['agenda', 'consulta', 'compromisso', 'audiencia', 'marcado'],
  rotina: ['rotina', 'horario da casa', 'molde do dia'],
  plantao: ['painel do plantao', 'quem esta em que', 'substituic', 'de plantao comigo', 'quem esta de plantao', 'quem ta de plantao'],
  equipe: ['equipe', 'funcionario', 'convite', 'colega', 'conta de', 'educador novo', 'educadora nova', 'cadastrar educador', 'cadastrar educadora', 'profissional novo'],
  alinhamentos: ['combinado', 'reuniao', 'pauta', 'regra de convivencia', 'estatuto'],
  acompanhamentos: ['acompanhamento', 'relatorio mensal', 'relatorio semanal', 'pia'],
  periodo: ['periodo', 'relatorio da casa', 'relatorio do periodo'],
  trabalho: ['trabalho da equipe'],
  unidades: ['todas as unidades', 'dia em ordem', 'dia das unidades'],
  painel: ['painel das unidades', 'limite de vagas', 'vagas', 'ocupacao', 'lotacao'],
  metricas: ['painel', 'numeros', 'oito casas', 'como estao as casas', 'gasto', 'gastamos'],
  avisos: ['aviso', 'sino', 'notificac', 'alerta'],
  sugestoes: ['sugestoes da equipe', 'ver sugestoes'],
  implantacao: ['implantacao', 'backup', 'servidor'],
  impacto: ['trabalho social'],
  cofre: ['cofre', 'senha de acesso', 'credencia'],
  transferencias: ['transferencia'],
  arquivo: ['arquivo documental', 'drive'],
};

const QUER_IR = /\b(me leva|leva|abre|abrir|abra|ir para|vai para|va para|quero ver|mostra|mostrar|entrar em)\b/;
const QUER_SUGERIR = /\b(sugest|sugiro|seria bom|melhoria|melhorar o sistema|poderia ter|devia ter|deveria ter|falta no sistema|nao tem como)\b/;
const QUER_CRIAR = /\b(marcar|marca|criar|cria|cadastrar|cadastra|registrar|registra|escrever|escreve|novo|nova|preencher|preenche|pedir|pede|solicitar|solicita|incluir|inclui|acrescentar|acrescenta|propor|propoe|lancar|lanca|anotar|anota|me ajuda a)\b/;
/* "Quero atividade urgente", "preciso da chegada de uma criança": quer fazer algo na tela, sem o verbo de criar.
   Leva à tela e abre o formulário só se o pedido nomear um botão dela (fase 195). */
/* "Fechar" e "assinar" ficam de fora de propósito: fechar a ATA grava, e quem
   aperta é a pessoa; a assistente só leva à tela (fase 200). */
const QUER_ACAO = /\b(quero|preciso|vou|gostaria|tenho que|pode|chegou|fazer|faz|mudar|muda|trocar|troca|alterar|altera|esqueci|suspender|suspende|descartar|descarta|joguei)\b/;
/* "Quem não pode comer amendoim" é pergunta, não pedido de mexer na tela: a
   licença era pedida à toa (achado fazendo o papel da Cozinha, fase 200). */
const acao = (t: string) => QUER_ACAO.test(t.replace(/\bnao pode\b/g, ' '));
/* "Me ajuda a escrever o que aconteceu na janta": ainda não há o que pôr no rascunho; ela pede o relato (fase 205). */
const QUER_ESCREVER = /\b(ajuda|ajudar|ajude)\b.{0,12}\b(escrever|relatar|registrar|redigir|contar|anotar)\b|\bcomo (eu )?(escrevo|registro|relato|conto)\b.{0,12}\bo que aconteceu\b/;
const QUER_SABER = /\b(o que voce faz|quem e voce|ajuda|como funciona|o que da para fazer|o que posso)\b/;

const comecaPalavra = (t: string, termo: string) => {
  let i = t.indexOf(termo);
  while (i >= 0) {
    if (i === 0 || !/[a-z0-9]/.test(t[i - 1])) return true;
    i = t.indexOf(termo, i + 1);
  }
  return false;
};

/*
 * Palavras que estão em quase toda frase do plantão ("hoje", "dia") pesam pouco:
 * em "fechar a ata de hoje", a ATA tem de ganhar do Dia, e ganhava o mais
 * comprido (achado fazendo o papel do Líder Diurno, fase 200).
 */
const GENERICAS = new Set(['hoje', 'dia', 'painel', 'numeros']);
/*
 * Quem não tem a tela da Saúde (o educador) acha a dose na linha do Dia: estas
 * palavras só valem quando nenhuma tela do pedido casou.
 */
const SECUNDARIAS: Record<string, string[]> = {
  dia: ['dose', 'remedio', 'medicac', 'insulina'],
};

function achar(texto: string, telas: TelaDoGuia[]): TelaDoGuia | null {
  const t = sem(texto);
  const procurar = (dic: Record<string, string[]>, comTitulo: boolean) => {
    let melhor: { tela: TelaDoGuia; peso: number } | null = null;
    for (const tela of telas) {
      const termos = [...(comTitulo ? [sem(tela.titulo)] : []), ...(dic[tela.chave] ?? [])];
      for (const termo of termos) {
        /* No começo de uma palavra (fase 195): "ata" não pode casar dentro de
           "data" nem "batata", senão todo relatório ditado ia para a ATA. */
        const peso = GENERICAS.has(termo) ? 1 : termo.length;
        if (termo && comecaPalavra(t, termo) && (!melhor || peso > melhor.peso)) {
          melhor = { tela, peso };
        }
      }
    }
    return melhor?.tela ?? null;
  };
  return procurar(PALAVRAS, true) ?? procurar(SECUNDARIAS, false);
}

/**
 * Uma conta escrita como a equipe escreve ("quanto é 12,50 + 7,90 x 3"), em
 * forma de conta: vírgula decimal vira ponto, ponto de milhar some, x vira
 * vezes. Devolve null se o texto não for conta.
 */
export function contaDoTexto(texto: string): string | null {
  const m = /[\d(][\d\s.,+\-*/x×÷()%]*[\d)%]/i.exec(texto);
  if (!m || !/\d\s*[+\-*/x×÷%]\s*[\d(]/i.test(m[0])) return null;
  return m[0]
    .replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[x×]/gi, '*')
    .replace(/÷/g, '/')
    .trim();
}

/*
 * O RELATÓRIO PELA VOZ, NO MODO GUIA (fase 195). Sem o modelo, a assistente
 * não reescreve o que a pessoa contou: ela põe o texto no rascunho como veio,
 * com a maiúscula e o ponto final, e sugere onde ele fica. A pessoa confere,
 * acrescenta e leva para a tela. Com o modelo, quem organiza o texto é ele.
 */
const PEDIDO_DE_RELATORIO = /^\s*(relat[oó]rio|rascunho|anota[cç][aã]o|anotar|registro|registrar|escrever)\b[^:]{0,80}:/i;
const QUER_RELATORIO = /\b(fazer|faz|escrever|escreve|montar|monta|criar|cria|ditar|dita)\s+(um|o|uma|a)?\s*(relat[oó]rio|rascunho|registro|relato)\b/;
/* "Preciso registrar que o Bruno caiu no pátio": o que vem depois do "que" é o
   relato, e o lugar dele é o rascunho, não o perfil (fase 200). */
const REGISTRAR_QUE = /\b(registrar|registra|anotar|anota|escrever|escreve|lancar|lanca|colocar|coloca|por)\s+(na ata\s+|no livro\s+)?que\s+/;

function arrumar(t: string): string {
  const x = t.trim().replace(/\s+/g, ' ');
  if (!x) return x;
  const y = x.charAt(0).toUpperCase() + x.slice(1);
  return /[.!?]$/.test(y) ? y : `${y}.`;
}

function rascunhoDoPedido(texto: string, telas: TelaDoGuia[], aceitaLongo: boolean): RespostaDoGuia['rascunho'] | null {
  const t = sem(texto);
  const que = REGISTRAR_QUE.exec(t);
  const explicito = PEDIDO_DE_RELATORIO.test(texto) || QUER_RELATORIO.test(t) || !!que;
  const ditadoLongo = aceitaLongo && texto.trim().length > 160 && !texto.includes('?');
  if (!explicito && !ditadoLongo) return null;
  const doisPontos = texto.indexOf(':');
  /* `sem()` não muda o comprimento do texto (só tira o acento), então o fim do
     "registrar que" em `t` é o mesmo lugar no texto original. */
  const corpo = que ? texto.slice(que.index + que[0].length)
    : explicito && doisPontos >= 0 && doisPontos < 120 ? texto.slice(doisPontos + 1) : texto;
  if (corpo.trim().length < 8) return null;
  const destinos = telas.filter((x) => DESTINOS_DE_TEXTO.includes(x.chave));
  const tela = achar(texto, destinos)?.chave;
  const titulo = tela ? `para ${destinos.find((d) => d.chave === tela)?.titulo ?? tela}` : 'relatório';
  return { titulo, texto: arrumar(corpo), tela };
}


/*
 * O CUIDADO VEM ANTES DA TELA (fase 200; pedido de 11/10: "seja um funcionário
 * de cada setor testando a Acolhe").
 *
 * Fazendo o papel da educadora de plantão, "o Kauã fugiu" e "a Lara tá com
 * febre, o que eu faço" recebiam "Não achei essa tela": o pior momento do turno
 * tinha a resposta mais inútil. E os pedidos que ferem as regras da Fundação
 * (comparar crianças, rotular, mandar por WhatsApp, apagar, confirmar a dose de
 * outra pessoa) eram tratados como busca de tela, sem dizer não nem por quê.
 *
 * Aqui a assistente diz primeiro o que protege a criança, e depois o caminho no
 * sistema, com a frase da própria tela de Ocorrências: o registro nunca atrasa a
 * proteção. Ela nunca decide diagnóstico, remédio nem risco: diz quem decide.
 * Não navega sozinha numa urgência; deixa o caminho como link.
 */
const URGENCIA_FUGA = /\b(fugiu|fugir|fugindo|fuga|fugiram|evadiu|evasao|sumiu|sumiram|desapareceu|nao voltou|nao voltaram|pulou o muro|saiu sem (avisar|autorizacao|permissao))\b/;
const URGENCIA_SAUDE = /\b(convuls\w*|desmai\w*|nao (esta |ta )?respirando|engasg\w*|sangrando|muito sangue|engoliu|intoxic\w*|overdose|queimou|queimadura|bateu a cabeca|inconsciente|desacordad\w*|se cortou|se cortando|automutil\w*|se matar|suicid\w*|quer morrer)\b/;
const VIOLENCIA = /\b(abus\w*|violencia|violentad\w*|estupr\w*|bateu nel[ae]|bateram nel[ae]|apanhou|apanhando|assedi\w*|tocou nel[ae]|mexeu com el[ae])\b/;
/* "O sistema caiu" não é tombo. */
const CAIU_SEM_SER_GENTE = /\b(sistema|internet|rede|wifi|luz|energia|servidor|pagina|tela|sinal|ligacao)\s+(\w+\s+)?caiu\b/;
const SAUDE_COMUM = /\b(febre|dor de|com dor|vomit\w*|diarreia|tosse|gripad\w*|machuc\w*|caiu|tombo|ferid\w*|piolho|coceira|mancha|passando mal|nao quer comer|nao comeu)\b/;
const COMPARAR = /\b(compar\w*|ranking|ranque\w*|classifica\w*|top \d)\b|\b(qual|quais|quem|que)\b.{0,40}\b(crianca|criancas|acolhid\w*|menin\w*|educador\w*|colega\w*|funcionari\w*|casa|casas|unidade\w*|equipe\w*)\b.{0,40}\b(mais|menos|pior|piores|melhor|melhores)\b/;
const ROTULO = /\b(agressiv\w*|problematic\w*|mentiros\w*|manipulador\w*|perigos\w*|preguicos\w*|sem jeito|mal educad\w*|dificil de lidar)\b/;
const CONTAR_PESSOA = /\b(quantas faltas|faltando muito|falta muito|registra menos|registra mais|produtiv\w*|desempenho)\b/;
const FORA_DO_SISTEMA = /\b(whats\w*|zap|zapzap|telegram|instagram|facebook|grupo de mensagem|grupo da casa)\b/;
const APAGAR = /\b(apaga|apagar|apague|deleta|deletar|exclui|excluir|remove|remover|desfaz|desfazer|sumir com)\b/;
const NO_LUGAR_DE = /\b(confirm\w*|marca\w*|dar baixa|da baixa|assina\w*)\b.{0,60}\b(por mim|pra mim|para mim|no meu lugar|por ela|por ele|pela colega|pelo colega)\b/;
/*
 * O QUE O PLANTÃO DIZ E O GUIA NÃO OUVIA (fase 205; pedido de 12/10: "procure mais
 * bugs na Acolhe+AI em cada setor"). Fazendo o papel de cada setor outra vez, a
 * criança chorando sem parar, o pesadelo, a mãe ao telefone, o homem no portão
 * dizendo ser o pai e o colega que não veio recebiam "não achei essa tela".
 */
const PARENTE = '(mae|pai|avo|avos|tia|tio|irma|irmao|madrinha|padrinho|familia|parente|genitor\\w*|padrasto|madrasta|responsavel)';
/* Alguém de fora quer entrar ou levar a criança: a resposta é a da proteção, não a da tela. */
const LEVAR_A_CRIANCA = new RegExp(`\\b(quer|querendo|veio|vieram|vem)\\s+(\\w+\\s+)?(levar|buscar|pegar|tirar)\\b|\\b(dizendo|diz|disse|falando|fala) que (e|eh) (o |a )?${PARENTE}\\b|\\b(homem|mulher|pessoa|alguem|um cara|uma moca|desconhecid\\w*|estranh\\w*)\\b.{0,40}\\b(quer entrar|querendo entrar|no portao|na porta|no muro)\\b`);
const CONTATO_DA_FAMILIA = new RegExp(`\\b${PARENTE}\\b.{0,50}\\b(ligou|liga|ligando|telefonou|quer falar|querendo falar|quer ver|querendo ver|mandou mensagem|mandou audio|quer visitar|pediu para falar|pediu pra falar)\\b`);
const EMOCAO = /\b(chorando|chorou|chora muito|nao para de chorar|choro|crise|surtando|surtou|descontrolad\w*|gritando|se debatendo|pesadelo\w*|ansios\w*|apavorad\w*|com medo|assustad\w*|triste|tristeza|saudade|nao consegue dormir|nao quer dormir|sem dormir)\b/;
const COLEGA = '(educador\\w*|colega\\w*|funcionari\\w*|plantonista\\w*|enfermeir\\w*|cozinheir\\w*|porteir\\w*|lider)';
const COLEGA_FALTOU = new RegExp(`\\b${COLEGA}\\b.{0,40}\\b(nao veio|nao vem|nao apareceu|faltou|vai faltar|atrasad\\w*|atrasou|esta atrasad\\w*|ta atrasad\\w*|foi embora|saiu mais cedo|passou mal)\\b`);
/* A entrada só se registra com o documento que a portaria olhou (fase 160). */
const SEM_DOCUMENTO = /\b(sem documento|sem o documento|sem rg|sem identidade|sem carteira|esqueceu o documento|nao trouxe (o )?documento|sem foto no documento)\b/;
const OBRIGADO = /^(muito )?(obrigad\w*|brigad\w*|valeu|vlw|obg|tmj)\b/;
const OI = /^(oi+|ola|bom dia|boa tarde|boa noite|e ai|opa)\b[\s!.,]*(acolhe\w*)?[\s!.,]*$/;
const SENHA = /\bsenha\b/;

function link(telas: TelaDoGuia[], chave: string, rotulo: string): string {
  return telas.some((x) => x.chave === chave) ? ` [${rotulo}](tela:${chave})` : '';
}

function primeiroOCuidado(t: string, telas: TelaDoGuia[]): string | null {
  const ocorrencia = link(telas, 'ocorrencias', 'Registrar ocorrência');
  const depois = ocorrencia
    ? ` Quando der, registre a ocorrência com o mínimo e complete depois:${ocorrencia}`
    : ' Quando der, o líder do plantão registra a ocorrência.';
  if (URGENCIA_SAUDE.test(t)) {
    return 'Se é emergência, ligue agora para o SAMU, no 192, chame o líder do plantão e fique com a criança. '
      + `O registro nunca atrasa o atendimento.${depois}`;
  }
  if (VIOLENCIA.test(t)) {
    return 'Primeiro a proteção: afaste a criança do risco e avise agora o líder do plantão e a coordenação. '
      + 'Se ela contar alguma coisa, acolha sem perguntar detalhes e escreva com as palavras dela. '
      + `O caminho é a ocorrência de violência ou suspeita, que tem acesso restrito.${depois}`;
  }
  if (URGENCIA_FUGA.test(t)) {
    return 'Primeiro a criança: avise agora o líder do plantão e siga o protocolo da casa para saída não autorizada. '
      + `O registro nunca atrasa a proteção.${depois}`;
  }
  if (LEVAR_A_CRIANCA.test(t)) {
    return 'Não abra o portão nem entregue a criança. Só entra quem está na lista de quem pode visitar aquela criança, '
      + 'com documento conferido, e ninguém sai com ela sem a saída registrada pela equipe técnica. '
      + 'Chame agora o líder do plantão ou a coordenação, e fique com a criança longe do portão. '
      + 'Dizer que é da família não basta: há contato com aproximação restrita, e quem sabe é a equipe.'
      + link(telas, 'portaria', 'Ver quem pode visitar');
  }
  if (SEM_DOCUMENTO.test(t)) {
    return 'A entrada só se registra com o documento conferido, de preferência com foto, e sem ele o sistema não aceita. '
      + 'Não deixe entrar: chame a coordenação, a técnica ou o líder do plantão, que conversam com a família. '
      + 'Se for alguém que a criança esperava, explique com calma que é para a proteção dela.'
      + link(telas, 'portaria', 'Abrir a Portaria');
  }
  if (EMOCAO.test(t)) {
    return 'Primeiro ela: fique perto, com calma e sem pressa, num canto mais tranquilo, e ofereça água ou colo se ela aceitar. '
      + 'Não precisa resolver agora nem perguntar o porquê. Se não passar, ou se houver risco para ela ou para alguém, '
      + 'chame o líder do plantão e a equipe técnica. Depois, escreva na ATA o que aconteceu e o que ajudou: '
      + 'é o que a próxima equipe precisa saber.' + link(telas, 'ata', 'Abrir a ATA');
  }
  if (CONTATO_DA_FAMILIA.test(t)) {
    return 'Antes de passar o telefone ou marcar, confira no perfil da criança, nos contatos, se esse contato é permitido: '
      + 'a aproximação restrita aparece em destaque. Na dúvida, não passe e avise o líder do plantão. '
      + 'O contato com a família passa pela equipe técnica, e o que foi conversado fica na ATA.'
      + link(telas, 'acolhidos', 'Abrir os Acolhidos');
  }
  if (COLEGA_FALTOU.test(t)) {
    return 'Avise o líder do plantão e a coordenação, que resolvem a substituição. Quem cobriu fica registrado no Painel do plantão, '
      + 'e a escala mostra quem estava escalado. Escreva na ATA como o turno ficou. '
      + 'O sistema não conta faltas de ninguém: isso se conversa com a pessoa.'
      + (link(telas, 'plantao', 'Abrir o Painel do plantão') || link(telas, 'escala', 'Abrir a escala'));
  }
  if (NO_LUGAR_DE.test(t)) {
    return 'Isso não dá: cada dose e cada assinatura são de quem fez, na conta de quem fez. Ninguém confirma pelo outro, nem eu. '
      + 'Se a colega deu o remédio e não confirmou, peça a ela; se não for possível, escreva na ATA o que aconteceu.'
      + link(telas, 'ata', 'Abrir a ATA');
  }
  if (FORA_DO_SISTEMA.test(t)) {
    return 'Por mensagem fora do sistema não: é regra da Fundação que nada sobre a criança vá por WhatsApp ou grupo. '
      + 'O contato com a família passa pela equipe técnica, e o que aconteceu fica registrado aqui, com o seu nome.';
  }
  if (COMPARAR.test(t)) {
    return 'Isso eu não faço: o sistema não compara nem ordena crianças, pessoas ou casas, por regra da Fundação. '
      + 'Cada uma tem a sua história e o seu contexto, e número lado a lado vira julgamento. '
      + 'Os números de cada casa existem, cada um olhado por si.'
      + (link(telas, 'painel', 'Painel das unidades') || link(telas, 'periodo', 'O período da casa'));
  }
  if (CONTAR_PESSOA.test(t)) {
    return 'O sistema não conta nem compara pessoas da equipe, de propósito. Falta e combinado de trabalho se conversa '
      + 'com a pessoa e com a coordenação. A escala mostra quem estava em cada turno.' + link(telas, 'escala', 'Abrir a escala');
  }
  if (ROTULO.test(t)) {
    return 'Não faço avaliação sobre a criança: o sistema não dá rótulo nem nota de comportamento. '
      + 'O que ajuda é o fato, o que aconteceu, quando e quem viu, e quem lê e decide é a equipe técnica.'
      + link(telas, 'acolhidos', 'Abrir os Acolhidos');
  }
  if (APAGAR.test(t)) {
    return 'Aqui nada se apaga, nem o que saiu errado: é o que garante a história da criança e de quem escreveu. '
      + 'O caminho é escrever a correção ou o complemento, com o seu nome e a hora, ao lado do que estava.'
      + (achar(t, telas) ? link(telas, achar(t, telas)!.chave, `Abrir ${achar(t, telas)!.titulo}`) : '');
  }
  if (SAUDE_COMUM.test(t) && !CAIU_SEM_SER_GENTE.test(t)) {
    return 'Não oriento sobre remédio nem diagnóstico: isso é da Enfermagem. Avise a Enfermagem ou o líder do plantão. '
      + 'Remédio de se necessário só com a condição escrita na prescrição, e quem dá é quem confirma. '
      + 'Se piorar ou parecer urgência, ligue para o SAMU, no 192.'
      + (link(telas, 'saude', 'Abrir a Saúde') || link(telas, 'dia', 'Ver as doses no Dia'));
  }
  if (OBRIGADO.test(t)) return 'De nada! Estou por aqui quando precisar.';
  if (SENHA.test(t) && !/\b(cofre|acesso|credencia)/.test(t)) {
    return 'A sua senha se troca no botão da senha, no alto da tela; no celular, ele fica em Minha conta. '
      + 'Esqueceu a senha? Na tela de entrada há o Esqueci minha senha, e o link chega no seu e-mail.';
  }
  return null;
}

export function responderPeloGuia(texto: string, telas: TelaDoGuia[], primeira: boolean): RespostaDoGuia {
  const t = sem(texto);
  const aviso = primeira
    ? 'Estou no modo guia: explico as telas, levo você até elas e anoto sugestões. Para ler os dados e montar relatórios, a Acolhe+AI precisa estar ligada na instalação.\n\n'
    : '';

  const comRascunho = (r: NonNullable<RespostaDoGuia['rascunho']>): RespostaDoGuia => ({
    texto: `${aviso}Montei o rascunho com o que você contou. Confira, mude o que quiser, acrescente falando ou anexe foto. Quando estiver bom, aperte Está bom${r.tela ? '' : ' e escolha onde ele vai ficar'}.`,
    rascunho: r,
  });
  /* O pedido explícito de relatório vem primeiro; o texto longo ditado sem
     pedido vira rascunho só depois de não ser ida a uma tela nem sugestão. */
  const pedido = rascunhoDoPedido(texto, telas, false);
  if (pedido) return comRascunho(pedido);

  /* O cuidado vem antes de qualquer tela (fase 200). Num ditado longo, o
     relato vira rascunho logo abaixo: "fugiu" no meio de um relatório é fato
     contado, não urgência acontecendo. */
  if (texto.trim().length <= 160) {
    const cuidado = primeiroOCuidado(t, telas);
    if (cuidado) return { texto: `${aviso}${cuidado}`, cuidado: true };
    if (OI.test(t) && !primeira) return { texto: 'Oi! Diga o que precisa: levo você a uma tela, abro um formulário ou monto um rascunho com o que você contar.' };
  }

  /* Ir a uma tela vem antes da sugestão: "me leva para as Sugestões de melhoria"
     é ir, e não sugerir (a palavra "melhoria" enganava o guia; fase 195). */
  const telaPedida = achar(texto, telas);
  if (telaPedida && QUER_IR.test(t) && !QUER_CRIAR.test(t)) {
    return { texto: `${aviso}Abrindo ${telaPedida.titulo}.`, ir: telaPedida.chave };
  }

  if (QUER_SUGERIR.test(t)) {
    return {
      texto: `${aviso}Posso registrar isso como sugestão de melhoria, com o seu nome, para a coordenação, a gestão e a TI lerem. Confira abaixo e confirme.`,
      sugestao: texto.trim(),
    };
  }

  const longo = rascunhoDoPedido(texto, telas, true);
  if (longo) return comRascunho(longo);

  const conta = contaDoTexto(texto);
  if (conta) return { texto: `${aviso}Fiz a conta para você.`, conta };

  const tela = achar(texto, telas);
  if (tela) {
    if (QUER_CRIAR.test(t)) {
      /* Só "Abrindo": a frase do formulário vem depois, e só se ele abrir. Prometer
         antes fazia a portaria ler "vou abrir o formulário" e logo "não achei" (fase 203). */
      return { texto: `${aviso}Abrindo ${tela.titulo}.`, ir: tela.chave, abrirFormulario: true };
    }
    /* O fato contado sem pedido ("o Felipe brigou com o Bruno no pátio"): o cuidado
       antes, e o caminho do registro como link. Não abre perfil de quem foi nomeado:
       a ocorrência é da casa, e quem está envolvido entra nos detalhes (fase 205). */
    if (tela.chave === 'ocorrencias' && !QUER_IR.test(t) && !acao(t) && !ehPergunta(texto)) {
      return { texto: `${aviso}Isso se registra como ocorrência. Se alguém se machucou, o cuidado vem antes, e o líder do plantão precisa saber agora. Quando der, escreva o que você viu, sem julgar ninguém: [Registrar ocorrência](tela:ocorrencias)`, cuidado: true };
    }
    const link = `[Abrir ${tela.titulo}](tela:${tela.chave})`;
    const explica = tela.frase ? `${tela.titulo}: ${tela.frase}` : tela.titulo;
    if (QUER_IR.test(t)) return { texto: `${aviso}Abrindo ${tela.titulo}.`, ir: tela.chave };
    if (acao(t)) return { texto: `${aviso}Abrindo ${tela.titulo}.`, ir: tela.chave };
    return { texto: `${aviso}${explica}\n\n${link}` };
  }

  if (QUER_ESCREVER.test(t)) {
    return { texto: `${aviso}Me conte o que aconteceu, do jeito que vier, escrevendo aqui ou pelo microfone. Eu monto um rascunho para você conferir, e depois você escolhe onde ele fica: na ATA, numa ocorrência ou num acompanhamento. Só os fatos: o que aconteceu, quando, quem estava e o que foi feito.` };
  }

  if (QUER_SABER.test(t) || primeira) {
    const naoAchei = QUER_SABER.test(t) || OI.test(t) ? '' : 'Esse pedido eu não reconheci. ';
    const algumas = telas.slice(0, 6).map((x) => `[${x.titulo}](tela:${x.chave})`).join('  ');
    return {
      texto: `${aviso}${naoAchei}Eu sou a Acolhe+AI, da equipe do Rede Acolher. Posso explicar o que cada tela faz, levar você até ela ("me leva para a chamada"), abrir o formulário ("quero marcar um compromisso"), fazer contas ("quanto é 12,50 + 7,90"), ler esta tela em voz alta e anotar sugestões para o sistema melhorar.\n\nAlgumas telas suas: ${algumas}`,
    };
  }
  return {
    texto: 'Não achei essa tela nas que você alcança. Tente com o nome da tela ("abrir a escala"), ou diga o que quer fazer. Se for algo que o sistema não faz, posso anotar como sugestão.',
  };
}

/**
 * A CRIANÇA NOMEADA NO PEDIDO (fase 196). *"Abre o perfil da Alice"*, *"quero
 * registrar a restrição alimentar do Bruno"*: o perfil é o lugar da criança, e
 * os formulários dele (saúde, contato, conquista, educação, o que ela contou)
 * só aparecem com ele aberto. A lista é a que a casa já lê (a mesma da busca do
 * topo), então só entram as crianças da casa aberta que a pessoa vê.
 *
 * O nome conta como palavra inteira, sem acento e pelo começo do nome (o primeiro
 * nome, ou o nome social). Para não abrir perfil quando *Vitória* é só a palavra,
 * o pedido precisa dizer o que quer com ela: abrir, ver, registrar, escrever,
 * querer. Duas crianças com o mesmo primeiro nome: desempata o sobrenome dito, e
 * sem ele quem decide é a pessoa (a resposta traz as duas).
 */
export type CriancaDaCasa = { id: string; nome: string };
const QUER_A_CRIANCA = /\b(perfil|ficha|abre|abrir|abra|leva|mostra|mostrar|ver|quero|preciso|vou|gostaria|pode|registrar|registra|escrever|escreve|lancar|lanca|anotar|anota|acrescentar|acrescenta|atualizar|atualiza|cadastrar|incluir|alergic\w*|alergia|escola|idade|aniversario|documento|receita|vacina\w*)\b/;

export function criancasNoPedido(texto: string, lista: CriancaDaCasa[]): CriancaDaCasa[] {
  const t = sem(texto);
  if (!QUER_A_CRIANCA.test(t)) return [];
  const palavras = new Set(t.split(/[^a-z0-9]+/).filter(Boolean));
  const achadas = lista
    .map((c) => {
      const partes = sem(c.nome).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
      if (!partes.length || !palavras.has(partes[0])) return null;
      return { c, pontos: partes.filter((w) => palavras.has(w)).length };
    })
    .filter((x): x is { c: CriancaDaCasa; pontos: number } => !!x);
  const melhor = Math.max(0, ...achadas.map((x) => x.pontos));
  return achadas.filter((x) => x.pontos === melhor).map((x) => x.c);
}

/** O pedido diz só "abrir o perfil", sem formulário? Então abrir basta. */
export function pedeFormulario(texto: string): boolean {
  return QUER_CRIAR.test(sem(texto));
}

/** O pedido quer fazer algo (criar, ou "quero", "preciso"), e não só saber. */
export function pedeAcao(texto: string): boolean {
  const t = sem(texto);
  return QUER_CRIAR.test(t) || acao(t);
}

/** É pergunta sobre a criança ("a Lara é alérgica a quê?"), e não pedido de registrar: abre o perfil, sem formulário. */
export function ehPergunta(texto: string): boolean {
  const t = sem(texto).trim();
  return /\?/.test(t) || /^(o que|a que|qual|quais|quem|quando|onde|como|tem|sera)\b/.test(t)
    || /\b(e|eh)\s+alergic/.test(t) || /\b(a|de) que\s*$/.test(t);
}

