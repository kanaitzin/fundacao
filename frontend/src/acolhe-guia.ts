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
};

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
const QUER_CRIAR = /\b(marcar|marca|criar|cria|cadastrar|cadastra|registrar|registra|escrever|escreve|novo|nova|preencher|preenche|pedir|pede|solicitar|incluir|me ajuda a)\b/;
const QUER_SABER = /\b(o que voce faz|quem e voce|ajuda|como funciona|o que da para fazer|o que posso)\b/;

function achar(texto: string, telas: TelaDoGuia[]): TelaDoGuia | null {
  const t = sem(texto);
  let melhor: { tela: TelaDoGuia; peso: number } | null = null;
  for (const tela of telas) {
    const termos = [sem(tela.titulo), ...(PALAVRAS[tela.chave] ?? [])];
    for (const termo of termos) {
      if (termo && t.includes(termo) && (!melhor || termo.length > melhor.peso)) {
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

export function responderPeloGuia(texto: string, telas: TelaDoGuia[], primeira: boolean): RespostaDoGuia {
  const t = sem(texto);
  const aviso = primeira
    ? 'Estou no modo guia: explico as telas, levo você até elas e anoto sugestões. Para ler os dados e montar relatórios, a Acolhe+AI precisa estar ligada na instalação.\n\n'
    : '';

  if (QUER_SUGERIR.test(t)) {
    return {
      texto: `${aviso}Posso registrar isso como sugestão de melhoria, com o seu nome, para a coordenação, a gestão e a TI lerem. Confira abaixo e confirme.`,
      sugestao: texto.trim(),
    };
  }

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
