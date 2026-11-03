import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { join } from 'node:path';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { ArquivosService, RegraDoArquivo } from '../../kernel/arquivos/arquivos.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { cargoNoDocumento } from '../../kernel/documentos/folha';
import { folhaDoImpacto, folhaDaTrajetoria } from './impacto-folha';
import {
  DadosDaTransicao, DadosDoLivro, QUEM_PREPARA_A_SAIDA, ROTULO_DA_VIVENCIA,
  folhaDeTransicao, folhaDoLivroDaVida,
} from './saida-folha';

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
/**
 * O COMPROVANTE DO MARCO DE VIDA — 10 MB, PDF, JPG ou PNG.
 *
 * O diploma, a carteira de trabalho, a foto da formatura: é o que a casa
 * fotografa com o celular ou digitaliza na hora. A regra é a da nota de
 * internação, e ficou igual por coincidência — as duas nasceram da mesma
 * cópia. A fase 114 deixou as duas explícitas, cada uma ao lado do seu método,
 * para que a próxima mudança seja uma decisão e não um efeito.
 */
const O_COMPROVANTE: RegraDoArquivo = {
  aceita: ['application/pdf', 'image/jpeg', 'image/png'],
  maximo: 10 * 1024 * 1024,
  recusas: {
    vazio: 'O comprovante chegou vazio.',
    grande: 'O comprovante passa de 10 MB.',
    tipo: 'O comprovante precisa ser PDF, JPG ou PNG.',
  },
};

@Injectable()
export class ImpactoService {

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ArquivosService) private readonly arquivos: ArquivosService,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
  ) {}

  /**
   * As categorias. Escritas na voz de quem conta a história — "passou de ano",
   * e não "aprovação escolar computada".
   */
  private readonly TIPOS = [
    { cod: 'aprovacao_escolar', label: 'Passou de ano', icone: 'livros' },
    { cod: 'conclusao_ensino_fundamental', label: 'Terminou o Fundamental', icone: 'formatura' },
    { cod: 'conclusao_ensino_medio', label: 'Terminou o Ensino Médio', icone: 'formatura' },
    { cod: 'curso_profissionalizante', label: 'Curso profissionalizante', icone: 'ferramenta' },
    { cod: 'certificado', label: 'Certificado', icone: 'certificado' },
    { cod: 'ingresso_faculdade', label: 'Entrou na faculdade', icone: 'instituicao' },
    { cod: 'primeiro_emprego', label: 'Primeiro emprego', icone: 'maleta' },
    { cod: 'estagio', label: 'Estágio', icone: 'maleta' },
    { cod: 'documento_conquistado', label: 'Documento conquistado', icone: 'identidade' },
    { cod: 'esporte_ou_arte', label: 'Esporte, arte ou cultura', icone: 'bola' },
    { cod: 'reinsercao_familiar', label: 'Reinserção familiar', icone: 'casas' },
    { cod: 'outro', label: 'Outro', icone: 'conquista' },
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
        throw new NotFoundException('Unidade não encontrada, ou fora do seu alcance.');
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
        icone: this.TIPOS.find((t) => t.cod === r.kind)?.icone ?? 'conquista',
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
        throw new NotFoundException('Acolhido não encontrado, ou fora do seu alcance.');
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
        'Escreva o que aconteceu. O tipo já diz a categoria. Esta linha é a história.');
    }

    const guardado = await this.arquivos.guardar(input.conteudo, O_COMPROVANTE);
    const chave = guardado?.chave ?? null;
    const mime = guardado?.mime ?? null;

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
           RETURNING id, house_id`,
          [input.personId, input.tipo,
           input.tipo === 'outro' ? input.tipoOutro!.trim() : null,
           input.quando ?? null, input.descricao!.trim(),
           (input.instituicao ?? '').trim() || null, chave, mime,
           input.nomeArquivo ?? null, user.id]);

        await this.audit.log({
          action: 'marco.registrado', actorId: user.id, institutionId: user.institutionId,
          /* A casa vem do `RETURNING`, e não de outra consulta: a linha ainda
             não foi confirmada, e outra conexão não a veria. É a casa GRAVADA no
             marco — ela muda de casa, e o marco não muda de lugar junto. */
          houseId: (r.house_id as string | null) ?? null,
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
        `SELECT storage_key, mime, file_name, house_id FROM life_milestone WHERE id = $1`, [marcoId]);
      return r;
    });
    if (!m) throw new NotFoundException('Marco não encontrado, ou fora do seu alcance.');
    if (!m.storage_key) throw new NotFoundException('Este marco não tem comprovante.');
    const bytes = await this.arquivos.ler(m.storage_key);
    if (!bytes) {
      throw new NotFoundException(
        'O comprovante está registrado mas não foi encontrado no armazenamento. '
        + 'Avise quem cuida do servidor: é falha de disco ou de restauração.');
    }
    await this.audit.log({
      action: 'marco.comprovante.lido', actorId: user.id, institutionId: user.institutionId,
      houseId: (m.house_id as string | null) ?? null,
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
      houseId ? `${p.casas[0].codigo} · ${p.casas[0].nome}` : undefined,
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
    /* A casa da criança, pela mesma razão da ficha de saúde (fase 154). */
    return this.documentos.exportar(user, folha, {
      entidade: 'trajetoria', entidadeId: personId, finalidade,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
    });
  }


  // ------------------------------------------------------------------
  // A saída com a história (fase 270): a folha de transição e o livro da vida
  // ------------------------------------------------------------------

  private quemPreparaASaida(user: AuthenticatedUser) {
    if (!QUEM_PREPARA_A_SAIDA.includes(user.role)) {
      throw new ForbiddenException(
        'A folha de transição e o livro da vida são preparados pela equipe técnica e pela coordenação.');
    }
  }

  /** A criança, a casa e o dia do ingresso no acolhimento de agora, lidos com a identidade de quem pede. */
  private async criancaDaSaida(c: any, personId: string) {
    const { rows: [p] } = await c.query(
      `SELECT app_person_display_name($1) AS nome, p.birth_date::text AS nascimento,
              (SELECT app_house_label(s.house_id) FROM house_stay s
                WHERE s.person_id = $1 AND s.status = 'ativa' LIMIT 1) AS casa,
              /* O ingresso da ficha de entrada, como no prazo da reavaliação (fase 269). */
              (SELECT out_desde::text FROM app_reavaliacao_base($1)) AS desde
         FROM person p WHERE p.id = $1`, [personId]);
    if (!p?.nome) throw new NotFoundException('Acolhido não encontrado, ou fora do seu alcance.');
    return { nome: p.nome, nascimento: p.nascimento ?? null, casa: p.casa ?? '', desde: p.desde ?? null };
  }

  /**
   * O que quem recebe a criança precisa para cuidar dela. Os documentos são os do
   * dossiê fora da área restrita (pessoais, saúde, escola, convivência), o último
   * de cada tipo; o que é judicial segue pelo Juízo.
   */
  async dadosDaTransicao(user: AuthenticatedUser, personId: string): Promise<DadosDaTransicao> {
    this.quemPreparaASaida(user);
    return this.db.asUser(user.id, async (c) => {
      const crianca = await this.criancaDaSaida(c, personId);
      const { rows: [perfil] } = await c.query(
        `SELECT essential_care, school_name, school_grade, school_shift
           FROM profile_detail WHERE person_id = $1`, [personId]);
      const { rows: saude } = await c.query(
        `SELECT kind, description, severity FROM health_condition
          WHERE person_id = $1 AND active ORDER BY (kind = 'alergia') DESC, created_at`, [personId]);
      const { rows: alimentacao } = await c.query(
        `SELECT restriction, substitution, guidance FROM food_restriction
          WHERE person_id = $1 AND active ORDER BY created_at`, [personId]);
      const { rows: remedios } = await c.query(
        `SELECT pr.id, pr.medication, pr.dose, pr.route, pr.instructions, pr.ends_on::text AS ate,
                coalesce((SELECT array_agg(to_char(ms.time_of_day, 'HH24:MI') ORDER BY ms.time_of_day)
                            FROM medication_schedule ms WHERE ms.prescription_id = pr.id), '{}') AS horarios
           FROM prescription pr
          WHERE pr.person_id = $1 AND pr.status = 'ativa'
            AND (pr.ends_on IS NULL OR pr.ends_on >= app_hoje())
          ORDER BY pr.medication`, [personId]);
      const { rows: documentos } = await c.query(
        `SELECT DISTINCT ON (coalesce(d.checklist_key, d.id::text)) d.title,
                coalesce(d.issued_on, (d.created_at AT TIME ZONE app_fuso())::date)::text AS data
           FROM document d
          WHERE d.person_id = $1 AND d.category <> 'judicial_socioassistencial'
          ORDER BY coalesce(d.checklist_key, d.id::text), d.created_at DESC`, [personId]);
      return {
        crianca,
        cuidados: perfil?.essential_care ?? null,
        saude: saude.map((s: any) => ({ tipo: s.kind, descricao: s.description, gravidade: s.severity ?? null })),
        alimentacao: alimentacao.map((a: any) => ({
          restricao: a.restriction, substituicao: a.substitution ?? null, orientacao: a.guidance ?? null })),
        remedios: remedios.map((r: any) => ({
          nome: r.medication, dose: r.dose, via: r.route, horarios: r.horarios ?? [],
          orientacao: r.instructions ?? null, ate: r.ate ?? null })),
        escola: perfil?.school_name
          ? { nome: perfil.school_name, serie: perfil.school_grade ?? null, turno: perfil.school_shift ?? null }
          : null,
        documentos: documentos
          .map((x: any) => ({ titulo: x.title, data: x.data ?? null }))
          .sort((a: any, b: any) => a.titulo.localeCompare(b.titulo)),
      };
    });
  }

  async folhaDaTransicao(user: AuthenticatedUser, personId: string) {
    return folhaDeTransicao(await this.dadosDaTransicao(user, personId),
      { nome: user.fullName, cargo: cargoNoDocumento(user.role) });
  }

  async exportarTransicao(user: AuthenticatedUser, personId: string, finalidade: string) {
    const folha = await this.folhaDaTransicao(user, personId);
    return this.documentos.exportar(user, folha, {
      entidade: 'transicao', entidadeId: personId, finalidade,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
    });
  }

  /**
   * As conquistas e as vivências da criança, para o livro da vida. Os bytes só
   * das fotografias com autorização de imagem, e só para gerar o arquivo.
   */
  async dadosDoLivro(user: AuthenticatedUser, personId: string, comBytes: boolean): Promise<DadosDoLivro> {
    this.quemPreparaASaida(user);
    const lido = await this.db.asUser(user.id, async (c) => {
      const crianca = await this.criancaDaSaida(c, personId);
      const { rows: itens } = await c.query(
        `SELECT m.id, m.event_type, m.happened_on::text AS quando, m.description
           FROM memory_record m WHERE m.person_id = $1`, [personId]);
      const { rows: fotos } = await c.query(
        `SELECT memory_id, storage_key, mime, photo_authorized
           FROM memory_photo WHERE person_id = $1 ORDER BY memory_id, position, created_at`, [personId]);
      return { crianca, itens, fotos };
    });
    const marcos = await this.marcos(user, { personId, de: '1900-01-01' });
    const vivencias = [];
    for (const m of lido.itens) {
      const fotos = [];
      for (const f of lido.fotos.filter((x: any) => x.memory_id === m.id)) {
        const autorizada = f.photo_authorized === true;
        let foto = null;
        if (comBytes && autorizada && (f.mime === 'image/jpeg' || f.mime === 'image/png')) {
          const bytes = await this.arquivos.ler(f.storage_key);
          if (bytes) foto = { tipo: f.mime, dados: new Uint8Array(bytes) };
        }
        fotos.push({ autorizada, foto });
      }
      vivencias.push({ tipo: ROTULO_DA_VIVENCIA[m.event_type] ?? m.event_type,
                       quando: String(m.quando).slice(0, 10), descricao: m.description, fotos });
    }
    return {
      crianca: { nome: lido.crianca.nome, casa: lido.crianca.casa, desde: lido.crianca.desde },
      marcos: marcos.map((m: any) => ({
        tipo: m.tipoRotulo ?? 'Conquista', quando: String(m.quando).slice(0, 10),
        descricao: m.descricao, instituicao: m.instituicao ?? null })),
      vivencias,
    };
  }

  async folhaDoLivro(user: AuthenticatedUser, personId: string) {
    return folhaDoLivroDaVida(await this.dadosDoLivro(user, personId, false),
      { nome: user.fullName, cargo: cargoNoDocumento(user.role) });
  }

  async exportarLivro(user: AuthenticatedUser, personId: string, finalidade: string) {
    const folha = folhaDoLivroDaVida(await this.dadosDoLivro(user, personId, true),
      { nome: user.fullName, cargo: cargoNoDocumento(user.role) });
    return this.documentos.exportar(user, folha, {
      entidade: 'livro_da_vida', entidadeId: personId, finalidade,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
    });
  }
}
