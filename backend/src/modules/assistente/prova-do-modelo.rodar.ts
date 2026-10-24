import { FERRAMENTAS, NOMES_DAS_FERRAMENTAS } from './ferramentas';
import { GUIA_DA_ACOLHE, contexto, guiaDoCargo } from './guia';
import { notaDoMomento } from './momento';
import {
  ConfiguracaoDoMotorLocal, MotorLocalFalhou, daRespostaAberta, ferramentasAbertas, paraOPadraoAberto, perguntarAoMotorLocal,
} from './motor-local';
import { CASOS_DA_PROVA, CasoDaProva, ResultadoDoCaso } from './prova-do-modelo';

/**
 * Roda a prova do modelo (fase 241) contra o computador do Pão, pelo mesmo
 * caminho do servidor: as instruções do cargo, a nota do momento no começo da
 * pergunta, a tradução para o padrão aberto e a volta. Quem pergunta é uma
 * coordenação fictícia da Casa 03, que alcança todas as telas da casa. Nada
 * vai ao banco nem à auditoria: a prova não conversa com dado de ninguém.
 */
export const CASA_DA_PROVA = { id: '00000000-0000-4000-8000-000000000003', nome: 'Casa 03 (piloto)' };

/** As telas que o guia descreve, na forma que a tela manda ao servidor. */
export function telasDoGuia() {
  return GUIA_DA_ACOLHE.split('\n').flatMap((l) => {
    const m = /^- ([^(\n]+) \(([a-z0-9-]+)\):/.exec(l);
    return m ? [{ chave: m[2], titulo: m[1].trim() }] : [];
  });
}

export async function rodarAProva(
  cfg: ConfiguracaoDoMotorLocal, casos: CasoDaProva[] = CASOS_DA_PROVA,
  aoTerminarUm?: (r: ResultadoDoCaso) => void, agora: () => Date = () => new Date(),
): Promise<ResultadoDoCaso[]> {
  const telas = telasDoGuia();
  const instrucoes = [guiaDoCargo(telas.map((t) => t.chave)),
    contexto({ pessoa: 'Maria da Prova Fictícia', cargo: 'coordenador', telas })];
  const resultados: ResultadoDoCaso[] = [];
  for (const caso of casos) {
    const instante = agora();
    const hora = Number(instante.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }));
    const nota = notaDoMomento({ agora: instante, turno: hora >= 8 && hora < 20 ? 'diurno' : 'noturno', tela: 'Dia', casa: CASA_DA_PROVA });
    const inicio = Date.now();
    let r: ResultadoDoCaso;
    try {
      const json = await perguntarAoMotorLocal(cfg,
        paraOPadraoAberto(instrucoes, [{ role: 'user', content: `${nota}\n${caso.pergunta}` }]), ferramentasAbertas(FERRAMENTAS));
      const volta = daRespostaAberta(json, NOMES_DAS_FERRAMENTAS);
      const resposta = {
        texto: volta.content.filter((b) => b.type === 'text').map((b) => String(b.text)).join('\n'),
        ferramentas: volta.content.filter((b) => b.type === 'tool_use')
          .map((b) => ({ name: String(b.name), input: (b.input ?? {}) as Record<string, unknown> })),
      };
      r = { caso, resposta, passou: caso.passa(resposta), segundos: (Date.now() - inicio) / 1000 };
    } catch (e) {
      r = { caso, resposta: null, passou: false, segundos: (Date.now() - inicio) / 1000,
        falha: e instanceof MotorLocalFalhou ? `${e.motivo}${e.status ? ` ${e.status}` : ''}` : (e as Error).name };
    }
    resultados.push(r);
    aoTerminarUm?.(r);
  }
  return resultados;
}
