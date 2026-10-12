import {
  BadRequestException, ConflictException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * A SAÍDA PELO PORTÃO (fase 207, pedido de 12/10).
 *
 * A 1020 dizia se a criança pode sair sozinha. Aqui está quem saiu: a portaria
 * e a equipe da casa registram a saída e a volta, e o portão vê, para cada
 * criança, o que vale, quem decidiu e desde quando. O MOTIVO não chega à
 * portaria: ele é da equipe, que conversa com a criança.
 *
 * Sozinha, só sai quem tem a autorização registrada. A recusa é do REGISTRO, e
 * a frase manda chamar o plantão: quem segura ou deixa sair é gente.
 */

const SITUACAO_NO_PORTAO: Record<string, string> = {
  liberada: 'pode sair sem acompanhante',
  acompanhada: 'só sai com acompanhante',
  suspensa: 'não pode sair sem acompanhante',
};

@Injectable()
export class SaidasService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private traduz(e: any): never {
    const m = String(e?.message ?? '');
    if (m.includes('fora_de_escopo') || m.includes('pessoa_fora_de_escopo')) {
      throw new NotFoundException('Criança não encontrada nesta casa.');
    }
    if (m.includes('saida_inexistente')) throw new NotFoundException('Saída não encontrada.');
    if (m.includes('saida_ja_aberta')) {
      throw new ConflictException('Esta criança já está com uma saída aberta. Registre a volta antes.');
    }
    if (m.includes('nao_sai_sozinho:sem_registro')) {
      throw new BadRequestException(
        'A equipe ainda não registrou autorização para esta criança sair sem acompanhante. '
        + 'Ela só sai com acompanhante; se for preciso, chame o líder do plantão.');
    }
    if (m.includes('nao_sai_sozinho')) {
      throw new BadRequestException(
        'Esta criança não pode sair sem acompanhante agora. Ela só sai com acompanhante; '
        + 'se for preciso, chame o líder do plantão.');
    }
    if (m.includes('com_quem_obrigatorio')) {
      throw new BadRequestException('Escreva com quem vai: o nome de quem responde pela criança fora da casa.');
    }
    if (m.includes('volta_ja_registrada')) throw new ConflictException('A volta desta saída já foi registrada.');
    if (m.includes('hora_da_volta_invalida')) {
      throw new BadRequestException('A hora da volta tem de ser depois da saída, e não pode ser mais tarde que agora.');
    }
    if (m.includes('volta_tardia_pede_nota')) {
      throw new BadRequestException(
        'A volta está sendo registrada bem depois de acontecer. Escreva em uma frase o que houve (mínimo 10 letras).');
    }
    throw e;
  }

  /** O portão: as crianças da casa, sem o motivo de nenhuma decisão. */
  async doPortao(user: AuthenticatedUser, houseId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_portaria_acolhidos($1)`, [houseId]);
      return rows;
    }).catch((e) => this.traduz(e));
    const agora = Date.now();
    return rows.map((r: any) => ({
      personId: r.person_id,
      nome: r.nome,
      situacao: r.situacao ?? null,
      rotulo: r.situacao ? SITUACAO_NO_PORTAO[r.situacao] ?? r.situacao : 'ainda sem decisão',
      podeSairSozinho: r.situacao === 'liberada',
      onde: r.onde,
      desde: r.desde,
      quemDecidiu: r.quem_decidiu,
      foraDaCasa: r.fora_da_casa === true,
      saida: r.saida_id ? {
        id: r.saida_id, saiuEm: r.saiu_em, sozinho: r.sozinho, comQuem: r.com_quem,
        destino: r.destino, voltaPrevista: r.volta_prevista,
        passouDaHora: !!r.volta_prevista && new Date(r.volta_prevista).getTime() < agora,
      } : null,
    }));
  }

  async sair(user: AuthenticatedUser, input: {
    personId?: string; sozinho?: boolean; comQuem?: string; destino?: string; volta?: string; nota?: string;
  }) {
    if (!input.personId || typeof input.personId !== 'string') {
      throw new BadRequestException('Diga quem está saindo.');
    }
    const volta = input.volta && /^\d{2}:\d{2}$/.test(input.volta) ? input.volta : null;
    if (input.volta && !volta) throw new BadRequestException('A hora combinada de volta vem como HH:MM.');
    const { saida: id, casa } = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT * FROM app_registrar_saida_acolhido($1, $2, $3, $4, $5::time, $6)`,
        [input.personId, input.sozinho === true, input.comQuem ?? null, input.destino ?? null,
         volta, input.nota ?? null]);
      return r as { saida: string; casa: string };
    }).catch((e) => this.traduz(e));
    await this.audit.log({
      action: 'saida.registrada', actorId: user.id, institutionId: user.institutionId,
      houseId: casa,
      entity: 'person', entityId: input.personId,
      // Só o metadado: com quem foi e para onde ficam na linha, não no log.
      detail: { saida: id, sozinho: input.sozinho === true },
    });
    return { id, aviso: `Saída registrada às ${hhmm(new Date())}.` };
  }

  async voltar(user: AuthenticatedUser, saidaId: string, input: { voltouEm?: string; nota?: string }) {
    const quando = input.voltouEm ? new Date(input.voltouEm) : null;
    if (quando && Number.isNaN(quando.getTime())) throw new BadRequestException('A hora da volta não é uma hora.');
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [x] } = await c.query(
        `SELECT * FROM app_registrar_volta_acolhido($1, $2, $3)`,
        [saidaId, quando ? quando.toISOString() : null, input.nota ?? null]);
      return x;
    }).catch((e) => this.traduz(e));
    await this.audit.log({
      action: 'saida.volta', actorId: user.id, institutionId: user.institutionId,
      houseId: r.house_id, entity: 'person', entityId: r.person_id,
      detail: { saida: saidaId, depois: !!quando },
    });
    return { aviso: `Volta registrada${quando ? ` às ${hhmm(quando)}` : ''}.` };
  }

  /** As saídas de uma criança, para o perfil (a equipe da casa, pela regra de sempre). */
  async daCrianca(user: AuthenticatedUser, personId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_saidas_do_acolhido($1)`, [personId]);
      return rows.map((r: any) => ({
        id: r.id, saiuEm: r.saiu_em, sozinho: r.sozinho, comQuem: r.com_quem, destino: r.destino,
        voltaPrevista: r.volta_prevista, voltouEm: r.voltou_em, quemSaida: r.quem_saida,
        quemVolta: r.quem_volta, notaSaida: r.nota_saida, notaVolta: r.nota_volta,
        voltaRegistradaEm: r.volta_registrada_em,
      }));
    });
  }
}

const hhmm = (d: Date) => d.toLocaleTimeString('pt-BR',
  { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
