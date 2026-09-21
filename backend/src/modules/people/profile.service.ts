import { COLUNAS_DO_CONTATO, contatoParaTela } from './contatos.service';
import { CAMPOS_DO_PERFIL } from './campos-do-perfil';
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

/**
 * Os campos descritivos do perfil, com o nome que a tela usa. Fica aqui, e não
 * na tela, porque o mesmo rótulo vale para a folha de edição e para a linha do
 * histórico — escrito nos dois lugares, um dia divergem.
 */
const ROTULO_DETALHE: Record<string, string> = {
  essential_care: 'Cuidados essenciais', school_name: 'Escola',
  school_grade: 'Série', school_shift: 'Turno da escola',
  school_address: 'Endereço da escola', reference_team: 'Equipe de referência',
  notes: 'Observações',
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
      const [stay, detail, conditions, restrictions, episodes, docs, memories,
             contacts, desligados] = await seq([
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
        /*
         * OS CONTATOS SÃO DO EDUCADOR TAMBÉM.
         *
         * Decisão da coordenação em 03/09/2026: quem está com a criança
         * precisa saber quem é a madrinha que aparece no portão. Encerrados
         * ficam de fora da tela do plantão — o telefone que deixou de valer
         * não some do banco, mas ninguém liga para ele às 23h por engano.
         */
        () => c.query(`SELECT ${COLUNAS_DO_CONTATO}
                 FROM person_contact WHERE person_id = $1 AND active
                 ORDER BY restricted DESC, name`, [personId]),
        /*
         * O que a coordenação desligou para o plantão, NESTA casa (1130).
         * rls-join-ok: `house_field_permission` responde a `hfp_select`
         * (app_house_in_scope), e a permanência ativa é lida na mesma
         * transação, com o mesmo alcance.
         */
        () => c.query(`SELECT f.field_code, f.reason, f.changed_at,
                              app_user_display_name(f.changed_by) AS por
                 FROM house_field_permission f
                 JOIN house_stay s ON s.house_id = f.house_id
                WHERE s.person_id = $1 AND s.status = 'ativa' AND NOT f.visible`, [personId]),
      ]);
      const { rows: [rc] } = await c.query(`SELECT app_count_restricted_docs($1) AS n`, [personId]);
      return { p, stay: stay.rows[0], detail: detail.rows[0], conditions: conditions.rows,
               restrictions: restrictions.rows, episodes: episodes.rows, docs: docs.rows,
               memories: memories.rows, contacts: contacts.rows, restritos: rc.n,
               desligados: desligados.rows };
    });

    // Fora do escopo o RLS não devolve a linha: 404 igual a inexistente,
    // sem revelar que a pessoa existe em outra casa (§23).
    if (!data) throw new NotFoundException('Acolhido não encontrado');

    /*
     * O QUE A COORDENAÇÃO DESLIGOU PARA O PLANTÃO (fase 93, migração 1130).
     *
     * Vale só para o educador: os outros cargos seguem o alcance de sempre.
     * E campo desligado NÃO some calado — vai em `camposDesligados`, com o
     * motivo, para a tela poder dizer que o dado existe e por que não está
     * ali. Ausência que mente é pior do que recusa que explica: sem isso o
     * educador lê "sem telefone da escola" e liga para ninguém.
     */
    const desligados = new Map<string, any>(
      user.role === 'educador'
        ? data.desligados.map((r: any) => [r.field_code, r])
        : []);
    const liberado = (code: string) => !desligados.has(code);
    const camposDesligados = CAMPOS_DO_PERFIL
      .filter((c) => desligados.has(c.code))
      .map((c) => ({
        code: c.code, rotulo: c.rotulo,
        motivo: desligados.get(c.code).reason,
        por: desligados.get(c.code).por,
        em: desligados.get(c.code).changed_at,
      }));

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
      /*
       * RG, CNS E FILIAÇÃO SAEM INTEIROS, e o CPF continua mascarado.
       *
       * Não é incoerência. O CPF é a chave que abre cadastro em serviço de
       * fora — banco, benefício, consulta pública —, e por isso ele aparece
       * só onde é usado. RG, cartão SUS e filiação são o que a educadora
       * precisa DITAR no balcão do posto de saúde com a criança do lado, e
       * mascará-los ali seria obrigá-la a voltar à planilha impressa que este
       * sistema existe para aposentar.
       */
      rg: data.p.rg ?? null,
      cns: data.p.cns ?? null,
      filiacao: data.p.filiation ?? null,
      /*
       * A IDENTIFICAÇÃO COMPLEMENTAR — pedida no cadastro desde a fase 40, e
       * até a 116 lida por NADA.
       *
       * Cinco colunas que a tela de cadastro pede, que a função de admissão
       * grava, e que nenhum `SELECT` do sistema nomeava: quem preenchia
       * escrevia num campo que não ia a lugar nenhum. Duas delas não são
       * detalhe: `race` é a cor/raça AUTODECLARADA, que é como a política
       * pública se mede, e `nis` é o que abre o CadÚnico para o benefício
       * dela. Ficavam invisíveis exatamente para quem monta o relatório.
       *
       * Saem inteiras, como RG e CNS e pelo mesmo motivo: são o que se dita no
       * balcão. O CPF continua mascarado — ele é a chave que abre cadastro em
       * serviço de fora.
       */
      identificacaoComplementar: {
        genero: data.p.gender ?? null,
        raca: data.p.race ?? null,
        naturalidade: data.p.birthplace ?? null,
        nis: data.p.nis ?? null,
        registroCivil: data.p.civil_registry ?? null,
      },
      /* A foto é de identificação: a tela recebe a rota, não o binário. */
      foto: data.p.photo_key
        ? { rota: `/people/${personId}/photo`, em: data.p.photo_at }
        : null,
      /* Na forma que a tela lê — a mesma da lista de contatos (fase 92). */
      contatos: liberado('contatos')
        ? data.contacts.map((r: any) => contatoParaTela(r, user.role)) : [],
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
      cuidadosEssenciais: liberado('cuidados_essenciais')
        ? (data.detail?.essential_care ?? null) : null,
      escola: data.detail && liberado('escola') ? {
        nome: data.detail.school_name, serie: data.detail.school_grade,
        turno: data.detail.school_shift, endereco: data.detail.school_address,
      } : null,
      equipeReferencia: liberado('equipe_referencia')
        ? (data.detail?.reference_team ?? null) : null,
      camposDesligados,
      // As observações só vão para quem PODE escrevê-las (§6.2). Editar um
      // campo às cegas é como se apaga o texto de outra pessoa; e devolvê-lo a
      // todo mundo ampliaria, de carona numa correção de tela, o que o
      // educador do plantão passa a ler no perfil — decisão que não é minha.
      observacoes: ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)
        ? (data.detail?.notes ?? null) : undefined,
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

  /**
   * ATUALIZAR OS DADOS DESCRITIVOS DO PERFIL (§6.4).
   *
   * Cuidados essenciais, escola, equipe de referência e observações. Não pede
   * motivo — mudar a série da criança em fevereiro é atualizar, não corrigir
   * (a identificação, essa sim, vai por `corrigirIdentificacao`).
   *
   * Toda alteração deixa o valor ANTERIOR em `profile_detail_change` (migração
   * 0850), na mesma transação. Até 01/09/2026 este método sobrescrevia: o
   * texto de "cuidados essenciais" — o bloco que se lê antes de dar banho ou
   * de servir o prato — era substituído sem deixar rastro legível, porque a
   * auditoria guarda o NOME do campo e nunca o conteúdo (§20).
   */
  async updateDetail(user: AuthenticatedUser, personId: string, patch: Record<string, string | null>) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Educadores não alteram dados estruturais do perfil.');
    }
    const campos: Record<string, string> = {
      cuidadosEssenciais: 'essential_care', escolaNome: 'school_name', escolaSerie: 'school_grade',
      escolaTurno: 'school_shift', escolaEndereco: 'school_address', equipeReferencia: 'reference_team',
      observacoes: 'notes',
    };
    /*
     * RG, CNS e filiação NÃO entram aqui, e a diferença não é técnica.
     *
     * Este método atualiza o que MUDA na vida da criança — a série em
     * fevereiro, o cuidado essencial que a técnica reescreveu — e por isso não
     * pede motivo. Documento de identidade não muda: ou estava errado, ou foi
     * emitido agora. Os dois casos são `corrigirIdentificacao`, que pede
     * motivo e guarda o que constava antes.
     */
    const enviados: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (campos[k]) enviados[campos[k]] = v;
    }
    if (!Object.keys(enviados).length) return { ok: true, alterado: 0 };

    let n = 0;
    try {
      n = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `SELECT * FROM app_atualizar_detalhe_perfil($1, $2::jsonb)`,
          [personId, JSON.stringify(enviados)]);
        return Number(r.alterados);
      });
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('sem_permissao_para_editar')) {
        throw new ForbiddenException('Educadores não alteram dados estruturais do perfil.');
      }
      // Fora de escopo responde 404 igual a inexistente: 403 confirmaria que a
      // criança existe em outra casa (§23).
      if (m.includes('pessoa_fora_de_escopo')) {
        throw new NotFoundException('Perfil não encontrado — ou fora do seu alcance.');
      }
      if (m.includes('campo_nao_editavel')) {
        throw new BadRequestException('Este campo não se altera por aqui.');
      }
      throw e;
    }

    if (n === 0) {
      return { ok: true, alterado: 0,
        aviso: 'Nada mudou: o que você enviou é igual ao que já estava.' };
    }
    await this.audit.log({
      action: 'person.profile_update', actorId: user.id, entity: 'person', entityId: personId,
      detail: { campos: Object.keys(enviados), alterados: n },  // nomes, nunca o conteúdo (§20)
    });
    return { ok: true, alterado: n,
      aviso: `${n} campo(s) atualizado(s). O que estava antes continua registrado, com o seu `
        + 'nome e o horário, e aparece no perfil para quem cuida da criança.' };
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
    rg?: string | null; cns?: string | null; filiacao?: string | null;
    motivo?: string;
  }) {
    const campos: Record<string, string | null> = {};
    if (input.nome !== undefined) campos.full_name = input.nome;
    if (input.nomeSocial !== undefined) campos.social_name = input.nomeSocial;
    if (input.nascimento !== undefined) campos.birth_date = input.nascimento;
    if (input.cpf !== undefined) campos.cpf = input.cpf;
    /*
     * Os três da lista da casa. A rota fala português — `filiacao`, e não
     * `filiation` — porque quem lê o contrato de rotas é quem escreve a tela,
     * e a tela é em português (regra de interface do projeto).
     */
    if (input.rg !== undefined) campos.rg = input.rg;
    if (input.cns !== undefined) campos.cns = input.cns;
    if (input.filiacao !== undefined) campos.filiation = input.filiacao;
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

  /**
   * O que o perfil dizia antes (migração 0850), legível por quem alcança a
   * criança — inclusive o educador do plantão, que é quem vai agir sobre o
   * texto novo e tem o direito de saber que ele mudou hoje de manhã.
   */
  async detalheHistorico(user: AuthenticatedUser, personId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows: r } = await c.query(
        `SELECT id, field, before_value, after_value, at,
                app_user_display_name(changed_by) AS por
           FROM profile_detail_change WHERE person_id = $1 ORDER BY at DESC LIMIT 50`, [personId]);
      return r;
    });
    return rows.map((r: any) => ({
      id: r.id, campo: ROTULO_DETALHE[r.field] ?? r.field,
      antes: r.before_value, depois: r.after_value,
      por: r.por, quando: r.at,
    }));
  }

  /** Abertura de documento: registra acesso a conteúdo sensível (§20). */
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
