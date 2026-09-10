import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { isValidCpf, normalizeCpf, maskCpf } from '../../kernel/common/cpf';

export type CpfSituacao = 'livre' | 'ativo_mesma_casa' | 'no_acervo' | 'ativo_outra_casa';

export interface CpfCheck {
  situacao: CpfSituacao;
  personId: string | null;
  /** O que o sistema propõe fazer — decisão permanece humana. */
  acao: string;
}

const ACOES: Record<CpfSituacao, string> = {
  livre: 'Cadastrar novo acolhido',
  ativo_mesma_casa: 'Abrir o perfil existente nesta casa',
  no_acervo: 'Iniciar retorno — novo episódio no mesmo perfil',
  ativo_outra_casa: 'Acolhido ativo em outra unidade. Iniciar solicitação de transferência.',
};

@Injectable()
export class PeopleService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Verificação obrigatória antes de cadastrar (§6.1).
   * Nunca cria duplicata silenciosa e nunca revela conteúdo de pessoa
   * que esteja ativa em outra casa — devolve apenas o estado e a ação.
   */
  async checkCpf(user: AuthenticatedUser, cpfInput: string): Promise<CpfCheck> {
    const cpf = normalizeCpf(cpfInput);
    if (!isValidCpf(cpf)) throw new BadRequestException('CPF inválido. Confira os números digitados.');

    const row = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT * FROM app_check_cpf($1, $2)`, [user.institutionId, cpf]);
      return r;
    });
    await this.audit.log({
      action: 'person.cpf_check', actorId: user.id, institutionId: user.institutionId,
      detail: { situacao: row.situacao },   // metadado; o CPF não vai ao log (§20)
    });
    return { situacao: row.situacao, personId: row.person_id ?? null, acao: ACOES[row.situacao as CpfSituacao] };
  }

  /** Cadastro de novo acolhido: pessoa + episódio 1 + permanência na casa. */
  async admit(user: AuthenticatedUser, input: {
    houseId: string; fullName: string; socialName?: string; birthDate: string;
    cpf?: string; provisionalReason?: string;
  }) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação cadastram acolhidos.');
    }
    const cpf = input.cpf ? normalizeCpf(input.cpf) : null;
    if (cpf && !isValidCpf(cpf)) throw new BadRequestException('CPF inválido.');
    if (!cpf && !input.provisionalReason) {
      // Ingresso urgente sem CPF exige motivo e vira pendência (§6.1)
      throw new BadRequestException('Sem CPF, informe o motivo do ingresso urgente para gerar ID provisório com pendência.');
    }
    if (cpf) {
      const check = await this.checkCpf(user, cpf);
      if (check.situacao !== 'livre') throw new ConflictException(check.acao);
    }

    // Comando de sistema (migração 005): pessoa + episódio + permanência +
    // perfil numa transição atômica. A visibilidade nasce da permanência, então
    // criar em partes deixaria o próprio autor sem enxergar o que criou.
    const provisorio = cpf ? null : `PROV-${Date.now().toString(36).toUpperCase()}`;
    return this.db.asUser(user.id, async (c) => {
      let r: { person_id: string; episode_id: string; episode_number: number };
      try {
        const { rows: [row] } = await c.query(
          `SELECT * FROM app_admit_person($1,$2,$3,$4,$5,$6)`,
          [input.houseId, input.fullName, input.socialName ?? null, input.birthDate, cpf, provisorio]);
        r = row;
      } catch (e: any) {
        if (e?.message?.includes('cpf_ja_cadastrado')) {
          throw new ConflictException('Já existe cadastro com este CPF nesta instituição.');
        }
        if (e?.message?.includes('sem_permissao_para_admitir')) {
          throw new ForbiddenException('Sem permissão para cadastrar nesta unidade.');
        }
        throw e;
      }

      await this.audit.log({
        action: 'person.admit', actorId: user.id, institutionId: user.institutionId,
        houseId: input.houseId, entity: 'person', entityId: r.person_id,
        detail: { episodio: r.episode_number, cpfPendente: !cpf },
      });
      return { personId: r.person_id, episodeId: r.episode_id, episodio: r.episode_number, cpfPendente: !cpf };
    });
  }

  /**
   * Retorno (§15.3): novo episódio no MESMO perfil, sem apagar versões antigas.
   * Medicamentos e restrições anteriores permanecem no histórico e devem ser
   * revistos pela Enfermagem antes de serem reativados — o sistema não reativa
   * nada automaticamente.
   */
  async readmit(user: AuthenticatedUser, personId: string, houseId: string) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação registram retorno.');
    }
    return this.db.asUser(user.id, async (c) => {
      let r: { episode_id: string; episode_number: number };
      try {
        const { rows: [row] } = await c.query(
          `SELECT * FROM app_readmit_person($1,$2)`, [personId, houseId]);
        r = row;
      } catch (e: any) {
        if (e?.message?.includes('episodio_ativo_existente')) {
          throw new ConflictException('Este acolhido já possui episódio ativo.');
        }
        if (e?.message?.includes('pessoa_fora_de_escopo')) {
          throw new NotFoundException('Perfil não encontrado.');
        }
        if (e?.message?.includes('sem_permissao_para_admitir')) {
          throw new ForbiddenException('Sem permissão para registrar retorno nesta unidade.');
        }
        throw e;
      }

      await this.audit.log({
        action: 'person.readmit', actorId: user.id, institutionId: user.institutionId,
        houseId, entity: 'person', entityId: personId, detail: { episodio: r.episode_number },
      });
      return {
        personId, episodeId: r.episode_id, episodio: r.episode_number,
        aviso: 'Revise medicamentos, alergias e restrições com a Enfermagem antes de reativá-los.',
      };
    });
  }

  /** Saída: encerra permanência e episódio; perfil vai ao Acervo Histórico (§15.2). */
  async discharge(user: AuthenticatedUser, personId: string, reason: string) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação registram saída.');
    }
    if (!reason?.trim()) throw new BadRequestException('Informe o motivo da saída.');
    return this.db.asUser(user.id, async (c) => {
      const houseId = await currentHouse(c, personId);
      const { rowCount } = await c.query(
        `UPDATE house_stay SET status='encerrada', ended_at=now(), end_reason='encerramento_episodio'
         WHERE person_id=$1 AND status='ativa'`, [personId]);
      if (!rowCount) throw new NotFoundException('Acolhido não encontrado entre os ativos.');
      await c.query(
        `UPDATE care_episode SET status='encerrado', ended_at=now(), end_reason=$2
         WHERE person_id=$1 AND status='ativo'`, [personId, reason]);

      // Uma solicitação de transferência pendente sobre quem já saiu é uma
      // bomba-relógio: dias depois, a coordenação do destino clica em "aceitar"
      // limpando a caixa e a criança volta a existir operacionalmente numa casa,
      // com permanência nova pendurada num episódio encerrado. Cancelar aqui,
      // na MESMA transação da saída, fecha esse caminho.
      const { rows: [canc] } = await c.query(
        `SELECT app_cancel_transfers_on_exit($1, $2) AS n`,
        [personId, 'Cancelada automaticamente: o acolhido deixou a unidade.']);
      if (Number(canc?.n ?? 0) > 0) {
        await c.query(
          `INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, detail)
           VALUES ($1,$2,'transfer.cancel_on_exit','person',$3, jsonb_build_object('canceladas', $4::int))`,
          [houseId, user.id, personId, Number(canc.n)]);
      }

      await this.audit.log({
        action: 'person.discharge', actorId: user.id, institutionId: user.institutionId,
        houseId, entity: 'person', entityId: personId, detail: { motivo: reason },
      });
      return { ok: true, acervo: true };
    });
  }

  /**
   * ACERVO HISTÓRICO da casa (§15.2) — quem já esteve aqui e não está mais.
   *
   * A saída existia e o retorno existia; o que não existia era o caminho
   * entre os dois. Registrar retorno pede o `personId` de alguém que a tela
   * não tinha como encontrar — e uma função sem lista é uma função que
   * ninguém usa.
   *
   * A lista é DELIBERADAMENTE POBRE: nome de exibição, idade, quando saiu, o
   * motivo escrito na saída e quantos episódios a pessoa teve. Nada de CPF,
   * saúde, judicial ou benefício (§3.1, §6.10) — quem precisa disso abre o
   * perfil, onde a permissão é conferida de novo.
   *
   * Sem SECURITY DEFINER: `app_person_in_scope` já resolve o caso de quem
   * saiu — a equipe técnica e a coordenação alcançam quem teve permanência
   * numa casa do seu escopo, mesmo encerrada. A RLS faz o trabalho, e a
   * conferência de cargo aqui existe só para a recusa dizer o motivo em vez
   * de devolver lista vazia.
   */
  async acervo(user: AuthenticatedUser, houseId: string) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException(
        'O acervo histórico é da equipe técnica e da coordenação.');
    }
    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT p.id, p.full_name, p.social_name, p.birth_date,
                date_part('year', age(p.birth_date))::int AS idade,
                s.ended_at, e.end_reason,
                (SELECT count(*)::int FROM care_episode x WHERE x.person_id = p.id) AS episodios
           FROM house_stay s
           -- As duas políticas concordam aqui: app_person_in_scope olha
           -- QUALQUER permanência, e não só a ativa — é o que faz quem já
           -- saiu continuar alcançável pela técnica e pela coordenação.
           -- rls-join-ok: permanência sem pessoa não é criada.
           JOIN person p ON p.id = s.person_id
           LEFT JOIN LATERAL (
             SELECT ce.end_reason FROM care_episode ce
              WHERE ce.person_id = p.id AND ce.status = 'encerrado'
              ORDER BY ce.ended_at DESC NULLS LAST LIMIT 1) e ON true
          WHERE s.house_id = $1
            AND s.status = 'encerrada'
            -- Quem voltou (aqui ou noutra casa) não é acervo: é acolhido.
            AND NOT EXISTS (SELECT 1 FROM house_stay a
                             WHERE a.person_id = p.id AND a.status = 'ativa')
          ORDER BY s.ended_at DESC NULLS LAST`, [houseId]);
      return rows;
    });

    await this.audit.log({
      action: 'person.acervo.consulta', actorId: user.id, institutionId: user.institutionId,
      houseId, entity: 'house', entityId: houseId,
      // Só o tamanho da lista. Nome de criança não vai para log de consulta.
      detail: { registros: linhas.length },
    });

    return {
      aviso: 'O perfil de quem saiu não é apagado — ele fica no acervo, com o histórico '
        + 'inteiro. Um retorno abre episódio NOVO no mesmo perfil, e nada do episódio '
        + 'anterior é reativado sozinho.',
      pessoas: linhas.map((r: any) => ({
        id: r.id,
        nome: r.social_name || r.full_name,
        idade: r.idade,
        saiuEm: r.ended_at,
        motivoDaSaida: r.end_reason ?? null,
        episodios: r.episodios,
      })),
    };
  }

  /** Lista operacional da casa — “visão dos 20” (§9). */
  async listByHouse(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT p.id, p.full_name, p.social_name, p.birth_date, p.cpf, p.cpf_pending,
                date_part('year', age(p.birth_date))::int AS idade,
                (SELECT count(*)::int FROM health_condition h
                   WHERE h.person_id = p.id AND h.active AND h.essential_alert) AS alertas,
                (SELECT count(*)::int FROM food_restriction f
                   WHERE f.person_id = p.id AND f.active) AS restricoes,
                /*
                 * ONDE A CRIANÇA ESTÁ — para TODO MUNDO da casa, inclusive o
                 * educador social.
                 *
                 * Ele não lê a internação: o motivo, o diário e a medicação do
                 * hospital estão atrás do alcance dela, e isso foi decisão da
                 * coordenação. Mas ele precisa saber que a criança está no
                 * hospital, e por uma razão prática: ela SUMIU da chamada
                 * dele. Sem esta linha, o educador do plantão da noite conta
                 * dezenove onde havia vinte e não tem como saber se a criança
                 * foi internada, transferida ou se alguém errou o cadastro —
                 * e a primeira coisa que ele vai fazer é ligar para a
                 * coordenação às onze da noite para perguntar.
                 *
                 * O que sai é o FATO e o lugar. Nunca o motivo.
                 */
                (SELECT h.hospital FROM hospitalization h
                  WHERE h.person_id = p.id AND h.status = 'em_andamento'
                  LIMIT 1) AS no_hospital
         FROM person p
         JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa'
         WHERE s.house_id = $1
         ORDER BY coalesce(nullif(p.social_name,''), p.full_name)`, [houseId]);
      return rows.map(publicPerson);
    });
  }

  /* ---------------- Acolhido em experiência familiar (1010) ---------------- */

  /** Quem está com a família agora, e quem já devia ter voltado. */
  async convivenciasAbertas(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_convivencias_abertas($1)`, [houseId]);
      return rows.map((r) => ({
        id: r.id, personId: r.person_id, quem: r.quem,
        comQuem: r.com_quem, vinculo: r.vinculo,
        saiuEm: r.saiu_em, retornoPrevisto: r.retorno_previsto,
        /* Duas frases, nenhuma acusação: "está chegando" e "a hora passou".
           O sistema não chama isto de evasão — quem apura é gente. */
        avisar: r.avisar === true, atrasado: r.atrasado === true,
        finalidade: r.finalidade,
      }));
    });
  }

  async registrarSaidaFamiliar(user: AuthenticatedUser, input: {
    personId: string; contatoId: string; inicio: string;
    retornoPrevisto: string; finalidade?: string;
  }) {
    try {
      const id = await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(
          `SELECT * FROM app_registrar_saida_familiar($1,$2,$3::timestamptz,$4::timestamptz,$5)`,
          [input.personId, input.contatoId, input.inicio, input.retornoPrevisto,
           input.finalidade ?? null]);
        return row.saida_id as string;
      });
      await this.audit.log({
        action: 'family_stay.open', actorId: user.id, institutionId: user.institutionId,
        entity: 'family_stay', entityId: id, detail: { personId: input.personId },
      });
      return { id };
    } catch (e: any) {
      const m = String(e?.message ?? '');
      /* A frase precisa chegar em português a quem clicou — e esta em
         particular precisa DIZER o motivo, porque a pessoa vai perguntar. */
      if (m.includes('contato_com_aproximacao_restrita')) {
        throw new ForbiddenException(
          'Este contato está marcado com aproximação restrita. A criança não pode sair '
          + 'com ele. Fale com a equipe técnica antes de qualquer combinação.');
      }
      if (m.includes('sem_permissao_saida_familiar')) {
        throw new ForbiddenException(
          'Só a equipe técnica, a coordenação ou o líder do turno registram uma saída '
          + 'para convivência familiar.');
      }
      if (m.includes('uq_convivencia_aberta')) {
        throw new ConflictException(
          'Já existe uma saída em aberto para esta criança. Registre o retorno da '
          + 'anterior antes de abrir outra.');
      }
      if (m.includes('contato_inexistente')) {
        throw new NotFoundException(
          'Contato não encontrado. A saída aponta para um contato já cadastrado no '
          + 'perfil — digitar o nome à mão permitiria escrever qualquer um.');
      }
      if (m.includes('retorno_antes_da_saida')) {
        throw new BadRequestException('O retorno previsto tem de ser depois da saída.');
      }
      if (m.includes('pessoa_fora_de_escopo')) {
        throw new NotFoundException('Criança não encontrada nesta casa.');
      }
      throw e;
    }
  }

  /**
   * O retorno — com o que ela trouxe de casa (1060).
   *
   * `nota` é COMO ELA CHEGOU, em fato observado; `trouxe` é o que veio com
   * ela. O segundo é fato logístico do turno seguinte: veio remédio que não é
   * o da grade, veio roupa para lavar antes da escola de segunda, veio o
   * documento que a técnica esperava. Os dois ecoam na passagem e na ATA
   * daquele turno (1070).
   */
  async registrarRetornoFamiliar(user: AuthenticatedUser, id: string,
                                 quando: string, nota?: string, trouxe?: string) {
    try {
      await this.db.asUser(user.id, async (c) => {
        await c.query(
          `SELECT * FROM app_registrar_retorno_familiar($1,$2::timestamptz,$3,$4)`,
          [id, quando, nota ?? null, trouxe ?? null]);
      });
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('retorno_ja_registrado')) {
        throw new ConflictException('O retorno desta saída já foi registrado.');
      }
      if (m.includes('retorno_antes_da_saida')) {
        throw new BadRequestException(
          'A hora da chegada é anterior à da saída. Confira o horário: o retorno lançado '
          + 'antes da saída apareceria na passagem de um turno em que ela ainda não tinha ido.');
      }
      if (m.includes('saida_inexistente')) {
        throw new NotFoundException('Saída não encontrada.');
      }
      throw e;
    }
    /* Sem o conteúdo no log: `nota` e `trouxe` descrevem uma criança, e o log
       da aplicação guarda ID e metadado (regra 2). */
    await this.audit.log({
      action: 'family_stay.close', actorId: user.id, institutionId: user.institutionId,
      entity: 'family_stay', entityId: id,
      detail: { quando, comNota: !!nota?.trim(), comTrouxe: !!trouxe?.trim() },
    });
    return { encerrada: true };
  }

  /* ---------------- Sair sozinho (1020) ---------------- */

  /**
   * O que a casa precisa ver de manhã: quem vai acompanhado e quem não sai.
   *
   * Quem está simplesmente liberado NÃO volta — devolver as vinte crianças
   * faria a lista virar paisagem, e o que se ignora todo dia deixa de ser
   * aviso.
   */
  async saidasAObservar(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_saidas_a_observar($1)`, [houseId]);
      return rows.map((r) => ({
        personId: r.person_id, quem: r.quem, status: r.status,
        motivo: r.motivo, ate: r.ate, aRevisar: r.a_revisar === true,
      }));
    });
  }

  async saidaSozinho(user: AuthenticatedUser, personId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [v] } = await c.query(`SELECT * FROM app_saida_sozinho($1)`, [personId]);
      const { rows: h } = await c.query(
        `SELECT * FROM app_historico_saida_sozinho($1)`, [personId]);
      return {
        /* Ausência NÃO é liberação: `null` diz "sem definição", e a tela
           escreve isso em vez de desenhar uma permissão que ninguém deu. */
        vigente: v ? {
          status: v.status, motivo: v.motivo, onde: v.onde, ate: v.ate,
          desde: v.desde, quem: v.quem, aRevisar: v.a_revisar === true,
        } : null,
        historico: h.map((r) => ({
          status: r.status, motivo: r.motivo, onde: r.onde, ate: r.ate,
          de: r.de, ateQuando: r.ateq, quem: r.quem,
        })),
      };
    });
  }

  async definirSaidaSozinho(user: AuthenticatedUser, personId: string, input: {
    status: string; motivo: string; ate?: string | null; onde?: string | null;
  }) {
    try {
      await this.db.asUser(user.id, async (c) => {
        await c.query(`SELECT * FROM app_definir_saida_sozinho($1,$2,$3,$4::date,$5)`,
          [personId, input.status, input.motivo, input.ate || null, input.onde || null]);
      });
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('sem_permissao_saida_sozinho')) {
        throw new ForbiddenException(
          'Só a equipe técnica ou a coordenação decidem sobre sair sozinho.');
      }
      if (m.includes('suspensao_exige_prazo')) {
        throw new BadRequestException(
          'Escreva até quando. Medida sem prazo vira permanente por esquecimento — '
          + 'e ninguém decidiu que seria permanente.');
      }
      if (m.includes('prazo_no_passado')) {
        throw new BadRequestException('O prazo de revisão tem de ser hoje ou depois.');
      }
      if (m.includes('motivo_obrigatorio')) {
        throw new BadRequestException(
          'Escreva o motivo. Quem for conversar com o adolescente na porta precisa dele.');
      }
      if (m.includes('pessoa_fora_de_escopo')) {
        throw new NotFoundException('Criança não encontrada nesta casa.');
      }
      throw e;
    }
    await this.audit.log({
      action: 'outing_permission.set', actorId: user.id, institutionId: user.institutionId,
      entity: 'person', entityId: personId, detail: { status: input.status },
    });
    return { definida: true };
  }
}

/** Casa atual — usada para carimbar a auditoria antes de encerrar a permanência. */
export async function currentHouse(c: PoolClient, personId: string): Promise<string | null> {
  const { rows: [r] } = await c.query(
    `SELECT house_id FROM house_stay WHERE person_id = $1 AND status = 'ativa'`, [personId]);
  return r?.house_id ?? null;
}

/**
 * Resumo público de um acolhido — o que outros módulos podem conhecer.
 * Deliberadamente pobre: nome de exibição, idade e sinalizadores. Nada de
 * documentos, saúde detalhada, judicial ou benefícios (§3.1, §6.10).
 */
export interface PersonSummary {
  id: string;
  nome: string;
  nomeCivil: string;
  idade: number;
  nascimento: string;
  cpf: string | null;
  cpfPendente: boolean;
  alertasEssenciais: number;
  restricoesAlimentares: number;
  /** O hospital onde ela está, quando está internada. O motivo nunca vem. */
  noHospital?: string;
}

/** Projeção segura: CPF sempre mascarado na exibição operacional (§3.1). */
export function publicPerson(r: any): PersonSummary {
  return {
    id: r.id,
    nome: r.social_name || r.full_name,   // nome social nas telas operacionais (§6.1)
    nomeCivil: r.full_name,
    idade: r.idade,
    nascimento: r.birth_date,
    cpf: maskCpf(r.cpf),
    cpfPendente: r.cpf_pending,
    alertasEssenciais: r.alertas,
    restricoesAlimentares: r.restricoes,
    /* Onde ela está, quando não está na casa. `undefined` some do JSON, e a
     * tela desenha a linha normal. */
    noHospital: r.no_hospital ?? undefined,
  };
}
