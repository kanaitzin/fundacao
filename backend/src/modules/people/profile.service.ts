import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { maskCpf } from '../../kernel/common/cpf';

/** Categorias que cada papel pode ABRIR (§6.8). Espelha app_can_open_doc no banco. */
const DOCS_POR_PAPEL: Record<string, string[]> = {
  educador: ['saude', 'escolar'],
  lider_diurno: ['saude', 'escolar'],
  lider_noturno_geral: ['saude'],
  enfermagem: ['saude'],
  equipe_tecnica: ['saude', 'escolar', 'pessoal', 'judicial_socioassistencial'],
  coordenador: ['saude', 'escolar', 'pessoal', 'judicial_socioassistencial'],
  gestor_geral: ['saude', 'escolar', 'pessoal', 'judicial_socioassistencial'],
  cozinha: [],
};

/** Executa consultas em sequência no mesmo cliente (pg não aceita paralelo). */
async function seq<T>(fns: Array<() => Promise<T>>): Promise<T[]> {
  const out: T[] = [];
  for (const fn of fns) out.push(await fn());
  return out;
}

@Injectable()
export class ProfileService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Perfil conforme o cargo (§6.4): o que salta aos olhos primeiro são
   * rotina/alertas essenciais/saúde — não a ficha cadastral.
   * Benefícios e dados bancários NUNCA entram aqui (§6.10): têm rota própria
   * com reautenticação. Por isso não há campo bancário nesta projeção.
   */
  async get(user: AuthenticatedUser, personId: string) {
    const data = await this.db.asUser(user.id, async (c) => {
      const { rows: [p] } = await c.query(
        `SELECT p.*, date_part('year', age(p.birth_date))::int AS idade
         FROM person p WHERE p.id = $1`, [personId]);
      if (!p) return null;

      // Um cliente pg executa uma consulta por vez: sequencial, não Promise.all.
      const [stay, detail, conditions, restrictions, episodes, docs, memories] = await seq([
        () => c.query(`SELECT s.house_id, h.code, h.name, s.started_at
                 -- rls-join-ok: permanência ATIVA — a casa é a atual do acolhido.
                 FROM house_stay s JOIN house h ON h.id = s.house_id
                 WHERE s.person_id = $1 AND s.status = 'ativa'`, [personId]),
        () => c.query(`SELECT * FROM profile_detail WHERE person_id = $1`, [personId]),
        () => c.query(`SELECT id, kind, description, severity, essential_alert, source, review_on,
                        app_condition_label(kind, description) AS rotulo
                 FROM health_condition WHERE person_id = $1 AND active
                 ORDER BY essential_alert DESC, kind`, [personId]),
        () => c.query(`SELECT id, restriction, substitution, guidance, review_on
                 FROM food_restriction WHERE person_id = $1 AND active`, [personId]),
        () => c.query(`SELECT number, started_at, ended_at, end_reason, status
                 FROM care_episode WHERE person_id = $1 ORDER BY number`, [personId]),
        () => c.query(`SELECT id, category, title, issued_on, valid_until
                 FROM document WHERE person_id = $1 ORDER BY category, issued_on DESC NULLS LAST`, [personId]),
        () => c.query(`SELECT id, event_type, happened_on, description, has_photo, photo_authorized
                 FROM memory_record WHERE person_id = $1 ORDER BY happened_on DESC`, [personId]),
      ]);
      const { rows: [rc] } = await c.query(`SELECT app_count_restricted_docs($1) AS n`, [personId]);
      return { p, stay: stay.rows[0], detail: detail.rows[0], conditions: conditions.rows,
               restrictions: restrictions.rows, episodes: episodes.rows, docs: docs.rows,
               memories: memories.rows, restritos: rc.n };
    });

    // Fora do escopo o RLS não devolve a linha: 404 igual a inexistente,
    // sem revelar que a pessoa existe em outra casa (§23).
    if (!data) throw new NotFoundException('Acolhido não encontrado');

    const podeVerCategorias = DOCS_POR_PAPEL[user.role] ?? [];
    return {
      id: data.p.id,
      nome: data.p.social_name || data.p.full_name,
      nomeCivil: data.p.full_name,
      nomeSocial: data.p.social_name,
      idade: data.p.idade,
      nascimento: data.p.birth_date,
      cpf: maskCpf(data.p.cpf),
      cpfPendente: data.p.cpf_pending,
      idProvisorio: data.p.provisional_id,
      casaAtual: data.stay ? { id: data.stay.house_id, codigo: data.stay.code, nome: data.stay.name, desde: data.stay.started_at } : null,
      noAcervo: !data.stay,
      // 1) alertas essenciais e saúde primeiro
      // `descricao` já vem como frase que se lê sozinha (§6.4): a tela mostra
      // o alerta, não remonta a frase — remontar em cada tela é como um dia
      // uma tela esquece.
      alertasEssenciais: data.conditions.filter((c: any) => c.essential_alert)
        .map((c: any) => ({ tipo: c.kind, descricao: c.rotulo, gravidade: c.severity })),
      condicoesSaude: data.conditions,
      restricoesAlimentares: data.restrictions,
      // 2) dados estruturais
      cuidadosEssenciais: data.detail?.essential_care ?? null,
      escola: data.detail ? {
        nome: data.detail.school_name, serie: data.detail.school_grade,
        turno: data.detail.school_shift, endereco: data.detail.school_address,
      } : null,
      equipeReferencia: data.detail?.reference_team ?? null,
      episodios: data.episodes,
      // O RLS já entrega só o que este papel pode abrir; a contagem do que
      // existe e está restrito vem de função própria (número, nunca conteúdo).
      documentos: data.docs,
      documentosRestritos: data.restritos,
      memorias: data.memories,
      // A área de benefícios existe, mas só é acessível pela rota própria.
      beneficios: { acessivel: ['coordenador', 'gestor_geral'].includes(user.role), rota: `/people/${personId}/benefits` },
    };
  }

  async updateDetail(user: AuthenticatedUser, personId: string, patch: Record<string, string | null>) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Educadores não alteram dados estruturais do perfil.');
    }
    const campos: Record<string, string> = {
      cuidadosEssenciais: 'essential_care', escolaNome: 'school_name', escolaSerie: 'school_grade',
      escolaTurno: 'school_shift', escolaEndereco: 'school_address', equipeReferencia: 'reference_team',
      observacoes: 'notes',
    };
    const sets: string[] = [], vals: unknown[] = [personId];
    for (const [k, v] of Object.entries(patch)) {
      if (campos[k]) { vals.push(v); sets.push(`${campos[k]} = $${vals.length}`); }
    }
    if (!sets.length) return { ok: true, alterado: 0 };

    // `alterado` contava os campos ENVIADOS, não os gravados: fora de escopo,
    // o RLS não atualizava linha nenhuma e a resposta seguia dizendo "ok".
    const gravou = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE profile_detail SET ${sets.join(', ')}, updated_at = now(), updated_by = $${vals.length + 1},
         version = version + 1 WHERE person_id = $1`, [...vals, user.id]);
      return (rowCount ?? 0) > 0;
    });
    if (!gravou) {
      throw new NotFoundException('Perfil não encontrado — ou fora do seu alcance.');
    }
    await this.audit.log({
      action: 'person.profile_update', actorId: user.id, entity: 'person', entityId: personId,
      detail: { campos: Object.keys(patch) },   // nomes dos campos, nunca o conteúdo (§20)
    });
    return { ok: true, alterado: sets.length };
  }

  /**
   * CORRIGIR A IDENTIFICAÇÃO (§6.2) — nome, nome social, nascimento e CPF.
   *
   * `updateDetail` acima cuida do que é descrição (escola, cuidados,
   * observações) e não pede motivo: mudar a série da criança em fevereiro é
   * atualizar, não corrigir. Já o NOME e a DATA DE NASCIMENTO são a
   * identidade dela nos papéis, e um deles mudando em silêncio faz toda
   * passagem assinada e toda ATA fechada passarem a falar de alguém que, nos
   * documentos de antes, tinha outro nome.
   *
   * Por isso é comando próprio, com motivo obrigatório, e o histórico fica
   * numa tabela LEGÍVEL por quem cuida — não escondido na auditoria, que é
   * área restrita e responde a outra pergunta.
   *
   * As travas vivem no `app_corrigir_pessoa` (migração 0810): alcance, papel,
   * motivo, campo corrigível, e a recusa de esvaziar nome ou nascimento.
   * Aqui só traduzimos a recusa do banco em frase de gente.
   */
  async corrigirIdentificacao(user: AuthenticatedUser, personId: string, input: {
    nome?: string; nomeSocial?: string | null; nascimento?: string; cpf?: string | null;
    motivo?: string;
  }) {
    const campos: Record<string, string | null> = {};
    if (input.nome !== undefined) campos.full_name = input.nome;
    if (input.nomeSocial !== undefined) campos.social_name = input.nomeSocial;
    if (input.nascimento !== undefined) campos.birth_date = input.nascimento;
    if (input.cpf !== undefined) campos.cpf = input.cpf;
    if (!Object.keys(campos).length) {
      throw new BadRequestException('Nenhum campo de identificação foi informado.');
    }
    if ((input.motivo ?? '').trim().length < 10) {
      throw new BadRequestException(
        'Escreva por que o cadastro está sendo corrigido. Quem ler o caso daqui a um ano '
        + 'precisa saber por que o nome mudou — "erro" não explica nada.');
    }

    let n = 0;
    try {
      n = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `SELECT * FROM app_corrigir_pessoa($1, $2::jsonb, $3)`,
          [personId, JSON.stringify(campos), input.motivo]);
        return Number(r.corrigidos);
      });
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('sem_permissao_para_corrigir')) {
        throw new ForbiddenException(
          'Corrigir a identificação é da equipe técnica e da coordenação.');
      }
      if (m.includes('pessoa_fora_de_escopo') || m.includes('pessoa_inexistente')) {
        throw new NotFoundException('Acolhido não encontrado — ou fora do seu alcance.');
      }
      if (m.includes('campo_obrigatorio_nao_se_esvazia')) {
        throw new BadRequestException(
          'Nome civil e data de nascimento não podem ficar em branco. Se o que está lá é '
          + 'provisório, corrija para o que a certidão diz.');
      }
      if (m.includes('campo_nao_corrigivel')) {
        throw new BadRequestException('Este campo não se corrige por aqui.');
      }
      if (m.includes('motivo_obrigatorio')) {
        throw new BadRequestException('Escreva por que o cadastro está sendo corrigido.');
      }
      throw e;
    }

    if (n === 0) {
      return { corrigidos: 0,
        aviso: 'Nada mudou: o que você enviou é igual ao que já estava. Nenhuma correção foi '
          + 'registrada — uma lista de correções cheia de linhas iguais é uma lista que '
          + 'ninguém lê.' };
    }

    await this.audit.log({
      action: 'person.correct_identity', actorId: user.id, entity: 'person', entityId: personId,
      // Nomes dos campos, nunca o conteúdo (§20): o que mudou fica em
      // `person_correction`, que tem alcance próprio.
      detail: { campos: Object.keys(campos), corrigidos: n },
    });
    return {
      corrigidos: n,
      aviso: `${n} campo(s) corrigido(s). O que estava antes continua registrado, com o seu `
        + 'nome, o horário e o motivo — e aparece no perfil para quem cuida da criança.',
    };
  }

  /** O histórico de correções, legível por quem alcança a criança. */
  async correcoes(user: AuthenticatedUser, personId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows: r } = await c.query(
        `SELECT id, field, before_value, after_value, reason, at,
                app_user_display_name(corrected_by) AS por
           FROM person_correction WHERE person_id = $1 ORDER BY at DESC`, [personId]);
      return r;
    });
    const ROTULO: Record<string, string> = {
      full_name: 'Nome civil', social_name: 'Nome social',
      birth_date: 'Data de nascimento', cpf: 'CPF',
    };
    return rows.map((r: any) => ({
      id: r.id, campo: ROTULO[r.field] ?? r.field,
      // O CPF não é devolvido por extenso nem aqui: o que interessa é QUE ele
      // mudou, e por quê. O número vive no cadastro, com o alcance dele.
      antes: r.field === 'cpf' ? (r.before_value ? '(havia um CPF)' : '(estava em branco)')
                               : r.before_value,
      depois: r.field === 'cpf' ? (r.after_value ? '(passou a ter CPF)' : '(ficou em branco)')
                                : r.after_value,
      motivo: r.reason, por: r.por, quando: r.at,
    }));
  }

  /** Abertura de documento: registra acesso a conteúdo sensível (§20). */
  async openDocument(user: AuthenticatedUser, personId: string, documentId: string) {
    const doc = await this.db.asUser(user.id, async (c) => {
      const { rows: [d] } = await c.query(
        `SELECT d.id, d.category, d.title, d.valid_until,
                v.version, v.storage_key
         FROM document d
         LEFT JOIN LATERAL (SELECT version, storage_key FROM document_version
                            WHERE document_id = d.id ORDER BY version DESC LIMIT 1) v ON true
         WHERE d.id = $1 AND d.person_id = $2`, [documentId, personId]);
      if (d) {
        // Abertura de documento sensível: o registro do acesso nasce junto com
        // o acesso, na mesma transação (§20).
        await this.audit.log({
          action: 'document.open', actorId: user.id, entity: 'document', entityId: documentId,
          detail: { categoria: d.category, versao: d.version },
        }, c);
      }
      return d;
    });
    // Categoria fora do papel: o RLS já filtrou — resposta idêntica a inexistente.
    if (!doc) throw new NotFoundException('Documento não encontrado');

    return {
      id: doc.id, categoria: doc.category, titulo: doc.title,
      validoAte: doc.valid_until, versao: doc.version,
      // URL assinada de curta duração é gerada na camada de objetos (Fase 3).
      download: { pronto: false, motivo: 'Armazenamento de objetos entra na Fase 3' },
    };
  }

  /** Relatório mínimo para a cozinha (§7): sem CPF, diagnóstico ou caso. */
  async kitchenReport(user: AuthenticatedUser, houseId: string) {
    if (!['cozinha', 'coordenador', 'equipe_tecnica', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Sem acesso ao relatório de alimentação.');
    }
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT coalesce(nullif(p.social_name,''), p.full_name) AS nome,
                f.restriction, f.substitution, f.guidance, f.review_on
         FROM person p
         JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa'
         JOIN food_restriction f ON f.person_id = p.id AND f.active
         WHERE s.house_id = $1 ORDER BY nome`, [houseId]);
      return rows;
    });
    await this.audit.log({
      action: 'report.kitchen', actorId: user.id, houseId, detail: { linhas: rows.length },
    });
    // Projeção deliberadamente pobre: nome, restrição, substituição e revisão.
    return rows.map((r) => ({
      nome: r.nome, evitar: r.restriction, substituicao: r.substitution,
      orientacao: r.guidance, revisarEm: r.review_on,
    }));
  }
}
