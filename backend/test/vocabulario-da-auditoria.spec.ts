/**
 * A AUDITORIA FALA A LÍNGUA DE QUEM A LÊ — e o conferidor mantém isso verdade.
 *
 * A fase 112 abriu a auditoria para leitura e escreveu junto um mapa de
 * rótulos com dezoito entradas, de memória. Medido contra o código na fase
 * 115, o mapa cobria **quatorze** das **170** ações que o sistema grava, e
 * **quatro das suas dezoito entradas não casavam com ação nenhuma** —
 * `person.update`, `person.correct`, `benefit.view` e `credential.open`,
 * todas próximas de uma ação real e nenhuma igual a ela.
 *
 * Nenhum teste pegava isso porque não havia o que pegar: um `Record` que
 * devolve `undefined` cai no `?? r.action` e a tela mostra o código cru. Não
 * dá erro, não deixa rastro, e quem vê é a coordenação — que lê
 * `medication.leave_with_child` e conclui que o sistema está falando com ela
 * em outra língua.
 *
 * ESTE CONFERIDOR REPROVA NAS DUAS DIREÇÕES, e a segunda importa tanto quanto
 * a primeira:
 *
 *  * **ação sem frase** — alguém gravou uma ação nova e não disse como ela se
 *    lê. É o defeito que aparece na tela;
 *  * **frase sem ação** — sobrou um rótulo de algo que o sistema não faz (ou
 *    que foi renomeado). Não aparece em tela nenhuma, e é justamente por isso
 *    que ele apodrece ali: é a prova de que o mapa foi escrito de cabeça.
 *
 * *O mesmo raciocínio do `numeros-da-documentacao`: o que se afirma sai do
 * código, ou não se afirma.*
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ACOES_MONTADAS, VOCABULARIO_DA_AUDITORIA } from '../src/kernel/audit/vocabulario';

const SRC = join(__dirname, '..', 'src');

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, saida);
    else if (nome.endsWith('.ts') || nome.endsWith('.sql')) saida.push(p);
  }
  return saida;
}

/**
 * As ações que o código GRAVA, lidas do próprio código.
 *
 * Três formas aparecem, e as três precisam ser lidas:
 *
 *  * `action: 'x.y'` — a comum;
 *  * `action: cond ? 'a' : 'b'` — duas ações num lugar só. Só o que vem
 *    DEPOIS do `?` conta: a string da condição (`input.acao === 'assinar'`)
 *    não é ação nenhuma, e contá-la faria o conferidor cobrar rótulo para a
 *    palavra "assinar";
 *  * `action: \`pauta.${situacao}\`` e `action: acao` — montadas. Essas o
 *    arquivo do vocabulário declara em `ACOES_MONTADAS`, porque ler o texto
 *    do arquivo não as revela, e o que não se lê não se guarda.
 *
 * E UMA QUARTA, que a primeira versão deste conferidor não via: **o SQL também
 * escreve na auditoria.** Vinte e cinco ações saem de dentro de funções
 * `SECURITY DEFINER` — `credential.reveal`, `incident.attachment_open`,
 * `staff.create`, `transfer.decline` —, e são justamente as mais sensíveis,
 * porque estão no banco exatamente para que nenhum caminho da aplicação
 * escape delas. Um conferidor que lesse só o TypeScript daria tudo verde e
 * deixaria de fora a revelação de uma senha do cofre.
 *
 * *No SQL a ação é um valor no meio de um `VALUES`, e não um campo nomeado. O
 * que os distingue é o ponto: código de ação tem um (`credential.reveal`), e
 * nome de tabela, de coluna e de chave de `detail` não têm (`incident`,
 * `motivo`, `assinaturas_faltantes`). É heurística, e está escrita como tal —
 * mas ela erra para o lado de COBRAR rótulo demais, que é o lado onde o erro
 * aparece na hora, e não seis meses depois numa tela.*
 */
function acoesDoCodigo(): Map<string, string> {
  const achadas = new Map<string, string>();
  for (const arq of arquivos(SRC)) {
    const rel = relative(SRC, arq);
    // O próprio vocabulário é a lista de rótulos, não um lugar que grava.
    if (rel === 'kernel/audit/vocabulario.ts') continue;
    const src = readFileSync(arq, 'utf8');
    const onde = (i: number) => `${rel}:${src.slice(0, i).split('\n').length}`;

    if (arq.endsWith('.ts')) {
      for (const m of src.matchAll(/action:\s*([^,\n]+(?:\n[^,\n]*)?)/g)) {
        const expressao = m[1];
        const depoisDoTernario = expressao.includes('?')
          ? expressao.slice(expressao.indexOf('?'))
          : expressao;
        for (const q of depoisDoTernario.matchAll(/'([a-z][a-z0-9_.]*)'/g)) {
          if (!achadas.has(q[1])) achadas.set(q[1], onde(m.index!));
        }
      }
    } else {
      for (const m of src.matchAll(/INSERT INTO audit_event[\s\S]{0,900}?;/g)) {
        for (const q of m[0].matchAll(/'([a-z][a-z0-9_]*\.[a-z0-9_.]+)'/g)) {
          if (!achadas.has(q[1])) achadas.set(q[1], onde(m.index!));
        }
      }
    }
  }
  for (const a of ACOES_MONTADAS) if (!achadas.has(a)) achadas.set(a, 'ACOES_MONTADAS');
  return achadas;
}

describe('O vocabulário da auditoria', () => {
  const doCodigo = acoesDoCodigo();

  it('toda ação que o sistema grava tem frase em português', () => {
    const semFrase = [...doCodigo.entries()]
      .filter(([acao]) => !VOCABULARIO_DA_AUDITORIA[acao])
      .map(([acao, onde]) => `${acao} (${onde})`);
    expect(semFrase).toEqual([]);
  });

  it('nenhuma frase sobra: rótulo sem ação é rótulo escrito de cabeça', () => {
    const sobrando = Object.keys(VOCABULARIO_DA_AUDITORIA).filter((a) => !doCodigo.has(a));
    expect(sobrando).toEqual([]);
  });

  it('o vocabulário cobre o sistema inteiro, e não um canto dele', () => {
    /*
     * O número não é meta: é o retrato. Ele existe para que encolher a
     * cobertura seja uma decisão visível, e não um efeito de um `git merge`.
     */
    expect(doCodigo.size).toBeGreaterThanOrEqual(173);
    expect(Object.keys(VOCABULARIO_DA_AUDITORIA)).toHaveLength(doCodigo.size);
  });

  it('nenhuma frase atribui o ato a um cargo — o autor já vem na linha', () => {
    /*
     * A linha da auditoria já traz o nome de quem agiu, de coluna própria. Uma
     * frase que dissesse "pela educadora" diria duas vezes — e diria errado no
     * dia em que quem age for a técnica.
     *
     * A regra que sobrou, depois de duas tentativas boas demais, é sobre
     * ATRIBUIÇÃO, e não sobre palavras:
     *
     *  * *"Medicamento entregue para a criança levar"* passa — "criança" aqui
     *    é substantivo comum, e trocá-lo tornaria a frase pior;
     *  * *"Revisão técnica da ocorrência registrada"* passa — "técnica" é o
     *    nome do ato, e a casa o chama assim;
     *  * *"Ocorrência revisada pela equipe técnica"* não passa, e *"Educadora
     *    registrou a ocorrência"* também não: as duas dizem QUEM, e quem já
     *    está na linha, de coluna própria — e estaria errado no dia em que o
     *    ato fosse de outro cargo.
     */
    const ATRIBUI = /\bpel[oa]s?\s/i;
    const CARGO_COMO_SUJEITO = /^(o |a )?(educador|t[eé]cnic|coordenador|enfermeir|gestor)/i;
    const PROIBIDO = { test: (f: string) => ATRIBUI.test(f) || CARGO_COMO_SUJEITO.test(f) };
    const ruins = Object.entries(VOCABULARIO_DA_AUDITORIA)
      .filter(([, frase]) => PROIBIDO.test(frase))
      .map(([a, frase]) => `${a}: "${frase}"`);
    expect(ruins).toEqual([]);
  });

  it('nenhuma frase é o código cru disfarçado', () => {
    /*
     * `'stock.entrada': 'stock.entrada'` passaria nos dois primeiros
     * conferidores e não resolveria nada. A frase tem de ser frase: sem ponto
     * no meio de palavra, sem sublinhado, e em português.
     */
    const ruins = Object.entries(VOCABULARIO_DA_AUDITORIA)
      .filter(([, frase]) => /_/.test(frase) || /[a-z]\.[a-z]/.test(frase) || frase.length < 8)
      .map(([a, frase]) => `${a}: "${frase}"`);
    expect(ruins).toEqual([]);
  });
});
