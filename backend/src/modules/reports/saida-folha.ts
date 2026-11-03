/**
 * A SAÍDA COM A HISTÓRIA (fase 270, pedido de 03/11).
 *
 * Quando a criança sai da casa (para a família, para outra instituição, para
 * uma família adotiva), o que ela é para quem cuida dela já está no sistema, e o
 * perfil se fechava com um motivo. Duas folhas, preparadas pela equipe técnica,
 * pela coordenação ou pela gestão:
 *
 *  * A FOLHA DE TRANSIÇÃO, para quem recebe a criança: os cuidados, as alergias e
 *    as condições de saúde, a alimentação, os remédios em uso com os horários, a
 *    escola, e os documentos que acompanham, com o recibo. Não leva o motivo do
 *    acolhimento, as ocorrências nem nada da área restrita: quem recebe precisa
 *    cuidar, e a história judicial segue pelo Juízo.
 *  * O LIVRO DA VIDA, para a criança: as conquistas e as vivências do tempo em
 *    que esteve acolhida, só com as fotografias que têm a autorização de imagem
 *    registrada, porque o livro sai da instituição. Nada de saúde, ocorrência,
 *    atendimento ou judicial.
 *
 * Não importa nada além da folha: o servidor e o protótipo montam a MESMA.
 */
import { AutorDaFolha, Folha, FotoNaCelula, SecaoDaFolha, diaBR } from '../../kernel/documentos/folha';

/** Quem prepara as folhas da saída: os mesmos que abrem a área restrita. */
export const QUEM_PREPARA_A_SAIDA = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

export interface DadosDaTransicao {
  crianca: { nome: string; nascimento: string | null; casa: string; desde: string | null };
  cuidados: string | null;
  saude: { tipo: string; descricao: string; gravidade: string | null }[];
  alimentacao: { restricao: string; substituicao: string | null; orientacao: string | null }[];
  remedios: { nome: string; dose: string; via: string; horarios: string[];
              orientacao: string | null; ate: string | null }[];
  escola: { nome: string; serie: string | null; turno: string | null } | null;
  documentos: { titulo: string; data: string | null }[];
}

const TIPO_DE_SAUDE: Record<string, string> = {
  alergia: 'Alergia', intolerancia: 'Intolerância', condicao: 'Condição de saúde',
};

export function folhaDeTransicao(d: DadosDaTransicao, autor: AutorDaFolha): Folha {
  const secoes: SecaoDaFolha[] = [];
  secoes.push({
    titulo: 'Cuidados no dia a dia',
    paragrafos: [d.cuidados?.trim() || 'Sem cuidado essencial registrado pela unidade.'],
  });
  secoes.push(d.saude.length
    ? {
        titulo: 'Alergias e saúde',
        tabela: {
          cabecalho: ['Tipo', 'Descrição', 'Gravidade'],
          linhas: d.saude.map((s) => [TIPO_DE_SAUDE[s.tipo] ?? s.tipo, s.descricao, s.gravidade ?? 'Não informada']),
        },
      }
    : { titulo: 'Alergias e saúde', paragrafos: ['Sem alergia ou condição de saúde registrada pela unidade.'] });
  secoes.push(d.alimentacao.length
    ? {
        titulo: 'Alimentação',
        itens: d.alimentacao.map((a) => [
          `Evitar: ${a.restricao}.`,
          a.substituicao ? `No lugar: ${a.substituicao}.` : '',
          a.orientacao ? a.orientacao : '',
        ].filter(Boolean).join(' ')),
      }
    : { titulo: 'Alimentação', paragrafos: ['Sem restrição alimentar registrada pela unidade.'] });
  secoes.push(d.remedios.length
    ? {
        titulo: 'Medicamentos em uso',
        tabela: {
          cabecalho: ['Medicamento', 'Dose e via', 'Horários', 'Até'],
          linhas: d.remedios.map((r) => [
            r.orientacao ? `${r.nome}. ${r.orientacao}` : r.nome,
            `${r.dose}, ${r.via}`,
            r.horarios.length ? r.horarios.join(', ') : 'Conforme orientação',
            r.ate ? diaBR(r.ate) : 'Uso contínuo',
          ]),
        },
        procedencia: 'Conforme as prescrições ativas na unidade na data desta folha. A receita segue entre os documentos.',
      }
    : { titulo: 'Medicamentos em uso', paragrafos: ['Sem medicamento em uso na data desta folha.'] });
  secoes.push({
    titulo: 'Escola',
    paragrafos: [d.escola
      ? [d.escola.nome, d.escola.serie, d.escola.turno ? `turno da ${d.escola.turno}` : null].filter(Boolean).join(', ') + '.'
      : 'Sem escola registrada pela unidade.'],
  });
  secoes.push(d.documentos.length
    ? {
        titulo: 'Documentos que acompanham',
        tabela: {
          cabecalho: ['Documento', 'Data', 'Entregue'],
          linhas: d.documentos.map((x) => [x.titulo, x.data ? diaBR(x.data) : '', '(  ) sim   (  ) não']),
        },
      }
    : { titulo: 'Documentos que acompanham', paragrafos: ['Sem documento no dossiê para entregar.'] });
  secoes.push({
    titulo: 'Recebimento',
    paragrafos: ['Recebi a criança, esta folha e os documentos marcados como entregues.'],
    aPreencher: 'Nome, documento e vínculo de quem recebe, data e assinatura.',
  });
  return {
    titulo: 'Folha de transição',
    subtitulo: `${d.crianca.nome} · ${d.crianca.casa}`,
    identificacao: [
      { rotulo: 'Nome', valor: d.crianca.nome },
      { rotulo: 'Nascimento', valor: d.crianca.nascimento ? diaBR(d.crianca.nascimento) : 'Não informado' },
      { rotulo: 'Unidade', valor: d.crianca.casa },
      { rotulo: 'Em acolhimento desde', valor: d.crianca.desde ? diaBR(d.crianca.desde) : 'Não informado' },
    ],
    secoes,
    geradoPor: autor.nome,
    cargo: autor.cargo,
    assinatura: true,
    ressalva: 'Informações para os cuidados da criança na transição. O motivo do acolhimento e '
      + 'os registros de acompanhamento seguem pelos canais do Juízo e da rede.',
  };
}

/**
 * Os nomes dos tipos de vivência, para o livro. São os de `TIPOS_DE_VIVENCIA`
 * (`people/dossie-exigido.ts`), repetidos aqui porque um módulo não lê arquivo
 * interno de outro; a suíte `a-saida-com-a-historia` confere que os dois batem.
 */
export const ROTULO_DA_VIVENCIA: Record<string, string> = {
  aniversario: 'Aniversário', festa: 'Festa', conquista: 'Conquista', passeio: 'Passeio',
  formatura: 'Formatura', esporte: 'Esporte', arte: 'Arte e cultura', outro: 'Outro',
};

export interface DadosDoLivro {
  crianca: { nome: string; casa: string; desde: string | null };
  marcos: { tipo: string; quando: string; descricao: string; instituicao: string | null }[];
  vivencias: { tipo: string; quando: string; descricao: string;
               fotos: { autorizada: boolean; foto: FotoNaCelula | null }[] }[];
}

export function folhaDoLivroDaVida(d: DadosDoLivro, autor: AutorDaFolha): Folha {
  type Item = { quando: string; secao: SecaoDaFolha };
  const itens: Item[] = [];
  for (const m of d.marcos) {
    itens.push({ quando: m.quando, secao: {
      titulo: `${diaBR(m.quando)} · ${m.tipo}`,
      paragrafos: [m.instituicao ? `${m.descricao} (${m.instituicao})` : m.descricao],
    } });
  }
  for (const v of d.vivencias) {
    /* Só as fotografias com autorização de imagem registrada: o livro sai da instituição. */
    const autorizadas = v.fotos.filter((f) => f.autorizada);
    itens.push({ quando: v.quando, secao: {
      titulo: `${diaBR(v.quando)} · ${v.tipo}`,
      paragrafos: [v.descricao],
      imagens: autorizadas.map((f, k) => ({
        legenda: autorizadas.length > 1 ? `Fotografia ${k + 1} de ${autorizadas.length}` : 'Fotografia',
        foto: f.foto,
      })),
    } });
  }
  itens.sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
  const secoes = itens.map((i) => i.secao);
  if (!secoes.length) {
    secoes.push({ titulo: 'Momentos', paragrafos: ['Sem conquista ou vivência registrada no tempo na unidade.'] });
  }
  return {
    capa: true,
    titulo: 'Livro da vida',
    subtitulo: `${d.crianca.nome} · ${d.crianca.casa}`,
    identificacao: [
      { rotulo: 'Nome', valor: d.crianca.nome },
      { rotulo: 'Unidade', valor: d.crianca.casa },
      { rotulo: 'Em acolhimento desde', valor: d.crianca.desde ? diaBR(d.crianca.desde) : 'Não informado' },
    ],
    secoes,
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: 'As conquistas e as vivências registradas pela equipe da unidade, na ordem em que '
      + 'aconteceram. As fotografias são as que têm autorização de imagem.',
  };
}
