/**
 * A FOLHA DA OCORRÊNCIA — o registro que a equipe técnica leva para a rede.
 *
 * Sem import nenhum além do contrato: é lida pelo servidor e pelo protótipo.
 *
 * **O que esta folha NÃO carrega, e é a decisão mais importante dela:** fala
 * espontânea e sinais observados (§13.2). Eles têm política própria, mais
 * estreita, e não circulam em papel — papel é fotocopiado, fica em cima de uma
 * mesa e vai por e-mail. Quem precisar do inteiro teor abre a ocorrência no
 * sistema e responde pelo acesso dela.
 */
import { Folha, SecaoDaFolha, AutorDaFolha, diaBR, hhmmBR } from '../../kernel/documentos/folha';

export interface DadosDaOcorrencia {
  categoria: string;
  quando: string;
  status: string;
  fato: string;
  medidasImediatas?: string | null;
  acolhidos?: Array<{ nome: string }>;
  relatos?: { relatos?: Array<{ autor: string; testemunho: string; quando: string; relato: string }> };
  sinteses?: Array<{ autor: string; quando: string; texto: string }>;
}

export function folhaDaOcorrencia(d: DadosDaOcorrencia, autor: AutorDaFolha): Folha {
  const secoes: SecaoDaFolha[] = [
    {
      titulo: 'Descrição do fato',
      paragrafos: [d.fato],
      procedencia: 'Redação de quem registrou a ocorrência, sem alteração posterior.',
    },
  ];

  if (d.medidasImediatas) {
    secoes.push({ titulo: 'Providências imediatas', paragrafos: [d.medidasImediatas] });
  }

  if ((d.relatos?.relatos ?? []).length) {
    secoes.push({
      titulo: 'Relatos da equipe',
      itens: d.relatos!.relatos!.map((r) =>
        `${r.autor} · ${r.testemunho} · ${hhmmBR(r.quando)}: ${r.relato}`),
      procedencia: 'Relatos na ordem em que foram registrados, na redação de cada autor.',
    });
  }

  if ((d.sinteses ?? []).length) {
    secoes.push({
      titulo: 'Análise técnica',
      itens: d.sinteses!.map((s) => `${s.autor} · ${hhmmBR(s.quando)}: ${s.texto}`),
    });
  }

  return {
    titulo: 'Registro de ocorrência',
    subtitulo: d.categoria,
    identificacao: [
      { rotulo: 'Categoria', valor: d.categoria },
      { rotulo: 'Data e hora', valor: `${diaBR(d.quando)}, às ${hhmmBR(d.quando)}` },
      {
        rotulo: 'Acolhidos envolvidos',
        valor: (d.acolhidos ?? []).map((a) => a.nome).join(', ') || 'ocorrência sem acolhido identificado',
      },
      { rotulo: 'Situação', valor: String(d.status) },
    ],
    secoes,
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: 'Esta cópia não inclui fala espontânea nem sinais observados, que têm acesso '
      + 'restrito à equipe técnica e à coordenação e não são impressos.',
  };
}
