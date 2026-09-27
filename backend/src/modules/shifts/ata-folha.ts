/**
 * A FOLHA DA ATA — a cópia que a equipe técnica leva para a reunião.
 *
 * Arquivo sem NENHUM import de propósito, como `ata-secoes.ts`: ele é lido
 * pelo servidor (que gera o .docx) e pelo protótipo (que desenha a mesma
 * folha). Duas versões divergiriam no primeiro ajuste, e a pessoa conferiria
 * uma coisa e entregaria outra.
 *
 * Os TÍTULOS das seções vêm da estrutura do livro publicada pelo servidor, e
 * não escritos aqui: escrevê-los criaria uma segunda lista de seções, que
 * envelheceria no dia em que o livro da casa mudasse.
 */
import { Folha, SecaoDaFolha, AutorDaFolha, diaBR, hhmmBR } from '../../kernel/documentos/folha';

export interface DadosDaAta {
  data: string;
  turno: string;
  status: string;
  conteudo: Record<string, string> | null;
  pendencias?: string | null;
  episodios?: Array<{ quando: string; classificacao?: string; relato: string; por?: string }>;
  passagens?: Array<{ quem: string; cargo: string; assinadaEm: string | null }>;
  /** As linhas escritas pela equipe ao longo do turno (fase 166). */
  linhas?: Array<{ quando: string; texto: string; quem: string | null; cargo: string | null; restrita: boolean }>;
  /** Quantas observações restritas o turno tem, inclusive as que quem imprime não lê. */
  restritas?: number;
  /** Reaberturas, correções e complementos feitos depois do fechamento. */
  adendos?: Array<{ quando: string; tipo: string; motivo: string | null; quem: string | null }>;
}

const TIPO_DO_ADENDO: Record<string, string> = {
  reabertura: 'Reabertura', correcao: 'Correção', complemento_tardio: 'Complemento posterior',
};

export function folhaDaAta(
  a: DadosDaAta,
  secoes: Array<{ chave: string; titulo: string }>,
  casa: string,
  autor: AutorDaFolha,
): Folha {
  const corpo: SecaoDaFolha[] = [];
  const conteudo = a.conteudo ?? {};

  for (const s of secoes) {
    const texto = String(conteudo[s.chave] ?? '').trim();
    corpo.push({
      titulo: s.titulo,
      /* Seção vazia diz "não há"; ela não some. Seção ausente vira dúvida de
       * quem lê a ATA um ano depois. */
      paragrafos: texto
        ? texto.split('\n').map((l) => l.trim()).filter(Boolean)
        : ['Sem registro para este item no turno.'],
    });
  }

  /*
   * AS LINHAS DA EQUIPE (fase 166). A folha levava o corpo por tópicos e as
   * intercorrências, e deixava de fora o que cada profissional escreveu ao
   * longo do turno, com nome e hora: exatamente o que a próxima equipe e a
   * audiência leem. A observação restrita não vai ao papel, que circula: ela
   * entra como contagem, e o conteúdo é consultado no registro eletrônico.
   */
  const abertas = [...(a.linhas ?? [])].filter((l) => !l.restrita)
    .sort((x, y) => new Date(x.quando).getTime() - new Date(y.quando).getTime());
  const restritas = a.restritas ?? (a.linhas ?? []).filter((l) => l.restrita).length;
  if (abertas.length || restritas) {
    corpo.push({
      titulo: 'Registros da equipe no turno',
      paragrafos: [
        ...abertas.map((l) => {
          const texto = l.texto.trim().replace(/[.!?]?$/, (m) => m || '.');
          const autoria = l.quem ? ` ${l.quem}${l.cargo ? `, ${l.cargo}` : ''}.` : '';
          return `${hhmmBR(l.quando)}. ${texto}${autoria}`;
        }),
        ...(restritas
          ? [`${restritas === 1 ? 'Há 1 observação' : `Há ${restritas} observações`} de acesso restrito `
            + 'registrada' + (restritas === 1 ? '' : 's') + ' no turno. O conteúdo é consultado no '
            + 'registro eletrônico, pelos profissionais autorizados.']
          : []),
      ],
      procedencia: 'Registros escritos pela equipe ao longo do turno, em ordem de horário, na redação original.',
    });
  }

  if ((a.episodios ?? []).length) {
    corpo.push({
      titulo: 'Intercorrências do turno',
      itens: a.episodios!.map((e) =>
        `${hhmmBR(e.quando)}${e.classificacao ? `, ${e.classificacao}` : ''}: ${e.relato}`
        + (e.por ? ` (registro de ${e.por})` : '')),
      procedencia: 'Relatos registrados pela equipe ao longo do turno, na redação original.',
    });
  }

  if ((a.passagens ?? []).length) {
    corpo.push({
      titulo: 'Passagens de plantão',
      tabela: {
        cabecalho: ['Profissional', 'Função', 'Assinatura'],
        linhas: a.passagens!.map((p) => [
          p.quem, p.cargo,
          p.assinadaEm ? `assinada às ${hhmmBR(p.assinadaEm)}` : 'sem assinatura']),
      },
      procedencia: 'Cada profissional assina a própria passagem de plantão.',
    });
  }

  if ((a.adendos ?? []).length) {
    corpo.push({
      titulo: 'Correções e complementos posteriores',
      itens: a.adendos!.map((d) =>
        `${diaBR(d.quando)}, às ${hhmmBR(d.quando)}. ${TIPO_DO_ADENDO[d.tipo] ?? d.tipo}`
        + `${d.motivo ? `: ${d.motivo.trim().replace(/[.!?]?$/, (m) => m || '.')}` : '.'}`
        + (d.quem ? ` Registrado por ${d.quem}.` : '')),
      procedencia: 'Alterações feitas depois do fechamento da ATA. A redação anterior fica preservada no '
        + 'registro eletrônico.',
    });
  }

  if (a.pendencias) {
    corpo.push({ titulo: 'Pendências para o próximo turno', paragrafos: [a.pendencias] });
  }

  return {
    titulo: `ATA do turno de ${diaBR(a.data)}`,
    subtitulo: `${casa} · ${a.turno}`,
    identificacao: [
      { rotulo: 'Unidade', valor: casa },
      { rotulo: 'Data', valor: diaBR(a.data) },
      { rotulo: 'Turno', valor: a.turno },
      { rotulo: 'Situação da ATA', valor: a.status },
    ],
    secoes: corpo,
    /* A ATA aberta é rascunho e o documento tem de dizer isso na cara: uma
     * cópia de ATA não fechada circulando como institucional é o registro do
     * turno antes de a equipe ter terminado o turno. */
    rascunho: a.status !== 'fechada',
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: 'Cópia da ATA conforme registrada na data da emissão. Correções e complementos '
      + 'devem ser feitos no registro eletrônico, onde fica preservada a redação anterior.',
  };
}
