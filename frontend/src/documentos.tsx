/**
 * VER ANTES DE BAIXAR, E BAIXAR O QUE SE VIU.
 *
 * Duas coisas que a casa pediu e que o sistema não tinha:
 *
 *  * uma PRÉ-VISUALIZAÇÃO rápida — abrir a folha, olhar, fechar. Sem isso,
 *    conferir um documento significa baixar, achar na pasta de downloads,
 *    abrir o Word, e a pessoa acaba não conferindo;
 *  * o DOWNLOAD do que cada setor precisa levar em papel: a enfermagem, a
 *    situação de saúde de um acolhido ou a grade da casa; a equipe técnica, a
 *    ATA e os registros; a coordenação e a gestão, tudo.
 *
 * A folha de baixo é a MESMA estrutura que vira o .docx (`docx.ts`): a
 * pré-visualização não é uma segunda versão do documento, é o mesmo documento
 * desenhado na tela. Duas versões divergiriam no primeiro ajuste, e a pessoa
 * conferiria uma coisa e entregaria outra.
 *
 * QUEM PODE BAIXAR não é decidido aqui: cada botão vive dentro da tela do
 * setor, e a tela já é filtrada pelo alcance do cargo. Uma lista de permissões
 * paralela seria uma segunda verdade sobre quem alcança o quê.
 */
import { gerarDocx, nomeDeArquivo } from './docx';
import type { DocumentoWord, SecaoDoDocumento } from './docx';
import { timbreEmBytes } from './timbre';

/** Gera o arquivo e entrega ao navegador. */
export function baixarDocumento(doc: DocumentoWord) {
  const base64 = gerarDocx(doc, timbreEmBytes());
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeDeArquivo(doc.titulo);
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * A folha na tela: papel, e não formulário. Quem abre precisa reconhecer o
 * documento que vai sair da impressora.
 */
export function FolhaDocumento({ doc, onFechar, onBaixar }: {
  doc: DocumentoWord; onFechar: () => void;
  /**
   * Quando o download precisa passar pelo servidor — porque a exportação é um
   * ato auditado, com finalidade declarada —, a tela entrega a própria função
   * e a folha não gera o arquivo por conta própria. Gerar aqui pularia o
   * registro, e o registro é o que responde "quem tirou este documento do
   * sistema?" seis meses depois.
   */
  onBaixar?: () => void;
}) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="t-doc"
         onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="sheet modal">
        <h3 id="t-doc">Pré-visualização · {doc.titulo}</h3>
        <p className="mutetxt" style={{ marginTop: 0 }}>
          É exatamente esta folha que sai no arquivo do Word, com o timbre da Fundação.
        </p>

        <div className="papel">
          <div className="papel-timbre">
            <b>FUNDAÇÃO O PÃO DOS POBRES DE SANTO ANTÔNIO</b>
            <span>Programa de Acolhimento Institucional · Porto Alegre — RS</span>
          </div>

          {doc.rascunho && (
            <p className="papel-rascunho">
              RASCUNHO — documento sem aprovação. Não deve ser entregue.
            </p>
          )}

          <h4 className="papel-titulo">{doc.titulo}</h4>
          {doc.subtitulo && <p className="papel-sub">{doc.subtitulo}</p>}

          {doc.identificacao.length > 0 && (
            <>
              <h5 className="papel-secao">1  Identificação</h5>
              {doc.identificacao.map((i) => (
                <p className="papel-ident" key={i.rotulo}>
                  <b>{i.rotulo}:</b> {i.valor}
                </p>
              ))}
            </>
          )}

          {doc.secoes.map((s, n) => (
            <div key={s.titulo + n}>
              <h5 className="papel-secao">
                {(doc.identificacao.length ? n + 2 : n + 1)}  {s.titulo}
              </h5>
              {(s.paragrafos ?? []).map((p, i) => <p className="papel-par" key={i}>{p}</p>)}
              {(s.itens ?? []).length > 0 && (
                <ul className="papel-itens">
                  {s.itens!.map((it, i) => <li key={i}>{it}</li>)}
                </ul>
              )}
              {s.tabela && (
                <div className="rolar">
                  <table className="papel-tabela">
                    <thead>
                      <tr>{s.tabela.cabecalho.map((c) => <th key={c}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {s.tabela.linhas.map((l, i) => (
                        <tr key={i}>{l.map((c, j) => <td key={j}>{c}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {s.aPreencher && (
                <>
                  <p className="papel-preencher">[a preencher — {s.aPreencher}]</p>
                  <div className="papel-linha" /><div className="papel-linha" />
                </>
              )}
              {s.procedencia && <p className="papel-fonte">Fonte: {s.procedencia}</p>}
            </div>
          ))}

          {doc.ressalva && <p className="papel-fonte">{doc.ressalva}</p>}

          {doc.assinatura !== false && (
            <div className="papel-assina">
              <div className="papel-linha" />
              <b>{doc.geradoPor}</b>
              <span>{doc.cargo}</span>
            </div>
          )}
        </div>

        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Fechar</button>
          <button className="btn grow" onClick={() => (onBaixar ? onBaixar() : baixarDocumento(doc))}>
            Baixar em Word
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// OS DOCUMENTOS DE CADA SETOR
//
// Cada função abaixo transforma o que já está na tela em documento. Nenhuma
// delas inventa conteúdo, nenhuma conclui nada, e todas dizem de onde a
// informação veio.
// ==========================================================================

const dia = (iso: string) => new Date(`${String(iso).slice(0, 10)}T12:00:00-03:00`)
  .toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const hhmm = (iso: string) => new Date(iso)
  .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit',
                                 timeZone: 'America/Sao_Paulo' });

interface Autor { nome: string; cargo: string }

/**
 * A SITUAÇÃO DE SAÚDE DE UM ACOLHIDO — o que a enfermagem leva para a consulta.
 *
 * É a linha única virada folha: atendimentos com data e retorno, evoluções com
 * quem acompanhou, e o que foi administrado. Sem diagnóstico no título e sem
 * juízo em lugar nenhum.
 */
export function documentoDeSaude(
  pessoa: { nome: string; idade?: number },
  h: {
    atendimentos: any[]; evolucoes: any[]; administracoes: any[];
    pendencias: { retornosVencidos: number; retornosMarcados: number;
                  internacaoEmAndamento: boolean; evolucoesAguardandoTriagem: number };
  },
  autor: Autor,
): DocumentoWord {
  const secoes: SecaoDoDocumento[] = [];

  const pend: string[] = [];
  if (h.pendencias.internacaoEmAndamento) pend.push('Internação em andamento.');
  if (h.pendencias.retornosVencidos) {
    pend.push(`${h.pendencias.retornosVencidos} retorno(s) com a data já passada.`);
  }
  if (h.pendencias.retornosMarcados) {
    pend.push(`${h.pendencias.retornosMarcados} retorno(s) marcado(s).`);
  }
  if (h.pendencias.evolucoesAguardandoTriagem) {
    pend.push(`${h.pendencias.evolucoesAguardandoTriagem} evolução(ões) aguardando a `
              + 'conferência da Enfermagem.');
  }
  secoes.push({
    titulo: 'O que está esperando alguém',
    itens: pend.length ? pend : ['Nada pendente registrado nesta data.'],
    procedencia: 'contagem feita sobre os registros, sem ordenação por gravidade.',
  });

  secoes.push({
    titulo: 'Atendimentos',
    paragrafos: h.atendimentos.length ? [] : ['Nenhum atendimento registrado.'],
    tabela: h.atendimentos.length ? {
      cabecalho: ['Data', 'Atendimento', 'Serviço / especialidade', 'Situação'],
      linhas: h.atendimentos.map((a) => [
        dia(a.quando), a.tipoRotulo,
        [a.especialidade, a.local].filter(Boolean).join(' · ') || '—',
        a.retornoVencido ? `Retorno em ${dia(a.retornoEm)} — data já passada`
          : a.retornoEm ? `Retorno em ${dia(a.retornoEm)}` : a.statusRotulo,
      ]),
    } : undefined,
    procedencia: 'atendimentos registrados no módulo de Enfermagem.',
  });

  if (h.evolucoes.length) {
    secoes.push({
      titulo: 'Evoluções de quem acompanhou',
      itens: h.evolucoes.map((e) => [
        `${dia(e.quando)} — ${e.tipoRotulo}`,
        e.acompanhante ? `acompanhou: ${e.acompanhante}` : null,
        e.estadoRetorno ? `estado no retorno: ${e.estadoRetorno}` : null,
        e.complementoEnfermagem ? `complemento da Enfermagem: ${e.complementoEnfermagem}` : null,
      ].filter(Boolean).join(' · ')),
      procedencia: 'evolução assinada por quem acompanhou, com o complemento da Enfermagem.',
    });
  }

  if (h.administracoes.length) {
    secoes.push({
      titulo: 'Medicação administrada',
      tabela: {
        cabecalho: ['Data e hora', 'Medicamento', 'Situação', 'Confirmada por'],
        linhas: h.administracoes.slice(0, 40).map((d) => [
          `${dia(d.previsto)} ${hhmm(d.previsto)}`,
          `${d.medicamento} ${d.dose}`, d.estadoRotulo, d.por ?? '—',
        ]),
      },
      procedencia: 'grade de medicamentos; cada dose é confirmada por quem a administrou.',
    });
  }

  return {
    titulo: `Situação de saúde — ${pessoa.nome}`,
    subtitulo: 'Documento de acompanhamento em saúde',
    identificacao: [
      { rotulo: 'Acolhido', valor: pessoa.nome + (pessoa.idade ? ` (${pessoa.idade} anos)` : '') },
      { rotulo: 'Unidade', valor: 'AI3 — Casa 03 (piloto)' },
      { rotulo: 'Emitido em', valor: dia(new Date().toISOString()) },
    ],
    secoes,
    geradoPor: autor.nome, cargo: autor.cargo,
    ressalva: 'Este documento reúne o que está registrado. Ele não conclui, não avalia e não '
      + 'substitui o parecer de quem atende. Conteúdo de saúde é dado sensível: ele circula '
      + 'entre quem cuida, e não em local de passagem.',
  };
}

/**
 * A GRADE DA CASA — a folha que fica no armário da medicação.
 *
 * O pedido foi "a situação da casa toda para colar numa parede". A folha
 * existe, mas com um cuidado escrito nela: quadro de medicação é papel de
 * SERVIÇO. Ele fica onde só a equipe entra — a sala da enfermagem, a porta do
 * armário —, nunca num corredor por onde passam visitas, outras crianças e a
 * família. E por isso ele traz horário, medicamento e nome, e NÃO traz
 * diagnóstico, alergia detalhada nem condição de saúde: essas ficam no
 * documento individual, que vai junto de quem precisa.
 */
export function documentoDaGradeDaCasa(
  casa: string,
  doses: any[],
  autor: Autor,
): DocumentoWord {
  const ordenadas = [...doses].sort((a, b) => String(a.horario).localeCompare(String(b.horario)));
  return {
    titulo: `Grade de medicação do dia — ${casa}`,
    subtitulo: 'Folha de conferência da equipe',
    identificacao: [
      { rotulo: 'Unidade', valor: casa },
      { rotulo: 'Data', valor: dia(new Date().toISOString()) },
      { rotulo: 'Doses previstas', valor: String(doses.length) },
    ],
    secoes: [
      {
        titulo: 'Doses do dia',
        paragrafos: ordenadas.length ? [] : ['Nenhuma dose prevista para hoje nesta casa.'],
        tabela: ordenadas.length ? {
          cabecalho: ['Hora', 'Acolhido', 'Medicamento e dose', 'Situação'],
          linhas: ordenadas.map((d) => [
            d.tipo === 'quando_necessario' ? 's/n' : hhmm(d.horario),
            d.acolhido?.nome ?? '—',
            `${d.medicamento} ${d.dose} · ${d.via}`,
            d.rotulo,
          ]),
        } : undefined,
        procedencia: 'grade do dia da unidade, na data da emissão.',
      },
      {
        titulo: 'Conferência do plantão',
        aPreencher: 'quem conferiu a grade no início e no fim do turno, e o que faltou',
      },
    ],
    geradoPor: autor.nome, cargo: autor.cargo,
    ressalva: 'FOLHA DE SERVIÇO. Ela traz horário, nome e medicamento porque é isso que a '
      + 'equipe confere no armário — e não traz diagnóstico nem condição de saúde. Mantenha-a '
      + 'em área restrita à equipe: corredor, sala de visitas e mural aberto não são lugar '
      + 'para o nome de uma criança ao lado do remédio que ela toma. Papel impresso sai do '
      + 'sistema e não volta.',
  };
}

/**
 * A ATA DO TURNO como documento — o que a equipe técnica leva para a reunião.
 *
 * O conteúdo vem do jeito que o servidor guarda (uma chave por seção do livro)
 * e os TÍTULOS vêm da estrutura publicada por ele. Escrever os títulos aqui
 * criaria uma segunda lista de seções, que envelheceria no dia em que o livro
 * da casa mudasse.
 */
export function documentoDaAta(
  a: {
    data: string; turno: string; status: string;
    conteudo: Record<string, string> | null;
    pendencias?: string | null;
    episodios?: any[];
    passagens?: { quem: string; cargo: string; assinadaEm: string | null }[];
  },
  secoes: { chave: string; titulo: string }[],
  casa: string,
  autor: Autor,
): DocumentoWord {
  const corpo: SecaoDoDocumento[] = [];
  const conteudo = a.conteudo ?? {};

  for (const s of secoes) {
    const texto = String(conteudo[s.chave] ?? '').trim();
    corpo.push({
      titulo: s.titulo,
      paragrafos: texto
        ? texto.split('\n').map((l) => l.trim()).filter(Boolean)
        : ['Nada registrado nesta seção.'],
    });
  }

  if ((a.episodios ?? []).length) {
    corpo.push({
      titulo: 'Episódios do turno',
      itens: a.episodios!.map((e: any) =>
        `${hhmm(e.quando)} — ${e.classificacao ?? ''}: ${e.relato}`
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
          p.quem, p.cargo, p.assinadaEm ? `assinada às ${hhmm(p.assinadaEm)}` : 'sem assinatura']),
      },
      procedencia: 'cada pessoa assina a própria passagem; o sistema não assina por ninguém.',
    });
  }

  if (a.pendencias) {
    corpo.push({ titulo: 'Pendências registradas no fechamento',
                 paragrafos: [a.pendencias] });
  }

  return {
    titulo: `ATA do turno — ${dia(a.data)}`,
    subtitulo: `${casa} · ${a.turno}`,
    identificacao: [
      { rotulo: 'Unidade', valor: casa },
      { rotulo: 'Data', valor: dia(a.data) },
      { rotulo: 'Turno', valor: a.turno },
      { rotulo: 'Situação da ATA', valor: a.status },
    ],
    secoes: corpo,
    geradoPor: autor.nome, cargo: autor.cargo,
    ressalva: 'Cópia da ATA como ela está registrada no sistema, na data desta emissão. '
      + 'Correção não se faz nesta folha: faz-se no sistema, que guarda o que constava antes.',
  };
}

/** A ocorrência com os relatos — o registro que a técnica leva para a rede. */
export function documentoDaOcorrencia(d: any, autor: Autor): DocumentoWord {
  const secoes: SecaoDoDocumento[] = [
    { titulo: 'Fato objetivo', paragrafos: [d.fato],
      procedencia: 'escrito por quem abriu a ocorrência, sem alteração posterior.' },
  ];
  if (d.medidasImediatas) {
    secoes.push({ titulo: 'Medidas imediatas', paragrafos: [d.medidasImediatas] });
  }
  if ((d.relatos?.relatos ?? []).length) {
    secoes.push({
      titulo: 'Relatos',
      itens: d.relatos.relatos.map((r: any) =>
        `${r.autor} · ${r.testemunho} · ${hhmm(r.quando)}: ${r.relato}`),
      procedencia: 'cada relato é de quem o escreveu, na ordem em que foram registrados; '
        + 'nenhum foi alterado.',
    });
  }
  if ((d.sinteses ?? []).length) {
    secoes.push({
      titulo: 'Análise técnica',
      itens: d.sinteses.map((s: any) => `${s.autor} · ${hhmm(s.quando)}: ${s.texto}`),
    });
  }
  return {
    titulo: `Registro de ocorrência — ${d.categoria}`,
    identificacao: [
      { rotulo: 'Categoria', valor: d.categoria },
      { rotulo: 'Quando', valor: `${dia(d.quando)} às ${hhmm(d.quando)}` },
      { rotulo: 'Acolhidos', valor: (d.acolhidos ?? []).map((a: any) => a.nome).join(', ')
        || 'não se aplica a uma pessoa' },
      { rotulo: 'Situação', valor: String(d.status) },
    ],
    secoes,
    geradoPor: autor.nome, cargo: autor.cargo,
    ressalva: 'Fala espontânea e sinais observados, quando existem, NÃO entram nesta cópia: '
      + 'eles têm política própria e mais estreita, e não circulam em papel.',
  };
}
