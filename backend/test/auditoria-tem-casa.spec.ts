/**
 * TODA LINHA DE AUDITORIA QUE TEM CASA DIZ QUAL É (fase 149).
 *
 * POR QUE ISTO É TESTE E NÃO COMBINADO. A policy `audit_select` (0920) dá à
 * coordenação o rastro da própria casa assim:
 *
 *     WHEN app_current_role() = 'coordenador' THEN house_id = ANY(app_casas_no_alcance())
 *
 * e `NULL = ANY(...)` é NULL — que não é verdadeiro. **Linha de auditoria sem
 * casa é linha que a coordenação da casa não lê.** Quando esta conferência foi
 * escrita, 79 das 152 chamadas de `audit.log` do servidor não passavam
 * `houseId`: o relatório judiciário exportado, o dado bancário consultado, a
 * dose confirmada, a foto de identificação guardada, o anexo da internação
 * aberto — tudo gravado, e nada visível para quem responde pela casa.
 *
 * E a auditoria é append-only: linha que nasce sem casa fica sem casa para
 * sempre. Não há correção depois, só daqui para frente — e é por isso que o
 * conferidor é estático, e não um teste de ponta a ponta. Ponta a ponta prova
 * um caminho; este cobra TODOS, inclusive o que ninguém exercita.
 *
 * A LISTA DE EXCEÇÃO É ESCRITA, e é curta de propósito. Ela não é "as que eu
 * não corrigi": é o conjunto das ações que não acontecem DENTRO de uma casa —
 * a sessão de quem entra, o cadastro da equipe, o relógio que roda as oito.
 * Acrescentar uma linha aqui é uma decisão, e quem a acrescenta escreve por quê.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TABELAS_COM_CASA } from '../src/kernel/audit/audit.service';

const SRC = join(__dirname, '..', 'src');

/**
 * AS AÇÕES SEM CASA — e a razão de cada grupo.
 *
 * Quem lê estas linhas é o Gestor Geral, que alcança as oito, ou a pessoa sobre
 * quem elas falam. Nenhuma delas responde "o que aconteceu na Casa 03".
 */
const SEM_CASA = new Set([
  /* A SESSÃO E A CONTA. O educador de plantão trabalha numa casa; a conta dele
     é da instituição, e a troca de senha dele não é ato da casa de ninguém. */
  'auth.login', 'auth.login_failed', 'auth.login_locked', 'auth.logout',
  'auth.reauth', 'auth.reauth_failed', 'auth.revoke_all', 'auth.password_change',
  /* O CADASTRO DA EQUIPE. Convite e cor de linha são da pessoa, e uma pessoa
     pode servir mais de uma casa — escolher uma delas seria inventar. */
  'auth.invite_sent', 'staff.line_color',
  /* A CONSULTA DE CPF NA ADMISSÃO acontece ANTES de existir vínculo com casa
     nenhuma: é a pergunta "esta criança já passou pela Fundação?". */
  'person.cpf_check',
  /* O QUE É DAS OITO CASAS DE UMA VEZ. */
  'relogio.dia', 'painel.metricas', 'ata_geral.close_pending',
  /* A REMESSA DO APARELHO traz operações de mais de uma casa numa só linha; a
     casa aparece em cada operação aplicada, que tem rastro próprio. */
  'sync.push',
]);

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (e.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** O bloco `{...}` da chamada, casando as chaves — regex não casa chave. */
function blocos(texto: string): { inicio: number; corpo: string }[] {
  const out: { inicio: number; corpo: string }[] = [];
  const re = /audit\.log\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const i = texto.indexOf('{', m.index);
    let nivel = 0, j = i;
    for (; j < texto.length; j++) {
      if (texto[j] === '{') nivel++;
      else if (texto[j] === '}' && --nivel === 0) break;
    }
    out.push({ inicio: i, corpo: texto.slice(i, j + 1) });
  }
  return out;
}

describe('Toda linha de auditoria que tem casa diz qual é', () => {
  const chamadas: { arquivo: string; linha: number; acoes: string[]; temCasa: boolean }[] = [];

  beforeAll(() => {
    for (const arq of arquivos(SRC)) {
      const t = readFileSync(arq, 'utf8');
      for (const { inicio, corpo } of blocos(t)) {
        /* `action:` pode ser literal, ternário de dois literais ou variável. As
           strings do trecho do `action` valem; sem nenhuma, o padrão é COBRAR —
           quem computa o nome da ação em outro lugar declara a casa. */
        const trecho = /action:\s*([^,\n]*)/.exec(corpo)?.[1] ?? '';
        chamadas.push({
          arquivo: arq.slice(SRC.length + 1),
          linha: t.slice(0, inicio).split('\n').length,
          acoes: [...trecho.matchAll(/'([a-z_][a-z_0-9.]*)'/g)].map((x) => x[1]),
          temCasa: /\bhouseId\b/.test(corpo),
        });
      }
    }
  });

  it('a medição acha as chamadas — senão o conferidor passa por não olhar', () => {
    expect(chamadas.length).toBeGreaterThan(140);
  });

  it('nenhuma ação de dentro de uma casa é gravada sem a casa', () => {
    const faltando = chamadas
      .filter((c) => !c.temCasa)
      .filter((c) => c.acoes.length === 0 || !c.acoes.every((a) => SEM_CASA.has(a)))
      .map((c) => `${c.arquivo}:${c.linha} (${c.acoes.join('/') || 'ação calculada'})`);
    expect(faltando).toEqual([]);
  });

  /* A outra lista escrita desta fase, pela mesma razão: `TABELAS_COM_CASA`
     permite interpolar o nome da tabela na consulta da casa. Nome que ninguém
     pede é enfeite — e enfeite numa lista de permissão é o que sobrevive a uma
     revisão sem ninguém saber por que está lá. */
  it('a lista de tabelas permitidas não tem enfeite: toda tabela dela é pedida', () => {
    const pedidas = new Set<string>();
    for (const arq of arquivos(SRC)) {
      for (const m of readFileSync(arq, 'utf8').matchAll(/casaDoRegistro\(user\.id, '([a-z_]+)'/g)) {
        pedidas.add(m[1]);
      }
    }
    expect([...TABELAS_COM_CASA].filter((x) => !pedidas.has(x))).toEqual([]);
    /* E o outro sentido: tabela pedida e fora da lista devolveria `null` calado. */
    expect([...pedidas].filter((x) => !TABELAS_COM_CASA.has(x))).toEqual([]);
  });

  it('a lista de exceção não envelhece: toda ação dela ainda existe no código', () => {
    const escritas = new Set(chamadas.flatMap((c) => c.acoes));
    const orfas = [...SEM_CASA].filter((a) => !escritas.has(a));
    expect(orfas).toEqual([]);
  });
});
