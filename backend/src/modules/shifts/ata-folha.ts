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
}

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
        : ['Nada registrado nesta seção.'],
    });
  }

  if ((a.episodios ?? []).length) {
    corpo.push({
      titulo: 'Episódios do turno',
      itens: a.episodios!.map((e) =>
        `${hhmmBR(e.quando)} — ${e.classificacao ?? ''}: ${e.relato}`
        + (e.por ? ` (registrado por ${e.por})` : '')),
      procedencia: 'episódios registrados durante o turno; o relato não se altera.',
    });
  }

  if ((a.passagens ?? []).length) {
    corpo.push({
      titulo: 'Passagens de plantão',
      tabela: {
        cabecalho: ['Quem', 'Função', 'Assinatura'],
        linhas: a.passagens!.map((p) => [
          p.quem, p.cargo,
          p.assinadaEm ? `assinada às ${hhmmBR(p.assinadaEm)}` : 'sem assinatura']),
      },
      procedencia: 'cada pessoa assina a própria passagem; o sistema não assina por ninguém.',
    });
  }

  if (a.pendencias) {
    corpo.push({ titulo: 'Pendências registradas no fechamento', paragrafos: [a.pendencias] });
  }

  return {
    titulo: `ATA do turno — ${diaBR(a.data)}`,
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
    ressalva: 'Cópia da ATA como ela está registrada no sistema, na data desta emissão. '
      + 'Correção não se faz nesta folha: faz-se no sistema, que guarda o que constava antes.',
  };
}
