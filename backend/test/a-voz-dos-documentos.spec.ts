/**
 * A VOZ DOS DOCUMENTOS (27/09).
 *
 * Pedido da Fundação: *"todos estes textos e relatórios têm que ser
 * humanizados, têm que parecer escritos por humanos com experiência em
 * acolhimento — fique como regra para todos os futuros relatórios ou documentos
 * para baixar"*.
 *
 * Os documentos saíam com a voz de quem construiu o sistema: travessões,
 * palavras em MAIÚSCULAS para dar ênfase, aspas, e frases explicando a regra
 * por trás da folha ("o sistema não assina por ninguém", "de propósito"). Um
 * relatório de acolhimento não fala assim: ele registra o que houve e orienta
 * quem vai usar o papel, na linguagem da equipe.
 *
 * Esta conferência lê do CÓDIGO todo texto que entra num documento — dentro de
 * um objeto de folha (o que tem `secoes` ou `identificacao`), nos arquivos
 * `*-folha.ts` e no conteúdo do relatório técnico — e recusa:
 *
 *  * travessão (— ou – entre espaços): usa-se ponto, vírgula, dois-pontos;
 *  * palavra inteira em maiúsculas que não seja sigla da lista;
 *  * aspas no meio do texto;
 *  * o documento falando do sistema ou de como foi feito ("sistema", "de
 *    propósito", "não é avaliação").
 *
 * O texto que a PESSOA escreveu (relato, finalidade, motivo) não passa por
 * aqui: é dela, e sai como ela escreveu.
 */
import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAIZ = join(__dirname, '..', '..');
const PASTAS = [join(RAIZ, 'backend', 'src'), join(RAIZ, 'frontend', 'src')];

/** Siglas e nomes que se escrevem em maiúsculas por natureza. */
const SIGLAS = new Set(['CPF', 'CNPJ', 'RG', 'ATA', 'ATAS', 'SUS', 'UBS', 'PIA', 'ECA', 'CRAS', 'CREAS',
  'NIS', 'CID', 'AI3', 'AI4', 'CAPS', 'UPA', 'SAMU', 'EJA', 'ENEM', 'CEP', 'CNH', 'OAB', 'CRM', 'COREN',
  'CRP', 'CRESS', 'LGPD', 'DPO', 'MP', 'TJ', 'RS', 'PDF', 'DOCX', 'SMS', 'FASC', 'PAEFI',
  /* métodos HTTP, que aparecem no servidor de mentira ao lado das folhas */
  'GET', 'POST']);

/* Arquivos cujo texto inteiro vai para documento (as ressalvas do período moram no serviço). */
const ARQUIVOS_INTEIROS = /(-folha\.ts|reports[\\/](conteudo|periodo)\.service\.ts)$/;

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules' && n !== 'migrations') arquivos(p, saida); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.spec\./.test(n)) saida.push(p);
  }
  return saida;
}

/** O objeto literal é uma folha? (tem `secoes` ou `identificacao`) */
function ehFolha(no: ts.Node): boolean {
  return ts.isObjectLiteralExpression(no) && no.properties.some((p) =>
    p.name !== undefined && ['secoes', 'identificacao'].includes(p.name.getText()));
}

/** Texto de erro, SQL, rota e chave técnica não são documento. */
function ehTecnico(no: ts.Node, t: string): boolean {
  if (/^(SELECT|INSERT|UPDATE|WITH|DELETE)\b/.test(t) || /^\/|^app_|^[a-z_]+\.[a-z_]+$/.test(t)) return true;
  for (let p: ts.Node | undefined = no.parent; p; p = p.parent) {
    if (ts.isNewExpression(p) && /Exception|Error/.test(p.expression.getText())) return true;
    if (ts.isCallExpression(p) && /\.(query|log|warn|error)$/.test(p.expression.getText())) return true;
    if (ts.isPropertyAssignment(p) && ['action', 'entity', 'entidade', 'detail', 'tipo', 'aviso', 'message']
        .includes(p.name.getText())) return true;
  }
  return false;
}

/** As partes de texto FIXO de um literal (num template, fora dos `${}`). */
function partes(no: ts.Node, src: ts.SourceFile): string[] {
  if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) return [no.text];
  if (ts.isTemplateExpression(no)) return [no.head.text, ...no.templateSpans.map((s) => s.literal.text)];
  return [];
}

function problemas(texto: string): string[] {
  const achados: string[] = [];
  if (/—| – /.test(texto)) achados.push('travessão');
  for (const m of texto.matchAll(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}\b/g)) {
    if (!SIGLAS.has(m[0])) achados.push(`maiúsculas "${m[0]}"`);
  }
  if (/["“”]/.test(texto)) achados.push('aspas');
  if (/\bsistema\b/i.test(texto)) achados.push('fala do "sistema"');
  if (/de propósito|não é avaliação|não é uma avaliação/i.test(texto)) achados.push('explica a regra');
  return achados;
}

function textosDeDocumento(): { onde: string; texto: string }[] {
  const saida: { onde: string; texto: string }[] = [];
  for (const pasta of PASTAS) {
    for (const f of arquivos(pasta)) {
      const inteiro = ARQUIVOS_INTEIROS.test(f);
      const servidor = f.startsWith(PASTAS[0]);
      const cod = readFileSync(f, 'utf8');
      if (!inteiro && !servidor && !/secoes/.test(cod)) continue;
      const src = ts.createSourceFile(f, cod, ts.ScriptTarget.Latest, true);
      /* A função que MONTA uma folha tem todos os seus textos conferidos: as
         linhas da tabela costumam ser escritas antes do objeto, em variáveis. */
      const montaFolha = (no: ts.Node): boolean => {
        let achou = false;
        const procura = (n: ts.Node) => { if (achou) return; if (ehFolha(n)) achou = true; else ts.forEachChild(n, procura); };
        procura(no);
        return achou;
      };
      const ehFuncao = (no: ts.Node) => ts.isFunctionDeclaration(no) || ts.isMethodDeclaration(no)
        || ts.isArrowFunction(no) || ts.isFunctionExpression(no);
      const visita = (no: ts.Node, dentroDeFolha: boolean) => {
        /* Função enorme (o servidor de mentira responde a todas as rotas numa só)
           não conta inteira: só os objetos de folha dentro dela. */
        const curta = (n: ts.Node) =>
          src.getLineAndCharacterOfPosition(n.getEnd()).line - src.getLineAndCharacterOfPosition(n.getStart()).line < 250;
        const agora = dentroDeFolha || ehFolha(no) || (ehFuncao(no) && curta(no) && montaFolha(no));
        const literal = ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no) || ts.isTemplateExpression(no);
        /* O separador sem letra nenhuma (`join(' — ')`, `${codigo} — ${nome}`)
           mora em auxiliares FORA da folha, como o rótulo da casa, e chegava ao
           subtítulo de sete documentos. No servidor, ele é conferido no arquivo
           inteiro. */
        if (literal && !agora && !inteiro && servidor && !ehTecnico(no, partes(no, src).join(''))) {
          const t = partes(no, src).join('');
          if (!/[a-zà-ú]{3,}/i.test(t) && / — /.test(t)) {
            const l = src.getLineAndCharacterOfPosition(no.getStart()).line + 1;
            saida.push({ onde: `${relative(RAIZ, f)}:${l}`, texto: t });
          }
          return;
        }
        if (literal && (agora || inteiro)) {
          const t = partes(no, src).join(' ');
          if ((/[a-zà-ú]{3,}/i.test(t) || / — /.test(t)) && !ehTecnico(no, t)) {
            const l = src.getLineAndCharacterOfPosition(no.getStart()).line + 1;
            saida.push({ onde: `${relative(RAIZ, f)}:${l}`, texto: t });
          }
          return;
        }
        ts.forEachChild(no, (c) => visita(c, agora));
      };
      visita(src, false);
    }
  }
  return saida;
}

describe('A voz dos documentos', () => {
  const textos = textosDeDocumento();

  it('encontra os textos dos documentos (sem isto, passaria por não ler nada)', () => {
    expect(textos.length).toBeGreaterThan(300);
    expect(textos.some((t) => /ata-folha\.ts/.test(t.onde))).toBe(true);
    expect(textos.some((t) => /mock\.ts/.test(t.onde))).toBe(true);
  });

  /* O roteiro da Casa 03 também é documento: sai em Word e vai impresso para a
     casa. As siglas de rede e de e-mail que ele cita entram só aqui. */
  it('o roteiro da Casa 03 segue a mesma voz', () => {
    const md = readFileSync(join(RAIZ, 'docs', 'roteiro-marcelo.md'), 'utf8');
    const siglasDoRoteiro = new Set(['INSS', 'DNS', 'SPF', 'DKIM']);
    const errados = md.split('\n').flatMap((l, i) => problemas(l.replace(/`[^`]*`/g, ''))
      .filter((p) => p !== 'fala do "sistema"')
      .filter((p) => !siglasDoRoteiro.has(p.replace(/^maiúsculas "(.*)"$/, '$1')))
      .map((p) => `roteiro:${i + 1} (${p}): ${l.trim().slice(0, 80)}`));
    expect(errados).toEqual([]);
  });

  /* O aviso da TELA não é ressalva de documento: foi assim que a frase
     "quantidade de visitas não é avaliação da família" saiu impressa no
     relatório de visitas, sem passar por nenhum literal desta conferência. */
  it('a ressalva de um documento é escrita para o documento, nunca o aviso da tela', () => {
    const emprestadas: string[] = [];
    for (const pasta of PASTAS) {
      for (const f of arquivos(pasta)) {
        readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
          if (/\bressalvas?:\s*[\w.]*\.(aviso|message|mensagem)\b/.test(l)) {
            emprestadas.push(`${relative(RAIZ, f)}:${i + 1}: ${l.trim()}`);
          }
        });
      }
    }
    expect(emprestadas).toEqual([]);
  });

  it('nenhum texto de documento tem travessão, maiúscula de ênfase, aspas ou fala do sistema', () => {
    const errados = textos.flatMap((t) => problemas(t.texto).map((p) => `${t.onde} (${p}): ${t.texto.slice(0, 90)}`));
    expect(errados).toEqual([]);
  });
});
