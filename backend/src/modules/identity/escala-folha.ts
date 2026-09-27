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
  return ` (${(l.inicio ?? '').slice(0, 5)} às ${(l.fim ?? '').slice(0, 5)})`;
}

export function folhaDaEscala(input: {
  casa: string;
  de: string;
  ate: string;
  linhas: LinhaDaEscala[];
  /** O horário do diurno da casa no primeiro e no último dia do período. */
  turnos?: { dia: string; de: string; ate: string }[];
  autor: AutorDaFolha;
}): Folha {
  const { casa, de, ate, linhas, autor } = input;
  /* O noturno é o resto do dia: começa um minuto depois do fim do diurno. */
  const umMinutoDepois = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const t = h * 60 + m + 1;
    return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };
  const umMinutoAntes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const t = (h * 60 + m + 1439) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };
  const horarioDoDia = (t: { de: string; ate: string }) =>
    `diurno das ${t.de} às ${t.ate}; noturno das ${umMinutoDepois(t.ate)} às ${umMinutoAntes(t.de)}`;
  const [primeiro, ultimo] = input.turnos ?? [];
  const horarios = !primeiro ? []
    : ultimo && (ultimo.de !== primeiro.de || ultimo.ate !== primeiro.ate)
      ? [{ rotulo: 'Horário dos turnos', valor: `${horarioDoDia(primeiro)} (alterado no período; em ${diaBR(ultimo.dia)}: ${horarioDoDia(ultimo)})` }]
      : [{ rotulo: 'Horário dos turnos', valor: horarioDoDia(primeiro) }];

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
            : 'sem profissional escalado';
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
          cabecalho: ['Dia', 'Plantão diurno', 'Plantão noturno'],
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
      ...horarios,
      { rotulo: 'Emitida em', valor: diaBR(new Date()) },
    ],
    secoes: secoes.length ? secoes : [{
      titulo: 'Escala não definida',
      paragrafos: ['Não há profissionais escalados para o período.'],
    }],
    geradoPor: autor.nome,
    cargo: autor.cargo,
    ressalva: (buracos > 0
      ? 'Há turnos ainda sem profissional escalado; a coordenação deve completá-los. ' : '')
      + 'Em caso de substituição ou cobertura de plantão, o profissional que assumir o '
      + 'turno registra a passagem normalmente, com a observação de que não constava na escala.',
  };
}
