/**
 * A FOLHA — o que um documento do Rede Acolher é, antes de virar arquivo.
 *
 * Este arquivo NÃO IMPORTA NADA, de propósito, e é lido pelas duas pontas: o
 * servidor monta a folha e a transforma em .docx; a tela desenha a MESMA folha
 * na pré-visualização. É a garantia de que quem confere na tela confere o
 * documento que vai sair — e não uma segunda versão dele, que divergiria no
 * primeiro ajuste.
 *
 * Até 02/09/2026 a folha da ATA, da ocorrência, da saúde e dos combinados era
 * montada NO NAVEGADOR (`frontend/src/docx.ts`). Funcionava para o protótipo,
 * que roda sem servidor, mas deixava o sistema real sem resposta para a
 * pergunta que importa: **quem tirou este documento do sistema, e para quê?**
 * Arquivo gerado no navegador não passa por auditoria nenhuma.
 *
 * Três coisas que a folha sempre carrega, e nenhuma delas é enfeite:
 *
 *  * a PROCEDÊNCIA de cada seção. Quem lê precisa distinguir o que o sistema
 *    contou do que uma pessoa escreveu, sem ter que perguntar;
 *  * o campo que só uma pessoa preenche sai VISÍVEL como pendência. Espaço
 *    vazio que parece preenchido é pior do que espaço vazio;
 *  * a ressalva, quando o documento precisa dizer o que ele NÃO é.
 */

export interface LinhaIdentificacao {
  rotulo: string;
  valor: string;
}

export interface SecaoDaFolha {
  titulo: string;
  /** Parágrafos de corpo, justificados. */
  paragrafos?: string[];
  /** Lista com marcador. */
  itens?: string[];
  /** Quadro simples — usado na saúde, na grade e nas passagens. */
  tabela?: { cabecalho: string[]; linhas: string[][] };
  /** Campo que só uma pessoa preenche: sai com a marca e o espaço em branco. */
  aPreencher?: string;
  /** De onde a informação veio. Sai em letra menor, abaixo da seção. */
  procedencia?: string;
}

export interface Folha {
  /** Vira o título na primeira folha e a base do nome do arquivo. */
  titulo: string;
  subtitulo?: string;
  identificacao: LinhaIdentificacao[];
  secoes: SecaoDaFolha[];
  /** Rascunho recebe tarja na primeira folha: ninguém entrega sem saber. */
  rascunho?: boolean;
  geradoPor: string;
  cargo: string;
  /** Linha de assinatura no fim, com nome e cargo. */
  assinatura?: boolean;
  /** Frase final, quando o documento precisa dizer o que ele não é. */
  ressalva?: string;
}

/** Quem pediu a folha — vai para o rodapé e para a auditoria. */
export interface AutorDaFolha {
  nome: string;
  cargo: string;
}

/*
 * As duas formatações que toda folha usa.
 *
 * Ficam aqui, e não em `kernel/common/tempo.ts`, porque este arquivo é lido
 * também pelo navegador e não pode importar nada. E são sempre em
 * `America/Sao_Paulo`: um `new Date('2026-08-01')` cru é meia-noite em UTC, ou
 * seja, 31 de julho na casa — e o documento sairia com a data de ontem.
 */
export const FUSO = 'America/Sao_Paulo';

export function diaBR(iso: string | Date): string {
  const base = iso instanceof Date
    ? iso
    : new Date(`${String(iso).slice(0, 10)}T12:00:00-03:00`);
  return base.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: FUSO,
  });
}

export function hhmmBR(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: FUSO,
  });
}

/**
 * O nome do arquivo.
 *
 * Sem CPF, sem diagnóstico e sem conteúdo judicial — a regra 3 vale para o
 * nome do arquivo tanto quanto para o conteúdo, porque nome de arquivo aparece
 * em lista de downloads, em anexo de e-mail e na tela de quem está do lado.
 */
export function nomeDoArquivo(titulo: string): string {
  const limpo = titulo
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: FUSO });
  return `${limpo || 'documento'}-${hoje}.docx`;
}

/**
 * O cargo por extenso, para o rodapé e a linha de assinatura.
 *
 * O código do cargo é do banco; quem lê o documento lê o nome. Fica aqui
 * porque quatro partições geram documento e nenhuma pode importar a outra —
 * a alternativa seria a mesma tabela copiada quatro vezes, envelhecendo em
 * ritmos diferentes.
 */
export const CARGO_NO_DOCUMENTO: Record<string, string> = {
  gestor_geral: 'Gestor Geral',
  coordenador: 'Coordenação da unidade',
  equipe_tecnica: 'Equipe técnica',
  enfermagem: 'Enfermagem',
  lider_diurno: 'Líder Diurno',
  lider_noturno_geral: 'Líder Noturno Geral',
  educador: 'Educador social',
  cozinha: 'Cozinha',
};

/** O código cru só aparece quando o cargo é desconhecido — e aí ele é a pista. */
export const cargoNoDocumento = (code: string): string => CARGO_NO_DOCUMENTO[code] ?? code;
