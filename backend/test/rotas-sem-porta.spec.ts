/**
 * ROTAS SEM PORTA — o levantamento que era feito à mão.
 *
 * O `contrato-rotas.spec` confere um lado: toda chamada da tela existe no
 * servidor. Este confere o OUTRO: toda rota do servidor é chamada por alguma
 * tela — ou está declarada aqui como rota de máquina, com o motivo escrito.
 *
 * Ele existe por causa da fase 61. Duas rotas construídas nas fases 58 e 60
 * ficaram sem porta em tela nenhuma, e as duas eram das pessoas que mais
 * precisariam delas: a equipe técnica não conseguia registrar uma conquista, e
 * a coordenação não tinha como tirar o relatório da própria casa. Nada disso
 * quebra: o `tsc` não vê, e os testes de servidor passam — porque do lado do
 * servidor está tudo certo. O levantamento era feito à mão, de vez em quando,
 * e por isso demorou semanas.
 *
 * A LISTA DE EXCEÇÕES É O CORAÇÃO DESTE ARQUIVO. Cada linha é uma decisão:
 * "esta rota não tem tela, e está certo assim, por este motivo". Acrescentar
 * uma linha aqui é barato — e é exatamente por isso que ela pede o motivo por
 * extenso: sem ele, a lista viraria o lugar onde se esconde o que faltou
 * construir.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src');
const FRONT = join(__dirname, '..', '..', 'frontend', 'src');

interface Rota { verbo: string; caminho: string; arquivo: string }

function arquivos(dir: string, filtro: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) out.push(...arquivos(caminho, filtro));
    else if (filtro(nome)) out.push(caminho);
  }
  return out;
}

function rotasDoServidor(): Rota[] {
  const out: Rota[] = [];
  for (const arq of arquivos(SRC, (f) => f.endsWith('.controller.ts'))) {
    const src = readFileSync(arq, 'utf8');
    const blocos = [...src.matchAll(/@Controller\(\s*'([^']*)'/g)]
      .map((m) => ({ pos: m.index ?? 0, base: m[1] }));
    blocos.forEach((b, i) => {
      const fim = i + 1 < blocos.length ? blocos[i + 1].pos : src.length;
      const trecho = src.slice(b.pos, fim);
      for (const m of trecho.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
        out.push({
          verbo: m[1].toUpperCase(),
          caminho: '/' + [b.base, m[2] ?? ''].filter(Boolean).join('/'),
          arquivo: arq.slice(arq.indexOf('modules')),
        });
      }
    });
  }
  return out;
}

/** As chamadas da tela — e do `mock.ts`, que aqui CONTA. */
function chamadasDaTela(): Set<string> {
  const out = new Set<string>();
  /*
   * Diferente do `contrato-rotas`, o `mock.ts` entra: uma rota que o servidor
   * de mentira responde é uma rota que a demonstração usa, e portanto tem
   * porta. Ele é lido pelos padrões dele — `rota === '/x'`, `seg[0] === 'x'` —
   * e não por chamadas `api(`.
   */
  for (const arq of arquivos(FRONT, (f) => f.endsWith('.ts') || f.endsWith('.tsx'))) {
    const src = readFileSync(arq, 'utf8');
    /*
     * QUALQUER literal de rota conta, e não só o que está dentro de `api(`.
     *
     * A primeira versão olhava só as chamadas diretas, e acusou de órfãs as
     * rotas MAIS usadas da casa: `/activities/:id/record` e
     * `/checks/:id/mark` chegam ao servidor por `apiOuFila`, e o caminho é
     * passado a uma função auxiliar da tela (`acaoComFila`) — a rota está lá,
     * escrita, só não colada no `api(`.
     *
     * A pergunta deste conferidor não é "como a rota é chamada"; isso é do
     * `contrato-rotas`. Aqui a pergunta é "existe alguma tela que sequer
     * menciona esta rota" — e para isso o literal basta.
     */
    for (const m of src.matchAll(/`([^`\n]*)`|'([^'\n]*)'|"([^"\n]*)"/g)) {
      const cru = m[1] ?? m[2] ?? m[3] ?? '';
      if (!cru.startsWith('/')) continue;
      /* A interpolação vira `:x` — `${idDe(ev)}` tem parênteses, e a primeira
       * versão parava neles, deixando `/activities/` como rota. */
      const bruto = cru.replace(/\$\{[^}]*\}/g, ':x').split('?')[0];
      if (!/\s/.test(bruto) && bruto.length > 2) out.add(bruto);
    }
    // O mock declara as rotas que responde; elas contam como porta.
    for (const m of src.matchAll(/rota (?:===|\.startsWith\()\s*'([^']+)'/g)) {
      out.add(m[1].split('?')[0]);
    }
  }
  return out;
}

/**
 * ROTAS QUE NÃO DEVEM TER TELA — cada uma com o motivo por extenso.
 *
 * Três famílias:
 *   1. rota que o APARELHO chama, e não uma pessoa;
 *   2. rota de máquina, chamada por relógio ou por outro serviço;
 *   3. rota de administração técnica, fora do fluxo da casa.
 */
const SEM_TELA_DE_PROPOSITO: Record<string, string> = {
  'GET /medications/alert-offsets':
    'O aparelho lê os horários dos alertas para agendar o lembrete local offline (§17.5).',
  'POST /medications/generate-doses':
    'Geração das doses do dia a partir das prescrições — roda por relógio, e não por '
    + 'alguém apertando um botão.',
  'POST /medications/escalate-overdue':
    'Escalonamento automático do que passou da hora sem confirmação. Se virasse botão, '
    + 'alguém teria que lembrar de apertá-lo justamente no dia em que esquecesse.',
  'GET /health':
    'Sonda de saúde do serviço, para quem monitora o servidor.',
  'POST /activities/generate-day':
    'Gera as atividades do dia a partir da rotina da casa. Roda por relógio, na virada '
    + 'do dia — se dependesse de alguém apertar, o dia começaria vazio na primeira vez '
    + 'que a pessoa esquecesse.',
  'POST /activities/agenda/generate':
    'Gera as ocorrências dos compromissos recorrentes, também por relógio.',
  'POST /activities/mark-unconfirmed':
    'Marca como não confirmadas as atividades cuja hora passou. É o relógio fazendo o '
    + 'que ninguém deve ter que lembrar de fazer no fim do turno.',
  'GET /medications/can-administer':
    'O aparelho pergunta antes de oferecer o botão de confirmar dose; quem decide de '
    + 'verdade continua sendo o servidor, na hora da confirmação (§11.7).',
  'GET /activities':
    'Lista crua das atividades do dia. A tela do Dia usa `GET /timeline`, que junta '
    + 'atividades, doses, chamadas e ocorrências numa linha só — esta fica para consulta '
    + 'de máquina e para a geração da agenda.',
  'GET /transfers/pending':
    'Contagem de transferências à espera, para aviso. As duas caixas que a tela mostra '
    + 'são `GET /transfers/inbox` e `GET /transfers/outbox`.',
  'GET /people/:id/admission':
    'Ficha de acolhimento completa. O perfil mostra o motivo e os dados judiciais nas '
    + 'suas próprias seções; esta rota é a leitura inteira, para o documento e para a '
    + 'migração de dados da implantação.',
  'PATCH /shifts/general-ata/:id/house/:houseId':
    'Correção da linha de uma casa na ATA Geral. Espera a decisão institucional sobre '
    + 'quem lê a ATA Geral de dia (§7.2 do RETOMAR-AQUI) — sem ela, não se sabe quem '
    + 'deveria ter o botão.',
  'POST /followups/:id/sources':
    'Escolha das fontes do acompanhamento. É a decisão de produto §7.7, em aberto: de '
    + 'onde a técnica escolhe as fontes é justamente o que a Fundação não respondeu '
    + 'ainda, e construir a tela antes seria inventar o fluxo.',
  'POST /statements/:id/exceptional-read':
    'Leitura excepcional de relato protegido. É a decisão §7.6, em aberto: o que o '
    + 'Gestor Geral vê ANTES de abrir. A rota existe e é auditada; a porta espera a '
    + 'resposta da Fundação.',
};

describe('Rotas sem porta', () => {
  const rotas = rotasDoServidor();
  const chamadas = chamadasDaTela();

  const temPorta = (r: Rota) => {
    const partes = r.caminho.replace(/^\/|\/$/g, '').split('/');
    for (const c of chamadas) {
      const p = c.replace(/^\/|\/$/g, '').split('/');
      if (p.length !== partes.length) continue;
      if (partes.every((seg, i) => seg.startsWith(':') || p[i] === ':x' || seg === p[i])) {
        return true;
      }
    }
    return false;
  };

  it('encontra as rotas e as chamadas', () => {
    // Guarda contra o teste passar por não ter lido nada.
    expect(rotas.length).toBeGreaterThan(100);
    expect(chamadas.size).toBeGreaterThan(80);
  });

  it('toda rota do servidor tem porta, ou motivo escrito para não ter', () => {
    const orfas = rotas
      .filter((r) => !temPorta(r))
      .filter((r) => !SEM_TELA_DE_PROPOSITO[`${r.verbo} ${r.caminho}`])
      .map((r) => `${r.verbo} ${r.caminho} — ${r.arquivo}`)
      .sort();
    expect(orfas).toEqual([]);
  });

  it('a lista de exceções não guarda rota que a tela passou a chamar', () => {
    /*
     * O contrário também envelhece: uma rota listada aqui como "de máquina"
     * que ganhou tela depois deixa a exceção mentindo, e a próxima pessoa lê
     * o motivo e acredita nele.
     */
    const mentindo = Object.keys(SEM_TELA_DE_PROPOSITO).filter((chave) => {
      const [verbo, caminho] = chave.split(' ');
      const r = rotas.find((x) => x.verbo === verbo && x.caminho === caminho);
      return r && temPorta(r);
    });
    expect(mentindo).toEqual([]);
  });

  it('toda exceção existe no servidor, e explica por quê', () => {
    for (const [chave, motivo] of Object.entries(SEM_TELA_DE_PROPOSITO)) {
      const [verbo, caminho] = chave.split(' ');
      expect(rotas.some((r) => r.verbo === verbo && r.caminho === caminho)).toBe(true);
      /* Motivo curto demais é a porta de saída fácil: "interno", "n/a". A
       * lista só serve se cada linha convencer quem a lê daqui a um ano. */
      expect(motivo.length).toBeGreaterThan(40);
    }
  });
});
