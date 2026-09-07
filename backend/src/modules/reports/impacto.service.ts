import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { cargoNoDocumento } from '../../kernel/documentos/folha';
import { folhaDoImpacto, folhaDaTrajetoria } from './impacto-folha';

/**
 * O TRABALHO SOCIAL, E NÃO O TURNO (migração 0900).
 *
 * O Gestor Geral responde pelas oito casas e não vai abrir a grade de
 * medicação de nenhuma delas. O que ele precisa é da outra leitura: quantas
 * crianças estão acolhidas, quantas entraram e saíram no período, e — a parte
 * que ninguém tinha onde registrar — **o que aconteceu de bom**: passou de
 * ano, terminou o fundamental, entrou no curso profissionalizante, tirou o
 * certificado, passou na faculdade, assinou a primeira carteira.
 *
 * **O que este serviço recusa a fazer, e a recusa é o desenho:**
 *
 *  * não ordena casa por contagem. Nunca. A ordem é a do cadastro, e está no
 *    `ORDER BY code` da função do banco. Ordenar por resultado seria publicar
 *    um ranking sem chamá-lo assim — e a casa que recebe adolescentes com
 *    medida recente não está na mesma corrida da casa-lar com quatro crianças
 *    pequenas;
 *  * não calcula média, percentual de sucesso, meta nem "casa destaque". O
 *    número de cada casa é lido ao lado do número de acolhidos dela;
 *  * não conta ausência de marco como coisa nenhuma. Criança sem linha aqui
 *    não fracassou: ela pode ter passado o ano inteiro sobrevivendo a uma
 *    coisa que não cabe em categoria — e é justamente essa que o trabalho da
 *    casa mais tocou.
 *
 * O marco é da CRIANÇA. A casa é onde ela estava.
 */
@Injectable()
export class ImpactoService {
  private readonly dir = process.env.ARQUIVOS_DIR ?? join(process.cwd(), '.arquivos');

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
  ) {}

  /**
   * As categorias. Escritas na voz de quem conta a história — "passou de ano",
   * e não "aprovação escolar computada".
   */
  private readonly TIPOS = [
    { cod: 'aprovacao_escolar', label: 'Passou de ano', icone: '📚' },
    { cod: 'conclusao_ensino_fundamental', label: 'Terminou o Fundamental', icone: '🎓' },
    { cod: 'conclusao_ensino_medio', label: 'Terminou o Ensino Médio', icone: '🎓' },
    { cod: 'curso_profissionalizante', label: 'Curso profissionalizante', icone: '🛠️' },
    { cod: 'certificado', label: 'Certificado', icone: '📜' },
    { cod: 'ingresso_faculdade', label: 'Entrou na faculdade', icone: '🏛️' },
    { cod: 'primeiro_emprego', label: 'Primeiro emprego', icone: '💼' },
    { cod: 'estagio', label: 'Estágio', icone: '💼' },
    { cod: 'documento_conquistado', label: 'Documento conquistado', icone: '🪪' },
    { cod: 'esporte_ou_arte', label: 'Esporte, arte ou cultura', icone: '⚽' },
    { cod: 'reinsercao_familiar', label: 'Reinserção familiar', icone: '🏠' },
    { cod: 'outro', label: 'Outro', icone: '✨' },
  ];

  vocabulario() {
    return {
      tipos: this.TIPOS,
      nota: 'O marco é da criança; a casa é onde ela estava. Esta tela não compara casas '
        + 'e não ordena por resultado — a casa que recebe adolescentes com medida recente '
        + 'e a casa-lar com quatro crianças pequenas não estão na mesma corrida.',
    };
  }

  private soGestor(user: AuthenticatedUser) {
    if (!['gestor_geral', 'admin_tecnico'].includes(user.role)) {
      throw new ForbiddenException(
        'O panorama das oito casas é do Gestor Geral. A coordenação tem o painel da casa dela.');
    }
  }

  /** De 1º de janeiro até hoje, quando ninguém disser outra coisa. */
  private periodo(de?: string, ate?: string) {
    const hoje = hojeNaInstituicao();
    return {
      de: de ?? `${hoje.slice(0, 4)}-01-01`,
      ate: ate ?? hoje,
    };
  }

  // ------------------------------------------------------------- Panorama

  async panorama(user: AuthenticatedUser, de?: string, ate?: string) {
    this.soGestor(user);
    const p = this.periodo(de, ate);

    return this.db.asUser(user.id, async (c) => {
      const { rows: casas } = await c.query(
        `SELECT * FROM app_panorama_das_casas($1::date, $2::date)`, [p.de, p.ate]);

      /* Os marcos por TIPO, no conjunto das casas. É a leitura que o Gestor
       * pediu: o impacto do trabalho no todo, e não casa contra casa. */
      const { rows: porTipo } = await c.query(
        `SELECT m.kind, count(*)::int AS n
           FROM life_milestone m
          WHERE m.happened_on BETWEEN $1::date AND $2::date
          GROUP BY m.kind ORDER BY m.kind`, [p.de, p.ate]);

      const { rows: [ocorr] } = await c.query(
        `SELECT count(*)::int AS n FROM incident i
          WHERE (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date
                BETWEEN $1::date AND $2::date`, [p.de, p.ate]);

      const soma = (campo: string) =>
        casas.reduce((t: number, x: any) => t + Number(x[campo] ?? 0), 0);

      return {
        periodo: p,
        /* A ordem é a do cadastro. Está aqui escrito porque a próxima pessoa
         * que mexer nisto vai querer ordenar por marcos. */
        casas: casas.map((h: any) => ({
          id: h.house_id, codigo: h.code, nome: h.name,
          acolhidos: h.acolhidos, capacidade: h.capacidade,
          entradas: h.entradas, saidas: h.saidas,
          ocorrencias: h.ocorrencias, marcos: h.marcos,
        })),
        total: {
          casas: casas.length,
          acolhidos: soma('acolhidos'),
          capacidade: soma('capacidade'),
          entradas: soma('entradas'),
          saidas: soma('saidas'),
          ocorrencias: ocorr?.n ?? 0,
          marcos: soma('marcos'),
        },
        marcosPorTipo: this.TIPOS
          .map((t) => ({
            ...t, n: Number(porTipo.find((x: any) => x.kind === t.cod)?.n ?? 0),
          }))
          .filter((t) => t.n > 0),
        aviso: 'As casas aparecem na ordem do cadastro, e não por resultado. Este painel '
          + 'não compara casas: o número de cada uma se lê ao lado do número de acolhidos '
          + 'dela, e por quem conhece a casa.',
      };
    });
  }

  /**
   * O MESMO PANORAMA, DE UMA CASA SÓ.
   *
   * Aqui a coordenação entra — e é uma decisão de produto, não um descuido: o
   * relatório do trabalho da PRÓPRIA casa é dela. Ela responde por aquelas
   * vinte crianças e é quem vai a reunião de rede, a audiência concentrada e a
   * conversa com a escola. Negar isso obrigaria a pedir ao Gestor Geral um
   * documento sobre o trabalho que ela mesma fez.
   *
   * O que continua sendo só do Gestor é a visão das OITO — comparar casas não
   * é função de quem responde por uma.
   *
   * As contagens aqui saem por consultas comuns, sob RLS: se a casa não é
   * dela, as linhas não aparecem. Diferente do panorama das oito, que precisa
   * de `SECURITY DEFINER` para atravessar as casas.
   */
  async panoramaDaCasa(user: AuthenticatedUser, houseId: string, de?: string, ate?: string) {
    const p = this.periodo(de, ate);
    return this.db.asUser(user.id, async (c) => {
      const { rows: [casa] } = await c.query(
        `SELECT h.id, h.code, h.name, h.capacity FROM house h WHERE h.id = $1`, [houseId]);
      /* Casa fora do alcance é RECUSA, e não painel zerado — o RLS filtra as
       * linhas, e zero se leria como "esta casa não fez nada". */
      if (!casa) {
        throw new NotFoundException('Unidade não encontrada — ou fora do seu alcance.');
      }

      const um = async (sql: string, params: unknown[] = []) =>
        Number((await c.query(sql, params)).rows[0]?.n ?? 0);

      const casaNoPeriodo = {
        id: casa.id, codigo: casa.code, nome: casa.name,
        acolhidos: await um(
          `SELECT count(*)::int AS n FROM house_stay
            WHERE house_id = $1 AND status = 'ativa'`, [houseId]),
        capacidade: casa.capacity,
        entradas: await um(
          `SELECT count(*)::int AS n FROM house_stay
            WHERE house_id = $1
              AND (started_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3`,
          [houseId, p.de, p.ate]),
        saidas: await um(
          `SELECT count(*)::int AS n FROM house_stay
            WHERE house_id = $1 AND ended_at IS NOT NULL
              AND (ended_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3`,
          [houseId, p.de, p.ate]),
        ocorrencias: await um(
          `SELECT count(*)::int AS n FROM incident
            WHERE house_id = $1
              AND (happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3`,
          [houseId, p.de, p.ate]),
        marcos: await um(
          `SELECT count(*)::int AS n FROM life_milestone
            WHERE house_id = $1 AND happened_on BETWEEN $2 AND $3`, [houseId, p.de, p.ate]),
      };

      const { rows: porTipo } = await c.query(
        `SELECT kind, count(*)::int AS n FROM life_milestone
          WHERE house_id = $1 AND happened_on BETWEEN $2 AND $3
          GROUP BY kind ORDER BY kind`, [houseId, p.de, p.ate]);

      return {
        periodo: p,
        casas: [casaNoPeriodo],
        total: {
          casas: 1, acolhidos: casaNoPeriodo.acolhidos, capacidade: casaNoPeriodo.capacidade,
          entradas: casaNoPeriodo.entradas, saidas: casaNoPeriodo.saidas,
          ocorrencias: casaNoPeriodo.ocorrencias, marcos: casaNoPeriodo.marcos,
        },
        marcosPorTipo: this.TIPOS
          .map((t) => ({ ...t, n: Number(porTipo.find((x: any) => x.kind === t.cod)?.n ?? 0) }))
          .filter((t) => t.n > 0),
        aviso: 'Este é o trabalho desta unidade no período. Ele não se compara com o de '
          + 'outra: cada casa recebe um perfil diferente, por determinação judicial.',
      };
    });
  }

  // --------------------------------------------------------------- Marcos

  /**
   * A LISTA TEM TETO, e o teto é a correção de um defeito de produto.
   *
   * Ela devolvia TUDO do período: com um ano das oito casas, 1 920 linhas numa
   * resposta só, cada uma pedindo o nome do acolhido e o rótulo da casa por
   * função — quase quatro mil consultas para montar uma tela. Meio segundo de
   * espera, medido pelo `ensaio-carga`.
   *
   * E o defeito não é o meio segundo: é que **ninguém lê 1 920 linhas**. A
   * tela é para olhar o que aconteceu de bom, não para paginar um cadastro.
   * O teto é 200, e a resposta DIZ quando cortou — um total silenciosamente
   * truncado seria pior que a lentidão, porque a pessoa concluiria que aquilo
   * é tudo.
   */
  private readonly TETO_DA_LISTA = 200;

  async marcos(user: AuthenticatedUser, filtros: {
    houseId?: string; personId?: string; de?: string; ate?: string; tipo?: string;
  }) {
    const p = this.periodo(filtros.de, filtros.ate);
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT m.id, m.person_id, app_person_display_name(m.person_id) AS acolhido,
                m.house_id, app_house_label(m.house_id) AS casa,
                m.kind, m.kind_other, m.happened_on, m.description, m.institution,
                m.storage_key IS NOT NULL AS temComprovante, m.file_name,
                app_user_display_name(m.registered_by) AS por, m.registered_at
           FROM life_milestone m
          WHERE m.happened_on BETWEEN $1::date AND $2::date
            AND ($3::uuid IS NULL OR m.house_id = $3::uuid)
            AND ($4::uuid IS NULL OR m.person_id = $4::uuid)
            AND ($5::text IS NULL OR m.kind = $5::text)
          /*
           * Por DATA, e nunca por criança ou por casa com mais marcos.
           *
           * O desempate é por 'person_id', e NÃO pelo nome — que é o que a
           * primeira versão fazia. Ordenar pelo nome obriga o banco a calcular
           * 'app_person_display_name' para TODAS as linhas do período antes de
           * aplicar o teto: com um ano das oito casas, 1 920 chamadas de
           * função para devolver 200 linhas. O teto não adiantou nada
           * enquanto essa ordenação existiu — meio segundo, medido pelo
           * 'ensaio-carga'.
           *
           * E a ordem alfabética dentro do mesmo dia não significa nada para
           * quem lê: o que a pessoa procura é o que aconteceu mais recente.
           */
          ORDER BY m.happened_on DESC, m.person_id
          LIMIT $6`,
        [p.de, p.ate, filtros.houseId ?? null, filtros.personId ?? null, filtros.tipo ?? null,
         this.TETO_DA_LISTA]);

      /*
       * Quando a lista bate no teto, quem chama precisa saber. Uma lista
       * truncada em silêncio faz a pessoa concluir que aquilo é tudo o que
       * aconteceu no período — e aqui o que está sendo contado é o trabalho
       * da casa.
       */
      const cortou = rows.length === this.TETO_DA_LISTA;
      const lista = rows.map((r) => ({
        id: r.id, acolhidoId: r.person_id, acolhido: r.acolhido,
        casaId: r.house_id, casa: r.casa,
        tipo: r.kind,
        tipoRotulo: r.kind === 'outro'
          ? r.kind_other
          : (this.TIPOS.find((t) => t.cod === r.kind)?.label ?? r.kind),
        icone: this.TIPOS.find((t) => t.cod === r.kind)?.icone ?? '✨',
        quando: r.happened_on, descricao: r.description, instituicao: r.institution,
        temComprovante: r.temcomprovante, nomeDoArquivo: r.file_name,
        por: r.por, em: r.registered_at,
      }));
      if (cortou) {
        (lista as any).aviso = `Mostrando os ${this.TETO_DA_LISTA} mais recentes do período. `
          + 'Escolha um intervalo menor ou filtre por tipo para ver o resto.';
      }
      return lista;
    });
  }

  /**
   * A trajetória de uma criança — o que o Gestor pediu para poder olhar
   * "individualmente".
   *
   * Traz o que é dela e o que é bom: os marcos, o tempo de acolhimento e as
   * casas por onde passou. **Não traz** saúde, ocorrência, relato protegido
   * nem conteúdo judicial: para isso existem as telas do caso, com o alcance
   * de quem cuida dele. Uma visão de impacto que abrisse o prontuário viraria
   * outra coisa.
   */
  async trajetoria(user: AuthenticatedUser, personId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [p] } = await c.query(
        `SELECT app_person_display_name($1) AS nome,
                (SELECT min(started_at) FROM house_stay WHERE person_id = $1) AS desde,
                (SELECT count(*)::int FROM house_stay WHERE person_id = $1) AS casas`,
        [personId]);
      if (!p?.nome) {
        throw new NotFoundException('Acolhido não encontrado — ou fora do seu alcance.');
      }
      const marcos = await this.marcos(user, { personId, de: '1900-01-01' });
      const { rows: passagens } = await c.query(
        `SELECT app_house_label(house_id) AS casa, started_at, ended_at
           FROM house_stay WHERE person_id = $1 ORDER BY started_at`, [personId]);

      return {
        acolhido: p.nome,
        acolhidoDesde: p.desde,
        casasPorOndePassou: passagens.map((x: any) => ({
          casa: x.casa, de: x.started_at, ate: x.ended_at,
        })),
        marcos,
        /* Sem contagem de "quantos marcos por ano" nem comparação com outras
         * crianças: a trajetória de cada uma é a dela. */
        aviso: 'Esta é a linha do que foi conquistado. Saúde, ocorrências e conteúdo '
          + 'judicial não entram aqui — eles ficam nas telas do caso, com quem cuida dele.',
      };
    });
  }

  async registrar(user: AuthenticatedUser, input: {
    personId?: string; tipo?: string; tipoOutro?: string; quando?: string;
    descricao?: string; instituicao?: string; conteudo?: string; nomeArquivo?: string;
  }) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException(
        'Registrar um marco é da equipe técnica, da coordenação e do Gestor Geral.');
    }
    if (!this.TIPOS.some((t) => t.cod === input.tipo)) {
      throw new BadRequestException('Escolha o tipo do marco.');
    }
    if (input.tipo === 'outro' && !(input.tipoOutro ?? '').trim()) {
      throw new BadRequestException('Em "outro", escreva qual foi a conquista.');
    }
    /*
     * A descrição é obrigatória, e curta demais é recusada. "Passou de ano"
     * já está no tipo; o que interessa aqui é a frase que a criança vai
     * ouvir daqui a dez anos — em que escola, em que série, com quem.
     */
    if ((input.descricao ?? '').trim().length < 10) {
      throw new BadRequestException(
        'Escreva o que aconteceu. O tipo já diz a categoria — esta linha é a história.');
    }

    let chave: string | null = null;
    let mime: string | null = null;
    if (input.conteudo) {
      const bytes = Buffer.from(
        String(input.conteudo).replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (!bytes.length) throw new BadRequestException('O comprovante chegou vazio.');
      if (bytes.length > 10 * 1024 * 1024) {
        throw new BadRequestException('O comprovante passa de 10 MB.');
      }
      const hex = bytes.subarray(0, 8).toString('hex');
      mime = hex.startsWith('25504446') ? 'application/pdf'
        : hex.startsWith('ffd8ff') ? 'image/jpeg'
        : hex.startsWith('89504e47') ? 'image/png' : null;
      if (!mime) throw new BadRequestException('O comprovante precisa ser PDF, JPG ou PNG.');
      chave = randomUUID();
      await mkdir(this.dir, { recursive: true });
      await writeFile(join(this.dir, chave), bytes);
    }

    return this.db.asUser(user.id, async (c) => {
      try {
        const { rows: [r] } = await c.query(
          `INSERT INTO life_milestone (person_id, house_id, kind, kind_other, happened_on,
                                       description, institution, storage_key, mime,
                                       file_name, registered_by)
           VALUES ($1,
                   /* A casa em que ela estava QUANDO aconteceu, gravada agora:
                    * ela muda de casa, e o marco não muda de lugar junto. */
                   (SELECT house_id FROM house_stay
                     WHERE person_id = $1 AND status = 'ativa' LIMIT 1),
                   $2, $3, coalesce($4::date, app_hoje()), $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [input.personId, input.tipo,
           input.tipo === 'outro' ? input.tipoOutro!.trim() : null,
           input.quando ?? null, input.descricao!.trim(),
           (input.instituicao ?? '').trim() || null, chave, mime,
           input.nomeArquivo ?? null, user.id]);

        await this.audit.log({
          action: 'marco.registrado', actorId: user.id, institutionId: user.institutionId,
          entity: 'life_milestone', entityId: r.id,
          // Metadado: o tipo, nunca a descrição — que fala de uma criança.
          detail: { tipo: input.tipo },
        });
        return { id: r.id, ok: true };
      } catch (e: any) {
        if (String(e?.message ?? '').includes('row-level security')) {
          throw new ForbiddenException('Sem alcance para registrar um marco desta criança.');
        }
        throw e;
      }
    });
  }

  /**
   * O COMPROVANTE DA CONQUISTA — diploma, certificado, carteira assinada.
   *
   * Mesmo defeito do diário da internação: era guardado e nunca mais lido.
   * E aqui dói mais, porque o que está no arquivo é a prova de uma coisa boa
   * que aconteceu com a criança — e é o documento que ela vai querer ter na
   * mão quando sair do acolhimento.
   *
   * Quem alcança o marco alcança o comprovante: a mesma política, sem regra
   * própria que se desencontre com o tempo.
   */
  async lerComprovante(user: AuthenticatedUser, marcoId: string) {
    const m = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT storage_key, mime, file_name FROM life_milestone WHERE id = $1`, [marcoId]);
      return r;
    });
    if (!m) throw new NotFoundException('Marco não encontrado — ou fora do seu alcance.');
    if (!m.storage_key) throw new NotFoundException('Este marco não tem comprovante.');
    const bytes = await readFile(join(this.dir, m.storage_key)).catch(() => null);
    if (!bytes) {
      throw new NotFoundException(
        'O comprovante está registrado mas não foi encontrado no armazenamento. '
        + 'Avise quem cuida do servidor: é falha de disco ou de restauração.');
    }
    await this.audit.log({
      action: 'marco.comprovante.lido', actorId: user.id, institutionId: user.institutionId,
      entity: 'life_milestone', entityId: marcoId, detail: { tipo: m.mime },
    });
    return {
      nome: m.file_name ?? 'comprovante', tipo: m.mime, conteudo: bytes.toString('base64'),
    };
  }

  // ------------------------------------------------------- O documento

  /**
   * A folha do trabalho social. Ver não é exportar: não gera arquivo e não
   * registra saída.
   */
  async folha(user: AuthenticatedUser, de?: string, ate?: string, houseId?: string) {
    const p = houseId
      ? await this.panoramaDaCasa(user, houseId, de, ate)
      : await this.panorama(user, de, ate);
    const marcos = await this.marcos(user, { de: p.periodo.de, ate: p.periodo.ate, houseId });
    return folhaDoImpacto(
      p.periodo, p.total, p.casas,
      p.marcosPorTipo.map((t) => ({ label: t.label, n: t.n })),
      marcos.map((m) => ({
        acolhido: m.acolhido, casa: m.casa, tipoRotulo: m.tipoRotulo,
        quando: m.quando, descricao: m.descricao, instituicao: m.instituicao,
      })),
      { nome: user.fullName, cargo: cargoNoDocumento(user.role) },
      houseId ? `${p.casas[0].codigo} — ${p.casas[0].nome}` : undefined,
    );
  }

  async exportar(user: AuthenticatedUser, input: {
    de?: string; ate?: string; houseId?: string; finalidade?: string;
  }) {
    const folha = await this.folha(user, input.de, input.ate, input.houseId);
    return this.documentos.exportar(user, folha, {
      entidade: 'impacto', houseId: input.houseId ?? null,
      finalidade: input.finalidade ?? '',
    });
  }

  /**
   * A TRAJETÓRIA COMO FOLHA — a história de uma criança para levar a uma
   * audiência.
   *
   * É o documento que o Juízo mais pergunta e que o sistema não tinha: o que
   * esta criança conquistou no tempo em que esteve acolhida. Ele não substitui
   * o relatório técnico — que tem avaliação, e é de quem acompanha o caso.
   * Este aqui é a linha dos fatos bons, com data e instituição.
   */
  async folhaDaTrajetoria(user: AuthenticatedUser, personId: string) {
    const t = await this.trajetoria(user, personId);
    return folhaDaTrajetoria(t.acolhido, t.acolhidoDesde, t.casasPorOndePassou,
      t.marcos.map((m: any) => ({
        tipoRotulo: m.tipoRotulo, quando: m.quando,
        descricao: m.descricao, instituicao: m.instituicao,
      })),
      { nome: user.fullName, cargo: cargoNoDocumento(user.role) });
  }

  async exportarTrajetoria(user: AuthenticatedUser, personId: string, finalidade: string) {
    const folha = await this.folhaDaTrajetoria(user, personId);
    return this.documentos.exportar(user, folha, {
      entidade: 'trajetoria', entidadeId: personId, finalidade,
    });
  }

}
