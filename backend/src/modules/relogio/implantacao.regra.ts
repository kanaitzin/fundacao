/**
 * A REGRA DE CADA SINAL DA SAÚDE DA IMPLANTAÇÃO (fase 185).
 *
 * ESTE ARQUIVO NÃO IMPORTA NADA, de propósito, como o `alcance.ts`: o servidor
 * e o protótipo leem a MESMA regra, e o que a demonstração mostra é o que o
 * servidor responde.
 */
export type EstadoDoSinal = 'em_dia' | 'atencao' | 'parado' | 'sem_registro';

export interface Sinal {
  cod: string;
  titulo: string;
  estado: EstadoDoSinal;
  frase: string;
  /** Quando foi o último registro, deu certo ou não. */
  ultimoEm: string | null;
  ultimoOkEm: string | null;
  falhas7d: number;
}

export interface Evento { ultimo: { em: string; ok: boolean; detalhe: Record<string, unknown> } | null;
  ultimoOk: string | null; falhas7d: number }

const HORA = 3_600_000;
const DIA = 24 * HORA;

/** "há 3 horas", "há 2 dias": a frase da tela, sem data por extenso. */
export function haQuanto(ms: number): string {
  if (ms < 2 * 60_000) return 'agora há pouco';
  if (ms < HORA) return `há ${Math.round(ms / 60_000)} minutos`;
  if (ms < 2 * HORA) return 'há 1 hora';
  if (ms < 2 * DIA) return `há ${Math.round(ms / HORA)} horas`;
  return `há ${Math.round(ms / DIA)} dias`;
}

/**
 * A REGRA DE CADA SINAL. Os prazos são os do próprio funcionamento:
 * o relógio e o backup rodam uma vez por dia (26 horas dá a folga de uma
 * madrugada atrasada), o aviso de meia hora roda de dez em dez minutos, e a
 * restauração conferida, que é manual, pede-se uma vez por mês.
 */
export function avaliar(cod: string, e: Evento | undefined, agora: number): Omit<Sinal, 'cod' | 'titulo'> {
  const ultimoEm = e?.ultimo?.em ?? null;
  const ultimoOkEm = e?.ultimoOk ?? null;
  const falhas7d = Number(e?.falhas7d ?? 0);
  const base = { ultimoEm, ultimoOkEm, falhas7d };
  const desdeOk = ultimoOkEm ? agora - new Date(ultimoOkEm).getTime() : Infinity;
  const quandoOk = ultimoOkEm ? haQuanto(desdeOk) : '';

  if (!e?.ultimo) {
    const frase: Record<string, string> = {
      backup: 'Nenhum backup anotado neste servidor. O backup.sh desta versão anota ao terminar.',
      restauracao: 'Nenhuma restauração conferida anotada. Rode scripts/restaurar.sh --ensaio.',
      relogio: 'O relógio das 5h nunca rodou neste servidor. Sem ele, o dia da casa não nasce.',
      fim_do_plantao: 'O aviso de meia hora antes do fim do plantão nunca rodou neste servidor.',
      email: 'Nenhum e-mail saiu ainda deste servidor.',
    };
    return { ...base, estado: cod === 'email' ? 'em_dia' : 'sem_registro', frase: frase[cod] ?? 'Sem registro.' };
  }

  if (!e.ultimo.ok) {
    const frase: Record<string, string> = {
      backup: 'O último backup FALHOU.',
      restauracao: 'A última restauração conferida FALHOU: o backup pode não voltar.',
      relogio: 'A última rodada do relógio teve falha: o dia de alguma casa pode estar incompleto.',
      fim_do_plantao: 'A última rodada do aviso de meia hora falhou.',
      email: 'O último e-mail NÃO saiu. Convites podem não estar chegando.',
    };
    return { ...base, estado: 'parado',
      frase: `${frase[cod] ?? 'A última rodada falhou.'}${ultimoOkEm ? ` O último que deu certo foi ${quandoOk}.` : ''}` };
  }

  switch (cod) {
    case 'backup':
      if (desdeOk <= 26 * HORA) return { ...base, estado: 'em_dia', frase: `Último backup ${quandoOk}.` };
      if (desdeOk <= 3 * DIA) return { ...base, estado: 'atencao', frase: `O último backup foi ${quandoOk}. Ele roda toda madrugada.` };
      return { ...base, estado: 'parado', frase: `O último backup foi ${quandoOk}. Ele roda toda madrugada: confira o cron do servidor.` };
    case 'restauracao':
      if (desdeOk <= 35 * DIA) return { ...base, estado: 'em_dia', frase: `Restauração conferida ${quandoOk}.` };
      return { ...base, estado: 'atencao', frase: `A última restauração conferida foi ${quandoOk}. Confira uma vez por mês.` };
    case 'relogio':
      if (desdeOk <= 26 * HORA) return { ...base, estado: 'em_dia', frase: `O dia nasceu ${quandoOk}.` };
      return { ...base, estado: 'parado', frase: `O último dia gerado pelo relógio foi ${quandoOk}: doses e atividades de hoje podem não existir.` };
    case 'fim_do_plantao':
      if (desdeOk <= 25 * 60_000) return { ...base, estado: 'em_dia', frase: `Rodou ${quandoOk}.` };
      if (desdeOk <= 2 * HORA) return { ...base, estado: 'atencao', frase: `Rodou ${quandoOk}. Ele roda de dez em dez minutos.` };
      return { ...base, estado: 'parado', frase: `Rodou pela última vez ${quandoOk}. Confira o cron do servidor.` };
    default:
      return { ...base, estado: 'em_dia', frase: `O último e-mail saiu ${quandoOk}.` };
  }
}

export function avaliarDrive(d: { aguardando?: number; falhou?: number; maisAntigoAguardando?: string | null;
  ultimoEnviado?: string | null } | null, agora: number): Omit<Sinal, 'cod' | 'titulo'> {
  const aguardando = Number(d?.aguardando ?? 0);
  const falhou = Number(d?.falhou ?? 0);
  const base = { ultimoEm: d?.ultimoEnviado ?? null, ultimoOkEm: d?.ultimoEnviado ?? null, falhas7d: 0 };
  if (falhou > 0) {
    return { ...base, estado: 'parado',
      frase: `${falhou} ${falhou === 1 ? 'documento não conseguiu' : 'documentos não conseguiram'} ir para o Drive. A lista está no Arquivo documental.` };
  }
  const espera = d?.maisAntigoAguardando ? agora - new Date(d.maisAntigoAguardando).getTime() : 0;
  if (aguardando > 0 && espera > DIA) {
    return { ...base, estado: 'atencao',
      frase: `${aguardando} na fila, e o mais antigo espera desde ${haQuanto(espera)}.` };
  }
  return { ...base, estado: 'em_dia',
    frase: aguardando ? `${aguardando} na fila, andando.` : 'Fila vazia: tudo o que fechou já foi para o Drive.' };
}

export const TITULOS: [string, string][] = [
  ['relogio', 'O relógio das 5h'],
  ['fim_do_plantao', 'O aviso de meia hora antes do fim do plantão'],
  ['backup', 'O backup da madrugada'],
  ['restauracao', 'A restauração conferida'],
  ['email', 'O e-mail'],
];
