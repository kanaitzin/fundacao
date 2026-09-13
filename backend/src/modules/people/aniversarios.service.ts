import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * OS ANIVERSÁRIOS, AVISADOS ANTES (migração 1160).
 *
 * Pedido do Marcelo: o sistema avisar com antecedência, "pra casa poder se
 * preparar" e "pra não ter que ler papel na parede", e saber se no dia alguém
 * já está ciente. A data de nascimento já estava no perfil; o que faltava era
 * a casa saber ANTES — até aqui o aniversário só aparecia DEPOIS, como memória
 * no álbum, que é o registro da festa que já houve.
 *
 * OS TRÊS MARCOS — sete dias, três dias e o dia — saem da frase dele. Sete é o
 * prazo de comprar bolo e avisar quem não trabalha no dia; três é o lembrete de
 * quem esqueceu; no dia é para ninguém deixar passar.
 *
 * A ciência é que faz o aviso PARAR. Sem ela, ou o sistema repete até o dia e
 * vira ruído — e ruído ensina a ignorar aviso —, ou para sozinho e ninguém sabe
 * se alguém viu.
 *
 * O QUE ESTE MÓDULO NÃO FAZ: perguntar se a festa aconteceu. O sistema não
 * cobra festa de ninguém; uma casa com crianças pequenas e uma de adolescentes
 * fazem isso de formas diferentes, e "fez festa" como campo é o primeiro passo
 * para alguém cobrar o número depois. O que se registra DEPOIS, se a casa
 * quiser, é a memória no álbum — que já existe, e é da criança.
 */
const MARCOS = [0, 3, 7];

/**
 * O dia como 'AAAA-MM-DD', venha ele como texto ou como `Date`.
 *
 * Uma coluna `date` chega do driver como `Date` na meia-noite do fuso do
 * PROCESSO. `String(...).slice(0, 4)` dava "Sun " e o ano virava `NaN`;
 * formatar no fuso da instituição daria o DIA ANTERIOR quando o processo roda
 * em UTC. Por isso a leitura é pelos campos locais do próprio objeto, que
 * reconstroem a data que o banco gravou. Mesmo defeito da fase 95, em outro
 * lugar — por isso agora mora numa função só.
 */
function diaISO(v: unknown): string {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      + `-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
}

interface Linha {
  person_id: string; nome: string; nascimento: string; dia: string;
  idade_que_faz: number; faltam: number;
  ciente_por: string | null; ciente_em: string | null;
}

@Injectable()
export class AniversariosService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  private async ler(user: AuthenticatedUser, houseId: string, dias: number): Promise<Linha[]> {
    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows: [casa] } = await c.query(
        `SELECT app_house_in_scope($1) AS alcance`, [houseId]);
      if (!casa?.alcance) return null;
      const { rows } = await c.query(
        `SELECT * FROM app_aniversarios_proximos($1, $2)`, [houseId, dias]);
      return rows as Linha[];
    });
    if (!linhas) throw new NotFoundException('Casa não encontrada — ou fora do seu alcance.');
    return linhas;
  }

  /**
   * A lista da casa. `dias` maior cobre a casa que junta os aniversariantes do
   * mês numa festa só — o Marcelo não sabia se é assim, e as duas leituras
   * cabem na mesma tela.
   */
  async proximos(user: AuthenticatedUser, houseId: string, dias = 7) {
    const janela = Math.min(Math.max(Number(dias) || 7, 1), 366);
    const linhas = await this.ler(user, houseId, janela);
    return {
      janela,
      aniversariantes: linhas.map((r) => ({
        personId: r.person_id, nome: r.nome, dia: diaISO(r.dia),
        faltam: r.faltam, idadeQueFaz: r.idade_que_faz,
        /* "hoje" e "amanhã" são as palavras que a pessoa procura às 7h. */
        quando: r.faltam === 0 ? 'hoje'
          : r.faltam === 1 ? 'amanhã' : `em ${r.faltam} dias`,
        ciente: !!r.ciente_por,
        cientePor: r.ciente_por, cienteEm: r.ciente_em,
      })),
    };
  }

  /**
   * "Estamos cientes" — e é do EDUCADOR também, não só da coordenação: quem
   * prepara o aniversário na prática é quem está com a criança.
   *
   * Duas pessoas clicando não é erro: `DO NOTHING` deixa quem viu primeiro.
   */
  async darCiencia(user: AuthenticatedUser, personId: string, input: { nota?: string }) {
    const houseId = await this.db.asUser(user.id, async (c) => {
      /* rls-join-ok: `house_stay` responde à policy da casa; fora de alcance a
         consulta volta vazia e a resposta é 404, igual a inexistente (regra 8). */
      const { rows: [s] } = await c.query(
        `SELECT house_id FROM house_stay WHERE person_id = $1 AND status = 'ativa'`, [personId]);
      return s?.house_id as string | undefined;
    });
    if (!houseId) {
      throw new NotFoundException('Esta criança não está numa casa do seu alcance.');
    }
    const linhas = await this.ler(user, houseId, 366);
    const dele = linhas.find((r) => r.person_id === personId);
    if (!dele) throw new NotFoundException('Esta criança não tem data de nascimento no perfil.');
    const ano = Number(diaISO(dele.dia).slice(0, 4));

    await this.db.asUser(user.id, async (c) => c.query(
      `INSERT INTO birthday_ack (person_id, year, house_id, note, acked_by)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (person_id, year) DO NOTHING`,
      [personId, ano, houseId, String(input?.nota ?? '').trim() || null, user.id]));

    await this.audit.log({
      action: 'aniversario.ciente', actorId: user.id, institutionId: user.institutionId,
      houseId, entity: 'person', entityId: personId, detail: { ano },
    });
    return {
      ok: true,
      aviso: `Ciente do aniversário de ${dele.nome} — a casa para de ser avisada deste.`,
    };
  }

  /**
   * O disparo, chamado por relógio uma vez ao dia (rota de máquina, como a
   * geração das doses).
   *
   * Vai para a casa inteira (nível `equipe`), e não só para a coordenação.
   * Idempotente pela chave do escalonamento: rodar duas vezes no mesmo dia não
   * duplica. Quem já deu ciência sai do disparo, inclusive no dia.
   */
  async avisarDaCasa(user: AuthenticatedUser, houseId: string) {
    const linhas = await this.ler(user, houseId, 7);
    let avisados = 0;
    for (const r of linhas) {
      if (!MARCOS.includes(r.faltam) || r.ciente_por) continue;
      const dia = diaISO(r.dia);
      const ano = Number(dia.slice(0, 4));
      await this.bus.publish('escalation.requested', {
        level: 'equipe',
        entity: 'birthday', entityId: r.person_id,
        reason: `aniversário em ${r.faltam} dia(s)`,
        title: r.faltam === 0
          ? `Hoje é aniversário de ${r.nome}`
          : `${r.nome} faz ${r.idade_que_faz} anos em ${r.faltam} dias`,
        body: r.faltam === 0
          ? `${r.nome} faz ${r.idade_que_faz} anos hoje.`
          : `Dia ${dia.slice(8, 10)}/${dia.slice(5, 7)}. `
            + 'Dê-se por ciente na tela do dia para a casa parar de ser avisada.',
        groupKey: `aniversario:${r.person_id}:${ano}:${r.faltam}`,
      }, { actorId: user.id, houseId });
      avisados++;
    }
    return { ok: true, avisados };
  }
}
