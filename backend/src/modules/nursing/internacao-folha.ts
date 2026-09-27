/**
 * O RELATÓRIO DA INTERNAÇÃO, EM UM WORD SÓ (fase 165).
 *
 * Pedido de 25/09: capa institucional com o timbre centralizado; os registros
 * em ordem cronológica; e, no fim, os anexos dentro do próprio documento, com
 * as páginas dos PDFs do hospital reproduzidas como imagem, *"assim o usuário
 * consegue abrir um único Word e consultar todo o material visual"*.
 *
 * Sem acesso a banco nem a disco: recebe o que o serviço leu e desenhou.
 */
import { Folha, SecaoDaFolha, AutorDaFolha, FotoNaCelula, diaBR, hhmmBR, cargoNoDocumento } from '../../kernel/documentos/folha';

export interface AnexoDaInternacao {
  numero: number;
  categoria: string;
  nomeDoArquivo: string | null;
  registradoEm: string;
  registradoPor: string | null;
  /** As imagens a imprimir: a foto, ou as páginas do PDF. */
  paginas: FotoNaCelula[];
  /** Quantas páginas o PDF tem ao todo (quando é PDF). */
  totalDePaginas?: number;
  /** O arquivo não pôde ser reproduzido (PDF protegido, ilegível, ou só existe na tela). */
  naoReproduzido?: boolean;
}

export interface DadosDaInternacao {
  acolhido: string;
  unidade: string;
  hospital: string;
  motivo: string;
  desde: string;
  ate: string | null;
  status: string;
  desfecho: string | null;
  observacaoDoDesfecho: string | null;
  abertaPor: string | null;
  encerradaPor: string | null;
  acompanhantes: { quem: string; cargo: string | null; de: string; ate: string | null; designadoPor: string | null }[];
  diario: {
    dia: string; em: string; tipoRotulo: string; texto: string;
    por: string | null; cargo: string | null; anexo: number | null; categoria: string | null;
  }[];
  medicacao: { quando: string; medicamento: string; dose: string | null; via: string | null; observacao: string | null }[];
}

const DESFECHO: Record<string, string> = {
  alta: 'Alta hospitalar, com retorno à unidade',
  transferencia_hospitalar: 'Transferência para outro hospital',
  obito: 'Óbito',
};

/** "3 dias e 5 horas": a duração se lê em dias, e as horas dizem a fração. */
export function tempoDeInternacao(desde: string, ate: string | null, agora = new Date()): string {
  const ms = (ate ? new Date(ate) : agora).getTime() - new Date(desde).getTime();
  const horas = Math.max(0, Math.floor(ms / 3_600_000));
  const dias = Math.floor(horas / 24);
  const resto = horas % 24;
  const d = dias === 1 ? '1 dia' : `${dias} dias`;
  const h = resto === 1 ? '1 hora' : `${resto} horas`;
  if (!dias) return resto ? h : 'menos de uma hora';
  return resto ? `${d} e ${h}` : d;
}

const quando = (iso: string) => `${diaBR(iso)}, às ${hhmmBR(iso)}`;

export function folhaDaInternacao(
  d: DadosDaInternacao, anexos: AnexoDaInternacao[], autor: AutorDaFolha,
): Folha {
  const secoes: SecaoDaFolha[] = [];

  secoes.push({
    titulo: 'Motivo da internação',
    paragrafos: [d.motivo],
    procedencia: d.abertaPor
      ? `Registrado na abertura da internação por ${d.abertaPor}.`
      : 'Registrado na abertura da internação.',
  });

  secoes.push(d.acompanhantes.length ? {
    titulo: 'Acompanhamento pela equipe',
    tabela: {
      cabecalho: ['Profissional', 'Cargo', 'De', 'Até', 'Designado por'],
      linhas: d.acompanhantes.map((a) => [
        a.quem, a.cargo ? cargoNoDocumento(a.cargo) : '—', diaBR(a.de),
        a.ate ? diaBR(a.ate) : 'atual', a.designadoPor ?? '—',
      ]),
    },
    procedencia: 'Profissionais designados pela equipe técnica ou pela coordenação para '
      + 'acompanhar o acolhido no hospital, em ordem de designação.',
  } : {
    titulo: 'Acompanhamento pela equipe',
    paragrafos: ['Não houve profissional designado para acompanhamento no período.'],
  });

  /* Um bloco por dia, em ordem cronológica: é assim que o período se lê. */
  const dias = [...new Set(d.diario.map((n) => n.dia))].sort();
  if (!dias.length) {
    secoes.push({
      titulo: 'Registros diários',
      paragrafos: ['Não há registros diários da internação até a data de emissão.'],
    });
  }
  for (const dia of dias) {
    const doDia = d.diario.filter((n) => n.dia === dia)
      .sort((a, b) => a.em.localeCompare(b.em));
    secoes.push({
      titulo: `Registros de ${diaBR(dia)}`,
      paragrafos: doDia.map((n) => {
        const autoria = n.por
          ? ` Registrado por ${n.por}${n.cargo ? `, ${cargoNoDocumento(n.cargo)}` : ''}.`
          : '';
        const anexo = n.anexo
          ? ` Anexo ${n.anexo}${n.categoria ? ` (${n.categoria.toLowerCase()})` : ''}, reproduzido ao final.`
          : '';
        const texto = n.texto.trim().replace(/[.!?]?$/, (m) => m || '.');
        return `${hhmmBR(n.em)}. ${n.tipoRotulo}. ${texto}${autoria}${anexo}`;
      }),
    });
  }

  if (d.medicacao.length) {
    secoes.push({
      titulo: 'Medicação administrada pelo hospital',
      tabela: {
        cabecalho: ['Data e hora', 'Medicamento', 'Dose', 'Via', 'Observação'],
        linhas: [...d.medicacao].sort((a, b) => a.quando.localeCompare(b.quando)).map((m) => [
          quando(m.quando), m.medicamento, m.dose ?? '—', m.via ?? '—', m.observacao ?? '—',
        ]),
      },
      procedencia: 'Administrada pela equipe do hospital, conforme informado à equipe da '
        + 'unidade. Não integra a grade de medicação da unidade.',
    });
  }

  if (d.status === 'encerrada') {
    secoes.push({
      titulo: 'Encerramento',
      paragrafos: [
        `${DESFECHO[d.desfecho ?? ''] ?? 'Internação encerrada'}, em ${quando(d.ate!)}.`,
        ...(d.observacaoDoDesfecho ? [d.observacaoDoDesfecho] : []),
      ],
      procedencia: d.encerradaPor ? `Registrado por ${d.encerradaPor}.` : undefined,
    });
  }

  if (anexos.length) {
    secoes.push({
      titulo: 'Anexos',
      quebraAntes: true,
      paragrafos: ['Reprodução dos documentos anexados durante a internação, na ordem em que '
        + 'foram registrados. Os arquivos originais permanecem no registro eletrônico do acolhido.'],
    });
    for (const a of anexos) {
      const origem = `${a.categoria}${a.nomeDoArquivo ? `, ${a.nomeDoArquivo}` : ''}. `
        + `Registrado em ${diaBR(a.registradoEm)}${a.registradoPor ? ` por ${a.registradoPor}` : ''}.`;
      const imagens = a.naoReproduzido
        ? [{ legenda: `Anexo ${a.numero}. ${origem} Não foi possível reproduzir este documento`, foto: null }]
        : !a.paginas.length
        /* Na pré-visualização da tela nada é desenhado: o anexo entra no Word. */
        ? [{ legenda: `Anexo ${a.numero}. ${origem} Reproduzido no arquivo em Word`, foto: null }]
        : a.paginas.map((p, i) => ({
            legenda: a.paginas.length > 1 || (a.totalDePaginas ?? 1) > 1
              ? `Anexo ${a.numero}, página ${i + 1} de ${a.totalDePaginas ?? a.paginas.length}. ${origem}`
              : `Anexo ${a.numero}. ${origem}`,
            foto: p,
          }));
      const cortado = (a.totalDePaginas ?? 0) > a.paginas.length && a.paginas.length > 0;
      secoes.push({
        titulo: `Anexo ${a.numero}`,
        imagens,
        ...(cortado ? {
          paragrafos: [`Reproduzidas as ${a.paginas.length} primeiras páginas de ${a.totalDePaginas}. `
            + 'As demais estão no documento original, no registro eletrônico.'],
        } : {}),
      });
    }
  }

  return {
    capa: true,
    titulo: 'Relatório de internação hospitalar',
    subtitulo: d.acolhido,
    identificacao: [
      { rotulo: 'Acolhido', valor: d.acolhido },
      { rotulo: 'Unidade', valor: d.unidade },
      { rotulo: 'Hospital', valor: d.hospital },
      { rotulo: 'Entrada', valor: quando(d.desde) },
      { rotulo: d.status === 'encerrada' ? 'Saída' : 'Situação',
        valor: d.status === 'encerrada' && d.ate ? quando(d.ate) : 'Internação em andamento na data de emissão' },
      { rotulo: 'Tempo de internação', valor: tempoDeInternacao(d.desde, d.ate) },
      { rotulo: 'Emitido em', valor: diaBR(new Date()) },
    ],
    secoes,
    geradoPor: autor.nome,
    cargo: autor.cargo,
    assinatura: true,
    ressalva: 'Relatório elaborado a partir dos registros da equipe durante a internação. Os '
      + 'documentos anexados são reproduções; os originais permanecem arquivados no registro '
      + 'eletrônico do acolhido. Contém informações de saúde e deve circular apenas entre os '
      + 'profissionais responsáveis pelo cuidado.',
  };
}
