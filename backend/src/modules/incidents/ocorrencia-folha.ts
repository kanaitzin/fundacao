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
      titulo: 'Fato objetivo',
      paragrafos: [d.fato],
      procedencia: 'escrito por quem abriu a ocorrência, sem alteração posterior.',
    },
  ];

  if (d.medidasImediatas) {
    secoes.push({ titulo: 'Medidas imediatas', paragrafos: [d.medidasImediatas] });
  }

  if ((d.relatos?.relatos ?? []).length) {
    secoes.push({
      titulo: 'Relatos',
      itens: d.relatos!.relatos!.map((r) =>
        `${r.autor} · ${r.testemunho} · ${hhmmBR(r.quando)}: ${r.relato}`),
      procedencia: 'cada relato é de quem o escreveu, na ordem em que foram registrados; '
        + 'nenhum foi alterado.',
    });
  }

  if ((d.sinteses ?? []).length) {
    secoes.push({
      titulo: 'Análise técnica',
      itens: d.sinteses!.map((s) => `${s.autor} · ${hhmmBR(s.quando)}: ${s.texto}`),
    });
  }

  return {
    titulo: `Registro de ocorrência — ${d.categoria}`,
    identificacao: [
      { rotulo: 'Categoria', valor: d.categoria },
      { rotulo: 'Quando', valor: `${diaBR(d.quando)} às ${hhmmBR(d.quando)}` },
      {
        rotulo: 'Acolhidos',
        valor: (d.acolhidos ?? []).map((a) => a.nome).join(', ') || 'não se aplica a uma pessoa',
      },
      { rotulo: 'Situação', valor: String(d.status) },
    ],
    secoes,
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: 'Fala espontânea e sinais observados, quando existem, NÃO entram nesta cópia: '
      + 'eles têm política própria e mais estreita, e não circulam em papel.',
  };
}
