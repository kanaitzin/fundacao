/**
 * A FOLHA DA ESCALA — a que vai para a parede.
 *
 * Este arquivo NÃO IMPORTA NADA além do contrato da folha, de propósito: o
 * servidor monta a folha e vira `.docx`; a tela desenha a MESMA folha na
 * pré-visualização. Quem confere na tela confere o papel que sai.
 *
 * O Marcelo pediu "gerar o relatório disso para colocar numa parede para os
 * educadores saberem". Três decisões moram aqui:
 *
 *  * **um quadro por semana, e não uma lista corrida.** Trinta linhas seguidas
 *    não se lê de longe; o que a pessoa faz diante da parede é procurar o
 *    próprio nome no dia de hoje;
 *  * **o turno sem ninguém sai ESCRITO** — "— sem escala —". Linha em branco
 *    numa folha pregada se lê como "esqueceram de imprimir", e o buraco é
 *    justamente o que precisa ser visto antes de virar noite sem educador;
 *  * **nenhuma contagem por pessoa.** Sem "Fulana: 15 plantões". Somar plantão
 *    por gente é medição de pessoa com outro nome (§3.3), e uma folha de
 *    parede é o pior lugar possível para isso.
 */
import type { Folha, AutorDaFolha } from '../../kernel/documentos/folha';
import { diaBR } from '../../kernel/documentos/folha';

export interface LinhaDaEscala {
  data: string;            // ISO (yyyy-mm-dd)
  turno: 'diurno' | 'noturno';
  quem: string | null;
  cargo: string | null;
  inicio: string | null;
  fim: string | null;
  nota: string | null;
}

const DIA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Segunda-feira da semana daquela data, no fuso da instituição. */
function segundaDa(iso: string): string {
  const d = new Date(`${iso}T12:00:00-03:00`);
  const dow = (d.getDay() + 6) % 7;          // 0 = segunda
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

function horario(l: LinhaDaEscala): string {
  if (!l.inicio && !l.fim) return '';
  return ` (${(l.inicio ?? '').slice(0, 5)}–${(l.fim ?? '').slice(0, 5)})`;
}

export function folhaDaEscala(input: {
  casa: string;
  de: string;
  ate: string;
  linhas: LinhaDaEscala[];
  autor: AutorDaFolha;
}): Folha {
  const { casa, de, ate, linhas, autor } = input;

  // Um quadro por semana. As semanas saem na ordem do calendário, e o dia
  // aparece mesmo quando ninguém está escalado nele.
  const semanas = new Map<string, LinhaDaEscala[]>();
  for (const l of linhas) {
    const chave = segundaDa(l.data);
    if (!semanas.has(chave)) semanas.set(chave, []);
    semanas.get(chave)!.push(l);
  }

  const secoes = [...semanas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([segunda, doPeriodo]) => {
      const dias = [...new Set(doPeriodo.map((l) => l.data))].sort();
      const linhasDoQuadro = dias.map((dia) => {
        const doDia = doPeriodo.filter((l) => l.data === dia);
        const nomes = (turno: 'diurno' | 'noturno') => {
          const gente = doDia.filter((l) => l.turno === turno && l.quem);
          return gente.length
            ? gente.map((l) => `${l.quem}${horario(l)}`).join(' · ')
            : '— sem escala —';
        };
        const base = new Date(`${dia}T12:00:00-03:00`);
        return [
          `${diaBR(dia)} · ${DIA_SEMANA[base.getDay()]}`,
          nomes('diurno'),
          nomes('noturno'),
        ];
      });

      return {
        titulo: `Semana de ${diaBR(segunda)}`,
        tabela: {
          cabecalho: ['Dia', 'Plantão diurno (08:00–20:00)', 'Plantão noturno (20:01–07:59)'],
          linhas: linhasDoQuadro,
        },
      };
    });

  const buracos = linhas.filter((l) => !l.quem).length;

  return {
    titulo: 'Escala de plantão',
    subtitulo: `${casa} · de ${diaBR(de)} a ${diaBR(ate)}`,
    identificacao: [
      { rotulo: 'Casa', valor: casa },
      { rotulo: 'Período', valor: `${diaBR(de)} a ${diaBR(ate)}` },
      { rotulo: 'Emitida em', valor: diaBR(new Date()) },
    ],
    secoes: secoes.length ? secoes : [{
      titulo: 'Nenhum plantão escalado neste período',
      paragrafos: ['A escala deste período ainda não foi montada.'],
    }],
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: buracos > 0
      ? 'Os turnos marcados "sem escala" ainda não têm ninguém designado. A escala '
        + 'informa quem devia estar na casa; ela não impede ninguém de trabalhar, e quem '
        + 'cobrir um turno fora dela registra a passagem normalmente.'
      : 'A escala informa quem devia estar na casa. Ela não impede ninguém de trabalhar: '
        + 'quem cobrir um turno fora dela registra a passagem normalmente, com o aviso de '
        + 'que não constava.',
  };
}
