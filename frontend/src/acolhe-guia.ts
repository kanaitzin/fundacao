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
};

/** As telas onde um texto escrito pela equipe costuma ficar, na ordem em que a casa mais usa. */
export const DESTINOS_DE_TEXTO = ['ata', 'ocorrencias', 'acompanhamentos', 'internacao', 'passagem', 'alinhamentos', 'impacto'];

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** As palavras que a equipe usa para cada tela, além do nome dela. */
const PALAVRAS: Record<string, string[]> = {
  dia: ['dia', 'hoje', 'linha do dia', 'o que tem hoje'],
  chamada: ['chamada', 'presenca', 'quem esta na casa', 'quem esta fora'],
  acolhidos: ['acolhido', 'crianca', 'perfil', 'dossie', 'documento da crianca', 'adolescente'],
  passagem: ['passagem', 'assinar a passagem', 'passar o plantao'],
  ata: ['ata', 'livro', 'linha da ata', 'registro do turno'],
  saude: ['saude', 'remedio', 'dose', 'medicac', 'enfermagem', 'receita', 'vacina'],
  internacao: ['internacao', 'hospital', 'internad'],
  ocorrencias: ['ocorrencia', 'briga', 'fuga', 'evasao', 'conflito', 'agressao', 'contencao'],
  cozinha: ['cozinha', 'lanche', 'cesta', 'refeic', 'comida', 'restric', 'alergia'],
  portaria: ['portaria', 'visita', 'visitante', 'portao'],
  escala: ['escala', 'folga', 'turno de quem', 'quem trabalha'],
  agenda: ['agenda', 'consulta', 'compromisso', 'audiencia', 'marcado'],
  rotina: ['rotina', 'horario da casa', 'molde do dia'],
  plantao: ['painel do plantao', 'quem esta em que'],
  equipe: ['equipe', 'funcionario', 'convite', 'colega', 'conta de'],
  alinhamentos: ['combinado', 'reuniao', 'pauta', 'regra de convivencia', 'estatuto'],
  acompanhamentos: ['acompanhamento', 'relatorio mensal', 'relatorio semanal', 'pia'],
  periodo: ['periodo', 'relatorio da casa', 'relatorio do periodo'],
  trabalho: ['trabalho da equipe'],
  unidades: ['todas as unidades', 'dia em ordem', 'dia das unidades'],
  metricas: ['painel', 'numeros', 'oito casas'],
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
const QUER_ACAO = /\b(quero|preciso|vou|gostaria|tenho que|pode|chegou)\b/;
const QUER_SABER = /\b(o que voce faz|quem e voce|ajuda|como funciona|o que da para fazer|o que posso)\b/;

const comecaPalavra = (t: string, termo: string) => {
  let i = t.indexOf(termo);
  while (i >= 0) {
    if (i === 0 || !/[a-z0-9]/.test(t[i - 1])) return true;
    i = t.indexOf(termo, i + 1);
  }
  return false;
};

function achar(texto: string, telas: TelaDoGuia[]): TelaDoGuia | null {
  const t = sem(texto);
  let melhor: { tela: TelaDoGuia; peso: number } | null = null;
  for (const tela of telas) {
    const termos = [sem(tela.titulo), ...(PALAVRAS[tela.chave] ?? [])];
    for (const termo of termos) {
      /* No começo de uma palavra (fase 195): "ata" não pode casar dentro de
         "data" nem "batata", senão todo relatório ditado ia para a ATA. */
      if (termo && comecaPalavra(t, termo) && (!melhor || termo.length > melhor.peso)) {
        melhor = { tela, peso: termo.length };
      }
    }
  }
  return melhor?.tela ?? null;
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

function arrumar(t: string): string {
  const x = t.trim().replace(/\s+/g, ' ');
  if (!x) return x;
  const y = x.charAt(0).toUpperCase() + x.slice(1);
  return /[.!?]$/.test(y) ? y : `${y}.`;
}

function rascunhoDoPedido(texto: string, telas: TelaDoGuia[], aceitaLongo: boolean): RespostaDoGuia['rascunho'] | null {
  const t = sem(texto);
  const explicito = PEDIDO_DE_RELATORIO.test(texto) || QUER_RELATORIO.test(t);
  const ditadoLongo = aceitaLongo && texto.trim().length > 160 && !texto.includes('?');
  if (!explicito && !ditadoLongo) return null;
  const doisPontos = texto.indexOf(':');
  const corpo = explicito && doisPontos >= 0 && doisPontos < 120 ? texto.slice(doisPontos + 1) : texto;
  if (corpo.trim().length < 8) return null;
  const destinos = telas.filter((x) => DESTINOS_DE_TEXTO.includes(x.chave));
  const tela = achar(texto, destinos)?.chave;
  const titulo = tela ? `para ${destinos.find((d) => d.chave === tela)?.titulo ?? tela}` : 'relatório';
  return { titulo, texto: arrumar(corpo), tela };
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
      return { texto: `${aviso}Vou abrir ${tela.titulo} e o formulário para você. Preencha e salve quando estiver certo.`, ir: tela.chave, abrirFormulario: true };
    }
    const link = `[Abrir ${tela.titulo}](tela:${tela.chave})`;
    const explica = tela.frase ? `${tela.titulo}: ${tela.frase}` : tela.titulo;
    if (QUER_IR.test(t)) return { texto: `${aviso}Abrindo ${tela.titulo}.`, ir: tela.chave };
    if (QUER_ACAO.test(t)) return { texto: `${aviso}Abrindo ${tela.titulo}.`, ir: tela.chave };
    return { texto: `${aviso}${explica}\n\n${link}` };
  }

  if (QUER_SABER.test(t) || primeira) {
    const algumas = telas.slice(0, 6).map((x) => `[${x.titulo}](tela:${x.chave})`).join('  ');
    return {
      texto: `${aviso}Eu sou a Acolhe+AI, da equipe do Rede Acolher. Posso explicar o que cada tela faz, levar você até ela ("me leva para a chamada"), abrir o formulário ("quero marcar um compromisso"), fazer contas ("quanto é 12,50 + 7,90"), ler esta tela em voz alta e anotar sugestões para o sistema melhorar.\n\nAlgumas telas suas: ${algumas}`,
    };
  }
  return {
    texto: 'Não achei essa tela nas que você alcança. Tente com o nome da tela ("abrir a escala"), ou diga o que quer fazer. Se for algo que o sistema não faz, posso anotar como sugestão.',
  };
}
