import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { ArquivosService, RegraDoArquivo } from '../../kernel/arquivos/arquivos.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import {
  CATEGORIAS_DOSSIE, DOSSIE_EXIGIDO, TAMANHO_MAXIMO, TIPOS_DE_ARQUIVO,
  TIPOS_DE_VIVENCIA, tituloProibido,
} from './dossie-exigido';

/**
 * O DOSSIÊ DO ACOLHIDO (§6.1) e o ÁLBUM DE VIVÊNCIAS (§6.9).
 *
 * `document`, `document_version` e `memory_record` existiam desde a fase 0 e
 * nunca tiveram porta: o perfil listava documentos e não abria nenhum, e não
 * havia como pôr um lá dentro. A casa continuava com a pasta de papel.
 *
 * Quatro decisões que estão no código e não na tela, porque a tela não é o
 * lugar de nenhuma delas:
 *
 *  * **o tipo do arquivo é conferido pela ASSINATURA, não pela extensão.**
 *    Renomear `.exe` para `.pdf` é o truque mais velho que existe, e um sistema
 *    que guarda documento de criança não pode cair nele;
 *  * **o título é barrado quando parece CPF, diagnóstico ou teor judicial**
 *    (regra 3). Nome de arquivo aparece em lista, em busca e em pasta
 *    compartilhada — é o lugar onde o sigilo vaza sem ninguém decidir nada;
 *  * **anexar não é conferir.** O arquivo entra sem aceite; o aceite é um ato
 *    separado, de quem OLHOU a prévia, e fica com nome e horário. Um RG borrado
 *    ou a página errada do laudo é o erro que só o olho pega;
 *  * **abrir um documento gera registro na mesma transação** (§20), como já
 *    fazia `openDocument`. Quem abriu o quê, e quando.
 *
 * SOBRE AS FOTOS DAS VIVÊNCIAS: a Fundação decidiu, em 01/09/2026, NÃO bloquear
 * a foto por falta de autorização de imagem. O campo `photo_authorized`
 * continua, e a tela MOSTRA quando ela não está registrada — não impede, avisa.
 * Ausência é informação, e ninguém é pego de surpresa quando alguém perguntar.
 */
/**
 * O DOCUMENTO DO DOSSIÊ — o mais largo dos seis lugares, e com razão: aqui
 * cabe uma certidão digitalizada de dez páginas. 15 MB, imagem ou PDF.
 *
 * A frase da recusa é a que dois testes cobram desde a fase 82 — *"a
 * conferência é pela assinatura do arquivo, não pela extensão do nome"* —, e
 * ela continua palavra por palavra: é o que a técnica lê quando um `.exe`
 * renomeado para `.pdf` é recusado.
 */
const O_DOCUMENTO: RegraDoArquivo = {
  aceita: [...TIPOS_DE_ARQUIVO.map((t) => t.tipo), 'image/heic'],
  maximo: TAMANHO_MAXIMO,
  recusas: {
    vazio: 'O arquivo chegou vazio.',
    grande: `O arquivo passa de ${Math.round(TAMANHO_MAXIMO / 1024 / 1024)} MB. Digitalize em `
      + 'qualidade menor — a foto do celular costuma resolver.',
    tipo: 'Este arquivo não é imagem nem PDF. O dossiê guarda documento digitalizado — e a '
      + 'conferência é pela assinatura do arquivo, não pela extensão do nome.',
  },
};

/**
 * A FOTO DA VIVÊNCIA — o mesmo tamanho, sem PDF.
 *
 * Era uma conferência a mais depois do tipo (`!tipo.startsWith('image/')`);
 * virou a lista, que é a mesma coisa dita onde se lê (fase 114).
 */
/**
 * QUANTAS FOTOS POR ENVIO (fase 124).
 *
 * Não é limite do álbum — ele nunca teve um. É o tamanho de um envio que cabe
 * numa conexão de casa: doze fotos de celular já passam de trinta megabytes,
 * e quem aperta "guardar" com vinte no meio de um plantão fica olhando uma
 * barra que não anda e desiste. A recusa diz isso, e diz o que fazer.
 */
const MAXIMO_DE_FOTOS = 12;

const A_FOTO_DA_VIVENCIA: RegraDoArquivo = {
  aceita: TIPOS_DE_ARQUIVO.filter((t) => t.tipo.startsWith('image/'))
    .map((t) => t.tipo).concat('image/heic'),
  maximo: TAMANHO_MAXIMO,
  recusas: {
    vazio: 'O arquivo chegou vazio.',
    grande: `O arquivo passa de ${Math.round(TAMANHO_MAXIMO / 1024 / 1024)} MB. Digitalize em `
      + 'qualidade menor — a foto do celular costuma resolver.',
    tipo: 'A vivência recebe FOTO. Documento vai para o dossiê.',
  },
};

@Injectable()
export class DossieService {
  /** Onde os objetos moram. Fora do repositório, e configurável. */
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ArquivosService) private readonly arquivos: ArquivosService,
  ) {}

  /** O vocabulário: a lista exigida, as categorias e os tipos de vivência. */
  catalogo() {
    return {
      categorias: CATEGORIAS_DOSSIE,
      itens: DOSSIE_EXIGIDO,
      tiposDeVivencia: TIPOS_DE_VIVENCIA,
      tamanhoMaximo: TAMANHO_MAXIMO,
      aceitos: TIPOS_DE_ARQUIVO.map((t) => t.rotulo),
      aviso: 'O arquivo é conferido pela assinatura dele, não pela extensão. E o título nunca '
        + 'leva CPF, diagnóstico nem teor de decisão judicial: nome de arquivo aparece em '
        + 'lista, em busca e em pasta compartilhada.',
    };
  }

  /**
   * O dossiê de uma criança: o que existe, o que falta e o que ainda não foi
   * conferido. O RLS filtra a categoria judicial antes de qualquer conta — quem
   * não a alcança recebe a lista sem ela, e não uma lista com buracos mudos.
   */
  async dossie(user: AuthenticatedUser, personId: string) {
    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT d.id, d.category, d.title, d.checklist_key, d.issued_on, d.valid_until,
                d.source, d.created_at, d.accepted_at, d.accepted_note,
                app_user_display_name(d.created_by) AS anexado_por,
                app_user_display_name(d.accepted_by) AS aceito_por,
                v.version, v.storage_key, v.sha256, v.mime, v.file_name, v.size_bytes
           FROM document d
           LEFT JOIN LATERAL (
             SELECT version, storage_key, sha256, mime, file_name, size_bytes
               FROM document_version WHERE document_id = d.id
              ORDER BY version DESC LIMIT 1) v ON true
          WHERE d.person_id = $1
          ORDER BY d.created_at DESC`, [personId]);
      return rows;
    });

    const documentos = linhas.map((d: any) => ({
      id: d.id, categoria: d.category, titulo: d.title, chave: d.checklist_key,
      emitidoEm: d.issued_on, validoAte: d.valid_until, origem: d.source,
      anexadoEm: d.created_at, anexadoPor: d.anexado_por,
      aceitoEm: d.accepted_at, aceitoPor: d.aceito_por, notaDoAceite: d.accepted_note,
      versao: d.version,
      arquivo: d.storage_key
        ? { nome: d.file_name, tipo: d.mime, tamanho: d.size_bytes, sha256: d.sha256 }
        : null,
    }));

    // As categorias que ESTE cargo alcança — a judicial some para quem não a
    // alcança, em vez de aparecer vazia e parecer que a casa não tem nada.
    const alcanca = new Set(documentos.map((d: any) => d.categoria));
    const podeJudicial = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT app_can_open_doc('judicial_socioassistencial'::doc_category) AS ok`);
      return r.ok as boolean;
    });

    const categorias = CATEGORIAS_DOSSIE
      .filter((cat) => !cat.restrita || podeJudicial || alcanca.has(cat.code))
      .map((cat) => {
        const itens = DOSSIE_EXIGIDO.filter((i) => i.categoria === cat.code).map((i) => {
          const dele = documentos.filter((d: any) => d.chave === i.chave);
          const aceito = dele.find((d: any) => d.aceitoEm);
          return {
            ...i,
            documentos: dele,
            situacao: aceito ? 'aceito' : dele.length ? 'aguardando_conferencia' : 'falta',
          };
        });
        return {
          ...cat,
          itens,
          obrigatoriosQueFaltam: itens
            .filter((i) => i.obrigatorio && i.situacao === 'falta').map((i) => i.label),
          aguardandoConferencia: itens.filter((i) => i.situacao === 'aguardando_conferencia').length,
        };
      });

    return {
      categorias,
      /** Avulsos: entraram na pasta sem preencher vaga do checklist. */
      avulsos: documentos.filter((d: any) => !d.chave),
      vence: documentos
        .filter((d: any) => d.validoAte)
        .sort((a: any, b: any) => String(a.validoAte).localeCompare(String(b.validoAte)))
        .slice(0, 5),
      aviso: 'Anexar não é conferir. O arquivo entra, e o aceite é de quem OLHOU e disse que é '
        + 'aquele documento e que está legível — com o nome dessa pessoa e o horário.',
    };
  }

  /**
   * Anexa um arquivo a uma vaga do dossiê. Nasce SEM aceite, de propósito.
   *
   * `conteudo` chega em base64 (o corpo é JSON, e o protótipo manda o mesmo):
   * a assinatura é conferida nos primeiros bytes, e o sha256 é calculado antes
   * de gravar — é ele que prova depois que o arquivo aberto é o aceito.
   */
  async anexar(user: AuthenticatedUser, personId: string, input: {
    chave?: string; categoria: string; titulo: string; conteudo: string; nomeArquivo: string;
    emitidoEm?: string; validoAte?: string; origem?: string;
  }) {
    const proibido = tituloProibido(input.titulo);
    if (proibido) throw new BadRequestException(proibido);
    const noNome = tituloProibido(input.nomeArquivo ?? 'arquivo');
    if (noNome) {
      throw new BadRequestException(`O NOME DO ARQUIVO tem o mesmo problema: ${noNome}`);
    }
    if (input.chave && !DOSSIE_EXIGIDO.some((i) => i.chave === input.chave)) {
      throw new BadRequestException('Este item não faz parte do dossiê exigido.');
    }
    if (!CATEGORIAS_DOSSIE.some((c) => c.code === input.categoria)) {
      throw new BadRequestException('Categoria de documento inválida.');
    }

    const guardado = await this.arquivos.guardar(input.conteudo, O_DOCUMENTO);
    if (!guardado) throw new BadRequestException('Nenhum arquivo foi enviado.');
    const { chave: chaveObjeto, mime, rotulo, sha256: sha, tamanho } = guardado;

    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [d] } = await c.query(
        `INSERT INTO document (person_id, category, title, checklist_key,
           issued_on, valid_until, source, created_by)
         VALUES ($1,$2::doc_category,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [personId, input.categoria, input.titulo.trim(), input.chave ?? null,
         input.emitidoEm ?? null, input.validoAte ?? null, input.origem ?? null, user.id]);
      await c.query(
        `INSERT INTO document_version (document_id, version, storage_key, sha256,
           mime, file_name, size_bytes, created_by)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
        [d.id, chaveObjeto, sha, mime, input.nomeArquivo, tamanho, user.id]);
      return d.id as string;
    });

    await this.audit.log({
      action: 'document.attach', actorId: user.id,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'document', entityId: id,
      detail: { categoria: input.categoria, chave: input.chave ?? null, tipo: mime,
                bytes: tamanho },
    });

    return {
      id, tipo: rotulo, sha256: sha, tamanho,
      aviso: 'Arquivo guardado — e ainda NÃO conferido. Abra a prévia e confirme que é este '
        + 'documento e que está legível; o aceite fica com o seu nome e o horário.',
    };
  }

  /** O ACEITE: de quem olhou. O gatilho do banco recusa aceitar por outro. */
  async aceitar(user: AuthenticatedUser, personId: string, documentId: string, nota?: string) {
    const ok = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE document SET accepted_at = now(), accepted_by = $3, accepted_note = $4
          WHERE id = $1 AND person_id = $2 AND accepted_at IS NULL`,
        [documentId, personId, user.id, nota ?? null]);
      return (rowCount ?? 0) > 0;
    }).catch((e: any) => {
      if (String(e?.message ?? '').includes('aceite_e_pessoal')) {
        throw new ForbiddenException('O aceite é de quem conferiu. Ninguém aceita por outro.');
      }
      throw e;
    });
    if (!ok) {
      throw new BadRequestException(
        'Este documento não existe nesta criança, ou já foi conferido. Se o arquivo estiver '
        + 'errado, anexe a versão certa — o que foi aceito antes continua registrado.');
    }
    await this.audit.log({
      action: 'document.accept', actorId: user.id,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'document', entityId: documentId,
      detail: { comNota: !!nota },
    });
    return { ok: true, aviso: 'Conferido, com o seu nome e o horário.' };
  }

  /**
   * Os bytes de um documento, para a prévia. Cada abertura vira registro na
   * mesma transação (§20) — e o sha256 é conferido: um objeto trocado por
   * baixo não passa como se fosse o que foi aceito.
   */
  /**
   * O documento do dossiê, aberto — ou BAIXADO (fase 124).
   *
   * *"Poder visualizar a hora que eles quiserem e baixar."* Sair com o arquivo
   * é outro ato, e é o que alguém vai querer rastrear no dia em que uma
   * certidão aparecer onde não devia. Por isso o download passa por uma rota
   * própria em vez de salvar no navegador os bytes que a prévia já tem: duas
   * ações distintas, dois nomes distintos na auditoria.
   *
   * A CONFERÊNCIA DO SHA VALE PARA AS DUAS. Um arquivo trocado por baixo não
   * sai do sistema nem para a tela, nem para o disco de ninguém.
   */
  async arquivo(user: AuthenticatedUser, personId: string, documentId: string,
                baixando = false) {
    /* A casa vem ANTES da transação: o registro da abertura nasce dentro dela
       (§20 — quem viu não se separa do ato de ver), e a consulta da casa é de
       outra conexão. */
    const casa = await this.audit.casaDoAcolhido(user.id, personId);
    const v = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT d.category, d.title, v.storage_key, v.sha256, v.mime, v.file_name
           FROM document d
           JOIN document_version v ON v.document_id = d.id
          WHERE d.id = $1 AND d.person_id = $2
          ORDER BY v.version DESC LIMIT 1`, [documentId, personId]);
      if (row) {
        await this.audit.log({
          action: baixando ? 'document.download' : 'document.open',
          actorId: user.id, houseId: casa, entity: 'document', entityId: documentId,
          detail: { categoria: row.category },
        }, c);
      }
      return row;
    });
    // Categoria fora do alcance: o RLS já filtrou, e a resposta é idêntica à
    // de um documento que não existe. Dizer 403 já contaria que ele existe.
    if (!v) throw new NotFoundException('Documento não encontrado.');

    const bytes = await this.arquivos.ler(v.storage_key);
    if (!bytes) {
      throw new NotFoundException(
        'O arquivo não está no armazenamento. O registro do documento continua — o que sumiu '
        + 'foi o objeto, e isso precisa ser dito, não escondido.');
    }
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== v.sha256) {
      throw new BadRequestException(
        'O arquivo guardado não confere com o que foi aceito. Ele não vai ser aberto: um '
        + 'documento trocado por baixo é pior do que um documento que falta.');
    }
    return { nome: v.file_name, tipo: v.mime, conteudo: bytes.toString('base64') };
  }

  // ------------------------------------------------------------------
  // O álbum de vivências (§6.9)
  // ------------------------------------------------------------------

  async vivencias(user: AuthenticatedUser, personId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows: r } = await c.query(
        `SELECT m.id, m.event_type, m.happened_on, m.description,
                m.created_at, app_user_display_name(m.created_by) AS por
           FROM memory_record m WHERE m.person_id = $1
          ORDER BY m.happened_on DESC, m.created_at DESC`, [personId]);
      /* AS FOTOS, numa consulta só (fase 124). A alternativa era a tela pedir
         uma chamada por vivência, e um álbum de quarenta vivências faria
         quarenta e uma. `memory_photo` já é filtrada pela RLS da criança. */
      const { rows: fotos } = await c.query(
        `SELECT p.id, p.memory_id, p.mime, p.file_name, p.photo_authorized, p.position
           FROM memory_photo p WHERE p.person_id = $1
          ORDER BY p.memory_id, p.position, p.created_at`, [personId]);
      return { r, fotos };
    });
    const itens = rows.r.map((m: any) => {
      const dela = rows.fotos.filter((f: any) => f.memory_id === m.id);
      return {
        id: m.id, tipo: m.event_type, quando: m.happened_on, descricao: m.description,
        /* Derivado das fotos que EXISTEM, e não de `has_photo`: um contador
           gravado precisa de gatilho para ficar em dia, e um contador errado é
           pior do que contador nenhum — a tela diria "3 fotos" e abriria duas. */
        temFoto: dela.length > 0,
        /* A vivência está autorizada quando TODAS as fotos dela estão. A
           autorização é por foto: a festa pode ter uma com uma criança de
           outra casa, e a autorização dela é outra conversa. */
        autorizacaoRegistrada: dela.length > 0 && dela.every((f: any) => f.photo_authorized),
        fotos: dela.map((f: any) => ({
          id: f.id, nome: f.file_name, tipo: f.mime,
          autorizacaoRegistrada: f.photo_authorized === true,
        })),
        /* Mantido para quem já lia `arquivo`: é a primeira foto. */
        arquivo: dela.length ? { nome: dela[0].file_name, tipo: dela[0].mime } : null,
        registradoPor: m.por, registradoEm: m.created_at,
      };
    });
    const semAutorizacao = itens
      .reduce((n, i) => n + i.fotos.filter((f: any) => !f.autorizacaoRegistrada).length, 0);
    return {
      itens, tipos: TIPOS_DE_VIVENCIA, semAutorizacao,
      aviso: 'Este álbum é da criança. É o que ela leva quando sai, e costuma ser a única '
        + 'coisa do acolhimento que ela vai querer rever.',
      avisoDaAutorizacao: semAutorizacao > 0
        ? `${semAutorizacao} ${semAutorizacao === 1 ? 'foto está' : 'fotos estão'} sem a `
          + 'autorização de uso de imagem registrada. O sistema não impede — mas registra que '
          + 'não está, para ninguém ser pego de surpresa quando alguém perguntar.'
        : '',
    };
  }

  /**
   * Registrar uma vivência — com QUANTAS FOTOS forem (fase 124).
   *
   * *"Eles querem também ter foto das crianças no perfil […] podendo
   * previamente visualizar o que está sendo hospedado e confirmar."*
   *
   * O álbum já aceitava fotos sem limite; o que faltava era mais de uma DA
   * MESMA vivência. A educadora que voltava da festa com seis fotos registrava
   * seis vivências — seis vezes a mesma data, seis vezes a mesma descrição, e
   * o álbum da criança contando a festa seis vezes.
   *
   * `conteudo` e `nomeArquivo` continuam aceitos, e por isso o corpo antigo
   * não quebra: é o caminho de quem manda uma só.
   */
  async registrarVivencia(user: AuthenticatedUser, personId: string, input: {
    tipo: string; quando: string; descricao: string;
    conteudo?: string; nomeArquivo?: string; autorizacaoRegistrada?: boolean;
    fotos?: { conteudo: string; nomeArquivo?: string; autorizacaoRegistrada?: boolean }[];
  }) {
    if (!TIPOS_DE_VIVENCIA.some((t) => t.code === input.tipo)) {
      throw new BadRequestException('Tipo de vivência inválido.');
    }
    if ((input.descricao ?? '').trim().length < 5) {
      throw new BadRequestException(
        'Escreva o que aconteceu. A foto sozinha, daqui a dez anos, não diz de que dia foi.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.quando ?? '')) {
      throw new BadRequestException('Informe a data da vivência.');
    }

    /* Uma lista só, venha ela do campo antigo ou do novo. Duas maneiras de
       receber a mesma coisa é como as duas divergem depois. */
    const pedidas = [
      ...(input.conteudo
        ? [{ conteudo: input.conteudo, nomeArquivo: input.nomeArquivo,
             autorizacaoRegistrada: input.autorizacaoRegistrada }]
        : []),
      ...(input.fotos ?? []),
    ];
    if (pedidas.length > MAXIMO_DE_FOTOS) {
      throw new BadRequestException(
        `Envie até ${MAXIMO_DE_FOTOS} fotos por vez. Não é limite do álbum — é o tamanho de `
        + 'um envio que cabe numa conexão de casa; registre outra vivência, ou mande em duas '
        + 'levas.');
    }

    const guardadas: { chave: string; mime: string | null; sha: string | null;
                       nome: string | null; autorizada: boolean }[] = [];
    for (const f of pedidas) {
      const nome = f.nomeArquivo ?? 'foto';
      const proibido = tituloProibido(nome);
      if (proibido) throw new BadRequestException(`O nome do arquivo: ${proibido}`);
      const foto = await this.arquivos.guardar(f.conteudo, A_FOTO_DA_VIVENCIA);
      if (!foto) throw new BadRequestException('Nenhum arquivo foi enviado.');
      guardadas.push({
        chave: foto.chave, mime: foto.mime, sha: foto.sha256,
        nome: f.nomeArquivo ?? null,
        /* POR FOTO. A festa pode ter uma com uma criança de outra casa. */
        autorizada: f.autorizacaoRegistrada === true,
      });
    }

    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [m] } = await c.query(
        `INSERT INTO memory_record (person_id, event_type, happened_on, description,
           has_photo, photo_authorized, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [personId, input.tipo, input.quando, input.descricao.trim(),
         guardadas.length > 0,
         guardadas.length > 0 && guardadas.every((g) => g.autorizada), user.id]);
      /* As colunas de arquivo de `memory_record` NÃO são mais escritas: a foto
         vive em `memory_photo` desde a 1320, e guardar o mesmo fato em dois
         lugares é como duas versões da verdade começam. */
      let posicao = 0;
      for (const g of guardadas) {
        posicao += 1;
        await c.query(
          `INSERT INTO memory_photo (memory_id, person_id, storage_key, mime, sha256,
             file_name, photo_authorized, position, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [m.id, personId, g.chave, g.mime, g.sha, g.nome, g.autorizada, posicao, user.id]);
      }
      return m.id as string;
    });
    const chave = guardadas.length ? guardadas[0].chave : null;

    await this.audit.log({
      action: 'memory.record', actorId: user.id,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'memory_record', entityId: id,
      detail: { tipo: input.tipo, comFoto: chave != null, fotos: guardadas.length,
                autorizacaoRegistrada: guardadas.every((g) => g.autorizada) },
    });

    return {
      id,
      fotos: guardadas.length,
      aviso: chave && !guardadas.every((g) => g.autorizada)
        ? 'Vivência registrada. A autorização de uso de imagem NÃO está registrada nesta foto — '
          + 'fica anotado assim, e o álbum mostra.'
        : 'Vivência registrada no álbum da criança.',
    };
  }

  /**
   * UMA foto de uma vivência (fase 124).
   *
   * `fotoId` é opcional por compatibilidade: sem ele, a primeira. A vivência
   * passou a ter quantas fotos tiver — uma festa com seis fotos era, antes,
   * seis vivências com a mesma data e a mesma descrição.
   */
  async foto(user: AuthenticatedUser, personId: string, memoryId: string, fotoId?: string) {
    const casa = await this.audit.casaDoAcolhido(user.id, personId);
    const m = await this.db.asUser(user.id, async (c) => {
      /* rls-join-ok: `mp_select` já filtra `memory_photo` pelo alcance da
         criança; o `person_id` no WHERE é conferência da rota, não da RLS. */
      const { rows: [row] } = await c.query(
        `SELECT p.id, p.storage_key, p.mime, p.file_name, p.sha256
           FROM memory_photo p
          WHERE p.memory_id = $1 AND p.person_id = $2
            AND ($3::uuid IS NULL OR p.id = $3)
          ORDER BY p.position, p.created_at LIMIT 1`,
        [memoryId, personId, fotoId ?? null]);
      if (row) {
        /* A abertura é da FOTO, e a entidade continua sendo a vivência: quem
           procura "quem abriu o álbum da Alice" procura por `memory_record`,
           e um segundo nome de entidade esconderia metade das aberturas. */
        await this.audit.log({
          action: 'memory.open', actorId: user.id, houseId: casa,
          entity: 'memory_record', entityId: memoryId, detail: { fotoId: row.id },
        }, c);
      }
      return row;
    });
    if (!m?.storage_key) throw new NotFoundException('Esta vivência não tem foto.');
    const bytes = await this.arquivos.ler(m.storage_key);
    if (!bytes) throw new NotFoundException('A foto não está no armazenamento.');
    return { nome: m.file_name, tipo: m.mime, conteudo: bytes.toString('base64') };
  }

  // ------------------------------------------------------------------

}
